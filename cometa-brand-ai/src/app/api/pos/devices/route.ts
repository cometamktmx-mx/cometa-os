import { cookies } from "next/headers";
import { handlePosError, ok, PosApiError, readJsonBody, requiredText, requirePosContext, getBrandSlugFromUrl, uuidValue } from "@/lib/pos/server";
import { clearPosSessionCookies, enrollPosDevice, findSessionDevice, resolvePosDevice, revokePosDevice } from "@/lib/pos/device-server";
import { requirePosCommercialAccess } from "@/lib/pos/access";
import { requirePosPermission } from "@/lib/pos/rbac";
import { getStaffSession, getPosMode, isStaffAdminMode } from "@/lib/pos/staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function managementContext(brandSlug: string) {
  return requirePosContext(brandSlug, undefined, { deviceManagement: true });
}

async function requireManager(context: Awaited<ReturnType<typeof managementContext>>, enrollment = false) {
  if (!context.user.isAdmin) requirePosPermission(context, "pos.settings.manage");
  // A currently locked terminal cannot borrow its host's administrative rights.
  if (context.device || (!enrollment && await getPosMode(context) !== "RETAIL") || (await cookies()).get("cometa_pos_staff_session")) {
    const session = await getStaffSession(context);
    if (!session || !(await isStaffAdminMode(session))) throw new PosApiError(403, "POS_ADMIN_OPERATOR_REQUIRED", "Se requiere un operador Administrador en modo administrativo.");
  }
}

export async function GET(request: Request) {
  try {
    const context = await managementContext(getBrandSlugFromUrl(request));
    context.device = await resolvePosDevice(context);
    return ok({ device: context.device });
  } catch (error) { return handlePosError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const context = await managementContext(requiredText(body.brandSlug, "brandSlug", 120));
    context.device = await resolvePosDevice(context);
    await requireManager(context, true);
    await requirePosCommercialAccess(context, "pos.access");
    const locationId = uuidValue(body.locationId, "locationId");
    if (!locationId) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Selecciona una sucursal.");
    return ok({ device: await enrollPosDevice(context, locationId, requiredText(body.label, "label", 120)) }, 201);
  } catch (error) { return handlePosError(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const context = await managementContext(requiredText(body.brandSlug, "brandSlug", 120));
    const deviceId = uuidValue(body.deviceId, "deviceId");
    if (!deviceId) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Selecciona una terminal.");
    const current = await findSessionDevice(context);
    const own = current?.id === deviceId && current?.brand_slug === context.brand.slug;
    if (!own) { context.device = await resolvePosDevice(context); await requireManager(context); }
    await revokePosDevice(context, deviceId);
    if (own) await clearPosSessionCookies();
    // Revoked Supabase session bindings remain tombstoned: sign out and authenticate
    // afresh to return to ordinary web access. No reactivation via this endpoint.
    return ok({ revoked: true, clearLocalContext: own });
  } catch (error) { return handlePosError(error); }
}
