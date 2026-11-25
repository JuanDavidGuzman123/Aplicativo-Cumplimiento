# Plan de funcionalidades pendientes

## 1. Seguimiento de Colocadores Independientes

### Objetivo
Gestionar el seguimiento semestral de las contrapartes de FR-SG-81 en la categoría `COLOCADORES_INDEPENDIENTES`, con historial en PostgreSQL como Arriendos. No hay proceso de actualización anual, importación manual en UI ni mezcla con Arriendos.

### Estado
**Implementado** el 24/11/2026: sincronización semestral desde FR-SG-81 mediante `POST /counterparties/sync-colocadores` (botón **Traer de FR-SG-81**), filtro `Seguimiento Si/No = Si` o `No` y categoría `COLOCADORES_INDEPENDIENTES`. Los únicos cambios que la app hace en el `.xlsx` son `Seguimiento Si/No` y la celda existente `Observaciones`; no agrega columnas, IDs ni filas. Las filas válidas se guardan en PostgreSQL con el ID derivado del número de documento, y las evaluaciones/reactivaciones se registran en `RiskEvaluation`, igual que Arriendos. El historial inicial de las 6 contrapartes existentes se cargó el 24/11/2026 con decisión `CONTINUE`, fecha 2026-11-24 y nota `Historial inicial importado de FR-SG-81`. No existe ruta, menú ni API de consulta general ni de actualización anual para Colocadores.

### Fuente confirmada
- Carpeta: `W:\124 CUMPLIMIENTO\124. PE GI CUMPLIMIENTO\1. DEBIDA DILIGENCIA\1. Colaboradores`.
- Libro base: `FR-SG-81 Base De Datos Colocadores Independientes Y Otras Categorias.xlsx`.
- Hoja: `FR-SG-81`.
- Encabezados originales detectados en fila 3: `Numero de documento`, `Tipo de Documento`, `Nombres y Apellidos`, `Fecha Debida Diligencia`, `Categoria`, `Numero De Firma`, `Dirección`, `Municipio`, `Correo electronico`, `Telefono`, `Criterios De Evaluacion`, `Excepciones Si / No`, `Seguimiento Si/No`, `Observaciones`, `Riesgo Jurisdiccional`.
- No se agregan columnas ni filas al workbook. La app solo escribe las celdas existentes `Seguimiento Si/No` y `Observaciones`; el identificador en PostgreSQL se deriva de `Numero de documento`.
- Volumen observado: 1.958 filas con documento, 1.830 documentos únicos, 119 documentos duplicados, fechas entre 2023-12-14 y 2026-11-21.
- No existe columna A/I de estado, ni `Año`, ni `Tipo de Debida Diligencia`. Sí existe `Seguimiento Si/No`, con 6 filas `Si` en el corte observado. Ese campo es la base de entrada al seguimiento semestral y la app lo actualiza al archivar o reactivar; no se deriva estado anual.
- Existe un listado auxiliar en `0. Actualización anual/2026/ACTIVOS NOMINA Y COLOCACION CORTE 18 NOV.xlsx`, hoja `COLOCACION`, con 258 registros activos de `Colocador Independiente`; 245 coinciden con el libro base. No se usa como entrada del proceso.

### Decisiones confirmadas
- Debe consultar libro externo.
- No tendrá actualización anual: solo seguimiento semestral en **Contrapartes**.
- Se mostrarán las filas con `Seguimiento Si/No = Si` y las archivadas con `No`; no habrá apartado de consulta general de FR-SG-81.
- No tendrá importación manual en UI, igual que Arriendos.
- Visible para `ADMIN` y `ANALYST`.
- Categoría propia, sin reutilizar tablas de Arriendos ni modificar subprocesos asignados.

