# Fase 1, slice 11: etiquetas y facturable

Contrato del undécimo slice vertical de la fase 1. Módulos `time-entry` y
`project`, pantallas `/`, `/calendario` y `/proyectos`.

- **Fuente de los comportamientos:** `docs/parity/time-tracker.md` (TT-nn),
  `docs/parity/proyectos.md` (PR-nn, su §14.1) y `docs/parity/calendario.md`
  (CAL-nn, su §18).
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md), slice 11.
- **Revisión del contrato:** ronda 1 aplicada, con las resoluciones de
  [`correcciones-fase1-slice11.md`](correcciones-fase1-slice11.md).
- **Relevamiento de paridad:** H-1 … H-13 relevados por `parity-analyst` en
  `939e5bc` (tabla de huecos, abajo).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0016, las etiquetas son del módulo de proyectos](../adr/0016-las-etiquetas-son-del-modulo-de-proyectos.md): **aceptado** (2026-10-05), nace acá.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md): la etiqueta se valida con `assertTaggable` de `project` y se muestra con una lectura del repository de `time-entry`.
  - [ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md): `updateEntry` gana los grupos `billable` y `tags`.
  - [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): `createTag` lleva el id del cliente, como las altas del 9.
  - [ADR 0009](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md): `tag.create` no lee configuración en la fase 1.
- **Contratos de los que hereda:** [slice 8c](fase1-slice8c-calendario-escritura.md)
  §4.9 («Lo que el slice 11 suma»), [slice 10](fase1-slice10-selector-de-proyecto.md)
  §4.4 (`continuedFields`) y [slice 9](fase1-slice9-nucleo-de-proyectos.md)
  (`project.billable_by_default`).

El contrato da por tomadas estas decisiones del equipo:

- **El facturable entra como diseño propio y no como paridad** (P-16 de
  `proyectos.md`): no hay comportamiento de Clockify contra el cual compararlo.
- **El 11 suma «facturable por defecto» al alta de proyecto** (PR-21, decisión
  del 2026-10-03).
- **Una etiqueta archivada se sigue mostrando** en la entrada que la tiene y no
  se ofrece para entradas nuevas (P-22, PR-47, PR-68).
- **Crear una etiqueta desde el selector queda fuera de la fase 1** (TT-13).
- **Continuar o duplicar con un proyecto no disponible se rechaza** (slice 10,
  decisión del 2026-10-03). D-3 propone la misma regla para las etiquetas.

## Partición propuesta: 11a facturable, 11b etiquetas

**Recomendación: partir el slice en dos, sin cambiar el orden del mapa.** El
mapa lo prevé («se parte en dos —etiquetas, facturable— sin cambiar el
orden»). Medido contra el 10, el 11 entero es más grande: dos tablas nuevas,
una columna, dos acciones de permiso, un alta con pantalla, un selector nuevo
de selección múltiple, un control nuevo y los dos campos en la barra, la fila,
el diálogo y el bloque del calendario. La barra (`tracker-bar.tsx`) es el
archivo más cargado del módulo y es donde más pesa: cada campo nuevo repite la
máquina de estados del par (borrador, retención al forzar el modo, vista
optimista con el timer, limpieza al agregar).

| Parte   | Qué trae                                                                                                                       | Esquema                                                         | Permisos                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------- |
| **11a** | Facturable: la columna, el valor por defecto del proyecto en el alta de proyecto, el control en barra, fila, diálogo y bloque. | `time_entry.billable`                                           | ninguno                   |
| **11b** | Etiquetas: la entidad, su alta en `/proyectos`, el selector en barra, fila y diálogo, y su lugar en las vistas y el detalle.   | `tag`, `time_entry_tag`, una clave única nueva en `time_entry`. | `tag.create`, `tag.view`. |

- **11a va primero**: es la más chica, no trae entidades ni pantallas nuevas, y
  deja hecho lo que comparten las dos —el borrador de campos de la barra
  (`entry-fields.ts`, §5.3) y los grupos nuevos de `updateEntry`—, así el 11b
  suma un campo a una estructura que ya existe en lugar de inventarla. El slice
  13 necesita las dos (TS-30, TS-41) y el 12 también.
- **Cada parte se despliega sola** y tiene su pipeline completo. Comparten
  archivos, así que **no van en paralelo**: el 11b arranca con el 11a en
  `main`.
- **Si el team-lead no parte**, el contrato vale igual: el handshake de §6 es el
  del 11a seguido del del 11b en una sola rama.

## Decisiones pendientes del team-lead

Ninguna sale de la paridad: TT-12, TT-14, PR-21 y PR-48 no las cubren. Cada una
tiene recomendación; el contrato está escrito con la recomendada.

| ID  | Decisión                                                                                                                      | Opciones                                                                                                                                                                | Recomendación y por qué                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | **Dónde se crea una etiqueta en la fase 1** (PR-44: la crea cualquiera; TT-13 la saca del selector).                          | (a) `/proyectos`, con «Nueva etiqueta» y una sección «Etiquetas»; (b) una ruta nueva `/etiquetas`.                                                                      | **(a).** PR-04 deja un solo camino de alta por entidad y en la fase 1 ese camino es `/proyectos`; TT-88 dice «misma justificación que TT-87», que manda a `/proyectos`. Una ruta propia es la lista de administración de PR-45, que es de la fase 2 y puede mudarse sin tocar el modelo (ADR 0016).                                                                                                       |
| D-2 | **Qué pasa con el facturable al cambiar el proyecto de una entrada que ya existe** (TT-14 dice solo con qué valor «arranca»). | (a) Solo se decide al crear; cambiar el proyecto no lo toca. (b) Elegir otro proyecto impone su valor por defecto; «Sin proyecto» y cambiar solo la tarea lo conservan. | **(b).** El caso más común del rastreador es iniciar y después elegir el proyecto: con (a) esa entrada queda no facturable aunque el proyecto lo sea, y hay que acordarse de marcarla cada vez. Con (b) la barra sin timer y la barra con timer dan la misma entrada. La regla es una sola función (§4.1), la usan el servidor y el navegador, y la persona sigue pudiendo cambiar el facturable después. |
| D-3 | **Continuar o duplicar una entrada que tiene una etiqueta archivada.**                                                        | (a) Se rechaza con TT-78 y no crea nada. (b) Copia sin la etiqueta archivada. (c) Copia con ella.                                                                       | **(a)**, la misma regla que el 10 fijó para el proyecto (TT-57, TT-58): (b) cambia la entrada en silencio y (c) asigna una archivada a una entrada nueva, que PR-45 prohíbe. La persona la quita de la original desde la fila y vuelve a continuar.                                                                                                                                                       |
| D-4 | **Tope de etiquetas por entrada** (PR-48: «sin tope conocido»).                                                               | Un número, o ninguno.                                                                                                                                                   | **50**, límite propio como el de 200 de TT-63: hace falta para el esquema y para que una sola mutación no escriba sin cota. Ninguna persona llega a 50 por entrada.                                                                                                                                                                                                                                       |
| D-5 | **Cuándo guarda el selector de etiquetas de una entrada existente.**                                                          | (a) Al cerrar el selector, con el conjunto entero. (b) Con cada casilla.                                                                                                | **(a).** Una edición de cinco etiquetas es un pedido y una constancia, no cinco; el pedido fija el conjunto entero, así que el reintento llega a un punto fijo. Cerrar con `Escape` también guarda: cada casilla marcada ya es una elección hecha a la vista.                                                                                                                                             |
| D-6 | **La partición 11a / 11b.**                                                                                                   | Partir o no.                                                                                                                                                            | **Partir** (arriba).                                                                                                                                                                                                                                                                                                                                                                                      |

**Resueltas el 2026-10-05 por el team-lead**, con la delegación del usuario («todo lo que vos
puedas hacer, decidilo»), siguiendo la recomendación de cada una: **D-1 (a)**, **D-2 (b)**,
**D-3 (a)**, **D-4 50**, **D-5 (a)** y **D-6 partir** en 11a y 11b. El ADR 0016 quedó
aceptado el mismo día, con la ronda 1 de la revisión de arquitectura (m8).

## Huecos de paridad, relevados

Comportamientos que el slice necesita y que ningún documento de paridad fijaba.
**`parity-analyst` los relevó el 2026-10-05 (`939e5bc`)**: todos quedaron como
la propuesta del contrato, H-8 con un ajuste, y casi todos como diseño propio,
porque la documentación pública no los describe. La última columna dice dónde
quedó cada uno.

| ID   | Hueco                                                                                                                                                           | Propuesta del contrato                                                                                                                                                        | Resultado, con el ID de paridad                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1  | TT-12: «el botón muestra la cantidad o los nombres si entran». No dice desde cuántas ni cómo se decide «si entran».                                             | Los nombres separados por coma, recortados con elipsis; el nombre accesible los dice todos (§5.8). `adaptar`: medir el ancho para cambiar a una cantidad no es predecible.    | TT-12, que pasa de `replicar` a `adaptar`. _No verificado_ (P-14).                                                                                          |
| H-2  | TT-12: cómo busca el selector de etiquetas.                                                                                                                     | Como TT-07: sin distinguir mayúsculas ni acentos, en el navegador, sobre el catálogo entero.                                                                                  | TT-12. _No verificado_ (P-14).                                                                                                                              |
| H-3  | TT-12: cuándo se guarda la selección de una entrada existente, y qué hace `Escape`.                                                                             | D-5.                                                                                                                                                                          | TT-12. _No verificado_ (P-14): si Clockify guarda con cada casilla, el guardado al cerrar pasa a ser parte de la adaptación, con la justificación de TT-55. |
| H-4  | TT-88: el texto «misma justificación que TT-87» no dice si hay enlace ni adónde.                                                                                | «No hay etiquetas todavía» y, con `tag.create`, el enlace «Ir a Proyectos» (D-1).                                                                                             | TT-88 y PR-88, con el destino en PR-112.                                                                                                                    |
| H-5  | PR-47: cómo muestra el selector una etiqueta archivada que la entrada ya tiene.                                                                                 | Marcada, con «(archivada)» después del nombre; se puede desmarcar y, cerrado el selector, no vuelve a ofrecerse.                                                              | PR-47 (`adaptar`). _No verificado_ (P-33).                                                                                                                  |
| H-6  | TT-49 y TT-50 con etiquetas y facturable: qué muestra una fila sin etiquetas y una no facturable.                                                               | Sin etiquetas, el ícono de etiqueta en gris sin texto; no facturable, el ícono de moneda sin marcar. En solo lectura (TT-92), nada en los dos casos.                          | TT-50, con TT-12 y TT-14. _No verificado_ (P-14) en las etiquetas; el facturable no se puede verificar (P-16).                                              |
| H-7  | TT-14: el control. «Ícono de signo de moneda que alterna» no dice su nombre accesible.                                                                          | Un botón de alternancia con `aria-pressed`, llamado «Facturable» en la barra y «Entrada «…» facturable» en la fila.                                                           | TT-14, diseño propio (P-16).                                                                                                                                |
| H-8  | PR-21: cómo se elige el facturable por defecto al crear un proyecto.                                                                                            | Una casilla «Facturable por defecto», sin marcar, con la ayuda «Las entradas nuevas con este proyecto arrancan facturables.».                                                 | PR-21, `adaptar`: Clockify lo cambia en **Settings** de un proyecto ya creado; acá se elige en el alta, porque la fase 1 no edita proyectos.                |
| H-9  | D-2: el facturable al cambiar el proyecto de una entrada existente.                                                                                             | D-2 (b).                                                                                                                                                                      | TT-14 y PR-21, decisión del equipo del 2026-10-05.                                                                                                          |
| H-10 | CAL-21: dónde va el ícono de facturable en el bloque; CAL-23: cómo se muestran etiquetas y facturable en el detalle; CAL-75: si el nombre accesible los nombra. | Bloque: el ícono al final de la línea del horario. Detalle: «Facturable» y «Etiquetas: a, b» como líneas propias. Nombre accesible: suma «facturable» al final; etiquetas no. | CAL-21, CAL-23 y CAL-75, con CAL-45 y CAL-66 para el diálogo. CAL-23 _no verificado_ (P-07 de `calendario.md`) en las etiquetas.                            |
| H-11 | PR-48 y D-4: el tope de etiquetas por entrada.                                                                                                                  | D-4.                                                                                                                                                                          | PR-48, límite propio. _No verificado_ (P-33).                                                                                                               |
| H-12 | D-3: continuar y duplicar con una etiqueta archivada.                                                                                                           | D-3 (a).                                                                                                                                                                      | TT-57 y TT-58. _No verificado_ (P-14).                                                                                                                      |
| H-13 | La pantalla de alta de etiquetas: su vacío y lo que lista.                                                                                                      | Una sección «Etiquetas» en `/proyectos` con las activas en orden alfabético, y «Todavía no hay etiquetas» sin ninguna.                                                        | **PR-112**, nuevo, `adaptar`: Clockify tiene una página de etiquetas propia; acá se crean y se ven en `/proyectos` (D-1). Su vacío también está en PR-88.   |

**Lo que la paridad decía y el árbol ya había decidido** quedó corregido en el
mismo commit:

- **TT-105** dejó de estar marcado «No verificado» y salió de P-14: lo cerró
  PR-46 con la documentación pública.
- **§14.1 y §14.3 de `proyectos.md`** dicen que el 11 verifica la parte de
  etiquetas de PR-53, PR-54, PR-58 y PR-62, que siguen con destino en el 9.

## 0. Precondición de arranque

- **`main` en `939e5bc`**, con los slices 1 a 10, 8c y 8b. Desde `54daee0` solo
  entraron documentos (los contratos del 7b y del 11, sus correcciones y la
  paridad del 11), así que las citas de abajo, tomadas en `54daee0`, valen para
  los dos.
- **Postgres 15 o posterior**, como desde el 9: la migración escrita a mano del
  11b usa `on delete set null (columna)` (§2.2).
