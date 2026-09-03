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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CashSessionBody = {
  brandSlug?: unknown;
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

    const sessions = sessionRows.map((session) => {
      const summary = summaryBySessionId.get(session.id) || null;
      const canReceiveExpected =
        session.status === "closed" || canViewOpenExpectedCash(access);

      return {
        ...session,
        expected_cash: canReceiveExpected
          ? summary?.expected_cash ?? null
          : null,
        summary,
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
    const access = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.cash",
    });
    requireCashPermission(access, "pos.cash.operate");
    const { admin, brand, user } = access;

    if (action === "open") {
      const registerId = uuidValue(
        body.registerId,
        "registerId"
      ) as string;
      const openingAmount = numberValue(
        body.openingAmount,
        "openingAmount",
        {
          min: 0,
          defaultValue: 0,
        }
      );

      const { data, error } = await admin.rpc(
        "pos_open_cash_session",
        {
          p_brand_slug: brand.slug,
          p_register_id: registerId,
          p_opening_amount: openingAmount,
          p_user_id: user.userId,
        }
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
      const countedCash = numberValue(
        body.countedCash,
        "countedCash",
        {
          min: 0,
        }
      );

      const { data, error } = await admin.rpc(
        "pos_close_cash_session",
        {
          p_brand_slug: brand.slug,
          p_session_id: sessionId,
          p_counted_cash: countedCash,
          p_user_id: user.userId,
          p_notes: optionalText(body.notes, 1000),
        }
      );

      assertDatabaseResult(
        error,
        "No se pudo cerrar la caja."
      );

      return ok({
        session: Array.isArray(data) ? data[0] : data,
      });
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
