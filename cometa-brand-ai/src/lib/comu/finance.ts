import { PosApiError } from "@/lib/pos/server";
import { requireSellerAccess } from "./seller-access";

export async function getSellerFinance(sellerId: string) {
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data, error } = await access.admin.from("comu_payment_allocations").select("id,payment_id,order_id,suborder_id,gross_amount_cents,platform_fee_cents,seller_net_amount_cents,status,created_at").eq("seller_id", sellerId).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_FINANCE_LOOKUP_FAILED", "No se pudo cargar el estado financiero.");
  return data || [];
}
