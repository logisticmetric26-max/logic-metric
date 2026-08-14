"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  CalendarDays,
  Droplets,
  Hash,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { ActiveBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterSelect, SearchField } from "@/components/ui/filters";
import { CardList, ResponsiveTable, RowCard } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { formatRut, formatRutInput } from "@/lib/auth/rut";
import {
  createDispenserAction,
  deleteDispenserAction,
  setDispenserActiveAction,
  updateDispenserAction,
} from "@/features/dispensers/actions";
import type { DispenserRow } from "@/types/database.types";

interface Props {
  dispensers: DispenserRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  activeFilterCount: number;
}

export function DispensersManager({
  dispensers,
  canCreate,
  canEdit,
  canDelete,
  activeFilterCount,
}: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<DispenserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<DispenserRow | null>(null);
  const [deleting, setDeleting] = useState<DispenserRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmToggle() {
    if (!toggling) return;
    const target = toggling;

    startTransition(async () => {
      const result = await setDispenserActiveAction(target.id, !target.active);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(target.active ? "Surtidor desactivado." : "Surtidor activado.");
      setToggling(null);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteDispenserAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Surtidor eliminado.");
      setDeleting(null);
    });
  }

  return (
    <>
      <Card className="overflow-visible">
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar surtidor, terminal, codigo terminal o RUT..." />}
          actions={
            canCreate ? (
              <Button onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>
                Nuevo surtidor
              </Button>
            ) : undefined
          }
        >
          <FilterSelect
            paramName="estado"
            label="Estado"
            options={[
              { value: "activos", label: "Activos" },
              { value: "inactivos", label: "Inactivos" },
            ]}
          />
        </FilterBar>

        {dispensers.length === 0 ? (
          <EmptyState
            icon={<Droplets className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningun surtidor coincide con los filtros"
                : "No hay surtidores registrados"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la busqueda o limpie los filtros aplicados."
                : canCreate
                  ? "Registre el primer surtidor con su planillero y supervisor."
                  : "Aun no se ha registrado ningun surtidor."
            }
          />
        ) : (
          <ResponsiveTable
            cards={
              <CardList>
                {dispensers.map((dispenser) => (
                  <RowCard
                    key={dispenser.id}
                    icon={<Droplets className="size-[19px]" aria-hidden />}
                    tone={dispenser.active ? "info" : "neutral"}
                    title={dispenser.code}
                    subtitle={dispenser.terminal_name}
                    badge={<ActiveBadge active={dispenser.active} />}
                    fields={[
                      {
                        label: "Codigo terminal",
                        value: dispenser.terminal_code,
                        icon: <Hash className="size-3" aria-hidden />,
                      },
                      {
                        label: "Terminal",
                        value: dispenser.terminal_name,
                        icon: <Building2 className="size-3" aria-hidden />,
                      },
                      {
                        label: "Planillero",
                        value: formatRut(dispenser.planner_rut),
                        icon: <ShieldCheck className="size-3" aria-hidden />,
                      },
                      {
                        label: "Supervisor",
                        value: formatRut(dispenser.supervisor_rut),
                        icon: <ShieldCheck className="size-3" aria-hidden />,
                      },
                      {
                        label: "Creado",
                        value: formatDate(dispenser.created_at),
                        icon: <CalendarDays className="size-3" aria-hidden />,
                      },
                    ]}
                    actions={
                      canEdit || canDelete ? (
                        <DispenserRowMenu
                          active={dispenser.active}
                          onEdit={canEdit ? () => setEditing(dispenser) : undefined}
                          onToggle={canEdit ? () => setToggling(dispenser) : undefined}
                          onDelete={canDelete ? () => setDeleting(dispenser) : undefined}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </CardList>
            }
          />
        )}
      </Card>

      {canCreate && (
        <DispenserFormModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Surtidor creado correctamente.");
          }}
        />
      )}

      {canEdit && editing && (
        <DispenserFormModal
          open
          dispenser={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Surtidor actualizado correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggle}
        loading={pending}
        tone={toggling?.active ? "danger" : "primary"}
        title={toggling?.active ? "Desactivar surtidor" : "Activar surtidor"}
        confirmLabel={toggling?.active ? "Desactivar" : "Activar"}
        message={
          toggling?.active ? (
            <p>
              El surtidor <strong>{toggling?.code}</strong> dejara de estar disponible, pero su
              historial quedara conservado.
            </p>
          ) : (
            <p>
              El surtidor <strong>{toggling?.code}</strong> volvera a estar disponible.
            </p>
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={pending}
        tone="danger"
        title="Eliminar surtidor"
        confirmLabel="Eliminar"
        message={
          <p>
            El surtidor <strong>{deleting?.code}</strong> se eliminara de forma definitiva.
          </p>
        }
      />
    </>
  );
}

function DispenserRowMenu({
  onEdit,
  onToggle,
  onDelete,
  active,
}: {
  onEdit?: () => void;
  onToggle?: () => void;
  onDelete?: () => void;
  active: boolean;
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
            {onToggle && (
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

function DispenserFormModal({
  open,
  dispenser,
  onClose,
  onSaved,
}: {
  open: boolean;
  dispenser?: DispenserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [plannerRut, setPlannerRut] = useState(formatRut(dispenser?.planner_rut ?? ""));
  const [supervisorRut, setSupervisorRut] = useState(formatRut(dispenser?.supervisor_rut ?? ""));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    formData.set("planner_rut", plannerRut);
    formData.set("supervisor_rut", supervisorRut);
    if (dispenser) formData.set("id", dispenser.id);

    startTransition(async () => {
      const result = dispenser
        ? await updateDispenserAction(formData)
        : await createDispenserAction(formData);

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
      title={dispenser ? "Editar surtidor" : "Nuevo surtidor"}
      description={
        dispenser
          ? undefined
          : "Registre el surtidor con su terminal, codigo terminal, planillero y supervisor responsable."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="dispenser-form" loading={pending}>
            {dispenser ? "Guardar cambios" : "Crear surtidor"}
          </Button>
        </>
      }
    >
      <form id="dispenser-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Codigo" required error={fieldErrors.code} htmlFor="dispenser-code">
          <Input
            id="dispenser-code"
            name="code"
            defaultValue={dispenser?.code ?? ""}
            required
            maxLength={30}
            autoFocus
            invalid={Boolean(fieldErrors.code)}
          />
        </Field>

        <Field
          label="Terminal"
          required
          error={fieldErrors.terminal_name}
          htmlFor="dispenser-terminal-name"
        >
          <Input
            id="dispenser-terminal-name"
            name="terminal_name"
            defaultValue={dispenser?.terminal_name ?? ""}
            required
            maxLength={120}
            invalid={Boolean(fieldErrors.terminal_name)}
          />
        </Field>

        <Field
          label="Codigo terminal"
          required
          error={fieldErrors.terminal_code}
          htmlFor="dispenser-terminal-code"
        >
          <Input
            id="dispenser-terminal-code"
            name="terminal_code"
            defaultValue={dispenser?.terminal_code ?? ""}
            required
            maxLength={30}
            autoCapitalize="characters"
            invalid={Boolean(fieldErrors.terminal_code)}
          />
        </Field>

        <Field
          label="Planillero"
          required
          error={fieldErrors.planner_rut}
          htmlFor="dispenser-planner-rut"
        >
          <Input
            id="dispenser-planner-rut"
            name="planner_rut"
            value={plannerRut}
            onChange={(event) => setPlannerRut(formatRutInput(event.target.value))}
            placeholder="12.345.678-9"
            required
            invalid={Boolean(fieldErrors.planner_rut)}
          />
        </Field>

        <Field
          label="Supervisor"
          required
          error={fieldErrors.supervisor_rut}
          htmlFor="dispenser-supervisor-rut"
        >
          <Input
            id="dispenser-supervisor-rut"
            name="supervisor_rut"
            value={supervisorRut}
            onChange={(event) => setSupervisorRut(formatRutInput(event.target.value))}
            placeholder="12.345.678-9"
            required
            invalid={Boolean(fieldErrors.supervisor_rut)}
          />
        </Field>

        <Checkbox
          name="active"
          defaultChecked={dispenser?.active ?? true}
          label="Surtidor activo"
          description="Los surtidores inactivos conservan su informacion, pero salen del uso operacional."
        />
      </form>
    </Modal>
  );
}
