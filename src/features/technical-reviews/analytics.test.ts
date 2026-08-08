import { describe, expect, it } from "vitest";
import { aggregateRejections, type RejectionRecord } from "./analytics-core";

/**
 * La agregación alimenta los gráficos del Resumen y el Excel: si cuenta mal,
 * las decisiones operacionales se toman sobre números equivocados.
 */

function record(
  description: string,
  eventId: string,
  bus: { internal_number: string; ppu: string } = { internal_number: "1919", ppu: "SKPK19" },
): RejectionRecord {
  return {
    description,
    requires_review: true,
    page_number: 1,
    origin: "AUTOMATIC",
    event: {
      id: eventId,
      internal_number: bus.internal_number,
      ppu: bus.ppu,
      terminal_name: "Terminal Test",
      return_at: "2026-08-08T12:00:00Z",
      guide_number: "A123456",
    },
  };
}

describe("aggregateRejections", () => {
  it("con lista vacía, todo queda en cero sin dividir por cero", () => {
    const result = aggregateRejections([]);
    expect(result.eventCount).toBe(0);
    expect(result.reasonCount).toBe(0);
    expect(result.averagePerEvent).toBe(0);
    expect(result.byArea).toEqual({ MANTENCION: 0, LOGISTICA: 0 });
    expect(result.byReason).toEqual([]);
  });

  it("separa Mantención de Logística según la regla de negocio", () => {
    const result = aggregateRejections([
      record("No existe o vencida etiqueta extintor", "e1"),
      record("Ausencia franja reflectante color rojo", "e1"),
      record("inexistencia o ilegibilidad de placas patentes", "e1"),
      record("Falta de limpieza interior", "e1"),
      record("Neumatico corte compromete tela", "e1"),
      record("Sistema de frenos con eficacia baja", "e1"),
    ]);

    expect(result.byArea.LOGISTICA).toBe(4);
    expect(result.byArea.MANTENCION).toBe(2);
  });

  it("agrupa el mismo motivo aunque varíe el OCR entre certificados", () => {
    const result = aggregateRejections([
      record("Alineacion Luces bajas foco derecho (pendiente)", "e1"),
      record("Alineación luces bajas foco derecho", "e2"),
    ]);

    expect(result.byReason).toHaveLength(1);
    expect(result.byReason[0].count).toBe(2);
    // La etiqueta visible no arrastra el sufijo del certificado
    expect(result.byReason[0].label).not.toContain("(pendiente)");
  });

  it("ordena motivos y componentes de mayor a menor", () => {
    const result = aggregateRejections([
      record("Supera niveles de ruido en posicion motor", "e1"),
      record("Supera niveles de ruido en posicion escape", "e1"),
      record("Neumatico con corte lateral", "e1"),
    ]);

    expect(result.byComponent[0].code).toBe("RUIDO");
    expect(result.byComponent[0].count).toBe(2);
  });

  it("cuenta revisiones y motivos por bus sin duplicar eventos", () => {
    const busA = { internal_number: "1919", ppu: "SKPK19" };
    const busB = { internal_number: "2020", ppu: "LXWP83" };

    const result = aggregateRejections([
      record("Neumatico con corte", "e1", busA),
      record("Freno desajustado", "e1", busA),
      record("Freno desajustado", "e2", busA),
      record("Extintor vencido", "e3", busB),
    ]);

    expect(result.eventCount).toBe(3);
    expect(result.reasonCount).toBe(4);
    expect(result.averagePerEvent).toBe(1.3);

    const busARow = result.byBus.find((bus) => bus.ppu === "SKPK19");
    expect(busARow?.events).toBe(2);
    expect(busARow?.reasons).toBe(3);
    // El bus con más motivos encabeza el ranking
    expect(result.byBus[0].ppu).toBe("SKPK19");
  });
});
