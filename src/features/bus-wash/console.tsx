"use client";

import { useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bus,
  Check,
  CloudRain,
  Download,
  FileText,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { FilterDate, FilterSelect } from "@/components/ui/filters";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDateOnly, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  bulkMarkBusWashAction,
  exportBusWashDayCsvAction,
  saveBusWashRecordAction,
  setBusWashRainDayAction,
} from "@/features/bus-wash/actions";

/**
 * §Lavado · Consola de operación diaria.
 *
 * TRES DECISIONES DEFINEN ESTE DISEÑO
 * -----------------------------------
 * 1 · La tabla es el trabajo. Todo lo demás —fecha, terminal, búsqueda,
 *     acciones— vive en UNA barra de mando pegajosa que acompaña el scroll.
 *     Nada de tarjetas apiladas empujando la flota fuera de la pantalla.
 *
 * 2 · Marcado OPTIMISTA. La casilla cambia en el instante del clic y el
 *     guardado corre por detrás; si el servidor rechaza, se revierte y se
 *     avisa. Esperar la respuesta para pintar el cambio hacía sentir lenta
 *     cada marca, y en un turno se marcan cientos.
 *
 * 3 · Los indicadores se calculan de las filas EN VIVO: cada clic mueve el
 *     porcentaje al momento. Un número que reacciona confirma que la marca
 *     entró; uno congelado obliga a recargar «para ver si quedó».
 */

export interface BusWashRow {
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

type Flags = Pick<BusWashRow, "bm_completed" | "body_wash_completed" | "in_repair" | "no_wash">;

export function BusWashConsole({
  initialRows,
  date,
  terminals,
  terminalId,
  terminalName,
  canEdit,
  rainReason,
  existingRecordCount,
  existingZones,
}: {
  initialRows: BusWashRow[];
  date: string;
  terminals: { id: string; name: string }[];
  terminalId: string | null;
  terminalName: string | null;
  canEdit: boolean;
  rainReason: string | null;
  existingRecordCount: number;
  existingZones: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [rows, setRows] = useState(initialRows);

  // Si el servidor manda otra flota —cambió terminal o fecha— el estado se pone
  // al día durante el render. Patrón recomendado por React para ajustar estado
  // ante un cambio de prop; un efecto repintaría la tabla entera dos veces.
  const [seed, setSeed] = useState(initialRows);
  if (seed !== initialRows) {
    setSeed(initialRows);
    setRows(initialRows);
  }

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [rainOpen, setRainOpen] = useState(false);
  const [bulkPending, startBulk] = useTransition();
  const [exporting, startExport] = useTransition();

  // Última petición por bus: con clics rápidos sobre el mismo bus sólo la
  // respuesta más reciente puede escribir el estado final.
  const requestSeq = useRef(new Map<string, number>());

  // ── Indicadores en vivo ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const expected = rows.filter((row) => !row.in_repair && !row.no_wash);
    return {
      fleet: rows.length,
      expected: expected.length,
      bm: expected.filter((row) => row.bm_completed).length,
      body: expected.filter((row) => row.body_wash_completed).length,
      inRepair: rows.filter((row) => row.in_repair).length,
      noWash: rows.filter((row) => row.no_wash).length,
      unmarked: rows.filter(
        (row) => !row.bm_completed && !row.body_wash_completed && !row.in_repair && !row.no_wash,
      ).length,
    };
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalized = deferredQuery.trim().toUpperCase();
    if (!normalized) return rows;

    return rows.filter((row) =>
      [row.internal_number, row.ppu, row.zone ?? ""].some((value) =>
        value.toUpperCase().includes(normalized),
      ),
    );
  }, [deferredQuery, rows]);

  const zones = useMemo(() => {
    const grouped = new Map<string, BusWashRow[]>();
    for (const row of visibleRows) {
      const key = row.zone?.trim() || "Sin zona";
      const bucket = grouped.get(key);
      if (bucket) bucket.push(row);
      else grouped.set(key, [row]);
    }
    return [...grouped.entries()];
  }, [visibleRows]);

