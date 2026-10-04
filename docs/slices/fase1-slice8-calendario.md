# Fase 1, slice 8: calendario

Contrato del octavo slice vertical de la fase 1. Módulo `time-entry`, en
`src/modules/time-entry/`, pantalla nueva `/calendario`.

Fuente de los comportamientos: `docs/parity/calendario.md` (CAL-01 a CAL-100),
escrito el 2026-10-02, antes de los slices 6, 7, 9 y 10; este contrato lo
contrasta con el árbol y corrige lo que quedó viejo (§0). Lugar en el plan:
[mapa de la fase 1](fase1-mapa.md), «Slice 8 — Calendario». Decisiones de
arquitectura asociadas:

- [ADR 0013, el diálogo de una entrada guarda en una sola mutación](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md):
  nace acá, **propuesto**.
- [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md) y
  [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md): el diálogo llega
  a sus reglas por las funciones del service de `time-entry`, sin copiarlas.
- [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
  el par del diálogo se valida con `assertTrackable` de `project`, y el
  calendario vive en `time-entry` (§1, «Dónde vive»).
- [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): la zona se resuelve en
  el servidor; el cliente formatea con las mismas funciones y no convierte
  instantes.
- [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): duplicar
  desde el diálogo usa el id elegido por el cliente que ya tiene
  `duplicateEntry`. El alta del calendario es `createManualEntry`, que sigue
  sin él (TT-109).

Decisiones del usuario del 2026-10-04 que el contrato fija: calendario P-04
(«Guardar» todo o nada, con botón), P-01 (crear desde la grilla con un timer
corriendo **se permite**), P-02 (la entrada que cruza la medianoche suma entera
en el día de inicio) y P-06 («Detener» en el diálogo del timer, con la acción de
detener existente). P-03 y P-05 quedan fuera del slice. Perfil P-02 se resuelve
en §1.

Decisiones del equipo que da por tomadas: superposición permitida (TT-82),
fechas futuras aceptadas (P-10), borrado con confirmación y sin deshacer (P-06
del rastreador, TT-61), sin canal abierto y con revalidación periódica (TT-40,
P-11).

## Para el usuario

Cinco cosas que este contrato decide y que conviene que veas antes de arrancar:

1. **El ADR 0013 está propuesto.** El guardado todo o nada del diálogo (P-04) es
   una mutación nueva, `updateEntry`, que recibe solo los grupos de campos que
   la persona tocó y los evalúa con las mismas funciones que las mutaciones de
   un campo. Sin el ADR aceptado, `backend-dev` no arranca §4.
2. **P-01 retira la mitad de servidor de TT-30.** `createManualEntry` hoy
   rechaza el alta con un timer abierto (`service.ts:787-795`). Para que el
   calendario cree con un timer corriendo sin que la misma entrada tenga dos
   reglas según desde dónde se pida, **el servidor deja de rechazar**: una
   entrada cerrada que se superpone con el timer es válida (TT-82), venga de
   donde venga. TT-30 sigue cumpliéndose en el rastreador como regla de su
   interfaz: con un timer a la vista, la barra queda en modo timer y el
   conmutador inactivo, con su texto (`tracker-bar.tsx:293-305`), y el e2e que
   lo fija no cambia. **Lo que cambia**: una pestaña del rastreador en modo
   manual que todavía no vio un timer arrancado en otro lado —hasta 60 s, por
   P-11— agrega la entrada en vez de responder «Detené el timer para agregar
   tiempo a mano.». Tres tests existentes que afirman ese rechazo cambian de
   afirmación (§1, consecuencias). El párrafo de TT-30 en `time-tracker.md` se
   corrige, y la nota de TS-39 en `timesheet.md` sobre `createManualEntry`
   queda vieja a favor del slice 13.
3. **El calendario se parte en 8 y 8b.** El 8 entrega la pantalla entera con
   clic y teclado: vistas, navegación, bloques, totales, línea de ahora, timer
   activo, crear con un clic o con «Agregar entrada», y el diálogo que guarda,
   duplica, borra y detiene. El 8b agrega los gestos de arrastre —crear
   arrastrando, mover y estirar— sobre las mutaciones que ya existen, sin
   cambios en el servidor (§8). Cada parte se despliega sola: sin el 8b, cada
   gesto de arrastre tiene su camino por el diálogo, que es el que exige WCAG
   2.5.7 (CAL-74).
4. **«Detener» con cambios sin guardar queda inactivo**, con el texto «Guardá
   los cambios antes de detener el timer.» Detener es `stopTimer` sin cambios
   (P-06), y guardar y detener juntos serían dos escrituras que P-04 no deja
   encadenar. La alternativa es que «Detener» guarde primero y detenga después,
   con dos desenlaces posibles; si la preferís, cambian solo §5.7 y §5.8.
5. **Perfil P-02 queda en una constante.** La grilla abre desplazada a la línea
   de ahora, o a las 08:00 si el período no contiene hoy (CAL-14). Las 08:00 son
   una constante del cliente y no una preferencia; PF-15 sigue `fuera de
alcance` hasta que la verificación de CAL-14 diga qué hace «inicio del día».
   Si resulta ser esa hora, se cambia solo la constante por la preferencia.

## 0. Precondición de arranque

**El slice 8 se escribe para el árbol con los slices 1 a 7, 9 y 10 en `main`**
(`dd78cd5`, rama `fase1/slice-8-calendario`). El mapa dice «depende de 3, 5 y
7»; no alcanza:

- **Del 3**: `updateEntryTimes`, `updateRunningStart`, `hasEditableTimes`
  (TT-110) y el rechazo de la entrada que corre (TT-111).
- **Del 4**: `duplicateEntry` con el id del cliente (TT-58, CAL-69) y el
  diálogo de borrado (`delete-entry-dialog.tsx`).
- **Del 5**: el primer día de la semana de la persona y `weekKeyLabel`.
- **Del 6**: `entryTimesFor`, `tripleOf`, `sameTriple` y `editedFields`, que
  este slice reusa; `ActionFeedback` con `children`; `useDialogReturnFocus`.
- **Del 7**: zona y formatos de la persona (`TrackerWorkspace`,
  `useDisplayFormats`, `clockLabel`, `dayKeyLabel`), las horas canónicas
  `startClock` y `endClock` de la vista, y `ClockField` con `format`.
- **Del 9 y el 10**: las piezas compartidas de las actions, `assertTrackable`
  (ADR 0010), el proyecto y la tarea en la vista, `ProjectPicker` y
  `TrackingCatalogProvider`.

**Lo que `calendario.md` da por cierto y el árbol ya no:**

- **§18** («el slice 8 va antes del núcleo de proyectos»): el 10 está en `main`.
  El color del proyecto, el proyecto y la tarea en el bloque, en el detalle y en
  el diálogo entran en este slice (CAL-21, CAL-22, CAL-23, CAL-45, CAL-66).
- **§19**: `createManualEntry` **cambia** (P-01, §4.1); las mutaciones de
  `time-entry` revalidan también `/calendario` (§4.6); `editableTimes`,
  `startClock` y `endClock` ya viajan en la vista; el esquema no cambia.
- **CAL-40** nombra `updateRunningStart` como la action del diálogo del timer:
  con P-04 el diálogo guarda con `updateEntry`, que usa la misma regla (§4.4).
- **CAL-47** propone rechazar con TT-30: P-01 lo invierte.

**Supuestos sobre el árbol**, con archivo y línea en `dd78cd5`:

| Supuesto                                                                                                                                 | Dónde                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `TrackerWorkspace = TimeSettings & { createdAt }` y `trackerWorkspaceOf(context)`                                                        | `service.ts:93`, `:96`                                   |
| `workspaceFloorDayKey(workspace)`, el día de creación en la zona de la persona                                                           | `service.ts:106`                                         |
| `toView(row: EntryWithRefs, workspace)` arma `dayDate`, `startClock`, `endClock`, `extraDays`, `editableTimes`, `project` y `task`       | `service.ts:158-182`                                     |
| `readOwnEntry` lee con `for update of time_entry` y autoriza: `not_found`, o `forbidden` con TT-79 sobre la ajena                        | `service.ts:199-236`                                     |
| `assertAssignable(tx, actor, current, requested)` llama a `assertTrackable` solo si el par asigna algo nuevo                             | `service.ts:386-396`                                     |
| `createManualEntry` rechaza con `timer_running` si `findRunning` encuentra el timer                                                      | `service.ts:787-795`                                     |
| `requireClosed`, `resolveExtreme`, `tripleOf`, `sameTriple`, `entryTimesFor`                                                             | `service.ts:862`, `:874`, `:893`, `:901`, `:961`         |
| La regla del inicio del timer vive dentro de `updateRunningStart`: `resolveExtreme`, `nonexistentClock`, `futureTime` contra `now`, piso | `service.ts:1028-1043`                                   |
| `editedFields(row, changes, workspace)` calcula descripción e instantes de una fila cerrada; `valuesOf` arma la constancia               | `service.ts:1140-1167`                                   |
| `getTrackerState` lee en una transacción `repeatable read`                                                                               | `service.ts:1452-1507`                                   |
| `ClosedFields` es `{ description?, startedAt?, endedAt? }`                                                                               | `repository.ts:58-62`                                    |
| `updateTimes` es `rereadIfWritten(updateClosedFields(…))`; `updateStartOfRunning` escribe solo `startedAt`                               | `repository.ts:373-396`                                  |
| `listClosedBetween` filtra por inicio en `[from, to)`                                                                                    | `repository.ts:289-307`                                  |
| Índice `time_entry_workspace_user_started_idx` sobre `(workspace_id, user_id, started_at desc)`                                          | `src/server/db/schema.ts:376-380`                        |
| Las actions de `time-entry` revalidan solo `"/"`                                                                                         | `actions.ts:52-58`                                       |
| `dayKeyInput`, `clockInput`, `description`, `hasProjectForTask`                                                                          | `schema.ts:91`, `:103`, `:51`, `:61`                     |
| `clockToMinutes` y `minutesToClock` son privadas; `dayKeyLabel` arma «Hoy», «Ayer» o «mié, 01/10»                                        | `src/server/time/index.ts:337`, `:347`, `:232-254`       |
| `revalidatePath` en una server action actualiza la pantalla solo si se está viendo la ruta revalidada                                    | `node_modules/next/dist/docs/…/revalidatePath.md:19`     |
| `error.tsx` recibe `retry`, estable desde Next 16.3 (el árbol tiene 16.3.8)                                                              | `node_modules/next/dist/docs/…/error.md:117-153`         |
| La barra impone TT-30 en la interfaz: con un timer, modo timer y conmutador inactivo                                                     | `tracker-bar.tsx:293-305`                                |
| `DateField` exige `minDayKey` y arma la fecha civil con una función local                                                                | `date-field.tsx:24`, `:53-56`                            |
| Enter en `ClockField` llama a `onCommit` y a `onSubmit` en el mismo evento                                                               | `clock-field.tsx:140-146`                                |
| El borrador del trío y sus transiciones (`fromView`, `sameDraft`, `withStart`, `withEnd`, `withDuration`, `withDate`, `draftDuration`)   | `time-draft.ts:45-133`                                   |
| El texto del superíndice de más de un día es una función local de la fila                                                                | `entry-row.tsx:92-96`                                    |
| `useDialogReturnFocus` mueve el foco a mano: Base UI enfoca el primer tabulable del destino de `finalFocus`                              | `use-dialog-return-focus.ts:18-53`                       |
| `useElapsedSeconds(startedAt, serverNow)` y `useGroupTotalLabel` suman el transcurrido corregido por TT-32                               | `elapsed-counter.tsx:25`, `use-group-total.ts:26`        |
| `useAction`, `retryHandlerOf` (solo con `unexpected`) y `useNewId`                                                                       | `src/hooks/use-action.ts:46`, `:107`; `use-new-id.ts:17` |
| `ActionFeedback` exige `message`                                                                                                         | `src/components/action-feedback.tsx:11`                  |
| El aviso de TT-92 está escrito dentro de `tracker-screen.tsx`                                                                            | `tracker-screen.tsx:46-55`                               |
| La navegación tiene «Inicio» y «Proyectos»                                                                                               | `src/components/layout/app-nav.tsx:9-12`                 |
| Cada test e2e abre su sesión; `openSecondTab` abre otra en un contexto nuevo                                                             | `e2e/session.ts:45-53`; `e2e/network.ts:38-48`           |

**El paso 0 del handshake (§6)** es la ronda ordinaria de
`architecture-reviewer`: el contrato se escribe sobre el árbol actual.

## 1. Alcance

Entra, con los identificadores de `calendario.md`:

- **Pantalla y acceso**: CAL-01, CAL-02, CAL-04, CAL-05.
- **Vistas y grilla**: CAL-06, CAL-07, CAL-09, CAL-10, CAL-11, CAL-12, CAL-14.
- **Navegación**: CAL-15 a CAL-19.
- **Cómo se dibuja una entrada**: CAL-20 a CAL-30.
- **Totales**: CAL-31 a CAL-34.
- **Línea de ahora**: CAL-35 a CAL-37.
- **El timer activo**: CAL-38, CAL-40, CAL-41. CAL-39 se cumple sin hacer nada:
  en el 8 no se arrastra ningún bloque.
- **Crear**: CAL-43, CAL-45, CAL-46, CAL-47 (invertido por P-01), CAL-48 (el
  atenuado y el clic sin efecto), CAL-49.
- **El diálogo**: CAL-58 (su parte de diálogo), CAL-65 a CAL-70, CAL-72.
- **Teclado y accesibilidad**: CAL-74 a CAL-78.
- **Estados**: CAL-84 a CAL-88, CAL-89 (su primera oración).
- **Casos borde**: CAL-90 (el dibujo), CAL-91, CAL-93 a CAL-99, sobre el
  diálogo y no sobre gestos.

Entran por arrastre, verificándose por el camino nuevo:

- **TT-66, TT-79, TT-80, TT-92**: los cinco roles editan sus entradas desde el
  diálogo; la ajena y la que ya no existe responden su texto; una membresía
  desactivada ve la grilla en solo lectura.
- **TT-28, TT-29, TT-75, TT-110, TT-111, TT-112, TT-73, TT-77 y el piso del ADR
  0005**: el diálogo pasa por las mismas reglas que la fila y el contador.
- **TT-18 a TT-21, PF-13, PF-14**: los campos de hora y duración del diálogo son
  los del modo manual, con el formato de la persona.
- **TT-58, TT-60 y TT-61**: duplicar y borrar desde el menú del diálogo. TT-65
  no entra: descartar el timer sigue en el rastreador.
- **TT-89, TT-90, TT-109**: avisos de dos partes, «Reintentar» por red salvo en
  el alta.

### Dónde vive

**El calendario es una segunda pantalla del módulo `time-entry`**, no un módulo
propio. Su lectura es `getCalendarState` en `time-entry/service.ts`, sus
componentes van en `time-entry/components/calendar/`, y sus mutaciones son las
del módulo. Un módulo `calendar` no tendría tablas propias: leería `time_entry`
desde su repository, que el ADR 0010 reserva para lo que se muestra de otro
módulo con un join, o llamaría al service de `time-entry` para mostrar, que el
ADR 0010 no permite. Y repetiría `toView`, que es donde se resuelve todo lo que
depende de la zona. El subdirectorio separa los archivos del rastreador de los
del calendario sin cambiar la regla de capas.

### Lo que el slice decide y que la paridad tiene que registrar

- **P-01 cerrado, CAL-47 invertido.** Crear desde la grilla con un timer
  corriendo se permite, sin aviso. `createManualEntry` deja de rechazar con
  `timer_running`. `adaptar`: Clockify recomienda detener el timer antes, y no
  documenta que lo impida.
- **TT-30 pierde su mitad de servidor.** Queda como regla de la interfaz del
  rastreador; la oración «Es el mismo texto con el que responde la validación
  del servidor cuando el pedido llega igual desde una pestaña desactualizada»
  sale, y se agrega que esa pestaña agrega la entrada.
- **P-02 cerrado, CAL-32 como estaba.** La entrada suma entera en el día de
  inicio; la columna siguiente dibuja horas que su total no cuenta.
- **P-04 cerrado, CAL-67.** «Guardar» aplica juntos los grupos de campos que la
  persona tocó, con `updateEntry` (ADR 0013). Sin cambios, «Guardar» cierra sin
  pedido. Cerrar con cambios los descarta sin preguntar. Si «Guardar» falla
  porque la entrada ya no existe o el timer ya se detuvo, el diálogo se cierra y
  el aviso queda en la pantalla.
- **P-06 cerrado, CAL-40.** El diálogo del timer edita descripción, proyecto y
  tarea, e inicio, y guarda con «Guardar» (`updateEntry`, con la regla de
  `updateRunningStart`). «Detener» es `stopTimer`. Con cambios sin guardar,
  «Detener» queda inactivo con «Guardá los cambios antes de detener el
  timer.». El diálogo del timer no tiene menú: duplicar la entrada que corre se
  rechaza (TT-58) y descartarla es del rastreador (TT-65).
- **P-03 y P-05**: siguen abiertos con su propuesta, fuera del 8.
- **Perfil P-02 y CAL-14.** La grilla abre con la línea de ahora una hora por
  debajo del borde superior si el período contiene hoy, y con las 08:00 arriba
  si no. Las 08:00 son una constante. PF-15 sigue `fuera de alcance`; perfil
  P-02 pasa a depender de la respuesta de CAL-14 en calendario P-07.
- **CAL-11.** El zoom son dos botones, «Acercar» y «Alejar», en la esquina
  superior izquierda, con el tamaño de franja a la vista.
- **CAL-17.** La URL no se reescribe: `?semana=` con un día que no es inicio de
  semana se interpreta como la semana que lo contiene, y los enlaces de la
  pantalla siempre llevan el inicio normalizado. Un día cuyo período no se puede
  navegar —el anterior o el siguiente quedan fuera de los años de cuatro
  cifras— se trata como inválido y lleva a la semana actual.
- **CAL-15 y CAL-07.** En la vista día las flechas dicen «Día anterior» y «Día
  siguiente», y el rango se rotula «Hoy», «Ayer» o «mié, 01/10». El selector
  «Semana / Día» son dos enlaces: «Día» abre hoy si la semana lo contiene y si
  no su primer día; «Semana» abre la semana del día que se ve.
- **CAL-16.** El selector del rango es un calendario de mes sin cota; elegir un
  día lleva a su período.
- **CAL-21 y CAL-26.** Solo el segmento del día de inicio lleva el horario; los
  otros segmentos de la misma entrada muestran la descripción.
- **CAL-22.** El relleno es el color del proyecto en tono claro, con un borde
  izquierdo en el color pleno y el texto en el color de primer plano del tema:
  los tonos 600 de la paleta no dan contraste AA con texto blanco. Sin
  proyecto, el relleno neutro del tema.
- **CAL-23 y CAL-77.** El detalle es un `Tooltip`: aparece al pasar el puntero y
  al enfocar, y se cierra con `Esc`. En pantallas táctiles no aparece; el
  diálogo muestra lo mismo.
- **CAL-26 y CAL-76.** De una entrada con varios segmentos visibles, solo el
  primero es un botón en el orden de `Tab`; los otros abren el mismo diálogo con
  el puntero y quedan ocultos para el lector de pantalla.
- **CAL-36.** La línea de ahora avanza con el tiempo transcurrido desde el
  minuto que mandó el servidor, corregido por TT-32. En el minuto siguiente a un
  cambio de horario puede quedar una hora corrida hasta la próxima
  revalidación, a lo sumo 60 s (P-11).
- **CAL-43 y CAL-74.** El clic en una franja propone su inicio y una franja de
  largo. «Agregar entrada» propone hoy si está a la vista y si no el primer día
  del período, nunca antes del piso; la hora es la franja de ahora si el día es
  hoy, y las 08:00 si no.
- **CAL-46.** El aviso nombra el día de inicio con el rótulo de columna («sáb,
  03/10»), nunca «Hoy» ni «Ayer». En la vista día: «La entrada quedó el …, fuera
  del día que estás viendo.», con el enlace «Ir a ese día».
- **CAL-46 y TT-109.** El aviso de respuesta perdida en el alta dice «fijate en
  el calendario» donde la barra dice «fijate en la lista»: es la misma causa con
  el lugar donde mirar.
- **CAL-68.** «Duplicar» y «Borrar» del menú cierran el diálogo al elegirse; su
  aviso, si fallan, queda en la pantalla.
- **CAL-75.** El nombre accesible suma el proyecto y la tarea cuando los hay.
- **CAL-87.** `/calendario` tiene su `error.tsx`, con «No se pudo cargar el
  calendario.» y «Reintentar».
- **El corte 8/8b.** CAL-44, CAL-50 a CAL-57, CAL-59 a CAL-63, la segunda
  oración de CAL-89, el «ni soltar» de CAL-30 y CAL-48, las asas de CAL-58,
  CAL-90 «se estira», CAL-64 y CAL-100 quedan para el 8b, especificados como
  están.

**Lo registra `parity-analyst` antes del merge** (§6), con la sección «Slice 8»
y la lista «Lo que queda» en `calendario.md`.

### Queda afuera

- **Los gestos de arrastre**: slice 8b (§8).
- **P-03** (asa del inicio del timer) y **P-05** (días laborables, CAL-13).
- **Lo `fuera de alcance` de `calendario.md`**: CAL-03, CAL-08, CAL-42, CAL-71,
  CAL-73, CAL-79 a CAL-83.
- **«Reintentar» en el alta** (TT-109): sigue la decisión pendiente del estado
  de la fase.
- **Etiquetas y facturable en el diálogo**: slice 11, que suma sus grupos a
  `updateEntry` (§4.8).

### Consecuencias sobre código ya entregado

| Archivo                                    | Qué cambia                                                                                                                                                      | Qué hay que volver a probar                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/server/time/index.ts`                 | Exporta `clockToMinutes` y `minutesToClock`; suma `weekdayLabel` y `nonexistentMinutes`; `dayKeyLabel` usa `weekdayLabel` sin cambiar su salida.                | `time.test.ts` entero                                                |
| `time-entry/schema.ts`                     | `updateEntryInput` y su resultado; los parámetros y el estado del calendario.                                                                                   | `schema.test.ts` entero                                              |
| `time-entry/service.ts`                    | `createManualEntry` sin el rechazo de TT-30; `runningStartFor` sale de `updateRunningStart`; `valuesOf` suma el par; `updateEntry` y `getCalendarState` nuevas. | TT-18, TT-28, TT-29, TT-72, TT-75, TT-112, ADR 0006, la masiva del 6 |
| `time-entry/repository.ts`                 | `ClosedFields` suma el par; `updateTimes` pasa a `updateClosedEntry`; `updateStartOfRunning` pasa a `updateRunningEntry`, con campos; `listClosedOverlapping`.  | `updateEntryTimes`, `updateRunningStart`, `bulkEditEntries`          |
| `time-entry/actions.ts`                    | Revalida `"/"` y `"/calendario"`; suma `updateEntry`.                                                                                                           | `actions.integration.test.ts` entero                                 |
| `service.integration.test.ts`              | El caso de `:1375-1397` pasa a afirmar que el alta con el timer abierto crea la entrada y el timer sigue corriendo.                                             | —                                                                    |
| `audit.integration.test.ts`                | El caso de `:505-528` pasa a afirmar las dos constancias, `timeEntry.start` y `timeEntry.createManual`.                                                         | —                                                                    |
| `actions.integration.test.ts`              | El caso de `:237-252` usa otro rechazo de dominio (`tooShort`); cada `toEqual(["/", …])` pasa a la lista de dos rutas por llamada.                              | —                                                                    |
| `src/components/layout/app-nav.tsx`        | Suma «Calendario» después de «Inicio».                                                                                                                          | `e2e/profile.spec.ts` (`goToTrackerByNav`)                           |
| `src/components/action-feedback.tsx`       | `message` opcional: sin él, no hay descripción.                                                                                                                 | TT-90 del rastreador, del perfil y de la masiva                      |
| `time-entry/components/date-field.tsx`     | La fecha civil sale de `civil-date.ts`, que comparte con el selector del rango.                                                                                 | TT-18, TT-56, el diálogo de la masiva                                |
| `time-entry/components/tracker-screen.tsx` | El aviso de TT-92 pasa a `InactiveMembershipNotice`, que comparte con el calendario.                                                                            | `tracker.spec.ts`                                                    |
| `time-entry/components/labels.ts`          | Suma `extraDaysText`, movida de `entry-row.tsx:92-96` sin cambios: la usan la fila y el bloque.                                                                 | TT-51 en la fila                                                     |
| `time-entry/components/entry-row.tsx`      | Importa `extraDaysText` de `labels.ts`.                                                                                                                         | TT-51 en la fila                                                     |

**Ninguna otra afirmación de un test existente cambia.** Las de arriba son las
únicas, y cada una tiene su motivo en P-01 o en la revalidación de §4.6.

## 2. Cambios de esquema

**Ninguno.** La lectura nueva usa `time_entry_workspace_user_started_idx` para
la cota superior (`started_at < to`) y filtra la inferior (`ended_at > from`)
sobre las filas de la persona anteriores al fin del período. Sin duración máxima
(TT-74) no hay cota inferior para el inicio que se pueda usar en el índice; el
costo y su umbral están en §8.

## 3. Acciones de permisos nuevas

**Ninguna.** La unión `Action` de `src/server/permissions` no cambia.

| Operación del calendario             | Acción de `can()`                                                 | Recurso                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Ver la grilla                        | ninguna: se leen solo las propias (CAL-02)                        | —                                                                                          |
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

Salen las líneas `service.ts:787-795`: la lectura de `findRunning` y el
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
  .object({ projectId: z.uuid().nullable(), taskId: z.uuid().nullable() })
  .refine(hasProjectForTask, taskNeedsProject);

/** El trío de una entrada cerrada, entero: los tres se interpretan juntos (ADR 0006). */
const entryTriple = z.object({ date: dayKeyInput, start: clockInput, end: clockInput });

/** Día y hora del inicio del timer que corre (TT-28, TT-42). */
const runningStart = z.object({ date: dayKeyInput, start: clockInput });

/**
 * Los grupos de campos que la persona tocó en el diálogo (ADR 0013). Ausente
 * no cambia; presente reemplaza, también "" en la descripción. Estricto: un
 * grupo que este slice no conoce —las etiquetas, antes del 11— se rechaza con
 * el texto de `unexpected`. `times` es de una entrada cerrada y `runningStart`
 * de la que corre: nunca los dos.
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
   - La descripción y el par no dependen del estado.
3. **La descripción y el horario**:
   - Cerrada: `editedFields(row, { description, ...times }, workspace)`, la
     función de la masiva (`service.ts:1140`), con los dos grupos en la forma
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
6. **Una sola escritura**, con los campos que cambiaron: `updateClosedEntry` o
   `updateRunningEntry` según la fila. El par se escribe siempre entero
   (`pairOf(project)`), nunca una sola de sus dos columnas. Si devuelve
   `undefined` —el bloqueo lo hace imposible—, el código de la mutación de un
   campo: `timer_running` en la cerrada, `already_stopped` en la abierta.
7. `recordAudit` con `timeEntry.update`, `previousValue` y `nextValue` con
   solo los campos escritos: `description`, `projectId`, `taskId`,
   `startedAt`, `endedAt`. `valuesOf` suma las dos claves del par.
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
`updateEntryProject`. Lo prueban los criterios 15 a 17 (§7).

### 4.4 `runningStartFor`

Lo que hoy hace `updateRunningStart` entre la lectura y la escritura
(`service.ts:1028-1043`) pasa a una función privada:

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

### 4.5 Los errores de `updateEntry`

| Causa                                                                   | Código            | Texto                                   |
| ----------------------------------------------------------------------- | ----------------- | --------------------------------------- |
| Entrada mal formada, grupo desconocido, `times` y `runningStart` juntos | `validation`      | el de Zod, o `unexpected`               |
| Sin ningún grupo                                                        | `validation`      | `bulkNoChanges`                         |
| Membresía desactivada                                                   | `forbidden`       | `forbidden`                             |
| La entrada ya no existe (TT-80)                                         | `not_found`       | `notFound`                              |
| Es de otra persona (TT-79)                                              | `forbidden`       | `forbiddenOtherOwner`                   |
| Trío sobre la entrada que corre (TT-111)                                | `timer_running`   | `runningEntryTimes`                     |
| Inicio de timer sobre una cerrada (CAL-41)                              | `already_stopped` | `alreadyStopped`                        |
| Trío de una entrada de más de un día que cambia (TT-110)                | `validation`      | `multiDayTimes`                         |
| Hora que no existe (TT-112)                                             | `validation`      | `nonexistentClock`                      |
| Menos de un minuto (TT-73)                                              | `validation`      | `tooShort`                              |
| Día fuera de las cuatro cifras                                          | `validation`      | `invalidDate`                           |
| Antes de la creación del workspace                                      | `validation`      | `beforeWorkspace`                       |
| Inicio del timer en el futuro (TT-29, TT-75)                            | `validation`      | `futureTime`                            |
| Proyecto o tarea no disponibles (TT-77)                                 | `not_found`       | `projectUnavailable`, `taskUnavailable` |
| Tarea sin proyecto (TT-70)                                              | `validation`      | `taskNeedsProject`                      |
| Red o error inesperado                                                  | `unexpected`      | `unexpected`                            |

### 4.6 Revalidación

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

### 4.7 Reintento y auditoría

- **`updateEntry` llega a un punto fijo** (ADR 0013): el segundo intento
  encuentra cada grupo como se pidió, no escribe ni registra y responde la misma
  vista. Ofrece «Reintentar» con `unexpected`.
- **`createManualEntry` no** (TT-109), sin cambios.
- **Una constancia por «Guardar»**, `timeEntry.update`, con los campos escritos.
  Un pedido rechazado o sin cambios no deja ninguna.

### 4.8 Lo que el slice 11 suma, sin que este lo construya

- **`updateEntryChanges` gana grupos opcionales**: `tags` y `billable`, con la
  misma regla. Por eso el objeto es estricto desde ahora.
- **El algoritmo de §4.3 gana pasos** después del par, y la escritura, sus
  columnas; las etiquetas, su sentencia sobre la tabla de unión en la misma
  transacción.
- **El diálogo gana campos** con sus grupos en `entry-dialog-draft.ts`.

## 5. Contrato de lectura y pantalla

### 5.1 `getCalendarState`

```ts
// src/modules/time-entry/schema.ts

/** Los parámetros de `/calendario` (CAL-17), cada uno con su `safeParse`. */
export const calendarWeekParams = z.object({ semana: dayKeyInput });
export const calendarViewParams = z.object({ vista: z.literal("dia") });

export const CALENDAR_VIEWS = ["week", "day"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Minutos de reloj de un día, `[from, to)`, entre 0 y 1440. */
const minuteRange = z.object({
  from: z.number().int().min(0).max(1440),
  to: z.number().int().min(0).max(1440),
});

export const calendarDayView = z.object({
  /** "2026-10-01". */
  date: z.string(),
  /** «jue, 01/10», con año si no es el de hoy (CAL-09). Nunca «Hoy» ni «Ayer». */
  label: z.string(),
  isToday: z.boolean(),
  /** Anterior a la creación del workspace: atenuado y sin crear (CAL-48). */
  beforeWorkspace: z.boolean(),
  /** Exacto: lo que suman las entradas cerradas que empiezan ese día (CAL-32, P-02). */
  closedSeconds: z.number().int().min(0),
  /** Lo que no existe ese día por el cambio de horario (CAL-30). */
  missingMinutes: z.array(minuteRange),
});

export const calendarState = z.object({
  /** Referencia del desfase de TT-32. */
  serverNow: z.iso.datetime(),
  todayKey: z.string(),
  /** Minuto del día de `serverNow` en la zona de la persona: la línea de ahora. */
  nowMinute: z.number().int().min(0).max(1439),
  minDayKey: z.string(),
  canTrack: z.boolean(),
  view: z.enum(CALENDAR_VIEWS),
  /** Primer día del período, ya normalizado. */
  periodStart: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TT-47); en la vista día, «Hoy», «Ayer» o el día. */
  periodLabel: z.string(),
  previousStart: z.string(),
  nextStart: z.string(),
  /** El período que contiene hoy, para «Hoy». */
  todayStart: z.string(),
  /** Lo que abren «Día» y «Semana» (§1). */
  dayViewStart: z.string(),
  weekViewStart: z.string(),
  days: z.array(calendarDayView),
  /** Las cerradas propias que se superponen con el período, por inicio y después por id. */
  entries: z.array(timeEntryView),
  /** El timer que corre, esté o no a la vista: el cliente decide qué segmentos dibuja. */
  running: timeEntryView.nullable(),
  /** Suma de `closedSeconds` de los días: el total del período sin el timer (CAL-33). */
  closedSeconds: z.number().int().min(0),
});

export type CalendarDayView = z.infer<typeof calendarDayView>;
export type CalendarState = z.infer<typeof calendarState>;
```

```ts
// src/modules/time-entry/service.ts
export type CalendarRequest = {
  readonly view: CalendarView;
  /** El `semana` de la URL ya validado, o `null`. */
  readonly day: string | null;
};

export async function getCalendarState(
  actor: Actor,
  workspace: TrackerWorkspace,
  request: CalendarRequest,
  now: Date = new Date(),
): Promise<CalendarState>;
```

El período, en una función privada y pura:

- **Ancla**: `request.day ?? todayKey`. Semana: inicio
  `weekStartKey(ancla, workspace.weekStart)` y siete días. Día: el ancla.
- **Navegable**: el inicio menos un período y el fin más un período tienen que
  ser claves válidas (`parseDayKey`), y el instante del fin no puede pasar del
  año 9999 UTC (`isAfterYear9999`). Si no, el período es el que contiene hoy.
  `parseDayKey` ya rechaza los años anteriores al 100, así que el borde de abajo
  sale de la misma regla.
- `previousStart` y `nextStart` restan o suman siete días o uno.
  `todayStart` es `weekStartKey(todayKey, …)` o `todayKey`. `weekViewStart` es
  `weekStartKey(periodStart, …)`; `dayViewStart` es `todayKey` si la semana lo
  contiene y `periodStart` si no.
- `periodLabel`: `weekKeyLabel(periodStart, todayKey, weekStart, formats.date)`
  o `dayKeyLabel(periodStart, todayKey, formats.date)`.

La lectura, con `from = startOfDayKey(periodStart, zona)` y
`to = startOfDayKey(día siguiente al último, zona)`, **en una transacción
`repeatable read`**, como `getTrackerState`: sin el mismo snapshot, una parada
que commitea en el medio dejaría la entrada como timer y como cerrada a la vez.

1. `findRunning(workspaceId, userId, tx)`.
2. `listClosedOverlapping(workspaceId, userId, from, to, tx)` (§5.2).

Después, sin consultas:

- **Cada día**: `label = weekdayLabel(día, todayKey, formats.date)`,
  `isToday`, `beforeWorkspace = día < workspaceFloorDayKey(workspace)`,
  `closedSeconds` con las entradas cuyo `dayDate` es ese día, y
  `missingMinutes = nonexistentMinutes(día, zona)`.
- `entries`: `toView` de cada fila. `running`: `toView` del timer o `null`.
- `nowMinute = clockToMinutes(formatClock(now, zona))`.
- `canTrack`: `can(actor, "timeEntry.own.create", ownTimeEntryResource(actor))`.

**Los segmentos de cada bloque no viajan.** La vista ya trae lo que dependía de
la zona —`dayDate`, `startClock`, `endClock`, `extraDays`—, y partirla en días
es aritmética civil que el cliente hace sin zona (§5.5). El fin de una entrada
cerrada cae el día `addDaysToKey(dayDate, extraDays)` a las `endClock`.

**El total de la semana es el del rastreador** para la misma semana: las dos
pantallas suman las cerradas por día de inicio, así que `closedSeconds` del
calendario y `closedSeconds` de la semana en `TrackerState` dan lo mismo
(criterio 5).

### 5.2 La consulta nueva

```ts
// src/modules/time-entry/repository.ts
/**
 * Las entradas cerradas de la persona que se superponen con `[from, to)`:
 * empiezan antes de `to` y terminan después de `from`. Una que termina
 * exactamente en `from` no se superpone (CAL-26, CAL-94). Con su proyecto y su
 * tarea, por inicio ascendente y después por id: el orden de `Tab` (CAL-76).
 */
listClosedOverlapping(
  workspaceId: string,
  userId: string,
  from: Date,
  to: Date,
  tx?: Executor,
): Promise<readonly EntryWithRefs[]>;
```

Filtra por `workspace_id` y `user_id` de la sesión, `ended_at is not null`,
`started_at < to` y `ended_at > from`, con `selectWithRefs`.

Y los cambios de las escrituras:

```ts
/** Lo que se escribe en una fila cerrada: solo lo que cambia; el par, siempre entero. */
export type ClosedFields = {
  readonly description?: string;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
  readonly projectId?: string | null;
  readonly taskId?: string | null;
};

/** Lo que se escribe en la fila abierta. */
export type RunningFields = Omit<ClosedFields, "endedAt">;

/** `updateTimes` generalizada: la fila cerrada, releída con sus referencias. */
updateClosedEntry(tx, target, fields: ClosedFields): Promise<EntryWithRefs | undefined>;

/** `updateStartOfRunning` generalizada: la fila abierta, releída con sus referencias. */
updateRunningEntry(tx, target, fields: RunningFields): Promise<EntryWithRefs | undefined>;
```

`updateEntryTimes` llama a `updateClosedEntry(tx, target, times)` y
`updateRunningStart` a `updateRunningEntry(tx, target, { startedAt })`. Salen
`updateTimes` y `updateStartOfRunning`: dos funciones con el mismo papel serían
una duplicación. `updateClosedFields`, sin relectura, sigue siendo la de la
masiva.

### 5.3 Lo que suma `src/server/time`

El módulo sigue importable desde el navegador (ADR 0012).

```ts
/** Minutos desde las 00:00 de una hora canónica "HH:mm", o `null`. Hoy privada. */
export function clockToMinutes(clock: string): number | null;

/** La hora canónica de un minuto del día, dando la vuelta a las 24 h. Hoy privada. */
export function minutesToClock(minutes: number): string;

/**
 * El rótulo de una columna: día de la semana abreviado y fecha en el formato
 * de la persona, «jue, 01/10», con año si no es el de `todayKey`. Es la parte
 * de `dayKeyLabel` que no es «Hoy» ni «Ayer», y `dayKeyLabel` la usa.
 */
export function weekdayLabel(
  dayKey: string,
  todayKey: string,
  format: DateFormat,
): string;

export type MinuteRange = { readonly from: number; readonly to: number };

/**
 * Los minutos de reloj que no existen ese día en esa zona, `[from, to)`. Vacío
 * en un día de 24 h o de 25 h. En un día más corto, el hueco se ubica por
 * búsqueda binaria del instante en que cambia el desplazamiento, sin probar
 * minuto por minuto.
 */
export function nonexistentMinutes(
  dayKey: string,
  timeZone: string,
): readonly MinuteRange[];
```

Casos de `time.test.ts`: Madrid 2026-03-29 → `[{ from: 120, to: 180 }]`; Madrid
2026-10-25 → `[]`; Buenos Aires cualquier día → `[]`; un adelanto de 30 minutos
(`Australia/Lord_Howe`, 02:00 → 02:30) y uno a la medianoche
(`America/Santiago`, 00:00 → 01:00), con la fecha confirmada con `tzOffset`
antes de fijarla en el test. Y para cada minuto del hueco, `instantFromLocal`
da `null`; para el anterior y el siguiente, no. `weekdayLabel` con los cuatro
formatos y con un día de otro año; `dayKeyLabel` sigue dando lo mismo que hoy.

### 5.4 La ruta, la URL y el zoom

```tsx
// src/app/(app)/calendario/page.tsx
export default async function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  const session = await requireSession();
  const zoom = parseCalendarZoom((await cookies()).get(CALENDAR_ZOOM_COOKIE)?.value);
  const params = await searchParams;
  const week = calendarWeekParams.safeParse(params);
  const view = calendarViewParams.safeParse(params);
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarScreen
        actor={session.actor}
        workspace={trackerWorkspaceOf(session)}
        request={{
          view: view.success ? "day" : "week",
          day: week.success ? week.data.semana : null,
        }}
        initialZoom={zoom}
      />
    </Suspense>
  );
}
```

- **URL**: `/calendario?semana=AAAA-MM-DD`, y `&vista=dia` en la vista día. Un
  `semana` repetido llega como arreglo y no pasa el esquema, como en el ADR 0008. `calendarHref(view, start)` es la única función que arma la URL.
- **Zoom** (CAL-11, CAL-12): `CalendarZoom = 60 | 30 | 15 | 5`, cookie
  `clock.calendar-zoom` por navegador y por un año, como `tracker-mode.ts`. Un
  valor desconocido es 60. Se lee en el servidor para dibujar el zoom recordado
  desde la primera respuesta.
- **`error.tsx`** (CAL-87): «No se pudo cargar el calendario.» y un botón
  «Reintentar» que llama a `retry`. Nunca una grilla vacía que se confunda con
  CAL-84.
- **`CalendarSkeleton`**: `role="status"`, `aria-busy`, «Cargando el
  calendario».

`CalendarScreen` es un Server Component, como `TrackerScreen`: lee
`getCalendarState` y `getTrackingCatalog(actor)` con `Promise.all`, dibuja
`InactiveMembershipNotice` si `!canTrack` (TT-92) y monta
`DisplayFormatsProvider` con `workspace.formats` y `TrackingCatalogProvider`
alrededor de `CalendarView`.

### 5.5 La grilla

**Geometría.** Constantes de `calendar-layout.ts`: `SLOT_HEIGHT_PX = 48` por
franja, `MIN_BLOCK_HEIGHT_PX = 22` (CAL-24) y `DEFAULT_SCROLL_CLOCK = "08:00"`.
Un minuto mide `SLOT_HEIGHT_PX / zoom` píxeles. La grilla son 24 horas de reloj
(CAL-30), con el eje rotulado cada hora con `clockLabel` en el formato de la
persona (CAL-10) y una línea por franja.

**Segmentos** (CAL-26 a CAL-28, CAL-94), una función pura:

```ts
export type Segment = {
  readonly date: string;
  /** Minutos de reloj, `[from, to]`, entre 0 y 1440. */
  readonly from: number;
  readonly to: number;
  /** Es el día de inicio: lleva el horario con su superíndice (CAL-26). */
  readonly startsHere: boolean;
  /** Es el primero visible: es el botón (CAL-76). */
  readonly firstVisible: boolean;
};

