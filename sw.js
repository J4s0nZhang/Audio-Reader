// Makes the app open offline. The voice model itself is cached by the speech library.
const VERSION = "reader-v2";
const SHELL = ["./", "index.html", "app.js", "text.js", "worker-core.js", "engines/ort121.js", "diag.html", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("reader-") && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The speech library and its runtime files are versioned on the CDN: cache first.
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION + "-cdn");
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // The app's own files: network first so updates arrive, cache when offline.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html"));
      }
    })());
  }
});
