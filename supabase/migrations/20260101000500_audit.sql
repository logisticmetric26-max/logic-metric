-- =============================================================================
-- 500 · Auditoría
-- =============================================================================
-- Bitácora append-only. No existen políticas de UPDATE ni DELETE: ni siquiera un
-- administrador puede reescribir la historia desde la aplicación.
--
-- NUNCA se escriben contraseñas, tokens ni claves: `app.write_audit` filtra
-- claves sensibles antes de persistir (§58).
-- =============================================================================

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid references public.profiles (id) on delete set null,
  -- Copia del RUT y nombre al momento del hecho: si el usuario se elimina, la
  -- traza sigue siendo legible.
  actor_rut    text,
  actor_name   text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  terminal_id  uuid references public.terminals (id) on delete set null,
  before_data  jsonb,
  after_data   jsonb,
  metadata     jsonb,
  created_at   timestamptz not null default now(),

  constraint audit_action_check check (length(trim(action)) between 1 and 80),
  constraint audit_entity_type_check check (length(trim(entity_type)) between 1 and 80)
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_terminal_idx on public.audit_logs (terminal_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

-- -----------------------------------------------------------------------------
-- Depuración de datos sensibles
-- -----------------------------------------------------------------------------
create or replace function app.redact_sensitive(p_data jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_data is null then null
    else p_data
         - 'password' - 'encrypted_password' - 'confirm_password'
         - 'token' - 'access_token' - 'refresh_token'
         - 'service_role_key' - 'api_key' - 'secret'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Escritura de auditoría
-- -----------------------------------------------------------------------------
create or replace function app.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text default null,
  p_terminal_id uuid default null,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_metadata    jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = (select auth.uid());

  insert into public.audit_logs (
    user_id, actor_rut, actor_name, action, entity_type, entity_id,
    terminal_id, before_data, after_data, metadata
  )
  values (
    v_profile.id,
    v_profile.rut,
    v_profile.full_name,
    p_action,
    p_entity_type,
    p_entity_id,
    p_terminal_id,
    app.redact_sensitive(p_before),
    app.redact_sensitive(p_after),
    app.redact_sensitive(p_metadata)
  );
end;
$$;

revoke all on function app.write_audit(text, text, text, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function app.write_audit(text, text, text, uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Trigger genérico de auditoría
-- Uso: create trigger ... execute function app.audit_row('ENTITY_NAME', 'terminal_column')
-- -----------------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity      text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
  v_terminal_col text := TG_ARGV[1];
  v_before      jsonb;
  v_after       jsonb;
  v_entity_id   text;
  v_terminal_id uuid;
begin
  if TG_OP <> 'INSERT' then
    v_before := to_jsonb(old);
  end if;
  if TG_OP <> 'DELETE' then
    v_after := to_jsonb(new);
  end if;

  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id');

  if v_terminal_col is not null then
    v_terminal_id := nullif(coalesce(v_after ->> v_terminal_col, v_before ->> v_terminal_col), '')::uuid;
  end if;

  -- UPDATE sin cambios reales no ensucia la bitácora
  if TG_OP = 'UPDATE' and v_before - 'updated_at' = v_after - 'updated_at' then
    return null;
  end if;

  perform app.write_audit(
    TG_OP || '_' || v_entity,
    v_entity,
    v_entity_id,
    v_terminal_id,
    v_before,
    v_after
  );

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers de auditoría por entidad
-- -----------------------------------------------------------------------------
create trigger terminals_audit
  after insert or update or delete on public.terminals
  for each row execute function app.audit_row('TERMINAL', 'id');

create trigger fleet_audit
  after insert or update or delete on public.fleet
  for each row execute function app.audit_row('FLEET', 'terminal_id');

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function app.audit_row('USER', 'primary_terminal_id');

create trigger roles_audit
  after insert or update or delete on public.roles
  for each row execute function app.audit_row('ROLE');

create trigger role_permissions_audit
  after insert or delete on public.role_permissions
  for each row execute function app.audit_row('ROLE_PERMISSION');

create trigger user_terminal_access_audit
  after insert or delete on public.user_terminal_access
  for each row execute function app.audit_row('USER_TERMINAL_ACCESS', 'terminal_id');

create trigger user_permission_overrides_audit
  after insert or update or delete on public.user_permission_overrides
  for each row execute function app.audit_row('USER_PERMISSION');

create trigger technical_review_events_audit
  after insert or update or delete on public.technical_review_events
  for each row execute function app.audit_row('TECHNICAL_REVIEW', 'terminal_id');

create trigger technical_review_documents_audit
  after insert or update or delete on public.technical_review_documents
  for each row execute function app.audit_row('TECHNICAL_REVIEW_DOCUMENT');

create trigger technical_review_rejections_audit
  after insert or update or delete on public.technical_review_rejections
  for each row execute function app.audit_row('TECHNICAL_REVIEW_REJECTION');

create trigger technical_review_not_sent_audit
  after insert or update or delete on public.technical_review_not_sent
  for each row execute function app.audit_row('NOT_SENT', 'terminal_id');

create trigger app_settings_audit
  after insert or update on public.app_settings
  for each row execute function app.audit_row('APP_SETTING');
