-- =============================================================================
-- TEST · §9 · Aislamiento por terminal (Row Level Security)
-- =============================================================================
-- Estas pruebas se ejecutan como el rol `authenticated`, igual que PostgREST.
-- Consultan las tablas DIRECTAMENTE, sin pasar por la aplicación: es justo el
-- escenario del atacante que usa DevTools o llama a la API de Supabase con su
-- propio token.
-- =============================================================================
begin;

do $$
declare
  v_term_a   uuid;
  v_term_b   uuid;
  v_term_c   uuid;
  v_role_op  uuid;
  v_user_a   uuid;
  v_user_ab  uuid;
  v_user_gl  uuid;
  v_user_sus uuid;
  v_bus_a    uuid;
  v_bus_b    uuid;
  v_bus_c    uuid;
  v_count    bigint;
begin
  -- ---------------------------------------------------------------- fixtures
  v_term_a := tests.create_terminal('Terminal Prueba A');
  v_term_b := tests.create_terminal('Terminal Prueba B');
  v_term_c := tests.create_terminal('Terminal Prueba C');

  v_role_op := tests.create_role('Operador Prueba', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload',
    'technical_review_not_sent.view', 'technical_review_not_sent.create',
    'fleet.view', 'fleet.edit'
  ]);

  v_user_a   := tests.create_user(tests.next_rut(), 'Usuario Terminal A', v_term_a, v_role_op);
  v_user_ab  := tests.create_user(tests.next_rut(), 'Usuario Terminales A y B', v_term_a, v_role_op);
  v_user_gl  := tests.create_user(tests.next_rut(), 'Usuario Global', v_term_a, v_role_op, true);
  v_user_sus := tests.create_user(tests.next_rut(),  'Usuario Suspendido', v_term_a, v_role_op, false, 'SUSPENDED');

  -- Terminal adicional autorizado para el usuario A+B
  insert into public.user_terminal_access (user_id, terminal_id) values (v_user_ab, v_term_b);

  v_bus_a := tests.create_bus('T001', 'AAAA11', v_term_a);
  v_bus_b := tests.create_bus('T002', 'BBBB22', v_term_b);
  v_bus_c := tests.create_bus('T003', 'CCCC33', v_term_c);

  -- Un proceso abierto en cada terminal
  insert into public.technical_review_events (fleet_id, terminal_id, driver_name, created_by)
  values (v_bus_a, v_term_a, 'Conductor Fixture A', v_user_a),
         (v_bus_b, v_term_b, 'Conductor Fixture B', v_user_ab),
         (v_bus_c, v_term_c, 'Conductor Fixture C', v_user_gl);

  -- =========================================================================
  -- USUARIO DE TERMINAL A: no ve nada de B ni de C
  -- =========================================================================
  perform tests.authenticate_as(v_user_a);

  perform tests.assert_equals(tests.visible_count('public.fleet'), 1::bigint,
    'Usuario de Terminal A sólo ve los buses de su terminal');

  select count(*) into v_count from public.fleet where terminal_id = v_term_b;
  perform tests.assert_equals(v_count, 0::bigint,
    'Filtrar explícitamente por Terminal B no revela nada (§9)');

  select count(*) into v_count from public.fleet where id = v_bus_b;
  perform tests.assert_equals(v_count, 0::bigint,
    'Consultar el bus de otro terminal por su UUID exacto no lo revela');

  perform tests.assert_equals(tests.visible_count('public.technical_review_events'), 1::bigint,
    'Sólo ve las revisiones de su terminal');

  perform tests.assert(not app.can_access_terminal(v_term_b),
    'can_access_terminal es falso para un terminal no autorizado');
  perform tests.assert(app.can_access_terminal(v_term_a),
    'can_access_terminal es verdadero para el terminal propio');

  -- Tampoco puede ESCRIBIR en otro terminal
  perform tests.assert_raises(
    format('insert into public.technical_review_events (fleet_id, terminal_id, driver_name, created_by) values (%L, %L, %L, %L)',
           v_bus_b, v_term_b, 'Conductor Intruso', v_user_a),
    'row-level security',
    'No puede crear una revisión en un terminal ajeno'
  );

  -- Ni mover un bus propio a un terminal al que no tiene acceso: el WITH CHECK
  -- de la política evalúa el terminal DESTINO.
  perform tests.assert_raises(
    format('update public.fleet set terminal_id = %L where id = %L', v_term_b, v_bus_a),
    'row-level security',
    'No puede mover un bus a un terminal no autorizado'
  );

  -- Un UPDATE sobre un bus ajeno no falla: simplemente no encuentra la fila.
  -- Esa es la protección correcta — no confirma ni desmiente que el bus exista.
  update public.fleet set model = 'Modelo Alterado' where id = v_bus_b;
  get diagnostics v_count = row_count;
  perform tests.assert_equals(v_count, 0::bigint,
    'Un UPDATE dirigido a un bus de otro terminal no afecta ninguna fila');

  perform tests.become_owner();
  select count(*) into v_count from public.fleet where id = v_bus_b and model is null;
  perform tests.assert_equals(v_count, 1::bigint,
    'El bus del otro terminal quedó intacto');
  perform tests.authenticate_as(v_user_a);

  -- =========================================================================
  -- USUARIO CON TERMINALES A + B: ve ambos, nunca C
  -- =========================================================================
  perform tests.become_owner();
  perform tests.authenticate_as(v_user_ab);

  perform tests.assert_equals(tests.visible_count('public.fleet'), 2::bigint,
    'Usuario con dos terminales autorizados ve los buses de ambos');

  select count(*) into v_count from public.fleet where terminal_id = v_term_c;
  perform tests.assert_equals(v_count, 0::bigint,
    'Un tercer terminal sigue siendo invisible');

  perform tests.assert(app.can_access_terminal(v_term_a), 'Acceso al terminal principal');
  perform tests.assert(app.can_access_terminal(v_term_b), 'Acceso al terminal adicional');
  perform tests.assert(not app.can_access_terminal(v_term_c), 'Sin acceso a un tercer terminal');

  perform tests.assert_equals(tests.visible_count('public.technical_review_events'), 2::bigint,
    'Ve las revisiones de sus dos terminales');

  -- =========================================================================
  -- USUARIO GLOBAL: ve todo (pero sigue limitado por sus permisos)
  -- =========================================================================
  perform tests.become_owner();
  perform tests.authenticate_as(v_user_gl);

  perform tests.assert_equals(tests.visible_count('public.fleet'), 3::bigint,
    'El usuario con acceso global ve la flota completa');
  perform tests.assert_equals(tests.visible_count('public.technical_review_events'), 3::bigint,
    'El usuario con acceso global ve todas las revisiones');

  -- El acceso global NO otorga permisos: este rol no administra accesos
  perform tests.assert(not app.has_permission('access.manage'),
    'Acceso global no implica permiso de administración');
  perform tests.assert_equals(tests.visible_count('public.profiles'), 1::bigint,
    'Sin users.view, el usuario global sólo ve su propia ficha');

  -- =========================================================================
  -- USUARIO SUSPENDIDO: no opera (§8)
  -- =========================================================================
  perform tests.become_owner();
  perform tests.authenticate_as(v_user_sus);

  perform tests.assert(not app.user_is_active(), 'El usuario suspendido no está activo');
  perform tests.assert(not app.can_access_terminal(v_term_a),
    'El usuario suspendido pierde acceso incluso a su propio terminal');
  perform tests.assert(not app.has_permission('technical_review.view'),
    'El usuario suspendido no conserva permisos');

  perform tests.assert_equals(tests.visible_count('public.fleet'), 0::bigint,
    'El usuario suspendido no ve ningún bus');
  perform tests.assert_equals(tests.visible_count('public.technical_review_events'), 0::bigint,
    'El usuario suspendido no ve ninguna revisión');
  perform tests.assert_equals(tests.visible_count('public.terminals'), 0::bigint,
    'El usuario suspendido no ve ningún terminal');

  perform tests.assert_raises(
    format('insert into public.technical_review_events (fleet_id, terminal_id, driver_name, created_by) values (%L, %L, %L, %L)',
           v_bus_a, v_term_a, 'Conductor Suspendido', v_user_sus),
    'row-level security',
    'El usuario suspendido no puede escribir'
  );

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- Ver revisiones resuelve sus buses sin conceder administración de flota
-- =============================================================================
do $$
declare
  v_term  uuid := tests.create_terminal('Terminal Lectura Operacional');
  v_role  uuid := tests.create_role('Consulta Revisión Sin Flota', array['technical_review.view']);
  v_user  uuid := tests.create_user(tests.next_rut(), 'Consulta Revisión Sin Flota', v_term, v_role);
  v_bus   uuid := tests.create_bus('OP01', 'OPPP01', v_term);
  v_event uuid;
  v_count bigint;
