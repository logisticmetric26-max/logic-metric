import "server-only";

/**
 * §Lavado · Proyección de lluvia de lunes a viernes.
 *
 * Sirve para planificar la semana: si el miércoles llueve, ese día se barre y
 * se mopea igual pero no se lava carrocería, así que conviene adelantar lavados
 * al martes en lugar de descubrirlo el propio miércoles a las siete.
 *
 * PROVEEDOR
 * ---------
 * Open-Meteo: gratuito, sin cuenta, sin clave y sin límite práctico para una
 * consulta al día. Se descartó cualquier servicio con API key porque obligaría
 * a gestionar un secreto más en el despliegue para un dato meteorológico
 * público.
 *
 * Si la petición falla —red caída, servicio en mantenimiento— se devuelve
 * `null` y la pantalla oculta la tarjeta. El pronóstico es una ayuda, no un
 * requisito: nunca debe impedir registrar el aseo del día.
 */

/** Región Metropolitana. Los terminales están todos en el Gran Santiago. */
const LATITUDE = -33.45;
const LONGITUDE = -70.66;
const TIME_ZONE = "America/Santiago";

export interface WeatherDay {
  /** `yyyy-MM-dd` */
  date: string;
  /** `lun`, `mar`… */
  label: string;
  /** Milímetros de lluvia previstos. */
  rainMm: number;
  /** Probabilidad de precipitación, 0–100. */
  rainChance: number;
  maxTemp: number;
  minTemp: number;
  /** ¿Desaconseja lavar carrocería? */
  discouragesBodyWash: boolean;
}

/**
 * Umbral para desaconsejar el lavado.
 *
 * Dos caminos, porque un solo criterio se equivoca en un sentido o en el otro:
 *
 *   · 1 mm o más → llueve de verdad, da igual la probabilidad.
 *   · 60 % o más con al menos 0,2 mm → chubasco breve pero suficiente para
 *     volver a ensuciar un bus recién lavado.
 *
 * Exigir ambas cosas a la vez dejaba fuera un día al 95 % con 0,5 mm, que es
 * exactamente un día en que no se lava.
 */
const RAIN_CHANCE_THRESHOLD = 60;
const RAIN_MM_LIKELY = 0.2;
const RAIN_MM_CERTAIN = 1;

const DAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

/**
 * Pronóstico de los próximos siete días, recortado a lunes–viernes.
 *
 * Se cachea una hora: el pronóstico diario no cambia por minutos y así una
 * pantalla que se recarga cada dos minutos no dispara una petición cada vez.
 */
export async function fetchWeekWeather(): Promise<WeatherDay[] | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
    `&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(TIME_ZONE)}&forecast_days=7`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OpenMeteoResponse;
    const daily = payload.daily;
    if (!daily?.time?.length) return null;

    return daily.time
      .map((date, index) => {
        const rainMm = daily.precipitation_sum?.[index] ?? 0;
        const rainChance = daily.precipitation_probability_max?.[index] ?? 0;

        return {
          date,
          label: DAY_LABELS[dayOfWeek(date)],
          rainMm,
          rainChance,
          maxTemp: Math.round(daily.temperature_2m_max?.[index] ?? 0),
          minTemp: Math.round(daily.temperature_2m_min?.[index] ?? 0),
          discouragesBodyWash:
            rainMm >= RAIN_MM_CERTAIN ||
            (rainChance >= RAIN_CHANCE_THRESHOLD && rainMm >= RAIN_MM_LIKELY),
        };
      })
      // Sólo días hábiles: el aseo de flota se planifica de lunes a viernes
      .filter((day) => {
        const weekday = dayOfWeek(day.date);
        return weekday >= 1 && weekday <= 5;
      })
      .slice(0, 5);
  } catch {
    // El pronóstico es una ayuda, no un requisito: si falla, la tarjeta no se
    // muestra y el registro del día sigue funcionando igual.
    return null;
  }
}

/**
 * Día de la semana de una fecha `yyyy-MM-dd`, sin pasar por `new Date(cadena)`,
 * que la interpreta como UTC y puede devolver el día anterior en Chile.
 */
function dayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12).getDay();
}
