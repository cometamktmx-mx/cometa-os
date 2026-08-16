export const POS_PLAN_CODES = ["start", "pro", "multi"] as const;

export type PosPlanCode = (typeof POS_PLAN_CODES)[number];
export type PosPlanCodeWithLegacy = PosPlanCode | "pos_start";

export type PosCommercialPlan = {
  code: PosPlanCodeWithLegacy;
  name: string;
  monthlyPriceMxn: string;
};

export type PosCommercialLimits = {
  locations: number;
  registers: number;
  users: number;
};

export type PosCommercialUsage = PosCommercialLimits;

export type PosCommercialContext = {
  plan: PosCommercialPlan;
  limits: PosCommercialLimits;
  usage: PosCommercialUsage;
};

const KNOWN_PLAN_CODES = new Set<string>([...POS_PLAN_CODES, "pos_start"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredNonNegativeInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid POS commercial limit: ${field}.`);
  }

  return value;
}

function decimalMxn(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value.toFixed(2);
  }

  if (typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value)) {
    return Number(value).toFixed(2);
  }

  throw new Error("Invalid POS plan price.");
}

export function resolvePosCommercialContext(input: {
  plan: unknown;
  limits: unknown;
  usage: PosCommercialUsage;
}): PosCommercialContext {
  if (!isRecord(input.plan) || !isRecord(input.limits)) {
    throw new Error("Invalid POS commercial plan response.");
  }

  const code = input.plan.code;
  const name = input.plan.name;

  if (typeof code !== "string" || !KNOWN_PLAN_CODES.has(code) || typeof name !== "string") {
    throw new Error("Unknown POS commercial plan.");
  }

  return {
    plan: {
      code: code as PosPlanCodeWithLegacy,
      name,
      monthlyPriceMxn: decimalMxn(input.plan.list_price),
    },
    limits: {
      locations: requiredNonNegativeInteger(input.limits.max_locations, "locations"),
      registers: requiredNonNegativeInteger(input.limits.max_registers, "registers"),
      users: requiredNonNegativeInteger(input.limits.max_users, "users"),
    },
    usage: {
      locations: requiredNonNegativeInteger(input.usage.locations, "usage.locations"),
      registers: requiredNonNegativeInteger(input.usage.registers, "usage.registers"),
      users: requiredNonNegativeInteger(input.usage.users, "usage.users"),
    },
  };
}
