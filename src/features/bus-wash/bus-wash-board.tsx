"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Bus, Check, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, ActiveBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveBusWashRecordAction } from "@/features/bus-wash/actions";

export interface BusWashListRow {
  id: string;
  internal_number: string;
  ppu: string;
  terminal_id: string;
  terminal_name: string;
  zone: string | null;
  active: boolean;
  bm_completed: boolean;
  body_wash_completed: boolean;
  in_repair: boolean;
  had_body_wash_yesterday: boolean;
  updated_at: string | null;
}

export function BusWashBoard({
  initialRows,
  date,
  canEdit,
}: {
  initialRows: BusWashListRow[];
  date: string;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  const filteredRows = useMemo(() => {
    const normalized = deferredQuery.trim().toUpperCase();
    if (!normalized) return rows;

    return rows.filter((row) =>
      [row.internal_number, row.ppu, row.terminal_name, row.zone ?? ""].some((value) =>
        value.toUpperCase().includes(normalized),
      ),
    );
  }, [deferredQuery, rows]);

  const groupedRows = useMemo(() => {
    const grouped = new Map<string, BusWashListRow[]>();

    for (const row of filteredRows) {
      const key = row.zone?.trim() || "Sin zona";
      const bucket = grouped.get(key);
      if (bucket) bucket.push(row);
      else grouped.set(key, [row]);
    }

    return [...grouped.entries()];
  }, [filteredRows]);

  const summary = useMemo(
    () => ({
      total: filteredRows.length,
      bm: filteredRows.filter((row) => row.bm_completed).length,
      bodyWash: filteredRows.filter((row) => row.body_wash_completed).length,
      inRepair: filteredRows.filter((row) => row.in_repair).length,
    }),
    [filteredRows],
  );

  function updateRow(
    row: BusWashListRow,
    patch: Pick<BusWashListRow, "bm_completed" | "body_wash_completed" | "in_repair">,
  ) {
    const next = { ...row, ...patch };
    setSavingId(row.id);

    startTransition(async () => {
      const result = await saveBusWashRecordAction({
        fleet_id: row.id,
        terminal_id: row.terminal_id,
        record_date: date,
        bm_completed: next.bm_completed,
        body_wash_completed: next.body_wash_completed,
        in_repair: next.in_repair,
      });

      setSavingId(null);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                bm_completed: result.data.bm_completed,
                body_wash_completed: result.data.body_wash_completed,
                in_repair: result.data.in_repair,
                updated_at: result.data.updated_at,
              }
            : item,
        ),
      );
    });
  }

  return (
    <div className="space-y-4">
      <Card solid className="overflow-hidden">
        <div className="grid gap-5 bg-[linear-gradient(135deg,rgba(10,108,255,0.05),rgba(255,255,255,0.92),rgba(31,184,132,0.08))] p-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium tracking-[0.04em] text-slate-600 uppercase">
              <Sparkles className="size-3.5" aria-hidden />
              Control diario
            </div>
            <h2 className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.035em] text-ink">
              Lavado Buses
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
              Registro diario por bus para barrido y mopeado, lavado de carroceria y estado en
              reparacion, ordenado por zona operacional.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricPill label="Fecha" value={formatDateOnly(date)} hint="Dia operativo" tone="neutral" />
              <MetricPill label="Flota visible" value={formatNumber(summary.total)} hint="Buses en pantalla" tone="brand" />
              <MetricPill label="B&M" value={formatNumber(summary.bm)} hint="Marcados como realizados" tone="success" />
              <MetricPill
                label="Lavado / reparacion"
                value={`${formatNumber(summary.bodyWash)} / ${formatNumber(summary.inRepair)}`}
                hint="Carroceria / reparacion"
                tone="warning"
              />
            </div>
          </div>

          <div className="grid gap-3">
            <Card solid className="border-slate-200/80 bg-white/85">
              <form action="/lavado-buses" method="get" className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
                <Field label="Dia de registro" htmlFor="bus-wash-date">
                  <Input id="bus-wash-date" name="fecha" type="date" defaultValue={date} required />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" fullWidth>
                    Cargar dia
                  </Button>
                </div>
              </form>
            </Card>

            <Card solid className="border-slate-200/80 bg-white/85">
              <div className="p-4">
                <Field
                  label="Buscar bus"
                  hint="Filtre por numero interno, PPU, terminal o zona."
                  htmlFor="bus-wash-search"
                >
                  <Input
                    id="bus-wash-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar..."
                    leading={<Search className="size-4" aria-hidden />}
                  />
                </Field>
              </div>
            </Card>
          </div>
        </div>
      </Card>

      {groupedRows.length === 0 ? (
        <Card solid>
          <EmptyState
            icon={<Bus className="size-5" aria-hidden />}
            title={rows.length === 0 ? "No hay buses disponibles" : "Ningun bus coincide con la busqueda"}
            description={
              rows.length === 0
                ? "No se encontraron buses en los terminales autorizados para esta cuenta."
                : "Pruebe con otro numero interno, PPU, terminal o zona."
            }
          />
        </Card>
      ) : (
        groupedRows.map(([zone, zoneRows]) => (
          <Card key={zone} solid className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-subtle/55 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.02em] text-ink">{zone}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {formatNumber(zoneRows.length)} bus{zoneRows.length === 1 ? "" : "es"}
                </p>
              </div>
              <Badge tone="neutral">{formatNumber(zoneRows.filter((row) => row.in_repair).length)} en reparacion</Badge>
            </div>

            <div className="divide-y divide-border">
              {zoneRows.map((row) => {
                const isSaving = pending && savingId === row.id;

                return (
                  <div
                    key={row.id}
                    className={cn(
                      "grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(16rem,1.15fr)_minmax(0,1fr)] xl:items-center",
                      !row.active && "bg-surface-subtle/35",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
                          Bus {row.internal_number}
                        </p>
                        <span className="rounded-md bg-fill-subtle px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-secondary ring-1 ring-border">
                          {row.ppu}
                        </span>
                        <ActiveBadge active={row.active} />
                        {row.in_repair && <Badge tone="warning">En reparacion</Badge>}
                      </div>
                      <p className="mt-1 text-[12px] text-ink-muted">
                        {row.terminal_name} · Zona {row.zone?.trim() || "Sin zona"}
                      </p>
                      <p className="mt-2 text-[11px] text-ink-muted">
                        {row.updated_at
                          ? `Ultima actualizacion: ${formatDateTime(row.updated_at)}`
                          : "Sin marcas registradas para este dia."}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <CheckItem
                        label="B&M"
                        description={row.in_repair ? "Sin registrar por reparacion" : "Barrido y mopeado"}
                        checked={row.bm_completed}
                        disabled={!canEdit || isSaving || row.in_repair}
                        onChange={(checked) =>
                          updateRow(row, {
                            bm_completed: checked,
                            body_wash_completed: row.body_wash_completed,
                            in_repair: row.in_repair,
                          })
                        }
                      />
                      <CheckItem
                        label={row.had_body_wash_yesterday ? "Lavado - lavado ayer" : "Lavado"}
                        description={row.in_repair ? "Sin registrar por reparacion" : "Carroceria"}
                        checked={row.body_wash_completed}
                        disabled={!canEdit || isSaving || row.in_repair}
                        emphasizeYesterday={row.had_body_wash_yesterday}
                        onChange={(checked) =>
                          updateRow(row, {
                            bm_completed: row.bm_completed,
                            body_wash_completed: checked,
                            in_repair: row.in_repair,
                          })
                        }
                      />
                      <CheckItem
                        label="Reparacion"
                        description="Bus detenido"
                        checked={row.in_repair}
                        disabled={!canEdit || isSaving}
                        tone="warning"
                        onChange={(checked) =>
                          updateRow(row, {
                            bm_completed: checked ? false : row.bm_completed,
                            body_wash_completed: checked ? false : row.body_wash_completed,
                            in_repair: checked,
                          })
                        }
                      />
                    </div>

                    {isSaving && (
                      <p className="xl:col-span-2 text-[11px] font-medium text-ink-muted">Guardando...</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function CheckItem({
  label,
  description,
  checked,
  disabled,
  tone = "success",
  emphasizeYesterday = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  tone?: "success" | "warning";
  emphasizeYesterday?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 transition-colors",
        checked
          ? tone === "warning"
            ? "border-warning-200 bg-warning-50/80"
            : "border-success-200 bg-success-50/80"
          : emphasizeYesterday
            ? "border-danger-200 bg-danger-50/75"
            : "border-border bg-surface",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-border-strong accent-brand-600"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
          {checked && <Check className="size-3.5 text-brand-600" aria-hidden />}
          {label}
        </span>
        <span className="block text-[11px] text-ink-muted">{description}</span>
      </span>
    </label>
  );
}

function MetricPill({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "brand" | "success" | "warning";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white/85 text-slate-700",
    brand: "border-brand-200 bg-brand-50/85 text-brand-700",
    success: "border-success-200 bg-success-50/85 text-success-700",
    warning: "border-warning-200 bg-warning-50/85 text-warning-700",
  } as const;

  return (
    <div className={cn("rounded-2xl border px-3.5 py-3", toneClass[tone])}>
      <p className="text-[10.5px] font-semibold tracking-[0.04em] uppercase">{label}</p>
      <p className="mt-2 text-[24px] leading-none font-semibold tracking-[-0.03em] text-ink">
        {value}
      </p>
      <p className="mt-2 text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}
