-- =============================================================================
-- TEST · §10, §11, §12, §56, §57 · Roles, permisos y administración de accesos
-- =============================================================================
begin;

-- =============================================================================
-- Un usuario sin `access.manage` no administra accesos
-- =============================================================================
do $$
declare
  v_term      uuid := tests.create_terminal('Terminal Accesos');
  v_role_op   uuid := tests.create_role('Operador Sin Accesos', array[
    'technical_review.view', 'fleet.view', 'users.view'
  ]);
  v_role_adm  uuid := tests.create_role_with_all_permissions('Administrador Prueba');
  v_operador  uuid := tests.create_user(tests.next_rut(), 'Operador Sin Accesos', v_term, v_role_op);
  v_admin     uuid := tests.create_user(tests.next_rut(), 'Administrador Prueba', v_term, v_role_adm, true);
  v_otro      uuid := tests.create_user(tests.next_rut(), 'Otro Usuario', v_term, v_role_op);
begin
  perform tests.authenticate_as(v_operador);

  perform tests.assert(not app.has_permission('access.manage'),
    'El operador no tiene permiso de administración de accesos');

  perform tests.assert_raises(
    format('insert into public.user_terminal_access (user_id, terminal_id) values (%L, %L)', v_otro, v_term),
    'row-level security',
    'Sin access.manage no puede conceder terminales a otro usuario'
  );

  perform tests.assert_raises(
    format('insert into public.user_permission_overrides (user_id, permission_code, granted) values (%L, %L, true)',
           v_otro, 'technical_review.delete'),
    'row-level security',
    'Sin access.manage no puede conceder permisos a otro usuario'
  );

  perform tests.assert_raises(
    format('insert into public.roles (name) values (%L)', 'Rol Improcedente'),
    'row-level security',
    'Sin access.manage no puede crear roles'
  );

  -- Tampoco puede editar a otro usuario sin users.edit
  perform tests.assert(not app.has_permission('users.edit'),
    'El operador no tiene permiso de edición de usuarios');

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §56 · Nadie se eleva a sí mismo
-- =============================================================================
do $$
declare
  v_term     uuid := tests.create_terminal('Terminal Escalada');
  v_term_otro uuid := tests.create_terminal('Terminal Escalada Ajeno');
  v_role_adm uuid := tests.create_role_with_all_permissions('Administrador Escalada');
  v_role_op  uuid := tests.create_role('Operador Escalada', array['technical_review.view']);
  v_admin    uuid := tests.create_user(tests.next_rut(), 'Administrador Escalada', v_term, v_role_adm, true);
  v_otro     uuid := tests.create_user(tests.next_rut(), 'Usuario Objetivo', v_term, v_role_op);
  v_status   text;
begin
  perform tests.authenticate_as(v_admin);

  -- Aunque tenga TODOS los permisos, no puede tocar sus propios privilegios
  perform tests.assert_raises(
    format('update public.profiles set role_id = %L where id = %L', v_role_op, v_admin),
    'SELF_PRIVILEGE_CHANGE_DENIED',
    'Un usuario no puede cambiar su propio rol'
  );

  perform tests.assert_raises(
    format('update public.profiles set has_global_access = false where id = %L', v_admin),
    'SELF_PRIVILEGE_CHANGE_DENIED',
    'Un usuario no puede cambiar su propio acceso global'
  );

  perform tests.assert_raises(
    format('update public.profiles set status = %L where id = %L', 'SUSPENDED', v_admin),
    'SELF_PRIVILEGE_CHANGE_DENIED',
    'Un usuario no puede cambiar su propio estado'
  );

  perform tests.assert_raises(
    format('update public.profiles set primary_terminal_id = %L where id = %L', v_term_otro, v_admin),
    'SELF_PRIVILEGE_CHANGE_DENIED',
    'Un usuario no puede cambiar su propio terminal principal'
  );

  perform tests.assert_raises(
    format('insert into public.user_terminal_access (user_id, terminal_id) values (%L, %L)', v_admin, v_term_otro),
    'row-level security',
    'Un usuario no puede concederse terminales adicionales a sí mismo'
  );

  perform tests.assert_raises(
    format('insert into public.user_permission_overrides (user_id, permission_code, granted) values (%L, %L, true)',
           v_admin, 'technical_review.delete'),
    'row-level security',
    'Un usuario no puede concederse permisos a sí mismo'
  );

  -- El RUT es inmutable: sostiene la identidad usada para iniciar sesión
  perform tests.assert_raises(
    format('update public.profiles set rut = %L where id = %L', '10000013-k', v_otro),
    'RUT_IS_IMMUTABLE',
    'El RUT de un usuario no puede modificarse'
  );

  -- Sí puede administrar a OTRO usuario
  update public.profiles set status = 'SUSPENDED' where id = v_otro;
  select status into v_status from public.profiles where id = v_otro;
  perform tests.assert_equals(v_status, 'SUSPENDED', 'Un administrador sí puede suspender a otro usuario');

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §10 · Permisos por rol + excepciones por usuario
-- =============================================================================
do $$
declare
  v_term   uuid := tests.create_terminal('Terminal Permisos');
  v_role   uuid := tests.create_role('Rol Base Permisos', array['technical_review.view', 'fleet.view']);
  v_user   uuid := tests.create_user(tests.next_rut(), 'Usuario Permisos', v_term, v_role);
  v_perms  jsonb;
