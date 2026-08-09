"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  Plus,
  Timer,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterDate, FilterSelect } from "@/components/ui/filters";
import { RegisterDepartureModal } from "@/features/technical-reviews/register-departure-modal";
import type { RejectionAnalytics } from "@/features/technical-reviews/analytics-core";
import type {
  ExpirationAnalytics,
  HistoryAnalytics,
  NotSentAnalytics,
  OpenReviewsAnalytics,
} from "@/features/technical-reviews/subsection-analytics";
import { formatDateOnly, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TechnicalReviewSummary } from "@/types/database.types";

const APPROVED = "#64748b";
const REJECTED = "#c68b59";
const VALID = "#64748b";
const SOON = "#c68b59";
const EXPIRED = "#c2413a";
const NO_RECORD = "#c5ccd6";

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

  const closed = summary.approved + summary.rejected;
  const rejectionRate = closed === 0 ? null : Math.round((summary.rejected / closed) * 100);
  const longestOpen = openReviews.longest[0]?.days ?? 0;
  const areaTotal = analytics.byArea.MANTENCION + analytics.byArea.LOGISTICA;

  const topMetrics = [
    {
      label: "En revision",
      value: summary.in_review,
      hint: longestOpen > 0 ? `Mayor permanencia: ${formatNumber(longestOpen)} d` : "Sin atrasos",
      icon: <Timer className="size-5" aria-hidden />,
      iconTone: "text-slate-600 bg-slate-100",
    },
    {
      label: "Aprobadas",
      value: summary.approved,
      hint: closed === 0 ? periodLabel : `${formatNumber(100 - (rejectionRate ?? 0))}% de cerradas`,
      icon: <CheckCircle2 className="size-5" aria-hidden />,
      iconTone: "text-slate-700 bg-slate-100",
    },
    {
      label: "Rechazadas",
      value: summary.rejected,
      hint: closed === 0 ? periodLabel : `${formatNumber(rejectionRate ?? 0)}% de cerradas`,
      icon: <XCircle className="size-5" aria-hidden />,
      iconTone: "text-amber-700 bg-amber-50",
    },
    {
      label: "Por vencer",
      value: summary.expiring_soon,
      hint: `Dentro de ${formatNumber(summary.expiring_soon_days)} dias`,
      icon: <Clock3 className="size-5" aria-hidden />,
      iconTone: "text-amber-700 bg-amber-50",
    },
    {
      label: "Vencidos",
      value: summary.expired,
      hint: summary.expired > 0 ? "Requieren gestion inmediata" : "Sin urgencias criticas",
      icon: <AlertTriangle className="size-5" aria-hidden />,
      iconTone: "text-red-700 bg-red-50",
    },
  ];

  const expirationCounts = {
    valid: expirations.byStatus.find((item) => item.key === "VALID")?.count ?? 0,
    soon: expirations.byStatus.find((item) => item.key === "EXPIRING_SOON")?.count ?? 0,
    expired: expirations.byStatus.find((item) => item.key === "EXPIRED")?.count ?? 0,
    noRecord: expirations.byStatus.find((item) => item.key === "NO_RECORD")?.count ?? 0,
  };

  const areaSegments = [
    {
      label: "Mantencion",
      value: analytics.byArea.MANTENCION,
      color: APPROVED,
      detail:
        areaTotal === 0
          ? "0%"
          : `${formatNumber(Math.round((analytics.byArea.MANTENCION / areaTotal) * 100))}%`,
    },
    {
      label: "Logistica",
      value: analytics.byArea.LOGISTICA,
      color: REJECTED,
      detail:
        areaTotal === 0
          ? "0%"
          : `${formatNumber(Math.round((analytics.byArea.LOGISTICA / areaTotal) * 100))}%`,
    },
  ];

  const operationalAlerts = buildOperationalAlerts({
    summary,
    openReviews,
    notSent,
    analytics,
  });

  return (
    <>
      <Card solid className="mb-4">
        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink">
                Resumen
              </h2>
              <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
                Vision general del estado operativo de revision tecnica para {periodLabel.toLowerCase()}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
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
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterDate paramName="desde" label="Desde" className="w-full" />
            <FilterDate paramName="hasta" label="Hasta" className="w-full" />
            {terminals.length > 1 && (
              <FilterSelect
                paramName="terminal"
                label="Terminal"
                allLabel="Todos mis terminales"
                options={terminals.map((terminal) => ({
                  value: terminal.id,
                  label: terminal.name,
                }))}
                className="w-full xl:col-span-2"
              />
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {topMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            icon={metric.icon}
            iconTone={metric.iconTone}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1.18fr_1fr]">
        <SummaryPanel
          title="Historial mensual"
          subtitle="Revision tecnica cerrada por mes para el periodo filtrado."
          href="/revision-tecnica/historial"
          actions={
            history.months.length > 0 && (
              <div className="flex items-center gap-3 text-[11px] text-ink-secondary">
                <LegendDot color={APPROVED} label="Aprobadas" />
                <LegendDot color={REJECTED} label="Rechazadas" />
              </div>
            )
          }
        >
          {history.months.length === 0 ? (
            <EmptyBlock message="Todavia no hay revisiones cerradas en el periodo seleccionado." />
          ) : (
            <HistoryBars months={history.months} />
          )}
        </SummaryPanel>

        <SummaryPanel
          title="Vencimientos hoy"
          subtitle={`Estado actual de ${formatNumber(expirations.total)} buses activos.`}
          href="/revision-tecnica/vencimientos"
          emphasis
        >
          {expirations.total === 0 ? (
            <EmptyBlock message="No hay buses activos en los terminales seleccionados." />
          ) : (
            <div className="flex flex-col gap-4">
              <StatusSegments
                segments={[
                  { label: "Vigente", value: expirationCounts.valid, color: VALID },
                  { label: "Por vencer", value: expirationCounts.soon, color: SOON },
                  { label: "Vencido", value: expirationCounts.expired, color: EXPIRED },
                  { label: "Sin registro", value: expirationCounts.noRecord, color: NO_RECORD },
                ]}
              />

              <div className="grid gap-2 sm:grid-cols-4">
                <InlineStat label="Vigente" value={expirationCounts.valid} tone="neutral" />
                <InlineStat label="Por vencer" value={expirationCounts.soon} tone="warning" />
                <InlineStat label="Vencido" value={expirationCounts.expired} tone="danger" />
                <InlineStat label="Sin registro" value={expirationCounts.noRecord} tone="soft" />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[12px] font-semibold text-ink">Requieren atencion</p>
                  <Link
                    href="/revision-tecnica/vencimientos"
                    className="text-[11px] font-medium text-brand-700 hover:text-brand-800"
                  >
                    Ver todos
                  </Link>
                </div>

                {expirations.attention.length === 0 ? (
                  <EmptyInline text="No hay unidades criticas fuera de estado vigente." />
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border bg-surface-subtle/60">
                    {expirations.attention.map((bus) => (
                      <li
                        key={`${bus.ppu}-${bus.expiration_status}`}
                        className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1.1fr_1fr_auto]"
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-ink">{bus.internal_number}</p>
                          <p className="truncate font-mono text-[11px] text-ink-muted">
                            {bus.ppu} - {bus.terminal_name}
                          </p>
                        </div>
                        <div className="text-[11px] text-ink-secondary">
                          {bus.expiration_status === "NO_RECORD"
                            ? "Sin revision aprobada"
                            : formatDateOnly(bus.expiration_date)}
                        </div>
                        <StatusBadge
                          tone={
                            bus.expiration_status === "EXPIRED"
                              ? "danger"
                              : bus.expiration_status === "EXPIRING_SOON"
                                ? "warning"
                                : "soft"
                          }
                        >
                          {bus.expiration_status === "EXPIRED"
                            ? "Vencido"
                            : bus.expiration_status === "EXPIRING_SOON"
                              ? "Por vencer"
                              : "Sin registro"}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </SummaryPanel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <SummaryPanel
          title="Rechazos por area"
          subtitle="Distribucion del periodo entre mantencion y logistica."
          href="/revision-tecnica/rechazados"
        >
          {analytics.reasonCount === 0 ? (
            <EmptyBlock message="Sin revisiones rechazadas en el periodo." compact />
          ) : (
            <div className="grid items-center gap-4 md:grid-cols-[180px_1fr]">
              <DonutSummary total={analytics.reasonCount} segments={areaSegments} />
              <div className="space-y-2">
                {areaSegments.map((segment) => (
                  <div
                    key={segment.label}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-subtle/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: segment.color }}
                      />
                      <span className="text-[12px] text-ink-secondary">{segment.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-semibold text-ink">
                        {formatNumber(segment.value)}
                      </p>
                      <p className="text-[10.5px] text-ink-muted">{segment.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SummaryPanel>

        <SummaryPanel
          title="Componentes comprometidos"
          subtitle="Sectores con mayor concentracion de hallazgos."
          href="/revision-tecnica/rechazados"
        >
          {analytics.byComponent.length === 0 ? (
            <EmptyBlock message="Sin componentes registrados en el periodo." compact />
          ) : (
            <MeterList
              items={analytics.byComponent.slice(0, 5).map((component) => ({
                label: component.label,
                value: component.count,
                color: component.area === "LOGISTICA" ? REJECTED : APPROVED,
                hint: component.area === "LOGISTICA" ? "Logistica" : "Mantencion",
              }))}
            />
          )}
        </SummaryPanel>

        <SummaryPanel
          title="No enviados"
          subtitle="Motivos por los que una unidad no salio a planta."
          href="/revision-tecnica/no-enviados"
        >
          {notSent.total === 0 ? (
            <CompactState
              icon={<ClipboardList className="size-7" aria-hidden />}
              title="Sin pendientes"
              message="No hay registros de buses no enviados en el periodo."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-border bg-surface-subtle/60 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted">
                  Registros del periodo
                </p>
                <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em] text-ink">
                  {formatNumber(notSent.total)}
                </p>
              </div>

              <MiniRows
                rows={notSent.byReason.slice(0, 4).map((reason) => ({
                  key: reason.label,
                  primary: reason.label,
                  secondary: "Motivo registrado",
                  value: formatNumber(reason.count),
                }))}
              />
            </div>
          )}
        </SummaryPanel>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.15fr_1fr]">
        <SummaryPanel
          title="Top motivos"
          subtitle="Principales causas confirmadas en revisiones rechazadas."
          href="/revision-tecnica/rechazados"
        >
          {analytics.byReason.length === 0 ? (
            <EmptyBlock message="Cuando existan rechazos, aqui vera los motivos mas frecuentes." compact />
          ) : (
            <MeterList
              items={analytics.byReason.slice(0, 5).map((reason) => ({
                label: reason.label,
                value: reason.count,
                color: reason.area === "LOGISTICA" ? REJECTED : APPROVED,
                hint: reason.component,
              }))}
              showIndex
            />
          )}
        </SummaryPanel>

        <SummaryPanel
          title="Alertas operativas"
          subtitle="Senales rapidas para gestionar el dia sin perder el contexto."
          href="/revision-tecnica"
        >
          {operationalAlerts.length === 0 ? (
            <CompactState
              icon={<CheckCircle2 className="size-7" aria-hidden />}
              title="Operacion estable"
              message="No hay alertas prioritarias para el periodo seleccionado."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {operationalAlerts.map((alert) => (
                <Link
                  key={alert.key}
                  href={alert.href}
                  className="group flex items-start gap-3 rounded-md border border-border bg-surface-subtle/60 px-3 py-3 transition-colors hover:border-border-strong hover:bg-surface-subtle"
                >
                  <span className={cn("mt-0.5 rounded-md p-1.5", alert.toneClass)}>{alert.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-ink">{alert.title}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
                      {alert.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-brand-700 group-hover:text-brand-800">
                    Ver
                  </span>
                </Link>
              ))}
            </div>
          )}
        </SummaryPanel>
      </div>

      {canCreate && (
        <RegisterDepartureModal open={registering} onClose={() => setRegistering(false)} />
      )}
    </>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  iconTone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  iconTone: string;
}) {
  return (
    <Card solid className="h-full">
      <div className="flex h-full items-center gap-4 px-4 py-4">
        <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", iconTone)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted">
            {label}
          </p>
          <p className="mt-1 text-[30px] leading-none font-semibold tracking-[-0.04em] text-ink">
            {formatNumber(value)}
          </p>
          <p className="mt-2 text-[11px] text-ink-muted">{hint}</p>
        </div>
      </div>
    </Card>
  );
}

function SummaryPanel({
  title,
  subtitle,
  href,
  emphasis,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  emphasis?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card solid className={cn(emphasis && "ring-1 ring-inset ring-slate-200")}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={href}
              className="group inline-flex items-center gap-1 text-[18px] font-semibold tracking-[-0.02em] text-ink"
            >
              {title}
              <ArrowRight
                className="size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                aria-hidden
              />
            </Link>
            <p className="mt-1 text-[12px] text-ink-muted">{subtitle}</p>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
    </Card>
  );
}

function HistoryBars({ months }: { months: HistoryAnalytics["months"] }) {
  const max = Math.max(...months.map((month) => month.approved + month.rejected), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[240px] items-end gap-4 border-b border-border pb-3">
        {months.map((month) => {
          const approvedHeight = (month.approved / max) * 100;
          const rejectedHeight = (month.rejected / max) * 100;

          return (
            <div key={month.month} className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div
                className="flex h-full w-full max-w-[72px] flex-col justify-end overflow-hidden rounded-t-md bg-surface-subtle"
                title={`${month.label}: ${formatNumber(month.approved)} aprobadas, ${formatNumber(month.rejected)} rechazadas`}
              >
                {month.rejected > 0 && (
                  <div
                    className="w-full"
                    style={{
                      height: `${Math.max(rejectedHeight, 4)}%`,
                      backgroundColor: REJECTED,
                    }}
                  />
                )}
                {month.approved > 0 && (
                  <div
                    className="w-full"
                    style={{
                      height: `${Math.max(approvedHeight, 4)}%`,
                      backgroundColor: APPROVED,
                    }}
                  />
                )}
              </div>
              <div className="text-center">
                <p className="text-[11px] font-medium text-ink-secondary">{month.label}</p>
                <p className="mt-1 text-[10.5px] text-ink-muted">
                  {formatNumber(month.approved + month.rejected)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <InlineStat label="Aprobadas" value={historyTotal(months, "approved")} tone="neutral" />
        <InlineStat label="Rechazadas" value={historyTotal(months, "rejected")} tone="warning" />
        <InlineStat
          label="Tasa rechazo"
          value={historyRate(months)}
          tone="soft"
          useRawValue
        />
      </div>
    </div>
  );
}

function StatusSegments({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-5 gap-px overflow-hidden rounded-md bg-surface-subtle">
        {visible.map((segment) => (
          <div
            key={segment.label}
            className="flex items-center justify-center text-[10.5px] font-semibold text-white"
            style={{
              width: `${(segment.value / Math.max(total, 1)) * 100}%`,
              backgroundColor: segment.color,
            }}
          >
            {segment.value > 0 ? formatNumber(segment.value) : ""}
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-[11px] text-ink-secondary">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="truncate">{segment.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineStat({
  label,
  value,
  tone,
  useRawValue,
}: {
  label: string;
  value: number | string;
  tone: "neutral" | "warning" | "danger" | "soft";
  useRawValue?: boolean;
}) {
  const toneClass = {
    neutral: "text-slate-700 bg-slate-50 border-slate-200",
    warning: "text-amber-800 bg-amber-50 border-amber-200",
    danger: "text-red-700 bg-red-50 border-red-200",
    soft: "text-ink-secondary bg-surface-subtle border-border",
  } as const;

  return (
    <div className={cn("rounded-md border px-3 py-2.5", toneClass[tone])}>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.04em]">{label}</p>
      <p className="mt-1 text-[24px] leading-none font-semibold tracking-[-0.03em]">
        {useRawValue ? value : formatNumber(Number(value))}
      </p>
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "warning" | "danger" | "soft";
  children: ReactNode;
}) {
  const toneClass = {
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-700",
    soft: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[10.5px] font-medium", toneClass[tone])}>
      {children}
    </span>
  );
}

function DonutSummary({
  total,
  segments,
}: {
  total: number;
  segments: { label: string; value: number; color: string; detail: string }[];
}) {
  const gradient = buildConicGradient(segments, total);

  return (
    <div className="flex items-center justify-center">
      <div
        className="relative flex size-[168px] items-center justify-center rounded-full"
        style={{ background: gradient }}
      >
        <div className="flex size-[102px] flex-col items-center justify-center rounded-full bg-surface shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]">
          <span className="text-[30px] leading-none font-semibold tracking-[-0.04em] text-ink">
            {formatNumber(total)}
          </span>
          <span className="mt-1 text-[11px] text-ink-muted">Total</span>
        </div>
      </div>
    </div>
  );
}

function MeterList({
  items,
  showIndex,
}: {
  items: { label: string; value: number; color: string; hint?: string }[];
  showIndex?: boolean;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-[12px] text-ink-secondary">
              {showIndex && <span className="mr-2 font-medium text-ink">{index + 1}</span>}
              <span className="truncate">{item.label}</span>
              {item.hint && <span className="ml-2 text-[10.5px] text-ink-muted">{item.hint}</span>}
            </div>
            <span className="shrink-0 text-[12px] font-medium text-ink">{formatNumber(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / max) * 100, 8)}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniRows({
  rows,
}: {
  rows: { key: string; primary: string; secondary: string; value: string }[];
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-surface-subtle/60">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-ink">{row.primary}</p>
            <p className="truncate text-[10.5px] text-ink-muted">{row.secondary}</p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-ink">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

function CompactState({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-[196px] flex-col items-center justify-center gap-3 rounded-md bg-surface-subtle/60 px-6 py-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-surface text-slate-400">
        {icon}
      </div>
      <div>
        <p className="text-[16px] font-semibold tracking-[-0.02em] text-ink">{title}</p>
        <p className="mt-1 max-w-[22rem] text-[12px] leading-relaxed text-ink-muted">{message}</p>
      </div>
    </div>
  );
}

function EmptyBlock({ message, compact }: { message: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md border border-dashed border-border bg-surface-subtle/50 px-5 text-center text-[12px] text-ink-muted",
        compact ? "min-h-[164px] py-8" : "min-h-[240px] py-12",
      )}
    >
      <p className="max-w-[26rem] leading-relaxed">{message}</p>
    </div>
  );
}

function EmptyInline({ text }: { text: string }) {
  return <p className="rounded-md bg-surface-subtle/60 px-3 py-3 text-[11px] text-ink-muted">{text}</p>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}

function buildOperationalAlerts({
  summary,
  openReviews,
  notSent,
  analytics,
}: {
  summary: TechnicalReviewSummary;
  openReviews: OpenReviewsAnalytics;
  notSent: NotSentAnalytics;
  analytics: RejectionAnalytics;
}) {
  const alerts: {
    key: string;
    title: string;
    description: string;
    href: string;
    icon: ReactNode;
    toneClass: string;
  }[] = [];

  if (summary.expired > 0) {
    alerts.push({
      key: "expired",
      title: `${formatNumber(summary.expired)} buses con revision vencida`,
      description: "Priorizar regularizacion para evitar continuidad fuera de norma.",
      href: "/revision-tecnica/vencimientos",
      icon: <AlertTriangle className="size-4" aria-hidden />,
      toneClass: "bg-red-50 text-red-700",
    });
  }

  if (summary.expiring_soon > 0) {
    alerts.push({
      key: "expiring",
      title: `${formatNumber(summary.expiring_soon)} buses por vencer pronto`,
      description: `Programar salidas a planta dentro de ${formatNumber(summary.expiring_soon_days)} dias.`,
      href: "/revision-tecnica/vencimientos",
      icon: <CalendarClock className="size-4" aria-hidden />,
      toneClass: "bg-amber-50 text-amber-800",
    });
  }

  const delayed = openReviews.buckets.find((bucket) => bucket.key === "OVER_7")?.count ?? 0;
  if (delayed > 0) {
    alerts.push({
      key: "open-delay",
      title: `${formatNumber(delayed)} buses llevan mas de 7 dias en planta`,
      description: "Revisar retrasos de retorno y seguimiento con el terminal.",
      href: "/revision-tecnica/en-revision",
      icon: <Timer className="size-4" aria-hidden />,
      toneClass: "bg-slate-100 text-slate-700",
    });
  }

  if (notSent.total > 0) {
    alerts.push({
      key: "not-sent",
      title: `${formatNumber(notSent.total)} registros de no enviados`,
      description: "Monitorear continuidad operacional y causas repetidas del periodo.",
      href: "/revision-tecnica/no-enviados",
      icon: <ClipboardList className="size-4" aria-hidden />,
      toneClass: "bg-slate-100 text-slate-700",
    });
  }

  if (analytics.byComponent[0]) {
    alerts.push({
      key: "top-component",
      title: `${analytics.byComponent[0].label} lidera los hallazgos`,
      description: `Acumula ${formatNumber(analytics.byComponent[0].count)} rechazos confirmados en el periodo.`,
      href: "/revision-tecnica/rechazados",
      icon: <Wrench className="size-4" aria-hidden />,
      toneClass: "bg-slate-100 text-slate-700",
    });
  }

  return alerts.slice(0, 3);
}

function buildConicGradient(
  segments: { value: number; color: string }[],
  total: number,
) {
  if (total === 0) return "conic-gradient(#e5e7eb 0deg 360deg)";

  let current = 0;
  const parts = segments.map((segment) => {
    const start = current;
    const sweep = (segment.value / total) * 360;
    current += sweep;
    return `${segment.color} ${start}deg ${current}deg`;
  });

  return `conic-gradient(${parts.join(", ")})`;
}

function historyTotal(
  months: HistoryAnalytics["months"],
  key: "approved" | "rejected",
) {
  return months.reduce((sum, month) => sum + month[key], 0);
}

function historyRate(months: HistoryAnalytics["months"]) {
  const approved = historyTotal(months, "approved");
  const rejected = historyTotal(months, "rejected");
  const total = approved + rejected;
  return total === 0 ? "0%" : `${Math.round((rejected / total) * 100)}%`;
}
