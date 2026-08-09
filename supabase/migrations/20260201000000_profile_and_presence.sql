-- =============================================================================
-- 1200 · Perfil propio y presencia
-- =============================================================================
-- Añade tres cosas que se sostienen entre sí:
--
--   · FOTO      · `profiles.avatar_path` + bucket público `avatars`
--   · PRESENCIA · tabla `user_presence` con último acceso y última señal
--   · AUTOGESTIÓN · funciones para que cada usuario cambie SU foto sin
--                   necesitar el permiso de edición de usuarios
--
-- La presencia vive en su PROPIA tabla, no en `profiles`. El motivo es el
-- registro de auditoría: `profiles` tiene un disparador que anota cada UPDATE,
-- y una señal de presencia cada minuto por usuario convertiría la bitácora en
-- ruido y la haría crecer sin control. `user_presence` no se audita porque no
-- documenta una decisión de nadie: es telemetría.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Foto de perfil
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_path text;

-- La ruta SIEMPRE empieza por el id del usuario: es lo que permite que la
-- política de storage autorice la escritura comparando carpeta contra `uid`.
alter table public.profiles
  drop constraint if exists profiles_avatar_path_check;
alter table public.profiles
  add constraint profiles_avatar_path_check check (
    avatar_path is null
    or avatar_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9._-]{1,100}$'
  );

comment on column public.profiles.avatar_path is
  'Ruta dentro del bucket público `avatars`, con el formato {user_id}/{archivo}. Nula si el usuario no tiene foto.';

-- -----------------------------------------------------------------------------
-- Presencia
-- -----------------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  -- Momento del último inicio de sesión correcto
  last_login_at timestamptz,
  -- Última señal de vida de una pestaña abierta; es lo que decide «conectado»
  last_seen_at  timestamptz,
  login_count   integer not null default 0
);

comment on table public.user_presence is
  'Telemetría de acceso: último login y última señal de actividad. No se audita: no registra decisiones, sólo actividad.';

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen_at desc nulls last);

alter table public.user_presence enable row level security;

-- Se lee con la misma regla que la ficha del usuario: uno mismo siempre, y los
-- demás sólo con permiso de ver usuarios. Nadie puede escribir directamente:
-- las dos únicas escrituras pasan por funciones `security definer`.
drop policy if exists user_presence_select on public.user_presence;
create policy user_presence_select on public.user_presence
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_permission('users.view')
  );

grant select on public.user_presence to authenticated;

-- -----------------------------------------------------------------------------
-- Señal de presencia
-- -----------------------------------------------------------------------------
-- La envía la pestaña abierta cada pocos minutos. Es deliberadamente barata:
-- una sola fila por usuario, sin historial y sin auditoría.
-- -----------------------------------------------------------------------------
create or replace function public.touch_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return;
  end if;

  -- Sólo usuarios ACTIVOS marcan presencia: un usuario suspendido con una
  -- pestaña abierta no debe aparecer como conectado.
  if not exists (
    select 1 from public.profiles p where p.id = v_user and p.status = 'ACTIVE'
  ) then
    return;
  end if;

  insert into public.user_presence (user_id, last_seen_at)
  values (v_user, now())
  on conflict (user_id) do update set last_seen_at = now();
end;
$$;

revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

-- -----------------------------------------------------------------------------
-- Registro de inicio de sesión (§57) · ahora también actualiza la presencia
-- -----------------------------------------------------------------------------
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

  insert into public.user_presence (user_id, last_login_at, last_seen_at, login_count)
  values (v_profile.id, now(), now(), 1)
  on conflict (user_id) do update set
    last_login_at = now(),
    last_seen_at  = now(),
    login_count   = public.user_presence.login_count + 1;

  perform app.write_audit(
    'LOGIN', 'USER', v_profile.id::text, v_profile.primary_terminal_id,
    null, null, jsonb_build_object('status', v_profile.status)
  );
end;
$$;

revoke all on function public.record_login() from public;
grant execute on function public.record_login() to authenticated;

-- -----------------------------------------------------------------------------
-- Foto propia
-- -----------------------------------------------------------------------------
-- Cambiar la propia foto no es administrar usuarios: exigir `users.edit` daría
-- a cualquiera que quiera su foto el permiso de editar a los demás. Esta
-- función acota la excepción a UNA columna y al PROPIO usuario.
-- -----------------------------------------------------------------------------
create or replace function public.set_own_avatar(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- La ruta debe estar dentro de la carpeta del propio usuario. Sin esto, uno
  -- podría apuntar su ficha a la foto de otro.
  if p_path is not null and p_path !~ ('^' || v_user::text || '/[A-Za-z0-9._-]{1,100}$') then
    raise exception 'INVALID_AVATAR_PATH';
  end if;

  update public.profiles
  set avatar_path = p_path,
      updated_by  = v_user
  where id = v_user;
end;
$$;

revoke all on function public.set_own_avatar(text) from public;
grant execute on function public.set_own_avatar(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Vistas
-- -----------------------------------------------------------------------------
create or replace view public.profiles_view
with (security_invoker = on) as
select
  p.id,
  p.rut,
  p.full_name,
  p.job_title,
  p.status,
  p.has_global_access,
  p.avatar_path,
  p.primary_terminal_id,
  t.name    as primary_terminal_name,
  p.role_id,
  r.name    as role_name,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', t2.id, 'name', t2.name) order by t2.name)
      from public.user_terminal_access uta
      join public.terminals t2 on t2.id = uta.terminal_id
      where uta.user_id = p.id
    ),
    '[]'::jsonb
  )         as additional_terminals,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('permission_code', o.permission_code, 'granted', o.granted)
                       order by o.permission_code)
      from public.user_permission_overrides o
      where o.user_id = p.id
    ),
    '[]'::jsonb
  )         as permission_overrides,
  pr.last_login_at,
  pr.last_seen_at,
  coalesce(pr.login_count, 0) as login_count,
  p.created_at,
  p.updated_at
from public.profiles p
join public.terminals t on t.id = p.primary_terminal_id
join public.roles r on r.id = p.role_id
left join public.user_presence pr on pr.user_id = p.id;

grant select on public.profiles_view to authenticated;

-- -----------------------------------------------------------------------------
-- Contexto del usuario · ahora incluye su foto
-- -----------------------------------------------------------------------------
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
          'avatar_path',        p.avatar_path,
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

revoke all on function public.current_user_context() from public;
grant execute on function public.current_user_context() to authenticated, service_role;

-- =============================================================================
-- Storage · bucket público de fotos de perfil
-- =============================================================================
-- Convención de rutas:  {user_id}/{archivo}
--
-- PÚBLICO a propósito: la foto acompaña al nombre en listados, cabecera y
-- menús, y firmar una URL distinta para cada avatar en cada render sería caro
-- y se invalidaría constantemente. Lo que se publica es una foto de perfil
-- corporativa; ningún dato de negocio vive en este bucket.
--
-- La escritura sigue siendo privada: sólo se puede escribir DENTRO de la
-- carpeta propia, y el nombre del archivo lleva un aleatorio, de modo que la
-- URL de una foto no se puede adivinar a partir del id de un usuario.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,                    -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_remove on storage.objects;
create policy avatars_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
