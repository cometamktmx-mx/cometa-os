import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeInviteNext(value: string | null) {
  if (value === "/invite" || value?.startsWith("/invite?")) {
    return value;
  }

  return "/invite";
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const requestedType = request.nextUrl.searchParams.get("type");
  const nextValue = request.nextUrl.searchParams.get("next");

  if (requestedType === "email") {
    const url = new URL("/confirm-signup", request.url);
    if (tokenHash) url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", "email");
    url.searchParams.set("next", "/onboarding/business");
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  // OAuth and other PKCE flows continue through /auth/callback.
  // Signup GETs only display a form; invitations retain their existing flow.
  if (tokenHash && requestedType === "invite") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: requestedType,
    });

    if (!error) {
      const next = safeInviteNext(nextValue);

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=email_confirmation_failed", request.url)
  );
}
