"use server";

import { Workbook } from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import {
  inferFuelProductType,
  normalizeImportKey,
  normalizeImportText,
  parseExcelDate,
  parseFuelReceptionWindow,
  quantityCellToInput,
  resolveFuelImportHeaders,
  type FuelImportColumnKey,
} from "@/features/fuel/import";
import {
  fuelDeliveryConfirmSchema,
  fuelDeliverySchema,
  fuelDeliveryUpdateSchema,
  type FuelDeliveryInput,
} from "@/features/fuel/schemas";
import { toFieldErrors } from "@/schemas/common";
import type {
  Database,
  FuelDeliveryProduct,
  FuelReceptionWindow,
} from "@/types/database.types";

const FUEL_PATHS = ["/combustible"];
const EXCEL_FILE_PATTERN = /\.(xlsx|xlsm|xltx|xltm)$/i;
const MAX_IMPORT_ROWS = 500;

type ImportedFuelRow = FuelDeliveryInput & {
  source: string;
  slotKey: string;
};

type FuelDeliveryInsertRow = Database["public"]["Tables"]["fuel_delivery_schedules"]["Insert"];

function revalidateFuelCalendar() {
  for (const path of FUEL_PATHS) revalidatePath(path);
}

function readFuelDeliveryPayload(formData: FormData) {
  return {
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
  };
}

function buildSlotKey(
  terminalId: string,
  productType: FuelDeliveryProduct,
  scheduledDate: string,
  receptionWindow: FuelReceptionWindow,
) {
  return [terminalId, productType, scheduledDate, receptionWindow].join("|");
}

function readCell(row: { getCell: (index: number) => { text: string; value: unknown } }, index?: number) {
  if (!index) return { text: "", value: "" };
  const cell = row.getCell(index);
  return {
    text: normalizeImportText(cell.text),
    value:
      typeof cell.value === "string" || typeof cell.value === "number" || cell.value instanceof Date
        ? cell.value
        : cell.text,
  };
}

function rowHasValues(row: { actualCellCount: number; getCell: (index: number) => { text: string } }) {
  for (let index = 1; index <= row.actualCellCount; index += 1) {
    if (normalizeImportText(row.getCell(index).text)) return true;
  }
  return false;
}

function importFailure(issues: string[]) {
  const visible = issues.slice(0, 8);
  if (issues.length > visible.length) {
    visible.push(`...y ${issues.length - visible.length} observaciones más.`);
  }

  return actionError(
    `No se importó la planilla. Revise ${issues.length} observaci${issues.length === 1 ? "ón" : "ones"}.`,
    {
      file: visible[0] ?? "Revise el archivo seleccionado.",
      file_details: visible.join("\n"),
    },
  );
}

function terminalLookup(
  terminals: Array<{ id: string; name: string; code: string | null }>,
) {
  const lookup = new Map<string, { id: string; name: string }>();
  for (const terminal of terminals) {
    lookup.set(terminal.id, { id: terminal.id, name: terminal.name });
    lookup.set(normalizeImportKey(terminal.name), { id: terminal.id, name: terminal.name });
    if (terminal.code) {
      lookup.set(normalizeImportKey(terminal.code), { id: terminal.id, name: terminal.name });
    }
  }
  return lookup;
}

