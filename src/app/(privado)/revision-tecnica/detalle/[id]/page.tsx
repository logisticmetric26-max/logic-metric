import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles, UserPen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  AnalysisStatusBadge,
  Badge,
  ReviewStatusBadge,
} from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { DetailItem } from "@/components/ui/table";
import { DocumentDownloadButton } from "@/features/technical-reviews/document-upload";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documents";
import { formatDateOnly, formatDateTime, formatFileSize } from "@/lib/format";
import type { DocumentType } from "@/types/database.types";

export const metadata: Metadata = { title: "Detalle de revisión" };

/**
 * §37 · Detalle del proceso.
 *
 * Muestra el evento completo y CADA motivo de rechazo de forma individual, con
 * el fragmento del documento que lo originó y quién lo confirmó — la traza que
 * permite demostrar que nada se inventó (§25, §28).
 */
export default async function DetalleRevisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.technicalReview.view);
  const { id } = await params;

  const supabase = await createClient();

  // RLS: un evento de otro terminal simplemente no existe para este usuario
  const { data: event } = await supabase
    .from("technical_review_events_view")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const [{ data: documents }, { data: rejections }, { data: analysis }] = await Promise.all([
    supabase
      .from("technical_review_documents")
      .select("*")
      .eq("technical_review_event_id", id)
      .order("document_type"),
    supabase
      .from("technical_review_rejections")
      .select("*")
      .eq("technical_review_event_id", id)
      .order("sequence"),
    supabase
      .from("technical_review_analyses")
      .select("*")
      .eq("technical_review_event_id", id)
      .maybeSingle(),
  ]);

  const backHref =
    event.result === "REJECTED" ? "/revision-tecnica/rechazados" : "/revision-tecnica/historial";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver
      </Link>

      <Card>
        <CardHeader
          title={`${event.internal_number} · ${event.ppu}`}
          description={event.terminal_name}
          actions={<ReviewStatusBadge status={event.status} result={event.result} />}
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailItem label="Número interno" value={event.internal_number} />
            <DetailItem
              label="PPU"
              value={<span className="font-mono">{event.ppu}</span>}
            />
            <DetailItem label="Terminal" value={event.terminal_name} />
            <DetailItem label="Conductor" value={event.driver_name} />
            <DetailItem label="Fecha de salida" value={formatDateTime(event.departure_at)} />
            <DetailItem label="Fecha de regreso" value={formatDateTime(event.return_at)} />
            <DetailItem label="Número de guía" value={event.guide_number ?? "—"} />
            <DetailItem
              label="Resultado"
              value={<ReviewStatusBadge status={event.status} result={event.result} />}
            />
            <DetailItem label="Registró la salida" value={event.created_by_name ?? "—"} />
            <DetailItem label="Cerró la revisión" value={event.closed_by_name ?? "—"} />
            <DetailItem
              label="Vencimiento registrado"
              value={
                event.result === "APPROVED" ? (
                  formatDateOnly(event.expiration_date)
                ) : (
                  <span className="text-ink-muted">No aplica</span>
                )
              }
            />
            <DetailItem
              label="Vencimiento anterior"
              value={formatDateOnly(event.previous_expiration_date)}
            />
          </dl>

          {/* §23, §39 · un rechazo conserva el vencimiento previo */}
          {event.result === "REJECTED" && (
            <Alert tone="info" className="mt-4">
              Esta revisión fue rechazada, por lo que el bus conserva su fecha de vencimiento
              anterior
              {event.previous_expiration_date
                ? `: ${formatDateOnly(event.previous_expiration_date)}.`
                : "."}
            </Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Documentos"
          description="Los documentos son privados: el enlace de descarga es temporal."
        />
        {documents && documents.length > 0 ? (
          <ul className="divide-y divide-border">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {DOCUMENT_TYPE_LABELS[document.document_type as DocumentType]}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {document.original_name} · {formatFileSize(document.size_bytes)} ·{" "}
                    {formatDateTime(document.created_at)}
                  </p>
                </div>
                <DocumentDownloadButton documentId={document.id} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin documentos" description="Esta revisión no tiene documentos." />
        )}
      </Card>

      {event.result === "REJECTED" && (
        <Card>
          <CardHeader
            title="Motivos de rechazo"
            description={
              rejections && rejections.length > 0
                ? `${rejections.length} motivo${rejections.length === 1 ? "" : "s"} registrado${rejections.length === 1 ? "" : "s"}`
                : undefined
            }
            actions={<AnalysisStatusBadge status={event.analysis_status} />}
          />

          {analysis && (
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <p className="text-xs text-ink-muted">
                Análisis del documento: {analysis.processed_pages ?? 0} de{" "}
                {analysis.page_count ?? 0} página
                {analysis.page_count === 1 ? "" : "s"} procesadas
                {analysis.extraction_method
                  ? ` mediante ${
                      {
                        TEXT_LAYER: "texto del documento",
                        OCR: "lectura de imagen",
                        MIXED: "texto e imagen",
                      }[analysis.extraction_method]
                    }`
                  : ""}
                {analysis.model ? ` · modelo ${analysis.model}` : ""}
              </p>
              {analysis.error_message && (
                <p className="mt-1 text-xs text-danger-600">{analysis.error_message}</p>
              )}
            </div>
          )}

          {rejections && rejections.length > 0 ? (
            <ol className="divide-y divide-border">
              {rejections.map((rejection) => (
                <li key={rejection.id} className="px-4 py-4 sm:px-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      Rechazo {rejection.sequence}
                    </span>

                    {rejection.origin === "AUTOMATIC" && (
                      <Badge tone="info" icon={<Sparkles className="size-3" aria-hidden />}>
                        Detectado automáticamente
                      </Badge>
                    )}
                    {rejection.origin === "AUTOMATIC_EDITED" && (
                      <Badge tone="warning" icon={<UserPen className="size-3" aria-hidden />}>
                        Corregido por el usuario
                      </Badge>
                    )}
                    {rejection.origin === "MANUAL" && (
                      <Badge tone="neutral" icon={<UserPen className="size-3" aria-hidden />}>
                        Agregado manualmente
                      </Badge>
                    )}

                    {rejection.requires_review && <Badge tone="danger">Requiere revisión</Badge>}
                    {rejection.page_number && (
                      <Badge tone="neutral">Pág. {rejection.page_number}</Badge>
                    )}
                    {rejection.confidence !== null && rejection.origin !== "MANUAL" && (
                      <Badge tone="neutral">
                        {Math.round(Number(rejection.confidence) * 100)}% confianza
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-ink">{rejection.description}</p>

                  {rejection.source_text && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink-secondary">
                        Texto del documento que originó este motivo
                      </summary>
                      <blockquote className="mt-1.5 border-l-2 border-border-strong pl-2.5 text-xs whitespace-pre-wrap text-ink-muted">
                        {rejection.source_text}
                      </blockquote>
                    </details>
                  )}

                  {rejection.original_description && (
                    <p className="mt-2 text-xs text-ink-muted">
                      <span className="font-medium">Texto original del análisis:</span>{" "}
                      {rejection.original_description}
                    </p>
                  )}

                  {rejection.confirmed_at && (
                    <p className="mt-2 text-xs text-ink-subtle">
                      Confirmado el {formatDateTime(rejection.confirmed_at)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="Sin motivos registrados"
              description="No se registraron motivos de rechazo para este proceso."
            />
          )}
        </Card>
      )}
    </div>
  );
}
