import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const leadId = searchParams.get("leadId");
    const brandName = searchParams.get("brandName");
    const contactPhone = searchParams.get("contactPhone");

    if (!leadId && (!brandName || !contactPhone)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta leadId o la combinación brandName + contactPhone para buscar mensajes.",
        },
        { status: 400 }
      );
    }

    let finalLeadId = leadId;
    let lead = null;

    if (!finalLeadId && brandName && contactPhone) {
      const { data: foundLead, error: leadError } = await supabase
        .from("sales_leads")
        .select("*")
        .eq("brand_name", brandName)
        .eq("contact_phone", contactPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (leadError) {
        return NextResponse.json(
          {
            ok: false,
            error: leadError.message,
          },
          { status: 500 }
        );
      }

      if (!foundLead) {
        return NextResponse.json({
          ok: true,
          lead: null,
          messages: [],
          agentRuns: [],
          outboundMessages: [],
        });
      }

      lead = foundLead;
      finalLeadId = foundLead.id;
    }

    if (finalLeadId && !lead) {
      const { data: foundLead, error: leadError } = await supabase
        .from("sales_leads")
        .select("*")
        .eq("id", finalLeadId)
        .maybeSingle();

      if (leadError) {
        return NextResponse.json(
          {
            ok: false,
            error: leadError.message,
          },
          { status: 500 }
        );
      }

      lead = foundLead;
    }

    const { data: messages, error: messagesError } = await supabase
      .from("sales_messages")
      .select(
        `
        id,
        lead_id,
        channel_id,
        agent_run_id,
        outbound_message_id,
        brand_name,
        platform,
        direction,
        sender_type,
        contact_phone,
        from_phone_number_id,
        message_text,
        whatsapp_message_id,
        status,
        raw_data,
        created_at
      `
      )
      .eq("lead_id", finalLeadId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json(
        {
          ok: false,
          error: messagesError.message,
        },
        { status: 500 }
      );
    }

    const { data: agentRuns } = await supabase
      .from("sales_agent_runs")
      .select(
        `
        id,
        action,
        action_status,
        lead_stage,
        requires_human,
        confidence_score,
        decision_reason,
        agent_reply,
        created_at
      `
      )
      .eq("lead_id", finalLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: outboundMessages } = await supabase
      .from("sales_outbound_messages")
      .select(
        `
        id,
        agent_run_id,
        channel_id,
        brand_name,
        to_phone,
        from_phone_number_id,
        message_text,
        status,
        send_reason,
        error_message,
        whatsapp_message_id,
        created_at,
        sent_at
      `
      )
      .eq("lead_id", finalLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      lead,
      messages: messages || [],
      agentRuns: agentRuns || [],
      outboundMessages: outboundMessages || [],
    });
  } catch (error: any) {
    console.error("Error cargando mensajes SALES AI:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno cargando mensajes del lead",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}