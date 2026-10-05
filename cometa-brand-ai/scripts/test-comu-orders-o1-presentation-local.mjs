import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/comu/order-presentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {getOrderPaymentPresentation:payment,getSellerOrderAllowedActions:actions,getSellerOrderNextAction:next,presentSellerOrder:present}=context.exports;
for(const [commercial,state,confirmed,expected] of [
 ['PAYMENT_PENDING',null,false,'PENDING'],['PAYMENT_PENDING','REQUIRES_PAYMENT',false,'PENDING'],['PAYMENT_PENDING','PROCESSING',false,'PROCESSING'],['PAYMENT_PENDING','FAILED',false,'FAILED'],['CANCELLED','CANCELLED',false,'CANCELLED'],['EXPIRED','FAILED',false,'EXPIRED'],['PAID','SUCCEEDED',true,'PAID'],['PAID','PROCESSING',false,'REVIEW'],['REFUNDED','REFUNDED',false,'REFUNDED'],['PARTIALLY_REFUNDED','SUCCEEDED',false,'PARTIALLY_REFUNDED'],['DISPUTED','SUCCEEDED',false,'DISPUTED'],['EXPIRED','SUCCEEDED',false,'REVIEW'],['UNKNOWN','UNKNOWN',false,'REVIEW'],
])assert.equal(payment(commercial,state,confirmed),expected);
for(const condition of ['REFUNDED','PARTIALLY_REFUNDED','DISPUTED','REVIEW'])assert.equal(payment('PAID','SUCCEEDED',false,condition),condition);
const base={authorized:true,role:'OWNER',paymentConfirmed:true,fulfillmentState:'PAID',route:'HUB',shippingMode:'STANDARD',shipmentPrepared:false};
for(const role of ['OWNER','ADMIN','ORDER_MANAGER'])assert.equal(actions({...base,role})[0].key,'START_PREPARING');
for(const delta of [{authorized:false},{role:'CATALOG_MANAGER'},{paymentConfirmed:false},{route:'UNKNOWN'},{shippingMode:'UNKNOWN'}])assert.equal(actions({...base,...delta}).length,0);
assert.equal(actions({...base,fulfillmentState:'PREPARING'})[0].key,'MARK_READY_FOR_HUB');
assert.equal(actions({...base,fulfillmentState:'READY_FOR_HUB'})[0].key,'MARK_HANDED_TO_HUB');
assert.equal(next({...base,fulfillmentState:'HANDED_TO_HUB'}).key,'WAITING_FOR_HUB');
assert.equal(actions({...base,route:'DIRECT',fulfillmentState:'PREPARING'})[0].key,'MARK_READY_TO_SHIP');
assert.equal(actions({...base,route:'DIRECT',fulfillmentState:'READY_FOR_HUB'}).length,0);
assert.equal(actions({...base,route:'DIRECT',fulfillmentState:'READY_TO_SHIP'}).length,0);
assert.equal(actions({...base,route:'DIRECT',fulfillmentState:'READY_TO_SHIP',shipmentPrepared:true})[0].key,'SHIP_DIRECT');
for(const fulfillmentState of ['HUB_RECEIVED','CONSOLIDATED','SHIPPED','DELIVERED','ISSUE','CANCELLED'])assert.equal(actions({...base,fulfillmentState}).length,0);
const events=[{id:'real-event',type:'SUBORDER_PREPARING',at:'2026-10-05T12:00:00Z'}];
const projected=present({...base,commercialState:'PAID',paymentState:'SUCCEEDED',timeline:events},'OWNER');
assert.equal(projected.timeline.length,1);assert.equal(projected.timeline[0].at,events[0].at);assert.equal(projected.timeline[0].label,'Preparando');
const empty=present({...base,commercialState:'PAID',paymentState:'SUCCEEDED',timeline:[]},'OWNER');assert.equal(empty.timeline.length,0);
console.log('PASS O1 Node: explicit financial mapping, roles/payment fail closed, HUB/DIRECT actions, shipment prerequisite, nextAction, persisted-only timeline.');
