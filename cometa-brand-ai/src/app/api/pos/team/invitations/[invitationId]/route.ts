import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosPermission } from "@/lib/pos/rbac";
import {
  PosApiError,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  uuidValue,
} from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function teamRpcError(error: unknown) {
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  const mappings = [
    ["POS_INVITATION_NOT_PENDING", 409, "Esta invitación ya no está disponible."],
    ["POS_ROLE_ESCALATION_FORBIDDEN", 403, "No tienes permiso para revocar esta invitación."],
    ["POS_PERMISSION_REQUIRED", 403, "No tienes permiso para administrar el equipo."],
  ] as const;
  const match = mappings.find(([code]) => message.includes(code));

  return match ? new PosApiError(match[1], match[0], match[2]) : null;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ invitationId: string }> }
) {
  try {
    const { invitationId: rawInvitationId } = await context.params;
    const invitationId = uuidValue(rawInvitationId, "invitationId");
    if (!invitationId) {
      throw new PosApiError(400, "POS_VALIDATION_ERROR", "La invitación no es válida.");
    }

    const access = await requirePosOperationalAccess({
      brandSlug: getBrandSlugFromUrl(request),
      entitlement: "pos.access",
    });
    requirePosPermission(access, "pos.team.manage");

    const { data, error } = await access.admin.rpc("pos_revoke_user_invitation_v1", {
      p_brand_slug: access.brand.slug,
      p_invitation_id: invitationId,
      p_actor_user_id: access.user.userId,
    });

    if (error) {
      throw teamRpcError(error) || new PosApiError(
        500,
        "POS_INVITATION_REVOKE_FAILED",
        "No pudimos revocar la invitación. Inténtalo nuevamente."
      );
    }

    if (!data) {
      throw new PosApiError(
        500,
        "POS_INVITATION_REVOKE_FAILED",
        "No pudimos revocar la invitación. Inténtalo nuevamente."
      );
    }

    return ok({ invitationId });
  } catch (error) {
    return handlePosError(error);
  }
}
