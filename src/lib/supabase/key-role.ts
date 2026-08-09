/**
 * Rol declarado por una clave de Supabase.
 *
 * Las claves son JWT y llevan su rol en el cuerpo. Pegar la clave `anon` donde
 * va la de servicio es el error más común —a simple vista son idénticas— y
 * produce exactamente el mismo 401 que una clave de otro proyecto, así que sin
 * esta comprobación las dos causas son indistinguibles desde fuera.
 *
 * Devuelve sólo el NOMBRE del rol. El cuerpo de un JWT lo puede leer cualquiera
 * que ya tenga la clave; sin la firma este dato no permite fabricar ninguna
 * credencial ni deducir el secreto, por eso puede publicarse en el diagnóstico.
 */
export type KeyRole = "anon" | "service_role" | "otro" | "no_es_jwt";

export function claimedRole(key: string): KeyRole {
  const payload = key.trim().split(".")[1];
  if (!payload) return "no_es_jwt";

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (typeof decoded !== "object" || decoded === null) return "no_es_jwt";

    const role = (decoded as { role?: unknown }).role;
    if (role === "anon" || role === "service_role") return role;

    return "otro";
  } catch {
    return "no_es_jwt";
  }
}
