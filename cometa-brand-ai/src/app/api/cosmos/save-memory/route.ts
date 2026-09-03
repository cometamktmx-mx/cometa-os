import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brandContextErrorResponse, invalidRequestResponse } from "@/lib/brand-os/api";
import {
  requireCanonicalBrandContext,
  type CanonicalBrandContext,
} from "@/lib/brand-os/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const memoryColumnsByAgent = {
  COMPANY: "company_memory",
  BUSINESS_MEMORY: "business_memory",
  NOVA: "business_memory",
  BUSINESS_MAP: "business_memory",
  ORION: "orion_memory",
  BUSINESS_INTELLIGENCE: "business_intelligence",
  ATLAS: "growth_memory",
  STRATEGY: "growth_memory",
  GROWTH: "growth_memory",
  POS: "revenue_memory",
  POS_INTELLIGENCE: "revenue_memory",
  REVENUE: "revenue_memory",
} as const;

type MemoryColumn = (typeof memoryColumnsByAgent)[keyof typeof memoryColumnsByAgent];

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
    const agent = text(body?.agent).toUpperCase();
    const data = body?.data;

    if (!agent || !data || typeof data !== "object" || Array.isArray(data)) {
      return invalidRequestResponse("Datos incompletos para guardar memoria.");
    }

    const memoryColumn = memoryColumnsByAgent[
      agent as keyof typeof memoryColumnsByAgent
    ] as MemoryColumn | undefined;

    if (!memoryColumn) {
      return invalidRequestResponse("Agente no reconocido para COSMOS.");
    }

    const context = await requireCanonicalBrandContext({
      brandSlug: text(body?.brandSlug),
      legacyBrandName: text(body?.brandName),
    });
    const supabase = getSupabaseAdmin();
    const brandAnalysisId = text(body?.brandAnalysisId) || null;

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

    const now = new Date().toISOString();
    const timelineEvent = {
      timestamp: now,
      agent,
      action: "save_memory",
      memory_column: memoryColumn,
      summary: getSummary(data),
    };
    const existingMemory = await findCosmosMemoryForContext(supabase, context);

    if (!existingMemory) {
      const payload: Record<string, unknown> = {
        brand_analysis_id: brandAnalysisId,
        brand_name: context.brandName,
        brand_slug: context.brandSlug,
        industry: text(body?.industry) || null,
        city: text(body?.city) || null,
        status: "active",
        last_agent: agent,
        [memoryColumn]: data,
        activity_timeline: [timelineEvent],
      };

      const { error } = await supabase.from("cosmos_memory").insert([payload]);
      if (error) throw error;
    } else {
      const currentTimeline = Array.isArray(existingMemory.activity_timeline)
        ? existingMemory.activity_timeline
        : [];
      const payload: Record<string, unknown> = {
        updated_at: now,
        brand_name: context.brandName,
        brand_slug: context.brandSlug,
        last_agent: agent,
        [memoryColumn]: data,
        activity_timeline: [...currentTimeline, timelineEvent],
      };

      if (text(body?.industry) && !text(existingMemory.industry)) {
        payload.industry = text(body?.industry);
      }
      if (text(body?.city) && !text(existingMemory.city)) {
        payload.city = text(body?.city);
      }
      if (brandAnalysisId && !text(existingMemory.brand_analysis_id)) {
        payload.brand_analysis_id = brandAnalysisId;
      }

      const { error } = await supabase
        .from("cosmos_memory")
        .update(payload)
        .eq("id", existingMemory.id);
      if (error) throw error;
    }

    const { error: runError } = await supabase.from("cosmos_agent_runs").insert([
      {
        brand_name: context.brandName,
        brand_analysis_id: brandAnalysisId,
        agent_name: agent,
        action_type: "save_memory",
        output_data: data,
        status: "success",
      },
    ]);

    if (runError) throw runError;

    return NextResponse.json({
      ok: true,
      success: true,
      memoryColumn,
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
  context: CanonicalBrandContext
) {
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
  return rowSlug
    ? rowSlug === context.brandSlug
    : text(row.brand_name) === context.brandName;
}

function getSummary(data: Record<string, unknown>) {
  const summary = data.summary;
  return typeof summary === "string" ? summary : null;
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
