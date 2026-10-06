"use client";
import Link from "next/link";
import { ComuAuthEditorial } from "./auth-editorial";
import { useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeComuNext, comuLoginHref } from "@/lib/comu/auth-navigation";

type Mode = "login" | "register" | "recovery" | "reset" | "confirm";
const copy = {
  login: ["Bienvenido a COMU", "Qué bueno tenerte de vuelta.", "Entra para continuar comprando, guardar tus favoritos y seguir tus pedidos."],
  register: ["Únete a COMU", "Crea tu cuenta.", "Guarda tus favoritos, sigue tus pedidos y descubre lo mejor de nuestra comunidad."],
  recovery: ["Tu cuenta COMU", "Volvamos a encontrarnos.", "Te enviaremos un enlace para recuperar el acceso a tu cuenta."],
  reset: ["Tu cuenta COMU", "Un nuevo comienzo.", "Elige una contraseña nueva para tu cuenta."],
  confirm: ["Bienvenido a la comunidad", "Confirma tu cuenta.", "Continúa para confirmar tu correo y abrir tu espacio en COMU."],
};
export function ComuAuthForm({ mode, next: requestedNext, callbackError = false, code, tokenHash }: { mode: Mode; next?: string; callbackError?: boolean; code?: string; tokenHash?: string }) {
  const next = safeComuNext(requestedNext);
  const [busy, setBusy] = useState(false), [error, setError] = useState(callbackError ? "No pudimos completar el acceso. Intenta nuevamente." : "");
  const [sent, setSent] = useState(false), [needsProfile, setNeedsProfile] = useState(false), [showPassword, setShowPassword] = useState(false);
  const active = useRef(false), verified = useRef(false);
  const [eyebrow, title, description] = copy[mode];
  const suffix = "?next=" + encodeURIComponent(next);
  async function finish() {
    if (mode === "register") {
      setNeedsProfile(true);
      const response = await fetch("/api/comu/buyer/experience", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error("No pudimos preparar tu espacio. Tu sesión está iniciada; puedes reintentar.");
    }
    window.location.assign(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (active.current) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    const fullName = String(form.get("fullName") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    setError("");
    if (!needsProfile) {
      if (["login", "register", "recovery"].includes(mode) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Revisa tu correo electrónico.");
      if (mode === "login" && !password) return setError("Escribe tu contraseña.");
      if (["register", "reset"].includes(mode) && (password.length < 8 || password !== confirmation)) return setError("Usa al menos 8 caracteres y confirma la misma contraseña.");
      if (mode === "register" && (!fullName || fullName.length > 100 || !/^[+\d\s()-]{7,25}$/.test(phone) || form.get("terms") !== "on")) return setError("Revisa tu nombre y teléfono y acepta los términos y el aviso de privacidad.");
    }
    active.current = true; setBusy(true);
    try {
      if (needsProfile) { await finish(); return; }
      const auth = createClient().auth;
      if (mode === "login") {
        const { data, error } = await auth.signInWithPassword({ email, password });
        if (error || !data.session) throw new Error("Correo o contraseña incorrectos.");
        await finish();
      } else if (mode === "register") {
        const { data, error } = await auth.signUp({ email, password, options: { data: { full_name: fullName, comu_phone: phone, comu_registration: true }, emailRedirectTo: window.location.origin + "/comu/auth/confirm" + suffix } });
        if (error) throw new Error("No pudimos crear tu cuenta. Revisa tus datos o inicia sesión si ya tienes una cuenta.");
        if (data.session) await finish(); else setSent(true);
      } else if (mode === "recovery") {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/comu/reset-password" + suffix });
        if (error) throw new Error("No pudimos enviar el enlace. Espera un momento e inténtalo nuevamente.");
        setSent(true);
      } else {
        // Token exchange is initiated by the human, never by an email scanner GET.
        if (!verified.current) {
          if (code) { const { error } = await auth.exchangeCodeForSession(code); if (error) throw new Error("El enlace no es válido o ya expiró."); }
          else if (tokenHash) { const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: mode === "reset" ? "recovery" : "email" }); if (error) throw new Error("El enlace no es válido o ya expiró."); }
          else if (mode === "confirm") throw new Error("El enlace de confirmación está incompleto. Abre el enlace de tu correo.");
          const { data: { user }, error } = await auth.getUser();
          if (error || !user) throw new Error("El enlace no es válido o ya expiró. Solicita uno nuevo.");
          verified.current = true;
          window.history.replaceState(null, "", (mode === "reset" ? "/comu/reset-password" : "/comu/auth/confirm") + suffix);
        }
        if (mode === "reset") { const { error } = await auth.updateUser({ password }); if (error) throw new Error("No pudimos actualizar la contraseña. Revisa los requisitos de seguridad e inténtalo nuevamente."); }
        await finish();
      }
    } catch (failure) { setError(failure instanceof Error && !/fetch|JSON|network/i.test(failure.message) ? failure.message : "No pudimos completar la solicitud. Inténtalo nuevamente."); }
    finally { active.current = false; setBusy(false); }
  }
  const action = needsProfile ? "Abrir mi cuenta" : ({ login: "Entrar a COMU →", register: "Crear mi cuenta →", recovery: "Enviar enlace →", reset: "Guardar contraseña →", confirm: "Confirmar y continuar →" })[mode];
  const editorial = mode === "login" || mode === "register";
  return <main className={editorial ? "mx-auto min-h-screen max-w-[1440px] px-5 py-5 sm:px-8 lg:px-10 lg:py-7" : "mx-auto min-h-screen max-w-6xl px-5 py-7 sm:px-8 lg:py-12"}>
    <Link href="/comu" aria-label="COMU inicio" className="inline-flex min-h-12 items-center text-3xl font-black tracking-[-.1em]">COMU<span className="text-[#b58a68]">.</span></Link>
    <div className={editorial ? "mt-5 grid items-center gap-8 md:grid-cols-[1.15fr_1fr] md:gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-16" : "mt-8 grid items-center gap-12 lg:mt-12 lg:grid-cols-[1fr_1fr] lg:gap-20"}>
      {editorial ? <ComuAuthEditorial key={mode} variant={mode} /> : <aside className="hidden min-h-[560px] flex-col justify-between rounded-[2rem] bg-[#e8ded0] p-12 lg:flex"><p className="comu-eyebrow">Una comunidad. Tu estilo.</p><div><h2 className="font-serif text-6xl leading-[1.05] tracking-tight">Piezas que conectan contigo.</h2><p className="mt-7 max-w-xs text-base leading-8 text-[#72675e]">Descubre marcas, guarda lo que te inspira y haz de COMU un espacio más tuyo.</p></div><Link className="text-sm underline underline-offset-4" href="/comu/search">Explora nuestra comunidad →</Link></aside>}
      <section className="mx-auto w-full max-w-md pb-8"><p className="comu-eyebrow">{eyebrow}</p><h1 className="mt-4 font-serif text-4xl font-normal leading-[1.1] tracking-tight sm:text-5xl">{sent ? "Revisa tu correo." : title}</h1><p className="mt-5 text-sm leading-7 text-[#72675e]">{sent ? mode === "register" ? "Si tu correo requiere confirmación, recibirás un enlace para continuar. Si ya tienes una cuenta, inicia sesión. Todavía no hemos iniciado una sesión nueva." : "Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña." : description}</p>
        {!sent && <form onSubmit={submit} className={mode === "register" ? "mt-6 space-y-3" : "mt-8 space-y-5"}>
          {!needsProfile && mode === "register" && <label className="block text-sm">Nombre completo<input name="fullName" autoComplete="name" required maxLength={100} className="comu-field" /></label>}
          {!needsProfile && ["login", "register", "recovery"].includes(mode) && <label className="block text-sm">Correo electrónico<input name="email" type="email" autoComplete="email" required maxLength={254} className="comu-field" /></label>}
          {!needsProfile && mode === "register" && <label className="block text-sm">Teléfono<input name="phone" type="tel" autoComplete="tel" required maxLength={25} className="comu-field" /></label>}
          {!needsProfile && ["login", "register", "reset"].includes(mode) && <><label className="block text-sm">Contraseña<div className="relative"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? undefined : 8} className="comu-field !pr-24" /><button type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-0 min-h-12 px-3 text-xs">{showPassword ? "Ocultar" : "Mostrar"}</button></div></label>{mode !== "login" && <label className="block text-sm">Confirmar contraseña<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} className="comu-field" /><span className="mt-2 block text-xs text-[#72675e]">Usa al menos 8 caracteres.</span></label>}</>}
          {!needsProfile && mode === "register" && <label className="flex items-start gap-3 py-2 text-xs leading-6"><input type="checkbox" name="terms" required className="mt-1 h-4 w-4 shrink-0 accent-[#252d28]" /><span>Acepto los <Link href="/comu/legal/terms" className="underline">términos</Link> y <Link href="/comu/legal/privacy" className="underline">aviso de privacidad</Link>.</span></label>}
          {error && <p role="alert" className="rounded-xl bg-[#eee2da] p-4 text-sm leading-6 text-[#783e30]">{error}</p>}
          <button disabled={busy} className="comu-button min-h-13 w-full">{busy ? "Un momento…" : action}</button>
        </form>}
        <nav aria-label="Opciones de acceso" className="mt-6 grid gap-2 text-center text-sm">{mode === "login" && <><Link className="py-3 underline underline-offset-4" href={"/comu/forgot-password" + suffix}>¿Olvidaste tu contraseña?</Link><Link className="py-3" href={"/comu/register" + suffix}>Crear cuenta</Link></>}{mode !== "login" && <Link className="py-3 underline underline-offset-4" href={comuLoginHref(next)}>{mode === "register" ? "¿Ya tienes cuenta? Iniciar sesión" : "Volver a iniciar sesión"}</Link>}{mode === "reset" && <Link className="py-3" href={"/comu/forgot-password" + suffix}>Solicitar otro enlace</Link>}<Link className="mt-3 py-3 text-[#72675e]" href="/comu">← Volver a COMU</Link></nav>
      </section>
    </div>
  </main>;
}
