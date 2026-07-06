import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveBrandFromSupabase } from "@/lib/brand-resolver";
import {
  canSendRealWhatsapp,
  explainWhatsappSendLock,
  getSalesAiRuntimeSettings,
  resolveSalesAiAgentMode,
} from "@/lib/sales-ai-runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const verifyToken =
  process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ||
  process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() ||
  "";

const webhookAppSecret =
  process.env.WHATSAPP_APP_SECRET?.trim() ||
  process.env.META_APP_SECRET?.trim() ||
  process.env.FACEBOOK_APP_SECRET?.trim() ||
  "";

const enforceWebhookSignature =
  process.env.WHATSAPP_ENFORCE_SIGNATURE === "true";

const defaultBrandSlug =
  process.env.WHATSAPP_DEFAULT_BRAND_SLUG || "cometa-mkt";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode")?.trim();
  const token = searchParams.get("hub.verify_token")?.trim();
  const challenge = searchParams.get("hub.challenge") || "";

  if (!verifyToken) {
    console.error("WHATSAPP WEBHOOK ERROR: Missing verify token env variable.");

    return Response.json(
      {
        ok: false,
        error:
          "Webhook sin token configurado. Falta WHATSAPP_VERIFY_TOKEN en Vercel.",
      },
      { status: 500 }
    );
  }

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Token de verificación inválido.",
    },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    const signatureValidation = validateWebhookSignature(request, rawBody);

    if (!signatureValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: signatureValidation.error,
        },
        { status: signatureValidation.status }
      );
    }

    const body = safeJsonParse(rawBody);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "Payload inválido de WhatsApp webhook.",
        },
        { status: 400 }
      );
    }

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let responseBrand = await resolveWebhookBrand();
    let processedMessages = 0;
    let processedStatuses = 0;
    let createdOrUpdatedLeads = 0;
    let createdSalesMessages = 0;
    let createdAgentRuns = 0;
    let sentWhatsappMessages = 0;
    let failedWhatsappMessages = 0;

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value || {};
        const metadata = value?.metadata || {};

        const phoneNumberId = metadata?.phone_number_id || null;
        const displayPhoneNumber = metadata?.display_phone_number || null;
        const brand = await resolveWebhookBrand({
  phoneNumberId,
  displayPhoneNumber,
});
responseBrand = brand;
await supabase.from("whatsapp_webhook_events").insert({
  id: randomUUID(),
  brand_slug: brand.slug,
  event_type: "whatsapp_webhook",
  payload: body,
});

        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

        const contactsByWaId = buildIncomingContactsByWaId(contacts);

        for (const contact of contacts) {
          const waId = String(contact?.wa_id || "").trim();

          if (!waId) continue;

          await supabase.from("whatsapp_contacts").upsert(
            {
              brand_slug: brand.slug,
              wa_id: waId,
              phone: waId,
              profile_name: contact?.profile?.name || null,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "brand_slug,wa_id",
            }
          );
        }

        for (const message of messages) {
          const messageId = String(message?.id || "").trim();
          const waId = String(message?.from || "").trim();

          if (!messageId || !waId) continue;

          const contentText = extractMessageContent(message);
          const timestampText = message?.timestamp
            ? String(message.timestamp)
            : null;
          const timestampIso =
            unixTimestampToIso(timestampText) || new Date().toISOString();

          const contact = contactsByWaId[waId] || {};
          const contactName =
            cleanText(contact?.profile?.name) || `WhatsApp ${waId.slice(-4)}`;

          await supabase.from("whatsapp_contacts").upsert(
            {
              brand_slug: brand.slug,
              wa_id: waId,
              phone: waId,
              profile_name: contactName,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "brand_slug,wa_id",
            }
          );

          await supabase.from("whatsapp_messages").upsert(
            {
              brand_slug: brand.slug,
              message_id: messageId,
              wa_id: waId,
              phone_number_id: phoneNumberId,
              display_phone_number: displayPhoneNumber,
              direction: "inbound",
              message_type: message?.type || "unknown",
              content_text: contentText,
              raw_message: message,
              timestamp_text: timestampText,
              timestamp_at: timestampIso,
              status: "received",
            },
            {
              onConflict: "message_id",
            }
          );

          processedMessages += 1;

          const analysis = analyzeInboundMessage(contentText);

          const leadId = await createOrUpdateSalesLead({
            brandName: brand.name,
            brandSlug: brand.slug,
            waId,
            contactName,
            contentText,
            timestampIso,
            analysis,
          });

          if (leadId) {
            createdOrUpdatedLeads += 1;

            const salesMessageOk = await createSalesMessage({
              brandName: brand.name,
              leadId,
              waId,
              contactName,
              messageId,
              contentText,
              timestampIso,
              rawMessage: message,
            });

            if (salesMessageOk) {
              createdSalesMessages += 1;
            }

            const runtimeSettings = await getSalesAiRuntimeSettings(brand.name);

            const runtimeAgentMode = resolveSalesAiAgentMode(
              runtimeSettings,
              process.env.SALES_AI_AGENT_MODE || "observation"
            );

            const agentResult = await runSalesAiAgent(request, {
              brandName: brand.name,
              leadId,
              contactName,
              contactPhone: waId,
              contactUsername: waId,
              incomingMessage: contentText,
              conversationText: `Cliente (${contactName}): ${contentText}`,
              source: "whatsapp",
              agentMode: runtimeAgentMode,
            });

            if (agentResult?.success) {
              createdAgentRuns += 1;

              const envAllowsWhatsappSend =
                process.env.SALES_AI_SEND_WHATSAPP_ENABLED === "true";

              const settingsAllowWhatsappSend =
                canSendRealWhatsapp(runtimeSettings);

              const agentReply =
                typeof agentResult.decision?.agent_reply === "string"
                  ? agentResult.decision.agent_reply.trim()
                  : "";

              const shouldSendRealWhatsapp =
                agentResult.shouldSendWhatsapp === true &&
                Boolean(agentReply) &&
                Boolean(phoneNumberId) &&
                envAllowsWhatsappSend &&
                settingsAllowWhatsappSend;

              if (
                !shouldSendRealWhatsapp &&
                agentResult.shouldSendWhatsapp === true
              ) {
                console.log("SALES AI WhatsApp real bloqueado:", {
                  brandName: brand.name,
                  envAllowsWhatsappSend,
                  settingsAllowWhatsappSend,
                  hasAgentReply: Boolean(agentReply),
                  hasPhoneNumberId: Boolean(phoneNumberId),
                  lockReasons: explainWhatsappSendLock(runtimeSettings),
                });

                if (agentResult.runId) {
                  await safeUpdateById("sales_agent_runs", agentResult.runId, [
                    {
                      action_status: "whatsapp_send_blocked",
                      execution_error: `Bloqueado por configuración: ${explainWhatsappSendLock(
                        runtimeSettings
                      ).join(", ")}`,
                    },
                    {
                      action_status: "whatsapp_send_blocked",
                    },
                  ]);
                }
              }

              if (shouldSendRealWhatsapp) {
                const whatsappSendResult = await sendWhatsappTextMessage({
                  phoneNumberId,
                  to: waId,
                  message: agentReply,
                });

                if (whatsappSendResult.ok) {
                  sentWhatsappMessages += 1;

                  await saveOutboundWhatsappMessage({
                    brandSlug: brand.slug,
                    brandName: brand.name,
                    leadId,
                    waId,
                    phoneNumberId,
                    displayPhoneNumber,
                    messageText: agentReply,
                    whatsappMessageId: whatsappSendResult.whatsappMessageId,
                    rawResponse: whatsappSendResult.data,
                  });

                  if (agentResult.runId) {
                    await safeUpdateById("sales_agent_runs", agentResult.runId, [
                      {
                        action_status: "sent_whatsapp",
                        whatsapp_message_id:
                          whatsappSendResult.whatsappMessageId,
                        executed_at: new Date().toISOString(),
                      },
                      {
                        action_status: "sent_whatsapp",
                      },
                    ]);
                  }
                } else {
                  failedWhatsappMessages += 1;

                  console.error(
                    "No se pudo enviar WhatsApp automático:",
                    whatsappSendResult.error
                  );

                  if (agentResult.runId) {
                    await safeUpdateById("sales_agent_runs", agentResult.runId, [
                      {
                        action_status: "whatsapp_send_failed",
                        execution_error: whatsappSendResult.error,
                      },
                      {
                        action_status: "whatsapp_send_failed",
                      },
                    ]);
                  }
                }
              }
            }
          }
        }

        for (const status of statuses) {
          const messageId = status?.id ? String(status.id) : null;
          const timestampText = status?.timestamp
            ? String(status.timestamp)
            : null;

          await supabase.from("whatsapp_message_statuses").insert({
            brand_slug: brand.slug,
            message_id: messageId,
            recipient_id: status?.recipient_id || null,
            status: status?.status || null,
            raw_status: status,
            timestamp_text: timestampText,
            timestamp_at: unixTimestampToIso(timestampText),
          });

          processedStatuses += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Webhook recibido correctamente.",
      brand: {
  slug: responseBrand.slug,
  name: responseBrand.name,
},
      processed: {
        messages: processedMessages,
        statuses: processedStatuses,
        leads: createdOrUpdatedLeads,
        salesMessages: createdSalesMessages,
        agentRuns: createdAgentRuns,
        sentWhatsappMessages,
        failedWhatsappMessages,
      },
    });
  } catch (error: any) {
    console.error("WHATSAPP_WEBHOOK_ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error procesando webhook de WhatsApp.",
      },
      { status: 500 }
    );
  }
}

