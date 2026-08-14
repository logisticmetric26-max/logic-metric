-- SECCION: PLATAFORMA
-- =============================================================================
-- 1100 · Creación del primer administrador
-- =============================================================================
-- No existe ningún usuario preinstalado ni credencial en el código (§74).
--
-- El primer administrador se crea con datos REALES aportados por el operador,
-- mediante `npm run bootstrap:admin` (que llama a esta función con la service
-- role) o ejecutándola desde el SQL Editor de Supabase.
--
-- La función sólo funciona UNA vez: si ya existe algún perfil, falla. A partir
-- de ahí la administración ocurre desde la sección ACCESO.
-- =============================================================================

create or replace function public.bootstrap_administrator(
  p_user_id       uuid,
  p_rut           text,
  p_full_name     text,
  p_job_title     text,
  p_terminal_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rut         text;
  v_terminal_id uuid;
  v_role_id     uuid;
begin
  -- Cerrojo de un solo uso
  if exists (select 1 from public.profiles) then
    raise exception 'BOOTSTRAP_ALREADY_DONE'
      using hint = 'Ya existen usuarios. Cree nuevos administradores desde la sección ACCESO.';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'AUTH_USER_NOT_FOUND'
      using hint = 'Cree primero la credencial en Supabase Auth.';
  end if;

  v_rut := app.normalize_rut(p_rut);
  if v_rut is null then
    raise exception 'INVALID_RUT' using hint = 'El RUT no es válido (dígito verificador incorrecto).';
  end if;

  if length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'FULL_NAME_REQUIRED';
  end if;

  if length(trim(coalesce(p_job_title, ''))) = 0 then
    raise exception 'JOB_TITLE_REQUIRED';
  end if;

  if length(trim(coalesce(p_terminal_name, ''))) = 0 then
    raise exception 'TERMINAL_NAME_REQUIRED'
      using hint = 'Indique el nombre real del terminal principal.';
  end if;

  -- Terminal aportado por el operador (no se inventa ninguno)
  select t.id into v_terminal_id
  from public.terminals t
  where lower(trim(t.name)) = lower(trim(p_terminal_name));

  if v_terminal_id is null then
    insert into public.terminals (name, active)
    values (p_terminal_name, true)
    returning id into v_terminal_id;
  end if;

  select r.id into v_role_id from public.roles r where r.is_system limit 1;
  if v_role_id is null then
    raise exception 'SYSTEM_ROLE_MISSING';
  end if;

  insert into public.profiles (
    id, rut, full_name, job_title, primary_terminal_id, role_id, status, has_global_access
  )
  values (
    p_user_id, v_rut, trim(p_full_name), trim(p_job_title), v_terminal_id, v_role_id, 'ACTIVE', true
  );

  perform app.write_audit(
    'BOOTSTRAP_ADMINISTRATOR', 'USER', p_user_id::text, v_terminal_id,
    null, jsonb_build_object('rut', v_rut, 'terminal', p_terminal_name)
  );

  return jsonb_build_object(
    'user_id',     p_user_id,
    'rut',         v_rut,
    'terminal_id', v_terminal_id,
    'role_id',     v_role_id
  );
end;
$$;

-- Sólo la service role (backend) puede ejecutarla. Nunca el navegador.
revoke all on function public.bootstrap_administrator(uuid, text, text, text, text) from public;
revoke all on function public.bootstrap_administrator(uuid, text, text, text, text) from anon;
revoke all on function public.bootstrap_administrator(uuid, text, text, text, text) from authenticated;
grant execute on function public.bootstrap_administrator(uuid, text, text, text, text) to service_role;

comment on function public.bootstrap_administrator(uuid, text, text, text, text) is
  'Convierte una credencial de Supabase Auth ya creada en el primer administrador. Falla si ya existe cualquier perfil.';
