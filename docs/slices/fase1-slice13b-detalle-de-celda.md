# Fase 1, slice 13b: el menú y el detalle de una celda

Contrato del slice que completa la planilla de horarios. Módulo `time-entry`,
pantalla `/planilla`, sin mutaciones nuevas: edita y borra con `updateEntry` y
`deleteEntry`, que ya existen.

- **Fuente de los comportamientos:** [`docs/parity/timesheet.md`](../parity/timesheet.md),
  sección 6 (TS-40 … TS-42), TS-35 («Borrar» desde el menú), TS-83, TS-99,
  TS-115, TS-79 en su texto del 13b y la entrada «Slice 13b» de la sección 21,
  con P-14 cerrado.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md); esbozo en la §9 del
  [contrato del 13](fase1-slice13-planilla.md), que pide decidir cómo es el
  detalle, cómo lista las entradas, adónde va el foco al borrar la última y
  cómo conviven los avisos.
- **Revisión del contrato:** rondas 1 y 2 de `architecture-reviewer`, aprobado
  con cambios; la decisión por hallazgo (A1 … A17) está en
  [`correcciones-fase1-slice13b-contrato.md`](correcciones-fase1-slice13b-contrato.md).
- **Contratos de los que hereda la forma:** [slice 13](fase1-slice13-planilla.md)
  (la grilla, `sendOrUnexpected`, el estado propio fuera de transiciones de
  §5.6 y A1), [slice 8](fase1-slice8-calendario.md) y
  [slice 8c](fase1-slice8c-calendario-escritura.md) (el diálogo de una entrada y
  `updateEntry`), [slice 3](fase1-slice3-horas-y-fecha.md) (el trío, TT-110).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md):
    el editor del detalle guarda con `updateEntry`, todo o nada. El ADR lo
    anticipa: «El detalle de la celda del timesheet puede usar la misma
    mutación; lo decide su contrato».
  - [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md) y
    [ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md):
    el detalle edita horas con el trío y pasa por el ADR 0006, como la fila del
    rastreador; solo el valor de la celda usa el ADR 0018. El ADR 0018 ya lo
    dice («Relación con el ADR 0006»).
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    el par y las etiquetas que cambia el editor los valida `updateEntry` con
    `assertTrackable` y `assertTaggable`, como hoy.
  - **Ningún ADR nuevo** y **ninguna decisión del usuario pendiente**: las
    decisiones de abajo las confirma el team-lead.

## Partición

**Un solo slice, desplegable solo.** Todo lo que entra comparte el mismo dueño
en la pantalla —el menú abre el detalle, el detalle abre el editor y la
confirmación, y los tres terminan en los mismos avisos y el mismo foco— y
ninguna parte sirve sin las otras: un menú sin detalle deja TS-79 apuntando a
algo que no existe, y un detalle sin menú no tiene cómo abrirse. Es más chico
que el 13: una lectura que suma campos, un texto que cambia y componentes.

## Decisiones del contrato

Tomadas por este contrato; las revisó `architecture-reviewer` (rondas 1 y 2) y
las confirma el team-lead.

**D13b-1 — Cómo guarda el detalle de una entrada** (TS-41). Opciones: (1) un
popover con las piezas de la fila del rastreador, que guarda campo por campo
con las mutaciones de un campo; (2) el diálogo de una entrada del calendario
(CAL-65 … CAL-70), que guarda todo junto con «Guardar» por `updateEntry`.
**(2).** Es la decisión del usuario sobre el diálogo de una entrada
(calendario P-04: «Guardar» aplica todo o nada, como Clockify); el ADR 0013 ya
nombra al detalle de la celda como consumidor; el componente existe, está
probado y respeta TT-110 (muestra el horario de una entrada de más de un día
como texto); y las reglas son las mismas que las de la fila, porque
`updateEntry` llama a las mismas funciones privadas (ADR 0013, test de
equivalencia por grupo). (1) sería una tercera forma de armar el editor de una
entrada, con un `useAction` por campo y sus avisos, dentro de un modal.
**Cambia la letra de TS-41**, que dice «popover» y «las mismas mutaciones que
la fila del rastreador»: lo registra `parity-analyst` (§6), que además evalúa
su categoría.

**D13b-2 — Cómo se llega a una entrada de una celda con varias** (TS-42).
Opciones: la lista con edición en línea; un editor con un selector de entrada;
la lista y, sobre ella, el editor de la entrada elegida. **Lo último**: la lista
(«Detalle de …») muestra cada entrada con su descripción, su horario y su
duración, y sus botones «Editar» y «Borrar»; «Editar» abre encima el mismo
editor de D13b-1 y «Borrar» la confirmación de TT-61. **La lista sale de la foto
del servidor y se actualiza con ella**; el editor, como en el calendario, queda
con la entrada tal como estaba al abrirlo (CAL-72).

**D13b-3 — El estado de los pedidos del detalle.** Opciones: `useAction`, como
el calendario; estado propio con la action fuera de toda transición, como las
escrituras de la grilla (§5.6 del 13). **Estado propio**, en
`entry-changes.ts`. Con `useAction`, el `onSuccess` corre en una transición:
Next despacha las actions de a una y React enreda sus transiciones, así que el
editor no se cerraría hasta que se vaciara la cola de la grilla, y la celda no
tendría cómo saber que su foto todavía no trae el cambio. Con estado propio,
el editor se cierra con su propia respuesta y la celda queda ocupada hasta que
llega la foto (F-m3 del 13).

**D13b-4 — Sin permiso de carga no hay menú** (TS-76). Opciones: el menú con el
detalle en solo lectura, como el calendario (CAL-05); sin menú. **Sin menú**:
TS-76 pide la grilla «sin ningún control de escritura», y el detalle en solo
lectura de una lista es una variante nueva que no pide ninguna regla. Las
descripciones se siguen viendo en el rastreador y el calendario.

**D13b-5 — Cuándo existe el menú y cuándo está inactivo.** Existe en una celda
con `canTrack` y con entradas **en la foto del servidor**. Está inactivo
(`aria-disabled`, y no abre) mientras la celda tenga una escritura de la grilla
o un pedido del detalle que todavía no está en la foto: así el detalle siempre
abre sobre las entradas que la celda muestra. Una celda vacía que se acaba de
escribir recibe su menú cuando llega la foto que trae su entrada. **La misma
regla vale, por entrada, para «Editar» y «Borrar» de la lista** (§5.2).

**D13b-6 — Lo que ofrece el menú.** Con una entrada, «Editar» (abre el editor) y
«Borrar» (TS-35). Con varias, «Ver detalle» (abre la lista) y nada más (P-14).
«Ver detalle» es la palabra de TS-79, que solo ocurre en celdas con varias.

**D13b-7 — El editor de la planilla no ofrece «Duplicar».** El menú del editor
del calendario tiene «Duplicar» y «Borrar» (CAL-68). En la planilla queda solo
«Borrar»: duplicar no es parte de la paridad de la planilla y traería el alta
con id del cliente (ADR 0007) a una pantalla que no la tiene. `EntryDialog`
recibe `onDuplicate` opcional (§1, consecuencias).

## 0. Precondición de arranque

- **`main` en `8181f79`**, con el 13 mergeado (`5a5e56a`). Las citas son de ese
  árbol: entre `4a97625`, sobre el que se escribió la primera versión, y
  `8181f79` solo cambian `docs/slices/estado-fase1.md` y
  `docs/slices/nucleo-reportes-mapa.md`, y la ronda 1 de
  `architecture-reviewer` volvió a verificarlas contra `main`.
- **R1** (rama `nucleo/r1-horas-sin-borrar`) no está en `main` y su diff no
  toca ningún archivo del reparto de §6. **Si entra antes del arranque**, las
  citas no cambian. Si entra cualquier otra cosa, una ronda corta de
  `architecture-reviewer` contra el árbol.
