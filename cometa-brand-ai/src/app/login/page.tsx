"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function getSafeRedirect() {
  if (typeof window === "undefined") return "/workspace";

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  return "/workspace";
}

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMessage("Correo o contraseña incorrectos.");
      return;
    }

    window.location.href = getSafeRedirect();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06101f] px-6 py-10 text-white">
      <div className="absolute left-[-160px] top-[-160px] h-[420px] w-[420px] rounded-full bg-cyan-400/25 blur-[120px]" />
      <div className="absolute bottom-[-180px] right-[-140px] h-[520px] w-[520px] rounded-full bg-emerald-400/20 blur-[130px]" />
      <div className="absolute bottom-[-220px] left-1/2 h-[380px] w-[900px] -translate-x-1/2 rotate-[-7deg] rounded-[100%] border border-cyan-300/20" />

      <section className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.04] shadow-[0_34px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_480px]">
        <div className="hidden p-10 lg:block">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 shadow-xl shadow-cyan-400/20">
              <div className="absolute h-7 w-7 rounded-full bg-cyan-300 blur-[8px]" />
              <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
              <div className="absolute right-2 top-2 h-3 w-3 rounded-full bg-slate-950" />
            </div>

            <p className="text-xl font-black uppercase tracking-[-0.03em]">
              COMETA OS
            </p>
          </div>

          <div className="mt-16 max-w-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">
              Acceso privado
            </p>

            <h1 className="mt-5 text-6xl font-black leading-[0.94] tracking-[-0.08em]">
              Entra al sistema operativo comercial.
            </h1>

            <p className="mt-6 text-base font-semibold leading-8 text-slate-300">
              Gestiona marcas, diagnósticos, agentes, ventas, conocimiento y
              aprendizaje desde el Command Center de Cometa OS.
            </p>
          </div>

          <div className="mt-12 grid max-w-xl gap-3">
            <LoginFeature title="Workspace" text="Marcas, agentes y prioridades." />
            <LoginFeature title="Brand OS" text="Sistema individual por cliente." />
            <LoginFeature title="Sales AI" text="Ventas, leads y seguimiento." />
          </div>
        </div>

        <div className="bg-white p-7 text-slate-950 sm:p-9 lg:p-10">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 shadow-xl shadow-cyan-400/20">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
            </div>

            <h1 className="text-4xl font-black tracking-[-0.06em]">
              COMETA OS
            </h1>

            <p className="mt-2 text-sm font-semibold text-slate-500">
              Acceso privado al sistema.
            </p>
          </div>

          <div className="hidden lg:block">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
              Login
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.07em]">
              Iniciar sesión
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              Usa tus credenciales para entrar al Command Center.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Correo electrónico
              </span>
              <input
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Contraseña
              </span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                required
              />
            </label>

            {errorMessage && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-black text-white shadow-xl shadow-slate-950/15 transition hover:bg-cyan-700 disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar a Cometa OS →"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-4 text-sm">
            <Link href="/" className="font-black text-slate-500 hover:text-slate-950">
              ← Volver al sitio
            </Link>

            <a
              href="mailto:cometa.mktmx@gmail.com?subject=Acceso%20a%20Cometa%20OS"
              className="font-black text-cyan-700 hover:text-cyan-600"
            >
              Solicitar acceso
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginFeature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">{text}</p>
    </div>
  );
}