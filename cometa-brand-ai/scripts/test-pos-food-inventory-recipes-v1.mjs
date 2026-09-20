import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
function compile(path, deps) {
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
class PosApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const server = {
  PosApiError,
  requiredText(value) { if (typeof value !== 'string' || !value.trim()) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Invalid text'); return value.trim(); },
  uuidValue(value, key, required = true) { if (value == null && !required) return null; if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', key); return value; },
  getBrandSlugFromUrl: request => new URL(request.url).searchParams.get('brandSlug'), readJsonBody: request => request.json(),
  ok: body => ({ status: 200, body }), handlePosError: error => ({ status: error.status || 500, body: { code: error.code } }),
};
function fixture() {
  const calls = [], entitlements = [], state = { admin: true, mode: 'COFFEE_SHOP', location: id(2), error: null, data: { id: id(3) } };
  const context = { brand: { slug: 'normalized-food' }, user: { userId: id(1) }, admin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: state.data, error: state.error }; } } };
  const shared = compile('src/lib/pos/food-recipes-shared.ts', {});
  const helper = compile('src/lib/pos/food-recipes-server.ts', {
    'server-only': {}, './server': server, './food-recipes-shared': shared,
    './admin-access': { requirePosAdminSurfaceAccess: async () => { if (!state.admin) throw new PosApiError(403, 'POS_ADMIN_OPERATOR_REQUIRED', 'Admin required'); return context; } },
    './access': { requirePosCommercialAccess: async (_, entitlement) => { entitlements.push(entitlement); } },
    './staff-server': { getPosMode: async () => state.mode, requireStaffSession: async (_, permission, location) => { assert.equal(permission,'STAFF_MANAGE'); if (location !== state.location) throw new PosApiError(403, 'POS_STAFF_LOCATION_FORBIDDEN', 'Location'); return { id: id(4) }; } },
  });
  const route = compile('src/app/api/pos/food/recipes/route.ts', {
    '@/lib/pos/server': server, '@/lib/pos/food-recipes-server': helper,
    '@/lib/pos/food-server': { assertFoodResult(error, data) { if (error || !data) throw new PosApiError(503, 'POS_FOOD_OPERATION_FAILED', 'Safe error'); } },
  });
  const post = body => route.POST(new Request('http://local/api/pos/food/recipes', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ brandSlug:'requested', locationId:id(2), command_key:id(8), ...body }) }));
  return { calls, entitlements, state, helper, route, post };
}
test('Food admin API resolves normalized tenant, host, session and entitlements; ignores forged cost/base quantities', async () => {
  const f = fixture();
  const response = await f.post({ action:'recipe_publish', id:id(3), host:id(9), session:id(9), components:[{ ingredient_variant_id:id(5), quantity:18, unit_code:'g', base_quantity:999, cost:0 }] });
  assert.equal(response.status,200); assert.deepEqual(f.entitlements,['pos.inventory','pos.products']);
  assert.deepEqual(f.calls[0].args, {brand:'normalized-food',host:id(1),session:id(4),location:id(2),action:'recipe_publish',payload:{command_key:id(8),id:id(3),components:[{ingredient_variant_id:id(5),quantity:18,unit_code:'g'}]}});
});
test('Retail, missing admin and foreign location fail before database mutation', async () => {
  for (const mutate of [s => s.mode='RETAIL', s => s.admin=false, s => s.location=id(7)]) {
    const f=fixture(); mutate(f.state); const r=await f.post({action:'adjust',id:id(5),quantity:1,notes:'Count'}); assert.equal(r.status,403); assert.equal(f.calls.length,0);
  }
});
test('Command validation rejects malformed recipe/components, quantity and action', () => {
  const {helper}=fixture();
  for (const body of [{action:'recipe_publish',id:id(3),components:[]},{action:'recipe_publish',id:id(3),components:[{ingredient_variant_id:id(5),quantity:0,unit_code:'g'}]},{action:'adjust',id:id(3),quantity:NaN,notes:'Count'},{action:'effect_save',product_id:id(3),option_id:id(5),effect:'BAD'}]) assert.throws(()=>helper.recipeCommand(body));
});
test('Presentation capture preserves content/unit; client conversion factor is discarded and blank optional supplier accepted', () => {
  const {helper}=fixture();
  const r=helper.recipeCommand({command_key:id(8),action:'ingredient_save',name:'Leche',category:'base',unit_code:'ml',supplier_name:'',minimum_quantity:0,waste_percent:5,active:true,presentations:[{name:'1 L',content:1,unit_code:'l',cost:28,active:true,conversion_factor:2000}]});
  assert.equal(r.payload.supplier_name,null); assert.deepEqual(r.payload.presentations[0],{id:null,name:'1 L',content:1,unit_code:'l',cost:28,supplier_name:null,active:true});
});
test('Receipt keeps stable request key and does not accept a client total cost', () => {
  const {helper}=fixture(); const r=helper.recipeCommand({command_key:id(8),action:'receive',id:id(3),presentation_id:id(5),request_key:id(8),quantity:2,notes:'',total_cost:1});
  assert.equal(r.payload.request_key,id(8)); assert.equal(r.payload.total_cost,undefined);
});
test('Database errors and null success are safe and do not confirm a mutation', async () => {
  const f=fixture(); f.state.error={message:'private SQL payload'};
  assert.equal((await f.post({action:'adjust',id:id(3),quantity:1,notes:'Count'})).status,503);
  f.state.error=null; f.state.data=null;
  assert.equal((await f.route.GET(new Request(`http://local/?brandSlug=requested&locationId=${id(2)}`))).status,503);
});

