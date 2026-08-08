-- =============================================================================
-- Utilidades de test
-- =============================================================================
-- Se instalan sólo en la base de pruebas. Nunca en producción.
--
-- Los tests se ejecutan como el rol `authenticated` con `request.jwt.claim.sub`
-- apuntando al usuario simulado: exactamente el mismo contexto que usa
-- PostgREST. Por eso lo que estas pruebas verifican es RLS real, no una
-- aproximación.
-- =============================================================================

create schema if not exists tests;

-- El rol `authenticated` debe poder invocar las utilidades: los tests cambian a
-- ese rol para ejercitar RLS. Las funciones son SECURITY INVOKER, así que
-- llamarlas no otorga ningún privilegio adicional.
grant usage on schema tests to authenticated;

-- -----------------------------------------------------------------------------
-- Aserciones
-- -----------------------------------------------------------------------------
create or replace function tests.assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

create or replace function tests.assert_equals(p_actual anyelement, p_expected anyelement, p_message text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ASSERTION FAILED: % (esperado: %, obtenido: %)',
      p_message, coalesce(p_expected::text, 'NULL'), coalesce(p_actual::text, 'NULL');
  end if;
end;
$$;

-- Verifica que una sentencia falle con un error que contenga cierto texto.
-- El bloque BEGIN/EXCEPTION crea un savepoint implícito, así que el fallo
-- esperado no aborta la transacción del test.
create or replace function tests.assert_raises(p_sql text, p_expected text, p_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if position(p_expected in sqlerrm) = 0 then
        raise exception 'ASSERTION FAILED: % — se esperaba un error con "%" pero ocurrió: %',
          p_message, p_expected, sqlerrm;
      end if;
      return;
  end;

  raise exception 'ASSERTION FAILED: % — se esperaba el error "%" pero la sentencia tuvo éxito',
    p_message, p_expected;
end;
$$;

-- Cuenta filas visibles para el usuario actual (a través de RLS)
create or replace function tests.visible_count(p_relation text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from %s', p_relation) into v_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contexto de sesión
-- -----------------------------------------------------------------------------
create or replace function tests.authenticate_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.become_owner()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
-- Datos EXCLUSIVAMENTE de prueba, creados dentro de una transacción que siempre
-- se revierte (§75).
-- -----------------------------------------------------------------------------
create or replace function tests.create_terminal(p_name text)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.terminals (name) values (p_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function tests.create_role(p_name text, p_permissions text[])
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.roles (name) values (p_name) returning id into v_id;
  insert into public.role_permissions (role_id, permission_code)
  select v_id, unnest(p_permissions);
  return v_id;
end;
$$;

create or replace function tests.create_role_with_all_permissions(p_name text)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.roles (name) values (p_name) returning id into v_id;
  insert into public.role_permissions (role_id, permission_code)
  select v_id, code from public.permissions;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Generador de RUTs de prueba válidos
-- -----------------------------------------------------------------------------
-- El RUT es único a nivel global, así que cada usuario de prueba necesita el
-- suyo. Se generan calculando el dígito verificador real, de modo que pasen la
-- misma validación que un RUT de producción.
-- -----------------------------------------------------------------------------
create sequence if not exists tests.rut_seq start with 5000000;

create or replace function tests.next_rut()
returns text
language plpgsql
as $$
declare
  v_body   text := nextval('tests.rut_seq')::text;
  v_sum    int := 0;
  v_factor int := 2;
  v_i      int;
  v_rest   int;
  v_dv     text;
begin
  for v_i in reverse length(v_body)..1 loop
    v_sum := v_sum + (substring(v_body from v_i for 1))::int * v_factor;
    v_factor := case when v_factor = 7 then 2 else v_factor + 1 end;
  end loop;

  v_rest := 11 - (v_sum % 11);
  v_dv := case when v_rest = 11 then '0' when v_rest = 10 then 'k' else v_rest::text end;

  return v_body || '-' || v_dv;
end;
$$;

create or replace function tests.create_user(
  p_rut         text,
  p_name        text,
  p_terminal_id uuid,
  p_role_id     uuid,
  p_global      boolean default false,
  p_status      text default 'ACTIVE'
)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  -- El email lleva un sufijo aleatorio: un mismo RUT puede reutilizarse en
  -- bloques distintos del mismo archivo de test sin chocar en auth.users.
  insert into auth.users (email)
  values (p_rut || '.' || extensions.gen_random_uuid() || '@test.invalid')
  returning id into v_id;

  insert into public.profiles (id, rut, full_name, job_title, primary_terminal_id, role_id, status, has_global_access)
  values (v_id, app.normalize_rut(p_rut), p_name, 'Cargo de prueba', p_terminal_id, p_role_id, p_status, p_global);
  return v_id;
end;
$$;

create or replace function tests.create_bus(
  p_internal_number text,
  p_ppu             text,
  p_terminal_id     uuid
)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.fleet (internal_number, ppu, fuel_type, terminal_id)
  values (p_internal_number, p_ppu, 'DIESEL', p_terminal_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Documento de prueba: registra sólo metadata, no toca Storage.
create or replace function tests.attach_document(p_event_id uuid, p_type text)
returns uuid
language plpgsql
as $$
declare
  v_event public.technical_review_events;
  v_id    uuid;
begin
  select * into v_event from public.technical_review_events where id = p_event_id;

  insert into public.technical_review_documents (
    technical_review_event_id, document_type, original_name, storage_path,
    mime_type, size_bytes, uploaded_by
  )
  values (
    p_event_id,
    p_type,
    p_type || '.pdf',
    'technical-reviews/' || v_event.terminal_id || '/' || v_event.fleet_id || '/' || p_event_id || '/' || p_type || '.pdf',
    'application/pdf',
    1024,
    coalesce((select auth.uid()), v_event.created_by)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on all functions in schema tests to authenticated;
