/**
 * Estado de conexión de un usuario (§11).
 *
 * Se deriva de dos marcas de tiempo, no de un socket abierto:
 *
 *   `last_seen_at`  · última señal de una pestaña abierta (cada 2 minutos)
 *   `last_login_at` · último inicio de sesión correcto
 *
 * Un socket diría quién tiene la página abierta EN ESTE INSTANTE, pero se
 * pierde al recargar, no sobrevive a un despliegue y no puede responder «nunca
 * se ha conectado», que es justo lo que hay que ver para detectar una cuenta
 * entregada y jamás usada.
 *
 * La ventana de conexión es 3 veces el intervalo de latido: tolera que se
 * pierda una señal por un cambio de red sin declarar desconectado a alguien
 * que sigue trabajando.
 */

/** Cada cuánto envía señal una pestaña abierta. */
export const PRESENCE_HEARTBEAT_MS = 120_000;

/** Margen para considerar a alguien conectado. */
export const PRESENCE_ONLINE_MS = PRESENCE_HEARTBEAT_MS * 3;

export type PresenceState = "ONLINE" | "RECENT" | "AWAY" | "NEVER";

export interface Presence {
  state: PresenceState;
  label: string;
  /** Detalle para el segundo renglón; `null` cuando el rótulo ya lo dice todo. */
  detail: string | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `hace 5 minutos`, `hace 3 horas`, `hace 12 días`. */
export function timeAgo(from: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - from.getTime());

  if (elapsed < MINUTE) return "hace un momento";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.floor(days / 365);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

export function resolvePresence(
  {
    lastSeenAt,
    lastLoginAt,
  }: { lastSeenAt: string | null | undefined; lastLoginAt: string | null | undefined },
  now: Date = new Date(),
): Presence {
  // Nunca se ha conectado: la cuenta existe pero jamás se ha usado. Es un dato
  // operativo, no un detalle: significa que alguien tiene acceso sin saberlo.
  if (!lastLoginAt && !lastSeenAt) {
    return { state: "NEVER", label: "Nunca se ha conectado", detail: null };
  }

  const seen = lastSeenAt ? new Date(lastSeenAt) : null;
  const login = lastLoginAt ? new Date(lastLoginAt) : null;

  if (seen && now.getTime() - seen.getTime() <= PRESENCE_ONLINE_MS) {
    return { state: "ONLINE", label: "Conectado", detail: "Ahora mismo" };
  }

  const reference = seen ?? login;
  if (!reference) {
    return { state: "NEVER", label: "Nunca se ha conectado", detail: null };
  }

  const elapsed = now.getTime() - reference.getTime();
  const relative = timeAgo(reference, now);

  if (elapsed <= DAY) {
    return { state: "RECENT", label: "Hace poco", detail: relative };
  }

  return { state: "AWAY", label: "Desconectado", detail: relative };
}
