// LOCAL HTTP integration using existing Auth fixtures; no schema changes or remote access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const fixture=JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json','utf8'));
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const root='http://localhost:3000',sessions={};
for(const key of ['a','admin']){const jar=new Map();const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(r=>jar.set(r.name,r.value))}});assert.equal((await auth.auth.signInWithPassword(fixture.users[key])).error,null);sessions[key]=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');}
async function request(key,route,method='GET',body){const response=await fetch(root+route,{method,headers:{Cookie:sessions[key],...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return {status:response.status,data:await response.json()};}

const state=JSON.parse(fs.readFileSync('.env.comu-v3b-final-fixture.json','utf8'));
const response=await request('admin','/api/pos/products?brandSlug='+state.brandSlug);
console.log('Admin POS existing gate',response.status,response.data.code||response.data.error||'OK');
const subs=await admin.from('pos_subscriptions').select('plan_code,status').eq('brand_slug',state.brandSlug);console.log('Existing local POS subscription',subs.data);
const profile=await admin.from('user_profiles').select('role,status').eq('user_id',fixture.users.admin.id).single();console.log('Existing admin role',profile.data);

const product=await admin.from('pos_products').select('id,name,product_code').eq('id',state.productId).single();assert.equal(product.error,null);assert.equal(product.data.product_code,state.code);
const variants=await admin.from('pos_product_variants').select('id,sku,attributes,barcode').eq('product_id',state.productId);assert.equal(variants.error,null);assert.equal(variants.data.length,12);
assert.deepEqual(variants.data.map(v=>({...v,barcode:v.barcode??null})).sort((a,b)=>a.id.localeCompare(b.id)),state.identities);
const update=await request('admin','/api/pos/products','PATCH',{brandSlug:state.brandSlug,action:'update_product',productId:state.productId,name:product.data.name,variants:[]});assert.equal(update.status,503);assert.equal(update.data.code,'POS_DEVICE_LOOKUP_FAILED');
fs.writeFileSync('docs/visual-evidence/comu-product-editor-v3b/final-certification/pos-http-blocker.json',JSON.stringify({canonicalRead:'PASS',variantCount:12,adminRole:profile.data.role,get:{status:response.status,code:response.data.code},patch:{status:update.status,code:update.data.code},subscriptionCount:subs.data.length,roundTrip:'BLOCKED',noPOSWriteExecuted:true},null,2));
console.log('PASS canonical shared POS product/12 variants IDs/SKU/attributes. BLOCKED POS API GET/PATCH by device foundation; no bypass or POS write.');

// Real non-zero stock adjustment, idempotent retry and stale expectedQuantity rejection.
const sellerId=fixture.users.a.sellerId;
const read=async()=>{const r=await request('a','/api/comu/seller/catalog?sellerId='+sellerId);assert.equal(r.status,200);return r.data;};
let snapshot=await read();const target=snapshot.variants.find(v=>v.sku===state.code+'-MANUAL');const initial=snapshot.inventory.find(i=>i.variant_id===target.id);const quantity=Number(initial.quantity),reserved=Number(initial.reserved_quantity);
function stockCommand(s,amount,expected){const p=s.products.find(p=>p.id===state.productId);const v=s.variants.find(v=>v.id===target.id);return {sellerId,requestId:crypto.randomUUID(),product:{id:p.id,expectedUpdatedAt:p.updated_at,name:p.name,description:p.description,categoryId:p.category_id,variants:[{id:v.id,name:v.name,sku:v.sku,attributes:v.attributes,price:v.price,active:v.active,stock:[{locationId:initial.location_id,quantity:amount,expectedQuantity:expected}]}]}};}
const change=stockCommand(snapshot,quantity+1,quantity);assert.equal((await request('a','/api/comu/seller/catalog','POST',change)).status,200);assert.equal((await request('a','/api/comu/seller/catalog','POST',change)).status,200);snapshot=await read();let inventory=snapshot.inventory.find(i=>i.variant_id===target.id);assert.equal(Number(inventory.quantity),quantity+1);assert.equal(Number(inventory.reserved_quantity),reserved);
const stale=stockCommand(snapshot,quantity+2,quantity);assert.equal((await request('a','/api/comu/seller/catalog','POST',stale)).status,409);
const restore=stockCommand(await read(),quantity,quantity+1);assert.equal((await request('a','/api/comu/seller/catalog','POST',restore)).status,200);snapshot=await read();inventory=snapshot.inventory.find(i=>i.variant_id===target.id);assert.equal(Number(inventory.quantity),quantity);assert.equal(Number(inventory.reserved_quantity),reserved);
fs.writeFileSync('docs/visual-evidence/comu-product-editor-v3b/final-certification/stock-http-results.json',JSON.stringify({status:'PASS',quantityBefore:quantity,quantityAfter:quantity+1,quantityAfterRetry:quantity+1,restored:quantity,reserved,availableAfter:quantity+1-reserved,staleExpectedQuantityStatus:409},null,2));
console.log('PASS real stock HTTP: nonzero adjustment, retry once, stale expectedQuantity denied, reservations unchanged, original quantity restored.');
