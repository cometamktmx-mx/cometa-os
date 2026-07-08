import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserContext = {
  role: "admin" | "internal" | "member";
  userId: string | null;
  email: string | null;
};

type CreateBody = {
  brandSlug?: string;
  brandName?: string;
  calendarId?: string | null;

  cycleMonth?: number | null;
  cycleYear?: number | null;

  title?: string;
  contentType?: string;
  content_type?: string;
  platform?: string;

  objective?: string | null;
  funnelStage?: string | null;
  funnel_stage?: string | null;
  brief?: string | null;
  copyBase?: string | null;
  copy_base?: string | null;
  cta?: string | null;
  visualDirection?: string | null;
  visual_direction?: string | null;
  referenceNotes?: string | null;
  reference_notes?: string | null;

  dueDate?: string | null;
  due_date?: string | null;
  publishDate?: string | null;
  publish_date?: string | null;

  assignedRole?: string | null;
  assigned_role?: string | null;
  priority?: string;
  status?: string;
  clientNotes?: string | null;
  client_notes?: string | null;
  privateNotes?: string | null;
  private_notes?: string | null;
};

const allowedContentTypes = new Set([
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

const allowedStatuses = new Set([
  "generated",
  "internal_review",
  "assigned",
  "in_design",
  "design_uploaded",
  "changes_requested",
  "approved_internal",
  "sent_to_client",
  "approved_client",
  "scheduled",
  "published",
  "analyzed",
  "cancelled",
]);

const allowedAssignedRoles = new Set([
  "designer",
  "reels",
  "cm",
  "copy",
  "admin",
]);

const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);

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

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value
  );
}

function isDateOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asNullableText(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return String(value);

  const clean = value.trim();

  return clean.length > 0 ? clean : null;
}

function asText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function getBodyValue<T = unknown>(
  body: Record<string, any>,
  primary: string,
  fallback?: string
): T | undefined {
  if (body[primary] !== undefined) return body[primary] as T;
  if (fallback && body[fallback] !== undefined) return body[fallback] as T;

  return undefined;
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
    throw new Response(
      JSON.stringify({
        ok: false,
        error: "Unauthorized",
      }),
      { status: 401 }
    );
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

  return {
    role: "member",
    userId: user.id,
    email,
  };
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getCurrentCycle() {
  const now = new Date();

  return {
    cycleMonth: now.getMonth() + 1,
    cycleYear: now.getFullYear(),
  };
}

function getCycleDates(cycleMonth: number, cycleYear: number) {
  const start = new Date(cycleYear, cycleMonth - 1, 1);
  const end = new Date(cycleYear, cycleMonth, 0);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
  };
}

function normalizeContentType(value: unknown) {
  const clean = asText(value, "post").toLowerCase();
  return allowedContentTypes.has(clean) ? clean : "post";
}

function normalizeStatus(value: unknown) {
  const clean = asText(value, "generated").toLowerCase();
  return allowedStatuses.has(clean) ? clean : "generated";
}

function normalizeAssignedRole(value: unknown, contentType: string) {
  const clean = asText(value, "").toLowerCase();

  if (allowedAssignedRoles.has(clean)) return clean;

  if (contentType === "reel" || contentType === "video") return "reels";
  if (contentType === "story") return "cm";

  return "designer";
}

function normalizePriority(value: unknown) {
  const clean = asText(value, "normal").toLowerCase();
  return allowedPriorities.has(clean) ? clean : "normal";
}

async function getOrCreateCalendar({
  brandSlug,
  brandName,
  calendarId,
  cycleMonth,
  cycleYear,
}: {
  brandSlug: string;
  brandName: string;
  calendarId?: string | null;
  cycleMonth: number;
  cycleYear: number;
}) {
  const supabase = getSupabaseAdmin();

  if (calendarId && isUuid(calendarId)) {
    const { data, error } = await supabase
      .from("mercury_calendars")
      .select("*")
      .eq("id", calendarId)
      .eq("brand_slug", brandSlug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data: existing, error: existingError } = await supabase
    .from("mercury_calendars")
    .select("*")
    .eq("brand_slug", brandSlug)
    .eq("cycle_month", cycleMonth)
    .eq("cycle_year", cycleYear)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) return existing;

  const { startDate, endDate } = getCycleDates(cycleMonth, cycleYear);

  const { data: calendar, error: calendarError } = await supabase
    .from("mercury_calendars")
    .insert({
      brand_name: brandName,
      brand_slug: brandSlug,
      cycle_month: cycleMonth,
      cycle_year: cycleYear,
      cycle_start_date: startDate,
      cycle_end_date: endDate,
      status: "manual",
      monthly_objective: "Calendario creado manualmente desde MERCURY.",
      strategic_focus: "Ejecución manual de contenido.",
      campaign_theme: "Calendario manual",
      key_offers: [],
      content_angles: [],
      channels: ["instagram", "facebook"],
      generated_by: "manual",
      generated_from_context: {
        source: "manual_create_item",
        created_at: new Date().toISOString(),
      },
    })
    .select("*")
    .single();

  if (calendarError) throw calendarError;

  return calendar;
}

