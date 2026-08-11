// Minimal service worker - required para maging "installable" ang PWA
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // wala munang caching logic, kailangan lang ng fetch handler
  // para ma-pass yung installability check ni Chrome
});