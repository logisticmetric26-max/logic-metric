import type { FuelDeliveryProduct, FuelReceptionWindow } from "@/types/database.types";

export const FUEL_IMPORT_TEMPLATE_COLUMNS = [
  { key: "terminal", label: "Terminal", required: true, example: "Alameda" },
  { key: "request_reference", label: "ID solicitud", required: true, example: "SOL-2451" },
  { key: "delivery_address", label: "Direccion", required: true, example: "Av. Principal 1234" },
  { key: "product_type", label: "Producto", required: true, example: "Combustible o AdBlue" },
  {
    key: "product_label",
    label: "Producto solicitado",
    required: true,
    example: "Petroleo Diesel Grado A1",
  },
  {
    key: "scheduled_date",
    label: "Fecha programada",
    required: true,
    example: "2026-08-12 o 12/08/2026",
  },
  { key: "reception_window", label: "Ventana", required: true, example: "AM o PM" },
  {
    key: "reception_time_range",
    label: "Horario de recepcion",
    required: true,
    example: "08:00 a 14:00",
  },
  { key: "supplier_name", label: "Razon social", required: true, example: "Proveedor S.A." },
  { key: "requested_quantity_m3", label: "Cantidad (m3)", required: true, example: "12,5" },
  { key: "truck_reference", label: "Camion", required: false, example: "PPU ABCD12" },
  { key: "notes", label: "Notas", required: false, example: "Acceso por porton norte" },
] as const;

export type FuelImportColumnKey = (typeof FUEL_IMPORT_TEMPLATE_COLUMNS)[number]["key"];

const HEADER_ALIASES: Record<FuelImportColumnKey, readonly string[]> = {
  terminal: ["terminal", "terminal nombre", "nombre terminal", "terminal code", "codigo terminal"],
  request_reference: [
    "id solicitud",
    "solicitud",
    "n solicitud",
    "numero solicitud",
    "folio solicitud",
    "request_reference",
  ],
  delivery_address: ["direccion", "direccion entrega", "direccion recepcion", "delivery_address"],
  product_type: ["producto", "tipo producto", "tipo carga", "product_type"],
  product_label: ["producto solicitado", "detalle producto", "descripcion producto", "product_label"],
  scheduled_date: ["fecha programada", "fecha", "fecha llegada", "scheduled_date"],
  reception_window: ["ventana", "recepcion", "franja", "reception_window"],
  reception_time_range: [
    "horario recepcion",
    "hora recepcion",
    "rango horario",
    "reception_time_range",
  ],
  supplier_name: ["razon social", "proveedor", "empresa", "supplier_name"],
  requested_quantity_m3: [
    "cantidad",
    "cantidad m3",
    "cantidad solicitada",
    "requested_quantity_m3",
  ],
  truck_reference: ["camion", "patente camion", "referencia camion", "truck_reference"],
  notes: ["notas", "observaciones", "comentarios", "notes"],
};

export function normalizeImportText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeImportKey(value: string): string {
  return normalizeImportText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ");
}

export function resolveFuelImportHeaders(headers: string[]) {
  const normalized = headers.map((header) => normalizeImportKey(header));
  const mapping: Partial<Record<FuelImportColumnKey, number>> = {};

  for (const column of FUEL_IMPORT_TEMPLATE_COLUMNS) {
    const index = normalized.findIndex((header) => HEADER_ALIASES[column.key].includes(header));
    if (index >= 0) mapping[column.key] = index + 1;
  }

  const missing = FUEL_IMPORT_TEMPLATE_COLUMNS.filter((column) => column.required)
    .map((column) => column.key)
    .filter((key) => !mapping[key]);

  return { mapping, missing };
}

export function inferFuelProductType(
  value: unknown,
  sheetName?: string,
): FuelDeliveryProduct | null {
  const normalized = normalizeImportKey(String(value ?? ""));
  if (normalized.includes("adblue") || normalized.includes("urea")) return "ADBLUE";
  if (
    normalized.includes("combustible") ||
    normalized.includes("diesel") ||
    normalized.includes("petroleo") ||
    normalized === "fuel"
  ) {
    return "FUEL";
  }

  const fromSheet = normalizeImportKey(sheetName ?? "");
  if (fromSheet.includes("adblue")) return "ADBLUE";
  if (fromSheet.includes("combustible") || fromSheet.includes("fuel")) return "FUEL";
  return null;
}

export function parseFuelReceptionWindow(value: unknown): FuelReceptionWindow | null {
  const normalized = normalizeImportKey(String(value ?? ""));
  if (normalized === "am" || normalized.includes("manana") || normalized.includes("morning")) {
    return "AM";
  }
  if (normalized === "pm" || normalized.includes("tarde") || normalized.includes("afternoon")) {
    return "PM";
  }
  return null;
}

export function parseExcelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateOnly(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(value));
    return toDateOnly(excelEpoch);
  }

  const text = normalizeImportText(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  }

  const dashMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed);
}

export function quantityCellToInput(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = normalizeImportText(value);
  if (text.includes(",") && text.includes(".")) {
    return text.replace(/\./g, "").replace(",", ".");
  }
  if (text.includes(",")) return text.replace(",", ".");
  return text;
}

function toDateOnly(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
