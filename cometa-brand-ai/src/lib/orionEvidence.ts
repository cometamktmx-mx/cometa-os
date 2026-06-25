export type OrionEvidenceInput = {
  brandAnalysisId?: string | null;
  brandName: string;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  website?: string | null;
  competitors?: string | string[] | null;
};

function normalizeUrl(value?: string | null) {
  if (!value) return null;

  const clean = value.trim();

  if (!clean) return null;

  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }

  if (clean.includes(".com") || clean.includes(".mx") || clean.includes(".net")) {
    return `https://${clean}`;
  }

  return clean;
}

function parseCompetitors(competitors?: string | string[] | null): string[] {
  if (!competitors) return [];

  if (Array.isArray(competitors)) {
    return competitors.filter(Boolean).map((item) => String(item).trim());
  }

  return competitors
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildOrionEvidenceRecords(input: OrionEvidenceInput) {
  const records: any[] = [];

  const base = {
    brand_analysis_id: input.brandAnalysisId || null,
    brand_name: input.brandName,
    evidence_status: "pending",
    collection_method: "form_input",
    confidence_score: 40,
  };

  const instagram = normalizeUrl(input.instagram);
  const facebook = normalizeUrl(input.facebook);
  const tiktok = normalizeUrl(input.tiktok);
  const website = normalizeUrl(input.website);

  if (instagram) {
    records.push({
      ...base,
      source_type: "instagram",
      source_url: instagram,
      source_name: "Instagram",
      raw_data: {
        submitted_url: instagram,
      },
      evidence_summary: "Perfil de Instagram recibido desde el formulario de ORION. Pendiente de validación visual o scraping externo.",
    });
  }

  if (facebook) {
    records.push({
      ...base,
      source_type: "facebook",
      source_url: facebook,
      source_name: "Facebook",
      raw_data: {
        submitted_url: facebook,
      },
      evidence_summary: "Perfil de Facebook recibido desde el formulario de ORION. Pendiente de validación visual o scraping externo.",
    });
  }

  if (tiktok) {
    records.push({
      ...base,
      source_type: "tiktok",
      source_url: tiktok,
      source_name: "TikTok",
      raw_data: {
        submitted_url: tiktok,
      },
      evidence_summary: "Perfil de TikTok recibido desde el formulario de ORION. Pendiente de validación visual o scraping externo.",
    });
  }

  if (website) {
    records.push({
      ...base,
      source_type: "website",
      source_url: website,
      source_name: "Website",
      collection_method: "form_input",
      raw_data: {
        submitted_url: website,
      },
      evidence_summary: "Sitio web recibido desde el formulario de ORION. Puede ser analizado por Website Analyzer Lite.",
      confidence_score: 50,
    });
  }

  const competitorsList = parseCompetitors(input.competitors);

  for (const competitor of competitorsList) {
    records.push({
      ...base,
      source_type: "competitor",
      source_url: normalizeUrl(competitor),
      source_name: competitor,
      raw_data: {
        submitted_competitor: competitor,
      },
      evidence_summary: "Competidor recibido desde el formulario de ORION. Pendiente de análisis comparativo.",
    });
  }

  return records;
}