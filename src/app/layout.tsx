import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerManager } from "@/components/pwa/service-worker-manager";

export const metadata: Metadata = {
  title: {
    default: "Logic Metric",
    template: "%s · Logic Metric",
  },
  description: "Plataforma de administración operacional de flota.",
  applicationName: "Logic Metric",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // Permite la instalación en iPhone/iPad en modo pantalla completa
    capable: true,
    statusBarStyle: "default",
    title: "Logic Metric",
  },
  formatDetection: {
    // Evita que iOS convierta números internos y PPU en enlaces telefónicos
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Es una herramienta interna: no debe aparecer en buscadores
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin `maximumScale`: bloquear el zoom rompe la accesibilidad
  viewportFit: "cover",
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
