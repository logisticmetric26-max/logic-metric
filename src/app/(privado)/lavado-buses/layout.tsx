import { ClipboardCheck, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

export default async function LavadoBusesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(PERMISSIONS.busWash.view);

  const tabs: TabItem[] = [
    {
      href: "/lavado-buses",
      label: "Registro",
      icon: <ClipboardCheck className="size-4" aria-hidden />,
      exact: true,
    },
    {
      href: "/lavado-buses/historico",
      label: "Historico",
      icon: <History className="size-4" aria-hidden />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Lavado Buses"
        description="Control diario e historico de archivos generados para el lavado de buses."
      />
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
