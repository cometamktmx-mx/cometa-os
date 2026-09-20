import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalNext } from "@/lib/auth/safe-next";

export function copySupabaseCookies(source: NextResponse, target: NextResponse) {
  const headers = source.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.();

  if (cookies?.length) {
    cookies.forEach((cookie) => target.headers.append("set-cookie", cookie));
  } else {
    source.cookies.getAll().forEach((cookie) => {
      target.cookies.set(cookie.name, cookie.value, cookie);
    });
  }
  return target;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return copySupabaseCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    const destination = new URL(
      safeInternalNext(request.nextUrl.searchParams.get("next")),
      request.url,
    );
    url.pathname = destination.pathname;
    url.search = destination.search;
    return copySupabaseCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
