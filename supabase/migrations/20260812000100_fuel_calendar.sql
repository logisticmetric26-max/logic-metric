-- SECCION: COMBUSTIBLE
-- =============================================================================
-- 1500 · Fuel calendar
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order)
values
  (
    'fuel_calendar.view',
    'fuel_calendar',
    'Ver calendario de combustible',
    'Consultar llegadas programadas de combustible y AdBlue por terminal.',
    120
  ),
  (
    'fuel_calendar.create',
    'fuel_calendar',
    'Programar llegadas de combustible',
    'Registrar nuevas fechas de llegada de combustible y AdBlue.',
    130
  ),
  (
    'fuel_calendar.edit',
    'fuel_calendar',
    'Editar agenda de combustible',
    'Reprogramar o ajustar llegadas pendientes de combustible y AdBlue.',
    140
  ),
  (
    'fuel_calendar.confirm',
    'fuel_calendar',
    'Confirmar llegada de combustible',
    'Confirmar recepciones de combustible y AdBlue por terminal.',
    150
  )
on conflict (code) do update
set module = excluded.module,
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

create table if not exists public.fuel_delivery_schedules (
  id                uuid primary key default gen_random_uuid(),
  terminal_id       uuid not null references public.terminals (id) on delete restrict,
  request_reference text not null,
  delivery_address  text not null,
  product_type      text not null,
  product_label     text not null,
  scheduled_date    date not null,
  reception_window  text not null,
  reception_time_range text not null,
  supplier_name     text not null,
  requested_quantity_m3 numeric(10,2) not null,
  truck_reference   text,
  notes             text,
  confirmed_at      timestamptz,
  confirmed_by      uuid references public.profiles (id) on delete set null,
  created_by        uuid not null references public.profiles (id) on delete restrict,
  updated_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint fuel_delivery_product_type_check check (
    product_type in ('FUEL', 'ADBLUE')
  ),
  constraint fuel_delivery_request_reference_check check (
    length(trim(request_reference)) between 1 and 40
  ),
  constraint fuel_delivery_delivery_address_check check (
    length(trim(delivery_address)) between 1 and 240
  ),
  constraint fuel_delivery_product_label_check check (
    length(trim(product_label)) between 1 and 120
  ),
  constraint fuel_delivery_reception_window_check check (
    reception_window in ('AM', 'PM')
  ),
  constraint fuel_delivery_reception_time_range_check check (
    length(trim(reception_time_range)) between 1 and 40
  ),
  constraint fuel_delivery_supplier_name_check check (
    length(trim(supplier_name)) between 1 and 120
  ),
  constraint fuel_delivery_requested_quantity_check check (
    requested_quantity_m3 > 0 and requested_quantity_m3 <= 999.99
  ),
  constraint fuel_delivery_truck_reference_check check (
    truck_reference is null or length(trim(truck_reference)) between 1 and 120
  ),
  constraint fuel_delivery_notes_check check (
    notes is null or length(trim(notes)) <= 500
  ),
  constraint fuel_delivery_confirmation_check check (
    (confirmed_at is null and confirmed_by is null)
    or (confirmed_at is not null and confirmed_by is not null)
  )
);

comment on table public.fuel_delivery_schedules is
  'Calendario operativo de llegadas de combustible y AdBlue por terminal.';

comment on column public.fuel_delivery_schedules.product_type is
  'Tipo de carga esperada: FUEL o ADBLUE.';

comment on column public.fuel_delivery_schedules.request_reference is
  'Identificador de la solicitud operacional recibido desde la planilla.';

comment on column public.fuel_delivery_schedules.delivery_address is
  'Direccion de recepcion informada en la solicitud.';

comment on column public.fuel_delivery_schedules.product_label is
  'Descripcion literal del producto solicitado, por ejemplo Petroleo Diesel Grado A1.';

comment on column public.fuel_delivery_schedules.reception_window is
  'Ventana operacional de recepcion: AM o PM.';

