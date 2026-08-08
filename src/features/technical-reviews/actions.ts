"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actionError, actionSuccess, reportError, type ActionResult } from "@/lib/errors";
import { toFieldErrors } from "@/schemas/common";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import {
  closeReviewSchema,
  documentSchema,
  notSentSchema,
  notSentUpdateSchema,
  openReviewSchema,
  saveRejectionsSchema,
} from "@/features/technical-reviews/schemas";

const REVIEW_PATHS = [
  "/revision-tecnica",
  "/revision-tecnica/en-revision",
  "/revision-tecnica/no-enviados",
  "/revision-tecnica/rechazados",
  "/revision-tecnica/vencimientos",
  "/revision-tecnica/historial",
];

function revalidateReviews() {
  for (const path of REVIEW_PATHS) revalidatePath(path);
}

// =============================================================================
// §18 · Registro de salida a planta
// =============================================================================
/**
 * Abre un proceso de revisión.
 *
 * Delega en la función `open_technical_review`, que dentro de una transacción
 * valida permiso, acceso al terminal y —sobre todo— que el bus no tenga ya un
 * proceso abierto. Esa unicidad la garantiza un índice parcial, así que dos
 * usuarios pulsando a la vez no pueden crear dos procesos (§19, §52).
 */
export async function openReviewAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.technicalReview.create)) {
    return actionError("No tiene permisos para registrar salidas a planta.");
  }

  const parsed = openReviewSchema.safeParse({
    fleet_id: formData.get("fleet_id"),
    driver_name: formData.get("driver_name"),
    departure_at: formData.get("departure_at") ?? "",
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("open_technical_review", {
    p_fleet_id: parsed.data.fleet_id,
    p_driver_name: parsed.data.driver_name,
    p_departure_at: parsed.data.departure_at,
  });

  if (error) return actionError(reportError("openReview", error));

  revalidateReviews();
  return actionSuccess({ id: data as string });
}

// =============================================================================
// §21-§23, §60 · Cierre de revisión
// =============================================================================
/**
 * Cierra el proceso EXISTENTE; nunca crea uno nuevo (§21).
 *
 * Toda la validación crítica ocurre dentro de `close_technical_review`:
 * que siga abierto, los documentos obligatorios según el resultado, el número
 * de guía y la fecha de vencimiento. Es transaccional y toma un bloqueo sobre
 * la fila, de modo que un segundo cierre simultáneo se rechaza (§59).
 */
export async function closeReviewAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.technicalReview.close)) {
    return actionError("No tiene permisos para cerrar revisiones.");
  }

  const parsed = closeReviewSchema.safeParse({
    event_id: formData.get("event_id"),
    result: formData.get("result"),
    guide_number: formData.get("guide_number"),
    expiration_date: formData.get("expiration_date") ?? "",
    return_at: formData.get("return_at") ?? "",
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("close_technical_review", {
    p_event_id: parsed.data.event_id,
    p_result: parsed.data.result,
    p_guide_number: parsed.data.guide_number,
    // §23 · un rechazo nunca fija vencimiento; la base lo ignora igualmente
    p_expiration_date: parsed.data.result === "APPROVED" ? parsed.data.expiration_date : null,
    p_return_at: parsed.data.return_at,
  });

  if (error) return actionError(reportError("closeReview", error));

  revalidateReviews();
  return actionSuccess();
}

// =============================================================================
// §41, §42 · Documentos
// =============================================================================
/**
 * Registra la metadata de un archivo ya subido a Storage.
 *
 * El archivo lo sube el navegador directamente al bucket con su propia sesión,
 * así que las políticas de Storage ya verificaron el terminal. Aquí se guarda
 * la metadata, y un trigger comprueba que la ruta corresponda exactamente a
 * este terminal, bus y evento (§43).
 */
export async function registerDocumentAction(input: {
  eventId: string;
  documentType: "TECHNICAL_REVIEW" | "GAS_REVIEW" | "REJECTION_REPORT";
  originalName: string;
  storagePath: string;
  sizeBytes: number;
}): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.technicalReviewDocuments.upload)) {
    return actionError("No tiene permisos para cargar documentos.");
  }

  const parsed = documentSchema.safeParse({
    event_id: input.eventId,
    document_type: input.documentType,
    original_name: input.originalName,
    storage_path: input.storagePath,
    size_bytes: input.sizeBytes,
    mime_type: "application/pdf",
  });

  if (!parsed.success) {
    return actionError("El documento no pudo ser procesado.");
  }

  const supabase = await createClient();

  // Volver a subir un documento del mismo tipo reemplaza al anterior:
  // se borra primero para que el índice único no lo impida.
  const { data: previous } = await supabase
    .from("technical_review_documents")
    .select("id, storage_path")
    .eq("technical_review_event_id", parsed.data.event_id)
    .eq("document_type", parsed.data.document_type)
    .maybeSingle();

  if (previous) {
    await supabase.from("technical_review_documents").delete().eq("id", previous.id);
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([previous.storage_path]);
  }

  const { data, error } = await supabase
    .from("technical_review_documents")
    .insert({
      technical_review_event_id: parsed.data.event_id,
      document_type: parsed.data.document_type,
      original_name: parsed.data.original_name,
      storage_path: parsed.data.storage_path,
      mime_type: parsed.data.mime_type,
      size_bytes: parsed.data.size_bytes,
      uploaded_by: context.profile.id,
    })
    .select("id")
    .single();

  if (error) return actionError(reportError("registerDocument", error));

  revalidateReviews();
  return actionSuccess({ id: data.id });
}

