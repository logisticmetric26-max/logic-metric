import "server-only";

import { ocrPdfPages, isLanguageDataInstalled } from "../ocr";
import { parseRejections, toDetectedRejections } from "../rejection-parser";
import type { AnalysisRequest, RejectionAnalysisProvider } from "../types";

/**
 * §24, §27 · Proveedor local: OCR en el servidor + extracción por reglas.
 *
 * Sin cuenta, sin clave, sin límite de uso y sin conexión tras la primera
 * descarga del modelo de idioma. Ningún documento sale de la máquina, que para
 * informes con PPU y datos de la empresa es una propiedad valiosa por sí sola.
 *
 * A cambio, reconoce la ESTRUCTURA del informe, no su significado. Por eso todo
 * lo que propone queda marcado «requiere revisión» y el usuario confirma antes
 * de cerrar (§26). Cuando el formato no encaja con las reglas, no propone nada:
 * es preferible a proponer basura.
 */
export class LocalOcrRejectionProvider implements RejectionAnalysisProvider {
  readonly name = "local-ocr";
  readonly model = "tesseract-spa";

  isConfigured(): boolean {
    // Sin nada que configurar: si falta el modelo de idioma, se descarga solo
    return true;
  }

  async analyze(request: AnalysisRequest) {
    const { extraction, pdfBytes } = request;

    // Páginas sin capa de texto aprovechable: hay que reconocerlas por imagen
    const scannedPages = extraction.pages
      .map((text, index) => ({ text, pageNumber: index + 1 }))
      .filter((page) => page.text.trim().length < 24)
      .map((page) => page.pageNumber);

    const ocrResults = scannedPages.length > 0 ? await ocrPdfPages(pdfBytes, scannedPages) : [];

    const ocrByPage = new Map(ocrResults.map((result) => [result.page_number, result]));
    const confidenceByPage = new Map(
      ocrResults.map((result) => [result.page_number, result.confidence]),
    );

    // Texto definitivo por página: capa de texto donde exista, OCR donde no
    const pages = extraction.pages.map((text, index) => {
      const pageNumber = index + 1;
      const ocr = ocrByPage.get(pageNumber);
      return { page_number: pageNumber, text: ocr ? ocr.text : text };
    });

    const parsed = parseRejections(pages);
    const rejections = toDetectedRejections(parsed, confidenceByPage);

    const readablePages = pages.filter((page) => page.text.trim().length >= 24).length;
    const documentIsLegible = readablePages > 0;

    return {
      rejections,
      documentIsLegible,
      extractedText: pages
        .map((page) => `--- Página ${page.page_number} ---\n${page.text || "(sin texto legible)"}`)
        .join("\n\n"),
      notes: this.buildNotes({
        totalPages: extraction.page_count,
        readablePages,
        ocrPages: ocrResults.length,
        found: rejections.length,
        languageDataReady: isLanguageDataInstalled(),
      }),
    };
  }

  /** Explica al usuario qué se pudo leer y qué no, sin tecnicismos. */
  private buildNotes(context: {
    totalPages: number;
    readablePages: number;
    ocrPages: number;
    found: number;
    languageDataReady: boolean;
  }): string | null {
    const notes: string[] = [];

    if (context.ocrPages > 0) {
      notes.push(
        `Se aplicó reconocimiento óptico a ${context.ocrPages} página${context.ocrPages === 1 ? "" : "s"} escaneada${context.ocrPages === 1 ? "" : "s"}.`,
      );
    }

    if (context.readablePages < context.totalPages) {
      const unreadable = context.totalPages - context.readablePages;
      notes.push(
        `${unreadable} página${unreadable === 1 ? "" : "s"} no pudo leerse. Revise el documento manualmente.`,
      );
    }

    if (context.found === 0 && context.readablePages > 0) {
      notes.push(
        "No se reconoció una lista de motivos con el formato esperado. " +
          "Registre los motivos manualmente a partir del documento.",
      );
    } else if (context.found > 0) {
      notes.push(
        "La detección es automática y por estructura del documento: verifique cada motivo contra el PDF antes de cerrar.",
      );
    }

    return notes.length > 0 ? notes.join(" ") : null;
  }
}
