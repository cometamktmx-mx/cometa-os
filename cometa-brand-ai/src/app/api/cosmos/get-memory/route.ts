import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brandName, brandAnalysisId } = body;

    if (!brandName && !brandAnalysisId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName o brandAnalysisId.",
      });
    }

    let memory = null;

    if (brandAnalysisId) {
      const { data } = await supabase
        .from("cosmos_memory")
        .select("*")
        .eq("brand_analysis_id", brandAnalysisId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      memory = data;
    }

    if (!memory && brandName) {
      const { data } = await supabase
        .from("cosmos_memory")
        .select("*")
        .ilike("brand_name", `%${brandName}%`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      memory = data;
    }

    return NextResponse.json({
      success: true,
      memory: memory || null,
    });
  } catch (error) {
    console.log("Error obteniendo memoria COSMOS:", error);

    return NextResponse.json({
      success: false,
      error: "Error obteniendo memoria de COSMOS.",
    });
  }
}