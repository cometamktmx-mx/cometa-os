"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { retailPermissions, retailAdministrative, RETAIL_IDLE_MS, type RetailPermission, type RetailRole } from "@/lib/pos/retail-permissions";
import { posStaffRoleLabel, type PosMode, type PosStaffRole } from "@/lib/pos/staff-shared";
import { getFoodAccessState, isStaffLocked } from "@/lib/pos/surface-policy";
import { clearPosLocalContext } from "@/lib/pos/offline-storage";
import { PosExit } from "@/components/pos-exit";
import { PosButton, PosCard, PosInput } from "./pos-ui";

export type PosOperator = { id: string; name: string; role: PosStaffRole; roles?: PosStaffRole[]; locationId: string | null; retailPermissions?: RetailPermission[] | null; retailRole?: RetailRole | null };
export type PosStaffChoice = PosOperator & { lockedUntil?: string | null; roleLabel?: string };
export type PosOperatorGateData = { deviceId?: string | null; mode: PosMode; adminMode?: boolean; gateRequired: boolean; firstRun: boolean; canConfigure: boolean; branding: { display_name?: string; logo_url?: string | null; primary_color?: string; secondary_color?: string; accent_color?: string; text_color?: string } | null; locations: { id: string; name: string }[]; staff: PosStaffChoice[]; session: { staff: PosOperator } | null };

