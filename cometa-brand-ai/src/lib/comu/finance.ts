import { PosApiError } from "@/lib/pos/server";
import { requireSellerAccess, requireComuActor } from "./seller-access";
import { getConnectStripeClient } from "./stripe";
import type Stripe from "stripe";

export async function getSellerFinance(sellerId: string) {
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data, error } = await access.admin.from("comu_payment_allocations").select("id,payment_id,order_id,suborder_id,gross_amount_cents,platform_fee_cents,seller_net_amount_cents,status,created_at").eq("seller_id", sellerId).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_FINANCE_LOOKUP_FAILED", "No se pudo cargar el estado financiero.");
  return data || [];
}

export async function requireFinanceSeller() {
  const actor = await requireComuActor();
  const { data, error } = await actor.admin.from("comu_seller_memberships").select("seller_id")
    .eq("user_id", actor.userId).eq("active", true).in("role", ["OWNER", "ADMIN"]).limit(2);
  if (error) throw new PosApiError(500, "COMU_MEMBERSHIP_LOOKUP_FAILED", "No pudimos consultar tus permisos.");
  if (!data || data.length !== 1) throw new PosApiError(403, "COMU_FINANCE_SELLER_REQUIRED", "Necesitas una membresía financiera de seller inequívoca para continuar.");
  const { data: seller, error: sellerError } = await actor.admin.from("comu_sellers").select("id,public_name,brand_slug,country,status").eq("id", data[0].seller_id).single();
  if (sellerError || !seller) throw new PosApiError(404, "COMU_SELLER_NOT_FOUND", "Seller no disponible.");
  return { ...actor, seller };
}

export async function requireFinanceAdmin() {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_ADMIN_REQUIRED", "Acceso restringido.");
  return actor;
}

type Admin = Awaited<ReturnType<typeof requireComuActor>>["admin"];
const fail = () => new PosApiError(500, "COMU_FINANCE_FAILED", "No pudimos completar la operación financiera. Inténtalo nuevamente.");

