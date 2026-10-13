import "server-only";
import { requireAdminWorkspace } from "./admin-brands";
import { getAdminClient } from "@/lib/pos/server";
import { getBrandOsAccess } from "@/lib/brand-os/access";
import { getPassivePosProductAvailability } from "@/lib/pos/access";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { assertBrandSlug, readOnlineStoreService, type OnlineStoreService } from "./online-store-access";

export type BrandModules = {
  brand: { id: string; slug: string; name: string; status: string };
  os: { status: string };
  pos: { state: string; lifecycleStatus: string | null; reason: string | null; planCode?: string | null };
  comu: { status: string; verification: string | null; storefront: string | null };
  store: OnlineStoreService | null;
  members?: Array<{ userId: string; name: string; role: string; status: string; context: "OS/POS" | "COMU" }> | null;
  publication?: { hasPublishedAppearance: boolean; publishedRevision: number | null } | null;
};

export async function readBrandModules(slug: string): Promise<BrandModules> {
  await requireAdminWorkspace();
  assertBrandSlug(slug);
  const client = getAdminClient();
  const { data: brand, error } = await client.from("brands").select("id,slug,name,status").eq("slug", slug).maybeSingle();
  if (error) throw new BrandOsGuardError(503, "BRAND_LOOKUP_FAILED", "No se pudo consultar la marca.");
  if (!brand) throw new BrandOsGuardError(404, "BRAND_NOT_FOUND", "Marca no disponible.");
  const [os, pos, seller, store] = await Promise.all([
    getBrandOsAccess(client, slug).then(value => ({ status: value.status })).catch(() => ({ status: "unknown" })),
    getPassivePosProductAvailability(slug),
    client.from("comu_sellers").select("id,status,verification_status").eq("brand_id", brand.id).eq("brand_slug", slug).maybeSingle(),
    readOnlineStoreService(client, brand.id).catch(() => null),
  ]);
  let comu: BrandModules["comu"] = { status: "not_configured", verification: null, storefront: null };
  if (seller.error) comu = { status: "unknown", verification: null, storefront: null };
  else if (seller.data) {
    const storefront = await client.from("comu_storefronts").select("status").eq("seller_id", seller.data.id).maybeSingle();
    comu = { status: String(seller.data.status), verification: String(seller.data.verification_status), storefront: storefront.error ? "unknown" : storefront.data?.status ?? null };
  }
  const [memberships, appearance, sellerMemberships] = await Promise.all([
    client.from("user_brand_access").select("user_id,access_role,status").eq("brand_slug", slug),
    client.from("brand_storefront_appearance").select("published_revision").eq("brand_id", brand.id).maybeSingle(),
    seller.data ? client.from("comu_seller_memberships").select("user_id,role,active").eq("seller_id", seller.data.id) : Promise.resolve({ data: [], error: null }),
  ]);
  let members: BrandModules["members"] = null;
  if (!memberships.error && !sellerMemberships.error) {
    const rows = memberships.data || [];
    const sellerRows = sellerMemberships.data || [];
    const ids = [...new Set([...rows, ...sellerRows].map(row => row.user_id))];
    const profiles = ids.length ? await client.from("user_profiles").select("user_id,full_name").in("user_id", ids) : { data: [], error: null };
    const name = (id: string) => String(profiles.data?.find(profile => profile.user_id === id)?.full_name || "Perfil sin nombre");
    if (!profiles.error) members = [
      ...rows.map(row => ({ userId: String(row.user_id), name: name(row.user_id), role: String(row.access_role), status: String(row.status), context: "OS/POS" as const })),
      ...sellerRows.map(row => ({ userId: String(row.user_id), name: name(row.user_id), role: String(row.role), status: row.active ? "active" : "inactive", context: "COMU" as const })),
    ];
  }
  return { brand: { id: String(brand.id), slug: String(brand.slug), name: String(brand.name), status: String(brand.status) }, os,
    pos: { state: pos.state, lifecycleStatus: pos.lifecycleStatus, reason: pos.reason, planCode: pos.planCode }, comu, store, members,
    publication: appearance.error ? null : { hasPublishedAppearance: Number(appearance.data?.published_revision || 0) > 0, publishedRevision: appearance.data?.published_revision ?? null } };
}

export async function setOnlineStoreService(slug: string, body: unknown) {
  const actor = await requireAdminWorkspace();
  assertBrandSlug(slug);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !["status", "expectedRevision"].includes(key)) ||
      !["enabled", "suspended"].includes(String(input.status)) ||
      !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0 || Number(input.expectedRevision) > 2147483646) throw invalid();
  const { error } = await getAdminClient().rpc("brand_online_store_set_access_a1", {
    p_brand_slug: slug, p_actor_user_id: actor.userId, p_status: input.status, p_expected_revision: input.expectedRevision,
  });
  if (error) {
    const code = error.message;
    if (code.includes("STORE_ACCESS_CONFLICT")) throw new BrandOsGuardError(409, "STORE_ACCESS_CONFLICT", "Otro administrador cambió el servicio. Actualiza la ficha antes de continuar.");
    if (code.includes("ADMIN_REQUIRED")) throw new BrandOsGuardError(403, "ADMIN_REQUIRED", "Se requiere un administrador activo.");
    if (code.includes("BRAND_NOT_FOUND")) throw new BrandOsGuardError(404, "BRAND_NOT_FOUND", "Marca no disponible.");
    if (code.includes("BRAND_INACTIVE") || code.includes("STORE_NOT_ENABLED")) throw new BrandOsGuardError(409, "STORE_ACCESS_STATE_INVALID", "El estado de la marca o del servicio no permite este cambio.");
    throw new BrandOsGuardError(503, "STORE_ACCESS_UPDATE_FAILED", "No se pudo confirmar el cambio. Actualiza la ficha para comprobar su estado.");
  }
  return readBrandModules(slug);
}
function invalid() { return new BrandOsGuardError(400, "INVALID_REQUEST", "Indica un estado y una revisión válidos."); }
