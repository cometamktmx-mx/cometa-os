// Empty application bootstrap in disposable local PostgreSQL. No remote credentials.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'cometa_bootstrap_' + Date.now();
const api = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, method, path, headers: body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json' } : {} }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => {
      const b = Buffer.concat(chunks); if (res.statusCode >= 300) reject(new Error(b.toString())); else resolve(b);
    });
  }); req.on('error', reject); req.setTimeout(120000, () => req.destroy(new Error('Docker timeout')));
  req.end(Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined);
});
let container;
async function destination() {
  const c = JSON.parse((await api('GET', '/containers/' + container + '/json')).toString());
  assert.ok(c.Name.startsWith('/supabase_db_'));
  assert.ok(c.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === '54322'));
  assert.match(database, /^cometa_bootstrap_\d+$/);
}
async function exec(args, user = 'postgres') {
  await destination();
  const e = JSON.parse((await api('POST', '/containers/' + container + '/exec', { User: user, AttachStdout: true, AttachStderr: true, Cmd: args })).toString());
  const raw = await api('POST', '/exec/' + e.Id + '/start', { Detach: false, Tty: false });
  let out = '', err = ''; for (let i = 0; i < raw.length;) { const n = raw.readUInt32BE(i + 4); const b = raw.subarray(i + 8, i + 8 + n).toString(); if (raw[i] === 2) err += b; else out += b; i += n + 8; }
  const result = JSON.parse((await api('GET', '/exec/' + e.Id + '/json')).toString());
  if (result.ExitCode) throw new Error(err || out); return out.trim();
}
async function sql(q, dbUser = 'postgres') {
  assert.ok(['postgres','supabase_admin'].includes(dbUser));
  await destination();
  // Transfer literal UTF-8 bytes as a file, never interpolate SQL into shell code.
  const name = 'm0_' + randomUUID() + '.sql', data = Buffer.from(q), header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
  const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const tar = Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]);
  await api('PUT', '/containers/' + container + '/archive?path=/tmp', tar);
  try { return await exec(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', dbUser, '-d', database, '-f', '/tmp/' + name]); }
  finally { await exec(['rm', '--', '/tmp/' + name], 'root'); }
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
let created=false;
try {
 const list=JSON.parse((await api('GET','/containers/json')).toString()).filter(c=>c.Names.some(n=>n.startsWith('/supabase_db_')));
 assert.equal(list.length,1);container=list[0].Id;await destination();
 await exec(['createdb','-U','postgres','--template=template0',database]);created=true;
 console.log('EMPTY APPLICATION DATABASE',database);
 await sql('create schema extensions;create schema vault;create publication supabase_realtime;');
 const platform=await exec(['pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=auth','--schema=storage']);
 // A fresh hosted project provides platform tables, not this application's policies.
 await sql(platform.replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm,'').replace(/^CREATE POLICY[\s\S]*?;\s*$/gm,''));
 assert.equal(await sql('select count(*) from auth.users'),'0');
 assert.equal(await sql("select count(*) from pg_tables where schemaname='public'"),'0');
 const files=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files){
  console.log('APPLY',file);
  await sql('begin;\n'+fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^\uFEFF/,'')+'\ncommit;');
 }
 console.log('PASS EMPTY BASELINE',files.length,'migrations; no public schema copied, no users/data copied');
 const {provisionMagenta,verifySyntheticChain,fixtureEmail}=await import('./magenta-preview-fixture.mjs');
 const actor=randomUUID();await sql(`insert into auth.users(id,email) values('${actor}',${quote(fixtureEmail)})`);
 const fixture=await provisionMagenta({sql,actor});
 await verifySyntheticChain({sql,fixture});
}catch(error){console.error('BOOTSTRAP FAILED:',error.message);process.exitCode=1;}
finally{if(created){await destination();await exec(['dropdb','-U','postgres',database]);console.log('Dropped ONLY',database);}}
