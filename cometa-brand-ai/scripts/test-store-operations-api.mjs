// Real parsers/handler; authentication and transport are simulated, no network.
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),load=(file,deps={})=>{const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,URL,Response,Request,process:{env:{}},require:n=>deps[n]??require(n)});return m.exports;};
const product=load('packages/own-storefront/product-contract.ts'),contract=load('packages/own-storefront/operations-contract.ts',{'./product-contract':product});
const id='11111111-1111-4111-8111-111111111111',doc={...contract.emptyStoreSettings(),name:'Fixture',locationId:id};
assert.equal(contract.parseStoreSettings(doc).name,'Fixture');
for(const bad of [{...doc,locationId:'bad'},{...doc,secret:'bad'},{...doc,recipients:['bad']},{...doc,payments:{stripe:false,whatsapp:true}},{...doc,shipping:{...doc.shipping,enabled:true,postalPrefixes:[]}},{...doc,tiers:[{productId:'',minQuantity:2,mode:'PERCENT_OFF',value:100}]}])assert.throws(()=>contract.parseStoreSettings(bad));
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
let denied=0,calls=0,error=null,lastRpc='';const guard=async({brandSlug})=>{if(denied)throw new ApiError(denied,'DENIED','Denied');if(brandSlug!=='fixture')throw new ApiError(403,'DENIED','Foreign');return {user:{userId:id,isAdmin:true},brand:{id,slug:'fixture'},admin:{rpc:async(name)=>{lastRpc=name;calls++;return {data:{revision:1},error};}}};};
const route=load('src/app/api/pos/online-store/operations/route.ts',{'@/lib/pos/order-presentation':{presentOrderItems:async(c,items)=>items},'@/lib/pos/access':{requirePosOperationalAccess:guard},'@/lib/pos/mutation-access':{requirePosMutationAccess:guard},'@/lib/pos/product-web':{assertWebAdministrator:()=>{}},'@/lib/pos/staff-server':{getPosMode:async()=>'RETAIL'},'@/lib/pos/server':{PosApiError:ApiError,getBrandSlugFromUrl:r=>new URL(r.url).searchParams.get('brandSlug'),uuidValue:v=>{if(!product.uuidPattern.test(v))throw new ApiError(400,'INVALID','UUID');return v;},handlePosError:e=>Response.json({error:e.message},{status:e.status??500})},'../../../../../../packages/own-storefront/operations-contract':contract});
const post=(body,brand='fixture')=>route.POST(new Request('http://local/api?brandSlug='+brand,{method:'POST',body:JSON.stringify(body)}));
for(const status of [401,403]){denied=status;assert.equal((await post({})).status,status);}denied=0;assert.equal((await post({},'foreign')).status,403);assert.equal(calls,0);
for(const body of [{action:'settings',document:doc,revision:-1},{action:'settings',document:{...doc,locationId:'x'},revision:0},{action:'SHIP',order:id,revision:0,tracking:3},{action:'PAID',order:id,revision:0}])assert.equal((await post(body)).status,400);
assert.equal(calls,0);assert.equal((await post({action:'settings',document:doc,revision:0})).status,200);
const stripeMissing=await post({action:'settings',document:{...doc,payments:{stripe:true,whatsapp:false}},revision:1});assert.equal(stripeMissing.status,409);assert.equal(calls,1);
error={message:'POS_WEB_CONFLICT'};assert.equal((await post({action:'CANCEL',order:id,revision:0})).status,409);
error={message:'PRIVATE_DATABASE_DETAIL'};const failure=await post({action:'CANCEL',order:id,revision:0});assert.equal(failure.status,503);assert.equal((await failure.text()).includes('PRIVATE_DATABASE_DETAIL'),false);
error=null;
for(const status of [401,403]){denied=status;assert.equal((await route.GET(new Request('http://local/api?brandSlug=fixture&view=notifications&includeRead=1'))).status,status);}denied=0;
assert.equal((await route.GET(new Request('http://local/api?brandSlug=foreign&view=notifications&includeRead=1'))).status,403);
assert.equal((await route.GET(new Request('http://local/api?brandSlug=fixture&view=notifications&includeRead=1'))).status,200);assert.equal(lastRpc,'store_notification_history_m8');
assert.equal((await route.GET(new Request('http://local/api?brandSlug=fixture&view=notifications'))).status,200);assert.equal(lastRpc,'store_notification_list_m7');
console.log('PASS operations parser/actual API: auth, foreign brand, bounded settings, invalid actions, missing Stripe test, conflict and safe errors. Auth/transport simulated.');
