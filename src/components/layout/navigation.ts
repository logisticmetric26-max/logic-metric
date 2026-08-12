import { ClipboardCheck, Droplets, Settings, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";

/**
 * Definición del menú lateral (§6).
 *
 * Declarativa a propósito: agregar un módulo futuro es añadir una entrada aquí
 * y sus permisos en una migración. No hay que tocar el layout, la sesión ni la
 * autenticación.
 *
 * Revisión técnica conserva su navegación secundaria interna. Los módulos
 * operacionales principales viven al primer nivel del sidebar.
 */

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Basta con tener uno de estos permisos para ver la entrada. */
  permissions: readonly PermissionCode[];
  /** `footer` se ancla al final del sidebar. */
  group: "main" | "footer";
  description?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Revisión Técnica",
    href: "/revision-tecnica",
    icon: ClipboardCheck,
    permissions: [PERMISSIONS.technicalReview.view, PERMISSIONS.notSent.view],
    group: "main",
    description: "Procesos, vencimientos e historial",
  },
  {
    label: "Combustible",
    href: "/combustible",
    icon: Droplets,
    permissions: [PERMISSIONS.fuelCalendar.view],
    group: "main",
    description: "Calendario de combustible y AdBlue",
  },
  {
    label: "Lavado Buses",
    href: "/lavado-buses",
    icon: Sparkles,
    permissions: [PERMISSIONS.busWash.view],
    group: "main",
    description: "B&M, carroceria y reparacion diaria",
  },
  {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    permissions: [PERMISSIONS.fleet.view, PERMISSIONS.terminals.view],
    group: "footer",
    description: "Flota y terminales",
  },
  {
    label: "Acceso",
    href: "/acceso",
    icon: ShieldCheck,
    permissions: [PERMISSIONS.users.view, PERMISSIONS.access.manage],
    group: "footer",
    description: "Usuarios, roles y permisos",
  },
] as const;

export function visibleNavItems(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) =>
    item.permissions.some((permission) => permissions.includes(permission)),
  );
}

/** Título legible de cada ruta, para migas de pan y encabezados. */
export const ROUTE_LABELS: Record<string, string> = {
  "revision-tecnica": "Revisión Técnica",
  combustible: "Combustible",
  "lavado-buses": "Lavado Buses",
  "en-revision": "En revisión",
  "no-enviados": "No enviados",
  rechazados: "Rechazados",
  vencimientos: "Vencimientos",
  historial: "Historial",
  configuracion: "Configuración",
  flota: "Flota",
  terminales: "Terminales",
  acceso: "Acceso",
  roles: "Roles",
  detalle: "Detalle",
};
