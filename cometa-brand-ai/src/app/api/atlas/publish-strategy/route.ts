import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { brandContextErrorResponse, invalidRequestResponse } from "@/lib/brand-os/api";
import {
  requireCanonicalBrandContext,
  type CanonicalBrandContext,
} from "@/lib/brand-os/server";

const actions = new Set(["approve", "publish"]);

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
    const action = String(body?.action || "publish").trim().toLowerCase();

    if (!actions.has(action)) {
      return invalidRequestResponse("AcciÃ³n no vÃ¡lida. Usa approve o publish.");
    }

    if (!body?.clientStrategy || typeof body.clientStrategy !== "object") {
      return invalidRequestResponse("Se requiere clientStrategy vÃ¡lido.");
    }

    if (!body?.internalStrategy || typeof body.internalStrategy !== "object") {
      return invalidRequestResponse("Se requiere internalStrategy vÃ¡lido.");
    }

    const context = await requireCanonicalBrandContext({
      brandSlug: text(body.brandSlug),
      legacyBrandName: text(body.brandName),
    });
    const supabase = getSupabaseAdmin();
    const brandAnalysisId = text(body.brandAnalysisId) || null;

    if (brandAnalysisId) {
      const { data: analysis, error: analysisError } = await supabase
        .from("brand_analysis")
        .select("id,brand_slug,brand_name")
        .eq("id", brandAnalysisId)
        .maybeSingle();

      if (analysisError) throw analysisError;
      if (!analysis || !belongsToCanonicalBrand(analysis, context)) {
        return entityNotFoundResponse("No se encontrÃ³ el anÃ¡lisis para esta marca.");
      }
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      brand_name: context.brandName,
      brand_slug: context.brandSlug,
      brand_analysis_id: brandAnalysisId,
      agent_name: "ATLAS",
      source: "ATLAS",
      status: action === "publish" ? "published" : "approved",
      is_client_visible: action === "publish",
      client_strategy: body.clientStrategy,
      internal_strategy: body.internalStrategy,
      form_data: body.formData && typeof body.formData === "object" ? body.formData : {},
      internal_notes: text(body.internalNotes) || null,
      approved_by: context.userEmail || context.userId,
      approved_at: now,
      published_at: action === "publish" ? now : null,
      updated_at: now,
    };
    const publicationId = text(body.publicationId);

    if (publicationId) {
      const existing = await findPublicationForContext(
        supabase,
        publicationId,
        context
      );

      if (!existing) {
        return entityNotFoundResponse("No se encontrÃ³ la publicaciÃ³n solicitada.");
      }

      const { data, error } = await supabase
        .from("strategy_publications")
        .update(payload)
        .eq("id", publicationId)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ success: true, action, publication: data });
    }

    if (action === "publish") {
      const approved = await findLatestApprovedPublication(
        supabase,
        context
      );

      if (approved?.id) {
        const { data, error } = await supabase
          .from("strategy_publications")
          .update(payload)
          .eq("id", approved.id)
          .select("*")
          .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ success: true, action, publication: data });
      }
    }

    const { data, error } = await supabase
      .from("strategy_publications")
      .insert([{ ...payload, created_at: now }])
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ success: true, action, publication: data });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}

async function findPublicationForContext(
  supabase: SupabaseClient,
  publicationId: string,
  context: CanonicalBrandContext
) {
  const { data, error } = await supabase
    .from("strategy_publications")
    .select("id,brand_slug,brand_name")
    .eq("id", publicationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return belongsToCanonicalBrand(data, context) ? data : null;
}

async function findLatestApprovedPublication(
  supabase: SupabaseClient,
  context: CanonicalBrandContext
) {
  const bySlug = await supabase
    .from("strategy_publications")
    .select("id")
    .eq("brand_slug", context.brandSlug)
    .eq("agent_name", "ATLAS")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) return bySlug.data;

  const legacy = await supabase
    .from("strategy_publications")
    .select("id")
    .is("brand_slug", null)
    .eq("brand_name", context.brandName)
    .eq("agent_name", "ATLAS")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacy.error) throw legacy.error;
  return legacy.data || null;
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

function entityNotFoundResponse(error: string) {
  return NextResponse.json(
    { ok: false, success: false, code: "ENTITY_NOT_FOUND", error },
    { status: 404 }
  );
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