async function resolveWebhookBrand({
  phoneNumberId,
  displayPhoneNumber,
}: {
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
} = {}) {
  try {
    const normalizedPhoneNumberId = cleanText(phoneNumberId);
    const normalizedDisplayPhoneNumber = cleanText(displayPhoneNumber);

    if (normalizedPhoneNumberId) {
      const { data: settingsByPhoneId, error } = await supabase
        .from("sales_ai_settings")
        .select("brand_name, whatsapp_phone_number_id")
        .eq("whatsapp_phone_number_id", normalizedPhoneNumberId)
        .maybeSingle();

      if (!error && settingsByPhoneId?.brand_name) {
        const brand = await resolveBrandFromSupabase(supabase, {
          brandName: settingsByPhoneId.brand_name,
        });

        return {
          slug: brand.slug || formatBrandSlug(settingsByPhoneId.brand_name),
          name: brand.name || settingsByPhoneId.brand_name,
        };
      }
    }

    if (normalizedDisplayPhoneNumber) {
      const { data: settingsByDisplayPhone, error } = await supabase
        .from("sales_ai_settings")
        .select("brand_name, whatsapp_phone_number")
        .eq("whatsapp_phone_number", normalizedDisplayPhoneNumber)
        .maybeSingle();

      if (!error && settingsByDisplayPhone?.brand_name) {
        const brand = await resolveBrandFromSupabase(supabase, {
          brandName: settingsByDisplayPhone.brand_name,
        });

        return {
          slug: brand.slug || formatBrandSlug(settingsByDisplayPhone.brand_name),
          name: brand.name || settingsByDisplayPhone.brand_name,
        };
      }
    }

    const brand = await resolveBrandFromSupabase(supabase, {
      brandSlug: defaultBrandSlug,
    });

    return {
      slug: brand.slug || defaultBrandSlug,
      name: brand.name || formatBrandName(defaultBrandSlug),
    };
  } catch {
    return {
      slug: defaultBrandSlug,
      name: formatBrandName(defaultBrandSlug),
    };
  }
}

