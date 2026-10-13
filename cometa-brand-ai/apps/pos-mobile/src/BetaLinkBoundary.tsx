import { useEffect, useState, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { auth, clearMobileContext } from "./transport";
import { mobileConfig } from "./environment";
import { parseMobileLink } from "./deep-links";
export function BetaLinkBoundary({ children }: { children: ReactNode }) {
  const [recovery, setRecovery] = useState(false), [message, setMessage] = useState("");
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mobileConfig.channel !== "beta" || !Capacitor.isNativePlatform()) return;
    let disposed = false;
    const consumed = new Set<string>();
    const handle = async (url: string) => {
      try {
        const link = parseMobileLink(url, mobileConfig.channel);
        if (!link) return;
        if (link.kind === "pos") { if (!disposed) setMessage("Selecciona el negocio autorizado e ingresa tu PIN para abrir POS."); return; }
        if (consumed.has(link.code)) return;
        consumed.add(link.code);
        const result = await auth.auth.exchangeCodeForSession(link.code);
        if (result.error || !result.data.session) throw Error("Invalid callback");
        await clearMobileContext();
        if (disposed) return;
        if (link.kind === "recovery") setRecovery(true);
        else window.location.reload();
      } catch { if (!disposed) setMessage("El enlace no es válido o expiró. Solicita otro desde esta instalación."); }
    };
    const subscription = NativeApp.addListener("appUrlOpen", event => { void handle(event.url); });
    void NativeApp.getLaunchUrl().then(value => { if (value) void handle(value.url); }).catch(() => undefined);
    return () => { disposed = true; void subscription.then(s => s.remove()); };
  }, []);
  if (recovery) return <form className="mobile-card" onSubmit={event => {
    event.preventDefault(); if (busy) return; setBusy(true);
    void auth.auth.updateUser({ password }).then(async result => {
      setPassword(""); if (result.error) throw result.error;
      await auth.auth.signOut({ scope: "local" }); await clearMobileContext(); window.location.reload();
    }).catch(() => setMessage("No se pudo cambiar la contraseña. Solicita un enlace nuevo.")).finally(() => setBusy(false));
  }}><h1>Nueva contraseña</h1><input aria-label="Nueva contraseña" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)}/><button disabled={busy}>Guardar contraseña</button><p role="status">{message}</p></form>;
  return <>{message && <p role="status">{message}</p>}{children}</>;
}
