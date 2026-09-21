export const COMU_FEATURES = {
  enabled: "COMU_ENABLED",
  sellerOnboarding: "COMU_SELLER_ONBOARDING_ENABLED",
  catalog: "COMU_CATALOG_ENABLED",
} as const;

export type ComuFeature = keyof typeof COMU_FEATURES;

export function isComuFeatureEnabled(feature: ComuFeature) {
  return process.env[COMU_FEATURES[feature]] === "true";
}

export function requireComuFeature(feature: ComuFeature) {
  if (!isComuFeatureEnabled(feature)) {
    const error = new Error(`COMU_FEATURE_DISABLED:${feature}`);
    Object.assign(error, { status: 404, code: "COMU_FEATURE_DISABLED" });
    throw error;
  }
}
