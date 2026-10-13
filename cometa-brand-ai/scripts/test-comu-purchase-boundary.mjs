import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const output = ts.transpileModule(fs.readFileSync('src/lib/comu/purchase-access.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports = {}, env = {};
vm.runInNewContext(output,{exports,process:{env},Response});
assert.equal(exports.closedComuPurchaseResponse().status,503);
const closed=exports.isClosedComuPurchaseRequest;
for(const path of ['/api/comu/cart','/api/comu/reservations','/api/comu/checkout','/api/comu/payments/intents','/api/comu/shipping/quote'])assert.equal(closed(path+'/', 'POST'),true);
for(const path of ['/api/comu/seller/catalog','/api/comu/media','/api/comu/seller-applications','/api/comu/admin/applications','/api/comu/orders/123/cancel','/api/comu/stripe/webhook','/brand/demo/pos'])assert.equal(closed(path,'POST'),false);
assert.equal(closed('/comu/checkout','GET'),true);
assert.equal(closed('/api/comu/orders','GET'),false);
for (const file of ['reservations','checkout','payments/intents','shipping/quote']) {
  const code=ts.transpileModule(fs.readFileSync('src/app/api/comu/'+file+'/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const box={exports:{},require(name){if(name==='@/lib/comu/purchase-access')return exports;return new Proxy({}, {get(){return ()=>{throw Error('Blocked handler called dependency');};}});}};
  vm.runInNewContext(code,box);
  const response=await box.exports.POST({json(){throw Error('Body must not be consumed');}});
  assert.equal(response.status,503,file);
}
env.COMU_PUBLIC_PURCHASES_ENABLED='true';assert.equal(closed('/api/comu/checkout','POST'),false);
assert.equal(exports.closedComuPurchaseResponse(),null);
console.log('PASS purchase boundary: fail closed; seller, POS and existing resolution preserved (unit/static only).');
