"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/auth/session";
import { authIdentifierForRut } from "@/lib/auth/rut-identity";
import {
  PERMISSIONS,
  isPermissionCode,
  missingPermissionDependencies,
  type PermissionCode,
} from "@/lib/auth/permissions";
import {
  actionError,
  actionSuccess,
  reportError,
  toUserMessage,
  type ActionResult,
} from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import type { ProfileRow } from "@/types/database.types";
import {
  createUserSchema,
  permissionOverridesSchema,
  resetPasswordSchema,
  roleSchema,
  roleUpdateSchema,
  updateUserSchema,
} from "@/features/access/schemas";

/**
 * §11, §12 · Administración de accesos.
 *
 * REPARTO DE RESPONSABILIDADES
 * ----------------------------
 * · Cliente de SESIÓN (RLS) → todo lo que ocurre en tablas de negocio:
 *   editar la ficha, cambiar rol, terminales, permisos y estado. La base valida
 *   permiso, acceso al terminal e impide la auto-elevación (§56).
 *
 * · Cliente ADMIN (service role) → sólo lo que exige tocar Supabase Auth:
 *   crear la credencial, cambiar contraseña, cerrar sesiones y eliminar el
 *   usuario. Nunca se usa para saltarse una regla de negocio.
 *
 * La clave de servicio jamás sale del servidor (§12).
 */

const ACCESS_PATH = "/acceso";

/** Terminales adicionales enviados como múltiples campos `additional_terminals`. */
function readTerminalList(formData: FormData): string[] {
  return formData.getAll("additional_terminals").map(String);
}

function validatePermissionCodes(values: readonly string[]):
  | { ok: true; codes: PermissionCode[] }
  | { ok: false; error: string } {
  const unique = [...new Set(values)];
  if (unique.some((code) => !isPermissionCode(code))) {
    return { ok: false, error: "La selección contiene un permiso que no existe." };
  }

  const codes = unique as PermissionCode[];
  if (missingPermissionDependencies(new Set(codes)).length > 0) {
    return {
      ok: false,
      error: "La selección está incompleta. Incluya los accesos requeridos por cada capacidad.",
    };
  }

  return { ok: true, codes };
}

/**
 * Traduce un fallo de Supabase Auth en un mensaje que indique dónde mirar.
 *
 * Un genérico «intente nuevamente» hacía buscar el problema en el formulario
 * cuando la causa estaba en la configuración del servidor: la clave de servicio
 * equivocada deja el inicio de sesión intacto y rompe SÓLO el alta de usuarios,
 * porque es la única operación que la necesita.
 *
 * No revela ningún valor de configuración, sólo qué componente falló.
 */
function describeAuthAdminError(context: string, error: unknown): string {
  // La traza completa queda en el servidor una sola vez, aquí.
  reportError(context, error);

  const status = (error as { status?: number } | null)?.status;
  const message = (error as { message?: string } | null)?.message ?? "";

  if (status === 401 || status === 403) {
    return "El servidor no está autorizado para administrar credenciales. Revise la clave de servicio de Supabase en la configuración del despliegue.";
  }

  if (status === 404) {
    return "No se encontró el servicio de autenticación. Revise la URL de Supabase en la configuración del despliegue.";
  }

  if (!status) {
    return "No fue posible conectar con el servicio de autenticación. Avise al administrador.";
  }

  if (/already|registered|exists/i.test(message)) {
    return "Ya existe una credencial para ese RUT. Contacte al administrador para recuperarla.";
  }

  if (/password/i.test(message)) {
    return "La contraseña no cumple los requisitos mínimos de Supabase.";
  }

  return toUserMessage(error);
}

// =============================================================================
// Usuarios
// =============================================================================

/**
 * Alta de usuario.
 *
 * Se crea primero la credencial y después la ficha. Si la ficha falla, se
 * elimina la credencial recién creada: no deben quedar usuarios de Auth
 * huérfanos que luego no puedan iniciar sesión.
 */
