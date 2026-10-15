import { createClient } from "@/lib/supabase/server";
import { PosApiError } from "@/lib/pos/server";
import { requireComuReviewer } from "./seller-approval";

export async function changeSellerCommercialState(sellerId: string, action: string) {
  await requireComuReviewer();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sellerId)
    || !["activate", "pause", "suspend", "close"].includes(action)) {
    throw new PosApiError(400, "COMU_SELLER_ACTION_INVALID", "Usa revisión de solicitudes para aprobar; activación es una operación separada.");
  }
  const auth = await createClient();
  const { data, error } = await auth.rpc("comu_admin_seller_state_v1", { p_seller_id: sellerId, p_action: action });
  if (error || !data) throw new PosApiError(409, "COMU_ACTIVATION_NOT_ELIGIBLE", "No se pudo cambiar el estado comercial.");
  return data as { ok: boolean; reason?: string; publishedListings?: number; seller?: Record<string, unknown> };
}
