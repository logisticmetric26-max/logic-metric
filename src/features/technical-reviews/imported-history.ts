/**
 * Revisiones que vienen de la importación de la planilla histórica.
 *
 * La migración `20260809000200_technical_review_history_import.sql` trajo 912
 * revisiones aprobadas cuyo origen sólo tenía número interno, PPU, resultado,
 * número de guía y vencimiento. La planilla NO tenía hora de salida ni de
 * regreso, así que la importación las fabricó anclándolas al vencimiento: por
 * eso todas salen a las 12:10 y regresan a las 12:15.
 *
 * Esos datos son reales en lo que identifica al proceso —bus, guía, resultado,
 * vencimiento— e INVENTADOS en el horario y el conductor. Mostrarlos como si
 * fueran una salida registrada convierte un dato ausente en uno falso, que es
 * peor que no tener nada.
 *
 * Se reconocen por el conductor, que la importación dejó marcado a propósito.
 */
export const LEGACY_DRIVER_NAME = "IMPORTACION HISTORICA";

export function isImportedReview(driverName: string | null | undefined): boolean {
  return (driverName ?? "").trim().toUpperCase() === LEGACY_DRIVER_NAME;
}
