import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { OpenReviews } from "@/features/technical-reviews/open-reviews";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Envios a planta" };

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  terminal?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

/** §20 · Procesos abiertos: buses actualmente en planta. */
export default async function EnRevisionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.technicalReview.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from("technical_review_events_view")
    .select(
      "id, fleet_id, internal_number, ppu, terminal_id, terminal_name, driver_name, departure_at, created_by_name",
      { count: "planned" },
    )
    .eq("status", "OPEN")
    .order("departure_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const upperPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    const anyPattern = `%${escapeLikePattern(raw)}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${upperPattern},driver_name.ilike.${anyPattern}`,
    );
  }

  if (params.terminal) query = query.eq("terminal_id", params.terminal);
  if (params.desde) query = query.gte("departure_at", `${params.desde}T00:00:00`);
  if (params.hasta) query = query.lte("departure_at", `${params.hasta}T23:59:59`);

  const { data, count, error } = await query;

  if (error) {
    reportError("enRevisionPage", error);
    return <ErrorState description="No fue posible obtener los procesos abiertos." />;
  }

  const activeFilterCount = [params.q, params.terminal, params.desde, params.hasta].filter(
    Boolean,
  ).length;

  return (
    <OpenReviews
      events={data ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      terminals={context.terminals.map((terminal) => ({ id: terminal.id, name: terminal.name }))}
      canCreate={context.permissions.includes(PERMISSIONS.technicalReview.create)}
      canClose={context.permissions.includes(PERMISSIONS.technicalReview.close)}
      canDelete={context.permissions.includes(PERMISSIONS.technicalReview.delete)}
      activeFilterCount={activeFilterCount}
    />
  );
}
