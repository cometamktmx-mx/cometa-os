import { thermalReceipt } from "./thermal";

export type CashCloseReceipt = {
  version: 1; sessionId: string; brand: string; location: string; register: string;
  operator: string; openingOperator: string; openedAt: string; closedAt: string;
  currency: string; timezone: string; opening: number; expected: number; counted: number;
  difference: number; summary: Record<string, number> | null;
  transfers: { verified: number; pending: number } | null;
};

export function cashCloseReceiptHtml(receipt: CashCloseReceipt, copy: boolean) {
  const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: receipt.currency }).format(value);
  const date = (value: string) => new Date(value).toLocaleString("es-MX", { timeZone: receipt.timezone });
  const s = receipt.summary;
  // Reuse the established 80 mm / 70 mm printable area and escaping. Never
  // derive expected cash or difference from today's transactions on reprint.
  return thermalReceipt({ sale_number: receipt.sessionId, sold_at: receipt.closedAt,
    subtotal: 0, discount_total: 0, tax_total: 0, total: receipt.counted,
    currency: receipt.currency, items: [], payments: [] }, receipt.brand, receipt.operator, 80,
  { copy, documentOnly: true, documentLabel: "CIERRE DE CAJA", footer: [
    `Sucursal: ${receipt.location}`, `Caja: ${receipt.register}`,
    `Abrió: ${receipt.openingOperator}`, `Apertura: ${date(receipt.openedAt)}`,
    `Cierre: ${date(receipt.closedAt)} (${receipt.timezone})`,
    `Fondo inicial: ${money(receipt.opening)}`,
    ...(s ? ["VENTAS / COBROS POR MÉTODO",
      ...[["Efectivo", "cash_sales"], ["Tarjeta", "card_sales"], ["Transferencia", "transfer_sales"], ["Monedero", "wallet_sales"], ["Otros", "other_sales"]].map(([label, key]) => `${label}: ${money(s[key])}`),
      `Entradas: ${money(s.cash_income)}`, `Depósitos: ${money(s.cash_deposits)}`,
      `Gastos: ${money(s.cash_expenses)}`, `Retiros: ${money(s.cash_withdrawals)}`,
      ...(s.order_cash !== undefined ? [`Abonos efectivo: ${money(s.order_cash)}`, `Abonos tarjeta: ${money(s.order_card)}`, `Abonos transferencia: ${money(s.order_transfer)}`] : []),
      "Abonos en efectivo incluidos en depósitos; no sumar dos veces."] : ["Desglose original no conservado. No se recalcularon operaciones."]),
    ...(receipt.transfers ? [`Transferencias verificadas: ${money(receipt.transfers.verified)}`, `Transferencias pendientes: ${money(receipt.transfers.pending)}`, "Verificación al cierre. Pendientes conservan su tratamiento actual en conciliación."] : ["Verificación de transferencias: no conservada / no aplica."]),
    `Efectivo esperado: ${money(receipt.expected)}`, `Efectivo contado: ${money(receipt.counted)}`,
    `Diferencia: ${money(receipt.difference)}`, "Documento del cierre guardado. Sin movimientos nuevos.",
  ] });
}

export function transferVerificationTotals(
  payments: { source: string; id: string; amount: number | string }[],
  verifications: { source: string; payment_id: string; verified: boolean; created_at: string }[],
  closedAt: string,
) {
  const latest = new Map<string, (typeof verifications)[number]>();
  for (const v of verifications) {
    if (Date.parse(v.created_at) > Date.parse(closedAt)) continue;
    const key = `${v.source}:${v.payment_id}`, prior = latest.get(key);
    if (!prior || Date.parse(v.created_at) > Date.parse(prior.created_at) || (Date.parse(v.created_at) === Date.parse(prior.created_at) && v.created_at > prior.created_at)) latest.set(key, v);
  }
  let verified = 0, pending = 0;
  for (const p of payments) {
    const cents = Math.round(Number(p.amount) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error("Importe no válido en el cierre.");
    if (latest.get(`${p.source}:${p.id}`)?.verified) verified += cents;
    else pending += cents;
  }
  return { verified: verified / 100, pending: pending / 100 };
}
