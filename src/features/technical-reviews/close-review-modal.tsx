"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ScanLine, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Alert, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatDateTime, todayInZone } from "@/lib/format";
import {
  DocumentUpload,
  type UploadedDocument,
} from "@/features/technical-reviews/document-upload";
import {
  RejectionEditor,
  toEditableRejections,
  type EditableRejection,
} from "@/features/technical-reviews/rejection-editor";
import { closeReviewAction, saveRejectionsAction } from "@/features/technical-reviews/actions";
import type {
  DetectionSource,
  ReviewResult,
  TechnicalReviewEventViewRow,
} from "@/types/database.types";
import type { DetectedRejection } from "@/services/document-processing/types";
import type { PlateCheck } from "@/services/document-processing/plate-extractor";

interface AnalysisResponse {
  status: "COMPLETED" | "NEEDS_REVIEW" | "FAILED";
  extraction_method: "TEXT_LAYER" | "OCR" | "MIXED";
  page_count: number;
  processed_pages: number;
  error_message: string | null;
  notes: string | null;
  rejections: DetectedRejection[];
  plate_check: PlateCheck | null;
  document_number: string | null;
}

/**
 * §21-§26 · Cierre de la revisión.
 *
 * Abre el proceso EXISTENTE — nunca crea uno nuevo. Según el resultado exige
 * unos documentos u otros, y para un rechazo procesa el PDF y muestra los
 * motivos detectados para que el usuario los confirme antes de cerrar.
 *
 * Toda esta validación se repite en la base dentro de una transacción, así que
 * el formulario es una guía, no la garantía.
 */
