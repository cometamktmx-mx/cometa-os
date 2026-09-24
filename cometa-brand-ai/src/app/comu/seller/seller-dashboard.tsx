"use client";

import { useCallback, useEffect, useState } from "react";
import StorefrontEditor from "./storefront-editor";
import WholesaleProductEditor from "./wholesale-product-editor";

type Seller = { id: string; public_name: string; status: string; verification_status: string; brand_slug: string; comu_storefronts?: { id: string; name: string }[] };
type Product = { id: string; name: string; description?: string | null };
type Listing = { id: string; product_id: string; status: string; public_slug: string };

export default function SellerDashboard() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/comu/sellers?mine=1");
    const data = await response.json() as { sellers?: Seller[] };
    const next = data.sellers || [];
    setSellers(next);
    const selected = sellerId || next[0]?.id || "";
    setSellerId(selected);
    if (!selected) return;
    const catalog = await fetch(`/api/comu/catalog?scope=eligible&sellerId=${encodeURIComponent(selected)}`);
    const catalogData = await catalog.json() as { products?: Product[]; existing?: Listing[] };
    setProducts(catalogData.products || []);
    setListings(catalogData.existing || []);
  }, [sellerId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function publish(productId: string) {
    const seller = sellers.find((item) => item.id === sellerId);
    if (!seller) return;
    const storefrontId = seller.comu_storefronts?.[0]?.id;
    if (!storefrontId) { setMessage("Configura un storefront antes de publicar."); return; }
    const response = await fetch("/api/comu/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, storefrontId, productId }) });
    const data = await response.json() as { ok?: boolean; error?: string };
    setMessage(data.ok ? "Producto publicado como borrador." : data.error || "No se pudo publicar.");
    void load();
  }

  async function changeStatus(listingId: string, status: string) {
    const response = await fetch("/api/comu/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, listingId, status }) });
    const data = await response.json() as { ok?: boolean; error?: string };
    setMessage(data.ok ? "Listing actualizado." : data.error || "No se pudo actualizar.");
    void load();
  }

  async function uploadMedia(listingId: string, file: File) {
    const form = new FormData(); form.set("sellerId", sellerId); form.set("listingId", listingId); form.set("file", file);
    const response = await fetch("/api/comu/media", { method: "POST", body: form });
    const data = await response.json() as { ok?: boolean; error?: string };
    setMessage(data.ok ? "Imagen cargada." : data.error || "No se pudo cargar la imagen.");
  }

  return <main className="mx-auto max-w-6xl px-5 py-12"><StorefrontEditor sellerId={sellerId} /><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Seller studio</p><h1 className="mt-3 text-5xl font-black tracking-[-.07em]">Vende en COMU.</h1><p className="mt-4 max-w-2xl text-slate-600">Publica productos reales de tu catálogo POS. COMU no duplica inventario ni variantes.</p>{message ? <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</p> : null}<div className="mt-10 rounded-3xl bg-white p-6 shadow-sm"><label className="text-sm font-bold">Seller</label><select value={sellerId} onChange={(event) => { setSellerId(event.target.value); }} className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-4 md:max-w-xl">{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.public_name} · {seller.status}</option>)}</select></div><section className="mt-8 grid gap-8 lg:grid-cols-2"><div className="rounded-3xl bg-white p-6"><h2 className="text-xl font-black">Productos POS elegibles</h2><div className="mt-4 space-y-3">{products.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 border-b border-black/5 py-3"><span className="font-semibold">{product.name}</span><button onClick={() => void publish(product.id)} className="rounded-full bg-[#17201d] px-4 py-2 text-xs font-bold text-white">Publicar</button></div>)}{!products.length ? <p className="text-sm text-slate-500">No hay productos POS elegibles o no tienes acceso.</p> : null}</div></div><div className="rounded-3xl bg-white p-6"><h2 className="text-xl font-black">Listings</h2><div className="mt-4 space-y-3">{listings.map((listing) => <div key={listing.id} className="border-b border-black/5 py-3"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{listing.public_slug}<small className="ml-2 text-xs text-slate-500">{listing.status}</small></span><label className="cursor-pointer rounded-full border border-black/10 px-3 py-2 text-xs font-bold">Imagen<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(listing.id, file); }} /></label><button onClick={() => void changeStatus(listing.id, listing.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED")} className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold">{listing.status === "PUBLISHED" ? "Ocultar" : "Publicar"}</button></div><WholesaleProductEditor sellerId={sellerId} listingId={listing.id} productId={listing.product_id} /></div>)}{!listings.length ? <p className="text-sm text-slate-500">Aún no hay listings.</p> : null}</div></div></section></main>;
}
