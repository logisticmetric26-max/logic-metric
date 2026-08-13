"use server";

import { revalidatePath } from "next/cache";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { readerCodeSchema, readerCodeUpdateSchema } from "@/features/reader-codes/schemas";

const READER_CODES_PATH = "/configuracion/codigos-lectores";

function parseReaderCodeForm(formData: FormData) {
  return {
    ppu: formData.get("ppu"),
    internal_number: formData.get("internal_number"),
    reader_code: formData.get("reader_code"),
    reader_type: formData.get("reader_type"),
    active: formData.get("active"),
  };
}

export async function createReaderCodeAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.readerCodes.create)) {
    return actionError("No tiene permisos para crear codigos lectores.");
  }

  const parsed = readerCodeSchema.safeParse(parseReaderCodeForm(formData));
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reader_codes")
    .insert({ ...parsed.data, created_by: context.profile.id })
    .select("id")
    .single();

  if (error) return actionError(reportError("createReaderCode", error));

  revalidatePath(READER_CODES_PATH);
  return actionSuccess({ id: data.id });
}

export async function updateReaderCodeAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.readerCodes.edit)) {
    return actionError("No tiene permisos para editar codigos lectores.");
  }

  const parsed = readerCodeUpdateSchema.safeParse({
    id: formData.get("id"),
    ...parseReaderCodeForm(formData),
  });
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("reader_codes")
    .update({ ...values, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("updateReaderCode", error));

  revalidatePath(READER_CODES_PATH);
  return actionSuccess();
}

export async function setReaderCodeActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.readerCodes.edit)) {
    return actionError("No tiene permisos para editar codigos lectores.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reader_codes")
    .update({ active, updated_by: context.profile.id })
    .eq("id", id);

  if (error) return actionError(reportError("setReaderCodeActive", error));

  revalidatePath(READER_CODES_PATH);
  return actionSuccess();
}

export async function deleteReaderCodeAction(id: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.readerCodes.delete)) {
    return actionError("No tiene permisos para eliminar codigos lectores.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reader_codes").delete().eq("id", id);

  if (error) return actionError(reportError("deleteReaderCode", error));

  revalidatePath(READER_CODES_PATH);
  return actionSuccess();
}
