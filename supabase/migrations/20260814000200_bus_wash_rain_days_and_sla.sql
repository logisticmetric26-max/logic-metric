-- =============================================================================
-- 1500 · Días de lluvia y meta diaria de aseo
-- =============================================================================
-- Dos piezas que el control diario necesitaba y no tenía:
--
--   · DÍA DE LLUVIA · justificación, por terminal y por fecha, de que no se
--     lavó carrocería. No bloquea el lavado: llueve por la mañana y escampa por
--     la tarde, y ese día sí se lava. Lo que hace es dejar CONSTANCIA de por
--     qué el cumplimiento de carrocería fue bajo, para que un mes después nadie
--     tenga que adivinarlo.
--
--     El barrido y mopeado NO se ve afectado: se hacen igual bajo lluvia, y por
--     eso la meta de B&M sigue exigiéndose completa esos días.
--
--   · META DIARIA · porcentaje de la flota que debe quedar aseado cada día.
--     Vive en `app_settings` y no en el código, porque es un acuerdo de
--     servicio que cambia sin que nadie despliegue nada (§ configuración).
-- =============================================================================

create table if not exists public.bus_wash_rain_days (
  terminal_id uuid        not null references public.terminals (id) on delete cascade,
  record_date date        not null,
  -- Por qué no se lavó carrocería. Obligatoria: una marca sin explicación no
  -- justifica nada ante quien revise el incumplimiento meses después.
  reason      text        not null,
  created_by  uuid        references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  primary key (terminal_id, record_date),

  constraint bus_wash_rain_days_reason_check check (
    length(trim(reason)) between 3 and 500
  )
);

comment on table public.bus_wash_rain_days is
  'Justificacion de que un terminal no lavo carroceria un dia por lluvia. No impide registrar lavados: solo explica el incumplimiento.';

create index if not exists bus_wash_rain_days_date_idx
  on public.bus_wash_rain_days (record_date desc);

alter table public.bus_wash_rain_days enable row level security;

-- Se ve con el mismo permiso que el resto del módulo y sólo en los terminales
-- autorizados: la misma regla de aislamiento que protege el registro diario.
drop policy if exists bus_wash_rain_days_select on public.bus_wash_rain_days;
create policy bus_wash_rain_days_select on public.bus_wash_rain_days
  for select to authenticated
  using (
    app.has_permission('bus_wash.view')
    and app.can_access_terminal(terminal_id)
  );

drop policy if exists bus_wash_rain_days_write on public.bus_wash_rain_days;
create policy bus_wash_rain_days_write on public.bus_wash_rain_days
  for insert to authenticated
  with check (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  );

drop policy if exists bus_wash_rain_days_update on public.bus_wash_rain_days;
create policy bus_wash_rain_days_update on public.bus_wash_rain_days
  for update to authenticated
  using (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  );

drop policy if exists bus_wash_rain_days_delete on public.bus_wash_rain_days;
create policy bus_wash_rain_days_delete on public.bus_wash_rain_days
  for delete to authenticated
  using (
    app.has_permission('bus_wash.edit')
    and app.can_access_terminal(terminal_id)
  );

grant select, insert, update, delete on public.bus_wash_rain_days to authenticated;

-- -----------------------------------------------------------------------------
-- Meta diaria de cumplimiento
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value, label, description)
values (
  'bus_wash.daily_target_percent',
  '90'::jsonb,
  'Meta diaria de aseo (%)',
  'Porcentaje de la flota del terminal que debe quedar aseado cada dia. Se usa para el indicador de cumplimiento.'
)
on conflict (key) do nothing;

create or replace function app.bus_wash_target_percent()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer
     from public.app_settings s
     where s.key = 'bus_wash.daily_target_percent'),
    90
  );
$$;

revoke all on function app.bus_wash_target_percent() from public;
grant execute on function app.bus_wash_target_percent() to authenticated, service_role;
