import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { RolesManager } from "@/features/access/roles-manager";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Roles y permisos" };

/** §10 · Administración de roles y su relación con los permisos. */
export default async function RolesPage() {
  await requirePermission(PERMISSIONS.access.manage);

  const supabase = await createClient();

  const [{ data: roles, error }, { data: permissions }] = await Promise.all([
    supabase.from("roles_view").select("*").order("name"),
    supabase.from("permissions").select("*").order("sort_order"),
  ]);

  if (error) {
    reportError("rolesPage", error);
    return <ErrorState description="No fue posible obtener el listado de roles." />;
  }

  return <RolesManager roles={roles ?? []} permissions={permissions ?? []} canManage />;
}
