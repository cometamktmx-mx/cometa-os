import { requirePosOperationalAccess } from "@/lib/pos/access";
import {
  getEffectivePosRole,
  requirePosPermission,
  type PosCanonicalRole,
  type PosMembershipRole,
} from "@/lib/pos/rbac";
import { resolvePosCommercialContext } from "@/lib/pos/plans";
import {
  PosApiError,
  assertDatabaseResult,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
} from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_INVITE_ROLES: PosCanonicalRole[] = [
  "admin",
  "manager",
  "cashier",
  "inventory",
];
const ADMIN_INVITE_ROLES: PosCanonicalRole[] = [
  "manager",
  "cashier",
  "inventory",
];

type MembershipRow = {
  user_id: string;
  access_role: PosMembershipRole;
  status: "active";
};

type InvitationRow = {
  id: string;
  email: string;
  access_role: PosCanonicalRole;
  status: "pending";
  created_at: string;
  expires_at: string;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

function compactText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function allowedInviteRoles(role: PosMembershipRole) {
  if (role === "owner") return OWNER_INVITE_ROLES;
  if (role === "admin") return ADMIN_INVITE_ROLES;
  return [];
}

function allowedTargetRoles({
  actorRole,
  target,
  activeOwnerCount,
}: {
  actorRole: PosMembershipRole;
  target: MembershipRow;
  activeOwnerCount: number;
}) {
  if (actorRole === "owner") {
    if (target.access_role === "owner" && activeOwnerCount <= 1) return [];
    return ["admin", "manager", "cashier", "inventory"] as PosCanonicalRole[];
  }

  if (
    actorRole === "admin" &&
    ["manager", "cashier", "inventory"].includes(target.access_role)
  ) {
    return ADMIN_INVITE_ROLES;
  }

  return [];
}

function canRevokeMember({
  actorRole,
  target,
  isCurrentUser,
  activeOwnerCount,
}: {
  actorRole: PosMembershipRole;
  target: MembershipRow;
  isCurrentUser: boolean;
  activeOwnerCount: number;
}) {
  if (isCurrentUser) return false;
  if (actorRole === "owner") {
    return target.access_role !== "owner" || activeOwnerCount > 1;
  }

  return (
    actorRole === "admin" &&
    ["manager", "cashier", "inventory"].includes(target.access_role)
  );
}

function canRevokeInvitation(actorRole: PosMembershipRole, role: PosCanonicalRole) {
  if (actorRole === "owner") return true;
  return actorRole === "admin" && role !== "admin";
}

async function resolveMemberMetadata({
  admin,
  members,
}: {
  admin: Awaited<ReturnType<typeof requirePosOperationalAccess>>["admin"];
  members: MembershipRow[];
}) {
  const userIds = members.map((member) => member.user_id);
  const { data: profileRows, error: profileError } = await admin
    .from("user_profiles")
    .select("user_id,email,full_name")
    .in("user_id", userIds);

  assertDatabaseResult(profileError, "No se pudo resolver la información del equipo.");

  const profiles = new Map(
    ((profileRows || []) as ProfileRow[]).map((profile) => [profile.user_id, profile])
  );
  const missingEmailIds = userIds.filter((userId) => !compactText(profiles.get(userId)?.email));

  if (missingEmailIds.length > 0) {
    const fallbackRows = await Promise.all(
      missingEmailIds.map(async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data.user?.email) {
          throw new PosApiError(
            500,
            "POS_TEAM_MEMBER_LOOKUP_FAILED",
            "No se pudo resolver la información de un miembro del equipo."
          );
        }

        const fullName = compactText(data.user.user_metadata?.full_name);
        return {
          userId,
          email: data.user.email.trim().toLowerCase(),
          fullName,
        };
      })
    );

    for (const fallback of fallbackRows) {
      const current = profiles.get(fallback.userId);
      profiles.set(fallback.userId, {
        user_id: fallback.userId,
        email: fallback.email,
        full_name: current?.full_name || fallback.fullName,
      });
    }
  }

  return profiles;
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const context = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.access",
    });
    requirePosPermission(context, "pos.team.manage");

    if (!context.membership) {
      throw new PosApiError(403, "POS_PERMISSION_REQUIRED", "No tienes permiso para administrar el equipo.");
    }

    const now = new Date().toISOString();
    const effectivePlanCode = context.effectiveCommercialAccess.effective.planCode;

    if (!effectivePlanCode) {
      throw new PosApiError(
        500,
        "POS_ACCESS_RESPONSE_INVALID",
        "El acceso comercial efectivo no resolvió un plan POS."
      );
    }

    const [membersResult, invitationsResult] = await Promise.all([
      context.admin
        .from("user_brand_access")
        .select("user_id,access_role,status")
        .eq("brand_slug", context.brand.slug)
        .eq("status", "active")
        .order("access_role"),
      context.admin
        .from("pos_user_invitations")
        .select("id,email,access_role,status,created_at,expires_at")
        .eq("brand_slug", context.brand.slug)
        .eq("status", "pending")
        .gt("expires_at", now)
        .order("created_at", { ascending: false }),
    ]);

    assertDatabaseResult(membersResult.error, "No se pudo cargar el equipo.");
    assertDatabaseResult(invitationsResult.error, "No se pudieron cargar las invitaciones.");
    const [planResult, limitsResult] = await Promise.all([
      context.admin.from("pos_plans").select("code,name,list_price").eq("code", effectivePlanCode).single(),
      context.admin.from("pos_plan_limits").select("plan_code,max_locations,max_registers,max_users").eq("plan_code", effectivePlanCode).single(),
    ]);

    assertDatabaseResult(planResult.error, "No se pudo cargar el catálogo comercial.");
    assertDatabaseResult(limitsResult.error, "No se pudieron cargar los límites del plan.");

    if (!planResult.data || !limitsResult.data) {
      throw new PosApiError(
        404,
        "POS_PLAN_NOT_FOUND",
        "No encontramos la configuración comercial del plan."
      );
    }

    const members = (membersResult.data || []) as MembershipRow[];
    const invitations = (invitationsResult.data || []) as InvitationRow[];
    const profiles = await resolveMemberMetadata({ admin: context.admin, members });
    const commercial = resolvePosCommercialContext({
      plan: planResult.data,
      limits: limitsResult.data,
      usage: {
        locations: 0,
        registers: 0,
        users: members.length,
      },
    });
    const activeOwnerCount = members.filter((member) => member.access_role === "owner").length;
    const actor = context.membership;
    const effectiveUsage = members.length + invitations.length;

    return ok({
      brand: {
        slug: context.brand.slug,
        name: context.brand.name,
      },
      commercial: {
        plan: commercial.plan,
        activeUsers: members.length,
        pendingInvitations: invitations.length,
        effectiveUsage,
        maxUsers: commercial.limits.users,
        availableSeats: Math.max(0, commercial.limits.users - effectiveUsage),
      },
      members: members.map((member) => {
        const profile = profiles.get(member.user_id);
        const isCurrentUser = member.user_id === context.user.userId;
        const targetRoles = isCurrentUser
          ? []
          : allowedTargetRoles({
              actorRole: actor.role,
              target: member,
              activeOwnerCount,
            });

        return {
          userId: member.user_id,
          email: profile?.email || "",
          displayName: compactText(profile?.full_name),
          role: member.access_role,
          effectiveRole: getEffectivePosRole(member.access_role),
          status: member.status,
          legacy: member.access_role === "editor" || member.access_role === "viewer",
          isCurrentUser,
          canChangeRole: targetRoles.length > 0,
          canPromoteOwner:
            actor.role === "owner" && !isCurrentUser && member.access_role !== "owner",
          canRevoke: canRevokeMember({
            actorRole: actor.role,
            target: member,
            isCurrentUser,
            activeOwnerCount,
          }),
          allowedTargetRoles: targetRoles,
        };
      }),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.access_role,
        status: invitation.status,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        canRevoke: canRevokeInvitation(actor.role, invitation.access_role),
      })),
      actor: {
        role: actor.role,
        permissions: actor.permissions,
        allowedInviteRoles: allowedInviteRoles(actor.role),
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}
