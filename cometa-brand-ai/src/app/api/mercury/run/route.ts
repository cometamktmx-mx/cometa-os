import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserContext = {
  role: "admin" | "internal";
  userId: string | null;
  email: string | null;
};

type MercurySettings = {
  id: string;
  brand_name: string;
  brand_slug: string;
  content_cycle_day: number;
  generate_days_before: number;
  posts_per_month: number;
  reels_per_month: number;
  stories_per_week: number;
  preferred_platforms: string[];
  content_focus: string[];
  assigned_designer_id: string | null;
  assigned_reels_id: string | null;
  assigned_cm_id: string | null;
  requires_internal_approval: boolean;
  requires_client_approval: boolean;
  auto_generate_enabled: boolean;
  active: boolean;
  internal_notes: string | null;
  client_notes: string | null;
};

type MercuryBody = {
  brandName?: string;
  brandSlug?: string;
  cycleMonth?: number;
  cycleYear?: number;
  forceRegenerate?: boolean;
  runDueBrands?: boolean;
};

type MercuryGeneratedItem = {
  title?: string;
  content_type?: string;
  platform?: string;
  objective?: string;
  funnel_stage?: string | null;
  brief?: string;
  copy_base?: string;
  cta?: string;
  visual_direction?: string;
  reference_notes?: string;
  due_date?: string | null;
  publish_date?: string | null;
  assigned_role?: string | null;
  priority?: string;
};

type MercuryGeneratedCalendar = {
  monthly_objective?: string;
  strategic_focus?: string;
  campaign_theme?: string;
  key_offers?: string[];
  content_angles?: string[];
  channels?: string[];
  items?: MercuryGeneratedItem[];
};