export function entrySegments(
  entry: Pick<TimeEntryView, "dayDate" | "startClock" | "endClock" | "extraDays">,
  days: readonly string[],
): readonly Segment[];
```

- Para cada día del período entre `dayDate` y `addDaysToKey(dayDate,
extraDays)`: `from` es el minuto del inicio en el día de inicio y 0 en los
  demás; `to` es el minuto del fin en el día del fin y 1440 en los demás.
- **Una entrada que termina a las 00:00 no dibuja nada en ese día** (CAL-26).
- **`to = max(to, from)`**: en la hora repetida, una entrada de 02:30 en la
  primera pasada a 02:15 en la segunda tiene el fin de reloj antes que el
  inicio; se dibuja con la altura mínima.
- Los días fuera del período se recortan (CAL-28).

`runningSegments(running, now, days)` hace lo mismo con el fin en `now`
(CAL-38, CAL-93).

**Ahora** (CAL-35 a CAL-37):

```ts
export type NowPosition = { readonly date: string; readonly minute: number };

/** El minuto del servidor más lo transcurrido, pasando de día a la medianoche. */
export function nowPosition(
  anchor: {
    readonly todayKey: string;
    readonly nowMinute: number;
    readonly serverNow: string;
  },
  elapsedSeconds: number,
): NowPosition;
```

`elapsedSeconds` sale de `useElapsedSeconds(serverNow, serverNow)`, que ya
corrige el desfase (TT-32), sumado a los segundos que `serverNow` llevaba de su
minuto. **El cliente no usa la zona** (ADR 0012): la línea es aritmética sobre
el minuto que mandó el servidor, y cada revalidación (P-11) la vuelve a anclar.
La línea va solo en la columna de `now.date` si está a la vista; es decorativa
(`aria-hidden`) y lleva `data-calendar-now`.

**Superposición** (CAL-25, CAL-60, CAL-99):

```ts
export type PlacedBlock<Item> = {
  readonly item: Item;
  readonly top: number;
  readonly height: number;
  readonly lane: number;
  readonly lanes: number;
};

