"use client";
import { useState } from "react";
import type { getAdminFinance } from "@/lib/comu/finance";
type Rows = Awaited<ReturnType<typeof getAdminFinance>>;
export default function FinanceDashboard({ initial }: { initial: Rows }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(input: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/comu/admin/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error();
      setMessage(result.result?.status === "FAILED" ? "La transferencia sigue pendiente. Los fondos se conservan para un reintento o revisión." : "Operación registrada.");
      const refreshed = await fetch("/api/comu/admin/finance", { cache: "no-store" });
      const data = await refreshed.json();
      if (refreshed.ok && data.ok) setRows(data.sellers);
    } catch { setMessage("No se pudo completar la operación. Revisa su elegibilidad y actualiza antes de reintentar."); }
    finally { setBusy(false); }
  }
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n / 100);
  const labels: Record<string, string> = { sales: "Ventas", held: "Retenido", available: "Disponible", frozen: "Bloqueado", pendingTransfer: "Liquidación pendiente", transferred: "Transferido", reversed: "Reversos" };
  const connect: Record<string, string> = { COMPLETE: "Activo", NOT_STARTED: "No iniciado", PENDING: "Pendiente", REVIEW: "En revisión", RESTRICTED: "Restringido" };
  const actionClass = "rounded-full border border-[#d9cfc4] px-4 py-2 text-xs font-bold disabled:opacity-50";
  return <main className="mx-auto max-w-7xl px-5 py-12"><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-800">COMETA Admin · TEST</p><h1 className="mt-3 text-4xl font-black">Fondos por seller</h1><p className="mt-4 text-sm">La entrega simulada y las operaciones financieras son exclusivas del entorno de prueba. Transferencia a Stripe y payout bancario son procesos diferentes.</p>{message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4">{message}</p>}
    <div className="mt-8 space-y-5">{rows.map(({ seller, finance }) => <details key={seller.id} className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><summary className="cursor-pointer font-bold">{seller.public_name} · Connect: {connect[finance.account?.onboarding_status || "NOT_STARTED"]}</summary><div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-7">{Object.entries(finance.totals).map(([key, value]) => <div key={key}><p className="text-xs text-[#72675e]">{labels[key]}</p><p className="mt-2 font-bold">{money(value)}</p></div>)}</div><div className="mt-6 flex flex-wrap gap-3"><button disabled={busy} className={actionClass} onClick={() => void act({ action: "release", sellerId: seller.id })}>Liberar garantías elegibles</button><button disabled={busy} className={actionClass} onClick={() => void act({ action: "settle", sellerId: seller.id })}>Crear liquidación diaria</button></div>
      <div className="mt-5 divide-y divide-[#d9cfc4]">{finance.rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 py-4"><span className="mr-auto">Orden #{row.orderNumber} · {money(row.netCents)} · {labels[row.bucket]}</span>{!row.guaranteeExpiresAt && row.bucket === "held" && <button disabled={busy} className={actionClass} onClick={() => void act({ action: "deliver", suborderId: row.suborderId })}>Simular entrega TEST</button>}{["held", "available", "frozen"].includes(row.bucket) && <button disabled={busy} className={actionClass} onClick={() => void act({ action: row.bucket === "frozen" ? "releaseHold" : "hold", allocationId: row.id, reason: "Revisión manual COMETA Admin" })}>{row.bucket === "frozen" ? "Liberar bloqueo" : "Bloquear fondos"}</button>}</div>)}</div>
      <h2 className="mt-5 font-bold">Liquidaciones</h2>{finance.settlements.map((settlement) => <div key={settlement.id} className="mt-3 flex flex-wrap items-center gap-4"><span>{settlement.settlement_day} · {money(Number(settlement.amount_cents))} · {({ PENDING: "Pendiente", PROCESSING: "En proceso", TRANSFERRED: "Transferido", FAILED: "Requiere reintento/revisión", CANCELLED: "Cancelado" } as Record<string, string>)[settlement.status]}</span>{settlement.status !== "TRANSFERRED" && settlement.status !== "CANCELLED" && <button disabled={busy || !settlement.retryable} className={actionClass} onClick={() => void act({ action: "transfer", settlementId: settlement.id })}>Transferir TEST / reintentar</button>}</div>)}
    </details>)}</div>
  </main>;
}
