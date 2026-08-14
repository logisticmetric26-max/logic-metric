"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import {
  busWashExportSchema,
  busWashRecordSchema,
  type BusWashExportInput,
  type BusWashRecordInput,
} from "@/features/bus-wash/schemas";

const BUS_WASH_PATH = "/lavado-buses";
const BUS_WASH_HISTORY_PATH = "/lavado-buses/historico";

type BusWashActionPayload = {
  bm_completed: boolean;
  body_wash_completed: boolean;
  in_repair: boolean;
  no_wash: boolean;
  updated_at: string | null;
};

type BusWashExportActionPayload = {
  file_name: string;
  generated_at: string;
  csv_content: string;
  row_count: number;
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

  const supabase = await createClient();
  const payload = normalizeBusWashPayload(parsed.data);

  const { data: fleet, error: fleetError } = await supabase
    .from("fleet")
    .select("terminal_id, zone")
    .eq("id", payload.fleet_id)
    .maybeSingle();

  if (fleetError) return actionError(reportError("readBusWashFleet", fleetError));
  if (!fleet) return actionError("El bus indicado no existe o no esta disponible.");
  if (normalizeZone(fleet.zone) === "REDVAN") {
    return actionError("Los buses Redvan no se contemplan en el registro de lavado.");
  }

  const hasAnyFlag =
    payload.bm_completed || payload.body_wash_completed || payload.in_repair || payload.no_wash;

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
      no_wash: false,
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
        no_wash: payload.no_wash,
        updated_by: context.profile.id,
      })
      .eq("id", current.id)
      .select("bm_completed, body_wash_completed, in_repair, no_wash, updated_at")
      .single();

    if (error) return actionError(reportError("updateBusWashRecord", error));

    revalidatePath(BUS_WASH_PATH);
    return actionSuccess(data);
  }

  const { data, error } = await supabase
    .from("bus_wash_records")
    .insert({
      fleet_id: payload.fleet_id,
      terminal_id: fleet.terminal_id,
      record_date: payload.record_date,
      bm_completed: payload.bm_completed,
      body_wash_completed: payload.body_wash_completed,
      in_repair: payload.in_repair,
      no_wash: payload.no_wash,
      created_by: context.profile.id,
      updated_by: context.profile.id,
    })
    .select("bm_completed, body_wash_completed, in_repair, no_wash, updated_at")
    .single();

  if (error) return actionError(reportError("createBusWashRecord", error));

  revalidatePath(BUS_WASH_PATH);
  return actionSuccess(data);
}

export async function exportBusWashDayCsvAction(
  input: BusWashExportInput,
): Promise<ActionResult<BusWashExportActionPayload>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.busWash.view)) {
    return actionError("No tiene permisos para generar el archivo de lavado de buses.");
  }

  const parsed = busWashExportSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Revise la fecha solicitada.");
  }

  const supabase = await createClient();
  const { data: fleet, error: fleetError } = await supabase
    .from("fleet_view")
    .select("id, internal_number, ppu, terminal_name, zone")
    .order("zone", { ascending: true, nullsFirst: false })
    .order("internal_number");
  if (fleetError) return actionError(reportError("readBusWashExportFleet", fleetError));

  const visibleFleet = (fleet ?? []).filter((item) => normalizeZone(item.zone) !== "REDVAN");
  if (visibleFleet.length === 0) {
    return actionError("No hay buses visibles para generar el archivo diario.");
  }

  const fleetIds = visibleFleet.map((item) => item.id);
  const { data: records, error: recordsError } = await supabase
    .from("bus_wash_records")
    .select("fleet_id, bm_completed, body_wash_completed, in_repair, no_wash")
    .eq("record_date", parsed.data.record_date)
    .in("fleet_id", fleetIds);

  if (recordsError) return actionError(reportError("readBusWashExportRecords", recordsError));

  const recordMap = new Map((records ?? []).map((record) => [record.fleet_id, record]));
  const incompleteCount = visibleFleet.filter((item) => {
    const record = recordMap.get(item.id);
    return !hasAnyBusWashStatus(record);
  }).length;

  if (incompleteCount > 0) {
    return actionError(
      `El registro del dia no esta completo. Faltan ${incompleteCount} buses por registrar.`,
    );
  }

  const fileName = `LAVADO_BUSES_${parsed.data.record_date}_TODAS_LAS_ZONAS.csv`;
  const lines = [
    [
      "Numero Interno",
      "PPU",
      "Fecha",
      "Zona",
      "Terminal",
      "B y M",
      "L. Carroceria",
      "En Reparacion",
      "Sin lavado",
    ]
      .map(escapeCsv)
      .join(","),
    ...visibleFleet.map((item) => {
      const record = recordMap.get(item.id)!;

      return [
        item.internal_number,
        item.ppu,
        parsed.data.record_date,
        normalizeZoneLabel(item.zone),
        item.terminal_name,
        record.bm_completed ? "1" : "0",
        record.body_wash_completed ? "1" : "0",
        record.in_repair ? "1" : "0",
        record.no_wash ? "1" : "0",
      ]
        .map(escapeCsv)
        .join(",");
    }),
  ];

  const { data, error } = await supabase
    .from("bus_wash_exports")
    .insert({
      record_date: parsed.data.record_date,
      zone: "Todas las zonas",
      file_name: fileName,
      bus_count: visibleFleet.length,
      generated_by: context.profile.id,
    })
    .select("file_name, generated_at, bus_count")
    .single();

  if (error) return actionError(reportError("createBusWashExport", error));

  revalidatePath(BUS_WASH_HISTORY_PATH);

  return actionSuccess({
    file_name: data.file_name,
    generated_at: data.generated_at,
    csv_content: lines.join("\r\n"),
    row_count: data.bus_count,
  });
}

function normalizeBusWashPayload(input: BusWashRecordInput): BusWashRecordInput {
  if (input.in_repair) {
    return {
      ...input,
      bm_completed: false,
      body_wash_completed: false,
      no_wash: false,
    };
  }

  if (input.no_wash) {
    return {
      ...input,
      bm_completed: false,
      body_wash_completed: false,
      in_repair: false,
    };
  }

  return input;
}

function normalizeZone(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeZoneLabel(value: string | null | undefined) {
  return value?.trim() || "Sin zona";
}

function hasAnyBusWashStatus(
  record:
    | {
        bm_completed: boolean;
        body_wash_completed: boolean;
        in_repair: boolean;
        no_wash: boolean;
      }
    | null
    | undefined,
) {
  return Boolean(
    record?.bm_completed || record?.body_wash_completed || record?.in_repair || record?.no_wash,
  );
}

function escapeCsv(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
