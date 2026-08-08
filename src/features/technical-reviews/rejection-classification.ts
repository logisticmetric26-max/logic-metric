/**
 * Clasificación de motivos de rechazo para análisis operacional.
 *
 * Dos dimensiones sobre el texto del motivo:
 *
 *   ÁREA       · quién resuelve el hallazgo.
 *                LOGÍSTICA: extintor, norma gráfica, placa patente y limpieza.
 *                MANTENCIÓN: todo lo demás (regla de negocio definida por
 *                operaciones, no una heurística).
 *
 *   COMPONENTE · qué parte del bus está comprometida (luces, neumáticos,
 *                escape…), para ver dónde se concentran los rechazos.
 *
 * La clasificación es por palabras clave sobre el texto confirmado por el
 * usuario. Un motivo que no calza con ningún componente cae en «Otros» — nunca
 * se descarta ni se adivina.
 */

export type RejectionArea = "MANTENCION" | "LOGISTICA";

export const AREA_LABELS: Record<RejectionArea, string> = {
  MANTENCION: "Mantención",
  LOGISTICA: "Logística",
};

export interface RejectionComponent {
  code: string;
  label: string;
  area: RejectionArea;
}

/** Sin acentos, en mayúsculas y con espacios colapsados. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Catálogo de componentes con sus palabras clave.
 *
 * EL ORDEN ES SIGNIFICATIVO: gana la primera coincidencia.
 *
 *   · Logística primero: «La PPU grabada en vidrios…» debe clasificar como
 *     Placa patente, no como Vidrios.
 *   · Ruido antes que Escape: «ruido en posición escape» es una medición de
 *     ruido, no un defecto del tubo.
 *   · Emisiones antes que Escape por la misma razón (opacidad).
 */
const COMPONENT_RULES: Array<RejectionComponent & { keywords: string[] }> = [
  // ── Logística ─────────────────────────────────────────────────────────────
  {
    code: "EXTINTOR",
    label: "Extintor",
    area: "LOGISTICA",
    keywords: ["EXTINTOR"],
  },
  {
    code: "PLACA_PATENTE",
    label: "Placa patente",
    area: "LOGISTICA",
    keywords: ["PLACA", "PATENTE", "PPU"],
  },
  {
    code: "NORMA_GRAFICA",
    label: "Norma gráfica",
    area: "LOGISTICA",
    keywords: ["FRANJA", "REFLECTANTE", "ROTUL", "LETRERO", "NORMA GRAFICA", "ADHESIVO"],
  },
  {
    code: "LIMPIEZA",
    label: "Limpieza",
    area: "LOGISTICA",
    keywords: ["LIMPIEZA", "ASEO", "SUCIED", "SUCIO", "HIGIENE"],
  },

  // ── Mantención ────────────────────────────────────────────────────────────
  {
    code: "LUCES",
    label: "Luces y sistema eléctrico",
    area: "MANTENCION",
    keywords: [
      "LUCES",
      "LUZ ",
      "FOCO",
      "NEBLINERO",
      "INTERMITENTE",
      "LENTE",
      "MICA",
      "ENCIENDE",
      "INTERRUPT",
      "ELECTRIC",
    ],
  },
  {
    code: "FRENOS",
    label: "Frenos",
    area: "MANTENCION",
    keywords: ["FRENO"],
  },
  {
    code: "DIRECCION",
    label: "Dirección",
    area: "MANTENCION",
    keywords: ["DIRECCION"],
  },
  {
    code: "SUSPENSION",
    label: "Suspensión",
    area: "MANTENCION",
    keywords: ["SUSPENSION", "AMORTIGUADOR", "BALLESTA", "RESORTE"],
  },
  {
    code: "NEUMATICOS",
    label: "Neumáticos y ruedas",
    area: "MANTENCION",
    keywords: ["NEUMATIC", "LLANTA", "RUEDA"],
  },
  {
    code: "RUIDO",
    label: "Ruido",
    area: "MANTENCION",
    keywords: ["RUIDO"],
  },
  {
    code: "EMISIONES",
    label: "Emisiones y opacidad",
    area: "MANTENCION",
    keywords: ["OPACIDAD", "EMISION", "GASES", "HUMO", "DISPERSION"],
  },
  {
    code: "ESCAPE",
    label: "Sistema de escape",
    area: "MANTENCION",
    keywords: ["ESCAPE", "SILENCIADOR"],
  },
  {
    code: "CINTURONES",
    label: "Cinturones y asientos",
    area: "MANTENCION",
    keywords: ["CINTURON", "ASIENTO"],
  },
  {
    code: "CARROCERIA",
    label: "Carrocería y cabina",
    // «CARROS» cubre la lectura OCR habitual de «Carroc.»
    area: "MANTENCION",
    keywords: ["CARROC", "CARROS", "BISAGRA", "PUERTA", "CUBRE MOTOR", "PISADERA", "GOMAS"],
  },
  {
    code: "VIDRIOS",
    label: "Vidrios y espejos",
    area: "MANTENCION",
    keywords: ["PARABRISAS", "VIDRIO", "ESPEJO", "TRIZAD"],
  },
  {
    code: "CHASIS",
    label: "Chasis",
    area: "MANTENCION",
    keywords: ["CHASIS", "VIN"],
  },
  {
    code: "INSTRUMENTOS",
    label: "Instrumentos",
    area: "MANTENCION",
    keywords: ["VELOCIMETRO", "TACOMETRO", "ODOMETRO", "INSTRUMENTO"],
  },
];

const OTHER_COMPONENT: RejectionComponent = {
  code: "OTROS",
  label: "Otros",
  area: "MANTENCION",
};

/** Clasifica un motivo por componente y área. Nunca devuelve `null`. */
export function classifyRejection(description: string): RejectionComponent {
  const normalized = normalize(description);

  for (const rule of COMPONENT_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return { code: rule.code, label: rule.label, area: rule.area };
    }
  }

  return OTHER_COMPONENT;
}

/**
 * Clave de agrupación para «rechazos más comunes».
 *
 * El mismo defecto puede venir con diferencias de OCR entre certificados
 * (mayúsculas, tildes, el sufijo «(pendiente)», signos sueltos al inicio). La
 * clave las neutraliza para que cuenten como un solo motivo; la etiqueta
 * visible conserva el texto tal como se confirmó.
 */
export function reasonKey(description: string): string {
  return normalize(description)
    .replace(/\s*\(PENDIENTE\)\s*$/, "")
    .replace(/^[^A-ZÑ0-9]+/, "")
    .trim();
}
