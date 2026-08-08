/**
 * Manifiesto de la PWA (§3).
 *
 * Se sirve desde un Route Handler para conservar la extensión `.webmanifest`
 * exacta y controlar las cabeceras de caché.
 *
 * `display: standalone` es lo que hace que la aplicación se abra en su propia
 * ventana —sin barra de direcciones— tanto en escritorio como en móvil.
 */
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/",
    name: "Logic Metric",
    short_name: "Logic Metric",
    description: "Plataforma de administración operacional de flota.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f4f6f8",
    theme_color: "#1d4ed8",
    lang: "es-CL",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        // Android recorta el icono: `maskable` reserva la zona segura
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Revisión Técnica",
        url: "/revision-tecnica",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
