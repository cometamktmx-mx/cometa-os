"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { buyerOrderPresentation, buyerSection, buyerSections } from "@/lib/comu/buyer-experience";
import { formatOrderMoney } from "@/lib/comu/buyer-order-presentation";
import { createClient } from "@/lib/supabase/client";
import { ProductCard, type PublicListing } from "../../components/public-ui";
import { useCommerce } from "../../components/commerce";
import { AccountIcon } from "./account-icon";

type Address = { id: string; label: string; recipient_name: string; phone: string; line1: string; line2?: string; city: string; state: string; postal_code: string; country?: string; references?: string; is_default: boolean };
export type BuyerOrder = { id: string; order_number: string; status: string; currency: string; presentationStatus?: string; presentationLabel?: string; fulfillment_status?: string; created_at: string; grand_total: number; comu_order_suborders?: Array<{ comu_sellers?: { public_name: string } }>; comu_order_items?: Array<{ id: string; quantity: number; comu_order_item_snapshots?: Array<{ snapshot?: { listingTitle?: string; image?: string } }> }> };
type Experience = { profile: { displayName: string; email: string; phone?: string }; foundationReady: boolean; points: Array<{ points: number; created_at: string; expires_at: string }> };
const addressFields = [["label", "Nombre (casa, trabajo u otro)"], ["recipient_name", "Nombre de quien recibe"], ["phone", "Teléfono"], ["postal_code", "Código postal"], ["line1", "Calle y número"], ["line2", "Interior (opcional)"], ["city", "Ciudad"], ["state", "Estado"]] as const;

