"use client";

import { useState, useTransition } from "react";
import {
  BriefcaseBusiness,
  KeyRound,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Badge, UserStatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PresenceAutoRefresh, PresenceCell } from "@/features/access/presence-cell";
import { avatarUrl } from "@/lib/avatar";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar, FilterSelect, SearchField } from "@/components/ui/filters";
import { Pagination } from "@/components/ui/pagination";
import {
  CardList,
  ResponsiveTable,
  RowCard,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatRut } from "@/lib/auth/rut";
import { PASSWORD_MIN_LENGTH } from "@/features/access/schemas";
import {
  deleteUserAction,
  resetUserPasswordAction,
  setUserStatusAction,
} from "@/features/access/actions";
import { UserFormModal } from "@/features/access/user-form-modal";
import { UserPermissionsModal } from "@/features/access/user-permissions-modal";
import type {
  PermissionRow,
  ProfileViewRow,
  RoleViewRow,
  TerminalRow,
} from "@/types/database.types";

interface Props {
  users: ProfileViewRow[];
  total: number;
  page: number;
  pageSize: number;
  terminals: Pick<TerminalRow, "id" | "name" | "active">[];
  roles: RoleViewRow[];
  permissions: PermissionRow[];
  currentUserId: string;
  currentUserHasGlobalAccess: boolean;
  /** Base pública de Supabase, para componer la URL de cada foto. */
  supabaseUrl: string;
  can: {
    create: boolean;
    edit: boolean;
    suspend: boolean;
    remove: boolean;
    manageAccess: boolean;
  };
  activeFilterCount: number;
}

