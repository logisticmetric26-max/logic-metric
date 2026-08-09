import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { SummaryDashboard } from "@/features/technical-reviews/summary-dashboard";
import {
  aggregateExpirations,
  aggregateHistory,
  aggregateNotSent,
  aggregateOpenReviews,
  aggregateRejections,
  fetchClosedEvents,
  fetchExpirations,
  fetchNotSent,
  fetchOpenReviews,
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
  let openReviews: ReturnType<typeof aggregateOpenReviews>;
  let notSent: ReturnType<typeof aggregateNotSent>;
  let expirations: ReturnType<typeof aggregateExpirations>;
  let history: ReturnType<typeof aggregateHistory>;

  // El nombre del terminal ya está en el contexto: evita una consulta extra
  // para acompañar los vencimientos, que sólo traen el id.
  const terminalNames = new Map(context.terminals.map((terminal) => [terminal.id, terminal.name]));
  const filters = { from, to, terminalId };

  try {
    // Una consulta por subsección, todas en paralelo y todas bajo RLS.
    const [
      { data: summaryData, error: summaryError },
      rejectionRecords,
      openRecords,
      notSentRecords,
      expirationRecords,
      closedRecords,
    ] = await Promise.all([
      supabase.rpc("technical_review_summary", {
        p_from: from,
        p_to: to,
        p_terminal_id: terminalId,
      }),
      fetchRejectionRecords(supabase, filters),
      fetchOpenReviews(supabase, filters),
      fetchNotSent(supabase, filters),
      fetchExpirations(supabase, { terminalId }, terminalNames),
      fetchClosedEvents(supabase, filters),
    ]);

    if (summaryError) throw summaryError;

    summary = summaryData as TechnicalReviewSummary;
    analytics = aggregateRejections(rejectionRecords);
    openReviews = aggregateOpenReviews(openRecords);
    notSent = aggregateNotSent(notSentRecords);
    expirations = aggregateExpirations(expirationRecords);
    history = aggregateHistory(closedRecords);
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
      openReviews={openReviews}
      notSent={notSent}
      expirations={expirations}
      history={history}
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
