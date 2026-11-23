# SEGUIMIENTO DE CONTRAPARTES

Aplicativo web del área de Cumplimiento para centralizar contrapartes que hoy se administran en archivos Excel, controlar el seguimiento semestral, registrar los seguimientos realizados por los funcionarios y conservar el historial completo.

El sistema **no** realiza debida diligencia, consultas en listas restrictivas, verificaciones documentales ni análisis de riesgo automáticos. Esas actividades las realizan las personas del área; el aplicativo controla fechas, almacena resultados y genera recordatorios internos.

## Estado del proyecto

| Fase | Estado |
|---|---|
| 1. Análisis, arquitectura y estructura | Completada |
| 2. Configuración del entorno | Completada |
| 3. Autenticación y usuarios | Completada |
| 4. Contrapartes | Completada |
| 5. Seguimientos | Completada |
| 6. Notificaciones | Completada |
| 7. Importación Excel | Completada |
| 8. Dashboard | Completada |
| 9. Pruebas y seguridad | Completada |
| 10. Despliegue | Preparada (ejecución pendiente en servidor) |
| Actualización anual (módulo adicional) | Completada |
| Fuente anual externa (Microsoft Graph o archivo local, webhook y SSE) | Implementada; modo local activo y Graph pendiente de consentimiento |

Las fases 3 a 9 incorporan inicio de sesión con JWT, administración de usuarios (solo ADMIN), catálogo de subprocesos, gestión de contrapartes, seguimientos, documentos de soporte, notificaciones de vencimiento, importación de Excel, dashboard de indicadores y consulta de auditoría (solo ADMIN). La Fase 10 deja preparados los contenedores, la migración, los respaldos y la telemetría para ejecutarse en un servidor. El módulo adicional de actualización anual es independiente del seguimiento semestral y genera alertas anuales propias. No se incluyen datos ficticios.

## Documentación

- [Arquitectura y decisiones técnicas](docs/ARCHITECTURE.md)

## Estructura

```
backend/                API NestJS + Prisma
frontend/               Aplicación React + Vite
uploads/                Documentos adjuntos (acceso autenticado)
deploy/                 Respaldo de PostgreSQL y adjuntos
docs/                   Documentación
docker-compose.yml      PostgreSQL de desarrollo
docker-compose.prod.yml Despliegue completo
.env.example
.env.production.example
```

## Requisitos

- Node.js 24 o superior
- npm 11 o superior
- PostgreSQL 17
- Git
- Docker con Compose (opcional para desarrollo; necesario para el despliegue con `docker-compose.prod.yml`)

## Configuración y ejecución

1. Crear la base de datos:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres -h localhost seguimiento_contrapartes
```

2. Copiar las variables de entorno:

```powershell
Copy-Item .env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

3. Ajustar `backend/.env` (contraseña de PostgreSQL, `JWT_SECRET` y credenciales del usuario inicial).

4. Instalar dependencias y ejecutar:

```powershell
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev

cd ..\frontend
npm install
npm run dev
```

El seed crea el administrador definido por `SEED_ADMIN_*`. Es idempotente: si el correo ya existe, no lo duplica ni cambia su contraseña.

La URL de la API se configura en `frontend/.env` mediante `VITE_API_URL`. El frontend inicia en `/login`; al autenticarse muestra el layout y el menú permitido para el rol.

> En esta máquina la base de datos ya está creada y la migración inicial ya fue aplicada. En otro entorno, los comandos de Prisma crean el esquema.
>
> Docker no está instalado; `docker-compose.yml` queda preparado para cuando se use. El desarrollo actual utiliza PostgreSQL local en el puerto 5432.

## Despliegue productivo con Docker

La configuración de producción usa cuatro contenedores: PostgreSQL, una tarea de migración/seed, la API NestJS y Nginx con el frontend compilado. La base de datos y la API no publican puertos al host; solo el frontend queda accesible.

1. Copiar y completar el entorno productivo:

```powershell
Copy-Item .env.production.example .env.production
```

Reemplace `CAMBIAR_*` y configure `SEED_ADMIN_*`. Use una contraseña segura para PostgreSQL; si contiene caracteres especiales, codifíquela solo dentro de `DATABASE_URL`. Deje `CORS_ORIGIN` vacío cuando frontend y API compartan el mismo dominio; `TRUST_PROXY=1` corresponde a Nginx del compose y `2` si hay un proxy TLS adicional delante.

