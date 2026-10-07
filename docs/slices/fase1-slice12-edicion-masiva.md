# Fase 1, slice 12: edición masiva de proyecto, etiquetas y facturable

Contrato del duodécimo slice vertical de la fase 1. Módulo `time-entry`, con un
cambio en un componente de `project`; pantalla `/`.

- **Fuente de los comportamientos:** `docs/parity/time-tracker.md`, el resto de
  TT-63: proyecto y tarea, etiquetas agregando o reemplazando, y facturabilidad
  en bloque.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md), slice 12. Es el
  cierre del rastreador: con este slice `time-tracker.md` queda cubierto salvo
  lo marcado fuera de alcance (TT-09, TT-13, TT-33, TT-53, TT-59, TT-67, TT-83,
  TT-84).
- **Revisión del contrato:** ronda 1 de `architecture-reviewer` aplicada, con
  las resoluciones de
  [`correcciones-fase1-slice12.md`](correcciones-fase1-slice12.md) (B1, M1, M2,
  m1 … m7).
- **Contratos de los que hereda:** [slice 6](fase1-slice6-seleccion-y-masa.md)
  §4.8 («Lo que el slice 12 suma»), con sus correcciones
  ([ronda 1](correcciones-fase1-slice6.md), B1;
  [ronda 2](correcciones-fase1-slice6-ronda2.md), m5);
  [slice 10](fase1-slice10-selector-de-proyecto.md) (la regla del par);
  [slice 11](fase1-slice11-etiquetas-y-facturable.md) (D-2, D-4, D-5, PR-47)
  con las correcciones del
  [arranque del 11b](correcciones-fase1-slice11b-arranque.md) (m8: las
  constancias y `valuesOf` con `EntryWithRefs`).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0011, las acciones en masa son todo o nada](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md):
    se aplica sin cambios. Su «el proyecto elegido que ya no está disponible
    responde con su propio código» es la regla de §4.8.
  - [ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md):
    la masiva y `updateEntry` pasan a compartir las funciones del par, el
    facturable y las etiquetas, como ya comparten `editedFields`.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    las referencias se validan con `assertTrackable` y `assertTaggable` de
    `project`, con la transacción de la masiva.
  - [ADR 0017, una operación en masa valida sus referencias una vez, después de las filas](../adr/0017-las-referencias-de-una-masiva-se-validan-una-vez.md):
    **propuesto** por este contrato (D12-2), **pendiente de aprobación del
    usuario**.
  - [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) **no se
    aplica**: ninguna operación del slice crea filas.

Decisiones del equipo que el contrato da por tomadas: todo o nada (ADR 0011);
D-2 del 11 (otro proyecto impone su facturable por defecto; el mismo proyecto
con otra tarea o sin ella, y «Sin proyecto», lo conservan); D-4 del 11 (hasta 50
etiquetas por entrada); PR-47 (una etiqueta archivada se conserva en la entrada
que la tiene y no se asigna de nuevo); la entrada que corre no es una fila
(TT-111, slice 6 §4.3); el tope de 200 entradas (TT-63).

## Partición

**No se parte** (D12-1). El slice no tiene esquema, ni permisos, ni pantalla
nueva: suma tres campos opcionales a un esquema estricto, tres secciones a un
diálogo que ya existe y una fase de validación al algoritmo de la masiva. Las
dos mitades posibles —proyecto y facturable por un lado, etiquetas por el
otro— comparten el refactor de §4.3 sobre `updateEntry`, el algoritmo de §4.5,
la escritura de §4.6 y el diálogo; partir duplicaría el pipeline y las
revisiones sobre los mismos archivos. Medido contra el 11a, es del mismo orden.

## Decisiones del team-lead

Tomadas el 2026-10-07 con la ronda 1
([`correcciones-fase1-slice12.md`](correcciones-fase1-slice12.md)), como las
proponía este contrato y con lo que sumó la revisión. Ninguna la resuelve la
paridad: TT-63 dice qué se cambia en bloque, no cómo se combina con las reglas
de una fila. **D12-2 queda sujeta a la aprobación del ADR 0017 por el
usuario.**

