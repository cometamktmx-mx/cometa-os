import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  resolveBrandFromSupabase,
  slugifyBrand,
} from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type UserRole = "admin" | "client";

export async function GET(req: Request) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ver el Inbox.",
        },
        { status: 401 }
      );
    }

    const url = new URL(req.url);

    let brandSlug = url.searchParams.get("brandSlug") || "";
    const brandName = url.searchParams.get("brandName");

    if (!brandSlug && userContext.role === "client") {
      brandSlug = userContext.allowedBrandSlugs[0] || "";
    }

    if (!brandSlug && userContext.role === "admin") {
      brandSlug = "cometa-mkt";
    }

    if (!brandSlug) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se recibió una marca válida para cargar el Inbox.",
        },
        { status: 400 }
      );
    }

    const brand = await resolveBrandFromSupabase(supabase, {
      brandSlug,
      brandName,
    });

    const accessValidation = validateBrandAccess({
      userContext,
      brandSlug: brand.slug,
    });

    if (!accessValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: accessValidation.error,
          user: {
            id: userContext.userId,
            email: userContext.email,
            role: userContext.role,
            isAdmin: userContext.role === "admin",
          },
          requestedBrand: {
            slug: brand.slug,
            name: brand.name,
          },
        },
        { status: 403 }
      );
    }

    const [
      rawLeads,
      rawAgentRuns,
      rawMessages,
      rawOutboundMessages,
      pendingLearning,
      rawWhatsAppContacts,
      rawWhatsAppMessages,
    ] = await Promise.all([
      safeRows("sales_leads", brand.name, 200),
      safeRows("sales_agent_runs", brand.name, 200),
      safeRows("sales_messages", brand.name, 300),
      safeRows("sales_outbound_messages", brand.name, 300),
      safeCount("sales_playbook_suggestions", brand.name, [
        ["status", "pending"],
      ]),
      safeRowsByBrandSlug("whatsapp_contacts", brand.slug, 300),
      safeRowsByBrandSlug("whatsapp_messages", brand.slug, 500),
    ]);

    const salesLeads = normalizeLeads(rawLeads, rawMessages, rawAgentRuns);
    const salesConversations = normalizeMessages(rawMessages);
    const outboundMessages = normalizeMessages(rawOutboundMessages);
    const agentRuns = normalizeAgentRuns(rawAgentRuns);

    const whatsappLeads = normalizeWhatsAppLeads({
      brand,
      contacts: rawWhatsAppContacts,
      messages: rawWhatsAppMessages,
      agentRuns,
    });

    const whatsappConversations = normalizeWhatsAppMessages({
      brand,
      messages: rawWhatsAppMessages,
      contacts: rawWhatsAppContacts,
    });

    const leads = mergeLeadsByPhone([...whatsappLeads, ...salesLeads]);
    const conversations = sortNormalizedMessages([
      ...whatsappConversations,
      ...salesConversations,
    ]);

    const metrics = calculateInboxMetrics({
      leads,
      agentRuns,
      outboundMessages,
      pendingLearning,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        allowedBrandSlugs: userContext.allowedBrandSlugs,
      },
      brand: {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        industry: brand.industry,
        city: brand.city,
        exists: brand.exists,
        sourceTable: brand.sourceTable,
      },
      metrics,
      leads,
      conversations,
      outboundMessages,
      agentRuns,
      whatsapp: {
        contacts: rawWhatsAppContacts.length,
        messages: rawWhatsAppMessages.length,
      },
      links: {
        brandHome: `/brand/${brand.slug}`,
        inbox: `/sales-ai/inbox?brandSlug=${encodeURIComponent(brand.slug)}`,
        knowledge: `/sales-ai/knowledge?brandSlug=${encodeURIComponent(
          brand.slug
        )}`,
        learning: `/sales-ai/learning?brandSlug=${encodeURIComponent(
          brand.slug
        )}`,
        mission: `/cometa-os/design?brandSlug=${encodeURIComponent(
          brand.slug
        )}`,
      },
    });
  } catch (error: any) {
    console.error("inbox-dashboard error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo cargar el Inbox de SALES AI.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

async function getUserContext(): Promise<{
  userId: string | null;
  email: string | null;
  role: UserRole;
  allowedBrandSlugs: string[];
}> {
  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {}
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user) {
    return {
      userId: null,
      email: null,
      role: "client",
      allowedBrandSlugs: [],
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,email,role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("inbox-dashboard profile error:", profileError.message);
  }

  const role: UserRole =
    profile?.role === "admin" && profile?.status === "active"
      ? "admin"
      : "client";

  if (role === "admin") {
    return {
      userId: user.id,
      email: user.email || profile?.email || null,
      role,
      allowedBrandSlugs: [],
    };
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("user_brand_access")
    .select("brand_slug,status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (accessError) {
    console.warn("inbox-dashboard access error:", accessError.message);
  }

  const allowedBrandSlugs = Array.from(
    new Set(
      (accessRows || [])
        .map((row: any) => slugifyBrand(row.brand_slug || ""))
        .filter(Boolean)
    )
  );

  return {
    userId: user.id,
    email: user.email || profile?.email || null,
    role,
    allowedBrandSlugs,
  };
}

function validateBrandAccess({
  userContext,
  brandSlug,
}: {
  userContext: {
    role: UserRole;
    allowedBrandSlugs: string[];
  };
  brandSlug: string;
}) {
  if (userContext.role === "admin") {
    return {
      ok: true,
      error: null,
    };
  }

  const normalizedBrandSlug = slugifyBrand(brandSlug);

  if (userContext.allowedBrandSlugs.includes(normalizedBrandSlug)) {
    return {
      ok: true,
      error: null,
    };
  }

  return {
    ok: false,
    error:
      "No tienes permiso para visualizar este Inbox. Esta marca no está asignada a tu usuario.",
  };
}

async function safeRows(tableName: string, brandName: string, limit = 100) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("brand_name", brandName)
      .limit(limit);

    if (error) {
      console.warn(`inbox-dashboard ${tableName} error:`, error.message);
      return [];
    }

    return Array.isArray(data) ? sortByDate(data) : [];
  } catch (error: any) {
    console.warn(`inbox-dashboard ${tableName} exception:`, error?.message);
    return [];
  }
}

async function safeRowsByBrandSlug(
  tableName: string,
  brandSlug: string,
  limit = 100
) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .eq("brand_slug", brandSlug)
      .limit(limit);

    if (error) {
      console.warn(`inbox-dashboard ${tableName} error:`, error.message);
      return [];
    }

    return Array.isArray(data) ? sortByDate(data) : [];
  } catch (error: any) {
    console.warn(`inbox-dashboard ${tableName} exception:`, error?.message);
    return [];
  }
}

