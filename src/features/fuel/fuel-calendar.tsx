"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Droplets,
  Moon,
  Pencil,
  Plus,
  Sun,
  Truck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FilterDate, FilterSelect } from "@/components/ui/filters";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  confirmFuelDeliveryAction,
  createFuelDeliveryAction,
  importFuelDeliveriesAction,
  updateFuelDeliveryAction,
} from "@/features/fuel/actions";
import { FUEL_IMPORT_TEMPLATE_COLUMNS } from "@/features/fuel/import";
import {
  DEFAULT_TIME_ZONE,
  formatDateOnly,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  FuelDeliveryProduct,
  FuelDeliveryScheduleViewRow,
  FuelReceptionWindow,
} from "@/types/database.types";

const PRODUCT_OPTIONS: Array<{ value: FuelDeliveryProduct; label: string }> = [
  { value: "FUEL", label: "Combustible" },
  { value: "ADBLUE", label: "AdBlue" },
];

const WINDOW_OPTIONS: Array<{ value: FuelReceptionWindow; label: string }> = [
  { value: "AM", label: "Ventana AM" },
  { value: "PM", label: "Ventana PM" },
];

interface Props {
  items: FuelDeliveryScheduleViewRow[];
  terminals: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canConfirm: boolean;
  canBulkImport: boolean;
  rangeLabel: string;
  from: string;
  to: string;
  today: string;
}

