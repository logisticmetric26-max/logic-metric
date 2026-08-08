import { describe, expect, it } from "vitest";
import {
  dateSchema,
  guideNumberSchema,
  internalNumberSchema,
  optionalText,
  ppuSchema,
  requiredText,
  workOrderSchema,
} from "./common";

/**
 * §62 · Validaciones compartidas.
 *
 * Deben coincidir con las restricciones CHECK y los triggers de normalización
 * de PostgreSQL: lo que aquí se acepta debe ser aceptable en la base.
 */
describe("ppuSchema", () => {
  it("normaliza a mayúsculas y elimina separadores", () => {
    expect(ppuSchema.parse("ab cd-12")).toBe("ABCD12");
    expect(ppuSchema.parse("  abcd12  ")).toBe("ABCD12");
  });

  it("rechaza una PPU vacía", () => {
    expect(ppuSchema.safeParse("").success).toBe(false);
    expect(ppuSchema.safeParse("   ").success).toBe(false);
  });

  it("rechaza longitudes fuera del rango admitido", () => {
    expect(ppuSchema.safeParse("AB1").success).toBe(false);
    expect(ppuSchema.safeParse("ABCDEFGHIJK").success).toBe(false);
  });

  it("dos escrituras del mismo bus producen la misma PPU", () => {
    expect(ppuSchema.parse("ABCD12")).toBe(ppuSchema.parse("ab-cd.12"));
  });
});

describe("internalNumberSchema", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(internalNumberSchema.parse("  bus-01 ")).toBe("BUS-01");
    expect(internalNumberSchema.parse("bus   01")).toBe("BUS 01");
  });

  it("rechaza un número interno vacío", () => {
    expect(internalNumberSchema.safeParse("   ").success).toBe(false);
  });

  it("rechaza caracteres no admitidos", () => {
    expect(internalNumberSchema.safeParse("bus/01").success).toBe(false);
  });
});

describe("guideNumberSchema", () => {
  it("normaliza el número de guía", () => {
    expect(guideNumberSchema.parse("  guia 123 ")).toBe("GUIA 123");
  });

  it("rechaza una guía vacía", () => {
    expect(guideNumberSchema.safeParse("   ").success).toBe(false);
  });
});

describe("workOrderSchema", () => {
  it("es opcional: una OT vacía se guarda como NULL", () => {
    expect(workOrderSchema.parse("")).toBeNull();
    expect(workOrderSchema.parse("   ")).toBeNull();
  });

  it("normaliza la OT cuando se informa", () => {
    expect(workOrderSchema.parse("ot-4521")).toBe("OT-4521");
    expect(workOrderSchema.parse(" ot 4521 ")).toBe("OT 4521");
  });

  it("rechaza caracteres no admitidos", () => {
    expect(workOrderSchema.safeParse("OT#4521").success).toBe(false);
  });
});

describe("dateSchema", () => {
  it("acepta el formato de un input de tipo date", () => {
    expect(dateSchema.parse("2026-08-08")).toBe("2026-08-08");
  });

  it("rechaza formatos y fechas inválidas", () => {
    expect(dateSchema.safeParse("08-08-2026").success).toBe(false);
    expect(dateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(dateSchema.safeParse("").success).toBe(false);
  });
});

describe("requiredText / optionalText", () => {
  it("requiredText exige contenido y colapsa espacios", () => {
    const schema = requiredText("el motivo", 100);
    expect(schema.parse("  motivo   con  espacios ")).toBe("motivo con espacios");
    expect(schema.safeParse("   ").success).toBe(false);
  });

  it("requiredText respeta el largo máximo", () => {
    const schema = requiredText("el motivo", 5);
    expect(schema.safeParse("123456").success).toBe(false);
  });

  it("optionalText convierte el vacío en NULL", () => {
    const schema = optionalText(100);
    expect(schema.parse("")).toBeNull();
    expect(schema.parse("  ")).toBeNull();
    expect(schema.parse(" un texto ")).toBe("un texto");
  });
});