- **Los desvíos aceptados del 13** valen: `row-removals.ts`,
  `use-row-removals.ts`, `send-or-unexpected.ts`, `rowKeyOf`, `catalogEntryOf`,
  la vista sin `key`, `cellWriter` puro (A1 de
  [`correcciones-fase1-slice13-arranque.md`](correcciones-fase1-slice13-arranque.md))
  y lo de [`correcciones-fase1-slice13-revisiones.md`](correcciones-fase1-slice13-revisiones.md).

### Supuestos sobre el árbol, con archivo y línea en `8181f79`

| Supuesto                                                                                                                                                                                                                        | Dónde                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `timeEntryMessages.cellNeedsEntryEdit` dice «Editá las entradas de esta celda desde el rastreador.», con el comentario «El 13b cambia el texto»; `notFound` es «Esa entrada ya no existe.»                                      | `time-entry/schema.ts:53-54`, `:29`                                                                   |
| `updateEntryInput` con `updateEntryChanges` estricto (descripción, par, trío, facturable, etiquetas); `deleteEntryInput`                                                                                                        | `schema.ts:314-335`, `:118`                                                                           |
| `timeEntryView` trae `dayDate`, `startLabel`, `endLabel`, `startClock`, `endClock`, `extraDays`, `durationLabel`, `editableTimes`, `project`, `task`, `billable` y `tags`                                                       | `schema.ts:426-468`                                                                                   |
| `timesheetCellView` (`date`, `closedSeconds`, `entryCount`), `timesheetRowView` con `entryIds` y `timesheetState` sin entradas, sin `serverNow` y sin `minDayKey`                                                               | `schema.ts:590-634`                                                                                   |
| `toView(row: EntryWithRefs, workspace)`; `authorizeEntry` responde `not_found` con `notFound` si la fila no está                                                                                                                | `time-entry/service.ts:196-222`, `:239-262`                                                           |
| `deleteEntry` bloquea la fila, la borra, deja `timeEntry.delete` con la copia y sus etiquetas                                                                                                                                   | `service.ts:802-824`                                                                                  |
| `updateEntry` lee y bloquea con `readOwnEntry`, evalúa los grupos con las reglas de un campo, escribe una vez o no escribe; el trío igual al de la fila no se evalúa                                                            | `service.ts:1378-1414`, `:1467-1515`                                                                  |
| `entryTimesFor` rechaza el trío de una entrada de más de un día con `multiDayTimes` (TT-110)                                                                                                                                    | `service.ts:1066-1081`                                                                                |
| El rastreador y el calendario mandan `serverNow` y `minDayKey: ENTRY_FLOOR_DAY_KEY`                                                                                                                                             | `service.ts:141`, `:1938-1941`, `:2098-2100`                                                          |
| `cellNeedsEntryEdit` es el texto de `appendOtherDay` y `trimTooShort`                                                                                                                                                           | `service.ts:2146-2147`                                                                                |
| `getTimesheetState` lee una vez con `listTimesheetEntries` y arma filas y celdas por `dayKey(startedAt)`                                                                                                                        | `service.ts:2467-2509`                                                                                |
| `TimesheetEntryRow` es `EntryWithRefs` con el cliente; `listTimesheetEntries` trae las referencias y las etiquetas, por `started_at`, `created_at` e `id` ascendentes                                                           | `time-entry/repository.ts:132-134`, `:495-514`                                                        |
| Todas las actions del módulo revalidan `"/"`, `"/calendario"` y `"/planilla"`; `deleteEntry` y `updateEntry`                                                                                                                    | `time-entry/actions.ts:66-72`, `:113-119`, `:151-158`                                                 |
| `TimesheetView`: dueño de las escrituras, de «Quitar fila», de los avisos («un aviso a la vez»), de `focusCell` y de los «Reintentar» que llevan el foco antes                                                                  | `components/timesheet/timesheet-view.tsx:45-322`; `:88-97`; `:153-160`; `:171-186`                    |
| `TimesheetRow` dibuja las celdas y la X, inactiva con `row.writing`                                                                                                                                                             | `timesheet-row.tsx:63-101`                                                                            |
| `TimesheetCell`: un `ClockField` con `busy`, o texto sin foco                                                                                                                                                                   | `timesheet-cell.tsx:25-63`                                                                            |
| `GridCell` (`key`, `date`, `minutes`, `label`, `seconds`, `writable`, `name`); `gridRow` arma la celda y `writing` con `shown`; la entrada del modelo                                                                           | `timesheet-model.ts:22-38`, `:194-227`, `:73-86`                                                      |
| `rowKeyOf` y `cellKeyOf`, con los ids en minúsculas                                                                                                                                                                             | `cell-writes.ts:51-59`                                                                                |
| `cellWriter` y `cellWritesReducer`: estado propio, la action fuera de toda transición, `snapshot` saca lo asentado                                                                                                              | `cell-writes.ts:61-177`; `use-cell-writes.ts:40-69`                                                   |
| `sendOrUnexpected` convierte en `unexpected` la action que no responde                                                                                                                                                          | `send-or-unexpected.ts:9-17`                                                                          |
| `useRowRemovals`: el mismo patrón, con `onRemoved` al asentarse                                                                                                                                                                 | `use-row-removals.ts:43-100`                                                                          |
| `timesheetLabels` y `cellLabel`                                                                                                                                                                                                 | `timesheet/labels.ts:5-50`                                                                            |
| `EntryDialog`: `serverNow`, `todayKey`, `minDayKey`, `pending`, `failure`, `onSave`, `onAdd`, `onStop`, `onDuplicate` y `onDelete` obligatorios; la entrada se abre con su borrador y «Reintentar» reenvía el borrador de ahora | `components/calendar/entry-dialog.tsx:84-109`, `:124-199`, `:351-354`                                 |
| `EditorActions` y `EntryMenu`: en una entrada cerrada, «Duplicar» y «Borrar»; inactivo es `aria-disabled`                                                                                                                       | `calendar/entry-dialog-actions.tsx:38-105`, `:108-153`                                                |
| `CLOSING_CODES` (`not_found`, `already_stopped`) cierran el diálogo del calendario, y su aviso va a la región                                                                                                                   | `calendar/calendar-notices.tsx:15-16`, `:23-54`; `calendar-view.tsx:142-153`                          |
| `calendarLabels`: `close`, `editTitle`, `save`, `entryNotSaved`                                                                                                                                                                 | `calendar/labels.ts:90`, `:94`, `:96`, `:100`                                                         |
| `DeleteEntryDialog` (TT-61) con `name`, `startLabel`, `endLabel` y `finalFocus`                                                                                                                                                 | `components/delete-entry-dialog.tsx:31-66`                                                            |
| `trackerLabels.delete`, `entryNotDeleted`; `entryNameOf`, `entrySpanText`, `extraDaysText`                                                                                                                                      | `components/labels.ts:69`, `:22`, `:106`, `:133`, `:126`                                              |
| El menú de la fila del rastreador: `DropdownMenu` con el disparador `aria-disabled` que no abre mientras hay una escritura                                                                                                      | `components/entry-row.tsx:396-430`                                                                    |
| `useDialogReturnFocus` devuelve el foco al cancelar y al cerrar por otra causa                                                                                                                                                  | `components/use-dialog-return-focus.ts:27-53`                                                         |
| Base UI anida diálogos (`nested`, `nestedDialogOpen`)                                                                                                                                                                           | `node_modules/@base-ui/react/dialog/popup/DialogPopup.d.ts:46-52`                                     |
| El texto de TS-79 aparece literal en tres lugares                                                                                                                                                                               | `schema.test.ts:1400-1401`; `components/timesheet/cell-writes.test.ts:79`; `e2e/timesheet-page.ts:36` |
| Los estados de prueba de la planilla se escriben a mano                                                                                                                                                                         | `timesheet-view.test.tsx:71`; `timesheet-model.test.ts:113`                                           |
| e2e: `timesheet-page.ts` (celdas, avisos, `holdCellWrites`, el rastreador desde una semana) y el recorrido de varias entradas que afirma el texto de TS-79                                                                      | `e2e/timesheet-page.ts`; `e2e/timesheet.spec.ts:250-297`                                              |

