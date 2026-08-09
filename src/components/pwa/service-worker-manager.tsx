"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Registro del service worker, aviso de nueva versión e instalación (§3).
 *
 * La actualización NO se aplica sola en mitad de una operación: se avisa y el
 * usuario decide cuándo recargar. Un `skipWaiting` automático podría recargar
 * la aplicación mientras alguien está cerrando una revisión.
 */
export function ServiceWorkerManager() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // En desarrollo el service worker interfiere con la recarga en caliente
    if (process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;

        // Ya había una versión esperando al cargar la página
        if (reg.waiting) setWaitingWorker(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // `controller` presente ⇒ es una actualización, no la primera instalación
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(installing);
            }
          });
        });
      })
      .catch((error) => {
        console.error("[pwa] No se pudo registrar el service worker", error);
      });

    // El nuevo worker tomó el control: recargar para usar la versión nueva
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Busca actualizaciones al volver a la pestaña
    const onVisibility = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallDismissed(window.localStorage.getItem("pwa-install-dismissed") === "1");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function applyUpdate() {
    waitingWorker?.postMessage("SKIP_WAITING");
    setWaitingWorker(null);
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  function dismissInstall() {
    window.localStorage.setItem("pwa-install-dismissed", "1");
    setInstallDismissed(true);
  }

  if (waitingWorker) {
    return (
      <Banner
        icon={<RefreshCw className="size-4 shrink-0" aria-hidden />}
        message="Hay una versión nueva disponible."
        action={
          <Button size="sm" variant="secondary" onClick={applyUpdate}>
            Actualizar
          </Button>
        }
      />
    );
  }

  if (installPrompt && !installDismissed) {
    return (
      <Banner
        icon={<Download className="size-4 shrink-0" aria-hidden />}
        message="Instale Logic Metric como aplicación."
        action={
          <>
            <Button size="sm" variant="secondary" onClick={install}>
              Instalar
            </Button>
            <button
              type="button"
              onClick={dismissInstall}
              aria-label="Descartar"
              className="rounded-xs p-1 text-inverse-ink/70 transition-colors hover:text-inverse-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </>
        }
      />
    );
  }

  return null;
}

function Banner({
  icon,
  message,
  action,
}: {
  icon: React.ReactNode;
  message: string;
  action: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="safe-bottom animate-slide-up fixed inset-x-0 bottom-0 z-[70] flex items-center gap-3 bg-inverse px-4 py-3 text-sm text-inverse-ink sm:inset-x-auto sm:right-4 sm:bottom-4 sm:rounded-xl sm:shadow-[var(--shadow-overlay)]"
    >
      {icon}
      <p className="min-w-0 flex-1">{message}</p>
      <div className="flex shrink-0 items-center gap-1">{action}</div>
    </div>
  );
}

/** `beforeinstallprompt` aún no está en los tipos estándar del DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