async function safeCount(
  tableName: string,
  brandName: string,
  filters: [string, string | number | boolean][] = []
) {
  try {
    let query = supabase
      .from(tableName)
      .select("id", { count: "exact", head: true })
      .eq("brand_name", brandName);

    for (const [column, value] of filters) {
      query = query.eq(column, value);
    }

    const { count, error } = await query;

    if (error) {
      console.warn(`inbox-dashboard count ${tableName}:`, error.message);
      return 0;
    }

    return count || 0;
  } catch (error: any) {
    console.warn(`inbox-dashboard count ${tableName}:`, error?.message);
    return 0;
  }
}

function normalizeWhatsAppLeads({
  brand,
  contacts,
  messages,
  agentRuns,
}: {
  brand: any;
  contacts: any[];
  messages: any[];
  agentRuns: any[];
}) {
  const contactsByWaId = buildContactsByWaId(contacts);
  const messagesByWaId = groupWhatsAppMessagesByWaId(messages);

  return Object.keys(messagesByWaId).map((waId) => {
    const leadMessages = sortByDate(messagesByWaId[waId] || []);
    const latestMessage = leadMessages[0] || null;
    const contact = contactsByWaId[waId] || {};
    const contentText = cleanText(latestMessage?.content_text);

    const closeProbability = inferWhatsAppCloseProbability(contentText);
    const intent = inferWhatsAppIntent(contentText);
    const requiresHuman = inferRequiresHuman(contentText);
    const temperature = inferTemperature(closeProbability);

    const latestRun = agentRuns.find((run) => {
      const rawPhone = cleanPhone(
        firstValue(run.raw || run, [
          "phone",
          "whatsapp",
          "wa_id",
          "contact_phone",
        ])
      );

      return rawPhone && rawPhone === cleanPhone(waId);
    });

    return {
      id: `wa_${waId}`,
      brandName: brand.name,
      name:
        cleanText(contact.profile_name) ||
        cleanText(contact.name) ||
        `WhatsApp ${waId.slice(-4)}`,
      phone: waId,
      status: "open",
      temperature,
      intent,
      budget: "No detectado",
      city: "No detectada",
      isQualified: closeProbability >= 65,
      mainObjection: inferMainObjection(contentText),
      closeProbability,
      aiSummary: contentText
        ? `Mensaje recibido por WhatsApp: "${truncateText(contentText, 120)}"`
        : "Conversación recibida por WhatsApp.",
      nextAction:
        firstValue(latestRun || {}, ["nextAction", "next_action"]) ||
        "Responder desde Sales AI",
      recommendedReply:
        firstValue(latestRun || {}, ["recommendedReply", "recommended_reply"]) ||
        buildSuggestedReply(intent),
      lastMessage: contentText,
      lastMessageAt:
        latestMessage?.timestamp_at ||
        latestMessage?.created_at ||
        latestMessage?.timestamp_text ||
        null,
      requiresHuman,
      tags: ["whatsapp", "piloto-cometa"],
      source: "whatsapp",
      raw: {
        contact,
        latestMessage,
        messageCount: leadMessages.length,
      },
    };
  });
}

