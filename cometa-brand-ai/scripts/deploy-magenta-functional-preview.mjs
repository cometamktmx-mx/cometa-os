// Explicit Preview only; never changes project settings or production aliases.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {environmentForPreview} from './magenta-preview-environment.mjs';
const plan=JSON.parse(fs.readFileSync('config/magenta-preview-deployment.json','utf8'));
const [app,source]=process.argv.slice(2),target=plan[app];
if(!['admin','storefront'].includes(app)||!source)throw Error('APP_AND_SNAPSHOT_REQUIRED');
const cwd=path.resolve(source),base=path.resolve('.next/magenta-preview-preparation');
if(!cwd.startsWith(base+path.sep))throw Error('SECRET_FREE_SNAPSHOT_REQUIRED');
if(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!==plan.branch)throw Error('DELIVERY_BRANCH_REQUIRED');
const vc=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js');
function cli(args,env=process.env){return execFileSync(process.execPath,[vc,...args,'--scope',plan.scope],{cwd,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024});}
const project=JSON.parse(cli(['api','/v9/projects/'+target.id]));
if(project.id!==target.id||project.name!==target.project||project.rootDirectory!==target.rootDirectory||!project.targets?.production?.id)throw Error('EXISTING_PROJECT_WITH_PRODUCTION_REQUIRED');
const dir=path.resolve('.next/magenta-functional/ephmrsjnpkcgddulvckj');
const baseline=path.join(dir,app+'-production-before.json');
const evidence={id:project.id,productionId:project.targets.production.id,rootDirectory:project.rootDirectory};
if(!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify(evidence));
else if(JSON.parse(fs.readFileSync(baseline,'utf8')).productionId!==evidence.productionId)throw Error('PRODUCTION_TARGET_CHANGED_STOP');
fs.mkdirSync(path.join(cwd,'.vercel'),{recursive:true});
fs.writeFileSync(path.join(cwd,'.vercel/project.json'),JSON.stringify({projectId:project.id,orgId:project.accountId,projectName:project.name}));
console.log('Verified existing project and production target; requesting Preview only:',app);
let output;
const environment=JSON.parse(fs.readFileSync(path.join(dir,'environment.json'),'utf8'));
const origins=JSON.parse(fs.readFileSync(path.join(dir,'origins.json'),'utf8'));
const webhookFile=path.join(dir,'webhook.json');
const secret=fs.existsSync(webhookFile)?JSON.parse(fs.readFileSync(webhookFile,'utf8')).secret:undefined;
const values=environmentForPreview(environment,origins.admin,origins.storefront,secret)[app];
// CLI reads each value from the child process environment. No secret in argv or source.
const overrides=Object.keys(values).flatMap(key=>['--env',key,'--build-env',key]);
try{output=cli(['deploy','--yes','--target','preview','--no-wait','--meta','githubDeployment=1','--meta','githubCommitRef='+plan.branch,...overrides],{...process.env,...values});}
catch(error){fs.writeFileSync(path.join(dir,app+'-deploy-error.log'),String(error.stderr??''),{mode:0o600});throw Error('DEPLOY_FAILED_PRIVATE_LOG_AVAILABLE');}
const url=output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)?.[0];
if(!url)throw Error('DEPLOY_URL_MISSING');
const inspected=JSON.parse(cli(['inspect',url,'--json']));
fs.writeFileSync(path.join(dir,app+'-deployment.json'),JSON.stringify({id:inspected.id,url,target:inspected.target,state:inspected.readyState,aliases:inspected.aliases}));
if(inspected.target!=='preview')throw Error('NOT_PREVIEW_STOP_NO_FURTHER_ACTIONS');
console.log(JSON.stringify({app,url,target:inspected.target,state:inspected.readyState}));
