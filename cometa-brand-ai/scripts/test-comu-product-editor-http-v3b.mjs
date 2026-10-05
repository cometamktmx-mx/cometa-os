// LOCAL HTTP integration using existing Auth fixtures; no schema changes or remote access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const fixture=JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json','utf8'));
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const root='http://localhost:3000',sessions={};
for(const key of ['a','b']){const jar=new Map();const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(r=>jar.set(r.name,r.value))}});assert.equal((await auth.auth.signInWithPassword(fixture.users[key])).error,null);sessions[key]=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');}
async function request(key,route,method='GET',body){const response=await fetch(root+route,{method,headers:{Cookie:sessions[key],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
const sellerId=fixture.users.a.sellerId;
const before=await request('a',`/api/comu/seller/catalog?sellerId=${sellerId}`);assert.equal(before.status,200);
console.log('LOCAL ONLY http://127.0.0.1:54321; V3A exposed:',before.data.variantContract?.version||'NOT INSTALLED');
const token=randomUUID().slice(0,8),name='LOCAL TEST V3B '+token;
const command={sellerId,requestId:randomUUID(),product:{name,description:'Removable LOCAL TEST V3B HTTP fixture',productCode:'V3B-'+token.toUpperCase(),variants:[{name:'Unique',sku:'V3B-'+token.toUpperCase(),price:199,attributes:{},stock:[{locationId:before.data.locations[0]?.id||null,quantity:5,expectedQuantity:0}]}]}};
const created=await request('a','/api/comu/seller/catalog','POST',command);assert.equal(created.status,200,created.data.error);const {productId,listingId}=created.data;assert.ok(productId&&listingId);
fs.writeFileSync('.env.comu-v3b-test-artifact.json',JSON.stringify({localOnly:true,name,sellerId,productId,listingId},null,2));
const retry=await request('a','/api/comu/seller/catalog','POST',command);assert.equal(retry.data.productId,productId);
const read=await request('a',`/api/comu/seller/catalog?sellerId=${sellerId}`);const product=read.data.products.find(p=>p.id===productId),variant=read.data.variants.find(v=>v.product_id===productId),stock=read.data.inventory.find(i=>i.variant_id===variant.id);assert.equal(read.data.listings.find(l=>l.id===listingId).status,'DRAFT');assert.equal(Number(stock.quantity),5);
const edit={sellerId,requestId:randomUUID(),product:{...command.product,id:productId,expectedUpdatedAt:product.updated_at,description:'Edited through real C2 HTTP',variants:[{...command.product.variants[0],id:variant.id,stock:[{locationId:stock.location_id,quantity:7,expectedQuantity:5}]}]}};
assert.equal((await request('a','/api/comu/seller/catalog','POST',edit)).status,200);assert.equal((await request('a','/api/comu/seller/catalog','POST',edit)).status,200);
const form=new FormData();form.set('sellerId',sellerId);form.set('listingId',listingId);form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64')],'local-v3b.png',{type:'image/png'}));
const upload=await request('a','/api/comu/media','POST',form);assert.equal(upload.status,201);assert.ok(upload.data.media.id);const image=await fetch(upload.data.media.public_url);assert.equal(image.status,200);assert.ok((await image.arrayBuffer()).byteLength>0);
const denied=await request('b','/api/comu/media','DELETE',{sellerId:fixture.users.b.sellerId,mediaId:upload.data.media.id});assert.ok([403,404].includes(denied.status));
const wholesale={sellerId,listingId,mode:'CUSTOM',allowVariantMix:true,tiers:[{minQuantity:6,pricingMode:'UNIT_PRICE',value:179}]};assert.equal((await request('a','/api/comu/wholesale/product','PUT',wholesale)).status,200);const w=await request('a',`/api/comu/wholesale/product?sellerId=${sellerId}&listingId=${listingId}`);assert.equal(w.data.override.mode,'CUSTOM');assert.equal(Number(w.data.tiers[0].value),179);
assert.equal((await request('a','/api/comu/listings','PATCH',{sellerId,listingId,status:'PUBLISHED'})).status,200);
const final=await request('a',`/api/comu/seller/catalog?sellerId=${sellerId}`);assert.equal(final.data.listings.find(l=>l.id===listingId).status,'PUBLISHED');assert.equal(final.data.variants.find(v=>v.id===variant.id).sku,command.product.variants[0].sku);assert.equal(Number(final.data.inventory.find(i=>i.variant_id===variant.id).quantity),7);assert.equal(Number(final.data.inventory.find(i=>i.variant_id===variant.id).reserved_quantity),Number(stock.reserved_quantity));
const canonical=await admin.from('pos_product_variants').select('id,product_id,sku,attributes').eq('id',variant.id).single();assert.equal(canonical.error,null);assert.equal(canonical.data.product_id,productId);assert.equal(canonical.data.sku,variant.sku);
const cross=await request('b','/api/comu/seller/catalog','POST',{...edit,sellerId:fixture.users.b.sellerId,requestId:randomUUID()});assert.ok([400,403,404].includes(cross.status));
// Restore the removable test artifact to draft; retain it for manual editor review.
assert.equal((await request('a','/api/comu/listings','PATCH',{sellerId,listingId,status:'DRAFT'})).status,200);
console.log('PASS real HTTP: Auth, create/draft/edit/retry, stock 5->7 once, real Storage/public bytes/cross-seller denied, wholesale persistence, publish verification, same canonical POS IDs/SKU. Retained LOCAL TEST V3B fixture as DRAFT.');
console.log('V3A generation/retirement via main HTTP:',final.data.variantContract?'AVAILABLE':'BLOCKED: existing migration not installed; not applied by this test.');
