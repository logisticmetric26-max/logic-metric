-- =============================================================================
-- 300 · Flota
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fleet_fuel_types · catálogo extensible (no un ENUM: agregar tipos no requiere
-- migración de esquema ni redeploy)
-- -----------------------------------------------------------------------------
create table public.fleet_fuel_types (
  code       text primary key,
  label      text not null,
  active     boolean not null default true,
  sort_order int not null default 0,

  constraint fleet_fuel_types_code_format check (code ~ '^[A-Z][A-Z0-9_]*$')
);

comment on table public.fleet_fuel_types is
  'Tipos de bus. Se agregan nuevos con un INSERT, sin tocar el esquema.';

insert into public.fleet_fuel_types (code, label, sort_order) values
  ('DIESEL',   'Diésel',    10),
  ('ELECTRIC', 'Eléctrico', 20);

-- -----------------------------------------------------------------------------
-- fleet
-- -----------------------------------------------------------------------------
create table public.fleet (
  id              uuid primary key default extensions.gen_random_uuid(),
  internal_number text not null,
  ppu             text not null,
  model           text,
  subclass        text,
  fuel_type       text not null references public.fleet_fuel_types (code) on delete restrict,
  terminal_id     uuid not null references public.terminals (id) on delete restrict,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,

  -- Formato permisivo pero estructurado: no inventa un formato de patente
  -- específico, sólo exige alfanumérico normalizado.
  constraint fleet_ppu_format check (ppu ~ '^[A-Z0-9]{4,10}$'),
  constraint fleet_internal_number_format check (internal_number ~ '^[A-Z0-9][A-Z0-9 _-]{0,19}$'),
  constraint fleet_model_check check (model is null or length(trim(model)) between 1 and 120),
  constraint fleet_subclass_check check (subclass is null or length(trim(subclass)) between 1 and 120)
);

-- Identidad del bus: única a nivel de flota completa, porque la búsqueda
-- operacional (§18, §30) es «PPU o número interno» → debe resolver a un único bus.
create unique index fleet_ppu_unique_idx on public.fleet (ppu);
create unique index fleet_internal_number_unique_idx on public.fleet (internal_number);

create index fleet_terminal_idx on public.fleet (terminal_id);
create index fleet_active_idx on public.fleet (terminal_id, active);
-- Búsqueda por prefijo (search-as-you-type) sin escaneo secuencial
create index fleet_ppu_prefix_idx on public.fleet (ppu text_pattern_ops);
create index fleet_internal_number_prefix_idx on public.fleet (internal_number text_pattern_ops);

create trigger fleet_set_updated_at
  before update on public.fleet
  for each row execute function app.set_updated_at();

comment on table public.fleet is
  'Buses. Cambiar un bus de terminal NO borra su historial: los eventos guardan su propio terminal_id.';

-- -----------------------------------------------------------------------------
-- Normalización en base de datos (no sólo en el formulario)
-- -----------------------------------------------------------------------------
create or replace function app.normalize_fleet_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.ppu := app.normalize_ppu(new.ppu);
  new.internal_number := app.normalize_code(new.internal_number);
  new.model := nullif(trim(coalesce(new.model, '')), '');
  new.subclass := nullif(trim(coalesce(new.subclass, '')), '');

  if new.ppu is null then
    raise exception 'PPU_REQUIRED' using errcode = '23514';
  end if;

  if new.internal_number is null then
    raise exception 'INTERNAL_NUMBER_REQUIRED' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger fleet_normalize
  before insert or update on public.fleet
  for each row execute function app.normalize_fleet_row();

-- -----------------------------------------------------------------------------
-- Normalización de terminales
-- -----------------------------------------------------------------------------
create or replace function app.normalize_terminal_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := nullif(regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g'), '');
  new.code := app.normalize_code(new.code);

  if new.name is null then
    raise exception 'TERMINAL_NAME_REQUIRED' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger terminals_normalize
  before insert or update on public.terminals
  for each row execute function app.normalize_terminal_row();
