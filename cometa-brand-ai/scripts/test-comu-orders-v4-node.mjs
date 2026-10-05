import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,imports={}){const context={exports:{},URL,Intl,Date,require:name=>{assert.ok(name in imports);return imports[name];}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const presentation=load('src/lib/comu/order-presentation.ts');
const view=load('src/app/comu/seller/orders-view.ts',{'@/lib/comu/order-presentation':presentation});
const record={masterOrderId:'master',suborderId:'sub',orderNumber:7,createdAt:'2026-10-05T12:00:00Z',recipientName:'Destinatario',total:100,currency:'MXN',commercialState:'PAID',fulfillmentState:'PAID',shippingMode:'STANDARD',route:'HUB',deadlineAt:null,paymentState:'SUCCEEDED',paymentConfirmed:true,shipmentPrepared:false,financialCondition:null,items:[],timeline:[],tracking:[],incidents:[]};
const order=(delta={})=>presentation.presentSellerOrder({...record,...delta},'OWNER');
assert.equal(view.orderPrimaryAction(order()).key,'START_PREPARING');
for(const route of ['HUB','DIRECT']){
 const preparing=order({route,fulfillmentState:'PREPARING'});
 assert.equal(view.orderPrimaryAction(preparing).key,route==='HUB'?'MARK_READY_FOR_HUB':'MARK_READY_TO_SHIP');
 assert.equal(view.orderTimeline(preparing).filter(s=>s.event).length,0,'Never infer timeline from fulfillment');
 const evidenced=order({route,timeline:[{id:'real',type:'SUBORDER_PREPARING',at:record.createdAt}]});
 assert.equal(view.orderTimeline(evidenced).filter(s=>s.event).length,1);
 assert.equal(view.orderTimeline(evidenced)[1].event.at,record.createdAt);
}
const cancelled=order({paymentConfirmed:false,commercialState:'CANCELLED',paymentState:'CANCELLED'});
assert.equal(view.orderBadge(cancelled).label,'Cancelado');
assert.equal(view.orderMetrics([cancelled])[0].count,0);
assert.equal(view.orderPrimaryAction({...order(),allowedActions:[]}),undefined,'No action absent server authorization');
assert.equal(view.orderPrimaryAction({...order(),nextAction:{key:'START_PREPARING',target:'DELIVERED',label:'bad'}}),undefined);
assert.equal(view.orderPrimaryAction(order({route:'DIRECT',fulfillmentState:'READY_TO_SHIP'})),undefined);
assert.equal(view.orderPrimaryAction(order({route:'DIRECT',fulfillmentState:'READY_TO_SHIP',shipmentPrepared:true})).key,'SHIP_DIRECT');
assert.equal(view.orderPrimaryAction(order({fulfillmentState:'HANDED_TO_HUB'})),undefined);
assert.equal(view.orderDelivery(order({route:'DIRECT'})),'Envío directo');
assert.equal(view.snapshotImage('javascript:alert(1)'),null);
assert.equal(view.snapshotImage('//private.example/file'),null);
assert.equal(view.snapshotImage('/snapshot.png'),'/snapshot.png');
assert.equal(view.snapshotVariant({variant:null,attributes:{Color:'Olivo',Size:'M',nested:{private:'hidden'}}}),'Color: Olivo · Size: M');
assert.equal(view.orderDate('bad'),'Fecha no disponible');
assert.equal(view.orderMetrics([order(),order({fulfillmentState:'READY_FOR_HUB'}),order({fulfillmentState:'READY_TO_SHIP'}),order({fulfillmentState:'ISSUE'})]).find(m=>m.key==='READY').count,2);
console.log('PASS V4 Node: actual payment labels, page counts, fail-closed nextAction, HUB/DIRECT persisted timeline only, snapshots and URL safety');
