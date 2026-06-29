import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { analyzeWebsiteLite } from "@/lib/intelligence/websiteAnalyzer";
import fs from "fs";
import path from "path";
import { buildOrionEvidenceContext } from "@/lib/orionEvidenceContext";
import { buildOrionLatestEvidenceContext } from "@/lib/orionLatestEvidenceContext";
import { slugifyBrand } from "@/lib/brand-resolver";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function getSupabaseServerClient() {
  return supabaseAdmin;
}

type EvidenceRow = {
  id?: string;
  brand_name?: string;
  brand_search_key?: string;
  source_type?: string;
  source_url?: string;
  evidence_status?: string;
  confidence_score?: number;
  raw_data?: any;
  evidence_summary?: string;
  updated_at?: string;
};

function cleanMetricValue(value: any) {
  if (!value) return "No detectado";
  const text = String(value);
  const numberMatch = text.match(/[\d.,]+/);
  return numberMatch ? numberMatch[0] : text.slice(0, 20);
}

function normalizeInstagramUrl(url: string) {
  const clean = String(url || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http")) return clean;
  return `https://www.instagram.com/${clean.replace("@", "")}`;
}

function normalizeWebsiteUrl(url: string) {
  const clean = String(url || "").trim();
  if (!clean) return "";
  if (clean.startsWith("http")) return clean;
  return `https://${clean}`;
}

function parseCompetitors(competitors: string) {
  if (!competitors) return [];

  return competitors
    .split(/[\n,]+/)
    .map((item) => normalizeInstagramUrl(item))
    .filter(Boolean)
    .slice(0, 3);
}

function buildBrandSearchKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

function normalizeEvidenceStatus(value: any) {
  return String(value || "").toLowerCase().trim();
}

function isUsableEvidenceStatus(status: any) {
  const normalized = normalizeEvidenceStatus(status);
  return ["success", "partial"].includes(normalized);
}

function hasUrl(value: any) {
  return Boolean(String(value || "").trim());
}

function getBooleanSetting(body: any, keys: string[], defaultValue: boolean) {
  for (const key of keys) {
    if (body[key] === false || body[key] === "false" || body[key] === 0) {
      return false;
    }

    if (body[key] === true || body[key] === "true" || body[key] === 1) {
      return true;
    }
  }

  return defaultValue;
}

function getEvidenceBySource(latestEvidenceData: EvidenceRow[], sourceType: string) {
  return latestEvidenceData.find(
    (item) => String(item.source_type || "").toLowerCase() === sourceType
  );
}

function buildEvidenceSignalsText({
  latestEvidenceData,
  sourceType,
  sourceLabel,
  sourceUrl,
  nonBlocking = false,
}: {
  latestEvidenceData: EvidenceRow[];
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string;
  nonBlocking?: boolean;
}) {
  const evidence = getEvidenceBySource(latestEvidenceData, sourceType);

  if (evidence?.raw_data && isUsableEvidenceStatus(evidence.evidence_status)) {
    return JSON.stringify(
      {
        evidence_status: evidence.evidence_status,
        confidence_score: evidence.confidence_score || null,
        evidence_summary: evidence.evidence_summary || null,
        raw_data: evidence.raw_data,
      },
      null,
      2
    );
  }

  if (sourceUrl) {
    return nonBlocking
      ? `${sourceLabel} fue recibido. Su lectura pública puede estar limitada; úsalo solo como referencia secundaria y no penalices la marca si no hay métricas exactas.`
      : `${sourceLabel} fue recibido, pero la evidencia pública todavía está pendiente de procesamiento.`;
  }

  return `No se proporcionó ${sourceLabel}.`;
}

function getMissingEvidenceSources({
  latestEvidenceData,
  instagram,
  facebook,
  website,
  includeWebsite,
}: {
  latestEvidenceData: EvidenceRow[];
  instagram?: string;
  facebook?: string;
  website?: string;
  includeWebsite: boolean;
}) {
  const availableSources = new Set(
    latestEvidenceData
      .filter((item) => isUsableEvidenceStatus(item.evidence_status))
      .map((item) => String(item.source_type || "").toLowerCase())
  );

  const missing: string[] = [];

  if (hasUrl(instagram) && !availableSources.has("instagram")) {
    missing.push("instagram");
  }

  if (hasUrl(facebook) && !availableSources.has("facebook")) {
    missing.push("facebook");
  }

  if (includeWebsite && hasUrl(website) && !availableSources.has("website")) {
    missing.push("website");
  }

  return missing;
}

function getPendingSourcesForUi({
  latestEvidenceData,
  instagram,
  facebook,
  tiktok,
  website,
  includeWebsite,
  includeTikTok,
}: {
  latestEvidenceData: EvidenceRow[];
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
  includeWebsite: boolean;
  includeTikTok: boolean;
}) {
  const availableSources = new Set(
    latestEvidenceData
      .filter((item) => isUsableEvidenceStatus(item.evidence_status))
      .map((item) => String(item.source_type || "").toLowerCase())
  );

  const pending: string[] = [];

  if (hasUrl(instagram) && !availableSources.has("instagram")) pending.push("instagram");
  if (hasUrl(facebook) && !availableSources.has("facebook")) pending.push("facebook");
  if (includeTikTok && hasUrl(tiktok) && !availableSources.has("tiktok")) pending.push("tiktok");
  if (includeWebsite && hasUrl(website) && !availableSources.has("website")) pending.push("website");

  return pending;
}

async function getLatestEvidenceDataForBrand(brandName: string) {
  const brandSearchKey = buildBrandSearchKey(brandName);

  const { data, error } = await supabase
    .from("orion_latest_evidence")
    .select("*")
    .eq("brand_search_key", brandSearchKey);

  if (error) {
    console.log("Error leyendo orion_latest_evidence:", error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}
function isPlaceholderSourceValue(value: any) {
  const text = String(value || "")
    .trim()
    .toLowerCase();

  const placeholders = [
    "",
    "no",
    "no tiene",
    "no aplica",
    "n/a",
    "na",
    "ninguno",
    "ninguna",
    "sin",
    "sin instagram",
    "sin facebook",
    "sin tiktok",
    "sin sitio",
    "sin sitio web",
    "no cuenta",
    "no cuenta con",
  ];

  return placeholders.includes(text);
}

function normalizePublicSourceUrl(sourceType: string, value: any) {
  const raw = String(value || "").trim();

  if (!raw || isPlaceholderSourceValue(raw)) return "";

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  const clean = raw
    .replace("@", "")
    .replace(/\s+/g, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!clean) return "";

  if (sourceType === "instagram") {
    return `https://www.instagram.com/${clean}/`;
  }

  if (sourceType === "facebook") {
    return `https://www.facebook.com/${clean}/`;
  }

  if (sourceType === "tiktok") {
    return `https://www.tiktok.com/@${clean}/`;
  }

  if (sourceType === "website") {
    return normalizeWebsiteUrl(raw);
  }

  return raw;
}

function buildInitialEvidenceRecords({
  normalizedBrandName,
  instagram,
  facebook,
  tiktok,
  website,
  includeWebsite,
  includeTikTok,
}: {
  normalizedBrandName: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
  includeWebsite: boolean;
  includeTikTok: boolean;
}) {
  const now = new Date().toISOString();

  const sources = [
    {
      source_type: "instagram",
      source_name: "Instagram",
      source_url: normalizePublicSourceUrl("instagram", instagram),
      enabled: hasUrl(instagram),
    },
    {
      source_type: "facebook",
      source_name: "Facebook",
      source_url: normalizePublicSourceUrl("facebook", facebook),
      enabled: hasUrl(facebook),
    },
    {
      source_type: "tiktok",
      source_name: "TikTok",
      source_url: normalizePublicSourceUrl("tiktok", tiktok),
      enabled: includeTikTok && hasUrl(tiktok),
    },
    {
      source_type: "website",
      source_name: "Website",
      source_url: normalizePublicSourceUrl("website", website),
      enabled: includeWebsite && hasUrl(website),
    },
  ];

  return sources
    .filter((source) => source.enabled && source.source_url)
    .map((source) => ({
      brand_analysis_id: null,
      brand_name: normalizedBrandName,
      source_type: source.source_type,
      source_url: source.source_url,
      source_name: source.source_name,
      evidence_status: "pending",
      collection_method: "form_input",
      raw_data: {
        submitted_url: source.source_url,
        created_by: "analyze-brand",
      },
      visual_signals: {},
      ai_observations: {},
      evidence_summary: `${source.source_name} recibido desde el formulario de ORION. Pendiente de validación pública.`,
      screenshot_url: null,
      confidence_score: 40,
      created_at: now,
      updated_at: now,
    }));
}

async function ensureOrionEvidenceJobs({
  
  normalizedBrandName,
  instagram,
  facebook,
  tiktok,
  website,
  includeWebsite,
  includeTikTok,
}: {
  normalizedBrandName: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
  competitors?: string;
  includeWebsite: boolean;
  includeTikTok: boolean;
}) {
  const db = getSupabaseServerClient();
  const evidenceRecords = buildInitialEvidenceRecords({
    normalizedBrandName,
    instagram,
    facebook,
    tiktok,
    website,
    includeWebsite,
    includeTikTok,
  });

  if (!evidenceRecords.length) {
    return {
      inserted: 0,
      skipped: 0,
      errors: [],
    };
  }

  let inserted = 0;
  let skipped = 0;
  const errors: any[] = [];

  for (const record of evidenceRecords) {
    const sourceUrl = String(record.source_url || "").trim();
    const sourceType = String(record.source_type || "").trim();

    if (!sourceUrl || !sourceType) {
      skipped++;
      continue;
    }

    const { data: existing, error: existingError } = await db
      .from("orion_evidence")
      .select("id,evidence_status")
      .ilike("brand_name", normalizedBrandName)
      .eq("source_type", sourceType)
      .eq("source_url", sourceUrl)
      .in("evidence_status", ["pending", "queued", "success", "partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.log("Error revisando evidencia existente:", existingError);
    }

    if (existing?.id) {
      skipped++;
      continue;
    }

    const { error } = await db.from("orion_evidence").insert([record]);

    if (error) {
      console.log("Error creando ORION Evidence job:", {
        brandName: normalizedBrandName,
        sourceType,
        sourceUrl,
        error,
      });

      errors.push({
        sourceType,
        sourceUrl,
        message: error.message,
        details: error.details || null,
        hint: error.hint || null,
      });

      continue;
    }

    inserted++;
  }

  return {
    inserted,
    skipped,
    errors,
  };
}

function ensureCurrentLosses(result: any) {
  if (!result.current_losses) result.current_losses = {};

  result.current_losses.lost_attention ||= "La marca puede estar perdiendo atención porque el contenido no genera suficiente curiosidad inmediata ni diferenciación visual frente a otras opciones.";
  result.current_losses.lost_trust ||= "La marca puede estar perdiendo confianza porque no muestra suficientes señales de prueba social, experiencia real de clientes o comunidad activa.";
  result.current_losses.lost_sales_opportunity ||= "La marca puede estar perdiendo oportunidades de venta al no convertir el interés visual en deseo claro, urgencia o acción comercial.";
  result.current_losses.lost_positioning ||= "La marca puede estar perdiendo posicionamiento porque su comunicación se percibe más funcional que memorable o diferenciada.";
  result.current_losses.lost_community ||= "La marca puede estar perdiendo comunidad porque el contenido no construye conversación, pertenencia o identificación constante.";
  result.current_losses.main_loss_summary ||= "La marca no solo está perdiendo alcance: está perdiendo oportunidades de convertir atención en confianza, comunidad y ventas.";
}

function ensureGrowthPotential(result: any) {
  if (!result.growth_potential) result.growth_potential = {};

  result.growth_potential.branding_potential ||= 7;
  result.growth_potential.community_potential ||= 8;
  result.growth_potential.sales_potential ||= 7;
  result.growth_potential.viral_potential ||= 7;
  result.growth_potential.scalability_potential ||= 8;

  result.growth_potential.potential_summary ||= "La marca tiene potencial de crecimiento si logra convertir su presencia visual en una narrativa más clara, confiable y emocionalmente conectada con su audiencia.";
  result.growth_potential.biggest_growth_lever ||= "El mayor detonador de crecimiento está en transformar el contenido de producto en contenido de identidad, comunidad y prueba social.";
  result.growth_potential.six_month_scenario ||= "Si la marca corrige su narrativa, fortalece la confianza visual y construye comunidad, puede aumentar su autoridad percibida y mejorar su capacidad de convertir seguidores en clientes.";
}

function applyLatestEvidenceToOrionResult(result: any, latestEvidence: EvidenceRow[]) {
  if (!result || !Array.isArray(latestEvidence)) return result;

  const instagramEvidence = latestEvidence.find(
    (item) => item.source_type === "instagram"
  );

  const facebookEvidence = latestEvidence.find(
    (item) => item.source_type === "facebook"
  );

  if (instagramEvidence?.raw_data) {
    const raw = instagramEvidence.raw_data;

    if (!result.social_signals) result.social_signals = {};

    if (raw.followers) result.social_signals.instagram_followers = raw.followers;
    if (raw.following) result.social_signals.instagram_following = raw.following;
    if (raw.posts) result.social_signals.instagram_posts = raw.posts;

    result.instagram_evidence = {
      source: "ORION Evidence Worker",
      extraction_quality: raw.extraction_quality || null,
      confidence_score: instagramEvidence.confidence_score || null,
      evidence_status: instagramEvidence.evidence_status || null,
    };
  }

  if (facebookEvidence?.raw_data) {
    const raw = facebookEvidence.raw_data;

    if (!result.facebook_analysis) result.facebook_analysis = {};

    result.facebook_analysis.presence_level =
      raw.extraction_quality === "high" ? "Alta" : "Media";

    result.facebook_analysis.facebook_score =
      raw.extraction_quality === "high" ? 75 : 55;

    result.facebook_analysis.followers = raw.followers || "No detectado";
    result.facebook_analysis.facebook_followers = raw.followers || "No detectado";
    result.facebook_analysis.likes = raw.likes || "No detectado";
    result.facebook_analysis.facebook_likes = raw.likes || "No detectado";
    result.facebook_analysis.talking_about = raw.talking_about || "No detectado";
    result.facebook_analysis.category = raw.category || "No detectado";
    result.facebook_analysis.location = raw.location || "No detectado";

    result.facebook_analysis.messenger = raw.has_messenger
      ? "Sí detectado"
      : "No detectado";

    result.facebook_analysis.has_messenger = raw.has_messenger
      ? "Sí detectado"
      : "No detectado";

    result.facebook_analysis.whatsapp = raw.has_whatsapp
      ? "Sí detectado"
      : "No detectado";

    result.facebook_analysis.has_whatsapp = raw.has_whatsapp
      ? "Sí detectado"
      : "No detectado";

    result.facebook_analysis.activity_level =
      raw.talking_about && raw.likes
        ? `${raw.talking_about} personas hablando de esto con ${raw.likes} me gusta acumulados.`
        : raw.likes
        ? `${raw.likes} me gusta acumulados.`
        : "Actividad pendiente de validar con más profundidad.";

    result.facebook_analysis.conversion_level =
      raw.has_whatsapp || raw.has_messenger
        ? "Se detectan señales de contacto o mensajería."
        : "No se detectaron señales claras de conversión pública.";

    result.facebook_analysis.diagnosis =
      raw.likes && raw.talking_about
        ? `Facebook muestra ${raw.likes} me gusta acumulados y ${raw.talking_about} personas hablando de esto. Esto indica autoridad social y una comunidad activa, aunque todavía falta validar calidad de contenido, frecuencia y conversión directa.`
        : raw.likes
        ? `Facebook muestra ${raw.likes} me gusta acumulados. Esto indica presencia social relevante, aunque falta validar actividad reciente y conversión.`
        : result.facebook_analysis.diagnosis || "Facebook requiere validación adicional.";

    result.facebook_analysis.content_type =
      result.facebook_analysis.content_type ||
      "Pendiente de validar visualmente con contenido reciente.";

    result.facebook_analysis.trust_level =
      raw.likes || raw.talking_about
        ? "Alto por volumen de prueba social pública."
        : "Pendiente de validar.";

    result.facebook_evidence = {
      source: "ORION Evidence Worker",
      extraction_quality: raw.extraction_quality || null,
      confidence_score: facebookEvidence.confidence_score || null,
      evidence_status: facebookEvidence.evidence_status || null,
      title: raw.title || null,
      description: raw.description || null,
    };
  }

  return result;
}

function ensureFacebookAnalysis(result: any, facebook: string) {
  if (!result.facebook_analysis) {
    result.facebook_analysis = {
      presence_level: facebook ? "Básica" : "No detectada",
      activity_level: facebook
        ? "Facebook tiene presencia, pero requiere análisis real de actividad, consistencia y formatos."
        : "No se proporcionó Facebook.",
      conversion_level: facebook
        ? "Facebook puede funcionar como canal de confianza, mensajes y remarketing."
        : "No evaluable sin enlace.",
      diagnosis: facebook
        ? "Facebook representa una oportunidad para fortalecer confianza y conversión."
        : "No se detectó presencia de Facebook.",
      content_type: "No detectado con precisión.",
      trust_level: facebook
        ? "Potencial medio si muestra contenido real, reseñas y llamados a la acción."
        : "No evaluable.",
      main_opportunity: facebook
        ? "Usar Facebook como canal de conversión, prueba social y remarketing."
        : "Agregar una página de Facebook.",
      main_problem: facebook
        ? "El canal necesita mayor consistencia y enfoque comercial."
        : "No se proporcionó Facebook.",
      recommended_action: facebook
        ? "Crear contenido para Facebook enfocado en confianza, mensajes y prueba social."
        : "Agregar Facebook al diagnóstico.",
      facebook_score: facebook ? 60 : 0,
    };
  }
}

function ensureTikTokAnalysis(result: any, tiktok: string, includeTikTok: boolean) {
  if (!includeTikTok) {
    result.tiktok_analysis = {
      presence_level: "Excluido del diagnóstico",
      tiktok_score: 0,
      viral_potential: "TikTok fue excluido para no afectar el diagnóstico.",
      content_style: "No evaluado.",
      hook_quality: "No evaluado.",
      posting_consistency: "No evaluado.",
      diagnosis:
        "TikTok no fue considerado dentro del score principal porque la marca no lo utiliza, no lo necesita o se decidió excluirlo estratégicamente.",
      main_opportunity:
        "Evaluar TikTok en una etapa posterior solo si tiene sentido para la audiencia, capacidad operativa y tipo de contenido de la marca.",
      main_problem: "No aplica dentro de este diagnóstico.",
      recommended_action:
        "No penalizar a la marca por TikTok. Priorizar los canales disponibles y verificables.",
    };

    return;
  }

  if (!result.tiktok_analysis) {
    result.tiktok_analysis = {
      presence_level: tiktok ? "Básica" : "No detectada",
      tiktok_score: tiktok ? 50 : 0,
      viral_potential: tiktok
        ? "Potencial por evaluar con datos reales del perfil."
        : "No evaluable sin enlace.",
      content_style: "No detectado con precisión.",
      hook_quality: "No detectado con precisión.",
      posting_consistency: "No detectado con precisión.",
      diagnosis: tiktok
        ? "TikTok puede ser una palanca de descubrimiento y viralidad si la marca trabaja hooks, formatos cortos y repetición estratégica. Esta plataforma se considera con bajo peso hasta contar con integración oficial por API."
        : "No se proporcionó TikTok.",
      main_opportunity: tiktok
        ? "Usar TikTok como canal secundario de descubrimiento si la marca tiene capacidad de producir video corto."
        : "No se evalúa TikTok si la marca no lo utiliza.",
      main_problem: tiktok
        ? "La extracción pública de TikTok puede ser limitada; no debe afectar de forma importante el score principal."
        : "No se proporcionó TikTok.",
      recommended_action: tiktok
        ? "Tomar TikTok como referencia secundaria y validar métricas reales cuando exista integración oficial."
        : "No penalizar la marca por ausencia de TikTok.",
    };
  }
}

function ensureWebsiteAnalysis(result: any, website: string, includeWebsite: boolean) {
  if (!includeWebsite) {
    result.website_analysis = {
      website_score: 0,
      presence_level: "Excluido del diagnóstico",
      seo_score: 0,
      conversion_score: 0,
      trust_score: 0,
      ux_score: 0,
      seo_level: "No evaluado.",
      conversion_level: "No evaluado.",
      trust_level: "No evaluado.",
      diagnosis:
        "El sitio web fue excluido por configuración estratégica. ORION no debe penalizar a la marca por no tener sitio web o por no necesitarlo en esta etapa.",
      main_problem: "No aplica dentro de este diagnóstico.",
      main_opportunity:
        "Priorizar redes sociales, canales de conversación, confianza visual y proceso comercial con las fuentes disponibles.",
      recommended_action:
        "No considerar sitio web como limitante si el modelo comercial actual no lo necesita.",
    };

    return;
  }

  if (!result.website_analysis) {
    result.website_analysis = {
      website_score: website ? 50 : 0,
      presence_level: website ? "Básica" : "No detectada",
      seo_score: website ? 50 : 0,
      conversion_score: website ? 50 : 0,
      trust_score: website ? 50 : 0,
      ux_score: website ? 50 : 0,
      seo_level: website
        ? "Por evaluar con datos reales del sitio."
        : "No evaluable sin sitio web.",
      conversion_level: website
        ? "El sitio puede funcionar como punto de conversión si tiene CTA, WhatsApp, formularios o carrito visibles."
        : "No evaluable sin sitio web.",
      trust_level: website
        ? "La confianza depende de señales visibles como contacto, prueba social, políticas, diseño y claridad comercial."
        : "No evaluable.",
      diagnosis: website
        ? "El sitio web debe evaluarse como activo de conversión, no solo como presencia digital."
        : "No se proporcionó sitio web.",
      main_problem: website
        ? "El sitio puede estar perdiendo conversiones si no comunica confianza, propuesta de valor y siguiente paso con claridad."
        : "No se proporcionó sitio web.",
      main_opportunity: website
        ? "Convertir el sitio en un centro de confianza, captación y cierre conectado con redes sociales."
        : "Agregar sitio web al diagnóstico.",
      recommended_action: website
        ? "Optimizar la primera pantalla, CTA, WhatsApp, prueba social, SEO básico y claridad de oferta."
        : "No penalizar si el sitio web fue omitido por estrategia comercial.",
    };
  }
}

function applyEvidenceMetricsToUiPayload(parsedResult: any, latestEvidenceData: EvidenceRow[] = []) {
  if (!parsedResult || !Array.isArray(latestEvidenceData)) return;

  const getRawBySource = (sourceType: string) => {
    const item = latestEvidenceData.find(
      (e: any) => String(e.source_type || "").toLowerCase() === sourceType
    );

    return item?.raw_data || {};
  };

  const instagramRaw = getRawBySource("instagram");
  const facebookRaw = getRawBySource("facebook");
  const tiktokRaw = getRawBySource("tiktok");

  const tiktokEvidenceText = String(
    tiktokRaw.metric_source_sample ||
      tiktokRaw.visible_text_preview ||
      tiktokRaw.detected_text_sample ||
      ""
  );

  const tiktokBlockedByChallenge =
    /iniciar sesión|captcha|arrastra|deslizador|drag|slider|login|verify|verification|audio/i.test(
      tiktokEvidenceText
    );

  function extractTikTokUsernameFromUrl(url: string) {
    const match = String(url || "").match(/tiktok\.com\/@([^/?#]+)/i);
    return match?.[1] ? `@${match[1]}` : null;
  }

  parsedResult.social_signals = parsedResult.social_signals || {};

  if (instagramRaw.followers) {
    parsedResult.social_signals.instagram_followers = String(instagramRaw.followers);
  }

  if (instagramRaw.following) {
    parsedResult.social_signals.instagram_following = String(instagramRaw.following);
  }

  if (instagramRaw.posts) {
    parsedResult.social_signals.instagram_posts = String(instagramRaw.posts);
  }

  parsedResult.facebook_analysis = parsedResult.facebook_analysis || {};

  if (facebookRaw.followers) {
    parsedResult.facebook_analysis.facebook_followers = String(facebookRaw.followers);
    parsedResult.facebook_analysis.followers = String(facebookRaw.followers);
  }

  if (facebookRaw.likes) {
    parsedResult.facebook_analysis.facebook_likes = String(facebookRaw.likes);
    parsedResult.facebook_analysis.likes = String(facebookRaw.likes);
  }

  if (facebookRaw.talking_about) {
    parsedResult.facebook_analysis.talking_about = String(facebookRaw.talking_about);
  }

  if (facebookRaw.has_messenger !== undefined && facebookRaw.has_messenger !== null) {
    parsedResult.facebook_analysis.has_messenger = facebookRaw.has_messenger
      ? "Detectado"
      : "No detectado";
  }

  if (facebookRaw.has_whatsapp !== undefined && facebookRaw.has_whatsapp !== null) {
    parsedResult.facebook_analysis.has_whatsapp = facebookRaw.has_whatsapp
      ? "Detectado"
      : "No detectado";
  }

  parsedResult.tiktok_context = parsedResult.tiktok_context || {};
  parsedResult.tiktok_context.profileSignals =
    parsedResult.tiktok_context.profileSignals || {};
  parsedResult.tiktok_context.contentSignals =
    parsedResult.tiktok_context.contentSignals || {};

  if (tiktokBlockedByChallenge) {
    const username =
      tiktokRaw.username ||
      extractTikTokUsernameFromUrl(tiktokRaw.url || tiktokRaw.source_url || "") ||
      parsedResult.tiktok_context.profileSignals.username ||
      "Perfil detectado";

    parsedResult.tiktok_context.profileSignals.username = username;
    parsedResult.tiktok_context.profileSignals.followers = "No detectado";
    parsedResult.tiktok_context.profileSignals.likes = "No detectado";
    parsedResult.tiktok_context.profileSignals.following = "No detectado";
    parsedResult.tiktok_context.profileSignals.bio =
      "TikTok mostró una barrera de inicio de sesión o verificación. No se pudieron validar métricas públicas exactas.";

    parsedResult.tiktok_context.contentSignals.hasVideos = "No detectado";
    parsedResult.tiktok_context.contentSignals.viralPotential = "No detectado";

    parsedResult.tiktok_analysis = parsedResult.tiktok_analysis || {};
    parsedResult.tiktok_analysis.presence_level =
      "Detectado con extracción limitada";
    parsedResult.tiktok_analysis.diagnosis =
      "El perfil de TikTok fue detectado, pero TikTok mostró una barrera de inicio de sesión o verificación. TikTok no debe afectar de forma importante el score principal hasta contar con integración oficial.";
    parsedResult.tiktok_analysis.main_problem =
      "TikTok limita la lectura pública de métricas sin conexión oficial.";
    parsedResult.tiktok_analysis.recommended_action =
      "Mantener TikTok como canal detectado y conectar la cuenta oficialmente en el futuro módulo de Integrations para obtener métricas reales.";

    return;
  }

  const tiktokUrl = tiktokRaw.url || tiktokRaw.source_url || "";
  const tiktokUsernameMatch = String(tiktokUrl).match(
    /tiktok\.com\/@([^/?#]+)/i
  );

  if (tiktokRaw.username) {
    parsedResult.tiktok_context.profileSignals.username = String(tiktokRaw.username);
  } else if (tiktokUsernameMatch?.[1]) {
    parsedResult.tiktok_context.profileSignals.username = `@${tiktokUsernameMatch[1]}`;
  }

  if (tiktokRaw.followers) {
    parsedResult.tiktok_context.profileSignals.followers = String(tiktokRaw.followers);
  }

  if (tiktokRaw.likes) {
    parsedResult.tiktok_context.profileSignals.likes = String(tiktokRaw.likes);
  }

  if (tiktokRaw.following) {
    parsedResult.tiktok_context.profileSignals.following = String(tiktokRaw.following);
  }

  if (tiktokRaw.visible_text_preview || tiktokRaw.detected_text_sample) {
    parsedResult.tiktok_context.profileSignals.bio =
      tiktokRaw.visible_text_preview || tiktokRaw.detected_text_sample;
  }

  if (tiktokRaw.content_signals?.video_context_detected !== undefined) {
    parsedResult.tiktok_context.contentSignals.hasVideos =
      tiktokRaw.content_signals.video_context_detected
        ? "Detectado"
        : "No detectado";
  }

  if (tiktokRaw.content_signals?.fashion_context_detected !== undefined) {
    parsedResult.tiktok_context.contentSignals.viralPotential =
      tiktokRaw.content_signals.fashion_context_detected
        ? "Señal de contenido detectada"
        : "No detectado";
  }
}

function applySourcePolicyToResult({
  parsedResult,
  includeWebsite,
  includeTikTok,
  website,
  tiktok,
}: {
  parsedResult: any;
  includeWebsite: boolean;
  includeTikTok: boolean;
  website?: string;
  tiktok?: string;
}) {
  parsedResult.analysis_scope = {
    website_included: includeWebsite && hasUrl(website),
    tiktok_included: includeTikTok && hasUrl(tiktok),
    tiktok_weight: includeTikTok && hasUrl(tiktok) ? "low_until_api_connection" : "excluded",
    note:
      "ORION ajusta el diagnóstico según las fuentes incluidas. Sitio web y TikTok no deben penalizar si fueron excluidos o si la extracción pública es limitada.",
  };

  if (!includeWebsite || !hasUrl(website)) {
    ensureWebsiteAnalysis(parsedResult, "", false);
  }

  if (!includeTikTok || !hasUrl(tiktok)) {
    ensureTikTokAnalysis(parsedResult, "", false);
  }
}

async function analyzeScreenshotWithVision({
  screenshotUrl,
  platform,
  systemPrompt,
  userPrompt,
}: {
  screenshotUrl?: string;
  platform: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  if (!screenshotUrl) return `No se realizó análisis visual de ${platform}.`;

  const screenshotPath = path.join(process.cwd(), "public", screenshotUrl);

  if (!fs.existsSync(screenshotPath)) {
    return `No se encontró screenshot de ${platform}.`;
  }

  const imageBase64 = fs.readFileSync(screenshotPath, "base64");

  const visionResponse = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
  });

  return (
    visionResponse.choices[0].message.content ||
    `No se obtuvo análisis visual de ${platform}.`
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandName,
      industry,
      city,
      instagram,
      facebook,
      tiktok,
      website,
      competitors,
      objective,
      budget,
      problem,
    } = body;

    const normalizedBrandName = String(
      body.brandName || body.brand_name || brandName || ""
    ).trim();

    const brandSlug = slugifyBrand(
      String(body.brandSlug || body.brand_slug || normalizedBrandName)
    );

    const includeWebsite = getBooleanSetting(
      body,
      ["includeWebsite", "include_website", "analyzeWebsite", "analyze_website"],
      true
    );

    const includeTikTok = getBooleanSetting(
      body,
      ["includeTikTok", "include_tiktok", "analyzeTikTok", "analyze_tiktok"],
      true
    );

    const effectiveWebsite = includeWebsite ? website : "";
    const effectiveTikTok = includeTikTok ? tiktok : "";

    const evidenceJobResult = await ensureOrionEvidenceJobs({
      normalizedBrandName,
      instagram,
      facebook,
      tiktok: effectiveTikTok,
      website: effectiveWebsite,
      competitors,
      includeWebsite,
      includeTikTok,
    });

    if (evidenceJobResult.errors.length > 0) {
  return NextResponse.json({
    success: false,
    status: "evidence_setup_error",
    brandSlug,
    message:
      "ORION no pudo preparar correctamente las evidencias iniciales. Revisa las fuentes capturadas o la configuración de Supabase.",
    evidence: {
      jobResult: evidenceJobResult,
    },
  });
}

    let latestEvidenceData = await getLatestEvidenceDataForBrand(normalizedBrandName);

    const missingEvidenceSources = getMissingEvidenceSources({
      latestEvidenceData,
      instagram,
      facebook,
      website,
      includeWebsite,
    });

    const pendingSourcesForUi = getPendingSourcesForUi({
      latestEvidenceData,
      instagram,
      facebook,
      tiktok,
      website,
      includeWebsite,
      includeTikTok,
    });

    console.log("ORION PRECHECK:", {
      brandName: normalizedBrandName,
      brandSlug,
      includeWebsite,
      includeTikTok,
      evidenceJobResult,
      latestEvidenceCount: latestEvidenceData.length,
      missingEvidenceSources,
      pendingSourcesForUi,
    });

    if (missingEvidenceSources.length > 0) {
      return NextResponse.json({
        success: false,
        status: "evidence_pending",
        brandSlug,
        message:
          "ORION ya recibió la marca y está recolectando evidencia pública. Espera a que el worker procese las fuentes pendientes y vuelve a generar el diagnóstico.",
        evidence: {
          jobResult: evidenceJobResult,
          missingRequiredSources: missingEvidenceSources,
          pendingSources: pendingSourcesForUi,
          includedSources: {
            instagram: hasUrl(instagram),
            facebook: hasUrl(facebook),
            tiktok: includeTikTok && hasUrl(tiktok),
            website: includeWebsite && hasUrl(website),
          },
          excludedSources: {
            tiktok: !includeTikTok || !hasUrl(tiktok),
            website: !includeWebsite || !hasUrl(website),
          },
        },
      });
    }

    const orionEvidenceContext = buildOrionEvidenceContext({
      brandName: normalizedBrandName,
      industry,
      city,
      instagram,
      facebook,
      tiktok: effectiveTikTok,
      website: effectiveWebsite,
      competitors,
    });

    const orionLatestEvidenceContext = await buildOrionLatestEvidenceContext({
      supabase,
      brandName: normalizedBrandName,
    });

    const instagramContext = null;
    const facebookContext = null;
    const tiktokContext = null;

    const websiteContext =
      includeWebsite && website
        ? await analyzeWebsiteLite(normalizeWebsiteUrl(website))
        : null;

    console.log("WEBSITE CONTEXT:", JSON.stringify(websiteContext, null, 2));

    const competitorUrls = parseCompetitors(competitors);
    const competitorData: unknown[] = [];

    const instagramVisualAnalysis = await analyzeScreenshotWithVision({
      screenshotUrl: undefined,
      platform: "Instagram",
      systemPrompt: `
Eres un analista visual experto en branding, social media, diseño, percepción de marca y contenido para Instagram.
Analiza únicamente lo visible en el screenshot.
No inventes métricas.
No asumas información que no se vea.
Tu análisis debe ser concreto, visual y estratégico.
      `,
      userPrompt: `
Analiza visualmente este perfil de Instagram.

Evalúa:
- primera impresión
- claridad visual de la bio
- estética general
- consistencia del feed
- paleta visual dominante
- calidad percibida
- si parece catálogo, comunidad, lifestyle, marca aspiracional o tienda local
- nivel de confianza visual
- nivel aspiracional
- oportunidades visuales
- qué emoción transmite
- qué parece estar frenando ventas o comunidad
- patrones visibles en los posts
- exceso de producto, falta de personas, UGC, storytelling o variedad
- señales visibles de engagement o falta de comunidad

Responde en texto claro, estratégico y específico.
      `,
    });

    const facebookVisualAnalysis = await analyzeScreenshotWithVision({
      screenshotUrl: undefined,
      platform: "Facebook",
      systemPrompt: `
Eres un analista visual experto en Facebook, branding, confianza digital, social proof, conversión por mensajes y percepción comercial.
Analiza únicamente lo visible en el screenshot de Facebook.
No inventes métricas.
No asumas información que no se vea.
Tu análisis debe ser concreto, visual, comercial y estratégico.
      `,
      userPrompt: `
Analiza visualmente esta página de Facebook.

Evalúa:
- primera impresión de la página
- claridad visual de la portada
- calidad del perfil
- confianza percibida
- actividad visible
- si parece una marca activa o abandonada
- señales de comunidad
- señales de venta
- señales de contacto
- prueba social visible
- si el contenido parece comercial, aspiracional, catálogo, informativo o comunidad
- qué está frenando la conversión
- qué oportunidad tiene Facebook como canal de mensajes, tráfico, confianza o remarketing

Responde en texto claro, estratégico y específico.
      `,
    });

    const tiktokVisualAnalysis =
      includeTikTok && tiktok
        ? await analyzeScreenshotWithVision({
            screenshotUrl: undefined,
            platform: "TikTok",
            systemPrompt: `
Eres un analista experto en TikTok, contenido viral, hooks, retención, percepción de marca y crecimiento orgánico.
Analiza únicamente lo visible en el screenshot de TikTok.
No inventes métricas.
No asumas información que no se vea.
Tu análisis debe ser claro, estratégico y enfocado en viralidad.
            `,
            userPrompt: `
Analiza visualmente este perfil de TikTok.

Evalúa:
- primera impresión
- claridad del perfil
- bio
- seguidores, likes o señales visibles si aparecen
- estilo de contenido
- calidad de hooks percibida
- potencial viral
- consistencia visual
- si parece activo o abandonado
- señales de comunidad
- señales de contenido comercial, educativo, entretenimiento o tendencia
- qué puede estar frenando crecimiento
- qué tipo de contenido debería priorizar

Responde en texto claro, estratégico y específico.
            `,
          })
        : "TikTok fue excluido del diagnóstico o no fue proporcionado. No debe afectar el score principal.";

    const websiteVisualAnalysis =
      includeWebsite && website
        ? await analyzeScreenshotWithVision({
            screenshotUrl: undefined,
            platform: "Website",
            systemPrompt: `
Eres un analista experto en sitios web, UX, CRO, SEO básico, branding digital, confianza y conversión.
Analiza únicamente lo visible en el screenshot del sitio web.
No inventes métricas.
No asumas información que no se vea.
Tu análisis debe ser concreto, comercial, visual y estratégico.
            `,
            userPrompt: `
Analiza visualmente este sitio web.

Evalúa:
- primera impresión
- claridad de la propuesta de valor
- diseño visual
- calidad percibida
- si parece profesional, genérico, premium o amateur
- CTA visibles
- WhatsApp, formulario, carrito o métodos de contacto visibles
- estructura de confianza
- señales de venta
- experiencia móvil percibida si se puede inferir
- claridad del producto o servicio
- barreras de conversión
- oportunidades para mejorar conversión
- oportunidades para mejorar confianza
- oportunidades para mejorar SEO y estructura

Responde en texto claro, estratégico y específico.
            `,
          })
        : "El sitio web fue excluido del diagnóstico o no fue proporcionado. No debe afectar el score principal.";

    const instagramEvidence = getEvidenceBySource(latestEvidenceData, "instagram");
    const facebookEvidence = getEvidenceBySource(latestEvidenceData, "facebook");
    const tiktokEvidence = getEvidenceBySource(latestEvidenceData, "tiktok");

    const profileSignalsText = buildEvidenceSignalsText({
      latestEvidenceData,
      sourceType: "instagram",
      sourceLabel: "Instagram",
      sourceUrl: instagram,
    });

    const engagementSignalsText =
      instagramEvidence?.evidence_summary ||
      (instagram
        ? "Engagement pendiente de validar con mayor profundidad."
        : "No se proporcionó Instagram.");

    const scrapingStatusText =
      instagramEvidence?.evidence_status ||
      (instagram ? "pending" : "not_provided");

    const facebookSignalsText = buildEvidenceSignalsText({
      latestEvidenceData,
      sourceType: "facebook",
      sourceLabel: "Facebook",
      sourceUrl: facebook,
    });

    const tiktokSignalsText = buildEvidenceSignalsText({
      latestEvidenceData,
      sourceType: "tiktok",
      sourceLabel: "TikTok",
      sourceUrl: tiktok,
      nonBlocking: true,
    });

    const sourcePolicyContext = `
POLÍTICA DE FUENTES DE ORION:
- includeWebsite: ${includeWebsite ? "true" : "false"}
- includeTikTok: ${includeTikTok ? "true" : "false"}
- Sitio web proporcionado: ${website || "No"}
- TikTok proporcionado: ${tiktok || "No"}
- Si includeWebsite es false o no hay sitio web, NO penalices a la marca por sitio web.
- Si includeTikTok es false o no hay TikTok, NO penalices a la marca por TikTok.
- Aunque TikTok esté incluido, TikTok tiene bajo peso estratégico hasta contar con API oficial o conexión de cuenta.
- TikTok no debe reducir de forma importante brand_score, opportunity_level ni scores principales por falta de métricas públicas.
- Si una fuente fue excluida, llena su sección como "Excluido del diagnóstico" y enfoca la estrategia en las fuentes disponibles.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.55,
      messages: [
        {
          role: "system",
          content: `
Eres COMETA BRAND AI V5, un agente estratégico avanzado de Cometa Growth Partner.

Eres un director estratégico de marca con pensamiento de growth, branding, psicología del consumidor, social media, contenido viral, funnels, ventas digitales, UX, CRO, SEO básico y posicionamiento comercial.

REGLAS CRÍTICAS:
- No vendas a Cometa dentro del análisis.
- No uses frases genéricas.
- No inventes métricas exactas.
- Puedes estimar engagement percibido, pero debe decir "estimado visualmente".
- Si hay screenshots, úsalos como prioridad.
- Si hay señales estructuradas, úsalas.
- social_signals.instagram_followers debe contener SOLO el número.
- social_signals.instagram_following debe contener SOLO el número.
- social_signals.instagram_posts debe contener SOLO el número.
- current_losses siempre debe venir lleno.
- growth_potential siempre debe venir lleno.
- facebook_analysis es obligatorio.
- tiktok_analysis es obligatorio.
- website_analysis es obligatorio.
- ORION debe diferenciar entre dato declarado, evidencia visual, señal estructurada, inferencia estratégica e información pendiente de validar.
- Si solo existe una URL de Instagram, Facebook, TikTok o sitio web, no afirmes que se navegó, scrapeó o validó el perfil.
- No inventes seguidores, publicaciones, engagement, frecuencia, tráfico web, ventas ni conversiones.
- Cuando una métrica no esté disponible, usa "No detectado" o 0 según corresponda en el JSON.
- Las oportunidades estratégicas sí pueden inferirse, pero deben estar redactadas como inferencias basadas en la información disponible.
- Sitio web y TikTok pueden ser excluidos por configuración. Si están excluidos, no afectan negativamente el diagnóstico.
- TikTok tiene peso bajo hasta integración oficial por API.
          `,
        },
        {
          role: "user",
          content: `
Analiza esta marca con profundidad estratégica.

${sourcePolicyContext}

${orionEvidenceContext}

${orionLatestEvidenceContext}

REGLAS CRÍTICAS DE VERACIDAD PARA ORION:

1. Si una métrica no aparece explícitamente en ORION LATEST EVIDENCE CONTEXT, debes responder "No detectado".
2. Nunca inventes números de seguidores, likes, publicaciones, vistas, engagement, comentarios, ventas, conversiones o tráfico.
3. Si un campo dice "No detectado", el diagnóstico narrativo NO puede mencionar una cifra relacionada con ese campo.
4. Si Facebook tiene seguidores = "No detectado", no puedes decir "buen número de seguidores", "1.5k seguidores", "alta comunidad" ni frases similares.
5. Si TikTok tiene seguidores, likes o videos como "No detectado", no puedes calificarlo por tamaño de audiencia; solo puedes hablar de presencia detectada, accesibilidad y señales de contenido.
6. Puedes hacer inferencias estratégicas, pero deben escribirse como inferencias, no como datos medidos.
7. Si la evidencia pública fue limitada, dilo claramente: "La plataforma fue detectada, pero la extracción pública no permitió validar métricas exactas".
8. La narrativa debe ser consistente con las tarjetas de métricas. Si la tarjeta dice "No detectado", el texto debe respetarlo.
9. Si sitio web fue excluido, no lo menciones como problema, barrera o limitante.
10. Si TikTok fue excluido o tiene extracción limitada, no lo uses como razón para bajar el score principal.

DATOS DECLARADOS:
Nombre: ${normalizedBrandName}
Industria o giro: ${industry}
Ciudad o zona: ${city || "No especificado"}
Instagram: ${instagram || "No especificado"}
Facebook: ${facebook || "No especificado"}
TikTok: ${includeTikTok ? tiktok || "No especificado" : "Excluido del diagnóstico"}
Sitio web: ${includeWebsite ? website || "No especificado" : "Excluido del diagnóstico"}
Competidores: ${competitors || "No especificado"}
Objetivo principal: ${objective || "No especificado"}
Presupuesto aproximado: ${budget || "No especificado"}
Problema principal: ${problem || "No especificado"}

SEÑALES ESTRUCTURADAS DE INSTAGRAM:
${profileSignalsText}

SEÑALES DE ENGAGEMENT DE INSTAGRAM:
${engagementSignalsText}

ESTADO TÉCNICO DE INSTAGRAM:
${scrapingStatusText}

ANÁLISIS VISUAL DE INSTAGRAM:
${instagramVisualAnalysis}

SEÑALES ESTRUCTURADAS DE FACEBOOK:
${facebookSignalsText}

ANÁLISIS VISUAL DE FACEBOOK:
${facebookVisualAnalysis}

SEÑALES ESTRUCTURADAS DE TIKTOK:
${includeTikTok ? tiktokSignalsText : "TikTok excluido del diagnóstico."}

ANÁLISIS VISUAL DE TIKTOK:
${tiktokVisualAnalysis}

SEÑALES DEL SITIO WEB:
${
  includeWebsite && websiteContext
    ? JSON.stringify(websiteContext, null, 2)
    : "Sitio web excluido o no proporcionado. No debe afectar el score."
}

ESTADO TÉCNICO DEL SITIO WEB:
${
  includeWebsite
    ? websiteContext?.available
      ? "Sitio web analizado correctamente con Website Intelligence."
      : "Sitio web no disponible o no analizado."
    : "Sitio web excluido por configuración del diagnóstico."
}

ANÁLISIS VISUAL DEL SITIO WEB:
${websiteVisualAnalysis}

BENCHMARK AUTOMÁTICO DE COMPETIDORES:
${JSON.stringify(competitorData, null, 2)}

Responde ÚNICAMENTE en JSON válido.
NO uses markdown.
NO agregues texto fuera del JSON.

Estructura exacta:

{
  "brand_score": 0,
  "brand_level": "",
  "executive_summary": "",

  "opportunity_level": {
    "level": "",
    "score": 0,
    "reason": ""
  },

  "social_signals": {
    "instagram_followers": "",
    "instagram_following": "",
    "instagram_posts": "",
    "estimated_engagement": "",
    "engagement_reading": "",
    "community_strength": "",
    "authority_level": "",
    "content_consistency": "",
    "brand_maturity": ""
  },

  "facebook_analysis": {
    "presence_level": "",
    "activity_level": "",
    "conversion_level": "",
    "diagnosis": "",
    "content_type": "",
    "trust_level": "",
    "main_opportunity": "",
    "main_problem": "",
    "recommended_action": "",
    "facebook_score": 0
  },

  "tiktok_analysis": {
    "presence_level": "",
    "tiktok_score": 0,
    "viral_potential": "",
    "content_style": "",
    "hook_quality": "",
    "posting_consistency": "",
    "diagnosis": "",
    "main_opportunity": "",
    "main_problem": "",
    "recommended_action": ""
  },

  "website_analysis": {
    "website_score": 0,
    "presence_level": "",
    "seo_score": 0,
    "conversion_score": 0,
    "trust_score": 0,
    "ux_score": 0,
    "seo_level": "",
    "conversion_level": "",
    "trust_level": "",
    "diagnosis": "",
    "main_problem": "",
    "main_opportunity": "",
    "recommended_action": ""
  },

  "current_losses": {
    "lost_attention": "",
    "lost_trust": "",
    "lost_sales_opportunity": "",
    "lost_positioning": "",
    "lost_community": "",
    "main_loss_summary": ""
  },

  "growth_potential": {
    "branding_potential": 0,
    "community_potential": 0,
    "sales_potential": 0,
    "viral_potential": 0,
    "scalability_potential": 0,
    "potential_summary": "",
    "biggest_growth_lever": "",
    "six_month_scenario": ""
  },

  "competitive_intelligence": {
    "market_reality": "",
    "attention_gap": "",
    "authority_advantage": "",
    "content_advantage": "",
    "psychological_advantage": "",
    "competitive_threat": "",
    "biggest_competitive_strength": "",
    "biggest_competitive_weakness": ""
  },

  "market_opportunity": {
    "white_space": "",
    "fastest_growth_path": "",
    "category_ownership": ""
  },

  "brand_perception": {
    "current_perception": "",
    "emotional_connection": "",
    "brand_archetype": "",
    "aspirational_level": ""
  },

  "deep_diagnosis": {
    "real_problem": "",
    "what_is_killing_growth": "",
    "what_feels_generic": "",
    "missing_factor": ""
  },

  "content_analysis": {
    "content_style": "",
    "viral_probability": "",
    "main_content_problem": "",
    "content_opportunity": "",
    "recommended_content_direction": ""
  },

  "sales_analysis": {
    "conversion_level": "",
    "main_sales_barrier": "",
    "trust_level": "",
    "purchase_psychology": ""
  },

  "competitive_analysis": {
    "market_position": "",
    "competitive_risk": "",
    "competitive_advantage": "",
    "market_gap_opportunity": ""
  },

  "growth_strategy": {
    "growth_angle": "",
    "narrative_recommendation": "",
    "community_strategy": "",
    "brand_evolution": ""
  },

  "scores": {
    "branding": 0,
    "positioning": 0,
    "differentiation": 0,
    "content_potential": 0,
    "sales_potential": 0,
    "digital_presence": 0,
    "scalability": 0,
    "viral_potential": 0
  },

  "fortalezas": ["", "", ""],
  "debilidades": ["", "", ""],
  "oportunidades": ["", "", ""],
  "acciones_prioritarias": ["", "", ""],

  "wow_insight": "",
  "future_prediction": "",
  "next_step": ""
}

Criterios:
- brand_score de 0 a 100.
- brand_level debe ser uno de estos: "Marca inicial", "Marca en crecimiento", "Marca competitiva", "Marca fuerte", "Marca premium", "Marca dominante".
- opportunity_level.score debe ser un número entero entre 0 y 100.
- opportunity_level.level debe ser: "Oportunidad baja", "Oportunidad media", "Oportunidad alta" u "Oportunidad excepcional".
- facebook_score, tiktok_score y website_score deben ir de 0 a 100.
- No inventes métricas exactas.
- Si sitio web fue excluido, website_analysis debe decir "Excluido del diagnóstico" y no debe afectar brand_score.
- Si TikTok fue excluido, tiktok_analysis debe decir "Excluido del diagnóstico" y no debe afectar brand_score.
- Si TikTok fue incluido pero la extracción fue limitada, TikTok debe tener peso bajo y no debe reducir de forma importante el score principal.
- Usa Instagram, Facebook, sitio web y benchmark solo cuando existan y estén incluidos.
          `,
        },
      ],
    });

    const rawResult = completion.choices[0].message.content || "{}";

    const cleanedResult = rawResult
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsedResult;

    try {
      parsedResult = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error("ERROR PARSEANDO JSON DE ORION:", parseError);
      console.error("RESPUESTA LIMPIA DE ORION:", cleanedResult);

      return Response.json({
        success: false,
        error: "ORION generó una respuesta con formato JSON inválido.",
        rawResult: cleanedResult,
      });
    }

    latestEvidenceData = await getLatestEvidenceDataForBrand(normalizedBrandName);

    const brandSearchKey = buildBrandSearchKey(normalizedBrandName);

    console.log("LATEST EVIDENCE DEBUG:", {
      brandName: normalizedBrandName,
      brandSearchKey,
      latestEvidenceCount: latestEvidenceData?.length || 0,
      sources: latestEvidenceData?.map((item: any) => ({
        source_type: item.source_type,
        evidence_status: item.evidence_status,
        followers: item.raw_data?.followers,
        following: item.raw_data?.following,
        posts: item.raw_data?.posts,
        likes: item.raw_data?.likes,
        talking_about: item.raw_data?.talking_about,
      })),
    });

    applyLatestEvidenceToOrionResult(parsedResult, latestEvidenceData || []);

    if (parsedResult.social_signals) {
      parsedResult.social_signals.instagram_followers = cleanMetricValue(
        parsedResult.social_signals.instagram_followers
      );

      parsedResult.social_signals.instagram_following = cleanMetricValue(
        parsedResult.social_signals.instagram_following
      );

      parsedResult.social_signals.instagram_posts = cleanMetricValue(
        parsedResult.social_signals.instagram_posts
      );
    }

    ensureCurrentLosses(parsedResult);
    ensureGrowthPotential(parsedResult);
    ensureFacebookAnalysis(parsedResult, facebook);
    ensureTikTokAnalysis(parsedResult, tiktok, includeTikTok);
    ensureWebsiteAnalysis(parsedResult, website, includeWebsite);
    applyEvidenceMetricsToUiPayload(parsedResult, latestEvidenceData || []);
    applySourcePolicyToResult({
      parsedResult,
      includeWebsite,
      includeTikTok,
      website,
      tiktok,
    });

    if (!parsedResult.opportunity_level) {
      parsedResult.opportunity_level = {
        level: "Oportunidad alta",
        score: 75,
        reason:
          "La marca tiene una base sólida y puede crecer rápidamente corrigiendo narrativa, comunidad y conversión.",
      };
    }

    const { data: savedAnalysis, error: brandInsertError } = await supabase
      .from("brand_analysis")
      .insert([
        {
          brand_name: normalizedBrandName,
          brand_slug: brandSlug,
          industry,
          city,
          instagram,
          facebook,
          tiktok: effectiveTikTok,
          website: effectiveWebsite,
          competitors,
          objective,
          budget,
          problem,
          analysis: JSON.stringify(parsedResult),
        },
      ])
      .select("id")
      .single();

    if (brandInsertError) {
      console.log("Error guardando análisis ORION:", brandInsertError);

      return NextResponse.json({
        success: false,
        error: "Error guardando análisis de ORION.",
      });
    }

    const orionMemory = {
      result: parsedResult,
      instagramContext,
      facebookContext,
      tiktokContext,
      websiteContext,
      instagramVisualAnalysis,
      facebookVisualAnalysis,
      tiktokVisualAnalysis,
      websiteVisualAnalysis,
      analysisScope: parsedResult.analysis_scope || null,
    };

    const now = new Date().toISOString();

    const timelineEvent = {
      timestamp: now,
      agent: "ORION",
      action: "brand_analysis",
      memory_column: "orion_memory",
      summary: parsedResult?.executive_summary || null,
    };

    let existingMemory = null;

    if (savedAnalysis?.id) {
      const { data, error } = await supabase
        .from("cosmos_memory")
        .select("*")
        .eq("brand_analysis_id", savedAnalysis.id)
        .maybeSingle();

      if (error) {
        console.log("Error buscando memoria ORION por brandAnalysisId:", error);
      }

      existingMemory = data;
    }

    const { data: memoryByBrandSlug, error: memoryByBrandSlugError } =
      await supabase
        .from("cosmos_memory")
        .select("*")
        .eq("brand_slug", brandSlug)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    console.log("ORION MEMORY BY SLUG:", memoryByBrandSlug);
    console.log("ORION MEMORY BY SLUG ERROR:", memoryByBrandSlugError);

    const { data: memoryByBrandName, error: memoryByBrandNameError } =
      await supabase
        .from("cosmos_memory")
        .select("*")
        .ilike("brand_name", normalizedBrandName)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    console.log("ORION MEMORY BY BRAND:", memoryByBrandName);
    console.log("ORION MEMORY BY BRAND ERROR:", memoryByBrandNameError);

    const memoryToUpdate = existingMemory || memoryByBrandSlug || memoryByBrandName;

    if (memoryToUpdate) {
      const currentTimeline = Array.isArray(memoryToUpdate.activity_timeline)
        ? memoryToUpdate.activity_timeline
        : [];

      const { data: updatedData, error: updateMemoryError } = await supabase
        .from("cosmos_memory")
        .update({
          brand_analysis_id: savedAnalysis?.id || memoryToUpdate.brand_analysis_id,
          brand_name: normalizedBrandName,
          brand_slug: brandSlug,
          industry,
          city,
          orion_memory: orionMemory,
          last_agent: "ORION",
          activity_timeline: [...currentTimeline, timelineEvent],
          updated_at: now,
        })
        .eq("id", memoryToUpdate.id)
        .select();

      console.log("ORION UPDATE RESULT:", updatedData);
      console.log("ORION UPDATE ERROR:", updateMemoryError);

      if (updateMemoryError) {
        return NextResponse.json({
          success: false,
          error: "ORION generó el análisis, pero no pudo actualizar COSMOS.",
          detail: updateMemoryError,
        });
      }
    } else {
      const { data: insertedData, error: insertMemoryError } = await supabase
        .from("cosmos_memory")
        .insert([
          {
            brand_analysis_id: savedAnalysis?.id || null,
            brand_name: normalizedBrandName,
            brand_slug: brandSlug,
            industry,
            city,
            orion_memory: orionMemory,
            last_agent: "ORION",
            activity_timeline: [timelineEvent],
            status: "active",
            updated_at: now,
          },
        ])
        .select();

      console.log("ORION INSERT RESULT:", insertedData);
      console.log("ORION INSERT ERROR:", insertMemoryError);

      if (insertMemoryError) {
        return NextResponse.json({
          success: false,
          error: "ORION generó el análisis, pero no pudo crear memoria en COSMOS.",
          detail: insertMemoryError,
        });
      }
    }

    await supabase.from("cosmos_agent_runs").insert([
      {
        brand_name: normalizedBrandName,
        brand_analysis_id: savedAnalysis?.id || null,
        agent_name: "ORION",
        action_type: "brand_analysis",
        input_data: {
          brandName: normalizedBrandName,
          brandSlug,
          industry,
          city,
          instagram,
          facebook,
          tiktok: effectiveTikTok,
          website: effectiveWebsite,
          competitors,
          objective,
          budget,
          problem,
          includeWebsite,
          includeTikTok,
        },
        output_data: orionMemory,
        status: "success",
      },
    ]);

    return NextResponse.json({
      success: true,
      status: "analysis_ready",
      brandAnalysisId: savedAnalysis?.id || null,
      brandSlug,
      result: parsedResult,
      instagramContext,
      facebookContext,
      tiktokContext,
      websiteContext,
      instagramVisualAnalysis,
      facebookVisualAnalysis,
      tiktokVisualAnalysis,
      websiteVisualAnalysis,
      evidence: {
        pendingSources: pendingSourcesForUi,
        includedSources: {
          instagram: hasUrl(instagram),
          facebook: hasUrl(facebook),
          tiktok: includeTikTok && hasUrl(tiktok),
          website: includeWebsite && hasUrl(website),
        },
        excludedSources: {
          tiktok: !includeTikTok || !hasUrl(tiktok),
          website: !includeWebsite || !hasUrl(website),
        },
      },
    });
  } catch (error) {
    console.log(error);

    return NextResponse.json({
      success: false,
      error: "Error analizando marca",
    });
  }
}