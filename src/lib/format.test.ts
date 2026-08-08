import { describe, expect, it } from "vitest";
import { formatDateOnly, formatDateTime, formatElapsed, formatFileSize } from "./format";

/**
 * §73 · Fechas y horas.
 *
 * Los timestamps se guardan en UTC y se muestran en la zona operacional. El
 * caso importante es el de las columnas DATE: interpretarlas como UTC mostraría
 * el día anterior en Chile.
 */
describe("formatDateOnly", () => {
  it("presenta una fecha yyyy-MM-dd en formato local sin desplazarla", () => {
    expect(formatDateOnly("2026-08-08")).toBe("08-08-2026");
    // Enero 1 es el caso donde un desfase de zona saltaría al año anterior
    expect(formatDateOnly("2026-01-01")).toBe("01-01-2026");
  });

  it("muestra un guion cuando no hay fecha", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly(undefined)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("convierte un timestamp UTC a la zona operacional de Chile", () => {
    // 12:00 UTC es la mañana en Chile, nunca el día siguiente
    const formatted = formatDateTime("2026-08-08T12:00:00Z");
    expect(formatted.startsWith("08-08-2026")).toBe(true);
  });

  it("respeta una zona horaria explícita", () => {
    expect(formatDateTime("2026-08-08T12:00:00Z", "UTC")).toBe("08-08-2026 12:00");
  });

  it("muestra un guion cuando no hay valor", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});

describe("formatElapsed", () => {
  const departure = new Date("2026-08-08T08:00:00Z");

  it("expresa minutos dentro de la primera hora", () => {
    expect(formatElapsed(departure, new Date("2026-08-08T08:45:00Z"))).toBe("45m");
  });

  it("expresa horas y minutos dentro del primer día", () => {
    expect(formatElapsed(departure, new Date("2026-08-08T11:30:00Z"))).toBe("3h 30m");
  });

  it("expresa días y horas a partir de las 24 horas", () => {
    expect(formatElapsed(departure, new Date("2026-08-10T14:00:00Z"))).toBe("2d 6h");
  });

  it("no devuelve valores negativos si el reloj se adelanta", () => {
    expect(formatElapsed(departure, new Date("2026-08-08T07:00:00Z"))).toBe("0m");
  });

  it("acepta el timestamp como cadena ISO", () => {
    expect(formatElapsed("2026-08-08T08:00:00Z", new Date("2026-08-08T09:00:00Z"))).toBe("1h 0m");
  });
});

describe("formatFileSize", () => {
  it("presenta el tamaño en la unidad adecuada", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_468_006)).toBe("1,4 MB");
  });
});
