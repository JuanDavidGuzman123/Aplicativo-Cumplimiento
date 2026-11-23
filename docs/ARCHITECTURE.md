# Arquitectura — Seguimiento de Contrapartes

Documento de decisiones técnicas de la Fase 1. La implementación se realizará por fases; este documento se actualizará con cada avance.

## 1. Alcance

Aplicativo web para el área de Cumplimiento que centraliza contrapartes provenientes de archivos Excel, controla el calendario semestral de seguimiento, registra los seguimientos realizados por personas y conserva la trazabilidad.

El sistema **no** realiza debida diligencia, consultas en listas restrictivas, verificaciones documentales ni análisis de riesgo automáticos. Es una herramienta de gestión, control de fechas y almacenamiento.

## 2. Estado de implementación

| Fase | Estado |
|---|---|
| 1. Análisis, arquitectura y estructura | Completada |
| 2. Configuración del entorno (Prisma, BD, conexión) | Completada |
| 3. Autenticación y usuarios | Completada |
| 4. Contrapartes y subprocesos | Completada |
| 5. Seguimientos y documentos | Completada |
| 6. Notificaciones | Completada |
| 7. Importación Excel | Completada |
| 8. Dashboard | Completada |
| 9. Pruebas y seguridad | Completada |
| 10. Despliegue | Preparada (ejecución pendiente en servidor) |
| Actualización anual (módulo adicional) | Completada |
| Fuente anual externa (Microsoft Graph o archivo local, webhook y SSE) | Implementada; modo local activo y Graph pendiente de consentimiento |

### Entorno configurado (Fase 2)

- Node.js 24.22 y npm 11.19.
- Backend NestJS 12 con Prisma **6.19.3 fijado**. Se eligió esta versión estable porque el scaffold ESM de Nest 12 ya fue verificado con ella; Prisma 7/8 exige cambios de configuración que no son necesarios para este alcance.
- PostgreSQL 17.11 en `localhost:5432`, base `seguimiento_contrapartes`. Migración inicial `20261103215320_init` aplicada; las 9 tablas de negocio existen.
- Configuración global con `ConfigModule` y validación de variables (`src/config/env.validation.ts`); `ValidationPipe` global; prefijo `/api`; Helmet; CORS restringido a `http://localhost:5173`.
- `GET /api/health` ejecuta `SELECT 1` en PostgreSQL y responde `{ status: "ok", database: "connected" }`.
- Frontend con Tailwind CSS v4, Axios, React Router, React Hook Form, Zod y Lucide. El frontend incluye login, layout autenticado, administración de usuarios, módulos de subprocesos y contrapartes, seguimientos, documentos, campana de notificaciones, importación de Excel, dashboard y auditoría.
- npm 11 exige aprobar los scripts de instalación de módulos nativos. Las aprobaciones de Prisma y bcrypt quedaron registradas en `allowScripts` de `backend/package.json` para que una instalación limpia funcione.
- Variables reales en `backend/.env` y `frontend/.env`, excluidas de Git. Solo se versionan los `.env.example`.

### Autenticación y usuarios (Fase 3)

- `POST /api/auth/login` firma un JWT con vigencia de 8 h; `GET /api/auth/me` devuelve el usuario actual. El guard consulta la base de datos en cada solicitud y rechaza usuarios inexistentes o inactivos.
- Guards globales: autenticación, roles y límite de solicitudes (100/minuto global; 5 intentos de login/minuto por IP).
- Administración de usuarios solo para ADMIN: listado, creación, edición y activación/desactivación. No se permite desactivar al propio usuario ni al último ADMIN activo.
- Contraseñas con bcrypt (12 rondas), mínimo 8 caracteres con al menos una letra y un número; nunca se devuelven en las respuestas.
- `AuditLog` registra `USER_CREATED`, `USER_UPDATED`, `USER_ACTIVATED` y `USER_DEACTIVATED`, sin contraseñas ni tokens.
- El administrador inicial se crea con `npx prisma db seed` a partir de `SEED_ADMIN_*`; el seed es idempotente y no duplica el usuario.
- Verificado con build, lint y pruebas del backend, build/lint del frontend y flujos reales contra la API: login, roles, validaciones, usuario inactivo, autodesactivación y protección del último ADMIN.

### Contrapartes y subprocesos (Fase 4)

- Catálogo de subprocesos administrado por ADMIN (`GET/POST/PATCH /subprocesses`). El nombre es único sin distinguir mayúsculas; los subprocesos inactivos no se asignan a nuevas contrapartes.
- Listado de contrapartes con búsqueda por NIT o razón social, filtros por subproceso, estado y estado de calendario, y paginación (`page`, `pageSize`, máximo 100). El detalle incluye la contraparte, su subproceso y el conteo de seguimientos.
- El NIT se normaliza a dígitos para unicidad y búsqueda, conservando el formato original. Se aceptan de 6 a 15 dígitos con puntos, guiones o espacios.
- Al crear, `registrationDate` es hoy en `America/Bogota` por defecto y no puede ser futura; si no se indica `nextFollowUpDate`, se programa a seis meses. Al crear se puede indicar una fecha inicial distinta.
- La edición se limita a NIT, razón social, subproceso y observaciones. Las fechas solo cambian al finalizar un seguimiento, reactivar o importar.
- Archivar y reactivar exigen justificación de 5 a 1000 caracteres. Archivar conserva el historial y limpia los datos de reactivación; reactivar permite indicar una nueva fecha de próximo seguimiento.
- El estado de calendario se calcula en el backend: `OVERDUE`, `PENDING` (0–15 días), `UPCOMING` (16–30), `ON_TIME` (> 30) y `UNSCHEDULED`.
- `AuditLog` registra `SUBPROCESS_CREATED`, `SUBPROCESS_UPDATED`, `COUNTERPARTY_CREATED`, `COUNTERPARTY_UPDATED`, `COUNTERPARTY_ARCHIVED` y `COUNTERPARTY_REACTIVATED`.
- Verificado con build, lint y 12 pruebas unitarias del backend, flujos reales contra la API y build/lint del frontend. El catálogo inicia vacío: el ADMIN debe crear los subprocesos del área.

### Seguimientos y documentos (Fase 5)

