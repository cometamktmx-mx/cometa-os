// Synthetic fixtures only: execute the real scan route with an in-memory database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const brand = 'synthetic-magenta';
const product = (id, product_code, extra = {}) => ({ id, brand_slug: brand, product_code, name: id, active: true, sellable: true, inventory_mode: 'direct', track_inventory: true, ...extra });
const parent = product('parent-sp111', 'SP111');
const other = product('parent-p111m', 'P111M');
const remote = product('other-tenant', 'SP111', { brand_slug: 'other' });
const wildcard = product('literal-wildcard', 'SA%_A');
const collision = product('collision-parent', 'SHARED');
const variant = (id, sku, barcode, parentProduct, extra = {}) => ({ id, brand_slug: parentProduct.brand_slug, product_id: parentProduct.id, sku, barcode, name: id, active: true, price: 123, cost: 42, product: parentProduct, inventory: [{ location_id: 'a', quantity: 7, reserved_quantity: 2 }, { location_id: 'b', quantity: 3, reserved_quantity: 1 }], ...extra });
const rows = {
  pos_products: [other, remote, parent, product('excluded', 'NOPHYSICAL'), product('inactive', 'INACTIVE', { active: false }), wildcard, product('wildcard-neighbor', 'SA11A'), collision],
  pos_product_variants: [variant('sp-s-caf', 'SP111-S-CAF', '7500000000001', parent), variant('sp-m-black', 'SP111-M-NEG', '7500000000002', parent), variant('p111m', 'P111M-S-CAF', '7500000000003', other), variant('remote', 'REMOTE', '7500000000004', remote), variant('collision-variant', 'SHARED', '7500000000005', other)],
};
let authorized = true;
let entitlementSeen;
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const admin = { from(table) {
  assert.ok(rows[table], `unexpected table ${table}`);
  let result = [...rows[table]];
  const query = {
    select() { return query; },
    eq(key, value) { result = result.filter(row => row[key] === value); return query; },
    ilike(key, pattern) {
      // Interpret SQL ILIKE patterns, including backslash-escaped wildcard literals.
      let regex = '^';
      for (let i = 0; i < pattern.length; i++) {
        let c = pattern[i];
        if (c === '\\' && i + 1 < pattern.length) { c = pattern[++i]; regex += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        else if (c === '%') regex += '.*';
        else if (c === '_') regex += '.';
        else regex += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      const match = new RegExp(regex + '$', 'i');
      result = result.filter(row => typeof row[key] === 'string' && match.test(row[key]));
      return query;
    },
    async maybeSingle() { return result.length > 1 ? { data: null, error: { message: 'multiple matches' } } : { data: result[0] || null, error: null }; },
  };
  return query;
} };
const server = {
  getBrandSlugFromUrl: request => new URL(request.url).searchParams.get('brandSlug'),
  requiredText: value => { if (!value?.trim()) throw new ApiError(400, 'missing code'); return value.trim(); },
  assertDatabaseResult: error => { if (error) throw new ApiError(500, error.message); },
  ok: data => Response.json({ ok: true, ...data }),
  fail: (message, status, code) => Response.json({ ok: false, error: message, code }, { status }),
  handlePosError: error => Response.json({ ok: false, error: error.message }, { status: error.status || 500 }),
};
const deps = {
  '@/lib/pos/server': server,
  '@/lib/pos/access': { requirePosOperationalAccess: async args => { entitlementSeen = args.entitlement; if (!authorized) throw new ApiError(403, 'permission denied'); return { admin, brand: { slug: args.brandSlug } }; } },
  '@/lib/pos/staff-server': { getPosMode: async () => 'RETAIL' },
  '@/lib/pos/product-channels': { physicalRequestedForProduct: async (_admin, id) => id !== 'excluded' },
};
function loadRoute(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => { assert.ok(deps[name], `unexpected import ${name}`); return deps[name]; }, Request, Response, URL });
  return mod.exports;
}
const route = loadRoute('src/app/api/pos/product-scan/route.ts');
async function scan(code, slug = brand) {
  const params = new URLSearchParams({ brandSlug: slug, code });
  const response = await route.GET(new Request(`https://synthetic.test/api/pos/product-scan?${params}`));
  return { status: response.status, ...(await response.json()) };
}
let result = await scan('SP111-S-CAF');
assert.equal(result.status, 200); assert.equal(result.matchType, 'sku'); assert.equal(result.variant.id, 'sp-s-caf'); assert.equal(result.variant.price, 123);
assert.equal(result.variant.inventory.find(row => row.location_id === 'a').available_quantity, 5);
assert.equal(result.variant.inventory.find(row => row.location_id === 'b').available_quantity, 2);
result = await scan('7500000000002'); assert.equal(result.matchType, 'barcode'); assert.equal(result.variant.id, 'sp-m-black');
result = await scan('SP111'); assert.equal(result.found, false); assert.equal(result.productMatch.id, parent.id);
result = await scan('sp111'); assert.equal(result.found, false); assert.equal(result.productMatch.id, parent.id);
result = await scan('P111M'); assert.equal(result.productMatch.id, other.id);
result = await scan('SA%_A'); assert.equal(result.productMatch.id, wildcard.id);
result = await scan('SHARED'); assert.equal(result.found, true); assert.equal(result.variant.id, 'collision-variant');
result = await scan('111'); assert.equal(result.productMatch, null);
result = await scan('NOPHYSICAL'); assert.equal(result.productMatch, null);
result = await scan('INACTIVE'); assert.equal(result.productMatch, null);
result = await scan('SP111', 'other'); assert.equal(result.productMatch.id, remote.id);
assert.equal(entitlementSeen, 'pos.products');
authorized = false; result = await scan('SP111'); assert.equal(result.status, 403); assert.equal(result.productMatch, undefined);
authorized = true;
console.log('PASS real product-scan route: exact variant SKU/barcode, parent identity, no substring mixing, tenant/channel and permission boundaries, branch stock');

