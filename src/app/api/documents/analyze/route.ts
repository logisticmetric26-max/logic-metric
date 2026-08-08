import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DOCUMENTS_BUCKET, isPdfBuffer } from "@/lib/documents";
import { analyzeRejectionDocument } from "@/services/document-processing";
import { reportError } from "@/lib/errors";

/**
 * §24, §27 · Procesamiento del PDF de rechazo.
 *
 * Vive en el servidor por dos razones: la clave del proveedor de IA nunca sale
 * de aquí, y la descarga del documento se hace con la sesión del usuario, de
 * modo que RLS y las políticas de Storage siguen decidiendo a qué archivos
 * puede acceder (§43).
 *
 * El resultado NO se guarda como motivos definitivos: se devuelve al cliente
 * para que el usuario lo revise y confirme (§26).
 */

// pdfjs y el SDK necesitan Node, no el runtime Edge
export const runtime = "nodejs";
// El análisis de un documento extenso puede tardar
export const maxDuration = 300;

export async function POST(request: Request) {
  const state = await getSessionState();

  if (state.kind !== "ACTIVE") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!state.context.permissions.includes(PERMISSIONS.technicalReviewDocuments.upload)) {
    return NextResponse.json(
      { error: "No tiene permisos para procesar documentos." },
      { status: 403 },
    );
  }

  let documentId: string;

  try {
    const body = (await request.json()) as { documentId?: unknown };
    if (typeof body.documentId !== "string" || body.documentId.length === 0) {
      throw new Error("documentId requerido");
    }
    documentId = body.documentId;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: si el documento pertenece a otro terminal, esta consulta no lo devuelve
  const { data: document, error: documentError } = await supabase
    .from("technical_review_documents")
    .select("id, technical_review_event_id, storage_path, original_name, document_type")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    reportError("analyze.readDocument", documentError);
    return NextResponse.json({ error: "El documento no pudo ser procesado." }, { status: 500 });
  }

  if (!document) {
    return NextResponse.json({ error: "No tiene acceso a este terminal." }, { status: 404 });
  }

  if (document.document_type !== "REJECTION_REPORT") {
    return NextResponse.json(
      { error: "Sólo se analizan documentos de rechazo." },
      { status: 400 },
    );
  }

  // Marca el análisis en curso antes de empezar: si el proceso se cae, el
  // estado no queda como si nunca se hubiera intentado.
  await supabase.from("technical_review_analyses").upsert(
    {
      technical_review_event_id: document.technical_review_event_id,
      document_id: document.id,
      status: "PROCESSING",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    },
    { onConflict: "document_id" },
  );

  // La descarga también pasa por las políticas de Storage
  const { data: file, error: downloadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(document.storage_path);

  if (downloadError || !file) {
    reportError("analyze.download", downloadError);
    await markFailed(supabase, document.id, "El documento no pudo descargarse.");
    return NextResponse.json({ error: "El documento no pudo ser procesado." }, { status: 500 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // §62 · PPU del bus, para verificar que el documento le corresponde.
  // Se lee por la vista, que ya aplica RLS.
  const { data: event } = await supabase
    .from("technical_review_events_view")
    .select("ppu")
    .eq("id", document.technical_review_event_id)
    .maybeSingle();

  // §61 · el contenido real se valida en servidor, no sólo la extensión
  if (!isPdfBuffer(bytes)) {
    await markFailed(supabase, document.id, "El archivo no es un PDF válido.");
    return NextResponse.json(
      { error: "El archivo no es un PDF válido o está dañado." },
      { status: 400 },
    );
  }

  const outcome = await analyzeRejectionDocument(bytes, document.original_name, event?.ppu);

  const { data: analysis, error: updateError } = await supabase
    .from("technical_review_analyses")
    .upsert(
      {
        technical_review_event_id: document.technical_review_event_id,
        document_id: document.id,
        status: outcome.status,
        extraction_method: outcome.extraction_method,
        page_count: outcome.page_count,
        processed_pages: outcome.processed_pages,
        model: outcome.model,
        error_message: outcome.error_message,
        extracted_text: outcome.extracted_text,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "document_id" },
    )
    .select("id")
    .single();

  if (updateError) {
    reportError("analyze.saveAnalysis", updateError);
  }

  // Los motivos viajan al cliente como PROPUESTA. Se guardan sólo cuando el
  // usuario los confirma (§26).
  return NextResponse.json({
    analysis_id: analysis?.id ?? null,
    status: outcome.status,
    extraction_method: outcome.extraction_method,
    page_count: outcome.page_count,
    processed_pages: outcome.processed_pages,
    error_message: outcome.error_message,
    notes: outcome.notes,
    rejections: outcome.rejections,
    plate_check: outcome.plate_check,
    document_number: outcome.document_number,
  });
}

async function markFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  message: string,
) {
  await supabase
    .from("technical_review_analyses")
    .update({
      status: "FAILED",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("document_id", documentId);
}
