"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Sparkles, Trash2, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/field";
import type { DetectionSource, RejectionOrigin } from "@/types/database.types";
import type { DetectedRejection } from "@/services/document-processing/types";

export interface EditableRejection {
  key: string;
  description: string;
  /** Texto original del análisis, si el usuario lo corrigió. */
  original_description: string | null;
  source_text: string | null;
  page_number: number | null;
  confidence: number | null;
  requires_review: boolean;
  detection_source: DetectionSource;
  origin: RejectionOrigin;
}

export function toEditableRejections(
  detected: DetectedRejection[],
  detectionSource: DetectionSource,
): EditableRejection[] {
  return detected.map((rejection, index) => ({
    key: `auto-${index}-${crypto.randomUUID()}`,
    description: rejection.description,
    original_description: null,
    source_text: rejection.source_text,
    page_number: rejection.page_number,
    confidence: rejection.confidence,
    requires_review: rejection.requires_review,
    detection_source: detectionSource,
    origin: "AUTOMATIC",
  }));
}

/**
 * §26 · Confirmación del análisis.
 *
 * El usuario ve lo detectado ANTES de cerrar la revisión y puede revisar,
 * corregir, eliminar una detección incorrecta o agregar un motivo que el
 * sistema no detectó.
 *
 * Cada motivo conserva su procedencia: detectado automáticamente, detectado y
 * corregido, o agregado a mano. Editar una detección guarda además el texto
 * original — sin eso no habría forma de auditar qué dijo el análisis y qué
 * decidió la persona.
 */
export function RejectionEditor({
  items,
  onChange,
  disabled,
}: {
  items: EditableRejection[];
  onChange: (items: EditableRejection[]) => void;
  disabled?: boolean;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  function update(key: string, patch: Partial<EditableRejection>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function editDescription(item: EditableRejection, description: string) {
    // La primera corrección de una detección automática guarda el texto original
    const isFirstEditOfAutomatic = item.origin === "AUTOMATIC" && item.original_description === null;

    update(item.key, {
      description,
      origin: item.origin === "MANUAL" ? "MANUAL" : "AUTOMATIC_EDITED",
      original_description: isFirstEditOfAutomatic ? item.description : item.original_description,
    });
  }

  function remove(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  function add() {
    const key = `manual-${crypto.randomUUID()}`;
    onChange([
      ...items,
      {
        key,
        description: "",
        original_description: null,
        source_text: null,
        page_number: null,
        confidence: null,
        requires_review: false,
        detection_source: "MANUAL",
        origin: "MANUAL",
      },
    ]);
    setEditingKey(key);
  }

  const needsReviewCount = items.filter((item) => item.requires_review).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-secondary">
          Motivos de rechazo detectados
          {items.length > 0 && (
            <span className="ml-1.5 text-ink-muted">
              ({items.length} motivo{items.length === 1 ? "" : "s"})
            </span>
          )}
        </p>
        {!disabled && (
          <Button
            variant="secondary"
            size="sm"
            onClick={add}
            icon={<Plus className="size-4" aria-hidden />}
          >
            Agregar motivo
          </Button>
        )}
      </div>

      {needsReviewCount > 0 && (
        <Alert tone="warning">
          {needsReviewCount === 1
            ? "Un motivo requiere revisión manual: el texto no pudo leerse con suficiente certeza."
            : `${needsReviewCount} motivos requieren revisión manual: el texto no pudo leerse con suficiente certeza.`}{" "}
          Verifíquelos contra el documento antes de continuar.
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="size-5" aria-hidden />}
          title="No hay motivos registrados"
          description="El análisis no detectó motivos en el documento, o aún no se ha procesado. Puede agregarlos manualmente."
          className="rounded-lg border border-dashed border-border py-8"
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="rounded-lg border border-border bg-surface-subtle p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    Rechazo {index + 1}
                  </span>

                  {item.origin === "AUTOMATIC" && (
                    <Badge tone="info" icon={<Sparkles className="size-3" aria-hidden />}>
                      Detectado automáticamente
                    </Badge>
                  )}
                  {item.origin === "AUTOMATIC_EDITED" && (
                    <Badge tone="warning" icon={<UserPen className="size-3" aria-hidden />}>
                      Corregido por el usuario
                    </Badge>
                  )}
                  {item.origin === "MANUAL" && (
                    <Badge tone="neutral" icon={<UserPen className="size-3" aria-hidden />}>
                      Agregado manualmente
                    </Badge>
                  )}

                  {item.requires_review && <Badge tone="danger">Requiere revisión</Badge>}
                  {item.page_number && <Badge tone="neutral">Pág. {item.page_number}</Badge>}
                  {item.confidence !== null && item.origin !== "MANUAL" && (
                    <Badge tone="neutral">{Math.round(item.confidence * 100)}% confianza</Badge>
                  )}
                </div>

                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(item.key)}
                    aria-label={`Eliminar rechazo ${index + 1}`}
                    className="-m-1 rounded p-1 text-ink-muted hover:text-danger-600"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>

              {editingKey === item.key || item.description === "" ? (
                <Textarea
                  value={item.description}
                  onChange={(event) => editDescription(item, event.target.value)}
                  onBlur={() => setEditingKey(null)}
                  placeholder="Describa el motivo de rechazo tal como aparece en el documento."
                  rows={3}
                  autoFocus
                  disabled={disabled}
                  invalid={item.description.trim() === ""}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => !disabled && setEditingKey(item.key)}
                  className="w-full rounded px-1 py-0.5 text-left text-sm text-ink hover:bg-surface-muted"
                >
                  {item.description}
                </button>
              )}

              {item.source_text && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink-secondary">
                    Ver el texto del documento que originó este motivo
                  </summary>
                  <blockquote className="mt-1.5 border-l-2 border-border-strong pl-2.5 text-xs whitespace-pre-wrap text-ink-muted">
                    {item.source_text}
                  </blockquote>
                </details>
              )}

              {item.original_description && (
                <p className="mt-2 text-xs text-ink-muted">
                  <span className="font-medium">Texto original del análisis:</span>{" "}
                  {item.original_description}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