- `GET/POST /counterparties/:id/follow-ups` devuelve el historial y crea un borrador. `PATCH /follow-ups/:id` edita borradores y `POST /follow-ups/:id/finalize` los finaliza.
- Cualquier usuario autenticado consulta el historial; solo el usuario responsable o un ADMIN edita y finaliza. No se crean ni modifican seguimientos de contrapartes archivadas.
- `performedAt` es hoy en `America/Bogota` por defecto y no puede ser futura. `result` y `observations` son opcionales mientras el registro está en borrador.
- Al finalizar se exige `result`, se registra `finalizedAt` y el registro queda inmutable. En la misma transacción se actualiza la contraparte: `lastFollowUpDate = performedAt` y `nextFollowUpDate = addMonths(performedAt, 6)`.
- Documentos: `POST /follow-ups/:id/documents` recibe el campo multipart `file`; `GET /documents/:id/download` entrega el archivo con autenticación. Se aceptan PDF, DOCX, XLSX y JPG hasta 10 MB (configurable).
- Los archivos se guardan en `uploads/` con nombre UUID y se descargan con su nombre original. Adjuntar documentos no modifica el contenido del seguimiento, por lo que se permite también sobre registros finalizados.
- `AuditLog` registra `FOLLOW_UP_CREATED`, `FOLLOW_UP_UPDATED`, `FOLLOW_UP_FINALIZED` y `DOCUMENT_UPLOADED`.
- Verificado con build, lint y 12 pruebas unitarias del backend, flujos reales contra la API (permisos, inmutabilidad, cálculo semestral y archivos) y build/lint del frontend.

### Notificaciones (Fase 6)

- `GET /notifications` devuelve las alertas globales ordenadas de la más reciente a la más antigua y el contador `unreadCount` del usuario autenticado. `PATCH /notifications/:id/read` registra la lectura de forma idempotente.
- La generación se ejecuta al iniciar la aplicación y cada día a las 07:00 de `America/Bogota` (configurable con `SCHEDULE_NOTIFICATIONS_CRON`). Es segura si se ejecuta varias veces.
- Se generan alertas solo para contrapartes `ACTIVE` con `nextFollowUpDate`: `D30` para 16–30 días, `D15` para 1–15 días, `DUE` para el día del vencimiento y `OVERDUE` para fechas pasadas.
- La restricción única `(counterpartyId, type, scheduledDate)` impide duplicados cuando la tarea se repite o la aplicación se reinicia.
- Las notificaciones son globales; cada usuario tiene su propio estado de lectura y contador mediante `NotificationRead`.
- La campana de la barra superior consulta las alertas al iniciar, cada 60 segundos y al abrirse; muestra el contador, permite marcar como leída y navega a la contraparte.
- Verificado con build/lint del backend y frontend y flujos reales contra la API: generación de los cuatro tipos, exclusión de archivadas, idempotencia tras reinicios, lectura por usuario y respuestas 401/404/400.

### Importación Excel (Fase 7)

- `POST /imports/upload` recibe el campo multipart `files` (varios) o `file` (uno), solo para ADMIN. `GET /imports` lista el historial paginado y `GET /imports/:id` devuelve el detalle.
- Se aceptan `.xlsx` y `.xlsm`; los `.xls` se rechazan porque ExcelJS no los lee. Límites: 10 archivos, 10 MB por archivo, 25 MB total y 5000 filas por lote.
- Un lote puede contener varios archivos y hojas; cada fila conserva archivo, hoja y número de fila. Los encabezados se detectan en las primeras filas y se normalizan para sugerir el mapeo, que el usuario puede ajustar.
- `POST /imports/:id/preview` valida sin guardar contrapartes: NIT, razón social, subproceso, fechas, duplicados y conflictos con registros existentes. El resultado se guarda en `ImportBatch.previewData`.
- `POST /imports/:id/confirm` consolida de forma transaccional. Solo crea subprocesos si `createMissingSubprocesses` es explícito y solo actualiza fechas de existentes si `authorizeDateChanges` es explícito; los conflictos se reportan y se omiten.
- Estados de lote `PREVIEW`, `CONFIRMED` y `FAILED`; estados de fila `NEW`, `EXISTING`, `CONFLICT` y `ERROR`.
- La confirmación devuelve `{ created, existing, updatedDates, conflicts, errors, createdSubprocesses }`; `importedRows` corresponde a las contrapartes creadas y `errors` no incluye los conflictos.
- Registra `IMPORT_UPLOADED` e `IMPORT_CONFIRMED` en `AuditLog` y, si se crearon contrapartes o se actualizaron fechas, ejecuta la generación de notificaciones.
- La pantalla `/importar` (ADMIN) permite cargar, mapear, previsualizar, confirmar y consultar el historial. Los cambios de mapeo u opciones invalidan la vista previa hasta volver a validarla; si la confirmación falla, se refresca el estado del lote.
- Verificado con build/lint en backend y frontend y contra la API real con dos archivos, dos hojas y 11 filas: vista previa estricta y flexible, confirmación, conflictos, diferencias de fechas, creación de subprocesos, notificaciones, permisos, `.xls`, carga vacía, doble confirmación e historial. El backend ejecuta 17 pruebas unitarias, incluidas las del parser.

### Actualización anual (módulo adicional)

