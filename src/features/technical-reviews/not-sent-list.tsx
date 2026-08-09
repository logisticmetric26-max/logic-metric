"use client";

import { useState, useTransition } from "react";
import {
  CalendarDays,
  ClipboardList,
  MapPin,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/modal";
import { FilterBar, FilterDate, FilterSelect, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
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
import { formatDateOnly } from "@/lib/format";
import { NotSentModal } from "@/features/technical-reviews/not-sent-modal";
import { deleteNotSentAction } from "@/features/technical-reviews/actions";
import type { TechnicalReviewNotSentViewRow } from "@/types/database.types";

/**
 * §29, §35 · Buses no enviados a planta.
 *
 * Un mismo bus puede acumular varios registros: cada uno es un evento propio y
 * ninguno sobrescribe al anterior.
 */
export function NotSentList({
  records,
  total,
  page,
  pageSize,
  terminals,
  can,
  activeFilterCount,
}: {
  records: TechnicalReviewNotSentViewRow[];
  total: number;
  page: number;
  pageSize: number;
  terminals: { id: string; name: string }[];
  can: { create: boolean; edit: boolean; remove: boolean };
  activeFilterCount: number;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TechnicalReviewNotSentViewRow | null>(null);
  const [deleting, setDeleting] = useState<TechnicalReviewNotSentViewRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteNotSentAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Registro eliminado.");
      setDeleting(null);
    });
  }

  return (
    <>
      <Card>
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar por PPU, número interno, OT o motivo…" />}
          actions={
            can.create ? (
              <Button
                onClick={() => setCreating(true)}
                icon={<Plus className="size-4" aria-hidden />}
              >
                Registrar no enviado
              </Button>
            ) : undefined
          }
        >
          {terminals.length > 1 && (
            <FilterSelect
              paramName="terminal"
              label="Terminal"
              options={terminals.map((terminal) => ({
                value: terminal.id,
                label: terminal.name,
              }))}
            />
          )}
          <FilterDate paramName="desde" label="Desde" />
          <FilterDate paramName="hasta" label="Hasta" />
        </FilterBar>

        {records.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningún registro coincide con los filtros"
                : "No hay buses registrados como no enviados"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la búsqueda o limpie los filtros aplicados."
                : "Registre aquí los buses que no salieron a planta y el motivo."
            }
          />
        ) : (
          <>
            <ResponsiveTable
              table={
                <Table>
                  <THead>
                    <TH>Fecha</TH>
                    <TH>N.º interno</TH>
                    <TH>PPU</TH>
                    <TH>Terminal</TH>
                    <TH>Motivo</TH>
                    <TH>N.º OT</TH>
                    <TH>Registró</TH>
                    <TH align="right">Acciones</TH>
                  </THead>
                  <TBody>
                    {records.map((record) => (
                      <TR key={record.id}>
                        <TD className="whitespace-nowrap">{formatDateOnly(record.event_date)}</TD>
                        <TD className="font-medium">{record.internal_number}</TD>
                        <TD className="font-mono text-xs">{record.ppu}</TD>
                        <TD className="text-ink-secondary">{record.terminal_name}</TD>
                        <TD className="max-w-xs">
                          <span className="line-clamp-2 text-ink-secondary">{record.reason}</span>
                        </TD>
                        <TD>
                          {record.work_order_number ? (
                            <Badge tone="neutral">{record.work_order_number}</Badge>
                          ) : (
                            <span className="text-ink-subtle">—</span>
                          )}
                        </TD>
                        <TD className="text-ink-muted">{record.created_by_name ?? "—"}</TD>
                        <TD align="right">
                          <RowMenu
                            can={can}
                            onEdit={() => setEditing(record)}
                            onDelete={() => setDeleting(record)}
                          />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <CardList>
                  {records.map((record) => (
                    <RowCard
                      key={record.id}
                      icon={<ClipboardList className="size-[19px]" aria-hidden />}
                      tone="warning"
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Bus {record.internal_number}</span>
                          <span className="rounded-md bg-fill-subtle px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wide text-ink-secondary ring-1 ring-border">
                            {record.ppu}
                          </span>
                        </span>
                      }
                      subtitle={
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {record.terminal_name}
                        </span>
                      }
                      badge={
                        record.work_order_number ? (
                          <Badge tone="neutral">OT {record.work_order_number}</Badge>
                        ) : undefined
                      }
                      fields={[
                        {
                          label: "Fecha",
                          value: formatDateOnly(record.event_date),
                          icon: <CalendarDays className="size-3" aria-hidden />,
                        },
                        {
                          label: "Motivo",
                          value: record.reason,
                          icon: <MessageSquareText className="size-3" aria-hidden />,
                        },
                        {
                          label: "Registró",
                          value: record.created_by_name ?? "—",
                          icon: <UserRound className="size-3" aria-hidden />,
                        },
                      ]}
                      actions={
                        <RowMenu
                          can={can}
                          onEdit={() => setEditing(record)}
                          onDelete={() => setDeleting(record)}
                        />
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

      {can.create && creating && <NotSentModal open onClose={() => setCreating(false)} />}
      {can.edit && editing && (
        <NotSentModal open record={editing} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={pending}
        title="Eliminar registro de no envío"
        confirmLabel="Eliminar"
        message={
          <p>
            Se eliminará el registro del bus <strong>{deleting?.internal_number}</strong> del{" "}
            {formatDateOnly(deleting?.event_date)}. Esta acción no se puede deshacer.
          </p>
        }
      />
    </>
  );
}

function RowMenu({
  can,
  onEdit,
  onDelete,
}: {
  can: { edit: boolean; remove: boolean };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!can.edit && !can.remove) return null;

  return (
    <div className="relative flex justify-end">
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
          <div className="absolute right-0 z-20 mt-8 w-40 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-raised)]">
            {can.edit && (
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
            {can.remove && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-danger-600 hover:bg-surface-muted"
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
