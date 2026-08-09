import type { Metadata } from "next";
import Link from "next/link";
import { FileX2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/card";
import { AnalysisStatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { FilterBar, FilterDate, FilterSelect, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import {
  CardList,
  ResponsiveTable,
  RowCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Rechazados" };

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  terminal?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

/** §36 · Revisiones cerradas con resultado RECHAZADO. */
export default async function RechazadosPage({
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
      "id, internal_number, ppu, terminal_name, return_at, guide_number, rejection_count, needs_review_count, analysis_status",
      { count: "planned" },
    )
    .eq("status", "CLOSED")
    .eq("result", "REJECTED")
    .order("return_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const upperPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${upperPattern},guide_number.ilike.${upperPattern}`,
    );
  }

  if (params.terminal) query = query.eq("terminal_id", params.terminal);
  if (params.desde) query = query.gte("return_at", `${params.desde}T00:00:00`);
  if (params.hasta) query = query.lte("return_at", `${params.hasta}T23:59:59`);

  const { data, count, error } = await query;

  if (error) {
    reportError("rechazadosPage", error);
    return <ErrorState description="No fue posible obtener las revisiones rechazadas." />;
  }

  const events = data ?? [];
  const activeFilterCount = [params.q, params.terminal, params.desde, params.hasta].filter(
    Boolean,
  ).length;

  return (
    <Card>
      <FilterBar
        activeCount={activeFilterCount}
        search={<SearchField placeholder="Buscar por PPU, número interno o guía…" />}
      >
        {context.terminals.length > 1 && (
          <FilterSelect
            paramName="terminal"
            label="Terminal"
            options={context.terminals.map((terminal) => ({
              value: terminal.id,
              label: terminal.name,
            }))}
          />
        )}
        <FilterDate paramName="desde" label="Regreso desde" />
        <FilterDate paramName="hasta" label="Regreso hasta" />
      </FilterBar>

      {events.length === 0 ? (
        <EmptyState
          icon={<FileX2 className="size-5" aria-hidden />}
          title={
            activeFilterCount > 0
              ? "Ninguna revisión rechazada coincide con los filtros"
              : "No hay revisiones rechazadas"
          }
          description={
            activeFilterCount > 0
              ? "Modifique la búsqueda o limpie los filtros aplicados."
              : "Las revisiones cerradas con resultado rechazado aparecerán aquí."
          }
        />
      ) : (
        <>
          <ResponsiveTable
            table={
              <Table>
                <THead>
                  <TH>N.º interno</TH>
                  <TH>PPU</TH>
                  <TH>Terminal</TH>
                  <TH>Regreso</TH>
                  <TH>N.º guía</TH>
                  <TH align="center">Motivos</TH>
                  <TH>Análisis</TH>
                  <TH align="right">Acción</TH>
                </THead>
                <TBody>
                  {events.map((event) => (
                    <TR key={event.id}>
                      <TD className="font-medium">{event.internal_number}</TD>
                      <TD className="font-mono text-xs">{event.ppu}</TD>
                      <TD className="text-ink-secondary">{event.terminal_name}</TD>
                      <TD className="whitespace-nowrap text-ink-secondary">
                        {formatDateTime(event.return_at)}
                      </TD>
                      <TD>
                        <Badge tone="neutral">{event.guide_number ?? "—"}</Badge>
                      </TD>
                      <TD align="center">
                        <span className="tabular-nums">{event.rejection_count}</span>
                        {event.needs_review_count > 0 && (
                          <span className="ml-1.5 text-xs text-warning-700">
                            ({event.needs_review_count} por revisar)
                          </span>
                        )}
                      </TD>
                      <TD>
                        <AnalysisStatusBadge status={event.analysis_status} />
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/revision-tecnica/detalle/${event.id}`}
                          className="text-sm font-medium text-brand-700 hover:text-brand-800"
                        >
                          Ver detalle
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            }
            cards={
              <CardList>
                {events.map((event) => (
                  <Link key={event.id} href={`/revision-tecnica/detalle/${event.id}`}>
                    <RowCard
                      title={`${event.internal_number} · ${event.ppu}`}
                      subtitle={`${event.terminal_name} · ${formatDateTime(event.return_at)}`}
                      badge={<AnalysisStatusBadge status={event.analysis_status} />}
                      fields={[
                        { label: "N.º guía", value: event.guide_number ?? "—" },
                        {
                          label: "Motivos",
                          value:
                            event.needs_review_count > 0
                              ? `${event.rejection_count} (${event.needs_review_count} por revisar)`
                              : event.rejection_count,
                        },
                      ]}
                    />
                  </Link>
                ))}
              </CardList>
            }
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </>
      )}
    </Card>
  );
}
