import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import {
  requireCanonicalBrandContext,
  type CanonicalBrandContext,
} from "@/lib/brand-os/server";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const context = await requireCanonicalBrandContext({
      brandSlug: text(body?.brandSlug),
      legacyBrandName: text(body?.brandName),
    });
    const supabase = getSupabaseAdmin();
    const brandAnalysisId = text(body?.brandAnalysisId);

    if (brandAnalysisId) {
      const analysis = await findBrandAnalysisForContext(
        supabase,
        brandAnalysisId,
        context
      );

      if (!analysis) {
        return notFoundResponse("No se encontrÃ³ el anÃ¡lisis para esta marca.");
      }
    }

    const memory = await findCosmosMemoryForContext(
      supabase,
      context,
      brandAnalysisId
    );

    return NextResponse.json({
      ok: true,
      success: true,
      memory,
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

async function findCosmosMemoryForContext(
  supabase: SupabaseClient,
  context: CanonicalBrandContext,
  brandAnalysisId: string
) {
  if (brandAnalysisId) {
    const byAnalysisAndSlug = await supabase
      .from("cosmos_memory")
      .select("*")
      .eq("brand_analysis_id", brandAnalysisId)
      .eq("brand_slug", context.brandSlug)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byAnalysisAndSlug.error) throw byAnalysisAndSlug.error;
    if (byAnalysisAndSlug.data) return byAnalysisAndSlug.data;

    const byLegacyAnalysisName = await supabase
      .from("cosmos_memory")
      .select("*")
      .eq("brand_analysis_id", brandAnalysisId)
      .is("brand_slug", null)
      .eq("brand_name", context.brandName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byLegacyAnalysisName.error) throw byLegacyAnalysisName.error;
    if (byLegacyAnalysisName.data) return byLegacyAnalysisName.data;
  }

  const bySlug = await supabase
    .from("cosmos_memory")
    .select("*")
    .eq("brand_slug", context.brandSlug)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) return bySlug.data;

  const byLegacyName = await supabase
    .from("cosmos_memory")
    .select("*")
    .is("brand_slug", null)
    .eq("brand_name", context.brandName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byLegacyName.error) throw byLegacyName.error;
  return byLegacyName.data || null;
}

async function findBrandAnalysisForContext(
  supabase: SupabaseClient,
  analysisId: string,
  context: CanonicalBrandContext
) {
  const { data, error } = await supabase
    .from("brand_analysis")
    .select("id,brand_slug,brand_name")
    .eq("id", analysisId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return belongsToCanonicalBrand(data, context) ? data : null;
}

function belongsToCanonicalBrand(
  row: Record<string, unknown>,
  context: CanonicalBrandContext
) {
  const rowSlug = text(row.brand_slug);

  if (rowSlug) {
    return rowSlug === context.brandSlug;
  }

  return text(row.brand_name) === context.brandName;
}

function notFoundResponse(error: string) {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "ENTITY_NOT_FOUND",
      error,
    },
    { status: 404 }
  );
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
