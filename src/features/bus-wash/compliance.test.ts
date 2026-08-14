import { describe, expect, it } from "vitest";
import { computeCompliance, totalCompliance, type WashRow } from "@/features/bus-wash/compliance";

function bus(partial: Partial<WashRow> = {}): WashRow {
  return {
    terminal_id: "t1",
    terminal_name: "Terminal Norte",
    bm_completed: false,
    body_wash_completed: false,
    in_repair: false,
    no_wash: false,
    ...partial,
  };
}

describe("computeCompliance", () => {
  it("calcula el porcentaje sobre los buses exigibles", () => {
    const [terminal] = computeCompliance([
      bus({ bm_completed: true, body_wash_completed: true }),
      bus({ bm_completed: true }),
      bus(),
      bus(),
    ]);

    expect(terminal.bm).toMatchObject({ done: 2, expected: 4, percent: 50 });
    expect(terminal.bodyWash).toMatchObject({ done: 1, expected: 4, percent: 25 });
  });

  it("saca de la cuenta a los buses en reparación", () => {
    // Dos de tres exigibles cumplen: 100 %, no 66 %. El bus del taller no
    // estaba disponible y no puede contar como incumplimiento.
    const [terminal] = computeCompliance([
      bus({ bm_completed: true }),
      bus({ bm_completed: true }),
      bus({ in_repair: true }),
    ]);

    expect(terminal.inRepair).toBe(1);
    expect(terminal.bm).toMatchObject({ done: 2, expected: 2, percent: 100 });
  });

  it("saca a los «no se lava» pero los deja visibles aparte", () => {
    const [terminal] = computeCompliance([bus({ bm_completed: true }), bus({ no_wash: true })]);

    expect(terminal.noWash).toBe(1);
    expect(terminal.bm.expected).toBe(1);
    expect(terminal.fleet).toBe(2);
  });

  it("la reparación manda sobre «no se lava»", () => {
    const [terminal] = computeCompliance([bus({ in_repair: true, no_wash: true })]);

    expect(terminal.inRepair).toBe(1);
    expect(terminal.noWash).toBe(0);
  });

  it("mide B&M y carrocería por separado, como en un día de lluvia", () => {
    const [terminal] = computeCompliance(
      [bus({ bm_completed: true }), bus({ bm_completed: true })],
      { rainReasons: new Map([["t1", "Lluvia toda la jornada"]]) },
    );

    expect(terminal.bm.percent).toBe(100);
    expect(terminal.bodyWash.percent).toBe(0);
    expect(terminal.rainReason).toBe("Lluvia toda la jornada");
  });

  it("compara contra la meta configurada", () => {
    const filas = [bus({ bm_completed: true }), bus({ bm_completed: true }), bus()];

    expect(computeCompliance(filas, { targetPercent: 90 })[0].bm.meetsTarget).toBe(false);
    expect(computeCompliance(filas, { targetPercent: 60 })[0].bm.meetsTarget).toBe(true);
  });

  it("sin buses exigibles no inventa un 100 %", () => {
    const [terminal] = computeCompliance([bus({ in_repair: true })]);

    expect(terminal.bm.percent).toBeNull();
    expect(terminal.bm.meetsTarget).toBeNull();
  });

  it("separa por terminal y ordena por nombre", () => {
    const terminales = computeCompliance([
      bus({ terminal_id: "t2", terminal_name: "Terminal Sur", bm_completed: true }),
      bus({ terminal_id: "t1", terminal_name: "Terminal Norte" }),
    ]);

    expect(terminales.map((t) => t.terminal_name)).toEqual(["Terminal Norte", "Terminal Sur"]);
  });
});

describe("totalCompliance", () => {
  it("consolida sumando cumplidos y exigibles, no promediando porcentajes", () => {
    // Un terminal de 1 bus al 100 % y otro de 99 al 0 % no son «50 %»
    const terminales = computeCompliance([
      bus({ terminal_id: "t1", terminal_name: "A", bm_completed: true }),
      ...Array.from({ length: 99 }, () => bus({ terminal_id: "t2", terminal_name: "B" })),
    ]);

    expect(totalCompliance(terminales).bm).toMatchObject({ done: 1, expected: 100, percent: 1 });
  });
});
