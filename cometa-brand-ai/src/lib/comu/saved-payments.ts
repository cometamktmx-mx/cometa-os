// Server-only foundation. No route invokes it until customer ownership,
// environment-specific persistence and Elements are activated in a later block.
import "server-only";
import type Stripe from "stripe";
export type SavedPaymentView = { id: string; brand: string; last4: string; expMonth: number; expYear: number; primary: boolean };
export function savedCardView(method: Stripe.PaymentMethod, customerId: string, primaryId: string | null): SavedPaymentView | null {
  const owner = typeof method.customer === "string" ? method.customer : method.customer?.id;
  if (owner !== customerId || method.type !== "card" || !method.card) return null;
  return { id: method.id, brand: method.card.brand, last4: method.card.last4, expMonth: method.card.exp_month, expYear: method.card.exp_year, primary: method.id === primaryId };
}
// Deliberately no customer creation/SetupIntent endpoint before canonical
// buyer-customer association exists. Never infer ownership from browser IDs.
