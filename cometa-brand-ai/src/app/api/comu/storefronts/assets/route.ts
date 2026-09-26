import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { requireSellerAccess } from "@/lib/comu/seller-access";

const BUCKET = "comu-products";
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
type AssetKind = "logo" | "banner";

export async function POST(request: Request) {
  try {
    requireComuFeature("catalog");
    const form = await request.formData();
    const sellerId = String(form.get("sellerId") || "");
    const kind = String(form.get("kind") || "") as AssetKind;
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) return fail("Selecciona una imagen.", 400);
    if (!sellerId || !["logo", "banner"].includes(kind)) return fail("No se pudo identificar la imagen.", 400);
    if (file.size > MAX_SIZE) return fail("La imagen no puede superar 5 MB.", 413);
    if (!TYPES.has(file.type)) return fail("Usa JPG, PNG o WEBP.", 415);
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN"]);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detect(bytes);
    if (!detected || detected.mime !== file.type) return fail("El contenido no coincide con el tipo de imagen.", 415);
    const path = `comu/${sellerId}/identity/${kind}/${randomUUID()}.${detected.ext}`;
    const storage = access.admin.storage.from(BUCKET);
    const upload = await storage.upload(path, bytes, { contentType: detected.mime, cacheControl: "3600", upsert: false });
    if (upload.error) throw upload.error;
    const publicUrl = storage.getPublicUrl(path).data.publicUrl;
    const { data: current, error: currentError } = await access.admin.from("comu_storefronts").select("id,logo_url,cover_url").eq("seller_id", sellerId).maybeSingle();
    if (currentError || !current) { await storage.remove([path]); return fail("No se encontró la tienda.", 404); }
    const column = kind === "logo" ? "logo_url" : "cover_url";
    const previous = kind === "logo" ? current.logo_url : current.cover_url;
    const { error: updateError } = await access.admin.from("comu_storefronts").update({ [column]: publicUrl, updated_at: new Date().toISOString() }).eq("id", current.id);
    if (updateError) { await storage.remove([path]); throw updateError; }
    const previousPath = ownedPath(previous, sellerId, kind);
    if (previousPath) await storage.remove([previousPath]);
    return NextResponse.json({ ok: true, kind, url: publicUrl });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudo guardar la imagen.", 500);
  }
}

function fail(message: string, status: number) { return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_ASSET_FAILED", error: message }, { status }); }
function detect(bytes: Uint8Array) { if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: "image/jpeg", ext: "jpg" }; if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { mime: "image/png", ext: "png" }; if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" }; return null; }
function ownedPath(value: unknown, sellerId: string, kind: AssetKind) { if (typeof value !== "string" || !value) return null; try { const url = new URL(value); const marker = `/storage/v1/object/public/${BUCKET}/`; if (!url.pathname.includes(marker)) return null; const path = decodeURIComponent(url.pathname.split(marker)[1]); const parts = path.split("/"); return parts.length === 5 && parts[0] === "comu" && parts[1] === sellerId && parts[2] === "identity" && parts[3] === kind && /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(parts[4]) ? path : null; } catch { return null; } }
