import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeWebsiteLite } from "@/lib/intelligence/websiteAnalyzer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizeUrl(url?: string) {
  if (!url) return "";
  const clean = url.trim();
  if (!clean) return "";
  if (clean.startsWith("http")) return clean;
  return `https://${clean}`;
}

function normalizeSocialUrl(value?: string, platform?: string) {
  if (!value) return "";
  const clean = value.trim();
  if (!clean) return "";

  if (clean.startsWith("http")) return clean;

  const username = clean.replace("@", "");

  if (platform === "instagram") return `https://www.instagram.com/${username}`;
  if (platform === "facebook") return `https://www.facebook.com/${username}`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${username}`;

  return clean;
}

function buildSocialEvidence(platform: string, url: string) {
  return {
    platform,
    url,
    available: Boolean(url),
    extraction_method: "url_metadata_v1",
    signals: {
      profile_url_detected: Boolean(url),
      username_or_url: url || null,
    },
  };
}

async function saveEvidence(payload: any) {
  console.log("EVIDENCE PAYLOAD:", payload);

  const { data, error } = await supabase
    .from("brand_evidence")
    .insert([payload])
    .select("*");

  console.log("EVIDENCE INSERT DATA:", data);
  console.log("EVIDENCE INSERT ERROR:", error);

  if (error) {
    throw error;
  }

  return data;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandAnalysisId,
      brandName,
      industry,
      city,
      instagram,
      facebook,
      tiktok,
      website,
    } = body;

    if (!brandName) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName.",
      });
    }

    const evidenceResults: any[] = [];

    const websiteUrl = normalizeUrl(website);

    if (websiteUrl) {
      const websiteEvidence = await analyzeWebsiteLite(websiteUrl);

      const payload = {
        brand_analysis_id: brandAnalysisId || null,
        brand_name: brandName,
        industry: industry || null,
        city: city || null,
        source: "website",
        evidence_type: "website_lite",
        source_url: websiteUrl,
        raw_data: websiteEvidence || {},
        extracted_signals: websiteEvidence?.extractedData || {},
        ai_summary: websiteEvidence?.available
          ? "Sitio web analizado con Website Analyzer Lite."
          : "Sitio web no disponible o no analizado.",
        confidence: websiteEvidence?.confidence || 0,
        status: "active",
      };

      await saveEvidence(payload);
      evidenceResults.push(payload);
    }

    const socials = [
      {
        source: "instagram",
        url: normalizeSocialUrl(instagram, "instagram"),
      },
      {
        source: "facebook",
        url: normalizeSocialUrl(facebook, "facebook"),
      },
      {
        source: "tiktok",
        url: normalizeSocialUrl(tiktok, "tiktok"),
      },
    ];

    for (const social of socials) {
      if (!social.url) continue;

      const socialEvidence = buildSocialEvidence(social.source, social.url);

      const payload = {
        brand_analysis_id: brandAnalysisId || null,
        brand_name: brandName,
        industry: industry || null,
        city: city || null,
        source: social.source,
        evidence_type: "profile_url",
        source_url: social.url,
        raw_data: socialEvidence,
        extracted_signals: socialEvidence.signals,
        ai_summary: `Perfil de ${social.source} registrado como evidencia inicial.`,
        confidence: 40,
        status: "active",
      };

      await saveEvidence(payload);
      evidenceResults.push(payload);
    }

    return NextResponse.json({
      success: true,
      evidenceCount: evidenceResults.length,
      evidence: evidenceResults,
    });
  } catch (error: any) {
    console.log("Error en ORION Evidence Layer:", error);

    return NextResponse.json({
      success: false,
      error: error?.message || "Error generando evidencia ORION.",
    });
  }
}