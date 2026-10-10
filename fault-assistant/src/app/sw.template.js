// Service worker: makes the whole app work with no network.
// scripts/build-assets.mjs replaces __BUILD_ID__ and writes public/sw.js, so every
// build changes the worker bytes and triggers an update on devices.
//
// Strategy: precache every file listed in asset-manifest.json at install time,
// then serve same-origin GET requests cache-first. Navigations fall back to the
// app shell when offline.

const BUILD_ID = "__BUILD_ID__";
const CACHE_NAME = `fault-assistant-${BUILD_ID}`;
const SHELL = "index.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const manifestUrl = new URL("asset-manifest.json", self.registration.scope);
    const manifest = await (await fetch(manifestUrl, { cache: "no-cache" })).json();
    const urls = manifest.files.map((file) => new URL(file, self.registration.scope).href);
    await cache.addAll(urls);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("fault-assistant-") && name !== CACHE_NAME) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "CACHE_READY", buildId: BUILD_ID });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (request.mode === "navigate") {
        const shell = await cache.match(new URL(SHELL, self.registration.scope).href);
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