- **El 7b está aprobado y en implementación, y lo más probable es que entre
  antes que el 11a.** Su migración es la `0008_user_preference_name_theme`.
  Comparte con el 11 `src/server/db/schema.ts` (bloques distintos), el diario y
  las instantáneas de `drizzle/meta/`, `src/test/factories.ts`,
  `src/modules/time-entry/service.integration.test.ts` (el import de
  `preferencesOf` pasa a `profileOf`) y `e2e/tracker-page.ts`, adonde muda
  `markDocument` y `documentIsMarked`. **Si entra antes, la migración del 11a se
  descarta y se regenera después del rebase** y toma el número siguiente del
  diario (§2); en los demás archivos, el 11 se adapta a lo que deja el 7b.
- **El slice chico de «Reintentar» en el alta manual** (ADR 0007, decidido el
  2026-10-04) toca `createManualEntryInput`, `createManualEntry`, el «Agregar» de
  la barra y el del calendario, que el 11a también toca. El que entra segundo se
  adapta; el 11 no depende de él. Si entra antes, el 11a conserva el `id` del
  alta y el permiso antes de `createOnce` (§4.10).
- **El 11b arranca con el 11a en `main`.**
- **Antes de implementar cada parte, una ronda corta del
  `architecture-reviewer` contra el árbol**, si entre este contrato y el
  arranque entró algo más a `main` (lección del 9 en `estado-fase1.md`). Con el
  7b adentro, la ronda del 11a se hace.

### Lo que la paridad anuncia y el árbol todavía no tiene

- **TT-57 y TT-58 dicen que, desde el slice 11, continuar y duplicar copian las
  etiquetas y el facturable** de la original. TT-57 cita la documentación para
  la descripción, el proyecto y las etiquetas, y deja la tarea y la
  facturabilidad como _no verificadas_ (P-14). El código copia la descripción y
  el par (`service.ts:415-424`, con el comentario «El slice 11 le suma etiquetas
  y facturable»).
- **CAL-45 y CAL-66 dicen que etiquetas y facturable «llegan con el slice 11, en
  el mismo diálogo»**; el diálogo los rechaza hoy por el `strictObject` de
  `updateEntryChanges` (`schema.ts:239-263`).

### Supuestos sobre el árbol, con archivo y línea en `54daee0`

| Supuesto                                                                                                                                         | Dónde                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `project.billable_by_default` existe, `not null default false`; ninguna pantalla lo escribe                                                      | `src/server/db/schema.ts:242`                                                                    |
| `createProject` escribe `billableByDefault: false` fijo                                                                                          | `project/service.ts:152-155`, `:195`                                                             |
| `createProjectInput` no tiene campo de facturable; `insertProject` ya recibe `billableByDefault`                                                 | `project/schema.ts:53-60`; `project/repository.ts:101-117`                                       |
| `time_entry` no tiene `billable`, ni una clave única `(workspace_id, id)`; su única clave es `id`                                                | `schema.ts:346-412`                                                                              |
| No existen las tablas `tag` ni `time_entry_tag`                                                                                                  | `schema.ts`                                                                                      |
| La última migración es `0007_user_preference`                                                                                                    | `drizzle/`                                                                                       |
| Las claves con `set null (columna)` se reemplazan en una migración escrita a mano, con el mismo nombre                                           | `drizzle/0004_projects_set_null_backfill.sql:1-13`                                               |
| `assertTrackable(tx, actor, target)` devuelve `void` y lee el proyecto con `findProject`                                                         | `project/service.ts:289-326`                                                                     |
| `readCatalog` lee clientes, proyectos y tareas en una transacción `repeatable read` y filtra con `can()`                                         | `project/service.ts:339-398`                                                                     |
| `TrackingProjectView` es `ProjectRef & { tasks }`; `TrackingCatalog` es `{ canCreateProject, groups }`; `ProjectCatalog` no tiene etiquetas      | `project/schema.ts:97-104`, `:121-138`                                                           |
| `alphabetical` ordena con un `Intl.Collator("es", { sensitivity: "accent" })` privado, `byName`, y desempata por id                              | `project/service.ts:328-337`                                                                     |
| `translatingNameTaken` traduce el índice de unicidad que deja pasar `createOnce`                                                                 | `project/service.ts:94-107`                                                                      |
| El esquema de nombre (`name`) es privado de `project/schema.ts`                                                                                  | `project/schema.ts:31-36`                                                                        |
| `ResourceByAction`, `resourceKinds` y `allowedRoles` no tienen acciones de etiqueta                                                              | `src/server/permissions/index.ts:54-72`, `:82-98`, `:108-124`                                    |
| `startTimerInput` y `createManualEntryInput` aceptan el par opcional; `updateEntryChanges` es estricto con cuatro grupos                         | `time-entry/schema.ts:77-79`, `:118-129`, `:239-263`                                             |
| `createManualEntryInput` no lleva `id`                                                                                                           | `time-entry/schema.ts:118-129`                                                                   |
| `entryIds` normaliza a minúsculas y sin repetir                                                                                                  | `time-entry/schema.ts:185-189`                                                                   |
| `timeEntryView` termina en `project` y `task`                                                                                                    | `time-entry/schema.ts:297-334`                                                                   |
| `EntryRefs` es `{ project, task }`; `withRefs` y `selectWithRefs` arman el `left join`; las lecturas con bloqueo usan `for update of time_entry` | `time-entry/repository.ts:35-45`, `:93-125`, `:173-188`                                          |
| `findByIdForUpdate` y `findManyByIdsForUpdate` leen el proyecto y la tarea por `left join` en la misma sentencia que bloquea                     | `repository.ts:173-188`, `:198-210`                                                              |
| `insertRunning` e `insertClosed` releen con `rereadWithRefs`                                                                                     | `repository.ts:359-398`                                                                          |
| `ClosedEntryFields` es `ClosedFields & { pair? }`; `columnsOf` abre el par; `updateClosedEntry` y `updateRunningEntry` releen                    | `repository.ts:59-80`, `:422-448`                                                                |
| `updateProject` fija solo `project_id` y `task_id`                                                                                               | `repository.ts:464-475`                                                                          |
| `assertAssignable` devuelve `void`; `assignedPair` devuelve `{ pair? }`                                                                          | `time-entry/service.ts:399-409`, `:1135-1147`                                                    |
| `continuedFields` devuelve descripción y par, con un tipo privado que se llama `EntryFields`                                                     | `service.ts:415-424`                                                                             |
| `startTimer` y `continueEntry` validan el par antes de cerrar el timer abierto                                                                   | `service.ts:492-555`                                                                             |
| `updateEntryProject` responde la vista sin escribir si el par es el mismo                                                                        | `service.ts:684-712`                                                                             |
| `deleteEntry`, `discardTimer` y `bulkDeleteEntries` guardan la fila borrada en `previousValue`                                                   | `service.ts:724-732`, `:769-777`, `:1430-1441`                                                   |
| `updateEntry`: estado de la fila, descripción y horario, par; `writeEntryEdit` sin campos responde la fila; `valuesOf` arma la constancia        | `service.ts:1090-1222`, `:1326-1335`                                                             |
| `bulkEditEntries` arma la vista con las referencias leídas bajo bloqueo                                                                          | `service.ts:1380-1381`                                                                           |
| `translatingPairConstraints` traduce `23503` y el `check` del par                                                                                | `service.ts:372-389`                                                                             |
| Las actions de `time-entry` revalidan `"/"` y `"/calendario"`; las de `project`, `"/proyectos"`                                                  | `time-entry/actions.ts:59-65`; `project/actions.ts:19-25`                                        |
| La barra guarda el par en `pairDraft`, `heldPair` y `runningPairEdit`, y lo limpia o lo retiene con la descripción                               | `tracker-bar.tsx:118-130`, `:208-237`, `:248-292`, `:312-313`, `:446-453`                        |
| El selector de la barra es del contenedor y se pasa a `TimerBar` y `ManualBar` como nodo; su foco al cambiar de modo usa `pickerTriggerRef`      | `tracker-bar.tsx:161-166`, `:328-337`, `:492-505`; `timer-bar.tsx:28-30`; `manual-bar.tsx:29-31` |
| La fila dibuja el selector después de la descripción; `day-group.tsx` es dueño de sus mutaciones y de sus avisos                                 | `entry-row.tsx:253-261`; `day-group.tsx:150-159`, `:279-343`                                     |
| El borrador del diálogo es `{ description, selection, times }`; `sharedChanges` manda el par si cambió; `createInputOf` arma el alta             | `calendar/entry-dialog-draft.ts:22-58`, `:96-102`                                                |
| El diálogo actualiza el borrador con `change({ ...draftRef.current, … })`                                                                        | `calendar/entry-dialog.tsx:264-274`, `:364-368`                                                  |
| El bloque arma su nombre accesible con `calendarLabels.blockLabel` y su detalle en un `Tooltip`                                                  | `calendar/calendar-block.tsx:103-109`, `:204-210`                                                |
| El cuerpo de solo lectura del diálogo es una lista de definiciones                                                                               | `calendar/entry-dialog-body.tsx:61-112`                                                          |
| `TrackerScreen` y `CalendarScreen` piden `getTrackingCatalog` y lo proveen con `TrackingCatalogProvider`                                         | `tracker-screen.tsx:35-38`, `:49`; `calendar-screen.tsx:34-37`, `:48`                            |
| `ProjectPicker` es un `Combobox` de Base UI con el buscador en el popup, `filter={null}` y `readOnly`                                            | `project/components/project-picker.tsx:87-202`                                                   |
| `combobox.tsx` exporta las piezas de selección múltiple (`ComboboxChips`, …)                                                                     | `src/components/ui/combobox.tsx:206-281`                                                         |
| `toggle.tsx` y `checkbox.tsx` existen                                                                                                            | `src/components/ui/`                                                                             |
| `normalizeSearch` está en `src/lib/text.ts` y lo usa `picker-model.ts`                                                                           | `picker-model.ts:2`, `:41-42`                                                                    |
| `/proyectos` pasa las tres actions por props; la cabecera tiene «Nuevo cliente» y «Nuevo proyecto»                                               | `app/(app)/proyectos/page.tsx:6-16`; `projects-screen.tsx:27-61`                                 |
| `seedProject` de e2e no siembra el facturable                                                                                                    | `e2e/database.ts:133-211`                                                                        |

## 1. Alcance

### 11a — facturable

Entran:

- **TT-14**: el control de facturable en la barra (modo timer y modo manual),
  en cada fila y en el diálogo del calendario, con el valor por defecto del
  proyecto.
- **TT-15**: el facturable es un booleano visible, sin importes.
- **PR-21** (`adaptar`): «Facturable por defecto» en el alta de proyecto. En
  Clockify se cambia en la configuración de un proyecto ya creado (H-8).
- **CAL-21, CAL-23, CAL-45, CAL-66, CAL-75** en lo que toca al facturable: el
  ícono en el bloque, la línea del detalle, el campo en los tres modos del
  diálogo y el nombre accesible del bloque.

Entran por arrastre, verificándose por el camino nuevo:

- **TT-27**: el facturable se cambia con el timer corriendo, sobre la entrada
  abierta.
- **TT-38, TT-39**: recargar o abrir en otro dispositivo muestra el facturable
  del timer.
- **TT-49, TT-50**: la fila suma el facturable en su lugar, y sin marcar si no
  lo es.
- **TT-54**: el facturable se edita desde la fila.
- **TT-57, TT-58**: continuar y duplicar copian el facturable de la original.
- **TT-25**: «Agregar» limpia también el facturable.
- **TT-92**: con la membresía desactivada, el facturable se muestra y no se
  cambia.

### 11b — etiquetas

Entran:

- **TT-12** (`adaptar` desde H-1): el selector de etiquetas en la barra, en
  cada fila y en el diálogo.
- **TT-78**: la etiqueta inexistente o archivada se rechaza al asignarla.
- **TT-88**: el selector de un workspace sin etiquetas.
- **TT-105**: la etiqueta borrada desaparece de la entrada (lo prueba la base).
- **De `proyectos.md`, los 13 del slice 11** (§14.1) menos PR-21, que es del
  11a: PR-42 … PR-44, PR-47, PR-48, PR-52, PR-68, PR-69, PR-73, PR-80, PR-88,
  PR-112. Y la parte de etiquetas de PR-53, PR-54, PR-58 y PR-62 (§14.3).
- **CAL-23, CAL-45, CAL-66** en lo que toca a las etiquetas.
- **El alta y la lista de etiquetas** en `/proyectos` (D-1, PR-112).

Entran por arrastre: **TT-27, TT-38, TT-39, TT-49, TT-50, TT-54, TT-57, TT-58,
TT-25, TT-92** con las etiquetas, como en el 11a; **TT-61**: la constancia del
borrado de una entrada conserva sus etiquetas.

### Lo que el slice decide y la paridad ya registra

`parity-analyst` registró en `939e5bc` lo que deciden D-1 … D-5 y los huecos
H-1 … H-13 (la tabla de huecos dice dónde):

- **11a**: TT-14 con el control de H-7 y la regla de D-2; PR-21, `adaptar`, con
  H-8; TT-50 con H-6 para el facturable; TT-57 y TT-58 copian el facturable de
  la original aunque el proyecto haya cambiado su valor por defecto después;
  CAL-21, CAL-23, CAL-45, CAL-66 y CAL-75 con H-10 para el facturable.
- **11b**: TT-12, `adaptar`, con H-1, H-2, H-3 y H-6; TT-88 y PR-88 con H-4;
  PR-47 con H-5; PR-48 con D-4; TT-57 y TT-58 con D-3; PR-112 con H-13;
  TT-105 cerrado por PR-46; CAL-23 con H-10 para las etiquetas.

**Lo que queda para antes del merge de cada parte** (§6): la sección «Slice
11a» o «Slice 11b» de §11 de `time-tracker.md`, «Lo que queda» de ese mismo
§11 y §18 de `calendario.md`, que pasan a decir qué quedó implementado, y
cualquier diferencia entre lo registrado y lo que se implementó.

### Queda afuera

- **TT-13**: crear una etiqueta desde el selector.
- **Editar, archivar, restaurar y borrar etiquetas** (PR-45, PR-46): fase 2.
  Este slice prueba sus efectos sembrando el estado, como el 10 con el proyecto
  archivado.
