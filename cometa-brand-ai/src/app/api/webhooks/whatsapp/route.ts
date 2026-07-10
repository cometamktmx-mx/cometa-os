import {
  createDecipheriv,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

const automaticMinConfidence = normalizeEnvNumber(
  process.env.SALES_AI_AUTOMATIC_MIN_CONFIDENCE,
  75
);

const automaticCooldownSeconds = normalizeEnvNumber(
  process.env.SALES_AI_AUTOMATIC_COOLDOWN_SECONDS,
  90
);

const automaticMaxReplyChars = normalizeEnvNumber(
  process.env.SALES_AI_AUTOMATIC_MAX_REPLY_CHARS,
  900
);

const riskyAutomaticKeywords = [
  "pago",
  "pagar",
  "pagarte",
  "transferencia",
  "deposito",
  "depósito",
  "comprobante",
  "factura",
  "facturación",
  "garantía",
  "garantia",
  "devolución",
  "devolucion",
  "reembolso",
  "cancelar",
  "cancelación",
  "cancelacion",
  "queja",
  "reclamo",
  "descuento",
  "rebaja",
  "urgente",
  "mayoreo grande",
  "pedido grande",
  "stock exacto",
  "existencia exacta",
];

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type AutomaticSafetyResult = {
  ok: boolean;
  reasons: string[];
  context: Record<string, any>;
};

type WebhookBrand = {
  slug: string;
  name: string;
};

type WhatsappConnection = {
  id: string;
  brandSlug: string;
  brandName: string;
  businessName: string;
  clientId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  connectionStatus: string;
  webhookStatus: string;
  receiveEnabled: boolean;
  agentEnabled: boolean;
  allowRealSend: boolean;
  tokenSource: string;
  legacyAccessToken: string | null;
  accessTokenCiphertext: string | null;
  accessTokenIv: string | null;
  accessTokenAuthTag: string | null;
  tokenExpiresAt: string | null;
};

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

    let responseBrand: WebhookBrand | null = null;
    let responseConnectionId: string | null = null;
    let processedMessages = 0;
    let processedStatuses = 0;
    let skippedDuplicateMessages = 0;
    let createdOrUpdatedLeads = 0;
    let createdSalesMessages = 0;
    let createdAgentRuns = 0;
    let sentWhatsappMessages = 0;
    let failedWhatsappMessages = 0;
    let blockedAutomaticMessages = 0;
    let unmatchedConnectionEvents = 0;
    let blockedInboundMessages = 0;
    let skippedAgentMessages = 0;

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value || {};
        const metadata = value?.metadata || {};

        const phoneNumberId = cleanText(metadata?.phone_number_id) || null;
        const displayPhoneNumber =
          cleanText(metadata?.display_phone_number) || null;

        const connection = await resolveWhatsappConnection({
          phoneNumberId,
          displayPhoneNumber,
        });

        if (!connection) {
          unmatchedConnectionEvents += 1;

          await saveUnmatchedWebhookEvent({
            phoneNumberId,
            displayPhoneNumber,
            reason: phoneNumberId
              ? "phone_number_id_not_registered"
              : "missing_phone_number_id",
            payload: {
              object: body?.object || null,
              entry_id: entry?.id || null,
              field: change?.field || null,
              change,
            },
          });

          console.warn("WhatsApp webhook sin conexión registrada:", {
            phoneNumberId,
            displayPhoneNumber,
            entryId: entry?.id || null,
            field: change?.field || null,
          });

          continue;
        }

        const brand: WebhookBrand = {
          slug: connection.brandSlug,
          name: connection.brandName,
        };

        responseBrand = brand;
        responseConnectionId = connection.id;

        await saveWebhookEvent({
          connectionId: connection.id,
          brandSlug: brand.slug,
          payload: body,
        });

        await touchWhatsappConnection(connection.id, {
          last_webhook_at: new Date().toISOString(),
          webhook_status: "active",
          last_error_code: null,
          last_error: null,
        });

        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

        const contactsByWaId = buildIncomingContactsByWaId(contacts);

        const canReceiveInbound =
          connection.receiveEnabled &&
          connection.connectionStatus !== "revoked";

        if (canReceiveInbound) {
          for (const contact of contacts) {
            const waId = String(contact?.wa_id || "").trim();

            if (!waId) continue;

            await supabase.from("whatsapp_contacts").upsert(
              {
                connection_id: connection.id,
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
        }

        for (const message of messages) {
          const messageId = String(message?.id || "").trim();
          const waId = String(message?.from || "").trim();

          if (!messageId || !waId) continue;

          if (!canReceiveInbound) {
            blockedInboundMessages += 1;

            console.warn("Mensaje entrante bloqueado por conexión:", {
              connectionId: connection.id,
              brandSlug: brand.slug,
              connectionStatus: connection.connectionStatus,
              receiveEnabled: connection.receiveEnabled,
              messageId,
              waId,
            });

            continue;
          }

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
              connection_id: connection.id,
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
              connection_id: connection.id,
              brand_slug: brand.slug,
              message_id: messageId,
              wa_id: waId,
              phone_number_id: connection.phoneNumberId,
              display_phone_number:
                displayPhoneNumber || connection.displayPhoneNumber,
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

          await touchWhatsappConnection(connection.id, {
            last_inbound_at: timestampIso,
          });

          const alreadyProcessedSalesMessage =
            await hasProcessedSalesMessage(messageId);

          if (alreadyProcessedSalesMessage) {
            skippedDuplicateMessages += 1;

            console.log("WhatsApp message duplicado. Se evita doble agente:", {
              connectionId: connection.id,
              brandName: brand.name,
              brandSlug: brand.slug,
              messageId,
              waId,
            });

            continue;
          }

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

          if (!leadId) {
            continue;
          }

          createdOrUpdatedLeads += 1;

          const salesMessageOk = await createSalesMessage({
            brandName: brand.name,
            brandSlug: brand.slug,
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

          const connectionAllowsAgent =
            connection.agentEnabled &&
            connection.connectionStatus === "active";

          if (!connectionAllowsAgent) {
            skippedAgentMessages += 1;

            console.log("SALES AI no ejecutado por control de conexión:", {
              connectionId: connection.id,
              brandSlug: brand.slug,
              connectionStatus: connection.connectionStatus,
              agentEnabled: connection.agentEnabled,
              leadId,
              messageId,
            });

            continue;
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

          if (!agentResult?.success) {
            continue;
          }

          createdAgentRuns += 1;

          const envAllowsWhatsappSend =
            process.env.SALES_AI_SEND_WHATSAPP_ENABLED === "true";

          const settingsAllowWhatsappSend =
            canSendRealWhatsapp(runtimeSettings);

          const agentReply =
            typeof agentResult.decision?.agent_reply === "string"
              ? agentResult.decision.agent_reply.trim()
              : "";

          const automaticSafety = await evaluateAutomaticWhatsappSafety({
            connection,
            brandSlug: brand.slug,
            brandName: brand.name,
            leadId,
            waId,
            incomingText: contentText,
            agentReply,
            agentResult,
            runtimeSettings,
            envAllowsWhatsappSend,
            settingsAllowWhatsappSend,
          });

          const shouldSendRealWhatsapp = automaticSafety.ok;

          if (
            !shouldSendRealWhatsapp &&
            agentResult.shouldSendWhatsapp === true
          ) {
            blockedAutomaticMessages += 1;

            console.log("SALES AI WhatsApp automático bloqueado:", {
              connectionId: connection.id,
              brandName: brand.name,
              brandSlug: brand.slug,
              leadId,
              waId,
              reasons: automaticSafety.reasons,
              context: automaticSafety.context,
            });

            if (agentResult.runId) {
              await safeUpdateById("sales_agent_runs", agentResult.runId, [
                {
                  action_status: "whatsapp_send_blocked",
                  execution_error: `Bloqueado por seguridad automática: ${automaticSafety.reasons.join(
                    ", "
                  )}`,
                },
                {
                  action_status: "whatsapp_send_blocked",
                },
              ]);
            }
          }

          if (shouldSendRealWhatsapp) {
            const whatsappSendResult = await sendWhatsappTextMessage({
              connection,
              to: waId,
              message: agentReply,
            });

            if (whatsappSendResult.ok) {
              sentWhatsappMessages += 1;

              await saveOutboundWhatsappMessage({
                connectionId: connection.id,
                brandSlug: brand.slug,
                brandName: brand.name,
                leadId,
                waId,
                phoneNumberId: connection.phoneNumberId,
                displayPhoneNumber:
                  displayPhoneNumber || connection.displayPhoneNumber,
                messageText: agentReply,
                whatsappMessageId: whatsappSendResult.whatsappMessageId,
                rawResponse: whatsappSendResult.data,
              });

              await touchWhatsappConnection(connection.id, {
                last_outbound_at: new Date().toISOString(),
                last_error_code: null,
                last_error: null,
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

              await touchWhatsappConnection(connection.id, {
                last_error_code:
                  whatsappSendResult.errorCode || "whatsapp_send_failed",
                last_error: whatsappSendResult.error,
              });

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

        for (const status of statuses) {
          const messageId = status?.id ? String(status.id) : null;
          const timestampText = status?.timestamp
            ? String(status.timestamp)
            : null;

          await supabase.from("whatsapp_message_statuses").insert({
            connection_id: connection.id,
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
      connectionId: responseConnectionId,
      brand: responseBrand,
      processed: {
        messages: processedMessages,
        statuses: processedStatuses,
        skippedDuplicateMessages,
        leads: createdOrUpdatedLeads,
        salesMessages: createdSalesMessages,
        agentRuns: createdAgentRuns,
        sentWhatsappMessages,
        failedWhatsappMessages,
        blockedAutomaticMessages,
        unmatchedConnectionEvents,
        blockedInboundMessages,
        skippedAgentMessages,
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

async function resolveWhatsappConnection({
  phoneNumberId,
  displayPhoneNumber,
}: {
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
}): Promise<WhatsappConnection | null> {
  const normalizedPhoneNumberId = cleanText(phoneNumberId);
  const normalizedDisplayPhoneNumber = cleanText(displayPhoneNumber);

  const selectColumns = [
    "id",
    "client_id",
    "business_name",
    "phone_number",
    "phone_number_id",
    "whatsapp_business_account_id",
    "access_token",
    "brand_slug",
    "brand_name",
    "waba_id",
    "display_phone_number",
    "connection_status",
    "webhook_status",
    "receive_enabled",
    "agent_enabled",
    "allow_real_send",
    "token_source",
    "access_token_ciphertext",
    "access_token_iv",
    "access_token_auth_tag",
    "token_expires_at",
  ].join(",");

  try {
    if (normalizedPhoneNumberId) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select(selectColumns)
        .eq("phone_number_id", normalizedPhoneNumberId)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(
          "resolveWhatsappConnection por phone_number_id:",
          error.message
        );
      }

      const connection = mapWhatsappConnection(data);

      if (connection) {
        return connection;
      }
    }

    if (normalizedDisplayPhoneNumber) {
      const { data: byDisplayPhone, error: displayPhoneError } = await supabase
        .from("whatsapp_connections")
        .select(selectColumns)
        .eq("display_phone_number", normalizedDisplayPhoneNumber)
        .limit(2);

      if (displayPhoneError) {
        console.warn(
          "resolveWhatsappConnection por display_phone_number:",
          displayPhoneError.message
        );
      }

      if (Array.isArray(byDisplayPhone) && byDisplayPhone.length === 1) {
        const connection = mapWhatsappConnection(byDisplayPhone[0]);

        if (connection) {
          return connection;
        }
      }

      const { data: byLegacyPhone, error: legacyPhoneError } = await supabase
        .from("whatsapp_connections")
        .select(selectColumns)
        .eq("phone_number", normalizedDisplayPhoneNumber)
        .limit(2);

      if (legacyPhoneError) {
        console.warn(
          "resolveWhatsappConnection por phone_number legado:",
          legacyPhoneError.message
        );
      }

      if (Array.isArray(byLegacyPhone) && byLegacyPhone.length === 1) {
        const connection = mapWhatsappConnection(byLegacyPhone[0]);

        if (connection) {
          return connection;
        }
      }

      const normalizedDigits = cleanPhone(normalizedDisplayPhoneNumber);

      if (normalizedDigits) {
        const { data: candidates, error: candidatesError } = await supabase
          .from("whatsapp_connections")
          .select(selectColumns)
          .limit(500);

        if (candidatesError) {
          console.warn(
            "resolveWhatsappConnection candidatos:",
            candidatesError.message
          );
        }

        const matches = Array.isArray(candidates)
          ? candidates.filter((candidate: any) => {
              const candidatePhones = [
                candidate?.display_phone_number,
                candidate?.phone_number,
              ]
                .map(cleanPhone)
                .filter(Boolean);

              return candidatePhones.includes(normalizedDigits);
            })
          : [];

        if (matches.length === 1) {
          const connection = mapWhatsappConnection(matches[0]);

          if (connection) {
            return connection;
          }
        }
      }
    }
  } catch (error: any) {
    console.error(
      "resolveWhatsappConnection exception:",
      error?.message || error
    );
  }

  return null;
}

function mapWhatsappConnection(row: any): WhatsappConnection | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const id = cleanText(row.id);
  const phoneNumberId = cleanText(row.phone_number_id);
  const businessName = cleanText(row.business_name);
  const brandName = cleanText(row.brand_name) || businessName;
  const brandSlug =
    cleanText(row.brand_slug) || (brandName ? formatBrandSlug(brandName) : "");

  if (!id || !phoneNumberId || !brandName || !brandSlug) {
    console.warn("Conexión de WhatsApp incompleta. No se utilizará:", {
      id: id || null,
      phoneNumberId: phoneNumberId || null,
      brandName: brandName || null,
      brandSlug: brandSlug || null,
    });

    return null;
  }

  return {
    id,
    brandSlug,
    brandName,
    businessName: businessName || brandName,
    clientId: cleanText(row.client_id) || null,
    phoneNumberId,
    displayPhoneNumber:
      cleanText(row.display_phone_number || row.phone_number) || null,
    wabaId:
      cleanText(row.waba_id || row.whatsapp_business_account_id) || null,
    connectionStatus: cleanText(
      row.connection_status || row.status || "pending_review"
    ).toLowerCase(),
    webhookStatus: cleanText(row.webhook_status || "pending").toLowerCase(),
    receiveEnabled: row.receive_enabled !== false,
    agentEnabled: row.agent_enabled === true,
    allowRealSend: row.allow_real_send === true,
    tokenSource: cleanText(row.token_source || "legacy_env").toLowerCase(),
    legacyAccessToken: cleanText(row.access_token) || null,
    accessTokenCiphertext: cleanText(row.access_token_ciphertext) || null,
    accessTokenIv: cleanText(row.access_token_iv) || null,
    accessTokenAuthTag: cleanText(row.access_token_auth_tag) || null,
    tokenExpiresAt: cleanText(row.token_expires_at) || null,
  };
}

async function saveWebhookEvent({
  connectionId,
  brandSlug,
  payload,
}: {
  connectionId: string;
  brandSlug: string;
  payload: any;
}) {
  const { error } = await supabase.from("whatsapp_webhook_events").insert({
    id: randomUUID(),
    connection_id: connectionId,
    brand_slug: brandSlug,
    event_type: "whatsapp_webhook",
    payload,
  });

  if (error) {
    console.warn("No se pudo guardar whatsapp_webhook_events:", error.message);
  }
}

async function saveUnmatchedWebhookEvent({
  phoneNumberId,
  displayPhoneNumber,
  reason,
  payload,
}: {
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  reason: string;
  payload: any;
}) {
  const { error } = await supabase.from("whatsapp_unmatched_events").insert({
    id: randomUUID(),
    phone_number_id: phoneNumberId,
    display_phone_number: displayPhoneNumber,
    event_type: "unknown_connection",
    reason,
    payload,
  });

  if (error) {
    console.warn("No se pudo guardar whatsapp_unmatched_events:", error.message);
  }
}

async function touchWhatsappConnection(
  connectionId: string,
  payload: Record<string, any>
) {
  try {
    const { error } = await supabase
      .from("whatsapp_connections")
      .update(payload)
      .eq("id", connectionId);

    if (error) {
      console.warn("touchWhatsappConnection:", error.message);
      return false;
    }

    return true;
  } catch (error: any) {
    console.warn("touchWhatsappConnection exception:", error?.message);
    return false;
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
  const existingLead = await findExistingSalesLead(
    brandSlug,
    brandName,
    waId
  );

  if (existingLead?.id) {
    await safeUpdateById("sales_leads", existingLead.id, [
      {
        brand_slug: brandSlug,
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
      tags: ["whatsapp", "cometa-os"],
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
      tags: ["whatsapp", "cometa-os"],
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

async function findExistingSalesLead(
  brandSlug: string,
  brandName: string,
  waId: string
) {
  const targetPhone = cleanPhone(waId);

  try {
    const { data, error } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("brand_slug", brandSlug)
      .limit(1000);

    if (!error && Array.isArray(data)) {
      const matchingLead = data.find((lead: any) => {
        const phones = [
          lead.phone,
          lead.contact_phone,
          lead.whatsapp,
          lead.whatsapp_number,
          lead.from_number,
        ].map(cleanPhone);

        return phones.includes(targetPhone);
      });

      if (matchingLead) {
        return matchingLead;
      }
    }

    if (error) {
      console.warn("findExistingSalesLead por brand_slug:", error.message);
    }
  } catch (error: any) {
    console.warn(
      "findExistingSalesLead brand_slug exception:",
      error?.message
    );
  }

  try {
    const { data, error } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("brand_name", brandName)
      .limit(1000);

    if (error || !Array.isArray(data)) {
      if (error) {
        console.warn("findExistingSalesLead por brand_name:", error.message);
      }

      return null;
    }

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
  brandSlug,
  leadId,
  waId,
  contactName,
  messageId,
  contentText,
  timestampIso,
  rawMessage,
}: {
  brandName: string;
  brandSlug: string;
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
      brand_slug: brandSlug,
      lead_id: leadId,
      direction: "inbound",
      message_direction: "inbound",
      type: "inbound",
      message: contentText,
      message_text: contentText,
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
      message_text: contentText,
      content_text: contentText,
      sender: contactName,
      created_at: timestampIso,
    },
    {
      brand_name: brandName,
      lead_id: leadId,
      message_text: contentText,
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

async function evaluateAutomaticWhatsappSafety({
  connection,
  brandSlug,
  brandName,
  leadId,
  waId,
  incomingText,
  agentReply,
  agentResult,
  runtimeSettings,
  envAllowsWhatsappSend,
  settingsAllowWhatsappSend,
}: {
  connection: WhatsappConnection;
  brandSlug: string;
  brandName: string;
  leadId: string;
  waId: string;
  incomingText: string;
  agentReply: string;
  agentResult: any;
  runtimeSettings: any;
  envAllowsWhatsappSend: boolean;
  settingsAllowWhatsappSend: boolean;
}): Promise<AutomaticSafetyResult> {
  const reasons: string[] = [];
  const decision = agentResult?.decision || {};

  const action = cleanText(decision.action);
  const riskLevel = cleanText(decision.risk_level || "low").toLowerCase();
  const confidenceScore = Number(decision.confidence_score || 0);
  const requiresHuman = decision.requires_human === true;
  const shouldSendWhatsapp = agentResult?.shouldSendWhatsapp === true;

  if (!shouldSendWhatsapp) {
    reasons.push("agent_result_should_send_whatsapp=false");
  }

  if (!envAllowsWhatsappSend) {
    reasons.push("env_sales_ai_send_whatsapp_enabled=false");
  }

  if (!settingsAllowWhatsappSend) {
    reasons.push(
      `settings_blocked=${explainWhatsappSendLock(runtimeSettings).join("|")}`
    );
  }

  if (connection.connectionStatus !== "active") {
    reasons.push(`connection_status=${connection.connectionStatus}`);
  }

  if (!connection.agentEnabled) {
    reasons.push("connection_agent_enabled=false");
  }

  if (!connection.allowRealSend) {
    reasons.push("connection_allow_real_send=false");
  }

  if (!connection.phoneNumberId) {
    reasons.push("missing_phone_number_id");
  }

  if (!agentReply) {
    reasons.push("missing_agent_reply");
  }

  if (agentReply.length > automaticMaxReplyChars) {
    reasons.push(`agent_reply_too_long=${agentReply.length}`);
  }

  if (action !== "send_reply") {
    reasons.push(`action=${action || "empty"}`);
  }

  if (requiresHuman) {
    reasons.push("requires_human=true");
  }

  if (riskLevel !== "low") {
    reasons.push(`risk_level=${riskLevel}`);
  }

  if (confidenceScore < automaticMinConfidence) {
    reasons.push(`confidence_score=${confidenceScore}`);
  }

  if (isNonTextPlaceholder(incomingText)) {
    reasons.push("non_text_message_requires_human_review");
  }

  const riskyIncomingKeyword = findRiskyKeyword(incomingText);
  const riskyReplyKeyword = findRiskyKeyword(agentReply);

  if (riskyIncomingKeyword) {
    reasons.push(`risky_incoming_keyword=${riskyIncomingKeyword}`);
  }

  if (riskyReplyKeyword) {
    reasons.push(`risky_reply_keyword=${riskyReplyKeyword}`);
  }

  const recentOutbound = await getRecentOutboundMessage({
    brandSlug,
    brandName,
    leadId,
    waId,
  });

  if (recentOutbound?.createdAt) {
    const secondsSinceLastOutbound = Math.floor(
      (Date.now() - new Date(recentOutbound.createdAt).getTime()) / 1000
    );

    if (
      Number.isFinite(secondsSinceLastOutbound) &&
      secondsSinceLastOutbound >= 0 &&
      secondsSinceLastOutbound < automaticCooldownSeconds
    ) {
      reasons.push(`cooldown_active=${secondsSinceLastOutbound}s`);
    }

    const previousText = cleanText(recentOutbound.messageText).toLowerCase();
    const nextText = cleanText(agentReply).toLowerCase();

    if (previousText && nextText && previousText === nextText) {
      reasons.push("duplicate_agent_reply");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    context: {
      connectionId: connection.id,
      connectionStatus: connection.connectionStatus,
      webhookStatus: connection.webhookStatus,
      connectionAgentEnabled: connection.agentEnabled,
      connectionAllowRealSend: connection.allowRealSend,
      tokenSource: connection.tokenSource,
      brandSlug,
      brandName,
      leadId,
      waId,
      action,
      riskLevel,
      confidenceScore,
      requiresHuman,
      automaticMinConfidence,
      automaticCooldownSeconds,
      automaticMaxReplyChars,
      envAllowsWhatsappSend,
      settingsAllowWhatsappSend,
      whatsappStatus: runtimeSettings?.whatsapp_status,
      agentMode: runtimeSettings?.agent_mode,
      autoReplyEnabled: runtimeSettings?.auto_reply_enabled,
      sendWhatsappEnabled: runtimeSettings?.send_whatsapp_enabled,
      recentOutbound,
    },
  };
}

async function getRecentOutboundMessage({
  brandSlug,
  brandName,
  leadId,
  waId,
}: {
  brandSlug: string;
  brandName: string;
  leadId: string;
  waId: string;
}) {
  try {
    const { data, error } = await supabase
      .from("sales_messages")
      .select("*")
      .eq("lead_id", leadId)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        source: "sales_messages",
        id: data.id || null,
        createdAt: data.created_at || null,
        messageText:
          data.message_text ||
          data.content_text ||
          data.message ||
          data.body ||
          data.text ||
          "",
      };
    }
  } catch (error: any) {
    console.warn("getRecentOutboundMessage sales_messages:", error?.message);
  }

  try {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("brand_slug", brandSlug)
      .eq("wa_id", waId)
      .eq("direction", "outbound")
      .order("timestamp_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        source: "whatsapp_messages",
        id: data.id || data.message_id || null,
        createdAt: data.timestamp_at || data.created_at || null,
        messageText: data.content_text || data.message_text || "",
      };
    }
  } catch (error: any) {
    console.warn("getRecentOutboundMessage whatsapp_messages:", error?.message);
  }

  return null;
}

async function hasProcessedSalesMessage(messageId: string) {
  try {
    const { data: byWhatsappId, error: whatsappIdError } = await supabase
      .from("sales_messages")
      .select("id")
      .eq("whatsapp_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (!whatsappIdError && byWhatsappId?.id) {
      return true;
    }
  } catch {}

  try {
    const { data: byExternalId, error: externalIdError } = await supabase
      .from("sales_messages")
      .select("id")
      .eq("external_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (!externalIdError && byExternalId?.id) {
      return true;
    }
  } catch {}

  return false;
}

async function sendWhatsappTextMessage({
  connection,
  to,
  message,
}: {
  connection: WhatsappConnection;
  to: string;
  message: string;
}) {
  if (connection.connectionStatus !== "active") {
    return {
      ok: false,
      errorCode: "connection_not_active",
      error: `La conexión ${connection.id} no está activa. Estado: ${connection.connectionStatus}`,
    };
  }

  if (!connection.allowRealSend) {
    return {
      ok: false,
      errorCode: "real_send_disabled",
      error: "El envío real está desactivado para esta conexión.",
    };
  }

  if (!connection.phoneNumberId) {
    return {
      ok: false,
      errorCode: "missing_phone_number_id",
      error: "Falta phoneNumberId para enviar WhatsApp.",
    };
  }

  const tokenResult = resolveConnectionAccessToken(connection);

  if (!tokenResult.ok) {
    return {
      ok: false,
      errorCode: tokenResult.errorCode,
      error: tokenResult.error,
    };
  }

  const graphApiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION ||
    process.env.META_GRAPH_API_VERSION ||
    "v25.0";

  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphApiVersion}/${connection.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
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
        errorCode: cleanText(data?.error?.code) || "meta_api_error",
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
      errorCode: "whatsapp_fetch_error",
      error: error?.message || String(error),
    };
  }
}

function resolveConnectionAccessToken(connection: WhatsappConnection):
  | {
      ok: true;
      accessToken: string;
    }
  | {
      ok: false;
      errorCode: string;
      error: string;
    } {
  if (connection.tokenExpiresAt) {
    const expirationTime = new Date(connection.tokenExpiresAt).getTime();

    if (Number.isFinite(expirationTime) && expirationTime <= Date.now()) {
      return {
        ok: false,
        errorCode: "access_token_expired",
        error: "El token de WhatsApp de esta conexión está vencido.",
      };
    }
  }

  if (connection.tokenSource === "encrypted_db") {
    try {
      const accessToken = decryptConnectionAccessToken(connection);

      if (!accessToken) {
        return {
          ok: false,
          errorCode: "encrypted_token_empty",
          error: "El token cifrado de la conexión está vacío.",
        };
      }

      return {
        ok: true,
        accessToken,
      };
    } catch (error: any) {
      return {
        ok: false,
        errorCode: "encrypted_token_decryption_failed",
        error:
          error?.message || "No se pudo descifrar el token de la conexión.",
      };
    }
  }

  if (connection.tokenSource === "system_user") {
    const systemUserToken =
      process.env.WHATSAPP_SYSTEM_USER_ACCESS_TOKEN?.trim() ||
      process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim() ||
      "";

    if (!systemUserToken) {
      return {
        ok: false,
        errorCode: "missing_system_user_token",
        error:
          "La conexión usa system_user, pero falta WHATSAPP_SYSTEM_USER_ACCESS_TOKEN.",
      };
    }

    return {
      ok: true,
      accessToken: systemUserToken,
    };
  }

  if (connection.tokenSource === "legacy_env") {
    const legacyEnvToken =
      process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
      process.env.META_WHATSAPP_TOKEN?.trim() ||
      connection.legacyAccessToken ||
      "";

    if (!legacyEnvToken) {
      return {
        ok: false,
        errorCode: "missing_legacy_access_token",
        error:
          "Falta WHATSAPP_ACCESS_TOKEN o META_WHATSAPP_TOKEN para la conexión legacy_env.",
      };
    }

    return {
      ok: true,
      accessToken: legacyEnvToken,
    };
  }

  return {
    ok: false,
    errorCode: "unsupported_token_source",
    error: `token_source no soportado: ${connection.tokenSource || "vacío"}`,
  };
}

function decryptConnectionAccessToken(connection: WhatsappConnection) {
  const encryptionKey = getWhatsappTokenEncryptionKey();

  if (!connection.accessTokenCiphertext) {
    throw new Error("Falta access_token_ciphertext.");
  }

  if (!connection.accessTokenIv) {
    throw new Error("Falta access_token_iv.");
  }

  if (!connection.accessTokenAuthTag) {
    throw new Error("Falta access_token_auth_tag.");
  }

  const iv = decodeStoredBuffer(connection.accessTokenIv);
  const authTag = decodeStoredBuffer(connection.accessTokenAuthTag);
  const ciphertext = decodeStoredBuffer(connection.accessTokenCiphertext);

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8").trim();
}

function getWhatsappTokenEncryptionKey() {
  const rawKey =
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.COMETA_ENCRYPTION_KEY?.trim() ||
    "";

  if (!rawKey) {
    throw new Error(
      "Falta WHATSAPP_TOKEN_ENCRYPTION_KEY para descifrar tokens de WhatsApp."
    );
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  try {
    const base64Key = Buffer.from(rawKey, "base64");

    if (base64Key.length === 32) {
      return base64Key;
    }
  } catch {}

  const utf8Key = Buffer.from(rawKey, "utf8");

  if (utf8Key.length === 32) {
    return utf8Key;
  }

  throw new Error(
    "WHATSAPP_TOKEN_ENCRYPTION_KEY debe representar exactamente 32 bytes."
  );
}

function decodeStoredBuffer(value: string) {
  const clean = cleanText(value);

  if (!clean) {
    return Buffer.alloc(0);
  }

  if (/^[a-f0-9]+$/i.test(clean) && clean.length % 2 === 0) {
    return Buffer.from(clean, "hex");
  }

  return Buffer.from(clean, "base64");
}

async function saveOutboundWhatsappMessage({
  connectionId,
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
  connectionId: string;
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
      connection_id: connectionId,
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
      connection_id: connectionId,
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
      brand_slug: brandSlug,
      lead_id: leadId,
      direction: "outbound",
      message_direction: "outbound",
      type: "outbound",
      message: messageText,
      message_text: messageText,
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
      message_text: messageText,
      content_text: messageText,
      sender: "SALES AI",
      created_at: now,
    },
    {
      brand_name: brandName,
      lead_id: leadId,
      message_text: messageText,
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

function isNonTextPlaceholder(value: string) {
  const clean = cleanText(value);

  return (
    clean.startsWith("[") &&
    clean.endsWith("]") &&
    !clean.includes("respuesta interactiva")
  );
}

function findRiskyKeyword(value: string) {
  const clean = cleanText(value).toLowerCase();

  if (!clean) return null;

  return riskyAutomaticKeywords.find((keyword) => clean.includes(keyword)) || null;
}

function normalizeEnvNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return numberValue;
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