/**
 * Códigos de permiso.
 *
 * Espejo del catálogo de `public.permissions`. Existe para que el código no
 * escriba cadenas sueltas, no para decidir accesos: la autorización real la
 * resuelve `app.has_permission()` dentro de las políticas RLS.
 *
 * Agregar un módulo nuevo = agregar permisos aquí y en una migración. No hay
 * roles cableados en los componentes (§10).
 */
export const PERMISSIONS = {
  technicalReview: {
    view: "technical_review.view",
    create: "technical_review.create",
    close: "technical_review.close",
    edit: "technical_review.edit",
    delete: "technical_review.delete",
  },
  technicalReviewDocuments: {
    view: "technical_review_documents.view",
    upload: "technical_review_documents.upload",
  },
  notSent: {
    view: "technical_review_not_sent.view",
    create: "technical_review_not_sent.create",
    edit: "technical_review_not_sent.edit",
    delete: "technical_review_not_sent.delete",
  },
  fleet: {
    view: "fleet.view",
    create: "fleet.create",
    edit: "fleet.edit",
  },
  terminals: {
    view: "terminals.view",
    create: "terminals.create",
    edit: "terminals.edit",
    delete: "terminals.delete",
  },
  users: {
    view: "users.view",
    create: "users.create",
    edit: "users.edit",
    suspend: "users.suspend",
    delete: "users.delete",
  },
  access: {
    manage: "access.manage",
  },
  settings: {
    manage: "settings.manage",
  },
  audit: {
    view: "audit.view",
  },
} as const;

type Leaves<T> = T extends string ? T : T extends object ? Leaves<T[keyof T]> : never;

export type PermissionCode = Leaves<typeof PERMISSIONS>;

export function hasPermission(granted: readonly string[], permission: PermissionCode): boolean {
  return granted.includes(permission);
}

export function hasAnyPermission(
  granted: readonly string[],
  permissions: readonly PermissionCode[],
): boolean {
  return permissions.some((permission) => granted.includes(permission));
}
