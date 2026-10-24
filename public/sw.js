/* Somente recursos públicos. Informações clínicas, APIs, imagens e PDFs nunca são armazenados offline. */
const CACHE = "endodelivery-public-v1";
const PUBLIC_ASSETS = ["/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("endodelivery-public-") && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) || fetch(request)));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const fallback = await caches.match("/offline.html");
      return fallback || new Response("Conecte-se à internet para abrir o EndoDelivery.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }));
  }
});