- Proceso independiente del seguimiento semestral. Genera notificaciones anuales propias y no modifica `Counterparty`, `FollowUp` o las fechas del calendario.
- `AnnualCounterparty` guarda `code` y `codeNormalized` (único), `businessName`, `status` ACTIVE/INACTIVE, `requiresSemiannualFollowUp` nullable (Sí/No/vacío), `filingDate`, `filingYear`, `dueDiligenceType`, `observations` y el archivo de origen. La fecha se almacena como `date` completa. El estado se interpreta desde A (activo) e I (inactivo).
- `filingYear` se toma de la columna Año; si no viene, se deriva de `filingDate`. El resumen y el estado anual usan `filingYear` cuando está presente.
- `GET /annual-updates/summary` (autenticado) devuelve totales de activos/inactivos, actualizados en el año y pendientes activos. Los pendientes consideran solo diligenciamientos desde el año anterior (`currentYear - 1`; 2025 en este corte); 2024 o antes quedan fuera. Los inactivos solo se incluyen en los conteos.
- `GET /annual-updates` (autenticado) lista con búsqueda, estado, situación anual y seguimiento registrado, con paginación, e incluye fecha, año, tipo de debida diligencia y observaciones completas.
- `GET /annual-updates/updates-due` (autenticado) lista contrapartes activas con diligenciamiento desde el año anterior (`currentYear - 1`; 2025 en este corte): vencidas, de hoy y próximas a 15 días, ordenadas por urgencia; devuelve conteos de cada grupo y la alerta correspondiente. Las filas de 2024 o antes y sin fecha quedan fuera.
- La fecha límite es `filingDate + 1 año`, con ajuste del 29 de febrero al 28. Los recordatorios `ANNUAL_D3` (3–2 días) y `ANNUAL_D1` (1–0 días) se generan con `skipDuplicates` por `(annualCounterpartyId, type, scheduledDate)`.
- `POST /annual-updates/import/preview` y `POST /annual-updates/import/confirm` (solo ADMIN) reciben un `.xlsx`/`.xlsm` y detectan automáticamente código de punto de venta, nombre, estado (A/I), fecha de diligenciamiento, año, tipo de debida diligencia, seguimiento y observaciones; validan sin guardar antes de confirmar. La confirmación es idempotente por `codeNormalized` y registra `ANNUAL_UPDATES_IMPORTED`. Si faltan columnas obligatorias, la vista previa devuelve los encabezados detectados, sin interfaz de mapeo manual. Cuando un código se repite, se conserva la fila con la fecha/año más reciente y las anteriores se marcan como `IGNORED` (“Histórico omitido”), fuera de los errores.
- La columna de seguimiento se almacena y se muestra para consulta con tres estados: Sí, No y vacío. Las celdas vacías de la base se conservan vacías y el indicador se denomina “Contrapartes en seguimiento”. No crea automáticamente registros en el módulo semestral. La sincronización Excel↔aplicativo queda para una fase posterior. La importación no elimina registros ausentes en el archivo.
- La pantalla `/actualizacion-anual` (autenticados) muestra indicadores, filtros, tabla, estado de la fuente y sincronización manual. La carga manual ya no forma parte de esta pantalla. El estado “pendiente” aplica solo a puntos de venta activos sin actualización en el año.

### Fuente anual externa (Microsoft Graph o archivo local)

- La pantalla `/actualizacion-anual` dejó de consumir los endpoints de importación de `annual-updates` y usa exclusivamente el módulo `external-data`. La base anual PostgreSQL queda aislada: no se escribe en ella desde este flujo y no se envían datos de PostgreSQL al libro.
- El libro es único. En modo `graph` se identifica con `SHAREPOINT_DRIVE_ID` y `SHAREPOINT_ITEM_ID` y se usa Microsoft Graph Workbook API sobre `driveItem`, sin SharePoint Lists y sin SDK de Microsoft; las solicitudes se hacen con `fetch` y OAuth. En modo `file` se lee el `.xlsx` indicado por `EXTERNAL_WORKBOOK_PATH` con ExcelJS, reutilizando `imports/excel-parser.ts`, sin Graph, suscripción ni webhook.
- En modo `graph`, la lectura prioriza `EXTERNAL_DATA_TABLE_NAME`; si no está o no existe, usa la primera tabla. Sin tablas, usa `EXTERNAL_DATA_WORKSHEET_NAME` o la primera hoja sobre el rango usado. En modo `file` usa la hoja configurada o la primera del archivo local. Los encabezados se normalizan y se mapean con los alias anuales existentes o con un JSON explícito en `EXTERNAL_DATA_COLUMN_MAP`.
- `ExternalAnnualMapperService` reutiliza normalizadores de `annual-updates`, omite filas inválidas, deduplica por `codeNormalized` conservando el año/fecha más reciente y trata `N/A`, `NA`, `no aplica`, `sin fecha`, `sin dato`, `-` y `--` como vacío mediante `common/utils/annual-values.ts`.
- `ExternalDataCacheService` guarda el snapshot y el estado solo en memoria. Publica `ReplaySubject<ExternalStreamEvent>` con eventos `status`, `updated` y `error`. Si falla una recarga posterior, conserva el último snapshot y marca `stale`/`degraded`; si nunca hubo snapshot, marca `error`.
- Endpoints: `GET /external-data`, `/summary`, `/updates-due`, `/status` y `/events` (SSE), más `POST /refresh`, todos autenticados. El webhook `GET|POST /external-data/webhook` es público solo para Graph: el `GET` devuelve `validationToken` y el `POST` valida `clientState`, deduplica notificaciones y aplica debounce antes de recargar. En modo `file` el webhook no se registra.
- El cliente React usa un hook con `fetch` streaming y header `Authorization` para SSE; `EventSource` no se usa porque no permite enviar el JWT. El badge muestra conexión, frescura, última actualización y error, y ofrece sincronización manual.
- Las notificaciones de cambio no traen celdas: cada evento dispara una lectura completa del libro. En modo `graph`, `ExternalSubscriptionService` crea/renueva la suscripción con expiración de dos días, renovación cada hora y ventana de seis horas. En modo `file` la suscripción queda `disabled`; `ExternalPollingService` recarga según `EXTERNAL_FALLBACK_POLL_MS` (60 s por defecto) y también existe sincronización manual.
- `EXTERNAL_DATA_ENABLED` es `false` por defecto. En modo `graph` se requieren credenciales de solo lectura (`Files.Read.All`, `Sites.Read.All` o `Sites.Selected` según el tenant), URLs/IDs del libro, URL pública base de la API y `clientState` de al menos 16 caracteres. En modo `file` solo se requiere `EXTERNAL_WORKBOOK_PATH` y no se usan credenciales de Microsoft. Graph queda pendiente de consentimiento de administrador.
- Verificado con 73 pruebas unitarias en 20 archivos, build y lint en backend y frontend. El modo local se validó con `FR-SG-79`: 637 registros, 0 errores de mapeo y estado `connected`/`fresh`. Graph queda pendiente de consentimiento de administrador y de un webhook HTTPS público.

### Workbook de seguimiento de Colocadores

- FR-SG-81 se lee y se escribe desde `EXTERNAL_COLOCADORES_WORKBOOK_PATH` con la hoja `EXTERNAL_COLOCADORES_WORKSHEET_NAME`, igual que Arriendos usa su ruta local. Participan las filas con `Seguimiento Si/No = Si` y las que tienen `Estado = ARCHIVED`, para que una archivada no desaparezca aunque su seguimiento pase a `No`.
- `POST /counterparties/sync-colocadores` prepara en el archivo local las columnas `ID Unico`, `Estado`, `Fecha Ultima Evaluacion`, `Fecha Proximo Seguimiento`, `Resultado Evaluacion` y `Fecha Archivado`, y asigna IDs estables. El sync no crea contrapartes en PostgreSQL.
- No se usan `itemId`, `driveId`, credenciales ni permisos de Microsoft Graph para Colocadores: el destino de escritura es el mismo `.xlsx` local sincronizado.
- `POST /counterparties/:id/risk-evaluation` y `POST /counterparties/:id/reactivate` escriben celdas del workbook local con ExcelJS y devuelven el detalle derivado del propio Excel. Además de estado, decisión, fechas y observaciones, actualizan `Seguimiento Si/No`: archivar escribe `No`; continuar o reactivar escriben `Si`. La interfaz no confirma la operación si falla la escritura del archivo.
- Los estados mostrados son `Al día`, `Revisada`, `Vencida` y `Archivada`. El próximo seguimiento se calcula a 6 meses desde la evaluación o reactivación.

