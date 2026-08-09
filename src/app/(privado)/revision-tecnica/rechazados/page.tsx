import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BusFront,
  Clock3,
  FileText,
  FileX2,
  ListX,
  MapPin,
  Sparkles,
  UserRound,
} from "lucide-react";
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
      "id, internal_number, ppu, terminal_name, return_at, guide_number, rejection_count, needs_review_count, analysis_status, created_by_name, closed_by_name",
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
                  <TH>N. interno</TH>
                  <TH>PPU</TH>
                  <TH>Terminal</TH>
                  <TH>Regreso</TH>
                  <TH>N. guia</TH>
                  <TH align="center">Motivos</TH>
                  <TH>Analisis</TH>
                  <TH>Abrio</TH>
                  <TH>Cerro</TH>
                  <TH align="right">Accion</TH>
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
                        <Badge tone="neutral">{event.guide_number ?? "-"}</Badge>
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
                      <TD className="text-ink-muted">{event.created_by_name ?? "-"}</TD>
                      <TD className="text-ink-muted">{event.closed_by_name ?? "-"}</TD>
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
                      icon={<BusFront className="size-[19px]" aria-hidden />}
                      tone="danger"
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Bus {event.internal_number}</span>
                          <span className="rounded-md bg-fill-subtle px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-ink-secondary ring-1 ring-border">
                            {event.ppu}
                          </span>
                        </span>
                      }
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {event.terminal_name}
                        </span>
                      }
                      badge={<Badge tone="danger">Rechazado</Badge>}
                      fields={[
                        {
                          label: "Regreso",
                          value: formatDateTime(event.return_at),
                          icon: <Clock3 className="size-3" aria-hidden />,
                        },
                        {
                          label: "N.º de guía",
                          value: event.guide_number ?? "—",
                          icon: <FileText className="size-3" aria-hidden />,
                        },
                        {
                          label: "Motivos",
                          value:
                            event.needs_review_count > 0
                              ? `${event.rejection_count} (${event.needs_review_count} por revisar)`
                              : event.rejection_count,
                          icon: <ListX className="size-3" aria-hidden />,
                        },
                        {
                          label: "Análisis",
                          value: <AnalysisStatusBadge status={event.analysis_status} />,
                          icon: <Sparkles className="size-3" aria-hidden />,
                        },
                        {
                          label: "Abrió",
                          value: event.created_by_name ?? "—",
                          icon: <UserRound className="size-3" aria-hidden />,
                        },
                        {
                          label: "Cerró",
                          value: event.closed_by_name ?? "—",
                          icon: <UserRound className="size-3" aria-hidden />,
                        },
                      ]}
                      actions={
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-700">
                          Ver detalle
                          <ArrowUpRight className="size-4" aria-hidden />
                        </span>
                      }
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
