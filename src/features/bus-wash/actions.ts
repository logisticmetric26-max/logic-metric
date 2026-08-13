"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { busWashRecordSchema, type BusWashRecordInput } from "@/features/bus-wash/schemas";

const BUS_WASH_PATH = "/lavado-buses";

type BusWashActionPayload = {
  bm_completed: boolean;
  body_wash_completed: boolean;
  in_repair: boolean;
  updated_at: string | null;
};

export async function saveBusWashRecordAction(
  input: BusWashRecordInput,
): Promise<ActionResult<BusWashActionPayload>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.busWash.edit)) {
    return actionError("No tiene permisos para registrar lavado de buses.");
  }

  const parsed = busWashRecordSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Revise los datos ingresados.");
  }

  const payload = parsed.data.in_repair
    ? { ...parsed.data, bm_completed: false, body_wash_completed: false }
    : parsed.data;
  const hasAnyFlag = payload.bm_completed || payload.body_wash_completed || payload.in_repair;
  const supabase = await createClient();

  if (!hasAnyFlag) {
    const { error } = await supabase
      .from("bus_wash_records")
      .delete()
      .eq("fleet_id", payload.fleet_id)
      .eq("record_date", payload.record_date);

    if (error) return actionError(reportError("deleteBusWashRecord", error));

    revalidatePath(BUS_WASH_PATH);
    return actionSuccess({
      bm_completed: false,
      body_wash_completed: false,
      in_repair: false,
      updated_at: null,
    });
  }

  const { data: current, error: readError } = await supabase
    .from("bus_wash_records")
    .select("id")
    .eq("fleet_id", payload.fleet_id)
    .eq("record_date", payload.record_date)
    .maybeSingle();

  if (readError) return actionError(reportError("readBusWashRecord", readError));

  if (current) {
    const { data, error } = await supabase
      .from("bus_wash_records")
      .update({
        bm_completed: payload.bm_completed,
        body_wash_completed: payload.body_wash_completed,
        in_repair: payload.in_repair,
        updated_by: context.profile.id,
      })
      .eq("id", current.id)
      .select("bm_completed, body_wash_completed, in_repair, updated_at")
      .single();

    if (error) return actionError(reportError("updateBusWashRecord", error));

    revalidatePath(BUS_WASH_PATH);
    return actionSuccess(data);
  }

  const { data, error } = await supabase
    .from("bus_wash_records")
    .insert({
      fleet_id: payload.fleet_id,
      terminal_id: payload.terminal_id,
      record_date: payload.record_date,
      bm_completed: payload.bm_completed,
      body_wash_completed: payload.body_wash_completed,
      in_repair: payload.in_repair,
      created_by: context.profile.id,
      updated_by: context.profile.id,
    })
    .select("bm_completed, body_wash_completed, in_repair, updated_at")
    .single();

  if (error) return actionError(reportError("createBusWashRecord", error));

  revalidatePath(BUS_WASH_PATH);
  return actionSuccess(data);
}
