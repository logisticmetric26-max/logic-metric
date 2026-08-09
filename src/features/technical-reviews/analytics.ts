import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AnalyticsFilters, RejectionRecord } from "./analytics-core";
import type {
  ClosedEventRecord,
  ExpirationRecord,
  ExpirationStatus,
  NotSentRecord,
  OpenReviewRecord,
} from "./subsection-analytics";

export * from "./analytics-core";
export * from "./subsection-analytics";

/**
 * Techo defensivo común a todas las consultas del tablero.
 *
 * Sin él, un terminal con años de historia traería decenas de miles de filas
 * para calcular unos pocos totales. Con período filtrado nunca se alcanza.
 */
const MAX_ROWS = 2000;

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
    .limit(MAX_ROWS);

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

/**
 * §20 · Buses actualmente en planta.
 *
 * Mismo filtro que el listado «En revisión»: el tablero y la tabla no pueden
 * contar cosas distintas.
 */
export async function fetchOpenReviews(
  supabase: SupabaseClient<Database>,
  filters: AnalyticsFilters,
): Promise<OpenReviewRecord[]> {
  let query = supabase
    .from("technical_review_events_view")
    .select("id, internal_number, ppu, terminal_name, departure_at")
    .eq("status", "OPEN")
    .order("departure_at", { ascending: true })
    .limit(MAX_ROWS);

  if (filters.from) query = query.gte("departure_at", `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte("departure_at", `${filters.to}T23:59:59`);
  if (filters.terminalId) query = query.eq("terminal_id", filters.terminalId);

  const { data, error } = await query;
  if (error) throw error;

  // `departure_at` es obligatorio en la tabla; el tipo lo da como anulable.
  return (data ?? []).filter(
    (row): row is OpenReviewRecord => typeof row.departure_at === "string",
  );
}

/** §35 · Registros de buses que no salieron a planta en el período. */
export async function fetchNotSent(
  supabase: SupabaseClient<Database>,
  filters: AnalyticsFilters,
): Promise<NotSentRecord[]> {
  let query = supabase
    .from("technical_review_not_sent_view")
    .select("reason, event_date, internal_number, ppu")
    .order("event_date", { ascending: false })
    .limit(MAX_ROWS);

  if (filters.from) query = query.gte("event_date", filters.from);
  if (filters.to) query = query.lte("event_date", filters.to);
  if (filters.terminalId) query = query.eq("terminal_id", filters.terminalId);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

/**
 * §39 · Estado de vencimiento de la flota activa.
 *
 * No admite período: es la foto de HOY. Filtrarlo por fechas daría un número
 * que parece un vencimiento y no lo es.
 *
 * `fleet_expiration_status` expone el terminal por id; el nombre se resuelve
 * con los terminales que el usuario ya tiene autorizados, sin otra consulta.
 */
export async function fetchExpirations(
  supabase: SupabaseClient<Database>,
  filters: Pick<AnalyticsFilters, "terminalId">,
  terminalNames: Map<string, string>,
): Promise<ExpirationRecord[]> {
  let query = supabase
    .from("fleet_expiration_status")
    .select("internal_number, ppu, terminal_id, expiration_status, expiration_date, days_to_expiration")
    .eq("active", true)
    .limit(MAX_ROWS);

  if (filters.terminalId) query = query.eq("terminal_id", filters.terminalId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    internal_number: row.internal_number ?? "",
    ppu: row.ppu ?? "",
    terminal_name: (row.terminal_id && terminalNames.get(row.terminal_id)) || "—",
    expiration_status: (row.expiration_status ?? "NO_RECORD") as ExpirationStatus,
    expiration_date: row.expiration_date,
    days_to_expiration: row.days_to_expiration,
  }));
}

/** §21 · Revisiones cerradas del período, para la serie mensual del historial. */
export async function fetchClosedEvents(
  supabase: SupabaseClient<Database>,
  filters: AnalyticsFilters,
): Promise<ClosedEventRecord[]> {
  let query = supabase
    .from("technical_review_events_view")
    .select("return_at, result")
    .eq("status", "CLOSED")
    .order("return_at", { ascending: false })
    .limit(MAX_ROWS);

  if (filters.from) query = query.gte("return_at", `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte("return_at", `${filters.to}T23:59:59`);
  if (filters.terminalId) query = query.eq("terminal_id", filters.terminalId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ClosedEventRecord[];
}
