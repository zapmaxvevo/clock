# Fase 1, slice 8c: calendario (escritura)

Contrato del slice que suma la escritura al calendario de la fase 1. Módulo
`time-entry`, en `src/modules/time-entry/`, sobre la pantalla `/calendario` que
deja el [slice 8](fase1-slice8-calendario.md).

El calendario se entrega en tres slices: el 8 (lectura), este 8c (escritura) y
el 8b (arrastre, esbozo en §8 de este contrato). El 8c suma crear con un clic o
con «Agregar entrada», y el diálogo que guarda, duplica, borra y detiene. Sin
el 8b, cada gesto de arrastre tiene su camino por el diálogo, que es el que
exige WCAG 2.5.7 (CAL-74).

Fuente de los comportamientos: `docs/parity/calendario.md` (CAL-01 a CAL-100).
Revisiones del contrato: [ronda 1 de
`architecture-reviewer`](correcciones-fase1-slice8.md) y [ronda 2, contra el
árbol con el 8 en `main` (`339f6c3`)](correcciones-fase1-slice8c-ronda2.md).
Decisiones de arquitectura asociadas:

- [ADR 0013, el diálogo de una entrada guarda en una sola mutación](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md),
  aceptado: `updateEntry` se construye acá.
- [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md) y
  [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md): el diálogo llega
  a sus reglas por las funciones del service de `time-entry`, sin copiarlas.