2. Construir y levantar (la migración y el seed se ejecutan antes de iniciar la API):

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

3. Verificar:

```powershell
curl.exe http://localhost:8080/healthz
curl.exe http://localhost:8080/api/health
```

El frontend queda en `http://localhost:8080` o en `APP_PORT`. Para producción real, publique únicamente el puerto del proxy TLS y mantenga `8080` en la red interna. El Nginx del compose sirve HTTP; el certificado, la redirección a HTTPS y HSTS deben configurarse en el proxy de borde (Caddy, Nginx corporativo o balanceador).

4. Operación:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

5. Respaldos: `bash deploy/backup.sh` genera un dump de PostgreSQL y un tar de `uploads/` en `backups/`, con retención de 14 días configurable. Programar diariamente en el servidor, por ejemplo con cron:

```cron
0 2 * * * cd /opt/seguimiento-contrapartes && ./deploy/backup.sh >> ./backups/backup.log 2>&1
```

Para restaurar, detener la API, restaurar el dump con `pg_restore --clean --if-exists`, extraer los adjuntos en el volumen `uploads_data` y volver a iniciar. Los respaldos deben copiarse fuera del servidor.

6. Telemetría: configure `OBSERVE_APP_KEY` y `OBSERVE_APP_SECRET` en `.env.production` y asigne `OBSERVE_SERVICE_VERSION` al identificador de la versión desplegada. Sin claves, el SDK queda desactivado y no envía nada.

## Verificación de la Fase 2

- `GET http://localhost:3000/api/health` responde `{"status":"ok","database":"connected"}`.
- CORS habilitado para `http://localhost:5173`.
- Migración inicial aplicada en `backend/prisma/migrations/20261103215320_init`.
- Las 9 tablas de negocio existen en PostgreSQL.
- `npm run build`, `npm run lint` y `npm test` pasan en el backend; el frontend pasa `npm run build` y `npm run lint`.

## Verificación de la Fase 3

- `POST /api/auth/login` responde con JWT y usuario; `GET /api/auth/me` devuelve el usuario autenticado.
- Credenciales incorrectas: 401; usuario inactivo: 403; acceso sin token: 401.
- `GET/POST /api/users`, `PATCH /api/users/:id` y `PATCH /api/users/:id/status` solo para ADMIN; un ANALYST recibe 403.
- La autodesactivación responde 400 y el último ADMIN activo está protegido.
- El frontend permite iniciar y cerrar sesión, restaura la sesión, protege las rutas y administra usuarios en `/usuarios`.
- Las respuestas de usuarios no incluyen `passwordHash`.

## Verificación de la Fase 4

- Catálogo de subprocesos en `/subprocesos` (solo ADMIN): creación, edición y activación/desactivación con nombre único.
- Listado de contrapartes en `/contrapartes` con búsqueda, filtros, paginación y detalle en `/contrapartes/:id`.
- Crear contraparte valida NIT único (normalizado), subproceso activo y fechas; si no se indica, el próximo seguimiento se programa a seis meses.
- Archivar y reactivar exigen justificación; reactivar permite programar una nueva fecha de seguimiento.
- ANALYST puede consultar; crear, editar, archivar y reactivar es solo ADMIN.
- `npm run build`, `npm run lint` y `npm test` pasan en el backend (12 pruebas); el frontend pasa build y lint. Flujos verificados contra la API real.
- El catálogo de subprocesos inicia vacío; el ADMIN debe crearlo antes de registrar contrapartes.

## Verificación de la Fase 5

- En `/contrapartes/:id` se listan los seguimientos con responsable, estado, resultado, observaciones y documentos.
- Se crean y editan borradores; solo el responsable o un ADMIN puede modificarlos. Cualquier usuario autenticado puede consultar el historial.
- Finalizar exige resultado, bloquea el registro y actualiza la contraparte: `lastFollowUpDate` es la fecha de realización y `nextFollowUpDate` se calcula a seis meses.
- Se adjuntan PDF, DOCX, XLSX y JPG de hasta 10 MB; la descarga es autenticada y conserva el nombre original.
- No se pueden crear ni modificar seguimientos de contrapartes archivadas.
- `npm run build`, `npm run lint` y `npm test` pasan en el backend (12 pruebas); el frontend pasa build y lint. Flujos verificados contra la API real.