export async function POST(request: NextRequest) {
  try {
    const context = await getUserContext(request);

    if (context.role !== "admin" && context.role !== "internal") {
      return NextResponse.json(
        {
          ok: false,
          error: "Only Cometa admins can create Mercury content items.",
        },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as CreateBody;

    const brandSlug = slugifyBrand(
      body.brandSlug || body.brandName || "cometa-mkt"
    );

    const brandName =
      asText(body.brandName) ||
      brandSlug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

    const currentCycle = getCurrentCycle();

    const cycleMonth = Number(body.cycleMonth || currentCycle.cycleMonth);
    const cycleYear = Number(body.cycleYear || currentCycle.cycleYear);

    const title = asText(body.title, "Nueva pieza de contenido");

    const contentType = normalizeContentType(
      getBodyValue(body, "contentType", "content_type")
    );

    const assignedRole = normalizeAssignedRole(
      getBodyValue(body, "assignedRole", "assigned_role"),
      contentType
    );

    const dueDate = getBodyValue<string | null>(body, "dueDate", "due_date");
    const publishDate = getBodyValue<string | null>(
      body,
      "publishDate",
      "publish_date"
    );

    if (!isDateOrNull(dueDate)) {
      return NextResponse.json(
        {
          ok: false,
          error: "dueDate must use YYYY-MM-DD format.",
        },
        { status: 400 }
      );
    }

    if (!isDateOrNull(publishDate)) {
      return NextResponse.json(
        {
          ok: false,
          error: "publishDate must use YYYY-MM-DD format.",
        },
        { status: 400 }
      );
    }

    const calendar = await getOrCreateCalendar({
      brandSlug,
      brandName,
      calendarId: body.calendarId,
      cycleMonth,
      cycleYear,
    });

    const supabase = getSupabaseAdmin();

    const payload = {
      calendar_id: calendar.id,
      brand_name: calendar.brand_name || brandName,
      brand_slug: calendar.brand_slug || brandSlug,

      title,
      content_type: contentType,
      platform: asText(body.platform, "instagram"),
      objective: asNullableText(body.objective),
      funnel_stage: asNullableText(
        getBodyValue(body, "funnelStage", "funnel_stage")
      ),

      brief: asNullableText(body.brief),
      copy_base: asNullableText(getBodyValue(body, "copyBase", "copy_base")),
      cta: asNullableText(body.cta),
      visual_direction: asNullableText(
        getBodyValue(body, "visualDirection", "visual_direction")
      ),
      reference_notes: asNullableText(
        getBodyValue(body, "referenceNotes", "reference_notes")
      ),

      due_date: dueDate || null,
      publish_date: publishDate || null,

      assigned_to: null,
      assigned_role: assignedRole,

      status: normalizeStatus(body.status),
      priority: normalizePriority(body.priority),

      private_notes: asNullableText(
        getBodyValue(body, "privateNotes", "private_notes")
      ),
      client_notes: asNullableText(
        getBodyValue(body, "clientNotes", "client_notes")
      ),

      created_by_agent: false,
      locked: false,
      raw_ai_data: {
        source: "manual",
        created_from: "mercury_content_item_create",
        created_at: new Date().toISOString(),
        requested_by: context.email,
      },
    };

    const { data: item, error } = await supabase
      .from("mercury_content_items")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      calendar,
      item,
      access: {
        role: context.role,
        userId: context.userId,
        email: context.email,
      },
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_CONTENT_ITEM_CREATE_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury content item create failed.",
      },
      { status: 500 }
    );
  }
}