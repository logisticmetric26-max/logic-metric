"use client";

import { useState, useTransition } from "react";
import {
  CalendarDays,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  ScanLine,
  Tag,
  Trash2,
} from "lucide-react";
import { ActiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterSelect, SearchField } from "@/components/ui/filters";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { CardList, ResponsiveTable, RowCard } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatPpu } from "@/lib/format";
import {
  createReaderCodeAction,
  deleteReaderCodeAction,
  setReaderCodeActiveAction,
  updateReaderCodeAction,
} from "@/features/reader-codes/actions";
import type { ReaderCodeRow } from "@/types/database.types";

interface Props {
  readerCodes: ReaderCodeRow[];
  total: number;
  page: number;
  pageSize: number;
  typeOptions: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  activeFilterCount: number;
}

export function ReaderCodesManager({
  readerCodes,
  total,
  page,
  pageSize,
  typeOptions,
  canCreate,
  canEdit,
  canDelete,
  activeFilterCount,
}: Props) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ReaderCodeRow | null>(null);
  const [toggling, setToggling] = useState<ReaderCodeRow | null>(null);
  const [deleting, setDeleting] = useState<ReaderCodeRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmToggle() {
    if (!toggling) return;
    const target = toggling;

    startTransition(async () => {
      const result = await setReaderCodeActiveAction(target.id, !target.active);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(target.active ? "Codigo lector desactivado." : "Codigo lector activado.");
      setToggling(null);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteReaderCodeAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Codigo lector eliminado.");
      setDeleting(null);
    });
  }

  return (
    <>
      <Card className="overflow-visible">
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar por PPU, numero interno o codigo lector..." />}
          actions={
            canCreate ? (
              <Button onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>
                Nuevo codigo lector
              </Button>
            ) : undefined
          }
        >
          <FilterSelect
            paramName="tipo"
            label="Tipo"
            options={typeOptions.map((type) => ({ value: type, label: type }))}
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

        {readerCodes.length === 0 ? (
          <EmptyState
            icon={<ScanLine className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningun codigo lector coincide con los filtros"
                : "No hay codigos lectores registrados"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la busqueda o limpie los filtros aplicados."
                : canCreate
                  ? "Registre el primer codigo lector asociado a una PPU y numero interno."
                  : "Aun no se ha registrado ningun codigo lector."
            }
          />
        ) : (
          <>
            <ResponsiveTable
              cards={
                <CardList>
                  {readerCodes.map((readerCode) => (
                    <RowCard
                      key={readerCode.id}
                      icon={<ScanLine className="size-[19px]" aria-hidden />}
                      tone={readerCode.active ? "brand" : "neutral"}
                      title={readerCode.reader_code}
                      subtitle={`PPU ${formatPpu(readerCode.ppu)} · Interno ${readerCode.internal_number}`}
                      badge={<ActiveBadge active={readerCode.active} />}
                      fields={[
                        {
                          label: "Tipo",
                          value: readerCode.reader_type ?? "Sin tipo",
                          icon: <Tag className="size-3" aria-hidden />,
                        },
                        {
                          label: "Creado",
                          value: formatDate(readerCode.created_at),
                          icon: <CalendarDays className="size-3" aria-hidden />,
                        },
                      ]}
                      actions={
                        canEdit || canDelete ? (
                          <ReaderCodeRowMenu
                            active={readerCode.active}
                            onEdit={canEdit ? () => setEditing(readerCode) : undefined}
                            onToggle={canEdit ? () => setToggling(readerCode) : undefined}
                            onDelete={canDelete ? () => setDeleting(readerCode) : undefined}
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
        <ReaderCodeFormModal
          open
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Codigo lector creado correctamente.");
          }}
        />
      )}

      {canEdit && editing && (
        <ReaderCodeFormModal
          open
          readerCode={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Codigo lector actualizado correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggle}
        loading={pending}
        tone={toggling?.active ? "danger" : "primary"}
        title={toggling?.active ? "Desactivar codigo lector" : "Activar codigo lector"}
        confirmLabel={toggling?.active ? "Desactivar" : "Activar"}
        message={
          toggling?.active ? (
            <p>
              El codigo lector <strong>{toggling?.reader_code}</strong> dejara de estar disponible.
            </p>
          ) : (
            <p>
              El codigo lector <strong>{toggling?.reader_code}</strong> volvera a estar disponible.
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
        title="Eliminar codigo lector"
        confirmLabel="Eliminar"
        message={
          <p>
            El codigo lector <strong>{deleting?.reader_code}</strong> se eliminara de forma definitiva.
          </p>
        }
      />
    </>
  );
}

function ReaderCodeRowMenu({
  active,
  onEdit,
  onToggle,
  onDelete,
}: {
  active: boolean;
  onEdit?: () => void;
  onToggle?: () => void;
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

function ReaderCodeFormModal({
  open,
  readerCode,
  onClose,
  onSaved,
}: {
  open: boolean;
  readerCode?: ReaderCodeRow;
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
    if (readerCode) formData.set("id", readerCode.id);

    startTransition(async () => {
      const result = readerCode
        ? await updateReaderCodeAction(formData)
        : await createReaderCodeAction(formData);

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
      title={readerCode ? "Editar codigo lector" : "Nuevo codigo lector"}
      description={
        readerCode ? undefined : "Registre el codigo lector asociado a su PPU y numero interno."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="reader-code-form" loading={pending}>
            {readerCode ? "Guardar cambios" : "Crear codigo lector"}
          </Button>
        </>
      }
    >
      <form id="reader-code-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PPU" required error={fieldErrors.ppu} htmlFor="reader-code-ppu">
            <Input
              id="reader-code-ppu"
              name="ppu"
              defaultValue={readerCode?.ppu ?? ""}
              required
              maxLength={10}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono"
              autoFocus
              invalid={Boolean(fieldErrors.ppu)}
            />
          </Field>

          <Field
            label="Numero interno"
            required
            error={fieldErrors.internal_number}
            htmlFor="reader-code-internal"
          >
            <Input
              id="reader-code-internal"
              name="internal_number"
              defaultValue={readerCode?.internal_number ?? ""}
              required
              maxLength={20}
              autoCapitalize="characters"
              invalid={Boolean(fieldErrors.internal_number)}
            />
          </Field>

          <Field
            label="Codigo lector"
            required
            error={fieldErrors.reader_code}
            htmlFor="reader-code-code"
          >
            <Input
              id="reader-code-code"
              name="reader_code"
              defaultValue={readerCode?.reader_code ?? ""}
              required
              maxLength={40}
              autoCapitalize="characters"
              invalid={Boolean(fieldErrors.reader_code)}
            />
          </Field>

          <Field
            label="Tipo"
            error={fieldErrors.reader_type}
            htmlFor="reader-code-type"
          >
            <Input
              id="reader-code-type"
              name="reader_type"
              defaultValue={readerCode?.reader_type ?? ""}
              maxLength={40}
              autoCapitalize="characters"
              invalid={Boolean(fieldErrors.reader_type)}
            />
          </Field>
        </div>

        <Checkbox
          name="active"
          defaultChecked={readerCode?.active ?? true}
          label="Codigo lector activo"
          description="Los codigos inactivos conservan su informacion, pero salen del uso operacional."
        />
      </form>
    </Modal>
  );
}
