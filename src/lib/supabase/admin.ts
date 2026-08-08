import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getPublicEnv, getServiceRoleKey } from "@/lib/env";

/**
 * Cliente con `service_role`.
 *
 * ⚠️ SALTA ROW LEVEL SECURITY POR COMPLETO.
 *
 * El `import "server-only"` hace que el build falle si alguien lo importa desde
 * un componente cliente, de modo que la clave nunca puede terminar en el
 * bundle del navegador (§12).
 *
 * Reservado para operaciones que la API de usuario no puede realizar:
 *
 *   · crear la credencial en Supabase Auth (alta de usuario)
 *   · eliminar una credencial (baja de usuario)
 *   · cambiar contraseñas
 *   · invalidar las sesiones de un usuario suspendido
 *
 * Todo lo demás usa el cliente de sesión para que RLS siga siendo la autoridad.
 * Quien lo invoque DEBE haber verificado antes el permiso del usuario que pide
 * la acción.
 */
export function createAdminClient() {
  const { supabaseUrl } = getPublicEnv();

  return createSupabaseClient<Database>(supabaseUrl, getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
