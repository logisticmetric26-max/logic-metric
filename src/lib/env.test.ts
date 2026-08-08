import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "@/lib/env";

/**
 * Estas pruebas nacen de un fallo real en producción: la URL del proyecto se
 * copió desde el panel de Supabase con la ruta del API REST incluida y el
 * inicio de sesión dejó de funcionar por completo, con un mensaje que apuntaba
 * a la contraseña. La normalización tiene que aceptar las dos formas.
 */
describe("normalizeSupabaseUrl", () => {
  it("deja intacta la URL base", () => {
    expect(normalizeSupabaseUrl("https://abcd.supabase.co")).toBe("https://abcd.supabase.co");
  });

  it("descarta la ruta del API REST pegada por error", () => {
    expect(normalizeSupabaseUrl("https://abcd.supabase.co/rest/v1/")).toBe(
      "https://abcd.supabase.co",
    );
    expect(normalizeSupabaseUrl("https://abcd.supabase.co/rest/v1")).toBe(
      "https://abcd.supabase.co",
    );
  });

  it("descarta la barra final, los espacios y cualquier query", () => {
    expect(normalizeSupabaseUrl("  https://abcd.supabase.co/  ")).toBe("https://abcd.supabase.co");
    expect(normalizeSupabaseUrl("https://abcd.supabase.co/auth/v1?x=1#y")).toBe(
      "https://abcd.supabase.co",
    );
  });

  it("conserva el puerto en entornos locales", () => {
    expect(normalizeSupabaseUrl("http://localhost:54321/rest/v1")).toBe("http://localhost:54321");
  });

  it("falla de forma explícita si no es una URL", () => {
    expect(() => normalizeSupabaseUrl("sxbwcqzxaknhbcxgxqhx.supabase.co")).toThrow(
      /no es una URL válida/,
    );
    expect(() => normalizeSupabaseUrl("")).toThrow(/no es una URL válida/);
  });
});
