import { uuidPattern } from "./product-contract";
export type BagLine = { productId: string; variantId: string; quantity: number };
export const bagKey = (brandId: string) => "cometa.own-store.bag.v1." + brandId;
export function parseBag(raw: string | null): BagLine[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data) || data.length > 100) return [];
    const lines = new Map<string, BagLine>();
    for (const x of data) {
      if (!x || typeof x !== "object" || !uuidPattern.test(x.productId) || !uuidPattern.test(x.variantId) || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 99) continue;
      const prior = lines.get(x.variantId);
      if (prior && prior.productId !== x.productId) return [];
      lines.set(x.variantId, { productId: x.productId, variantId: x.variantId, quantity: Math.min(99, (prior?.quantity ?? 0) + x.quantity) });
    }
    return [...lines.values()];
  } catch { return []; }
}
const memory = new Map<string, string>();
const volatile = new Set<string>();
export function readBag(brand: string) { try { return parseBag(volatile.has(brand) ? memory.get(brand) ?? null : localStorage.getItem(bagKey(brand))); } catch { return parseBag(memory.get(brand) ?? null); } }
export async function editBag(brand: string, variant: string, quantity: number) {
  const update = async () => {
  if (!uuidPattern.test(brand) || !uuidPattern.test(variant) || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw Error("Cantidad inválida");
  const lines = readBag(brand).flatMap(l => l.variantId === variant ? quantity ? [{ ...l, quantity }] : [] : [l]);
  const raw = JSON.stringify(lines);memory.set(brand, raw);
  try { localStorage.setItem(bagKey(brand), raw); } catch { volatile.add(brand); }
  window.dispatchEvent(new CustomEvent("magenta-bag", { detail: brand }));return lines;
  };
  const task = async () => typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(bagKey(brand), update) : update();
  const result = queue.then(task, task); queue = result.catch(() => undefined); return result;
}
let queue: Promise<unknown> = Promise.resolve();
export async function addToBag(brand: string, productId: string, variantId: string, quantity: number) {
  const update = async () => {
    if (!uuidPattern.test(brand) || !uuidPattern.test(productId) || !uuidPattern.test(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Error("Selecciona una variante y cantidad válidas.");
    const lines = readBag(brand), old = lines.find(l => l.variantId === variantId);
    if (old && old.productId !== productId) throw Error("La bolsa contiene una referencia inválida.");
    const total = (old?.quantity ?? 0) + quantity;
    if (total > 99 || (!old && lines.length >= 100)) throw Error("Se alcanzó el límite de la bolsa.");
    const response = await fetch("/api/bolsa/validar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, variantId, quantity: total }), cache: "no-store" });
    if (!response.ok) throw Error("No se pudo agregar: revisa la disponibilidad e intenta de nuevo.");
    const checked = await response.json();
    if (checked.brandId !== brand || checked.productId !== productId || checked.variantId !== variantId || checked.quantity !== total) throw Error("No se pudo validar esta selección.");
    const next = [...lines.filter(l => l.variantId !== variantId), { productId, variantId, quantity: total }];
    const raw = JSON.stringify(next); let persisted = true;
    memory.set(brand, raw);
    try { localStorage.setItem(bagKey(brand), raw); } catch { persisted = false; volatile.add(brand); }
    window.dispatchEvent(new CustomEvent("magenta-bag", { detail: brand }));
    return { count: next.reduce((n, l) => n + l.quantity, 0), persisted };
  };
  // Web Locks serializes same-brand additions across tabs; queue covers older browsers.
  const task = async () => typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(bagKey(brand), update) : update();
  const result = queue.then(task, task); queue = result.catch(() => undefined); return result;
}
