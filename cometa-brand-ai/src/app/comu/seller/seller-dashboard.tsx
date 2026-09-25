"use client";

import { useCallback, useEffect, useState } from "react";
import StorefrontEditor from "./storefront-editor";
import WholesaleProductEditor from "./wholesale-product-editor";
import LogisticsProfile from "./logistics-profile";

type Seller = { id: string; slug: string; public_name: string; status: string; verification_status: string; brand_slug: string; comu_storefronts?: { id: string; name: string }[] };
type Product = { id: string; name: string; description?: string | null };
type Listing = { id: string; product_id: string; status: string; public_slug: string };

export default function SellerDashboard({ brandSlug }: { brandSlug?: string }) {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [message, setMessage] = useState("");
  const base = brandSlug ? `/brand/${encodeURIComponent(brandSlug)}/comu` : "/workspace";
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
    const storefrontId = seller?.comu_storefronts?.[0]?.id;
    if (!seller || !storefrontId) { setMessage("Configura primero tu tienda."); return; }
    const response = await fetch("/api/comu/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, storefrontId, productId }) });
    const data = await response.json() as { ok?: boolean; error?: string };
    setMessage(data.ok ? "Producto agregado a tu catÃ¡logo." : data.error || "No se pudo publicar el producto.");
    void load();
  }
  async function changeStatus(listingId: string, status: string) {
    const response = await fetch("/api/comu/listings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, listingId, status }) });
    const data = await response.json() as { ok?: boolean; error?: string };
    setMessage(data.ok ? "Visibilidad actualizada." : data.error || "No se pudo actualizar.");
    void load();
  }
  async function uploadMedia(listingId: string, file: File) {
    const form = new FormData(); form.set("sellerId", sellerId); form.set("listingId", listingId); form.set("file", file);
    const response = await fetch("/api/comu/media", { method: "POST", body: form });
    const data = await response.json() as { ok?: boolean; error?: string };
    setMessage(data.ok ? "Imagen actualizada." : data.error || "No se pudo cargar la imagen.");
  }
  const seller = sellers.find((item) => item.id === sellerId);
  return <main className="min-h-screen bg-[#07100d] px-4 py-6 text-white sm:px-8 lg:px-10"><div className="mx-auto max-w-7xl"><header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">COMETA Â· COMU</p><h1 className="mt-2 text-4xl font-black tracking-[-.06em]">Administra tu tienda</h1><p className="mt-2 text-sm text-slate-400">Tu catÃ¡logo POS, listo para vender online.</p></div><nav className="flex flex-wrap gap-2 text-sm font-semibold text-slate-300"><a className="rounded-full bg-white/10 px-4 py-2 text-white" href={base}>Resumen</a><a className="rounded-full px-4 py-2 hover:bg-white/10" href={`${base}/orders`}>Pedidos</a><a className="rounded-full px-4 py-2 hover:bg-white/10" href={`${base}#storefront`}>Mi tienda</a><a className="rounded-full px-4 py-2 hover:bg-white/10" href={`${base}#products`}>Productos publicados</a><a className="rounded-full px-4 py-2 hover:bg-white/10" href={`${base}#shipping`}>EnvÃ­os</a></nav></header>{message ? <p className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-semibold text-emerald-100">{message}</p> : null}<section id="storefront" className="mt-8 rounded-3xl border border-white/10 bg-white/[.045] p-5 sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-300">Mi tienda</p><h2 className="mt-2 text-2xl font-black">AsÃ­ te ven tus compradores</h2></div>{seller?.brand_slug ? <a className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-black text-[#07100d]" href={`/comu/sellers/${seller.slug}`}>Ver tienda pÃºblica</a> : null}</div><div className="mt-5 rounded-2xl bg-[#101d18] p-1"><StorefrontEditor sellerId={sellerId} /></div></section><section id="products" className="mt-8 grid gap-8 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-white/[.045] p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-300">CatÃ¡logo POS</p><h2 className="mt-2 text-2xl font-black">Agrega productos</h2><div className="mt-5 space-y-2">{products.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#101d18] p-4"><span className="font-semibold">{product.name}</span><button onClick={() => void publish(product.id)} className="rounded-full bg-emerald-300 px-4 py-2 text-xs font-black text-[#07100d]">Publicar</button></div>)}{!products.length ? <p className="text-sm text-slate-400">No hay productos POS elegibles.</p> : null}</div></div><div className="rounded-3xl border border-white/10 bg-white/[.045] p-6"><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-300">Productos publicados</p><h2 className="mt-2 text-2xl font-black">Tu selecciÃ³n</h2><div className="mt-5 space-y-3">{listings.map((listing) => <div key={listing.id} className="rounded-2xl bg-[#101d18] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{listing.public_slug}</p><p className="text-xs text-slate-400">{listing.status === "PUBLISHED" ? "Publicado" : "Oculto"}</p></div><div className="flex gap-2"><label className="cursor-pointer rounded-full border border-white/15 px-3 py-2 text-xs font-bold">Imagen<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(listing.id, file); }} /></label><button onClick={() => void changeStatus(listing.id, listing.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED")} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold">{listing.status === "PUBLISHED" ? "Ocultar" : "Publicar"}</button></div></div><WholesaleProductEditor sellerId={sellerId} listingId={listing.id} productId={listing.product_id} /><LogisticsProfile sellerId={sellerId} productId={listing.product_id} /></div>)}{!listings.length ? <p className="text-sm text-slate-400">AÃºn no hay productos publicados.</p> : null}</div></div></section></div></main>;
}

