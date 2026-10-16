import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import qz from 'qz-tray';
function load(file,deps={},globals={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:name=>{assert.ok(name in deps,name);return deps[name]},Request,Response,URL,Date,Intl,process,Buffer,...globals});return module.exports;}
const thermal=load('src/lib/pos/thermal.ts'),permissions=load('src/lib/pos/retail-permissions.ts');
const conf={printer:'Fixture USB',width:80,profile:'escpos-pin2',autoPrint:true,autoDrawer:true};
const cash=[{payment_method:'cash',amount:100,tendered_amount:120,change_amount:20}],card=[{payment_method:'card',amount:100,tendered_amount:100,change_amount:0}];
assert.deepEqual([...thermal.automaticOperations(conf,cash)],['receipt','drawer']);
assert.deepEqual([...thermal.automaticOperations(conf,card)],['receipt']);
assert.deepEqual([...thermal.automaticOperations(conf,[{...card[0],payment_method:'transfer'}])],['receipt']);
assert.deepEqual([...thermal.automaticOperations(conf,[{...cash[0],amount:40},{...card[0],amount:60}])],['receipt','drawer']);
assert.deepEqual([...thermal.automaticOperations({...conf,profile:'driver'},cash)],['receipt']);
assert.throws(()=>thermal.drawerCommand('driver'));
const now=Date.now();for(const role of ['SALES','INVENTORY'])assert.equal(permissions.retailExpired(permissions.RETAIL_DEFAULTS[role],new Date(now-86400000).toISOString(),now),false);
assert.equal(permissions.retailExpired(permissions.RETAIL_DEFAULTS.ADMIN,new Date(now-179999).toISOString(),now),false);
assert.equal(permissions.retailExpired(permissions.RETAIL_DEFAULTS.ADMIN,new Date(now-180000).toISOString(),now),true);
assert.equal(permissions.retailExpired(['SETTINGS'],new Date(now-600000).toISOString(),now),true,'custom administrative privilege expires after suspension');
const membership={role:'owner',permissions:['pos.sale.create']};let allowed=new Set(Object.keys(permissions.RETAIL_PERMISSIONS));
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const staff={id:crypto.randomUUID(),name:'Operador sintético'},terminalId=crypto.randomUUID(),brand='fixture';
const sale={id:crypto.randomUUID(),brand_slug:brand,status:'completed',location_id:'location',cashier_staff_id:staff.id,cash_session_id:crypto.randomUUID(),sale_number:'FIXTURE',sold_at:new Date().toISOString(),subtotal:100,discount_total:0,tax_total:0,total:100,currency:'MXN',items:[{product_name:'<script>bad()</script>',variant_name:'M',sku:'0001',quantity:1,unit_price:100,line_total:100}],payments:cash};
const tables={pos_terminal_print_settings:[{id:terminalId,brand_slug:brand,host_user_id:'host',config:conf}],pos_terminal_print_jobs:[],pos_sales:[sale],pos_staff:[{...staff,brand_slug:brand}],pos_branding:[{brand_slug:brand,display_name:'Fixture'}]};
function from(table){assert.ok(table in tables,table);let filters=[],operation='read',value;const query={select(){return query},eq(k,v){filters.push(r=>r[k]===v);return query},maybeSingle(){return exec(false)},single(){return exec(true)},insert(v){operation='insert';value=v;return query},update(v){operation='update';value=v;return query},then(ok,fail){return exec(false).then(ok,fail)}};async function exec(single){let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(operation==='insert'){if(tables[table].some(r=>r.brand_slug===value.brand_slug&&r.dedupe_key===value.dedupe_key))return{error:{code:'23505'},data:null};rows=[{id:crypto.randomUUID(),created_at:new Date().toISOString(),status:'requested',...value}];tables[table].push(...rows);}if(operation==='update')rows.forEach(r=>Object.assign(r,value));return{data:rows[0]??null,error:single&&!rows.length?{code:'missing'}:null}}return query;}
const context={brand:{slug:brand},user:{userId:'host',isAdmin:true},membership,admin:{from}};
const server={requirePosContext:async()=>context,getBrandSlugFromUrl:()=>brand,readJsonBody:r=>r.json(),uuidValue:v=>v,PosApiError:ApiError,ok:value=>Response.json({ok:true,...value}),handlePosError:e=>Response.json({error:e.message},{status:e.status||500})};
const route=load('src/app/api/pos/terminal-print/route.ts',{'node:crypto':crypto,'@/lib/pos/server':server,'@/lib/pos/access':{requirePosCommercialAccess:async()=>{}},'@/lib/pos/staff-server':{requireRetailPermission:async(_,permission)=>{if(!allowed.has(permission))throw new ApiError(403,'denied','denied');return{staff,locationId:null}}},'@/lib/pos/thermal':thermal});
const post=body=>route.POST(new Request('https://fixture.test/api/pos/terminal-print',{method:'POST',headers:{origin:'https://fixture.test','content-type':'application/json'},body:JSON.stringify({terminalId,...body})}));
let response=await post({action:'automatic',saleId:sale.id});assert.equal(response.status,200);assert.equal((await response.json()).jobs.length,2);
await Promise.all([post({action:'automatic',saleId:sale.id}),post({action:'automatic',saleId:sale.id})]);assert.equal(tables.pos_terminal_print_jobs.length,2,'double click/concurrent retry produces no new jobs');
const key=crypto.randomUUID();response=await post({action:'reprint',saleId:sale.id,requestKey:key});assert.equal(response.status,200);const reprint=(await response.json()).jobs[0];assert.equal(reprint.kind,'reprint');assert.equal(reprint.payload.data[0].type,'pixel');assert.ok(reprint.payload.data[0].data.includes('&lt;script&gt;'));
await post({action:'reprint',saleId:sale.id,requestKey:key});assert.equal(tables.pos_terminal_print_jobs.length,3);
allowed=new Set(['PRODUCTS_READ']);assert.equal((await post({action:'reprint',saleId:sale.id,requestKey:crypto.randomUUID()})).status,403);allowed=new Set(Object.keys(permissions.RETAIL_PERMISSIONS));
const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});process.env.POS_QZ_PRIVATE_KEY=keys.privateKey.export({type:'pkcs8',format:'pem'});process.env.POS_QZ_CERTIFICATE='fixture-public-certificate';
const job=tables.pos_terminal_print_jobs.find(j=>j.kind==='drawer');const options=qz.configs.create(conf.printer,{copies:1,units:'mm',size:{width:80,height:null},margins:0,scaleContent:true}).config;
const message=JSON.stringify({call:'print',params:{printer:{name:conf.printer},options,data:job.payload.data},timestamp:Date.now()});const digest=crypto.createHash('sha256').update(message).digest('hex');
response=await post({action:'sign',jobId:job.id,message,digest});assert.equal(response.status,200);const signature=(await response.json()).signature;assert.ok(crypto.verify('SHA512',Buffer.from(digest),keys.publicKey,Buffer.from(signature,'base64')),'QZ digest signature is valid');
assert.equal((await post({action:'sign',jobId:job.id,message,digest})).status,409,'dispatch is one shot');
assert.equal((await post({action:'result',jobId:job.id,status:'failed'})).status,200);assert.equal(job.status,'uncertain');
assert.equal((await post({action:'automatic',saleId:sale.id})).status,200);assert.equal(tables.pos_terminal_print_jobs.filter(j=>j.kind==='drawer').length,1,'uncertain drawer not resent');
assert.equal(sale.status,'completed');assert.equal(tables.pos_sales.length,1,'printing failure cannot create or modify a sale');
const bad=JSON.stringify({call:'file.write',params:{},timestamp:Date.now()});assert.equal((await post({action:'sign',jobId:reprint.id,message:bad,digest:crypto.createHash('sha256').update(bad).digest('hex')})).status,403,'no arbitrary bridge operations');
assert.equal((await post({action:'result',jobId:reprint.id,status:'spooled'})).status,409,'not dispatched cannot claim spooled');
assert.equal((await post({action:'result',jobId:reprint.id,status:'failed'})).status,200);assert.equal(tables.pos_terminal_print_jobs.find(j=>j.id===reprint.id).status,'failed','disconnected bridge recorded without dispatch');
assert.equal((await post({action:'sign',jobId:reprint.id,message,digest})).status,403);

