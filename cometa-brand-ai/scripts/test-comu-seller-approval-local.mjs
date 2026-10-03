import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

class PosApiError extends Error { constructor(status,code,message) { super(message); Object.assign(this,{status,code}); } }
function load(path, imports, globals = {}) {
  const context = { exports: {}, URL, console, process: { env: {} }, ...globals, require(name) {
    assert.ok(Object.hasOwn(imports,name),'Unexpected import '+name); return imports[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  return context.exports;
}
let user='seller-a', isAdmin=false, suspended=false, origin='C1', approved=true;
let rpcCalls=0, lastRpc;
const admin = { from(table) {
  const filters={};
  const query={select(){return query;},eq(key,value){filters[key]=value;return query;},async maybeSingle(){
    if(table==='user_profiles')return {data:{role:isAdmin?'admin':'client',status:'active'},error:null};
    if(table==='comu_seller_memberships')return {data:filters.seller_id==='seller-a'&&filters.user_id==='seller-a'?{role:'OWNER'}:null,error:null};
    if(table==='comu_sellers')return {data:{status:suspended?'SUSPENDED':'PREPARING',verification_status:'VERIFIED',approval_origin:origin,approval_application_id:'app-a'},error:null};
    if(table==='comu_seller_applications')return {data:approved?{id:'app-a'}:null,error:null};
    throw new Error('Unexpected table '+table);
  }};return query;
} };
const auth = {auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:null})},rpc:async(name,args)=>{rpcCalls++;lastRpc={name,args};return {data:{ok:true,status:'APPROVED',seller_id:'seller-a'},error:null};}};
const access=load('src/lib/comu/seller-access.ts',{'@/lib/supabase/server':{createClient:async()=>auth},'@/lib/pos/server':{getAdminClient:()=>admin,PosApiError}});
assert.equal((await access.requireSellerAccess('seller-a',['OWNER'])).role,'OWNER');
await assert.rejects(access.requireSellerAccess('seller-b'),e=>e.status===403);
approved=false; await assert.rejects(access.requireSellerAccess('seller-a'),e=>e.status===403); approved=true;
suspended=true; await assert.rejects(access.requireSellerAccess('seller-a'),e=>e.status===403);
origin='LEGACY'; assert.equal((await access.requireSellerAccess('seller-a')).role,'OWNER');
origin='C1'; suspended=false;
user='buyer'; await assert.rejects(access.requireSellerAccess('seller-a'),e=>e.status===403);
user=null; await assert.rejects(access.requireSellerAccess('seller-a'),e=>e.status===401); user='seller-a';
const approval=load('src/lib/comu/seller-approval.ts',{'@/lib/supabase/server':{createClient:async()=>auth},'@/lib/pos/server':{PosApiError},'./seller-access':access});
const id='00000000-0000-4000-8000-000000000001';
await assert.rejects(approval.reviewSellerApplication({applicationId:id,decision:'APPROVED'}),e=>e.status===403);
assert.equal(rpcCalls,0); isAdmin=true;user='admin';
for(const body of [null,[],{}, {applicationId:id,decision:'ACTIVE'},{applicationId:id,decision:'APPROVED',brandId:'wrong'},{applicationId:id,decision:'APPROVED',note:'x'.repeat(2001)}])await assert.rejects(approval.reviewSellerApplication(body),e=>e.status===400);
await approval.reviewSellerApplication({applicationId:id,decision:'APPROVED'});
assert.equal(lastRpc.name,'comu_review_seller_application_v1'); assert.equal(lastRpc.args.p_brand_id,null);
assert.equal(Object.hasOwn(lastRpc.args,'p_user_id'),false); assert.equal(Object.hasOwn(lastRpc.args,'p_actor_id'),false);
const activation=load('src/lib/comu/seller-activation.ts',{'@/lib/supabase/server':{createClient:async()=>auth},'@/lib/pos/server':{PosApiError},'./seller-approval':approval});
await assert.rejects(activation.changeSellerCommercialState(id,'verify'),e=>e.status===400);
await activation.changeSellerCommercialState(id,'activate'); assert.equal(lastRpc.name,'comu_admin_seller_state_v1');
isAdmin=false; await assert.rejects(activation.changeSellerCommercialState(id,'activate'),e=>e.status===403);
const onboarding=fs.readFileSync('src/lib/comu/onboarding.ts','utf8');
assert.doesNotMatch(onboarding,/status:\s*"ACTIVE"|verification_status:\s*"VERIFIED"|from\("comu_seller_memberships"\)\.upsert/);
assert.match(onboarding,/requireSellerAccess\(current.id/);
const sql=fs.readFileSync('supabase/migrations/20261003130000_comu_seller_approval_v1.sql','utf8');
assert.doesNotMatch(sql,/(?:insert into|update|alter table|grant .* on) public\.pos_/i);
assert.doesNotMatch(sql,/insert into public\.user_brand_access/i);
assert.doesNotMatch(sql,/pos_create_self_service_business/i);
assert.match(sql,/created_by\) values\(identifier.*actor\)/);
const sellerRoutes=fs.readFileSync('src/app/api/comu/sellers/route.ts','utf8');
assert.doesNotMatch(sellerRoutes,/\.insert\(|verification_status:\s*"VERIFIED"/);
// The preparation UI can mark an existing draft ready without inserting duplicates.
for (const existing of [false,true]) {
  const calls=[];
  const seller={id:'seller-a',brand_slug:'brand-a',status:'PREPARING',verification_status:'VERIFIED',comu_storefronts:[{id:'store-a'}]};
  const states=[[seller],'seller-a',[],existing?[{id:'listing-a',product_id:'product-a',status:'DRAFT'}]:[],''];
  const dashboard=load('src/app/comu/seller/seller-dashboard.tsx',{
    'react/jsx-runtime':jsx,'next/link':{default:()=>null},
    react:{useState:()=>[states.shift(),()=>{}],useRef:value=>({current:value}),useEffect:()=>{},useCallback:fn=>fn},
    './connect-settings-actions':{},'./storefront-editor':{default:()=>null},'./wholesale-manager':{default:()=>null},'./shipping-settings':{default:()=>null},'./products-manager':{default:()=>null},
  },{fetch:async(url,options={})=>{
    calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
    return {ok:true,json:async()=>url.includes('/sellers?')?{sellers:[seller]}:url.includes('/catalog?')?{products:[],existing:[]}:{ok:true,listing:{id:'listing-a'}}};
  }});
  const tree=dashboard.default({brandSlug:'brand-a',view:'products',basePath:'/comu/seller/brand-a'});
  await tree.props.children.find(child=>child.props?.publish).props.publish('product-a');
  assert.equal(calls.filter(call=>call.method==='POST').length,existing?0:1);
  assert.ok(calls.some(call=>call.method==='PATCH'&&call.body.listingId==='listing-a'&&call.body.status==='PUBLISHED'));
  assert.ok(calls.every(call=>call.url.startsWith('/api/comu/')));
}
console.log('PASS Node C1: seller/brand authorization, buyer/admin boundaries, revoked approval, legacy compatibility, input validation, authenticated RPC identity, no onboarding bypass, canonical activation, no POS provisioning. External calls: 0.');
