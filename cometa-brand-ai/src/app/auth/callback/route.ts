import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { posReturnTo } from "@/lib/pos/navigation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = posReturnTo(request.nextUrl.searchParams.get("next"), request.nextUrl.searchParams.get("returnTo")) || "/entry";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // The installed SDK returns redirectType at runtime but omits it from
      // the public AuthTokenResponse type; narrow without widening the contract.
      const recovery = ("redirectType" in data && data.redirectType === "recovery") || request.nextUrl.searchParams.get("type") === "recovery";
      const response = NextResponse.redirect(new URL(recovery ? "/reset-password" : next, request.url));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", request.url)
  );
}
