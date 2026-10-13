import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import ts from 'typescript';

// Real loopback HTTP handlers + PostgreSQL queries/RPCs. Supabase transport and
// session identity are injected; no browser cookies, PostgREST or provider calls.
export async function certify({sql,ids,quote}) {
  const identity=new AsyncLocalStorage(); let failTable=null;
  const ident=v=>{assert.match(v,/^[a-z_][a-z_0-9]*$/);return v;};
  const value=v=>v===null?'null':typeof v==='number'?String(v):quote(v);
  const json=async q=>JSON.parse(await sql('set role service_role;'+q));
  const admin={
    from(table){
      ident(table);let fields='',filters=[],single=false;
      const q={
        select(f){assert.match(f,/^[a-z_0-9,]+$/);fields=f;return q;},
        eq(k,v){filters.push(`${ident(k)}=${value(v)}`);return q;},
        in(k,vs){assert.ok(Array.isArray(vs)&&vs.length);filters.push(`${ident(k)} in (${vs.map(value).join(',')})`);return q;},
        maybeSingle(){single=true;return q;},
        async then(resolve){
          if(failTable===table)return resolve({data:null,error:{message:'INJECTED_LOOKUP_ERROR'}});
          try {
            const rows=await json(`select coalesce(jsonb_agg(x),'[]') from (select ${fields} from public.${table}${filters.length?' where '+filters.join(' and '):''}) x`);
            if(single&&rows.length>1)throw Error('Multiple rows');
            resolve({data:single?rows[0]??null:rows,error:null});
          }catch(e){resolve({data:null,error:{message:e.message}});}
        },
      };return q;
    },
    async rpc(name,args){
      assert.ok(['brand_online_store_set_access_a1','pos_get_effective_commercial_access','pos_get_subscription_lifecycle','pos_get_brand_entitlements'].includes(name));
      try{return {data:await json(`select to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${ident(k)}=>${value(v)}`).join(',')}))`),error:null};}
      catch(e){return {data:null,error:{message:e.message}};}
    },
  };
  class GuardError extends Error {constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
  const auth={auth:{getUser:async()=>({data:{user:identity.getStore()?{id:identity.getStore(),email:'fixture@example.test'}:null},error:null})}};
  const mocks={
    'server-only':{},
    '@supabase/supabase-js':{createClient:()=>admin},
    '@/lib/supabase/server':{createClient:async()=>auth},
    '@/lib/brand-os/server':{BrandOsGuardError:GuardError},
    '@/lib/pos/server':{
      getAdminClient:()=>admin,PosApiError:GuardError,
      assertDatabaseResult:(error)=>{if(error)throw Error('SQL error');},
      requirePosContext:async slug=>{
        // Tenant/session adapter only; actual workspace guard is loaded below.
        const result=await admin.from('brands').select('id,slug').eq('slug',slug).maybeSingle();
        if(!result.data)throw Error('Brand missing');return {admin,brand:result.data};
      },
    },
  };
  const cache=new Map();
  function load(file){
    file=path.resolve(file);if(cache.has(file))return cache.get(file);
    const out={exports:{}};cache.set(file,out.exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const req=name=>{
      if(name in mocks)return mocks[name];
      const target=name.startsWith('@/')?path.join('src',name.slice(2)):path.resolve(path.dirname(file),name);
      return load(target+'.ts');
    };
    vm.runInNewContext(code,{exports:out.exports,module:out,require:req,Response,Request,URL,console,
      process:{env:{NEXT_PUBLIC_SUPABASE_URL:'http://isolated.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-placeholder'}},
      fetch:()=>{throw Error('Provider/network call forbidden');}},{filename:file});
    return out.exports;
  }
  const route=load('src/app/api/admin/brands/[brandSlug]/modules/route.ts');
  const resolver=load('src/lib/workspace/online-store-access.ts');
  const server=http.createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,body:req.method==='PATCH'?Buffer.concat(chunks).toString():undefined});
      const result=await identity.run(req.headers['x-fixture-user']||null,()=>route[req.method](request,{params:Promise.resolve({brandSlug:req.url.split('/')[1]})}));
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
    }catch(e){res.writeHead(500);res.end(String(e));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const send=async(method='GET',body=null,user=ids.admin,slug='a1-brand',extra={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/${slug}`,{method,headers:{...(user?{'x-fixture-user':user}:{}),'content-type':'application/json',...extra},body:body?JSON.stringify(body):undefined});
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    return {status:response.status,body:await response.json()};
  };
  try{
    for(const [user,status] of [[null,401],[ids.inactive,403],[ids.owner,403],[ids.viewer,403]]){
      assert.equal((await send('GET',null,user)).status,status);
      assert.equal((await send('PATCH',{status:'enabled',expectedRevision:2},user)).status,status);
    }
    const snapshot=()=>sql("select jsonb_build_object('access',(select jsonb_agg(x) from brand_online_store_access x),'events',(select jsonb_agg(x order by revision) from brand_online_store_access_events x),'os',(select jsonb_agg(x) from brand_os_access x),'pos',(select jsonb_agg(x) from pos_subscriptions x),'members',(select jsonb_agg(x) from user_brand_access x))");
    const before=await snapshot();const read=await send();assert.equal(read.status,200,JSON.stringify(read));assert.equal(read.body.modules.store.status,'suspended');assert.equal(read.body.modules.os.status,'active');assert.equal(read.body.modules.pos.state,'unavailable');assert.equal(read.body.modules.comu.status,'not_configured');assert.equal(await snapshot(),before);
    assert.equal((await send('GET',null,ids.admin,'missing')).status,404);
    assert.equal((await send('PATCH',{status:'enabled',expectedRevision:2,actor:ids.admin})).status,400);
    assert.equal((await send('PATCH',{status:'enabled',expectedRevision:2},ids.admin,'a1-brand',{origin:'https://foreign.test'})).status,403);
    const access=user=>identity.run(user,()=>resolver.resolveOnlineStoreAccess('a1-brand'));
    const suspended=await access(ids.owner);assert.equal(suspended.canAdminister,true);assert.equal(suspended.canChangeService,false);assert.equal(suspended.canStartNewOperations,false);assert.equal(suspended.canResolveExistingOperations,true);
    for(const user of [ids.other,ids.viewer])await assert.rejects(()=>access(user),e=>e.status===403);
    const absent=await identity.run(ids.other,()=>resolver.resolveOnlineStoreAccess('a1-other'));assert.equal(absent.service.status,'disabled');assert.equal(absent.canStartNewOperations,false);assert.equal(absent.canResolveExistingOperations,false);
    failTable='brand_online_store_access';assert.equal((await send()).body.modules.store,null);await assert.rejects(()=>access(ids.owner),e=>e.status===503);failTable=null;
    failTable='user_profiles';assert.equal((await send()).status,500);failTable=null;
    await sql(`update user_brand_access set status='inactive' where user_id='${ids.owner}'`);await assert.rejects(()=>access(ids.owner),e=>e.status===403);await sql(`update user_brand_access set status='active' where user_id='${ids.owner}'`);
    const race=await Promise.all([send('PATCH',{status:'enabled',expectedRevision:2}),send('PATCH',{status:'enabled',expectedRevision:2})]);
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    assert.equal((await access(ids.owner)).canStartNewOperations,true); // POS is still suspended.
    assert.equal((await access(ids.admin)).canAdminister,true);
    const memberships=await json(`select count(*) from user_brand_access where user_id='${ids.admin}'`);assert.equal(memberships,0);
    assert.equal((await send('GET',null,ids.admin,'a1-other')).body.modules.store.status,'disabled');
    const disable=await send('PATCH',{status:'suspended',expectedRevision:3});assert.equal(disable.status,200);
    assert.equal((await access(ids.owner)).canResolveExistingOperations,true);
    const events=await json('select count(*) from brand_online_store_access_events');assert.equal(events,4);
    console.log('PASS HTTP real handlers + SQL: auth, tenant isolation, owner cannot enable, private/no-store, lookup failure, passive GET, CAS, resolver, no memberships');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
