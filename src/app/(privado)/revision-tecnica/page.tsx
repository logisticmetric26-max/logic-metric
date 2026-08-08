import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { SummaryDashboard } from "@/features/technical-reviews/summary-dashboard";
import {
  aggregateRejections,
  fetchRejectionRecords,
} from "@/features/technical-reviews/analytics";
import { formatDateOnly } from "@/lib/format";
import { buildSearchParams } from "@/lib/utils";
import { reportError } from "@/lib/errors";
import type { TechnicalReviewSummary } from "@/types/database.types";

export const metadata: Metadata = { title: "Resumen" };

interface SearchParams {
  desde?: string;
  hasta?: string;
  terminal?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * §17, §28 · Resumen operacional.
 *
 * Los conteos los calcula `technical_review_summary` y el análisis de motivos
 * sale de las revisiones rechazadas del período. Ambos corren con la sesión del
 * usuario (RLS), así que ningún indicador puede incluir terminales ajenos.
 */
export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.technicalReview.view);
  const params = await searchParams;

  const from = params.desde && DATE_PATTERN.test(params.desde) ? params.desde : null;
  const to = params.hasta && DATE_PATTERN.test(params.hasta) ? params.hasta : null;

  // Sólo se acepta un terminal que el usuario tenga autorizado; RLS lo
  // rechazaría igualmente, pero así el filtro no queda en un estado imposible.
  const terminalId =
    params.terminal && context.terminals.some((terminal) => terminal.id === params.terminal)
      ? params.terminal
      : null;

  const supabase = await createClient();

  // Los datos se resuelven dentro del try; el JSX queda fuera para que un error
  // de render no pase de largo por el catch (los componentes no se ejecutan al
  // construir el JSX).
  let summary: TechnicalReviewSummary;
  let analytics: ReturnType<typeof aggregateRejections>;

  try {
    const [{ data: summaryData, error: summaryError }, records] = await Promise.all([
      supabase.rpc("technical_review_summary", {
        p_from: from,
        p_to: to,
        p_terminal_id: terminalId,
      }),
      fetchRejectionRecords(supabase, { from, to, terminalId }),
    ]);

    if (summaryError) throw summaryError;

    summary = summaryData as TechnicalReviewSummary;
    analytics = aggregateRejections(records);
  } catch (error) {
    reportError("resumenPage", error);
    return <ErrorState description="No fue posible calcular los indicadores." />;
  }

  const periodLabel =
    from && to
      ? `${formatDateOnly(from)} a ${formatDateOnly(to)}`
      : from
        ? `Desde ${formatDateOnly(from)}`
        : to
          ? `Hasta ${formatDateOnly(to)}`
          : "Histórico completo";

  // El Excel se descarga con exactamente los filtros vigentes
  const exportQuery = buildSearchParams({
    desde: from,
    hasta: to,
    terminal: terminalId,
  });

  return (
    <SummaryDashboard
      summary={summary}
      analytics={analytics}
      terminals={context.terminals.map((terminal) => ({
        id: terminal.id,
        name: terminal.name,
      }))}
      canCreate={context.permissions.includes(PERMISSIONS.technicalReview.create)}
      periodLabel={periodLabel}
      exportHref={`/api/reports/revision-tecnica${exportQuery ? `?${exportQuery}` : ""}`}
    />
  );
}
