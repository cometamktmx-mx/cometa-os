import { NextResponse } from "next/server";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { PosApiError } from "@/lib/pos/server";

const profiles = new Set(["LIGHT_TOP", "TSHIRT", "LEGGING", "JEANS", "SWEATSHIRT", "JACKET", "ACCESSORY", "CUSTOM"]);

async function productForSeller(admin: ReturnType<typeof import("@/lib/pos/server").getAdminClient>, sellerId: string, productId: string) {
  const { data: seller } = await admin.from("comu_sellers").select("brand_id").eq("id", sellerId).maybeSingle();
  const { data: product } = await admin.from("pos_products").select("id,brand_id").eq("id", productId).maybeSingle();
  if (!seller || !product || String(seller.brand_id) !== String(product.brand_id)) throw new PosApiError(403, "COMU_PRODUCT_ACCESS_DENIED", "El producto no pertenece a tu marca.");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const sellerId = url.searchParams.get("sellerId") || ""; const productId = url.searchParams.get("productId") || "";
    const access = await requireSellerAccess(sellerId); await productForSeller(access.admin, sellerId, productId);
    const { data, error } = await access.admin.from("comu_shipping_product_profiles").select("*").eq("product_id", productId).maybeSingle();
    if (error) throw new PosApiError(500, "COMU_SHIPPING_PROFILE_FAILED", "No se pudo cargar el perfil.");
    return NextResponse.json({ ok: true, profile: data });
  } catch (error) { const e = error instanceof PosApiError ? error : new PosApiError(500, "COMU_SHIPPING_PROFILE_FAILED", "No se pudo cargar el perfil."); return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status }); }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const sellerId = String(body.sellerId || ""); const productId = String(body.productId || "");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]); await productForSeller(access.admin, sellerId, productId);
    const profile = String(body.profile || "CUSTOM"); const weight = Number(body.overrideWeightG ?? body.estimatedWeightG ?? 250); const packing = Number(body.packingFactor ?? 1);
    if (!profiles.has(profile) || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(packing) || packing <= 0) throw new PosApiError(400, "COMU_SHIPPING_PROFILE_INVALID", "El perfil logístico no es válido.");
    const { data, error } = await access.admin.from("comu_shipping_product_profiles").upsert({ product_id: productId, profile, estimated_weight_g: Number(body.estimatedWeightG ?? weight), override_weight_g: body.overrideWeightG == null || body.overrideWeightG === "" ? null : weight, packing_factor: packing, package_class: String(body.packageClass || "TEXTILE_S"), updated_at: new Date().toISOString() }, { onConflict: "product_id" }).select("*").single();
    if (error) throw new PosApiError(409, "COMU_SHIPPING_PROFILE_FAILED", "No se pudo guardar el perfil.");
    return NextResponse.json({ ok: true, profile: data });
  } catch (error) { const e = error instanceof PosApiError ? error : new PosApiError(500, "COMU_SHIPPING_PROFILE_FAILED", "No se pudo guardar el perfil."); return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status }); }
}