  // ── Guardado optimista ─────────────────────────────────────────────────────
  function toggle(row: BusWashRow, patch: Partial<Flags>) {
    if (!canEdit) return;

    const next = normalizeFlags({
      bm_completed: row.bm_completed,
      body_wash_completed: row.body_wash_completed,
      in_repair: row.in_repair,
      no_wash: row.no_wash,
      ...patch,
    });

    const previous: Flags = {
      bm_completed: row.bm_completed,
      body_wash_completed: row.body_wash_completed,
      in_repair: row.in_repair,
      no_wash: row.no_wash,
    };

    // La interfaz cambia YA; el servidor confirma después
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, ...next } : item)),
    );

    const seq = (requestSeq.current.get(row.id) ?? 0) + 1;
    requestSeq.current.set(row.id, seq);

    void saveBusWashRecordAction({
      fleet_id: row.id,
      terminal_id: row.terminal_id,
      record_date: date,
      ...next,
    }).then((result) => {
      // Una respuesta vieja no puede pisar una marca más nueva
      if (requestSeq.current.get(row.id) !== seq) return;

      if (!result.ok) {
        setRows((current) =>
          current.map((item) => (item.id === row.id ? { ...item, ...previous } : item)),
        );
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

  function bulkMark(field: "bm_completed" | "body_wash_completed", label: string) {
    if (!terminalId) return;

    startBulk(async () => {
      const result = await bulkMarkBusWashAction({ date, terminalIds: [terminalId], field });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.data.updated === 0
          ? `No había buses pendientes de ${label}.`
          : `${formatNumber(result.data.updated)} buses marcados en ${label}.`,
      );
      router.refresh();
    });
  }

  function exportDay() {
    startExport(async () => {
      const result = await exportBusWashDayCsvAction({ record_date: date });

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

  function pdfHref(tipo: "bm" | "carroceria") {
    const params = new URLSearchParams({ tipo });
    if (terminalId) params.set("terminal", terminalId);
    return `/api/lavado/pendientes?${params.toString()}`;
  }

  const bmPercent = stats.expected === 0 ? null : Math.round((stats.bm / stats.expected) * 100);
  const bodyPercent = stats.expected === 0 ? null : Math.round((stats.body / stats.expected) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* ══ Barra de mando · acompaña el scroll ══════════════════════════════ */}
      <div
        className={cn(
          "liquid edge sticky z-20 rounded-lg px-3 py-2.5 shadow-[var(--shadow-card)] sm:px-4",
          // Bajo la cabecera de la app: a sangre en móvil, flotante en escritorio
          "top-14 lg:top-[4.6rem]",
        )}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <FilterDate paramName="fecha" label="" className="w-[10.5rem]" />
            {terminals.length > 1 && (
              <FilterSelect
                paramName="terminal"
                label=""
                allLabel="Todos mis terminales"
                options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))}
                className="w-full sm:w-56"
              />
            )}
            <div className="min-w-[11rem] flex-1">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Patente o número interno…"
                aria-label="Buscar bus"
                leading={<Search className="size-4" aria-hidden />}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkPending}
                  disabled={!terminalId}
                  title={terminalId ? undefined : "Elija un terminal para registrar"}
                  onClick={() => bulkMark("bm_completed", "barrido y mopeo")}
                  icon={<Sparkles className="size-4" aria-hidden />}
                >
                  Todo B&M
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkPending}
                  disabled={!terminalId}
                  title={terminalId ? undefined : "Elija un terminal para registrar"}
                  onClick={() => bulkMark("body_wash_completed", "lavado de carrocería")}
                  icon={<Check className="size-4" aria-hidden />}
                >
                  Todo lavado
                </Button>
                <Button
                  size="sm"
                  variant={rainReason ? "subtle" : "ghost"}
                  disabled={!terminalId}
                  title={terminalId ? undefined : "Elija un terminal para justificar la lluvia"}
                  onClick={() => setRainOpen(true)}
                  icon={<CloudRain className="size-4" aria-hidden />}
                >
                  Lluvia
                </Button>
                <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
              </>
            )}

            <Link
              href={pdfHref("bm")}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-fill-subtle hover:text-ink"
            >
              <FileText className="size-4" aria-hidden />
              PDF B&M
            </Link>
            <Link
              href={pdfHref("carroceria")}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-fill-subtle hover:text-ink"
            >
              <FileText className="size-4" aria-hidden />
              PDF carrocería
            </Link>

            <div className="ml-auto">
              <Button
                size="sm"
                onClick={exportDay}
                loading={exporting}
                icon={<Download className="size-4" aria-hidden />}
              >
                Cargar día
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Estado del día ═══════════════════════════════════════════════════ */}
      <Card solid>
        <div className="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[1fr_1fr_auto]">
          <Meter label="Barrido y mopeo" done={stats.bm} expected={stats.expected} percent={bmPercent} />
          <Meter
            label="Lavado de carrocería"
            done={stats.body}
            expected={stats.expected}
            percent={bodyPercent}
            muted={Boolean(rainReason)}
          />

          <div className="flex items-center gap-4 text-[12px] text-ink-secondary">
            <span className="flex items-center gap-1.5" title="Flota del día">
              <Bus className="size-3.5 text-ink-subtle" aria-hidden />
              <strong className="font-semibold text-ink tabular-nums">
                {formatNumber(stats.fleet)}
              </strong>
            </span>
            <span className="flex items-center gap-1.5" title="En reparación">
              <Wrench className="size-3.5 text-warning-600" aria-hidden />
              <strong className="font-semibold text-ink tabular-nums">
                {formatNumber(stats.inRepair)}
              </strong>
            </span>
            <span className="flex items-center gap-1.5 text-danger-700" title="Sin lavado">
              <strong className="font-semibold tabular-nums">{formatNumber(stats.noWash)}</strong>
              sin lavado
            </span>
            {stats.unmarked > 0 && (
              <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                {formatNumber(stats.unmarked)} sin marcar
              </span>
            )}
          </div>
        </div>

        {(rainReason || existingRecordCount > 0) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-2 text-[11.5px] text-ink-muted sm:px-5">
            {rainReason && (
              <span className="flex items-center gap-1.5 text-info-700">
                <CloudRain className="size-3.5" aria-hidden />
                Día de lluvia — {rainReason}
              </span>
            )}
            {existingRecordCount > 0 && (
              <span>
                {formatNumber(existingRecordCount)} marcas guardadas para el{" "}
                {formatDateOnly(date)}
                {existingZones.length > 0 && ` en ${existingZones.join(", ")}`}. Editar actualiza
                ese mismo día.
              </span>
            )}
          </div>
        )}
      </Card>

      {/* ══ Flota por zona ═══════════════════════════════════════════════════ */}
      {zones.length === 0 ? (
        <Card solid>
          <EmptyState
            icon={<Bus className="size-5" aria-hidden />}
            title={rows.length === 0 ? "No hay buses disponibles" : "Ningún bus coincide"}
            description={
              rows.length === 0
                ? "No se encontraron buses en los terminales autorizados."
                : "Pruebe con otra patente o número interno."
            }
          />
        </Card>
      ) : (
        zones.map(([zone, zoneRows]) => <ZoneSection key={zone} zone={zone} rows={zoneRows} canEdit={canEdit} onToggle={toggle} />)
      )}

      {!canEdit && (
        <Alert tone="info">Su rol permite consultar el registro, no modificarlo.</Alert>
      )}

      {terminalId && (
        <RainModal
          open={rainOpen}
          onClose={() => setRainOpen(false)}
          date={date}
          terminalId={terminalId}
          terminalName={terminalName}
          currentReason={rainReason}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Medidor vivo: se recalcula con cada clic sobre la flota. */
function Meter({
  label,
  done,
  expected,
  percent,
  muted = false,
}: {
  label: string;
  done: number;
  expected: number;
  percent: number | null;
  /** Atenuado cuando la faena no se exige (día de lluvia). */
  muted?: boolean;
}) {
  return (
    <div className={cn(muted && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-medium text-ink-secondary">{label}</span>
        <span className="text-[16px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
          {percent === null ? "—" : `${percent}%`}
          <span className="ml-1.5 text-[11px] font-normal text-ink-subtle">
            {formatNumber(done)}/{formatNumber(expected)}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-[6px] w-full overflow-hidden rounded-full bg-fill-subtle">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-[var(--ease-standard)]"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function ZoneSection({
  zone,
  rows,
  canEdit,
  onToggle,
}: {
  zone: string;
  rows: BusWashRow[];
  canEdit: boolean;
  onToggle: (row: BusWashRow, patch: Partial<Flags>) => void;
}) {
  const done = rows.filter(
    (row) => row.bm_completed || row.body_wash_completed || row.in_repair || row.no_wash,
  ).length;
  const complete = done === rows.length;

  return (
    <Card solid className="overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface-subtle px-4 py-2.5 sm:px-5">
        <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{zone}</h3>
        <span className="text-[11.5px] text-ink-muted tabular-nums">
          {formatNumber(rows.length)} bus{rows.length === 1 ? "" : "es"}
        </span>

        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums",
            complete ? "bg-success-50 text-success-700" : "bg-fill-subtle text-ink-muted",
          )}
        >
          {complete ? "Registro completo" : `${formatNumber(done)}/${formatNumber(rows.length)} registrados`}
        </span>
      </header>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <BusRow key={row.id} row={row} canEdit={canEdit} onToggle={onToggle} />
        ))}
      </ul>
    </Card>
  );
}

function BusRow({
  row,
  canEdit,
  onToggle,
}: {
  row: BusWashRow;
  canEdit: boolean;
  onToggle: (row: BusWashRow, patch: Partial<Flags>) => void;
}) {
  const blocked = row.in_repair || row.no_wash;

  return (
    <li
      className={cn(
        "flex flex-col gap-2 px-4 py-2.5 transition-colors sm:px-5 lg:flex-row lg:items-center lg:gap-4",
        "hover:bg-fill-subtle",
        blocked && "bg-surface-subtle/60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink tabular-nums">
          {row.internal_number}
        </span>
        <span className="rounded-xs bg-fill-subtle px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-secondary">
          {row.ppu}
        </span>
        {!row.active && (
          <span className="text-[10.5px] font-medium text-ink-subtle uppercase">Inactivo</span>
        )}
        <span className="hidden truncate text-[11px] text-ink-subtle sm:inline">
          {row.terminal_name}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:w-[27rem] lg:shrink-0">
        <Pill
          label="B&M"
          checked={row.bm_completed}
          disabled={!canEdit || blocked}
          tone="success"
          onClick={() =>
            onToggle(row, { bm_completed: !row.bm_completed, no_wash: false })
          }
        />
        <Pill
          label="Lavado"
          tag={row.had_body_wash_yesterday ? "ayer" : undefined}
          checked={row.body_wash_completed}
          disabled={!canEdit || blocked}
          tone="info"
          onClick={() =>
            onToggle(row, { body_wash_completed: !row.body_wash_completed, no_wash: false })
          }
        />
        <Pill
          label="Reparación"
          checked={row.in_repair}
          disabled={!canEdit || row.no_wash}
          tone="warning"
          onClick={() => onToggle(row, { in_repair: !row.in_repair, no_wash: false })}
        />
        <Pill
          label="Sin lavado"
          checked={row.no_wash}
          disabled={!canEdit || row.in_repair}
          tone="danger"
          onClick={() => onToggle(row, { no_wash: !row.no_wash, in_repair: false })}
        />
      </div>
    </li>
  );
}

const PILL_TONES = {
  success: "border-success-200 bg-success-50 text-success-700",
  info: "border-info-200 bg-info-50 text-info-700",
  warning: "border-warning-200 bg-warning-50 text-warning-700",
  danger: "border-danger-200 bg-danger-50 text-danger-700",
} as const;

/**
 * Casilla en forma de pastilla-botón.
 *
 * Toda la superficie es objetivo de clic (36 px de alto): en un turno se marcan
 * cientos, y un checkbox de 16 px obliga a apuntar. `aria-pressed` la anuncia
 * como conmutador a los lectores de pantalla.
 */
function Pill({
  label,
  tag,
  checked,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  tag?: string;
  checked: boolean;
  disabled: boolean;
  tone: keyof typeof PILL_TONES;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-md border text-[12px] font-medium",
        "transition-colors duration-150",
        checked
          ? PILL_TONES[tone]
          : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink-secondary",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      {checked && <Check className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{label}</span>
      {tag && !checked && (
        <span className="rounded-full bg-info-50 px-1.5 text-[9.5px] font-semibold text-info-700 uppercase">
          {tag}
        </span>
      )}
    </button>
  );
}

/** Justificación del día de lluvia. No bloquea el registro: sólo lo explica. */
function RainModal({
  open,
  onClose,
  date,
  terminalId,
  terminalName,
  currentReason,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  terminalId: string;
  terminalName: string | null;
  currentReason: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState(currentReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(value: string | null) {
    setError(null);

    startTransition(async () => {
      const result = await setBusWashRainDayAction({ date, terminalId, reason: value });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(value === null ? "Se quitó el día de lluvia." : "Día de lluvia registrado.");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Día de lluvia"
      description={`No se lavó carrocería en ${terminalName ?? "este terminal"}.`}
      size="sm"
      busy={pending}
      footer={
        <div className="flex flex-1 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {currentReason ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => save(null)}>
              Quitar marca
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" size="sm" disabled={pending} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" loading={pending} onClick={() => save(reason)}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}

        <p className="text-[12.5px] leading-relaxed text-ink-secondary">
          El barrido y mopeo se registra con normalidad, y el lavado de carrocería
          <strong className="font-medium text-ink"> tampoco queda bloqueado</strong>: si escampa y
          alcanzan a lavar, márquelo igual.
        </p>

        <Field label="Motivo" required htmlFor="rain-reason">
          <Input
            id="rain-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lluvia durante toda la jornada"
            maxLength={500}
            disabled={pending}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reglas de exclusión entre marcas, las mismas de la base de datos:
 * reparación y «sin lavado» anulan las faenas y se excluyen entre sí.
 */
function normalizeFlags(flags: Flags): Flags {
  if (flags.in_repair) {
    return { bm_completed: false, body_wash_completed: false, in_repair: true, no_wash: false };
  }
  if (flags.no_wash) {
    return { bm_completed: false, body_wash_completed: false, in_repair: false, no_wash: true };
  }
  return flags;
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