### Dashboard (Fase 8)

- `GET /dashboard/summary` (autenticado) devuelve la fecha de corte en `America/Bogota`, el total de contrapartes activas y archivadas, los conteos del calendario (`overdue`, `pending`, `upcoming`, `onTime`, `unscheduled`), los seguimientos en borrador y finalizados en el mes, y los subprocesos activos.
- Los conteos del calendario se calculan con las mismas reglas del listado de contrapartes y suman el total de contrapartes activas; las archivadas se excluyen.
- `GET /dashboard/attention` (autenticado) lista contrapartes activas vencidas, pendientes 0–15 días o sin programar, ordenadas por `nextFollowUpDate` ascendente y dejando las sin programar al final. Devuelve `calendarStatus`, `daysUntilFollowUp` y paginación (`page`, `pageSize`, máximo 50).
- El inicio (`/`) muestra seis indicadores enlazados al listado filtrado, una tabla paginada de contrapartes que requieren atención, el resumen operativo, la distribución del calendario y los accesos rápidos. Los indicadores se actualizan manualmente desde el botón “Actualizar”.
- El listado de contrapartes acepta `status` y `calendarStatus` por URL para abrir los filtros desde el dashboard.
- Verificado con build/lint en backend y frontend y contra la API real con contrapartes en todos los rangos, una archivada, una sin programar, un borrador y un seguimiento finalizado. El backend ejecuta 19 pruebas unitarias, incluidas las del dashboard.

### Pruebas y seguridad (Fase 9)

- `GET /audit` (solo ADMIN) devuelve el historial paginado con filtros por entidad, acción y usuario. `pageSize` es 20 por defecto y 100 como máximo. La pantalla `/auditoria` muestra usuario, acción, entidad, fecha y detalle JSON expandible.
- `src/app.setup.ts` centraliza la configuración de la aplicación: prefijo `/api`, Helmet, CORS restringido a `CORS_ORIGIN`, `ValidationPipe` global y filtro global de excepciones. `main.ts` y las pruebas E2E usan la misma configuración.
- `AllExceptionsFilter` normaliza las respuestas de error a `{ statusCode, message, error, timestamp, path }`. Conserva los mensajes de las excepciones HTTP, evita exponer detalles internos en errores 500 y registra estos últimos en el log.
- Se eliminó el fallback de CORS permisivo: si no hay orígenes configurados, CORS no se habilita. Los orígenes no permitidos no reciben cabecera `Access-Control-Allow-Origin`.
- Las pruebas E2E son permanentes y no crean datos de negocio de prueba: salud y cabeceras de seguridad, CORS permitido/rechazado, errores normalizados, credenciales inválidas, dashboard, validación de parámetros, auditoría ADMIN y rutas no encontradas. Requieren PostgreSQL, migraciones aplicadas y el administrador creado por el seed; al iniciar la aplicación se ejecuta la generación idempotente de notificaciones.
- Verificado con 29 pruebas unitarias en 10 archivos, 9 pruebas E2E, build y lint en backend y frontend. La suite E2E se ejecuta con `npm run test:e2e`.
- Riesgo residual de dependencias: `npm audit` reporta 3 avisos altos y 2 moderados transitivos en el backend (CLI de Prisma y ExcelJS). No hay corrección compatible sin un cambio mayor de Prisma o un downgrade de ExcelJS; el frontend no reporta vulnerabilidades.

### Despliegue (Fase 10)

- Topología Docker: PostgreSQL sin puerto publicado, tarea `migrate` de una sola ejecución, API NestJS interna y Nginx con el frontend compilado publicado en `APP_PORT` (8080 por defecto).
- `migrate` ejecuta `prisma migrate deploy` y el seed idempotente antes de que arranque la API; `backend` espera a PostgreSQL y a que la migración termine correctamente.
- El frontend se compila con `VITE_API_URL=/api`; Nginx sirve la SPA, aplica cabeceras de seguridad y CSP, limita cargas a 30 MB y hace proxy de `/api/` hacia `backend:3000`. Frontend y API comparten origen, por lo que CORS queda deshabilitado con `CORS_ORIGIN` vacío.
- `TRUST_PROXY` configura los saltos de proxy confiables para que el límite de solicitudes use la IP real: 1 con el Nginx del compose, 2 si hay un proxy TLS adicional.
- Los datos persisten en los volúmenes `postgres_data` y `uploads_data`. `deploy/backup.sh` genera un dump custom de PostgreSQL y un tar de adjuntos con retención configurable.
- NestJS Observe está integrado mediante `createObserveModule`; solo se activa con `NODE_ENV=production` y ambas claves configuradas. Se desactiva el contexto de código fuente y no se reenvían cuerpos de solicitud ni logs.
- Verificado localmente: build de producción del backend con source maps, arranque con `node --enable-source-maps`, salud, login ADMIN, dashboard, auditoría y notificaciones 200; build del frontend con `/api` y rutas `/` y `/auditoria` 200 en la vista previa. La base quedó limpia y ambos procesos se detuvieron.
- Pendiente de ejecución: construir y arrancar los contenedores, configurar dominio/TLS, ejecutar un respaldo real y conectar las claves de Observe. Docker no está instalado en el equipo de desarrollo.

## 3. Estructura del repositorio

