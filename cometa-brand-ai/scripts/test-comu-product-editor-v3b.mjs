// Component-level failure injection. Not a substitute for real HTTP/Storage certification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
function load(file, imports, globals={}) {const scope={exports:{},console,crypto,...globals,require(name){assert.ok(name in imports,name);return imports[name];}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,scope);return scope.exports;}
const shared=load('src/lib/pos/product-variants.ts',{});
const copy=x=>JSON.parse(JSON.stringify(x));
const base={products:[],variants:[],inventory:[],locations:[],categories:[],listings:[],progress:{publishedListings:0,minimumListings:10},variantContract:{version:1,skuMaxLength:80,maxVariants:100},attributeDefinitions:[{id:'c',code:'color',name:'Color',sort_order:0,options:['Negro','Rosa','Beige'],input_type:'select',use_in_variant_name:true},{id:'s',code:'size',name:'Talla',sort_order:1,options:['CH','M','G','XL'],input_type:'select',use_in_variant_name:true}]};
function harness({legacy=false,lost=false,mediaFailure=false,wholesaleFailure=false}={}) {
  let states=[],refs=[],cursor=0,refCursor=0,effects=[],requests=[],snapshot=copy(base),saved=new Map(),writes=0,uploads=0,publications=0,wholesaleWrites=0;
  if(legacy){snapshot.products=[{id:'p',name:'Legacy',description:'Original',product_code:'legacy / code',category_id:null,updated_at:'old'}];snapshot.variants=[{id:'v',product_id:'p',name:'Legacy variant',sku:'S'.repeat(90),attributes:{weight:1,enabled:true,empty:null,nested:{a:'B'}},active:false,price:29,barcode:'2000000000008'}];snapshot.inventory=[{variant_id:'v',location_id:'l',quantity:9,reserved_quantity:3}];snapshot.listings=[{id:'listing',product_id:'p',status:'DRAFT'}];}
  let wholesale={override:{mode:'DISABLED'},tiers:[]};
  const Media=()=>null;
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(initial){const i=refCursor++;return refs[i]??={current:initial};},useEffect(effect){effects.push(effect);}};
  const result=load('src/app/comu/seller/product-editor.tsx',{'react':react,'react/jsx-runtime':jsx,'next/image':{default:()=>null},'@/lib/pos/product-variants':shared,'./product-editor.css':{},'./product-editor-media':{default:Media}},{fetch:async(url,options)=>{
    if(url.includes('sellers?'))return {ok:true,json:async()=>({sellers:[{id:'seller',status:'PREPARING'}]})};
    if(url.includes('wholesale')){if(options?.method){wholesaleWrites++;const b=JSON.parse(options.body);if(wholesaleFailure){wholesaleFailure=false;throw Error('controlled wholesale failure');}wholesale={override:{mode:b.mode},tiers:b.tiers.map(t=>({min_quantity:t.minQuantity,pricing_mode:t.pricingMode,value:t.value}))};}return {ok:true,json:async()=>wholesale};}
    if(!options?.method)return {ok:true,json:async()=>copy(snapshot)};
    const body=JSON.parse(options.body);requests.push({url,body});
    if(url.endsWith('/catalog')){if(!saved.has(body.requestId)){writes++;const p=body.product;const pid=p.id||'p';snapshot.products=[{id:pid,name:p.name,description:p.description,category_id:null,product_code:Object.hasOwn(p,'productCode')?p.productCode:snapshot.products[0]?.product_code,updated_at:'saved'}];snapshot.variants=p.variants.map((v,i)=>({...v,id:v.id||'v'+i,product_id:pid,barcode:legacy?'2000000000008':null}));snapshot.listings=[{id:'listing',product_id:pid,status:snapshot.listings[0]?.status||'DRAFT'}];saved.set(body.requestId,{productId:pid,listingId:'listing'});}if(lost){lost=false;throw Error('lost response after commit');}return {ok:true,json:async()=>saved.get(body.requestId)};}
    if(url.endsWith('/listings')){publications++;snapshot.listings[0].status=body.status;return {ok:true,json:async()=>({ok:true})};}throw Error(url);
  }});
  function nodes(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
  function render(){cursor=0;refCursor=0;effects=[];const tree=result.default({sellerId:'seller',productId:legacy?'p':undefined,done:async()=>{},cancel(){}});nodes(tree).find(n=>n.type===Media).props.handle.current={flush:async()=>{uploads++;if(mediaFailure){mediaFailure=false;throw Error('controlled image failure');}}};return tree;}
  const find=(predicate)=>{const node=nodes(render()).find(predicate);assert.ok(node,'Missing control');return node;};
  const text=node=>[node?.props?.children].flat(Infinity).filter(v=>typeof v==='string'||typeof v==='number').join('');
  const button=label=>find(n=>n.type==='button'&&text(n)===label);
  const field=(label,value)=>{const parent=find(n=>n.type==='label'&&text(n).includes(label));const input=nodes(parent).find(n=>n.type==='input'||n.type==='textarea');input.props.onChange({target:{value}});};
  const change=(aria,value)=>find(n=>n.props?.['aria-label']===aria).props.onChange({target:{value}});
  return {result,async init(){render();for(const effect of effects)effect();await new Promise(r=>setTimeout(r,0));render();},render,find,nodes,text,button,field,change,async save(publish=false){if(publish)await button('Publicar producto').props.onClick({preventDefault(){},currentTarget:{form:{reportValidity:()=>true}}});else await render().props.onSubmit({preventDefault(){}});await new Promise(r=>setTimeout(r,0));},get stats(){return {requests,writes,uploads,publications,wholesaleWrites,snapshot}}};
}
const h=harness({lost:true,mediaFailure:true});await h.init();h.field('Nombre del producto','LOCAL TEST editor');h.field('Código de producto','leg001');
for(const option of ['Negro','Rosa','Beige','CH','M','G','XL'])h.button(option).props.onClick();
h.button('Generar combinaciones').props.onClick();h.button('Generar SKU faltantes').props.onClick();
assert.equal(h.nodes(h.render()).filter(n=>n.props?.['aria-label']?.startsWith('SKU variante')).length,12);
assert.equal(h.find(n=>n.props?.['aria-label']==='SKU variante 1').props.value,'LEG001-N-C');
h.change('SKU variante 1','MANUAL-KEEP');h.field('Precio de venta','499');h.button('Aplicar precio a todas').props.onClick();
await h.save(true);assert.equal(h.stats.writes,1);assert.equal(h.stats.publications,0);
await h.save();assert.equal(h.stats.writes,1);assert.equal(h.stats.publications,0);
await h.save();assert.equal(h.stats.writes,1);assert.equal(h.stats.publications,1);assert.equal(h.stats.snapshot.variants[0].sku,'MANUAL-KEEP');
const catalogs=h.stats.requests.filter(r=>r.url.endsWith('/catalog'));assert.equal(catalogs.length,2);assert.equal(catalogs[0].body.requestId,catalogs[1].body.requestId);assert.equal(catalogs[0].body.product.variants[0].stock.length,0);
assert.equal(catalogs[0].body.product.variants.length,12);assert.equal(catalogs[0].body.product.variants[0].price,499);
h.button('Retirar').props.onClick();await h.save();assert.equal(h.stats.snapshot.variants[0].active,false);h.button('Reactivar').props.onClick();await h.save();assert.equal(h.stats.snapshot.variants[0].id,'v0');assert.equal(h.stats.snapshot.variants[0].active,true);
const legacy=harness({legacy:true});await legacy.init();legacy.field('Descripción','Only description changed');await legacy.save();const payload=legacy.stats.requests.find(r=>r.url.endsWith('/catalog')).body.product;
assert.equal(Object.hasOwn(payload,'productCode'),false);assert.equal(legacy.stats.snapshot.products[0].product_code,'legacy / code');assert.equal(payload.variants[0].sku.length,90);assert.deepEqual(payload.variants[0].attributes,{weight:1,enabled:true,empty:null,nested:{a:'B'}});assert.equal(payload.variants[0].id,'v');assert.equal(payload.variants[0].active,false);assert.deepEqual(payload.variants[0].stock,[]);assert.equal('barcode' in payload.variants[0],false);assert.equal(legacy.stats.publications,0);
const w=harness({wholesaleFailure:true});await w.init();w.field('Nombre del producto','Wholesale fixture');w.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});w.button('+ Agregar nivel').props.onClick();await w.save(true);assert.equal(w.stats.writes,1);assert.equal(w.stats.publications,0);await w.save();assert.equal(w.stats.writes,1);assert.equal(w.stats.wholesaleWrites,2);assert.equal(w.stats.publications,1);
assert.ok(!h.nodes(h.render()).some(n=>h.text(n).includes('JSON')));
console.log('PASS V3B component: 3x4/shared SKU/manual, price all, draft/publish, lost response/idempotency, media/wholesale partial failure + retry, no repeated stock, retirement/reactivation IDs, typed legacy/code/SKU/barcode preservation.');
