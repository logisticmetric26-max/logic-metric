import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRoundX } from "lucide-react";
import { getSessionState } from "@/lib/auth/session";
import { EstadoScreen } from "@/components/layout/status-screen";

export const metadata: Metadata = { title: "Sin perfil asignado" };

/**
 * Credencial válida en Supabase Auth pero sin ficha en `profiles`.
 *
 * Ocurre si alguien crea la credencial fuera del flujo de alta de usuarios.
 * Sin ficha no hay terminal, rol ni permisos, así que no puede operar.
 */
export default async function SinPerfilPage() {
  const state = await getSessionState();

  if (state.kind === "ANONYMOUS") redirect("/login");
  if (state.kind === "ACTIVE") redirect("/");

  return (
    <EstadoScreen
      icon={<UserRoundX className="size-6 text-warning-600" aria-hidden />}
      title="Su usuario aún no está habilitado"
      description="Su credencial es válida, pero todavía no tiene una ficha con terminal y rol asignados. Contacte al administrador de la plataforma."
    />
  );
}