function normalizeWhatsAppMessages({
  brand,
  messages,
  contacts,
}: {
  brand: any;
  messages: any[];
  contacts: any[];
}) {
  const contactsByWaId = buildContactsByWaId(contacts);

  return messages.map((message) => {
    const waId = String(message.wa_id || "").trim();
    const contact = contactsByWaId[waId] || {};
    const direction = message.direction || "inbound";

    return {
      id: String(message.id || message.message_id || ""),
      leadId: `wa_${waId}`,
      brandName: brand.name,
      direction,
      content: cleanText(message.content_text) || `[${message.message_type}]`,
      sender:
        direction === "inbound"
          ? cleanText(contact.profile_name) || `WhatsApp ${waId.slice(-4)}`
          : "SALES AI",
      createdAt:
        message.timestamp_at || message.created_at || message.timestamp_text || null,
      raw: message,
    };
  });
}

function normalizeLeads(leads: any[], messages: any[], agentRuns: any[]) {
  const messagesByLead = groupByLeadId(messages);
  const runsByLead = groupByLeadId(agentRuns);

  return leads.map((lead) => {
    const leadId = String(lead.id || "");
    const leadMessages = messagesByLead[leadId] || [];
    const leadRuns = runsByLead[leadId] || [];

    const latestMessage = leadMessages[0] || null;
    const latestRun = leadRuns[0] || null;

    const closeProbability = parseNumber(
      firstValue(lead, [
        "close_probability",
        "closeProbability",
        "conversion_probability",
        "probability",
      ]),
      0
    );

    return {
      id: leadId,
      brandName: firstValue(lead, ["brand_name", "brandName"]),
      name:
        firstValue(lead, [
          "contact_name",
          "customer_name",
          "lead_name",
          "name",
          "client_name",
        ]) || "Prospecto",
      phone: firstValue(lead, [
        "phone",
        "whatsapp",
        "whatsapp_number",
        "from_number",
        "contact_phone",
      ]),
      status: firstValue(lead, ["lead_status", "status", "stage"]) || "open",
      temperature:
        firstValue(lead, [
          "lead_temperature",
          "temperature",
          "intent_temperature",
        ]) || inferTemperature(closeProbability),
      intent:
        firstValue(lead, ["intent", "detected_intent", "purchase_intent"]) ||
        "Sin clasificar",
      budget:
        firstValue(lead, ["budget_level", "budget", "budget_text"]) ||
        "No detectado",
      city: firstValue(lead, ["city", "location"]) || "No detectada",
      isQualified:
        Boolean(lead.is_qualified) ||
        Boolean(lead.qualified) ||
        closeProbability >= 65,
      mainObjection:
        firstValue(lead, ["main_objection", "objection"]) || "Sin objeción",
      closeProbability,
      aiSummary:
        firstValue(lead, ["ai_summary", "summary", "sales_summary"]) ||
        "Sin resumen todavía.",
      nextAction:
        firstValue(lead, ["next_action", "recommended_next_action"]) ||
        firstValue(latestRun || {}, ["next_action"]) ||
        "Revisar conversación",
      recommendedReply:
        firstValue(lead, ["recommended_reply", "reply_suggestion"]) ||
        firstValue(latestRun || {}, ["recommended_reply"]) ||
        "",
      lastMessage: firstValue(latestMessage || {}, [
        "message",
        "body",
        "content",
        "text",
        "content_text",
        "incoming_message",
      ]),
      lastMessageAt:
        firstValue(latestMessage || lead, [
          "created_at",
          "updated_at",
          "last_message_at",
        ]) || null,
      requiresHuman:
        Boolean(lead.requires_human) ||
        Boolean(lead.requires_human_confirmation) ||
        Boolean(latestRun?.requires_human),
      tags: normalizeTags(firstValue(lead, ["tags", "labels"])),
      source: "sales",
      raw: lead,
    };
  });
}

