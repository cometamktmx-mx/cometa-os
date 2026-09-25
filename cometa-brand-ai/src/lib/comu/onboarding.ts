import { PosApiError } from "@/lib/pos/server";
import { requireBrandAccess } from "@/lib/brand-os/server";
import { getAdminClient } from "@/lib/pos/server";
import { isFoodProfile } from "@/lib/pos/surface-policy";
import { getEligibleProducts } from "./catalog";
import { createListing } from "./listings";
import { slugifyComu } from "./sellers";

const RESERVED_SLUGS = new Set(["admin", "api", "cart", "checkout", "login", "comu", "seller", "store", "www"]);
const PROFILE_DEFAULTS: Record<string, { weight: number; packageClass: string }> = {
  LIGHT_TOP: { weight: 180, packageClass: "TEXTILE_XS" },
  TSHIRT: { weight: 250, packageClass: "TEXTILE_S" },
  LEGGING: { weight: 320, packageClass: "TEXTILE_S" },
  JEANS: { weight: 700, packageClass: "TEXTILE_M" },
  SWEATSHIRT: { weight: 650, packageClass: "TEXTILE_M" },
  JACKET: { weight: 900, packageClass: "TEXTILE_L" },
  ACCESSORY: { weight: 150, packageClass: "TEXTILE_XS" },
  CUSTOM: { weight: 250, packageClass: "TEXTILE_S" },
};
const PROFILE_CODES = new Set(Object.keys(PROFILE_DEFAULTS));

type BrandAccess = Awaited<ReturnType<typeof requireBrandAccess>>;
type Admin = ReturnType<typeof getAdminClient>;

function assertActivationAccess(access: BrandAccess) {
  const role = (access.accessRole || "").toLowerCase();
  if (!access.isPlatformAdmin && !["owner", "admin"].includes(role)) {
    throw new PosApiError(403, "COMU_ACTIVATION_ACCESS_DENIED", "Solo el propietario o administrador de la marca puede activar COMU.");
  }
}

async function resolveBrandForOnboarding(brandSlug: string) {
  const access = await requireBrandAccess(brandSlug);
  assertActivationAccess(access);
  const admin = getAdminClient();
  const { data: profile } = await admin.from("pos_business_profiles").select("profile_code").eq("brand_slug", access.brand.slug).maybeSingle();
  const { data: products, error: productsError } = await admin.from("pos_products").select("id").eq("brand_slug", access.brand.slug).eq("active", true).eq("sellable", true).limit(1);
  if (productsError) throw new PosApiError(500, "COMU_ACTIVATION_PRODUCTS_FAILED", "No se pudo validar el catálogo POS.");
  return { access, admin, foodOnly: isFoodProfile(profile?.profile_code), hasPosProducts: Boolean(products?.length) };
}

