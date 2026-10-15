import { BrandOsGuardError } from "@/lib/brand-os/server";
import { readBrandModules, setOnlineStoreService } from "@/lib/workspace/brand-modules";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
type Context = { params: Promise<{ brandSlug: string }> };
function failure(error: unknown) {
  if (error instanceof BrandOsGuardError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers });
  if (error instanceof SyntaxError) return Response.json({ ok: false, error: "JSON no válido." }, { status: 400, headers });
  return Response.json({ ok: false, error: "No se pudo consultar la marca." }, { status: 500, headers });
}
export async function GET(_request: Request, context: Context) {
  try { return Response.json({ ok: true, modules: await readBrandModules((await context.params).brandSlug) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new BrandOsGuardError(403, "ORIGIN_DENIED", "Origen no permitido.");
    return Response.json({ ok: true, modules: await setOnlineStoreService((await context.params).brandSlug, await request.json()) }, { headers });
  } catch (error) { return failure(error); }
}
