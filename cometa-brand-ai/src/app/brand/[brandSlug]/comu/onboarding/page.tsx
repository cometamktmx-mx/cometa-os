import { redirect } from "next/navigation";
import { requireBrandAccess } from "@/lib/brand-os/server";
import { getOnboardingSnapshot } from "@/lib/comu/onboarding";
import { OnboardingClient } from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function ComuOnboardingPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  await requireBrandAccess(brandSlug);
  const snapshot = await getOnboardingSnapshot(brandSlug);
  if (snapshot.seller?.status === "ACTIVE") redirect("/comu/seller");
  return <OnboardingClient initial={snapshot} />;
}
