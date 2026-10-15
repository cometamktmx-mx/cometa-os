import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

import * as integers from '../src/lib/comu/pricing-integers.mjs';

class PosApiError extends Error { constructor(status,code,message){super(message);Object.assign(this,{status,code});} }
function load(path,imports,globals={},extra='') {
  const context={exports:{},URL,console,Error,crypto,File,FormData, ...globals,require(name){assert.ok(Object.hasOwn(imports,name),'Unexpected import '+name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);return context.exports;
}
const sid=crypto.randomUUID(),foreign=crypto.randomUUID(); let allowed=true,calls=0,rpcError=null,lastRpc;
let admin;
const access={requireSellerAccess:async id=>{if(!allowed||id!==sid)throw new PosApiError(403,'COMU_CATALOG_DENIED','Denied');return {admin};}};
const auth={rpc:async(name,args)=>{calls++;lastRpc={name,args};return {data:rpcError?null:{ok:true,productId:'canonical-id'},error:rpcError?{message:rpcError}:null};}};
const catalog=load('src/lib/comu/seller-catalog.ts',{'@/lib/pos/product-variants':load('src/lib/pos/product-variants.ts',{}),'@/lib/supabase/server':{createClient:async()=>auth},'@/lib/pos/server':{PosApiError},'./seller-access':access});
const command={sellerId:sid,requestId:crypto.randomUUID(),product:{name:'New product',variants:[{name:'M',price:100,attributes:{size:'M'}}]}};
assert.equal((await catalog.saveSellerCatalog(command)).productId,'canonical-id');assert.equal(lastRpc.name,'comu_catalog_save_v1');assert.equal(lastRpc.args.p_request,command.requestId);
assert.equal(Object.hasOwn(lastRpc.args,'actorId'),false);
await catalog.readSellerCatalog(sid);assert.equal(lastRpc.name,'comu_catalog_read_v1');
for(const bad of [null,[],{}, {...command,requestId:'bad'}, {...command,product:[]}])assert.throws(()=>catalog.validateCatalogCommand(bad));
const before=calls;allowed=false;await assert.rejects(catalog.saveSellerCatalog(command),e=>e.status===403);assert.equal(calls,before);allowed=true;
await assert.rejects(catalog.saveSellerCatalog({...command,sellerId:foreign}),e=>e.status===403);
for(const [error,status] of [['COMU_STOCK_RESERVED',409],['COMU_CATALOG_STALE',409],['COMU_CATALOG_DENIED',403],['private database detail',400]]){rpcError=error;await assert.rejects(catalog.saveSellerCatalog(command),e=>e.status===status&&!e.message.includes('private database detail'));}rpcError=null;
const NextResponse={json:(body,options={})=>({body,status:options.status||200,headers:options.headers})};
const route=load('src/app/api/comu/seller/catalog/route.ts',{'next/server':{NextResponse},'@/lib/comu/features':{requireComuFeature(){}},'@/lib/comu/seller-catalog':catalog});
assert.equal((await route.POST({json:async()=>command})).status,200);assert.equal((await route.GET({url:'https://local.test/api?sellerId='+sid})).headers['Cache-Control'],'private, no-store');
allowed=false;assert.equal((await route.POST({json:async()=>command})).status,403);allowed=true;

// Real media route with instrumented storage: ownership must precede every mutation.
let mediaOwner=sid,stored=0,removed=0;const listingId=crypto.randomUUID(),mediaId=crypto.randomUUID();
admin={storage:{from(){return {upload:async()=>{stored++;return {error:null};},remove:async()=>{removed++;return {error:null};},getPublicUrl:path=>({data:{publicUrl:'https://local.test/storage/v1/object/public/comu-products/'+path}})};}},from(table){const filters={};let payload;const q={select(){return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},insert(v){payload=v;return q;},update(){return q;},delete(){return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);},async single(){return {data:payload,error:null};},async maybeSingle(){if(table==='comu_product_listings')return {data:filters.seller_id===mediaOwner?{id:listingId,seller_id:mediaOwner}:null,error:null};if(table==='comu_product_media')return {data:{id:mediaId,listing_id:listingId,storage_path:`comu/${mediaOwner}/${listingId}/file.png`,comu_product_listings:{seller_id:mediaOwner}},error:null};throw Error(table);}};return q;}};
const media=load('src/app/api/comu/media/route.ts',{'node:crypto':crypto,'next/server':{NextResponse},'@/lib/pos/server':{PosApiError,getAdminClient:()=>admin},'@/lib/comu/seller-access':access,'@/lib/comu/features':{requireComuFeature(){}}});
const form=new FormData();form.set('sellerId',sid);form.set('listingId',listingId);form.set('file',new File(['fixture'],'fixture.png',{type:'image/png'}));
assert.equal((await media.POST({formData:async()=>form})).status,201);assert.equal(stored,1);
mediaOwner=foreign;assert.equal((await media.POST({formData:async()=>form})).status,404);assert.equal(stored,1);
assert.equal((await media.DELETE({json:async()=>({sellerId:sid,mediaId})})).status,404);assert.equal(removed,0);
assert.equal((await media.PATCH({json:async()=>({sellerId:sid,mediaId,isPrimary:true})})).status,404);
mediaOwner=sid;assert.equal((await media.DELETE({json:async()=>({sellerId:sid,mediaId})})).status,200);assert.equal(removed,1);

// POS surface and mutation API still use the existing tenant gate, not COMU membership.
const pos=load('src/lib/pos/access.ts',{'server-only':{},'@/lib/pos/server':{PosApiError,assertDatabaseResult(){},requirePosContext:async()=>{throw new PosApiError(403,'POS_BRAND_ACCESS_DENIED','Denied');}},'@/lib/pos/entitlements':{},'@/lib/pos/lifecycle':{}});
await assert.rejects(pos.requirePosSurfaceAccess('comu-only'),e=>e.status===403);
await assert.rejects(pos.requirePosOperationalAccess({brandSlug:'comu-only',entitlement:'pos.inventory'}),e=>e.status===403);

// V3B tests the actual staged editor.
await import('./test-comu-product-editor-v3b.mjs');

// Existing wholesale contract and actual pricing implementation, no new pricing rules.
const productId=crypto.randomUUID(),storefrontId=crypto.randomUUID();let custom;
const wholesaleRows={comu_product_listings:[{id:listingId,product_id:productId,seller_id:sid,storefront_id:storefrontId,comu_sellers:{brand_id:'brand'}}],pos_products:[{id:productId,brand_id:'brand'}],comu_storefront_wholesale_policies:[],comu_wholesale_tiers:[],comu_product_wholesale_overrides:[]};
const wholesaleAdmin={from(table){const q={select(){return q;},eq(){return q;},in(){return q;},delete(){wholesaleRows[table]=[];return q;},insert(rows){wholesaleRows[table]=rows;return q;},upsert(row){custom=row;wholesaleRows[table]=[row];return q;},async single(){return {data:custom,error:null};},async maybeSingle(){return {data:wholesaleRows[table]?.[0]||null,error:null};},then(resolve){return Promise.resolve({data:wholesaleRows[table]||[],error:null}).then(resolve);}};return q;}};
const wholesale=load('src/app/api/comu/wholesale/product/route.ts',{'next/server':{NextResponse},'@/lib/comu/features':{requireComuFeature(){}},'@/lib/comu/seller-access':{requireSellerAccess:async id=>{await access.requireSellerAccess(id);return {admin:wholesaleAdmin};}}});
assert.equal((await wholesale.PUT({json:async()=>({sellerId:sid,listingId,mode:'CUSTOM',tiers:[{minQuantity:6,pricingMode:'UNIT_PRICE',value:80}]})})).status,200);
const money=load('src/lib/comu/pricing-money.ts',{'@/lib/pos/server':{PosApiError},'./pricing-integers.mjs':integers});
const pricing=load('src/lib/comu/cart.ts',{'@/lib/pos/server':{PosApiError},'./buyers':{},'./pricing-money':money},{},'\nexport { calculateCartPricing };');
let priced=await pricing.calculateCartPricing(wholesaleAdmin,[{id:'item',listing_id:listingId,effective_price:100,quantity:1}]);assert.equal(priced.lines[0].unitPrice,100);assert.equal(priced.lines[0].mode,'RETAIL');
priced=await pricing.calculateCartPricing(wholesaleAdmin,[{id:'item',listing_id:listingId,effective_price:100,quantity:6}]);assert.equal(priced.lines[0].unitPrice,80);assert.equal(priced.lines[0].mode,'WHOLESALE_MIX');
console.log('PASS C2 Node: authenticated RPC, validation/errors/no-store, cross-seller, media ownership/mutations, unchanged POS gates, real editor submit/retry, existing wholesale API and retail/wholesale pricing.');
