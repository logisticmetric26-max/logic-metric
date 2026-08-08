import { describe, expect, it } from "vitest";
import { extractDocumentNumber } from "./document-number";

/**
 * El número se propone para ahorrar una transcripción de 17 caracteres, así que
 * lo importante es no proponer un dato equivocado: antes de devolver algo
 * dudoso —el RUT del propietario, el teléfono de la planta— es preferible
 * devolver `null` y que el usuario lo escriba.
 */

describe("extractDocumentNumber · certificado de planta", () => {
  it("rescata el número que va junto al nombre del documento", () => {
    expect(
      extractDocumentNumber("CERTIFICADO DE REVISIÓN TÉCNICA N°A1306000000265012"),
    ).toBe("A1306000000265012");
  });

  it("acepta las variantes con que el OCR lee el símbolo Nº", () => {
    const variantes = ["N°", "Nº", "N*", "N.", "No", "N"];
    for (const marca of variantes) {
      expect(
        extractDocumentNumber(`CERTIFICADO DE REVISION TECNICA ${marca}A1306000000249446`),
      ).toBe("A1306000000249446");
    }
  });

  it("funciona sobre el texto OCR real del certificado", () => {
    const ocr = `
REVISION TECNICAS MIVAL ARICA SPA [=] . [=]
MONTEVIDEO 2186 RENCA FECHA A T >
PLANTA A-1308 PLACA PATENTE a ¿o
FONO 226036868 Lxwrs3
CERTIFICADO DE REVISIÓN TÉCNICA N*A1306000000249446
PROPIETARIO SCANIA SUMINISTRADORA DE FLOTA UNO SPA... RUT 77149683-0
`;
    expect(extractDocumentNumber(ocr)).toBe("A1306000000249446");
  });

  it("prefiere el número del certificado antes que otros de la hoja", () => {
    const texto = `
FONO 226036868
CERTIFICADO DE REVISIÓN TÉCNICA N°A1306000000265012
N* MOTOR 8360074
RUT 77149683-0
`;
    expect(extractDocumentNumber(texto)).toBe("A1306000000265012");
  });

  it("reconoce otros nombres de documento", () => {
    expect(extractDocumentNumber("INFORME DE RECHAZO N° 2026-004512")).toBe("2026-004512");
    expect(extractDocumentNumber("GUIA N°884213")).toBe("884213");
  });
});

describe("extractDocumentNumber · prudencia", () => {
  it("no devuelve nada si no hay número de documento", () => {
    expect(extractDocumentNumber("CERTIFICADO DE REVISION TECNICA")).toBeNull();
    expect(extractDocumentNumber("")).toBeNull();
  });

  it("no confunde una palabra con un número", () => {
    expect(extractDocumentNumber("NOMBRE MEDIDO NORMA RESULTADO")).toBeNull();
  });

  it("descarta códigos con demasiadas letras para ser un número", () => {
    expect(extractDocumentNumber("CERTIFICADO N° ABCDEFGH")).toBeNull();
  });
});
