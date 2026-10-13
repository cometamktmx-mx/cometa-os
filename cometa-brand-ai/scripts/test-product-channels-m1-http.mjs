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
 const identity=new AsyncLocalStorage();let failTable=null,mode='RETAIL';
 const json=async q=>JSON.parse(await sql('set role service_role;'+q));
 const ident=v=>{assert.match(v,/^[a-z_][a-z_0-9]*$/);return v;};
 const value=v=>v===null?'null':typeof v==='boolean'||typeof v==='number'?String(v):quote(v);
 const admin={from(table){
   ident(table);let fields='',filters=[],single=false,limit='',order='';
   const q={select(f){fields=f;return q;},eq(k,v){
     filters.push(k==='product.brand_slug'?`product_id in(select id from pos_products where brand_slug=${value(v)})`:`${ident(k)}=${value(v)}`);return q;
   },ilike(k,v){filters.push(`${ident(k)} ilike ${value(v)}`);return q;},
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
 },async rpc(name,args){assert.equal(name,'pos_set_product_channels_m1');try{return{data:await json(`select public.${name}(${Object.entries(args).map(([k,v])=>`${ident(k)}=>${value(v)}`).join(',')})`),error:null};}catch(e){return{data:null,error:{message:e.message}};}}};
 class ApiError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
 const ok=(data,status=200)=>Response.json({ok:true,...data},{status,headers:{'Cache-Control':'private, no-store'}});
 const fail=(error,status=400,code='ERROR')=>Response.json({ok:false,error,code},{status,headers:{'Cache-Control':'private, no-store'}});
 let rbac;
 const context=async({brandSlug})=>{
   const userId=identity.getStore();if(!userId)throw new ApiError(401,'UNAUTHENTICATED','No session');
   const profile=await admin.from('user_profiles').select('role,status').eq('user_id',userId).maybeSingle();
   if(profile.data?.status!=='active')throw new ApiError(403,'INACTIVE','Inactive');
   const brand=await admin.from('brands').select('id,slug,status').eq('slug',brandSlug).maybeSingle();if(!brand.data)throw new ApiError(404,'BRAND_NOT_FOUND','Missing');
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
     getBrandSlugFromUrl:r=>new URL(r.url).searchParams.get('brandSlug'),
     assertDatabaseResult:e=>{if(e)throw new ApiError(503,'DB_ERROR','Lookup failed');},
     requiredText:v=>{if(typeof v!=='string'||!v)throw new ApiError(400,'INVALID','Invalid');return v;},
     uuidValue:v=>{if(!/^[a-f0-9-]{36}$/.test(v))throw new ApiError(400,'INVALID','Invalid');return v;},
     getPagination:r=>{const u=new URL(r.url),page=Number(u.searchParams.get('page')||1),size=Number(u.searchParams.get('pageSize')||10);return {page,pageSize:size,from:(page-1)*size,to:page*size-1};},
   },
 };
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const out={exports:{}};cache.set(file,out.exports);
   vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:out,exports:out.exports,Response,Request,URL,console,
    require:name=>{if(name in mocks)return mocks[name];if(name.startsWith('node:')||name==='@supabase/supabase-js')return nativeRequire(name);const target=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);const canonical='@/'+path.relative(path.resolve('src'),target).replaceAll('\\','/');if(canonical in mocks)return mocks[canonical];return load(target+'.ts');}}, {filename:file});return out.exports;
 }
 rbac=load('src/lib/pos/rbac.ts');
 const routes={channels:load('src/app/api/pos/products/[productId]/channels/route.ts'),products:load('src/app/api/pos/products/route.ts'),scan:load('src/app/api/pos/product-scan/route.ts')};
 const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,body:req.method==='PATCH'?Buffer.concat(chunks).toString():undefined});const kind=new URL(request.url).pathname.slice(1);const response=await identity.run(req.headers['x-user']||null,()=>routes[kind][req.method](request,{params:Promise.resolve({productId:ids.product})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e)}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=async(kind='channels',body=null,user=ids.owner,query='')=>{
   const response=await fetch(`http://127.0.0.1:${server.address().port}/${kind}?brandSlug=m1-brand${query}`,{method:body?'PATCH':'GET',headers:{...(user?{'x-user':user}:{}),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
   return {status:response.status,body:await response.json()};
 };
 try{
   const read=await request();assert.equal(read.status,200,JSON.stringify(read));assert.equal(read.body.channels.physicalRequested,false);assert.equal(read.body.channels.onlineRequested,false);assert.equal(read.body.channels.revision,5);
   assert.equal((await request('channels',null,null)).status,401);
   assert.equal((await request('channels',null,ids.other)).status,403);
   const state={physicalRequested:true,onlineRequested:true,revision:5};
   assert.equal((await request('channels',state,ids.viewer)).status,403);
   assert.equal((await request('channels',state,ids.inventory)).status,403);
   assert.equal((await request()).body.channels.physicalRequested,false);
   const applied=await request('channels',state);assert.equal(applied.status,200,JSON.stringify(applied));assert.equal(applied.body.channels.onlineEffective,true,'zero stock is still catalog eligible');
   const onlyOnline=await request('channels',{physicalRequested:false,onlineRequested:true,revision:6});assert.equal(onlyOnline.status,200);
   assert.equal((await request('channels',state)).status,409);
   const all=await request('products');assert.equal(all.status,200,JSON.stringify(all));assert.equal(all.body.products.length,2);
   const physical=await request('products',null,ids.owner,'&channel=physical');assert.equal(physical.status,200,JSON.stringify(physical));assert.deepEqual(physical.body.products.map(p=>p.id),[ids.legacy]);assert.equal(physical.body.pagination.total,1);
   for(const code of ['1234567890123','M1SKU']){
     assert.equal((await request('scan',null,ids.owner,'&code='+code)).status,409);
     const adminScan=await request('scan',null,ids.owner,'&surface=administration&code='+code);assert.equal(adminScan.status,200);assert.equal(adminScan.body.found,true);
   }
   mode='CAFE';assert.equal((await request('products',null,ids.owner,'&channel=physical')).body.products.length,2);assert.equal((await request('scan',null,ids.owner,'&code=M1SKU')).status,200);mode='RETAIL';
   await sql(`set role service_role;select public.brand_online_store_set_access_a1('m1-brand','${ids.admin}','suspended',1)`);
   const suspended=await request();assert.equal(suspended.body.channels.onlineRequested,true);assert.equal(suspended.body.channels.onlineEffective,false);
   assert.equal((await request('channels',{physicalRequested:true,onlineRequested:true,revision:7},ids.inventory)).status,200,'unchanged online selection does not require online change permission');
   assert.equal((await request('channels',{physicalRequested:true,onlineRequested:false,revision:8})).status,200);
   assert.equal((await request('channels',{physicalRequested:false,onlineRequested:true,revision:9})).status,409);
   assert.equal((await request()).body.channels.physicalRequested,true,'denied online request must not partially remove physical');
   failTable='pos_product_sales_channels';assert.equal((await request()).status,503);assert.equal((await request('scan',null,ids.owner,'&code=M1SKU')).status,503);failTable=null;
   console.log('PASS HTTP real SQL: reload, permissions/atomic denial, zero stock, A1 suspension, admin visibility, physical pagination, SKU/barcode, Food passthrough');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
