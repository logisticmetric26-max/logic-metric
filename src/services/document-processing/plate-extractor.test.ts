import { describe, expect, it } from "vitest";
import {
  canonicalPlate,
  checkDocumentPlate,
  containsExpectedPlate,
  findPlateCandidates,
  normalizePlate,
} from "./plate-extractor";

/**
 * §62 · Verificación de que el documento corresponde al bus.
 *
 * Lo crítico aquí no es detectar todas las patentes, sino el equilibrio entre
 * los dos errores posibles: no avisar de un documento equivocado (peligroso) y
 * avisar cuando el documento sí es correcto (un aviso que se ignora deja de
 * servir). Estas pruebas fijan ese equilibrio.
 */

describe("normalizePlate / canonicalPlate", () => {
  it("normaliza separadores y minúsculas", () => {
    expect(normalizePlate("lxwp-83")).toBe("LXWP83");
    expect(normalizePlate(" LX WP 83 ")).toBe("LXWP83");
  });

  it("iguala los caracteres que el OCR confunde", () => {
    // O/0, I/1, S/5, B/8 leídos al revés no deben romper la comparación
    expect(canonicalPlate("BBBB11")).toBe(canonicalPlate("8888II"));
    expect(canonicalPlate("SOTG25")).toBe(canonicalPlate("50T625"));
  });
});

describe("findPlateCandidates", () => {
  it("reconoce el formato moderno de 4 letras y 2 dígitos", () => {
    expect(findPlateCandidates("PLACA PATENTE LXWP83")).toContain("LXWP83");
  });

  it("reconoce los formatos antiguos", () => {
    expect(findPlateCandidates("patente AB1234")).toContain("AB1234");
    expect(findPlateCandidates("patente ABC123")).toContain("ABC123");
  });

  it("no confunde palabras del formulario con patentes", () => {
    const found = findPlateCandidates("NORMA EMISION EURO VI · BUS CLASE B2 · COPIA CLIENTE");
    expect(found).not.toContain("EURO");
    expect(found).not.toContain("CLASE");
    expect(found).not.toContain("COPIA");
  });

  it("ignora números largos como el folio o el RUT", () => {
    const found = findPlateCandidates("N*A1306000000249446 RUT 77149683-0 FONO 226036868");
    expect(found).toEqual([]);
  });

  it("no repite la misma patente", () => {
    expect(findPlateCandidates("LXWP83 ... LXWP83 ... lxwp83")).toEqual(["LXWP83"]);
  });
});

describe("checkDocumentPlate", () => {
  it("MATCH cuando la PPU del bus aparece en el documento", () => {
    const check = checkDocumentPlate("PLACA PATENTE LXWP83 ... RECHAZADO", "informe.pdf", "LXWP83");
    expect(check.verdict).toBe("MATCH");
  });

  it("MATCH aunque la PPU venga escrita con separadores", () => {
    expect(checkDocumentPlate("PATENTE: LX-WP-83", "informe.pdf", "lxwp83").verdict).toBe("MATCH");
  });

  it("MISMATCH cuando el documento es de otro vehículo", () => {
    // El caso real: certificado de LXWP83 adjuntado a un bus con PPU SKPK19
    const check = checkDocumentPlate("PLACA PATENTE LXWP83", "informe.pdf", "SKPK19");
    expect(check.verdict).toBe("MISMATCH");
    expect(check.found).toContain("LXWP83");
    expect(check.expected).toBe("SKPK19");
  });

  it("NOT_FOUND cuando no se reconoce ninguna patente: no se alerta", () => {
    // Un escaneo ilegible no debe generar una falsa alarma
    const check = checkDocumentPlate("|||  ### ilegible ###  |||", "informe.pdf", "SKPK19");
    expect(check.verdict).toBe("NOT_FOUND");
    expect(check.found).toEqual([]);
  });

  it("no alerta por una confusión de OCR en la propia patente", () => {
    // El documento dice BBBB11; el OCR leyó 8888II. Es el mismo bus.
    expect(checkDocumentPlate("PATENTE 8888II", "informe.pdf", "BBBB11").verdict).toBe("MATCH");
  });
});