function normalizeMessages(messages: any[]) {
  return messages.map((message) => ({
    id: String(message.id || ""),
    leadId: String(message.lead_id || message.leadId || ""),
    brandName: firstValue(message, ["brand_name", "brandName"]),
    direction:
      firstValue(message, ["direction", "message_direction", "type"]) ||
      inferMessageDirection(message),
    content:
      firstValue(message, [
        "message",
        "body",
        "content",
        "text",
        "content_text",
        "incoming_message",
        "outgoing_message",
      ]) || "",
    sender: firstValue(message, ["sender", "from", "sender_name"]) || "Sistema",
    createdAt: firstValue(message, ["created_at", "timestamp"]) || null,
    raw: message,
  }));
}

function normalizeAgentRuns(agentRuns: any[]) {
  return agentRuns.map((run) => ({
    id: String(run.id || ""),
    leadId: String(run.lead_id || run.leadId || ""),
    brandName: firstValue(run, ["brand_name", "brandName"]),
    action: firstValue(run, ["action"]) || "analyze",
    actionStatus: firstValue(run, ["action_status", "status"]) || "completed",
    leadStage: firstValue(run, ["lead_stage", "stage"]) || "",
    requiresHuman: Boolean(run.requires_human),
    confidenceScore: parseNumber(
      firstValue(run, ["confidence_score", "confidenceScore"]),
      0
    ),
    decisionReason:
      firstValue(run, ["decision_reason", "reason"]) ||
      "Sin razón registrada.",
    recommendedReply: firstValue(run, ["recommended_reply", "reply"]) || "",
    nextAction: firstValue(run, ["next_action"]) || "",
    createdAt: firstValue(run, ["created_at"]) || null,
    raw: run,
  }));
}

function calculateInboxMetrics({
  leads,
  agentRuns,
  outboundMessages,
  pendingLearning,
}: {
  leads: any[];
  agentRuns: any[];
  outboundMessages: any[];
  pendingLearning: number;
}) {
  const openLeads = leads.length;

  const hotLeads = leads.filter((lead) => {
    const temp = String(lead.temperature || "").toLowerCase();

    return (
      temp.includes("hot") ||
      temp.includes("caliente") ||
      lead.closeProbability >= 75
    );
  }).length;

  const readyReplies =
    leads.filter((lead) => Boolean(lead.recommendedReply)).length +
    agentRuns.filter((run) => {
      const status = String(run.actionStatus || "").toLowerCase();
      const action = String(run.action || "").toLowerCase();

      return (
        status.includes("ready") ||
        status.includes("execute") ||
        action.includes("reply") ||
        Boolean(run.recommendedReply)
      );
    }).length +
    outboundMessages.length;

  const humanRequired = leads.filter((lead) => lead.requiresHuman).length;

  const qualified = leads.filter((lead) => lead.isQualified).length;

  return {
    openLeads,
    hotLeads,
    qualified,
    readyReplies,
    humanRequired,
    pendingLearning,
    automationMode: humanRequired > 0 ? "Supervisado" : "Controlado",
    health:
      openLeads === 0
        ? 70
        : clamp(
            Math.round(
              70 +
                Math.min(qualified * 2, 14) +
                Math.min(readyReplies, 10) -
                Math.min(humanRequired * 3, 18)
            ),
            0,
            100
          ),
  };
}

