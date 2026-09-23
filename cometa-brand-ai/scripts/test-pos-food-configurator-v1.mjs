import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';

const require = createRequire(import.meta.url);
const base = 'src/app/brand/[brandSlug]/';
const read = path => readFileSync(path, 'utf8');
function compile(source, deps = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
function declaration(path, name) {
  const source = read(path), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let result;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(result, name); return result;
}
class PosApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const server = {
  PosApiError, requiredText(value) { if (typeof value !== 'string' || !value.trim()) throw new PosApiError(400, 'INVALID', 'Invalid'); return value.trim(); },
  uuidValue(value, name, required = true) { if (value == null && !required) return null; if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new PosApiError(400, 'INVALID', name); return value; },
  readJsonBody: request => request.json(), assertDatabaseResult(error) { if (error) throw error; },
  ok: body => ({ status: 200, body }), handlePosError: error => ({ status: error.status || 500, body: { code: error.code, error: error.message } }),
};
const assertFoodResult = (error, data) => { if (error || !data) throw new PosApiError(409, error?.message || 'UNAVAILABLE', 'Configuración no disponible'); };

function fixture() {
  const queries = [], calls = [];
  const state = { authorized: true, stock: { milk: 5000, almond: 2200, vanilla: 200, ice: 1200, coffee: 1400 }, baseMilk: 220, includeTax: true, lastRecipe: null, recipeError: null };
  const effects = [
    { option_id: id(11), effect: 'ADD', source_variant_id: null, ingredient_variant_id: 'vanilla', base_quantity: 20, base_unit_code: 'ml' },
    { option_id: id(12), effect: 'REPLACE', source_variant_id: 'milk', ingredient_variant_id: 'almond', base_quantity: 220, base_unit_code: 'ml' },
    { option_id: id(13), effect: 'ADD', source_variant_id: null, ingredient_variant_id: 'ice', base_quantity: 120, base_unit_code: 'g' },
    { option_id: id(14), effect: 'ADD', source_variant_id: null, ingredient_variant_id: 'coffee', base_quantity: 70, base_unit_code: 'ml' },
  ];
  const variants = [{ id: id(3), brand_slug: 'food', product_id: id(2), name: 'Mediano', price: 50, active: true }];
  const rows = table => {
    if (table === 'pos_locations') return [{ id: id(1), brand_slug: 'food', active: true, prices_include_tax: state.includeTax }];
    if (table === 'pos_products') return [{ id: id(2), brand_slug: 'food', product_type: 'prepared', inventory_mode: 'recipe', active: true, sellable: true, tax_rate: 16 }];
    if (table === 'pos_product_variants') return variants;
    if (table === 'pos_food_recipe_versions') return [{ id: id(4), brand_slug: 'food', variant_id: id(3), published_at: '2026-09-22', version: 1 }];
    if (table === 'pos_food_recipe_components') return [{ ingredient_variant_id: 'milk', base_quantity: state.baseMilk, base_unit_code: 'ml' }, { ingredient_variant_id: 'coffee', base_quantity: 70, base_unit_code: 'ml' }].map(row => ({ ...row, brand_slug: 'food', recipe_version_id: id(4) }));
    if (table === 'pos_food_modifier_recipe_effects') return effects.map(row => ({ ...row, brand_slug: 'food', product_id: id(2) }));
    return [];
  };
  const admin = {
    from(table) {
      const query = { table, filters: [], operation: 'select' }; queries.push(query);
      let write;
      const result = single => {
        if (query.operation === 'insert') { if (variants.some(v => v.id === write.id)) return { error: { code: '23505' }, data: null }; variants.push({ ...write, active: true }); }
        let data = rows(table).filter(row => query.filters.every(fn => fn(row)));
        if (query.operation === 'update') data.forEach(row => Object.assign(row, write));
        return { error: null, data: single ? data[0] || null : data };
      };
      const chain = {
        select() { return chain; }, eq(key, value) { query.filters.push(row => row[key] === value); return chain; },
        in(key, values) { query.filters.push(row => values.includes(row[key])); return chain; },
        not(key, op, value) { query.filters.push(row => row[key] !== value); return chain; }, order() { return chain; }, limit() { return chain; },
        insert(value) { query.operation = 'insert'; write = value; return chain; }, update(value) { query.operation = 'update'; write = value; return chain; },
        maybeSingle: async () => result(true), then(resolve) { return Promise.resolve(result(false)).then(resolve); },
      }; return chain;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'pos_food_resolve_modifiers_v1') {
        if (args.p_ids.some(value => !effects.some(e => e.option_id === value))) return { data: null, error: { message: 'POS_FOOD_MODIFIERS_INVALID' } };
        return { data: args.p_ids.map(option_id => ({ option_id, price_delta: option_id === id(11) ? 5 : option_id === id(12) ? 8 : option_id === id(14) ? 10 : 0 })), error: null };
      }
      if (name === 'pos_food_recipe_metrics_v1') {
        if (state.recipeError) return { data: null, error: { message: state.recipeError } };
        // Reference evaluator for fixture assertions, not a replacement production engine or a live DB test.
        const quantities = { milk: state.baseMilk, coffee: 70 };
        for (const e of effects.filter(e => args.modifiers.some(m => m.option_id === e.option_id))) {
          if (e.effect === 'REPLACE') quantities[e.source_variant_id] = 0;
          quantities[e.ingredient_variant_id] = (quantities[e.ingredient_variant_id] || 0) + e.base_quantity;
        }
        state.lastRecipe = quantities;
        const portions = Object.entries(quantities).filter(([, q]) => q > 0).map(([key, q]) => [key, Math.floor(state.stock[key] / q)]).sort((a, b) => a[1] - b[1]);
        return { data: { availability: portions[0][1], limiting_ingredient: portions[0][0] }, error: null };
      }
      throw new Error(name);
    },
  };
  const context = { admin, brand: { id: id(9), slug: 'food' }, user: { userId: id(8) } };
  const access = async (brand, location) => { if (!state.authorized || brand !== 'food' || location !== id(1)) throw new PosApiError(403, 'POS_FOOD_FORBIDDEN', 'Forbidden'); return { context, session: { id: id(7), locationId: id(1) } }; };
  const helper = compile(read('src/lib/pos/food-recipes-server.ts'), { 'server-only': {}, './admin-access': {}, './access': {}, './staff-server': {}, './server': server, './food-recipes-shared': { FOOD_RECIPE_ACTIONS: [] } });
  const preview = compile(read('src/app/api/pos/food/configuration-preview/route.ts'), { '@/lib/pos/server': server, '@/lib/pos/food-recipes-server': helper, '@/lib/pos/food-server': { assertFoodResult, requireFoodAccess: (brand, action, location) => { assert.equal(action, 'item_add'); return access(brand, location); } } });
  const sizes = compile(read('src/app/api/pos/food/prepared-variants/route.ts'), { '@/lib/pos/server': server, '@/lib/pos/food-recipes-server': { requireFoodRecipesAdmin: access } });
  const post = (route, body) => route.POST(new Request('http://local/', { method: 'POST', body: JSON.stringify({ brandSlug: 'food', locationId: id(1), variantId: id(3), modifierOptionIds: effects.map(e => e.option_id), ...body }) }));
  return { state, effects, calls, queries, helper, preview, sizes, post, variants };
}

