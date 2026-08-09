import { z } from "zod";
import {
  dateSchema,
  guideNumberSchema,
  optionalDateSchema,
  requiredText,
  uuidSchema,
  workOrderSchema,
} from "@/schemas/common";
import { formatPersonName, hasNameAndSurname } from "@/lib/person-name";

/**
 * §18-§35 · Reglas del proceso de revisión técnica.
 *
 * Estas validaciones acompañan a las de la base; no las sustituyen. El cierre
 * de una revisión se ejecuta en una función PostgreSQL que vuelve a comprobarlo
 * todo de forma transaccional (§60).
 */

// §18 · Registro de salida a planta
export const openReviewSchema = z.object({
  fleet_id: uuidSchema,
  // Un solo campo, pero con nombre Y apellido: el registro puede acabar en una
  // auditoría, y «Juan» no identifica a nadie. Se normaliza al guardar para que
  // el mismo conductor no figure como «JUAN PEREZ», «juan perez» y «Juan Perez»
  // en tres filas distintas del historial.
  driver_name: requiredText("el nombre del conductor", 160)
    .refine(hasNameAndSurname, "Ingrese el nombre y el apellido del conductor.")
    .transform(formatPersonName),
  // Opcional: por defecto es el momento del registro
  departure_at: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine(
      (value) => value === null || !Number.isNaN(Date.parse(value)),
      "La fecha y hora de salida no es válida.",
    ),
});

// §21-§23 · Cierre
export const closeReviewSchema = z
  .object({
    event_id: uuidSchema,
    result: z.enum(["APPROVED", "REJECTED"], {
      message: "Debe indicar si la revisión fue aprobada o rechazada.",
    }),
    guide_number: guideNumberSchema,
    expiration_date: optionalDateSchema,
    return_at: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .refine(
        (value) => value === null || !Number.isNaN(Date.parse(value)),
        "La fecha y hora de regreso no es válida.",
      ),
  })
  // §22 · APROBADO exige fecha de vencimiento
  .refine((data) => data.result !== "APPROVED" || data.expiration_date !== null, {
    message: "Debe ingresar una fecha de vencimiento.",
    path: ["expiration_date"],
  });

// §25, §26 · Motivos de rechazo confirmados por el usuario
export const rejectionItemSchema = z.object({
  description: requiredText("la descripción del motivo", 4000),
  source_text: z.string().trim().max(8000).nullable().optional(),
  page_number: z.number().int().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  requires_review: z.boolean().default(false),
  detection_source: z.enum(["TEXT_LAYER", "OCR", "MANUAL"]).default("MANUAL"),
  origin: z.enum(["AUTOMATIC", "AUTOMATIC_EDITED", "MANUAL"]).default("MANUAL"),
  original_description: z.string().trim().max(4000).nullable().optional(),
});

export const saveRejectionsSchema = z.object({
  event_id: uuidSchema,
  items: z.array(rejectionItemSchema),
});

// Una eliminación histórica siempre apunta a un único evento conocido.
export const deleteReviewHistorySchema = z.object({
  event_id: uuidSchema,
});

// §30-§32 · Registro de bus NO enviado a planta
export const notSentSchema = z.object({
  fleet_id: uuidSchema,
  event_date: dateSchema,
  // §31 · el motivo es obligatorio y de texto libre: no se inventa un catálogo
  reason: requiredText("el motivo por el cual el bus no fue enviado", 2000),
  // §32 · la OT es opcional
  work_order_number: workOrderSchema,
});

export const notSentUpdateSchema = notSentSchema.extend({ id: uuidSchema });

// §42 · Metadata de un documento ya subido a Storage
export const documentSchema = z.object({
  event_id: uuidSchema,
  document_type: z.enum(["TECHNICAL_REVIEW", "GAS_REVIEW", "REJECTION_REPORT"]),
  original_name: z.string().trim().min(1).max(255),
  storage_path: z.string().trim().min(1).max(500),
  size_bytes: z.number().int().positive().max(26_214_400),
  mime_type: z.literal("application/pdf"),
});

export type OpenReviewInput = z.infer<typeof openReviewSchema>;
export type CloseReviewInput = z.infer<typeof closeReviewSchema>;
export type RejectionItemInput = z.infer<typeof rejectionItemSchema>;
export type NotSentInput = z.infer<typeof notSentSchema>;
