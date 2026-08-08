import { redirect } from "next/navigation";
import { getSessionState, landingRouteFor } from "@/lib/auth/session";

/**
 * Raíz de la aplicación.
 *
 * No tiene contenido propio: envía a la primera sección a la que el usuario
 * realmente tiene acceso, en lugar de mostrar una página vacía o un panel al
 * que le faltarían permisos.
 */
export default async function HomePage() {
  const state = await getSessionState();

  switch (state.kind) {
    case "ACTIVE":
      redirect(landingRouteFor(state.context));
    case "SUSPENDED":
      redirect("/acceso-suspendido");
    case "NO_PROFILE":
      redirect("/sin-perfil");
    default:
      redirect("/login");
  }
}
