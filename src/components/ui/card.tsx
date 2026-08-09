import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Superficie de contenido.
 *
 * Sólida a propósito: es el material sobre el que se leen tablas, fichas y
 * formularios. El cristal se reserva al cromo — sobre datos densos entorpece la
 * lectura y encarece el scroll.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface",
        "shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border px-5 py-4",
        "sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-[13px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-subtle px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * §17 · Indicador compacto del tablero.
 *
 * Versión densa de `StatCard`: seis de éstos caben en una franja de la altura
 * de una fila de tabla, dejando el espacio vertical para los gráficos que
 * explican los números. La cifra sigue siendo lo dominante dentro de la
 * tarjeta, pero la tarjeta ya no domina la página.
 *
 * El color va en un punto de 6 px, no en el número ni en el fondo: seis cifras
 * de colores distintos compiten entre sí y ninguna destaca.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
}) {
  const dots = {
    neutral: "bg-ink-subtle",
    brand: "bg-brand-500",
    success: "bg-success-600",
    warning: "bg-warning-600",
    danger: "bg-danger-600",
    info: "bg-info-600",
  } as const;

  return (
    <div
      className={cn(
        "group flex h-full flex-col gap-1 rounded-xl border border-border bg-surface px-3.5 py-3",
        "shadow-[var(--shadow-card)] transition-colors duration-200",
        "hover:border-black/[0.10]",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} />
        <span className="truncate text-[10.5px] font-semibold tracking-[0.03em] text-ink-muted uppercase">
          {label}
        </span>
      </span>

      <p className="text-[21px] leading-none font-semibold tracking-[-0.025em] text-ink">{value}</p>

      {hint && <p className="truncate text-[10.5px] leading-tight text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * §17 · Indicador del resumen operacional.
 *
 * La cifra es el elemento dominante, en cifras proporcionales (las tabulares
 * son para columnas alineadas, no para un número de exhibición). El color se
 * aplica al número, no al fondo — seis tarjetas de color pleno compiten entre
 * sí y ninguna destaca.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
  loading?: boolean;
}) {
  const tones = {
    neutral: { value: "text-ink", chip: "bg-black/[0.05] text-ink-muted" },
    brand: { value: "text-brand-700", chip: "bg-brand-50 text-brand-600" },
    success: { value: "text-success-700", chip: "bg-success-50 text-success-600" },
    warning: { value: "text-warning-700", chip: "bg-warning-50 text-warning-600" },
    danger: { value: "text-danger-700", chip: "bg-danger-50 text-danger-600" },
    info: { value: "text-info-700", chip: "bg-info-50 text-info-600" },
  } as const;

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between gap-4 overflow-hidden",
        "rounded-2xl border border-border bg-surface p-5",
        "shadow-[var(--shadow-card)]",
        "transition-all duration-300 ease-[var(--ease-emphasis)]",
        "hover:-translate-y-0.5 hover:border-black/[0.10] hover:shadow-[var(--shadow-raised)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[0.04em] text-ink-muted uppercase">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
              tones[tone].chip,
            )}
          >
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="skeleton h-9 w-20 rounded-lg" />
      ) : (
        <p
          className={cn(
            "text-[2.125rem] leading-none font-semibold tracking-[-0.03em]",
            tones[tone].value,
          )}
        >
          {value}
        </p>
      )}

      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
