import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { TerminalsManager } from "@/features/terminals/terminals-manager";
import { escapeLikePattern } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Terminales" };

/**
 * §15 · Terminales.
 *
 * La consulta usa el cliente de sesión: RLS decide qué terminales devuelve.
 * Un usuario sin `terminals.view` sólo verá aquellos a los que tiene acceso.
 */
export default async function TerminalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requirePermission(PERMISSIONS.terminals.view);
  const { q } = await searchParams;

  const supabase = await createClient();

  let query = supabase.from("terminals").select("*").order("name");

  if (q?.trim()) {
    const pattern = `%${escapeLikePattern(q.trim())}%`;
    query = query.or(`name.ilike.${pattern},code.ilike.${pattern}`);
  }

  const { data, error } = await query;

  if (error) {
    reportError("terminalesPage", error);
    return <ErrorState description="No fue posible obtener el listado de terminales." />;
  }

  return (
    <TerminalsManager
      terminals={data ?? []}
      canCreate={context.permissions.includes(PERMISSIONS.terminals.create)}
      canEdit={context.permissions.includes(PERMISSIONS.terminals.edit)}
    />
  );
}
