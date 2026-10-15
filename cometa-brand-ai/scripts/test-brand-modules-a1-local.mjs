// A1: local Docker only; creates a new database, never applies SQL to postgres.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'cometa_a1_' + Date.now();
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
  assert.match(database, /^cometa_a1_\d+$/);
}
async function exec(args, user = 'postgres') {
  await destination();
  const e = JSON.parse((await api('POST', '/containers/' + container + '/exec', { User: user, AttachStdout: true, AttachStderr: true, Cmd: args })).toString());
  const raw = await api('POST', '/exec/' + e.Id + '/start', { Detach: false, Tty: false });
  let out = '', err = ''; for (let i = 0; i < raw.length;) { const n = raw.readUInt32BE(i + 4); const b = raw.subarray(i + 8, i + 8 + n).toString(); if (raw[i] === 2) err += b; else out += b; i += n + 8; }
  const result = JSON.parse((await api('GET', '/exec/' + e.Id + '/json')).toString());
  if (result.ExitCode) throw new Error(err || out); return out.trim();
}
async function sql(q) {
  await destination();
  // Transfer literal UTF-8 bytes as a file, never interpolate SQL into shell code.
  const name = 'm0_' + randomUUID() + '.sql', data = Buffer.from(q), header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
  const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const tar = Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]);
  await api('PUT', '/containers/' + container + '/archive?path=/tmp', tar);
  try { return await exec(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-f', '/tmp/' + name]); }
  finally { await exec(['rm', '--', '/tmp/' + name], 'root'); }
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const scalar = async q => JSON.parse(await sql('select to_jsonb(x) from (' + q + ') x'));
const migration = 'supabase/migrations/20261010160000_brand_online_store_access_a1.sql';
const ids = Object.fromEntries(['admin','inactive','owner','backup','viewer','other','brand','brandB'].map(k=>[k,randomUUID()]));
let created = false;
try {
  const list = JSON.parse((await api('GET', '/containers/json')).toString()).filter(c => c.Names.some(n => n.startsWith('/supabase_db_')));
  assert.equal(list.length, 1); container = list[0].Id;
  await destination(); console.log('TARGET local Docker port 54322 / NEW DATABASE', database);
  await exec(['createdb', '-U', 'postgres', '--template=template0', database]); created = true;
  await sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension vector with schema extensions; create extension pg_stat_statements with schema extensions; create extension supabase_vault;');
  const dump = await exec(['pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--schema=public', '--schema=auth', '--schema=storage']);
  await sql('drop schema public; create schema public; alter extension vector set schema public;');
  await sql(dump.replace('CREATE SCHEMA public;', '').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm, ''));
  console.log('Schema baseline SHA256', createHash('sha256').update(dump).digest('hex'));
  await sql(fs.readFileSync(migration,'utf8'));
  console.log('Original A1 migration SHA256',createHash('sha256').update(fs.readFileSync(migration)).digest('hex'));
  // Synthetic setup only. Normal triggers/constraints remain active for all tests.
  await sql(`begin;set local session_replication_role=replica;
    insert into auth.users(id,email) values ${['admin','inactive','owner','backup','viewer','other'].map(k=>`('${ids[k]}','a1-${k}@example.test')`).join(',')};
    insert into user_profiles(user_id,email,role,status) values ${['admin','inactive','owner','backup','viewer','other'].map(k=>`('${ids[k]}','a1-${k}@example.test','${['admin','inactive'].includes(k)?'admin':'client'}','${k==='inactive'?'inactive':'active'}')`).join(',')};
    insert into brands(id,slug,name,status) values('${ids.brand}','a1-brand','A1 Brand','active'),('${ids.brandB}','a1-other','A1 Other','active');
    insert into user_brand_access(user_id,brand_slug,access_role,status) values('${ids.owner}','a1-brand','owner','active'),('${ids.backup}','a1-brand','owner','active'),('${ids.viewer}','a1-brand','viewer','active'),('${ids.other}','a1-other','owner','active');
    insert into brand_os_access(brand_slug,status) values('a1-brand','active');
    insert into pos_subscriptions(brand_id,brand_slug,plan_code,status,list_price,contracted_price) values('${ids.brand}','a1-brand','start','active',0,0);
    commit;`);
  const call = (status,revision,actor=ids.admin,slug='a1-brand') => sql(`set role service_role;select public.brand_online_store_set_access_a1(${quote(slug)},'${actor}',${quote(status)},${revision})`);
  const original = await sql("select jsonb_build_object('os',(select jsonb_agg(x) from brand_os_access x),'pos',(select jsonb_agg(x) from pos_subscriptions x),'members',(select jsonb_agg(x) from user_brand_access x),'sellers',(select count(*) from comu_sellers),'listings',(select count(*) from comu_product_listings))");
  for(const actor of [ids.owner,ids.inactive,ids.viewer]) await assert.rejects(()=>call('enabled',0,actor),/ADMIN_REQUIRED/);
  for(const role of ['anon','authenticated']) {
    await assert.rejects(()=>sql(`set role ${role};select public.brand_online_store_set_access_a1('a1-brand','${ids.admin}','enabled',0)`),/permission denied/);
    await assert.rejects(()=>sql(`set role ${role};select * from brand_online_store_access`),/permission denied/);
  }
  await assert.rejects(()=>call('enabled',0,ids.admin,'missing'),/BRAND_NOT_FOUND/);
  assert.equal(JSON.parse(await call('enabled',0)).revision,1);
  assert.equal(await sql("select jsonb_build_object('os',(select jsonb_agg(x) from brand_os_access x),'pos',(select jsonb_agg(x) from pos_subscriptions x),'members',(select jsonb_agg(x) from user_brand_access x),'sellers',(select count(*) from comu_sellers),'listings',(select count(*) from comu_product_listings))"),original);
  assert.equal((await scalar(`select count(*)::int n from brand_online_store_access where brand_id='${ids.brandB}'`)).n,0);
  await sql("update pos_subscriptions set status='suspended' where brand_slug='a1-brand'");
  assert.equal((await scalar(`select status from brand_online_store_access where brand_id='${ids.brand}'`)).status,'enabled');
  await call('enabled',1); // no-op creates no event
  assert.equal((await scalar('select count(*)::int n from brand_online_store_access_events')).n,1);
  const race = await Promise.allSettled([call('suspended',1),call('suspended',1)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  assert.match(race.find(r=>r.status==='rejected').reason.message,/STORE_ACCESS_CONFLICT/);
  const event = await scalar("select actor_user_id,previous_status,new_status,revision from brand_online_store_access_events order by revision desc limit 1");
  assert.deepEqual(event,{actor_user_id:ids.admin,previous_status:'enabled',new_status:'suspended',revision:2});
  await assert.rejects(()=>sql(`set role service_role;update brand_online_store_access set status='enabled'`),/permission denied/);
  await assert.rejects(()=>sql(`set role service_role;delete from brand_online_store_access_events`),/permission denied/);
  const audit=await scalar("select bool_and(relrowsecurity) rls from pg_class where oid in ('brand_online_store_access'::regclass,'brand_online_store_access_events'::regclass)");assert.equal(audit.rls,true);
  console.log('PASS SQL authorization, grants/RLS, independent capability, CAS concurrency, immutable audit, no-op');
  const { certify }=await import('./test-brand-modules-a1-http.mjs');
  await certify({sql,ids,quote});
} finally {
  if(created) { await destination();await exec(['dropdb','-U','postgres','--force',database]);console.log('Dropped only disposable',database); }
}