## 1. Alcance

Entra, con los identificadores de `timesheet.md`:

- **El menú de tres puntos de una celda** (TS-40) y su lugar en el teclado
  (TS-99).
- **El detalle de una celda con una entrada** (TS-41): el editor.
- **El detalle de una celda con varias** (TS-42): la lista, con «Editar» y
  «Borrar» por entrada.
- **«Borrar» desde el menú** de una celda con una sola entrada (TS-35), con la
  confirmación de TT-61.
- **La entrada que ya no existe** (TS-83).
- **Mover una entrada desde el detalle** (TS-115): a otro día, a otra semana o a
  otro proyecto.
- **TS-79 pasa a «desde el detalle»** (§9 del 13; sección 14 de la paridad).

Entran por arrastre, verificándose por el camino nuevo: TT-12, TT-14, TT-54,
TT-56, TT-60, TT-61, TT-80, TT-89, TT-90, TT-110, CAL-65 … CAL-68 y CAL-72.

### Lo que el slice decide y que la paridad tiene que registrar

- **TS-35**: «Borrar» desde el menú de una celda con una sola entrada; si era la
  última de una fila que viene del servidor, la fila sale con la foto y el foco
  va a «Añadir nueva fila», o a la región sin él, como al quitar una fila
  (§5.6).
- **TS-40**: el menú existe con permiso de carga y entradas en la foto, y está
  inactivo mientras la celda tenga algo que la foto no trae (D13b-4, D13b-5);
  con una entrada ofrece «Editar» y «Borrar», con varias «Ver detalle»
  (D13b-6). Su nombre es «Acciones de la celda {celda}».
- **TS-41**: es el diálogo de una entrada del calendario y guarda todo junto
  con «Guardar» (`updateEntry`, ADR 0013); no ofrece «Duplicar» (D13b-1,
  D13b-7). Hoy dice «popover» y «las mismas mutaciones que la fila».
- **TS-42**: la lista se llama «Detalle de {celda}», sale de la foto y se
  actualiza con ella; «Editar» abre el editor encima (D13b-2). Mientras está
  abierta, las fallas de los pedidos de su celda se ven en ella, con
  «Reintentar» solo con `unexpected` (§5.2).
- **TS-76**: sin permiso de carga no hay menú (D13b-4).
- **TS-79**: el texto pasa a «Editá las entradas de esta celda desde el
  detalle.», y el menú de esas celdas dice «Ver detalle».
- **TS-83**: el aviso se titula «No se pudo guardar la entrada.» o «No se pudo
  borrar la entrada.», en la pantalla —o en la lista, si está abierta sobre esa
  celda— y sin «Reintentar»; el editor se cierra.
- **TS-98**: el recorrido con Tab pasa por el menú de cada celda con entradas,
  después de su campo (TS-99).
- **TS-115**: una fila agregada en esta carga queda dibujada vacía aunque su
  última entrada se vaya (es la regla de TS-15 para las filas agregadas); una
  fila que viene del servidor sale, y el foco va adonde va al borrar la última
  (TS-35).

### Queda afuera

- **Agregar una entrada desde el detalle.** Para eso está la celda (TS-29,
  TS-34) o el rastreador.
- **Duplicar desde la planilla** (D13b-7).
- **El detalle en solo lectura** sin permiso de carga (D13b-4).
- **Editar o borrar varias entradas a la vez** desde el detalle: es la masiva
  del rastreador (TT-62 … TT-64).

### Consecuencias sobre código ya entregado

| Archivo                                                         | Qué cambia                                                                                                        | Qué hay que volver a probar                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `time-entry/schema.ts`                                          | `cellNeedsEntryEdit` cambia de texto; `timesheetState` suma `serverNow`, `minDayKey` y `entries` (§4.1).          | `schema.test.ts` (la afirmación del texto cambia)                             |
| `time-entry/service.ts`                                         | `getTimesheetState` arma `entries`, `serverNow` y `minDayKey` (§4.2).                                             | `timesheet.integration.test.ts` entero                                        |
| `components/calendar/entry-dialog.tsx`                          | `onAdd`, `onStop` y `onDuplicate` pasan a opcionales.                                                             | `entry-dialog.test.tsx`; los recorridos e2e del diálogo del calendario        |
| `components/calendar/entry-dialog-actions.tsx`                  | Sin `onDuplicate`, `EntryMenu` no dibuja «Duplicar».                                                              | Los mismos                                                                    |
| `components/timesheet/timesheet-model.ts`                       | `GridCell` suma `entries` y `pending`; la entrada del modelo suma `changing`; `writing` cuenta `changing` (§5.3). | `timesheet-model.test.ts` entero (el estado de prueba suma los campos nuevos) |
| `components/timesheet/timesheet-cell.tsx`                       | Dibuja el menú después del campo; `busy` cuenta los pedidos del detalle.                                          | `timesheet-cell.test.tsx`                                                     |
| `components/timesheet/timesheet-row.tsx`, `timesheet-table.tsx` | Pasan el menú y lo que ocupa una celda.                                                                           | —                                                                             |
| `components/timesheet/timesheet-view.tsx`                       | Monta `useEntryChanges` y el detalle; «un aviso a la vez» entre tres; el foco de los cierres (§5.5, §5.6).        | `timesheet-view.test.tsx` (el estado de prueba suma los campos nuevos)        |
| `components/timesheet/labels.ts`                                | Los textos de §5.8.                                                                                               | —                                                                             |
| `e2e/timesheet-page.ts`                                         | `CELL_NEEDS_ENTRY_EDIT` pasa al texto nuevo; suma los localizadores del menú, la lista y el editor.               | `e2e/timesheet.spec.ts` entero                                                |

**Afirmaciones existentes que cambian, y solo estas:**

- **El texto de TS-79** en `schema.test.ts:1400-1401` y la constante de
  `e2e/timesheet-page.ts:36` que usa el recorrido de varias entradas.
  `cell-writes.test.ts:79` lleva ese texto como dato de una falla de prueba:
  puede quedar o cambiar, no afirma nada sobre él.
- **El Tab del proyecto archivado**, `e2e/timesheet.spec.ts:603-609`. Con una
  entrada de `1:00` en el lunes, Tab desde ese campo hoy llega a la X; con el
  menú después del campo, llega a «Acciones de la celda …» y otro Tab a la X.
  El comentario de `:603-604` pasa a decir que Tab salta de la celda con horas
  a su menú y de ahí a la X, y la afirmación suma ese paso. Dueño:
  `tests-slice13b`. El otro recorrido con Tab (`:615-636`) recorre filas sin
  entradas y no cambia.

Los estados de prueba escritos a mano suman `serverNow`, `minDayKey` y
`entries` para compilar: `timesheet-model.test.ts:113` con `entries: []`, y
`timesheet-view.test.tsx:71` con las dos entradas del 30/09 de Web: Diseño, que
son las de su `entryIds` (`:87-90`) y suman sus `5_400` segundos, para que el
caso de TS-76 tenga una celda con entradas (§7). No cambia lo que afirman. Sin
`onDuplicate`, `EntryDialog` y `EditorActions` se comportan como hoy en el
calendario, que lo sigue pasando.

## 2. Cambios de esquema

**Ninguno.**

## 3. Permisos

**Ninguna acción nueva.** La unión `Action` no cambia.

| Qué se decide                         | Acción de `can()`           | Quién la consulta                                                     |
| ------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| La celda dibuja el menú               | `timeEntry.own.create`      | `canTrack` del estado, como la X de una fila                          |
| Guardar una entrada desde el detalle  | `timeEntry.own.update`      | `updateEntry`: la action y `readOwnEntry` sobre la fila (sin cambios) |
| Borrar una entrada desde el detalle   | `timeEntry.own.delete`      | `deleteEntry`: la action y `readOwnEntry` sobre la fila (sin cambios) |
| El par y las etiquetas que se cambian | `project.track`, `tag.view` | `updateEntry`, por `assertTrackable` y `assertTaggable` (ADR 0010)    |

