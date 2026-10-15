import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';

const file = 'src/app/brand/[brandSlug]/pos/products/page.tsx';
const original = execFileSync('git', ['show', 'c02f3664cd4ee62a9ccefb338b91e72b4add8b7f:cometa-brand-ai/' + file], { encoding: 'utf8' });
const names = ['createVariant','buildVariantName','variantSignature','createAttributeTokenMap','normalizeTokenSource','attributeToken','generateMissingSkus','generateVariantCombinations'];
function functions(source) {
  const ast=ts.createSourceFile('editor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX), found=[];
  function visit(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.push(n.getText(ast));ts.forEachChild(n,visit);} visit(ast);
  return ts.transpileModule(found.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
}
const helperPath='src/lib/pos/product-variants.ts';
let shared;
if(fs.existsSync(helperPath)) { const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(helperPath,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,scope);shared=scope.exports; }
const plain=value=>JSON.parse(JSON.stringify(value));
function run(source) {
  const ctx={productForm:{hasVariants:true,productCode:'LEG001',defaultUnitCode:'piece'},attributes:[{code:'color',sort_order:1,use_in_variant_name:true},{code:'size',sort_order:2,use_in_variant_name:true}],attributeValues:{color:['Negro','Rosa','Beige'],size:['CH','M','G','XL']},variants:[],setError:m=>{throw Error(m)},setNotice:()=>{},product_variants_1:shared};
  Object.assign(ctx,shared); if(shared) { ctx.generateVariantSkus=shared.generateMissingSkus; ctx.variantSignature=shared.legacyVariantSignature; } ctx.setVariants=f=>ctx.variants=typeof f === "function" ? f(ctx.variants) : f;vm.createContext(ctx);vm.runInContext(functions(source),ctx);
  vm.runInContext('generateVariantCombinations();generateMissingSkus()',ctx);
  assert.equal(ctx.variants.length,12);
  const skus=ctx.variants.map(v=>v.sku);
  assert.deepEqual(plain(skus),['N','R','B'].flatMap(c=>['C','M','G','X'].map(s=>`LEG001-${c}-${s}`)));
  const signatures=ctx.variants.map(v=>ctx.variantSignature(v.attributes));assert.equal(new Set(signatures).size,12);
  ctx.variants[0].id='persisted';ctx.variants[0].sku='Manual-kept';ctx.productForm.productCode='OTHER';vm.runInContext('generateMissingSkus()',ctx);assert.equal(ctx.variants[0].sku,'Manual-kept');assert.equal(ctx.variants[1].sku,skus[1]);
  ctx.attributeValues.color=['Rosa','Beige'];vm.runInContext('generateVariantCombinations()',ctx);assert.equal(ctx.variants.find(v=>v.id==='persisted').active,false);
  ctx.attributeValues.color=['Negro','Rosa','Beige'];vm.runInContext('generateVariantCombinations()',ctx);assert.equal(ctx.variants.find(v=>v.id==='persisted').active,false,'POS preserves inactive flag on reintroduction');
  const tokens=['CH','M','G','XL','Árbol','Azul marino','42','!!!'].map(v=>ctx.attributeToken(v));assert.deepEqual(plain(tokens),['C','M','G','X','A','AM','42','X']);
  const collision=Array.from(ctx.createAttributeTokenMap(['Negro','Naranja','Negro']).entries());
  ctx.variants=[{sku:'BASE-N',attributes:{color:'Negro'}},{sku:'',attributes:{color:'Negro'}},{sku:'',attributes:{color:'Negro'}}];ctx.productForm.productCode='BASE';ctx.attributes=[{code:'color',sort_order:1}];vm.runInContext('generateMissingSkus()',ctx);assert.deepEqual(plain(ctx.variants.map(v=>v.sku)),['BASE-N','BASE-N-2','BASE-N-3']);
  ctx.variants=[{sku:'',attributes:{a:'One',b:'Two'}}];ctx.attributes=[{code:'a',sort_order:2},{code:'b',sort_order:1}];vm.runInContext('generateMissingSkus()',ctx);assert.equal(ctx.variants[0].sku,'BASE-T-O');
  const identity=[{}, {a:''},{a:null},{a:1},{a:true},{a:' Á '},{b:' B ',a:'A'},{a:'a',b:'b'}].map(v=>ctx.variantSignature(v));
  assert.equal(identity[0],identity[1]);assert.equal(identity[0],identity[2]);assert.equal(identity[6],identity[7]);
  return plain({skus,signatures,tokens,collision,identity});
}
const before=run(original);console.log('PASS BEFORE: frozen POS 3x4, SKU order/tokens/accents/numbers/collisions/manual, persisted/inactive reconciliation, legacy signature');
if(shared) {
  assert.deepEqual(run(fs.readFileSync(file,'utf8')),before);console.log('PASS AFTER: extracted POS behavior equals frozen baseline');
  assert.equal(shared.variantSignature({a:null}),'{"a":null}');assert.equal(shared.variantSignature({a:''}),'{"a":""}');
  assert.notEqual(shared.variantSignature({a:1}),shared.variantSignature({a:'1'}));assert.notEqual(shared.variantSignature({a:true}),shared.variantSignature({a:'true'}));
  assert.equal(shared.variantSignature({b:' B ',a:'A'}),shared.variantSignature({a:'a',b:'b'}));
  assert.throws(()=>shared.variantSignature({' A ':1,a:2}),/COLLISION/);
  assert.throws(()=>shared.generateCombinations([{code:'a',values:Array.from({length:101},(_,i)=>String(i))}],100),/LIMIT/);
  assert.equal(shared.generateCombinations([{code:'a',values:Array.from({length:250},(_,i)=>String(i))}],250).length,250);
  assert.equal(shared.generateCombinations([{code:'a',values:['same','same']}],100).length,2,'Legacy combination builder preserves input order/multiplicity; consumers validate duplicate signatures');
  assert.equal(shared.normalizeProductCode(' ab-01 '),'AB-01');assert.throws(()=>shared.normalizeProductCode('á bad'),/INVALID/);
  assert.equal(shared.validateSku('x'.repeat(90),'x'.repeat(90)),'x'.repeat(90));assert.throws(()=>shared.validateSku('x'.repeat(81)),/80/);
  console.log('PASS canonical SQL-compatible identity, explicit limits, product code and legacy SKU contract');
}
