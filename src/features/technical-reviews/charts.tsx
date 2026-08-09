import type { RejectionArea } from "@/features/technical-reviews/rejection-classification";
import { formatNumber } from "@/lib/format";

/**
 * Gráficos del análisis de rechazos.
 *
 * Especificación aplicada (guía de visualización):
 *
 *   · Barras finas (≤24 px), extremo de dato redondeado (4 px), base recta.
 *   · Un ranking de una sola serie usa UN tono — nunca un degradado por valor.
 *   · Identidad por color sólo cuando las series SON el tema (área Mant/Log):
 *     2 categorías, azul/naranja, par validado por el verificador de paleta
 *     (ΔE 30,8 en visión con daltonismo).
 *   · Dos categorías parte-de-un-todo = barra dividida, no un donut de 2 gajos.
 *   · Separación entre segmentos con 2 px del color de superficie.
 *   · El texto usa tonos de texto, nunca el color de la serie; cifras tabulares
 *     sólo en columnas de números.
 *   · Leyenda siempre que hay ≥2 series; ninguna con una sola.
 *
 * Componentes presentacionales sin hooks: sirven igual desde servidor o cliente.
 */

/** Paleta de series, validada con el verificador (5/5 checks). */
export const CHART_COLORS: Record<RejectionArea, string> = {
  MANTENCION: "#0a6cff", // azul de marca · slot 1
  LOGISTICA: "#eb6834", // naranja · slot 2
};

const AREA_LABEL: Record<RejectionArea, string> = {
  MANTENCION: "Mantención",
  LOGISTICA: "Logística",
};

/** Leyenda estándar: punto de color + etiqueta en tono de texto. */
export function ChartLegend({ areas }: { areas: RejectionArea[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {areas.map((area) => (
        <span key={area} className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: CHART_COLORS[area] }}
          />
          {AREA_LABEL[area]}
        </span>
      ))}
    </div>
  );
}

export interface RankedBarItem {
  label: string;
  value: number;
  /** Área que colorea la barra. Sin ella, la serie única usa el tono 1. */
  area?: RejectionArea;
  /** Contexto adicional bajo la etiqueta (p. ej. el componente del motivo). */
  hint?: string;
}

/**
 * Ranking horizontal.
 *
 * Cada fila: etiqueta (recortada, con el texto completo en el tooltip nativo),
 * barra proporcional al máximo y valor en columna fija a la derecha — la
 * columna de valores hace además de vista de tabla: todos los números están
 * visibles sin depender del color.
 */
export function RankedBars({
  items,
  maxItems = 10,
  remainderNoun = "motivo",
}: {
  items: RankedBarItem[];
  maxItems?: number;
  /** Sustantivo del pie «y N … más». En singular. */
  remainderNoun?: string;
}) {
  const visible = items.slice(0, maxItems);
  const max = Math.max(...visible.map((item) => item.value), 1);
  const remainder = items.length - visible.length;

  return (
    <div className="flex flex-col gap-[7px]">
      {visible.map((item, index) => (
        <div key={`${item.label}-${index}`} className="group" title={item.label}>
          <div className="mb-[3px] flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[11.5px] leading-snug text-ink-secondary">
              {item.label}
              {item.hint && (
                <span className="ml-1.5 text-[10.5px] text-ink-subtle">{item.hint}</span>
              )}
            </span>
            <span className="shrink-0 text-[11.5px] font-medium text-ink tabular-nums">
              {formatNumber(item.value)}
            </span>
          </div>

          {/* Pista: un paso bajo la superficie, recesiva */}
          <div className="h-[8px] w-full rounded-r-[3px] bg-black/[0.045]">
            <div
              className="h-full rounded-r-[3px] transition-[width] duration-500 ease-[var(--ease-emphasis)] group-hover:brightness-110"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                backgroundColor: item.area ? CHART_COLORS[item.area] : CHART_COLORS.MANTENCION,
              }}
            />
          </div>
        </div>
      ))}

      {remainder > 0 && (
        <p className="pt-0.5 text-[10.5px] text-ink-subtle">
          y {formatNumber(remainder)} {remainderNoun}
          {remainder === 1 ? "" : "s"} más — el detalle completo está en el Excel.
        </p>
      )}
    </div>
  );
}

