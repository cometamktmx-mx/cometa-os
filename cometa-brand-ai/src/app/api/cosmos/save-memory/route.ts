import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function getMemoryColumn(agent: string) {
  const normalizedAgent = agent.toUpperCase();

  switch (normalizedAgent) {
    case "COMPANY":
      return "company_memory";

    case "BUSINESS_MEMORY":
    case "NOVA":
    case "BUSINESS_MAP":
      return "business_memory";

    case "ORION":
      return "orion_memory";

    case "BUSINESS_INTELLIGENCE":
      return "business_intelligence";

    case "ATLAS":
    case "STRATEGY":
    case "GROWTH":
      return "growth_memory";

    case "POS":
    case "POS_INTELLIGENCE":
    case "REVENUE":
      return "revenue_memory";

    default:
      return null;
  }
}

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

    const memoryColumn = getMemoryColumn(agent);

    if (!memoryColumn) {
      return NextResponse.json({
        success: false,
        error: `Agente no reconocido para COSMOS: ${agent}`,
      });
    }

    const now = new Date().toISOString();

    const timelineEvent = {
      timestamp: now,
      agent,
      action: "save_memory",
      memory_column: memoryColumn,
      summary: data?.summary || null,
    };

    const { data: existingMemory, error: findError } = await supabase
      .from("cosmos_memory")
      .select("*")
      .ilike("brand_name", brandName)
      .maybeSingle();

    if (findError) throw findError;

    if (!existingMemory) {
      const memoryPayload: any = {
        brand_analysis_id: brandAnalysisId || null,
        brand_name: brandName,
        industry: industry || null,
        city: city || null,
        status: "active",
        last_agent: agent,
        [memoryColumn]: data,
        activity_timeline: [timelineEvent],
      };

      const { error } = await supabase
        .from("cosmos_memory")
        .insert([memoryPayload]);

      if (error) throw error;
    } else {
      const currentTimeline = Array.isArray(existingMemory.activity_timeline)
        ? existingMemory.activity_timeline
        : [];

      const updatePayload: any = {
        updated_at: now,
        last_agent: agent,
        [memoryColumn]: data,
        activity_timeline: [...currentTimeline, timelineEvent],
      };

      if (industry && !existingMemory.industry) updatePayload.industry = industry;
      if (city && !existingMemory.city) updatePayload.city = city;
      if (brandAnalysisId && !existingMemory.brand_analysis_id) {
        updatePayload.brand_analysis_id = brandAnalysisId;
      }

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
      memoryColumn,
    });
  } catch (error) {
    console.log(error);

    return NextResponse.json({
      success: false,
      error: "Error guardando memoria en COSMOS.",
    });
  }
}