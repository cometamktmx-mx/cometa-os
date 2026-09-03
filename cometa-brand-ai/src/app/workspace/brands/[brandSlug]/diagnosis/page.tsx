import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { getStrategicOnboarding } from "@/lib/onboarding/strategic";
import DiagnosisClient from "./diagnosis-client";
export const dynamic = "force-dynamic";
export default async function DiagnosisPage({ params }: { params: Promise<{ brandSlug: string }> }) { const { brandSlug } = await params; const data = await getStrategicOnboarding(brandSlug); if (!data) notFound(); return <WorkspaceShell><DiagnosisClient brandSlug={brandSlug} brandName={data.brand.name} initial={data} /></WorkspaceShell>; }
