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

type UpdateBody = {
  contentItemId?: string;
  id?: string;

  status?: string;
  assignedTo?: string | null;
  assigned_to?: string | null;
  assignedRole?: string | null;
  assigned_role?: string | null;

  dueDate?: string | null;
  due_date?: string | null;
  publishDate?: string | null;
  publish_date?: string | null;

  priority?: string;

  title?: string;
  objective?: string | null;
  brief?: string | null;
  copyBase?: string | null;
  copy_base?: string | null;
  cta?: string | null;
  visualDirection?: string | null;
  visual_direction?: string | null;
  referenceNotes?: string | null;
  reference_notes?: string | null;

  privateNotes?: string | null;
  private_notes?: string | null;
  clientNotes?: string | null;
  client_notes?: string | null;

  comment?: string | null;
  isPrivateComment?: boolean;
  is_private_comment?: boolean;
};

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

const teamAllowedStatuses = new Set([
  "assigned",
  "in_design",
  "design_uploaded",
  "changes_requested",
  "scheduled",
  "published",
]);

const clientAllowedStatuses = new Set([
  "changes_requested",
  "approved_client",
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

function canUpdateField({
  field,
  context,
  assignmentRole,
}: {
  field: string;
  context: UserContext;
  assignmentRole: string | null;
}) {
  if (context.role === "admin" || context.role === "internal") return true;

  if (!assignmentRole) return false;

  if (assignmentRole === "client") {
    return ["status", "client_notes"].includes(field);
  }

  return [
    "status",
    "private_notes",
    "client_notes",
    "due_date",
    "publish_date",
  ].includes(field);
}

function validateStatusPermission({
  status,
  context,
  assignmentRole,
}: {
  status: string;
  context: UserContext;
  assignmentRole: string | null;
}) {
  if (!allowedStatuses.has(status)) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: `Invalid status: ${status}`,
      }),
      { status: 400 }
    );
  }

  if (context.role === "admin" || context.role === "internal") return;

  if (assignmentRole === "client" && !clientAllowedStatuses.has(status)) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: "Client cannot set this status.",
      }),
      { status: 403 }
    );
  }

  if (assignmentRole !== "client" && !teamAllowedStatuses.has(status)) {
    throw new Response(
      JSON.stringify({
        ok: false,
        error: "Team member cannot set this status.",
      }),
      { status: 403 }
    );
  }
}

function buildUpdatePayload({
  body,
  context,
  assignmentRole,
}: {
  body: UpdateBody;
  context: UserContext;
  assignmentRole: string | null;
}) {
  const payload: Record<string, any> = {};

  const setField = (field: string, value: unknown) => {
    if (value === undefined) return;

    if (!canUpdateField({ field, context, assignmentRole })) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: `You cannot update field: ${field}`,
        }),
        { status: 403 }
      );
    }

    payload[field] = value;
  };

  const status = asNullableText(body.status);

  if (status !== undefined && status !== null) {
    validateStatusPermission({
      status,
      context,
      assignmentRole,
    });

    setField("status", status);
  }

  const assignedTo = getBodyValue<string | null>(body, "assignedTo", "assigned_to");

  if (assignedTo !== undefined) {
    if (assignedTo !== null && assignedTo !== "" && !isUuid(assignedTo)) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: "assignedTo must be a valid UUID or null.",
        }),
        { status: 400 }
      );
    }

    setField("assigned_to", assignedTo || null);
  }

  const assignedRole = asNullableText(
    getBodyValue(body, "assignedRole", "assigned_role")
  );

  if (assignedRole !== undefined) {
    if (assignedRole !== null && !allowedAssignedRoles.has(assignedRole)) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: "Invalid assignedRole.",
        }),
        { status: 400 }
      );
    }

    setField("assigned_role", assignedRole);
  }

  const dueDate = getBodyValue<string | null>(body, "dueDate", "due_date");

  if (dueDate !== undefined) {
    if (!isDateOrNull(dueDate)) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: "dueDate must use YYYY-MM-DD format.",
        }),
        { status: 400 }
      );
    }

    setField("due_date", dueDate || null);
  }

  const publishDate = getBodyValue<string | null>(
    body,
    "publishDate",
    "publish_date"
  );

  if (publishDate !== undefined) {
    if (!isDateOrNull(publishDate)) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: "publishDate must use YYYY-MM-DD format.",
        }),
        { status: 400 }
      );
    }

    setField("publish_date", publishDate || null);
  }

  const priority = asNullableText(body.priority);

  if (priority !== undefined && priority !== null) {
    if (!allowedPriorities.has(priority)) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: "Invalid priority.",
        }),
        { status: 400 }
      );
    }

    setField("priority", priority);
  }

  setField("title", asNullableText(body.title));
  setField("objective", asNullableText(body.objective));
  setField("brief", asNullableText(body.brief));
  setField("copy_base", asNullableText(getBodyValue(body, "copyBase", "copy_base")));
  setField("cta", asNullableText(body.cta));
  setField(
    "visual_direction",
    asNullableText(getBodyValue(body, "visualDirection", "visual_direction"))
  );
  setField(
    "reference_notes",
    asNullableText(getBodyValue(body, "referenceNotes", "reference_notes"))
  );
  setField(
    "private_notes",
    asNullableText(getBodyValue(body, "privateNotes", "private_notes"))
  );
  setField(
    "client_notes",
    asNullableText(getBodyValue(body, "clientNotes", "client_notes"))
  );

  return payload;
}

