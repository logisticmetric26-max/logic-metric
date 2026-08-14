import {
  CalendarClock,
  ClipboardList,
  FileX2,
  History,
  LayoutDashboard,
  Timer,
} from "lucide-react";
import { requireAnyPermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";

/**
 * §16 · REVISIÓN TÉCNICA.
 *
 * Ésta es la ÚNICA entrada de esta sección en el sidebar. Resumen, En revisión,
 * No enviados, Rechazados, Vencimientos e Historial son navegación secundaria
 * dentro de la sección, nunca opciones del menú lateral (§6, §29).
 *
 * Cada pestaña aparece sólo si el usuario tiene el permiso correspondiente.
 */
export default async function RevisionTecnicaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAnyPermission([
    PERMISSIONS.technicalReview.view,
    PERMISSIONS.notSent.view,
  ]);

  const canViewReviews = context.permissions.includes(PERMISSIONS.technicalReview.view);
  const canViewNotSent = context.permissions.includes(PERMISSIONS.notSent.view);

  const tabs: TabItem[] = [];

  if (canViewReviews) {
    tabs.push({
      href: "/revision-tecnica",
      label: "Resumen",
      icon: <LayoutDashboard className="size-4" aria-hidden />,
      exact: true,
    });
    tabs.push({
      href: "/revision-tecnica/en-revision",
      label: "Envios a planta",
      icon: <Timer className="size-4" aria-hidden />,
    });
  }

  if (canViewNotSent) {
    tabs.push({
      href: "/revision-tecnica/no-enviados",
      label: "No enviados",
      icon: <ClipboardList className="size-4" aria-hidden />,
    });
  }

  if (canViewReviews) {
    tabs.push(
      {
        href: "/revision-tecnica/rechazados",
        label: "Rechazados",
        icon: <FileX2 className="size-4" aria-hidden />,
      },
      {
        href: "/revision-tecnica/vencimientos",
        label: "Vencimientos",
        icon: <CalendarClock className="size-4" aria-hidden />,
      },
      {
        href: "/revision-tecnica/historial",
        label: "Historial",
        icon: <History className="size-4" aria-hidden />,
      },
    );
  }

  return (
    <>
      <PageHeader
        title="Revisión Técnica"
        description="Salidas a planta, resultados, vencimientos e historial de la flota."
      />
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