export function layoutColumn<
  Item extends { readonly key: string; readonly from: number; readonly to: number },
>(items: readonly Item[], zoom: CalendarZoom): readonly PlacedBlock<Item>[];
```

Se ordena por `from` y después por `key`. La altura es la de reloj con el mínimo
de CAL-24. Un grupo es un conjunto conectado por superposición **de lo
dibujado**, con la altura mínima incluida, así ningún bloque tapa a otro. Dentro
del grupo cada bloque toma el primer carril libre, y todos los del grupo miden
`1 / lanes` del ancho. El segmento del timer entra como uno más.

**Cada columna** es un `role="group"` con `aria-labelledby` hacia su encabezado
—el rótulo del día y su total— y `data-calendar-day={date}`. El encabezado de
hoy va con el color de acento (CAL-09). Los días con `beforeWorkspace` y los
minutos de `missingMinutes` se dibujan atenuados (CAL-30, CAL-48, CAL-85).

**El bloque** (CAL-20 a CAL-24, CAL-75):

- **El primer segmento visible es un `<button>`** con `data-entry-block={id}` y
  el nombre accesible «{descripción o Sin descripción}, {weekdayLabel del
  inicio}, de {inicio} a {fin}{superíndice}, {duración}{, Proyecto o Proyecto:
  Tarea}». El superíndice es `extraDaysText(extraDays)`, el texto de TT-51 que
  la fila ya usa, movido a `labels.ts`. Para el timer: «…, desde las {inicio},
  en curso». Las horas, con `clockLabel` y el formato de la persona.
- **Los otros segmentos** son `div` con el mismo `data-entry-block`,
  `aria-hidden`, sin `tabIndex`, que abren el mismo diálogo con el puntero.
- **Contenido, lo que entre en este orden**: la descripción (o «Sin
  descripción» en gris), el proyecto y la tarea con su punto, y en el segmento
  del día de inicio `{inicio} – {fin}` con su superíndice y la duración. Los
  otros segmentos, solo la descripción. El timer muestra «{inicio} – en curso»
  y el transcurrido en `h:mm`.
- **Color** (CAL-22): el relleno es el color del proyecto mezclado al 20 % con
  el fondo (`color-mix`), con un borde izquierdo de 3 px en el color pleno
  (`paletteColor(project.color).value`), y el texto en el color de primer plano.
  Sin proyecto, el relleno neutro del tema con borde. El timer, además, borde
  punteado.
- **Detalle** (CAL-23, CAL-77): un `Tooltip` en el botón y en los segmentos
  ocultos, con la descripción entera, el horario con superíndice, la duración, y
  el proyecto y la tarea.
- **Sin animaciones de posición** (CAL-78): la regla se cumple sin código
  porque nada se anima.

**Totales** (CAL-31 a CAL-34): el de cada columna es `useGroupTotalLabel` con
`closedSeconds` del día, las entradas que empiezan ese día, las que se están
borrando, y el inicio del timer si `running.dayDate` es ese día. El de la
semana, lo mismo con `state.closedSeconds` y las entradas que empiezan en el
período. En la vista día no hay total de semana. Formato `h:mm` (PF-20).

**Desplazamiento inicial** (CAL-14): al montarse la grilla, si `now.date` está
en el período, la línea de ahora queda una hora por debajo del borde superior;
si no, las `DEFAULT_SCROLL_CLOCK` arriba. La grilla lleva `key` con la vista y
el período, así cada navegación vuelve a desplazar y una revalidación no.

**Clic en una franja libre** (CAL-43): con `canTrack`, un clic sobre el fondo
de una columna abre el alta con la franja tocada, ajustada hacia abajo al zoom
(`minuteAt`). Sin efecto sobre un día anterior al piso, sobre un minuto que no
existe o sin `canTrack`. Las franjas no son controles (CAL-76): el alta por
teclado es «Agregar entrada».

### 5.6 La barra del calendario

Arriba de la grilla, en este orden:

- **«Día anterior» / «Semana anterior»** y **«Día siguiente» / «Semana
  siguiente»**: enlaces (`Link`) a `calendarHref(view, previousStart)` y
  `nextStart`, con ícono y nombre accesible.
- **«Hoy»**: enlace a `todayStart`, con `aria-current` si ya es el período.
- **El rango** (CAL-15, CAL-16): un botón con `periodLabel` y el nombre «Elegir
  fecha: {periodLabel}», que abre un calendario de mes sin cota. Elegir un día
  navega a `calendarHref(view, día)`; el servidor normaliza la semana. Al
  cerrar, el foco vuelve al botón.
- **«Semana» / «Día»** (CAL-07): dos enlaces a `weekViewStart` y
  `dayViewStart`, el de la vista actual con `aria-current="page"`.
- **El total de la semana** (CAL-33): «Total {h:mm}», solo en la vista semana.
- **«Agregar entrada»** (CAL-74): solo con `canTrack`.

**Zoom**, en la esquina superior izquierda de la grilla (CAL-11): «Acercar»
(60 → 30 → 15 → 5) y «Alejar», cada uno `aria-disabled` en su extremo y sin
actuar; el tamaño a la vista («1 h», «30 min», «15 min», «5 min») y un
`role="status"` con «Franjas de 1 hora» o «Franjas de N minutos». Cambiarlo
escribe la cookie y no navega.

### 5.7 El diálogo de una entrada

Un solo componente, `EntryDialog`, con tres modos. **No llama a ninguna
action**: avisa lo que la persona eligió, y `CalendarView` es dueño de los
pedidos. El borrador vive en una `ref` que cada `onCommit` actualiza y que
«Guardar» lee: Enter en un `ClockField` confirma y guarda en el mismo evento
(`clock-field.tsx:140-146`), como `entry-times-editor.tsx:66`.

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
- **Abajo a la izquierda**, el menú «Acciones de la entrada» (CAL-68):
  «Duplicar» y «Borrar». Abajo a la derecha, «Cancelar» y «Guardar».
- «Guardar» calcula los cambios con `changesOf(entry, draft)` (§6): la
  descripción si su recorte difiere, el par si `!samePair`, el trío si
  `editableTimes` y `!sameDraft(draft, fromView(entry))`. **Sin cambios, cierra
  sin pedido.**

**El timer activo** (CAL-40), título «Timer en curso»:

- «Descripción», «Proyecto», y el inicio: `DateField` con `maxDayKey={todayKey}`
  y «Hora de inicio». El fin, como texto: «Fin: en curso», y el transcurrido.
- «Detener», «Cancelar» y «Guardar». **Sin menú.**
- «Guardar» manda `description`, `project` y `runningStart` si cambiaron.
- **«Detener» queda `aria-disabled`** mientras el borrador tiene cambios, con
  «Guardá los cambios antes de detener el timer.» asociado por
  `aria-describedby` y a la vista. Sin cambios, avisa `onStop`.

**Agregar** (CAL-43, CAL-45, CAL-74), título «Agregar entrada»: los campos de
editar, sin menú; «Cancelar» y «Agregar». «Agregar» queda `aria-disabled` con
duración cero, con `timeEntryMessages.tooShort` asociado, como la barra manual
(`manual-bar.tsx:70-80`). El borrador inicial sale de `slotDraft` o de
`addEntryDraft` (§6).

**Membresía desactivada** (CAL-05, TT-92): el diálogo de una entrada abre en
solo lectura —todos los campos como texto, sin menú, solo «Cerrar»— y no hay
alta.

**Inactivo es `aria-disabled` y no actuar**, nunca `disabled`: «Guardar»
mientras el pedido viaja, «Agregar» con duración cero o en vuelo, «Detener»
con cambios, los dos botones de zoom en su extremo.

### 5.8 Los pedidos y sus avisos

`CalendarView` es dueño de los cinco `useAction`: `createManualEntry`,
`updateEntry`, `stopTimer`, `duplicateEntry` (con `useNewId` por la entrada de
origen) y `deleteEntry` (con la vista optimista de los ids que se borran). Los
avisos tienen dos lugares, según sobrevivan o no al diálogo:

| Operación                       | Mientras viaja                                       | Bien                                                     | Mal                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Guardar»                       | diálogo abierto, «Guardar» `aria-disabled`           | se cierra; foco al bloque (§5.9); CAL-46 si quedó afuera | en el diálogo: «No se pudo guardar la entrada.» y el mensaje; con `unexpected`, «Reintentar». Con `not_found` o `already_stopped`, se cierra y el aviso va a la pantalla |
| «Agregar»                       | diálogo abierto, «Agregar» `aria-disabled`           | se cierra; foco al bloque nuevo; CAL-46 si quedó afuera  | en el diálogo: con `unexpected`, el aviso de TT-109 sin «Reintentar»; si no, «No se pudo agregar la entrada.» y el mensaje                                               |
| «Detener»                       | el diálogo se cierra al elegir                       | foco al bloque, ya cerrado                               | en la pantalla: «No se pudo detener el timer.»; con `unexpected`, «Reintentar»                                                                                           |
| «Duplicar»                      | el diálogo se cierra al elegir                       | foco al bloque de la copia                               | en la pantalla: `trackerLabels.entryNotDuplicated`; con `unexpected`, «Reintentar» con el mismo id (ADR 0007)                                                            |
| «Borrar» (después de confirmar) | el bloque se va de forma optimista; foco a la región | —                                                        | el bloque vuelve; en la pantalla: `trackerLabels.entryNotDeleted`; con `unexpected`, «Reintentar»                                                                        |

- **La región de la pantalla**: `<section aria-label="Calendario"
tabIndex={-1}>`, siempre montada, con la barra, la grilla y el lugar de los
  avisos. Es el destino del foco cuando lo que lo tenía se va.
- **CAL-46**: si la vista que devuelve «Guardar» o «Agregar» tiene su `dayDate`
  fuera del período, `ActionFeedback` con `tone="info"`, el título «La entrada
  quedó el {weekdayLabel}, fuera de la semana que estás viendo.» (o «…del día
  que estás viendo.»), sin `message`, y el enlace «Ir a esa semana» a
  `calendarHref("week", entry.weekStart)` o «Ir a ese día» a
  `calendarHref("day", entry.dayDate)`. La operación siguiente lo baja.
- **«Reintentar» se va con su aviso** (`use-action.ts:59`): el `onRetry` mueve
  el foco y después reintenta. En el diálogo, a «Guardar», que queda
  `aria-disabled` mientras viaja; en la pantalla, a la región. No se pasa
  `retryDisabled`, que es `disabled` nativo.
- **Una operación nueva baja los avisos anteriores**, como `clearNotices` de la
  barra.

### 5.9 Foco y teclado

- **Abrir**: un bloque abre su diálogo con clic, `Enter` o `Espacio` (CAL-74).
  Al abrir, el foco va a «Descripción». Quien abrió queda guardado: el botón del
  bloque, «Agregar entrada», o nadie si fue un clic en una franja.
- **Cancelar, `Esc`, clic afuera** (CAL-49): sin pedido; el foco vuelve a quien
  abrió, o a la región si no hay. `finalFocus` devuelve `false` y el foco se
  mueve a mano en una microtarea, como `useDialogReturnFocus`: Base UI enfoca el
  primer tabulable del destino, y la región no es tabulable.
- **Después de «Guardar», «Agregar», «Detener» o «Duplicar» con éxito**,
  `CalendarView` fija `focusEntryId` con el id de la entrada que importa (la
  editada, la creada, la detenida, la copia). El diálogo se cierra con el foco
  en la región. Cuando la grilla dibuja el botón de esa entrada —en el mismo
  render o después de la revalidación, en otro día o con otra clave—, lo enfoca
  si el foco está en la región o en `body`, y avisa para que se limpie. Si la
  entrada quedó fuera del período, el foco se queda en la región, con el aviso
  de CAL-46.
- **«Borrar» del menú** cierra el diálogo sin mover el foco y abre
  `DeleteEntryDialog`; cancelar el borrado devuelve el foco al botón del bloque
  o a la región. Confirmar lo deja en la región.
- **`Tab`** recorre la barra, el zoom y los bloques en orden de columna y de
  inicio (CAL-76). Los atajos del rastreador no se montan (CAL-73).
- **Un control con foco nunca pasa a `disabled`**: lo pierde a `body`.

### 5.10 Revalidación

`CalendarView` llama a `useTrackerRefresh()` (CAL-41, CAL-89): al enfocar, al
volver a ser visible y cada 60 s mientras está visible. El diálogo guarda la
entrada que se abrió y su borrador: una revalidación con la entrada cambiada o
borrada no lo cierra ni lo pisa (CAL-72). Gana la última escritura por grupo de
campos (ADR 0013).

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
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
/home/maxi/program/clock/src/app/(app)/calendario/page.tsx                                     (nuevo)
/home/maxi/program/clock/src/app/(app)/calendario/error.tsx                                    (nuevo)
/home/maxi/program/clock/src/components/layout/app-nav.tsx
/home/maxi/program/clock/src/components/action-feedback.tsx
/home/maxi/program/clock/src/components/ui/tooltip.tsx                                         (nuevo, generado)
/home/maxi/program/clock/src/modules/time-entry/components/civil-date.ts                       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/inactive-membership-notice.tsx      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-screen.tsx        (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-view.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-toolbar.tsx       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/period-picker.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-grid.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.tsx         (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.test.tsx    (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx           (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.test.tsx      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.ts      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.test.ts (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-layout.ts         (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-layout.test.ts    (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-zoom.ts           (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-zoom.test.ts      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-href.ts           (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-href.test.ts      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/labels.ts                  (nuevo)
```