function AccountEmpty({ title, body, action = "Explorar COMU" }: { title: string; body: string; action?: string }) {
  return <div className="buyer-empty"><AccountIcon name="Mis pedidos" /><h3>{title}</h3><p>{body}</p><Link href="/comu/search" className="comu-button comu-secondary">{action}</Link></div>;
}
export default function BuyerAccount({ initialSection }: { initialSection?: string }) {
  const { favorites: savedIds } = useCommerce();
  const [section, setSection] = useState(() => buyerSection(initialSection));
  const [account, setAccount] = useState<Experience | null>(null), [orders, setOrders] = useState<BuyerOrder[]>([]), [addresses, setAddresses] = useState<Address[]>([]), [catalog, setCatalog] = useState<PublicListing[]>([]);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null), [deleting, setDeleting] = useState<Address | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}), [modalError, setModalError] = useState("");
  const [page, setPage] = useState(1), [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [filter, setFilter] = useState("Todos"), [asOf, setAsOf] = useState(0);
  const readVersion = useRef(0);
  const invalidateRead = useCallback(() => { readVersion.current++; }, []);
  const dialog = useRef<HTMLDialogElement>(null), deleteDialog = useRef<HTMLDialogElement>(null), operation = useRef(false), heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    const version = ++readVersion.current;
    setLoading(true);
    try {
      const responses = await Promise.all(["/api/comu/buyer/experience", `/api/comu/orders?days=90&page=${page}&status=${({ Todos: "ALL", "En preparación": "PREPARING", "En camino": "IN_TRANSIT", Entregados: "DELIVERED", "Con incidencia": "ISSUE", Cancelados: "CANCELLED" } as Record<string, string>)[filter] || "ALL"}`, "/api/comu/buyer/addresses", "/api/comu/catalog"].map(url => fetch(url, { cache: "no-store" })));
      if (responses.some(response => response.status === 401)) { window.location.assign("/comu/login?next=%2Fcomu%2Faccount%2Fbuyer"); return; }
      if (responses.some(response => !response.ok)) throw new Error();
      const [profile, history, delivery, products] = await Promise.all(responses.map(response => response.json()));
      if (version !== readVersion.current) return;
      if ([profile, history, delivery, products].some(data => !data.ok)) throw new Error();
      setAccount(profile); setOrders(history.orders || []); setPagination(history.pagination || { total: 0, totalPages: 0 }); setAddresses(delivery.addresses || []); setCatalog(products.listings || []); setAsOf(Date.now()); setError("");
    } catch { if (version === readVersion.current) setError("No pudimos cargar tu cuenta. Tu información sigue guardada."); } finally { if (version === readVersion.current) setLoading(false); }
  }, [filter, page]);
  useEffect(() => { const task = setTimeout(() => void load(), 0); return () => { clearTimeout(task); invalidateRead(); }; }, [load, invalidateRead]);
  const favorites = catalog.filter(row => savedIds.includes(row.id));
  const mainAddress = addresses.find(row => row.is_default);
  const availablePoints = account?.foundationReady ? account.points.filter(row => new Date(row.expires_at).getTime() > asOf).reduce((sum, row) => sum + Number(row.points), 0) : 0;
  function choose(title: string) {
    if (title === "Mis pedidos") { window.location.assign("/comu/account/orders"); return; }
    setSection(title); setNotice(""); setFilter("Todos"); setPage(1);
    window.history.replaceState(null, "", "/comu/account/buyer?section=" + encodeURIComponent(title));
    requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
  }
  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (operation.current) return;
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const errors: Record<string, string> = {};
    for (const [key] of addressFields) if (key !== "line2" && !String(form[key] || "").trim()) errors[key] = "Completa este campo.";
    if (!/^[0-9]{5}$/.test(String(form.postal_code).trim())) errors.postal_code = "Escribe un código postal de 5 dígitos.";
    setFieldErrors(errors); setModalError("");
    if (Object.keys(errors).length) { event.currentTarget.querySelector<HTMLInputElement>('[name="' + Object.keys(errors)[0] + '"]')?.focus(); return; }
    operation.current = true; setBusy(true);
    const body = editing ? { ...form, id: editing.id } : { label: form.label, recipientName: form.recipient_name, phone: form.phone, line1: form.line1, line2: form.line2, city: form.city, state: form.state, postalCode: form.postal_code, country: "MX", isDefault: false };
    try {
      const response = await fetch("/api/comu/buyer/addresses", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || !data.ok) { setModalError(data.error || "No pudimos guardar la dirección."); return; }
      dialog.current?.close(); setNotice("Dirección guardada"); await load();
    } catch { setModalError("No pudimos guardar la dirección. Inténtalo nuevamente."); } finally { operation.current = false; setBusy(false); }
  }
  async function addressAction(address: Address, action: "delete" | "default") {
    if (operation.current) return; operation.current = true; setBusy(true); setModalError("");
    try {
      const response = await fetch("/api/comu/buyer/addresses" + (action === "delete" ? "?id=" + encodeURIComponent(address.id) : ""), { method: action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, ...(action === "default" ? { body: JSON.stringify({ id: address.id, action }) } : {}) });
      const data = await response.json();
      if (!response.ok || !data.ok) { if (action === "delete") setModalError(data.error || "No pudimos eliminar la dirección."); else setNotice(data.error || "No pudimos cambiar tu dirección principal."); return; }
      deleteDialog.current?.close(); setNotice("Direcciones actualizadas"); await load();
    } catch { if (action === "delete") setModalError("No pudimos eliminar la dirección."); else setNotice("No pudimos actualizar la dirección."); } finally { operation.current = false; setBusy(false); }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (operation.current) return;
    const form = new FormData(event.currentTarget), displayName = String(form.get("displayName") || "").trim(), phone = String(form.get("phone") || "").trim();
    if (!displayName || displayName.length > 100 || (phone && !/^[+\d\s()-]{7,25}$/.test(phone))) { setNotice("Revisa tu nombre y teléfono antes de guardar."); return; }
    operation.current = true; setBusy(true);
    try {
      const response = await fetch("/api/comu/buyer/experience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", displayName, phone }) });
      const data = await response.json();
      setNotice(response.ok && data.ok ? "Tus datos se guardaron correctamente." : data.error || "No pudimos actualizar tus datos."); if (response.ok && data.ok) await load();
    } catch { setNotice("No pudimos actualizar tus datos."); } finally { operation.current = false; setBusy(false); }
  }
  async function signOut() {
    if (operation.current) return; operation.current = true; setBusy(true);
    try { const { error } = await createClient().auth.signOut(); if (error) throw error; window.location.assign("/comu/account"); }
    catch { setNotice("No pudimos cerrar tu sesión. Inténtalo nuevamente."); } finally { operation.current = false; setBusy(false); }
  }
  function editAddress(address: Address | null) { setEditing(address); setFieldErrors({}); setModalError(""); dialog.current?.showModal(); }
  const menu = (mobile = false) => <nav aria-label={mobile ? "Opciones de tu cuenta" : "Mi cuenta"} className={mobile ? "buyer-mobile-menu" : "buyer-side-nav"}>{buyerSections.filter(title => !mobile || title !== "Resumen").map(title => <button key={title} aria-current={section === title ? "page" : undefined} onClick={() => choose(title)}><AccountIcon name={title} /><span>{title}</span>{mobile && <AccountIcon name="Flecha" />}</button>)}</nav>;
  let content: ReactNode;
  if (section === "Resumen") content = <>
    <section className="buyer-hero"><p className="comu-eyebrow">Tu espacio, tu estilo</p><h2>¡Hola{account?.profile.displayName ? ", " + account.profile.displayName.split(" ")[0] : ""}!</h2><p>Gracias por ser parte de la comunidad COMU.</p><span className="buyer-hero-word" aria-hidden="true">COMU.</span></section>
    <div className="buyer-metrics">{[["Mis pedidos", pagination.total, "Pedidos en 90 días"], ["Favoritos", savedIds.length, "Productos favoritos"], ["Puntos y recompensas", availablePoints, "Puntos COMU"]].map(([title, value, label]) => <button key={title} onClick={() => choose(String(title))}><AccountIcon name={String(title)} /><strong>{value}</strong><span>{label}</span></button>)}<button className="buyer-reward-metric" onClick={() => choose("Puntos y recompensas")}><AccountIcon name="Puntos y recompensas" /><strong>Por descubrir</strong><span>Recompensas</span></button></div>
    {menu(true)}
    <div className="buyer-activity"><section><div className="buyer-section-heading"><h2>Tu actividad reciente</h2><button onClick={() => choose("Mis pedidos")}>Ver todos mis pedidos →</button></div><OrderList orders={orders.slice(0, 2)} /></section><aside className="buyer-discover"><p className="comu-eyebrow">Encuentra tu próxima pieza</p><h2>Descubre nuevas colecciones</h2><p>Una nueva mirada a las marcas de nuestra comunidad.</p><Link href="/comu/search">Ver novedades →</Link></aside></div>
    <div className="buyer-address-summary"><AccountIcon name="Direcciones" /><div><h3>Tu dirección principal</h3><p>{mainAddress ? [mainAddress.line1, mainAddress.line2, mainAddress.city].filter(Boolean).join(", ") : "Agrega una dirección para tus próximas compras."}</p></div><button onClick={() => choose("Direcciones")}>Gestionar →</button></div>
  </>;
  else if (section === "Mis pedidos") content = <><p className="buyer-intro">Pedidos de los últimos 90 días.</p><div className="buyer-filters" role="group" aria-label="Filtrar pedidos">{["Todos", "En preparación", "En camino", "Entregados", "Con incidencia", "Cancelados"].map(value => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{value}</button>)}</div><OrderList orders={orders} />{pagination.totalPages > 1 && <nav aria-label="Páginas de pedidos"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span> {page} de {pagination.totalPages} </span><button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button></nav>}</>;
  else if (section === "Direcciones") content = <><div className="buyer-section-heading"><p className="buyer-intro">Gestiona tus direcciones de envío.</p><button onClick={() => editAddress(null)} className="comu-button">+ Agregar dirección</button></div>{addresses.length ? <div className="buyer-address-grid">{addresses.map(address => <article key={address.id} className={"buyer-address-card" + (address.is_default ? " is-primary" : "")}><div className="buyer-section-heading"><h3><AccountIcon name="Direcciones" />{address.label}</h3>{address.is_default && <span className="buyer-chip green">Dirección principal</span>}</div><address>{address.recipient_name}<br />{address.line1} {address.line2}<br />{address.city}, {address.state}<br />{address.postal_code}{address.country ? " · " + address.country : ""}<br />{address.phone}</address>{address.references && <p className="buyer-reference">Referencias: {address.references}</p>}<div className="buyer-address-actions"><button disabled={busy} onClick={() => editAddress(address)}>Editar</button><button disabled={busy} onClick={() => { setDeleting(address); setModalError(""); deleteDialog.current?.showModal(); }}>Eliminar</button>{!address.is_default && <button disabled={busy} onClick={() => void addressAction(address, "default")}>Hacer principal</button>}</div></article>)}</div> : <div className="buyer-empty"><AccountIcon name="Direcciones" /><h3>Tu próxima pieza, en el lugar indicado</h3><p>Aún no tienes direcciones guardadas. La primera será tu dirección principal.</p><button className="comu-button comu-secondary" onClick={() => editAddress(null)}>Agregar dirección</button></div>}</>;
  else if (section === "Favoritos") content = <><p className="buyer-intro">Productos que guardaste</p>{favorites.length ? <div className="buyer-favorites">{favorites.map(listing => <ProductCard key={listing.id} listing={listing} />)}</div> : <AccountEmpty title="Tu lista de favoritos está esperando algo especial." body={account?.foundationReady ? "Guarda las piezas que te gusten para volver a ellas cuando quieras." : "Guardar favoritos estará disponible próximamente. Mientras tanto, descubre tu próxima pieza."} action="Descubrir productos" />}{savedIds.length > favorites.length && <p className="buyer-intro">Algunas piezas guardadas ya no están disponibles en el catálogo.</p>}</>;
  else if (section === "Mis datos") content = <><p className="buyer-intro">Los detalles que hacen este espacio tuyo.</p><form key={account?.profile.displayName + (account?.profile.phone || "")} noValidate onSubmit={saveProfile} className="buyer-profile"><label>Nombre completo<input name="displayName" autoComplete="name" maxLength={100} defaultValue={account?.profile.displayName} className="comu-field" /></label><label>Correo electrónico<input type="email" readOnly value={account?.profile.email || ""} className="comu-field" /><span>Este correo está vinculado a tu cuenta.</span></label><label>Teléfono<input type="tel" autoComplete="tel" name="phone" maxLength={25} defaultValue={account?.profile.phone || ""} className="comu-field" /></label><button disabled={busy} className="comu-button">{busy ? "Guardando…" : "Guardar cambios"}</button></form><div className="buyer-security"><h3>Tu acceso a COMU</h3><p>Usa el proceso seguro de recuperación de tu cuenta para cambiar tu contraseña.</p><Link href="/comu/forgot-password">Cambiar contraseña →</Link></div></>;
  else content = <><section className="buyer-points"><AccountIcon name="Puntos y recompensas" /><strong>{availablePoints}</strong><span>puntos COMU</span><a href="#buyer-points-history">Historial →</a></section><p className="buyer-intro">{account?.foundationReady ? "Consulta tus movimientos y sus fechas de vencimiento." : "El programa de puntos estará disponible próximamente. No tienes puntos activos."}</p><section className="buyer-rewards"><h2>Mis recompensas</h2><p>Cuando tengas una recompensa disponible, encontrarás aquí sus condiciones. No hay cupones disponibles para aplicar.</p></section><section id="buyer-points-history" className="buyer-history"><h2>Historial</h2>{account?.points.length ? <ul>{account.points.map((row, index) => <li key={row.created_at + index}><div><strong>Reseña verificada</strong><p>Vence {new Date(row.expires_at).toLocaleDateString("es-MX")}</p></div><span>+{row.points}</span></li>)}</ul> : <p>Aún no hay movimientos para mostrar.</p>}</section></>;

  return <main className="buyer-account"><div className="buyer-topline"><p className="comu-eyebrow">Mi espacio COMU</p><div><button aria-label="Ver mis favoritos" onClick={() => choose("Favoritos")}><AccountIcon name="Favoritos" /><span>{savedIds.length}</span></button><button aria-label="Ver mis datos" onClick={() => choose("Mis datos")} className="buyer-avatar">{account?.profile.displayName?.slice(0, 1).toUpperCase() || <AccountIcon name="Mis datos" />}</button></div></div><div className="buyer-layout"><aside className="buyer-sidebar"><h2>Mi cuenta</h2>{menu()}<button disabled={busy} className="buyer-signout" onClick={() => void signOut()}><AccountIcon name="Salir" />Cerrar sesión</button></aside><div className="buyer-main"><div className="buyer-page-heading">{section !== "Resumen" && <button className="buyer-back" onClick={() => choose("Resumen")}>← Mi cuenta</button>}<h1 ref={heading} tabIndex={-1}>{section === "Resumen" ? "Mi cuenta" : section}</h1></div>{loading ? <div className="buyer-loading" role="status"><div /><p>Preparando tu espacio…</p></div> : error ? <div className="buyer-empty" role="alert"><h2>No pudimos abrir tu cuenta</h2><p>{error}</p><button onClick={() => void load()} className="comu-button">Reintentar</button></div> : content}{notice && <p role="status" className="buyer-notice">{notice}</p>}<button disabled={busy} className="buyer-mobile-signout" onClick={() => void signOut()}><AccountIcon name="Salir" />Cerrar sesión</button></div></div>
    <nav className="buyer-bottom-nav" aria-label="Navegación móvil COMU"><Link href="/comu"><AccountIcon name="Resumen" />Inicio</Link><Link href="/comu/search"><AccountIcon name="Categorías" />Categorías</Link><button onClick={() => choose("Favoritos")} aria-current={section === "Favoritos" ? "page" : undefined}><AccountIcon name="Favoritos" />Favoritos</button><button onClick={() => choose("Resumen")} aria-current={section !== "Favoritos" ? "page" : undefined}><AccountIcon name="Mis datos" />Cuenta</button></nav>
    <dialog ref={dialog} className="comu-modal buyer-dialog" aria-labelledby="address-title" onCancel={event => { if (busy) event.preventDefault(); }}><div className="buyer-section-heading"><h2 id="address-title">{editing ? "Editar dirección" : "Agregar dirección"}</h2><button disabled={busy} onClick={() => dialog.current?.close()} aria-label="Cerrar">×</button></div><p>Para que tus próximas piezas lleguen a ti.</p><form key={editing?.id || "new"} noValidate onSubmit={saveAddress} className="buyer-address-form">{addressFields.map(([name, label]) => <label key={name}>{label}<input name={name} type={name === "phone" ? "tel" : "text"} inputMode={name === "postal_code" ? "numeric" : undefined} maxLength={200} aria-required={name !== "line2"} aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? "error-" + name : undefined} defaultValue={editing ? String(editing[name] || "") : ""} className="comu-field" />{fieldErrors[name] && <span id={"error-" + name} className="buyer-field-error">{fieldErrors[name]}</span>}</label>)}{modalError && <p role="alert" className="buyer-field-error buyer-form-wide">{modalError}</p>}<div className="buyer-form-wide buyer-form-actions"><button type="button" disabled={busy} className="comu-button comu-secondary" onClick={() => dialog.current?.close()}>Cancelar</button><button disabled={busy} className="comu-button">{busy ? "Guardando…" : "Guardar dirección"}</button></div></form></dialog>
    <dialog ref={deleteDialog} className="comu-modal buyer-dialog" aria-labelledby="delete-title" onCancel={event => { if (busy) event.preventDefault(); }}><h2 id="delete-title">¿Eliminar {deleting?.label}?</h2><p>{deleting?.is_default && addresses.length > 1 ? "Tu dirección restante más recientemente actualizada pasará a ser la principal." : "Esta dirección dejará de estar guardada en tu cuenta."}</p>{modalError && <p role="alert" className="buyer-field-error">{modalError}</p>}<div className="buyer-form-actions"><button disabled={busy} className="comu-button comu-secondary" onClick={() => deleteDialog.current?.close()}>Conservar dirección</button><button disabled={busy} className="comu-button" onClick={() => deleting && void addressAction(deleting, "delete")}>{busy ? "Eliminando…" : "Eliminar dirección"}</button></div></dialog>
  </main>;
}
export function OrderList({ orders }: { orders: BuyerOrder[] }) {
  return orders.length ? <div className="buyer-order-list">{orders.map(order => {
    const state = buyerOrderPresentation(order), items = order.comu_order_items || [], snapshot = items[0]?.comu_order_item_snapshots?.[0]?.snapshot;
    const count = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    return <Link key={order.id} href={"/comu/account/orders/" + order.id + "?view=detail"} className="buyer-order"><div className="buyer-order-image">{snapshot?.image ? <Image unoptimized src={snapshot.image} alt={snapshot.listingTitle || "Producto de tu pedido"} fill sizes="100px" /> : <AccountIcon name="Mis pedidos" />}</div><div className="buyer-order-info"><span className={"buyer-chip " + state.tone}>{state.label}</span><h3>Pedido #{order.order_number}</h3><p>{new Date(order.created_at).toLocaleDateString("es-MX")}{count > 0 ? " · " + count + (count === 1 ? " producto" : " productos") : ""}</p><p>{order.comu_order_suborders?.map(row => row.comu_sellers?.public_name).filter(Boolean).join(", ")}</p></div><div className="buyer-order-total"><strong>{formatOrderMoney(Number(order.grand_total), order.currency)}</strong><span>Ver detalles <AccountIcon name="Flecha" /></span></div></Link>;
  })}</div> : <AccountEmpty title="Aún no tienes pedidos" body="Cuando encuentres algo que te encante, aparecerá aquí." />;
}
