import { NextResponse } from "next/server";
import { createTeamAccount, getAccessCenterPeople, mutateAccess, type AccessAction } from "@/lib/workspace/access";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { saveStudioWorkProfile } from "@/lib/studio/operation";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ ok: true, ...(await getAccessCenterPeople()) }); }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const requestedAction = String(body.action || "");
    if (requestedAction === "save_work_profile") {
      const workDays = body.workDays === null ? null : Array.isArray(body.workDays) ? body.workDays.map(Number) : [];
      const result = await saveStudioWorkProfile(String(body.targetUserId || ""), { typicalStart: body.typicalStart ? String(body.typicalStart) : null, targetMinutes: Number(body.targetMinutes), workDays, timezone: String(body.timezone || "") });
      return NextResponse.json({ ok: true, result });
    }
    const action = requestedAction as AccessAction;
    if (action === "create_team") { const brands = Array.isArray(body.brands) ? body.brands : []; const result = await createTeamAccount({ fullName: String(body.fullName || ""), email: String(body.email || ""), password: String(body.password || ""), brands: brands.map((item) => { const row = item as Record<string, unknown>; return { slug: String(row.slug || ""), role: String(row.role || ""), isPrimary: row.isPrimary === true }; }) }); return NextResponse.json({ ok: true, result }); }
    if (!["create_profile", "grant_brand", "revoke_brand", "revoke_all", "restore_account", "restore_brand", "change_role", "team_add_brand", "team_change_operational_role", "team_set_primary"].includes(action)) return NextResponse.json({ ok: false, error: "ACTION_INVALID" }, { status: 400 });
    const result = await mutateAccess({ action, targetUserId: String(body.targetUserId || ""), brandSlug: body.brandSlug ? String(body.brandSlug) : undefined, accessRole: body.accessRole ? String(body.accessRole) : undefined });
    return NextResponse.json({ ok: true, result });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  const status = error instanceof BrandOsGuardError ? error.status : 400;
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ACCESS_OPERATION_FAILED" }, { status });
}