### Decisiones aplicadas
1. Estado: `Seguimiento Si/No = Si` significa activa y `No` significa archivada; no se calculan vencimientos de actualización anual para Colocadores.
2. Universo: se sincronizan las filas con `Seguimiento Si/No = Si` o `No`, independientemente de la variante ortográfica de `Categoria`; la categoría asignada en la app es siempre `COLOCADORES_INDEPENDIENTES`.
3. Identificador: se deriva del número de documento, sin escribirlo en FR-SG-81; las evaluaciones se localizan por ese documento, nunca por la posición de la fila.
4. El seguimiento consulta directamente las filas crudas con `Seguimiento Si/No = Si` o `No`, para que un duplicado más reciente sin seguimiento no elimine una contraparte que sí debe seguirse.
5. Arriendos conserva su actualización anual en `/actualizacion-anual` y `/api/external-data/*`; Colocadores no tiene equivalente.
6. Motivo: lo redactado en la app reemplaza la celda existente `Observaciones` de FR-SG-81, se muestra como **Motivo de seguimiento** y también se guarda en `RiskEvaluation.notes`.
7. Documento: en la vista de Colocadores el campo `nit` se etiqueta como **CC** en tabla, detalle y buscador; Arriendos conserva la etiqueta **NIT**.
8. Estados de la vista: `Al día`, `Revisada`, `Vencida` y `Archivada`, calculados desde `Seguimiento Si/No` y las fechas de evaluación almacenadas en PostgreSQL.
9. `Seguimiento Si/No` refleja la acción de la app: archivar escribe `No`, continuar o reactivar escriben `Si`. Las archivadas siguen visibles por `No` y conservan su historial en `RiskEvaluation`.

### Fases
1. **Arquitectura**: clave `colocadores` solo para caché/refresh internos; sin ruta frontend ni API pública de actualización anual. El seguimiento permanece en `/api/counterparties/sync-colocadores`.
2. **Backend externo**: lectura, mapeo y caché por fuente para el sync; configurar variables de entorno propias; exponer solo el estado interno necesario al proceso de contrapartes.
3. **Backend de workbook**: categoría `COLOCADORES_INDEPENDIENTES`, lectura del `.xlsx` local de FR-SG-81 y escritura de `Seguimiento Si/No` y `Observaciones`; estados, fechas y decisión se persisten en PostgreSQL.
4. **Frontend**: botón **Traer de FR-SG-81** dentro de **Contrapartes**, filtro por categoría, columna **Motivo de seguimiento** y pestañas de seguimiento/archivadas; sin apartado de base de datos, menú, tarjeta ni ruta de actualización anual.
5. **Validación**: tests de filtro `Si`, dedupe, categorías, no duplicación y no eliminación; verificar que Arriendos no cambie; ejecutar build/lint/test.
6. **Documentación**: actualizar README, arquitectura y `.env.example`; no commitear sin autorización explícita.

## 2. Evaluación de riesgo y archivo de contrapartes

### Objetivo
Permitir que una contraparte en seguimiento se evalúe y, según la decisión, continúe en seguimiento con nueva fecha a 6 meses o pase a **Contrapartes archivadas**, conservando toda su información e historial.

### Estado
**Implementado** el 24/11/2026: migración `RiskEvaluation`, endpoint `POST /counterparties/:id/risk-evaluation`, reactivación con historial, filtro de notificaciones de archivadas y UI con una sola opción de menú (**Contrapartes**), con la opción **Contrapartes archivadas** como pestaña interna. El mismo endpoint escribe solo `Seguimiento Si/No` y `Observaciones` en el `.xlsx` local de FR-SG-81 (Colocadores) o FR-SG-79 (Arriendos), con guardado seguro y validación previa. Ambas categorías mantienen el historial en PostgreSQL; si falla la transacción, el servicio revierte esas dos celdas.

