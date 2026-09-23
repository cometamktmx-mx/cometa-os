import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const base = 'src/app/brand/[brandSlug]/';
const read = file => readFileSync(file, 'utf8');
function compile(source, deps = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
function componentFunction(file, name, prelude = '') {
  const source = read(file), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return compile(`${prelude}\n${declaration.getText(ast)}\nexport { ${name} };`)[name];
}
const numeric = compile(read('src/lib/pos/numeric-input.ts'));
const staff = compile(read('src/lib/pos/staff-shared.ts'));
const prepared = compile(read(base + 'components/pos-food-prepared-workspace.tsx'), { '@/lib/pos/numeric-input': numeric });
const noop = () => {};
const milk = { ingredient_variant_id: 'milk', name: 'Leche', base_quantity: 220, base_unit_code: 'ml', physical_stock: 5000, available_stock: 5000, possible: 22, unit_cost: .03, subtotal: 6.6 };
const coffee = { ingredient_variant_id: 'coffee', name: 'Café', base_quantity: 70, base_unit_code: 'ml', physical_stock: 2000, available_stock: 2000, possible: 28, unit_cost: .02, subtotal: 1.4 };
const recipe = { version: 1, components: [milk, coffee], availability: 22, limiting_ingredient: 'Leche', limiting_remaining: 160, unit_cost: 8, gross_profit: 42, gross_margin: .84 };
const catalog = { ingredients: [], products: [], effects: [], units: [], movements: [] };
function preparedHtml(metrics = recipe) {
  return renderToStaticMarkup(React.createElement(prepared.PosFoodPreparedWorkspace, {
    open: true, onClose: noop, product: { recipe: metrics }, newProduct: false,
    productForm: { name: 'Latte', description: '', price: 50, tax_rate: 0, active: true, category_id: '' },
    setProductForm: noop, productImageUrl: '', imageBusy: false, imageError: null, onFile: noop, onRemoveImage: noop,
    busy: false, error: null, catalog, categories: [], components: [], setComponents: noop,
    ingredientSearch: '', setIngredientSearch: noop, activeIngredients: [], money: value => `$${value}`, onSave: noop, onPublish: noop,
  }));
}

test('Latte reference: limiting milk gives 22 portions; UI consumes server availability without manual stock', () => {
  // Reference arithmetic plus the SQL contract; this is not a PostgreSQL integration run.
  assert.equal(Math.floor(Math.min(5000 / 220, 2000 / 70)), 22);
  const sql = read('supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql');
  assert.match(sql, /possible:=floor\(available\/\(c->>'base_quantity'\)::numeric\)/);
  assert.match(sql, /possible<minimum then minimum:=possible/);
  assert.match(sql, /stock\.quantity,0\)-coalesce\(stock\.reserved_quantity,0\)/);
  const html = preparedHtml();
  assert.match(html, /22 porciones disponibles/);
  assert.match(html, /Insumo limitante/);
  assert.match(html, /Leche/);
  assert.match(html, /No captures stock del preparado/);
  assert.doesNotMatch(html, /<input[^>]*(?:stock|initial_quantity|currentStock)/i);
  assert.match(preparedHtml({ ...recipe, availability: 0 }), /0 porciones disponibles/);
  assert.equal(Math.floor(Math.min(219 / 220, 2000 / 70)), 0);
});

