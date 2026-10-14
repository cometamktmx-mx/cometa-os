// Explicit opt-in, NEW dedicated test project only. Never creates a paid service.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';
import {fixtureEmail,provisionMagenta} from './magenta-preview-fixture.mjs';
process.on('uncaughtException',error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:'BACKEND_PROVISION_FAILED');process.exit(1);});
const ref=process.argv[2];
const forbidden=['zhtagqrzyovsrmsicaot','ofkvisonfllafkzihdvq','fvaruzjravbwzatnjfoe'];
if(!/^[a-z]{20}$/.test(ref??'')||forbidden.includes(ref))throw Error('NEW_TEST_PROJECT_REF_REQUIRED');
const files=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
if(!process.argv.includes('--apply')){
 console.log(JSON.stringify({projectRef:ref,requiredName:'magenta-preview-test',mode:'PLAN_ONLY',migrations:files.length,authUser:fixtureEmail,stock:10,cron:'magenta-preview-expiry',applied:false}));
 process.exit(0);
}
const dir=path.resolve('.next','magenta-functional',ref);fs.mkdirSync(dir,{recursive:true});
function cli(args){
 try{return JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024}));}
 catch{throw Error('SUPABASE_CLI_FAILED_REVIEW_PRIVATELY');}
}
const projects=cli(['projects','list']),project=projects.find(p=>p.id===ref);
if(project?.name!=='magenta-preview-test'||project.status!=='ACTIVE_HEALTHY')throw Error('DEDICATED_TEST_PROJECT_NOT_CONFIRMED');
async function query(text){
 const file=path.join(dir,'query.sql');fs.writeFileSync(file,text);
 const result=cli(['db','query','--linked','--project-ref',ref,'--file',file]);
 if(!Array.isArray(result.rows))throw Error('UNEXPECTED_SQL_RESPONSE');return result.rows;
}
async function sql(text){const rows=await query(text);if(!rows.length)return '';const value=Object.values(rows.at(-1))[0];return typeof value==='object'?JSON.stringify(value):String(value??'');}
const empty=await sql("select jsonb_build_object('tables',(select count(*) from pg_tables where schemaname='public'),'users',(select count(*) from auth.users))");
const counts=JSON.parse(empty);if(counts.tables!==0||counts.users!==0)throw Error('EMPTY_PROJECT_REQUIRED_NO_CHANGES');
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const key=[env.STOREFRONT_STRIPE_TEST_SECRET_KEY,env.COMU_STRIPE_SECRET_KEY,env.STRIPE_SECRET_KEY].find(k=>k?.startsWith('sk_test_'));
if(!key)throw Error('STRIPE_TEST_REQUIRED');
const stripe=new Stripe(key,{timeout:10000,maxNetworkRetries:0});let account;
try{account=await stripe.accounts.retrieveCurrent();}catch{throw Error('STRIPE_TEST_ACCOUNT_UNAVAILABLE');}
const keys=cli(['projects','api-keys','--project-ref',ref,'--reveal']);
const anon=keys.find(k=>k.name==='anon')?.api_key??keys.find(k=>k.type==='publishable')?.api_key;
const service=keys.find(k=>k.name==='service_role')?.api_key??keys.find(k=>k.type==='secret')?.api_key;
if(!anon||!service)throw Error('API_KEYS_UNAVAILABLE');
await query('create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);');
for(const file of files){
 const source=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^\uFEFF/,'');
 const version=file.split('_')[0],name=file.slice(version.length+1,-4);
 await query('begin;\n'+source+`\ninsert into supabase_migrations.schema_migrations(version,name) values('${version}','${name}');\ncommit;`);
 console.log('Applied test-only',file,createHash('sha256').update(source).digest('hex'));
}
const client=createClient('https://'+ref+'.supabase.co',service,{auth:{persistSession:false,autoRefreshToken:false}});
const password=randomBytes(30).toString('base64url');
const created=await client.auth.admin.createUser({email:fixtureEmail,password,email_confirm:true,user_metadata:{synthetic:true}});
if(created.error||!created.data.user)throw Error('SYNTHETIC_AUTH_FAILED');
// Save recovery information before further mutations; never print it.
fs.writeFileSync(path.join(dir,'access.json'),JSON.stringify({projectRef:ref,email:fixtureEmail,password,actor:created.data.user.id}),{flag:'wx',mode:0o600});
const fixture=await provisionMagenta({sql,actor:created.data.user.id,stripeAccount:account.id});
await query(`set app.preview_project_ref='${ref}';\n`+fs.readFileSync('supabase/preview/install-expiry.sql','utf8'));
fs.writeFileSync(path.join(dir,'environment.json'),JSON.stringify({projectRef:ref,url:'https://'+ref+'.supabase.co',anon,service,stripeTest:key,stripeAccount:account.id,fixture}),{flag:'wx',mode:0o600});
console.log('Provisioned synthetic backend, 10 units and authenticated DB cron. Private credentials stored only in ignored .next/magenta-functional/<ref>. Verify cron run history before deploy.');
