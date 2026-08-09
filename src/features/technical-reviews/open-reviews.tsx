"use client";

import { useState } from "react";
import { BusFront, Clock3, MapPin, Plus, Timer, UserCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterDate, FilterSelect, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import {
  CardList,
  ResponsiveTable,
  RowCard,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { ElapsedTime } from "@/features/technical-reviews/elapsed-time";
import {
  CloseReviewModal,
  type CloseReviewEvent,
} from "@/features/technical-reviews/close-review-modal";
import { RegisterDepartureModal } from "@/features/technical-reviews/register-departure-modal";

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
  events: (CloseReviewEvent & {
    created_by_name: string | null;
  })[];
  total: number;
  page: number;
  pageSize: number;
  terminals: { id: string; name: string }[];
  canCreate: boolean;
  canClose: boolean;
  activeFilterCount: number;
}) {
  const [closing, setClosing] = useState<CloseReviewEvent | null>(null);
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
              cards={
                <CardList>
                  {events.map((event) => (
                    <RowCard
                      key={event.id}
                      icon={<BusFront className="size-[19px]" aria-hidden />}
                      tone="info"
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
                      fields={[
                        {
                          label: "Conductor",
                          value: event.driver_name,
                          icon: <UserRound className="size-3" aria-hidden />,
                        },
                        {
                          label: "Transcurrido",
                          value: <ElapsedTime from={event.departure_at} />,
                          icon: <Timer className="size-3" aria-hidden />,
                        },
                        {
                          label: "Salida",
                          value: formatDateTime(event.departure_at),
                          icon: <Clock3 className="size-3" aria-hidden />,
                        },
                        {
                          label: "Registró",
                          value: event.created_by_name ?? "—",
                          icon: <UserCheck className="size-3" aria-hidden />,
                        },
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
