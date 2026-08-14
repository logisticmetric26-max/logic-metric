import type { NotificationRow } from "@/types/database.types";

/**
 * Metadatos de presentación por tipo de aviso.
 *
 * Vive aparte del componente y sin JSX para que sea puro y verificable: el tono
 * y la etiqueta de cada tipo se prueban sin renderizar nada, y añadir un aviso
 * nuevo es una línea aquí.
 */
export type NotificationTone = "brand" | "success" | "danger" | "warning" | "info";

interface KindMeta {
  /** Nombre del icono de lucide-react; el componente lo resuelve. */
  icon: string;
  tone: NotificationTone;
  label: string;
}

const KINDS: Record<string, KindMeta> = {
  REVIEW_OPEN: { icon: "LogOut", tone: "info", label: "Salida a planta" },
  REVIEW_CLOSE: { icon: "ClipboardCheck", tone: "success", label: "Revisión cerrada" },
  NOT_SENT: { icon: "Ban", tone: "warning", label: "No enviado" },
  RAIN_DAY: { icon: "CloudRain", tone: "info", label: "Día de lluvia" },
  BAD_LOAD: { icon: "Droplets", tone: "danger", label: "Mala carga" },
};

const FALLBACK: KindMeta = { icon: "Bell", tone: "brand", label: "Aviso" };

export function notificationMeta(kind: string): KindMeta {
  return KINDS[kind] ?? FALLBACK;
}

/**
 * Cuántos avisos son posteriores a la última vez que se abrió el panel.
 *
 * El estado «leído» no se guarda por usuario en la base —sería una escritura por
 * persona y por aviso, y con mucha gente conectada eso es ruido—: se compara la
 * fecha del aviso con una marca local. Simple y suficiente para un contador.
 */
export function countUnread(items: NotificationRow[], lastSeenIso: string | null): number {
  if (!lastSeenIso) return items.length;
  const lastSeen = Date.parse(lastSeenIso);
  if (Number.isNaN(lastSeen)) return items.length;

  return items.filter((item) => Date.parse(item.created_at) > lastSeen).length;
}

/** Inserta un aviso nuevo al frente evitando duplicados y recorta la lista. */
export function mergeNotification(
  items: NotificationRow[],
  incoming: NotificationRow,
  max = 40,
): NotificationRow[] {
  if (items.some((item) => item.id === incoming.id)) return items;
  return [incoming, ...items].slice(0, max);
}