### Reglas funcionales
- En la sección **En seguimiento**, cada contraparte debe permitir responder: **¿La contraparte continúa presentando riesgo?** con opciones **Sí** y **No**.
- **Sí**: permanece en seguimiento, se registra la fecha de evaluación y se programa el próximo seguimiento a 6 meses.
- **No**: cambia a estado **Archivada**, deja de generar alertas de vencimiento, se registra la fecha de archivado y pasa a la sección **Contrapartes archivadas**.
- Las contrapartes archivadas deben poder consultarse con datos originales, historial, fecha de archivado y estado `ARCHIVADA`.
- Debe existir **Reactivar contraparte** desde archivadas: vuelve a En seguimiento, permite establecer nueva fecha de próximo seguimiento y conserva todo el historial.
- No eliminar registros, no duplicar contrapartes, no perder historial, no modificar subprocesos asignados.
- Registrar cada decisión y fecha; evitar evaluaciones duplicadas accidentales.
- En Colocadores y Arriendos, las únicas celdas que se escriben en FR-SG-81 y FR-SG-79, respectivamente, son `Seguimiento Si/No` y `Observaciones`. La decisión, las fechas, el estado y la fecha de archivado se registran en PostgreSQL (`Counterparty` y `RiskEvaluation`) para ambas categorías.

### Fases
1. **Datos**: revisar `Counterparty`, `FollowUpStatus` y notificaciones; agregar campos de archivado/reactivación y un modelo de historial de evaluaciones; crear migración.
2. **Backend**: endpoints para listar seguimiento/archivadas, registrar evaluación, archivar y reactivar; filtrar alertas para excluir archivadas; auditoría de decisiones.
3. **Frontend**: secciones **En seguimiento** y **Contrapartes archivadas**, acciones claras de evaluación y reactivación, historial consultable, reutilizando componentes actuales.
4. **Validación**: tests de no eliminación, no duplicación, supresión de alertas y trazabilidad; build/lint/test.
5. **Documentación**: actualizar arquitectura y README.

## 3. Categorías de contrapartes

### Objetivo
Organizar **Contrapartes en seguimiento** en categorías escalables, empezando por **Arriendos** y **Colocadores independientes**, sin perder historial, duplicar registros ni mezclar categorías con subprocesos.

### Estado
**Implementado** el 24/11/2026: modelo `Category`, migración con backfill a `ARRIENDOS`, endpoint `GET /categories`, filtro `category` en `GET /counterparties`, asignación de categoría en creación e importación, selector de tarjetas en `/contrapartes`, pestañas internas de seguimiento/archivadas por categoría, sincronización idempotente desde FR-SG-79 mediante `POST /counterparties/sync-arriendos` (botón **Traer de FR-SG-79**) y desde FR-SG-81 mediante `POST /counterparties/sync-colocadores` (botón **Traer de FR-SG-81**).

### Reglas funcionales
- Las categorías son independientes de los subprocesos: una contraparte conserva su categoría y su subproceso original.
- El catálogo se obtiene desde backend y devuelve conteos de activas, archivadas y totales por categoría.
- La categoría se envía como clave (`ARRIENDOS`, `COLOCADORES_INDEPENDIENTES`) en el filtro de listado.
- Las creaciones e importaciones sin categoría explícita usan `ARRIENDOS` por defecto.
- Agregar una nueva categoría solo requiere un registro activo en la tabla `Category`; el selector y los filtros se adaptan automáticamente.
- No se eliminan contrapartes ni se altera el historial de evaluaciones al cambiar de categoría en la UI.
- La sincronización de Arriendos lee FR-SG-79 en modo solo lectura, toma solo las filas con `Seguimiento Si / No = Sí`, usa la columna `Numero de documento Natural / Juridica` como NIT y deduplica por NIT normalizado.
- La sincronización no sobreescribe contrapartes existentes: registra solo las nuevas con categoría `ARRIENDOS` y subproceso predeterminado **Debida diligencia**.
- Las filas con estado `I` del libro se registran como archivadas y conservan el motivo en observaciones de archivado; el historial de evaluaciones no se altera.
- El seguimiento de contrapartes es semestral: creaciones, evaluaciones y reactivaciones programan el próximo seguimiento 6 meses después de la fecha de diligencia/evaluación. La actualización anual con vencimiento de 12 meses existe para Arriendos y Clientes en rutas separadas; Colocadores no participa de ese flujo.
- Colocadores independientes usa el mismo flujo de seguimiento en la UI: botón **Traer de FR-SG-81**, filtro `Seguimiento Si/No = Si` o `No`, categoría `COLOCADORES_INDEPENDIENTES` y seguimiento semestral. Lee el workbook local sin Graph y solo escribe `Seguimiento Si/No` y `Observaciones`; archivar escribe `No` y reactivar escribe `Si`, y ambas acciones reemplazan la observación con lo redactado en la app. El historial queda en PostgreSQL. No tiene actualización anual: ese flujo pertenece solo a Arriendos y Clientes.
- Arriendos usa el mismo flujo de evaluación y reactivación sobre FR-SG-79, localiza la fila por documento y escribe únicamente `Seguimiento Si/No` y `Observaciones`; el historial sigue en PostgreSQL. `sync-arriendos` importa solo las filas marcadas `Sí` y sigue siendo una acción manual independiente.