begin
  perform tests.authenticate_as(v_user);

  perform tests.assert(app.has_permission('technical_review.view'), 'Hereda el permiso del rol');
  perform tests.assert(not app.has_permission('technical_review.delete'), 'No tiene permisos ajenos al rol');

  perform tests.become_owner();

  -- Concesión extra por usuario
  insert into public.user_permission_overrides (user_id, permission_code, granted)
  values (v_user, 'technical_review.delete', true);

  perform tests.authenticate_as(v_user);
  perform tests.assert(app.has_permission('technical_review.delete'),
    'Un override con granted=true concede el permiso');

  perform tests.become_owner();

  -- Revocación explícita que pisa al rol
  insert into public.user_permission_overrides (user_id, permission_code, granted)
  values (v_user, 'technical_review.view', false);

  perform tests.authenticate_as(v_user);
  perform tests.assert(not app.has_permission('technical_review.view'),
    'Un override con granted=false revoca aunque el rol lo incluya');

  -- El contexto que consume la aplicación refleja exactamente lo mismo
  v_perms := public.current_user_context() -> 'permissions';
  perform tests.assert(not (v_perms ? 'technical_review.view'),
    'El contexto de usuario no expone un permiso revocado');
  perform tests.assert(v_perms ? 'technical_review.delete',
    'El contexto de usuario incluye el permiso concedido por override');

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §57 · Auditoría
-- =============================================================================
do $$
declare
  v_term    uuid := tests.create_terminal('Terminal Auditoría');
  v_role    uuid := tests.create_role_with_all_permissions('Administrador Auditoría');
  v_rut     text := tests.next_rut();
  v_user    uuid := tests.create_user(v_rut, 'Administrador Auditoría', v_term, v_role, true);
  v_bus     uuid;
  v_event   uuid;
  v_count   bigint;
begin
  perform tests.authenticate_as(v_user);

  insert into public.fleet (internal_number, ppu, fuel_type, terminal_id)
  values ('AUD1', 'AUDD01', 'DIESEL', v_term)
  returning id into v_bus;

  v_event := public.open_technical_review(v_bus, 'Conductor Auditoría');
  perform tests.attach_document(v_event, 'REJECTION_REPORT');
  perform public.close_technical_review(v_event, 'REJECTED', 'GUIA-AUD');

  select count(*) into v_count from public.audit_logs
  where action = 'INSERT_FLEET' and entity_id = v_bus::text;
  perform tests.assert_equals(v_count, 1::bigint, 'Se audita la creación de un bus');

  select count(*) into v_count from public.audit_logs
  where action = 'REGISTER_DEPARTURE' and entity_id = v_event::text;
  perform tests.assert_equals(v_count, 1::bigint, 'Se audita el registro de salida');

  select count(*) into v_count from public.audit_logs
  where action = 'REJECT_TECHNICAL_REVIEW' and entity_id = v_event::text;
  perform tests.assert_equals(v_count, 1::bigint, 'Se audita el rechazo');

  -- La bitácora conserva quién hizo cada cosa
  select count(*) into v_count from public.audit_logs
  where entity_id = v_event::text and user_id = v_user and actor_rut = v_rut;
  perform tests.assert(v_count > 0, 'La bitácora identifica al autor de la acción');

  -- §57 · append-only: no se puede reescribir ni borrar.
  -- La barrera es doble: `authenticated` no tiene siquiera el privilegio de
  -- tabla, así que el intento muere antes de llegar a evaluar RLS.
  perform tests.assert_raises(
    'update public.audit_logs set action = ''FALSIFICADO''',
    'permission denied',
    'Nadie puede alterar la bitácora'
  );
  perform tests.assert_raises(
    'delete from public.audit_logs',
    'permission denied',
    'Nadie puede borrar la bitácora'
  );
  perform tests.assert_raises(
    'insert into public.audit_logs (action, entity_type) values (''INVENTADO'', ''X'')',
    'permission denied',
    'Nadie puede fabricar una entrada de bitácora'
  );

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §58 · La auditoría nunca almacena credenciales
-- =============================================================================
do $$
begin
  perform tests.assert_equals(
    app.redact_sensitive('{"rut":"11111111-1","password":"secreta","access_token":"abc","api_key":"k"}'::jsonb),
    '{"rut":"11111111-1"}'::jsonb,
    'Se eliminan contraseñas, tokens y claves antes de auditar'
  );
end;
$$;

rollback;