test('Direct Food displays units and minimum-stock warning; Retail card keeps its previous vocabulary', () => {
  const FoodDirectAvailability = componentFunction(base + 'pos/products/page.tsx', 'FoodDirectAvailability', 'const formatQuantity = String;');
  const product = { inventory_mode: 'direct', summary: { availableStock: 24 }, variants: [{ active: true, inventory: [{ available_quantity: 24, minimum_quantity: 5 }] }] };
  const render = () => renderToStaticMarkup(React.createElement(FoodDirectAvailability, { product }));
  assert.match(render(), /24 piezas disponibles/); assert.match(render(), />Disponible</);
  product.summary.availableStock = 4; product.variants[0].inventory[0].available_quantity = 4;
  assert.match(render(), /Pocas existencias/);
  product.summary.availableStock = 0;
  assert.match(render(), /Agotado/);
  const source = read(base + 'pos/products/page.tsx');
  assert.match(source, /if \(foodDirect\)[\s\S]*inventoryMode: "direct"/);
  assert.match(source, /currentStock: Number\(variant.stock\?\.quantity/);
  assert.match(source, /foodDirect \? <FoodDirectAvailability product=\{product\} \/> : product.inventory_mode/);
  assert.match(source, /title=\{foodDirect \? "Menú · Listo para vender" : "Productos"\}/);
});

test('Food navigation renders Menú/Insumos and ingredient route; Retail retains Productos/Inventario', () => {
  const source = read(base + 'components/pos-sidebar.tsx') + '\nexport { PosNavigation };';
  const sidebar = compile(source, {
    'next/link': { __esModule: true, default: props => React.createElement('a', { href: props.href }, props.children) },
    './pos-icons': { PosIcon: () => null }, './pos-ui': {}, '@/lib/pos/staff-shared': staff,
  });
  const render = foodMode => renderToStaticMarkup(React.createElement(sidebar.PosNavigation, { brand: { slug: 'food' }, pathname: '', canManageTeam: false, foodMode }));
  assert.match(render(true), />Menú</); assert.match(render(true), />Insumos</); assert.match(render(true), /\/pos\/admin\/inventory/);
  assert.doesNotMatch(render(true), />Productos<|>Inventario</);
  assert.match(render(false), />Productos</); assert.match(render(false), />Inventario</);
  assert.doesNotMatch(render(false), />Menú<|>Insumos</);
  const policy = read('src/lib/pos/surface-policy.ts');
  assert.match(policy, /coffee_shop/); assert.match(policy, /restaurant/);
});

const memory = {
  customer: { id: 'client', first_name: 'Ana', last_name: 'López', phone: '555123', notes: 'Prefiere bebida tibia' },
  profile: { allergy_tags: ['Cacahuate'], restriction_note: 'Sin lácteos' }, pointsBalance: 10, visits: 4,
  topProducts: [{ productName: 'Latte', variantName: 'Chico', orders: 3 }],
  recentPurchases: [{ id: 'sale', saleNumber: 'V-42', soldAt: '2026-09-20T12:00:00Z', items: [{ product_name: 'Latte', quantity: 1 }] }],
};
function operations(react = React) {
  return compile(read(base + 'components/pos-food-operations.tsx'), {
    react, '@/lib/pos/staff-shared': staff, '@/lib/pos/food-shared': {}, './pos-food-receipt': {}, './pos-food-modifiers': {},
    './pos-ui/pos-modal': { PosModal: props => props.open ? React.createElement('section', {}, props.children) : null },
  });
}

test('Customer Food renders allergies first, restrictions, notes, telephone, loyalty, favorites and history', () => {
  const { FoodCustomerDetails } = operations();
  const html = renderToStaticMarkup(React.createElement(FoodCustomerDetails, { memory }));
  for (const text of ['Alergias', 'Cacahuate', 'Restricciones', 'Sin lácteos', 'Prefiere bebida tibia', '555123', '10 puntos', '4 visitas', 'Favoritos', 'Latte', 'V-42']) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('Alergias') < html.indexOf('Notas y preferencias'));
});

test('Memory HTTP/network/malformed errors reject rather than pretend no allergies; tenant is explicit', async () => {
  const { loadFoodCustomerMemory } = operations(); const original = globalThis.fetch;
  try {
    for (const response of [new Response('{}', { status: 503 }), new Response('{}'), new Response(JSON.stringify({ ...memory, customer: { ...memory.customer, id: 'other' } }))]) {
      globalThis.fetch = async () => response; await assert.rejects(loadFoodCustomerMemory('brand', 'client'));
    }
    globalThis.fetch = async () => { throw new Error('offline'); }; await assert.rejects(loadFoodCustomerMemory('brand', 'client'));
    globalThis.fetch = async (url, options) => { assert.equal(new URL(url, 'http://local').searchParams.get('brandSlug'), 'brand'); assert.equal(options.cache, 'no-store'); return new Response(JSON.stringify(memory)); };
    assert.deepEqual(await loadFoodCustomerMemory('brand', 'client'), memory);
  } finally { globalThis.fetch = original; }
});

