"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { fleetSchema, fleetUpdateSchema } from "@/features/fleet/schemas";

/**
 * §14 · Administración de flota.
 *
 * Escribe con el cliente de sesión: RLS exige `fleet.create` / `fleet.edit` Y
 * acceso al terminal de destino. Mover un bus a un terminal ajeno es imposible
 * aunque se manipule el formulario, porque la política evalúa el terminal
 * ORIGEN en USING y el DESTINO en WITH CHECK.
 */

function parseFleetForm(formData: FormData) {
  return {
    internal_number: formData.get("internal_number"),
    ppu: formData.get("ppu"),
    model: formData.get("model") ?? "",
    subclass: formData.get("subclass") ?? "",
    fuel_type: formData.get("fuel_type"),
    terminal_id: formData.get("terminal_id"),
    active: formData.get("active"),
  };
}

export async function createFleetAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fleet.create)) {
    return actionError("No tiene permisos para crear buses.");
  }

  const parsed = fleetSchema.safeParse(parseFleetForm(formData));

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fleet")
    .insert({ ...parsed.data, created_by: context.profile.id })
    .select("id")
    .single();

  if (error) return actionError(reportError("createFleet", error));

  revalidatePath("/configuracion/flota");
  return actionSuccess({ id: data.id });
}

export async function updateFleetAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fleet.edit)) {
    return actionError("No tiene permisos para editar buses.");
  }

  const parsed = fleetUpdateSchema.safeParse({
    id: formData.get("id"),
    ...parseFleetForm(formData),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  // Cambiar `terminal_id` NO borra historial: cada evento y cada no-envío
  // guardan su propio terminal (§14).
  const { error } = await supabase
    .from("fleet")
    .update({ ...values, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("updateFleet", error));

  revalidatePath("/configuracion/flota");
  return actionSuccess();
}

export async function setFleetActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fleet.edit)) {
    return actionError("No tiene permisos para editar buses.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("fleet")
    .update({ active, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("setFleetActive", error));

  revalidatePath("/configuracion/flota");
  return actionSuccess();
}
