-- SECCION: LAVADO DE BUSES
-- =============================================================================
-- 1505 · Bus wash exports audit
-- =============================================================================

create table if not exists public.bus_wash_exports (
  id            uuid primary key default gen_random_uuid(),
  record_date   date not null,
  zone          text not null,
  file_name     text not null,
  bus_count     integer not null,
  generated_by  uuid references public.profiles (id) on delete set null,
  generated_at  timestamptz not null default now(),

  constraint bus_wash_exports_zone_check check (length(trim(zone)) between 1 and 120),
  constraint bus_wash_exports_file_name_check check (length(trim(file_name)) between 1 and 180),
  constraint bus_wash_exports_bus_count_check check (bus_count >= 0)
);

comment on table public.bus_wash_exports is
  'Trazabilidad de los archivos diarios generados por zona en el modulo de lavado de buses.';

comment on column public.bus_wash_exports.zone is
  'Zona incluida en el archivo diario generado.';

comment on column public.bus_wash_exports.generated_by is
  'Usuario que genero el archivo diario.';

create index if not exists bus_wash_exports_date_zone_idx
  on public.bus_wash_exports (record_date, zone, generated_at desc);

create index if not exists bus_wash_exports_generated_by_idx
  on public.bus_wash_exports (generated_by, generated_at desc);

alter table public.bus_wash_exports enable row level security;

grant select, insert on public.bus_wash_exports to authenticated;

drop policy if exists bus_wash_exports_select on public.bus_wash_exports;
drop policy if exists bus_wash_exports_insert on public.bus_wash_exports;

create policy bus_wash_exports_select on public.bus_wash_exports
  for select to authenticated
  using (app.has_permission('bus_wash.view'));

create policy bus_wash_exports_insert on public.bus_wash_exports
  for insert to authenticated
  with check (app.has_permission('bus_wash.view'));

drop trigger if exists bus_wash_exports_audit on public.bus_wash_exports;

create trigger bus_wash_exports_audit
  after insert on public.bus_wash_exports
  for each row execute function app.audit_row('BUS_WASH_EXPORT');
