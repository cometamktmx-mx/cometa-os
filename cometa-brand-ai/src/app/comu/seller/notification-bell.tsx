"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationInbox } from "@/lib/comu/notification-contract";

export default function NotificationBell({ sellerId }: { sellerId?: string }) {
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<NotificationInbox>({ notifications: [], unreadCount: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const panel = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const query = new URLSearchParams({ audience: "SELLER", limit: "10", ...(sellerId ? { sellerId } : {}) });
      const r = await fetch(`/api/comu/notifications?${query}`, { cache: "no-store" });
      const data = await r.json();
      if (current !== sequence.current) return;
      if (!r.ok) throw new Error("No se pudieron cargar las notificaciones.");
      setInbox(data); setError("");
    } catch {
      if (current !== sequence.current) return;
      setInbox({ notifications: [], unreadCount: 0 }); setError("Notificaciones no disponibles.");
    } finally { if (current === sequence.current) setLoading(false); }
  }, [sellerId]);
  useEffect(() => {
    const start = setTimeout(() => { setInbox({ notifications: [], unreadCount: 0 }); setLoading(true); void load(); }, 0);
    const timer = setInterval(() => { void load(); }, 60000);
    return () => { clearTimeout(start); clearInterval(timer); invalidate(); };
  }, [load, invalidate]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function mark(id?: string) {
    try {
      const r = await fetch("/api/comu/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience: "SELLER", sellerId, action: id ? "read" : "read-all", ...(id ? { id } : {}) }) });
      if (!r.ok) throw new Error();
      await load();
    } catch { setError("No se pudo marcar como leído."); }
  }
  return <div ref={panel} className="relative">
    <button type="button" aria-label={`Notificaciones, ${inbox.unreadCount} sin leer`} aria-expanded={open} aria-controls="comu-notification-panel" onClick={() => { setOpen(!open); if (!open) void load(); }} className="relative rounded-lg p-2 text-[#245b41]">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {inbox.unreadCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-emerald-300 px-1 text-xs font-bold text-black">{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}</span>}
    </button>
    {open && <section id="comu-notification-panel" aria-label="Notificaciones" className="fixed left-3 right-3 top-16 z-50 mt-2 rounded-xl border border-white/15 bg-[#0b1712] p-4 text-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:w-80 sm:max-w-[85vw]">
      <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Notificaciones</h2><button type="button" aria-label="Cerrar notificaciones" onClick={() => setOpen(false)}>×</button></div>
      {error ? <p role="status" className="mt-3 text-sm">{error}</p> : loading ? <p className="mt-3 text-sm">Cargando...</p> : <>
        {inbox.unreadCount > 0 && <button type="button" className="mt-3 text-xs text-emerald-200" onClick={() => void mark()}>Marcar todas como leídas</button>}
        {!inbox.notifications.length && <p className="mt-3 text-sm text-slate-400">No tienes notificaciones.</p>}
        <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto">{inbox.notifications.map(n => <li key={n.id} className="border-t border-white/10 pt-3">
          <Link href={n.deep_link} onClick={() => { void mark(n.id); setOpen(false); }}><span className={n.read_at ? "text-sm" : "text-sm font-bold text-emerald-200"}>{n.title}</span><p className="mt-1 text-xs text-slate-300">{n.body}</p></Link>
          {!n.read_at && <button type="button" className="mt-2 text-xs text-emerald-200" onClick={() => void mark(n.id)}>Marcar como leída</button>}
        </li>)}</ul>
      </>}
    </section>}
  </div>;
}