- **Una membresía que se desactiva con el editor abierto** recibe `forbidden`
  con «No tenés permiso para hacer esto.» (TS-84), en el editor y sin
  «Reintentar».
- **Solo entradas propias**: `entries` sale de `listTimesheetEntries`, que
  filtra por la persona de la sesión.

## 4. Contrato del servidor

**Ninguna mutación nueva.** El detalle usa `updateEntry` (ADR 0013) y
`deleteEntry`, con sus reglas, sus causas, su auditoría (`timeEntry.update`,
`timeEntry.delete`) y su revalidación, que ya incluye `"/planilla"`.

### 4.1 Los tipos (`time-entry/schema.ts`)

```ts
/** TS-79: una causa, dos casos, un remedio (TS-34, TS-119): las entradas, en el detalle (TS-42). */
cellNeedsEntryEdit: "Editá las entradas de esta celda desde el detalle.",
```

`timesheetState` suma tres campos; las vistas de fila y de celda no cambian:

```ts
export const timesheetState = z.object({
  // … los de hoy …
  /** Lo pide el tipo de `EntryDialog`: la planilla no llega a lo que lo usa. */
  serverNow: z.iso.datetime(),
  /** El piso de carga, como día: el primero que admite la fecha del editor. */
  minDayKey: z.string(),
  /**
   * Las cerradas de la persona con el inicio en la semana, en el orden de
   * `listTimesheetEntries` (`started_at`, `created_at`, `id`): las del menú,
   * la lista y el editor (TS-40 … TS-42). La celda de cada una es su
   * `dayDate` y su par, la misma regla que arma las celdas (TS-07).
   */
  entries: z.array(timeEntryView),
});
```

- **Ninguna entrada que corre**: la lectura solo trae cerradas (TS-49).
- **`serverNow` lo pide el tipo, no el comportamiento**: `EntryDialog` lo usa
  para el timer que corre y para el cuerpo de solo lectura
  (`entry-dialog.tsx:227-231`, `:630`), y la planilla no llega a ninguno de los
  dos. Agregarlo al estado es más simple que volverlo opcional en el diálogo.
- **`entries` va en el estado y no en cada celda** para no cambiar
  `timesheetCellView`, que los tests del 13 comparan entero
  (`timesheet.integration.test.ts:1097-1100`).

### 4.2 `getTimesheetState`

Suma, con la misma lectura y sin otra consulta:

- `entries: rows.map((row) => toView(row, workspace))`, en el orden en que
  llegan.
- `serverNow: now.toISOString()` y `minDayKey: ENTRY_FLOOR_DAY_KEY`, como
  `getCalendarState`.
- **La variable local `entries` de hoy** (`service.ts:2487-2490`, con
  `{ entry, date }`) cambia de nombre —por ejemplo, `dated`— para que
  `entries` sea el campo del estado.

### 4.3 Las causas que el detalle muestra

Son las de `updateEntry` y `deleteEntry`, sin textos nuevos. El editor cierra
con los mismos códigos que el del calendario, `CLOSING_CODES`
(`calendar-notices.tsx:15-16`): «no hay nada que corregir en él».

| Causa                                                                  | Código       | Texto                               | Dónde se ve                                             | Paridad      |
| ---------------------------------------------------------------------- | ------------ | ----------------------------------- | ------------------------------------------------------- | ------------ |
| La entrada ya no existe                                                | `not_found`  | «Esa entrada ya no existe.» (TT-80) | La pantalla; el editor se cierra                        | TS-83        |
| Proyecto, tarea o etiqueta que ya no se ofrecen                        | `not_found`  | TT-77, PR-74, TT-78                 | La pantalla; el editor se cierra, como en el calendario | TS-41, TS-21 |
| Membresía no activa                                                    | `forbidden`  | «No tenés permiso para hacer esto.» | El editor, o la pantalla al borrar                      | TS-84        |
| Hora que no existe, menos de un minuto, antes del piso, fecha inválida | `validation` | los de TT-112, TT-73, TS-81         | El editor                                               | TS-41        |
| Red caída o error inesperado                                           | `unexpected` | `timeEntryMessages.unexpected`      | El editor, o la pantalla al borrar; con «Reintentar»    | TT-89        |

- **«La pantalla» es la lista mientras está abierta** sobre la celda del
  pedido (§5.2): lo que está debajo del modal queda inerte y tapado.
- **Un trío sobre una entrada de más de un día no viaja**: el editor la muestra
  como texto (TT-110) y `changesOf` no manda `times`.

## 5. Contrato de pantalla

### 5.1 El menú de una celda (`cell-menu.tsx`, nuevo)

- **Dónde**: en la misma celda de la tabla, **después del campo**, siempre
  visible y en el orden de tabulación (TS-99). Un botón fantasma con el ícono
  de tres puntos, `size="icon-sm"`, con el nombre «Acciones de la celda
  {celda}» —«Acciones de la celda Rediseño: Maquetado, miércoles 01/10»—.
- **Cuándo** (D13b-4, D13b-5): con `canTrack` y con `cell.entries.length > 0`.
  Con `cell.pending`, `aria-disabled` y no abre (como el menú de la fila del
  rastreador, `entry-row.tsx:396-412`): no se deshabilita, para no perder el
  foco.
- **Qué ofrece** (D13b-6): con una entrada, «Editar» y «Borrar» (este, con
  `variant="destructive"`); con varias, «Ver detalle». Por defensa, los ítems
  llevan `disabled={cell.pending}`, como los del menú de la fila
  (`entry-row.tsx:414-427`): el menú puede quedar abierto cuando una escritura
  arranca.
- **Elegir una opción cierra el menú sin devolverle el foco al disparador**
  (el `chosen` de `EntryMenu`, `entry-dialog-actions.tsx:117-127`): el diálogo
  que se abre lo toma, y al cancelarlo vuelve al disparador.

### 5.2 Los diálogos del detalle (`cell-detail.tsx`, nuevo)

Un componente dueño de qué está abierto, montado por `TimesheetView`. Recibe la
celda abierta (su clave), la grilla y lo que devuelve `useEntryChanges`.

**El árbol.** En TS-41, el editor y la confirmación van sueltos, montados por
`cell-detail.tsx`. En TS-42 van como hijos del `Dialog` de la lista, que es lo
que necesita Base UI para anidarlos (`nested`). Los ítems de la lista llevan
`key` por el id de la entrada, así el foco en uno de sus botones sobrevive a
que su nombre cambie con la foto.

**El editor** (TS-41) es `EntryDialog` del calendario con
`subject={{ kind: "entry", entry }}`, `canTrack`, `serverNow`, `todayKey`,
`minDayKey`, `onSave` y `onDelete`; sin `onAdd`, `onStop` ni `onDuplicate`. La
entrada es la de la foto al abrirlo (CAL-72). Su `pending` es que la entrada
tenga un pedido `sending` (`sendingEntriesOf`, §5.4).

- **«Guardar»** manda `updateEntry({ id, changes })` por `useEntryChanges`. El
  editor queda abierto con «Guardar» inactivo mientras su pedido viaja, y se
  cierra cuando ese pedido se asienta **si sigue abierto sobre esa entrada**.
- **Cerrarlo con el pedido en vuelo se puede**: `EntryDialog` solo impide
  cerrarse durante un alta (`entry-dialog.tsx:154-167`). El pedido sigue; si se
  asienta, nadie mueve el foco (§5.6); si falla, la falla va a la pantalla, o a
  la lista si está abierta sobre esa celda (§5.5).
- **La falla del guardado** se ve en el editor si sigue abierto sobre esa
  entrada y su código no está en `CLOSING_CODES`; con `unexpected`,
  «Reintentar» reenvía el borrador de ahora (`entry-dialog.tsx:351-354`). Con
  un código de `CLOSING_CODES` el editor se cierra y el aviso va a la pantalla,
  o a la lista si el editor se abrió desde ella (§5.5). **Cerrar el editor con
  la falla a la vista la baja** (`dismissed`).
