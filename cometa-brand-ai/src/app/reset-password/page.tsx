"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const recoveryVerified = useRef(false);

  useEffect(() => {
    let active = true;
    async function prepareSession() {
      try {
        const params = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        if (params.has("error") || hash.has("error")) throw new Error("RECOVERY_LINK_FAILED");
        // Token-hash links are consumed only when the user submits the new password.
        if (params.get("type") === "recovery" && params.get("token_hash")) {
          if (active) setSessionReady(true);
          return;
        }
        // detectSessionInUrl already handles PKCE/implicit links; avoid exchanging
        // the single-use code twice (including React Strict Mode effect replay).
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) throw new Error("RECOVERY_SESSION_MISSING");
        if (!active) return;
        window.history.replaceState(null, "", "/reset-password");
        setSessionReady(true);
      } catch {
        if (active) {
          setSessionReady(false);
          setError("El enlace no es válido o ya expiró. Solicita uno nuevo.");
        }
      }
    }
    void prepareSession();
    return () => { active = false; };
  }, [supabase.auth]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionReady || submitting.current) return;
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirmation) return setError("Las contraseñas no coinciden.");
    submitting.current = true;
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      if (params.get("type") === "recovery" && tokenHash && !recoveryVerified.current) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (verifyError || !data.session) throw new Error("RECOVERY_VERIFICATION_FAILED");
        recoveryVerified.current = true;
        window.history.replaceState(null, "", "/reset-password");
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      window.location.href = "/login?password=updated";
    } catch {
      setError("No pudimos actualizar la contraseña. Solicita un enlace nuevo.");
      setLoading(false);
    } finally {
      submitting.current = false;
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#06101f] px-5"><section className="w-full max-w-md rounded-[30px] bg-white p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Nuevo acceso</p><h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">Crea una contraseña nueva</h1><form onSubmit={submit} className="mt-7 space-y-4"><input required disabled={!sessionReady} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" className="h-13 w-full rounded-2xl border border-slate-200 px-4" /><input required disabled={!sessionReady} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirmar contraseña" className="h-13 w-full rounded-2xl border border-slate-200 px-4" />{error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}<button disabled={!sessionReady || loading} className="h-13 w-full rounded-2xl bg-slate-950 font-black text-white disabled:opacity-50">{loading ? "Guardando..." : "Guardar contraseña"}</button></form></section></main>;
}