- **Editar el facturable por defecto de un proyecto ya creado**: fase 2 (PR-21,
  §14.3 de `proyectos.md`).
- **Etiquetas y facturable en la edición masiva** (resto de TT-63): slice 12.
  `bulkEditChanges` no cambia.
- **Limitar quién crea etiquetas** (PR-44, «limit creation to Admins»): no
  existe la configuración; cuando llegue, ADR 0009.
- **Tarifas e importes** (TT-15, PR-29).
- **«Reintentar» en el alta manual** (TT-109): su slice propio (§0).

### Consecuencias sobre código ya entregado

**11a:**

| Archivo                                                  | Qué cambia                                                                                                                                                                         | Qué hay que volver a probar                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/server/db/schema.ts`                                | `time_entry.billable` (§2.1).                                                                                                                                                      | La creación de entradas de todos los slices           |
| `project/schema.ts`, `project/service.ts`                | `createProjectInput.billableByDefault`; `TrackingProjectView.billableByDefault`; `assertTrackable` devuelve `TrackableProject` (§4.1).                                             | `service.integration.test.ts` del módulo              |
| `time-entry/schema.ts`                                   | `billable` en las dos altas, en `updateEntryChanges` y en la vista.                                                                                                                | `schema.test.ts` entero                               |
| `time-entry/repository.ts`                               | `billable` en las altas, en `ClosedEntryFields` y en `updateProject`.                                                                                                              | Todo test de integración del módulo                   |
| `time-entry/service.ts`                                  | La regla de §4.1 en las altas, `updateEntryProject` y `updateEntry`; `continuedFields` copia el facturable, y su tipo privado `EntryFields` pasa a llamarse `CopiedFields` (§4.3). | `service.integration.test.ts` entero                  |
| `tracker-bar.tsx`                                        | `pairDraft` y `heldPair` pasan a un borrador de campos (§5.3); el control y su mutación.                                                                                           | TT-22 … TT-30, TT-65, TT-89, `project-picker.spec.ts` |
| `timer-bar.tsx`, `manual-bar.tsx`, `entry-row.tsx`       | El control después del selector de proyecto.                                                                                                                                       | TT-25, TT-49, TT-92                                   |
| `day-group.tsx`                                          | Una mutación más por fila, con su aviso; la vista optimista del proyecto aplica `withSelection` (§5.5).                                                                            | TT-54, TT-55                                          |
| `calendar/entry-dialog*.ts(x)`, `calendar-block.tsx`     | El campo en el diálogo y en su borrador; el ícono en el bloque y la línea del detalle.                                                                                             | `calendar-edit.spec.ts`, `entry-dialog.test.tsx`      |
| `project/components/new-project-dialog.tsx`, `labels.ts` | La casilla de PR-21.                                                                                                                                                               | `projects.spec.ts`                                    |
| `src/test/factories.ts`, `e2e/database.ts`               | `seedTimeEntry` acepta `billable`; los dos `seedProject`, `billableByDefault`.                                                                                                     | —                                                     |

**11b:**

| Archivo                                                                                | Qué cambia                                                                                                                                                                               | Qué hay que volver a probar          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `src/server/db/schema.ts`                                                              | `tag`, `time_entry_tag`, `time_entry_workspace_id_unq`, en tres migraciones (§2.2).                                                                                                      | La creación y el borrado de entradas |
| `src/server/permissions/index.ts`                                                      | `tag.create`, `tag.view` (§3).                                                                                                                                                           | `permissions.test.ts`                |
| `src/lib/text.ts`                                                                      | `compareNames`, que sale de `project/service.ts` con el desempate por id (§5.2).                                                                                                         | El orden del catálogo                |
| `project/schema.ts`, `service.ts`, `repository.ts`, `actions.ts`                       | `TagRef`; `createTag`; `assertTaggable`; los catálogos con etiquetas.                                                                                                                    | Los tests del módulo                 |
| `time-entry/schema.ts`                                                                 | `tagIds` en las altas, `tags` en `updateEntryChanges` y en la vista; `TAGS_MAX`.                                                                                                         | `schema.test.ts` entero              |
| `time-entry/repository.ts`                                                             | `EntryRefs.tags`; las lecturas con bloqueo leen las referencias en una segunda sentencia (§5.1); las altas y `updateClosedEntry`/`updateRunningEntry` escriben la unión; `isMissingTag`. | Todo test de integración del módulo  |
| `time-entry/service.ts`                                                                | Las etiquetas en las altas, en `continuedFields`, en `updateEntry`, en la vista y en las constancias de borrado; `translatingPairConstraints` cambia de nombre.                          | `service.integration.test.ts` entero |
| `tracker-bar.tsx`, `timer-bar.tsx`, `manual-bar.tsx`, `entry-row.tsx`, `day-group.tsx` | El selector de etiquetas, como el control del 11a.                                                                                                                                       | Los mismos que el 11a                |
| `calendar/entry-dialog*.ts(x)`, `calendar-block.tsx`                                   | El campo en el diálogo; las etiquetas en el detalle.                                                                                                                                     | `calendar-edit.spec.ts`              |
| `projects-screen.tsx`, `app/(app)/proyectos/page.tsx`                                  | «Nueva etiqueta» y la sección «Etiquetas» (PR-112).                                                                                                                                      | `projects.spec.ts`                   |
| `src/test/factories.ts`                                                                | `seedTag`; `seedTimeEntry` acepta `tagIds`.                                                                                                                                              | —                                    |

## 2. Cambios de esquema

El diario `drizzle/meta/_journal.json` no se edita a mano, y las migraciones se
nombran por etiqueta: **el número sale del diario al generarlas**. Sobre
`54daee0` serían la `0008` del 11a y de la `0009` a la `0011` del 11b; con el
7b en `main` (§0), que trae la `0008`, la del 11a es la `0009` y las del 11b,
de la `0010` a la `0012`.

**Si otra migración entra a `main` antes que una parte, la de esa parte se
descarta y se regenera después del rebase**, como manda el §0 del 7b: renumerar
a mano rompe la cadena `prevId` de las instantáneas y el diario. De
`tags_set_null` se conserva el contenido escrito a mano y se vuelve a pegar en
la que genera `--custom`.

### 2.1 11a: `time_entry.billable`

Una migración generada, `npm run db:generate -- --name=time_entry_billable`:

- **`billable boolean not null default false`** en `time_entry`. Todas las
  entradas existentes quedan no facturables, que es lo que eran (TT-14: sin
  proyecto, o con un proyecto que hasta hoy nacía en `false`).
- Sin índice: ninguna lectura de la fase 1 filtra por facturable. Los reportes
  deciden el suyo.

### 2.2 11b: `tag` y `time_entry_tag`

Tres migraciones, en este orden. **Entran o fallan juntas**: el migrador corre
todas las pendientes en una sola transacción.

1. **`time_entry_workspace_id_unq`, generada sola**, con
   `npm run db:generate -- --name=time_entry_workspace_id_unq`, después de
   sumarle a `time_entry` solo la restricción única y antes de declarar `tag` y
   `time_entry_tag`.
2. **`tags`, la generada**, con `npm run db:generate -- --name=tags`.
3. **`tags_set_null`, escrita a mano**, con
   `npm run db:generate -- --custom --name=tags_set_null`, que reemplaza
   `tag_created_by_fk` por la forma `on delete set null (created_by)`, con el
   mismo nombre, como la `0004`.

**Por qué la única va aparte.** En una sola migración, `drizzle-kit generate`
(0.31.11) escribe la clave foránea `time_entry_tag_entry_fk` hacia
`time_entry (workspace_id, id)` antes de la `UNIQUE` de `time_entry`, que deja
última. Postgres rechaza una clave foránea sin una restricción única en el
destino y, como el migrador corre todo en una transacción, falla el
`db:migrate` entero. En una migración anterior, la `UNIQUE` ya existe cuando
llega la clave.

**`tag`** (PR-42, PR-43), declarada después de `task` y antes de `time_entry`:

| Columna                    | Tipo                                 | Nota                                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `id`                       | `uuid primary key default random`    | El alta lo trae del cliente (ADR 0007).               |
| `workspace_id`             | `uuid not null`                      |                                                       |
| `name`                     | `text not null`                      |                                                       |
| `archived_at`              | `timestamptz null`                   | Nulo es activa (PR-45). En la fase 1 solo se siembra. |
| `created_by`               | `text null`                          | Lo que hace «propia» la fila en un reintento.         |
| `created_at`, `updated_at` | `timestamptz not null default now()` | `updated_at` con `$onUpdate`.                         |

| Restricción            | Qué                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tag_workspace_fk`     | `(workspace_id)` → `workspace (id)`, `on delete cascade`                                                                     |
| `tag_created_by_fk`    | `(workspace_id, created_by)` → `membership (workspace_id, user_id)`, `on delete set null (created_by)` por la escrita a mano |
| `tag_workspace_id_unq` | `unique (workspace_id, id)`: el destino de la clave de la unión                                                              |
| `tag_name_unq`         | índice único `(workspace_id, lower(name))`, sin condición: los archivados cuentan (PR-52, PR-53)                             |
| `tag_name_len`         | `check (char_length(name) between 1 and 100)` (PR-54)                                                                        |
| `tag_name_trimmed`     | `check (name = btrim(name))`                                                                                                 |

**`time_entry_tag`** (PR-48), declarada después de `time_entry`:

| Columna         | Tipo            |
| --------------- | --------------- |
| `workspace_id`  | `uuid not null` |
| `time_entry_id` | `uuid not null` |
| `tag_id`        | `uuid not null` |

| Restricción                        | Qué                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| clave primaria                     | `(time_entry_id, tag_id)`: una etiqueta no se repite en una entrada                                           |
| `time_entry_tag_workspace_fk`      | `(workspace_id)` → `workspace (id)`, `on delete cascade`                                                      |
| `time_entry_tag_entry_fk`          | `(workspace_id, time_entry_id)` → `time_entry (workspace_id, id)`, `on delete cascade`                        |
| `time_entry_tag_tag_fk`            | `(workspace_id, tag_id)` → `tag (workspace_id, id)`, `on delete cascade` (PR-69, TT-105)                      |
| `time_entry_tag_workspace_tag_idx` | índice `(workspace_id, tag_id)`: lo recorre el `cascade` al borrar una etiqueta, y lo van a usar los reportes |

Y en `time_entry`, con la primera migración:

- **`time_entry_workspace_id_unq`**, `unique (workspace_id, id)`: el destino de
  `time_entry_tag_entry_fk`. Es la regla del 9 —ninguna referencia cruza
  workspaces en la base, haga lo que haga el service— aplicada a la unión: con
  las dos claves compuestas, una fila de la unión no puede juntar una entrada de
  un workspace con una etiqueta de otro.
- **Por qué `cascade` desde la entrada**: borrar una entrada borra sus
  etiquetas, que no tienen vida propia fuera de ella. La copia queda en la
  constancia del borrado (§4.10, TT-61).
- **Sin `created_at` en la unión**: el cambio queda en el registro de
  auditoría, como el par.

### 2.3 Sin tiempo de caída

- **11a**: una columna con valor por omisión constante no reescribe la tabla
  (Postgres 11+). Toma `ACCESS EXCLUSIVE` sobre `time_entry` un instante.
- **11b**:
  - Las dos tablas nuevas no bloquean nada.
  - **`time_entry_workspace_id_unq` es un `add constraint … unique`, que toma
    `ACCESS EXCLUSIVE` sobre `time_entry`** mientras construye su índice:
    bloquea las escrituras y también las lecturas. Las claves de la unión toman
    `SHARE ROW EXCLUSIVE` sobre `time_entry` y `tag`, con la unión vacía.
  - Con el tamaño de hoy, segundos.
  - **Con la tabla grande, esa migración se hace a mano y fuera del migrador**:
    `create unique index concurrently` no corre dentro de una transacción, y el
    migrador envuelve todo en una. Primero el índice concurrente, después la
    restricción con `add constraint … unique using index`. No es el caso hoy.
- **Las migraciones van antes del despliegue**, como en el §2.2 del 7b: el
  código viejo nombra las columnas una por una (Drizzle arma la lista desde el
  esquema), así que no ve `billable` ni las tablas nuevas, y una entrada que
  inserta sin `billable` queda en `false`.
- Ninguna fila existente cambia de valor.

### 2.4 Reversión

**Primero el código**, siempre: el código del slice lee las columnas nuevas en
cada lectura y fallaría con el esquema revertido.

- **11a**: `drop column billable`. Se pierde el facturable de todas las
  entradas. Después, la fila de la migración en `drizzle.__drizzle_migrations`.
- **11b**: `drop table time_entry_tag`, `drop table tag`, `drop constraint
time_entry_workspace_id_unq`, y las filas de las tres migraciones. **Se
  pierden todas las etiquetas y sus asignaciones**; las entradas quedan.

## 3. Permisos

**11a: ninguna acción nueva.** Cambiar el facturable de una entrada es
`timeEntry.own.update`, y elegirlo al crear, `timeEntry.own.create`. El
facturable por defecto del proyecto se escribe en el alta, con `project.create`.

**11b: dos acciones nuevas** en `ResourceByAction`, `resourceKinds` y
`allowedRoles`:

| Acción       | Recurso             | Roles                  | Origen                                          |
| ------------ | ------------------- | ---------------------- | ----------------------------------------------- |
| `tag.create` | `WorkspaceResource` | los cinco (`everyone`) | PR-44, PR-58: «Everyone can create tags»        |
| `tag.view`   | `WorkspaceResource` | los cinco (`everyone`) | PR-62: «Las etiquetas las ve todo el workspace» |

- **`tag.create` lleva el comentario de `client.create` y `project.create`**:
  la configuración que limita la creación a los admins no existe en la fase 1
  y, cuando llegue, viaja en un recurso propio (ADR 0009).
