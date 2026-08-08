import { ShieldCheck, Users } from "lucide-react";
import { requireAnyPermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";

/**
 * §11 · ACCESO.
 *
 * Usuarios y Roles son navegación interna de la sección, no entradas del
 * sidebar.
 */
export default async function AccesoLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAnyPermission([
    PERMISSIONS.users.view,
    PERMISSIONS.access.manage,
  ]);

  const tabs: TabItem[] = [
    {
      href: "/acceso",
      label: "Usuarios",
      icon: <Users className="size-4" aria-hidden />,
      exact: true,
    },
  ];

  if (context.permissions.includes(PERMISSIONS.access.manage)) {
    tabs.push({
      href: "/acceso/roles",
      label: "Roles y permisos",
      icon: <ShieldCheck className="size-4" aria-hidden />,
    });
  }

  return (
    <>
      <PageHeader
        title="Acceso"
        description="Usuarios, roles, permisos y terminales autorizados."
      />
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