| ID    | Decisión                                                                                                                                              | Opciones que se consideraron                                                                                                                                                                                                                                                                                                                                          | Lo decidido y por qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D12-1 | **Partir el slice.**                                                                                                                                  | Partir o no.                                                                                                                                                                                                                                                                                                                                                          | **No partir** (arriba). El refactor de `updateEntry` va en un primer commit propio, sin cambio de conducta, con la suite en verde y dos mutantes sobre la rama (handshake, paso 1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D12-2 | **Cuándo y cuántas veces se validan el proyecto y las etiquetas pedidos**, y qué gana si una fila se rechaza y además el proyecto no está disponible. | (1) Una vez, antes de leer las filas, siempre que el pedido traiga proyecto o etiquetas. (2) En cada fila, como un rechazo más de la lista. (3) Cada fila decide, sin consultar, qué asigna de nuevo (`pairToCheck`, `tagsToCheck`); se valida la unión una sola vez, después de evaluar las filas y solo si alguna asigna algo nuevo; la falla es del pedido entero. | **(3)**, con el ADR 0017: una vez, después de las filas, **el par antes que la unión de las etiquetas, para el pedido entero y no plan por plan**, con falla del pedido entero. (1) rechaza un pedido que no cambia nada —filas que ya tienen el proyecto archivado—, rompe el punto fijo del reintento si el proyecto se archiva entre los dos intentos y se separa de `updateEntry`, que no valida lo que la fila ya tiene (TT-104, PR-47). (2) hace hasta 600 consultas y llena el aviso con la misma causa en cada fila, con un remedio —«quitar esas entradas»— que no la resuelve: hay que elegir otro proyecto. Con (3) las filas van primero: el contrato del 6 decía «antes de evaluar filas» (§4.8), y este lo reemplaza. |
| D12-3 | **«Reemplazar» sin ninguna etiqueta elegida.**                                                                                                        | (a) Deja las entradas sin etiquetas, con el aviso «Las entradas quedan sin etiquetas.» a la vista. (b) Es «sin cambios».                                                                                                                                                                                                                                              | **(a)**, con el aviso asociado por `aria-describedby`. Elegir «Reemplazar» es un acto explícito, no un campo que quedó vacío: es la única forma de sacar las etiquetas de varias entradas a la vez, y el aviso dice qué va a pasar antes de guardar. La descripción no tiene un control así y sigue sin poder vaciarse en bloque (deuda del 6).                                                                                                                                                                                                                                                                                                                                                                                     |
| D12-4 | **«Agregar» deja una entrada con más de 50 etiquetas.**                                                                                               | (a) Rechazo de esa fila, con el texto de D-4. (b) Error del pedido entero. (c) Recortar a 50 en silencio.                                                                                                                                                                                                                                                             | **(a).** Depende de la fila —cuántas tiene ya—, y el remedio es quitarla de la selección: es un rechazo en el sentido del ADR 0011. (c) cambia lo pedido sin decirlo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D12-5 | **El facturable en «Sin cambios» con un proyecto elegido.**                                                                                           | (a) Cada fila sigue D-2 y el diálogo lo dice con una ayuda. (b) Igual, sin ayuda. (c) El diálogo preselecciona el por defecto del proyecto y lo manda explícito, como el diálogo del calendario.                                                                                                                                                                      | **(a)**, con la ayuda de §5.2, que termina en «… las que ya estaban en él conservan el suyo». (c) le impone el por defecto también a las filas que ya estaban en ese proyecto, que D-2 deja como están: la masiva dejaría de ser la fila repetida. (b) deja sin explicar que dos filas del mismo pedido terminan con facturables distintos.                                                                                                                                                                                                                                                                                                                                                                                         |

## 0. Precondición de arranque

- **`main` en `2a2c043`**, con los slices 1 a 11b. Las citas de abajo son de ese
  árbol.
- **El slice chico de «Reintentar» en el alta manual** (ADR 0007, retirar
  TT-109) toca `createManualEntryInput`, `createManualEntry` y los «Agregar» de
  la barra y del calendario. Comparte con este `time-entry/schema.ts`,
  `time-entry/service.ts`, `labels.ts` y, por m6, `service.integration.test.ts`
  (solo sus importaciones), en bloques distintos; los casos nuevos de este van
  en un archivo de test propio (§6). Pueden ir en paralelo: el que entra
  segundo rebasa.
- **Si entre este contrato y el arranque entra algo a `main`**, una ronda corta
  de `architecture-reviewer` contra el árbol (lección del 9).
- **D12-1 … D12-5 tomadas** (arriba); **el ADR 0017, aceptado por el usuario**
  antes del primer commit.

### Supuestos sobre el árbol, con archivo y línea en `2a2c043`

| Supuesto                                                                                                                                                                                                                                                                           | Dónde                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bulkEditChanges` es un `strictObject` con `description`, `date`, `start` y `end`, con el texto de `unexpected` para lo desconocido y el `refine` de `bulkNoChanges`; su comentario nombra «el proyecto, antes del slice 12»                                                       | `time-entry/schema.ts:216-238`                                                                    |
| `entryPair` se declara **después** de `bulkEditChanges`                                                                                                                                                                                                                            | `schema.ts:245-250`                                                                               |
| `entryIds` normaliza con `normalizedIds`; `BULK_MAX` es 200                                                                                                                                                                                                                        | `schema.ts:20`, `:210-214`                                                                        |
| `TAGS_MAX` es 50 y `tooManyTags` lo nombra; `tagIds` es `z.array(z.uuid()).max(TAGS_MAX).transform(normalizedIds)`                                                                                                                                                                 | `schema.ts:23`, `:45`, `:88-91`                                                                   |
| `entryPair` es el par estricto con el `refine` de TT-70; lo usa `updateEntryChanges.project`                                                                                                                                                                                       | `schema.ts:245-250`, `:277`                                                                       |
| `updateEntryChanges.tags` es el conjunto entero (D-5), con el mismo nombre de clave que el campo nuevo de la masiva, que tiene otra forma                                                                                                                                          | `schema.ts:281`                                                                                   |
| `TimeEntryErrorCode` incluye `"rejected"`                                                                                                                                                                                                                                          | `schema.ts:483-484`                                                                               |
| `pairToCheck(current, requested)` devuelve el par pedido o `null` («Sin proyecto», el mismo par, el mismo proyecto sin tarea); `tagsToCheck(current, requested)` devuelve las pedidas que la fila no tiene                                                                         | `time-entry/assignment.ts:9-23`, `:31-36`                                                         |
| `billableFor(current, next)` conserva con `next` nulo o el mismo proyecto, y si no devuelve `next.billableByDefault`                                                                                                                                                               | `src/lib/billable.ts:24-32`                                                                       |
| `normalizedIds` y `sameTagIds` en `src/lib/tag-ids.ts`; `samePair` y `sameId` en `src/lib/project-pair.ts`                                                                                                                                                                         | `tag-ids.ts:6-8`, `:15-19`; `project-pair.ts:11-21`                                               |
| `assertTrackable(tx, actor, target)` lanza `ProjectError("not_found", projectUnavailable \| taskUnavailable)` y devuelve `TrackableProject` (`{ id, billableByDefault }`); `assertTaggable(tx, actor, ids)` lanza `tagUnavailable` y no consulta con `ids` vacío                   | `project/service.ts:353-387`, `:396-414`; `project/schema.ts:151`                                 |
| `translatingReferenceConstraints` traduce las claves foráneas del proyecto, la tarea y la etiqueta, y el `check` de TT-70; `bulkEditEntries` **no** la usa                                                                                                                         | `time-entry/service.ts:386-406`, `:1469-1524`                                                     |
| `assertAssignable` llama a `pairToCheck` y después a `assertTrackable`                                                                                                                                                                                                             | `service.ts:418-426`                                                                              |
| `updateEntry`: `closedEntryEdit` (descripción y trío por `editedFields`), después `assignmentFields` asíncrona = `assignedPair` → `billableChange` → `tagsChange`, después `writeEntryEdit`                                                                                        | `service.ts:1157-1170`, `:1199-1272`, `:1278-1303`, `:1311-1347`                                  |
| `evaluateAll` es síncrona; solo un `TimeEntryError` es un rechazo, cualquier otro error sale tal cual                                                                                                                                                                              | `service.ts:1354-1378`                                                                            |
| `bulkEditEntries`: permiso antes de leer, `lockEntries`, `evaluateAll` con `requireClosed(authorizeEntry(…))` y `editedFields`, una escritura `updateClosedFields` por fila que cambia, vista armada con las referencias de la lectura bajo bloqueo, `recordAudits` con `valuesOf` | `service.ts:1469-1524`; la vista en `:1507-1509`                                                  |
| `valuesOf(row, fields)` ya arma `projectId`/`taskId`, `billable` y `tagIds` si `fields` los trae                                                                                                                                                                                   | `service.ts:1451-1462`                                                                            |
| `sortedTagIdsOf(row)` ordena por nombre los ids de `row.tags`                                                                                                                                                                                                                      | `service.ts:178-180`                                                                              |
| `findManyByIdsForUpdate` bloquea con una sentencia que lee solo `time_entry`, `order by id`, y trae las referencias con una segunda                                                                                                                                                | `time-entry/repository.ts:294-319`                                                                |
| `updateClosedFields` acepta `ClosedColumns` (el par abierto y el facturable) y dice «la masiva no cambia el proyecto ni la tarea»; `updateClosedEntry` abre el par con `columnsOf`, salta el `update` sin columnas y escribe la unión con `replaceTags`                            | `repository.ts:84-101`, `:547-564`, `:630-641`                                                    |
| `replaceTags` son dos sentencias por entrada; `insertTags` usa `on conflict do nothing`; `deleteClosedByIds` tiene la guarda de la lista vacía                                                                                                                                     | `repository.ts:206-246`, `:653-656`                                                               |
| `selectWithRefs` y `toEntryWithRefs` arman las referencias; `rereadWithRefs` relee una fila                                                                                                                                                                                        | `repository.ts:145-200`                                                                           |
| La clave primaria de `time_entry_tag` es `(time_entry_id, tag_id)`                                                                                                                                                                                                                 | `src/server/db/schema.ts:477-507`, `:485`                                                         |
| `bulkEditEntries` de la action no cambia de firma; las actions revalidan `"/"` y `"/calendario"`                                                                                                                                                                                   | `time-entry/actions.ts:59-65`, `:183-191`                                                         |
| `project.track` y `tag.view` existen y los tiene `everyone`; `timeEntry.own.update` también                                                                                                                                                                                        | `src/server/permissions/index.ts:62`, `:69`, `:75`, `:123-131`                                    |
| Ayudantes locales de `service.integration.test.ts` que la masiva usa: `actorFor` y `seedClosed` (leen `workspaceId` y `actor` del archivo), `workspaceOf`, `rejectionOf`, `snapshotOf`                                                                                             | `service.integration.test.ts:100-111`, `:1892-1899`, `:5649-5672`                                 |
| `BulkChangesDraft` es `{ description, date, start, end }`; `toChanges` arma `BulkEditChanges` o `null`                                                                                                                                                                             | `time-entry/components/bulk-changes.ts:10-39`                                                     |
| El diálogo guarda el borrador en una `ref` (`draftRef`), lo cambia con `change`, calcula `idle` con `toChanges`, y «Quitar la fecha» lleva el foco al selector que queda                                                                                                           | `bulk-edit-dialog.tsx:126-179`; `clearDate` en `:159-163`                                         |
| El orden del diálogo hoy: Descripción, Fecha, Hora de inicio, Hora de fin                                                                                                                                                                                                          | `bulk-edit-dialog.tsx:189-257`                                                                    |
| `BulkActions` manda `changes` tal como los da el diálogo; el aviso de un error del pedido muestra título y mensaje, sin lista, y «Reintentar» solo con `unexpected`                                                                                                                | `bulk-actions.tsx:90-99`, `:167-171`, `:354-362`                                                  |
| `ProjectPicker` recibe `value: ProjectSelection`; con `variant="row"` y sin proyecto dibuja «Sin proyecto»; marca la opción igual a `value`; acepta `triggerRef`; sus vacíos van en `ComboboxEmpty`                                                                                | `project/components/project-picker.tsx:35-48`, `:117-132`, `:149-169`, `:189`                     |
| `TagPicker` con `variant="bar"` y sin etiquetas dibuja el ícono y «Etiquetas»; avisa el conjunto al cerrar (D-5); acepta `triggerRef`                                                                                                                                              | `project/components/tag-picker.tsx:29-43`, `:96-114`, `:164-176`                                  |
| `NO_SELECTION`, `sameSelection`, `selectionIds`; `tagIdsOf`                                                                                                                                                                                                                        | `picker-model.ts:37`, `:112-119`; `tag-picker-model.ts:68-70`                                     |
| `TrackingCatalogProvider` envuelve a `EntryList`, que dibuja `BulkActions`                                                                                                                                                                                                         | `tracker-screen.tsx:49-76`; `entry-list.tsx:205`                                                  |
| `RadioGroup` de `ui/radio-group.tsx` ya se usa con `aria-labelledby` y `aria-describedby`                                                                                                                                                                                          | `project/components/color-field.tsx:30-51`                                                        |
| Textos que ya existen: `trackerLabels.billable` «Facturable», `noChange` «Sin cambios», `clearDate`; `calendarLabels.project` «Proyecto», `billableYes` «Sí», `billableNo` «No»; `projectLabels.tags` «Etiquetas»                                                                  | `labels.ts:34`, `:76-77`; `calendar/labels.ts:82-85`; `project/components/labels.ts:52`           |
| e2e: `projectPicker`, `pickProject`, `tagPicker`, `pickTags`, `bulkEditDialog`, `entryCheckbox`, `bulkButton`; `seedProject` con `billableByDefault` y `tasks`, `archiveProject`, `archiveTag`, `markTaskDone`; **no hay `seedTag`**                                               | `e2e/tracker-page.ts:224-272`, `:333-401`, `:588-624`; `e2e/database.ts:105-128`, `:174-251`      |
| e2e: `openSecondTab` en `e2e/network.ts`; dos copias de `expectAppliedElsewhere`, con comprobaciones distintas, y una tercera parecida en `bulk-actions.spec.ts`                                                                                                                   | `e2e/network.ts:60`; `start-retry.spec.ts:48`; `projects.spec.ts:219`; `bulk-actions.spec.ts:332` |
| Fábricas: `seedTimeEntry` con `projectId`, `taskId`, `billable` y `tagIds`; `seedProject`, `seedTask`, `seedTag` con `archived`; `raceThroughBarrier`, `queueBehindBarrier`, `waitForBlockedBackends`                                                                              | `src/test/factories.ts:103-129`, `:166-239`; `src/test/concurrency.ts:56`, `:123`, `:150`         |

## 1. Alcance

Entra:

- **TT-63, el resto**: cambiar en bloque el proyecto y la tarea (también a «Sin
  proyecto»), las etiquetas agregando a las que cada entrada tiene o
  reemplazándolas, y el facturable.

Entran por arrastre, verificándose por el camino nuevo:

- **TT-14 y D-2**: el facturable de cada fila después de cambiarle el proyecto
  en bloque.
- **TT-77, TT-78, TT-08 y TT-70**: el proyecto, la tarea o la etiqueta no
  disponibles, el proyecto privado sin acceso, la tarea sin proyecto.
- **TT-104, PR-47 y PR-68**: lo archivado que una entrada ya tiene se conserva
  y no se valida.
- **PR-48 y D-4**: el tope de 50 por entrada, ahora alcanzable por la suma.
- **TT-79, TT-80, TT-110, TT-111**: los rechazos por fila del 6 valen también
  para los campos nuevos (TT-110 no frena un cambio que no toca el horario).
- **TT-55, TT-89, TT-90, TT-92, P-15**: sin cambios respecto del 6.

### Lo que el slice decide y que la paridad tiene que registrar

- **El facturable de cada entrada sigue D-2 por fila** (D12-5): elegir un
  proyecto en bloque con el facturable en «Sin cambios» le pone el por defecto
  de ese proyecto a cada entrada que cambia de proyecto, y deja como está el de
  las que ya estaban en él o pasan a «Sin proyecto». Elegir «Sí» o «No» gana en
  todas. Diseño propio; el facturable no se puede verificar en el plan Free
  (P-16 de `proyectos.md`).
- **«Agregar» suma a las que cada entrada ya tiene; «Reemplazar» deja las
  elegidas** (TT-63 lo documenta; ver la nota de §6 para `parity-analyst`).
  «Reemplazar» sin ninguna deja las entradas sin etiquetas (D12-3). Diseño
  propio, _no verificado_ (P-14).
- **Lo archivado que una entrada ya tiene se conserva**: «Agregar» no le quita
  una etiqueta archivada; cambiar solo las etiquetas o el facturable no toca su
  proyecto archivado.
- **Un proyecto, una tarea o una etiqueta no disponibles frenan el pedido
  entero**, sin lista de filas (ADR 0011, ADR 0017), aunque la falla dependa de
  qué filas se eligieron: el remedio es elegir otra referencia. Con el proyecto
  y una etiqueta no disponibles a la vez, responde el proyecto.
- **Más de 50 etiquetas en una entrada es un rechazo de esa fila** (D12-4).
- **El diálogo gana tres secciones**, cada una con su «Sin cambios»: el
  selector de proyecto, el de etiquetas con «Agregar» o «Reemplazar», y el
  facturable con «Sin cambios», «Sí» y «No».

**Lo registra `parity-analyst` antes del merge** (§6): lo de arriba en TT-63;
la sección «Slice 12» de §11; «Lo que queda», que pasa a decir que no queda
nada salvo lo fuera de alcance; y la corrección con fecha de TT-63 («el
proyecto, la tarea, las etiquetas y el facturable en bloque quedan para el
slice 12» deja de valer).

### Queda afuera

- **Continuar, duplicar y descartar en masa**: Clockify no los documenta (como
  en el 6).
- **Vaciar la descripción en bloque** (deuda del 6).
- **Elegir en bloque un proyecto o una etiqueta archivados**: el selector no
  los ofrece y el servidor los rechaza (TT-77, TT-78).
- **Editar en bloque la entrada que corre**: no es una fila (TT-111).
- **Crear un proyecto o una etiqueta desde el diálogo** (TT-09, TT-13).
- **Cualquier cambio en el borrado masivo** (TT-64).

### Consecuencias sobre código ya entregado

| Archivo                                      | Qué cambia                                                                                                                                                                               | Qué hay que volver a probar                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time-entry/schema.ts`                       | `entryPair` sube antes de `bulkEditChanges`, que suma `project`, `billable` y `tags` (§4.1).                                                                                             | `schema.test.ts` entero                                                                                                                                                                        |
| `time-entry/assignment.ts`                   | Suma `tagsAfter` (§4.2).                                                                                                                                                                 | `assignment.test.ts`                                                                                                                                                                           |
| `time-entry/service.ts`                      | Las funciones del par, el facturable y las etiquetas de `updateEntry` pasan a tres fases que también usa la masiva (§4.3); `bulkEditEntries` suma la fase de referencias y relee (§4.5). | Los `describe` de `updateEntry` del 8c, del 11a y del 11b (`service.integration.test.ts:7081-7730`, `:7946`, `:8523`), sin cambiar afirmaciones; los de `bulkEditEntries` del 6 (`:5674-6466`) |
| `time-entry/repository.ts`                   | Suma `updateClosedEntries` (§4.6); `updateClosedFields` pierde la frase de que la masiva no cambia el proyecto.                                                                          | `las guardas de las escrituras de las operaciones en masa` (`service.integration.test.ts:6466`)                                                                                                |
| `time-entry/service.integration.test.ts`     | Solo importa los ayudantes que suben a `src/test/time-entry.ts` (m6).                                                                                                                    | El archivo entero, sin cambiar afirmaciones                                                                                                                                                    |
| `project/components/project-picker.tsx`      | `value` admite `null` con `placeholder` (§5.3).                                                                                                                                          | `project-picker.test.tsx`; `e2e/project-picker.spec.ts`; el selector de la barra, la fila y el diálogo del calendario                                                                          |
| `time-entry/components/bulk-changes.ts`      | El borrador suma `selection`, `tagMode`, `tags` y `billable`; `toChanges` los traduce.                                                                                                   | `bulk-changes.test.ts`                                                                                                                                                                         |
| `time-entry/components/bulk-edit-dialog.tsx` | Tres secciones nuevas y el orden de §5.2.                                                                                                                                                | `e2e/bulk-actions.spec.ts` entero                                                                                                                                                              |
| `time-entry/components/labels.ts`            | Textos de §6.                                                                                                                                                                            | —                                                                                                                                                                                              |

## 2. Cambios de esquema

**Ninguno.** Las columnas `project_id`, `task_id` y `billable` de `time_entry`
y la tabla `time_entry_tag` existen desde el 10 y el 11. No hace falta índice
nuevo: el `update` por fila usa `time_entry_pkey`; el `delete` y el `insert` de
la unión filtran por `time_entry_id`, que es el prefijo de su clave primaria
`(time_entry_id, tag_id)` (`schema.ts:485`); la relectura usa
`time_entry_pkey` y las claves del 10 y el 11 para las referencias.

## 3. Permisos

**Ninguna acción nueva.** `src/server/permissions/` no cambia.

| Qué se decide                                | Acción de `can()`      | Quién la consulta                                                                      |
| -------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| La membresía puede editar sus entradas       | `timeEntry.own.update` | la action y el service, sobre `ownTimeEntryResource(actor)`, antes de leer (como el 6) |
| Cada fila es propia                          | `timeEntry.own.update` | `authorizeEntry`, por fila (como el 6)                                                 |
| La persona puede cargar horas en el proyecto | `project.track`        | `assertTrackable` de `project`, una vez por pedido (ADR 0010, ADR 0017)                |
| La persona puede usar las etiquetas          | `tag.view`             | `assertTaggable` de `project`, una vez por pedido                                      |

- **No hay una acción `timeEntry.own.bulk…`**, por la misma razón que en el 6:
  Clockify no distingue editar de a una de editar en bloque (TT-66).
- **Un proyecto privado sin acceso responde como uno que no existe** (TT-08,
  TT-77): es la regla de `assertTrackable`, que no se copia.

## 4. Contrato de las server actions

**Ninguna action nueva ni cambio de firma.** `bulkEditEntries` gana campos en
su entrada; su resultado (`BulkEditEntriesResult`), sus códigos
(`TimeEntryErrorCode`), su revalidación (`"/"` y `"/calendario"`) y
`bulkDeleteEntries` no cambian.

### 4.1 Los tipos

**`entryPair` sube en `schema.ts` antes de `bulkEditChanges`**: hoy se declara
después (`:245-250`), y usarlo en `bulkEditChanges` (`:223`) sería un uso antes
de la declaración (TS2448). El comentario de `bulkEditChanges` deja de decir
«un campo que este slice no conoce —el proyecto, antes del slice 12— se
rechaza»: pasa a ser el de abajo.

```ts
/**
 * Cómo cambian las etiquetas de cada entrada: «add» suma a las que tiene,
 * «replace» deja exactamente las pedidas. Estricto, con el texto de
 * `unexpected`: ninguna interfaz manda otra cosa.
 */
const bulkTags = z.discriminatedUnion(
  "mode",
  [
    z.strictObject(
      {
        mode: z.literal("add"),
        // Agregar ninguna no es un cambio: el diálogo no lo manda.
        ids: z
          .array(z.uuid())
          .min(1, timeEntryMessages.unexpected)
          .max(TAGS_MAX, timeEntryMessages.tooManyTags)
          .transform(normalizedIds),
      },
      { error: timeEntryMessages.unexpected },
    ),
    z.strictObject(
      { mode: z.literal("replace"), ids: tagIds },
      { error: timeEntryMessages.unexpected },
    ),
  ],
  { error: timeEntryMessages.unexpected },
);

/**
 * Lo que cambia en cada entrada. Un campo ausente no cambia; uno presente
 * reemplaza, también con "" en la descripción. `project` es el par entero,
 * como en `updateEntryChanges`: `null` en los dos es «Sin proyecto».
 * `billable` presente gana sobre el por defecto del proyecto (D-2). Estricto
 * en cada nivel: una clave que no se conoce se rechaza con el texto de
 * `unexpected` y no con el de Zod, que está en inglés.
 */
export const bulkEditChanges = z
  .strictObject(
    {
      description: description.optional(),
      date: dayKeyInput.optional(),
      start: clockInput.optional(),
      end: clockInput.optional(),
      project: entryPair.optional(),
      billable: z.boolean().optional(),
      tags: bulkTags.optional(),
    },
    { error: timeEntryMessages.unexpected },
  )
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    timeEntryMessages.bulkNoChanges,
  );

/** El modo y los ids de las etiquetas en bloque, ya normalizados. */
export type BulkTagsChange = z.output<typeof bulkTags>;
```

- **El par va agrupado en `project`**, no en dos campos planos como esbozaba el
  §4.8 del 6: es la forma de `updateEntryChanges` (ADR 0013), reusa `entryPair`
  con su `refine` de TT-70 y su texto, y la masiva y el diálogo de una entrada
  piden lo mismo con la misma forma.
- **`tags` tiene la misma clave que en `updateEntryChanges` y otra forma**: allá
  es el conjunto entero de una entrada (D-5); acá, un modo y una lista que se
  combina con lo que tiene cada fila. Los dos esquemas son estrictos, así que
  mandar una forma a la action equivocada es `validation` con `unexpected`.
- **Sin textos nuevos en `timeEntryMessages`**: el tope reusa `tooManyTags`, el
  pedido vacío `bulkNoChanges`, y lo que ninguna interfaz manda, `unexpected`.
- `bulkEditEntriesInput`, `BulkEditEntriesInput`, `BulkEditEntriesValues` y
  `BulkEditChanges` no cambian de nombre; `BulkEditChanges` gana los campos.

### 4.2 `tagsAfter`, en `assignment.ts`

```ts
/**
 * El conjunto que una entrada debería tener después del pedido en bloque:
 * «replace», las pedidas; «add», las que tiene más las pedidas. Normalizado
 * con `normalizedIds`. Las que ya tiene se conservan aunque estén archivadas
 * (PR-47): `tagsToCheck` no las va a validar.
 */
export function tagsAfter(current: readonly string[], change: BulkTagsChange): string[];
```

Es pura y vive al lado de `pairToCheck` y `tagsToCheck`, con su test de unidad.

### 4.3 Una regla del par, el facturable y las etiquetas, en tres fases

Hoy `updateEntry` decide el par, el facturable y las etiquetas en
`assignmentFields` (`service.ts:1259-1272`), asíncrona, que consulta a
`project` en el medio. La masiva no puede llamarla por fila: serían hasta 600
consultas, una falla del proyecto saldría de la evaluación como error del
pedido sin pasar por la lista, y **qué error gana dependería del orden de las
filas** (abajo). **La regla se parte en tres funciones privadas de
`service.ts`, y `updateEntry` y la masiva llaman a las tres** (ADR 0017). No
hay un segundo camino: si una regla cambia, cambia para las dos, como
`editedFields` desde el 6.

```ts
/** Lo que un pedido pide a una fila en el par, el facturable y las etiquetas. */
type AssignmentRequest = {
  readonly project?: ProjectPair;
  readonly billable?: boolean;
  /** El conjunto entero que la fila debería tener. */
  readonly tagIds?: readonly string[];
};

/** Lo que cambia en una fila y lo que hay que validar para eso, sin consultar nada. */
type AssignmentPlan = {
  /** El par pedido, si difiere del de la fila (`samePair`). */
  readonly pair?: ProjectPair;
  /** `pairToCheck(fila, pedido)` cuando hay `pair`; `null` si no hay nada que validar. */
  readonly pairCheck: {
    readonly projectId: string;
    readonly taskId: string | null;
  } | null;
  readonly billable?: boolean;
  /** El conjunto pedido, si difiere del de la fila (`sameTagIds`). */
  readonly tagIds?: readonly string[];
  /** `tagsToCheck(fila, conjunto)`: las que la fila todavía no tiene. */
  readonly tagsCheck: readonly string[];
};

/**
 * Fase 1, pura: el plan de una fila. Lanza `TimeEntryError("validation",
 * tooManyTags)` si el conjunto pasa de `TAGS_MAX` (D-4): depende de la fila,
 * así que en la masiva es un rechazo. En `updateEntry` no se alcanza por la
 * action, porque Zod ya acota el conjunto.
 */
function assignmentPlan(row: EntryWithRefs, request: AssignmentRequest): AssignmentPlan;

/**
 * Fase 2: las validaciones de `project` (ADR 0010), una vez por pedido y en
 * este orden, para el pedido entero y no plan por plan:
 * 1. el par: el `pairCheck` de cualquier plan que no sea nulo —son todos
 *    iguales, porque `pairToCheck` devuelve el pedido—, con `assertTrackable`;
 * 2. las etiquetas: la unión de los `tagsCheck` de todos los planes, con
 *    `assertTaggable`, que no consulta si queda vacía.
 * Es el orden de `updateEntry`. Devuelve el proyecto validado, o `null` si
 * ningún plan lo pidió.
 */
async function assertAssignments(
  tx: Transaction,
  actor: Actor,
  plans: readonly AssignmentPlan[],
): Promise<TrackableProject | null>;

/**
 * Fase 3, pura: lo que se escribe. El facturable es el pedido o, sin él,
 * `billableFor(fila, plan.pairCheck === null ? null : proyecto)` (D-2), y solo
 * si difiere del de la fila.
 */
function assignmentFields(
  row: EntryWithRefs,
  plan: AssignmentPlan,
  project: TrackableProject | null,
): Pick<ClosedEntryFields, "pair" | "billable" | "tagIds">;
```

- **Para el pedido entero, no plan por plan.** Validar el par y las etiquetas
  de cada plan en el orden de las filas no es equivalente: con P y X
  archivados, una fila `r1` en P sin X y una fila `r2` con X fuera de P,
  pedirles P y «Agregar» X hace que `r1` solo pida validar X y `r2` solo pida
  validar P. Plan por plan responde `tagUnavailable`; para el pedido entero, el
  par primero, `projectUnavailable`. El contrato fija lo segundo y lo afirma el
  criterio 22.
- **La guarda `pairCheck === null ? null : proyecto` es redundante**: con
  `pairCheck` no nulo en algún plan, `assertAssignments` devuelve el proyecto, y
  `billableFor` ya conserva con el mismo proyecto. Es inofensiva y no cuenta
  como mutante que tenga que caer.
- **`updateEntry`** queda: leer y autorizar, `closedEntryEdit` o
  `runningEntryEdit`, `assignmentPlan` con `{ project, billable, tagIds: tags }`
  de los cambios, `assertAssignments` con ese único plan, `assignmentFields`,
  `writeEntryEdit`. El orden de las consultas y de los rechazos no cambia:
  primero el estado de la fila y el horario, después el par, después las
  etiquetas. `assignedPair`, `billableChange`, `tagsChange` y la
  `assignmentFields` asíncrona de hoy desaparecen. **Es un commit propio, sin
  cambio de conducta, con la suite existente en verde** (handshake, paso 1).
- **La masiva** arma el pedido de cada fila con
  `{ project: changes.project, billable: changes.billable, tagIds: changes.tags === undefined ? undefined : tagsAfter(sortedTagIdsOf(fila), changes.tags) }`.

### 4.4 Qué pasa con cada fila

La evaluación por fila de §4.3 del 6 gana un paso; los demás no cambian. En el
orden pedido y sin escribir:

1. `authorizeEntry(actor, "timeEntry.own.update", fila)`: `not_found` si no
   está, `forbidden` con el texto de TT-79 si es ajena. **Rechazo.**
2. `requireClosed`: la que corre es `timer_running` con `runningEntryTimes`
   (TT-111), **también si el cambio es solo el proyecto, las etiquetas o el
   facturable**: una operación en masa es sobre filas. **Rechazo.**
3. `editedFields`: la descripción y el trío, como en el 6. Una entrada de más
   de un día (TT-110) solo se rechaza si el pedido le cambia el horario: con un
   proyecto, etiquetas o facturable y sin fecha ni horas, no se evalúa el trío
   y pasa. **Rechazo** con las causas de §4.5 del 6.
4. **`assignmentPlan`** con el pedido de la fila. Con «Agregar», si el conjunto
   pasa de 50: `validation` con `tooManyTags`. **Rechazo** (D12-4).

Cómo queda cada caso, ya evaluadas las reglas:

| La fila                          | El pedido                                     | Resultado en la fila                                                                                 |
| -------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sin proyecto, no facturable      | Proyecto P (por defecto facturable)           | P, facturable (D-2)                                                                                  |
| En P, no facturable              | P con la tarea T                              | P: T, sigue no facturable (D-2: el mismo proyecto conserva); el par se valida                        |
| En P: T                          | P sin tarea                                   | P, sin tarea; no se valida (`pairToCheck`, «el mismo proyecto sin la tarea»); conserva el facturable |
| En Q, facturable                 | «Sin proyecto»                                | sin proyecto, facturable; no se valida                                                               |
| En Q                             | P con «No»                                    | P, no facturable: el pedido gana sobre el por defecto                                                |
| En P archivado                   | Solo etiquetas o solo facturable              | conserva P; el par no se toca ni se valida (TT-104)                                                  |
| En P archivado                   | P                                             | sin cambios en el par; no se valida (`samePair`)                                                     |
| En P archivado                   | Q                                             | Q, con el facturable de Q (D-2)                                                                      |
| Con A archivada                  | «Agregar» B                                   | A y B; solo B se valida (PR-47)                                                                      |
| Con A archivada                  | «Reemplazar» por B                            | solo B; A sale                                                                                       |
| Con A archivada                  | «Reemplazar» por A y B                        | A y B; solo B se valida en esta fila                                                                 |
| Con 49 etiquetas                 | «Agregar» dos que no tiene                    | rechazo de la fila, `tooManyTags`                                                                    |
| Con X                            | «Agregar» X                                   | sin cambios en las etiquetas; no se escribe ni se valida                                             |
| Con X                            | «Reemplazar» por ninguna                      | sin etiquetas (D12-3)                                                                                |
| De más de un día (TT-110)        | Proyecto, etiquetas o facturable, sin horario | cambia; el trío no se evalúa                                                                         |
| Ajena, ya borrada o la que corre | Cualquiera                                    | rechazo de la fila, con el texto de su operación de una fila                                         |

Lo que una fila «ya tiene» la exime de la validación **solo a ella**: si otra
fila del mismo pedido asigna esa referencia de nuevo, se valida, y si no está
disponible falla el pedido entero (criterio 7).

### 4.5 `bulkEditEntries`: el algoritmo

En una transacción, envuelta en `translatingReferenceConstraints`:

1. `can(actor, "timeEntry.own.update", ownTimeEntryResource(actor))`; si no,
   `forbidden`. Antes de leer, como hoy.
2. `lockEntries`: `findManyByIdsForUpdate`, **las dos sentencias de hoy**. Las
   etiquetas que «Agregar» combina salen de la segunda, tomada con el bloqueo
   ya puesto: con otra conexión que cambió las etiquetas de una fila y
   confirmó, la suma parte de lo confirmado y no de la foto de antes de
   esperar. Importa porque la escritura de §4.6 fija el conjunto entero: una
   suma hecha sobre la foto vieja borraría lo que la otra conexión agregó.
3. **Fase 1 por fila** (§4.4), con `evaluateAll`, que sigue síncrona: cada
   evaluación devuelve `{ row, fields: editedFields(…), plan: assignmentPlan(…) }`.
4. **Si hubo algún rechazo**, `RejectedError(bulkEditRejected, rechazos)`,
   como hoy. **Las filas van antes que las referencias** (D12-2): con una fila
   rechazada y el proyecto archivado a la vez, la respuesta es `rejected` con la
   lista; quitadas las filas, el segundo intento responde el proyecto.
5. **Fase 2, una vez por pedido**: `assertAssignments(tx, actor, planes)`, con
   todos los planes: primero el par, después la unión de las etiquetas (§4.3).
   Un `ProjectError` sale tal cual —`not_found` con `projectUnavailable`,
   `taskUnavailable` o `tagUnavailable`, sin `rejections`— y la transacción se
   revierte. Si ningún plan asigna nada nuevo, no consulta: un pedido que pide
   lo que las filas ya tienen termina bien aunque lo pedido esté archivado.
6. **Fase 3 por fila**: `{ ...fields, ...assignmentFields(row, plan, proyecto) }`.
   Una fila sin campos no se escribe.
7. **Escribir**: `updateClosedEntries(tx, escrituras)` (§4.6) con las filas que
   cambian. Si devuelve `undefined` —una fila no se escribió con su bloqueo
   tomado, que el bloqueo hace imposible—, error sin traducir y la transacción
   se revierte entera, como hoy en `:1504-1506`.
8. `recordAudits` con una constancia `timeEntry.bulkEdit` por fila escrita:
   `previousValue: valuesOf(leída, campos)`, `nextValue: valuesOf(releída, campos)`.
   `valuesOf` ya arma `projectId` y `taskId`, `billable` y `tagIds` (§4.9).
9. Devuelve `{ entries }` en el orden pedido: **la releída** para una fila
   escrita, la leída en el paso 2 para una sin cambios. Desaparece el armado de
   `:1507-1509`, que pegaba las referencias de la lectura a la fila escrita:
   con el par o las etiquetas cambiados, esas referencias son las de antes
   (§4.8 del 6, B1 de sus correcciones).

### 4.6 La escritura, en el repository

```ts
/**
 * Escribe varias filas cerradas de una operación en masa y las relee con sus
 * referencias. Por cada escritura con columnas, un `update` sobre su destino
 * con `ended_at is not null`, como `updateClosedFields`; el par se abre en sus
 * dos columnas, como `columnsOf`. Las etiquetas, en dos sentencias para todas
 * las escrituras **que traen `tagIds`** —el conjunto entero de cada una—: un
 * `delete` de las filas de la unión que sobran y un
 * `insert … on conflict do nothing` de las que faltan. Una escritura sin
 * `tagIds` no entra en ninguna de las dos. Una relectura de todas las
 * escritas, con `selectWithRefs`. `undefined` si algún `update` no tocó su
 * fila. Devuelve en el orden de `writes`.
 */
updateClosedEntries(
  tx: Transaction,
  writes: readonly { readonly target: EntryTarget; readonly fields: ClosedEntryFields }[],
): Promise<readonly EntryWithRefs[] | undefined>;
```

- **Las dos sentencias de la unión filtran solo por los destinos de las
  escrituras que traen `tagIds`** (B1 de la ronda 1). Filtrar por todas las
  escrituras borraría el conjunto entero de una fila que en el mismo pedido
  cambia solo el par o el facturable: sus pares no están en la lista de los que
  quedan. Lo afirma el criterio 21.
- **Los pares viajan como dos arreglos con `unnest`**: `time_entry_id` y
  `tag_id` de cada par, en `$entries::uuid[]` y `$tags::uuid[]`, más los
  destinos con etiquetas en `$targets::uuid[]` y el `workspace_id`. El
  `insert` es `insert … select $ws, e, t from unnest($entries, $tags) as p(e, t)
on conflict do nothing`; el `delete` borra de la unión las filas con
  `workspace_id = $ws`, `time_entry_id = any($targets)` y un par que no está
  en `unnest($entries, $tags)` (`not exists`). Son cuatro parámetros en
  cualquier caso. Con un parámetro por columna y por par, el peor caso —200
  filas por 50 etiquetas, 10 000 pares— serían 30 000 parámetros en el
  `insert`, debajo del límite de 65 535 de Postgres pero sin margen para
  subir el tope de 200.
- **Los conjuntos vacíos tienen guarda**, como `deleteClosedByIds`
  (`repository.ts:653-656`): sin escrituras con `tagIds` no hay sentencias
  sobre la unión; con arreglos de pares vacíos, el `delete` borra todas las
  filas de la unión de esos destinos (es «Reemplazar» por ninguna) y no hay
  `insert`.
- **Los destinos salen de `targetOf`** sobre filas leídas y autorizadas: el
  `update` repite `workspace_id` y `user_id` (`isTarget`); las dos sentencias
  de la unión filtran por el `workspace_id` de los destinos, que es uno solo
  —el de la sesión—, y por sus `time_entry_id`, como `replaceTags`.
- **No hay `update` sin columnas**: una fila que cambia solo etiquetas no toca
  `time_entry` (Drizzle rechaza `set({})`, m8 del arranque del 11b). Que esté
  cerrada lo decidió el service bajo el bloqueo.
- `updateClosedFields` queda para `updateClosedEntry` y pierde la frase «la
  masiva no cambia el proyecto ni la tarea».

### 4.7 Bloqueos y costo

- **Los bloqueos no cambian**: una sentencia, `order by id`, sobre
  `time_entry` (ADR 0011). La unión no se bloquea aparte: sus filas solo las
  escribe quien tiene bloqueada la entrada. Las claves foráneas de la unión
  toman `for key share` sobre `tag`, compatible entre dos masivas.
- **Sentencias**, con el tope de 200: dos de lectura con bloqueo; a lo sumo dos
  de referencias de proyecto (`findProject`, `findTask`) y una de etiquetas
  (`findTags`); a lo sumo 200 `update`; a lo sumo dos sobre la unión; una
  relectura; una inserción de auditoría. **Peor caso: 209**, en una
  transacción. Con `replaceTags` por fila serían 400 sentencias sobre la unión;
  por eso van agrupadas.
- **Validar para el pedido entero no es lo mismo que validar plan por plan**:
  cambia qué error gana, y lo afirma el criterio 22. **Lo único sin test es la
  cantidad de consultas**, que no se observa desde afuera del service: lo
  revisa `backend-reviewer` contra §4.3 y el ADR 0017.

### 4.8 Las causas

Las del 6 (§4.5 de su contrato) siguen igual. Se suman:

| Causa                                                       | Código       | Texto                | Alcance          |
| ----------------------------------------------------------- | ------------ | -------------------- | ---------------- |
| La entrada quedaría con más de 50 etiquetas (D-4)           | `validation` | `tooManyTags`        | rechazo de fila  |
| El proyecto pedido no está, está archivado o no hay acceso  | `not_found`  | `projectUnavailable` | el pedido entero |
| La tarea pedida no está, está hecha o no es de ese proyecto | `not_found`  | `taskUnavailable`    | el pedido entero |
| Alguna etiqueta pedida no está o está archivada             | `not_found`  | `tagUnavailable`     | el pedido entero |
| Una referencia se borró entre la validación y la escritura  | `not_found`  | el mismo, por la red | el pedido entero |
| Tarea sin proyecto (TT-70)                                  | `validation` | `taskNeedsProject`   | el pedido (Zod)  |
| Más de 50 ids en `tags`                                     | `validation` | `tooManyTags`        | el pedido (Zod)  |
| Modo desconocido, clave desconocida o «add» sin ids         | `validation` | `unexpected`         | el pedido (Zod)  |

- **Con el par y una etiqueta no disponibles a la vez**, responde el par (§4.3).
- **Un error del pedido entero no lleva `rejections`**, y la interfaz lo
  muestra como hoy: título y mensaje, sin «Reintentar» (no es `unexpected`).
- **La red de la base** (`translatingReferenceConstraints`, para una
  referencia borrada entre la validación y la escritura) **queda sin test por
  el service**, igual que en `updateEntry`: en la fase 1 nada borra proyectos,
  tareas ni etiquetas.

### 4.9 Auditoría

- **`timeEntry.bulkEdit`**, una por fila escrita, con solo los campos que
  cambiaron: `description`, `startedAt`, `endedAt`, `projectId` y `taskId`
  juntos, `billable`, `tagIds` (ordenados por nombre, como `sortedTagIdsOf`).
- **Una fila sin cambios no deja constancia**; un pedido rechazado o con una
  referencia no disponible, ninguna.
- No hay acción de auditoría nueva.

### 4.10 Reintentar

- **La edición sigue llegando a un punto fijo** (ADR 0011): el segundo intento
  encuentra en cada fila el par pedido (`samePair`), el facturable pedido o el
  que D-2 ya dejó (el par igual no vuelve a imponer el por defecto), y el
  conjunto que `tagsAfter` da sobre lo que ya tiene, que es el mismo. No
  escribe, no registra, **no valida** —ninguna fila asigna nada nuevo— y
  responde las mismas vistas.
- **Por eso el reintento termina bien aunque el proyecto o la etiqueta se
  archiven entre los dos intentos**, y lo afirma un criterio (§7, criterio 9).
- «Reintentar» se ofrece como hoy: con `unexpected` y mientras todas las
  entradas del pedido sigan elegidas (`bulk-actions.tsx`, sin cambios).

### 4.11 Revalidación y P-15

Sin cambios: `"/"` y `"/calendario"`, también con error. El proyecto y las
etiquetas no mueven entradas de semana; la regla de P-15 sigue aplicándose a
las vistas que vuelven, por la fecha.

## 5. Contrato de pantalla

### 5.1 Lectura

**Nada cambia en `getTrackerState`.** El catálogo que necesitan los selectores
ya viaja en `TrackingCatalogProvider`, que envuelve a `EntryList` y por lo tanto
a `BulkActions` y al diálogo.

### 5.2 El diálogo «Editar N entradas»

En este orden, todos en «Sin cambios» al abrir, con la ayuda de siempre, «Lo
que dejes vacío no cambia.»:

1. **Descripción**, como hoy. Al abrir, el foco va acá.
2. **Proyecto**: el rótulo visible «Proyecto» (`calendarLabels.project`, que no
   se define de nuevo) y el `ProjectPicker` con `variant="row"`, `label`
   «Proyecto», `value={null}` y `placeholder` «Sin cambios». Elegir una opción
   la muestra en el disparador: el punto y el nombre, «P: T», o «Sin proyecto».
   Con algo elegido, al lado, **«No cambiar el proyecto»**, que vuelve a «Sin
   cambios» y lleva el foco al disparador (como «Quitar la fecha»).
3. **Etiquetas**: el rótulo visible «Etiquetas» y el `TagPicker` con
   `variant="bar"`, `label` «Etiquetas» y el borrador como `value`. Debajo, un
   grupo de opciones llamado «Cómo se aplican las etiquetas», con «Agregar a
   las que tienen» (elegida al abrir) y «Reemplazar las que tienen». Con
   «Reemplazar» y ninguna etiqueta elegida, el texto «Las entradas quedan sin
   etiquetas.» a la vista, asociado al grupo con `aria-describedby` (D12-3). Con
   «Reemplazar» elegido o con alguna etiqueta elegida, al lado del selector,
   **«No cambiar las etiquetas»**, que vuelve a «Agregar» sin etiquetas y lleva
   el foco al disparador.
4. **Facturable**: un grupo de opciones llamado «Facturable» con «Sin cambios»
   (elegida al abrir), «Sí» y «No» (`calendarLabels.billableYes`,
   `billableNo`). Con un proyecto elegido —no «Sin proyecto»— y «Sin cambios»,
   el texto «Las entradas que cambian de proyecto toman el facturable por
   defecto de ese proyecto; las que ya estaban en él conservan el suyo.» a la
   vista, asociado con `aria-describedby` (D12-5).
5. **Fecha**, **Hora de inicio** y **Hora de fin**, como hoy.

- **«Guardar»** queda inactivo (`aria-disabled`) mientras `toChanges` dé `null`
  y no haya una hora tecleada sin confirmar, como hoy.
- **Mientras la edición viaja**, los selectores y los grupos siguen activos,
  como los campos de hoy (§5.4 del 6): lo que se cambie no viaja.
- **Los selectores dentro del diálogo**: `Escape` con el popup abierto cierra
  solo el popup, también con la lista filtrada vacía (los dos selectores ya
  montan `ComboboxEmpty`, m12 y m13 del 11b), y el foco vuelve a su disparador.
  Un segundo `Escape` cierra el diálogo y devuelve el foco a «Editar».
- **El resto del diálogo, la barra, el aviso y el foco no cambian** (§5.2 a
  §5.4 del 6). El aviso de un error del pedido (§4.8) es el de hoy: «No se
  pudieron editar las entradas.» con el mensaje, sin lista y sin «Reintentar»;
  el diálogo queda abierto con el borrador.
- **Al terminar bien**, la lista revalidada muestra en cada fila su proyecto,
  sus etiquetas y su facturable nuevos; no hay vista optimista de los campos,
  solo las filas atenuadas de TT-55, como hoy.

### 5.3 `ProjectPicker` con «Sin cambios»

```ts
type ProjectPickerProps = PickerCommonProps &
  (
    | { readonly value: ProjectSelection; readonly placeholder?: never }
    | {
        /** `null`: nada elegido; el disparador muestra `placeholder` y ninguna opción queda marcada. */
        readonly value: ProjectSelection | null;
        readonly placeholder: string;
      }
  );
```

`PickerCommonProps` son las props de hoy menos `value` (`project-picker.tsx:35-48`).

- Con `value` nulo, el disparador dibuja el ícono de carpeta y `placeholder` en
  gris; elegir cualquier opción, también «Sin proyecto», avisa `onChange`.
- Los usos de hoy (barra, fila, diálogo del calendario) pasan una
  `ProjectSelection` y no cambian.
- No se toca `picker-model.ts`: «Sin proyecto» sigue saliendo de `pickerView`
  con la búsqueda vacía.

### 5.4 El borrador

```ts
export type BulkTagMode = "add" | "replace";

export type BulkChangesDraft = {
  readonly description: string;
  readonly date: string | null;
  readonly start: string;
  readonly end: string;
  /** `null` sin cambios; `NO_SELECTION` es «Sin proyecto». */
  readonly selection: ProjectSelection | null;
  readonly tagMode: BulkTagMode;
  readonly tags: readonly TagRef[];
  /** `null` sin cambios. */
  readonly billable: boolean | null;
};
```

`toChanges` suma, con la misma regla de «solo lo que tiene algo»:

- `project: selectionIds(selection)` si `selection` no es `null`;
- `tags: { mode: "add", ids }` si `tagMode` es «add» y hay etiquetas;
  `tags: { mode: "replace", ids }` si es «replace», **también sin etiquetas**
  (D12-3);
- `billable` si no es `null`.

`emptyBulkChanges` arranca con `selection: null`, `tagMode: "add"`, `tags: []`
y `billable: null`. El borrador sigue viviendo en `draftRef` y cambiando con
`change`, y el `onChange` de cada selector lo actualiza igual que los campos de
hoy.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/assignment.ts
/home/maxi/program/clock/src/modules/time-entry/assignment.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/bulk-edit.integration.test.ts        (nuevo)
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts          (solo importaciones, m6)
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/test/time-entry.ts                                     (nuevo)
```

- **Los casos nuevos de servicio van en `bulk-edit.integration.test.ts`**, no
  en `service.integration.test.ts`, que pasa de 8600 líneas y donde el slice
  chico de «Reintentar» va a trabajar en paralelo.
- **Los ayudantes que el archivo nuevo necesita suben a `src/test/time-entry.ts`
  en el primer commit de `backend-dev`** (m6): `workspaceOf` (`:105-111`),
  `rejectionOf` (`:5649-5659`) y `snapshotOf` (`:5662-5672`) tal cual;
  `actorFor` (`:100-102`) y `seedClosed` (`:1892-1899`), que hoy leen
  `workspaceId` y `actor` del archivo, reciben el `workspaceId` y el `userId`
  por parámetro. `service.integration.test.ts` los importa —con un envoltorio
  local de una línea si conserva las firmas de hoy— y no cambia ninguna
  afirmación.
- Si una fábrica necesita un parámetro, `src/test/factories.ts` entra en la
  lista solo para ese cambio.

### frontend-dev

```
/home/maxi/program/clock/src/modules/project/components/project-picker.tsx
/home/maxi/program/clock/src/modules/project/components/project-picker.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/bulk-changes.ts
/home/maxi/program/clock/src/modules/time-entry/components/bulk-changes.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/bulk-edit-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
```

`labels.ts` suma a `trackerLabels`:

| Clave               | Texto                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `keepProject`       | «No cambiar el proyecto»                                                                                                            |
| `keepTags`          | «No cambiar las etiquetas»                                                                                                          |
| `tagModeGroup`      | «Cómo se aplican las etiquetas»                                                                                                     |
| `tagModeAdd`        | «Agregar a las que tienen»                                                                                                          |
| `tagModeReplace`    | «Reemplazar las que tienen»                                                                                                         |
| `tagsCleared`       | «Las entradas quedan sin etiquetas.»                                                                                                |
| `billableByProject` | «Las entradas que cambian de proyecto toman el facturable por defecto de ese proyecto; las que ya estaban en él conservan el suyo.» |

«Proyecto», «Etiquetas», «Facturable», «Sin cambios», «Sí» y «No» ya existen
(§0) y se reusan, no se definen otra vez.

### tests-slice12

```
/home/maxi/program/clock/e2e/bulk-assignment.spec.ts                                (nuevo)
/home/maxi/program/clock/e2e/tracker-page.ts
/home/maxi/program/clock/e2e/database.ts
/home/maxi/program/clock/e2e/bulk-actions.spec.ts                                   (solo si hace falta, m7)
```

- `database.ts` suma `seedTag(name)`, con la comprobación de una fila de
  `seedProject`.
- `tracker-page.ts` suma los localizadores de las secciones nuevas del
  diálogo: los grupos «Cómo se aplican las etiquetas» y «Facturable» por su
  nombre, sus opciones, y «No cambiar el proyecto» y «No cambiar las
  etiquetas». `projectPicker` y `tagPicker` ya encuentran los del diálogo por
  «Proyecto» y «Etiquetas».
- `bulk-actions.spec.ts` entra solo si el orden nuevo del diálogo rompe un
  localizador; se ajusta el localizador y no la afirmación. La revisión no
  encontró ningún `Tab` que dependa del orden.
- **La comprobación desde otra pestaña del recorrido 6** se escribe en el spec
  sobre `openSecondTab` de `e2e/network.ts`, que es lo compartido. Ya hay dos
  `expectAppliedElsewhere` con comprobaciones distintas (`start-retry.spec.ts`,
  `projects.spec.ts`) y una parecida en `bulk-actions.spec.ts`; unificarlas es
  la deuda de ayudantes de e2e que ya anota `estado-fase1.md`.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/time-tracker.md
```

Antes del merge, lo que §1 enumera en «Lo que el slice decide». **Antes de dejar
«agregando a las existentes o reemplazándolas» como «Documentado»**, confirmar
la oración literal en la página de Clockify (resultado `FOUND`/`NOT FOUND`),
como pide `estado-fase1.md`: en el 11 el resumidor inventó un tope. Si no
aparece, TT-63 pasa a decir _no verificado_ para el modo.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/server/action.ts`,
`src/server/audit.ts`, `src/server/time/`, `src/hooks/`, `src/lib/`,
`project/service.ts` (`assertTrackable` y `assertTaggable` no cambian),
`project/schema.ts`, `tag-picker.tsx`, `picker-model.ts`,
`tag-picker-model.ts`, `time-entry/actions.ts`, `bulk-actions.tsx`,
`bulk-delete-dialog.tsx`, `selection.ts`, `entry-list.tsx`, `day-group.tsx`,
`entry-row.tsx`, `tracker-bar.tsx` y el calendario. Los contratos y
correcciones anteriores son históricos; el mapa y el estado los actualiza el
team-lead.

### Handshake de orden

0. **D12-1 … D12-5 tomadas; el ADR 0017, aceptado por el usuario.** La ronda 1
   de `architecture-reviewer` está aplicada en este contrato.
1. **Primer commit de `backend-dev`, sin cambio de conducta**: los ayudantes a
   `src/test/time-entry.ts` (m6) y el refactor de §4.3 sobre `updateEntry`
   (`assignmentPlan`, `assertAssignments`, `assignmentFields`), con
   `service.integration.test.ts`, `actions.integration.test.ts` y
   `audit.integration.test.ts` en verde sin cambiar afirmaciones. **Dos
   mutantes sobre la rama, en una copia** (D12-1): invertir el orden en
   `assertAssignments` (etiquetas antes que el par) y usar `billableByDefault`
   sin pasar por `billableFor`. Los dos tienen que caer con la suite existente;
   si alguno no cae, el commit suma el test de `updateEntry` que lo mata.
2. **Segundo commit de `backend-dev`**: `entryPair` arriba, `bulkTags` y los
   campos de `bulkEditChanges` con `schema.test.ts`; `tagsAfter` con su test.
   Hasta el paso 5 la rama acepta los campos y el service todavía no los
   aplica: es un estado de la rama, que no se mergea así. **Avisa a
   `frontend-dev`**: desde acá `BulkEditChanges` tiene su forma final.
3. **`frontend-dev` arranca en paralelo con el paso 1**, por lo que no depende
   del esquema: `ProjectPicker` con `value` nulo y su test, y los textos. Con
   el paso 2 en la rama, `bulk-changes.ts` con su test y el diálogo.
4. **`tests-slice12` arranca con el paso 2**: escribe el spec y confirma que
   falla por la funcionalidad y no por el arnés.
5. `backend-dev` sigue con `updateClosedEntries` (§4.6, firma e
   implementación), el algoritmo de §4.5 y los tests de §7.
6. `parity-analyst`, antes del merge.

## 7. Criterios de aceptación

1. **El esquema** — `bulkEditChanges` acepta `project`, `billable` y `tags`
   solos o combinados; rechaza la tarea sin proyecto con `taskNeedsProject`;
   un modo desconocido, una clave de más en `tags` o en `project`, y «add» sin
   ids, con `unexpected`; 51 ids con `tooManyTags`; normaliza los ids;
   «replace» sin ids es válido.
2. **`tagsAfter`** — «add» suma sin repetir y sin distinguir mayúsculas;
   «replace» deja las pedidas; lo que la fila tiene y no está en el catálogo se
   conserva con «add».
3. **La fila repetida** — Para cada caso de la tabla de §4.4 que termina bien,
   la masiva sobre una copia deja el mismo par, el mismo facturable y el mismo
   conjunto que `updateEntry` sobre otra copia sembrada igual con
   `{ project, billable, tags: tagsAfter(…) }`. Para los que fallan: un rechazo
   de fila se compara por `rejections[0].code` y `rejections[0].message` contra
   el código y el texto del error de `updateEntry`; el caso de 51 etiquetas
   llama a `updateEntry` en el service, por debajo de Zod; un error del pedido
   se compara por código y texto.
4. **D-2 por fila en un solo pedido** — Tres filas (sin proyecto, en P, en Q),
   con P por defecto facturable y las tres no facturables: elegir P en bloque
   deja facturables la primera y la tercera, y no la segunda.
5. **El pedido gana** — Con P por defecto facturable, P y «No» dejan las filas
   no facturables, también las que cambian de proyecto.
6. **Lo archivado de la fila se conserva** — Una fila en un proyecto archivado
   cambia sus etiquetas y su facturable sin error; una con una etiqueta
   archivada, con «Agregar», la conserva.
7. **Una referencia no disponible frena el pedido** — El proyecto archivado, el
   privado sin acceso, la tarea hecha y la etiqueta archivada o de otro
   workspace, pedidos sobre filas que no los tienen, responden `not_found` con
   su texto y sin `rejections`; nada escrito, ninguna constancia. **También
   cuando la primera fila pedida ya tiene el proyecto archivado (o la etiqueta
   archivada) y otra no**: `not_found` sin escribir.
8. **Solo se valida lo que se asigna de nuevo** — Pedir el proyecto archivado a
   filas que ya lo tienen todas, o «Agregar» una etiqueta archivada a filas que
   ya la tienen todas, termina bien sin escribir.
9. **El reintento llega a un punto fijo** — Repetir un pedido aplicado de
   proyecto, etiquetas y facturable no escribe ni deja constancia y responde
   las mismas vistas, **también después de archivar el proyecto y la etiqueta
   entre los dos intentos**.
10. **Las filas antes que las referencias** — Una fila ajena y un proyecto
    archivado en el mismo pedido responden `rejected` con la ajena.
11. **El tope por fila** — «Agregar» que deja una fila con 51 la rechaza con
    `tooManyTags` y no cambia ninguna; con exactamente 50, termina bien.
12. **La entrada que corre y la de más de un día** — La que corre se rechaza
    con `runningEntryTimes` aunque el pedido sea solo de etiquetas; la de más
    de un día cambia de proyecto sin rechazo.
13. **Las vistas** — Las que vuelven traen el proyecto, la tarea, el
    facturable y las etiquetas nuevas, con nombre y color de ahora, en orden
    alfabético; las de filas sin cambios, las de antes.
14. **La auditoría** — Una constancia por fila escrita con solo los campos que
    cambiaron, `tagIds` ordenados por nombre; ninguna por la fila sin cambios.
15. **La suma parte de lo confirmado** — Con una edición de etiquetas de otra
    conexión encolada antes que la masiva sobre la misma fila, «Agregar» deja
    la unión de las dos.
16. **Dos masivas cruzadas con etiquetas** — Dos «Agregar» sobre los mismos ids
    en orden opuesto, cruzadas en la base, responden `ok` las dos, y cada fila
    tiene las dos etiquetas.
17. **La capa de action** — Traduce el `ProjectError` con su código y su
    mensaje, los `ZodError` de los campos nuevos con el suyo, y revalida `"/"`
    y `"/calendario"` también con error.
18. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
    `main` pasa sin cambiar afirmaciones, también después del refactor de §4.3
    y de mover los ayudantes de m6.
19. **El borrador** — `toChanges` manda el par con «Sin proyecto» y con un
    proyecto, nada con `selection` nula; «add» sin etiquetas no manda nada;
    «replace» sin etiquetas manda la lista vacía; `billable` solo si no es
    nulo.
20. **El selector con «Sin cambios»** — `ProjectPicker` con `value` nulo dibuja
    el `placeholder` en el disparador; con una selección, la de siempre.
21. **Filas mezcladas en la escritura** (B1) — En un pedido de P y «Agregar»
    Y, `r1` en Q con X y `r2` en Q con Y y Z: `r1` queda en P con X e Y, y `r2`
    queda en P **con Y y Z**: cambió solo su par y conserva su conjunto. Lo
    mismo con el facturable en lugar del par.
22. **El par antes que las etiquetas, para el pedido entero** (M2) — Con P y X
    archivados, `r1` en P sin X y `r2` con X fuera de P, pedirles P y «Agregar»
    X responde `projectUnavailable`, en cualquier orden de los ids; nada
    escrito.
23. **La pantalla** — Los recorridos de abajo.

### Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                                          | Qué afirma                                                                                           | Mutante que tiene que caer                                                                                                                                                                           |
| -------- | ----------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad      | `schema.test.ts`                                                 | cada forma válida e inválida con su texto                                                            | `z.object` en vez de `strictObject` en `tags`; sin `.min(1)` en «add»; sin `.max` en «add»; `project` sin el `refine` de TT-70                                                                       |
| 2        | unidad      | `assignment.test.ts`                                             | los dos modos, mayúsculas, archivada                                                                 | «add» como «replace»; «add» sin `normalizedIds` (repite con otra mayúscula)                                                                                                                          |
| 3        | integración | `bulk-edit.integration.test.ts`                                  | por caso, masiva contra `updateEntry` sobre copias                                                   | la masiva con `project.billableByDefault` siempre (cae P → P: T); con el facturable pedido ignorado si cambia el proyecto. Una copia fiel de la regla del par no la detecta el test sino la revisión |
| 4        | integración | `bulk-edit.integration.test.ts`                                  | las tres filas y su facturable                                                                       | un solo facturable calculado para todo el pedido                                                                                                                                                     |
| 5        | integración | `bulk-edit.integration.test.ts`                                  | P con «No»                                                                                           | `billableFor` antes que el pedido (`??` invertido)                                                                                                                                                   |
| 6        | integración | `bulk-edit.integration.test.ts`                                  | sin error y con lo archivado conservado                                                              | validar el par de la fila aunque el pedido no traiga `project`; `tagsCheck` con el conjunto entero en vez de las nuevas                                                                              |
| 7        | integración | `bulk-edit.integration.test.ts`; `audit.integration.test.ts`     | código, texto, sin `rejections`, filas y constancias intactas; la primera fila con la archivada      | atrapar el `ProjectError` como rechazo de fila (sale `rejected` con lista); saltear `assertAssignments` (escribe); `plans[0].pairCheck`; validar solo el `tagsCheck` del primer plan                 |
| 8        | integración | `bulk-edit.integration.test.ts`                                  | `ok` sin escrituras                                                                                  | validar siempre lo pedido, sin mirar los planes                                                                                                                                                      |
| 9        | integración | `bulk-edit.integration.test.ts`; `audit.integration.test.ts`     | el segundo intento, con y sin archivado en el medio                                                  | validar siempre lo pedido; reescribir el facturable con el par igual                                                                                                                                 |
| 10       | integración | `bulk-edit.integration.test.ts`                                  | `rejected` con la ajena                                                                              | `assertAssignments` antes de `evaluateAll`                                                                                                                                                           |
| 11       | integración | `bulk-edit.integration.test.ts`                                  | 51 rechazada, 50 aceptada                                                                            | `>=` en vez de `>`; sin el tope en `assignmentPlan` (la base acepta 51)                                                                                                                              |
| 12       | integración | `bulk-edit.integration.test.ts`                                  | los dos casos                                                                                        | `requireClosed` solo con horario; evaluar el trío aunque no venga                                                                                                                                    |
| 13       | integración | `bulk-edit.integration.test.ts`                                  | las vistas contra una lectura nueva                                                                  | la vista armada con las referencias de la lectura bajo bloqueo (el armado de hoy, `:1509`)                                                                                                           |
| 14       | integración | `audit.integration.test.ts`                                      | los campos de cada constancia                                                                        | `billable` siempre en la constancia; `tagIds` sin ordenar                                                                                                                                            |
| 15       | integración | `bulk-edit.integration.test.ts`                                  | con `queueBehindBarrier`: `updateEntry` de etiquetas primero, la masiva después; la fila con las dos | las referencias leídas en la sentencia que bloquea (una sola sentencia en `findManyByIdsForUpdate`): la suma parte de la foto vieja y el `delete` borra la otra                                      |
| 16       | integración | `bulk-edit.integration.test.ts`                                  | con `raceThroughBarrier`, tres filas `a < b < c`, `[a, b, c]` y `[c, b, a]`                          | bloquear con un `for update` por fila en el orden pedido (`40P01`, sale `unexpected`); leer las etiquetas en la sentencia que bloquea (la segunda pierde la del primero)                             |
| 17       | integración | `actions.integration.test.ts`; `permissions.integration.test.ts` | traducción, privado sin acceso como `not_found`, revalidación                                        | el service envuelve el `ProjectError` en un `TimeEntryError` con otro texto; revalidar solo con éxito                                                                                                |
| 18       | todas       | las suites existentes                                            | en verde sin cambiar afirmaciones                                                                    | —                                                                                                                                                                                                    |
| 19       | unidad      | `bulk-changes.test.ts`                                           | cada campo y sus combinaciones                                                                       | «replace» vacío omitido; `selection` nula como «Sin proyecto»                                                                                                                                        |
| 20       | unidad      | `project-picker.test.tsx`                                        | el disparador con `placeholder` y con selección                                                      | `value` nulo dibujado como «Sin proyecto»                                                                                                                                                            |
| 21       | integración | `bulk-edit.integration.test.ts`                                  | el conjunto de cada fila después del pedido mezclado                                                 | el `delete` de la unión filtrado por todas las escrituras y no por las que traen `tagIds` (`r2` pierde Y y Z)                                                                                        |
| 22       | integración | `bulk-edit.integration.test.ts`                                  | `projectUnavailable` con los ids en los dos órdenes; nada escrito                                    | validar plan por plan (sale `tagUnavailable` con `r1` primero); la unión de etiquetas antes que el par                                                                                               |
| 23       | e2e         | `e2e/bulk-assignment.spec.ts`                                    | los recorridos                                                                                       | —                                                                                                                                                                                                    |

**El criterio 3 es el que prueba que la regla no se duplicó** en lo que se
observa, como el 7 del 6 y el de equivalencia del ADR 0013. Siembra dos copias
de cada fila, aplica la masiva a una y `updateEntry` a la otra con el conjunto
que da `tagsAfter`, y compara el par, el facturable y las etiquetas, o el
código y el texto como dice el criterio. Un mutante que copie la regla en la
masiva y se desvíe en un caso cae acá; una copia fiel no se desvía, y la caza
la revisión de backend contra §4.3.

**El criterio 15 se cruza con `queueBehindBarrier`**: el `hold` toma la fila con
`for update`; primero se encola `updateEntry` con `tags: [X]` y después la
masiva con «Agregar» Y. Al soltar, `updateEntry` confirma y la masiva, con el
bloqueo ya tomado, lee X en su segunda sentencia y deja X e Y. Con las
referencias en la sentencia que bloquea, la masiva parte de la foto de antes de
esperar (sin X), fija el conjunto en Y y el `delete` de §4.6 borra X.

**La red de la base no tiene test por el service** (§4.8), igual que en
`updateEntry`.

**Un mutante declarado equivalente** se prueba antes con pedidos inválidos,
ids inexistentes, ajenos y membresía inactiva, y se compara la respuesta y si
la llamada espera un bloqueo, no solo las filas (lección del 11b en
`estado-fase1.md`).

### Recorridos obligatorios de `e2e/bulk-assignment.spec.ts`

Dueño: `tests-slice12`. Precondición: el `setup` atrasa la creación del
workspace (`backdateWorkspace`); **cada recorrido usa una persona propia, siembra
sus propias entradas** y lleva un sufijo propio (`uniqueSuffix`) en proyectos y
etiquetas, que la base de e2e acumula. Las entradas se crean con
`addManualEntry` (00:00–00:01 de hoy); las respuestas se esperan con
`withServerAction`. Los proyectos se siembran con `seedProject`; las etiquetas,
con `seedTag`.

1. **El proyecto y D-2** (criterios 4 y 23). P con la tarea T, por defecto
   facturable. Dos entradas: «a» sin proyecto y «b» en P, con su facturable
   apagado desde la fila. Elegir las dos, «Editar», elegir «P: T» y
   «Guardar»: las dos filas dicen «P: T», «a» queda facturable y «b» no; «Se
   editaron 2 entradas.» y el foco en la región.
2. **«Sin proyecto» y el facturable pedido** (criterio 5). Q por defecto
   facturable. Dos entradas propias de este recorrido: «c» en Q y facturable,
   «d» sin proyecto. Elegir las dos; con Q elegido y el facturable en «Sin
   cambios», la ayuda del facturable está a la vista; con «Sin proyecto», no.
   Elegir «Sin proyecto» y «Facturable: No», «Guardar»: las dos sin proyecto y
   no facturables.
3. **Agregar y reemplazar** (criterios 2 y 19). Etiquetas X, Y, Z. «a» con X,
   «b» sin etiquetas. «Agregar» Y: «a» con X e Y, «b» con Y. «Reemplazar» por
   Z: las dos con Z. «Reemplazar» sin elegir ninguna: a la vista «Las entradas
   quedan sin etiquetas.», «Guardar» activo, y después las dos sin etiquetas.
4. **El proyecto archivado mientras el diálogo está abierto** (criterio 7).
   Abrir el diálogo, elegir P2, `archiveProject(P2)`, «Guardar»: el aviso «No
   se pudieron editar las entradas.» con «Ese proyecto ya no está
   disponible.», sin lista y sin «Reintentar»; el diálogo sigue abierto con P2
   en el disparador; cerrarlo y ver las filas sin cambios.
5. **Volver a «Sin cambios», foco y `Escape`** (§5.2). Elegir un proyecto, «No
   cambiar el proyecto»: el disparador dice «Sin cambios», tiene el foco y
   «Guardar» queda `aria-disabled`. Abrir el selector de proyecto, buscar algo
   sin coincidencias y `Escape`: se cierra solo el selector, el diálogo sigue y
   el foco está en el disparador. Lo mismo con «No cambiar las etiquetas»
   después de elegir «Reemplazar».
6. **Reintentar con la respuesta perdida** (criterio 9). Elegir dos entradas,
   «Agregar» una etiqueta, perder la respuesta con `route.fetch()` y
   `route.abort()`; comprobar desde otra pestaña (`openSecondTab`) que las dos
   filas ya tienen la etiqueta: sin eso, un pedido que no llegó haría pasar el
   recorrido sin probar nada. «Reintentar»: la respuesta del reintento es `ok`
   (`withServerAction`), el estado dice «Se editaron 2 entradas.», ningún aviso
   de error y el foco nunca en `body`.

TT-92 no tiene recorrido: sin casillas no hay diálogo, y eso lo prueba el 6.

## 8. Deuda conocida del slice

- **Las columnas se siguen escribiendo con una sentencia por fila** (hasta
  200). Subir el tope de 200 pide la escritura en una sentencia de §4.6 del 6;
  la unión ya no limita, porque sus pares viajan en `unnest`.
- **El diálogo no anticipa el resultado por fila**: con un proyecto y el
  facturable en «Sin cambios», la ayuda dice la regla pero no qué filas van a
  quedar facturables. Las filas tampoco se actualizan de forma optimista.
- **Sin verificar en Clockify** (P-07 y P-14 de `time-tracker.md`): si la
  edición masiva del rastreador es del plan Free; si «Reemplazar» sin etiquetas
  las quita; si un proyecto en bloque cambia el facturable; si una referencia
  no disponible frena todo. El facturable no se puede verificar nunca (P-16).
- **No se puede vaciar la descripción en bloque, y sí las etiquetas** (D12-3).
  La asimetría es a propósito: las etiquetas tienen un modo explícito.
- **El diálogo crece a siete campos**: en una ventana baja se desplaza. Si con
  768 px de alto no entra, la deuda de anchos y alturas de `estado-fase1.md`
  suma este caso.
- **`PickerEmptyMessage` y el disparador comunes a los dos selectores** (C9
  del 11b) siguen como deuda: este slice toca `project-picker.tsx` solo para
  `value` nulo.
- **Tres comprobaciones de «se aplicó en otra pestaña»** en e2e, más la de
  este spec, con lo compartido en `openSecondTab`: entran en la deuda de
  ayudantes comunes de e2e.
- **La red de la base para una referencia borrada** queda sin test por el
  service, como en `updateEntry`.
- **Las filas rechazadas no se marcan en la lista** (deuda del 6).
- **Con este slice no queda nada de `time-tracker.md` sin slice**, salvo lo
  fuera de alcance de §4 del mapa.
