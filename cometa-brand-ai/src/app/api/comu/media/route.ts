import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { requireComuFeature } from "@/lib/comu/features";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    requireComuFeature("catalog"); const form = await request.formData(); const listingId = String(form.get("listingId") || ""); const sellerId = String(form.get("sellerId") || ""); const file = form.get("file");
    if (!(file instanceof File) || !allowed.has(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new PosApiError(400, "COMU_MEDIA_INVALID", "Usa JPG, PNG o WEBP de hasta 5 MB.");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]); const { data: listing } = await access.admin.from("comu_product_listings").select("id,seller_id").eq("id", listingId).eq("seller_id", sellerId).maybeSingle(); if (!listing) throw new PosApiError(404, "COMU_LISTING_NOT_FOUND", "El listing no existe.");
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"; const path = `comu/${sellerId}/${listingId}/${randomUUID()}.${extension}`; const admin = getAdminClient(); const { error: uploadError } = await admin.storage.from("comu-products").upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false }); if (uploadError) throw uploadError; const { data: publicUrl } = admin.storage.from("comu-products").getPublicUrl(path); const { data, error } = await access.admin.from("comu_product_media").insert({ listing_id: listingId, storage_path: path, public_url: publicUrl.publicUrl, media_type: "image", sort_order: 0, is_primary: true }).select("*").single(); if (error) throw error; return NextResponse.json({ ok: true, media: data }, { status: 201 });
  } catch (error) { const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500; return NextResponse.json({ ok: false, code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_MEDIA_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar la imagen." }, { status }); }
}

export async function PATCH(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { sellerId?: unknown; mediaId?: unknown; sortOrder?: unknown; isPrimary?: unknown };
    const sellerId = String(body.sellerId || "");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
    const mediaId = String(body.mediaId || "");
    const { data: media } = await access.admin.from("comu_product_media").select("id,listing_id,comu_product_listings!inner(seller_id)").eq("id", mediaId).maybeSingle();
    const listing = media?.comu_product_listings as { seller_id?: string } | null;
    if (!media || listing?.seller_id !== sellerId) throw new PosApiError(404, "COMU_MEDIA_NOT_FOUND", "La imagen no existe.");
    const updates: { sort_order?: number; is_primary?: boolean } = {};
    if (typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder) && body.sortOrder >= 0) updates.sort_order = body.sortOrder;
    if (typeof body.isPrimary === "boolean") updates.is_primary = body.isPrimary;
    const { data, error } = await access.admin.from("comu_product_media").update(updates).eq("id", mediaId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, media: data });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return NextResponse.json({ ok: false, code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_MEDIA_UPDATE_FAILED", error: error instanceof Error ? error.message : "No se pudo actualizar la imagen." }, { status });
  }
}
