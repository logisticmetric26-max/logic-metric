/**
 * Número del documento.
 *
 * En los certificados de planta el número va inmediatamente después del nombre
 * del documento:
 *
 *     CERTIFICADO DE REVISIÓN TÉCNICA N°A1306000000249446
 *
 * Rescatarlo evita que el usuario lo transcriba a mano —son 17 caracteres y un
 * dígito mal copiado deja el registro sin trazabilidad contra la planta.
 *
 * Se propone, nunca se impone: rellena el campo sólo si está vacío, y el
 * usuario puede corregirlo. El OCR puede confundir un carácter y ese dato acaba
 * en un registro histórico.
 */

/** Nombres de documento tras los cuales suele venir el número. */
const DOCUMENT_NAMES = [
  "CERTIFICADO DE REVISION TECNICA",
  "CERTIFICADO DE REVISION",
  "CERTIFICADO",
  "INFORME DE RECHAZO",
  "INFORME",
  "COMPROBANTE",
  "GUIA",
  "ACTA",
];

/**
 * Marcador de número seguido del código.
 *
 * Cubre las variantes con las que el OCR lee el símbolo «Nº»: `N°`, `Nº`, `N*`,
 * `N.`, `No`, `N`. El código debe tener al menos 6 caracteres y contener algún
 * dígito, para no capturar una palabra suelta.
 *
 * Es GLOBAL a propósito: en «CERTIFICADO DE REVISIÓN TÉCNICA N°A130…» la
 * primera «N» que encuentra el motor es la de «REVISIÓN», y capturaría
 * «TECNICA». Hay que recorrer todas las coincidencias y quedarse con la primera
 * que de verdad parezca un número.
 */
const NUMBER_MARKER = /N[.°ºoO*:]{0,2}\s*([A-Z]?[A-Z0-9][A-Z0-9-]{5,})/g;

/** Primer código con forma de número de documento en el fragmento dado. */
function firstNumberIn(fragment: string): string | null {
  for (const match of fragment.matchAll(NUMBER_MARKER)) {
    const candidate = match[1].replace(/[-.]+$/, "");
    if (looksLikeNumber(candidate)) return candidate;
  }
  return null;
}

/** Sin acentos y en mayúsculas: el OCR pierde tildes con frecuencia. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** Un número de documento debe traer dígitos, no ser una palabra. */
function looksLikeNumber(candidate: string): boolean {
  const digits = (candidate.match(/\d/g) ?? []).length;
  return digits >= 4 && digits / candidate.length >= 0.5;
}

/**
 * Extrae el número del documento.
 *
 * Prioriza el que aparece junto al nombre del documento; si no lo encuentra,
 * recurre al marcador `N°` más largo del texto. Devuelve `null` cuando no hay
 * nada suficientemente fiable.
 */
export function extractDocumentNumber(text: string): string | null {
  const lines = normalize(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // 1 · junto al nombre del documento, que es donde realmente está
  for (const line of lines) {
    const nameIndex = DOCUMENT_NAMES.map((name) => line.indexOf(name)).find(
      (index) => index >= 0,
    );

    if (nameIndex === undefined) continue;

    const found = firstNumberIn(line.slice(nameIndex));
    if (found) return found;
  }

  // 2 · sin nombre reconocible, el marcador `N°` con el código más largo
  let best: string | null = null;

  for (const line of lines) {
    const candidate = firstNumberIn(line);
    if (!candidate) continue;
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}
