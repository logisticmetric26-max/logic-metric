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
 * Desactivar conserva su historial de buses, revisiones y auditoría (§15). La
 * eliminación definitiva es una capacidad separada y sólo funciona cuando el
 * terminal no tiene ninguna dependencia operacional.
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

export async function deleteTerminalAction(id: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.terminals.delete)) {
    return actionError("No tiene permisos para eliminar terminales.");
  }

  const supabase = await createClient();

  const [
    { count: fleetCount, error: fleetError },
    { count: profilesCount, error: profilesError },
    { count: reviewsCount, error: reviewsError },
    { count: notSentCount, error: notSentError },
  ] = await Promise.all([
    supabase.from("fleet").select("id", { count: "exact", head: true }).eq("terminal_id", id),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("primary_terminal_id", id),
    supabase
      .from("technical_review_events")
      .select("id", { count: "exact", head: true })
      .eq("terminal_id", id),
    supabase
      .from("technical_review_not_sent")
      .select("id", { count: "exact", head: true })
      .eq("terminal_id", id),
  ]);

  if (fleetError) return actionError(reportError("deleteTerminalFleetCheck", fleetError));
  if (profilesError) return actionError(reportError("deleteTerminalProfilesCheck", profilesError));
  if (reviewsError) return actionError(reportError("deleteTerminalReviewsCheck", reviewsError));
  if (notSentError) return actionError(reportError("deleteTerminalNotSentCheck", notSentError));

  if ((fleetCount ?? 0) > 0) {
    return actionError("No se puede eliminar el terminal porque tiene buses asociados.");
  }

  if ((profilesCount ?? 0) > 0) {
    return actionError(
      "No se puede eliminar el terminal porque tiene usuarios con terminal principal asignado.",
    );
  }

  if ((reviewsCount ?? 0) > 0) {
    return actionError("No se puede eliminar el terminal porque tiene revisiones técnicas asociadas.");
  }

  if ((notSentCount ?? 0) > 0) {
    return actionError(
      "No se puede eliminar el terminal porque tiene registros de no enviados asociados.",
    );
  }

  const { error } = await supabase.from("terminals").delete().eq("id", id);

  if (error) return actionError(reportError("deleteTerminal", error));

  revalidatePath("/configuracion/terminales");
  revalidatePath("/configuracion/flota");
  return actionSuccess();
}
