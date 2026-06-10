"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMessage("Correo o contraseña incorrectos.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] flex items-center justify-center px-6">
      <section className="w-full max-w-md bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Cometa Logo"
            className="w-24 h-24 object-contain mx-auto mb-4"
          />

          <h1 className="text-4xl font-black text-slate-950">COMETA OS</h1>

          <p className="text-slate-500 mt-2">
            Acceso privado al sistema operativo de crecimiento.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          {errorMessage && (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 text-sm">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-blue-700 text-white font-bold px-6 py-4 rounded-2xl disabled:opacity-50 transition"
          >
            {loading ? "Entrando..." : "Entrar a Cometa OS"}
          </button>
        </form>
      </section>
    </main>
  );
}