// Hygieia service worker: caches the app shell, the triage screen, and the
// offline data bundle (triage trees, profiles, snapshots).
// Registered in production builds only (see components/shell/app-shell.tsx).
const VERSION = "hygieia-v2";
const SHELL = ["/", "/triage", "/space-weather", "/kb", "/sources", "/about", "/offline-data.json", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    for (const url of SHELL) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        await cache.put(url, res.clone());
        if ((res.headers.get("content-type") || "").includes("text/html")) {
          // Cache the scripts, styles and fonts the page needs, so it can start offline.
          const html = await res.text();
          const assets = [...new Set(html.match(/\/_next\/static\/[^"'\ )<>]+/g) || [])];
          await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
        }
      } catch (_) { /* keep installing with what we have */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Live endpoints are never cached: the delayed link, chat, incidents.
  if (url.pathname.startsWith("/api/")) return;
  // Page-data requests made by the router are never answered from the cache:
  // a cached HTML page is not a valid answer to them.
  const isRouterData = url.searchParams.has("_rsc") || req.headers.get("rsc") === "1";

  // Network first for everything, scripts included. A script cached from an
  // older build would call server actions that no longer exist, and the page
  // would fail as soon as a control (such as the mission-day buttons) is used.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res.ok && !isRouterData) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (isRouterData) throw err;
      const hit = (await cache.match(req)) || (await cache.match(url.pathname)) || (req.mode === "navigate" ? await cache.match("/triage") : undefined);
      if (hit) return hit;
      throw err;
    }
  })());
});