- **«Borrar» del menú del editor** cierra el editor y abre la confirmación,
  como el calendario (`calendar-view.tsx:376-380`).

**La lista** (TS-42, `cell-entries-dialog.tsx`, nuevo): un `Dialog` con el
título «Detalle de {celda}» y una lista con las entradas de la celda en la
foto, en el orden de `entries`. Recibe el `EntryChangesState` y calcula
`changingEntriesOf` adentro, así no hay ningún conjunto que elegir al
cablearla. Exporta también lo de adentro sin el portal, para que el test lo
dibuje, como `EntryDialogContent` (`entry-dialog.tsx:207-216`). Cada entrada:

- la descripción (`entryNameOf`, en gris si está vacía), el horario
  «{inicio} – {fin}» con su superíndice `+N` y el texto de `extraDaysText`, y
  la duración (`durationLabel`);
- **«Editar»**, con el nombre «Editar «{entrada}», {horario}», que abre el
  editor de esa entrada **anidado en la lista** (Base UI, `nested`);
- **«Borrar»**, con el nombre «Borrar «{entrada}», {horario}», que abre la
  confirmación anidada;
- **con un pedido del detalle sobre esa entrada que la foto todavía no trae**
  (`changingEntriesOf`: `sending` o `settled`), los dos botones
  `aria-disabled`. Con solo `sending`, entre un guardado asentado y su foto la
  lista habilitaría «Editar» sobre la entrada vieja: el editor arrancaría con
  ella (CAL-72), al tocar una sola hora `changesOf` mandaría el trío completo
  (`entry-dialog-draft.ts:83`) y `editedFields` escribiría el extremo viejo
  (`service.ts:1498-1515`), revirtiendo el guardado anterior sin aviso.

Abajo, «Cerrar» (`calendarLabels.close`). **La lista sigue a la foto**: una
entrada que se borró, se movió o cambió de par sale; una que llegó a la celda
desde otra pestaña aparece. **Si queda vacía y no tiene nada anidado abierto,
la lista se cierra**; con el editor o la confirmación encima, se cierra cuando
ellos se cierran, si sigue vacía. Así, una entrada que se borra desde otra
pestaña con su editor abierto —el refresco al recuperar el foco vacía la lista,
`use-tracker-refresh.ts:41-43`— llega a TS-83 al «Guardar» en lugar de
desmontar el editor con su borrador.

**Las fallas con la lista abierta.** Lo que está fuera del modal queda inerte y
tapado por el overlay (`components/ui/dialog.tsx`, `DialogOverlay`), así que
una falla que §5.5 manda a la pantalla no se vería. Mientras la lista está
abierta, **la falla del detalle cuyo `request.cell` es la celda abierta se ve
dentro de la lista**: un `ActionFeedback` arriba de los ítems, con el título,
el mensaje y el nombre del pedido de §5.5. Son la de un borrado, la de un
guardado del editor anidado con un código de `CLOSING_CODES` (TS-83) y la de un
guardado cuyo editor se cerró en vuelo; la que se ve en el editor sigue en el
editor.

- **«Reintentar»** solo con `unexpected` (TT-89). Antes de reintentar, el foco
  pasa al título de la lista, porque el aviso se va.
- **No se duplica en la pantalla**: mientras se ve en la lista, cuenta como la
  del editor para «un aviso a la vez» (§5.5).
- **Al cerrar la lista**, si esa falla sigue vigente, pasa a la región de la
  pantalla con las reglas de §5.5, como si llegara en ese momento.

**La confirmación** es `DeleteEntryDialog` (TT-61) con la entrada; confirmar
manda `deleteEntry({ id })` por `useEntryChanges`.

### 5.3 El modelo de la grilla (`timesheet-model.ts`)

- **`GridCell` suma**:
  - `entries: readonly TimeEntryView[]`: las de `state.entries` cuya clave
    `cellKeyOf({ date: entry.dayDate, projectId: entry.project?.id ?? null,
taskId: entry.task?.id ?? null })` es la de la celda, en su orden. Vacío en
    la fila nueva y en las filas sin entradas.
  - `pending: boolean`: la celda tiene una escritura de la grilla que no está
    en la foto (`shown`) o un pedido del detalle que no está en la foto
    (`changing`).
- **`TimesheetGridInput` suma `changing: ReadonlySet<string>`.**
- **`GridRow.writing`** pasa a contar también `changing`: la X queda inactiva
  mientras un pedido del detalle de la fila no está en la foto (F-m3).
- **`busy` de la celda** (la que recibe `ClockField`) es `writes.busy` o
  `changing`: el campo queda `readOnly` hasta que llega la foto con el cambio.

### 5.4 Los pedidos del detalle (`entry-changes.ts` y `use-entry-changes.ts`, nuevos)

Como `cell-writes.ts` y `row-removals.ts`: puro, con su test, y el hook que lo
conecta con React (D13b-3).

```ts
/** Lo que el detalle pide sobre una entrada de la foto, y cómo nombrarla en el aviso. */
export type EntryChangeRequest =
  | {
      readonly kind: "save";
      /** La celda de la entrada en la foto: la que queda ocupada. */
      readonly cell: string;
      readonly name: string;
      readonly input: UpdateEntryInput;
    }
  | {
      readonly kind: "delete";
      readonly cell: string;
      readonly name: string;
      readonly input: DeleteEntryInput;
    };

export type EntryChangeFailure = {
  readonly request: EntryChangeRequest;
  readonly code: TimeEntryErrorCode | "unexpected";
  readonly message: string;
};

/** Un pedido que la foto todavía no trae: `sending` en vuelo o en cola, `settled` ya aplicado. */
type PendingChange = {
  readonly id: number;
  readonly cell: string;
  readonly entryId: string;
  readonly status: "sending" | "settled";
};

export type EntryChangesState = {
  readonly pending: readonly PendingChange[];
  readonly failure: EntryChangeFailure | null;
};

export type EntryChangesEvent =
  | { readonly type: "sent"; readonly id: number; readonly request: EntryChangeRequest }
  | { readonly type: "settled"; readonly id: number }
  | { readonly type: "failed"; readonly id: number; readonly failure: EntryChangeFailure }
  /** Llegó otra foto: ya trae todo lo asentado antes de ella. */
  | { readonly type: "snapshot" }
  | { readonly type: "dismissed" };

export function entryChangesReducer(
  state: EntryChangesState,
  event: EntryChangesEvent,
): EntryChangesState;

/** Las celdas con un pedido que la foto todavía no trae, `sending` o `settled`. */
export function changingOf(state: EntryChangesState): ReadonlySet<string>;

/** Las entradas con un pedido que la foto todavía no trae: la lista lo calcula y deja inactivos «Editar» y «Borrar». */
export function changingEntriesOf(state: EntryChangesState): ReadonlySet<string>;

/** Las entradas con un pedido `sending`: el `pending` del editor. */
export function sendingEntriesOf(state: EntryChangesState): ReadonlySet<string>;
```

- **`sent`** agrega el registro; si la falla vigente es de la misma entrada, la
  baja; si es de otra, queda.
- **`failed`** saca el registro y deja la falla, que reemplaza a la vigente;
  **`settled`** pasa el registro a `settled`; **`snapshot`** saca los
  `settled`; **`dismissed`** baja la falla.
- **El hook**, `useEntryChanges(state, onSettled)`: el reducer con
  `useReducer`; el `snapshot` con el patrón de ajustar en el render cuando
  cambia la identidad de `state`, como `useCellWrites`; cada pedido con
  `sendOrUnexpected` y la action **fuera de toda transición**, despachando
  `sent`, `settled` o `failed` con actualizaciones urgentes; `onSettled`
  recibe el pedido asentado. Devuelve `state` (el `EntryChangesState`, que
  recibe la lista), `changing` (las celdas), `sending` (las entradas en
  `sending`, para el editor), `failure`, `save`, `remove`, `retry` (reenvía el
  pedido de la falla, tal cual) y `dismiss`.
