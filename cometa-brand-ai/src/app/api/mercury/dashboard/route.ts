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

async function getMemberBrandAccess(userId: string, brandSlug: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("mercury_team_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("brand_slug", brandSlug)
    .eq("active", true)
    .limit(1);

  if (error) throw error;

  return data?.[0]?.role || null;
}

function countByStatus(items: any[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const status = item.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function countByType(items: any[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const type = item.content_type || "other";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserContext(request);

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const brandSlug = slugifyBrand(
      searchParams.get("brandSlug") ||
        searchParams.get("brandName") ||
        "cometa-mkt"
    );

    if (userContext.role === "member") {
      if (!userContext.userId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Missing user context.",
          },
          { status: 401 }
        );
      }

      const assignmentRole = await getMemberBrandAccess(
        userContext.userId,
        brandSlug
      );

      if (!assignmentRole) {
        return NextResponse.json(
          {
            ok: false,
            error: "You do not have access to this Mercury brand.",
          },
          { status: 403 }
        );
      }
    }

    const calendarId = searchParams.get("calendarId");

    const { data: settings, error: settingsError } = await supabase
      .from("mercury_brand_settings")
      .select("*")
      .eq("brand_slug", brandSlug)
      .maybeSingle();

    if (settingsError) throw settingsError;

    const { data: calendars, error: calendarsError } = await supabase
      .from("mercury_calendars")
      .select("*")
      .eq("brand_slug", brandSlug)
      .order("cycle_year", { ascending: false })
      .order("cycle_month", { ascending: false })
      .limit(12);

    if (calendarsError) throw calendarsError;

    let selectedCalendar = null;

    if (calendarId) {
      const { data, error } = await supabase
        .from("mercury_calendars")
        .select("*")
        .eq("id", calendarId)
        .eq("brand_slug", brandSlug)
        .maybeSingle();

      if (error) throw error;
      selectedCalendar = data;
    } else {
      selectedCalendar = calendars?.[0] || null;
    }

    let items: any[] = [];

    if (selectedCalendar?.id) {
      const { data, error } = await supabase
        .from("mercury_content_items")
        .select("*")
        .eq("calendar_id", selectedCalendar.id)
        .order("publish_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      items = data || [];
    }

    const { data: recentRuns, error: runsError } = await supabase
      .from("mercury_agent_runs")
      .select("*")
      .eq("brand_slug", brandSlug)
      .order("created_at", { ascending: false })
      .limit(5);

    if (runsError) throw runsError;

    return NextResponse.json({
      ok: true,
      brandSlug,
      settings: settings || null,
      calendars: calendars || [],
      selectedCalendar,
      items,
      recentRuns: recentRuns || [],
      summary: {
        totalItems: items.length,
        byStatus: countByStatus(items),
        byType: countByType(items),
        pendingItems: items.filter((item) =>
          [
            "generated",
            "internal_review",
            "assigned",
            "in_design",
            "design_uploaded",
            "changes_requested",
          ].includes(item.status)
        ).length,
        approvedItems: items.filter((item) =>
          [
            "approved_internal",
            "approved_client",
            "scheduled",
            "published",
          ].includes(item.status)
        ).length,
      },
      access: {
        role: userContext.role,
        userId: userContext.userId,
        email: userContext.email,
      },
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_DASHBOARD_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury dashboard failed",
      },
      { status: 500 }
    );
  }
}