// Earlier versions of this site installed an offline cache. This version removes it.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("reader-")) await caches.delete(k);
  await self.registration.unregister();
})()));
