import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import { requireCanonicalBrandContext } from "@/lib/brand-os/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const context = await requireCanonicalBrandContext({
      brandSlug: searchParams.get("brandSlug"),
      legacyBrandName: searchParams.get("brandName"),
    });
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("brand_slug", context.brandSlug)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Compatibility for legacy rows not yet backfilled with brand_slug. The
    // client-selected brandName is never used as authority.
    const { data: legacyRows, error: legacyError } = await supabase
      .from("sales_leads")
      .select("*")
      .is("brand_slug", null)
      .eq("brand_name", context.brandName)
      .order("created_at", { ascending: false })
      .limit(50);

    if (legacyError) throw legacyError;

    const leads = [...(data || []), ...(legacyRows || [])]
      .sort((left, right) => {
        const leftDate = String(left.created_at || "");
        const rightDate = String(right.created_at || "");
        return rightDate.localeCompare(leftDate);
      })
      .slice(0, 50);

    return NextResponse.json({
      ok: true,
      leads,
      brand: {
        id: context.brandId,
        slug: context.brandSlug,
        name: context.brandName,
      },
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}
