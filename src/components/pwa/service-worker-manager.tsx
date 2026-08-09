"use client";

import { useEffect } from "react";

/**
 * Registro del service worker (§3).
 *
 * No muestra nada. Un aviso flotante sobre la interfaz interrumpe el trabajo y
 * obliga a decidir sobre algo que al operador no le incumbe: qué versión del
 * programa tiene cargada.
 *
 * La actualización tampoco se fuerza. El worker nuevo queda en espera y toma el
 * control por sí solo la próxima vez que se abre la aplicación, que es cuando
 * nadie está a mitad de una operación. Recargar la página en caliente podría
 * hacerlo mientras alguien cierra una revisión o rellena un formulario, y ese
 * riesgo no compensa adelantar una actualización unas horas.
 */
export function ServiceWorkerManager() {
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
      })
      .catch((error) => {
        console.error("[pwa] No se pudo registrar el service worker", error);
      });

    // Comprueba si hay versión nueva al volver a la pestaña: así queda
    // descargada y lista para activarse en el siguiente arranque.
    const onVisibility = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
