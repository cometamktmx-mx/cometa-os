import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';

// Actual component functions/handlers; hooks and HTTP transport are injected.
const file='src/app/brand/[brandSlug]/pos/products/product-channels.tsx';
const source=fs.readFileSync(file,'utf8');
const fixture={physicalRequested:true,onlineRequested:false,revision:0,physicalEffective:true,onlineEffective:false,catalogEligible:true,canManagePhysical:true,canManageOnline:true,serviceStatus:'enabled'};
let cursor=0,states=[],reply={ok:true,channels:{...fixture,onlineRequested:true,onlineEffective:true,revision:1}},calls=[];
const scope={exports:{},require(name){
 if(name==='react')return {useEffect(){},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
 if(name==='react/jsx-runtime')return jsx;
 if(name==='@/lib/pos/client-transport')return {usePosFetch:()=>async(url,options)=>{calls.push({url,options});return {ok:reply.ok,json:async()=>reply};}};
 throw Error('Unexpected import '+name);
}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,scope);
function render(productId='fixture'){cursor=0;return scope.exports.ProductSalesChannels({brandSlug:'m1-brand',productId});}
function reset(data=fixture){states=[data,data?.physicalRequested??true,data?.onlineRequested??false,false,null,null,false,0];calls=[];}
function elements(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(elements);return [node,...elements(node.props?.children)];}
reset();let tree=render();let inputs=elements(tree).filter(n=>n.type==='input');assert.equal(inputs.length,2);assert.equal(inputs[0].props.checked,true);assert.equal(inputs[1].props.checked,false);
inputs[1].props.onChange({target:{checked:true}});tree=render();elements(tree).find(n=>n.type==='button'&&n.props.children==='Guardar canales').props.onClick();
await new Promise(r=>setImmediate(r));assert.deepEqual(JSON.parse(calls[0].options.body),{physicalRequested:true,onlineRequested:true,revision:0});assert.equal(states[0].revision,1);assert.match(renderToStaticMarkup(render()),/Canales guardados/);
reply={ok:false,error:'Conflicto: recarga'};elements(render()).find(n=>n.type==='button'&&n.props.children==='Guardar canales').props.onClick();await new Promise(r=>setImmediate(r));assert.equal(states[6],true);assert.match(renderToStaticMarkup(render()),/Conflicto/);
reset({...fixture,serviceStatus:'suspended',onlineRequested:true});inputs=elements(render()).filter(n=>n.type==='input');assert.equal(inputs[1].props.checked,true);assert.match(renderToStaticMarkup(render()),/selección guardada se conserva/);
reset({...fixture,serviceStatus:'disabled'});assert.equal(elements(render()).filter(n=>n.type==='input')[1].props.disabled,true);
reset({...fixture,canManageOnline:false});assert.equal(elements(render()).filter(n=>n.type==='input')[1].props.disabled,true);
reset(null);assert.match(renderToStaticMarkup(render()),/Cargando canales/);assert.match(renderToStaticMarkup(render(null)),/Guarda primero el producto/);
const editor=fs.readFileSync('src/app/brand/[brandSlug]/pos/products/page.tsx','utf8');assert.match(editor,/!foodDirect \? <ProductSalesChannels/);assert.match(editor,/surface=administration/);
const register=fs.readFileSync('src/app/brand/[brandSlug]/pos/register/page.tsx','utf8');assert.match(register,/channel=physical/);
console.log('PASS M1 control: two checkboxes, payload limited to channels, save/reload state, conflict lock, suspension, permissions, Retail editor integration');
if(process.argv.includes('--evidence')){
 reset({...fixture,onlineRequested:true,onlineEffective:true,revision:1});const html=renderToStaticMarkup(render());
 const {compile}=await import('@tailwindcss/node');const compiler=await compile('@import "tailwindcss";',{base:process.cwd(),onDependency(){}});
 const css=compiler.build([...html.matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)));
 fs.mkdirSync('docs/evidence/m1',{recursive:true});fs.writeFileSync('docs/evidence/m1/product-channels-preview.html',`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1 control — fixture</title><style>${css}body{margin:0;padding:24px;background:#07111f;font-family:Arial,sans-serif}main{max-width:1000px;margin:auto}h1{color:white;font-size:28px}small{color:#ddd}</style><main><small>Control integrado en el editor Retail · preview aislado · datos sintéticos</small><h1>Canales del producto — prueba M1</h1>${html}</main></html>`);
}
