import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandContextErrorResponse, invalidRequestResponse } from "@/lib/brand-os/api";
import {
  requireCanonicalBrandContext,
  type CanonicalBrandContext,
} from "@/lib/brand-os/server";

type GetAnalysisBody = {
  analysisId?: unknown;
  brandSlug?: unknown;
  brandName?: unknown;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as GetAnalysisBody | null;
    const analysisId = text(body?.analysisId);

    if (!analysisId) {
      return invalidRequestResponse("Falta analysisId.");
    }

    const context = await requireCanonicalBrandContext({
      brandSlug: text(body?.brandSlug),
      legacyBrandName: text(body?.brandName),
    });
    const supabase = getSupabaseAdmin();
    const { data: analysis, error } = await supabase
      .from("brand_analysis")
      .select("*")
      .eq("id", analysisId)
      .maybeSingle();

    if (error) throw error;

    if (!analysis || !belongsToCanonicalBrand(analysis, context)) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: "ENTITY_NOT_FOUND",
          error: "No se encontrÃ³ el anÃ¡lisis solicitado.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, success: true, analysis });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}

function belongsToCanonicalBrand(
  row: Record<string, unknown>,
  context: CanonicalBrandContext
) {
  const rowSlug = text(row.brand_slug);
  return rowSlug
    ? rowSlug === context.brandSlug
    : text(row.brand_name) === context.brandName;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
