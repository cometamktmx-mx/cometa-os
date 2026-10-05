import { notFound, redirect } from "next/navigation";
import { PosApiError } from "@/lib/pos/server";
import { requireComuBrandSeller } from "@/lib/comu/seller-access";
import SellerDashboard from "../../seller-dashboard";
import SellerOverview from "../../seller-overview";
import { requireOrderBrand } from "@/lib/comu/seller-orders";
import SellerOrdersManager from "../../orders-manager";

export const dynamic = "force-dynamic";
export default async function SellerPreparationPage({ params }: { params: Promise<{ brandSlug: string; view: string }> }) {
  const { brandSlug, view } = await params;
  if (view === "orders") {
    const seller = await requireOrderBrand(brandSlug).catch(error => {
      if (error instanceof PosApiError && error.status === 401) redirect("/comu/login?next=" + encodeURIComponent(`/comu/seller/${brandSlug}/orders`));
      if (error instanceof PosApiError && error.status === 403) notFound();
      throw error;
    });
    return <main className="seller-legacy"><SellerOrdersManager brandSlug={seller.brand_slug} sellerId={seller.id} /></main>;
  }
  if (view !== "summary" && view !== "store" && view !== "products" && view !== "wholesale" && view !== "settings") notFound();
  const seller = await requireComuBrandSeller(brandSlug);
  const base = `/comu/seller/${encodeURIComponent(seller.brand_slug)}`;
  return <main className={view === "summary" ? "seller-summary" : view === "products" ? "seller-products-page" : "seller-legacy"}>
    {view === "summary" ? <SellerOverview brandSlug={seller.brand_slug} /> : <SellerDashboard brandSlug={seller.brand_slug} view={view} basePath={base} />}
  </main>;
}