export function financeError(error: unknown) {
  const status = error instanceof PosApiError ? error.status : 500;
  return Response.json({ ok: false, error: error instanceof PosApiError && status < 500 ? error.message : "No pudimos completar la operación financiera. Inténtalo nuevamente." }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function connectStatus(account: Stripe.Account) {
  const due = account.requirements?.currently_due || [];
  const reviewing = (account.requirements?.pending_verification?.length || 0) > 0;
  const transfers = account.capabilities?.transfers === "active";
  const disabled = account.requirements?.disabled_reason;
  const status = account.details_submitted && transfers && account.payouts_enabled ? "COMPLETE" : reviewing ? "REVIEW" : disabled && disabled !== "requirements.pending_verification" && disabled !== "requirements.past_due" ? "RESTRICTED" : account.requirements?.past_due?.length ? "RESTRICTED" : "PENDING";
  return { onboarding_status: status, details_submitted: Boolean(account.details_submitted), charges_enabled: Boolean(account.charges_enabled), payouts_enabled: Boolean(account.payouts_enabled), transfers_enabled: transfers, requirements_due: due };
}

async function syncAccount(admin: Admin, account: Stripe.Account) {
  const snapshot = connectStatus(account);
  const { error } = await admin.from("comu_seller_payment_accounts").update({ ...snapshot, updated_at: new Date().toISOString() }).eq("stripe_account_id", account.id);
  if (error) throw fail();
  return snapshot;
}

export async function createSellerConnectAccount() {
  const { admin, seller } = await requireFinanceSeller();
  const stripe = getConnectStripeClient();
  const { error: insertError } = await admin.from("comu_seller_payment_accounts").upsert({ seller_id: seller.id }, { onConflict: "seller_id", ignoreDuplicates: true });
  if (insertError) throw fail();
  const { data: saved, error } = await admin.from("comu_seller_payment_accounts").select("stripe_account_id,account_request_key,account_request_started_at").eq("seller_id", seller.id).single();
  if (error || !saved) throw fail();
  if (saved.stripe_account_id) {
    const account = await stripe.accounts.retrieve(saved.stripe_account_id);
    return syncAccount(admin, account);
  }
  if (saved.account_request_started_at && Date.now() - Date.parse(saved.account_request_started_at) > 23 * 3600000) throw new PosApiError(409, "COMU_CONNECT_RECONCILIATION_REQUIRED", "La configuración necesita revisión antes de crear otra cuenta.");
  const { error: startedError } = await admin.from("comu_seller_payment_accounts").update({ account_request_started_at: new Date().toISOString() }).eq("seller_id", seller.id).is("account_request_started_at", null);
  if (startedError) throw fail();
  const account = await stripe.accounts.create({
    type: "express", country: seller.country || "MX", capabilities: { transfers: { requested: true } },
    business_profile: { product_description: "Ventas de productos en COMU" },
    settings: { payouts: { schedule: { interval: "daily" } } },
    metadata: { comu_seller_id: seller.id, comu_mode: "test" },
  }, { idempotencyKey: `comu-account:${saved.account_request_key}` });
  const { error: saveError } = await admin.from("comu_seller_payment_accounts").update({ stripe_account_id: account.id, ...connectStatus(account), updated_at: new Date().toISOString() }).eq("seller_id", seller.id);
  if (saveError) throw fail();
  return connectStatus(account);
}

export async function getSellerConnectStatus() {
  const { admin, seller } = await requireFinanceSeller();
  const { data, error } = await admin.from("comu_seller_payment_accounts").select("stripe_account_id").eq("seller_id", seller.id).maybeSingle();
  if (error) throw fail();
  if (!data?.stripe_account_id) return { onboarding_status: "NOT_STARTED", details_submitted: false, charges_enabled: false, payouts_enabled: false, transfers_enabled: false, requirements_due: [] };
  return syncAccount(admin, await getConnectStripeClient().accounts.retrieve(data.stripe_account_id));
}

export async function createSellerOnboardingLink() {
  const { admin, seller } = await requireFinanceSeller();
  const { data, error } = await admin.from("comu_seller_payment_accounts").select("stripe_account_id").eq("seller_id", seller.id).maybeSingle();
  if (error) throw fail();
  if (!data?.stripe_account_id) throw new PosApiError(409, "COMU_CONNECT_ACCOUNT_REQUIRED", "Primero configura tu cuenta de pagos.");
  // Explicit local-only return URLs for this test phase; never derive them from an untrusted Host header.
  if (process.env.NODE_ENV === "production") throw new PosApiError(403, "COMU_CONNECT_LOCAL_ONLY", "Esta configuración está disponible únicamente en el entorno de prueba local.");
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const settingsPath = `/brand/${encodeURIComponent(seller.brand_slug)}/comu/settings`;
  const link = await getConnectStripeClient().accountLinks.create({ account: data.stripe_account_id, type: "account_onboarding", return_url: `${appOrigin}${settingsPath}?connect=return`, refresh_url: `${appOrigin}${settingsPath}?connect=refresh` });
  return { url: link.url, expires_at: link.expires_at };
}

function cents(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new PosApiError(500, "COMU_INTEGER_CENTS_REQUIRED", "El importe necesita revisión.");
  return n;
}

export async function getFinanceSummary(sellerId: string) {
  const { admin } = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const results = await Promise.all([
    admin.from("comu_payment_allocations").select("id,order_id,suborder_id,gross_amount_cents,platform_fee_cents,seller_net_amount_cents,status,comu_orders(order_number),comu_order_suborders(delivered_at,guarantee_expires_at)").eq("seller_id", sellerId),
    admin.from("comu_seller_ledger_entries").select("id,allocation_id,entry_type,amount_cents,currency,created_at,settlement_id").eq("seller_id", sellerId).order("created_at", { ascending: false }),
    admin.from("comu_seller_fund_holds").select("id,allocation_id,status").eq("seller_id", sellerId).eq("status", "ACTIVE"),
    admin.from("comu_seller_settlements").select("id,amount_cents,currency,status,settlement_day,retryable").eq("seller_id", sellerId).order("created_at", { ascending: false }),
    admin.from("comu_seller_payment_accounts").select("onboarding_status,transfers_enabled,payouts_enabled,financial_suspended").eq("seller_id", sellerId).maybeSingle(),
  ]);
  if (results.some((r) => r.error)) throw fail();
  const [allocations, ledger, holds, settlements, account] = results;
  const totals = { sales: 0, held: 0, available: 0, pendingTransfer: 0, transferred: 0, frozen: 0, reversed: 0 };
  const rows = (allocations.data || []).map((allocation) => {
    const entries = (ledger.data || []).filter((entry) => entry.allocation_id === allocation.id);
    const has = (type: string) => entries.some((entry) => entry.entry_type === type);
    const frozen = (holds.data || []).some((hold) => hold.allocation_id === allocation.id);
    const held = entries.filter((entry) => entry.entry_type === "SALE_HELD").reduce((sum, entry) => cents(sum + cents(entry.amount_cents)), 0);
    const reversed = entries.filter((entry) => ["SALE_REVERSED", "REFUND"].includes(entry.entry_type)).reduce((sum, entry) => cents(sum + Math.abs(cents(entry.amount_cents))), 0);
    const net = Math.max(0, held - reversed);
    totals.sales = cents(totals.sales + cents(allocation.gross_amount_cents));
    totals.reversed = cents(totals.reversed + reversed);
    const bucket = has("TRANSFER") ? "transferred" : frozen ? "frozen" : allocation.status === "PENDING_TRANSFER" ? "pendingTransfer" : has("SALE_AVAILABLE") ? "available" : "held";
    totals[bucket] = cents(totals[bucket] + net);
    const order = Array.isArray(allocation.comu_orders) ? allocation.comu_orders[0] : allocation.comu_orders;
    const suborder = Array.isArray(allocation.comu_order_suborders) ? allocation.comu_order_suborders[0] : allocation.comu_order_suborders;
    return { id: allocation.id, suborderId: allocation.suborder_id, orderNumber: order?.order_number, netCents: cents(allocation.seller_net_amount_cents), bucket, guaranteeExpiresAt: suborder?.guarantee_expires_at || null };
  });
  return { totals, rows, ledger: ledger.data || [], settlements: settlements.data || [], account: account.data };
}

export async function getAdminFinance() {
  const { admin } = await requireFinanceAdmin();
  const { data, error } = await admin.from("comu_sellers").select("id,public_name").order("public_name");
  if (error) throw fail();
  return Promise.all((data || []).map(async (seller) => ({ seller, finance: await getFinanceSummary(seller.id) })));
}

async function executeRpc(admin: Admin, name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new PosApiError(409, "COMU_FINANCE_OPERATION_FAILED", "La operación no es elegible o está en proceso. Actualiza el estado antes de reintentar.");
  return data;
}

export async function transferSettlement(admin: Admin, settlementId: string) {
  const stripe = getConnectStripeClient();
  const { data: existing, error } = await admin.from("comu_seller_settlements").select("seller_id,stripe_account_id").eq("id", settlementId).single();
  if (error || !existing) throw fail();
  await syncAccount(admin, await stripe.accounts.retrieve(existing.stripe_account_id));
  const settlement = await executeRpc(admin, "comu_claim_transfer", { p_settlement_id: settlementId });
  if (settlement.status === "TRANSFERRED") return { status: "TRANSFERRED" };
  try {
    const transfer = await stripe.transfers.create({ amount: cents(settlement.amount_cents), currency: settlement.currency.toLowerCase(), destination: settlement.stripe_account_id, transfer_group: `comu-settlement:${settlement.id}`, metadata: { comu_settlement_id: settlement.id, comu_seller_id: settlement.seller_id } }, { idempotencyKey: `comu-transfer:${settlement.idempotency_key}` });
    if (transfer.livemode || transfer.reversed || transfer.amount_reversed) throw new Error("COMU_TRANSFER_REVIEW_REQUIRED");
    await executeRpc(admin, "comu_finish_transfer", { p_settlement_id: settlement.id, p_transfer_id: transfer.id, p_amount_cents: transfer.amount, p_currency: transfer.currency, p_destination: typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id });
    return { status: "TRANSFERRED" };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    const reason = code === "balance_insufficient" ? "PLATFORM_BALANCE_INSUFFICIENT" : "TRANSFER_RETRY_OR_RECONCILIATION_REQUIRED";
    await executeRpc(admin, "comu_fail_transfer", { p_settlement_id: settlement.id, p_reason: reason, p_retryable: true });
    return { status: "FAILED", retryable: true, message: "Los fondos siguen reservados para la liquidación. Puedes reintentar de forma segura; si pasó el plazo de seguridad, se requiere revisión." };
  }
}

export async function runAdminFinanceOperation(input: Record<string, unknown>) {
  const { admin, userId } = await requireFinanceAdmin();
  if (process.env.NODE_ENV === "production") throw new PosApiError(403, "COMU_FINANCE_TEST_ONLY", "Operación disponible solo en pruebas locales.");
  getConnectStripeClient();
  const uuid = (key: string) => { const value = input[key]; if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new PosApiError(400, "COMU_ID_REQUIRED", "Selecciona un registro válido."); return value; };
  switch (input.action) {
    case "deliver": await executeRpc(admin, "comu_admin_deliver_suborder", { p_suborder_id: uuid("suborderId"), p_actor_id: userId }); break;
    case "hold": case "releaseHold": await executeRpc(admin, "comu_set_fund_hold", { p_allocation_id: uuid("allocationId"), p_release: input.action === "releaseHold", p_reason: typeof input.reason === "string" ? input.reason.slice(0,240) : "Revisión administrativa", p_actor_id: userId }); break;
    case "release": await executeRpc(admin, "comu_release_eligible_seller_funds", { p_seller_id: uuid("sellerId") }); break;
    case "settle": await executeRpc(admin, "comu_create_daily_settlements", { p_seller_id: uuid("sellerId") }); break;
    case "transfer": return transferSettlement(admin, uuid("settlementId"));
    default: throw new PosApiError(400, "COMU_ACTION_REQUIRED", "Selecciona una operación válida.");
  }
  return { status: "OK" };
}

export async function processConnectEvent(admin: Admin, event: Stripe.Event) {
  if (event.livemode) throw new Error("COMU_CONNECT_TEST_ONLY");
  const { data: existing, error: readError } = await admin.from("comu_connect_webhook_events").select("status").eq("stripe_event_id", event.id).maybeSingle();
  if (readError) throw fail();
  if (existing?.status === "PROCESSED") return { duplicate: true };
  const { error: insertError } = await admin.from("comu_connect_webhook_events").upsert({ stripe_event_id: event.id, event_type: event.type }, { onConflict: "stripe_event_id", ignoreDuplicates: true });
  if (insertError) throw fail();
  const stripe = getConnectStripeClient();
  if (event.type === "account.updated") {
    const account = await stripe.accounts.retrieve(event.data.object.id);
    await syncAccount(admin, account); // Retrieve current state: replayed/out-of-order payloads cannot regress it.
  } else if (event.type === "transfer.created") {
    const transfer = await stripe.transfers.retrieve(event.data.object.id);
    const settlementId = transfer.metadata.comu_settlement_id;
    if (settlementId && !transfer.livemode && !transfer.reversed && !transfer.amount_reversed) await executeRpc(admin, "comu_finish_transfer", { p_settlement_id: settlementId, p_transfer_id: transfer.id, p_amount_cents: transfer.amount, p_currency: transfer.currency, p_destination: typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id });
  } else if (["transfer.reversed", "payout.paid", "payout.failed"].includes(event.type)) {
    const accountId = event.account;
    if (accountId) {
      const { data: account, error } = await admin.from("comu_seller_payment_accounts").select("seller_id").eq("stripe_account_id", accountId).maybeSingle();
      if (error) throw fail();
      if (account) {
        const { error: auditError } = await admin.from("comu_financial_events").upsert({ seller_id: account.seller_id, event_type: event.type === "payout.paid" ? "BANK_PAYOUT_PAID" : event.type === "payout.failed" ? "BANK_PAYOUT_FAILED" : "TRANSFER_REVERSED_REVIEW", idempotency_key: event.id, payload: {} }, { onConflict: "idempotency_key", ignoreDuplicates: true });
        if (auditError) throw fail();
      }
    }
  }
  const { error } = await admin.from("comu_connect_webhook_events").update({ status: "PROCESSED", processed_at: new Date().toISOString() }).eq("stripe_event_id", event.id);
  if (error) throw fail();
  return { duplicate: false };
}
