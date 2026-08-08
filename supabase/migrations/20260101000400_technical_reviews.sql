-- =============================================================================
-- 400 · Revisión técnica
-- =============================================================================
-- Modelo de dominio:
--
--   technical_review_events    → una ida a planta (salida + regreso). Evento
--                                histórico inmutable una vez cerrado.
--   technical_review_documents → archivos en Storage (metadata en BD)
--   technical_review_analyses  → resultado del procesamiento del PDF de rechazo
--   technical_review_rejections→ un motivo de rechazo por fila
--   technical_review_not_sent  → buses que NO salieron a planta. Tabla aparte:
--                                no es una revisión, no abre proceso y no toca
--                                vencimientos (§34).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- technical_review_events
-- -----------------------------------------------------------------------------
create table public.technical_review_events (
  id                        uuid primary key default extensions.gen_random_uuid(),
  fleet_id                  uuid not null references public.fleet (id) on delete restrict,
  -- Terminal al momento de la salida. Se guarda explícitamente para que mover
  -- el bus de terminal no reescriba el historial (§14).
  terminal_id               uuid not null references public.terminals (id) on delete restrict,
  driver_name               text not null,
  departure_at              timestamptz not null default now(),
  return_at                 timestamptz,
  status                    text not null default 'OPEN',
  result                    text,
  guide_number              text,
  expiration_date           date,
  -- Vencimiento vigente del bus justo antes de cerrar este evento. Permite
  -- auditar que un RECHAZADO conservó la fecha anterior (§23, §39).
  previous_expiration_date  date,
  created_by                uuid not null references public.profiles (id) on delete restrict,
  closed_by                 uuid references public.profiles (id) on delete restrict,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint tre_status_check check (status in ('OPEN', 'CLOSED')),
  constraint tre_result_check check (result is null or result in ('APPROVED', 'REJECTED')),
  constraint tre_driver_name_check check (length(trim(driver_name)) between 1 and 160),
  constraint tre_guide_number_check check (guide_number is null or length(trim(guide_number)) between 1 and 60),
  constraint tre_return_after_departure check (return_at is null or return_at >= departure_at),

  -- Un evento ABIERTO no tiene ningún dato de cierre (§18: no se pide resultado
  -- durante la salida).
  constraint tre_open_shape check (
    status <> 'OPEN'
    or (result is null and return_at is null and guide_number is null
        and expiration_date is null and closed_by is null)
  ),

  -- Un evento CERRADO tiene siempre resultado, regreso, guía y responsable.
  constraint tre_closed_shape check (
    status <> 'CLOSED'
    or (result is not null and return_at is not null
        and guide_number is not null and closed_by is not null)
  ),

  -- APROBADO exige nueva fecha de vencimiento (§22).
  constraint tre_approved_requires_expiration check (
    result is distinct from 'APPROVED' or expiration_date is not null
  ),

  -- RECHAZADO nunca fija una nueva fecha de vencimiento (§23).
  constraint tre_rejected_has_no_expiration check (
    result is distinct from 'REJECTED' or expiration_date is null
  )
);

-- REGLA CRÍTICA (§19, §52): un bus no puede tener dos procesos abiertos.
-- Garantizado por la base de datos, no por el formulario.
create unique index tre_one_open_per_fleet_idx
  on public.technical_review_events (fleet_id)
  where status = 'OPEN';

create index tre_fleet_idx on public.technical_review_events (fleet_id);
create index tre_terminal_idx on public.technical_review_events (terminal_id);
create index tre_status_idx on public.technical_review_events (status);
create index tre_result_idx on public.technical_review_events (result) where result is not null;
create index tre_departure_idx on public.technical_review_events (departure_at desc);
create index tre_expiration_idx on public.technical_review_events (expiration_date) where expiration_date is not null;
create index tre_guide_number_idx on public.technical_review_events (guide_number) where guide_number is not null;
-- Camino caliente: vencimiento vigente por bus y listados de historial
create index tre_fleet_approved_idx
  on public.technical_review_events (fleet_id, return_at desc)
  where status = 'CLOSED' and result = 'APPROVED';
create index tre_terminal_status_departure_idx
  on public.technical_review_events (terminal_id, status, departure_at desc);