export async function createUserAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (
    !context.permissions.includes(PERMISSIONS.users.create) ||
    !context.permissions.includes(PERMISSIONS.access.manage)
  ) {
    return actionError("No tiene permisos para crear usuarios y asignarles acceso.");
  }

  const parsed = createUserSchema.safeParse({
    rut: formData.get("rut"),
    full_name: formData.get("full_name"),
    job_title: formData.get("job_title"),
    primary_terminal_id: formData.get("primary_terminal_id"),
    role_id: formData.get("role_id"),
    password: formData.get("password"),
    has_global_access: formData.get("has_global_access"),
    additional_terminals: readTerminalList(formData),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const input = parsed.data;

  // Sólo se puede dar de alta en terminales a los que uno mismo tiene acceso
  const reachable = new Set(context.terminals.map((terminal) => terminal.id));
  if (!context.profile.has_global_access) {
    const requested = [input.primary_terminal_id, ...input.additional_terminals];
    if (requested.some((terminalId) => !reachable.has(terminalId))) {
      return actionError("No tiene acceso a este terminal.");
    }
    if (input.has_global_access) {
      return actionError("No puede otorgar acceso global sin tenerlo usted mismo.");
    }
  }

  const identifier = authIdentifierForRut(input.rut);
  if (!identifier) {
    return actionError("El RUT ingresado no es válido.", { rut: "El RUT ingresado no es válido." });
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // El RUT es único: se comprueba antes para dar un mensaje claro en vez de
  // dejar que reviente la restricción de la base.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("rut", input.rut)
    .maybeSingle();

  if (existing) {
    return actionError("Ya existe un usuario registrado con ese RUT.", {
      rut: "Ya existe un usuario registrado con ese RUT.",
    });
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: identifier,
    password: input.password,
    // No se envía correo de confirmación: el identificador es técnico y el
    // dominio no recibe mensajes.
    email_confirm: true,
    user_metadata: { rut: input.rut },
  });

  if (authError || !created.user) {
    return actionError(describeAuthAdminError("createUser.auth", authError));
  }

  const userId = created.user.id;

  // `profiles` no tiene política de INSERT para `authenticated` a propósito
  // (§12): el alta pasa por el servidor, ya con el permiso comprobado arriba.
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    rut: input.rut,
    full_name: input.full_name,
    job_title: input.job_title,
    primary_terminal_id: input.primary_terminal_id,
    role_id: input.role_id,
    has_global_access: input.has_global_access,
    status: "ACTIVE",
    created_by: context.profile.id,
  });

  if (profileError) {
    // Compensación: sin ficha, la credencial no sirve para nada
    await admin.auth.admin.deleteUser(userId);
    return actionError(reportError("createUser.profile", profileError));
  }

  if (input.additional_terminals.length > 0) {
    // Con el cliente de sesión: RLS verifica `access.manage` y el acceso a cada
    // terminal concedido.
    const { error: accessError } = await supabase.from("user_terminal_access").insert(
      input.additional_terminals.map((terminalId) => ({
        user_id: userId,
        terminal_id: terminalId,
        granted_by: context.profile.id,
      })),
    );

    if (accessError) return actionError(reportError("createUser.terminals", accessError));
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess({ id: userId });
}

