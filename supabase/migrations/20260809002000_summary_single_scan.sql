-- =============================================================================
-- 1300 · Resumen operacional en un solo recorrido de la flota
-- =============================================================================
-- `technical_review_summary` tardaba ~900 ms sobre una flota de ~940 buses, y
-- era con diferencia la consulta más lenta de la aplicación.
--
-- La causa: consultaba `fleet_expiration_status` DOS veces —una para los
-- próximos a vencer y otra para los vencidos—. Esa vista resuelve, por cada
-- bus, cuál fue su última revisión aprobada; ejecutarla dos veces significa
-- recorrer la flota entera dos veces para obtener dos números que salen de la
-- misma pasada.
--
-- Ahora los estados se recogen una sola vez en un CTE y se cuentan con
-- `filter`. Postgres materializa un CTE referenciado más de una vez, así que la
-- vista cara se ejecuta UNA vez por llamada.
--
-- El contrato de la función no cambia: mismos parámetros y mismas claves en el
-- JSON, de modo que ni el tablero ni la exportación a Excel se enteran.
-- =============================================================================

create or replace function public.technical_review_summary(
  p_from        date default null,
  p_to          date default null,
  p_terminal_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with vencimientos as (
    -- Una sola pasada por la flota activa visible para el usuario
    select s.expiration_status
    from public.fleet_expiration_status s
    where s.active
      and (p_terminal_id is null or s.terminal_id = p_terminal_id)
  ),
  conteo_vencimientos as (
    select
      count(*) filter (where expiration_status = 'EXPIRING_SOON') as expiring_soon,
      count(*) filter (where expiration_status = 'EXPIRED')       as expired
    from vencimientos
  )
  select jsonb_build_object(
    'in_review', (
      select count(*) from public.technical_review_events e
      where e.status = 'OPEN'
        and (p_terminal_id is null or e.terminal_id = p_terminal_id)
        and (p_from is null or (e.departure_at at time zone app.local_timezone())::date >= p_from)
        and (p_to   is null or (e.departure_at at time zone app.local_timezone())::date <= p_to)
    ),
    'approved', (
      select count(*) from public.technical_review_events e
      where e.status = 'CLOSED' and e.result = 'APPROVED'
        and (p_terminal_id is null or e.terminal_id = p_terminal_id)
        and (p_from is null or (e.return_at at time zone app.local_timezone())::date >= p_from)
        and (p_to   is null or (e.return_at at time zone app.local_timezone())::date <= p_to)
    ),
    'rejected', (
      select count(*) from public.technical_review_events e
      where e.status = 'CLOSED' and e.result = 'REJECTED'
        and (p_terminal_id is null or e.terminal_id = p_terminal_id)
        and (p_from is null or (e.return_at at time zone app.local_timezone())::date >= p_from)
        and (p_to   is null or (e.return_at at time zone app.local_timezone())::date <= p_to)
    ),
    'not_sent', (
      select count(*) from public.technical_review_not_sent n
      where (p_terminal_id is null or n.terminal_id = p_terminal_id)
        and (p_from is null or n.event_date >= p_from)
        and (p_to   is null or n.event_date <= p_to)
    ),
    -- Vencimientos: estado actual del bus, no dependen del período
    'expiring_soon', (select expiring_soon from conteo_vencimientos),
    'expired',       (select expired       from conteo_vencimientos),
    'expiring_soon_days', app.expiring_soon_days()
  );
$$;

revoke all on function public.technical_review_summary(date, date, uuid) from public;
grant execute on function public.technical_review_summary(date, date, uuid) to authenticated;
