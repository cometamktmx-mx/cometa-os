export type ImportKind = 'products' | 'inventory' | 'customers';
export type ImportDecision = 'create' | 'update' | 'skip';
export const IMPORT_FIELDS = {
  code: 'Código / código de barras', name: 'Descripción / nombre', price: 'Precio de venta',
  cost: 'Precio de costo', tax_rate: 'Tasa de impuesto (%)', quantity: 'Existencia absoluta', first_name: 'Nombre del cliente',
  last_name: 'Apellidos', phone: 'Teléfono', email: 'Correo', notes: 'Notas',
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export type ImportMapping = Partial<Record<ImportField, number>>;
export type ImportRow = { rowNumber: number; values: Record<string, string | number>; errors: string[]; decision?: ImportDecision; matches?: string[]; expected?: string };
export const fieldsFor = (kind: ImportKind): ImportField[] => kind === 'customers'
  ? ['code', 'first_name', 'last_name', 'phone', 'email', 'notes']
  : kind === 'inventory' ? ['code', 'quantity'] : ['code', 'name', 'price', 'cost', 'tax_rate'];
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<ImportField, string[]> = {
  code: ['codigo', 'codigodebarras', 'codigodelproducto', 'codigodeproducto', 'clave', 'sku', 'codigocliente', 'numerodecliente', 'nocliente'],
  name: ['descripcion', 'producto', 'nombre', 'nombredelproducto'],
  price: ['precio', 'precioventa', 'preciodeventa', 'preciopublico', 'pventa'],
  cost: ['costo', 'preciocosto', 'preciodecosto', 'pcosto'], tax_rate: ['tasadeimpuesto', 'tasaimpuesto'], quantity: ['existencia', 'existencias', 'inventario', 'cantidad', 'stock', 'existenciaactual'],
  first_name: ['nombre', 'cliente', 'nombrecliente', 'nombredelcliente', 'nombrecompleto'], last_name: ['apellidos', 'apellido'],
  phone: ['telefono', 'telefonocelular', 'celular'], email: ['email', 'correo', 'correoelectronico'], notes: ['notas', 'observaciones'],
};
export function suggestMapping(headers: string[], kind: ImportKind): ImportMapping {
  const mapping: ImportMapping = {};
  for (const field of fieldsFor(kind)) {
    const matches = headers.map((h, i) => aliases[field].includes(normalize(h)) ? i : -1).filter(i => i >= 0);
    if (matches.length === 1) mapping[field] = matches[0];
  }
  return mapping;
}
export function parseNumber(text: string, scale: number): number | null {
  const s = text.trim().replace(/^\$\s*/, '');
  // Decimal point and optional groups of three. Ambiguous decimal commas are not guessed.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)) return null;
  const clean = s.replaceAll(',', '');
  if ((clean.split('.')[1]?.length ?? 0) > scale) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 && n < 1e11 ? n : null;
}
export function parseRows(matrix: string[][], kind: ImportKind, mapping: ImportMapping): ImportRow[] {
  if (matrix.length > 501) throw new Error('Máximo 500 filas por importación. Divide el archivo en lotes.');
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length || columns.some(i => !Number.isInteger(i) || i < 0 || i >= (matrix[0]?.length ?? 0))) throw new Error('Correspondencia de columnas inválida o repetida.');
  const rows = matrix.slice(1).flatMap((cells, index): ImportRow[] => {
    if (!cells.some(s => s.trim())) return [];
    const values: Record<string, string | number> = {}, errors: string[] = [];
    for (const field of fieldsFor(kind)) {
      const column = mapping[field];
      const value = column === undefined ? '' : (cells[column] ?? '').trim();
      if (!value) continue;
      if (['price', 'cost', 'quantity', 'tax_rate'].includes(field)) {
        const number = parseNumber(value, field === 'price' ? 2 : field === 'cost' ? 6 : field === 'tax_rate' ? 4 : 3);
        if (number === null || (field === 'tax_rate' && number > 100)) errors.push(`${IMPORT_FIELDS[field]} inválido (usa punto decimal; no negativos).`);
        else values[field] = number;
      } else if (value.length > (field === 'notes' ? 2000 : field === 'name' ? 180 : field === 'email' ? 180 : field === 'phone' ? 40 : 100)) errors.push(`${IMPORT_FIELDS[field]} demasiado largo.`);
      else values[field] = field === 'email' ? value.toLowerCase() : value;
    }
    if (kind !== 'customers' && !values.code) errors.push('Código requerido.');
    if (kind === 'inventory' && values.quantity === undefined) errors.push('Existencia requerida.');
    if (kind === 'customers') {
      if (!values.code && !values.phone && !values.email) errors.push('Se requiere código, teléfono o correo para identificar al cliente.');
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) errors.push('Correo inválido.');
      if (values.phone && (!/^[+\d()\s.-]+$/.test(String(values.phone)) || !/\d/.test(String(values.phone)))) errors.push('Teléfono inválido.');
    }
    return [{ rowNumber: index + 2, values, errors }];
  });
  const seen = new Map<string, ImportRow[]>();
  for (const row of rows) for (const field of kind === 'customers' ? ['code', 'phone', 'email'] : ['code']) {
    if (!row.values[field]) continue;
    const identity = field === 'phone' ? String(row.values[field]).replace(/\D/g, '') : String(row.values[field]).toLowerCase();
    const key = `${field}:${identity}`;
    seen.set(key, [...(seen.get(key) ?? []), row]);
  }
  for (const duplicates of seen.values()) if (duplicates.length > 1) for (const row of duplicates) if (!row.errors.includes('Identificador duplicado dentro del archivo.')) row.errors.push('Identificador duplicado dentro del archivo.');
  return rows;
}
