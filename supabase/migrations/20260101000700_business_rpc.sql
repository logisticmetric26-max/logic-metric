-- SECCION: PLATAFORMA
-- =============================================================================
-- 700 · Reglas de negocio transaccionales (RPC)
-- =============================================================================
-- Los flujos que deben ser atómicos y no pueden depender del frontend viven
-- aquí. Son SECURITY DEFINER y por lo tanto validan explícitamente permiso,
-- acceso a terminal y estado, en ese orden, antes de tocar nada.
--
-- Los errores se emiten como códigos estables (`REVIEW_ALREADY_OPEN`, …) que la
-- aplicación traduce a mensajes en español. Nunca se filtra un stack trace.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columnas controladas por el servidor
-- -----------------------------------------------------------------------------
-- El cliente no puede elegir el terminal ni el autor de un registro: se derivan
-- del bus y de la sesión. Evita falsificar `terminal_id` para escribir en otro
-- terminal.
-- -----------------------------------------------------------------------------
create or replace function app.set_not_sent_server_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal_id uuid;
begin
  select f.terminal_id into v_terminal_id from public.fleet f where f.id = new.fleet_id;

  if v_terminal_id is null then
    raise exception 'FLEET_NOT_FOUND' using errcode = '23503';
  end if;

  if TG_OP = 'INSERT' then
    new.terminal_id := v_terminal_id;
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    -- El terminal y el autor original de un registro histórico no cambian
    new.terminal_id := old.terminal_id;
    new.created_by := old.created_by;
    new.updated_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger technical_review_not_sent_server_fields
  before insert or update on public.technical_review_not_sent
  for each row execute function app.set_not_sent_server_fields();

-- -----------------------------------------------------------------------------
-- Validación de la ruta de Storage
-- -----------------------------------------------------------------------------
-- La ruta debe corresponder exactamente al terminal/bus/evento del documento.
-- Sin esto, un usuario podría registrar metadata apuntando a un archivo de otro
-- terminal.
-- -----------------------------------------------------------------------------
create or replace function app.validate_document_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.technical_review_events;
  v_expected text;
begin
  select * into v_event
  from public.technical_review_events
  where id = new.technical_review_event_id;

  if v_event.id is null then
    raise exception 'REVIEW_NOT_FOUND' using errcode = '23503';
  end if;

  v_expected := 'technical-reviews/' || v_event.terminal_id || '/' || v_event.fleet_id || '/' || v_event.id || '/';

  if new.storage_path not like v_expected || '%' then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '23514';
  end if;

  -- El path no puede escapar del prefijo
  if new.storage_path like '%..%' then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '23514';
  end if;

  new.uploaded_by := coalesce((select auth.uid()), new.uploaded_by);

  return new;
end;
$$;

create trigger technical_review_documents_validate_path
  before insert or update on public.technical_review_documents
  for each row execute function app.validate_document_path();

