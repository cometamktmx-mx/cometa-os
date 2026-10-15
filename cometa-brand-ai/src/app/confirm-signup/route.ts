import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalNext } from "@/lib/auth/safe-next";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  // Preserve a native form POST's Origin without forwarding the token-bearing URL.
  "Referrer-Policy": "strict-origin",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function escape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function destination(value: string | null) {
  // Signup has one destination; do not allow loops back to authentication routes.
  const next = safeInternalNext(value, "/onboarding/business");
  return next === "/onboarding/business" ? next : "/onboarding/business";
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function reportFailure(reason: "missing_token" | "invalid_request" | "origin_rejected" | "verifyOtp_error") {
  // Never log the token, URL, form body, cookies or raw provider error.
  console.warn("COMETA_SIGNUP_CONFIRM_FAILURE", { reason });
}

function page(token: string | null, next: string, message?: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Confirma tu correo | Cometa POS</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:#07101f;color:#e2e8f0;font:17px/1.6 Arial,Helvetica,sans-serif}main{width:100%;max-width:480px;padding:32px 24px;border:1px solid #26364c;border-radius:24px;background:#101c2e}header{color:#67e8f9;letter-spacing:3px;font-weight:800}small{display:block;letter-spacing:0;color:#a7b7cb;font-size:15px}h1{color:white;font-size:30px;line-height:1.2;margin:28px 0 16px}button{width:100%;min-height:52px;border:0;border-radius:12px;background:#67e8f9;color:#07101f;font:700 17px Arial;cursor:pointer;margin-top:16px;padding:16px}a{color:#8fdcff}button:focus-visible,a:focus-visible{outline:3px solid white;outline-offset:4px}.help{font-size:15px;color:#a7b7cb;margin-top:24px}</style></head><body><main><header>COMETA<small>Cometa POS</small></header><h1>Confirma tu correo</h1>
${message ? `<p role="alert">${escape(message)}</p>` : "<p>Activa tu cuenta para comenzar a configurar tu negocio.</p>"}
${token ? `<form method="post" action="/confirm-signup"><input type="hidden" name="token_hash" value="${escape(token)}"><input type="hidden" name="type" value="email"><input type="hidden" name="next" value="${escape(next)}"><button type="submit">Confirmar mi cuenta</button></form>` : ""}
<p class="help">Si ya confirmaste tu correo, <a href="/login?next=/onboarding/business">inicia sesión</a>. Si el enlace venció, solicita un nuevo correo desde <a href="/signup">Crear cuenta</a>.</p></main></body></html>`, { status, headers });
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash");
  const next = destination(request.nextUrl.searchParams.get("next"));
  if (!validToken(token) || request.nextUrl.searchParams.get("type") !== "email") {
    return page(null, next, "Este enlace de confirmación no es válido. Solicita un nuevo correo.", 400);
  }
  // GET/HEAD and email scanners never invoke Supabase verification.
  return page(token, next);
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    reportFailure("origin_rejected");
    return page(null, "/onboarding/business", "Abre el enlace de tu correo y pulsa Confirmar mi cuenta.", 403);
  }
  let form: FormData;
  try { form = await request.formData(); }
  catch { reportFailure("invalid_request"); return page(null, "/onboarding/business", "No pudimos leer la solicitud. Abre nuevamente el enlace del correo.", 400); }
  const token = form.get("token_hash");
  const next = destination(typeof form.get("next") === "string" ? String(form.get("next")) : null);
  if (!validToken(token) || form.get("type") !== "email") {
    reportFailure(token === null || token === "" ? "missing_token" : "invalid_request");
    return page(null, next, "Este enlace de confirmación no es válido. Solicita un nuevo correo.", 400);
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: "email" });
    if (error || !data.session) {
      reportFailure("verifyOtp_error");
      return page(null, next, "Este enlace venció, ya fue utilizado o no es válido. Si ya confirmaste tu cuenta, inicia sesión; de lo contrario, solicita un nuevo correo.", 400);
    }
    const response = NextResponse.redirect(new URL(next, request.url), 303);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    reportFailure("verifyOtp_error");
    return page(token, next, "No pudimos confirmar tu cuenta en este momento. Inténtalo nuevamente.", 503);
  }
}