El tooltip se genera con el CLI de shadcn, como está configurado en
`components.json` (`base-nova`). Si el generador suma dependencias,
`package.json` y `package-lock.json` entran en la lista solo para ese cambio.
Antes de escribir `page.tsx` y `error.tsx`, la guía de Next del árbol
(`node_modules/next/dist/docs/`): `PageProps`, `searchParams` como promesa y
`retry`.

### tests-slice8

```
/home/maxi/program/clock/e2e/calendar.spec.ts   (nuevo)
/home/maxi/program/clock/e2e/calendar-page.ts   (nuevo)
/home/maxi/program/clock/e2e/days.ts
```

`calendar-page.ts` reúne los localizadores de la pantalla; `days.ts` suma lo que
falte para armar días y semanas de la persona. Los de `tracker-page.ts` se
importan, no se copian.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/calendario.md
/home/maxi/program/clock/docs/parity/time-tracker.md
/home/maxi/program/clock/docs/parity/perfil.md
/home/maxi/program/clock/docs/parity/timesheet.md
```

Antes del merge, lo que enumera §1 en «Lo que el slice decide»: en
`calendario.md`, P-01, P-02, P-04 y P-06 a «Cerrados», CAL-40, CAL-46, CAL-47 y
CAL-67 reescritos, §18 y §19 corregidas y la sección «Slice 8» con «Lo que
queda» (el 8b); en `time-tracker.md`, TT-30; en `perfil.md`, P-02 y la nota de
PF-15; en `timesheet.md`, la oración de TS-39 sobre `createManualEntry`.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`,
`src/server/session.ts`, `src/server/action.ts`, `src/server/audit.ts`,
`src/hooks/`, `src/modules/project/`, `src/modules/profile/`,
`src/app/(app)/page.tsx`, `src/app/(app)/layout.tsx`, y los componentes del
rastreador salvo `date-field.tsx`, `tracker-screen.tsx`, `labels.ts` y
`entry-row.tsx`, con los cambios de §1: `tracker-bar.tsx`, `mode-switch.tsx`,
`manual-bar.tsx`, `entry-list.tsx`, `day-group.tsx`, `time-draft.ts`,
`use-dialog-return-focus.ts`, `use-tracker-refresh.ts`, `use-group-total.ts`,
`elapsed.ts`, `elapsed-counter.tsx`, `delete-entry-dialog.tsx`. Los e2e
existentes no cambian. Los contratos y correcciones anteriores son históricos.
El mapa y el estado de la fase los actualiza team-lead.

