-- =============================================================================
-- 000 · Extensiones, esquema de utilidades y helpers genéricos
-- =============================================================================
-- El esquema `app` concentra funciones internas (seguridad, normalización,
-- auditoría). No se expone vía PostgREST: sólo `public` está en el search_path
-- del API. Esto evita que el frontend pueda invocar helpers de seguridad.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'Trigger BEFORE UPDATE: mantiene updated_at sincronizado sin depender del cliente.';

-- -----------------------------------------------------------------------------
-- Normalización de RUT chileno
-- -----------------------------------------------------------------------------
-- Acepta 12.345.678-9 / 12345678-9 / 123456789 y devuelve siempre `12345678-9`
-- con dígito verificador en minúscula cuando es `k`. Devuelve NULL si el RUT
-- no es estructuralmente válido (incluyendo dígito verificador).
-- -----------------------------------------------------------------------------
create or replace function app.normalize_rut(p_rut text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_clean   text;
  v_body    text;
  v_dv      text;
  v_sum     int := 0;
  v_factor  int := 2;
  v_i       int;
  v_rest    int;
  v_dv_calc text;
begin
  if p_rut is null then
    return null;
  end if;

  -- Sólo dígitos y K/k
  v_clean := upper(regexp_replace(p_rut, '[^0-9kK]', '', 'g'));

  if length(v_clean) < 8 or length(v_clean) > 9 then
    return null;
  end if;

  v_body := substring(v_clean from 1 for length(v_clean) - 1);
  v_dv   := substring(v_clean from length(v_clean));

  -- El cuerpo debe ser exclusivamente numérico
  if v_body !~ '^[0-9]+$' then
    return null;
  end if;

  -- Módulo 11
  for v_i in reverse length(v_body)..1 loop
    v_sum := v_sum + (substring(v_body from v_i for 1))::int * v_factor;
    v_factor := case when v_factor = 7 then 2 else v_factor + 1 end;
  end loop;

  v_rest := 11 - (v_sum % 11);
  v_dv_calc := case
    when v_rest = 11 then '0'
    when v_rest = 10 then 'K'
    else v_rest::text
  end;

  if v_dv_calc <> v_dv then
    return null;
  end if;

  return v_body || '-' || lower(v_dv_calc);
end;
$$;

comment on function app.normalize_rut(text) is
  'Normaliza y valida un RUT chileno (incluye dígito verificador módulo 11). NULL si es inválido.';

-- -----------------------------------------------------------------------------
-- Normalización de PPU (patente)
-- -----------------------------------------------------------------------------
create or replace function app.normalize_ppu(p_ppu text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_ppu, ''), '[^a-zA-Z0-9]', '', 'g')), '');
$$;

comment on function app.normalize_ppu(text) is
  'Normaliza una PPU: sin separadores, en mayúsculas. NULL si queda vacía.';

-- -----------------------------------------------------------------------------
-- Normalización de texto identificador (número interno, código de terminal, OT)
-- -----------------------------------------------------------------------------
create or replace function app.normalize_code(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select nullif(upper(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g')), '');
$$;

comment on function app.normalize_code(text) is
  'Normaliza códigos: trim, colapsa espacios, mayúsculas. NULL si queda vacío.';

grant execute on function app.normalize_rut(text)  to authenticated, service_role;
grant execute on function app.normalize_ppu(text)  to authenticated, service_role;
grant execute on function app.normalize_code(text) to authenticated, service_role;
