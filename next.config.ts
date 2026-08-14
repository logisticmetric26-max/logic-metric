import type { NextConfig } from "next";

/**
 * Política de seguridad de contenido (CSP).
 *
 * Es la última línea si algo lograra inyectar código: aunque un atacante metiera
 * un script en la página, el navegador se niega a cargar recursos o a enviar
 * datos a cualquier destino que no esté en esta lista.
 *
 * DESTINOS PERMITIDOS
 *   · `'self'`                         · la propia aplicación
 *   · Supabase (host del proyecto)     · datos, auth y storage de avatares
 *   · api.open-meteo.com               · pronóstico del clima en Lavado
 *
 * `'unsafe-inline'` en scripts es deliberado y acotado: Next.js inserta scripts
 * en línea para hidratar y transmitir la página, y la alternativa —un nonce por
 * petición— exige un middleware frágil que, mal hecho, deja la app en blanco. La
 * CSP sigue bloqueando lo que de verdad importa: scripts de OTROS dominios,
 * incrustar la app en un iframe ajeno (clickjacking), reescribir la etiqueta
 * base y secuestrar formularios hacia un servidor externo.
 *
 * El host de Supabase se lee del entorno; sin él se cae a `*.supabase.co`, que
 * cubre cualquier proyecto sin abrir la puerta a otros dominios.
 */
function buildContentSecurityPolicy(): string {
  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
    } catch {
      return "https://*.supabase.co";
    }
  })();

  const supabaseWs = supabaseHost.replace(/^https:/, "wss:");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + supabaseHost,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseHost} ${supabaseWs} https://api.open-meteo.com`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  /**
   * Dependencias del análisis documental que corren en el runtime de Node y no
   * deben empaquetarse:
   *
   *   pdfjs-dist      · carga dinámicamente fuentes y worker
   *   tesseract.js    · carga módulos WASM y su worker en tiempo de ejecución
   *   @napi-rs/canvas · binario nativo
   *
   * Empaquetarlas hace que el bundler reescriba esas cargas y el OCR falle en
   * producción aunque funcione en desarrollo.
   */
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "@napi-rs/canvas", "exceljs"],

  async headers() {
    return [
      {
        // El service worker debe revalidarse siempre: si el navegador lo
        // sirviera desde caché, una versión nueva podría no detectarse nunca.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Fuerza HTTPS durante dos años, incluidos subdominios. Impide que un
          // atacante en la red degrade la conexión a HTTP para leer la sesión.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Niega de raíz cámara, micrófono y geolocalización: esta aplicación
          // no los usa, y declararlo cierra un vector aunque un script lo pida.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
