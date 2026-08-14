"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Download,
  Droplets,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterDate, FilterSelect, SearchField } from "@/components/ui/filters";
import { Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { CardList, ResponsiveTable, RowCard } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  createBadFuelLoadAction,
  deleteBadFuelLoadAction,
  exportBadFuelLoadsCsvAction,
  updateBadFuelLoadAction,
} from "@/features/bad-loads/actions";
import { formatDateOnly, formatPpu } from "@/lib/format";
import type { BadFuelLoadViewRow } from "@/types/database.types";

interface DispenserOption {
  id: string;
  code: string;
  terminal_name: string;
  terminal_code: string;
  active: boolean;
}

interface Props {
  items: BadFuelLoadViewRow[];
  total: number;
  page: number;
  pageSize: number;
  dispensers: DispenserOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  activeFilterCount: number;
  mode: "active" | "history";
  exportFilters: {
    q?: string;
    desde?: string;
    hasta?: string;
    surtidor?: string;
  };
}

export function BadLoadsManager({
  items,
  total,
  page,
  pageSize,
  dispensers,
  canCreate,
  canEdit,
  canDelete,
  activeFilterCount,
  mode,
  exportFilters,
}: Props) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BadFuelLoadViewRow | null>(null);
  const [deleting, setDeleting] = useState<BadFuelLoadViewRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [exporting, startExportTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteBadFuelLoadAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Mala carga eliminada.");
      setDeleting(null);
    });
  }

  function exportCsv() {
    startExportTransition(async () => {
      const result = await exportBadFuelLoadsCsvAction(exportFilters);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      downloadCsv(result.data.file_name, result.data.csv_content);
      toast.success(
        `Archivo CSV generado con ${result.data.row_count} registro${result.data.row_count === 1 ? "" : "s"}.`,
      );
    });
  }

  return (
    <>
      <Card className="overflow-visible">
        <FilterBar
          activeCount={activeFilterCount}
          search={
            <SearchField placeholder="Buscar por PPU, numero interno, codigo bus, surtidor o terminal..." />
          }
          actions={
            mode === "active" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={exportCsv}
                  loading={exporting}
                  icon={<Download className="size-4" aria-hidden />}
                >
                  Exportar CSV
                </Button>
                {canCreate && (
                  <Button
                    onClick={() => setCreating(true)}
                    icon={<Plus className="size-4" aria-hidden />}
                  >
                    Registrar mala carga
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          <FilterDate paramName="desde" label="Desde" />
          <FilterDate paramName="hasta" label="Hasta" />
          <FilterSelect
            paramName="surtidor"
            label="Surtidor"
            options={dispensers.map((dispenser) => ({
              value: dispenser.id,
              label: `${dispenser.code} | ${dispenser.terminal_code}`,
            }))}
          />
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? `Ninguna ${mode === "history" ? "mala carga historica" : "mala carga"} coincide con los filtros`
                : mode === "history"
                  ? "No hay malas cargas en el historico"
                  : "No hay malas cargas registradas"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la busqueda o limpie los filtros aplicados."
                : mode === "history"
                  ? "Los registros exportados se visualizaran aqui."
                  : canCreate
                  ? "Registre la primera mala carga indicando bus, fecha, hora, litros y surtidor."
                  : "Aun no se ha registrado ninguna mala carga."
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
                      icon={<AlertTriangle className="size-[19px]" aria-hidden />}
                      tone="warning"
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Bus {item.internal_number}</span>
                          <span className="rounded-md bg-fill-subtle px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-ink-secondary ring-1 ring-border">
                            {formatPpu(item.ppu)}
                          </span>
                        </span>
                      }
                      subtitle={`Surtidor ${item.dispenser_code} | ${formatDispenserTerminal(item)}`}
                      fields={[
                        {
                          label: "Fecha",
                          value: formatDateOnly(item.load_date),
                          icon: <CalendarDays className="size-3" aria-hidden />,
                        },
                        {
                          label: "Hora",
                          value: item.load_time.slice(0, 5),
                          icon: <Clock3 className="size-3" aria-hidden />,
                        },
                        {
                          label: "Litros",
                          value: formatLiters(item.liters),
                          icon: <Droplets className="size-3" aria-hidden />,
                        },
                        {
                          label: "Terminal surtidor",
                          value: formatDispenserTerminal(item),
                        },
                        {
                          label: "Codigo bus",
                          value: item.reader_code ?? fallbackBusCode(item.internal_number),
                        },
                        {
                          label: "Registrado por",
                          value: item.created_by_name ?? "Sin dato",
                        },
                        ...(mode === "history"
                          ? [
                              {
                                label: "Exportado",
                                value: item.exported_by_name ?? "Sin dato",
                              },
                              {
                                label: "Archivo",
                                value: item.export_file_name ?? "Sin archivo",
                              },
                            ]
                          : []),
                      ]}
                      actions={
                        mode === "active" && (canEdit || canDelete) ? (
                          <BadLoadRowMenu
                            onEdit={canEdit ? () => setEditing(item) : undefined}
                            onDelete={canDelete ? () => setDeleting(item) : undefined}
                          />
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

      {mode === "active" && canCreate && creating && (
        <BadLoadFormModal
          open
          dispensers={dispensers}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Mala carga registrada correctamente.");
          }}
        />
      )}

      {mode === "active" && canEdit && editing && (
        <BadLoadFormModal
          open
          item={editing}
          dispensers={dispensers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Mala carga actualizada correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={pending}
        tone="danger"
        title="Eliminar mala carga"
        confirmLabel="Eliminar"
        message={
          <p>
            Se eliminara el registro del bus <strong>{deleting?.internal_number}</strong> en el
            surtidor <strong>{deleting?.dispenser_code}</strong>.
          </p>
        }
      />
    </>
  );
}

function BadLoadRowMenu({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Acciones"
        className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-raised)]">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <Pencil className="size-4" aria-hidden />
                Editar
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-danger-700 hover:bg-danger-50"
              >
                <Trash2 className="size-4" aria-hidden />
                Eliminar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BadLoadFormModal({
  open,
  item,
  dispensers,
  onClose,
  onSaved,
}: {
  open: boolean;
  item?: BadFuelLoadViewRow;
  dispensers: DispenserOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const dispenserOptions = dispensers.filter(
    (dispenser) => dispenser.active || dispenser.id === item?.dispenser_id,
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    if (item) formData.set("id", item.id);

    startTransition(async () => {
      const result = item
        ? await updateBadFuelLoadAction(formData)
        : await createBadFuelLoadAction(formData);

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
      size="lg"
      title={item ? "Editar mala carga" : "Registrar mala carga"}
      description="Indique fecha, hora, bus, litros y surtidor asociados a la mala carga."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="bad-load-form" loading={pending}>
            {item ? "Guardar cambios" : "Registrar"}
          </Button>
        </>
      }
    >
      <form id="bad-load-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field
          label="PPU o numero interno"
          required
          error={fieldErrors.bus_reference}
          htmlFor="bad-load-bus-reference"
          className="sm:col-span-2"
        >
          <Input
            id="bad-load-bus-reference"
            name="bus_reference"
            defaultValue={item?.ppu ?? item?.internal_number ?? ""}
            required
            maxLength={20}
            autoCapitalize="characters"
            autoFocus
            invalid={Boolean(fieldErrors.bus_reference)}
          />
        </Field>

        <Field label="Fecha" required error={fieldErrors.load_date} htmlFor="bad-load-date">
          <Input
            id="bad-load-date"
            type="date"
            name="load_date"
            defaultValue={item?.load_date ?? ""}
            required
            invalid={Boolean(fieldErrors.load_date)}
          />
        </Field>

        <Field label="Hora" required error={fieldErrors.load_time} htmlFor="bad-load-time">
          <Input
            id="bad-load-time"
            type="time"
            name="load_time"
            defaultValue={item ? item.load_time.slice(0, 5) : ""}
            required
            invalid={Boolean(fieldErrors.load_time)}
          />
        </Field>

        <Field label="Litros" required error={fieldErrors.liters} htmlFor="bad-load-liters">
          <Input
            id="bad-load-liters"
            type="number"
            name="liters"
            defaultValue={item ? String(item.liters) : ""}
            step="0.01"
            min="0.01"
            max="99999.99"
            inputMode="decimal"
            required
            invalid={Boolean(fieldErrors.liters)}
          />
        </Field>

        <Field
          label="Surtidor"
          required
          error={fieldErrors.dispenser_id}
          htmlFor="bad-load-dispenser"
        >
          <Select
            id="bad-load-dispenser"
            name="dispenser_id"
            defaultValue={item?.dispenser_id ?? ""}
            required
            invalid={Boolean(fieldErrors.dispenser_id)}
          >
            <option value="" disabled>
              Seleccione...
            </option>
            {dispenserOptions.map((dispenser) => (
              <option key={dispenser.id} value={dispenser.id}>
                {dispenser.code} | {dispenser.terminal_code}
                {dispenser.active ? "" : " (inactivo)"}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function formatLiters(value: number) {
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)} L`;
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

function fallbackBusCode(internalNumber: string) {
  const digits = internalNumber.replace(/\D/g, "");
  if (!digits) return internalNumber.trim().toUpperCase();
  return `BUS${digits.padStart(4, "0")}`;
}

function formatDispenserTerminal(
  item: Pick<BadFuelLoadViewRow, "dispenser_terminal_name" | "dispenser_terminal_code" | "terminal_name">,
) {
  if (item.dispenser_terminal_name && item.dispenser_terminal_code) {
    return `${item.dispenser_terminal_name} (${item.dispenser_terminal_code})`;
  }

  return item.dispenser_terminal_name || item.terminal_name;
}
