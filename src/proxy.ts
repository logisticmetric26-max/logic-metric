import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session-refresh";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     *   · assets estáticos de Next
     *   · archivos de la PWA (deben servirse sin sesión para poder instalarse)
     *   · imágenes e íconos
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
