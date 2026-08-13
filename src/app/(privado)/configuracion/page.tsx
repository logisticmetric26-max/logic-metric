import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";

/** Envia a la primera subseccion de Configuracion accesible para el usuario. */
export default async function ConfiguracionPage() {
  const context = await requireAnyPermission([
    PERMISSIONS.fleet.view,
    PERMISSIONS.terminals.view,
    PERMISSIONS.dispensers.view,
  ]);

  if (context.permissions.includes(PERMISSIONS.fleet.view)) {
    redirect("/configuracion/flota");
  }

  if (context.permissions.includes(PERMISSIONS.terminals.view)) {
    redirect("/configuracion/terminales");
  }

  if (context.permissions.includes(PERMISSIONS.dispensers.view)) {
    redirect("/configuracion/surtidores");
  }

  redirect("/configuracion/flota");
}
