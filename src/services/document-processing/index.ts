import "server-only";

import { extractPdfText } from "./pdf-extractor";
import { checkDocumentPlate } from "./plate-extractor";
import { extractDocumentNumber } from "./document-number";
import { AnthropicRejectionAnalysisProvider } from "./providers/anthropic-provider";
import { LocalOcrRejectionProvider } from "./providers/local-ocr-provider";
import {
  DocumentProcessingError,
  type AnalysisOutcome,
  type RejectionAnalysisProvider,
} from "./types";

export * from "./types";

/**
 * §24-§27 · Procesamiento del documento de rechazo.
 *
 *   1. cargar el archivo
 *   2. detectar si contiene texto
 *   3. detectar si es un escaneo
 *   4. procesar todas las páginas
 *   5. aplicar lectura visual (OCR) si corresponde
 *   6. extraer el contenido
 *   7. analizar el documento completo
 *   8. detectar todos los motivos de rechazo
 *   9. estructurar cada motivo
 *
 * El paso 10 —almacenarlos asociados al proceso— NO ocurre aquí: este servicio
 * es puro y no toca la base. Los motivos se guardan sólo después de que el
 * usuario los confirma (§26).
 */

/**
 * Proveedor activo.
 *
 * Por defecto se usa el motor LOCAL: OCR en el servidor y extracción por
 * reglas. Es gratuito, ilimitado, funciona sin conexión y ningún documento sale
 * de la máquina — lo que importa cuando los informes llevan PPU y datos de la
 * empresa.
 *
 * Si se configura `DOCUMENT_AI_API_KEY`, se prefiere el proveedor multimodal:
 * entiende el documento en lugar de reconocer su estructura, así que acierta
 * más en informes de formato irregular. Es una mejora opcional y de pago, no un
 * requisito.
 *
 * Punto único de cambio: para añadir otro proveedor basta implementar
 * `RejectionAnalysisProvider` y devolverlo aquí.
 */
function getProvider(): RejectionAnalysisProvider {
  const remote = new AnthropicRejectionAnalysisProvider();
  if (remote.isConfigured()) return remote;

  return new LocalOcrRejectionProvider();
}

/** El análisis siempre está disponible: el motor local no requiere configuración. */
export function isDocumentProcessingConfigured(): boolean {
  return getProvider().isConfigured();
}

export async function analyzeRejectionDocument(
  pdfBytes: Uint8Array,
  fileName: string,
  /** PPU del bus según la flota, para verificar que el documento le corresponde. */
  expectedPpu?: string,
): Promise<AnalysisOutcome> {
  const provider = getProvider();

  // 1-6 · Lectura del PDF y de su capa de texto, página por página
  const extraction = await extractPdfText(pdfBytes);

  // 2-3 · Cómo se obtuvo el contenido, para dejarlo trazado
  const extractionMethod =
    extraction.pages_with_text === 0
      ? "OCR"
      : extraction.pages_with_text === extraction.page_count
        ? "TEXT_LAYER"
        : "MIXED";

  const base = {
    extraction_method: extractionMethod,
    page_count: extraction.page_count,
    extracted_text: extraction.has_text_layer ? extraction.text : null,
    model: provider.model,
  } as const;

  try {
    // 7-9 · Análisis del documento completo y estructuración de cada motivo
    const result = await provider.analyze({ pdfBytes, extraction, fileName });

    // §25 · si el documento es ilegible no se afirma que "no hubo rechazos":
    // se pide revisión manual explícita.
    const needsReview =
      !result.documentIsLegible ||
      result.rejections.some((rejection) => rejection.requires_review);

    // El OCR sustituye a la capa de texto cuando la página es un escaneo
    const analyzedText = result.extractedText ?? extraction.text;

    // §62 · ¿el documento corresponde a este bus?
    const plateCheck = expectedPpu
      ? checkDocumentPlate(analyzedText, fileName, expectedPpu)
      : null;

    return {
      ...base,
      extracted_text: result.extractedText ?? base.extracted_text,
      plate_check: plateCheck,
      document_number: extractDocumentNumber(analyzedText),
      // Una PPU que no coincide obliga a revisar, aunque los motivos se leyeran bien
      status: needsReview || plateCheck?.verdict === "MISMATCH" ? "NEEDS_REVIEW" : "COMPLETED",
      processed_pages: extraction.page_count,
      rejections: result.rejections,
      error_message: null,
      notes: !result.documentIsLegible
        ? (result.notes ??
          "El documento no pudo leerse con claridad. Revise y registre los motivos manualmente.")
        : result.notes,
    };
  } catch (error) {
    const message =
      error instanceof DocumentProcessingError
        ? error.message
        : "El documento no pudo ser procesado.";

    // Un fallo del análisis NO bloquea el cierre de la revisión: el usuario
    // siempre puede registrar los motivos a mano (§26).
    return {
      ...base,
      status: "FAILED",
      processed_pages: 0,
      rejections: [],
      error_message: message,
      notes: null,
      plate_check: null,
      document_number: null,
    };
  }
}
