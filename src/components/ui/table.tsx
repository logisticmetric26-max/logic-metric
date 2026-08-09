import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Listado responsive basado en tarjetas (§4).
 *
 * La tarjeta es la unidad de información en todos los anchos. Cambia su
 * distribución interna según el espacio disponible, pero nunca se convierte en
 * una tabla comprimida ni provoca desplazamiento horizontal.
 */

/**
 * Contenedor único de listados.
 *
 * Cada registro vive en su propia superficie para que el listado conserve la
 * misma lectura en escritorio, tablet y móvil. El espacio exterior separa
 * procesos; ya no se depende de divisores ni de una tabla alternativa.
 */
export function CardList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-3 bg-surface-subtle/35 p-3 last:rounded-b-lg sm:p-4 [&>a]:block [&>a]:rounded-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

type RowCardTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const ROW_CARD_TONES: Record<RowCardTone, { accent: string; icon: string }> = {
  neutral: { accent: "bg-ink-subtle", icon: "bg-fill-subtle text-ink-secondary ring-border" },
  brand: { accent: "bg-brand-600", icon: "bg-brand-50 text-brand-700 ring-brand-200" },
  success: { accent: "bg-success-600", icon: "bg-success-50 text-success-700 ring-success-200" },
  warning: { accent: "bg-warning-600", icon: "bg-warning-50 text-warning-700 ring-warning-200" },
  danger: { accent: "bg-danger-600", icon: "bg-danger-50 text-danger-700 ring-danger-200" },
  info: { accent: "bg-info-600", icon: "bg-info-50 text-info-700 ring-info-200" },
};

export function RowCard({
  title,
  subtitle,
  badge,
  actions,
  fields,
  icon,
  tone = "neutral",
  onClick,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  fields?: { label: string; value: ReactNode; icon?: ReactNode; className?: string }[];
  icon?: ReactNode;
  tone?: RowCardTone;
  onClick?: () => void;
  className?: string;
}) {
  const colors = ROW_CARD_TONES[tone];

  return (
    <div
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        "group/row relative overflow-visible rounded-xl bg-surface shadow-[var(--shadow-flat)] ring-1 ring-border focus-within:z-30",
        "transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-raised)] hover:ring-border-strong",
        onClick && "cursor-pointer active:translate-y-0 active:bg-fill-subtle",
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", colors.accent)} />

      <div className="grid min-w-0 gap-4 p-4 pl-5 sm:p-5 sm:pl-6 min-[1100px]:grid-cols-[minmax(11rem,0.85fr)_minmax(0,2fr)_auto] min-[1100px]:items-center min-[1100px]:gap-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                colors.icon,
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <div className="text-[14px] font-semibold tracking-[-0.012em] text-ink">{title}</div>
            {subtitle && (
              <div className="mt-1 min-w-0 truncate text-[11.5px] text-ink-muted">{subtitle}</div>
            )}
          </div>
        </div>

        {fields && fields.length > 0 ? (
          <dl
            className={cn(
              "grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4",
              "sm:[grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))] min-[1100px]:border-t-0 min-[1100px]:pt-0",
              !badge && !actions && "min-[1100px]:col-span-2",
            )}
          >
            {fields.map((field) => (
              <div key={field.label} className={cn("min-w-0", field.className)}>
                <dt className="flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.055em] text-ink-subtle uppercase">
                  {field.icon && <span className="shrink-0">{field.icon}</span>}
                  <span className="truncate">{field.label}</span>
                </dt>
                <dd className="mt-1 min-w-0 truncate text-[12.5px] font-medium text-ink-secondary">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {(badge || actions) && (
          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border pt-3 min-[1100px]:min-w-fit min-[1100px]:justify-end min-[1100px]:border-t-0 min-[1100px]:pt-0">
            {badge && <div className="min-w-0">{badge}</div>}
            {actions && <div className="ml-auto shrink-0">{actions}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Las tarjetas son el formato predeterminado en todos los anchos. */
export function ResponsiveTable({ cards }: { cards: ReactNode }) {
  return <div>{cards}</div>;
}
