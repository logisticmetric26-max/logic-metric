import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { UsersManager } from "@/features/access/users-manager";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { normalizeRut } from "@/lib/auth/rut";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Acceso" };

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  terminal?: string;
  rol?: string;
  estado?: string;
  pagina?: string;
}

/**
 * §11 · Usuarios.
 *
 * RLS decide qué usuarios devuelve la consulta: un administrador de terminal
 * sólo ve las fichas de sus terminales autorizados.
 */
export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.users.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from("profiles_view")
    .select("*", { count: "exact" })
    .order("full_name")
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    const raw = params.q.trim();
    // Si lo escrito es un RUT válido se busca por su forma normalizada; si no,
    // se busca por nombre o cargo.
    const normalizedRut = normalizeRut(raw);
    const pattern = `%${escapeLikePattern(raw)}%`;
    const rutPattern = `%${escapeLikePattern(normalizedRut ?? raw.replace(/[^0-9kK]/g, ""))}%`;
    query = query.or(`rut.ilike.${rutPattern},full_name.ilike.${pattern},job_title.ilike.${pattern}`);
  }

  if (params.terminal) query = query.eq("primary_terminal_id", params.terminal);
  if (params.rol) query = query.eq("role_id", params.rol);
  if (params.estado === "ACTIVE" || params.estado === "SUSPENDED") {
    query = query.eq("status", params.estado);
  }

  const [{ data: users, count, error }, { data: terminals }, { data: roles }, { data: permissions }] =
    await Promise.all([
      query,
      supabase.from("terminals").select("id, name, active").order("name"),
      supabase.from("roles_view").select("*").order("name"),
      supabase.from("permissions").select("*").order("sort_order"),
    ]);

  if (error) {
    reportError("accesoPage", error);
    return <ErrorState description="No fue posible obtener el listado de usuarios." />;
  }

  const activeFilterCount = [params.q, params.terminal, params.rol, params.estado].filter(
    Boolean,
  ).length;

  return (
    <UsersManager
      users={users ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      terminals={terminals ?? []}
      roles={roles ?? []}
      permissions={permissions ?? []}
      currentUserId={context.profile.id}
      currentUserHasGlobalAccess={context.profile.has_global_access}
      can={{
        create: context.permissions.includes(PERMISSIONS.users.create),
        edit: context.permissions.includes(PERMISSIONS.users.edit),
        suspend: context.permissions.includes(PERMISSIONS.users.suspend),
        remove: context.permissions.includes(PERMISSIONS.users.delete),
        manageAccess: context.permissions.includes(PERMISSIONS.access.manage),
      }}
      activeFilterCount={activeFilterCount}
      supabaseUrl={getPublicEnv().supabaseUrl}
    />
  );
}
