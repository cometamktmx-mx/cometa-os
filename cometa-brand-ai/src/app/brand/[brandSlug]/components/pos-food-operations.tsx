"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PosBranding } from "./pos-shell";
import type { PosOperator } from "./pos-operator-gate";
import { PosModal } from "./pos-ui/pos-modal";
import { FoodItemModifiers, PosFoodModifierDialog } from "./pos-food-modifiers";
import { FoodReceipt } from "./pos-food-receipt";
import { foodRoleViews, foodTableState, type FoodAction, type FoodCheck, type FoodItem, type FoodProduct, type FoodSnapshot, type FoodTicket } from "@/lib/pos/food-shared";
import { staffRoles } from "@/lib/pos/staff-shared";
type FoodOfflineRecord<T> = { value: T };
const foodOfflineKey = (brandSlug: string, locationId: string | null) => `${brandSlug}::${locationId || "default"}`;
async function foodOfflinePut<T>(brandSlug: string, locationId: string | null, value: T, store: "food_snapshot" | "catalog" = "food_snapshot") { if (typeof indexedDB === "undefined") return; try { const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("cometa-pos-offline", 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("food_snapshot")) request.result.createObjectStore("food_snapshot"); if (!request.result.objectStoreNames.contains("catalog")) request.result.createObjectStore("catalog"); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); await new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put({ value, brandSlug, locationId, cachedAt: new Date().toISOString(), schemaVersion: 1 }, foodOfflineKey(brandSlug, locationId)); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); } catch { /* online operation must survive storage failure */ } }
async function foodOfflineGet<T>(brandSlug: string, locationId: string | null): Promise<FoodOfflineRecord<T> | null> { if (typeof indexedDB === "undefined") return null; try { const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("cometa-pos-offline", 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("food_snapshot")) request.result.createObjectStore("food_snapshot"); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); const value = await new Promise<FoodOfflineRecord<T> | null>((resolve, reject) => { const request = db.transaction("food_snapshot", "readonly").objectStore("food_snapshot").get(foodOfflineKey(brandSlug, locationId)); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); db.close(); return value; } catch { return null; } }

