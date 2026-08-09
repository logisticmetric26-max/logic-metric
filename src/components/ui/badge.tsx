import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  AnalysisStatus,
  ExpirationStatus,
  ReviewResult,
  ReviewStatus,
  UserStatus,
} from "@/types/database.types";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-fill-subtle text-ink-secondary ring-border",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-success-50 text-success-700 ring-success-200",
  warning: "bg-warning-50 text-warning-700 ring-warning-200",
  danger: "bg-danger-50 text-danger-700 ring-danger-200",
  info: "bg-info-50 text-info-700 ring-info-200",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Insignias de estado del dominio
// -----------------------------------------------------------------------------
// Centralizadas para que un estado se vea igual en toda la aplicación y para que
// las etiquetas en español vivan en un solo sitio.
// -----------------------------------------------------------------------------

export function ReviewStatusBadge({
  status,
  result,
}: {
  status: ReviewStatus;
  result: ReviewResult | null;
}) {
  if (status === "OPEN") return <Badge tone="info">En revisión</Badge>;
  if (result === "APPROVED") return <Badge tone="success">Aprobado</Badge>;
  if (result === "REJECTED") return <Badge tone="danger">Rechazado</Badge>;
  return <Badge tone="neutral">Cerrado</Badge>;
}

const EXPIRATION_LABELS: Record<ExpirationStatus, { label: string; tone: Tone }> = {
  VALID: { label: "Vigente", tone: "success" },
  EXPIRING_SOON: { label: "Próximo a vencer", tone: "warning" },
  EXPIRED: { label: "Vencido", tone: "danger" },
  NO_RECORD: { label: "Sin registro", tone: "neutral" },
};

export function ExpirationBadge({ status }: { status: ExpirationStatus }) {
  const { label, tone } = EXPIRATION_LABELS[status] ?? EXPIRATION_LABELS.NO_RECORD;
  return <Badge tone={tone}>{label}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return status === "ACTIVE" ? (
    <Badge tone="success">Activo</Badge>
  ) : (
    <Badge tone="danger">Suspendido</Badge>
  );
}

const ANALYSIS_LABELS: Record<AnalysisStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pendiente", tone: "neutral" },
  PROCESSING: { label: "Procesando", tone: "info" },
  COMPLETED: { label: "Analizado", tone: "success" },
  NEEDS_REVIEW: { label: "Requiere revisión", tone: "warning" },
  FAILED: { label: "Falló el análisis", tone: "danger" },
};

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus | null }) {
  if (!status) return <Badge tone="neutral">Sin análisis</Badge>;
  const { label, tone } = ANALYSIS_LABELS[status] ?? ANALYSIS_LABELS.PENDING;
  return <Badge tone={tone}>{label}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="success">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>;
}
