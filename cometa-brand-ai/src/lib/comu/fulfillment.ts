import { PosApiError } from "@/lib/pos/server";
import { requireComuActor, requireSellerAccess } from "./seller-access";
import { isOverdue } from "./business-days";
import { LocalTestShippingProvider } from "./shipping-provider";
import { readBuyerOrder } from "./buyer-orders";
import { createClient } from "@/lib/supabase/server";
import { readSellerOrders } from "./seller-orders";

export async function transitionSuborder(suborderId: string, status: string, actorType: "SELLER" | "HUB" | "ADMIN", note?: string) {
  await requireComuActor();
  const auth = await createClient();
  const { data, error } = await auth.rpc("comu_transition_suborder_fulfillment_v1", { p_suborder_id: suborderId, p_to_status: status, p_actor_type: actorType, p_note: note || null });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_FULFILLMENT_TRANSITION_FAILED", "No se pudo actualizar el pedido.");
  return data;
}

export async function getSellerFulfillmentOrders(sellerId: string) {
  await readSellerOrders(sellerId, new URLSearchParams({ pageSize: "1" }));
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data, error } = await access.admin.from("comu_order_suborders").select("id,grand_total,fulfillment_status,deadline_at,comu_orders(order_number,status,created_at,recipientName:shipping_address_snapshot->>recipient_name),comu_order_items(quantity)").eq("seller_id", sellerId).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_FULFILLMENT_LOOKUP_FAILED", "No se pudieron cargar los pedidos.");
  return (data || []).map((item) => {
    const parent = Array.isArray(item.comu_orders) ? item.comu_orders[0] : item.comu_orders;
    // Compatibility for the existing dashboard: name only, never the address.
    return { ...item, comu_orders: parent ? { ...parent, shipping_address_snapshot: { recipient_name: parent.recipientName } } : null, overdue: isOverdue(item.deadline_at) };
  });
}

export async function receiveAtHub(suborderId: string, note?: string) { return transitionSuborder(suborderId, "HUB_RECEIVED", "HUB", note); }

export async function consolidateOrder(orderId: string) {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes autorización para consolidar.");
  const { data, error } = await (await createClient()).rpc("comu_consolidate_order_v1", { p_order_id: orderId });
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

export async function prepareDirectShipment(suborderId: string, sellerId: string, dimensions: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number }) {
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data: suborder } = await access.admin.from("comu_order_suborders").select("id,order_id,seller_id,fulfillment_route").eq("id", suborderId).eq("seller_id", sellerId).maybeSingle();
  if (!suborder || suborder.fulfillment_route !== "DIRECT") throw new PosApiError(403, "COMU_DIRECT_NOT_ELIGIBLE", "Este pedido no permite envío directo.");
  const { data: existing } = await access.admin.from("comu_shipments").select("*").eq("master_order_id", suborder.order_id).maybeSingle();
  if (existing?.provider_shipment_id) return existing;
  const { data: order } = await access.admin.from("comu_orders").select("shipping_address_snapshot").eq("id", suborder.order_id).maybeSingle();
  const created = await new LocalTestShippingProvider().createShipment({ orderId: suborder.order_id, destination: order?.shipping_address_snapshot || null, package: dimensions });
  const shipment = existing || (await access.admin.from("comu_shipments").insert({ master_order_id: suborder.order_id, provider: "LOCAL_TEST", status: "READY_TO_SHIP", destination_snapshot: order?.shipping_address_snapshot || null }).select("*").single()).data;
  if (!shipment) throw new PosApiError(409, "COMU_SHIPMENT_CREATE_FAILED", "No se pudo preparar el envío.");
  const { data: updated, error } = await access.admin.from("comu_shipments").update({ ...created, weight_kg: dimensions.weightKg, length_cm: dimensions.lengthCm, width_cm: dimensions.widthCm, height_cm: dimensions.heightCm, updated_at: new Date().toISOString() }).eq("id", shipment.id).is("provider_shipment_id", null).select("*").single();
  if (error || !updated) throw new PosApiError(409, "COMU_SHIPMENT_CREATE_FAILED", "No se pudo preparar el envío.");
  return updated;
}

export async function shipDirectShipment(suborderId: string, sellerId: string) {
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data: suborder } = await access.admin.from("comu_order_suborders").select("id,order_id,seller_id,fulfillment_route").eq("id", suborderId).eq("seller_id", sellerId).maybeSingle();
  if (!suborder || suborder.fulfillment_route !== "DIRECT") throw new PosApiError(403, "COMU_DIRECT_NOT_ELIGIBLE", "Este pedido no permite envío directo.");
  const { data: shipment } = await access.admin.from("comu_shipments").select("id,provider_shipment_id").eq("master_order_id", suborder.order_id).maybeSingle();
  if (!shipment?.provider_shipment_id) throw new PosApiError(409, "COMU_SHIPMENT_NOT_PREPARED", "Prepara el envío antes de marcarlo.");
  return transitionSuborder(suborderId, "SHIPPED", "SELLER");
}

export async function recordFulfillmentIncident(suborderId: string, incidentType: "INCOMPLETE_PACKAGE" | "WRONG_PRODUCT" | "DAMAGED_PACKAGE" | "OTHER", note?: string, requestId?: string) {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes acceso al HUB.");
  const { data, error } = await (await createClient()).rpc("comu_record_fulfillment_incident_v1", { p_suborder: suborderId, p_type: incidentType, p_request: requestId || crypto.randomUUID(), p_note: note || null });
  if (error || !data) throw new PosApiError(409, "COMU_FULFILLMENT_INCIDENT_FAILED", "No se pudo registrar la incidencia.");
  return data;
}

export async function getBuyerFulfillment(orderId: string) {
  const order = await readBuyerOrder(orderId);
  const status = ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(order.presentationStatus) ? "SHIPPED" : order.presentationStatus;
  return { id: order.orderId, orderNumber: order.orderNumber, status };
}
