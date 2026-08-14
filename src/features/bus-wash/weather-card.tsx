import { CloudRain, Sun, CloudDrizzle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WeatherDay } from "@/features/bus-wash/weather";

/**
 * §Lavado · Proyección de la semana.
 *
 * Para planificar: si el miércoles llueve, ese día se barre y se mopea igual
 * pero no se lava carrocería, así que conviene adelantar lavados al martes en
 * lugar de descubrirlo el miércoles a las siete de la mañana.
 *
 * No bloquea nada. Es una previsión, y las previsiones fallan.
 */
export function BusWashWeatherCard({ days, today }: { days: WeatherDay[]; today: string }) {
  const conLluvia = days.filter((day) => day.discouragesBodyWash);

  return (
    <Card solid className="mb-4">
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            Proyección de la semana
          </h3>
          <p className="text-[11.5px] text-ink-muted">
            {conLluvia.length === 0
              ? "Sin lluvia prevista: se puede lavar carrocería toda la semana."
              : `${conLluvia.length} ${conLluvia.length === 1 ? "día con lluvia prevista" : "días con lluvia prevista"}: adelante lavados a los días secos.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {days.map((day) => {
            const esHoy = day.date === today;
            const Icono = day.discouragesBodyWash
              ? CloudRain
              : day.rainChance >= 30
                ? CloudDrizzle
                : Sun;

            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-md border px-3 py-2.5 transition-colors",
                  day.discouragesBodyWash
                    ? "border-info-200 bg-info-50"
                    : "border-border bg-surface-subtle",
                  esHoy && "ring-2 ring-brand-200",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-semibold tracking-[0.03em] uppercase",
                      esHoy ? "text-brand-700" : "text-ink-muted",
                    )}
                  >
                    {day.label}
                    {esHoy && " · hoy"}
                  </span>
                  <Icono
                    className={cn(
                      "size-4 shrink-0",
                      day.discouragesBodyWash ? "text-info-600" : "text-ink-subtle",
                    )}
                    aria-hidden
                  />
                </div>

                <p className="mt-1.5 text-[15px] leading-none font-semibold text-ink tabular-nums">
                  {day.rainChance}%
                </p>
                <p className="mt-1 text-[10.5px] text-ink-subtle tabular-nums">
                  {day.rainMm.toFixed(1).replace(".", ",")} mm · {day.minTemp}°/{day.maxTemp}°
                </p>

                {day.discouragesBodyWash && (
                  <p className="mt-1.5 text-[10.5px] leading-tight font-medium text-info-700">
                    Sin carrocería · sí B&M
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] leading-snug text-ink-subtle">
          Es una previsión, no una orden: si el día amanece seco, lave igual. El barrido y mopeo se
          hace llueva o no.
        </p>
      </div>
    </Card>
  );
}