export function FuelCalendar({
  items,
  terminals,
  canCreate,
  canEdit,
  canConfirm,
  canBulkImport,
  rangeLabel,
  from,
  to,
  today,
}: Props) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<FuelDeliveryScheduleViewRow | null>(null);
  const [confirming, setConfirming] = useState<FuelDeliveryScheduleViewRow | null>(null);
  const [pending, startTransition] = useTransition();

  const days = useMemo(() => buildDateRange(from, to), [from, to]);
  const grouped = useMemo(() => groupSchedules(items), [items]);

  const overdue = items.filter((item) => item.alert_status === "OVERDUE" && !item.confirmed_at);
  const pendingToday = items.filter(
    (item) =>
      item.scheduled_date === today &&
      (item.alert_status === "TODAY" || item.alert_status === "OVERDUE") &&
      !item.confirmed_at,
  );
  const confirmed = items.filter((item) => item.confirmed_at);
  const adblue = items.filter((item) => item.product_type === "ADBLUE");

  function confirmArrival() {
    if (!confirming) return;
    const target = confirming;

    startTransition(async () => {
      const result = await confirmFuelDeliveryAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Llegada confirmada correctamente.");
      setConfirming(null);
    });
  }

  const hasPrimaryActions = canCreate || canBulkImport;

  return (
    <>
      <Card solid className="overflow-hidden">
        <div className="grid gap-5 bg-[linear-gradient(135deg,rgba(84,101,122,0.06),rgba(196,139,89,0.08),rgba(255,255,255,0.7))] p-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="min-w-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium tracking-[0.04em] text-slate-600 uppercase">
                  <Truck className="size-3.5" aria-hidden />
                  Agenda de recepcion
                </div>
                <h2 className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.035em] text-ink">
                  Combustible
                </h2>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
                  Calendario operativo de solicitudes y llegadas de combustible y AdBlue por terminal,
                  con alertas dinamicas segun la ventana de recepcion.
                </p>
              </div>

              {hasPrimaryActions && (
                <div className="flex flex-wrap items-center gap-2">
                  {canBulkImport && (
                    <Button
                      variant="secondary"
                      onClick={() => setImporting(true)}
                      icon={<Upload className="size-4" aria-hidden />}
                    >
                      Carga masiva
                    </Button>
                  )}
                  {canCreate && (
                    <Button
                      onClick={() => setCreating(true)}
                      icon={<Plus className="size-4" aria-hidden />}
                    >
                      Registrar solicitud
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  className="w-full"
                />
              )}
              <FilterSelect
                paramName="producto"
                label="Producto"
                allLabel="Todos los productos"
                options={PRODUCT_OPTIONS}
                className="w-full"
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricPill
                label="Programadas"
                value={items.length}
                hint={rangeLabel}
                tone="neutral"
                icon={<CalendarClock className="size-4" aria-hidden />}
              />
              <MetricPill
                label="Pendientes hoy"
                value={pendingToday.length}
                hint="Recepciones activas del dia"
                tone="warning"
                icon={<Clock3 className="size-4" aria-hidden />}
              />
              <MetricPill
                label="Atrasadas"
                value={overdue.length}
                hint="No confirmadas fuera de plazo"
                tone="danger"
                icon={<AlertTriangle className="size-4" aria-hidden />}
              />
              <MetricPill
                label="AdBlue"
                value={adblue.length}
                hint="Con alerta desde las 15:00"
                tone="brand"
                icon={<Droplets className="size-4" aria-hidden />}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <Card solid className="border-slate-200/80 bg-white/80">
              <div className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.04em] text-ink-muted uppercase">
                      Radar del dia
                    </p>
                    <p className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-ink">
                      {overdue.length > 0
                        ? "Hay recepciones fuera de ventana"
                        : pendingToday.length > 0
                          ? "Aun quedan llegadas por confirmar"
                          : "Operacion en orden"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-2xl",
                      overdue.length > 0
                        ? "bg-danger-50 text-danger-600"
                        : pendingToday.length > 0
                          ? "bg-warning-50 text-warning-700"
                          : "bg-success-50 text-success-600",
                    )}
                  >
                    {overdue.length > 0 ? (
                      <AlertTriangle className="size-5" aria-hidden />
                    ) : pendingToday.length > 0 ? (
                      <Clock3 className="size-5" aria-hidden />
                    ) : (
                      <CheckCircle2 className="size-5" aria-hidden />
                    )}
                  </span>
                </div>

                {overdue.length > 0 ? (
                  <Alert
                    tone="danger"
                    title={`${formatNumber(overdue.length)} llegadas requieren confirmacion inmediata`}
                  >
                    Revise primero los terminales que ya quedaron fuera de plazo.
                  </Alert>
                ) : pendingToday.length > 0 ? (
                  <Alert
                    tone="warning"
                    title={`${formatNumber(pendingToday.length)} llegadas siguen pendientes hoy`}
                  >
                    Confirme recepciones dentro de su ventana AM, PM o del corte de AdBlue.
                  </Alert>
                ) : (
                  <Alert tone="success" title="Sin alertas vencidas">
                    Las recepciones programadas no muestran atraso operativo en este momento.
                  </Alert>
                )}
              </div>
            </Card>

            <Card solid className="border-slate-200/80 bg-white/80">
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <MiniMetric
                  label="Confirmadas"
                  value={confirmed.length}
                  sublabel="Recepciones cerradas"
                />
                <MiniMetric
                  label="Pendientes"
                  value={items.length - confirmed.length}
                  sublabel="Esperando confirmacion"
                />
              </div>
            </Card>
          </div>
        </div>
      </Card>

      {overdue.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {overdue.slice(0, 4).map((item) => (
            <Alert key={item.id} tone="danger" title={`${item.terminal_name} - ${productLabel(item.product_type)}`}>
              <span className="block">
                Programada para {formatDateOnly(item.scheduled_date)} en {windowLabel(item.reception_window)}.
              </span>
              <span className="mt-1 block">
                Debio confirmarse antes de las {deadlineLabel(item.alert_deadline)}.
              </span>
            </Alert>
          ))}
        </div>
      )}

      <div className="mt-4">
        {items.length === 0 ? (
          <Card solid>
            <EmptyState
              icon={<Truck className="size-5" aria-hidden />}
              title="No hay llegadas programadas en este rango"
              description={
                hasPrimaryActions
                  ? "Registre o importe recepciones de combustible y AdBlue para empezar a poblar la agenda."
                  : "Ajuste el rango o espere nuevas programaciones en sus terminales autorizados."
              }
              action={
                hasPrimaryActions ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {canBulkImport && (
                      <Button
                        variant="secondary"
                        onClick={() => setImporting(true)}
                        icon={<Upload className="size-4" aria-hidden />}
                      >
                        Carga masiva
                      </Button>
                    )}
                    {canCreate && (
                      <Button
                        onClick={() => setCreating(true)}
                        icon={<Plus className="size-4" aria-hidden />}
                      >
                        Registrar solicitud
                      </Button>
                    )}
                  </div>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {days.map((day) => (
                <DayColumn
                  key={day.date}
                  day={day}
                  amItems={grouped.get(`${day.date}:AM`) ?? []}
                  pmItems={grouped.get(`${day.date}:PM`) ?? []}
                  canEdit={canEdit}
                  canConfirm={canConfirm}
                  onEdit={setEditing}
                  onConfirm={setConfirming}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {canBulkImport && importing && (
        <FuelBulkImportModal
          open
          onClose={() => setImporting(false)}
          onSaved={(inserted) => {
            setImporting(false);
            toast.success(`${formatNumber(inserted)} solicitudes importadas correctamente.`);
          }}
        />
      )}

      {canCreate && (
        <FuelDeliveryFormModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Llegada programada correctamente.");
          }}
          terminals={terminals}
        />
      )}

      {canEdit && editing && (
        <FuelDeliveryFormModal
          open
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Programacion actualizada.");
          }}
          terminals={terminals}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={confirmArrival}
        loading={pending}
        tone="primary"
        title="Confirmar llegada"
        confirmLabel="Confirmar recepcion"
        message={
          confirming ? (
            <>
              <p>
                Se confirmara la llegada de <strong>{productLabel(confirming.product_type)}</strong>{" "}
                para <strong>{confirming.terminal_name}</strong>.
              </p>
              <p className="mt-2">
                Fecha programada: <strong>{formatDateOnly(confirming.scheduled_date)}</strong> en{" "}
                <strong>{windowLabel(confirming.reception_window)}</strong>.
              </p>
              <p className="mt-2">
                Solicitud <strong>{confirming.request_reference}</strong> por{" "}
                <strong>{formatQuantity(confirming.requested_quantity_m3)}</strong>.
              </p>
            </>
          ) : null
        }
      />
    </>
  );
}

function DayColumn({
  day,
  amItems,
  pmItems,
  canEdit,
  canConfirm,
  onEdit,
  onConfirm,
}: {
  day: { date: string; title: string; subtitle: string };
  amItems: FuelDeliveryScheduleViewRow[];
  pmItems: FuelDeliveryScheduleViewRow[];
  canEdit: boolean;
  canConfirm: boolean;
  onEdit: (item: FuelDeliveryScheduleViewRow) => void;
  onConfirm: (item: FuelDeliveryScheduleViewRow) => void;
}) {
  const total = amItems.length + pmItems.length;
  const overdue = [...amItems, ...pmItems].filter((item) => item.alert_status === "OVERDUE").length;

  return (
    <Card solid className="w-[320px] border-slate-200">
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-[linear-gradient(135deg,rgba(99,115,129,0.06),rgba(255,255,255,0.95))] px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ink">{day.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">{day.subtitle}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-semibold text-ink">{formatNumber(total)}</p>
              <p className="text-[10.5px] text-ink-muted">
                {overdue > 0 ? `${formatNumber(overdue)} en alerta` : "Sin atraso"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-3 p-3">
          <WindowLane
            label="Ventana AM"
            icon={<Sun className="size-4" aria-hidden />}
            items={amItems}
            canEdit={canEdit}
            canConfirm={canConfirm}
            onEdit={onEdit}
            onConfirm={onConfirm}
          />
          <WindowLane
            label="Ventana PM"
            icon={<Moon className="size-4" aria-hidden />}
            items={pmItems}
            canEdit={canEdit}
            canConfirm={canConfirm}
            onEdit={onEdit}
            onConfirm={onConfirm}
          />
        </div>
      </div>
    </Card>
  );
}

function WindowLane({
  label,
  icon,
  items,
  canEdit,
  canConfirm,
  onEdit,
  onConfirm,
}: {
  label: string;
  icon: ReactNode;
  items: FuelDeliveryScheduleViewRow[];
  canEdit: boolean;
  canConfirm: boolean;
  onEdit: (item: FuelDeliveryScheduleViewRow) => void;
  onConfirm: (item: FuelDeliveryScheduleViewRow) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-subtle/55 p-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-ink-secondary">
          {icon}
          {label}
        </span>
        <span className="text-[10.5px] text-ink-muted">
          {formatNumber(items.length)} programadas
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white/70 px-3 py-4 text-center text-[11px] text-ink-muted">
          Sin camiones programados.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <DeliveryCard
              key={item.id}
              item={item}
              canEdit={canEdit}
              canConfirm={canConfirm}
              onEdit={() => onEdit(item)}
              onConfirm={() => onConfirm(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveryCard({
  item,
  canEdit,
  canConfirm,
  onEdit,
  onConfirm,
}: {
  item: FuelDeliveryScheduleViewRow;
  canEdit: boolean;
  canConfirm: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const toneClass =
    item.alert_status === "OVERDUE"
      ? "border-danger-200 bg-danger-50/85"
      : item.confirmed_at
        ? "border-success-200 bg-success-50/80"
        : item.product_type === "ADBLUE"
          ? "border-sky-200 bg-sky-50/80"
          : "border-slate-200 bg-white";

  const canModify = canEdit && !item.confirmed_at;
  const canMarkArrival = canConfirm && !item.confirmed_at;

  return (
    <div className={cn("rounded-xl border p-3 shadow-[0_1px_2px_rgb(15_18_34/0.05)]", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.product_type === "ADBLUE" ? "info" : "neutral"}>
              {productLabel(item.product_type)}
            </Badge>
            <Badge tone={alertTone(item.alert_status)}>{alertLabel(item.alert_status)}</Badge>
          </div>
          <p className="mt-2 text-[14px] font-semibold text-ink">{item.terminal_name}</p>
          <p className="mt-1 text-[11.5px] text-ink-muted">Solicitud {item.request_reference}</p>
          <p className="mt-1 text-[11.5px] text-ink-muted">
            Confirmar antes de las {deadlineLabel(item.alert_deadline)}.
          </p>
        </div>

        <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-[10.5px] font-medium text-ink-secondary">
          {windowLabel(item.reception_window)}
        </span>
      </div>

      {(item.supplier_name || item.notes || item.truck_reference) && (
        <div className="mt-3 space-y-1.5 text-[11.5px] text-ink-secondary">
          <p>
            <span className="font-medium text-ink">Producto:</span> {item.product_label}
          </p>
          <p>
            <span className="font-medium text-ink">Cantidad:</span>{" "}
            {formatQuantity(item.requested_quantity_m3)}
          </p>
          <p>
            <span className="font-medium text-ink">Recepcion:</span> {item.reception_time_range}
          </p>
          {item.supplier_name && (
            <p>
              <span className="font-medium text-ink">Razon social:</span> {item.supplier_name}
            </p>
          )}
          {item.truck_reference && (
            <p>
              <span className="font-medium text-ink">Camion:</span> {item.truck_reference}
            </p>
          )}
          <p className="leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">Direccion:</span> {item.delivery_address}
          </p>
          {item.notes && <p className="leading-relaxed text-ink-muted">{item.notes}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10.5px] text-ink-muted">
          {item.confirmed_at ? (
            <>
              Confirmado el {formatDateTime(item.confirmed_at)}
              {item.confirmed_by_name ? ` por ${item.confirmed_by_name}` : ""}.
            </>
          ) : (
            <>Registrado por {item.created_by_name ?? "usuario autorizado"}.</>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canModify && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              icon={<Pencil className="size-4" aria-hidden />}
            >
              Editar
            </Button>
          )}
          {canMarkArrival && (
            <Button
              size="sm"
              onClick={onConfirm}
              icon={<CheckCircle2 className="size-4" aria-hidden />}
            >
              Confirmar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "neutral" | "warning" | "danger" | "brand";
  icon: ReactNode;
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white/85 text-slate-700",
    warning: "border-warning-200 bg-warning-50/85 text-warning-800",
    danger: "border-danger-200 bg-danger-50/85 text-danger-700",
    brand: "border-sky-200 bg-sky-50/85 text-sky-700",
  } as const;

  return (
    <div className={cn("rounded-2xl border px-3.5 py-3", toneClass[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10.5px] font-semibold tracking-[0.04em] uppercase">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-white/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.03em] text-ink">
        {formatNumber(value)}
      </p>
      <p className="mt-2 text-[11px] text-ink-muted">{hint}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-subtle/70 px-3.5 py-3">
      <p className="text-[10.5px] font-semibold tracking-[0.04em] text-ink-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em] text-ink">
        {formatNumber(value)}
      </p>
      <p className="mt-2 text-[11px] text-ink-muted">{sublabel}</p>
    </div>
  );
}

function FuelBulkImportModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (inserted: number) => void;
}) {
  const toast = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setIssues([]);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await importFuelDeliveriesAction(formData);

      if (!result.ok) {
        const nextErrors = result.fieldErrors ?? {};
        setFieldErrors(nextErrors);
        setIssues(
          nextErrors.file_details
            ? nextErrors.file_details.split("\n").filter(Boolean)
            : [],
        );
        toast.error(result.error);
        return;
      }

      onSaved(result.data.inserted);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      size="lg"
      title="Carga masiva de combustible"
      description="Importe solicitudes de combustible y AdBlue desde una planilla Excel. La carga es completa: si una fila falla, no se inserta ninguna."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="fuel-import-form" loading={pending}>
            Importar planilla
          </Button>
        </>
      }
    >
      <form id="fuel-import-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Alert tone="warning" title="Solo Excel">
          Use una planilla `.xlsx` similar a la muestra operacional. Se aceptan hasta 500 filas por carga.
        </Alert>

        <Field
          label="Archivo Excel"
          required
          error={fieldErrors.file}
          htmlFor="fuel-import-file"
          hint="Columnas requeridas: terminal, solicitud, direccion, producto, fecha, ventana, horario, razon social y cantidad."
        >
          <Input
            id="fuel-import-file"
            name="file"
            type="file"
            accept=".xlsx,.xlsm,.xltx,.xltm"
            invalid={Boolean(fieldErrors.file)}
            required
          />
        </Field>

        {issues.length > 0 && (
          <Alert tone="danger" title="Observaciones de la planilla">
            <ul className="space-y-1 text-sm">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="rounded-2xl border border-border bg-surface-subtle/65 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Columnas esperadas</p>
              <p className="mt-1 text-xs text-ink-muted">
                Puede usar encabezados equivalentes, pero esta estructura coincide con la muestra esperada.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-ink-secondary">
              {FUEL_IMPORT_TEMPLATE_COLUMNS.length} columnas
            </span>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {FUEL_IMPORT_TEMPLATE_COLUMNS.map((column) => (
              <div key={column.key} className="rounded-xl border border-white/80 bg-white/80 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-ink">{column.label}</p>
                  <Badge tone={column.required ? "warning" : "neutral"}>
                    {column.required ? "Obligatoria" : "Opcional"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">{column.example}</p>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FuelDeliveryFormModal({
  open,
  item,
  onClose,
  onSaved,
  terminals,
}: {
  open: boolean;
  item?: FuelDeliveryScheduleViewRow;
  onClose: () => void;
  onSaved: () => void;
  terminals: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    if (item) formData.set("id", item.id);

    startTransition(async () => {
      const result = item
        ? await updateFuelDeliveryAction(formData)
        : await createFuelDeliveryAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      onSaved();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      size="xl"
      title={item ? "Editar solicitud programada" : "Programar solicitud"}
      description="Registre la solicitud recibida segun el formato operativo de combustible o AdBlue."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="fuel-delivery-form" loading={pending}>
            {item ? "Guardar cambios" : "Programar"}
          </Button>
        </>
      }
    >
      <form id="fuel-delivery-form" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2" noValidate>
        <Field label="Terminal" required error={fieldErrors.terminal_id} htmlFor="fuel-terminal">
          <Select
            id="fuel-terminal"
            name="terminal_id"
            defaultValue={item?.terminal_id ?? terminals[0]?.id ?? ""}
            invalid={Boolean(fieldErrors.terminal_id)}
            required
          >
            {terminals.map((terminal) => (
              <option key={terminal.id} value={terminal.id}>
                {terminal.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="ID solicitud"
          required
          error={fieldErrors.request_reference}
          htmlFor="fuel-request-reference"
        >
          <Input
            id="fuel-request-reference"
            name="request_reference"
            defaultValue={item?.request_reference ?? ""}
            maxLength={40}
            invalid={Boolean(fieldErrors.request_reference)}
            required
          />
        </Field>

        <Field label="Producto" required error={fieldErrors.product_type} htmlFor="fuel-product">
          <Select
            id="fuel-product"
            name="product_type"
            defaultValue={item?.product_type ?? "FUEL"}
            invalid={Boolean(fieldErrors.product_type)}
            required
          >
            {PRODUCT_OPTIONS.map((product) => (
              <option key={product.value} value={product.value}>
                {product.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha programada" required error={fieldErrors.scheduled_date} htmlFor="fuel-date">
          <Input
            id="fuel-date"
            type="date"
            name="scheduled_date"
            defaultValue={item?.scheduled_date ?? ""}
            invalid={Boolean(fieldErrors.scheduled_date)}
            required
          />
        </Field>

        <Field label="Ventana" required error={fieldErrors.reception_window} htmlFor="fuel-window">
          <Select
            id="fuel-window"
            name="reception_window"
            defaultValue={item?.reception_window ?? "AM"}
            invalid={Boolean(fieldErrors.reception_window)}
            required
          >
            {WINDOW_OPTIONS.map((window) => (
              <option key={window.value} value={window.value}>
                {window.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Producto solicitado"
          required
          error={fieldErrors.product_label}
          htmlFor="fuel-product-label"
        >
          <Input
            id="fuel-product-label"
            name="product_label"
            defaultValue={item?.product_label ?? ""}
            maxLength={120}
            invalid={Boolean(fieldErrors.product_label)}
            required
          />
        </Field>

        <Field
          label="Horario de recepcion"
          required
          error={fieldErrors.reception_time_range}
          htmlFor="fuel-reception-time-range"
        >
          <Input
            id="fuel-reception-time-range"
            name="reception_time_range"
            defaultValue={item?.reception_time_range ?? ""}
            maxLength={40}
            invalid={Boolean(fieldErrors.reception_time_range)}
            required
          />
        </Field>

        <Field
          label="Cantidad (m3)"
          required
          error={fieldErrors.requested_quantity_m3}
          htmlFor="fuel-requested-quantity"
        >
          <Input
            id="fuel-requested-quantity"
            type="number"
            name="requested_quantity_m3"
            defaultValue={item ? String(item.requested_quantity_m3) : ""}
            step="0.01"
            min="0.01"
            max="999.99"
            inputMode="decimal"
            invalid={Boolean(fieldErrors.requested_quantity_m3)}
            required
          />
        </Field>

        <Field
          label="Razon social"
          required
          error={fieldErrors.supplier_name}
          htmlFor="fuel-supplier"
        >
          <Input
            id="fuel-supplier"
            name="supplier_name"
            defaultValue={item?.supplier_name ?? ""}
            maxLength={120}
            invalid={Boolean(fieldErrors.supplier_name)}
            required
          />
        </Field>

        <Field
          label="Camion"
          hint="Opcional. Referencia del camion informada en la solicitud."
          error={fieldErrors.truck_reference}
          htmlFor="fuel-truck-reference"
        >
          <Input
            id="fuel-truck-reference"
            name="truck_reference"
            defaultValue={item?.truck_reference ?? ""}
            maxLength={120}
            invalid={Boolean(fieldErrors.truck_reference)}
          />
        </Field>

        <Field
          label="Direccion"
          required
          error={fieldErrors.delivery_address}
          htmlFor="fuel-delivery-address"
          className="md:col-span-2"
        >
          <Input
            id="fuel-delivery-address"
            name="delivery_address"
            defaultValue={item?.delivery_address ?? ""}
            maxLength={240}
            invalid={Boolean(fieldErrors.delivery_address)}
            required
          />
        </Field>

        <Field
          label="Notas"
          hint="Opcional. Instrucciones internas, observaciones o referencias de la recepcion."
          error={fieldErrors.notes}
          htmlFor="fuel-notes"
          className="md:col-span-2"
        >
          <Textarea
            id="fuel-notes"
            name="notes"
            defaultValue={item?.notes ?? ""}
            rows={4}
            maxLength={500}
            invalid={Boolean(fieldErrors.notes)}
          />
        </Field>
      </form>
    </Modal>
  );
}

function productLabel(product: FuelDeliveryProduct) {
  return product === "ADBLUE" ? "AdBlue" : "Combustible";
}

function windowLabel(window: FuelReceptionWindow) {
  return window === "AM" ? "ventana AM" : "ventana PM";
}

function alertLabel(status: FuelDeliveryScheduleViewRow["alert_status"]) {
  switch (status) {
    case "CONFIRMED":
      return "Confirmado";
    case "OVERDUE":
      return "Atrasado";
    case "TODAY":
      return "Hoy";
    default:
      return "Proximo";
  }
}

function alertTone(
  status: FuelDeliveryScheduleViewRow["alert_status"],
): "success" | "danger" | "warning" | "neutral" {
  switch (status) {
    case "CONFIRMED":
      return "success";
    case "OVERDUE":
      return "danger";
    case "TODAY":
      return "warning";
    default:
      return "neutral";
  }
}

function deadlineLabel(value: string) {
  return value.slice(0, 5);
}

function formatQuantity(value: number) {
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(value)} m3`;
}

function groupSchedules(items: FuelDeliveryScheduleViewRow[]) {
  const grouped = new Map<string, FuelDeliveryScheduleViewRow[]>();

  for (const item of items) {
    const key = `${item.scheduled_date}:${item.reception_window}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }

  return grouped;
}

function buildDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: DEFAULT_TIME_ZONE,
  });

  const dates: Array<{ date: string; title: string; subtitle: string }> = [];
  let current = parseDateOnly(from);
  const end = parseDateOnly(to);
  let guard = 0;

  while (current <= end && guard < 62) {
    const date = toDateOnly(current);
    const parts = formatter.formatToParts(current);
    const weekday = parts.find((part) => part.type === "weekday")?.value.replace(".", "") ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value.replace(".", "") ?? "";

    dates.push({
      date,
      title: `${capitalize(weekday)} ${day}`,
      subtitle: month,
    });

    current = new Date(current);
    current.setDate(current.getDate() + 1);
    guard += 1;
  }

  return dates;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
}

function toDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
