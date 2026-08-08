import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  classifyRejection,
  reasonKey,
  type RejectionArea,
} from "@/features/technical-reviews/rejection-classification";

/**
 * §17, §28 · Analítica de rechazos para el Resumen y los reportes.
 *
 * Toda consulta corre con el cliente de SESIÓN: RLS filtra por terminal antes
 * de agregar, así que ningún número puede incluir terminales ajenos.
 *
 * La agregación (`aggregateRejections`) es una función pura sobre las filas ya
 * clasificadas — la comparten el dashboard y la exportación a Excel, y se
 * prueba sin base de datos.
 */

export interface AnalyticsFilters {
  from: string | null;
  to: string | null;
  terminalId: string | null;
}

/** Un motivo de rechazo con el contexto de su revisión. */
export interface RejectionRecord {
  description: string;
  requires_review: boolean;
  page_number: number | null;
  origin: string;
  event: {
    id: string;
    internal_number: string;
    ppu: string;
    terminal_name: string;
    return_at: string | null;
    guide_number: string | null;
  };
}

export interface ReasonAggregate {
  label: string;
  count: number;
  component: string;
  area: RejectionArea;
}

export interface ComponentAggregate {
  code: string;
  label: string;
  area: RejectionArea;
  count: number;
}

export interface BusAggregate {
  internal_number: string;
  ppu: string;
  terminal_name: string;
  /** Revisiones rechazadas del bus en el período. */
  events: number;
  /** Motivos acumulados en esas revisiones. */
  reasons: number;
}

export interface RejectionAnalytics {
  /** Revisiones rechazadas consideradas. */
  eventCount: number;
  /** Motivos totales registrados en ellas. */
  reasonCount: number;
  /** Promedio de motivos por revisión rechazada (1 decimal). */
  averagePerEvent: number;
  byArea: Record<RejectionArea, number>;
  byReason: ReasonAggregate[];
  byComponent: ComponentAggregate[];
  byBus: BusAggregate[];
}

/** Agregación pura: clasifica y cuenta. Compartida por dashboard y Excel. */
export function aggregateRejections(records: RejectionRecord[]): RejectionAnalytics {
  const byArea: Record<RejectionArea, number> = { MANTENCION: 0, LOGISTICA: 0 };
  const reasons = new Map<string, ReasonAggregate>();
  const components = new Map<string, ComponentAggregate>();
  const buses = new Map<string, BusAggregate>();
  const eventIds = new Set<string>();
  const eventsPerBus = new Map<string, Set<string>>();

  for (const record of records) {
    const component = classifyRejection(record.description);
    byArea[component.area] += 1;
    eventIds.add(record.event.id);

    const key = reasonKey(record.description);
    const reason = reasons.get(key);
    if (reason) {
      reason.count += 1;
    } else {
      reasons.set(key, {
        // La etiqueta visible es el texto tal como se confirmó, sin el sufijo
        // «(pendiente)» que sólo describe el estado en ese certificado.
        label: record.description.replace(/\s*\(pendiente\)\s*$/i, "").trim(),
        count: 1,
        component: component.label,
        area: component.area,
      });
    }

    const componentEntry = components.get(component.code);
    if (componentEntry) {
      componentEntry.count += 1;
    } else {
      components.set(component.code, { ...component, count: 1 });
    }

    const busKey = record.event.ppu;
    const bus = buses.get(busKey);
    if (bus) {
      bus.reasons += 1;
    } else {
      buses.set(busKey, {
        internal_number: record.event.internal_number,
        ppu: record.event.ppu,
        terminal_name: record.event.terminal_name,
        events: 0,
        reasons: 1,
      });
    }

    const busEvents = eventsPerBus.get(busKey) ?? new Set<string>();
    busEvents.add(record.event.id);
    eventsPerBus.set(busKey, busEvents);
  }

  for (const [busKey, bus] of buses) {
    bus.events = eventsPerBus.get(busKey)?.size ?? 0;
  }

  const eventCount = eventIds.size;
  const reasonCount = records.length;

  return {
    eventCount,
    reasonCount,
    averagePerEvent: eventCount === 0 ? 0 : Math.round((reasonCount / eventCount) * 10) / 10,
    byArea,
    byReason: [...reasons.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"),
    ),
    byComponent: [...components.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"),
    ),
    byBus: [...buses.values()].sort(
      (a, b) => b.reasons - a.reasons || a.internal_number.localeCompare(b.internal_number, "es"),
    ),
  };
}

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
