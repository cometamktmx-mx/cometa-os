import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { resolveBrandFromSupabase, slugifyBrand } from "@/lib/brand-resolver";
import {
  buildSalesKnowledgeContext,
  getSalesKnowledgeBase,
} from "@/lib/sales-ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type UserRole = "admin" | "client";

export async function GET(req: Request) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ver Knowledge.",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    let brandSlug =
      searchParams.get("brandSlug") || searchParams.get("slug") || "";

    const brandName =
      searchParams.get("brandName") || searchParams.get("brand_name") || "";

    if (!brandSlug && !brandName && userContext.role === "client") {
      brandSlug = userContext.allowedBrandSlugs[0] || "";
    }

    if (!brandSlug && !brandName && userContext.role === "admin") {
      brandSlug = "mar-cosmetic";
    }

    if (!brandSlug && !brandName) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se recibió una marca válida para cargar Knowledge.",
        },
        { status: 400 }
      );
    }

    const brand = await resolveBrandFromSupabase(supabase, {
      brandSlug,
      brandName,
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

    const knowledgeBase = await getSalesKnowledgeBase(brand.name);
    const context = buildSalesKnowledgeContext(knowledgeBase);

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
      counts: {
        knowledgeSources: knowledgeBase.knowledgeSources.length,
        catalogItems: knowledgeBase.catalogItems.length,
        businessRules: knowledgeBase.businessRules.length,
        faqs: knowledgeBase.faqs.length,
        suggestions: knowledgeBase.suggestions.length,
      },
      knowledgeBase,
      context,
    });
  } catch (error: any) {
    console.error("Error leyendo Knowledge Base:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error leyendo Knowledge Base",
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
          error: "No autorizado. Inicia sesión para guardar Knowledge.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      replaceExisting = false,
      knowledgeSources = [],
      catalogItems = [],
      businessRules = [],
      faqs = [],
    } = body;

    const requestedBrandSlug = String(
      body.brandSlug || body.brand_slug || ""
    ).trim();

    const requestedBrandName = String(
      body.brandName || body.brand_name || ""
    ).trim();

    if (!requestedBrandSlug && !requestedBrandName) {
      return NextResponse.json(
        {
          ok: false,
          error: "brandName o brandSlug es obligatorio.",
        },
        { status: 400 }
      );
    }

    const brand = await resolveBrandFromSupabase(supabase, {
      brandSlug: requestedBrandSlug,
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

    const cleanBrandName = String(brand.name || requestedBrandName).trim();

    if (!cleanBrandName) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo resolver el nombre de la marca.",
        },
        { status: 400 }
      );
    }

    if (replaceExisting) {
      await archiveExistingKnowledge(cleanBrandName);
    }

    const inserted: any = {
      knowledgeSources: [],
      catalogItems: [],
      businessRules: [],
      faqs: [],
    };

    if (Array.isArray(knowledgeSources) && knowledgeSources.length > 0) {
      const rows = knowledgeSources.map((item: any) => ({
        brand_name: cleanBrandName,
        source_type: item.source_type || item.sourceType || "manual_note",
        title: item.title || "Nota comercial",
        content_text: item.content_text || item.contentText || "",
        file_url: item.file_url || item.fileUrl || null,
        source_url: item.source_url || item.sourceUrl || null,
        status: item.status || "active",
        confidence_score: item.confidence_score || item.confidenceScore || 100,
        is_active: item.is_active ?? item.isActive ?? true,
        metadata: item.metadata || {},
      }));

      const { data, error } = await supabase
        .from("sales_knowledge_sources")
        .insert(rows)
        .select("*");

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "Error guardando knowledgeSources",
            details: error.message,
          },
          { status: 500 }
        );
      }

      inserted.knowledgeSources = data || [];
    }

    if (Array.isArray(catalogItems) && catalogItems.length > 0) {
      const rows = catalogItems.map((item: any) => ({
        brand_name: cleanBrandName,
        item_type: item.item_type || item.itemType || "product",
        name: item.name || "Producto sin nombre",
        description: item.description || null,
        category: item.category || null,
        sku: item.sku || null,
        price_min: toNullableNumber(item.price_min ?? item.priceMin),
        price_max: toNullableNumber(item.price_max ?? item.priceMax),
        price_text: item.price_text || item.priceText || null,
        currency: item.currency || "MXN",
        min_order_qty: toNullableInteger(
          item.min_order_qty ?? item.minOrderQty
        ),
        min_order_amount: toNullableNumber(
          item.min_order_amount ?? item.minOrderAmount
        ),
        minimum_order_text:
          item.minimum_order_text || item.minimumOrderText || null,
        availability_status:
          item.availability_status ||
          item.availabilityStatus ||
          "requires_confirmation",
        stock_notes: item.stock_notes || item.stockNotes || null,
        ideal_for: item.ideal_for || item.idealFor || null,
        sales_angle: item.sales_angle || item.salesAngle || null,
        when_to_offer: item.when_to_offer || item.whenToOffer || null,
        requires_human_confirmation:
          item.requires_human_confirmation ??
          item.requiresHumanConfirmation ??
          false,
        is_active: item.is_active ?? item.isActive ?? true,
        metadata: item.metadata || {},
      }));

      const { data, error } = await supabase
        .from("sales_catalog_items")
        .insert(rows)
        .select("*");

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "Error guardando catalogItems",
            details: error.message,
          },
          { status: 500 }
        );
      }

      inserted.catalogItems = data || [];
    }

    if (Array.isArray(businessRules) && businessRules.length > 0) {
      const rows = businessRules.map((item: any) => ({
        brand_name: cleanBrandName,
        rule_type: item.rule_type || item.ruleType || "general",
        rule_name: item.rule_name || item.ruleName || "Regla comercial",
        rule_content: item.rule_content || item.ruleContent || "",
        condition_text: item.condition_text || item.conditionText || null,
        priority: toNullableInteger(item.priority) || 50,
        requires_human_confirmation:
          item.requires_human_confirmation ??
          item.requiresHumanConfirmation ??
          false,
        is_active: item.is_active ?? item.isActive ?? true,
        metadata: item.metadata || {},
      }));

      const { data, error } = await supabase
        .from("sales_business_rules")
        .insert(rows)
        .select("*");

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "Error guardando businessRules",
            details: error.message,
          },
          { status: 500 }
        );
      }

      inserted.businessRules = data || [];
    }

    if (Array.isArray(faqs) && faqs.length > 0) {
      const rows = faqs.map((item: any) => ({
        brand_name: cleanBrandName,
        question: item.question || "Pregunta frecuente",
        answer: item.answer || "",
        intent: item.intent || null,
        keywords: Array.isArray(item.keywords) ? item.keywords : [],
        requires_human_confirmation:
          item.requires_human_confirmation ??
          item.requiresHumanConfirmation ??
          false,
        is_active: item.is_active ?? item.isActive ?? true,
        metadata: item.metadata || {},
      }));

      const { data, error } = await supabase
        .from("sales_faqs")
        .insert(rows)
        .select("*");

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "Error guardando faqs",
            details: error.message,
          },
          { status: 500 }
        );
      }

      inserted.faqs = data || [];
    }

    const knowledgeBase = await getSalesKnowledgeBase(cleanBrandName);
    const context = buildSalesKnowledgeContext(knowledgeBase);

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
      brandName: cleanBrandName,
      insertedCounts: {
        knowledgeSources: inserted.knowledgeSources.length,
        catalogItems: inserted.catalogItems.length,
        businessRules: inserted.businessRules.length,
        faqs: inserted.faqs.length,
      },
      totalCounts: {
        knowledgeSources: knowledgeBase.knowledgeSources.length,
        catalogItems: knowledgeBase.catalogItems.length,
        businessRules: knowledgeBase.businessRules.length,
        faqs: knowledgeBase.faqs.length,
        suggestions: knowledgeBase.suggestions.length,
      },
      inserted,
      context,
    });
  } catch (error: any) {
    console.error("Error guardando Knowledge Base:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error guardando Knowledge Base",
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
    console.warn("knowledge profile error:", profileError.message);
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
    console.warn("knowledge access error:", accessError.message);
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
      "No tienes permiso para visualizar o modificar este Knowledge Brain. Esta marca no está asignada a tu usuario.",
  };
}

async function archiveExistingKnowledge(brandName: string) {
  await Promise.all([
    supabase
      .from("sales_knowledge_sources")
      .update({
        is_active: false,
        status: "archived",
      })
      .eq("brand_name", brandName),

    supabase
      .from("sales_catalog_items")
      .update({
        is_active: false,
      })
      .eq("brand_name", brandName),

    supabase
      .from("sales_business_rules")
      .update({
        is_active: false,
      })
      .eq("brand_name", brandName),

    supabase
      .from("sales_faqs")
      .update({
        is_active: false,
      })
      .eq("brand_name", brandName),
  ]);
}

function toNullableNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;

  const num = Number(value);

  if (Number.isNaN(num)) return null;

  return num;
}

function toNullableInteger(value: any) {
  if (value === null || value === undefined || value === "") return null;

  const num = parseInt(String(value), 10);

  if (Number.isNaN(num)) return null;

  return num;
}