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

  const supabase = await createClient();

  try {
    const [{ data: fleet, error: fleetError }, { data: records, error: recordsError }] =
      await Promise.all([
        supabase
          .from("fleet_view")
          .select("id, internal_number, ppu, terminal_id, terminal_name, active, zone")
          .order("zone", { ascending: true, nullsFirst: false })
          .order("internal_number"),
        supabase
          .from("bus_wash_records")
          .select("fleet_id, bm_completed, body_wash_completed, in_repair, updated_at")
          .eq("record_date", date),
      ]);

    if (fleetError) throw fleetError;
    if (recordsError) throw recordsError;

    const recordMap = new Map((records ?? []).map((record) => [record.fleet_id, record]));
    const rows: BusWashListRow[] = (fleet ?? []).map((bus) => {
      const record = recordMap.get(bus.id);

      return {
        id: bus.id,
        internal_number: bus.internal_number,
        ppu: bus.ppu,
        terminal_id: bus.terminal_id,
        terminal_name: bus.terminal_name,
        zone: bus.zone,
        active: bus.active,
        bm_completed: record?.bm_completed ?? false,
        body_wash_completed: record?.body_wash_completed ?? false,
        in_repair: record?.in_repair ?? false,
        updated_at: record?.updated_at ?? null,
      };
    });

    return (
      <BusWashBoard
        initialRows={rows}
        date={date}
        canEdit={context.permissions.includes(PERMISSIONS.busWash.edit)}
      />
    );
  } catch (error) {
    reportError("busWashPage", error);
    return <ErrorState description="No fue posible cargar el control diario de lavado de buses." />;
  }
}
