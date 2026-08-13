import {
  ClipboardCheck,
  Droplets,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";

/**
 * Definicion del menu lateral.
 *
 * Es declarativo a proposito: agregar un modulo futuro es anadir una entrada
 * aqui y sus permisos en una migracion.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permissions: readonly PermissionCode[];
  group: "main" | "footer";
  description?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Revision Tecnica",
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
    permissions: [PERMISSIONS.fuelCalendar.view, PERMISSIONS.badLoads.view],
    group: "main",
    description: "Agenda de combustible y malas cargas",
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
    label: "Configuracion",
    href: "/configuracion",
    icon: Settings,
    permissions: [
      PERMISSIONS.fleet.view,
      PERMISSIONS.terminals.view,
      PERMISSIONS.dispensers.view,
      PERMISSIONS.readerCodes.view,
    ],
    group: "footer",
    description: "Flota, terminales, surtidores y codigos lectores",
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

/** Titulo legible de cada ruta, para migas de pan y encabezados. */
export const ROUTE_LABELS: Record<string, string> = {
  "revision-tecnica": "Revision Tecnica",
  combustible: "Combustible",
  "malas-cargas": "Malas cargas",
  "lavado-buses": "Lavado Buses",
  "en-revision": "En revision",
  "no-enviados": "No enviados",
  rechazados: "Rechazados",
  vencimientos: "Vencimientos",
  historial: "Historial",
  configuracion: "Configuracion",
  flota: "Flota",
  terminales: "Terminales",
  surtidores: "Surtidores",
  "codigos-lectores": "Codigos lectores",
  acceso: "Acceso",
  roles: "Roles",
  detalle: "Detalle",
};
