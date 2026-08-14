import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/feedback";
import { BusWashExportsHistory } from "@/features/bus-wash/bus-wash-exports-history";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Historico de lavado buses" };

const PAGE_SIZE = 25;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SearchParams {
  q?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

export default async function HistoricoLavadoBusesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission(PERMISSIONS.busWash.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("bus_wash_exports_view")
    .select("*", { count: "planned" })
    .order("generated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const pattern = `%${escapeLikePattern(params.q.trim())}%`;
    query = query.or(
      `file_name.ilike.${pattern},zone.ilike.${pattern},generated_by_name.ilike.${pattern}`,
    );
  }

  if (params.desde && DATE_PATTERN.test(params.desde)) query = query.gte("record_date", params.desde);
  if (params.hasta && DATE_PATTERN.test(params.hasta)) query = query.lte("record_date", params.hasta);

  const { data: items, count, error } = await query;

  if (error) {
    reportError("busWashHistoryPage", error);
    return <ErrorState description="No fue posible obtener el historico de exportaciones de lavado." />;
  }

  const activeFilterCount = [params.q, params.desde, params.hasta].filter(Boolean).length;

  return (
    <BusWashExportsHistory
      items={items ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      activeFilterCount={activeFilterCount}
    />
  );
}
