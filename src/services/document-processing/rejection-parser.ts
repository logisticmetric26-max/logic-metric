import type { DetectedRejection } from "./types";

/**
 * §25 · Extracción de motivos de rechazo por reglas estructurales.
 *
 * QUÉ HACE Y QUÉ NO
 * -----------------
 * No entiende el documento: reconoce su ESTRUCTURA. Cubre los dos formatos
 * reales de los informes de planta:
 *
 *   A · LISTA ENUMERADA — «1. Luces defectuosas», «a) …», viñetas, códigos
 *       jerárquicos como «4.2.1», dentro de una sección de rechazos.
 *
 *   B · TABLA DE RESULTADOS — el formato de los certificados de revisión
 *       técnica chilenos: bajo OBSERVACIONES, una tabla Nombre/Medido/Norma/
 *       Resultado donde cada defecto es una línea que TERMINA en «Rechazado»
 *       o «Pendiente».
 *
 * Por eso TODO lo que devuelve queda marcado `requires_review`: es una
 * propuesta para que una persona la confirme, nunca un dato en firme. La
 * confianza se acota deliberadamente por debajo del umbral de «alta»: el
 * sistema no puede afirmar que interpretó bien lo que no comprende.
 *
 * Nunca inventa contenido: cada motivo sale literalmente de una línea del
 * documento, que se conserva en `source_text` para poder auditarlo.
 *
 * Si el informe usa un formato que estas reglas no reconocen, devuelve una
 * lista vacía y el usuario registra los motivos a mano. Preferimos no proponer
 * nada antes que proponer basura.
 */

/** Encabezados que abren la sección de rechazos (estrategia A). */
const SECTION_START = [
  "MOTIVO DE RECHAZO",
  "MOTIVOS DE RECHAZO",
  "CAUSAL DE RECHAZO",
  "CAUSALES DE RECHAZO",
  "MOTIVO DEL RECHAZO",
  "RECHAZOS",
  "RECHAZO",
  "DEFECTOS",
  "DEFECTO",
  "DEFICIENCIAS",
  "DEFICIENCIA",
  "FALLAS",
  "NO CONFORMIDADES",
  "OBSERVACIONES",
  "OBSERVACION",
];

/** Encabezados que cierran la sección: a partir de aquí ya no hay motivos. */
const SECTION_END = [
  "FIRMA",
  "TIMBRE",
  "INSPECTOR",
  "RESPONSABLE",
  "PROXIMA REVISION",
  "VIGENCIA",
  "VALIDEZ",
  "NOMBRE Y FIRMA",
  "DECLARACION",
];

/** Líneas de cabecera del formulario que nunca son un motivo. */
const FIELD_PREFIXES = [
  "PPU",
  "PATENTE",
  "PLACA",
  "FECHA",
  "HORA",
  "PLANTA",
  "REVISOR",
  "PROPIETARIO",
  "MARCA",
  "MODELO",
  "ANO",
  "CHASIS",
  "MOTOR",
  "TIPO",
  "SERVICIO",
  "FOLIO",
  "GUIA",
  "CERTIFICADO",
  "NUMERO",
];

/**
 * Texto repetido de los certificados que jamás es un motivo, aunque aparezca
 * dentro de la sección de observaciones.
 */
const BOILERPLATE_PREFIXES = [
  "CERTIFICO",
  "ESTE CERTIFICADO",
  "SEGUNDA REVISION",
  "SU VEHICULO",
  "COPIA CLIENTE",
  "SCANNED",
  "CAMSCANNER",
  "NOMBRE MEDIDO",
  "RESULTADO",
];

/** Palabras de estado o de cabecera de tabla: solas no describen un defecto. */
const STATUS_WORDS = new Set([
  "APROBADO",
  "APROBADA",
  "RECHAZADO",
  "RECHAZADA",
  "PENDIENTE",
  "RESULTADO",
  "NOMBRE",
  "MEDIDO",
  "NORMA",
]);

