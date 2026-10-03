const CACHE = "orbit-shell-v5",
  FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./engine.js",
    "./renderer.js",
    "./storage.js",
    "./audio.js",
    "./sharing.js",
    "./i18n.js",
    "./icons.js",
    "./spin.js",
    "./history.js",
  "./large-data.js",
  "./data-import.js",
  "./import-worker.js",
    "./favicon.svg",
    "./manifest.webmanifest",
  ];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k.startsWith("orbit-shell-"))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          void caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (c) =>
              c ||
              new Response("Offline resource unavailable", { status: 503 }),
          ),
      ),
  );
});

