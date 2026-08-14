/**
 * Tipos de la base de datos.
 *
 * Reflejan exactamente el esquema definido en `supabase/migrations/`.
 * Regenerables con `npm run db:types` (requiere `supabase start`).
 *
 * Al modificar una migración hay que actualizar este archivo: es el contrato
 * que mantiene sincronizados TypeScript y PostgreSQL.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Columnas con valor por defecto en la base: opcionales al insertar. */
type WithDefaults<Row, Defaulted extends keyof Row> = Omit<Row, Defaulted> &
  Partial<Pick<Row, Defaulted>>;

// -----------------------------------------------------------------------------
// Enumeraciones de dominio (CHECK constraints en la base)
// -----------------------------------------------------------------------------
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type ReviewStatus = "OPEN" | "CLOSED";
export type ReviewResult = "APPROVED" | "REJECTED";
export type DocumentType = "TECHNICAL_REVIEW" | "GAS_REVIEW" | "REJECTION_REPORT";
export type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "NEEDS_REVIEW";
export type ExtractionMethod = "TEXT_LAYER" | "OCR" | "MIXED";
export type DetectionSource = "TEXT_LAYER" | "OCR" | "MANUAL";
export type RejectionOrigin = "AUTOMATIC" | "AUTOMATIC_EDITED" | "MANUAL";
export type ExpirationStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NO_RECORD";
export type FuelDeliveryProduct = "FUEL" | "ADBLUE";
export type FuelReceptionWindow = "AM" | "PM";
export type FuelDeliveryAlertStatus = "UPCOMING" | "TODAY" | "OVERDUE" | "CONFIRMED";

