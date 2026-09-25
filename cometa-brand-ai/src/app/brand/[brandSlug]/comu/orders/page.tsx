import { requireBrandAccess } from "@/lib/brand-os/server";
import SellerOrders from "@/app/comu/seller/orders/page";

export const dynamic = "force-dynamic";

export default async function BrandComuOrdersPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  await requireBrandAccess(brandSlug);
  return <SellerOrders />;
}
