import { z } from "zod";
import { isValidRut, normalizeRut } from "@/lib/auth/rut";

/**
 * Validaciones de autenticación (§62).
 *
 * El mismo esquema se usa en el formulario y en la Server Action: el navegador
 * da respuesta inmediata y el servidor no confía en ella.
 */

export const rutField = z
  .string()
  .trim()
  .min(1, "Debe ingresar su RUT.")
  .refine(isValidRut, "El RUT ingresado no es válido.")
  .transform((value) => normalizeRut(value)!);

export const loginSchema = z.object({
  rut: rutField,
  // No se exige complejidad aquí: la política de contraseñas la define Supabase
  // Auth y validarla dos veces sólo produce mensajes contradictorios.
  password: z.string().min(1, "Debe ingresar su contraseña."),
});

export type LoginInput = z.input<typeof loginSchema>;
