-- SECCION: PLATAFORMA
-- =============================================================================
-- 800 · Row Level Security
-- =============================================================================
-- Ésta es la frontera de seguridad real. El frontend sólo decide qué se dibuja;
-- lo que un usuario puede LEER o ESCRIBIR lo decide exclusivamente este archivo.
--
-- Se aplica aunque el atacante use DevTools, edite el bundle, altere
-- localStorage o llame a la API de Supabase directamente con su propio token.
--
-- Patrón transversal de toda política:
--     usuario ACTIVO  +  PERMISO  +  ACCESO AL TERMINAL de la fila
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilegios base
-- -----------------------------------------------------------------------------
-- `anon` (usuario no autenticado) no toca ninguna tabla de negocio.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;

-- -----------------------------------------------------------------------------
-- Activación de RLS
-- -----------------------------------------------------------------------------
alter table public.terminals                    enable row level security;
alter table public.roles                        enable row level security;
alter table public.permissions                  enable row level security;
alter table public.role_permissions             enable row level security;
alter table public.profiles                     enable row level security;
alter table public.user_terminal_access         enable row level security;
alter table public.user_permission_overrides    enable row level security;
alter table public.app_settings                 enable row level security;
alter table public.fleet_fuel_types             enable row level security;
alter table public.fleet                        enable row level security;
alter table public.technical_review_events      enable row level security;
alter table public.technical_review_documents   enable row level security;
alter table public.technical_review_analyses    enable row level security;
alter table public.technical_review_rejections  enable row level security;
alter table public.technical_review_not_sent    enable row level security;
alter table public.audit_logs                   enable row level security;

-- =============================================================================
-- terminals
-- =============================================================================
grant select, insert, update on public.terminals to authenticated;

create policy terminals_select on public.terminals
  for select to authenticated
  using (
    app.user_is_active()
    and (app.can_access_terminal(id) or app.has_permission('terminals.view'))
  );

create policy terminals_insert on public.terminals
  for insert to authenticated
  with check (app.has_permission('terminals.create'));

create policy terminals_update on public.terminals
  for update to authenticated
  using (
    app.has_permission('terminals.edit')
    and (app.has_global_access() or app.can_access_terminal(id))
  )
  with check (
    app.has_permission('terminals.edit')
    and (app.has_global_access() or app.can_access_terminal(id))
  );

-- Sin política de DELETE: los terminales se desactivan, nunca se borran (§15).

-- =============================================================================
-- roles · permissions · role_permissions
-- =============================================================================
grant select, insert, update, delete on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;

create policy roles_select on public.roles
  for select to authenticated
  using (app.user_is_active());

create policy roles_insert on public.roles
  for insert to authenticated
  with check (app.has_permission('access.manage'));

create policy roles_update on public.roles
  for update to authenticated
  using (app.has_permission('access.manage'))
  with check (app.has_permission('access.manage'));

-- Un rol de sistema no se elimina: garantiza que nunca se pierda la
-- administración de la plataforma.
create policy roles_delete on public.roles
  for delete to authenticated
  using (app.has_permission('access.manage') and not is_system);

create policy permissions_select on public.permissions
  for select to authenticated
  using (app.user_is_active());

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (app.user_is_active());

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (app.has_permission('access.manage'));

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (app.has_permission('access.manage'));

-- =============================================================================
-- profiles
-- =============================================================================
-- Sin política de INSERT ni DELETE: crear y eliminar usuarios exige tocar
-- Supabase Auth, y eso ocurre sólo en el servidor con la service role, tras
-- verificar el permiso (§12).
-- =============================================================================
grant select, update on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    -- El usuario siempre ve su propia ficha
    id = (select auth.uid())
    or (
      app.has_permission('users.view')
      and (app.has_global_access() or app.can_access_terminal(primary_terminal_id))
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    app.has_permission('users.edit')
    and (app.has_global_access() or app.can_access_terminal(primary_terminal_id))
  )
  with check (
    app.has_permission('users.edit')
    and (app.has_global_access() or app.can_access_terminal(primary_terminal_id))
  );