- **Por qué `tag.view` y no nada.** Leer el catálogo de etiquetas es una
  decisión de acceso —quién ve las etiquetas del workspace (PR-62)— y ninguna
  decisión de acceso vive fuera de `can()`. Sin la acción, una membresía no
  activa recibiría el catálogo entero, y la regla «quién ve» quedaría
  implícita en la lectura. Con ella, la membresía no activa recibe un catálogo
  vacío (PR-60) y la fase 2 tiene dónde poner una restricción. **No es una
  acción sin efecto**, que es el argumento del 10 contra `task.track`: no hay
  otra acción que ya decida lo mismo.
- **Usar una etiqueta es verla.** Asignarla a una entrada propia son dos
  decisiones: `timeEntry.own.*` sobre la entrada y `tag.view` sobre el
  workspace, esta dentro de `assertTaggable` (§4.5). No hay `tag.use`: decidiría
  lo mismo que `tag.view`.
- **El archivado no es una decisión de acceso**, como en el proyecto: es el
  estado de la fila y lo resuelve `assertTaggable`.

| Operación                                  | Acción de `can()`                   | Recurso                        |
| ------------------------------------------ | ----------------------------------- | ------------------------------ |
| Crear una etiqueta                         | `tag.create`                        | el workspace de quien actúa    |
| Leer el catálogo de etiquetas              | `tag.view`                          | el workspace de quien actúa    |
| Asignar etiquetas al crear una entrada     | `timeEntry.own.create` y `tag.view` | la entrada nueva; el workspace |
| Cambiar las etiquetas de una entrada       | `timeEntry.own.update` y `tag.view` | la fila leída; el workspace    |
| Cambiar el facturable de una entrada (11a) | `timeEntry.own.update`              | la fila leída                  |

## 4. Contrato de las server actions

**Ninguna action nueva en `time-entry`.** La fila y la barra cambian el
facturable y las etiquetas de una entrada existente con `updateEntry`, con un
solo grupo, en lugar de sumar `updateEntryBillable` y `updateEntryTags`. Es lo
que el ADR 0013 anticipa («cada consumidor nuevo suma un grupo opcional»): una
regla, un camino, una traducción de errores y un permiso que ya están probados.
La alternativa —dos actions de un campo, como `updateDescription`— son dos
actions más con sus casos de traducción, permiso y revalidación, para el mismo
efecto. Las mutaciones de un campo que ya existen no cambian de camino. Lo
registra el ADR 0016 en sus consecuencias.

**Una action nueva en `project` (11b)**: `createTag`.

### 4.1 La regla del facturable (11a)

```ts
// src/lib/billable.ts (nuevo, puro: lo usan el servidor y el navegador)

/** Lo que una entrada tiene hoy: su proyecto y su facturable. */
export type BillableState = {
  readonly projectId: string | null;
  readonly billable: boolean;
};

/** El proyecto que se asigna, con su facturable por defecto (PR-21). */
export type BillableSource = {
  readonly id: string;
  readonly billableByDefault: boolean;
};

/** Una entrada nueva: sin proyecto y no facturable (TT-14). */
export const NEW_ENTRY_BILLABLE: BillableState = { projectId: null, billable: false };

/**
 * TT-14, PR-21, D-2: el facturable de una entrada después de asignarle
 * `next`. Un proyecto distinto del que tiene impone su valor por defecto; el
 * mismo proyecto —con otra tarea o sin ella— y «Sin proyecto» (`null`) lo
 * conservan.
 */
export function billableFor(current: BillableState, next: BillableSource | null): boolean;
```

| `current.projectId` | `next`                        | Resultado             |
| ------------------- | ----------------------------- | --------------------- |
| cualquiera          | `null` («Sin proyecto»)       | `current.billable`    |
| `P`                 | `P` (otra tarea, o sin tarea) | `current.billable`    |
| `null` o `P`        | `Q`, distinto                 | `Q.billableByDefault` |

Los ids se comparan con `sameId` (`src/lib/project-pair.ts`).

**Dónde se aplica** —lo que el pedido no fija lo decide `billableFor`; lo que
fija, gana—:

| Operación                                    | `billable` en el pedido | Facturable que se escribe                                                                  |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `startTimer`, `createManualEntry`            | presente                | ese valor                                                                                  |
| `startTimer`, `createManualEntry`            | ausente                 | `billableFor(NEW_ENTRY_BILLABLE, proyecto pedido)`: el por defecto, o `false` sin proyecto |
| `continueEntry`, `duplicateEntry`            | —                       | el de la original (`continuedFields`), aunque su proyecto haya cambiado el por defecto     |
| `updateEntryProject`                         | —                       | `billableFor(fila, proyecto pedido)`                                                       |
| `updateEntry` con `billable`                 | presente                | ese valor, venga o no `project`                                                            |
| `updateEntry` con `project` y sin `billable` | ausente                 | `billableFor(fila, proyecto pedido)`                                                       |
| `updateEntry` sin ninguno de los dos         | —                       | sin cambio                                                                                 |
| las demás                                    | —                       | sin cambio                                                                                 |

**El dato del proyecto llega por `assertTrackable`**, que ya lee la fila:

```ts
// src/modules/project/schema.ts
/** Lo que una entrada necesita del proyecto que se le asigna. */
export type TrackableProject = BillableSource;

// src/modules/project/service.ts — cambia el retorno, no lo que valida ni cómo lee.
export async function assertTrackable(
  tx: Transaction,
  actor: Actor,
  target: { readonly projectId: string; readonly taskId: string | null },
): Promise<TrackableProject>;
```

`assertAssignable` de `time-entry` devuelve `TrackableProject | null`: `null`
cuando `pairToCheck` no pide validar, que son justamente los casos en que
`billableFor` conserva el valor. Lo que fija el ADR 0010 no cambia: la función
solo lee, con el `tx` que recibe, y lanza solo `not_found`.

### 4.2 Los tipos del 11a

```ts
// src/modules/project/schema.ts
export const createProjectInput = z.object({
  /* …lo de hoy… */
  /** PR-21: con qué facturable arrancan las entradas nuevas con este proyecto. */
  billableByDefault: z.boolean().default(false),
});

export type TrackingProjectView = ProjectRef & {
  readonly tasks: readonly TaskRef[];
  /** PR-21: el navegador aplica `billableFor` al elegirlo (§5.3). */
  readonly billableByDefault: boolean;
};
```

```ts
// src/modules/time-entry/schema.ts
/** TT-14: ausente, el servidor aplica el por defecto del proyecto (§4.1). */
const newEntryBillable = { billable: z.boolean().optional() };

// startTimerInput y createManualEntryInput suman `...newEntryBillable`.

// updateEntryChanges suma, dentro del `strictObject`:
//   billable: z.boolean().optional(),
// La refinación «al menos un grupo» y la de `times` con `runningStart` no cambian.

// timeEntryView suma:
//   /** TT-14, TT-15: un booleano visible, sin importes. */
//   billable: z.boolean(),
```

`ProjectView` (de `/proyectos`) no cambia: el valor por defecto no se muestra
en la lista hasta que la fase 2 traiga su edición.

### 4.3 Cada mutación del 11a

**El orden de `updateEntry` (ADR 0013) gana un paso al final**: estado de la
fila, descripción y horario, par, **facturable**. El facturable no rechaza
nada, así que el orden solo fija de dónde sale el valor por defecto: del
proyecto que el paso del par validó.

| Mutación             | Qué cambia                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createProject`      | Escribe `billableByDefault` del pedido. El reintento de `createOnce` responde la fila del primer intento.                                                                                      |
| `startTimer`         | `billable` por §4.1, con el `TrackableProject` del par ya validado antes de cerrar el timer abierto. `insertRunning` lo escribe.                                                               |
| `createManualEntry`  | Igual, antes del `insert`.                                                                                                                                                                     |
| `continueEntry`      | `continuedFields` devuelve `{ description, projectId, taskId, billable }`; la validación del par no cambia.                                                                                    |
| `duplicateEntry`     | Igual.                                                                                                                                                                                         |
| `updateEntryProject` | Con el par distinto, `billable = billableFor(fila, proyecto)`. `updateProject` recibe `{ projectId, taskId, billable }` y escribe las tres columnas juntas. Con el mismo par, nada (como hoy). |
| `updateEntry`        | Grupo `billable`: se escribe si difiere de la fila. Sin el grupo y con el par cambiado, `billableFor`. Una entrada que corre lo cambia igual que una cerrada (TT-27).                          |
| las demás            | No lo tocan.                                                                                                                                                                                   |

- **`ClosedEntryFields` suma `billable?: boolean`** y `columnsOf` lo escribe en
  su columna; `RunningEntryFields` lo hereda. `ClosedFields`, el de la masiva,
  no cambia: el facturable en bloque es del 12.
- **«Sin cambios» en `updateEntry`** sigue siendo «ningún campo que escribir»:
  un `billable` igual al de la fila no cuenta.
- **El reintento de un alta** no recalcula nada: `createOnce` responde la fila
  del primer intento (ADR 0007).
- **El tipo privado `EntryFields` de `service.ts:416` pasa a llamarse
  `CopiedFields`** cuando `continuedFields` suma `billable` (y en el 11b,
  `tagIds`): `EntryFields` es desde el 11a el borrador del navegador (§5.3), y
  dos tipos del mismo módulo con el mismo nombre y otra forma confunden.

### 4.4 Los tipos del 11b

```ts
// src/modules/project/schema.ts
/** Lo que se muestra y se elige de una etiqueta (PR-43). */
export type TagRef = { readonly id: string; readonly name: string };

export const createTagInput = z.object({ id: z.uuidv4(), name });
export type CreateTagInput = z.input<typeof createTagInput>;
export type CreateTagValues = z.output<typeof createTagInput>;
export type CreateTagResult = { readonly tag: TagRef };

// TrackingCatalog y ProjectCatalog suman:
//   /** TT-88: el enlace a `/proyectos` del selector vacío. */
//   readonly canCreateTag: boolean;
//   /** Las activas, en orden alfabético; vacío sin `tag.view` (PR-62, PR-60). */
//   readonly tags: readonly TagRef[];

// ProjectActions suma `createTag`.

// projectMessages suma:
//   tagUnavailable: "Esa etiqueta ya no está disponible.",  // TT-78, PR-73
//   tagNameTaken: "Ya hay una etiqueta con ese nombre.",    // PR-80
```

```ts
// src/modules/time-entry/schema.ts
/** D-4: tope de etiquetas de una entrada. */
export const TAGS_MAX = 50;

/**
 * Las etiquetas de una entrada, enteras: el pedido fija el conjunto, no
 * «las que cambiaron». Se normalizan a minúsculas y sin repetir, como
 * `entryIds`: la base los iguala.
 */
const tagIds = z
  .array(z.uuid())
  .max(TAGS_MAX, timeEntryMessages.tooManyTags)
  .transform(uniqueIds);

// startTimerInput y createManualEntryInput suman `tagIds: tagIds.default([])`.
// updateEntryChanges suma `tags: tagIds.optional()`.

// timeEntryView suma:
//   /** Con la forma de `TagRef`, en orden alfabético, archivadas incluidas (PR-47). */
//   tags: z.array(z.object({ id: z.uuid(), name: z.string() })),

// timeEntryMessages suma:
//   tooManyTags: `Se pueden elegir hasta ${TAGS_MAX} etiquetas por entrada.`,
```

- **`uniqueIds`** es la transformación que hoy vive dentro de `entryIds`
  (`schema.ts:189`), extraída a una función privada del esquema que usan los dos.
- **El grupo de `updateEntryChanges` se llama `tags`** y lleva ids, como
  anticipó el 8c (§4.9); en las altas la clave es `tagIds`, al lado de
  `projectId`.

### 4.5 La regla de las etiquetas (11b)

Dos piezas, una por módulo, con la forma de las del par.

**`assertTaggable`, en `src/modules/project/service.ts`** (ADR 0010, ADR 0016):

```ts
/**
 * PR-45, PR-73, TT-78. Lanza `ProjectError("not_found", tagUnavailable)` si
 * alguna de `tagIds` no está en el workspace de quien actúa, está archivada, o
 * `tag.view` no la deja ver. Solo lee, con la transacción de quien la llama.
 * Con `tagIds` vacío no consulta.
 */
export async function assertTaggable(
  tx: Transaction,
  actor: Actor,
  tagIds: readonly string[],
): Promise<void>;
```

1. Vacío: vuelve sin leer.
2. `can(actor, "tag.view", workspaceResource(actor))` en falso: `not_found`. En
   la práctica no se alcanza —el permiso de la entrada corta antes a una
   membresía no activa—, pero la regla «usar es ver» vive en `can()` y no en el
   orden de las llamadas.
3. `findTags(tx, actor.workspaceId, tagIds)`, nuevo en `project/repository.ts`:
   las filas de esos ids **en ese workspace**, en cualquier estado.
4. Si falta alguna, o alguna tiene `archived_at`: `not_found` con
   `tagUnavailable`. **Un mensaje para todas**: el aviso no nombra cuál, como
   TT-77 no nombra el proyecto.

**`tagsToCheck`, en `src/modules/time-entry/assignment.ts`**, junto a
`pairToCheck`:

```ts
/**
 * Las etiquetas pedidas que la entrada todavía no tiene: las únicas que se
 * validan. Las que ya tiene se conservan aunque estén archivadas (PR-47, PR-68).
 */
