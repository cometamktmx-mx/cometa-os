// Pure policy; no credentials or remote calls. Config is controlled by operators.
import approved from "../../../config/pos-environments.json";
export type BetaGrant = { userId: string; brandSlug: string; locationIds: string[]; expiresAt: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function betaGrants(text: string | undefined): BetaGrant[] {
  const raw: unknown = JSON.parse(text || "[]");
  if (!Array.isArray(raw)) throw Error("Invalid Beta partner configuration");
  return raw.map((item: unknown) => {
    if (!item || typeof item !== "object") throw Error("Invalid Beta partner");
    const r = item as Record<string, unknown>;
    if (typeof r.userId !== "string" || !uuid.test(r.userId) || typeof r.brandSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.brandSlug) ||
        !Array.isArray(r.locationIds) || !r.locationIds.length || !r.locationIds.every(x => typeof x === "string" && uuid.test(x)) ||
        typeof r.expiresAt !== "string" || !Number.isFinite(Date.parse(r.expiresAt))) throw Error("Invalid Beta partner fields");
    return { userId: r.userId, brandSlug: r.brandSlug, locationIds: r.locationIds as string[], expiresAt: r.expiresAt };
  });
}
export function betaAllows(grants: BetaGrant[], userId: string, brandSlug?: string, locationId?: string, now = Date.now()) {
  return grants.some(g => g.userId === userId && Date.parse(g.expiresAt) > now &&
    (brandSlug === undefined || g.brandSlug === brandSlug) && (locationId === undefined || g.locationIds.includes(locationId)));
}
export function assertBetaBackend(env: Record<string, string | undefined>, targets = approved.beta) {
  if (env.POS_MOBILE_ENV !== "beta" || env.COMETA_RUNTIME_ENV !== "beta" || env.POS_MOBILE_ENABLED !== "true") throw Error("Beta backend must be explicitly enabled");
  if (!targets.backendOrigin || !targets.supabaseOrigin || !targets.metadataUrl) throw Error("Beta targets are not approved");
  for (const origin of [targets.backendOrigin, targets.supabaseOrigin]) {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.origin !== origin || u.hostname === "zhtagqrzyovsrmsicaot.supabase.co" || ["app.cometaos.com","cometaos.com","www.cometaos.com","cometa-os.vercel.app"].includes(u.hostname) || u.hostname.endsWith("-cometa-os-s-projects.vercel.app") || !u.hostname.includes(".") || /^[\d.]+$/.test(u.hostname) || u.hostname.endsWith(".localhost") || u.username || u.password) throw Error("Unsafe Beta target");
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== targets.supabaseOrigin || env.APP_ORIGIN !== targets.backendOrigin) throw Error("Backend target mismatch");
  const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const privateKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publicKey || !privateKey) throw Error("Beta Supabase credentials are required");
  for (const [key, role, prefix] of [[publicKey, "anon", "sb_publishable_"], [privateKey, "service_role", "sb_secret_"]]) {
    if (key.startsWith(prefix) && key.length > prefix.length + 16) continue;
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
      if (claims.role !== role || claims.ref === "zhtagqrzyovsrmsicaot" || (claims.ref && claims.ref !== new URL(targets.supabaseOrigin).hostname.split(".")[0])) throw Error();
    } catch { throw Error("Supabase key does not match Beta role/project"); }
  }
  // This dedicated deployment has no billing, messaging, paid AI or shipping credentials.
  for (const [name, value] of Object.entries(env)) {
    if (value && /(?:STRIPE.*(?:SECRET|KEY)|OPENAI_API_KEY|ANTHROPIC_API_KEY|WHATSAPP.*(?:TOKEN|SECRET)|META_APP_SECRET|SKYDROPX.*(?:SECRET|ID)|CRON_SECRET|SALES_AI_INTERNAL_SECRET)/i.test(name)) throw Error("External integration credentials are forbidden in Beta");
  }
  if (env.SALES_AI_SEND_WHATSAPP_ENABLED !== "false" || env.SALES_AI_AGENT_MODE !== "disabled" || env.POS_BETA_EXTERNAL_INTEGRATIONS !== "disabled") throw Error("External integrations must be disabled");
  betaGrants(env.POS_BETA_PARTNERS_JSON);
}
export function betaPublicPath(path: string, method: string) {
  if (path.startsWith("/api/pos/mobile/")) return true;
  return ["GET", "HEAD"].includes(method) && (path === "/android" || path === "/mobile/releases/latest" || path.startsWith("/mobile/auth/") || path.startsWith("/mobile/pos/") || path.startsWith("/_next/static/") || path === "/favicon.ico");
}