### Handshake de orden

0. **Antes de implementar**: `architecture-reviewer` hasta aprobar, y el usuario
   acepta el ADR 0013 y lo de «Para el usuario».
1. **Primer commit de `backend-dev`**: lo de §5.3 en `src/server/time` con sus
   tests; los esquemas y tipos de §4.2 y §5.1; las firmas de `updateEntry`
   (action y service) y de `getCalendarState`. La suite existente sigue verde.
   Avisa a `frontend-dev`.
2. **`frontend-dev` arranca en paralelo** por lo que no depende del servidor:
   el tooltip generado, `civil-date.ts`, `calendar-zoom.ts`,
   `calendar-href.ts`, `labels.ts`, `extraDaysText` y la navegación. **Primero
   de todo**, una prueba de que `ProjectPicker` y `DateField` abren, eligen y
   devuelven el foco dentro de un `Dialog` de Base UI; si no, se avisa antes de
   seguir, porque cambia §5.7.
3. **`tests-slice8` arranca en paralelo** con el spec, y confirma que falla por
   la funcionalidad y no por el arnés.
4. Con el primer commit en la rama, `frontend-dev` sigue con
   `calendar-layout.ts` y `entry-dialog-draft.ts` con sus tests, y después la
   pantalla. `backend-dev` sigue con P-01 y sus tres tests, la revalidación y las
   afirmaciones de rutas, el repository, `runningStartFor`, `updateEntry`,
   `getCalendarState` y sus tests.
