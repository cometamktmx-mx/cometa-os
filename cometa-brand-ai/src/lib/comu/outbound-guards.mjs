export function outboundGuard(kind) {
  const productionDefault = process.env.NODE_ENV === "production" && process.env.COMU_OUTBOUND_MONEY_ENABLED !== "true";
  if (process.env.COMU_OUTBOUND_MONEY_ENABLED === "false" || productionDefault) return { enabled: false, code: "OUTBOUND_MONEY_DISABLED" };
  const specific = kind === "transfer" ? process.env.COMU_TRANSFERS_ENABLED : kind === "refund" ? process.env.COMU_REFUNDS_ENABLED : kind === "reversal" ? process.env.COMU_REVERSALS_ENABLED : undefined;
  if (specific === "false" || (process.env.NODE_ENV === "production" && specific !== "true")) return { enabled: false, code: `${kind.toUpperCase()}S_DISABLED` };
  return { enabled: true, code: null };
}

export function assertOutboundEnabled(kind) {
  const result = outboundGuard(kind);
  if (!result.enabled) {
    const error = new Error(result.code);
    error.code = result.code;
    throw error;
  }
}