export type OperatorAction = "switch" | "lock" | "admin" | "operation";
export function PosOperatorGate({ brandSlug, fallbackName, children, onOperatorChange, onActionComplete, requireFood = false }: {
  brandSlug: string; fallbackName: string;
  children: ReactNode | ((data: PosOperatorGateData, action: (action: OperatorAction) => Promise<void>) => ReactNode);
  onOperatorChange: (operator: PosOperator | null, gateRequired: boolean) => void;
  onActionComplete?: (action: OperatorAction) => void;
  requireFood?: boolean;
}) {
  const [data, setData] = useState<PosOperatorGateData | null>(null);
  const [readyData, setReadyData] = useState<PosOperatorGateData | null>(null);
  const lastHuman = useRef(0);
  const lastSent = useRef(0);
  const [pinConfirm, setPinConfirm] = useState("");
  const [selected, setSelected] = useState<PosStaffChoice | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [firstLocation, setFirstLocation] = useState("");
  const pendingAction = useRef<OperatorAction | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current += 1; }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    const response = await fetch("/api/pos/operator-session?brandSlug=" + encodeURIComponent(brandSlug), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) { if (response.status === 401 || response.status === 403) await clearPosLocalContext(); throw new Error(payload?.error || "No se pudo preparar la terminal."); }
    if (requireFood && (!payload.gateRequired || !["RESTAURANT", "CAFE"].includes(payload.mode))) throw new Error("El perfil de esta terminal no coincide. Vuelve a abrir Cometa POS.");
    if (version !== generation.current) return null;
    const next = payload as PosOperatorGateData;
    if(next.session && !lastHuman.current) lastHuman.current=Date.now();
    if(next.mode==="RETAIL" && next.session && retailAdministrative(retailPermissions(next.session.staff),next.session.staff.role) && Date.now()-lastHuman.current>=RETAIL_IDLE_MS) next.session=null;
    setData(next);
    if (next.session || !next.gateRequired) setReadyData(next);
    onOperatorChange(next.session?.staff || null, next.gateRequired);
    return next;
  }, [brandSlug, onOperatorChange, requireFood]);
  const refresh = useCallback(async () => {
    if (pendingAction.current) return;
    try { await load(); } catch (reason) {
      setData(null); onOperatorChange(null, requireFood);
      setError(reason instanceof Error ? reason.message : "No se pudo preparar la terminal.");
    }
  }, [load, onOperatorChange, requireFood]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    return () => { invalidate(); window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [refresh, invalidate]);
  async function act(action: OperatorAction) {
    pendingAction.current = action; ++generation.current;
    setData(null); setSelected(null); setPin(""); setError(null); setBusy(true);
    onOperatorChange(null, requireFood);
    try {
      const response = await fetch("/api/pos/operator-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug, action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo actualizar la sesión.");
      if ((action === "switch" || action === "lock") && data?.mode !== "RETAIL") await clearPosLocalContext(true, "operator");
      pendingAction.current = null;
      onActionComplete?.(action);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la sesión.");
      throw reason;
    } finally { setBusy(false); }
  }
  async function retry() {
    setError(null);
    if (pendingAction.current) await act(pendingAction.current).catch(() => undefined);
    else await refresh();
  }
  async function createFirst(event: React.FormEvent) {
    event.preventDefault(); if (data?.mode === "RETAIL" && pin !== pinConfirm) { setError("Los PIN no coinciden."); return; } setBusy(true); setError(null);
    try {
      const response = await fetch("/api/pos/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug, name: firstName, role: "ADMIN", locationId: firstLocation || null, pin, pinConfirm, ...(data?.mode === "RETAIL" ? {retailRole:"ADMIN"} : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo crear el operador.");
      setPin(""); const next = await load();
      setSelected(next?.staff.find((staff) => staff.id === payload.staff?.id) || null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el operador."); } finally { setBusy(false); }
  }
  async function login() {
    if (!selected || busy || pin.length < 4) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/pos/operator-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug, action: "login", staffId: selected.id, pin }) });
      const payload = await response.json(); setPin("");
      if (!response.ok) { await load(); throw new Error(payload?.error || "No se pudo ingresar."); }
      lastHuman.current=Date.now(); lastSent.current=0; await load();
    } catch (reason) { setPin(""); setError(reason instanceof Error ? reason.message : "No se pudo ingresar."); } finally { setBusy(false); }
  }

  useEffect(() => {
    if (data?.mode !== "RETAIL" || !data.session) return;
    const restricted=retailAdministrative(retailPermissions(data.session.staff),data.session.staff.role);
    const check=()=> { if (restricted && Date.now()-lastHuman.current >= RETAIL_IDLE_MS) { setData(current=>current ? {...current,session:null} : current); onOperatorChange(null,true); } };
    const human=(event: Event)=> {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      if (restricted && Date.now()-lastHuman.current >= RETAIL_IDLE_MS) {check();return;}
      lastHuman.current=Date.now();
      if (Date.now()-lastSent.current < 1000) return;
      lastSent.current=Date.now();
      void fetch("/api/pos/operator-session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandSlug,action:"activity"})}).then(response=>{if(response.status===401){setData(current=>current ? {...current,session:null}:current);onOperatorChange(null,true);}}).catch(()=>undefined);
    };
    const events=["pointerdown","pointermove","keydown","wheel","touchstart"];
    events.forEach(e=>window.addEventListener(e,human,{passive:true}));
    window.addEventListener("focus",check); document.addEventListener("visibilitychange",check);
    const timer=window.setInterval(check,1000);
    return ()=>{events.forEach(e=>window.removeEventListener(e,human));window.removeEventListener("focus",check);document.removeEventListener("visibilitychange",check);window.clearInterval(timer);};
  },[data?.mode,data?.session,brandSlug,onOperatorChange]);
  if(requireFood || (data?.mode !== "RETAIL" && readyData?.mode !== "RETAIL")) {
  const state = getFoodAccessState({ loaded: Boolean(data), error: !data && Boolean(error), firstRun: Boolean(data?.firstRun), authenticated: Boolean(data?.session), adminMode: Boolean(data?.adminMode) });
  if (!data) return <div data-food-state={state} className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center" role="status">
    <h1 className="text-xl font-bold">{fallbackName}</h1><p>{error || "Preparando terminal…"}</p>
    {error ? <><PosButton onClick={() => void retry()} loading={busy}>Reintentar</PosButton><PosExit /></> : null}
  </div>;
  if ((!requireFood && !data.gateRequired) || data.session) return <>{typeof children === "function" ? <GateContent render={children} data={data} action={act} /> : children}</>;
  return <div data-food-state={state}><PosOperatorGateSurface data={data} fallbackName={fallbackName} selected={selected} pin={pin} error={error} busy={busy} firstName={firstName} firstLocation={firstLocation} onSelect={(staff) => { setSelected(staff); setPin(""); setError(null); }} onPinChange={setPin} onFirstNameChange={setFirstName} onFirstLocationChange={setFirstLocation} onCreateFirst={createFirst} onLogin={() => void login()} /></div>;
  }
  const locked = !data || (data.gateRequired && !data.session);
  const state = getFoodAccessState({loaded:!!data,error:!data&&!!error,firstRun:!!data?.firstRun,authenticated:!!data?.session,adminMode:!!data?.adminMode});
  return <>
    {readyData ? <div hidden={locked} inert={locked}>{typeof children === "function" ? <GateContent render={children} data={data?.session ? data : readyData} action={act} /> : children}</div> : null}
    {locked ? <div data-food-state={state}>
      {!data ? <div role="status" className="p-6">{error || "Preparando terminal…"}{error ? <><PosButton onClick={()=>void retry()}>Reintentar</PosButton><PosExit /></>:null}</div> : <>
      {readyData?.session ? <p className="mb-4 rounded-xl bg-cyan-500/10 p-4">Sesión bloqueada · {readyData.session.staff.name}. El carrito se conserva; la venta se atribuirá al usuario que confirme el cobro. Selecciona tu usuario o cambia de usuario.</p>:null}
      {data.firstRun && data.mode === "RETAIL" ? <PosInput label="Confirmar PIN del administrador" type="password" inputMode="numeric" value={pinConfirm} onChange={e=>setPinConfirm(e.target.value.replace(/\D/g,"").slice(0,8))} /> : null}
      <PosOperatorGateSurface data={data} fallbackName={fallbackName} selected={selected} pin={pin} error={error} busy={busy} firstName={firstName} firstLocation={firstLocation} onSelect={(staff)=>{setSelected(staff);setPin("");setError(null);}} onPinChange={setPin} onFirstNameChange={setFirstName} onFirstLocationChange={setFirstLocation} onCreateFirst={createFirst} onLogin={()=>void login()} />
      </>}
    </div>:null}
  </>;

}

