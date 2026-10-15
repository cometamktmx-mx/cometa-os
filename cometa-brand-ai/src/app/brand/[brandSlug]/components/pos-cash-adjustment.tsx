"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PosButton, PosInput, PosModal } from "./pos-ui";
import { usePosContext } from "./pos-shell";
import { staffHasAnyRole, type PosStaffRole } from "@/lib/pos/staff-shared";

type Supervisor = { id: string; name: string; role: PosStaffRole; roles?: PosStaffRole[] };
export function PosCashAdjustment({ sessionId, onSaved }: { sessionId: string; onSaved: () => void }) {
  const { brand, currentOperator } = usePosContext();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState("income");
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorId, setSupervisorId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const command = useRef<{ signature: string; key: string; token?: string } | null>(null);
  const needsSupervisor = !currentOperator || !staffHasAnyRole(currentOperator, ["ADMIN", "MANAGER"]);
  useEffect(() => {
    if (!open || !needsSupervisor) return;
    const controller = new AbortController();
    void fetch(`/api/pos/operator-session?brandSlug=${encodeURIComponent(brand.slug)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudieron cargar los encargados."); if (!controller.signal.aborted) setSupervisors((body.staff as Supervisor[]).filter(staff => staff.id !== currentOperator?.id && staffHasAnyRole(staff, ["ADMIN", "MANAGER"]))); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se pudieron cargar los encargados."); });
    return () => controller.abort();
  }, [open, needsSupervisor, brand.slug, currentOperator?.id]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !reason.trim()) { setError("Captura un monto válido y el motivo."); return; }
    const payload = { cashSessionId: sessionId, movementType: direction, amount: value, reason: reason.trim(), adjustment: true };
    const signature = JSON.stringify({ brand: brand.slug, payload, supervisorId });
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() };
    const pending = command.current;
    setBusy(true); setError(null);
    try {
      if (needsSupervisor && !pending.token) {
        const response = await fetch("/api/pos/supervisor-override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug: brand.slug, supervisorStaffId: supervisorId, pin, action: "CASH_ADJUSTMENT", entityType: "cash_session", entityId: sessionId }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo autorizar."); pending.token = body.authorization.token;
      }
      const response = await fetch(`/api/pos/cash-movements?brandSlug=${encodeURIComponent(brand.slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestKey: pending.key, authorizationToken: pending.token }) });
      const body = await response.json();
      if (!response.ok) { if (response.status === 403) pending.token = undefined; throw new Error(body.error || "No se pudo registrar el ajuste."); }
      command.current = null; setOpen(false); setPin(""); setAmount(""); setReason(""); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar el ajuste."); } finally { setBusy(false); }
  }
  return <><PosButton variant="secondary" onClick={() => { setError(null); setOpen(true); }}>Ajuste autorizado</PosButton><PosModal open={open} onClose={() => { if (!busy) { setPin(""); setOpen(false); } }} title="Ajuste de caja"><form className="space-y-4" onSubmit={save}>
    <label className="block text-[var(--pos-text-primary)]">Tipo de ajuste<select className="ml-3 rounded-lg border border-[var(--pos-line)] bg-[var(--pos-canvas)] p-3 text-[var(--pos-text-primary)]" value={direction} onChange={e => setDirection(e.target.value)}><option value="income">Agregar efectivo</option><option value="expense">Restar efectivo</option></select></label>
    <PosInput label="Monto" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /><PosInput label="Motivo" required value={reason} onChange={e => setReason(e.target.value)} />
    {needsSupervisor ? <fieldset className="space-y-3 rounded-xl border border-[var(--pos-line)] p-4"><legend className="text-[var(--pos-text-primary)]">Autorización de encargado</legend><select aria-label="Encargado que autoriza" required className="w-full rounded-lg border border-[var(--pos-line)] bg-[var(--pos-canvas)] p-3 text-[var(--pos-text-primary)]" value={supervisorId} onChange={e => setSupervisorId(e.target.value)}><option value="">Selecciona encargado</option>{supervisors.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select><PosInput label="PIN del encargado" type="password" inputMode="numeric" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} /><p className="text-sm text-[var(--pos-text-muted)]">El movimiento queda a tu nombre y conserva quién lo autorizó.</p></fieldset> : null}
    {error ? <p role="alert" className="text-rose-300">{error}</p> : null}<PosButton type="submit" disabled={busy}>{busy ? "Registrando…" : "Registrar ajuste"}</PosButton>
  </form></PosModal></>;
}
