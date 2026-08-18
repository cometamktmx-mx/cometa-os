import { getBusinessDocumentProfile } from "@/lib/pos/business-document-profile";
import { getBrandSlugFromUrl, handlePosError, ok, optionalText, readJsonBody, requirePosContext, type PosRequestContext } from "@/lib/pos/server";
import { requirePosPermission } from "@/lib/pos/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-f]{6}$/i;

export async function GET(request: Request) {
  try {
    const context = await requirePosContext(getBrandSlugFromUrl(request));
    return ok({ profile: await getBusinessDocumentProfile(context.admin, context.brand.slug, { locationId: new URL(request.url).searchParams.get("locationId") }) });
  } catch (error) { return handlePosError(error); }
}

export async function PUT(request: Request) {
  try {
    const context = requireSettings(await requirePosContext(getBrandSlugFromUrl(request)));
    const body = await readJsonBody<Record<string, unknown>>(request);
    const payload = {
      display_name: optionalText(body.commercialName, 140),
      legal_name: optionalText(body.legalName, 180),
      tax_id: normalizeUpper(body.taxId, 40),
      phone: optionalText(body.phone, 40),
      whatsapp: optionalText(body.whatsapp, 40),
      email: optionalText(body.email, 180),
      website: optionalText(body.website, 300),
      instagram: optionalText(body.instagram, 300),
      facebook: optionalText(body.facebook, 300),
      tiktok: optionalText(body.tiktok, 300),
      primary_color: normalizeColor(body.brandColor, context),
      receipt_message: optionalText(body.receiptMessage, 240),
      return_policy: optionalText(body.returnPolicy, 1000),
      ticket_footer: optionalText(body.documentFooter, 250),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await context.admin
      .from("pos_branding")
      .upsert(
        {
          brand_id: context.brand.id,
          brand_slug: context.brand.slug,
          ...payload,
        },
        { onConflict: "brand_slug" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return ok({ profile: await getBusinessDocumentProfile(context.admin, context.brand.slug), branding: data });
  } catch (error) { return handlePosError(error); }
}

function requireSettings(context: PosRequestContext): PosRequestContext { requirePosPermission(context, "pos.settings.manage"); return context; }
function normalizeUpper(value: unknown, max: number) { const text = optionalText(value, max); return text ? text.toUpperCase() : null; }
function normalizeColor(value: unknown, context: PosRequestContext) { const color = optionalText(value, 7); if (!color) return undefined; if (!HEX.test(color)) throw new Error("El color debe utilizar el formato #RRGGBB."); return color.toUpperCase(); }
