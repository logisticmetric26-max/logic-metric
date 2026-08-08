import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** §64 · Estado vacío. Nunca se muestra una tabla en blanco sin explicación. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-black/[0.04] text-ink-subtle ring-1 ring-black/[0.04]">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <div className="max-w-sm">
        <p className="text-[14px] font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** §63 · Error visible para el usuario, sin detalles técnicos. */
export function ErrorState({
  title = "No se pudo cargar la información",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 ring-1 ring-danger-200">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-[14px] font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info-200 bg-info-50 text-info-700",
    warning: "border-warning-200 bg-warning-50 text-warning-700",
    danger: "border-danger-200 bg-danger-50 text-danger-700",
    success: "border-success-200 bg-success-50 text-success-700",
  } as const;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-[13px] leading-relaxed", tones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("size-4 animate-spin text-ink-muted", className)} aria-hidden />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

/** §64 · Esqueleto de tabla mientras se resuelve la consulta. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn("h-4 flex-1", columnIndex === 0 && "max-w-28")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-28" />
      ))}
    </div>
  );
}
