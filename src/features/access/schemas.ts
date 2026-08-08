import { z } from "zod";
import { checkboxSchema, optionalText, requiredText, uuidSchema } from "@/schemas/common";
import { rutField } from "@/features/auth/schemas";

/**
 * §8, §11 · Usuarios, roles y permisos.
 *
 * La longitud mínima de contraseña es una decisión técnica de la plataforma;
 * Supabase Auth aplica además su propia política del proyecto.
 */
export const PASSWORD_MIN_LENGTH = 8;

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(72, "La contraseña es demasiado larga.");

/** Lista de UUID enviada como campos repetidos del formulario. */
const uuidListSchema = z
  .array(z.string())
  .transform((values) => Array.from(new Set(values.filter(Boolean))))
  .pipe(z.array(uuidSchema));

export const createUserSchema = z.object({
  rut: rutField,
  full_name: requiredText("el nombre", 160),
  job_title: requiredText("el cargo", 120),
  primary_terminal_id: uuidSchema,
  role_id: uuidSchema,
  password: passwordSchema,
  has_global_access: checkboxSchema,
  additional_terminals: uuidListSchema,
});

/**
 * El RUT no aparece: es inmutable una vez creado el usuario, porque de él se
 * deriva la credencial de Supabase Auth (§7).
 */
export const updateUserSchema = z.object({
  id: uuidSchema,
  full_name: requiredText("el nombre", 160),
  job_title: requiredText("el cargo", 120),
  primary_terminal_id: uuidSchema,
  role_id: uuidSchema,
  has_global_access: checkboxSchema,
  additional_terminals: uuidListSchema,
});

export const resetPasswordSchema = z.object({
  id: uuidSchema,
  password: passwordSchema,
});

export const permissionOverridesSchema = z.object({
  id: uuidSchema,
  granted: z.array(z.string()),
  revoked: z.array(z.string()),
});

export const roleSchema = z.object({
  name: requiredText("el nombre del rol", 80),
  description: optionalText(400),
  permissions: z.array(z.string()),
});

export const roleUpdateSchema = roleSchema.extend({ id: uuidSchema });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