create trigger technical_review_events_set_updated_at
  before update on public.technical_review_events
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Normalización + inmutabilidad del histórico
-- -----------------------------------------------------------------------------
create or replace function app.normalize_review_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.driver_name := nullif(regexp_replace(trim(coalesce(new.driver_name, '')), '\s+', ' ', 'g'), '');
  new.guide_number := app.normalize_code(new.guide_number);

  if new.driver_name is null then
    raise exception 'DRIVER_NAME_REQUIRED' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger technical_review_events_normalize
  before insert or update on public.technical_review_events
  for each row execute function app.normalize_review_event();

-- Un evento cerrado es historia: no puede reabrirse ni cambiar de bus/terminal
-- (§40 "nunca reemplazar historial anterior").
create or replace function app.protect_closed_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'CLOSED' then
    if new.status <> 'CLOSED' then
      raise exception 'REVIEW_ALREADY_CLOSED' using errcode = '23514';
    end if;
    if new.fleet_id is distinct from old.fleet_id
       or new.terminal_id is distinct from old.terminal_id
       or new.departure_at is distinct from old.departure_at
       or new.return_at is distinct from old.return_at
       or new.result is distinct from old.result
       or new.created_by is distinct from old.created_by
       or new.closed_by is distinct from old.closed_by then
      raise exception 'CLOSED_REVIEW_IS_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger technical_review_events_protect_closed
  before update on public.technical_review_events
  for each row execute function app.protect_closed_review();

-- -----------------------------------------------------------------------------
-- technical_review_documents
-- -----------------------------------------------------------------------------
create table public.technical_review_documents (
  id                        uuid primary key default extensions.gen_random_uuid(),
  technical_review_event_id uuid not null references public.technical_review_events (id) on delete cascade,
  document_type             text not null,
  original_name             text not null,
  storage_path              text not null,
  mime_type                 text not null,
  size_bytes                bigint not null,
  uploaded_by               uuid not null references public.profiles (id) on delete restrict,
  created_at                timestamptz not null default now(),

  constraint trd_type_check check (
    document_type in ('TECHNICAL_REVIEW', 'GAS_REVIEW', 'REJECTION_REPORT')
  ),
  constraint trd_size_check check (size_bytes > 0 and size_bytes <= 26214400),
  constraint trd_mime_check check (mime_type = 'application/pdf'),
  constraint trd_original_name_check check (length(trim(original_name)) between 1 and 255)
);

-- Un documento por tipo y por evento: volver a subir reemplaza, no duplica.
create unique index trd_event_type_unique_idx
  on public.technical_review_documents (technical_review_event_id, document_type);
create unique index trd_storage_path_unique_idx
  on public.technical_review_documents (storage_path);
create index trd_event_idx on public.technical_review_documents (technical_review_event_id);

comment on column public.technical_review_documents.storage_path is
  'Ruta en el bucket privado: technical-reviews/{terminal_id}/{fleet_id}/{event_id}/{tipo}-{uuid}.pdf';

-- -----------------------------------------------------------------------------
-- technical_review_analyses · trazabilidad del procesamiento del PDF
-- -----------------------------------------------------------------------------
create table public.technical_review_analyses (
  id                        uuid primary key default extensions.gen_random_uuid(),
  technical_review_event_id uuid not null references public.technical_review_events (id) on delete cascade,
  document_id               uuid not null references public.technical_review_documents (id) on delete cascade,
  status                    text not null default 'PENDING',
  extraction_method         text,
  page_count                int,
  processed_pages           int,
  model                     text,
  error_message             text,
  -- Texto extraído: sustenta cada motivo detectado y permite reprocesar sin
  -- volver a leer el archivo.
  extracted_text            text,
  started_at                timestamptz not null default now(),
  completed_at              timestamptz,

  constraint tra_status_check check (
    status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW')
  ),
  constraint tra_extraction_method_check check (
    extraction_method is null or extraction_method in ('TEXT_LAYER', 'OCR', 'MIXED')
  ),
  constraint tra_pages_check check (
    (page_count is null or page_count >= 0)
    and (processed_pages is null or processed_pages >= 0)
  )
);

create unique index tra_document_unique_idx on public.technical_review_analyses (document_id);
create index tra_event_idx on public.technical_review_analyses (technical_review_event_id);
create index tra_status_idx on public.technical_review_analyses (status);

