import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeWebsiteLite } from "@/lib/intelligence/websiteAnalyzer";
import fs from "fs";
import path from "path";
import { buildOrionEvidenceRecords } from "@/lib/orionEvidence";
import { buildOrionEvidenceContext } from "@/lib/orionEvidenceContext";
import { buildOrionLatestEvidenceContext } from "@/lib/orionLatestEvidenceContext";
import { slugifyBrand } from "@/lib/brand-resolver";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanMetricValue(value: any) {
  if (!value) return "No detectado";
  const text = String(value);
  const numberMatch = text.match(/[\d.,]+/);
  return numberMatch ? numberMatch[0] : text.slice(0, 20);
}

function normalizeInstagramUrl(url: string) {
  const clean = url.trim();
  if (!clean) return "";
  if (clean.startsWith("http")) return clean;
  return `https://www.instagram.com/${clean.replace("@", "")}`;
}

function normalizeWebsiteUrl(url: string) {
  const clean = url.trim();
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

function applyLatestEvidenceToOrionResult(result: any, latestEvidence: any[]) {
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

    if (raw.followers) {
      result.social_signals.instagram_followers = raw.followers;
    }

    if (raw.following) {
      result.social_signals.instagram_following = raw.following;
    }

    if (raw.posts) {
      result.social_signals.instagram_posts = raw.posts;
    }

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
    result.facebook_analysis.facebook_followers =
      raw.followers || "No detectado";

    result.facebook_analysis.likes = raw.likes || "No detectado";
    result.facebook_analysis.facebook_likes =
      raw.likes || "No detectado";

    result.facebook_analysis.talking_about =
      raw.talking_about || "No detectado";

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
        : result.facebook_analysis.diagnosis ||
          "Facebook requiere validación adicional.";

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

function ensureTikTokAnalysis(result: any, tiktok: string) {
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
        ? "TikTok puede ser una palanca de descubrimiento y viralidad si la marca trabaja hooks, formatos cortos y repetición estratégica."
        : "No se proporcionó TikTok.",
      main_opportunity: tiktok
        ? "Usar TikTok para generar alcance orgánico, autoridad y tráfico hacia otros canales."
        : "Agregar TikTok al diagnóstico.",
      main_problem: tiktok
        ? "Sin una estrategia clara de hooks y formatos, TikTok puede no generar crecimiento real."
        : "No se proporcionó TikTok.",
      recommended_action: tiktok
        ? "Crear una línea de videos cortos con hooks fuertes, prueba social, producto en uso y contenido de comunidad."
        : "Agregar TikTok de la marca.",
    };
  }
}

function ensureWebsiteAnalysis(result: any, website: string) {
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
        : "Agregar sitio web de la marca.",
    };
  }
}

