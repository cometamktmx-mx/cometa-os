import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { createListing } from "@/lib/comu/listings";
import { requireSellerAccess } from "@/lib/comu/seller-access";

function fail(error: unknown) { const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500; const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_LISTING_FAILED"; return NextResponse.json({ ok: false, code, error: error instanceof Error ? error.message : "No se pudo completar la operación." }, { status }); }

export async function GET(request: Request) {
  try {
    requireComuFeature("catalog");
    const url = new URL(request.url); const sellerId = String(url.searchParams.get("sellerId") || ""); const access = await requireSellerAccess(sellerId);
    const { data, error } = await access.admin.from("comu_product_listings").select("*,comu_variant_listings(*)").eq("seller_id", sellerId).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, listings: data || [] });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { sellerId?: unknown; storefrontId?: unknown; productId?: unknown; publicSlug?: unknown; wholesaleEnabled?: unknown };
    const sellerId = String(body.sellerId || ""); const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
    const listing = await createListing(access.admin, { sellerId, storefrontId: String(body.storefrontId || ""), productId: String(body.productId || ""), publicSlug: typeof body.publicSlug === "string" ? body.publicSlug : undefined, wholesaleEnabled: body.wholesaleEnabled === true });
    return NextResponse.json({ ok: true, listing }, { status: 201 });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { sellerId?: unknown; listingId?: unknown; status?: unknown; variantId?: unknown; enabled?: unknown };
    const actor = await requireSellerAccess(String(body.sellerId || ""), ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
    const listingId = String(body.listingId || ""); const { data: listing } = await actor.admin.from("comu_product_listings").select("seller_id").eq("id", listingId).maybeSingle();
    if (!listing || listing.seller_id !== String(body.sellerId || "")) return NextResponse.json({ ok: false, code: "COMU_LISTING_NOT_FOUND" }, { status: 404 });
    if (typeof body.variantId === "string") {
      const { data, error } = await actor.admin.from("comu_variant_listings").update({ enabled: body.enabled !== false }).eq("listing_id", listingId).eq("variant_id", body.variantId).select("*").single(); if (error) throw error; return NextResponse.json({ ok: true, variant: data });
    }
    const status = String(body.status || ""); if (!["DRAFT", "PUBLISHED", "HIDDEN", "SUSPENDED", "REMOVED"].includes(status)) return NextResponse.json({ ok: false, code: "COMU_LISTING_STATUS_INVALID" }, { status: 400 });
    const { data, error } = await actor.admin.from("comu_product_listings").update({ status, published_at: status === "PUBLISHED" ? new Date().toISOString() : null }).eq("id", listingId).select("*").single(); if (error) throw error; return NextResponse.json({ ok: true, listing: data });
  } catch (error) { return fail(error); }
}
