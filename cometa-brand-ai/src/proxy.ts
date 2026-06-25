import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

const publicRoutes = ["/", "/login"];

function isPublicRoute(pathname: string) {
  return publicRoutes.includes(pathname);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  console.log("PROXY ACTIVO:", pathname);

  // APIs: las dejamos pasar.
  // La seguridad específica de cada API se maneja dentro de cada route.ts si aplica.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Landing pública y login público
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Todo lo demás pasa por Supabase Auth:
  // /workspace
  // /brand
  // /sales-ai
  // /cometa-os
  // /new-analysis
  // /generate-strategy
  // /nova
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};