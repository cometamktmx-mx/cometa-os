import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const requestedPort = Number(process.env.COMU_FULFILLMENT_HTTP_PORT || 3131); let port = requestedPort; let base = `http://127.0.0.1:${port}`; let child = null;
let stderr = "";
const envText = await readFile(".env.local", "utf8"); const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1") || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("COMU_FULFILLMENT_AUTH_CERT_REQUIRES_LOCAL_SUPABASE");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }); const email = `comu-fulfillment-cert-${Date.now()}@example.test`; const password = `Cert-${crypto.randomUUID()}-Aa1!`; const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (created.error || !created.data.user) throw created.error || new Error("COMU_FULFILLMENT_USER_FAILED"); const userId = created.data.user.id; await admin.from("user_profiles").upsert({ user_id: userId, email, role: "client", status: "active" }, { onConflict: "user_id" }); const jar = new Map(); const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })), setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)) } }); const signed = await auth.auth.signInWithPassword({ email, password }); if (signed.error) throw signed.error; const cookieHeader = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
async function probe(url) { try { const response = await fetch(`${url}/api/comu/catalog`); return response.status < 500; } catch { return false; } }
async function ready() { if (await probe(base)) return; const fallback = "http://127.0.0.1:3127"; if (await probe(fallback)) { base = fallback; port = 3127; return; } child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "-p", String(port)], { cwd: process.cwd(), shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } }); child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4000); }); for (let i = 0; i < 90; i += 1) { if (await probe(base)) return; await delay(1000); } throw new Error(`COMU_FULFILLMENT_HTTP_SERVER_NOT_READY ${stderr}`); }
try {
  await ready();
  const headers = { Cookie: cookieHeader }; const seller = await fetch(`${base}/api/comu/seller/orders?sellerId=00000000-0000-0000-0000-000000000000`, { headers }); assert.ok([403, 404].includes(seller.status), `seller auth ${seller.status}`);
  const buyer = await fetch(`${base}/api/comu/orders/00000000-0000-0000-0000-000000000000/fulfillment`, { headers }); assert.ok([404].includes(buyer.status), `buyer auth ${buyer.status}`);
  const hub = await fetch(`${base}/api/comu/admin/hub/receive`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ suborderId: "00000000-0000-0000-0000-000000000000", token: "invalid" }) }); assert.equal(hub.status, 403, `hub auth ${hub.status}`);
  console.log("COMU FULFILLMENT AUTHENTICATED HTTP CERTIFICATION PASS");
} catch (error) { console.error(error?.stack || error, stderr); process.exitCode = 1; } finally { await admin.from("user_profiles").delete().eq("user_id", userId); await admin.auth.admin.deleteUser(userId); if (child) { child.kill("SIGTERM"); await delay(500); if (!child.killed) child.kill("SIGKILL"); } }
