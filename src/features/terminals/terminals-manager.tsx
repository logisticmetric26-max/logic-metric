"use client";

import { useState, useTransition } from "react";
import { Building2, MoreVertical, Pencil, Plus, Power } from "lucide-react";
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
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  createTerminalAction,
  setTerminalActiveAction,
  updateTerminalAction,
} from "@/features/terminals/actions";
import type { TerminalRow } from "@/types/database.types";

interface Props {
  terminals: TerminalRow[];
  canCreate: boolean;
  canEdit: boolean;
}

/** §15 · Administración de terminales: crear, editar, activar y desactivar. */
export function TerminalsManager({ terminals, canCreate, canEdit }: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<TerminalRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<TerminalRow | null>(null);
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

  return (
    <>
      <Card>
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
            table={
              <Table>
                <THead>
                  <TH>Nombre</TH>
                  <TH>Código</TH>
                  <TH>Estado</TH>
                  <TH>Creado</TH>
                  <TH align="right">Acciones</TH>
                </THead>
                <TBody>
                  {terminals.map((terminal) => (
                    <TR key={terminal.id}>
                      <TD className="font-medium">{terminal.name}</TD>
                      <TD className="text-ink-muted">{terminal.code ?? "—"}</TD>
                      <TD>
                        <ActiveBadge active={terminal.active} />
                      </TD>
                      <TD className="text-ink-muted">{formatDate(terminal.created_at)}</TD>
                      <TD align="right">
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(terminal)}
                              icon={<Pencil className="size-4" aria-hidden />}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setToggling(terminal)}
                              icon={<Power className="size-4" aria-hidden />}
                            >
                              {terminal.active ? "Desactivar" : "Activar"}
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            }
            cards={
              <CardList>
                {terminals.map((terminal) => (
                  <RowCard
                    key={terminal.id}
                    title={terminal.name}
                    subtitle={terminal.code ?? undefined}
                    badge={<ActiveBadge active={terminal.active} />}
                    fields={[{ label: "Creado", value: formatDate(terminal.created_at) }]}
                    actions={
                      canEdit ? (
                        <TerminalRowMenu
                          onEdit={() => setEditing(terminal)}
                          onToggle={() => setToggling(terminal)}
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
    </>
  );
}

/** Menú de acciones para la vista de tarjetas en móvil (§4). */
function TerminalRowMenu({
  onEdit,
  onToggle,
  active,
}: {
  onEdit: () => void;
  onToggle: () => void;
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
