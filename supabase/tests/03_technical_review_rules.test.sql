-- =============================================================================
-- TEST · §19-§23, §39, §52, §59, §60 · Reglas del proceso de revisión técnica
-- =============================================================================
begin;

-- =============================================================================
-- §19 · Un bus no puede tener dos procesos abiertos
-- =============================================================================
do $$
declare
  v_term  uuid := tests.create_terminal('Terminal Regla Abierta');
  v_role  uuid := tests.create_role('Operador Regla', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload', 'fleet.view'
  ]);
  v_user  uuid := tests.create_user(tests.next_rut(), 'Operador Regla', v_term, v_role);
  v_bus   uuid := tests.create_bus('R001', 'RRRR11', v_term);
  v_event uuid;
begin
  perform tests.authenticate_as(v_user);

  v_event := public.open_technical_review(v_bus, 'Conductor Fixture Uno');
  perform tests.assert(v_event is not null, 'Se registra la salida a planta');

  perform tests.assert_raises(
    format('select public.open_technical_review(%L, %L)', v_bus, 'Conductor Fixture Dos'),
    'REVIEW_ALREADY_OPEN',
    'El mismo bus no puede tener dos procesos abiertos'
  );

  -- La regla vive en la base: ni siquiera un INSERT directo la esquiva (§52)
  perform tests.assert_raises(
    format('insert into public.technical_review_events (fleet_id, terminal_id, driver_name, created_by) values (%L, %L, %L, %L)',
           v_bus, v_term, 'Conductor Directo', v_user),
    'tre_one_open_per_fleet_idx',
    'El índice parcial bloquea también un INSERT directo'
  );

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §22 · APROBADO exige dos documentos, guía y fecha de vencimiento
-- =============================================================================
do $$
declare
  v_term    uuid := tests.create_terminal('Terminal Aprobación');
  v_role    uuid := tests.create_role('Operador Aprobación', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload', 'fleet.view'
  ]);
  v_user    uuid := tests.create_user(tests.next_rut(), 'Operador Aprobación', v_term, v_role);
  v_bus     uuid := tests.create_bus('A001', 'AAAA01', v_term);
  v_event   uuid;
  v_status  text;
  v_expira  date;
begin
  perform tests.authenticate_as(v_user);
  v_event := public.open_technical_review(v_bus, 'Conductor Aprobación');

  -- Sin ningún documento
  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, %L, %L::date)', v_event, 'APPROVED', 'GUIA-1', '2027-01-31'),
    'TECHNICAL_REVIEW_DOCUMENT_REQUIRED',
    'APROBADO exige el documento de Revisión Técnica'
  );

  -- Sólo el primero de los dos
  perform tests.attach_document(v_event, 'TECHNICAL_REVIEW');
  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, %L, %L::date)', v_event, 'APPROVED', 'GUIA-1', '2027-01-31'),
    'GAS_REVIEW_DOCUMENT_REQUIRED',
    'APROBADO exige también el documento de Revisión de Gases'
  );

  perform tests.attach_document(v_event, 'GAS_REVIEW');

  -- Sin fecha de vencimiento
  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, %L, null::date)', v_event, 'APPROVED', 'GUIA-1'),
    'EXPIRATION_DATE_REQUIRED',
    'APROBADO exige fecha de vencimiento'
  );

  -- Sin número de guía
  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, %L, %L::date)', v_event, 'APPROVED', '   ', '2027-01-31'),
    'GUIDE_NUMBER_REQUIRED',
    'APROBADO exige número de guía'
  );

  -- Con todo lo obligatorio: cierra
  perform public.close_technical_review(v_event, 'APPROVED', 'GUIA-1', '2027-01-31'::date);

  select status, expiration_date into v_status, v_expira
  from public.technical_review_events where id = v_event;

  perform tests.assert_equals(v_status, 'CLOSED', 'La revisión queda cerrada');
  perform tests.assert_equals(v_expira, '2027-01-31'::date, 'Se registra la nueva fecha de vencimiento');

  -- §22 · el vencimiento del bus pasa a ser el recién aprobado
  select expiration_date into v_expira
  from public.fleet_expiration_status where fleet_id = v_bus;
  perform tests.assert_equals(v_expira, '2027-01-31'::date,
    'El vencimiento vigente del bus es el del último evento aprobado');

  -- §59 · un segundo cierre concurrente se rechaza
  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, %L, %L::date)', v_event, 'APPROVED', 'GUIA-2', '2028-01-31'),
    'REVIEW_ALREADY_CLOSED',
    'Una revisión ya cerrada no se puede volver a cerrar'
  );

  -- Cerrado el ciclo, el bus puede volver a salir a planta
  perform tests.assert(public.open_technical_review(v_bus, 'Conductor Segunda Salida') is not null,
    'Tras cerrar, el bus puede iniciar un nuevo proceso');

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §23, §39 · RECHAZADO exige PDF y guía, y CONSERVA el vencimiento anterior
-- =============================================================================
do $$
declare
  v_term      uuid := tests.create_terminal('Terminal Rechazo');
  v_role      uuid := tests.create_role('Operador Rechazo', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload', 'fleet.view'
  ]);
  v_user      uuid := tests.create_user(tests.next_rut(), 'Operador Rechazo', v_term, v_role);
  v_bus       uuid := tests.create_bus('X001', 'XXXX01', v_term);
  v_event     uuid;
  v_expira    date;
  v_previous  date;
  v_count     bigint;
