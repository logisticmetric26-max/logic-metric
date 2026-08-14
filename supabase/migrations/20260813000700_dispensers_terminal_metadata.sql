-- =============================================================================
-- 1510 · Dispensers terminal metadata
-- =============================================================================

alter table public.dispensers
  add column if not exists terminal_name text,
  add column if not exists terminal_code text;

comment on column public.dispensers.terminal_name is
  'Nombre operacional del terminal asociado al surtidor.';

comment on column public.dispensers.terminal_code is
  'Codigo corto del terminal asociado al surtidor.';

update public.dispensers
set terminal_name = coalesce(nullif(trim(terminal_name), ''), 'Terminal sin asignar'),
    terminal_code = coalesce(app.normalize_code(terminal_code), 'SIN_TERMINAL')
where terminal_name is null
   or trim(terminal_name) = ''
   or terminal_code is null;

alter table public.dispensers
  drop constraint if exists dispensers_terminal_name_not_blank;

alter table public.dispensers
  add constraint dispensers_terminal_name_not_blank
  check (length(trim(coalesce(terminal_name, ''))) between 1 and 120);

alter table public.dispensers
  drop constraint if exists dispensers_terminal_code_format;

alter table public.dispensers
  add constraint dispensers_terminal_code_format
  check (terminal_code ~ '^[A-Z0-9][A-Z0-9 _-]{0,29}$');

create index if not exists dispensers_terminal_code_idx on public.dispensers (terminal_code);

create or replace function app.normalize_dispenser()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.code := upper(trim(coalesce(new.code, '')));
  new.terminal_name := regexp_replace(trim(coalesce(new.terminal_name, '')), '\s+', ' ', 'g');
  new.terminal_code := app.normalize_code(new.terminal_code);
  new.planner_rut := app.normalize_rut(new.planner_rut);
  new.supervisor_rut := app.normalize_rut(new.supervisor_rut);

  if new.code = '' then
    raise exception 'DISPENSER_CODE_REQUIRED' using errcode = '23514';
  end if;

  if new.terminal_name = '' then
    raise exception 'DISPENSER_TERMINAL_NAME_REQUIRED' using errcode = '23514';
  end if;

  if new.terminal_code is null then
    raise exception 'DISPENSER_TERMINAL_CODE_REQUIRED' using errcode = '23514';
  end if;

  if new.planner_rut is null or new.supervisor_rut is null then
    raise exception 'INVALID_RUT' using errcode = '23514';
  end if;

  return new;
end;
$$;

insert into public.dispensers (
  code,
  terminal_name,
  terminal_code,
  planner_rut,
  supervisor_rut,
  active
)
values
  ('SUR0005', 'Terminal Colo Colo', 'CC', '68000001-8', '67000001-k', true),
  ('SUR0006', 'Terminal Colo Colo', 'CC', '68000001-8', '67000001-k', true),
  ('SUR0014', 'Terminal Huinganal', 'HU', '68000002-6', '67000002-8', true),
  ('SUR0037', 'Terminal El Rosal', 'RS', '69000001-6', '69000001-6', true),
  ('SUR0100', 'Terminal Lo Echevers', 'LO', '69000001-6', '69000001-6', true),
  ('SUR0101', 'Terminal Lo Echevers', 'LO', '69000001-6', '69000001-6', true),
  ('SUR0106', 'Terminal El Salto', 'ES', '69000001-6', '69000001-6', true),
  ('SUR0107', 'Terminal El Salto', 'ES', '69000001-6', '69000001-6', true),
  ('SUR0108', 'Terminal El Salto', 'ES', '69000001-6', '69000001-6', true),
  ('SUR0109', 'Terminal El Salto', 'ES', '69000001-6', '69000001-6', true),
  ('SUR0110', 'Terminal La Reina', 'LR', '69000001-6', '69000001-6', true),
  ('SUR0111', 'Terminal La Reina', 'LR', '69000001-6', '69000001-6', true),
  ('SUR0112', 'Terminal Maria Angelica', 'MA', '69000001-6', '69000001-6', true),
  ('SUR0113', 'Terminal Maria Angelica', 'MA', '69000001-6', '69000001-6', true),
  ('SUR0114', 'Terminal El Roble', 'ER', '69000001-6', '69000001-6', true),
  ('SUR0115', 'Terminal El Roble', 'ER', '69000001-6', '69000001-6', true),
  ('SUR0116', 'Terminal El Roble', 'ER', '69000001-6', '69000001-6', true),
  ('SUR0117', 'Terminal El Roble', 'ER', '69000001-6', '69000001-6', true),
  ('SUR0118', 'Terminal El Roble', 'ER', '69000001-6', '69000001-6', true),
  ('SUR0119', 'Terminal El Roble', 'ER', '69000001-6', '69000001-6', true)
on conflict (code) do update
set terminal_name = excluded.terminal_name,
    terminal_code = excluded.terminal_code,
    planner_rut = excluded.planner_rut,
    supervisor_rut = excluded.supervisor_rut,
    active = excluded.active;

alter table public.dispensers
  alter column terminal_name set not null,
  alter column terminal_code set not null;

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
  b.export_file_name,
  d.terminal_name                     as dispenser_terminal_name,
  d.terminal_code                     as dispenser_terminal_code
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
