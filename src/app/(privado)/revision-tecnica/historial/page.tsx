import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BusFront,
  CalendarCheck2,
  Clock3,
  FileText,
  History,
  MapPin,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/card";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { FilterBar, FilterDate, FilterSelect, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Historial" };

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  terminal?: string;
  resultado?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
}

export default async function HistorialPage({
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
      "id, internal_number, ppu, terminal_name, departure_at, return_at, status, result, guide_number, expiration_date, created_by_name, closed_by_name",
      { count: "planned" },
    )
    .eq("status", "CLOSED")
    .order("return_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const upperPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    const anyPattern = `%${escapeLikePattern(raw)}%`;
    query = query.or(
      `ppu.ilike.${ppuPattern},internal_number.ilike.${upperPattern},guide_number.ilike.${upperPattern},driver_name.ilike.${anyPattern}`,
    );
  }

  if (params.terminal) query = query.eq("terminal_id", params.terminal);
  if (params.resultado === "APPROVED" || params.resultado === "REJECTED") {
    query = query.eq("result", params.resultado);
  }
  if (params.desde) query = query.gte("return_at", `${params.desde}T00:00:00`);
  if (params.hasta) query = query.lte("return_at", `${params.hasta}T23:59:59`);

  const { data, count, error } = await query;

  if (error) {
    reportError("historialPage", error);
    return <ErrorState description="No fue posible obtener el historial." />;
  }

  const events = data ?? [];
  const activeFilterCount = [
    params.q,
    params.terminal,
    params.resultado,
    params.desde,
    params.hasta,
  ].filter(Boolean).length;

  return (
    <Card>
      <FilterBar
        activeCount={activeFilterCount}
        search={<SearchField placeholder="Buscar por PPU, número interno, guía o conductor…" />}
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
        <FilterSelect
          paramName="resultado"
          label="Resultado"
          options={[
            { value: "APPROVED", label: "Aprobado" },
            { value: "REJECTED", label: "Rechazado" },
          ]}
        />
        <FilterDate paramName="desde" label="Regreso desde" />
        <FilterDate paramName="hasta" label="Regreso hasta" />
      </FilterBar>

      {events.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" aria-hidden />}
          title={
            activeFilterCount > 0
              ? "Ningún proceso coincide con los filtros"
              : "El historial está vacío"
          }
          description={
            activeFilterCount > 0
              ? "Modifique la búsqueda o limpie los filtros aplicados."
              : "Los procesos cerrados aparecerán aquí como eventos históricos individuales."
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-subtle/55 px-4 py-3 sm:px-5">
            <div>
              <p className="text-[13px] font-medium text-ink">Revisiones finalizadas</p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                Una tarjeta por proceso, ordenadas desde el regreso más reciente.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary ring-1 ring-border">
              {formatNumber(count ?? events.length)} registros
            </span>
          </div>

          <div className="space-y-3 bg-surface-subtle/35 p-3 sm:p-4">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/revision-tecnica/detalle/${event.id}`}
                aria-label={`Ver detalle del bus ${event.internal_number}, patente ${event.ppu}`}
                className="group block rounded-xl bg-surface shadow-[var(--shadow-flat)] ring-1 ring-border transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-raised)] hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <article className="relative overflow-hidden rounded-xl">
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1 ${
                      event.result === "APPROVED" ? "bg-success-600" : "bg-danger-600"
                    }`}
                  />

                  <div className="p-4 pl-5 sm:p-5 sm:pl-6 min-[1100px]:grid min-[1100px]:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1.35fr)_minmax(9rem,0.8fr)_auto] min-[1100px]:items-center min-[1100px]:gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                          event.result === "APPROVED"
                            ? "bg-success-50 text-success-700 ring-1 ring-success-200"
                            : "bg-danger-50 text-danger-700 ring-1 ring-danger-200"
                        }`}
                      >
                        <BusFront className="size-[19px]" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                            Bus {event.internal_number}
                          </h2>
                          <span className="rounded-md bg-fill-subtle px-2 py-0.5 font-mono text-[11.5px] font-semibold tracking-wide text-ink-secondary ring-1 ring-border">
                            {event.ppu}
                          </span>
                        </div>
                        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{event.terminal_name}</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2.5 min-[1100px]:mt-0">
                      <div className="rounded-lg bg-fill-subtle px-3 py-2.5 ring-1 ring-border">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
                          <Clock3 className="size-3" aria-hidden />
                          Salida
                        </span>
                        <p className="mt-1 text-[12.5px] font-medium text-ink-secondary tabular-nums">
                          {formatDateTime(event.departure_at)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-fill-subtle px-3 py-2.5 ring-1 ring-border">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
                          <Clock3 className="size-3" aria-hidden />
                          Regreso
                        </span>
                        <p className="mt-1 text-[12.5px] font-medium text-ink-secondary tabular-nums">
                          {formatDateTime(event.return_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-3 min-[1100px]:mt-0 min-[1100px]:grid-cols-1 min-[1100px]:border-t-0 min-[1100px]:border-l min-[1100px]:py-1 min-[1100px]:pt-1 min-[1100px]:pl-4">
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
                          <FileText className="size-3" aria-hidden />
                          N.º de guía
                        </span>
                        <p className="mt-1 truncate text-[12.5px] font-medium text-ink-secondary">
                          {event.guide_number ?? "Sin guía"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
                          <CalendarCheck2 className="size-3" aria-hidden />
                          Vencimiento
                        </span>
                        <p className="mt-1 truncate text-[12.5px] font-medium text-ink-secondary">
                          {event.result === "APPROVED"
                            ? formatDateOnly(event.expiration_date)
                            : "Sin cambio"}
                        </p>
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1 min-[1100px]:hidden">
                        <span className="text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
                          Cerró
                        </span>
                        <p className="mt-1 truncate text-[12.5px] font-medium text-ink-secondary">
                          {event.closed_by_name ?? "Sin registro"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 min-[1100px]:mt-0 min-[1100px]:flex-col min-[1100px]:items-end min-[1100px]:border-t-0 min-[1100px]:pt-0">
                      <ReviewStatusBadge status={event.status} result={event.result} />
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700 transition-colors group-hover:text-brand-800">
                        Ver detalle
                        <ArrowUpRight
                          className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </>
      )}
    </Card>
  );
}
