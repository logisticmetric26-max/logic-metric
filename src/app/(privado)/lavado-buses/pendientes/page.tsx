import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { reportError } from "@/lib/errors";
import { formatDateOnly, todayInZone } from "@/lib/format";
import { PendingSheet, type PendingBus } from "@/features/bus-wash/pending-sheet";

export const metadata: Metadata = { title: "Pendientes de aseo" };

interface SearchParams {
  tipo?: string;
  fecha?: string;
  terminal?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * §Lavado · Hoja de pendientes, lista para imprimir o guardar como PDF.
 *
 * Es una PÁGINA, no un archivo generado en el servidor. El navegador ya sabe
 * convertir una página a PDF con «Guardar como PDF», y hacerlo así evita sumar
 * una librería de PDF al proyecto para producir un listado de dos columnas.
 * A cambio, el diseño de impresión se controla con CSS, que es donde mejor se
 * controla.
 *
 * Muestra los buses que NO quedaron registrados en la faena el día de
 * referencia —el día anterior por defecto—, que es justo la lista con la que se
 * sale a terreno a la mañana siguiente.
 */
export default async function PendientesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.busWash.view);
  const params = await searchParams;

  const kind = params.tipo === "carroceria" ? "carroceria" : "bm";
  const date = params.fecha && DATE_PATTERN.test(params.fecha) ? params.fecha : previousDay(todayInZone());

  const terminalId =
    params.terminal && context.terminals.some((terminal) => terminal.id === params.terminal)
      ? params.terminal
      : null;

  const supabase = await createClient();
  let pending: PendingBus[] = [];
  let terminalName = "Todos mis terminales";
  let rainReason: string | null = null;

  try {
    let fleetQuery = supabase
      .from("fleet_view")
      .select("id, internal_number, ppu, terminal_id, terminal_name, zone")
      .eq("active", true)
      .order("internal_number");

    // Carrocería se mira sobre una VENTANA de días, no sobre uno solo: la regla
    // es que ningún bus pase más de dos días sin lavado exterior, así que un bus
    // lavado anteayer no está pendiente hoy. B&M sí es diario.
    const windowStart = kind === "bm" ? date : shiftDays(date, -(CYCLE_DAYS - 1));

    let recordsQuery = supabase
      .from("bus_wash_records")
      .select("fleet_id, bm_completed, body_wash_completed, in_repair, no_wash, record_date")
      .gte("record_date", windowStart)
      .lte("record_date", date);

    let rainQuery = supabase
      .from("bus_wash_rain_days")
      .select("terminal_id, reason")
      .eq("record_date", date);

    if (terminalId) {
      fleetQuery = fleetQuery.eq("terminal_id", terminalId);
      recordsQuery = recordsQuery.eq("terminal_id", terminalId);
      rainQuery = rainQuery.eq("terminal_id", terminalId);
      terminalName = context.terminals.find((terminal) => terminal.id === terminalId)?.name ?? "";
    }

    const [{ data: fleet, error: fleetError }, { data: records, error: recordsError }, { data: rain }] =
      await Promise.all([fleetQuery, recordsQuery, rainQuery]);

    if (fleetError) throw fleetError;
    if (recordsError) throw recordsError;

    rainReason = rain?.[0]?.reason ?? null;

    // Se consolida la ventana: basta con que la faena se haya hecho UNA vez
    // dentro del ciclo para que el bus no esté pendiente.
    const byFleet = new Map<string, { bm: boolean; body: boolean; blocked: boolean }>();
    for (const record of records ?? []) {
      const previo = byFleet.get(record.fleet_id) ?? { bm: false, body: false, blocked: false };
      byFleet.set(record.fleet_id, {
        bm: previo.bm || (record.record_date === date && record.bm_completed),
        body: previo.body || record.body_wash_completed,
        // Reparación y «no se lava» sólo cuentan si son del día de referencia
        blocked:
          previo.blocked ||
          (record.record_date === date && (record.in_repair || record.no_wash)),
      });
    }

    pending = (fleet ?? [])
      // REDVAN no entra en el aseo de flota
      .filter((bus) => (bus.zone ?? "").trim().toUpperCase() !== "REDVAN")
      .filter((bus) => {
        const record = byFleet.get(bus.id);
        // Un bus en reparación o marcado «no se lava» no está pendiente: no
        // estaba disponible, y meterlo en la lista mandaría a alguien a
        // buscar un bus que no está.
        if (record?.blocked) return false;

        return kind === "bm" ? !record?.bm : !record?.body;
      })
      .map((bus) => ({
        internal_number: bus.internal_number,
        ppu: bus.ppu,
        terminal_name: bus.terminal_name,
        zone: bus.zone,
      }));
  } catch (error) {
    reportError("busWashPendingPage", error);
    return <ErrorState description="No fue posible generar la hoja de pendientes." />;
  }

  // Día de lluvia: la carrocería no se exige, así que no hay pendientes que
  // reclamar. La hoja lo dice en cabecera y sirve de respaldo del incumplimiento.
  if (kind === "carroceria" && rainReason) {
    pending = [];
  }

  return (
    <PendingSheet
      kind={kind}
      dateLabel={formatDateOnly(date)}
      terminalName={terminalName}
      buses={pending}
      rainReason={rainReason}
    />
  );
}

/** Día anterior a una fecha `yyyy-MM-dd`, sin pasar por UTC. */
function previousDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1, 12);
  date.setDate(date.getDate() - 1);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Días de ciclo de carrocería. Coincide con `bus_wash.body_wash_cycle_days`. */
const CYCLE_DAYS = 2;

/** Desplaza una fecha `yyyy-MM-dd` sin pasar por UTC. */
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
