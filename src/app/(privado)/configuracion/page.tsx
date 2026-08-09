import { redirect } from "next/navigation";
import { requireAnyPermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Envía a la primera subsección de Configuración accesible para el usuario. */
export default async function ConfiguracionPage() {
  const context = await requireAnyPermission([
    PERMISSIONS.fleet.view,
    PERMISSIONS.terminals.view,
  ]);

  if (context.permissions.includes(PERMISSIONS.fleet.view)) redirect("/configuracion/flota");
  redirect("/configuracion/terminales");
}
