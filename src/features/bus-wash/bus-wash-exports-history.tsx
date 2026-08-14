"use client";

import { CalendarDays, Download, History, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterDate, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import { CardList, ResponsiveTable, RowCard } from "@/components/ui/table";
import { formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import type { BusWashExportViewRow } from "@/types/database.types";

export function BusWashExportsHistory({
  items,
  total,
  page,
  pageSize,
  activeFilterCount,
}: {
  items: BusWashExportViewRow[];
  total: number;
  page: number;
  pageSize: number;
  activeFilterCount: number;
}) {
  return (
    <Card className="overflow-visible">
      <FilterBar
        activeCount={activeFilterCount}
        search={<SearchField placeholder="Buscar por archivo, zona o usuario..." />}
      >
        <FilterDate paramName="desde" label="Desde" />
        <FilterDate paramName="hasta" label="Hasta" />
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" aria-hidden />}
          title={
            activeFilterCount > 0
              ? "Ningun archivo de lavado coincide con los filtros"
              : "No hay exportaciones de lavado en el historico"
          }
          description={
            activeFilterCount > 0
              ? "Modifique la busqueda o limpie los filtros aplicados."
              : "Los archivos diarios generados apareceran aqui."
          }
        />
      ) : (
        <>
          <ResponsiveTable
            cards={
              <CardList>
                {items.map((item) => (
                  <RowCard
                    key={item.id}
                    icon={<Download className="size-[19px]" aria-hidden />}
                    tone="info"
                    title={item.file_name}
                    subtitle={`Fecha operativa ${formatDateOnly(item.record_date)}`}
                    fields={[
                      {
                        label: "Zonas",
                        value: item.zone,
                      },
                      {
                        label: "Buses",
                        value: formatNumber(item.bus_count),
                      },
                      {
                        label: "Generado por",
                        value: item.generated_by_name ?? "Sin dato",
                        icon: <User className="size-3" aria-hidden />,
                      },
                      {
                        label: "Generado",
                        value: formatDateTime(item.generated_at),
                        icon: <CalendarDays className="size-3" aria-hidden />,
                      },
                    ]}
                  />
                ))}
              </CardList>
            }
          />
          <Pagination page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </Card>
  );
}
