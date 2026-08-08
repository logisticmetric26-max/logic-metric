"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente de Supabase para el navegador.
 *
 * Usa exclusivamente la clave anónima. Todo lo que este cliente puede leer o
 * escribir está determinado por las políticas RLS asociadas al usuario
 * autenticado: aunque alguien extraiga la clave del bundle, no obtiene más
 * acceso del que ya tiene su sesión.
 */
let cached: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!cached) {
    const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
    cached = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return cached;
}
