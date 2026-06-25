export async function buildOrionLatestEvidenceContext({
  supabase,
  brandName,
}: {
  supabase: any;
  brandName: string;
}) {
  if (!brandName) {
    return `
ORION LATEST EVIDENCE CONTEXT

No se proporciono nombre de marca para buscar evidencia externa.
`;
  }

  const brandSearchKey = String(brandName)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");

  const { data, error } = await supabase
    .from("orion_latest_evidence")
    .select(
      `
      brand_search_key,
      brand_name,
      source_type,
      source_url,
      evidence_status,
      collection_method,
      raw_data,
      visual_signals,
      evidence_summary,
      confidence_score,
      created_at
      `
    )
    .eq("brand_search_key", brandSearchKey)
    .order("source_type", { ascending: true });

  if (error) {
    console.log("Error leyendo orion_latest_evidence:", error);

    return `
ORION LATEST EVIDENCE CONTEXT

No se pudo consultar evidencia externa por error tecnico.
ORION debe continuar con datos declarados y no debe inventar metricas.
`;
  }

  if (!data || data.length === 0) {
    return `
ORION LATEST EVIDENCE CONTEXT

No existe evidencia externa validada todavia para esta marca.
ORION debe analizar unicamente con datos declarados, sitio web si existe y evidencia pendiente.
No debe inventar metricas de redes sociales.
`;
  }

  const evidenceSummary = data.map((item: any) => {
    const raw = item.raw_data || {};
    const visualSignals = item.visual_signals || raw.visual_signals || {};

    return {
      brand_search_key: item.brand_search_key,
      brand_name: item.brand_name,
      source_type: item.source_type,
      source_url: item.source_url,
      evidence_status: item.evidence_status,
      collection_method: item.collection_method,
      confidence_score: item.confidence_score,
      evidence_summary: item.evidence_summary,

      extracted_data: {
        title: raw.title || null,
        description: raw.description || null,
        og_title: raw.og_title || null,
        og_description: raw.og_description || null,

        followers: raw.followers || null,
        following: raw.following || null,
        posts: raw.posts || null,
        likes: raw.likes || null,
        talking_about: raw.talking_about || null,

        page_accessible: raw.page_accessible ?? null,
        access_issue: raw.access_issue || null,
        extraction_quality: raw.extraction_quality || null,
        ai_summary: raw.ai_summary || null,

        has_messenger: raw.has_messenger || null,
        has_whatsapp: raw.has_whatsapp || null,
        has_contact_signal: raw.has_contact_signal || null,
        has_shop_signal: raw.has_shop_signal || null,
        headings: raw.headings || null,
        ctas: raw.ctas || null,

        commercial_signals: raw.commercial_signals || null,
        content_signals: raw.content_signals || null,
        visible_text_preview:
          raw.visible_text_preview || raw.detected_text_sample || null,
      },

      visual_signals: visualSignals,
      created_at: item.created_at,
    };
  });

  return `
ORION LATEST EVIDENCE CONTEXT

Evidencia externa encontrada para la marca:
${JSON.stringify(evidenceSummary, null, 2)}

Reglas para usar esta evidencia:
1. Esta evidencia si fue recolectada por ORION Evidence Worker.
2. Usa metricas como seguidores, seguidos, publicaciones, likes, personas hablando de esto, titulo, descripcion y señales visibles solo si aparecen en extracted_data.
3. Si extraction_quality es "high", puedes tratar la evidencia como confiable.
4. Si extraction_quality es "medium", usala como señal util pero no absoluta.
5. Si extraction_quality es "low", mencionarla como evidencia parcial.
6. No mezcles evidencia vieja con nueva. Usa esta evidencia como la version mas reciente disponible por plataforma.
7. Diferencia entre datos recolectados por worker e inferencias estrategicas.
8. Si una plataforma tiene page_accessible true pero pocas metricas, explica que la plataforma fue detectada, pero la extraccion publica puede estar limitada.
9. No inventes metricas que no aparezcan en esta evidencia.
`;
}