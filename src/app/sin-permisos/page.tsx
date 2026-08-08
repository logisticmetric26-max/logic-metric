import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getSessionState } from "@/lib/auth/session";
import { EstadoScreen } from "@/components/layout/status-screen";

export const metadata: Metadata = { title: "Sin permisos" };

/**
 * El usuario está activo pero su rol no incluye el permiso de la sección que
 * intentó abrir. Es una explicación, no la barrera: la barrera es RLS.
 */
export default async function SinPermisosPage() {
  const state = await getSessionState();

  if (state.kind === "ANONYMOUS") redirect("/login");
  if (state.kind === "SUSPENDED") redirect("/acceso-suspendido");
  if (state.kind === "NO_PROFILE") redirect("/sin-perfil");

  return (
    <EstadoScreen
      icon={<Lock className="size-6 text-ink-muted" aria-hidden />}
      title="No tiene permisos para esta sección"
      description="Su rol actual no incluye el acceso a esta parte de la plataforma. Si necesita ingresar, solicítelo al administrador."
    >
      <Link
        href="/"
        className="mt-4 inline-block text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        Volver al inicio
      </Link>
    </EstadoScreen>
  );
}
