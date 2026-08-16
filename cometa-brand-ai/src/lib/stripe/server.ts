import "server-only";

import Stripe from "stripe";

import type { PosPlanCode } from "@/lib/pos/plans";

export type CometaStripeStatus =
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";

const PRICE_ENV_BY_PLAN: Record<PosPlanCode, string> = {
  start: "STRIPE_PRICE_START",
  pro: "STRIPE_PRICE_PRO",
  multi: "STRIPE_PRICE_MULTI",
};

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_ENV_MISSING");
  return new Stripe(key);
}

export function getAppOrigin() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error("APP_ORIGIN_MISSING");
  return origin.replace(/\/$/, "");
}

export function getStripePriceId(planCode: string): string {
  if (!(planCode in PRICE_ENV_BY_PLAN)) throw new Error("POS_PLAN_INVALID");
  const envName = PRICE_ENV_BY_PLAN[planCode as PosPlanCode];
  const priceId = process.env[envName];
  if (!priceId) throw new Error(`STRIPE_PRICE_MISSING_${planCode.toUpperCase()}`);
  return priceId;
}

export function planCodeFromStripePrice(priceId: string): PosPlanCode | null {
  for (const planCode of ["start", "pro", "multi"] as const) {
    if (process.env[PRICE_ENV_BY_PLAN[planCode]] === priceId) return planCode;
  }
  return null;
}

export function mapStripeSubscriptionStatus(status: string): CometaStripeStatus | null {
  switch (status) {
    case "trialing": return "trial";
    case "active": return "active";
    case "past_due": return "past_due";
    case "unpaid":
    case "paused": return "suspended";
    case "incomplete": return "past_due";
    case "incomplete_expired":
    case "canceled": return "cancelled";
    default: return null;
  }
}

export function safeStripeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(input).filter(([, item]) =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    ).slice(0, 20)
  );
}
