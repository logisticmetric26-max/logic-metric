import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une clases de Tailwind resolviendo conflictos (la última gana). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Construye un querystring omitiendo valores vacíos. */
export function buildSearchParams(
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  return search.toString();
}

/**
 * Escapa los comodines de PostgREST para búsquedas `ilike`.
 * Sin esto, escribir `%` en el buscador devolvería todo.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

const TIME_TEXT_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function normalizeTimeText(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidTimeText(value: string): boolean {
  return TIME_TEXT_PATTERN.test(value.trim());
}

/** Lee un entero de los parámetros de URL con límites seguros. */
export function parsePageParam(value: string | undefined, fallback = 1): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 10_000);
}
