import { savedCashCloseReceipt } from "@/lib/pos/cash-close-server";
import { assertDeviceResource } from "@/lib/pos/device-server";
import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import {
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
  notes?: unknown;
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

    let query = admin
      .from("pos_cash_sessions")
      .select(
        "*, register:pos_registers(id,name,code), location:pos_locations(id,name,code)"
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
          p_include_expected_cash: canViewOpenExpectedCash(access),
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
        if(summary){Object.assign(summary,{cash_sales:t.cash_sales,card_sales:t.card_sales,transfer_sales:t.transfer_sales,wallet_sales:t.wallet_sales,other_sales:t.other_sales});if(session?.status==='open')summary.expected_cash=canViewOpenExpectedCash(access)?t.expected:null;}
      }
    }

    const sessions = sessionRows.map((session) => {
      const summary = summaryBySessionId.get(session.id) || null;
      const canReceiveExpected =
        session.status === "closed" || canViewOpenExpectedCash(access);

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

    return ok({
      brand,
      sessions,
      blindClose: !canViewOpenExpectedCash(access),
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

      const { data, error } = await admin.rpc(
        retailStaff ? "pos_retail_cash_command_v1" : "pos_cash_command_v2",
        { p_brand_slug: brand.slug, p_host_user_id: user.userId, p_session_id: staffSession.id, p_action: "open", p_payload: { registerId, openingAmount }, p_key: uuidValue(body.requestKey, "requestKey") }
      );

      if (error?.code === "23505") {
        return fail(
          "Esta caja ya tiene una sesión abierta.",
          409,
          "POS_REGISTER_ALREADY_OPEN"
        );
      }

      assertDatabaseResult(
        error,
        "No se pudo abrir la caja."
      );

      return ok(
        {
          session: Array.isArray(data) ? data[0] : data,
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
      const countedCash = numberValue(
        body.countedCash,
        "countedCash",
        {
          min: 0,
        }
      );

      const { data, error } = await admin.rpc(
        retailStaff ? "pos_retail_cash_command_v1" : "pos_cash_command_v2",
        { p_brand_slug: brand.slug, p_host_user_id: user.userId, p_session_id: staffSession.id, p_action: "close", p_payload: { sessionId, countedCash, notes: optionalText(body.notes, 1000) }, p_key: uuidValue(body.requestKey, "requestKey") }
      );

      assertDatabaseResult(
        error,
        "No se pudo cerrar la caja."
      );

      const closedSession = Array.isArray(data) ? data[0] : data;
      // The monetary command has already committed. Receipt preparation is a
      // separate failure boundary and must never turn success into a close retry.
      let receiptWarning: string | null = null;
      try { await savedCashCloseReceipt(access, sessionId, true); }
      catch { receiptWarning = "Cierre guardado. No se pudo conservar el desglose del ticket; la impresión mostrará solo los importes originales disponibles."; }
      return ok({ session: closedSession, receiptWarning });
    }

    return fail(
      "La acción debe ser open o close.",
      400,
      "POS_CASH_ACTION_INVALID"
    );
  } catch (error) {
    return handlePosError(error);
  }
}
