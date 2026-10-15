import type { ProductSubscriptionAccessStatus } from "@/lib/pos/entitlements";

export type EffectiveSubscriptionStatus =
  | ProductSubscriptionAccessStatus
  | "trial_expired";

export type SubscriptionLifecycle = {
  planCode: string;
  status: ProductSubscriptionAccessStatus;
  effectiveStatus: EffectiveSubscriptionStatus;
  accessAllowed: boolean;
  trial: {
    startedAt: string | null;
    endsAt: string | null;
    daysRemaining: number;
    hoursRemaining: number;
    expired: boolean;
    expiringSoon: boolean;
  };
  period: {
    startsAt: string | null;
    endsAt: string | null;
    graceEndsAt: string | null;
  };
  cancelledAt: string | null;
  requiresActivation: boolean;
  reason: string | null;
};

export type EffectiveCommercialAccessSource =
  | "trial"
  | "subscription"
  | "commercial_grant"
  | "none";

export type EffectiveCommercialPlanSource =
  | "subscription"
  | "commercial_grant"
  | null;

export type EffectiveCommercialAccess = {
  subscriptionLifecycle: SubscriptionLifecycle | null;
  effective: {
    accessAllowed: boolean;
    accessSource: EffectiveCommercialAccessSource;
    planCode: string | null;
    planSource: EffectiveCommercialPlanSource;
    reason: string | null;
  };
  grant: {
    active: boolean;
    planCode: string | null;
    type: "complimentary" | null;
    startsAt: string | null;
    endsAt: string | null;
  };
};

const SUBSCRIPTION_STATUSES = new Set<string>([
  "trial",
  "active",
  "past_due",
  "grace_period",
  "suspended",
  "cancelled",
]);

const EFFECTIVE_STATUSES = new Set<string>([
  ...SUBSCRIPTION_STATUSES,
  "trial_expired",
]);

const COMMERCIAL_ACCESS_SOURCES = new Set<string>([
  "trial",
  "subscription",
  "commercial_grant",
  "none",
]);

const COMMERCIAL_PLAN_SOURCES = new Set<string>([
  "subscription",
  "commercial_grant",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isSubscriptionLifecycle(value: unknown): value is SubscriptionLifecycle {
  if (!isRecord(value)) return false;

  const trial = value.trial;
  const period = value.period;

  return typeof value.planCode === "string" &&
    typeof value.status === "string" &&
    SUBSCRIPTION_STATUSES.has(value.status) &&
    typeof value.effectiveStatus === "string" &&
    EFFECTIVE_STATUSES.has(value.effectiveStatus) &&
    typeof value.accessAllowed === "boolean" &&
    isRecord(trial) &&
    isNullableString(trial.startedAt) &&
    isNullableString(trial.endsAt) &&
    typeof trial.daysRemaining === "number" &&
    Number.isInteger(trial.daysRemaining) &&
    trial.daysRemaining >= 0 &&
    typeof trial.hoursRemaining === "number" &&
    Number.isInteger(trial.hoursRemaining) &&
    trial.hoursRemaining >= 0 &&
    typeof trial.expired === "boolean" &&
    typeof trial.expiringSoon === "boolean" &&
    isRecord(period) &&
    isNullableString(period.startsAt) &&
    isNullableString(period.endsAt) &&
    isNullableString(period.graceEndsAt) &&
    isNullableString(value.cancelledAt) &&
    typeof value.requiresActivation === "boolean" &&
    isNullableString(value.reason);
}

export function isEffectiveCommercialAccess(
  value: unknown
): value is EffectiveCommercialAccess {
  if (!isRecord(value)) return false;

  const subscriptionLifecycle = value.subscriptionLifecycle;
  const effective = value.effective;
  const grant = value.grant;

  return (
    (subscriptionLifecycle === null || isSubscriptionLifecycle(subscriptionLifecycle)) &&
    isRecord(effective) &&
    typeof effective.accessAllowed === "boolean" &&
    typeof effective.accessSource === "string" &&
    COMMERCIAL_ACCESS_SOURCES.has(effective.accessSource) &&
    isNullableString(effective.planCode) &&
    (effective.planSource === null ||
      (typeof effective.planSource === "string" &&
        COMMERCIAL_PLAN_SOURCES.has(effective.planSource))) &&
    isNullableString(effective.reason) &&
    isRecord(grant) &&
    typeof grant.active === "boolean" &&
    isNullableString(grant.planCode) &&
    (grant.type === null || grant.type === "complimentary") &&
    isNullableString(grant.startsAt) &&
    isNullableString(grant.endsAt)
  );
}

export function getLifecycleMessage(lifecycle: SubscriptionLifecycle) {
  switch (lifecycle.effectiveStatus) {
    case "trial":
      return lifecycle.trial.expiringSoon
        ? `Tu prueba termina en ${lifecycle.trial.daysRemaining} ${lifecycle.trial.daysRemaining === 1 ? "día" : "días"}.`
        : `Te quedan ${lifecycle.trial.daysRemaining} días de prueba.`;
    case "trial_expired":
      return "Tu prueba terminó. Activa Cometa POS para continuar.";
    case "grace_period":
      return "Tu cuenta está en periodo de gracia.";
    case "past_due":
      return "Tu suscripción tiene un pago pendiente.";
    case "suspended":
      return "Tu suscripción está suspendida.";
    case "cancelled":
      return "Tu suscripción está cancelada.";
    default:
      return null;
  }
}
