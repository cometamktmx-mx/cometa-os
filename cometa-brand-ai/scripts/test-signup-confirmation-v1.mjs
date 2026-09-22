import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

let verifications = 0;
let receivedToken;
const failures = [];
const used = new Set(), cookies = new Map();
class NextResponse extends Response {
  static redirect(url, status = 307) { return new NextResponse(null, { status, headers: { location: String(url) } }); }
}
function load(file) {
  const loaded = { exports: {} };
  const require = (name) => {
    if (name === "next/server") return { NextResponse };
    if (name === "next/headers") return { cookies: async () => ({ getAll: () => [], set: (name, value) => cookies.set(name, value) }) };
    if (name === "@supabase/ssr") return { createServerClient: (_url, _key, options) => ({ auth: {
      verifyOtp: async ({ token_hash, type }) => {
        verifications++;
        receivedToken = token_hash;
        assert.equal(type, "email");
        if (!token_hash.startsWith("valid-") || used.has(token_hash)) return { data: { session: null }, error: { code: "otp_expired" } };
        used.add(token_hash);
        options.cookies.setAll([{ name: "sb-test-auth-token", value: "test-session", options: { httpOnly: true } }]);
        return { data: { session: { user: { id: "test-user" } } }, error: null };
      },
    } }) };
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    throw Error(`Unexpected import: ${name}`);
  };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", "module", "console", code)(require, loaded.exports, loaded, {
    warn: (label, detail) => { assert.equal(label, "COMETA_SIGNUP_CONFIRM_FAILURE"); assert.deepEqual(Object.keys(detail), ["reason"]); failures.push(detail.reason); },
  });
  return loaded.exports;
}
const origin = "https://app.cometaos.com";
const route = load("src/app/confirm-signup/route.ts");
const legacy = load("src/app/auth/confirm/route.ts");
function request(path, init) { const value = new Request(origin + path, init); value.nextUrl = new URL(value.url); return value; }
function post(token, next = "/onboarding/business", from = origin) {
  return route.POST(request("/confirm-signup", { method: "POST", headers: { origin: from }, body: new URLSearchParams({ token_hash: token, type: "email", next }) }));
}
const get = route.GET(request("/confirm-signup?token_hash=valid-token&type=email"));
const html = await get.text();
assert.equal(get.status, 200);
assert.equal(verifications, 0);
assert.match(html, /method="post"/);
assert.match(html, />Confirmar mi cuenta<\/button>/);
assert.doesNotMatch(html, /<script|useEffect/);
assert.equal(get.headers.get("cache-control"), "private, no-store");
assert.equal(get.headers.get("referrer-policy"), "strict-origin");
// Submit the fields rendered by GET, not a separately constructed token fixture.
const decode = value => value.replace(/&(amp|quot|lt|gt|#39);/g, (_, entity) => ({ amp: "&", quot: '"', lt: "<", gt: ">", "#39": "'" })[entity]);
const fields = new URLSearchParams([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(([, name, value]) => [name, decode(value)]));
assert.equal(fields.get("token_hash"), "valid-token");
assert.equal(fields.get("type"), "email");
assert.equal(fields.get("next"), "/onboarding/business");
const action = html.match(/<form method="post" action="([^"]+)">/)[1];
// A native form POST under no-referrer uses an opaque Origin (Fetch standard).
const formOrigin = get.headers.get("referrer-policy") === "no-referrer" ? "null" : origin;
const submitted = await route.POST(request(action, { method: "POST", headers: { origin: formOrigin }, body: fields }));
assert.equal(submitted.status, 303, "native form must confirm with the page's referrer policy");
assert.equal(receivedToken, fields.get("token_hash"));
assert.equal(submitted.headers.get("location"), `${origin}/onboarding/business`);
assert.equal(verifications, 1, "exactly one verification for the submitted form");
const old = await legacy.GET(request("/auth/confirm?token_hash=valid-token&type=email"));
assert.match(old.headers.get("location"), /\/confirm-signup\?/);
assert.equal(verifications, 1);
assert.equal((await post("valid-token", undefined, "https://evil.test")).status, 403);
assert.equal(verifications, 1);
assert.equal(failures.at(-1), "origin_rejected");
assert.equal((await post("valid-null", undefined, "null")).status, 403);
assert.equal(verifications, 1);
for (const [index, next] of ["/onboarding/business", "https://evil.test", "//evil.test", "/confirm-signup", "/\\evil.test"].entries()) {
  const result = await post(`valid-${index}`, next);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), `${origin}/onboarding/business`);
}
assert.equal(cookies.get("sb-test-auth-token"), "test-session");
const repeated = await post("valid-0");
assert.equal(repeated.status, 400);
const repeatedHtml = await repeated.text();
assert.match(repeatedHtml, /inicia sesi/);
assert.doesNotMatch(repeatedHtml, /name="token_hash"|test-session/);
assert.equal((await post("invalid-token")).status, 400);
assert.equal(failures.at(-1), "verifyOtp_error");
assert.equal((await post("")).status, 400);
assert.equal(failures.at(-1), "missing_token");
assert.equal((await post("invalid token")).status, 400);
assert.equal(failures.at(-1), "invalid_request");
const beforeInvalidRequests = verifications;
for (const type of [null, "invite"]) {
  const body = new URLSearchParams({ token_hash: "valid-wrong-type", next: "/onboarding/business" });
  if (type !== null) body.set("type", type);
  const rejected = await route.POST(request(action, { method: "POST", headers: { origin }, body }));
  assert.equal(rejected.status, 400);
  assert.equal(failures.at(-1), "invalid_request");
}
assert.equal(verifications, beforeInvalidRequests, "invalid form type never reaches Supabase");
console.log("PASS GET/legacy GET no consumption; explicit POST; SSR cookie adapter; reuse/expiry/invalid; safe redirects");