/** Resultados que marcan una fila de la tabla de defectos (estrategia B). */
const RESULT_WORDS = new Set(["RECHAZADO", "RECHAZADA", "PENDIENTE"]);

/** Patrones de enumeración: `1.` · `1)` · `a)` · `-` · `4.2.1` */
const ENUMERATION =
  /^\s*(?:(\d{1,3})\s*[.)\-–]|([a-zA-Z])\s*[.)]|[-–•*·▪]|([A-Z]?\d+(?:\.\d+){1,3}))\s+(.{3,})$/;

/** Sin acentos y en mayúsculas: el OCR pierde tildes con frecuencia. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function isSectionStart(line: string): boolean {
  const normalized = normalize(line);
  return SECTION_START.some(
    (header) => normalized.startsWith(header) || normalized.includes(`${header}:`),
  );
}

function isSectionEnd(line: string): boolean {
  const normalized = normalize(line);
  return SECTION_END.some((header) => normalized.startsWith(header));
}

function isFormField(line: string): boolean {
  const normalized = normalize(line);
  // `ETIQUETA: valor` con etiqueta conocida
  if (!/^[A-ZÑ0-9º°.\s]{2,24}:/.test(normalized)) return false;
  return FIELD_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Descarta ruido de OCR: líneas sin apenas letras. */