-- -----------------------------------------------------------------------------
-- §56 · Un usuario no puede elevarse a sí mismo
-- -----------------------------------------------------------------------------
-- Aunque tenga `users.edit`, nadie modifica su propio rol, estado, acceso
-- global ni terminal principal. Es un trigger (no una política) para que la
-- regla se cumpla venga la escritura de donde venga.
-- -----------------------------------------------------------------------------
create or replace function app.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.id = (select auth.uid()) then
    if new.role_id is distinct from old.role_id
       or new.has_global_access is distinct from old.has_global_access
       or new.status is distinct from old.status
       or new.primary_terminal_id is distinct from old.primary_terminal_id then
      raise exception 'SELF_PRIVILEGE_CHANGE_DENIED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_escalation
  before update on public.profiles
  for each row execute function app.prevent_self_privilege_escalation();

-- =============================================================================
-- user_terminal_access
-- =============================================================================
grant select, insert, delete on public.user_terminal_access to authenticated;

create policy user_terminal_access_select on public.user_terminal_access
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (app.has_permission('users.view') and (app.has_global_access() or app.can_access_terminal(terminal_id)))
  );

-- Sólo se pueden conceder terminales a los que uno mismo tiene acceso, y nunca
-- a la propia cuenta.
create policy user_terminal_access_insert on public.user_terminal_access
  for insert to authenticated
  with check (
    app.has_permission('access.manage')
    and app.can_access_terminal(terminal_id)
    and user_id <> (select auth.uid())
  );

create policy user_terminal_access_delete on public.user_terminal_access
  for delete to authenticated
  using (
    app.has_permission('access.manage')
    and app.can_access_terminal(terminal_id)
    and user_id <> (select auth.uid())
  );

-- =============================================================================
-- user_permission_overrides
-- =============================================================================
grant select, insert, update, delete on public.user_permission_overrides to authenticated;

create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_permission('users.view')
  );

create policy user_permission_overrides_insert on public.user_permission_overrides
  for insert to authenticated
  with check (app.has_permission('access.manage') and user_id <> (select auth.uid()));

create policy user_permission_overrides_update on public.user_permission_overrides
  for update to authenticated
  using (app.has_permission('access.manage') and user_id <> (select auth.uid()))
  with check (app.has_permission('access.manage') and user_id <> (select auth.uid()));

create policy user_permission_overrides_delete on public.user_permission_overrides
  for delete to authenticated
  using (app.has_permission('access.manage') and user_id <> (select auth.uid()));

-- =============================================================================
-- app_settings · fleet_fuel_types
-- =============================================================================
grant select, insert, update on public.app_settings to authenticated;
grant select on public.fleet_fuel_types to authenticated;

create policy app_settings_select on public.app_settings
  for select to authenticated
  using (app.user_is_active());

create policy app_settings_insert on public.app_settings
  for insert to authenticated
  with check (app.has_permission('settings.manage'));

create policy app_settings_update on public.app_settings
  for update to authenticated
  using (app.has_permission('settings.manage'))
  with check (app.has_permission('settings.manage'));

create policy fleet_fuel_types_select on public.fleet_fuel_types
  for select to authenticated
  using (app.user_is_active());

-- =============================================================================
-- fleet
-- =============================================================================
grant select, insert, update on public.fleet to authenticated;

create policy fleet_select on public.fleet
  for select to authenticated
  using (app.has_permission('fleet.view') and app.can_access_terminal(terminal_id));

create policy fleet_insert on public.fleet
  for insert to authenticated
  with check (app.has_permission('fleet.create') and app.can_access_terminal(terminal_id));

-- USING evalúa el terminal ORIGEN y WITH CHECK el DESTINO: mover un bus exige
-- acceso a ambos terminales.
create policy fleet_update on public.fleet
  for update to authenticated
  using (app.has_permission('fleet.edit') and app.can_access_terminal(terminal_id))
  with check (app.has_permission('fleet.edit') and app.can_access_terminal(terminal_id));

-- Sin DELETE: se desactiva para no perder historial (§14).

-- =============================================================================
-- technical_review_events
-- =============================================================================
grant select, insert, update, delete on public.technical_review_events to authenticated;

create policy technical_review_events_select on public.technical_review_events
  for select to authenticated
  using (app.has_permission('technical_review.view') and app.can_access_terminal(terminal_id));

create policy technical_review_events_insert on public.technical_review_events
  for insert to authenticated
  with check (app.has_permission('technical_review.create') and app.can_access_terminal(terminal_id));

