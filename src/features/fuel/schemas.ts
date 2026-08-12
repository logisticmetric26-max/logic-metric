import { z } from "zod";
import { dateSchema, optionalText, requiredText, uuidSchema } from "@/schemas/common";

export const fuelProductSchema = z.enum(["FUEL", "ADBLUE"], {
  message: "Debe seleccionar el tipo de carga.",
});

export const fuelWindowSchema = z.enum(["AM", "PM"], {
  message: "Debe seleccionar la ventana de recepcion.",
});

export const requestedQuantitySchema = z
  .string()
  .trim()
  .min(1, "Debe ingresar la cantidad solicitada.")
  .transform((value) => Number(value.replace(",", ".")))
  .refine((value) => Number.isFinite(value), "La cantidad solicitada no es valida.")
  .refine((value) => value > 0, "La cantidad solicitada debe ser mayor que cero.")
  .refine((value) => value <= 999.99, "La cantidad solicitada es demasiado grande.");

export const fuelDeliverySchema = z.object({
  terminal_id: uuidSchema,
  request_reference: requiredText("el ID de solicitud", 40),
  delivery_address: requiredText("la direccion", 240),
  product_type: fuelProductSchema,
  product_label: requiredText("el detalle del producto", 120),
  scheduled_date: dateSchema,
  reception_window: fuelWindowSchema,
  reception_time_range: requiredText("el horario de recepcion", 40),
  supplier_name: requiredText("la razon social", 120),
  requested_quantity_m3: requestedQuantitySchema,
  truck_reference: optionalText(120),
  notes: optionalText(500),
});

export const fuelDeliveryUpdateSchema = fuelDeliverySchema.extend({
  id: uuidSchema,
});

export const fuelDeliveryConfirmSchema = z.object({
  id: uuidSchema,
});

export type FuelDeliveryInput = z.infer<typeof fuelDeliverySchema>;
