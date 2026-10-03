import { PosApiError } from "@/lib/pos/server";
import type { ComuActor } from "./seller-access";

export function slugifyComu(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function getSellerBySlug(admin: ComuActor["admin"], slug: string, publicOnly = true) {
  let query = admin.from("comu_sellers").select("*").eq("slug", slug);
  if (publicOnly) query = query.eq("status", "ACTIVE").eq("verification_status", "VERIFIED");
  const { data, error } = await query.maybeSingle();
  if (error) throw new PosApiError(500, "COMU_SELLER_LOOKUP_FAILED", "No se pudo cargar el seller.");
  return data;
}

export async function canActivateComuSeller(admin: ComuActor["admin"], sellerId: string) {
  const { data, error } = await admin.rpc("comu_seller_activation_check_v1", { p_seller_id: sellerId });
  if (error || !data) throw new PosApiError(503, "COMU_FOUNDATION_PENDING", "No se pudo consultar la política de activación C1.");
  return data as { ok: boolean; reason?: string; publishedListings: number; minimumListings: number };
}