function buildContactsByWaId(contacts: any[]) {
  const grouped: Record<string, any> = {};

  for (const contact of contacts) {
    const waId = String(contact.wa_id || "").trim();

    if (!waId) continue;

    grouped[waId] = contact;
  }

  return grouped;
}

function groupWhatsAppMessagesByWaId(messages: any[]) {
  const grouped: Record<string, any[]> = {};

  for (const message of messages) {
    const waId = String(message.wa_id || "").trim();

    if (!waId) continue;

    if (!grouped[waId]) grouped[waId] = [];

    grouped[waId].push(message);
  }

  return grouped;
}

function mergeLeadsByPhone(leads: any[]) {
  const byPhone: Record<string, any> = {};
  const withoutPhone: any[] = [];

  for (const lead of leads) {
    const phone = cleanPhone(lead.phone);

    if (!phone) {
      withoutPhone.push(lead);
      continue;
    }

    if (!byPhone[phone]) {
      byPhone[phone] = lead;
      continue;
    }

    byPhone[phone] = {
      ...byPhone[phone],
      ...lead,
      tags: Array.from(
        new Set([...(byPhone[phone].tags || []), ...(lead.tags || [])])
      ),
    };
  }

  return sortLeadsByDate([...Object.values(byPhone), ...withoutPhone]);
}

function sortLeadsByDate(leads: any[]) {
  return [...leads].sort((a, b) => {
    const dateA = new Date(a.lastMessageAt || 0).getTime();
    const dateB = new Date(b.lastMessageAt || 0).getTime();

    return dateB - dateA;
  });
}

function sortNormalizedMessages(messages: any[]) {
  return [...messages].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();

    return dateA - dateB;
  });
}

function groupByLeadId(rows: any[]) {
  const grouped: Record<string, any[]> = {};

  for (const row of rows) {
    const leadId = String(row.lead_id || row.leadId || "");

    if (!leadId) continue;

    if (!grouped[leadId]) grouped[leadId] = [];

    grouped[leadId].push(row);
  }

  for (const leadId of Object.keys(grouped)) {
    grouped[leadId] = sortByDate(grouped[leadId]);
  }

  return grouped;
}

function sortByDate(rows: any[]) {
  return [...rows].sort((a, b) => {
    const dateA = new Date(
      a.created_at || a.updated_at || a.timestamp_at || a.timestamp || 0
    ).getTime();

    const dateB = new Date(
      b.created_at || b.updated_at || b.timestamp_at || b.timestamp || 0
    ).getTime();

    return dateB - dateA;
  });
}

function firstValue(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];

    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return String(value);
  }

  return "";
}

function parseNumber(value: any, fallback: number) {
  const num = Number(value);

  if (Number.isNaN(num)) return fallback;

  return num;
}

function normalizeTags(value: any) {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function inferWhatsAppIntent(text: string) {
  const value = text.toLowerCase();

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

function inferWhatsAppCloseProbability(text: string) {
  const value = text.toLowerCase();

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

function inferRequiresHuman(text: string) {
  const value = text.toLowerCase();

  return (
    value.includes("pagar") ||
    value.includes("transferencia") ||
    value.includes("factura") ||
    value.includes("urgente") ||
    value.includes("mayoreo") ||
    value.includes("pedido")
  );
}

function inferMainObjection(text: string) {
  const value = text.toLowerCase();

  if (value.includes("precio") || value.includes("costo")) {
    return "Quiere conocer precio";
  }

  if (value.includes("no se cuanto") || value.includes("no sé cuánto")) {
    return "No sabe cuánto necesita";
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

function inferMessageDirection(message: any) {
  if (message.is_from_customer === true) return "inbound";
  if (message.is_from_customer === false) return "outbound";

  if (message.incoming_message) return "inbound";
  if (message.outgoing_message) return "outbound";

  return "unknown";
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