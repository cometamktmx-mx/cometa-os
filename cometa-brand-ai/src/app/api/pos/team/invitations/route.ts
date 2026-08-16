import {
  getPosInvitationRoleLabel,
  POS_INVITATION_ROLE_LABELS,
  sendExistingAuthInvitationEmail,
  type PosInvitationInitialRole,
} from "@/lib/pos/invitation-email";
import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosPermission } from "@/lib/pos/rbac";
import {
  PosApiError,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  readJsonBody,
  requiredText,
} from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INITIAL_ROLE_SET = new Set<PosInvitationInitialRole>([
  "admin",
  "manager",
  "cashier",
  "inventory",
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type InviteBody = {
  email?: unknown;
  role?: unknown;
};

type ReservedInvitation = {
  id: string;
  access_role: string;
  expires_at: string;
};

function isReservedInvitation(value: unknown): value is ReservedInvitation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const invitation = value as Record<string, unknown>;

  return (
    typeof invitation.id === "string" &&
    typeof invitation.access_role === "string" &&
    typeof invitation.expires_at === "string"
  );
}

function normalizeEmail(value: unknown) {
  const email = requiredText(value, "email", 320).toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      "Escribe un correo electrónico válido."
    );
  }

  return email;
}

function initialRole(value: unknown): PosInvitationInitialRole {
  const role = requiredText(value, "role", 32).toLowerCase();

  if (!INITIAL_ROLE_SET.has(role as PosInvitationInitialRole)) {
    throw new PosApiError(
      400,
      "POS_RBAC_ROLE_INVALID",
      "El rol inicial de la invitación no es válido."
    );
  }

  return role as PosInvitationInitialRole;
}

function appOrigin() {
  const value = process.env.COMETA_APP_ORIGIN;

  try {
    const url = new URL(value || "");
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin !== (value || "").replace(/\/$/, "")
    ) {
      throw new Error("invalid origin");
    }

    return url.origin;
  } catch {
    throw new PosApiError(
      500,
      "POS_INVITATION_DELIVERY_CONFIG_INVALID",
      "La entrega de invitaciones no está configurada."
    );
  }
}

function authErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isExistingAuthUserError(error: unknown) {
  const code = authErrorCode(error);
  return code === "email_exists" || code === "user_already_exists";
}

function rpcCode(error: unknown) {
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  const knownCodes = [
    "POS_MEMBERSHIP_ALREADY_EXISTS",
    "POS_INVITATION_ALREADY_PENDING",
    "POS_USER_LIMIT_REACHED",
    "POS_PERMISSION_REQUIRED",
    "POS_ROLE_ESCALATION_FORBIDDEN",
    "POS_RBAC_ROLE_INVALID",
  ];

  return knownCodes.find((code) => message.includes(code)) || null;
}

function reservationError(error: unknown) {
  const code = rpcCode(error);

  if (code === "POS_MEMBERSHIP_ALREADY_EXISTS") {
    return new PosApiError(409, code, "Esta persona ya forma parte del equipo.");
  }
  if (code === "POS_INVITATION_ALREADY_PENDING") {
    return new PosApiError(409, code, "Ya existe una invitación pendiente para este correo.");
  }
  if (code === "POS_USER_LIMIT_REACHED") {
    return new PosApiError(
      409,
      code,
      "Tu plan ya alcanzó el límite de usuarios."
    );
  }
  if (code === "POS_PERMISSION_REQUIRED" || code === "POS_ROLE_ESCALATION_FORBIDDEN") {
    return new PosApiError(403, code, "No tienes permiso para invitar con ese rol.");
  }
  if (code === "POS_RBAC_ROLE_INVALID") {
    return new PosApiError(400, code, "El rol inicial de la invitación no es válido.");
  }

  return new PosApiError(
    500,
    "POS_INVITATION_RESERVATION_FAILED",
    "No pudimos reservar la invitación. Inténtalo nuevamente."
  );
}

