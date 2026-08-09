import { describe, expect, it } from "vitest";
import { PRESENCE_HEARTBEAT_MS, resolvePresence, timeAgo } from "@/lib/presence";

const AHORA = new Date("2026-08-09T12:00:00Z");
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

describe("resolvePresence", () => {
  it("marca conectado a quien dio señal dentro de la ventana", () => {
    const presencia = resolvePresence(
      { lastSeenAt: hace(MINUTO), lastLoginAt: hace(HORA) },
      AHORA,
    );

    expect(presencia.state).toBe("ONLINE");
    expect(presencia.label).toBe("Conectado");
  });

  it("tolera que se pierda una señal sin declarar desconectado", () => {
    // Un latido perdido por un cambio de red no debe sacar a nadie de la lista
    const presencia = resolvePresence(
      { lastSeenAt: hace(PRESENCE_HEARTBEAT_MS * 2), lastLoginAt: hace(DIA) },
      AHORA,
    );

    expect(presencia.state).toBe("ONLINE");
  });

  it("deja de considerarlo conectado pasada la ventana completa", () => {
    const presencia = resolvePresence(
      { lastSeenAt: hace(PRESENCE_HEARTBEAT_MS * 3 + 1000), lastLoginAt: hace(DIA) },
      AHORA,
    );

    expect(presencia.state).toBe("RECENT");
    expect(presencia.detail).toContain("hace");
  });

  it("distingue «hace poco» de «desconectado» en el día", () => {
    expect(resolvePresence({ lastSeenAt: hace(3 * HORA), lastLoginAt: null }, AHORA).state).toBe(
      "RECENT",
    );
    expect(resolvePresence({ lastSeenAt: hace(3 * DIA), lastLoginAt: null }, AHORA).state).toBe(
      "AWAY",
    );
  });

  it("identifica al que nunca se ha conectado", () => {
    const presencia = resolvePresence({ lastSeenAt: null, lastLoginAt: null }, AHORA);

    expect(presencia.state).toBe("NEVER");
    expect(presencia.label).toBe("Nunca se ha conectado");
  });

  it("usa el último acceso cuando no hay señal de actividad", () => {
    // Sesión iniciada y pestaña cerrada de inmediato: hay login, no hay señal
    const presencia = resolvePresence({ lastSeenAt: null, lastLoginAt: hace(2 * DIA) }, AHORA);

    expect(presencia.state).toBe("AWAY");
    expect(presencia.detail).toBe("hace 2 días");
  });
});

describe("timeAgo", () => {
  it("redacta cada escala en singular y plural", () => {
    expect(timeAgo(new Date(AHORA.getTime() - 30_000), AHORA)).toBe("hace un momento");
    expect(timeAgo(new Date(AHORA.getTime() - MINUTO), AHORA)).toBe("hace 1 minuto");
    expect(timeAgo(new Date(AHORA.getTime() - 5 * MINUTO), AHORA)).toBe("hace 5 minutos");
    expect(timeAgo(new Date(AHORA.getTime() - HORA), AHORA)).toBe("hace 1 hora");
    expect(timeAgo(new Date(AHORA.getTime() - 5 * DIA), AHORA)).toBe("hace 5 días");
    expect(timeAgo(new Date(AHORA.getTime() - 45 * DIA), AHORA)).toBe("hace 1 mes");
    expect(timeAgo(new Date(AHORA.getTime() - 400 * DIA), AHORA)).toBe("hace 1 año");
  });

  it("nunca produce un tiempo negativo con relojes desfasados", () => {
    // El reloj del navegador puede ir por detrás del servidor
    expect(timeAgo(new Date(AHORA.getTime() + 60_000), AHORA)).toBe("hace un momento");
  });
});
