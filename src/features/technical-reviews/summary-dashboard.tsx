"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { FilterDate, FilterSelect } from "@/components/ui/filters";
import { RegisterDepartureModal } from "@/features/technical-reviews/register-departure-modal";
import {
  AGING_RAMP,
  CHART_COLORS,
  ChartEmptyState,
  EXPIRATION_COLORS,
  MonthlyColumns,
  RankedBars,
  SegmentedBar,
  SeriesLegend,
} from "@/features/technical-reviews/charts";
import type { RejectionAnalytics } from "@/features/technical-reviews/analytics-core";
import type {
  ExpirationAnalytics,
  HistoryAnalytics,
  NotSentAnalytics,
  OpenReviewsAnalytics,
} from "@/features/technical-reviews/subsection-analytics";
import { formatDateOnly, formatNumber } from "@/lib/format";
import type { TechnicalReviewSummary } from "@/types/database.types";

/**
 * §17, §28 · Tablero de Revisión Técnica.
 *
 * No es un panel independiente: es el resumen de las SUBSECCIONES. Cada bloque
 * corresponde a una pestaña —En revisión, No enviados, Rechazados,
 * Vencimientos, Historial—, resume su tabla y enlaza a ella. Así el tablero no
 * puede contradecir a los listados: mira los mismos datos con las mismas RLS.
 *
 * Densidad deliberada: los contadores ocupan una franja y el espacio vertical
 * queda para los gráficos, que son los que explican el número. Cada indicador
 * declara su alcance temporal, porque los vencimientos son estado de HOY y
 * conviven con cifras del período filtrado.
 */