/** §11 · Sección ACCESO · usuarios. */
export function UsersManager({
  users,
  total,
  page,
  pageSize,
  terminals,
  roles,
  permissions,
  currentUserId,
  currentUserHasGlobalAccess,
  can,
  activeFilterCount,
  supabaseUrl,
}: Props) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProfileViewRow | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<ProfileViewRow | null>(null);
  const [statusFor, setStatusFor] = useState<ProfileViewRow | null>(null);
  const [deleting, setDeleting] = useState<ProfileViewRow | null>(null);
  const [resettingFor, setResettingFor] = useState<ProfileViewRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmStatus() {
    if (!statusFor) return;
    const target = statusFor;
    const next = target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    startTransition(async () => {
      const result = await setUserStatusAction(target.id, next);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(next === "SUSPENDED" ? "Usuario suspendido." : "Usuario activado.");
      setStatusFor(null);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;

    startTransition(async () => {
      const result = await deleteUserAction(target.id);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Usuario eliminado.");
      setDeleting(null);
    });
  }

  return (
    <>
      {/* La conexión se vuelve a leer del servidor cada dos minutos */}
      <PresenceAutoRefresh />
      <Card className="overflow-visible">
        <FilterBar
          activeCount={activeFilterCount}
          search={<SearchField placeholder="Buscar por RUT, nombre o cargo…" />}
          actions={
            can.create ? (
              <Button
                onClick={() => setCreating(true)}
                icon={<Plus className="size-4" aria-hidden />}
              >
                Nuevo usuario
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
            paramName="rol"
            label="Rol"
            options={roles.map((role) => ({ value: role.id, label: role.name }))}
          />
          <FilterSelect
            paramName="estado"
            label="Estado"
            options={[
              { value: "ACTIVE", label: "Activos" },
              { value: "SUSPENDED", label: "Suspendidos" },
            ]}
          />
        </FilterBar>

        {users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" aria-hidden />}
            title={
              activeFilterCount > 0
                ? "Ningún usuario coincide con los filtros"
                : "No hay usuarios registrados"
            }
            description={
              activeFilterCount > 0
                ? "Modifique la búsqueda o limpie los filtros aplicados."
                : "Cree el primer usuario para dar acceso a la plataforma."
            }
          />
        ) : (
          <>
            <ResponsiveTable
              cards={
                <CardList>
                  {users.map((user) => (
                    <RowCard
                      key={user.id}
                      icon={
                        <Avatar
                          name={user.full_name}
                          src={avatarUrl(user.avatar_path, supabaseUrl)}
                          size="sm"
                        />
                      }
                      tone={user.status === "ACTIVE" ? "success" : "danger"}
                      title={
                        <span>
                          {user.full_name}
                          {user.id === currentUserId && (
                            <span className="ml-1.5 text-[11px] font-normal text-ink-muted">
                              (usted)
                            </span>
                          )}
                        </span>
                      }
                      subtitle={formatRut(user.rut)}
                      badge={<UserStatusBadge status={user.status} />}
                      fields={[
                        {
                          label: "Conexión",
                          value: (
                            <PresenceCell
                              lastSeenAt={user.last_seen_at}
                              lastLoginAt={user.last_login_at}
                            />
                          ),
                          icon: <Radio className="size-3" aria-hidden />,
                        },
                        {
                          label: "Cargo descriptivo",
                          value: user.job_title,
                          icon: <BriefcaseBusiness className="size-3" aria-hidden />,
                        },
                        {
                          label: "Terminal",
                          value: user.primary_terminal_name,
                          icon: <MapPin className="size-3" aria-hidden />,
                        },
                        {
                          label: "Rol de permisos",
                          value: user.role_name,
                          icon: <ShieldCheck className="size-3" aria-hidden />,
                        },
                        {
                          label: "Accesos",
                          value: <AccessSummary user={user} />,
                          icon: <KeyRound className="size-3" aria-hidden />,
                        },
                      ]}
                      actions={
                        <UserRowMenu
                          user={user}
                          isSelf={user.id === currentUserId}
                          can={can}
                          onEdit={() => setEditing(user)}
                          onPermissions={() => setPermissionsFor(user)}
                          onStatus={() => setStatusFor(user)}
                          onDelete={() => setDeleting(user)}
                          onResetPassword={() => setResettingFor(user)}
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

      {can.create && creating && (
        <UserFormModal
          open
          terminals={terminals}
          roles={roles}
          canEditProfile
          canManageAccess={can.manageAccess}
          canGrantGlobal={can.manageAccess && currentUserHasGlobalAccess}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            toast.success("Usuario creado correctamente.");
          }}
        />
      )}

      {(can.edit || can.manageAccess) && editing && (
        <UserFormModal
          open
          user={editing}
          terminals={terminals}
          roles={roles}
          canEditProfile={can.edit}
          canManageAccess={can.manageAccess}
          canGrantGlobal={can.manageAccess && currentUserHasGlobalAccess}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Usuario actualizado correctamente.");
          }}
        />
      )}

      {can.manageAccess && permissionsFor && (
        <UserPermissionsModal
          open
          user={permissionsFor}
          role={roles.find((role) => role.id === permissionsFor.role_id)}
          permissions={permissions}
          onClose={() => setPermissionsFor(null)}
          onSaved={() => {
            setPermissionsFor(null);
            toast.success("Permisos actualizados correctamente.");
          }}
        />
      )}

      {can.edit && resettingFor && (
        <ResetPasswordModal
          user={resettingFor}
          onClose={() => setResettingFor(null)}
          onSaved={() => {
            setResettingFor(null);
            toast.success("Contraseña actualizada correctamente.");
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(statusFor)}
        onClose={() => setStatusFor(null)}
        onConfirm={confirmStatus}
        loading={pending}
        tone={statusFor?.status === "ACTIVE" ? "danger" : "primary"}
        title={statusFor?.status === "ACTIVE" ? "Suspender usuario" : "Activar usuario"}
        confirmLabel={statusFor?.status === "ACTIVE" ? "Suspender" : "Activar"}
        message={
          statusFor?.status === "ACTIVE" ? (
            <>
              <p>
                <strong>{statusFor?.full_name}</strong> dejará de poder utilizar la plataforma de
                inmediato.
              </p>
              <p className="mt-2">
                Se cerrarán sus sesiones abiertas y ninguna consulta suya devolverá información,
                aunque intente acceder por otros medios.
              </p>
            </>
          ) : (
            <p>
              <strong>{statusFor?.full_name}</strong> podrá volver a ingresar con su RUT y
              contraseña.
            </p>
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={pending}
        title="Eliminar usuario"
        confirmLabel="Eliminar definitivamente"
        message={
          <>
            <p>
              Se eliminará definitivamente a <strong>{deleting?.full_name}</strong> (
              {formatRut(deleting?.rut ?? "")}) y su credencial de acceso.
            </p>
            <p className="mt-2">
              Los registros que haya creado se conservan, y la bitácora de auditoría mantiene su
              RUT y nombre. Esta acción no se puede deshacer.
            </p>
            <p className="mt-2 text-ink-muted">
              Si sólo desea impedirle el acceso, use <strong>Suspender</strong>.
            </p>
          </>
        }
      />
    </>
  );
}

/** §11 · «Accesos autorizados» en una celda legible. */
function AccessSummary({ user }: { user: ProfileViewRow }) {
  if (user.has_global_access) {
    return (
      <Badge tone="warning" icon={<ShieldCheck className="size-3" aria-hidden />}>
        Todos los terminales
      </Badge>
    );
  }

  if (user.additional_terminals.length === 0) {
    return <span className="text-sm text-ink-muted">Sólo su terminal</span>;
  }

  return (
    <span className="text-sm text-ink-secondary">
      + {user.additional_terminals.map((terminal) => terminal.name).join(", ")}
    </span>
  );
}

function UserRowMenu({
  user,
  isSelf,
  can,
  onEdit,
  onPermissions,
  onStatus,
  onDelete,
  onResetPassword,
}: {
  user: ProfileViewRow;
  isSelf: boolean;
  can: Props["can"];
  onEdit: () => void;
  onPermissions: () => void;
  onStatus: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  const [open, setOpen] = useState(false);

  // §56 · nadie administra su propia cuenta desde aquí
  const items = [
    (can.edit || can.manageAccess) &&
      !isSelf && {
        label: can.edit ? "Editar usuario" : "Administrar acceso",
        icon: Pencil,
        action: onEdit,
      },
    can.manageAccess && !isSelf && { label: "Permisos", icon: ShieldCheck, action: onPermissions },
    can.edit && !isSelf && { label: "Cambiar contraseña", icon: KeyRound, action: onResetPassword },
    can.suspend &&
      !isSelf && {
        label: user.status === "ACTIVE" ? "Suspender" : "Activar",
        icon: user.status === "ACTIVE" ? UserX : UserCheck,
        action: onStatus,
      },
    can.remove && !isSelf && { label: "Eliminar", icon: Trash2, action: onDelete, danger: true },
  ].filter(Boolean) as {
    label: string;
    icon: typeof Pencil;
    action: () => void;
    danger?: boolean;
  }[];

  if (items.length === 0) return null;

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
          <div className="absolute right-0 z-20 mt-8 w-52 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-raised)]">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-surface-muted ${
                  item.danger ? "text-danger-600" : "text-ink"
                }`}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: ProfileViewRow;
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
    formData.set("id", user.id);

    startTransition(async () => {
      const result = await resetUserPasswordAction(formData);

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
      size="sm"
      title="Cambiar contraseña"
      description={`${user.full_name} · ${formatRut(user.rut)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="reset-password-form" loading={pending}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={onSubmit} noValidate>
        <Field
          label="Nueva contraseña"
          required
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Comuníquela al usuario por un medio seguro.`}
          error={fieldErrors.password}
          htmlFor="new-password"
        >
          <Input
            id="new-password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            autoFocus
            invalid={Boolean(fieldErrors.password)}
          />
        </Field>
      </form>
    </Modal>
  );
}
