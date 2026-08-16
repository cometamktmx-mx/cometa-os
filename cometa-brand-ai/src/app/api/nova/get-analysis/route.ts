import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type GetAnalysisBody = {
  analysisId?: unknown;
};

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan las variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GetAnalysisBody;

    const analysisId =
      typeof body.analysisId === "string" ? body.analysisId.trim() : "";

    if (!analysisId) {
      return NextResponse.json(
        {
          success: false,
          error: "Falta analysisId",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: analysis, error } = await supabase
      .from("brand_analysis")
      .select("*")
      .eq("id", analysisId)
      .maybeSingle();

    if (error) {
      console.error("Error consultando análisis NOVA:", {
        code: error.code,
        message: error.message,
      });

      return NextResponse.json(
        {
          success: false,
          error: "No fue posible cargar el análisis",
        },
        { status: 500 }
      );
    }

    if (!analysis) {
      return NextResponse.json(
        {
          success: false,
          error: "No se encontró el análisis ORION",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error(
      "Error interno en get-analysis NOVA:",
      error instanceof Error ? error.message : "Error desconocido"
    );

    return NextResponse.json(
      {
        success: false,
        error: "Error interno cargando el análisis",
      },
      { status: 500 }
    );
  }
}