function hooks() {
  const values = [], refs = [], dependencies = [], cleanups = []; let cursor = 0, refCursor = 0, effectCursor = 0; let pending = [];
  return {
    react: { ...React,
      useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; },
      useRef(initial) { return refs[refCursor++] ||= { current: initial }; },
      useEffect(effect, deps) { const index = effectCursor++; if (!dependencies[index] || deps.some((d, i) => d !== dependencies[index][i])) { dependencies[index] = deps; pending.push(() => { cleanups[index]?.(); cleanups[index] = effect(); }); } },
    },
    render(component, props) { cursor = refCursor = effectCursor = 0; return component(props); },
    async effects() { const work = pending; pending = []; work.forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); },
    cleanup() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}
function findElement(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) { const found = findElement(child, predicate); if (found) return found; }
  return null;
}

test('Customer failed load is visibly retryable, successful retry restores data, View and Edit are separate', async () => {
  const h = hooks(), { CustomerInlineSummary } = operations(h.react), original = globalThis.fetch; let calls = 0;
  const props = { brandSlug: 'brand', check: { customer_id: 'client', customer_name: 'Ana' }, canEditMemory: true, query: '', results: [], loading: false, open: false, onOpenSearch: noop, onCloseSearch: noop, onSearch: noop, onSelect: noop };
  try {
    globalThis.fetch = async () => ++calls === 1 ? new Response('{}', { status: 503 }) : new Response(JSON.stringify(memory));
    h.render(CustomerInlineSummary, props); await h.effects(); let tree = h.render(CustomerInlineSummary, props);
    assert.match(renderToStaticMarkup(tree), /No podemos confirmar alergias/);
    findElement(tree, e => e.type === 'button' && e.props.children === 'Reintentar ficha').props.onClick();
    h.render(CustomerInlineSummary, props); await h.effects(); tree = h.render(CustomerInlineSummary, props);
    assert.equal(calls, 2); assert.match(renderToStaticMarkup(tree), /Cacahuate/); assert.doesNotMatch(renderToStaticMarkup(tree), /No podemos confirmar alergias/);
    findElement(tree, e => e.type === 'button' && e.props.children === 'Ver cliente').props.onClick();
    tree = h.render(CustomerInlineSummary, props);
    assert.equal(findElement(tree, e => e.props?.title === 'Ficha del cliente').props.open, true);
    assert.equal(findElement(tree, e => e.props?.title === 'Editar cliente').props.open, false);
    findElement(tree, e => e.type === 'button' && e.props.children === 'Editar cliente').props.onClick();
    tree = h.render(CustomerInlineSummary, props);
    assert.equal(findElement(tree, e => e.props?.title === 'Editar cliente').props.open, true);
    assert.doesNotMatch(renderToStaticMarkup(h.render(CustomerInlineSummary, { ...props, canEditMemory: false })), /<button[^>]*>Editar cliente/);
  } finally { h.cleanup(); globalThis.fetch = original; }
});

test('Ingredients detail uses existing data and distinguishes purchase conversions, physical stock and portions', () => {
  const source = read(base + 'components/pos-food-recipes-admin.tsx');
  for (const label of ['1. Existencias', '2. Presentaciones de compra', '3. Costos', '4. Movimientos', '5. Recetas donde se utiliza', '1 kg = 1000 g', '1 l = 1000 ml', 'porciones disponibles']) assert.ok(source.includes(label), label);
  assert.match(source, /m.variant_id === detail.id/);
  assert.match(source, /c.ingredient_variant_id === detail.id/);
  assert.match(source, /últimos 100 movimientos/);
  assert.match(source, /p.recipe\?\.availability === 0/);
});

