import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeInternalNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/onboarding/business";
}

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

  // OAuth and other PKCE flows continue through /auth/callback. Only the two
  // token-hash email flows owned by this application are accepted here.
  if (tokenHash && (requestedType === "email" || requestedType === "invite")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: requestedType,
    });

    if (!error) {
      const next = requestedType === "invite"
        ? safeInviteNext(nextValue)
        : safeInternalNext(nextValue);

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=email_confirmation_failed", request.url)
  );
}