```
/seguimiento-contrapartes
  /backend
    /prisma              esquema y migraciones
    /src
      /auth              login, JWT, guards
      /users             administración de usuarios
      /subprocesses      catálogo de subprocesos
      /counterparties    contrapartes, archivo y reactivación
      /follow-ups        seguimientos y finalización
      /documents         carga y descarga de soportes
       /notifications     alertas semestrales y tarea diaria
        /annual-notifications recordatorios anuales y tarea diaria
       /external-data     libro externo, Graph, caché, webhook, polling y SSE
       /imports           importación de Excel
      /dashboard         indicadores y contrapartes por atender
      /audit             historial de acciones
      /prisma            PrismaService/PrismaModule
      /common            guards, decoradores, filtros, utilidades
      /config            configuración validada por entorno
  /frontend
    /src
      /components  /pages  /layouts  /services
      /hooks       /types  /utils    /routes
    Dockerfile            build y Nginx de producción
    nginx.conf            SPA, proxy /api y cabeceras
  /deploy
    backup.sh             respaldo de PostgreSQL y adjuntos
  /uploads               documentos cargados (no públicos)
  /docs                  documentación
  docker-compose.yml     PostgreSQL de desarrollo
  docker-compose.prod.yml
  .env.example
  .env.production.example
  README.md
```

## 4. Arquitectura

- **Frontend**: SPA React + Vite + TypeScript + Tailwind CSS + Lucide + React Router + Axios + React Hook Form + Zod. Consume la API REST y no contiene reglas de negocio.
- **Backend**: NestJS + TypeScript estricto, API REST bajo el prefijo `/api`, validación con DTOs (`class-validator`/`class-transformer`), Prisma ORM y PostgreSQL como única base de datos.
- **Archivos**: Multer guarda los documentos en `uploads/` con nombre UUID. No se sirven como estáticos: se descargan por un endpoint autenticado.
- **Datos externos**: la fuente anual de Arriendos se lee de un único libro, con Microsoft Graph o desde un `.xlsx` local; el snapshot vive solo en memoria y se publica por SSE autenticado. El webhook (solo Graph) y el polling solo disparan recargas; ese flujo nunca escribe en el libro ni transfiere datos hacia o desde PostgreSQL. El seguimiento de Colocadores usa FR-SG-81 como fuente de lectura y destino de escritura en el `.xlsx` local; no usa Graph ni escribe observaciones, estados ni fechas en PostgreSQL.
- **Autenticación**: JWT de acceso (8 h por defecto) + bcrypt para contraseñas. Un guard valida el token y consulta el usuario para verificar que siga activo.
- **Notificaciones**: tabla global + tabla de lecturas por usuario. Tarea diaria con `@nestjs/schedule`.
- **Fechas**: se almacenan como `date` (sin hora) y se calculan con la zona `America/Bogota`.
- **Despliegue**: contenedores Linux; Nginx sirve la SPA y actúa como proxy same-origin de `/api`. PostgreSQL y la API no se publican al host. Las migraciones y el seed corren como tarea previa. La telemetría de producción usa NestJS Observe.

## 5. Módulos del backend

| Módulo | Responsabilidad |
|---|---|
| `auth` | Login, emisión/validación de JWT, `JwtAuthGuard`, `RolesGuard` |
| `users` | CRUD de usuarios, activación/desactivación, roles (solo ADMIN) |
| `subprocesses` | Catálogo administrado; lectura para todos, escritura solo ADMIN |
| `counterparties` | CRUD, búsqueda/filtros, archivo, reactivación, detalle |
| `follow-ups` | Registro de seguimientos, borrador, finalización, cálculo semestral |
| `documents` | Carga con Multer y descarga autenticada |
| `notifications` | Generación diaria, listado y lectura por usuario de alertas semestrales |
| `annual-notifications` | Generación diaria, listado y lectura por usuario de recordatorios anuales |
| `imports` | Carga de Excel, mapeo de columnas, vista previa y confirmación transaccional |
| `annual-updates` | Base anual independiente: importación por código, conteos, consulta y vencimientos |
| `external-data` | Lectura de libro único vía Graph o archivo local, caché en memoria, webhook, polling, REST y SSE para la pantalla anual; lectura y escritura local de FR-SG-81 para Colocadores |
| `dashboard` | Indicadores del calendario y listado paginado de contrapartes por atender |
| `audit` | Registro y consulta del historial de acciones |
| `prisma` | Cliente Prisma y ciclo de vida de la conexión |
| `common` | Decoradores (`@CurrentUser`, `@Roles`), guards, filtro de excepciones, utilidades de fechas y NIT |

## 6. Modelo de datos

Definido en `backend/prisma/schema.prisma`.

| Modelo | Claves y restricciones |
|---|---|
| `User` | `email` único; `role` ADMIN/ANALYST; `active`; nunca se guarda contraseña en claro |
| `Subprocess` | `name` único; `active` |
| `Counterparty` | `nit` único y `nitNormalized` único; una sola relación `subprocessId`; `status` ACTIVE/ARCHIVED; fechas `last/nextFollowUpDate`; datos de archivo y reactivación con usuario y justificación |
| `FollowUp` | Pertenece a una contraparte; `performedAt`, responsable, resultado, observaciones, `status` DRAFT/FINALIZED; no se sobrescribe |
| `Document` | Pertenece a un seguimiento; nombre original, nombre almacenado, MIME, tamaño y ruta |
| `Notification` | Única por `(counterpartyId, type, scheduledDate)`; no se generan para archivadas |
| `NotificationRead` | Clave compuesta `(notificationId, userId)` para el contador individual |
| `AnnualNotification` | Única por `(annualCounterpartyId, type, scheduledDate)`; tipos `ANNUAL_D3` y `ANNUAL_D1` (los antiguos se conservan solo para historial) |
| `AnnualNotificationRead` | Clave compuesta `(annualNotificationId, userId)` para el contador individual |
| `ImportBatch` | Archivo(s), usuario, conteos, estado, mapeo y datos de vista previa |
| `AnnualCounterparty` | `codeNormalized` único; estado ACTIVE/INACTIVE; seguimiento opcional Sí/No/vacío; fecha de diligenciamiento, año, tipo de debida diligencia y observaciones; archivo de origen |
| `AuditLog` | Usuario, acción, entidad, id afectado, detalle y fecha |

Reglas de integridad:

- No hay borrado en cascada sobre contrapartes, seguimientos ni documentos (`Restrict`). El archivo es lógico.
- Las lecturas de notificaciones pueden eliminarse con su notificación (`Cascade`), ya que no son historial de negocio.
- `nitNormalized` evita duplicados cuando el mismo NIT llega con puntos, espacios o guiones; el valor original se conserva para visualización.

## 7. Roles y permisos

