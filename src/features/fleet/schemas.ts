import { z } from "zod";
import {
  checkboxSchema,
  internalNumberSchema,
  optionalText,
  ppuSchema,
  uuidSchema,
} from "@/schemas/common";

/**
 * §14 · Flota.
 *
 * `fuel_type` se valida contra el catálogo `fleet_fuel_types`, no contra una
 * lista fija: agregar un tipo nuevo no exige tocar este archivo.
 */
export const fleetSchema = z.object({
  internal_number: internalNumberSchema,
  ppu: ppuSchema,
  model: optionalText(120),
  subclass: optionalText(120),
  fuel_type: z.string().trim().min(1, "Debe seleccionar el tipo de bus."),
  terminal_id: uuidSchema.describe("Debe seleccionar el terminal."),
  active: checkboxSchema,
});

export const fleetUpdateSchema = fleetSchema.extend({ id: uuidSchema });

export type FleetInput = z.infer<typeof fleetSchema>;
