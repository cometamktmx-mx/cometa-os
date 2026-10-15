// Run only after a functional deployment is verified as Preview. No charges.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import Stripe from 'stripe';
process.on('uncaughtException',error=>{console.error(/^[A-Z_]+$/.test(error.message)?error.message:'WEBHOOK_SETUP_FAILED');process.exit(1);});
const [ref,origin]=process.argv.slice(2),plan=JSON.parse(fs.readFileSync('config/magenta-preview-deployment.json','utf8'));
if(!/^[a-z]{20}$/.test(ref??'')||['zhtagqrzyovsrmsicaot','ofkvisonfllafkzihdvq','fvaruzjravbwzatnjfoe'].includes(ref))throw Error('TEST_REF_REQUIRED');
const url=new URL(origin);if(url.protocol!=='https:'||!url.hostname.startsWith('magenta-controlled-preview-')||!url.hostname.endsWith('-cometa-os-s-projects.vercel.app')||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PREVIEW_URL_REQUIRED');
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'PLAN_ONLY',endpoint:url.origin+plan.webhook.path,events:plan.webhook.events,protection:'authenticated automation token; panel remains protected'}));process.exit(0);}
const dir=path.resolve('.next','magenta-functional',ref),environment=JSON.parse(fs.readFileSync(path.join(dir,'environment.json'),'utf8'));
if(environment.projectRef!==ref||!environment.stripeTest?.startsWith('sk_test_'))throw Error('TEST_ENV_REQUIRED');
const vc=path.join(process.env.APPDATA,'npm','node_modules','vercel','dist','vc.js');
function cli(args,input){try{return execFileSync(process.execPath,[vc,...args,'--scope',plan.scope],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});}catch{throw Error('VERCEL_REQUEST_FAILED');}}
const deployment=JSON.parse(cli(['inspect',url.origin,'--json']));
if(deployment.target!=='preview'||deployment.readyState!=='READY'||deployment.name!==plan.storefront.project)throw Error('READY_STOREFRONT_PREVIEW_REQUIRED');
const secretFile=path.join(dir,'automation.json');
const automation=fs.existsSync(secretFile)?JSON.parse(fs.readFileSync(secretFile,'utf8')):{secret:randomBytes(16).toString('hex'),installed:false};
fs.writeFileSync(secretFile,JSON.stringify(automation),{mode:0o600});
if(!automation.installed){
 cli(['api','/v1/projects/'+plan.storefront.id+'/protection-bypass','--method','PATCH','--input','-','--silent'],JSON.stringify({generate:{secret:automation.secret,note:'Magenta Preview Stripe test webhook'}}));
 automation.installed=true;fs.writeFileSync(secretFile,JSON.stringify(automation),{mode:0o600});
}
const endpoint=new URL(plan.webhook.path,url);endpoint.searchParams.set('x-vercel-protection-bypass',automation.secret);
const response=await fetch(endpoint,{method:'POST',body:'{}',redirect:'manual',signal:AbortSignal.timeout(15000)});
if(response.status!==400||(await response.text())!=='Webhook unavailable')throw Error('WEBHOOK_HANDLER_NOT_REACHABLE');
const stripe=new Stripe(environment.stripeTest,{timeout:15000,maxNetworkRetries:0});
if((await stripe.accounts.retrieveCurrent()).id!==environment.stripeAccount)throw Error('STRIPE_ACCOUNT_MISMATCH');
const file=path.join(dir,'webhook.json');
let record=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
if(record){
 const existing=await stripe.webhookEndpoints.retrieve(record.id);
 if(existing.livemode||existing.metadata.magenta_test_ref!==ref)throw Error('FOREIGN_WEBHOOK');
 await stripe.webhookEndpoints.update(record.id,{url:endpoint.toString(),enabled_events:plan.webhook.events});
}else{
 const created=await stripe.webhookEndpoints.create({url:endpoint.toString(),enabled_events:plan.webhook.events,metadata:{magenta_test_ref:ref},description:'Magenta isolated Preview test only'},{idempotencyKey:'magenta-preview-webhook:'+ref+':'+url.hostname});
 if(created.livemode||!created.secret)throw Error('TEST_WEBHOOK_NOT_CREATED');
 record={id:created.id,secret:created.secret};
}
fs.writeFileSync(file,JSON.stringify({...record,origin:url.origin}),{mode:0o600});
console.log('Stripe test endpoint configured. Signing secret saved privately for branch-only env upload. Panel protection unchanged; no payment performed.');
