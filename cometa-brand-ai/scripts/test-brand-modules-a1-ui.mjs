import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

// Actual component SSR. No browser/session/database or network is used.
const source=fs.readFileSync('src/app/workspace/brands/[brandSlug]/brand-modules.tsx','utf8');
const context={exports:{},require(name){
  if(name==='react')return React;
  if(name==='react/jsx-runtime')return jsx;
  if(name==='next/link')return {default:({children,...props})=>React.createElement('a',props,children)};
  throw Error('Unexpected import '+name);
}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
const fixture={brand:{id:'fixture',slug:'a1-brand',name:'Marca de prueba A1',status:'active'},os:{status:'active'},pos:{state:'unavailable',reason:'lifecycle_access_denied',lifecycleStatus:'suspended'},comu:{status:'not_configured',verification:null,storefront:null},store:{status:'disabled',revision:0}};
const render=value=>renderToStaticMarkup(React.createElement(context.exports.BrandModulesPanel,{initial:value}));
const html=render(fixture);
for(const text of ['COMETA OS','COMETA POS','COMU','Tienda online propia','Servicio deshabilitado','Tienda publicada: no implementada.','Habilitar servicio'])assert.ok(html.includes(text),text);
assert.ok(html.includes('/brand/a1-brand/os'));assert.ok(!html.includes('/brand/a1-brand/pos'));
const unknown=render({...fixture,store:null});assert.match(unknown,/No se pudo verificar/);assert.match(unknown,/<button[^>]*disabled=""[^>]*>Habilitar servicio/);
const enabled=render({...fixture,store:{status:'enabled',revision:1}});assert.match(enabled,/Servicio habilitado/);assert.match(enabled,/Suspender servicio/);assert.match(enabled,/Tienda publicada: no implementada/);
const suspended=render({...fixture,store:{status:'suspended',revision:2}});assert.match(suspended,/Servicio suspendido/);assert.match(suspended,/no elimina datos/);
const inactive=render({...fixture,brand:{...fixture.brand,status:'inactive'}});assert.match(inactive,/<button[^>]*disabled=""[^>]*>Habilitar servicio/);
assert.ok(!html.includes('Ver tienda'));assert.ok(!html.includes('href="https:'));
assert.match(source,/sm:grid-cols-2/);assert.match(source,/expectedRevision: data.store\?\.revision/);
console.log('PASS A1 actual component SSR: disabled/enabled/suspended/unknown/inactive, publication separation, navigation');

if(process.argv.includes('--evidence')){
  const {compile}=await import('@tailwindcss/node');
  const compiler=await compile('@import "tailwindcss";',{base:process.cwd(),onDependency(){}});
  const css=compiler.build([...html.matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)));
  fs.mkdirSync('docs/evidence/a1',{recursive:true});
  fs.writeFileSync('docs/evidence/a1/brand-modules-preview.html',`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A1 — preview sintético</title><style>${css}body{margin:0;padding:24px;background:#07111f;font-family:Arial,sans-serif}main{max-width:1120px;margin:auto}h1{color:white;font-size:28px}small{color:#d1d5db}</style><main><small>Preview aislado · datos sintéticos · sin conexiones</small><h1>Marca de prueba A1</h1>${html}</main></html>`);
  console.log('Generated synthetic component preview only; not a live workspace capture.');
}
