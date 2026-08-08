import "server-only";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isPdfBuffer } from "@/lib/documents";
import { DocumentProcessingError, type PdfExtraction } from "./types";

/**
 * §24 · Extracción de la capa de texto del PDF.
 *
 * Recorre TODAS las páginas, no sólo la primera. El resultado permite decidir
 * si el documento trae texto (viene de un sistema) o es un escaneo (necesita
 * lectura visual).
 *
 * Un PDF puede ser mixto: algunas páginas con texto y otras escaneadas. Por eso
 * se cuenta cuántas páginas tienen texto en lugar de responder sí/no.
 */

/** Menos de esto en una página se considera ruido, no una capa de texto real. */
const MIN_CHARS_PER_PAGE = 24;

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtraction> {
  if (!isPdfBuffer(bytes)) {
    throw new DocumentProcessingError("El archivo no es un PDF válido.", "INVALID_PDF");
  }

  const loadingTask = getDocument({
    // pdfjs se apropia del buffer: se le entrega una copia para no invalidar
    // los mismos bytes que después se envían al proveedor de análisis.
    data: new Uint8Array(bytes),
    // En servidor no hay fetch de recursos remotos
    useWorkerFetch: false,
    useSystemFonts: true,
    // Un PDF dañado no debe abortar la extracción de las páginas legibles
    stopAtErrors: false,
  });

  let document;

  try {
    document = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw new DocumentProcessingError(
      `El PDF no pudo abrirse: ${error instanceof Error ? error.message : "formato no reconocido"}`,
      "INVALID_PDF",
    );
  }

  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      try {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();

        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        pages.push(text);
        page.cleanup();
      } catch {
        // Una página ilegible no invalida el documento: se marca vacía y el
        // análisis visual la cubrirá.
        pages.push("");
      }
    }
  } finally {
    // Libera el worker y los buffers del documento
    await loadingTask.destroy().catch(() => undefined);
  }

  const pagesWithText = pages.filter((text) => text.length >= MIN_CHARS_PER_PAGE).length;

  const text = pages
    .map((pageText, index) => `--- Página ${index + 1} ---\n${pageText || "(sin capa de texto)"}`)
    .join("\n\n");

  return {
    page_count: pages.length,
    pages,
    text,
    has_text_layer: pagesWithText > 0,
    pages_with_text: pagesWithText,
  };
}
