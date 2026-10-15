import { createClient } from "@/lib/supabase/server";
import {
  PosApiError,
  getAdminClient,
  handlePosError,
  ok,
  readJsonBody,
  uuidValue,
} from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvitationActionBody = {
  invitationId?: unknown;
};

type InvitationRow = {
  id: string;
  brand_slug: string;
  access_role: string;
  expires_at: string;
  metadata: unknown;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationMetadataRequiresPassword(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return (value as Record<string, unknown>).requires_password_setup === true;
}

async function requireAuthenticatedInvitee() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new PosApiError(
      401,
      "POS_UNAUTHORIZED",
      "Inicia sesión para ver tus invitaciones."
    );
  }

  return {
    userId: user.id,
    email: normalizeEmail(user.email),
  };
}

function knownInvitationRpcError(error: unknown) {
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  const mappings = [
    ["POS_INVITATION_EXPIRED", 409, "Esta invitación venció."],
    ["POS_INVITATION_NOT_PENDING", 409, "Esta invitación ya no está disponible."],
    ["POS_INVITATION_EMAIL_MISMATCH", 403, "Esta invitación fue enviada a otro correo."],
    ["POS_USER_LIMIT_REACHED", 409, "El negocio ya alcanzó el límite de usuarios de su plan."],
    ["POS_MEMBERSHIP_ALREADY_EXISTS", 409, "Ya formas parte de este negocio."],
    ["POS_INVITATION_NOT_FOUND", 404, "La invitación no existe."],
    ["POS_INVITATION_INPUT_INVALID", 400, "La invitación no es válida."],
  ] as const;

  const match = mappings.find(([code]) => message.includes(code));
  return match
    ? new PosApiError(match[1], match[0], match[2])
    : null;
}

async function invitationById(invitationId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("pos_user_invitations")
    .select("id,brand_slug")
    .eq("id", invitationId)
    .maybeSingle();

  if (error) {
    throw new PosApiError(
      500,
      "POS_INVITATION_LOOKUP_FAILED",
      "No pudimos consultar la invitación."
    );
  }

  if (!data?.id || !data.brand_slug) {
    throw new PosApiError(404, "POS_INVITATION_NOT_FOUND", "La invitación no existe.");
  }

  return { admin, brandSlug: data.brand_slug };
}

export async function GET() {
  try {
    const invitee = await requireAuthenticatedInvitee();
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data: rows, error } = await admin
      .from("pos_user_invitations")
      .select("id,brand_slug,access_role,expires_at,metadata")
      .eq("email", invitee.email)
      .eq("status", "pending")
      .gt("expires_at", now)
      .order("expires_at", { ascending: true });

    if (error) {
      throw new PosApiError(
        500,
        "POS_INVITATION_LOOKUP_FAILED",
        "No pudimos consultar tus invitaciones."
      );
    }

    const invitations = (rows || []) as InvitationRow[];
    const brandSlugs = Array.from(new Set(invitations.map((invitation) => invitation.brand_slug)));
    const { data: brands, error: brandsError } = brandSlugs.length
      ? await admin
          .from("brands")
          .select("slug,name")
          .in("slug", brandSlugs)
      : { data: [], error: null };

    if (brandsError) {
      throw new PosApiError(
        500,
        "POS_INVITATION_BRAND_LOOKUP_FAILED",
        "No pudimos cargar la información del negocio."
      );
    }

    const brandNames = new Map(
      (brands || []).map((brand: { slug: string; name: string }) => [brand.slug, brand.name])
    );

    return ok({
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        brandSlug: invitation.brand_slug,
        brandName: brandNames.get(invitation.brand_slug) || invitation.brand_slug,
        role: invitation.access_role,
        expiresAt: invitation.expires_at,
        requiresPasswordSetup: invitationMetadataRequiresPassword(invitation.metadata),
      })),
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const invitee = await requireAuthenticatedInvitee();
    const body = await readJsonBody<InvitationActionBody>(request);
    const invitationId = uuidValue(body.invitationId, "invitationId");
    if (!invitationId) {
      throw new PosApiError(400, "POS_VALIDATION_ERROR", "La invitación no es válida.");
    }
    const invitation = await invitationById(invitationId);
    const { data, error } = await invitation.admin.rpc("pos_accept_user_invitation_v1", {
      p_brand_slug: invitation.brandSlug,
      p_invitation_id: invitationId,
      p_user_id: invitee.userId,
      p_email: invitee.email,
    });

    if (error) {
      throw knownInvitationRpcError(error) || new PosApiError(
        500,
        "POS_INVITATION_ACCEPT_FAILED",
        "No pudimos aceptar la invitación. Inténtalo nuevamente."
      );
    }

    if (!data) {
      throw new PosApiError(
        500,
        "POS_INVITATION_ACCEPT_FAILED",
        "No pudimos aceptar la invitación. Inténtalo nuevamente."
      );
    }

    return ok({ brandSlug: invitation.brandSlug });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const invitee = await requireAuthenticatedInvitee();
    const body = await readJsonBody<InvitationActionBody>(request);
    const invitationId = uuidValue(body.invitationId, "invitationId");
    if (!invitationId) {
      throw new PosApiError(400, "POS_VALIDATION_ERROR", "La invitación no es válida.");
    }
    const invitation = await invitationById(invitationId);
    const { data, error } = await invitation.admin.rpc("pos_decline_user_invitation_v1", {
      p_invitation_id: invitationId,
      p_user_id: invitee.userId,
      p_email: invitee.email,
    });

    if (error) {
      throw knownInvitationRpcError(error) || new PosApiError(
        500,
        "POS_INVITATION_DECLINE_FAILED",
        "No pudimos rechazar la invitación. Inténtalo nuevamente."
      );
    }

    if (!data) {
      throw new PosApiError(
        500,
        "POS_INVITATION_DECLINE_FAILED",
        "No pudimos rechazar la invitación. Inténtalo nuevamente."
      );
    }

    return ok({ invitationId });
  } catch (error) {
    return handlePosError(error);
  }
}
