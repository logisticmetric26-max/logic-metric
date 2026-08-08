import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AnalyticsFilters, RejectionRecord } from "./analytics-core";

export * from "./analytics-core";

/**
 * Obtiene los motivos del período con su contexto, vía RLS.
 *
 * Dos consultas en lugar de una vista nueva: eventos rechazados del período y
 * sus motivos por lotes de ids (el filtro `in` viaja en la URL y tiene límite
 * de tamaño).
 */
export async function fetchRejectionRecords(
  supabase: SupabaseClient<Database>,
  filters: AnalyticsFilters,
): Promise<RejectionRecord[]> {
  let eventsQuery = supabase
    .from("technical_review_events_view")
    .select("id, internal_number, ppu, terminal_name, return_at, guide_number")
    .eq("status", "CLOSED")
    .eq("result", "REJECTED")
    .order("return_at", { ascending: false })
    // Techo defensivo: ~2 años de operación intensa. Si se alcanza, el reporte
    // sigue siendo correcto para el período más reciente.
    .limit(2000);

  if (filters.from) eventsQuery = eventsQuery.gte("return_at", `${filters.from}T00:00:00`);
  if (filters.to) eventsQuery = eventsQuery.lte("return_at", `${filters.to}T23:59:59`);
  if (filters.terminalId) eventsQuery = eventsQuery.eq("terminal_id", filters.terminalId);

  const { data: events, error } = await eventsQuery;
  if (error) throw error;
  if (!events || events.length === 0) return [];

  const eventById = new Map(events.map((event) => [event.id, event]));
  const records: RejectionRecord[] = [];

  const CHUNK = 100;
  for (let start = 0; start < events.length; start += CHUNK) {
    const ids = events.slice(start, start + CHUNK).map((event) => event.id);

    const { data: rejections, error: rejectionsError } = await supabase
      .from("technical_review_rejections")
      .select("technical_review_event_id, description, requires_review, page_number, origin")
      .in("technical_review_event_id", ids)
      .order("sequence");

    if (rejectionsError) throw rejectionsError;

    for (const rejection of rejections ?? []) {
      const event = eventById.get(rejection.technical_review_event_id);
      if (!event) continue;

      records.push({
        description: rejection.description,
        requires_review: rejection.requires_review,
        page_number: rejection.page_number,
        origin: rejection.origin,
        event,
      });
    }
  }

  return records;
}
