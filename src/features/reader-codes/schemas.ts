import { z } from "zod";
import {
  checkboxSchema,
  internalNumberSchema,
  optionalText,
  ppuSchema,
  requiredText,
  uuidSchema,
} from "@/schemas/common";

const codePattern = /^[A-Z0-9][A-Z0-9 _-]{0,39}$/;

export const readerCodeSchema = z.object({
  ppu: ppuSchema,
  internal_number: internalNumberSchema,
  reader_code: requiredText("el codigo lector", 40)
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => codePattern.test(value),
      "El codigo lector solo admite letras, numeros, espacios, guion y guion bajo.",
    ),
  reader_type: optionalText(40)
    .transform((value) => value?.toUpperCase() ?? null)
    .refine(
      (value) => value === null || codePattern.test(value),
      "El tipo solo admite letras, numeros, espacios, guion y guion bajo.",
    ),
  active: checkboxSchema,
});

export const readerCodeUpdateSchema = readerCodeSchema.extend({ id: uuidSchema });
