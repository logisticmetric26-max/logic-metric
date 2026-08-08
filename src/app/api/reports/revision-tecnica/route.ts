import { NextResponse } from "next/server";
import { Workbook, type Worksheet } from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  aggregateRejections,
  fetchRejectionRecords,
} from "@/features/technical-reviews/analytics";
import {
  AREA_LABELS,
  classifyRejection,
} from "@/features/technical-reviews/rejection-classification";
import { formatDateOnly, formatDateTime, todayInZone } from "@/lib/format";
import { reportError } from "@/lib/errors";
import type { TechnicalReviewSummary } from "@/types/database.types";

/**
 * Exportación a Excel del módulo de Revisión Técnica.
 *
 * Un libro con toda la información del período filtrado: indicadores, motivos
 * agrupados, componentes, reparto Mantención/Logística, detalle motivo a
 * motivo, revisiones cerradas, vencimientos y no enviados.
 *
 * Corre con la sesión del usuario: RLS decide qué filas entran al archivo, así
 * que el Excel jamás contiene terminales a los que no tiene acceso.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ── Estilo corporativo ────────────────────────────────────────────────────────
const BRAND = "FF0A6CFF";
const BRAND_DARK = "FF0044AB";
const HEADER_TEXT = "FFFFFFFF";
const BORDER = "FFD9DCE3";
const ZEBRA = "FFF6F7FA";
const INK = "FF1D1D1F";
const MUTED = "FF6E6E76";

const AREA_COLORS: Record<string, string> = {
  Mantención: "FF0A6CFF",
  Logística: "FFEB6834",
};

interface Column {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

/** Hoja con identidad visual consistente: título, banda de encabezado y tabla. */
function addSheet(
  workbook: Workbook,
  name: string,
  subtitle: string,
  columns: Column[],
  rows: (string | number)[][],
): Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  sheet.columns = columns.map((column) => ({ width: column.width }));

  // Título de la hoja
  const title = sheet.getCell("A1");
  title.value = name;
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: INK } };
  sheet.getRow(1).height = 22;

  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Calibri", size: 10, color: { argb: MUTED } };
  sheet.getRow(2).height = 16;
  sheet.getRow(3).height = 6;

  // Encabezado de la tabla
  const headerRow = sheet.getRow(4);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle", horizontal: column.align ?? "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: BRAND_DARK } },
    };
  });
  headerRow.height = 20;

  // Filas de datos con cebra suave y bordes finos
  rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(5 + rowIndex);
    values.forEach((value, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = value;
      cell.font = { name: "Calibri", size: 10, color: { argb: INK } };
      cell.alignment = {
        vertical: "middle",
        horizontal: columns[columnIndex].align ?? "left",
        wrapText: columns[columnIndex].width >= 50,
      };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
      cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
    });
  });

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + rows.length, column: columns.length },
    };
  }

  return sheet;
}