test('Latte Mediano V1: exact replacement + vanilla + ice + extra shot, price and availability', async () => {
  const f = fixture(); const response = await f.post(f.preview, {});
  assert.equal(response.status, 200); assert.equal(response.body.preview.unitPrice, 73); assert.equal(response.body.preview.lineTotal, 73);
  assert.equal(response.body.preview.available, 10); assert.equal(response.body.preview.canAdd, true);
  assert.deepEqual(f.state.lastRecipe, { milk: 0, coffee: 140, vanilla: 20, almond: 220, ice: 120 });
  assert.equal(f.calls[0].name, 'pos_food_resolve_modifiers_v1'); assert.equal(f.calls[1].name, 'pos_food_recipe_metrics_v1');
  assert.equal(f.calls[1].args.variant, id(3)); assert.equal(f.calls[1].args.brand, 'food'); assert.equal(f.calls[1].args.modifiers.length, 4);
  assert.ok(f.queries.every(q => q.operation === 'select'), 'preview never reserves or mutates');
  f.state.includeTax = false; assert.equal((await f.post(f.preview, {})).body.preview.lineTotal, 84.68);
});

test('Almond/vanilla/ice/coffee shortages block the selected configuration, even if base Latte is available', async () => {
  for (const ingredient of ['almond', 'vanilla', 'ice', 'coffee']) {
    const f = fixture(); f.state.stock[ingredient] = 0;
    const response = await f.post(f.preview, {});
    assert.equal(response.body.preview.canAdd, false); assert.equal(response.body.preview.available, 0); assert.match(response.body.preview.reason, /No disponible/);
  }
});

