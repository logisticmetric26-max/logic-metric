import { TZDate } from "@date-fns/tz";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { DEFAULT_TIME_ZONE } from "@/lib/format";

/**
 * §17 · Agregación de cada subsección de Revisión Técnica.
 *
 * El Resumen es el tablero de las subsecciones, no un panel aparte: cada bloque
 * resume exactamente la tabla que se abre al hacer clic en él. Por eso las
 * cifras salen de las mismas vistas que alimentan esos listados, y no de
 * consultas paralelas que podrían discrepar.
 *
 * Módulo PURO (sin `server-only` ni Supabase): lo comparten el tablero, la
 * exportación y los tests. La obtención de datos vive en `analytics.ts`.
 */

// -----------------------------------------------------------------------------
// En revisión · antigüedad de los buses que están en planta
// -----------------------------------------------------------------------------

export interface OpenReviewRecord {
  id: string;
  internal_number: string;
  ppu: string;
  terminal_name: string;
  departure_at: string;
}

export interface AgingBucket {
  key: string;
  label: string;
  count: number;
}

export interface OpenReviewEntry {
  internal_number: string;
  ppu: string;
  terminal_name: string;
  days: number;
}

export interface OpenReviewsAnalytics {
  total: number;
  buckets: AgingBucket[];
  /** Los que llevan más tiempo fuera: son los que hay que ir a buscar. */
  longest: OpenReviewEntry[];
}

/** Días completos transcurridos desde la salida. */
function daysSince(departureAt: string, now: Date): number {
  const elapsed = now.getTime() - parseISO(departureAt).getTime();
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

/**
 * Reparte los buses en planta por tiempo fuera.
 *
 * Un contador único («12 en revisión») no distingue entre doce buses que
 * salieron esta mañana y doce que llevan una semana sin volver, que es
 * justamente la diferencia que importa.
 */
export function aggregateOpenReviews(
  records: OpenReviewRecord[],
  now: Date = new Date(),
): OpenReviewsAnalytics {
  const definitions = [
    { key: "TODAY", label: "Hoy", test: (days: number) => days === 0 },
    { key: "D1_2", label: "1 a 2 días", test: (days: number) => days >= 1 && days <= 2 },
    { key: "D3_7", label: "3 a 7 días", test: (days: number) => days >= 3 && days <= 7 },
    { key: "OVER_7", label: "Más de 7 días", test: (days: number) => days > 7 },
  ];

  const counts = new Map(definitions.map((definition) => [definition.key, 0]));
  const entries: OpenReviewEntry[] = [];

  for (const record of records) {
    const days = daysSince(record.departure_at, now);
    const bucket = definitions.find((definition) => definition.test(days));
    if (bucket) counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);

    entries.push({
      internal_number: record.internal_number,
      ppu: record.ppu,
      terminal_name: record.terminal_name,
      days,
    });
  }

  return {
    total: records.length,
    buckets: definitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      count: counts.get(definition.key) ?? 0,
    })),
    longest: entries
      .sort((a, b) => b.days - a.days || a.internal_number.localeCompare(b.internal_number, "es"))
      .slice(0, 5),
  };
}

// -----------------------------------------------------------------------------
// No enviados · motivos por los que el bus no salió
// -----------------------------------------------------------------------------

export interface NotSentRecord {
  reason: string;
  event_date: string;
  internal_number: string;
  ppu: string;
}

export interface NotSentAnalytics {
  total: number;
  byReason: { label: string; count: number }[];
  /** Buses con más días sin ser enviados en el período. */
  byBus: { internal_number: string; ppu: string; count: number }[];
}

/**
 * Clave de agrupación de un motivo escrito a mano.
 *
 * El motivo es texto libre: «Sin chofer», «sin chofer.» y «SIN  CHOFER» son el
 * mismo hecho operacional y deben contarse juntos. Se normalizan acentos,
 * mayúsculas, espacios y puntuación final; la etiqueta que se muestra es el
 * primer texto tal como lo escribió el usuario.
 */
