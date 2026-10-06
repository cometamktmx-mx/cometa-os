import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export function certifyBuyerSQL({sql,as,rows,order,buyer,sellerB,admin}) {
 const read=id=>JSON.parse(as(buyer,`select public.comu_buyer_order_read_b1('${id}')`).split('\n').find(x=>x.startsWith('{')));
 const list=args=>JSON.parse(as(buyer,`select public.comu_buyer_orders_read_b1(${args})`).split('\n').find(x=>x.startsWith('{')));
 const a=order(),second=randomUUID();
 sql(`insert into public.comu_order_suborders(id,order_id,seller_id,grand_total) values('${second}','${a.o}','${sellerB}',0)`);
 for(const [id,state,actor] of [[a.s,'PREPARING','SELLER'],[second,'PREPARING','SELLER'],[a.s,'READY_FOR_HUB','SELLER'],[a.s,'HANDED_TO_HUB','SELLER'],[a.s,'HUB_RECEIVED','HUB']]) as(admin,`select public.comu_transition_suborder_fulfillment_v1('${id}','${state}','${actor}',null)`);
 let detail=read(a.o);assert.equal(detail.presentationStatus,'GATHERING_AT_HUB');assert.equal(detail.suborders.length,2);assert.equal(detail.events.filter(e=>e.type==='SUBORDER_HUB_RECEIVED').length,1);
 for(const [state,actor] of [['READY_FOR_HUB','SELLER'],['HANDED_TO_HUB','SELLER'],['HUB_RECEIVED','HUB']])as(admin,`select public.comu_transition_suborder_fulfillment_v1('${second}','${state}','${actor}',null)`);
 as(admin,`select public.comu_consolidate_order_v1('${a.o}')`);
 detail=read(a.o);assert.equal(detail.presentationStatus,'READY_TO_SHIP');assert.ok(detail.events.some(e=>e.type==='MASTER_CONSOLIDATED'&&e.scope==='MASTER'));assert.equal(detail.tracking[0].suborderIds.length,2);
 sql(`update public.comu_order_suborders set fulfillment_status='SHIPPED' where id='${a.s}';update public.comu_order_suborders set fulfillment_status='PREPARING' where id='${second}'`);
 assert.equal(read(a.o).presentationStatus,'PARTIALLY_IN_TRANSIT');
 sql(`update public.comu_order_suborders set fulfillment_status='DELIVERED' where id='${a.s}'`);assert.equal(read(a.o).presentationStatus,'PARTIALLY_IN_TRANSIT');
 as(admin,`select public.comu_record_fulfillment_incident_v1('${second}','OTHER','${randomUUID()}','B1_PRIVATE_NOTE')`);
 detail=read(a.o);assert.equal(detail.presentationStatus,'ISSUE');assert.ok(!JSON.stringify(detail).includes('B1_PRIVATE_NOTE'));assert.equal(detail.issues.length,1);
 const d=order();sql(`update public.comu_order_suborders set fulfillment_route='DIRECT',fulfillment_status='SHIPPED' where id='${d.s}';insert into public.comu_shipments(master_order_id,provider,provider_shipment_id,status,tracking_number,carrier) values('${d.o}','SKYDROPX','b1-direct','SHIPPED','B1TRACK','Fixture carrier')`);
 assert.equal(read(d.o).presentationStatus,'IN_TRANSIT');
 sql(`set role service_role;select public.comu_process_tracking_event_v1('SKYDROPX','b1-reparto','b1-direct','OUT_FOR_DELIVERY','B1TRACK');reset role`);
 detail=read(d.o);assert.equal(detail.presentationStatus,'OUT_FOR_DELIVERY');assert.ok(detail.tracking[0].events.some(e=>e.status==='OUT_FOR_DELIVERY'));
 sql(`set role service_role;select public.comu_process_tracking_event_v1('SKYDROPX','b1-delivered','b1-direct','DELIVERED','B1TRACK');reset role`);
 assert.equal(read(d.o).presentationStatus,'DELIVERED');
 sql(`update public.comu_orders set currency='USD' where id='${d.o}'`);assert.equal(read(d.o).currency,'USD');
 // Existing refund schema supports MXN only; do not invent cross-currency refunds.
 sql(`update public.comu_orders set currency='MXN' where id='${d.o}';insert into public.comu_refunds(payment_id,master_order_id,amount_cents,currency,status,idempotency_key) values('${d.payment}','${d.o}',2500,'MXN','SUCCEEDED','b1-refunded'),('${d.payment}','${d.o}',1000,'MXN','REQUESTED','b1-pending')`);
 detail=read(d.o);assert.equal(detail.currency,'MXN');assert.equal(detail.economics.refunded,25);
 const folio=detail.orderNumber;assert.equal(list(`90,'DELIVERED','#COMU-${folio}',1,1`).orders[0].orderId,d.o);
 sql(`update public.comu_orders set created_at=now()-interval '60 days' where id='${d.o}'`);
 assert.equal(list(`30,'ALL','${folio}',1,20`).pagination.total,0);assert.equal(list(`90,'ALL','${folio}',1,20`).pagination.total,1);
 assert.equal(list(`90,'ALL','${folio}',2,1`).orders.length,0);
 const one=list(`90,'ALL','',1,1`),two=list(`90,'ALL','',2,1`);assert.notEqual(one.orders[0].orderId,two.orders[0].orderId);
 const equalTime=rows(`select created_at from public.comu_orders where id='${a.o}'`)[0].created_at;
 sql(`update public.comu_orders set created_at='${equalTime}' where id='${d.o}'`);
 const ids=list(`90,'ALL','',1,50`).orders.filter(o=>[a.o,d.o].includes(o.orderId)).map(o=>o.orderId);assert.deepEqual(ids,[a.o,d.o].sort().reverse());
 assert.equal(detail.deliveryEstimate,null);assert.equal(detail.tracking[0].publicTrackingUrl,null);
 console.log('B1 SQL PASS: 2 HUB sellers, unequal/partial, receipt events, consolidation, ISSUE, DIRECT/in-transit/reparto/delivery, USD/refunds, search/30/90/pagination/stable order');
}
