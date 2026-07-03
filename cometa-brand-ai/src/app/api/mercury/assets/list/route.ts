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

async function getMemberAssignment(userId: string, brandSlug: string) {
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

export async function GET(request: NextRequest) {
  try {
    const context = await getUserContext(request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const contentItemId = searchParams.get("contentItemId");

    if (!contentItemId || !isUuid(contentItemId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "contentItemId is required and must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const { data: item, error: itemError } = await supabase
      .from("mercury_content_items")
      .select("*")
      .eq("id", contentItemId)
      .maybeSingle();

    if (itemError) throw itemError;

    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: "Content item not found.",
        },
        { status: 404 }
      );
    }

    if (context.role === "member") {
      if (!context.userId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Missing user context.",
          },
          { status: 401 }
        );
      }

      const assignmentRole = await getMemberAssignment(
        context.userId,
        item.brand_slug
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

    const { data: assets, error: assetsError } = await supabase
      .from("mercury_content_assets")
      .select("*")
      .eq("content_item_id", contentItemId)
      .neq("asset_status", "deleted")
      .order("created_at", { ascending: false });

    if (assetsError) throw assetsError;

    return NextResponse.json({
      ok: true,
      assets: assets || [],
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_ASSET_LIST_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury asset list failed.",
      },
      { status: 500 }
    );
  }
}