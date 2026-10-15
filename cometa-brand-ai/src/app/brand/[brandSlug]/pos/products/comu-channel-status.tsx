"use client";

import { useCallback, useEffect, useState } from "react";

type Product = { id: string; variants: Array<{ id: string; active: boolean; stock: { quantity: number; reserved: number; available: number } }> };
type Channel = { active: boolean; listing: { id: string; status: string; wholesale_enabled: boolean } | null; profile: { profile: string; estimated_weight_g: number; package_class: string } | null; inventory: { quantity: number; reserved_quantity: number; available_quantity: number } };

export function ComuChannelStatus({ brandSlug, product, onChanged }: { brandSlug: string; product: Product; onChanged?: () => void }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/comu/product-channel?brandSlug=${encodeURIComponent(brandSlug)}&productId=${encodeURIComponent(product.id)}`);
    const body = await response.json() as { ok?: boolean; active?: boolean; listing?: Channel["listing"]; profile?: Channel["profile"]; inventory?: Channel["inventory"] };
    if (response.ok && body.ok) setChannel({ active: body.active === true, listing: body.listing || null, profile: body.profile || null, inventory: body.inventory || { quantity: 0, reserved_quantity: 0, available_quantity: 0 } });
  }, [brandSlug, product.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function change(action: "publish" | "unpublish") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/comu/product-channel", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug, productId: product.id, action }) });
      const body = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) throw new Error(body.message || "No se pudo actualizar COMU.");
      await load(); onChanged?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo actualizar COMU."); }
    finally { setBusy(false); }
  }
  if (!channel) return <div className="mt-3 rounded-lg bg-[var(--pos-surface-2)] p-3 text-xs text-[var(--pos-text-muted)]">Canales COMU: cargando…</div>;
  const published = channel.listing?.status === "PUBLISHED";
  return <section className="mt-3 rounded-xl border border-[var(--pos-line-subtle)] bg-[var(--pos-surface-2)] p-3" aria-label="Canales de venta"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">Canales de venta</p><div className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div><span className="font-semibold text-[var(--pos-text-primary)]">Punto de venta</span><span className="ml-2 text-emerald-600">● Activo</span></div><div><span className="font-semibold text-[var(--pos-text-primary)]">COMU</span><span className={`ml-2 ${published ? "text-emerald-600" : "text-[var(--pos-text-muted)]"}`}>{published ? "● Publicado" : channel.active ? "○ No publicado" : "○ No activado"}</span></div></div>{channel.active ? <button type="button" disabled={busy} onClick={() => void change(published ? "unpublish" : "publish")} className="mt-3 rounded-lg bg-[var(--pos-primary)] px-3 py-2 text-xs font-semibold text-[var(--pos-on-primary)] disabled:opacity-50">{busy ? "Guardando…" : published ? "Despublicar de COMU" : "Publicar en COMU"}</button> : null}{channel.listing?.wholesale_enabled ? <p className="mt-2 text-xs text-[var(--pos-text-secondary)]">Mayoreo · Activo · <a href={`/brand/${encodeURIComponent(brandSlug)}/comu#wholesale`} className="underline">Configurar en COMU</a></p> : null}{channel.profile ? <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">Logística · {channel.profile.profile.replaceAll("_", " ")}</p> : null}<div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--pos-line-subtle)] pt-2 text-[11px] text-[var(--pos-text-secondary)]"><span>Físico<strong className="block text-[var(--pos-text-primary)]">{channel.inventory.quantity}</strong></span><span>Reservado<strong className="block text-[var(--pos-text-primary)]">{channel.inventory.reserved_quantity}</strong></span><span>Disponible<strong className="block text-[var(--pos-text-primary)]">{channel.inventory.available_quantity}</strong></span></div>{message ? <p className="mt-2 text-xs text-[var(--pos-danger)]">{message}</p> : null}</section>;
}
