import "server-only";
import Stripe from "stripe";

function getComuStripeSecretKey() {
  const key = process.env.COMU_STRIPE_SECRET_KEY;
  if (!key) throw new Error("COMU_STRIPE_ENV_MISSING");
  return key;
}

export function getStripeClient() {
  return new Stripe(getComuStripeSecretKey());
}

export function getStripeRuntimeMode(): boolean {
  const key = getComuStripeSecretKey();
  if (key.startsWith("sk_test_")) return false;
  if (key.startsWith("sk_live_")) return true;
  throw new Error("COMU_STRIPE_RUNTIME_MODE_UNKNOWN");
}
