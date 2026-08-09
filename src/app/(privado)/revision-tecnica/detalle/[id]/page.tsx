import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BusFront,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  UserPen,
  UserRound,
} from "lucide-react";
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
  const context = await requirePermission(PERMISSIONS.technicalReview.view);
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
  const documentCount = documents?.length ?? 0;
  const canViewDocuments = context.permissions.includes(
    PERMISSIONS.technicalReviewDocuments.view,
  );
  const rejectionCount = rejections?.length ?? 0;
  const approved = event.result === "APPROVED";

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Link
        href={backHref}
        className="group inline-flex w-fit items-center gap-2 rounded-full bg-surface/75 px-3 py-1.5 text-[12.5px] font-medium text-ink-muted ring-1 ring-border transition-colors hover:bg-surface hover:text-ink"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        Volver {event.result === "REJECTED" ? "a rechazados" : "al historial"}
      </Link>

      <Card solid className="isolate">
        <div
          aria-hidden
          className={`absolute inset-x-0 top-0 h-1 ${approved ? "bg-success-600" : "bg-danger-600"}`}
        />
        <div
          aria-hidden
          className={`absolute -top-24 -right-20 -z-10 size-72 rounded-full blur-3xl ${
            approved ? "bg-success-50/80" : "bg-danger-50/80"
          }`}
        />

        <div className="p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-xl sm:size-14 ${
                  approved
                    ? "bg-success-50 text-success-700 ring-1 ring-success-200"
                    : "bg-danger-50 text-danger-700 ring-1 ring-danger-200"
                }`}
              >
                <BusFront className="size-6 sm:size-7" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold tracking-[0.075em] text-ink-muted uppercase">
                  Detalle de revisión técnica
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <h2 className="text-[23px] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                    Bus {event.internal_number}
                  </h2>
                  <span className="rounded-md bg-fill-subtle px-2.5 py-1 font-mono text-[12px] font-semibold tracking-[0.06em] text-ink-secondary ring-1 ring-border">
                    {event.ppu}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden />
                    {event.terminal_name}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <UserRound className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{event.driver_name}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <ReviewStatusBadge status={event.status} result={event.result} />
              {canViewDocuments && (
                <Badge tone="neutral" icon={<FileText className="size-3" aria-hidden />}>
                  {documentCount} documento{documentCount === 1 ? "" : "s"}
                </Badge>
              )}
              {!approved && (
                <Badge tone="danger">
                  {rejectionCount} rechazo{rejectionCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <HeroMetric
              icon={<FileCheck2 className="size-4" aria-hidden />}
              label="N.º de guía"
              value={event.guide_number ?? "Sin registro"}
            />
            <HeroMetric
              icon={<Clock3 className="size-4" aria-hidden />}
              label="Regreso"
              value={formatDateTime(event.return_at)}
            />
            <HeroMetric
              icon={<CalendarCheck2 className="size-4" aria-hidden />}
              label={approved ? "Nuevo vencimiento" : "Vencimiento vigente"}
              value={
                approved
                  ? formatDateOnly(event.expiration_date)
                  : formatDateOnly(event.previous_expiration_date)
              }
            />
          </dl>
        </div>
      </Card>

      {/* §23, §39 · un rechazo conserva el vencimiento previo */}
      {!approved && (
        <Alert tone="info" title="El vencimiento anterior se mantiene">
          Al ser rechazada, esta revisión no modifica la vigencia del bus
          {event.previous_expiration_date
            ? `, que continúa hasta el ${formatDateOnly(event.previous_expiration_date)}.`
            : "."}
        </Alert>
      )}

      <div className="grid min-w-0 gap-4 min-[1100px]:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <Card solid>
          <CardHeader
            title="Resumen del recorrido"
            description="Tiempos y datos operacionales del proceso."
            actions={
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                <Route className="size-[18px]" aria-hidden />
              </span>
            }
          />
          <CardBody className="p-4 sm:p-5">
            <div className="relative grid gap-3 sm:grid-cols-2">
              <TimelineItem
                icon={<ArrowLeft className="size-4 -rotate-45" aria-hidden />}
                step="01"
                label="Salida a planta"
                value={formatDateTime(event.departure_at)}
                detail={`Registrada por ${event.created_by_name ?? "usuario sin identificar"}`}
              />
              <TimelineItem
                icon={<CheckCircle2 className="size-4" aria-hidden />}
                step="02"
                label="Regreso y cierre"
                value={formatDateTime(event.return_at)}
                detail={`Cerrada por ${event.closed_by_name ?? "usuario sin identificar"}`}
                completed
              />
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <CompactDetail
                icon={<UserRound className="size-3.5" aria-hidden />}
                label="Conductor"
                value={event.driver_name}
              />
              <CompactDetail
                icon={<FileText className="size-3.5" aria-hidden />}
                label="Número de guía"
                value={event.guide_number ?? "Sin registro"}
              />
              <CompactDetail
                icon={<CalendarDays className="size-3.5" aria-hidden />}
                label="Vencimiento anterior"
                value={formatDateOnly(event.previous_expiration_date)}
              />
            </dl>
          </CardBody>
        </Card>

        <Card solid>
          <CardHeader
            title="Trazabilidad"
            description="Responsables del proceso."
            actions={
              <span className="flex size-9 items-center justify-center rounded-lg bg-fill-subtle text-ink-secondary ring-1 ring-border">
                <ShieldCheck className="size-[18px]" aria-hidden />
              </span>
            }
          />
          <CardBody className="p-4 sm:p-5">
            <ol className="space-y-4">
              <TracePerson
                initials={initials(event.created_by_name)}
                action="Registró la salida"
                name={event.created_by_name ?? "Sin registro"}
                date={formatDateTime(event.departure_at)}
              />
              <TracePerson
                initials={initials(event.closed_by_name)}
                action="Cerró la revisión"
                name={event.closed_by_name ?? "Sin registro"}
                date={formatDateTime(event.return_at)}
                last
              />
            </ol>
          </CardBody>
        </Card>
      </div>

      <Card solid>
        <CardHeader
          title="Documentos del proceso"
          description="Archivos privados con descarga temporal y segura."
          actions={
            <Badge tone="neutral">
              {canViewDocuments
                ? `${documentCount} archivo${documentCount === 1 ? "" : "s"}`
                : "Acceso restringido"}
            </Badge>
          }
        />
        {!canViewDocuments ? (
          <EmptyState
            title="Documentos restringidos"
            description="Su rol permite ver el proceso, pero no descargar sus documentos adjuntos."
            className="py-10"
          />
        ) : documents && documents.length > 0 ? (
          <ul className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface-subtle p-3.5 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                    <FileText className="size-[17px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">
                      {DOCUMENT_TYPE_LABELS[document.document_type as DocumentType]}
                    </p>
                    <p className="mt-0.5 break-all text-[11.5px] text-ink-muted">
                      {document.original_name}
                    </p>
                    <p className="mt-1 text-[10.5px] text-ink-subtle tabular-nums">
                      {formatFileSize(document.size_bytes)} · {formatDateTime(document.created_at)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 sm:self-center">
                  <DocumentDownloadButton documentId={document.id} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Sin documentos adjuntos"
            description="Esta revisión no tiene archivos asociados."
            className="py-10"
          />
        )}
      </Card>

      {event.result === "REJECTED" && (
        <Card solid>
          <CardHeader
            title="Motivos de rechazo"
            description={
              rejectionCount > 0
                ? `${rejectionCount} motivo${rejectionCount === 1 ? "" : "s"} registrado${rejectionCount === 1 ? "" : "s"}`
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
            <ol className="grid gap-3 p-3 sm:p-4">
              {rejections.map((rejection) => (
                <li
                  key={rejection.id}
                  className="rounded-xl bg-danger-50/40 p-4 ring-1 ring-danger-200 sm:p-5"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-danger-600 text-[11px] font-semibold text-white shadow-sm">
                      {rejection.sequence}
                    </span>
                    <span className="text-xs font-semibold tracking-wide text-danger-700 uppercase">
                      Motivo de rechazo
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

                  <p className="text-[13.5px] leading-relaxed font-medium text-ink">
                    {rejection.description}
                  </p>

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

function HeroMetric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface/80 px-3.5 py-3 ring-1 ring-border shadow-[var(--shadow-flat)] sm:px-4">
      <dt className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.055em] text-ink-subtle uppercase">
        <span className="text-brand-700">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1.5 truncate text-[13px] font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function TimelineItem({
  icon,
  step,
  label,
  value,
  detail,
  completed,
}: {
  icon: ReactNode;
  step: string;
  label: string;
  value: ReactNode;
  detail: string;
  completed?: boolean;
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-xl bg-surface-subtle p-3.5 ring-1 ring-border">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          completed
            ? "bg-success-50 text-success-700 ring-1 ring-success-200"
            : "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.055em] text-ink-subtle uppercase">
          {step} · {label}
        </p>
        <p className="mt-1 text-[13px] font-semibold text-ink tabular-nums">{value}</p>
        <p className="mt-1 truncate text-[11.5px] text-ink-muted">{detail}</p>
      </div>
    </div>
  );
}

function CompactDetail({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-[12.5px] font-medium text-ink-secondary">{value}</dd>
    </div>
  );
}

function TracePerson({
  initials: personInitials,
  action,
  name,
  date,
  last,
}: {
  initials: string;
  action: string;
  name: string;
  date: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3">
      {!last && (
        <span
          aria-hidden
          className="absolute top-9 bottom-[-1rem] left-[17px] w-px bg-border-strong"
        />
      )}
      <span className="z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-[10.5px] font-semibold text-brand-700 ring-1 ring-border shadow-sm">
        {personInitials}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
          {action}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{name}</p>
        <p className="mt-0.5 text-[11px] text-ink-muted tabular-nums">{date}</p>
      </div>
    </li>
  );
}

function initials(name: string | null): string {
  if (!name) return "—";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