// Execute the real SW with an isolated in-memory Cache Storage, never a browser or network.
const listeners = {}, entries = new Map();
let writes = 0, reads = 0, networkFails = false;
let networkResponse = new Response("POS offline shell", { headers: { "content-type": "text/html" } });
const cache = {
  keys: async () => [...entries.keys()].map(url => new Request(url)),
  match: async request => { reads++; return entries.get(request.url)?.clone(); },
  put: async (request, response) => { writes++; entries.set(request.url, response.clone()); },
  delete: async request => entries.delete(request.url),
};
vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
  self: { location: { origin }, addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { claim: async () => {} }, skipWaiting() {} },
  URL, Response,
  caches: { open: async () => cache, match: cache.match },
  fetch: async () => { if (networkFails) throw Error("offline"); return networkResponse.clone(); },
});
async function dispatch(path, method = "GET") {
  const pending = []; let result;
  listeners.fetch({ request: request(path, { method }), respondWith: value => { result = value; }, waitUntil: value => pending.push(value) });
  const response = await result;
  await Promise.all(pending);
  return response;
}
for (const path of ["/confirm-signup", "/confirm-signup/", "/auth/confirm", "/auth/callback?code=secret", "/anything?token_hash=secret", "/anything?type=email", "/anything?access_token=secret"]) {
  assert.equal(await dispatch(path), undefined);
}
assert.equal(await dispatch("/confirm-signup", "POST"), undefined);
assert.equal(reads, 0); assert.equal(writes, 0);
networkResponse = new Response(html, { headers: { "content-type": "text/html" } });
await dispatch("/unexpected-auth-page");
assert.equal(writes, 0);
networkResponse = new Response(null, { status: 303, headers: { location: "/auth/confirm?token_hash=secret" } });
await dispatch("/redirect-auth"); assert.equal(writes, 0);
entries.set(`${origin}/confirm-signup?token_hash=old`, new Response(html));
entries.set(`${origin}/unexpected-auth-page`, new Response(html, { headers: { "content-type": "text/html" } }));
entries.set(`${origin}/brand/macca/pos`, new Response("POS offline shell", { headers: { "content-type": "text/html" } }));
let activation;
listeners.activate({ waitUntil: value => { activation = value; } }); await activation;
assert.deepEqual([...entries.keys()], [`${origin}/brand/macca/pos`]);
networkFails = true;
assert.equal(await (await dispatch("/brand/macca/pos")).text(), "POS offline shell");
networkFails = false;
networkResponse = new Response("fresh POS", { headers: { "content-type": "text/html" } });
assert.equal(await (await dispatch("/brand/macca/pos")).text(), "fresh POS");
assert.equal(writes, 1);
console.log("PASS SW excludes auth GET/POST/query/body/redirect; selective cleanup; POS cache and offline fallback preserved");
