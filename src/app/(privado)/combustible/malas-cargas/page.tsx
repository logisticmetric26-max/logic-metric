import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/feedback";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { BadLoadsManager } from "@/features/bad-loads/bad-loads-manager";
import type { BadLoadTodaySummary } from "@/features/bad-loads/types";
import { filterDispensersByTerminalAccess } from "@/features/bad-loads/utils";
import { escapeLikePattern, isValidTimeText, parsePageParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Malas cargas" };

const PAGE_SIZE = 25;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SearchParams {
  q?: string;
  desde?: string;
  hasta?: string;
  hora_desde?: string;
  hora_hasta?: string;
  surtidor?: string;
  pagina?: string;
}

export default async function MalasCargasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.badLoads.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("bad_fuel_loads_view")
    .select("*", { count: "planned" })
    .is("exported_at", null)
    .order("load_date", { ascending: false })
    .order("load_time", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const textPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${textPattern},reader_code.ilike.${textPattern},dispenser_code.ilike.${textPattern},dispenser_terminal_name.ilike.${textPattern},dispenser_terminal_code.ilike.${textPattern},created_by_name.ilike.${textPattern}`,
    );
  }

  if (params.desde && DATE_PATTERN.test(params.desde)) query = query.gte("load_date", params.desde);
  if (params.hasta && DATE_PATTERN.test(params.hasta)) query = query.lte("load_date", params.hasta);
  if (params.hora_desde && isValidTimeText(params.hora_desde)) {
    query = query.gte("load_time", params.hora_desde);
  }
  if (params.hora_hasta && isValidTimeText(params.hora_hasta)) {
    query = query.lte("load_time", params.hora_hasta);
  }
  if (params.surtidor) query = query.eq("dispenser_id", params.surtidor);

  const todayDate = getChileTodayDate();

  const [
    { data: items, count, error },
    { data: dispensers, error: dispenserError },
    { data: todayRows, error: todayError },
  ] =
    await Promise.all([
      query,
      supabase
        .from("dispensers")
        .select("id, code, terminal_name, terminal_code, active")
        .order("code"),
      supabase
        .from("bad_fuel_loads_view")
        .select("dispenser_id, dispenser_code, dispenser_terminal_name, dispenser_terminal_code, liters")
        .is("exported_at", null)
        .eq("load_date", todayDate),
    ]);

  if (error || dispenserError || todayError) {
    reportError("badLoadsPage", error ?? dispenserError ?? todayError);
    return <ErrorState description="No fue posible obtener el listado de malas cargas." />;
  }

  const accessibleDispensers = filterDispensersByTerminalAccess(dispensers ?? [], context);
  const todayTotalsByDispenser = buildTodaySummary(todayRows ?? []);
  const todayTotalLiters = todayTotalsByDispenser.reduce((sum, item) => sum + item.liters, 0);
  const activeFilterCount = [
    params.q,
    params.desde,
    params.hasta,
    params.hora_desde,
    params.hora_hasta,
    params.surtidor,
  ].filter(Boolean).length;

  return (
    <BadLoadsManager
      items={items ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      dispensers={accessibleDispensers}
      canCreate={context.permissions.includes(PERMISSIONS.badLoads.create)}
      canEdit={context.permissions.includes(PERMISSIONS.badLoads.edit)}
      canDelete={context.permissions.includes(PERMISSIONS.badLoads.delete)}
      activeFilterCount={activeFilterCount}
      mode="active"
      todayDate={todayDate}
      todayTotalLiters={todayTotalLiters}
      todayTotalsByDispenser={todayTotalsByDispenser}
      exportFilters={{
        q: params.q,
        desde: params.desde,
        hasta: params.hasta,
        hora_desde: params.hora_desde,
        hora_hasta: params.hora_hasta,
        surtidor: params.surtidor,
      }}
    />
  );
}

function getChileTodayDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function buildTodaySummary(
  rows: Array<{
    dispenser_id: string;
    dispenser_code: string;
    dispenser_terminal_name: string;
    dispenser_terminal_code: string;
    liters: number;
  }>,
): BadLoadTodaySummary[] {
  const totals = new Map<string, BadLoadTodaySummary>();

  for (const row of rows) {
    const current = totals.get(row.dispenser_id);

    if (current) {
      current.liters += row.liters;
      continue;
    }

    totals.set(row.dispenser_id, {
      dispenser_id: row.dispenser_id,
      dispenser_code: row.dispenser_code,
      terminal_name: row.dispenser_terminal_name,
      terminal_code: row.dispenser_terminal_code,
      liters: row.liters,
    });
  }

  return [...totals.values()].sort((left, right) => right.liters - left.liters);
}
