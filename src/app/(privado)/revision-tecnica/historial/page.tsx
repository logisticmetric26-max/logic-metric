import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/card";
import { ReviewStatusBadge } from "@/components/ui/badge";
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
import { formatDateOnly, formatDateTime } from "@/lib/format";
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

/**
 * §40 · Historial completo de procesos cerrados.
 *
 * Cada ida a planta permanece como un evento individual: la base impide
 * modificar un evento cerrado, así que el historial nunca se reescribe.
 */
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
    .select("*", { count: "exact" })
    .eq("status", "CLOSED")
    .order("return_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // §65 · búsqueda por PPU, número interno, guía y conductor
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
          <ResponsiveTable
            table={
              <Table>
                <THead>
                  <TH>N.º interno</TH>
                  <TH>PPU</TH>
                  <TH>Terminal</TH>
                  <TH>Salida</TH>
                  <TH>Regreso</TH>
                  <TH>Resultado</TH>
                  <TH>N.º guía</TH>
                  <TH>Vencimiento</TH>
                  <TH align="right">Acción</TH>
                </THead>
                <TBody>
                  {events.map((event) => (
                    <TR key={event.id}>
                      <TD className="font-medium">{event.internal_number}</TD>
                      <TD className="font-mono text-xs">{event.ppu}</TD>
                      <TD className="text-ink-secondary">{event.terminal_name}</TD>
                      <TD className="whitespace-nowrap text-ink-secondary">
                        {formatDateTime(event.departure_at)}
                      </TD>
                      <TD className="whitespace-nowrap text-ink-secondary">
                        {formatDateTime(event.return_at)}
                      </TD>
                      <TD>
                        <ReviewStatusBadge status={event.status} result={event.result} />
                      </TD>
                      <TD className="text-ink-secondary">{event.guide_number ?? "—"}</TD>
                      <TD className="whitespace-nowrap text-ink-secondary">
                        {event.result === "APPROVED"
                          ? formatDateOnly(event.expiration_date)
                          : "Sin cambio"}
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
                      badge={<ReviewStatusBadge status={event.status} result={event.result} />}
                      fields={[
                        { label: "N.º guía", value: event.guide_number ?? "—" },
                        {
                          label: "Vencimiento",
                          value:
                            event.result === "APPROVED"
                              ? formatDateOnly(event.expiration_date)
                              : "Sin cambio",
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
