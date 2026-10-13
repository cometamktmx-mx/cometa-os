import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";
import { assertBrandSlug } from "@/lib/workspace/online-store-access";
import { getAdminClient } from "@/lib/pos/server";
import { BrandOsGuardError } from "@/lib/brand-os/server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
type Context = { params: Promise<{ brandSlug: string }> };
function failure(e: unknown) {
  if (e instanceof BrandOsGuardError) return Response.json({ error: e.message }, { status: e.status, headers });
  return Response.json({ error: "No se pudo verificar la cortesía. Recarga antes de intentar nuevamente." }, { status: 503, headers });
}
async function read(slug: string) {
  const db = getAdminClient();
  const [brand, access, grants, events, plans] = await Promise.all([
    db.from("brands").select("id").eq("slug", slug).maybeSingle(),
    db.rpc("pos_get_effective_commercial_access", { p_brand_slug: slug }),
    db.from("pos_commercial_grants").select("id,plan_code,status,starts_at,ends_at,reason,created_by,created_at,revoked_by,revoked_at").eq("brand_slug", slug).order("starts_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("pos_commercial_grant_events").select("id,actor_user_id,action,reason,previous_grant,new_grant,created_at").eq("brand_slug", slug).order("created_at", { ascending: false }).limit(30),
    db.from("pos_plans").select("code,name").eq("active", true).order("code"),
  ]);
  if ([brand, access, grants, events, plans].some(r => r.error)) throw Error("LOOKUP_FAILED");
  if (!brand.data) throw new BrandOsGuardError(404, "BRAND_NOT_FOUND", "Marca no disponible.");
  const ids = [...new Set((events.data ?? []).map(e => e.actor_user_id))];
  const profiles = ids.length ? await db.from("user_profiles").select("user_id,full_name,email").in("user_id", ids) : { data: [], error: null };
  if (profiles.error) throw Error("ACTORS_LOOKUP_FAILED");
  return { slug, access: access.data, grants: grants.data, plans: plans.data, events: (events.data ?? []).map(e => ({ ...e, actor: profiles.data?.find(p => p.user_id === e.actor_user_id)?.full_name || profiles.data?.find(p => p.user_id === e.actor_user_id)?.email || e.actor_user_id })) };
}
export async function GET(_request: Request, context: Context) {
  try { await requireAdminWorkspace(); const slug = (await context.params).brandSlug; assertBrandSlug(slug); return Response.json(await read(slug), { headers }); }
  catch (e) { return failure(e); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireAdminWorkspace();
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new BrandOsGuardError(403, "ORIGIN_DENIED", "Origen no permitido.");
    const slug = (await context.params).brandSlug; assertBrandSlug(slug);
    const b: unknown = await request.json().catch(() => null);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new BrandOsGuardError(400, "INVALID", "Datos inválidos.");
    const v = b as Record<string, unknown>;
    if (Object.keys(v).some(k => !["expectedId", "action", "plan", "endsAt", "reason"].includes(k)) || !["save", "revoke"].includes(String(v.action)) || typeof v.reason !== "string" || v.reason.trim().length < 3 || v.reason.length > 500 || (v.expectedId !== null && (typeof v.expectedId !== "string" || !/^[0-9a-f-]{36}$/i.test(v.expectedId))) || (v.action === "save" && (typeof v.plan !== "string" || !v.plan || (v.endsAt !== null && (typeof v.endsAt !== "string" || !Number.isFinite(Date.parse(v.endsAt)) || Date.parse(v.endsAt) <= Date.now()))))) throw new BrandOsGuardError(400, "INVALID", "Revisa plan, motivo y vencimiento.");
    const result = await getAdminClient().rpc("pos_manage_complimentary_v1", { p_brand: slug, p_actor: actor.userId, p_expected: v.expectedId, p_action: v.action, p_plan: v.plan ?? null, p_end: v.endsAt ?? null, p_reason: v.reason.trim() });
    if (result.error) {
      if (result.error.code === "40001" || result.error.message === "GRANT_CONFLICT") throw new BrandOsGuardError(409, "CONFLICT", "La cortesía cambió. Recarga antes de guardar.");
      if (result.error.code === "42501") throw new BrandOsGuardError(403, "DENIED", "Sin permiso administrativo.");
      if (result.error.code === "22023") throw new BrandOsGuardError(400, "INVALID", "Plan o fecha no válidos.");
      throw Error("SAVE_FAILED");
    }
    return Response.json(await read(slug), { headers });
  } catch (e) { return failure(e); }
}
