"use client";
import Image from "next/image";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatMxn } from "@/lib/comu/buyer-experience";
import type { PublicListing } from "./public-ui";

export type CartItem = { id: string; listing_id: string; variant_listing_id: string; quantity: number; effective_price: number; product_name?: string; is_available?: boolean; wholesale_mode?: string; purchase_mode?: "PIECES" | "RUN"; run_id?: string; run_count?: number; comu_product_listings?: { public_slug?: string; title_override?: string; comu_sellers?: { public_name?: string; slug?: string } } };
type Commerce = { items: CartItem[]; catalog: PublicListing[]; loading: boolean; error: string; refresh: () => Promise<void>; accepted: (items: CartItem[], image: string | undefined, from: HTMLElement | null, openDrawer?: boolean) => void; favorite: (id: string) => Promise<void>; favorites: string[] };
const Context = createContext<Commerce | null>(null);
export function useCommerce() { const value = useContext(Context); if (!value) throw new Error("COMU commerce context missing"); return value; }
export function CommerceProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]), [catalog, setCatalog] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]), [notice, setNotice] = useState("");
  const drawer = useRef<HTMLDialogElement>(null), noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favoriteBusy = useRef(new Set<string>());
  const notify = useCallback((message: string) => { setNotice(message); if (noticeTimer.current) clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(""), 4500); }, []);
  const refresh = useCallback(async () => {
    try { const response = await fetch("/api/comu/cart", { cache: "no-store" }); const data = await response.json();
      if (!response.ok || !data.ok) { setError(response.status === 401 ? "Inicia sesión para ver tu selección." : "No pudimos actualizar el carrito."); setItems([]); return; }
      setItems(data.items); setError("");
    } catch { setError("No pudimos actualizar el carrito. Inténtalo nuevamente."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const task = setTimeout(() => void refresh(), 0); void fetch("/api/comu/buyer/experience").then(r => r.json()).then(d => { if (d.ok) setFavorites(d.favorites || []); }).catch(() => {}); return () => { clearTimeout(task); if (drawerTimer.current) clearTimeout(drawerTimer.current); if (noticeTimer.current) clearTimeout(noticeTimer.current); }; }, [refresh]);
  useEffect(() => { if (items.length) void fetch("/api/comu/catalog").then(r => r.json()).then(d => { if (d.ok) setCatalog(d.listings || []); }).catch(() => {}); }, [items]);
  async function favorite(id: string) {
    if (favoriteBusy.current.has(id)) return;
    favoriteBusy.current.add(id);
    try {
      const response = await fetch("/api/comu/buyer/experience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "favorite", listingId: id, saved: !favorites.includes(id) }) });
      if (response.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      const data = await response.json(); if (!response.ok) { notify(data.error || "No pudimos guardar esta pieza."); return; }
      setFavorites(previous => data.saved ? [...new Set([...previous, id])] : previous.filter(value => value !== id));
      notify(data.saved ? "Guardado en favoritos" : "Eliminado de favoritos");
    } catch { notify("No pudimos guardar esta pieza. Inténtalo nuevamente."); } finally { favoriteBusy.current.delete(id); }
  }
  function accepted(next: CartItem[], image: string | undefined, from: HTMLElement | null, openDrawer = true) {
    setItems(next); setError(""); notify("Producto agregado");
    const target = document.querySelector<HTMLElement>("[data-comu-cart]");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && target) {
      target.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 650 });
      if (image && from) {
        const start = from.getBoundingClientRect(), end = target.getBoundingClientRect();
        const thumb = document.createElement("img"); thumb.src = image; thumb.alt = ""; thumb.setAttribute("aria-hidden", "true");
        Object.assign(thumb.style, { position: "fixed", top: `${start.top}px`, left: `${start.left}px`, width: "56px", height: "56px", objectFit: "cover", borderRadius: "12px", pointerEvents: "none", zIndex: "100" }); document.body.append(thumb);
        const animation = thumb.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${end.left - start.left}px,${end.top - start.top}px) scale(.25)`, opacity: 0 }], { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)" });
        animation.finished.finally(() => thumb.remove());
      }
    }
    if (drawerTimer.current) clearTimeout(drawerTimer.current);
    if (openDrawer && window.matchMedia("(min-width: 1024px)").matches) drawerTimer.current = setTimeout(() => drawer.current?.showModal(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
  }
  return <Context.Provider value={{ items, catalog, loading, error, refresh, accepted, favorite, favorites }}>{children}
    <div role="status" aria-live="polite" className={notice ? "fixed bottom-6 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-2xl bg-[#252d28] px-6 py-4 text-sm text-white shadow-lg" : "sr-only"}>{notice}</div>
    <dialog ref={drawer} className="comu-drawer" aria-labelledby="mini-cart-title"><div className="flex items-center justify-between"><h2 id="mini-cart-title" className="text-2xl font-semibold">Tu selección</h2><button aria-label="Cerrar carrito" className="p-3 text-2xl" onClick={() => drawer.current?.close()}>×</button></div><ul className="mt-8 divide-y divide-[#d9cfc4]">{items.map(item => <li key={item.id} className="flex gap-4 py-5"><CartThumbnail item={item} catalog={catalog} /><div className="min-w-0 flex-1"><p className="text-xs text-[#72675e]">{item.comu_product_listings?.comu_sellers?.public_name}</p><p className="mt-1 font-semibold">{item.product_name || item.comu_product_listings?.title_override}</p><p className="mt-1 text-sm text-[#72675e]">{cartVariant(item, catalog)} · {item.quantity} piezas</p><p className="mt-2 text-sm">{formatMxn(item.effective_price * item.quantity)}</p></div></li>)}</ul><div className="mt-6 flex justify-between border-t border-[#d9cfc4] pt-5 font-semibold"><span>Subtotal</span><span>{formatMxn(items.reduce((sum, item) => sum + item.effective_price * item.quantity, 0))}</span></div><Link href="/comu/cart" onClick={() => drawer.current?.close()} className="comu-button mt-7 w-full">Ir al carrito</Link><button className="comu-button comu-secondary mt-3 w-full" onClick={() => drawer.current?.close()}>Seguir comprando</button></dialog>
  </Context.Provider>;
}
export function CartLink() { const { items } = useCommerce(); const count = items.reduce((sum, item) => sum + Number(item.quantity), 0); return <Link data-comu-cart href="/comu/cart" className="inline-flex items-center gap-2 rounded-full border border-[#d9cfc4] px-3 py-2 text-sm font-semibold" aria-label={`Carrito, ${count} piezas`}>Carrito{count > 0 && <span className="rounded-full bg-[#252d28] px-2 py-0.5 text-xs text-white">{count}</span>}</Link>; }
export function FavoriteButton({ id }: { id: string }) { const { favorite, favorites } = useCommerce(); const saved = favorites.includes(id); return <button type="button" aria-label={saved ? "Quitar de favoritos" : "Guardar en favoritos"} aria-pressed={saved} onClick={() => void favorite(id)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-[#fffdf9]/95 text-xl text-[#5f4938]">{saved ? "♥" : "♡"}</button>; }
export function cartVariant(item: CartItem, catalog: PublicListing[]) { return catalog.find(row => row.id === item.listing_id)?.variants?.find(row => row.id === item.variant_listing_id)?.productVariant?.name || ""; }
export function CartThumbnail({ item, catalog }: { item: CartItem; catalog: PublicListing[] }) { const listing = catalog.find(row => row.id === item.listing_id); const image = listing?.media?.find(row => row.is_primary)?.public_url || listing?.product?.image_url; return <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-[#ebe7e1]">{image && <Image unoptimized src={image} alt={item.product_name || "Producto"} fill sizes="80px" className="object-cover" />}</div>; }
