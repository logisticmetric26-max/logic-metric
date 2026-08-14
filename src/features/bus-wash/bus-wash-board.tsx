"use client";

import { useDeferredValue, useMemo, useState, useTransition, type FormEvent } from "react";
import { Bus, Check, Download, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, ActiveBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportBusWashDayCsvAction, saveBusWashRecordAction } from "@/features/bus-wash/actions";

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
  no_wash: boolean;
  had_body_wash_yesterday: boolean;
  updated_at: string | null;
}

type BusWashFlags = Pick<
  BusWashListRow,
  "bm_completed" | "body_wash_completed" | "in_repair" | "no_wash"
>;

export function BusWashBoard({
  initialRows,
  date,
  existingRecordCount,
  existingZones,
  canEdit,
}: {
  initialRows: BusWashListRow[];
  date: string;
  existingRecordCount: number;
  existingZones: string[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);

  // Red de seguridad: si el servidor manda otra flota —cambió el terminal, la
  // fecha o la búsqueda— el estado interno se pone al día durante el render.
  // Es el patrón que React recomienda para ajustar estado ante un cambio de
  // prop, y no un efecto: sin él, la tabla se quedaba mostrando la flota
  // anterior y había que recargar la página a mano.
  const [semilla, setSemilla] = useState(initialRows);
  if (semilla !== initialRows) {
    setSemilla(initialRows);
    setRows(initialRows);
  }
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [exporting, startExportTransition] = useTransition();
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

  const groupedRows = useMemo(() => [...groupRowsByZone(filteredRows).entries()], [filteredRows]);

  const summary = useMemo(
    () => ({
      total: filteredRows.length,
      bm: filteredRows.filter((row) => row.bm_completed).length,
      bodyWash: filteredRows.filter((row) => row.body_wash_completed).length,
      inRepair: filteredRows.filter((row) => row.in_repair).length,
      noWash: filteredRows.filter((row) => row.no_wash).length,
    }),
    [filteredRows],
  );

  function updateRow(row: BusWashListRow, patch: BusWashFlags) {
    const next = normalizeFlags({ ...row, ...patch });
    setSavingId(row.id);

    startTransition(async () => {
      const result = await saveBusWashRecordAction({
        fleet_id: row.id,
        terminal_id: row.terminal_id,
        record_date: date,
        bm_completed: next.bm_completed,
        body_wash_completed: next.body_wash_completed,
        in_repair: next.in_repair,
        no_wash: next.no_wash,
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
                no_wash: result.data.no_wash,
                updated_at: result.data.updated_at,
              }
            : item,
        ),
      );
    });
  }

  function handleLoadDaySubmit(event: FormEvent<HTMLFormElement>) {
    // Antes se bloqueaba el envío si faltaban buses por registrar. El histórico
    // tiene que recibir la flota entera cada día: «sin registro» también es
    // información —dice que ese bus no se aseó— y negarse a guardar dejaba el
    // día sin ningún respaldo, que es peor que uno parcial.
    if (!canEdit) event.preventDefault();
  }

  function handleDayExport() {
    // Sin comprobación previa: el archivo del día se genera aunque falten
    // registros, y los buses sin marca salen identificados como SIN REGISTRO.
    startExportTransition(async () => {
      const result = await exportBusWashDayCsvAction({
        record_date: date,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      downloadCsv(result.data.file_name, result.data.csv_content);
      toast.success(
        `Archivo ${result.data.file_name} generado con ${formatNumber(result.data.row_count)} buses.`,
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
              Registro diario por bus para barrido y mopeado, lavado de carroceria, estado en
              reparacion y buses sin lavado, ordenado por zona operacional.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricPill
                label="Fecha"
                value={formatDateOnly(date)}
                hint="Dia operativo"
                tone="neutral"
              />
              <MetricPill
                label="Flota visible"
                value={formatNumber(summary.total)}
                hint="Buses en pantalla"
                tone="brand"
              />
              <MetricPill
                label="B&M"
                value={formatNumber(summary.bm)}
                hint="Marcados como realizados"
                tone="success"
              />
              <MetricPill
                label="Lavado"
                value={formatNumber(summary.bodyWash)}
                hint="Carroceria realizada"
                tone="info"
              />
              <MetricPill
                label="Rep. / sin"
                value={`${formatNumber(summary.inRepair)} / ${formatNumber(summary.noWash)}`}
                hint="Reparacion / sin lavado"
                tone="warning"
              />
            </div>
          </div>

          <div className="grid gap-3">
            <Card solid className="border-slate-200/80 bg-white/85">
              <form
                action="/lavado-buses"
                method="get"
                onSubmit={handleLoadDaySubmit}
                className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"
              >
                <Field label="Dia de registro" htmlFor="bus-wash-date">
                  <Input id="bus-wash-date" name="fecha" type="date" defaultValue={date} required />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" fullWidth>
                    Abrir dia
                  </Button>
                </div>
              </form>
            </Card>

            <Card solid className="border-slate-200/80 bg-white/85">
              <div className="space-y-3 p-4">
                <Button
                  onClick={handleDayExport}
                  loading={exporting}
                  fullWidth
                  icon={<Download className="size-4" aria-hidden />}
                >
                  Cargar dia
                </Button>
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

      {existingRecordCount > 0 && (
        <Alert tone="warning" title="El dia cargado ya mantiene registros de lavado.">
          Se encontraron {formatNumber(existingRecordCount)} marcas guardadas para el{" "}
          <strong>{formatDateOnly(date)}</strong>.
          {existingZones.length > 0
            ? ` Ya existen registros en: ${existingZones.join(", ")}.`
            : ""}
          {" "}Si continua editando, actualizara ese mismo dia operativo.
        </Alert>
      )}

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
        groupedRows.map(([zone, zoneRows]) => {
          const incompleteCount = zoneRows.filter((row) => !hasAnyStatus(row)).length;
          const bmCount = zoneRows.filter((row) => row.bm_completed).length;
          const bodyWashCount = zoneRows.filter((row) => row.body_wash_completed).length;
          const repairCount = zoneRows.filter((row) => row.in_repair).length;
          const noWashCount = zoneRows.filter((row) => row.no_wash).length;

          return (
            <Card key={zone} solid className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-subtle/55 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-[16px] font-semibold tracking-[-0.02em] text-ink">{zone}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {formatNumber(zoneRows.length)} bus{zoneRows.length === 1 ? "" : "es"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={incompleteCount === 0 ? "success" : "warning"}>
                    {incompleteCount === 0
                      ? "Registro completo"
                      : `${formatNumber(incompleteCount)} pendientes`}
                  </Badge>
                  <Badge tone="success">{formatNumber(bmCount)} B&M</Badge>
                  <Badge tone="info">{formatNumber(bodyWashCount)} lavado</Badge>
                  <Badge tone="neutral">{formatNumber(repairCount)} en reparacion</Badge>
                  <Badge tone="danger">{formatNumber(noWashCount)} sin lavado</Badge>
                </div>
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
                          {row.no_wash && <Badge tone="danger">Sin lavado</Badge>}
                        </div>
                        <p className="mt-1 text-[12px] text-ink-muted">
                          {row.terminal_name} - Zona {row.zone?.trim() || "Sin zona"}
                        </p>
                        <p className="mt-2 text-[11px] text-ink-muted">
                          {row.updated_at
                            ? `Ultima actualizacion: ${formatDateTime(row.updated_at)}`
                            : "Sin marcas registradas para este dia."}
                        </p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <CheckItem
                          label="B&M"
                          description={
                            row.in_repair
                              ? "Sin registrar por reparacion"
                              : row.no_wash
                                ? "Sin registrar por sin lavado"
                                : "Barrido y mopeado"
                          }
                          checked={row.bm_completed}
                          disabled={!canEdit || isSaving || row.in_repair || row.no_wash}
                          onChange={(checked) =>
                            updateRow(row, {
                              bm_completed: checked,
                              body_wash_completed: row.body_wash_completed,
                              in_repair: row.in_repair,
                              no_wash: checked ? false : row.no_wash,
                            })
                          }
                        />
                        <CheckItem
                          label={row.had_body_wash_yesterday ? "Lavado - lavado ayer" : "Lavado"}
                          description={
                            row.in_repair
                              ? "Sin registrar por reparacion"
                              : row.no_wash
                                ? "Sin registrar por sin lavado"
                                : "Carroceria"
                          }
                          checked={row.body_wash_completed}
                          disabled={!canEdit || isSaving || row.in_repair || row.no_wash}
                          emphasizeYesterday={row.had_body_wash_yesterday}
                          onChange={(checked) =>
                            updateRow(row, {
                              bm_completed: row.bm_completed,
                              body_wash_completed: checked,
                              in_repair: row.in_repair,
                              no_wash: checked ? false : row.no_wash,
                            })
                          }
                        />
                        <CheckItem
                          label="Reparacion"
                          description={row.no_wash ? "No disponible por sin lavado" : "Bus detenido"}
                          checked={row.in_repair}
                          disabled={!canEdit || isSaving || row.no_wash}
                          tone="warning"
                          onChange={(checked) =>
                            updateRow(row, {
                              bm_completed: checked ? false : row.bm_completed,
                              body_wash_completed: checked ? false : row.body_wash_completed,
                              in_repair: checked,
                              no_wash: false,
                            })
                          }
                        />
                        <CheckItem
                          label="Sin lavado"
                          description={row.in_repair ? "No disponible por reparacion" : "Bus sin lavado"}
                          checked={row.no_wash}
                          disabled={!canEdit || isSaving || row.in_repair}
                          tone="danger"
                          onChange={(checked) =>
                            updateRow(row, {
                              bm_completed: checked ? false : row.bm_completed,
                              body_wash_completed: checked ? false : row.body_wash_completed,
                              in_repair: false,
                              no_wash: checked,
                            })
                          }
                        />
                      </div>

                      {isSaving && (
                        <p className="xl:col-span-2 text-[11px] font-medium text-ink-muted">
                          Guardando...
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
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
  tone?: "success" | "warning" | "danger";
  emphasizeYesterday?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const checkedClass =
    tone === "warning"
      ? "border-warning-200 bg-warning-50/80"
      : tone === "danger"
        ? "border-danger-200 bg-danger-50/80"
        : "border-success-200 bg-success-50/80";

  const iconClass =
    tone === "warning" ? "text-warning-700" : tone === "danger" ? "text-danger-700" : "text-brand-600";

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 transition-colors",
        checked
          ? checkedClass
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
          {checked && <Check className={cn("size-3.5", iconClass)} aria-hidden />}
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
  tone: "neutral" | "brand" | "success" | "warning" | "info";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white/85 text-slate-700",
    brand: "border-brand-200 bg-brand-50/85 text-brand-700",
    success: "border-success-200 bg-success-50/85 text-success-700",
    warning: "border-warning-200 bg-warning-50/85 text-warning-700",
    info: "border-info-200 bg-info-50/85 text-info-700",
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

function groupRowsByZone(sourceRows: BusWashListRow[]) {
  const grouped = new Map<string, BusWashListRow[]>();

  for (const row of sourceRows) {
    const key = normalizeZoneLabel(row.zone);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  return grouped;
}

function normalizeFlags(row: BusWashFlags): BusWashFlags {
  if (row.in_repair) {
    return {
      ...row,
      bm_completed: false,
      body_wash_completed: false,
      no_wash: false,
    };
  }

  if (row.no_wash) {
    return {
      ...row,
      bm_completed: false,
      body_wash_completed: false,
      in_repair: false,
    };
  }

  return row;
}

function hasAnyStatus(row: BusWashFlags) {
  return row.bm_completed || row.body_wash_completed || row.in_repair || row.no_wash;
}

function normalizeZoneLabel(zone: string | null | undefined) {
  return zone?.trim() || "Sin zona";
}

function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