function parseImportedRow(
  row: { getCell: (index: number) => { text: string; value: unknown } },
  mapping: Partial<Record<FuelImportColumnKey, number>>,
  source: string,
  terminals: Map<string, { id: string; name: string }>,
) {
  const terminalCell = readCell(row, mapping.terminal);
  const requestReferenceCell = readCell(row, mapping.request_reference);
  const deliveryAddressCell = readCell(row, mapping.delivery_address);
  const productTypeCell = readCell(row, mapping.product_type);
  const productLabelCell = readCell(row, mapping.product_label);
  const scheduledDateCell = readCell(row, mapping.scheduled_date);
  const receptionWindowCell = readCell(row, mapping.reception_window);
  const receptionTimeRangeCell = readCell(row, mapping.reception_time_range);
  const supplierNameCell = readCell(row, mapping.supplier_name);
  const quantityCell = readCell(row, mapping.requested_quantity_m3);
  const truckReferenceCell = readCell(row, mapping.truck_reference);
  const notesCell = readCell(row, mapping.notes);

  const terminalRef = terminalCell.text;
  const terminal = terminals.get(terminalRef) ?? terminals.get(normalizeImportKey(terminalRef));
  if (!terminal) {
    return { issue: `${source}: terminal "${terminalRef || "(vacío)"}" no reconocido.` };
  }

  const productType = inferFuelProductType(productTypeCell.value, source);
  if (!productType) {
    return { issue: `${source}: el producto debe indicar Combustible o AdBlue.` };
  }

  const receptionWindow = parseFuelReceptionWindow(receptionWindowCell.value);
  if (!receptionWindow) {
    return { issue: `${source}: la ventana debe ser AM o PM.` };
  }

  const scheduledDate = parseExcelDate(scheduledDateCell.value);
  if (!scheduledDate) {
    return { issue: `${source}: la fecha programada no es válida.` };
  }

  const parsed = fuelDeliverySchema.safeParse({
    terminal_id: terminal.id,
    request_reference: requestReferenceCell.text,
    delivery_address: deliveryAddressCell.text,
    product_type: productType,
    product_label: productLabelCell.text,
    scheduled_date: scheduledDate,
    reception_window: receptionWindow,
    reception_time_range: receptionTimeRangeCell.text,
    supplier_name: supplierNameCell.text,
    requested_quantity_m3: quantityCellToInput(quantityCell.value),
    truck_reference: truckReferenceCell.text,
    notes: notesCell.text,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "La fila contiene datos inválidos.";
    return { issue: `${source}: ${firstIssue}` };
  }

  return {
    row: {
      ...parsed.data,
      source,
      slotKey: buildSlotKey(
        parsed.data.terminal_id,
        parsed.data.product_type,
        parsed.data.scheduled_date,
        parsed.data.reception_window,
      ),
    } satisfies ImportedFuelRow,
  };
}

export async function createFuelDeliveryAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fuelCalendar.create)) {
    return actionError("No tiene permisos para programar llegadas de combustible.");
  }

  const parsed = fuelDeliverySchema.safeParse(readFuelDeliveryPayload(formData));

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