- **No hay vista optimista**: el detalle no sabe qué valor va a mostrar la
  celda —una edición puede cambiar el horario, el día o el par—. La celda sigue
  mostrando la foto, ocupada, hasta que llega la nueva.

### 5.5 Avisos

La región de avisos de `TimesheetView` suma la falla de `useEntryChanges`
cuando se ve en la pantalla, **con la regla de «un aviso a la vez»** del 13
entre las tres: la más reciente, de una celda, de una fila o del detalle,
reemplaza a las otras (`timesheet-view.tsx:88-97`, extendido).

- **Se ve en la pantalla** la falla de un borrado, la de un guardado con un
  código de `CLOSING_CODES` (TS-83 entre ellas) y la de un guardado cuyo editor
  ya no está abierto sobre esa entrada (se cerró con el pedido en vuelo,
  §5.2). Las demás de un guardado se ven en el editor (§5.2). **Con la lista
  abierta sobre la celda del pedido, la que iría a la pantalla se ve en la
  lista** (§5.2), y pasa a la pantalla al cerrarla si sigue vigente.
- **La regla de «un aviso a la vez» es solo de la pantalla.** La falla del
  detalle que se ve en el editor o en la lista no baja los avisos de una celda
  o de una fila, ni ellos la bajan a ella: si con el editor abierto falla una
  escritura de otra celda, su aviso aparece en la pantalla y el error que la
  persona está leyendo en el editor sigue. Entre dos fallas del detalle gana la
  más reciente (`failed`, §5.4).
- **Título**: «No se pudo guardar la entrada.» (`calendarLabels.entryNotSaved`)
  o «No se pudo borrar la entrada.» (`trackerLabels.entryNotDeleted`), con el
  mensaje del servidor y, debajo, el nombre del pedido: «Diseño», de 09:00 a
  10:30.
- **«Reintentar»** solo con `unexpected` (TT-89). Antes de reintentar, el foco
  va al campo de la celda del pedido o, si no está, a la región (F-M1 del 13);
  desde la lista, a su título (§5.2). Reintentar un borrado cuya respuesta se
  perdió responde «Esa entrada ya no existe.»: es el desenlace real, como en
  el rastreador.
- **Una celda rechazada con TS-79** sigue mostrando su aviso con el texto
  nuevo; no abre el detalle sola.

### 5.6 El foco

| Desde                                                        | Qué pasa                                      | Adónde va el foco                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| El menú                                                      | «Editar», «Ver detalle» o «Borrar»            | Al diálogo que se abre (el editor: la descripción; la lista: su título; la confirmación: «Cancelar») |
| El editor, la lista o la confirmación abiertos desde el menú | Cancelar, Esc, «Cerrar» o un clic afuera      | Al disparador del menú                                                                               |
| El editor abierto desde el menú, si sigue abierto            | Se asienta el guardado                        | Al destino de la celda                                                                               |
| La confirmación desde el menú                                | Confirmar                                     | Al destino de la celda                                                                               |
| El editor o la confirmación abiertos desde la lista          | Cancelar                                      | Al «Editar» o «Borrar» de esa entrada en la lista; si ya salió de ella, al título de la lista        |
| La confirmación desde el menú del editor anidado             | Cancelar                                      | Al «Editar» de esa entrada en la lista, que abrió la cadena                                          |
| El editor abierto desde la lista, si sigue abierto           | Se asienta el guardado                        | Al «Editar» de esa entrada                                                                           |
| La confirmación desde la lista                               | Confirmar                                     | Al título de la lista                                                                                |
| La lista                                                     | La entrada que tenía el foco sale con la foto | Al título de la lista                                                                                |
| La lista                                                     | «Reintentar» de su aviso                      | Al título de la lista, antes de que el aviso se vaya                                                 |
| La lista, sin nada anidado abierto                           | Queda vacía y se cierra                       | Al destino de la celda                                                                               |
| El editor abierto desde el menú                              | Una falla de `CLOSING_CODES` lo cierra        | Al destino de la celda                                                                               |
| El editor abierto desde la lista                             | Una falla de `CLOSING_CODES` lo cierra        | Al título de la lista                                                                                |

- **El destino de la celda** es su campo y, si no está, el mismo de «Quitar
  fila»:
  - Al cerrarse el diálogo, el foco va al `ClockField` de la celda, que está
    con `busy` (como el «Reintentar» del 13, F-M1), o, si no se dibuja, a
    `focusOutsideRows`: «Añadir nueva fila», o la región sin él
    (`timesheet-view.tsx:163-165`).
  - Una fila que viene del servidor se va con la foto cuando se queda sin
    entradas: `rowSources` solo conserva las del servidor, las guardadas y las
    agregadas (`timesheet-model.ts:166-191`), y las guardadas se podan cuando
    ya están en el servidor (`timesheet-view.tsx:116-124`). El campo que tenía
    el foco se desmonta y el foco caería a `body`. Por eso `PendingFocus`
    (`:37-38`) suma `{ kind: "cell"; key }`, que el efecto de
    `pendingFocusRef` (`:126-151`) consume en el primer dibujo en que la celda
    ya no está `pending` (llegó la foto con el cambio, o el pedido falló) o ya
    no se dibuja: si el campo de la celda se dibuja, a él; si no —la fila
    salió, o la celda pasó a ser texto—, `focusOutsideRows`.
  - Al consumirse, solo mueve el foco si sigue en ese campo o cayó a `body`:
    si la persona lo llevó a otra parte mientras esperaba la foto, no se lo
    saca.
- **«Si sigue abierto»**: el editor que la persona cerró con el pedido en vuelo
  no mueve el foco cuando ese pedido se asienta; el foco queda donde lo dejó el
  cierre (§5.2).
- **El título de la lista** lleva `tabIndex={-1}` para recibir el foco.

### 5.7 TS-115 y las filas

- **Mover una entrada** a otro día, otra semana u otro par desde el editor la
  saca de su celda con la próxima foto; si era la última de la fila y la fila
  salía del servidor, la fila desaparece y el foco va al destino de la celda
  (§5.6), que con la fila afuera es `focusOutsideRows`. **Una fila agregada en
  esta carga** queda dibujada vacía, que es la regla de TS-15 y D13-7 para las
  agregadas.
- **Una entrada que llega a una fila que no estaba** la hace aparecer, en el
  orden del servidor (TS-15).
- **Lo que guarda el navegador no cambia**: la poda de D13-7 sigue igual.

### 5.8 Textos (`components/timesheet/labels.ts`)

Con la forma del archivo: en `timesheetLabels` quedan solo las constantes, y
los textos con argumento son funciones exportadas, como `removeRowLabel` y
`cellLabel` (`timesheet/labels.ts:30-50`) o `entryActionsLabel`
(`components/labels.ts:138`).

| Clave                                | Texto                           |
| ------------------------------------ | ------------------------------- |
| `timesheetLabels.editEntry`          | «Editar»                        |
| `timesheetLabels.showDetail`         | «Ver detalle»                   |
| `cellActionsLabel(celda)`            | «Acciones de la celda {celda}»  |
| `cellDetailTitle(celda)`             | «Detalle de {celda}»            |
| `editEntryLabel(entrada, horario)`   | «Editar «{entrada}», {horario}» |
| `deleteEntryLabel(entrada, horario)` | «Borrar «{entrada}», {horario}» |
| `entryChangeName(entrada, horario)`  | «{entrada}», {horario}          |