## 4. Independencia total de alertas

### Objetivo
Mantener independientes la alerta de actualización anual y la alerta de seguimiento semestral de contrapartes, sin mezclar contadores, marcas de lectura, navegación ni programación, y presentarlas en un solo centro de alertas fácil de leer.

### Estado
**Implementado** el 25/11/2026: una campana `Alertas` en el encabezado con pestañas `Todas`, `Seguimiento` y `Anual`; secciones por estado real (`Vencida`, `Por vencer`, `Pendiente`) con subdivisión por proceso/categoría, incluidos los tres procesos de seguimiento; una sola tarjeta por obligación con trazabilidad de recordatorios; metadata `process` y `source` en la API; endpoints, modelos y crons separados (`SCHEDULE_ANNUAL_NOTIFICATIONS_CRON` y `SCHEDULE_NOTIFICATIONS_CRON`); y sin columna **Alerta** calculada en la tabla de vencimientos de Actualización anual. No se creó una página de alertas separada.

### Reglas funcionales
- El centro de alertas consulta `/api/notifications` y `/api/annual-notifications`; cada alerta se identifica por `process` (`FOLLOW_UP` o `ANNUAL`) y `source` (`arriendos`, `colocadores` o `clientes`).
- La UI calcula el estado desde `scheduledDate` y la fecha actual de Bogotá: vencida si pasó, por vencer si faltan 15 días o menos, y pendiente en adelante. Muestra días de retraso o restantes y conserva los recordatorios originales como trazabilidad.
- Los recordatorios de una misma obligación se agrupan para mostrar una sola alerta activa. Las notificaciones cuya `scheduledDate` ya no coincide con la fecha vigente del registro no se muestran como activas, por lo que los recordatorios se detienen al completar la actividad sin borrar el historial.
- Las alertas de seguimiento marcan `/api/notifications/:id/read` y navegan a `/contrapartes/:id`.
- Las alertas anuales marcan `/api/annual-notifications/:id/read` y navegan a `/actualizacion-anual?code=...` para Arriendos o a `/actualizacion-anual/clientes?code=...` para Clientes.
- Marcar como leída una alerta de una familia o fuente no modifica los contadores de las demás ni completa la obligación; el cumplimiento solo cambia cuando se registra la actividad en el módulo correspondiente.
- La generación diaria de cada familia usa su propia variable de entorno cron; ambas conservan la zona `America/Bogota` y `skipDuplicates`.
- Los tipos `ANNUAL_D15`, `ANNUAL_D10` y `ANNUAL_D5` se conservan solo para alertas históricas; no se generan alertas nuevas de esos tipos.
- No se modifica PostgreSQL ni los workbooks; `Notification`/`AnnualNotification` ya estaban separados en la base.

### Validación
- Verificar build, lint y tests de backend y frontend.
- Verificar en la UI que el centro de alertas muestre contadores independientes, secciones por estado, una sola tarjeta por obligación, días restantes o de retraso y navegación correcta; que la alerta anual abra `/actualizacion-anual?code=...` para Arriendos o `/actualizacion-anual/clientes?code=...` para Clientes, y que la tabla de vencimientos ya no muestre **Alerta**.