begin
  insert into public.technical_review_events (fleet_id, terminal_id, driver_name, created_by)
  values (v_bus, v_term, 'Conductor Operacional', v_user)
  returning id into v_event;

  perform tests.authenticate_as(v_user);
  perform tests.assert(not app.has_permission('fleet.view'),
    'Consultar revisiones no concede la pantalla administrativa de Flota');

  select count(*) into v_count from public.technical_review_events_view where id = v_event;
  perform tests.assert_equals(v_count, 1::bigint,
    'La vista de revisiones sí puede resolver los datos del bus');

  update public.fleet set model = 'Cambio no autorizado' where id = v_bus;
  get diagnostics v_count = row_count;
  perform tests.assert_equals(v_count, 0::bigint,
    'El acceso operacional de lectura no permite modificar el bus');

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- Los documentos respetan el terminal (§43)
-- =============================================================================
do $$
declare
  v_term_a  uuid;
  v_term_b  uuid;
  v_role    uuid;
  v_user_a  uuid;
  v_bus_b   uuid;
  v_event_b uuid;
  v_count   bigint;
begin
  v_term_a := tests.create_terminal('Terminal Doc A');
  v_term_b := tests.create_terminal('Terminal Doc B');

  v_role := tests.create_role('Operador Doc', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload', 'fleet.view'
  ]);

  v_user_a := tests.create_user(tests.next_rut(), 'Usuario Doc A', v_term_a, v_role);
  v_bus_b  := tests.create_bus('D002', 'DDDD22', v_term_b);

  insert into public.technical_review_events (fleet_id, terminal_id, driver_name, created_by)
  values (v_bus_b, v_term_b, 'Conductor Doc B', v_user_a)
  returning id into v_event_b;

  perform tests.attach_document(v_event_b, 'REJECTION_REPORT');

  perform tests.authenticate_as(v_user_a);

  perform tests.assert_equals(tests.visible_count('public.technical_review_documents'), 0::bigint,
    'No se ve la metadata de documentos de otro terminal');

  select count(*) into v_count from public.technical_review_analyses;
  perform tests.assert_equals(v_count, 0::bigint,
    'No se ve el análisis de documentos de otro terminal');

  -- La política de Storage se apoya en el terminal contenido en la ruta
  perform tests.assert(
    not app.can_access_terminal(
      app.storage_object_terminal('technical-reviews/' || v_term_b || '/x/y/z.pdf')
    ),
    'La ruta de Storage de otro terminal queda fuera de alcance'
  );
  perform tests.assert(
    app.can_access_terminal(
      app.storage_object_terminal('technical-reviews/' || v_term_a || '/x/y/z.pdf')
    ),
    'La ruta de Storage del terminal propio sí es accesible'
  );

  perform tests.become_owner();
end;
$$;

rollback;
