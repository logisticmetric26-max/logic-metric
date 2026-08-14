-- SECCION: LAVADO DE BUSES
-- =============================================================================
-- 1600 · Metas configurables de aseo y ciclo de carrocería
-- =============================================================================
-- Las reglas de operación son un acuerdo, no una constante del programa:
--
--   · BARRIDO Y MOPEADO · toda la flota, todos los días. Lo ideal es 100 %,
--     pero se admite fijar menos sin tocar el código.
--   · LAVADO DE CARROCERÍA · la flota se parte en dos grupos y se lava
--     aproximadamente la mitad cada día, de modo que ningún bus pase más de
--     dos días sin lavado exterior. De ahí el 50 % diario y el ciclo de 2 días.
--
-- Los tres valores viven en `app_settings` para que se ajusten desde la propia
-- aplicación cuando cambie el acuerdo, sin desplegar nada.
-- =============================================================================

insert into public.app_settings (key, value, label, description)
values
  (
    'bus_wash.bm_target_percent',
    '100'::jsonb,
    'Meta diaria de barrido y mopeado (%)',
    'Porcentaje de la flota del terminal que debe recibir barrido y mopeado cada dia. Lo normal es 100: la faena se hace a toda la flota.'
  ),
  (
    'bus_wash.body_wash_target_percent',
    '50'::jsonb,
    'Meta diaria de lavado de carroceria (%)',
    'Porcentaje de la flota que debe recibir lavado exterior cada dia. Con 50 la flota se divide en dos grupos y ningun bus pasa mas de dos dias sin lavarse.'
  ),
  (
    'bus_wash.body_wash_cycle_days',
    '2'::jsonb,
    'Ciclo de lavado de carroceria (dias)',
    'Cada cuantos dias, como maximo, debe lavarse exteriormente un bus. Define que buses aparecen como pendientes en la hoja de carroceria.'
  )
on conflict (key) do nothing;

-- La meta unica anterior se reemplaza por las dos especificas: promediar dos
-- faenas con exigencias distintas escondia justo la que se estaba incumpliendo.
delete from public.app_settings where key = 'bus_wash.daily_target_percent';

drop function if exists app.bus_wash_target_percent();

create or replace function app.bus_wash_setting(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::integer from public.app_settings s where s.key = p_key),
    p_default
  );
$$;

revoke all on function app.bus_wash_setting(text, integer) from public;
grant execute on function app.bus_wash_setting(text, integer) to authenticated, service_role;
