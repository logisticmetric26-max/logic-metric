import { describe, expect, it } from "vitest";
import {
  aggregateExpirations,
  aggregateHistory,
  aggregateNotSent,
  aggregateOpenReviews,
  notSentReasonKey,
  type ClosedEventRecord,
  type ExpirationRecord,
  type NotSentRecord,
  type OpenReviewRecord,
} from "@/features/technical-reviews/subsection-analytics";

/** Ahora fijo: los tramos de antigüedad se miden contra un instante conocido. */
const NOW = new Date("2026-08-08T15:00:00Z");

function open(partial: Partial<OpenReviewRecord> & { departure_at: string }): OpenReviewRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    internal_number: partial.internal_number ?? "100",
    ppu: partial.ppu ?? "AABB11",
    terminal_name: partial.terminal_name ?? "Terminal Norte",
    departure_at: partial.departure_at,
  };
}

describe("aggregateOpenReviews", () => {
  it("reparte los buses por tiempo fuera de planta", () => {
    const result = aggregateOpenReviews(
      [
        open({ departure_at: "2026-08-08T09:00:00Z" }), // hoy
        open({ departure_at: "2026-08-07T09:00:00Z" }), // 1 día
        open({ departure_at: "2026-08-06T09:00:00Z" }), // 2 días
        open({ departure_at: "2026-08-03T09:00:00Z" }), // 5 días
        open({ departure_at: "2026-07-20T09:00:00Z" }), // 19 días
      ],
      NOW,
    );

    expect(result.total).toBe(5);
    expect(result.buckets.map((bucket) => bucket.count)).toEqual([1, 2, 1, 1]);
  });

  it("encabeza la lista con el que lleva más tiempo fuera", () => {
    const result = aggregateOpenReviews(
      [
        open({ internal_number: "200", departure_at: "2026-08-08T09:00:00Z" }),
        open({ internal_number: "300", ppu: "CCDD22", departure_at: "2026-07-20T09:00:00Z" }),
      ],
      NOW,
    );

    expect(result.longest[0].internal_number).toBe("300");
    expect(result.longest[0].days).toBe(19);
  });

  it("sin buses en planta no inventa tramos", () => {
    const result = aggregateOpenReviews([], NOW);

    expect(result.total).toBe(0);
    expect(result.longest).toEqual([]);
    expect(result.buckets.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe("notSentReasonKey", () => {
  it("agrupa el mismo motivo escrito de formas distintas", () => {
    const variants = ["Sin chofer", "SIN CHOFER", "sin  chofer.", " Sin Chófer "];
    const keys = new Set(variants.map(notSentReasonKey));

    expect(keys.size).toBe(1);
  });

  it("no mezcla motivos distintos", () => {
    expect(notSentReasonKey("Sin chofer")).not.toBe(notSentReasonKey("En mantención"));
  });
});

describe("aggregateNotSent", () => {
  const records: NotSentRecord[] = [
    { reason: "Sin chofer", event_date: "2026-08-01", internal_number: "100", ppu: "AABB11" },
    { reason: "SIN CHOFER.", event_date: "2026-08-02", internal_number: "101", ppu: "CCDD22" },
    { reason: "En mantención", event_date: "2026-08-03", internal_number: "100", ppu: "AABB11" },
  ];

  it("agrupa motivos equivalentes y ordena por frecuencia", () => {
    const result = aggregateNotSent(records);

    expect(result.total).toBe(3);
    expect(result.byReason[0].count).toBe(2);
    // La etiqueta visible conserva el texto tal como se escribió la primera vez
    expect(result.byReason[0].label).toBe("Sin chofer");
    expect(result.byReason).toHaveLength(2);
  });

  it("cuenta los no envíos por bus", () => {
    const result = aggregateNotSent(records);

    expect(result.byBus[0]).toMatchObject({ internal_number: "100", count: 2 });
  });
});

describe("aggregateExpirations", () => {
  const records: ExpirationRecord[] = [
    {
      internal_number: "100",
      ppu: "AABB11",
      terminal_name: "Norte",
      expiration_status: "VALID",
      expiration_date: "2027-01-01",
      days_to_expiration: 146,
    },
    {
      internal_number: "101",
      ppu: "CCDD22",
      terminal_name: "Norte",
      expiration_status: "EXPIRING_SOON",
      expiration_date: "2026-08-20",
      days_to_expiration: 12,
    },
    {
      internal_number: "102",
      ppu: "EEFF33",
      terminal_name: "Norte",
      expiration_status: "EXPIRED",
      expiration_date: "2026-07-01",
      days_to_expiration: -38,
    },
    {
      internal_number: "103",
      ppu: "GGHH44",
      terminal_name: "Norte",
      expiration_status: "NO_RECORD",
      expiration_date: null,
      days_to_expiration: null,
    },
  ];

  it("cuenta los cuatro estados en orden fijo", () => {
    const result = aggregateExpirations(records);

    expect(result.total).toBe(4);
    expect(result.byStatus.map((status) => status.key)).toEqual([
      "VALID",
      "EXPIRING_SOON",
      "EXPIRED",
      "NO_RECORD",
    ]);
    expect(result.byStatus.every((status) => status.count === 1)).toBe(true);
  });

  it("prioriza vencidos, luego por vencer y deja fuera los vigentes", () => {
    const result = aggregateExpirations(records);

    expect(result.attention.map((bus) => bus.expiration_status)).toEqual([
      "EXPIRED",
      "EXPIRING_SOON",
      "NO_RECORD",
    ]);
  });
});

describe("aggregateHistory", () => {
  const records: ClosedEventRecord[] = [
    { return_at: "2026-06-10T14:00:00Z", result: "APPROVED" },
    { return_at: "2026-07-05T14:00:00Z", result: "APPROVED" },
    { return_at: "2026-07-20T14:00:00Z", result: "REJECTED" },
    { return_at: "2026-08-01T14:00:00Z", result: "REJECTED" },
  ];

  it("agrupa por mes y ordena cronológicamente", () => {
    const result = aggregateHistory(records);

    expect(result.months.map((month) => month.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(result.months[1]).toMatchObject({ approved: 1, rejected: 1 });
  });

  it("calcula el total y el porcentaje de rechazo", () => {
    const result = aggregateHistory(records);

    expect(result.approved).toBe(2);
    expect(result.rejected).toBe(2);
    expect(result.rejectionRate).toBe(50);
  });

  it("usa la zona operacional para decidir el mes", () => {
    // 1 de septiembre 02:00 UTC = 31 de agosto 22:00 en Chile
    const result = aggregateHistory([{ return_at: "2026-09-01T02:00:00Z", result: "APPROVED" }]);

    expect(result.months[0].month).toBe("2026-08");
  });

  it("descarta registros sin fecha o sin resultado en lugar de contarlos mal", () => {
    const result = aggregateHistory([
      { return_at: null, result: "APPROVED" },
      { return_at: "2026-08-01T14:00:00Z", result: null },
    ]);

    expect(result.months).toEqual([]);
    expect(result.rejectionRate).toBeNull();
  });

  it("conserva sólo los meses más recientes solicitados", () => {
    const many: ClosedEventRecord[] = Array.from({ length: 10 }, (_, index) => ({
      return_at: `2026-${String(index + 1).padStart(2, "0")}-15T14:00:00Z`,
      result: "APPROVED" as const,
    }));

    const result = aggregateHistory(many, { maxMonths: 4 });

    expect(result.months).toHaveLength(4);
    expect(result.months.at(-1)?.month).toBe("2026-10");
  });
});
