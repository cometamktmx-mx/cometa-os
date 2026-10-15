import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { requireComuFeature } from "@/lib/comu/features";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const privateHeaders = { "Cache-Control": "private, no-store" };
function ownsMediaPath(path: string, sellerId: string, listingId: string) {
  return path.startsWith(`comu/${sellerId}/${listingId}/`) && !path.includes("..") && !path.includes("%");
}

export async function GET(request: Request) {
  try {
    requireComuFeature("catalog");
    const url = new URL(request.url), sellerId = url.searchParams.get("sellerId") || "", listingId = url.searchParams.get("listingId") || "";
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
    const { data: listing, error } = await access.admin.from("comu_product_listings").select("id").eq("id", listingId).eq("seller_id", sellerId).maybeSingle();
    if (error || !listing) return NextResponse.json({ ok: false }, { status: 404, headers: privateHeaders });
    const { data, error: mediaError } = await access.admin.from("comu_product_media").select("id,public_url,sort_order,is_primary").eq("listing_id", listingId).order("sort_order");
    if (mediaError) throw mediaError;
    return NextResponse.json({ ok: true, media: data || [] }, { headers: privateHeaders });
  } catch { return NextResponse.json({ ok: false, error: "No se pudieron consultar las imágenes." }, { status: 403, headers: privateHeaders }); }
}
export async function DELETE(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { sellerId?: string; mediaId?: string };
    const sellerId = String(body.sellerId || "");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
    const { data: media, error } = await access.admin.from("comu_product_media").select("id,listing_id,storage_path").eq("id", String(body.mediaId || "")).maybeSingle();
    if (error || !media || !ownsMediaPath(media.storage_path, sellerId, media.listing_id)) return NextResponse.json({ ok: false }, { status: 404, headers: privateHeaders });
    const { data: listing, error: listingError } = await access.admin.from("comu_product_listings").select("id").eq("id", media.listing_id).eq("seller_id", sellerId).maybeSingle();
    if (listingError || !listing) return NextResponse.json({ ok: false }, { status: 404, headers: privateHeaders });
    const { error: storageError } = await access.admin.storage.from("comu-products").remove([media.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await access.admin.from("comu_product_media").delete().eq("id", media.id).eq("listing_id", media.listing_id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch { return NextResponse.json({ ok: false, error: "No se pudo eliminar la imagen." }, { status: 403, headers: privateHeaders }); }
}

export async function POST(request: Request) {
  try {
    requireComuFeature("catalog"); const form = await request.formData(); const listingId = String(form.get("listingId") || ""); const sellerId = String(form.get("sellerId") || ""); const file = form.get("file");
    if (!(file instanceof File) || !allowed.has(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new PosApiError(400, "COMU_MEDIA_INVALID", "Usa JPG, PNG o WEBP de hasta 5 MB.");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]); const { data: listing } = await access.admin.from("comu_product_listings").select("id,seller_id").eq("id", listingId).eq("seller_id", sellerId).maybeSingle(); if (!listing) throw new PosApiError(404, "COMU_LISTING_NOT_FOUND", "El listing no existe.");
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"; const path = `comu/${sellerId}/${listingId}/${randomUUID()}.${extension}`; const admin = getAdminClient(); const { error: uploadError } = await admin.storage.from("comu-products").upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false }); if (uploadError) throw uploadError; const { data: publicUrl } = admin.storage.from("comu-products").getPublicUrl(path); const { data, error } = await access.admin.from("comu_product_media").insert({ listing_id: listingId, storage_path: path, public_url: publicUrl.publicUrl, media_type: "image", sort_order: 0, is_primary: true }).select("*").single(); if (error) { await admin.storage.from("comu-products").remove([path]); throw error; } return NextResponse.json({ ok: true, media: data }, { status: 201, headers: privateHeaders });
  } catch (error) { const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500; return NextResponse.json({ ok: false, code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_MEDIA_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar la imagen." }, { status, headers: privateHeaders }); }
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
    return NextResponse.json({ ok: true, media: data }, { headers: privateHeaders });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return NextResponse.json({ ok: false, code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_MEDIA_UPDATE_FAILED", error: error instanceof Error ? error.message : "No se pudo actualizar la imagen." }, { status, headers: privateHeaders });
  }
}
