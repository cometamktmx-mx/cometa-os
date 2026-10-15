import { createHash } from "node:crypto";
import { withMobileTransport, type MobileTransport } from "@/lib/pos/transport-server";
import { getAdminClient, requirePosUser, requirePosContext, readJsonBody, requiredText, handlePosError, PosApiError, ok } from "@/lib/pos/server";
import { getPassivePosProductAvailability } from "@/lib/pos/access";
import * as devices from "@/app/api/pos/devices/route";
import * as operator from "@/app/api/pos/operator-session/route";
import * as food from "@/app/api/pos/food/route";
import * as preview from "@/app/api/pos/food/configuration-preview/route";
import * as memory from "@/app/api/pos/food/customer-memory/route";
import * as customers from "@/app/api/pos/customers/route";
import * as cash from "@/app/api/pos/cash-sessions/route";
import { assertBetaBackend, betaAllows, betaGrants, type BetaGrant } from "@/lib/pos/beta-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Handler = (request: Request) => Promise<Response>;
const routes: Record<string, Partial<Record<string, Handler>>> = {
  devices: { GET: devices.GET, POST: devices.POST, DELETE: devices.DELETE },
  "operator-session": { GET: operator.GET, POST: operator.POST },
  food: { GET: food.GET, POST: food.POST },
  "food/configuration-preview": { POST: preview.POST },
  "food/customer-memory": { GET: memory.GET, PATCH: memory.PATCH },
  customers: { GET: customers.GET, POST: customers.POST, PATCH: customers.PATCH },
  "cash-sessions": { GET: cash.GET, POST: cash.POST },
};
const credentialNames = ["cometa_pos_device", "cometa_pos_staff_session", "cometa_pos_admin_session"] as const;
async function dispatch(request: Request, context: { params: Promise<{ path: string[] }> }) {
  // Explicit opt-in; M2 backend must point to the certified LOCAL database.
  const safeHeaders = { "Cache-Control": "no-store", "Vary": "Authorization" };
  if (process.env.POS_MOBILE_ENABLED !== "true") return new Response(null, { status: 404, headers: safeHeaders });
  const beta = process.env.POS_MOBILE_ENV === "beta";
  let grants: BetaGrant[] = [];
  try {
    if (beta) { assertBetaBackend(process.env); grants = betaGrants(process.env.POS_BETA_PARTNERS_JSON); }
    else if (process.env.POS_MOBILE_ENV !== "development" || process.env.COMETA_RUNTIME_ENV === "beta") throw Error("Unknown mobile environment");
  } catch { return Response.json({ error: "Mobile environment unavailable", code: "POS_ENV_MISSING" }, { status: 503, headers: safeHeaders }); }
  const databaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "http://unconfigured.invalid").hostname;
  if (!beta && !["localhost", "127.0.0.1", "[::1]"].includes(databaseHost)) {
    return Response.json({ error: "M2 requiere el backend Supabase LOCAL certificado.", code: "POS_MOBILE_LOCAL_REQUIRED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const name = (await context.params).path.join("/");
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!bearer || bearer.length > 16384) return Response.json({ error: "Inicia sesión.", code: "POS_UNAUTHORIZED" }, { status: 401, headers: safeHeaders });
  const values = new Map<string, string>();
  for (const key of credentialNames) {
    const value = request.headers.get(`x-${key.replaceAll("_", "-")}`);
    if (value && value.length <= 512) values.set(key, value);
  }
  const transport: MobileTransport = { bearer, values, changes: {}, discovery: name === "brands" || name === "devices" };
  if (beta) transport.authorizeContext = (userId, brandSlug, locationId) => {
    if (!betaAllows(grants, userId, brandSlug, locationId)) throw new PosApiError(403, "POS_BRAND_FORBIDDEN", "Cuenta, negocio o sucursal no autorizados para Beta.");
  };
  return withMobileTransport(transport, async () => {
    let response: Response;
    try {
      const user = await requirePosUser(); // Verify JWT/account even for discovery/logout.
      // Logout remains available after a partner loses authorization.
      if (beta && name !== "session" && !betaAllows(grants, user.userId)) throw new PosApiError(403, "POS_ACCOUNT_ACCESS_DENIED", "Cuenta no autorizada para Beta.");
      if (beta && name === "devices" && request.method === "POST") {
        const body = await readJsonBody<Record<string, unknown>>(request.clone());
        transport.authorizeContext?.(user.userId, requiredText(body.brandSlug, "brandSlug", 120), requiredText(body.locationId, "locationId", 36));
      }
      if (beta && name === "devices" && request.method === "DELETE") {
        const body = await readJsonBody<Record<string, unknown>>(request.clone());
        const slug = requiredText(body.brandSlug, "brandSlug", 120);
        transport.authorizeContext?.(user.userId, slug);
        const target = await getAdminClient().from("pos_devices").select("location_id").eq("id", requiredText(body.deviceId, "deviceId", 36)).eq("brand_slug", slug).maybeSingle();
        if (target.error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudo validar la terminal.");
        if (!target.data) throw new PosApiError(404, "POS_DEVICE_RESOURCE_NOT_FOUND", "Terminal no disponible.");
        transport.authorizeContext?.(user.userId, slug, target.data.location_id);
      }
      if (name === "brands" && request.method === "GET") {
        const admin = getAdminClient();
        // Membership is explicit even for platform admins in the mobile selector.
        if (!user.allowedBrandSlugs.length) {
          const memberships = await admin.from("user_brand_access").select("brand_slug").eq("user_id", user.userId).eq("status", "active");
          if (memberships.error) throw new PosApiError(503, "POS_MEMBERSHIP_LOOKUP_FAILED", "No se pudieron consultar los negocios.");
          user.allowedBrandSlugs = (memberships.data || []).map(row => row.brand_slug);
        }
        const result = await admin.from("brands").select("id,slug,name").in("slug", user.allowedBrandSlugs);
        if (result.error) throw new PosApiError(503, "POS_BRAND_LOOKUP_FAILED", "No se pudieron consultar los negocios.");
        const brands = [];
        for (const brand of result.data || []) {
          if (beta && !betaAllows(grants, user.userId, brand.slug)) continue;
          const access = await getPassivePosProductAvailability(brand.slug);
          if (!access.available) continue;
          const locations = await admin.from("pos_locations").select("id,name").eq("brand_slug", brand.slug).eq("active", true);
          if (locations.error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudieron consultar las sucursales.");
          brands.push({ ...brand, locations: (locations.data || []).filter(l => !beta || betaAllows(grants, user.userId, brand.slug, l.id)) });
        }
        response = ok({ brands });
      } else if (name === "session/lock" && request.method === "POST") {
        const body = await readJsonBody<Record<string, unknown>>(request);
        const context = await requirePosContext(requiredText(body.brandSlug, "brandSlug", 120));
        if (!context.device) throw new PosApiError(401, "POS_DEVICE_REQUIRED", "Enrola esta terminal.");
        // Cold starts have no operator token in memory. Lock only this verified terminal,
        // including sessions from a process that was killed before background cleanup.
        const result = await context.admin.from("pos_staff_sessions").update({ revoked_at: new Date().toISOString() })
          .eq("device_id", context.device.id).eq("host_user_id", user.userId).eq("brand_slug", context.brand.slug).is("revoked_at", null);
        if (result.error) throw new PosApiError(503, "POS_STAFF_SESSION_REVOKE_FAILED", "No se pudo bloquear la terminal.");
        transport.changes.cometa_pos_staff_session = null;
        transport.changes.cometa_pos_admin_session = null;
        response = ok({ locked: true });
      } else if (name === "session" && request.method === "DELETE") {
        const admin = getAdminClient();
        const token = values.get("cometa_pos_staff_session");
        if (token) {
          const result = await admin.from("pos_staff_sessions").update({ revoked_at: new Date().toISOString() }).eq("host_user_id", user.userId).eq("token_hash", createHash("sha256").update(token).digest("hex"));
          if (result.error) throw new PosApiError(503, "POS_STAFF_SESSION_REVOKE_FAILED", "No se pudo cerrar el operador.");
        }
        const result = await admin.auth.admin.signOut(bearer, "local");
        if (result.error) throw new PosApiError(503, "POS_LOGOUT_FAILED", "No se pudo cerrar la cuenta.");
        credentialNames.forEach(key => { transport.changes[key] = null; });
        response = ok({ clearLocalContext: true });
      } else {
        const handler = routes[name]?.[request.method];
        if (!handler) throw new PosApiError(404, "POS_MOBILE_ROUTE_NOT_FOUND", "Operación no disponible.");
        response = await handler(request);
      }
    } catch (error) { response = handlePosError(error); }
    const body: unknown = await response.json();
    return Response.json({ payload: body, credentials: transport.changes }, {
      status: response.status, headers: { "Cache-Control": "no-store", "Vary": "Authorization" },
    });
  });
}
export { dispatch as GET, dispatch as POST, dispatch as PATCH, dispatch as DELETE };
