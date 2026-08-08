import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { getPublicEnv } from "@/lib/env";

/**
 * Rutas accesibles sin sesión.
 *
 * `/api/estado` es de diagnóstico y tiene que ser público a propósito: sirve
 * para comprobar la configuración del servidor cuando nadie puede entrar, que
 * es justo el momento en el que exigir sesión lo volvería inservible. Sólo
 * devuelve booleanos, nunca el valor de una clave.
 */
const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js", "/offline", "/api/estado"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Refresca la sesión en cada request y bloquea el área privada.
 *
 * Es una barrera de NAVEGACIÓN: evita que se cargue una pantalla sin sesión.
 * La barrera de DATOS es RLS — aunque alguien esquivara esto, no obtendría
 * ninguna fila.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Valida el token contra el servidor de Auth y renueva las cookies.
  // No debe eliminarse: sin esta llamada la sesión no se refresca.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Se conserva el destino para volver tras iniciar sesión
    if (pathname !== "/") loginUrl.searchParams.set("siguiente", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}