test('Real menu cards show calculated portions, pending recipe and out/low stock; ingredient detail filters associations', () => {
  const product = { id: 'latte', name: 'Latte', price: 50, active: true, inventory_mode: 'recipe', recipe, recipe_components: [{ ingredient_variant_id: 'milk', base_quantity: 220 }] };
  const ingredient = { id: 'milk', name: 'Leche', category: 'base', unit_code: 'ml', stock: 5000, reserved_stock: 0, minimum_stock: 100, usable_estimated_stock: 5000, unit_cost: .03, waste_percent: 0, supplier_name: 'Proveedor local', active: true, presentations: [{ id: 'bottle', name: 'Botella 1 l', conversion_factor: 1000, base_unit_code: 'ml', configured_cost: 30, active: true }] };
  const fixture = { ...catalog, products: [product], ingredients: [ingredient], movements: [{ id: 'movement', variant_id: 'milk', created_at: '2026-09-20T12:00:00Z', quantity_delta: 1000, quantity_before: 4000, quantity_after: 5000, notes: 'Compra local' }, { id: 'other', variant_id: 'coffee', notes: 'No mostrar' }] };
  const h = hooks(); let first = true;
  const react = { ...h.react, useState(initial) { if (first) { first = false; return h.react.useState(fixture); } return h.react.useState(initial); }, useCallback: fn => fn };
  const { Workspace } = compile(read(base + 'components/pos-food-recipes-admin.tsx') + '\nexport { Workspace };', {
    react, 'next/link': { __esModule: true, default: props => React.createElement('a', { href: props.href }, props.children) },
    './pos-shell': {}, './pos-ui/pos-drawer': { PosDrawer: props => props.open ? React.createElement('aside', {}, props.children) : null },
    './pos-food-modifiers-admin': { PosFoodProductOptions: () => null }, './pos-food-prepared-workspace': { PosFoodPreparedWorkspace: () => null }, '@/lib/pos/numeric-input': numeric,
  });
  const props = { brandSlug: 'brand', locationId: 'local', location: { currency: 'MXN' }, kind: 'products' };
  const render = () => renderToStaticMarkup(h.render(Workspace, props));
  assert.match(render(), /22 porciones disponibles/); assert.match(render(), />Disponible</);
  product.recipe = { ...recipe, availability: 0 }; assert.match(render(), />Agotado</);
  product.recipe = { ...recipe, availability: 1 }; assert.match(render(), /Pocas existencias/);
  product.recipe = null; assert.match(render(), /Receta pendiente/);
  props.kind = 'inventory';
  let tree = h.render(Workspace, props);
  findElement(tree, e => e.type === 'button' && e.props.children === 'Ver insumo').props.onClick();
  tree = h.render(Workspace, props);
  const detail = findElement(tree, e => e.props?.title === 'Leche');
  assert.equal(detail.props.open, true);
  const html = renderToStaticMarkup(detail);
  for (const text of ['5000', 'Botella 1 l', '1000', 'Latte', '220', 'Compra local', 'Proveedor local']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /No mostrar/);
});

test('Memory API selects existing notes under authorized tenant; kitchen does not receive notes/history', async () => {
  let kitchen = false; const queries = [];
  const admin = { from(table) {
    const entry = { table, filters: [] }; queries.push(entry);
    const result = () => ({ error: null, data: table === 'pos_customers' ? memory.customer : table === 'pos_customer_food_profiles' ? memory.profile : table === 'pos_loyalty_members' ? { points_balance: 10 } : [] });
    const query = {
      select(columns) { entry.columns = columns; return query; },
      eq(key, value) { entry.filters.push([key, value]); return query; },
      order() { return query; }, maybeSingle: async () => result(),
      then(resolve) { return Promise.resolve(result()).then(resolve); },
    }; return query;
  } };
  const route = compile(read('src/app/api/pos/food/customer-memory/route.ts'), {
    '@/lib/pos/staff-shared': staff,
    '@/lib/pos/server': { getBrandSlugFromUrl: () => 'requested', uuidValue: value => value, assertDatabaseResult(error) { if (error) throw error; }, ok: body => body, handlePosError: error => { throw error; } },
    '@/lib/pos/food-server': { requireFoodAccess: async (brand, action) => { assert.equal(brand, 'requested'); assert.equal(action, 'customer_set'); return { context: { admin, brand: { slug: 'authorized' } }, session: { staff: { role: kitchen ? 'KITCHEN' : 'WAITER' } } }; } },
  });
  const request = () => new Request('http://local/?customerId=client');
  assert.equal((await route.GET(request())).customer.notes, memory.customer.notes);
  assert.ok(queries[0].columns.split(',').includes('notes'));
  for (const query of queries) assert.ok(query.filters.some(([key, value]) => key === 'brand_slug' && value === 'authorized'));
  kitchen = true;
  const redacted = await route.GET(request());
  assert.equal(redacted.customer.notes, null); assert.deepEqual(redacted.recentPurchases, []); assert.equal(redacted.pointsBalance, null);
});
