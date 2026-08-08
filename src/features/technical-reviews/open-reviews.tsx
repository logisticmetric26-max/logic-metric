"use client";

import { useState } from "react";
import { Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
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
import { ElapsedTime } from "@/features/technical-reviews/elapsed-time";
import { CloseReviewModal } from "@/features/technical-reviews/close-review-modal";
import { RegisterDepartureModal } from "@/features/technical-reviews/register-departure-modal";
import type { TechnicalReviewEventViewRow } from "@/types/database.types";

/**
 * §20 · Procesos actualmente abiertos.
 *
 * «Cerrar revisión» abre el proceso EXISTENTE para registrar el regreso; nunca
 * crea uno nuevo (§21).
 */
export function OpenReviews({
  events,
  total,
  page,
  pageSize,
  terminals,
  canCreate,
  canClose,
  activeFilterCount,
}: {
  events: TechnicalReviewEventViewRow[];
  total: number;
  page: number;
  pageSize: number;
  terminals: { id: string; name: string }[];
  canCreate: boolean;
  canClose: boolean;
  activeFilterCount: number;
}) {
  const [closing, setClosing] = useState<TechnicalReviewEventViewRow | null>(null);
  const [registering, setRegistering] = useState(false);

  return (
    <>
      <Card>
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar por PPU, número interno o conductor…" />}
          actions={
            canCreate ? (
              <Button
                onClick={() => setRegistering(true)}
                icon={<Plus className="size-4" aria-hidden />}
              >
                Registrar salida
              </Button>
            ) : undefined
          }
        >
          {terminals.length > 1 && (
            <FilterSelect
              paramName="terminal"
              label="Terminal"
              options={terminals.map((terminal) => ({
                value: terminal.id,
                label: terminal.name,
              }))}
            />
          )}
          <FilterDate paramName="desde" label="Salida desde" />
          <FilterDate paramName="hasta" label="Salida hasta" />
        </FilterBar>

        {events.length === 0 ? (
          <EmptyState
            icon={<Timer className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningún proceso coincide con los filtros"
                : "No hay buses en revisión"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la búsqueda o limpie los filtros aplicados."
                : "Cuando un bus salga a planta, su proceso aparecerá aquí hasta que regrese."
            }
            action={
              canCreate && activeFilterCount === 0 ? (
                <Button
                  onClick={() => setRegistering(true)}
                  icon={<Plus className="size-4" aria-hidden />}
                >
                  Registrar salida
                </Button>
              ) : undefined
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
                    <TH>Conductor</TH>
                    <TH>Terminal</TH>
                    <TH>Salida</TH>
                    <TH>Transcurrido</TH>
                    <TH>Registró</TH>
                    <TH align="right">Acción</TH>
                  </THead>
                  <TBody>
                    {events.map((event) => (
                      <TR key={event.id}>
                        <TD className="font-medium">{event.internal_number}</TD>
                        <TD className="font-mono text-xs">{event.ppu}</TD>
                        <TD className="text-ink-secondary">{event.driver_name}</TD>
                        <TD className="text-ink-secondary">{event.terminal_name}</TD>
                        <TD className="text-ink-secondary whitespace-nowrap">
                          {formatDateTime(event.departure_at)}
                        </TD>
                        <TD className="text-ink-secondary">
                          <ElapsedTime from={event.departure_at} />
                        </TD>
                        <TD className="text-ink-muted">{event.created_by_name ?? "—"}</TD>
                        <TD align="right">
                          {canClose && (
                            <Button size="sm" onClick={() => setClosing(event)}>
                              Cerrar revisión
                            </Button>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <CardList>
                  {events.map((event) => (
                    <RowCard
                      key={event.id}
                      title={`${event.internal_number} · ${event.ppu}`}
                      subtitle={event.terminal_name}
                      fields={[
                        { label: "Conductor", value: event.driver_name },
                        { label: "Transcurrido", value: <ElapsedTime from={event.departure_at} /> },
                        { label: "Salida", value: formatDateTime(event.departure_at) },
                        { label: "Registró", value: event.created_by_name ?? "—" },
                      ]}
                      actions={
                        canClose ? (
                          <Button size="sm" onClick={() => setClosing(event)}>
                            Cerrar
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </CardList>
              }
            />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </Card>

      {canCreate && (
        <RegisterDepartureModal open={registering} onClose={() => setRegistering(false)} />
      )}

      {canClose && closing && (
        <CloseReviewModal event={closing} open onClose={() => setClosing(null)} />
      )}
    </>
  );
}
