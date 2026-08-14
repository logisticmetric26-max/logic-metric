import { z } from "zod";
import { isValidTimeText } from "@/lib/utils";
import { dateSchema, requiredText, uuidSchema } from "@/schemas/common";

const timeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Debe ingresar la hora.")
  .refine((value) => isValidTimeText(value), "La hora ingresada no es valida.");

const litersSchema = z
  .string()
  .trim()
  .min(1, "Debe ingresar los litros.")
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => Number.isFinite(value), "Los litros ingresados no son validos.")
  .refine((value) => value > 0, "Los litros deben ser mayores que cero.")
  .refine((value) => value <= 99999.99, "La cantidad de litros es demasiado grande.");

export const badFuelLoadSchema = z.object({
  bus_reference: requiredText("la PPU o numero interno del bus", 20).transform((value) =>
    value.toUpperCase(),
  ),
  dispenser_id: uuidSchema,
  load_date: dateSchema,
  load_time: timeSchema,
  liters: litersSchema,
});

export const badFuelLoadUpdateSchema = badFuelLoadSchema.extend({
  id: uuidSchema,
});

export const badFuelLoadExportSchema = z.object({
  q: z.string().trim().max(120).optional().or(z.literal("")),
  desde: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  hasta: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  hora_desde: z.string().trim().refine((value) => value === "" || isValidTimeText(value)).optional().or(z.literal("")),
  hora_hasta: z.string().trim().refine((value) => value === "" || isValidTimeText(value)).optional().or(z.literal("")),
  surtidor: uuidSchema.optional().or(z.literal("")),
});

export type BadFuelLoadExportInput = z.infer<typeof badFuelLoadExportSchema>;
