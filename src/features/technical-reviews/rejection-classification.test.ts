import { describe, expect, it } from "vitest";
import { classifyRejection, reasonKey } from "./rejection-classification";

/**
 * La regla de negocio es del usuario: LOGÍSTICA = extintor, norma gráfica,
 * placa patente y limpieza; TODO lo demás es MANTENCIÓN. Estas pruebas fijan
 * esa regla contra los motivos reales de los dos certificados procesados.
 */

describe("classifyRejection · área LOGÍSTICA", () => {
  const casos: [string, string][] = [
    ["No existe o vencida etiqueta extintor fecha control o serv. Tecnico", "EXTINTOR"],
    ["inexistencia o ilegibilidad de una o ambas placas patentes", "PLACA_PATENTE"],
    ["No aparece o es ilegible numero placa patente", "PLACA_PATENTE"],
    // La PPU manda sobre «vidrios»: es un tema de identificación, no de cristales
    ["La PPU grabada en vidrios y/o espejos que por reglamento son exigibles, NO es legi", "PLACA_PATENTE"],
    ["Ausencia franja reflectante color rojo parte posterior del vehiculo", "NORMA_GRAFICA"],
    ["Falta de limpieza en interior del vehiculo", "LIMPIEZA"],
  ];

  for (const [texto, componente] of casos) {
    it(`«${texto.slice(0, 48)}…» → ${componente} / LOGÍSTICA`, () => {
      const result = classifyRejection(texto);
      expect(result.code).toBe(componente);
      expect(result.area).toBe("LOGISTICA");
    });
  }
});

describe("classifyRejection · área MANTENCIÓN", () => {
  const casos: [string, string][] = [
    // Certificado real 1
    ["Carroc. Trizado, quebrado soporte bisagra de puerta y cubre motor", "CARROCERIA"],
    ["Func. defect. interrupt. y/o no enciende luces altas, bajas, frenos, neblineros o", "LUCES"],
    ["Neumatico corte compromete tela protuberancia o deforme el lateral", "NEUMATICOS"],
    ["Alineacion Luces bajas foco derecho (pendiente)", "LUCES"],
    ["Liviano o mediano o pesado, opacidad sobre la norma (pendiente)", "EMISIONES"],
    // «ruido en posicion escape» es una medición de ruido, no el tubo
    ["Supera los niveles de ruido en posicion escape (pendiente)", "RUIDO"],
    ["Inexistencia tubo escape, Presencia de roturas o fitraciones sist. escape de los", "ESCAPE"],
    ["Salida del tubo de escape no cumple con norma", "ESCAPE"],
    // Certificado real 2 · con los artefactos de OCR tal como se guardaron
    ["No aparece 0 es ilegible numero de chasis o VIN", "CHASIS"],
    ["Carros. Trizado, quebrado soporte bisagra de puerta y cubre motor", "CARROCERIA"],
    ["Puerta de servicio mal estado de gomas de ajuste (Loc. Colec.)", "CARROCERIA"],
    [". INo existencia de alguna lente o mica", "LUCES"],
    ["S INo existe, mal estado, no funciona, color no corresponde de luces indican alto anc", "LUCES"],
    ["Mal estado de luces en acceso de pisaderas", "LUCES"],
    ["No se obtienen dos medidas conseculivas con dispersión menor o igual a 0.5 1/m (pendiente)", "EMISIONES"],
    // Otros dominios
    ["Sistema de frenos con eficacia bajo lo exigido", "FRENOS"],
    ["Direccion con holgura excesiva", "DIRECCION"],
    ["Cinturon de seguridad del conductor deteriorado", "CINTURONES"],
  ];

  for (const [texto, componente] of casos) {
    it(`«${texto.slice(0, 48)}…» → ${componente} / MANTENCIÓN`, () => {
      const result = classifyRejection(texto);
      expect(result.code).toBe(componente);
      expect(result.area).toBe("MANTENCION");
    });
  }

  it("lo no reconocido cae en Otros / MANTENCIÓN, nunca se descarta", () => {
    const result = classifyRejection("Hallazgo sin palabras conocidas xyz");
    expect(result.code).toBe("OTROS");
    expect(result.area).toBe("MANTENCION");
  });
});

describe("reasonKey · agrupación de motivos", () => {
  it("el mismo defecto con y sin «(pendiente)» cuenta como uno", () => {
    expect(reasonKey("Alineacion Luces bajas foco derecho (pendiente)")).toBe(
      reasonKey("Alineacion Luces bajas foco derecho"),
    );
  });

  it("ignora tildes, mayúsculas y signos sueltos del OCR", () => {
    expect(reasonKey(". INo existencia de alguna lente o mica")).toBe(
      reasonKey("INo existencia de alguna lente o mica"),
    );
    expect(reasonKey("Alineación LUCES bajas")).toBe(reasonKey("alineacion luces bajas"));
  });

  it("defectos distintos no colapsan entre sí", () => {
    expect(reasonKey("Alineacion Luces bajas foco derecho")).not.toBe(
      reasonKey("Alineacion Luces bajas foco izquierdo"),
    );
  });
});
