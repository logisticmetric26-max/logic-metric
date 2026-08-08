"use client";

import { useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import {
  DOCUMENTS_BUCKET,
  DOCUMENT_TYPE_LABELS,
  buildDocumentPath,
  validatePdfFile,
} from "@/lib/documents";
import { registerDocumentAction } from "@/features/technical-reviews/actions";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@/types/database.types";

export interface UploadedDocument {
  id: string;
  documentType: DocumentType;
  originalName: string;
  sizeBytes: number;
}

/**
 * §41, §61 · Carga de un documento obligatorio.
 *
 * El archivo se sube DIRECTAMENTE desde el navegador al bucket privado con la
 * sesión del usuario, de modo que las políticas de Storage validan el terminal
 * antes de aceptar el archivo. Después se registra su metadata en la base, que
 * a su vez verifica que la ruta corresponda al terminal, bus y evento.
 *
 * El archivo se valida antes de subirlo (extensión, tipo, tamaño, vacío y firma
 * binaria real), y la base y el bucket lo vuelven a validar del lado servidor.
 */
export function DocumentUpload({
  eventId,
  terminalId,
  fleetId,
  documentType,
  value,
  onUploaded,
  onRemoved,
  disabled,
  required,
}: {
  eventId: string;
  terminalId: string;
  fleetId: string;
  documentType: DocumentType;
  value: UploadedDocument | null;
  onUploaded: (document: UploadedDocument) => void;
  onRemoved: () => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo tras un error
    event.target.value = "";
    if (!file) return;

    setError(null);

    const validation = await validatePdfFile(file);
    if (!validation.ok) {
      setError(validation.error ?? "Archivo inválido.");
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();
      const storagePath = buildDocumentPath({
        terminalId,
        fleetId,
        eventId,
        documentType,
        uniqueId: crypto.randomUUID(),
      });

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

      if (uploadError) {
        setError("El documento no pudo cargarse. Verifique su conexión e intente nuevamente.");
        return;
      }

      const result = await registerDocumentAction({
        eventId,
        documentType,
        originalName: file.name,
        storagePath,
        sizeBytes: file.size,
      });

      if (!result.ok) {
        // El archivo ya está en Storage pero la metadata falló: se limpia para
        // no dejar huérfanos.
        await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
        setError(result.error);
        return;
      }

      onUploaded({
        id: result.data.id,
        documentType,
        originalName: file.name,
        sizeBytes: file.size,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-secondary">
          {DOCUMENT_TYPE_LABELS[documentType]}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden>
              *
            </span>
          )}
        </span>
      </div>

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-success-200 bg-success-50 px-3.5 py-2.5">
          <FileText className="size-4 shrink-0 text-success-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">{value.originalName}</span>
            <span className="block text-xs text-ink-muted">{formatFileSize(value.sizeBytes)}</span>
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={onRemoved}
              aria-label={`Quitar ${DOCUMENT_TYPE_LABELS[documentType]}`}
              className="-m-1 shrink-0 rounded p-1 text-ink-muted hover:text-danger-600"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border border-dashed px-3.5 py-4",
            "text-sm transition-colors",
            error
              ? "border-danger-600 text-danger-600"
              : "border-border-strong text-ink-muted hover:border-brand-500 hover:text-brand-700",
            (disabled || uploading) && "cursor-not-allowed opacity-60",
          )}
        >
          {uploading ? (
            <>
              <Spinner />
              Cargando documento…
            </>
          ) : (
            <>
              <Upload className="size-4" aria-hidden />
              Adjuntar PDF
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={onFileSelected}
        className="hidden"
        tabIndex={-1}
      />

      {error && (
        <p className="text-xs text-danger-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function DocumentDownloadButton({
  documentId,
  label = "Ver documento",
}: {
  documentId: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const { getDocumentUrlAction } = await import("@/features/technical-reviews/actions");
      const result = await getDocumentUrlAction(documentId);
      if (result.ok) window.open(result.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={open}
      loading={loading}
      icon={<FileText className="size-4" aria-hidden />}
    >
      {label}
    </Button>
  );
}
