/**
 * RUT chileno: normalización, validación y formato.
 *
 * Es la misma lógica que implementa `app.normalize_rut()` en PostgreSQL. Se
 * duplica a propósito: el navegador da retroalimentación inmediata y la base
 * garantiza la integridad aunque alguien evite el formulario (§62).
 */

/** Quita puntos, guiones y espacios; deja mayúsculas. */
export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Calcula el dígito verificador (módulo 11) del cuerpo indicado. */
export function computeCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;

  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

/**
 * Normaliza a la forma canónica `12345678-9` (con `k` en minúscula).
 *
 * Acepta `12.345.678-9`, `12345678-9` y `123456789`.
 * Devuelve `null` si el RUT no es válido, incluido el dígito verificador.
 */
export function normalizeRut(value: string | null | undefined): string | null {
  if (!value) return null;

  const clean = cleanRut(value);
  if (clean.length < 8 || clean.length > 9) return null;

  const body = clean.slice(0, -1);
  const checkDigit = clean.slice(-1);

  if (!/^[0-9]+$/.test(body)) return null;
  if (computeCheckDigit(body) !== checkDigit) return null;

  return `${body}-${checkDigit.toLowerCase()}`;
}

export function isValidRut(value: string | null | undefined): boolean {
  return normalizeRut(value) !== null;
}

/**
 * Formatea para lectura humana: `12.345.678-9`.
 * Si el RUT no es válido devuelve el valor original sin tocar.
 */
export function formatRut(value: string | null | undefined): string {
  const normalized = normalizeRut(value);
  if (!normalized) return value ?? "";

  const [body, checkDigit] = normalized.split("-");
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${grouped}-${checkDigit.toUpperCase()}`;
}

/**
 * Formato progresivo mientras se escribe, sin estorbar al usuario.
 * No valida: sólo agrupa lo que ya se escribió.
 */
export function formatRutInput(value: string): string {
  const clean = cleanRut(value);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean;

  const body = clean.slice(0, -1);
  const checkDigit = clean.slice(-1);
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${grouped}-${checkDigit}`;
}
