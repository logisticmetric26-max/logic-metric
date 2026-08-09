"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { authIdentifierForRut } from "@/lib/auth/rut-identity";
import { getPublicEnv } from "@/lib/env";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { PASSWORD_MIN_LENGTH } from "@/features/access/schemas";

/**
 * §11 · Autogestión del perfil propio.
 *
 * Sólo dos operaciones, y ninguna toca datos de negocio: la foto y la
 * contraseña. El RUT, el nombre, el cargo, el rol y los terminales los cambia
 * un administrador desde ACCESO — son atribuciones, no preferencias, y quien
 * pudiera cambiárselas a sí mismo podría ascenderse (§56).
 */

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(72, "La contraseña es demasiado larga.");

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Ingrese su contraseña actual."),
    new_password: passwordSchema,
    confirm_password: z.string().min(1, "Repita la contraseña nueva."),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    path: ["confirm_password"],
    message: "Las dos contraseñas no coinciden.",
  })
  .refine((data) => data.new_password !== data.current_password, {
    path: ["new_password"],
    message: "La contraseña nueva debe ser distinta de la actual.",
  });

/**
 * Cambio de la contraseña propia.
 *
 * Se comprueba la contraseña ACTUAL antes de aceptar la nueva. Sin esa
 * comprobación, una sesión olvidada en un equipo compartido bastaría para
 * quedarse con la cuenta: bloquear al dueño cambiándole la contraseña.
 *
 * La verificación usa un cliente aparte, sin persistencia de sesión, para que
 * el intento de inicio de sesión no toque las cookies de la sesión en curso.
 */
export async function changeOwnPasswordAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  const parsed = changePasswordSchema.safeParse({
    current_password: formData.get("current_password"),
    new_password: formData.get("new_password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const identifier = authIdentifierForRut(context.profile.rut);
  if (!identifier) return actionError("No fue posible verificar su identidad.");

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  const verifier = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: identifier,
    password: parsed.data.current_password,
  });

  if (verifyError) {
    return actionError("La contraseña actual no es correcta.", {
      current_password: "La contraseña actual no es correcta.",
    });
  }

  // Cierra la sesión del verificador: no debe quedar viva una sesión paralela.
  await verifier.auth.signOut();

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.new_password });

  if (error) {
    reportError("changeOwnPassword", error);
    // Supabase rechaza contraseñas filtradas o demasiado simples según su
    // política; el mensaje suyo es en inglés, así que se traduce el caso.
    if (/password/i.test(error.message)) {
      return actionError("La contraseña no cumple los requisitos mínimos.", {
        new_password: "Elija una contraseña más segura.",
      });
    }
    return actionError("No fue posible cambiar la contraseña.");
  }

  // §57 · queda constancia del cambio. NUNCA la contraseña, sólo el hecho.
  await supabase.rpc("record_login");

  return actionSuccess();
}

const avatarPathSchema = z
  .string()
  .regex(/^[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]{1,100}$/, "Ruta de imagen no válida.");

/**
 * Asocia (o quita) la foto ya subida al bucket.
 *
 * El archivo lo sube el navegador directamente al bucket con la sesión del
 * usuario —las políticas de storage sólo le dejan escribir en su carpeta—, y
 * esta acción se limita a apuntar la ficha a esa ruta. Pasar varios megabytes
 * por una Server Action para volver a subirlos no aportaría ninguna garantía
 * que la política de storage no dé ya.
 */
export async function setOwnAvatarAction(path: string | null): Promise<ActionResult> {
  await requireActiveUser();

  if (path !== null) {
    const parsed = avatarPathSchema.safeParse(path);
    if (!parsed.success) return actionError("Ruta de imagen no válida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_own_avatar", { p_path: path });

  if (error) {
    return actionError(reportError("setOwnAvatar", error));
  }

  // La foto aparece en la cabecera y en la barra lateral de todas las páginas
  revalidatePath("/", "layout");
  return actionSuccess();
}
