import type { Metadata } from "next";
import { ErrorState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { reportError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { BadLoadsManager } from "@/features/bad-loads/bad-loads-manager";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Malas cargas" };

const PAGE_SIZE = 25;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SearchParams {
  q?: string;
  desde?: string;
  hasta?: string;
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
    .order("load_date", { ascending: false })
    .order("load_time", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const textPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${textPattern},dispenser_code.ilike.${textPattern}`,
    );
  }

  if (params.desde && DATE_PATTERN.test(params.desde)) query = query.gte("load_date", params.desde);
  if (params.hasta && DATE_PATTERN.test(params.hasta)) query = query.lte("load_date", params.hasta);
  if (params.surtidor) query = query.eq("dispenser_id", params.surtidor);

  const [{ data: items, count, error }, { data: dispensers, error: dispenserError }] =
    await Promise.all([
      query,
      supabase.from("dispensers").select("id, code, active").order("code"),
    ]);

  if (error || dispenserError) {
    reportError("badLoadsPage", error ?? dispenserError);
    return <ErrorState description="No fue posible obtener el listado de malas cargas." />;
  }

  const activeFilterCount = [params.q, params.desde, params.hasta, params.surtidor].filter(
    Boolean,
  ).length;

  return (
    <>
      <PageHeader
        title="Malas cargas"
        description="Registro operacional de malas cargas con fecha, hora, bus, litros y surtidor."
      />
      <BadLoadsManager
        items={items ?? []}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        dispensers={dispensers ?? []}
        canCreate={context.permissions.includes(PERMISSIONS.badLoads.create)}
        canEdit={context.permissions.includes(PERMISSIONS.badLoads.edit)}
        canDelete={context.permissions.includes(PERMISSIONS.badLoads.delete)}
        activeFilterCount={activeFilterCount}
      />
    </>
  );
}
