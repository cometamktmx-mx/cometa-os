import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "./lib/supabase/middleware";

const publicRoutes = ["/", "/login"];

const protectedAdminPages = [
  "/sales-ai/settings",
  "/sales-ai/admin",
];

const protectedAdminApis = [
  "/api/sales-ai/settings",
];

function isPublicRoute(pathname: string) {
  return publicRoutes.includes(pathname);
}

function isProtectedAdminPage(pathname: string) {
  return protectedAdminPages.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isProtectedAdminApi(pathname: string) {
  return protectedAdminApis.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function parseCsv(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isCometaAdmin(user: { id?: string; email?: string | null } | null) {
  if (!user) return false;

  const adminEmails = parseCsv(process.env.COMETA_ADMIN_EMAILS);
  const adminUserIds = parseCsv(process.env.COMETA_ADMIN_USER_IDS);

  const userEmail = String(user.email || "").trim().toLowerCase();
  const userId = String(user.id || "").trim().toLowerCase();

  if (!adminEmails.length && !adminUserIds.length) {
    return false;
  }

  return adminEmails.includes(userEmail) || adminUserIds.includes(userId);
}

async function getProxyUser(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({
    request,
  });

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "PROXY AUTH ERROR: faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );

    return {
      user: null,
      response,
    };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.warn("PROXY AUTH WARNING:", error.message);
  }

  return {
    user,
    response,
  };
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookie);
  });

  return target;
}

function redirectToAccessDenied(
  request: NextRequest,
  authResponse: NextResponse
) {
  const url = request.nextUrl.clone();

  url.pathname = "/access-denied";
  url.searchParams.set("from", request.nextUrl.pathname);

  const redirectResponse = NextResponse.redirect(url);

  return copyCookies(authResponse, redirectResponse);
}

function forbiddenJson(authResponse: NextResponse) {
  const response = NextResponse.json(
    {
      ok: false,
      error: "Forbidden. Esta ruta es solo para administradores de Cometa.",
    },
    { status: 403 }
  );

  return copyCookies(authResponse, response);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  console.log("PROXY ACTIVO:", pathname);

  /**
   * API técnica protegida.
   * Esto bloquea llamadas directas aunque el cliente intente usar la consola.
   */
  if (isProtectedAdminApi(pathname)) {
    const { user, response } = await getProxyUser(request);

    if (!isCometaAdmin(user)) {
      return forbiddenJson(response);
    }

    return response;
  }

  /**
   * Otras APIs pasan.
   * La seguridad específica por marca/cliente se refuerza dentro de cada route.ts.
   */
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  /**
   * Landing pública y login público.
   */
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  /**
   * Páginas internas Cometa.
   * Cliente normal no puede entrar manualmente.
   */
  if (isProtectedAdminPage(pathname)) {
    const { user, response } = await getProxyUser(request);

    if (!user) {
      const loginUrl = request.nextUrl.clone();

      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);

      const redirectResponse = NextResponse.redirect(loginUrl);

      return copyCookies(response, redirectResponse);
    }

    if (!isCometaAdmin(user)) {
      return redirectToAccessDenied(request, response);
    }

    return response;
  }

  /**
   * Todo lo demás pasa por Supabase Auth:
   * /workspace
   * /brand
   * /sales-ai
   * /cometa-os
   * /new-analysis
   * /generate-strategy
   * /nova
   */
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};