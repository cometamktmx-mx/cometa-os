import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function compile(file,deps={}) {
  const compiledModule={exports:{}};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>Object.hasOwn(deps,name)?deps[name]:require(name),compiledModule,compiledModule.exports);
  return compiledModule.exports;
}
const shared=compile('src/lib/pos/food-shared.ts');
const modal=compile('src/app/brand/[brandSlug]/components/pos-ui/pos-modal.tsx');
const ui=compile('src/app/brand/[brandSlug]/components/pos-food-modifiers.tsx',{'@/lib/pos/food-shared':shared,'./pos-ui/pos-modal':modal});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const groups=[{id:id(1),name:'Leche',required:true,min_selections:1,max_selections:1,selection_mode:'single',display_order:0,options:[{id:id(2),name:'Coco',price_delta:12,type:'choice',display_order:0},{id:id(3),name:'Entera',price_delta:0,type:'choice',display_order:1}]},{id:id(4),name:'Extras',required:false,min_selections:2,max_selections:3,selection_mode:'multiple',display_order:1,options:[5,6,7].map(n=>({id:id(n),name:`Extra ${n}`,price_delta:15,type:'add',display_order:n}))}];
test('selection validation: required, optional minimum, maximum, single, unknown and duplicate IDs',()=>{
  assert.equal(shared.validFoodModifierSelection(groups,[]),false);
  assert.equal(shared.validFoodModifierSelection(groups,[id(2)]),true);
  assert.equal(shared.validFoodModifierSelection(groups,[id(2),id(3)]),false);
  assert.equal(shared.validFoodModifierSelection(groups,[id(2),id(5)]),false);
  assert.equal(shared.validFoodModifierSelection(groups,[id(2),id(5),id(6)]),true);
  assert.equal(shared.validFoodModifierSelection(groups,[id(2),id(2)]),false);
  assert.equal(shared.validFoodModifierSelection(groups,[id(2),id(99)]),false);
  assert.equal(shared.validFoodModifierSelection([{...groups[1],max_selections:2}],[id(5),id(6),id(7)]),false);
});
test('KDS renders structured group names and emphasizes remove selections',()=>{
  const modifiers=[{group_id:id(1),group_name:'Leche',name:'Coco',type:'choice'},{group_id:id(4),group_name:'Quitar',name:'Sin espuma',type:'remove'}];
  const html=renderToStaticMarkup(React.createElement(ui.FoodItemModifiers,{modifiers}));
  assert.match(html,/Leche/);assert.match(html,/Coco/);assert.match(html,/Quitar/);assert.match(html,/Sin espuma/);assert.match(html,/amber/);
  assert.equal(renderToStaticMarkup(React.createElement(ui.FoodItemModifiers,{})),'');
});
class PosApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
function fixture(){
  const calls=[];const state={allowed:true};
  const context={brand:{slug:'resolved-brand'},user:{userId:id(10)},admin:{rpc:async(name,args)=>{calls.push({name,args});return{data:{},error:null};}}};
  const server={PosApiError,getBrandSlugFromUrl:r=>new URL(r.url).searchParams.get('brandSlug'),readJsonBody:r=>r.json(),requiredText:(v)=>{if(typeof v!=='string'||!v.trim())throw new PosApiError(400,'POS_VALIDATION_ERROR','text');return v;},uuidValue:v=>{if(typeof v!=='string'||!/^00000000-0000-4000-8000-\d{12}$/.test(v))throw new PosApiError(400,'POS_VALIDATION_ERROR','uuid');return v;},ok:body=>({status:200,body}),handlePosError:e=>({status:e.status||500})};
  const route=compile('src/app/api/pos/food/modifiers/route.ts',{'@/lib/pos/server':server,'@/lib/pos/admin-access':{requirePosAdminSurfaceAccess:async()=>{if(!state.allowed)throw new PosApiError(403,'POS_FORBIDDEN','forbidden');return context;}},'@/lib/pos/staff-server':{requireStaffSession:async()=>({id:id(11)})},'@/lib/pos/food-server':{assertFoodResult:(error)=>{if(error)throw error;}}});
  return{calls,state,post:body=>route.POST(new Request('http://local/api/pos/food/modifiers',{method:'POST',body:JSON.stringify({brandSlug:'untrusted',...body})}))};
}
const group={action:'group_save',id:id(1),name:'Leche',display_order:0,active:true,required:true,min_selections:1,max_selections:1,selection_mode:'single'};
test('Admin API sources tenant/host/operator from authorized context and rejects invalid limits',async()=>{
  const f=fixture();assert.equal((await f.post({...group,p_host_user_id:id(99),brand_id:'foreign'})).status,200);
  assert.equal(f.calls[0].args.p_brand_slug,'resolved-brand');assert.equal(f.calls[0].args.p_host_user_id,id(10));assert.equal(f.calls[0].args.p_session_id,id(11));assert.equal(f.calls[0].args.p_payload.brand_id,undefined);
  for(const delta of [{min_selections:0},{max_selections:2},{selection_mode:'bad'},{display_order:-1}])assert.equal((await f.post({...group,...delta})).status,400);
  f.state.allowed=false;assert.equal((await f.post(group)).status,403);assert.equal(f.calls.length,1);
});
test('Admin API validates option price precision/type and association duplicate IDs',async()=>{
  const f=fixture();const option={action:'option_save',name:'Shot',group_id:id(1),display_order:0,active:true,type:'add',price_delta:15};
  assert.equal((await f.post(option)).status,200);
  for(const delta of [{price_delta:-1},{price_delta:0.001},{type:'recipe'}])assert.equal((await f.post({...option,...delta})).status,400);
  assert.equal((await f.post({...option,type:'remove',price_delta:-5})).status,200);
  assert.equal((await f.post({action:'product_groups_save',product_id:id(20),group_ids:[id(1),id(1)]})).status,400);
  assert.equal((await f.post({action:'product_groups_save',product_id:id(20),group_ids:[id(1)]})).status,200);
});
