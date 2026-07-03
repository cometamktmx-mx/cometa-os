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

type AddLinkBody = {
  contentItemId?: string;
  assetName?: string;
  assetType?: string;
  assetUrl?: string;
  notes?: string;
  provider?: string;
};

const allowedAssetTypes = new Set([
  "design_preview",
  "final_design",
  "video",
  "editable_file",
  "reference",
  "published_evidence",
  "external_link",
]);

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

function cleanText(value: unknown) {
  if (value === undefined || value === null) return null;

  const clean = String(value).trim();

  return clean.length > 0 ? clean : null;
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function detectProvider(assetUrl: string) {
  const url = assetUrl.toLowerCase();

  if (url.includes("drive.google.com")) return "google_drive";
  if (url.includes("docs.google.com")) return "google_drive";
  if (url.includes("canva.com")) return "canva";
  if (url.includes("capcut.com")) return "capcut";
  if (url.includes("figma.com")) return "figma";
  if (url.includes("dropbox.com")) return "dropbox";
  if (url.includes("we.tl") || url.includes("wetransfer.com")) {
    return "wetransfer";
  }

  return "external";
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

export async function POST(request: NextRequest) {
  try {
    const context = await getUserContext(request);
    const body = (await request.json().catch(() => ({}))) as AddLinkBody;

    const contentItemId = cleanText(body.contentItemId);
    const assetUrl = cleanText(body.assetUrl);
    const assetName = cleanText(body.assetName) || "Link de asset";
    const assetType = cleanText(body.assetType) || "external_link";
    const notes = cleanText(body.notes);
    const provider = cleanText(body.provider) || detectProvider(assetUrl || "");

    if (!contentItemId || !isUuid(contentItemId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "contentItemId is required and must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    if (!assetUrl || !isValidUrl(assetUrl)) {
      return NextResponse.json(
        {
          ok: false,
          error: "assetUrl is required and must be a valid URL.",
        },
        { status: 400 }
      );
    }

    if (!allowedAssetTypes.has(assetType)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid assetType.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

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

    let assignmentRole: string | null = null;

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

      assignmentRole = await getMemberAssignment(context.userId, item.brand_slug);

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

    const uploadedByRole =
      context.role === "internal"
        ? "agent"
        : context.role === "admin"
        ? "cometa"
        : assignmentRole || "member";

    const { data: asset, error: assetError } = await supabase
      .from("mercury_content_assets")
      .insert({
        content_item_id: item.id,
        calendar_id: item.calendar_id,
        brand_name: item.brand_name,
        brand_slug: item.brand_slug,
        asset_name: assetName,
asset_type: assetType,
asset_url: assetUrl,
file_url: assetUrl,
asset_status: "active",
        notes,
        provider,
        uploaded_by: context.userId,
        uploaded_by_role: uploadedByRole,
        metadata: {
          source: "mercury_hub_link",
          detected_provider: detectProvider(assetUrl),
        },
      })
      .select("*")
      .single();

    if (assetError) throw assetError;

    await supabase.from("mercury_content_comments").insert({
      content_item_id: item.id,
      brand_name: item.brand_name,
      brand_slug: item.brand_slug,
      user_id: context.userId,
      user_role: uploadedByRole === "agent" ? "agent" : "cometa",
      comment: `Se agregó asset: ${assetName}`,
      is_private: true,
    });

    return NextResponse.json({
      ok: true,
      asset,
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_ASSET_ADD_LINK_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury asset add link failed.",
      },
      { status: 500 }
    );
  }
}