export function tagsToCheck(
  current: readonly string[],
  requested: readonly string[],
): string[];
```

Y en **`src/lib/tag-ids.ts`** (nuevo, puro, lo usan el servidor y el
navegador):

```ts
/** Los dos conjuntos tienen las mismas etiquetas, sin importar orden ni mayúsculas. */
export function sameTagIds(left: readonly string[], right: readonly string[]): boolean;
```

| Pedido                                       | Se valida               | Por qué                                    |
| -------------------------------------------- | ----------------------- | ------------------------------------------ |
| El mismo conjunto que ya tiene               | nada; no se escribe     | `sameTagIds`                               |
| Quitar etiquetas, también archivadas         | nada                    | Quitar no asigna (TT-10, por analogía)     |
| Agregar etiquetas                            | solo las nuevas         | PR-45: una archivada no se asigna de nuevo |
| Conservar una archivada y agregar una activa | solo la activa          | PR-47                                      |
| Un alta                                      | todas (`current` vacío) | Ninguna es «de antes»                      |

**Sin bloqueo**, por la misma razón que el par (contrato del 10, §4.3): una
asignación que se cruza con un archivado termina igual que si el archivado
llegara después (PR-47). Un borrado en el medio lo resuelve la clave foránea
(§4.9).

### 4.6 Cada mutación del 11b

**El orden de `updateEntry` gana el último paso**: estado de la fila,
descripción y horario, par, facturable, **etiquetas**. Con un proyecto no
disponible y una etiqueta archivada, responde TT-77.

| Mutación                                           | Qué hace con las etiquetas                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startTimer`                                       | `assertTaggable(tx, actor, tagIds)` después del par y **antes de cerrar el timer abierto**; `insertRunning` escribe la unión.                                                            |
| `createManualEntry`                                | Igual, antes del `insert`.                                                                                                                                                               |
| `continueEntry`                                    | `continuedFields` suma `tagIds` de la original; las valida todas **antes de cerrar el timer**. Con una archivada, TT-78 y no escribe nada (D-3).                                         |
| `duplicateEntry`                                   | Igual, antes del `insert`.                                                                                                                                                               |
| `updateEntry`                                      | Grupo `tags`: si `!sameTagIds(fila, pedido)`, `assertTaggable(tx, actor, tagsToCheck(fila, pedido))` y se reemplaza el conjunto. Sobre la entrada que corre y sobre una cerrada (TT-27). |
| `deleteEntry`, `discardTimer`, `bulkDeleteEntries` | La unión se va en cascada; la constancia suma `tagIds` (§4.10).                                                                                                                          |
| las demás                                          | No las tocan ni las validan: una entrada con una etiqueta archivada se detiene, se edita y se borra como cualquiera (PR-47).                                                             |

**Las escrituras del repository**:

- **`insertRunning` e `insertClosed` reciben `tagIds`** y escriben las filas de
  la unión antes de releer, en la misma transacción. Sin etiquetas, no hay
  sentencia.
- **`ClosedEntryFields` suma `tagIds?: readonly string[]`**. `updateClosedEntry`
  y `updateRunningEntry` escriben las columnas si hay alguna y el conjunto si
  viene `tagIds`, y releen. Con solo `tagIds` no hay `update` de `time_entry`:
  el estado de la fila ya lo decidió el service bajo el bloqueo de
  `readOwnEntry`, que serializa toda escritura sobre esa entrada.
- **Reemplazar el conjunto** son dos sentencias: borrar las filas de la entrada
  que no están en el pedido, e insertar las que faltan con `on conflict do
nothing`. Las dos filtran por `workspace_id` y `time_entry_id` del destino
  leído (`EntryTarget`), nunca de la entrada del cliente.
- **`columnsOf` no deja pasar `tagIds`** a `update … set`: `updateClosedFields`,
  el de la masiva, sigue recibiendo solo columnas.
- **`writeEntryEdit`** considera «sin cambios» cuando no hay columnas ni
  `tagIds`.

### 4.7 `updateEntry` con los grupos nuevos, de punta a punta

Lo que §4.3 del 8c fija no cambia; se suman dos pasos después del par y antes
de «si no cambia nada»:

1. Lectura con bloqueo y autorización, como hoy; desde el 11b, las referencias
   salen de la segunda sentencia de §5.1.
2. El estado de la fila contra lo pedido, como hoy.
3. La descripción y el horario, como hoy.
4. **El par**, como hoy. `assignedPair` devuelve además el `TrackableProject`
   validado, o `null`.
5. **El facturable** (11a): `changes.billable` si viene; si no, y el par
   cambió, `billableFor(fila, proyecto)`. Se escribe si difiere de la fila.
6. **Las etiquetas** (11b): si viene `tags` y `!sameTagIds`, `assertTaggable`
   con `tagsToCheck`, y `tagIds` entra en los campos.
7. Sin campos, responde la vista sin escribir ni registrar.
8. **Una escritura**, con todo lo que cambió.
9. `recordAudit` con `timeEntry.update` y solo lo escrito: `valuesOf` suma
   `billable` y `tagIds`.

### 4.8 `createTag` (11b)

PR-42 … PR-44, PR-52, PR-54, PR-80, PR-112. Es `createClient` con un campo:

1. La action parsea con `createTagInput` y llama al service.
2. El service consulta `assertCan(actor, "tag.create", workspaceResource(actor))`
   **antes de `createOnce`**: una membresía no activa no recibe éxito por el id
   de una etiqueta suya que ya existe (ADR 0007).
3. `createOnce` con `findOwnTag(workspaceId, userId, id)` (por `created_by`),
   `idConstraint: "tag_pkey"`, y un `attempt` que inserta con `created_by` =
   quien actúa y deja `tag.create` en el registro con la fila.
4. `translatingNameTaken(isTagNameTaken, tagNameTaken, …)`: el índice
   `tag_name_unq` que deja pasar `createOnce` sale como `validation` con PR-80
   (PR-91).
5. Responde `{ tag: TagRef }`. El reintento responde la fila del primer
   intento, esté o no archivada: una etiqueta archivada no deja de ser propia, y
   no hay nada que revelar (PR-62). Es la única diferencia con `createProject`,
   que la rechaza porque un proyecto puede haber dejado de verse.

### 4.9 Los mensajes y los errores

| Causa                                               | Código       | Texto                                              | Origen       |
| --------------------------------------------------- | ------------ | -------------------------------------------------- | ------------ |
| Etiqueta inexistente, de otro workspace o archivada | `not_found`  | «Esa etiqueta ya no está disponible.»              | TT-78, PR-73 |
| Más de 50 etiquetas                                 | `validation` | «Se pueden elegir hasta 50 etiquetas por entrada.» | D-4, PR-48   |
| Nombre de etiqueta repetido                         | `validation` | «Ya hay una etiqueta con ese nombre.»              | PR-80        |
| Nombre vacío o largo                                | `validation` | los de PR-75 y PR-76                               | PR-75, PR-76 |
| Sin permiso para crear                              | `forbidden`  | «No tenés permiso para hacer esto.»                | PR-84        |

- **TT-78 sale de `assertTaggable` como `ProjectError`**, y `failure` de
  `src/server/action.ts` lo deja pasar con su código, como TT-77.
- **La red de la clave foránea.** Si una etiqueta se borra entre
  `assertTaggable` y la escritura —en la fase 1 nada borra—, el `insert` falla
  con `23503` sobre `time_entry_tag_tag_fk`. `isMissingTag(error)`, en el
  repository junto a `isMissingProject`, lo reconoce, y el traductor lo responde
  con TT-78.
- **`translatingPairConstraints` pasa a llamarse
  `translatingReferenceConstraints`**: ya no traduce solo el par. Es un cambio
  de nombre en sus llamadas, sin cambio de conducta.
- **El facturable no tiene errores propios**: un booleano mal formado es
  `validation` de Zod.

### 4.10 Revalidación, reintento y auditoría

- **Revalidación**: `time-entry` sin cambios (`"/"` y `"/calendario"`).
  `createTag` revalida `"/proyectos"`, como las altas del 9. El catálogo del
  rastreador y del calendario se lee en cada dibujo, así que la etiqueta nueva
  aparece en cuanto la persona vuelve a `/`.
- **Reintento**:
  - `updateEntry` con `billable` o `tags` llega a un punto fijo: el pedido fija
    el valor entero. Ofrece «Reintentar» con `unexpected` (TT-89).
  - `createTag` ofrece «Reintentar»: lleva el id del cliente (ADR 0007).
  - `createManualEntry` sigue sin él (TT-109) mientras no entre el slice de
    «Reintentar» del alta manual (§0). **Si entra antes que el 11a**, el 11a
    conserva el `id` del alta y la consulta del permiso antes de `createOnce`
    (ADR 0007), y suma `billable` sin cambiar ese orden.
- **Auditoría**:

  | Acción                                                        | Suma                                                                                                      |
  | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
  | `timeEntry.start`, `.continue`, `.duplicate`, `.createManual` | `billable` (11a) y `tagIds` (11b) al `nextValue`                                                          |
  | `timeEntry.updateProject`                                     | `billable` a los dos lados, cuando cambió (11a)                                                           |
  | `timeEntry.update`                                            | `billable` y `tagIds`, cuando se escribieron                                                              |
  | `timeEntry.delete`, `.discard`, `.bulkDelete`                 | `tagIds` al `previousValue` (11b): la unión se borra en cascada y la constancia es la única copia (TT-61) |
  | `project.create`                                              | nada: el `nextValue` ya es la fila, que trae `billableByDefault`                                          |
  | `tag.create` (nueva)                                          | la fila creada                                                                                            |

  `tagIds` va en el orden de la vista (§5.1).

## 5. Contrato de lectura y pantalla

### 5.1 La entrada con su facturable y sus etiquetas

- **`billable`** (11a) sale de la columna, en toda vista.
- **`tags`** (11b): **la regla de §5.2 del 10 se extiende**: toda lectura que
  termine en una `TimeEntryView` trae las etiquetas de la entrada, sin filtro
  —archivadas incluidas (PR-47, PR-68)— y con su nombre de ahora.
  - **`EntryRefs` suma `tags: readonly { id; name }[]`**, así una lectura sin
    las etiquetas no compila, como sin el proyecto.
  - **Cómo**: una subconsulta correlacionada en `withRefs`, que agrega las filas
    de `time_entry_tag` con `tag` en un arreglo JSON (`coalesce(json_agg(…),
'[]')`), filtrando por el `workspace_id` y el `id` de la entrada. Es una
    sola sentencia por lectura, como el `left join` del proyecto, y no
    multiplica filas. El repository estrecha el JSON con un esquema Zod antes
    de devolverlo.
  - **Las lecturas con bloqueo son dos sentencias.** `findByIdForUpdate` y
    `findManyByIdsForUpdate` bloquean con una sentencia que lee solo
    `time_entry` (`for update`, con el `order by time_entry.id` de la masiva) y
    leen las referencias —etiquetas, proyecto y tarea— con una segunda, por
    los ids bloqueados, **en la misma transacción**. En `read committed`, una
    subconsulta o un `join` dentro de la sentencia que bloquea usa la foto
    tomada antes de esperar el bloqueo: con dos pestañas, la segunda vería las
    etiquetas de antes, reasignaría una archivada (PR-45) o respondería «sin
    cambios» con una vista vieja, y ese dato viejo terminaría en el
    `previousValue` del borrado. La segunda sentencia toma su foto con el
    bloqueo ya tomado. **El proyecto y la tarea salen del `left join` de la
    sentencia que bloquea** por la misma razón. **El primer commit de
    `backend-dev` del 11b lo prueba con dos conexiones** (§6, handshake).
  - **El orden** lo pone `toView`, con `compareNames` (§5.2), y no el SQL: es la
    misma regla que el catálogo.
- **`bulkEditEntries`** arma la vista con las referencias leídas bajo bloqueo
  (`service.ts:1380-1381`): suma `tags: row.tags`, porque la masiva del 6 no
  cambia las etiquetas.

### 5.2 Los catálogos

- **`TrackingProjectView.billableByDefault`** (11a) sale de la fila que
  `listActiveProjects` ya lee.
- **Las etiquetas activas** (11b) suman una cuarta consulta,
  `listActiveTags(tx, workspaceId)`, a la transacción `repeatable read` de
  `readCatalog`, **solo si `can(actor, "tag.view", …)`**; si no, `tags` es
  vacío. Las dos funciones de catálogo devuelven `tags` y `canCreateTag`
  (`can(actor, "tag.create", …)`).
- **El orden**: `byName` y el desempate de `alphabetical`
  (`project/service.ts:328-337`) salen a `src/lib/text.ts`, al lado de
  `normalizeSearch`, como `compareNames(a, b)`. **Recibe `{ id, name }`**,
  compara los nombres con el mismo `Intl.Collator` y **desempata por id**: el
  collator iguala nombres que `lower()` distingue («ß» y «ss»), así que dos
  etiquetas distintas para el índice pueden empatar en el orden. Lo usan
  `alphabetical` del catálogo, `toView` de `time-entry` y
  `tag-picker-model.ts`: **una sola regla de orden** para la lista del selector
  y la de la entrada.
- **Un solo catálogo por pantalla** (ADR 0016): `TrackerScreen` y
  `CalendarScreen` no cambian; las etiquetas llegan dentro de `TrackingCatalog`
  y `useTrackingCatalog()` las da.
- **Trae el catálogo entero**, como el de proyectos (PR-110), con el mismo
  umbral (§8).

### 5.3 El borrador de los campos de una entrada (11a, el 11b lo extiende)

El par de la barra deja de ser un estado suelto. **`entry-fields.ts`** (nuevo,
puro, en `time-entry/components/`) agrupa lo que la barra y el diálogo eligen
además de la descripción y las horas. El tipo del mismo nombre que hoy tiene
`service.ts` pasa a `CopiedFields` (§4.3).

```ts
export type EntryFields = {
  readonly selection: ProjectSelection;
  readonly billable: boolean;
  /** 11b. */
  readonly tags: readonly TagRef[];
};

export const NO_FIELDS: EntryFields;
export function fieldsOf(entry: TimeEntryView): EntryFields;

/**
 * Elegir proyecto aplica `billableFor` con el `billableByDefault` del catálogo:
 * la misma regla que el servidor (§4.1), con el mismo resultado mientras el
 * catálogo esté al día.
 */
export function withSelection<Fields extends EntryFields>(
  fields: Fields,
  selection: ProjectSelection,
  catalog: TrackingCatalog,
): Fields;

/** Lo que viaja en un alta: `{ projectId, taskId, billable, tagIds }`. */
export function fieldsInput(fields: EntryFields): …;

/** TT-25: después de «Agregar», limpia cada campo que sigue igual a lo que se mandó. */
export function afterAdd(current: EntryFields, sent: EntryFields): EntryFields;
```

