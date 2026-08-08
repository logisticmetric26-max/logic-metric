import { describe, expect, it } from "vitest";
import { computeCheckDigit, formatRut, formatRutInput, isValidRut, normalizeRut } from "./rut";

/**
 * §7, §62 · RUT chileno.
 *
 * Esta lógica debe coincidir exactamente con `app.normalize_rut()` en
 * PostgreSQL: si divergen, un RUT aceptado por el formulario sería rechazado
 * por la base (o al revés). Los mismos casos se prueban en
 * `supabase/tests/01_rut_and_normalization.test.sql`.
 */
describe("normalizeRut", () => {
  it("acepta los tres formatos de entrada del requerimiento", () => {
    expect(normalizeRut("11.111.111-1")).toBe("11111111-1");
    expect(normalizeRut("11111111-1")).toBe("11111111-1");
    expect(normalizeRut("111111111")).toBe("11111111-1");
  });

  it("ignora espacios alrededor", () => {
    expect(normalizeRut("  11.111.111-1  ")).toBe("11111111-1");
  });

  it("normaliza el dígito verificador K a minúscula", () => {
    expect(normalizeRut("10.000.013-K")).toBe("10000013-k");
    expect(normalizeRut("10000013k")).toBe("10000013-k");
  });

  it("acepta dígito verificador 0", () => {
    expect(normalizeRut("10.000.004-0")).toBe("10000004-0");
  });

  it("acepta RUT de 7 dígitos", () => {
    expect(normalizeRut("5.126.663-3")).toBe("5126663-3");
  });

  it("rechaza un dígito verificador incorrecto", () => {
    expect(normalizeRut("11.111.111-2")).toBeNull();
    // 12345678 tiene dígito verificador 5, no 9
    expect(normalizeRut("12345678-9")).toBeNull();
  });

  it("rechaza entradas estructuralmente inválidas", () => {
    expect(normalizeRut("")).toBeNull();
    expect(normalizeRut("abc")).toBeNull();
    expect(normalizeRut("1234")).toBeNull();
    expect(normalizeRut("1234567890123")).toBeNull();
    expect(normalizeRut(null)).toBeNull();
    expect(normalizeRut(undefined)).toBeNull();
  });

  it("rechaza una K dentro del cuerpo, no en el dígito verificador", () => {
    expect(normalizeRut("1K111111-1")).toBeNull();
  });

  it("es idempotente sobre un RUT ya normalizado", () => {
    const normalized = normalizeRut("11.111.111-1")!;
    expect(normalizeRut(normalized)).toBe(normalized);
  });
});

describe("computeCheckDigit", () => {
  it("calcula el dígito verificador con módulo 11", () => {
    expect(computeCheckDigit("11111111")).toBe("1");
    expect(computeCheckDigit("5126663")).toBe("3");
    expect(computeCheckDigit("12345678")).toBe("5");
  });

  it("devuelve K cuando el resto es 10", () => {
    expect(computeCheckDigit("10000013")).toBe("K");
  });

  it("devuelve 0 cuando el resto es 11", () => {
    expect(computeCheckDigit("10000004")).toBe("0");
  });
});

describe("isValidRut", () => {
  it("distingue RUT válidos de inválidos", () => {
    expect(isValidRut("11.111.111-1")).toBe(true);
    expect(isValidRut("11.111.111-2")).toBe(false);
  });
});

describe("formatRut", () => {
  it("presenta el RUT agrupado y con K en mayúscula", () => {
    expect(formatRut("11111111-1")).toBe("11.111.111-1");
    expect(formatRut("10000013-k")).toBe("10.000.013-K");
    expect(formatRut("5126663-3")).toBe("5.126.663-3");
  });

  it("devuelve el valor original si no es un RUT válido", () => {
    expect(formatRut("no-es-rut")).toBe("no-es-rut");
    expect(formatRut(null)).toBe("");
  });
});

describe("formatRutInput", () => {
  it("agrupa progresivamente mientras se escribe", () => {
    expect(formatRutInput("1")).toBe("1");
    expect(formatRutInput("111")).toBe("11-1");
    expect(formatRutInput("111111111")).toBe("11.111.111-1");
  });

  it("descarta caracteres no admitidos", () => {
    expect(formatRutInput("11.111.111-1")).toBe("11.111.111-1");
    expect(formatRutInput("abc111111111xyz")).toBe("11.111.111-1");
  });

  it("no falla con una entrada vacía", () => {
    expect(formatRutInput("")).toBe("");
  });
});
