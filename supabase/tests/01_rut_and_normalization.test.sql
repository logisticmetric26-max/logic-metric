-- =============================================================================
-- TEST · Normalización y validación de identificadores
-- =============================================================================
begin;

do $$
begin
  -- §7 · Los tres formatos de entrada deben producir el mismo RUT normalizado
  perform tests.assert_equals(app.normalize_rut('11.111.111-1'), '11111111-1', 'RUT con puntos y guion');
  perform tests.assert_equals(app.normalize_rut('11111111-1'),   '11111111-1', 'RUT con guion');
  perform tests.assert_equals(app.normalize_rut('111111111'),    '11111111-1', 'RUT sin separadores');
  perform tests.assert_equals(app.normalize_rut('  11.111.111-1  '), '11111111-1', 'RUT con espacios');

  -- Dígito verificador K
  perform tests.assert_equals(app.normalize_rut('10.000.013-K'), '10000013-k', 'DV K se normaliza a minúscula');
  perform tests.assert_equals(app.normalize_rut('10000013k'),    '10000013-k', 'DV k sin separadores');

  -- Dígito verificador 0 (resto 11)
  perform tests.assert_equals(app.normalize_rut('10.000.004-0'), '10000004-0', 'DV 0');

  -- RUT de 7 dígitos
  perform tests.assert_equals(app.normalize_rut('5.126.663-3'), '5126663-3', 'RUT de 7 dígitos');

  -- §62 · Dígito verificador incorrecto ⇒ inválido
  perform tests.assert_equals(app.normalize_rut('11.111.111-2'), null, 'DV incorrecto se rechaza');
  perform tests.assert_equals(app.normalize_rut('12345678-9'),   null, 'DV incorrecto se rechaza (2)');
  perform tests.assert_equals(app.normalize_rut('abc'),          null, 'Texto no numérico se rechaza');
  perform tests.assert_equals(app.normalize_rut(''),             null, 'Cadena vacía se rechaza');
  perform tests.assert_equals(app.normalize_rut(null),           null, 'NULL se rechaza');
  perform tests.assert_equals(app.normalize_rut('1234'),         null, 'Longitud insuficiente se rechaza');

  -- PPU
  perform tests.assert_equals(app.normalize_ppu('ab cd-12'), 'ABCD12', 'PPU se normaliza sin separadores');
  perform tests.assert_equals(app.normalize_ppu('  '),       null,     'PPU vacía se rechaza');

  -- Códigos
  perform tests.assert_equals(app.normalize_code('  ot   123 '), 'OT 123', 'Código: trim, colapso y mayúsculas');
  perform tests.assert_equals(app.normalize_code('   '),         null,    'Código vacío se rechaza');
end;
$$;

-- -----------------------------------------------------------------------------
-- Normalización aplicada en la propia base (no sólo en el formulario)
-- -----------------------------------------------------------------------------
do $$
declare
  v_terminal uuid := tests.create_terminal('Terminal Test Normalización');
  v_bus      uuid;
  v_ppu      text;
  v_internal text;
begin
  insert into public.fleet (internal_number, ppu, fuel_type, terminal_id)
  values ('  bus-01 ', 'ab cd-12', 'DIESEL', v_terminal)
  returning id into v_bus;

  select ppu, internal_number into v_ppu, v_internal from public.fleet where id = v_bus;

  perform tests.assert_equals(v_ppu, 'ABCD12', 'La PPU se normaliza al insertar');
  perform tests.assert_equals(v_internal, 'BUS-01', 'El número interno se normaliza al insertar');

  -- §46 · Sin duplicados, aunque venga con otro formato
  perform tests.assert_raises(
    format('insert into public.fleet (internal_number, ppu, fuel_type, terminal_id) values (%L, %L, %L, %L)',
           'BUS-02', 'AB-CD-12', 'DIESEL', v_terminal),
    'fleet_ppu_unique_idx',
    'No se permite duplicar una PPU escrita con otro formato'
  );

  perform tests.assert_raises(
    format('insert into public.fleet (internal_number, ppu, fuel_type, terminal_id) values (%L, %L, %L, %L)',
           ' bus-01 ', 'ZZZZ99', 'DIESEL', v_terminal),
    'fleet_internal_number_unique_idx',
    'No se permite duplicar un número interno escrito con otro formato'
  );
end;
$$;

rollback;