-- =============================================================================
-- §18 · Registrar salida a planta
-- =============================================================================
create or replace function public.open_technical_review(
  p_fleet_id     uuid,
  p_driver_name  text,
  p_departure_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal_id uuid;
  v_active      boolean;
  v_event_id    uuid;
begin
  perform app.assert_permission('technical_review.create');

  select f.terminal_id, f.active into v_terminal_id, v_active
  from public.fleet f
  where f.id = p_fleet_id;

  if v_terminal_id is null then
    raise exception 'FLEET_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not v_active then
    raise exception 'FLEET_INACTIVE' using errcode = '23514';
  end if;

  perform app.assert_terminal_access(v_terminal_id);

  begin
    insert into public.technical_review_events (
      fleet_id, terminal_id, driver_name, departure_at, status, created_by
    )
    values (
      p_fleet_id,
      v_terminal_id,
      p_driver_name,
      coalesce(p_departure_at, now()),
      'OPEN',
      (select auth.uid())
    )
    returning id into v_event_id;
  exception
    -- §19: la unicidad la garantiza el índice parcial, no el formulario.
    when unique_violation then
      raise exception 'REVIEW_ALREADY_OPEN' using errcode = '23505';
  end;

  perform app.write_audit(
    'REGISTER_DEPARTURE', 'TECHNICAL_REVIEW', v_event_id::text, v_terminal_id,
    null, jsonb_build_object('fleet_id', p_fleet_id, 'driver_name', p_driver_name)
  );

  return v_event_id;
end;
$$;

-- =============================================================================
-- §21, §60 · Cerrar revisión (transaccional)
-- =============================================================================
create or replace function public.close_technical_review(
  p_event_id        uuid,
  p_result          text,
  p_guide_number    text,
  p_expiration_date date default null,
  p_return_at       timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event      public.technical_review_events;
  v_guide      text;
  v_return_at  timestamptz;
  v_expiration date;
  v_previous   date;
begin
  perform app.assert_permission('technical_review.close');

  -- Bloqueo pesimista: si dos usuarios cierran a la vez, el segundo espera y
  -- encuentra el evento ya cerrado (§59).
  select * into v_event
  from public.technical_review_events
  where id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform app.assert_terminal_access(v_event.terminal_id);

  if v_event.status <> 'OPEN' then
    raise exception 'REVIEW_ALREADY_CLOSED' using errcode = '23514';
  end if;

  if p_result is null or p_result not in ('APPROVED', 'REJECTED') then
    raise exception 'INVALID_RESULT' using errcode = '23514';
  end if;

  v_guide := app.normalize_code(p_guide_number);
  if v_guide is null then
    raise exception 'GUIDE_NUMBER_REQUIRED' using errcode = '23514';
  end if;

  v_return_at := coalesce(p_return_at, now());
  if v_return_at < v_event.departure_at then
    raise exception 'RETURN_BEFORE_DEPARTURE' using errcode = '23514';
  end if;

  -- Vencimiento vigente ANTES de este cierre (para trazabilidad y para
  -- demostrar que un rechazo lo conserva).
  select e.expiration_date into v_previous
  from public.technical_review_events e
  where e.fleet_id = v_event.fleet_id
    and e.status = 'CLOSED'
    and e.result = 'APPROVED'
    and e.id <> p_event_id
  order by e.return_at desc, e.created_at desc
  limit 1;

  if p_result = 'APPROVED' then
    -- §22 · dos documentos obligatorios + vencimiento
    if p_expiration_date is null then
      raise exception 'EXPIRATION_DATE_REQUIRED' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.technical_review_documents d
      where d.technical_review_event_id = p_event_id and d.document_type = 'TECHNICAL_REVIEW'
    ) then
      raise exception 'TECHNICAL_REVIEW_DOCUMENT_REQUIRED' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.technical_review_documents d
      where d.technical_review_event_id = p_event_id and d.document_type = 'GAS_REVIEW'
    ) then
      raise exception 'GAS_REVIEW_DOCUMENT_REQUIRED' using errcode = '23514';
    end if;

    v_expiration := p_expiration_date;
  else
    -- §23 · documento de rechazo obligatorio; el vencimiento NO se toca.
    if not exists (
      select 1 from public.technical_review_documents d
      where d.technical_review_event_id = p_event_id and d.document_type = 'REJECTION_REPORT'
    ) then
      raise exception 'REJECTION_DOCUMENT_REQUIRED' using errcode = '23514';
    end if;

    v_expiration := null;
  end if;

  update public.technical_review_events
  set status                   = 'CLOSED',
      result                   = p_result,
      return_at                = v_return_at,
      guide_number             = v_guide,
      expiration_date          = v_expiration,
      previous_expiration_date = v_previous,
      closed_by                = (select auth.uid())
  where id = p_event_id;

  perform app.write_audit(
    case when p_result = 'APPROVED' then 'APPROVE_TECHNICAL_REVIEW' else 'REJECT_TECHNICAL_REVIEW' end,
    'TECHNICAL_REVIEW',
    p_event_id::text,
    v_event.terminal_id,
    to_jsonb(v_event),
    jsonb_build_object(
      'result', p_result,
      'guide_number', v_guide,
      'expiration_date', v_expiration,
      'previous_expiration_date', v_previous
    )
  );

  return p_event_id;
end;
$$;

