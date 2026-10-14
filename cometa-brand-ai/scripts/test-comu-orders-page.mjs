// Executes the real page with simulated authorization; no database or network.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
let stores = [], failure = null, calls = 0;
class PosApiError extends Error { constructor(status) { super('guard'); this.status = status; } }
const redirect = url => { throw Object.assign(new Error('redirect'), { url }); };
const deps = {
  'next/link': ({ href, children }) => require('react').createElement('a', { href }, children),
  'next/navigation': { redirect, notFound: () => { throw new Error('not-found'); } },
  '@/lib/pos/server': { PosApiError },
  '@/lib/comu/seller-orders': { getSellerOrderStores: async () => { calls++; if (failure) throw failure; return stores; } },
};
const loaded = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/app/comu/seller/orders/page.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, URLSearchParams, require: name => deps[name] ?? require(name) });
const page = loaded.exports.default;
for (const status of [401, 403, 503]) {
  failure = new PosApiError(status);
  await assert.rejects(() => page({}), error => status === 401 ? error.url === '/comu/login?next=%2Fcomu%2Fseller%2Forders' : status === 403 ? error.message === 'not-found' : error === failure);
}
failure = null;
assert.match(renderToStaticMarkup(await page({})), /No tienes tiendas/);
stores = [{ id: 'one', brand_slug: 'authorized-brand', public_name: 'Authorized' }];
await assert.rejects(() => page({ searchParams: Promise.resolve({ selected: 'order', days: '30', search: 'a & b', page: '2', ignored: 'secret', status: ['PAID'] }) }), error => {
  assert.equal(error.url, '/comu/seller/authorized-brand/orders?selected=order&days=30&search=a+%26+b&page=2'); return true;
});
stores.push({ id: 'two', brand_slug: 'second-brand', public_name: 'Second' });
const html = renderToStaticMarkup(await page({}));
assert.match(html, /Selecciona la tienda/);assert.match(html, /authorized-brand\/orders/);assert.match(html, /second-brand\/orders/);
assert.equal(calls, 6);
console.log('PASS actual orders page: 401 login, 403 not found, 503 preserved, empty, single-store redirect with allowed filters, multi-store selection. Auth simulated.');
const sequence = [];
let denyBrand = false, denyOrders = false;
const brandDeps = {
  '@/lib/brand-os/server': { requireBrandAccess: async slug => { sequence.push('brand:' + slug); if (denyBrand) throw new Error('brand-denied'); } },
  '@/lib/comu/seller-orders': { requireOrderBrand: async slug => { sequence.push('orders:' + slug); if (denyOrders) throw new Error('orders-denied'); return { id: 'authorized-seller', brand_slug: 'resolved-brand' }; } },
  '@/app/comu/seller/orders-manager': () => null,
};
const brandModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/brand/[brandSlug]/comu/orders/page.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, { module: brandModule, exports: brandModule.exports, require: name => brandDeps[name] ?? require(name) });
const brandPage = () => brandModule.exports.default({ params: Promise.resolve({ brandSlug: 'requested-brand' }) });
denyBrand = true;await assert.rejects(brandPage, /brand-denied/);assert.deepEqual(sequence, ['brand:requested-brand']);
sequence.length = 0;denyBrand = false;denyOrders = true;await assert.rejects(brandPage, /orders-denied/);assert.deepEqual(sequence, ['brand:requested-brand', 'orders:requested-brand']);
denyOrders = false;const rendered = await brandPage();assert.equal(rendered.props.brandSlug, 'resolved-brand');assert.equal(rendered.props.sellerId, 'authorized-seller');
console.log('PASS Brand OS wrapper: brand authorization before seller authorization, both denials preserved, manager receives resolved authorized seller. Auth simulated.');
