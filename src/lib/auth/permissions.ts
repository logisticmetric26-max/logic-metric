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
  fuelCalendar: {
    view: "fuel_calendar.view",
    create: "fuel_calendar.create",
    edit: "fuel_calendar.edit",
    confirm: "fuel_calendar.confirm",
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
} as const;

type Leaves<T> = T extends string ? T : T extends object ? Leaves<T[keyof T]> : never;

export type PermissionCode = Leaves<typeof PERMISSIONS>;

/**
 * Dependencias funcionales entre permisos.
 *
 * Un permiso sólo es útil si el usuario también puede entrar a la pantalla y
 * completar las operaciones que esa capacidad necesita. La misma matriz se
 * aplica en la base de datos, para que no dependa únicamente del formulario.
 */
export const PERMISSION_DEPENDENCIES: Readonly<
  Partial<Record<PermissionCode, readonly PermissionCode[]>>
> = {
  [PERMISSIONS.technicalReview.create]: [PERMISSIONS.technicalReview.view],
  [PERMISSIONS.technicalReview.close]: [
    PERMISSIONS.technicalReview.view,
    PERMISSIONS.technicalReviewDocuments.view,
    PERMISSIONS.technicalReviewDocuments.upload,
  ],
  [PERMISSIONS.technicalReview.delete]: [PERMISSIONS.technicalReview.view],
  [PERMISSIONS.technicalReviewDocuments.view]: [PERMISSIONS.technicalReview.view],
  [PERMISSIONS.technicalReviewDocuments.upload]: [PERMISSIONS.technicalReview.view],
  [PERMISSIONS.notSent.create]: [PERMISSIONS.notSent.view],
  [PERMISSIONS.notSent.edit]: [PERMISSIONS.notSent.view],
  [PERMISSIONS.notSent.delete]: [PERMISSIONS.notSent.view],
  [PERMISSIONS.fuelCalendar.create]: [PERMISSIONS.fuelCalendar.view],
  [PERMISSIONS.fuelCalendar.edit]: [PERMISSIONS.fuelCalendar.view],
  [PERMISSIONS.fuelCalendar.confirm]: [PERMISSIONS.fuelCalendar.view],
  [PERMISSIONS.fleet.create]: [PERMISSIONS.fleet.view],
  [PERMISSIONS.fleet.edit]: [PERMISSIONS.fleet.view],
  [PERMISSIONS.terminals.create]: [PERMISSIONS.terminals.view],
  [PERMISSIONS.terminals.edit]: [PERMISSIONS.terminals.view],
  [PERMISSIONS.terminals.delete]: [PERMISSIONS.terminals.view],
  [PERMISSIONS.users.create]: [PERMISSIONS.users.view, PERMISSIONS.access.manage],
  [PERMISSIONS.users.edit]: [PERMISSIONS.users.view],
  [PERMISSIONS.users.suspend]: [PERMISSIONS.users.view],
  [PERMISSIONS.users.delete]: [PERMISSIONS.users.view],
  [PERMISSIONS.access.manage]: [PERMISSIONS.users.view],
  [PERMISSIONS.settings.manage]: [PERMISSIONS.technicalReview.view],
};

export const PERMISSION_CODES = Object.freeze(
  Object.values(PERMISSIONS).flatMap((group) => Object.values(group)),
) as readonly PermissionCode[];

const PERMISSION_CODE_SET = new Set<string>(PERMISSION_CODES);

export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODE_SET.has(value);
}

/** Añade una capacidad y todos sus requisitos, incluidos los transitivos. */
export function grantPermissionWithDependencies(
  granted: ReadonlySet<PermissionCode>,
  permission: PermissionCode,
): Set<PermissionCode> {
  const next = new Set(granted);
  const visited = new Set<PermissionCode>();

  function grant(code: PermissionCode) {
    if (visited.has(code)) return;
    visited.add(code);
    next.add(code);
    for (const dependency of PERMISSION_DEPENDENCIES[code] ?? []) grant(dependency);
  }

  grant(permission);
  return next;
}

/**
 * Quita una capacidad y también las que dejarían de funcionar sin ella.
 * Así el formulario nunca guarda combinaciones engañosas.
 */
export function revokePermissionWithDependents(
  granted: ReadonlySet<PermissionCode>,
  permission: PermissionCode,
): Set<PermissionCode> {
  const next = new Set(granted);
  next.delete(permission);

  let changed = true;
  while (changed) {
    changed = false;
    for (const code of [...next]) {
      const dependencies = PERMISSION_DEPENDENCIES[code] ?? [];
      if (dependencies.some((dependency) => !next.has(dependency))) {
        next.delete(code);
        changed = true;
      }
    }
  }

  return next;
}

export function missingPermissionDependencies(
  granted: ReadonlySet<PermissionCode>,
): Array<{ permission: PermissionCode; missing: PermissionCode[] }> {
  const missing: Array<{ permission: PermissionCode; missing: PermissionCode[] }> = [];

  for (const permission of granted) {
    const required = (PERMISSION_DEPENDENCIES[permission] ?? []).filter(
      (dependency) => !granted.has(dependency),
    );
    if (required.length > 0) missing.push({ permission, missing: [...required] });
  }

  return missing;
}

export function hasPermission(granted: readonly string[], permission: PermissionCode): boolean {
  return granted.includes(permission);
}

export function hasAnyPermission(
  granted: readonly string[],
  permissions: readonly PermissionCode[],
): boolean {
  return permissions.some((permission) => granted.includes(permission));
}
