import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/card";
import { ExpirationBadge } from "@/components/ui/badge";
import { Alert, EmptyState, ErrorState } from "@/components/ui/feedback";
import { FilterBar, FilterSelect, SearchField } from "@/components/ui/filters";
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
import { ExpiringSoonSetting } from "@/features/technical-reviews/expiring-soon-setting";
import { formatDateOnly } from "@/lib/format";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { reportError } from "@/lib/errors";
import type { ExpirationStatus } from "@/types/database.types";

export const metadata: Metadata = { title: "Vencimientos" };

const PAGE_SIZE = 25;

const STATUS_VALUES: ExpirationStatus[] = ["VALID", "EXPIRING_SOON", "EXPIRED", "NO_RECORD"];

interface SearchParams {
  q?: string;
  terminal?: string;
  estado?: string;
  pagina?: string;
}

/**
 * §38, §39 · Estado de vencimiento vigente de cada bus.
 *
 * La fecha vigente es la del ÚLTIMO evento cerrado y APROBADO. Un rechazo o un
 * no envío no la modifican — la vista la deriva, así que la regla se cumple por
 * construcción y no por disciplina del código.
 */
export default async function VencimientosPage({
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
    .from("fleet_expiration_status")
    .select("*", { count: "exact" })
    .eq("active", true)
    // Primero lo que urge: sin fecha al final
    .order("expiration_date", { ascending: true, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const upperPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(`ppu.ilike.${ppuPattern},internal_number.ilike.${upperPattern}`);
  }

  if (params.terminal) query = query.eq("terminal_id", params.terminal);

  // Sólo se acepta un estado del catálogo: un valor arbitrario en la URL se ignora
  const status = STATUS_VALUES.find((value) => value === params.estado);
  if (status) query = query.eq("expiration_status", status);

  const [{ data, count, error }, { data: setting }] = await Promise.all([
    query,
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "technical_review.expiring_soon_days")
      .maybeSingle(),
  ]);

  if (error) {
    reportError("vencimientosPage", error);
    return <ErrorState description="No fue posible obtener el estado de vencimientos." />;
  }

  const rows = data ?? [];
  const expiringSoonDays = Number(setting?.value ?? 30);
  const activeFilterCount = [params.q, params.terminal, params.estado].filter(Boolean).length;

  return (
    <>
      <ExpiringSoonSetting
        days={expiringSoonDays}
        canEdit={context.permissions.includes(PERMISSIONS.settings.manage)}
      />

      <Card className="mt-4">
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar por PPU o número interno…" />}
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
            paramName="estado"
            label="Estado"
            options={[
              { value: "VALID", label: "Vigente" },
              { value: "EXPIRING_SOON", label: "Próximo a vencer" },
              { value: "EXPIRED", label: "Vencido" },
              { value: "NO_RECORD", label: "Sin registro" },
            ]}
          />
        </FilterBar>

        {rows.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningún bus coincide con los filtros"
                : "No hay buses activos registrados"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la búsqueda o limpie los filtros aplicados."
                : "Incorpore buses a la flota para hacer seguimiento de sus vencimientos."
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
                    <TH>Vencimiento</TH>
                    <TH align="center">Días</TH>
                    <TH>Última aprobación</TH>
                    <TH>Estado</TH>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.fleet_id}>
                        <TD className="font-medium">{row.internal_number}</TD>
                        <TD className="font-mono text-xs">{row.ppu}</TD>
                        <TD className="text-ink-secondary">
                          {context.terminals.find((terminal) => terminal.id === row.terminal_id)
                            ?.name ?? "—"}
                        </TD>
                        <TD className="whitespace-nowrap">
                          {formatDateOnly(row.expiration_date)}
                        </TD>
                        <TD align="center" className="tabular-nums">
                          {row.days_to_expiration === null
                            ? "—"
                            : row.days_to_expiration < 0
                              ? `${Math.abs(row.days_to_expiration)} vencido`
                              : row.days_to_expiration}
                        </TD>
                        <TD className="whitespace-nowrap text-ink-muted">
                          {formatDateOnly(row.last_approved_at?.slice(0, 10) ?? null)}
                        </TD>
                        <TD>
                          <ExpirationBadge status={row.expiration_status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <CardList>
                  {rows.map((row) => (
                    <RowCard
                      key={row.fleet_id}
                      title={`${row.internal_number} · ${row.ppu}`}
                      badge={<ExpirationBadge status={row.expiration_status} />}
                      fields={[
                        { label: "Vencimiento", value: formatDateOnly(row.expiration_date) },
                        {
                          label: "Días",
                          value:
                            row.days_to_expiration === null
                              ? "—"
                              : row.days_to_expiration < 0
                                ? `${Math.abs(row.days_to_expiration)} vencido`
                                : row.days_to_expiration,
                        },
                      ]}
                    />
                  ))}
                </CardList>
              }
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </>
        )}
      </Card>

      <Alert tone="info" className="mt-4">
        El vencimiento vigente de un bus es el de su última revisión aprobada. Un rechazo o un
        registro de no envío conservan la fecha anterior.
      </Alert>
    </>
  );
}