- **`withSelection` busca el proyecto elegido en el catálogo** por id. **Una
  selección fuera del catálogo** —el proyecto archivado de una entrada—
  **conserva `fields.billable`**, sin llamar a `billableFor`. No se puede
  elegir como nueva, pero el borrador del diálogo no siempre coincide con la
  fila, así que la regla no supone que esa selección sea la de la fila. Lo
  prueba el criterio 9 del 11a.
- **`afterAdd` campo por campo**, como hoy la descripción y el par: lo que se
  cambió mientras el alta viajaba se queda.
- **Es genérico en `Fields`** para que el borrador del diálogo, que tiene
  además descripción y horas, use la misma transición.

### 5.4 La barra

`tracker-bar.tsx` cambia `pairDraft`, `heldPair` y `runningPairEdit` por sus
equivalentes sobre `EntryFields`, **sin cambiar ninguna conducta del 10**:

- **Sin timer**, `fieldsDraft` viaja con «Iniciar» y con «Agregar»
  (`fieldsInput`). Elegir proyecto pasa por `withSelection`; el control de
  facturable y el selector de etiquetas cambian el borrador.
- **Con timer**, los campos son los de la entrada abierta:
  - elegir proyecto sigue siendo `updateEntryProject`, con la vista optimista
    del par **y del facturable** que daría `withSelection`;
  - el facturable es `updateEntry` con `{ billable }` (11a);
  - las etiquetas son `updateEntry` con `{ tags }` al cerrar el selector (11b,
    D-5);
  - cada una con su vista optimista y su aviso: «No se pudo cambiar el
    facturable.», «No se pudieron cambiar las etiquetas.», con «Reintentar» por
    red y `clearNotices` que los baja.
- **Lo que la barra hace con el par cuando cambia el timer** lo hace con los
  campos enteros: retenerlos en modo manual si llega un timer de otra pestaña,
  devolverlos al detenerse, descartarlos con el timer descartado. **Al
  detener, la barra queda sin proyecto, no facturable y sin etiquetas**
  (`NO_FIELDS`).
- **Un borrador con una etiqueta que dejó de estar disponible se conserva**,
  como el del proyecto: «Iniciar» responde TT-78.
- **Con la membresía no activa** (`canTrack` falso), el control y el selector
  van con `readOnly`.
- **Los dos controles son del contenedor**, como el selector de proyecto, y se
  pasan a `TimerBar` y `ManualBar` como nodos (`billableToggle`, `tagPicker`),
  que los dibujan después del selector de proyecto (§2 de `time-tracker.md`).
- **El foco al cambiar de modo**: `pickerOpen` pasa a recordar cuál de los dos
  selectores estaba abierto (`"project" | "tags" | null`), y el foco vuelve al
  disparador de ese en la barra nueva, con el mismo efecto de hoy
  (`tracker-bar.tsx:328-337`).

### 5.5 La fila

- **`entry-row.tsx`** dibuja, en el orden de TT-49, el selector de etiquetas y
  el control de facturable después del selector de proyecto, con
  `label={entryTagsLabel(nombre)}` y `label={entryBillableLabel(nombre)}`.
  Recibe `billable` y `tags` mostrados (los optimistas) como hoy recibe
  `project`, y `onChangeBillable`, `onChangeTags`. **No avisa si el valor
  elegido es el que ya tiene.** Con `!canTrack`, los dos en `readOnly`.
- **`day-group.tsx`** suma dos `useAction(updateEntry)` —facturable y
  etiquetas— con vista optimista por fila (`replaceById`), la fila atenuada
  mientras viajan (TT-55) y sus avisos en el grupo, que sobreviven a la fila.
  Una operación nueva baja el aviso de duplicar, como hoy (`run`).
- **La vista optimista de un cambio de proyecto en la fila aplica
  `withSelection`** (11a), igual que la barra (§5.4): la fila muestra el
  facturable que va a escribir el servidor antes de la respuesta, y la barra y
  la fila muestran lo mismo.

### 5.6 El calendario

- **`entry-dialog-draft.ts`**: `EntryDialogDraft` suma `billable` (11a) y `tags`
  (11b). `draftOfEntry` los toma de la vista; `draftOfNew`, de `NO_FIELDS`.
  - **`sharedChanges` manda `billable` siempre que manda `project`**, y además
    cuando difiere de la vista. Así el servidor no aplica el por defecto encima
    de lo que la persona dejó a la vista (§4.1: lo que el pedido fija, gana).
  - Manda `tags` si `!sameTagIds` con la vista.
  - `createInputOf` manda `billable` y `tagIds` explícitos.
- **`entry-dialog.tsx`**: los dos campos después de «Proyecto», en los tres
  modos de edición. Elegir proyecto pasa por `withSelection` sobre
  `draftRef.current`. **Los dos actualizan la `ref` del borrador** como los
  demás campos. El selector de etiquetas es un popup dentro del `Dialog`: el
  handshake del 11b lo prueba primero, como el 8c con `ProjectPicker`.
- **`entry-dialog-body.tsx`** (solo lectura, TT-92): «Facturable» con «Sí» o
  «No», y «Etiquetas» con los nombres o «Sin etiquetas», como texto.
- **`calendar-block.tsx`**:
  - El ícono de facturable (`aria-hidden`) al final de la línea del horario,
    solo en el segmento de inicio y solo si es facturable (CAL-21, H-10).
  - `blockLabel` suma `billable` y termina en «, facturable» cuando lo es
    (CAL-75, H-10).
  - El detalle suma «Facturable» (11a) y «Etiquetas: a, b» (11b) como líneas
    propias, solo si corresponde (CAL-23).
  - **La geometría no cambia** (§18 de `calendario.md`).

### 5.7 `/proyectos` (11a y 11b)

- **11a**: `NewProjectDialog` suma la casilla «Facturable por defecto», sin
  marcar, con la ayuda «Las entradas nuevas con este proyecto arrancan
  facturables.» asociada por `aria-describedby` (PR-21, H-8). `ProjectDraft`
  suma `billableByDefault`.
- **11b** (PR-112):
  - `page.tsx` pasa `createTag` en `actions`.
  - La cabecera suma «Nueva etiqueta» con `canCreateTag`, después de «Nuevo
    proyecto».
  - **`NewTagDialog`** (nuevo) es `NewClientDialog` con un solo campo:
    `CreateDialog`, `useProjectNotices` con la clave `"tag"`, `useNewId`, y el
    anuncio «Etiqueta «{nombre}» creada» en su región `status`.
  - **La sección «Etiquetas»**, después de los grupos de proyectos: un `h2`, la
    lista de las activas en orden alfabético, y «Todavía no hay etiquetas» sin
    ninguna (H-13, PR-88). No hay acciones por etiqueta: son de la fase 2.

### 5.8 Los controles

**`billable-toggle.tsx`** (nuevo, 11a, en `time-entry/components/`):

- `Toggle` de `src/components/ui/toggle.tsx`, con el ícono de moneda
  (`aria-hidden`) y `aria-pressed`. Nombre accesible: «Facturable» en la barra y
  en el diálogo; `entryBillableLabel(nombre)`, «Entrada «…» facturable», en la
  fila.
- `pending`: `aria-disabled` y no cambia, **sin `disabled`**: el foco se queda.
- `readOnly`: facturable, el ícono con `role="img"` y nombre «Facturable»; no
  facturable, nada (H-6).

**`tag-picker.tsx`** (nuevo, 11b, en `project/components/`):

- `Combobox` de Base UI con `multiple`, el buscador dentro del popup y
  `filter={null}`, como `ProjectPicker`. Recibe `value: readonly TagRef[]`,
  `onChange`, `variant: "bar" | "row"`, `label`, `pending`, `readOnly`,
  `triggerRef` y `onOpenChange`.
- **El disparador** tiene rol `combobox`. Sin etiquetas: el ícono de etiqueta y,
  en la barra, «Etiquetas»; en la fila, solo el ícono en gris. Con etiquetas: el
  ícono marcado y los nombres separados por coma, recortados (H-1, TT-12
  `adaptar`). Su nombre accesible es `label`, más «: » y los nombres si hay
  (WCAG 2.5.3).
- **El borrador del selector**: al abrir copia `value`; cada opción alterna su
  marca sin cerrar; **al cerrar** —por `Escape`, clic afuera o `Tab`—, si el
  conjunto difiere de `value` (`sameTagIds`), avisa `onChange(conjunto)` (D-5).
  Con un cambio en vuelo, `aria-disabled` y no abre.
- **Las opciones** salen de **`tag-picker-model.ts`** (nuevo, puro): las del
  catálogo más las de `value` que no están en él, en orden alfabético
  (`compareNames`), filtradas por la búsqueda (`normalizeSearch`). Una de
  `value` fuera del catálogo se rotula «{nombre} (archivada)» (H-5) y, una vez
  desmarcada y cerrado el selector, deja de ofrecerse.
- **Los vacíos**, en una región `status` como la de `ProjectPicker`: catálogo
  sin etiquetas, «No hay etiquetas todavía» y, con `canCreateTag`, el enlace
  «Ir a Proyectos» (TT-88, H-4); búsqueda sin coincidencias, «Ninguna etiqueta
  coincide con la búsqueda.».
- **`readOnly`**: los nombres como texto, sin rol `combobox`; sin etiquetas,
  nada (H-6).
- **Al abrir, el foco va al buscador**, «Buscar etiqueta». Al cerrar vuelve al
  disparador. Los atajos de una tecla no se disparan dentro: el popup es un
  `dialog`, el buscador un `input` y la lista un `listbox`, los tres en
  `IGNORED_SCOPES`, que no cambia.

## 6. Reparto de archivos

Rutas absolutas. **(nuevo)** marca lo que crea la parte.

### 11a

#### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/                                              (time_entry_billable, nueva, §2.1; el número sale del diario)
/home/maxi/program/clock/src/lib/billable.ts                                   (nuevo)
/home/maxi/program/clock/src/lib/billable.test.ts                              (nuevo)
/home/maxi/program/clock/src/modules/project/schema.ts
/home/maxi/program/clock/src/modules/project/schema.test.ts
/home/maxi/program/clock/src/modules/project/service.ts
/home/maxi/program/clock/src/modules/project/service.integration.test.ts
/home/maxi/program/clock/src/modules/project/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/schema.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/test/factories.ts
```

`project/repository.ts` no cambia: `insertProject` ya recibe
`billableByDefault` (`repository.ts:101-117`).

#### frontend-dev

```
/home/maxi/program/clock/src/modules/time-entry/components/entry-fields.ts            (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/entry-fields.test.ts       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/billable-toggle.tsx        (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/billable-toggle.test.tsx   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/manual-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-body.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/labels.ts
/home/maxi/program/clock/src/modules/project/components/new-project-dialog.tsx
/home/maxi/program/clock/src/modules/project/components/labels.ts
```

#### tests-slice11

```
/home/maxi/program/clock/e2e/billable.spec.ts            (nuevo)
/home/maxi/program/clock/e2e/database.ts
/home/maxi/program/clock/e2e/tracker-page.ts
/home/maxi/program/clock/e2e/calendar-page.ts
```

`database.ts`: `SeedProject` suma `billableByDefault` y `seedProject` lo
escribe. `tracker-page.ts` suma `billableToggle(scope)`; `calendar-page.ts`, el
campo del diálogo. Si el 7b entró antes, `tracker-page.ts` ya trae
`markDocument` y `documentIsMarked` (§0): el 11 suma, no mueve.

#### parity-analyst

```
/home/maxi/program/clock/docs/parity/time-tracker.md
/home/maxi/program/clock/docs/parity/proyectos.md
/home/maxi/program/clock/docs/parity/calendario.md
```

Los huecos ya están relevados (`939e5bc`). Antes del merge, lo que §1 deja para
el 11a.

### 11b

#### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/                                              (time_entry_workspace_id_unq, tags y tags_set_null, nuevas, §2.2)
/home/maxi/program/clock/src/server/permissions/index.ts
/home/maxi/program/clock/src/server/permissions/permissions.test.ts
/home/maxi/program/clock/src/lib/text.ts
/home/maxi/program/clock/src/lib/text.test.ts
/home/maxi/program/clock/src/lib/tag-ids.ts                                    (nuevo)
/home/maxi/program/clock/src/lib/tag-ids.test.ts                               (nuevo)
/home/maxi/program/clock/src/modules/project/schema.ts
/home/maxi/program/clock/src/modules/project/schema.test.ts
/home/maxi/program/clock/src/modules/project/schema.integration.test.ts
/home/maxi/program/clock/src/modules/project/repository.ts
/home/maxi/program/clock/src/modules/project/service.ts
/home/maxi/program/clock/src/modules/project/service.integration.test.ts
/home/maxi/program/clock/src/modules/project/actions.ts
/home/maxi/program/clock/src/modules/project/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/assignment.ts
/home/maxi/program/clock/src/modules/time-entry/assignment.test.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/schema.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/test/factories.ts
```

- **`project/schema.integration.test.ts`** suma la tabla `tag` contra la base:
  `checks`, el índice de unicidad con mayúsculas y con una archivada, y el
  `set null (created_by)` al borrar la membresía.
- **`time-entry/schema.integration.test.ts`** suma la unión: las dos claves, la
  cascada desde la etiqueta y desde la entrada, y `isMissingTag` contra un
  `23503` real.
- **`time-entry/service.integration.test.ts`** suma el test de dos conexiones
  de §5.1, junto a los de `findByIdForUpdate` y `findManyByIdsForUpdate` que ya
  tiene.
- `src/server/db/constraint-error.ts` no cambia: `FOREIGN_KEY_VIOLATION` y
  `UNIQUE_VIOLATION` ya están.

#### frontend-dev

```
/home/maxi/program/clock/src/modules/project/components/tag-picker.tsx            (nuevo)
/home/maxi/program/clock/src/modules/project/components/tag-picker.test.tsx       (nuevo)
/home/maxi/program/clock/src/modules/project/components/tag-picker-model.ts       (nuevo)
/home/maxi/program/clock/src/modules/project/components/tag-picker-model.test.ts  (nuevo)
/home/maxi/program/clock/src/modules/project/components/new-tag-dialog.tsx        (nuevo)
/home/maxi/program/clock/src/modules/project/components/projects-screen.tsx
/home/maxi/program/clock/src/modules/project/components/projects-screen.test.tsx
/home/maxi/program/clock/src/modules/project/components/labels.ts
/home/maxi/program/clock/src/app/(app)/proyectos/page.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-fields.ts
/home/maxi/program/clock/src/modules/time-entry/components/entry-fields.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/manual-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-body.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/labels.ts
```

#### tests-slice11

```
/home/maxi/program/clock/e2e/tags.spec.ts                (nuevo)
/home/maxi/program/clock/e2e/database.ts
/home/maxi/program/clock/e2e/tracker-page.ts
/home/maxi/program/clock/e2e/calendar-page.ts
```

`database.ts` suma `archiveTag(name)`, con la comprobación de una fila de
`archiveProject`. `tracker-page.ts` suma `tagPicker(scope)` y
`pickTags(page, scope, nombres)`.

#### parity-analyst

Los mismos tres documentos. Los huecos ya están relevados y las dos
correcciones de paso, hechas (`939e5bc`). Antes del merge, lo que §1 deja para
el 11b.

### Lo que no toca nadie

- `src/server/action.ts`, `src/server/create-once.ts`, `src/server/session.ts`,
  `src/server/audit.ts`, `src/server/time/`, `src/hooks/`.
- `src/modules/profile/`, `src/modules/workspace/`.
- **La edición masiva**: `bulkEditChanges`, `bulk-edit-dialog.tsx`,
  `bulk-changes.ts`, `bulk-actions.tsx`. Es del 12. De `bulkEditEntries` y
  `bulkDeleteEntries` cambian solo la línea que arma la vista (§5.1) y la
  constancia del borrado (§4.10).
- `project-picker.tsx`, `picker-model.ts` y `tracking-catalog.tsx`: el selector
  de proyecto no cambia; `withSelection` busca en el catálogo desde
  `entry-fields.ts`.
- `tracker-screen.tsx`, `calendar-screen.tsx`, `calendar-view.tsx`,
  `calendar-grid.tsx` y los gestos del 8b: el catálogo llega por el mismo
  proveedor y `updateEntry` ya está cableado.
- `tracker-shortcuts.ts`.
- `copyEntry` de `e2e/database.ts`, en ninguna de las dos partes.
- `src/modules/time-entry/actions.ts`: ninguna action nueva ni cambio de firma.
- `CLAUDE.md`: el ADR 0016 no cambia el recorrido de una mutación.
- Los documentos de slices anteriores y de correcciones, que son históricos.
  El mapa y el estado de la fase los actualiza team-lead.

### Handshake de orden

**11a:**

0. **Cumplido el 2026-10-05**: D-2 y D-6 tomadas, y H-6 … H-10 relevados
   (`939e5bc`). Si el 7b ya está en `main`, la ronda corta de §0 antes de
   arrancar.
1. **Primer commit de `backend-dev`**: la columna y su migración, generada
   sobre lo que haya en `main` (§2), los tipos de §4.2 (`createProjectInput`,
   `TrackingProjectView`, los inputs y la vista), `billableFor` con su test,
   `TrackableProject` y la firma nueva de `assertTrackable`. Los fixtures que
   arman vistas a mano suman `billable`. La suite existente sigue verde. Avisa
   a `frontend-dev`.
2. **`frontend-dev` arranca en paralelo** con `entry-fields.ts` y su test
   —**primero el refactor del par de la barra a `EntryFields`, sin cambio de
   conducta, en un commit propio con `project-picker.spec.ts` en verde**—, y
   después `billable-toggle.tsx` y los textos.
3. **`tests-slice11`** escribe `e2e/billable.spec.ts` y confirma que falla por
   la funcionalidad.
4. Con el commit 1 en la rama, el resto de los dos lados.
5. `parity-analyst`, antes del merge.

**11b**, con el 11a en `main`:

0. **Cumplido el 2026-10-05**: D-1, D-3, D-4 y D-5 tomadas, H-1 … H-5 y
   H-11 … H-13 relevados (`939e5bc`), y el ADR 0016 aceptado.
1. **Primer commit de `backend-dev`**: las tablas; **las tres migraciones en el
   orden de §2.2**, con `npm run db:migrate` en verde sobre una base que ya
   tiene las del 11a; las dos acciones de permiso con su test; los tipos de
   §4.4; `EntryRefs.tags` con la subconsulta; **las lecturas con bloqueo en dos
   sentencias (§5.1), con un test de integración de dos conexiones**: la 1
   bloquea una entrada con `findByIdForUpdate`, le cambia las etiquetas y
   confirma mientras la 2 espera en el mismo `findByIdForUpdate`; la 2 ve el
   conjunto nuevo. El test mata la variante con la subconsulta en la sentencia
   que bloquea. Y las firmas de `createTag` y `assertTaggable`. Avisa a
   `frontend-dev`.
2. **`frontend-dev`, primero de todo**: una prueba de que el `Combobox` de Base
   UI con `multiple` y el buscador en el popup abre, marca sin cerrar, avisa al
   cerrar con `Escape` y devuelve el foco al disparador, **en la barra y dentro
   del `Dialog` del calendario**. Si no, se avisa antes de seguir, porque cambia
   §5.8. Después `tag-picker-model.ts` y su test, y los textos.
3. **`tests-slice11`** escribe `e2e/tags.spec.ts` y confirma que falla por la
   funcionalidad.
4. Con el commit 1 en la rama, el resto.
5. `parity-analyst`, antes del merge.

### Responsabilidades que no se leen en el nombre del archivo

- **`entry-fields.ts`** es la única transición de los campos elegidos de una
  entrada en el navegador: la barra, la fila (su vista optimista del proyecto)
  y el diálogo la usan, y es la única que llama a `billableFor` del lado del
  cliente.
- **`tag-picker-model.ts`** es el único que filtra y ordena las opciones del
  selector de etiquetas, y el que marca las de `value` fuera del catálogo.
- **`tag-picker.tsx`** guarda el borrador del selector mientras está abierto y
  avisa una sola vez, al cerrar. No sabe qué es una entrada: el nombre accesible
  lo arma quien lo usa.
- **`labels.ts` de `time-entry`** suma `billable` («Facturable»),
  `billableNotSaved` («No se pudo cambiar el facturable.»), `tagsNotSaved` («No
  se pudieron cambiar las etiquetas.»), `entryBillableLabel(nombre)` y
  `entryTagsLabel(nombre)` («Etiquetas de la entrada «…»»).
- **`labels.ts` de `project`** suma `billableByDefault` («Facturable por
  defecto»), `billableByDefaultHint`, y en el 11b `tags` («Etiquetas»),
  `newTag` («Nueva etiqueta»), `tagNotCreated` («No se pudo crear la
  etiqueta.»), `tagsEmpty` («Todavía no hay etiquetas»), `tagPickerSearch`
  («Buscar etiqueta»), `tagPickerNoTags` («No hay etiquetas todavía»),
  `tagPickerNoMatches` («Ninguna etiqueta coincide con la búsqueda.»),
  `archivedTagLabel(nombre)` y `tagCreatedLabel(nombre)`. El enlace reusa
  `pickerGoToProjects`.
- **`calendar/labels.ts`** suma `billable` («Facturable»), `billableYes`
  («Sí»), `billableNo` («No»), `tags` («Etiquetas»), `noTags` («Sin
  etiquetas») y el parámetro `billable` de `blockLabel`.

## 7. Criterios de aceptación

### 11a

1. **La base.** `time_entry.billable` existe, `not null`, y una entrada
   insertada sin él queda en `false`.
2. **PR-21, el alta de proyecto.** `createProject` guarda `billableByDefault`
   del pedido y `false` sin él; el reintento responde la fila del primer
   intento; `getTrackingCatalog` lo devuelve en cada proyecto.
3. **`billableFor`.** Los casos de la tabla de §4.1, con un id que solo cambia
   las mayúsculas como el mismo proyecto.
4. **Las altas** (TT-14). `startTimer` y `createManualEntry`: con `billable`,
   ese valor, también en contra del por defecto; sin él, el por defecto del
   proyecto, y `false` sin proyecto.
5. **Continuar y duplicar** (TT-57, TT-58) copian el facturable de la original,
   también cuando difiere del por defecto de su proyecto.
6. **`updateEntryProject`** (D-2). A otro proyecto, su por defecto; al mismo
   con otra tarea, y a «Sin proyecto», sin cambio; con el mismo par, sin
   escritura. La constancia suma `billable` cuando cambió.
7. **`updateEntry`.** `{ billable }` solo, sobre una cerrada y sobre la que
   corre; `{ project, billable }` con el valor contrario al por defecto, ese
   valor; `{ project }` solo, el por defecto; `{ billable }` igual al de la fila,
   sin escritura ni constancia; el orden de §4.3 del 8c no cambia.
8. **La vista.** Toda vista que devuelve una action o una lectura trae
   `billable`.
9. **El borrador.** `withSelection` aplica el por defecto del catálogo,
   conserva con la misma selección o «Sin proyecto», y con una selección fuera
   del catálogo conserva `fields.billable` aunque difiera del de la fila;
   `afterAdd` limpia campo por campo; `changesOf` y `runningChangesOf` mandan
   `billable` con `project`; `createInputOf` lo manda explícito.
10. **El control** (TT-92). `aria-pressed` según el valor; con `pending`,
    `aria-disabled` y el foco en él; con `readOnly`, el ícono con su nombre si
    es facturable y nada si no.
11. **La capa de action.** `updateEntry` con `billable` revalida las dos rutas y
    conserva sus traducciones; un `billable` que no es booleano responde
    `validation`; `createProject` acepta `billableByDefault`.
12. **Auditoría.** Las cuatro altas guardan `billable`; `timeEntry.update` y
    `timeEntry.updateProject` lo guardan cuando cambió.
13. **La pantalla.** Los recorridos 1 a 5 de `e2e/billable.spec.ts`.
14. **Lo existente sigue verde**, con los fixtures de vistas sumando `billable`
    y sin cambiar lo que afirman. El refactor de la barra a `EntryFields` deja
    `project-picker.spec.ts` verde sin tocarlo.

| Criterio | Tipo                 | Archivo                                                                      | Qué afirma                                                                       |
| -------- | -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1        | integración          | `time-entry/schema.integration.test.ts`                                      | el `insert` directo sin la columna                                               |
| 2        | integración          | `project/service.integration.test.ts`; `project/actions.integration.test.ts` | la fila, el reintento, el catálogo; el input en la action                        |
| 3        | unidad               | `src/lib/billable.test.ts`                                                   | la tabla de §4.1                                                                 |
| 4        | integración          | `time-entry/service.integration.test.ts`                                     | las cuatro combinaciones por alta                                                |
| 5        | integración          | `time-entry/service.integration.test.ts`                                     | la original con un facturable distinto del por defecto de su proyecto            |
| 6        | integración          | `time-entry/service.integration.test.ts`; `audit.integration.test.ts`        | cada fila de la tabla, el no-op con `updated_at`; la constancia                  |
| 7        | integración          | `time-entry/service.integration.test.ts`; `audit.integration.test.ts`        | cada pedido; el no-op sin constancia                                             |
| 8        | integración          | `time-entry/service.integration.test.ts`                                     | `billable` en `running`, `stopped`, `created`, `entry`, la lista y el calendario |
| 9        | unidad               | `entry-fields.test.ts`; `calendar/entry-dialog-draft.test.ts`                | cada transición y cada pedido                                                    |
| 10       | unidad               | `billable-toggle.test.tsx`; `entry-row.test.tsx`                             | el marcado en los tres estados y en la fila de solo lectura                      |
| 11       | integración          | `time-entry/actions.integration.test.ts`                                     | la revalidación y las traducciones con `billable`                                |
| 12       | integración          | `time-entry/audit.integration.test.ts`                                       | los valores en cada constancia                                                   |
| 13       | e2e                  | `e2e/billable.spec.ts`                                                       | los recorridos                                                                   |
| 14       | lint, tipos y suites | `npm run lint && npm run typecheck && npm run test:all`; `npm run test:e2e`  | en verde                                                                         |

**El criterio 5 se siembra con la original en contra del por defecto**: el
mutante que vuelve a calcular el facturable al continuar en lugar de copiarlo
da otro valor.

**El criterio 7 cruza `project` con el `billable` contrario al por defecto**:
el mutante que aplica el por defecto aunque venga el grupo pisa lo pedido.

**El criterio 9 elige, sobre un borrador facturable, una selección fuera del
catálogo**: el mutante que la trata como un proyecto nuevo sin facturable por
defecto lo pone en `false`.

#### Recorridos obligatorios de `e2e/billable.spec.ts`

Dueño: `tests-slice11`. Una persona por recorrido, sufijo único en todo nombre
sembrado o creado, horas «de hoy» pasadas (`00:00–00:01`), y cada mutación
esperada por la respuesta del servidor (`withServerAction`). Los recorridos 2 y
4 siembran su proyecto con `seedProject({ …, billableByDefault: true })`; el 1
lo crea por la interfaz, que es lo que prueba PR-21.

1. **PR-21 y TT-14 en la barra.** En `/proyectos`, crear «Facturable {sufijo}»
   con «Facturable por defecto» marcado. En `/`, elegirlo en la barra:
   «Facturable» con `aria-pressed="true"`. Iniciar, recargar: el timer sigue
   facturable. Detener: la fila facturable y la barra sin proyecto y con
   «Facturable» sin presionar.
2. **TT-27 y D-2 con el timer.** Iniciar sin proyecto: «Facturable» sin
   presionar. Elegir el proyecto sembrado: presionado después de la respuesta.
   Desmarcarlo, recargar: sigue sin presionar.
3. **TT-54 en la fila y TT-57.** En una entrada cerrada sin proyecto, alternar
   «Entrada «…» facturable»: el foco queda en él; recargar, sigue presionado.
   Continuarla: el timer arranca facturable.
4. **TT-25 en modo manual.** Elegir el proyecto sembrado, «Agregar»: la fila
   nueva es facturable y la barra vuelve a «Proyecto» y a no facturable.
5. **El calendario** (CAL-21, CAL-66, CAL-75). En la semana anterior, crear una
   entrada con un clic, abrirla, marcar «Facturable» y «Guardar»: el nombre
   accesible del bloque termina en «facturable» y su detalle dice «Facturable».

### 11b

1. **La base** (PR-42, PR-48, PR-52 … PR-54, PR-69, TT-105).
   - Las tres migraciones se aplican en orden con `npm run db:migrate` sobre
     una base con las del 11a.
   - `tag` rechaza un nombre vacío, uno de 101 caracteres y uno con espacios en
     los extremos; rechaza un nombre que solo cambia las mayúsculas de otro, y
     también el de una archivada.
   - `time_entry_tag` rechaza una entrada de un workspace con una etiqueta de
     otro, y la misma etiqueta dos veces en una entrada; acepta varias.
   - Borrar una etiqueta la saca de la entrada y la entrada queda con sus horas
     y sus otras etiquetas. Borrar la entrada borra sus filas de la unión.
     Borrar el workspace funciona. Borrar la membresía de quien la creó deja
     `created_by` en nulo.
   - `isMissingTag` reconoce un `23503` real de `time_entry_tag_tag_fk` y no
     el de `time_entry_project_fk`.
2. **Permisos** (PR-44, PR-57, PR-60, PR-62). `tag.create` y `tag.view` en
   verdadero para los cinco roles activos y en falso con la membresía
   `inactive` e `invited`, y con el recurso de otro workspace.
3. **`createTag`** (PR-43, PR-44, PR-52, PR-80).
   - Cualquier rol activo la crea, con el nombre recortado y `created_by`.
   - Un nombre repetido responde PR-80 con `validation`, también contra una
     archivada.
   - El reintento con el mismo id responde la misma etiqueta sin otra fila ni
     otra constancia; con la membresía desactivada responde `forbidden` también
     con el id de una propia.
4. **`assertTaggable`** (TT-78, PR-45, PR-73). Inexistente, de otro workspace o
   archivada: `not_found` con TT-78. Vacío: no consulta.
5. **Los catálogos** (PR-62, TT-88). Las activas en orden alfabético sin
   distinguir mayúsculas, sin las archivadas; vacío con la membresía no activa;
   `canCreateTag` según `can()`.
6. **Las altas con etiquetas** (TT-12, TT-78). `startTimer` y
   `createManualEntry` guardan las pedidas, sin repetir y sin importar
   mayúsculas. Con una archivada o inexistente responden TT-78, no escriben
   nada y `startTimer` no cierra el timer que corría. 51 etiquetas responden el
   texto de D-4.
7. **Continuar y duplicar** (TT-57, TT-58, D-3). Copian las etiquetas; con una
   archivada en la original responden TT-78, no escriben nada y continuar no
   cierra el timer.
8. **`updateEntry` con `tags`** (TT-27, TT-54, PR-47, PR-68).
   - Reemplaza el conjunto sobre una cerrada y sobre la que corre.
   - Conservar una archivada y agregar una activa funciona; agregar una
     archivada responde TT-78 y no cambia nada; quitar una archivada funciona.
   - El mismo conjunto en otro orden y con otras mayúsculas no escribe ni deja
     constancia.
   - Con un proyecto no disponible y una etiqueta archivada responde TT-77 (el
     orden de §4.6).
9. **La vista** (PR-47, PR-68, TT-105). Toda vista trae `tags`, en orden
   alfabético; una archivada se muestra; renombrada por SQL, con el nombre
   nuevo; borrada por SQL, ya no está. **Bajo bloqueo, las referencias salen de
   una sentencia posterior al bloqueo** (§5.1): con dos conexiones, la que
   esperaba en `findByIdForUpdate` ve las etiquetas que confirmó la otra.
10. **`tagsToCheck`, `sameTagIds` y `compareNames`.** La tabla de §4.5;
    `compareNames` desempata por id dos nombres que el collator iguala («ß» y
    «ss»).
11. **Auditoría.** Las altas y `timeEntry.update` guardan `tagIds`; el borrado,
    el descarte y el borrado masivo de una entrada con etiquetas guardan sus
    `tagIds` en `previousValue`; `tag.create` guarda la fila.
12. **El modelo del selector** (TT-12, TT-88, H-2, H-5). La búsqueda con y sin
    acentos y mayúsculas; la etiqueta de `value` fuera del catálogo, marcada y
    rotulada «(archivada)»; el catálogo vacío con y sin `canCreateTag`; la
    búsqueda sin coincidencias.
13. **El borrador** (11b, como el 9 del 11a). `fieldsOf` toma las etiquetas de
    la vista; `fieldsInput` manda `tagIds`; `afterAdd` limpia las etiquetas si
    siguen iguales a las mandadas y conserva las que se cambiaron mientras el
    alta viajaba; `sharedChanges` manda `tags` solo con `!sameTagIds` contra la
    vista; `createInputOf` manda `tagIds` explícito, también vacío.
14. **El selector y la pantalla de alta, en el componente** (D-5, PR-112).
    `readOnly` sin rol `combobox` y con los nombres; el nombre accesible con
    los nombres; un solo `onChange` al cerrar, con el conjunto entero, y
    ninguno al cerrar con el mismo conjunto; con un cambio en vuelo,
    `aria-disabled` y no abre; la sección «Etiquetas» de `/proyectos` con las
    etiquetas y con el vacío.
15. **La capa de action.** `createTag` traduce el `ZodError`, conserva el
    `ProjectError`, responde `unexpected` con un error cualquiera y revalida
    `"/proyectos"`, también con error. Las actions de `time-entry` responden
    TT-78 con `not_found`.
16. **La pantalla.** Los recorridos 1 a 6 de `e2e/tags.spec.ts`.
17. **Lo existente sigue verde**, con los fixtures de vistas sumando `tags`.

| Criterio | Tipo                 | Archivo                                                                            | Qué afirma                                                                               |
| -------- | -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1        | integración          | `project/schema.integration.test.ts`; `time-entry/schema.integration.test.ts`      | las migraciones; cada restricción con sentencias directas; los borrados; el predicado    |
| 2        | unidad               | `src/server/permissions/permissions.test.ts`                                       | las dos acciones por rol, estado y workspace                                             |
| 3        | integración          | `project/service.integration.test.ts`                                              | el alta, la colisión, el reintento, la membresía desactivada y la constancia             |
| 4        | integración          | `project/service.integration.test.ts`                                              | cada rechazo                                                                             |
| 5        | integración          | `project/service.integration.test.ts`                                              | los dos catálogos                                                                        |
| 6        | integración + unidad | `time-entry/service.integration.test.ts`; `time-entry/schema.test.ts`              | las filas de la unión; cada rechazo con la tabla sin filas nuevas; el tope               |
| 7        | integración          | `time-entry/service.integration.test.ts`                                           | la copia; el rechazo con el timer previo abierto                                         |
| 8        | integración          | `time-entry/service.integration.test.ts`                                           | cada pedido y el orden                                                                   |
| 9        | integración          | `time-entry/service.integration.test.ts`                                           | `tags` en cada vista y en `getTrackerState`, con los cambios por SQL; las dos conexiones |
| 10       | unidad               | `time-entry/assignment.test.ts`; `src/lib/tag-ids.test.ts`; `src/lib/text.test.ts` | la tabla; el desempate                                                                   |
| 11       | integración          | `time-entry/audit.integration.test.ts`; `project/service.integration.test.ts`      | los valores en cada constancia                                                           |
| 12       | unidad               | `project/components/tag-picker-model.test.ts`                                      | cada caso                                                                                |
| 13       | unidad               | `entry-fields.test.ts`; `calendar/entry-dialog-draft.test.ts`                      | cada transición y cada pedido                                                            |
| 14       | unidad               | `project/components/tag-picker.test.tsx`; `projects-screen.test.tsx`               | el marcado y los avisos de `onChange`                                                    |
| 15       | integración          | `project/actions.integration.test.ts`; `time-entry/actions.integration.test.ts`    | las traducciones y la revalidación                                                       |
| 16       | e2e                  | `e2e/tags.spec.ts`                                                                 | los recorridos                                                                           |
| 17       | lint, tipos y suites | `npm run lint && npm run typecheck && npm run test:all`; `npm run test:e2e`        | en verde                                                                                 |

**El vacío de TT-88 no se prueba en e2e**, por la razón del 9 y del 10: la base
de los e2e es una sola y ya tiene etiquetas después del primer recorrido. Lo
cubre el criterio 12.

**El criterio 8 siembra la entrada con una archivada y pide conservarla junto a
una nueva**: el mutante que valida el conjunto entero en lugar de
`tagsToCheck` responde TT-78.

**El criterio 7 cuenta las filas de `time_entry` y de `time_entry_tag`**, y
mira que el timer previo siga abierto: el mutante que valida después de cerrar
el timer lo deja cerrado.

**El criterio 9 hace esperar a la segunda conexión en el bloqueo**: el mutante
que lee las etiquetas con una subconsulta en la sentencia que bloquea devuelve
el conjunto de antes.

**El criterio 14 marca tres casillas y cierra una vez**: el mutante que avisa
con cada casilla llama tres veces a `onChange`.

#### Recorridos obligatorios de `e2e/tags.spec.ts`

Dueño: `tests-slice11`. Las mismas reglas que los del 11a. Las etiquetas no se
pueden borrar en la fase 1: todo nombre lleva el sufijo de la corrida.

1. **PR-44, PR-52, PR-80 y PR-112 en `/proyectos`.** «Nueva etiqueta»,
   «Cliente {sufijo}»: aparece en la sección «Etiquetas» y se anuncia. Otra vez
   con «cliente {sufijo}»: el aviso dice «Ya hay una etiqueta con ese nombre.».
2. **TT-12 y TT-38 en la barra.** Con «Diseño {sufijo}» y «Revisión {sufijo}»
   creadas, abrir «Etiquetas», escribir «diseno {sufijo}» y ver solo la
   primera —sin el sufijo, la búsqueda encuentra también las de corridas
   anteriores—; marcarla, borrar la búsqueda, marcar la segunda, `Escape`: el
   disparador muestra las dos y tiene el foco. Iniciar, recargar: el timer las
   tiene. Detener: la fila las muestra y la barra queda sin etiquetas.
3. **TT-54 en la fila.** En esa entrada, abrir sus etiquetas, desmarcar una,
   cerrar con un clic afuera; después de la respuesta, recargar: queda una.
4. **PR-47, PR-68 y TT-78.** Con una entrada que tiene «Vieja {sufijo}»,
   archivarla con `archiveTag`, recargar: la fila la sigue mostrando, y al abrir
   su selector aparece marcada como «Vieja {sufijo} (archivada)»; la búsqueda
   desde la barra no la ofrece. Después, en la barra sin timer, marcar «Nueva
   {sufijo}», archivarla con `archiveTag` e iniciar: «No se pudo iniciar el
   timer.» con «Esa etiqueta ya no está disponible.», sin «Reintentar» y sin
   timer.
5. **El calendario** (CAL-23, CAL-66). Abrir una entrada de la semana anterior,
   marcar una etiqueta, «Guardar»: el detalle del bloque dice «Etiquetas:
   {nombre}».
6. **Accesibilidad y atajos** (§5.8). En la barra: el disparador es un
   `combobox` llamado «Etiquetas»; al abrir, el foco está en «Buscar etiqueta»;
   escribir `n` escribe y no inicia un timer; `Espacio` sobre una opción la
   marca sin cerrar; `Escape` cierra, deja el foco en el disparador y el nombre
   accesible del disparador nombra la etiqueta elegida.

## 8. Deuda conocida del slice

- **El facturable por defecto de un proyecto no se puede editar** después del
  alta: es de la fase 2 (PR-21). Un proyecto creado sin marcar, y que debía ir
  marcado, se corrige con una sentencia sobre la base. Elegirlo en el alta y no
  en la configuración del proyecto, como Clockify, es la adaptación de PR-21.
- **El facturable y las etiquetas no se editan en bloque** hasta el 12.
- **Archivar, restaurar y borrar etiquetas** llega con la fase 2; hasta
  entonces, los efectos se prueban sembrando el estado, y la base de e2e
  acumula etiquetas, como proyectos.
- **El catálogo viaja entero**, ahora con las etiquetas, en cada dibujo y en
  cada revalidación de P-11. El umbral es el del 9 y el 10; pasado el umbral, el
  selector de etiquetas busca en el servidor como el de proyectos (PR-110).
- **La red del `23503` de la etiqueta no se alcanza por el service** en la
  fase 1: nada borra etiquetas. Se prueba el reconocimiento con un error real.
- **Una subconsulta por entrada** en cada lectura que arma una vista, para las
  etiquetas, y **una sentencia más en cada lectura con bloqueo**, para las
  referencias (§5.1). Con la ventana de la lista de hoy son decenas; si la
  ventana crece mucho, una sola consulta por lista de ids.
- **El navegador y el servidor aplican el mismo por defecto con datos de dos
  lecturas**: el catálogo puede estar hasta 60 segundos viejo (P-11). Si un
  proyecto cambia su por defecto en ese tiempo —en la fase 1, solo por SQL—, la
  vista optimista del timer o de la fila muestra uno y el servidor escribe el
  otro, y la respuesta lo corrige. En las altas y en el diálogo el navegador
  manda el valor explícito, así que gana lo que la persona vio.
- **Sin verificar en Clockify** (P-14 de `time-tracker.md`, P-33 de
  `proyectos.md`, P-07 de `calendario.md`): `parity-analyst` dejó como diseño
  propio _no verificado_ TT-12 (H-1, H-2, H-3), las etiquetas de TT-50 (H-6),
  TT-57 y TT-58 con una etiqueta archivada (D-3), PR-47 (H-5), el tope de PR-48
  (D-4) y las etiquetas de CAL-23 (H-10). Si el workspace del equipo muestra
  otra cosa, se corrige. El facturable no se puede verificar nunca en el plan
  Free (P-16).
- **El módulo `project` es el catálogo** de clientes, proyectos, tareas y
  etiquetas (ADR 0016); el nombre queda corto.
