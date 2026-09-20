"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { validFoodModifierSelection, type FoodProduct, type FoodModifierSelection } from "@/lib/pos/food-shared";
import { PosModal } from "./pos-ui/pos-modal";

export function PosFoodModifierDialog({ product, visual, money, busy, error, onClose, onAdd }: {
  product: FoodProduct; visual: ReactNode; money: (amount: number) => string; busy: boolean; error: string | null;
  onClose: () => void; onAdd: (ids: string[], notes: string) => Promise<boolean>;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const groups = product.modifier_groups || [];
  const options = groups.flatMap(group => group.options);
  const amount = Number(product.price) + options.filter(option => ids.includes(option.id)).reduce((sum,option) => sum + Number(option.price_delta),0);
  const valid = validFoodModifierSelection(groups, ids) && amount >= 0;

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = body.current?.closest('[role="dialog"]');
    body.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'));
      const first = nodes[0], last = nodes[nodes.length-1];
      if (!nodes.length) { event.preventDefault(); return; }
      if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement===last) || (event.shiftKey && document.activeElement===first)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
    window.addEventListener("keydown",trap);
    return () => { window.removeEventListener("keydown",trap); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  return <PosModal open size="medium" title="Personalizar producto" dismissible={!busy} onClose={onClose} closeLabel="Cerrar modificadores" className="border border-[var(--pos-border)]" footer={<>
    <button disabled={busy} onClick={onClose} className="pos-ui-focus min-h-12 rounded-xl border border-[var(--pos-border)] px-4 text-sm font-semibold">Cancelar</button>
    <button disabled={busy || !valid} onClick={() => void onAdd([...ids].sort(),notes)} className="pos-ui-focus min-h-12 flex-1 rounded-xl bg-[var(--pos-primary)] px-4 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-70">{busy ? "Agregando…" : `Agregar al pedido · ${money(amount)}`}</button>
  </>}>
    <div ref={body} className="space-y-5">
      <div className="flex items-center gap-4"><div className="w-28 shrink-0 overflow-hidden rounded-xl">{visual}</div><div><h3 className="text-xl font-bold">{product.product_name}</h3><p className="mt-1 text-xs text-[var(--pos-text-muted)]">{product.name} · Precio base {money(Number(product.price))}</p><p className="mt-2 text-xs text-[var(--pos-primary-text)]">Elige tus preferencias con un toque.</p></div></div>
      {error ? <p role="alert" className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-200">{error}</p> : null}
      {groups.map(group => {
        const count = group.options.filter(option => ids.includes(option.id)).length;
        return <fieldset key={group.id} className="rounded-xl border border-[var(--pos-border)] p-3"><legend className="px-1 text-xs font-bold uppercase tracking-wider">{group.name}</legend><div className="mb-3 flex items-center justify-between gap-3 text-[11px] text-[var(--pos-text-muted)]"><span>{group.required ? "Obligatorio" : "Opcional"} · {group.selection_mode==='single' ? "Elige una opción" : `Elige hasta ${group.max_selections}`}{group.min_selections > 1 ? ` · Mínimo ${group.min_selections}` : ""}</span><span className={count > 0 ? "text-[var(--pos-primary-text)]" : ""}>{count}/{group.max_selections}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{group.options.map(option => {
          const selected = ids.includes(option.id);
          return <button key={option.id} aria-pressed={selected} disabled={busy || (!selected && group.selection_mode==='multiple' && count>=group.max_selections)} className={`pos-ui-focus min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors disabled:opacity-70 ${selected ? "border-cyan-300/60 bg-[var(--pos-primary)]/15 text-cyan-100" : option.type==='remove' ? "border-amber-300/20 bg-amber-300/5 text-amber-100 hover:border-amber-300/50" : "border-[var(--pos-border)] bg-white/5 text-[var(--pos-text-secondary)] hover:border-white/30"}`} onClick={() => setIds(previous => {
            if (previous.includes(option.id)) return previous.filter(id=>id!==option.id);
            if (group.selection_mode==='single') return [...previous.filter(id=>!group.options.some(candidate=>candidate.id===id)),option.id];
            return [...previous,option.id];
          })}><span className="block">{selected ? "✓ " : option.type==='remove' ? "− " : ""}{option.name}</span>{Number(option.price_delta)!==0 ? <span className="mt-1 block text-[10px] opacity-80">{Number(option.price_delta)>0 ? "+" : ""}{money(Number(option.price_delta))}</span> : null}</button>;
        })}</div></fieldset>;
      })}
      <label className="block text-xs font-semibold text-[var(--pos-text-muted)]">Nota especial (opcional)<textarea disabled={busy} maxLength={500} rows={2} value={notes} onChange={event=>setNotes(event.target.value)} className="pos-ui-focus mt-2 w-full resize-none rounded-xl border border-[var(--pos-border)] bg-white/5 p-3 text-sm text-[var(--pos-text)]" placeholder="Sólo para una indicación extraordinaria" /></label>
      {!valid ? <p role="status" className="text-xs text-amber-200">Completa los grupos obligatorios y respeta sus límites.</p> : null}
    </div>
  </PosModal>;
}

export function FoodItemModifiers({ modifiers }: { modifiers?: readonly FoodModifierSelection[] }) {
  if (!modifiers?.length) return null;
  const groups = [...new Set(modifiers.map(option=>option.group_id))];
  return <div className="mt-3 space-y-2">{groups.map(id => {
    const options = modifiers.filter(option=>option.group_id===id);
    return <div key={id} className={options.some(option=>option.type==='remove') ? "rounded-lg border border-amber-300/30 bg-amber-300/10 p-2" : "border-l-2 border-cyan-300/25 pl-3"}><p className="text-[11px] font-bold uppercase tracking-wide text-[var(--pos-text-muted)]">{options[0].group_name}</p><ul className="mt-1 space-y-1">{options.map(option=><li key={option.option_id} className={option.type==='remove' ? "font-bold text-amber-200" : "text-sm text-[var(--pos-text-secondary)]"}>{option.type==='remove' ? "− " : "• "}{option.name}</li>)}</ul></div>;
  })}</div>;
}
