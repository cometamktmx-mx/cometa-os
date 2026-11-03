import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {test} from 'node:test';
const source=fs.readFileSync('src/app/brand/[brandSlug]/pos/cash/page.tsx','utf8');
const helper=source.slice(source.indexOf('async function apiRequest<T>'),source.indexOf('function getErrorMessage('));
const code=ts.transpileModule(helper+'\nexports.request=apiRequest;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('HTTP domain error retains recount code through the real frontend request helper',async()=>{
 const exports={};vm.runInNewContext(code,{exports,fetch:async()=>({ok:false,json:async()=>({ok:false,code:'POS_CASH_CHANGED_RECOUNT_REQUIRED',error:'La caja cambió; vuelve a contar.'})})});
 await assert.rejects(exports.request('/local'),e=>e.code==='POS_CASH_CHANGED_RECOUNT_REQUIRED'&&e.message.includes('vuelve a contar'));
});
const catchBody=source.match(/catch \(closeError\) \{([\s\S]*?)\n    \} finally/)?.[1];assert.ok(catchBody);
function apply(error){const state={count:'old',counted:'500',reserve:'500',step:3,message:null};const pendingCommand={current:{key:'original-request'}};vm.runInNewContext(catchBody,{closeError:error,pendingCommand,setCountId:v=>state.count=v,setCountedCash:v=>state.counted=v,setReservedCash:v=>state.reserve=v,setCloseStep:v=>state.step=v,setError:v=>state.message=v,getErrorMessage:e=>e.message});return{state,pendingCommand};}
test('stale or wrong-PIN count discards previous values and forces explicit count-start',()=>{
 for(const code of ['POS_CASH_CHANGED_RECOUNT_REQUIRED','POS_CASH_COUNT_REQUIRED']){const {state,pendingCommand}=apply({code,message:'Recontar sin esperado'});assert.equal(state.count,'');assert.equal(state.counted,'');assert.equal(state.reserve,'');assert.equal(state.step,1);assert.equal(pendingCommand.current,null);}
});
test('uncertain network failure preserves the original idempotent request and draft',()=>{const {state,pendingCommand}=apply({message:'Network unavailable'});assert.equal(state.count,'old');assert.equal(state.counted,'500');assert.equal(state.step,3);assert.equal(pendingCommand.current.key,'original-request');});
