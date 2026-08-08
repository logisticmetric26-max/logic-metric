"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Plus,
  Timer,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { FilterDate, FilterSelect } from "@/components/ui/filters";
import { RegisterDepartureModal } from "@/features/technical-reviews/register-departure-modal";
import {
  AreaSplitBar,
  ChartCardHeader,
  ChartEmptyState,
  ChartLegend,
  RankedBars,
} from "@/features/technical-reviews/charts";
import type { RejectionAnalytics } from "@/features/technical-reviews/analytics-core";
import { formatNumber } from "@/lib/format";
import type { TechnicalReviewSummary } from "@/types/database.types";

/**
 * §17, §28 · Resumen operacional.
 *
 * Los indicadores y el análisis vienen de consultas que corren con las
 * políticas RLS del usuario: ningún número puede incluir terminales ajenos.
 * Nunca se muestran valores de ejemplo — sin datos, los indicadores son cero y
 * el análisis lo dice expresamente.
 *
 * Cada indicador declara su alcance temporal («histórico», el período filtrado,
 * o «estado actual») para que dos tarjetas vecinas no mezclen marcos de tiempo
 * sin avisar.
 */
export function SummaryDashboard({
  summary,
  analytics,
  terminals,
  canCreate,
  periodLabel,
  exportHref,
}: {
  summary: TechnicalReviewSummary;
  analytics: RejectionAnalytics;
  terminals: { id: string; name: string }[];
  canCreate: boolean;
  periodLabel: string;
  exportHref: string;
}) {
  const [registering, setRegistering] = useState(false);

  const closed = summary.approved + summary.rejected;
  const rejectionRate = closed === 0 ? null : Math.round((summary.rejected / closed) * 100);
  const approvalRate = rejectionRate === null ? null : 100 - rejectionRate;

  const indicators = [
    {
      label: "Buses en revisión",
      value: summary.in_review,
      tone: "info" as const,
      icon: <Timer className="size-4" aria-hidden />,
      href: "/revision-tecnica/en-revision",
      hint: "En planta en este momento",
    },
    {
      label: "Aprobados",
      value: summary.approved,
      tone: "success" as const,
      icon: <CheckCircle2 className="size-4" aria-hidden />,
      href: "/revision-tecnica/historial?resultado=APPROVED",
      hint:
        approvalRate === null
          ? periodLabel
          : `${approvalRate}% de las cerradas · ${periodLabel.toLowerCase()}`,
    },
    {
      label: "Rechazados",
      value: summary.rejected,
      tone: "danger" as const,
      icon: <XCircle className="size-4" aria-hidden />,
      href: "/revision-tecnica/rechazados",
      hint:
        rejectionRate === null
          ? periodLabel
          : `${rejectionRate}% de las cerradas · ${periodLabel.toLowerCase()}`,
    },
    {
      label: "No enviados",
      value: summary.not_sent,
      tone: "neutral" as const,
      icon: <ClipboardList className="size-4" aria-hidden />,
      href: "/revision-tecnica/no-enviados",
      hint: periodLabel,
    },
    {
      label: "Próximos a vencer",
      value: summary.expiring_soon,
      tone: "warning" as const,
      icon: <CalendarClock className="size-4" aria-hidden />,
      href: "/revision-tecnica/vencimientos?estado=EXPIRING_SOON",
      hint: `Vencen dentro de ${summary.expiring_soon_days} días · estado actual`,
    },
    {
      label: "Vencidos",
      value: summary.expired,
      tone: "danger" as const,
      icon: <AlertTriangle className="size-4" aria-hidden />,
      href: "/revision-tecnica/vencimientos?estado=EXPIRED",
      hint: "Sin revisión vigente · estado actual",
    },
  ];

  const hasAnalytics = analytics.reasonCount > 0;

  return (
    <>
      {/* ── Período y filtros ─────────────────────────────────────────────── */}
      <Card className="mb-5">
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

      {/* ── Indicadores ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indicators.map((indicator) => (
          <Link
            key={indicator.label}
            href={indicator.href}
            className="rounded-2xl focus-visible:outline-2"
          >
            <StatCard
              label={indicator.label}
              value={formatNumber(indicator.value)}
              tone={indicator.tone}
              icon={indicator.icon}
              hint={indicator.hint}
            />
          </Link>
        ))}
      </div>

      {/* ── Análisis de rechazos ──────────────────────────────────────────── */}
      <section className="mt-8" aria-label="Análisis de rechazos">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              Análisis de rechazos
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {hasAnalytics ? (
                <>
                  {formatNumber(analytics.reasonCount)} motivo
                  {analytics.reasonCount === 1 ? "" : "s"} en{" "}
                  {formatNumber(analytics.eventCount)} revisión
                  {analytics.eventCount === 1 ? "" : "es"} rechazada
                  {analytics.eventCount === 1 ? "" : "s"} · promedio{" "}
                  {analytics.averagePerEvent} por revisión · {periodLabel.toLowerCase()}
                </>
              ) : (
                <>Sin revisiones rechazadas en el período seleccionado.</>
              )}
            </p>
          </div>
          {hasAnalytics && <ChartLegend areas={["MANTENCION", "LOGISTICA"]} />}
        </div>

        {!hasAnalytics ? (
          <Card className="p-6">
            <ChartEmptyState message="Cuando existan revisiones rechazadas en el período, aquí verá los motivos más comunes, los componentes comprometidos y el reparto entre Mantención y Logística." />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Reparto por área responsable */}
            <Card className="p-5">
              <ChartCardHeader
                title="Mantención y Logística"
                subtitle="Logística: extintor, norma gráfica, placa patente y limpieza. El resto es Mantención."
              />
              <AreaSplitBar
                mantencion={analytics.byArea.MANTENCION}
                logistica={analytics.byArea.LOGISTICA}
              />
            </Card>

            {/* Componentes comprometidos */}
            <Card className="p-5">
              <ChartCardHeader
                title="Componentes comprometidos"
                subtitle="Dónde se concentran los hallazgos. El color indica el área responsable."
              />
              <RankedBars
                maxItems={8}
                items={analytics.byComponent.map((component) => ({
                  label: component.label,
                  value: component.count,
                  area: component.area,
                }))}
              />
            </Card>

            {/* Motivos más comunes */}
            <Card className="p-5">
              <ChartCardHeader
                title="Rechazos más comunes"
                subtitle="Motivos agrupados aunque el texto del certificado varíe entre plantas."
              />
              <RankedBars
                maxItems={8}
                items={analytics.byReason.map((reason) => ({
                  label: reason.label,
                  value: reason.count,
                  area: reason.area,
                  hint: reason.component,
                }))}
              />
            </Card>

            {/* Buses con más rechazos */}
            <Card className="p-5">
              <ChartCardHeader
                title="Buses con más rechazos"
                subtitle="Reincidencia en el período: revisiones rechazadas y motivos acumulados."
              />
              <div className="flex flex-col divide-y divide-border">
                {analytics.byBus.slice(0, 6).map((bus) => (
                  <div key={bus.ppu} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-black/[0.04] text-ink-muted">
                      <Wrench className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {bus.internal_number} ·{" "}
                        <span className="font-mono text-[12px]">{bus.ppu}</span>
                      </p>
                      <p className="truncate text-[11.5px] text-ink-muted">{bus.terminal_name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-ink tabular-nums">
                        {formatNumber(bus.reasons)}{" "}
                        <span className="font-normal text-ink-muted">motivos</span>
                      </p>
                      <p className="text-[11.5px] text-ink-muted tabular-nums">
                        {formatNumber(bus.events)} revisión{bus.events === 1 ? "" : "es"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </section>

      {canCreate && (
        <RegisterDepartureModal open={registering} onClose={() => setRegistering(false)} />
      )}
    </>
  );
}
