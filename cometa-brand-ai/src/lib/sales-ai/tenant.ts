import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalBrandContext } from "@/lib/brand-os/server";

export type TenantScopedSalesLead = Record<string, unknown> & {
  id: string;
  brand_name?: string | null;
  brand_slug?: string | null;
};

export async function findSalesLeadForBrand(
  supabase: SupabaseClient,
  leadId: string,
  context: CanonicalBrandContext
): Promise<TenantScopedSalesLead | null> {
  const normalizedLeadId = String(leadId || "").trim();

  if (!normalizedLeadId) {
    return null;
  }

  const bySlug = await supabase
    .from("sales_leads")
    .select("*")
    .eq("id", normalizedLeadId)
    .eq("brand_slug", context.brandSlug)
    .maybeSingle();

  if (bySlug.error) {
    throw bySlug.error;
  }

  if (bySlug.data) {
    return bySlug.data as TenantScopedSalesLead;
  }

  // Legacy rows without brand_slug remain readable only when their exact
  // stored brand_name matches the canonical brand resolved for this request.
  const byLegacyName = await supabase
    .from("sales_leads")
    .select("*")
    .eq("id", normalizedLeadId)
    .is("brand_slug", null)
    .eq("brand_name", context.brandName)
    .maybeSingle();

  if (byLegacyName.error) {
    throw byLegacyName.error;
  }

  return byLegacyName.data
    ? (byLegacyName.data as TenantScopedSalesLead)
    : null;
}

export async function findSalesLeadByPhoneForBrand(
  supabase: SupabaseClient,
  contactPhone: string,
  context: CanonicalBrandContext
): Promise<TenantScopedSalesLead | null> {
  const normalizedPhone = String(contactPhone || "").trim();

  if (!normalizedPhone) {
    return null;
  }

  const bySlug = await supabase
    .from("sales_leads")
    .select("*")
    .eq("brand_slug", context.brandSlug)
    .eq("contact_phone", normalizedPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySlug.error) {
    throw bySlug.error;
  }

  if (bySlug.data) {
    return bySlug.data as TenantScopedSalesLead;
  }

  const byLegacyName = await supabase
    .from("sales_leads")
    .select("*")
    .is("brand_slug", null)
    .eq("brand_name", context.brandName)
    .eq("contact_phone", normalizedPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byLegacyName.error) {
    throw byLegacyName.error;
  }

  return byLegacyName.data
    ? (byLegacyName.data as TenantScopedSalesLead)
    : null;
}
