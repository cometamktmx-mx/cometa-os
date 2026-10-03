import Link from "next/link";
import { notFound } from "next/navigation";
import { requireComuBrandSeller } from "@/lib/comu/seller-access";
import SellerDashboard from "../../seller-dashboard";

export const dynamic = "force-dynamic";
export default async function SellerPreparationPage({ params }: { params: Promise<{ brandSlug: string; view: string }> }) {
  const { brandSlug, view } = await params;
  if (view !== "summary" && view !== "store" && view !== "products" && view !== "wholesale" && view !== "settings") notFound();
  const seller = await requireComuBrandSeller(brandSlug);
  const base = `/comu/seller/${encodeURIComponent(seller.brand_slug)}`;
  return <main className="min-h-screen bg-[#050907] px-5 py-8 text-white">
    <div className="mx-auto max-w-7xl">
      {seller.status === "PREPARING" && <p role="status" className="mb-5 rounded-xl border border-emerald-300/30 p-4">Tu tienda está en preparación. COMETA aprobó tu acceso; la activación comercial requiere revisión, 10 publicaciones elegibles y pagos configurados.</p>}
      <nav aria-label="Administrar tienda COMU" className="mb-8 flex flex-wrap gap-5">
        {[["summary", "Resumen"], ["store", "Tienda"], ["products", "Catálogo"], ["wholesale", "Mayoreo"], ["settings", "Configuración y pagos"]].map(([path, label]) => <Link key={path} href={`${base}/${path}`} aria-current={view === path ? "page" : undefined}>{label}</Link>)}
      </nav>
      <SellerDashboard brandSlug={seller.brand_slug} view={view} basePath={base} />
    </div>
  </main>;
}