## 7. Clientes corporativos

### Objetivo
Gestionar para Clientes el mismo par de procesos que para Arriendos: actualización anual con alertas D3/D1 y seguimiento semestral con historial, sin mezclar códigos, notificaciones ni registros con Arriendos.

### Estado
**Implementado** el 25/11/2026: ruta `/actualizacion-anual/clientes`, endpoints `/api/external-data/clientes/*`, `POST /counterparties/sync-clientes`, categoría `CLIENTES`, `AnnualCounterparty.source` con unique `(source, codeNormalized)`, notificaciones anuales por fuente con navegación source-aware y centro unificado de alertas con metadata `process`/`source`. El entorno local quedó configurado con `EXTERNAL_CLIENTES_WORKBOOK_PATH`; en el entorno real esa variable aún debe definirse, y sin ella la fuente queda `unconfigured`.

### Fuente confirmada
- Carpeta: `W:\124 CUMPLIMIENTO\124. PE GI CUMPLIMIENTO\1. DEBIDA DILIGENCIA\4. Clientes corporativos`.
- Libro: `FR-SG-80 Base De Datos Clientes Corporativos.xlsx`.
- Hoja: `FR-SG-80`.
- Encabezados usados en fila 3: `1 Nit o Número de documento`, `2 Nombre y/o razón social`, `3 Fecha Debida Diligencia`, `4 Año`, `5 Activo/Inactivo`, `15 Criterios De Evaluacion`, `16 Excepciones Si / No`, `17 Seguimiento Si/No`, `18 Observaciones` y `19 Riesgo Jurisdiccional`.
- Volumen observado: 710 filas de datos, 142 NITs únicos y 290 números de firma únicos. No hay solapamiento de NITs con Arriendos ni Colocadores.
- Al corte observado, `Seguimiento Si/No` estaba vacío en las 710 filas, `Excepciones Si / No` tenía 42 `Sí` y 496 `No`, y `Activo/Inactivo` tenía 538 `A` y 30 `I`.

### Decisiones aplicadas
1. Estado inicial: dejar `Seguimiento Si/No` vacío en `FR-SG-80`; por eso el sync inicial es 0 y el usuario debe marcar manualmente `Si`/`No`.
2. Dedupe del libro: por NIT/documento, conservando la fila más reciente por año/fecha.
3. Sincronización: `Si` crea contraparte activa y `No` archivada en la categoría `CLIENTES`, con ID derivado del documento y prefijo `clientes-fr-sg-80`.
4. Anual: el mismo NIT/código puede existir en Arriendos y Clientes porque la unique es `(source, codeNormalized)`. Las alertas viajan con `source` y abren la pantalla correspondiente.
5. Escritura: solo las celdas existentes `17 Seguimiento Si/No` y `18 Observaciones`, con guardado seguro, validación del XML y rollback si falla la transacción.
6. No se agrega NIT, ID, columna ni fila al libro; no se usa Graph para Clientes.

### Fases
1. **Configuración**: `EXTERNAL_CLIENTES_WORKBOOK_PATH`, `EXTERNAL_CLIENTES_WORKSHEET_NAME=FR-SG-80` y opcional `EXTERNAL_CLIENTES_COLUMN_MAP`.
2. **Backend**: snapshot y endpoints por fuente, mapper con aliases FR-SG-80, sync a PostgreSQL y workbook writer.
3. **Frontend**: tarjeta y menú de actualización anual de Clientes, botón **Traer de FR-SG-80** y centro de alertas source-aware.
4. **Despliegue**: mounts de workbooks en `docker-compose.prod.yml`, variables en los `.env.example` y respaldo de `/app/workbooks` en `deploy/backup.sh`.
5. **Validación**: tests de source, sync, aislamiento de snapshots y escritura segura; build/lint/test/e2e.
