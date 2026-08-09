-- =============================================================================
-- 1600 · Integridad del catálogo de permisos y separación real de capacidades
-- =============================================================================

-- Dos permisos figuraban en el selector sin una operación independiente en la
-- aplicación. Las FK eliminan también sus asignaciones y excepciones.
delete from public.permissions
where code in ('technical_review.edit', 'audit.view');

-- Los textos describen exactamente la acción disponible en la interfaz.
update public.permissions
set label = 'Eliminar procesos del historial',
    description = 'Eliminar un proceso cerrado, sus rechazos, análisis y PDF adjuntos.'
where code = 'technical_review.delete';

update public.permissions
set label = 'Editar datos de usuarios',
    description = 'Modificar nombre, cargo descriptivo y contraseña; no cambia roles ni accesos.'
where code = 'users.edit';

update public.permissions
set description = 'Asignar roles de permisos, excepciones y terminales autorizados.'
where code = 'access.manage';

update public.permissions
set module = 'technical_review',
    label = 'Configurar aviso de vencimiento',
    description = 'Modificar los días usados para marcar revisiones próximas a vencer.',
    sort_order = 75
where code = 'settings.manage';

-- -----------------------------------------------------------------------------
-- Dependencias funcionales
-- -----------------------------------------------------------------------------
-- Un permiso de acción no se considera efectivo si falta el permiso que permite
-- entrar a su pantalla o completar el flujo. Esto se evalúa en la base, no sólo
-- en los checkboxes del navegador.
create table if not exists app.permission_dependencies (
  permission_code          text not null references public.permissions (code) on delete cascade,
  required_permission_code text not null references public.permissions (code) on delete cascade,
  primary key (permission_code, required_permission_code),
  constraint permission_dependency_not_self check (permission_code <> required_permission_code)
);

insert into app.permission_dependencies (permission_code, required_permission_code) values
  ('technical_review.create', 'technical_review.view'),
  ('technical_review.close', 'technical_review.view'),
  ('technical_review.close', 'technical_review_documents.view'),
  ('technical_review.close', 'technical_review_documents.upload'),
  ('technical_review.delete', 'technical_review.view'),
  ('technical_review_documents.view', 'technical_review.view'),
  ('technical_review_documents.upload', 'technical_review.view'),
  ('technical_review_not_sent.create', 'technical_review_not_sent.view'),
  ('technical_review_not_sent.edit', 'technical_review_not_sent.view'),
  ('technical_review_not_sent.delete', 'technical_review_not_sent.view'),
  ('fleet.create', 'fleet.view'),
  ('fleet.edit', 'fleet.view'),
  ('terminals.create', 'terminals.view'),
  ('terminals.edit', 'terminals.view'),
  ('terminals.delete', 'terminals.view'),
  ('users.create', 'users.view'),
  ('users.create', 'access.manage'),
  ('users.edit', 'users.view'),
  ('users.suspend', 'users.view'),
  ('users.delete', 'users.view'),
  ('access.manage', 'users.view'),
  ('settings.manage', 'technical_review.view')
on conflict do nothing;

create or replace function app.has_direct_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select o.granted
      from public.user_permission_overrides o
      join public.profiles p on p.id = o.user_id
      where o.user_id = (select auth.uid())
        and o.permission_code = p_permission
        and p.status = 'ACTIVE'
    ),
    exists (
      select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_id = p.role_id
      where p.id = (select auth.uid())
        and p.status = 'ACTIVE'
        and rp.permission_code = p_permission
    )
  );
$$;

revoke all on function app.has_direct_permission(text) from public;

create or replace function app.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.permissions p where p.code = p_permission)
    and app.has_direct_permission(p_permission)
    and not exists (
      select 1
      from app.permission_dependencies d
      where d.permission_code = p_permission
        and not app.has_direct_permission(d.required_permission_code)
    );
$$;

create or replace function app.effective_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.code
  from public.permissions p
  where app.has_permission(p.code)
  order by p.sort_order, p.code;
$$;

-- -----------------------------------------------------------------------------
-- Una lectura operacional de revisiones/no enviados puede resolver el bus sin
-- conceder acceso a la pantalla administrativa de Flota.
-- -----------------------------------------------------------------------------
drop policy if exists fleet_select on public.fleet;
create policy fleet_select on public.fleet
  for select to authenticated
  using (
    (
      app.has_permission('fleet.view')
      or app.has_permission('technical_review.view')
      or app.has_permission('technical_review_not_sent.view')
    )
    and app.can_access_terminal(terminal_id)
  );

-- -----------------------------------------------------------------------------
-- Editar datos, suspender y administrar el acceso son capacidades distintas.
-- RLS deja pasar el UPDATE y el trigger limita las columnas exactas.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    (
      app.has_permission('users.edit')
      or app.has_permission('users.suspend')
      or app.has_permission('access.manage')
    )
    and (app.has_global_access() or app.can_access_terminal(primary_terminal_id))
  )
  with check (
    (
      app.has_permission('users.edit')
      or app.has_permission('users.suspend')
      or app.has_permission('access.manage')
    )
    and (app.has_global_access() or app.can_access_terminal(primary_terminal_id))
  );

create or replace function app.enforce_profile_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Migraciones y operaciones internas sin sesión conservan su autoridad.
  if (select auth.uid()) is null then
    return new;
  end if;

  if (new.full_name is distinct from old.full_name
      or new.job_title is distinct from old.job_title) then
    if not app.has_permission('users.edit') then
      raise exception 'PERMISSION_DENIED:users.edit' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not app.has_permission('users.suspend') then
      raise exception 'PERMISSION_DENIED:users.suspend' using errcode = '42501';
    end if;
  end if;

  if (new.role_id is distinct from old.role_id
      or new.has_global_access is distinct from old.has_global_access
      or new.primary_terminal_id is distinct from old.primary_terminal_id) then
    if not app.has_permission('access.manage') then
      raise exception 'PERMISSION_DENIED:access.manage' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_update_permissions on public.profiles;
create trigger profiles_enforce_update_permissions
  before update on public.profiles
  for each row execute function app.enforce_profile_update_permissions();

-- -----------------------------------------------------------------------------
-- `technical_review.edit` no representaba una acción independiente. El cierre
-- es ahora la única capacidad que modifica un proceso y sus rechazos.
-- -----------------------------------------------------------------------------
drop policy if exists technical_review_events_update on public.technical_review_events;
create policy technical_review_events_update on public.technical_review_events
  for update to authenticated
  using (
    app.can_access_terminal(terminal_id)
    and app.has_permission('technical_review.close')
  )
  with check (
    app.can_access_terminal(terminal_id)
    and app.has_permission('technical_review.close')
  );

drop policy if exists technical_review_rejections_write on public.technical_review_rejections;
create policy technical_review_rejections_write on public.technical_review_rejections
  for all to authenticated
  using (
    app.has_permission('technical_review.close')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  )
  with check (
    app.has_permission('technical_review.close')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

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

-- No existe una pantalla de consulta de auditoría. La bitácora sigue siendo
-- append-only e interna, sin publicar una capacidad inexistente.
drop policy if exists audit_logs_select on public.audit_logs;
revoke select on public.audit_logs from authenticated;

