import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";
import { comuRegistrationProfile } from "./auth-navigation";
import { requireComuActor } from "./seller-access";

// Reads must not provision identity. Existing onboarding/write helper below is preserved.
export async function readComuBuyerAccount() {
  const actor = await requireComuActor();
  const { data: { user }, error: authError } = await (await createServerAuthClient()).auth.getUser();
  if (authError || !user || user.id !== actor.userId) throw new PosApiError(401, "COMU_UNAUTHORIZED", "Inicia sesión para continuar.");
  const { data: buyer, error } = await actor.admin.from("comu_buyers").select("id,user_id,display_name,phone").eq("user_id", actor.userId).maybeSingle();
  if (error) throw new PosApiError(503, "COMU_BUYER_LOOKUP_FAILED", "No se pudo consultar tu cuenta.");
  return { buyer, admin: actor.admin, user };
}
export async function requireComuBuyerRead() {
  const { buyer, admin, user } = await readComuBuyerAccount();
  if (!buyer) throw new PosApiError(404, "COMU_BUYER_NOT_FOUND", "No se encontró tu cuenta Buyer.");
  return { buyer, admin, userId: user.id };
}

export async function requireComuBuyer() {
  const auth = await createServerAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new PosApiError(401, "COMU_UNAUTHORIZED", "Inicia sesión para continuar.");
  const admin = getAdminClient();
  // Identity comes only from verified Auth. Metadata seeds a new profile, never
  // overwrites an existing buyer or grants a seller/administrative role.
  const { error: createError } = await admin.from("comu_buyers").upsert({ user_id: user.id, ...comuRegistrationProfile(user.user_metadata) }, { onConflict: "user_id", ignoreDuplicates: true });
  if (createError) throw new PosApiError(500, "COMU_BUYER_LOOKUP_FAILED", "No se pudo preparar tu cuenta COMU.");
  const { data: buyer, error: buyerError } = await admin.from("comu_buyers").select("*").eq("user_id", user.id).single();
  if (buyerError || !buyer) throw new PosApiError(500, "COMU_BUYER_LOOKUP_FAILED", "No se pudo preparar tu cuenta COMU.");
  return { user, buyer, admin };
}

export async function getBuyerAddresses() {
  const { buyer, admin } = await readComuBuyerAccount();
  if (!buyer) return { buyer: null, admin, addresses: [] };
  const { data, error } = await admin.from("comu_buyer_addresses").select("id,label,recipient_name,phone,line1,line2,city,state,postal_code,country,references,is_default,created_at,updated_at").eq("buyer_id", buyer.id).order("is_default", { ascending: false }).order("created_at");
  if (error) throw new PosApiError(500, "COMU_ADDRESS_LOOKUP_FAILED", "No se pudieron cargar tus direcciones.");
  return { buyer, admin, addresses: data || [] };
}
