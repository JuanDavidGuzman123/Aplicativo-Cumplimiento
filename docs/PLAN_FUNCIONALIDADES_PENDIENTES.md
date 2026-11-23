# Plan de funcionalidades pendientes

## 1. Seguimiento de Colocadores Independientes

### Objetivo
Gestionar únicamente el seguimiento semestral de las contrapartes de FR-SG-81 en la categoría `COLOCADORES_INDEPENDIENTES`. No hay consulta separada de la base de datos, proceso de actualización anual, importación manual en UI ni mezcla con Arriendos.

### Estado
**Implementado** el 23/11/2026: sincronización semestral desde FR-SG-81 mediante `POST /counterparties/sync-colocadores` (botón **Traer de FR-SG-81**), filtro `Seguimiento Si/No = Si` o `No` y categoría `COLOCADORES_INDEPENDIENTES`. El único cambio que la app hace en el `.xlsx` es `Seguimiento Si/No`; no agrega columnas, IDs, filas ni escribe PostgreSQL. Evaluaciones, estados, fechas y observaciones se derivan de ese campo y se conservan en memoria; Arriendos conserva su flujo en PostgreSQL. No existe ruta, menú ni API de consulta general ni de actualización anual para Colocadores.

### Fuente confirmada
- Carpeta: `W:\124 CUMPLIMIENTO\124. PE GI CUMPLIMIENTO\1. DEBIDA DILIGENCIA\1. Colaboradores`.
- Libro base: `FR-SG-81 Base De Datos Colocadores Independientes Y Otras Categorias.xlsx`.
- Hoja: `FR-SG-81`.
- Encabezados originales detectados en fila 3: `Numero de documento`, `Tipo de Documento`, `Nombres y Apellidos`, `Fecha Debida Diligencia`, `Categoria`, `Numero De Firma`, `Dirección`, `Municipio`, `Correo electronico`, `Telefono`, `Criterios De Evaluacion`, `Excepciones Si / No`, `Seguimiento Si/No`, `Observaciones`, `Riesgo Jurisdiccional`.
- No se agregan columnas ni filas al workbook. La app solo escribe la celda existente `Seguimiento Si/No`; el identificador en memoria se deriva de `Numero de documento`.
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
6. Motivo: la columna `Observaciones` de FR-SG-81 no se modifica; la nueva observación de cada evaluación se muestra como **Motivo de seguimiento** solo en memoria y no se copia a PostgreSQL.
7. Documento: en la vista de Colocadores el campo `nit` se etiqueta como **CC** en tabla, detalle y buscador; Arriendos conserva la etiqueta **NIT**.
8. Estados de la vista: `Al día`, `Revisada`, `Vencida` y `Archivada`, calculados desde `Seguimiento Si/No` y las fechas de la evaluación en memoria.
9. `Seguimiento Si/No` refleja la acción de la app: archivar escribe `No`, continuar o reactivar escriben `Si`. Las archivadas siguen visibles por `No`.

### Fases
1. **Arquitectura**: clave `colocadores` solo para caché/refresh internos; sin ruta frontend ni API pública de actualización anual. El seguimiento permanece en `/api/counterparties/sync-colocadores`.
2. **Backend externo**: lectura, mapeo y caché por fuente para el sync; configurar variables de entorno propias; exponer solo el estado interno necesario al proceso de contrapartes.
3. **Backend de workbook**: categoría `COLOCADORES_INDEPENDIENTES`, lectura del `.xlsx` local de FR-SG-81 y escritura únicamente de `Seguimiento Si/No`; estados, fechas, resultado y observaciones viven en memoria; sin escrituras en PostgreSQL.
4. **Frontend**: botón **Traer de FR-SG-81** dentro de **Contrapartes**, filtro por categoría, columna **Motivo de seguimiento** y pestañas de seguimiento/archivadas; sin apartado de base de datos, menú, tarjeta ni ruta de actualización anual.
5. **Validación**: tests de filtro `Si`, dedupe, categorías, no duplicación y no eliminación; verificar que Arriendos no cambie; ejecutar build/lint/test.
6. **Documentación**: actualizar README, arquitectura y `.env.example`; no commitear sin autorización explícita.

## 2. Evaluación de riesgo y archivo de contrapartes

