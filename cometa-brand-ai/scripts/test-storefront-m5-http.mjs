import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Real handlers/pages, real anonymous SQL. Supabase transport + environment injected.
export async function certify({sql,quote,ids,variant2,foreign}) {
 const client={rpc:async(name,a)=>{assert.ok(['brand_storefront_product_m5','brand_storefront_bag_validate_m5'].includes(name));try{const args=[a.p_brand_slug,a.p_product,...(name.includes('bag_validate')?[a.p_variant,a.p_quantity]:[])];const value=await sql(`set role anon;select ${name}(${args.map(quote).join(',')})`);return{data:value?JSON.parse(value):null,error:null};}catch{return{data:null,error:{}};}},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'http://127.0.0.1/media/'}})})}};
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,URL,URLSearchParams,Response,Request,console,process:{env:{STOREFRONT_BRAND_SLUG:'m1-brand',STOREFRONT_SUPABASE_URL:'http://127.0.0.1:54321',STOREFRONT_SUPABASE_ANON_KEY:'fixture-anon'}},require:name=>{if(name==='@supabase/supabase-js')return{createClient:()=>client};if(name==='next/navigation')return{notFound:()=>{throw Error('NOT_FOUND');}};if(!name.startsWith('.'))return require(name);let target=path.resolve(path.dirname(file),name);target+=fs.existsSync(target+'.tsx')?'.tsx':'.ts';return load(target);}}, {filename:file});return module.exports;}
 const {POST}=load('apps/magenta-storefront/app/api/bolsa/validar/route.ts');
 const Page=load('apps/magenta-storefront/app/productos/[productId]/page.tsx').default;
 const server=http.createServer(async(req,res)=>{try{if(req.method==='POST'){const chunks=[];for await(const b of req)chunks.push(b);const r=await POST(new Request('http://127.0.0.1/api/bolsa/validar',{method:'POST',body:Buffer.concat(chunks).toString()}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());}else{const url=new URL(req.url,'http://127.0.0.1');const element=await Page({params:Promise.resolve({productId:url.pathname.split('/').at(-1)}),searchParams:Promise.resolve(Object.fromEntries(url.searchParams))});res.writeHead(200,{'Cache-Control':'private, no-store'});res.end(require('react-dom/server').renderToStaticMarkup(element));}}catch(error){res.writeHead(error.message==='NOT_FOUND'?404:503);res.end('Unavailable');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
 const base=`http://127.0.0.1:${server.address().port}`, payload={productId:ids.product,variantId:variant2,quantity:1};
 const post=b=>fetch(base+'/api/bolsa/validar',{method:'POST',body:JSON.stringify(b)});
 const ok=await post(payload);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');assert.equal((await ok.json()).quantity,1);
 assert.equal((await post({...payload,quantity:2})).status,409);
 assert.equal((await post({...payload,productId:foreign})).status,409);
 assert.equal((await post({...payload,brandSlug:'m1-other'})).status,400);
 assert.equal((await post({...payload,price:0})).status,400);
 assert.equal((await post({...payload,quantity:1.5})).status,400);
 const valid=await fetch(base+'/productos/'+ids.product+'?variant='+variant2);assert.equal(valid.status,200);const html=await valid.text();assert.ok(html.includes('M1 product'));assert.ok(!html.includes('DRAFT SECRET'));
 assert.equal((await fetch(base+'/productos/'+foreign)).status,404);
 assert.equal((await fetch(base+'/productos/'+ids.legacy)).status,404);
 const invalid=await(await fetch(base+'/productos/'+ids.product+'?variant='+foreign)).text();assert.ok(invalid.includes('Selecciona una talla'));
 const detail=await client.rpc('brand_storefront_product_m5',{p_brand_slug:'m1-brand',p_product:ids.product});
 const color=detail.data.product.content.colors.find(c=>c.variantIds.includes(variant2));
 const fromCatalog=await(await fetch(base+'/productos/'+ids.product+'?color='+color.id+'&size=m')).text();
 assert.ok(fromCatalog.includes('aria-pressed="true">M'),'catalog color + size resolves the same real variant');
 console.log('PASS M5 HTTP: actual POST/page, anonymous SQL, gates, unknown brand/price rejected, quantity, direct URL, no-store. Transport simulated; not real PostgREST/cookies.');
 }finally{await new Promise(r=>server.close(r));}
}
