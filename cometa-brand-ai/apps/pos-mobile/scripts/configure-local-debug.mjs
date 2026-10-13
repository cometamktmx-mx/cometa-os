// Run from apps/pos-mobile. Read LOCAL Docker only; never persist signing secrets.
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const docker=process.env.COMETA_LOCAL_DOCKER_EXE || 'C:/Users/jesus/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
function run(args) {
 const r=spawnSync(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{encoding:'utf8',windowsHide:true});
 if(r.error || r.status!==0)throw new Error('Local Docker unavailable; no public configuration written.');
 return r.stdout.trim();
}
const db=run(['ps','--format','{{.Names}}']).split(/\r?\n/).filter(n=>n.startsWith('supabase_db_'));
assert.equal(db.length,1,'Select an unambiguous running LOCAL Supabase');
const auth=JSON.parse(run(['inspect','supabase_auth_'+db[0].slice('supabase_db_'.length)]))[0];
const entry=auth.Config.Env.find(v=>v.startsWith('GOTRUE_JWT_SECRET='));
assert.ok(entry,'LOCAL provider must have a JWT signing key');
const secret=entry.slice('GOTRUE_JWT_SECRET='.length);
const now=Math.floor(Date.now()/1000),expiry=now+365*24*60*60;
const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const body=Buffer.from(JSON.stringify({role:'anon',iss:'supabase',iat:now,exp:expiry})).toString('base64url');
const anon=`${head}.${body}.${createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`;
writeFileSync('.env.development.local',[
 '# PUBLIC configuration only; interactive M2 fixture uses the same LOCAL provider key.',
 'VITE_POS_BACKEND=http://127.0.0.1:3105',
 'VITE_SUPABASE_URL=http://127.0.0.1:58130',
 `VITE_SUPABASE_ANON_KEY=${anon}`,
 '',
].join('\n'));
console.log(`Development configured: loopback 3105/58130, public anon expires ${new Date(expiry*1000).toISOString()}. No private key written.`);
