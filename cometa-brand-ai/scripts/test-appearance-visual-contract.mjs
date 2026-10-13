import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('packages/own-storefront/'+name+(fs.existsSync('packages/own-storefront/'+name+'.tsx')?'.tsx':'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,URL,URLSearchParams,require:p=>p.startsWith('./')?load(p.slice(2)):require(p)});cache.set(name,module.exports);return module.exports;}
const {emptyAppearance,parseAppearance}=load('contract'),a=emptyAppearance();
const path='brand/web/asset/photo.jpg',mobile='brand/web/asset/mobile.webp';
const document={...a,mediaLayout:{[path]:{mobileImage:mobile,x:20,y:40,mobileX:75,mobileY:60}},buttonLabels:{hero:'Ver prendas'}};
const parsed=parseAppearance(document,'brand');assert.equal(parsed.mediaLayout[path].mobileImage,mobile);assert.equal(parsed.mediaLayout[path].mobileX,75);
assert.throws(()=>parseAppearance({...document,mediaLayout:{[path]:{...document.mediaLayout[path],mobileImage:'other/web/asset/secret.jpg'}}},'brand'));
assert.throws(()=>parseAppearance({...document,mediaLayout:{'other/web/photo.jpg':document.mediaLayout[path]}},'brand'));
for(const x of [-1,101,Infinity,NaN,'50'])assert.throws(()=>parseAppearance({...document,mediaLayout:{[path]:{...document.mediaLayout[path],x}}},'brand'));
assert.throws(()=>parseAppearance({...document,buttonLabels:{unknown:'Oops'}},'brand'));
assert.throws(()=>parseAppearance({...document,buttonLabels:{hero:'x'.repeat(81)}},'brand'));
assert.equal(parseAppearance(a,'brand').mediaLayout,undefined,'legacy shape unchanged');
document.sections=document.sections.map(s=>s.kind==='hero'?{...s,enabled:true,image:path,title:'A <script> is text',url:'/catalogo'}:s);
const markup=require('react-dom/server').renderToStaticMarkup(require('react').createElement(load('home').StoreHome,{appearance:document,products:[],mediaBase:'/'}));
assert.ok(markup.includes('mag-photo-desktop'));assert.ok(markup.includes('mag-photo-mobile'));assert.ok(markup.includes('20% 40%'));assert.ok(markup.includes('75% 60%'));assert.ok(markup.includes(mobile));assert.ok(markup.includes('Ver prendas'));assert.ok(!markup.includes('<script>'));
console.log('PASS editor contract: legacy compatibility, responsive media allowlist, brand isolation, crop bounds, button labels and shared escaped renderer. No DB or network.');

const {defaultElementDesign,defaultFooterDesign}=load('design-contract');
const design=defaultElementDesign(),footer=defaultFooterDesign();
assert.equal(parseAppearance({...a,design:{hero:design},footerDesign:footer},'brand').footerDesign.wordmark,false);
assert.throws(()=>parseAppearance({...a,design:{hero:{...design,background:'red;display:none'}}},'brand'));
assert.throws(()=>parseAppearance({...a,design:{unknown:design}},'brand'));
assert.throws(()=>parseAppearance({...a,footerDesign:{...footer,social:[{title:'X',url:'javascript:alert(1)'}]}},'brand'));
const render=(appearance,editor=false)=>require('react-dom/server').renderToStaticMarkup(require('react').createElement(load('home').StoreHome,{appearance,products:[],mediaBase:'/',editor,editorSelection:'hero'}));
assert.ok(!render(a).includes('Agregar imagen'));assert.ok(!render(a).includes('mag-wordmark'));assert.ok(render(a,true).includes('Contenido pendiente')||render(a,true).includes('Sección oculta'));
assert.ok(render({...a,footerDesign:{...footer,wordmark:true,wordmarkText:'Custom footer'}}).includes('Custom footer'));
console.log('PASS persisted design and footer allowlists; editor placeholders never public; wordmark opt-in.');

const {defaultPageLayout}=load('design-contract');const layouts={catalog:defaultPageLayout('catalog'),bag:{...defaultPageLayout('bag'),summary:'below'}};assert.equal(parseAppearance({...a,pageLayouts:layouts},'brand').pageLayouts.bag.summary,'below');assert.throws(()=>parseAppearance({...a,pageLayouts:{catalog:{...layouts.catalog,blocks:layouts.catalog.blocks.map(b=>({...b,enabled:false}))}}},'brand'));assert.ok(render({...a,pageLayouts:layouts}).includes('grid-template-columns:1fr'));console.log('PASS page block order/visibility persistence, mandatory commerce content and bag layout.');