5. `parity-analyst`, antes del merge.

### Responsabilidades que no se leen en el nombre del archivo

- **`calendar-layout.ts`** es la geometría como funciones puras, sin React ni
  zona: las constantes de §5.5, `entrySegments`, `runningSegments`,
  `nowPosition`, `layoutColumn` y además:

  ```ts
  /** El minuto de una posición vertical, ajustado hacia abajo a la franja. */
  export function minuteAt(offsetPx: number, zoom: CalendarZoom): number;
  export function isMissing(minute: number, ranges: readonly MinuteRange[]): boolean;
  /** CAL-14: el minuto que queda arriba al montar. */
  export function initialScrollMinute(now: NowPosition, days: readonly string[]): number;
  /** CAL-43: la franja tocada y una franja de largo. */
  export function slotDraft(date: string, minute: number, zoom: CalendarZoom): TimeDraft;
  /** CAL-74: hoy si está a la vista, si no el primer día, nunca antes del piso. */
  export function addEntryDraft(
    days: readonly string[],
    now: NowPosition,
    minDayKey: string,
    zoom: CalendarZoom,
  ): TimeDraft;
  ```

  Las horas salen de `minutesToClock`; el día siguiente, de `addDaysToKey`.
  `TimeDraft` es el de `time-draft.ts`.

