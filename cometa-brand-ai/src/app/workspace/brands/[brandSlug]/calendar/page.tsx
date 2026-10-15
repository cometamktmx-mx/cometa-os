"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace/components/workspace-shell";
import ContentItemDrawer, { type DrawerMode } from "./components/content-item-drawer";

type CalendarItem = { id: string; title: string; contentType: string | null; publishDate: string | null; status: string; statusLabel: string };
type AssignmentOption = { userId: string; name: string; email: string | null; role: string };
type CalendarData = { brand: { name: string; slug: string }; period: { month: number; year: number }; calendar?: { id: string; cycleStartDate?: string | null } | null; summary: Record<string, number>; items: CalendarItem[]; assignmentOptions: AssignmentOption[] };

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function AdminCalendarPage() {
  const params = useParams<{ brandSlug: string }>();
  const searchParams = useSearchParams();
  const brandSlug = params.brandSlug;
  const now = new Date();
  const queryMonth = Number(searchParams.get("month")); const queryYear = Number(searchParams.get("year"));
  const [period, setPeriod] = useState({ month: queryMonth >= 1 && queryMonth <= 12 ? queryMonth : now.getMonth() + 1, year: queryYear >= 2000 && queryYear <= 2100 ? queryYear : now.getFullYear() });
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [selectedContentItemId, setSelectedContentItemId] = useState<string | null>(null);
  const [initialPublishDate, setInitialPublishDate] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [showStartDate, setShowStartDate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const openedQueryItem = useRef<string | null>(null);

  const loadCalendar = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/admin/brands/${brandSlug}/marketing/calendar?month=${period.month}&year=${period.year}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar el calendario.");
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar el calendario."); }
  }, [brandSlug, period]);
  // The callback owns the loading/error state for this remote synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadCalendar(); }, [loadCalendar]);

  const days = useMemo(() => {
    const first = new Date(period.year, period.month - 1, 1).getDay();
    const count = new Date(period.year, period.month, 0).getDate();
    return Array.from({ length: first + count }, (_, index) => index < first ? null : index - first + 1);
  }, [period]);
  const openCreate = (day?: number) => { setSelectedContentItemId(null); setInitialPublishDate(day ? `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null); setDrawerMode("create"); };
  const generateAutoCalendar = async () => { if (generating) return; if (!startDate) { setShowStartDate(true); return; } setGenerating(true); setError(null); try { const response = await fetch(`/api/admin/brands/${encodeURIComponent(brandSlug)}/marketing/auto-calendar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ year: period.year, month: period.month, startDate }) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error || "No se pudo generar el calendario."); setShowStartDate(false); await loadCalendar(); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo generar el calendario."); } finally { setGenerating(false); } };
  const deleteItem = async (id: string) => { if (!window.confirm("¿Eliminar esta pieza? Esta acción no se puede deshacer.")) return; setDeleting(true); try { const response = await fetch(`/api/admin/brands/${encodeURIComponent(brandSlug)}/marketing/content/${encodeURIComponent(id)}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body?.error || "No se pudo eliminar la pieza."); setData(current => current ? { ...current, items: current.items.filter(item => item.id !== id) } : current); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo eliminar la pieza."); } finally { setDeleting(false); } };
  const deleteCalendar = async () => { const calendarId = data?.calendar?.id; if (!calendarId || !window.confirm("Se eliminarán todas las piezas generadas de este calendario. Esta acción no se puede deshacer.")) return; setDeleting(true); try { const response = await fetch(`/api/admin/brands/${encodeURIComponent(brandSlug)}/marketing/calendar?calendarId=${encodeURIComponent(calendarId)}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body?.error || "No se pudo reiniciar el calendario."); setData(current => current ? { ...current, items: [], summary: { ...current.summary, total: 0 } } : current); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo reiniciar el calendario."); } finally { setDeleting(false); } };
  const openEdit = (id: string) => { setInitialPublishDate(null); setSelectedContentItemId(id); setDrawerMode("edit"); };
  const requestedItemId = searchParams.get("item");
  useEffect(() => {
    if (!requestedItemId || openedQueryItem.current === requestedItemId || !data?.items.some((item) => item.id === requestedItemId)) return;
    openedQueryItem.current = requestedItemId;
    setInitialPublishDate(null); setSelectedContentItemId(requestedItemId); setDrawerMode("edit");
  }, [data, requestedItemId]);
  const closeDrawer = () => { setDrawerMode("closed"); setSelectedContentItemId(null); setInitialPublishDate(null); };
  const handleCreated = (id: string) => { setSelectedContentItemId(id); setInitialPublishDate(null); setDrawerMode("edit"); };
  const move = (delta: number) => setPeriod(value => { const date = new Date(value.year, value.month - 1 + delta, 1); return { month: date.getMonth() + 1, year: date.getFullYear() }; });
  const itemsByDay = useMemo(() => { const map = new Map<number, CalendarItem[]>(); const prefix = `${period.year}-${String(period.month).padStart(2, "0")}-`; for (const item of data?.items || []) { if (!item.publishDate || !item.publishDate.startsWith(prefix)) continue; const day = Number(item.publishDate.slice(8, 10)); map.set(day, [...(map.get(day) || []), item]); } return map; }, [data, period]);

  return <WorkspaceShell>
    <main className="mx-auto max-w-7xl px-6 py-8 text-white">
      <div className="mb-8 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.2em] text-cyan-300">{data?.brand.name || "Marca"}</p><h1 className="mt-2 text-3xl font-semibold">Calendario de contenido</h1><p className="mt-2 text-sm text-slate-400">Planifica, produce y administra el contenido de esta marca.</p></div><div className="flex gap-2"><button disabled={generating} onClick={() => { setStartDate(data?.calendar?.cycleStartDate || `${period.year}-${String(period.month).padStart(2,"0")}-01`); setShowStartDate(true); }} className="rounded-xl border border-violet-400/30 px-4 py-2 text-sm font-semibold text-violet-200 disabled:opacity-50">{generating ? "Generando…" : "Generar con COSMOS ✦"}</button><button disabled={deleting} onClick={() => void deleteCalendar()} className="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-200 disabled:opacity-50">Reiniciar calendario</button><button onClick={() => openCreate()} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">+ Nueva pieza</button></div></div>
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.03] p-3"><button onClick={() => move(-1)} className="rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10">←</button><div className="font-medium">{monthNames[period.month - 1]} {period.year}</div><div className="flex gap-2"><button onClick={() => { const d = new Date(); setPeriod({ month: d.getMonth() + 1, year: d.getFullYear() }); }} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/10">Hoy</button><button onClick={() => move(1)} className="rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10">→</button></div></div>
      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}<button className="ml-3 underline" onClick={() => void loadCalendar()}>Reintentar</button></div>}
      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-white/10">{["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(day => <div key={day} className="border-b border-white/10 bg-white/[.04] p-3 text-xs text-slate-400">{day}</div>)}{days.map((day, index) => <div key={`${day}-${index}`} onClick={() => day && !itemsByDay.get(day)?.length && openCreate(day)} className="min-h-32 border-b border-r border-white/10 p-2 transition hover:bg-white/[.03]">{day && <><div className="mb-2 text-xs text-slate-500">{day}</div>{(itemsByDay.get(day) || []).map(item => <div key={item.id} className="mb-1 flex items-start gap-1 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-2"><button onClick={() => openEdit(item.id)} className="min-w-0 flex-1 text-left"><span className="block text-[10px] uppercase text-cyan-200">{item.contentType || "Contenido"}</span><span className="block truncate text-xs text-white">{item.title}</span><span className="block text-[10px] text-slate-400">{item.statusLabel}</span></button><button aria-label={`Eliminar ${item.title}`} disabled={deleting} onClick={() => void deleteItem(item.id)} className="rounded px-1 text-xs text-slate-500 hover:text-red-300 disabled:opacity-40">×</button></div>)}</>}</div>)}</div>
    </main>
    {showStartDate && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b192a] p-6 text-white"><h2 className="text-lg font-semibold">¿Cuándo debe iniciar este calendario?</h2><label className="mt-5 block text-sm text-slate-300">Fecha de inicio / Primera publicación<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="control mt-2" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowStartDate(false)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300">Cancelar</button><button disabled={!startDate || generating} onClick={() => void generateAutoCalendar()} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Confirmar y generar</button></div></div></div>}
    {drawerMode !== "closed" && <ContentItemDrawer brandSlug={brandSlug} brandName={data?.brand.name || brandSlug} assignmentOptions={data?.assignmentOptions || []} mode={drawerMode} contentItemId={selectedContentItemId} initialPublishDate={initialPublishDate} onClose={closeDrawer} onCreated={handleCreated} onUpdated={() => void loadCalendar()} onRefreshCalendar={loadCalendar} />}
  </WorkspaceShell>;
}
