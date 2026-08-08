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
}: {
  items: RankedBarItem[];
  maxItems?: number;
}) {
  const visible = items.slice(0, maxItems);
  const max = Math.max(...visible.map((item) => item.value), 1);
  const remainder = items.length - visible.length;

  return (
    <div className="flex flex-col gap-2.5">
      {visible.map((item, index) => (
        <div key={`${item.label}-${index}`} className="group" title={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] leading-snug text-ink-secondary">
              {item.label}
              {item.hint && <span className="ml-1.5 text-[11px] text-ink-subtle">{item.hint}</span>}
            </span>
            <span className="shrink-0 text-[12.5px] font-medium text-ink tabular-nums">
              {formatNumber(item.value)}
            </span>
          </div>

          {/* Pista: un paso bajo la superficie, recesiva */}
          <div className="h-[14px] w-full rounded-r-[4px] bg-black/[0.045]">
            <div
              className="h-full rounded-r-[4px] transition-[width] duration-500 ease-[var(--ease-emphasis)] group-hover:brightness-110"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                backgroundColor: item.area ? CHART_COLORS[item.area] : CHART_COLORS.MANTENCION,
              }}
            />
          </div>
        </div>
      ))}

      {remainder > 0 && (
        <p className="pt-0.5 text-[11px] text-ink-subtle">
          y {formatNumber(remainder)} motivo{remainder === 1 ? "" : "s"} más — el detalle completo
          está en la exportación a Excel.
        </p>
      )}
    </div>
  );
}

/**
 * Barra dividida Mantención / Logística.
 *
 * Parte-de-un-todo con dos categorías: una única barra apilada con separación
 * de 2 px en color de superficie, más las cifras y porcentajes en texto — el
 * color identifica, el texto informa.
 */
export function AreaSplitBar({
  mantencion,
  logistica,
}: {
  mantencion: number;
  logistica: number;
}) {
  const total = mantencion + logistica;

  if (total === 0) return null;

  const segments = (
    [
      { area: "MANTENCION" as const, value: mantencion },
      { area: "LOGISTICA" as const, value: logistica },
    ] satisfies { area: RejectionArea; value: number }[]
  ).filter((segment) => segment.value > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* gap-[2px]: la separación la hace la superficie, no un borde */}
      <div className="flex h-[22px] w-full gap-[2px] overflow-hidden rounded-[6px]">
        {segments.map((segment) => {
          const share = segment.value / total;
          return (
            <div
              key={segment.area}
              title={`${AREA_LABEL[segment.area]}: ${formatNumber(segment.value)} (${Math.round(share * 100)}%)`}
              className="flex h-full items-center justify-center transition-[filter] hover:brightness-110"
              style={{
                width: `${share * 100}%`,
                backgroundColor: CHART_COLORS[segment.area],
              }}
            >
              {/* Etiqueta interior sólo si cabe con holgura */}
              {share >= 0.14 && (
                <span className="px-2 text-[11px] font-semibold text-white">
                  {Math.round(share * 100)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["MANTENCION", "LOGISTICA"] as const).map((area) => {
          const value = area === "MANTENCION" ? mantencion : logistica;
          const share = total === 0 ? 0 : value / total;

          return (
            <div
              key={area}
              className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-subtle px-3.5 py-3"
            >
              <span
                aria-hidden
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CHART_COLORS[area] }}
              />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-ink-secondary">{AREA_LABEL[area]}</p>
                <p className="mt-0.5 text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">
                  {formatNumber(value)}
                  <span className="ml-1.5 text-[12px] font-normal text-ink-muted">
                    {Math.round(share * 100)}%
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Estado vacío coherente para las tarjetas de análisis. */
export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div aria-hidden className="flex items-end gap-1 opacity-40">
        <span className="h-3 w-1.5 rounded-t-[2px] bg-black/20" />
        <span className="h-5 w-1.5 rounded-t-[2px] bg-black/20" />
        <span className="h-2 w-1.5 rounded-t-[2px] bg-black/20" />
        <span className="h-4 w-1.5 rounded-t-[2px] bg-black/20" />
      </div>
      <p className="max-w-[16rem] text-[12.5px] leading-relaxed text-ink-muted">{message}</p>
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
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
