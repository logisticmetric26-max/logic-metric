import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "@napi-rs/canvas"],

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
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
