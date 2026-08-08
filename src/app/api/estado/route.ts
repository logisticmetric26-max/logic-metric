import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/env";

/**
 * Diagnóstico de despliegue.
 *
 * Existe porque un fallo de configuración en el servidor (variables de entorno
 * ausentes o mal copiadas) se manifestaba en la pantalla de acceso como «RUT o
 * contraseña incorrectos», y no había forma de distinguirlo desde fuera.
 *
 * Responde ÚNICAMENTE con booleanos y con el dominio del identificador técnico:
 * jamás con el valor de una clave, ni siquiera parcial. Saber que una variable
 * está definida no permite deducir su contenido.
 */
export const dynamic = "force-dynamic";

function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  // La aplicación normaliza la URL antes de usarla, así que aquí se comprueba
  // exactamente lo mismo que hará el login: si esto responde, el acceso entra.
  let base = "";
  let urlUtilizable = false;
  try {
    base = normalizeSupabaseUrl(raw);
    urlUtilizable = true;
  } catch {
    urlUtilizable = false;
  }

  // Llamada real al servicio de autenticación con la clave configurada. Si
  // responde 200, la URL y la clave anónima son válidas y se corresponden entre
  // sí: exactamente lo que necesita hacer el login.
  let supabaseAlcanzable: boolean | null = null;

  if (urlUtilizable && anonKey.length > 0) {
    try {
      const response = await fetch(`${base}/auth/v1/health`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(5000),
      });
      supabaseAlcanzable = response.ok;
    } catch {
      supabaseAlcanzable = false;
    }
  }

  return NextResponse.json(
    {
      supabase_url_definida: isSet(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabase_url_utilizable: urlUtilizable,
      // Informativo: si es `true`, la variable trae una ruta de más (típico
      // `/rest/v1/`). La aplicación la corrige sola; conviene limpiarla igual.
      supabase_url_con_ruta_sobrante: urlUtilizable && raw.replace(/\/+$/, "") !== base,
      supabase_anon_key_definida: isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_service_role_definida: isSet(process.env.SUPABASE_SERVICE_ROLE_KEY),
      dominio_identificador: process.env.AUTH_EMAIL_DOMAIN?.trim() || "usuarios.interno",
      supabase_alcanzable: supabaseAlcanzable,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
