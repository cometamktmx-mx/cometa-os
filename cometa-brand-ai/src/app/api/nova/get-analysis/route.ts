import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

console.log(
  "SUPABASE URL:",
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

console.log(
  "SERVICE ROLE:",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { analysisId } = await req.json();

    console.log("NOVA ANALYSIS ID:", analysisId);

    if (!analysisId) {
      return NextResponse.json({
        success: false,
        error: "Falta analysisId",
      });
    }

    const { data: analysis, error } = await supabase
      .from("brand_analysis")
      .select("*")
      .eq("id", analysisId)
      .single();

    console.log("NOVA SUPABASE ERROR:", error);
    console.log("NOVA ANALYSIS:", analysis);

    if (error || !analysis) {
      return NextResponse.json({
        success: false,
        error: "No se encontró el análisis ORION",
      });
    }

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.log("Error en get-analysis NOVA:", error);

    return NextResponse.json({
      success: false,
      error: "Error interno cargando análisis",
    });
  }
}