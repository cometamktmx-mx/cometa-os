import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
export async function certifyPresentation({sql,fixture}){
 const q=v=>"'"+String(v).replaceAll("'","''")+"'",json=async s=>JSON.parse(await sql(s)),{ids}=fixture;
 const prior=await sql('select jsonb_agg(snapshot order by id) from store_order_items');
 const photo=`magenta-preview/web/${ids.product}/${randomUUID()}.webp`;
 await sql(`update pos_product_variants set sku='M8-ORIGINAL',attributes='{"Talla":"M"}' where id='${ids.variant}';update pos_product_web_content set published=jsonb_set(published,'{colors,0,photos}',${q(JSON.stringify([{path:photo,alt:'Synthetic'}]))}) where product_id='${ids.product}';`);
 const owner=randomBytes(32).toString('hex'),attempt=randomUUID(),contact={email:'m8@example.test',name:'Synthetic',phone:'5555555555',line1:'Test',line2:'',city:'Test',state:'Test',postalCode:'00000',country:'MX'};
 const create=()=>json(`set role service_role;select to_jsonb(store_order_create_m7('magenta-preview','${owner}','${attempt}','[{"productId":"${ids.product}","variantId":"${ids.variant}","quantity":1}]',${q(JSON.stringify(contact))},'PICKUP','STRIPE','${'b'.repeat(64)}'))`);
 const order=await create();const snap=await json(`select snapshot from store_order_items where order_id='${order.id}'`);
 assert.equal(snap.sku,'M8-ORIGINAL');assert.deepEqual(snap.options,{Talla:'M'});assert.equal(snap.imagePath,photo);assert.equal(snap.retailUnitCents,10000);assert.equal(snap.unitCents,10000);assert.equal(order.total_cents,10000);assert.equal(order.delivery_snapshot.locationName,'Sucursal sintetica');
 await sql(`update pos_product_variants set sku='M8-CURRENT',attributes='{"Talla":"L"}' where id='${ids.variant}'`);
 assert.equal((await create()).id,order.id);assert.deepEqual(await json(`select snapshot from store_order_items where order_id='${order.id}'`),snap);
 assert.equal(await sql(`select jsonb_agg(snapshot order by id) from store_order_items where order_id<>'${order.id}'`),prior);
 const history=()=>json(`set role service_role;select store_notification_history_m8('magenta-preview','${ids.actor}')`);
 const before=await history(),notice=before.notifications.find(n=>n.store_order_events.order_id===order.id);assert.ok(notice);assert.equal(notice.read_at,null);
 await sql(`set role service_role;select store_notification_read_m7('magenta-preview','${ids.actor}','${notice.event_id}');select store_notification_read_m7('magenta-preview','${ids.actor}','${notice.event_id}')`);
 const after=await history();assert.equal(after.count,before.count-1);assert.ok(after.notifications.find(n=>n.event_id===notice.event_id).read_at);
 await assert.rejects(()=>sql(`set role service_role;select store_notification_history_m8('magenta-preview','${randomUUID()}')`),/DENIED/);
 for(const role of ['anon','authenticated'])await assert.rejects(()=>sql(`set role ${role};select store_notification_history_m8('magenta-preview','${ids.actor}')`),/permission denied/);
 await sql(`set role service_role;select store_order_action_m7('magenta-preview','${ids.actor}','${order.id}',0,'CANCEL',null)`);
 assert.equal(await sql(`select quantity||':'||reserved_quantity from pos_inventory where variant_id='${ids.variant}' and location_id='${ids.location}'`),'5.000:0.000');
 console.log('PASS M8: SKU/options/photo/location snapshots, retained wholesale prices, retry immutability, prior history unchanged, persistent read/unread notices, tenant/role denial; inventory unchanged after cancel.');
}
