import Stripe from "stripe";
import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer } from "./buyers";
import { getStripeClient } from "./stripe";

function cents(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new PosApiError(409, "COMU_PAYMENT_AMOUNT_INVALID", "El importe de la orden no es válido.");
  return Math.round(amount * 100);
}

export async function createComuPaymentIntent(orderId: string, idempotencyKey: string) {
  const { buyer, admin } = await requireComuBuyer();
  const { data: order, error } = await admin.from("comu_orders").select("id,buyer_id,status,currency,grand_total,reservation_id").eq("id", orderId).eq("buyer_id", buyer.id).maybeSingle();
  if (error) throw new PosApiError(500, "COMU_ORDER_LOOKUP_FAILED", "No se pudo validar la orden.");
  if (!order) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "La orden no existe.");
  if (process.env.NODE_ENV === "development") console.log("COMU_STRIPE_ORDER_CONTEXT", { order_id: order.id, order_status: order.status, reservation_id: order.reservation_id, amount: order.grand_total, currency: order.currency });
  if (order.status !== "PAYMENT_PENDING") throw new PosApiError(409, "COMU_ORDER_NOT_PAYABLE", "Esta orden ya no acepta pagos.");
  const { data: reservation } = await admin.from("comu_inventory_reservations").select("id,status,expires_at").eq("id", order.reservation_id).maybeSingle();
  if (process.env.NODE_ENV === "development") console.log("COMU_STRIPE_RESERVATION_CONTEXT", { order_id: order.id, reservation_id: reservation?.id, reservation_status: reservation?.status, reservation_expires_at: reservation?.expires_at });
  if (!reservation || reservation.status !== "COMMITTED" || new Date(reservation.expires_at).getTime() <= Date.now()) throw new PosApiError(409, "COMU_RESERVATION_EXPIRED", "La reserva expiró. Actualiza tu carrito.");
  const amount = cents(order.grand_total);
  const currency = String(order.currency || "MXN").toUpperCase();
  const { data: existing } = await admin.from("comu_payment_intents").select("id,stripe_payment_intent_id,amount_cents,currency,status").eq("order_id", order.id).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (process.env.NODE_ENV === "development") console.log("COMU_STRIPE_PAYMENT_INTENT_CONTEXT", { order_id: order.id, order_status: order.status, reservation_id: reservation.id, reservation_status: reservation.status, reservation_expires_at: reservation.expires_at, payment_intent_id: existing?.stripe_payment_intent_id || null, persisted_payment_status: existing?.status || null, amount, currency });
  const stripe = getStripeClient();
  if (existing?.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id);
    if (process.env.NODE_ENV === "development") console.log("COMU_STRIPE_PAYMENT_INTENT", { id: intent.id, status: intent.status, amount: intent.amount, currency: intent.currency, order_id: order.id });
    return { paymentId: existing.id, clientSecret: intent.client_secret, status: existing.status, amountCents: existing.amount_cents };
  }
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: { comu_order_id: order.id, buyer_id: buyer.id, environment: process.env.NODE_ENV || "development", payment_version: "comu-day3" },
  }, { idempotencyKey });
  if (process.env.NODE_ENV === "development") console.log("COMU_STRIPE_PAYMENT_INTENT", { id: intent.id, status: intent.status, amount: intent.amount, currency: intent.currency, order_id: order.id });
  const { data: payment, error: paymentError } = await admin.from("comu_payment_intents").insert({ order_id: order.id, buyer_id: buyer.id, stripe_payment_intent_id: intent.id, amount_cents: amount, currency, status: intent.status === "succeeded" ? "SUCCEEDED" : "REQUIRES_PAYMENT", idempotency_key: idempotencyKey }).select("id,status,amount_cents").single();
  if (paymentError) {
    const { data: retry } = await admin.from("comu_payment_intents").select("id,status,amount_cents").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (!retry) throw new PosApiError(500, "COMU_PAYMENT_PERSIST_FAILED", "No se pudo guardar el intento de pago.");
    return { paymentId: retry.id, clientSecret: intent.client_secret, status: retry.status, amountCents: retry.amount_cents };
  }
  return { paymentId: payment.id, clientSecret: intent.client_secret, status: payment.status, amountCents: payment.amount_cents };
}

export async function getBuyerPayment(orderId: string) {
  const { buyer, admin } = await requireComuBuyer();
  const { data, error } = await admin.from("comu_payment_intents").select("id,order_id,amount_cents,currency,status,created_at,updated_at").eq("order_id", orderId).eq("buyer_id", buyer.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new PosApiError(500, "COMU_PAYMENT_LOOKUP_FAILED", "No se pudo cargar el pago.");
  return data;
}
