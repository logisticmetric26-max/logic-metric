-- =============================================================================
-- 1504 · Bus wash no wash and Redvan guard
-- =============================================================================

alter table public.bus_wash_records
  add column if not exists no_wash boolean not null default false;

comment on table public.bus_wash_records is
  'Registro diario por bus para barrido y mopeado, lavado de carroceria, buses en reparacion y buses sin lavado.';

comment on column public.bus_wash_records.no_wash is
  'Marca si el bus quedo sin lavado durante la fecha indicada.';

alter table public.bus_wash_records
  drop constraint if exists bus_wash_records_meaningful_check;

alter table public.bus_wash_records
  add constraint bus_wash_records_meaningful_check
  check (
    bm_completed
    or body_wash_completed
    or in_repair
    or no_wash
  );

create or replace function app.normalize_bus_wash_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_terminal_id uuid;
  v_zone text;
begin
  select f.terminal_id, f.zone
    into v_terminal_id, v_zone
  from public.fleet f
  where f.id = new.fleet_id;

  if not found then
    raise exception 'FLEET_NOT_FOUND' using errcode = '23514';
  end if;

  if upper(trim(coalesce(v_zone, ''))) = 'REDVAN' then
    raise exception 'BUS_WASH_REDVAN_NOT_ALLOWED' using errcode = '23514';
  end if;

  new.terminal_id := v_terminal_id;

  if new.in_repair then
    new.bm_completed := false;
    new.body_wash_completed := false;
    new.no_wash := false;
  elsif new.no_wash then
    new.bm_completed := false;
    new.body_wash_completed := false;
    new.in_repair := false;
  end if;

  if not (
    new.bm_completed
    or new.body_wash_completed
    or new.in_repair
    or new.no_wash
  ) then
    raise exception 'BUS_WASH_EMPTY_RECORD' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists bus_wash_records_normalize on public.bus_wash_records;

create trigger bus_wash_records_normalize
  before insert or update on public.bus_wash_records
  for each row execute function app.normalize_bus_wash_record();
