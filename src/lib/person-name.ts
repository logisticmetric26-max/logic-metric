/**
 * Nombre de una persona escrito en un solo campo.
 *
 * Se pide «nombre y apellido» en un único input en lugar de dos, porque en la
 * práctica los conductores se anotan de corrido y dos campos obligan a mover el
 * foco a mitad de una tarea que se repite muchas veces al día. A cambio, hay
 * que validar aquí lo que dos campos daban gratis: que venga el apellido.
 */

/** Normaliza espacios: `  Juan   Pérez  ` → `Juan Pérez`. */
export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * ¿Trae al menos nombre y apellido?
 *
 * Se exigen dos palabras de dos letras o más. Una inicial suelta («Juan P.»)
 * no identifica a nadie en un registro que puede acabar en una auditoría, y
 * `de`, `del`, `la` no cuentan como apellido por sí solas.
 */
export function hasNameAndSurname(value: string): boolean {
  const partes = normalizePersonName(value)
    .split(" ")
    .filter((parte) => parte.replace(/[.]/g, "").length >= 2);

  return partes.length >= 2;
}

/**
 * Capitaliza cada palabra respetando las partículas de los apellidos
 * compuestos: `JUAN DE LA CRUZ` → `Juan de la Cruz`.
 *
 * Se aplica al guardar para que el mismo conductor no aparezca como «JUAN
 * PEREZ», «juan perez» y «Juan Perez» en tres filas distintas del historial.
 */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "van", "von"]);

export function formatPersonName(value: string): string {
  const palabras = normalizePersonName(value).toLocaleLowerCase("es").split(" ");

  return palabras
    .map((palabra, indice) => {
      if (indice > 0 && PARTICULAS.has(palabra)) return palabra;
      return palabra.charAt(0).toLocaleUpperCase("es") + palabra.slice(1);
    })
    .join(" ");
}
