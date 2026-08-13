import { z } from "zod";
import { checkboxSchema, requiredText, uuidSchema } from "@/schemas/common";
import { isValidRut, normalizeRut } from "@/lib/auth/rut";

const dispenserRutField = z
  .string()
  .trim()
  .min(1, "Debe ingresar el RUT.")
  .refine(isValidRut, "El RUT ingresado no es valido.")
  .transform((value) => normalizeRut(value)!);

export const dispenserSchema = z.object({
  code: requiredText("el codigo del surtidor", 30)
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => /^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(value),
      "El codigo solo admite letras, numeros, guion y guion bajo.",
    ),
  planner_rut: dispenserRutField,
  supervisor_rut: dispenserRutField,
  active: checkboxSchema,
});

export const dispenserUpdateSchema = dispenserSchema.extend({ id: uuidSchema });
