import { BuyerOrderDetailClient } from "../buyer-orders-client";
import PaymentEntry from "./payment-entry";
import "../buyer-orders.css";
export default async function BuyerOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; suborderId?: string; notificationId?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  // Preserve the existing checkout confirmation/polling entry. B1/N1 tracking links
  // explicitly request detail and must never be redirected to confirmation.
  if (query.view !== "detail" && !query.suborderId && !query.notificationId) return <PaymentEntry params={params} />;
  const context = new URLSearchParams();
  if (query.suborderId) context.set("suborderId", query.suborderId);
  if (query.notificationId) context.set("notificationId", query.notificationId);
  return <BuyerOrderDetailClient key={id + context.toString()} id={id} context={context.toString()} />;
}
