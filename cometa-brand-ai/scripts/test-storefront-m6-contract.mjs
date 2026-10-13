// Pure contracts + real Stripe signature implementation. No database or provider requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const loaded={exports:{}};cache.set(file,loaded.exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,Intl,require:n=>load(path.resolve(path.dirname(file),n)+'.ts')});return loaded.exports;
}
const c=load('packages/own-storefront/checkout-contract.ts');
const productId='11111111-1111-4111-8111-111111111111',variantId='22222222-2222-4222-8222-222222222222';
const line={productId,variantId,quantity:1};
assert.equal(c.checkoutLines([line])[0].quantity,1);
for(const bad of [[],[line,line],[{...line,price:1}],[{...line,quantity:0}],[{...line,quantity:1.2}],[{...line,quantity:100}],[{...line,variantId:'foreign'}]])assert.throws(()=>c.checkoutLines(bad));
const contact={email:'test@example.invalid',name:'Test',phone:'5555555555',line1:'Fixture',line2:'',city:'Fixture',state:'Fixture',postalCode:'00000',country:'MX'};
assert.equal(c.checkoutContact(contact).name,'Test');
for(const bad of [{...contact,email:'bad'},{...contact,country:'Mexico'},{...contact,owner:'other'},{...contact,line1:''}])assert.throws(()=>c.checkoutContact(bad));
assert.equal(c.money(12345,'USD').includes('123.45'),true);
for(const status of ['PENDING','EXPIRED','CANCELLED','PAYMENT_REVIEW'])assert.equal(c.purchaseEvent({id:productId,status,currency:'MXN',total_cents:12345}),null);
const paid={id:productId,status:'PAID',currency:'MXN',total_cents:12345};
assert.equal(c.purchaseEvent(paid).id,c.purchaseEvent(paid).id);
assert.equal(c.purchaseEvent(paid).valueCents,12345);
const stripe=new Stripe('sk_test_synthetic_no_network'),secret='whsec_synthetic_local_fixture';
const payload=JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_fixture',payment_status:'paid'}}});
const signature=stripe.webhooks.generateTestHeaderString({payload,secret});
assert.equal(stripe.webhooks.constructEvent(payload,signature,secret).id,'evt_fixture');
assert.throws(()=>stripe.webhooks.constructEvent(payload+' ',signature,secret));
assert.throws(()=>stripe.webhooks.constructEvent(payload,signature,secret+'wrong'));
assert.throws(()=>stripe.webhooks.constructEvent(payload,stripe.webhooks.generateTestHeaderString({payload,secret,timestamp:1}),secret));
console.log('PASS M6 Node: strict lines/contact, no client price, quantities, currency formatting, pending!=Purchase, stable paid descriptor; actual Stripe SDK signature rejects tampering/wrong secret/stale event. Synthetic payloads, no provider or persistence certification.');
