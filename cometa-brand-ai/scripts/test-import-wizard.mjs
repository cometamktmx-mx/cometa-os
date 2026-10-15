// Component/transport test, not browser evidence. No credentials or remote writes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const contract = { exports: {} };
vm.runInNewContext(transpile('src/lib/pos/eleventa-import.ts'), { module: contract, exports: contract.exports });
async function harness({ showTestHelp = false } = {}) {
  const slots = [], effects = [], requests = []; let cursor = 0, tree, failApply = false;
  const hooks = { useState: init => { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef: init => { const i = cursor++; return slots[i] ?? (slots[i] = { current: init }); }, useCallback: f => f, useEffect: f => effects.push(f) };
  const rows = [{ rowNumber: 2, values: { code: '00001', name: 'Sintético' }, errors: [], matches: [] }, { rowNumber: 3, values: { code: '00002' }, errors: [], matches: ['existing'] }, { rowNumber: 4, values: { code: '00001' }, errors: ['Código duplicado.'], matches: [] }];
  const request = async (url, init) => {
    assert.ok(url.includes('brandSlug=fixture'));
    if (!init) return { ok: true, json: async () => url.includes('/locations') ? { ok: true, locations: [{ id: 'location', name: 'Principal' }] } : { ok: true, runs: [] } };
    const form = init.body, mode = form.get('mode'); requests.push({ mode, form });
    if (mode === 'apply' && failApply) return { ok: false, json: async () => ({ error: { message: 'No tienes permiso para importar en esta marca.' } }) };
    return { ok: true, json: async () => mode === 'inspect' ? { ok: true, sheets: ['Hoja1'], headers: ['Código', 'Descripción'], mapping: { code: 0, name: 1 } } : mode === 'preview' ? { ok: true, preview: { rows, token: 'preview-token' } } : { ok: true, result: { status: 'done', id: 'run' } } };
  };
  const module = { exports: {} };
  vm.runInNewContext(transpile('src/app/brand/[brandSlug]/pos/settings/import/importer.tsx'), { module, exports: module.exports, File, FormData, crypto, require: name => name === 'react' ? hooks : name.endsWith('.module.css') ? { default: new Proxy({}, { get: (_, key) => key }) } : name.includes('client-transport') ? { usePosFetch: () => request } : name.includes('eleventa-import') ? contract.exports : name.includes('pos-shell') ? {} : name.includes('pos-icons') ? { PosIcon: () => null } : name === 'next/link' ? { default: 'a' } : require(name) });
  const render = () => { cursor = 0; effects.length = 0; tree = module.exports.Importer({ brandSlug: 'fixture', showTestHelp }); };
  const nodes = () => { const result = []; const visit = node => { if (Array.isArray(node)) return node.forEach(visit); if (!node || typeof node !== 'object') return; result.push(node); visit(node.props?.children); }; visit(tree); return result; };
  const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' && node ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
  const button = label => nodes().find(node => node.type === 'button' && text(node) === label);
  const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); render(); };
  render(); for (const effect of effects) effect(); await settle();
  return { nodes, button, render, settle, requests, text: () => text(tree), fail: value => { failApply = value; } };
}
const h = await harness();
assert.ok(!h.text().includes('Ayuda para pruebas'));
assert.ok(h.text().includes('ELEVENTA'));
h.button('Continuar ').props.onClick(); h.render();
const upload = () => h.nodes().find(node => node.type === 'input' && node.props.type === 'file');
upload().props.onChange({ target: { files: [new File(['x'], 'incorrecto.pdf')], value: '' } }); h.render();
assert.ok(h.text().includes('hasta 5 MB')); assert.equal(h.requests.length, 0);
upload().props.onChange({ target: { files: [new File(['Código,Descripción\n00001,Sintético'], 'sintetico.csv')], value: '' } }); await h.settle();
assert.equal(h.requests[0].mode, 'inspect'); assert.equal(h.requests[0].form.get('headerRow'), '1');
h.button('Revisar correspondencias ').props.onClick(); h.render();
h.button('Validar y ver vista previa').props.onClick(); await h.settle();
assert.equal(h.button('Confirmar importación').props.disabled, true);
for (const [row, value] of [[2, 'create'], [3, 'update'], [4, 'skip']]) { h.nodes().find(n => n.props['aria-label'] === `Decisión fila ${row}`).props.onChange({ target: { value } }); h.render(); }
assert.equal(h.button('Confirmar importación').props.disabled, false);
h.fail(true); h.button('Confirmar importación').props.onClick(); h.button('Confirmar importación').props.onClick(); await h.settle();
assert.equal(h.requests.filter(r => r.mode === 'apply').length, 1);
assert.ok(h.text().includes('No tienes permiso')); assert.equal(h.button('Confirmar importación').props.disabled, false);
const first = h.requests.at(-1).form;
h.fail(false); h.button('Confirmar importación').props.onClick(); await h.settle();
assert.equal(h.requests.at(-1).form.get('requestKey'), first.get('requestKey'));
assert.equal(h.requests.at(-1).form.get('token'), 'preview-token');
assert.equal(h.requests.at(-1).form.get('decisions'), first.get('decisions'));
assert.ok(h.text().includes('Tu información ya está en COMETA'));
assert.ok(h.text().includes('1Creados1Actualizados1Rechazados por errores'));
assert.ok(h.text().includes('Código duplicado.'));
h.button('Importar inventario').props.onClick(); h.render();
assert.ok(h.text().includes('Sucursal de destino')); assert.equal(h.button('Continuar ').props.disabled, true);
const preview = await harness({ showTestHelp: true }); assert.ok(preview.text().includes('Ayuda para pruebas'));
for (const [environment, mode, expected] of [['production', 'test', false], ['production', 'live', false], ['preview', 'live', false], ['preview', 'test', true]]) {
  const page = { exports: {} };
  vm.runInNewContext(transpile('src/app/brand/[brandSlug]/pos/settings/import/page.tsx'), { module: page, exports: page.exports, process: { env: { VERCEL_ENV: environment, STOREFRONT_PAYMENTS_MODE: mode } }, require: name => name === './importer' ? { default: 'Importer' } : require(name) });
  assert.equal(page.exports.default().props.showTestHelp, expected);
}
console.log('PASS wizard: upload validation, automatic inspect, mapping, explicit decisions, atomic result, permission error with retained retry key, synchronous double-submit lock, inventory location and test-only help. Simulated transport, no browser or DB writes.');