// Execute the exact SQL replacement declarations against repository bodies.
// This verifies migration anchors, including CRLF normalization, without pretending to run PostgreSQL.
function sqlString(source, position) {
  let i=position; while (/\s/.test(source[i])) i++;
  let escape=false; if (source[i]==='E' && source[i+1]==="'") {escape=true;i++;}
  if (source[i]==="'") {
    let out=''; i++;
    while(i<source.length) {
      if(source[i]==="'") {if(source[i+1]==="'"){out+="'";i+=2;continue;}i++;break;}
      if(escape && source[i]==='\\'){const next=source[++i];out+=next==='n'?'\n':next==='r'?'\r':next==='t'?'\t':next;i++;}else out+=source[i++];
    } return {value:out,end:i};
  }
  const dollar=source.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
  if(dollar){const end=source.indexOf(dollar,i+dollar.length);return {value:source.slice(i+dollar.length,end),end:end+dollar.length};}
  throw new Error('Expected SQL literal at '+source.slice(i,i+50));
}
function body(baseline,name) {const start=baseline.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"(`);assert.ok(start>=0);return baseline.slice(start,baseline.indexOf('\nALTER FUNCTION',start));}
test('Every Food Recipes migration anchor matches the installed local chain; Retail additions are guarded', () => {
  const baseline=read('supabase/migrations/20260828233603_remote_schema.sql');
  let v4=body(baseline,'pos_complete_sale_v4');
  const modifiers=read('supabase/migrations/20260917190000_pos_food_modifiers_v1.sql');
  const segment=modifiers.slice(modifiers.indexOf("select pg_get_functiondef('public.pos_complete_sale_v4"),modifiers.indexOf('end $patch$;'));
  let anchor='';
  const operations= /anchor:=[\s\S]*?;|definition:=pg_temp\.food_patch\(/g;
  let match;
  while((match=operations.exec(segment))) {
    if(match[0].startsWith('anchor:=')){anchor=sqlString(segment,match.index+'anchor:='.length).value;continue;}
    let pos=match.index+match[0].length;const firstComma=segment.indexOf(',',pos);pos=firstComma+1;
    let a;if(segment.slice(pos).trimStart().startsWith('anchor')){a={value:anchor,end:pos+segment.slice(pos).indexOf('anchor')+6};}else a=sqlString(segment,pos);
    pos=segment.indexOf(',',a.end)+1; const r=sqlString(segment,pos);let replacement=r.value;
    if(segment.slice(r.end).trimStart().startsWith('||anchor')) replacement+=anchor;
    assert.equal(v4.split(a.value).length-1,1,'Modifiers anchor '+a.value);v4=v4.replace(a.value,replacement);
  }
  const migration=read('supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql');
  const installed=v4;
  const changes=migration.slice(migration.indexOf("select pg_get_functiondef('public.pos_complete_sale_v4"),migration.indexOf('end $patch$;'));
  const added=[];
  for(const call of changes.matchAll(/definition:=pg_temp\.food_recipe_patch\(definition,/g)) {
    const a=sqlString(changes,call.index+call[0].length);const r=sqlString(changes,changes.indexOf(',',a.end)+1);
    const tail=changes.slice(r.end).match(/^\s*(?:,\s*(\d+))?\s*\)/);assert.ok(tail);const count=Number(tail[1]||1);
    assert.equal(v4.split(a.value).length-1,count,'Recipes anchor '+a.value);added.push({a:a.value,r:r.value,count});v4=v4.split(a.value).join(r.value);
  }
  assert.equal(added.length,5); assert.match(v4,/IF v_food_context IS NOT NULL THEN\s+PERFORM public.pos_food_consume_sale_recipes_v1/);
  const replay=v4.indexOf("'{idempotent_replay}'");assert.ok(replay>=0 && replay<v4.indexOf('PERFORM public.pos_food_consume_sale_recipes_v1'));
  for(const entry of [...added].reverse()) {assert.equal(v4.split(entry.r).length-1,entry.count);v4=v4.split(entry.r).join(entry.a);}
  assert.equal(v4,installed,'Removing Food recipe extensions yields exactly the installed shared engine');
});
test('SEND, operational availability and checkout context amendments match their installed Food bodies', () => {
  const migration=read('supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql');
  const operations=read('supabase/migrations/20260914120000_pos_food_operations_v1.sql');
  const modifiers=read('supabase/migrations/20260917190000_pos_food_modifiers_v1.sql');
  for(const [installed,original,source] of [['pos_food_command_legacy_v1','pos_food_command_v1',operations],['pos_food_snapshot_legacy_v1','pos_food_snapshot_v1',operations],['pos_food_checkout_context_v1','pos_food_checkout_context_v1',modifiers]]) {
    const start=source.indexOf('function public.'+original+'(');assert.ok(start>=0);
    let definition=source.slice(start,source.indexOf('end $$;',start));
    const begin=migration.indexOf("select pg_get_functiondef('public."+installed+'(');assert.ok(begin>=0);
    const segment=migration.slice(begin,migration.indexOf('execute definition;',begin));
    for(const call of segment.matchAll(/definition:=pg_temp\.food_recipe_patch\(definition,/g)) {
      const a=sqlString(segment,call.index+call[0].length);const r=sqlString(segment,segment.indexOf(',',a.end)+1);
      assert.equal(definition.split(a.value).length-1,1,installed+' anchor '+a.value);definition=definition.replace(a.value,r.value);
    }
  }
});
test('Shared receipt and adjustment amendments are ingredient-only and preserve the exact Retail bodies', () => {
  const migration=read('supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql');
  const baseline=read('supabase/migrations/20260828233603_remote_schema.sql');
  for(const name of ['pos_complete_inventory_receipt_v1','pos_adjust_inventory']) {
    const original=body(baseline,name);let definition=original;
    const start=migration.indexOf("select pg_get_functiondef('public."+name+'(');const segment=migration.slice(start,migration.indexOf('execute definition;',start));
    const call=/definition:=pg_temp\.food_recipe_patch\(definition,/.exec(segment);assert.ok(call);
    const a=sqlString(segment,call.index+call[0].length);const r=sqlString(segment,segment.indexOf(',',a.end)+1);
    assert.equal(definition.split(a.value).length-1,1);assert.match(r.value,/product_type='ingredient'/);
    definition=definition.replace(a.value,r.value);assert.equal(definition.replace(r.value,a.value),original);
  }
});
test('Persistence reuses stock, protects tenant relationships and frozen snapshots, and keeps consumption out of SEND', () => {
  const sql=read('supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql');
  const tables=[...sql.matchAll(/create table public\.([a-z_]+) /g)].map(m=>m[1]);
  assert.deepEqual(tables,['pos_food_ingredient_settings','pos_food_recipe_versions','pos_food_recipe_components','pos_food_modifier_recipe_effects','pos_food_item_recipe_snapshots','pos_food_sale_consumptions']);
  const send=sql.slice(sql.indexOf('create function public.pos_food_snapshot_recipe_round_v1'),sql.indexOf('create function public.pos_food_item_inventory_mode_v1'));
  assert.doesNotMatch(send,/update public\.pos_inventory|insert into public\.pos_inventory_movements/);
  assert.match(sql,/unique\(sale_id,food_item_id,ingredient_variant_id\)/); assert.match(sql,/q<>trunc\(q,3\)/);
  assert.match(sql,/foreign key\(sale_id,brand_slug\)/); assert.match(sql,/for update/);assert.match(sql,/snapshots_immutable/);
});
test('Food inventory UI renders physical/usable stocks separately and existing component loading/empty states', () => {
  const ingredient={id:id(5),product_id:id(6),name:'Leche',unit_code:'ml',unit_cost:.028,active:true,category:'base',waste_percent:5,supplier_name:null,stock:1000,reserved_stock:0,minimum_stock:100,usable_estimated_stock:950,presentations:[]};
  function render(ingredients) {
  const numericInput = compile('src/lib/pos/numeric-input.ts', {});
  let index=0;const states=[[{id:id(2),name:'Local',currency:'MXN'}],id(2),null,{ingredients,products:[],effects:[],units:[],movements:[]},{options:[],associations:[]}];
    const component=compile('src/app/brand/[brandSlug]/components/pos-food-recipes-admin.tsx',{'@/lib/pos/numeric-input': numericInput,
'next/link':{default:p=>React.createElement('a',{href:p.href},p.children),__esModule:true},react:{...React,useState:initial=>[index<states.length?states[index++]:(index++,typeof initial==='function'?initial():initial),()=>{}],useEffect:()=>{},useCallback:fn=>fn},'./pos-shell':{usePosContext:()=>({currentOperator:null})},'./pos-ui/pos-drawer':{PosDrawer:p=>p.open?React.createElement('aside',{},p.children):null},'./pos-food-prepared-workspace':{PosFoodPreparedWorkspace:()=>null}});
    return renderToStaticMarkup(React.createElement(component.PosFoodRecipesAdmin,{brandSlug:'food'}));
  }
  const html=render([ingredient]);assert.match(html,/Físico/);assert.match(html,/950\.000/);assert.match(html,/1000/);assert.match(html,/Entrada/);assert.match(render([]),/Agrega alimentos/);
});
