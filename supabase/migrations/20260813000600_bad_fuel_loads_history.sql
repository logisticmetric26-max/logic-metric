-- SECCION: COMBUSTIBLE
-- =============================================================================
-- 1509 · Bad fuel loads history and enriched view
-- =============================================================================

alter table public.bad_fuel_loads
  add column if not exists exported_at timestamptz,
  add column if not exists exported_by uuid references public.profiles (id) on delete set null,
  add column if not exists export_file_name text;

alter table public.bad_fuel_loads
  drop constraint if exists bad_fuel_loads_export_file_name_check;

alter table public.bad_fuel_loads
  add constraint bad_fuel_loads_export_file_name_check
  check (
    export_file_name is null
    or length(trim(export_file_name)) between 1 and 180
  );

comment on column public.bad_fuel_loads.exported_at is
  'Fecha y hora en que el registro fue exportado al archivo CSV operacional.';

comment on column public.bad_fuel_loads.exported_by is
  'Usuario que genero la exportacion del registro.';

comment on column public.bad_fuel_loads.export_file_name is
  'Nombre del archivo CSV en el que se incluyo el registro.';

create index if not exists bad_fuel_loads_exported_at_idx
  on public.bad_fuel_loads (exported_at desc, load_date desc, load_time desc);

drop policy if exists reader_codes_select on public.reader_codes;

create policy reader_codes_select on public.reader_codes
  for select to authenticated
  using (
    app.user_is_active()
    and (
      app.has_permission('reader_codes.view')
      or app.has_permission('bad_loads.view')
    )
  );

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
  b.updated_at,
  rc.reader_code,
  d.planner_rut,
  d.supervisor_rut,
  b.exported_at,
  b.exported_by,
  app.actor_name(b.exported_by)       as exported_by_name,
  b.export_file_name
from public.bad_fuel_loads b
join public.fleet f on f.id = b.fleet_id
join public.terminals t on t.id = b.terminal_id
join public.dispensers d on d.id = b.dispenser_id
left join lateral (
  select reader_codes.reader_code
  from public.reader_codes
  where reader_codes.active
    and (
      reader_codes.ppu = f.ppu
      or reader_codes.internal_number = f.internal_number
    )
  order by
    case when reader_codes.ppu = f.ppu then 0 else 1 end,
    reader_codes.updated_at desc,
    reader_codes.created_at desc
  limit 1
) rc on true;
