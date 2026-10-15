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

// Connect uses the COMU server credential; the webhook route enforces its runtime mode.
export function getConnectStripeClient() {
  return new Stripe(getComuStripeSecretKey(), { maxNetworkRetries: 2, timeout: 20000 });
}

export function getStripeRuntimeMode(): boolean {
  const key = getComuStripeSecretKey();
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return false;
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return true;
  throw new Error("COMU_STRIPE_RUNTIME_MODE_UNKNOWN");
}

export function assertConnectAccountCreationAllowed(): boolean {
  const live = getStripeRuntimeMode();
  const production = process.env.NODE_ENV === "production" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production");
  if (production !== live) throw new Error("COMU_CONNECT_ENVIRONMENT_MISMATCH");
  return live;
}

export function getComuAppOrigin(live: boolean): string {
  const configured = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (live) {
    if (!configured) throw new Error("COMU_APP_ORIGIN_MISSING");
    if (configured !== "https://app.cometaos.com" && configured !== "https://app.cometaos.com/") throw new Error("COMU_CONNECT_LIVE_ORIGIN_INVALID");
    return "https://app.cometaos.com";
  }
  if (configured) return configured.replace(/\/$/, "");
  if (live || process.env.NODE_ENV === "production") throw new Error("COMU_APP_ORIGIN_MISSING");
  return "http://localhost:3000";
}

export function assertConnectAccountAssociation(account: Stripe.Account, sellerId: string, live: boolean): void {
  if (account.metadata?.comu_seller_id !== sellerId || account.metadata?.comu_mode !== (live ? "live" : "test")) {
    throw new Error("COMU_CONNECT_ACCOUNT_ASSOCIATION_MISMATCH");
  }
}