const discovery=JSON.stringify({call:'printers.find',params:{},timestamp:Date.now()});
const discoveryBody={action:'discover-sign',message:discovery,digest:crypto.createHash('sha256').update(discovery).digest('hex')};
response=await post(discoveryBody);assert.equal(response.status,200);
assert.ok(crypto.verify('SHA512',Buffer.from(discoveryBody.digest),keys.publicKey,Buffer.from((await response.json()).signature,'base64')));
allowed=new Set(['PRODUCTS_READ']);assert.equal((await post(discoveryBody)).status,403);
allowed=new Set(Object.keys(permissions.RETAIL_PERMISSIONS));
for(const candidate of [{call:'print',params:{}},{call:'file.write',params:{}},{call:'printers.find',params:{query:'other'}},{call:'printers.find',params:{},timestamp:Date.now()-60000}]){
 const message=JSON.stringify({timestamp:Date.now(),...candidate});
 assert.equal((await post({action:'discover-sign',message,digest:crypto.createHash('sha256').update(message).digest('hex')})).status,403);
}
assert.equal((await post({...discoveryBody,message:'{'})).status,400);
assert.equal((await post({...discoveryBody,digest:'wrong'})).status,403);
delete process.env.POS_QZ_PRIVATE_KEY;delete process.env.POS_QZ_CERTIFICATE;
process.env.POS_QZ_MANUAL_TEST='true';
for(const environment of ['production','development','']){
 process.env.VERCEL_ENV=environment;
 assert.equal((await post({...discoveryBody,manualTest:true})).status,403,'manual mode denied outside Preview');
}
process.env.VERCEL_ENV='preview';
assert.equal((await post(discoveryBody)).status,503,'no silent unsigned fallback without opt-in');
response=await post({...discoveryBody,manualTest:true});assert.equal(response.status,200);
assert.equal((await response.json()).signature,'','manual approval sends no claimed identity/signature');
allowed=new Set(['PRODUCTS_READ']);assert.equal((await post({...discoveryBody,manualTest:true})).status,403);
allowed=new Set(Object.keys(permissions.RETAIL_PERMISSIONS));
response=await post({action:'test',requestKey:crypto.randomUUID(),manualTest:true});assert.equal(response.status,200);
const manualJob=(await response.json()).jobs[0];
const manualMessage=JSON.stringify({call:'print',params:{printer:{name:conf.printer},options,data:manualJob.payload.data},timestamp:Date.now()});
const manualBody={action:'sign',jobId:manualJob.id,message:manualMessage,digest:crypto.createHash('sha256').update(manualMessage).digest('hex'),manualTest:true};
assert.equal((await post({...manualBody,message:bad,digest:crypto.createHash('sha256').update(bad).digest('hex')})).status,403,'manual mode does not allow arbitrary commands');
response=await post(manualBody);assert.equal(response.status,200);assert.equal((await response.json()).signature,'');
assert.equal((await post(manualBody)).status,409,'manual approval still dispatches once');
assert.equal((await post({action:'result',jobId:manualJob.id,status:'failed',manualTest:true})).status,200);
assert.equal(sale.status,'completed');assert.equal(tables.pos_sales.length,1);

