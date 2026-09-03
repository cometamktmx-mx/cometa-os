import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  brandContextErrorResponse,
  invalidRequestResponse,
} from "@/lib/brand-os/api";
import { requireCanonicalBrandContext } from "@/lib/brand-os/server";
import {
  findSalesLeadByPhoneForBrand,
  findSalesLeadForBrand,
} from "@/lib/sales-ai/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = String(searchParams.get("leadId") || "").trim();
    const contactPhone = String(searchParams.get("contactPhone") || "").trim();

    if (!leadId && !contactPhone) {
      return invalidRequestResponse(
        "Se requiere leadId o contactPhone para consultar la conversaciÃ³n."
      );
    }

    const context = await requireCanonicalBrandContext({
      brandSlug: searchParams.get("brandSlug"),
      legacyBrandName: searchParams.get("brandName"),
    });
    const supabase = getSupabaseAdmin();
    const lead = leadId
      ? await findSalesLeadForBrand(supabase, leadId, context)
      : await findSalesLeadByPhoneForBrand(supabase, contactPhone, context);

    if (!lead) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: "ENTITY_NOT_FOUND",
          error: "No se encontrÃ³ la conversaciÃ³n solicitada.",
        },
        { status: 404 }
      );
    }

    const finalLeadId = lead.id;
    const [messagesResult, agentRunsResult, outboundMessagesResult] =
      await Promise.all([
        supabase
          .from("sales_messages")
          .select(
            "id,lead_id,channel_id,agent_run_id,outbound_message_id,brand_name,platform,direction,sender_type,contact_phone,from_phone_number_id,message_text,whatsapp_message_id,status,raw_data,created_at"
          )
          .eq("lead_id", finalLeadId)
          .order("created_at", { ascending: true }),
        supabase
          .from("sales_agent_runs")
          .select(
            "id,action,action_status,lead_stage,requires_human,confidence_score,decision_reason,agent_reply,created_at"
          )
          .eq("lead_id", finalLeadId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("sales_outbound_messages")
          .select(
            "id,agent_run_id,channel_id,brand_name,to_phone,from_phone_number_id,message_text,status,send_reason,error_message,whatsapp_message_id,created_at,sent_at"
          )
          .eq("lead_id", finalLeadId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    if (messagesResult.error) throw messagesResult.error;
    if (agentRunsResult.error) throw agentRunsResult.error;
    if (outboundMessagesResult.error) throw outboundMessagesResult.error;

    return NextResponse.json({
      ok: true,
      lead,
      messages: messagesResult.data || [],
      agentRuns: agentRunsResult.data || [],
      outboundMessages: outboundMessagesResult.data || [],
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}
