import { TZDate } from "@date-fns/tz";
import { differenceInMinutes, format, parseISO } from "date-fns";

/**
 * Formato de fechas y horas.
 *
 * Los timestamps se guardan en UTC (`timestamptz`) y se presentan en la zona
 * operacional (§73). La zona la define `app_settings.general.timezone`; el
 * valor por defecto es el mismo que usa la base.
 */
export const DEFAULT_TIME_ZONE = "America/Santiago";

function toZoned(value: string | Date, timeZone: string): TZDate {
  const date = typeof value === "string" ? parseISO(value) : value;
  return new TZDate(date, timeZone);
}

/** `08-08-2026` */
export function formatDate(
  value: string | Date | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (!value) return "—";
  return format(toZoned(value, timeZone), "dd-MM-yyyy");
}

/** `08-08-2026 14:35` */
export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (!value) return "—";
  return format(toZoned(value, timeZone), "dd-MM-yyyy HH:mm");
}

/**
 * Fecha `yyyy-MM-dd` (columnas DATE de PostgreSQL).
 *
 * Se parsea a mano en lugar de con `new Date("2026-08-08")`, que interpreta la
 * cadena como UTC y puede mostrar el día anterior en Chile.
 */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

/** Fecha de hoy en la zona operacional, como `yyyy-MM-dd`. */
export function todayInZone(timeZone: string = DEFAULT_TIME_ZONE): string {
  return format(new TZDate(new Date(), timeZone), "yyyy-MM-dd");
}

/**
 * Tiempo transcurrido desde la salida (§20).
 * Se calcula sobre la marca real, así que el valor es correcto aunque la
 * pestaña lleve horas abierta.
 */
export function formatElapsed(from: string | Date, to: Date = new Date()): string {
  const start = typeof from === "string" ? parseISO(from) : from;
  const totalMinutes = Math.max(0, differenceInMinutes(to, start));

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** `1,4 MB` */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** `12.345` */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CL").format(value);
}

/** PPU con separación legible cuando tiene formato de patente moderna. */
export function formatPpu(ppu: string): string {
  return ppu.toUpperCase();
}
