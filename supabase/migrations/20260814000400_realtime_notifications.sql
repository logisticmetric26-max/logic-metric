-- SECCION: PLATAFORMA
-- =============================================================================
-- 1700 · Notificaciones en tiempo real
-- =============================================================================
-- Un aviso aparece en la pantalla de TODA persona conectada en cuanto ocurre un
-- hecho operativo: una salida a planta, un cierre de revisión, un bus no
-- enviado, un día de lluvia, una mala carga.
--
-- CÓMO SE ENTREGA EN VIVO
-- -----------------------
-- La tabla se publica en `supabase_realtime`. El navegador se suscribe a los
-- INSERT y Supabase se los empuja, filtrados por RLS: cada quien recibe sólo
-- los avisos de los terminales a los que tiene acceso. No hay servidor de
-- sockets propio que mantener.
--
-- CÓMO SE GENERAN
-- ---------------
-- Con disparadores sobre las tablas de negocio, no desde el código de la
-- aplicación. Así ninguna vía de escritura se queda sin notificar, y añadir un
-- aviso nuevo no obliga a tocar una server action. Cada disparador está
-- BLINDADO: si la notificación fallara, la operación real —registrar la salida,
-- cerrar la revisión— nunca se cae por su culpa.
-- =============================================================================

create table if not exists public.notifications (
  id          uuid primary key default extensions.gen_random_uuid(),
  -- Nulo = aviso global, visible para todos. Con terminal, sólo lo ven quienes
  -- tienen acceso a ese terminal.
  terminal_id uuid references public.terminals (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  -- Ruta interna a la que lleva el aviso al pulsarlo, si aplica.
  href        text,
  actor_name  text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint notifications_kind_check  check (length(trim(kind))  between 1 and 40),
  constraint notifications_title_check check (length(trim(title)) between 1 and 160),
  constraint notifications_href_check  check (href is null or href ~ '^/[A-Za-z0-9/_?=&.-]*$')
);

create index if not exists notifications_created_idx on public.notifications (created_at desc);
create index if not exists notifications_terminal_idx on public.notifications (terminal_id, created_at desc);

comment on table public.notifications is
  'Avisos operativos en tiempo real. Se generan por disparadores y se entregan por Realtime, filtrados por RLS.';

alter table public.notifications enable row level security;

-- Se leen los avisos globales y los del terminal propio. No hay política de
-- INSERT para usuarios: los crean los disparadores con SECURITY DEFINER, así
-- que nadie puede fabricar un aviso a mano.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    terminal_id is null
    or app.can_access_terminal(terminal_id)
  );

grant select on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- Publicación en Realtime
-- -----------------------------------------------------------------------------
-- En un Postgres sin la publicación de Supabase (entorno local de pruebas) el
-- bloque no hace nada en lugar de fallar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     )
  then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Emisor
-- -----------------------------------------------------------------------------
create or replace function app.emit_notification(
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text,
  p_terminal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (kind, title, body, href, terminal_id, actor_name, created_by)
  values (
    p_kind, p_title, p_body, p_href, p_terminal_id,
    app.actor_name((select auth.uid())),
    (select auth.uid())
  );
exception
  when others then
    -- Un aviso jamás debe tumbar la operación que lo dispara.
    null;
end;
$$;

revoke all on function app.emit_notification(text, text, text, text, uuid) from public;

-- -----------------------------------------------------------------------------
-- Disparadores de negocio
-- -----------------------------------------------------------------------------

-- Salida a planta y cierre de revisión
create or replace function app.notify_technical_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num text;
begin
  select f.internal_number into v_num from public.fleet f where f.id = new.fleet_id;

  if tg_op = 'INSERT' then
    perform app.emit_notification(
      'REVIEW_OPEN',
      'Salida a planta',
      coalesce('Bus ' || v_num, 'Un bus') || ' salió a revisión técnica.',
      '/revision-tecnica/en-revision',
      new.terminal_id
    );
  elsif tg_op = 'UPDATE' and old.status = 'OPEN' and new.status = 'CLOSED' then
    perform app.emit_notification(
      'REVIEW_CLOSE',
      case when new.result = 'REJECTED' then 'Revisión rechazada' else 'Revisión aprobada' end,
      coalesce('Bus ' || v_num, 'Un bus') ||
        case when new.result = 'REJECTED' then ' fue rechazado en planta.' else ' fue aprobado en planta.' end,
      case when new.result = 'REJECTED' then '/revision-tecnica/rechazados' else '/revision-tecnica/historial' end,
      new.terminal_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists technical_review_notify on public.technical_review_events;
create trigger technical_review_notify
  after insert or update on public.technical_review_events
  for each row execute function app.notify_technical_review();

-- Bus no enviado
create or replace function app.notify_not_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num text;
begin
  select f.internal_number into v_num from public.fleet f where f.id = new.fleet_id;
  perform app.emit_notification(
    'NOT_SENT',
    'Bus no enviado',
    coalesce('Bus ' || v_num, 'Un bus') || ' no fue enviado a planta.',
    '/revision-tecnica/no-enviados',
    new.terminal_id
  );
  return new;
end;
$$;

drop trigger if exists not_sent_notify on public.technical_review_not_sent;
create trigger not_sent_notify
  after insert on public.technical_review_not_sent
  for each row execute function app.notify_not_sent();

-- Día de lluvia
create or replace function app.notify_rain_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.emit_notification(
    'RAIN_DAY',
    'Día de lluvia',
    'Se justificó no lavar carrocería por lluvia.',
    '/lavado-buses',
    new.terminal_id
  );
  return new;
end;
$$;

drop trigger if exists rain_day_notify on public.bus_wash_rain_days;
create trigger rain_day_notify
  after insert on public.bus_wash_rain_days
  for each row execute function app.notify_rain_day();

-- Mala carga de combustible
create or replace function app.notify_bad_load()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num text;
begin
  select f.internal_number into v_num from public.fleet f where f.id = new.fleet_id;
  perform app.emit_notification(
    'BAD_LOAD',
    'Mala carga de combustible',
    coalesce('Bus ' || v_num, 'Un bus') || ' registró una mala carga.',
    '/combustible/malas-cargas',
    new.terminal_id
  );
  return new;
end;
$$;

drop trigger if exists bad_load_notify on public.bad_fuel_loads;
create trigger bad_load_notify
  after insert on public.bad_fuel_loads
  for each row execute function app.notify_bad_load();
