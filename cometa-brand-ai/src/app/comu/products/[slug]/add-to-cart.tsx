"use client";
import Link from "next/link";
import { useRef, useState } from "react";

export default function AddToCart({ variants, listingId, run }: { variants: Array<{ id: string; name: string; available: boolean }>; listingId: string; run?: { id: string; pieces: number } | null }) {
  const [variantListingId, setVariantListingId] = useState(variants.find((variant) => variant.available)?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<"PIECES" | "RUN">("PIECES");
  const busyRef = useRef(false);
  const selected = variants.find((variant) => variant.id === variantListingId && variant.available);
  async function add() {
    if (busyRef.current) return;
    if (!selected) { setMessage("Selecciona una variante disponible."); return; }
    if (!Number.isInteger(quantity) || quantity < 1) { setMessage("Elige al menos una pieza."); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/comu/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, variantListingId, quantity, ...(purchaseMode === "RUN" ? { purchaseMode, runId: run?.id, runCount: quantity } : {}) }) });
      const data = await response.json() as { ok?: boolean; code?: string };
      setMessage(response.ok && data.ok ? "Agregado al carrito." : data.code === "COMU_UNAUTHORIZED" ? "Inicia sesión para agregar productos." : data.code === "COMU_LISTING_UNAVAILABLE" ? "Este producto ya no está disponible." : "No pudimos agregar la pieza. Inténtalo nuevamente.");
    } catch { setMessage("No pudimos agregar la pieza. Inténtalo nuevamente."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <div className="mt-8 flex flex-wrap items-center gap-3">
    {run ? <div className="basis-full rounded-xl bg-[#f2f5ef] p-3 text-sm"><p className="font-bold">Forma de compra</p><label className="mr-4"><input type="radio" checked={purchaseMode === "PIECES"} onChange={() => setPurchaseMode("PIECES")} /> Piezas</label><label><input type="radio" checked={purchaseMode === "RUN"} onChange={() => setPurchaseMode("RUN")} /> Corrida · {run.pieces} piezas</label></div> : null}
    <select aria-label="Variante" value={variantListingId} disabled={busy} onChange={(event) => setVariantListingId(event.target.value)} className="h-12 rounded-xl border border-black/10 bg-white px-3">
      {!selected && <option value="">Sin variantes disponibles</option>}
      {variants.map((variant) => <option key={variant.id} value={variant.id} disabled={!variant.available}>{variant.name}{!variant.available ? " · Agotada" : ""}</option>)}
    </select>
    <input aria-label="Cantidad" type="number" min="1" step="1" value={quantity} disabled={busy} onChange={(event) => setQuantity(Number(event.target.value))} className="h-12 w-20 rounded-xl border border-black/10 bg-white px-3" />
    <button disabled={busy || !selected} onClick={() => void add()} className="rounded-full bg-[#17201d] px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Agregando…" : "Agregar al carrito"}</button>
    {message && <span role="status" className="text-sm text-emerald-700">{message}</span>}
    <Link href="/comu/cart" className="font-bold underline">Ir al carrito</Link>
  </div>;
}
