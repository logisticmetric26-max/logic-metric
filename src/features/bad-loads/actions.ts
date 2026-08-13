"use server";

import { revalidatePath } from "next/cache";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { badFuelLoadSchema, badFuelLoadUpdateSchema } from "@/features/bad-loads/schemas";

const BAD_LOADS_PATH = "/combustible/malas-cargas";

function parseBadFuelLoadForm(formData: FormData) {
  return {
    bus_reference: formData.get("bus_reference"),
    dispenser_id: formData.get("dispenser_id"),
    load_date: formData.get("load_date"),
    load_time: formData.get("load_time"),
    liters: formData.get("liters"),
  };
}

async function resolveFleetForBadLoad(supabase: Awaited<ReturnType<typeof createClient>>, busReference: string) {
  const ppuCandidate = busReference.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const internalCandidate = busReference.replace(/\s+/g, " ").trim().toUpperCase();

  if (ppuCandidate.length >= 4) {
    const { data, error } = await supabase
      .from("fleet_view")
      .select("id, terminal_id")
      .eq("ppu", ppuCandidate)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("fleet_view")
    .select("id, terminal_id")
    .eq("internal_number", internalCandidate)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createBadFuelLoadAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.badLoads.create)) {
    return actionError("No tiene permisos para registrar malas cargas.");
  }

  const parsed = badFuelLoadSchema.safeParse(parseBadFuelLoadForm(formData));
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  let fleet;
  try {
    fleet = await resolveFleetForBadLoad(supabase, parsed.data.bus_reference);
  } catch (error) {
    return actionError(reportError("createBadFuelLoad.resolveFleet", error));
  }

  if (!fleet) {
    return actionError("No se encontro el bus indicado.", {
      bus_reference: "No se encontro un bus accesible con esa PPU o numero interno.",
    });
  }

  const { data, error } = await supabase
    .from("bad_fuel_loads")
    .insert({
      fleet_id: fleet.id,
      terminal_id: fleet.terminal_id,
      dispenser_id: parsed.data.dispenser_id,
      load_date: parsed.data.load_date,
      load_time: parsed.data.load_time,
      liters: parsed.data.liters,
      created_by: context.profile.id,
    })
    .select("id")
    .single();

  if (error) return actionError(reportError("createBadFuelLoad", error));

  revalidatePath(BAD_LOADS_PATH);
  return actionSuccess({ id: data.id });
}

export async function updateBadFuelLoadAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.badLoads.edit)) {
    return actionError("No tiene permisos para editar malas cargas.");
  }

  const parsed = badFuelLoadUpdateSchema.safeParse({
    id: formData.get("id"),
    ...parseBadFuelLoadForm(formData),
  });
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  let fleet;
  try {
    fleet = await resolveFleetForBadLoad(supabase, parsed.data.bus_reference);
  } catch (error) {
    return actionError(reportError("updateBadFuelLoad.resolveFleet", error));
  }

  if (!fleet) {
    return actionError("No se encontro el bus indicado.", {
      bus_reference: "No se encontro un bus accesible con esa PPU o numero interno.",
    });
  }

  const { id, ...values } = parsed.data;
  const { error } = await supabase
    .from("bad_fuel_loads")
    .update({
      fleet_id: fleet.id,
      terminal_id: fleet.terminal_id,
      dispenser_id: values.dispenser_id,
      load_date: values.load_date,
      load_time: values.load_time,
      liters: values.liters,
      updated_by: context.profile.id,
    })
    .eq("id", id);

  if (error) return actionError(reportError("updateBadFuelLoad", error));

  revalidatePath(BAD_LOADS_PATH);
  return actionSuccess();
}

export async function deleteBadFuelLoadAction(id: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.badLoads.delete)) {
    return actionError("No tiene permisos para eliminar malas cargas.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bad_fuel_loads").delete().eq("id", id);

  if (error) return actionError(reportError("deleteBadFuelLoad", error));

  revalidatePath(BAD_LOADS_PATH);
  return actionSuccess();
}
