import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {randomUUID} from 'node:crypto';
let mode='RETAIL',authenticated=true,host=true;const allowed=new Set(['REPORTS','CASH','SETTINGS']),calls=[],location=randomUUID(),staff=randomUUID(),payment=randomUUID();
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;}}
const context={user:{userId:randomUUID(),isAdmin:false},brand:{slug:'allowed-brand'},device:{locationId:location},admin:{rpc:async(name,args)=>{calls.push({name,args});return{data:{},error:null}},from:()=>{let match=true;const q={select:()=>q,eq:(k,v)=>{if(k==='id'&&v!==payment)match=false;return q;},maybeSingle:async()=>({data:match?{location_id:location}:null,error:null})};return q;}}};
const deps={
 '@/lib/pos/access':{requirePosOperationalAccess:async()=>{if(!authenticated)throw new ApiError(401,'auth','Required');return context;}},
 '@/lib/pos/staff-server':{getPosMode:async()=>mode,requireRetailPermission:async(_c,p)=>{if(!allowed.has(p))throw new ApiError(403,'permission','Required');return{id:randomUUID(),staff:{id:staff},locationId:location}}},
 '@/lib/pos/rbac':{requirePosPermission:()=>{if(!host)throw new ApiError(403,'host','Required')}},
 '@/lib/pos/server':{getBrandSlugFromUrl:()=>context.brand.slug,uuidValue:(v,_f,required=true)=>{if(!v){if(required)throw new ApiError(400,'uuid','Required');return null;}if(!/^[\da-f-]{36}$/.test(v))throw new ApiError(400,'uuid','Invalid');return v;},PosApiError:ApiError,readJsonBody:r=>r.json(),ok:d=>Response.json({ok:true,...d}),handlePosError:e=>Response.json({ok:false,error:e.message},{status:e.status||500})}
};
const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/pos/retail-reports/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>{assert.ok(deps[n],n);return deps[n]},URL,Request,Response});
const get=(extra='')=>module.exports.GET(new Request('https://test.invalid/api/pos/retail-reports?brandSlug=forged&from=2026-10-01&to=2026-10-18'+extra));
assert.equal((await get()).status,200);assert.equal(calls.at(-1).args.p_brand,'allowed-brand');assert.equal(calls.at(-1).args.p_location,location);
assert.equal((await get('&location='+randomUUID())).status,403);assert.equal((await get('&method=unknown')).status,400);
authenticated=false;assert.equal((await get()).status,401);authenticated=true;host=false;assert.equal((await get()).status,403);host=true;
allowed.delete('REPORTS');assert.equal((await get()).status,403);allowed.add('REPORTS');mode='FOOD';assert.equal((await get()).status,403);mode='RETAIL';
const post=(body,origin='https://test.invalid')=>module.exports.POST(new Request('https://test.invalid/api/pos/retail-reports',{method:'POST',headers:{origin},body:JSON.stringify(body)}));
const body={source:'order',payment_id:payment,verified:true,reference:'BANK REF',reason:'Checked manually',request_key:randomUUID()};
assert.equal((await post(body,'https://foreign.invalid')).status,403);allowed.delete('CASH');assert.equal((await post(body)).status,403);allowed.add('CASH');
assert.equal((await post({...body,payment_id:randomUUID()})).status,404);assert.equal((await post({...body,reason:''})).status,400);assert.equal((await post(body)).status,200);assert.equal(calls.at(-1).args.p_staff,staff);
allowed.delete('SETTINGS');assert.equal((await post({action:'reverse',movement_id:payment,target_session:randomUUID(),reason:'Reverse error',request_key:randomUUID()})).status,403);
console.log('PASS Retail report/verification/reversal API: authentication, host and operator permissions, FOOD rejection, tenant/device location scope, safe validation and same origin');

const followModule={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/pos/retail-followups/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:followModule,exports:followModule.exports,require:n=>deps[n],URL,Request,Response});
const followPost=(body,origin='https://test.invalid')=>followModule.exports.POST(new Request('https://test.invalid/api/pos/retail-followups',{method:'POST',headers:{origin},body:JSON.stringify(body)}));
const followBody={action:'create',order_id:payment,note:'Follow up',responsible_id:staff,due_at:'2026-10-21T12:00:00Z',request_key:randomUUID()};
assert.equal((await followPost(followBody)).status,403);allowed.add('SELL');mode='FOOD';assert.equal((await followPost(followBody)).status,403);mode='RETAIL';
assert.equal((await followPost(followBody,'https://foreign.invalid')).status,403);assert.equal((await followPost({...followBody,order_id:randomUUID()})).status,404);assert.equal((await followPost(followBody)).status,200);assert.equal(calls.at(-1).args.p_brand,'allowed-brand');assert.equal(calls.at(-1).args.p_staff,staff);
console.log('PASS followup server permissions, FOOD rejection, same origin and tenant-scoped order lookup');