export function notSentReasonKey(reason: string): string {
  return reason
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function aggregateNotSent(records: NotSentRecord[]): NotSentAnalytics {
  const reasons = new Map<string, { label: string; count: number }>();
  const buses = new Map<string, { internal_number: string; ppu: string; count: number }>();

  for (const record of records) {
    const key = notSentReasonKey(record.reason);
    if (key.length > 0) {
      const reason = reasons.get(key);
      if (reason) reason.count += 1;
      else reasons.set(key, { label: record.reason.trim(), count: 1 });
    }

    const bus = buses.get(record.ppu);
    if (bus) bus.count += 1;
    else
      buses.set(record.ppu, {
        internal_number: record.internal_number,
        ppu: record.ppu,
        count: 1,
      });
  }

  return {
    total: records.length,
    byReason: [...reasons.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"),
    ),
    byBus: [...buses.values()].sort(
      (a, b) => b.count - a.count || a.internal_number.localeCompare(b.internal_number, "es"),
    ),
  };
}

// -----------------------------------------------------------------------------
// Vencimientos · estado actual de la flota
// -----------------------------------------------------------------------------

export type ExpirationStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NO_RECORD";

export interface ExpirationRecord {
  internal_number: string;
  ppu: string;
  terminal_name: string;
  expiration_status: ExpirationStatus;
  expiration_date: string | null;
  days_to_expiration: number | null;
}

export interface ExpirationAnalytics {
  /** Buses activos considerados. */
  total: number;
  byStatus: { key: ExpirationStatus; label: string; count: number }[];
  /** Vencidos primero y luego los más próximos: el orden de atención real. */
  attention: {
    internal_number: string;
    ppu: string;
    terminal_name: string;
    expiration_date: string | null;
    days_to_expiration: number | null;
    expiration_status: ExpirationStatus;
  }[];
}

const EXPIRATION_LABEL: Record<ExpirationStatus, string> = {
  VALID: "Vigente",
  EXPIRING_SOON: "Por vencer",
  EXPIRED: "Vencido",
  NO_RECORD: "Sin registro",
};

export function aggregateExpirations(records: ExpirationRecord[]): ExpirationAnalytics {
  const order: ExpirationStatus[] = ["VALID", "EXPIRING_SOON", "EXPIRED", "NO_RECORD"];
  const counts = new Map<ExpirationStatus, number>(order.map((status) => [status, 0]));

  for (const record of records) {
    if (counts.has(record.expiration_status)) {
      counts.set(record.expiration_status, (counts.get(record.expiration_status) ?? 0) + 1);
    }
  }

  // `NO_RECORD` no tiene fecha: se ordena al final, pero se muestra porque un
  // bus sin ninguna revisión aprobada también está fuera de norma.
  const attentionOrder: Record<ExpirationStatus, number> = {
    EXPIRED: 0,
    EXPIRING_SOON: 1,
    NO_RECORD: 2,
    VALID: 3,
  };

  return {
    total: records.length,
    byStatus: order.map((status) => ({
      key: status,
      label: EXPIRATION_LABEL[status],
      count: counts.get(status) ?? 0,
    })),
    attention: records
      .filter((record) => record.expiration_status !== "VALID")
      .sort(
        (a, b) =>
          attentionOrder[a.expiration_status] - attentionOrder[b.expiration_status] ||
          (a.days_to_expiration ?? Number.MAX_SAFE_INTEGER) -
            (b.days_to_expiration ?? Number.MAX_SAFE_INTEGER) ||
          a.internal_number.localeCompare(b.internal_number, "es"),
      )
      .slice(0, 5)
      .map((record) => ({
        internal_number: record.internal_number,
        ppu: record.ppu,
        terminal_name: record.terminal_name,
        expiration_date: record.expiration_date,
        days_to_expiration: record.days_to_expiration,
        expiration_status: record.expiration_status,
      })),
  };
}

// -----------------------------------------------------------------------------
// Historial · resultados cerrados mes a mes
// -----------------------------------------------------------------------------

export interface ClosedEventRecord {
  return_at: string | null;
  result: "APPROVED" | "REJECTED" | null;
}

export interface MonthlyPoint {
  /** `yyyy-MM`, para ordenar sin ambigüedad. */
  month: string;
  /** `ago 26`, para el eje. */
  label: string;
  approved: number;
  rejected: number;
}

export interface HistoryAnalytics {
  months: MonthlyPoint[];
  approved: number;
  rejected: number;
  /** Porcentaje de rechazo sobre las cerradas, o `null` si no hay cerradas. */
  rejectionRate: number | null;
}

/**
 * Serie mensual de revisiones cerradas.
 *
 * El mes se calcula en la zona operacional: una revisión cerrada a las 22:00 de
 * un 31 pertenece a ese mes en Chile, aunque en UTC ya sea el día 1 siguiente.
 *
 * Sólo se devuelven los meses que existen en los datos —no se rellenan huecos
 * con ceros inventados— y como mucho los `maxMonths` más recientes.
 */
export function aggregateHistory(
  records: ClosedEventRecord[],
  { maxMonths = 6, timeZone = DEFAULT_TIME_ZONE }: { maxMonths?: number; timeZone?: string } = {},
): HistoryAnalytics {
  const months = new Map<string, MonthlyPoint>();
  let approved = 0;
  let rejected = 0;

  for (const record of records) {
    if (!record.return_at || !record.result) continue;

    const zoned = new TZDate(parseISO(record.return_at), timeZone);
    const key = format(zoned, "yyyy-MM");

    const point =
      months.get(key) ??
      ({
        month: key,
        label: format(zoned, "MMM yy", { locale: es }).replace(".", ""),
        approved: 0,
        rejected: 0,
      } satisfies MonthlyPoint);

    if (record.result === "APPROVED") {
      point.approved += 1;
      approved += 1;
    } else {
      point.rejected += 1;
      rejected += 1;
    }

    months.set(key, point);
  }

  const closed = approved + rejected;

  return {
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-maxMonths),
    approved,
    rejected,
    rejectionRate: closed === 0 ? null : Math.round((rejected / closed) * 100),
  };
}