comment on column public.fuel_delivery_schedules.reception_time_range is
  'Rango horario literal informado en la solicitud, por ejemplo 8:00 a 14:00.';

create unique index if not exists fuel_delivery_unique_slot_idx
  on public.fuel_delivery_schedules (terminal_id, product_type, scheduled_date, reception_window);

create index if not exists fuel_delivery_terminal_date_idx
  on public.fuel_delivery_schedules (terminal_id, scheduled_date, reception_window);

create index if not exists fuel_delivery_pending_idx
  on public.fuel_delivery_schedules (scheduled_date, reception_window)
  where confirmed_at is null;

create or replace function app.normalize_fuel_delivery_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.request_reference := nullif(regexp_replace(trim(coalesce(new.request_reference, '')), '\s+', ' ', 'g'), '');
  new.delivery_address := nullif(regexp_replace(trim(coalesce(new.delivery_address, '')), '\s+', ' ', 'g'), '');
  new.product_label := nullif(regexp_replace(trim(coalesce(new.product_label, '')), '\s+', ' ', 'g'), '');
  new.reception_time_range := nullif(regexp_replace(trim(coalesce(new.reception_time_range, '')), '\s+', ' ', 'g'), '');
  new.supplier_name := nullif(regexp_replace(trim(coalesce(new.supplier_name, '')), '\s+', ' ', 'g'), '');
  new.truck_reference := nullif(regexp_replace(trim(coalesce(new.truck_reference, '')), '\s+', ' ', 'g'), '');
  new.notes := nullif(regexp_replace(trim(coalesce(new.notes, '')), '\s+', ' ', 'g'), '');
  return new;
end;
$$;

drop trigger if exists fuel_delivery_schedules_normalize on public.fuel_delivery_schedules;

create trigger fuel_delivery_schedules_normalize
  before insert or update on public.fuel_delivery_schedules
  for each row execute function app.normalize_fuel_delivery_schedule();

drop trigger if exists fuel_delivery_schedules_set_updated_at on public.fuel_delivery_schedules;

create trigger fuel_delivery_schedules_set_updated_at
  before update on public.fuel_delivery_schedules
  for each row execute function app.set_updated_at();

create or replace function app.fuel_delivery_deadline(
  p_product_type text,
  p_reception_window text
)
returns time
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_product_type = 'ADBLUE' then time '15:00'
    when p_reception_window = 'AM' then time '13:00'
    else time '18:00'
  end;
$$;

