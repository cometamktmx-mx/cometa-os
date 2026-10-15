"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePosFetch } from "@/lib/pos/client-transport";
import { upgradeAppearance } from '../../../../../../../packages/own-storefront/config-version';
import type { Appearance, ProductCard } from "../../../../../../../packages/own-storefront/contract";
export type AppearanceRecord = { revision: number; draft: Appearance; publishedRevision: number | null; products: ProductCard[]; preparation?: {id:string;name:string;image:string|null;reasons:string[]}[]; service: string; mediaBase: string; storeUrl?: string | null };
const equal = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);
export function useAppearanceDraft(brandSlug: string) {
  const transport = usePosFetch(), endpoint = `/api/pos/online-store/appearance?brandSlug=${encodeURIComponent(brandSlug)}`;
  const [record, setRecord] = useState<AppearanceRecord | null>(null), [error, setError] = useState(""), [status, setStatus] = useState("Cargando…"), [busy, setBusy] = useState(false), [conflict, setConflict] = useState<AppearanceRecord | null>(null);
  const [historyState, historyChanged] = useState({undo:false,redo:false}), [pending, setPending] = useState(false);
  const current = useRef<AppearanceRecord | null>(null), saved = useRef<Appearance | null>(null), flight = useRef<Promise<void> | null>(null), blocked = useRef(false), publishing = useRef(false);
  const undo = useRef<Appearance[]>([]), redo = useRef<Appearance[]>([]);
  const install = useCallback((next: AppearanceRecord) => { current.current = next; setRecord(next); }, []);
  const read = useCallback(async () => { const r = await transport(endpoint, { cache: "no-store" }); const b = await r.json(); if (!r.ok || !b.ok) throw Error(b.error || "No se pudo cargar el borrador."); return b as AppearanceRecord; }, [endpoint, transport]);
  useEffect(() => { let alive = true; read().then(b => { if (alive) { install(b); saved.current = b.draft; setStatus("Borrador guardado"); } }).catch(() => { if (alive) setError("No se pudo cargar. Recarga esta página para reintentar."); }); return () => { alive = false; }; }, [read, install]);
  const change = useCallback((draft: Appearance) => { const c = current.current; if (!c || publishing.current || equal(c.draft, draft)) return; undo.current = [...undo.current.slice(-49), c.draft]; redo.current = []; historyChanged({undo:undo.current.length > 0,redo:redo.current.length > 0}); install({ ...c, draft:upgradeAppearance(draft) }); setPending(true); setStatus("Cambios pendientes"); }, [install]);
  const step = (back: boolean) => { const c = current.current, source = back ? undo.current : redo.current, destination = back ? redo.current : undo.current; if (!c || publishing.current || !source.length) return; const draft = source.pop(); if (!draft) return; destination.push(c.draft); install({ ...c, draft }); historyChanged({undo:undo.current.length > 0,redo:redo.current.length > 0}); setPending(true); setStatus("Cambios pendientes"); };
  const save = useCallback(async (publish = false) => {
    if (flight.current) await flight.current;
    const c = current.current; if (!c || blocked.current || (!publish && saved.current && equal(saved.current, c.draft))) return;
    setBusy(true); setStatus(publish ? "Publicando…" : "Guardando…"); setError("");
    const submitted = c.draft;
    const task = (async () => {
      try {
        const r = await transport(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: c.revision, document: submitted, publish }) }); const b = await r.json();
        if (!r.ok || !b.ok) throw Error(b.error || "No se pudo confirmar el guardado.");
        const latest = current.current; if (!latest) return;
        saved.current = submitted;
        install({ ...latest, revision: b.appearance.revision, publishedRevision: b.appearance.publishedRevision });
        const dirty = !equal(latest.draft, submitted); setPending(dirty); setStatus(dirty ? "Cambios pendientes" : publish ? "Versión publicada" : "Borrador guardado");
      } catch {
        blocked.current = true; setStatus("Guardado sin confirmar");
        setError("Tus cambios siguen aquí. Reintenta para comprobar el servidor antes de guardar.");
      } finally { setBusy(false); }
    })(); flight.current = task; await task; flight.current = null;
  }, [endpoint, transport, install]);
  useEffect(() => { if (!pending || busy || error || conflict) return; const timer = setTimeout(() => void save(), 900); return () => clearTimeout(timer); }, [record, pending, busy, error, conflict, save]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (pending || busy) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [pending, busy]);
  const recover = async () => { try { const remote = await read(), local = current.current; if (!local) return;
    if (equal(remote.draft, local.draft)) { install({ ...remote, products: local.products }); saved.current = local.draft; blocked.current = false; setPending(false); setError(""); setStatus("Borrador guardado"); }
    else if (remote.revision === local.revision) { blocked.current = false; setError(""); await save(); }
    else { setConflict(remote); setError("Hay una versión más reciente. Elige cómo recuperar tus cambios."); }
  } catch { setError("No se pudo comprobar el servidor. Tus cambios siguen en esta pestaña."); } };
  const resolve = (keep: boolean) => { const c = current.current; if (!c || !conflict) return; saved.current = conflict.draft; install({ ...conflict, draft: keep ? c.draft : conflict.draft }); blocked.current = false; setConflict(null); setError(""); setPending(keep); setStatus(keep ? "Cambios pendientes" : "Borrador guardado"); };
  const publish = async () => { if (publishing.current || blocked.current) return; publishing.current = true; try { await save(false); if (!blocked.current) await save(true); } finally { publishing.current = false; } };
  return { record, change, error, status, busy, pending, conflict, recover, resolve, publish, canUndo: historyState.undo, canRedo: historyState.redo, undo: () => step(true), redo: () => step(false), transport, endpoint };
}