begin
  perform tests.authenticate_as(v_user);

  -- Primero una aprobación, que fija el vencimiento vigente
  v_event := public.open_technical_review(v_bus, 'Conductor Primera');
  perform tests.attach_document(v_event, 'TECHNICAL_REVIEW');
  perform tests.attach_document(v_event, 'GAS_REVIEW');
  perform public.close_technical_review(v_event, 'APPROVED', 'GUIA-100', '2027-06-30'::date);

  -- Ahora un rechazo
  v_event := public.open_technical_review(v_bus, 'Conductor Segunda');

  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, %L)', v_event, 'REJECTED', 'GUIA-200'),
    'REJECTION_DOCUMENT_REQUIRED',
    'RECHAZADO exige el documento de rechazo'
  );

  perform tests.attach_document(v_event, 'REJECTION_REPORT');

  perform tests.assert_raises(
    format('select public.close_technical_review(%L, %L, null)', v_event, 'REJECTED'),
    'GUIDE_NUMBER_REQUIRED',
    'RECHAZADO exige número de guía'
  );

  perform public.close_technical_review(v_event, 'REJECTED', 'GUIA-200');

  select expiration_date, previous_expiration_date into v_expira, v_previous
  from public.technical_review_events where id = v_event;

  perform tests.assert_equals(v_expira, null::date,
    'Un rechazo no fija ninguna fecha de vencimiento');
  perform tests.assert_equals(v_previous, '2027-06-30'::date,
    'Se deja traza del vencimiento vigente al momento del rechazo');

  -- §23 · el bus conserva el vencimiento que ya tenía
  select expiration_date into v_expira
  from public.fleet_expiration_status where fleet_id = v_bus;
  perform tests.assert_equals(v_expira, '2027-06-30'::date,
    'Tras un rechazo el bus conserva su vencimiento anterior');

  -- §40 · cada ida a planta permanece como evento histórico individual
  select count(*) into v_count
  from public.technical_review_events where fleet_id = v_bus and status = 'CLOSED';
  perform tests.assert_equals(v_count, 2::bigint,
    'El rechazo no reemplaza el evento aprobado anterior');

  -- La base impide fijar un vencimiento junto a un resultado RECHAZADO
  perform tests.become_owner();
  perform tests.assert_raises(
    format('update public.technical_review_events set expiration_date = %L where id = %L', '2029-01-01', v_event),
    'tre_rejected_has_no_expiration',
    'La restricción CHECK impide dar vencimiento a un rechazo'
  );
end;
$$;

-- =============================================================================
-- §25, §26 · Motivos de rechazo individuales y trazabilidad
-- =============================================================================
do $$
declare
  v_term   uuid := tests.create_terminal('Terminal Motivos');
  v_role   uuid := tests.create_role('Operador Motivos', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload', 'fleet.view'
  ]);
  v_user   uuid := tests.create_user(tests.next_rut(), 'Operador Motivos', v_term, v_role);
  v_bus    uuid := tests.create_bus('M001', 'MMMM01', v_term);
  v_event  uuid;
  v_saved  int;
  v_count  bigint;
  v_origin text;
