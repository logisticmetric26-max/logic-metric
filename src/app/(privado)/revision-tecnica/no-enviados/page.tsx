import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { NotSentList } from "@/features/technical-reviews/not-sent-list";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "No enviados" };

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  terminal?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

/** §29, §35 · Historial de buses no enviados a planta. */
export default async function NoEnviadosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.notSent.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from("technical_review_not_sent_view")
    .select("*", { count: "exact" })
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // §65 · búsqueda por PPU, número interno, OT y motivo
  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const upperPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    const anyPattern = `%${escapeLikePattern(raw)}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${upperPattern},work_order_number.ilike.${upperPattern},reason.ilike.${anyPattern}`,
    );
  }

  if (params.terminal) query = query.eq("terminal_id", params.terminal);
  if (params.desde) query = query.gte("event_date", params.desde);
  if (params.hasta) query = query.lte("event_date", params.hasta);

  const { data, count, error } = await query;

  if (error) {
    reportError("noEnviadosPage", error);
    return <ErrorState description="No fue posible obtener los registros de no envío." />;
  }

  const activeFilterCount = [params.q, params.terminal, params.desde, params.hasta].filter(
    Boolean,
  ).length;

  return (
    <NotSentList
      records={data ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      terminals={context.terminals.map((terminal) => ({ id: terminal.id, name: terminal.name }))}
      can={{
        create: context.permissions.includes(PERMISSIONS.notSent.create),
        edit: context.permissions.includes(PERMISSIONS.notSent.edit),
        remove: context.permissions.includes(PERMISSIONS.notSent.delete),
      }}
      activeFilterCount={activeFilterCount}
    />
  );
}
