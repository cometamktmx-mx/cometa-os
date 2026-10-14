import { requireBrandAccess } from "@/lib/brand-os/server";
import { requireOrderBrand } from "@/lib/comu/seller-orders";
import SellerOrdersManager from "@/app/comu/seller/orders-manager";

export const dynamic = "force-dynamic";

export default async function BrandComuOrdersPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  await requireBrandAccess(brandSlug);
  const seller = await requireOrderBrand(brandSlug);
  return <SellerOrdersManager brandSlug={seller.brand_slug} sellerId={seller.id} />;
}
