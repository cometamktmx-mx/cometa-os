import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandName,
      brandAnalysisId,
      clientId,
      leadId,
      contactName,
      contactPhone,
      contactUsername,
      conversationText,
      source = "whatsapp",
      campaignName,
      adName,
    } = body;

    if (!brandName || !conversationText) {
      return NextResponse.json(
        {
          error: "Faltan campos obligatorios: brandName y conversationText",
        },
        { status: 400 }
      );
    }

    const { data: playbook } = await supabase
      .from("sales_playbooks")
      .select("*")
      .eq("brand_name", brandName)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const systemPrompt = `
Eres SALES AI, un agente comercial especializado en analizar conversaciones de WhatsApp y detectar oportunidades de venta.

Tu trabajo NO es hacer marketing general.
Tu trabajo es diagnosticar si un prospecto puede convertirse en venta, qué salió mal en la conversación y qué debería responder el vendedor.

Analiza la conversación con criterio comercial.

Debes responder EXCLUSIVAMENTE en JSON válido.

Campos obligatorios:

{
  "lead_status": "new | contacted | qualified | follow_up | closed | lost | unqualified",
  "lead_temperature": "hot | warm | cold | unknown",
  "intent": "mayoreo | menudeo | precio | catalogo | envio | ubicacion | reventa | surtir_negocio | curiosidad | otro",
  "business_type": "revendedora | tienda | bazar | negocio_belleza | consumidor_final | desconocido",
  "budget_level": "alto | medio | bajo | sin_presupuesto | desconocido",
  "city": "string | null",
  "is_qualified": true,
  "qualification_reason": "string",
  "main_objection": "precio | envio | confianza | presupuesto | pedido_minimo | falta_de_urgencia | comparando | no_responde | ninguna | otra",
  "lost_reason": "string | null",
  "close_probability": 0,
  "ai_summary": "string",
  "next_action": "string",
  "recommended_reply": "string",
  "follow_up_message": "string",
  "sales_diagnosis": "string",
  "detected_errors": ["string"],
  "questions_to_ask": ["string"],
  "tags": ["string"]
}

Reglas:
- close_probability debe ser número de 0 a 100.
- recommended_reply debe ser un mensaje listo para copiar y pegar al cliente.
- No inventes ventas.
- No prometas descuentos, envíos gratis o disponibilidad si no está en la conversación o playbook.
- Si el prospecto solo pidió información y desapareció, detecta falta de seguimiento.
- Si se mandó catálogo demasiado rápido, márcalo como error.
- Si el negocio vende mayoreo, prioriza filtrar presupuesto, ciudad, intención de reventa y tipo de lote.
`;

    const businessContext = playbook
      ? `
Contexto comercial del negocio:
Marca: ${brandName}
Modelo de negocio: ${playbook.business_model || "No especificado"}
Cliente ideal: ${playbook.ideal_customer || "No especificado"}
Reglas comerciales: ${JSON.stringify(playbook.sales_rules || {})}
Preguntas de calificación: ${JSON.stringify(
          playbook.qualification_questions || []
        )}
Objeciones conocidas: ${JSON.stringify(playbook.objections || [])}
Promesas prohibidas: ${JSON.stringify(playbook.forbidden_promises || [])}
Tono: ${playbook.tone || "friendly_professional"}
`
      : `
Contexto comercial del negocio:
Marca: ${brandName}
No hay playbook registrado todavía. Analiza con base en la conversación.
`;

    const userPrompt = `
${businessContext}

Conversación a analizar:
"""
${conversationText}
"""

Devuelve únicamente JSON válido.
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const analysis = safeJsonParse(raw);

    if (!analysis) {
      return NextResponse.json(
        {
          error: "No se pudo convertir la respuesta de SALES AI a JSON",
          raw,
        },
        { status: 500 }
      );
    }

    let finalLeadId = leadId;

    if (leadId) {
      const { error: updateError } = await supabase
        .from("sales_leads")
        .update({
          lead_status: analysis.lead_status,
          lead_temperature: analysis.lead_temperature,
          intent: analysis.intent,
          business_type: analysis.business_type,
          budget_level: analysis.budget_level,
          city: analysis.city,
          is_qualified: analysis.is_qualified,
          qualification_reason: analysis.qualification_reason,
          main_objection: analysis.main_objection,
          lost_reason: analysis.lost_reason,
          close_probability: analysis.close_probability,
          ai_summary: analysis.ai_summary,
          next_action: analysis.next_action,
          recommended_reply: analysis.recommended_reply,
          last_message_at: new Date().toISOString(),
          raw_data: analysis,
        })
        .eq("id", leadId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      const { data: insertedLead, error: insertError } = await supabase
        .from("sales_leads")
        .insert({
          client_id: clientId || null,
          brand_analysis_id: brandAnalysisId || null,
          brand_name: brandName,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          contact_username: contactUsername || null,
          source,
          campaign_name: campaignName || null,
          ad_name: adName || null,
          lead_status: analysis.lead_status,
          lead_temperature: analysis.lead_temperature,
          intent: analysis.intent,
          business_type: analysis.business_type,
          budget_level: analysis.budget_level,
          city: analysis.city,
          is_qualified: analysis.is_qualified,
          qualification_reason: analysis.qualification_reason,
          main_objection: analysis.main_objection,
          lost_reason: analysis.lost_reason,
          close_probability: analysis.close_probability,
          ai_summary: analysis.ai_summary,
          next_action: analysis.next_action,
          recommended_reply: analysis.recommended_reply,
          last_message_at: new Date().toISOString(),
          raw_data: analysis,
        })
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }

      finalLeadId = insertedLead.id;
    }

    
   // Historial de conversación desactivado aquí.
// El webhook es el único responsable de guardar sales_messages.

    return NextResponse.json({
      success: true,
      leadId: finalLeadId,
      analysis,
    });
  } catch (error: any) {
    console.error("SALES AI analyze-lead error:", error);

    return NextResponse.json(
      {
        error: "Error interno en SALES AI",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}