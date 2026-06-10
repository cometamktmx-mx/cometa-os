import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandAnalysisId,
      brandName,
      industry,
      city,
      agent,
      data,
    } = body;

    if (!brandName || !agent || !data) {
      return NextResponse.json({
        success: false,
        error: "Datos incompletos.",
      });
    }

    const { data: existingMemory } = await supabase
      .from("cosmos_memory")
      .select("*")
      .eq("brand_name", brandName)
      .maybeSingle();

    if (!existingMemory) {
      const memoryPayload: any = {
        brand_analysis_id: brandAnalysisId || null,
        brand_name: brandName,
        industry,
        city,
        last_agent: agent,
      };

      if (agent === "ORION")
        memoryPayload.orion_analysis = data;

      if (agent === "NOVA")
        memoryPayload.nova_business_map = data;

      if (agent === "ATLAS")
        memoryPayload.atlas_strategy = data;

      if (agent === "MERCURY")
        memoryPayload.mercury_content = data;

      const { error } = await supabase
        .from("cosmos_memory")
        .insert([memoryPayload]);

      if (error) throw error;
    } else {
      const updatePayload: any = {
        updated_at: new Date().toISOString(),
        last_agent: agent,
      };

      if (agent === "ORION")
        updatePayload.orion_analysis = data;

      if (agent === "NOVA")
        updatePayload.nova_business_map = data;

      if (agent === "ATLAS")
        updatePayload.atlas_strategy = data;

      if (agent === "MERCURY")
        updatePayload.mercury_content = data;

      const { error } = await supabase
        .from("cosmos_memory")
        .update(updatePayload)
        .eq("id", existingMemory.id);

      if (error) throw error;
    }

    await supabase
      .from("cosmos_agent_runs")
      .insert([
        {
          brand_name: brandName,
          brand_analysis_id: brandAnalysisId || null,
          agent_name: agent,
          action_type: "save_memory",
          output_data: data,
          status: "success",
        },
      ]);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.log(error);

    return NextResponse.json({
      success: false,
      error: "Error guardando memoria en COSMOS.",
    });
  }
}