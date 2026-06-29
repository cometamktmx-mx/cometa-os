import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PublishAction = "approve" | "publish";

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      action = "publish",
      publicationId = null,

      brandName,
      brandAnalysisId = null,

      clientStrategy,
      internalStrategy,
      formData = {},
      internalNotes = "",

      approvedBy = "Cometa",
    } = body;

    const finalAction = action as PublishAction;

    if (!["approve", "publish"].includes(finalAction)) {
      return NextResponse.json({
        success: false,
        error: "Acción no válida. Usa approve o publish.",
      });
    }

    if (!brandName) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName.",
      });
    }

    if (!clientStrategy || typeof clientStrategy !== "object") {
      return NextResponse.json({
        success: false,
        error: "Se requiere clientStrategy válido.",
      });
    }

    if (!internalStrategy || typeof internalStrategy !== "object") {
      return NextResponse.json({
        success: false,
        error: "Se requiere internalStrategy válido.",
      });
    }

    const now = new Date().toISOString();
    const brandSlug = slugify(brandName);

    const payload = {
      brand_name: brandName,
      brand_slug: brandSlug,
      brand_analysis_id: brandAnalysisId || null,

      agent_name: "ATLAS",
      source: "ATLAS",

      status: finalAction === "publish" ? "published" : "approved",
      is_client_visible: finalAction === "publish",

      client_strategy: clientStrategy,
      internal_strategy: internalStrategy,
      form_data: formData || {},
      internal_notes: internalNotes || null,

      approved_by: approvedBy || "Cometa",
      approved_at: now,
      published_at: finalAction === "publish" ? now : null,

      updated_at: now,
    };

    if (publicationId) {
      const { data, error } = await supabase
        .from("strategy_publications")
        .update(payload)
        .eq("id", publicationId)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        action: finalAction,
        publication: data,
      });
    }

    if (finalAction === "publish") {
      const { data: latestApproved, error: latestError } = await supabase
        .from("strategy_publications")
        .select("*")
        .eq("brand_slug", brandSlug)
        .eq("agent_name", "ATLAS")
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;

      if (latestApproved?.id) {
        const { data, error } = await supabase
          .from("strategy_publications")
          .update(payload)
          .eq("id", latestApproved.id)
          .select("*")
          .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
          success: true,
          action: finalAction,
          publication: data,
        });
      }
    }

    const { data, error } = await supabase
      .from("strategy_publications")
      .insert([
        {
          ...payload,
          created_at: now,
        },
      ])
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      action: finalAction,
      publication: data,
    });
  } catch (error: any) {
    console.log("Error publicando estrategia ATLAS:", error);

    return NextResponse.json({
      success: false,
      error: error?.message || "Error publicando estrategia ATLAS.",
    });
  }
}