function looksLikeProse(value: string): boolean {
  const letters = (value.match(/[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/g) ?? []).length;
  return letters >= 4 && letters / value.length >= 0.4;
}

/**
 * Limpia los artefactos que el escáner añade al comienzo de una fila de tabla:
 * corchetes y barras del borde de la celda («[Alineacion…», «|Supera…») y la
 * letra fantasma que el OCR pega a la primera palabra («JAlineacion», «INo»).
 * El original queda intacto en `source_text`.
 */
function cleanArtifacts(value: string): string {
  let cleaned = value.replace(/^[[\]|¡!/\\*_—–-]+\s*/, "").trim();

  if (/^[JIl][A-ZÁÉÍÓÚÑ]/.test(cleaned)) {
    cleaned = cleaned.slice(1);
  }

  return cleaned.trim();
}

/** El nombre extraído no puede ser texto legal ni cabecera de la tabla. */
function isNoiseName(name: string): boolean {
  const normalized = normalize(name);

  if (BOILERPLATE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;

  // Compuesto sólo por palabras de estado («APROBADO RECHAZADO»): es la
  // cabecera de la tabla de estado mecánico, no un defecto.
  const words = normalized.replace(/[^A-ZÑ ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((word) => STATUS_WORDS.has(word) || word.length <= 1)) {
    return true;
  }

  return false;
}

/**
 * Estrategia B · fila de la tabla de resultados.
 *
 * «Neumatico corte compromete tela …  Rechazado»  →  defecto rechazado
 * «Alineacion Luces bajas foco derecho  Pendiente» →  medición pendiente
 *
 * La fila vale si, quitando el resultado final, queda un nombre de defecto con
 * aspecto de prosa. Cabeceras, sellos («RECHAZADO» solo) y texto legal quedan
 * excluidos.
 */
function matchResultRow(line: string): { description: string; pending: boolean } | null {
  const words = line.trim().split(/\s+/);
  if (words.length < 2) return null;

  const lastWord = normalize(words[words.length - 1]).replace(/[^A-ZÑ]/g, "");
  if (!RESULT_WORDS.has(lastWord)) return null;

  const rawName = words.slice(0, -1).join(" ").replace(/[\s.:|·]+$/, "");
  const name = cleanArtifacts(rawName);

  if (name.length < 8 || name.length > 1000) return null;
  if (!looksLikeProse(name)) return null;
  if (isNoiseName(name)) return null;

  return {
    // «(pendiente)» viene del propio documento: es su columna Resultado
    description: lastWord === "PENDIENTE" ? `${name} (pendiente)` : name,
    pending: lastWord === "PENDIENTE",
  };
}

interface ParsedItem {
  description: string;
  source_text: string;
  page_number: number | null;
}

/**
 * Extrae los motivos de un texto con marcas de página.
 *
 * @param pages texto por página, en orden
 */
export function parseRejections(pages: { page_number: number; text: string }[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  const seen = new Set<string>();

  const add = (item: ParsedItem) => {
    const description = item.description.replace(/\s+/g, " ").trim();
    if (description.length < 8 || description.length > 1000) return;
    if (!looksLikeProse(description)) return;
    if (isNoiseName(description)) return;

    const key = normalize(description);
    if (seen.has(key)) return;
    seen.add(key);

    items.push({ ...item, description });
  };

  for (const page of pages) {
    const lines = page.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Estrategia A: enumeraciones dentro de una sección de rechazos. Sin
    // encabezado no se extraen enumeraciones: por todo el documento darían
    // falsos positivos con las cabeceras del formulario.
    let insideSection = false;
    let current: ParsedItem | null = null;

    const flush = () => {
      if (current) add(current);
      current = null;
    };

    for (const line of lines) {
      // Estrategia B: las filas «… Rechazado / Pendiente» son tan específicas
      // que se aceptan en cualquier parte del documento — el encabezado
      // OBSERVACIONES puede venir ilegible en un escaneo y no por eso hay que
      // perder la tabla completa.
      const row = matchResultRow(line);
      if (row) {
        flush();
        add({ description: row.description, source_text: line, page_number: page.page_number });
        continue;
      }

      if (isSectionEnd(line)) {
        flush();
        insideSection = false;
        continue;
      }

      if (isSectionStart(line)) {
        flush();
        insideSection = true;

        // El encabezado puede traer el primer motivo en la misma línea:
        // «MOTIVOS DE RECHAZO: Luces defectuosas»
        const inlineValue = line.slice(line.indexOf(":") + 1).trim();
        if (line.includes(":") && inlineValue.length >= 8 && looksLikeProse(inlineValue)) {
          add({ description: inlineValue, source_text: line, page_number: page.page_number });
        }
        continue;
      }

      if (!insideSection) continue;
      if (isFormField(line)) continue;

      const match = ENUMERATION.exec(line);

      if (match) {
        flush();
        current = {
          description: match[4].trim(),
          source_text: line,
          page_number: page.page_number,
        };
        continue;
      }

      // Línea sin enumeración dentro de la sección: es la continuación del
      // motivo anterior, que venía partido por el ancho de la hoja.
      //
      // La comprobación de «todo mayúsculas» va contra la línea ORIGINAL, no
      // contra la normalizada: normalizar pasa todo a mayúsculas, así que
      // comprobarlo después daría siempre verdadero y nunca se uniría nada.
      const looksLikeHeading = /^[^a-záéíóúñü]{6,}$/.test(line);

      if (current && line.length > 2 && !looksLikeHeading) {
        current.description += ` ${line}`;
        current.source_text += `\n${line}`;
      }
    }

    flush();
  }

  return items;
}

/**
 * Convierte los motivos detectados al formato del dominio.
 *
 * La confianza se limita a 0,5: por buena que sea la lectura, una extracción
 * por reglas no puede afirmar que interpretó correctamente el documento. Ese
 * techo es lo que mantiene honesta la señal que ve el usuario.
 */
export function toDetectedRejections(
  items: ParsedItem[],
  ocrConfidenceByPage: Map<number, number>,
): DetectedRejection[] {
  return items.map((item) => {
    const ocrConfidence =
      item.page_number !== null ? (ocrConfidenceByPage.get(item.page_number) ?? 1) : 1;

    return {
      description: item.description,
      source_text: item.source_text,
      page_number: item.page_number,
      confidence: Math.round(Math.min(0.5, 0.5 * ocrConfidence) * 1000) / 1000,
      // §25 · una extracción por reglas siempre requiere confirmación humana
      requires_review: true,
    };
  });
}
