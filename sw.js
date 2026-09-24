// Service worker — LF Assurance Audit System (PWA)
// Strategia: pliki aplikacji = sieć najpierw (świeży kod po każdym deployu), cache jako fallback offline;
// biblioteki/fonty/ikony = cache najpierw. Zapytania do SharePoint/Graph/logowania/kafli mapy NIE są przechwytywane.
const VERSION = "lfa-v1";
const SHELL = ["/", "/index.html", "/style.css", "/app.js", "/api.js", "/auth.js",
  "/design/tokens/tokens.css", "/design/tokens/app.css", "/design/components.css", "/fonts/lfa/lfa-fonts.css",
  "/leaflet.css", "/leaflet.js", "/msal-browser.min.js", "/xlsx.full.min.js", "/jspdf.umd.min.js", "/jspdf.plugin.autotable.min.js",
  "/favicon.svg", "/favicon-192.png", "/auditcrm-icon-512.png", "/manifest.webmanifest"];
const APP_FILES = new Set(["/", "/index.html", "/style.css", "/app.js", "/api.js", "/auth.js",
  "/design/tokens/tokens.css", "/design/tokens/app.css", "/design/components.css", "/manifest.webmanifest"]);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // SharePoint, Graph, login, OSM — bez ingerencji
  const path = url.pathname;
  const isNav = req.mode === "navigate";
  if (isNav || APP_FILES.has(path)) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(isNav ? "/index.html" : req, copy)); }
      return res;
    }).catch(() => caches.match(isNav ? "/index.html" : req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && (path.startsWith("/fonts/") || /\.(js|css|png|svg|ttf|woff2?)$/.test(path))) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