export function CloseReviewModal({
  event,
  open,
  onClose,
}: {
  event: TechnicalReviewEventViewRow;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [result, setResult] = useState<ReviewResult | null>(null);
  const [guideNumber, setGuideNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [technicalDoc, setTechnicalDoc] = useState<UploadedDocument | null>(null);
  const [gasDoc, setGasDoc] = useState<UploadedDocument | null>(null);
  const [rejectionDoc, setRejectionDoc] = useState<UploadedDocument | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [rejections, setRejections] = useState<EditableRejection[]>([]);
  // §62 · el usuario debe reconocer expresamente una PPU que no coincide
  const [plateMismatchAccepted, setPlateMismatchAccepted] = useState(false);
  // El número leído del documento se propone; el usuario puede corregirlo
  const [guideFromDocument, setGuideFromDocument] = useState(false);

  const plateMismatch = analysis?.plate_check?.verdict === "MISMATCH";

  const busy = pending || analyzing;

  /** §24 · analiza todas las páginas del PDF de rechazo. */
  async function analyzeDocument(documentId: string) {
    setAnalyzing(true);
    setAnalysis(null);
    setPlateMismatchAccepted(false);

    try {
      const response = await fetch("/api/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setAnalysis({
          status: "FAILED",
          extraction_method: "TEXT_LAYER",
          page_count: 0,
          processed_pages: 0,
          error_message: body.error ?? "El documento no pudo ser procesado.",
          notes: null,
          rejections: [],
          plate_check: null,
          document_number: null,
        });
        return;
      }

      const data = (await response.json()) as AnalysisResponse;
      setAnalysis(data);

      // Se propone el número del documento SÓLO si el campo está vacío: lo que
      // el usuario ya escribió nunca se pisa.
      if (data.document_number) {
        setGuideNumber((current) => {
          if (current.trim() !== "") return current;
          setGuideFromDocument(true);
          return data.document_number!;
        });
      }

      const detectionSource: DetectionSource =
        data.extraction_method === "TEXT_LAYER" ? "TEXT_LAYER" : "OCR";
      setRejections(toEditableRejections(data.rejections, detectionSource));
    } catch {
      setAnalysis({
        status: "FAILED",
        extraction_method: "TEXT_LAYER",
        page_count: 0,
        processed_pages: 0,
        error_message: "El documento no pudo ser procesado.",
        notes: null,
        rejections: [],
        plate_check: null,
        document_number: null,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!result) {
      setFormError("Debe indicar si la revisión fue aprobada o rechazada.");
      return false;
    }

    if (guideNumber.trim() === "") {
      errors.guide_number = "Debe ingresar un número de guía.";
    }

    if (result === "APPROVED") {
      if (!technicalDoc) errors.technical = "Debe adjuntar el documento de Revisión Técnica.";
      if (!gasDoc) errors.gas = "Debe adjuntar el documento de Revisión de Gases.";
      if (expirationDate.trim() === "") {
        errors.expiration_date = "Debe ingresar una fecha de vencimiento.";
      }
    } else {
      if (!rejectionDoc) errors.rejection = "Debe adjuntar el documento de rechazo.";
      if (rejections.some((item) => item.description.trim() === "")) {
        errors.rejections = "Complete la descripción de todos los motivos o elimínelos.";
      }
    }

    // §62 · un documento de otra PPU no se cierra por descuido
    if (plateMismatch && !plateMismatchAccepted) {
      errors.plate = "Confirme que el documento corresponde a este bus.";
    }

    setFieldErrors(errors);
    setFormError(Object.keys(errors).length > 0 ? "Revise los datos ingresados." : null);

    return Object.keys(errors).length === 0;
  }

  function submit() {
    if (!validate() || !result) return;

    startTransition(async () => {
      // §26 · los motivos se guardan confirmados, antes del cierre
      if (result === "REJECTED") {
        const saved = await saveRejectionsAction(
          event.id,
          rejections.map((item) => ({
            description: item.description.trim(),
            source_text: item.source_text,
            page_number: item.page_number,
            confidence: item.confidence,
            requires_review: item.requires_review,
            detection_source: item.detection_source,
            origin: item.origin,
            original_description: item.original_description,
          })),
        );

        if (!saved.ok) {
          setFormError(saved.error);
          return;
        }
      }

      const formData = new FormData();
      formData.set("event_id", event.id);
      formData.set("result", result);
      formData.set("guide_number", guideNumber);
      if (result === "APPROVED") formData.set("expiration_date", expirationDate);

      const closed = await closeReviewAction(formData);

      if (!closed.ok) {
        setFormError(closed.error);
        return;
      }

      toast.success(
        result === "APPROVED"
          ? "Revisión cerrada y aprobada correctamente."
          : "Revisión cerrada como rechazada.",
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="xl"
      title="Cerrar revisión técnica"
      description={`${event.internal_number} · ${event.ppu} · salida ${formatDateTime(event.departure_at)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={pending}
            disabled={analyzing || !result || (plateMismatch && !plateMismatchAccepted)}
          >
            Cerrar revisión
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {formError && <Alert tone="danger">{formError}</Alert>}

        {/* Datos del proceso abierto, no editables */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-surface-subtle p-3 text-sm sm:grid-cols-4">
          <Fact label="Bus" value={event.internal_number} />
          <Fact label="PPU" value={event.ppu} mono />
          <Fact label="Conductor" value={event.driver_name} />
          <Fact label="Terminal" value={event.terminal_name} />
        </dl>

        {/* §21 · el resultado es obligatorio */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-secondary">
            Resultado de la revisión <span className="text-danger-600">*</span>
          </legend>

          <div className="grid gap-2 sm:grid-cols-2">
            <ResultOption
              selected={result === "APPROVED"}
              onSelect={() => setResult("APPROVED")}
              disabled={busy}
              tone="success"
              icon={<CheckCircle2 className="size-5" aria-hidden />}
              title="Aprobado"
              description="Requiere Revisión Técnica, Revisión de Gases y nueva fecha de vencimiento."
            />
            <ResultOption
              selected={result === "REJECTED"}
              onSelect={() => setResult("REJECTED")}
              disabled={busy}
              tone="danger"
              icon={<XCircle className="size-5" aria-hidden />}
              title="Rechazado"
              description="Requiere el documento de rechazo. El vencimiento anterior se mantiene."
            />
          </div>
        </fieldset>

        {result && (
          <>
            <Field
              label="Número de guía"
              required
              hint={
                guideFromDocument
                  ? "Leído del documento. Verifíquelo y corríjalo si es necesario."
                  : undefined
              }
              error={fieldErrors.guide_number}
              htmlFor="guide-number"
            >
              <Input
                id="guide-number"
                value={guideNumber}
                onChange={(event_) => {
                  setGuideNumber(event_.target.value);
                  setGuideFromDocument(false);
                }}
                maxLength={60}
                autoCapitalize="characters"
                disabled={busy}
                invalid={Boolean(fieldErrors.guide_number)}
                leading={
                  guideFromDocument ? (
                    <ScanLine className="size-4 text-brand-600" aria-hidden />
                  ) : undefined
                }
              />
            </Field>

            {result === "APPROVED" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DocumentUpload
                    eventId={event.id}
                    terminalId={event.terminal_id}
                    fleetId={event.fleet_id}
                    documentType="TECHNICAL_REVIEW"
                    value={technicalDoc}
                    onUploaded={setTechnicalDoc}
                    onRemoved={() => setTechnicalDoc(null)}
                    disabled={busy}
                    required
                  />
                  <DocumentUpload
                    eventId={event.id}
                    terminalId={event.terminal_id}
                    fleetId={event.fleet_id}
                    documentType="GAS_REVIEW"
                    value={gasDoc}
                    onUploaded={setGasDoc}
                    onRemoved={() => setGasDoc(null)}
                    disabled={busy}
                    required
                  />
                </div>

                {(fieldErrors.technical || fieldErrors.gas) && (
                  <p className="text-xs text-danger-600" role="alert">
                    {fieldErrors.technical ?? fieldErrors.gas}
                  </p>
                )}

                <Field
                  label="Fecha de vencimiento"
                  required
                  hint="Pasará a ser el vencimiento vigente del bus."
                  error={fieldErrors.expiration_date}
                  htmlFor="expiration-date"
                >
                  <Input
                    id="expiration-date"
                    type="date"
                    value={expirationDate}
                    min={todayInZone()}
                    onChange={(event_) => setExpirationDate(event_.target.value)}
                    disabled={busy}
                    invalid={Boolean(fieldErrors.expiration_date)}
                  />
                </Field>
              </>
            ) : (
              <>
                <DocumentUpload
                  eventId={event.id}
                  terminalId={event.terminal_id}
                  fleetId={event.fleet_id}
                  documentType="REJECTION_REPORT"
                  value={rejectionDoc}
                  onUploaded={(document) => {
                    setRejectionDoc(document);
                    void analyzeDocument(document.id);
                  }}
                  onRemoved={() => {
                    setRejectionDoc(null);
                    setAnalysis(null);
                    setRejections([]);
                  }}
                  disabled={busy}
                  required
                />

                {fieldErrors.rejection && (
                  <p className="text-xs text-danger-600" role="alert">
                    {fieldErrors.rejection}
                  </p>
                )}

                {analyzing && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-info-200 bg-info-50 px-3.5 py-3 text-sm text-info-700">
                    <Spinner className="text-info-700" />
                    <span>
                      Analizando el documento completo. Puede tardar según la cantidad de páginas.
                    </span>
                  </div>
                )}

                {analysis?.plate_check && !analyzing && (
                  <PlateCheckAlert
                    check={analysis.plate_check}
                    accepted={plateMismatchAccepted}
                    onAccept={setPlateMismatchAccepted}
                    error={fieldErrors.plate}
                    disabled={pending}
                  />
                )}

                {analysis && !analyzing && <AnalysisSummary analysis={analysis} />}

                {rejectionDoc && !analyzing && (
                  <>
                    <RejectionEditor
                      items={rejections}
                      onChange={setRejections}
                      disabled={pending}
                    />
                    {fieldErrors.rejections && (
                      <p className="text-xs text-danger-600" role="alert">
                        {fieldErrors.rejections}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * §62 · Contraste entre la PPU del bus y la del documento.
 *
 * Un desajuste no se puede ignorar por descuido: bloquea el cierre hasta que el
 * usuario confirma expresamente. No es un bloqueo duro porque la lectura puede
 * fallar —el escaneo puede estar mal— pero obliga a mirar antes de continuar.
 */
function PlateCheckAlert({
  check,
  accepted,
  onAccept,
  error,
  disabled,
}: {
  check: PlateCheck;
  accepted: boolean;
  onAccept: (value: boolean) => void;
  error?: string;
  disabled?: boolean;
}) {
  if (check.verdict === "MATCH") {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-success-700">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
        La PPU del documento coincide con la del bus ({check.expected}).
      </p>
    );
  }

  if (check.verdict === "NOT_FOUND") {
    return (
      <p className="flex items-start gap-1.5 text-[12px] text-ink-muted">
        <ScanLine className="mt-px size-3.5 shrink-0" aria-hidden />
        No se pudo leer la PPU en el documento. Verifique que corresponde al bus{" "}
        {check.expected}.
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-danger-600 bg-danger-50 px-4 py-3.5"
    >
      <p className="flex items-center gap-2 text-[14px] font-semibold text-danger-700">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        El documento parece ser de otro vehículo
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.045em] text-danger-700/70 uppercase">
            PPU de este bus
          </dt>
          <dd className="mt-0.5 font-mono text-[15px] font-semibold text-ink">
            {check.expected}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.045em] text-danger-700/70 uppercase">
            {check.source === "filename" ? "PPU en el nombre del archivo" : "PPU en el documento"}
          </dt>
          <dd className="mt-0.5 font-mono text-[15px] font-semibold text-danger-700">
            {check.found.join(" · ")}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[13px] leading-relaxed text-danger-700">
        Revise que adjuntó el informe correcto. Si continúa, quedará asociado a este bus un
        documento que no le corresponde.
      </p>

      <div className="mt-3 border-t border-danger-200 pt-3">
        <Checkbox
          checked={accepted}
          onChange={(event) => onAccept(event.target.checked)}
          disabled={disabled}
          label="He verificado el documento y corresponde a este bus"
          description="La lectura automática puede fallar si el escaneo es de mala calidad."
        />
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-danger-700">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function AnalysisSummary({ analysis }: { analysis: AnalysisResponse }) {
  if (analysis.status === "FAILED") {
    return (
      <Alert tone="danger" title="El documento no pudo ser procesado.">
        {analysis.error_message ??
          "Registre los motivos de rechazo manualmente para poder cerrar la revisión."}
      </Alert>
    );
  }

  const methodLabel = {
    TEXT_LAYER: "texto del documento",
    OCR: "lectura de imagen (documento escaneado)",
    MIXED: "texto e imagen (documento mixto)",
  }[analysis.extraction_method];

  return (
    <Alert
      tone={analysis.status === "NEEDS_REVIEW" ? "warning" : "success"}
      title={
        analysis.status === "NEEDS_REVIEW"
          ? "Algunos datos requieren revisión manual."
          : "Documento analizado."
      }
    >
      <p className="flex items-center gap-1.5">
        <ScanLine className="size-3.5 shrink-0" aria-hidden />
        Se procesaron {analysis.processed_pages} de {analysis.page_count} página
        {analysis.page_count === 1 ? "" : "s"} mediante {methodLabel}.
      </p>
      {analysis.notes && <p className="mt-1">{analysis.notes}</p>}
      <p className="mt-1">
        Revise los motivos detectados y corríjalos si es necesario antes de cerrar.
      </p>
    </Alert>
  );
}

function ResultOption({
  selected,
  onSelect,
  disabled,
  tone,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  tone: "success" | "danger";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const tones = {
    success: "border-success-600 bg-success-50 text-success-700",
    danger: "border-danger-600 bg-danger-50 text-danger-700",
  } as const;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors",
        selected ? tones[tone] : "border-border hover:border-border-strong hover:bg-surface-subtle",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className={cn("shrink-0", selected ? "" : "text-ink-subtle")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className={cn("mt-0.5 block text-xs", selected ? "opacity-90" : "text-ink-muted")}>
          {description}
        </span>
      </span>
    </button>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={cn("truncate text-ink", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