async function updateDeliveryMetadata({
  admin,
  invitationId,
  delivery,
  requiresPasswordSetup,
}: {
  admin: Awaited<ReturnType<typeof requirePosOperationalAccess>>["admin"];
  invitationId: string;
  delivery: "supabase_invite" | "resend_existing_auth";
  requiresPasswordSetup: boolean;
}) {
  const { data, error } = await admin
    .from("pos_user_invitations")
    .update({
      metadata: {
        source: "pos_rbac_v1b1",
        delivery,
        requires_password_setup: requiresPasswordSetup,
      },
    })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new PosApiError(
      500,
      "POS_INVITATION_METADATA_FAILED",
      "No pudimos preparar la invitación para su entrega."
    );
  }
}

async function compensateReservation({
  admin,
  brandSlug,
  invitationId,
  actorUserId,
}: {
  admin: Awaited<ReturnType<typeof requirePosOperationalAccess>>["admin"];
  brandSlug: string;
  invitationId: string;
  actorUserId: string;
}) {
  const { error } = await admin.rpc("pos_revoke_user_invitation_v1", {
    p_brand_slug: brandSlug,
    p_invitation_id: invitationId,
    p_actor_user_id: actorUserId,
  });

  if (error) {
    // Do not include recipient data, provider responses, or credentials in logs.
    console.error("POS invitation delivery compensation failed.");
  }
}

export async function POST(request: Request) {
  let reservation: {
    id: string;
    brandSlug: string;
    actorUserId: string;
    admin: Awaited<ReturnType<typeof requirePosOperationalAccess>>["admin"];
  } | null = null;

  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const context = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.access",
    });
    requirePosPermission(context, "pos.team.manage");

    const body = await readJsonBody<InviteBody>(request);
    const email = normalizeEmail(body.email);
    const role = initialRole(body.role);
    const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS).toISOString();

    const { data: reservationData, error: reservationErrorResult } = await context.admin.rpc(
      "pos_reserve_user_invitation_v1",
      {
        p_brand_slug: context.brand.slug,
        p_email: email,
        p_access_role: role,
        p_invited_by: context.user.userId,
        p_expires_at: expiresAt,
        p_metadata: {
          source: "pos_rbac_v1b1",
          delivery: "supabase_invite",
          requires_password_setup: true,
        },
      }
    );

    if (reservationErrorResult || !isReservedInvitation(reservationData)) {
      throw reservationError(reservationErrorResult);
    }

    reservation = {
      id: reservationData.id,
      brandSlug: context.brand.slug,
      actorUserId: context.user.userId,
      admin: context.admin,
    };

    const origin = appOrigin();
    const { error: authInviteError } = await context.admin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: new URL("/auth/confirm", origin).toString(),
        data: {
          invitation_source: "cometa_pos",
          invited_brand: context.brand.name,
          invited_role: getPosInvitationRoleLabel(role),
        },
      }
    );

    if (!authInviteError) {
      return ok(
        {
          invitation: {
            id: reservationData.id,
            role,
            expiresAt: reservationData.expires_at,
            delivery: "supabase_invite",
          },
        },
        201
      );
    }

    if (!isExistingAuthUserError(authInviteError)) {
      throw new PosApiError(
        502,
        "POS_INVITATION_DELIVERY_FAILED",
        "No pudimos enviar la invitación. Inténtalo nuevamente."
      );
    }

    await updateDeliveryMetadata({
      admin: context.admin,
      invitationId: reservationData.id,
      delivery: "resend_existing_auth",
      requiresPasswordSetup: false,
    });

    const delivery = await sendExistingAuthInvitationEmail({
      email,
      brandName: context.brand.name,
      role,
    });

    if (!delivery.ok) {
      throw new PosApiError(
        502,
        "POS_INVITATION_DELIVERY_FAILED",
        "No pudimos enviar la invitación. Inténtalo nuevamente."
      );
    }

    return ok(
      {
        invitation: {
          id: reservationData.id,
          role,
          expiresAt: reservationData.expires_at,
          delivery: "resend_existing_auth",
        },
      },
      201
    );
  } catch (error) {
    if (reservation) {
      await compensateReservation({
        admin: reservation.admin,
        brandSlug: reservation.brandSlug,
        invitationId: reservation.id,
        actorUserId: reservation.actorUserId,
      });
    }

    return handlePosError(error);
  }
}