export function SummaryDashboard({
  summary,
  analytics,
  openReviews,
  notSent,
  expirations,
  history,
  terminals,
  canCreate,
  periodLabel,
  exportHref,
}: {
  summary: TechnicalReviewSummary;
  analytics: RejectionAnalytics;
  openReviews: OpenReviewsAnalytics;
  notSent: NotSentAnalytics;
  expirations: ExpirationAnalytics;
  history: HistoryAnalytics;
  terminals: { id: string; name: string }[];
  canCreate: boolean;
  periodLabel: string;
  exportHref: string;
}) {
  const [registering, setRegistering] = useState(false);

  const period = periodLabel.toLowerCase();
  const closed = summary.approved + summary.rejected;
  const rejectionRate = closed === 0 ? null : Math.round((summary.rejected / closed) * 100);

  const indicators = [
    {
      label: "En revisión",
      value: summary.in_review,
      tone: "info" as const,
      hint: "En planta ahora",
    },
    {
      label: "Aprobados",
      value: summary.approved,
      tone: "success" as const,
      hint: rejectionRate === null ? period : `${100 - rejectionRate}% de las cerradas`,
    },
    {
      label: "Rechazados",
      value: summary.rejected,
      tone: "danger" as const,
      hint: rejectionRate === null ? period : `${rejectionRate}% de las cerradas`,
    },
    {
      label: "No enviados",
      value: summary.not_sent,
      tone: "neutral" as const,
      hint: period,
    },
    {
      label: "Por vencer",
      value: summary.expiring_soon,
      tone: "warning" as const,
      hint: `Dentro de ${summary.expiring_soon_days} días · hoy`,
    },
    {
      label: "Vencidos",
      value: summary.expired,
      tone: "danger" as const,
      hint: "Sin revisión vigente · hoy",
    },
  ];

  return (
    <>
      {/* ── Período y filtros ─────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader
          title="Período y filtros"
          description="Los vencimientos reflejan el estado actual de la flota y no dependen del período."
          actions={
            <>
              <Button
                variant="secondary"
                // Descarga directa: el enlace lleva los filtros vigentes
                onClick={() => {
                  window.location.href = exportHref;
                }}
                icon={<FileSpreadsheet className="size-4" aria-hidden />}
              >
                Descargar Excel
              </Button>
              {canCreate && (
                <Button
                  onClick={() => setRegistering(true)}
                  icon={<Plus className="size-4" aria-hidden />}
                >
                  Registrar salida
                </Button>
              )}
            </>
          }
        />
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <FilterDate paramName="desde" label="Desde" className="w-full sm:w-44" />
          <FilterDate paramName="hasta" label="Hasta" className="w-full sm:w-44" />
          {/* §17 · el selector de terminal sólo aparece si tiene más de uno */}
          {terminals.length > 1 && (
            <FilterSelect
              paramName="terminal"
              label="Terminal"
              allLabel="Todos mis terminales"
              options={terminals.map((terminal) => ({
                value: terminal.id,
                label: terminal.name,
              }))}
              className="w-full sm:w-56"
            />
          )}
        </div>
      </Card>

      {/* ── Franja de indicadores ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {indicators.map((indicator) => (
          <StatTile
            key={indicator.label}
            label={indicator.label}
            value={formatNumber(indicator.value)}
            tone={indicator.tone}
            hint={indicator.hint}
          />
        ))}
      </div>

      {/* ── Paneles por subsección ────────────────────────────────────────── */}
      {/* `items-start`: cada panel mide lo que necesita. Estirarlos a la altura
          del más alto de su fila abría huecos vacíos dentro de las tarjetas. */}
      <div className="mt-4 grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {/* En revisión · cuánto llevan fuera */}
        <Panel
          title="En revisión"
          subtitle="Tiempo que llevan los buses en planta."
          href="/revision-tecnica/en-revision"
        >
          {openReviews.total === 0 ? (
            <ChartEmptyState message="Ningún bus se encuentra en planta en este momento." />
          ) : (
            <div className="flex flex-col gap-3.5">
              <SegmentedBar
                segments={openReviews.buckets.map((bucket, index) => ({
                  key: bucket.key,
                  label: bucket.label,
                  count: bucket.count,
                  color: AGING_RAMP[index] ?? AGING_RAMP[AGING_RAMP.length - 1],
                }))}
              />
              <MiniList
                caption="Más tiempo fuera"
                rows={openReviews.longest.map((bus) => ({
                  key: bus.ppu,
                  primary: bus.internal_number,
                  secondary: bus.ppu,
                  value: bus.days === 0 ? "hoy" : `${formatNumber(bus.days)} d`,
                }))}
              />
            </div>
          )}
        </Panel>

        {/* Vencimientos · estado de la flota hoy */}
        <Panel
          title="Vencimientos"
          subtitle={`Estado de ${formatNumber(expirations.total)} buses activos, hoy.`}
          href="/revision-tecnica/vencimientos"
        >
          {expirations.total === 0 ? (
            <ChartEmptyState message="No hay buses activos en los terminales seleccionados." />
          ) : (
            <div className="flex flex-col gap-3.5">
              <SegmentedBar
                segments={expirations.byStatus.map((status) => ({
                  key: status.key,
                  label: status.label,
                  count: status.count,
                  color: EXPIRATION_COLORS[status.key],
                }))}
              />
              {expirations.attention.length > 0 && (
                <MiniList
                  caption="Requieren atención"
                  rows={expirations.attention.map((bus) => ({
                    key: bus.ppu,
                    primary: bus.internal_number,
                    secondary: bus.ppu,
                    value:
                      bus.expiration_status === "NO_RECORD"
                        ? "sin registro"
                        : formatDateOnly(bus.expiration_date),
                  }))}
                />
              )}
            </div>
          )}
        </Panel>

        {/* Historial · cerradas mes a mes */}
        <Panel
          title="Historial"
          subtitle="Revisiones cerradas por mes."
          href="/revision-tecnica/historial"
          actions={
            history.months.length > 0 && (
              <SeriesLegend
                items={[
                  { label: "Aprobadas", color: CHART_COLORS.MANTENCION },
                  { label: "Rechazadas", color: CHART_COLORS.LOGISTICA },
                ]}
              />
            )
          }
        >
          {history.months.length === 0 ? (
            <ChartEmptyState message="Todavía no hay revisiones cerradas en el período seleccionado." />
          ) : (
            <MonthlyColumns months={history.months} />
          )}
        </Panel>

        {/* Rechazados · reparto por área */}
        <Panel
          title="Rechazos por área"
          subtitle="Logística: extintor, norma gráfica, placa patente y limpieza. El resto, Mantención."
          href="/revision-tecnica/rechazados"
        >
          {analytics.reasonCount === 0 ? (
            <ChartEmptyState message="Sin revisiones rechazadas en el período." />
          ) : (
            <div className="flex flex-col gap-3.5">
              <SegmentedBar
                segments={[
                  {
                    key: "MANTENCION",
                    label: "Mantención",
                    count: analytics.byArea.MANTENCION,
                    color: CHART_COLORS.MANTENCION,
                  },
                  {
                    key: "LOGISTICA",
                    label: "Logística",
                    count: analytics.byArea.LOGISTICA,
                    color: CHART_COLORS.LOGISTICA,
                  },
                ]}
              />
              <MiniList
                caption="Buses con más rechazos"
                rows={analytics.byBus.slice(0, 4).map((bus) => ({
                  key: bus.ppu,
                  primary: bus.internal_number,
                  secondary: bus.ppu,
                  value: `${formatNumber(bus.reasons)} mot.`,
                }))}
              />
            </div>
          )}
        </Panel>

        {/* Rechazados · motivos */}
        <Panel
          title="Rechazos más comunes"
          subtitle="Motivos agrupados aunque el texto del certificado varíe."
          href="/revision-tecnica/rechazados"
        >
          {analytics.byReason.length === 0 ? (
            <ChartEmptyState message="Sin motivos registrados en el período." />
          ) : (
            <RankedBars
              maxItems={7}
              items={analytics.byReason.map((reason) => ({
                label: reason.label,
                value: reason.count,
                area: reason.area,
                hint: reason.component,
              }))}
            />
          )}
        </Panel>

        {/* Rechazados · componentes */}
        <Panel
          title="Componentes comprometidos"
          subtitle="Dónde se concentran los hallazgos. El color indica el área."
          href="/revision-tecnica/rechazados"
        >
          {analytics.byComponent.length === 0 ? (
            <ChartEmptyState message="Sin componentes registrados en el período." />
          ) : (
            <RankedBars
              maxItems={7}
              remainderNoun="componente"
              items={analytics.byComponent.map((component) => ({
                label: component.label,
                value: component.count,
                area: component.area,
              }))}
            />
          )}
        </Panel>

        {/* No enviados · motivos */}
        <Panel
          title="No enviados"
          subtitle="Motivos por los que el bus no salió a planta."
          href="/revision-tecnica/no-enviados"
          className="xl:col-span-2"
        >
          {notSent.total === 0 ? (
            <ChartEmptyState message="No hay registros de buses no enviados en el período." />
          ) : (
            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              <RankedBars
                maxItems={6}
                items={notSent.byReason.map((reason) => ({
                  label: reason.label,
                  value: reason.count,
                }))}
              />
              <MiniList
                caption="Buses con más no envíos"
                rows={notSent.byBus.slice(0, 6).map((bus) => ({
                  key: bus.ppu,
                  primary: bus.internal_number,
                  secondary: bus.ppu,
                  value: formatNumber(bus.count),
                }))}
              />
            </div>
          )}
        </Panel>

        {/* Resumen del análisis de rechazos */}
        <Panel
          title="Análisis de rechazos"
          subtitle="Volumen del período y densidad de hallazgos."
          href="/revision-tecnica/rechazados"
        >
          {analytics.reasonCount === 0 ? (
            <ChartEmptyState message="Cuando existan revisiones rechazadas, aquí verá el volumen y el promedio de motivos." />
          ) : (
            <dl className="grid grid-cols-3 gap-2.5">
              {[
                { label: "Motivos", value: formatNumber(analytics.reasonCount) },
                { label: "Revisiones", value: formatNumber(analytics.eventCount) },
                { label: "Promedio", value: analytics.averagePerEvent.toLocaleString("es-CL") },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-surface-subtle px-3 py-2.5">
                  <dt className="text-[10.5px] font-medium tracking-[0.02em] text-ink-muted uppercase">
                    {item.label}
                  </dt>
                  <dd className="mt-0.5 text-[19px] leading-none font-semibold tracking-[-0.02em] text-ink">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>

      {canCreate && (
        <RegisterDepartureModal open={registering} onClose={() => setRegistering(false)} />
      )}
    </>
  );
}

/**
 * Tarjeta de una subsección.
 *
 * El título es el enlace a la pestaña que resume: el tablero se lee y se
 * navega por el mismo sitio, sin un «ver más» suelto que haya que buscar.
 */
function Panel({
  title,
  subtitle,
  href,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={href}
              className="group inline-flex items-center gap-1 rounded-sm text-[12.5px] font-semibold tracking-[-0.01em] text-ink focus-visible:outline-2"
            >
              {title}
              <ArrowRight
                aria-hidden
                className="size-3 text-ink-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600"
              />
            </Link>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{subtitle}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
    </Card>
  );
}

/** Lista compacta de apoyo: nombre, identificador y una cifra a la derecha. */
function MiniList({
  caption,
  rows,
}: {
  caption: string;
  rows: { key: string; primary: string; secondary: string; value: string }[];
}) {
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-medium tracking-[0.03em] text-ink-subtle uppercase">
        {caption}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.key} className="flex items-baseline gap-2 py-[5px] first:pt-0 last:pb-0">
            <span className="shrink-0 text-[11.5px] font-medium text-ink">{row.primary}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-subtle">
              {row.secondary}
            </span>
            <span className="shrink-0 text-[11.5px] text-ink-secondary tabular-nums">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