function GateContent({ render, data, action }: {
  render: (data: PosOperatorGateData, action: (action: OperatorAction) => Promise<void>) => ReactNode;
  data: PosOperatorGateData; action: (action: OperatorAction) => Promise<void>;
}) { return render(data, action); }

export function PosOperatorGateSurface({ data, fallbackName, selected, pin, error, busy, firstName, firstLocation, onSelect, onPinChange, onFirstNameChange, onFirstLocationChange, onCreateFirst, onLogin }: { data: PosOperatorGateData; fallbackName: string; selected: PosStaffChoice | null; pin: string; error: string | null; busy: boolean; firstName: string; firstLocation: string; onSelect: (staff: PosStaffChoice) => void; onPinChange: (pin: string) => void; onFirstNameChange: (name: string) => void; onFirstLocationChange: (locationId: string) => void; onCreateFirst: (event: React.FormEvent) => void; onLogin: () => void }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); const timer = window.setInterval(tick, 1000); const initial = window.setTimeout(tick, 0); return () => { window.clearInterval(timer); window.clearTimeout(initial); }; }, []);
  const style = useMemo(() => ({ "--operator-primary": data.branding?.primary_color || "#67E8F9", "--operator-secondary": data.branding?.secondary_color || "#06111F", "--operator-accent": data.branding?.accent_color || "#34D399" }) as CSSProperties, [data]);
  return <div style={style} className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,var(--operator-secondary),#030914_65%)] p-5 md:p-10">
    <div className="w-full max-w-4xl">
      <div className="mb-8 text-center">
        <OperatorLogo url={data.branding?.logo_url || null} name={data.branding?.display_name || fallbackName} />
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--operator-primary)]">{data.branding?.display_name || fallbackName}</p>
        <h2 className="mt-2 text-3xl font-black text-white">{data.firstRun ? "Configura tu equipo para comenzar" : "¿Quién está operando?"}</h2>
        <p className="mt-2 text-sm text-slate-400">{data.firstRun ? "Crea el primer encargado de esta terminal." : "Selecciona tu perfil e ingresa tu PIN."}</p>
      </div>
      {data.firstRun ? data.canConfigure ? <PosCard><form onSubmit={onCreateFirst} className="mx-auto grid max-w-xl gap-4">
        <PosInput label="Nombre" value={firstName} onChange={(e) => onFirstNameChange(e.target.value)} required />
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Primer operador</p><p className="mt-1 text-sm text-slate-300">Se creará como Administrador para evitar que la terminal quede sin autoridad local.</p></div>
        {data.locations.length ? <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sucursal<select className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white" value={firstLocation} onChange={(e) => onFirstLocationChange(e.target.value)}><option value="">Todas las sucursales</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
        <PinPad pin={pin} setPin={onPinChange} />{error ? <p className="text-sm text-rose-300">{error}</p> : null}<PosButton type="submit" loading={busy} disabled={busy || !firstName || pin.length < 4}>Crear primer operador</PosButton>
      </form></PosCard> : <PosCard><p className="text-center text-slate-300">Solicita a un propietario o administrador que configure el primer operador.</p></PosCard> : <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.staff.map((staff) => <button key={staff.id} type="button" disabled={busy || isStaffLocked(staff.lockedUntil, now)} onClick={() => onSelect(staff)} className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected?.id === staff.id ? "border-[var(--operator-primary)] bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"}`}><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--operator-primary)] font-black text-slate-950">{staff.name.slice(0,2).toUpperCase()}</span><strong className="block text-white">{staff.name}</strong><span className="text-xs uppercase tracking-wider text-slate-400">{staff.roleLabel || posStaffRoleLabel(staff.role)}</span>{isStaffLocked(staff.lockedUntil, now) ? <span className="mt-2 block text-[11px] font-semibold text-rose-300">Bloqueado temporalmente</span> : null}</button>)}</div>
        {selected ? <div className="mx-auto mt-7 max-w-sm"><PinPad pin={pin} setPin={onPinChange} />{error ? <p role="alert" className="mt-3 text-center text-sm text-rose-300">{error}</p> : null}<PosButton className="mt-4 w-full" loading={busy} onClick={onLogin} disabled={busy || pin.length < 4}>Ingresar</PosButton></div> : null}
      </>}
      <p className="mt-8 text-center text-[11px] uppercase tracking-[0.2em] text-slate-600">Powered by Cometa POS</p>
    </div>
  </div>;
}

function PinPad({ pin, setPin }: { pin: string; setPin: (value: string) => void }) {
  return <div><div className="mb-4 flex justify-center gap-2" aria-label={`${pin.length} dígitos ingresados`}>{Array.from({ length: 6 }, (_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-[var(--operator-primary)]" : "bg-white/15"}`} />)}</div><div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6,7,8,9].map((digit) => <button key={digit} type="button" onClick={() => pin.length < 8 && setPin(pin + digit)} className="h-14 rounded-xl border border-white/10 bg-white/[0.05] text-xl font-bold text-white hover:bg-white/10">{digit}</button>)}<button type="button" onClick={() => setPin("")} className="h-14 rounded-xl text-xs font-bold uppercase text-slate-400">Limpiar</button><button type="button" onClick={() => pin.length < 8 && setPin(pin + "0")} className="h-14 rounded-xl border border-white/10 bg-white/[0.05] text-xl font-bold text-white">0</button><button type="button" onClick={() => setPin(pin.slice(0,-1))} className="h-14 rounded-xl text-xl text-slate-400">⌫</button></div></div>;
}

function OperatorLogo({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--operator-primary)] text-xl font-black text-slate-950">{name.slice(0,2).toUpperCase()}</div>;
  // The canonical POS branding URL may be hosted outside Next image domains.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`Logo de ${name}`} onError={() => setFailed(true)} className="mx-auto mb-4 h-16 w-16 rounded-2xl object-contain" />;
}
