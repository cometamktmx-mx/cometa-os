import type { SupabaseClient } from "@supabase/supabase-js";

export type BusinessDocumentProfile = {
  logoUrl: string | null;
  commercialName: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  socials: { instagram: string | null; facebook: string | null; tiktok: string | null };
  brandColor: string;
  receiptMessage: string | null;
  returnPolicy: string | null;
  documentFooter: string | null;
  location: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    timezone: string;
    currency: string;
  } | null;
};

type ProfileOptions = { locationId?: string | null };

export async function getBusinessDocumentProfile(
  admin: SupabaseClient,
  brandSlug: string,
  options: ProfileOptions = {}
): Promise<BusinessDocumentProfile> {
  const [brandResult, brandingResult, locationResult] = await Promise.all([
    admin.from("brands").select("name").eq("slug", brandSlug).maybeSingle(),
    admin.from("pos_branding").select("*").eq("brand_slug", brandSlug).maybeSingle(),
    options.locationId
      ? admin.from("pos_locations").select("id,name,phone,email,address_line1,address_line2,city,state,postal_code,timezone,currency").eq("brand_slug", brandSlug).eq("id", options.locationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (brandResult.error) throw brandResult.error;
  if (brandingResult.error) throw brandingResult.error;
  if (locationResult.error) throw locationResult.error;

  const branding = brandingResult.data || {};
  const canonicalName = text(brandResult.data?.name) || "Tu negocio";
  const location = locationResult.data;

  return {
    logoUrl: textOrNull(branding.logo_url),
    commercialName: text(branding.display_name) || canonicalName,
    legalName: textOrNull(branding.legal_name),
    taxId: textOrNull(branding.tax_id),
    phone: textOrNull(branding.phone),
    whatsapp: textOrNull(branding.whatsapp),
    email: textOrNull(branding.email),
    website: textOrNull(branding.website),
    socials: {
      instagram: textOrNull(branding.instagram),
      facebook: textOrNull(branding.facebook),
      tiktok: textOrNull(branding.tiktok),
    },
    brandColor: /^#[0-9A-F]{6}$/i.test(text(branding.primary_color)) ? text(branding.primary_color).toUpperCase() : "#67E8F9",
    receiptMessage: textOrNull(branding.receipt_message),
    returnPolicy: textOrNull(branding.return_policy),
    documentFooter: textOrNull(branding.ticket_footer),
    location: location
      ? {
          id: location.id,
          name: location.name,
          phone: textOrNull(location.phone),
          email: textOrNull(location.email),
          address: [location.address_line1, location.address_line2, location.city, location.state, location.postal_code].map(text).filter(Boolean).join(", ") || null,
          timezone: location.timezone,
          currency: location.currency,
        }
      : null,
  };
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function textOrNull(value: unknown) { const valueText = text(value); return valueText || null; }
