import { StudioSubpageShell } from "@/app/studio/components/studio-subpage-shell";
import { getStudioWorkspaceData, requireStudioAccess } from "@/lib/studio/server";
import { PiecesClient, type StudioPieceListItem } from "./pieces-client";

export const dynamic = "force-dynamic";

export default async function PiecesPage() { const studio = await requireStudioAccess(); const data = await getStudioWorkspaceData(studio); const brandNames = new Map(data.brands.map((brand) => [String(brand.slug), String(brand.name)])); const items: StudioPieceListItem[] = data.items.map((item) => ({ id: String(item.id), brandName: brandNames.get(String(item.brand_slug)) || String(item.brand_slug), title: String(item.title || "Sin título"), contentType: typeof item.content_type === "string" ? item.content_type : null, distributionType: typeof item.distribution_type === "string" ? item.distribution_type : null, status: String(item.status), publishDate: typeof item.publish_date === "string" ? item.publish_date : null, dueDate: typeof item.due_date === "string" ? item.due_date : null })); const changesCount = items.filter((item) => item.status === "changes_requested").length; return <StudioSubpageShell active="pieces" userName={studio.fullName || studio.email} changesCount={changesCount}><PiecesClient items={items} /></StudioSubpageShell>; }
