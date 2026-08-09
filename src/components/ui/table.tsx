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

/** Contenedor de las tarjetas que reemplazan la tabla en móvil. */
export function CardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border", className)}>{children}</div>;
}

export function RowCard({
  title,
  subtitle,
  badge,
  actions,
  fields,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  fields?: { label: string; value: ReactNode }[];
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "px-4 py-4 transition-colors",
        onClick && "cursor-pointer active:bg-fill-subtle",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {actions}
        </div>
      </div>

      {fields && fields.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-[10px] font-semibold tracking-[0.045em] text-ink-subtle uppercase">
                {field.label}
              </dt>
              <dd className="truncate text-[13px] text-ink-secondary">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Muestra `table` desde `lg` y `cards` por debajo.
 * Un único punto de corte para todos los listados de la aplicación.
 */
export function ResponsiveTable({ table, cards }: { table: ReactNode; cards: ReactNode }) {
  return (
    <>
      <div className="hidden lg:block">
        <TableScroller>{table}</TableScroller>
      </div>
      <div className="lg:hidden">{cards}</div>
    </>
  );
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
