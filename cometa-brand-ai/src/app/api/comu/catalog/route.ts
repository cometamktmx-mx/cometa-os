import { NextResponse } from "next/server";
import { getPublicCatalog } from "@/lib/comu/public-catalog";
import { requireComuFeature } from "@/lib/comu/features";
import { getEligibleProducts, getProductVariants } from "@/lib/comu/catalog";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { getAvailableQuantities } from "@/lib/comu/inventory";

export async function GET(request: Request) {
  try {
    requireComuFeature("catalog");
    const url = new URL(request.url);
    const search = url.searchParams.get("q") || undefined;
    const sellerId = url.searchParams.get("sellerId");
    if (url.searchParams.get("scope") === "eligible" && sellerId) {
      const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
      const { data: seller, error } = await access.admin.from("comu_sellers").select("brand_slug").eq("id", sellerId).maybeSingle();
      if (error || !seller) return NextResponse.json({ ok: false, code: "COMU_SELLER_NOT_FOUND" }, { status: 404 });
      const products = await getEligibleProducts(access.admin, seller.brand_slug, search);
      const variants = await getProductVariants(access.admin, products.map((product) => product.id));
      const quantities = await getAvailableQuantities(access.admin, variants.map((variant) => variant.id));
      const inventory = Object.fromEntries(products.map((product) => [product.id, variants.filter((variant) => variant.product_id === product.id).reduce((sum, variant) => sum + Number(quantities.get(variant.id) || 0), 0)]));
      const { data: existing } = await access.admin.from("comu_product_listings").select("id,product_id,status,public_slug,wholesale_enabled").eq("seller_id", sellerId);
      return NextResponse.json({ ok: true, products, variants, inventory, existing: existing || [] });
    }
    return NextResponse.json({ ok: true, listings: await getPublicCatalog(search) }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
  }
  catch (error) { const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500; return NextResponse.json({ ok: false, code: "COMU_CATALOG_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar el catálogo." }, { status }); }
}
