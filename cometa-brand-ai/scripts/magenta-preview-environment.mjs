import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const plan=JSON.parse(fs.readFileSync('config/magenta-preview-deployment.json','utf8'));
function previewOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname.endsWith('-cometa-os-s-projects.vercel.app')||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('VERIFIED_PREVIEW_ORIGIN_REQUIRED');return u.origin;}
export function environmentForPreview({projectRef,url,anon,service,stripeTest},adminOrigin,storeOrigin,webhookSecret){
 if(!/^[a-z]{20}$/.test(projectRef)||['zhtagqrzyovsrmsicaot','ofkvisonfllafkzihdvq','fvaruzjravbwzatnjfoe'].includes(projectRef)||url!=='https://'+projectRef+'.supabase.co'||!anon||!service||!stripeTest?.startsWith('sk_test_'))throw Error('ISOLATED_TEST_ENV_REQUIRED');
 const admin=previewOrigin(adminOrigin),store=previewOrigin(storeOrigin);
 if(webhookSecret&&!webhookSecret.startsWith('whsec_'))throw Error('ENDPOINT_SIGNING_SECRET_REQUIRED');
 const stripe={STOREFRONT_STRIPE_TEST_SECRET_KEY:stripeTest,...(webhookSecret?{STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET:webhookSecret}:{})};
 return {
  admin:{NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,APP_ORIGIN:admin,OWN_STOREFRONT_URLS:JSON.stringify({'magenta-preview':store}),...stripe,OPENAI_API_KEY:'PREVIEW_DISABLED',OPENAI_BASE_URL:'http://127.0.0.1:9',SALES_AI_SEND_WHATSAPP_ENABLED:'false',SALES_AI_AGENT_MODE:'draft',WHATSAPP_ACCESS_TOKEN:'PREVIEW_DISABLED',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'PREVIEW_DISABLED',WHATSAPP_TOKEN_ENCRYPTION_KEY:'PREVIEW_DISABLED',SALES_AI_INTERNAL_SECRET:'PREVIEW_DISABLED',COMU_ENABLED:'false'},
  storefront:{STOREFRONT_SUPABASE_URL:url,STOREFRONT_SUPABASE_ANON_KEY:anon,STOREFRONT_SUPABASE_SERVICE_ROLE_KEY:service,STOREFRONT_BRAND_SLUG:'magenta-preview',STOREFRONT_ORIGIN:store,...stripe},
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [ref,adminOrigin,storeOrigin]=process.argv.slice(2);
 if(!/^[a-z]{20}$/.test(ref??''))throw Error('TEST_REF_REQUIRED');
 const directory=path.resolve('.next','magenta-functional',ref),input=JSON.parse(fs.readFileSync(path.join(directory,'environment.json'),'utf8'));
 if(input.projectRef!==ref)throw Error('REF_MISMATCH');
 const webhookFile=path.join(directory,'webhook.json'),webhook=fs.existsSync(webhookFile)?JSON.parse(fs.readFileSync(webhookFile,'utf8')):null;
 const variables=environmentForPreview(input,adminOrigin,storeOrigin,webhook?.secret);
 // Safe default: print only names and destinations. No values ever enter argv/logs.
 console.log(JSON.stringify({branch:plan.branch,target:plan.target,variables:Object.fromEntries(Object.entries(variables).map(([k,v])=>[k,Object.keys(v)])),apply:process.argv.includes('--apply')}));
 if(process.argv.includes('--apply')){
  const vc=path.join(process.env.APPDATA,'npm','node_modules','vercel','dist','vc.js');
  for(const [app,origin] of [['admin',adminOrigin],['storefront',storeOrigin]]){
   let inspected;try{inspected=JSON.parse(execFileSync(process.execPath,[vc,'inspect',origin,'--json','--scope',plan.scope],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}catch{throw Error('PREVIEW_INSPECTION_FAILED');}
   if(inspected.target!=='preview'||inspected.readyState!=='READY'||inspected.name!==plan[app].project)throw Error('TARGET_NOT_READY_PREVIEW');
  }
  for(const [app,values] of Object.entries(variables))for(const [name,value] of Object.entries(values)){
   try{execFileSync(process.execPath,[vc,'env','add',name,'preview','--git-branch',plan.branch,'--project',plan[app].id,'--scope',plan.scope,'--yes','--force'],{input:value,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
   catch{throw Error('PREVIEW_VARIABLE_WRITE_FAILED:'+app+':'+name);}
   console.log('Set branch Preview variable',app,name);
  }
 }
}
