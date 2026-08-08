import { describe, expect, it } from "vitest";
import { parseRejections, toDetectedRejections } from "./rejection-parser";

/**
 * §25 · Extracción de motivos por reglas.
 *
 * Lo que más importa verificar no es cuánto encuentra, sino que NO INVENTE:
 * cada motivo debe salir literalmente del documento, las cabeceras del
 * formulario no pueden colarse como motivos, y un formato no reconocido debe
 * devolver vacío en lugar de basura.
 */

const page = (text: string, page_number = 1) => [{ page_number, text }];

describe("parseRejections · lista enumerada", () => {
  const informe = `
INFORME DE REVISION TECNICA
PPU: ABCD12
FECHA: 08-08-2026

MOTIVOS DE RECHAZO:
1. Luces delanteras con intensidad insuficiente
2. Desgaste irregular en neumatico delantero derecho
3. Fuga de aceite en sistema de direccion

FIRMA DEL INSPECTOR
Juan Perez
`;

  it("extrae cada motivo enumerado por separado", () => {
    const items = parseRejections(page(informe));
    expect(items).toHaveLength(3);
    expect(items[0].description).toBe("Luces delanteras con intensidad insuficiente");
    expect(items[2].description).toBe("Fuga de aceite en sistema de direccion");
  });

  it("conserva la línea original como evidencia", () => {
    const items = parseRejections(page(informe));
    expect(items[0].source_text).toContain("1. Luces delanteras");
  });

  it("no toma las cabeceras del formulario como motivos", () => {
    const descriptions = parseRejections(page(informe)).map((item) => item.description);
    expect(descriptions.join(" ")).not.toContain("ABCD12");
    expect(descriptions.join(" ")).not.toContain("08-08-2026");
  });

  it("se detiene en la firma y no arrastra el nombre del inspector", () => {
    const descriptions = parseRejections(page(informe)).map((item) => item.description);
    expect(descriptions.join(" ")).not.toContain("Juan Perez");
  });

  it("registra el número de página", () => {
    const items = parseRejections(page(informe, 3));
    expect(items.every((item) => item.page_number === 3)).toBe(true);
  });
});

