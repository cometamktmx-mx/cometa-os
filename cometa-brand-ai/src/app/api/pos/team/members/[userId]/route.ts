import { requirePosOperationalAccess } from "@/lib/pos/access";
import { POS_CANONICAL_ROLES, requirePosPermission, type PosCanonicalRole } from "@/lib/pos/rbac";
import {
  PosApiError,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoleBody = {
  role?: unknown;
};

const CANONICAL_ROLE_SET = new Set<string>(POS_CANONICAL_ROLES);

function canonicalRole(value: unknown): PosCanonicalRole {
  const role = requiredText(value, "role", 32).toLowerCase();
  if (!CANONICAL_ROLE_SET.has(role)) {
    throw new PosApiError(400, "POS_RBAC_ROLE_INVALID", "El rol no es válido.");
  }

  return role as PosCanonicalRole;
}

function teamRpcError(error: unknown) {
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  const mappings = [
    ["POS_LAST_OWNER_REQUIRED", 409, "Debe existir al menos un propietario activo."],
    ["POS_ROLE_ESCALATION_FORBIDDEN", 403, "No tienes permiso para realizar este cambio de rol."],
    ["POS_PERMISSION_REQUIRED", 403, "No tienes permiso para administrar el equipo."],
    ["POS_RBAC_ROLE_INVALID", 400, "El rol no es válido."],
    ["POS_MEMBERSHIP_NOT_FOUND", 404, "El miembro ya no está disponible."],
  ] as const;
  const match = mappings.find(([code]) => message.includes(code));

  return match ? new PosApiError(match[1], match[0], match[2]) : null;
}

async function teamAccess(request: Request) {
  const access = await requirePosOperationalAccess({
    brandSlug: getBrandSlugFromUrl(request),
    entitlement: "pos.access",
  });
  requirePosPermission(access, "pos.team.manage");
  return access;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: rawUserId } = await context.params;
    const userId = uuidValue(rawUserId, "userId");
    if (!userId) {
      throw new PosApiError(400, "POS_VALIDATION_ERROR", "El miembro no es válido.");
    }
    const body = await readJsonBody<RoleBody>(request);
    const role = canonicalRole(body.role);
    const access = await teamAccess(request);
    const { data, error } = await access.admin.rpc("pos_change_brand_membership_role_v1", {
      p_brand_slug: access.brand.slug,
      p_target_user_id: userId,
      p_new_role: role,
      p_actor_user_id: access.user.userId,
    });

    if (error) {
      throw teamRpcError(error) || new PosApiError(
        500,
        "POS_MEMBER_ROLE_CHANGE_FAILED",
        "No pudimos actualizar el rol. Inténtalo nuevamente."
      );
    }

    if (!data) {
      throw new PosApiError(
        500,
        "POS_MEMBER_ROLE_CHANGE_FAILED",
        "No pudimos actualizar el rol. Inténtalo nuevamente."
      );
    }

    return ok({ userId, role });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: rawUserId } = await context.params;
    const userId = uuidValue(rawUserId, "userId");
    if (!userId) {
      throw new PosApiError(400, "POS_VALIDATION_ERROR", "El miembro no es válido.");
    }

    const access = await teamAccess(request);
    if (userId === access.user.userId) {
      throw new PosApiError(
        403,
        "POS_PERMISSION_REQUIRED",
        "No puedes revocar tu propio acceso desde Equipo."
      );
    }

    const { data, error } = await access.admin.rpc("pos_revoke_brand_membership_v1", {
      p_brand_slug: access.brand.slug,
      p_target_user_id: userId,
      p_actor_user_id: access.user.userId,
    });

    if (error) {
      throw teamRpcError(error) || new PosApiError(
        500,
        "POS_MEMBER_REVOKE_FAILED",
        "No pudimos revocar el acceso. Inténtalo nuevamente."
      );
    }

    if (!data) {
      throw new PosApiError(
        500,
        "POS_MEMBER_REVOKE_FAILED",
        "No pudimos revocar el acceso. Inténtalo nuevamente."
      );
    }

    return ok({ userId });
  } catch (error) {
    return handlePosError(error);
  }
}