export async function GET(request: Request) {
  const state = await getSessionState();

  if (state.kind !== "ACTIVE") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!state.context.permissions.includes(PERMISSIONS.technicalReview.view)) {
    return NextResponse.json({ error: "No tiene permisos para exportar." }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawFrom = url.searchParams.get("desde");
  const rawTo = url.searchParams.get("hasta");
  const rawTerminal = url.searchParams.get("terminal");

  const from = rawFrom && DATE_PATTERN.test(rawFrom) ? rawFrom : null;
  const to = rawTo && DATE_PATTERN.test(rawTo) ? rawTo : null;
  const terminalId =
    rawTerminal && state.context.terminals.some((terminal) => terminal.id === rawTerminal)
      ? rawTerminal
      : null;

  const terminalName = terminalId
    ? (state.context.terminals.find((terminal) => terminal.id === terminalId)?.name ?? "")
    : "Todos los terminales autorizados";

  const periodLabel =
    from && to
      ? `${formatDateOnly(from)} a ${formatDateOnly(to)}`
      : from
        ? `Desde ${formatDateOnly(from)}`
        : to
          ? `Hasta ${formatDateOnly(to)}`
          : "Histórico completo";

  const supabase = await createClient();

  try {
    // ── Datos (todo vía RLS) ─────────────────────────────────────────────────
    let closedQuery = supabase
      .from("technical_review_events_view")
      .select(
        "internal_number, ppu, terminal_name, driver_name, departure_at, return_at, result, guide_number, expiration_date, closed_by_name, rejection_count",
      )
      .eq("status", "CLOSED")
      .order("return_at", { ascending: false })
      .limit(5000);
    if (from) closedQuery = closedQuery.gte("return_at", `${from}T00:00:00`);
    if (to) closedQuery = closedQuery.lte("return_at", `${to}T23:59:59`);
    if (terminalId) closedQuery = closedQuery.eq("terminal_id", terminalId);

    let notSentQuery = supabase
      .from("technical_review_not_sent_view")
      .select("event_date, internal_number, ppu, terminal_name, reason, work_order_number, created_by_name")
      .order("event_date", { ascending: false })
      .limit(5000);
    if (from) notSentQuery = notSentQuery.gte("event_date", from);
    if (to) notSentQuery = notSentQuery.lte("event_date", to);
    if (terminalId) notSentQuery = notSentQuery.eq("terminal_id", terminalId);

    let expirationQuery = supabase
      .from("fleet_expiration_status")
      .select("internal_number, ppu, terminal_id, expiration_date, days_to_expiration, expiration_status, last_guide_number")
      .eq("active", true)
      .order("expiration_date", { ascending: true, nullsFirst: false })
      .limit(5000);
    if (terminalId) expirationQuery = expirationQuery.eq("terminal_id", terminalId);

    const [summaryResult, records, closedResult, notSentResult, expirationResult] =
      await Promise.all([
        supabase.rpc("technical_review_summary", {
          p_from: from,
          p_to: to,
          p_terminal_id: terminalId,
        }),
        fetchRejectionRecords(supabase, { from, to, terminalId }),
        closedQuery,
        notSentQuery,
        expirationQuery,
      ]);

    if (summaryResult.error) throw summaryResult.error;
    if (closedResult.error) throw closedResult.error;
    if (notSentResult.error) throw notSentResult.error;
    if (expirationResult.error) throw expirationResult.error;

    const summary = summaryResult.data as TechnicalReviewSummary;
    const analytics = aggregateRejections(records);
    const terminalNameById = new Map(
      state.context.terminals.map((terminal) => [terminal.id, terminal.name]),
    );

    // ── Libro ────────────────────────────────────────────────────────────────
    const workbook = new Workbook();
    workbook.creator = "Logic Metric";
    workbook.created = new Date();

    const meta = `Período: ${periodLabel} · Terminal: ${terminalName} · Generado el ${formatDateTime(new Date())} por ${state.context.profile.full_name}`;

    // 1 · Resumen
    addSheet(
      workbook,
      "Resumen",
      meta,
      [
        { header: "Indicador", width: 42 },
        { header: "Valor", width: 14, align: "right" },
        { header: "Alcance", width: 40 },
      ],
      [
        ["Buses en revisión", summary.in_review, "En planta al momento de generar el reporte"],
        ["Aprobados", summary.approved, periodLabel],
        ["Rechazados", summary.rejected, periodLabel],
        ["No enviados", summary.not_sent, periodLabel],
        [
          "Próximos a vencer",
          summary.expiring_soon,
          `Vencen dentro de ${summary.expiring_soon_days} días · estado actual`,
        ],
        ["Vencidos", summary.expired, "Sin revisión vigente · estado actual"],
        ["", "", ""],
        ["Motivos de rechazo registrados", analytics.reasonCount, periodLabel],
        ["Revisiones rechazadas analizadas", analytics.eventCount, periodLabel],
        ["Promedio de motivos por revisión", analytics.averagePerEvent, periodLabel],
        ["Motivos de Mantención", analytics.byArea.MANTENCION, periodLabel],
        [
          "Motivos de Logística (extintor, norma gráfica, placa patente, limpieza)",
          analytics.byArea.LOGISTICA,
          periodLabel,
        ],
      ],
    );

    // 2 · Motivos más comunes
    addSheet(
      workbook,
      "Motivos de rechazo",
      `Motivos agrupados (variaciones de OCR unificadas) · ${meta}`,
      [
        { header: "N°", width: 6, align: "right" },
        { header: "Motivo", width: 78 },
        { header: "Componente", width: 26 },
        { header: "Área", width: 14 },
        { header: "Casos", width: 10, align: "right" },
      ],
      analytics.byReason.map((reason, index) => [
        index + 1,
        reason.label,
        reason.component,
        AREA_LABELS[reason.area],
        reason.count,
      ]),
    );

    // 3 · Componentes
    addSheet(
      workbook,
      "Componentes",
      `Hallazgos por componente del bus · ${meta}`,
      [
        { header: "Componente", width: 32 },
        { header: "Área", width: 14 },
        { header: "Casos", width: 10, align: "right" },
        { header: "% del total", width: 12, align: "right" },
      ],
      analytics.byComponent.map((component) => [
        component.label,
        AREA_LABELS[component.area],
        component.count,
        analytics.reasonCount === 0
          ? "0%"
          : `${Math.round((component.count / analytics.reasonCount) * 100)}%`,
      ]),
    );

    // 4 · Buses con más rechazos
    addSheet(
      workbook,
      "Buses",
      `Reincidencia por bus · ${meta}`,
      [
        { header: "N° interno", width: 14 },
        { header: "PPU", width: 12 },
        { header: "Terminal", width: 28 },
        { header: "Revisiones rechazadas", width: 20, align: "right" },
        { header: "Motivos acumulados", width: 18, align: "right" },
      ],
      analytics.byBus.map((bus) => [
        bus.internal_number,
        bus.ppu,
        bus.terminal_name,
        bus.events,
        bus.reasons,
      ]),
    );

    // 5 · Detalle motivo a motivo
    addSheet(
      workbook,
      "Detalle de rechazos",
      `Cada motivo con su revisión de origen · ${meta}`,
      [
        { header: "Fecha regreso", width: 16 },
        { header: "N° interno", width: 12 },
        { header: "PPU", width: 11 },
        { header: "Terminal", width: 24 },
        { header: "N° guía", width: 20 },
        { header: "Motivo", width: 78 },
        { header: "Componente", width: 24 },
        { header: "Área", width: 13 },
        { header: "Página", width: 9, align: "right" },
        { header: "Origen", width: 16 },
        { header: "Requiere revisión", width: 16, align: "center" },
      ],
      records.map((record) => {
        const component = classifyRejection(record.description);
        return [
          record.event.return_at ? formatDateTime(record.event.return_at) : "",
          record.event.internal_number,
          record.event.ppu,
          record.event.terminal_name,
          record.event.guide_number ?? "",
          record.description,
          component.label,
          AREA_LABELS[component.area],
          record.page_number ?? "",
          record.origin === "MANUAL"
            ? "Manual"
            : record.origin === "AUTOMATIC_EDITED"
              ? "Automático editado"
              : "Automático",
          record.requires_review ? "Sí" : "No",
        ];
      }),
    );

    // 6 · Revisiones cerradas del período
    addSheet(
      workbook,
      "Revisiones",
      `Revisiones cerradas · ${meta}`,
      [
        { header: "N° interno", width: 12 },
        { header: "PPU", width: 11 },
        { header: "Terminal", width: 24 },
        { header: "Conductor", width: 24 },
        { header: "Salida", width: 17 },
        { header: "Regreso", width: 17 },
        { header: "Resultado", width: 12 },
        { header: "N° guía", width: 20 },
        { header: "Vencimiento", width: 13 },
        { header: "Motivos", width: 9, align: "right" },
        { header: "Cerró", width: 24 },
      ],
      (closedResult.data ?? []).map((event) => [
        event.internal_number,
        event.ppu,
        event.terminal_name,
        event.driver_name,
        formatDateTime(event.departure_at),
        event.return_at ? formatDateTime(event.return_at) : "",
        event.result === "APPROVED" ? "Aprobado" : "Rechazado",
        event.guide_number ?? "",
        event.result === "APPROVED" ? formatDateOnly(event.expiration_date) : "Sin cambio",
        event.rejection_count,
        event.closed_by_name ?? "",
      ]),
    );

    // 7 · Vencimientos (estado actual de la flota)
    const EXPIRATION_LABEL: Record<string, string> = {
      VALID: "Vigente",
      EXPIRING_SOON: "Próximo a vencer",
      EXPIRED: "Vencido",
      NO_RECORD: "Sin registro",
    };
    addSheet(
      workbook,
      "Vencimientos",
      `Estado vigente por bus al generar el reporte (no depende del período) · Terminal: ${terminalName}`,
      [
        { header: "N° interno", width: 12 },
        { header: "PPU", width: 11 },
        { header: "Terminal", width: 24 },
        { header: "Vencimiento", width: 13 },
        { header: "Días restantes", width: 14, align: "right" },
        { header: "Estado", width: 18 },
        { header: "Última guía", width: 20 },
      ],
      (expirationResult.data ?? []).map((row) => [
        row.internal_number,
        row.ppu,
        terminalNameById.get(row.terminal_id) ?? "",
        formatDateOnly(row.expiration_date),
        row.days_to_expiration ?? "",
        EXPIRATION_LABEL[row.expiration_status] ?? row.expiration_status,
        row.last_guide_number ?? "",
      ]),
    );

    // 8 · No enviados
    addSheet(
      workbook,
      "No enviados",
      `Buses no enviados a planta · ${meta}`,
      [
        { header: "Fecha", width: 12 },
        { header: "N° interno", width: 12 },
        { header: "PPU", width: 11 },
        { header: "Terminal", width: 24 },
        { header: "Motivo", width: 60 },
        { header: "N° OT", width: 14 },
        { header: "Registró", width: 24 },
      ],
      (notSentResult.data ?? []).map((row) => [
        formatDateOnly(row.event_date),
        row.internal_number,
        row.ppu,
        row.terminal_name,
        row.reason,
        row.work_order_number ?? "",
        row.created_by_name ?? "",
      ]),
    );

    // Color de pestaña según el área dominante — un toque, no una fiesta
    workbook.worksheets.forEach((sheet) => {
      sheet.properties.tabColor =
        sheet.name === "Resumen" ? { argb: BRAND } : { argb: "FFE8EDF5" };
    });
    const areaSheet = workbook.getWorksheet("Componentes");
    if (areaSheet) areaSheet.properties.tabColor = { argb: AREA_COLORS["Mantención"] };

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `revision-tecnica_${todayInZone()}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    reportError("exportRevisionTecnica", error);
    return NextResponse.json(
      { error: "No fue posible generar el reporte." },
      { status: 500 },
    );
  }
}