export async function getOnboardingSnapshot(brandSlug: string) {
  const { access, admin, foodOnly, hasPosProducts } = await resolveBrandForOnboarding(brandSlug);
  const [{ data: seller }, products] = await Promise.all([
    admin.from("comu_sellers").select("*").eq("brand_id", access.brand.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    getEligibleProducts(admin, access.brand.slug),
  ]);
  let storefront = null;
  let listings: Array<{ id: string; product_id: string; status: string; public_slug: string }> = [];
  if (seller) {
    const [{ data: storefrontRow }, { data: listingRows }] = await Promise.all([
      admin.from("comu_storefronts").select("*").eq("seller_id", seller.id).maybeSingle(),
      admin.from("comu_product_listings").select("id,product_id,status,public_slug").eq("seller_id", seller.id),
    ]);
    storefront = storefrontRow;
    listings = listingRows || [];
  }
  return {
    brand: { id: access.brand.id, slug: access.brand.slug, name: access.brand.name },
    eligible: !foodOnly && hasPosProducts,
    foodOnly,
    seller,
    storefront,
    products,
    listings,
    selectedProductIds: listings.filter((listing) => listing.status !== "REMOVED").map((listing) => listing.product_id),
  };
}

function validateSlug(value: string) {
  const slug = slugifyComu(value);
  if (!slug || slug.length < 3 || slug.length > 64 || RESERVED_SLUGS.has(slug)) {
    throw new PosApiError(400, "COMU_SLUG_INVALID", "Elige un slug público válido y disponible.");
  }
  return slug;
}

async function ensureSeller(admin: Admin, access: BrandAccess, input: { publicName: string; slug: string; description?: string; contact?: string }) {
  const slug = validateSlug(input.slug || input.publicName);
  const { data: collision } = await admin.from("comu_sellers").select("id,brand_id").eq("slug", slug).maybeSingle();
  if (collision && collision.brand_id !== access.brand.id) throw new PosApiError(409, "COMU_SLUG_TAKEN", "Ese slug ya está en uso.");
  const { data: current } = await admin.from("comu_sellers").select("*").eq("brand_id", access.brand.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  let seller = current;
  if (!seller) {
    const { data, error } = await admin.from("comu_sellers").insert({ brand_id: access.brand.id, brand_slug: access.brand.slug, public_name: input.publicName, slug, description: input.description || null, status: "DRAFT", verification_status: "UNVERIFIED" }).select("*").single();
    if (error) throw new PosApiError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "COMU_SLUG_TAKEN" : "COMU_SELLER_CREATE_FAILED", "No se pudo preparar la tienda COMU.");
    seller = data;
  } else {
    const { data, error } = await admin.from("comu_sellers").update({ public_name: input.publicName, slug, description: input.description || null, brand_slug: access.brand.slug, updated_at: new Date().toISOString() }).eq("id", seller.id).select("*").single();
    if (error) throw error;
    seller = data;
  }
  const { data: storefrontExisting } = await admin.from("comu_storefronts").select("*").eq("seller_id", seller.id).maybeSingle();
  let storefront = storefrontExisting;
  if (!storefront) {
    const { data, error } = await admin.from("comu_storefronts").insert({ seller_id: seller.id, name: input.publicName, slug, description: input.description || null, status: "DRAFT" }).select("*").single();
    if (error) throw error;
    storefront = data;
  } else {
    const { data, error } = await admin.from("comu_storefronts").update({ name: input.publicName, slug, description: input.description || null, updated_at: new Date().toISOString() }).eq("id", storefront.id).select("*").single();
    if (error) throw error;
    storefront = data;
  }
  const { error: membershipError } = await admin.from("comu_seller_memberships").upsert({ seller_id: seller.id, user_id: access.user.userId, role: "OWNER", active: true, updated_at: new Date().toISOString() }, { onConflict: "seller_id,user_id" });
  if (membershipError) throw membershipError;
  return { seller, storefront };
}

async function savePolicies(admin: Admin, storefrontId: string, input: Record<string, unknown>) {
  const retail = input.retailShipping as Record<string, unknown> | undefined;
  const wholesale = input.wholesaleShipping as Record<string, unknown> | undefined;
  for (const [mode, policy] of [["RETAIL", retail], ["WHOLESALE", wholesale]] as const) {
    if (!policy) continue;
    const values = { storefront_id: storefrontId, mode, buyer_pays_percent: Number(policy.buyerPaysPercent ?? (mode === "WHOLESALE" ? 50 : 100)), free_shipping_threshold: policy.freeShippingThreshold == null ? null : Number(policy.freeShippingThreshold), seller_subsidy_percent: Number(policy.sellerSubsidyPercent ?? 0), seller_max_subsidy: policy.sellerMaxSubsidy == null ? null : Number(policy.sellerMaxSubsidy), cometa_subsidy: 0, updated_at: new Date().toISOString() };
    if (values.buyer_pays_percent < 0 || values.buyer_pays_percent > 100 || values.seller_subsidy_percent < 0 || values.seller_subsidy_percent > 100) throw new PosApiError(400, "COMU_SHIPPING_POLICY_INVALID", "La política de envíos no es válida.");
    const { error } = await admin.from("comu_shipping_policies").upsert(values, { onConflict: "storefront_id,mode" });
    if (error) throw error;
  }
}

async function saveProfiles(admin: Admin, sellerId: string, selected: string[], profiles: Record<string, unknown> | undefined) {
  for (const productId of selected) {
    const raw = (profiles?.[productId] as Record<string, unknown> | undefined) || {};
    const profile = String(raw.profile || "TSHIRT");
    if (!PROFILE_CODES.has(profile)) throw new PosApiError(400, "COMU_LOGISTICS_PROFILE_INVALID", "El perfil logístico no es válido.");
    const defaults = PROFILE_DEFAULTS[profile];
    const weight = Number(raw.estimatedWeightG ?? defaults.weight);
    if (!Number.isFinite(weight) || weight <= 0) throw new PosApiError(400, "COMU_LOGISTICS_WEIGHT_INVALID", "El peso estimado no es válido.");
    const { error } = await admin.from("comu_shipping_product_profiles").upsert({ product_id: productId, profile, estimated_weight_g: weight, override_weight_g: raw.overrideWeightG == null ? null : Number(raw.overrideWeightG), packing_factor: 1, package_class: String(raw.packageClass || defaults.packageClass), updated_at: new Date().toISOString() }, { onConflict: "product_id" });
    if (error) throw error;
  }
  void sellerId;
}

export async function saveOnboarding(brandSlug: string, body: Record<string, unknown>) {
  const { access, admin, foodOnly, hasPosProducts } = await resolveBrandForOnboarding(brandSlug);
  if (foodOnly || !hasPosProducts) throw new PosApiError(409, "COMU_ACTIVATION_NOT_ELIGIBLE", "Esta marca todavía no tiene un catálogo POS textil elegible para COMU.");
  const publicName = String(body.publicName || access.brand.name).trim();
  if (!publicName) throw new PosApiError(400, "COMU_PUBLIC_NAME_REQUIRED", "El nombre público es obligatorio.");
  const { seller, storefront } = await ensureSeller(admin, access, { publicName, slug: String(body.slug || publicName), description: String(body.description || "").trim() });
  const selected = Array.isArray(body.selectedProductIds) ? body.selectedProductIds.map(String).filter(Boolean) : [];
  const { data: products } = await admin.from("pos_products").select("id,brand_id,brand_slug").in("id", selected).eq("brand_id", access.brand.id).eq("brand_slug", access.brand.slug).eq("active", true).eq("sellable", true);
  const validIds = (products || []).map((product) => product.id);
  const existing = await admin.from("comu_product_listings").select("id,product_id,status,public_slug").eq("seller_id", seller.id);
  for (const listing of existing.data || []) {
    if (!validIds.includes(listing.product_id)) await admin.from("comu_product_listings").update({ status: "DRAFT", updated_at: new Date().toISOString() }).eq("id", listing.id);
  }
  for (const productId of validIds) {
    const current = (existing.data || []).find((listing) => listing.product_id === productId);
    if (!current) await createListing(admin, { sellerId: seller.id, storefrontId: storefront.id, productId, wholesaleEnabled: body.wholesaleEnabled === true });
    else await admin.from("comu_product_listings").update({ wholesale_enabled: body.wholesaleEnabled === true, updated_at: new Date().toISOString() }).eq("id", current.id);
  }
  await saveProfiles(admin, seller.id, validIds, body.logisticsProfiles as Record<string, unknown> | undefined);
  await savePolicies(admin, storefront.id, body);
  if (body.publish === true) {
    if (!validIds.length) throw new PosApiError(400, "COMU_PRODUCTS_REQUIRED", "Selecciona al menos un producto para publicar.");
    const { error: listingError } = await admin.from("comu_product_listings").update({ status: "PUBLISHED", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("seller_id", seller.id).in("product_id", validIds);
    if (listingError) throw listingError;
    const now = new Date().toISOString();
    const { data: activated, error: sellerError } = await admin.from("comu_sellers").update({ status: "ACTIVE", verification_status: "VERIFIED", verified_at: now, activated_at: now, updated_at: now }).eq("id", seller.id).select("*").single();
    if (sellerError) throw sellerError;
    const { data: activeStorefront, error: storefrontError } = await admin.from("comu_storefronts").update({ status: "ACTIVE", updated_at: now }).eq("id", storefront.id).select("*").single();
    if (storefrontError) throw storefrontError;
    return { seller: activated, storefront: activeStorefront, publishedProductIds: validIds, active: true };
  }
  return { seller, storefront, publishedProductIds: validIds, active: false };
}