// -----------------------------------------------------------------------------
// Filas
// -----------------------------------------------------------------------------
export type TerminalRow = {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export type PermissionRow = {
  code: string;
  module: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export type RolePermissionRow = {
  role_id: string;
  permission_code: string;
  created_at: string;
}

export type ProfileRow = {
  id: string;
  rut: string;
  full_name: string;
  job_title: string;
  primary_terminal_id: string;
  role_id: string;
  status: UserStatus;
  has_global_access: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type UserTerminalAccessRow = {
  user_id: string;
  terminal_id: string;
  granted_at: string;
  granted_by: string | null;
}

export type UserPermissionOverrideRow = {
  user_id: string;
  permission_code: string;
  granted: boolean;
  created_at: string;
  created_by: string | null;
}

export type AppSettingRow = {
  key: string;
  value: Json;
  label: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type FleetFuelTypeRow = {
  code: string;
  label: string;
  active: boolean;
  sort_order: number;
}

export type FleetRow = {
  id: string;
  internal_number: string;
  ppu: string;
  model: string | null;
  subclass: string | null;
  fuel_type: string;
  zone: string | null;
  terminal_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type BusWashRecordRow = {
  id: string;
  fleet_id: string;
  terminal_id: string;
  record_date: string;
  bm_completed: boolean;
  body_wash_completed: boolean;
  in_repair: boolean;
  no_wash: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BusWashExportRow = {
  id: string;
  record_date: string;
  zone: string;
  file_name: string;
  bus_count: number;
  generated_by: string | null;
  generated_at: string;
}

export type DispenserRow = {
  id: string;
  code: string;
  terminal_name: string;
  terminal_code: string;
  planner_rut: string;
  supervisor_rut: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type BadFuelLoadRow = {
  id: string;
  fleet_id: string;
  terminal_id: string;
  dispenser_id: string;
  load_date: string;
  load_time: string;
  liters: number;
  created_by: string;
  updated_by: string | null;
  exported_at: string | null;
  exported_by: string | null;
  export_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export type ReaderCodeRow = {
  id: string;
  ppu: string;
  internal_number: string;
  reader_code: string;
  reader_type: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type TechnicalReviewEventRow = {
  id: string;
  fleet_id: string;
  terminal_id: string;
  driver_name: string;
  departure_at: string;
  return_at: string | null;
  status: ReviewStatus;
  result: ReviewResult | null;
  guide_number: string | null;
  expiration_date: string | null;
  previous_expiration_date: string | null;
  created_by: string;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TechnicalReviewDocumentRow = {
  id: string;
  technical_review_event_id: string;
  document_type: DocumentType;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export type TechnicalReviewAnalysisRow = {
  id: string;
  technical_review_event_id: string;
  document_id: string;
  status: AnalysisStatus;
  extraction_method: ExtractionMethod | null;
  page_count: number | null;
  processed_pages: number | null;
  model: string | null;
  error_message: string | null;
  extracted_text: string | null;
  started_at: string;
  completed_at: string | null;
}

export type TechnicalReviewRejectionRow = {
  id: string;
  technical_review_event_id: string;
  document_id: string | null;
  analysis_id: string | null;
  sequence: number;
  description: string;
  source_text: string | null;
  page_number: number | null;
  confidence: number | null;
  requires_review: boolean;
  detection_source: DetectionSource;
  origin: RejectionOrigin;
  original_description: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TechnicalReviewNotSentRow = {
  id: string;
  fleet_id: string;
  terminal_id: string;
  event_date: string;
  reason: string;
  work_order_number: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type FuelDeliveryScheduleRow = {
  id: string;
  terminal_id: string;
  request_reference: string;
  delivery_address: string;
  product_type: FuelDeliveryProduct;
  product_label: string;
  scheduled_date: string;
  reception_window: FuelReceptionWindow;
  reception_time_range: string;
  supplier_name: string;
  requested_quantity_m3: number;
  truck_reference: string | null;
  notes: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditLogRow = {
  id: number;
  user_id: string | null;
  actor_rut: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  terminal_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
  metadata: Json | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Vistas
// -----------------------------------------------------------------------------
export type FleetExpirationStatusRow = {
  fleet_id: string;
  internal_number: string;
  ppu: string;
  model: string | null;
  subclass: string | null;
  fuel_type: string;
  zone: string | null;
  terminal_id: string;
  active: boolean;
  last_approved_event_id: string | null;
  expiration_date: string | null;
  last_approved_at: string | null;
  last_guide_number: string | null;
  expiration_status: ExpirationStatus;
  days_to_expiration: number | null;
}

export type FleetViewRow = {
  id: string;
  internal_number: string;
  ppu: string;
  model: string | null;
  subclass: string | null;
  fuel_type: string;
  fuel_type_label: string | null;
  zone: string | null;
  terminal_id: string;
  terminal_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type TechnicalReviewEventViewRow = {
  id: string;
  fleet_id: string;
  internal_number: string;
  ppu: string;
  terminal_id: string;
  terminal_name: string;
  driver_name: string;
  departure_at: string;
  return_at: string | null;
  status: ReviewStatus;
  result: ReviewResult | null;
  guide_number: string | null;
  expiration_date: string | null;
  previous_expiration_date: string | null;
  created_by: string;
  created_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  created_at: string;
  updated_at: string;
  rejection_count: number;
  needs_review_count: number;
  rejection_document_id: string | null;
  analysis_status: AnalysisStatus | null;
}

export type TechnicalReviewNotSentViewRow = {
  id: string;
  fleet_id: string;
  internal_number: string;
  ppu: string;
  terminal_id: string;
  terminal_name: string;
  event_date: string;
  reason: string;
  work_order_number: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type FuelDeliveryScheduleViewRow = {
  id: string;
  terminal_id: string;
  terminal_name: string;
  request_reference: string;
  delivery_address: string;
  product_type: FuelDeliveryProduct;
  product_label: string;
  scheduled_date: string;
  reception_window: FuelReceptionWindow;
  reception_time_range: string;
  alert_deadline: string;
  alert_status: FuelDeliveryAlertStatus;
  supplier_name: string;
  requested_quantity_m3: number;
  truck_reference: string | null;
  notes: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  created_by: string;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type BadFuelLoadViewRow = {
  id: string;
  fleet_id: string;
  internal_number: string;
  ppu: string;
  reader_code: string | null;
  terminal_id: string;
  terminal_name: string;
  dispenser_id: string;
  dispenser_code: string;
  dispenser_terminal_name: string;
  dispenser_terminal_code: string;
  planner_rut: string;
  supervisor_rut: string;
  load_date: string;
  load_time: string;
  liters: number;
  created_by: string;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  exported_at: string | null;
  exported_by: string | null;
  exported_by_name: string | null;
  export_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export type BusWashExportViewRow = {
  id: string;
  record_date: string;
  zone: string;
  file_name: string;
  bus_count: number;
  generated_by: string | null;
  generated_by_name: string | null;
  generated_at: string;
}

export type TerminalSummary = {
  id: string;
  name: string;
}

export type PermissionOverrideSummary = {
  permission_code: string;
  granted: boolean;
}

/** §Lavado · justificación de que un terminal no lavó carrocería por lluvia. */
export type BusWashRainDayRow = {
  terminal_id: string;
  record_date: string;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export type ProfileViewRow = {
  id: string;
  rut: string;
  full_name: string;
  job_title: string;
  status: UserStatus;
  has_global_access: boolean;
  avatar_path: string | null;
  primary_terminal_id: string;
  primary_terminal_name: string;
  role_id: string;
  role_name: string;
  additional_terminals: TerminalSummary[];
  permission_overrides: PermissionOverrideSummary[];
  /** Último inicio de sesión correcto. `null` = nunca se ha conectado. */
  last_login_at: string | null;
  /** Última señal de una pestaña abierta; decide si está conectado ahora. */
  last_seen_at: string | null;
  login_count: number;
  created_at: string;
  updated_at: string;
}

export type RoleViewRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  user_count: number;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Resultado de RPC
// -----------------------------------------------------------------------------
export type TechnicalReviewSummary = {
  in_review: number;
  approved: number;
  rejected: number;
  not_sent: number;
  expiring_soon: number;
  expired: number;
  expiring_soon_days: number;
}

export type CurrentUserContext = {
  profile: {
    id: string;
    rut: string;
    full_name: string;
    job_title: string;
    status: UserStatus;
    has_global_access: boolean;
    avatar_path: string | null;
    primary_terminal_id: string;
    role_id: string;
    role_name: string;
  };
  permissions: string[];
  terminals: { id: string; name: string; code: string | null; active: boolean }[];
}

// -----------------------------------------------------------------------------
// Esquema para @supabase/supabase-js
// -----------------------------------------------------------------------------
type ReadOnlyView<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      terminals: {
        Row: TerminalRow;
        Insert: WithDefaults<
          TerminalRow,
          "id" | "code" | "active" | "created_at" | "updated_at" | "created_by" | "updated_by"
        >;
        Update: Partial<TerminalRow>;
        Relationships: [];
      };
      roles: {
        Row: RoleRow;
        Insert: WithDefaults<RoleRow, "id" | "description" | "is_system" | "created_at" | "updated_at">;
        Update: Partial<RoleRow>;
        Relationships: [];
      };
      permissions: {
        Row: PermissionRow;
        Insert: WithDefaults<PermissionRow, "description" | "sort_order">;
        Update: Partial<PermissionRow>;
        Relationships: [];
      };
      role_permissions: {
        Row: RolePermissionRow;
        Insert: WithDefaults<RolePermissionRow, "created_at">;
        Update: Partial<RolePermissionRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: WithDefaults<
          ProfileRow,
          "status" | "has_global_access" | "created_at" | "updated_at" | "created_by" | "updated_by"
        >;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      user_terminal_access: {
        Row: UserTerminalAccessRow;
        Insert: WithDefaults<UserTerminalAccessRow, "granted_at" | "granted_by">;
        Update: Partial<UserTerminalAccessRow>;
        Relationships: [];
      };
      user_permission_overrides: {
        Row: UserPermissionOverrideRow;
        Insert: WithDefaults<UserPermissionOverrideRow, "created_at" | "created_by">;
        Update: Partial<UserPermissionOverrideRow>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
        Insert: WithDefaults<AppSettingRow, "description" | "updated_at" | "updated_by">;
        Update: Partial<AppSettingRow>;
        Relationships: [];
      };
      fleet_fuel_types: {
        Row: FleetFuelTypeRow;
        Insert: WithDefaults<FleetFuelTypeRow, "active" | "sort_order">;
        Update: Partial<FleetFuelTypeRow>;
        Relationships: [];
      };
      fleet: {
        Row: FleetRow;
        Insert: WithDefaults<
          FleetRow,
          | "id"
          | "model"
          | "subclass"
          | "zone"
          | "active"
          | "created_at"
          | "updated_at"
          | "created_by"
          | "updated_by"
        >;
        Update: Partial<FleetRow>;
        Relationships: [];
      };
      bus_wash_rain_days: {
        Row: BusWashRainDayRow;
        Insert: WithDefaults<BusWashRainDayRow, "created_by" | "created_at">;
        Update: Partial<BusWashRainDayRow>;
        Relationships: [];
      };
      bus_wash_records: {
        Row: BusWashRecordRow;
        Insert: WithDefaults<
          BusWashRecordRow,
          | "id"
          | "bm_completed"
          | "body_wash_completed"
          | "in_repair"
          | "no_wash"
          | "created_by"
          | "updated_by"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<BusWashRecordRow>;
        Relationships: [];
      };
      bad_fuel_loads: {
        Row: BadFuelLoadRow;
        Insert: WithDefaults<
          BadFuelLoadRow,
          | "id"
          | "updated_by"
          | "exported_at"
          | "exported_by"
          | "export_file_name"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<BadFuelLoadRow>;
        Relationships: [];
      };
      bus_wash_exports: {
        Row: BusWashExportRow;
        Insert: WithDefaults<
          BusWashExportRow,
          "id" | "generated_by" | "generated_at"
        >;
        Update: Partial<BusWashExportRow>;
        Relationships: [];
      };
      dispensers: {
        Row: DispenserRow;
        Insert: WithDefaults<
          DispenserRow,
          | "id"
          | "active"
          | "created_at"
          | "updated_at"
          | "created_by"
          | "updated_by"
        >;
        Update: Partial<DispenserRow>;
        Relationships: [];
      };
      reader_codes: {
        Row: ReaderCodeRow;
        Insert: WithDefaults<
          ReaderCodeRow,
          | "id"
          | "reader_type"
          | "active"
          | "created_at"
          | "updated_at"
          | "created_by"
          | "updated_by"
        >;
        Update: Partial<ReaderCodeRow>;
        Relationships: [];
      };
      technical_review_events: {
        Row: TechnicalReviewEventRow;
        Insert: WithDefaults<
          TechnicalReviewEventRow,
          | "id"
          | "departure_at"
          | "return_at"
          | "status"
          | "result"
          | "guide_number"
          | "expiration_date"
          | "previous_expiration_date"
          | "closed_by"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<TechnicalReviewEventRow>;
        Relationships: [];
      };
      technical_review_documents: {
        Row: TechnicalReviewDocumentRow;
        Insert: WithDefaults<TechnicalReviewDocumentRow, "id" | "created_at">;
        Update: Partial<TechnicalReviewDocumentRow>;
        Relationships: [];
      };
      technical_review_analyses: {
        Row: TechnicalReviewAnalysisRow;
        Insert: WithDefaults<
          TechnicalReviewAnalysisRow,
          | "id"
          | "status"
          | "extraction_method"
          | "page_count"
          | "processed_pages"
          | "model"
          | "error_message"
          | "extracted_text"
          | "started_at"
          | "completed_at"
        >;
        Update: Partial<TechnicalReviewAnalysisRow>;
        Relationships: [];
      };
      technical_review_rejections: {
        Row: TechnicalReviewRejectionRow;
        Insert: WithDefaults<
          TechnicalReviewRejectionRow,
          | "id"
          | "document_id"
          | "analysis_id"
          | "source_text"
          | "page_number"
          | "confidence"
          | "requires_review"
          | "origin"
          | "original_description"
          | "confirmed_by"
          | "confirmed_at"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<TechnicalReviewRejectionRow>;
        Relationships: [];
      };
      technical_review_not_sent: {
        Row: TechnicalReviewNotSentRow;
        Insert: WithDefaults<
          TechnicalReviewNotSentRow,
          "id" | "terminal_id" | "work_order_number" | "updated_by" | "created_at" | "updated_at"
        >;
        Update: Partial<TechnicalReviewNotSentRow>;
        Relationships: [];
      };
      fuel_delivery_schedules: {
        Row: FuelDeliveryScheduleRow;
        Insert: WithDefaults<
          FuelDeliveryScheduleRow,
          | "id"
          | "confirmed_at"
          | "confirmed_by"
          | "truck_reference"
          | "notes"
          | "updated_by"
          | "created_at"
          | "updated_at"
        >;
        Update: Partial<FuelDeliveryScheduleRow>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        // La bitácora es de sólo lectura desde la aplicación: `authenticated`
        // no tiene privilegio de INSERT/UPDATE/DELETE sobre ella. El tipo vacío
        // hace que cualquier intento de escritura falle también en TypeScript.
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: {
      fleet_expiration_status: ReadOnlyView<FleetExpirationStatusRow>;
      fleet_view: ReadOnlyView<FleetViewRow>;
      technical_review_events_view: ReadOnlyView<TechnicalReviewEventViewRow>;
      technical_review_not_sent_view: ReadOnlyView<TechnicalReviewNotSentViewRow>;
      fuel_delivery_schedule_view: ReadOnlyView<FuelDeliveryScheduleViewRow>;
      bad_fuel_loads_view: ReadOnlyView<BadFuelLoadViewRow>;
      bus_wash_exports_view: ReadOnlyView<BusWashExportViewRow>;
      profiles_view: ReadOnlyView<ProfileViewRow>;
      roles_view: ReadOnlyView<RoleViewRow>;
    };
    Functions: {
      current_user_context: {
        Args: Record<string, never>;
        Returns: CurrentUserContext | null;
      };
      touch_presence: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      set_own_avatar: {
        Args: { p_path: string | null };
        Returns: undefined;
      };
      open_technical_review: {
        Args: { p_fleet_id: string; p_driver_name: string; p_departure_at?: string | null };
        Returns: string;
      };
      close_technical_review: {
        Args: {
          p_event_id: string;
          p_result: ReviewResult;
          p_guide_number: string;
          p_expiration_date?: string | null;
          p_return_at?: string | null;
        };
        Returns: string;
      };
      save_review_rejections: {
        Args: { p_event_id: string; p_items: Json };
        Returns: number;
      };
      record_login: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      technical_review_summary: {
        Args: { p_from?: string | null; p_to?: string | null; p_terminal_id?: string | null };
        Returns: TechnicalReviewSummary;
      };
      bootstrap_administrator: {
        Args: {
          p_user_id: string;
          p_rut: string;
          p_full_name: string;
          p_job_title: string;
          p_terminal_name: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
