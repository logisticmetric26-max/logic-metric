"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { setUserPermissionOverridesAction } from "@/features/access/actions";
import type { PermissionRow, ProfileViewRow, RoleViewRow } from "@/types/database.types";
import { cn } from "@/lib/utils";

type OverrideState = "INHERITED" | "GRANTED" | "REVOKED";

const MODULE_LABELS: Record<string, string> = {
  technical_review: "Revisión técnica",
  fleet: "Flota",
  terminals: "Terminales",
  access: "Acceso",
  settings: "Plataforma",
};

/**
 * §10 · Permisos efectivos de un usuario.
 *
 * Cada permiso tiene tres estados: heredar del rol, conceder explícitamente o
 * revocar explícitamente. Las excepciones se guardan en
 * `user_permission_overrides` y siempre pesan más que el rol, tal como resuelve
 * `app.has_permission()`.
 */
export function UserPermissionsModal({
  open,
  user,
  role,
  permissions,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: ProfileViewRow;
  role: RoleViewRow | undefined;
  permissions: PermissionRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const rolePermissions = useMemo(() => new Set(role?.permissions ?? []), [role]);

  const [overrides, setOverrides] = useState<Record<string, OverrideState>>(() => {
    const initial: Record<string, OverrideState> = {};
    for (const override of user.permission_overrides) {
      initial[override.permission_code] = override.granted ? "GRANTED" : "REVOKED";
    }
    return initial;
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionRow[]>();
    for (const permission of permissions) {
      const list = groups.get(permission.module) ?? [];
      list.push(permission);
      groups.set(permission.module, list);
    }
    return [...groups.entries()];
  }, [permissions]);

  function stateOf(code: string): OverrideState {
    return overrides[code] ?? "INHERITED";
  }

  function isEffective(code: string): boolean {
    const state = stateOf(code);
    if (state === "GRANTED") return true;
    if (state === "REVOKED") return false;
    return rolePermissions.has(code);
  }

  function setState(code: string, state: OverrideState) {
    setOverrides((current) => {
      const next = { ...current };
      if (state === "INHERITED") delete next[code];
      else next[code] = state;
      return next;
    });
  }

  function save() {
    const granted = Object.entries(overrides)
      .filter(([, state]) => state === "GRANTED")
      .map(([code]) => code);
    const revoked = Object.entries(overrides)
      .filter(([, state]) => state === "REVOKED")
      .map(([code]) => code);

    startTransition(async () => {
      const result = await setUserPermissionOverridesAction(user.id, granted, revoked);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      onSaved();
    });
  }

  const overrideCount = Object.keys(overrides).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      size="xl"
      title="Permisos del usuario"
      description={`${user.full_name} · rol ${user.role_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Guardar permisos
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert tone="info">
          Por defecto el usuario hereda los permisos de su rol. Las excepciones definidas aquí
          pesan más que el rol y sólo afectan a este usuario.
        </Alert>

        {overrideCount > 0 && (
          <p className="text-sm text-ink-muted">
            {overrideCount} excepción{overrideCount === 1 ? "" : "es"} definida
            {overrideCount === 1 ? "" : "s"}.
          </p>
        )}

        {grouped.map(([module, modulePermissions]) => (
          <fieldset key={module} className="rounded-lg border border-border">
            <legend className="mx-3 px-1 text-sm font-medium text-ink-secondary">
              {MODULE_LABELS[module] ?? module}
            </legend>

            <div className="divide-y divide-border">
              {modulePermissions.map((permission) => {
                const state = stateOf(permission.code);
                const effective = isEffective(permission.code);
                const inRole = rolePermissions.has(permission.code);

                return (
                  <div
                    key={permission.code}
                    className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{permission.label}</span>
                        {effective ? (
                          <Badge tone="success">Concedido</Badge>
                        ) : (
                          <Badge tone="neutral">Sin acceso</Badge>
                        )}
                        {state !== "INHERITED" && <Badge tone="warning">Excepción</Badge>}
                      </div>
                      {permission.description && (
                        <p className="mt-0.5 text-xs text-ink-muted">{permission.description}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 rounded-lg border border-border p-0.5">
                      {(
                        [
                          ["INHERITED", inRole ? "Del rol (sí)" : "Del rol (no)"],
                          ["GRANTED", "Conceder"],
                          ["REVOKED", "Revocar"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setState(permission.code, value)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                            state === value
                              ? "bg-brand-600 text-white"
                              : "text-ink-muted hover:bg-surface-muted",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
