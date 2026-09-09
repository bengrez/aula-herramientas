const PREFIX = `atlas-practice:${self.registration.scope}:`;
const CACHE = `${PREFIX}2026-09-09.4-revision`;
const configURL = new URL("../data/practice.json", self.registration.scope);
self.addEventListener("install", event => event.waitUntil((async () => {
  const response = await fetch(configURL, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el manifiesto de práctica");
  const config = await response.json();
  const cache = await caches.open(CACHE);
  await cache.addAll(config.offline_assets.map(path => new Request(new URL(path, configURL), { cache: "reload" })));
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
// Paquete cache-first coherente. Solo recursos declarados: nunca cachea POST, tokens ni RPC.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const url = new URL(event.request.url);
    if (url.pathname === new URL("./", self.registration.scope).pathname) url.pathname += "index.html";
    return await cache.match(url.href, { ignoreSearch: true }) ?? fetch(event.request);
  })());
});