async function createOrUpdateSalesLead({
  brandName,
  brandSlug,
  waId,
  contactName,
  contentText,
  timestampIso,
  analysis,
}: {
  brandName: string;
  brandSlug: string;
  waId: string;
  contactName: string;
  contentText: string;
  timestampIso: string;
  analysis: LeadAnalysis;
}) {
  const existingLead = await findExistingSalesLead(brandName, waId);

  if (existingLead?.id) {
    await safeUpdateById("sales_leads", existingLead.id, [
      {
        updated_at: new Date().toISOString(),
        last_message_at: timestampIso,
        ai_summary: analysis.aiSummary,
        next_action: analysis.nextAction,
        recommended_reply: analysis.recommendedReply,
        close_probability: analysis.closeProbability,
        lead_temperature: analysis.temperature,
        intent: analysis.intent,
        detected_intent: analysis.intent,
        main_objection: analysis.mainObjection,
        requires_human: analysis.requiresHuman,
        requires_human_confirmation: analysis.requiresHuman,
      },
      {
        updated_at: new Date().toISOString(),
        ai_summary: analysis.aiSummary,
        next_action: analysis.nextAction,
        recommended_reply: analysis.recommendedReply,
      },
    ]);

    return String(existingLead.id);
  }

  const leadId = randomUUID();

  const insertedLead = await safeInsertWithFallback("sales_leads", [
    {
      id: leadId,
      brand_name: brandName,
      brand_slug: brandSlug,
      contact_name: contactName,
      customer_name: contactName,
      lead_name: contactName,
      name: contactName,
      phone: waId,
      contact_phone: waId,
      whatsapp: waId,
      whatsapp_number: waId,
      from_number: waId,
      lead_status: "open",
      status: "open",
      stage: "new",
      lead_temperature: analysis.temperature,
      temperature: analysis.temperature,
      intent: analysis.intent,
      detected_intent: analysis.intent,
      purchase_intent: analysis.intent,
      budget_level: "No detectado",
      budget_text: "No detectado",
      city: "No detectada",
      location: "No detectada",
      is_qualified: analysis.isQualified,
      qualified: analysis.isQualified,
      main_objection: analysis.mainObjection,
      objection: analysis.mainObjection,
      close_probability: analysis.closeProbability,
      probability: analysis.closeProbability,
      ai_summary: analysis.aiSummary,
      summary: analysis.aiSummary,
      next_action: analysis.nextAction,
      recommended_next_action: analysis.nextAction,
      recommended_reply: analysis.recommendedReply,
      reply_suggestion: analysis.recommendedReply,
      requires_human: analysis.requiresHuman,
      requires_human_confirmation: analysis.requiresHuman,
      tags: ["whatsapp", "piloto-cometa"],
      source: "whatsapp",
      last_message_at: timestampIso,
      created_at: timestampIso,
      updated_at: new Date().toISOString(),
    },
    {
      id: leadId,
      brand_name: brandName,
      contact_name: contactName,
      contact_phone: waId,
      lead_status: "open",
      lead_temperature: analysis.temperature,
      intent: analysis.intent,
      budget_level: "No detectado",
      city: "No detectada",
      is_qualified: analysis.isQualified,
      main_objection: analysis.mainObjection,
      close_probability: analysis.closeProbability,
      ai_summary: analysis.aiSummary,
      next_action: analysis.nextAction,
      recommended_reply: analysis.recommendedReply,
      requires_human: analysis.requiresHuman,
      tags: ["whatsapp", "piloto-cometa"],
      created_at: timestampIso,
      updated_at: new Date().toISOString(),
    },
    {
      id: leadId,
      brand_name: brandName,
      name: contactName,
      phone: waId,
      status: "open",
      intent: analysis.intent,
      close_probability: analysis.closeProbability,
      ai_summary: analysis.aiSummary,
      next_action: analysis.nextAction,
      recommended_reply: analysis.recommendedReply,
      created_at: timestampIso,
      updated_at: new Date().toISOString(),
    },
  ]);

  if (insertedLead?.id) {
    return String(insertedLead.id);
  }

  console.warn("No se pudo crear sales_lead. Se mantiene lead virtual WhatsApp.");
  return null;
}

