import { randomUUID } from "node:crypto";
import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, readJsonBody, requirePosContext, type PosRequestContext } from "@/lib/pos/server";
import { requirePosPermission } from "@/lib/pos/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "pos-brand-assets";
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const context = requireSettings(await requirePosContext(getBrandSlugFromUrl(request)));
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new PosApiError(400, "POS_BRAND_LOGO_REQUIRED", "Selecciona un logotipo.");
    if (file.size > MAX_SIZE) throw new PosApiError(413, "POS_BRAND_LOGO_TOO_LARGE", "El logotipo no puede superar 5 MB.");
    if (!TYPES.has(file.type)) throw new PosApiError(415, "POS_BRAND_LOGO_TYPE_INVALID", "Usa JPG, PNG o WEBP.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detect(bytes);
    if (!detected || detected.mime !== file.type) throw new PosApiError(415, "POS_BRAND_LOGO_SIGNATURE_INVALID", "El contenido no coincide con el tipo de imagen.");
    const path = `${context.brand.slug}/logo/${randomUUID()}.${detected.ext}`;
    const upload = await context.admin.storage.from(BUCKET).upload(path, bytes, { contentType: detected.mime, cacheControl: "3600", upsert: false });
    if (upload.error) throw new PosApiError(500, "POS_BRAND_LOGO_UPLOAD_FAILED", "No se pudo subir el logotipo.");
    const url = context.admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const previous = await context.admin.from("pos_branding").select("logo_url").eq("brand_slug", context.brand.slug).maybeSingle();
    const saved = await context.admin.from("pos_branding").update({ logo_url: url, updated_at: new Date().toISOString() }).eq("brand_slug", context.brand.slug);
    if (saved.error) { await context.admin.storage.from(BUCKET).remove([path]); throw saved.error; }
    const previousPath = ownedPath(previous.data?.logo_url, context.brand.slug);
    if (previousPath) await context.admin.storage.from(BUCKET).remove([previousPath]);
    return ok({ logoUrl: url }, 201);
  } catch (error) { return handlePosError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = requireSettings(await requirePosContext(getBrandSlugFromUrl(request)));
    const current = await context.admin.from("pos_branding").select("logo_url").eq("brand_slug", context.brand.slug).maybeSingle();
    if (current.error) throw current.error;
    const result = await context.admin.from("pos_branding").update({ logo_url: null, updated_at: new Date().toISOString() }).eq("brand_slug", context.brand.slug);
    if (result.error) throw result.error;
    const path = ownedPath(current.data?.logo_url, context.brand.slug);
    if (path) await context.admin.storage.from(BUCKET).remove([path]);
    return ok({ deleted: Boolean(path) });
  } catch (error) { return handlePosError(error); }
}

function requireSettings(context: PosRequestContext): PosRequestContext { requirePosPermission(context, "pos.settings.manage"); return context; }
function detect(bytes: Uint8Array) { if (bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{mime:"image/jpeg",ext:"jpg" as const}; if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return{mime:"image/png",ext:"png" as const}; if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return{mime:"image/webp",ext:"webp" as const}; return null; }
function ownedPath(value: unknown, brandSlug: string) { if(typeof value!=="string"||!value)return null; try { const url=new URL(value); const marker=`/storage/v1/object/public/${BUCKET}/`; if(!url.pathname.includes(marker))return null; const path=decodeURIComponent(url.pathname.split(marker)[1]); const parts=path.split("/"); return parts.length===3&&parts[0]===brandSlug&&parts[1]==="logo"&&/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(parts[2])?path:null; } catch { return null; } }
