"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; quantity: number; variant_listing_id: string; listing_id: string; effective_price?: number; is_available?: boolean; product_name?: string; comu_product_listings?: { title_override?: string; comu_sellers?: { public_name?: string } } };
const cartError = "No pudimos cargar tu carrito. Inténtalo nuevamente.";
export default function ComuCartPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  function load() {
    return fetch("/api/comu/cart").then(async (response) => {
      const data = await response.json() as { ok?: boolean; items?: Item[] };
      if (!response.ok || !data.ok || !Array.isArray(data.items)) {
        setItems([]);
        setMessage(response.status === 401 ? "Inicia sesión para ver tu carrito." : cartError);
        return;
      }
      setItems(data.items);
      setMessage("");
    }).catch(() => {
      setItems([]);
      setMessage(cartError);
    }).finally(() => { setLoading(false); });
  }
  async function remove(itemId: string) {
    try {
      const response = await fetch(`/api/comu/cart?itemId=${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!response.ok) { setMessage(cartError); return; }
      setLoading(true);
      await load();
    } catch { setMessage(cartError); }
  }
  useEffect(() => { void load(); }, []);
 const total=items.reduce((sum,item)=>sum+Number(item.effective_price||0)*Number(item.quantity),0); return <main className="mx-auto max-w-5xl px-5 py-12"><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Tu selección</p><h1 className="mt-3 text-5xl font-black tracking-[-.07em]">Carrito</h1>{loading?<p role="status" className="mt-6 text-sm">Cargando tu carrito…</p>:null}{message?<p className="mt-6 text-sm text-rose-700">{message}</p>:null}<div className="mt-10 space-y-3">{items.map((item)=><div key={item.id} className="flex items-center justify-between rounded-3xl bg-white p-5"><div><p className="font-black">{item.product_name || item.comu_product_listings?.title_override || "Producto COMU"}</p><p className="text-sm text-slate-500">{item.comu_product_listings?.comu_sellers?.public_name} · {item.quantity} pieza(s)</p></div><button onClick={() => void remove(item.id)} className="text-sm font-bold underline">Quitar</button></div>)}{!loading&&!items.length&&!message?<section className="rounded-3xl border border-dashed border-black/10 p-10 text-center"><h2 className="text-2xl font-black">Tu carrito está vacío.</h2><p className="mt-3 text-slate-500">Agrega algunas piezas antes de continuar.</p><Link href="/comu/search" className="mt-6 inline-flex rounded-full bg-emerald-800 px-6 py-3 font-bold text-white">Explorar productos</Link></section>:null}</div>{!loading&&!message&&items.length>0?<div className="mt-8 flex items-center justify-between rounded-3xl bg-[#17201d] p-6 text-white"><span className="font-bold">Total estimado</span><span className="text-2xl font-black">${total.toFixed(2)} MXN</span></div>:null}{!loading&&!message&&items.length?<Link href="/comu/checkout" className="mt-6 inline-flex rounded-full bg-emerald-700 px-6 py-3 font-bold text-white">Continuar al checkout</Link>:null}</main> }