function applyEvidenceMetricsToUiPayload(
  parsedResult: any,
  latestEvidenceData: any[] = []
) {
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
    parsedResult.social_signals.instagram_followers = String(
      instagramRaw.followers
    );
  }

  if (instagramRaw.following) {
    parsedResult.social_signals.instagram_following = String(
      instagramRaw.following
    );
  }

  if (instagramRaw.posts) {
    parsedResult.social_signals.instagram_posts = String(instagramRaw.posts);
  }

  parsedResult.facebook_analysis = parsedResult.facebook_analysis || {};

  if (facebookRaw.followers) {
    parsedResult.facebook_analysis.facebook_followers = String(
      facebookRaw.followers
    );
    parsedResult.facebook_analysis.followers = String(facebookRaw.followers);
  }

  if (facebookRaw.likes) {
    parsedResult.facebook_analysis.facebook_likes = String(facebookRaw.likes);
    parsedResult.facebook_analysis.likes = String(facebookRaw.likes);
  }

  if (facebookRaw.talking_about) {
    parsedResult.facebook_analysis.talking_about = String(
      facebookRaw.talking_about
    );
  }

  if (
    facebookRaw.has_messenger !== undefined &&
    facebookRaw.has_messenger !== null
  ) {
    parsedResult.facebook_analysis.has_messenger = facebookRaw.has_messenger
      ? "Detectado"
      : "No detectado";
  }

  if (
    facebookRaw.has_whatsapp !== undefined &&
    facebookRaw.has_whatsapp !== null
  ) {
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
      "El perfil de TikTok fue detectado, pero TikTok mostró una barrera de inicio de sesión o verificación, por lo que no se pudieron validar seguidores, likes, siguiendo o videos con certeza.";
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
    parsedResult.tiktok_context.profileSignals.username = String(
      tiktokRaw.username
    );
  } else if (tiktokUsernameMatch?.[1]) {
    parsedResult.tiktok_context.profileSignals.username = `@${tiktokUsernameMatch[1]}`;
  }

  if (tiktokRaw.followers) {
    parsedResult.tiktok_context.profileSignals.followers = String(
      tiktokRaw.followers
    );
  }

  if (tiktokRaw.likes) {
    parsedResult.tiktok_context.profileSignals.likes = String(tiktokRaw.likes);
  }

  if (tiktokRaw.following) {
    parsedResult.tiktok_context.profileSignals.following = String(
      tiktokRaw.following
    );
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

    const orionEvidenceContext = buildOrionEvidenceContext({
      brandName,
      industry,
      city,
      instagram,
      facebook,
      tiktok,
      website,
      competitors,
    });

    const orionLatestEvidenceContext = await buildOrionLatestEvidenceContext({
      supabase,
      brandName,
    });

    const instagramContext = null;
    const facebookContext = null;
    const tiktokContext = null;
    const websiteContext = website
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

    const tiktokVisualAnalysis = await analyzeScreenshotWithVision({
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
    });

    const websiteVisualAnalysis = await analyzeScreenshotWithVision({
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
    });

    const profileSignalsText =
      "Scraper de Instagram desactivado temporalmente.";

    const engagementSignalsText =
      "Scraper de Instagram desactivado temporalmente.";

    const scrapingStatusText =
      "Scraper de Instagram desactivado temporalmente.";

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
- Si el scraper está desactivado, debes decir que el análisis de redes se basa en información declarada y oportunidades pendientes de validación.
- No inventes seguidores, publicaciones, engagement, frecuencia, tráfico web, ventas ni conversiones.
- Cuando una métrica no esté disponible, usa "No detectado" o 0 según corresponda en el JSON.
- Las oportunidades estratégicas sí pueden inferirse, pero deben estar redactadas como inferencias basadas en la información disponible.
          `,
        },
        {
          role: "user",
          content: `
Analiza esta marca con profundidad estratégica.

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

DATOS DECLARADOS:
Nombre: ${brandName}
Industria o giro: ${industry}
Ciudad o zona: ${city || "No especificado"}
Instagram: ${instagram || "No especificado"}
Facebook: ${facebook || "No especificado"}
TikTok: ${tiktok || "No especificado"}
Sitio web: ${website || "No especificado"}
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

TEXTO EXTRAÍDO DE INSTAGRAM:
Scraper de Instagram desactivado temporalmente en producción.

ANÁLISIS VISUAL DE INSTAGRAM:
${instagramVisualAnalysis}

SEÑALES ESTRUCTURADAS DE FACEBOOK:
Scraper de Facebook desactivado temporalmente en producción.

SEÑALES DE CONTENIDO DE FACEBOOK:
Scraper de Facebook desactivado temporalmente en producción.

TEXTO EXTRAÍDO DE FACEBOOK:
Scraper de Facebook desactivado temporalmente en producción.

ANÁLISIS VISUAL DE FACEBOOK:
${facebookVisualAnalysis}

SEÑALES ESTRUCTURADAS DE TIKTOK:
Scraper de TikTok desactivado temporalmente en producción.

SEÑALES DE CONTENIDO DE TIKTOK:
Scraper de TikTok desactivado temporalmente en producción.

TEXTO EXTRAÍDO DE TIKTOK:
Scraper de TikTok desactivado temporalmente en producción.

ANÁLISIS VISUAL DE TIKTOK:
${tiktokVisualAnalysis}

SEÑALES DEL SITIO WEB:
${websiteContext ? JSON.stringify(websiteContext, null, 2) : "No se proporcionó sitio web."}

ESTADO TÉCNICO DEL SITIO WEB:
${websiteContext?.available ? "Sitio web analizado correctamente con Website Intelligence." : "Sitio web no disponible o no analizado."}

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
- website_analysis.seo_score debe ir de 0 a 100.
- website_analysis.conversion_score debe ir de 0 a 100.
- website_analysis.trust_score debe ir de 0 a 100.
- website_analysis.ux_score debe ir de 0 a 100.
- website_score debe ser el promedio estratégico de SEO, conversión, confianza y UX, ajustado por calidad visual y claridad comercial.
- Usa Instagram, Facebook, TikTok, sitio web y benchmark cuando existan.
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

    const brandSearchKey = String(brandName || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "");

    const { data: latestEvidenceData, error: latestEvidenceError } =
      await supabase
        .from("orion_latest_evidence")
        .select("*")
        .eq("brand_search_key", brandSearchKey);

    console.log("LATEST EVIDENCE DEBUG:", {
      brandName,
      brandSearchKey,
      latestEvidenceCount: latestEvidenceData?.length || 0,
      sources: latestEvidenceData?.map((item: any) => ({
        source_type: item.source_type,
        followers: item.raw_data?.followers,
        following: item.raw_data?.following,
        posts: item.raw_data?.posts,
        likes: item.raw_data?.likes,
        talking_about: item.raw_data?.talking_about,
      })),
    });

    if (latestEvidenceError) {
      console.log("Error leyendo latest evidence para ORION:", latestEvidenceError);
    }

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
    ensureTikTokAnalysis(parsedResult, tiktok);
    ensureWebsiteAnalysis(parsedResult, website);
    applyEvidenceMetricsToUiPayload(parsedResult, latestEvidenceData || []);

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
          tiktok,
          website,
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

    const evidenceRecords = buildOrionEvidenceRecords({
      brandAnalysisId: savedAnalysis?.id || null,
      brandName: normalizedBrandName,
      instagram,
      facebook,
      tiktok,
      website,
      competitors,
    });

    if (evidenceRecords.length > 0) {
      const { error: evidenceError } = await supabase
        .from("orion_evidence")
        .insert(evidenceRecords);

      if (evidenceError) {
        console.log("Error guardando ORION Evidence:", evidenceError);
      }
    }

    try {
      const evidenceResponse = await fetch(
        new URL("/api/orion/evidence", req.url),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandAnalysisId: savedAnalysis?.id || null,
            brandName: normalizedBrandName,
            brandSlug,
            industry,
            city,
            instagram,
            facebook,
            tiktok,
            website,
          }),
        }
      );

      const evidenceData = await evidenceResponse.json();

      console.log("ORION EVIDENCE RESULT:", evidenceData);
    } catch (evidenceError) {
      console.log("ORION Evidence Layer no pudo ejecutarse:", evidenceError);
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
          tiktok,
          website,
          competitors,
          objective,
          budget,
          problem,
        },
        output_data: orionMemory,
        status: "success",
      },
    ]);

    return NextResponse.json({
      success: true,
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
    });
  } catch (error) {
    console.log(error);

    return NextResponse.json({
      success: false,
      error: "Error analizando marca",
    });
  }
}