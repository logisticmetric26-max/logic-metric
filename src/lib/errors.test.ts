import { describe, expect, it } from "vitest";
import { GENERIC_ERROR_MESSAGE, toUserMessage } from "./errors";

/**
 * §63 · Mensajes de error.
 *
 * Los códigos que emite PostgreSQL deben llegar al usuario como las frases
 * exactas del requerimiento, y nunca como texto crudo del motor.
 */
describe("toUserMessage", () => {
  it("traduce los códigos de negocio a los mensajes del requerimiento", () => {
    const cases: [string, string][] = [
      ["TECHNICAL_REVIEW_DOCUMENT_REQUIRED", "Debe adjuntar el documento de Revisión Técnica."],
      ["GAS_REVIEW_DOCUMENT_REQUIRED", "Debe adjuntar el documento de Revisión de Gases."],
      ["REJECTION_DOCUMENT_REQUIRED", "Debe adjuntar el documento de rechazo."],
      ["GUIDE_NUMBER_REQUIRED", "Debe ingresar un número de guía."],
      ["EXPIRATION_DATE_REQUIRED", "Debe ingresar una fecha de vencimiento."],
      ["REVIEW_ALREADY_OPEN", "Este bus ya tiene una revisión técnica abierta."],
      [
        "NOT_SENT_REASON_REQUIRED",
        "Debe ingresar el motivo por el cual el bus no fue enviado.",
      ],
      ["TERMINAL_ACCESS_DENIED", "No tiene acceso a este terminal."],
      ["USER_SUSPENDED", "Su usuario se encuentra suspendido."],
      ["DOCUMENT_PROCESSING_FAILED", "El documento no pudo ser procesado."],
      ["DOCUMENT_NEEDS_REVIEW", "Algunos datos requieren revisión manual."],
    ];

    for (const [code, message] of cases) {
      expect(toUserMessage(new Error(`error: ${code}`))).toBe(message);
    }
  });

  it("traduce el índice de unicidad de proceso abierto", () => {
    expect(
      toUserMessage(
        new Error('duplicate key value violates unique constraint "tre_one_open_per_fleet_idx"'),
      ),
    ).toBe("Este bus ya tiene una revisión técnica abierta.");
  });

  it("traduce las restricciones de unicidad de flota y usuarios", () => {
    expect(toUserMessage(new Error('violates unique constraint "fleet_ppu_unique_idx"'))).toBe(
      "Ya existe un bus registrado con esa PPU.",
    );
    expect(
      toUserMessage(new Error('violates unique constraint "profiles_rut_unique_idx"')),
    ).toBe("Ya existe un usuario registrado con ese RUT.");
  });

  it("traduce las dependencias que bloquean la eliminacion de un terminal", () => {
    const cases: [string, string][] = [
      [
        'update or delete on table "terminals" violates foreign key constraint "fleet_terminal_id_fkey" on table "fleet"',
        "No se puede eliminar el terminal porque tiene buses asociados.",
      ],
      [
        'update or delete on table "terminals" violates foreign key constraint "technical_review_events_terminal_id_fkey" on table "technical_review_events"',
        "No se puede eliminar el terminal porque tiene revisiones técnicas asociadas.",
      ],
      [
        'update or delete on table "terminals" violates foreign key constraint "bus_wash_records_terminal_id_fkey" on table "bus_wash_records"',
        "No se puede eliminar el terminal porque tiene registros de lavado de buses asociados.",
      ],
      [
        'update or delete on table "terminals" violates foreign key constraint "fuel_delivery_schedules_terminal_id_fkey" on table "fuel_delivery_schedules"',
        "No se puede eliminar el terminal porque tiene llegadas de combustible asociadas.",
      ],
      [
        'update or delete on table "terminals" violates foreign key constraint "bad_fuel_loads_terminal_id_fkey" on table "bad_fuel_loads"',
        "No se puede eliminar el terminal porque tiene malas cargas de combustible asociadas.",
      ],
    ];

    for (const [raw, message] of cases) {
      expect(toUserMessage(new Error(raw))).toBe(message);
    }
  });

  it("traduce un rechazo de RLS como falta de acceso al terminal", () => {
    expect(
      toUserMessage(new Error('new row violates row-level security policy for table "fleet"')),
    ).toBe("No tiene acceso a este terminal.");
  });

  it("traduce PERMISSION_DENIED sin filtrar el permiso interno", () => {
    const message = toUserMessage(new Error("PERMISSION_DENIED:technical_review.close"));
    expect(message).toBe("No tiene permisos para realizar esta acción.");
    expect(message).not.toContain("technical_review.close");
  });

  it("nunca devuelve el texto crudo de un error desconocido", () => {
    const raw =
      'PostgresError: relation "public.secreto" does not exist at character 15 (SQLSTATE 42P01)';
    const message = toUserMessage(new Error(raw));

    expect(message).toBe(GENERIC_ERROR_MESSAGE);
    expect(message).not.toContain("SQLSTATE");
    expect(message).not.toContain("secreto");
  });

  it("no falla ante entradas nulas o vacías", () => {
    expect(toUserMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage({})).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage("")).toBe(GENERIC_ERROR_MESSAGE);
  });
});
