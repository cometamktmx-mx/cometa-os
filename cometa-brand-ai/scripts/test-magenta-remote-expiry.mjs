import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
const dir=path.resolve('.next/magenta-functional/ephmrsjnpkcgddulvckj');
const env=JSON.parse(fs.readFileSync(path.join(dir,'environment.json'),'utf8'));
assert.equal(env.projectRef,'ephmrsjnpkcgddulvckj');assert.equal(env.url,'https://ephmrsjnpkcgddulvckj.supabase.co');
const db=createClient(env.url,env.service,{auth:{persistSession:false}}),ids=env.fixture.ids;
const file=path.join(dir,'expiry-proof.json');
const inventory=async()=>{const r=await db.from('pos_inventory').select('quantity,reserved_quantity').eq('location_id',ids.location).eq('variant_id',ids.variant).single();assert.equal(r.error,null);return r.data;};
if(process.argv.includes('--create')){
 assert.equal(fs.existsSync(file),false,'Never repeat creation blindly');const before=await inventory();
 const result=await db.rpc('store_order_create_m7',{p_brand:'magenta-preview',p_owner:randomBytes(32).toString('hex'),p_attempt:randomUUID(),p_lines:[{productId:ids.product,variantId:ids.variant,quantity:1}],p_contact:{email:'expiry@example.test',name:'Synthetic expiry',phone:'5555555555',line1:'SYNTHETIC',line2:'',city:'TEST',state:'TEST',postalCode:'00000',country:'MX'},p_delivery:'PICKUP',p_method:'STRIPE',p_hash:randomBytes(32).toString('hex')});
 assert.equal(result.error,null);const order=result.data;
 fs.writeFileSync(file,JSON.stringify({order:order.id,before,createdAt:new Date().toISOString()}));
 assert.deepEqual(await inventory(),{quantity:before.quantity,reserved_quantity:before.reserved_quantity+1});
 console.log('Created one synthetic pending order. Run --expire, then wait for pg_cron.');
}else if(process.argv.includes('--expire')){
 const proof=JSON.parse(fs.readFileSync(file,'utf8'));assert.match(proof.order,/^[0-9a-f-]{36}$/);
 const query=path.join(dir,'expiry-test.sql');
 fs.writeFileSync(query,`update public.store_orders set expires_at=now()-interval '1 minute' where id='${proof.order}' and status='PENDING' and brand_id=(select id from brands where slug='magenta-preview');`);
 execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',env.projectRef,'--file',query,'--output','json'],{stdio:['ignore','pipe','pipe']});
 console.log('Only synthetic test order expired by privileged test setup; service_role grants unchanged. Waiting for pg_cron.');
}else{
 const proof=JSON.parse(fs.readFileSync(file,'utf8'));
 const order=await db.from('store_orders').select('status').eq('id',proof.order).single();assert.equal(order.error,null);assert.equal(order.data.status,'EXPIRED');
 assert.deepEqual(await inventory(),proof.before);
 const repeat=await Promise.all([db.rpc('store_orders_expire_m6',{p_brand:'magenta-preview'}),db.rpc('store_orders_expire_m6',{p_brand:'magenta-preview'})]);for(const r of repeat)assert.equal(r.error,null);
 assert.deepEqual(await inventory(),proof.before);
 const anon=createClient(env.url,env.anon,{auth:{persistSession:false}});assert.ok((await anon.rpc('store_orders_expire_m6',{p_brand:'magenta-preview'})).error);
 fs.writeFileSync(file,JSON.stringify({...proof,verifiedAt:new Date().toISOString(),result:'EXPIRED_BY_REMOTE_CRON_RETRIES_NO_DOUBLE_RELEASE'}));
 console.log('PASS remote timer expired pending order, restored reserve; concurrent retries did not release twice; anonymous RPC denied. Paid-order protection was tested separately locally.');
}
