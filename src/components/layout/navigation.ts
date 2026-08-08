import { ClipboardCheck, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";

/**
 * Definición del menú lateral (§6).
 *
 * Declarativa a propósito: agregar un módulo futuro es añadir una entrada aquí
 * y sus permisos en una migración. No hay que tocar el layout, la sesión ni la
 * autenticación.
 *
 * El sidebar contiene SÓLO tres entradas. Todo lo relativo a revisión técnica
 * (historial, rechazados, vencimientos, no enviados, en revisión, resumen) vive
 * DENTRO de «Revisión Técnica» como navegación secundaria, nunca como opciones
 * del menú.
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
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    permissions: [PERMISSIONS.fleet.view, PERMISSIONS.terminals.view, PERMISSIONS.settings.manage],
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
