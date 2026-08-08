import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { getSessionState } from "@/lib/auth/session";
import { EstadoScreen } from "@/components/layout/status-screen";

export const metadata: Metadata = { title: "Acceso suspendido" };

/**
 * §8 · Un usuario suspendido no puede utilizar la plataforma.
 *
 * Más allá de esta pantalla, RLS le niega toda fila: `app.user_is_active()`
 * devuelve falso, así que ni siquiera consultando la API directamente obtendría
 * datos.
 */
export default async function AccesoSuspendidoPage() {
  const state = await getSessionState();

  if (state.kind === "ANONYMOUS") redirect("/login");
  if (state.kind === "ACTIVE") redirect("/");

  return (
    <EstadoScreen
      icon={<UserX className="size-6 text-danger-600" aria-hidden />}
      title="Su usuario se encuentra suspendido"
      description="No es posible acceder a la plataforma con este usuario. Comuníquese con el administrador para reactivar su acceso."
    />
  );
}
