import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/pos/thermal.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Intl,Date});
const {thermalReceipt}=module.exports;
const base={sale_number:'DEMO-0001',sold_at:'2026-10-17T17:15:00Z',subtotal:1500,discount_total:100,tax_total:0,total:1400,currency:'MXN',items:[{product_name:'Legging deportivo de compresión y cintura alta — edición diseño Ñandú',variant_name:'Negro carbón · CH',sku:'0000123',quantity:2,unit_price:500,line_total:1000},{product_name:'Top deportivo',variant_name:'Rosa · M',sku:'0000124',quantity:1,unit_price:500,line_total:400}],payments:[{payment_method:'cash',amount:500,tendered_amount:1000,change_amount:500},{payment_method:'card',amount:900,tendered_amount:900,change_amount:0}]};
fs.mkdirSync('build/pos-tickets',{recursive:true});
for(const [name,sale,options] of [['short',base,{}],['copy',base,{copy:true}],['long',{...base,subtotal:34000,discount_total:2200,total:31800,payments:[{payment_method:'card',amount:31800,tendered_amount:31800,change_amount:0}],items:Array.from({length:45},(_,i)=>({...base.items[i%2],product_name:`${i+1}. ${base.items[i%2].product_name}`}))},{}]]){
 const html=thermalReceipt(sale,'NEGOCIO DE DEMOSTRACIÓN','María José',80,{customer:'José Muñoz',...options});
 assert.match(html,/width:70mm/);assert.doesNotMatch(html,/297|min-height|<script|https?:/);
 assert.match(html,/page-break-inside:avoid/);assert.match(html,/María José/);assert.match(html,/José Muñoz/);
 if(options.copy)assert.match(html,/COPIA \/ REIMPRESIÓN/);
 fs.writeFileSync(`build/pos-tickets/${name}.html`,html);
}
const malicious=thermalReceipt({...base,items:[{...base.items[0],product_name:'<img src=x onerror=alert(1)>'}]},'<script>x</script>','A',80);
assert.doesNotMatch(malicious,/<script|<img/);
assert.match(malicious,/&lt;img/);
const orderModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/pos/retail-orders.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:orderModule,exports:orderModule.exports,Intl,Date,require:()=>module.exports});
const order={folio:'N-DEMO-001',created_at:base.sold_at,contact:'CLIENTE SINTÉTICO',quote:base,total:1400,paid:500,retained:0,unresolved:0,activated_at:base.sold_at,expires_at:'2026-11-01T17:15:00Z',policy_snapshot:{minimum_deposit:500,retained_deposit:500,policy:'Al vencer se retienen $500 iniciales. Abonos adicionales pendientes de resolución administrativa; no hay reembolso automático.'}};
for(const state of ['note','active','settled','expired']){
 const receipt=orderModule.exports.retailOrderReceipt({...order,state,paid:state==='settled'?1400:state==='note'?0:700,retained:state==='expired'?500:0,unresolved:state==='expired'?200:0,policy_snapshot:state==='note'?null:order.policy_snapshot,expires_at:state==='note'?null:order.expires_at},'NEGOCIO DE DEMOSTRACIÓN','María José','José Muñoz',state==='active'?{id:'DEMO-ABONO',created_at:base.sold_at,method:'cash',amount:500,tendered:1000,change:500}:undefined);
 if(state==='note')assert.match(receipt,/PEDIDO PENDIENTE — NO ES COMPROBANTE DE PAGO/);
 if(state==='expired')assert.match(receipt,/Saldo pendiente de resolución administrativa/);
 fs.writeFileSync(`build/pos-tickets/${state}.html`,receipt);
}
console.log('PASS compact isolated HTML, 70 mm content, long items, accents, mixed payments, copy and escaping. Fixtures: build/pos-tickets. Physical printing not tested.');
