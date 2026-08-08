import { z } from "zod";
import { checkboxSchema, optionalText, requiredText, uuidSchema } from "@/schemas/common";

export const terminalSchema = z.object({
  name: requiredText("el nombre del terminal", 120),
  code: optionalText(30).refine(
    (value) => value === null || /^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/.test(value),
    "El código sólo admite letras, números, espacios, guiones y guion bajo.",
  ),
  active: checkboxSchema,
});

export const terminalUpdateSchema = terminalSchema.extend({ id: uuidSchema });

export type TerminalInput = z.infer<typeof terminalSchema>;
