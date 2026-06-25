import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export type SalesKnowledgeBase = {
  brandName: string;
  knowledgeSources: any[];
  catalogItems: any[];
  businessRules: any[];
  faqs: any[];
  suggestions: any[];
};

export async function getSalesKnowledgeBase(
  brandName: string
): Promise<SalesKnowledgeBase> {
  const cleanBrandName = String(brandName || "").trim();

  if (!cleanBrandName) {
    return {
      brandName: "",
      knowledgeSources: [],
      catalogItems: [],
      businessRules: [],
      faqs: [],
      suggestions: [],
    };
  }

  const [
    knowledgeSourcesResult,
    catalogItemsResult,
    businessRulesResult,
    faqsResult,
    suggestionsResult,
  ] = await Promise.all([
    supabase
      .from("sales_knowledge_sources")
      .select("*")
      .eq("brand_name", cleanBrandName)
      .eq("is_active", true)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(20),

    supabase
      .from("sales_catalog_items")
      .select("*")
      .eq("brand_name", cleanBrandName)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("sales_business_rules")
      .select("*")
      .eq("brand_name", cleanBrandName)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(50),

    supabase
      .from("sales_faqs")
      .select("*")
      .eq("brand_name", cleanBrandName)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(50),

    supabase
      .from("sales_playbook_suggestions")
      .select("*")
      .eq("brand_name", cleanBrandName)
      .in("status", ["approved", "applied"])
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  if (knowledgeSourcesResult.error) {
    console.error(
      "Error leyendo sales_knowledge_sources:",
      knowledgeSourcesResult.error.message
    );
  }

  if (catalogItemsResult.error) {
    console.error(
      "Error leyendo sales_catalog_items:",
      catalogItemsResult.error.message
    );
  }

  if (businessRulesResult.error) {
    console.error(
      "Error leyendo sales_business_rules:",
      businessRulesResult.error.message
    );
  }

  if (faqsResult.error) {
    console.error("Error leyendo sales_faqs:", faqsResult.error.message);
  }

  if (suggestionsResult.error) {
    console.error(
      "Error leyendo sales_playbook_suggestions:",
      suggestionsResult.error.message
    );
  }

  return {
    brandName: cleanBrandName,
    knowledgeSources: knowledgeSourcesResult.data || [],
    catalogItems: catalogItemsResult.data || [],
    businessRules: businessRulesResult.data || [],
    faqs: faqsResult.data || [],
    suggestions: suggestionsResult.data || [],
  };
}

export function buildSalesKnowledgeContext(
  knowledgeBase: SalesKnowledgeBase
): string {
  const catalogContext = buildCatalogContext(knowledgeBase.catalogItems);
  const rulesContext = buildRulesContext(knowledgeBase.businessRules);
  const faqsContext = buildFaqsContext(knowledgeBase.faqs);
  const notesContext = buildKnowledgeSourcesContext(
    knowledgeBase.knowledgeSources
  );
  const suggestionsContext = buildSuggestionsContext(knowledgeBase.suggestions);

  return `
KNOWLEDGE BASE COMERCIAL DEL NEGOCIO
Marca: ${knowledgeBase.brandName}

Este bloque contiene información operativa y comercial real del negocio.
SALES AI debe usar esta información antes de responder, recomendar, prometer o escalar.

CATÁLOGO / PRODUCTOS / LOTES / SERVICIOS
${catalogContext}

REGLAS COMERCIALES Y OPERATIVAS
${rulesContext}

PREGUNTAS FRECUENTES
${faqsContext}

NOTAS / FUENTES DE CONOCIMIENTO
${notesContext}

APRENDIZAJES APROBADOS
${suggestionsContext}

REGLAS DE USO DE KNOWLEDGE BASE:
1. Si existe información específica en Knowledge Base, úsala por encima de respuestas genéricas.
2. No inventes precios, stock, horarios, envíos, promociones ni condiciones.
3. Si el precio aparece como rango o texto autorizado, puedes mencionarlo.
4. Si el precio, stock, envío o condición requiere confirmación humana, no lo confirmes como definitivo.
5. Si falta información para recomendar, pregunta lo mínimo necesario.
6. Si hay una regla comercial aplicable, respétala.
7. Si hay conflicto entre catálogo y regla comercial, prioriza la regla comercial.
8. Si el cliente quiere pagar, apartar, cerrar pedido o confirmar stock exacto, escala cuando la regla lo indique.
`.trim();
}

function buildCatalogContext(items: any[]) {
  if (!items?.length) {
    return "No hay catálogo estructurado cargado todavía.";
  }

  return items
    .map((item, index) => {
      const priceText =
        item.price_text ||
        buildPriceRange(item.price_min, item.price_max, item.currency);

      return `
${index + 1}. ${item.name}
Tipo: ${item.item_type || "No definido"}
Categoría: ${item.category || "No definida"}
Descripción: ${item.description || "Sin descripción"}
Precio: ${priceText || "No definido"}
Pedido mínimo: ${
        item.minimum_order_text ||
        item.min_order_amount ||
        item.min_order_qty ||
        "No definido"
      }
Disponibilidad: ${item.availability_status || "unknown"}
Notas de stock: ${item.stock_notes || "Sin notas"}
Ideal para: ${item.ideal_for || "No definido"}
Ángulo de venta: ${item.sales_angle || "No definido"}
Cuándo ofrecer: ${item.when_to_offer || "No definido"}
Requiere confirmación humana: ${
        item.requires_human_confirmation ? "sí" : "no"
      }
`.trim();
    })
    .join("\n\n");
}

function buildRulesContext(rules: any[]) {
  if (!rules?.length) {
    return "No hay reglas comerciales cargadas todavía.";
  }

  return rules
    .map((rule, index) => {
      return `
${index + 1}. ${rule.rule_name}
Tipo: ${rule.rule_type}
Regla: ${rule.rule_content}
Condición: ${rule.condition_text || "Aplica de forma general"}
Prioridad: ${rule.priority}
Requiere confirmación humana: ${
        rule.requires_human_confirmation ? "sí" : "no"
      }
`.trim();
    })
    .join("\n\n");
}

function buildFaqsContext(faqs: any[]) {
  if (!faqs?.length) {
    return "No hay preguntas frecuentes cargadas todavía.";
  }

  return faqs
    .map((faq, index) => {
      return `
${index + 1}. Pregunta: ${faq.question}
Respuesta autorizada: ${faq.answer}
Intención: ${faq.intent || "No definida"}
Keywords: ${Array.isArray(faq.keywords) ? faq.keywords.join(", ") : ""}
Requiere confirmación humana: ${
        faq.requires_human_confirmation ? "sí" : "no"
      }
`.trim();
    })
    .join("\n\n");
}

function buildKnowledgeSourcesContext(sources: any[]) {
  if (!sources?.length) {
    return "No hay notas comerciales cargadas todavía.";
  }

  return sources
    .map((source, index) => {
      return `
${index + 1}. ${source.title}
Tipo: ${source.source_type}
Contenido:
${source.content_text}
Confianza: ${source.confidence_score || 100}
`.trim();
    })
    .join("\n\n");
}

function buildSuggestionsContext(suggestions: any[]) {
  if (!suggestions?.length) {
    return "No hay aprendizajes aprobados todavía.";
  }

  return suggestions
    .map((suggestion, index) => {
      return `
${index + 1}. ${suggestion.title}
Tipo: ${suggestion.suggestion_type}
Aprendizaje aplicado: ${suggestion.suggested_value}
Razón: ${suggestion.reason || "Sin razón registrada"}
Confianza: ${suggestion.confidence_score || 0}
`.trim();
    })
    .join("\n\n");
}

function buildPriceRange(priceMin?: any, priceMax?: any, currency = "MXN") {
  const min = Number(priceMin || 0);
  const max = Number(priceMax || 0);

  if (min > 0 && max > 0 && min !== max) {
    return `${formatMoney(min, currency)} - ${formatMoney(max, currency)}`;
  }

  if (min > 0) {
    return `Desde ${formatMoney(min, currency)}`;
  }

  if (max > 0) {
    return `Hasta ${formatMoney(max, currency)}`;
  }

  return "";
}

function formatMoney(value: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency || "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}