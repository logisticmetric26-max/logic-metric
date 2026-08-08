import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { getDocumentAiConfig } from "@/lib/env";
import {
  DocumentProcessingError,
  type AnalysisRequest,
  type DetectedRejection,
  type RejectionAnalysisProvider,
} from "../types";

/**
 * §24-§27 · Proveedor de análisis basado en un modelo multimodal de Anthropic.
 *
 * POR QUÉ MULTIMODAL Y NO UN OCR CLÁSICO
 * --------------------------------------
 * El PDF se envía como documento nativo: el modelo lee la capa de texto cuando
 * existe y las páginas como imagen cuando el documento es un escaneo. Es decir,
 * el OCR y la comprensión ocurren en el mismo paso, sobre TODAS las páginas
 * (§24), sin depender de palabras clave.
 *
 * Cuando además hay capa de texto, se adjunta transcrita: el modelo puede citar
 * el fragmento exacto que originó cada motivo, que es lo que hace auditable el
 * resultado.
 *
 * La clave de API vive sólo en el servidor (`import "server-only"`).
 */

/** Límite de la API: 32 MB por request. Base64 infla ~33 %. */
const MAX_INLINE_PDF_BYTES = 20 * 1024 * 1024;

const SYSTEM_PROMPT = `Analizas informes de rechazo de revisión técnica vehicular chilena y extraes los motivos de rechazo.

REGLA ABSOLUTA: sólo puedes reportar motivos que estén literalmente presentes en el documento. Nunca infieras, completes ni deduzcas un motivo que no esté escrito o visible. Si el documento no contiene motivos de rechazo, devuelve una lista vacía. Un motivo inventado es un error grave.

Para cada motivo:
- "description": el motivo redactado de forma clara y completa, en español, conservando la terminología del documento.
- "source_text": el fragmento EXACTO del documento que lo sustenta, transcrito literalmente. Si el documento es un escaneo, transcribe lo que lees en la imagen. Nunca parafrasees aquí.
- "page_number": la página donde aparece. Si no puedes determinarla con certeza, usa 0.
- "confidence": tu confianza real de 0 a 1 en que el motivo está correctamente leído y transcrito.
- "requires_review": true si el texto está borroso, cortado, ambiguo, parcialmente ilegible, o si tu confianza es baja. Ante la duda, marca true: es preferible que una persona lo revise a registrar un dato incorrecto.

Un motivo por elemento. Si el documento enumera varios defectos, cada uno es un motivo independiente; no los agrupes.

Revisa el documento completo, todas las páginas, incluidos anexos y observaciones al pie.

En "notes" indica en español, y sólo si corresponde, problemas de legibilidad, páginas que no pudiste leer, o cualquier limitación del análisis. Si no hay nada que señalar, deja la cadena vacía.

"document_is_legible" es false sólo si el documento resulta esencialmente ilegible.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    document_is_legible: { type: "boolean" },
    rejections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          source_text: { type: "string" },
          page_number: { type: "integer" },
          confidence: { type: "number" },
          requires_review: { type: "boolean" },
        },
        required: [
          "description",
          "source_text",
          "page_number",
          "confidence",
          "requires_review",
        ],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["document_is_legible", "rejections", "notes"],
  additionalProperties: false,
} as const;

interface AnalysisPayload {
  document_is_legible: boolean;
  rejections: Array<{
    description: string;
    source_text: string;
    page_number: number;
    confidence: number;
    requires_review: boolean;
  }>;
  notes: string;
}

export class AnthropicRejectionAnalysisProvider implements RejectionAnalysisProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;

  constructor() {
    const config = getDocumentAiConfig();
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async analyze(request: AnalysisRequest) {
    if (!this.isConfigured()) {
      throw new DocumentProcessingError(
        "El proveedor de análisis documental no está configurado (DOCUMENT_AI_API_KEY).",
        "NOT_CONFIGURED",
      );
    }

    const client = new Anthropic({ apiKey: this.apiKey });

    const content: Anthropic.ContentBlockParam[] = [];

    // El documento entero: cubre tanto PDFs con texto como escaneos
    if (request.pdfBytes.byteLength <= MAX_INLINE_PDF_BYTES) {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(request.pdfBytes).toString("base64"),
        },
      });
    } else if (!request.extraction.has_text_layer) {
      // Demasiado grande para enviarlo y sin texto que analizar
      throw new DocumentProcessingError(
        "El documento es demasiado grande para ser analizado automáticamente.",
        "TOO_LARGE",
      );
    }

    // La transcripción permite citar fragmentos exactos cuando existe
    if (request.extraction.has_text_layer) {
      content.push({
        type: "text",
        text: `Texto extraído del PDF (${request.extraction.pages_with_text} de ${request.extraction.page_count} páginas con capa de texto):\n\n${request.extraction.text}`,
      });
    }

    content.push({
      type: "text",
      text: `Analiza este informe de rechazo de revisión técnica ("${request.fileName}", ${request.extraction.page_count} página(s)) y extrae todos los motivos de rechazo presentes en él.`,
    });

    let response: Anthropic.Message;

    try {
      response = await client.messages.create({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      throw new DocumentProcessingError(
        error instanceof Error ? error.message : "Error del proveedor de análisis.",
        "PROVIDER_ERROR",
      );
    }

    if (response.stop_reason === "refusal") {
      throw new DocumentProcessingError(
        "El proveedor de análisis rechazó procesar este documento.",
        "REFUSED",
      );
    }

    if (response.stop_reason === "max_tokens") {
      // La respuesta quedó cortada: registrarla parcialmente sería peor que fallar
      throw new DocumentProcessingError(
        "El análisis excedió el tamaño máximo de respuesta.",
        "PROVIDER_ERROR",
      );
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    if (!textBlock) {
      throw new DocumentProcessingError(
        "El proveedor no devolvió un resultado analizable.",
        "PROVIDER_ERROR",
      );
    }

    let payload: AnalysisPayload;

    try {
      payload = JSON.parse(textBlock.text) as AnalysisPayload;
    } catch {
      throw new DocumentProcessingError(
        "El resultado del análisis no pudo interpretarse.",
        "PROVIDER_ERROR",
      );
    }

    return {
      rejections: normalizeRejections(payload.rejections),
      notes: payload.notes?.trim() ? payload.notes.trim() : null,
      documentIsLegible: payload.document_is_legible !== false,
    };
  }
}

/**
 * Saneamiento defensivo del resultado.
 *
 * Un motivo sin descripción se descarta en lugar de guardarse vacío, y todo lo
 * que llegue con confianza baja o sin evidencia textual se marca para revisión
 * manual: la aplicación nunca presenta como confirmado algo que no lo está.
 */
function normalizeRejections(items: AnalysisPayload["rejections"]): DetectedRejection[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const description = String(item?.description ?? "").trim();
      if (!description) return null;

      const sourceText = String(item?.source_text ?? "").trim();
      const pageNumber = Number(item?.page_number);
      const confidence = Number(item?.confidence);

      const normalizedConfidence = Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : null;

      const rejection: DetectedRejection = {
        description: description.slice(0, 4000),
        source_text: sourceText ? sourceText.slice(0, 8000) : null,
        page_number: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : null,
        confidence: normalizedConfidence,
        requires_review:
          item?.requires_review === true ||
          !sourceText ||
          (normalizedConfidence !== null && normalizedConfidence < 0.7),
      };

      return rejection;
    })
    .filter((item): item is DetectedRejection => item !== null);
}
