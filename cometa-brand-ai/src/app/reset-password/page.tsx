"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function prepareSession() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) await supabase.auth.exchangeCodeForSession(code);
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSessionReady(Boolean(data.session));
      if (!data.session) setError("El enlace no es válido o ya expiró. Solicita uno nuevo.");
    }
    void prepareSession();
    return () => { active = false; };
  }, [supabase.auth]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirmation) return setError("Las contraseñas no coinciden.");
    try {
      setLoading(true);
      setError("");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      window.location.href = "/login?password=updated";
    } catch {
      setError("No pudimos actualizar la contraseña. Solicita un enlace nuevo.");
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#06101f] px-5"><section className="w-full max-w-md rounded-[30px] bg-white p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Nuevo acceso</p><h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">Crea una contraseña nueva</h1><form onSubmit={submit} className="mt-7 space-y-4"><input required disabled={!sessionReady} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" className="h-13 w-full rounded-2xl border border-slate-200 px-4" /><input required disabled={!sessionReady} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirmar contraseña" className="h-13 w-full rounded-2xl border border-slate-200 px-4" />{error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}<button disabled={!sessionReady || loading} className="h-13 w-full rounded-2xl bg-slate-950 font-black text-white disabled:opacity-50">{loading ? "Guardando..." : "Guardar contraseña"}</button></form></section></main>;
}