- [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
  el par del diálogo se valida con `assertTrackable` de `project`.
- [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): el cliente formatea con
  las mismas funciones y no convierte instantes.
- [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): duplicar
  desde el diálogo usa el id elegido por el cliente que ya tiene
  `duplicateEntry`. El alta del calendario es `createManualEntry`, que sigue
  sin él (TT-109).

Decisiones del usuario del 2026-10-04 que el contrato fija: calendario P-04
(«Guardar» todo o nada, con botón), P-01 (crear desde la grilla con un timer
corriendo **se permite**) y P-06 («Detener» en el diálogo del timer, con la
acción de detener existente). P-02 lo construyó el 8. P-03 y P-05 quedan fuera.

Decisiones del equipo que da por tomadas: superposición permitida (TT-82),
fechas futuras aceptadas (P-10), borrado con confirmación y sin deshacer (P-06
del rastreador, TT-61), sin canal abierto y con revalidación periódica (TT-40,
P-11).

## Decisiones del usuario sobre este contrato

Resueltas el 2026-10-04 (registro completo en el contrato del 8):

1. **ADR 0013 aceptado.** El guardado todo o nada del diálogo es `updateEntry`,
   que recibe solo los grupos de campos que la persona tocó y los evalúa con
   las mismas funciones que las mutaciones de un campo.
2. **P-01 sin excepción por origen.** `createManualEntry` deja de rechazar el
   alta con un timer abierto (`service.ts:796-804`): una entrada cerrada que se
   superpone con el timer es válida (TT-82), venga de donde venga. TT-30 sigue
   en el rastreador como regla de su interfaz (`tracker-bar.tsx:294-306`), y el
   e2e que lo fija (`manual-entry.spec.ts:82-129`) no cambia. Una pestaña del
   rastreador en modo manual que todavía no vio un timer arrancado en otro
   lado —hasta 60 s, por P-11— agrega la entrada en vez de responder «Detené
   el timer para agregar tiempo a mano.».
3. **El arrastre va en el 8b**, después de este slice.
4. **«Detener» queda inactivo con cambios sin guardar**, con el texto «Guardá
   los cambios antes de detener el timer.». Detener es `stopTimer` sin cambios
   (P-06), y guardar y detener juntos serían dos escrituras que P-04 no deja
   encadenar.
5. **Las 08:00 son una constante**, `DEFAULT_SCROLL_CLOCK` del 8
   (`calendar-layout.ts:22`): la usa también «Agregar entrada» cuando el día no
   es hoy.

## 0. Precondición de arranque

**El 8c arranca con el slice 8 en `main`.** Este contrato se escribió sobre el
árbol de `dd78cd5` y sobre el contrato del 8 antes de que se implementara. La
[ronda 2 de `architecture-reviewer`](correcciones-fase1-slice8c-ronda2.md) lo
revisó contra el árbol con el 8 adentro, `339f6c3` en la rama
`fase1/slice-8c-escritura`, y lo aprueba con sus correcciones aplicadas: las
citas de abajo y los nombres que deja el 8 son los de ese árbol.

**Lo que deja el 8**, con los nombres del árbol:

- `getCalendarState` y `calendarState` sin `minDayKey` (`schema.ts:358`);
  `CalendarMode`.
- `CalendarScreen` con `getTrackingCatalog`, `DisplayFormatsProvider`,
  `TrackingCatalogProvider` e `InactiveMembershipNotice`; le pasa el estado
  entero a `CalendarView`.
- `CalendarView` con `open` (`calendar-view.tsx:29`) y `dialogEntry`, la
  entrada como estaba al abrir, que no se limpia al cerrar (`:35`). `openerId`
  no es estado: se deriva de `dialogEntry` (`:81`). Además `openerRef`, la
  región y su `ref`, el zoom, `useTrackerRefresh`, el tic de
  `useElapsedSeconds`, que redibuja la vista cada segundo (`:43`), y
  `dialogOpen={open}`, que cierra los detalles de los bloques (`:83`).
- `CalendarGrid` con una `DayColumn` por día, y `openerId`, `openerRef`,
  `dialogOpen` y `onOpen`.
- `EntryDialog` y `EntryDialogBody` en solo lectura, con `useDialogReturnFocus`
  (su `cancelFocus` es la prop `openerRef`); `selectionOf` en
  `entry-selection.ts`.
- `calendar-layout.ts` (`entrySegments`, `runningSegments`, `nowPosition`,
  `layoutColumn`, `chronological`, `isMissing`, `initialScrollMinute` y
  `DEFAULT_SCROLL_CLOCK`, las 08:00, en `:22`), `calendar-totals.ts`
  (`dayTotalOf`, `periodTotalOf` con `removedIds`), `calendar-href.ts`,
  `calendarLabels`, y `trackerLabels.description` y `trackerLabels.date`.
- `minutesToClock`, `clockToMinutes`, `weekdayLabel`, `nonexistentMinutes`,
  `MinuteRange`, `MINUTES_PER_DAY` y `minuteOfDayIn` exportados de
  `src/server/time`.
- La definición de «fuera del período»: `entrySegments(entry, days).length ===
0` (§5.5 del 8).
- `calendario/error.tsx`, con su `Alert` y «Reintentar» escritos a mano
  (`error.tsx:17-25`), porque `ActionFeedback` exige `message`.
- `e2e/calendar.spec.ts`, que con una persona con `canTrack` afirma el diálogo
  de solo lectura (`:267-275`, `:467-479`, `:496-510` y `:615-622`, con
  `expectReadOnlyDialog` de `calendar-page.ts:369-374`); `e2e/calendar-page.ts`
  y `e2e/days.ts`.

**Del árbol anterior al 8**:

- **Del 3**: `updateEntryTimes`, `updateRunningStart`, `hasEditableTimes`
  (TT-110) y el rechazo de la entrada que corre (TT-111).
- **Del 4**: `duplicateEntry` con el id del cliente (TT-58, CAL-69) y el
  diálogo de borrado (`delete-entry-dialog.tsx`).
- **Del 6**: `entryTimesFor`, `tripleOf`, `sameTriple` y `editedFields`, que
  este slice reusa; `ActionFeedback` con `children`.
- **Del 7**: `ClockField` con `format`.
- **Del 9 y el 10**: las piezas compartidas de las actions, `assertTrackable`
  (ADR 0010) y `ProjectPicker`.

**Lo que `calendario.md` da por cierto y el árbol ya no:**

- **§19**: `createManualEntry` **cambia** (P-01, §4.1); las mutaciones de
  `time-entry` revalidan también `/calendario` (§4.7).
- **CAL-40** nombra `updateRunningStart` como la action del diálogo del timer:
  con P-04 el diálogo guarda con `updateEntry`, que usa la misma regla (§4.4).
- **CAL-47** propone rechazar con TT-30: P-01 lo invierte.

**Supuestos sobre el árbol**, con archivo y línea en `339f6c3`, confirmados por
la ronda 2:

| Supuesto                                                                                                                                 | Dónde                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `readOwnEntry` lee con `for update of time_entry` y autoriza con `authorizeEntry`: `not_found`, o `forbidden` con TT-79 sobre la ajena   | `service.ts:202-246`                                                                                                        |
| `assertAssignable(tx, actor, current, requested)` llama a `assertTrackable` solo si el par asigna algo nuevo; `pairOf`                   | `service.ts:390-409`                                                                                                        |
| `createManualEntry` rechaza con `timer_running` si `findRunning` encuentra el timer                                                      | `service.ts:796-804`                                                                                                        |
| `requireClosed`, `resolveExtreme`, `tripleOf`, `sameTriple`, `entryTimesFor`                                                             | `service.ts:871`, `:883`, `:902`, `:910`, `:970`                                                                            |
| La regla del inicio del timer vive dentro de `updateRunningStart`: `resolveExtreme`, `nonexistentClock`, `futureTime` contra `now`, piso | `service.ts:1037-1052`                                                                                                      |
| `editedFields(row, changes, workspace)` devuelve `ClosedFields`; `valuesOf` arma la constancia                                           | `service.ts:1149-1176`                                                                                                      |
| `ClosedFields` es `{ description?, startedAt?, endedAt? }`                                                                               | `repository.ts:58-63`                                                                                                       |
| `updateTimes` es `rereadIfWritten(updateClosedFields(…))`; `updateStartOfRunning` escribe solo `startedAt`                               | `repository.ts:401-425`                                                                                                     |
| `updateClosedFields` escribe un subconjunto de los tres campos en una fila cerrada, sin relectura: la usa la masiva                      | `repository.ts:454-469`                                                                                                     |
| `ProjectPair` y `samePair`                                                                                                               | `src/lib/project-pair.ts:2`, `:19`                                                                                          |
| Las actions de `time-entry` revalidan solo `"/"`                                                                                         | `actions.ts:52-58`                                                                                                          |
| `clockInput`, `description`, `hasProjectForTask`, `taskNeedsProject`                                                                     | `schema.ts:111`, `:51`, `:61`, `:65`                                                                                        |
| `revalidatePath` en una server action actualiza la pantalla solo si se está viendo la ruta revalidada                                    | `node_modules/next/dist/docs/…/revalidatePath.md:19`                                                                        |
| La barra impone TT-30 en la interfaz: con un timer, modo timer y conmutador inactivo                                                     | `tracker-bar.tsx:294-306`                                                                                                   |
| Los textos «No se pudo detener el timer.», «No sabemos si la entrada se guardó.» y «No se pudo agregar la entrada.» están escritos       | `tracker-bar.tsx:578`, `:613`, `:618`                                                                                       |
| El menú de la fila escribe su nombre, «Duplicar» y «Borrar»                                                                              | `entry-row.tsx:362`, `:369`, `:380`                                                                                         |
| Enter en `ClockField` llama a `onCommit` y a `onSubmit` en el mismo evento; `onTextChange` avisa cada cambio del texto                   | `clock-field.tsx:140-146`, `:42-46`                                                                                         |
| El guardado de la masiva lee el borrador de una `ref`, mira `pending` y cuenta la hora tecleada sin confirmar                            | `bulk-edit-dialog.tsx:131-137`, `:165-171`                                                                                  |
| El borrador del trío y sus transiciones (`fromView`, `sameDraft`, `withStart`, `withEnd`, `withDuration`, `withDate`, `draftDuration`)   | `time-draft.ts:45-133`                                                                                                      |
| «Agregar» de la barra manual es `aria-disabled` con duración cero y decide con el borrador ya actualizado                                | `manual-bar.tsx:73-94`                                                                                                      |
| `useAction`: `run` baja el aviso antes del pedido; `retry` reenvía `lastInput`; `retryHandlerOf` solo con `unexpected`; `useNewId`       | `src/hooks/use-action.ts:59-61`, `:87-93`, `:107`; `use-new-id.ts:17`                                                       |
| El foco que se va con lo que se borra se mueve a mano con un efecto                                                                      | `day-group.tsx:222-230`                                                                                                     |
| `DeleteEntryDialog` recibe `finalFocus` como `RefObject`                                                                                 | `delete-entry-dialog.tsx:26-27`, `:44`                                                                                      |
| `ActionFeedback` exige `message`                                                                                                         | `src/components/action-feedback.tsx:11`                                                                                     |
| La afirmación de TT-30 en el servicio, la auditoría y las actions                                                                        | `service.integration.test.ts:1377-1399`; `audit.integration.test.ts:505-528`, `:906`; `actions.integration.test.ts:238-252` |

## 1. Alcance

Entra, con los identificadores de `calendario.md`:

- **Pantalla y acceso**: CAL-05, los controles de escritura de los cinco roles.
- **El timer activo**: CAL-40, CAL-41 en su segunda oración. CAL-39 se cumple
  sin hacer nada: en el 8c no se arrastra ningún bloque.
- **Crear**: CAL-43, CAL-45, CAL-46, CAL-47 (invertido por P-01), CAL-48 y
  CAL-30 en el clic sin efecto, CAL-49.
- **El diálogo**: CAL-58 (su parte de diálogo), CAL-65 a CAL-70 editables,
  CAL-72.
- **Teclado**: CAL-74, el botón «Agregar entrada».
- **Estados**: CAL-86, los avisos de dos partes de las actions.
- **Casos borde**: CAL-92 por el diálogo, CAL-97 a CAL-99 sobre el diálogo y no
  sobre gestos.

Entran por arrastre, verificándose por el camino nuevo:

- **TT-66, TT-79, TT-80, TT-92**: los cinco roles editan sus entradas desde el
  diálogo; la ajena y la que ya no existe responden su texto; una membresía
  desactivada abre el diálogo en solo lectura y no tiene alta.
- **TT-28, TT-29, TT-75, TT-110, TT-111, TT-112, TT-73, TT-77 y el piso del ADR
  0005**: el diálogo pasa por las mismas reglas que la fila y el contador.
- **TT-18 a TT-21, PF-13, PF-14**: los campos de hora y duración del diálogo son
  los del modo manual, con el formato de la persona.
- **TT-58, TT-60 y TT-61**: duplicar y borrar desde el menú del diálogo. TT-65
  no entra: descartar el timer sigue en el rastreador.
- **TT-89, TT-90, TT-109**: avisos de dos partes, «Reintentar» por red salvo en
  el alta.

### Lo que el slice decide y que la paridad tiene que registrar

- **P-01 cerrado, CAL-47 invertido.** Crear desde la grilla con un timer
  corriendo se permite, sin aviso. `createManualEntry` deja de rechazar con
  `timer_running`. `adaptar`: Clockify recomienda detener el timer antes, y no
  documenta que lo impida.
- **TT-30 pierde su mitad de servidor.** Queda como regla de la interfaz del
  rastreador; la oración «Es el mismo texto con el que responde la validación
  del servidor cuando el pedido llega igual desde una pestaña desactualizada»
  sale, y se agrega que esa pestaña agrega la entrada. La nota de TS-39 en
  `timesheet.md` sobre `createManualEntry` queda vieja a favor del slice 13.
- **P-04 cerrado, CAL-67.** «Guardar» aplica juntos los grupos de campos que la
  persona tocó, con `updateEntry` (ADR 0013). Sin cambios, «Guardar» cierra sin
  pedido. Cerrar con cambios los descarta sin preguntar. Si «Guardar» falla
  porque la entrada ya no existe o el timer ya se detuvo, el diálogo se cierra y
  el aviso queda en la pantalla.
- **P-06 cerrado, CAL-40.** El diálogo del timer edita descripción, proyecto y
  tarea, e inicio, y guarda con «Guardar» (`updateEntry`, con la regla de
  `updateRunningStart`). «Detener» es `stopTimer`. Con cambios sin guardar
  —también una hora tecleada sin confirmar—, «Detener» queda inactivo con
  «Guardá los cambios antes de detener el timer.». El diálogo del timer no tiene
  menú: duplicar la entrada que corre se rechaza (TT-58) y descartarla es del
  rastreador (TT-65).
- **CAL-41, con el timer detenido en otra pestaña.** «Guardar» con solo la
  descripción o el par se aplica a la entrada, ya cerrada, como hoy
  `updateDescription` y `updateEntryProject`, que no miran el estado: el
  diálogo se cierra y el bloque se dibuja cerrado. Con el inicio entre los
  cambios responde `already_stopped`, el diálogo se cierra y el aviso queda en
  la pantalla. Decisión nuestra: la descripción y el par no dependen del estado
  de la fila en ninguna mutación.
- **P-03 y P-05**: siguen abiertos con su propuesta, fuera del 8c.
- **CAL-43 y CAL-74.** El clic en una franja propone su inicio y una franja de
  largo; si el fin cae en minutos que no existen, pasa al primer minuto que
  existe después. «Agregar entrada» propone hoy si está a la vista y si no el
  primer día del período, nunca antes del piso; la hora es la franja de ahora
  si el día es hoy, y las 08:00 (`DEFAULT_SCROLL_CLOCK`) si no.
- **CAL-46.** Una entrada está fuera del período si no tiene ningún segmento en
  él (`entrySegments(entry, days).length === 0`). El aviso nombra el día de
  inicio con el rótulo de columna («sáb, 03/10»), nunca «Hoy» ni «Ayer». En la
  vista día: «La entrada quedó el …, fuera del día que estás viendo.», con el
  enlace «Ir a ese día».
- **CAL-46 y TT-109.** El aviso de respuesta perdida en el alta dice «fijate en
  el calendario» donde la barra dice «fijate en la lista»: es la misma causa con
  el lugar donde mirar.
- **CAL-68.** «Duplicar» y «Borrar» del menú cierran el diálogo al elegirse; su
  aviso, si fallan, queda en la pantalla.
- **TT-89 en el diálogo.** «Reintentar» de un «Guardar» que falló por red
  vuelve a guardar con el borrador actual: si la persona editó después del
  fallo, se manda lo editado.

**Lo registra `parity-analyst` antes del merge** (§6), con la sección «Slice
8c» y la lista «Lo que queda» (el 8b) en `calendario.md`.

### Queda afuera

- **Los gestos de arrastre**: slice 8b (§8).
- **P-03** (asa del inicio del timer) y **P-05** (días laborables, CAL-13).
- **«Reintentar» en el alta** (TT-109): sigue la decisión pendiente del estado
  de la fase.
- **Etiquetas y facturable en el diálogo**: slice 11, que suma sus grupos a
  `updateEntry` (§4.9).

### Consecuencias sobre código ya entregado

| Archivo                                 | Qué cambia                                                                                                                                                                                                                       | Qué hay que volver a probar                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `time-entry/schema.ts`                  | `updateEntryInput` y su resultado; `minDayKey` en `calendarState`.                                                                                                                                                               | `schema.test.ts` entero                                              |
| `time-entry/schema.test.ts`             | El fixture `state` de `calendarState` (`:522-539`) suma `minDayKey`, que `parse` exige: es un cambio de fixture, ninguna afirmación cambia.                                                                                      | —                                                                    |
| `time-entry/service.ts`                 | `createManualEntry` sin el rechazo de TT-30; `runningStartFor` sale de `updateRunningStart`; `valuesOf` suma el par; `updateEntry` nueva; `getCalendarState` suma `minDayKey`.                                                   | TT-18, TT-28, TT-29, TT-72, TT-75, TT-112, ADR 0006, la masiva del 6 |
| `time-entry/repository.ts`              | Suma `ClosedEntryFields` y `RunningEntryFields`; `updateTimes` pasa a `updateClosedEntry`; `updateStartOfRunning` pasa a `updateRunningEntry`, con campos. `updateClosedFields` no cambia.                                       | `updateEntryTimes`, `updateRunningStart`, `bulkEditEntries`          |
| `time-entry/actions.ts`                 | Revalida `"/"` y `"/calendario"`; suma `updateEntry`.                                                                                                                                                                            | `actions.integration.test.ts` entero                                 |
| `service.integration.test.ts`           | El caso de `:1377-1399` pasa a afirmar que el alta con el timer abierto crea la entrada y el timer sigue corriendo.                                                                                                              | —                                                                    |
| `audit.integration.test.ts`             | El caso de `:505-528` pasa a afirmar las dos constancias, `timeEntry.start` y `timeEntry.createManual`. El comentario de `:906` («con un timer corriendo se rechaza») sale: el orden ya no importa; sus afirmaciones no cambian. | —                                                                    |
| `actions.integration.test.ts`           | El caso de `:238-252` usa otro rechazo de dominio (`tooShort`); cada `toEqual(["/", …])` pasa a la lista de dos rutas por llamada.                                                                                               | —                                                                    |
| `src/components/action-feedback.tsx`    | `message` opcional: sin él, no hay descripción.                                                                                                                                                                                  | TT-90 del rastreador, del perfil y de la masiva; el error de CAL-87  |
| `src/app/(app)/calendario/error.tsx`    | El `Alert` a mano (`:17-25`) pasa a `ActionFeedback` con `title={calendarLabels.loadFailed}` y `onRetry={() => retry()}`, sin `message`; sale `calendarLabels.retry`.                                                            | CAL-87: el aviso y «Reintentar»                                      |
| `time-entry/components/labels.ts`       | `trackerLabels` suma `timerNotStopped`, `addLostTitle`, `entryNotAdded`, `duplicate` y `entryActionsLabel(entryName)`, textos hoy escritos en la barra y en la fila; `bulkDelete` pasa a `delete`, el mismo «Borrar».            | —                                                                    |
| `time-entry/components/tracker-bar.tsx` | `:578`, `:613` y `:618` usan `trackerLabels`, una línea por texto. El mensaje de `:614` («fijate en la lista») se queda.                                                                                                         | `manual-entry.spec.ts`, `tracker.spec.ts`                            |
| `time-entry/components/entry-row.tsx`   | `:362` usa `entryActionsLabel`; `:369` y `:380`, `trackerLabels.duplicate` y `delete`. Una línea por texto.                                                                                                                      | TT-58 y TT-60 en la fila                                             |
| `components/bulk-actions.tsx`           | `:295` usa `trackerLabels.delete` en lugar de `bulkDelete`; el texto no cambia.                                                                                                                                                  | `bulk-actions.spec.ts`                                               |
| `components/bulk-delete-dialog.tsx`     | `:106` usa `trackerLabels.delete` en lugar de `bulkDelete`; el texto no cambia.                                                                                                                                                  | `bulk-actions.spec.ts`                                               |
| `e2e/calendar.spec.ts`                  | Los pasos del diálogo con `canTrack` (`:267-275`, `:467-479`, `:496-510`, `:615-622`) afirman el modo de edición; las constantes del timer pasan a `calendar-page.ts`. Ver abajo.                                                | —                                                                    |

**`e2e/calendar.spec.ts` y `e2e/calendar-page.ts`.** La persona de los e2e tiene
`canTrack`, así que en el 8c el bloque abre el diálogo editable. Los pasos que
lo abren (`:267-275`, `:467-479`, `:496-510` y `:615-622`) afirman el modo de
edición: el título («Editar entrada» o «Timer en curso»), el foco inicial en
«Descripción» y los valores en los campos. «Cerrar»/`Esc` pasa a
«Cancelar»/`Esc`, con el foco de vuelta en el bloque. La unión de `entryDialog`
en `calendar-page.ts` suma «Editar entrada» y «Agregar entrada», y
`expectReadOnlyDialog` sale si queda sin uso: TT-92 se prueba en el componente
(§8). `PERSON_TIMEZONE`, `NEAR_MIDNIGHT_MINUTES` y `NOW_LINE_TOLERANCE_PX`
(`calendar.spec.ts:80`, `:90`, `:93`) pasan a `calendar-page.ts`, y los importan
los dos specs (§7, recorrido 3).

**Ninguna otra afirmación de un test existente cambia.** Las de arriba son las
únicas, y cada una tiene su motivo en P-01, en la revalidación de §4.7 o en el
diálogo editable con `canTrack` (CAL-05). El fixture de `schema.test.ts` cambia
por `minDayKey` sin cambiar lo que afirma.

## 2. Cambios de esquema

**Ninguno.**

## 3. Acciones de permisos nuevas

**Ninguna.** La unión `Action` de `src/server/permissions` no cambia.

| Operación del calendario             | Acción de `can()`                                                 | Recurso                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Mostrar los controles de escritura   | `timeEntry.own.create`, como `canTrack`                           | `ownTimeEntryResource(actor)`                                                              |
| Crear (`createManualEntry`)          | `timeEntry.own.create`                                            | `ownTimeEntryResource(actor)`                                                              |
| Guardar el diálogo (`updateEntry`)   | `timeEntry.own.update`                                            | en la action, `ownTimeEntryResource(actor)`; en el service, la fila leída (`readOwnEntry`) |
| Asignar un proyecto desde el diálogo | `project.track`, por `assertTrackable`                            | el proyecto pedido (ADR 0010)                                                              |
| Detener, duplicar, borrar            | las de `stopTimer`, `duplicateEntry` y `deleteEntry`, sin cambios | las de esas mutaciones                                                                     |

`updateEntry` hace las dos consultas de las mutaciones de una fila: `assertCan`
en la action y `authorizeEntry` sobre la fila en el service. Una acción propia
del diálogo sería una segunda decisión sobre lo mismo que `timeEntry.own.update`
ya decide.

## 4. Contrato de las server actions

Una action nueva, `updateEntry`, con el recorrido de siempre: sesión, Zod,
`assertCan`, service en una transacción con su constancia, revalidación también
con error. Y un cambio de conducta en `createManualEntry`.

### 4.1 `createManualEntry` sin el rechazo de TT-30 (P-01)

Salen las líneas `service.ts:796-804`: la lectura de `findRunning` y el
`TimeEntryError("timer_running", timerRunning)`. El resto de la función no
cambia: permiso, conversión de horas de pared, `tooShort`, `invalidDate`,
`nonexistentClock`, piso, par y constancia `timeEntry.createManual`.

- **No hay excepción por origen.** El alta es la misma para la barra manual y
  para el calendario, y el servidor no sabe de dónde viene.
- **El timer abierto no se toca**: la entrada nueva es cerrada y no choca con el
  índice `time_entry_running_unq`.
- **`timeEntryMessages.timerRunning` se queda**: lo usa la ayuda del conmutador
  (`mode-switch.tsx:65`). El código `timer_running` sigue con
  `runningEntryTimes`.

### 4.2 Los tipos

```ts
// src/modules/time-entry/schema.ts

/** El par entero, como en `updateEntryProject`: la tarea no viaja sola (TT-70). */
const entryPair = z
  .strictObject(
    { projectId: z.uuid().nullable(), taskId: z.uuid().nullable() },
    { error: timeEntryMessages.unexpected },
  )
  .refine(hasProjectForTask, taskNeedsProject);

/** El trío de una entrada cerrada, entero: los tres se interpretan juntos (ADR 0006). */
const entryTriple = z.strictObject(
  { date: dayKeyInput, start: clockInput, end: clockInput },
  { error: timeEntryMessages.unexpected },
);

/** Día y hora del inicio del timer que corre (TT-28, TT-42). */
const runningStart = z.strictObject(
  { date: dayKeyInput, start: clockInput },
  { error: timeEntryMessages.unexpected },
);

/**
 * Los grupos de campos que la persona tocó en el diálogo (ADR 0013). Ausente
 * no cambia; presente reemplaza, también "" en la descripción. Estricto en
 * cada nivel: un grupo o una clave que este slice no conoce —las etiquetas,
 * antes del 11— se rechaza con el texto de `unexpected`. `times` es de una
 * entrada cerrada y `runningStart` de la que corre: nunca los dos.
 */
export const updateEntryChanges = z
  .strictObject(
    {
      description: description.optional(),
      project: entryPair.optional(),
      times: entryTriple.optional(),
      runningStart: runningStart.optional(),
    },
    { error: timeEntryMessages.unexpected },
  )
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    timeEntryMessages.bulkNoChanges,
  )
  .refine(
    (changes) => changes.times === undefined || changes.runningStart === undefined,
    timeEntryMessages.unexpected,
  );

export const updateEntryInput = z.object({ id: z.uuid(), changes: updateEntryChanges });

export type UpdateEntryChanges = z.input<typeof updateEntryChanges>;
export type UpdateEntryInput = z.input<typeof updateEntryInput>;
/** Lo que recibe el service: la descripción ya recortada. */
export type UpdateEntryValues = z.output<typeof updateEntryInput>;
export type UpdateEntryResult = { readonly entry: TimeEntryView };
```

`description`, `dayKeyInput`, `clockInput` y `taskNeedsProject` son los de hoy.
Las horas viajan canónicas, `HH:mm` de 24 h, también con la persona en 12 h. El
texto «Elegí al menos un cambio.» (`bulkNoChanges`) es la misma causa que en la
masiva —un pedido sin cambios— y no se duplica; ninguna interfaz lo manda.

```ts
// src/modules/time-entry/actions.ts
export async function updateEntry(input: UpdateEntryInput): Result<UpdateEntryResult>;

// src/modules/time-entry/service.ts
export async function updateEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateEntryValues,
  now: Date = new Date(),
): Promise<UpdateEntryResult>;
```

La action parsea, llama a `assertCan(actor, "timeEntry.own.update",
ownTimeEntryResource(actor))` y al service, como `updateEntryTimes`.

### 4.3 `updateEntry`

Dentro de `translatingPairConstraints`, en una transacción:

1. `readOwnEntry(tx, actor, "timeEntry.own.update", input.id)`: bloquea la fila;
   `not_found` (TT-80) o `forbidden` con TT-79 si es ajena. **La ajena se
   rechaza como ajena antes que por su estado o su horario**, como en el 6.
2. **El estado de la fila contra lo pedido**:
   - `times` sobre la entrada que corre: `timer_running` con
     `runningEntryTimes` (TT-111).
   - `runningStart` sobre una cerrada: `already_stopped` con `alreadyStopped`
     (CAL-41).
   - La descripción y el par no dependen del estado (§1, CAL-41).
3. **La descripción y el horario**:
   - Cerrada: `editedFields(row, { description, ...times }, workspace)`, la
     función de la masiva (`service.ts:1149`), con los dos grupos en la forma
     de `BulkEditChanges`. La descripción cambia si viene y difiere de la fila.
     Si el trío pedido es igual a `tripleOf(row)`, el horario no cambia y no se
     evalúa; si no, `entryTimesFor` con sus rechazos (`multiDayTimes`,
     `invalidDate`, `nonexistentClock`, `tooShort`, `beforeWorkspace`).
   - Abierta: la descripción, con la misma regla. El inicio: si el rótulo
     pedido es igual al del instante guardado (`sameLabel`), no cambia; si no,
     `runningStartFor(row, runningStart, workspace, now)` (§4.4).
4. **El par**: si `project` viene y `!samePair(row, project)`,
   `assertAssignable(tx, actor, pairOf(row), project)`: TT-77 con el texto de
   `project` si el proyecto o la tarea no están disponibles.
5. **Si no cambia nada**, responde `{ entry: toView(row, workspace) }` sin
   escribir ni registrar.
6. **Una sola escritura**, con los campos que cambiaron: `updateClosedEntry`
   con los de `editedFields` más `pair`, o `updateRunningEntry` con la
   descripción, el inicio y `pair`, según la fila (§4.5). El par se escribe
   siempre entero, nunca una sola de sus dos columnas. Si devuelve
   `undefined` —el bloqueo lo hace imposible—, el código de la mutación de un
   campo: `timer_running` en la cerrada, `already_stopped` en la abierta.
7. `recordAudit` con `timeEntry.update`, `previousValue` y `nextValue` con
   solo los campos escritos: `description`, `projectId`, `taskId`,
   `startedAt`, `endedAt`. `valuesOf` recibe `ClosedEntryFields` y suma las dos
   claves del par cuando viene `pair`; la masiva le sigue pasando
   `ClosedFields`, que es un caso de ese tipo.
8. Responde `{ entry: toView(escrita, workspace) }`. La escritura relee la fila
   con su proyecto y su tarea, porque el par pudo cambiar.

**El orden de 2, 3 y 4 es contrato**: con un horario inválido y un proyecto no
disponible, responde el rechazo del horario. Los dos lanzan antes de escribir,
así que no hay escritura parcial que el orden pueda dejar; lo que fija es qué
causa se ve.

**No hay un segundo camino de reglas.** La cerrada usa `editedFields`, que es la
de la masiva, que a su vez llama a `entryTimesFor`, que es la de
`updateEntryTimes`. La abierta usa `runningStartFor`, que es la de
`updateRunningStart`. El par usa `assertAssignable`, que es la de
`updateEntryProject`. Lo prueban los criterios 3 a 5 (§7).

### 4.4 `runningStartFor`

Lo que hoy hace `updateRunningStart` entre la lectura y la escritura
(`service.ts:1037-1052`) pasa a una función privada:

```ts
/**
 * La regla del inicio del timer que corre (TT-28, TT-29, TT-112, ADR 0006
 * paso 1): conserva el instante si el rótulo no cambió, si no lo convierte.
 * Lanza `TimeEntryError` con `nonexistentClock`, `futureTime` o
 * `beforeWorkspace`.
 */
function runningStartFor(
  row: TimeEntryRow,
  requested: { readonly date: string; readonly start: string },
  workspace: TrackerWorkspace,
  now: Date,
): Date;
```

`updateRunningStart` queda en: leer con bloqueo, rechazar la cerrada,
`runningStartFor`, `updateRunningEntry(tx, target, { startedAt })`, registrar.
Su conducta no cambia: sigue escribiendo y registrando aunque el rótulo sea el
mismo, como hoy. Solo `updateEntry` saltea el rótulo igual (ADR 0013).

### 4.5 Las escrituras del repository

```ts
// src/modules/time-entry/repository.ts

/** Sin cambios: los tres campos de una fila cerrada, los de la masiva. */
export type ClosedFields = {
  readonly description?: string;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
};

/** Lo que escribe `updateClosedEntry`: lo de `ClosedFields` y el par, siempre entero. */
export type ClosedEntryFields = ClosedFields & { readonly pair?: ProjectPair };

/** Lo que escribe `updateRunningEntry`. */
export type RunningEntryFields = Omit<ClosedEntryFields, "endedAt">;

/** `updateTimes` generalizada: la fila cerrada, releída con sus referencias. */
updateClosedEntry(
  tx: Transaction,
  target: EntryTarget,
  fields: ClosedEntryFields,
): Promise<EntryWithRefs | undefined>;

/** `updateStartOfRunning` generalizada: la fila abierta, releída con sus referencias. */
updateRunningEntry(
  tx: Transaction,
  target: EntryTarget,
  fields: RunningEntryFields,
): Promise<EntryWithRefs | undefined>;
```

Las dos escriben `pair.projectId` y `pair.taskId` juntas cuando viene `pair`, y
nada del par si no viene: el tipo no deja pedir una sola columna. Filtran con
`isTarget` y `ended_at is not null` o `is null`, como hoy.

`updateEntryTimes` llama a `updateClosedEntry(tx, target, times)` y
`updateRunningStart` a `updateRunningEntry(tx, target, { startedAt })`. Salen
`updateTimes` y `updateStartOfRunning`: dos funciones con el mismo papel serían
una duplicación. `updateClosedFields`, sin relectura y con `ClosedFields`, sigue
siendo la de la masiva.

### 4.6 Los errores de `updateEntry`

| Causa                                                                            | Código            | Texto                                   |
| -------------------------------------------------------------------------------- | ----------------- | --------------------------------------- |
| Entrada mal formada, grupo o clave desconocidos, `times` y `runningStart` juntos | `validation`      | el de Zod, o `unexpected`               |
| Sin ningún grupo                                                                 | `validation`      | `bulkNoChanges`                         |
| Membresía desactivada                                                            | `forbidden`       | `forbidden`                             |
| La entrada ya no existe (TT-80)                                                  | `not_found`       | `notFound`                              |
| Es de otra persona (TT-79)                                                       | `forbidden`       | `forbiddenOtherOwner`                   |
| Trío sobre la entrada que corre (TT-111)                                         | `timer_running`   | `runningEntryTimes`                     |
| Inicio de timer sobre una cerrada (CAL-41)                                       | `already_stopped` | `alreadyStopped`                        |
| Trío de una entrada de más de un día que cambia (TT-110)                         | `validation`      | `multiDayTimes`                         |
| Hora que no existe (TT-112)                                                      | `validation`      | `nonexistentClock`                      |
| Menos de un minuto (TT-73)                                                       | `validation`      | `tooShort`                              |
| Día fuera de las cuatro cifras                                                   | `validation`      | `invalidDate`                           |
| Antes de la creación del workspace                                               | `validation`      | `beforeWorkspace`                       |
| Inicio del timer en el futuro (TT-29, TT-75)                                     | `validation`      | `futureTime`                            |
| Proyecto o tarea no disponibles (TT-77)                                          | `not_found`       | `projectUnavailable`, `taskUnavailable` |
| Tarea sin proyecto (TT-70)                                                       | `validation`      | `taskNeedsProject`                      |
| Red o error inesperado                                                           | `unexpected`      | `unexpected`                            |

### 4.7 Revalidación

**Todas las actions de `time-entry` revalidan `"/"` y `"/calendario"`**, también
con error. `revalidatePath` en una server action actualiza la pantalla solo si
se está viendo la ruta revalidada (§0), y el calendario usa `createManualEntry`,
`updateEntry`, `stopTimer`, `duplicateEntry` y `deleteEntry`. Revalidar las dos
desde todas es más simple que elegir por action, y ninguna pantalla puede quedar
vieja porque alguien olvidó una ruta.

```ts
// src/modules/time-entry/actions.ts
const options = {
  paths: ["/", "/calendario"],
  messages: {
    forbidden: timeEntryMessages.forbidden,
    unexpected: timeEntryMessages.unexpected,
  },
} as const;
```

No se usa `{ path: "/", type: "layout" }`: revalidaría también `/proyectos` y
`/perfil`, que no muestran entradas.

### 4.8 Reintento y auditoría

- **`updateEntry` llega a un punto fijo** (ADR 0013): el segundo intento con los
  mismos grupos los encuentra como se pidieron, no escribe ni registra y
  responde la misma vista. Ofrece «Reintentar» con `unexpected`, que vuelve a
  calcular los grupos con el borrador actual (§5.4).
- **`createManualEntry` no** (TT-109), sin cambios.
- **Una constancia por «Guardar»**, `timeEntry.update`, con los campos escritos.
  Un pedido rechazado o sin cambios no deja ninguna.

### 4.9 Lo que el slice 11 suma, sin que este lo construya

- **`updateEntryChanges` gana grupos opcionales**: `tags` y `billable`, con la
  misma regla. Por eso el objeto es estricto desde ahora.
- **El algoritmo de §4.3 gana pasos** después del par, y la escritura, sus
  columnas; las etiquetas, su sentencia sobre la tabla de unión en la misma
  transacción.
- **El diálogo gana campos** con sus grupos en `entry-dialog-draft.ts`.

## 5. Contrato de lectura y pantalla

### 5.1 Lo que suma la lectura

`calendarState` gana `minDayKey: z.string()`, el piso del workspace
(`workspaceFloorDayKey`), para `DateField` y `addEntryDraft`. Nada más de la
lectura del 8 cambia.

### 5.2 Crear desde la grilla y desde la barra

**Clic en una franja libre** (CAL-43): con `canTrack`, un clic sobre el fondo
de una columna abre el alta con `slotDraft(date, minuteAt(offset, zoom), zoom,
day.missingMinutes)`. Sin efecto sobre un día con `beforeWorkspace`, sobre un
minuto con `isMissing` o sin `canTrack` (CAL-30, CAL-48). Las franjas no son
controles (CAL-76): el alta por teclado es «Agregar entrada».

**«Agregar entrada»** (CAL-74), al final de la barra, solo con `canTrack`: abre
el alta con `addEntryDraft(days, now, minDayKey, zoom)`. El botón lleva
`addButtonRef`, que es quien abrió.

`calendar-layout.ts` suma:

```ts
/** El minuto de una posición vertical, ajustado hacia abajo a la franja. */
export function minuteAt(offsetPx: number, zoom: CalendarZoom): number;

/**
 * CAL-43: la franja tocada y una franja de largo. Si el fin cae dentro de un
 * hueco de `missingMinutes`, pasa al final del hueco: el primer minuto que
 * existe después (Madrid, 01:00 a zoom 60 en el día del adelanto: 01:00–03:00).
 */
export function slotDraft(
  date: string,
  minute: number,
  zoom: CalendarZoom,
  missingMinutes: readonly MinuteRange[],
): TimeDraft;

/**
 * CAL-74: hoy si está a la vista, si no el primer día, nunca antes del piso.
 * La hora es la franja de ahora si el día es hoy, y si no `DEFAULT_SCROLL_CLOCK`.
 */
export function addEntryDraft(
  days: readonly string[],
  now: NowPosition,
  minDayKey: string,
  zoom: CalendarZoom,
): TimeDraft;
```

Las horas salen de `minutesToClock`; el día siguiente, de `addDaysToKey`.
`TimeDraft` es el de `time-draft.ts`. Un fin que pasa de las 24:00 es la hora
del día siguiente, como en el trío (TT-72).

### 5.3 El diálogo de una entrada

`EntryDialog` gana tres modos de edición sobre el de solo lectura del 8, que
queda para `!canTrack` (CAL-05, TT-92). **No llama a ninguna action**: avisa lo
que la persona eligió, y `CalendarView` es dueño de los pedidos. El borrador
vive en una `ref` que cada cambio actualiza y que los manejadores leen: Enter en
un `ClockField` confirma y guarda en el mismo evento (`clock-field.tsx:140-146`),
como `bulk-edit-dialog.tsx:131-171`.

**Editar una entrada cerrada** (CAL-65, CAL-66), título «Editar entrada»:

- «Descripción»: `Input` con `maxLength={DESCRIPTION_MAX}` (TT-71).
- «Proyecto»: `ProjectPicker` con `variant="row"` y el nombre
  `entryProjectLabel(nombre)`.
- Fecha (`DateField` con `minDayKey`, sin techo), «Hora de inicio», «Hora de
  fin» con su superíndice y «Duración», con las transiciones de
  `time-draft.ts` (TT-18 a TT-21). La duración mostrada es `durationLabel` de la
  vista mientras el trío no cambió, y la de reloj del borrador si cambió, como
  la fila (TT-97).
- **Con `editableTimes` en falso** (CAL-58, TT-110): fecha, horas y duración
  como texto, y `trackerLabels.multiDayTimesReadOnly` debajo. La descripción y
  el proyecto se siguen editando.
- **Abajo a la izquierda**, el menú `entryActionsLabel(nombre)` (CAL-68):
  `trackerLabels.duplicate` y `trackerLabels.delete`. Abajo a la derecha,
  «Cancelar» y «Guardar».
- **`save()`**, el manejador de «Guardar», de Enter en la descripción y de Enter
  en un `ClockField`: si `pending`, no hace nada; si no, calcula
  `changesOf(entry, draftRef.current)` —la descripción si su recorte difiere, el
  par si `!samePair`, el trío si `editableTimes` y `!sameDraft(draft,
fromView(entry))`—. **Sin cambios, cierra sin pedido**; con cambios, avisa
  `onSave(changes)`.

**El timer activo** (CAL-40), título «Timer en curso»:

- «Descripción», «Proyecto», y el inicio: `DateField` con `maxDayKey={todayKey}`
  y «Hora de inicio». El fin, como texto: «Fin: en curso», y el transcurrido.
- «Detener», «Cancelar» y «Guardar». **Sin menú.**
- `save()` hace lo mismo con `runningChangesOf`: `description`, `project` y
  `runningStart` si cambiaron.
- **«Detener» queda `aria-disabled`** mientras haya cambios: `runningChangesOf`
  no es `null`, **o** el texto de «Hora de inicio» difiere del rótulo que
  muestra el campo. Ese texto llega por `onTextChange` de `ClockField`
  (`clock-field.tsx:42-46`), como la hora sin confirmar de
  `bulk-edit-dialog.tsx:132-137`: una hora tecleada y no confirmada es un
  cambio. El texto «Guardá los cambios antes de detener el timer.» va asociado
  por `aria-describedby` y a la vista. Sin cambios, avisa `onStop`.

**Agregar** (CAL-43, CAL-45, CAL-74), título «Agregar entrada»: los campos de
editar, sin menú; «Cancelar» y «Agregar». **`add()`** es el manejador del botón,
de Enter en la descripción y de Enter en un `ClockField`: si `pending` o si
`draftDuration(draftRef.current.times)` es cero, no hace nada; si no, avisa
`onAdd(createInputOf(draftRef.current))`. Lee la duración de la `ref` y no del
render, como `bulk-edit-dialog.tsx:165-171`: Enter en «Hora de fin» confirma el
fin y agrega en el mismo evento. «Agregar» queda `aria-disabled` con duración
cero, con `timeEntryMessages.tooShort` asociado, como la barra manual
(`manual-bar.tsx:73-94`). El borrador inicial sale de `slotDraft` o de
`addEntryDraft` (§5.2).

**Membresía desactivada** (CAL-05, TT-92): el diálogo del 8, en solo lectura, y
no hay alta.

**Inactivo es `aria-disabled` y no actuar**, nunca `disabled`: «Guardar»
mientras el pedido viaja, «Agregar» con duración cero o en vuelo, «Detener»
con cambios.

**El aviso de error del diálogo** lo dibuja `EntryDialog`, que es quien tiene el
borrador, con la falla que le pasa `CalendarView`:

```ts
export type EntryDialogFailure = {
  readonly title: string;
  readonly message: string;
  /** «Reintentar»: solo con `unexpected` de «Guardar» (TT-89), nunca en el alta (TT-109). */
  readonly retryable: boolean;
};
```

### 5.4 Los pedidos y sus avisos

`CalendarView` es dueño de los cinco `useAction`: `createManualEntry`,
`updateEntry`, `stopTimer`, `duplicateEntry` (con `useNewId` por la entrada de
origen) y `deleteEntry` (con la vista optimista de los ids que se borran, que
pasa como `removedIds` a `dayTotalOf` y `periodTotalOf`). Los avisos tienen dos
lugares, según sobrevivan o no al diálogo:

| Operación                       | Mientras viaja                                       | Bien                                                     | Mal                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Guardar»                       | diálogo abierto, «Guardar» `aria-disabled`           | se cierra; foco al bloque (§5.5); CAL-46 si quedó afuera | en el diálogo: `calendarLabels.entryNotSaved` y el mensaje, `retryable` con `unexpected`. Con `not_found` o `already_stopped`, se cierra y el aviso va a la pantalla         |
| «Agregar»                       | diálogo abierto, «Agregar» `aria-disabled`           | se cierra; foco al bloque nuevo; CAL-46 si quedó afuera  | en el diálogo, sin `retryable`: con `unexpected`, `trackerLabels.addLostTitle` y `calendarLabels.addLostMessage` (TT-109); si no, `trackerLabels.entryNotAdded` y el mensaje |
| «Detener»                       | el diálogo se cierra al elegir                       | foco al bloque, ya cerrado                               | en la pantalla: `trackerLabels.timerNotStopped`; con `unexpected`, «Reintentar»                                                                                              |
| «Duplicar»                      | el diálogo se cierra al elegir                       | foco al bloque de la copia                               | en la pantalla: `trackerLabels.entryNotDuplicated`; con `unexpected`, «Reintentar» con el mismo id (ADR 0007)                                                                |
| «Borrar» (después de confirmar) | el bloque se va de forma optimista; foco a la región | —                                                        | el bloque vuelve; en la pantalla: `trackerLabels.entryNotDeleted`; con `unexpected`, «Reintentar»                                                                            |

- **«Reintentar» del diálogo es guardar con el borrador actual**: mueve el foco
  a «Guardar» y llama a `save()`, que avisa `onSave(changesOf(entry,
draftRef.current))` (o `runningChangesOf`). **No es `useAction.retry`**, que
  reenvía `lastInput` (`use-action.ts:87-93`): si la persona editó después del
  fallo, mandaría el borrador viejo y pisaría lo que acaba de escribir. Si el
  borrador volvió a ser igual a la vista, `save()` cierra sin pedido.
- **Los avisos de la pantalla** reintentan con `retryHandlerOf`: «Detener»,
  «Duplicar» y «Borrar» no tienen borrador, y reenviar el mismo pedido es lo
  correcto.
- **La región de la pantalla**, la del 8, gana el lugar de los avisos debajo de
  la barra.
- **CAL-46**: si la vista que devuelve «Guardar» o «Agregar» no tiene ningún
  segmento en el período (`entrySegments(entry, days).length === 0`),
  `ActionFeedback` con `tone="info"`, el título «La entrada quedó el
  {weekdayLabel}, fuera de la semana que estás viendo.» (o «…del día que estás
  viendo.»), sin `message`, y el enlace «Ir a esa semana» a
  `calendarHref("week", entry.weekStart)` o «Ir a ese día» a
  `calendarHref("day", entry.dayDate)`. Una entrada que empezó antes del
  período y lo cruza tiene segmentos: no lleva aviso. La operación siguiente
  lo baja.
- **«Reintentar» se va con su aviso** (`use-action.ts:59-61`): el `onRetry`
  mueve el foco y después reintenta. En el diálogo, a «Guardar», que queda
  `aria-disabled` mientras viaja; en la pantalla, a la región. No se pasa
  `retryDisabled`, que es `disabled` nativo.
- **Una operación nueva baja los avisos anteriores**, como `clearNotices` de la
  barra.

### 5.5 Foco y teclado

- **Abrir**: un bloque abre su diálogo con clic, `Enter` o `Espacio` (CAL-74).
  Al abrir un modo de edición, el foco va a «Descripción»; el de solo lectura,
  a «Cerrar».
- **El sujeto del diálogo** reemplaza a `dialogEntry` del 8:

  ```ts
  type DialogSubject =
    | { readonly kind: "entry"; readonly entry: TimeEntryView }
    | {
        readonly kind: "add";
        readonly draft: TimeDraft;
        readonly opener: "button" | "slot";
      };
  ```

  `CalendarView` lo guarda junto a `open`, en `null` antes del primer diálogo.
  Se reemplaza al abrir y no se limpia al cerrar, como `dialogEntry`. Lo demás
  se deriva de él:
  - `openerId` es `subject?.kind === "entry" ? subject.entry.id : null`. Un
    alta nunca deja el `ref` del bloque en la última entrada abierta.
  - `cancelFocus`, el `ref` adonde vuelve el foco al cancelar: `openerRef`, el
    botón del bloque, para una entrada; `addButtonRef` para un alta desde
    «Agregar entrada»; un `ref` nulo para un alta desde una franja, que no es
    un control (CAL-76). `EntryDialog` lo recibe en lugar de `openerRef` y se
    lo pasa a `useDialogReturnFocus`.

- **Cancelar, `Esc`, clic afuera** (CAL-49): sin pedido, con
  `useDialogReturnFocus` como en el 8: el foco vuelve a `cancelFocus`, o a la
  región si es nulo o ya no está.
- **El dueño cierra el diálogo** —éxito de «Guardar» o «Agregar», o «Detener»,
  «Duplicar» o «Borrar» elegidos— y `useDialogReturnFocus` lleva el foco a la
  región (`fallbackFocus`). Nunca se cierra «sin mover el foco».
- **Después de «Guardar», «Agregar», «Detener» o «Duplicar» con éxito**,
  `CalendarView` fija `focusEntryId` con el id de la entrada que importa (la
  editada, la creada, la detenida, la copia). Cuando la grilla dibuja el botón
  de esa entrada —en el mismo render o después de la revalidación, en otro día
  o con otra clave—, lo enfoca si el foco está en la región o en `body`, y
  avisa para que se limpie. Si la entrada quedó fuera del período (la misma
  definición de CAL-46), el foco se queda en la región, con el aviso.
- **«Borrar» del menú**: el dueño cierra `EntryDialog` (foco a la región) y abre
  `DeleteEntryDialog` con `finalFocus={openerRef}`. El sujeto sigue siendo esa
  entrada mientras dura la confirmación —no se limpia al cerrar (§5.8 del 8)—,
  así `openerId` y el `ref` apuntan al bloque entre un diálogo y otro. Cancelar
  el borrado devuelve el foco al botón del bloque. Si ese botón ya no está
  —una revalidación lo sacó—, `openerRef` queda en `null` y un efecto de
  `CalendarView` mueve el foco a la región al cerrarse la confirmación, como
  `day-group.tsx:222-230`. Confirmar saca el bloque de forma optimista y el
  mismo efecto deja el foco en la región.
- **`Tab`** recorre la barra, el zoom y los bloques en orden de columna y de
  inicio (CAL-76). Los atajos del rastreador no se montan (CAL-73).
- **Un control con foco nunca pasa a `disabled`**: lo pierde a `body`.

### 5.6 Revalidación

La del 8 (`useTrackerRefresh`). El diálogo guarda la entrada que se abrió y su
borrador: una revalidación con la entrada cambiada o borrada no lo cierra ni lo
pisa (CAL-72). Gana la última escritura por grupo de campos (ADR 0013).

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
```

### frontend-dev

```
/home/maxi/program/clock/src/components/action-feedback.tsx
/home/maxi/program/clock/src/app/(app)/calendario/error.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/bulk-actions.tsx
/home/maxi/program/clock/src/modules/time-entry/components/bulk-delete-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-view.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-toolbar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-grid.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.ts      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.test.ts (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-layout.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-layout.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/labels.ts
```

`tracker-bar.tsx`, `entry-row.tsx`, `bulk-actions.tsx` y `bulk-delete-dialog.tsx`
entran solo con las líneas de §1: una por texto, sin otro cambio. `error.tsx`,
solo con el cambio de §1.

### tests-slice8

```
/home/maxi/program/clock/e2e/calendar-edit.spec.ts   (nuevo)
/home/maxi/program/clock/e2e/calendar.spec.ts
/home/maxi/program/clock/e2e/calendar-page.ts
```

`calendar-page.ts`, el del 8, suma los localizadores del diálogo de edición y
de los avisos, y las tres constantes que salen de `calendar.spec.ts`.
`calendar.spec.ts` cambia solo lo que dice §1.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/calendario.md
/home/maxi/program/clock/docs/parity/time-tracker.md
/home/maxi/program/clock/docs/parity/timesheet.md
```

Antes del merge, lo que enumera §1 en «Lo que el slice decide»: en
`calendario.md`, P-01, P-04 y P-06 a «Cerrados», CAL-40, CAL-41, CAL-46,
CAL-47 y CAL-67 reescritos, §19 corregida y la sección «Slice 8c» con «Lo que
queda» (el 8b); en `time-tracker.md`, TT-30; en `timesheet.md`, la oración de
TS-39 sobre `createManualEntry`.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/server/time/`,
`src/server/session.ts`, `src/server/action.ts`, `src/server/audit.ts`,
`src/hooks/`, `src/modules/project/`, `src/modules/profile/`, `src/app/` salvo
`(app)/calendario/error.tsx` con el cambio de §1, y los componentes del
rastreador salvo `labels.ts`, `tracker-bar.tsx`, `entry-row.tsx`,
`bulk-actions.tsx` y `bulk-delete-dialog.tsx`, con los cambios de §1:
`mode-switch.tsx`, `manual-bar.tsx`, `entry-list.tsx`, `day-group.tsx`,
`date-field.tsx`, `clock-field.tsx`, `time-draft.ts`,
`use-dialog-return-focus.ts`, `use-tracker-refresh.ts`, `use-group-total.ts`,
`elapsed.ts`, `elapsed-counter.tsx`, `delete-entry-dialog.tsx`. De lo que dejó
el 8, no cambian `calendar-screen.tsx`, que ya pasa `minDayKey` dentro del
estado, `calendar-block.tsx`, `calendar-totals.ts`, `calendar-zoom.ts`,
`calendar-href.ts` ni `period-picker.tsx`. De los e2e existentes, solo cambian
`e2e/calendar.spec.ts` y `e2e/calendar-page.ts`, con lo de §1. Los contratos y
correcciones anteriores son históricos. El mapa y el estado de la fase los
actualiza team-lead.

### Handshake de orden

0. **Antes de implementar**: el 8 en `main`, y la ronda corta de
   `architecture-reviewer` contra ese árbol (§0), hecha: la
   [ronda 2](correcciones-fase1-slice8c-ronda2.md) aprueba con sus correcciones
   aplicadas. Las decisiones del usuario están resueltas.
1. **Primer commit de `backend-dev`**: los esquemas y tipos de §4.2,
   `minDayKey` en `calendarState` con el fixture de `schema.test.ts`, y las
   firmas de `updateEntry` (action y service). La suite existente sigue verde.
   Avisa a `frontend-dev`.
2. **`frontend-dev` arranca en paralelo** por lo que no depende del servidor:
   los textos de `labels.ts` con las líneas de `tracker-bar.tsx`,
   `entry-row.tsx`, `bulk-actions.tsx` y `bulk-delete-dialog.tsx`,
   `ActionFeedback` sin `message` con `error.tsx`, y `minuteAt`, `slotDraft` y
   `addEntryDraft` con sus tests. **Primero de todo**, una prueba de que
   `ProjectPicker` y `DateField` abren, eligen y devuelven el foco dentro de un
   `Dialog` de Base UI; si no, se avisa antes de seguir, porque cambia §5.3.
3. **`tests-slice8` arranca en paralelo** con el spec nuevo y los cambios de
   `calendar.spec.ts` y `calendar-page.ts` (§1), y confirma que fallan por la
   funcionalidad y no por el arnés.
4. Con el primer commit en la rama, `frontend-dev` sigue con
   `entry-dialog-draft.ts` y sus tests, y después el diálogo y la pantalla.
   `backend-dev` sigue con P-01 y sus tres tests, la revalidación y las
   afirmaciones de rutas, el repository, `runningStartFor`, `updateEntry` y sus
   tests.
5. `parity-analyst`, antes del merge.

### Responsabilidades que no se leen en el nombre del archivo

- **`entry-dialog-draft.ts`** es el borrador de los tres modos y lo que cada uno
  manda, puros:

  ```ts
  export type EntryDialogDraft = {
    readonly description: string;
    readonly selection: ProjectSelection;
    readonly times: TimeDraft;
  };
  export function draftOfEntry(entry: TimeEntryView): EntryDialogDraft;
  /** Los grupos que cambiaron respecto de la vista; `null` si ninguno (§5.3). */
  export function changesOf(
    entry: TimeEntryView,
    draft: EntryDialogDraft,
  ): UpdateEntryChanges | null;
  export function runningChangesOf(
    entry: TimeEntryView,
    draft: EntryDialogDraft,
  ): UpdateEntryChanges | null;
  export function createInputOf(draft: EntryDialogDraft): CreateManualEntryInput;
  ```

  `draftOfEntry` toma el par con `selectionOf` de `entry-selection.ts`.
  `changesOf` nunca manda el trío de una entrada con `editableTimes` en falso.
  El slice 11 suma sus grupos acá.

- **`calendar-view.tsx`** suma a lo del 8: los cinco `useAction`, la vista
  optimista del borrado, el sujeto del diálogo en lugar de `dialogEntry`, con
  `openerId` y `cancelFocus` derivados (§5.5), la confirmación del borrado
  (`confirmingDelete`), la falla del diálogo como `EntryDialogFailure`, los
  avisos de la región, `focusEntryId`, `addButtonRef` y el efecto que mueve el
  foco a la región cuando el bloque ya no está. A la grilla le pasa
  `dialogOpen={open || confirmingDelete}`: con la confirmación abierta, `open`
  es falso, y con `dialogOpen={open}` (`calendar-view.tsx:83`) los detalles de
  los bloques volverían a abrirse detrás de ella.
- **`calendar-grid.tsx`** suma el clic en una franja (`onSlot(date, minute)`) y
  enfoca el bloque de `focusEntryId` según §5.5.
- **`calendar-toolbar.tsx`** suma «Agregar entrada» con `addButtonRef`.
- **`entry-dialog.tsx`** dibuja los modos de §5.3 según el sujeto. Avisa
  `onSave(changes)`, `onAdd(input)`, `onStop()`, `onDuplicate()`,
  `onDelete()`, y recibe `failure: EntryDialogFailure | null`, `pending` y
  `cancelFocus` (§5.5).
- **`entry-dialog.test.tsx`** suma el cuerpo de edición con `editableTimes` en
  falso, el del timer con «Detener» `aria-disabled` y su texto, y el de solo
  lectura con `canTrack` en falso.
- **`labels.ts`** (el del rastreador) suma a `trackerLabels`:

  | Clave             | Texto                                 | Hoy en                |
  | ----------------- | ------------------------------------- | --------------------- |
  | `timerNotStopped` | «No se pudo detener el timer.»        | `tracker-bar.tsx:578` |
  | `addLostTitle`    | «No sabemos si la entrada se guardó.» | `tracker-bar.tsx:613` |
  | `entryNotAdded`   | «No se pudo agregar la entrada.»      | `tracker-bar.tsx:618` |
  | `duplicate`       | «Duplicar»                            | `entry-row.tsx:369`   |
  | `delete`          | «Borrar»                              | `entry-row.tsx:380`   |

  y `entryActionsLabel(entryName)`, «Acciones de la entrada «{nombre}»», que
  hoy está escrito en `entry-row.tsx:362`, al lado de `entryProjectLabel`.
  `delete` es una sola clave para la barra masiva y los dos menús: reemplaza a
  `bulkDelete` (`labels.ts:55`), que ya es «Borrar», en `bulk-actions.tsx:295`
  y `bulk-delete-dialog.tsx:106`.

- **`calendar/labels.ts`** suma a `calendarLabels`:

  | Clave            | Texto                                                                                                              |
  | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
  | `addEntry`       | «Agregar entrada»                                                                                                  |
  | `addTitle`       | «Agregar entrada»                                                                                                  |
  | `editTitle`      | «Editar entrada»                                                                                                   |
  | `add`            | «Agregar»                                                                                                          |
  | `save`           | «Guardar»                                                                                                          |
  | `stop`           | «Detener»                                                                                                          |
  | `saveBeforeStop` | «Guardá los cambios antes de detener el timer.»                                                                    |
  | `entryNotSaved`  | «No se pudo guardar la entrada.»                                                                                   |
  | `addLostMessage` | «Se perdió la respuesta del servidor. Antes de volver a agregarla, fijate en el calendario: puede haberse creado.» |
  | `outsideWeek`    | función: «La entrada quedó el {día}, fuera de la semana que estás viendo.»                                         |
  | `outsideDay`     | función: «La entrada quedó el {día}, fuera del día que estás viendo.»                                              |
  | `goToWeek`       | «Ir a esa semana»                                                                                                  |
  | `goToDay`        | «Ir a ese día»                                                                                                     |

  y pierde `retry`, que queda sin uso cuando `error.tsx` pasa a
  `ActionFeedback` (§1).

  Los textos que ya existen se importan de donde están y no se copian:
  `trackerLabels.description`, `date`, `startTime`, `endTime`,
  `noDescription`, `endsNextDay`, `multiDayTimesReadOnly`,
  `entryNotDuplicated`, `entryNotDeleted`, `timerNotStopped`, `addLostTitle`,
  `entryNotAdded`, `duplicate`, `delete`; `entryNameOf`, `entryProjectLabel`,
  `entryActionsLabel` y `extraDaysText`; `timeEntryMessages.tooShort`. De
  `calendarLabels` siguen los del 8: `runningTitle`, `runningEnd`, `project` y
  `duration`.

## 7. Criterios de aceptación

1. **CAL-43, CAL-45, CAL-74, crear** — Un clic en una franja abre «Agregar
   entrada» con ese día, la franja y una franja de largo, con el fin corrido al
   final de un hueco si cae en él; «Agregar entrada» abre con hoy o el primer
   día del período; «Agregar» y Enter en «Hora de fin» crean con
   `createManualEntry` y el bloque aparece.
2. **P-01** — `createManualEntry` con un timer abierto crea la entrada cerrada,
   el timer sigue abierto y quedan las dos constancias; desde el calendario,
   con un timer corriendo, la entrada se crea. TT-30 en el rastreador no
   cambia: el e2e de `manual-entry.spec.ts:82-129` sigue verde sin tocarlo.
3. **CAL-67, `updateEntry` sobre una cerrada** — Para cada caso de horario y un
   trío distinto del de la fila, el resultado es el de `updateEntryTimes` sobre
   una copia sembrada igual: mismos instantes, mismos rechazos, también con la
   hora repetida y la que no existe en Madrid y con segundos que el ADR 0006
   conserva.
4. **CAL-40, `updateEntry` sobre el timer** — Para cada inicio distinto del
   guardado, el resultado es el de `updateRunningStart` sobre una copia:
   `futureTime`, `nonexistentClock`, `beforeWorkspace` y los instantes.
5. **El par** — `updateEntry` con un proyecto no disponible responde lo mismo
   que `updateEntryProject` (TT-77) y no escribe nada más; con el mismo par, no
   consulta a `project`.
6. **Todo o nada** — Descripción, par y trío válidos se escriben en una sola
   sentencia con una constancia `timeEntry.update` que tiene solo los campos
   escritos. Con la descripción y un trío rechazado, no se escribe la
   descripción; con la descripción y un par rechazado, tampoco. Con un horario
   inválido y un proyecto no disponible, responde el rechazo del horario.
7. **El estado de la fila** — Un trío sobre la entrada que corre responde
   `timer_running` con `runningEntryTimes`; un inicio sobre una cerrada,
   `already_stopped`; la ajena abierta o de más de un día, `forbidden` con
   TT-79 antes que su estado o su horario; la que no existe, `not_found`.
8. **CAL-58** — Una entrada de más de un día abre con el horario en solo
   lectura y su texto; guardar solo la descripción anda; `updateEntry` con su
   mismo trío no la rechaza ni la reescribe.
9. **Punto fijo y «Reintentar»** — Repetir un `updateEntry` aplicado no
   escribe, no registra y responde la misma vista; sin cambios reales,
   tampoco. Desde la pantalla, un «Guardar» cuya respuesta se perdió se
   reintenta con «Reintentar», el foco queda en «Guardar» y termina sin aviso;
   si la persona editó después del fallo, se guarda lo editado.
10. **CAL-40, P-06** — En el diálogo del timer, «Guardar» cambia descripción e
    inicio juntos; «Detener» lo detiene; con cambios sin guardar, también una
    hora tecleada sin confirmar, «Detener» tiene `aria-disabled="true"` y su
    texto asociado.
11. **CAL-68 a CAL-70** — «Duplicar» deja dos bloques lado a lado y el foco en la
    copia; cancelar «Borrar» devuelve el foco al bloque; confirmarlo saca el
    bloque y deja el foco en la región. Con el diálogo o la confirmación del
    borrado abiertos, ningún bloque muestra su detalle.
12. **CAL-72** — Con la entrada borrada en otra pestaña, «Guardar» cierra el
    diálogo y la pantalla muestra «No se pudo guardar la entrada.» con «Esa
    entrada ya no existe.», con el foco en la región.
13. **CAL-46** — Guardar una entrada con fecha de otra semana muestra el aviso
    con su día y el enlace, que lleva a esa semana con el bloque a la vista;
    una entrada que sigue teniendo un segmento en el período no lo muestra.
14. **CAL-05, TT-92** — Con `canTrack` en falso, el diálogo es de solo lectura,
    no hay «Agregar entrada» y un clic en una franja no abre nada.
15. **CAL-30, CAL-48** — Un clic en un minuto que no existe o en un día anterior
    al piso no abre nada.
16. **CAL-41** — Con el timer detenido en otra pestaña, `updateEntry` con solo
    la descripción o el par se aplica a la entrada cerrada; con el inicio,
    `already_stopped`.
17. **Revalidación** — Cada action de `time-entry` revalida `"/"` y
    `"/calendario"`, también con error.
18. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
    `main` pasa, cambiando solo lo que lista §1: sus afirmaciones, el fixture
    de `schema.test.ts` y los pasos del diálogo de `e2e/calendar.spec.ts`.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                                 | Qué afirma                                                                                       |
| -------- | -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1        | unidad + e2e               | `calendar-layout.test.ts`; `entry-dialog-draft.test.ts`; `e2e/calendar-edit.spec.ts`    | `slotDraft` con el hueco de Madrid, `addEntryDraft` con el piso; `createInputOf`; el recorrido 1 |
| 2        | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/calendar-edit.spec.ts` | el alta con el timer abierto; las dos constancias; el recorrido 3                                |
| 3        | integración                | `service.integration.test.ts`                                                           | por cada caso, `updateEntry` contra `updateEntryTimes` sobre una copia                           |
| 4        | integración                | `service.integration.test.ts`                                                           | por cada caso, `updateEntry` contra `updateRunningStart` sobre una copia                         |
| 5        | integración                | `service.integration.test.ts`                                                           | archivado, privado sin acceso y tarea hecha; el mismo par sin consulta                           |
| 6        | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/calendar-edit.spec.ts` | escrituras y constancias; el orden; el recorrido 2                                               |
| 7        | integración                | `service.integration.test.ts`; `permissions.integration.test.ts`                        | cada estado; la ajena abierta y la de más de un día; membresía `inactive`                        |
| 8        | unidad + integración       | `entry-dialog.test.tsx`; `entry-dialog-draft.test.ts`; `service.integration.test.ts`    | el horario como texto; `changesOf` sin trío; el mismo trío sin escribir                          |
| 9        | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/calendar-edit.spec.ts` | el segundo intento sin escrituras ni constancias; el recorrido 5                                 |
| 10       | unidad + e2e               | `entry-dialog-draft.test.ts`; `entry-dialog.test.tsx`; `e2e/calendar-edit.spec.ts`      | `runningChangesOf`; «Detener» inactivo; el recorrido 3                                           |
| 11       | e2e                        | `e2e/calendar-edit.spec.ts`                                                             | el recorrido 4                                                                                   |
| 12       | e2e                        | `e2e/calendar-edit.spec.ts`                                                             | el recorrido 5                                                                                   |
| 13       | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar-edit.spec.ts`                                  | `entrySegments` vacío solo afuera; el recorrido 1                                                |
| 14       | unidad                     | `entry-dialog.test.tsx`                                                                 | el cuerpo en solo lectura                                                                        |
| 15       | unidad                     | `calendar-layout.test.ts`                                                               | `isMissing` y el piso que usa la grilla para no abrir                                            |
| 16       | integración                | `service.integration.test.ts`                                                           | la descripción y el par sobre la cerrada; el inicio con `already_stopped`                        |
| 17       | integración                | `actions.integration.test.ts`                                                           | las dos rutas en cada action, también con error; `updateEntry` con su traducción y su permiso    |
| 18       | unidad + integración + e2e | las suites existentes; `e2e/calendar.spec.ts`                                           | en verde, con solo lo de §1 cambiado: afirmaciones, el fixture y los pasos del diálogo           |

**Los criterios 3 y 4 son los que prueban que la regla no se duplicó**, con el
patrón del criterio 7 del slice 6: dos copias de cada entrada, una editada con
`updateEntry` y la otra con la mutación de un campo, comparando instantes o
código y texto del rechazo. El trío o el inicio tienen que ser distintos de los
de la fila: con uno igual, `updateEntry` no evalúa y la otra sí, y la diferencia
es a propósito. Un mutante que copie la regla y se desvíe en un caso tiene que
caer acá.

**El criterio 7 es el del orden** que cayó en el 6 y en el 10: la ajena se
siembra abierta y de más de un día, así el mutante que mira el estado o el
horario antes de autorizar responde otra cosa.

**El criterio 6 sobre el orden** se cruza con un proyecto archivado y un trío
con `tooShort`: el mutante que evalúa el par primero responde TT-77.

**El criterio 9 distingue «Reintentar» de `useAction.retry`**: el recorrido
edita después del fallo, y el mutante que reenvía `lastInput` deja el bloque con
la descripción del primer intento.

### Recorridos obligatorios de `e2e/calendar-edit.spec.ts`

Dueño: `tests-slice8`. **Cinco tests, uno por recorrido**: cada uno abre una
sola sesión, y el endpoint de sesión ya responde 429 con la suite completa. La
segunda pestaña es `page.context().newPage()`, que comparte la cookie y no pide
otra sesión; `openSecondTab` no se usa. Las entradas van en la **semana
anterior** salvo donde el recorrido pide hoy: así ninguna hora queda en el
futuro y nunca falta un día anterior en la semana. Las respuestas se esperan con
`withServerAction`; los editores en portal se buscan en `page`; sin
`page.clock.install()`.

1. **Crear con un clic y fuera del período** (criterios 1, 13). En la semana
   anterior, clic en la franja de las 10:00 del miércoles: el diálogo con ese
   día, 10:00 y 11:00. Escribir la descripción, teclear «11:30» en «Hora de
   fin» y Enter: el diálogo se cierra, el bloque con «10:00 – 11:30» y el foco
   en él, el total de la columna «1:30». Abrir el bloque, cambiar la fecha a un
   día de hace tres semanas y guardar: el aviso con ese día y «Ir a esa
   semana», que lleva a la semana con el bloque a la vista.
2. **Todo o nada** (criterio 6). Con un proyecto sembrado con
   `e2e/database.ts`, una entrada de 09:00 a 10:00 del martes anterior creada
   con un clic. Abrirla, cambiar descripción, proyecto y fin a 10:30,
   «Guardar»: el bloque con los tres. Abrirla de nuevo, cambiar la descripción
   y poner el inicio igual al fin, «Guardar»: el aviso «No se pudo guardar la
   entrada.» con «La entrada tiene que durar al menos un minuto.» en el
   diálogo. «Cancelar»: el bloque conserva la descripción anterior.
3. **El timer** (criterios 2, 10). Empieza con el mismo `test.skip` y el mismo
   motivo que el recorrido del timer del 8 (`calendar.spec.ts:516-520`), a
   menos de `NEAR_MIDNIGHT_MINUTES` de la medianoche de `PERSON_TIMEZONE`.
   Arrancar un timer en `/` con «en curso». En la semana anterior del
   calendario, crear una entrada con un clic: se crea (P-01). Volver a esta
   semana y abrir el bloque del timer: cambiar la descripción y ver «Detener»
   con `aria-disabled="true"` y «Guardá los cambios antes de detener el
   timer.». Volver la descripción a la original: «Detener» ya no está
   inactivo; teclear «00:00» en «Hora de inicio» sin confirmar: inactivo otra
   vez. Cambiar la descripción y Enter en «Hora de inicio»: se guarda y el
   diálogo se cierra. El bloque con la descripción nueva y «00:00 – en curso»,
   con el borde inferior en la línea de ahora, dentro de
   `NOW_LINE_TOLERANCE_PX`, como en el recorrido 3 del 8. Abrirlo y «Detener»:
   el bloque ya no dice «en curso» y tiene el foco.
4. **Duplicar y borrar** (criterio 11). Abrir una entrada con un clic: con el
   diálogo abierto, la página no tiene ningún `[data-slot=tooltip-content]`.
   «Acciones de la entrada», «Duplicar»: dos bloques con el mismo nombre, uno
   al lado del otro y el foco en la copia. Abrir la copia y «Borrar»: con la
   confirmación abierta, tampoco hay `[data-slot=tooltip-content]`.
   «Cancelar»: el foco en el botón de la copia. «Borrar» otra vez y confirmar:
   queda un bloque y el foco está en la región «Calendario».
5. **Respuesta perdida y entrada que ya no existe** (criterios 9, 12). Abrir una
   entrada, cambiar la descripción a «B», perder la respuesta de «Guardar» con
   `loseActionResponses` y retener las revalidaciones con `holdRefreshes`: el
   aviso con «Reintentar». En una segunda pestaña del mismo contexto, la
   descripción ya es «B»: el primer intento se aplicó. En el diálogo, cambiar
   la descripción a «C», dejar de perder respuestas y «Reintentar»: el foco en
   «Guardar», nunca en `body`; el diálogo se cierra sin aviso y el bloque dice
   «C». Después, abrir la entrada, borrarla desde la segunda pestaña, cambiar
   algo y «Guardar»: el diálogo se cierra, la pantalla dice «No se pudo guardar
   la entrada.» y «Esa entrada ya no existe.», y el foco está en la región.

## 8. Deuda conocida del slice

- **El aviso de TT-109 sigue sin «Reintentar».** Si el equipo decide darle id al
  alta manual (ADR 0007), el calendario lo gana sin cambios propios.
- **Volver el borrador a la vista después de una respuesta perdida** cierra sin
  pedido con «Reintentar» o «Guardar», aunque el primer intento se haya
  aplicado: el diálogo compara con la entrada que abrió. La revalidación
  muestra lo aplicado.
- **`slotDraft` corrige el fin solo dentro del mismo día.** Una franja que
  termina a las 00:00 de un día que empieza con un hueco (`America/Santiago`)
  propone esa hora, y el servidor responde `nonexistentClock`.
- **El diálogo del timer no descarta ni duplica.** Descartar sigue en el
  rastreador; duplicar la entrada que corre se rechaza (TT-58).
- **«Detener» con cambios sin guardar queda inactivo** (§1). Si el equipo
  prefiere «guardar y detener», son dos pedidos con dos avisos, y se escribe
  aparte.
- **`editedFields` lleva nombre de la masiva** y ahora sirve a dos
  consumidores. Renombrarlo no cambia conducta.
- **CAL-92 no tiene e2e**: el workspace de los e2e está en Buenos Aires. Lo
  cubren los tests de integración con Madrid (criterio 3).
- **TT-92 se verifica en el componente**, no en pantalla, como en el 6.
- **El recorrido 3 se saltea cerca de la medianoche** de la persona, como el
  recorrido del timer del 8: el reloj emulado no sirve, porque el total, la
  línea y el bloque se anclan en el `serverNow`.
- **El tic de `useElapsedSeconds` redibuja toda la vista cada segundo**
  (`calendar-view.tsx:43`), y en el 8c eso incluye el formulario del diálogo.
  Si se nota, el tic y `nowPosition` bajan a `CalendarGrid`, o `EntryDialog`
  va con `memo`, para que el reloj no redibuje el diálogo.
- **Sin verificar en Clockify** (calendario P-07): lo de §1 marcado como
  decisión nuestra, en especial el diálogo del timer y «Detener».

### Esbozo del slice 8b — gestos de arrastre

**Alcance**: CAL-44 (crear arrastrando en una columna), CAL-50 a CAL-57 (mover y
estirar, ajuste al zoom, cruzar la medianoche, menos de 24 horas de reloj,
mínimo una franja, soltar donde estaba no escribe), CAL-58 (sin asas), CAL-59 a
CAL-63 (hora que no existe, soltar sobre otra, solo columnas visibles, guardado
al soltar, `Esc`), la segunda oración de CAL-89, el «ni soltar» de CAL-30 y
CAL-48, CAL-64, CAL-90 («se estira») y CAL-100.

**Sin cambios en el servidor.** Mover y estirar son `updateEntryTimes` con el
trío completo; crear arrastrando abre el diálogo de alta del 8c con el rango
elegido.

**Piezas**:

- `calendar-gestures.ts`, puro: del gesto al trío, con `minutesToClock`,
  `addDaysToKey` y `shiftClock`, sin aritmética de instantes; el ajuste a la
  franja; los topes de CAL-55 y CAL-56; los minutos que no existen y el piso;
  la distancia de reloj de CAL-51; la igualdad de CAL-57.
- El bloque gana asas de inicio y de fin, solo con `editableTimes` y nunca en el
  timer (CAL-39). Eventos de puntero con captura, `touch-action` para que la
  grilla no se desplace durante el gesto.
- La vista optimista: el bloque queda en su lugar nuevo, atenuado y
  `aria-busy`, como TT-55. Si falla, vuelve, y el aviso «No se pudo guardar el
  horario de la entrada.» queda en la región, con «Reintentar» por red
  (`updateEntryTimes` es idempotente).
- `useTrackerRefresh` gana una pausa mientras dura un arrastre, y la
  revalidación pendiente se pide al soltar (CAL-89).
- Un bloque soltado fuera del período no existe: las columnas visibles son el
  único destino (CAL-61), así que «fuera del período» no aplica al gesto.

**Riesgos que su contrato tiene que resolver**: el desplazamiento automático de
la grilla al arrastrar contra el borde vertical, el gesto en pantallas táctiles
contra el desplazamiento, y el foco después de soltar.

**Depende del 8c en `main`.** El P-03, si se aprueba, entra ahí: es un asa más
sobre el bloque del timer, con `updateRunningStart`.
