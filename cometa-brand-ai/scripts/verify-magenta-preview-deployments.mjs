import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
const dir=path.resolve('.next/magenta-functional/ephmrsjnpkcgddulvckj');
const plan=JSON.parse(fs.readFileSync('config/magenta-preview-deployment.json','utf8'));
const origins=JSON.parse(fs.readFileSync(path.join(dir,'origins.json'),'utf8'));
const vc=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js');
const cli=args=>execFileSync(process.execPath,[vc,...args,'--scope',plan.scope],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000});
const all=[];
for(const app of ['storefront','admin']){
 const current=JSON.parse(fs.readFileSync(path.join(dir,app+'-deployment.json'),'utf8'));
 const d=JSON.parse(cli(['inspect',current.url,'--json']));
 assert.equal(d.target,'preview');assert.equal(d.name,plan[app].project);
 console.log(JSON.stringify({app,url:current.url,target:d.target,state:d.readyState}));
 if(d.readyState!=='READY')process.exit(2);
 const project=JSON.parse(cli(['api','/v9/projects/'+plan[app].id]));
 const before=JSON.parse(fs.readFileSync(path.join(dir,app+'-production-before.json'),'utf8'));
 assert.equal(project.targets.production.id,before.productionId);assert.equal(project.rootDirectory,before.rootDirectory);
 if(process.argv.includes('--activate')){
  const host=new URL(origins[app]).hostname;
  assert.equal(host,app==='admin'?'cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app':'magenta-controlled-preview-test-delivery-cometa-os-s-projects.vercel.app');
  const previous=JSON.parse(cli(['inspect',origins[app],'--json']));assert.equal(previous.target,'preview');assert.equal(previous.name,plan[app].project);
  cli(['alias','set',current.url,host]);
  const check=JSON.parse(cli(['inspect',origins[app],'--json']));assert.equal(check.id,d.id);assert.equal(check.target,'preview');
 }
 const build=spawnSync(process.execPath,[vc,'inspect',current.url,'--logs','--scope',plan.scope],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000});
 assert.equal(build.status,0);const log=build.stdout+build.stderr;
 fs.writeFileSync(path.join(dir,app+'-build.log'),log);
 console.log(app,log.split('\n').filter(line=>/Verified isolated|standalone|Warning|Error:|Compiled successfully/.test(line)).join('\n'));
 all.push({app,url:current.url,origin:origins[app],id:d.id,target:d.target,state:d.readyState,productionIdUnchanged:before.productionId});
}
fs.writeFileSync(path.join(dir,'deployment-proof.json'),JSON.stringify(all,null,2));
console.log('PASS both builds Ready/Preview; production targets and root settings unchanged.');
