-- SECCION: REVISION TECNICA
-- =============================================================================
-- 1400 · Performance fixes and terminal delete support
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order)
values (
  'terminals.delete',
  'terminals',
  'Eliminar terminales',
  'Eliminar definitivamente un terminal sin dependencias operacionales.',
  330
)
on conflict (code) do update
set module = excluded.module,
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

grant delete on public.terminals to authenticated;

drop policy if exists terminals_delete on public.terminals;

create policy terminals_delete on public.terminals
  for delete to authenticated
  using (
    app.has_permission('terminals.delete')
    and (app.has_global_access() or app.can_access_terminal(id))
  );

create index if not exists tre_open_departure_idx
  on public.technical_review_events (departure_at desc)
  where status = 'OPEN';

create index if not exists tre_closed_return_idx
  on public.technical_review_events (return_at desc)
  where status = 'CLOSED';

create index if not exists tre_closed_result_return_idx
  on public.technical_review_events (result, return_at desc)
  where status = 'CLOSED' and result is not null;

create index if not exists tre_terminal_closed_return_idx
  on public.technical_review_events (terminal_id, return_at desc)
  where status = 'CLOSED';

create index if not exists tre_terminal_closed_result_return_idx
  on public.technical_review_events (terminal_id, result, return_at desc)
  where status = 'CLOSED' and result is not null;

create index if not exists tre_fleet_last_approved_idx
  on public.technical_review_events (fleet_id, return_at desc, created_at desc)
  where status = 'CLOSED' and result = 'APPROVED';

create or replace view public.fleet_expiration_status
with (security_invoker = on) as
with latest_approved as (
  select distinct on (e.fleet_id)
    e.fleet_id,
    e.id            as last_approved_event_id,
    e.expiration_date,
    e.return_at     as last_approved_at,
    e.guide_number  as last_guide_number
  from public.technical_review_events e
  where e.status = 'CLOSED'
    and e.result = 'APPROVED'
  order by e.fleet_id, e.return_at desc, e.created_at desc
),
base as (
  select
    f.id as fleet_id,
    f.internal_number,
    f.ppu,
    f.model,
    f.subclass,
    f.fuel_type,
    f.terminal_id,
    f.active,
    la.last_approved_event_id,
    coalesce(la.expiration_date, app.legacy_expiration_for_fleet(f.id)) as expiration_date,
    la.last_approved_at,
    la.last_guide_number,
    f.zone
  from public.fleet f
  left join latest_approved la on la.fleet_id = f.id
)
select
  b.fleet_id,
  b.internal_number,
  b.ppu,
  b.model,
  b.subclass,
  b.fuel_type,
  b.terminal_id,
  b.active,
  b.last_approved_event_id,
  b.expiration_date,
  b.last_approved_at,
  b.last_guide_number,
  case
    when b.expiration_date is null then 'NO_RECORD'
    when b.expiration_date < app.today_local() then 'EXPIRED'
    when b.expiration_date <= app.today_local() + app.expiring_soon_days() then 'EXPIRING_SOON'
    else 'VALID'
  end as expiration_status,
  (b.expiration_date - app.today_local()) as days_to_expiration,
  b.zone
from base b;

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
  with bounds as (
    select
      p_from as from_date,
      p_to as to_date,
      p_terminal_id as terminal_id,
      case
        when p_from is null then null
        else (p_from::timestamp at time zone app.local_timezone())
      end as from_ts,
      case
        when p_to is null then null
        else ((p_to + 1)::timestamp at time zone app.local_timezone())
      end as to_ts_exclusive
  )
  select jsonb_build_object(
    'in_review', (
      select count(*)
      from public.technical_review_events e
      cross join bounds b
      where e.status = 'OPEN'
        and (b.terminal_id is null or e.terminal_id = b.terminal_id)
        and (b.from_ts is null or e.departure_at >= b.from_ts)
        and (b.to_ts_exclusive is null or e.departure_at < b.to_ts_exclusive)
    ),
    'approved', (
      select count(*)
      from public.technical_review_events e
      cross join bounds b
      where e.status = 'CLOSED'
        and e.result = 'APPROVED'
        and (b.terminal_id is null or e.terminal_id = b.terminal_id)
        and (b.from_ts is null or e.return_at >= b.from_ts)
        and (b.to_ts_exclusive is null or e.return_at < b.to_ts_exclusive)
    ),
    'rejected', (
      select count(*)
      from public.technical_review_events e
      cross join bounds b
      where e.status = 'CLOSED'
        and e.result = 'REJECTED'
        and (b.terminal_id is null or e.terminal_id = b.terminal_id)
        and (b.from_ts is null or e.return_at >= b.from_ts)
        and (b.to_ts_exclusive is null or e.return_at < b.to_ts_exclusive)
    ),
    'not_sent', (
      select count(*)
      from public.technical_review_not_sent n
      cross join bounds b
      where (b.terminal_id is null or n.terminal_id = b.terminal_id)
        and (b.from_date is null or n.event_date >= b.from_date)
        and (b.to_date is null or n.event_date <= b.to_date)
    ),
    'expiring_soon', (
      select count(*)
      from public.fleet_expiration_status s
      cross join bounds b
      where s.active
        and s.expiration_status = 'EXPIRING_SOON'
        and (b.terminal_id is null or s.terminal_id = b.terminal_id)
    ),
    'expired', (
      select count(*)
      from public.fleet_expiration_status s
      cross join bounds b
      where s.active
        and s.expiration_status = 'EXPIRED'
        and (b.terminal_id is null or s.terminal_id = b.terminal_id)
    ),
    'expiring_soon_days', app.expiring_soon_days()
  )
  from bounds;
$$;
