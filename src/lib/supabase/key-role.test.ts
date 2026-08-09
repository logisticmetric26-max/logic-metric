import { describe, expect, it } from "vitest";
import { claimedRole } from "@/lib/supabase/key-role";

/**
 * Se construyen JWT de prueba con firma inventada: la función sólo lee el
 * cuerpo, nunca valida la firma, y no debe hacerlo — su trabajo es explicar un
 * 401, no autenticar.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.firma-irrelevante`;
}

describe("claimedRole", () => {
  it("distingue la clave de servicio de la anónima", () => {
    expect(claimedRole(fakeJwt({ role: "service_role", iss: "supabase" }))).toBe("service_role");
    expect(claimedRole(fakeJwt({ role: "anon", iss: "supabase" }))).toBe("anon");
  });

  it("tolera espacios y saltos de línea del copiado", () => {
    expect(claimedRole(`  ${fakeJwt({ role: "service_role" })}\n`)).toBe("service_role");
  });

  it("marca como «otro» un rol desconocido", () => {
    expect(claimedRole(fakeJwt({ role: "authenticated" }))).toBe("otro");
    expect(claimedRole(fakeJwt({ sin_rol: true }))).toBe("otro");
  });

  it("no revienta con valores que no son un JWT", () => {
    expect(claimedRole("")).toBe("no_es_jwt");
    expect(claimedRole("sb_secret_algo")).toBe("no_es_jwt");
    expect(claimedRole("a.b.c")).toBe("no_es_jwt");
  });
});