describe("parseRejections · variantes de formato", () => {
  it("acepta viñetas y paréntesis", () => {
    const items = parseRejections(
      page(`DEFECTOS
- Parabrisas con trizadura en zona de barrido
b) Limpiaparabrisas no barre correctamente`),
    );
    expect(items).toHaveLength(2);
    expect(items[0].description).toBe("Parabrisas con trizadura en zona de barrido");
  });

  it("acepta códigos jerárquicos de defecto", () => {
    const items = parseRejections(
      page(`MOTIVOS DE RECHAZO
4.2.1 Sistema de frenos con eficacia bajo lo exigido`),
    );
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Sistema de frenos con eficacia bajo lo exigido");
  });

  it("une un motivo partido en varias líneas", () => {
    const items = parseRejections(
      page(`RECHAZO
1. Sistema de frenos con eficacia total
   por debajo del minimo exigido en la normativa`),
    );
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe(
      "Sistema de frenos con eficacia total por debajo del minimo exigido en la normativa",
    );
  });

  it("lee el motivo escrito en la misma línea del encabezado", () => {
    const items = parseRejections(page("MOTIVO DE RECHAZO: Neumaticos bajo la profundidad minima"));
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Neumaticos bajo la profundidad minima");
  });

  it("funciona sin tildes, como suele devolver el OCR", () => {
    const items = parseRejections(page(`OBSERVACIONES\n1. Direccion con holgura excesiva`));
    expect(items).toHaveLength(1);
  });

  it("recorre todas las páginas, no sólo la primera", () => {
    const items = parseRejections([
      { page_number: 1, text: "RECHAZO\n1. Luces defectuosas" },
      { page_number: 2, text: "DEFECTOS\n1. Frenos desajustados" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1].page_number).toBe(2);
  });
});

describe("parseRejections · prudencia", () => {
  it("devuelve vacío cuando no hay sección de rechazos", () => {
    expect(
      parseRejections(page("CERTIFICADO DE REVISION TECNICA\nVEHICULO APROBADO\nPPU: ABCD12")),
    ).toEqual([]);
  });

  it("no extrae enumeraciones fuera de la sección de rechazos", () => {
    const items = parseRejections(
      page(`DATOS DEL VEHICULO
1. Marca: Volvo
2. Modelo: B8R

MOTIVOS DE RECHAZO
1. Luces defectuosas`),
    );
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Luces defectuosas");
  });

  it("descarta ruido de OCR sin apenas letras", () => {
    const items = parseRejections(page("RECHAZO\n1. ||| ### 12 45 ///\n2. Frenos en mal estado"));
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Frenos en mal estado");
  });

  it("no falla con un documento vacío", () => {
    expect(parseRejections(page(""))).toEqual([]);
    expect(parseRejections([])).toEqual([]);
  });
});

describe("toDetectedRejections", () => {
  const items = parseRejections(page("RECHAZO\n1. Luces delanteras defectuosas"));

  it("marca SIEMPRE que requiere revisión manual", () => {
    const detected = toDetectedRejections(items, new Map());
    expect(detected[0].requires_review).toBe(true);
  });

  it("nunca declara confianza alta: es extracción por reglas", () => {
    const detected = toDetectedRejections(items, new Map());
    expect(detected[0].confidence).toBeLessThanOrEqual(0.5);
  });

  it("penaliza la confianza cuando el OCR leyó mal esa página", () => {
    const conBuenOcr = toDetectedRejections(items, new Map([[1, 1]]));
    const conMalOcr = toDetectedRejections(items, new Map([[1, 0.4]]));
    expect(conMalOcr[0].confidence!).toBeLessThan(conBuenOcr[0].confidence!);
  });

  it("conserva la evidencia textual de cada motivo", () => {
    const detected = toDetectedRejections(items, new Map());
    expect(detected[0].source_text).toContain("Luces delanteras defectuosas");
  });
});

/**
 * Formato B · certificado de revisión técnica chileno real.
 *
 * Este texto es la salida literal del OCR sobre un certificado escaneado de
 * planta (MIVAL): tabla Nombre/Medido/Norma/Resultado bajo OBSERVACIONES,
 * donde cada defecto es una línea que termina en «Rechazado» o «Pendiente».
 * Incluye los artefactos reales del escaneo: corchetes de celda, letras
 * fantasma pegadas («JAlineacion», «INo») y el sello RECHAZADO del timbre.
 */
const CERTIFICADO_REAL = `
CERTIFICADO DE REVISIÓN TÉCNICA N*A1306000000249446
PROPIETARIO SCANIA SUMINISTRADORA DE FLOTA UNO SPA... RUT 77149683-0
%[ L-—-—]- APROBADO | RECHAZADO EMISIÓN DE
REVISIÓN TÉCNICA VALIDA HASTA: RESULTADO: _ FIRMA ELECTRÓNICA AVANZADA
RECHAZADO 19/01/2026 14:05:35
ESTE CERTIFICADO CONTIENE OBSERVACIONES us 5
OBSERVACIONES:
-CERTIFICO QUE LOS DATOS DEL PRESENTE CERTIFICADO CORRESPONDEN AL ESTADO MECÁNICO DEL VEHÍCULO AL
EFECTUAR LA REVISIÓN
006 URBANO LICITADO
Begunda revisión por concepto de rechazos INSTRUMENTALES, debe cancelar: $ 0
[Su vehículo debe ser aprobado hasta el 03/02/2026 (15 dias comidos), para no cancelar el valor total de una nueva revisión.
Nombre Medido Norma Resultado
inexistencia o ilegibilidad de una o ambas placas patentes Rechazado
Carroc. Trizado, quebrado soporte bisagra de puerta y cubre motor Rechazado
La PPU grabada en vidrios ylo espejos que por reglamento son exigibles, NO es legi Rechazado
Func. defect. interrupt. y/o no enciende luces altas, bajas, frenos, neblineros o Rechazado
Neumatico corte compromete tela protuberancia o deforme el lateral Rechazado
[Alineacion Luces bajas foco derecho Pendiente
[Alineacion Luces bajas foco izquierdo Pendiente
[Alineacion neblinero derecho Pendiente
JAlineacion neblinero izquierdo Pendiente
JAlineacion Luces altas foco derecho Pendiente
[Alineacion Luces altas foco izquierdo Pendiente
Liviano o mediano o pesado, opacidad sobre la norma Pendiente
No se obtienen dos medidas consecutivas con dispersión menor o igual a 0.5 1/m Pendiente
Liviano o mediano o pesado, opacidad en carga sobre la norma Pendiente
[Supera los niveles de ruido en posicion escape Pendiente
[Supera los niveles de ruido en posicion motor Pendiente
Supera los niveles de ruido en posicion interior Pendiente
[Ausencia franja reflectante color rojo parte posterior del vehiculo Rechazado
INo existe o vencida etiqueta extintor fecha control o serv. Tecnico Rechazado
Inexistencia tubo escape, Presencia de roturas o fitraciones sist. escape de los Rechazado
Inexistencia tubo escape, Presencia de roturas o filtraciones sistema escape de lo Rechazado
[Salida del tubo de escape no cumple con norma Rechazado
COPIA CLIENTE
1 Scanned with |
| (SCamscanner
`;

describe("parseRejections · certificado de planta real (tabla de resultados)", () => {
  const items = parseRejections(page(CERTIFICADO_REAL));
  const descriptions = items.map((item) => item.description);

  it("detecta todas las filas de la tabla de observaciones", () => {
    // 10 rechazados + 12 pendientes del certificado real
    expect(items).toHaveLength(22);
  });

  it("extrae los defectos rechazados con su texto literal", () => {
    expect(descriptions).toContain(
      "inexistencia o ilegibilidad de una o ambas placas patentes",
    );
    expect(descriptions).toContain(
      "Neumatico corte compromete tela protuberancia o deforme el lateral",
    );
    expect(descriptions).toContain("Salida del tubo de escape no cumple con norma");
  });

  it("distingue las mediciones pendientes marcándolas con su resultado", () => {
    expect(descriptions).toContain("Alineacion Luces bajas foco derecho (pendiente)");
    expect(descriptions.filter((d) => d.endsWith("(pendiente)"))).toHaveLength(12);
  });

  it("limpia los artefactos del escáner sin tocar la evidencia", () => {
    // «[Ausencia…» y «INo existe…» del OCR quedan limpios en la descripción…
    expect(descriptions).toContain(
      "Ausencia franja reflectante color rojo parte posterior del vehiculo",
    );
    expect(descriptions).toContain(
      "No existe o vencida etiqueta extintor fecha control o serv. Tecnico",
    );
    // …pero la línea original se conserva íntegra como evidencia
    const ausencia = items.find((item) => item.description.startsWith("Ausencia franja"));
    expect(ausencia?.source_text).toContain("[Ausencia franja");
  });

  it("no confunde el sello RECHAZADO ni las cabeceras con motivos", () => {
    const all = descriptions.join(" · ");
    expect(all).not.toContain("19/01/2026");
    expect(all).not.toContain("Nombre Medido");
    expect(all).not.toContain("APROBADO | RECHAZADO");
  });

  it("excluye el texto legal y administrativo del certificado", () => {
    const all = descriptions.join(" · ");
    expect(all).not.toContain("CERTIFICO QUE");
    expect(all).not.toContain("debe cancelar");
    expect(all).not.toContain("COPIA CLIENTE");
    expect(all).not.toContain("Camscanner");
  });

  it("registra dos filas casi idénticas como motivos distintos", () => {
    // El certificado real trae dos filas de tubo de escape truncadas distinto
    expect(descriptions.filter((d) => d.startsWith("Inexistencia tubo escape"))).toHaveLength(2);
  });

  it("detecta la tabla aunque el encabezado OBSERVACIONES venga ilegible", () => {
    const sinEncabezado = CERTIFICADO_REAL.replace("OBSERVACIONES:", "0B$3RVAC10N3S");
    const fallback = parseRejections(page(sinEncabezado));
    expect(fallback.length).toBe(22);
  });
});
