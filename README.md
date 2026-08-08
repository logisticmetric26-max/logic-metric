# Logic Metric

Plataforma de administración operacional de flota. Primera versión centrada en
**Revisión Técnica**, con **Configuración** (flota y terminales) y **Acceso**
(usuarios, roles y permisos).

La aplicación arranca **vacía**: no hay terminales, buses, usuarios ni datos de
ejemplo. Todo se carga desde la interfaz con información real.

---

## Índice

- [Arquitectura](#arquitectura)
- [Modelo de seguridad](#modelo-de-seguridad)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos y migraciones](#base-de-datos-y-migraciones)
- [Storage](#storage)
- [Primer administrador](#primer-administrador)
- [Autenticación con RUT](#autenticación-con-rut)
- [Roles y permisos](#roles-y-permisos)
- [Análisis de documentos (OCR)](#análisis-de-documentos-ocr)
- [PWA](#pwa)
- [Pruebas](#pruebas)
- [Ejecución local](#ejecución-local)
- [Producción y despliegue](#producción-y-despliegue)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Cómo agregar un módulo nuevo](#cómo-agregar-un-módulo-nuevo)

---

## Arquitectura

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Lenguaje | TypeScript en modo estricto |
| Estilos | Tailwind CSS v4 (configuración CSS-first) |
| Base de datos | PostgreSQL vía Supabase |
| Autenticación | Supabase Auth (RUT + contraseña) |
| Archivos | Supabase Storage (bucket privado) |
| Autorización | PostgreSQL Row Level Security |
| Análisis documental | OCR local (Tesseract) + extracción por reglas · proveedor intercambiable |
| Aplicación instalable | PWA (manifest + service worker propio) |

**Separación de responsabilidades**

```
PostgreSQL   ── reglas de negocio, integridad y autorización (RLS)
services/    ── procesos aislados (análisis documental), sin acceso a la base
features/    ── un dominio por carpeta: esquemas, acciones y componentes
components/  ── UI reutilizable, sin lógica de negocio
lib/         ── utilidades transversales (clientes, formato, errores, permisos)
app/         ── rutas: obtienen datos y componen features
```

La regla que ordena todo: **la base de datos es la autoridad**. Los formularios
validan para dar buena respuesta al usuario, pero cada restricción se aplica de
nuevo en PostgreSQL. Si alguien evita la interfaz, se topa con las mismas reglas.

---

## Modelo de seguridad

### Aislamiento por terminal

Un usuario ve únicamente la información de sus terminales autorizados. La
barrera **no** está en el frontend: son políticas RLS que se evalúan dentro de
PostgreSQL, de modo que se aplican aunque alguien modifique la URL, edite el
bundle, use DevTools, altere `localStorage` o llame a la API de Supabase
directamente con su propio token.

Cada política sigue el mismo patrón:

```
usuario ACTIVO  +  PERMISO  +  ACCESO AL TERMINAL de la fila
```

Un usuario puede tener su terminal, varios terminales concretos, o acceso
global — y en los tres casos sigue limitado por los permisos de su rol.

### Dónde vive cada garantía

| Garantía | Dónde se aplica |
|---|---|
| Aislamiento por terminal | Políticas RLS de cada tabla + políticas de Storage |
| Un solo proceso abierto por bus | Índice único parcial (`tre_one_open_per_fleet_idx`) |
| Documentos obligatorios al cerrar | Función `close_technical_review` (transaccional) |
| Un rechazo conserva el vencimiento | `CHECK` + vencimiento derivado de la última aprobación |
| Un usuario suspendido no opera | `app.user_is_active()` en todas las políticas |
| Nadie se eleva a sí mismo | Trigger `prevent_self_privilege_escalation` |
| El RUT es inmutable | Trigger `prevent_rut_change` |
| La bitácora no se altera | Sin privilegios de INSERT/UPDATE/DELETE para `authenticated` |
| Cierre concurrente seguro | `SELECT … FOR UPDATE` dentro de la función de cierre |

### La clave de servicio

`SUPABASE_SERVICE_ROLE_KEY` salta RLS por completo. Sólo se usa en el servidor,
y sólo para lo que la API de usuario no puede hacer: crear y eliminar
credenciales de Supabase Auth, cambiar contraseñas y cerrar las sesiones de un
usuario suspendido. Todo lo demás —incluida la administración de usuarios,
roles y permisos— se hace con la sesión del usuario para que RLS siga decidiendo.

Los módulos que la usan importan `server-only`, así que el build falla si alguien
los importa desde un componente cliente.

---

## Requisitos

- Node.js 20 o superior
- npm 10 o superior
- Un proyecto de Supabase (o Docker + [Supabase CLI](https://supabase.com/docs/guides/cli) para trabajar en local)

---

## Instalación

```bash
npm install
cp .env.example .env.local   # y complete los valores
```

---

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example).

| Variable | Obligatoria | Descripción |
|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clave anónima. Viaja al navegador; RLS la limita |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clave de servicio. **Sólo servidor** |
| `AUTH_EMAIL_DOMAIN` | — | Dominio del identificador técnico derivado del RUT |
| `DOCUMENT_AI_API_KEY` | — | Sólo si quiere sustituir el OCR local por un proveedor multimodal de pago |
| `DOCUMENT_AI_MODEL` | — | Modelo multimodal. Sólo aplica con la clave anterior |

Ninguna variable de análisis documental es necesaria: el OCR local funciona sin
configuración. Ver [Análisis de documentos](#análisis-de-documentos-ocr).

---

## Base de datos y migraciones

Todo el esquema está en `supabase/migrations/`. **La base completa se puede
reconstruir desde cero con estas migraciones** — no hay ningún cambio aplicado
sólo desde el panel de Supabase.

| Migración | Contenido |
|---|---|
| `…000000_extensions_and_utilities` | Esquema `app`, normalización de RUT/PPU/códigos |
| `…000100_core_identity` | Terminales, roles, permisos, perfiles, accesos, parámetros |
| `…000200_security_functions` | Funciones de seguridad usadas por RLS |
| `…000300_fleet` | Flota y catálogo de tipos de bus |
| `…000400_technical_reviews` | Eventos, documentos, análisis, rechazos, no enviados |
| `…000500_audit` | Bitácora de auditoría y sus triggers |
| `…000600_views` | Vistas de lectura y estado de vencimiento |
| `…000700_business_rpc` | Apertura y cierre transaccional, motivos, indicadores |
| `…000800_rls_policies` | Row Level Security de todas las tablas |
| `…000900_storage` | Bucket privado y políticas de Storage |
| `…001000_permission_catalog` | Catálogo de permisos y rol de sistema |
| `…001100_bootstrap_administrator` | Función de creación del primer administrador |

### Aplicar en Supabase (proyecto remoto)

```bash
supabase link --project-ref <ref-del-proyecto>
supabase db push
```

### Trabajar en local

```bash
supabase start      # requiere Docker
supabase db reset   # aplica todas las migraciones desde cero
npm run db:types    # regenera src/types/database.types.ts
```

> Al modificar una migración hay que actualizar `src/types/database.types.ts`.
> Es el contrato que mantiene sincronizados TypeScript y PostgreSQL.

---

## Storage

La migración `…000900_storage` crea el bucket **`technical-review-documents`**:
privado, límite de 25 MB y sólo `application/pdf`.

Los archivos se organizan con el terminal en la ruta:

```
technical-reviews/{terminal_id}/{fleet_id}/{event_id}/{tipo}-{uuid}.pdf
```

Esto no es cosmético: las políticas de Storage leen el terminal desde el segundo
segmento, así que un usuario del Terminal A no puede listar, descargar ni firmar
una URL de un archivo del Terminal B. Además, un trigger rechaza cualquier
metadata cuya ruta no corresponda a su terminal, bus y evento.

Los PDF se guardan como archivos, nunca como base64 en PostgreSQL, y siempre se
acceden mediante URLs firmadas de vigencia corta.

---

## Primer administrador

No existe ningún usuario preinstalado ni credencial en el código.

```bash
npm run bootstrap:admin -- \
  --rut "12.345.678-5" \
  --nombre "Nombre real" \
  --cargo "Cargo real" \
  --terminal "Nombre real del terminal" \
  --password "una-contraseña-segura"
```

Sin argumentos, el script los pide de forma interactiva. Crea la credencial en
Supabase Auth, el terminal indicado si no existe, y el perfil con el rol
**Administrador** y acceso global.

Sólo funciona una vez: si ya existe cualquier perfil, falla. A partir de ahí los
usuarios se crean desde **Acceso**.

<details>
<summary>Alternativa: hacerlo desde el SQL Editor</summary>

1. Cree el usuario en *Authentication → Users* con email
   `{rut-normalizado}@{AUTH_EMAIL_DOMAIN}` (por ejemplo
   `12345678-5@usuarios.interno`) y una contraseña.
2. Copie su UUID y ejecute:

```sql
select public.bootstrap_administrator(
  '<uuid-del-usuario>'::uuid,
  '12.345.678-5',
  'Nombre real',
  'Cargo real',
  'Nombre real del terminal'
);
```
</details>

---

## Autenticación con RUT

El usuario inicia sesión con **RUT y contraseña**. La interfaz nunca pide un
correo.

Supabase Auth exige internamente un email, que se deriva del RUT de forma
determinista:

```
11.111.111-1  →  11111111-1@usuarios.interno
```

Se deriva en lugar de consultarse por dos razones: el login no necesita leer la
base antes de autenticar (así nadie puede usar la pantalla de acceso para
averiguar qué RUTs existen), y el RUT es inmutable en la base, de modo que
perfil y credencial nunca se desalinean.

Se aceptan los tres formatos de entrada (`12.345.678-9`, `12345678-9`,
`123456789`) y se valida el dígito verificador tanto en el navegador como en
PostgreSQL. Las contraseñas las gestiona íntegramente Supabase Auth: no se
guarda ninguna en tablas propias.

---

## Roles y permisos

Los permisos son un catálogo en base de datos, no constantes repartidas por los
componentes. La aplicación nunca pregunta «¿el rol se llama X?», sino «¿tiene
este permiso?».

- **Roles** se crean y editan desde *Acceso → Roles y permisos*.
- **Excepciones por usuario** permiten conceder o revocar un permiso concreto
  por encima de su rol.
- El rol **Administrador** es de sistema: tiene todos los permisos, no puede
  eliminarse, y recibe automáticamente cualquier permiso que agregue una
  migración futura.

Permisos disponibles:

```
technical_review.view / create / close / edit / delete
technical_review_documents.view / upload
technical_review_not_sent.view / create / edit / delete
fleet.view / create / edit
terminals.view / create / edit
users.view / create / edit / suspend / delete
access.manage
settings.manage
audit.view
```

> `fleet.view` es necesario para operar revisiones: sin él no se puede buscar el
> bus al registrar una salida o un no envío.

---

## Análisis de documentos (OCR)

Cuando una revisión se cierra como **rechazada**, el PDF adjunto se procesa
íntegro. **Funciona sin configurar nada**: el motor por defecto corre en local.

### Motor local (por defecto)

| | |
|---|---|
| Costo | Gratuito e ilimitado |
| Cuenta / clave | No requiere |
| Conexión | Sólo la primera vez, para descargar el modelo de idioma (~8 MB) |
| Privacidad | Ningún documento sale del servidor |

Cómo procesa el documento:

1. Extrae la capa de texto de **todas** las páginas con `pdfjs-dist`.
2. Detecta qué páginas son escaneos (sin texto aprovechable).
3. Rasteriza esas páginas a 2× y les aplica **OCR con Tesseract** en español.
4. Busca la sección de rechazos y extrae los elementos enumerados: `1.`, `a)`,
   viñetas, códigos jerárquicos como `4.2.1`. Une los motivos partidos en varias
   líneas y descarta las cabeceras del formulario (PPU, fecha, folio, firma).
5. Devuelve cada motivo por separado, con la línea original como evidencia, la
   página y un nivel de confianza.
6. **Marca todos como REQUIERE REVISIÓN.**
7. El usuario revisa, corrige, elimina o agrega motivos antes de cerrar.
8. Se guarda qué detectó el sistema y qué modificó la persona.

**Qué hace y qué no.** El motor local reconoce la *estructura* del informe, no
su significado. Por eso todo lo que propone queda marcado para confirmación, y
la confianza se acota deliberadamente por debajo del umbral de «alta»: el
sistema no puede afirmar que interpretó bien lo que no comprende.

Si el informe usa un formato que las reglas no reconocen, devuelve una lista
vacía y el usuario registra los motivos a mano. Es preferible no proponer nada
que proponer basura. **Nunca inventa un motivo**: cada uno sale literalmente de
una línea del documento, que se conserva en `source_text`.

Rendimiento de referencia (MacBook Pro Intel i7, 16 GB): ~3,5 s por página
escaneada. Las páginas con capa de texto son instantáneas.

```bash
npm run ocr:setup   # opcional: descarga el modelo por adelantado
```

No hace falta ejecutarlo: si el modelo falta, se descarga solo la primera vez.

### Proveedor multimodal (opcional, de pago)

Si sus informes tienen un formato irregular y necesita más precisión, defina
`DOCUMENT_AI_API_KEY` con una clave de la API de Anthropic. Ese proveedor
*entiende* el documento en lugar de reconocer su estructura, así que acierta más
en escaneos malos o layouts poco convencionales.

Es una mejora opcional. En cuanto la clave está definida, sustituye al motor
local; si la borra, se vuelve al local sin más cambios.

### Arquitectura

Ambos motores implementan la misma interfaz `RejectionAnalysisProvider` en
`src/services/document-processing/`. Añadir un tercero es implementarla y
devolverlo en `getProvider()`; ningún módulo de negocio se entera.

```
getProvider()
  ├─ DOCUMENT_AI_API_KEY definida → AnthropicRejectionAnalysisProvider
  └─ en otro caso                 → LocalOcrRejectionProvider   (por defecto)
```

El procesamiento corre en `/api/documents/analyze` (runtime Node), de modo que
la descarga del documento pasa por RLS y las políticas de Storage.

## PWA

La aplicación se instala como aplicación de escritorio y móvil (Windows, macOS,
Android, y iPhone/iPad donde Safari lo permite), abriéndose en su propia ventana
en modo `standalone`.

- **Manifiesto**: `src/app/manifest.webmanifest/route.ts`
- **Service worker**: `src/pwa/service-worker.js` → `public/sw.js` en el build
- **Iconos**: `npm run icons` los regenera (reemplace `public/icons/` por el
  logotipo definitivo cuando lo tenga)

**Estrategia de caché.** Los datos operacionales nunca se sirven desde caché:

| Recurso | Estrategia |
|---|---|
| Supabase y cualquier origen externo | No se intercepta: siempre red |
| Navegación (HTML) | Red primero; sin conexión, página offline |
| `/_next/static/*` | Caché primero (llevan hash en la URL) |
| Iconos y manifiesto | Caché con revalidación en segundo plano |

Cada build genera una versión distinta del service worker. Cuando hay una
versión nueva se avisa al usuario en lugar de recargar solo: una recarga
automática podría interrumpir el cierre de una revisión.

---

## Pruebas

### Reglas críticas · PostgreSQL

Las reglas que importan viven en la base, así que se prueban ahí — como el rol
`authenticated` y con `request.jwt.claim.sub`, exactamente el contexto que usa
PostgREST. Son pruebas de RLS real, no una aproximación.

```bash
supabase start && supabase db reset
npm run test:db
```

| Archivo | Cubre |
|---|---|
| `01_rut_and_normalization` | RUT (tres formatos, dígito verificador), PPU, códigos, duplicados |
| `02_terminal_isolation` | Terminal A no ve B · A+B ve ambos · global ve todo · suspendido no opera · documentos respetan terminal |
| `03_technical_review_rules` | Un solo proceso abierto · aprobado exige 2 documentos, guía y vencimiento · rechazado exige PDF y guía y conserva el vencimiento · cierre concurrente · motivos individuales · umbral configurable |
| `04_not_sent_rules` | Motivo obligatorio · OT opcional · no abre proceso · no cuenta como aprobado/rechazado · no toca vencimientos · sin documentos · historial acumulativo |
| `05_access_control` | Sin `access.manage` no administra · nadie se eleva a sí mismo · RUT inmutable · overrides de permisos · bitácora inalterable |

Cada archivo corre dentro de una transacción que termina en `ROLLBACK`: las
pruebas no dejan datos.

### Lógica pura · Vitest

```bash
npm test
```

Cubre RUT, PPU, números internos, guías, OT, fechas, rutas de Storage,
validación real de PDF (firma binaria) y traducción de errores.

### Verificación completa

```bash
npm run verify   # lint + typecheck + tests + build
```

---

## Ejecución local

```bash
npm run dev
```

En <http://localhost:3000>. El service worker se desactiva en desarrollo para no
interferir con la recarga en caliente.

---

## Producción y despliegue

```bash
npm run build
npm start
```

El proyecto despliega sin configuración adicional en cualquier plataforma que
soporte Next.js (Vercel, entre otras). Lista de comprobación:

1. Cargar las variables de entorno del panel de la plataforma.
2. Aplicar las migraciones al proyecto Supabase (`supabase db push`).
3. Verificar que el bucket `technical-review-documents` existe y es **privado**.
4. Crear el primer administrador (una sola vez).
5. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` **no** está expuesta como
   `NEXT_PUBLIC_`.

`/api/documents/analyze` necesita runtime Node (no Edge) y hasta 300 s: ya está
declarado en la propia ruta.

---

## Estructura del proyecto

```
src/
  app/
    (privado)/            área con sesión: shell, sidebar y header
      revision-tecnica/   resumen con análisis de rechazos, en revisión,
                          no enviados, rechazados, vencimientos, historial
      configuracion/      flota, terminales
      acceso/             usuarios, roles y permisos
    api/documents/analyze procesamiento del PDF de rechazo
    api/reports/          exportación Excel del módulo de revisión técnica
    login/                acceso con RUT
  components/
    ui/                   botones, campos, tablas, modales, filtros, toasts
    layout/               shell, sidebar, header, migas de pan
    pwa/                  registro y actualización del service worker
  features/
    auth/ access/ fleet/ terminals/ technical-reviews/
  services/
    document-processing/  extracción de PDF y análisis, desacoplado
  lib/                    clientes Supabase, permisos, formato, errores
  schemas/                validaciones compartidas
  types/                  tipos de la base de datos
  pwa/                    plantilla del service worker

supabase/
  migrations/             esquema completo (reconstruible desde cero)
  tests/                  pruebas SQL de RLS y reglas de negocio

scripts/                  bootstrap del administrador, iconos, SW, tests SQL
```

---

## Cómo agregar un módulo nuevo

La estructura está pensada para crecer sin rehacer autenticación, permisos,
terminales, usuarios ni auditoría:

1. **Migración**: tabla con `terminal_id`, sus índices, y políticas RLS con el
   patrón `usuario activo + permiso + acceso al terminal`.
2. **Permisos**: agréguelos a `public.permissions` en la misma migración. Los
   roles de sistema los reciben automáticamente.
3. **Tipos**: `npm run db:types`, o actualice `src/types/database.types.ts`.
4. **Feature**: cree `src/features/<dominio>/` con `schemas.ts`, `actions.ts` y
   sus componentes.
5. **Sidebar**: agregue una entrada a `NAV_ITEMS` en
   `src/components/layout/navigation.ts` con los permisos que la habilitan.
6. **Pruebas**: agregue un archivo a `supabase/tests/` verificando que el nuevo
   módulo respeta el aislamiento por terminal.

No hay que tocar el layout, la sesión ni el sistema de permisos.