| Acción | ADMIN | ANALYST |
|---|---|---|
| Iniciar/cerrar sesión | Sí | Sí |
| Administrar usuarios y roles | Sí | No |
| Importar Excel | Sí | No |
| Importar base anual | Sí | No |
| Consultar actualización anual | Sí | Sí |
| Crear/editar contrapartes | Sí | No |
| Archivar y reactivar contrapartes | Sí | No |
| Consultar contrapartes e historial | Sí | Sí |
| Registrar y finalizar seguimientos | Sí | Sí |
| Adjuntar documentos | Sí | Sí |
| Consultar notificaciones | Sí | Sí |
| Consultar auditoría | Sí | No |

## 8. Reglas de negocio implementadas por diseño

1. Una contraparte = un NIT = un subproceso = un calendario = un historial.
2. El NIT se valida y normaliza para unicidad; el valor original no se altera.
3. Si un NIT aparece con otro subproceso, se reporta como conflicto y **no** se asigna automáticamente.
4. Archivar es lógico: conserva datos, seguimientos, documentos e historial y detiene notificaciones.
5. Reactivar conserva todo el historial y exige justificación y nueva fecha de seguimiento cuando corresponda.
6. Los seguimientos son inmutables una vez finalizados; los borradores no reinician el calendario.
7. El próximo seguimiento solo se calcula al **finalizar** un seguimiento.
8. Las importaciones nunca escriben ni sobrescriben seguimientos; las diferencias de fechas requieren autorización explícita.
9. La actualización anual es independiente del seguimiento semestral: usa código único, genera alertas anuales propias y no modifica el calendario.
10. Toda acción crítica registra usuario y fecha en `AuditLog`.

## 9. Fechas y estados

- Zona de negocio: `America/Bogota`.
- Almacenamiento: `date` sin hora; internamente se usa medianoche UTC para evitar corrimientos por zona horaria.
- Cálculo semestral centralizado: `addMonths(date, 6)` con ajuste al último día del mes cuando el día no existe (p. ej. 31/08 → 28/02 o 29/02 en bisiesto).
- Estados de calendario de la contraparte (calculados, no almacenados):

| Estado | Regla |
|---|---|
| Vencido | `nextFollowUpDate < hoy` |
| Pendiente | faltan de 0 a 15 días |
| Próximo | faltan de 16 a 30 días |
| Al día | faltan más de 30 días |
| Sin programar | activa sin `nextFollowUpDate` |

- Estados del registro de seguimiento: `DRAFT` ("En proceso") y `FINALIZED` ("Finalizado"). "Al día", "Próximo", "Pendiente" y "Vencido" pertenecen al calendario, no al registro histórico.
- El indicador "Seguimientos pendientes" del dashboard cuenta contrapartes activas en el rango 0–15 días. La tabla "Requieren atención" incluye además las vencidas y las activas sin programar.

## 10. Notificaciones

- Tipos: `D30` (16–30 días antes), `D15` (1–15 días antes), `DUE` (fecha de vencimiento) y `OVERDUE` (vencida).
- Generación al iniciar la aplicación y tarea diaria a las 07:00 de Bogotá (`SCHEDULE_NOTIFICATIONS_CRON`); también es segura si se ejecuta varias veces.
- Restricción única `(counterpartyId, type, scheduledDate)` para no duplicar alertas.
- `scheduledDate` corresponde a la fecha de próximo seguimiento que originó la alerta.
- Solo contrapartes `ACTIVE`; las archivadas se excluyen.
- Las notificaciones son globales; el contador de no leídas y la marca de lectura son por usuario (`NotificationRead`).
- La campana de la barra superior muestra el contador y el listado; consulta al iniciar, cada 60 segundos y al abrirse, permite marcar como leída y navega a la contraparte.

### Notificaciones anuales (independientes)

- Tipos: `ANNUAL_D3` (3–2 días antes) y `ANNUAL_D1` (1–0 días antes). No se crean alertas nuevas para fechas vencidas.
- Solo contrapartes anuales `ACTIVE` con `filingDate` desde el año anterior (`currentYear - 1`; 2025 en este corte). La fecha límite es `filingDate + 1 año`, ajustando el 29 de febrero al 28.
- Generación al iniciar la aplicación, tarea diaria separada y nueva generación tras confirmar la importación anual; `skipDuplicates` evita duplicados.
- `GET /annual-notifications` y `PATCH /annual-notifications/:id/read` usan `AnnualNotification` y `AnnualNotificationRead`, sin mezclarse con `Notification`/`NotificationRead`.
- La campana fusiona ambos orígenes por fecha de creación, suma los contadores no leídos y dirige las alertas anuales a `/actualizacion-anual?code=...`.

## 11. Importación Excel

- Formatos aceptados: `.xlsx` y `.xlsm`. Los `.xls` antiguos se rechazan con un mensaje que solicita convertirlos a `.xlsx` (ExcelJS no los lee).
- Límites: 10 archivos, 10 MB por archivo, 25 MB en total y 5000 filas por lote.
- Un lote (`ImportBatch`) puede contener varios archivos; cada fila conserva archivo, hoja y número de fila de origen. Los encabezados se buscan en las primeras filas y se normalizan para sugerir el mapeo.
- Flujo:
  1. Carga multipart y lectura de hojas/encabezados.
  2. Detección automática de columnas por alias y **mapeo editable** por el usuario.
  3. Vista previa con conteos y errores: NIT vacío, razón social vacía, subproceso no identificado, fechas inválidas, NIT repetido en archivo, NIT existente, conflicto de subproceso y duplicados entre archivos.
  4. Confirmación explícita (no se guarda nada antes).
  5. Consolidación transaccional:
     - NIT nuevo → crear contraparte.
     - NIT existente con el mismo subproceso → existente, sin duplicar.
     - NIT existente con otro subproceso → conflicto, se omite y se reporta.
     - Fechas existentes → no se modifican sin autorización explícita; se muestran diferencias.
     - Subprocesos faltantes → solo se crean con `createMissingSubprocesses`.
  6. Resumen y registro en `ImportBatch` + `AuditLog`.
- Estados de lote: `PREVIEW`, `CONFIRMED` y `FAILED`. Estados de fila: `NEW`, `EXISTING`, `CONFLICT` y `ERROR`.
- El resumen de confirmación es `{ created, existing, updatedDates, conflicts, errors, createdSubprocesses }`; `importedRows` corresponde a las contrapartes creadas y `errors` excluye los conflictos.
- La vista previa se guarda en `ImportBatch` para que la confirmación no dependa de volver a subir el archivo. Al confirmar se persiste también la validación final con el mapeo y las opciones realmente aplicados. Cambiar el mapeo o las opciones exige volver a validar en la interfaz.
- Se registran `IMPORT_UPLOADED` e `IMPORT_CONFIRMED`; si hubo creaciones o actualizaciones de fechas, se ejecuta la generación de notificaciones. Un fallo de auditoría posterior a la transacción se registra en el log, pero no revierte ni marca como fallida una importación ya confirmada.
- La pantalla `/importar` (solo ADMIN) cubre carga, mapeo, vista previa, confirmación e historial paginado. Si la confirmación falla, la pantalla refresca el estado del lote.

