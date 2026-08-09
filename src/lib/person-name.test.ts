import { describe, expect, it } from "vitest";
import { formatPersonName, hasNameAndSurname, normalizePersonName } from "@/lib/person-name";

describe("hasNameAndSurname", () => {
  it("acepta nombre y apellido", () => {
    expect(hasNameAndSurname("Juan Pérez")).toBe(true);
    expect(hasNameAndSurname("  María   José  Soto ")).toBe(true);
  });

  it("rechaza una sola palabra", () => {
    expect(hasNameAndSurname("Juan")).toBe(false);
    expect(hasNameAndSurname("   ")).toBe(false);
  });

  it("no acepta una inicial como apellido", () => {
    // «Juan P.» no identifica a nadie en un registro que puede auditarse
    expect(hasNameAndSurname("Juan P.")).toBe(false);
    expect(hasNameAndSurname("J. Pérez")).toBe(false);
  });
});

describe("formatPersonName", () => {
  it("unifica mayúsculas para que un conductor no aparezca de tres formas", () => {
    expect(formatPersonName("JUAN PEREZ")).toBe("Juan Perez");
    expect(formatPersonName("juan perez")).toBe("Juan Perez");
    expect(formatPersonName("jUaN   pErEz")).toBe("Juan Perez");
  });

  it("respeta las partículas de los apellidos compuestos", () => {
    expect(formatPersonName("JUAN DE LA CRUZ")).toBe("Juan de la Cruz");
    expect(formatPersonName("ana del rio")).toBe("Ana del Rio");
  });

  it("conserva los acentos", () => {
    expect(formatPersonName("josé ávila")).toBe("José Ávila");
  });
});

describe("normalizePersonName", () => {
  it("colapsa los espacios sobrantes", () => {
    expect(normalizePersonName("  Juan    Pérez  ")).toBe("Juan Pérez");
  });
});
