import { PosApiError } from "@/lib/pos/server";
import { requireComuActor, requireSellerAccess } from "./seller-access";
import { isOverdue } from "./business-days";
import { LocalTestShippingProvider } from "./shipping-provider";
import { requireComuBuyer } from "./buyers";

export async function transitionSuborder(suborderId: string, status: string, actorType: "SELLER" | "HUB" | "ADMIN", note?: string) {
  const actor = await requireComuActor();
  const { data, error } = await actor.admin.rpc("comu_transition_suborder_fulfillment_v1", { p_suborder_id: suborderId, p_to_status: status, p_actor_type: actorType, p_note: note || null });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_FULFILLMENT_TRANSITION_FAILED", "No se pudo actualizar el pedido.");
  return data;
}

export async function getSellerFulfillmentOrders(sellerId: string) {
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data, error } = await access.admin.from("comu_order_suborders").select("*,comu_orders(id,order_number,status,fulfillment_status,created_at,shipping_address_snapshot),comu_order_items(*,comu_order_item_snapshots(*))").eq("seller_id", sellerId).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_FULFILLMENT_LOOKUP_FAILED", "No se pudieron cargar los pedidos.");
  return (data || []).map((item) => ({ ...item, overdue: isOverdue(item.deadline_at) }));
}

export async function receiveAtHub(suborderId: string, note?: string) { return transitionSuborder(suborderId, "HUB_RECEIVED", "HUB", note); }

export async function consolidateOrder(orderId: string) {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes autorización para consolidar.");
  const { data, error } = await actor.admin.rpc("comu_consolidate_order_v1", { p_order_id: orderId });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_CONSOLIDATION_FAILED", "No se pudo consolidar el pedido.");
  return data;
}

export async function prepareShipment(orderId: string, dimensions: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number }) {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes autorización para preparar envíos.");
  const { data: shipment, error } = await actor.admin.from("comu_shipments").select("*").eq("master_order_id", orderId).maybeSingle();
  if (error || !shipment) throw new PosApiError(404, "COMU_SHIPMENT_NOT_FOUND", "El envío no existe.");
  if (shipment.provider_shipment_id) return shipment;
  const { data: order } = await actor.admin.from("comu_orders").select("shipping_address_snapshot").eq("id", orderId).single();
  const created = await new LocalTestShippingProvider().createShipment({ orderId, destination: order?.shipping_address_snapshot || null, package: dimensions });
  const { data: updated, error: updateError } = await actor.admin.from("comu_shipments").update({ ...created, weight_kg: dimensions.weightKg, length_cm: dimensions.lengthCm, width_cm: dimensions.widthCm, height_cm: dimensions.heightCm, updated_at: new Date().toISOString() }).eq("id", shipment.id).is("provider_shipment_id", null).select("*").single();
  if (updateError || !updated) throw new PosApiError(409, "COMU_SHIPMENT_CREATE_FAILED", "No se pudo preparar el envío.");
  return updated;
}

export async function shipShipment(orderId: string) {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes acceso al HUB.");
  const { data: shipment, error } = await actor.admin.from("comu_shipments").select("*").eq("master_order_id", orderId).maybeSingle();
  if (error || !shipment) throw new PosApiError(404, "COMU_SHIPMENT_NOT_FOUND", "El envío no existe.");
  if (shipment.status === "SHIPPED") return shipment;
  if (!shipment.provider_shipment_id) throw new PosApiError(409, "COMU_SHIPMENT_NOT_PREPARED", "Prepara el envío antes de marcarlo como enviado.");
  const { data, error: updateError } = await actor.admin.from("comu_shipments").update({ status: "SHIPPED", updated_at: new Date().toISOString() }).eq("id", shipment.id).eq("status", "READY_TO_SHIP").select("*").single();
  if (updateError || !data) throw new PosApiError(409, "COMU_SHIPMENT_UPDATE_FAILED", "No se pudo marcar el envío.");
  return data;
}

export async function recordFulfillmentIncident(suborderId: string, incidentType: "INCOMPLETE_PACKAGE" | "WRONG_PRODUCT" | "DAMAGED_PACKAGE" | "OTHER", note?: string) {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes acceso al HUB.");
  const { data: suborder } = await actor.admin.from("comu_order_suborders").select("id,order_id,seller_id").eq("id", suborderId).maybeSingle();
  if (!suborder) throw new PosApiError(404, "COMU_SUBORDER_NOT_FOUND", "El subpedido no existe.");
  const { data, error } = await actor.admin.from("comu_fulfillment_incidents").insert({ suborder_id: suborder.id, order_id: suborder.order_id, seller_id: suborder.seller_id, incident_type: incidentType, note: note || null, actor_id: actor.userId }).select("*").single();
  if (error || !data) throw new PosApiError(409, "COMU_FULFILLMENT_INCIDENT_FAILED", "No se pudo registrar la incidencia.");
  await actor.admin.from("comu_order_suborders").update({ fulfillment_status: "ISSUE", updated_at: new Date().toISOString() }).eq("id", suborder.id);
  return data;
}

export async function getBuyerFulfillment(orderId: string) {
  const { buyer, admin } = await requireComuBuyer();
  const { data, error } = await admin.from("comu_orders").select("id,order_number,fulfillment_status,comu_order_suborders(fulfillment_status)").eq("id", orderId).eq("buyer_id", buyer.id).maybeSingle();
  if (error || !data) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "El pedido no existe.");
  return { id: data.id, orderNumber: data.order_number, status: data.fulfillment_status === "WAITING_FOR_SELLERS" ? "PREPARING" : data.fulfillment_status === "CONSOLIDATED" ? "READY_TO_SHIP" : data.fulfillment_status };
}
