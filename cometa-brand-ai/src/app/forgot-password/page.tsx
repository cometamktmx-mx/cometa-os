"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } catch {
      setError("No pudimos procesar la solicitud. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#06101f] px-5"><section className="w-full max-w-md rounded-[30px] bg-white p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Recuperar acceso</p><h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">Restablece tu contraseña</h1>{sent ? <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Si existe una cuenta con ese correo, recibirás un enlace para continuar.</p> : <form onSubmit={submit} className="mt-7 space-y-4"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@empresa.com" className="h-13 w-full rounded-2xl border border-slate-200 px-4 outline-none focus:border-cyan-400" />{error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}<button disabled={loading} className="h-13 w-full rounded-2xl bg-slate-950 font-black text-white disabled:opacity-50">{loading ? "Enviando..." : "Enviar enlace"}</button></form>}<Link href="/login" className="mt-6 block text-center text-sm font-black text-cyan-700">Volver a iniciar sesión</Link></section></main>;
}

