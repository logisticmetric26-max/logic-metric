-- =============================================================================
-- 200 · Funciones de seguridad reutilizables
-- =============================================================================
-- Todas son SECURITY DEFINER con `search_path = ''` explícito y referencias
-- totalmente calificadas: no dependen del search_path del invocador, por lo que
-- no son vulnerables a escalamiento vía objetos "sombra".
--
-- Ser SECURITY DEFINER es intencional: estas funciones se usan DENTRO de las
-- políticas RLS y deben poder leer `profiles` / `role_permissions` sin volver a
-- disparar RLS (lo que provocaría recursión infinita).
--
-- Ninguna recibe el id de usuario por parámetro: siempre operan sobre
-- `auth.uid()`. Así el cliente no puede pedir "los permisos de otro".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfil del usuario autenticado
-- -----------------------------------------------------------------------------
create or replace function app.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- ¿El usuario existe y está activo?
-- Un usuario SUSPENDIDO no pasa ninguna política RLS.
-- -----------------------------------------------------------------------------
create or replace function app.user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'ACTIVE'
  );
$$;

-- -----------------------------------------------------------------------------
-- ¿Acceso global a todos los terminales?
-- -----------------------------------------------------------------------------
create or replace function app.has_global_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'ACTIVE'
      and p.has_global_access
  );
$$;

-- -----------------------------------------------------------------------------
-- Terminales a los que el usuario tiene acceso
-- -----------------------------------------------------------------------------
create or replace function app.accessible_terminal_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.terminals t
  where app.has_global_access()

  union

  select p.primary_terminal_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'ACTIVE'

  union

  select uta.terminal_id
  from public.user_terminal_access uta
  join public.profiles p on p.id = uta.user_id
  where uta.user_id = (select auth.uid())
    and p.status = 'ACTIVE';
$$;

-- -----------------------------------------------------------------------------
-- ¿Puede acceder a un terminal concreto?
-- Núcleo del aislamiento por terminal: se invoca desde cada política RLS.
-- -----------------------------------------------------------------------------
create or replace function app.can_access_terminal(p_terminal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_terminal_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'ACTIVE'
        and (
          p.has_global_access
          or p.primary_terminal_id = p_terminal_id
          or exists (
            select 1
            from public.user_terminal_access uta
            where uta.user_id = p.id
              and uta.terminal_id = p_terminal_id
          )
        )
    );
$$;

-- -----------------------------------------------------------------------------
-- ¿Tiene un permiso?
-- Resolución: override explícito del usuario > permiso del rol.
-- Un usuario suspendido nunca tiene permisos.
-- -----------------------------------------------------------------------------
create or replace function app.has_permission(p_permission text)
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

-- -----------------------------------------------------------------------------
-- Permisos efectivos del usuario autenticado
-- -----------------------------------------------------------------------------
create or replace function app.effective_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  with role_perms as (
    select rp.permission_code
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = (select auth.uid())
      and p.status = 'ACTIVE'
  ),
  overrides as (
    select o.permission_code, o.granted
    from public.user_permission_overrides o
    join public.profiles p on p.id = o.user_id
    where o.user_id = (select auth.uid())
      and p.status = 'ACTIVE'
  )
  select permission_code from role_perms
  where permission_code not in (select permission_code from overrides where not granted)
  union
  select permission_code from overrides where granted;
$$;

-- -----------------------------------------------------------------------------
-- Aserción para RPC / funciones de negocio
-- -----------------------------------------------------------------------------
create or replace function app.assert_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.user_is_active() then
    raise exception 'USER_SUSPENDED' using errcode = '42501';
  end if;

  if not app.has_permission(p_permission) then
    raise exception 'PERMISSION_DENIED:%', p_permission using errcode = '42501';
  end if;
end;
$$;

create or replace function app.assert_terminal_access(p_terminal_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_access_terminal(p_terminal_id) then
    raise exception 'TERMINAL_ACCESS_DENIED' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Parámetro configurable: días para considerar "próximo a vencer"
-- -----------------------------------------------------------------------------
create or replace function app.expiring_soon_days()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::int
     from public.app_settings s
     where s.key = 'technical_review.expiring_soon_days'),
    30
  );
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke all on function app.current_profile()             from public;
revoke all on function app.user_is_active()              from public;
revoke all on function app.has_global_access()           from public;
revoke all on function app.accessible_terminal_ids()     from public;
revoke all on function app.can_access_terminal(uuid)     from public;
revoke all on function app.has_permission(text)          from public;
revoke all on function app.effective_permissions()       from public;
revoke all on function app.assert_permission(text)       from public;
revoke all on function app.assert_terminal_access(uuid)  from public;
revoke all on function app.expiring_soon_days()          from public;

grant execute on function app.current_profile()            to authenticated, service_role;
grant execute on function app.user_is_active()             to authenticated, service_role;
grant execute on function app.has_global_access()          to authenticated, service_role;
grant execute on function app.accessible_terminal_ids()    to authenticated, service_role;
grant execute on function app.can_access_terminal(uuid)    to authenticated, service_role;
grant execute on function app.has_permission(text)         to authenticated, service_role;
grant execute on function app.effective_permissions()      to authenticated, service_role;
grant execute on function app.assert_permission(text)      to authenticated, service_role;
grant execute on function app.assert_terminal_access(uuid) to authenticated, service_role;
grant execute on function app.expiring_soon_days()         to authenticated, service_role;

-- =============================================================================
-- API pública: contexto del usuario autenticado
-- =============================================================================
-- Devuelve SÓLO datos del propio usuario. Es lo que la aplicación usa para
-- renderizar menú, botones y rutas. La autorización real sigue siendo RLS.
-- =============================================================================
create or replace function public.current_user_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    else (
      select jsonb_build_object(
        'profile', jsonb_build_object(
          'id',                 p.id,
          'rut',                p.rut,
          'full_name',          p.full_name,
          'job_title',          p.job_title,
          'status',             p.status,
          'has_global_access',  p.has_global_access,
          'primary_terminal_id', p.primary_terminal_id,
          'role_id',            p.role_id,
          'role_name',          r.name
        ),
        'permissions', coalesce(
          (select jsonb_agg(perm order by perm) from app.effective_permissions() perm),
          '[]'::jsonb
        ),
        'terminals', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('id', t.id, 'name', t.name, 'code', t.code, 'active', t.active)
              order by t.name
            )
            from public.terminals t
            where t.id in (select app.accessible_terminal_ids())
          ),
          '[]'::jsonb
        )
      )
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = (select auth.uid())
    )
  end;
$$;

comment on function public.current_user_context() is
  'Perfil, permisos efectivos y terminales autorizados del usuario autenticado. Nunca expone datos de terceros.';

revoke all on function public.current_user_context() from public;
grant execute on function public.current_user_context() to authenticated, service_role;

-- =============================================================================
-- Inmutabilidad del RUT
-- =============================================================================
-- El identificador técnico que usa Supabase Auth se deriva de forma determinista
-- del RUT (ver `src/lib/auth/rut-identity.ts`). Por eso el RUT no puede cambiar
-- una vez creado el usuario: mantiene alineados perfil y credencial, y elimina
-- la necesidad de consultar la base durante el login (lo que permitiría
-- enumerar RUTs existentes desde el exterior).
-- =============================================================================
create or replace function app.prevent_rut_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.rut is distinct from old.rut then
    raise exception 'RUT_IS_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_rut_change
  before update on public.profiles
  for each row execute function app.prevent_rut_change();
