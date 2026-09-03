import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import { requireCanonicalBrandContext } from "@/lib/brand-os/server";

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

type Offer = {
  name: string;
  ideal_for?: string;
  sales_angle?: string;
  when_to_offer?: string;
  requires_human_confirmation?: boolean;
};

type ObjectionHandler = {
  objection: string;
  answer: string;
};

type PlaybookInput = {
  brandName?: string;
  brandSlug?: string;

  businessModel?: string;
  idealCustomer?: string;
  salesObjective?: string;
  offerSummary?: string;
  minimumOrder?: string;
  averageTicket?: string;
  catalogUrl?: string;
  shippingPolicy?: string;
  businessHours?: string;

  paymentMethods?: string[];
  qualificationQuestions?: string[];
  forbiddenPromises?: string[];
  canDoAlone?: string[];
  shouldNotDo?: string[];
  escalationRules?: string[];
  softCloseQuestions?: string[];

  objectionHandlers?: ObjectionHandler[];
  priorityOffers?: Offer[];

  followupMax?: number;
  followupDelayMinutes?: number;
  noResponseDelayMinutes?: number;

  isActive?: boolean;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const context = await requireCanonicalBrandContext({
      brandSlug: searchParams.get("brandSlug"),
      legacyBrandName: searchParams.get("brandName"),
    });
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("sales_playbooks")
      .select("*")
      .eq("brand_name", context.brandName)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const defaultPlaybook = buildDefaultPlaybook(context.brandName);

      return NextResponse.json({
        ok: true,
        playbook: defaultPlaybook,
        exists: false,
      });
    }

    return NextResponse.json({
      ok: true,
      playbook: normalizePlaybookForClient(data),
      raw: data,
      exists: true,
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PlaybookInput;
    const context = await requireCanonicalBrandContext({
      brandSlug: body.brandSlug,
      legacyBrandName: body.brandName,
    });
    const supabase = getSupabaseAdmin();
    const payload = buildDatabasePayload({
      ...body,
      brandName: context.brandName,
    });

    const existing = await findExistingPlaybook(supabase, context.brandName);

    let result;

    if (existing?.id) {
      const { data, error } = await supabase
        .from("sales_playbooks")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) throw error;

      result = data;
    } else {
      const { data, error } = await supabase
        .from("sales_playbooks")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      result = data;
    }

    return NextResponse.json({
      ok: true,
      playbook: normalizePlaybookForClient(result),
      raw: result,
      message: "Playbook guardado correctamente.",
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}

async function findExistingPlaybook(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  brandName: string
) {
  const { data, error } = await supabase
    .from("sales_playbooks")
    .select("id")
    .eq("brand_name", brandName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error buscando playbook existente:", error);
    return null;
  }

  return data;
}

function buildDatabasePayload(input: PlaybookInput & { brandName: string }) {
  const brandName = input.brandName.trim();

  const autonomyRules = {
    main_rule:
      "Resolver la mayor parte de la conversación de forma autónoma usando preguntas de calificación, respuestas seguras y seguimiento.",
    can_do_alone: cleanStringArray(input.canDoAlone),
    should_not_do: cleanStringArray(input.shouldNotDo),
    escalation_rules: cleanStringArray(input.escalationRules),
  };

  const followupRules = {
    max_followups: Number(input.followupMax || 3),
    if_says_lo_checo: {
      message:
        "Claro 😊 para ayudarte mejor, ¿quieres que te recomiende una opción según tu presupuesto?",
      delay_minutes: Number(input.followupDelayMinutes || 240),
    },
    if_no_response_after_info: {
      message:
        "Hola 😊 ¿te gustaría que te recomiende una opción para iniciar o surtir tu negocio?",
      delay_minutes: Number(input.noResponseDelayMinutes || 180),
    },
    closing_rules: {
      goal:
        "Llevar al prospecto a compartir presupuesto, ciudad e intención antes de intentar cierre.",
      do_not_force_close: true,
      soft_close_questions: cleanStringArray(input.softCloseQuestions),
    },
  };

  return {
    brand_name: brandName,

    business_model: safeText(input.businessModel),
    ideal_customer: safeText(input.idealCustomer),
    sales_objective: safeText(input.salesObjective),
    offer_summary: safeText(input.offerSummary),
    minimum_order: safeText(input.minimumOrder),
    average_ticket: safeText(input.averageTicket),
    catalog_url: safeText(input.catalogUrl),
    shipping_policy: safeText(input.shippingPolicy),
    business_hours: safeText(input.businessHours),

    payment_methods: cleanStringArray(input.paymentMethods),
    qualification_questions: cleanStringArray(input.qualificationQuestions),
    forbidden_promises: cleanStringArray(input.forbiddenPromises),

    objection_handlers: cleanObjectionHandlers(input.objectionHandlers),
    priority_offers: cleanOffers(input.priorityOffers),

    autonomy_rules: autonomyRules,
    followup_rules: followupRules,

    is_active: input.isActive !== false,
  };
}

function normalizePlaybookForClient(data: any) {
  const autonomyRules = data?.autonomy_rules || {};
  const followupRules = data?.followup_rules || {};

  return {
    id: data?.id || null,
    brandName: data?.brand_name || "",

    businessModel: data?.business_model || "",
    idealCustomer: data?.ideal_customer || "",
    salesObjective: data?.sales_objective || "",
    offerSummary: data?.offer_summary || "",
    minimumOrder: data?.minimum_order || "",
    averageTicket: data?.average_ticket || "",
    catalogUrl: data?.catalog_url || "",
    shippingPolicy: data?.shipping_policy || "",
    businessHours: data?.business_hours || "",

    paymentMethods: ensureArray(data?.payment_methods),
    qualificationQuestions: ensureArray(data?.qualification_questions),
    forbiddenPromises: ensureArray(data?.forbidden_promises),

    objectionHandlers: ensureArray(data?.objection_handlers),
    priorityOffers: ensureArray(data?.priority_offers),

    canDoAlone: ensureArray(autonomyRules?.can_do_alone),
    shouldNotDo: ensureArray(autonomyRules?.should_not_do),
    escalationRules: ensureArray(autonomyRules?.escalation_rules),

    followupMax: Number(followupRules?.max_followups || 3),
    followupDelayMinutes: Number(
      followupRules?.if_says_lo_checo?.delay_minutes || 240
    ),
    noResponseDelayMinutes: Number(
      followupRules?.if_no_response_after_info?.delay_minutes || 180
    ),
    softCloseQuestions: ensureArray(
      followupRules?.closing_rules?.soft_close_questions
    ),

    isActive: data?.is_active !== false,
    createdAt: data?.created_at || null,
    updatedAt: data?.updated_at || null,
  };
}

function buildDefaultPlaybook(brandName: string) {
  return {
    id: null,
    brandName,

    businessModel: "",
    idealCustomer: "",
    salesObjective:
      "Calificar prospectos, detectar intención de compra y avanzar la conversación hacia una venta sin depender del humano.",
    offerSummary: "",
    minimumOrder: "",
    averageTicket: "",
    catalogUrl: "",
    shippingPolicy: "",
    businessHours: "Atención por WhatsApp. El agente puede operar 24/7.",

    paymentMethods: [],
    qualificationQuestions: [
      "¿Buscas para revender o para uso personal?",
      "¿Con qué presupuesto quieres iniciar?",
      "¿En qué ciudad te encuentras?",
    ],
    forbiddenPromises: [
      "No prometer envíos gratis si no está confirmado.",
      "No inventar precios ni descuentos.",
      "No confirmar disponibilidad exacta sin validación humana.",
    ],

    objectionHandlers: [
      {
        objection: "precio",
        answer:
          "Entiendo. Para recomendarte mejor, ¿con qué presupuesto te gustaría iniciar?",
      },
      {
        objection: "lo checo",
        answer:
          "Claro 😊 ¿quieres que te recomiende una opción económica o una más surtida según tu presupuesto?",
      },
    ],

    priorityOffers: [
      {
        name: "Oferta principal",
        ideal_for: "Cliente ideal por definir",
        sales_angle: "Ángulo de venta por definir",
        when_to_offer: "Cuando el cliente comparta intención y presupuesto",
        requires_human_confirmation: false,
      },
    ],

    canDoAlone: [
      "Responder mensajes iniciales.",
      "Hacer preguntas de calificación.",
      "Manejar objeciones básicas.",
      "Recomendar opciones generales sin inventar información.",
    ],
    shouldNotDo: [
      "Inventar precios.",
      "Confirmar pagos.",
      "Prometer descuentos no autorizados.",
      "Confirmar stock exacto sin validación.",
    ],
    escalationRules: [
      "Escalar si el cliente quiere pagar.",
      "Escalar si pide stock exacto.",
      "Escalar si pide descuento especial.",
      "Escalar si hace una queja o reclamo.",
    ],

    followupMax: 3,
    followupDelayMinutes: 240,
    noResponseDelayMinutes: 180,
    softCloseQuestions: [
      "¿Quieres que te recomiende una opción según tu presupuesto?",
      "¿Buscas algo económico para iniciar o algo más surtido?",
    ],

    isActive: true,
  };
}

function cleanStringArray(value?: string[]) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function cleanObjectionHandlers(value?: ObjectionHandler[]) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      objection: String(item?.objection || "").trim(),
      answer: String(item?.answer || "").trim(),
    }))
    .filter((item) => item.objection || item.answer);
}

function cleanOffers(value?: Offer[]) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      name: String(item?.name || "").trim(),
      ideal_for: String(item?.ideal_for || "").trim(),
      sales_angle: String(item?.sales_angle || "").trim(),
      when_to_offer: String(item?.when_to_offer || "").trim(),
      requires_human_confirmation:
        item?.requires_human_confirmation === true,
    }))
    .filter((item) => item.name);
}

function ensureArray(value: any) {
  if (Array.isArray(value)) return value;
  return [];
}

function safeText(value?: string) {
  return String(value || "").trim();
}
