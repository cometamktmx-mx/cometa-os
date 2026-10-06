import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{},URL,Intl,Date,Set};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/comu/buyer-order-presentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {presentBuyerOrder,selectDeliveryEstimate,formatOrderMoney,publicOrderImage,summarizeBuyerOrder}=context.exports;
const time='2026-10-05T12:00:00Z';
const sub=(id,route='HUB',state='PREPARING')=>({suborderId:id,sellerId:'seller-'+id,sellerName:'Historical store '+id,sellerLogo:null,route,fulfillmentStatus:state,total:100,products:[{id:'item-'+id,title:'Historical product',image:null,sellerNameSnapshot:'Snapshot seller',variant:'M',sku:'SKU',attributes:{color:'red'},quantity:2,unitPrice:50,subtotal:100}]});
const event=(id,type,scope='SUBORDER')=>({id:type+id,type,scope,suborderId:scope==='MASTER'?null:id,recordedAt:time});
const source={orderId:'master',orderNumber:'99',createdAt:time,currency:'USD',commercialStatus:'PAID',fulfillmentStatus:'SHIPPED',shippingMode:'STANDARD',presentationStatus:'GATHERING_AT_HUB',paymentConfirmed:true,paymentState:'SUCCEEDED',economics:{subtotal:200,shipping:10,discount:0,pointsTotal:0,total:210,refunded:25},shippingAddress:{recipient:'Owner',line1:'Snapshot address',line2:null,city:'City',state:'State',postalCode:'00000',country:'MX',references:null},suborders:[sub('a','HUB','HUB_RECEIVED'),sub('b')],events:[event(null,'ORDER_PAID','MASTER'),event('a','SUBORDER_PREPARING'),event('a','SUBORDER_READY_FOR_HUB'),event('a','SUBORDER_HANDED_TO_HUB'),event('a','SUBORDER_HUB_RECEIVED')],tracking:[],issues:[]};
let out=presentBuyerOrder(source);assert.equal(out.presentationStatus,'GATHERING_AT_HUB');assert.equal(out.hubProgress.totalSellers,2);assert.equal(out.hubProgress.receivedSellers,1);assert.equal(out.hubProgress.consolidated,false);assert.match(out.hubProgress.label,/1 de 2/);assert.equal(out.sellerCount,2);assert.equal(out.itemCount,4);assert.equal(out.economics.net,185);assert.equal(out.suborders[0].logoSource,'PLACEHOLDER');assert.equal(out.suborders[0].products[0].image,null);assert.equal(out.latestVerifiedUpdate,time);assert.equal(out.deliveryEstimate,null);
assert.ok(!('shippingAddress' in summarizeBuyerOrder(out)));assert.ok(formatOrderMoney(100,'USD').includes('US'));assert.ok(formatOrderMoney(100,'EUR').includes('EUR'));
assert.equal(publicOrderImage('javascript:alert(1)'),null);assert.equal(publicOrderImage('//private.invalid'),null);
const carrier={source:'CARRIER',from:'2026-10-08',to:'2026-10-10',updatedAt:time},promise={...carrier,source:'COMU_PROMISE'};
assert.equal(selectDeliveryEstimate(carrier,promise),carrier);assert.equal(selectDeliveryEstimate(null,promise),promise);assert.equal(selectDeliveryEstimate(null,null),null);assert.equal(selectDeliveryEstimate({...carrier,to:'2026-10-01'},null),null);
const complete=structuredClone(source);complete.events.push(event('b','SUBORDER_HUB_RECEIVED'),event(null,'MASTER_CONSOLIDATED','MASTER'));complete.tracking=[{shipmentId:'shipment',carrier:'Carrier',trackingNumber:'REAL-SOURCE-FIXTURE',status:'READY_TO_SHIP',suborderIds:['a','b'],events:[]}];complete.presentationStatus='READY_TO_SHIP';out=presentBuyerOrder(complete);assert.equal(out.hubProgress.consolidated,true);complete.tracking[0].suborderIds=['a'];assert.equal(presentBuyerOrder(complete).hubProgress.consolidated,false);
const direct=structuredClone(source);direct.suborders=[sub('d','DIRECT','SHIPPED')];direct.events=[event(null,'ORDER_PAID','MASTER'),event('d','SUBORDER_PREPARING'),event('d','SUBORDER_SHIPPED')];direct.presentationStatus='IN_TRANSIT';direct.tracking=[{shipmentId:'dship',carrier:'DHL',trackingNumber:'TEST',status:'SHIPPED',suborderIds:[],events:[]}];out=presentBuyerOrder(direct);assert.equal(out.hubProgress.label,null);assert.equal(out.suborders[0].presentationState,'IN_TRANSIT');assert.equal(out.tracking[0].publicTrackingUrl,null);assert.ok(!out.timeline.some(e=>e.label.includes('HUB')));
direct.tracking[0].status='OUT_FOR_DELIVERY';direct.tracking[0].events=[{id:'track1',status:'IN_TRANSIT',recordedAt:time},{id:'track2',status:'OUT_FOR_DELIVERY',recordedAt:time}];out=presentBuyerOrder(direct);assert.equal(out.suborders[0].presentationState,'OUT_FOR_DELIVERY');assert.equal(out.timeline.filter(e=>e.label==='En tránsito').length,1);assert.equal(out.timeline.filter(e=>e.label==='En reparto').length,1);assert.equal(out.context.focusSuborderId,null);assert.equal(presentBuyerOrder(direct,'d').context.focusSuborderId,'d');
direct.suborders.push(sub('h'));assert.equal(presentBuyerOrder(direct).limitations.length,1);
const unknownTime=structuredClone(source);unknownTime.events=[];unknownTime.updated_at='2099-01-01';assert.equal(presentBuyerOrder(unknownTime).latestVerifiedUpdate,null);
console.log('B1 Node PASS: unequal HUB counts/consolidation; DIRECT timeline; shipment dedup; no invented timestamps; snapshots/placeholder; currency/refund net; ETA precedence/null; private URL omission; mixed limitation; focus context');

