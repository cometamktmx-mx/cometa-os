import { PosApiError, assertDatabaseResult, type PosRequestContext } from "./server";
import { getPosMode, requireStaffSession, requireRetailPermission } from "./staff-server";
import { requirePosOperationalAccess } from "./access";
import { requirePosPermission } from "./rbac";
import { assertDeviceResource } from "./device-server";
import { transferVerificationTotals, type CashCloseReceipt } from "./cash-close-receipt";

export async function requireCashPrintAccess(context: PosRequestContext, sessionId: string, copy: boolean) {
  const access = await requirePosOperationalAccess({ brandSlug: context.brand.slug, entitlement: "pos.cash" });
  if (!access.user.isAdmin) requirePosPermission(access, "pos.cash.read");
  const operator = await requireStaffSession(access, "CASH_OPERATE");
  if (!operator) throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "Selecciona un operador de caja.");
  if (copy) await requireRetailPermission(access, "REPRINT");
  await assertDeviceResource(access, "pos_cash_sessions", sessionId);
  const result = await access.admin.from("pos_cash_sessions").select("*").eq("brand_slug", access.brand.slug).eq("id", sessionId).single();
  assertDatabaseResult(result.error, "No se pudo consultar el cierre.");
  const session = result.data;
  if (!session || session.status !== "closed") throw new PosApiError(409, "POS_WEB_CONFLICT", "El turno no está cerrado.");
  if (operator.locationId && operator.locationId !== session.location_id) throw new PosApiError(403, "POS_STAFF_LOCATION_FORBIDDEN", "Cierre de otra sucursal.");
  // Initial copies can only be requested by the closing operator. Historical
  // access uses the explicit reprint permission (CASH_OPERATE for FOOD).
  if (!copy && Date.now() - Date.parse(session.closed_at) > 300000) throw new PosApiError(409, "POS_WEB_CONFLICT", "Para cierres anteriores usa Reimprimir cierre.");
  if (!copy && session.closed_by_staff_id !== operator.staff.id) throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "Usa Reimprimir cierre con los permisos correspondientes.");
  return { access, operator, session };
}

