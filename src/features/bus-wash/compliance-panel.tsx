import { CloudRain, Droplets, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FilterSelect } from "@/components/ui/filters";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { TerminalCompliance } from "@/features/bus-wash/compliance";

/**
 * §Lavado · Cumplimiento del día y selector de terminal.
 *
 * Va por encima del tablero de registro y responde lo que se pregunta al cerrar
 * el turno: cuánto llevamos y si llegamos a la meta, POR TERMINAL, porque la
 * meta se acuerda y se mide por terminal.
 *
 * B&M y carrocería aparecen separados a propósito. Un día de lluvia hunde
 * carrocería y no toca el barrido y mopeado; un único porcentaje promediado
 * escondería justo eso.
 */
export function BusWashCompliancePanel({
  terminals,
  compliance,
  targetPercent,
}: {
  terminals: { id: string; name: string }[];
  compliance: TerminalCompliance[];
  targetPercent: number;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* El selector sólo aparece con más de un terminal autorizado: con uno
          solo no hay nada que elegir y sería un control muerto. */}
      {terminals.length > 1 && (
        <Card solid>
          <div className="flex flex-wrap items-end gap-3 px-4 py-3.5 sm:px-5">
            <FilterSelect
              paramName="terminal"
              label="Terminal"
              allLabel="Todos mis terminales"
              options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))}
              className="w-full sm:w-72"
            />
            <p className="text-[11.5px] text-ink-muted">
              Los registros masivos y el cumplimiento se aplican al terminal seleccionado.
            </p>
          </div>
        </Card>
      )}

      {compliance.length === 0 ? null : (
        <div
          className={cn(
            "grid gap-3",
            compliance.length === 1 ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {compliance.map((terminal) => (
            <Card key={terminal.terminal_id} solid className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
                    {terminal.terminal_name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {formatNumber(terminal.fleet)} buses · meta {targetPercent}%
                  </p>
                </div>

                {terminal.rainReason && (
                  <span
                    title={terminal.rainReason}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-info-50 px-2 py-1 text-[10.5px] font-medium text-info-700"
                  >
                    <CloudRain className="size-3" aria-hidden />
                    Día de lluvia
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Meter label="B&M" metric={terminal.bm} />
                <Meter label="Carrocería" metric={terminal.bodyWash} />
              </div>

              {(terminal.inRepair > 0 || terminal.noWash > 0) && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5 text-[11px] text-ink-muted">
                  {terminal.inRepair > 0 && (
                    <span className="flex items-center gap-1">
                      <Wrench className="size-3" aria-hidden />
                      {formatNumber(terminal.inRepair)} en reparación
                    </span>
                  )}
                  {terminal.noWash > 0 && (
                    <span className="flex items-center gap-1">
                      <Droplets className="size-3" aria-hidden />
                      {formatNumber(terminal.noWash)} no se lavan
                    </span>
                  )}
                </div>
              )}

              {terminal.rainReason && (
                <p className="mt-2 text-[11px] leading-snug text-ink-secondary">
                  {terminal.rainReason}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barra de cumplimiento.
 *
 * El color sólo distingue «llega» de «no llega» a la meta; el número está
 * siempre escrito, así que el indicador se lee igual sin distinguir colores.
 */
function Meter({
  label,
  metric,
}: {
  label: string;
  metric: TerminalCompliance["bm"];
}) {
  const percent = metric.percent;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-secondary">{label}</span>
        <span className="text-[15px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
          {percent === null ? "—" : `${percent}%`}
        </span>
      </div>

      <div className="mt-1.5 h-[6px] w-full overflow-hidden rounded-full bg-fill-subtle">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-[var(--ease-emphasis)]",
            metric.meetsTarget === false ? "bg-warning-600" : "bg-success-600",
          )}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>

      <p className="mt-1 text-[10.5px] text-ink-subtle tabular-nums">
        {formatNumber(metric.done)} de {formatNumber(metric.expected)}
      </p>
    </div>
  );
}
