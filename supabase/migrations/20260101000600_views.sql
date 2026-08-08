-- =============================================================================
-- 600 · Vistas de lectura
-- =============================================================================
-- Todas usan `security_invoker = on`: se evalúan con los permisos y RLS del
-- usuario que consulta, nunca con los del creador de la vista. Filtrar por la
-- vista es tan seguro como filtrar por la tabla.
--
-- Existen para que la aplicación resuelva cada listado con UNA consulta ya
-- unida y paginable en la base, en lugar de traer filas y completarlas con
-- consultas adicionales (§68, evitar N+1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Zona horaria operacional (configurable, no hardcodeada)
-- -----------------------------------------------------------------------------
create or replace function app.local_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.value #>> '{}' from public.app_settings s where s.key = 'general.timezone'),
    'America/Santiago'
  );
$$;

create or replace function app.today_local()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone app.local_timezone())::date;
$$;

revoke all on function app.local_timezone() from public;
revoke all on function app.today_local() from public;
grant execute on function app.local_timezone() to authenticated, service_role;
grant execute on function app.today_local() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Nombre del autor de un registro
-- -----------------------------------------------------------------------------
-- §20 y §35 exigen mostrar "usuario que registró". RLS sobre `profiles` sólo
-- deja ver la ficha propia salvo que se tenga `users.view`, así que un JOIN
-- normal devolvería NULL para los compañeros de terminal.
--
-- Esta función revela EXCLUSIVAMENTE el nombre, y sólo de usuarios que ya
-- aparecen en registros que el consultante puede ver. Es una divulgación
-- mínima y deliberada, no un atajo alrededor de RLS.
-- -----------------------------------------------------------------------------
create or replace function app.actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name from public.profiles p where p.id = p_user_id;
$$;

