const CACHE_PREFIX = "diagnostic-shell";
const CACHE_VERSION = "v1-2026-07-31.23";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;

function offlineUrlsFromActive(active, activeUrl) {
  if (!Array.isArray(active?.offline_assets)) throw new Error("El manifiesto offline no es válido");
  return [...new Set([activeUrl.href, ...active.offline_assets.map((path) => new URL(path, activeUrl).href)])];
}

async function cacheOfflineUrls(cache, urls) {
  await cache.addAll(urls.map((url) => new Request(url, { cache: "reload" })));
}

async function discoverOfflineUrls() {
  const scopeUrl = new URL(self.registration.scope);
  const activeUrl = new URL("data/active.json", scopeUrl);
  const response = await fetch(activeUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo preparar el modo offline (${response.status})`);
  const active = await response.json();
  return offlineUrlsFromActive(active, activeUrl);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = await discoverOfflineUrls();
    await cacheOfflineUrls(cache, urls);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function refreshActiveManifest(cache, request, response) {
  const currentText = await response.clone().text();
  const previous = await cache.match(request, { ignoreSearch: true });
  const previousText = previous ? await previous.text() : null;
  if (previousText !== currentText) {
    const active = JSON.parse(currentText);
    await cacheOfflineUrls(cache, offlineUrlsFromActive(active, new URL(request.url)));
  }
  await cache.put(request, response.clone());
}

async function networkFirst(request, fallbackUrl, { refreshActive = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && refreshActive) {
      try {
        await refreshActiveManifest(cache, request, response);
      } catch (error) {
        console.error("No se pudo completar la nueva versión offline", error);
        return new Response("La nueva versión no está completa para uso offline", { status: 503, statusText: "Offline bundle incomplete" });
      }
    } else if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (fallbackUrl ? await cache.match(fallbackUrl) : undefined) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, new URL("index.html", scope).href));
  } else if (url.pathname.endsWith("/data/active.json")) {
    event.respondWith(networkFirst(request, undefined, { refreshActive: true }));
  } else {
    event.respondWith(networkFirst(request));
  }
});