-- =============================================================================
-- §25, §26 · Guardar el conjunto de motivos de rechazo
-- =============================================================================
-- Reemplaza atómicamente los motivos del evento con la lista confirmada por el
-- usuario, preservando la distinción entre detección automática y edición
-- manual.
-- =============================================================================
create or replace function public.save_review_rejections(
  p_event_id uuid,
  p_items    jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event       public.technical_review_events;
  v_document_id uuid;
  v_analysis_id uuid;
  v_item        jsonb;
  v_sequence    int := 0;
  v_origin      text;
  v_detection   text;
begin
  perform app.assert_permission('technical_review.close');

  select * into v_event
  from public.technical_review_events
  where id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform app.assert_terminal_access(v_event.terminal_id);

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_PAYLOAD' using errcode = '23514';
  end if;

  select d.id into v_document_id
  from public.technical_review_documents d
  where d.technical_review_event_id = p_event_id
    and d.document_type = 'REJECTION_REPORT';

  select a.id into v_analysis_id
  from public.technical_review_analyses a
  where a.document_id = v_document_id;

  delete from public.technical_review_rejections
  where technical_review_event_id = p_event_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sequence := v_sequence + 1;

    v_origin := coalesce(v_item ->> 'origin', 'MANUAL');
    if v_origin not in ('AUTOMATIC', 'AUTOMATIC_EDITED', 'MANUAL') then
      raise exception 'INVALID_PAYLOAD' using errcode = '23514';
    end if;

    v_detection := coalesce(v_item ->> 'detection_source', 'MANUAL');
    if v_origin = 'MANUAL' then
      v_detection := 'MANUAL';
    end if;

    insert into public.technical_review_rejections (
      technical_review_event_id, document_id, analysis_id, sequence,
      description, source_text, page_number, confidence, requires_review,
      detection_source, origin, original_description, confirmed_by, confirmed_at
    )
    values (
      p_event_id,
      v_document_id,
      v_analysis_id,
      v_sequence,
      v_item ->> 'description',
      v_item ->> 'source_text',
      nullif(v_item ->> 'page_number', '')::int,
      nullif(v_item ->> 'confidence', '')::numeric,
      coalesce((v_item ->> 'requires_review')::boolean, false),
      v_detection,
      v_origin,
      v_item ->> 'original_description',
      (select auth.uid()),
      now()
    );
  end loop;

  perform app.write_audit(
    'SAVE_REJECTIONS', 'TECHNICAL_REVIEW_REJECTION', p_event_id::text, v_event.terminal_id,
    null, jsonb_build_object('count', v_sequence)
  );

  return v_sequence;
end;
$$;

-- =============================================================================
-- §17 · Indicadores del resumen
-- =============================================================================
-- SECURITY INVOKER a propósito: los conteos se calculan con las políticas RLS
-- del usuario, así que es imposible que un indicador incluya terminales a los
-- que no tiene acceso.
-- =============================================================================
create or replace function public.technical_review_summary(
  p_from        date default null,
  p_to          date default null,
  p_terminal_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'in_review', (
      select count(*) from public.technical_review_events e
      where e.status = 'OPEN'
        and (p_terminal_id is null or e.terminal_id = p_terminal_id)
        and (p_from is null or (e.departure_at at time zone app.local_timezone())::date >= p_from)
        and (p_to   is null or (e.departure_at at time zone app.local_timezone())::date <= p_to)
    ),
    'approved', (
      select count(*) from public.technical_review_events e
      where e.status = 'CLOSED' and e.result = 'APPROVED'
        and (p_terminal_id is null or e.terminal_id = p_terminal_id)
        and (p_from is null or (e.return_at at time zone app.local_timezone())::date >= p_from)
        and (p_to   is null or (e.return_at at time zone app.local_timezone())::date <= p_to)
    ),
    'rejected', (
      select count(*) from public.technical_review_events e
      where e.status = 'CLOSED' and e.result = 'REJECTED'
        and (p_terminal_id is null or e.terminal_id = p_terminal_id)
        and (p_from is null or (e.return_at at time zone app.local_timezone())::date >= p_from)
        and (p_to   is null or (e.return_at at time zone app.local_timezone())::date <= p_to)
    ),
    'not_sent', (
      select count(*) from public.technical_review_not_sent n
      where (p_terminal_id is null or n.terminal_id = p_terminal_id)
        and (p_from is null or n.event_date >= p_from)
        and (p_to   is null or n.event_date <= p_to)
    ),
    -- Vencimientos son estado actual del bus, no dependen del período.
    'expiring_soon', (
      select count(*) from public.fleet_expiration_status s
      where s.active
        and s.expiration_status = 'EXPIRING_SOON'
        and (p_terminal_id is null or s.terminal_id = p_terminal_id)
    ),
    'expired', (
      select count(*) from public.fleet_expiration_status s
      where s.active
        and s.expiration_status = 'EXPIRED'
        and (p_terminal_id is null or s.terminal_id = p_terminal_id)
    ),
    'expiring_soon_days', app.expiring_soon_days()
  );
$$;

-- =============================================================================
-- §57 · Registro de inicio de sesión
-- =============================================================================
-- La autenticación ocurre en Supabase Auth, fuera de nuestras tablas. Esta
-- función deja la traza en la bitácora una vez establecida la sesión.
--
-- Sólo puede registrar el login de QUIEN LA INVOCA: no acepta parámetros de
-- usuario, así que nadie puede fabricar entradas a nombre de otro.
-- =============================================================================
create or replace function public.record_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = (select auth.uid());

  if v_profile.id is null then
    return;
  end if;

  perform app.write_audit(
    'LOGIN', 'USER', v_profile.id::text, v_profile.primary_terminal_id,
    null, null, jsonb_build_object('status', v_profile.status)
  );
end;
$$;

revoke all on function public.record_login() from public;
grant execute on function public.record_login() to authenticated;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke all on function public.open_technical_review(uuid, text, timestamptz) from public;
revoke all on function public.close_technical_review(uuid, text, text, date, timestamptz) from public;
revoke all on function public.save_review_rejections(uuid, jsonb) from public;
revoke all on function public.technical_review_summary(date, date, uuid) from public;

grant execute on function public.open_technical_review(uuid, text, timestamptz) to authenticated;
grant execute on function public.close_technical_review(uuid, text, text, date, timestamptz) to authenticated;
grant execute on function public.save_review_rejections(uuid, jsonb) to authenticated;
grant execute on function public.technical_review_summary(date, date, uuid) to authenticated;