## Verificación de la Fase 6

- La campana de la barra superior muestra las notificaciones y el contador de no leídas; se actualiza al iniciar, cada 60 segundos y al abrirse.
- Se generan alertas para contrapartes activas con próximo seguimiento: `D30` (16–30 días), `D15` (1–15 días), `DUE` (hoy) y `OVERDUE` (vencidas). Las archivadas se excluyen.
- La generación se ejecuta al iniciar la aplicación y a las 07:00 de Bogotá; es idempotente y no duplica alertas tras reinicios.
- Marcar como leída es idempotente y el estado es independiente por usuario.
- `npm run build`, `npm run lint` y `npm test` pasan en el backend; el frontend pasa build y lint. Flujos verificados contra la API real.

## Verificación de la Fase 7

- En `/importar` (solo ADMIN) se cargan uno o varios archivos `.xlsx`/`.xlsm`, se revisa y ajusta el mapeo de columnas y se genera una vista previa antes de confirmar.
- Se admiten hasta 10 archivos, 10 MB por archivo, 25 MB en total y 5000 filas; los `.xls` antiguos se rechazan con un mensaje para convertirlos a `.xlsx`.
- La vista previa reporta filas nuevas, existentes, conflictos y errores. La confirmación es transaccional y no guarda nada antes de la acción explícita.
- Crear subprocesos faltantes y actualizar fechas de contrapartes existentes requieren autorización explícita; los conflictos de subproceso y los NIT existentes nunca se sobrescriben automáticamente.
- El historial de importaciones queda disponible en `/importar` y registra el resumen del lote.
- Verificado contra la API real con dos archivos, dos hojas y 11 filas: vista previa, confirmación, conflictos, fechas, creación de subprocesos, notificaciones, permisos y validaciones. La base de datos se dejó sin datos de prueba.
- `npm run build` y `npm run lint` pasan en backend y frontend; el backend ejecuta 17 pruebas unitarias, incluidas las del parser de Excel.

## Verificación de la Fase 8

- El inicio (`/`) muestra el panel de control con contrapartes activas, vencidas, pendientes 0–15 días, próximas 16–30 días, al día y sin programar. Cada indicador enlaza al listado filtrado de contrapartes.
- El panel incluye una tabla paginada de contrapartes que requieren atención (vencidas, pendientes o sin programar), ordenada por fecha de próximo seguimiento, además del resumen de borradores, seguimientos finalizados en el mes y subprocesos activos.
- `GET /api/dashboard/summary` devuelve los indicadores y `GET /api/dashboard/attention` la lista paginada; ambos requieren JWT y no incluyen contrapartes archivadas.
- La fecha de corte se calcula en `America/Bogota` y el estado de calendario se reutiliza del backend.
- Verificado contra la API real con contrapartes en todos los rangos, una archivada, una sin programar, un borrador y un seguimiento finalizado. La base de datos se dejó sin datos de prueba.
- `npm run build` y `npm run lint` pasan en backend y frontend; el backend ejecuta 19 pruebas unitarias, incluidas las del dashboard.

## Verificación de la Fase 9

- `GET /api/audit` (solo ADMIN) devuelve el historial paginado con filtros por entidad, acción y usuario; la pantalla `/auditoria` permite consultarlos y expandir el detalle de cada registro.
- La configuración común del backend (`src/app.setup.ts`) aplica prefijo `/api`, Helmet, validación global y CORS solo para los orígenes definidos en `CORS_ORIGIN`.
- El filtro global normaliza errores 400/401/403/404/500 con `statusCode`, `message`, `error`, `timestamp` y `path`; los errores 500 no exponen detalles internos y quedan registrados en el log.
- Las pruebas E2E dejaron de ser un placeholder y cubren salud, cabeceras de seguridad, CORS permitido y rechazado, autenticación, validaciones, dashboard, auditoría y rutas no encontradas. No crean datos de negocio de prueba y requieren PostgreSQL, migraciones y el administrador del seed.
- `npm run test:e2e` pasa con 9 pruebas; `npm test` pasa con 29 pruebas unitarias en 10 archivos; `npm run build` y `npm run lint` pasan en backend y frontend.
- `npm audit` no reporta vulnerabilidades en el frontend. El backend conserva 3 avisos altos y 2 moderados transitivos (CLI de Prisma y ExcelJS); no hay corrección compatible sin un cambio mayor o un downgrade, por lo que se documentan como riesgo residual.