// Exercise the actual register handler with state setters and a synthetic API.
// The three input surfaces are checked against their real JSX bindings below.
const page = fs.readFileSync('src/app/brand/[brandSlug]/pos/register/page.tsx', 'utf8');
const tree = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findFunction(name) {
  let found;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; else ts.forEachChild(node, visit); }
  visit(tree);
  assert.ok(found, `missing ${name}`);
  return found.getText(tree);
}
function compiledFunction(name) {
  return ts.transpileModule(`${findFunction(name)}\nglobalThis.__test = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
assert.match(page, /onSubmit=\{handleScan\}/);
assert.match(page, /onCode=\{code\s*=>\s*handleScan\(undefined,\s*code\)\}/);
assert.match(page, /event\.key\s*===\s*["']Enter["'][\s\S]{0,180}handleScan\(undefined,\s*search\)/);
assert.match(page, /selectedProduct\.variants\.map\(v=>\(\{id:v\.variantId,name:v\.variantName,attributes:v\.attributes,available:/);
const fixtureProduct = { ...parent, track_inventory: true, variants: rows.pos_product_variants.filter(v => v.product_id === parent.id) };
const branchContext = { console };
vm.runInNewContext(compiledFunction('buildSellableVariants'), branchContext);
const mappedA = branchContext.__test({ products: [fixtureProduct], locationId: 'a' });
const mappedB = branchContext.__test({ products: [fixtureProduct], locationId: 'b' });
assert.equal(mappedA.length, 2); assert.equal(mappedA[0].availableStock, 5); assert.equal(mappedB[0].availableStock, 2);
async function exercise(input, surface, { permitted = true, location = 'a' } = {}) {
  let selected = null, error = null, added = [], products = [other], requested = [];
  const context = {
    selectedSession: { location_id: location }, scanCode: input, brand: { slug: brand },
    scannerRef: { current: { focus() {} } }, window: { setTimeout() {} },
    setIsScanning() {}, setError: value => { error = value; }, setNotice() {}, setScanCode() {}, setSearch() {},
    setProducts: update => { products = update(products); }, setSelectedProductId: value => { selected = value; },
    addVariantToCart: value => { added.push(value); }, getErrorMessage: error => error.message,
    apiRequest: async url => {
      requested.push(url);
      if (!permitted) throw new Error('permission denied');
      const parsed = new URL(url, 'https://synthetic.test');
      if (parsed.pathname === '/api/pos/product-scan') return scan(parsed.searchParams.get('code'));
      assert.equal(parsed.pathname, '/api/pos/products');
      assert.equal(parsed.searchParams.get('productId'), parent.id);
      assert.equal(parsed.searchParams.get('channel'), 'physical');
      assert.equal(parsed.searchParams.get('active'), 'true');
      return { products: [fixtureProduct] };
    },
  };
  vm.runInNewContext(compiledFunction('handleScan'), context);
  if (surface === 'scanner') await context.__test({ preventDefault() {} });
  else await context.__test(undefined, input); // F3 Enter and camera pass code explicitly.
  return { selected, error, added, products, requested };
}
for (const surface of ['manual', 'scanner', 'camera']) {
  let state = await exercise('SP111', surface);
  assert.equal(state.selected, parent.id, surface); assert.equal(state.added.length, 0, surface);
  assert.equal(state.products.find(p => p.id === parent.id).variants.length, 2, surface);
  state = await exercise('SP111-S-CAF', surface, { location: 'b' });
  assert.equal(state.selected, null, surface); assert.equal(state.added.length, 1, surface);
  assert.equal(state.added[0].variantId, 'sp-s-caf', surface); assert.equal(state.added[0].availableStock, 2, surface);
  state = await exercise('7500000000002', surface);
  assert.equal(state.selected, null, surface); assert.equal(state.added[0].variantId, 'sp-m-black', surface);
  state = await exercise('SP111', surface, { permitted: false });
  assert.equal(state.error, 'permission denied', surface); assert.equal(state.selected, null, surface); assert.equal(state.added.length, 0, surface);
}
console.log('PASS real register handler: manual Enter, scanner and camera resolve parent without auto-selection, exact SKU, branch stock and denied permission');

// Verify the real entitlement-to-operator permission mapping used by both APIs.
const accessSource = fs.readFileSync('src/lib/pos/access.ts', 'utf8');
const accessTree = ts.createSourceFile('access.ts', accessSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const operational = accessTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'requirePosOperationalAccess');
assert.ok(operational);
let actualPermission, denyOperator = false;
const accessContext = {
  exports: {},
  requirePosContext: async slug => ({ brand: { slug } }),
  requirePosCommercialAccess: async (context, entitlement) => { assert.equal(entitlement, 'pos.products'); return context; },
  require: name => { assert.equal(name, './staff-server'); return { getPosMode: async () => 'RETAIL', requireRetailPermission: async (_context, permission) => { actualPermission = permission; if (denyOperator) throw new Error('operator denied'); } }; },
};
const operationalCode = ts.transpileModule(`${operational.getText(accessTree)}\nglobalThis.__test = requirePosOperationalAccess;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(operationalCode.replace('exports.requirePosOperationalAccess = requirePosOperationalAccess;', ''), accessContext);
await accessContext.__test({ brandSlug: brand, entitlement: 'pos.products' });
assert.equal(actualPermission, 'PRODUCTS_READ');
denyOperator = true;
await assert.rejects(accessContext.__test({ brandSlug: brand, entitlement: 'pos.products' }), /operator denied/);
console.log('PASS real operational access mapping: pos.products requires PRODUCTS_READ for retail operators');
