import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { SummaryDashboard } from "@/features/technical-reviews/summary-dashboard";
import { formatDateOnly } from "@/lib/format";
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
 * §17 · Resumen operacional.
 *
 * Los conteos los calcula `technical_review_summary`, una función SQL que corre
 * como el usuario (SECURITY INVOKER): las políticas RLS filtran las filas antes
 * de contarlas, así que los indicadores no pueden incluir terminales ajenos.
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

  const { data, error } = await supabase.rpc("technical_review_summary", {
    p_from: from,
    p_to: to,
    p_terminal_id: terminalId,
  });

  if (error) {
    reportError("resumenPage", error);
    return <ErrorState description="No fue posible calcular los indicadores." />;
  }

  const summary = data as TechnicalReviewSummary;

  const periodLabel =
    from && to
      ? `${formatDateOnly(from)} a ${formatDateOnly(to)}`
      : from
        ? `Desde ${formatDateOnly(from)}`
        : to
          ? `Hasta ${formatDateOnly(to)}`
          : "Histórico completo";

  return (
    <SummaryDashboard
      summary={summary}
      terminals={context.terminals.map((terminal) => ({
        id: terminal.id,
        name: terminal.name,
      }))}
      canCreate={context.permissions.includes(PERMISSIONS.technicalReview.create)}
      periodLabel={periodLabel}
    />
  );
}