## Estado de la Fase 10

- Se añadieron `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.prod.yml`, `.env.production.example` y `deploy/backup.sh`.
- La API compilada se verificó en modo producción con `node --enable-source-maps dist/main.js`: salud, login ADMIN, dashboard, auditoría y notificaciones respondieron 200; el proceso se detuvo y la base de datos quedó limpia.
- El frontend se compiló con `VITE_API_URL=/api` y las rutas `/` y `/auditoria` respondieron 200 en la vista previa de producción.
- NestJS Observe quedó integrado y desactivado fuera de producción o sin claves; no se envían cuerpos de solicitud ni contexto de código fuente.
- La migración, el seed y el respaldo están automatizados en los artefactos. El respaldo se validó sintácticamente, pero no se ejecutó.
- Docker no está instalado en este equipo: las imágenes y `docker-compose.prod.yml` no se pudieron construir ni ejecutar localmente. HTTPS, dominio y despliegue real quedan pendientes de las credenciales y el servidor definitivo.

## Verificación de Actualización anual con fuente externa

- El módulo `/actualizacion-anual` consume exclusivamente la fuente externa: `GET /api/external-data/summary`, `GET /api/external-data`, `GET /api/external-data/updates-due`, `GET /api/external-data/status`, `GET /api/external-data/events` y `POST /api/external-data/refresh`. La importación manual de la base anual quedó retirada de la pantalla.
- Los datos de Actualización anual se leen de un único libro de SharePoint/OneDrive. La fuente se elige con `EXTERNAL_DATA_SOURCE`: `graph` usa Microsoft Graph con credenciales de aplicación; `file` lee un `.xlsx` local con ExcelJS. Este módulo no escribe en el libro, no elimina archivos y no transfiere información entre PostgreSQL y Excel. El seguimiento de Colocadores usa aparte su propio `.xlsx` local para lectura y escritura.
- En modo `graph`, la lectura intenta primero la tabla configurada y, si no existe, la primera tabla; sin tablas usa la hoja configurada o la primera, sobre el rango usado. En modo `file`, usa la hoja configurada o la primera del archivo local. Las columnas se detectan por alias FR-SG o por `EXTERNAL_DATA_COLUMN_MAP`.
- El mapeo deduplica por código normalizado y conserva la fila con año/fecha más reciente. Los valores `N/A`, `NA`, `no aplica`, `sin fecha`, `sin dato`, `-` y `--` se tratan como vacío. Los registros inválidos se omiten del snapshot y se reportan en las estadísticas.
- El snapshot vive solo en memoria. Si la fuente falla, se conserva el último snapshot pero el estado pasa a `stale`/`degraded`; nunca se guarda una copia en PostgreSQL.
- Las actualizaciones se publican por SSE autenticado (`fetch` con `Authorization`), con un badge de conexión, última actualización y sincronización manual. En modo `graph`, el webhook valida `validationToken` y `clientState`; en modo `file` no hay suscripción ni webhook y el polling de respaldo recarga según `EXTERNAL_FALLBACK_POLL_MS`.
- La fecha límite sigue siendo la fecha de diligenciamiento más un año, con ajuste del 29 de febrero al 28. Los pendientes consideran solo diligenciamientos desde el año anterior; los inactivos solo entran en los conteos. Las alertas anuales `ANNUAL_D3` y `ANNUAL_D1` permanecen separadas de las semestrales.
- `EXTERNAL_DATA_ENABLED` está desactivado por defecto. En modo `graph` se requieren `MICROSOFT_*`, `SHAREPOINT_DRIVE_ID`, `SHAREPOINT_ITEM_ID`, `EXTERNAL_WEBHOOK_PUBLIC_URL` y `EXTERNAL_WEBHOOK_CLIENT_STATE`; la URL pública debe apuntar a la base de la API y el backend agrega `/external-data/webhook`. En modo `file` solo se requiere `EXTERNAL_WORKBOOK_PATH`.
- `npm test` pasa con 73 pruebas unitarias en 20 archivos y `npm run test:e2e` con 7 pruebas; build y lint pasan en backend y frontend. El modo local se validó con `FR-SG-79` (637 registros y 0 errores de mapeo). Queda pendiente Graph con consentimiento de administrador y un webhook HTTPS público.

