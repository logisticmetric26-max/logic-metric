"use server";

import { revalidatePath } from "next/cache";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { escapeLikePattern } from "@/lib/utils";
import { toFieldErrors } from "@/schemas/common";
import {
  badFuelLoadExportSchema,
  badFuelLoadSchema,
  badFuelLoadUpdateSchema,
  type BadFuelLoadExportInput,
} from "@/features/bad-loads/schemas";
import type { BadFuelLoadViewRow } from "@/types/database.types";

const BAD_LOADS_PATH = "/combustible/malas-cargas";
const BAD_LOADS_HISTORY_PATH = "/combustible/malas-cargas/historico";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BadFuelLoadExportPayload = {
  file_name: string;
  csv_content: string;
  row_count: number;
};

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
  revalidatePath(BAD_LOADS_HISTORY_PATH);
  return actionSuccess();
}

export async function exportBadFuelLoadsCsvAction(
  input: BadFuelLoadExportInput,
): Promise<ActionResult<BadFuelLoadExportPayload>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.badLoads.edit)) {
    return actionError("No tiene permisos para exportar malas cargas.");
  }

  const parsed = badFuelLoadExportSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Revise los filtros solicitados para exportar.");
  }

  const supabase = await createClient();
  let query = supabase
    .from("bad_fuel_loads_view")
    .select("*")
    .is("exported_at", null)
    .order("load_date", { ascending: false })
    .order("load_time", { ascending: false });

  if (parsed.data.q?.trim()) {
    const raw = parsed.data.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const textPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${textPattern},reader_code.ilike.${textPattern},dispenser_code.ilike.${textPattern},dispenser_terminal_name.ilike.${textPattern},dispenser_terminal_code.ilike.${textPattern},created_by_name.ilike.${textPattern}`,
    );
  }

  if (parsed.data.desde && DATE_PATTERN.test(parsed.data.desde)) {
    query = query.gte("load_date", parsed.data.desde);
  }
  if (parsed.data.hasta && DATE_PATTERN.test(parsed.data.hasta)) {
    query = query.lte("load_date", parsed.data.hasta);
  }
  if (parsed.data.surtidor) {
    query = query.eq("dispenser_id", parsed.data.surtidor);
  }

  const { data: rows, error } = await query;
  if (error) return actionError(reportError("exportBadFuelLoadsCsv.readRows", error));

  const items = (rows ?? []) as BadFuelLoadViewRow[];
  if (items.length === 0) {
    return actionError("No hay malas cargas visibles para exportar con los filtros actuales.");
  }

  const lines = [
    [
      "Fecha",
      "HORA",
      "Codigo bus",
      "Litros",
      "Tapa",
      "Filtración",
      "Odometro",
      "Planillero",
      "Supervisor",
      "Surtidor",
    ]
      .map(escapeCsv)
      .join(","),
    ...items.map((item) => {
      const busCode =
        item.reader_code ??
        fallbackBusCode(item.internal_number);

      return [
        formatCsvDate(item.load_date),
        formatCsvTime(item.load_time),
        busCode,
        formatCsvLiters(item.liters),
        "1",
        "0",
        "0",
        item.planner_rut,
        item.supervisor_rut,
        item.dispenser_code,
      ]
        .map(escapeCsv)
        .join(",");
    }),
  ];

  const fileName = buildBadFuelLoadsFileName(items);
  const { error: updateError } = await supabase
    .from("bad_fuel_loads")
    .update({
      exported_at: new Date().toISOString(),
      exported_by: context.profile.id,
      export_file_name: fileName,
      updated_by: context.profile.id,
    })
    .in(
      "id",
      items.map((item) => item.id),
    );

  if (updateError) {
    return actionError(reportError("exportBadFuelLoadsCsv.markExported", updateError));
  }

  revalidatePath(BAD_LOADS_PATH);
  revalidatePath(BAD_LOADS_HISTORY_PATH);

  return actionSuccess({
    file_name: fileName,
    csv_content: lines.join("\r\n"),
    row_count: items.length,
  });
}

function formatCsvDate(value: string) {
  const [year, month, day] = value.split("-");
  return [day, month, year].filter(Boolean).join("-");
}

function formatCsvTime(value: string) {
  const normalized = value.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
  if (/^\d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
  return normalized;
}

function formatCsvLiters(value: number) {
  return String(Number(value));
}

function fallbackBusCode(internalNumber: string) {
  const digits = internalNumber.replace(/\D/g, "");
  if (!digits) return normalizeToken(internalNumber);
  return `BUS${digits.padStart(4, "0")}`;
}

function normalizeToken(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function buildBadFuelLoadsFileName(items: BadFuelLoadViewRow[]) {
  const terminals = [
    ...new Set(
      items
        .map((item) => item.dispenser_terminal_code || item.dispenser_terminal_name || item.terminal_name)
        .filter(Boolean),
    ),
  ].sort();
  const dates = [...new Set(items.map((item) => item.load_date).filter(Boolean))].sort();

  const terminalLabel = buildTerminalFileSegment(terminals);
  const dateLabel =
    dates.length === 0
      ? "SIN_FECHA"
      : dates.length === 1
        ? dates[0]
        : `${dates[0]}_A_${dates[dates.length - 1]}`;

  return `${terminalLabel}_${dateLabel}.csv`;
}

function escapeCsv(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toFileSegment(value: string) {
  const sanitized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return sanitized || "TERMINAL";
}

function buildTerminalFileSegment(terminals: string[]) {
  const parts = terminals.map(toFileSegment).filter(Boolean);
  if (parts.length === 0) return "TERMINAL";

  const joined = parts.join("_");
  if (joined.length <= 120) return joined;

  return joined.slice(0, 120).replace(/_+$/g, "") || "TERMINAL";
}
