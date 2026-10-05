import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PosApiError } from "@/lib/pos/server";
import { getSellerOrderStores, requireOrderBrand } from "@/lib/comu/seller-orders";
import SellerOrdersManager from "../orders-manager";
export const dynamic = "force-dynamic";
export default async function SellerOrders({ brandSlug, searchParams }: { brandSlug?: string; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (brandSlug) { const seller = await requireOrderBrand(brandSlug); return <SellerOrdersManager brandSlug={seller.brand_slug} sellerId={seller.id} />; }
  const stores = await getSellerOrderStores().catch(error => {
    if (error instanceof PosApiError && error.status === 401) redirect("/comu/login?next=%2Fcomu%2Fseller%2Forders");
    if (error instanceof PosApiError && error.status === 403) notFound();
    throw error;
  });
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params) for (const key of ["selected", "days", "status", "search", "page"]) { const value = params[key]; if (typeof value === "string") query.set(key, value); }
  if (stores.length === 1) redirect(`/comu/seller/${encodeURIComponent(stores[0].brand_slug)}/orders?${query}`);
  return <main><h1>Pedidos</h1><p>{stores.length ? "Selecciona la tienda que quieres administrar." : "No tienes tiendas con acceso a pedidos."}</p>{stores.map(s => <p key={s.id}><Link href={`/comu/seller/${encodeURIComponent(s.brand_slug)}/orders?${query}`}>{s.public_name}</Link></p>)}</main>;
}
