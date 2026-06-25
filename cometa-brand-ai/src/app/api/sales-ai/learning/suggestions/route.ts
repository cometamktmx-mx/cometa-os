import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { resolveBrandFromSupabase, slugifyBrand } from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALLOWED_STATUSES = ["pending", "approved", "rejected", "applied"];

type UserRole = "admin" | "client";

export async function GET(req: Request) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ver Learning.",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    let brandSlug =
      searchParams.get("brandSlug") || searchParams.get("slug") || "";

    const requestedBrandName =
      searchParams.get("brandName") || searchParams.get("brand_name") || "";

    const status = searchParams.get("status") || "pending";
    const limit = clamp(Number(searchParams.get("limit") || 50), 1, 200);

    if (status !== "all" && !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "status inválido",
          allowedStatuses: ["all", ...ALLOWED_STATUSES],
        },
        { status: 400 }
      );
    }

    if (!brandSlug && !requestedBrandName && userContext.role === "client") {
      brandSlug = userContext.allowedBrandSlugs[0] || "";
    }

    if (!brandSlug && !requestedBrandName && userContext.role === "admin") {
      brandSlug = "mar-cosmetic";
    }

    if (!brandSlug && !requestedBrandName) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se recibió una marca válida para cargar Learning.",
        },
        { status: 400 }
      );
    }

    const brand = await resolveBrandFromSupabase(supabase, {
      brandSlug,
      brandName: requestedBrandName,
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

    let query = supabase
      .from("sales_playbook_suggestions")
      .select("*")
      .eq("brand_name", brand.name)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Error leyendo sugerencias",
          details: error.message,
        },
        { status: 500 }
      );
    }

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
      brandName: brand.name,
      status,
      count: data?.length || 0,
      suggestions: data || [],
    });
  } catch (error: any) {
    console.error("Error GET learning suggestions:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno leyendo sugerencias",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para editar Learning.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      suggestionId,
      status,
      reviewNote,
      title,
      suggestedValue,
      currentValue,
      reason,
      metadata,
    } = body;

    if (!suggestionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "suggestionId es obligatorio",
        },
        { status: 400 }
      );
    }

    const { data: currentSuggestion, error: currentError } = await supabase
      .from("sales_playbook_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle();

    if (currentError || !currentSuggestion) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró la sugerencia",
          details: currentError?.message || null,
        },
        { status: 404 }
      );
    }

    const accessValidation = await validateSuggestionAccess({
      userContext,
      suggestion: currentSuggestion,
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
          requestedBrand: accessValidation.brand || null,
        },
        { status: 403 }
      );
    }

    const nextMetadata = {
      ...(currentSuggestion.metadata || {}),
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      review_note: reviewNote ?? currentSuggestion.metadata?.review_note ?? null,
      reviewed_at: reviewNote
        ? new Date().toISOString()
        : currentSuggestion.metadata?.reviewed_at,
      edited_at:
        title !== undefined ||
        suggestedValue !== undefined ||
        currentValue !== undefined ||
        reason !== undefined ||
        metadata !== undefined
          ? new Date().toISOString()
          : currentSuggestion.metadata?.edited_at,
    };

    const updatePayload: any = {
      metadata: nextMetadata,
    };

    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          {
            ok: false,
            error: "status inválido",
            allowedStatuses: ALLOWED_STATUSES,
          },
          { status: 400 }
        );
      }

      updatePayload.status = status;
    }

    if (title !== undefined) updatePayload.title = cleanText(title);
    if (suggestedValue !== undefined) {
      updatePayload.suggested_value = cleanText(suggestedValue);
    }
    if (currentValue !== undefined) {
      updatePayload.current_value = cleanText(currentValue) || null;
    }
    if (reason !== undefined) updatePayload.reason = cleanText(reason) || null;

    const { data, error } = await supabase
      .from("sales_playbook_suggestions")
      .update(updatePayload)
      .eq("id", suggestionId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "Error actualizando sugerencia",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        allowedBrandSlugs: userContext.allowedBrandSlugs,
      },
      action: status ? "status_updated" : "suggestion_updated",
      suggestion: data,
    });
  } catch (error: any) {
    console.error("Error PATCH learning suggestions:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno actualizando sugerencia",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para aplicar Learning.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const { suggestionId } = body;

    if (!suggestionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "suggestionId es obligatorio",
        },
        { status: 400 }
      );
    }

    const { data: suggestion, error: suggestionError } = await supabase
      .from("sales_playbook_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .maybeSingle();

    if (suggestionError || !suggestion) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró la sugerencia",
          details: suggestionError?.message || null,
        },
        { status: 404 }
      );
    }

    const accessValidation = await validateSuggestionAccess({
      userContext,
      suggestion,
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
          requestedBrand: accessValidation.brand || null,
        },
        { status: 403 }
      );
    }

    if (suggestion.status === "applied") {
      return NextResponse.json({
        ok: true,
        user: {
          id: userContext.userId,
          email: userContext.email,
          role: userContext.role,
          isAdmin: userContext.role === "admin",
          allowedBrandSlugs: userContext.allowedBrandSlugs,
        },
        action: "already_applied",
        suggestion,
      });
    }

    const appliedResult = await applySuggestion(suggestion);

    const metadata = {
      ...(suggestion.metadata || {}),
      applied_to: appliedResult,
      applied_at: new Date().toISOString(),
    };

    const { data: updatedSuggestion, error: updateError } = await supabase
      .from("sales_playbook_suggestions")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        metadata,
      })
      .eq("id", suggestionId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          ok: false,
          error: "La sugerencia se aplicó, pero falló al actualizar su status",
          details: updateError.message,
          appliedResult,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        allowedBrandSlugs: userContext.allowedBrandSlugs,
      },
      action: "applied",
      appliedResult,
      suggestion: updatedSuggestion,
    });
  } catch (error: any) {
    console.error("Error POST learning suggestions:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno aplicando sugerencia",
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
        } catch {
          // No hacemos nada aquí.
        }
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
    console.warn("learning suggestions profile error:", profileError.message);
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
    console.warn("learning suggestions access error:", accessError.message);
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
      "No tienes permiso para visualizar o modificar este Learning Hub. Esta marca no está asignada a tu usuario.",
  };
}