test('Preview propagates canonical SQL effect conflicts; invalid tenant/location/options fail closed', async () => {
  // Quantities across sizes are certified by the real PostgreSQL suite, not a TS resolver.
  const f = fixture(); f.state.recipeError = 'POS_FOOD_RECIPE_EFFECT_CONFLICT';
  assert.equal((await f.post(f.preview, {})).body.code, 'POS_FOOD_RECIPE_EFFECT_CONFLICT');
  assert.equal(f.calls.at(-1).name, 'pos_food_recipe_metrics_v1');
  f.state.recipeError = null;
  for (const body of [{ brandSlug: 'other' }, { locationId: id(99) }, { variantId: id(99) }, { modifierOptionIds: [id(11), id(11)] }, { modifierOptionIds: [id(99)] }]) assert.ok((await f.post(f.preview, body)).status >= 400);
  f.state.authorized = false; assert.equal((await f.post(f.preview, {})).status, 403);
});

test('Prepared sizes reuse product_id, price and stable request ID; never create stock', async () => {
  const f = fixture(), body = { productId: id(2), id: id(30), name: 'Grande', price: 65 };
  assert.equal((await f.post(f.sizes, body)).status, 200); assert.equal((await f.post(f.sizes, body)).status, 200);
  assert.equal(f.variants.filter(v => v.id === id(30)).length, 1); assert.equal(f.variants.find(v => v.id === id(30)).product_id, id(2));
  assert.equal((await f.post(f.sizes, { ...body, price: 65.555 })).status, 400);
  assert.equal((await f.post(f.sizes, { ...body, id: id(31), productId: id(99) })).status, 404);
  assert.ok(!f.queries.some(q => q.table === 'pos_inventory'));
});

test('Food customer partial failure retries profile, not base customer; Retail never calls Food API', async () => {
  const source = declaration(base + 'pos/customers/page.tsx', 'createCustomer');
  const { make } = compile(`export function make(deps) { const {foodMode,foodCreateBusy,pendingFoodCustomerRef,pendingFoodBrandRef,brand,form,foodSafety,program,apiRequest,setIsSaving,setError,setNotice,setPendingFoodCustomer,setFoodSafety,setIsCreateModalOpen,setForm,loadData}=deps; const EMPTY_FORM={}; const getErrorMessage=e=>e.message; ${source}; return createCustomer; }`);
  for (const foodMode of [true, false]) {
    const calls = [], notices = []; let fail = true;
    const deps = { foodMode, foodCreateBusy: { current: false }, pendingFoodCustomerRef: { current: null }, pendingFoodBrandRef: { current: 'food' }, brand: { slug: 'food' }, form: { firstName: 'Ana', lastName: '', phone: '555', email: '', tags: '', notes: 'No consumir canela', joinLoyalty: false }, foodSafety: { allergies: 'Nuez, lácteos', restrictions: 'Sin lactosa' }, program: null,
      apiRequest: async (url, options) => { const body = JSON.parse(options.body); calls.push({ url, body }); if (url.includes('customer-memory') && fail) { fail = false; throw new Error('offline'); } return { customer: { id: id(42) } }; },
      setIsSaving() {}, setError(value) { if (value) notices.push(value); }, setNotice() {}, setPendingFoodCustomer() {}, setFoodSafety() {}, setIsCreateModalOpen() {}, setForm() {}, loadData: async () => {},
    };
    const submit = make(deps); await submit({ preventDefault() {} });
    if (foodMode) {
      assert.equal(deps.pendingFoodCustomerRef.current, id(42)); assert.match(notices[0], /cliente ya fue creado/);
      await submit({ preventDefault() {} });
      assert.equal(calls.filter(c => c.url === '/api/pos/customers').length, 1);
      assert.equal(calls.filter(c => c.url.includes('customer-memory')).length, 2);
      assert.deepEqual(calls[1].body.allergyTags, ['Nuez', 'lácteos']); assert.equal(calls[1].body.restrictionNote, 'Sin lactosa');
      assert.equal(deps.pendingFoodCustomerRef.current, null);
    } else assert.ok(calls.every(c => c.url === '/api/pos/customers'));
  }
});

