"use client";

import { CloudRain, Printer, Sparkles, SprayCan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PendingBus {
  internal_number: string;
  ppu: string;
  terminal_name: string;
  zone: string | null;
}

/**
 * §Lavado · Hoja de pendientes en UNA sola página.
 *
 * Se sale a terreno con esta hoja, así que manda la densidad: los buses van en
 * columnas de PPU grande y número interno, que son los dos datos que se buscan
 * de un vistazo en un patio. Todo lo demás —logos, bordes, sombras— desaparece
 * al imprimir.
 *
 * CÓMO CABE EN UNA HOJA
 * ---------------------
 * El número de columnas se elige según cuántos buses hay: con pocos, tres
 * columnas anchas y cómodas; con muchos, hasta seis y tipografía más pequeña.
 * Una cuadrícula fija obligaría a una segunda página en cuanto la lista
 * creciera, y una segunda página se traspapela.
 */
export function PendingSheet({
  kind,
  dateLabel,
  terminalName,
  buses,
  rainReason,
}: {
  kind: "bm" | "carroceria";
  dateLabel: string;
  terminalName: string;
  buses: PendingBus[];
  rainReason: string | null;
}) {
  const esBm = kind === "bm";
  const total = buses.length;

  // Densidad adaptada al volumen: la hoja se ajusta a la lista, no al revés.
  const columnas = total <= 24 ? 3 : total <= 60 ? 4 : total <= 120 ? 5 : 6;
  const compacta = total > 60;

  return (
    <div className="mx-auto w-full max-w-[210mm] print:max-w-none">
      {/* Sólo en pantalla: el botón no debe salir impreso */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-[12.5px] text-ink-muted">
          Use <strong className="font-medium text-ink">Imprimir → Guardar como PDF</strong> para
          archivarla. Está ajustada a una sola hoja.
        </p>
        <Button size="sm" onClick={() => window.print()} icon={<Printer className="size-4" aria-hidden />}>
          Imprimir o guardar PDF
        </Button>
      </div>

      <article className="rounded-lg border border-border bg-surface p-6 print:rounded-none print:border-0 print:p-0">
        {/* Cabecera */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
              Pendiente de aseo
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-[22px] leading-none font-bold tracking-[-0.02em] text-ink">
              {esBm ? (
                <Sparkles className="size-5 shrink-0" aria-hidden />
              ) : (
                <SprayCan className="size-5 shrink-0" aria-hidden />
              )}
              {esBm ? "Barrido y mopeado" : "Lavado de carrocería"}
            </h1>
            <p className="mt-1.5 text-[12px] text-ink-secondary">
              {terminalName} · día de referencia {dateLabel}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[34px] leading-none font-bold tracking-[-0.04em] text-ink tabular-nums">
              {total}
            </p>
            <p className="text-[10.5px] font-medium tracking-[0.06em] text-ink-muted uppercase">
              {total === 1 ? "bus pendiente" : "buses pendientes"}
            </p>
          </div>
        </header>

        {/* Aviso de lluvia: es el respaldo de por qué no se lavó carrocería */}
        {!esBm && rainReason && (
          <p className="mt-3 flex items-start gap-2 border border-ink/15 bg-black/[0.03] px-3 py-2 text-[11.5px] text-ink-secondary print:bg-transparent">
            <CloudRain className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold text-ink">Día de lluvia registrado.</strong>{" "}
              {rainReason} — el lavado de carrocería no se exige para esta fecha.
            </span>
          </p>
        )}

        {total === 0 ? (
          <p className="py-16 text-center text-[13px] text-ink-muted">
            Sin pendientes: toda la flota quedó registrada en esta faena.
          </p>
        ) : (
          <ul
            className={cn(
              "mt-4 grid gap-x-4",
              compacta ? "gap-y-[3px]" : "gap-y-1.5",
              columnas === 3 && "grid-cols-3",
              columnas === 4 && "grid-cols-4",
              columnas === 5 && "grid-cols-5",
              columnas === 6 && "grid-cols-6",
            )}
          >
            {buses.map((bus) => (
              <li
                key={`${bus.internal_number}-${bus.ppu}`}
                className={cn(
                  "flex items-baseline justify-between gap-2 border-b border-ink/10",
                  compacta ? "py-[2px]" : "py-1",
                )}
              >
                {/* La PPU manda: es lo que se lee en el patio */}
                <span
                  className={cn(
                    "font-mono font-semibold tracking-tight text-ink",
                    compacta ? "text-[11px]" : "text-[13px]",
                  )}
                >
                  {bus.ppu}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-ink-muted tabular-nums",
                    compacta ? "text-[9.5px]" : "text-[11px]",
                  )}
                >
                  {bus.internal_number}
                </span>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-5 flex items-center justify-between border-t border-ink/15 pt-2 text-[9.5px] text-ink-muted">
          <span>
            {esBm
              ? "Barrido y mopeado: se realiza a toda la flota, todos los días."
              : "Lavado de carrocería: cada bus al menos una vez cada dos días."}
          </span>
          <span>Logic Metric</span>
        </footer>
      </article>
    </div>
  );
}
