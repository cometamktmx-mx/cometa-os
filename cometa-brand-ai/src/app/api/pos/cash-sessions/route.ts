import { blindOpenCash, canSuperviseRetailCash } from "@/lib/pos/cash-visibility";
import { savedCashCloseReceipt } from "@/lib/pos/cash-close-server";
import { assertDeviceResource } from "@/lib/pos/device-server";
import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import {
  PosApiError,
  assertDatabaseResult,
  getBrandSlugFromUrl,
  fail,
  handlePosError,
  numberValue,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosPermission } from "@/lib/pos/rbac";
import { requireStaffSession, getPosMode } from "@/lib/pos/staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CashSessionBody = {
  brandSlug?: unknown;
  requestKey?: unknown;
  action?: unknown;
  registerId?: unknown;
  sessionId?: unknown;
  openingAmount?: unknown;
  countedCash?: unknown;
  countId?: unknown;
  notes?: unknown;
  reservedCash?: unknown;
  reserveSessionId?: unknown;
  receivedCash?: unknown;
  receiptReason?: unknown;
  additionalCash?: unknown;
  additionalReason?: unknown;
};

type CashSessionSummaryRow = {
  cash_session_id: string;
  sales_total: number | string;
  tickets_count: number | string;
  cash_sales: number | string;
  card_sales: number | string;
  transfer_sales: number | string;
  wallet_sales: number | string;
  other_sales: number | string;
  cash_income: number | string;
  cash_deposits: number | string;
  cash_expenses: number | string;
  cash_withdrawals: number | string;
  net_cash_movements: number | string;
  expected_cash: number | string | null;
  recent_movements: unknown;
};

function moneyInput(value: unknown) {
  return typeof value === "number" || typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value.trim());
}

function requireCashPermission(
  access: Awaited<ReturnType<typeof requirePosOperationalAccess>>,
  permission: "pos.cash.read" | "pos.cash.operate"
) {
  if (!access.user.isAdmin) {
    requirePosPermission(access, permission);
  }
}

