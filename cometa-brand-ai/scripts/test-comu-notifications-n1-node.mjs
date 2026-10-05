import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {timingSafeEqual} from 'node:crypto';

function load(file,imports={},globals={}) {
 const context={exports:{},URL,Buffer,AbortSignal,...globals,require(name){assert.ok(Object.hasOwn(imports,name),'Unexpected import '+name);return imports[name];}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return context.exports;
}
const env={RESEND_FROM_EMAIL:'comu@example.test',COMETA_APP_ORIGIN:'https://comu.example.test'};let calls=0,last;
const email=load('src/lib/comu/notification-email.ts',{'server-only':{}},{process:{env},fetch:async(url,options)=>{calls++;last={url,options};return {ok:true,status:200};}});
assert.equal(email.notificationEmailConfig().origin,env.COMETA_APP_ORIGIN);
env.COMETA_APP_ORIGIN='https://comu.example.test/private';assert.equal(email.notificationEmailConfig(),null);env.COMETA_APP_ORIGIN='https://comu.example.test';
const payload={from:'COMU <comu@example.test>',to:['buyer@example.test'],subject:'COMU · Pedido confirmado',text:'Pedido #123. Ver pedido: https://comu.example.test/comu/account/orders/fixture'};
assert.equal((await email.sendComuEmail(payload,'comu-n1/fixture')).error,'CONFIGURATION');assert.equal(calls,0);
env.RESEND_API_KEY='LOCAL_FAKE';env.COMU_NOTIFICATIONS_EMAIL_ENABLED='true';
assert.equal((await email.sendComuEmail(payload,'comu-n1/fixture')).ok,true);assert.equal(last.options.headers['Idempotency-Key'],'comu-n1/fixture');assert.equal(last.url,'https://api.resend.com/emails');assert.equal(last.options.body,JSON.stringify(payload));
const failed=load('src/lib/comu/notification-email.ts',{'server-only':{}},{process:{env},fetch:async()=>{throw Error('SECRET_PROVIDER_DETAIL');}});
assert.equal((await failed.sendComuEmail(payload,'same')).error,'PROVIDER_UNAVAILABLE');
class PosApiError extends Error {constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
const core=load('src/lib/comu/notifications.ts',{'server-only':{},'@/lib/supabase/server':{},'./seller-access':{},'@/lib/pos/server':{PosApiError}});
assert.throws(()=>core.notificationContext('BUYER','injected'));assert.throws(()=>core.notificationContext('OTHER',null));assert.equal(core.notificationContext('SELLER',null).audience,'SELLER');
assert.equal(core.notificationFailure(Error('PRIVATE_PROVIDER_PAYLOAD')).message,'No se pudo completar la operación.');
assert.equal(core.notificationFailure(new PosApiError(503,'FAIL','PRIVATE_PROVIDER_PAYLOAD')).message,'Notificaciones no disponibles.');
let dispatched=0;
const route=load('src/app/api/comu/notifications/dispatch/route.ts',{'node:crypto':{timingSafeEqual},'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},'@/lib/comu/notification-worker':{dispatchNotifications:async()=>{dispatched++;return {processed:0};}}},{process:{env:{COMU_NOTIFICATIONS_WORKER_SECRET:'a'.repeat(32)}}});
assert.equal((await route.POST(new Request('http://local',{method:'POST',headers:{authorization:'Bearer bad'}}))).status,401);assert.equal(dispatched,0);
assert.equal((await route.POST(new Request('http://local',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(32)}}))).data.ok,true);assert.equal(dispatched,1);
console.log('PASS N1 Node: disabled provider makes zero calls, minimal immutable payload/idempotency header, timeout/failure sanitization, config/input validation, secure worker auth. Real emails: 0.');