/**
 * Texto OCR literal del certificado escaneado de planta (MIVAL), donde la
 * patente real LXWP83 quedó mal leída como `Lxwrs3`. Es el peor caso realista:
 * la patente del documento está degradada.
 */
const OCR_CERTIFICADO_REAL = `
REVISION TECNICAS MIVAL ARICA SPA [=] . [=]
MONTEVIDEO 2186 RENCA FECHA A T >
PLANTA A-1308 PLACA PATENTE a ¿o
FONO 226036868 Lxwrs3
CERTIFICADO DE REVISIÓN TÉCNICA N*A1306000000249446
PROPIETARIO SCANIA SUMINISTRADORA DE FLOTA UNO SPA... RUT 77149683-0
VEHÍCULO — BUSCLASEB2 MARCA — SCANIA MODELO K260U8
U N* MOTOR 8360074 N* CHAsIS 9BSK4X200L3970295 ASIENTOS 33
NORMA EMISION : SELLO VERDE EURO VI
RECHAZADO 19/01/2026 14:05:35
COPIA CLIENTE
`;

describe("checkDocumentPlate · certificado real escaneado", () => {
  it("alerta al adjuntar el certificado de otro bus", () => {
    const check = checkDocumentPlate(OCR_CERTIFICADO_REAL, "LXWP83 RTG 19-01-26 14.56.pdf", "SKPK19");
    expect(check.verdict).toBe("MISMATCH");
    // En el cuerpo el OCR degradó LXWP83 a `Lxwrs3` y ya no tiene forma de
    // patente; la evidencia sólida es el nombre del archivo, que no pasa por OCR
    expect(check.found).toContain("LXWP83");
    expect(check.source).toBe("filename");
  });

  it("no confunde chasis, motor, RUT ni folio con una patente", () => {
    const candidates = findPlateCandidates(OCR_CERTIFICADO_REAL).join(" ");
    expect(candidates).not.toContain("8360074");
    expect(candidates).not.toContain("77149683");
    expect(candidates).not.toContain("249446");
    expect(candidates).not.toContain("K260U8");
  });

  it("reconoce la PPU correcta pese a que el OCR la degradó", () => {
    // Mismo certificado, pero ahora el bus SÍ es LXWP83: el nombre del archivo
    // lo confirma y no debe alertar
    const check = checkDocumentPlate(
      OCR_CERTIFICADO_REAL,
      "LXWP83 RTG 19-01-26 14.56.pdf",
      "LXWP83",
    );
    expect(check.verdict).toBe("MATCH");
  });
});

describe("containsExpectedPlate · criterio permisivo", () => {
  it("encuentra la patente aunque venga partida por separadores", () => {
    expect(containsExpectedPlate("PATENTE: LX-WP-83", "LXWP83")).toBe(true);
  });

  it("tolera las confusiones de OCR", () => {
    expect(containsExpectedPlate("PATENTE 8888II", "BBBB11")).toBe(true);
  });

  it("no encuentra una patente que no está", () => {
    expect(containsExpectedPlate("PLACA PATENTE LXWP83", "SKPK19")).toBe(false);
  });
});

describe("findPlateCandidates · criterio estricto", () => {
  it("no toma palabras corrientes de 6 letras por patentes", () => {
    // Con tolerancia de OCR en ambos sentidos, «CHASIS»→CHAS15 y «FRENOS»→FREN05
    // parecerían patentes. El criterio estricto lo impide.
    const found = findPlateCandidates("N* CHASIS 9BSK4X200L3970295 · Sistema de FRENOS · MEDIDO");
    expect(found).toEqual([]);
  });
});
