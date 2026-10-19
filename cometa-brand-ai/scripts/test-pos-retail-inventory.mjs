import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testRetailInventory({sql,ids,brand,quote,actorSession}) {
 await sql(fs.readFileSync('supabase/migrations/20261019230000_pos_retail_inventory_workspace.sql','utf8'));
 await sql("insert into public.pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count') on conflict(code) do nothing;");
 await sql(`set session_replication_role=replica;update pos_business_profiles set profile_code='retail' where brand_slug='${brand}';set session_replication_role=origin;update pos_staff_sessions set last_human_at=clock_timestamp() where id='${actorSession}';update pos_products set product_code='P111' where id='${ids.productA}';update pos_inventory set quantity=100,reserved_quantity=10 where brand_slug='${brand}';`);
 const command=(action,body,key=randomUUID(),session=actorSession)=>sql(`set role service_role;select pos_retail_inventory_batch_v1('${brand}','${ids.owner}','${session}','${key}','${ids.location}',${quote(action)},${quote(JSON.stringify(body))}::jsonb)`).then(JSON.parse);
 const catalog=(search='')=>sql(`set role service_role;select pos_retail_inventory_catalog_v1('${brand}','${ids.location}',${quote(search)})`).then(JSON.parse);
 const stock=()=>sql(`select jsonb_agg(to_jsonb(i)) from pos_inventory i where brand_slug='${brand}'`).then(JSON.parse);
 const beforeSales=await sql('select count(*) from pos_sales');
 const models=await catalog('P111');assert.equal(models.models.length,1);assert.equal(models.models[0].variants.length,3);
 assert.equal((await catalog('Same name')).models.length,2);
 const key=randomUUID(),payload={items:[{variant_id:ids.v1,quantity:5},{variant_id:ids.v4,quantity:3}],reason:'Synthetic receipt'};
 const repeated=await Promise.all([command('receive',payload,key),command('receive',payload,key)]);assert.deepEqual(repeated[0],repeated[1]);
 let all=await stock();assert.equal(all.find(i=>i.variant_id===ids.v1).quantity,105);assert.equal(all.find(i=>i.variant_id===ids.v4).quantity,103);
 await assert.rejects(command('receive',{...payload,reason:'Changed'},key),/POS_IDEMPOTENCY_CONFLICT/);
 let model=(await catalog('P111')).models[0],variant=model.variants.find(v=>v.id===ids.v1);
 await assert.rejects(command('count',{reason:'Synthetic count',items:[{variant_id:ids.v1,quantity:9,version:variant.version}]}),/POS_COUNT_BELOW_RESERVED/);
 await command('receive',{items:[{variant_id:ids.v1,quantity:1}]});
 await assert.rejects(command('count',{reason:'Synthetic count',items:[{variant_id:ids.v1,quantity:100,version:variant.version}]}),/POS_INVENTORY_CHANGED/);
 await sql(`update pos_inventory set reserved_quantity=0 where variant_id='${ids.v2}';`);
 variant=(await catalog('P111')).models[0].variants.find(v=>v.id===ids.v2);
 await command('count',{reason:'Explicit zero',items:[{variant_id:ids.v2,quantity:0,version:variant.version}]});
 all=await stock();assert.equal(all.find(i=>i.variant_id===ids.v2).quantity,0);assert.equal(all.find(i=>i.variant_id===ids.v3).quantity,100);
 await assert.rejects(command('out',{responsible:'Synthetic',expected_at:'2099-01-01T12:00:00Z',reason:'Content',items:[{variant_id:ids.v1,quantity:100}]}),/POS_INVENTORY_UNAVAILABLE/);
 const out=await command('out',{responsible:'Synthetic',expected_at:'2099-01-01T12:00:00Z',reason:'Content',items:[{variant_id:ids.v1,quantity:6},{variant_id:ids.v4,quantity:2}]});
 all=await stock();assert.equal(all.find(i=>i.variant_id===ids.v1).quantity,100);assert.equal(all.find(i=>i.variant_id===ids.v1).reserved_quantity,10);
 assert.equal((await catalog()).totals.outside,8);assert.equal(await sql('select count(*) from pos_sales'),beforeSales);
 const returnKey=randomUUID(),returnPayload={out_id:out.out.id,items:[{variant_id:ids.v1,quantity:2}]};
 assert.deepEqual(await command('return',returnPayload,returnKey),await command('return',returnPayload,returnKey));
 await assert.rejects(command('return',{out_id:out.out.id,items:[{variant_id:ids.v1,quantity:5}]}),/POS_RETURN_EXCEEDS_PENDING/);
 await command('dispose',{out_id:out.out.id,reason:'Damaged garment',items:[{variant_id:ids.v1,quantity:1}]});
 all=await stock();assert.equal(all.find(i=>i.variant_id===ids.v1).quantity,102);assert.equal((await catalog()).totals.outside,5);
 await command('return',{out_id:out.out.id,items:[{variant_id:ids.v1,quantity:3},{variant_id:ids.v4,quantity:2}]});assert.equal((await catalog()).totals.outside,0);
 await assert.rejects(command('receive',{items:[{variant_id:ids.v1,quantity:1.5}]}),/POS_WHOLE_PIECES_REQUIRED/);
 await assert.rejects(command('receive',payload,randomUUID(),randomUUID()),/POS_STAFF_PERMISSION_REQUIRED/);
 await sql(`update pos_inventory set quantity=10,reserved_quantity=0 where variant_id='${ids.v3}'`);
 const reserve=JSON.stringify([{variant_id:ids.v3,quantity:8,track_inventory:true}]);
 const race=await Promise.allSettled([
  command('out',{responsible:'Synthetic race',expected_at:'2099-01-01T12:00:00Z',reason:'Content',items:[{variant_id:ids.v3,quantity:8}]}),
  sql(`select pos_retail_reserve_v1('${brand}','${ids.location}','[]'::jsonb,${quote(reserve)}::jsonb)`)
 ]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 all=await stock();assert.ok(all.every(i=>i.quantity>=i.reserved_quantity));
 const report=JSON.parse(await sql(`select pos_retail_report_v1('${brand}',current_date,current_date,'${ids.location}')`));
 const totals=(await catalog()).totals;assert.equal(report.inventory.reduce((s,i)=>s+Number(i.quantity),0),totals.quantity);assert.equal(report.inventory.reduce((s,i)=>s+Number(i.outside),0),totals.outside);
 await sql(`update pos_staff set retail_permissions=array['SELL','PRODUCTS_READ'] where id='${ids.staff}'`);
 await assert.rejects(command('receive',payload),/POS_STAFF_PERMISSION_REQUIRED/);
 await sql(`update pos_staff set retail_permissions=null where id='${ids.staff}';set session_replication_role=replica;update pos_business_profiles set profile_code='restaurant' where brand_slug='${brand}';set session_replication_role=origin`);
 await assert.rejects(command('receive',payload),/POS_RETAIL_REQUIRED/);
 await sql(`set session_replication_role=replica;update pos_business_profiles set profile_code='retail' where brand_slug='${brand}';set session_replication_role=origin`);
 console.log('PASS Retail inventory: true-parent search, batch receipt/replay, blank/zero, reserved/count concurrency, outside/return/disposal, permissions and FOOD rejection');
}
