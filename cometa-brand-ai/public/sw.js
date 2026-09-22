const CACHE = "cometa-pos-shell-v1";
function sensitiveAuthUrl(value) {
  const url = new URL(value, self.location.origin);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/confirm-signup" || path === "/auth" || path.startsWith("/auth/")) return true;
  return /^(email|signup|invite|recovery|magiclink|email_change)$/i.test(url.searchParams.get("type") || "") ||
    [...url.searchParams.keys()].some(key => /^(token_hash|token|access_token|refresh_token|id_token|code|confirmation_url)$/i.test(key));
}

async function sensitiveAuthResponse(response) {
  if (response.url && sensitiveAuthUrl(response.url)) return true;
  const location = response.headers.get("location");
  if (location && sensitiveAuthUrl(location)) return true;
  if (!/text\/html|application\/json/i.test(response.headers.get("content-type") || "")) return false;
  try {
    return /token_hash|(?:access_token|refresh_token|id_token|confirmation_url)["'\s:=]|[?&](?:amp;)?type=(?:email|signup|invite|recovery|magiclink)/i.test(await response.clone().text());
  } catch { return true; }
}

self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/manifest.json", "/logo.png"]))); self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Remove only sensitive entries from our existing cache, never POS offline data.
    const cache = await caches.open(CACHE);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (sensitiveAuthUrl(request.url) || (response && await sensitiveAuthResponse(response))) await cache.delete(request);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin || request.url.includes("/api/") || sensitiveAuthUrl(request.url)) return;
  event.respondWith(fetch(request).then(async (response) => {
    if (await sensitiveAuthResponse(response)) return response;
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    return cached && !await sensitiveAuthResponse(cached) ? cached : new Response("Offline", { status: 503 });
  }));
});
self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
