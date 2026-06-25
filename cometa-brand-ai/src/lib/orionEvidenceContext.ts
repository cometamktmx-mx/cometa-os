type OrionEvidenceContextInput = {
  brandName?: string | null;
  industry?: string | null;
  city?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  website?: string | null;
  competitors?: string | string[] | null;
};

function hasValue(value?: string | null) {
  return Boolean(value && value.trim() !== "");
}

function formatCompetitors(competitors?: string | string[] | null) {
  if (!competitors) return "No se proporcionaron competidores.";

  if (Array.isArray(competitors)) {
    const clean = competitors.filter(Boolean).map((item) => String(item).trim());
    return clean.length > 0 ? clean.join(", ") : "No se proporcionaron competidores.";
  }

  return competitors.trim() !== "" ? competitors : "No se proporcionaron competidores.";
}

export function buildOrionEvidenceContext(input: OrionEvidenceContextInput) {
  const evidenceItems = [
    {
      source: "Instagram",
      provided: hasValue(input.instagram),
      url: input.instagram || null,
      evidence_level: hasValue(input.instagram)
        ? "URL proporcionada por el usuario. Pendiente de validación visual o scraping externo."
        : "No proporcionado.",
    },
    {
      source: "Facebook",
      provided: hasValue(input.facebook),
      url: input.facebook || null,
      evidence_level: hasValue(input.facebook)
        ? "URL proporcionada por el usuario. Pendiente de validación visual o scraping externo."
        : "No proporcionado.",
    },
    {
      source: "TikTok",
      provided: hasValue(input.tiktok),
      url: input.tiktok || null,
      evidence_level: hasValue(input.tiktok)
        ? "URL proporcionada por el usuario. Pendiente de validación visual o scraping externo."
        : "No proporcionado.",
    },
    {
      source: "Website",
      provided: hasValue(input.website),
      url: input.website || null,
      evidence_level: hasValue(input.website)
        ? "Sitio web proporcionado por el usuario. Puede analizarse con Website Analyzer Lite si está disponible."
        : "No proporcionado.",
    },
    {
      source: "Competidores",
      provided: Boolean(input.competitors),
      url: null,
      evidence_level: formatCompetitors(input.competitors),
    },
  ];

  return `
ORION EVIDENCE LAYER CONTEXT

Marca analizada: ${input.brandName || "No especificada"}
Industria: ${input.industry || "No especificada"}
Ciudad / Mercado: ${input.city || "No especificado"}

Evidencia disponible actualmente:
${JSON.stringify(evidenceItems, null, 2)}

Reglas obligatorias para ORION:
1. No afirmes que ingresaste, navegaste, scrapeaste o validaste redes sociales si solo tienes una URL proporcionada.
2. Si una red social fue proporcionada, trátala como "evidencia declarada pendiente de validación".
3. Diferencia claramente entre:
   - Dato proporcionado por el usuario.
   - Señal observable disponible.
   - Inferencia estratégica.
   - Información pendiente de validar.
4. No inventes métricas exactas como seguidores, engagement, frecuencia de publicación, visitas web o conversiones si no están en la evidencia.
5. Puedes inferir oportunidades estratégicas, pero debes decir que son inferencias basadas en la información disponible.
6. Si falta evidencia real, recomienda qué debería revisar ORION Evidence Layer después.
7. El diagnóstico debe sonar profesional, seguro y estratégico, pero nunca debe vender humo.
`;
}