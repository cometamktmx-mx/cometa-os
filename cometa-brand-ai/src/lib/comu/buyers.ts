import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";

export async function requireComuBuyer() {
  const auth = await createServerAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new PosApiError(401, "COMU_UNAUTHORIZED", "Inicia sesión para continuar.");
  const admin = getAdminClient();
  const { data: buyer, error: buyerError } = await admin.from("comu_buyers").upsert({ user_id: user.id }, { onConflict: "user_id" }).select("*").single();
  if (buyerError || !buyer) throw new PosApiError(500, "COMU_BUYER_LOOKUP_FAILED", "No se pudo preparar tu cuenta COMU.");
  return { user, buyer, admin };
}

export async function getBuyerAddresses() {
  const { buyer, admin } = await requireComuBuyer();
  const { data, error } = await admin.from("comu_buyer_addresses").select("*").eq("buyer_id", buyer.id).order("is_default", { ascending: false }).order("created_at");
  if (error) throw new PosApiError(500, "COMU_ADDRESS_LOOKUP_FAILED", "No se pudieron cargar tus direcciones.");
  return { buyer, admin, addresses: data || [] };
}
