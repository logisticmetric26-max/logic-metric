"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { terminalSchema, terminalUpdateSchema } from "@/features/terminals/schemas";

/**
 * Administración de terminales (§15).
 *
 * Se opera con el cliente de SESIÓN, no con la service role: cada INSERT y
 * UPDATE pasa por las políticas RLS. La comprobación de permiso que hay aquí
 * sólo sirve para devolver un mensaje claro — si se eliminara, la base seguiría
 * rechazando la operación.
 *
 * La auditoría la escribe un trigger, así que ninguna ruta de escritura puede
 * quedarse sin registrar.
 */

export async function createTerminalAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.terminals.create)) {
    return actionError("No tiene permisos para crear terminales.");
  }

  const parsed = terminalSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") ?? "",
    active: formData.get("active"),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("terminals")
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      active: parsed.data.active,
      created_by: context.profile.id,
    })
    .select("id")
    .single();

  if (error) return actionError(reportError("createTerminal", error));

  revalidatePath("/configuracion/terminales");
  return actionSuccess({ id: data.id });
}

export async function updateTerminalAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.terminals.edit)) {
    return actionError("No tiene permisos para editar terminales.");
  }

  const parsed = terminalUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    code: formData.get("code") ?? "",
    active: formData.get("active"),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("terminals")
    .update({
      name: parsed.data.name,
      code: parsed.data.code,
      active: parsed.data.active,
      updated_by: context.profile.id,
    })
    .eq("id", parsed.data.id);

  if (error) return actionError(reportError("updateTerminal", error));

  revalidatePath("/configuracion/terminales");
  return actionSuccess();
}

/**
 * Activa o desactiva un terminal.
 *
 * No existe borrado: un terminal desactivado conserva su historial de buses,
 * revisiones y auditoría (§15). La base tampoco expone una política de DELETE.
 */
export async function setTerminalActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.terminals.edit)) {
    return actionError("No tiene permisos para editar terminales.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("terminals")
    .update({ active, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("setTerminalActive", error));

  revalidatePath("/configuracion/terminales");
  return actionSuccess();
}
