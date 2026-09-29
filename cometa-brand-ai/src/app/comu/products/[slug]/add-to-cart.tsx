"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCommerce, type CartItem } from "../../components/commerce";
import { formatMxn } from "@/lib/comu/buyer-experience";
type Variant = { id: string; name: string; available: boolean; price: number | null };
export default function AddToCart({ variants, listingId, image, run, allowPieces = true }: { variants: Variant[]; listingId: string; image?: string; run?: { id: string; pieces: number; availableRuns: number } | null; allowPieces?: boolean }) {
  const [selectedId, setSelectedId] = useState(variants.find(row => row.available)?.id || ""), [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [mode, setMode] = useState<"PIECES" | "RUN">(allowPieces ? "PIECES" : "RUN");
  const lock = useRef(false), button = useRef<HTMLButtonElement>(null); const { items, accepted } = useCommerce(); const router = useRouter();
  const selected = variants.find(row => row.id === selectedId && row.available);
  const available = Boolean(selected && (mode === "PIECES" ? allowPieces : run && run.availableRuns >= quantity));
  async function add(buyNow = false) {
    if (lock.current || !available) return;
    if (!Number.isSafeInteger(quantity) || quantity < 1) { setMessage("Elige una cantidad válida."); return; }
    lock.current = true; setBusy(true); setMessage("");
    try {
      const existing = items.find(row => row.variant_listing_id === selectedId);
      const nextQuantity = mode === "PIECES" ? Number(existing?.quantity || 0) + quantity : quantity;
      const response = await fetch("/api/comu/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, variantListingId: selectedId, quantity: nextQuantity, ...(mode === "RUN" ? { purchaseMode: mode, runId: run?.id, runCount: quantity } : {}) }) });
      const data = await response.json() as { ok?: boolean; items?: CartItem[] };
      if (!response.ok || !data.ok || !data.items) { setMessage(response.status === 401 ? "Inicia sesión para agregar esta pieza." : "No pudimos agregar esta selección. Revisa la disponibilidad e inténtalo de nuevo."); return; }
      accepted(data.items, image, button.current, !buyNow); if (buyNow) router.push("/comu/cart");
    } catch { setMessage("No pudimos actualizar el carrito. Inténtalo nuevamente."); } finally { lock.current = false; setBusy(false); }
  }
  return <div className="mt-7"><p className="text-3xl font-semibold tracking-tight">{selected?.price != null && selected.price > 0 ? formatMxn(selected.price) : "Precio no disponible"}<span className="ml-2 text-xs font-normal text-[#72675e]">MXN por pieza</span></p><fieldset disabled={busy} className="mt-7"><legend className="mb-3 text-sm font-semibold">Elige tu variante</legend><div className="flex flex-wrap gap-2">{variants.map(variant => <button key={variant.id} type="button" disabled={!variant.available} aria-pressed={selectedId === variant.id} onClick={() => setSelectedId(variant.id)} className={`rounded-xl border px-4 py-3 text-sm ${selectedId === variant.id ? "border-[#252d28] bg-[#252d28] text-white" : "border-[#d9cfc4]"}`}>{variant.name}{!variant.available && " · Agotada"}</button>)}</div></fieldset>{run && <fieldset className="mt-5 flex flex-wrap gap-5 text-sm"><legend className="mb-2 font-semibold">Forma de compra</legend>{allowPieces && <label><input type="radio" name={`mode-${listingId}`} checked={mode === "PIECES"} onChange={() => setMode("PIECES")} /> Piezas</label>}<label><input type="radio" name={`mode-${listingId}`} checked={mode === "RUN"} disabled={!run.availableRuns} onChange={() => setMode("RUN")} /> Corrida · {run.pieces} piezas</label></fieldset>}<label className="mt-6 flex items-center gap-4 text-sm">Cantidad<input aria-label="Cantidad" type="number" min={1} step={1} max={mode === "RUN" ? run?.availableRuns : undefined} value={quantity} disabled={busy} onChange={event => setQuantity(Number(event.target.value))} className="comu-field !mt-0 !w-24" /></label><div className="mt-6 grid gap-3 sm:grid-cols-2"><button ref={button} disabled={busy || !available} className="comu-button" onClick={() => void add()}>{busy ? "Agregando…" : "Agregar al carrito"}</button><button disabled={busy || !available} className="comu-button comu-secondary" onClick={() => void add(true)}>Comprar ahora</button></div>{message && <p role="status" className="mt-4 text-sm">{message} <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/comu" : window.location.pathname)}`} className="underline">Ir a mi cuenta</Link></p>}<p className="mt-4 text-xs leading-5 text-[#72675e]">Podrás revisar tu selección antes de continuar. Agregar al carrito no realiza ningún cobro.</p></div>;
}
