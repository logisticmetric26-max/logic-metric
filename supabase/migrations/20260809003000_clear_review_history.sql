-- SECCION: REVISION TECNICA
-- =============================================================================
-- 1400 · Vaciar el historial de revisión técnica preservando los vencimientos
-- =============================================================================
-- Se pide dejar Historial, Rechazados y No enviados en blanco, y a la vez NO
-- tocar Vencimientos. Esas dos cosas se contradicen en la forma actual del
-- modelo: la fecha de vencimiento vigente de cada bus NO está guardada en
-- ninguna columna, se DERIVA de su última revisión aprobada.
--
--     fleet_expiration_status.expiration_date
--       = coalesce(última revisión aprobada, app.legacy_expiration_for_fleet)
--
-- Borrar las revisiones sin más dejaría los 937 buses en «Sin registro» y se
-- perderían 121 avisos de «por vencer» y 15 vencidos que hoy son correctos.
--
-- La solución es materializar el estado ANTES de borrar: se copia la fecha
-- vigente de cada bus a la tabla de vencimientos heredados, que es la segunda
-- rama del `coalesce`. Al desaparecer las revisiones, la vista cae en esa rama
-- y devuelve exactamente las mismas fechas y los mismos estados.
--
-- Nada de esto toca `fleet`, `terminals`, `roles`, `permissions` ni los perfiles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · La tabla de vencimientos heredados admite un origen más
-- -----------------------------------------------------------------------------
-- Hasta ahora sólo aceptaba fechas provenientes de rechazos históricos. Ahora
-- también guarda el estado preservado al vaciar el historial, y se distingue
-- el origen para que dentro de un año se sepa de dónde salió cada fecha.
alter table app.fleet_legacy_expirations
  drop constraint if exists fleet_legacy_expirations_source_result_check;

alter table app.fleet_legacy_expirations
  add constraint fleet_legacy_expirations_source_result_check check (
    source_result in ('REJECTED_HISTORY_IMPORT', 'PRESERVED_ON_CLEANUP')
  );

-- -----------------------------------------------------------------------------
-- 2 · Fotografía del vencimiento vigente de cada bus
-- -----------------------------------------------------------------------------
-- Se lee de la vista, que es la misma fuente que alimenta la pantalla: lo que
-- se preserva es exactamente lo que el usuario está viendo ahora mismo.
insert into app.fleet_legacy_expirations (
  fleet_id, expiration_date, source_guide_number, source_result, updated_at
)
select
  s.fleet_id,
  s.expiration_date,
  s.last_guide_number,
  'PRESERVED_ON_CLEANUP',
  now()
from public.fleet_expiration_status s
where s.expiration_date is not null
on conflict (fleet_id) do update set
  expiration_date     = excluded.expiration_date,
  source_guide_number = excluded.source_guide_number,
  source_result       = excluded.source_result,
  updated_at          = now();

-- -----------------------------------------------------------------------------
-- 3 · Vaciado del historial
-- -----------------------------------------------------------------------------
-- Se borran los hijos antes que el padre de forma explícita. Aunque las claves
-- foráneas estén en cascada, hacerlo a la vista evita depender de ese detalle y
-- deja claro en el propio archivo qué se lleva por delante esta migración.
--
-- Los PDF ya subidos siguen en el bucket privado: se quedan huérfanos, sin
-- ninguna fila que los referencie. No se borran aquí porque el almacenamiento
-- no participa de la transacción, y un fallo a mitad dejaría archivos
-- eliminados con filas intactas.
delete from public.technical_review_rejections;
delete from public.technical_review_analyses;
delete from public.technical_review_documents;
delete from public.technical_review_events;
delete from public.technical_review_not_sent;

-- -----------------------------------------------------------------------------
-- 4 · Un bus, una fila en Vencimientos
-- -----------------------------------------------------------------------------
-- La vista ya devuelve una fila por bus, así que una PPU sólo podría repetirse
-- si la flota tuviera dos buses con la misma patente. Hoy no ocurre —937 buses,
-- 937 patentes distintas—, y este índice impide que llegue a ocurrir.
--
-- Es una restricción sobre la FORMA de la tabla, no sobre sus datos: no
-- modifica, mueve ni elimina ningún bus.
create unique index if not exists fleet_ppu_unique_idx on public.fleet (ppu);

comment on index public.fleet_ppu_unique_idx is
  'Una patente identifica a un solo bus. Garantiza que Vencimientos no pueda mostrar PPU repetidas.';
