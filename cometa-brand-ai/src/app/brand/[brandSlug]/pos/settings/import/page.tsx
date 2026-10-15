'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePosContext } from '../../../components/pos-shell';
import { usePosFetch } from '@/lib/pos/client-transport';
import { fieldsFor, IMPORT_FIELDS, type ImportKind, type ImportMapping, type ImportRow, type ImportDecision } from '@/lib/pos/eleventa-import';

type Run = { id: string; kind: ImportKind; status: string; created_at: string; location_id: string | null; file_name: string | null; row_count: number };
type Preview = { rows: (ImportRow & { inventoryExists?: boolean })[]; token: string };
const control = 'rounded-lg border border-white/20 bg-slate-900 p-2 text-white disabled:opacity-40';
const panel = 'rounded-xl border border-white/10 bg-slate-950 p-5 space-y-4';
export default function ImportPage() {
  const { brand } = usePosContext();
  return <Importer key={brand.slug} brandSlug={brand.slug} />;
}
function Importer({ brandSlug }: { brandSlug: string }) {
  const request = usePosFetch();
  const [kind, setKind] = useState<ImportKind>('products');
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]), [sheet, setSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(1), [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>({});
  const [requestKey, setRequestKey] = useState('');
  const [creationTax, setCreationTax] = useState('');
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]), [location, setLocation] = useState('');
  const [runs, setRuns] = useState<Run[]>([]), [revertId, setRevertId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const url = `/api/pos/imports?brandSlug=${encodeURIComponent(brandSlug)}`;
  const read = useCallback(async (path: string, init?: RequestInit) => {
    const response = await request(path, init);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error?.message || data.error || 'No se pudo completar la operación.');
    return data;
  }, [request]);
  const history = useCallback(async () => {
    const data = await read(`${url}&kind=${kind}`);
    setRuns(data.runs);
  }, [read, url, kind]);
  useEffect(() => {
    let active = true;
    read(`${url}&kind=${kind}`).then(data => { if (active) setRuns(data.runs); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [read, url, kind]);
  useEffect(() => {
    let active = true;
    read(`/api/pos/locations?brandSlug=${encodeURIComponent(brandSlug)}`).then(data => { if (active) setLocations(data.locations ?? []); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [read, brandSlug]);
  const invalidate = () => { setPreview(null); setDecisions({}); setRequestKey(''); setNotice(''); };
  const execute = async (mode: string, run?: Run) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData();
      form.set('kind', kind); form.set('mode', mode); form.set('locationId', run?.location_id ?? location);
      if (file) form.set('file', file);
      form.set('sheet', sheet); form.set('headerRow', String(headerRow)); form.set('mapping', JSON.stringify(mapping));
      form.set('creationTax', creationTax);
      form.set('decisions', JSON.stringify(decisions)); form.set('token', preview?.token ?? ''); form.set('requestKey', requestKey);
      if (run) form.set('runId', run.id);
      const data = await read(url, { method: 'POST', body: form });
      if (mode === 'inspect') { setSheets(data.sheets); setSheet(sheet || data.sheets[0]); setHeaders(data.headers); setMapping(data.mapping); invalidate(); }
      if (mode === 'preview') { setPreview(data.preview); setDecisions({}); setRequestKey(crypto.randomUUID()); }
      if (mode === 'apply' || mode === 'revert') {
        invalidate(); setRevertId('');
        setNotice(data.result.status === 'reverted' ? 'Importación revertida.' : 'Importación guardada. Consulta el resultado en el historial.');
        await history();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  };
  const selected = preview?.rows.filter(r => decisions[r.rowNumber] && decisions[r.rowNumber] !== 'skip') ?? [];
  const canApply = !!preview && selected.length > 0 && preview.rows.every(r => decisions[r.rowNumber] && (decisions[r.rowNumber] === 'skip' || r.errors.length === 0));
  return <section className="space-y-5 text-slate-200">
    <Link href={`/brand/${brandSlug}/pos/settings`} className="underline">Volver a Configuración</Link>
    <header><p className="text-sm">Importar información</p><h1 className="text-3xl font-bold">¿Vienes de ELEVENTA?</h1><p className="mt-2">Productos / Inventario / Clientes</p></header>
    <p>Importa tu exportación existente. La compatibilidad final se confirmará con tus archivos reales. Máximo 500 filas y 5 MB por lote.</p>
    <p>No importa ventas históricas, deudas ni apartados. Primero importa productos y después sus existencias por código y sucursal.</p>
    <details className={panel}><summary>Archivos sintéticos para practicar</summary><p>Solo para una marca de pruebas. No contienen información de clientes reales.</p><div className="flex flex-wrap gap-4">{['productos','inventario','clientes','invalidos'].map(name=><a key={name} className="underline" href={'/examples/eleventa/SINTETICO-'+name+'.csv'} download>{name==='invalidos'?'Errores y duplicados':name.charAt(0).toUpperCase()+name.slice(1)} · CSV</a>)}</div></details>
    {error && <p role="alert" className="rounded-lg bg-rose-950 p-4">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-950 p-4">{notice}</p>}
    <fieldset disabled={busy} className={panel}>
      <legend className="font-bold">1. Seleccionar archivo</legend>
      <label className="block">Importar <select className={control + ' ml-3'} value={kind} onChange={e => { setKind(e.target.value as ImportKind); setRuns([]); setRevertId(''); setHeaders([]); setMapping({}); setError(''); invalidate(); }}><option value="products">Productos</option><option value="inventory">Inventario</option><option value="customers">Clientes</option></select></label>
      {kind === 'inventory' && <label className="block">Sucursal <select className={control} value={location} onChange={e => { setLocation(e.target.value); invalidate(); }}><option value="">Selecciona una sucursal</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      <input aria-label="Archivo ELEVENTA" type="file" accept=".xls,.xlsx,.csv" onChange={e => { setFile(e.target.files?.[0] ?? null); setSheets([]); setSheet(''); setHeaders([]); invalidate(); }} />
      {sheets.length > 0 && <label className="block">Hoja <select className={control} value={sheet} onChange={e => { setSheet(e.target.value); setHeaders([]); invalidate(); }}>{sheets.map(s => <option key={s}>{s}</option>)}</select></label>}
      <label className="block">Fila de encabezados <input className={control + ' w-24'} type="number" min="1" max="100" value={headerRow} onChange={e => { setHeaderRow(Number(e.target.value)); setHeaders([]); invalidate(); }} /></label>
      <button className={control} disabled={!file || (kind === 'inventory' && !location)} onClick={() => void execute('inspect')}>Leer encabezados</button>
      <p className="text-sm">Los códigos se conservan como texto y con el formato de Excel. Si el archivo ya perdió ceros iniciales, no se inventarán. Las fórmulas requieren exportarse como valores.</p>
    </fieldset>
    {headers.length > 0 && <fieldset disabled={busy} className={panel}>
      <legend className="font-bold">2. Correspondencia de columnas</legend>
      {fieldsFor(kind).map(field => <label className="flex flex-wrap items-center gap-3" key={field}><span className="w-52">{IMPORT_FIELDS[field]}</span><select className={control} value={mapping[field] ?? ''} onChange={e => { const next = { ...mapping }; if (e.target.value === '') delete next[field]; else next[field] = Number(e.target.value); setMapping(next); invalidate(); }}><option value="">No importar este campo</option>{headers.map((h, i) => <option key={i} value={i}>{i + 1}. {h || '(sin nombre)'}</option>)}</select></label>)}
      <p>Las columnas no seleccionadas se omiten. Los campos ausentes o vacíos no borran datos ni se convierten en cero.</p>
      {kind === 'products' && <><p>Crear requiere código, descripción, precio, costo e impuesto explícitos. Crea un producto simple por código, en piezas. No deduce tallas, colores, fotos ni mayoreo.</p><label className="block">Impuesto (%) solo para productos nuevos si falta en el archivo <input className={control + ' w-24'} inputMode="decimal" value={creationTax} onChange={e => { setCreationTax(e.target.value); invalidate(); }} placeholder="Sin definir" /></label><p>Esta tasa no se aplica a productos existentes. Una columna de impuesto seleccionada sí actualiza su tasa.</p></>}
      {kind === 'inventory' && <p className="font-bold">Existencia absoluta: reemplaza la cantidad de esta sucursal; nunca suma por defecto. No puede quedar por debajo de lo reservado.</p>}
      <button className={control} onClick={() => void execute('preview')}>Validar y ver vista previa</button>
    </fieldset>}
    {preview && <section className={panel}>
      <h2 className="font-bold">3. Revisar antes de guardar</h2>
      <p>{preview.rows.length} filas · {preview.rows.filter(r => r.matches?.length === 0).length} sin coincidencia · {preview.rows.filter(r => r.matches?.length === 1).length} con coincidencia · {preview.rows.filter(r => r.errors.length).length} con errores · {selected.length} seleccionadas</p>
      <div className="max-h-[32rem] overflow-auto"><table className="w-full text-sm"><thead><tr><th>Fila</th><th>Valores</th><th>Validación</th><th>Decisión explícita</th></tr></thead><tbody>{preview.rows.map(row => <tr className="border-t border-white/10" key={row.rowNumber}>
        <td className="p-2">{row.rowNumber}</td><td className="p-2 whitespace-pre-wrap">{Object.entries(row.values).map(([k, v]) => `${IMPORT_FIELDS[k as keyof typeof IMPORT_FIELDS] ?? k}: ${v}`).join('\n')}</td>
        <td className="p-2">{row.errors.length ? row.errors.join(' ') : (row.matches?.length ? 'Coincidencia en la marca.' : 'Nuevo registro.')}{kind === 'inventory' && row.matches?.length === 1 && <p>{row.inventoryExists ? 'Ya tiene inventario en la sucursal.' : 'Sin registro de inventario en la sucursal.'}</p>}</td>
        <td className="p-2"><select aria-label={`Decisión fila ${row.rowNumber}`} className={control} disabled={busy} value={decisions[row.rowNumber] ?? ''} onChange={e => setDecisions({ ...decisions, [row.rowNumber]: e.target.value as ImportDecision })}><option value="">Elegir…</option><option value="create">Crear</option><option value="update">Actualizar</option><option value="skip">Omitir</option></select></td>
      </tr>)}</tbody></table></div>
      <button className={control} disabled={busy || !canApply} onClick={() => void execute('apply')}>Confirmar importación de {selected.length} filas</button>
      <p className="text-sm">Si cambia la marca después de esta vista previa, deberás validarla de nuevo. Ante pérdida de respuesta, reintenta con esta misma vista previa: se conserva la clave de la operación.</p>
    </section>}
    <section className={panel}><h2 className="font-bold">Historial de importaciones</h2><p>La reversión se bloquea si detecta cambios posteriores en productos, inventario, clientes o sus operaciones relacionadas. No borra ventas ni movimientos históricos.</p>
      {!runs.length && <p>No hay importaciones cargadas.</p>}
      {runs.map(run => <div className="flex flex-wrap gap-3 border-t border-white/10 py-3" key={run.id}><span>{new Date(run.created_at).toLocaleString('es-MX')} · {run.file_name ?? 'Importación sin nombre de archivo'} · {run.row_count} filas · {run.status === 'done' ? 'Guardada' : 'Revertida'}</span>{run.status === 'done' && (revertId === run.id ? <><button disabled={busy} className={control} onClick={() => void execute('revert', run)}>Confirmar reversión</button><button className={control} onClick={() => setRevertId('')}>Cancelar</button></> : <button disabled={busy} className={control} onClick={() => setRevertId(run.id)}>Revertir esta importación</button>)}</div>)}
    </section>
    {busy && <p role="status">Procesando…</p>}
  </section>;
}
