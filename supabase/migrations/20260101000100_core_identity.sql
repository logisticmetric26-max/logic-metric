-- SECCION: PLATAFORMA
-- =============================================================================
-- 100 · Identidad: terminales, roles, permisos, perfiles y accesos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- terminals
-- -----------------------------------------------------------------------------
create table public.terminals (
  id          uuid primary key default extensions.gen_random_uuid(),
  code        text,
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,

  constraint terminals_name_not_blank check (length(trim(name)) between 1 and 120),
  constraint terminals_code_format check (code is null or code ~ '^[A-Z0-9][A-Z0-9 _-]{0,29}$')
);

-- Identidad única e insensible a mayúsculas/espacios
create unique index terminals_name_unique_idx on public.terminals (lower(trim(name)));
create unique index terminals_code_unique_idx on public.terminals (code) where code is not null;
create index terminals_active_idx on public.terminals (active) where active;

create trigger terminals_set_updated_at
  before update on public.terminals
  for each row execute function app.set_updated_at();

comment on table public.terminals is 'Terminales operativos. No se eliminan: se desactivan para preservar historial.';

-- -----------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default extensions.gen_random_uuid(),
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint roles_name_not_blank check (length(trim(name)) between 1 and 80)
);

create unique index roles_name_unique_idx on public.roles (lower(trim(name)));

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function app.set_updated_at();

comment on column public.roles.is_system is
  'Los roles de sistema no pueden eliminarse ni renombrarse: garantizan que siempre exista administración.';

-- -----------------------------------------------------------------------------
-- permissions (catálogo declarativo; la aplicación no hardcodea roles)
-- -----------------------------------------------------------------------------
create table public.permissions (
  code        text primary key,
  module      text not null,
  label       text not null,
  description text,
  sort_order  int not null default 0,

  constraint permissions_code_format check (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create index permissions_module_idx on public.permissions (module, sort_order);

-- -----------------------------------------------------------------------------
-- role_permissions
-- -----------------------------------------------------------------------------
create table public.role_permissions (
  role_id         uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  created_at      timestamptz not null default now(),

  primary key (role_id, permission_code)
);

create index role_permissions_permission_idx on public.role_permissions (permission_code);

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  rut                 text not null,
  full_name           text not null,
  job_title           text not null,
  primary_terminal_id uuid not null references public.terminals (id) on delete restrict,
  role_id             uuid not null references public.roles (id) on delete restrict,
  status              text not null default 'ACTIVE',
  has_global_access   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,

  constraint profiles_status_check    check (status in ('ACTIVE', 'SUSPENDED')),
  constraint profiles_rut_format      check (rut ~ '^[0-9]{7,8}-[0-9k]$'),
  constraint profiles_full_name_check check (length(trim(full_name)) between 1 and 160),
  constraint profiles_job_title_check check (length(trim(job_title)) between 1 and 120)
);

create unique index profiles_rut_unique_idx on public.profiles (rut);
create index profiles_terminal_idx on public.profiles (primary_terminal_id);
create index profiles_role_idx on public.profiles (role_id);
create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

comment on table public.profiles is
  'Datos de negocio del usuario. Las credenciales viven exclusivamente en auth.users (Supabase Auth).';
comment on column public.profiles.rut is
  'RUT normalizado `12345678-9`. Es el identificador con el que el usuario inicia sesión.';
comment on column public.profiles.has_global_access is
  'Acceso a todos los terminales. Sigue estando sujeto a los permisos del rol.';

-- -----------------------------------------------------------------------------
-- user_terminal_access · terminales adicionales autorizados
-- -----------------------------------------------------------------------------
create table public.user_terminal_access (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  terminal_id uuid not null references public.terminals (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users (id) on delete set null,

  primary key (user_id, terminal_id)
);

create index user_terminal_access_terminal_idx on public.user_terminal_access (terminal_id);

comment on table public.user_terminal_access is
  'Terminales adicionales. El terminal principal (profiles.primary_terminal_id) siempre está autorizado.';

-- -----------------------------------------------------------------------------
-- user_permission_overrides · ajustes finos por usuario sobre el rol
-- -----------------------------------------------------------------------------
create table public.user_permission_overrides (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  granted         boolean not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,

  primary key (user_id, permission_code)
);

create index user_permission_overrides_permission_idx on public.user_permission_overrides (permission_code);

comment on table public.user_permission_overrides is
  'Excepciones por usuario: granted=true concede un permiso extra, granted=false lo revoca aunque el rol lo incluya.';

-- -----------------------------------------------------------------------------
-- app_settings · parámetros operacionales configurables (no hardcodeados)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  label       text not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function app.set_updated_at();

comment on table public.app_settings is
  'Parámetros configurables desde la aplicación. Evita constantes de negocio dentro del código.';
