import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/feedback";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { BadLoadsManager } from "@/features/bad-loads/bad-loads-manager";
import { filterDispensersByTerminalAccess } from "@/features/bad-loads/utils";
import { escapeLikePattern, isValidTimeText, parsePageParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Historico de malas cargas" };

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

export default async function HistoricoMalasCargasPage({
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
    .not("exported_at", "is", null)
    .order("exported_at", { ascending: false })
    .order("load_date", { ascending: false })
    .order("load_time", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const textPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${textPattern},reader_code.ilike.${textPattern},dispenser_code.ilike.${textPattern},dispenser_terminal_name.ilike.${textPattern},dispenser_terminal_code.ilike.${textPattern},created_by_name.ilike.${textPattern},export_file_name.ilike.${textPattern}`,
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

  const [{ data: items, count, error }, { data: dispensers, error: dispenserError }] =
    await Promise.all([
      query,
      supabase
        .from("dispensers")
        .select("id, code, terminal_name, terminal_code, active")
        .order("code"),
    ]);

  if (error || dispenserError) {
    reportError("badLoadsHistoryPage", error ?? dispenserError);
    return <ErrorState description="No fue posible obtener el historico de malas cargas." />;
  }

  const accessibleDispensers = filterDispensersByTerminalAccess(dispensers ?? [], context);
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
      canCreate={false}
      canEdit={false}
      canDelete={false}
      activeFilterCount={activeFilterCount}
      mode="history"
      todayDate=""
      todayTotalLiters={0}
      todayTotalsByDispenser={[]}
      exportFilters={{}}
    />
  );
}