begin
  perform tests.authenticate_as(v_user);

  v_event := public.open_technical_review(v_bus, 'Conductor Motivos');
  perform tests.attach_document(v_event, 'REJECTION_REPORT');

  v_saved := public.save_review_rejections(v_event, jsonb_build_array(
    jsonb_build_object(
      'description', 'Motivo detectado automáticamente',
      'source_text', 'Texto tal como aparece en el documento',
      'page_number', 2,
      'confidence', 0.94,
      'requires_review', false,
      'detection_source', 'TEXT_LAYER',
      'origin', 'AUTOMATIC'
    ),
    jsonb_build_object(
      'description', 'Motivo corregido por el usuario',
      'original_description', 'Texto original del análisis',
      'source_text', 'Fragmento de origen',
      'page_number', 3,
      'confidence', 0.41,
      'requires_review', true,
      'detection_source', 'OCR',
      'origin', 'AUTOMATIC_EDITED'
    ),
    jsonb_build_object(
      'description', 'Motivo agregado a mano',
      'origin', 'MANUAL'
    )
  ));

  perform tests.assert_equals(v_saved, 3, 'Se registran los tres motivos');

  -- Cada motivo es una fila independiente y numerada
  select count(*) into v_count from public.technical_review_rejections
  where technical_review_event_id = v_event;
  perform tests.assert_equals(v_count, 3::bigint, 'Cada motivo queda en su propia fila');

  select origin into v_origin from public.technical_review_rejections
  where technical_review_event_id = v_event and sequence = 3;
  perform tests.assert_equals(v_origin, 'MANUAL', 'El motivo agregado a mano queda marcado como MANUAL');

  select count(*) into v_count from public.technical_review_rejections
  where technical_review_event_id = v_event and requires_review;
  perform tests.assert_equals(v_count, 1::bigint,
    'El motivo de baja confianza queda marcado REQUIERE REVISIÓN');

  select count(*) into v_count from public.technical_review_rejections
  where technical_review_event_id = v_event and confirmed_by is not null;
  perform tests.assert_equals(v_count, 3::bigint,
    'Queda registrado quién confirmó cada motivo');

  -- Guardar de nuevo reemplaza el conjunto, sin duplicar
  v_saved := public.save_review_rejections(v_event, jsonb_build_array(
    jsonb_build_object('description', 'Único motivo tras la corrección', 'origin', 'MANUAL')
  ));
  select count(*) into v_count from public.technical_review_rejections
  where technical_review_event_id = v_event;
  perform tests.assert_equals(v_count, 1::bigint, 'Reconfirmar reemplaza el conjunto anterior');

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- §38 · Clasificación de vencimientos con umbral configurable
-- =============================================================================
do $$
declare
  v_term    uuid := tests.create_terminal('Terminal Vencimientos');
  v_role    uuid := tests.create_role_with_all_permissions('Admin Vencimientos');
  v_user    uuid := tests.create_user(tests.next_rut(), 'Admin Vencimientos', v_term, v_role, true);
  v_bus_ok  uuid := tests.create_bus('V001', 'VVVV01', v_term);
  v_bus_soon uuid := tests.create_bus('V002', 'VVVV02', v_term);
  v_bus_exp uuid := tests.create_bus('V003', 'VVVV03', v_term);
  v_bus_new uuid := tests.create_bus('V004', 'VVVV04', v_term);
  v_status  text;
  v_event   uuid;
begin
  perform tests.authenticate_as(v_user);

  -- Vencimiento lejano
  v_event := public.open_technical_review(v_bus_ok, 'Conductor V1');
  perform tests.attach_document(v_event, 'TECHNICAL_REVIEW');
  perform tests.attach_document(v_event, 'GAS_REVIEW');
  perform public.close_technical_review(v_event, 'APPROVED', 'G-V1', (app.today_local() + 400));

  -- Vencimiento dentro del umbral
  v_event := public.open_technical_review(v_bus_soon, 'Conductor V2');
  perform tests.attach_document(v_event, 'TECHNICAL_REVIEW');
  perform tests.attach_document(v_event, 'GAS_REVIEW');
  perform public.close_technical_review(v_event, 'APPROVED', 'G-V2', (app.today_local() + 5));

  -- Vencido
  v_event := public.open_technical_review(v_bus_exp, 'Conductor V3');
  perform tests.attach_document(v_event, 'TECHNICAL_REVIEW');
  perform tests.attach_document(v_event, 'GAS_REVIEW');
  perform public.close_technical_review(v_event, 'APPROVED', 'G-V3', (app.today_local() - 1));

  select expiration_status into v_status from public.fleet_expiration_status where fleet_id = v_bus_ok;
  perform tests.assert_equals(v_status, 'VALID', 'Bus con vencimiento lejano: VIGENTE');

  select expiration_status into v_status from public.fleet_expiration_status where fleet_id = v_bus_soon;
  perform tests.assert_equals(v_status, 'EXPIRING_SOON', 'Bus dentro del umbral: PRÓXIMO A VENCER');

  select expiration_status into v_status from public.fleet_expiration_status where fleet_id = v_bus_exp;
  perform tests.assert_equals(v_status, 'EXPIRED', 'Bus con fecha pasada: VENCIDO');

  select expiration_status into v_status from public.fleet_expiration_status where fleet_id = v_bus_new;
  perform tests.assert_equals(v_status, 'NO_RECORD', 'Bus sin revisiones aprobadas: SIN REGISTRO');

  -- El umbral es configurable, no una constante del código
  update public.app_settings set value = '3'::jsonb
  where key = 'technical_review.expiring_soon_days';

  perform tests.assert_equals(app.expiring_soon_days(), 3, 'El umbral se lee de app_settings');

  select expiration_status into v_status from public.fleet_expiration_status where fleet_id = v_bus_soon;
  perform tests.assert_equals(v_status, 'VALID',
    'Al reducir el umbral, el mismo bus deja de estar próximo a vencer');

  perform tests.become_owner();
end;
$$;

rollback;
