import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
function load(file){const compiled={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiled,exports:compiled.exports,Intl,Date});return compiled.exports;}
const {thermalReceipt,qzReceiptData}=load('src/lib/pos/thermal.ts');
const item={product_id:'model-a',product_name:'Modelo A',variant_name:'CH ? Negro',sku:'INTERNAL-001',quantity:2,unit_price:100,line_total:200};
const sale={sale_number:'COMPACT-TEST',sold_at:'2026-10-19T12:00:00Z',subtotal:800,discount_total:0,tax_total:0,total:800,currency:'MXN',items:[item,{...item,variant_name:'M · Azul'},{...item,product_id:'model-b',variant_name:'G · Rosa'},{...item,product_id:'model-b',variant_name:'XG · Azul'}],payments:[{payment_method:'cash',amount:100,tendered_amount:150,change_amount:50},{payment_method:'cash',amount:200,tendered_amount:200,change_amount:0},{payment_method:'card',amount:500,tendered_amount:500,change_amount:0}]};
const original=JSON.stringify(sale),html=thermalReceipt(sale,'PRUEBA','OPERADOR',80);
assert.equal(JSON.stringify(sale),original,'render cannot mutate snapshots');
assert.equal((html.match(/<h2>Modelo A<\/h2>/g)||[]).length,2,'same name, different IDs stay separate');
assert.ok(html.includes('CH / Negro'));assert.ok(html.includes('M / Azul'));assert.ok(html.includes('XG / Azul'));
assert.ok(!html.includes('INTERNAL-001'));assert.ok(thermalReceipt(sale,'A','B',80,{showSku:true}).includes('INTERNAL-001'));
assert.equal((html.match(/<span>Efectivo<\/span>/g)||[]).length,1);assert.ok(html.includes('$300.00'));
assert.equal((html.match(/<span>Cambio<\/span>/g)||[]).length,1);assert.ok(html.includes('$50.00'));
assert.equal((html.match(/TOTAL MXN/g)||[]).length,1);assert.ok(!html.includes('Pago 1:'));
assert.ok(thermalReceipt(sale,'A','B',80,{paymentHistory:true}).includes('Pago 3:'));
const payload=qzReceiptData(html,{receiptMode:'epson-tm-t20ii',width:80});
assert.equal(payload[1].options.pageWidth,560);assert.equal(payload[1].options.pageHeight,undefined);assert.equal(payload[2].data,'1D564200');assert.equal(payload.length,3);
const dir='build/retail-compact';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/short-after.html',thermalReceipt({...sale,items:sale.items.slice(0,2),subtotal:400,total:400,payments:[]},'PRUEBA 80 mm','SIN COBRO',80,{test:true}));
if(fs.existsSync(dir+'/fixture.json')&&fs.existsSync(dir+'/thermal-before.txt')){
 const fixture=JSON.parse(fs.readFileSync(dir+'/fixture.json','utf8').replace(/^\uFEFF/,'' )).rows[0].fixture;
 assert.ok(fixture.items.length>0);
 fs.writeFileSync(dir+'/before.html',load(dir+'/thermal-before.txt').thermalReceipt(fixture,'MAGENTA','OPERADOR',80));
 fs.writeFileSync(dir+'/after.html',thermalReceipt(fixture,'MAGENTA','OPERADOR',80));
 console.log('Comparison uses identical anonymized sale:',fixture.items.length,'variants,',new Set(fixture.items.map(i=>i.product_id)).size,'models; total',fixture.total);
}
console.log('PASS grouping identity, variants, snapshot preservation, optional SKU/history, payment aggregation, totals once, variable-height QZ and cut without drawer');
