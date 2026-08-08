import {
  classifyRejection,
  reasonKey,
  type RejectionArea,
} from "@/features/technical-reviews/rejection-classification";

/**
 * §17, §28 · Agregación de rechazos (parte PURA de la analítica).
 *
 * Sin `server-only` ni Supabase: la comparten el dashboard, la exportación a
 * Excel y los tests. La obtención de datos vive en `analytics.ts`.
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
