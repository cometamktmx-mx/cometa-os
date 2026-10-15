import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Actual Next page and renderer, anonymous PostgreSQL role. Supabase transport is injected.
// No cookies, external network, storage upload or real PostgREST certification.
export async function certify({sql,quote}) {
 const calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});assert.equal(name,'brand_storefront_catalog_m4');try{const value=await sql(`set role anon;select brand_storefront_catalog_m4(${quote(args.p_brand_slug)},${quote(JSON.stringify(args.p_query))})`);return{data:value?JSON.parse(value):null,error:null};}catch{return{data:null,error:{message:'Fixture query failure'}};}},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'http://127.0.0.1:54321/storage/v1/object/public/pos-products/'}})})}};
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,URL,URLSearchParams,console,process:{env:{STOREFRONT_BRAND_SLUG:'m1-brand',STOREFRONT_SUPABASE_URL:'http://127.0.0.1:54321',STOREFRONT_SUPABASE_ANON_KEY:'local-test-public-key'}},require:name=>{if(name==='@supabase/supabase-js')return{createClient:()=>client};if(!name.startsWith('.'))return require(name);let target=path.resolve(path.dirname(file),name);target+=fs.existsSync(target+'.tsx')?'.tsx':'.ts';return load(target);}}, {filename:file});return module.exports;
 }
 const Page=load('apps/magenta-storefront/app/catalogo/page.tsx').default;
 const server=http.createServer(async(req,res)=>{try{const searchParams=Object.fromEntries(new URL(req.url,'http://127.0.0.1').searchParams);const element=await Page({searchParams:Promise.resolve(searchParams)});res.writeHead(200,{'Content-Type':'text/html'});res.end(require('react-dom/server').renderToStaticMarkup(element));}catch{res.writeHead(503);res.end('Catalog unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${server.address().port}/catalogo`;
  const first=await fetch(base+'?q=algodón&color=Rosa&size=M&brandSlug=m1-other');assert.equal(first.status,200);const html=await first.text();assert.ok(html.includes('M1 product'));assert.ok(!html.includes('PRIVATE'));assert.equal(calls.at(-1).args.p_brand_slug,'m1-brand');
  const none=await(await fetch(base+'?color=Negro&size=M')).text();assert.ok(none.includes('No hay productos'));assert.ok(!none.includes('class="mc-card"'));
  const page=await(await fetch(base+'?sort=price_asc&page=2')).text();assert.equal((page.match(/class="mc-card"/g)||[]).length,2);
  console.log('PASS M4 HTTP SSR actual page/renderer and anonymous SQL; configured brand cannot be overridden, filters/counts/pagination/privacy. Supabase transport simulated.');
 }finally{await new Promise(r=>server.close(r));}
}
