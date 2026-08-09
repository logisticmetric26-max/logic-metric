import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabla responsive (§4).
 *
 * En escritorio se muestra como tabla. En móvil, cada fila se presenta como
 * tarjeta mediante `<CardList>` — no como una tabla comprimida ni con scroll
 * horizontal de página.
 *
 * Cuando una tabla debe conservarse en pantallas medianas, `TableScroller`
 * confina el desplazamiento dentro del contenedor, nunca al `body`.
 */

export function TableScroller({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-area w-full overflow-x-auto", className)}>
      <div className="min-w-full align-middle">{children}</div>
    </div>
  );
}

/**
 * La tabla trae su propio material opaco.
 *
 * Así una tarjeta translúcida puede contener una tabla sin que el fondo
 * ambiental se cuele entre veinticinco renglones: el cristal se queda en el
 * marco y los datos se leen sobre superficie sólida. Evita además tener que
 * acordarse de marcar como opaca cada tarjeta que contenga una tabla.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn("w-full border-collapse bg-surface text-sm", className)}>{children}</table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border bg-surface-subtle/70">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  className,
  align = "left",
  width,
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  width?: string;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        "px-5 py-3 text-[11px] font-semibold tracking-[0.045em] text-ink-muted uppercase whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors duration-150 hover:bg-fill-subtle",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-5 py-3.5 align-middle text-[13px] text-ink",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

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
        "space-y-3 bg-surface-subtle/35 p-3 sm:p-4 [&>a]:block [&>a]:rounded-xl",
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
      className={cn(
        "group/row relative overflow-visible rounded-xl bg-surface shadow-[var(--shadow-flat)] ring-1 ring-border",
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

/**
 * Las tarjetas son el formato predeterminado en todos los anchos.
 *
 * `table` se conserva temporalmente como prop opcional para que módulos
 * externos antiguos no fallen al actualizar, pero ya no se renderiza.
 */
export function ResponsiveTable({ cards }: { table?: ReactNode; cards: ReactNode }) {
  return <div>{cards}</div>;
}

/** Par etiqueta/valor para vistas de detalle. */
export function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-semibold tracking-[0.045em] text-ink-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 text-[13px] break-words text-ink">{value ?? "—"}</dd>
    </div>
  );
}
