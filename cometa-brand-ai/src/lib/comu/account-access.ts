import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";
import { requireComuBrandSeller } from "./seller-access";

// Navigation is derived from verified identity; it never provisions access.
export async function resolveComuAccountAccess() {
  const { data: { user }, error } = await (await createClient()).auth.getUser();
  if (error || !user) return null;
  const admin = getAdminClient();
  const [buyer, profile, memberships] = await Promise.all([
    admin.from("comu_buyers").select("id").eq("user_id", user.id).maybeSingle(),
    admin.from("user_profiles").select("role,status").eq("user_id", user.id).maybeSingle(),
    admin.from("comu_seller_memberships").select("seller_id").eq("user_id", user.id).eq("active", true),
  ]);
  if (buyer.error || profile.error || memberships.error) {
    throw new PosApiError(503, "COMU_ACCOUNT_LOOKUP_FAILED", "No pudimos consultar tus accesos. Intenta nuevamente.");
  }
  const stores: Array<{ id: string; brand_slug: string; public_name: string; status: string }> = [];
  const ids = [...new Set((memberships.data || []).map(row => row.seller_id as string))];
  if (ids.length && profile.data?.status === "active") {
    const candidates = await admin.from("comu_sellers").select("brand_slug").in("id", ids);
    if (candidates.error) throw new PosApiError(503, "COMU_ACCOUNT_LOOKUP_FAILED", "No pudimos consultar tus tiendas.");
    for (const candidate of candidates.data || []) {
      try {
        // Same membership, brand, C1 approval and status gate as Seller Center.
        stores.push(await requireComuBrandSeller(candidate.brand_slug));
      } catch (failure) {
        if (!(failure instanceof PosApiError) || failure.status !== 403) throw failure;
      }
    }
  }
  return {
    userId: user.id,
    // Buying is available to authenticated COMU identities; a persisted profile
    // is separate and is only created when the buyer flow is actually entered.
    buyer: true,
    hasBuyerAccount: Boolean(buyer.data),
    isAdmin: profile.data?.role === "admin" && profile.data.status === "active",
    stores,
  };
}