const OPENAI_MODEL = process.env.MERCURY_OPENAI_MODEL || "gpt-4.1-mini";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing Supabase service role environment variables.");
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseCsv(value?: string | null) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function slugifyBrand(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function isUuid(value: unknown) {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isInternalRequest(request: NextRequest) {
  const expected =
    process.env.MERCURY_INTERNAL_SECRET ||
    process.env.SALES_AI_INTERNAL_SECRET ||
    "";

  if (!expected) return false;

  const received =
    request.headers.get("x-cometa-internal-secret") ||
    request.headers.get("x-mercury-internal-secret") ||
    "";

  return received === expected;
}

async function getUserContext(request: NextRequest): Promise<UserContext> {
  if (isInternalRequest(request)) {
    return {
      role: "internal",
      userId: null,
      email: "internal@cometaos.local",
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(supabaseUrl, anonKey, {
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
          // Ignore cookie write issues inside route handlers.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const adminEmails = parseCsv(process.env.COMETA_ADMIN_EMAILS);
  const adminIds = parseCsv(process.env.COMETA_ADMIN_USER_IDS);
  const email = user.email?.toLowerCase() || "";

  if (adminEmails.includes(email) || adminIds.includes(user.id.toLowerCase())) {
    return {
      role: "admin",
      userId: user.id,
      email,
    };
  }

  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    return {
      role: "admin",
      userId: user.id,
      email,
    };
  }

  throw new Response("Forbidden", { status: 403 });
}

function getTargetCycle(settings: MercurySettings, body: MercuryBody) {
  if (body.cycleMonth && body.cycleYear) {
    return {
      cycleMonth: Number(body.cycleMonth),
      cycleYear: Number(body.cycleYear),
    };
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (now.getDate() <= settings.content_cycle_day) {
    return {
      cycleMonth: currentMonth,
      cycleYear: currentYear,
    };
  }

  const next = new Date(currentYear, currentMonth, 1);

  return {
    cycleMonth: next.getMonth() + 1,
    cycleYear: next.getFullYear(),
  };
}

function getCycleDates(settings: MercurySettings, month: number, year: number) {
  const start = new Date(year, month - 1, settings.content_cycle_day);
  const end = new Date(year, month, settings.content_cycle_day - 1);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
  };
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shouldGenerateNow(settings: MercurySettings) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  let targetStart = new Date(year, month, settings.content_cycle_day);

  if (now > targetStart) {
    targetStart = new Date(year, month + 1, settings.content_cycle_day);
  }

  const generationDate = new Date(targetStart);
  generationDate.setDate(generationDate.getDate() - settings.generate_days_before);

  return now >= generationDate;
}

async function getBrandSettings(body: MercuryBody) {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("mercury_brand_settings")
    .select("*")
    .eq("active", true);

  if (body.brandSlug) {
    query = query.eq("brand_slug", slugifyBrand(body.brandSlug));
  } else if (body.brandName) {
    query = query.eq("brand_slug", slugifyBrand(body.brandName));
  } else {
    throw new Error("Missing brandName or brandSlug.");
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Mercury settings not found for this brand.");
  }

  return data as MercurySettings;
}

async function getDueBrandSettings() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("mercury_brand_settings")
    .select("*")
    .eq("active", true)
    .eq("auto_generate_enabled", true);

  if (error) throw error;

  return (data || []).filter((settings) =>
    shouldGenerateNow(settings as MercurySettings)
  ) as MercurySettings[];
}

async function getCosmosContext(settings: MercurySettings) {
  const supabase = getSupabaseAdmin();

  const { data: memory } = await supabase
    .from("cosmos_memory")
    .select("*")
    .eq("brand_name", settings.brand_name)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: learnings } = await supabase
    .from("mercury_monthly_learnings")
    .select("*")
    .eq("brand_slug", settings.brand_slug)
    .order("created_at", { ascending: false })
    .limit(3);

  const { data: previousCalendars } = await supabase
    .from("mercury_calendars")
    .select(
      "cycle_month, cycle_year, monthly_objective, strategic_focus, campaign_theme, key_offers, content_angles"
    )
    .eq("brand_slug", settings.brand_slug)
    .order("created_at", { ascending: false })
    .limit(2);

  return {
    memory: memory || null,
    learnings: learnings || [],
    previousCalendars: previousCalendars || [],
  };
}

function safeJsonParse(text: string): MercuryGeneratedCalendar {
  const clean = text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");

    if (first >= 0 && last > first) {
      return JSON.parse(clean.slice(first, last + 1));
    }

    throw new Error("Mercury returned invalid JSON.");
  }
}

function asText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function asTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeContentType(value: unknown) {
  const allowed = new Set([
    "post",
    "carousel",
    "reel",
    "story",
    "video",
    "ad",
    "email",
    "whatsapp",
    "other",
  ]);

  const clean = asText(value, "post").toLowerCase();

  return allowed.has(clean) ? clean : "post";
}

function normalizeFunnelStage(value: unknown) {
  const allowed = new Set([
    "awareness",
    "consideration",
    "conversion",
    "retention",
    "loyalty",
  ]);

  const clean = asText(value, "").toLowerCase();

  return allowed.has(clean) ? clean : null;
}

function normalizePriority(value: unknown) {
  const allowed = new Set(["low", "normal", "high", "urgent"]);
  const clean = asText(value, "normal").toLowerCase();

  return allowed.has(clean) ? clean : "normal";
}

function normalizeAssignedRole(value: unknown, contentType: string) {
  const allowed = new Set(["designer", "reels", "cm", "copy", "admin"]);
  const clean = asText(value, "").toLowerCase();

  if (allowed.has(clean)) return clean;

  if (contentType === "reel" || contentType === "video") return "reels";
  if (contentType === "story") return "cm";

  return "designer";
}

function resolveAssignedUser(settings: MercurySettings, role: string) {
  if (role === "designer" && isUuid(settings.assigned_designer_id)) {
    return settings.assigned_designer_id;
  }

  if (role === "reels" && isUuid(settings.assigned_reels_id)) {
    return settings.assigned_reels_id;
  }

  if (role === "cm" && isUuid(settings.assigned_cm_id)) {
    return settings.assigned_cm_id;
  }

  return null;
}

function getFallbackDate(
  settings: MercurySettings,
  cycleMonth: number,
  cycleYear: number,
  index: number
) {
  const start = new Date(cycleYear, cycleMonth - 1, settings.content_cycle_day);
  const date = new Date(start);
  date.setDate(start.getDate() + index * 3);

  return toDateOnly(date);
}

function getFallbackDueDate(publishDate: string) {
  const date = new Date(`${publishDate}T12:00:00`);
  date.setDate(date.getDate() - 2);
  return toDateOnly(date);
}

function buildFallbackCalendar(
  settings: MercurySettings,
  cycleMonth: number,
  cycleYear: number
): MercuryGeneratedCalendar {
  const items: MercuryGeneratedItem[] = [];
  const channels = settings.preferred_platforms?.length
    ? settings.preferred_platforms
    : ["instagram", "facebook"];

  for (let index = 0; index < settings.posts_per_month; index += 1) {
    const publishDate = getFallbackDate(settings, cycleMonth, cycleYear, index);

    items.push({
      title: `Post estratégico ${index + 1}`,
      content_type: index % 2 === 0 ? "post" : "carousel",
      platform: channels[index % channels.length],
      objective: "Comunicar propuesta de valor y generar interacción.",
      funnel_stage: index % 2 === 0 ? "awareness" : "consideration",
      brief:
        "Crear una pieza clara, visualmente atractiva y alineada a la oferta principal del negocio.",
      copy_base:
        "Texto base pendiente de ajustar por Cometa MKT según campaña del mes.",
      cta: "Enviar mensaje para más información.",
      visual_direction:
        "Diseño limpio, legible, con beneficio principal y llamado a la acción.",
      reference_notes: "Usar línea visual de la marca.",
      publish_date: publishDate,
      due_date: getFallbackDueDate(publishDate),
      assigned_role: "designer",
      priority: "normal",
    });
  }

  for (let index = 0; index < settings.reels_per_month; index += 1) {
    const publishDate = getFallbackDate(
      settings,
      cycleMonth,
      cycleYear,
      settings.posts_per_month + index
    );

    items.push({
      title: `Reel comercial ${index + 1}`,
      content_type: "reel",
      platform: "instagram",
      objective: "Generar alcance, confianza y oportunidades comerciales.",
      funnel_stage: "conversion",
      brief:
        "Crear video corto con gancho inicial, beneficio claro y CTA hacia WhatsApp.",
      copy_base:
        "Texto base pendiente de ajustar por Cometa MKT según oferta del mes.",
      cta: "Pedir información por WhatsApp.",
      visual_direction:
        "Video dinámico, directo, con subtítulos y cierre comercial.",
      reference_notes: "Usar tomas reales del producto, servicio o experiencia.",
      publish_date: publishDate,
      due_date: getFallbackDueDate(publishDate),
      assigned_role: "reels",
      priority: "high",
    });
  }

  if (settings.stories_per_week > 0) {
    for (let week = 1; week <= 4; week += 1) {
      const publishDate = getFallbackDate(
        settings,
        cycleMonth,
        cycleYear,
        settings.posts_per_month + settings.reels_per_month + week
      );

      items.push({
        title: `Paquete de historias semana ${week}`,
        content_type: "story",
        platform: "instagram",
        objective:
          "Mantener presencia diaria, reforzar oferta y generar mensajes.",
        funnel_stage: "conversion",
        brief: `Crear paquete semanal de ${settings.stories_per_week} historias con producto, prueba social, recordatorio y CTA.`,
        copy_base:
          "Historias con frases cortas, directas y enfocadas en generar interacción.",
        cta: "Responder historia o enviar mensaje.",
        visual_direction:
          "Historias limpias, rápidas de entender, con stickers y llamados a la acción.",
        reference_notes: "Usar contenido disponible de la marca.",
        publish_date: publishDate,
        due_date: getFallbackDueDate(publishDate),
        assigned_role: "cm",
        priority: "normal",
      });
    }
  }

  return {
    monthly_objective:
      "Crear presencia comercial constante y generar oportunidades de venta.",
    strategic_focus:
      "Contenido enfocado en claridad de oferta, confianza, prueba social y conversión.",
    campaign_theme: "Crecimiento comercial del mes",
    key_offers: settings.content_focus || [],
    content_angles: [
      "beneficio principal",
      "prueba social",
      "producto destacado",
      "objeciones frecuentes",
      "llamado a la acción",
    ],
    channels,
    items,
  };
}

async function generateMercuryCalendarWithAI(
  settings: MercurySettings,
  cycleMonth: number,
  cycleYear: number,
  context: any
) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildFallbackCalendar(settings, cycleMonth, cycleYear);
  }

  const openai = new OpenAI({ apiKey });

  const storyInstruction =
    settings.stories_per_week > 0
      ? `Crea 4 tareas de tipo "story", una por semana. Cada tarea representa un paquete semanal de ${settings.stories_per_week} historias.`
      : "No crees tareas de historias.";

  const prompt = `
Eres MERCURY, el agente de estrategia, calendario y ejecución de contenido de Cometa OS.

Tu tarea es generar un calendario mensual de contenido para una marca.

IMPORTANTE:
- No eres un generador genérico de ideas.
- Debes pensar como agencia de marketing con enfoque comercial.
- Cada pieza debe ser accionable para diseñadores, reels o community manager.
- Debes generar estrategia mensual y convertirla en tareas claras.
- El contenido debe estar enfocado en ventas, confianza, posicionamiento y mensajes.
- SALES AI, POS Intelligence, ORION, NOVA, ATLAS y COSMOS pueden alimentar la estrategia, pero no los menciones si no aporta al cliente final.
- Las tareas deben ser fáciles de ejecutar por el equipo.

Marca:
${settings.brand_name}

Configuración:
${JSON.stringify(
  {
    brand_slug: settings.brand_slug,
    posts_per_month: settings.posts_per_month,
    reels_per_month: settings.reels_per_month,
    stories_per_week: settings.stories_per_week,
    preferred_platforms: settings.preferred_platforms,
    content_focus: settings.content_focus,
    internal_notes: settings.internal_notes,
    client_notes: settings.client_notes,
  },
  null,
  2
)}

Ciclo:
Mes ${cycleMonth} del año ${cycleYear}

Reglas de cantidad:
- Crea ${settings.posts_per_month} piezas tipo "post" o "carousel".
- Crea ${settings.reels_per_month} piezas tipo "reel".
- ${storyInstruction}

Contexto de COSMOS Memory, análisis y aprendizajes previos:
${JSON.stringify(context, null, 2).slice(0, 18000)}

Devuelve SOLO JSON válido con esta estructura:
{
  "monthly_objective": "objetivo comercial del mes",
  "strategic_focus": "enfoque estratégico",
  "campaign_theme": "tema rector del calendario",
  "key_offers": ["oferta 1", "oferta 2"],
  "content_angles": ["ángulo 1", "ángulo 2"],
  "channels": ["instagram", "facebook"],
  "items": [
    {
      "title": "título de la pieza",
      "content_type": "post | carousel | reel | story | video | ad | email | whatsapp | other",
      "platform": "instagram | facebook | tiktok | whatsapp | other",
      "objective": "objetivo de la pieza",
      "funnel_stage": "awareness | consideration | conversion | retention | loyalty",
      "brief": "brief claro para producción",
      "copy_base": "copy base o idea de texto",
      "cta": "llamado a la acción",
      "visual_direction": "dirección visual concreta",
      "reference_notes": "referencias o notas para diseño/video",
      "publish_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD",
      "assigned_role": "designer | reels | cm | copy | admin",
      "priority": "low | normal | high | urgent"
    }
  ]
}
`;

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres MERCURY, agente de ejecución de contenido de Cometa OS. Devuelve únicamente JSON válido.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    return buildFallbackCalendar(settings, cycleMonth, cycleYear);
  }

  return parsed;
}