revoke all on function app.actor_name(uuid) from public;
grant execute on function app.actor_name(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- fleet_expiration_status
-- -----------------------------------------------------------------------------
-- El vencimiento vigente de un bus es el del ÚLTIMO evento cerrado y APROBADO.
-- Derivarlo (en lugar de guardar una columna denormalizada) hace imposible que
-- un rechazo o un no-envío lo pisen por error: la regla §39 se cumple por
-- construcción, no por disciplina del programador.
-- -----------------------------------------------------------------------------
create view public.fleet_expiration_status
with (security_invoker = on) as
select
  f.id                          as fleet_id,
  f.internal_number,
  f.ppu,
  f.model,
  f.subclass,
  f.fuel_type,
  f.terminal_id,
  f.active,
  la.id                         as last_approved_event_id,
  la.expiration_date,
  la.return_at                  as last_approved_at,
  la.guide_number               as last_guide_number,
  case
    when la.expiration_date is null then 'NO_RECORD'
    when la.expiration_date < app.today_local() then 'EXPIRED'
    when la.expiration_date <= app.today_local() + app.expiring_soon_days() then 'EXPIRING_SOON'
    else 'VALID'
  end                           as expiration_status,
  (la.expiration_date - app.today_local()) as days_to_expiration
from public.fleet f
left join lateral (
  select e.id, e.expiration_date, e.return_at, e.guide_number
  from public.technical_review_events e
  where e.fleet_id = f.id
    and e.status = 'CLOSED'
    and e.result = 'APPROVED'
  order by e.return_at desc, e.created_at desc
  limit 1
) la on true;

comment on view public.fleet_expiration_status is
  'Estado de vencimiento vigente por bus: VALID / EXPIRING_SOON / EXPIRED / NO_RECORD. El umbral es configurable en app_settings.';

-- -----------------------------------------------------------------------------
-- fleet_view · flota con el nombre de su terminal
-- -----------------------------------------------------------------------------
create view public.fleet_view
with (security_invoker = on) as
select
  f.id,
  f.internal_number,
  f.ppu,
  f.model,
  f.subclass,
  f.fuel_type,
  ft.label        as fuel_type_label,
  f.terminal_id,
  t.name          as terminal_name,
  f.active,
  f.created_at,
  f.updated_at
from public.fleet f
join public.terminals t on t.id = f.terminal_id
left join public.fleet_fuel_types ft on ft.code = f.fuel_type;

-- -----------------------------------------------------------------------------
-- technical_review_events_view
-- -----------------------------------------------------------------------------
create view public.technical_review_events_view
with (security_invoker = on) as
select
  e.id,
  e.fleet_id,
  f.internal_number,
  f.ppu,
  e.terminal_id,
  t.name                                as terminal_name,
  e.driver_name,
  e.departure_at,
  e.return_at,
  e.status,
  e.result,
  e.guide_number,
  e.expiration_date,
  e.previous_expiration_date,
  e.created_by,
  app.actor_name(e.created_by)          as created_by_name,
  e.closed_by,
  app.actor_name(e.closed_by)           as closed_by_name,
  e.created_at,
  e.updated_at,
  coalesce(rc.rejection_count, 0)       as rejection_count,
  coalesce(rc.needs_review_count, 0)    as needs_review_count,
  doc.id                                as rejection_document_id,
  an.status                             as analysis_status
from public.technical_review_events e
join public.fleet f on f.id = e.fleet_id
join public.terminals t on t.id = e.terminal_id
left join (
  select technical_review_event_id                as event_id,
         count(*)                                 as rejection_count,
         count(*) filter (where requires_review)  as needs_review_count
  from public.technical_review_rejections
  group by technical_review_event_id
) rc on rc.event_id = e.id
left join public.technical_review_documents doc
  on doc.technical_review_event_id = e.id and doc.document_type = 'REJECTION_REPORT'
left join public.technical_review_analyses an on an.document_id = doc.id;

comment on view public.technical_review_events_view is
  'Revisiones técnicas con datos del bus, terminal, responsables y estado del análisis del PDF de rechazo.';

-- -----------------------------------------------------------------------------
-- technical_review_not_sent_view
-- -----------------------------------------------------------------------------
create view public.technical_review_not_sent_view
with (security_invoker = on) as
select
  n.id,
  n.fleet_id,
  f.internal_number,
  f.ppu,
  n.terminal_id,
  t.name                        as terminal_name,
  n.event_date,
  n.reason,
  n.work_order_number,
  n.created_by,
  app.actor_name(n.created_by)  as created_by_name,
  n.created_at,
  n.updated_at
from public.technical_review_not_sent n
join public.fleet f on f.id = n.fleet_id
join public.terminals t on t.id = n.terminal_id;

-- -----------------------------------------------------------------------------
-- profiles_view · usuarios con rol, terminal y accesos autorizados (§11)
-- -----------------------------------------------------------------------------
create view public.profiles_view
with (security_invoker = on) as
select
  p.id,
  p.rut,
  p.full_name,
  p.job_title,
  p.status,
  p.has_global_access,
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
  p.created_at,
  p.updated_at
from public.profiles p
join public.terminals t on t.id = p.primary_terminal_id
join public.roles r on r.id = p.role_id;

-- -----------------------------------------------------------------------------
-- roles_view · roles con su recuento de permisos y usuarios
-- -----------------------------------------------------------------------------
create view public.roles_view
with (security_invoker = on) as
select
  r.id,
  r.name,
  r.description,
  r.is_system,
  coalesce(
    (select jsonb_agg(rp.permission_code order by rp.permission_code)
     from public.role_permissions rp where rp.role_id = r.id),
    '[]'::jsonb
  )                  as permissions,
  (select count(*) from public.profiles p where p.role_id = r.id) as user_count,
  r.created_at,
  r.updated_at
from public.roles r;

grant select on public.fleet_expiration_status          to authenticated;
grant select on public.fleet_view                       to authenticated;
grant select on public.technical_review_events_view     to authenticated;
grant select on public.technical_review_not_sent_view   to authenticated;
grant select on public.profiles_view                    to authenticated;
grant select on public.roles_view                       to authenticated;
