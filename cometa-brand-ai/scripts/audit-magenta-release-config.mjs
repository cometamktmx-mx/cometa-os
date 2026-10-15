// Metadata only: never decrypt environment variables or write remote configuration.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const plan=JSON.parse(fs.readFileSync('config/magenta-preview-deployment.json','utf8')),dir='.next/magenta-launch-audit';
const vc=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js');
const api=url=>JSON.parse(execFileSync(process.execPath,[vc,'api',url,'--scope',plan.scope],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));
const result={at:new Date().toISOString(),mode:'READ_ONLY',apps:{}};
for(const app of ['admin','storefront']){
 const p=api('/v9/projects/'+plan[app].id);assert.equal(p.id,plan[app].id);
 const env=api('/v10/projects/'+p.id+'/env'),domains=api('/v9/projects/'+p.id+'/domains');
 result.apps[app]={name:p.name,rootDirectory:p.rootDirectory,productionDeployment:p.targets?.production?.id,gitBranch:p.link?.productionBranch,domains:domains.domains?.map(d=>({name:d.name,gitBranch:d.gitBranch,verified:d.verified})),variables:env.envs?.map(e=>({name:e.key,target:e.target,branch:e.gitBranch??null}))};
}
const queryFile=path.resolve(dir,'release-context-readonly.sql');fs.writeFileSync(queryFile,"begin read only; select jsonb_build_object('slug',b.slug,'activeMembers',(select count(*) from user_brand_access a where a.brand_slug=b.slug and a.status='active'),'roles',(select jsonb_agg(distinct access_role) from user_brand_access a where a.brand_slug=b.slug and a.status='active'),'locations',(select jsonb_agg(jsonb_build_object('name',name,'active',active,'currency',currency)) from pos_locations l where l.brand_slug=b.slug),'registers',(select count(*) from pos_registers r where r.brand_slug=b.slug),'products',(select count(*) from pos_products p where p.brand_slug=b.slug)) as context from brands b where b.id='70880b54-b6fe-4775-bb39-c9ff19c47c39' and b.slug='magenta-fitwear';commit;");
const rows=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref','zhtagqrzyovsrmsicaot','--file',queryFile,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).rows;assert.equal(rows.length,1);result.brand=rows[0].context;
fs.writeFileSync(dir+'/release-config.json',JSON.stringify(result,null,2));console.log(JSON.stringify({at:result.at,mode:result.mode,brand:result.brand,apps:Object.fromEntries(Object.entries(result.apps).map(([key,a])=>[key,{name:a.name,productionDeployment:a.productionDeployment,domains:a.domains,variableNamesRecorded:a.variables.length}]))},null,2));
