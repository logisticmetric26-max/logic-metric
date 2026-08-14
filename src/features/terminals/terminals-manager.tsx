"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  CalendarDays,
  Hash,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Checkbox } from "@/components/ui/field";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { ActiveBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { SearchField, FilterBar } from "@/components/ui/filters";
import {
  CardList,
  ResponsiveTable,
  RowCard,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  createTerminalAction,
  deleteTerminalAction,
  setTerminalActiveAction,
  updateTerminalAction,
} from "@/features/terminals/actions";
import type { TerminalRow } from "@/types/database.types";

interface Props {
  terminals: TerminalRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** §15 · Administración de terminales: crear, editar, activar y desactivar. */
export function TerminalsManager({ terminals, canCreate, canEdit, canDelete }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<TerminalRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<TerminalRow | null>(null);
  const [deleting, setDeleting] = useState<TerminalRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmToggle() {
    if (!toggling) return;
    const target = toggling;

    startTransition(async () => {
      const result = await setTerminalActiveAction(target.id, !target.active);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(target.active ? "Terminal desactivado." : "Terminal activado.");
      setToggling(null);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteTerminalAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Terminal eliminado.");
      setDeleting(null);
    });
  }

  return (
    <>
      <Card className="overflow-visible">
        <FilterBar
          search={<SearchField placeholder="Buscar terminal…" />}
          actions={
            canCreate ? (
              <Button
                onClick={() => setCreating(true)}
                icon={<Plus className="size-4" aria-hidden />}
              >
                Nuevo terminal
              </Button>
            ) : undefined
          }
        />

        {terminals.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-5" aria-hidden />}
            title="No hay terminales registrados"
            description={
              canCreate
                ? "Cree el primer terminal para poder asignar buses y usuarios."
                : "Aún no se ha registrado ningún terminal."
            }
            action={
              canCreate ? (
                <Button
                  onClick={() => setCreating(true)}
                  icon={<Plus className="size-4" aria-hidden />}
                >
                  Nuevo terminal
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ResponsiveTable
            cards={
              <CardList>
                {terminals.map((terminal) => (
                  <RowCard
                    key={terminal.id}
                    icon={<Building2 className="size-[19px]" aria-hidden />}
                    tone={terminal.active ? "success" : "neutral"}
                    title={terminal.name}
                    subtitle="Terminal de operación"
                    badge={<ActiveBadge active={terminal.active} />}
                    fields={[
                      {
                        label: "Código",
                        value: terminal.code ?? "Sin código",
                        icon: <Hash className="size-3" aria-hidden />,
                      },
                      {
                        label: "Fecha de creación",
                        value: formatDate(terminal.created_at),
                        icon: <CalendarDays className="size-3" aria-hidden />,
                      },
                    ]}
                    actions={
                      canEdit || canDelete ? (
                        <TerminalRowMenu
                          onEdit={canEdit ? () => setEditing(terminal) : undefined}
                          onToggle={canEdit ? () => setToggling(terminal) : undefined}
                          onDelete={canDelete ? () => setDeleting(terminal) : undefined}
                          active={terminal.active}
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
        <TerminalFormModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Terminal creado correctamente.");
          }}
        />
      )}

      {canEdit && editing && (
        <TerminalFormModal
          open
          terminal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Terminal actualizado correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggle}
        loading={pending}
        tone={toggling?.active ? "danger" : "primary"}
        title={toggling?.active ? "Desactivar terminal" : "Activar terminal"}
        confirmLabel={toggling?.active ? "Desactivar" : "Activar"}
        message={
          toggling?.active ? (
            <>
              <p>
                El terminal <strong>{toggling?.name}</strong> dejará de estar disponible para
                nuevas asignaciones.
              </p>
              <p className="mt-2">
                No se elimina ninguna información: los buses, revisiones e historial asociados se
                conservan.
              </p>
            </>
          ) : (
            <p>
              El terminal <strong>{toggling?.name}</strong> volverá a estar disponible.
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
        title="Eliminar terminal"
        confirmLabel="Eliminar"
        message={
          <p>
            El terminal <strong>{deleting?.name}</strong> se eliminará de forma definitiva. Si
            tiene buses, usuarios, revisiones, registros de lavado o movimientos de combustible
            asociados, la operación será rechazada.
          </p>
        }
      />
    </>
  );
}

/** Menú de acciones para la vista de tarjetas en móvil (§4). */
function TerminalRowMenu({
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

function TerminalFormModal({
  open,
  terminal,
  onClose,
  onSaved,
}: {
  open: boolean;
  terminal?: TerminalRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    if (terminal) formData.set("id", terminal.id);

    startTransition(async () => {
      const result = terminal
        ? await updateTerminalAction(formData)
        : await createTerminalAction(formData);

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
      title={terminal ? "Editar terminal" : "Nuevo terminal"}
      description={
        terminal ? undefined : "Registre el terminal con su nombre real de operación."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="terminal-form" loading={pending}>
            {terminal ? "Guardar cambios" : "Crear terminal"}
          </Button>
        </>
      }
    >
      <form id="terminal-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre" required error={fieldErrors.name} htmlFor="terminal-name">
          <Input
            id="terminal-name"
            name="name"
            defaultValue={terminal?.name ?? ""}
            required
            maxLength={120}
            autoFocus
            invalid={Boolean(fieldErrors.name)}
          />
        </Field>

        <Field
          label="Código"
          hint="Opcional. Sirve como identificador corto del terminal."
          error={fieldErrors.code}
          htmlFor="terminal-code"
        >
          <Input
            id="terminal-code"
            name="code"
            defaultValue={terminal?.code ?? ""}
            maxLength={30}
            invalid={Boolean(fieldErrors.code)}
          />
        </Field>

        <Checkbox
          name="active"
          defaultChecked={terminal?.active ?? true}
          label="Terminal activo"
          description="Los terminales inactivos no admiten nuevas asignaciones, pero conservan su historial."
        />
      </form>
    </Modal>
  );
}