export async function updateUserAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();
  const canEditProfile = context.permissions.includes(PERMISSIONS.users.edit);
  const canManageAccess = context.permissions.includes(PERMISSIONS.access.manage);

  if (!canEditProfile && !canManageAccess) {
    return actionError("No tiene permisos para editar usuarios.");
  }

  const idParsed = updateUserSchema.shape.id.safeParse(formData.get("id"));
  if (!idParsed.success) return actionError("El usuario indicado no es válido.");

  if (idParsed.data === context.profile.id) {
    return actionError("No puede modificar su propia cuenta desde esta sección.");
  }

  const supabase = await createClient();
  const [{ data: target, error: targetError }, { data: currentTerminals, error: terminalsError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, job_title, primary_terminal_id, role_id, has_global_access")
        .eq("id", idParsed.data)
        .maybeSingle(),
      supabase.from("user_terminal_access").select("terminal_id").eq("user_id", idParsed.data),
    ]);

  if (targetError) return actionError(reportError("updateUser.target", targetError));
  if (terminalsError) return actionError(reportError("updateUser.terminals", terminalsError));
  if (!target) return actionError("No tiene acceso a este usuario.");

  const parsed = updateUserSchema.safeParse({
    id: idParsed.data,
    full_name: canEditProfile ? formData.get("full_name") : target.full_name,
    job_title: canEditProfile ? formData.get("job_title") : target.job_title,
    primary_terminal_id: canManageAccess
      ? formData.get("primary_terminal_id")
      : target.primary_terminal_id,
    role_id: canManageAccess ? formData.get("role_id") : target.role_id,
    has_global_access: canManageAccess
      ? formData.get("has_global_access")
      : target.has_global_access
        ? "on"
        : null,
    additional_terminals: canManageAccess
      ? readTerminalList(formData)
      : (currentTerminals ?? []).map((row) => row.terminal_id),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const input = parsed.data;

  if (canManageAccess) {
    const reachable = new Set(context.terminals.map((terminal) => terminal.id));
    const requested = [input.primary_terminal_id, ...input.additional_terminals];
    if (!context.profile.has_global_access && requested.some((id) => !reachable.has(id))) {
      return actionError("No tiene acceso a uno de los terminales seleccionados.");
    }
    if (!context.profile.has_global_access && input.has_global_access) {
      return actionError("No puede otorgar acceso global sin tenerlo usted mismo.");
    }
  }

  // Tipado como fila parcial de `profiles`, no como `Record<string, unknown>`:
  // así el compilador comprueba que cada campo asignado exista de verdad en la
  // tabla, que es justo lo que un objeto abierto deja pasar.
  const updates: Partial<ProfileRow> = { updated_by: context.profile.id };
  if (canEditProfile) {
    updates.full_name = input.full_name;
    updates.job_title = input.job_title;
  }
  if (canManageAccess) {
    updates.primary_terminal_id = input.primary_terminal_id;
    updates.role_id = input.role_id;
    updates.has_global_access = input.has_global_access;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", input.id);

  if (error) return actionError(reportError("updateUser", error));

  // Los terminales adicionales se reemplazan por el conjunto enviado
  if (canManageAccess) {
    const { error: deleteError } = await supabase
      .from("user_terminal_access")
      .delete()
      .eq("user_id", input.id);

    if (deleteError) return actionError(reportError("updateUser.clearTerminals", deleteError));

    if (input.additional_terminals.length > 0) {
      const { error: insertError } = await supabase.from("user_terminal_access").insert(
        input.additional_terminals.map((terminalId) => ({
          user_id: input.id,
          terminal_id: terminalId,
          granted_by: context.profile.id,
        })),
      );

      if (insertError) return actionError(reportError("updateUser.setTerminals", insertError));
    }
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}

/**
 * §8, §12 · Activar o suspender.
 *
 * Suspender no basta con marcar la fila: hay que invalidar las sesiones
 * abiertas, o el usuario seguiría operando con su token vigente hasta que
 * caducara. RLS ya le negaría cada consulta, pero cerrar la sesión es lo
 * correcto y lo esperable.
 */
export async function setUserStatusAction(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.users.suspend)) {
    return actionError("No tiene permisos para cambiar el estado de un usuario.");
  }

  if (userId === context.profile.id) {
    return actionError("No puede modificar su propio rol, estado ni terminales.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ status, updated_by: context.profile.id })
    .eq("id", userId);

  if (error) return actionError(reportError("setUserStatus", error));

  if (status === "SUSPENDED") {
    const admin = createAdminClient();
    const { error: signOutError } = await admin.auth.admin.signOut(userId, "global");
    // Si falla el cierre de sesión no se revierte la suspensión: RLS ya bloquea
    // al usuario. Queda registrado para revisarlo.
    if (signOutError) reportError("setUserStatus.signOut", signOutError);
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}

/** §11, §12 · Eliminación definitiva. Requiere confirmación en la interfaz. */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.users.delete)) {
    return actionError("No tiene permisos para eliminar usuarios.");
  }

  if (userId === context.profile.id) {
    return actionError("No puede eliminar su propio usuario.");
  }

  const supabase = await createClient();

  // Sólo se puede eliminar a quien se puede VER: si RLS no devuelve la ficha,
  // el usuario pertenece a un terminal fuera de alcance.
  const { data: target, error: readError } = await supabase
    .from("profiles")
    .select("id, primary_terminal_id, full_name, rut")
    .eq("id", userId)
    .maybeSingle();

  if (readError) return actionError(reportError("deleteUser.read", readError));
  if (!target) return actionError("No tiene acceso a este terminal.");

  const admin = createAdminClient();

  // Elimina la credencial; `profiles` cae por ON DELETE CASCADE.
  // La bitácora conserva el RUT y el nombre del usuario eliminado.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return actionError(describeAuthAdminError("deleteUser", error));

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}

export async function resetUserPasswordAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.users.edit)) {
    return actionError("No tiene permisos para editar usuarios.");
  }

  const parsed = resetPasswordSchema.safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!target) return actionError("No tiene acceso a este terminal.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.password,
  });

  if (error) return actionError(describeAuthAdminError("resetUserPassword", error));

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}

