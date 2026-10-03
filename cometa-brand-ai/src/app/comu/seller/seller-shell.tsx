"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SellerIcon } from "./seller-ui";

type Store = { id: string; brand_slug: string; public_name: string; status: string; publicSlug: string | null };
export default function SellerShell({ stores, children }: { stores: Store[]; children: ReactNode }) {
  const path = usePathname(), router = useRouter(); const [more, setMore] = useState(false);
  const store = stores.find(s => path.startsWith(`/comu/seller/${s.brand_slug}/`)) || stores[0];
  const base = store ? `/comu/seller/${encodeURIComponent(store.brand_slug)}` : "/comu/seller";
  const links = [
    ["Inicio", "home", `${base}/summary`], ["Pedidos", "bag", "/comu/seller/orders"], ["Productos", "box", `${base}/products`], ["Inventario", "stock", ""], ["Mayoreo", "tag", `${base}/wholesale`], ["Clientes", "users", ""], ["Finanzas", "wallet", "/comu/seller/finance"],
    ["Apariencia", "edit", `${base}/store`], ["Envíos", "truck", ""], ["Pagos", "wallet", `${base}/settings`], ["Configuración", "settings", `${base}/settings`],
  ];
  function nav(start: number, end: number) { return links.slice(start, end).map(([label, icon, href]) => href ? <Link key={label} href={href} aria-current={path === href && label !== "Pagos" ? "page" : undefined} onClick={() => setMore(false)}><SellerIcon name={icon} /><span>{label}</span></Link> : <span key={label} aria-disabled="true" title="Superficie aún no disponible"><SellerIcon name={icon} /><span>{label}</span></span>); }
  return <div className="comu-seller">
    <aside className="seller-sidebar"><Link href={`${base}/summary`} className="seller-wordmark">COMU<span>.</span><small>SELLER</small></Link>
      <div className="seller-store"><span className="seller-avatar">{store?.public_name.slice(0, 1) || "C"}</span><div><strong title={store?.public_name}>{store?.public_name || "Tu tienda"}</strong>{store?.publicSlug && <Link href={`/comu/sellers/${encodeURIComponent(store.publicSlug)}`}>Ver mi tienda →</Link>}</div></div>
      <nav aria-label="Seller principal">{nav(0, 7)}<p className="seller-nav-caption">MI TIENDA</p>{nav(7, 11)}</nav>
      <Link className="seller-back" href="/comu">← Ir a COMU</Link>
    </aside>
    <div className="seller-workspace"><header className="seller-topbar"><div className="seller-search"><SellerIcon name="search" /><input aria-label="Búsqueda contextual próximamente" placeholder="Buscar pedidos, productos, clientes…" disabled /></div><a className="seller-help-link" href="#seller-help" aria-label="Ayuda"><SellerIcon name="help" /></a><Link className="seller-identity" href="/comu/account"><span className="seller-avatar">{store?.public_name.slice(0, 1) || "C"}</span><span><strong>{store?.public_name || "Mi cuenta"}</strong><small>Vendedor</small></span></Link>{stores.length > 1 && <select aria-label="Elegir tienda" value={store?.brand_slug || ""} onChange={e => router.push(`/comu/seller/${encodeURIComponent(e.target.value)}/summary`)}>{stores.map(s => <option key={s.id} value={s.brand_slug}>{s.public_name}</option>)}</select>}</header>
      <div className="seller-content">{path === "/comu/seller/orders" || path === "/comu/seller/finance" ? <div className="seller-legacy">{children}</div> : children}</div>
    </div>
    {more && <div className="seller-mobile-menu"><div><h2>Tu tienda</h2><button onClick={() => setMore(false)} aria-label="Cerrar menú">✕</button></div><nav aria-label="Más opciones Seller">{nav(3, 11)}<Link href="/comu/account">Mi cuenta</Link><Link href="/comu">← Ir a COMU</Link></nav></div>}
    <nav className="seller-mobile-nav" aria-label="Seller móvil">{[["Inicio", "home", `${base}/summary`], ["Pedidos", "bag", "/comu/seller/orders"], ["Productos", "box", `${base}/products`], ["Tienda", "edit", `${base}/store`]].map(([label, icon, href]) => <Link key={label} href={href} aria-current={path === href ? "page" : undefined} onClick={() => setMore(false)}><SellerIcon name={icon} /><span>{label}</span></Link>)}<button aria-expanded={more} onClick={() => setMore(!more)}><SellerIcon name="more" /><span>Más</span></button></nav>
  </div>;
}
