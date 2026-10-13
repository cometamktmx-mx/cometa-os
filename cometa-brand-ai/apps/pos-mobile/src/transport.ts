import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { createClient } from "@supabase/supabase-js";
import { vault } from "./vault";
import { networkState } from "./policy";
import { mobileConfig } from "./environment";
import { clearPosLocalContext } from "@/lib/pos/offline-storage";
import type { PosFetch } from "@/lib/pos/client-transport";

export const backend = mobileConfig.backend;
const supabaseUrl = mobileConfig.supabaseUrl;
const anon = mobileConfig.publicKey;
export async function nativeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!Capacitor.isNativePlatform()) return fetch(input, init);
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  const result = await CapacitorHttp.request({ url, method: init?.method || "GET", headers, data: typeof init?.body === "string" ? JSON.parse(init.body) : undefined, responseType: "json", connectTimeout: 15000, readTimeout: 30000 });
  if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Response([204, 205, 304].includes(result.status) ? null : JSON.stringify(result.data), { status: result.status, headers: result.headers });
}
export const auth = createClient(supabaseUrl, anon, {
  auth: { storage: vault, storageKey: "host-session", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
  global: { fetch: nativeFetch },
});
const operatorCredentials = new Map<string, string>();
let generation = 0;
export function forgetOperator() { generation++; operatorCredentials.clear(); }
export async function clearMobileContext() { forgetOperator(); await vault.removeItem("terminal"); await clearPosLocalContext(); }
export type Terminal = { brandSlug: string; deviceId: string; token: string };
export const readTerminal = async (): Promise<Terminal | null> => { const text = await vault.getItem("terminal"); return text ? JSON.parse(text) : null; };
export const mobileFetch: PosFetch = async (path, init = {}) => {
  if (!path.startsWith("/api/pos/") || path.includes("..")) throw new Error("Ruta POS inválida.");
  const epoch = generation;
  const credentialsAtStart = new Map(operatorCredentials);
  const session = await auth.auth.getSession();
  if (session.error || !session.data.session) throw Object.assign(new Error("Inicia sesión."), { status: 401 });
  const terminal = await readTerminal();
  if (epoch !== generation) throw new DOMException("Context changed", "AbortError");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.data.session.access_token}`);
  if (terminal) headers.set("x-cometa-pos-device", terminal.token);
  for (const [key, value] of credentialsAtStart) headers.set(`x-${key.replaceAll("_", "-")}`, value);
  const route = path.replace("/api/pos/", "/api/pos/mobile/");
  const response = await nativeFetch(Capacitor.isNativePlatform() ? backend + route : route, { ...init, headers });
  const envelope = await response.json();
  if (epoch !== generation) throw new DOMException("Context changed", "AbortError");
  const payload = envelope.payload ?? envelope;
  for (const [key, value] of Object.entries(envelope.credentials || {})) {
    if (key === "cometa_pos_device") {
      if (typeof value === "string" && payload.device?.id) {
        const body = JSON.parse(String(init.body || "{}"));
        await vault.setItem("terminal", JSON.stringify({ brandSlug: body.brandSlug, deviceId: payload.device.id, token: value }));
      } else if (value === null) await vault.removeItem("terminal");
    } else if (["cometa_pos_staff_session", "cometa_pos_admin_session"].includes(key)) {
      if (typeof value === "string") operatorCredentials.set(key, value); else operatorCredentials.delete(key);
    }
  }
  if (["auth", "denied"].includes(networkState(response.status))) {
    await clearPosLocalContext();
    window.dispatchEvent(new CustomEvent("pos-mobile-denied", { detail: { status: response.status, code: payload.code, error: payload.error } }));
  }
  return new Response(JSON.stringify(payload), { status: response.status, headers: { "Content-Type": "application/json" } });
};
export async function api<T>(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const response = await mobileFetch(`/api/pos/${path}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo confirmar la operación."), { status: response.status, code: data.code });
  return data;
}