async function findExistingSalesLead(brandName: string, waId: string) {
  try {
    const { data, error } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("brand_name", brandName)
      .limit(1000);

    if (error || !Array.isArray(data)) {
      if (error) {
        console.warn("findExistingSalesLead:", error.message);
      }

      return null;
    }

    const targetPhone = cleanPhone(waId);

    return (
      data.find((lead: any) => {
        const phones = [
          lead.phone,
          lead.contact_phone,
          lead.whatsapp,
          lead.whatsapp_number,
          lead.from_number,
        ].map(cleanPhone);

        return phones.includes(targetPhone);
      }) || null
    );
  } catch (error: any) {
    console.warn("findExistingSalesLead exception:", error?.message);
    return null;
  }
}

async function createSalesMessage({
  brandName,
  leadId,
  waId,
  contactName,
  messageId,
  contentText,
  timestampIso,
  rawMessage,
}: {
  brandName: string;
  leadId: string;
  waId: string;
  contactName: string;
  messageId: string;
  contentText: string;
  timestampIso: string;
  rawMessage: any;
}) {
  const inserted = await safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "inbound",
      message_direction: "inbound",
      type: "inbound",
      message: contentText,
      body: contentText,
      content: contentText,
      text: contentText,
      content_text: contentText,
      incoming_message: contentText,
      sender: contactName,
      sender_name: contactName,
      from: waId,
      from_number: waId,
      whatsapp_message_id: messageId,
      external_message_id: messageId,
      raw_message: rawMessage,
      is_from_customer: true,
      created_at: timestampIso,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "inbound",
      content_text: contentText,
      sender: contactName,
      created_at: timestampIso,
    },
    {
      brand_name: brandName,
      lead_id: leadId,
      message: contentText,
      direction: "inbound",
      created_at: timestampIso,
    },
  ]);

  return Boolean(inserted);
}

