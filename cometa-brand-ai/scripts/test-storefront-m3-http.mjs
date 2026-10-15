import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import http from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
import {createRequire} from 'node:module';
const nativeRequire=createRequire(import.meta.url);

// Real handlers, loopback HTTP and PostgreSQL. Session/commercial POS context
// and Supabase query transport are injected; SQL publication is never mocked.
export async function certify({sql,ids,quote}){
 const identity=new AsyncLocalStorage();const failTable=null,mode='RETAIL';
 const json=async q=>JSON.parse(await sql('set role service_role;'+q));
 const ident=v=>{assert.match(v,/^[a-z_][a-z_0-9]*$/);return v;};
 const value=v=>v===null?'null':typeof v==='boolean'||typeof v==='number'?String(v):Array.isArray(v)?quote('{'+v.join(',')+'}')+'::uuid[]':typeof v==='object'?quote(JSON.stringify(v))+'::jsonb':quote(v);
 const admin={from(table){
   ident(table);let fields='',filters=[],single=false,limit='',order='';
   const q={select(f){fields=f;return q;},eq(k,v){
     filters.push(k==='product.brand_slug'?`product_id in(select id from pos_products where brand_slug=${value(v)})`:`${ident(k)}=${value(v)}`);return q;
   },in(k,vs){filters.push(ident(k)+' in ('+vs.map(value).join(',')+')');return q;},ilike(k,v){filters.push(`${ident(k)} ilike ${value(v)}`);return q;},
   not(k,op,v){assert.equal(k,'id');assert.equal(op,'in');const keys=v.slice(1,-1).split(',');keys.forEach(k=>assert.match(k,/^[0-9a-f-]{36}$/));filters.push(`id not in (${keys.map(quote).join(',')})`);return q;},
   order(k,opts){order=` order by ${ident(k)} ${opts?.ascending===false?'desc':'asc'}`;return q;},
   range(a,b){limit=` limit ${Number(b-a+1)} offset ${Number(a)}`;return q;},limit(n){limit=` limit ${Number(n)}`;return q;},
   maybeSingle(){single=true;return q;},single(){single=true;return q;},
   async then(resolve){
     if(failTable===table)return resolve({data:null,error:{message:'INJECTED_FAILURE'}});
     try{
       let projection=fields;
       if(table==='pos_products'&&fields.includes('variants:'))projection="t.*,null::jsonb category,(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('inventory',(select coalesce(jsonb_agg(i),'[]') from pos_inventory i where i.variant_id=v.id))),'[]') from pos_product_variants v where v.product_id=t.id) variants";
       else if(table==='pos_product_variants'&&fields.includes('product:'))projection="t.*,(select to_jsonb(p) from pos_products p where p.id=t.product_id) product,(select coalesce(jsonb_agg(i),'[]') from pos_inventory i where i.variant_id=t.id) inventory";
       else if(table==='pos_product_sales_channels'&&fields.includes('product:'))projection='product_id';
       else assert.match(fields,/^[a-z_0-9,]+$/);
       const base=`from public.${table} t${filters.length?' where '+filters.join(' and '):''}`;
       const result=await json(`select jsonb_build_object('rows',(select coalesce(jsonb_agg(x),'[]') from (select ${projection} ${base}${order}${limit})x),'count',(select count(*) ${base}))`);
       if(single&&result.rows.length>1)throw Error('Multiple rows');
       resolve({data:single?result.rows[0]??null:result.rows,error:null,count:result.count});
     }catch(e){resolve({data:null,error:{message:e.message}});}
   }};return q;
 },async rpc(name,args){assert.ok(['brand_storefront_save_m3','brand_storefront_cards_m3'].includes(name));try{return{data:await json(`select public.${name}(${Object.entries(args).map(([k,v])=>`${ident(k)}=>${value(v)}`).join(',')})`),error:null};}catch(e){return{data:null,error:{message:e.message}};}}};
 class ApiError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
 const ok=(data,status=200)=>Response.json({ok:true,...data},{status,headers:{'Cache-Control':'private, no-store'}});
 const fail=(error,status=400,code='ERROR')=>Response.json({ok:false,error,code},{status,headers:{'Cache-Control':'private, no-store'}});
 let rbac;
 const context=async({brandSlug})=>{
   const userId=identity.getStore();if(!userId)throw new ApiError(401,'UNAUTHENTICATED','No session');
   const profile=await admin.from('user_profiles').select('role,status').eq('user_id',userId).maybeSingle();
   if(profile.data?.status!=='active')throw new ApiError(403,'INACTIVE','Inactive');
   const brand=await admin.from('brands').select('id,slug,name,status').eq('slug',brandSlug).maybeSingle();if(!brand.data)throw new ApiError(404,'BRAND_NOT_FOUND','Missing');
   const member=await admin.from('user_brand_access').select('user_id,brand_slug,access_role,status').eq('user_id',userId).eq('brand_slug',brandSlug).maybeSingle();
   const membership=rbac.resolvePosMembership(member.data);const isAdmin=profile.data.role==='admin';
   if(!isAdmin&&!membership)throw new ApiError(403,'FORBIDDEN','Denied');
   return {admin,brand:brand.data,user:{userId,isAdmin},membership};
 };
 const mocks={
   'server-only':{},'@/lib/brand-os/server':{BrandOsGuardError:ApiError},'@/lib/supabase/server':{},
   '@/lib/pos/access':{requirePosOperationalAccess:context},
   '@/lib/pos/staff-server':{getPosMode:async()=>mode,getStaffSession:async()=>null},
   '@/lib/pos/device-server':{assertDeviceLocation:()=>{}},
   '@/lib/pos/server':{PosApiError:ApiError,getAdminClient:()=>admin,ok,fail,handlePosError:e=>fail(e.message,e.status||500,e.code),
     getBrandSlugFromUrl:r=>new URL(r.url).searchParams.get('brandSlug'),readJsonBody:r=>r.json(),
     assertDatabaseResult:e=>{if(e)throw new ApiError(503,'DB_ERROR','Lookup failed');},
     requiredText:v=>{if(typeof v!=='string'||!v)throw new ApiError(400,'INVALID','Invalid');return v;},
     uuidValue:v=>{if(v==null||v==='')return null;if(!/^[a-f0-9-]{36}$/.test(v))throw new ApiError(400,'INVALID','Invalid');return v;},
     getPagination:r=>{const u=new URL(r.url),page=Number(u.searchParams.get('page')||1),size=Number(u.searchParams.get('pageSize')||10);return {page,pageSize:size,from:(page-1)*size,to:page*size-1};},
   },
 };
 const uploads=[];let removals=0;
 admin.storage={from:()=>({getPublicUrl:p=>({data:{publicUrl:'http://127.0.0.1:54321/storage/v1/object/public/pos-products/'+p}}),upload:async(p)=>{uploads.push(p);return{error:null};},remove:async()=>{removals++;return{error:null};}})};
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const out={exports:{}};cache.set(file,out.exports);
   vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:out,exports:out.exports,Response,Request,URL,File,FormData,Uint8Array,console,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'}},
    require:name=>{if(name in mocks)return mocks[name];if(name.startsWith('node:')||name==='@supabase/supabase-js')return nativeRequire(name);const target=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);const canonical='@/'+path.relative(path.resolve('src'),target).replaceAll('\\','/');if(canonical in mocks)return mocks[canonical];return load(target+'.ts');}}, {filename:file});return out.exports;
 }
 rbac=load('src/lib/pos/rbac.ts');
 const routes={web:load('src/app/api/pos/online-store/appearance/route.ts')};
 const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,body:req.method==='PATCH'?Buffer.concat(chunks).toString():undefined});const response=await identity.run(req.headers['x-user']||null,()=>routes.web[req.method](request,{params:Promise.resolve({productId:ids.product})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e)}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=async(body=null,user=ids.owner,query='')=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/web?brandSlug=m1-brand${query}`,{method:body?'PATCH':'GET',headers:{...(user?{'x-user':user}:{}),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  assert.match(response.headers.get('cache-control')??'',/private, no-store/);
  return {status:response.status,body:await response.json()};
 };
 try{
  const loaded=await request();assert.equal(loaded.status,200,JSON.stringify(loaded));assert.equal(loaded.body.revision,5);assert.equal(loaded.body.service,'suspended');
  const document=loaded.body.draft;
  for(const user of [null,ids.viewer,ids.inventory,ids.other])assert.ok([401,403].includes((await request(null,user)).status));
  const saved=await request({revision:5,document,publish:false});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.body.appearance.revision,6);
  assert.deepEqual((await request()).body.draft,document);
  assert.equal((await request({revision:5,document,publish:false})).status,409);
  assert.equal((await request({revision:6,document,publish:true})).status,409);
  assert.equal((await request({revision:6,document,publish:false,actor:ids.admin})).status,400);
  assert.equal((await request({revision:6,document:{...document,navigation:[{title:'Unsafe',url:'javascript:alert(1)'}]},publish:false})).status,400);
  assert.equal((await request({revision:6,document:{...document,logo:'m1-other/web/foreign.jpg'},publish:false})).status,400);
  console.log('PASS M3 loopback HTTP actual route+SQL; session/commercial context and Supabase transport simulated. Auth, private/no-store, draft reload, CAS, suspension, URL/media validation.');
 }finally{await new Promise(r=>server.close(r));}
}