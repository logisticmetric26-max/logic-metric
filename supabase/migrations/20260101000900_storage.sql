-- =============================================================================
-- 900 · Storage · bucket privado de documentos
-- =============================================================================
-- Convención de rutas:
--     technical-reviews/{terminal_id}/{fleet_id}/{event_id}/{tipo}-{uuid}.pdf
--
-- El terminal viaja en la RUTA, así que la misma regla de aislamiento que
-- protege las tablas protege los archivos: un usuario del TERMINAL A no puede
-- listar, descargar ni firmar una URL de un archivo del TERMINAL B (§43).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cast defensivo: un segmento de ruta manipulado no debe reventar la política
-- (una excepción en una política podría convertirse en un canal lateral).
-- -----------------------------------------------------------------------------
create or replace function app.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  return p_value::uuid;
exception
  when others then
    return null;
end;
$$;

grant execute on function app.safe_uuid(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Terminal dueño de un objeto, deducido de su ruta
-- -----------------------------------------------------------------------------
create or replace function app.storage_object_terminal(p_name text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] = 'technical-reviews'
      then app.safe_uuid((storage.foldername(p_name))[2])
    else null
  end;
$$;

grant execute on function app.storage_object_terminal(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Bucket privado
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'technical-review-documents',
  'technical-review-documents',
  false,                      -- privado: sólo se accede vía signed URL
  26214400,                   -- 25 MB
  array['application/pdf']    -- validación de tipo también del lado servidor
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Políticas de Storage
-- -----------------------------------------------------------------------------
drop policy if exists technical_review_documents_read on storage.objects;
drop policy if exists technical_review_documents_write on storage.objects;
drop policy if exists technical_review_documents_remove on storage.objects;

create policy technical_review_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'technical-review-documents'
    and app.has_permission('technical_review_documents.view')
    and app.can_access_terminal(app.storage_object_terminal(name))
  );

create policy technical_review_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'technical-review-documents'
    and app.has_permission('technical_review_documents.upload')
    and app.can_access_terminal(app.storage_object_terminal(name))
  );

create policy technical_review_documents_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'technical-review-documents'
    and app.has_permission('technical_review_documents.upload')
    and app.can_access_terminal(app.storage_object_terminal(name))
  );

-- Sin política de UPDATE: un documento no se sobrescribe en sitio; se elimina y
-- se vuelve a subir, dejando traza en la auditoría.
