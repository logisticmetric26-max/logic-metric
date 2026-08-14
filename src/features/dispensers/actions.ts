"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { dispenserSchema, dispenserUpdateSchema } from "@/features/dispensers/schemas";

const DISPENSERS_PATH = "/configuracion/surtidores";

function parseDispenserForm(formData: FormData) {
  return {
    code: formData.get("code"),
    terminal_name: formData.get("terminal_name"),
    terminal_code: formData.get("terminal_code"),
    planner_rut: formData.get("planner_rut"),
    supervisor_rut: formData.get("supervisor_rut"),
    active: formData.get("active"),
  };
}

export async function createDispenserAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.dispensers.create)) {
    return actionError("No tiene permisos para crear surtidores.");
  }

  const parsed = dispenserSchema.safeParse(parseDispenserForm(formData));
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispensers")
    .insert({ ...parsed.data, created_by: context.profile.id })
    .select("id")
    .single();

  if (error) return actionError(reportError("createDispenser", error));

  revalidatePath(DISPENSERS_PATH);
  return actionSuccess({ id: data.id });
}

export async function updateDispenserAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.dispensers.edit)) {
    return actionError("No tiene permisos para editar surtidores.");
  }

  const parsed = dispenserUpdateSchema.safeParse({
    id: formData.get("id"),
    ...parseDispenserForm(formData),
  });
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("dispensers")
    .update({ ...values, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("updateDispenser", error));

  revalidatePath(DISPENSERS_PATH);
  return actionSuccess();
}

export async function setDispenserActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.dispensers.edit)) {
    return actionError("No tiene permisos para editar surtidores.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("dispensers")
    .update({ active, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("setDispenserActive", error));

  revalidatePath(DISPENSERS_PATH);
  return actionSuccess();
}

export async function deleteDispenserAction(id: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.dispensers.delete)) {
    return actionError("No tiene permisos para eliminar surtidores.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dispensers").delete().eq("id", id);

  if (error) return actionError(reportError("deleteDispenser", error));

  revalidatePath(DISPENSERS_PATH);
  return actionSuccess();
}
