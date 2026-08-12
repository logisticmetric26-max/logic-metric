import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUserContext } from "@/types/database.types";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";

export type SessionState =
  | { kind: "ANONYMOUS" }
  | { kind: "NO_PROFILE"; userId: string }
  | { kind: "SUSPENDED"; context: CurrentUserContext }
  | { kind: "ACTIVE"; context: CurrentUserContext };

/**
 * Estado de sesión del request actual.
 *
 * `cache()` lo memoiza por request: aunque el layout, la página y tres
 * componentes lo pidan, se resuelve una sola vez.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();

  // Se pregunta PRIMERO por el contexto, no por el usuario.
  //
  // `getUser()` viaja al servidor de Auth para validar el token: unos 200 ms en
  // el camino crítico de CADA página. Esta llamada no lo necesita, porque
  // PostgREST verifica la firma del JWT antes de ejecutar nada y `auth.uid()`
  // sale de las credenciales ya validadas — no de la cookie, que sí sería
  // manipulable. Un token con firma correcta pero de un usuario eliminado
  // devuelve contexto vacío y cae en el camino de abajo.
  const { data } = await supabase.rpc("current_user_context");
  const context = data as CurrentUserContext | null;

  if (context?.profile) {
    if (context.profile.status !== "ACTIVE") return { kind: "SUSPENDED", context };
    return { kind: "ACTIVE", context };
  }

  // Camino infrecuente: sin contexto hay que distinguir «nadie ha iniciado
  // sesión» de «credencial válida sin ficha», y para eso sí hace falta
  // preguntarle a Auth quién es.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "ANONYMOUS" };

  return { kind: "NO_PROFILE", userId: user.id };
});

/**
 * Exige una sesión activa. Redirige si no la hay.
 * Es la puerta de entrada de cada página del área privada.
 */
export async function requireActiveUser(): Promise<CurrentUserContext> {
  const state = await getSessionState();

  switch (state.kind) {
    case "ACTIVE":
      return state.context;
    case "SUSPENDED":
      redirect("/acceso-suspendido");
    case "NO_PROFILE":
      redirect("/sin-perfil");
    default:
      redirect("/login");
  }
}

/**
 * Exige un permiso concreto.
 *
 * Es una comprobación de navegación (evita mostrar una pantalla que fallaría),
 * NO la barrera de seguridad: aunque se saltara, RLS rechazaría la consulta.
 */
export async function requirePermission(permission: PermissionCode): Promise<CurrentUserContext> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(permission)) {
    redirect("/sin-permisos");
  }

  return context;
}

export async function requireAnyPermission(
  permissions: readonly PermissionCode[],
): Promise<CurrentUserContext> {
  const context = await requireActiveUser();

  if (!permissions.some((permission) => context.permissions.includes(permission))) {
    redirect("/sin-permisos");
  }

  return context;
}

/** Primera ruta del sidebar a la que el usuario sí tiene acceso. */
export function landingRouteFor(context: CurrentUserContext): string {
  if (context.permissions.includes(PERMISSIONS.technicalReview.view)) return "/revision-tecnica";
  if (context.permissions.includes(PERMISSIONS.fuelCalendar.view)) return "/combustible";
  if (context.permissions.includes(PERMISSIONS.fleet.view)) return "/configuracion/flota";
  if (context.permissions.includes(PERMISSIONS.terminals.view)) return "/configuracion/terminales";
  if (context.permissions.includes(PERMISSIONS.users.view)) return "/acceso";
  return "/sin-permisos";
}
