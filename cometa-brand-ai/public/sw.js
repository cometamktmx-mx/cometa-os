const CACHE = "cometa-pos-public-v2";
const PUBLIC_ASSETS = new Set(["/manifest.json", "/logo.png"]);
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...PUBLIC_ASSETS])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("cometa-pos-") && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never intercept HTML, RSC, /api/, auth, authenticated images, or navigations.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search || !PUBLIC_ASSETS.has(url.pathname)) return;
  event.respondWith(fetch(request).then(async response => {
    if (response.ok && !response.redirected && !/private|no-store/i.test(response.headers.get("cache-control") || "")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || new Response("Offline", { status: 503 })));
});
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
