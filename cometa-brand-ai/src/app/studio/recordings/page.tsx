import { StudioSubpageShell } from "@/app/studio/components/studio-subpage-shell";
import { getBrandProductionProfile } from "@/lib/studio/production";
import { getStudioWorkspaceData, requireStudioAccess } from "@/lib/studio/server";
import { RecordingsClient, type RecordingBrandGroup } from "./recordings-client";

export const dynamic = "force-dynamic";

export default async function RecordingsPage() { const studio = await requireStudioAccess(); const data = await getStudioWorkspaceData(studio); const reels = data.items.filter((item) => item.content_type === "reel"); const reelBrands = data.brands.filter((brand) => reels.some((item) => item.brand_slug === brand.slug)); const groups: RecordingBrandGroup[] = await Promise.all(reelBrands.map(async (brand) => { const brandReels = reels.filter((item) => item.brand_slug === brand.slug); const profile = await getBrandProductionProfile(String(brand.slug)); return { brandSlug: String(brand.slug), brandName: String(brand.name), profile, reels: brandReels.map((item) => ({ id: String(item.id), title: String(item.title || "Sin título"), status: String(item.status), publishDate: typeof item.publish_date === "string" ? item.publish_date : null, dueDate: typeof item.due_date === "string" ? item.due_date : null })) }; })); const changesCount = data.items.filter((item) => item.status === "changes_requested").length; return <StudioSubpageShell active="recordings" userName={studio.fullName || studio.email} changesCount={changesCount}><RecordingsClient groups={groups} /></StudioSubpageShell>; }