async function runSalesAiAgent(
  request: NextRequest,
  {
    brandName,
    leadId,
    contactName,
    contactPhone,
    contactUsername,
    incomingMessage,
    conversationText,
    source,
    agentMode,
  }: {
    brandName: string;
    leadId: string;
    contactName: string;
    contactPhone: string;
    contactUsername?: string;
    incomingMessage: string;
    conversationText: string;
    source: string;
    agentMode: string;
  }
) {
  try {
    const internalSecret = String(
      process.env.SALES_AI_INTERNAL_SECRET || ""
    ).trim();

    const res = await fetch(`${getBaseUrl(request)}/api/sales-ai/agent-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalSecret
          ? {
              "x-cometa-internal-secret": internalSecret,
            }
          : {}),
      },
      body: JSON.stringify({
        brandName,
        leadId,
        contactName,
        contactPhone,
        contactUsername,
        incomingMessage,
        conversationText,
        source,
        agentMode,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("SALES AI agent-run falló:", data);

      return null;
    }

    return data;
  } catch (error: any) {
    console.error("Error llamando SALES AI agent-run:", error?.message || error);

    return null;
  }
}

async function sendWhatsappTextMessage({
  phoneNumberId,
  to,
  message,
}: {
  phoneNumberId: string;
  to: string;
  message: string;
}) {
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.META_WHATSAPP_TOKEN ||
    "";

  const graphApiVersion =
  process.env.WHATSAPP_GRAPH_API_VERSION ||
  process.env.META_GRAPH_API_VERSION ||
  "v25.0";

  if (!accessToken) {
    return {
      ok: false,
      error: "Falta WHATSAPP_ACCESS_TOKEN o META_WHATSAPP_TOKEN",
    };
  }

  if (!phoneNumberId) {
    return {
      ok: false,
      error: "Falta phoneNumberId para enviar WhatsApp",
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        error: JSON.stringify(data || {}),
        data,
      };
    }

    return {
      ok: true,
      data,
      whatsappMessageId: data?.messages?.[0]?.id || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || String(error),
    };
  }
}

async function saveOutboundWhatsappMessage({
  brandSlug,
  brandName,
  leadId,
  waId,
  phoneNumberId,
  displayPhoneNumber,
  messageText,
  whatsappMessageId,
  rawResponse,
}: {
  brandSlug: string;
  brandName: string;
  leadId: string;
  waId: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  messageText: string;
  whatsappMessageId: string | null;
  rawResponse: any;
}) {
  const now = new Date().toISOString();

  await safeInsertWithFallback("whatsapp_messages", [
    {
      brand_slug: brandSlug,
      message_id: whatsappMessageId || randomUUID(),
      wa_id: waId,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
      direction: "outbound",
      message_type: "text",
      content_text: messageText,
      raw_message: rawResponse,
      timestamp_at: now,
      status: "sent",
    },
    {
      brand_slug: brandSlug,
      message_id: whatsappMessageId || randomUUID(),
      wa_id: waId,
      direction: "outbound",
      content_text: messageText,
      status: "sent",
    },
  ]);

  await safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "outbound",
      message_direction: "outbound",
      type: "outbound",
      message: messageText,
      body: messageText,
      content: messageText,
      text: messageText,
      content_text: messageText,
      sender: "SALES AI",
      sender_name: "SALES AI",
      to: waId,
      to_number: waId,
      whatsapp_message_id: whatsappMessageId,
      external_message_id: whatsappMessageId,
      raw_message: rawResponse,
      is_from_customer: false,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "outbound",
      content_text: messageText,
      sender: "SALES AI",
      created_at: now,
    },
    {
      brand_name: brandName,
      lead_id: leadId,
      message: messageText,
      direction: "outbound",
      created_at: now,
    },
  ]);
}

async function safeInsertWithFallback(tableName: string, payloads: any[]) {
  for (const payload of payloads) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(payload)
        .select("*")
        .maybeSingle();

      if (!error) {
        return data;
      }

      console.warn(`${tableName} insert fallback:`, error.message);
    } catch (error: any) {
      console.warn(`${tableName} insert exception:`, error?.message);
    }
  }

  return null;
}

async function safeUpdateById(tableName: string, id: string, payloads: any[]) {
  for (const payload of payloads) {
    try {
      const { error } = await supabase
        .from(tableName)
        .update(payload)
        .eq("id", id);

      if (!error) return true;

      console.warn(`${tableName} update fallback:`, error.message);
    } catch (error: any) {
      console.warn(`${tableName} update exception:`, error?.message);
    }
  }

  return false;
}
function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validateWebhookSignature(request: NextRequest, rawBody: string) {
  if (!webhookAppSecret) {
    if (enforceWebhookSignature) {
      console.error(
        "WHATSAPP WEBHOOK ERROR: WHATSAPP_ENFORCE_SIGNATURE=true pero falta META_APP_SECRET o WHATSAPP_APP_SECRET."
      );

      return {
        ok: false,
        status: 500,
        error:
          "Webhook sin app secret configurado. Falta META_APP_SECRET o WHATSAPP_APP_SECRET.",
      };
    }

    console.warn(
      "WHATSAPP WEBHOOK WARNING: firma de Meta no validada porque no hay META_APP_SECRET/WHATSAPP_APP_SECRET configurado."
    );

    return {
      ok: true,
      status: 200,
      error: null,
    };
  }

  const signature =
    request.headers.get("x-hub-signature-256") ||
    request.headers.get("X-Hub-Signature-256") ||
    "";

  if (!signature || !signature.startsWith("sha256=")) {
    return {
      ok: false,
      status: 403,
      error: "Firma de Meta faltante o inválida.",
    };
  }

  const expectedSignature = `sha256=${createHmac("sha256", webhookAppSecret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return {
      ok: false,
      status: 403,
      error: "Firma de Meta inválida.",
    };
  }

  const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);

  if (!isValid) {
    return {
      ok: false,
      status: 403,
      error: "Firma de Meta inválida.",
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
  };
}

function formatBrandSlug(value: string) {
  return String(value || "brand-os")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type LeadAnalysis = {
  intent: string;
  closeProbability: number;
  temperature: string;
  mainObjection: string;
  requiresHuman: boolean;
  isQualified: boolean;
  aiSummary: string;
  nextAction: string;
  recommendedReply: string;
  confidenceScore: number;
  decisionReason: string;
};

function analyzeInboundMessage(text: string): LeadAnalysis {
  const clean = cleanText(text);
  const value = clean.toLowerCase();

  const intent = inferIntent(value);
  const closeProbability = inferCloseProbability(value);
  const temperature = inferTemperature(closeProbability);
  const mainObjection = inferMainObjection(value);
  const requiresHuman = inferRequiresHuman(value);
  const isQualified = closeProbability >= 65;
  const recommendedReply = buildSuggestedReply(intent);

  return {
    intent,
    closeProbability,
    temperature,
    mainObjection,
    requiresHuman,
    isQualified,
    aiSummary: clean
      ? `Mensaje recibido por WhatsApp: "${truncateText(clean, 140)}"`
      : "Mensaje recibido por WhatsApp.",
    nextAction: requiresHuman
      ? "Revisar y responder con validación humana"
      : "Responder desde Sales AI",
    recommendedReply,
    confidenceScore: Math.max(55, Math.min(95, closeProbability + 18)),
    decisionReason:
      "Análisis inicial automático basado en palabras clave del mensaje entrante de WhatsApp.",
  };
}

function inferIntent(value: string) {
  if (
    value.includes("precio") ||
    value.includes("cuánto") ||
    value.includes("cuanto") ||
    value.includes("costo")
  ) {
    return "Precio";
  }

  if (
    value.includes("información") ||
    value.includes("informacion") ||
    value.includes("info")
  ) {
    return "Información";
  }

  if (
    value.includes("comprar") ||
    value.includes("pedido") ||
    value.includes("quiero")
  ) {
    return "Compra";
  }

  if (value.includes("envío") || value.includes("envio")) {
    return "Envío";
  }

  return "WhatsApp entrante";
}

function inferCloseProbability(value: string) {
  let score = 35;

  if (value.includes("precio") || value.includes("costo")) score += 20;
  if (value.includes("quiero")) score += 18;
  if (value.includes("comprar") || value.includes("pedido")) score += 25;
  if (value.includes("hoy") || value.includes("urgente")) score += 10;
  if (value.includes("no se cuanto") || value.includes("no sé cuánto")) {
    score -= 8;
  }

  return clamp(score, 0, 100);
}

function inferRequiresHuman(value: string) {
  return (
    value.includes("pagar") ||
    value.includes("transferencia") ||
    value.includes("factura") ||
    value.includes("urgente") ||
    value.includes("mayoreo") ||
    value.includes("pedido")
  );
}

function inferMainObjection(value: string) {
  if (value.includes("no se cuanto") || value.includes("no sé cuánto")) {
    return "No sabe cuánto necesita";
  }

  if (value.includes("precio") || value.includes("costo")) {
    return "Quiere conocer precio";
  }

  if (value.includes("envío") || value.includes("envio")) {
    return "Pregunta por envío";
  }

  return "Sin objeción detectada";
}

function buildSuggestedReply(intent: string) {
  if (intent === "Precio") {
    return "Claro, con gusto te comparto información. Para darte una recomendación más exacta, ¿qué estás buscando y aproximadamente cuántas piezas o qué tipo de solución necesitas?";
  }

  if (intent === "Compra") {
    return "Perfecto, te ayudo. Para avanzar, compárteme qué producto o servicio te interesa y algunos datos básicos para orientarte mejor.";
  }

  if (intent === "Envío") {
    return "Claro. Para revisar opciones de envío o cobertura, ¿me puedes compartir tu ciudad o ubicación?";
  }

  return "Hola, gracias por escribirnos. Con gusto te damos información. ¿Qué estás buscando o qué necesitas resolver?";
}

function inferTemperature(closeProbability: number) {
  if (closeProbability >= 75) return "Caliente";
  if (closeProbability >= 45) return "Tibio";
  return "Frío";
}

function extractMessageContent(message: any) {
  const type = message?.type;

  if (type === "text") {
    return message?.text?.body || "";
  }

  if (type === "button") {
    return message?.button?.text || message?.button?.payload || "[botón]";
  }

  if (type === "interactive") {
    return (
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      "[respuesta interactiva]"
    );
  }

  if (type === "image") {
    return message?.image?.caption || "[imagen]";
  }

  if (type === "video") {
    return message?.video?.caption || "[video]";
  }

  if (type === "audio") {
    return "[audio]";
  }

  if (type === "document") {
    return (
      message?.document?.caption ||
      message?.document?.filename ||
      "[documento]"
    );
  }

  if (type === "sticker") {
    return "[sticker]";
  }

  if (type === "location") {
    return "[ubicación]";
  }

  if (type === "contacts") {
    return "[contacto compartido]";
  }

  return `[${type || "mensaje"}]`;
}

function buildIncomingContactsByWaId(contacts: any[]) {
  const grouped: Record<string, any> = {};

  for (const contact of contacts) {
    const waId = String(contact?.wa_id || "").trim();

    if (!waId) continue;

    grouped[waId] = contact;
  }

  return grouped;
}

function unixTimestampToIso(value: string | null) {
  const timestamp = Number(value);

  if (!timestamp || Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

function cleanText(value: any) {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function cleanPhone(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength)}...`;
}

function formatBrandName(slug: string) {
  return String(slug || "Brand OS")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getBaseUrl(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}