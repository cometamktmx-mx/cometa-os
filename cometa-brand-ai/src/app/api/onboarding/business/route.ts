import {
  getAdminClient,
  handlePosError,
  ok,
  PosApiError,
  readJsonBody,
  requiredText,
} from "@/lib/pos/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BusinessCreationBody = {
  brandName?: unknown;
  profileCode?: unknown;
  idempotencyKey?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const auth = await createServerAuthClient();
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      throw new PosApiError(
        401,
        "POS_UNAUTHORIZED",
        "Confirma tu correo e inicia sesión para crear tu negocio."
      );
    }

    const body = await readJsonBody<BusinessCreationBody>(request);
    const brandName = requiredText(body.brandName, "brandName", 120);
    const profileCode = String(body.profileCode ?? "").trim().toLowerCase();
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();

    if (!new Set(["fashion", "retail"]).has(profileCode)) {
      throw new PosApiError(
        400,
        "POS_SELF_SERVICE_PROFILE_INVALID",
        "Selecciona Moda / Ropa o Tienda / Retail."
      );
    }

    if (!idempotencyKey) {
      throw new PosApiError(
        400,
        "POS_SELF_SERVICE_IDEMPOTENCY_KEY_REQUIRED",
        "No se pudo identificar esta creación. Recarga la página e intenta de nuevo."
      );
    }

    if (!UUID_PATTERN.test(idempotencyKey)) {
      throw new PosApiError(
        400,
        "POS_SELF_SERVICE_IDEMPOTENCY_KEY_INVALID",
        "La identidad de creación no es válida. Recarga la página e intenta de nuevo."
      );
    }

    const admin = getAdminClient();
    const [membershipResult, replayResult] = await Promise.all([
      admin
        .from("user_brand_access")
        .select("brand_slug")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1),
      admin
        .from("brands")
        .select("id")
        .eq("created_by", user.id)
        .eq("creation_idempotency_key", idempotencyKey)
        .maybeSingle(),
    ]);

    if (membershipResult.error || replayResult.error) {
      throw new PosApiError(
        500,
        "POS_DATABASE_ERROR",
        "No se pudo validar el estado de creación del negocio."
      );
    }

    if ((membershipResult.data || []).length > 0 && !replayResult.data) {
      throw new PosApiError(
        409,
        "POS_SELF_SERVICE_FIRST_BRAND_ONLY",
        "Tu cuenta ya tiene un negocio. En esta etapa puedes crear nuevas empresas desde el flujo administrado."
      );
    }

    const { data, error } = await admin.rpc(
      "pos_create_self_service_business_v1",
      {
        p_brand_name: brandName,
        p_profile_code: profileCode,
        p_user_id: user.id,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (error) {
      const errorText = `${error.message || ""} ${error.details || ""}`;

      if (errorText.includes("POS_SELF_SERVICE_IDEMPOTENCY_CONFLICT")) {
        throw new PosApiError(
          409,
          "POS_SELF_SERVICE_IDEMPOTENCY_CONFLICT",
          "Esta creación ya fue utilizada con datos distintos. Inicia una creación nueva."
        );
      }

      if (errorText.includes("POS_SELF_SERVICE_PROFILE")) {
        throw new PosApiError(
          400,
          "POS_SELF_SERVICE_PROFILE_INVALID",
          "El giro seleccionado no está disponible."
        );
      }

      throw new PosApiError(
        500,
        "POS_SELF_SERVICE_CREATION_FAILED",
        "No se pudo crear tu negocio. Puedes intentar nuevamente con la misma operación."
      );
    }

    const result = data as {
      brand?: { id?: string; slug?: string; name?: string };
      profileCode?: string;
      trial?: unknown;
      location?: unknown;
      register?: unknown;
      idempotentReplay?: boolean;
    } | null;
    const brandSlug = String(result?.brand?.slug || "");

    if (!brandSlug) {
      throw new PosApiError(
        500,
        "POS_SELF_SERVICE_INVALID_RESULT",
        "El negocio fue creado, pero no se recibió un destino válido."
      );
    }

    return ok({
      ...result,
      destination: `/brand/${brandSlug}/pos`,
    }, result?.idempotentReplay ? 200 : 201);
  } catch (error) {
    return handlePosError(error);
  }
}
