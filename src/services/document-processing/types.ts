import type { ExtractionMethod } from "@/types/database.types";
import type { PlateCheck } from "./plate-extractor";

/**
 * §27 · Capa desacoplada de análisis documental.
 *
 * La aplicación depende de estas interfaces, no de un proveedor concreto.
 * Cambiar de proveedor de OCR/IA es implementar `RejectionAnalysisProvider` y
 * registrarlo en `index.ts`; ningún módulo de negocio se entera.
 */

/** Un motivo de rechazo detectado en el documento. */
export interface DetectedRejection {
  /** Redacción del motivo tal como se registrará. */
  description: string;
  /**
   * Fragmento textual EXACTO del documento que lo sustenta.
   * Es la evidencia de que el motivo estaba en el PDF y no fue inventado (§25).
   */
  source_text: string | null;
  /** Página del PDF donde aparece, si pudo determinarse (§28). */
  page_number: number | null;
  /** Confianza del análisis, de 0 a 1. */
  confidence: number | null;
  /** §25 · contenido ilegible, ambiguo o de baja confianza. */
  requires_review: boolean;
}

export interface PdfExtraction {
  page_count: number;
  /** Texto por página. Vacío en las páginas escaneadas sin capa de texto. */
  pages: string[];
  /** Texto completo concatenado con marcas de página. */
  text: string;
  /** El PDF trae capa de texto en al menos una página. */
  has_text_layer: boolean;
  /** Páginas con capa de texto utilizable. */
  pages_with_text: number;
}

export interface AnalysisRequest {
  /** Bytes del PDF, para el análisis visual de documentos escaneados. */
  pdfBytes: Uint8Array;
  extraction: PdfExtraction;
  /** Nombre original. Además de contexto, es señal fiable de la patente. */
  fileName: string;
}

export interface AnalysisOutcome {
  status: "COMPLETED" | "NEEDS_REVIEW" | "FAILED";
  extraction_method: ExtractionMethod;
  page_count: number;
  processed_pages: number;
  model: string | null;
  rejections: DetectedRejection[];
  extracted_text: string | null;
  error_message: string | null;
  /** Observaciones del análisis dirigidas al usuario. */
  notes: string | null;
  /**
   * §62 · Contraste entre la PPU del bus y la que aparece en el documento.
   * `null` si no se pudo comprobar.
   */
  plate_check: PlateCheck | null;
  /**
   * Número del documento leído del certificado. Se propone al usuario para no
   * transcribirlo a mano; `null` si no se reconoció con fiabilidad.
   */
  document_number: string | null;
}

/** Contrato que debe cumplir cualquier proveedor de análisis. */
export interface RejectionAnalysisProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  analyze(request: AnalysisRequest): Promise<{
    rejections: DetectedRejection[];
    notes: string | null;
    documentIsLegible: boolean;
    /**
     * Texto efectivamente analizado, si el proveedor lo produjo (p. ej. el
     * resultado del OCR de un escaneo). Se guarda como evidencia de qué leyó
     * realmente el sistema.
     */
    extractedText?: string | null;
  }>;
}

/** Error con causa identificable, para traducirlo a un mensaje del usuario. */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_PDF"
      | "TOO_LARGE"
      | "PROVIDER_ERROR"
      | "REFUSED",
  ) {
    super(message);
    this.name = "DocumentProcessingError";
  }
}
