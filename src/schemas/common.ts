import { z } from "zod";

/**
 * Validaciones compartidas (§62).
 *
 * Reflejan las mismas restricciones que aplican los CHECK y triggers de
 * PostgreSQL. Se validan en el cliente para dar respuesta inmediata y en el
 * servidor porque el cliente no es de fiar; la base es la última palabra.
 */

export const uuidSchema = z.string().uuid("Identificador inválido.");

/** PPU normalizada: sin separadores y en mayúsculas. */
export const ppuSchema = z
  .string()
  .trim()
  .min(1, "Debe ingresar la PPU.")
  .transform((value) => value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
  .refine((value) => value.length >= 4 && value.length <= 10, "La PPU debe tener entre 4 y 10 caracteres.")
  .refine((value) => /^[A-Z0-9]+$/.test(value), "La PPU sólo admite letras y números.");

export const internalNumberSchema = z
  .string()
  .trim()
  .min(1, "Debe ingresar el número interno.")
  .transform((value) => value.replace(/\s+/g, " ").toUpperCase())
  .refine(
    (value) => /^[A-Z0-9][A-Z0-9 _-]{0,19}$/.test(value),
    "El número interno sólo admite letras, números, espacios, guiones y guion bajo.",
  );

/** Número de guía y OT comparten formato de código operacional. */
export const guideNumberSchema = z
  .string()
  .trim()
  .min(1, "Debe ingresar un número de guía.")
  .transform((value) => value.replace(/\s+/g, " ").toUpperCase())
  .refine((value) => value.length <= 60, "El número de guía es demasiado largo.");

export const workOrderSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.replace(/\s+/g, " ").toUpperCase()))
  .refine(
    (value) => value === null || /^[A-Z0-9][A-Z0-9 _/-]{0,39}$/.test(value),
    "El número de OT sólo admite letras, números, espacios y los signos - _ /",
  );

/** Fecha `yyyy-MM-dd` proveniente de un `<input type="date">`. */
export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Fecha inválida.");

export const optionalDateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))),
    "Fecha inválida.",
  );

/** Texto obligatorio con límite, normalizando espacios. */
export function requiredText(field: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `Debe ingresar ${field}.`)
    .transform((value) => value.replace(/\s+/g, " "))
    .refine((value) => value.length <= max, `${field} es demasiado largo.`);
}

/** Texto opcional que se guarda como NULL cuando queda vacío. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value.replace(/\s+/g, " ")))
    .refine((value) => value === null || value.length <= max, "El texto es demasiado largo.");
}

/** Casilla de un formulario HTML: presente = marcada. */
export const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.null(), z.undefined()])
  .transform((value) => value === "on" || value === "true");

/**
 * Convierte los issues de Zod al mapa `campo → mensaje` que consumen los
 * formularios. Se queda con el primer error de cada campo: mostrar tres
 * mensajes sobre el mismo input sólo confunde.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}