## 12. API

Prefijo `/api`. API implementada: autenticación y usuarios (`POST /auth/login`, `GET /auth/me`, `GET/POST /users`, `PATCH /users/:id`, `PATCH /users/:id/status`), subprocesos (`GET/POST/PATCH /subprocesses`), contrapartes (`GET /counterparties`, `GET /counterparties/:id`, `POST /counterparties`, `PATCH /counterparties/:id`, `POST /counterparties/:id/archive`, `POST /counterparties/:id/reactivate`), seguimientos (`GET/POST /counterparties/:id/follow-ups`, `PATCH /follow-ups/:id`, `POST /follow-ups/:id/finalize`), documentos (`POST /follow-ups/:id/documents`, `GET /documents/:id/download`), notificaciones (`GET /notifications`, `PATCH /notifications/:id/read`), importaciones (`POST /imports/upload`, `GET /imports`, `GET /imports/:id`, `POST /imports/:id/preview`, `POST /imports/:id/confirm`), actualización anual (`GET /annual-updates/summary`, `GET /annual-updates`, `GET /annual-updates/updates-due`, `POST /annual-updates/import/preview`, `POST /annual-updates/import/confirm`), notificaciones anuales (`GET /annual-notifications`, `PATCH /annual-notifications/:id/read`), dashboard (`GET /dashboard/summary`, `GET /dashboard/attention`) y auditoría (`GET /audit`). Todas las rutas salvo el login requieren JWT.

| Método y ruta | Rol | Uso |
|---|---|---|
| `POST /auth/login` | Público | Inicio de sesión |
| `GET /auth/me` | Autenticado | Usuario actual |
| `GET/POST/PATCH /users` | ADMIN | Administración de usuarios |
| `PATCH /users/:id/status` | ADMIN | Activar/desactivar |
| `GET/POST/PATCH /subprocesses` | Lectura auth / escritura ADMIN | Catálogo |
| `GET /counterparties` | Auth | Listado con búsqueda, filtros y paginación |
| `POST /counterparties` | ADMIN | Crear |
| `GET /counterparties/:id` | Auth | Detalle con historial |
| `PATCH /counterparties/:id` | ADMIN | Editar |
| `POST /counterparties/:id/archive` | ADMIN | Archivar con justificación |
| `POST /counterparties/:id/reactivate` | ADMIN | Reactivar con justificación |
| `GET/POST /counterparties/:id/follow-ups` | Auth | Historial y registro |
| `PATCH /follow-ups/:id` | Autor/ADMIN | Editar borrador |
| `POST /follow-ups/:id/finalize` | Autor/ADMIN | Finalizar y recalcular fecha |
| `POST /follow-ups/:id/documents` | Auth | Adjuntar soporte |
| `GET /documents/:id/download` | Auth | Descargar soporte |
| `GET /notifications` | Auth | Listado y contador |
| `PATCH /notifications/:id/read` | Auth | Marcar leída |
| `GET /annual-notifications` | Auth | Listado anual y contador |
| `PATCH /annual-notifications/:id/read` | Auth | Marcar recordatorio anual leído |
| `POST /imports/upload` | ADMIN | Subir y leer Excel |
| `POST /imports/:id/preview` | ADMIN | Mapear y validar |
| `POST /imports/:id/confirm` | ADMIN | Confirmar importación |
| `GET /imports` | ADMIN | Historial de importaciones |
| `GET /imports/:id` | ADMIN | Detalle y vista previa guardada |
| `GET /annual-updates/summary` | Auth | Conteos de actualización anual |
| `GET /annual-updates` | Auth | Listado y filtros anuales |
| `GET /annual-updates/updates-due` | Auth | Vencidas, de hoy, próximas y sin fecha |
| `POST /annual-updates/import/preview` | ADMIN | Mapear y validar base anual |
| `POST /annual-updates/import/confirm` | ADMIN | Confirmar base anual |
| `GET /dashboard/summary` | Auth | Indicadores |
| `GET /dashboard/attention` | Auth | Contrapartes que requieren atención |
| `GET /audit` | ADMIN | Historial de acciones |

## 13. Seguridad y trazabilidad

