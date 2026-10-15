import { NextResponse } from "next/server";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import { slugifyBrand } from "@/lib/brand-resolver";
import { createAdminBrand, getAdminBrandSummaries, type AdminBrandStatus } from "@/lib/workspace/admin-brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ ok: true, brands: await getAdminBrandSummaries() }); }
  catch (error: unknown) { return brandContextErrorResponse(error); }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    const normalizedSlug = slugifyBrand(rawSlug);
    if (body.status !== "active" && body.status !== "inactive") return NextResponse.json({ ok: false, code: "ADMIN_BRAND_STATUS_INVALID", error: "Selecciona un estado inicial válido." }, { status: 400 });
    if (typeof body.enableOs !== "boolean") return NextResponse.json({ ok: false, code: "ADMIN_BRAND_OS_OPTION_INVALID", error: "La opción de Cometa OS no es válida." }, { status: 400 });
    const status: AdminBrandStatus = body.status;
    const enableOs = body.enableOs === true;
    if (!name || name.length > 120) return NextResponse.json({ ok: false, code: "ADMIN_BRAND_NAME_INVALID", error: "El nombre debe tener entre 1 y 120 caracteres." }, { status: 400 });
    if (!rawSlug || rawSlug !== normalizedSlug || !SLUG_PATTERN.test(rawSlug) || rawSlug.length > 80) return NextResponse.json({ ok: false, code: "ADMIN_BRAND_SLUG_INVALID", error: "El slug debe usar minúsculas, números y guiones, sin espacios." }, { status: 400 });
    const brand = await createAdminBrand({ name, slug: normalizedSlug, status, enableOs });
    return NextResponse.json({ ok: true, brand, destination: `/workspace/brands/${encodeURIComponent(brand.slug)}` }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ ok: false, code: "INVALID_JSON", error: "El cuerpo de la solicitud no es JSON válido." }, { status: 400 });
    return brandContextErrorResponse(error);
  }
}