create policy technical_review_events_update on public.technical_review_events
  for update to authenticated
  using (
    app.can_access_terminal(terminal_id)
    and app.has_permission('technical_review.close')
  )
  with check (
    app.can_access_terminal(terminal_id)
    and app.has_permission('technical_review.close')
  );

create policy technical_review_events_delete on public.technical_review_events
  for delete to authenticated
  using (app.has_permission('technical_review.delete') and app.can_access_terminal(terminal_id));

-- =============================================================================
-- technical_review_documents
-- =============================================================================
-- Los documentos heredan la seguridad del evento padre: si no puedes ver el
-- evento, no existe forma de listar ni descargar su documento (§43).
-- =============================================================================
grant select, insert, delete on public.technical_review_documents to authenticated;

create policy technical_review_documents_select on public.technical_review_documents
  for select to authenticated
  using (
    app.has_permission('technical_review_documents.view')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

-- Sólo se adjunta a procesos abiertos: un evento cerrado es historia inmutable.
create policy technical_review_documents_insert on public.technical_review_documents
  for insert to authenticated
  with check (
    app.has_permission('technical_review_documents.upload')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and e.status = 'OPEN'
        and app.can_access_terminal(e.terminal_id)
    )
  );

create policy technical_review_documents_delete on public.technical_review_documents
  for delete to authenticated
  using (
    app.has_permission('technical_review_documents.upload')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and e.status = 'OPEN'
        and app.can_access_terminal(e.terminal_id)
    )
  );

-- =============================================================================
-- technical_review_analyses
-- =============================================================================
grant select, insert, update on public.technical_review_analyses to authenticated;

create policy technical_review_analyses_select on public.technical_review_analyses
  for select to authenticated
  using (
    app.has_permission('technical_review.view')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

create policy technical_review_analyses_insert on public.technical_review_analyses
  for insert to authenticated
  with check (
    app.has_permission('technical_review_documents.upload')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

create policy technical_review_analyses_update on public.technical_review_analyses
  for update to authenticated
  using (
    app.has_permission('technical_review_documents.upload')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  )
  with check (
    app.has_permission('technical_review_documents.upload')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

-- =============================================================================
-- technical_review_rejections
-- =============================================================================
grant select, insert, update, delete on public.technical_review_rejections to authenticated;

create policy technical_review_rejections_select on public.technical_review_rejections
  for select to authenticated
  using (
    app.has_permission('technical_review.view')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

create policy technical_review_rejections_write on public.technical_review_rejections
  for all to authenticated
  using (
    app.has_permission('technical_review.close')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  )
  with check (
    app.has_permission('technical_review.close')
    and exists (
      select 1 from public.technical_review_events e
      where e.id = technical_review_event_id
        and app.can_access_terminal(e.terminal_id)
    )
  );

-- =============================================================================
-- technical_review_not_sent
-- =============================================================================
grant select, insert, update, delete on public.technical_review_not_sent to authenticated;

create policy technical_review_not_sent_select on public.technical_review_not_sent
  for select to authenticated
  using (
    app.has_permission('technical_review_not_sent.view')
    and app.can_access_terminal(terminal_id)
  );

-- `terminal_id` lo fija el trigger a partir del bus, por lo que este WITH CHECK
-- valida el terminal REAL del bus, no el que envió el cliente.
create policy technical_review_not_sent_insert on public.technical_review_not_sent
  for insert to authenticated
  with check (
    app.has_permission('technical_review_not_sent.create')
    and app.can_access_terminal(terminal_id)
  );

create policy technical_review_not_sent_update on public.technical_review_not_sent
  for update to authenticated
  using (
    app.has_permission('technical_review_not_sent.edit')
    and app.can_access_terminal(terminal_id)
  )
  with check (
    app.has_permission('technical_review_not_sent.edit')
    and app.can_access_terminal(terminal_id)
  );

create policy technical_review_not_sent_delete on public.technical_review_not_sent
  for delete to authenticated
  using (
    app.has_permission('technical_review_not_sent.delete')
    and app.can_access_terminal(terminal_id)
  );

-- `audit_logs` permanece interna y append-only. No se publica SELECT hasta que
-- exista una pantalla real de auditoría con su propia capacidad verificable.
