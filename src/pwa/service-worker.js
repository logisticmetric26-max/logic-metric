/**
 * Service worker de Logic Metric.
 *
 * Plantilla: `scripts/build-service-worker.mjs` la copia a `public/sw.js`
 * sustituyendo __SW_VERSION__ por el identificador del build. Así cada
 * despliegue publica un service worker distinto y el navegador lo detecta.
 *
 * ESTRATEGIA DE CACHÉ (§3)
 * ------------------------
 * El requisito es explícito: los datos operacionales NO pueden quedar
 * desactualizados por una caché agresiva. Por eso:
 *
 *   · Supabase y cualquier origen externo → NUNCA se interceptan.
 *     Las revisiones, la flota y los vencimientos siempre vienen de la red.
 *
 *   · Navegación (documentos HTML) → primero la red; si falla, la página
 *     offline. Nunca se sirve HTML cacheado con datos viejos.
 *
 *   · Recursos estáticos de Next (/_next/static) → primero la caché.
 *     Llevan hash en el nombre: si cambia el contenido, cambia la URL.
 *
 *   · Iconos y manifiesto → primero la caché, refrescando en segundo plano.
 */

const VERSION = "__SW_VERSION__";
const SHELL_CACHE = `logic-metric-shell-${VERSION}`;
const ASSET_CACHE = `logic-metric-assets-${VERSION}`;

const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// -----------------------------------------------------------------------------
// Instalación
// -----------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload` evita precargar desde la caché HTTP del navegador
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      // No se activa solo: espera a que la aplicación lo autorice (ver 'message')
    })(),
  );
});

// -----------------------------------------------------------------------------
// Activación · limpieza de versiones anteriores
// -----------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("logic-metric-") && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );

      // Navegación instantánea en navegadores que lo soportan
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      await self.clients.claim();
    })(),
  );
});

// -----------------------------------------------------------------------------
// Mensajes desde la aplicación
// -----------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  // El usuario aceptó actualizar: el nuevo worker toma el control
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// -----------------------------------------------------------------------------
// Intercepción de peticiones
// -----------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Otro origen (Supabase, API de análisis…): jamás se cachea ni se intercepta
  if (url.origin !== self.location.origin) return;

  // Rutas de datos del propio servidor: siempre red
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

/**
 * Navegación: red primero.
 * Si no hay conexión se muestra la página offline; nunca datos operacionales
 * antiguos presentados como si fueran actuales.
 */
async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;

    return await fetch(event.request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("Sin conexión", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

/** Recursos inmutables con hash en la URL. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Responde al instante desde caché y actualiza en segundo plano. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await network) ?? Response.error();
}
