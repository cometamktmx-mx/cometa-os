import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),cache=new Map();let selected='';
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const loaded={exports:{}};cache.set(file,loaded.exports);const link=({href,children,...props})=>React.createElement('a',{href,...props},children);
 const deps=name=>{
  if(name==='next/link')return {__esModule:true,default:link};
  if(name==='next/image')return {__esModule:true,default:({unoptimized,...props})=>{void unoptimized;return React.createElement('img',props);}};
  if(name==='next/navigation')return {useSearchParams:()=>new URLSearchParams(selected?'order='+selected:'')};
  if(name.endsWith('/pos-shell'))return {usePosContext:()=>({brand:{slug:'fixture',name:'Fixture'}})};
  if(name.endsWith('/pos-icons'))return {PosIcon:()=>null};if(name.endsWith('/pos-ui'))return {PosDrawer:()=>null};
  if(name.startsWith('.')||name.startsWith('@/')){const base=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);const found=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(found)return load(found);}
  return require(name);
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:loaded,exports:loaded.exports,require:deps,URLSearchParams,Intl,Date,console});return loaded.exports;
}
const presentation=load('packages/own-storefront/order-presentation.ts');
for(const [code,label] of Object.entries({CREATED:'Pedido creado',PAYMENT_PAID:'Pago confirmado',PAYMENT_EXPIRED:'Pago vencido',PREPARING:'Preparación iniciada',SHIPPED:'Pedido enviado',DELIVERED:'Pedido entregado',CANCELLED:'Pedido cancelado'}))assert.equal(presentation.orderEventLabel(code),label);
assert.equal(presentation.orderEventLabel('UNKNOWN_INTERNAL'),'Pedido actualizado');assert.equal(presentation.orderStateLabel('UNKNOWN_INTERNAL'),'Estado por confirmar');assert.equal(presentation.orderStateLabel('READY','PICKUP'),'Listo para recoger');
assert.equal(presentation.orderEventLabel('constructor'),'Pedido actualizado');assert.equal(presentation.orderStateLabel('toString'),'Estado por confirmar');
const sidebar=load('src/app/brand/[brandSlug]/components/pos-sidebar.tsx'),nav=sidebar.POS_NAV_ITEMS,sales=nav.findIndex(x=>x.route==='sales');assert.equal(nav[sales+1].route,'online-store/orders');assert.equal(nav[sales+1].section,'Operación');assert.equal(nav.filter(x=>x.route==='online-store').length,1);assert.equal(nav.find(x=>x.route==='online-store').section,'Sistema');assert.ok(!nav.some(x=>x.route.includes('appearance')));assert.equal(nav[sales+1].retailOnly,true);
assert.equal(sidebar.isActivePath({pathname:'/brand/fixture/pos/online-store/orders',href:'/brand/fixture/pos/online-store',isHome:false}),false);
assert.equal(sidebar.isActivePath({pathname:'/brand/fixture/pos/online-store/orders',href:'/brand/fixture/pos/online-store/orders',isHome:false}),true);
const id='11111111-1111-4111-8111-111111111111',order={id,status:'PAID',payment_method:'STRIPE',delivery_method:'PICKUP',preparation_status:'NEW',delivery_status:'PENDING',tracking:null,refund_required:false,operation_revision:0,currency:'MXN',total_cents:9000,subtotal_cents:9000,shipping_cents:0,created_at:'2026-10-14T12:00:00Z',contact:{name:'Cliente',email:'test@example.test',phone:'5555555555'},delivery_snapshot:{pickup:{address:'Sucursal histórica',hours:'10–18',instructions:'Presentar folio'}}};
const item={id,quantity:1,unit_cents:9000,snapshot:{name:'Nombre histórico',variantName:'Variante histórica',retailUnitCents:10000},current:{sku:'SKU-ACTUAL',barcode:null}};
const {OrderDetail}=load('src/app/brand/[brandSlug]/pos/online-store/order-detail.tsx');
const render=(o=order,i=item)=>renderToStaticMarkup(React.createElement(OrderDetail,{order:o,items:[i],events:[{id,created_at:order.created_at,kind:'PAYMENT_PAID',detail:{}},{id:'other',created_at:order.created_at,kind:'UNKNOWN_INTERNAL',detail:{}}],busy:false,tracking:'',setTracking:()=>{},act:async()=>{}}));
const html=render();for(const text of ['Nombre histórico','Referencia actual del catálogo','SKU-ACTUAL','Sin imagen','Cliente','Sucursal histórica','Presentar folio','Descuentos','Pago confirmado','Pedido actualizado','Preparar pedido'])assert.ok(html.includes(text),text);assert.ok(!html.includes('UNKNOWN_INTERNAL'));assert.ok(!html.includes('PAYMENT_PAID'));assert.ok(!html.includes('Marcar como entregado'));
assert.ok(render({...order,preparation_status:'READY'}).includes('Marcar como entregado'));assert.ok(!render({...order,status:'PENDING'}).includes('Preparar pedido'));
assert.ok(render(order,{...item,snapshot:{name:'Histórico'}}).includes('No desglosados'));assert.equal(presentation.orderAmounts(order,[item]).discount,1000);
assert.ok(render(order,{...item,snapshot:{...item.snapshot,sku:'SKU-HISTORICO',options:{Talla:'M'}},imageUrl:'https://example.test/snapshot.webp'}).includes('SKU-HISTORICO'));
assert.ok(render(order,{...item,fallbackImageUrl:'https://example.test/current.webp'}).includes('Imagen actual'));
const {StoreOperations}=load('src/app/brand/[brandSlug]/pos/online-store/operations.tsx');selected=id;
const page=renderToStaticMarkup(React.createElement(StoreOperations,{ordersView:true}));assert.ok(page.includes('Volver a pedidos'));assert.ok(!page.includes('Apariencia'));assert.ok(!page.includes('Configuración de tienda'));
console.log('PASS order presentation: real React markup, historic/missing snapshots, safe current fallback, discount unknown, action eligibility, shared translations, neutral unknown events, navigation and active item. Responsive classes inspected; not browser visual approval.');
