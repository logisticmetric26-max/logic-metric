"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import {
  fuelDeliveryConfirmSchema,
  fuelDeliverySchema,
  fuelDeliveryUpdateSchema,
} from "@/features/fuel/schemas";

const FUEL_PATHS = ["/combustible"];

function revalidateFuelCalendar() {
  for (const path of FUEL_PATHS) revalidatePath(path);
}

export async function createFuelDeliveryAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fuelCalendar.create)) {
    return actionError("No tiene permisos para programar llegadas de combustible.");
  }

  const parsed = fuelDeliverySchema.safeParse({
    terminal_id: formData.get("terminal_id"),
    request_reference: formData.get("request_reference"),
    delivery_address: formData.get("delivery_address"),
    product_type: formData.get("product_type"),
    product_label: formData.get("product_label"),
    scheduled_date: formData.get("scheduled_date"),
    reception_window: formData.get("reception_window"),
    reception_time_range: formData.get("reception_time_range"),
    supplier_name: formData.get("supplier_name") ?? "",
    requested_quantity_m3: formData.get("requested_quantity_m3"),
    truck_reference: formData.get("truck_reference") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fuel_delivery_schedules")
    .insert({
      terminal_id: parsed.data.terminal_id,
      request_reference: parsed.data.request_reference,
      delivery_address: parsed.data.delivery_address,
      product_type: parsed.data.product_type,
      product_label: parsed.data.product_label,
      scheduled_date: parsed.data.scheduled_date,
      reception_window: parsed.data.reception_window,
      reception_time_range: parsed.data.reception_time_range,
      supplier_name: parsed.data.supplier_name,
      requested_quantity_m3: parsed.data.requested_quantity_m3,
      truck_reference: parsed.data.truck_reference,
      notes: parsed.data.notes,
      created_by: context.profile.id,
    })
    .select("id")
    .single();

  if (error) return actionError(reportError("createFuelDelivery", error));

  revalidateFuelCalendar();
  return actionSuccess({ id: data.id });
}

export async function updateFuelDeliveryAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fuelCalendar.edit)) {
    return actionError("No tiene permisos para editar llegadas programadas.");
  }

  const parsed = fuelDeliveryUpdateSchema.safeParse({
    id: formData.get("id"),
    terminal_id: formData.get("terminal_id"),
    request_reference: formData.get("request_reference"),
    delivery_address: formData.get("delivery_address"),
    product_type: formData.get("product_type"),
    product_label: formData.get("product_label"),
    scheduled_date: formData.get("scheduled_date"),
    reception_window: formData.get("reception_window"),
    reception_time_range: formData.get("reception_time_range"),
    supplier_name: formData.get("supplier_name") ?? "",
    requested_quantity_m3: formData.get("requested_quantity_m3"),
    truck_reference: formData.get("truck_reference") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("fuel_delivery_schedules")
    .select("confirmed_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (readError) return actionError(reportError("updateFuelDelivery.read", readError));
  if (!current) return actionError("La llegada indicada no existe o no está disponible.");
  if (current.confirmed_at) {
    return actionError("Una llegada ya confirmada no puede reprogramarse.");
  }

  const { error } = await supabase
    .from("fuel_delivery_schedules")
    .update({
      terminal_id: parsed.data.terminal_id,
      request_reference: parsed.data.request_reference,
      delivery_address: parsed.data.delivery_address,
      product_type: parsed.data.product_type,
      product_label: parsed.data.product_label,
      scheduled_date: parsed.data.scheduled_date,
      reception_window: parsed.data.reception_window,
      reception_time_range: parsed.data.reception_time_range,
      supplier_name: parsed.data.supplier_name,
      requested_quantity_m3: parsed.data.requested_quantity_m3,
      truck_reference: parsed.data.truck_reference,
      notes: parsed.data.notes,
      updated_by: context.profile.id,
    })
    .eq("id", parsed.data.id);

  if (error) return actionError(reportError("updateFuelDelivery", error));

  revalidateFuelCalendar();
  return actionSuccess();
}

export async function confirmFuelDeliveryAction(id: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fuelCalendar.confirm)) {
    return actionError("No tiene permisos para confirmar recepciones.");
  }

  const parsed = fuelDeliveryConfirmSchema.safeParse({ id });
  if (!parsed.success) {
    return actionError("La llegada indicada no es válida.");
  }

  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("fuel_delivery_schedules")
    .select("confirmed_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (readError) return actionError(reportError("confirmFuelDelivery.read", readError));
  if (!current) return actionError("La llegada indicada no existe o no está disponible.");
  if (current.confirmed_at) {
    return actionError("La llegada ya fue confirmada por otro usuario.");
  }

  const { error } = await supabase
    .from("fuel_delivery_schedules")
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_by: context.profile.id,
      updated_by: context.profile.id,
    })
    .eq("id", parsed.data.id)
    .is("confirmed_at", null);

  if (error) return actionError(reportError("confirmFuelDelivery", error));

  revalidateFuelCalendar();
  return actionSuccess();
}
