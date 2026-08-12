-- =============================================================================
-- 1503 · Fleet access for bus wash
-- =============================================================================

-- El modulo de Lavado Buses consulta `fleet_view`, por lo que necesita la
-- misma lectura operacional de flota que ya tienen revisiones y no enviados,
-- siempre restringida a los terminales autorizados por RLS.
drop policy if exists fleet_select on public.fleet;

create policy fleet_select on public.fleet
  for select to authenticated
  using (
    (
      app.has_permission('fleet.view')
      or app.has_permission('technical_review.view')
      or app.has_permission('technical_review_not_sent.view')
      or app.has_permission('bus_wash.view')
    )
    and app.can_access_terminal(terminal_id)
  );
