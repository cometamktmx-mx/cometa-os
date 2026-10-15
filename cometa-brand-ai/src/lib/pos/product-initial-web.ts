import "server-only";
import { assertWebAdministrator } from "./product-web";
import { emptyWebContent } from "./product-web-contract";
import type { PosRequestContext } from "./server";
import { randomUUID } from "node:crypto";
import { parseWebContent } from "./product-web-contract";

// Called only after an explicit own-store selection and canonical product save.
// Revision zero prevents a retry from replacing an editor's draft/publication.
export async function publishInitialProductWeb(context: PosRequestContext, productId: string) {
  assertWebAdministrator(context);
  const existing = await context.admin.from("pos_product_web_content")
    .select("revision").eq("brand_id", context.brand.id).eq("product_id", productId).maybeSingle();
  if (existing.error) throw new Error("INITIAL_WEB_LOOKUP_FAILED");
  if (existing.data) return;
  const product = await context.admin.from("pos_products").select("image_url,configuration,description")
    .eq("brand_slug", context.brand.slug).eq("id", productId).single();
  const variants = await context.admin.from("pos_product_variants").select("id,name,attributes,image_url")
    .eq("brand_slug", context.brand.slug).eq("product_id", productId).eq("active", true).order("id");
  if (product.error || !product.data || variants.error || !variants.data?.length) throw new Error("INITIAL_WEB_CATALOG_FAILED");
  const bucket = context.admin.storage.from("pos-products");
  const base = bucket.getPublicUrl("").data.publicUrl;
  const shared = new Map<string, string>();
  async function media(value: unknown): Promise<string | null> {
    if (typeof value !== "string" || !value.startsWith(base)) return null;
    const key = decodeURIComponent(value.slice(base.length)).replace(/^\//, "");
    const slug = context.brand.slug;
    if (!key.startsWith(slug + "/") || key.includes("..") || !/^[a-z0-9-]+\/(?:web\/)?[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return null;
    if (key.startsWith(slug + "/web/")) return key;
    if (shared.has(key)) return shared.get(key) ?? null;
    // Freeze legacy mutable POS photos into the existing immutable web namespace.
    const target = `${slug}/web/${productId}/${key.split("/").at(-1)}`;
    const copied = await bucket.copy(key, target);
    if (copied.error) {
      const present = await bucket.list(`${slug}/web/${productId}`, { search: target.split("/").at(-1) });
      if (present.error || !present.data?.some(x => x.name === target.split("/").at(-1))) throw new Error("INITIAL_WEB_MEDIA_FAILED");
    }
    shared.set(key, target); return target;
  }
  const doc = emptyWebContent();
  const cover = await media(product.data.image_url);
  const gallery: string[] = [];
  const configured: unknown = product.data.configuration?.initialWebPhotos;
  if (Array.isArray(configured)) for (const value of configured.slice(0, 11)) { const photo = await media(value); if (photo) gallery.push(photo); }
  const groups = new Map<string, typeof variants.data>();
  for (const variant of variants.data) {
    const color = variant.attributes?.color ?? variant.attributes?.colour ?? "";
    const name = typeof color === "string" ? color.slice(0, 80) : "";
    groups.set(name, [...(groups.get(name) ?? []), variant]);
  }
  for (const [name, members] of groups) {
    const photos = [...new Set([cover, ...await Promise.all(members.map(v => media(v.image_url))), ...gallery].filter((p): p is string => !!p))].slice(0, 12);
    doc.colors.push({ id: randomUUID(), name, variantIds: members.map(v => v.id), hex: "", swatchPath: "", photos: photos.map(path => ({ path, alt: "" })) });
  }
  if (product.data.description) doc.details.push({ id: randomUUID(), title: "Descripción", content: String(product.data.description).slice(0, 8000), enabled: true, open: true });
  const result = await context.admin.rpc("pos_save_product_web_m2", {
    p_brand_slug: context.brand.slug, p_product_id: productId, p_actor: context.user.userId,
    p_revision: 0, p_document: parseWebContent(doc, context.brand.slug), p_publish: true,
  });
  // Concurrent publication won. Never overwrite its content.
  if (result.error && !result.error.message.includes("CONFLICT")) throw new Error("INITIAL_WEB_PUBLISH_FAILED");
}
