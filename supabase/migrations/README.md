# Migraciones

## Cómo leer esta carpeta

Los archivos **no se pueden renombrar ni mover a subcarpetas**. Supabase los
aplica en orden alfabético de nombre y `supabase db push` los busca en esta
carpeta plana; reorganizarlos rompería el historial de lo ya aplicado y haría
que una base existente y una nueva dejaran de coincidir.

Para saber a qué sección pertenece cada archivo hay dos señales:

1. La primera línea de cada `.sql`: `-- SECCION: <NOMBRE>`
2. Esta tabla

Buscar todas las de una sección:

```bash
grep -l "SECCION: LAVADO DE BUSES" supabase/migrations/*.sql
```

---

## PLATAFORMA

Identidad, permisos, auditoría, vistas y seguridad. Es la base sobre la que se
apoyan todas las demás secciones: se aplica primero y no depende de ninguna.

| Archivo | Contenido |
|---|---|
| `20260101000000_extensions_and_utilities.sql` | Extensiones, esquema `app` y utilidades (RUT, PPU) |
| `20260101000100_core_identity.sql` | Terminales, roles, permisos, perfiles y accesos |
| `20260101000200_security_functions.sql` | `has_permission`, `can_access_terminal`, contexto del usuario |
| `20260101000500_audit.sql` | Bitácora append-only y disparadores de auditoría |
| `20260101000600_views.sql` | Vistas de lectura con `security_invoker` |
| `20260101000700_business_rpc.sql` | Reglas de negocio transaccionales |
| `20260101000800_rls_policies.sql` | Row Level Security de todas las tablas base |
| `20260101000900_storage.sql` | Bucket privado de documentos |
| `20260101001000_permission_catalog.sql` | Catálogo de permisos y rol de sistema |
| `20260101001100_bootstrap_administrator.sql` | Creación del primer administrador |
| `20260809004000_permission_catalog_integrity.sql` | Integridad del catálogo y separación de capacidades |

## ACCESO Y PERFIL

| Archivo | Contenido |
|---|---|
| `20260809001000_profile_and_presence.sql` | Foto de perfil, bucket `avatars`, presencia y último acceso |

## FLOTA

| Archivo | Contenido |
|---|---|
| `20260101000300_fleet.sql` | Tabla de flota y tipos de combustible |
| `20260809000100_fleet_zone_import.sql` | Importación de zonas operacionales |

## REVISION TECNICA

| Archivo | Contenido |
|---|---|
| `20260101000400_technical_reviews.sql` | Eventos, documentos, análisis, rechazos y no enviados |
| `20260809000200_technical_review_history_import.sql` | Importación del historial de la planilla |
| `20260809000300_performance_and_terminal_delete.sql` | Índices, vista de vencimientos y borrado de terminal |
| `20260809002000_summary_single_scan.sql` | Resumen en un solo recorrido de la flota |
| `20260809003000_clear_review_history.sql` | Vaciado del historial preservando vencimientos |
| `20260809003000_remove_synthetic_rejected_history.sql` | Retirada de rechazos sintéticos de la importación |

## COMBUSTIBLE

| Archivo | Contenido |
|---|---|
| `20260812000100_fuel_calendar.sql` | Calendario de entregas |
| `20260812000200_fuel_bulk_import.sql` | Permiso de carga masiva |
| `20260813000300_dispensers.sql` | Configuración de dispensadores |
| `20260813000400_reader_codes.sql` | Códigos de lector |
| `20260813000500_bad_fuel_loads.sql` | Cargas malas |
| `20260813000600_bad_fuel_loads_history.sql` | Historial y vista enriquecida de cargas malas |
| `20260813000700_dispensers_terminal_metadata.sql` | Metadatos de dispensador por terminal |

## LAVADO DE BUSES

| Archivo | Contenido |
|---|---|
| `20260812000300_bus_wash.sql` | Registro diario por bus (B&M, carrocería, reparación) |
| `20260812000400_bus_wash_fleet_access.sql` | Acceso a la flota desde el módulo |
| `20260813000100_bus_wash_no_wash_and_redvan.sql` | Marca «no se lava» y exclusión de REDVAN |
| `20260813000200_bus_wash_exports.sql` | Auditoría de archivos generados |
| `20260814000100_bus_wash_exports_view.sql` | Vista del histórico de exportaciones |
| `20260814000200_bus_wash_rain_days_and_sla.sql` | Días de lluvia con justificación |
| `20260814000300_bus_wash_targets.sql` | Metas de B&M y carrocería, y ciclo de lavado |

---

## Dos cosas que conviene arreglar

Se dejan documentadas en lugar de corregirlas por lo mismo que abre este
archivo: renombrar una migración ya aplicada rompe el historial.

### 1. Dos archivos comparten prefijo

```
20260809003000_clear_review_history.sql
20260809003000_remove_synthetic_rejected_history.sql
```

Con `supabase db push` el orden entre ambos lo decide el nombre completo, así
que hoy se aplica primero `clear_review_history`. Funciona, pero es frágil: si
alguna vez uno dependiera del otro, el orden sería casualidad y no decisión.
**Al crear la próxima migración, comprobar que el prefijo no exista ya.**

### 2. La numeración interna se repite

Los comentarios de cabecera llevan un número correlativo (`1200 ·`, `1300 ·`…)
que varias migraciones repiten, porque se escribieron en paralelo sin
coordinarse. Ese número **no lo usa nadie**: el orden real lo da la fecha del
nombre del archivo. Es decorativo y engañoso a la vez.

Para migraciones nuevas: usar el prefijo de fecha como única referencia y no
añadir un número correlativo propio.
