"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatRut, formatRutInput } from "@/lib/auth/rut";
import { PASSWORD_MIN_LENGTH } from "@/features/access/schemas";
import { createUserAction, updateUserAction } from "@/features/access/actions";
import type { ProfileViewRow, RoleViewRow, TerminalRow } from "@/types/database.types";

interface Props {
  open: boolean;
  user?: ProfileViewRow;
  terminals: Pick<TerminalRow, "id" | "name" | "active">[];
  roles: Pick<RoleViewRow, "id" | "name">[];
  canManageAccess: boolean;
  canGrantGlobal: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * §11 · Alta y edición de usuarios.
 *
 * Al crear se pide RUT y contraseña; al editar el RUT se muestra pero no se
 * puede cambiar: de él se deriva la credencial de Supabase Auth (§7).
 */
export function UserFormModal({
  open,
  user,
  terminals,
  roles,
  canManageAccess,
  canGrantGlobal,
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rut, setRut] = useState("");
  const [globalAccess, setGlobalAccess] = useState(user?.has_global_access ?? false);

  const activeTerminals = terminals.filter(
    (terminal) => terminal.active || terminal.id === user?.primary_terminal_id,
  );

  const initialAdditional = new Set(user?.additional_terminals.map((item) => item.id) ?? []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    if (user) formData.set("id", user.id);

    startTransition(async () => {
      const result = user ? await updateUserAction(formData) : await createUserAction(formData);

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
      title={user ? "Editar usuario" : "Nuevo usuario"}
      description={
        user
          ? `RUT ${formatRut(user.rut)} · el RUT no puede modificarse`
          : "El usuario ingresará a la plataforma con su RUT y esta contraseña."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" loading={pending}>
            {user ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {!user && (
            <>
              <Field label="RUT" required error={fieldErrors.rut} htmlFor="user-rut">
                <Input
                  id="user-rut"
                  name="rut"
                  value={rut}
                  onChange={(event) => setRut(formatRutInput(event.target.value))}
                  placeholder="12.345.678-9"
                  required
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  invalid={Boolean(fieldErrors.rut)}
                />
              </Field>

              <Field
                label="Contraseña"
                required
                hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
                error={fieldErrors.password}
                htmlFor="user-password"
              >
                <Input
                  id="user-password"
                  name="password"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  invalid={Boolean(fieldErrors.password)}
                />
              </Field>
            </>
          )}

          <Field label="Nombre" required error={fieldErrors.full_name} htmlFor="user-name">
            <Input
              id="user-name"
              name="full_name"
              defaultValue={user?.full_name ?? ""}
              required
              maxLength={160}
              autoFocus={Boolean(user)}
              invalid={Boolean(fieldErrors.full_name)}
            />
          </Field>

          <Field label="Cargo" required error={fieldErrors.job_title} htmlFor="user-job">
            <Input
              id="user-job"
              name="job_title"
              defaultValue={user?.job_title ?? ""}
              required
              maxLength={120}
              invalid={Boolean(fieldErrors.job_title)}
            />
          </Field>

          <Field
            label="Terminal principal"
            required
            error={fieldErrors.primary_terminal_id}
            htmlFor="user-terminal"
          >
            <Select
              id="user-terminal"
              name="primary_terminal_id"
              defaultValue={user?.primary_terminal_id ?? ""}
              required
              invalid={Boolean(fieldErrors.primary_terminal_id)}
            >
              <option value="" disabled>
                Seleccione…
              </option>
              {activeTerminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.name}
                  {terminal.active ? "" : " (inactivo)"}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Rol" required error={fieldErrors.role_id} htmlFor="user-role">
            <Select
              id="user-role"
              name="role_id"
              defaultValue={user?.role_id ?? ""}
              required
              invalid={Boolean(fieldErrors.role_id)}
            >
              <option value="" disabled>
                Seleccione…
              </option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* §9 · terminales autorizados además del principal */}
        {canManageAccess && (
          <fieldset className="rounded-lg border border-border p-3.5">
            <legend className="px-1 text-sm font-medium text-ink-secondary">
              Terminales adicionales autorizados
            </legend>

            {globalAccess ? (
              <Alert tone="info" className="mt-2">
                Con acceso global, el usuario ve todos los terminales. No es necesario
                autorizarlos uno a uno.
              </Alert>
            ) : (
              <div className="mt-2 flex max-h-52 flex-col gap-0.5 overflow-y-auto">
                {activeTerminals.length === 0 && (
                  <p className="text-sm text-ink-muted">No hay terminales disponibles.</p>
                )}
                {activeTerminals.map((terminal) => (
                  <Checkbox
                    key={terminal.id}
                    name="additional_terminals"
                    value={terminal.id}
                    defaultChecked={initialAdditional.has(terminal.id)}
                    label={terminal.name}
                  />
                ))}
              </div>
            )}

            <p className="mt-2 text-xs text-ink-muted">
              El terminal principal siempre está autorizado; no hace falta marcarlo aquí.
            </p>
          </fieldset>
        )}

        {canGrantGlobal && (
          <Checkbox
            name="has_global_access"
            checked={globalAccess}
            onChange={(event) => setGlobalAccess(event.target.checked)}
            label="Acceso a todos los terminales"
            description="El usuario verá la información de todos los terminales, siempre dentro de los permisos de su rol."
          />
        )}
      </form>
    </Modal>
  );
}
