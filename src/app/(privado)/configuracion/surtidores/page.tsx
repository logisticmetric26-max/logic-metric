import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { DispensersManager } from "@/features/dispensers/dispensers-manager";
import { escapeLikePattern } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Surtidores" };

export default async function SurtidoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const context = await requirePermission(PERMISSIONS.dispensers.view);
  const { q, estado } = await searchParams;

  const supabase = await createClient();
  let query = supabase.from("dispensers").select("*").order("code");

  if (q?.trim()) {
    const pattern = `%${escapeLikePattern(q.trim())}%`;
    query = query.or(
      `code.ilike.${pattern},planner_rut.ilike.${pattern},supervisor_rut.ilike.${pattern}`,
    );
  }

  if (estado === "activos") query = query.eq("active", true);
  if (estado === "inactivos") query = query.eq("active", false);

  const { data, error } = await query;

  if (error) {
    reportError("dispensersPage", error);
    return <ErrorState description="No fue posible obtener el listado de surtidores." />;
  }

  const activeFilterCount = [q, estado].filter(Boolean).length;

  return (
    <DispensersManager
      dispensers={data ?? []}
      canCreate={context.permissions.includes(PERMISSIONS.dispensers.create)}
      canEdit={context.permissions.includes(PERMISSIONS.dispensers.edit)}
      canDelete={context.permissions.includes(PERMISSIONS.dispensers.delete)}
      activeFilterCount={activeFilterCount}
    />
  );
}
