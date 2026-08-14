import { AlertTriangle, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";

export default async function MalasCargasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(PERMISSIONS.badLoads.view);

  const tabs: TabItem[] = [
    {
      href: "/combustible/malas-cargas",
      label: "Registro",
      icon: <AlertTriangle className="size-4" aria-hidden />,
      exact: true,
    },
    {
      href: "/combustible/malas-cargas/historico",
      label: "Historico",
      icon: <History className="size-4" aria-hidden />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Malas cargas"
        description="Registro activo e historico operacional de malas cargas con fecha, hora, bus, litros y surtidor."
      />
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