test('Temperature single choice is automatic; choice is mandatory; sizes are not modifier presets', () => {
  const shared = compile(read('src/lib/pos/food-shared.ts'));
  const group = { id: 'temperature', required: true, selection_mode: 'single', min_selections: 1, max_selections: 1, options: [{ id: 'hot' }] };
  assert.deepEqual(shared.automaticFoodModifierIds([group]), ['hot']);
  group.options.push({ id: 'cold' }); assert.deepEqual(shared.automaticFoodModifierIds([group]), []);
  assert.equal(shared.validFoodModifierSelection([group], []), false); assert.equal(shared.validFoodModifierSelection([group], ['cold']), true);
  const admin = read(base + 'components/pos-food-modifiers-admin.tsx');
  for (const label of ['Solo caliente', 'Solo fría', 'El cliente puede elegir']) assert.ok(admin.includes(label));
  assert.doesNotMatch(admin, /preset\(['"]Tamaño/);
});

test('Configurator ignores obsolete responses, retries failures and adds only the currently previewed size', async () => {
  const slots = [], effects = [], requests = [], added = [];
  let cursor = 0;
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(fn, deps) { const index = cursor++; const old = slots[index]; if (!old || deps.some((value, n) => value !== old.deps[n])) { old?.cleanup?.(); slots[index] = { deps }; effects.push(() => { slots[index].cleanup = fn(); }); } },
  };
  const shared = compile(read('src/lib/pos/food-shared.ts'));
  const { PosFoodModifierDialog } = compile(read(base + 'components/pos-food-modifiers.tsx'), { react: hooks, '@/lib/pos/food-shared': shared, './pos-ui/pos-modal': { PosModal: () => null } });
  const variants = [{ id: id(3), product_name: 'Latte', name: 'Mediano', price: 50 }, { id: id(4), product_name: 'Latte', name: 'Grande', price: 60 }];
  const props = { product: variants[0], variants, brandSlug: 'food', locationId: id(1), money: String, busy: false, onAdd: async (...args) => { added.push(args); return true; } };
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.document = { activeElement: null };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ body: JSON.parse(options.body), resolve, signal: options.signal }));
  const render = () => { cursor = 0; const tree = PosFoodModifierDialog(props); effects.splice(0).forEach(fn => fn()); return tree; };
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const addButton = tree => nodes(tree.props.footer).find(node => node.type === 'button' && node.props.children?.startsWith?.('Agregar'));
  const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
  const response = (variantId, canAdd = true) => ({ ok: true, json: async () => ({ preview: { variantId, lineTotal: 60, available: canAdd ? 1 : 0, canAdd } }) });
  try {
    let tree = render(); assert.equal(addButton(tree).props.disabled, true);
    nodes(tree).find(node => node.type === 'button' && node.key === id(4)).props.onClick();
    tree = render(); assert.equal(requests.length, 2); assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve(response(id(3))); await settle();
    assert.equal(addButton(render()).props.disabled, true);
    requests[1].resolve({ ok: false, json: async () => ({ error: 'No disponible' }) }); await settle();
    tree = render(); assert.equal(addButton(tree).props.disabled, true);
    nodes(tree).find(node => node.type === 'button' && node.props.children === 'Reintentar').props.onClick();
    render(); requests[2].resolve(response(id(4))); await settle();
    tree = render(); assert.equal(addButton(tree).props.disabled, false);
    addButton(tree).props.onClick(); await settle();
    assert.deepEqual(added, [[[], '', id(4)]]);
  } finally { globalThis.fetch = previousFetch; if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('Canonical V2 resolver owns quantities; snapshot and SEND consume its output without a TS algorithm', () => {
  const sql = read('supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql');
  assert.match(sql, /unique\(product_id,option_id\)/);
  assert.match(sql, /r->'components',r->'effects'/);
  assert.match(sql, /pos_food_item_recipe_snapshots/);
  assert.match(sql, /quantity-inv.reserved_quantity/);
  assert.match(sql, /pos_food_sale_consumptions/);
  const workspace = read(base + 'components/pos-food-prepared-workspace.tsx');
  assert.match(workspace, /No captures stock del preparado/);
  assert.match(workspace, /Cada tamaño es una variante del mismo producto/);
  const migration = read('supabase/migrations/20260922120000_pos_food_canonical_recipe_v2.sql');
  assert.match(migration, /pos_food_effect_option_order_key unique\(product_id,option_id,effect_order\)/);
  assert.match(migration, /quantity_mode='source'/);
  assert.match(migration, /pos_food_consume_sent_recipes_v2/);
  assert.doesNotMatch(read('src/lib/pos/food-recipes-server.ts'), /assertExactFoodEffects|assertFoodVariantEffects/);
  assert.match(read('src/app/api/pos/food/configuration-preview/route.ts'), /pos_food_recipe_metrics_v1/);
});
