-- =============================================================================
-- 1000 · Catálogo de permisos, rol de sistema y parámetros por defecto
-- =============================================================================
-- Esto NO son datos de demostración: es metadata del sistema sin la cual la
-- plataforma no puede arrancar ni administrarse. No contiene ningún usuario,
-- terminal, bus, RUT, documento ni estadística.
-- =============================================================================

insert into public.permissions (code, module, label, description, sort_order) values
  -- Revisión técnica
  ('technical_review.view',              'technical_review', 'Ver revisiones técnicas',        'Consultar procesos, historial y detalle.',           10),
  ('technical_review.create',            'technical_review', 'Registrar salida a planta',      'Abrir un proceso de revisión técnica.',              20),
  ('technical_review.close',             'technical_review', 'Cerrar revisión',                'Registrar el regreso y el resultado.',               30),
  ('technical_review.delete',            'technical_review', 'Eliminar procesos del historial','Eliminar un proceso cerrado, sus rechazos, análisis y PDF adjuntos.', 50),

  -- Documentos
  ('technical_review_documents.view',    'technical_review', 'Ver documentos',                 'Descargar documentos asociados a una revisión.',     60),
  ('technical_review_documents.upload',  'technical_review', 'Cargar documentos',              'Adjuntar y procesar documentos de una revisión.',    70),

  -- No enviados
  ('technical_review_not_sent.view',     'technical_review', 'Ver no enviados',                'Consultar registros de buses no enviados.',          80),
  ('technical_review_not_sent.create',   'technical_review', 'Registrar no enviado',           'Registrar un bus que no salió a planta.',            90),
  ('technical_review_not_sent.edit',     'technical_review', 'Editar no enviado',              'Corregir un registro de no envío.',                 100),
  ('technical_review_not_sent.delete',   'technical_review', 'Eliminar no enviado',            'Eliminar un registro de no envío.',                 110),

  -- Flota
  ('fleet.view',                         'fleet',            'Ver flota',                      'Consultar buses. Necesario para operar revisiones.', 200),
  ('fleet.create',                       'fleet',            'Crear buses',                    'Incorporar buses a la flota.',                      210),
  ('fleet.edit',                         'fleet',            'Editar buses',                   'Modificar datos y terminal de un bus.',             220),

  -- Terminales
  ('terminals.view',                     'terminals',        'Ver terminales',                 'Consultar el listado completo de terminales.',      300),
  ('terminals.create',                   'terminals',        'Crear terminales',               'Dar de alta un terminal.',                          310),
  ('terminals.edit',                     'terminals',        'Editar terminales',              'Modificar, activar o desactivar un terminal.',      320),

  -- Usuarios
  ('users.view',                         'access',           'Ver usuarios',                   'Consultar usuarios de terminales autorizados.',     400),
  ('users.create',                       'access',           'Crear usuarios',                 'Dar de alta usuarios.',                             410),
  ('users.edit',                         'access',           'Editar datos de usuarios',       'Modificar nombre, cargo descriptivo y contraseña; no cambia roles ni accesos.', 420),
  ('users.suspend',                      'access',           'Activar / suspender usuarios',   'Habilitar o bloquear el acceso de un usuario.',      430),
  ('users.delete',                       'access',           'Eliminar usuarios',              'Eliminar definitivamente un usuario.',              440),
  ('access.manage',                      'access',           'Administrar roles y permisos',   'Asignar roles de permisos, excepciones y terminales autorizados.', 450),

  -- Configuración operacional de revisiones
  ('settings.manage',                    'technical_review', 'Configurar aviso de vencimiento','Modificar los días usados para marcar revisiones próximas a vencer.', 75);

-- -----------------------------------------------------------------------------
-- Rol de sistema
-- -----------------------------------------------------------------------------
-- Existe un único rol `is_system` para que la plataforma sea administrable
-- desde el primer minuto. Los demás roles los crea el administrador desde la
-- sección ACCESO, con los permisos que decida.
-- -----------------------------------------------------------------------------
insert into public.roles (name, description, is_system)
values ('Administrador', 'Rol de sistema con todos los permisos. No puede eliminarse.', true);

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
cross join public.permissions p
where r.is_system;

-- Cuando una futura migración agregue un permiso nuevo, los roles de sistema lo
-- reciben automáticamente. Sin esto, un administrador podría quedar sin acceso
-- a un módulo recién incorporado.
create or replace function app.grant_new_permission_to_system_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role_permissions (role_id, permission_code)
  select r.id, new.code
  from public.roles r
  where r.is_system
  on conflict do nothing;
  return null;
end;
$$;

create trigger permissions_grant_to_system_roles
  after insert on public.permissions
  for each row execute function app.grant_new_permission_to_system_roles();

-- -----------------------------------------------------------------------------
-- Parámetros operacionales por defecto
-- -----------------------------------------------------------------------------
-- Son valores por defecto editables desde la aplicación, no reglas de negocio
-- fijadas en el código (§38).
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value, label, description) values
  (
    'technical_review.expiring_soon_days',
    '30'::jsonb,
    'Días para "próximo a vencer"',
    'Cuántos días antes del vencimiento un bus se marca como PRÓXIMO A VENCER. Editable en Configuración.'
  ),
  (
    'general.timezone',
    '"America/Santiago"'::jsonb,
    'Zona horaria operacional',
    'Zona horaria usada para agrupar por fecha y mostrar fechas y horas.'
  );
