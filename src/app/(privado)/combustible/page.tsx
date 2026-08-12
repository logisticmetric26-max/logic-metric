import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { FuelCalendar } from "@/features/fuel/fuel-calendar";
import { formatDateOnly, todayInZone } from "@/lib/format";
import { reportError } from "@/lib/errors";
import type {
  FuelDeliveryProduct,
  FuelDeliveryScheduleViewRow,
} from "@/types/database.types";

export const metadata: Metadata = { title: "Combustible" };

interface SearchParams {
  desde?: string;
  hasta?: string;
  terminal?: string;
  producto?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function CombustiblePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.fuelCalendar.view);
  const params = await searchParams;

  const today = todayInZone();
  const fromCandidate = params.desde && DATE_PATTERN.test(params.desde) ? params.desde : today;
  const toCandidate =
    params.hasta && DATE_PATTERN.test(params.hasta) ? params.hasta : addDaysToDateOnly(fromCandidate, 13);

  const from = fromCandidate <= toCandidate ? fromCandidate : toCandidate;
  const to = fromCandidate <= toCandidate ? toCandidate : fromCandidate;

  const terminalId =
    params.terminal && context.terminals.some((terminal) => terminal.id === params.terminal)
      ? params.terminal
      : null;

  const product =
    params.producto === "FUEL" || params.producto === "ADBLUE"
      ? (params.producto as FuelDeliveryProduct)
      : null;

  const supabase = await createClient();

  let items: FuelDeliveryScheduleViewRow[];

  try {
    let query = supabase
      .from("fuel_delivery_schedule_view")
      .select("*")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date")
      .order("reception_window")
      .order("product_type")
      .order("created_at");

    if (terminalId) query = query.eq("terminal_id", terminalId);
    if (product) query = query.eq("product_type", product);

    const { data, error } = await query;
    if (error) throw error;

    items = (data ?? []) as FuelDeliveryScheduleViewRow[];
  } catch (error) {
    reportError("fuelCalendarPage", error);
    return <ErrorState description="No fue posible cargar la agenda de combustible." />;
  }

  const rangeLabel =
    from === to ? formatDateOnly(from) : `${formatDateOnly(from)} a ${formatDateOnly(to)}`;

  return (
    <FuelCalendar
      items={items}
      terminals={context.terminals.map((terminal) => ({
        id: terminal.id,
        name: terminal.name,
      }))}
      canCreate={context.permissions.includes(PERMISSIONS.fuelCalendar.create)}
      canEdit={context.permissions.includes(PERMISSIONS.fuelCalendar.edit)}
      canConfirm={context.permissions.includes(PERMISSIONS.fuelCalendar.confirm)}
      rangeLabel={rangeLabel}
      from={from}
      to={to}
      today={today}
    />
  );
}

function addDaysToDateOnly(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
  next.setDate(next.getDate() + days);
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}
