/**
 * Cumplimiento diario de aseo (SLA).
 *
 * Responde la pregunta con la que se cierra el turno: «¿llegamos a la meta hoy,
 * en este terminal?».
 *
 * DECISIONES QUE NO SON OBVIAS
 * ----------------------------
 * · Un bus en reparación NO cuenta como incumplimiento. No estaba disponible
 *   para asear, así que exigirlo castigaría al turno por algo ajeno. Sale del
 *   denominador, igual que en cualquier medición de disponibilidad.
 *
 * · Un bus marcado «no se lava» sí sale del denominador, pero se cuenta aparte:
 *   si un día la mitad de la flota aparece así, el indicador quedaría en 100 %
 *   sin que se haya lavado nada, y hay que poder verlo.
 *
 * · B&M y carrocería se miden POR SEPARADO. Un día de lluvia hunde carrocería
 *   pero no toca el barrido y mopeado, que se hace igual; promediarlos
 *   escondería justo la señal que interesa.
 *
 * Módulo puro: lo comparten la pantalla, la exportación y los tests.
 */

export interface WashRow {
  terminal_id: string;
  terminal_name: string;
  bm_completed: boolean;
  body_wash_completed: boolean;
  in_repair: boolean;
  no_wash: boolean;
}

export interface ComplianceMetric {
  /** Buses que cumplieron. */
  done: number;
  /** Buses exigibles: flota del terminal menos reparación y «no se lava». */
  expected: number;
  /** Porcentaje sobre los exigibles, o `null` si no había ninguno. */
  percent: number | null;
  /** ¿Alcanza la meta? `null` cuando no hay nada que medir. */
  meetsTarget: boolean | null;
}

export interface TerminalCompliance {
  terminal_id: string;
  terminal_name: string;
  /** Buses del terminal considerados (excluye los inactivos ya filtrados). */
  fleet: number;
  inRepair: number;
  noWash: number;
  bm: ComplianceMetric;
  bodyWash: ComplianceMetric;
  /** Justificación de lluvia registrada para ese terminal y fecha. */
  rainReason: string | null;
}

function metric(done: number, expected: number, targetPercent: number): ComplianceMetric {
  if (expected === 0) {
    return { done, expected, percent: null, meetsTarget: null };
  }

  const percent = Math.round((done / expected) * 100);
  return { done, expected, percent, meetsTarget: percent >= targetPercent };
}

/**
 * Cumplimiento por terminal.
 *
 * `rainReasons` mapea `terminal_id` a la justificación del día, si la hay.
 */
export function computeCompliance(
  rows: WashRow[],
  {
    targetPercent = 90,
    rainReasons = new Map<string, string>(),
  }: { targetPercent?: number; rainReasons?: Map<string, string> } = {},
): TerminalCompliance[] {
  const porTerminal = new Map<string, TerminalCompliance & { bmDone: number; bodyDone: number }>();

  for (const row of rows) {
    let entrada = porTerminal.get(row.terminal_id);

    if (!entrada) {
      entrada = {
        terminal_id: row.terminal_id,
        terminal_name: row.terminal_name,
        fleet: 0,
        inRepair: 0,
        noWash: 0,
        bmDone: 0,
        bodyDone: 0,
        bm: { done: 0, expected: 0, percent: null, meetsTarget: null },
        bodyWash: { done: 0, expected: 0, percent: null, meetsTarget: null },
        rainReason: rainReasons.get(row.terminal_id) ?? null,
      };
      porTerminal.set(row.terminal_id, entrada);
    }

    entrada.fleet += 1;

    // La reparación manda sobre «no se lava»: un bus en el taller no estaba
    // disponible, sea cual sea la otra marca.
    if (row.in_repair) {
      entrada.inRepair += 1;
      continue;
    }

    if (row.no_wash) {
      entrada.noWash += 1;
      continue;
    }

    if (row.bm_completed) entrada.bmDone += 1;
    if (row.body_wash_completed) entrada.bodyDone += 1;
  }

  return [...porTerminal.values()]
    .map((entrada) => {
      const exigibles = entrada.fleet - entrada.inRepair - entrada.noWash;

      return {
        terminal_id: entrada.terminal_id,
        terminal_name: entrada.terminal_name,
        fleet: entrada.fleet,
        inRepair: entrada.inRepair,
        noWash: entrada.noWash,
        bm: metric(entrada.bmDone, exigibles, targetPercent),
        bodyWash: metric(entrada.bodyDone, exigibles, targetPercent),
        rainReason: entrada.rainReason,
      };
    })
    .sort((a, b) => a.terminal_name.localeCompare(b.terminal_name, "es"));
}

/** Consolidado de todos los terminales mostrados, para la cifra de cabecera. */
export function totalCompliance(
  terminals: TerminalCompliance[],
  targetPercent = 90,
): { bm: ComplianceMetric; bodyWash: ComplianceMetric; fleet: number } {
  const suma = terminals.reduce(
    (acumulado, terminal) => ({
      fleet: acumulado.fleet + terminal.fleet,
      bmDone: acumulado.bmDone + terminal.bm.done,
      bmExpected: acumulado.bmExpected + terminal.bm.expected,
      bodyDone: acumulado.bodyDone + terminal.bodyWash.done,
      bodyExpected: acumulado.bodyExpected + terminal.bodyWash.expected,
    }),
    { fleet: 0, bmDone: 0, bmExpected: 0, bodyDone: 0, bodyExpected: 0 },
  );

  return {
    fleet: suma.fleet,
    bm: metric(suma.bmDone, suma.bmExpected, targetPercent),
    bodyWash: metric(suma.bodyDone, suma.bodyExpected, targetPercent),
  };
}
