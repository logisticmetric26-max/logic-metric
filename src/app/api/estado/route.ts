import { NextResponse } from "next/server";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";

  // Error clásico al copiar desde el panel de Supabase: pegar el endpoint REST
  // en lugar de la URL base. Con `/rest/v1` las llamadas de autenticación se
  // dirigen a una ruta inexistente y todo login falla.
  const urlBienFormada = url.length > 0 && /^https:\/\/[^/]+\.supabase\.co\/?$/.test(url);

  // Llamada real al servicio de autenticación con la clave configurada. Si
  // responde 200, la URL y la clave anónima son válidas y se corresponden entre
  // sí: exactamente lo que necesita hacer el login.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  let supabaseAlcanzable: boolean | null = null;

  if (url.length > 0 && anonKey.length > 0) {
    try {
      const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
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
      supabase_url_bien_formada: urlBienFormada,
      supabase_anon_key_definida: isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_service_role_definida: isSet(process.env.SUPABASE_SERVICE_ROLE_KEY),
      dominio_identificador: process.env.AUTH_EMAIL_DOMAIN?.trim() || "usuarios.interno",
      supabase_alcanzable: supabaseAlcanzable,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