async function runMercuryForBrand({
  settings,
  body,
  userContext,
}: {
  settings: MercurySettings;
  body: MercuryBody;
  userContext: UserContext;
}) {
  const supabase = getSupabaseAdmin();

  const { cycleMonth, cycleYear } = getTargetCycle(settings, body);
  const { startDate, endDate } = getCycleDates(settings, cycleMonth, cycleYear);

  const { data: existingCalendar } = await supabase
    .from("mercury_calendars")
    .select("*")
    .eq("brand_slug", settings.brand_slug)
    .eq("cycle_month", cycleMonth)
    .eq("cycle_year", cycleYear)
    .maybeSingle();

  if (existingCalendar && !body.forceRegenerate) {
    return {
      ok: true,
      skipped: true,
      reason: "calendar_already_exists",
      brandName: settings.brand_name,
      brandSlug: settings.brand_slug,
      calendarId: existingCalendar.id,
      cycleMonth,
      cycleYear,
    };
  }

  const { data: run, error: runError } = await supabase
    .from("mercury_agent_runs")
    .insert({
      brand_name: settings.brand_name,
      brand_slug: settings.brand_slug,
      run_type: body.runDueBrands
        ? "auto_calendar_generation"
        : "manual_calendar_generation",
      status: "started",
      input_data: {
        body,
        settings,
        cycleMonth,
        cycleYear,
      },
      requested_by: userContext.userId,
      requested_by_role: userContext.role,
    })
    .select("*")
    .single();

  if (runError) throw runError;

  try {
    if (existingCalendar && body.forceRegenerate) {
      await supabase
        .from("mercury_content_items")
        .delete()
        .eq("calendar_id", existingCalendar.id);
    }

    const context = await getCosmosContext(settings);

    const generated = await generateMercuryCalendarWithAI(
      settings,
      cycleMonth,
      cycleYear,
      context
    );

    const calendarPayload = {
      id: existingCalendar?.id,
      brand_name: settings.brand_name,
      brand_slug: settings.brand_slug,
      cycle_month: cycleMonth,
      cycle_year: cycleYear,
      cycle_start_date: startDate,
      cycle_end_date: endDate,
      status: "generated",
      monthly_objective: asText(generated.monthly_objective),
      strategic_focus: asText(generated.strategic_focus),
      campaign_theme: asText(generated.campaign_theme),
      key_offers: asTextArray(generated.key_offers),
      content_angles: asTextArray(generated.content_angles),
      channels:
        asTextArray(generated.channels).length > 0
          ? asTextArray(generated.channels)
          : settings.preferred_platforms,
      generated_by: "mercury",
      generated_from_context: {
        settings_id: settings.id,
        generated_at: new Date().toISOString(),
        context_used: {
          has_cosmos_memory: Boolean(context.memory),
          learnings_count: context.learnings.length,
          previous_calendars_count: context.previousCalendars.length,
        },
      },
    };

    const { data: calendar, error: calendarError } = await supabase
      .from("mercury_calendars")
      .upsert(calendarPayload, {
        onConflict: "brand_slug,cycle_month,cycle_year",
      })
      .select("*")
      .single();

    if (calendarError) throw calendarError;

    const normalizedItems = (generated.items || []).map((item, index) => {
      const contentType = normalizeContentType(item.content_type);
      const assignedRole = normalizeAssignedRole(item.assigned_role, contentType);

      const publishDate =
        asText(item.publish_date) ||
        getFallbackDate(settings, cycleMonth, cycleYear, index);

      const dueDate =
        asText(item.due_date) || getFallbackDueDate(publishDate);

      return {
        calendar_id: calendar.id,
        brand_name: settings.brand_name,
        brand_slug: settings.brand_slug,

        title: asText(item.title, `Pieza ${index + 1}`),
        content_type: contentType,
        platform: asText(item.platform, settings.preferred_platforms?.[0] || "instagram"),
        objective: asText(item.objective),
        funnel_stage: normalizeFunnelStage(item.funnel_stage),

        brief: asText(item.brief),
        copy_base: asText(item.copy_base),
        cta: asText(item.cta),
        visual_direction: asText(item.visual_direction),
        reference_notes: asText(item.reference_notes),

        due_date: dueDate,
        publish_date: publishDate,

        assigned_to: resolveAssignedUser(settings, assignedRole),
        assigned_role: assignedRole,

        status: "generated",
        priority: normalizePriority(item.priority),

        private_notes: null,
        client_notes: null,

        created_by_agent: true,
        locked: false,
        raw_ai_data: item,
      };
    });

    const { error: itemsError } = await supabase
      .from("mercury_content_items")
      .insert(normalizedItems);

    if (itemsError) throw itemsError;

    await supabase
      .from("mercury_agent_runs")
      .update({
        status: "completed",
        calendar_id: calendar.id,
        output_data: {
          calendar,
          items_created: normalizedItems.length,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return {
      ok: true,
      skipped: false,
      brandName: settings.brand_name,
      brandSlug: settings.brand_slug,
      calendarId: calendar.id,
      cycleMonth,
      cycleYear,
      itemsCreated: normalizedItems.length,
      status: "generated",
    };
  } catch (error: any) {
    await supabase
      .from("mercury_agent_runs")
      .update({
        status: "failed",
        error_message: error?.message || "Unknown Mercury error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserContext(request);
    const body = (await request.json().catch(() => ({}))) as MercuryBody;

    if (body.runDueBrands) {
      const settingsList = await getDueBrandSettings();

      const results = [];

      for (const settings of settingsList) {
        const result = await runMercuryForBrand({
          settings,
          body,
          userContext,
        });

        results.push(result);
      }

      return NextResponse.json({
        ok: true,
        mode: "due_brands",
        processed: results.length,
        results,
      });
    }

    const settings = await getBrandSettings(body);

    const result = await runMercuryForBrand({
      settings,
      body,
      userContext,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_RUN_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury run failed",
      },
      { status: 500 }
    );
  }
}