import "server-only";

export function isPosFoodOnboardingEnabled() {
  return process.env.ENABLE_POS_FOOD_ONBOARDING === "true";
}
