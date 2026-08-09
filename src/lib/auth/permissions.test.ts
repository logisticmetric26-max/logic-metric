import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_CODES,
  PERMISSION_DEPENDENCIES,
  grantPermissionWithDependencies,
  isPermissionCode,
  missingPermissionDependencies,
  revokePermissionWithDependents,
  type PermissionCode,
} from "@/lib/auth/permissions";

describe("catálogo de permisos", () => {
  it("contiene sólo códigos únicos y reconocidos", () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
    expect(PERMISSION_CODES).toHaveLength(24);
    expect(PERMISSION_CODES.every(isPermissionCode)).toBe(true);
  });

  it("no publica capacidades sin implementación independiente", () => {
    expect(isPermissionCode("technical_review.edit")).toBe(false);
    expect(isPermissionCode("audit.view")).toBe(false);
  });

  it("sólo referencia dependencias existentes y no contiene ciclos", () => {
    for (const [code, dependencies] of Object.entries(PERMISSION_DEPENDENCIES)) {
      expect(isPermissionCode(code)).toBe(true);
      for (const dependency of dependencies) {
        expect(isPermissionCode(dependency)).toBe(true);
        expect(dependency).not.toBe(code);
      }
    }

    function visit(code: PermissionCode, path: Set<PermissionCode>) {
      expect(path.has(code)).toBe(false);
      const nextPath = new Set(path).add(code);
      for (const dependency of PERMISSION_DEPENDENCIES[code] ?? []) {
        visit(dependency, nextPath);
      }
    }

    for (const code of PERMISSION_CODES) visit(code, new Set());
  });

  it("completa todos los requisitos al conceder una capacidad", () => {
    const selected = grantPermissionWithDependencies(
      new Set(),
      PERMISSIONS.technicalReview.close,
    );

    expect(selected).toEqual(
      new Set([
        PERMISSIONS.technicalReview.close,
        PERMISSIONS.technicalReview.view,
        PERMISSIONS.technicalReviewDocuments.view,
        PERMISSIONS.technicalReviewDocuments.upload,
      ]),
    );
    expect(missingPermissionDependencies(selected)).toEqual([]);
  });

  it("retira las capacidades que dejan de funcionar al quitar un requisito", () => {
    let selected = new Set<PermissionCode>();
    selected = grantPermissionWithDependencies(selected, PERMISSIONS.technicalReview.create);
    selected = grantPermissionWithDependencies(selected, PERMISSIONS.technicalReview.close);
    selected = grantPermissionWithDependencies(selected, PERMISSIONS.technicalReview.delete);
    selected = grantPermissionWithDependencies(selected, PERMISSIONS.notSent.view);

    const remaining = revokePermissionWithDependents(
      selected,
      PERMISSIONS.technicalReview.view,
    );

    expect(remaining).toEqual(new Set([PERMISSIONS.notSent.view]));
  });
});
