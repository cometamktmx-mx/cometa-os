import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { requirePosOperationalAccess } from '@/lib/pos/access';
import { getPosMode, requireRetailPermission } from '@/lib/pos/staff-server';
import { requirePosPermission } from '@/lib/pos/rbac';
import { requirePosMutationAccess } from '@/lib/pos/mutation-access';
import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, uuidValue } from '@/lib/pos/server';
import { fieldsFor, parseNumber, parseRows, suggestMapping, type ImportKind, type ImportMapping, type ImportDecision } from '@/lib/pos/eleventa-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function kindValue(value: unknown): ImportKind {
  if (value !== 'products' && value !== 'inventory' && value !== 'customers') throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Tipo de importación inválido.');
  return value;
}
async function access(brandSlug: string, kind: ImportKind, locationId?: string | null) {
  const context = await requirePosOperationalAccess({brandSlug,entitlement:'pos.access'});
  if(await getPosMode(context)==='RETAIL') {
    if(!context.user.isAdmin) requirePosPermission(context,'pos.settings.manage');
    await requireRetailPermission(context,'IMPORT');
  } else await requirePosMutationAccess({ brandSlug, operation: 'settings.manage', locationId });
  return requirePosMutationAccess({ brandSlug, operation: kind === 'products' ? 'products.write' : kind === 'inventory' ? 'inventory.write' : 'customers.write', locationId });
}
function databaseError(error: { code?: string; message: string }): never {
  if (error.code === 'PGRST202' || error.code === '42P01') throw new PosApiError(503, 'POS_SCHEMA_NOT_READY', 'La migración del importador está pendiente de publicación. No se guardó ningún cambio.');
  if (error.message.includes('POS_IMPORT_ALREADY_APPLIED')) throw new PosApiError(409, 'POS_IMPORT_ALREADY_APPLIED', 'Este archivo ya fue importado. Revisa el historial antes de repetirlo.');
  if (['40001', '23505', '55P03', '40P01'].includes(error.code ?? '') || error.message.includes('POS_IMPORT_CONFLICT')) throw new PosApiError(409, 'POS_IMPORT_CONFLICT', 'Hay cambios posteriores, operaciones en curso o coincidencias nuevas. Genera otra vista previa. La reversión no puede sobrescribir operaciones posteriores.');
  if (error.code === '42501') throw new PosApiError(403, 'POS_PERMISSION_DENIED', 'No tienes permiso para importar en esta marca.');
  throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'No se pudo aplicar la operación. Revisa las filas, la sucursal y las existencias reservadas. No se guardaron cambios parciales.');
}
export async function GET(request: Request) {
  try {
    const kind = kindValue(new URL(request.url).searchParams.get('kind'));
    const { admin, brand } = await access(getBrandSlugFromUrl(request), kind);
    const { data, error } = await admin.from('pos_import_runs').select('id,kind,status,created_at,reverted_at,location_id,file_name,row_count').eq('brand_slug', brand.slug).eq('kind', kind).order('created_at', { ascending: false }).limit(50);
    if (error) databaseError(error);
    return ok({ runs: data ?? [] });
  } catch (error) { return handlePosError(error); }
}
export async function POST(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    // Authenticate before reading/decompressing an untrusted workbook.
    const initial = await requirePosOperationalAccess({brandSlug,entitlement:'pos.access'});
    if(await getPosMode(initial)==='RETAIL') await requireRetailPermission(initial,'IMPORT');
    else await requirePosMutationAccess({ brandSlug, operation: 'settings.manage' });
    if (Number(request.headers.get('content-length') ?? 0) > 6 * 1024 * 1024) throw new PosApiError(413, 'POS_VALIDATION_ERROR', 'Archivo demasiado grande (máximo 5 MB).');
    const form = await request.formData();
    const kind = kindValue(form.get('kind'));
    const mode = String(form.get('mode'));
    const location = kind === 'inventory' ? uuidValue(form.get('locationId'), 'locationId') as string : null;
    const { admin, brand, user } = await access(brandSlug, kind, location);
    if (mode === 'revert') {
      const id = uuidValue(form.get('runId'), 'runId') as string;
      const { data, error } = await admin.rpc('pos_import_v1', { p_brand: brand.slug, p_actor: user.userId, p_kind: kind, p_location: location, p_mode: 'revert', p_run: id });
      if (error) databaseError(error);
      return ok({ result: data });
    }
    if (!['inspect', 'preview', 'apply'].includes(mode)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Operación inválida.');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024 || !/\.(xlsx|xls|csv)$/i.test(file.name)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Selecciona un archivo .xls, .xlsx o .csv de hasta 5 MB.');
    const bytes = Buffer.from(await file.arrayBuffer());
    let workbook: XLSX.WorkBook;
    try {
      if (/\.csv$/i.test(file.name)) {
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { text = new TextDecoder('windows-1252').decode(bytes); }
        workbook = XLSX.read(text, { type: 'string', raw: true, cellNF: true, cellText: true, sheetRows: 1002 });
      } else workbook = XLSX.read(bytes, { type: 'buffer', raw: true, cellNF: true, cellText: true, sheetRows: 1002 });
    }
    catch { throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'No se pudo leer el archivo. Revisa su formato.'); }
    const sheetName = String(form.get('sheet') || workbook.SheetNames[0] || '');
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Selecciona una hoja válida.');
    const headerRow = Number(form.get('headerRow') || 1);
    if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Fila de encabezados inválida (1–100).');
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
    if (range.e.r - headerRow + 1 > 500 || range.e.c > 99) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Máximo 500 filas y 100 columnas. Divide el archivo en lotes.');
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true, range: headerRow - 1 }).map(row => row.map(String));
    const headers = matrix[0] ?? [];
    if (!headers.length) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'No se encontraron encabezados.');
    if (mode === 'inspect') return ok({ sheets: workbook.SheetNames, headers, mapping: suggestMapping(headers, kind) });
    let mapping: ImportMapping;
    try {
      const input: unknown = JSON.parse(String(form.get('mapping') || '{}'));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
      mapping = {};
      for (const [field, column] of Object.entries(input)) {
        if (!fieldsFor(kind).includes(field as keyof ImportMapping) || typeof column !== 'number') throw new Error();
        mapping[field as keyof ImportMapping] = column;
      }
    } catch { throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Correspondencia inválida.'); }
    let rows;
    try { rows = parseRows(matrix, kind, mapping); }
    catch (error) { throw new PosApiError(400, 'POS_VALIDATION_ERROR', error instanceof Error ? error.message : 'Archivo inválido.'); }
    for (const row of rows) {
      const creationTax = String(form.get('creationTax') ?? '').trim();
      if (kind === 'products' && creationTax) {
        const tax = parseNumber(creationTax, 4);
        if (tax === null || tax > 100) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Impuesto para nuevos productos inválido.');
        row.values.creation_tax_rate = tax;
      }
      row.rowNumber += headerRow - 1;
      for (const column of Object.values(mapping)) {
        if (sheet[XLSX.utils.encode_cell({ r: row.rowNumber - 1, c: column })]?.f) row.errors.push('Las fórmulas deben convertirse a valores antes de importar.');
      }
    }
    if (mode === 'apply') {
      let decisions: Record<string, ImportDecision>;
      try { decisions = JSON.parse(String(form.get('decisions'))); if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) throw new Error(); }
      catch { throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Elige crear, actualizar u omitir para cada fila.'); }
      for (const row of rows) {
        const decision = decisions[String(row.rowNumber)];
        if (!['create', 'update', 'skip'].includes(decision)) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Faltan decisiones por fila.');
        row.decision = decision;
        if (decision !== 'skip' && row.errors.length) throw new PosApiError(400, 'POS_VALIDATION_ERROR', 'Corrige u omite las filas con errores.');
      }
    }
    const { data, error } = await admin.rpc('pos_import_v1', {
      p_brand: brand.slug, p_actor: user.userId, p_kind: kind, p_location: location, p_mode: mode,
      p_rows: rows, p_hash: createHash('sha256').update(bytes).digest('hex'),
      p_file_name: file.name.slice(0, 255),
      p_request: mode === 'apply' ? uuidValue(form.get('requestKey'), 'requestKey') : null,
      p_expected: mode === 'apply' ? String(form.get('token') ?? '') : null,
    });
    if (error) databaseError(error);
    return ok(mode === 'preview' ? { preview: data } : { result: data });
  } catch (error) { return handlePosError(error); }
}
