/**
 * §62 · Verificación de que el documento corresponde al bus.
 *
 * Adjuntar el certificado de OTRO vehículo es un error fácil de cometer —los
 * archivos llegan juntos por correo y se llaman parecido— y caro de descubrir
 * después: queda un rechazo con la evidencia equivocada.
 *
 * ASIMETRÍA DELIBERADA
 * --------------------
 * Las dos preguntas se responden con criterios distintos, y ambos sesgados
 * hacia NO alertar:
 *
 *   «¿está la PPU del bus?»  → criterio PERMISIVO (tolera errores de OCR)
 *   «¿hay otra patente?»     → criterio ESTRICTO  (no acepta formas dudosas)
 *
 * Así, una lectura defectuosa tiende a producir silencio, no una falsa alarma.
 * Un aviso que salta cuando no debe se acaba ignorando — y entonces también se
 * ignora el aviso verdadero.
 *
 * El NOMBRE DEL ARCHIVO es la señal más fiable: no pasa por el OCR. Las plantas
 * suelen nombrar el archivo con la patente («LXWP83 RTG 19-01-26.pdf»), así que
 * se mira ahí además de en el contenido.
 */

/**
 * Todos los formatos de patente chilena tienen exactamente 6 caracteres:
 *
 *   LXWP83 · 4 letras + 2 dígitos (2007 en adelante)
 *   AB1234 · 2 letras + 4 dígitos (anterior)
 *   ABC123 · 3 letras + 3 dígitos (anterior)
 */
const PLATE_LENGTH = 6;

const STRICT_PATTERNS = [/^[A-Z]{4}\d{2}$/, /^[A-Z]{2}\d{4}$/, /^[A-Z]{3}\d{3}$/];

/**
 * Caracteres que el OCR confunde entre sí, unificados para comparar.
 * Sólo se usan al buscar la patente ESPERADA, nunca al enumerar candidatas:
 * aplicarlos en ambos sentidos haría que palabras corrientes («CHASIS»,
 * «FRENOS») parecieran patentes.
 */
const CONFUSABLE: Record<string, string> = {
  O: "0",
  Q: "0",
  I: "1",
  S: "5",
  B: "8",
  Z: "2",
  G: "6",
};

/** Palabras de 6 letras que podrían pasar el patrón estricto por casualidad. */
const NOT_PLATES = new Set(["CHASIS", "MEDIDO", "MOTORE", "SCANIA"]);

/** Mayúsculas, sin acentos ni separadores. */
export function normalizePlate(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Forma canónica tolerante a las confusiones típicas del OCR. */
export function canonicalPlate(value: string): string {
  return normalizePlate(value)
    .split("")
    .map((character) => CONFUSABLE[character] ?? character)
    .join("");
}

/**
 * Patentes con forma INDISCUTIBLE presentes en el texto.
 *
 * Criterio estricto a propósito: cada candidata que devuelve puede disparar una
 * alerta, así que debe estar bien fundada.
 */
export function findPlateCandidates(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const rawToken of text.split(/[^A-Za-z0-9]+/)) {
    const token = normalizePlate(rawToken);

    if (token.length !== PLATE_LENGTH) continue;
    if (NOT_PLATES.has(token)) continue;
    if (!STRICT_PATTERNS.some((pattern) => pattern.test(token))) continue;
    if (seen.has(token)) continue;

    seen.add(token);
    found.push(token);
  }

  return found;
}

/**
 * ¿Aparece la patente esperada en el texto?
 *
 * Criterio permisivo: busca sobre el texto compactado (sin separadores, para
 * encontrar «LX-WP-83») y en forma canónica (para tolerar que el OCR haya leído
 * `8888II` donde el documento dice `BBBB11`).
 *
 * Un falso positivo aquí sólo provoca silencio, que es el lado seguro.
 */
export function containsExpectedPlate(text: string, expectedPpu: string): boolean {
  const expected = canonicalPlate(expectedPpu);
  if (expected.length !== PLATE_LENGTH) return false;

  return canonicalPlate(text).includes(expected);
}

export type PlateVerdict = "MATCH" | "MISMATCH" | "NOT_FOUND";

export interface PlateCheck {
  verdict: PlateVerdict;
  /** PPU del bus, según la flota. */
  expected: string;
  /** Patentes reconocidas en el documento o en el nombre del archivo. */
  found: string[];
  /** De dónde salió la evidencia que motiva un MISMATCH. */
  source: "filename" | "document" | null;
}

/**
 * Compara la PPU del bus con lo que aparece en el documento y en su nombre.
 *
 *   MATCH     · la PPU del bus aparece → el documento es de este bus
 *   MISMATCH  · NO aparece y sí aparece otra patente → probable error
 *   NOT_FOUND · no se reconoció ninguna patente → sin evidencia, no se alerta
 */
export function checkDocumentPlate(
  text: string,
  fileName: string,
  expectedPpu: string,
): PlateCheck {
  const expected = normalizePlate(expectedPpu);

  if (containsExpectedPlate(text, expected) || containsExpectedPlate(fileName, expected)) {
    return { verdict: "MATCH", expected, found: [expected], source: null };
  }

  // El nombre del archivo no pasa por el OCR: es la evidencia más sólida
  const fromFileName = findPlateCandidates(fileName);
  if (fromFileName.length > 0) {
    return { verdict: "MISMATCH", expected, found: fromFileName, source: "filename" };
  }

  const fromDocument = findPlateCandidates(text);
  if (fromDocument.length > 0) {
    return { verdict: "MISMATCH", expected, found: fromDocument, source: "document" };
  }

  return { verdict: "NOT_FOUND", expected, found: [], source: null };
}
