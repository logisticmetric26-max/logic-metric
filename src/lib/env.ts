/**
 * Acceso validado a variables de entorno.
 *
 * Falla al arrancar si falta algo esencial, en lugar de producir errores
 * confusos en tiempo de ejecución.
 *
 * Las claves de servidor se leen mediante funciones y NUNCA como constantes de
 * módulo: así el bundler no puede arrastrarlas al cliente por accidente.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${name}. Revise su archivo .env.local (ver .env.example).`,
    );
  }
  return value;
}

/**
 * Deja la URL de Supabase en su forma base: `https://<proyecto>.supabase.co`.
 *
 * El panel de Supabase muestra la ruta del API REST (`…/rest/v1/`) junto a la
 * URL del proyecto, y copiar la primera es el error natural. Con esa ruta
 * pegada, el cliente compone direcciones como `…/rest/v1/auth/v1/token`, que no
 * existen: TODAS las llamadas fallan, empezando por el inicio de sesión.
 *
 * Se descarta cualquier ruta, query o fragmento y se conserva sólo el origen.
 * Aceptar las dos formas cuesta una línea; diagnosticarlo en producción costó
 * bastante más.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL no es una URL válida: se esperaba algo como https://xxxx.supabase.co`,
    );
  }

  return parsed.origin;
}

/**
 * Configuración pública: puede viajar al navegador sin riesgo.
 *
 * Se lee de forma perezosa (no como constante de módulo) para que importar este
 * archivo durante el build no falle si el entorno todavía no está configurado.
 * `process.env.NEXT_PUBLIC_*` debe escribirse literal: Next lo sustituye en
 * tiempo de compilación.
 */
export function getPublicEnv() {
  return {
    supabaseUrl: normalizeSupabaseUrl(
      required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    ),
    supabaseAnonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ).trim(),
  };
}

/**
 * Clave de servicio. Otorga acceso total saltándose RLS.
 *
 * Sólo puede invocarse desde código de servidor. El `import "server-only"` de
 * los módulos que la usan garantiza el aislamiento en tiempo de compilación.
 */
export function getServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Dominio del identificador técnico derivado del RUT.
 *
 * Supabase Auth exige un email; el usuario nunca lo ve ni lo escribe. No se
 * envía correo a este dominio: sólo actúa como espacio de nombres.
 */
export function getAuthEmailDomain(): string {
  return process.env.AUTH_EMAIL_DOMAIN?.trim() || "usuarios.interno";
}

/** Proveedor de análisis documental (OCR + extracción de motivos). */
export function getDocumentAiConfig() {
  return {
    apiKey: process.env.DOCUMENT_AI_API_KEY?.trim() ?? "",
    model: process.env.DOCUMENT_AI_MODEL?.trim() || "claude-sonnet-4-5",
  };
}

export function isDocumentAiConfigured(): boolean {
  return getDocumentAiConfig().apiKey.length > 0;
}