## Scripts

Backend (`backend/`):

```powershell
npm run start:dev      # desarrollo
npm run build          # compilar
npm run test           # pruebas unitarias
npm run test:e2e       # integración (requiere BD y administrador del seed)
npm run lint
npm run prisma:migrate # crear/aplicar migraciones en desarrollo
npm run prisma:deploy  # aplicar migraciones en otros entornos
npm run prisma:studio  # explorar la base de datos
```

Frontend (`frontend/`):

```powershell
npm run dev          # desarrollo
npm run build        # compilar
npm run lint
```

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Firma y vigencia del token |
| `BCRYPT_SALT_ROUNDS` | Costo del hash de contraseñas |
| `CORS_ORIGIN` | Origen permitido del frontend (vacío para mismo origen) |
| `TRUST_PROXY` | Saltos de proxy confiables (`1` con Nginx del compose; `2` con proxy TLS delante) |
| `TZ` | Zona de negocio (`America/Bogota`) |
| `UPLOAD_DIR` / `MAX_FILE_SIZE_MB` | Almacenamiento y límite de adjuntos |
| `ALLOWED_DOCUMENT_MIME_TYPES` | Tipos de archivo permitidos |
| `SEED_ADMIN_*` | Usuario administrador inicial |
| `SCHEDULE_NOTIFICATIONS_CRON` | Ejecución diaria de notificaciones |
| `EXTERNAL_DATA_ENABLED` | Activa la lectura del libro externo (`false` por defecto) |
| `EXTERNAL_DATA_SOURCE` | Fuente del libro externo: `graph` o `file` (`graph` por defecto) |
| `EXTERNAL_WORKBOOK_PATH` | Ruta absoluta del `.xlsx` cuando `EXTERNAL_DATA_SOURCE=file` |
| `MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Credenciales de aplicación para Microsoft Graph (solo modo `graph`) |
| `SHAREPOINT_DRIVE_ID` / `SHAREPOINT_ITEM_ID` | Identificadores del único libro externo (solo modo `graph`) |
| `EXTERNAL_DATA_TABLE_NAME` / `EXTERNAL_DATA_WORKSHEET_NAME` / `EXTERNAL_DATA_COLUMN_MAP` | Selección de tabla/hoja y mapeo opcional de columnas |
| `EXTERNAL_WEBHOOK_PUBLIC_URL` / `EXTERNAL_WEBHOOK_CLIENT_STATE` | URL pública base de la API y secreto del webhook (solo modo `graph`) |
| `EXTERNAL_GRAPH_BASE_URL` / `EXTERNAL_GRAPH_TIMEOUT_MS` / `EXTERNAL_FALLBACK_POLL_MS` / `EXTERNAL_REFRESH_DEBOUNCE_MS` / `EXTERNAL_MAX_ROWS` | Ajustes de Graph, reintento, polling y límite de filas |
| `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` | Credenciales de NestJS Observe (producción) |
| `OBSERVE_SERVICE_ID` / `OBSERVE_SERVICE_VERSION` | Identidad y versión del servicio en Observe |
| `APP_PORT` | Puerto del frontend en el compose productivo |

No se deben versionar archivos `.env`, `.env.production`, respaldos ni contraseñas reales.

## Reglas clave

- Una contraparte = un NIT = un subproceso = un calendario = un historial.
- Archivar no elimina: conserva datos, documentos e historial y detiene notificaciones.
- El próximo seguimiento solo se actualiza al finalizar un seguimiento (seis meses).
- Los seguimientos finalizados no se sobrescriben.
- La importación de Excel nunca sobrescribe historial ni fechas sin autorización.
- La actualización anual es un proceso separado del seguimiento semestral: genera notificaciones anuales propias y no cambia fechas del calendario.
- La fuente anual externa es de solo lectura: NestJS y React nunca escriben en el libro, no hay transferencia PostgreSQL↔Excel y el snapshot solo existe en memoria mientras la API está activa.
