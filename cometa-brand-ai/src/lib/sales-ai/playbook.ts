import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type SalesPlaybook = {
  id?: string | null;
  brandName: string;

  businessModel: string;
  idealCustomer: string;
  salesObjective: string;
  offerSummary: string;
  minimumOrder: string;
  averageTicket: string;
  catalogUrl: string;
  shippingPolicy: string;
  businessHours: string;

  paymentMethods: string[];
  qualificationQuestions: string[];
  forbiddenPromises: string[];

  objectionHandlers: {
    objection: string;
    answer: string;
  }[];

  priorityOffers: {
    name: string;
    ideal_for?: string;
    sales_angle?: string;
    when_to_offer?: string;
    requires_human_confirmation?: boolean;
  }[];

  canDoAlone: string[];
  shouldNotDo: string[];
  escalationRules: string[];

  followupMax: number;
  followupDelayMinutes: number;
  noResponseDelayMinutes: number;
  softCloseQuestions: string[];

  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function getSalesPlaybook(
  brandName: string
): Promise<SalesPlaybook> {
  const cleanBrandName = String(brandName || "").trim() || "Mar Cosmetic";

  const { data, error } = await supabase
    .from("sales_playbooks")
    .select("*")
    .eq("brand_name", cleanBrandName)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error leyendo sales_playbooks:", error);
    return buildFallbackPlaybook(cleanBrandName);
  }

  if (!data) {
    return buildFallbackPlaybook(cleanBrandName);
  }

  return normalizePlaybook(data);
}

export function buildSalesPlaybookContext(playbook: SalesPlaybook) {
  const objectionText = playbook.objectionHandlers?.length
    ? playbook.objectionHandlers
        .map(
          (item, index) =>
            `${index + 1}. Objeción: ${item.objection}\nRespuesta sugerida: ${item.answer}`
        )
        .join("\n\n")
    : "Sin objeciones específicas configuradas.";

  const offerText = playbook.priorityOffers?.length
    ? playbook.priorityOffers
        .map((offer, index) => {
          return [
            `${index + 1}. ${offer.name}`,
            offer.ideal_for ? `Ideal para: ${offer.ideal_for}` : "",
            offer.sales_angle ? `Ángulo de venta: ${offer.sales_angle}` : "",
            offer.when_to_offer ? `Cuándo ofrecer: ${offer.when_to_offer}` : "",
            offer.requires_human_confirmation
              ? "Requiere confirmación humana: sí"
              : "Requiere confirmación humana: no",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n")
    : "Sin ofertas específicas configuradas.";

  return `
PLAYBOOK COMERCIAL DE LA MARCA
Marca: ${playbook.brandName}

MODELO DE NEGOCIO
${playbook.businessModel || "No definido."}

CLIENTE IDEAL
${playbook.idealCustomer || "No definido."}

OBJETIVO DE SALES AI
${playbook.salesObjective || "Calificar y avanzar conversaciones comerciales."}

OFERTA / RESUMEN COMERCIAL
${playbook.offerSummary || "No definido."}

PEDIDO MÍNIMO
${playbook.minimumOrder || "No definido."}

TICKET PROMEDIO
${playbook.averageTicket || "No definido."}

CATÁLOGO
${playbook.catalogUrl || "No definido."}

POLÍTICA DE ENVÍO
${playbook.shippingPolicy || "No definida."}

HORARIO / ATENCIÓN
${playbook.businessHours || "No definido."}

MÉTODOS DE PAGO / VALIDACIONES
${formatList(playbook.paymentMethods)}

PREGUNTAS DE CALIFICACIÓN QUE DEBE HACER
${formatList(playbook.qualificationQuestions)}

OFERTAS, LOTES O SERVICIOS QUE PUEDE RECOMENDAR
${offerText}

OBJECIONES Y RESPUESTAS PERMITIDAS
${objectionText}

LO QUE SALES AI PUEDE HACER SOLO
${formatList(playbook.canDoAlone)}

LO QUE SALES AI NO DEBE HACER
${formatList(playbook.shouldNotDo)}

PROMESAS PROHIBIDAS
${formatList(playbook.forbiddenPromises)}

CUÁNDO ESCALAR A HUMANO
${formatList(playbook.escalationRules)}

REGLAS DE SEGUIMIENTO
Máximo de seguimientos: ${playbook.followupMax}
Minutos si dice "lo checo": ${playbook.followupDelayMinutes}
Minutos sin respuesta: ${playbook.noResponseDelayMinutes}

PREGUNTAS DE CIERRE SUAVE
${formatList(playbook.softCloseQuestions)}

REGLA PRINCIPAL:
SALES AI debe intentar resolver la mayor parte de la conversación de forma autónoma usando este playbook. No debe escalar por defecto. Solo debe escalar cuando exista una regla clara de escalación, riesgo comercial, pago, inventario exacto, descuento especial, queja o información no confirmada.
`.trim();
}

function normalizePlaybook(data: any): SalesPlaybook {
  const autonomyRules = data?.autonomy_rules || {};
  const followupRules = data?.followup_rules || {};

  return {
    id: data?.id || null,
    brandName: data?.brand_name || "Mar Cosmetic",

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

function buildFallbackPlaybook(brandName: string): SalesPlaybook {
  return {
    id: null,
    brandName,

    businessModel: "",
    idealCustomer: "",
    salesObjective:
      "Calificar prospectos, detectar intención de compra y avanzar la conversación hacia una venta.",
    offerSummary: "",
    minimumOrder: "",
    averageTicket: "",
    catalogUrl: "",
    shippingPolicy: "",
    businessHours: "Atención por WhatsApp con SALES AI.",

    paymentMethods: [],
    qualificationQuestions: [
      "¿Buscas para revender o para uso personal?",
      "¿Con qué presupuesto quieres iniciar?",
      "¿En qué ciudad te encuentras?",
    ],
    forbiddenPromises: [
      "No inventar precios.",
      "No confirmar pagos.",
      "No prometer envíos, descuentos o disponibilidad sin validación.",
    ],

    objectionHandlers: [],
    priorityOffers: [],

    canDoAlone: [
      "Responder mensajes iniciales.",
      "Hacer preguntas de calificación.",
      "Manejar objeciones básicas.",
    ],
    shouldNotDo: [
      "Inventar precios.",
      "Confirmar pagos.",
      "Prometer descuentos no autorizados.",
    ],
    escalationRules: [
      "Escalar si el cliente quiere pagar.",
      "Escalar si pide stock exacto.",
      "Escalar si pide descuento especial.",
    ],

    followupMax: 3,
    followupDelayMinutes: 240,
    noResponseDelayMinutes: 180,
    softCloseQuestions: [
      "¿Quieres que te recomiende una opción según tu presupuesto?",
    ],

    isActive: true,
    createdAt: null,
    updatedAt: null,
  };
}

function ensureArray(value: any) {
  if (Array.isArray(value)) return value;
  return [];
}

function formatList(items: string[]) {
  if (!items?.length) return "Sin información configurada.";

  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}