- **`entry-dialog-draft.ts`** es el borrador de los tres modos y lo que cada uno
  manda, puros:

  ```ts
  export type EntryDialogDraft = {
    readonly description: string;
    readonly selection: ProjectSelection;
    readonly times: TimeDraft;
  };
  export function draftOfEntry(entry: TimeEntryView): EntryDialogDraft;
  /** Los grupos que cambiaron respecto de la vista; `null` si ninguno (§5.7). */
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

  `changesOf` nunca manda el trío de una entrada con `editableTimes` en falso.
  El slice 11 suma sus grupos acá.

- **`calendar-view.tsx`** es el dueño de la pantalla en el cliente: los cinco
  `useAction`, la vista optimista del borrado, el diálogo abierto (modo, entrada
  o borrador, quien abrió), la confirmación del borrado, los avisos de la
  región, `focusEntryId`, el zoom con su cookie y `useTrackerRefresh`. Arma
  `nowPosition` una vez y se lo pasa a la grilla y a la barra.
- **`calendar-grid.tsx`** dibuja eje, encabezados, columnas, franjas atenuadas,
  bloques y línea de ahora a partir de `calendar-layout.ts`. Avisa el clic en
  una franja (`onSlot(date, minute)`) y en un bloque (`onOpen(id, opener)`).
  Enfoca el bloque de `focusEntryId` según §5.9.
- **`calendar-block.tsx`** es un segmento: el botón o el `div` oculto, el
  contenido de §5.5 y el tooltip.
- **`calendar-block.test.tsx`** y **`entry-dialog.test.tsx`** son tests de
  componente con `renderToStaticMarkup`, envueltos en `DisplayFormatsProvider` y
  `TrackingCatalogProvider`, como `project-picker.test.tsx`. El del bloque
  afirma el nombre accesible de CAL-75 —cerrada, que cruza la medianoche, con
  proyecto y tarea, el timer— y que el segmento que no es el primero no es
  botón y está oculto. El del diálogo dibuja el cuerpo sin el portal, como
  `BulkEditForm`: los campos en solo lectura con `canTrack` en falso, y con
  `editableTimes` en falso.
- **`entry-dialog.tsx`** dibuja los tres modos de §5.7 con la primitiva `Dialog`,
  y el cuerpo es un componente aparte para que el test lo dibuje sin el portal.
  Avisa `onSave(changes)`, `onAdd(input)`, `onStop()`, `onDuplicate()`,
  `onDelete()`, y recibe el aviso de error como `ReactNode`.
- **`period-picker.tsx`**: `Popover` con `Calendar`, sin `disabled`, que navega
  con `router.push`. Las fechas civiles con `civil-date.ts`.
- **`civil-date.ts`**: la fecha civil de un `dayKey` para dibujar el calendario
  y la clave de una fecha elegida, que hoy son locales de `date-field.tsx`.
- **`inactive-membership-notice.tsx`**: el aviso de TT-92 con los textos que hoy
  tiene `tracker-screen.tsx:46-55`, sin cambios. Lo usan las dos pantallas.
- **`labels.ts`** (el del rastreador) suma `extraDaysText(extraDays)`, movida
  tal cual de `entry-row.tsx:92-96`.
- **`calendar/labels.ts`**, `calendarLabels`:

  | Clave             | Texto                                                                                                              |
  | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
  | `nav`             | «Calendario»                                                                                                       |
  | `region`          | «Calendario»                                                                                                       |
  | `loading`         | «Cargando el calendario»                                                                                           |
  | `loadFailed`      | «No se pudo cargar el calendario.»                                                                                 |
  | `previousWeek`    | «Semana anterior»                                                                                                  |
  | `nextWeek`        | «Semana siguiente»                                                                                                 |
  | `previousDay`     | «Día anterior»                                                                                                     |
  | `nextDay`         | «Día siguiente»                                                                                                    |
  | `today`           | «Hoy»                                                                                                              |
  | `pickDate`        | función: «Elegir fecha: {rango}»                                                                                   |
  | `weekView`        | «Semana»                                                                                                           |
  | `dayView`         | «Día»                                                                                                              |
  | `total`           | «Total»                                                                                                            |
  | `addEntry`        | «Agregar entrada»                                                                                                  |
  | `zoomIn`          | «Acercar»                                                                                                          |
  | `zoomOut`         | «Alejar»                                                                                                           |
  | `zoomShort`       | función: «1 h» / «N min»                                                                                           |
  | `zoomStatus`      | función: «Franjas de 1 hora» / «Franjas de N minutos»                                                              |
  | `running`         | «en curso»                                                                                                         |
  | `blockLabel`      | función: el nombre de CAL-75                                                                                       |
  | `addTitle`        | «Agregar entrada»                                                                                                  |
  | `editTitle`       | «Editar entrada»                                                                                                   |
  | `runningTitle`    | «Timer en curso»                                                                                                   |
  | `description`     | «Descripción»                                                                                                      |
  | `duration`        | «Duración»                                                                                                         |
  | `runningEnd`      | «Fin: en curso»                                                                                                    |
  | `add`             | «Agregar»                                                                                                          |
  | `save`            | «Guardar»                                                                                                          |
  | `stop`            | «Detener»                                                                                                          |
  | `close`           | «Cerrar»                                                                                                           |
  | `entryActions`    | función: «Acciones de la entrada «{nombre}»»                                                                       |
  | `saveBeforeStop`  | «Guardá los cambios antes de detener el timer.»                                                                    |
  | `entryNotSaved`   | «No se pudo guardar la entrada.»                                                                                   |
  | `entryNotAdded`   | «No se pudo agregar la entrada.»                                                                                   |
  | `addLostTitle`    | «No sabemos si la entrada se guardó.»                                                                              |
  | `addLostMessage`  | «Se perdió la respuesta del servidor. Antes de volver a agregarla, fijate en el calendario: puede haberse creado.» |
  | `timerNotStopped` | «No se pudo detener el timer.»                                                                                     |
  | `outsideWeek`     | función: «La entrada quedó el {día}, fuera de la semana que estás viendo.»                                         |
  | `outsideDay`      | función: «La entrada quedó el {día}, fuera del día que estás viendo.»                                              |
  | `goToWeek`        | «Ir a esa semana»                                                                                                  |
  | `goToDay`         | «Ir a ese día»                                                                                                     |

  Los textos que ya existen se importan de donde están y no se copian:
  `trackerLabels.startTime`, `endTime`, `noDescription`, `endsNextDay`,
  `multiDayTimesReadOnly`, `entryNotDuplicated`, `entryNotDeleted`;
  `entryNameOf`, `entryProjectLabel` y `extraDaysText`;
  `timeEntryMessages.tooShort`.

## 7. Criterios de aceptación

1. **CAL-01** — La navegación tiene «Calendario» después de «Inicio», lleva a
   `/calendario` y queda con `aria-current="page"`.
2. **CAL-06, CAL-07, CAL-17, CAL-18** — La vista semana tiene siete columnas
   desde el primer día de la persona; `?semana=` con un día de mitad de semana
   dibuja la semana que lo contiene; un día inválido, repetido o no navegable
   (`9999-12-31`, `0100-01-01`) dibuja la semana actual; `&vista=dia`, una
   columna.
3. **CAL-15, CAL-16** — Las flechas, «Hoy» y el selector del rango llevan al
   período que corresponde, con la URL normalizada; el rango dice «Esta semana»,
   «Semana anterior» o las fechas, y en la vista día «Hoy», «Ayer» o el día.
4. **CAL-02, CAL-28, la lectura** — `entries` trae las cerradas propias que se
   superponen con el período: la que empezó antes y la que termina después
   están; la que termina exactamente al principio y la que empieza exactamente
   al final, no; la de otra persona, no. El timer viaja aparte y nunca en
   `entries`.
5. **CAL-31 a CAL-33, P-02** — Cada día suma las cerradas que empiezan en él;
   una de 22:00 a 02:00 suma entera al día de inicio y nada al siguiente; el
   total de la semana es el mismo número que `closedSeconds` de esa semana en
   `getTrackerState`.
6. **CAL-34, CAL-38** — El timer suma al total de su día y al de la semana, y
   los dos suben con el contador; su bloque crece hasta la línea de ahora.
7. **CAL-09, CAL-19** — Los rótulos de columna salen del formato de fecha de la
   persona, el de hoy marcado; con otra zona, la misma entrada cae en otra
   columna o a otra altura.
8. **CAL-26, CAL-27, CAL-94, segmentos** — `entrySegments` da un segmento por
   día tocado, recortado al período; la que termina a las 00:00 no dibuja en el
   día siguiente; la de más de un día tiene días de alto completo; la hora
   repetida no da altura negativa.
9. **CAL-24, CAL-25** — `layoutColumn` reparte el ancho entre las que se pisan,
   también por la altura mínima, y deja a las demás en ancho completo.
10. **CAL-30** — `nonexistentMinutes` da los casos de §5.3; la grilla atenúa
    esos minutos y un clic ahí no abre nada.
11. **CAL-48, CAL-85** — Un día anterior al piso se dibuja atenuado y un clic
    ahí no abre nada; un período entero anterior, todo atenuado.
12. **CAL-35 a CAL-37** — La línea de ahora está solo en la columna de hoy y no
    existe en un período sin hoy; `nowPosition` pasa de día a la medianoche.
13. **CAL-43, CAL-45, CAL-74, crear** — Un clic en una franja abre «Agregar
    entrada» con ese día, la franja y una franja de largo; «Agregar entrada»
    abre con hoy o el primer día del período; «Agregar» crea con
    `createManualEntry` y el bloque aparece.
14. **P-01** — `createManualEntry` con un timer abierto crea la entrada cerrada,
    el timer sigue abierto y quedan las dos constancias; desde el calendario,
    con un timer corriendo, la entrada se crea. TT-30 en el rastreador no
    cambia: el e2e de `manual-entry.spec.ts:82-129` sigue verde sin tocarlo.
15. **CAL-67, `updateEntry` sobre una cerrada** — Para cada caso de horario y un
    trío distinto del de la fila, el resultado es el de `updateEntryTimes` sobre
    una copia sembrada igual: mismos instantes, mismos rechazos, también con la
    hora repetida y la que no existe en Madrid y con segundos que el ADR 0006
    conserva.
16. **CAL-40, `updateEntry` sobre el timer** — Para cada inicio distinto del
    guardado, el resultado es el de `updateRunningStart` sobre una copia:
    `futureTime`, `nonexistentClock`, `beforeWorkspace` y los instantes.
17. **El par** — `updateEntry` con un proyecto no disponible responde lo mismo
    que `updateEntryProject` (TT-77) y no escribe nada más; con el mismo par, no
    consulta a `project`.
18. **Todo o nada** — Descripción, par y trío válidos se escriben en una sola
    sentencia con una constancia `timeEntry.update` que tiene solo los campos
    escritos. Con la descripción y un trío rechazado, no se escribe la
    descripción; con la descripción y un par rechazado, tampoco. Con un horario
    inválido y un proyecto no disponible, responde el rechazo del horario.
19. **El estado de la fila** — Un trío sobre la entrada que corre responde
    `timer_running` con `runningEntryTimes`; un inicio sobre una cerrada,
    `already_stopped`; la ajena abierta o de más de un día, `forbidden` con
    TT-79 antes que su estado o su horario; la que no existe, `not_found`.
20. **CAL-58** — Una entrada de más de un día abre con el horario en solo
    lectura y su texto; guardar solo la descripción anda; `updateEntry` con su
    mismo trío no la rechaza ni la reescribe.
21. **Punto fijo** — Repetir un `updateEntry` aplicado no escribe, no registra y
    responde la misma vista; sin cambios reales, tampoco. Desde la pantalla, un
    «Guardar» cuya respuesta se perdió se reintenta con «Reintentar», el foco
    queda en «Guardar» y termina sin aviso.
22. **CAL-40, P-06** — En el diálogo del timer, «Guardar» cambia descripción e
    inicio juntos; «Detener» lo detiene; con cambios sin guardar, «Detener»
    tiene `aria-disabled="true"` y su texto asociado.
23. **CAL-68 a CAL-70** — «Duplicar» deja dos bloques lado a lado y el foco en la
    copia; «Borrar», después de confirmar, saca el bloque y deja el foco en la
    región.
24. **CAL-72** — Con la entrada borrada en otra pestaña, «Guardar» cierra el
    diálogo y la pantalla muestra «No se pudo guardar la entrada.» con «Esa
    entrada ya no existe.», con el foco en la región.
25. **CAL-46** — Guardar una entrada con fecha de otra semana muestra el aviso
    con su día y el enlace, que lleva a esa semana con el bloque a la vista.
26. **CAL-74 a CAL-77, accesibilidad** — Cada entrada es un botón con el nombre
    de CAL-75; de una entrada partida, solo el primer segmento visible es botón;
    el tooltip aparece con el foco y se cierra con `Esc`; `Tab` recorre los
    bloques en orden cronológico.
27. **CAL-05, TT-92** — Con `canTrack` en falso, el diálogo es de solo lectura y
    no hay «Agregar entrada».
28. **CAL-11, CAL-12, CAL-14** — El zoom cambia el tamaño de franja y sobrevive a
    la recarga; la grilla abre con la línea de ahora a la vista en la semana
    actual y con las 08:00 arriba en otra.
29. **CAL-87** — Con la lectura fallando, la página dibuja el error con
    «Reintentar», no una grilla.
30. **Revalidación** — Cada action de `time-entry` revalida `"/"` y
    `"/calendario"`, también con error.
31. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
    `main` pasa, cambiando solo las afirmaciones listadas en §1.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                              | Qué afirma                                                                                    |
| -------- | -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1        | e2e                        | `e2e/calendar.spec.ts`                                                               | el recorrido 1                                                                                |
| 2        | integración + e2e          | `service.integration.test.ts`; `e2e/calendar.spec.ts`                                | `periodStart`, `days` y `view` con cada parámetro; el recorrido 1                             |
| 3        | integración + unidad + e2e | `service.integration.test.ts`; `calendar-href.test.ts`; `e2e/calendar.spec.ts`       | los enlaces y rótulos de la vista; la URL; el recorrido 1                                     |
| 4        | integración                | `service.integration.test.ts`                                                        | los seis bordes, con una entrada ajena sembrada y el timer                                    |
| 5        | integración + e2e          | `service.integration.test.ts`; `e2e/calendar.spec.ts`                                | los totales contra `getTrackerState` con el mismo `now`; los recorridos 2 y 4                 |
| 6        | e2e                        | `e2e/calendar.spec.ts`                                                               | el recorrido 5                                                                                |
| 7        | integración + unidad       | `service.integration.test.ts`; `time.test.ts`                                        | `label` con dos formatos; la misma entrada con dos zonas                                      |
| 8        | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar.spec.ts`                                    | cada caso de §5.5; el recorrido 4                                                             |
| 9        | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar.spec.ts`                                    | carriles y grupos, con un bloque de segundos; el recorrido 6                                  |
| 10       | unidad + integración       | `time.test.ts`; `service.integration.test.ts`                                        | los casos de §5.3; `missingMinutes` del día de Madrid                                         |
| 11       | integración                | `service.integration.test.ts`                                                        | `beforeWorkspace` del día anterior al piso y del piso                                         |
| 12       | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar.spec.ts`                                    | `nowPosition` en el último minuto; el recorrido 5                                             |
| 13       | unidad + e2e               | `calendar-layout.test.ts`; `entry-dialog-draft.test.ts`; `e2e/calendar.spec.ts`      | `slotDraft`, `addEntryDraft` con el piso; `createInputOf`; el recorrido 2                     |
| 14       | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/calendar.spec.ts`   | el alta con el timer abierto; las dos constancias; el recorrido 5                             |
| 15       | integración                | `service.integration.test.ts`                                                        | por cada caso, `updateEntry` contra `updateEntryTimes` sobre una copia                        |
| 16       | integración                | `service.integration.test.ts`                                                        | por cada caso, `updateEntry` contra `updateRunningStart` sobre una copia                      |
| 17       | integración                | `service.integration.test.ts`                                                        | archivado, privado sin acceso y tarea hecha; el mismo par sin consulta                        |
| 18       | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/calendar.spec.ts`   | escrituras y constancias; el orden; el recorrido 3                                            |
| 19       | integración                | `service.integration.test.ts`; `permissions.integration.test.ts`                     | cada estado; la ajena abierta y la de más de un día; membresía `inactive`                     |
| 20       | unidad + integración       | `entry-dialog.test.tsx`; `entry-dialog-draft.test.ts`; `service.integration.test.ts` | el horario como texto; `changesOf` sin trío; el mismo trío sin escribir                       |
| 21       | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/calendar.spec.ts`   | el segundo intento sin escrituras ni constancias; el recorrido 7                              |
| 22       | unidad + e2e               | `entry-dialog-draft.test.ts`; `e2e/calendar.spec.ts`                                 | `runningChangesOf`; el recorrido 5                                                            |
| 23       | e2e                        | `e2e/calendar.spec.ts`                                                               | el recorrido 6                                                                                |
| 24       | e2e                        | `e2e/calendar.spec.ts`                                                               | el recorrido 7                                                                                |
| 25       | e2e                        | `e2e/calendar.spec.ts`                                                               | el recorrido 2                                                                                |
| 26       | unidad + e2e               | `calendar-block.test.tsx`; `e2e/calendar.spec.ts`                                    | los nombres y el segmento oculto; el tooltip y `Tab` en los recorridos 4 y 6                  |
| 27       | unidad                     | `entry-dialog.test.tsx`                                                              | el cuerpo en solo lectura                                                                     |
| 28       | unidad + e2e               | `calendar-zoom.test.ts`; `calendar-layout.test.ts`; `e2e/calendar.spec.ts`           | la cookie; `initialScrollMinute`; el recorrido 1                                              |
| 29       | revisión manual            | —                                                                                    | la revisión de frontend fuerza la lectura a fallar y mira la página (§8)                      |
| 30       | integración                | `actions.integration.test.ts`                                                        | las dos rutas en cada action, también con error; `updateEntry` con su traducción y su permiso |
| 31       | unidad + integración + e2e | las suites existentes                                                                | en verde, con solo las afirmaciones de §1 cambiadas                                           |

**Los criterios 15 y 16 son los que prueban que la regla no se duplicó**, con el
patrón del criterio 7 del slice 6: dos copias de cada entrada, una editada con
`updateEntry` y la otra con la mutación de un campo, comparando instantes o
código y texto del rechazo. El trío o el inicio tienen que ser distintos de los
de la fila: con uno igual, `updateEntry` no evalúa y la otra sí, y la diferencia
es a propósito. Un mutante que copie la regla y se desvíe en un caso tiene que
caer acá.

**El criterio 19 es el del orden** que cayó en el 6 y en el 10: la ajena se
siembra abierta y de más de un día, así el mutante que mira el estado o el
horario antes de autorizar responde otra cosa.

**El criterio 18 sobre el orden** se cruza con un proyecto archivado y un trío
con `tooShort`: el mutante que evalúa el par primero responde TT-77.

### Recorridos obligatorios de `e2e/calendar.spec.ts`

Dueño: `tests-slice8`. **Siete tests, uno por recorrido**: cada uno abre una
sola sesión, y el endpoint de sesión ya responde 429 con la suite completa. La
segunda pestaña es `page.context().newPage()`, que comparte la cookie y no pide
otra sesión; `openSecondTab` no se usa. Las entradas van en la **semana
anterior** salvo donde el recorrido pide hoy: así ninguna hora queda en el
futuro y nunca falta un día anterior en la semana. Las respuestas se esperan con
`withServerAction`; los editores en portal se buscan en `page`; sin
`page.clock.install()`.

1. **Navegar** (criterios 1, 2, 3, 28). Entrar por «Calendario» de la
   navegación; siete columnas, la de hoy marcada, «Esta semana». «Semana
   anterior»: la URL con su `semana` y el rótulo «Semana anterior». «Hoy»
   vuelve. «Día»: una columna, rótulo «Hoy». «Semana» vuelve. El selector del
   rango lleva a la semana de un día de hace un mes. «Acercar» pasa a «30 min»;
   recargar y ver «30 min».
2. **Crear con un clic y fuera del período** (criterios 5, 13, 25). En la semana
   anterior, clic en la franja de las 10:00 del miércoles: el diálogo con ese
   día, 10:00 y 11:00. Escribir la descripción y «Agregar»: el bloque con
   «10:00 – 11:00», el total de la columna «1:00» y el de la semana. En `/`, el
   encabezado de esa semana dice el mismo total. Volver, abrir el bloque,
   cambiar la fecha a un día de hace tres semanas y guardar: el aviso con ese
   día y «Ir a esa semana», que lleva a la semana con el bloque a la vista.
3. **Todo o nada** (criterio 18). Con un proyecto sembrado con
   `e2e/database.ts`, una entrada de 09:00 a 10:00 del martes anterior. Abrirla,
   cambiar descripción, proyecto y fin a 10:30, «Guardar»: el bloque con los
   tres. Abrirla de nuevo, cambiar la descripción y poner el inicio igual al
   fin, «Guardar»: el aviso «No se pudo guardar la entrada.» con «La entrada
   tiene que durar al menos un minuto.» en el diálogo. «Cancelar»: el bloque
   conserva la descripción anterior.
4. **Medianoche** (criterios 5, 8, 26). Una entrada de 22:00 a 02:00 del jueves
   anterior: dos segmentos, uno por columna; el total del viernes no la cuenta.
   Hay un solo botón con su nombre, «…de 22:00 a 02:00 (termina un día
   después)…»; con el foco en él, el tooltip, y `Esc` lo cierra. Un clic en el
   segmento del viernes abre «Editar entrada» con 22:00, 02:00 y el `+1`.
5. **El timer** (criterios 6, 12, 14, 22). Arrancar un timer en `/` con «en
   curso»; en el calendario, su bloque «…en curso» en la columna de hoy y la
   línea de ahora solo en esa columna; en la semana anterior no hay línea. En la
   semana anterior, crear una entrada con un clic: se crea (P-01). Volver, abrir
   el bloque del timer: cambiar la descripción y ver «Detener» con
   `aria-disabled="true"` y «Guardá los cambios antes de detener el timer.»;
   «Guardar»: el bloque con la descripción nueva. Abrirlo y «Detener»: el
   bloque ya no dice «en curso» y tiene el foco.
6. **Duplicar y borrar** (criterios 9, 23, 26). Abrir una entrada, «Acciones de
   la entrada», «Duplicar»: dos bloques con el mismo nombre, uno al lado del
   otro (cajas sin superponerse) y el foco en la copia. `Tab` desde el primero
   llega al segundo. Abrir la copia, «Borrar», confirmar: queda un bloque y el
   foco está en la región «Calendario».
7. **Respuesta perdida y entrada que ya no existe** (criterios 21, 24). Abrir una
   entrada, cambiar la descripción, perder la respuesta de «Guardar» con
   `loseActionResponses` y retener las revalidaciones con `holdRefreshes`: el
   aviso con «Reintentar». En una segunda pestaña del mismo contexto, la
   descripción nueva ya está: el primer intento se aplicó. «Reintentar»: el
   foco en «Guardar», nunca en `body`; el diálogo se cierra sin aviso. Después,
   abrir la entrada, borrarla desde la segunda pestaña, cambiar algo y
   «Guardar»: el diálogo se cierra, la pantalla dice «No se pudo guardar la
   entrada.» y «Esa entrada ya no existe.», y el foco está en la región.

## 8. Deuda conocida del slice

- **La lectura recorre la historia de la persona.** `started_at < to and
ended_at > from` usa el índice para la cota superior y filtra la inferior: en
  una semana vieja lee las entradas anteriores a esa semana. Con diez entradas
  por día hábil son unas 2500 por año y por persona. Si el plan de la consulta
  pasa de 20 ms en la base de producción, la salida es un índice por rango
  (`tstzrange` con GiST) en una migración propia.
- **`error.tsx` no tiene test automático.** `renderToStaticMarkup` no ejercita
  `retry`, y forzar una falla de lectura en e2e pide una ruta de prueba que el
  proyecto no tiene. La revisión de frontend lo comprueba a mano.
- **Las otras rutas siguen sin `error.tsx`**: la deuda del estado de la fase se
  achica en una ruta.
- **El aviso de TT-109 sigue sin «Reintentar».** Si el equipo decide darle id al
  alta manual (ADR 0007), el calendario lo gana sin cambios propios.
- **La línea de ahora puede quedar corrida una hora** durante el minuto que
  sigue a un cambio de horario, hasta la próxima revalidación.
- **El tooltip no existe en pantallas táctiles**: el detalle está en el diálogo.
- **El diálogo del timer no descarta ni duplica.** Descartar sigue en el
  rastreador; duplicar la entrada que corre se rechaza (TT-58).
- **«Detener» con cambios sin guardar queda inactivo** (§1). Si el equipo
  prefiere «guardar y detener», son dos pedidos con dos avisos, y se escribe
  aparte.
- **Las 08:00 de CAL-14 son una constante** hasta que se verifique PF-15.
- **El primer día de la semana en el calendario del selector** sale del idioma,
  como en el resto de la aplicación (deuda del slice 7).
- **`editedFields` y `useTrackerRefresh` llevan nombres de la masiva o del
  rastreador** y ahora sirven a dos consumidores. Renombrarlos no cambia
  conducta.
- **CAL-30 y CAL-92 no tienen e2e**: el workspace de los e2e está en Buenos
  Aires, sin cambio de horario. Los cubren `time.test.ts` y los tests de
  integración con Madrid.
- **TT-92 se verifica en el componente**, no en pantalla, como en el 6.
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
trío completo; crear arrastrando abre el diálogo de alta del 8 con el rango
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

**Riesgos que su contrato tiene que resolver**: el desplazamiento automático de
la grilla al arrastrar contra el borde vertical, el gesto en pantallas táctiles
contra el desplazamiento, y el foco después de soltar.

**Depende del 8 en `main`.** El P-03, si se aprueba, entra ahí: es un asa más
sobre el bloque del timer, con `updateRunningStart`.
