/**
 * Traducción de errores técnicos a mensajes para el usuario (§63).
 *
 * Las reglas de negocio se emiten desde PostgreSQL como códigos estables
 * (`REVIEW_ALREADY_OPEN`, `GUIDE_NUMBER_REQUIRED`, …). Aquí se convierten en
 * frases claras.
 *
 * Nunca se muestra un stack trace ni el mensaje crudo del motor: si un error no
 * está catalogado se devuelve un texto genérico y el detalle queda en el log
 * del servidor.
 */

const MESSAGES: Record<string, string> = {
  // Documentos y cierre de revisión
  TECHNICAL_REVIEW_DOCUMENT_REQUIRED: "Debe adjuntar el documento de Revisión Técnica.",
  GAS_REVIEW_DOCUMENT_REQUIRED: "Debe adjuntar el documento de Revisión de Gases.",
  REJECTION_DOCUMENT_REQUIRED: "Debe adjuntar el documento de rechazo.",
  GUIDE_NUMBER_REQUIRED: "Debe ingresar un número de guía.",
  EXPIRATION_DATE_REQUIRED: "Debe ingresar una fecha de vencimiento.",
  INVALID_RESULT: "Debe indicar si la revisión fue aprobada o rechazada.",
  RETURN_BEFORE_DEPARTURE: "La fecha de regreso no puede ser anterior a la de salida.",

  // Proceso de revisión
  REVIEW_ALREADY_OPEN: "Este bus ya tiene una revisión técnica abierta.",
  REVIEW_ALREADY_CLOSED: "Esta revisión ya fue cerrada por otro usuario.",
  REVIEW_NOT_FOUND: "La revisión indicada no existe o no está disponible.",
  CLOSED_REVIEW_IS_IMMUTABLE: "Una revisión cerrada no puede modificarse.",

  // Flota
  FLEET_NOT_FOUND: "El bus indicado no existe.",
  FLEET_INACTIVE: "El bus se encuentra desactivado.",
  PPU_REQUIRED: "Debe ingresar la PPU del bus.",
  INTERNAL_NUMBER_REQUIRED: "Debe ingresar el número interno del bus.",

  // No enviados
  NOT_SENT_REASON_REQUIRED: "Debe ingresar el motivo por el cual el bus no fue enviado.",

  // Accesos
  TERMINAL_ACCESS_DENIED: "No tiene acceso a este terminal.",
  USER_SUSPENDED: "Su usuario se encuentra suspendido.",
  SELF_PRIVILEGE_CHANGE_DENIED: "No puede modificar su propio rol, estado ni terminales.",
  RUT_IS_IMMUTABLE: "El RUT de un usuario no puede modificarse.",
  INVALID_RUT: "El RUT ingresado no es válido.",
  TERMINAL_NAME_REQUIRED: "Debe ingresar el nombre del terminal.",
  DRIVER_NAME_REQUIRED: "Debe ingresar el nombre del conductor.",
  FUEL_DELIVERY_ALREADY_CONFIRMED: "Una llegada ya confirmada no puede modificarse.",
  FUEL_DELIVERY_CONFIRMATION_REQUIRED: "Debe confirmar la llegada con fecha y responsable.",
  FUEL_DELIVERY_EDIT_PERMISSION_REQUIRED: "No tiene permisos para reprogramar esta llegada.",
  FUEL_DELIVERY_CONFIRM_PERMISSION_REQUIRED: "No tiene permisos para confirmar esta llegada.",
  FUEL_DELIVERY_IMMUTABLE_FIELDS: "No es posible alterar los datos base del registro.",
  BUS_WASH_IMMUTABLE_FIELDS: "No es posible alterar los datos base del registro diario.",

  // Documentos / almacenamiento
  INVALID_STORAGE_PATH: "El documento no pudo ser almacenado correctamente.",
  DOCUMENT_PROCESSING_FAILED: "El documento no pudo ser procesado.",
  DOCUMENT_NEEDS_REVIEW: "Algunos datos requieren revisión manual.",
};

/** Restricciones de la base cuyo nombre revela la causa real. */
const CONSTRAINT_MESSAGES: Array<[RegExp, string]> = [
  [/tre_one_open_per_fleet_idx/, "Este bus ya tiene una revisión técnica abierta."],
  [/fleet_ppu_unique_idx/, "Ya existe un bus registrado con esa PPU."],
  [/fleet_internal_number_unique_idx/, "Ya existe un bus registrado con ese número interno."],
  [/profiles_rut_unique_idx/, "Ya existe un usuario registrado con ese RUT."],
  [/terminals_name_unique_idx/, "Ya existe un terminal con ese nombre."],
  [/terminals_code_unique_idx/, "Ya existe un terminal con ese código."],
  [/roles_name_unique_idx/, "Ya existe un rol con ese nombre."],
  [/fuel_delivery_unique_slot_idx/, "Ya existe una llegada programada para ese terminal, producto y ventana."],
  [/bus_wash_records_fleet_date_idx/, "Ya existe un registro diario para este bus."],
  [/trd_event_type_unique_idx/, "Ya existe un documento de ese tipo en esta revisión."],
  [/tre_approved_requires_expiration/, "Debe ingresar una fecha de vencimiento."],
  [/tre_rejected_has_no_expiration/, "Una revisión rechazada no fija una nueva fecha de vencimiento."],
  [/fleet_ppu_format/, "La PPU ingresada no tiene un formato válido."],
  [/trns_work_order_check/, "El número de OT ingresado no tiene un formato válido."],
  [/trd_size_check/, "El archivo excede el tamaño máximo permitido."],
  [/trd_mime_check/, "Sólo se aceptan archivos PDF."],
  [/row-level security|violates row-level security/i, "No tiene acceso a este terminal."],
  [/permission denied/i, "No tiene permisos para realizar esta acción."],
];

export const GENERIC_ERROR_MESSAGE =
  "No fue posible completar la operación. Intente nuevamente en unos segundos.";

interface ErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Convierte cualquier error en un mensaje presentable.
 * Nunca devuelve texto crudo del motor de base de datos.
 */
export function toUserMessage(error: unknown): string {
  if (!error) return GENERIC_ERROR_MESSAGE;

  const raw = typeof error === "string" ? error : ((error as ErrorLike)?.message ?? "");
  if (!raw) return GENERIC_ERROR_MESSAGE;

  // Código de negocio explícito
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return message;
  }

  // Permiso denegado con el código concreto: PERMISSION_DENIED:fleet.create
  if (raw.includes("PERMISSION_DENIED")) {
    return "No tiene permisos para realizar esta acción.";
  }

  for (const [pattern, message] of CONSTRAINT_MESSAGES) {
    if (pattern.test(raw)) return message;
  }

  return GENERIC_ERROR_MESSAGE;
}

/**
 * Registra el error completo en el servidor y devuelve el mensaje del usuario.
 * El detalle técnico queda donde puede investigarse, no en la pantalla.
 */
export function reportError(context: string, error: unknown): string {
  console.error(`[${context}]`, error);
  return toUserMessage(error);
}

/** Resultado uniforme de las Server Actions. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionError(message: string, fieldErrors?: Record<string, string>) {
  return { ok: false as const, error: message, fieldErrors };
}

export function actionSuccess(): ActionResult<undefined>;
export function actionSuccess<T>(data: T): ActionResult<T>;
export function actionSuccess<T>(data?: T) {
  return { ok: true as const, data };
}
