"use client";

import { useState, useTransition } from "react";
import { Bus, Fuel, MapPin, MoreVertical, Pencil, Plus, Power, Shapes, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { ActiveBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterSelect, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import {
  CardList,
  ResponsiveTable,
  RowCard,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  createFleetAction,
  setFleetActiveAction,
  updateFleetAction,
} from "@/features/fleet/actions";
import type { FleetFuelTypeRow, FleetViewRow, TerminalRow } from "@/types/database.types";

interface Props {
  buses: FleetViewRow[];
  total: number;
  page: number;
  pageSize: number;
  terminals: Pick<TerminalRow, "id" | "name" | "active">[];
  fuelTypes: FleetFuelTypeRow[];
  canCreate: boolean;
  canEdit: boolean;
  activeFilterCount: number;
}

export function FleetManager({
  buses,
  total,
  page,
  pageSize,
  terminals,
  fuelTypes,
  canCreate,
  canEdit,
  activeFilterCount,
}: Props) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FleetViewRow | null>(null);
  const [toggling, setToggling] = useState<FleetViewRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmToggle() {
    if (!toggling) return;
    const target = toggling;

    startTransition(async () => {
      const result = await setFleetActiveAction(target.id, !target.active);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(target.active ? "Bus desactivado." : "Bus activado.");
      setToggling(null);
    });
  }

  return (
    <>
      <Card className="overflow-visible">
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar por PPU o número interno…" />}
          actions={
            canCreate ? (
              <Button
                onClick={() => setCreating(true)}
                icon={<Plus className="size-4" aria-hidden />}
              >
                Nuevo bus
              </Button>
            ) : undefined
          }
        >
          <FilterSelect
            paramName="terminal"
            label="Terminal"
            options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))}
          />
          <FilterSelect
            paramName="tipo"
            label="Tipo"
            options={fuelTypes.map((fuel) => ({ value: fuel.code, label: fuel.label }))}
          />
          <FilterSelect
            paramName="estado"
            label="Estado"
            options={[
              { value: "activos", label: "Activos" },
              { value: "inactivos", label: "Inactivos" },
            ]}
          />
        </FilterBar>

        {buses.length === 0 ? (
          <EmptyState
            icon={<Bus className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningún bus coincide con los filtros"
                : "No hay buses registrados"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la búsqueda o limpie los filtros aplicados."
                : canCreate
                  ? "Incorpore el primer bus indicando su número interno, PPU y terminal."
                  : "Aún no se ha registrado ningún bus."
            }
          />
        ) : (
          <>
            <ResponsiveTable
              cards={
                <CardList>
                  {buses.map((bus) => (
                    <RowCard
                      key={bus.id}
                      icon={<Bus className="size-[19px]" aria-hidden />}
                      tone={bus.active ? "success" : "neutral"}
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Bus {bus.internal_number}</span>
                          <span className="rounded-md bg-fill-subtle px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-ink-secondary ring-1 ring-border">
                            {bus.ppu}
                          </span>
                        </span>
                      }
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {bus.terminal_name}
                        </span>
                      }
                      badge={<ActiveBadge active={bus.active} />}
                      fields={[
                        {
                          label: "Modelo",
                          value: bus.model ?? "—",
                          icon: <Wrench className="size-3" aria-hidden />,
                        },
                        {
                          label: "Subclase",
                          value: bus.subclass ?? "—",
                          icon: <Shapes className="size-3" aria-hidden />,
                        },
                        {
                          label: "Combustible",
                          value: bus.fuel_type_label ?? bus.fuel_type,
                          icon: <Fuel className="size-3" aria-hidden />,
                        },
                      ]}
                      actions={
                        canEdit ? (
                          <FleetRowMenu
                            active={bus.active}
                            onEdit={() => setEditing(bus)}
                            onToggle={() => setToggling(bus)}
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

      {canCreate && creating && (
        <FleetFormModal
          open
          terminals={terminals}
          fuelTypes={fuelTypes}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Bus registrado correctamente.");
          }}
        />
      )}

      {canEdit && editing && (
        <FleetFormModal
          open
          bus={editing}
          terminals={terminals}
          fuelTypes={fuelTypes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Bus actualizado correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggle}
        loading={pending}
        tone={toggling?.active ? "danger" : "primary"}
        title={toggling?.active ? "Desactivar bus" : "Activar bus"}
        confirmLabel={toggling?.active ? "Desactivar" : "Activar"}
        message={
          toggling?.active ? (
            <>
              <p>
                El bus <strong>{toggling?.internal_number}</strong> ({toggling?.ppu}) no podrá
                registrar nuevas salidas a planta.
              </p>
              <p className="mt-2">
                Su historial de revisiones, documentos y vencimientos se conserva íntegro.
              </p>
            </>
          ) : (
            <p>
              El bus <strong>{toggling?.internal_number}</strong> volverá a estar operativo.
            </p>
          )
        }
      />
    </>
  );
}

function FleetRowMenu({
  active,
  onEdit,
  onToggle,
}: {
  active: boolean;
  onEdit: () => void;
  onToggle: () => void;
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
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-raised)]">
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
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-surface-muted"
            >
              <Power className="size-4" aria-hidden />
              {active ? "Desactivar" : "Activar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FleetFormModal({
  open,
  bus,
  terminals,
  fuelTypes,
  onClose,
  onSaved,
}: {
  open: boolean;
  bus?: FleetViewRow;
  terminals: Pick<TerminalRow, "id" | "name" | "active">[];
  fuelTypes: FleetFuelTypeRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Un terminal desactivado sigue apareciendo si es el del bus que se edita:
  // de lo contrario el formulario perdería silenciosamente su terminal.
  const terminalOptions = terminals.filter(
    (terminal) => terminal.active || terminal.id === bus?.terminal_id,
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    if (bus) formData.set("id", bus.id);

    startTransition(async () => {
      const result = bus ? await updateFleetAction(formData) : await createFleetAction(formData);

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
      title={bus ? "Editar bus" : "Nuevo bus"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="fleet-form" loading={pending}>
            {bus ? "Guardar cambios" : "Registrar bus"}
          </Button>
        </>
      }
    >
      <form id="fleet-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Número interno"
            required
            error={fieldErrors.internal_number}
            htmlFor="fleet-internal"
          >
            <Input
              id="fleet-internal"
              name="internal_number"
              defaultValue={bus?.internal_number ?? ""}
              required
              maxLength={20}
              autoFocus
              autoCapitalize="characters"
              invalid={Boolean(fieldErrors.internal_number)}
            />
          </Field>

          <Field
            label="PPU"
            required
            hint="Se guarda sin puntos ni guiones."
            error={fieldErrors.ppu}
            htmlFor="fleet-ppu"
          >
            <Input
              id="fleet-ppu"
              name="ppu"
              defaultValue={bus?.ppu ?? ""}
              required
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono"
              invalid={Boolean(fieldErrors.ppu)}
            />
          </Field>

          <Field label="Modelo" error={fieldErrors.model} htmlFor="fleet-model">
            <Input
              id="fleet-model"
              name="model"
              defaultValue={bus?.model ?? ""}
              maxLength={120}
              invalid={Boolean(fieldErrors.model)}
            />
          </Field>

          <Field label="Subclase" error={fieldErrors.subclass} htmlFor="fleet-subclass">
            <Input
              id="fleet-subclass"
              name="subclass"
              defaultValue={bus?.subclass ?? ""}
              maxLength={120}
              invalid={Boolean(fieldErrors.subclass)}
            />
          </Field>

          <Field label="Tipo" required error={fieldErrors.fuel_type} htmlFor="fleet-fuel">
            <Select
              id="fleet-fuel"
              name="fuel_type"
              defaultValue={bus?.fuel_type ?? ""}
              required
              invalid={Boolean(fieldErrors.fuel_type)}
            >
              <option value="" disabled>
                Seleccione…
              </option>
              {fuelTypes.map((fuel) => (
                <option key={fuel.code} value={fuel.code}>
                  {fuel.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Terminal asociado"
            required
            error={fieldErrors.terminal_id}
            htmlFor="fleet-terminal"
          >
            <Select
              id="fleet-terminal"
              name="terminal_id"
              defaultValue={bus?.terminal_id ?? ""}
              required
              invalid={Boolean(fieldErrors.terminal_id)}
            >
              <option value="" disabled>
                Seleccione…
              </option>
              {terminalOptions.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.name}
                  {terminal.active ? "" : " (inactivo)"}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Checkbox
          name="active"
          defaultChecked={bus?.active ?? true}
          label="Bus activo"
          description="Los buses inactivos no pueden registrar salidas a planta, pero conservan su historial."
        />
      </form>
    </Modal>
  );
}
