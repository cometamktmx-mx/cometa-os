"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  function confirmationRedirectTo() {
    return `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
      "/onboarding/business"
    )}`;
  }

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      setErrorMessage("Completa tu nombre y correo electrónico.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: normalizedName },
          emailRedirectTo: confirmationRedirectTo(),
        },
      });

      if (error) {
        setErrorMessage(humanSignupError(error.message));
        return;
      }

      if (data.session) {
        window.location.href = "/onboarding/business";
        return;
      }

      setEmailSent(true);
    } catch {
      setErrorMessage("No pudimos crear tu cuenta. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || resending) return;

    try {
      setResending(true);
      setResendMessage("");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo: confirmationRedirectTo() },
      });

      setResendMessage(
        error
          ? "No pudimos reenviar el correo todavía. Espera un momento e intenta nuevamente."
          : "Te enviamos un enlace nuevo. Usa únicamente el correo más reciente."
      );
    } catch {
      setResendMessage(
        "No pudimos reenviar el correo todavía. Espera un momento e intenta nuevamente."
      );
    } finally {
      setResending(false);
    }
  }

  if (emailSent) {
    return (
      <AuthFrame title="Revisa tu correo" eyebrow="Cuenta creada">
        <p className="text-sm font-semibold leading-7 text-slate-600">
          Te enviamos un enlace para confirmar tu cuenta. Después de confirmar,
          continuarás con la creación de tu negocio.
        </p>
        <button
          type="button"
          disabled={resending}
          onClick={handleResend}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 disabled:opacity-50"
        >
          {resending ? "Reenviando..." : "Reenviar correo"}
        </button>
        {resendMessage ? (
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {resendMessage}
          </p>
        ) : null}
        <Link href="/login" className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">
          Volver a iniciar sesión
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Crea tu cuenta" eyebrow="Cometa POS · 15 días gratis">
      <form onSubmit={handleSignup} className="space-y-4">
        <AuthField label="Tu nombre" type="text" value={fullName} onChange={setFullName} autoComplete="name" />
        <AuthField label="Correo electrónico" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <AuthField label="Contraseña" type="password" value={password} onChange={setPassword} autoComplete="new-password" hint="Mínimo 8 caracteres" />
        <AuthField label="Confirmar contraseña" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
        {errorMessage ? <AuthError message={errorMessage} /> : null}
        <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center rounded-2xl bg-cyan-600 px-6 text-sm font-black text-white disabled:opacity-50">
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm font-semibold text-slate-500">
        ¿Ya tienes cuenta? <Link href="/login" className="font-black text-cyan-700">Iniciar sesión</Link>
      </p>
    </AuthFrame>
  );
}

function humanSignupError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already") || normalized.includes("registered")) {
    return "Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.";
  }
  if (normalized.includes("password")) return "La contraseña no cumple los requisitos de seguridad.";
  return "No pudimos crear tu cuenta. Revisa los datos e intenta nuevamente.";
}

function AuthFrame({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#06101f] px-5 py-10"><section className="w-full max-w-md rounded-[32px] bg-white p-7 shadow-2xl sm:p-9"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">{eyebrow}</p><h1 className="mb-7 mt-3 text-4xl font-black tracking-[-0.06em] text-slate-950">{title}</h1>{children}</section></main>;
}

function AuthField({ label, hint, value, onChange, ...props }: { label: string; hint?: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.13em] text-slate-500">{label}</span><input {...props} required value={value} onChange={(event) => onChange(event.target.value)} className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-950 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100" />{hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}</label>;
}

function AuthError({ message }: { message: string }) {
  return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">{message}</div>;
}
