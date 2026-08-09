import { describe, expect, it } from "vitest";
import { avatarObjectPath, avatarUrl, initialsFor } from "@/lib/avatar";

const BASE = "https://proyecto.supabase.co";
const USUARIO = "af6fd0b2-94f1-417a-9d0a-6b326292d2fb";

describe("avatarUrl", () => {
  it("compone la URL pública del bucket", () => {
    expect(avatarUrl(`${USUARIO}/foto.jpg`, BASE)).toBe(
      `${BASE}/storage/v1/object/public/avatars/${USUARIO}/foto.jpg`,
    );
  });

  it("tolera una base con barra final", () => {
    expect(avatarUrl(`${USUARIO}/foto.jpg`, `${BASE}/`)).toBe(
      `${BASE}/storage/v1/object/public/avatars/${USUARIO}/foto.jpg`,
    );
  });

  it("devuelve null sin foto, para que el avatar caiga en las iniciales", () => {
    expect(avatarUrl(null, BASE)).toBeNull();
    expect(avatarUrl(undefined, BASE)).toBeNull();
    expect(avatarUrl("", BASE)).toBeNull();
  });
});

describe("avatarObjectPath", () => {
  it("guarda dentro de la carpeta del usuario, que es lo que autoriza storage", () => {
    expect(avatarObjectPath(USUARIO, "retrato.png").startsWith(`${USUARIO}/`)).toBe(true);
  });

  it("no reutiliza el nombre: la URL de una foto no debe ser adivinable", () => {
    const uno = avatarObjectPath(USUARIO, "foto.jpg");
    const dos = avatarObjectPath(USUARIO, "foto.jpg");

    expect(uno).not.toBe(dos);
  });

  it("normaliza la extensión y descarta la que no reconoce", () => {
    expect(avatarObjectPath(USUARIO, "a.JPEG").endsWith(".jpg")).toBe(true);
    expect(avatarObjectPath(USUARIO, "a.png").endsWith(".png")).toBe(true);
    expect(avatarObjectPath(USUARIO, "a.webp").endsWith(".webp")).toBe(true);
    expect(avatarObjectPath(USUARIO, "sin-extension").endsWith(".jpg")).toBe(true);
  });

  it("produce una ruta que la restricción de la base acepta", () => {
    const patron = /^[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]{1,100}$/;

    expect(patron.test(avatarObjectPath(USUARIO, "foto.jpg"))).toBe(true);
    // Un nombre hostil no puede escapar de la carpeta
    expect(patron.test(avatarObjectPath(USUARIO, "../../otro.jpg"))).toBe(true);
  });
});

describe("initialsFor", () => {
  it("toma nombre y último apellido", () => {
    expect(initialsFor("Isaac Avila Gomez")).toBe("IG");
    expect(initialsFor("Ana Pérez")).toBe("AP");
  });

  it("con una sola palabra usa sus dos primeras letras", () => {
    expect(initialsFor("Logística")).toBe("LO");
  });

  it("no revienta con espacios de más ni con cadena vacía", () => {
    expect(initialsFor("   Ana   Pérez   ")).toBe("AP");
    expect(initialsFor("")).toBe("?");
  });
});
