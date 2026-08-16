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

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.cash" });

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

    return ok({
      brand,
      sessions: data || [],
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
    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.cash" });

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