function canViewOpenExpectedCash(
  access: Awaited<ReturnType<typeof requirePosOperationalAccess>>
) {
  return access.user.isAdmin || ["owner", "admin", "manager"].includes(
    access.membership?.effectiveRole || ""
  );
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const access = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.cash" });
    requireCashPermission(access, "pos.cash.read");
    const { admin, brand } = access;

    const retail = await getPosMode(access) === "RETAIL";
    const foodSession = await requireStaffSession(access, "CASH_OPERATE");
    const url = new URL(request.url);
    const registerId = url.searchParams.get("registerId");
    const status = url.searchParams.get("status");
    const maySupervise = retail ? canSuperviseRetailCash(foodSession) : canViewOpenExpectedCash(access);
    const reveal = retail ? maySupervise && url.searchParams.get("supervision") === "1" : maySupervise;

    let query = admin
      .from("pos_cash_sessions")
      .select(
        "*, register:pos_registers(id,name,code), location:pos_locations(id,name,code,timezone)"
      )
      .eq("brand_slug", brand.slug)
      .order("opened_at", { ascending: false })
      .limit(100);

    if (foodSession?.staff.locationId) query = query.eq("location_id", foodSession.staff.locationId);
    if(access.device)query=query.eq("location_id",access.device.locationId);
    if (registerId) {
      query = query.eq("register_id", registerId);
    }

    if (status === "open" || status === "closed") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    assertDatabaseResult(
      error,
      "No se pudieron cargar las sesiones de caja."
    );

    const sessionRows = data || [];
    const staffIds = [...new Set(sessionRows.flatMap(row => [row.opening_staff_id, row.closed_by_staff_id].filter((id): id is string => typeof id === "string")))];
    const names = new Map<string, string>();
    if (staffIds.length) {
      const result = await admin.from("pos_staff").select("id,name").eq("brand_slug", brand.slug).in("id", staffIds);
      assertDatabaseResult(result.error, "No se pudieron cargar los operadores.");
      for (const row of result.data || []) names.set(row.id, row.name);
    }
    let summaries: CashSessionSummaryRow[] = [];

    if (sessionRows.length > 0) {
      const { data: summaryData, error: summaryError } = await admin.rpc(
        "pos_get_cash_session_summaries_v1",
        {
          p_brand_slug: brand.slug,
          p_session_ids: sessionRows.map((session) => session.id),
          p_include_expected_cash: reveal,
        }
      );

      assertDatabaseResult(
        summaryError,
        "No se pudo cargar el resumen de las sesiones de caja."
      );

      summaries = Array.isArray(summaryData)
        ? (summaryData as CashSessionSummaryRow[])
        : [];
    }

    const summaryBySessionId = new Map(
      summaries.map((summary) => [summary.cash_session_id, summary])
    );
    const depositsBySession=new Map<string,{cash:number;card:number;transfer:number}>();
    if(sessionRows.length>0 && retail){
      const totals=await admin.rpc('pos_retail_cash_totals_v1',{p_brand:brand.slug,p_sessions:sessionRows.map(row=>row.id)});
      assertDatabaseResult(totals.error,'No se pudo conciliar el dinero del turno.');
      type Total={id:string;expected:number;cash_sales:number;card_sales:number;transfer_sales:number;wallet_sales:number;other_sales:number;order_cash:number;order_card:number;order_transfer:number};
      for(const t of (totals.data||[]) as Total[]){
        depositsBySession.set(t.id,{cash:t.order_cash,card:t.order_card,transfer:t.order_transfer});
        const summary=summaryBySessionId.get(t.id),session=sessionRows.find(s=>s.id===t.id);
        if(summary){Object.assign(summary,{cash_sales:t.cash_sales,card_sales:t.card_sales,transfer_sales:t.transfer_sales,wallet_sales:t.wallet_sales,other_sales:t.other_sales});if(session?.status==='open')summary.expected_cash=reveal?t.expected:null;}
      }
    }

    // New closed-turn breakdowns come from the original transactional document.
    const closedIds = sessionRows.filter(s => s.status === "closed").map(s => s.id);
    if (retail && closedIds.length) {
      const documents = await admin.from("pos_retail_cash_documents").select("session_id,document").eq("brand_slug", brand.slug).in("session_id", closedIds);
      assertDatabaseResult(documents.error, "No se pudieron leer los documentos originales de cierre.");
      for (const { session_id, document } of documents.data || []) {
        if (document?.version !== 2 || !document.summary) continue;
        summaryBySessionId.set(session_id, { ...document.summary, cash_session_id: session_id, expected_cash: document.expected });
        depositsBySession.set(session_id, { cash: document.summary.order_cash, card: document.summary.order_card, transfer: document.summary.order_transfer });
      }
    }

    const sessions = sessionRows.map((session) => {
      const summary = summaryBySessionId.get(session.id) || null;
      const canReceiveExpected =
        session.status === "closed" || reveal;

      return {
        ...session,
        openingStaffName: names.get(session.opening_staff_id) || null,
        closingStaffName: names.get(session.closed_by_staff_id) || null,
        expected_cash: canReceiveExpected
          ? summary?.expected_cash ?? null
          : null,
        summary,
        retailDeposits:depositsBySession.get(session.id)||null,
      };
    });

    let reserves = admin.from("pos_retail_cash_reserves").select("*").eq("brand_slug", brand.slug);
    if (foodSession.locationId) reserves = reserves.eq("location_id", foodSession.locationId);
    if (access.device) reserves = reserves.eq("location_id", access.device.locationId);
    if (registerId) reserves = reserves.eq("register_id", registerId);
    const reserveRows = retail ? await reserves : { data: [], error: null };
    assertDatabaseResult(reserveRows.error, "No se pudieron consultar los fondos pendientes.");
    return ok({
      brand,
      sessions: sessions.map(s => {
        const row = { ...s, reserveReceipt: (reserveRows.data || []).find(r => r.source_session_id === s.id) || null };
        return retail && !reveal ? blindOpenCash(row) : row;
      }),
      reserves: reserveRows.data || [],
      canSupervise: maySupervise,
      blindClose: !reveal,
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CashSessionBody>(request);
    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );
    const action = requiredText(body.action, "action", 20);
    const access = await requirePosMutationAccess({ brandSlug: brandSlug, operation: "cash.operate" });
    requireCashPermission(access, "pos.cash.operate");
    const { admin, brand, user } = access;
    const retailStaff = (await getPosMode(access)) === "RETAIL" ? await requireStaffSession(access,"CASH_OPERATE") : null;
    const staffSession = retailStaff || await requireStaffSession(access, "CASH_OPERATE");

    if (action === "start-count") {
      if (!retailStaff) return fail("El control de conteo corresponde a Caja Retail.", 400, "POS_CASH_ACTION_INVALID");
      const sessionId = uuidValue(body.sessionId, "sessionId") as string;
      await assertDeviceResource(access, "pos_cash_sessions", sessionId);
      const contract = await admin.rpc("pos_retail_cash_contract_v2");
      if (contract.error || contract.data !== 3) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "Caja pendiente de actualización de esquema. No se inició el conteo.");
      const result = await admin.rpc("pos_retail_cash_count_start_v3", {
        p_brand_slug: brand.slug, p_host_user_id: user.userId, p_staff_session_id: staffSession.id,
        p_cash_session_id: sessionId, p_key: uuidValue(body.requestKey, "requestKey"),
      });
      if (result.error?.message?.includes("POS_IDEMPOTENCY_CONFLICT")) return fail("Cambió el contexto del conteo o del PIN. Inicia un conteo nuevo.", 409, "POS_CASH_COUNT_REQUIRED");
      assertDatabaseResult(result.error, "No se pudo iniciar el conteo; revisa que el turno siga abierto.");
      return ok({ count: { countId: result.data.countId, cashSessionId: result.data.cashSessionId, startedAt: result.data.startedAt } });
    }

    if (action === "open") {
      const registerId = uuidValue(
        body.registerId,
        "registerId"
      ) as string;
      await assertDeviceResource(access, "pos_registers", registerId);
      const openingAmount = numberValue(
        body.openingAmount,
        "openingAmount",
        {
          min: 0,
          defaultValue: 0,
        }
      );

      if (retailStaff && (!moneyInput(body.additionalCash) || body.receivedCash != null && !moneyInput(body.receivedCash))) {
        return fail("Confirma recibido y aporte adicional con importes numéricos; usa cero si no hay aporte.", 400, "POS_VALIDATION_ERROR");
      }
      const retailPayload = retailStaff ? {
        registerId,
        reserveSessionId: uuidValue(body.reserveSessionId, "reserveSessionId", false),
        receivedCash: body.receivedCash == null ? null : numberValue(body.receivedCash, "receivedCash", { min: 0 }),
        receiptReason: optionalText(body.receiptReason, 1000),
        additionalCash: numberValue(body.additionalCash, "additionalCash", { min: 0 }),
        additionalReason: optionalText(body.additionalReason, 1000),
      } : { registerId, openingAmount };
      if (retailStaff) {
        const contract = await admin.rpc("pos_retail_cash_contract_v2");
        if (contract.error || contract.data !== 3) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "Caja pendiente de actualización de esquema. No se registró la operación.");
      }
      const { data, error } = await admin.rpc(
        retailStaff ? "pos_retail_cash_command_v1" : "pos_cash_command_v2",
        { p_brand_slug: brand.slug, p_host_user_id: user.userId, p_session_id: staffSession.id, p_action: "open", p_payload: retailPayload, p_key: uuidValue(body.requestKey, "requestKey") }
      );

      if (error?.code === "23505" || error?.message?.includes("POS_REGISTER_ALREADY_OPEN")) {
        return fail(
          "Esta caja ya tiene una sesión abierta.",
          409,
          "POS_REGISTER_ALREADY_OPEN"
        );
      }

      if (error?.message?.includes("POS_CASH_")) return fail("El fondo pendiente cambió o falta confirmar recibido, motivo de discrepancia o aporte. Actualiza la pantalla y revisa los importes.", 409, "POS_WEB_CONFLICT");
      assertDatabaseResult(error, "No se pudo abrir la caja.");

      return ok(
        {
          session: retailStaff ? blindOpenCash(Array.isArray(data) ? data[0] : data) : Array.isArray(data) ? data[0] : data,
        },
        201
      );
    }

    if (action === "close") {
      const sessionId = uuidValue(
        body.sessionId,
        "sessionId"
      ) as string;
      await assertDeviceResource(access, "pos_cash_sessions", sessionId);
      if (retailStaff && (!moneyInput(body.countedCash) || !moneyInput(body.reservedCash))) {
        return fail("El contado total y el fondo reservado son obligatorios; admite cero explícito.", 400, "POS_VALIDATION_ERROR");
      }
      const countedCash = numberValue(
        body.countedCash,
        "countedCash",
        {
          min: 0,
        }
      );

      if (retailStaff && !body.countId) return fail("Inicia un nuevo conteo antes de confirmar el cierre.", 400, "POS_CASH_COUNT_REQUIRED");
      const countId = retailStaff ? uuidValue(body.countId, "countId") : null;
      const reservedCash = retailStaff ? numberValue(body.reservedCash, "reservedCash", { min: 0, max: countedCash }) : null;
      if (retailStaff) {
        const contract = await admin.rpc("pos_retail_cash_contract_v2");
        if (contract.error || contract.data !== 3) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "Caja pendiente de actualización de esquema. No se registró la operación.");
      }
      const { data, error } = await admin.rpc(
        retailStaff ? "pos_retail_cash_command_v1" : "pos_cash_command_v2",
        { p_brand_slug: brand.slug, p_host_user_id: user.userId, p_session_id: staffSession.id, p_action: "close", p_payload: { sessionId, countedCash, ...(retailStaff ? { reservedCash, countId } : {}), notes: optionalText(body.notes, 1000) }, p_key: uuidValue(body.requestKey, "requestKey") }
      );

      if (error?.message?.includes("POS_CASH_CHANGED_RECOUNT_REQUIRED")) return fail("La caja cambió durante el conteo. Inicia un nuevo conteo y vuelve a contar TODO el efectivo antes de confirmar.", 409, "POS_CASH_CHANGED_RECOUNT_REQUIRED");
      if (error?.message?.includes("POS_CASH_COUNT_REQUIRED")) return fail("El conteo no corresponde a este turno o PIN. Inicia un nuevo conteo.", 409, "POS_CASH_COUNT_REQUIRED");
      if (error?.message?.includes("POS_CASH_ALLOCATION_INVALID")) return fail("Indica el contado total y el fondo reservado, entre cero y lo contado, con dos decimales.", 400, "POS_VALIDATION_ERROR");
      assertDatabaseResult(error, "No se pudo cerrar la caja.");

      const closedSession = Array.isArray(data) ? data[0] : data;
      // The monetary command has already committed. Receipt preparation is a
      // separate failure boundary and must never turn success into a close retry.
      let receiptWarning: string | null = null;
      try { await savedCashCloseReceipt(access, sessionId, true); }
      catch { receiptWarning = retailStaff ? "Cierre y documento original guardados. No se pudo consultar el ticket; reintenta reimprimir sin volver a cerrar." : "Cierre guardado. No se pudo conservar el desglose del ticket; la impresión mostrará solo los importes originales disponibles."; }
      return ok({ session: closedSession, receiptWarning });
    }

    return fail(
      "La acción debe ser open, start-count o close.",
      400,
      "POS_CASH_ACTION_INVALID"
    );
  } catch (error) {
    return handlePosError(error);
  }
}
