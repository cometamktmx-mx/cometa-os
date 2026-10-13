import { useCallback, useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { Network } from "@capacitor/network";
import { PosFoodOperations } from "@/app/brand/[brandSlug]/components/pos-food-operations";
import type { PosOperator, PosOperatorGateData } from "@/app/brand/[brandSlug]/components/pos-operator-gate";
import { PosTransportContext } from "@/lib/pos/client-transport";
import { clearPosLocalContext } from "@/lib/pos/offline-storage";
import { auth, api, mobileFetch, readTerminal, clearMobileContext, forgetOperator } from "./transport";
import { hasSeenOnboarding, markOnboardingSeen, brandDestination, type Brand } from "./policy";
import { vault } from "./vault";
import { Onboarding, CometaWordmark } from "./onboarding/Onboarding";
import { UpdateNotice } from "./UpdateNotice";
import { mobileConfig } from "./environment";

type Stage = "splash" | "onboarding" | "auth" | "loading" | "brands" | "enroll" | "pin" | "food" | "blocked";
export default function App() {
  const [stage, setStage] = useState<Stage>("splash");
  const [brands, setBrands] = useState<Brand[]>([]), [brand, setBrand] = useState<Brand | null>(null);
  const [gate, setGate] = useState<PosOperatorGateData | null>(null), [operator, setOperator] = useState<PosOperator | null>(null);
  const [accountId, setAccountId] = useState(""), [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [online, setOnline] = useState(navigator.onLine);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [pin, setPin] = useState("");
  const [staffId, setStaffId] = useState(""), [locationId, setLocationId] = useState("");
  const epoch = useRef(0), currentBrand = useRef<Brand | null>(null);
  const selectBrand = useCallback(async (next: Brand) => {
    const generation = epoch.current;
    setBrand(next); currentBrand.current = next; setStage("loading");
    const terminal = await api<{ device: { id: string } | null }>(`devices?brandSlug=${encodeURIComponent(next.slug)}`);
    if (generation !== epoch.current) return;
    if (!terminal.device) { setLocationId(next.locations.length === 1 ? next.locations[0].id : ""); setStage("enroll"); return; }
    setDeviceId(terminal.device.id);
    const value = await api<PosOperatorGateData>(`operator-session?brandSlug=${encodeURIComponent(next.slug)}`);
    if (generation !== epoch.current) return;
    if (value.mode === "RETAIL") throw new Error("La prueba M2 está habilitada para Restaurante y Cafetería.");
    setGate(value); setStaffId(value.staff.length === 1 ? value.staff[0].id : ""); setPin(""); setOperator(null); setStage("pin");
  }, []);
  const restore = useCallback(async () => {
    const generation = ++epoch.current;
    setStage("loading"); setError(""); setOperator(null); forgetOperator();
    const session = await auth.auth.getSession();
    if (generation !== epoch.current) return;
    if (!session.data.session) { setStage("auth"); return; }
    const verified = await auth.auth.getUser();
    if (verified.error || !verified.data.user) throw new Error("No se pudo revalidar la cuenta. Reintenta con conexión.");
    setAccountId(verified.data.user.id);
    const saved = await readTerminal();
    if (saved) {
      await api(`devices?brandSlug=${encodeURIComponent(saved.brandSlug)}`);
      await api("session/lock", { brandSlug: saved.brandSlug });
    }
    const value = await api<{ brands: Brand[] }>("brands");
    if (generation !== epoch.current) return;
    setBrands(value.brands);
    const selected = saved ? value.brands.find(b => b.slug === saved.brandSlug) : brandDestination(value.brands) === "single" ? value.brands[0] : null;
    if (saved && !selected) throw new Error("El negocio de esta terminal no está autorizado.");
    if (selected) await selectBrand(selected); else setStage("brands");
  }, [selectBrand]);
  const failed = (reason: unknown) => { setError(reason instanceof Error ? reason.message : "No se pudo validar el acceso."); setOperator(null); setStage("blocked"); };
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo confirmar la operación."); setStage(current => current === "loading" ? "blocked" : current); } finally { setBusy(false); } }
  const lock = useCallback(async () => {
    epoch.current++; setOperator(null); setPin(""); setStage("loading");
    try { if (currentBrand.current) await api("session/lock", { brandSlug: currentBrand.current.slug }); }
    finally { forgetOperator(); await clearPosLocalContext(); }
  }, []);
  useEffect(() => {
    let disposed = false;
    let pendingLock: Promise<void> = Promise.resolve();
    const frame = requestAnimationFrame(() => {
      if (hasSeenOnboarding(localStorage)) void restore().catch(failed);
      else setStage("onboarding");
    });
    const network = () => setOnline(navigator.onLine);
    const denied = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string; error?: string }>).detail;
      // A wrong PIN remains on the PIN form; a resource-level permission denial is shown by Food.
      if (detail.code === "POS_STAFF_PIN_INCORRECT" || detail.code === "POS_STAFF_PERMISSION_REQUIRED" || detail.code === "POS_ADMIN_OPERATOR_REQUIRED") return;
      failed(new Error(detail.error || "Acceso POS no disponible."));
    };
    const handleState = async (active: boolean) => {
      if (!active) { auth.auth.stopAutoRefresh(); pendingLock = lock().catch(() => { /* Remain locked when the network fails. */ }); await pendingLock; }
      else { await pendingLock; auth.auth.startAutoRefresh(); if (!disposed) { if (hasSeenOnboarding(localStorage)) void restore().catch(failed); else setStage("onboarding"); } }
    };
    const visibility = () => { void handleState(!document.hidden); };
    const subscription = Capacitor.isNativePlatform() ? NativeApp.addListener("appStateChange", state => { void handleState(state.isActive); }) : null;
    const networkSubscription = Network.addListener("networkStatusChange", status => { if (!disposed) setOnline(status.connected); });
    void Network.getStatus().then(status => { if (!disposed) setOnline(status.connected); }).catch(() => setOnline(navigator.onLine));
    if (!Capacitor.isNativePlatform()) document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", network); window.addEventListener("offline", network); window.addEventListener("pos-mobile-denied", denied);
    return () => { disposed = true; cancelAnimationFrame(frame); void subscription?.then(h => h.remove()); void networkSubscription.then(h => h.remove()); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", network); window.removeEventListener("offline", network); window.removeEventListener("pos-mobile-denied", denied); };
  }, [lock, restore]);
  useEffect(() => {
    if (stage === "splash") return;
    const frame = requestAnimationFrame(() => { void SplashScreen.hide().catch(() => undefined); });
    return () => cancelAnimationFrame(frame);
  }, [stage]);
  async function logout() {
    try { await api("session", undefined, "DELETE"); }
    finally { epoch.current++; try { await auth.auth.signOut({ scope: "local" }); } finally { await vault.removeItem("host-session"); await clearMobileContext(); setBrand(null); setOperator(null); setGate(null); setDeviceId(null); setPassword(""); setPin(""); setStage("auth"); } }
  }
  const beginAuth = () => { markOnboardingSeen(localStorage); setStage("auth"); };
  async function recoverPassword() {
    if (mobileConfig.channel !== "beta") { setError("Recupera tu contraseña desde el acceso web local."); return; }
    if (!email.trim()) { setError("Ingresa tu correo para recuperar el acceso."); return; }
    const result = await auth.auth.resetPasswordForEmail(email.trim(), { redirectTo: "https://pos-beta.cometaos.com/mobile/auth/recovery" });
    if (result.error) throw new Error("No se pudo solicitar el enlace.");
    setError("Si la cuenta existe, recibirás un enlace. Ábrelo en este dispositivo.");
  }
  if (stage === "onboarding") return <Onboarding onComplete={beginAuth}/>;
  if (stage === "splash") return <main className="cometa-launch" aria-label="Cargando COMETA POS"><CometaWordmark/></main>;
  return <div className="mobile-app cometa-pos" data-pos-theme="dark">
    <UpdateNotice/>
    <header className="mobile-header"><strong>COMETA <span>POS</span></strong>{brand && <span>{brand.name}</span>}{stage === "food" && <button onClick={() => void run(async () => { await lock(); if (brand) await selectBrand(brand); })}>Cambiar operador</button>}{!["splash", "onboarding", "auth"].includes(stage) && <button onClick={() => void run(logout)}>Cerrar sesión</button>}</header>
    {!online && <div role="status" className="network-banner">Sin conexión. Ventas, pedidos y cobros requieren confirmación del servidor.</div>}
    {error && <div role="alert" className="error-banner">{error}</div>}
    {stage === "auth" && <form className="mobile-card" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await auth.auth.signInWithPassword({ email: email.trim(), password }); setPassword(""); if (result.error) throw result.error; await restore(); }); }}><p className="eyebrow">BIENVENIDO A COMETA POS</p><h1>Tu negocio está aquí.</h1><label>Correo<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/></label><label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label><button className="primary" disabled={busy || !online}>Entrar</button><button type="button" onClick={() => void run(recoverPassword)}>Recuperar contraseña</button></form>}
    {stage === "loading" && <main className="mobile-card" role="status">Validando cuenta y terminal…</main>}
    {stage === "brands" && <main className="mobile-card"><h1>{brands.length ? "Selecciona tu negocio" : "No tienes un negocio POS disponible."}</h1>{brands.map(b => <button key={b.id} disabled={busy} onClick={() => void run(() => selectBrand(b))}>{b.name}</button>)}</main>}
    {stage === "enroll" && brand && <main className="mobile-card"><h1>Configura esta terminal</h1><p>{brand.name}</p><label>Sucursal<select value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">Seleccionar sucursal</option>{brand.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button className="primary" disabled={busy || !locationId || !online} onClick={() => void run(async () => { await api("devices", { brandSlug: brand.slug, locationId, label: "COMETA POS Tablet" }); await selectBrand(brand); })}>Enrolar terminal</button></main>}
    {stage === "pin" && gate && brand && <form className="mobile-card" onSubmit={e => { e.preventDefault(); const entered = pin; const generation = epoch.current; setPin(""); void run(async () => { const result = await api<{ session: { staff: PosOperator } }>("operator-session", { brandSlug: brand.slug, action: "login", staffId, pin: entered }); if (generation !== epoch.current) return; setOperator(result.session.staff); setStage("food"); }); }}><p className="eyebrow">{brand.name}</p><h1>Ingresa tu PIN</h1><label>Operador<select required value={staffId} onChange={e => setStaffId(e.target.value)}><option value="">Seleccionar operador</option>{gate.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>PIN<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" minLength={4} maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))} required/></label><button className="primary" disabled={busy || !online}>Abrir POS</button>{gate.firstRun && <p>Configura los operadores desde el POS web antes de usar esta terminal.</p>}</form>}
    {stage === "food" && operator && brand && <PosTransportContext.Provider value={mobileFetch}><main className="food-container" inert={!online}><PosFoodOperations key={`${brand.slug}:${operator.id}`} operator={operator} brandSlug={brand.slug} accountId={accountId} deviceId={deviceId} printingEnabled={false}/></main></PosTransportContext.Provider>}
    {stage === "blocked" && <main className="mobile-card"><h1>Acceso POS no disponible</h1><p>Revalida la conexión o cierra sesión para configurar una terminal autorizada.</p><button disabled={busy || !online} onClick={() => void run(restore)}>Reintentar</button><button onClick={() => void run(logout)}>Cerrar sesión y reconfigurar</button></main>}
  </div>;
}
