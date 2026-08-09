/**
 * Foto de perfil.
 *
 * El bucket `avatars` es público, así que la URL se compone a partir de la ruta
 * sin firmar nada. Firmar cada avatar en cada render costaría una llamada por
 * usuario y por pantalla, y la URL caducaría constantemente; el archivo es una
 * foto de perfil corporativa, no un dato de negocio.
 *
 * El nombre lleva un aleatorio (ver `avatarObjectPath`), así que conocer el id
 * de un usuario no permite adivinar la URL de su foto.
 */

const BUCKET = "avatars";

/** URL pública de una foto a partir de su ruta almacenada. */
export function avatarUrl(path: string | null | undefined, supabaseUrl: string): string | null {
  if (!path) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Ruta de destino de una foto nueva: `{user_id}/{aleatorio}.{ext}`.
 *
 * La carpeta es el id del usuario porque la política de storage autoriza la
 * escritura comparando esa carpeta con el `uid` de la sesión.
 */
export function avatarObjectPath(userId: string, fileName: string): string {
  const extension = extensionFor(fileName);
  // `crypto.randomUUID` existe en el navegador y en Node ≥ 19
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

function extensionFor(fileName: string): string {
  const raw = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (raw === "jpeg" || raw === "jpg") return "jpg";
  if (raw === "png") return "png";
  if (raw === "webp") return "webp";
  return "jpg";
}

/** Tipos aceptados; deben coincidir con los del bucket. */
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 2 MB, el mismo límite que aplica el bucket. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Iniciales para cuando no hay foto.
 *
 * Primera letra del nombre y primera del último apellido: «Isaac Ávila Gómez»
 * da «IG». Con una sola palabra, sus dos primeras letras.
 */
export function initialsFor(fullName: string): string {
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
