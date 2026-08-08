"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/auth/session";
import { authIdentifierForRut } from "@/lib/auth/rut-identity";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
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

  if (!context.permissions.includes(PERMISSIONS.users.create)) {
    return actionError("No tiene permisos para crear usuarios.");
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
    return actionError(reportError("createUser.auth", authError));
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

  if (!context.permissions.includes(PERMISSIONS.users.edit)) {
    return actionError("No tiene permisos para editar usuarios.");
  }

  const parsed = updateUserSchema.safeParse({
    id: formData.get("id"),
    full_name: formData.get("full_name"),
    job_title: formData.get("job_title"),
    primary_terminal_id: formData.get("primary_terminal_id"),
    role_id: formData.get("role_id"),
    has_global_access: formData.get("has_global_access"),
    additional_terminals: readTerminalList(formData),
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const input = parsed.data;
  const supabase = await createClient();

  // §56 · aunque tenga todos los permisos, nadie edita sus propios privilegios.
  // La base lo impide igualmente con un trigger; aquí sólo se explica mejor.
  if (input.id === context.profile.id) {
    return actionError("No puede modificar su propio rol, estado ni terminales.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.full_name,
      job_title: input.job_title,
      primary_terminal_id: input.primary_terminal_id,
      role_id: input.role_id,
      has_global_access: input.has_global_access,
      updated_by: context.profile.id,
    })
    .eq("id", input.id);

  if (error) return actionError(reportError("updateUser", error));

  // Los terminales adicionales se reemplazan por el conjunto enviado
  if (context.permissions.includes(PERMISSIONS.access.manage)) {
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
  if (error) return actionError(reportError("deleteUser", error));

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

  if (error) return actionError(reportError("resetUserPassword", error));

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

  if (userId === context.profile.id) {
    return actionError("No puede modificar sus propios permisos.");
  }

  const supabase = await createClient();

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

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .insert({ name: parsed.data.name, description: parsed.data.description })
    .select("id")
    .single();

  if (error) return actionError(reportError("createRole", error));

  if (parsed.data.permissions.length > 0) {
    const { error: permissionError } = await supabase.from("role_permissions").insert(
      parsed.data.permissions.map((code) => ({ role_id: data.id, permission_code: code })),
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

  if (parsed.data.permissions.length > 0) {
    const { error: insertError } = await supabase.from("role_permissions").insert(
      parsed.data.permissions.map((code) => ({
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
