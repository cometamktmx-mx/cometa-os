"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import type { StudioOperationState } from "@/lib/studio/operation";

type FocusPiece = { pieceId: string; title: string; reason: string };
type FocusResult = { focusNow: FocusPiece | null; next: FocusPiece[]; avoidStarting: FocusPiece[]; summary: string };

export function OperationClient({ initialState }: { initialState: StudioOperationState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<FocusResult | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { if (state.status !== "active" && state.status !== "paused") return; const timer = window.setInterval(() => setClock(Date.now()), 30_000); return () => window.clearInterval(timer); }, [state.status]);
  const activeMinutes = useMemo(() => state.status === "active" ? state.activeMinutesToday + Math.max(0, Math.floor((clock - Date.parse(state.asOf)) / 60_000)) : state.activeMinutesToday, [clock, state]);
  const remainingMinutes = Math.max(0, (state.targetMinutes || 0) - activeMinutes);
  const expectedEndAt = state.status === "paused" && state.expectedEndAt ? new Date(Date.parse(state.expectedEndAt) + Math.max(0, clock - Date.parse(state.asOf))).toISOString() : state.expectedEndAt;

  async function act(action: "open" | "pause" | "resume" | "close") {
    setBusy(true); setError(""); setFocus(null);
    const response = await fetch("/api/studio/operation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setError(body.error === "OPERATION_PROFILE_REQUIRED" ? "Tu jornada operativa todavía no está configurada." : String(body.message || "No se pudo actualizar tu operación.")); return; }
    setState(body.state); setClock(Date.now()); router.refresh();
  }

  async function plan() {
    setFocusBusy(true); setError("");
    const response = await fetch("/api/studio/cosmos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "operation_focus" }) });
    const body = await response.json(); setFocusBusy(false);
    if (!response.ok) { setError(String(body.message || "COSMOS no pudo planear tu operación.")); return; }
    setFocus(body.result);
  }

  const tone = state.status === "active" ? "border-cyan-400/30 bg-cyan-400/[.06]" : state.status === "paused" ? "border-amber-400/30 bg-amber-400/[.06]" : "border-white/10 bg-white/[.03]";
  return <>
    {error && <p className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">{error}</p>}
    <section className={`mt-7 rounded-3xl border p-6 sm:p-8 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[10px] uppercase tracking-[.22em] text-slate-400">Estado</p><h2 className="mt-2 text-2xl font-semibold">{statusLabel(state.status)}</h2>{state.targetReached && state.status !== "off" && <p className="mt-2 text-sm text-emerald-200">Jornada objetivo alcanzada</p>}</div><Actions status={state.status} configured={state.profileConfigured} busy={busy} act={act}/></div>
      <dl className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Inicio habitual" value={state.typicalStart ? formatTimeValue(state.typicalStart) : "Sin referencia"}/>
        <Metric label="Inicio real" value={formatInstant(state.firstOpenedAt, state.timezone)}/>
        <Metric label="Jornada objetivo" value={state.targetMinutes ? duration(state.targetMinutes) : "Sin configurar"}/>
        <Metric label="Tiempo activo hoy" value={duration(activeMinutes)}/>
        <Metric label="Tiempo pausado" value={duration(state.pausedMinutesToday)}/>
        <Metric label="Tiempo restante" value={state.targetMinutes ? duration(remainingMinutes) : "—"}/>
        <Metric label="Cierre estimado" value={formatInstant(expectedEndAt, state.timezone)}/>
        <Metric label="Último cierre" value={formatInstant(state.lastClosedAt, state.timezone)}/>
      </dl>
    </section>
    <section className="mt-7 rounded-3xl border border-violet-400/20 bg-violet-400/[.04] p-6">
      <p className="text-xs font-medium tracking-[.15em] text-violet-200">COSMOS · TU OPERACIÓN ✦</p>
      {!focus && <><p className="mt-2 text-sm text-slate-400">Prioriza tu trabajo real asignado usando fechas, estado, distribución y prioridad confirmada.</p><button disabled={state.status !== "active" || focusBusy} onClick={plan} className="mt-4 rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-[#111629] disabled:cursor-not-allowed disabled:opacity-40">{focusBusy ? "COSMOS planeando…" : "Planear mi operación con COSMOS ✦"}</button>{state.status !== "active" && <p className="mt-2 text-xs text-slate-500">Disponible mientras estás en operación.</p>}</>}
      {focus && <FocusView result={focus}/>}
    </section>
    <section className="mt-7"><h2 className="text-[11px] uppercase tracking-[.22em] text-slate-500">Historial reciente</h2><div className="mt-3 overflow-hidden rounded-2xl border border-white/10">{state.history.map((day) => <div key={day.operationDate} className="grid gap-2 border-b border-white/[.07] bg-white/[.025] px-5 py-4 text-sm last:border-0 sm:grid-cols-4"><span>{formatDate(day.operationDate)}</span><span className="text-slate-400">Inicio · {formatInstant(day.firstOpenedAt, state.timezone)}</span><span className="text-slate-400">Cierre · {formatInstant(day.lastClosedAt, state.timezone)}</span><span className="text-slate-300">Activo · {duration(day.activeMinutes)}</span></div>)}{!state.history.length && <p className="p-6 text-sm text-slate-500">Aún no hay operaciones registradas.</p>}</div></section>
  </>;
}

function Actions({ status, configured, busy, act }: { status: StudioOperationState["status"]; configured: boolean; busy: boolean; act: (action: "open" | "pause" | "resume" | "close") => void }) { if (status === "active") return <div className="flex gap-2"><Button disabled={busy} onClick={() => act("pause")}>Pausar</Button><Button disabled={busy} onClick={() => act("close")}>Cerrar operación</Button></div>; if (status === "paused") return <div className="flex gap-2"><Button disabled={busy} onClick={() => act("resume")}>Reanudar</Button><Button disabled={busy} onClick={() => act("close")}>Cerrar operación</Button></div>; return <Button disabled={busy || !configured} onClick={() => act("open")}>Abrir operación</Button>; }
function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm text-cyan-100 transition hover:bg-cyan-400/15 disabled:opacity-40">{children}</button>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1.5 text-base text-slate-100">{value}</dd></div>; }
function FocusView({ result }: { result: FocusResult }) { const empty = result.focusNow === null && result.next.length === 0 && result.avoidStarting.length === 0; return <div className="mt-5 space-y-5 text-sm">{result.focusNow && <div><p className="text-[10px] uppercase tracking-[.16em] text-violet-300">Foco ahora</p><p className="mt-1 font-semibold">{result.focusNow.title}</p><p className="mt-1 text-slate-300">{result.focusNow.reason}</p></div>}{result.next.length > 0 && <div><p className="text-[10px] uppercase tracking-[.16em] text-violet-300">Después</p>{result.next.map((item, index) => <div key={item.pieceId} className="mt-3"><p className="font-semibold">{index + 1}. {item.title}</p><p className="mt-1 text-slate-400">{item.reason}</p></div>)}</div>}{result.avoidStarting.length > 0 && <div><p className="text-[10px] uppercase tracking-[.16em] text-violet-300">Puede esperar</p>{result.avoidStarting.map((item) => <div key={item.pieceId} className="mt-3"><p className="font-semibold">{item.title}</p><p className="mt-1 text-slate-400">{item.reason}</p></div>)}</div>}{empty && <p className="text-slate-300">No hay una prioridad adicional que COSMOS necesite destacar ahora.</p>}<div className="border-t border-white/10 pt-4"><p className="text-[10px] uppercase tracking-[.16em] text-violet-300">Resumen</p><p className="mt-2 text-slate-300">{result.summary}</p></div></div>; }
function statusLabel(status: StudioOperationState["status"]) { return status === "active" ? "● En operación" : status === "paused" ? "● En pausa" : status === "closed" ? "Operación cerrada" : "○ Fuera de operación"; }
function duration(minutes: number) { const safe = Math.max(0, Math.floor(minutes)); const hours = Math.floor(safe / 60); const rest = safe % 60; return hours && rest ? `${hours} h ${rest} min` : hours ? `${hours} h` : `${rest} min`; }
function formatInstant(value: string | null, timezone: string) { return value ? new Intl.DateTimeFormat("es-MX", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatTimeValue(value: string) { const [hour, minute] = value.split(":").map(Number); return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour, minute))); }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
