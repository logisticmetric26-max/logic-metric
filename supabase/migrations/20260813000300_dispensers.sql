-- SECCION: COMBUSTIBLE
-- =============================================================================
-- 1506 · Dispensers configuration
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order)
values
  (
    'dispensers.view',
    'dispensers',
    'Ver surtidores',
    'Consultar el listado de surtidores y sus responsables.',
    340
  ),
  (
    'dispensers.create',
    'dispensers',
    'Crear surtidores',
    'Registrar nuevos surtidores operacionales.',
    350
  ),
  (
    'dispensers.edit',
    'dispensers',
    'Editar surtidores',
    'Modificar datos, activar o desactivar surtidores.',
    360
  ),
  (
    'dispensers.delete',
    'dispensers',
    'Eliminar surtidores',
    'Eliminar definitivamente un surtidor sin uso operacional asociado.',
    370
  )
on conflict (code) do update
set module = excluded.module,
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into app.permission_dependencies (permission_code, required_permission_code)
values
  ('dispensers.create', 'dispensers.view'),
  ('dispensers.edit', 'dispensers.view'),
  ('dispensers.delete', 'dispensers.view')
on conflict do nothing;

create table if not exists public.dispensers (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  planner_rut       text not null,
  supervisor_rut    text not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,

  constraint dispensers_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'),
  constraint dispensers_planner_rut_format check (planner_rut ~ '^[0-9]{7,8}-[0-9k]$'),
  constraint dispensers_supervisor_rut_format check (supervisor_rut ~ '^[0-9]{7,8}-[0-9k]$')
);

comment on table public.dispensers is
  'Surtidores operacionales y sus responsables de planilla y supervision.';

comment on column public.dispensers.planner_rut is
  'RUT normalizado del planillero responsable del surtidor.';

comment on column public.dispensers.supervisor_rut is
  'RUT normalizado del supervisor responsable del surtidor.';

create unique index if not exists dispensers_code_unique_idx on public.dispensers (code);
create index if not exists dispensers_active_idx on public.dispensers (active) where active;

drop trigger if exists dispensers_set_updated_at on public.dispensers;

create trigger dispensers_set_updated_at
  before update on public.dispensers
  for each row execute function app.set_updated_at();

create or replace function app.normalize_dispenser()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.code := upper(trim(coalesce(new.code, '')));
  new.planner_rut := app.normalize_rut(new.planner_rut);
  new.supervisor_rut := app.normalize_rut(new.supervisor_rut);

  if new.code = '' then
    raise exception 'DISPENSER_CODE_REQUIRED' using errcode = '23514';
  end if;

  if new.planner_rut is null or new.supervisor_rut is null then
    raise exception 'INVALID_RUT' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists dispensers_normalize on public.dispensers;

create trigger dispensers_normalize
  before insert or update on public.dispensers
  for each row execute function app.normalize_dispenser();

alter table public.dispensers enable row level security;

grant select, insert, update, delete on public.dispensers to authenticated;

drop policy if exists dispensers_select on public.dispensers;
drop policy if exists dispensers_insert on public.dispensers;
drop policy if exists dispensers_update on public.dispensers;
drop policy if exists dispensers_delete on public.dispensers;

create policy dispensers_select on public.dispensers
  for select to authenticated
  using (
    app.user_is_active()
    and app.has_permission('dispensers.view')
  );

create policy dispensers_insert on public.dispensers
  for insert to authenticated
  with check (app.has_permission('dispensers.create'));

create policy dispensers_update on public.dispensers
  for update to authenticated
  using (app.has_permission('dispensers.edit'))
  with check (app.has_permission('dispensers.edit'));

create policy dispensers_delete on public.dispensers
  for delete to authenticated
  using (app.has_permission('dispensers.delete'));

drop trigger if exists dispensers_audit on public.dispensers;

create trigger dispensers_audit
  after insert or update or delete on public.dispensers
  for each row execute function app.audit_row('DISPENSER');

insert into public.dispensers (code, planner_rut, supervisor_rut, active)
values
  ('SUR0005', '68000001-8', '67000001-K', true),
  ('SUR0006', '68000001-8', '67000001-K', true),
  ('SUR0014', '68000002-6', '67000002-8', true),
  ('SUR0037', '69000001-6', '69000001-6', true),
  ('SUR0100', '69000001-6', '69000001-6', true),
  ('SUR0101', '69000001-6', '69000001-6', true),
  ('SUR0106', '69000001-6', '69000001-6', true),
  ('SUR0107', '69000001-6', '69000001-6', true),
  ('SUR0108', '69000001-6', '69000001-6', true),
  ('SUR0109', '69000001-6', '69000001-6', true),
  ('SUR0110', '69000001-6', '69000001-6', true),
  ('SUR0111', '69000001-6', '69000001-6', true),
  ('SUR0112', '69000001-6', '69000001-6', true),
  ('SUR0113', '69000001-6', '69000001-6', true),
  ('SUR0114', '69000001-6', '69000001-6', true),
  ('SUR0115', '69000001-6', '69000001-6', true),
  ('SUR0116', '69000001-6', '69000001-6', true),
  ('SUR0117', '69000001-6', '69000001-6', true),
  ('SUR0118', '69000001-6', '69000001-6', true),
  ('SUR0119', '69000001-6', '69000001-6', true)
on conflict (code) do update
set planner_rut = excluded.planner_rut,
    supervisor_rut = excluded.supervisor_rut,
    active = excluded.active;
