"use client";

import { useMemo, useState, useTransition } from "react";
import { KeyRound, Plus, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import {
  CardList,
  ResponsiveTable,
  RowCard,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/features/access/actions";
import {
  PERMISSION_DEPENDENCIES,
  grantPermissionWithDependencies,
  isPermissionCode,
  revokePermissionWithDependents,
  type PermissionCode,
} from "@/lib/auth/permissions";
import type { PermissionRow, RoleViewRow } from "@/types/database.types";

const MODULE_LABELS: Record<string, string> = {
  technical_review: "Revisión técnica",
  fuel_calendar: "Combustible",
  fleet: "Flota",
  terminals: "Terminales",
  access: "Acceso",
  settings: "Plataforma",
};

/**
 * §10 · Roles.
 *
 * Los roles y su relación con los permisos se administran desde aquí, sin tocar
 * código: la aplicación nunca comprueba «si el rol se llama X», sino si el
 * usuario tiene un permiso concreto.
 */
export function RolesManager({
  roles,
  permissions,
  canManage,
}: {
  roles: RoleViewRow[];
  permissions: PermissionRow[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleViewRow | null>(null);
  const [deleting, setDeleting] = useState<RoleViewRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteRoleAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Rol eliminado.");
      setDeleting(null);
    });
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <p className="text-sm text-ink-muted">
            {roles.length} rol{roles.length === 1 ? "" : "es"} definido
            {roles.length === 1 ? "" : "s"}
          </p>
          {canManage && (
            <Button
              onClick={() => setCreating(true)}
              icon={<Plus className="size-4" aria-hidden />}
            >
              Nuevo rol
            </Button>
          )}
        </div>

        {roles.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-5" aria-hidden />}
            title="No hay roles definidos"
            description="Cree un rol y asígnele los permisos que necesite."
          />
        ) : (
          <ResponsiveTable
            cards={
              <CardList>
                {roles.map((role) => (
                  <RowCard
                    key={role.id}
                    icon={<ShieldCheck className="size-[19px]" aria-hidden />}
                    tone={role.is_system ? "warning" : "brand"}
                    title={role.name}
                    subtitle={role.description ?? undefined}
                    badge={role.is_system ? <Badge tone="warning">Sistema</Badge> : undefined}
                    fields={[
                      {
                        label: "Permisos",
                        value: role.permissions.length,
                        icon: <KeyRound className="size-3" aria-hidden />,
                      },
                      {
                        label: "Usuarios asignados",
                        value: role.user_count,
                        icon: <Users className="size-3" aria-hidden />,
                      },
                    ]}
                    onClick={canManage ? () => setEditing(role) : undefined}
                  />
                ))}
              </CardList>
            }
          />
        )}
      </Card>

      {canManage && creating && (
        <RoleFormModal
          permissions={permissions}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Rol creado correctamente.");
          }}
        />
      )}

      {canManage && editing && (
        <RoleFormModal
          role={editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Rol actualizado correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={pending}
        title="Eliminar rol"
        confirmLabel="Eliminar"
        message={
          <p>
            Se eliminará el rol <strong>{deleting?.name}</strong>. Sólo es posible porque no tiene
            usuarios asignados.
          </p>
        }
      />
    </>
  );
}

function RoleFormModal({
  role,
  permissions,
  onClose,
  onSaved,
}: {
  role?: RoleViewRow;
  permissions: PermissionRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const readOnly = role?.is_system ?? false;
  const [selected, setSelected] = useState<Set<PermissionCode>>(() => {
    let next = new Set<PermissionCode>();
    for (const code of role?.permissions ?? []) {
      if (isPermissionCode(code)) next = grantPermissionWithDependencies(next, code);
    }
    return next;
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionRow[]>();
    for (const permission of permissions) {
      if (!isPermissionCode(permission.code)) continue;
      const list = groups.get(permission.module) ?? [];
      list.push(permission);
      groups.set(permission.module, list);
    }
    return [...groups.entries()];
  }, [permissions]);

  const permissionLabels = useMemo(
    () => new Map(permissions.map((permission) => [permission.code, permission.label])),
    [permissions],
  );

  function togglePermission(code: string, checked: boolean) {
    if (!isPermissionCode(code)) return;
    setSelected((current) =>
      checked
        ? grantPermissionWithDependencies(current, code)
        : revokePermissionWithDependents(current, code),
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    if (role) formData.set("id", role.id);

    startTransition(async () => {
      const result = role ? await updateRoleAction(formData) : await createRoleAction(formData);

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
      open
      onClose={onClose}
      busy={pending}
      size="lg"
      title={role ? (readOnly ? "Rol de sistema" : "Editar rol") : "Nuevo rol"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {readOnly ? "Cerrar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button type="submit" form="role-form" loading={pending}>
              {role ? "Guardar cambios" : "Crear rol"}
            </Button>
          )}
        </>
      }
    >
      <form id="role-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {readOnly && (
          <Alert tone="warning">
            Este rol es de sistema: incluye siempre todos los permisos y no puede modificarse ni
            eliminarse. Garantiza que la plataforma nunca quede sin administración.
          </Alert>
        )}

        <Field label="Nombre del rol" required error={fieldErrors.name} htmlFor="role-name">
          <Input
            id="role-name"
            name="name"
            defaultValue={role?.name ?? ""}
            required
            maxLength={80}
            disabled={readOnly}
            autoFocus={!readOnly}
            invalid={Boolean(fieldErrors.name)}
          />
        </Field>

        <Field label="Descripción" error={fieldErrors.description} htmlFor="role-description">
          <Textarea
            id="role-description"
            name="description"
            defaultValue={role?.description ?? ""}
            maxLength={400}
            disabled={readOnly}
            rows={2}
          />
        </Field>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-ink-secondary">Capacidades reales del rol</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Al activar una capacidad se incluyen automáticamente los accesos necesarios para
              que pueda utilizarse.
            </p>
          </div>

          {grouped.map(([module, modulePermissions]) => (
            <fieldset key={module} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {MODULE_LABELS[module] ?? module}
              </legend>

              <div className="mt-1 flex flex-col gap-0.5">
                {modulePermissions.map((permission) => (
                  <Checkbox
                    key={permission.code}
                    name="permissions"
                    value={permission.code}
                    checked={readOnly || (isPermissionCode(permission.code) && selected.has(permission.code))}
                    onChange={(event) => togglePermission(permission.code, event.target.checked)}
                    disabled={readOnly}
                    label={permission.label}
                    description={
                      isPermissionCode(permission.code) &&
                      (PERMISSION_DEPENDENCIES[permission.code]?.length ?? 0) > 0
                        ? `${permission.description ?? ""} Requiere: ${PERMISSION_DEPENDENCIES[
                            permission.code
                          ]!
                            .map((code) => permissionLabels.get(code) ?? code)
                            .join(", ")}.`
                        : permission.description ?? undefined
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </form>
    </Modal>
  );
}
