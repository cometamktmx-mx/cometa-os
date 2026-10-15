// Synthetic files only. Parser/format checks, NOT database persistence tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as XLSX from 'xlsx';
const compiled = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/pos/eleventa-import.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: compiled, exports: compiled.exports });
const { parseRows, suggestMapping, parseNumber } = compiled.exports;
const dir = 'docs/evidence/eleventa';
fs.mkdirSync(dir, { recursive: true });
const products = [
  ['Código de barras', 'Descripción', 'Precio venta', 'Precio costo', 'Columna desconocida'],
  ['0000123', 'SINTÉTICO — Producto de prueba', '120.50', '50', 'NO IMPORTAR'],
  ['0000456', 'SINTÉTICO — Segundo producto', '0', '0', 'NO IMPORTAR'],
];
for (const format of ['xlsx', 'xls', 'csv']) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(products);
  XLSX.utils.book_append_sheet(workbook, sheet, 'SINTETICO');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: format === 'xls' ? 'biff8' : format });
  fs.writeFileSync(`${dir}/SINTETICO-productos.${format}`, bytes);
  const decoded = XLSX.read(bytes, { type: 'buffer', raw: true, cellNF: true, cellText: true });
  const matrix = XLSX.utils.sheet_to_json(decoded.Sheets[decoded.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const mapping = suggestMapping(matrix[0], 'products');
  const rows = parseRows(matrix, 'products', mapping);
  assert.equal(rows[0].values.code, '0000123');
  assert.equal(rows[0].values.price, 120.5);
  assert.equal(rows[1].values.price, 0);
  assert.equal(rows[0].errors.length, 0);
  assert.equal(Object.keys(mapping).length, 4);
  assert.equal(JSON.stringify(parseRows(matrix, 'products', mapping)), JSON.stringify(rows), 'second parse is deterministic, not a persistence claim');
}
const formatted = XLSX.utils.aoa_to_sheet([['Código', 'Descripción'], [123, 'SINTÉTICO']]);
formatted.A2.z = '0000000'; delete formatted.A2.w;
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, formatted, 'SINTETICO');
const roundtrip = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true, cellText: true });
assert.equal(XLSX.utils.sheet_to_json(roundtrip.Sheets.SINTETICO, { header: 1, raw: false })[1][0], '0000123');
const invalid = [['CLAVE', 'PRODUCTO', 'PRECIO', 'COSTO'], ['001', 'SINTÉTICO', '-1', '2'], ['001', 'SINTÉTICO duplicado', 'abc', ''], ['', 'SINTÉTICO sin código', '1', '2']];
fs.writeFileSync(`${dir}/SINTETICO-invalidos.csv`, XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(invalid)));
const rows = parseRows(invalid, 'products', suggestMapping(invalid[0], 'products'));
assert.ok(rows.every(r => r.errors.length > 0));
assert.ok(rows[0].errors.some(e => e.includes('duplicado')));
assert.equal(rows[1].values.cost, undefined, 'blank cost never becomes zero');
const manual = parseRows([['REF LOCAL', 'NOMBRE LOCAL', 'PVP'], ['0001', 'SINTÉTICO manual', '1,200.50']], 'products', { code: 0, name: 1, price: 2 });
assert.equal(manual[0].values.price, 1200.5);
assert.equal(manual[0].values.cost, undefined);
assert.throws(() => parseRows(products, 'products', { code: 0, name: 0 }));
assert.throws(() => parseRows(products, 'products', { code: 99 }));
assert.throws(() => parseRows(Array.from({ length: 502 }, () => ['x']), 'products', { code: 0 }));
for (const bad of ['', '-1', 'NaN', 'Infinity', '1e3', '1,50', '1.234', '120 MXN']) assert.equal(parseNumber(bad, 2), null, bad);
const customers = [['Código cliente', 'Nombre', 'Teléfono', 'Correo electrónico'], ['0009', 'SINTÉTICO Cliente', '0005550100', 'uno@example.test'], ['0010', 'SINTÉTICO Duplicado', '0005550100', 'invalido']];
fs.writeFileSync(`${dir}/SINTETICO-clientes.csv`, XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(customers)));
const cr = parseRows(customers, 'customers', suggestMapping(customers[0], 'customers'));
assert.equal(cr[0].values.phone, '0005550100');
assert.ok(cr[0].errors.some(e => e.includes('duplicado')));
assert.ok(cr[1].errors.some(e => e.includes('Correo')));
const inventory = [['Código', 'Existencia'], ['0000123', '10.500'], ['0000456', '0'], ['0099', '']];
fs.writeFileSync(`${dir}/SINTETICO-inventario.csv`, XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(inventory)));
const ir = parseRows(inventory, 'inventory', suggestMapping(inventory[0], 'inventory'));
assert.equal(ir[0].values.quantity, 10.5); assert.equal(ir[1].values.quantity, 0);
assert.equal(ir[2].values.quantity, undefined); assert.ok(ir[2].errors.length);
console.log('PASS synthetic XLS/XLSX/CSV, formatted/text codes, aliases/manual mapping, unknown columns, blanks, numeric precision, duplicate identifiers, invalid rows and deterministic second parse. NO persistence certification.');
