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

// =============================================================================
// Registro masivo y día de lluvia
// =============================================================================

/**
 * Marca B&M o lavado de carrocería para TODOS los buses del terminal en la fecha.
 *
 * Es la operación que se hace de verdad al cerrar el turno: casi toda la flota
 * cumplió, y marcar cuatrocientas casillas a mano no es un flujo, es un castigo.
 * Se marca todo de una vez y después se corrigen las excepciones.
 *
 * NO toca los buses marcados como «en reparación» ni «no se lava»: esas dos
 * marcas son decisiones explícitas de alguien y un barrido masivo no debe
 * borrarlas.
 */
export async function bulkMarkBusWashAction(input: {
  date: string;
  /** Terminales sobre los que aplicar. Son los que la pantalla está mostrando. */
  terminalIds: string[];
  field: "bm_completed" | "body_wash_completed";
}): Promise<ActionResult<{ updated: number }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.busWash.edit)) {
    return actionError("No tiene permisos para registrar el aseo de buses.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return actionError("La fecha no es válida.");

  const authorized = new Set(context.terminals.map((terminal) => terminal.id));
  const terminalIds = input.terminalIds.filter((id) => authorized.has(id));

  if (terminalIds.length === 0) {
    return actionError("No tiene acceso a los terminales indicados.");
  }

  const supabase = await createClient();

  const [{ data: fleet, error: fleetError }, { data: records, error: recordsError }] =
    await Promise.all([
      supabase
        .from("fleet_view")
        .select("id, terminal_id, zone")
        .in("terminal_id", terminalIds)
        .eq("active", true),
      supabase
        .from("bus_wash_records")
        .select("fleet_id, bm_completed, body_wash_completed, in_repair, no_wash")
        .eq("record_date", input.date)
        .in("terminal_id", terminalIds),
    ]);

  if (fleetError) return actionError(reportError("bulkMarkBusWash.fleet", fleetError));
  if (recordsError) return actionError(reportError("bulkMarkBusWash.records", recordsError));

  const existing = new Map((records ?? []).map((record) => [record.fleet_id, record]));

  const payload = (fleet ?? [])
    // REDVAN no entra en el aseo de flota, igual que en el listado
    .filter((bus) => (bus.zone ?? "").trim().toUpperCase() !== "REDVAN")
    .filter((bus) => {
      const record = existing.get(bus.id);
      return !record?.in_repair && !record?.no_wash;
    })
    .map((bus) => {
      const record = existing.get(bus.id);
      return {
        fleet_id: bus.id,
        terminal_id: bus.terminal_id,
        record_date: input.date,
        bm_completed: input.field === "bm_completed" ? true : (record?.bm_completed ?? false),
        body_wash_completed:
          input.field === "body_wash_completed" ? true : (record?.body_wash_completed ?? false),
        in_repair: false,
        no_wash: false,
        updated_by: context.profile.id,
      };
    });

  if (payload.length === 0) return actionSuccess({ updated: 0 });

  const { error } = await supabase
    .from("bus_wash_records")
    .upsert(payload, { onConflict: "fleet_id,record_date" });

  if (error) return actionError(reportError("bulkMarkBusWash.upsert", error));

  revalidatePath("/lavado-buses");
  return actionSuccess({ updated: payload.length });
}

/**
 * Registra —o retira— la justificación de lluvia del terminal para esa fecha.
 *
 * No bloquea nada: llueve por la mañana, escampa por la tarde y ese día sí se
 * lava. Sólo deja constancia de por qué el cumplimiento de carrocería fue bajo.
 */
export async function setBusWashRainDayAction(input: {
  date: string;
  terminalId: string;
  reason: string | null;
}): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.busWash.edit)) {
    return actionError("No tiene permisos para registrar el aseo de buses.");
  }

  if (!context.terminals.some((terminal) => terminal.id === input.terminalId)) {
    return actionError("No tiene acceso a este terminal.");
  }

  const supabase = await createClient();

  if (input.reason === null) {
    const { error } = await supabase
      .from("bus_wash_rain_days")
      .delete()
      .eq("terminal_id", input.terminalId)
      .eq("record_date", input.date);

    if (error) return actionError(reportError("setRainDay.delete", error));
    revalidatePath("/lavado-buses");
    return actionSuccess();
  }

  const reason = input.reason.trim();
  if (reason.length < 3) {
    return actionError("Explique brevemente por qué no se lavó carrocería.", {
      reason: "Escriba al menos unas palabras.",
    });
  }

  const { error } = await supabase.from("bus_wash_rain_days").upsert(
    {
      terminal_id: input.terminalId,
      record_date: input.date,
      reason,
      created_by: context.profile.id,
    },
    { onConflict: "terminal_id,record_date" },
  );

  if (error) return actionError(reportError("setRainDay.upsert", error));

  revalidatePath("/lavado-buses");
  return actionSuccess();
}
