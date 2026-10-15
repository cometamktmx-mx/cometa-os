export const PRODUCT_ENTITLEMENT_CODES = [
  "pos.access", "pos.sales", "pos.cash", "pos.products", "pos.inventory",
  "pos.customers", "pos.loyalty", "pos.reports", "intelligence.signals",
  "intelligence.pulsar", "intelligence.opportunities", "growth.strategy",
  "growth.calendar", "growth.sales_ai", "growth.agents", "growth.connections",
  "agency.strategy", "agency.content", "agency.ads", "agency.account_management",
  "platform.multi_location", "platform.advanced_users", "platform.api_access",
] as const;

export type ProductEntitlementCode = typeof PRODUCT_ENTITLEMENT_CODES[number];

export type ProductSubscriptionAccessStatus =
  | "trial"
  | "active"
  | "past_due"
  | "grace_period"
  | "suspended"
  | "cancelled";

export type EffectiveEntitlementsResponse = {
  plan: { code: string; name: string };
  subscription: {
    status: ProductSubscriptionAccessStatus;
    trialEndsAt: string | null; currentPeriodStart: string | null;
    currentPeriodEnd: string | null; graceEndsAt: string | null;
  };
  entitlements: ProductEntitlementCode[];
  overrides: Array<{
    id: string; entitlementCode: string; enabled: boolean; reason: string | null;
    startsAt: string | null; endsAt: string | null;
  }>;
};

export function hasEntitlement(
  value: Pick<EffectiveEntitlementsResponse, "entitlements"> | string[],
  code: ProductEntitlementCode | string
) {
  return (Array.isArray(value) ? value : value.entitlements).includes(code);
}

const PRODUCT_ENTITLEMENT_CODE_SET = new Set<string>(PRODUCT_ENTITLEMENT_CODES);
const PRODUCT_SUBSCRIPTION_ACCESS_STATUSES = new Set<string>([
  "trial", "active", "past_due", "grace_period", "suspended", "cancelled",
]);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isEffectiveEntitlementsResponse(value: unknown): value is EffectiveEntitlementsResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const plan = item.plan as Record<string, unknown> | null;
  const subscription = item.subscription as Record<string, unknown> | null;
  if (!plan || typeof plan.code !== "string" || typeof plan.name !== "string" ||
    !subscription || typeof subscription.status !== "string" ||
    !PRODUCT_SUBSCRIPTION_ACCESS_STATUSES.has(subscription.status) ||
    !isNullableString(subscription.trialEndsAt) ||
    !isNullableString(subscription.currentPeriodStart) ||
    !isNullableString(subscription.currentPeriodEnd) ||
    !isNullableString(subscription.graceEndsAt) ||
    !Array.isArray(item.entitlements) ||
    !item.entitlements.every((code) => typeof code === "string" && PRODUCT_ENTITLEMENT_CODE_SET.has(code)) ||
    !Array.isArray(item.overrides)) {
    return false;
  }

  return item.overrides.every((override) => {
    if (!override || typeof override !== "object" || Array.isArray(override)) return false;
    const row = override as Record<string, unknown>;
    return typeof row.id === "string" &&
      typeof row.entitlementCode === "string" &&
      PRODUCT_ENTITLEMENT_CODE_SET.has(row.entitlementCode) &&
      typeof row.enabled === "boolean" &&
      isNullableString(row.reason) &&
      isNullableString(row.startsAt) &&
      isNullableString(row.endsAt);
  });
}
