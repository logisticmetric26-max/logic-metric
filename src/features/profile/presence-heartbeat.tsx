"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence";

/**
 * §11 · Señal de presencia.
 *
 * Marca «sigo aquí» cada dos minutos mientras la pestaña esté VISIBLE. Con la
 * pestaña en segundo plano no se envía nada: una ventana olvidada en un equipo
 * de la oficina mostraría a esa persona conectada toda la noche, y ese dato
 * sería peor que no tener ninguno.
 *
 * No abre ningún socket. La señal es un UPDATE de una fila sobre una tabla sin
 * auditoría; el coste es despreciable y sobrevive a recargas y despliegues,
 * cosa que una conexión en vivo no hace.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const send = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("touch_presence");
    };

    send();
    const timer = window.setInterval(send, PRESENCE_HEARTBEAT_MS);

    // Al volver a la pestaña se marca de inmediato, sin esperar al siguiente
    // ciclo: quien regresa debe verse conectado ya.
    document.addEventListener("visibilitychange", send);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, []);

  return null;
}
