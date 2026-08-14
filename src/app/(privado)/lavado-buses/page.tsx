import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { BusWashBoard, type BusWashListRow } from "@/features/bus-wash/bus-wash-board";
import { reportError } from "@/lib/errors";
import { todayInZone } from "@/lib/format";

export const metadata: Metadata = { title: "Lavado Buses" };

interface SearchParams {
  fecha?: string;
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

  const supabase = await createClient();
  let rows: BusWashListRow[];
  let existingRecordCount = 0;

  try {
    const [
      { data: fleet, error: fleetError },
      { data: records, error: recordsError },
      { data: previousDayRecords, error: previousDayRecordsError },
      { count: recordCount, error: recordCountError },
    ] =
      await Promise.all([
        supabase
          .from("fleet_view")
          .select("id, internal_number, ppu, terminal_id, terminal_name, active, zone")
          .order("zone", { ascending: true, nullsFirst: false })
          .order("internal_number"),
        supabase
          .from("bus_wash_records")
          .select("fleet_id, bm_completed, body_wash_completed, in_repair, no_wash, updated_at")
          .eq("record_date", date),
        supabase
          .from("bus_wash_records")
          .select("fleet_id, body_wash_completed")
          .eq("record_date", previousDate)
          .eq("body_wash_completed", true),
        supabase
          .from("bus_wash_records")
          .select("id", { count: "exact", head: true })
          .eq("record_date", date),
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
  } catch (error) {
    reportError("busWashPage", error);
    return <ErrorState description="No fue posible cargar el control diario de lavado de buses." />;
  }

  return (
    <BusWashBoard
      initialRows={rows}
      date={date}
      existingRecordCount={existingRecordCount}
      canEdit={context.permissions.includes(PERMISSIONS.busWash.edit)}
    />
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
