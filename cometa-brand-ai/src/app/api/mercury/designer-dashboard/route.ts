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

type BrandAccess = {
  brand_slug: string;
  role: string;
};

const COMETA_TIME_ZONE = "America/Mexico_City";

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

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

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

function toDateKey(value?: string | null) {
  if (!value) return null;

  const cleanValue = String(value).trim();

  if (!cleanValue) return null;

  const dateMatch = cleanValue.match(/^\d{4}-\d{2}-\d{2}/);

  if (dateMatch) {
    return dateMatch[0];
  }

  const date = new Date(cleanValue);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getDateKeyInMexico(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COMETA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return getDateKeyInMexico(new Date());
}

function getNextWeekKey() {
  const date = new Date();
  date.setDate(date.getDate() + 7);

  return getDateKeyInMexico(date);
}

function isDueToday(item: any) {
  const today = getTodayKey();
  const due = toDateKey(item.due_date) || toDateKey(item.publish_date);

  return due === today;
}

function isDueThisWeek(item: any) {
  const today = getTodayKey();
  const nextWeek = getNextWeekKey();
  const due = toDateKey(item.due_date) || toDateKey(item.publish_date);

  if (!due) return false;

  return due >= today && due <= nextWeek;
}

function isDesignerRelevant(item: any) {
  const status = item.status || "";

  return [
    "generated",
    "assigned",
    "in_design",
    "design_uploaded",
    "changes_requested",
    "internal_review",
    "approved_internal",
    "approved_client",
    "scheduled",
    "published",
  ].includes(status);
}

function getNextDueItem(items: any[]) {
  return (
    [...items]
      .filter((item) => item.due_date || item.publish_date)
      .sort((a, b) => {
        const aDate = toDateKey(a.due_date) || toDateKey(a.publish_date) || "";
        const bDate = toDateKey(b.due_date) || toDateKey(b.publish_date) || "";

        return aDate.localeCompare(bDate);
      })[0] || null
  );
}

function buildEmptyResponse(userContext: UserContext) {
  return NextResponse.json({
    ok: true,
    access: {
      role: userContext.role,
      userId: userContext.userId,
      email: userContext.email,
    },
    brands: [],
    summary: {
      totalBrands: 0,
      totalItems: 0,
      pendingDesign: 0,
      inDesign: 0,
      changesRequested: 0,
      dueToday: 0,
      dueThisWeek: 0,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const userContext = await getUserContext(request);
    const supabase = getSupabaseAdmin();

    let brandAccess: BrandAccess[] = [];

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

      const { data: assignments, error: assignmentsError } = await supabase
        .from("mercury_team_assignments")
        .select("brand_slug, role, active")
        .eq("user_id", userContext.userId)
        .eq("active", true)
        .order("brand_slug", { ascending: true });

      if (assignmentsError) throw assignmentsError;

      brandAccess = (assignments || [])
        .map((assignment: any) => ({
          brand_slug: slugifyBrand(assignment.brand_slug || ""),
          role: assignment.role || "designer",
        }))
        .filter((assignment) => Boolean(assignment.brand_slug));
    } else {
      const { data: settings, error: settingsError } = await supabase
        .from("mercury_brand_settings")
        .select("brand_slug, brand_name")
        .order("brand_name", { ascending: true });

      if (settingsError) throw settingsError;

      brandAccess = (settings || [])
        .map((setting: any) => ({
          brand_slug: slugifyBrand(setting.brand_slug || setting.brand_name || ""),
          role: "admin",
        }))
        .filter((assignment) => Boolean(assignment.brand_slug));
    }

    const brandSlugs = Array.from(
      new Set(brandAccess.map((access) => access.brand_slug).filter(Boolean))
    );

    if (brandSlugs.length === 0) {
      return buildEmptyResponse(userContext);
    }

    const { data: settingsRows, error: settingsError } = await supabase
      .from("mercury_brand_settings")
      .select("*")
      .in("brand_slug", brandSlugs);

    if (settingsError) throw settingsError;

    const settingsBySlug = new Map<string, any>();

    for (const setting of settingsRows || []) {
      const settingSlug = slugifyBrand(
        setting.brand_slug || setting.brand_name || ""
      );

      if (settingSlug) {
        settingsBySlug.set(settingSlug, setting);
      }
    }

    const { data: calendars, error: calendarsError } = await supabase
      .from("mercury_calendars")
      .select("*")
      .in("brand_slug", brandSlugs)
      .order("cycle_year", { ascending: false })
      .order("cycle_month", { ascending: false })
      .order("created_at", { ascending: false });

    if (calendarsError) throw calendarsError;

    const selectedCalendarByBrand = new Map<string, any>();

    for (const calendar of calendars || []) {
      const calendarBrandSlug = slugifyBrand(calendar.brand_slug || "");

      if (!calendarBrandSlug) continue;

      if (!selectedCalendarByBrand.has(calendarBrandSlug)) {
        selectedCalendarByBrand.set(calendarBrandSlug, calendar);
      }
    }

    const calendarIds = Array.from(selectedCalendarByBrand.values())
      .map((calendar) => calendar.id)
      .filter(Boolean);

    let allItems: any[] = [];

    if (calendarIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("mercury_content_items")
        .select("*")
        .in("calendar_id", calendarIds)
        .neq("status", "cancelled")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("publish_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (itemsError) throw itemsError;

      allItems = (items || []).filter(isDesignerRelevant);
    }

    const itemsByCalendarId = new Map<string, any[]>();

    for (const item of allItems) {
      if (!item.calendar_id) continue;

      const calendarItems = itemsByCalendarId.get(item.calendar_id) || [];
      calendarItems.push(item);
      itemsByCalendarId.set(item.calendar_id, calendarItems);
    }

    const brands = brandSlugs.map((brandSlug) => {
      const access = brandAccess.find((item) => item.brand_slug === brandSlug);
      const settings = settingsBySlug.get(brandSlug) || null;
      const selectedCalendar = selectedCalendarByBrand.get(brandSlug) || null;

      const items = selectedCalendar?.id
        ? itemsByCalendarId.get(selectedCalendar.id) || []
        : [];

      const pendingDesign = items.filter((item) =>
        ["generated", "assigned", "in_design", "changes_requested"].includes(
          item.status
        )
      ).length;

      const inDesign = items.filter((item) => item.status === "in_design")
        .length;

      const changesRequested = items.filter(
        (item) => item.status === "changes_requested"
      ).length;

      const designUploaded = items.filter(
        (item) => item.status === "design_uploaded"
      ).length;

      const dueToday = items.filter(isDueToday).length;
      const dueThisWeek = items.filter(isDueThisWeek).length;

      return {
        brandSlug,
        role: access?.role || "designer",
        settings,
        selectedCalendar,
        items,
        nextDueItem: getNextDueItem(items),
        summary: {
          totalItems: items.length,
          byStatus: countByStatus(items),
          byType: countByType(items),
          pendingDesign,
          inDesign,
          changesRequested,
          designUploaded,
          dueToday,
          dueThisWeek,
        },
      };
    });

    const totalItems = brands.reduce(
      (acc, brand) => acc + brand.summary.totalItems,
      0
    );

    const pendingDesign = brands.reduce(
      (acc, brand) => acc + brand.summary.pendingDesign,
      0
    );

    const inDesign = brands.reduce(
      (acc, brand) => acc + brand.summary.inDesign,
      0
    );

    const changesRequested = brands.reduce(
      (acc, brand) => acc + brand.summary.changesRequested,
      0
    );

    const dueToday = brands.reduce(
      (acc, brand) => acc + brand.summary.dueToday,
      0
    );

    const dueThisWeek = brands.reduce(
      (acc, brand) => acc + brand.summary.dueThisWeek,
      0
    );

    return NextResponse.json({
      ok: true,
      access: {
        role: userContext.role,
        userId: userContext.userId,
        email: userContext.email,
      },
      brands,
      summary: {
        totalBrands: brands.length,
        totalItems,
        pendingDesign,
        inDesign,
        changesRequested,
        dueToday,
        dueThisWeek,
      },
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_DESIGNER_DASHBOARD_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury designer dashboard failed",
      },
      { status: 500 }
    );
  }
}