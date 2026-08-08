import { Bus, Building2 } from "lucide-react";
import { requireAnyPermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";

/**
 * §13 · Configuración.
 *
 * Sus subsecciones —Flota y Terminal— son navegación interna, no entradas del
 * sidebar. Cada pestaña se muestra sólo si el usuario tiene el permiso
 * correspondiente.
 */
export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAnyPermission([
    PERMISSIONS.fleet.view,
    PERMISSIONS.terminals.view,
    PERMISSIONS.settings.manage,
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

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Administración de la flota y de los terminales de operación."
      />
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