// Exercise the actual cancellation boundary: no paid restock and no provider detail leak.
class DomainError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
let commercial='PAID',payment='SUCCEEDED',providerFailure=false,providerCalls=0,rpcCalls=0;
const admin={from(table){const chain={eq(){return chain;},order(){return chain;},limit(){return chain;},select(){return chain;},async maybeSingle(){return {data:table==='comu_orders'?{id:'own',status:commercial,comu_order_suborders:[{fulfillment_status:'PAID'}]}:{status:payment,stripe_payment_intent_id:'PRIVATE_STRIPE_ID'},error:null};}};return chain;},async rpc(name){assert.equal(name,'comu_cancel_order');rpcCalls++;return {data:{status:'CANCELLED',private:'PRIVATE_INTERNAL'},error:null};}};
const cancellation={exports:{},URLSearchParams,require(name){
 if(name==='@/lib/pos/server')return {PosApiError:DomainError};
 if(name==='./buyers')return {requireComuBuyer(){throw Error('Unexpected provisioning');},requireComuBuyerRead:async()=>({buyer:{id:'buyer'},admin})};
 if(name==='./stripe')return {getStripeClient:()=>({paymentIntents:{cancel:async()=>{providerCalls++;if(providerFailure)throw Error('PRIVATE_PROVIDER_PAYLOAD');}}})};
 return {};
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/comu/orders.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,cancellation);
for(const restock of [false,true])await assert.rejects(()=>cancellation.exports.cancelBuyerOrder('own',restock),e=>e.status===409);
assert.equal(providerCalls,0);assert.equal(rpcCalls,0);
commercial='PAYMENT_PENDING';await assert.rejects(()=>cancellation.exports.cancelBuyerOrder('own'),e=>e.status===409);
payment='REQUIRES_PAYMENT';providerFailure=true;await assert.rejects(()=>cancellation.exports.cancelBuyerOrder('own'),e=>e.status===503&&!e.message.includes('PRIVATE_'));assert.equal(rpcCalls,0);
providerFailure=false;const cancelled=await cancellation.exports.cancelBuyerOrder('own');assert.equal(cancelled.status,'CANCELLED');assert.equal(rpcCalls,1);assert.ok(!JSON.stringify(cancelled).includes('PRIVATE_'));
console.log('B1 cancellation Node PASS: paid and restock rejected before side effects; provisioning forbidden; pending provider errors sanitized; only safe cancellation response');
