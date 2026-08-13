"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { setUserPermissionOverridesAction } from "@/features/access/actions";
import { cn } from "@/lib/utils";
import {
  grantPermissionWithDependencies,
  isPermissionCode,
  revokePermissionWithDependents,
  type PermissionCode,
} from "@/lib/auth/permissions";
import type { PermissionRow, ProfileViewRow, RoleViewRow } from "@/types/database.types";

type OverrideState = "INHERITED" | "GRANTED" | "REVOKED";

const MODULE_LABELS: Record<string, string> = {
  technical_review: "Revision tecnica",
  fuel_calendar: "Combustible",
  bad_loads: "Malas cargas",
  bus_wash: "Lavado buses",
  fleet: "Flota",
  terminals: "Terminales",
  dispensers: "Surtidores",
  reader_codes: "Codigos lectores",
  access: "Acceso",
  settings: "Plataforma",
};

/**
 * Permisos efectivos de un usuario.
 *
 * Cada permiso tiene tres estados: heredar del rol, conceder explicitamente o
 * revocar explicitamente. Las excepciones se guardan en
 * `user_permission_overrides` y siempre pesan mas que el rol.
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
      if (!isPermissionCode(permission.code)) continue;
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
    if (!isPermissionCode(code)) return;

    setOverrides((current) => {
      let effective = new Set<PermissionCode>();

      for (const permission of permissions) {
        if (!isPermissionCode(permission.code)) continue;
        const override = current[permission.code] ?? "INHERITED";
        const enabled =
          override === "GRANTED" ||
          (override === "INHERITED" && rolePermissions.has(permission.code));
        if (enabled) effective.add(permission.code);
      }

      const enabled = state === "GRANTED" || (state === "INHERITED" && rolePermissions.has(code));
      effective = enabled
        ? grantPermissionWithDependencies(effective, code)
        : revokePermissionWithDependents(effective, code);

      const next: Record<string, OverrideState> = {};
      for (const permission of permissions) {
        if (!isPermissionCode(permission.code)) continue;
        const inherited = rolePermissions.has(permission.code);
        const selected = effective.has(permission.code);
        if (selected !== inherited) next[permission.code] = selected ? "GRANTED" : "REVOKED";
      }
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
      description={`${user.full_name} - rol ${user.role_name}`}
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
          Por defecto el usuario hereda los permisos de su rol. Las excepciones definidas aqui
          pesan mas que el rol y solo afectan a este usuario. Los requisitos de cada capacidad se
          ajustan automaticamente para evitar accesos incompletos.
        </Alert>

        {overrideCount > 0 && (
          <p className="text-sm text-ink-muted">
            {overrideCount} excepcion{overrideCount === 1 ? "" : "es"} definida
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
                        {state !== "INHERITED" && <Badge tone="warning">Excepcion</Badge>}
                      </div>
                      {permission.description && (
                        <p className="mt-0.5 text-xs text-ink-muted">{permission.description}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 rounded-lg border border-border p-0.5">
                      {(
                        [
                          ["INHERITED", inRole ? "Del rol (si)" : "Del rol (no)"],
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
                              ? "bg-brand-solid-to text-white"
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
