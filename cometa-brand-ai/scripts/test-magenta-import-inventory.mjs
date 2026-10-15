// Authorized test backend only. Default: read-only preview plus rejected reproduction.
// --apply exercises the requested synthetic stock import; never creates products.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
const dir=path.resolve('.next/magenta-functional/ephmrsjnpkcgddulvckj');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
const env=read('environment'),access=read('access'),origins=read('origins');
assert.equal(env.projectRef,'ephmrsjnpkcgddulvckj');assert.equal(env.url,'https://ephmrsjnpkcgddulvckj.supabase.co');
assert.equal(origins.admin,'https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app');
const db=createClient(env.url,env.service,{auth:{persistSession:false,autoRefreshToken:false}}),jar=new Map();
const auth=createServerClient(env.url,env.anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(c=>jar.set(c.name,c.value))}});
assert.equal((await auth.auth.signInWithPassword({email:access.email,password:access.password})).error,null);
const headers={origin:origins.admin,'x-vercel-protection-bypass':read('admin-automation').secret,cookie:[...jar].map(([n,v])=>n+'='+v).join('; ')};
const route='/api/pos/imports?brandSlug=magenta-preview';
const locations=await (await fetch(origins.admin+'/api/pos/locations?brandSlug=magenta-preview',{headers})).json();
assert.equal(locations.locations.length,1);const location=locations.locations[0].id;
const contents=fs.readFileSync('public/examples/eleventa/SINTETICO-inventario.csv','utf8');
async function request(mode,{bytes=contents,mapping={},token='',decisions={},key=''}={}) {
 const form=new FormData();for(const [k,v] of Object.entries({kind:'inventory',mode,locationId:location,headerRow:'1',mapping:JSON.stringify(mapping),token,decisions:JSON.stringify(decisions),requestKey:key}))form.set(k,v);
 form.set('file',new File([bytes],'SINTETICO-inventario.csv',{type:'text/csv'}));
 const response=await fetch(origins.admin+route,{method:'POST',headers,body:form});return {status:response.status,data:await response.json()};
}
async function snapshot(){const result={};for(const table of ['pos_products','pos_product_variants','pos_inventory']){const q=await db.from(table).select('*').eq('brand_slug','magenta-preview').order('id');assert.equal(q.error,null);result[table]=q.data;}return result;}
const before=await snapshot(),inspect=await request('inspect');assert.equal(inspect.status,200);
assert.deepEqual(Object.keys(inspect.data.mapping).sort(),['code','quantity']);
const preview=await request('preview',{mapping:inspect.data.mapping});assert.equal(preview.status,200);
const rows=preview.data.preview.rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.matches.length===1&&r.errors.length===0));
assert.ok(rows.every(r=>Object.keys(r.values).sort().join(',')==='code,quantity'));
console.log(JSON.stringify({preview:preview.status,rows:rows.map(r=>({code:r.values.code,quantity:r.values.quantity,matches:r.matches.length,inventoryExists:r.inventoryExists,errors:r.errors})),productFieldsRequired:false}));
const proof={preview:preview.status,inventoryBefore:rows.map(r=>r.inventoryExists),productionTouched:false};
if(rows.every(r=>!r.inventoryExists)){
 const wrong=await request('apply',{mapping:inspect.data.mapping,token:preview.data.preview.token,decisions:Object.fromEntries(rows.map(r=>[r.rowNumber,'update'])),key:randomUUID()});
 assert.equal(wrong.status,409);assert.deepEqual(await snapshot(),before);proof.reproduced={status:wrong.status,error:wrong.data.error};console.log(JSON.stringify(proof.reproduced));
}
if(process.argv.includes('--apply')){
 const options={mapping:inspect.data.mapping,token:preview.data.preview.token,decisions:Object.fromEntries(rows.map(r=>[r.rowNumber,r.inventoryExists?'update':'create'])),key:randomUUID()};
 const applied=await request('apply',options);assert.equal(applied.status,200,JSON.stringify(applied.data));
 const after=await snapshot();assert.deepEqual(after.pos_products,before.pos_products);assert.deepEqual(after.pos_product_variants,before.pos_product_variants);
 for(const row of rows){const records=after.pos_inventory.filter(i=>i.variant_id===row.matches[0]&&i.location_id===location);assert.equal(records.length,1);assert.equal(Number(records[0].quantity),row.values.quantity);}
 const retries=await Promise.all([request('apply',options),request('apply',options)]);for(const retry of retries){assert.equal(retry.status,200);assert.equal(retry.data.result.id,applied.data.result.id);}
 assert.deepEqual(await snapshot(),after);
 const next=await request('preview',{mapping:inspect.data.mapping});assert.ok(next.data.preview.rows.every(r=>r.inventoryExists));
 const duplicate=await request('apply',{...options,token:next.data.preview.token,key:randomUUID(),decisions:Object.fromEntries(rows.map(r=>[r.rowNumber,'update']))});assert.equal(duplicate.status,409);assert.deepEqual(await snapshot(),after);
 // A new export with identical quantities must replace, never add stock.
 const newBytes=contents+'\n',newPreview=await request('preview',{bytes:newBytes,mapping:inspect.data.mapping});assert.equal(newPreview.status,200);
 const replacement=await request('apply',{bytes:newBytes,mapping:inspect.data.mapping,token:newPreview.data.preview.token,key:randomUUID(),decisions:Object.fromEntries(rows.map(r=>[r.rowNumber,'update']))});assert.equal(replacement.status,200);
 const replaced=await snapshot();assert.deepEqual(replaced.pos_products,before.pos_products);assert.deepEqual(replaced.pos_product_variants,before.pos_product_variants);
 assert.equal(replaced.pos_inventory.length,after.pos_inventory.length);
 for(const row of rows){const records=replaced.pos_inventory.filter(i=>i.variant_id===row.matches[0]&&i.location_id===location);assert.equal(records.length,1);assert.equal(Number(records[0].quantity),row.values.quantity);}
 // Rows outside this imported variant/location scope must remain byte-for-byte equal.
 const unrelated=items=>items.filter(i=>i.location_id!==location||!rows.some(row=>row.matches[0]===i.variant_id));assert.deepEqual(unrelated(replaced.pos_inventory),unrelated(before.pos_inventory));
 proof.applied=200;proof.concurrentRetries=2;proof.sameFileBlocked=409;proof.productsUnchanged=true;proof.quantities=rows.map(r=>r.values.quantity);proof.inventoryRows=rows.length;
 proof.newExportSameAbsoluteValues=200;proof.unrelatedInventoryUnchanged=true;
 console.log('PASS actual Preview HTTP: inventory-only fields, existing products preserved, absolute stock, concurrent retry and duplicate-file rejection without quantity changes.');
}
fs.writeFileSync(path.join(dir,'import-inventory-proof.json'),JSON.stringify(proof,null,2));
