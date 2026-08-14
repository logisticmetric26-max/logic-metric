-- SECCION: COMBUSTIBLE
-- =============================================================================
-- 1508 · Bad fuel loads
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order)
values
  (
    'bad_loads.view',
    'bad_loads',
    'Ver malas cargas',
    'Consultar registros de malas cargas por fecha, bus, litros y surtidor.',
    141
  ),
  (
    'bad_loads.create',
    'bad_loads',
    'Registrar malas cargas',
    'Registrar nuevas malas cargas de combustible.',
    142
  ),
  (
    'bad_loads.edit',
    'bad_loads',
    'Editar malas cargas',
    'Modificar registros existentes de malas cargas.',
    143
  ),
  (
    'bad_loads.delete',
    'bad_loads',
    'Eliminar malas cargas',
    'Eliminar registros de malas cargas cargados por error.',
    144
  )
on conflict (code) do update
set module = excluded.module,
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into app.permission_dependencies (permission_code, required_permission_code)
values
  ('bad_loads.create', 'bad_loads.view'),
  ('bad_loads.edit', 'bad_loads.view'),
  ('bad_loads.delete', 'bad_loads.view')
on conflict do nothing;

create table if not exists public.bad_fuel_loads (
  id            uuid primary key default gen_random_uuid(),
  fleet_id      uuid not null references public.fleet (id) on delete restrict,
  terminal_id   uuid not null references public.terminals (id) on delete restrict,
  dispenser_id  uuid not null references public.dispensers (id) on delete restrict,
  load_date     date not null,
  load_time     time not null,
  liters        numeric(10,2) not null,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint bad_fuel_loads_liters_check check (liters > 0 and liters <= 99999.99)
);

comment on table public.bad_fuel_loads is
  'Registro operacional de malas cargas de combustible por bus, fecha, hora y surtidor.';

comment on column public.bad_fuel_loads.load_time is
  'Hora informada para la mala carga.';

comment on column public.bad_fuel_loads.liters is
  'Cantidad de litros asociados a la mala carga.';

create index if not exists bad_fuel_loads_terminal_date_idx
  on public.bad_fuel_loads (terminal_id, load_date desc, load_time desc);
create index if not exists bad_fuel_loads_fleet_idx
  on public.bad_fuel_loads (fleet_id, load_date desc);
create index if not exists bad_fuel_loads_dispenser_idx
  on public.bad_fuel_loads (dispenser_id, load_date desc);

create or replace function app.normalize_bad_fuel_load()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_terminal_id uuid;
begin
  select f.terminal_id
    into v_terminal_id
  from public.fleet f
  where f.id = new.fleet_id;

  if not found then
    raise exception 'BAD_LOAD_BUS_NOT_FOUND' using errcode = '23514';
  end if;

  new.terminal_id := v_terminal_id;
  new.liters := round(new.liters, 2);

  return new;
end;
$$;

drop trigger if exists bad_fuel_loads_normalize on public.bad_fuel_loads;

create trigger bad_fuel_loads_normalize
  before insert or update on public.bad_fuel_loads
  for each row execute function app.normalize_bad_fuel_load();

drop trigger if exists bad_fuel_loads_set_updated_at on public.bad_fuel_loads;

create trigger bad_fuel_loads_set_updated_at
  before update on public.bad_fuel_loads
  for each row execute function app.set_updated_at();

create or replace function app.protect_bad_fuel_load()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'BAD_LOAD_IMMUTABLE_FIELDS' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists bad_fuel_loads_protect on public.bad_fuel_loads;

create trigger bad_fuel_loads_protect
  before update on public.bad_fuel_loads
  for each row execute function app.protect_bad_fuel_load();

create or replace view public.bad_fuel_loads_view
with (security_invoker = on) as
select
  b.id,
  b.fleet_id,
  f.internal_number,
  f.ppu,
  b.terminal_id,
  t.name                              as terminal_name,
  b.dispenser_id,
  d.code                              as dispenser_code,
  b.load_date,
  b.load_time,
  b.liters,
  b.created_by,
  app.actor_name(b.created_by)        as created_by_name,
  b.updated_by,
  app.actor_name(b.updated_by)        as updated_by_name,
  b.created_at,
  b.updated_at
from public.bad_fuel_loads b
join public.fleet f on f.id = b.fleet_id
join public.terminals t on t.id = b.terminal_id
join public.dispensers d on d.id = b.dispenser_id;

grant select on public.bad_fuel_loads_view to authenticated;

alter table public.bad_fuel_loads enable row level security;

grant select, insert, update, delete on public.bad_fuel_loads to authenticated;

drop policy if exists bad_fuel_loads_select on public.bad_fuel_loads;
drop policy if exists bad_fuel_loads_insert on public.bad_fuel_loads;
drop policy if exists bad_fuel_loads_update on public.bad_fuel_loads;
drop policy if exists bad_fuel_loads_delete on public.bad_fuel_loads;

create policy bad_fuel_loads_select on public.bad_fuel_loads
  for select to authenticated
  using (
    app.has_permission('bad_loads.view')
    and app.can_access_terminal(terminal_id)
  );

create policy bad_fuel_loads_insert on public.bad_fuel_loads
  for insert to authenticated
  with check (
    app.has_permission('bad_loads.create')
    and app.can_access_terminal(terminal_id)
  );

create policy bad_fuel_loads_update on public.bad_fuel_loads
  for update to authenticated
  using (
    app.has_permission('bad_loads.edit')
    and app.can_access_terminal(terminal_id)
  )
  with check (
    app.has_permission('bad_loads.edit')
    and app.can_access_terminal(terminal_id)
  );

create policy bad_fuel_loads_delete on public.bad_fuel_loads
  for delete to authenticated
  using (
    app.has_permission('bad_loads.delete')
    and app.can_access_terminal(terminal_id)
  );

drop trigger if exists bad_fuel_loads_audit on public.bad_fuel_loads;

create trigger bad_fuel_loads_audit
  after insert or update or delete on public.bad_fuel_loads
  for each row execute function app.audit_row('BAD_FUEL_LOAD');

drop policy if exists fleet_select on public.fleet;

create policy fleet_select on public.fleet
  for select to authenticated
  using (
    (
      app.has_permission('fleet.view')
      or app.has_permission('technical_review.view')
      or app.has_permission('technical_review_not_sent.view')
      or app.has_permission('bus_wash.view')
      or app.has_permission('bad_loads.view')
    )
    and app.can_access_terminal(terminal_id)
  );

drop policy if exists dispensers_select on public.dispensers;

create policy dispensers_select on public.dispensers
  for select to authenticated
  using (
    app.user_is_active()
    and (
      app.has_permission('dispensers.view')
      or app.has_permission('bad_loads.view')
    )
  );
