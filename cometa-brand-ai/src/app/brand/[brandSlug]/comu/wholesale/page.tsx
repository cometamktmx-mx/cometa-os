import { requireBrandAccess } from "@/lib/brand-os/server";
import SellerDashboard from "@/app/comu/seller/seller-dashboard";
export const dynamic = "force-dynamic";
export default async function BrandComuWholesalePage({ params }: { params: Promise<{ brandSlug: string }> }) { const { brandSlug } = await params; const access = await requireBrandAccess(brandSlug); return <SellerDashboard brandSlug={access.brand.slug} view="wholesale" />; }
