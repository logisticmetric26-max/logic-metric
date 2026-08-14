import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { reportError } from "@/lib/errors";
import { formatDateOnly, todayInZone } from "@/lib/format";
import { PdfPage, renderPdf, PAGE_WIDTH } from "@/lib/pdf";

/**
 * §Lavado · PDF de pendientes, generado en el servidor.
 *
 * Devuelve un archivo `.pdf` de UNA página. No es una vista para imprimir: es
 * el archivo, listo para adjuntar a un correo o guardar en una carpeta.
 *
 * Corre con la sesión del usuario, así que RLS decide qué buses ve: nadie puede
 * pedir el PDF de un terminal ajeno cambiando el parámetro de la URL.
 */
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CYCLE_DAYS = 2;

export async function GET(request: Request) {
  const context = await requirePermission(PERMISSIONS.busWash.view);
  const params = new URL(request.url).searchParams;

  const kind = params.get("tipo") === "carroceria" ? "carroceria" : "bm";
  const requested = params.get("fecha");
  const date = requested && DATE_PATTERN.test(requested) ? requested : previousDay(todayInZone());

  const requestedTerminal = params.get("terminal");
  const terminalId =
    requestedTerminal && context.terminals.some((terminal) => terminal.id === requestedTerminal)
      ? requestedTerminal
      : null;

  const terminalName = terminalId
    ? (context.terminals.find((terminal) => terminal.id === terminalId)?.name ?? "")
    : "Todos mis terminales";

  try {
    const supabase = await createClient();

    // Carrocería se mira sobre la ventana del ciclo: la regla es que ningún bus
    // pase más de dos días sin lavado exterior, así que uno lavado anteayer no
    // está pendiente hoy. B&M es diario.
    const windowStart = kind === "bm" ? date : shiftDays(date, -(CYCLE_DAYS - 1));

    let fleetQuery = supabase
      .from("fleet_view")
      .select("id, internal_number, ppu, zone")
      .eq("active", true)
      .order("internal_number");

    let recordsQuery = supabase
      .from("bus_wash_records")
      .select("fleet_id, bm_completed, body_wash_completed, in_repair, no_wash, record_date")
      .gte("record_date", windowStart)
      .lte("record_date", date);

    let rainQuery = supabase
      .from("bus_wash_rain_days")
      .select("reason")
      .eq("record_date", date);

    if (terminalId) {
      fleetQuery = fleetQuery.eq("terminal_id", terminalId);
      recordsQuery = recordsQuery.eq("terminal_id", terminalId);
      rainQuery = rainQuery.eq("terminal_id", terminalId);
    }

    const [{ data: fleet, error: fleetError }, { data: records, error: recordsError }, { data: rain }] =
      await Promise.all([fleetQuery, recordsQuery, rainQuery]);

    if (fleetError) throw fleetError;
    if (recordsError) throw recordsError;

    const rainReason = rain?.[0]?.reason ?? null;

    const byFleet = new Map<string, { bm: boolean; body: boolean; blocked: boolean }>();
    for (const record of records ?? []) {
      const previo = byFleet.get(record.fleet_id) ?? { bm: false, body: false, blocked: false };
      byFleet.set(record.fleet_id, {
        bm: previo.bm || (record.record_date === date && record.bm_completed),
        body: previo.body || record.body_wash_completed,
        blocked:
          previo.blocked || (record.record_date === date && (record.in_repair || record.no_wash)),
      });
    }

    // Con día de lluvia la carrocería no se exige: no hay pendientes que
    // reclamar, y el PDF lo dice en cabecera como respaldo.
    const pending =
      kind === "carroceria" && rainReason
        ? []
        : (fleet ?? [])
            .filter((bus) => (bus.zone ?? "").trim().toUpperCase() !== "REDVAN")
            .filter((bus) => {
              const record = byFleet.get(bus.id);
              // Un bus en reparación o «no se lava» no está pendiente: mandar a
              // alguien a buscar un bus que no está es peor que no dar la lista.
              if (record?.blocked) return false;
              return kind === "bm" ? !record?.bm : !record?.body;
            })
            .map((bus) => ({ ppu: bus.ppu, internal: bus.internal_number }));

    const pdf = buildSheet({ kind, date, terminalName, pending, rainReason });
    const fileName = `PENDIENTES_${kind === "bm" ? "BM" : "CARROCERIA"}_${date}.pdf`;

    return new NextResponse(pdf as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    reportError("busWashPendingPdf", error);
    return NextResponse.json({ error: "No fue posible generar el PDF." }, { status: 500 });
  }
}

/**
 * Dibuja la hoja.
 *
 * Cabe SIEMPRE en una página porque las columnas y el interlineado se eligen
 * según cuántos buses hay. Una rejilla fija obligaría a una segunda hoja en
 * cuanto la lista creciera, y una segunda hoja se traspapela.
 */
function buildSheet({
  kind,
  date,
  terminalName,
  pending,
  rainReason,
}: {
  kind: "bm" | "carroceria";
  date: string;
  terminalName: string;
  pending: { ppu: string; internal: string }[];
  rainReason: string | null;
}): Uint8Array {
  const page = new PdfPage();
  const M = 44;
  const esBm = kind === "bm";
  const titulo = esBm ? "BARRIDO Y MOPEADO" : "LAVADO DE CARROCERIA";

  // --- Cabecera -------------------------------------------------------------
  page.text("PENDIENTE DE ASEO", { x: M, y: 52, size: 8, font: "Helvetica-Bold", gray: 0.45 });
  page.text(titulo, { x: M, y: 76, size: 21, font: "Helvetica-Bold" });
  page.text(`${terminalName}   ·   Dia de referencia ${formatDateOnly(date)}`, {
    x: M,
    y: 95,
    size: 9.5,
    gray: 0.35,
  });

  // La cifra grande a la derecha: es lo primero que se mira
  const total = String(pending.length);
  const anchoTotal = PdfPage.widthOf(total, 30, "Helvetica-Bold");
  page.text(total, { x: PAGE_WIDTH - M - anchoTotal, y: 82, size: 30, font: "Helvetica-Bold" });
  const etiqueta = pending.length === 1 ? "BUS PENDIENTE" : "BUSES PENDIENTES";
  page.text(etiqueta, {
    x: PAGE_WIDTH - M - PdfPage.widthOf(etiqueta, 7.5, "Helvetica-Bold"),
    y: 95,
    size: 7.5,
    font: "Helvetica-Bold",
    gray: 0.45,
  });

  page.line({ x1: M, y1: 106, x2: PAGE_WIDTH - M, y2: 106, width: 1.4, gray: 0.1 });

  let y = 128;

  if (rainReason && !esBm) {
    page.rect({ x: M, y: y - 12, width: PAGE_WIDTH - M * 2, height: 30, gray: 0.94 });
    page.text("DIA DE LLUVIA REGISTRADO", {
      x: M + 8,
      y: y - 1,
      size: 8,
      font: "Helvetica-Bold",
      gray: 0.25,
    });
    page.text(recorta(rainReason, 92), { x: M + 8, y: y + 11, size: 8.5, gray: 0.35 });
    y += 40;
  }

  // --- Listado --------------------------------------------------------------
  if (pending.length === 0) {
    page.text("Sin pendientes: toda la flota quedo registrada en esta faena.", {
      x: M,
      y: y + 40,
      size: 11,
      gray: 0.45,
    });
  } else {
    const disponible = PAGE_HEIGHT_FOOTER - y;
    // Se elige la rejilla más holgada que quepa
    const columnas = pending.length <= 30 ? 3 : pending.length <= 72 ? 4 : pending.length <= 132 ? 5 : 6;
    const filas = Math.ceil(pending.length / columnas);
    const alto = Math.min(18, Math.max(9, disponible / filas));
    const tamano = alto >= 15 ? 11 : alto >= 12 ? 9.5 : 8;
    const anchoColumna = (PAGE_WIDTH - M * 2) / columnas;

    pending.forEach((bus, indice) => {
      const columna = Math.floor(indice / filas);
      const fila = indice % filas;
      const x = M + columna * anchoColumna;
      const filaY = y + fila * alto;

      page.text(bus.ppu, { x, y: filaY, size: tamano, font: "Helvetica-Bold" });
      const interno = bus.internal;
      page.text(interno, {
        x: x + anchoColumna - 16 - PdfPage.widthOf(interno, tamano - 1.5, "Helvetica"),
        y: filaY,
        size: tamano - 1.5,
        gray: 0.5,
      });
      page.line({
        x1: x,
        y1: filaY + 3,
        x2: x + anchoColumna - 12,
        y2: filaY + 3,
        width: 0.4,
        gray: 0.86,
      });
    });
  }

  // --- Pie ------------------------------------------------------------------
  page.line({ x1: M, y1: 748, x2: PAGE_WIDTH - M, y2: 748, width: 0.6, gray: 0.8 });
  page.text(
    esBm
      ? "Barrido y mopeado: se realiza a toda la flota, todos los dias."
      : "Lavado de carroceria: cada bus al menos una vez cada dos dias.",
    { x: M, y: 760, size: 7.5, gray: 0.5 },
  );
  const marca = "Logic Metric";
  page.text(marca, {
    x: PAGE_WIDTH - M - PdfPage.widthOf(marca, 7.5, "Helvetica"),
    y: 760,
    size: 7.5,
    gray: 0.5,
  });

  return renderPdf(page, `Pendientes ${titulo} ${date}`);
}

/** Altura útil antes del pie. */
const PAGE_HEIGHT_FOOTER = 736;

function recorta(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function previousDay(value: string): string {
  return shiftDays(value, -1);
}

function shiftDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1, 12);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
