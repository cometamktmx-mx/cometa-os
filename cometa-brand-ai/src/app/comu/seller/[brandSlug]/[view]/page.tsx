import { notFound } from "next/navigation";
import { requireComuBrandSeller } from "@/lib/comu/seller-access";
import SellerDashboard from "../../seller-dashboard";
import SellerOverview from "../../seller-overview";

export const dynamic = "force-dynamic";
export default async function SellerPreparationPage({ params }: { params: Promise<{ brandSlug: string; view: string }> }) {
  const { brandSlug, view } = await params;
  if (view !== "summary" && view !== "store" && view !== "products" && view !== "wholesale" && view !== "settings") notFound();
  const seller = await requireComuBrandSeller(brandSlug);
  const base = `/comu/seller/${encodeURIComponent(seller.brand_slug)}`;
  return <main className={view === "summary" ? "seller-summary" : "seller-legacy"}>
    {view === "summary" ? <SellerOverview brandSlug={seller.brand_slug} /> : <SellerDashboard brandSlug={seller.brand_slug} view={view} basePath={base} />}
  </main>;
}