### Objetivo
Permitir que una contraparte en seguimiento se evalúe y, según la decisión, continúe en seguimiento con nueva fecha a 6 meses o pase a **Contrapartes archivadas**, conservando toda su información e historial.

### Estado
**Implementado** el 23/11/2026: migración `RiskEvaluation`, endpoint `POST /counterparties/:id/risk-evaluation`, reactivación con historial, filtro de notificaciones de archivadas y UI con una sola opción de menú (**Contrapartes**), con la opción **Contrapartes archivadas** como pestaña interna. Para Colocadores, el mismo endpoint escribe únicamente en el `.xlsx` local de FR-SG-81; Arriendos mantiene el historial en PostgreSQL.

### Reglas funcionales
- En la sección **En seguimiento**, cada contraparte debe permitir responder: **¿La contraparte continúa presentando riesgo?** con opciones **Sí** y **No**.
- **Sí**: permanece en seguimiento, se registra la fecha de evaluación y se programa el próximo seguimiento a 6 meses.
- **No**: cambia a estado **Archivada**, deja de generar alertas de vencimiento, se registra la fecha de archivado y pasa a la sección **Contrapartes archivadas**.
- Las contrapartes archivadas deben poder consultarse con datos originales, historial, fecha de archivado y estado `ARCHIVADA`.
- Debe existir **Reactivar contraparte** desde archivadas: vuelve a En seguimiento, permite establecer nueva fecha de próximo seguimiento y conserva todo el historial.
- No eliminar registros, no duplicar contrapartes, no perder historial, no modificar subprocesos asignados.
- Registrar cada decisión y fecha; evitar evaluaciones duplicadas accidentales.
- En Colocadores, la única celda que se escribe en FR-SG-81 es `Seguimiento Si/No`. Fechas, resultado, estado, fecha de archivado y observaciones se conservan en memoria durante la sesión del backend; PostgreSQL no recibe esos datos.

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
**Implementado** el 23/11/2026: modelo `Category`, migración con backfill a `ARRIENDOS`, endpoint `GET /categories`, filtro `category` en `GET /counterparties`, asignación de categoría en creación e importación, selector de tarjetas en `/contrapartes`, pestañas internas de seguimiento/archivadas por categoría y sincronización idempotente desde FR-SG-79 mediante `POST /counterparties/sync-arriendos` (botón **Traer de FR-SG-79**).

### Reglas funcionales
- Las categorías son independientes de los subprocesos: una contraparte conserva su categoría y su subproceso original.
- El catálogo se obtiene desde backend y devuelve conteos de activas, archivadas y totales por categoría.
- La categoría se envía como clave (`ARRIENDOS`, `COLOCADORES_INDEPENDIENTES`) en el filtro de listado.
- Las creaciones e importaciones sin categoría explícita usan `ARRIENDOS` por defecto.
- Agregar una nueva categoría solo requiere un registro activo en la tabla `Category`; el selector y los filtros se adaptan automáticamente.
- No se eliminan contrapartes ni se altera el historial de evaluaciones al cambiar de categoría en la UI.
- La sincronización de Arriendos lee FR-SG-79 en modo solo lectura, toma las filas con `Seguimiento Si / No = Sí`, usa la columna `Numero de documento Natural / Juridica` como NIT y deduplica por NIT normalizado.
- La sincronización no sobreescribe contrapartes existentes: registra solo las nuevas con categoría `ARRIENDOS` y subproceso predeterminado **Debida diligencia**.
- Las filas con estado `I` del libro se registran como archivadas y conservan el motivo en observaciones de archivado; el historial de evaluaciones no se altera.
- El seguimiento de contrapartes es semestral: creaciones, evaluaciones y reactivaciones programan el próximo seguimiento 6 meses después de la fecha de diligencia/evaluación. La actualización anual con vencimiento de 12 meses existe solo para Arriendos en **Actualizaciones**; Colocadores no participa de ese flujo.
- Colocadores independientes usa el mismo flujo de seguimiento en la UI: botón **Traer de FR-SG-81**, filtro `Seguimiento Si/No = Si` o `No`, categoría `COLOCADORES_INDEPENDIENTES` y seguimiento semestral. Lee el workbook local sin Graph y solo escribe `Seguimiento Si/No`; archivar escribe `No` y reactivar escribe `Si`. No tiene actualización anual: esa pantalla y esa API son exclusivas de Arriendos.
