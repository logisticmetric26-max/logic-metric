-- =============================================================================
-- 1501 · Permiso de carga masiva para combustible
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order)
values (
  'fuel_calendar.bulk_import',
  'fuel_calendar',
  'Carga masiva de combustible',
  'Importar llegadas de combustible y AdBlue desde una planilla Excel.',
  135
)
on conflict (code) do update
set module = excluded.module,
    label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into app.permission_dependencies (permission_code, required_permission_code)
values
  ('fuel_calendar.bulk_import', 'fuel_calendar.view'),
  ('fuel_calendar.bulk_import', 'fuel_calendar.create')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'fuel_calendar.bulk_import'
from public.roles r
where r.is_system
   or lower(trim(translate(r.name, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))) = 'administrativo energia'
on conflict do nothing;