export async function savedCashCloseReceipt(context: PosRequestContext, sessionId: string, capture = false): Promise<CashCloseReceipt> {
  const { admin, brand } = context;
  const closed = await admin.from("pos_cash_sessions").select("*,register:pos_registers(name),location:pos_locations(name,currency,timezone)").eq("brand_slug", brand.slug).eq("id", sessionId).single();
  assertDatabaseResult(closed.error, "No se pudo leer el cierre guardado.");
  const s = closed.data;
  if (!s || s.status !== "closed" || !s.closed_at || s.expected_cash === null || s.counted_cash === null || s.difference === null) throw new PosApiError(409, "POS_WEB_CONFLICT", "El cierre está incompleto.");
  const event = await admin.from("pos_staff_audit_events").select("id,metadata").eq("brand_slug", brand.slug).eq("cash_session_id", sessionId).eq("action", "CASH_SESSION_CLOSE").order("created_at").limit(1).maybeSingle();
  assertDatabaseResult(event.error, "No se pudo leer el comprobante del cierre.");
  if (event.data?.metadata?.cashCloseReceipt?.version === 1) return event.data.metadata.cashCloseReceipt as CashCloseReceipt;
  const staffIds = [s.opening_staff_id, s.closed_by_staff_id].filter(Boolean);
  const names = await admin.from("pos_staff").select("id,name").eq("brand_slug", brand.slug).in("id", staffIds);
  assertDatabaseResult(names.error, "No se pudieron leer los operadores del cierre.");
  const name = (id: string) => names.data?.find(row => row.id === id)?.name || "No registrado";
  const branding = await admin.from("pos_branding").select("display_name").eq("brand_slug", brand.slug).maybeSingle();
  assertDatabaseResult(branding.error, "No se pudo consultar la marca del cierre.");
  const receipt: CashCloseReceipt = { version: 1, sessionId, brand: branding.data?.display_name || brand.name, location: s.location?.name || "No registrada", register: s.register?.name || "No registrada", operator: name(s.closed_by_staff_id), openingOperator: name(s.opening_staff_id), openedAt: s.opened_at, closedAt: s.closed_at, currency: s.location?.currency || "MXN", timezone: s.location?.timezone || "America/Mexico_City", opening: Number(s.opening_amount), expected: Number(s.expected_cash), counted: Number(s.counted_cash), difference: Number(s.difference), summary: null, transfers: null };
  // Older cuts lack an original breakdown. Do not invent one from live totals.
  if (!capture) return receipt;
  if (!event.data) throw new PosApiError(409, "POS_WEB_CONFLICT", "Falta la evidencia del cierre.");
  const summary = await admin.rpc("pos_get_cash_session_summaries_v1", { p_brand_slug: brand.slug, p_session_ids: [sessionId], p_include_expected_cash: true });
  assertDatabaseResult(summary.error, "Cierre guardado; no se pudo conservar el desglose del ticket.");
  const row = Array.isArray(summary.data) ? summary.data[0] : null;
  if (!row) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "Cierre guardado; falta el resumen.");
  const keys = ["cash_sales", "card_sales", "transfer_sales", "wallet_sales", "other_sales", "cash_income", "cash_deposits", "cash_expenses", "cash_withdrawals"];
  receipt.summary = Object.fromEntries(keys.map(key => [key, Number(row[key])]));
  if (await getPosMode(context) === "RETAIL") {
    const totals = await admin.rpc("pos_retail_cash_totals_v1", { p_brand: brand.slug, p_sessions: [sessionId] });
    assertDatabaseResult(totals.error, "No se pudo conservar la conciliación del cierre.");
    const total = Array.isArray(totals.data) ? totals.data[0] : null;
    if (!total) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "Falta la conciliación del cierre.");
    if (Math.round(Number(total.expected) * 100) !== Math.round(receipt.expected * 100)) throw new PosApiError(409, "POS_WEB_CONFLICT", "El cierre está guardado; el desglose ya no coincide con la conciliación original.");
    for (const key of ["order_cash", "order_card", "order_transfer"]) receipt.summary[key] = Number(total[key]);
    for (const key of keys.slice(0, 5)) receipt.summary[key] = Number(total[key]);
    const payments = await admin.from("pos_retail_money_v1").select("source,id,amount").eq("brand_slug", brand.slug).eq("cash_session_id", sessionId).eq("method", "transfer").lte("effective_at", s.closed_at);
    assertDatabaseResult(payments.error, "No se pudieron consultar las transferencias.");
    const verifications = payments.data?.length ? await admin.from("pos_retail_verifications").select("source,payment_id,verified,created_at").eq("brand_slug", brand.slug).in("payment_id", payments.data.map(p => p.id)).lte("created_at", s.closed_at) : { data: [], error: null };
    assertDatabaseResult(verifications.error, "No se pudo conservar la verificación de pagos.");
    receipt.transfers = transferVerificationTotals(payments.data || [], verifications.data || [], s.closed_at);
  }
  if (!Object.values(receipt.summary).every(Number.isFinite)) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "Desglose de cierre inválido.");
  // Compare-and-set: concurrent idempotent close responses must keep the first
  // persisted document. Preserve the command payload/result used by the RPC.
  const metadata = event.data.metadata || {};
  const saved = await admin.from("pos_staff_audit_events").update({ metadata: { ...metadata, cashCloseReceipt: receipt } }).eq("id", event.data.id).eq("brand_slug", brand.slug).eq("metadata", JSON.stringify(metadata)).select("id").maybeSingle();
  assertDatabaseResult(saved.error, "Cierre guardado; no se pudo conservar el ticket.");
  if (!saved.data) return savedCashCloseReceipt(context, sessionId);
  return receipt;
}
