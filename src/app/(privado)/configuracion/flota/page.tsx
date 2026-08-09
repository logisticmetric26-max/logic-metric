import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ErrorState } from "@/components/ui/feedback";
import { FleetManager } from "@/features/fleet/fleet-manager";
import { escapeLikePattern, parsePageParam } from "@/lib/utils";
import { reportError } from "@/lib/errors";

export const metadata: Metadata = { title: "Flota" };

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  terminal?: string;
  tipo?: string;
  estado?: string;
  pagina?: string;
}

/**
 * §14 · Flota.
 *
 * Búsqueda, filtros y paginación se resuelven en la base (§66, §67): el
 * navegador recibe como máximo una página de resultados, no la flota completa.
 */
export default async function FlotaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermission(PERMISSIONS.fleet.view);
  const params = await searchParams;

  const page = parsePageParam(params.pagina);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from("fleet_view")
    .select("*", { count: "planned" })
    .order("internal_number")
    .range(from, from + PAGE_SIZE - 1);

  if (params.q?.trim()) {
    // La búsqueda operacional es siempre por PPU o número interno (§65)
    const raw = params.q.trim();
    const ppuPattern = `%${escapeLikePattern(raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}%`;
    const internalPattern = `%${escapeLikePattern(raw.toUpperCase())}%`;
    query = query.or(`ppu.ilike.${ppuPattern},internal_number.ilike.${internalPattern}`);
  }

  if (params.terminal) query = query.eq("terminal_id", params.terminal);
  if (params.tipo) query = query.eq("fuel_type", params.tipo);
  if (params.estado === "activos") query = query.eq("active", true);
  if (params.estado === "inactivos") query = query.eq("active", false);

  // Sólo los terminales autorizados llegan al selector: RLS los filtra
  const [{ data: buses, count, error }, { data: terminals }, { data: fuelTypes }] =
    await Promise.all([
      query,
      supabase.from("terminals").select("id, name, active").order("name"),
      supabase.from("fleet_fuel_types").select("*").eq("active", true).order("sort_order"),
    ]);

  if (error) {
    reportError("flotaPage", error);
    return <ErrorState description="No fue posible obtener el listado de la flota." />;
  }

  const activeFilterCount = [params.q, params.terminal, params.tipo, params.estado].filter(
    Boolean,
  ).length;

  return (
    <FleetManager
      buses={buses ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      terminals={terminals ?? []}
      fuelTypes={fuelTypes ?? []}
      canCreate={context.permissions.includes(PERMISSIONS.fleet.create)}
      canEdit={context.permissions.includes(PERMISSIONS.fleet.edit)}
      activeFilterCount={activeFilterCount}
    />
  );
}
