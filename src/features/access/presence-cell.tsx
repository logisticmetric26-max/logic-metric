"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { PRESENCE_HEARTBEAT_MS, resolvePresence, type PresenceState } from "@/lib/presence";

/**
 * §11 · Estado de conexión de un usuario.
 *
 * El cálculo se hace en el CLIENTE contra el reloj del navegador, no en el
 * servidor: «hace 3 minutos» renderizado en el servidor se queda congelado en
 * la página y envejece mal, mostrando como conectado a alguien que se fue hace
 * media hora.
 *
 * El montado inicial pinta el estado neutro y sólo después del primer efecto
 * calcula la hora. Sin eso, el servidor y el navegador producirían textos
 * distintos —cada uno con su reloj— y React avisaría de un desajuste de
 * hidratación en cada fila.
 */
const TONE: Record<PresenceState, { dot: string; text: string }> = {
  ONLINE: { dot: "bg-success-600", text: "text-success-700" },
  RECENT: { dot: "bg-brand-600", text: "text-ink-secondary" },
  AWAY: { dot: "bg-ink-subtle", text: "text-ink-muted" },
  NEVER: { dot: "bg-warning-600", text: "text-warning-700" },
};

export function PresenceCell({
  lastSeenAt,
  lastLoginAt,
}: {
  lastSeenAt: string | null;
  lastLoginAt: string | null;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());

    // La primera lectura se aplaza al siguiente turno del bucle de eventos: fijar
    // el estado en el cuerpo del efecto provocaría un segundo render inmediato
    // de toda la tabla.
    const primera = window.setTimeout(tick, 0);
    // Después se recalcula al ritmo del latido: es la resolución real del dato,
    // y refrescar más a menudo sólo repintaría lo mismo.
    const timer = window.setInterval(tick, PRESENCE_HEARTBEAT_MS);

    return () => {
      window.clearTimeout(primera);
      window.clearInterval(timer);
    };
  }, []);

  if (!now) {
    return <span className="text-[12.5px] text-ink-subtle">—</span>;
  }

  const presence = resolvePresence({ lastSeenAt, lastLoginAt }, now);
  const tone = TONE[presence.state];

  return (
    <span
      className="flex items-center gap-2"
      title={
        lastLoginAt
          ? `Último acceso: ${formatDateTime(lastLoginAt)}`
          : "Este usuario nunca ha iniciado sesión"
      }
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone.dot,
          // El punto sólo late cuando hay alguien de verdad al otro lado
          presence.state === "ONLINE" && "animate-pulse",
        )}
      />
      <span className="min-w-0">
        <span className={cn("block text-[12.5px] font-medium whitespace-nowrap", tone.text)}>{presence.label}</span>
        {presence.detail && (
          <span className="block text-[11px] text-ink-subtle">{presence.detail}</span>
        )}
      </span>
    </span>
  );
}

/**
 * Refresca el listado periódicamente para que la conexión sea real y no una
 * foto del momento en que se abrió la página.
 *
 * `router.refresh()` vuelve a pedir la página al servidor conservando el estado
 * del cliente: no cierra modales abiertos ni pierde lo escrito en un filtro.
 */
export function PresenceAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Con la pestaña oculta no se refresca: gastaría consultas para nadie.
      if (document.visibilityState === "visible") router.refresh();
    }, PRESENCE_HEARTBEAT_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
