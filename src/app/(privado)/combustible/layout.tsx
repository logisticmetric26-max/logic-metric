import { AlertTriangle, CalendarClock } from "lucide-react";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";

export default async function CombustibleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAnyPermission([
    PERMISSIONS.fuelCalendar.view,
    PERMISSIONS.badLoads.view,
  ]);

  const tabs: TabItem[] = [];

  if (context.permissions.includes(PERMISSIONS.fuelCalendar.view)) {
    tabs.push({
      href: "/combustible",
      label: "Agenda",
      icon: <CalendarClock className="size-4" aria-hidden />,
      exact: true,
    });
  }

  if (context.permissions.includes(PERMISSIONS.badLoads.view)) {
    tabs.push({
      href: "/combustible/malas-cargas",
      label: "Malas cargas",
      icon: <AlertTriangle className="size-4" aria-hidden />,
    });
  }

  return (
    <>
      <Tabs items={tabs} className="mb-5" />
      {children}
    </>
  );
}
