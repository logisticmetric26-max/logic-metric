import { Bus, Building2, Droplets } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";

/**
 * Configuracion.
 *
 * Sus subsecciones son navegacion interna, no entradas del sidebar. Cada
 * pestana se muestra solo si el usuario tiene el permiso correspondiente.
 */
export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAnyPermission([
    PERMISSIONS.fleet.view,
    PERMISSIONS.terminals.view,
    PERMISSIONS.dispensers.view,
  ]);

  const tabs: TabItem[] = [];

  if (context.permissions.includes(PERMISSIONS.fleet.view)) {
    tabs.push({
      href: "/configuracion/flota",
      label: "Flota",
      icon: <Bus className="size-4" aria-hidden />,
    });
  }

  if (context.permissions.includes(PERMISSIONS.terminals.view)) {
    tabs.push({
      href: "/configuracion/terminales",
      label: "Terminales",
      icon: <Building2 className="size-4" aria-hidden />,
    });
  }

  if (context.permissions.includes(PERMISSIONS.dispensers.view)) {
    tabs.push({
      href: "/configuracion/surtidores",
      label: "Surtidores",
      icon: <Droplets className="size-4" aria-hidden />,
    });
  }

  return (
    <>
      <PageHeader
        title="Configuracion"
        description="Administracion de la flota, terminales y surtidores operacionales."
      />
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
