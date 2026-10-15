"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NotificationInbox } from "@/lib/comu/notification-contract";
import { buyerNotificationLink, buyerNotificationTitle } from "@/lib/comu/buyer-notification-presentation";
import "./buyer-notification-bell.css";

export default function BuyerNotificationBell() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    const client = createClient();
    let active = true, generation = 0;
    const verify = () => {
      const version = ++generation;
      void client.auth.getUser().then(({ data, error }) => {
        if (active && version === generation) setUserId(error ? null : data.user?.id || null);
      }).catch(() => { if (active && version === generation) setUserId(null); });
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) { generation++; setUserId(null); }
      // Defer getUser outside the Supabase auth callback lock. A new identity clears
      // the old inbox immediately; the server still authorizes every N1 operation.
      else { setUserId(previous => previous === session.user.id ? previous : null); queueMicrotask(verify); }
    });
    verify();
    return () => { active = false; generation++; subscription.unsubscribe(); };
  }, []);
  return userId ? <BuyerInbox key={userId} /> : null;
}

function BellIcon() { return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>; }

function BuyerInbox() {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const [inbox, setInbox] = useState<NotificationInbox | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const sequence = useRef(0), request = useRef<AbortController | null>(null);
  const mounted = useRef(false), marking = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; request.current?.abort(); }, []);
  const load = useCallback(async () => {
    const version = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      const response = await fetch("/api/comu/notifications?audience=BUYER&limit=10", { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!mounted.current || version !== sequence.current) return;
      if (response.status === 401 || response.status === 403) { setInbox(null); setDenied(true); return; }
      if (!response.ok || !data.ok || !Array.isArray(data.notifications) || !Number.isInteger(data.unreadCount)) throw new Error();
      setInbox({ notifications: data.notifications.filter((n: { audience?: string }) => n.audience === "BUYER"), unreadCount: data.unreadCount });
      setError(""); setDenied(false);
    } catch {
      if (mounted.current && version === sequence.current) { setInbox(null); setError("No pudimos cargar tus notificaciones."); }
    } finally { clearTimeout(timeout); if (mounted.current && version === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (document.visibilityState === "visible" && !marking.current) void load(); };
    const start = setTimeout(refresh, 0), interval = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; invalidate(); clearTimeout(start); clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [load, invalidate]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpenAt(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpenAt(null); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function mark(id?: string) {
    if (marking.current) return;
    marking.current = true; setBusy(true); setError(""); setNotice("");
    // Cancel older reads so their response cannot restore a stale unread count.
    sequence.current++; request.current?.abort(); setLoading(false);
    try {
      const response = await fetch("/api/comu/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience: "BUYER", action: id ? "read" : "read-all", ...(id ? { id } : {}) }), signal: AbortSignal.timeout(15000) });
      if (!mounted.current) return;
      if (response.status === 401 || response.status === 403) { setInbox(null); setDenied(true); return; }
      if (!response.ok) throw new Error();
      await load();
      if (mounted.current) setNotice(id ? "Notificación marcada como leída." : "Notificaciones marcadas como leídas.");
    } catch { if (mounted.current) setError("No pudimos marcar como leído. Inténtalo de nuevo."); }
    finally { marking.current = false; if (mounted.current) setBusy(false); }
  }
  if (denied) return null;
  const count = inbox?.unreadCount;
  return <div className="buyer-notifications" ref={root}>
    <button ref={trigger} type="button" className="buyer-notifications-trigger" aria-label={`Notificaciones de tus compras${count === undefined ? "" : `, ${count} sin leer`}`} aria-expanded={open} aria-controls="buyer-notifications-panel" onClick={() => { setOpenAt(open ? null : pathname); if (!open) { setNotice(""); void load(); } }}><BellIcon />{count !== undefined && count > 0 && <span className="buyer-notifications-badge">{count > 99 ? "99+" : count}</span>}</button>
    {open && <section id="buyer-notifications-panel" className="buyer-notifications-panel" aria-label="Notificaciones de tus compras" aria-busy={loading || busy}>
      <div className="buyer-notifications-heading"><div><p>TU COMU, AL DÍA</p><h2>Notificaciones</h2></div><button type="button" aria-label="Cerrar notificaciones" onClick={() => { setOpenAt(null); trigger.current?.focus(); }}>×</button></div>
      <div className="buyer-notifications-toolbar"><span>{count === undefined ? "Tus compras" : `${count} sin leer`}</span>{!!count && <button type="button" disabled={busy || loading} onClick={() => void mark()}>Marcar todas como leídas</button>}</div>
      {error && <div className="buyer-notifications-error" role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => void load()}>Reintentar</button></div>}
      {loading ? <div role="status" className="buyer-notifications-empty"><BellIcon /><p>Cargando tus notificaciones…</p></div> : inbox && <>
        {inbox.notifications.length === 0 ? <div className="buyer-notifications-empty"><BellIcon /><h3>Todo tranquilo por aquí.</h3><p>Las novedades de tus compras aparecerán en este espacio.</p></div> : <ul className="buyer-notifications-list">{inbox.notifications.map(n => {
          const href = buyerNotificationLink(n);
          const content = <><h3>{buyerNotificationTitle(n)}</h3><p>{n.body}</p><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></>;
          return <li key={n.id} data-notification-id={n.id} className={n.read_at ? "is-read" : "is-unread"}><span role="img" className="buyer-notifications-dot" aria-label={n.read_at ? "Leída" : "Sin leer"} /><div>
            {href ? <Link className="buyer-notifications-order" href={href} onClick={() => setOpenAt(null)}>{content}<span>Ver pedido →</span></Link> : content}
            {!n.read_at && <div className="buyer-notifications-actions"><button type="button" disabled={busy} onClick={() => void mark(n.id)}>Marcar como leída</button></div>}
          </div></li>;
        })}</ul>}
      </>}
      <p className="buyer-notifications-notice" role="status">{notice}</p>
      <Link href="/comu/account/orders" className="buyer-notifications-footer" onClick={() => setOpenAt(null)}>Ver mis pedidos <span aria-hidden="true">↗</span></Link>
    </section>}
  </div>;
}