export async function importFuelDeliveriesAction(
  formData: FormData,
): Promise<ActionResult<{ inserted: number }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fuelCalendar.bulkImport)) {
    return actionError("No tiene permisos para realizar cargas masivas en combustible.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return actionError("Debe seleccionar un archivo Excel.", {
      file: "Seleccione un archivo .xlsx antes de continuar.",
    });
  }

  if (!EXCEL_FILE_PATTERN.test(file.name)) {
    return actionError("El archivo debe ser una planilla Excel válida.", {
      file: "Solo se aceptan archivos .xlsx, .xlsm, .xltx o .xltm.",
    });
  }

  if (file.size === 0) {
    return actionError("El archivo seleccionado está vacío.", {
      file: "Seleccione una planilla que contenga datos.",
    });
  }

  const workbook = new Workbook();

  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return actionError(reportError("importFuelDeliveries.load", error), {
      file: "No fue posible leer la planilla Excel.",
    });
  }

  const issues: string[] = [];
  const importedRows: ImportedFuelRow[] = [];
  const terminals = terminalLookup(context.terminals);

  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount < 2) continue;

    const headerRow = worksheet.getRow(1);
    const headers = Array.from({ length: headerRow.actualCellCount }, (_, index) =>
      normalizeImportText(headerRow.getCell(index + 1).text),
    );
    const hasDataRows = Array.from({ length: worksheet.rowCount - 1 }, (_, offset) =>
      rowHasValues(worksheet.getRow(offset + 2)),
    ).some(Boolean);

    if (!hasDataRows) continue;

    const { mapping, missing } = resolveFuelImportHeaders(headers);
    if (missing.length > 0) {
      issues.push(
        `Hoja "${worksheet.name}": faltan columnas requeridas (${missing.join(", ")}).`,
      );
      continue;
    }

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (!rowHasValues(row)) continue;

      const source = `${worksheet.name}, fila ${rowNumber}`;
      const parsed = parseImportedRow(row, mapping, source, terminals);
      if ("issue" in parsed) {
        issues.push(parsed.issue);
        continue;
      }

      importedRows.push(parsed.row);
    }
  }

  if (issues.length > 0) return importFailure(issues);

  if (importedRows.length === 0) {
    return actionError("La planilla no contiene filas para importar.", {
      file: "No se encontraron datos desde la fila 2 en adelante.",
    });
  }

  if (importedRows.length > MAX_IMPORT_ROWS) {
    return actionError(
      `La planilla supera el máximo de ${MAX_IMPORT_ROWS} filas por carga masiva.`,
      {
        file: `Divida el archivo en bloques de hasta ${MAX_IMPORT_ROWS} filas.`,
      },
    );
  }

  const seen = new Map<string, string>();
  for (const row of importedRows) {
    const existingSource = seen.get(row.slotKey);
    if (existingSource) {
      issues.push(
        `${row.source}: ya existe otra fila en la planilla para el mismo terminal, producto, fecha y ventana (${existingSource}).`,
      );
      continue;
    }
    seen.set(row.slotKey, row.source);
  }

  if (issues.length > 0) return importFailure(issues);

  const supabase = await createClient();
  const terminalIds = [...new Set(importedRows.map((row) => row.terminal_id))];
  const dates = importedRows.map((row) => row.scheduled_date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  const { data: existingRows, error: existingError } = await supabase
    .from("fuel_delivery_schedules")
    .select("terminal_id, product_type, scheduled_date, reception_window")
    .in("terminal_id", terminalIds)
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);

  if (existingError) {
    return actionError(reportError("importFuelDeliveries.existing", existingError));
  }

  const existingSlots = new Set(
    (existingRows ?? []).map((row) =>
      buildSlotKey(
        row.terminal_id,
        row.product_type as FuelDeliveryProduct,
        row.scheduled_date,
        row.reception_window as FuelReceptionWindow,
      ),
    ),
  );

  for (const row of importedRows) {
    if (existingSlots.has(row.slotKey)) {
      issues.push(
        `${row.source}: ya existe una llegada programada para ese terminal, producto y ventana.`,
      );
    }
  }

  if (issues.length > 0) return importFailure(issues);

  const rowsToInsert: FuelDeliveryInsertRow[] = importedRows.map((row) => ({
    terminal_id: row.terminal_id,
    request_reference: row.request_reference,
    delivery_address: row.delivery_address,
    product_type: row.product_type,
    product_label: row.product_label,
    scheduled_date: row.scheduled_date,
    reception_window: row.reception_window,
    reception_time_range: row.reception_time_range,
    supplier_name: row.supplier_name,
    requested_quantity_m3: row.requested_quantity_m3,
    truck_reference: row.truck_reference,
    notes: row.notes,
    created_by: context.profile.id,
  }));

  const { error } = await supabase.from("fuel_delivery_schedules").insert(rowsToInsert);
  if (error) return actionError(reportError("importFuelDeliveries.insert", error));

  revalidateFuelCalendar();
  return actionSuccess({ inserted: rowsToInsert.length });
}

export async function updateFuelDeliveryAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.fuelCalendar.edit)) {
    return actionError("No tiene permisos para editar llegadas programadas.");
  }

  const parsed = fuelDeliveryUpdateSchema.safeParse({
    id: formData.get("id"),
    ...readFuelDeliveryPayload(formData),
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
