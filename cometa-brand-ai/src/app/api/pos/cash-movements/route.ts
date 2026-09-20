import { createHash } from "node:crypto";
import { getPosMode, requireStaffSession } from "@/lib/pos/staff-server";
import {
  assertDatabaseResult,
  fail,
  getBrandSlugFromUrl,
  getPagination,
  handlePosError,
  numberValue,
  PosApiError,
  ok,
  optionalText,
  readJsonBody,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosPermission } from "@/lib/pos/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOVEMENT_TYPES = ["income", "deposit", "expense", "withdrawal"] as const;

type MovementType = (typeof MOVEMENT_TYPES)[number];

type CashMovementBody = {
  cashSessionId?: unknown;
  requestKey?: unknown;
  adjustment?: unknown;
  authorizationToken?: unknown;
  movementType?: unknown;
  amount?: unknown;
  reason?: unknown;
};

type DatabaseRpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null;

function requireCashPermission(
  access: Awaited<ReturnType<typeof requirePosOperationalAccess>>,
  permission: "pos.cash.read" | "pos.cash.operate"
) {
  if (!access.user.isAdmin) {
    requirePosPermission(access, permission);
  }
}

function normalizeMovementType(value: unknown): MovementType | null {
  const type = String(value ?? "").trim().toLowerCase();

  return MOVEMENT_TYPES.includes(type as MovementType)
    ? (type as MovementType)
    : null;
}

function cashMovementRpcFailure(error: DatabaseRpcError) {
  const message = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ");

  const knownErrors: Array<[string, number, string, string]> = [
    [
      "POS_CASH_MOVEMENT_SESSION_CLOSED",
      409,
      "SESSION_CLOSED",
      "La caja ya está cerrada y no acepta movimientos.",
    ],
    [
      "POS_CASH_MOVEMENT_SESSION_NOT_FOUND",
      404,
      "SESSION_NOT_FOUND",
      "La sesión de caja no existe o no pertenece a esta marca.",
    ],
    [
      "POS_CASH_MOVEMENT_SESSION_BRAND_MISMATCH",
      403,
      "FORBIDDEN",
      "No puedes registrar movimientos en una sesión de otra marca.",
    ],
    [
      "POS_CASH_MOVEMENT_TYPE_INVALID",
      400,
      "INVALID_MOVEMENT_TYPE",
      "El tipo de movimiento no es válido.",
    ],
    [
      "POS_CASH_MOVEMENT_AMOUNT_INVALID",
      400,
      "INVALID_AMOUNT",
      "El monto debe ser mayor a cero y tener máximo dos decimales.",
    ],
    [
      "POS_CASH_MOVEMENT_REASON_REQUIRED",
      400,
      "REASON_REQUIRED",
      "Indica el motivo del movimiento.",
    ],
  ];

  const match = knownErrors.find(([databaseCode]) =>
    message.includes(databaseCode)
  );

  return match
    ? fail(match[3], match[1], match[2])
    : null;
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const access = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.cash",
    });
    requireCashPermission(access, "pos.cash.read");
    const { admin, brand } = access;
    const url = new URL(request.url);
    const cashSessionId = uuidValue(
      url.searchParams.get("cashSessionId"),
      "cashSessionId"
    ) as string;
    const pagination = getPagination(request);

    const { data: session, error: sessionError } = await admin
      .from("pos_cash_sessions")
      .select("id,status,location_id")
      .eq("id", cashSessionId)
      .eq("brand_slug", brand.slug)
      .maybeSingle();

    assertDatabaseResult(
      sessionError,
      "No se pudo validar la sesión de caja."
    );

    if (!session) {
      return fail(
        "La sesión de caja no existe o no pertenece a esta marca.",
        404,
        "SESSION_NOT_FOUND"
      );
    }

    if (await getPosMode(access) !== "RETAIL") await requireStaffSession(access, "CASH_OPERATE", session.location_id);
    const { data, error } = await admin
      .from("pos_cash_movements")
      .select("id,cash_session_id,movement_type,amount,reason,created_by,created_at")
      .eq("brand_slug", brand.slug)
      .eq("cash_session_id", cashSessionId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.from, pagination.to);

    assertDatabaseResult(
      error,
      "No se pudieron cargar los movimientos de caja."
    );

    return ok({
      session,
      movements: data || [],
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const body = await readJsonBody<CashMovementBody>(request);
    const access = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.cash",
    });
    requireCashPermission(access, "pos.cash.operate");
    const { admin, brand, user } = access;

    const cashSessionId = uuidValue(
      body.cashSessionId,
      "cashSessionId"
    ) as string;
    const movementType = normalizeMovementType(body.movementType);

    if (!movementType) {
      return fail(
        "El tipo de movimiento no es válido.",
        400,
        "INVALID_MOVEMENT_TYPE"
      );
    }

    const amount = numberValue(body.amount, "amount");
    const cents = Math.round(amount * 100);

    if (
      amount <= 0 ||
      Math.abs(amount * 100 - cents) > Number.EPSILON * 100
    ) {
      return fail(
        "El monto debe ser mayor a cero y tener máximo dos decimales.",
        400,
        "INVALID_AMOUNT"
      );
    }

    const reason = optionalText(body.reason, 500);

    if (!reason) {
      return fail(
        "Indica el motivo del movimiento.",
        400,
        "REASON_REQUIRED"
      );
    }

    const staffSession = await getPosMode(access) === "RETAIL" ? null : await requireStaffSession(access, "CASH_OPERATE");
    const { data, error } = await admin.rpc(staffSession ? "pos_cash_command_v2" : "pos_create_cash_movement", staffSession ? { p_brand_slug: brand.slug, p_host_user_id: user.userId, p_session_id: staffSession.id, p_action: "movement", p_payload: { sessionId: cashSessionId, movementType, amount: cents / 100, reason, adjustment: body.adjustment === true }, p_key: uuidValue(body.requestKey, "requestKey"), p_authorization_hash: typeof body.authorizationToken === "string" ? createHash("sha256").update(body.authorizationToken).digest("hex") : null } : {
      p_brand_slug: brand.slug,
      p_cash_session_id: cashSessionId,
      p_movement_type: movementType,
      p_amount: cents / 100,
      p_reason: reason,
      p_user_id: user.userId,
    });

    if (error?.message?.includes("POS_SUPERVISOR_AUTH_INVALID")) throw new PosApiError(403, "POS_SUPERVISOR_AUTH_INVALID", "La autorización expiró o no corresponde a este ajuste. Solicita una nueva autorización.");
    if (error?.message?.includes("POS_STAFF_PERMISSION_REQUIRED")) throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "El operador no tiene permiso para esta acción.");
    if (error?.message?.includes("POS_FOOD_CONFLICT")) throw new PosApiError(409, "POS_FOOD_CONFLICT", "El reintento no coincide con el movimiento original.");
    const mappedFailure = cashMovementRpcFailure(error);

    if (mappedFailure) {
      return mappedFailure;
    }

    assertDatabaseResult(
      error,
      "No se pudo registrar el movimiento de caja."
    );

    return ok(
      {
        movement: Array.isArray(data) ? data[0] : data,
      },
      201
    );
  } catch (error) {
    return handlePosError(error);
  }
}
