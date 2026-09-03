import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { getAdminMarketingStrategy } from "@/lib/marketing/strategy";
import StrategyEditor from "./strategy-editor";

export const dynamic = "force-dynamic";

export default async function AdminStrategyPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params; const context = await getAdminMarketingStrategy(brandSlug); if (!context) notFound();
  return <WorkspaceShell><StrategyEditor brandSlug={brandSlug} initial={context.strategy} brandName={String(context.brand.name)} /></WorkspaceShell>;
}