/** §10 · Excepciones de permiso por usuario, por encima de su rol. */
export async function setUserPermissionOverridesAction(
  userId: string,
  granted: string[],
  revoked: string[],
): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.access.manage)) {
    return actionError("No tiene permisos para administrar permisos.");
  }

  const parsed = permissionOverridesSchema.safeParse({ id: userId, granted, revoked });
  if (!parsed.success) return actionError("Revise los datos ingresados.");

  const submittedCodes = [...parsed.data.granted, ...parsed.data.revoked];
  if (submittedCodes.some((code) => !isPermissionCode(code))) {
    return actionError("La selección contiene un permiso que no existe.");
  }
  if (parsed.data.granted.some((code) => parsed.data.revoked.includes(code))) {
    return actionError("Un permiso no puede concederse y revocarse al mismo tiempo.");
  }

  if (userId === context.profile.id) {
    return actionError("No puede modificar sus propios permisos.");
  }

  const supabase = await createClient();

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("role_id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (targetError) return actionError(reportError("setOverrides.target", targetError));
  if (!target) return actionError("No tiene acceso a este usuario.");

  const { data: rolePermissions, error: rolePermissionsError } = await supabase
    .from("role_permissions")
    .select("permission_code")
    .eq("role_id", target.role_id);

  if (rolePermissionsError) {
    return actionError(reportError("setOverrides.rolePermissions", rolePermissionsError));
  }

  const effective = new Set<PermissionCode>(
    (rolePermissions ?? [])
      .map((row) => row.permission_code)
      .filter(isPermissionCode),
  );
  for (const code of parsed.data.revoked) effective.delete(code as PermissionCode);
  for (const code of parsed.data.granted) effective.add(code as PermissionCode);

  if (missingPermissionDependencies(effective).length > 0) {
    return actionError(
      "Las excepciones dejarían capacidades incompletas. Revise los permisos requeridos.",
    );
  }

  const { error: deleteError } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("user_id", userId);

  if (deleteError) return actionError(reportError("setOverrides.clear", deleteError));

  const rows = [
    ...parsed.data.granted.map((code) => ({
      user_id: userId,
      permission_code: code,
      granted: true,
      created_by: context.profile.id,
    })),
    ...parsed.data.revoked.map((code) => ({
      user_id: userId,
      permission_code: code,
      granted: false,
      created_by: context.profile.id,
    })),
  ];

  if (rows.length > 0) {
    const { error } = await supabase.from("user_permission_overrides").insert(rows);
    if (error) return actionError(reportError("setOverrides.insert", error));
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}

// =============================================================================
// Roles
// =============================================================================

export async function createRoleAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.access.manage)) {
    return actionError("No tiene permisos para administrar roles.");
  }

  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    permissions: formData.getAll("permissions").map(String),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const permissionSelection = validatePermissionCodes(parsed.data.permissions);
  if (!permissionSelection.ok) {
    return actionError(permissionSelection.error, { permissions: permissionSelection.error });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .insert({ name: parsed.data.name, description: parsed.data.description })
    .select("id")
    .single();

  if (error) return actionError(reportError("createRole", error));

  if (permissionSelection.codes.length > 0) {
    const { error: permissionError } = await supabase.from("role_permissions").insert(
      permissionSelection.codes.map((code) => ({ role_id: data.id, permission_code: code })),
    );

    if (permissionError) return actionError(reportError("createRole.permissions", permissionError));
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess({ id: data.id });
}

export async function updateRoleAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.access.manage)) {
    return actionError("No tiene permisos para administrar roles.");
  }

  const parsed = roleUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    permissions: formData.getAll("permissions").map(String),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const permissionSelection = validatePermissionCodes(parsed.data.permissions);
  if (!permissionSelection.ok) {
    return actionError(permissionSelection.error, { permissions: permissionSelection.error });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("roles")
    .update({ name: parsed.data.name, description: parsed.data.description })
    .eq("id", parsed.data.id);

  if (error) return actionError(reportError("updateRole", error));

  // Se reemplaza el conjunto completo de permisos del rol
  const { error: deleteError } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", parsed.data.id);

  if (deleteError) return actionError(reportError("updateRole.clear", deleteError));

  if (permissionSelection.codes.length > 0) {
    const { error: insertError } = await supabase.from("role_permissions").insert(
      permissionSelection.codes.map((code) => ({
        role_id: parsed.data.id,
        permission_code: code,
      })),
    );

    if (insertError) return actionError(reportError("updateRole.permissions", insertError));
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}

/**
 * Elimina un rol.
 *
 * La base rechaza eliminar roles de sistema y roles con usuarios asignados
 * (ON DELETE RESTRICT sobre `profiles.role_id`), así que no hay forma de dejar
 * usuarios sin rol.
 */
export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.access.manage)) {
    return actionError("No tiene permisos para administrar roles.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", roleId);

  if (error) {
    if (error.message.includes("profiles_role_id_fkey")) {
      return actionError("No se puede eliminar un rol que tiene usuarios asignados.");
    }
    return actionError(reportError("deleteRole", error));
  }

  revalidatePath(ACCESS_PATH);
  return actionSuccess();
}