`{horario}` es `entrySpanText(startLabel, endLabel)`: «de 09:00 a 10:30».
«Borrar» (`trackerLabels.delete`), «Cerrar» (`calendarLabels.close`), «Editar
entrada», «Guardar», «No se pudo guardar la entrada.» (`calendarLabels`) y «No
se pudo borrar la entrada.» (`trackerLabels.entryNotDeleted`) se reusan.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/timesheet.integration.test.ts
```

### frontend-dev

```
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-actions.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timesheet/
    timesheet-view.tsx, timesheet-table.tsx, timesheet-row.tsx,
    timesheet-cell.tsx, timesheet-model.ts, labels.ts,
    timesheet-model.test.ts, timesheet-cell.test.tsx, timesheet-view.test.tsx,
    cell-writes.test.ts                                        (solo el texto, si se cambia)
    cell-menu.tsx                                              (nuevo)
    cell-detail.tsx                                            (nuevo)
    cell-detail.test.tsx                                       (nuevo)
    cell-entries-dialog.tsx                                    (nuevo)
    cell-entries-dialog.test.tsx                               (nuevo)
    entry-changes.ts, entry-changes.test.ts                    (nuevos)
    use-entry-changes.ts                                       (nuevo)
```

Los nombres de los archivos nuevos son orientativos salvo `entry-changes.ts`,
que citan los tests.

### tests-slice13b

```
/home/maxi/program/clock/e2e/timesheet-detail.spec.ts                   (nuevo)
/home/maxi/program/clock/e2e/timesheet-page.ts
/home/maxi/program/clock/e2e/timesheet.spec.ts                          (solo :603-609, §1)
/home/maxi/program/clock/e2e/database.ts                                (solo si hace falta)
```

`timesheet-page.ts`: `CELL_NEEDS_ENTRY_EDIT` con el texto nuevo, y
`cellMenuButton(page, celda)`, `cellMenuItem(page, nombre)`,
`cellDetailDialog(page, celda)`, `entryEditor(page)` y
`deleteEntryConfirm(page)`. Un archivo de spec propio para no tocar los
recorridos del 13, que solo cambian por la constante y por el Tab del proyecto
archivado (`timesheet.spec.ts:603-609`, §1).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/timesheet.md
```

Antes del merge: lo de §1, «Lo que el slice decide»; TS-79 con el texto nuevo
en la regla, en la tabla de la sección 14 y en su detalle, con la corrección
fechada; la entrada «Slice 13b» de la sección 21 con este contrato. TS-23
(«desde el slice 13b, desde el detalle») queda como está.

**Pedido explícito sobre TS-41** (ronda 1, D13b-1): hoy es `replicar`, y un
diálogo con «Guardar» es una adaptación de forma que en Clockify no se
verificó (§8). Evaluar pasarla a `adaptar`, con su justificación; si queda en
`replicar`, decir por qué.

### Lo que no toca nadie

`src/server/`, `src/modules/project/`, `drizzle/`, `src/hooks/`, `src/lib/`,
`time-entry/repository.ts`, `time-entry/actions.ts`, el rastreador, el resto
del calendario, los recorridos de `e2e/timesheet.spec.ts` salvo
`:603-609` (§1) y los ADR. Los contratos y correcciones anteriores son
históricos.

### Handshake de orden

1. **`backend-dev`**: §4 con sus tests, en un commit. **Avisa a
   `frontend-dev`**: desde acá `timesheetState` tiene su forma final.
2. **`frontend-dev` arranca en paralelo** por lo que no depende del estado:
   `onDuplicate` opcional en el calendario, `entry-changes.ts` con su test y
   los textos. Con el paso 1 en la rama, el resto.
3. **`tests-slice13b` arranca con el paso 1**: escribe el spec y confirma que
   falla por la funcionalidad y no por el arnés.
4. `parity-analyst`, antes del merge.

## 7. Criterios de aceptación

1. **El texto de TS-79** — `cellNeedsEntryEdit` es «Editá las entradas de esta
   celda desde el detalle.»; los rechazos de `appendOtherDay` y `trimTooShort`
   lo responden.
2. **La lectura** — `getTimesheetState` trae en `entries` las cerradas propias
   de la semana, con `toView`, en orden de `started_at`, `created_at` e `id`;
   no trae la que corre, las de otra persona ni las de otra semana; la `dayDate`
   y el par de cada una coinciden con la celda que la cuenta. `serverNow` es el
   `now` del pedido y `minDayKey`, `"2000-01-01"`.
3. **Las celdas del modelo** — `timesheetGrid` reparte `entries` por celda en
   su orden, también una que cruza la medianoche en su día de inicio y una de
   «Sin proyecto»; `pending` con una escritura de la grilla o un pedido del
   detalle; `writing` de la fila con un pedido del detalle; la fila nueva sin
   entradas.
4. **Los pedidos del detalle** — `entry-changes.ts`: `changingOf` y
   `changingEntriesOf` cuentan `sending` y `settled`, y `sendingEntriesOf` solo
   `sending`; una falla saca su registro sin tocar otro de la misma celda;
   `snapshot` saca los `settled` y deja los `sending`; un pedido nuevo de la
   misma entrada baja su falla y uno de otra no; `retry` reenvía el pedido de
   la falla.
5. **El menú** — En `timesheet-cell.test.tsx`, con `renderToStaticMarkup`: una
   celda con entradas y permiso dibuja el disparador después del campo, con su
   nombre; sin entradas, o sin permiso, no lo dibuja; con `pending`, lleva
   `aria-disabled`.
6. **La lista** — En `cell-entries-dialog.test.tsx`, con
   `renderToStaticMarkup` sobre lo de adentro sin el portal, dentro de su raíz
   (como `entry-dialog.test.tsx:196-214`): cada entrada con su descripción o
   «Sin descripción», su horario con `+1` y su texto para lectores, su
   duración, y «Editar» y «Borrar» con los nombres de §5.8; con un
   `EntryChangesState` que tiene un `sending` de una entrada y un `settled` de
   otra, los dos botones de las dos `aria-disabled`; con una falla de la celda,
   el aviso arriba de los ítems, con «Reintentar» solo con `unexpected`. En
   `cell-detail.test.tsx`, el mismo cableado de punta a punta: `CellDetail` con
   la lista abierta y un estado de `useEntryChanges` con un `settled` de una
   entrada —el portal no se dibuja con `renderToStaticMarkup`, así que el test
   reemplaza el `Dialog` de la lista por lo de adentro sin el portal con
   `vi.mock`—: los dos botones de esa entrada, `aria-disabled`.
7. **El calendario sigue igual** — `EntryDialog` sin `onDuplicate` no ofrece
   «Duplicar»; con él, sí. El calendario lo sigue pasando.
8. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
   `main`, sin cambiar afirmaciones salvo las de §1 (el texto de TS-79 y el Tab
   del proyecto archivado).
9. **La pantalla** — Los recorridos de abajo.

### Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo                | Archivo                                                                                                      | Mutante que tiene que caer                                                                                                                                                                     |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad; integración | `schema.test.ts`; `timesheet.integration.test.ts` (los casos de TS-79 del 13, que comparan con la constante) | el texto viejo                                                                                                                                                                                 |
| 2        | integración         | `timesheet.integration.test.ts`                                                                              | `entries` vacío; `entries` en otro orden; `serverNow` fijo; `minDayKey` de hoy                                                                                                                 |
| 3        | unidad              | `timesheet-model.test.ts`                                                                                    | agrupar por `startedAt` en UTC y no por `dayDate`; `pending` sin `changing`; `writing` sin `changing`                                                                                          |
| 4        | unidad              | `entry-changes.test.ts`                                                                                      | `changingOf` o `changingEntriesOf` solo con `sending` (la X, el menú o la lista se liberan antes de la foto); `snapshot` que saca también los `sending`; una falla que baja la de otra entrada |
| 5        | componente          | `timesheet-cell.test.tsx`                                                                                    | el menú en una celda vacía; el disparador con `disabled` en vez de `aria-disabled`                                                                                                             |
| 6        | componente          | `cell-entries-dialog.test.tsx`; `cell-detail.test.tsx`                                                       | los nombres de «Editar» sin el horario (dos entradas sin descripción quedan con el mismo nombre); los botones con solo `sending`, en la lista o en `cell-detail.tsx`                           |
| 7        | componente; e2e     | `entry-dialog.test.tsx`; `e2e/timesheet-detail.spec.ts`                                                      | «Duplicar» siempre                                                                                                                                                                             |
| 8        | todas               | las suites existentes                                                                                        | —                                                                                                                                                                                              |
| 9        | e2e                 | `e2e/timesheet-detail.spec.ts`                                                                               | los de cada recorrido                                                                                                                                                                          |