async function validateSuggestionAccess({
  userContext,
  suggestion,
}: {
  userContext: {
    role: UserRole;
    allowedBrandSlugs: string[];
  };
  suggestion: any;
}) {
  const brandName = cleanText(suggestion.brand_name);

  const brand = await resolveBrandFromSupabase(supabase, {
    brandName,
  });

  const validation = validateBrandAccess({
    userContext,
    brandSlug: brand.slug,
  });

  return {
    ...validation,
    brand: {
      slug: brand.slug,
      name: brand.name,
    },
  };
}

async function applySuggestion(suggestion: any) {
  const type = suggestion.suggestion_type;
  const brandName = suggestion.brand_name;
  const title = cleanText(suggestion.title);
  const suggestedValue = cleanText(suggestion.suggested_value);
  const reason = cleanText(suggestion.reason);
  const confidenceScore = Number(suggestion.confidence_score || 0);
  const metadata = suggestion.metadata || {};

  if (type === "faq") {
    const { data, error } = await supabase
      .from("sales_faqs")
      .insert({
        brand_name: brandName,
        question: title,
        answer: suggestedValue,
        intent: metadata.detected_intent || "learned_faq",
        keywords: extractKeywords(`${title} ${suggestedValue}`),
        requires_human_confirmation:
          metadata.risk_level === "high" || metadata.risk_level === "medium",
        is_active: true,
        metadata: {
          source: "learning_engine",
          source_suggestion_id: suggestion.id,
          reason,
          confidence_score: confidenceScore,
        },
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return {
      targetTable: "sales_faqs",
      targetId: data.id,
    };
  }

  if (type === "business_rule") {
    return await insertBusinessRule({
      suggestion,
      ruleType: "general",
      priority: 80,
      requiresHumanConfirmation: metadata.risk_level === "high",
    });
  }

  if (type === "escalation_rule") {
    return await insertBusinessRule({
      suggestion,
      ruleType: "escalation",
      priority: 95,
      requiresHumanConfirmation: true,
    });
  }

  if (type === "forbidden_promise") {
    return await insertBusinessRule({
      suggestion,
      ruleType: "forbidden",
      priority: 100,
      requiresHumanConfirmation: true,
    });
  }

  if (type === "followup") {
    return await insertBusinessRule({
      suggestion,
      ruleType: "followup",
      priority: 75,
      requiresHumanConfirmation: false,
    });
  }

  if (type === "catalog_item" || type === "offer") {
    const { data, error } = await supabase
      .from("sales_catalog_items")
      .insert({
        brand_name: brandName,
        item_type: type === "offer" ? "bundle" : "product",
        name: title,
        description: suggestedValue,
        category: "Aprendizaje SALES AI",
        price_text: "Precio no definido. Requiere validación comercial.",
        availability_status: "requires_confirmation",
        stock_notes: "Elemento creado desde sugerencia del Learning Engine.",
        ideal_for: metadata.detected_intent || null,
        sales_angle: reason || null,
        when_to_offer: suggestedValue || null,
        requires_human_confirmation: true,
        is_active: true,
        metadata: {
          source: "learning_engine",
          source_suggestion_id: suggestion.id,
          reason,
          confidence_score: confidenceScore,
        },
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return {
      targetTable: "sales_catalog_items",
      targetId: data.id,
    };
  }

  return await insertKnowledgeSource(suggestion);
}

async function insertBusinessRule({
  suggestion,
  ruleType,
  priority,
  requiresHumanConfirmation,
}: {
  suggestion: any;
  ruleType: string;
  priority: number;
  requiresHumanConfirmation: boolean;
}) {
  const metadata = suggestion.metadata || {};

  const { data, error } = await supabase
    .from("sales_business_rules")
    .insert({
      brand_name: suggestion.brand_name,
      rule_type: ruleType,
      rule_name: cleanText(suggestion.title),
      rule_content: cleanText(suggestion.suggested_value),
      condition_text: cleanText(metadata.evidence) || null,
      priority,
      requires_human_confirmation: requiresHumanConfirmation,
      is_active: true,
      metadata: {
        source: "learning_engine",
        source_suggestion_id: suggestion.id,
        reason: cleanText(suggestion.reason),
        confidence_score: Number(suggestion.confidence_score || 0),
        detected_intent: metadata.detected_intent || null,
        risk_level: metadata.risk_level || null,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    targetTable: "sales_business_rules",
    targetId: data.id,
  };
}

async function insertKnowledgeSource(suggestion: any) {
  const metadata = suggestion.metadata || {};

  const contentText = `
Aprendizaje detectado por SALES AI.

Tipo de sugerencia:
${suggestion.suggestion_type}

Sugerencia:
${cleanText(suggestion.suggested_value)}

Razón:
${cleanText(suggestion.reason)}

Evidencia:
${cleanText(metadata.evidence) || "Sin evidencia registrada"}
`.trim();

  const { data, error } = await supabase
    .from("sales_knowledge_sources")
    .insert({
      brand_name: suggestion.brand_name,
      source_type: "conversation_learning",
      title: cleanText(suggestion.title),
      content_text: contentText,
      status: "active",
      confidence_score: Number(suggestion.confidence_score || 0),
      is_active: true,
      metadata: {
        source: "learning_engine",
        source_suggestion_id: suggestion.id,
        detected_intent: metadata.detected_intent || null,
        risk_level: metadata.risk_level || null,
        where_to_apply: metadata.where_to_apply || null,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    targetTable: "sales_knowledge_sources",
    targetId: data.id,
  };
}

function cleanText(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function extractKeywords(text: string) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");

  const stopWords = new Set([
    "que",
    "con",
    "para",
    "como",
    "pero",
    "esta",
    "este",
    "esto",
    "los",
    "las",
    "una",
    "uno",
    "por",
    "del",
    "de",
    "la",
    "el",
    "y",
    "o",
    "a",
    "en",
    "se",
    "si",
    "al",
    "un",
    "es",
  ]);

  const words = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4)
    .filter((word) => !stopWords.has(word));

  return Array.from(new Set(words)).slice(0, 12);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}