import "server-only";

import { normalizeRut } from "@/lib/auth/rut";
import { getAuthEmailDomain } from "@/lib/env";

/**
 * Identificador técnico que Supabase Auth exige internamente.
 *
 * El usuario SÓLO conoce su RUT y su contraseña (§7). Supabase Auth necesita un
 * email, así que se deriva de forma determinista del RUT normalizado:
 *
 *     11.111.111-1  →  11111111-1@usuarios.interno
 *
 * Determinista, no consultado:
 *   · el login no necesita leer la base antes de autenticar, así que nadie
 *     puede usar la pantalla de acceso para averiguar qué RUTs existen;
 *   · el RUT es inmutable en la base (`profiles_prevent_rut_change`), por lo
 *     que perfil y credencial nunca se desalinean.
 *
 * Este valor jamás se muestra en la interfaz ni se usa para enviar correo.
 */
export function authIdentifierForRut(rut: string): string | null {
  const normalized = normalizeRut(rut);
  if (!normalized) return null;

  return `${normalized}@${getAuthEmailDomain()}`;
}