/**
 * §43 · URL firmada temporal para descargar un documento.
 *
 * Sólo se genera si RLS deja ver la metadata; y aunque se filtrara el enlace,
 * caduca en pocos minutos. Los archivos nunca son públicos.
 */
export async function getDocumentUrlAction(documentId: string): Promise<ActionResult<{ url: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.technicalReviewDocuments.view)) {
    return actionError("No tiene permisos para ver documentos.");
  }

  const supabase = await createClient();

  const { data: document, error } = await supabase
    .from("technical_review_documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error) return actionError(reportError("getDocumentUrl.read", error));
  if (!document) return actionError("No tiene acceso a este terminal.");

  const { data, error: signError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(document.storage_path, 300);

  if (signError || !data) return actionError(reportError("getDocumentUrl.sign", signError));

  return actionSuccess({ url: data.signedUrl });
}

// =============================================================================
// §25, §26 · Motivos de rechazo
// =============================================================================
/**
 * Guarda el conjunto de motivos confirmado por el usuario.
 *
 * Se conserva la distinción entre lo que detectó el análisis y lo que corrigió
 * o agregó una persona, junto con el fragmento de origen: sin eso no habría
 * forma de demostrar que el sistema no inventó nada (§25, §28).
 */
export async function saveRejectionsAction(
  eventId: string,
  items: unknown,
): Promise<ActionResult<{ count: number }>> {
  const context = await requireActiveUser();

  const canEdit =
    context.permissions.includes(PERMISSIONS.technicalReview.close) ||
    context.permissions.includes(PERMISSIONS.technicalReview.edit);

  if (!canEdit) {
    return actionError("No tiene permisos para registrar motivos de rechazo.");
  }

  const parsed = saveRejectionsSchema.safeParse({ event_id: eventId, items });

  if (!parsed.success) {
    return actionError("Revise los motivos de rechazo ingresados.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("save_review_rejections", {
    p_event_id: parsed.data.event_id,
    p_items: parsed.data.items,
  });

  if (error) return actionError(reportError("saveRejections", error));

  revalidateReviews();
  return actionSuccess({ count: data as number });
}

// =============================================================================
// §30-§35 · Buses no enviados a planta
// =============================================================================
/**
 * Registra un no envío.
 *
 * No abre proceso, no admite documentos y no altera el vencimiento del bus
 * (§33, §34): la tabla ni siquiera tiene columnas para ello. `terminal_id` y
 * `created_by` los fija el servidor a partir del bus y de la sesión.
 */
export async function createNotSentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.notSent.create)) {
    return actionError("No tiene permisos para registrar buses no enviados.");
  }

  const parsed = notSentSchema.safeParse({
    fleet_id: formData.get("fleet_id"),
    event_date: formData.get("event_date"),
    reason: formData.get("reason"),
    work_order_number: formData.get("work_order_number") ?? "",
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("technical_review_not_sent")
    .insert({
      fleet_id: parsed.data.fleet_id,
      event_date: parsed.data.event_date,
      reason: parsed.data.reason,
      work_order_number: parsed.data.work_order_number,
      created_by: context.profile.id,
    })
    .select("id")
    .single();

  if (error) return actionError(reportError("createNotSent", error));

  revalidateReviews();
  return actionSuccess({ id: data.id });
}

export async function updateNotSentAction(formData: FormData): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.notSent.edit)) {
    return actionError("No tiene permisos para editar registros de no envío.");
  }

  const parsed = notSentUpdateSchema.safeParse({
    id: formData.get("id"),
    fleet_id: formData.get("fleet_id"),
    event_date: formData.get("event_date"),
    reason: formData.get("reason"),
    work_order_number: formData.get("work_order_number") ?? "",
  });

  if (!parsed.success) {
    return actionError("Revise los datos ingresados.", toFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("technical_review_not_sent")
    .update({
      fleet_id: parsed.data.fleet_id,
      event_date: parsed.data.event_date,
      reason: parsed.data.reason,
      work_order_number: parsed.data.work_order_number,
    })
    .eq("id", parsed.data.id);

  if (error) return actionError(reportError("updateNotSent", error));

  revalidateReviews();
  return actionSuccess();
}

export async function deleteNotSentAction(id: string): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.notSent.delete)) {
    return actionError("No tiene permisos para eliminar registros de no envío.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("technical_review_not_sent").delete().eq("id", id);

  if (error) return actionError(reportError("deleteNotSent", error));

  revalidateReviews();
  return actionSuccess();
}

// =============================================================================
// §38 · Umbral configurable de "próximo a vencer"
// =============================================================================
export async function setExpiringSoonDaysAction(days: number): Promise<ActionResult> {
  const context = await requireActiveUser();

  if (!context.permissions.includes(PERMISSIONS.settings.manage)) {
    return actionError("No tiene permisos para modificar la configuración.");
  }

  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return actionError("Indique un número de días entre 1 y 365.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("app_settings")
    .update({ value: days, updated_by: context.profile.id })
    .eq("key", "technical_review.expiring_soon_days");

  if (error) return actionError(reportError("setExpiringSoonDays", error));

  revalidateReviews();
  return actionSuccess();
}