create or replace function app.fuel_delivery_alert_status(
  p_product_type text,
  p_scheduled_date date,
  p_reception_window text,
  p_confirmed_at timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone app.local_timezone();
  v_deadline time := app.fuel_delivery_deadline(p_product_type, p_reception_window);
begin
  if p_confirmed_at is not null then
    return 'CONFIRMED';
  end if;

  if p_scheduled_date < v_now::date then
    return 'OVERDUE';
  end if;

  if p_scheduled_date = v_now::date and v_now::time >= v_deadline then
    return 'OVERDUE';
  end if;

  if p_scheduled_date = v_now::date then
    return 'TODAY';
  end if;

  return 'UPCOMING';
end;
$$;

revoke all on function app.fuel_delivery_deadline(text, text) from public;
revoke all on function app.fuel_delivery_alert_status(text, date, text, timestamptz) from public;

grant execute on function app.fuel_delivery_deadline(text, text)
  to authenticated, service_role;

grant execute on function app.fuel_delivery_alert_status(text, date, text, timestamptz)
  to authenticated, service_role;

create or replace function app.protect_fuel_delivery_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_schedule_changed boolean :=
    new.terminal_id is distinct from old.terminal_id
    or new.request_reference is distinct from old.request_reference
    or new.delivery_address is distinct from old.delivery_address
    or new.product_type is distinct from old.product_type
    or new.product_label is distinct from old.product_label
    or new.scheduled_date is distinct from old.scheduled_date
    or new.reception_window is distinct from old.reception_window
    or new.reception_time_range is distinct from old.reception_time_range
    or new.supplier_name is distinct from old.supplier_name
    or new.requested_quantity_m3 is distinct from old.requested_quantity_m3
    or new.truck_reference is distinct from old.truck_reference
    or new.notes is distinct from old.notes;
  v_confirmation_changed boolean :=
    new.confirmed_at is distinct from old.confirmed_at
    or new.confirmed_by is distinct from old.confirmed_by;
begin
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'FUEL_DELIVERY_IMMUTABLE_FIELDS' using errcode = '23514';
  end if;

  if old.confirmed_at is not null and (
    v_schedule_changed
    or v_confirmation_changed
    or new.updated_by is distinct from old.updated_by
  ) then
    raise exception 'FUEL_DELIVERY_ALREADY_CONFIRMED' using errcode = '23514';
  end if;

  if v_schedule_changed and not app.has_permission('fuel_calendar.edit') then
    raise exception 'FUEL_DELIVERY_EDIT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if v_confirmation_changed then
    if not app.has_permission('fuel_calendar.confirm') then
      raise exception 'FUEL_DELIVERY_CONFIRM_PERMISSION_REQUIRED' using errcode = '42501';
    end if;

    if old.confirmed_at is null and new.confirmed_at is null then
      raise exception 'FUEL_DELIVERY_CONFIRMATION_REQUIRED' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fuel_delivery_schedules_protect on public.fuel_delivery_schedules;

create trigger fuel_delivery_schedules_protect
  before update on public.fuel_delivery_schedules
  for each row execute function app.protect_fuel_delivery_schedule();

create or replace view public.fuel_delivery_schedule_view
with (security_invoker = on) as
select
  s.id,
  s.terminal_id,
  t.name                                            as terminal_name,
  s.request_reference,
  s.delivery_address,
  s.product_type,
  s.product_label,
  s.scheduled_date,
  s.reception_window,
  s.reception_time_range,
  app.fuel_delivery_deadline(s.product_type, s.reception_window)
                                                    as alert_deadline,
  app.fuel_delivery_alert_status(
    s.product_type,
    s.scheduled_date,
    s.reception_window,
    s.confirmed_at
  )                                                 as alert_status,
  s.supplier_name,
  s.requested_quantity_m3,
  s.truck_reference,
  s.notes,
  s.confirmed_at,
  s.confirmed_by,
  app.actor_name(s.confirmed_by)                    as confirmed_by_name,
  s.created_by,
  app.actor_name(s.created_by)                      as created_by_name,
  s.updated_by,
  app.actor_name(s.updated_by)                      as updated_by_name,
  s.created_at,
  s.updated_at
from public.fuel_delivery_schedules s
join public.terminals t on t.id = s.terminal_id;

grant select on public.fuel_delivery_schedule_view to authenticated;

alter table public.fuel_delivery_schedules enable row level security;

grant select, insert, update on public.fuel_delivery_schedules to authenticated;

drop policy if exists fuel_delivery_schedules_select on public.fuel_delivery_schedules;
drop policy if exists fuel_delivery_schedules_insert on public.fuel_delivery_schedules;
drop policy if exists fuel_delivery_schedules_update on public.fuel_delivery_schedules;

create policy fuel_delivery_schedules_select on public.fuel_delivery_schedules
  for select to authenticated
  using (
    app.has_permission('fuel_calendar.view')
    and app.can_access_terminal(terminal_id)
  );

create policy fuel_delivery_schedules_insert on public.fuel_delivery_schedules
  for insert to authenticated
  with check (
    app.has_permission('fuel_calendar.create')
    and app.can_access_terminal(terminal_id)
  );

create policy fuel_delivery_schedules_update on public.fuel_delivery_schedules
  for update to authenticated
  using (
    app.can_access_terminal(terminal_id)
    and (
      app.has_permission('fuel_calendar.edit')
      or app.has_permission('fuel_calendar.confirm')
    )
  )
  with check (
    app.can_access_terminal(terminal_id)
    and (
      app.has_permission('fuel_calendar.edit')
      or app.has_permission('fuel_calendar.confirm')
    )
  );