-- -----------------------------------------------------------------------------
-- technical_review_rejections · un motivo por fila (§25, §28)
-- -----------------------------------------------------------------------------
create table public.technical_review_rejections (
  id                        uuid primary key default extensions.gen_random_uuid(),
  technical_review_event_id uuid not null references public.technical_review_events (id) on delete cascade,
  document_id               uuid references public.technical_review_documents (id) on delete set null,
  analysis_id               uuid references public.technical_review_analyses (id) on delete set null,
  sequence                  int not null,
  description               text not null,
  -- Fragmento textual exacto del PDF que originó el motivo. Sin esto no hay
  -- forma de auditar que el sistema no inventó nada.
  source_text               text,
  page_number               int,
  confidence                numeric(4, 3),
  requires_review           boolean not null default false,
  detection_source          text not null,
  origin                    text not null default 'AUTOMATIC',
  original_description      text,
  confirmed_by              uuid references public.profiles (id) on delete set null,
  confirmed_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint trr_sequence_check check (sequence >= 1),
  constraint trr_description_check check (length(trim(description)) between 1 and 4000),
  constraint trr_page_number_check check (page_number is null or page_number >= 1),
  constraint trr_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint trr_detection_source_check check (
    detection_source in ('TEXT_LAYER', 'OCR', 'MANUAL')
  ),
  -- Trazabilidad de intervención humana (§26)
  constraint trr_origin_check check (
    origin in ('AUTOMATIC', 'AUTOMATIC_EDITED', 'MANUAL')
  ),
  constraint trr_manual_source_check check (
    origin <> 'MANUAL' or detection_source = 'MANUAL'
  )
);

create unique index trr_event_sequence_unique_idx
  on public.technical_review_rejections (technical_review_event_id, sequence);
create index trr_event_idx on public.technical_review_rejections (technical_review_event_id);
create index trr_document_idx on public.technical_review_rejections (document_id);
create index trr_requires_review_idx on public.technical_review_rejections (requires_review) where requires_review;

create trigger technical_review_rejections_set_updated_at
  before update on public.technical_review_rejections
  for each row execute function app.set_updated_at();

comment on column public.technical_review_rejections.origin is
  'AUTOMATIC: detectado por el análisis · AUTOMATIC_EDITED: detectado y corregido por el usuario · MANUAL: agregado por el usuario.';

-- -----------------------------------------------------------------------------
-- technical_review_not_sent · buses que NO salieron a planta (§29-§35)
-- -----------------------------------------------------------------------------
create table public.technical_review_not_sent (
  id                 uuid primary key default extensions.gen_random_uuid(),
  fleet_id           uuid not null references public.fleet (id) on delete restrict,
  terminal_id        uuid not null references public.terminals (id) on delete restrict,
  event_date         date not null,
  reason             text not null,
  work_order_number  text,
  created_by         uuid not null references public.profiles (id) on delete restrict,
  updated_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- El motivo es obligatorio (§31). Texto libre: no se inventa un catálogo.
  constraint trns_reason_check check (length(trim(reason)) between 1 and 2000),
  -- La OT es opcional (§32) pero si viene debe ser buscable.
  constraint trns_work_order_check check (
    work_order_number is null or work_order_number ~ '^[A-Z0-9][A-Z0-9 _/-]{0,39}$'
  )
);

create index trns_fleet_idx on public.technical_review_not_sent (fleet_id);
create index trns_terminal_idx on public.technical_review_not_sent (terminal_id);
create index trns_date_idx on public.technical_review_not_sent (event_date desc);
create index trns_work_order_idx on public.technical_review_not_sent (work_order_number)
  where work_order_number is not null;
create index trns_terminal_date_idx on public.technical_review_not_sent (terminal_id, event_date desc);

create trigger technical_review_not_sent_set_updated_at
  before update on public.technical_review_not_sent
  for each row execute function app.set_updated_at();

create or replace function app.normalize_not_sent_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.reason := nullif(regexp_replace(trim(coalesce(new.reason, '')), '\s+', ' ', 'g'), '');
  new.work_order_number := app.normalize_code(new.work_order_number);

  if new.reason is null then
    raise exception 'NOT_SENT_REASON_REQUIRED' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger technical_review_not_sent_normalize
  before insert or update on public.technical_review_not_sent
  for each row execute function app.normalize_not_sent_row();

comment on table public.technical_review_not_sent is
  'Registro de no envío a planta. No abre proceso, no lleva documentos y no altera vencimientos (§33, §34).';
