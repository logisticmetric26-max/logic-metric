import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { BusWashBoard, type BusWashListRow } from "@/features/bus-wash/bus-wash-board";
import { reportError } from "@/lib/errors";
import { todayInZone } from "@/lib/format";
import { computeCompliance, type TerminalCompliance } from "@/features/bus-wash/compliance";
import { BusWashCompliancePanel } from "@/features/bus-wash/compliance-panel";

export const metadata: Metadata = { title: "Lavado Buses" };

interface SearchParams {
  fecha?: string;
  terminal?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function LavadoBusesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.busWash.view);
  const params = await searchParams;
  const date = params.fecha && DATE_PATTERN.test(params.fecha) ? params.fecha : todayInZone();
  const previousDate = subtractDaysFromDateOnly(date, 1);

  // Sólo se acepta un terminal que el usuario tenga autorizado. RLS lo
  // rechazaría igualmente, pero así el filtro no queda en un estado imposible
  // y el desplegable nunca ofrece un terminal ajeno.
  const terminalOptions = context.terminals.map((terminal) => ({
    id: terminal.id,
    name: terminal.name,
  }));

  // Con un solo terminal autorizado no hay nada que elegir: se fija a ése.
  const requestedTerminal =
    params.terminal && terminalOptions.some((terminal) => terminal.id === params.terminal)
      ? params.terminal
      : null;
  const terminalId = requestedTerminal ?? (terminalOptions.length === 1 ? terminalOptions[0].id : null);

  const supabase = await createClient();
  let rows: BusWashListRow[];
  let existingRecordCount = 0;
  let existingZones: string[] = [];
  let compliance: TerminalCompliance[] = [];
  let targetPercent = 90;

  try {
    const [
      { data: fleet, error: fleetError },
      { data: records, error: recordsError },
      { data: previousDayRecords, error: previousDayRecordsError },
      { count: recordCount, error: recordCountError },
    ] =
      await Promise.all([
        // Filtrar en la BASE y no en el navegador: sin esto se traían los 937
        // buses de todos los terminales en cada carga, y era la causa de que la
        // pantalla tardara en responder.
        withTerminal(
          supabase
            .from("fleet_view")
            .select("id, internal_number, ppu, terminal_id, terminal_name, active, zone")
            .order("zone", { ascending: true, nullsFirst: false })
            .order("internal_number"),
          terminalId,
        ),
        withTerminal(
          supabase
            .from("bus_wash_records")
            .select("fleet_id, bm_completed, body_wash_completed, in_repair, no_wash, updated_at")
            .eq("record_date", date),
          terminalId,
        ),
        withTerminal(
          supabase
            .from("bus_wash_records")
            .select("fleet_id, body_wash_completed")
            .eq("record_date", previousDate)
            .eq("body_wash_completed", true),
          terminalId,
        ),
        withTerminal(
          supabase
            .from("bus_wash_records")
            .select("id", { count: "exact", head: true })
            .eq("record_date", date),
          terminalId,
        ),
      ]);

    if (fleetError) throw fleetError;
    if (recordsError) throw recordsError;
    if (previousDayRecordsError) throw previousDayRecordsError;
    if (recordCountError) throw recordCountError;

    existingRecordCount = recordCount ?? 0;

    const recordMap = new Map((records ?? []).map((record) => [record.fleet_id, record]));
    const previousDayBodyWashSet = new Set(
      (previousDayRecords ?? []).map((record) => record.fleet_id),
    );
    rows = (fleet ?? [])
      .filter((bus) => normalizeZone(bus.zone) !== "REDVAN")
      .map((bus) => {
        const record = recordMap.get(bus.id);
        const blockedByStatus = record?.in_repair || record?.no_wash;

        return {
          id: bus.id,
          internal_number: bus.internal_number,
          ppu: bus.ppu,
          terminal_id: bus.terminal_id,
          terminal_name: bus.terminal_name,
          zone: bus.zone,
          active: bus.active,
          bm_completed: blockedByStatus ? false : (record?.bm_completed ?? false),
          body_wash_completed: blockedByStatus ? false : (record?.body_wash_completed ?? false),
          in_repair: record?.in_repair ?? false,
          no_wash: record?.in_repair ? false : (record?.no_wash ?? false),
          had_body_wash_yesterday: previousDayBodyWashSet.has(bus.id),
          updated_at: record?.updated_at ?? null,
        };
      });

    existingZones = [...new Set(rows.filter(hasAnyStatus).map((row) => normalizeZoneLabel(row.zone)))].sort();

    // Meta y justificaciones de lluvia: dos lecturas pequeñas que no bloquean
    // el listado y se piden a la vez.
    const [{ data: target }, { data: rainDays }] = await Promise.all([
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "bus_wash.daily_target_percent")
        .maybeSingle(),
      withTerminal(
        supabase.from("bus_wash_rain_days").select("terminal_id, reason").eq("record_date", date),
        terminalId,
      ),
    ]);

    const parsedTarget = Number(target?.value ?? 90);
    targetPercent = Number.isFinite(parsedTarget) ? parsedTarget : 90;

    compliance = computeCompliance(rows, {
      targetPercent,
      rainReasons: new Map((rainDays ?? []).map((day) => [day.terminal_id, day.reason])),
    });
  } catch (error) {
    reportError("busWashPage", error);
    return <ErrorState description="No fue posible cargar el control diario de lavado de buses." />;
  }

  return (
    <>
      <BusWashCompliancePanel
        terminals={terminalOptions}
        compliance={compliance}
        targetPercent={targetPercent}
      />
      <BusWashBoard
      initialRows={rows}
      date={date}
      existingRecordCount={existingRecordCount}
      existingZones={existingZones}
        canEdit={context.permissions.includes(PERMISSIONS.busWash.edit)}
      />
    </>
  );
}

function subtractDaysFromDateOnly(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
  date.setDate(date.getDate() - days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeZone(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeZoneLabel(zone: string | null | undefined) {
  return zone?.trim() || "Sin zona";
}

function hasAnyStatus(row: Pick<BusWashListRow, "bm_completed" | "body_wash_completed" | "in_repair" | "no_wash">) {
  return row.bm_completed || row.body_wash_completed || row.in_repair || row.no_wash;
}

/**
 * Aplica el filtro de terminal a una consulta, si lo hay.
 *
 * Se define una vez y se usa en las cuatro consultas: repetir el `eq` a mano en
 * cada una es justo la forma de que un día se olvide en la de arriba y la
 * pantalla mezcle terminales sin que nadie lo note.
 */
function withTerminal<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  terminalId: string | null,
): T {
  return terminalId ? query.eq("terminal_id", terminalId) : query;
}
