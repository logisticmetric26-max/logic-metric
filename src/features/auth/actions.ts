"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authIdentifierForRut } from "@/lib/auth/rut-identity";
import { loginSchema } from "@/features/auth/schemas";
import { actionError, actionSuccess, type ActionResult } from "@/lib/errors";
import type { CurrentUserContext } from "@/types/database.types";
import { landingRouteFor } from "@/lib/auth/session";

/**
 * Inicio de sesión con RUT y contraseña (§7).
 *
 * El usuario nunca ve ni escribe un correo. El identificador técnico que exige
 * Supabase Auth se deriva del RUT en el servidor.
 *
 * El mensaje de error es idéntico para «RUT inexistente» y «contraseña
 * incorrecta»: distinguirlos permitiría averiguar qué RUTs están registrados.
 */
export async function signInAction(formData: FormData): Promise<ActionResult<{ next: string }>> {
  const parsed = loginSchema.safeParse({
    rut: formData.get("rut"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return actionError("Revise los datos ingresados.", fieldErrors);
  }

  const identifier = authIdentifierForRut(parsed.data.rut);
  if (!identifier) {
    return actionError("El RUT ingresado no es válido.", { rut: "El RUT ingresado no es válido." });
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: identifier,
    password: parsed.data.password,
  });

  if (error) {
    return actionError("RUT o contraseña incorrectos.");
  }

  // Sesión establecida: ahora se comprueba que el usuario pueda operar.
  const { data } = await supabase.rpc("current_user_context");
  const context = data as CurrentUserContext | null;

  if (!context?.profile) {
    // Credencial válida sin ficha: no debe quedar una sesión colgando.
    await supabase.auth.signOut();
    return actionError(
      "Su usuario no tiene una ficha activa en la plataforma. Contacte al administrador.",
    );
  }

  if (context.profile.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return actionError("Su usuario se encuentra suspendido.");
  }

  // §57 · queda registrado el inicio de sesión
  await supabase.rpc("record_login");

  const requested = formData.get("siguiente");
  const next =
    typeof requested === "string" && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : landingRouteFor(context);

  return actionSuccess({ next });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
