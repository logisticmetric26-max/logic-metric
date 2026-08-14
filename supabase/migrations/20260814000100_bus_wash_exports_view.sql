-- SECCION: LAVADO DE BUSES
-- =============================================================================
-- 1511 · Bus wash exports view
-- =============================================================================

create or replace view public.bus_wash_exports_view
with (security_invoker = on) as
select
  e.id,
  e.record_date,
  e.zone,
  e.file_name,
  e.bus_count,
  e.generated_by,
  app.actor_name(e.generated_by) as generated_by_name,
  e.generated_at
from public.bus_wash_exports e;

grant select on public.bus_wash_exports_view to authenticated;
