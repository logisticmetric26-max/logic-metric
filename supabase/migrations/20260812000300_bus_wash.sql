-- =============================================================================
-- 1502 · Bus wash daily checklist
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order)
values
  (
    'bus_wash.view',
    'bus_wash',
    'Ver lavado de buses',
    'Consultar el estado diario de B&M, lavado de carroceria y buses en reparacion.',
    160
  ),
  (
    'bus_wash.edit',
    'bus_wash',
    'Registrar lavado de buses',
    'Marcar B&M, lavado de carroceria y buses en reparacion por dia.',
    170
  )
on conflict (code) do update
set module = excluded.module,
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into app.permission_dependencies (permission_code, required_permission_code)
values ('bus_wash.edit', 'bus_wash.view')
on conflict do nothing;

create table if not exists public.bus_wash_records (
  id                   uuid primary key default gen_random_uuid(),
  fleet_id             uuid not null references public.fleet (id) on delete restrict,
  terminal_id          uuid not null references public.terminals (id) on delete restrict,
  record_date          date not null,
  bm_completed         boolean not null default false,
  body_wash_completed  boolean not null default false,
  in_repair            boolean not null default false,
  created_by           uuid references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint bus_wash_records_meaningful_check check (
    bm_completed or body_wash_completed or in_repair
  )
);

comment on table public.bus_wash_records is
  'Registro diario por bus para barrido y mopeado, lavado de carroceria y buses en reparacion.';

comment on column public.bus_wash_records.bm_completed is
  'Marca si el bus completo barrido y mopeado (B&M) en la fecha indicada.';

comment on column public.bus_wash_records.body_wash_completed is
  'Marca si el bus completo el lavado de carroceria en la fecha indicada.';

comment on column public.bus_wash_records.in_repair is
  'Marca si el bus se encontraba en reparacion durante la fecha indicada.';

create unique index if not exists bus_wash_records_fleet_date_idx
  on public.bus_wash_records (fleet_id, record_date);

create index if not exists bus_wash_records_date_terminal_idx
  on public.bus_wash_records (record_date, terminal_id);

drop trigger if exists bus_wash_records_set_updated_at on public.bus_wash_records;

create trigger bus_wash_records_set_updated_at
  before update on public.bus_wash_records
  for each row execute function app.set_updated_at();

create or replace function app.protect_bus_wash_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.fleet_id is distinct from old.fleet_id
     or new.terminal_id is distinct from old.terminal_id
     or new.record_date is distinct from old.record_date
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'BUS_WASH_IMMUTABLE_FIELDS' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists bus_wash_records_protect on public.bus_wash_records;

create trigger bus_wash_records_protect
  before update on public.bus_wash_records
  for each row execute function app.protect_bus_wash_record();

alter table public.bus_wash_records enable row level security;

grant select, insert, update, delete on public.bus_wash_records to authenticated;

drop policy if exists bus_wash_records_select on public.bus_wash_records;
drop policy if exists bus_wash_records_insert on public.bus_wash_records;
drop policy if exists bus_wash_records_update on public.bus_wash_records;
drop policy if exists bus_wash_records_delete on public.bus_wash_records;

create policy bus_wash_records_select on public.bus_wash_records
  for select to authenticated
  using (
    app.has_permission('bus_wash.view')
    and app.can_access_terminal(terminal_id)
  );

create policy bus_wash_records_insert on public.bus_wash_records
  for insert to authenticated
  with check (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  );

create policy bus_wash_records_update on public.bus_wash_records
  for update to authenticated
  using (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  )
  with check (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  );

create policy bus_wash_records_delete on public.bus_wash_records
  for delete to authenticated
  using (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  );
