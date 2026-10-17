import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {randomUUID} from 'node:crypto';
const brand='fixture-a',other='fixture-b',location=randomUUID(),foreignLocation=randomUUID(),id=randomUUID(),staffId=randomUUID();
let authenticated=true,mode='RETAIL',permissions=new Set(['SELL','SETTINGS','DISCOUNT','CANCEL','REPRINT']),hostAllowed=true;const calls=[];
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const rows={pos_retail_orders:[{id,brand_slug:brand,location_id:location,state:'note'},{id:randomUUID(),brand_slug:other,location_id:location,state:'note'},{id:randomUUID(),brand_slug:brand,location_id:foreignLocation,state:'note'}],pos_retail_rules:[],pos_factory_prices:[]};
const admin={from(table){assert.ok(table in rows,table);let data=rows[table];const query={select:()=>query,eq:(k,v)=>{data=data.filter(r=>r[k]===v);return query},order:()=>query,limit:()=>query,maybeSingle:async()=>({data:data[0]||null,error:null}),then:resolve=>Promise.resolve({data,error:null}).then(resolve)};return query;},rpc:async(name,args)=>{calls.push({name,args});return{data:{order:{id,brand_slug:brand}},error:null};}};
const context={admin,brand:{slug:brand,name:'Fixture'},user:{userId:randomUUID(),isAdmin:false},device:{locationId:location}};
const deps={
 '@/lib/pos/access':{requirePosOperationalAccess:async()=>{if(!authenticated)throw new ApiError(401,'auth','Inicia sesión');return context;}},
 '@/lib/pos/staff-server':{getPosMode:async()=>mode,requireRetailPermission:async(_,permission)=>{if(!permissions.has(permission))throw new ApiError(403,'permission','No autorizado');return{staff:{id:staffId},locationId:location};}},
 '@/lib/pos/rbac':{requirePosPermission:()=>{if(!hostAllowed)throw new ApiError(403,'host','No autorizado');}},
 '@/lib/pos/server':{getBrandSlugFromUrl:()=>brand,uuidValue:(v,_k,required=true)=>{if(!v){if(required)throw new ApiError(400,'uuid','UUID requerido');return null;}if(!/^[\da-f-]{36}$/.test(v))throw new ApiError(400,'uuid','UUID inválido');return v;},readJsonBody:r=>r.json(),PosApiError:ApiError,ok:d=>Response.json({ok:true,...d}),handlePosError:e=>Response.json({ok:false,error:e.message},{status:e.status||500})},
 '@/lib/pos/retail-orders':{retailOrderReceipt:()=>'<html></html>'}
};
const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/pos/retail-orders/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>{assert.ok(n in deps,n);return deps[n]},Response,Request,URL});
const post=(body,origin='https://fixture.test')=>module.exports.POST(new Request('https://fixture.test/api/pos/retail-orders?brandSlug='+brand,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
const body={action:'save',id,request_key:randomUUID(),location_id:location,items:[{variant_id:randomUUID(),quantity:1,discount_amount:0}]};
assert.equal((await post(body,'https://foreign.test')).status,403);assert.equal(calls.length,0);
authenticated=false;assert.equal((await post(body)).status,401);authenticated=true;
mode='FOOD';assert.equal((await post(body)).status,403);mode='RETAIL';
permissions.delete('SELL');assert.equal((await post(body)).status,403);permissions.add('SELL');
hostAllowed=false;assert.equal((await post(body)).status,403);hostAllowed=true;
assert.equal((await post({...body,location_id:foreignLocation})).status,403);
assert.equal((await post({...body,id:rows.pos_retail_orders[2].id})).status,403);
permissions.delete('SETTINGS');assert.equal((await post({action:'rules'})).status,403);
rows.pos_retail_orders[0].state='active';assert.equal((await post(body)).status,403);rows.pos_retail_orders[0].state='note';permissions.add('SETTINGS');
permissions.delete('DISCOUNT');assert.equal((await post({...body,items:[{discount_amount:1}]})).status,403);permissions.add('DISCOUNT');
assert.equal((await post({...body,brand_slug:other})).status,200);assert.equal(calls.at(-1).args.p_brand,brand);assert.equal(calls.at(-1).args.p_staff,staffId);
const response=await module.exports.GET(new Request('https://fixture.test/api/pos/retail-orders?brandSlug='+brand));assert.equal(response.status,200);assert.deepEqual((await response.json()).orders.map(o=>o.id),[id]);
assert.equal((await module.exports.GET(new Request('https://fixture.test/api/pos/retail-orders?brandSlug='+brand+'&id='+rows.pos_retail_orders[1].id))).status,404);
console.log('PASS real route: auth, FOOD exclusion, host/operator permissions, same origin, brand/location isolation, scoped RPC arguments, active edits and discounts');
