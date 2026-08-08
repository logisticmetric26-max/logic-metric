import type { DocumentType } from "@/types/database.types";

/**
 * §41, §61 · Documentos.
 *
 * Los archivos viven en un bucket privado de Supabase Storage; PostgreSQL sólo
 * guarda su metadata. Nunca se almacena un PDF como base64 en la base.
 */

export const DOCUMENTS_BUCKET = "technical-review-documents";

/** 25 MB · el mismo límite que aplican el bucket y el CHECK de la tabla. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  TECHNICAL_REVIEW: "Revisión Técnica",
  GAS_REVIEW: "Revisión de Gases",
  REJECTION_REPORT: "Informe de rechazo",
};

/**
 * Ruta canónica de un documento.
 *
 * El terminal va en la ruta porque las políticas de Storage lo leen de ahí para
 * decidir el acceso (§43). Un trigger de la base rechaza cualquier metadata
 * cuya ruta no corresponda a su terminal, bus y evento.
 */
export function buildDocumentPath(params: {
  terminalId: string;
  fleetId: string;
  eventId: string;
  documentType: DocumentType;
  uniqueId: string;
}): string {
  const { terminalId, fleetId, eventId, documentType, uniqueId } = params;
  return `technical-reviews/${terminalId}/${fleetId}/${eventId}/${documentType.toLowerCase()}-${uniqueId}.pdf`;
}

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * §61 · Validación de archivo.
 *
 * No basta con mirar la extensión: se comprueba el tipo declarado, el tamaño y
 * la firma binaria real del archivo. Un `.pdf` que en realidad es otra cosa se
 * rechaza aquí, y el bucket vuelve a validarlo del lado del servidor.
 */
export async function validatePdfFile(file: File): Promise<FileValidationResult> {
  if (!file || file.size === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "El archivo supera el tamaño máximo permitido (25 MB)." };
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "Sólo se aceptan archivos PDF." };
  }

  if (file.type && file.type !== "application/pdf") {
    return { ok: false, error: "Sólo se aceptan archivos PDF." };
  }

  // Firma real del archivo: los primeros bytes de todo PDF son `%PDF-`
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...header);

  if (signature !== "%PDF-") {
    return { ok: false, error: "El archivo no es un PDF válido o está dañado." };
  }

  return { ok: true };
}

/** Comprobación equivalente en el servidor, sobre los bytes ya recibidos. */
export function isPdfBuffer(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 5) return false;
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}