- Contraseñas con bcrypt (costo configurable, 12 por defecto) y nunca devueltas por la API.
- JWT firmado con secreto de entorno; el guard verifica usuario existente y activo en cada solicitud.
- Roles con `RolesGuard` y decorador `@Roles`; el backend es la fuente de verdad (el frontend solo oculta opciones).
- Validación global con `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted`, `transform`).
- Carga de archivos: extensión y MIME permitidos, tamaño máximo configurable, nombre almacenado UUID.
- Descarga de documentos solo con JWT; sin exposición pública del directorio `uploads/`.
- Filtro global de excepciones: respuestas uniformes con `statusCode`, `message`, `error`, `timestamp` y `path`; los errores no controlados responden 500 sin trazas ni detalles internos y se registran en el log.
- Helmet aplica cabeceras de seguridad a la API; CORS solo permite los orígenes configurados en `CORS_ORIGIN`.
- Nginx aplica CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy` al frontend.
- `TRUST_PROXY` configura los saltos de proxy confiables para que Express obtenga la IP real desde `X-Forwarded-For`; en el compose la API no está expuesta directamente.
- Límite de solicitudes: 100/minuto global y 5 intentos de login/minuto por IP.
- `AuditLog` registra creación/edición de subprocesos, creación/edición/archivo/reactivación de contrapartes, creación/edición/finalización de seguimientos, carga de documentos, importaciones, importación de la base anual y creación, edición, activación y desactivación de usuarios. No registra contraseñas ni tokens.
- La consulta de auditoría está restringida a ADMIN y no expone datos sensibles; `details` contiene únicamente la información funcional registrada por cada acción.
- NestJS Observe solo se activa en producción con `OBSERVE_APP_KEY` y `OBSERVE_APP_SECRET`; se desactiva el contexto de código fuente y no se reenvían logs ni cuerpos de solicitud. Las claves se inyectan por entorno, no se versionan.

## 14. Frontend

Rutas implementadas: `/login`, `/` (dashboard), `/usuarios` (solo ADMIN), `/subprocesos` (solo ADMIN), `/importar` (solo ADMIN), `/auditoria` (solo ADMIN), `/contrapartes`, `/contrapartes/:id` y `/actualizacion-anual` (autenticados). Las notificaciones se consultan desde la campana de la barra superior; los seguimientos se gestionan dentro del detalle de la contraparte.

- Login con correo y contraseña, cierre de sesión y restauración de la sesión desde el token.
- El inicio muestra el dashboard con indicadores, tabla de contrapartes que requieren atención, resumen operativo, distribución del calendario y accesos rápidos. Los indicadores enlazan al listado con el filtro de calendario correspondiente.
- Catálogo de subprocesos y listado/detalle de contrapartes con búsqueda, filtros, paginación y acciones de archivo/reactivación.
- En `/contrapartes/:id` se registran y editan borradores, se finalizan seguimientos y se adjuntan o descargan documentos.
- En `/importar` se cargan archivos, se ajusta el mapeo, se valida la vista previa, se confirma el lote y se consulta el historial paginado.
- En `/actualizacion-anual` se consultan los conteos anuales, el apartado de vencimientos y el listado filtrable; los ADMIN cargan la base, validan y confirman sin ajustar mapeo. La importación vuelve a generar los recordatorios anuales del día.
- En `/auditoria` se consultan las acciones registradas con filtros por entidad, acción y usuario, paginación y detalle expandible.
- Rutas protegidas; `/usuarios`, `/subprocesos`, `/importar` y `/auditoria` redirigen al inicio si el usuario no es ADMIN.
- Layout autenticado con barra lateral, barra superior (campana de notificaciones, usuario y cierre de sesión) y menú según el rol.
- Componentes reutilizables: tabla, paginación, filtros, badges de estado, modal, diálogo de confirmación, toasts, estados vacíos y de carga.
- Formularios con React Hook Form + Zod; los mismos campos se validan en el backend.
- Axios con interceptor que adjunta el token y redirige al login ante `401`.
- Paleta sobria, interfaz completamente en español, diseño adaptable.
- En producción, el build usa `VITE_API_URL=/api` y Nginx sirve la SPA con respaldo a `index.html`; frontend y API comparten origen.

## 15. Decisiones confirmadas con el usuario

1. Monorepo con `/backend` y `/frontend`.
2. Catálogo de subprocesos administrado por ADMIN; en importaciones los nuevos se crean solo con confirmación.
3. Notificaciones globales con lectura individual por usuario.
4. Archivar y reactivar: solo ADMIN.
5. Umbrales: Vencido `< hoy`; Pendiente 0–15 días; Próximo 16–30 días; Al día `> 30 días`.
6. Git instalado; Docker no instalado (se deja `docker-compose.yml` preparado).
7. La actualización anual es un proceso independiente del seguimiento semestral: genera alertas anuales propias y usa código único de punto de venta; guarda fecha de diligenciamiento, año, tipo de debida diligencia, seguimiento y observaciones, y conserva la marca de seguimiento para consulta.

## 16. Definiciones pendientes de confirmación

Ninguna de estas decisiones se implementará de forma que altere datos sin confirmación:

1. Listado inicial de subprocesos (nombres exactos del área).
2. Archivos Excel reales de muestra para calibrar alias y mapeo de columnas.
3. Validación estricta del dígito de verificación del NIT (se propone formato numérico de 6 a 15 dígitos, sin exigir dígito de verificación).
4. Política de contraseñas (se propone mínimo 8 caracteres, al menos una letra y un número).
5. Límite de tamaño de adjuntos (se propone 10 MB).
6. Edición de borradores: se propone autor del registro o ADMIN.
7. Confirmación de que ANALYST no crea ni edita contrapartes (según la matriz de roles del documento).
8. Confirmación de si se permite adjuntar documentos a seguimientos finalizados (se implementó permitido, sin modificar el contenido del seguimiento).

## 17. Riesgos

- `bcrypt` es un módulo nativo; se verificó su carga y funcionamiento en Windows con el binario de `bcrypt@6.0.0`.
- Prisma 6.19.3 con el scaffold ESM de Nest 12 se verificó con build, generación del cliente y conexión real a PostgreSQL.
- Los Excel reales pueden variar; el mapeo editable mitiga el riesgo en el módulo semestral, pero se requiere una muestra. En la base anual los alias automáticos cubren los encabezados FR-SG reales y el estado se reconoce como A/I.
- La base anual no crea registros en el seguimiento semestral; si el área espera ese enlace, debe definirse una regla de sincronización explícita.
- PostgreSQL local ocupa el puerto 5432; Docker Compose usa el mismo puerto por defecto. Se debe detener el servicio local o cambiar `POSTGRES_PORT`.
- La lógica de fechas tiene pruebas de zona horaria y de fin de mes/año bisiesto; aun así debe validarse con los archivos y datos reales antes de la puesta en producción.
- Docker no está instalado; los `Dockerfile`, `docker-compose.prod.yml` y el respaldo no se ejecutaron localmente. La sintaxis YAML y del script se validó, pero el primer despliegue debe hacerse en un entorno de pruebas.
- HTTPS, dominio, certificados, retención real de respaldos y claves de Observe dependen del servidor definitivo.
- `npm audit` reporta 3 avisos altos y 2 moderados transitivos en el backend: `deepmerge-ts` a través del CLI de Prisma (solo se corrige con Prisma 7, un cambio mayor) y `uuid` a través de ExcelJS 4.4.0 (última versión; el arreglo sugerido es un downgrade). No se aplicó `npm audit fix --force`. Mitigación actual: Prisma CLI no se ejecuta en runtime, ExcelJS se usa solo para lectura de archivos validados y la ruta vulnerable de `uuid` no se emplea en ese flujo. El frontend no reporta vulnerabilidades.

## 18. Decisiones pendientes de despliegue

1. Servidor u hosting definitivo, dominio público y método de TLS (proxy corporativo, Caddy o certificados administrados).
2. Retención de respaldos, frecuencia y destino externo; definir RPO/RTO.
3. Plan de NestJS Observe, propietario de las claves y responsable de atender alertas.
4. Si el frontend y la API quedarán en el mismo dominio (recomendado) o en orígenes separados; en el segundo caso debe configurarse `CORS_ORIGIN`.
