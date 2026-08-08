import { describe, expect, it } from "vitest";
import { buildDocumentPath, isPdfBuffer, validatePdfFile } from "./documents";

/**
 * §41, §43, §61 · Documentos.
 *
 * La ruta lleva el terminal en el segundo segmento porque las políticas de
 * Storage lo leen de ahí para decidir el acceso. Cambiar ese orden rompería el
 * aislamiento entre terminales sin que ninguna consulta fallara, así que se
 * verifica explícitamente.
 */
describe("buildDocumentPath", () => {
  const params = {
    terminalId: "11111111-1111-1111-1111-111111111111",
    fleetId: "22222222-2222-2222-2222-222222222222",
    eventId: "33333333-3333-3333-3333-333333333333",
    uniqueId: "44444444-4444-4444-4444-444444444444",
  };

  it("coloca el terminal en el segundo segmento de la ruta", () => {
    const path = buildDocumentPath({ ...params, documentType: "REJECTION_REPORT" });
    expect(path.split("/")[0]).toBe("technical-reviews");
    expect(path.split("/")[1]).toBe(params.terminalId);
  });

  it("anida bus y evento bajo el terminal", () => {
    const path = buildDocumentPath({ ...params, documentType: "TECHNICAL_REVIEW" });
    expect(path).toBe(
      `technical-reviews/${params.terminalId}/${params.fleetId}/${params.eventId}/technical_review-${params.uniqueId}.pdf`,
    );
  });

  it("distingue los tipos de documento en el nombre del archivo", () => {
    const technical = buildDocumentPath({ ...params, documentType: "TECHNICAL_REVIEW" });
    const gas = buildDocumentPath({ ...params, documentType: "GAS_REVIEW" });
    const rejection = buildDocumentPath({ ...params, documentType: "REJECTION_REPORT" });

    expect(new Set([technical, gas, rejection]).size).toBe(3);
    expect(rejection.endsWith(".pdf")).toBe(true);
  });

  it("no produce segmentos de escape de directorio", () => {
    const path = buildDocumentPath({ ...params, documentType: "GAS_REVIEW" });
    expect(path.includes("..")).toBe(false);
  });
});

describe("isPdfBuffer", () => {
  it("reconoce la firma binaria de un PDF", () => {
    expect(isPdfBuffer(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
  });

  it("rechaza contenido que no es PDF aunque se llame .pdf", () => {
    expect(isPdfBuffer(new TextEncoder().encode("<html><body>no soy un pdf"))).toBe(false);
    // Firma de un PNG
    expect(isPdfBuffer(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false);
  });

  it("rechaza un archivo demasiado corto para tener firma", () => {
    expect(isPdfBuffer(new Uint8Array([0x25, 0x50]))).toBe(false);
    expect(isPdfBuffer(new Uint8Array())).toBe(false);
  });
});

describe("validatePdfFile", () => {
  function makeFile(content: Uint8Array, name: string, type: string): File {
    return new File([content as BlobPart], name, { type });
  }

  const pdfBytes = new TextEncoder().encode("%PDF-1.7\ncontenido");

  it("acepta un PDF válido", async () => {
    const result = await validatePdfFile(makeFile(pdfBytes, "informe.pdf", "application/pdf"));
    expect(result.ok).toBe(true);
  });

  it("rechaza un archivo vacío", async () => {
    const result = await validatePdfFile(
      makeFile(new Uint8Array(), "vacio.pdf", "application/pdf"),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("vacío");
  });

  it("rechaza una extensión distinta de .pdf", async () => {
    const result = await validatePdfFile(makeFile(pdfBytes, "informe.docx", "application/pdf"));
    expect(result.ok).toBe(false);
  });

  it("rechaza un MIME type que no es PDF", async () => {
    const result = await validatePdfFile(makeFile(pdfBytes, "informe.pdf", "image/png"));
    expect(result.ok).toBe(false);
  });

  it("rechaza un archivo renombrado a .pdf que no lo es", async () => {
    const fake = new TextEncoder().encode("PK esto es un zip");
    const result = await validatePdfFile(makeFile(fake, "informe.pdf", "application/pdf"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no es un PDF válido");
  });
});
