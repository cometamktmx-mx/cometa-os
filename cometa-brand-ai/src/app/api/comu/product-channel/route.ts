import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { createListing } from "@/lib/comu/listings";
import { requireBrandAccess } from "@/lib/brand-os/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";

function fail(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "COMU_PRODUCT_CHANNEL_FAILED";
  return NextResponse.json({ ok: false, code, message: error instanceof Error ? error.message : "No se pudo consultar el canal COMU." }, { status });
}

async function context(request: Request) {
  const url = new URL(request.url);
  const brandSlug = String(url.searchParams.get("brandSlug") || "").trim();
  const productId = String(url.searchParams.get("productId") || "").trim();
  const access = await requireBrandAccess(brandSlug);
  const role = (access.accessRole || "").toLowerCase();
  if (!access.isPlatformAdmin && !["owner", "admin"].includes(role)) throw new PosApiError(403, "COMU_PRODUCT_CHANNEL_ACCESS_DENIED", "No tienes permisos para administrar los canales de este producto.");
  const admin = getAdminClient();
  const { data: product, error: productError } = await admin.from("pos_products").select("id,brand_id,brand_slug").eq("id", productId).maybeSingle();
  if (productError) throw productError;
  if (!product || String(product.brand_id) !== String(access.brand.id) || product.brand_slug !== access.brand.slug) throw new PosApiError(403, "COMU_PRODUCT_BRAND_MISMATCH", "El producto no pertenece a esta marca.");
  const { data: seller } = await admin.from("comu_sellers").select("id,status,verification_status").eq("brand_id", access.brand.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const { data: profile } = await admin.from("comu_shipping_product_profiles").select("profile,estimated_weight_g,package_class").eq("product_id", productId).maybeSingle();
  const listing = seller ? (await admin.from("comu_product_listings").select("id,status,wholesale_enabled,storefront_id,product_id").eq("seller_id", seller.id).eq("product_id", productId).maybeSingle()).data : null;
  return { admin, access, product, seller, listing, profile };
}

export async function GET(request: Request) {
  try {
    requireComuFeature("catalog");
    const { admin, seller, listing, profile } = await context(request);
    const productId = new URL(request.url).searchParams.get("productId") || "";
    const { data: variants } = await admin.from("pos_product_variants").select("id").eq("product_id", productId).eq("active", true);
    const variantIds = (variants || []).map((variant) => variant.id);
    const { data: inventory } = variantIds.length ? await admin.from("pos_inventory").select("quantity,reserved_quantity").in("variant_id", variantIds) : { data: [] };
    const quantity = (inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const reserved = (inventory || []).reduce((sum, row) => sum + Number(row.reserved_quantity || 0), 0);
    return NextResponse.json({ ok: true, active: seller?.status === "ACTIVE" && seller.verification_status === "VERIFIED", listing, profile, inventory: { quantity, reserved_quantity: reserved, available_quantity: quantity - reserved } });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { brandSlug?: unknown; productId?: unknown; action?: unknown };
    const requestUrl = new URL(request.url);
    requestUrl.searchParams.set("brandSlug", String(body.brandSlug || ""));
    requestUrl.searchParams.set("productId", String(body.productId || ""));
    const { admin, seller, listing } = await context(new Request(requestUrl));
    if (!seller || seller.status !== "ACTIVE" || seller.verification_status !== "VERIFIED") throw new PosApiError(409, "COMU_ACTIVATION_REQUIRED", "Activa COMU antes de publicar productos.");
    const action = String(body.action || "");
    if (action === "unpublish") {
      if (!listing) return NextResponse.json({ ok: true, listing: null });
      const { data, error } = await admin.from("comu_product_listings").update({ status: "HIDDEN", published_at: null, updated_at: new Date().toISOString() }).eq("id", listing.id).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, listing: data });
    }
    if (!listing) {
      const { data: storefront } = await admin.from("comu_storefronts").select("id").eq("seller_id", seller.id).maybeSingle();
      if (!storefront) throw new PosApiError(409, "COMU_STOREFRONT_REQUIRED", "Configura tu tienda COMU antes de publicar productos.");
      const created = await createListing(admin, { sellerId: seller.id, storefrontId: storefront.id, productId: String(body.productId || "") });
      const { data, error } = await admin.from("comu_product_listings").update({ status: "PUBLISHED", published_at: new Date().toISOString() }).eq("id", created.id).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, listing: data });
    }
    const { data, error } = await admin.from("comu_product_listings").update({ status: "PUBLISHED", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", listing.id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, listing: data });
  } catch (error) { return fail(error); }
}
