// Uses the synthetic administrator and brand only. Does not accept terms or provide banking/KYC data.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createServerClient} from '@supabase/ssr';
const ref='ephmrsjnpkcgddulvckj',dir=path.resolve('.next/magenta-functional',ref),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));
const env=read('environment'),access=read('access'),origins=read('origins');assert.equal(env.projectRef,ref);assert.equal(access.email,'magenta-preview-admin@example.test');
const jar=new Map(),auth=createServerClient(env.url,env.anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});assert.equal((await auth.auth.signInWithPassword({email:access.email,password:access.password})).error,null);
const route='/api/pos/online-store/payments?brandSlug=magenta-preview';
async function request(body){const r=await fetch(origins.admin+route,{method:body?'POST':'GET',headers:{'x-vercel-protection-bypass':read('admin-automation').secret,origin:origins.admin,cookie:[...jar].map(([n,v])=>n+'='+v).join('; '),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(r.status!==200){console.log(JSON.stringify({status:r.status,code:d.code,error:d.error}));throw Error('CONNECT_TEST_HTTP_FAILED');}return d;}
const state=await request();assert.equal(state.mode,'test');
if(!state.connected)await request({action:'create',country:'MX'});
const synced=await request({action:'sync'}),current=await request();assert.equal(current.mode,'test');
if(!process.argv.includes('--activate')){
 const link=await request({action:'onboard'});assert.ok(link.url.startsWith('https://connect.stripe.com/'));
 fs.writeFileSync(path.join(dir,'CONECTAR-CUENTA-TEST.txt'),`Cuenta sintética de pruebas. No introducir datos reales ni aceptar condiciones de una cuenta live.\nCompletar solamente el onboarding de prueba que Stripe identifique como test.\nEnlace privado temporal: ${link.url}\nCaduca: ${new Date(link.expiresAt*1000).toISOString()}\nPara renovar: node scripts/prepare-magenta-connect-test.mjs\nDespués se comprobarán capacidades y destino antes de activar esta cuenta en pruebas.\n`,{mode:0o600});
 console.log(JSON.stringify({mode:'test',connected:current.connected,chargesEnabled:synced.chargesEnabled,payoutsEnabled:synced.payoutsEnabled,active:current.active,privateFile:'CONECTAR-CUENTA-TEST.txt',newCharge:false}));
}else{assert.ok(synced.chargesEnabled&&synced.payoutsEnabled&&synced.detailsSubmitted,'Finish Stripe TEST onboarding first');await request({action:'activate'});console.log('Activated test connected account for NEW orders only; no new payment.');}
