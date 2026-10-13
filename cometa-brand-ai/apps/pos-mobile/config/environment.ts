import { localOrigin } from "../src/policy";
export type ApprovedTargets = { beta: Target; production: Target & { enabled: boolean } };
type Target = { backendOrigin: string; supabaseOrigin: string; metadataUrl: string };
export type MobileConfig = { channel: "development" | "beta"; backend: string; supabaseUrl: string; publicKey: string; metadataUrl: string; release: string };
const forbidden = new Set(["app.cometaos.com", "cometaos.com", "www.cometaos.com", "cometa-os.vercel.app", "zhtagqrzyovsrmsicaot.supabase.co"]);
export function remoteUrl(value: string, originOnly = false) {
  const u = new URL(value);
  const h = u.hostname;
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search || u.port ||
      !h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") ||
      /^[\d.]+$/.test(h) || h.includes(":") || forbidden.has(h) || h.endsWith("-cometa-os-s-projects.vercel.app") ||
      (originOnly && u.pathname !== "/")) throw Error("Unapproved remote endpoint");
  return originOnly ? u.origin : u.href;
}
export function validatePublicKey(value: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value)) return;
  try {
    const parts = value.split(".");
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (parts.length === 3 && claims && typeof claims === "object" && "role" in claims && claims.role === "anon") return;
  } catch { /* Reject without logging key material. */ }
  throw Error("A public Supabase anon/publishable key is required");
}
export function validateEnvironment(mode: string, env: Record<string, string | undefined>, approved: ApprovedTargets): MobileConfig {
  if (mode === "production") throw Error("Production builds are disabled; separate authorization required");
  if (mode !== "development" && mode !== "beta") throw Error("Unknown mobile environment");
  if (env.VITE_POS_ENV !== mode) throw Error("VITE_POS_ENV must match the explicit build profile");
  function required(name: string) { const v = env[name]?.trim(); if (!v) throw Error(`Missing ${name}`); return v; }
  const backend = required("VITE_POS_BACKEND"), supabaseUrl = required("VITE_SUPABASE_URL"), publicKey = required("VITE_SUPABASE_ANON_KEY");
  validatePublicKey(publicKey);
  const release = mode === "beta" ? required("VITE_POS_RELEASE") : "development";
  if (!/^[a-zA-Z0-9._+-]{1,100}$/.test(release)) throw Error("Invalid release identifier");
  if (mode === "development") return { channel: mode, backend: localOrigin(backend), supabaseUrl: localOrigin(supabaseUrl), publicKey, metadataUrl: "", release };
  const metadataUrl = required("VITE_POS_UPDATE_METADATA_URL"), target = approved.beta;
  if (![target.backendOrigin, target.supabaseOrigin, target.metadataUrl].every(Boolean)) throw Error("Beta targets have not been approved");
  if (remoteUrl(backend, true) !== remoteUrl(target.backendOrigin, true) || remoteUrl(supabaseUrl, true) !== remoteUrl(target.supabaseOrigin, true) || remoteUrl(metadataUrl) !== remoteUrl(target.metadataUrl)) throw Error("Beta endpoint does not match approved configuration");
  if (new URL(metadataUrl).origin !== new URL(backend).origin) throw Error("Metadata must use the approved Beta backend origin");
  return { channel: mode, backend: remoteUrl(backend, true), supabaseUrl: remoteUrl(supabaseUrl, true), publicKey, metadataUrl: remoteUrl(metadataUrl), release };
}
