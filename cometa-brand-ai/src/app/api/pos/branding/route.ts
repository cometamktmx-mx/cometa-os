import {
  assertDatabaseResult,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrandingBody = {
  brandSlug?: unknown;
  displayName?: unknown;
  logoUrl?: unknown;
  coverImageUrl?: unknown;
  primaryColor?: unknown;
  secondaryColor?: unknown;
  accentColor?: unknown;
  textColor?: unknown;
  loyaltyProgramName?: unknown;
  loyaltyMessage?: unknown;
  whatsapp?: unknown;
  website?: unknown;
  ticketFooter?: unknown;
};

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

async function initializePosBranding(
  brandSlug: string
) {
  const context = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.access" });
  const { admin, brand, user } = context;

  const { error } = await admin.rpc(
    "pos_initialize_brand_setup",
    {
      p_brand_id: brand.id,
      p_brand_slug: brand.slug,
      p_brand_name: brand.name,
      p_user_id: user.userId,
    }
  );

  assertDatabaseResult(
    error,
    "No se pudo inicializar la identidad de Cometa POS."
  );

  return context;
}

function normalizeColor(
  value: unknown,
  fieldName: string,
  fallback: string
) {
  const color = String(value ?? fallback)
    .trim()
    .toUpperCase();

  if (!HEX_COLOR_PATTERN.test(color)) {
    throw new Error(
      `${fieldName} debe utilizar el formato hexadecimal #RRGGBB.`
    );
  }

  return color;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number
) {
  const text = optionalText(value, maxLength);
  return text && text.trim() ? text.trim() : null;
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);

    const { admin, brand } =
      await initializePosBranding(brandSlug);

    const { data, error } = await admin
      .from("pos_branding")
      .select("*")
      .eq("brand_slug", brand.slug)
      .single();

    assertDatabaseResult(
      error,
      "No se pudo cargar la identidad visual del negocio."
    );

    return ok({
      brand,
      branding: data,
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<BrandingBody>(request);

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const { admin, brand, user } =
      await initializePosBranding(brandSlug);

    const displayName = requiredText(
      body.displayName,
      "displayName",
      140
    );

    const loyaltyProgramName = requiredText(
      body.loyaltyProgramName,
      "loyaltyProgramName",
      140
    );

    const loyaltyMessage = requiredText(
      body.loyaltyMessage,
      "loyaltyMessage",
      280
    );

    let primaryColor: string;
    let secondaryColor: string;
    let accentColor: string;
    let textColor: string;

    try {
      primaryColor = normalizeColor(
        body.primaryColor,
        "primaryColor",
        "#67E8F9"
      );

      secondaryColor = normalizeColor(
        body.secondaryColor,
        "secondaryColor",
        "#06111F"
      );

      accentColor = normalizeColor(
        body.accentColor,
        "accentColor",
        "#34D399"
      );

      textColor = normalizeColor(
        body.textColor,
        "textColor",
        "#FFFFFF"
      );
    } catch (colorError) {
      return fail(
        colorError instanceof Error
          ? colorError.message
          : "Uno de los colores no es válido.",
        400,
        "POS_BRANDING_COLOR_INVALID"
      );
    }

    const { data, error } = await admin.rpc(
      "pos_save_branding",
      {
        p_brand_id: brand.id,
        p_brand_slug: brand.slug,
        p_display_name: displayName,
        p_logo_url: normalizeOptionalText(
          body.logoUrl,
          1000
        ),
        p_cover_image_url: normalizeOptionalText(
          body.coverImageUrl,
          1000
        ),
        p_primary_color: primaryColor,
        p_secondary_color: secondaryColor,
        p_accent_color: accentColor,
        p_text_color: textColor,
        p_loyalty_program_name:
          loyaltyProgramName,
        p_loyalty_message: loyaltyMessage,
        p_whatsapp: normalizeOptionalText(
          body.whatsapp,
          40
        ),
        p_website: normalizeOptionalText(
          body.website,
          500
        ),
        p_ticket_footer: normalizeOptionalText(
          body.ticketFooter,
          500
        ),
        p_user_id: user.userId,
      }
    );

    assertDatabaseResult(
      error,
      "No se pudo guardar la identidad visual del negocio."
    );

    return ok({
      branding: Array.isArray(data)
        ? data[0]
        : data,
    });
  } catch (error) {
    return handlePosError(error);
  }
}
