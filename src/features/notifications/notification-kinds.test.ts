import { describe, expect, it } from "vitest";
import {
  countUnread,
  mergeNotification,
  notificationMeta,
} from "@/features/notifications/notification-kinds";
import type { NotificationRow } from "@/types/database.types";

function notif(partial: Partial<NotificationRow> & { id: string; created_at: string }): NotificationRow {
  return {
    terminal_id: null,
    kind: "REVIEW_OPEN",
    title: "Aviso",
    body: null,
    href: null,
    actor_name: null,
    created_by: null,
    ...partial,
  };
}

describe("notificationMeta", () => {
  it("da tono y etiqueta a cada tipo conocido", () => {
    expect(notificationMeta("REVIEW_CLOSE").tone).toBe("success");
    expect(notificationMeta("BAD_LOAD").tone).toBe("danger");
  });

  it("cae en un genérico ante un tipo desconocido, sin romper", () => {
    const meta = notificationMeta("ALGO_NUEVO");
    expect(meta.icon).toBe("Bell");
    expect(meta.label).toBe("Aviso");
  });
});

describe("countUnread", () => {
  const items = [
    notif({ id: "1", created_at: "2026-08-14T12:00:00Z" }),
    notif({ id: "2", created_at: "2026-08-14T11:00:00Z" }),
    notif({ id: "3", created_at: "2026-08-14T10:00:00Z" }),
  ];

  it("cuenta los posteriores a la última vez que se miró", () => {
    expect(countUnread(items, "2026-08-14T10:30:00Z")).toBe(2);
  });

  it("sin marca previa, todo está sin leer", () => {
    expect(countUnread(items, null)).toBe(3);
    expect(countUnread(items, "fecha-basura")).toBe(3);
  });

  it("con todo visto, cero sin leer", () => {
    expect(countUnread(items, "2026-08-14T12:00:01Z")).toBe(0);
  });
});

describe("mergeNotification", () => {
  it("añade el nuevo al frente", () => {
    const result = mergeNotification(
      [notif({ id: "1", created_at: "2026-08-14T10:00:00Z" })],
      notif({ id: "2", created_at: "2026-08-14T11:00:00Z" }),
    );
    expect(result[0].id).toBe("2");
    expect(result).toHaveLength(2);
  });

  it("ignora un duplicado — Realtime puede reenviar el mismo evento", () => {
    const existing = [notif({ id: "1", created_at: "2026-08-14T10:00:00Z" })];
    const result = mergeNotification(existing, notif({ id: "1", created_at: "2026-08-14T10:00:00Z" }));
    expect(result).toBe(existing);
  });

  it("recorta la lista al máximo", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      notif({ id: `n${i}`, created_at: `2026-08-14T10:${String(i).padStart(2, "0")}:00Z` }),
    );
    const result = mergeNotification(many, notif({ id: "nuevo", created_at: "2026-08-14T13:00:00Z" }), 40);
    expect(result).toHaveLength(40);
    expect(result[0].id).toBe("nuevo");
    expect(result.some((n) => n.id === "n39")).toBe(false);
  });
});