function getCommentRole(context: UserContext, assignmentRole: string | null) {
  if (context.role === "internal") return "agent";
  if (context.role === "admin") return "cometa";
  if (assignmentRole === "client") return "client";

  return "designer";
}

export async function POST(request: NextRequest) {
  try {
    const context = await getUserContext(request);
    const body = (await request.json().catch(() => ({}))) as UpdateBody;

    const contentItemId = body.contentItemId || body.id;

    if (!contentItemId || !isUuid(contentItemId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "contentItemId is required and must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existingItem, error: itemError } = await supabase
      .from("mercury_content_items")
      .select("*")
      .eq("id", contentItemId)
      .maybeSingle();

    if (itemError) throw itemError;

    if (!existingItem) {
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

      assignmentRole = await getMemberAssignment(
        context.userId,
        existingItem.brand_slug
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

    const updatePayload = buildUpdatePayload({
      body,
      context,
      assignmentRole,
    });

    const commentText = asNullableText(body.comment);
    const isPrivateComment =
      body.isPrivateComment ?? body.is_private_comment ?? false;

    if (Object.keys(updatePayload).length === 0 && !commentText) {
      return NextResponse.json(
        {
          ok: false,
          error: "No update fields provided.",
        },
        { status: 400 }
      );
    }

    let updatedItem = existingItem;

    if (Object.keys(updatePayload).length > 0) {
      const { data, error } = await supabase
        .from("mercury_content_items")
        .update(updatePayload)
        .eq("id", contentItemId)
        .select("*")
        .single();

      if (error) throw error;

      updatedItem = data;
    }

    let insertedComment = null;

    if (commentText) {
      const commentRole = getCommentRole(context, assignmentRole);
      const safePrivate =
        commentRole === "client" ? false : Boolean(isPrivateComment);

      const { data, error } = await supabase
        .from("mercury_content_comments")
        .insert({
          content_item_id: updatedItem.id,
          brand_name: updatedItem.brand_name,
          brand_slug: updatedItem.brand_slug,
          user_id: context.userId,
          user_role: commentRole,
          comment: commentText,
          is_private: safePrivate,
        })
        .select("*")
        .single();

      if (error) throw error;

      insertedComment = data;
    }

    return NextResponse.json({
      ok: true,
      item: updatedItem,
      comment: insertedComment,
      access: {
        role: context.role,
        assignmentRole,
      },
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), {
        status: error.status,
      });
    }

    console.error("[MERCURY_CONTENT_ITEM_UPDATE_ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Mercury content item update failed.",
      },
      { status: 500 }
    );
  }
}