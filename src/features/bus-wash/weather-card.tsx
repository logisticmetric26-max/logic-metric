import { CloudRain, Sun, CloudDrizzle } from "lucide-react";
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
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="text-[10.5px] font-semibold tracking-[0.05em] text-ink-subtle uppercase">
        Semana
      </span>

      {days.map((day) => {
        const esHoy = day.date === today;
        const Icono = day.discouragesBodyWash ? CloudRain : day.rainChance >= 30 ? CloudDrizzle : Sun;

        return (
          <span
            key={day.date}
            title={`${day.rainChance}% · ${day.rainMm.toFixed(1)} mm · ${day.minTemp}°/${day.maxTemp}°${day.discouragesBodyWash ? " · no lavar carrocería" : ""}`}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] whitespace-nowrap",
              day.discouragesBodyWash ? "bg-info-50 text-info-700" : "text-ink-secondary",
              esHoy && "ring-1 ring-brand-200",
            )}
          >
            <Icono className="size-3.5 shrink-0" aria-hidden />
            <span className={cn("font-medium", esHoy && "text-brand-700")}>{day.label}</span>
            <span className="tabular-nums text-ink-muted">{day.rainChance}%</span>
          </span>
        );
      })}

      <span className="ml-auto text-[11px] text-ink-subtle">
        {conLluvia.length === 0
          ? "Sin lluvia prevista"
          : `${conLluvia.length} ${conLluvia.length === 1 ? "día" : "días"} sin carrocería · B&M igual`}
      </span>
    </div>
  );
}
