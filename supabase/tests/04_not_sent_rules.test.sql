-- =============================================================================
-- TEST · §30-§35 · Buses no enviados a planta
-- =============================================================================
begin;

do $$
declare
  v_term     uuid := tests.create_terminal('Terminal No Enviados');
  v_role     uuid := tests.create_role('Operador No Enviados', array[
    'technical_review.view', 'technical_review.create', 'technical_review.close',
    'technical_review_documents.view', 'technical_review_documents.upload',
    'technical_review_not_sent.view', 'technical_review_not_sent.create',
    'technical_review_not_sent.edit', 'technical_review_not_sent.delete',
    'fleet.view'
  ]);
  v_user     uuid := tests.create_user(tests.next_rut(), 'Operador No Enviados', v_term, v_role);
  v_bus      uuid := tests.create_bus('N001', 'NNNN01', v_term);
  v_event    uuid;
  v_ns       uuid;
  v_count    bigint;
  v_expira   date;
  v_terminal uuid;
  v_summary  jsonb;
begin
  perform tests.authenticate_as(v_user);

  -- Vencimiento vigente previo
  v_event := public.open_technical_review(v_bus, 'Conductor Previo');
  perform tests.attach_document(v_event, 'TECHNICAL_REVIEW');
  perform tests.attach_document(v_event, 'GAS_REVIEW');
  perform public.close_technical_review(v_event, 'APPROVED', 'GUIA-NS', '2027-09-30'::date);

  -- ------------------------------------------------------------------ §31
  perform tests.assert_raises(
    format('insert into public.technical_review_not_sent (fleet_id, terminal_id, event_date, reason, created_by) values (%L, %L, %L, %L, %L)',
           v_bus, v_term, '2026-03-01', '   ', v_user),
    'NOT_SENT_REASON_REQUIRED',
    'El motivo de no envío es obligatorio'
  );

  -- ------------------------------------------------------------------ §32
  -- La OT es opcional: el registro se guarda igual
  insert into public.technical_review_not_sent (fleet_id, terminal_id, event_date, reason, created_by)
  values (v_bus, v_term, '2026-03-01', 'Motivo registrado por el usuario', v_user)
  returning id into v_ns;

  perform tests.assert(v_ns is not null, 'Se guarda un no enviado sin número de OT');

  -- El terminal lo fija el servidor a partir del bus, no el cliente
  select terminal_id into v_terminal from public.technical_review_not_sent where id = v_ns;
  perform tests.assert_equals(v_terminal, v_term, 'El terminal se deriva del bus');

  -- Con OT, buscable
  insert into public.technical_review_not_sent (fleet_id, terminal_id, event_date, reason, work_order_number, created_by)
  values (v_bus, v_term, '2026-03-05', 'Otro motivo distinto', 'ot-4521', v_user);

  select count(*) into v_count
  from public.technical_review_not_sent where work_order_number = 'OT-4521';
  perform tests.assert_equals(v_count, 1::bigint, 'La OT se normaliza y permite búsqueda posterior');

  -- ------------------------------------------------------------------ §34
  -- Un no enviado NO abre proceso ni aparece en EN REVISIÓN
  select count(*) into v_count
  from public.technical_review_events where fleet_id = v_bus and status = 'OPEN';
  perform tests.assert_equals(v_count, 0::bigint,
    'Registrar un no enviado no abre ningún proceso de revisión');

  -- ------------------------------------------------------------------ §34, §39
  -- Un no enviado NO modifica el vencimiento
  select expiration_date into v_expira
  from public.fleet_expiration_status where fleet_id = v_bus;
  perform tests.assert_equals(v_expira, '2027-09-30'::date,
    'Un no enviado conserva intacto el vencimiento del bus');

  -- ------------------------------------------------------------------ §34
  -- No cuenta como aprobado ni como rechazado
  v_summary := public.technical_review_summary(null, null, null);
  perform tests.assert_equals((v_summary ->> 'approved')::int, 1,
    'El no enviado no altera el conteo de aprobados');
  perform tests.assert_equals((v_summary ->> 'rejected')::int, 0,
    'El no enviado no cuenta como rechazado');
  perform tests.assert_equals((v_summary ->> 'in_review')::int, 0,
    'El no enviado no cuenta como en revisión');
  perform tests.assert_equals((v_summary ->> 'not_sent')::int, 2,
    'Los no enviados se cuentan en su propio indicador');

  -- ------------------------------------------------------------------ §35
  -- Múltiples registros para el mismo bus, sin sobrescribir
  select count(*) into v_count
  from public.technical_review_not_sent where fleet_id = v_bus;
  perform tests.assert_equals(v_count, 2::bigint,
    'Un mismo bus acumula varios registros de no envío');

  -- ------------------------------------------------------------------ §33
  -- La tabla no tiene forma de almacenar documentos ni vencimientos
  perform tests.assert_equals(
    (select count(*) from information_schema.columns
     where table_schema = 'public'
       and table_name = 'technical_review_not_sent'
       and column_name in ('guide_number', 'expiration_date', 'result', 'status', 'document_id')),
    0::bigint,
    'Un no enviado no admite guía, resultado, vencimiento ni documentos'
  );

  perform tests.become_owner();
end;
$$;

-- =============================================================================
-- Aislamiento por terminal de los no enviados
-- =============================================================================
do $$
declare
  v_term_a uuid := tests.create_terminal('Terminal NS A');
  v_term_b uuid := tests.create_terminal('Terminal NS B');
  v_role   uuid := tests.create_role('Operador NS', array[
    'technical_review_not_sent.view', 'technical_review_not_sent.create', 'fleet.view'
  ]);
  v_user_a uuid := tests.create_user(tests.next_rut(), 'Usuario NS A', v_term_a, v_role);
  v_bus_a  uuid := tests.create_bus('NS01', 'NSAA01', v_term_a);
  v_bus_b  uuid := tests.create_bus('NS02', 'NSBB02', v_term_b);
  v_count  bigint;
begin
  insert into public.technical_review_not_sent (fleet_id, terminal_id, event_date, reason, created_by)
  values (v_bus_a, v_term_a, '2026-03-01', 'Motivo terminal A', v_user_a),
         (v_bus_b, v_term_b, '2026-03-01', 'Motivo terminal B', v_user_a);

  perform tests.authenticate_as(v_user_a);

  perform tests.assert_equals(tests.visible_count('public.technical_review_not_sent'), 1::bigint,
    'Sólo se ven los no enviados del terminal autorizado');

  select count(*) into v_count
  from public.technical_review_not_sent where terminal_id = v_term_b;
  perform tests.assert_equals(v_count, 0::bigint,
    'Filtrar por otro terminal no revela sus no enviados');

  -- No puede registrar un no envío de un bus de otro terminal
  perform tests.assert_raises(
    format('insert into public.technical_review_not_sent (fleet_id, terminal_id, event_date, reason, created_by) values (%L, %L, %L, %L, %L)',
           v_bus_b, v_term_a, '2026-03-02', 'Intento cruzado', v_user_a),
    'row-level security',
    'No puede registrar un no envío para un bus de otro terminal'
  );

  perform tests.become_owner();
end;
$$;

rollback;