**Un mutante declarado equivalente** se prueba antes con una entrada borrada,
una de otro par y una membresía inactiva, y se compara la respuesta y la
pantalla (lección del 11b).

### Recorridos obligatorios de `e2e/timesheet-detail.spec.ts`

Dueño: `tests-slice13b`. **Cada recorrido usa una persona propia**, un sufijo
propio y la semana anterior; las entradas que el recorrido no prueba cómo se
cargan se siembran por base, como en el 13. **Una fila del servidor que se
queda sin entradas sale con la foto** (§5.6): donde un recorrido afirma el foco
en el campo de una celda, la fila lleva otra entrada sembrada en otro día.

1. **El menú de una celda con una entrada** (TS-40, TS-99, TS-41). Con una
   entrada de P el martes, de 09:00 a 10:30 y sin descripción, y otra de P el
   jueves, de 14:00 a 15:00: Tab desde el campo del martes lleva a «Acciones
   de la celda P, martes …»; Enter abre el menú con «Editar» y «Borrar»;
   «Editar» abre «Editar entrada» con el foco en la descripción, y su menú
   ofrece «Borrar» y no «Duplicar». Escribir «Diseño», cambiar el fin a 11:00
   y «Guardar»: el editor se cierra, el foco está en el campo del martes, la
   celda y el total del martes dicen `2:00` y los de la fila y la semana
   `3:00`, y en el rastreador la entrada es «Diseño», de 09:00 a 11:00. Esc en
   el editor devuelve el foco al disparador.
2. **Borrar desde el menú** (TS-35, TT-61, §5.6). Con la entrada de P del
   martes sembrada como al empezar el 1, con la del jueves: «Borrar» desde el
   menú del martes: «¿Borrar esta entrada?» con su horario; «Cancelar» devuelve
   el foco al disparador; confirmar: la celda queda vacía, sin menú, el foco en
   su campo, y el total de la fila en `1:00`, el del jueves. Después, en una
   fila de R con una sola entrada, el viernes, «Borrar» desde su menú y
   confirmar: la fila sale de la grilla y el foco está en «Añadir nueva fila».
3. **Una celda con varias** (TS-42, P-14). Con «a» de 10:00 a 11:00 y «b» de
   12:00 a 13:00 el miércoles: el menú ofrece solo «Ver detalle»; la lista
   «Detalle de P, miércoles …» muestra «a» y «b» en ese orden con sus horarios
   y `1:00`. «Editar «b», de 12:00 a 13:00»: el editor se abre encima; fin
   13:30 y «Guardar»: el foco vuelve a «Editar» de «b», la lista dice `1:30`
   para «b» y la celda `2:30`. «Borrar «a», …» y confirmar: la lista queda con
   «b» y el foco en su título. «Cerrar»: el foco vuelve al disparador, y el
   menú de la celda, ahora con una entrada, ofrece «Editar» y «Borrar».
4. **TS-79 manda al detalle.** En una celda con «a» de 10:00 a 11:00 y «b» de
   12:00 a 13:00, sembradas como al empezar el 3 (`1:00` cada una, la celda en
   `2:00`), escribir `1:00`: el aviso dice «Editá las entradas de esta celda
   desde el detalle.»; desde «Ver detalle», acortar «b» a 12:15 deja la celda
   en `1:15`.
5. **Mover una entrada a la semana siguiente** (TS-115, §5.7). En una fila de Q
   con una sola entrada, el lunes, cambiar la fecha a un día de la semana
   siguiente: la fila sale de la grilla y el foco está en «Añadir nueva fila»;
   en la semana siguiente, la entrada está en su celda.
6. **La entrada que ya no existe** (TS-83). Con otra entrada de la fila en otro
   día —volver a la primera pestaña revalida (`use-tracker-refresh.ts:41-43`),
   y sin ella la fila saldría antes de «Guardar»—, abrir el editor de una
   entrada desde su menú, borrarla desde otra pestaña (`openSecondTab`) y
   «Guardar»: el editor se cierra, el foco está en el campo de la celda y la
   pantalla dice «No se pudo guardar la entrada.» con «Esa entrada ya no
   existe.», sin «Reintentar».
7. **El menú espera la foto** (D13b-5). En una celda que ya tiene una entrada
   —una vacía no tiene disparador—, con la respuesta de una escritura de esa
   celda retenida (`holdCellWrites`), su disparador tiene `aria-disabled` y
   Enter no abre el menú; al soltarla y llegar la foto, abre.
8. **Reintentar un guardado** (TT-89). Con la respuesta del guardado perdida
   (`loseActionResponses`), el editor sigue abierto con el aviso y
   «Reintentar»; reintentar guarda y cierra el editor; en el rastreador la
   entrada tiene la descripción pedida y la celda conserva su valor.
9. **Una falla con la lista abierta** (TS-42, TT-89, §5.2). Con «a» y «b»
   sembradas como al empezar el 3 y los pedidos de las actions descartados
   (`dropActionRequests`, que da `unexpected` sin aplicar nada), «Borrar «a»,
   …» desde la lista y confirmar: la lista sigue abierta, muestra «No se pudo
   borrar la entrada.» con «Reintentar» arriba de los ítems, y «a» sigue en
   ella; la región de la pantalla no tiene ese aviso. Soltar el descarte y
   «Reintentar»: el foco está en el título de la lista, «a» sale y queda «b».
   Mutante que tiene que caer: la falla del detalle solo en la pantalla.

TS-76 sin recorrido: no hay forma de desactivar una membresía desde e2e. Lo
cubre `timesheet-view.test.tsx`, con el estado de prueba que trae en `entries`
las dos entradas del 30/09 de Web: Diseño (§1): con `canTrack` falso, esa celda
no tiene disparador; con `canTrack` verdadero, lo tiene. Mutante que tiene que
caer: el menú sin mirar `canTrack`.

## 8. Deuda conocida del slice

- **`EntryDialog` sigue en `calendar/`** aunque lo use la planilla, como
  `PeriodPicker` (deuda del 13): moverlo a `components/` entra con el
  `DayCalendar` compartido.
- **Un proyecto, una tarea o una etiqueta que ya no se ofrecen cierran el
  editor** y el borrador se pierde, porque el código es `not_found`, como el de
  la entrada (§4.3). Es lo que hace el calendario; si se corrige, se corrige en
  `CLOSING_CODES` para los dos.
- **La celda no muestra el resultado del detalle hasta la foto**: queda
  ocupada con el valor anterior (§5.4). Con la cola de Next, eso puede durar lo
  que tarden las escrituras que viajan antes.
- **Una entrada que se mueve a otra fila desde el detalle** solo ocupa la celda
  de origen (`EntryChangeRequest.cell`): `writing` marca esa fila y no la de
  destino. Hasta la foto, la X de la fila destino queda activa y su «Quitar
  fila» mandaría los `entryIds` de la foto anterior, sin la entrada movida, que
  sobrevive: es la dirección segura.
- **TS-83 desde el menú, en una fila de una sola entrada y sin refresco
  previo**: el `PendingFocus` se consume con la falla, que es inmediata, y el
  foco va al campo de la celda. Una action que falla no revalida, así que la
  foto que saca la fila llega después, con el próximo refresco, y el foco cae a
  `body` sin ningún `PendingFocus` vigente. Es raro —la entrada se borró en
  otro lado sin que esta pestaña perdiera el foco ni pasara el minuto de TS-97—
  y no se espera una foto que puede no llegar. El recorrido 6 lo evita
  sembrando otra entrada.
- **Reintentar un borrado cuya respuesta se perdió** responde «Esa entrada ya
  no existe.» (§5.5), como en el rastreador.
- **Sin verificar en Clockify**: qué muestra el detalle de una celda con varias
  (TS-42), si su pop-up guarda campo por campo o con un botón (TS-41) y las
  demás opciones de su menú (TS-40).
