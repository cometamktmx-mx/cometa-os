"use client";
import { useEffect, useState } from "react";

export default function ConnectCard() {
  const [status, setStatus] = useState("NOT_STARTED");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function sync() {
    setBusy(true);
    try {
      const response = await fetch("/api/comu/seller/connect/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error();
      setStatus(data.result.onboarding_status);
    } catch { setMessage("No pudimos consultar tu cuenta de pagos. Inténtalo nuevamente."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void sync(); }, []);
  async function configure() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const accountResponse = await fetch("/api/comu/seller/connect/account", { method: "POST" });
      if (!accountResponse.ok) throw new Error();
      const response = await fetch("/api/comu/seller/connect/onboarding-link", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error();
      const url = new URL(data.result.url);
      if (url.protocol !== "https:" || !(url.hostname === "connect.stripe.com" || url.hostname.endsWith(".stripe.com"))) throw new Error();
      window.location.assign(url.href);
    } catch { setMessage("No pudimos abrir la configuración. Inténtalo nuevamente."); setBusy(false); }
  }
  const labels: Record<string, string> = { NOT_STARTED: "Activa tus cobros", PENDING: "Configuración pendiente", REVIEW: "Cuenta en revisión", COMPLETE: "✓ Cuenta de pagos activa", RESTRICTED: "Cuenta de pagos restringida" };
  return <section className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-xl font-bold">{labels[status] || "Cuenta de pagos"}</h2><p className="mt-3 text-sm text-[#72675e]">Configura tu cuenta para recibir tus ventas de COMU. Stripe gestiona tu identidad y tus datos bancarios.</p><div className="mt-5 flex flex-wrap gap-4">{status !== "COMPLETE" && <button disabled={busy} onClick={() => void configure()} className="rounded-full bg-[#252d28] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Consultando…" : status === "NOT_STARTED" ? "Configurar pagos" : "Continuar configuración"}</button>}<button disabled={busy} onClick={() => void sync()} className="font-bold underline disabled:opacity-50">Actualizar cuenta</button></div>{message && <p role="status" className="mt-4 text-sm">{message}</p>}</section>;
}
