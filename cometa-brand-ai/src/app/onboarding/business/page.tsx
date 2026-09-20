import BusinessOnboardingClient from "./business-onboarding-client";
import { isPosFoodOnboardingEnabled } from "@/lib/pos/features";

export default function BusinessOnboardingPage() {
  return <BusinessOnboardingClient posFoodOnboardingEnabled={isPosFoodOnboardingEnabled()} />;
}
