// Runs the actual route module. Auth/database dependencies are simulated;
// this verifies HTTP validation and guard usage, NOT persisted data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compile = (file, dependencies) => {
 const compiled = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  {module:compiled,exports:compiled.exports,require:n=>dependencies[n] ?? require(n),URL,Buffer,File,FormData,Response,Request,TextDecoder});
 return compiled.exports;
};
const parser = compile('src/lib/pos/eleventa-import.ts',{});
class ApiError extends Error { constructor(status,code,message) { super(message);this.status=status;this.code=code; } }
let denied = 0, rpcError = null;
const calls = [], guards = [];
const guardsModule = { requirePosMutationAccess: async options => {
 guards.push(options);
 if (denied) throw new ApiError(denied,'POS_PERMISSION_DENIED','Denied fixture');
 if (options.brandSlug !== 'synthetic-brand') throw new ApiError(403,'POS_PERMISSION_DENIED','Wrong brand fixture');
 return {brand:{slug:'synthetic-brand'},user:{userId:'11111111-1111-4111-8111-111111111111'},admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:{rows:args.p_rows,token:'synthetic-token'},error:rpcError};}}};
}};
const route = compile('src/app/api/pos/imports/route.ts',{
 '@/lib/pos/eleventa-import':parser,
 '@/lib/pos/mutation-access':guardsModule,
 '@/lib/pos/server':{
  PosApiError:ApiError,getBrandSlugFromUrl:r=>new URL(r.url).searchParams.get('brandSlug'),
  ok:data=>Response.json({ok:true,...data}),handlePosError:e=>Response.json({ok:false,error:e.message},{status:e.status??500}),
  uuidValue:(s)=>{if(typeof s!=='string'||! /^[0-9a-f-]{36}$/i.test(s))throw new ApiError(400,'POS_VALIDATION_ERROR','UUID required');return s;},
 },
});
const request = (mode='inspect', options={}) => {
 const form=new FormData();form.set('mode',mode);form.set('kind',options.kind??'products');
 form.set('file',new File([options.csv??'Código,Descripción,Precio,Costo\n0001,SINTETICO,120,50\n'],'SINTETICO.csv'));
 form.set('mapping',JSON.stringify(options.mapping??{code:0,name:1,price:2,cost:3}));
 form.set('decisions',JSON.stringify(options.decisions??{'2':'create'}));
 form.set('requestKey','22222222-2222-4222-8222-222222222222');form.set('token','synthetic-token');
 if(options.location)form.set('locationId',options.location);
 return new Request(`http://localhost/api/pos/imports?brandSlug=${options.brand??'synthetic-brand'}`,{method:'POST',body:form});
};
denied=401;assert.equal((await route.POST(request())).status,401);assert.equal(calls.length,0);
denied=403;assert.equal((await route.POST(request())).status,403);assert.equal(calls.length,0);
denied=0;assert.equal((await route.POST(request('inspect',{brand:'other-brand'}))).status,403);
const inspect=await route.POST(request());assert.equal(inspect.status,200);assert.equal(calls.length,0);
assert.equal((await inspect.json()).mapping.code,0);
const ansi = await route.POST(request('inspect',{csv:Buffer.from('Código;Descripción;Precio;Costo\r\n0002;SINTÉTICO;10;5\r\n','latin1')}));
assert.equal(ansi.status,200);assert.equal((await ansi.json()).mapping.code,0,'Windows CSV accents and delimiter');
const preview=await route.POST(request('preview'));assert.equal(preview.status,200);
assert.equal(calls.at(-1).args.p_rows[0].values.code,'0001');assert.equal(calls.at(-1).args.p_rows[0].values.price,120);
await route.POST(request('preview',{csv:'Código,Descripción,Precio,Costo\n0001,SINTETICO,,\n'}));
assert.equal(calls.at(-1).args.p_rows[0].values.price,undefined);assert.equal(calls.at(-1).args.p_rows[0].values.cost,undefined);
assert.ok(guards.some(g=>g.operation==='settings.manage'));assert.ok(guards.some(g=>g.operation==='products.write'));
const before=calls.length;
assert.equal((await route.POST(request('apply',{csv:'Código,Descripción,Precio,Costo\n0001,SINTETICO,-1,50'}))).status,400);
assert.equal((await route.POST(request('apply',{decisions:{}}))).status,400);
assert.equal((await route.POST(request('preview',{mapping:{code:0,name:0}}))).status,400);
assert.equal((await route.POST(request('preview',{kind:'inventory'}))).status,400);
assert.equal(calls.length,before,'invalid input never reaches mutation RPC');
assert.equal((await route.POST(request('apply'))).status,200);assert.equal(calls.at(-1).args.p_mode,'apply');
rpcError={code:'PGRST202',message:'missing migration'};
assert.equal((await route.POST(request('preview'))).status,503);
rpcError={code:'40001',message:'POS_IMPORT_CONFLICT'};
assert.equal((await route.POST(request('apply'))).status,409);
rpcError={message:'POS_IMPORT_ALREADY_APPLIED'};
assert.equal((await route.POST(request('apply'))).status,409);
console.log('PASS actual API module: unauthenticated/unauthorized/foreign-brand guard invocation, inspect, preview code preservation, invalid inputs blocked before RPC, required decisions, migration unavailable and conflict responses. Auth/RPC simulated; NO persistence claim.');