/** Colores de estado de vencimiento (§39). Ordenados de sano a crítico. */
export const EXPIRATION_COLORS = {
  VALID: "#0a6cff",
  EXPIRING_SOON: "#eb6834",
  EXPIRED: "#b42318",
  NO_RECORD: "#98a2b3",
} as const;

/**
 * Rampa de un solo tono para magnitudes ORDENADAS (días fuera de planta).
 *
 * Es una escala, no categorías: usar colores distintos sugeriría que «1 a 2
 * días» y «más de 7» son cosas diferentes en especie, cuando sólo difieren en
 * grado. Más oscuro = más tiempo fuera.
 */
export const AGING_RAMP = ["#c3dbff", "#7db0ff", "#2f7dff", "#0a4fbf"] as const;

export interface BarSegment {
  key: string;
  label: string;
  count: number;
  color: string;
}

/**
 * Barra segmentada compacta con su leyenda en cifras.
 *
 * Parte-de-un-todo con pocas categorías. La barra da la proporción de un
 * vistazo; la leyenda da el número exacto, porque un porcentaje sin el conteo
 * no sirve para actuar. Los segmentos se separan con 2 px del color de la
 * superficie, no con bordes.
 */
export function SegmentedBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const visible = segments.filter((segment) => segment.count > 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-[10px] w-full gap-[2px] overflow-hidden rounded-[5px] bg-black/[0.045]">
        {visible.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${formatNumber(segment.count)} de ${formatNumber(total)}`}
            className="h-full transition-[filter] hover:brightness-110"
            style={{
              width: `${(segment.count / Math.max(total, 1)) * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="size-[7px] shrink-0 translate-y-[-1px] rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-secondary">
              {segment.label}
            </span>
            <span className="shrink-0 text-[11.5px] font-medium text-ink tabular-nums">
              {formatNumber(segment.count)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface MonthlyColumn {
  label: string;
  approved: number;
  rejected: number;
}

/**
 * Columnas mensuales de revisiones cerradas.
 *
 * Dos series agrupadas (no apiladas): la pregunta es «¿cuántas se rechazaron
 * este mes frente al anterior?», y apilar obligaría a medir un segmento que no
 * arranca del cero. Se rotulan sólo el máximo y los meses: una cuadrícula
 * completa añadiría tinta sin añadir precisión a esta escala.
 */
export function MonthlyColumns({ months }: { months: MonthlyColumn[] }) {
  const max = Math.max(...months.map((month) => Math.max(month.approved, month.rejected)), 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-1 border-b border-border pb-1" style={{ height: 92 }}>
        {months.map((month) => (
          <div key={month.label} className="flex min-w-0 flex-1 items-end justify-center gap-[3px]">
            {(
              [
                { key: "approved", value: month.approved, color: CHART_COLORS.MANTENCION },
                { key: "rejected", value: month.rejected, color: CHART_COLORS.LOGISTICA },
              ] as const
            ).map((series) => (
              <div
                key={series.key}
                title={`${month.label} · ${series.key === "approved" ? "Aprobadas" : "Rechazadas"}: ${formatNumber(series.value)}`}
                className="w-[9px] rounded-t-[3px] transition-[height] duration-500 ease-[var(--ease-emphasis)] hover:brightness-110"
                style={{
                  height: series.value === 0 ? 2 : `${Math.max((series.value / max) * 100, 3)}%`,
                  backgroundColor: series.value === 0 ? "rgba(0,0,0,0.07)" : series.color,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        {months.map((month) => (
          <span
            key={month.label}
            className="min-w-0 flex-1 truncate text-center text-[10.5px] text-ink-subtle"
          >
            {month.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Leyenda de dos series arbitrarias (no áreas). */
export function SeriesLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Estado vacío coherente para las tarjetas de análisis. */
export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <div aria-hidden className="flex items-end gap-1 opacity-40">
        <span className="h-3 w-1.5 rounded-t-[2px] bg-black/20" />
        <span className="h-5 w-1.5 rounded-t-[2px] bg-black/20" />
        <span className="h-2 w-1.5 rounded-t-[2px] bg-black/20" />
        <span className="h-4 w-1.5 rounded-t-[2px] bg-black/20" />
      </div>
      <p className="max-w-[17rem] text-[11.5px] leading-relaxed text-ink-muted">{message}</p>
    </div>
  );
}

/** Cabecera de tarjeta de análisis: título + subtítulo + acción opcional. */
export function ChartCardHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