const button = "pos-ui-focus min-h-12 rounded-xl border border-[var(--pos-line)] px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-70";
const primary = `${button} bg-[var(--pos-primary)] text-slate-950`;
const input = "pos-ui-focus min-h-12 w-full rounded-xl border border-[var(--pos-line)] bg-[var(--pos-panel)] px-4 py-3";
const panel = "rounded-2xl border border-[var(--pos-line)] bg-[var(--pos-panel)] p-5";
const states = {
  AVAILABLE: { label: "Libre", color: "border-emerald-500/50 bg-emerald-500/10" },
  OCCUPIED: { label: "En servicio", color: "border-sky-500/50 bg-sky-500/10" },
  ORDER_SENT: { label: "En cocina", color: "border-amber-500/50 bg-amber-500/10" },
  READY: { label: "Listo para entregar", color: "border-emerald-400 bg-emerald-400/20 ring-2 ring-emerald-400/30" },
  PAYMENT_PENDING: { label: "Por cobrar", color: "border-violet-400/50 bg-violet-400/15" },
};
export function elapsedFoodTime(date: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function accountReference(check: FoodCheck) {
  return check.id.replace(/-/g, "").slice(-6).toUpperCase();
}

function equalSplitPart(total: number, parts: number, index: number) {
  const cents = Math.max(0, Math.round(total * 100));
  if (!Number.isInteger(parts) || parts < 2 || parts > 20 || index < 0 || index >= parts) return 0;
  const base = Math.floor(cents / parts);
  const remainder = cents % parts;
  return (base + (index < remainder ? 1 : 0)) / 100;
}

export function PosFoodOperations({ operator, brandSlug, branding }: { operator: PosOperator; brandSlug: string; branding?: PosBranding | null }) {
  const views = foodRoleViews(staffRoles(operator));
  const initialCheckId = typeof window !== "undefined" ? window.location.hash.match(/^#check-(.+)$/)?.[1] || null : null;
  const [view, setView] = useState<"salon" | "kitchen" | "cash">(initialCheckId ? "cash" : views[0]);
  const [snapshot, setSnapshot] = useState<FoodSnapshot | null>(null);
  const [locationId, setLocationId] = useState("");
  const [selected, setSelected] = useState<string | null>(initialCheckId);
  const [opening, setOpening] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [customer, setCustomer] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; first_name: string; last_name: string | null; phone: string | null; loyalty_member?: { points_balance?: number | null } | null }>>([]);
  const [customerMemory, setCustomerMemory] = useState<{ allergy_tags?: string[]; restriction_note?: string | null; pointsBalance?: number | null; visits?: number | null } | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [tableName, setTableName] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("cash");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceipt, setPaymentReceipt] = useState<{ total: number; method: string; received: number; change: number; reference: string; check: FoodCheck; items: FoodItem[]; table: string; staff: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<"equal" | "items" | "amount">("amount");
  const [splitAmount, setSplitAmount] = useState("");
  const [equalParts, setEqualParts] = useState(2);
  const [equalCustomParts, setEqualCustomParts] = useState("");
  const [equalPartIndex, setEqualPartIndex] = useState(0);
  const [splitAllocations, setSplitAllocations] = useState<Record<string, number>>({});
  const [cashSessionId, setCashSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [retry, setRetry] = useState(0);
  const [dirtyNotes, setDirtyNotes] = useState<Record<string, boolean>>({});
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const mutation = useRef(false);
  const generation = useRef(0);
  const [floorFilter, setFloorFilter] = useState<"ALL" | ReturnType<typeof foodTableState>>("ALL");
  const [floorLayout, setFloorLayout] = useState<"grid" | "list">("grid");
  const [customizing, setCustomizing] = useState<FoodProduct | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    const response = await fetch(`/api/pos/food?brandSlug=${encodeURIComponent(brandSlug)}${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ""}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok || !body.snapshot) throw new Error(body.error || "No se pudo actualizar la operación.");
    void foodOfflinePut(brandSlug, body.snapshot.location?.id || locationId || null, body.snapshot);
    void foodOfflinePut(brandSlug, body.snapshot.location?.id || locationId || null, { products: body.snapshot.products, categories: body.snapshot.categories, modifiers: body.snapshot.modifiers }, "catalog");
    if (!locationId && body.snapshot.location?.id) void foodOfflinePut(brandSlug, null, body.snapshot);
    if (current === generation.current && !signal?.aborted) setSnapshot(body.snapshot);
    return body.snapshot as FoodSnapshot;
  }, [brandSlug, locationId]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    async function refresh() {
      if (mutation.current) return;
      try { await load(controller.signal); if (!stopped) setError(null); }
      catch (reason) { if (!stopped) { const cached = await foodOfflineGet<FoodSnapshot>(brandSlug, locationId || null); if (cached?.value) { setSnapshot(cached.value); setError("Sin conexión. Mostrando el último snapshot guardado."); } else { setError(reason instanceof Error ? reason.message : "Sin conexión."); setSnapshot(null); } } }
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { stopped = true; controller.abort(); window.clearInterval(poll); window.clearInterval(clock); };
  }, [load, retry, brandSlug, locationId]);

  async function act(action: FoodAction, payload: Record<string, unknown>) {
    if (mutation.current) return false;
    mutation.current = true; generation.current++; setBusy(true); setError(null); setNotice(null);
    const signature = JSON.stringify({ action, payload });
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/pos/food", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug, action, ...payload, idempotencyKey: pending.current.key }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) pending.current = null;
        throw new Error(body.error || "No se pudo completar la operación.");
      }
      pending.current = null;
      if (action === "open") { setSelected(body.result.checkId); setOpening(null); setCustomer(""); }
      if (action === "table_create") setTableName("");
      if (action === "pay") {
        const paymentResult = body.result as { closed?: boolean; paid?: number; balance?: number };
        const paidTotal = Number(payload.amount ?? total(String(payload.checkId)));
        const received = Number(payload.receivedAmount ?? paidTotal);
        if (paymentResult.closed) {
          setPaymentReceipt({ total: total(String(payload.checkId)), method: String(payload.method), received, change: Math.max(0, received - paidTotal), reference: String(payload.reference ?? ""), check: check as FoodCheck, items: checkItems, table: tableLabel(check as FoodCheck), staff: staffName((check as FoodCheck).opened_by) });
          setSelected(null); setNotice("Pago registrado. Cuenta cerrada y mesa libre.");
        } else {
          setNotice(`Pago registrado. Saldo restante: ${money(Number(paymentResult.balance ?? 0))}.`);
        }
        setPaymentOpen(false); setSplitOpen(false); setSplitAmount("");
      }
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo confirmar la operación.");
      // Reconcile after an ambiguous network response; keep the request key for an identical retry.
      try { await load(); } catch { setSnapshot(null); }
      return false;
    } finally { mutation.current = false; setBusy(false); }
  }

  const data = snapshot as FoodSnapshot;
  const check = data?.checks.find(value => value.id === selected);
  const staffName = (id: string) => data?.staff.find(value => value.id === id)?.name || "Operador";
  const money = (amount: number) => data?.location ? new Intl.NumberFormat("es-MX", { style: "currency", currency: data.location.currency }).format(amount) : "—";
  const total = (id: string) => data?.items.filter(item => item.check_id === id).reduce((sum, item) => sum + Number(item.line_total), 0) || 0;
  const paid = (id: string) => (data?.payments || []).filter(payment => payment.check_id === id).reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
  const balance = (id: string) => Math.max(0, Number((total(id) - paid(id)).toFixed(2)));
  const itemPaidQuantity = (id: string) => data?.payment_item_status?.find(value => value.food_item_id === id)?.quantity_paid
    ?? (data?.payment_allocations || []).filter(value => value.food_item_id === id).reduce((sum, value) => sum + Number(value.quantity), 0);
  const itemPendingQuantity = (item: FoodItem) => Math.max(0, Number(item.quantity) - itemPaidQuantity(item.id));
  const selectedEqualParts = equalParts === 0 ? Number(equalCustomParts) : equalParts;
  const setEqualSelection = (parts: number, index = 0) => {
    setEqualParts(parts);
    setEqualPartIndex(index);
    if (check) setSplitAmount(equalSplitPart(balance(check.id), parts, index).toFixed(2));
  };
  const updateSplitAllocation = (itemId: string, quantity: number) => {
    const item = checkItems.find(value => value.id === itemId);
    const next = { ...splitAllocations, [itemId]: Math.min(item ? itemPendingQuantity(item) : 0, Math.max(0, quantity)) };
    setSplitAllocations(next);
    setSplitAmount(checkItems.reduce((sum, item) => sum + Number(item.line_total) * (next[item.id] || 0) / Number(item.quantity), 0).toFixed(2));
  };
  const tableLabel = (value: FoodCheck) => data?.tables.find(table => table.id === value.table_id)?.name || "Sin mesa";
  const checkItems = check ? data?.items.filter(item => item.check_id === check.id) || [] : [];
  const checkTickets = check ? data?.tickets.filter(ticket => ticket.check_id === check.id) || [] : [];
  const draft = checkItems.filter(item => !item.ticket_id);
  const canEdit = view === "salon" && check?.status === "OPEN";
  const pendingPayment = check?.status === "PAYMENT_PENDING";
  const closed = check?.status === "CLOSED";
  const canRequest = Boolean(check && check.status === "OPEN" && checkItems.length && !draft.length && checkTickets.every(ticket => ticket.served_at));
  const effectiveCash = data?.cash_sessions.some(value => value.id === cashSessionId) ? cashSessionId : data?.cash_sessions.length === 1 ? data.cash_sessions[0].id : "";
  const floor = view === "salon" && !check;
  const tableStates = data?.tables.map(table => foodTableState(data.checks.find(account => account.table_id === table.id), data.tickets)) || [];
  const occupiedCount = tableStates.filter(state => state !== "AVAILABLE").length;
  const openingForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!check?.customer_id) { setCustomerMemory(null); return; }
    let cancelled = false;
    void fetch(`/api/pos/food/customer-memory?brandSlug=${encodeURIComponent(brandSlug)}&customerId=${encodeURIComponent(check.customer_id)}`, { cache: "no-store" })
      .then(async response => response.ok ? response.json() as Promise<{ profile?: { allergy_tags?: string[]; restriction_note?: string | null }; pointsBalance?: number | null; visits?: number | null }> : null)
      .then(payload => { if (!cancelled) setCustomerMemory(payload ? { ...payload.profile, pointsBalance: payload.pointsBalance, visits: payload.visits } : null); })
      .catch(() => { if (!cancelled) setCustomerMemory(null); });
    return () => { cancelled = true; };
  }, [brandSlug, check?.customer_id]);

  async function searchCustomers(value: string) {
    setCustomerQuery(value);
    if (value.trim().length < 2) { setCustomerResults([]); return; }
    setCustomerLoading(true);
    try {
      const response = await fetch(`/api/pos/customers?brandSlug=${encodeURIComponent(brandSlug)}&search=${encodeURIComponent(value.trim())}&pageSize=6`, { cache: "no-store" });
      const payload = await response.json() as { customers?: typeof customerResults };
      setCustomerResults(response.ok && Array.isArray(payload.customers) ? payload.customers : []);
    } finally { setCustomerLoading(false); }
  }

  useEffect(() => {
    const root = document.documentElement;
    const previousGutter = root.style.scrollbarGutter;
    root.style.scrollbarGutter = "stable";
    return () => { root.style.scrollbarGutter = previousGutter; };
  }, []);

  useEffect(() => {
    if (!opening) return;
    const previousFocus = document.activeElement;
    const dialog = openingForm.current?.closest('[role="dialog"]');
    openingForm.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    function keepFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener("keydown", keepFocus);
    return () => {
      window.removeEventListener("keydown", keepFocus);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [opening]);

  return <section aria-label="Operación Food" className={floor ? "grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)] xl:gap-8" : "space-y-5"}>
    <div className={floor ? "self-start rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-surface)] p-3 shadow-xl lg:sticky lg:top-28 lg:min-h-[650px]" : "flex flex-wrap items-center justify-between gap-3"}>
      {floor ? <div className="mb-6 hidden px-3 pt-4 lg:block"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--pos-text-muted)]">Workspace</p><p className="mt-2 text-sm font-semibold text-[var(--pos-text-secondary)]">Operación Food</p></div> : null}
      <nav aria-label="Área de operación" className={floor ? "flex gap-2 lg:flex-col" : "flex flex-wrap gap-2"}>{views.map(value => <button key={value} className={floor ? `pos-ui-focus flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${view === value ? "border border-cyan-300/20 bg-[var(--pos-primary)]/10 text-[var(--pos-primary-text)] shadow-[inset_3px_0_0_#67e8f9]" : "text-[var(--pos-text-muted)] hover:bg-white/5 hover:text-[var(--pos-text)]"}` : view === value ? primary : button} aria-pressed={view === value} disabled={busy} onClick={() => { setView(value); setSelected(null); setOpening(null); }}>{floor ? <FloorIcon kind={value === "salon" ? "table" : value === "kitchen" ? "ready" : "cash"} /> : null}{value === "salon" ? "Salón" : value === "kitchen" ? "Cocina" : "Caja"}</button>)}</nav>
      {(!floor || !data?.location) && data?.locations.length ? <label className="flex items-center gap-2 text-sm">Sucursal<select aria-label="Sucursal" className={input} disabled={busy || data.locations.length === 1} value={data.location?.id || ""} onChange={event => { setLocationId(event.target.value); setSnapshot(null); setSelected(null); setOpening(null); setCashSessionId(""); }}><option value="">Selecciona sucursal</option>{data.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label> : null}
    </div>
    <div className="min-w-0 space-y-5">
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/50 bg-rose-500/10 p-4"><span>{error}</span><button className={button} disabled={busy} onClick={() => setRetry(value => value + 1)}>Actualizar</button></div> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-500/15 p-4">{notice}</p> : null}
    {view === "salon" && pendingPayment && check ? <button type="button" className={`${button} w-full`} onClick={() => window.print()}>Imprimir cuenta #{accountReference(check)}</button> : null}
    {view === "cash" && check ? <p className="rounded-xl border border-cyan-300/20 bg-[var(--pos-primary)]/5 px-4 py-3 text-sm font-semibold text-cyan-100">Mesa {tableLabel(check)} · Cuenta #{accountReference(check)} · {elapsedFoodTime(check.opened_at, now)} esperando</p> : null}
    {view === "cash" && check ? <div className={`${panel} space-y-3`}><div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-[10px] uppercase tracking-wider text-[var(--pos-text-muted)]">Total original</p><strong>{money(total(check.id))}</strong></div><div><p className="text-[10px] uppercase tracking-wider text-[var(--pos-text-muted)]">Pagado</p><strong className="text-emerald-300">{money(paid(check.id))}</strong></div><div><p className="text-[10px] uppercase tracking-wider text-[var(--pos-text-muted)]">Saldo</p><strong className="text-[var(--pos-primary-text)]">{money(balance(check.id))}</strong></div></div>{(data?.payments || []).filter(payment => payment.check_id === check.id).map(payment => <div key={payment.id} className="flex items-center justify-between border-t border-[var(--pos-border)] pt-3 text-sm"><span>{payment.method === "cash" ? "Efectivo" : payment.method === "card" ? "Tarjeta" : "Otro"}<span className="ml-2 text-xs text-[var(--pos-text-muted)]">{new Date(payment.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span></span><strong>{money(Number(payment.amount))}</strong></div>)}</div> : null}
    {!data ? <div role="status" className={`${panel} py-20 text-center`}>{error ? "Operación sin sincronizar. Reintenta para continuar." : "Cargando mesas y comandas…"}</div> : !data.location ? <div className={`${panel} py-20 text-center`}>{data.locations.length ? "Selecciona una sucursal para operar." : "No hay una sucursal activa. Revisa la configuración de POS."}</div> : <>
      {view === "kitchen" ? <><span className="sr-only">Sin comandas pendientes</span><KitchenBoard data={data} now={now} busy={busy} tableLabel={tableLabel} staffName={staffName} onAction={(action, ticket) => void act(action, { checkId: ticket.check_id, ticketId: ticket.id })} /></> : check ? <>
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-surface)] p-5 shadow-xl">
          <div><button className={button} disabled={busy} onClick={() => setSelected(null)}>← {view === "cash" ? "Cuentas" : "Mesas"}</button><div className="mt-4 flex flex-wrap items-center gap-3"><h2 className="text-3xl font-bold">{tableLabel(check)}</h2><span className={`rounded-full border px-3 py-1 text-xs font-bold ${pendingPayment ? "border-violet-300/30 bg-violet-300/10 text-violet-200" : closed ? "border-slate-300/20 bg-white/5 text-[var(--pos-text-secondary)]" : "border-cyan-300/25 bg-[var(--pos-primary)]/10 text-[var(--pos-primary-text)]"}`}>{pendingPayment ? "Esperando cobro" : closed ? "Cuenta cerrada" : "En servicio"}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--pos-text-secondary)]"><span>Responsable: {staffName(check.opened_by)}</span><span>Mesa abierta hace {elapsedFoodTime(check.opened_at, now)}</span>{check.customer_name ? <span>Cliente: {check.customer_name}</span> : null}</div>{pendingPayment ? <p className="mt-2 text-sm font-semibold text-violet-200">Cuenta enviada a Caja</p> : null}</div>
          <div className="text-left sm:text-right"><p className="text-xs uppercase tracking-[0.16em] text-[var(--pos-text-muted)]">Total de la cuenta</p><p className="mt-1 text-4xl font-bold tabular-nums text-[var(--pos-text)]">{money(total(check.id))}</p><p className="mt-1 text-xs text-[var(--pos-text-muted)]">{checkItems.reduce((sum,item) => sum + Number(item.quantity),0)} productos</p></div>
         </div>
         <CustomerInlineSummary
           check={check}
           memory={customerMemory}
           query={customerQuery}
           results={customerResults}
           loading={customerLoading}
           open={customerSearchOpen}
           onOpenSearch={() => setCustomerSearchOpen(true)}
           onCloseSearch={() => setCustomerSearchOpen(false)}
           onSearch={value => void searchCustomers(value)}
           onSelect={customerId => { void act("customer_set", { checkId: check.id, customerId }); setCustomerSearchOpen(false); }}
         />
         <div className={`grid items-start gap-5 ${canEdit ? "xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]" : pendingPayment || closed ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
          {canEdit ? <div className="min-w-0 space-y-4 rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-surface)] p-3 md:p-5">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-[var(--pos-text)]">Catálogo</h3><p className="mt-1 text-xs text-[var(--pos-text-muted)]">Toca un producto para agregarlo al pedido.</p></div><span className="shrink-0 rounded-full border border-[var(--pos-border)] px-2.5 py-1 text-[10px] text-[var(--pos-text-muted)]">{data.products.length} variantes</span></div>
            <div className="relative"><svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-[var(--pos-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label="Buscar producto" placeholder="Buscar café, platillo, postre…" className="pos-ui-focus min-h-11 w-full rounded-xl border border-[var(--pos-border)] bg-[var(--pos-surface-2)] py-3 pl-10 pr-10 text-sm placeholder:text-[var(--pos-text-muted)]" value={search} onChange={event => setSearch(event.target.value)} />{search ? <button aria-label="Limpiar búsqueda" className="pos-ui-focus absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--pos-text-muted)] hover:bg-white/5 hover:text-[var(--pos-text)]" onClick={() => setSearch("")}>×</button> : null}</div>
            <div className="flex gap-2 overflow-x-auto pb-1">{["", ...new Set(data.products.map(product => product.category))].map(name => <button key={name} aria-pressed={category === name} className={`pos-ui-focus min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors ${category === name ? "border-cyan-300/30 bg-[var(--pos-primary)]/10 text-[var(--pos-primary-text)]" : "border-[var(--pos-border)] bg-[var(--pos-surface-2)] text-[var(--pos-text-muted)] hover:border-white/20 hover:text-[var(--pos-text)]"}`} onClick={() => setCategory(name)}>{name || "Todo"}</button>)}</div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">{data.products.filter(product => (!category || product.category === category) && `${product.product_name} ${product.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(product => <button key={product.id} aria-label={`Agregar ${product.product_name}, ${product.name}, ${money(Number(product.price))}`} disabled={busy || (product.available !== null && product.available < 1)} className="pos-ui-focus group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--pos-border)] bg-[var(--pos-surface-2)] text-left transition-colors hover:border-cyan-300/40 hover:bg-[#1b2c39] disabled:cursor-not-allowed disabled:opacity-70" onClick={() => { if (product.modifier_groups?.length) { setError(null); setCustomizing(product); } else { void act("item_add", { checkId: check.id, variantId: product.id, quantity: 1, notes: "" }); } }}>
              <ProductVisual imageUrl={product.image_url} category={product.category} />
              <span className="flex flex-1 flex-col p-3"><span className="text-sm font-semibold leading-5 text-[var(--pos-text)]">{product.product_name}</span><span className="mt-1 text-[11px] leading-4 text-[var(--pos-text-muted)]">{product.name}</span><span className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-[var(--pos-primary-text)] tabular-nums">{money(Number(product.price))}<span className="flex min-h-8 items-center justify-center rounded-lg border border-cyan-300/20 bg-[var(--pos-primary)]/10 px-2 text-[11px]">{product.available !== null && product.available < 1 ? "Agotado" : "+ Agregar"}</span></span></span>
            </button>)}</div>
            {data.products.length > 0 && !data.products.some(product => (!category || product.category === category) && `${product.product_name} ${product.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ? <p role="status" className="rounded-xl border border-dashed border-[var(--pos-border)] py-10 text-center text-sm text-[var(--pos-text-muted)]">No hay productos que coincidan con tu búsqueda.</p> : null}
            {!data.products.length ? <p className={panel}>No hay productos activos disponibles. Agrega productos al catálogo POS desde Administración.</p> : null}
          </div> : pendingPayment || closed ? null : <div className={panel}><h3 className="text-xl font-bold">Productos de la cuenta</h3><div className="mt-4 divide-y divide-[var(--pos-line)]">{checkItems.map(item => <div key={item.id} className="flex justify-between gap-4 py-4"><div><strong>{item.quantity} × {item.product_name}</strong><p className="text-sm">{item.variant_name} · {money(item.unit_price)} c/u</p><FoodItemModifiers modifiers={item.configuration?.modifiers} />{item.notes ? <p className="mt-2 text-amber-500">{item.notes}</p> : null}</div><strong>{money(item.line_total)}</strong></div>)}</div></div>}
          <div className={canEdit ? "space-y-4 xl:sticky xl:top-36" : "space-y-4"}>
            {canEdit ? <div className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-b from-[#172a35] to-[#13212c] p-4 shadow-xl"><div className="flex items-center justify-between gap-3 border-b border-[var(--pos-border)] pb-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--pos-primary-text)]">Pedido actual</p><h3 className="mt-1 text-lg font-bold text-[var(--pos-text)]">Nuevo envío</h3></div><span className="rounded-full border border-[var(--pos-border)] bg-white/5 px-2.5 py-1 text-[11px] text-[var(--pos-text-secondary)]">{draft.length} partidas</span></div>
              <div className="pos-ui-scrollbar max-h-[min(38vh,380px)] overflow-y-auto">{!draft.length ? <div className="py-8 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--pos-primary)]/10 text-[var(--pos-primary-text)]"><FloorIcon kind="ready" /></span><p className="mt-3 text-sm text-[var(--pos-text-muted)]">Toca un producto para agregarlo.</p></div> : draft.map(item => <DraftItem key={`${item.id}:${item.version}`} item={item} money={money} busy={busy} onDirty={dirty => setDirtyNotes(value => ({ ...value, [`${item.id}:${item.version}`]: dirty }))} onSave={(quantity, notes) => act("item_update", { checkId: check.id, itemId: item.id, quantity, notes, version: item.version })} />)}</div>
              <div className="mt-3 lg:hidden">{draft.map(item => <DraftItem key={`mobile:${item.id}:${item.version}`} item={item} money={money} busy={busy} onDirty={dirty => setDirtyNotes(value => ({ ...value, [`${item.id}:${item.version}`]: dirty }))} onSave={(quantity, notes) => act("item_update", { checkId: check.id, itemId: item.id, quantity, notes, version: item.version })} />)}</div>
               <button className={`${primary} mt-4 w-full`} disabled={busy || !draft.length || draft.some(item => dirtyNotes[`${item.id}:${item.version}`])} onClick={() => void act("send", { checkId: check.id, version: check.version })}>Enviar a cocina · {money(draft.reduce((sum, item) => sum + Number(item.line_total), 0))}</button>
            </div> : null}
            {checkTickets.map(ticket => <div key={ticket.id} className={`${panel} ${ticket.status === "READY" && !ticket.served_at ? "ring-2 ring-emerald-400" : ""}`}><div className="flex justify-between gap-3"><h3 className="font-bold">Envío {ticket.sequence}</h3><span className="font-semibold">{ticket.served_at ? "Entregado" : ticket.status === "READY" ? "Listo para entregar" : ticket.status === "PREPARING" ? "Preparando" : "En cocina"}</span></div><p className="mt-2 text-sm">{staffName(ticket.sent_by)} · Enviado hace {elapsedFoodTime(ticket.sent_at, now)}</p>
              {checkItems.filter(item => item.ticket_id === ticket.id).map(item => <div className="mt-3" key={item.id}><div className="flex justify-between gap-2"><span>{item.quantity} × {item.product_name} · {item.variant_name}</span><span>{money(item.line_total)}</span></div><FoodItemModifiers modifiers={item.configuration?.modifiers} />{item.notes ? <p className="text-amber-500">{item.notes}</p> : null}</div>)}
              {ticket.served_by ? <p className="mt-3 text-sm text-emerald-500">Entregó {staffName(ticket.served_by)}</p> : ticket.status === "READY" && view === "salon" ? <button className={`${primary} mt-4 w-full`} disabled={busy} onClick={() => void act("serve", { checkId: check.id, ticketId: ticket.id })}>Entregado</button> : null}
            </div>)}
            <div className={canEdit ? "rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-surface-2)] p-4 text-[var(--pos-text-secondary)]" : panel}><div className="flex justify-between"><span>Subtotal</span><span>{money(checkItems.reduce((sum, item) => sum + Number(item.subtotal), 0))}</span></div><div className="mt-2 flex justify-between text-sm"><span>Impuestos {check.prices_include_tax ? "incluidos" : "adicionales"}</span><span>{money(checkItems.reduce((sum, item) => sum + Number(item.tax_amount), 0))}</span></div><div className="mt-2 flex justify-between text-sm"><span>Descuentos</span><span>{money(0)}</span></div><div className="mt-4 flex justify-between text-2xl font-bold"><span>Total</span><span>{money(total(check.id))}</span></div>
              {view === "salon" ? check.status === "OPEN" ? <><button className={`${primary} mt-5 w-full`} disabled={busy || !canRequest} onClick={() => void act("request_payment", { checkId: check.id, version: check.version })}>Solicitar cobro</button>{!canRequest ? <p className="mt-2 text-sm text-[var(--pos-text-secondary)]">Entrega todos los envíos para solicitar la cuenta.</p> : null}</> : pendingPayment ? <><button className={`${primary} mt-5 w-full`} disabled={busy} onClick={() => setSelected(null)}>Volver al salón</button><button className={`${button} mt-3 w-full`} disabled={busy} onClick={() => void act("resume", { checkId: check.id, version: check.version })}>Reanudar pedido</button></> : <button className={`${primary} mt-5 w-full`} disabled={busy} onClick={() => setSelected(null)}>Volver al salón</button> : <><button type="button" className={`${primary} mt-5 w-full`} disabled={busy || !effectiveCash} onClick={() => { setReceivedAmount(""); setPaymentReference(""); setReceiptPreview(false); setPaymentOpen(true); }}>Cobrar {money(total(check.id))}</button><div className="hidden">
                <label className="block">Turno de caja<select aria-label="Turno de caja" className={`${input} mt-2`} value={effectiveCash} onChange={event => setCashSessionId(event.target.value)}><option value="">Selecciona caja abierta</option>{data.cash_sessions.map(session => <option key={session.id} value={session.id}>{session.register_name}</option>)}</select></label>
                {!data.cash_sessions.length ? <p className="text-amber-500">Abre un turno desde “Abrir caja” antes de cobrar.</p> : null}
                <div className="grid grid-cols-3 gap-2">{[["cash", "Efectivo"], ["card", "Tarjeta"], ["other", "Otro"]].map(([value, label]) => <button key={value} aria-pressed={method === value} className={method === value ? primary : button} onClick={() => { setMethod(value); setPaymentReference(""); }} disabled={busy}>{label}</button>)}</div>
                {method === "cash" ? <div className="rounded-xl border border-[var(--pos-border)] bg-white/[0.03] p-3"><label className="block text-sm font-semibold">Monto recibido<input aria-label="Monto recibido" inputMode="decimal" className={`${input} mt-2 text-xl tabular-nums`} value={receivedAmount} onChange={event => setReceivedAmount(event.target.value)} placeholder={money(total(check.id))} /></label><div className="mt-2 grid grid-cols-3 gap-2"><button type="button" className={button} onClick={() => setReceivedAmount(String(total(check.id)))}>Exacto</button><button type="button" className={button} onClick={() => setReceivedAmount(String(total(check.id) + 20))}>+20</button><button type="button" className={button} onClick={() => setReceivedAmount(String(total(check.id) + 50))}>+50</button><button type="button" className={button} onClick={() => setReceivedAmount("100")}>100</button><button type="button" className={button} onClick={() => setReceivedAmount("200")}>200</button><button type="button" className={button} onClick={() => setReceivedAmount("")}>Limpiar</button></div><p className="mt-3 flex justify-between text-sm"><span>Cambio</span><strong className={Number(receivedAmount || 0) >= total(check.id) ? "text-emerald-300" : "text-rose-300"}>{money(Math.max(0, Number(receivedAmount || 0) - total(check.id)))}</strong></p></div> : <label className="block text-sm font-semibold">{method === "card" ? "Referencia terminal" : "Referencia o nota"}<input aria-label={method === "card" ? "Referencia terminal" : "Referencia o nota"} className={`${input} mt-2`} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder={method === "card" ? "Folio de autorización" : "Transferencia, vale o cortesía"} required /></label>}
                <div className="grid grid-cols-2 gap-2"><button type="button" className={button} onClick={() => window.print()}>Imprimir pre-cuenta</button><button type="button" className={button} onClick={() => setNotice("Pre-cuenta lista para imprimir.")}>Vista previa</button></div>
                <button type="button" className={`${button} w-full text-sm`} disabled title="Disponible en Caja V2">Dividir cuenta · Próximamente</button>
                <p className="text-xs text-[var(--pos-text-muted)]">{method === "cash" ? "El cambio se calcula automáticamente. No se aceptan pagos menores al total." : "Captura la referencia antes de confirmar el cobro."}</p>
                <button className={`${primary} w-full text-lg`} disabled={busy || !effectiveCash || check.status !== "PAYMENT_PENDING" || (method === "cash" ? Number(receivedAmount || 0) < total(check.id) : !paymentReference.trim())} onClick={() => void act("pay", { checkId: check.id, version: check.version, cashSessionId: effectiveCash, method, receivedAmount: method === "cash" ? Number(receivedAmount) : total(check.id), reference: paymentReference.trim() })}>Cobrar {money(total(check.id))} y liberar mesa</button>
              </div></>}
            </div>
          </div>
        </div>
      </> : <>
        {opening ? <PosModal open size="small" title={`Abrir ${data.tables.find(table => table.id === opening)?.name || "mesa"}`} closeLabel="Cerrar apertura de mesa" dismissible={!busy} onClose={() => { if (!busy) setOpening(null); }} className="border border-[var(--pos-border)]">
          <form ref={openingForm} className="space-y-5" onSubmit={event => { event.preventDefault(); void act("open", { tableId: opening, guests, customerName: customer }); }}>
            {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}
            <label className="block text-sm font-medium">Personas<input type="number" min={1} max={100} required disabled={busy} className={`${input} mt-2`} value={guests} onChange={event => setGuests(Number(event.target.value))} /></label>
            <label className="block text-sm font-medium">Nombre del cliente <span className="font-normal text-[var(--pos-text-muted)]">(opcional)</span><input className={`${input} mt-2`} maxLength={120} disabled={busy} value={customer} onChange={event => setCustomer(event.target.value)} /></label>
            <p className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-xs text-[var(--pos-text-muted)]">Responsable: <span className="font-semibold text-[var(--pos-text-secondary)]">{operator.name}</span></p>
            <div className="flex gap-3 border-t border-[var(--pos-border)] pt-4"><button className={button} type="button" disabled={busy} onClick={() => setOpening(null)}>Cancelar</button><button className={`${primary} flex-1`} disabled={busy}>{busy ? "Abriendo…" : "Abrir mesa"}</button></div>
          </form>
        </PosModal> : null}
        {floor ? <>
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--pos-primary-text)]">Centro de operación</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--pos-text)] md:text-5xl">Salón</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--pos-text-muted)]">Gestiona tus mesas, toma pedidos y brinda experiencias increíbles.</p></div><span className="rounded-xl border border-[var(--pos-border)] bg-white/[0.03] px-4 py-2.5 text-xs text-[var(--pos-text-muted)]">{data.tables.length} mesas · {occupiedCount} en servicio</span></div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
            { label: "Mesas libres", count: tableStates.filter(state => state === "AVAILABLE").length, kind: "table" as const, tone: "text-[var(--pos-primary-text)] bg-[var(--pos-primary)]/10", caption: "Disponibles para recibir" },
            { label: "Mesas ocupadas", count: occupiedCount, kind: "people" as const, tone: "text-sky-300 bg-sky-300/10", caption: "Cuentas en servicio" },
            { label: "Listas para entregar", count: tableStates.filter(state => state === "READY").length, kind: "ready" as const, tone: "text-emerald-300 bg-emerald-300/10", caption: "Esperando entrega" },
            { label: "Pendientes de cobro", count: tableStates.filter(state => state === "PAYMENT_PENDING").length, kind: "cash" as const, tone: "text-violet-300 bg-violet-300/10", caption: "Cuentas enviadas a caja" },
          ].map(metric => <div key={metric.label} className="overflow-hidden rounded-2xl border border-[var(--pos-border)] bg-gradient-to-br from-[#172632] to-[#111c26] p-4 shadow-lg xl:p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-[var(--pos-text-secondary)]">{metric.label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}><FloorIcon kind={metric.kind} /></span></div><p className="mt-3 text-4xl font-semibold tracking-tight text-[var(--pos-text)] tabular-nums">{metric.count}</p><p className="mt-2 hidden text-[11px] text-[var(--pos-text-muted)] sm:block">{metric.caption}</p></div>)}</div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--pos-border)] py-4"><div aria-label="Filtrar mesas por estado" className="flex max-w-full gap-1 overflow-x-auto pb-1">{([["ALL", "Todas"], ["AVAILABLE", "Libres"], ["OCCUPIED", "Ocupadas"], ["ORDER_SENT", "En cocina"], ["READY", "Listas"], ["PAYMENT_PENDING", "Por cobrar"]] as const).map(([value,label]) => <button key={value} aria-pressed={floorFilter === value} onClick={() => setFloorFilter(value)} className={`pos-ui-focus min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${floorFilter === value ? "bg-[var(--pos-primary)]/10 text-[var(--pos-primary-text)] ring-1 ring-inset ring-cyan-300/25" : "text-[var(--pos-text-muted)] hover:bg-white/5 hover:text-[var(--pos-text)]"}`}>{label}</button>)}</div><div className="flex w-full items-center gap-2 sm:w-auto"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--pos-border)] bg-[#14212c] px-3 py-2 text-[var(--pos-text-muted)]"><FloorIcon kind="branch" /><select aria-label="Sucursal" disabled={busy || data.locations.length === 1} value={data.location?.id || ""} onChange={event => { setLocationId(event.target.value); setSnapshot(null); setSelected(null); setOpening(null); setCashSessionId(""); }} className="pos-ui-focus min-h-8 min-w-0 bg-transparent text-xs font-semibold text-[var(--pos-text-secondary)] disabled:opacity-80"><option value="">Selecciona sucursal</option>{data.locations.map(location => <option className="bg-slate-900" key={location.id} value={location.id}>{location.name}</option>)}</select></label><div className="flex rounded-xl border border-[var(--pos-border)] bg-[#14212c] p-1">{([['grid','Cuadrícula'],['list','Lista']] as const).map(([value,label]) => <button key={value} aria-label={label} aria-pressed={floorLayout===value} onClick={() => setFloorLayout(value)} className={`pos-ui-focus flex h-10 w-10 items-center justify-center rounded-lg ${floorLayout===value?'bg-white/10 text-[var(--pos-primary-text)]':'text-[var(--pos-text-muted)] hover:text-[var(--pos-text)]'}`}><FloorIcon kind={value} /></button>)}</div></div></div>
        </> : null}
        <div className={floor ? floorLayout === "grid" ? "grid gap-5 sm:grid-cols-2 2xl:grid-cols-3" : "grid gap-3" : "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"}>{data.tables.filter(table => view === "cash" ? data.checks.some(value => value.table_id === table.id && value.status === "PAYMENT_PENDING") : floorFilter === "ALL" || foodTableState(data.checks.find(value => value.table_id === table.id),data.tickets) === floorFilter).map(table => {
          const account = data.checks.find(value => value.table_id === table.id);
          const state = states[foodTableState(account, data.tickets)];
          if (floor) {
            const status = foodTableState(account, data.tickets);
            const presentation = floorStates[status];
            const articles = account ? data.items.filter(item => item.check_id === account.id).reduce((sum,item) => sum + Number(item.quantity),0) : 0;
            return <button key={table.id} disabled={busy} className={`pos-ui-focus group overflow-hidden rounded-2xl border border-[var(--pos-border)] bg-[#13212c] text-left shadow-[0_12px_35px_-18px_#000] transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/35 disabled:cursor-wait disabled:opacity-50 ${floorLayout==='list'?'sm:flex sm:items-stretch':''}`} onClick={() => { if (account) { setSelected(account.id); setOpening(null); } else { setOpening(table.id); setGuests(2); setCustomer(""); } }}>
              <div className={`relative isolate overflow-hidden bg-[#1c3039] ${floorLayout==='list'?'h-32 shrink-0 sm:h-auto sm:w-44':'h-44'}`}><TableAmbience /><div className="absolute inset-0 bg-gradient-to-t from-[#13212c] via-[#13212c]/10 to-[#09141b]/30" /><span className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur-xl ${presentation.badge}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{presentation.label}</span><span className="absolute bottom-3 left-5 text-2xl font-bold tracking-tight text-[var(--pos-text)]">{table.name}</span></div>
              <div className="flex flex-1 flex-col p-5"><div className="flex items-center justify-between gap-3 text-xs text-[var(--pos-text-muted)]"><span className="flex items-center gap-1.5"><FloorIcon kind="people" />{account ? `${account.guests} personas` : 'Disponible'}</span><span className="tabular-nums">{account ? elapsedFoodTime(account.opened_at, now) : 'Sin cuenta abierta'}</span></div><div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wider text-[var(--pos-text-muted)]">{account ? 'Total de la cuenta' : 'Mesa libre'}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[var(--pos-text)] tabular-nums">{account ? money(total(account.id)) : 'Te esperamos'}</p></div>{account ? <span className="pb-1 text-xs text-[var(--pos-text-muted)]">{articles} {articles === 1 ? 'artículo' : 'artículos'}</span> : null}</div><p className="mt-3 min-h-5 text-xs text-[var(--pos-text-muted)]">{presentation.context}</p><span className={`mt-5 flex min-h-11 items-center justify-between rounded-xl border px-4 text-xs font-semibold ${status==='AVAILABLE'?'border-cyan-300/30 bg-[var(--pos-primary)]/10 text-[var(--pos-primary-text)]':'border-[var(--pos-border)] bg-[var(--pos-surface-2)] text-[var(--pos-text-secondary)]'}`}>{presentation.cta}<span aria-hidden="true">↗</span></span></div>
            </button>;
          }
          return <button key={table.id} disabled={busy} className={`pos-ui-focus min-h-52 rounded-2xl border-2 p-5 text-left ${state.color}`} onClick={() => { if (account) { setSelected(account.id); setOpening(null); } else { setOpening(table.id); setGuests(2); setCustomer(""); } }}>
            <span className="text-sm font-bold">{state.label}</span><h2 className="mt-3 text-3xl font-bold">{table.name}</h2>
            {account ? <><p className="mt-3">{account.guests} personas · {staffName(account.opened_by)}</p><p className="mt-1 text-sm">{new Date(account.opened_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · {elapsedFoodTime(account.opened_at, now)}</p><p className="mt-3 text-2xl font-bold tabular-nums">{money(total(account.id))}</p></> : <p className="mt-8">Toca para abrir →</p>}
          </button>;
        })}</div>
        {floor && data.tables.length > 0 && !data.tables.some(table => floorFilter === "ALL" || foodTableState(data.checks.find(account=>account.table_id===table.id),data.tickets) === floorFilter) ? <div role="status" className="rounded-2xl border border-dashed border-[var(--pos-border)] py-16 text-center text-sm text-[var(--pos-text-muted)]">No hay mesas en este estado.</div> : null}
        {view === "cash" && !data.checks.some(value => value.status === "PAYMENT_PENDING") ? <div className={`${panel} py-20 text-center text-xl`}>Sin cuentas pendientes de cobro</div> : null}
        {view === "salon" && !data.tables.length ? <div className={`${panel} py-14 text-center`}><h2 className="text-xl font-semibold">Configura las mesas de tu salón</h2><p className="mt-3">{operator.role === "ADMIN" ? "Agrega los nombres o números que utiliza tu equipo." : "Un administrador puede agregar las mesas de esta sucursal."}</p></div> : null}
        {view === "salon" && operator.role === "ADMIN" ? <form className="flex max-w-lg gap-3" onSubmit={event => { event.preventDefault(); void act("table_create", { locationId: data.location?.id, name: tableName }); }}><input className={input} placeholder="Nombre: Mesa 4" aria-label="Nombre de nueva mesa" maxLength={60} value={tableName} onChange={event => setTableName(event.target.value)} required /><button className={`${button} shrink-0`} disabled={busy || !tableName.trim()}>Agregar mesa</button></form> : null}
      </>}
    </>}
    {check && (view === "cash" || pendingPayment) ? <FoodReceipt mode="account" branding={branding} check={check} items={checkItems} staff={staffName(check.opened_by)} table={tableLabel(check)} total={money(total(check.id))} /> : null}
    {paymentReceipt ? <FoodReceipt mode="final" branding={branding} check={paymentReceipt.check} items={paymentReceipt.items} staff={paymentReceipt.staff} table={paymentReceipt.table} total={money(paymentReceipt.total)} method={paymentReceipt.method === "cash" ? "Efectivo" : paymentReceipt.method === "card" ? "Tarjeta" : "Otro"} received={paymentReceipt.method === "cash" ? money(paymentReceipt.received) : undefined} change={paymentReceipt.method === "cash" ? money(paymentReceipt.change) : undefined} reference={paymentReceipt.reference} /> : null}
    {paymentReceipt ? <PosModal open size="small" title="Pago exitoso" closeLabel="Cerrar confirmación de pago" dismissible onClose={() => setPaymentReceipt(null)} className="border border-emerald-300/20"><div className="space-y-4"><div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4"><p className="text-xs uppercase tracking-[0.16em] text-emerald-200">Cuenta cerrada · Mesa libre</p><p className="mt-2 text-3xl font-bold text-[var(--pos-text)]">{money(paymentReceipt.total)}</p><p className="mt-1 text-sm text-[var(--pos-text-secondary)]">Método: {paymentReceipt.method === "cash" ? "Efectivo" : paymentReceipt.method === "card" ? "Tarjeta" : "Otro"}</p>{paymentReceipt.method === "cash" ? <p className="mt-1 text-sm text-[var(--pos-text-secondary)]">Recibido: {money(paymentReceipt.received)} · Cambio: {money(paymentReceipt.change)}</p> : paymentReceipt.reference ? <p className="mt-1 text-sm text-[var(--pos-text-secondary)]">Referencia: {paymentReceipt.reference}</p> : null}</div><div className="grid grid-cols-2 gap-2"><button className={button} onClick={() => window.print()}>Imprimir comprobante</button><button className={primary} onClick={() => setPaymentReceipt(null)}>Volver a Caja</button></div></div></PosModal> : null}
    {paymentOpen && check && view === "cash" ? <PosModal open size="small" title={`Cobrar ${tableLabel(check)} · Cuenta #${accountReference(check)}`} description="Total a pagar" closeLabel="Cancelar cobro" dismissible={!busy} onClose={() => { if (!busy) setPaymentOpen(false); }} className="border border-cyan-300/20" footer={<><button className={button} disabled={busy} onClick={() => setPaymentOpen(false)}>Cancelar</button><button className={button} disabled={busy} onClick={() => setSplitOpen(true)}>Dividir cuenta</button><button className={button} disabled={busy} onClick={() => setReceiptPreview(value => !value)}>{receiptPreview ? "Ocultar vista previa" : "Vista previa"}</button><button className={button} disabled={busy} onClick={() => window.print()}>Imprimir cuenta</button><button className={primary} disabled={busy || !effectiveCash || (method === "cash" ? Number(receivedAmount || 0) < balance(check.id) : !paymentReference.trim())} onClick={() => void act("pay", { checkId: check.id, version: check.version, cashSessionId: effectiveCash, method, amount: balance(check.id), receivedAmount: method === "cash" ? Number(receivedAmount) : balance(check.id), reference: paymentReference.trim() })}>Cobrar y liberar mesa · {money(balance(check.id))}</button></>}> 
      <div className="space-y-4"><div className="flex items-end justify-between rounded-xl border border-[var(--pos-border)] bg-white/[0.03] p-4"><div><p className="text-xs text-[var(--pos-text-muted)]">Responsable: {staffName(check.opened_by)}</p><p className="mt-1 text-xs text-[var(--pos-text-muted)]">{checkItems.reduce((sum,item) => sum + Number(item.quantity),0)} productos · Turno {data.cash_sessions.find(session => session.id === effectiveCash)?.register_name || "sin seleccionar"}</p></div><strong className="text-3xl text-[var(--pos-text)]">{money(total(check.id))}</strong></div><div className="grid grid-cols-3 gap-2">{[["cash", "Efectivo"], ["card", "Tarjeta"], ["other", "Otro"]].map(([value,label]) => <button key={value} className={method === value ? primary : button} aria-pressed={method === value} disabled={busy} onClick={() => { setMethod(value); setPaymentReference(""); }}>{label}</button>)}</div>{method === "cash" ? <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pos-text-muted)]">Monto recibido</p><input aria-label="Monto recibido" inputMode="decimal" className={`${input} mt-2 text-2xl tabular-nums`} value={receivedAmount} onChange={event => setReceivedAmount(event.target.value)} placeholder={money(total(check.id))} /><div className="mt-3 grid grid-cols-3 gap-2">{[["Exacto",total(check.id)],["+20",total(check.id)+20],["+50",total(check.id)+50],["100",100],["200",200],["Limpiar",""]].map(([label,value]) => <button type="button" key={label} className={button} disabled={busy} onClick={() => setReceivedAmount(String(value))}>{label}</button>)}</div><div className="mt-4 rounded-xl bg-emerald-300/15 p-4 text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">Cambio</p><p className="mt-1 text-4xl font-bold tabular-nums text-emerald-200">{money(Math.max(0, Number(receivedAmount || 0) - total(check.id)))}</p>{Number(receivedAmount || 0) < total(check.id) ? <p className="mt-1 text-xs text-rose-200">Faltan {money(total(check.id) - Number(receivedAmount || 0))}</p> : null}</div></div> : <label className="block text-sm font-semibold">{method === "card" ? "Referencia / folio de terminal" : "Referencia / nota"}<input aria-label={method === "card" ? "Referencia / folio de terminal" : "Referencia / nota"} className={`${input} mt-2`} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder={method === "card" ? "Ej. 482913" : "Transferencia, vale o cortesía"} /></label>}<div className="rounded-xl border border-[var(--pos-border)] bg-white/[0.02] p-3 text-xs text-[var(--pos-text-muted)]"><span className="font-semibold text-[var(--pos-text-secondary)]">Cliente:</span> No identificado <button type="button" className="ml-2 text-[var(--pos-primary-text)]" disabled>Identificar cliente</button></div><button type="button" className="w-full text-left text-xs text-[var(--pos-text-muted)]" disabled>Dividir cuenta · Próximamente</button>{receiptPreview ? <FoodReceipt mode="pre" branding={branding} check={check} items={checkItems} staff={staffName(check.opened_by)} table={tableLabel(check)} total={money(total(check.id))} preview /> : null}</div>
    </PosModal> : null}
    {splitOpen && check && paymentOpen ? <PosModal open size="medium" title={`Dividir ${tableLabel(check)} · Cuenta #${accountReference(check)}`} description={`Saldo actual: ${money(balance(check.id))}`} closeLabel="Cerrar división" onClose={() => setSplitOpen(false)} footer={<><button className={button} onClick={() => setSplitOpen(false)}>Cancelar</button><button className={primary} disabled={busy || !effectiveCash || !splitAmount || Number(splitAmount) <= 0 || Number(splitAmount) > balance(check.id)} onClick={() => void act("pay", { checkId: check.id, version: check.version, cashSessionId: effectiveCash, method, amount: Number(splitAmount), receivedAmount: method === "cash" ? Number(receivedAmount || splitAmount) : Number(splitAmount), reference: paymentReference.trim(), allocations: splitMode === "items" ? Object.entries(splitAllocations).filter(([, quantity]) => quantity > 0).map(([foodItemId, quantity]) => ({ foodItemId, quantity })) : undefined })}>Cobrar parte · {splitAmount ? money(Number(splitAmount)) : money(0)}</button></>}> 
      <div className="space-y-4"><div className="grid grid-cols-3 gap-2">{(["amount", "equal", "items"] as const).map(mode => <button key={mode} className={splitMode === mode ? primary : button} onClick={() => setSplitMode(mode)}>{mode === "amount" ? "Monto" : mode === "equal" ? "Partes iguales" : "Por artículos"}</button>)}</div>{splitMode === "equal" ? <div className="space-y-3"><label className="block text-sm font-semibold">Dividir entre<select className={`${input} mt-2`} value={equalParts === 0 ? "custom" : equalParts} onChange={event => { const value = event.target.value; if (value === "custom") { setEqualParts(0); setEqualPartIndex(0); setSplitAmount(""); } else setEqualSelection(Number(value)); }}>{[2,3,4,5].map(parts => <option key={parts} value={parts}>{parts} partes</option>)}<option value="custom">Personalizado</option></select></label>{equalParts === 0 ? <label className="block text-sm font-semibold">Número de partes<input className={`${input} mt-2`} type="number" min={2} max={20} step={1} inputMode="numeric" value={equalCustomParts} onChange={event => { const raw = event.target.value; setEqualCustomParts(raw); const parts = Number(raw); if (Number.isInteger(parts) && parts >= 2 && parts <= 20) { setEqualPartIndex(0); setSplitAmount(equalSplitPart(balance(check.id), parts, 0).toFixed(2)); } else setSplitAmount(""); }} placeholder="2 a 20" /></label> : null}{Number.isInteger(selectedEqualParts) && selectedEqualParts >= 2 && selectedEqualParts <= 20 ? <div className="space-y-2"><p className="text-sm text-[var(--pos-text-muted)]">Selecciona la parte que cobrarás ahora. El reparto usa centavos exactos.</p><div className="grid grid-cols-2 gap-2">{Array.from({ length: selectedEqualParts }, (_, index) => <button type="button" key={index} className={equalPartIndex === index ? primary : button} onClick={() => { setEqualPartIndex(index); setSplitAmount(equalSplitPart(balance(check.id), selectedEqualParts, index).toFixed(2)); }}>Parte {index + 1} · {money(equalSplitPart(balance(check.id), selectedEqualParts, index))}</button>)}</div></div> : null}</div> : splitMode === "items" ? <div className="space-y-2"><p className="text-sm text-[var(--pos-text-muted)]">Selecciona cantidades pendientes por artículo.</p>{checkItems.map(item => { const pendingQuantity = itemPendingQuantity(item); return <label key={item.id} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${pendingQuantity ? "border-[var(--pos-border)]" : "border-emerald-300/20 opacity-60"}`}><span>{item.quantity} × {item.product_name}<span className="ml-2 text-xs text-[var(--pos-text-muted)]">{pendingQuantity ? `${pendingQuantity} pendiente${pendingQuantity === 1 ? "" : "s"}` : "Pagado"}</span></span><input className="w-20 rounded-lg bg-white/10 p-2" type="number" min="0" max={pendingQuantity} step="1" disabled={!pendingQuantity} onChange={event => updateSplitAllocation(item.id, Number(event.target.value))} /></label>; })}</div> : <label className="block text-sm font-semibold">Monto a cobrar<input className={`${input} mt-2 text-2xl`} inputMode="decimal" value={splitAmount} onChange={event => setSplitAmount(event.target.value)} placeholder={money(balance(check.id))} /></label>}<div className="rounded-xl border border-[var(--pos-border)] p-4 text-sm"><div className="flex justify-between"><span>Total original</span><strong>{money(total(check.id))}</strong></div><div className="mt-2 flex justify-between"><span>Pagado</span><strong className="text-emerald-200">{money(paid(check.id))}</strong></div><div className="mt-2 flex justify-between text-lg"><span>Saldo</span><strong className="text-[var(--pos-primary-text)]">{money(balance(check.id))}</strong></div></div></div>
    </PosModal> : null}
    {customizing && check && canEdit ? <PosFoodModifierDialog key={customizing.id} product={customizing} visual={<ProductVisual imageUrl={customizing.image_url} category={customizing.category} />} money={money} busy={busy} error={error} onClose={() => { if (!busy) setCustomizing(null); }} onAdd={async (ids,notes) => {
      const added = await act("item_add", { checkId: check.id,variantId:customizing.id,quantity:1,notes,modifierOptionIds:ids });
      if (added) setCustomizing(null);
      return added;
    }} /> : null}
    </div>
  </section>;
}

type InlineCustomer = { id: string; first_name: string; last_name: string | null; phone: string | null; loyalty_member?: { points_balance?: number | null } | null };

function CustomerInlineSummary({ check, memory, query, results, loading, open, onOpenSearch, onCloseSearch, onSearch, onSelect }: {
  check: FoodCheck;
  memory: { allergy_tags?: string[]; restriction_note?: string | null; pointsBalance?: number | null; visits?: number | null } | null;
  query: string;
  results: InlineCustomer[];
  loading: boolean;
  open: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearch: (value: string) => void;
  onSelect: (customerId: string) => void;
}) {
  const allergyTags = memory?.allergy_tags || [];
  const customerName = check.customer_name?.trim();
  return <section aria-label="Cliente de la mesa" className="pos-food-surface rounded-2xl border p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--pos-text-muted)]">Cliente</p>
        {customerName ? <><p className="mt-1 truncate text-base font-bold text-[var(--pos-text)]">{customerName}</p><p className="mt-1 text-xs text-[var(--pos-text-muted)]">{memory?.pointsBalance ?? 0} pts · {memory?.visits ?? 0} visitas</p></> : <p className="mt-1 text-sm font-semibold text-[var(--pos-text-secondary)]">Sin cliente identificado</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {customerName ? <><button type="button" className="pos-ui-focus min-h-10 rounded-xl border border-[var(--pos-border)] px-3 text-xs font-semibold text-[var(--pos-text)]" onClick={onOpenSearch}>Ver cliente</button><button type="button" className="pos-ui-focus min-h-10 rounded-xl border border-[var(--pos-border)] px-3 text-xs font-semibold text-[var(--pos-text)]" onClick={onOpenSearch}>Editar cliente</button>{(memory?.pointsBalance || 0) > 0 ? <button type="button" className="pos-ui-focus min-h-10 rounded-xl bg-[var(--pos-primary)] px-3 text-xs font-bold text-[var(--pos-on-primary)]" onClick={onOpenSearch}>Canjear recompensa</button> : null}</> : <button type="button" className="pos-ui-focus min-h-10 rounded-xl bg-[var(--pos-primary)] px-3 text-xs font-bold text-[var(--pos-on-primary)]" onClick={onOpenSearch}>Agregar o identificar cliente</button>}
      </div>
    </div>
    {allergyTags.length || memory?.restriction_note ? <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-800"><span className="font-black">⚠ ALERGIA</span>{allergyTags.length ? <span className="ml-2">{allergyTags.join(" · ")}</span> : null}{memory?.restriction_note ? <p className="mt-1 font-medium">Restricción: {memory.restriction_note}</p> : null}</div> : null}
    {open ? <div className="mt-3 rounded-xl border border-[var(--pos-border)] bg-[var(--pos-surface-2)] p-3"><div className="flex gap-2"><input autoFocus value={query} onChange={event => onSearch(event.target.value)} placeholder="Identificar cliente por teléfono o nombre" className="pos-ui-focus min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--pos-border)] bg-[var(--pos-surface)] px-3 text-sm text-[var(--pos-text)]" /><button type="button" className="min-h-11 rounded-xl border border-[var(--pos-border)] px-3 text-xs font-semibold text-[var(--pos-text)]" onClick={onCloseSearch}>Cerrar</button></div>{loading ? <p className="mt-3 text-xs text-[var(--pos-text-muted)]">Buscando clientes…</p> : results.length ? <div className="mt-2 grid gap-2">{results.map(result => <button type="button" key={result.id} className="pos-ui-focus flex min-h-11 items-center justify-between rounded-xl border border-[var(--pos-border)] bg-[var(--pos-surface)] px-3 text-left text-sm text-[var(--pos-text)]" onClick={() => onSelect(result.id)}><span>{result.first_name} {result.last_name || ""}<span className="ml-2 text-xs text-[var(--pos-text-muted)]">{result.phone || ""}</span></span><span className="text-xs text-[var(--pos-text-muted)]">{result.loyalty_member?.points_balance || 0} pts</span></button>)}</div> : query.trim().length >= 2 ? <p className="mt-3 text-xs text-[var(--pos-text-muted)]">No encontramos clientes con ese dato.</p> : null}</div> : null}
  </section>;
}

const floorStates = {
  AVAILABLE: { label: "Libre", badge: "border-cyan-300/30 bg-[#102b30]/80 text-[var(--pos-primary-text)]", cta: "Abrir mesa", context: "Lista para recibir a tus clientes." },
  OCCUPIED: { label: "Ocupada", badge: "border-sky-300/30 bg-[#142b40]/80 text-sky-200", cta: "Agregar pedido", context: "La experiencia continúa en la mesa." },
  ORDER_SENT: { label: "En cocina", badge: "border-amber-300/30 bg-[#392b16]/80 text-amber-200", cta: "Ver detalles", context: "Pedido enviado · sigue su preparación." },
  READY: { label: "Lista para entregar", badge: "border-emerald-300/30 bg-[#12382c]/80 text-emerald-200", cta: "Ver pedido listo", context: "Cocina terminó · pendiente de entrega." },
  PAYMENT_PENDING: { label: "Pendiente de cobro", badge: "border-violet-300/30 bg-[#2c2040]/80 text-violet-200", cta: "Ver cuenta", context: "Cuenta enviada a caja para cobrar." },
};
function FloorIcon({kind}: {kind: "table" | "people" | "ready" | "cash" | "branch" | "grid" | "list"}) {
  return <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{kind==='table'?<><rect x="4" y="5" width="16" height="10" rx="3"/><path d="M7 15v5m10-5v5M8 2v3m8-3v3"/></>:kind==='people'?<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></>:kind==='ready'?<><path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V4M9 4h6M6 21h12"/></>:kind==='cash'?<><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 9v6m12-6v6"/></>:kind==='branch'?<><path d="M3 10 5 4h14l2 6M5 10v10h14V10M9 20v-7h6v7"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></>:kind==='grid'?<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>:<><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/></>}</svg>;
}
function TableAmbience() {
  return <svg aria-hidden="true" className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105" viewBox="0 0 480 220" preserveAspectRatio="xMidYMid slice"><rect width="480" height="220" fill="#22343b"/><path d="M0 0h480v85H0z" fill="#16272f"/><path d="M65 0v100M150 0v100M345 0v100M420 0v100" stroke="#36545a" strokeWidth="3"/><path d="M0 87h480" stroke="#53706a" strokeOpacity=".25"/><ellipse cx="240" cy="220" rx="190" ry="90" fill="#07141b" opacity=".45"/><path d="M50 175 164 105h169l111 70-106 60H151z" fill="#665544"/><path d="m50 175 101 60h187l106-60" fill="#463d35"/><path d="m85 170 94-51h139l89 51-85 45H170z" fill="#86715a" opacity=".5"/><ellipse cx="192" cy="158" rx="29" ry="14" fill="#bdc5bd" opacity=".7"/><ellipse cx="295" cy="157" rx="29" ry="14" fill="#bdc5bd" opacity=".7"/><ellipse cx="192" cy="158" rx="21" ry="10" fill="#738880"/><ellipse cx="295" cy="157" rx="21" ry="10" fill="#738880"/><rect x="236" y="118" width="10" height="30" rx="3" fill="#cba875"/><path d="m241 117-12-16m12 12 14-20m-14 15-2-24" stroke="#72927b" strokeWidth="4" strokeLinecap="round"/><path d="M55 20h30l-5 18H60zm340 0h30l-5 18h-20z" fill="#ab8f61" opacity=".45"/><path d="M70 0v20m340-20v20" stroke="#738780"/><path d="M0 220V118q35-30 68 0v62m412 40V118q-35-30-68 0v62" fill="#34514c" opacity=".7"/></svg>;
}

function ProductVisual({ imageUrl, category }: { imageUrl?: string | null; category: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = typeof imageUrl === "string" && /^(https?:\/\/|\/(?!\/))/i.test(imageUrl.trim()) ? imageUrl.trim() : null;
  const coffee = /caf|coffee/i.test(category);
  const drinks = /bebida|té|tea|drink/i.test(category);
  return <span className={`relative flex h-24 w-full shrink-0 items-center justify-center overflow-hidden border-b border-white/5 ${coffee ? "bg-gradient-to-br from-[#594436] via-[#302c2b] to-[#1a2930]" : drinks ? "bg-gradient-to-br from-[#294b4b] via-[#1d353e] to-[#182733]" : "bg-gradient-to-br from-[#4a4038] via-[#303434] to-[#1b2b36]"}`}>
    <span aria-hidden="true" className="absolute -right-5 -top-8 h-28 w-28 rounded-full border border-white/[0.06] bg-white/[0.02]" />
    <span aria-hidden="true" className="absolute -bottom-10 -left-4 h-28 w-28 rounded-full border border-white/[0.04]" />
    <svg aria-hidden="true" className="h-10 w-10 text-[var(--pos-text)]/40 transition-transform group-hover:scale-105" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{coffee ? <><path d="M12 18h23v10a11.5 11.5 0 0 1-23 0V18ZM35 20h3a5 5 0 0 1 0 10h-3M9 41h30M18 12V7m7 5V5m7 7V7" /></> : drinks ? <><path d="m13 14 4 27h14l4-27H13ZM26 14l5-9h7M15 22h18M21 29v6m6-6v6" /></> : <><circle cx="24" cy="25" r="13"/><circle cx="24" cy="25" r="8"/><path d="M5 9v13m-3-13v6a3 3 0 0 0 6 0V9M5 22v20M43 9v33m0-33c-6 5-6 14 0 14" /></>}</svg>
    {source && failedSource !== source ? (
      // Tenant catalog URLs are rendered directly without a new image proxy or host configuration.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={source} alt="" width={480} height={160} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" onError={() => setFailedSource(source)} />
    ) : null}
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/20 to-transparent" />
  </span>;
}

function DraftItem({ item, money, busy, onSave, onDirty }: { item: FoodItem; money: (value: number) => string; busy: boolean; onSave: (quantity: number, notes: string) => Promise<boolean>; onDirty: (dirty: boolean) => void }) {
  const [notes, setNotes] = useState(item.notes || "");
  const dirty = notes !== (item.notes || "");
  return <div className="border-b border-[var(--pos-line)] py-5"><div className="flex justify-between gap-3"><strong>{item.product_name}</strong><strong>{money(item.line_total)}</strong></div><p className="mt-1 text-sm">{item.variant_name} · {money(item.unit_price)} c/u</p>
    <FoodItemModifiers modifiers={item.configuration?.modifiers} />
    <div className="mt-3 flex items-center gap-3"><button aria-label={`Reducir ${item.product_name}`} className={button} disabled={busy} onClick={() => void onSave(Number(item.quantity) - 1, notes)}>−</button><span className="min-w-8 text-center text-xl font-bold">{item.quantity}</span><button aria-label={`Aumentar ${item.product_name}`} className={button} disabled={busy || item.quantity >= 999} onClick={() => void onSave(Number(item.quantity) + 1, notes)}>+</button><button className={`${button} ml-auto text-sm`} disabled={busy} onClick={() => void onSave(0, notes)}>Quitar</button></div>
    <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void onSave(Number(item.quantity), notes); }}><input aria-label={`Notas para ${item.product_name}`} className={input} placeholder="Nota especial (opcional)" maxLength={500} value={notes} disabled={busy} onChange={event => { setNotes(event.target.value); onDirty(event.target.value !== (item.notes || "")); }} /><button className={button} disabled={busy || !dirty}>Guardar</button></form>
    {dirty ? <p className="mt-2 text-sm text-amber-500">Guarda la nota antes de enviar a cocina.</p> : null}
  </div>;
}

function KitchenBoard({ data, now, busy, tableLabel, staffName, onAction }: { data: FoodSnapshot; now: number; busy: boolean; tableLabel: (check: FoodCheck) => string; staffName: (id: string) => string; onAction: (action: "prepare" | "ready", ticket: FoodTicket) => void }) {
  const active = data.tickets.filter(ticket => !ticket.served_at);
  const columns: { status: FoodTicket["status"]; label: string; accent: string; dot: string; action?: "prepare" | "ready"; actionLabel?: string }[] = [
    { status: "PENDING", label: "Pendientes", accent: "border-amber-300/35 text-amber-200", dot: "bg-amber-300", action: "prepare", actionLabel: "Iniciar preparación" },
    { status: "PREPARING", label: "Preparando", accent: "border-sky-300/35 text-sky-200", dot: "bg-sky-300", action: "ready", actionLabel: "Marcar listo" },
    { status: "READY", label: "Listos", accent: "border-emerald-300/35 text-emerald-200", dot: "bg-emerald-300" },
  ];
  return <div className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-surface)] px-5 py-4 shadow-xl"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--pos-primary-text)]/70">KDS · Cocina</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--pos-text)]">Comandas en tiempo real</h2><p className="mt-1 text-sm text-[var(--pos-text-muted)]">Prioriza, prepara y entrega con una vista limpia.</p></div><div className="flex items-center gap-2 rounded-full border border-[var(--pos-border)] bg-white/[0.03] px-3 py-2 text-xs text-[var(--pos-text-secondary)]"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Sesión activa <span className="text-[var(--pos-text-muted)]">·</span> {active.length} activas</div></header>
    <div className="grid grid-cols-3 gap-3 sm:gap-4">{columns.map(column => <div key={column.status} className="flex items-center justify-between rounded-xl border border-[var(--pos-border)] bg-[var(--pos-surface)] px-4 py-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${column.dot}`} /><span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--pos-text-muted)]">{column.label}</span></div><strong className="text-xl tabular-nums text-[var(--pos-text)]">{active.filter(ticket => ticket.status === column.status).length}</strong></div>)}</div>
    <div className="grid items-start gap-4 overflow-x-auto pb-2 md:grid-cols-3">{columns.map(column => { const tickets = active.filter(ticket => ticket.status === column.status); return <section key={column.status} aria-labelledby={`kds-${column.status}`} className="min-w-[280px] rounded-2xl border border-[var(--pos-border)] bg-[#0d1922] p-3"><div className={`mb-3 flex items-center justify-between border-b pb-3 ${column.accent}`}><h3 id={`kds-${column.status}`} className="text-sm font-bold uppercase tracking-[0.15em]">{column.label}</h3><span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-[var(--pos-text-muted)]">{tickets.length}</span></div><div className="space-y-3">{tickets.map(ticket => { const account=data.checks.find(value=>value.id===ticket.check_id); return <KitchenTicket key={ticket.id} ticket={ticket} items={data.items.filter(item=>item.ticket_id===ticket.id)} table={account ? tableLabel(account) : "Mesa"} sender={staffName(ticket.sent_by)} now={now} busy={busy} action={column.action} actionLabel={column.actionLabel} onAction={onAction} />; })}{!tickets.length ? <div className="rounded-xl border border-dashed border-[var(--pos-border)] px-3 py-8 text-center text-xs text-[var(--pos-text-muted)]">Sin comandas pendientes</div> : null}</div></section>; })}</div>
  </div>;
}

export function KitchenTicket({ ticket, items, table, sender, now, busy, action, actionLabel, onAction }: { ticket: FoodTicket; items: FoodItem[]; table: string; sender: string; now: number; busy: boolean; action?: "prepare" | "ready"; actionLabel?: string; onAction: (action: "prepare" | "ready", ticket: FoodTicket) => void }) {
  const minutes = Math.max(0, Math.floor((now - new Date(ticket.sent_at).getTime()) / 60000));
  const urgency = minutes >= 15 ? "late" : minutes >= 8 ? "attention" : "normal";
  const tone = urgency === "late" ? "border-rose-400" : ticket.status === "READY" ? "border-emerald-300/35" : ticket.status === "PREPARING" ? "border-sky-300/30" : "border-amber-300/30";
  const effectiveAction = action ?? (ticket.status === "PENDING" ? "prepare" : ticket.status === "PREPARING" ? "ready" : undefined);
  const effectiveLabel = actionLabel ?? (ticket.status === "PENDING" ? "Iniciar preparación" : ticket.status === "PREPARING" ? "Marcar listo" : "Listo · esperando entrega");
  return <article className={`overflow-hidden rounded-xl border bg-[#14232d] shadow-lg shadow-black/10 ${tone}`}><header className="border-b border-[var(--pos-border)] px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--pos-text-muted)]">Envío #{ticket.sequence}</p><h4 className="mt-1 text-lg font-bold text-[var(--pos-text)]">{table}</h4></div><div className={`rounded-lg px-2 py-1 text-right ${urgency === "late" ? "bg-rose-400/15 text-rose-200" : urgency === "attention" ? "bg-amber-300/15 text-amber-200" : "bg-white/5 text-[var(--pos-text-secondary)]"}`}><strong className="block text-lg leading-none tabular-nums">{elapsedFoodTime(ticket.sent_at, now)}</strong><span className="text-[10px] uppercase tracking-wider opacity-70">abierto</span></div></div><p className="mt-2 text-xs text-[var(--pos-text-muted)]">{sender} <span className="text-[var(--pos-text-muted)]">·</span> {ticket.status === "PENDING" ? "Pendiente" : ticket.status === "PREPARING" ? "Preparando" : "Listo · esperando entrega"}</p></header><div className="space-y-3 px-4 py-3">{items.map(item => <div key={item.id}><p className="text-base font-bold text-[var(--pos-text)]">{item.quantity} × {item.product_name}</p><p className="text-xs text-[var(--pos-text-muted)]">{item.variant_name}</p><FoodItemModifiers modifiers={item.configuration?.modifiers} />{item.notes ? <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">Nota: {item.notes}</p> : null}</div>)}</div>{effectiveAction ? <div className="px-4 pb-4"><button className={`${primary} min-h-12 w-full text-sm`} disabled={busy} onClick={() => onAction(effectiveAction, ticket)}>{effectiveLabel}</button></div> : <span className="sr-only">{effectiveLabel}</span>}</article>;
}

// Kept for compatibility with callers that imported the previous presentation helper.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyKitchenTicket({ ticket, items, table, sender, now, busy, onAction }: { ticket: FoodTicket; items: FoodItem[]; table: string; sender: string; now: number; busy: boolean; onAction: (action: "prepare" | "ready") => void }) {
  const late = now - new Date(ticket.sent_at).getTime() >= 15 * 60000;
  return <article className={`overflow-hidden rounded-2xl border-2 bg-[var(--pos-panel)] ${ticket.status === "READY" ? "border-emerald-400" : late ? "border-rose-400" : "border-[var(--pos-line)]"}`}>
    <header className={`p-5 ${ticket.status === "READY" ? "bg-emerald-500/15" : late ? "bg-rose-500/15" : "bg-amber-500/10"}`}><div className="flex items-start justify-between gap-3"><h2 className="text-3xl font-bold">{table}</h2><strong className="text-xl tabular-nums">{elapsedFoodTime(ticket.sent_at, now)}</strong></div><p className="mt-2">Envío {ticket.sequence} · {sender}</p><p className="mt-3 text-lg font-bold">{ticket.status === "PENDING" ? "Pendiente" : ticket.status === "PREPARING" ? "Preparando" : "Listo · esperando entrega"}</p></header>
    <div className="space-y-5 p-5">{items.map(item => <div key={item.id}><p className="text-2xl font-bold">{item.quantity} × {item.product_name}</p><p>{item.variant_name}</p><FoodItemModifiers modifiers={item.configuration?.modifiers} />{item.notes ? <p className="mt-2 rounded-lg bg-amber-400/15 p-3 text-xl font-semibold">{item.notes}</p> : null}</div>)}</div>
    {ticket.status !== "READY" ? <div className="p-5 pt-0"><button className={`${primary} min-h-16 w-full text-xl`} disabled={busy} onClick={() => onAction(ticket.status === "PENDING" ? "prepare" : "ready")}>{ticket.status === "PENDING" ? "Iniciar preparación" : "Marcar listo"}</button></div> : null}
  </article>;
}
