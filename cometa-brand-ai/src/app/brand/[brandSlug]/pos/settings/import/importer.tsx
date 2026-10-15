'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PosIcon, type PosIconName } from '../../../components/pos-icons';
import styles from './importer.module.css';
import { usePosContext } from '../../../components/pos-shell';
import { usePosFetch } from '@/lib/pos/client-transport';
import { fieldsFor, IMPORT_FIELDS, type ImportKind, type ImportMapping, type ImportRow, type ImportDecision } from '@/lib/pos/eleventa-import';

type Run = { id: string; kind: ImportKind; status: string; created_at: string; location_id: string | null; file_name: string | null; row_count: number };
type Preview = { rows: (ImportRow & { inventoryExists?: boolean })[]; token: string };
const choices: { kind: ImportKind; title: string; description: string; icon: PosIconName }[] = [
  { kind: 'products', title: 'Productos', description: 'Tu catálogo, códigos, precios y costos.', icon: 'product' },
  { kind: 'inventory', title: 'Inventario', description: 'Las existencias de tus productos por sucursal.', icon: 'inventory' },
  { kind: 'customers', title: 'Clientes', description: 'Nombres, códigos y datos de contacto.', icon: 'customer' },
];
type Outcome = { created: number; updated: number; rejected: number; skipped: number; errors: Preview['rows']; replayed: boolean };
export default function ImportPage({ showTestHelp = false }: { showTestHelp?: boolean }) {
  const { brand } = usePosContext();
  return <Importer key={brand.slug} brandSlug={brand.slug} showTestHelp={showTestHelp} />;
}
export function Importer({ brandSlug, showTestHelp = false }: { brandSlug: string; showTestHelp?: boolean }) {
  const request = usePosFetch();
  const [step, setStep] = useState(0), [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const lock = useRef(false), fileInput = useRef<HTMLInputElement>(null);
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
  const execute = async (mode: string, run?: Run, incoming?: File) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData();
      form.set('kind', kind); form.set('mode', mode); form.set('locationId', run?.location_id ?? location);
      const upload = incoming ?? file;
      if (upload) form.set('file', upload);
      form.set('sheet', incoming ? '' : sheet); form.set('headerRow', String(incoming ? 1 : headerRow)); form.set('mapping', JSON.stringify(mapping));
      form.set('creationTax', creationTax);
      form.set('decisions', JSON.stringify(decisions)); form.set('token', preview?.token ?? ''); form.set('requestKey', requestKey);
      if (run) form.set('runId', run.id);
      const data = await read(url, { method: 'POST', body: form });
      if (mode === 'inspect') { setSheets(data.sheets); setSheet(incoming ? data.sheets[0] : sheet || data.sheets[0]); setHeaders(data.headers); setMapping(data.mapping); invalidate(); }
      if (mode === 'preview') { setPreview(data.preview); setDecisions({}); setRequestKey(crypto.randomUUID()); }
      if (mode === 'apply' || mode === 'revert') {
        if (mode === 'revert') { setOutcome(null); setStep(0); }
        if (mode === 'apply' && preview) {
          setOutcome({ created: preview.rows.filter(r => decisions[r.rowNumber] === 'create').length, updated: preview.rows.filter(r => decisions[r.rowNumber] === 'update').length, rejected: preview.rows.filter(r => r.errors.length > 0).length, skipped: preview.rows.filter(r => decisions[r.rowNumber] === 'skip' && !r.errors.length).length, errors: preview.rows.filter(r => r.errors.length > 0), replayed: data.result.replayed === true });
          setStep(3);
        }
        invalidate(); setRevertId('');
        setNotice(data.result.status === 'reverted' ? 'Importación revertida.' : 'La importación se guardó correctamente.');
        await history();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const chooseFile = (incoming: File | null) => {
    if (lock.current || !incoming) return;
    setError('');
    if (!/\.(xls|xlsx|csv)$/i.test(incoming.name) || incoming.size === 0 || incoming.size > 5 * 1024 * 1024) {
      setError('Selecciona un archivo Excel (.xls o .xlsx) o CSV, no vacío y de hasta 5 MB.'); return;
    }
    setFile(incoming); setSheets([]); setSheet(''); setHeaderRow(1); setHeaders([]); setMapping({}); invalidate();
    void execute('inspect', undefined, incoming);
  };
  const start = (next: ImportKind) => {
    if (lock.current) return;
    setKind(next); setRuns([]); setRevertId(''); setFile(null); setSheets([]); setSheet(''); setHeaderRow(1); setHeaders([]); setMapping({}); setCreationTax(''); setError(''); setOutcome(null); invalidate(); setStep(0);
  };
  const selected = preview?.rows.filter(r => decisions[r.rowNumber] && decisions[r.rowNumber] !== 'skip') ?? [];
  const canApply = !!preview && selected.length > 0 && preview.rows.every(r => decisions[r.rowNumber] && (decisions[r.rowNumber] === 'skip' || r.errors.length === 0));
  const currentChoice = choices.find(choice => choice.kind === kind) ?? choices[0];
  return <section className={styles.root} aria-busy={busy}>
    <Link href={`/brand/${brandSlug}/pos/settings`} className={styles.back}><PosIcon name="arrow" className="h-4 w-4" /> Configuración</Link>
    <header><span className={styles.eyebrow}>COMETA POS · Importar información</span><h1>Trae tu información a COMETA</h1><p>Productos, existencias y clientes. Sin ventas históricas, deudas ni apartados.</p></header>
    <ol className={styles.steps} aria-label="Pasos de importación">{['Origen', 'Archivo', 'Revisión', 'Resultado'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span className={styles.number}>{step > index ? <PosIcon name="check" className="h-4 w-4" /> : index + 1}</span>{label}</li>)}</ol>
    {error && <div role="alert" className={styles.alert}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    <div className={styles.layout}>
      <div className={styles.main}>
        {step === 0 && <section className={styles.panel} aria-labelledby="origin-title">
          <div><h2 id="origin-title">¿De dónde viene tu información?</h2><p>Selecciona lo que quieres traer. Puedes importar cada archivo por separado.</p></div>
          <div className={styles.source}><PosIcon name="store" /><div><strong>ELEVENTA</strong><small>Punto de venta de origen</small></div><span className={styles.badge}>Disponible</span></div>
          <div className={styles.cards} aria-label="Tipo de información">{choices.map(choice => <button type="button" disabled={busy} key={choice.kind} className={styles.choice} aria-pressed={kind === choice.kind} onClick={() => start(choice.kind)}><PosIcon name={choice.icon} /><strong>{choice.title}</strong><span>{choice.description}</span></button>)}</div>
          {kind === 'inventory' && <label className={styles.field}>Sucursal de destino<select className={styles.input} disabled={busy} value={location} onChange={e => { setLocation(e.target.value); invalidate(); }}><option value="">Selecciona una sucursal</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
          <div className={styles.actions}><span /><button className={styles.primary} disabled={busy || (kind === 'inventory' && !location)} onClick={() => setStep(1)}>Continuar <PosIcon name="arrow" className="h-4 w-4" /></button></div>
        </section>}
        {step === 1 && <section className={styles.panel} aria-labelledby="file-title">
          <div><h2 id="file-title">Carga tu archivo de {currentChoice.title.toLowerCase()}</h2><p>Leeremos sus encabezados para sugerir las correspondencias.</p></div>
          <div className={styles.drop} data-dragging={dragging} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length !== 1) { setError('Selecciona un solo archivo por importación.'); return; } chooseFile(e.dataTransfer.files[0]); }}>
            <PosIcon name={file ? 'check' : 'upload'} className="h-9 w-9" />
            {file ? <><span className={styles.filename}>{file.name}</span><p>{(file.size / 1024).toLocaleString('es-MX', { maximumFractionDigits: 1 })} KB · {currentChoice.title}</p></> : <><strong>Arrastra tu archivo aquí</strong><p>o selecciónalo desde tu equipo</p></>}
            <input ref={fileInput} className={styles.hidden} tabIndex={-1} aria-label="Archivo ELEVENTA" type="file" accept=".xls,.xlsx,.csv" disabled={busy} onChange={e => { chooseFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => fileInput.current?.click()}>{file ? 'Cambiar archivo' : 'Seleccionar archivo'}</button>
            <p>Excel (.xls, .xlsx) o CSV · Hasta 5 MB, 500 filas y 100 columnas.</p>
          </div>
          {headers.length > 0 && <p role="status">{headers.length} columnas leídas · {Object.keys(mapping).length} correspondencias sugeridas. Podrás corregirlas en Revisión.</p>}
          <details className={styles.details}><summary>Opciones avanzadas</summary><div className={styles.grid}>
            {sheets.length > 1 && <label className={styles.field}>Hoja del archivo<select className={styles.input} disabled={busy} value={sheet} onChange={e => { setSheet(e.target.value); setHeaders([]); invalidate(); }}>{sheets.map(s => <option key={s}>{s}</option>)}</select></label>}
            <label className={styles.field}>Fila de encabezados<input className={styles.input} disabled={busy} type="number" min="1" max="100" value={headerRow} onChange={e => { setHeaderRow(Number(e.target.value)); setHeaders([]); invalidate(); }} /></label>
          </div><p>Si tu archivo tiene un título antes de las columnas, indica la fila donde comienzan sus nombres.</p><button className={styles.secondary} disabled={busy || !file} onClick={() => void execute('inspect')}>Volver a leer encabezados</button></details>
          <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => setStep(0)}>Atrás</button><button className={styles.primary} disabled={busy || !headers.length} onClick={() => setStep(2)}>Revisar correspondencias <PosIcon name="arrow" className="h-4 w-4" /></button></div>
        </section>}
        {step === 2 && <section className={styles.panel} aria-labelledby="review-title">
          <div><h2 id="review-title">Revisa antes de importar</h2><p>Confirma qué columna corresponde a cada dato. Todavía no se ha guardado nada.</p></div>
          <details className={styles.details} open={!preview}><summary>Correspondencia de columnas</summary><div className={styles.grid}>{fieldsFor(kind).map(field => <label className={styles.field} key={field}>{IMPORT_FIELDS[field]}<select className={styles.input} disabled={busy} value={mapping[field] ?? ''} onChange={e => { const next = { ...mapping }; if (e.target.value === '') delete next[field]; else next[field] = Number(e.target.value); setMapping(next); invalidate(); }}><option value="">No importar este campo</option>{headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1} sin nombre`}</option>)}</select></label>)}</div><p>Los campos ausentes o vacíos no borran tus datos.</p></details>
          {kind === 'products' && <>
            <div className={styles.grid}>
              <label className={styles.field}>Impuesto para productos nuevos (%)<input className={styles.input} aria-describedby="creation-tax-help" disabled={busy} inputMode="decimal" value={creationTax} onChange={e => { setCreationTax(e.target.value); setError(''); invalidate(); }} placeholder="Escribe la tasa, sin el signo %" /></label>
              <p id="creation-tax-help">Si el archivo no incluye la tasa, indícala aquí antes de validar. No se asigna ninguna por defecto: escribe también 0 si esa es tu elección. Solo se usa para productos nuevos sin impuesto en el archivo; no modifica los existentes.</p>
            </div>
            <details className={styles.details}><summary>Datos necesarios para crear productos</summary><p>Se requieren código, descripción, precio, costo e impuesto. Se crea un producto simple por código, en piezas; no se deducen tallas, colores, fotos ni mayoreo. Una columna de impuesto seleccionada tiene prioridad y sí actualiza la tasa de productos existentes.</p></details>
          </>}
          {kind === 'inventory' && <p>La existencia es absoluta: reemplaza la cantidad de la sucursal, no la suma. No puede quedar por debajo de lo reservado.</p>}
          <button className={styles.secondary} disabled={busy} onClick={() => void execute('preview')}>{preview ? 'Volver a validar' : 'Validar y ver vista previa'}</button>
          {preview && <>
            <div className={styles.stats}><div className={styles.stat}><strong>{preview.rows.filter(r => r.matches?.length === 0 && !r.errors.length).length}</strong><span>Sin coincidencia</span></div><div className={styles.stat}><strong>{preview.rows.filter(r => r.matches?.length === 1 && !r.errors.length).length}</strong><span>Con coincidencia</span></div><div className={styles.stat}><strong>{preview.rows.filter(r => r.errors.length).length}</strong><span>Con errores</span></div></div>
            <p>{preview.rows.length} filas · {selected.length} seleccionadas. Elige Crear, Actualizar u Omitir en cada fila.</p>
            <div className={styles.tableWrap} tabIndex={0} aria-label="Vista previa de filas"><table className={styles.table}><thead><tr><th>Fila</th><th>Información</th><th>Validación</th><th>Qué hacer</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td><td><dl className={styles.values}>{Object.entries(row.values).map(([key, value]) => <div key={key}><dt>{IMPORT_FIELDS[key as keyof typeof IMPORT_FIELDS] ?? 'Dato'}</dt><dd>{String(value)}</dd></div>)}</dl></td>
              <td><span className={row.errors.length ? styles.errorText : styles.validText}>{row.errors.length ? row.errors.join(' ') : row.matches?.length ? 'Coincidencia en esta marca.' : 'Nuevo registro.'}</span>{kind === 'inventory' && row.matches?.length === 1 && <p>{row.inventoryExists ? 'Ya tiene existencias en la sucursal.' : 'Aún no tiene existencias en la sucursal.'}</p>}</td>
              <td><select aria-label={`Decisión fila ${row.rowNumber}`} className={styles.input} disabled={busy} value={decisions[row.rowNumber] ?? ''} onChange={e => setDecisions({ ...decisions, [row.rowNumber]: e.target.value as ImportDecision })}><option value="">Elegir…</option><option value="create">Crear</option><option value="update">Actualizar</option><option value="skip">Omitir</option></select></td>
            </tr>)}</tbody></table></div>
            <p>Confirmarás {selected.filter(r => decisions[r.rowNumber] === 'create').length} creaciones y {selected.filter(r => decisions[r.rowNumber] === 'update').length} actualizaciones. Las filas omitidas no se guardan.</p>
          </>}
          <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => setStep(1)}>Atrás</button><button className={styles.primary} disabled={busy || !canApply} onClick={() => void execute('apply')}>{busy ? 'Procesando…' : 'Confirmar importación'}</button></div>
        </section>}
        {step === 3 && outcome && <section className={styles.panel} aria-labelledby="result-title">
          <div className={styles.success}><PosIcon name="check" className="h-7 w-7" /></div><div><h2 id="result-title">Tu información ya está en COMETA</h2><p>{outcome.replayed ? 'Se recuperó el resultado del mismo intento; no se duplicó la operación.' : 'Importación completada. Puedes consultar o revertir el lote en el historial.'}</p></div>
          <div className={styles.stats}><div className={styles.stat}><strong>{outcome.created}</strong><span>Creados</span></div><div className={styles.stat}><strong>{outcome.updated}</strong><span>Actualizados</span></div><div className={styles.stat}><strong>{outcome.rejected}</strong><span>Rechazados por errores</span></div></div>
          {outcome.skipped > 0 && <p>{outcome.skipped} filas adicionales omitidas por tu decisión.</p>}
          {outcome.errors.length > 0 && <details className={styles.details}><summary>Consultar errores ({outcome.errors.length})</summary>{outcome.errors.map(row => <p key={row.rowNumber}>Fila {row.rowNumber}: {row.errors.join(' ')}</p>)}</details>}
          <p>{kind === 'products' ? 'Siguiente paso: carga las existencias de este catálogo por código y sucursal.' : 'Puedes continuar con otro archivo o revisar el historial de esta importación.'}</p>
          <div className={styles.actions}><a className={styles.secondary} href="#import-history" onClick={() => { const history = document.getElementById('import-history'); if (history instanceof HTMLDetailsElement) history.open = true; }}>Ver historial</a><button className={styles.primary} disabled={busy} onClick={() => start(kind === 'products' ? 'inventory' : kind)}>{kind === 'products' ? 'Importar inventario' : 'Importar otro archivo'}</button></div>
        </section>}
      </div>
      <aside className={styles.aside}><PosIcon name={currentChoice.icon} /><h2>{currentChoice.title} desde ELEVENTA</h2><p>{kind === 'products' ? 'Empieza por el catálogo. Después podrás cargar existencias usando los mismos códigos.' : kind === 'inventory' ? 'Usa los códigos del catálogo de esta marca y elige la sucursal correcta.' : 'Revisa códigos y datos de contacto antes de crear o actualizar clientes.'}</p><details className={styles.details}><summary>Consejos para tu archivo</summary><p>Los códigos se conservan como texto. Si el archivo ya perdió ceros iniciales, no se inventarán. Exporta las fórmulas como valores.</p><p>Si hay cambios posteriores a la vista previa, valida de nuevo. Si se pierde la respuesta al confirmar, reintenta sin cambiar la revisión para conservar la misma operación.</p></details>
        {showTestHelp && <details className={styles.details}><summary>Ayuda para pruebas</summary><p>Archivos sintéticos, solo para esta Preview. No los uses en una marca real.</p>{['productos', 'inventario', 'clientes', 'invalidos'].map(name => <p key={name}><a className="underline" href={`/examples/eleventa/SINTETICO-${name}.csv`} download>{name === 'invalidos' ? 'Errores y duplicados' : name === 'productos' ? 'Productos' : name === 'inventario' ? 'Inventario' : 'Clientes'} · CSV</a></p>)}</details>}
      </aside>
    </div>
    <details id="import-history" className={styles.history}><summary>Historial y reversión · {currentChoice.title}</summary><p className="mt-3">La reversión se bloquea si hay cambios posteriores o nuevas operaciones relacionadas. No borra ventas ni movimientos históricos.</p>
      {!runs.length && <p className="mt-3">Todavía no hay importaciones de este tipo.</p>}
      {runs.map(run => <div className={styles.run} key={run.id}><div><span>{run.file_name ?? 'Importación sin nombre de archivo'}</span><small>{new Date(run.created_at).toLocaleString('es-MX')} · {run.row_count} filas · {run.status === 'done' ? 'Guardada' : 'Revertida'}</small></div>{run.status === 'done' && <div className={styles.row}>{revertId === run.id ? <><button disabled={busy} className={styles.secondary} onClick={() => void execute('revert', run)}>Confirmar reversión</button><button disabled={busy} className={styles.secondary} onClick={() => setRevertId('')}>Cancelar</button></> : <button disabled={busy} className={styles.secondary} onClick={() => setRevertId(run.id)}>Revertir esta importación</button>}</div>}</div>)}
    </details>
    {busy && <p role="status" aria-live="polite">Procesando… Espera sin cerrar esta pantalla.</p>}
  </section>;
}