// Execute the actual client against the route. QZ UI/hardware is simulated here.
const storage=new Map();const browserStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
browserStorage.setItem('cometa:print-terminal:'+brand,terminalId);
let certificateCallback,signatureCallback,hashCallback,bridgeConnected=false,certificateSeen=null,wireCalls=0;
const bridgeCall=async(call,params)=>{
 const message=JSON.stringify({call,params,timestamp:Date.now()});
 const digest=await hashCallback(message);
 const signature=await new Promise(signatureCallback(digest));
 assert.equal(signature,'');wireCalls++;
};
const mockQz={
 security:{setCertificatePromise:fn=>{certificateCallback=fn},setSignatureAlgorithm:()=>{},setSignaturePromise:fn=>{signatureCallback=fn}},
 api:{setSha256Type:fn=>{hashCallback=fn}},
 websocket:{isActive:()=>bridgeConnected,disconnect:async()=>{bridgeConnected=false},connect:async opts=>{assert.equal(opts.usingSecure,true);assert.equal(opts.host,'localhost');certificateSeen=await new Promise(certificateCallback);bridgeConnected=true;}},
 printers:{find:async()=>{await bridgeCall('printers.find',{});return ['Fixture USB']}},
 configs:{create:(printer,options)=>({printer,options:qz.configs.create(printer,options).config})},
 print:async(config,data)=>{await bridgeCall('print',{printer:{name:config.printer},options:config.options,data})}
};
const client=load('src/lib/pos/thermal-client.ts',{'./thermal':thermal,'qz-tray':{default:mockQz}},{sessionStorage:browserStorage,localStorage:browserStorage,crypto:crypto.webcrypto,TextEncoder,fetch:async(url,options)=>{
 const request=new Request('https://fixture.test'+url,options?{...options,headers:{...options.headers,origin:'https://fixture.test'}}:undefined);
 return options?.method==='POST'?route.POST(request):route.GET(request);
}});
await assert.rejects(client.discoverPrinters(brand),/firma/);
client.selectManualTest(brand,true);
assert.deepEqual([...await client.discoverPrinters(brand)],['Fixture USB']);assert.equal(certificateSeen,'');
const jobsBefore=tables.pos_terminal_print_jobs.length;
await client.printOperation(brand,{action:'reprint',saleId:sale.id,requestKey:crypto.randomUUID()});
assert.equal(tables.pos_terminal_print_jobs.length,jobsBefore+1);assert.equal(tables.pos_terminal_print_jobs.at(-1).status,'spooled');
assert.equal(wireCalls,2);client.selectManualTest(brand,false);
await assert.rejects(client.discoverPrinters(brand),/firma/);
delete process.env.POS_QZ_MANUAL_TEST;delete process.env.VERCEL_ENV;
console.log('PASS manual Preview opt-in: production denied, no silent fallback, permission and payload checks, one-shot dispatch, failure preserves sale. QZ dialogs/hardware not tested.');

console.log('PASS software only: cash/card/transfer/mixed, one-shot jobs, reprint isolation, uncertain drawer, safe HTML, signature validation, server permission denial, admin expiry and non-admin inactivity. No hardware or real sales.');
