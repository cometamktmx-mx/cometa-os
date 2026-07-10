import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "./lib/supabase/middleware";

const publicRoutes = ["/", "/login"];

const protectedAdminPages = [
  "/workspace/admin",
  "/sales-ai/settings",
  "/sales-ai/admin",
];

const protectedAdminApis = [
  "/api/admin",
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

function isCometaAdmin(
  user: {
    id?: string;
    email?: string | null;
  } | null
) {
  if (!user) return false;

  const adminEmails = parseCsv(process.env.COMETA_ADMIN_EMAILS);
  const adminUserIds = parseCsv(process.env.COMETA_ADMIN_USER_IDS);

  const userEmail = String(user.email || "")
    .trim()
    .toLowerCase();

  const userId = String(user.id || "")
    .trim()
    .toLowerCase();

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

function redirectToLogin(
  request: NextRequest,
  authResponse: NextResponse
) {
  const loginUrl = request.nextUrl.clone();

  loginUrl.pathname = "/login";
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  const redirectResponse = NextResponse.redirect(loginUrl);

  return copyCookies(authResponse, redirectResponse);
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

function unauthorizedJson(authResponse: NextResponse) {
  const response = NextResponse.json(
    {
      ok: false,
      error: "No autorizado. Inicia sesión.",
    },
    {
      status: 401,
    }
  );

  return copyCookies(authResponse, response);
}

function forbiddenJson(authResponse: NextResponse) {
  const response = NextResponse.json(
    {
      ok: false,
      error: "Forbidden. Esta ruta es solo para administradores de Cometa.",
    },
    {
      status: 403,
    }
  );

  return copyCookies(authResponse, response);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  console.log("PROXY ACTIVO:", pathname);

  /**
   * APIs administrativas.
   *
   * Protege:
   * /api/admin/access
   * /api/admin/whatsapp-connections
   * cualquier futura ruta dentro de /api/admin
   */
  if (isProtectedAdminApi(pathname)) {
    const { user, response } = await getProxyUser(request);

    if (!user) {
      return unauthorizedJson(response);
    }

    if (!isCometaAdmin(user)) {
      return forbiddenJson(response);
    }

    return response;
  }

  /**
   * El resto de APIs continúa hacia su propia validación interna.
   *
   * Ejemplos:
   * /api/webhooks/whatsapp
   * /api/sales-ai/agent-run
   * /api/mercury/...
   */
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  /**
   * Landing y login públicos.
   */
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  /**
   * Páginas administrativas exclusivas de Cometa.
   *
   * /workspace/admin
   * /workspace/admin/whatsapp-connections
   * /sales-ai/settings
   * /sales-ai/admin
   */
  if (isProtectedAdminPage(pathname)) {
    const { user, response } = await getProxyUser(request);

    if (!user) {
      return redirectToLogin(request, response);
    }

    if (!isCometaAdmin(user)) {
      return redirectToAccessDenied(request, response);
    }

    return response;
  }

  /**
   * Todo lo demás pasa por Supabase Auth.
   *
   * /workspace
   * /brand
   * /sales-ai
   * /cometa-os
   * /new-analysis
   * /generate-strategy
   * /nova
   * /mercury
   */
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};