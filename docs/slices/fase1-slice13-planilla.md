# Fase 1, slice 13: planilla de horarios

Contrato del decimotercer slice vertical de la fase 1. Módulo `time-entry`, con
cambios chicos en componentes de `project`; pantalla nueva `/planilla`.

- **Fuente de los comportamientos:** [`docs/parity/timesheet.md`](../parity/timesheet.md),
  con la verificación del workspace del 2026-10-07 (timesheet P-12) y las
  decisiones del equipo del mismo día. Lo `fuera de alcance` y lo de la fase 2
  —copiar la semana pasada (sección 10), plantillas (sección 11), «Compañeros»
  (TS-70), ocultar el rastreador (TS-03)— no entra.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md), «Slice 13 — Planilla
  de horarios». Es el último de la fase.
- **Revisión del contrato:** ronda 1 de `architecture-reviewer` aplicada
  ([`correcciones-fase1-slice13.md`](correcciones-fase1-slice13.md)); pendiente
  la ronda 2, sobre los cambios.
- **Contratos de los que hereda la forma:** [slice 12](fase1-slice12-edicion-masiva.md)
  (tres fases y escritura agrupada), [slice 8](fase1-slice8-calendario.md)
  (segunda pantalla de `time-entry`, semana en la URL, días que no existen),
  [slice 3](fase1-slice3-horas-y-fecha.md) (edición de horas, ADR 0006),
  [slice 5](fase1-slice5-semana-y-paginacion.md) (semana de la persona,
  `startOfDayKey`) y [slice 2c](fase1-slice2c-reintentar-alta-manual.md)
  («Reintentar» de un alta).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0018, lo que escribe una celda se calcula en instantes](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md):
    **propuesto por este contrato (TS-32, timesheet P-02); lo aprueba el
    usuario.** Abre dos excepciones al ADR 0005, solo dentro de
    `setTimesheetCell`.
  - [ADR 0019, escribir una celda fija su valor, una celda a la vez](../adr/0019-escribir-una-celda-fija-su-valor.md):
    **propuesto por este contrato (D13-2); lo aprueba el usuario.** Enmienda
    una consecuencia del ADR 0007 y suma el bloqueo de celda a las reglas del
    ADR 0011.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    el par se valida con `assertTrackable` y las etiquetas copiadas con
    `assertTaggable`; el cliente del proyecto se muestra con un join.
  - [ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md): las
    entradas de una celda y de una fila se bloquean en una sentencia con
    `order by id`.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): la zona se resuelve
    en el servidor; la pantalla monta su `DisplayFormatsProvider`.
  - [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md): la mutación
    vive en `time-entry`; el inicio de la entrada que edita una celda se
    conserva.
  - [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) **no se
    aplica** a la escritura de una celda (ADR 0019).

**Decisiones del team-lead que el contrato da por tomadas** (2026-10-07):

- **Timesheet P-14 se cierra con la propuesta**: el menú de una celda con
  varias entradas no ofrece «Borrar»; se borra entrada por entrada desde el
  detalle. Es del 13b (§9).
- **Timesheet P-16 se cierra**: la fila vacía que guarda el navegador es de la
  semana en que se agregó y no aparece en las demás (§5.7).
- **El slice no cambia el esquema** (§2).
- **TS-32 entra por el ADR 0018**, propuesto.

## Partición

**El slice se parte en dos**, cada uno desplegable solo (D13-1):

- **13, este contrato: la grilla y su escritura.** La pantalla, la navegación,
  las filas que salen de las entradas y las que guarda el navegador, la
  escritura de una celda con toda la sección 5 de la paridad, los totales,
  quitar una fila, los estados vacíos y de error, el teclado y la
  accesibilidad. Tiene todo el backend del módulo de la planilla.
- **13b: el menú y el detalle de una celda** (TS-40 … TS-42, TS-83, TS-99,
  TS-115, y el «Borrar» de TS-35). Esbozo en §9; contrato propio cuando el 13
  esté en `main`. **No tiene backend nuevo**: edita y borra con las mutaciones
  que ya existen (`updateEntry`, `deleteEntry`).

El corte sigue la línea del 8 y el 8c: el 13 entrega la carga rápida, que es el
propósito de la pantalla (TS-43), y el 13b la edición fina de las entradas que
una celda agrupa, que mientras tanto se hace desde el rastreador o el
calendario. Medido contra el 12 —que no se partió—, el 13 entero sumaría una
pantalla nueva, dos mutaciones, un bloqueo nuevo, estado en el navegador y un
popover con dos variantes de edición; partir separa el único bloque que no
depende de los ADR 0018 y 0019.

## Decisiones del contrato

Tomadas por este contrato; las revisa `architecture-reviewer` y las confirma el
team-lead. Ninguna la resuelve la paridad: TS-37 deja el «cómo» al contrato y
las demás son precisiones de reglas escritas.

**D13-1 — El corte.** Opciones: no partir; 13 lectura y 13c escritura, como el
8; 13 grilla y escritura y 13b detalle. **Lo último** (arriba). Una planilla de
solo lectura no es una versión reducida de la carga rápida, y el detalle es lo
único que se puede construir solo con mutaciones existentes.

**D13-2 — Cómo es idempotente y cómo se serializa la escritura de una celda.**
Opciones: (1) id del cliente y `createOnce` para el alta y estado para la
edición; (2) fijar el valor sin id, con un bloqueo consultivo por celda tomado
antes de leer; (3) `serializable` con reintento; (4) bloquear la membresía.
**(2)**, con el ADR 0019. (1) no evita dos entradas desde dos pestañas, que
TS-37 prohíbe, y con el bloqueo el id no agrega nada; (3) agrega una vuelta ante
`40001` que el proyecto no tiene; (4) pone en fila todo lo de la persona y toma
un bloqueo de otro módulo.

**D13-3 — Qué es `S`.** Opciones: la suma exacta en segundos; lo que la celda
muestra, en minutos. **Lo que la celda muestra**: la suma exacta en segundos de
las entradas cerradas de la celda, dividida por 60 y truncada una vez (TS-24,
TS-47). Con eso la celda muestra exactamente `V` después de cualquier escritura,
el servidor no reescribe una celda que ya muestra `V` (la versión del servidor
de TS-36: `1:30:42` con `V = 90` conserva sus segundos), las sumas y restas de
TS-34 son de minutos enteros y la entrada que agrega una celda con varias dura
siempre un minuto o más. Con la suma en segundos, una celda con dos entradas que
suman `1:30:42`, llevada a `1:31`, agregaría una entrada de 18 segundos
(TT-73).

**D13-4 — La baja que deja la entrada que empieza más tarde con menos de un
minuto.** TS-34 rechaza la baja que la dejaría en cero o menos. Opciones:
aceptar lo que quede por encima de cero; rechazar lo que quede por debajo de un
minuto. **Rechazar por debajo de un minuto**, con TS-79. Es TT-73: ninguna
escritura de la interfaz deja una entrada de menos de un minuto. Para entradas
de minutos enteros las dos reglas coinciden; solo difieren con una entrada del
timer con segundos (una de `0:01:30` bajada un minuto quedaría en 30 segundos).
**`parity-analyst` lo registra en TS-34** (§6).

**D13-5 — Subir una celda con varias entradas es un alta.** Opciones: tratarlo
como edición y no validar el par ni las etiquetas; tratarlo como el alta que es,
con las reglas de duplicar. **Como alta**: la entrada nueva pasa por
`assertTrackable` con el par de la fila y por `assertTaggable` con las
etiquetas que copia, igual que `duplicateEntry` (TT-58 y la decisión del
2026-10-03 sobre continuar o duplicar con algo no disponible). Un proyecto
archivado, una tarea hecha o un privado sin acceso responden TS-77 o TS-78; una
etiqueta archivada en la entrada que se copia responde «Esa etiqueta ya no está
disponible.». PR-23 no deja crear entradas en un proyecto archivado, y PR-47 no
deja asignar de nuevo una etiqueta archivada. **Precisa TS-21 y TS-113**, que
dicen que las celdas con entradas «se siguen escribiendo»: bajar y editar la
única, sí; subir una con varias, no. Lo registra `parity-analyst` (§6).

**D13-6 — Qué borra «Quitar fila».** Opciones: los ids que la grilla mostraba,
como el borrado masivo; las entradas cerradas de la persona con ese par en los
siete días que la persona ve, decidido en el servidor; las dos juntas. **Las
dos juntas**: el pedido lleva los `entryIds` de la fila, y el servidor borra
solo los que siguen siendo cerradas de la persona con ese par y el inicio en
los siete días, que es la letra de TS-52 usada como cota. Se borra lo que el
diálogo contó y nada más: una entrada que otra pestaña agregó a la fila entre
la lectura y la confirmación, un timer de la fila detenido después de la
lectura, una entrada de un día vecino que entró al tramo porque cambió la zona
y lo agregado antes de un «Reintentar» quedan, y la fila reaparece con ellas en
la revalidación. Con solo el predicado, todo eso se borraba sin que la persona
lo viera. Los siete días son los que empiezan en el `weekStart` del pedido, sea
o no el inicio de semana actual de la persona: si un admin cambió el primer día
de la semana (TS-112) mientras la pantalla estaba abierta, la cota es la semana
que la persona vio.

**D13-7 — Qué guarda el navegador y cuándo lo olvida** (TS-19, P-16). Ver §5.7.
Se guarda solo el par de una fila con proyecto elegido (o «Sin proyecto»), por
semana, por workspace y por persona. Se olvida al quitarla, cuando la fila llega
del servidor con entradas, y cuando su par deja de estar en el catálogo de
carga. Una fila nueva sin proyecto elegido vive solo en la página.

**D13-8 — Quién decide que las celdas vacías de una fila no se escriben**
(TS-21). Opciones: el servidor manda una marca por fila; la pantalla lo deriva
del catálogo de carga que ya recibe. **El catálogo**: el par se puede cargar si
`getTrackingCatalog` lo ofrece, que es la regla del dueño (ADR 0010) ya aplicada
con `can()`. Una función pura del módulo `project`, `isTrackablePair`, lo
responde; ninguna regla se copia. El servidor lo vuelve a decidir con
`assertTrackable` en cada alta.

**D13-9 — El selector de una fila nueva no ofrece lo que ya es fila** (TS-18).
Las opciones excluidas no se dibujan, salvo la del proyecto solo cuando todavía
ofrece alguna tarea: queda visible e inactiva, para que las tareas conserven su
encabezado visual. Con la búsqueda vacía y todo excluido, el selector dice
«Todas las combinaciones ya tienen fila esta semana.».

**D13-10 — Una fila nueva a la vez, y su par no cambia.** «Añadir nueva fila»
con una fila sin proyecto elegido lleva el foco a su selector en vez de sumar
otra. Elegido el par, la fila deja de tener selector (TS-23); para cambiarlo, se
quita la fila vacía y se agrega otra.

**D13-11 — El estado de las escrituras de la grilla.** Opciones: un `useAction`
por celda con el aviso en la celda; un `useAction` para toda la grilla; un hook
propio de la grilla. **Un hook propio**, `useCellWrites` (§5.6): la grilla tiene
varias escrituras en vuelo a la vez, y `useAction` guarda un solo último pedido
y baja el aviso con cada `run`, así que «Reintentar» reenviaría otra celda. El
aviso vive en la pantalla y sobrevive a la revalidación (lección de
`estado-fase1.md`).

**D13-12 — El nombre de los totales.** TS-100 pide un nombre propio para cada
total («Total del miércoles 01/10»). Un `aria-label` en una celda de tabla no lo
anuncian los lectores de forma pareja; **los totales se nombran por sus
encabezados**: el de fila «Total» y el de columna del día, en una tabla con
`scope` en cada encabezado. Es el mismo texto que pide TS-100. Lo registra
`parity-analyst` (§6).

## 0. Precondición de arranque

- **El árbol de la rama `fase1/slice-13-contrato` en `1a93230`**, con los slices
  1 a 12, 2b, 2c, 7b, 8b, 8c, 11a, 11b y el arreglo del piso fijo en `main`.
  Las citas de abajo son de ese árbol.
- **Los ADR 0018 y 0019 aceptados por el usuario**, con las notas fechadas que
  apuntan a ellos en los ADR 0005, 0006 y 0007, antes del primer commit de
  `backend-dev`.
- **Si entre este contrato y el arranque entra algo a `main`**, una ronda corta
  de `architecture-reviewer` contra el árbol (lección del 9).

### Supuestos sobre el árbol, con archivo y línea en `1a93230`

| Supuesto                                                                                                                                                                                                                  | Dónde                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ENTRY_FLOOR_DAY_KEY = "2000-01-01"`, privada del service                                                                                                                                                                 | `time-entry/service.ts:128`                                                                                                           |
| `toView(row: EntryWithRefs, workspace)`; `ownTimeEntryResource`; `authorizeEntry`; `targetOf`                                                                                                                             | `service.ts:183-209`, `:212`, `:226-249`, `:283`                                                                                      |
| `translatingReferenceConstraints` traduce las claves foráneas del par y de las etiquetas                                                                                                                                  | `service.ts:386-406`                                                                                                                  |
| `assertNewEntryPair(tx, actor, pair)` devuelve el proyecto validado o `null`; `billableOfNewEntry(requested, project)`                                                                                                    | `service.ts:417-432`                                                                                                                  |
| `continuedFields(source)` copia descripción, par, facturable y etiquetas; `duplicateEntry` valida el par y llama a `assertTaggable` con lo copiado                                                                        | `service.ts:450-457`, `:655-692`                                                                                                      |
| `manualTimes` rechaza con `nonexistentClock`, `invalidDate` (`isAfterYear9999`) y `beforeFloor`; su comentario «El fin es la hora tecleada y no el inicio más la duración»                                                | `service.ts:865-898`, `:877-878`                                                                                                      |
| `periodOf`, `isNavigable` y `calendarPeriodsOf`: un período con un día que falta entero, o vecino fuera de los años de cuatro cifras, cae al actual                                                                       | `service.ts:1951-2008`                                                                                                                |
| `getCalendarState` lee en `repeatable read` y arma los días con `weekdayLabel`                                                                                                                                            | `service.ts:2014-2099`                                                                                                                |
| `selectWithRefs(tx, where)` con el join de proyecto y tarea y la subconsulta de etiquetas; `Executor`                                                                                                                     | `time-entry/repository.ts:110`, `:144-165`                                                                                            |
| `findManyByIdsForUpdate`: una sentencia que bloquea solo `time_entry` con `order by id`, y otra con las referencias                                                                                                       | `repository.ts:351-376`                                                                                                               |
| `insertClosed` recibe el id; `updateClosedEntry(tx, target, fields)` escribe solo cerradas; `deleteClosedByIds(tx, targets)` con la guarda de la lista vacía                                                              | `repository.ts:556-577`, `:604-617`, `:757-769`                                                                                       |
| `timeEntryMessages` (`tooShort`, `nonexistentClock`, `beforeFloor`, `invalidDate`, `taskNeedsProject`, `unexpected`); `dayKeyInput`; `hasProjectForTask`; `calendarWeekParams`; `TimeEntryErrorCode`                      | `time-entry/schema.ts:26-54`, `:117-119`, `:66-68`, `:129`, `:520-521`                                                                |
| `BULK_MAX = 200`; el esquema privado `entryIds` de la masiva: `.min(1, bulkEmpty)`, `.max(BULK_MAX, bulkTooMany)` y `normalizedIds`                                                                                       | `time-entry/schema.ts:20`, `:46-47`, `:211-216`                                                                                       |
| Las actions revalidan `"/"` y `"/calendario"` en `options.paths`, también con error                                                                                                                                       | `time-entry/actions.ts:59-65`; `src/server/action.ts:106-123`                                                                         |
| `timeEntry.own.create`, `.update` y `.delete` para los cinco roles; `can` niega una membresía no activa                                                                                                                   | `src/server/permissions/index.ts:115-133`, `:173-175`                                                                                 |
| `time_entry.created_at` existe con `defaultNow()`; índice `(workspace_id, user_id, started_at desc)`                                                                                                                      | `src/server/db/schema.ts:419`, `:430-434`                                                                                             |
| `pg_advisory_xact_lock` ya se usa, con una constante del repository                                                                                                                                                       | `workspace/repository.ts:14`, `:89-91`                                                                                                |
| `instantFromLocal`, `nonexistentMinutes`, `minutesToClock`, `clockToMinutes`, `startOfDayKey`, `weekdayLabel`, `weekKeyLabel`, `parseDurationInput` (menos de 1440), `MINUTES_PER_DAY`                                    | `src/server/time/index.ts:554-561`, `:579-614`, `:382`, `:371`, `:319`, `:258`, `:346`, `:461-490`, `:146`                            |
| `compareNames` está exportada                                                                                                                                                                                             | `src/lib/text.ts:27-39`                                                                                                               |
| `pickerView(catalog, search)` arma las opciones; la del proyecto y las de sus tareas son ítems separados                                                                                                                  | `project/components/picker-model.ts:46-61`, `:87-109`                                                                                 |
| `ProjectPicker` acepta `value: null` con `placeholder` y `variant="row"`; llama a `pickerView` sin exclusiones                                                                                                            | `project/components/project-picker.tsx:49-57`, `:134`                                                                                 |
| `PeriodPicker` recibe `mode` y navega con `calendarHref`                                                                                                                                                                  | `time-entry/components/calendar/period-picker.tsx:18-25`, `:46`; `calendar-toolbar.tsx:77-82`                                         |
| `ClockField`: `disabled` (pierde el foco), sin `readOnly`; no llama a `onCommit` si el texto es el mostrado; Enter confirma y llama a `onSubmit`; marca el rechazo (TT-21)                                                | `time-entry/components/clock-field.tsx:33`, `:111-122`, `:140-153`, `:98-108`                                                         |
| `useAction` guarda un solo `lastInput` y `run` baja el aviso                                                                                                                                                              | `src/hooks/use-action.ts:52`, `:59-61`                                                                                                |
| `useTrackerRefresh`, `InactiveMembershipNotice`, `ActionFeedback`, `DisplayFormatsProvider`, `TrackingCatalogProvider`                                                                                                    | `use-tracker-refresh.ts:19`; `inactive-membership-notice.tsx:6`; `src/components/action-feedback.tsx:28`; `calendar-screen.tsx:47-50` |
| La navegación tiene «Inicio», «Calendario» y «Proyectos» como literales                                                                                                                                                   | `src/components/layout/app-nav.tsx:9-13`                                                                                              |
| `raceThroughBarrier`, `queueBehindBarrier` y `waitForBlockedBackends` (`wait_event_type = 'Lock'`)                                                                                                                        | `src/test/concurrency.ts:123`, `:150`, `:40-47`                                                                                       |
| `seedTimeEntry` no recibe `id` ni `createdAt`                                                                                                                                                                             | `src/test/factories.ts:103-129`                                                                                                       |
| e2e: `withServerAction`, `recordActions`, `openSecondTab`, `loseActionResponses`; `addManualEntry`, `pickProject`, `startTimer`, `uniqueSuffix`; `seedProject`, `archiveProject`, `markTaskDone`, `seedTag`, `archiveTag` | `e2e/network.ts`; `e2e/tracker-page.ts`; `e2e/database.ts`                                                                            |

## 1. Alcance

Entra, con los identificadores de `timesheet.md`:

- **La pantalla**: TS-01, TS-02 (nada que construir: el proyecto sigue
  opcional), TS-04, TS-05.
- **La semana**: TS-06 a TS-12.
- **Filas**: TS-13 a TS-23.
- **Celdas**: TS-24 a TS-39, sin el «Borrar» del menú de TS-35, que es del 13b.
- **La grilla no muestra descripciones**: TS-43.
- **Totales**: TS-44 a TS-48.
- **El timer**: TS-49 a TS-51.
- **Quitar una fila**: TS-52 a TS-54.
- **Permisos**: TS-75, TS-76.
- **Mensajes**: TS-77, TS-78, TS-79, TS-81, TS-82, TS-84, TS-86.
- **Estados vacíos y de error**: TS-87, TS-88, TS-90, TS-91 a TS-94.
- **Al recargar**: TS-95 a TS-97.
- **Teclado y accesibilidad**: TS-98, TS-100, TS-101.
- **Casos borde**: TS-102 a TS-114, TS-116, TS-118 a TS-120.

Entran por arrastre, verificándose por el camino nuevo: TT-19 y TT-21 (el
intérprete de duración y el rechazo), TT-55 (el atenuado), TT-61 (la
confirmación sin deshacer), TT-73, TT-77, TT-79, TT-89, TT-90, TT-92, TT-97,
PR-23, PR-47, PR-64, PR-66 y PR-71.

### Lo que el slice decide y que la paridad tiene que registrar

- **TS-19 y P-16**: lo que guarda el navegador y cuándo lo olvida (D13-7, §5.7);
  P-16 pasa a cerrados.
- **TS-16 y TS-23**: una fila sin proyecto elegido a la vez, y el par fijo una
  vez elegido (D13-10).
- **TS-18**: las opciones excluidas no se dibujan, y el proyecto que todavía
  ofrece tareas queda visible e inactivo (D13-9).
- **TS-21 y TS-113**: subir una celda con varias entradas de un par que ya no se
  ofrece responde TS-77 o TS-78, y una etiqueta archivada en la entrada que se
  copia responde «Esa etiqueta ya no está disponible.» (D13-5).
- **TS-34**: `S` es lo que la celda muestra, en minutos (D13-3), y la baja que
  dejaría la entrada que empieza más tarde con menos de un minuto se rechaza
  (D13-4). TS-118 queda como está.
- **TS-15**: el orden de las filas del servidor es el del selector: clientes en
  orden alfabético, después los proyectos sin cliente, y «Sin proyecto» al
  final; dentro de un proyecto, la fila sin tarea primero y después las tareas
  en orden alfabético (§5.1).
- **TS-08 y TS-09**: la columna de hoy se resalta y lleva `aria-current="date"`;
  «Esta semana» aparece cuando se mira otra semana (las dos propuestas de la
  paridad, adoptadas).
- **TS-45**: el gris del cero vale para los tres totales.
- **TS-100**: el nombre de los totales sale de sus encabezados (D13-12).
- **TS-52**: se borran las entradas que la fila mostraba (`ids`), acotadas a los
  siete días de la semana que la persona vio; lo agregado a la fila después de
  la lectura queda (D13-6).
- **TS-79 en el 13**: el aviso dice «Editá las entradas de esta celda desde el
  rastreador.» (`cellNeedsEntryEdit`); el 13b lo pasa a «desde el detalle»
  (§9).
- **TS-40 y P-14**: P-14 pasa a cerrados con la decisión del team-lead; la regla
  se construye en el 13b.
- **TS-32**: «falta el ADR» pasa a citar el ADR 0018, y la divergencia de la
  sección 20 a «Decidida el 2026-10-07; ADR 0018».

**Lo registra `parity-analyst` antes del merge** (§6), con una sección «Slice
13» en `timesheet.md` y la corrección fechada de cada regla que cambia.

### Queda afuera

- **El menú de tres puntos de una celda y su detalle**: TS-40, TS-41, TS-42,
  TS-83, TS-99, TS-115, y «Borrar» una entrada desde la planilla (TS-35). Son
  del 13b.
- **Lo `fuera de alcance` y lo de la fase 2** de `timesheet.md`: TS-03, TS-55 …
  TS-61, TS-62 … TS-67, TS-68 … TS-74, TS-89, TS-117.
- **El botón con ícono de lista de TS-09**: no se replica hasta saber qué hace.
- **Un atajo que no sea Tab, Mayús+Tab, Enter y Esc** (TS-98, TS-101).
- **Recordar qué celda tenía el foco** después de una recarga.

### Consecuencias sobre código ya entregado

| Archivo                                               | Qué cambia                                                                                        | Qué hay que volver a probar                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/server/time/index.ts`                            | Suma `instantFromLocalOrLater` y `fullWeekdayLabel` (§4.2). No cambia ninguna función existente.  | `time.test.ts` entero                                                              |
| `time-entry/schema.ts`                                | Entradas, estado y resultados de la planilla; `cellNeedsEntryEdit` en `timeEntryMessages` (§4.1). | `schema.test.ts` entero                                                            |
| `time-entry/service.ts`                               | `getTimesheetState`, `setTimesheetCell`, `removeTimesheetRow`.                                    | —                                                                                  |
| `time-entry/repository.ts`                            | `lockCell`, `lockClosedInSlice`, `listTimesheetEntries` (§4.6).                                   | —                                                                                  |
| `time-entry/actions.ts`                               | Dos actions; `options.paths` suma `"/planilla"`.                                                  | `actions.integration.test.ts` (la revalidación de todas las actions)               |
| `time-entry/components/clock-field.tsx`               | Suma `busy`: no acepta texto y se atenúa sin perder el foco (§5.5).                               | Los campos de hora de la barra, la fila, el inicio del timer y la masiva           |
| `time-entry/components/calendar/period-picker.tsx`    | `mode` se reemplaza por `hrefOf(day)`.                                                            | `calendar.spec.ts` (CAL-16)                                                        |
| `time-entry/components/calendar/calendar-toolbar.tsx` | Pasa `hrefOf={(day) => calendarHref(state.mode, day)}`.                                           | `calendar-toolbar.test.tsx`                                                        |
| `project/components/picker-model.ts`                  | `pickerView` recibe `excluded`; suma `isTrackablePair` y el vacío `allUsed` (§5.7).               | `picker-model.test.ts` entero                                                      |
| `project/components/project-picker.tsx`               | Prop `excluded`, opción del proyecto inactiva, vacío `allUsed`.                                   | `project-picker.test.tsx`; `e2e/project-picker.spec.ts`                            |
| `project/components/labels.ts`                        | `pickerAllUsed`.                                                                                  | —                                                                                  |
| `src/components/layout/app-nav.tsx`                   | Suma «Planilla» entre «Calendario» y «Proyectos».                                                 | `e2e/profile.spec.ts` (`goToTrackerByNav`), `e2e/calendar.spec.ts` (la navegación) |
| `src/test/factories.ts`                               | `seedTimeEntry` acepta `id` y `createdAt` opcionales.                                             | —                                                                                  |

**Ninguna afirmación de un test existente cambia.** Sin `excluded`, `pickerView`
y `ProjectPicker` se comportan como hoy; sin `busy`, `ClockField` también.

## 2. Cambios de esquema

**Ninguno.** Las celdas y las filas salen de `time_entry` y la fila vacía vive
en el navegador (TS-19). Las tres consultas nuevas filtran por
`workspace_id`, `user_id` y un tramo de `started_at`, que es el índice
`time_entry_workspace_user_started_idx`; el par y `ended_at is not null` se
filtran sobre lo que el índice trae, que son las entradas de una persona en un
día o una semana. El desempate de TS-34 usa `created_at`, que ya existe.

## 3. Permisos

**Ninguna acción nueva.** La unión `Action` de `src/server/permissions` no
cambia (TS-75).

| Qué se decide                                           | Acción de `can()`      | Quién la consulta                                                          |
| ------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| La membresía puede escribir una celda                   | `timeEntry.own.update` | la action y el service, sobre `ownTimeEntryResource(actor)`, antes de leer |
| Puede crear la entrada (celda vacía o subir con varias) | `timeEntry.own.create` | el service, antes de insertar                                              |
| Puede editar la entrada leída                           | `timeEntry.own.update` | `authorizeEntry` sobre la fila bloqueada, antes de escribir                |
| Puede quitar una fila                                   | `timeEntry.own.delete` | la action y el service, sobre `ownTimeEntryResource(actor)`, antes de leer |
| Puede cargar horas en el par                            | `project.track`        | `assertTrackable` de `project` (ADR 0010), solo en un alta                 |
| Puede usar las etiquetas copiadas                       | `tag.view`             | `assertTaggable` de `project`, solo al subir una celda con varias          |
| La pantalla dibuja controles de escritura               | `timeEntry.own.create` | `canTrack` del estado, como el rastreador y el calendario                  |

- **Una membresía no activa recibe `forbidden` antes de leer** (TS-76, TS-84),
  sin esperar el bloqueo de ninguna celda ni fila.
- **Solo las entradas propias** (TS-05): las lecturas y los bloqueos filtran
  por el `user_id` de la sesión; una entrada de otra persona con el mismo par y
  el mismo día no es parte de la celda.

## 4. Contrato de las server actions

### 4.1 Los tipos (`time-entry/schema.ts`)

`timeEntryMessages` suma una clave:

```ts
/** TS-79: una causa, dos casos, un remedio (TS-34, TS-119). El 13b cambia el texto (§9). */
cellNeedsEntryEdit: "Editá las entradas de esta celda desde el rastreador.",
```

```ts
/** El par de una fila de la planilla: `null` en los dos es «Sin proyecto» (TS-20). */
const timesheetPair = {
  projectId: z.uuid().nullable(),
  taskId: z.uuid().nullable(),
};

/**
 * «Dejar la celda en este valor» (sección 5 de la paridad). No lleva lo que la
 * pestaña vio ni un id: el servidor decide con lo que la celda tiene (ADR 0019).
 */
export const setTimesheetCellInput = z
  .object({
    /** Día de la columna, en la zona de la persona. */
    date: dayKeyInput,
    ...timesheetPair,
    /**
     * Lo que la celda tiene que mostrar, en minutos (TS-25). Menos de uno es
     * TS-35 y TT-73; 24 horas o más no lo arma el intérprete (TS-26, TS-82).
     */
    minutes: z
      .number(timeEntryMessages.unexpected)
      .int(timeEntryMessages.unexpected)
      .min(1, timeEntryMessages.tooShort)
      .max(MINUTES_PER_DAY - 1, timeEntryMessages.unexpected),
  })
  .refine(hasProjectForTask, taskNeedsProject);

/** TS-52: las entradas de la fila de un par, acotadas a los siete días desde `weekStart`. */
export const removeTimesheetRowInput = z
  .object({
    /** El primer día de la semana que la persona ve: la cota (D13-6). */
    weekStart: dayKeyInput,
    ...timesheetPair,
    /**
     * Los `entryIds` de la fila que la grilla mostraba: lo único que se borra
     * (D13-6). Es el esquema privado `entryIds` de la masiva: de 1 a
     * `BULK_MAX`, normalizados con `normalizedIds`.
     */
    ids: entryIds,
  })
  .refine(hasProjectForTask, taskNeedsProject);

/** El parámetro de `/planilla` (TS-10), con `safeParse`, como el del calendario. */
export const timesheetWeekParams = z.object({ semana: dayKeyInput });

export const timesheetDayView = z.object({
  /** "2026-09-28". */
  date: z.string(),
  /** El encabezado de la columna: «lun, 28/09», con año si no es el de hoy (TS-08). */
  label: z.string(),
  /** El día en el nombre de cada celda: «lunes 28/09» (TS-100). */
  fullLabel: z.string(),
  isToday: z.boolean(),
  /** Sábado o domingo: fondo distinto (TS-08). */
  isWeekend: z.boolean(),
  /** Anterior al piso de carga: sus celdas no se escriben (TS-12). */
  beforeFloor: z.boolean(),
  /** Exacto: lo que suman las celdas del día, sin el timer (TS-45, TS-49). */
  closedSeconds: z.number().int().min(0),
});

export const timesheetCellView = z.object({
  date: z.string(),
  /** Exacto: lo que suman las entradas cerradas de la celda (TS-24). */
  closedSeconds: z.number().int().min(0),
  /** Una de cero minutos cuenta: la celda dice `0:00` y no queda vacía (TS-118). */
  entryCount: z.number().int().min(1),
});

export const timesheetRowView = z.object({
  /** Con la forma de `ProjectRef`; `null` es «Sin proyecto». Esté o no archivado (TS-21). */
  project: z
    .object({ id: z.uuid(), name: z.string(), color: z.enum(PALETTE_KEYS) })
    .nullable(),
  task: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** El cliente del proyecto, en gris (TS-13); `null` sin cliente o sin proyecto. */
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Solo las celdas con entradas, por día. */
  cells: z.array(timesheetCellView),
  /** Exacto: la suma de la fila en la semana (TS-44). */
  closedSeconds: z.number().int().min(0),
  /**
   * Las cerradas de la fila en la semana, por id: lo que cuenta el diálogo de
   * TS-53 y lo que borra «Quitar fila» (D13-6).
   */
  entryIds: z.array(z.uuid()).min(1),
});

export const timesheetState = z.object({
  /** Día de hoy en la zona de la persona: la marca del selector de fecha. */
  todayKey: z.string(),
  canTrack: z.boolean(),
  /** Primer día de la semana que se muestra, ya normalizado (TS-10). */
  weekStart: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TS-09, TT-47). */
  weekLabel: z.string(),
  previousStart: z.string(),
  nextStart: z.string(),
  /** La semana que contiene hoy: el destino de «Esta semana». */
  currentStart: z.string(),
  days: z.array(timesheetDayView).length(7),
  /** Las filas que salen de las entradas, en el orden de TS-15. */
  rows: z.array(timesheetRowView),
  /** Exacto: el total de la semana (TS-46). */
  closedSeconds: z.number().int().min(0),
  /** Dónde guarda el navegador las filas vacías: por workspace y persona (§5.7). */
  storageKey: z.string(),
});

export type TimesheetState = z.infer<typeof timesheetState>;
export type TimesheetRowView = z.infer<typeof timesheetRowView>;
export type TimesheetDayView = z.infer<typeof timesheetDayView>;
export type SetTimesheetCellInput = z.input<typeof setTimesheetCellInput>;
export type SetTimesheetCellValues = z.output<typeof setTimesheetCellInput>;
export type RemoveTimesheetRowInput = z.input<typeof removeTimesheetRowInput>;
export type RemoveTimesheetRowValues = z.output<typeof removeTimesheetRowInput>;

/** La entrada que el pedido creó o editó; `null` si la celda ya mostraba ese valor. */
export type SetTimesheetCellResult = { readonly entry: TimeEntryView | null };

/** Las entradas que se borraron; vacío si ya no quedaba ninguna de las pedidas (TS-92). */
export type RemoveTimesheetRowResult = { readonly ids: readonly string[] };
```

- **`MINUTES_PER_DAY` se importa de `src/server/time`**, como `isClock`.
- **Los textos de Zod son de `timeEntryMessages`**: ninguna interfaz manda un
  decimal, un número de más de 1439 ni un tipo distinto, así que esos casos
  usan `unexpected`, como lo que el slice 12 rechaza con ese texto. `ids` lleva
  los de la masiva: la interfaz nunca lo manda vacío —una fila sin entradas se
  quita sin pedido— y más de `BULK_MAX` es `bulkTooMany` (§4.5).
- **`TimeEntryErrorCode` no cambia**: TS-79 es `validation`.

### 4.2 Lo que suma `src/server/time`

```ts
/**
 * La hora de pared de ese día como instante o, si no existió por un adelanto
 * de hora, el primer minuto posterior de ese mismo día que sí existió. La
 * hora que ocurre dos veces da el segundo instante, como `instantFromLocal`.
 * `null` si desde esa hora no existió ningún minuto ese día. Solo para horas
 * que nadie tecleó (ADR 0018).
 */
export function instantFromLocalOrLater(
  dayKey: string,
  clock: string,
  timeZone: string,
): Date | null;

/**
 * El día en el nombre de una celda: «miércoles 01/10», con el día de la semana
 * entero y la fecha en el formato de la persona, con año si no es el de
 * `todayKey` (TS-100). Es la forma larga de `weekdayLabel`.
 */
export function fullWeekdayLabel(
  dayKey: string,
  todayKey: string,
  format: DateFormat,
): string;
```

`instantFromLocalOrLater` usa `instantFromLocal` y, si da `null`, el hueco de
`nonexistentMinutes` que contiene la hora: con su fin antes de las 24 h,
`instantFromLocal` de ese minuto; si no, `null`. No depende de la zona del
proceso.

### 4.3 La regla de la celda (`time-entry/timesheet-cell.ts`, nuevo)

Pura, con su test de unidad, al lado de `assignment.ts`. No importa del service
ni lanza errores: devuelve un resultado que el service traduce.

```ts
/** Lo que la regla mira de cada entrada cerrada de la celda. */
export type CellEntry = {
  readonly id: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly createdAt: Date;
};

/** TS-31: la hora de pared en que empieza la entrada de una celda vacía. */
export const EMPTY_CELL_START = "09:00";

/**
 * Lo que la celda muestra, en minutos: la suma exacta en segundos de sus
 * entradas (`durationSeconds` de cada una), dividida por 60 y truncada una vez
 * (TS-24, TS-47, D13-3).
 */
export function cellMinutes(entries: readonly CellEntry[]): number;

/**
 * La entrada que «empieza más tarde» (TS-34): la de `startedAt` mayor; con el
 * mismo, la de `createdAt` más reciente; con los dos iguales, la de id mayor.
 */
export function latestStarting<Entry extends CellEntry>(entries: readonly Entry[]): Entry;

export type CellWrite<Entry extends CellEntry> =
  /** La celda ya muestra el valor pedido: no se escribe nada (TS-36, TS-37). */
  | { readonly kind: "unchanged" }
  /** Celda vacía: una entrada nueva (TS-29, TS-31). */
  | { readonly kind: "create"; readonly startedAt: Date; readonly endedAt: Date }
  /** Una entrada, o bajar con varias: el fin nuevo de `target` (TS-33, TS-34). */
  | { readonly kind: "setEnd"; readonly target: Entry; readonly endedAt: Date }
  /** Subir con varias: una entrada nueva que copia los campos de `source` (TS-34). */
  | {
      readonly kind: "append";
      readonly source: Entry;
      readonly startedAt: Date;
      readonly endedAt: Date;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        /** TS-34, TS-119: la entrada nueva empezaría en otro día. */
        | "appendOtherDay"
        /** TS-34, D13-4: la que empieza más tarde quedaría con menos de un minuto. */
        | "trimTooShort"
        /** ADR 0018: desde las 09:00 no existió ningún minuto ese día. */
        | "noStartThatDay"
        /** Un extremo caería después del año 9999 en UTC. */
        | "afterYear9999";
    };

/**
 * «Dejar la celda en `minutes`» (ADR 0018), con las entradas cerradas de la
 * celda leídas bajo bloqueo. `cell.date` es el día de la columna y
 * `cell.timeZone` la zona de la persona.
 */
export function cellWrite<Entry extends CellEntry>(
  cell: { readonly date: string; readonly timeZone: string },
  entries: readonly Entry[],
  minutes: number,
): CellWrite<Entry>;
```

`cellWrite` decide en este orden, con `V = minutes`, `S = cellMinutes(entries)`
y las sumas en milisegundos sobre el instante:

1. **Sin entradas**: inicio `instantFromLocalOrLater(date, EMPTY_CELL_START,
timeZone)`; `null` es `noStartThatDay`. Fin = inicio + `V`. `create`.
2. **`S === V`**: `unchanged`. Vale con una y con varias.
3. **Una entrada**: `setEnd` sobre ella, fin = su inicio + `V`.
4. **Varias, `V > S`**: `base` es la de `endedAt` mayor (la que termina más
   tarde). Si `dayKey(base.endedAt, timeZone) !== date` —cruza la medianoche o
   termina justo a las 00:00 del día siguiente—, `appendOtherDay`. Si no,
   `append` con `source = latestStarting(entries)`, inicio = `base.endedAt`,
   fin = inicio + `V − S`.
5. **Varias, `V < S`**: `target = latestStarting(entries)`, fin = su fin −
   `S − V`. Si el fin nuevo queda a menos de 60 segundos de su inicio,
   `trimTooShort`. Si no, `setEnd`.

En los casos 1, 3 y 4, un fin con `isAfterYear9999` es `afterYear9999`. La
tabla de casos de la sección 19 de la paridad (TS-102 … TS-120) es la base de
su test (§7, criterio 3).

### 4.4 `setTimesheetCell`

```ts
/**
 * TS-29 … TS-39: deja la celda `(date, par)` de la persona en `minutes`. La
 * celda se serializa con un bloqueo propio y se decide con lo que tiene en ese
 * momento (ADR 0019); los instantes salen del ADR 0018. La entrada que corre
 * nunca se lee ni se toca (TS-49, TS-50).
 */
export async function setTimesheetCell(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: SetTimesheetCellValues,
): Promise<SetTimesheetCellResult>;
```

En este orden:

1. **`can(actor, "timeEntry.own.update", ownTimeEntryResource(actor))`**; si no,
   `forbidden` con `timeEntryMessages.forbidden`. Antes de leer y de esperar
   ningún bloqueo.
2. **El día**: `input.date < ENTRY_FLOOR_DAY_KEY` es `validation` con
   `beforeFloor` (TS-81). El día siguiente, `addDaysToKey(date, 1)`, sin clave
   de cuatro cifras es `validation` con `invalidDate`. La celda es `[from, to)`
   con `from = startOfDayKey(date)` y `to = startOfDayKey(día siguiente)`.
3. **Una transacción**, sin `isolationLevel` (`read committed`, ADR 0019),
   envuelta en `translatingReferenceConstraints`:
   1. `timeEntryRepository.lockCell(tx, celda)`, **en su propia sentencia**.
   2. `timeEntryRepository.lockClosedInSlice(tx, celda)`: las cerradas de la
      persona con ese par y el inicio en `[from, to)`, bloqueadas.
   3. `cellWrite({ date, timeZone }, entradas, minutes)`.
   4. Según el resultado:
      - **`unchanged`**: responde `{ entry: null }`. Nada escrito, ninguna
        constancia.
      - **`rejected`**: `appendOtherDay` y `trimTooShort` son `validation` con
        `cellNeedsEntryEdit` (TS-79); `noStartThatDay`, `validation` con
        `nonexistentClock`; `afterYear9999`, `validation` con `invalidDate`.
      - **`create`**: `can(… "timeEntry.own.create" …)` o `forbidden`.
        `assertNewEntryPair(tx, actor, par)` (TS-77, TS-78). `insertClosed` con
        un id de `crypto.randomUUID()`, descripción vacía, el par, el
        facturable de `billableOfNewEntry(undefined, proyecto)` y sin etiquetas
        (TS-30). Constancia `timeEntry.createFromCell`.
      - **`append`**: `can(… "timeEntry.own.create" …)` o `forbidden`.
        `continuedFields(source)` da descripción, par, facturable y etiquetas
        (TS-34). `assertNewEntryPair(tx, actor, par)` y después
        `assertTaggable(tx, actor, etiquetas)` (D13-5). `insertClosed` con los
        instantes del resultado. Constancia `timeEntry.createFromCell` con
        `sourceId`.
      - **`setEnd`**: `authorizeEntry(actor, "timeEntry.own.update", target)`.
        `updateClosedEntry(tx, targetOf(target), { endedAt })`; `undefined` es
        un error sin traducir —la fila está bloqueada y cerrada— y la
        transacción se revierte. Constancia `timeEntry.updateFromCell`.
4. Responde `{ entry: toView(escrita, workspace) }`.

- **No hay validación del par en `setEnd`**: editar el fin de una entrada que ya
  existe no la asigna de nuevo al proyecto (TS-21, TS-113). Tampoco en
  `unchanged`.
- **Sin `requireClosed`**: la lectura solo trae cerradas, y bajo el bloqueo
  ninguna vuelve a abrirse.
- **El id de la entrada nueva lo elige el service**, no el cliente (ADR 0019).
  Un choque de clave primaria es imposible en la práctica y saldría como
  `unexpected`.

### 4.5 `removeTimesheetRow`

```ts
/**
 * TS-52 … TS-54: borra las entradas de `ids` que siguen siendo cerradas de la
 * persona con ese par y con el inicio en los siete días desde `weekStart`
 * (D13-6). La que corre no se toca, ni lo que no está en `ids`. Sin ninguna,
 * responde vacío sin escribir: el reintento de una fila ya quitada no borra
 * nada más (TS-92).
 */
export async function removeTimesheetRow(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: RemoveTimesheetRowValues,
): Promise<RemoveTimesheetRowResult>;
```

1. `can(actor, "timeEntry.own.delete", ownTimeEntryResource(actor))`; si no,
   `forbidden`, antes de leer.
2. `addDaysToKey(weekStart, 7)` sin clave de cuatro cifras es `validation` con
   `invalidDate`. El tramo es `[startOfDayKey(weekStart), startOfDayKey(+7))`.
   **No hay piso**: borrar no carga horas, y ninguna entrada es anterior al
   2000-01-01.
3. Una transacción: `lockClosedInSlice(tx, fila)` bloquea las de la cota; las
   que se borran son las bloqueadas cuyo id está en `input.ids`. Sin ninguna,
   responde `{ ids: [] }` sin escribir. Si no, `deleteClosedByIds(tx,
borradas.map(targetOf))`; si borró otra cantidad que la elegida, error sin
   traducir; `recordAudits` con una constancia `timeEntry.removeRow` por
   entrada borrada, con la copia de la fila y sus `tagIds` (`sortedTagIdsOf`),
   como `bulkDeleteEntries`.
4. Responde `{ ids }` de las borradas, en orden de id.

- **Lo bloqueado que no está en `ids` queda** sin escribirse, y su bloqueo se
  suelta con el `commit`. **Un id de `ids` fuera de la cota** —de otra semana,
  de otro par, la que corre, ajena o que ya no existe— se ignora sin error: el
  pedido no puede borrar fuera de la fila.
- **Una fila con más de `BULK_MAX` entradas en la semana no se quita desde la
  planilla**: el esquema rechaza el pedido con `bulkTooMany`, que el aviso de la
  fila muestra sin «Reintentar» (TS-92). Se borra por partes con el borrado
  masivo del rastreador.

`workspace` no se usa para las vistas; la recibe por la zona con que se cortan
los días.

### 4.6 Repository

```ts
/** Lo que delimita una celda o una fila: de quién, qué par y qué tramo de instantes. */
export type EntrySlice = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly pair: ProjectPair;
  readonly from: Date;
  readonly to: Date;
};

/** La entrada de la planilla, con su proyecto, su tarea, sus etiquetas y el cliente. */
export type TimesheetEntryRow = EntryWithRefs & {
  readonly client: { readonly id: string; readonly name: string } | null;
};

/**
 * TS-37, ADR 0019: serializa las escrituras de una celda hasta el fin de la
 * transacción. `pg_advisory_xact_lock(TIMESHEET_CELL_LOCK, hashtext(clave))`,
 * con la clave armada con el workspace, el usuario, el proyecto o `-`, la
 * tarea o `-` —los ids en minúsculas— y `from` en ISO. Una sentencia propia,
 * antes de leer la celda.
 */
lockCell(tx: Transaction, cell: Omit<EntrySlice, "to">): Promise<void>;

/**
 * Las cerradas de la persona con ese par y el inicio en `[from, to)`,
 * bloqueadas. Dos sentencias, como `findManyByIdsForUpdate`: la primera lee
 * solo `time_entry` con `for update` y `order by id` (ADR 0011); la segunda,
 * con el bloqueo ya tomado, trae las referencias con `selectWithRefs`, por
 * `started_at`, `created_at` e `id` ascendentes. El par se compara con `is
 * null` cuando es nulo.
 */
lockClosedInSlice(tx: Transaction, slice: EntrySlice): Promise<readonly EntryWithRefs[]>;

/**
 * Las cerradas de la persona con el inicio en `[from, to)`, de cualquier par,
 * con sus referencias y el cliente del proyecto por un `left join` sin ninguna
 * condición de archivado ni de acceso (ADR 0010). Por `started_at`,
 * `created_at` e `id` ascendentes. Una sola sentencia.
 */
listTimesheetEntries(
  workspaceId: string,
  userId: string,
  from: Date,
  to: Date,
  tx?: Executor,
): Promise<readonly TimesheetEntryRow[]>;
```

- **`TIMESHEET_CELL_LOCK`** es una constante entera de 32 bits del repository,
  distinta de cualquier otra clase que se use.
- **`listTimesheetEntries` trae las etiquetas** aunque la grilla del 13 no las
  muestre: el 13b arma las vistas del detalle con `toView` sobre estas filas sin
  otra consulta. El cliente se une por `(workspace_id, id)` de `client` contra
  `project.client_id`.
- **Toda consulta filtra por el `workspace_id` y el `user_id` de la sesión**,
  que llegan del service, nunca de la entrada.

### 4.7 Bloqueos y costo

- **Escribir una celda**: un bloqueo consultivo; una sentencia que bloquea las
  cerradas de la celda con `order by id`; una relectura. Con alta, a lo sumo dos
  consultas de `project` y una de etiquetas, el `insert`, el de la unión y una
  relectura; con edición, un `update` y una relectura. Una constancia. **A lo
  sumo diez sentencias.**
- **Quitar una fila**: una sentencia que bloquea con `order by id`, una
  relectura con referencias, un `delete` y un `insert` de constancias. El
  `delete` tiene a lo sumo `BULK_MAX` destinos, por el esquema (§4.1); la cota
  bloquea las de una fila de una persona en siete días.
- **Ciclos**: ver el ADR 0019. Quitar una fila no toma bloqueos de celda; una
  escritura de celda que confirma mientras se quita la fila puede dejar una
  entrada que la fila no borró, y la fila vuelve a aparecer con ella. Una
  escritura de celda que llega mientras se quita la fila toma su bloqueo de
  celda y espera las filas en `lockClosedInSlice`; cuando la fila confirma,
  `for update` en `read committed` salta las borradas y la celda decide con lo
  que quedó: si quedó vacía, crea (criterio 16).
- **Leer la semana**: una sentencia, sin transacción explícita; es una sola
  foto.

### 4.8 Las causas

| Causa                                                            | Código       | Texto                                           | Paridad       |
| ---------------------------------------------------------------- | ------------ | ----------------------------------------------- | ------------- |
| Membresía no activa                                              | `forbidden`  | `forbidden` (TT-79)                             | TS-84         |
| Día anterior al 2000-01-01                                       | `validation` | `beforeFloor`                                   | TS-81         |
| Día o fin fuera de los años de cuatro cifras                     | `validation` | `invalidDate`                                   | —             |
| Menos de un minuto                                               | `validation` | `tooShort` (TT-73)                              | TS-35, TS-82  |
| 24 horas o más, decimal, otro tipo                               | `validation` | `unexpected`                                    | TS-82         |
| Tarea sin proyecto                                               | `validation` | `taskNeedsProject` (TT-70)                      | TS-86         |
| Subir con varias y la que termina más tarde termina otro día     | `validation` | `cellNeedsEntryEdit`                            | TS-79, TS-119 |
| Bajar y la que empieza más tarde quedaría con menos de un minuto | `validation` | `cellNeedsEntryEdit`                            | TS-79, D13-4  |
| Desde las 09:00 no existió ningún minuto ese día                 | `validation` | `nonexistentClock`                              | ADR 0018      |
| Alta en un proyecto inexistente, archivado o sin acceso          | `not_found`  | `projectUnavailable` (TT-77)                    | TS-77         |
| Alta en una tarea inexistente, hecha o de otro proyecto          | `not_found`  | `taskUnavailable` (PR-74)                       | TS-78         |
| Subir copiando una etiqueta archivada o que no se puede ver      | `not_found`  | `tagUnavailable` (TT-78)                        | D13-5         |
| Una referencia se borró entre la validación y la escritura       | `not_found`  | el mismo, por `translatingReferenceConstraints` | —             |

- **El orden** es el de §4.4: permiso, día, bloqueo, regla, permiso de alta, par,
  etiquetas. Un pedido sobre un día anterior al piso en un proyecto archivado
  responde el piso.
- **Ninguna causa deja escritura ni constancia.**

### 4.9 Auditoría

| Acción                     | Cuándo                           | `previousValue`               | `nextValue`                                                                                                             |
| -------------------------- | -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `timeEntry.createFromCell` | `create` y `append`              | —                             | `description`, `projectId`, `taskId`, `billable`, `tagIds` (por nombre), `startedAt`, `endedAt`; `sourceId` en `append` |
| `timeEntry.updateFromCell` | `setEnd`                         | `{ endedAt }`                 | `{ endedAt }`                                                                                                           |
| `timeEntry.removeRow`      | cada entrada de una fila quitada | la fila entera y sus `tagIds` | —                                                                                                                       |

`entityId` es el id de la entrada. Un pedido `unchanged` o rechazado no deja
constancia.

### 4.10 Reintentar y la pestaña desactualizada

- **El reintento llega a un punto fijo** (TS-37): después de una escritura la
  celda muestra `V` (D13-3), así que el segundo pedido es `unchanged`. Vale para
  `create`, `setEnd` y `append`. Un rechazo se repite igual.
- **Dos pedidos simultáneos sobre la misma celda** se ponen en fila en
  `lockCell`; el segundo decide con lo que dejó el primero. Sobre una celda
  vacía queda una sola entrada (TS-110).
- **La pestaña desactualizada** (TS-93) no manda lo que vio: si la celda pasó a
  tener varias, rige TS-34 o TS-79; si su entrada se borró, crea; si el timer de
  esa celda se detuvo, su entrada cuenta como una más.
- **Quitar una fila** responde `{ ids: [] }` si ya no queda ninguna de las de
  `ids`: el reintento termina bien sin borrar nada, tampoco lo que se agregó a
  la fila entre los dos intentos (D13-6).

### 4.11 Revalidación

`options.paths` de `time-entry/actions.ts` pasa a `["/", "/calendario",
"/planilla"]`, para todas las actions del módulo, también con error. Las dos
actions nuevas:

```ts
export async function setTimesheetCell(
  input: SetTimesheetCellInput,
): Result<SetTimesheetCellResult>;
// handle: parse, assertCan("timeEntry.own.update"), service.setTimesheetCell

export async function removeTimesheetRow(
  input: RemoveTimesheetRowInput,
): Result<RemoveTimesheetRowResult>;
// handle: parse, assertCan("timeEntry.own.delete"), service.removeTimesheetRow
```

## 5. Contrato de lectura y pantalla

### 5.1 `getTimesheetState`

```ts
export type TimesheetRequest = {
  /** El `semana` de la URL ya validado, o `null`. */
  readonly day: string | null;
};

/**
 * TS-95: la grilla de la semana, armada en el servidor con la zona y el
 * primer día de la semana de la persona. Solo entradas cerradas (TS-49).
 * `now` existe para que los tests fijen el día.
 */
export async function getTimesheetState(
  actor: Actor,
  workspace: TrackerWorkspace,
  request: TimesheetRequest,
  now: Date = new Date(),
): Promise<TimesheetState>;
```

- **La semana** sale de `calendarPeriodsOf({ mode: "week", day:
request.day }, todayKey, workspace)`: la que contiene el día pedido, o la
  actual si no hay día o si la pedida no se puede navegar (CAL-17). La URL no
  se reescribe (TS-10).
- **Una lectura**: `listTimesheetEntries` sobre `[startOfDayKey(inicio),
startOfDayKey(inicio + 7))`.
- **Cada entrada va a la celda `(par, dayKey(startedAt))`** (TS-07); una que
  cruza la medianoche o el fin de semana cuenta entera en el día de su inicio
  (TS-102, TS-103). Las sumas son de `durationSeconds`.
- **Las filas** son los pares con al menos una entrada cerrada (TS-14), en este
  orden (TS-15): las de proyectos con cliente, por cliente (`compareNames`);
  después las de proyectos sin cliente; después «Sin proyecto». Dentro de un
  cliente, por proyecto (`compareNames`); dentro de un proyecto, la fila sin
  tarea primero y después por tarea (`compareNames`). El proyecto, la tarea y el
  cliente se muestran con su nombre de ahora, archivados o no (TS-21, TS-22).
  Cada fila lleva sus `entryIds` en orden de id.
- **Los días**: `label` con `weekdayLabel`, `fullLabel` con `fullWeekdayLabel`,
  `isToday`, `isWeekend` por el día de la semana de la clave (sábado y domingo),
  `beforeFloor` contra el piso, y `closedSeconds`.
- **`weekLabel`** con `weekKeyLabel`; `previousStart` y `nextStart` a siete
  días; `currentStart` es el inicio de la semana de hoy.
- **`canTrack`**: `can(actor, "timeEntry.own.create", ownTimeEntryResource(actor))`.
- **`storageKey`**: `` `clock:planilla:${workspaceId}:${userId}` ``.

### 5.2 La ruta, la página y el error

- **`src/app/(app)/planilla/page.tsx`**: `requireSession()`;
  `timesheetWeekParams.safeParse(await searchParams)`; un parámetro inválido o
  repetido se ignora (TS-10, CAL-17). Dibuja `<Suspense fallback={<TimesheetSkeleton />}>`
  con `<TimesheetScreen actor workspace request />`.
- **`src/app/(app)/planilla/error.tsx`**: «No se pudo cargar la planilla.» con
  «Reintentar», como el del calendario. Nunca una grilla vacía, que se
  confundiría con TS-87.
- **`TimesheetScreen`** (Server Component, `components/timesheet/timesheet-screen.tsx`):
  `getTimesheetState` y `getTrackingCatalog` en paralelo; el `h1` visible
  «Planilla de horarios» (TS-04); `InactiveMembershipNotice` sin `canTrack`
  (TS-76); `DisplayFormatsProvider` con los formatos de esta lectura (ADR 0012)
  y `TrackingCatalogProvider`; adentro, `TimesheetView`.
- **La navegación** suma «Planilla» con `href: "/planilla"` entre «Calendario» y
  «Proyectos» (TS-04).
- **`timesheetHref(start)`** (`components/timesheet/timesheet-href.ts`) es la
  única función que arma `/planilla?semana=…`.

### 5.3 La barra de la semana

Arriba a la derecha (TS-09), en este orden:

- **«Semana anterior»** y **«Semana siguiente»**: enlaces con ícono a
  `timesheetHref(previousStart)` y `timesheetHref(nextStart)`, con esos nombres
  accesibles (`calendarLabels.previousWeek`, `nextWeek`).
- **El rango**: `PeriodPicker` con `periodLabel={weekLabel}` y
  `hrefOf={timesheetHref}`; elegir un día lleva a su semana (TS-09).
- **«Esta semana»**: un enlace a `timesheetHref(currentStart)`, solo si
  `weekStart !== currentStart`.

### 5.4 La grilla

Una `<table>` nombrada por el `h1` (TS-100):

- **Encabezado**: «Proyectos»; los siete días con `label`, `scope="col"`, fondo
  distinto con `isWeekend`, y con `isToday` resaltada y `aria-current="date"`
  (TS-08); «Total»; una columna sin texto visible para «Quitar fila», con su
  encabezado solo para lectores («Acciones»).
- **Cada fila**: el encabezado de fila (`scope="row"`) con el punto del color,
  «Proyecto» o «Proyecto: Tarea» y el cliente en gris (TS-13), o «Sin proyecto»
  en gris sin punto ni cliente (TS-20); las siete celdas (§5.5); el total de la
  fila (TS-44), `0:00` en una vacía; el botón «Quitar fila» (§5.8).
- **Pie**: «Total» como encabezado de fila, el total de cada día (TS-45) y el
  de la semana (TS-46).
- **Los totales** se suman en segundos y se formatean una vez con
  `formatDuration(Math.floor(segundos / 60))`, también con las escrituras en
  vuelo (§5.6). **Un total en cero va en gris** (TS-45), en los tres.
- **El orden de las filas** (TS-15): las del servidor en su orden, salvo las
  agregadas en esta carga de la página; después, en el orden en que se
  agregaron, las agregadas en esta carga —tengan o no entradas ya— y las vacías
  que guarda el navegador. Una fila agregada que ya tiene entradas vuelve a su
  lugar con la próxima recarga.
- **Sin descripciones ni etiquetas** (TS-43).

El armado vive en una función pura, `timesheetGrid`
(`components/timesheet/timesheet-model.ts`), con su test: recibe el estado, el
catálogo, las filas guardadas, las agregadas en esta carga y las escrituras en
vuelo, y devuelve las filas en orden, con cada celda, si se puede escribir y
qué muestra, los totales y los pares que el selector excluye.

### 5.5 Una celda

**Qué muestra** (TS-24): vacía si no tiene entradas; si no, `formatDuration`
de sus minutos, también `0:00` (TS-118). Mientras su escritura viaja, el valor
pedido.

**Cuándo se escribe**: con `canTrack`, el día no anterior al piso (TS-12), la
fila con par elegido (TS-16), y la celda con entradas o el par ofrecido por el
catálogo (`isTrackablePair`, TS-21, D13-8). Si no, la celda es texto y no
recibe el foco.

**Cómo se escribe**: es un `ClockField` sin `format` (el de duración), con el
nombre accesible «{fila}, {fullLabel}» —«Rediseño: Maquetado, miércoles
01/10», «Sin proyecto, lunes 28/09»— (TS-100). Su `onCommit`:

1. `parseDurationInput(texto)`; `null` o `0` devuelve `null`: la celda vuelve
   al valor anterior y se marca (TS-27, TS-35, TT-21). No sale ningún pedido.
2. **Igual a lo que la celda muestra**: devuelve el rótulo sin mandar nada
   (TS-36).
3. Si no, `write({ date, projectId, taskId, minutes })` de `useCellWrites` y
   devuelve el rótulo de `minutes`. `write` no manda nada si para esa celda ya
   viaja un pedido con esos minutos (§5.6): es lo que hace que Enter seguido de
   la pérdida del foco mande un solo pedido.

`onSubmit` (Enter) lleva el foco a la celda escribible del mismo día en la
próxima fila que la tenga; si no hay, el foco se queda (TS-98). `onCancel`
(Esc) vuelve al valor mostrado (TS-28). Lo tecleado y no confirmado sobrevive a
una revalidación (`ClockField` ya lo hace).

**`ClockField` suma `busy`** (y nada más): con `busy`, el campo es `readOnly`,
lleva `aria-busy` y se ve atenuado, **sin perder el foco** (TT-55; la lección
de `aria-disabled` de `estado-fase1.md`). La celda pasa `busy` mientras su
escritura viaja.

### 5.6 Las escrituras de la grilla (`use-cell-writes.ts`)

```ts
/** Una celda: el día y el par, y cómo nombrarla en el aviso. */
type CellWriteRequest = {
  readonly input: SetTimesheetCellInput;
  readonly name: string;
};

type CellWrites = {
  /**
   * Por celda (clave `día|proyecto|tarea`), los minutos del último pedido que
   * viaja: la vista optimista y `busy`.
   */
  readonly pending: ReadonlyMap<string, number>;
  /** La última falla, con su pedido: lo que dice el aviso y reenvía «Reintentar». */
  readonly failure: {
    readonly request: CellWriteRequest;
    readonly code: TimeEntryErrorCode | "unexpected";
    readonly message: string;
  } | null;
  readonly write: (request: CellWriteRequest) => void;
  readonly retry: () => void;
  readonly dismiss: () => void;
};

export function useCellWrites(): CellWrites;
```

- **`pending` es estado propio, no `useOptimistic`**: un `useReducer` sobre el
  estado de `cell-writes.ts`, con un registro por pedido (su celda y sus
  minutos). React agrupa las transiciones en curso, así que con
  `useOptimistic` una celda rechazada seguiría con el valor pedido, y `busy`,
  mientras viajara cualquier otra escritura de la grilla, que es lo normal al
  cargar con Tab. Por pedido:
  - `write` lo agrega antes de llamar a la action;
  - con un rechazo o un error de red, sale de `pending` en una actualización
    urgente, después del `await`: la celda vuelve a lo que dice el servidor y
    deja de estar `busy` aunque otra escritura siga en vuelo;
  - con éxito, sale de `pending` dentro de `startTransition`, después del
    `await`, para que se confirme junto con la revalidación que trae el valor
    nuevo y la celda no muestre un instante el anterior (el mismo motivo que
    `use-action.ts:64-66`).
- **Lo que viaja por celda también está en un `ref`**, que `write` actualiza de
  forma sincrónica y que se limpia cuando termina el pedido que lo puso, no
  otro. `write` no manda nada si para esa celda ya viaja un pedido con los
  mismos minutos: Enter y la pérdida del foco que le sigue llegan antes de que
  React vuelva a dibujar, así que comparar con `pending` no alcanza.
- **Una falla reemplaza a la anterior**; una escritura nueva **de la misma
  celda** baja el aviso; una de otra celda no. «Reintentar» reenvía el pedido de
  la falla, tal cual.
- **Un error de red** es `unexpected` con `timeEntryMessages.unexpected`.
- El estado puro (agregar, resolver, fallar, reintentar, bajar) va en
  `cell-writes.ts`, con su test; el hook lo conecta con React.

### 5.7 Añadir una fila y las filas que guarda el navegador

**«Añadir nueva fila»** (TS-16), debajo de la grilla, con `canTrack` y algún
día de la semana no anterior al piso (TS-90). Agrega al final una fila cuyo
encabezado es el `ProjectPicker` con `variant="row"`, `value={null}`,
`placeholder` «Seleccionar proyecto», `label` «Proyecto de la fila nueva» y
`excluded` con los pares de todas las filas de la grilla; el foco va a su
disparador. Sus celdas no se escriben y su total es `0:00`. Si ya hay una fila
así, el botón lleva el foco a su selector (D13-10).

**Elegir el par** guarda la fila en el navegador y en las agregadas de esta
carga; el encabezado pasa a ser el de una fila con par (§5.4), sin selector
(TS-23). Elegir «Sin proyecto» vale igual (TS-20).

**El selector** (D13-9): `pickerView(catalog, search, excluded)` no devuelve las
opciones cuyo par está en `excluded`, ni «Sin proyecto» si `(null, null)` está;
la opción de un proyecto excluido cuyas tareas siguen ofrecidas queda,
inactiva. Con la búsqueda vacía y nada que ofrecer, el vacío nuevo `allUsed`,
«Todas las combinaciones ya tienen fila esta semana.». Sin proyectos en el
workspace, TS-88 como hoy, con «Sin proyecto» elegible.

**`isTrackablePair(catalog, pair)`** (`picker-model.ts`): «Sin proyecto» es
`true`; un proyecto, si está en algún grupo del catálogo; con tarea, si además
está entre sus tareas.

**Lo que guarda el navegador** (`stored-rows.ts`, puro, con su test, y
`use-stored-rows.ts`, con `useSyncExternalStore` sobre `localStorage` y el
evento `storage`):

```ts
/** La forma en `localStorage[storageKey]`. Lo que no la cumple se descarta entero. */
const storedRows = z.object({
  version: z.literal(1),
  /** Por primer día de semana (P-16): las filas vacías agregadas en esa semana. */
  weeks: z.record(
    z.string(),
    z.array(
      z.object({
        projectId: z.uuid().nullable(),
        taskId: z.uuid().nullable(),
      }),
    ),
  ),
});
```

- **Se agrega** un par a su semana al elegirlo, sin repetir (`samePair`).
- **Se olvida** al quitar la fila (§5.8); cuando la lectura del servidor trae
  una fila con ese par en esa semana —la fila ya sale de sus entradas (TS-19)—;
  y cuando `isTrackablePair` da falso —no se dibuja una fila que no se puede
  escribir—. Una semana sin filas se borra del objeto.
- **No se dibuja** en otra semana (P-16), ni sin `canTrack` (TS-76).
- **Sin `localStorage`** —modo privado sin cuota, un error al escribir— las
  filas viven solo en la página; no hay aviso.
- **El servidor no ve nada de esto** (TS-95): las filas vacías se suman al
  dibujar.

### 5.8 Quitar una fila

- **«Quitar fila»** es un botón con ícono de X después del total, con el nombre
  «Quitar fila {fila}» (TS-52); el de una fila sin par elegido, «Quitar la fila
  nueva». Solo con `canTrack`. Inactivo (`aria-disabled`) mientras alguna
  escritura de esa fila viaja.
- **Una fila sin entradas** —vacía guardada o sin par— se quita sin diálogo y
  sin pedido: se olvida en el navegador.
- **Una con entradas** abre el diálogo de TT-61: título «¿Quitar la fila
  «{fila}»?», descripción «Se van a borrar {n} entradas que suman {total}. No
  se puede deshacer.» (con una: «Se va a borrar 1 entrada de {total}. No se
  puede deshacer.»), con `entryIds.length` y `closedSeconds` de la fila
  (TS-53). «Cancelar» devuelve el foco a la X; «Quitar fila» manda
  `removeTimesheetRow({ weekStart, projectId, taskId, ids: entryIds })`.
- **Mientras viaja**, la fila se oculta y el foco va a «Añadir nueva fila»
  antes de ocultarla: la X que tenía el foco desaparece. Con éxito, la fila
  sale con la revalidación y se olvida en el navegador; si quedó en la fila
  alguna entrada que no estaba en `ids`, vuelve con ella (D13-6). Con falla,
  vuelve y el aviso de la pantalla dice «No se pudo quitar la fila.» con el
  mensaje, y «Reintentar» con `unexpected` (TS-92).
- **El timer no se toca** (TS-54): el diálogo cuenta solo las cerradas, porque
  la fila solo tiene esas.

### 5.9 Avisos

Una región de la pantalla, encima de la grilla, siempre montada y con
`role="alert"`, muestra el aviso de la última falla, de una celda o de una
fila, con `ActionFeedback`:

- **Celda** (TS-91): «No se pudo guardar la celda.», el mensaje del servidor
  —«Editá las entradas de esta celda desde el rastreador.», «Ese proyecto ya no
  está disponible.», …— y «Reintentar» solo con `unexpected` (TT-89).
- **Fila** (TS-92): «No se pudo quitar la fila.».
- **El aviso no toma el foco**: la persona ya está en otra celda. Lo anuncia el
  rol.
- **Una celda rechazada vuelve a su valor** en cuanto llega el rechazo, aunque
  otra escritura siga en vuelo: su pedido sale de `pending` (§5.6) y la
  revalidación trae el real (TS-27, TS-79).

### 5.10 Estados vacíos y de solo lectura

- **TS-87**: sin filas, el cuerpo de la tabla tiene una fila con «No hay horas
  cargadas esta semana» que ocupa todas las columnas; el pie de totales y
  «Añadir nueva fila» siguen.
- **TS-90**: una semana entera anterior al piso, sin «Añadir nueva fila» y sin
  celdas escribibles.
- **TS-76, TS-94**: sin `canTrack`, el aviso de TT-92, la grilla con sus
  valores como texto, sin «Añadir nueva fila» ni «Quitar fila», y sin las filas
  guardadas en el navegador.
- **La carga**: `TimesheetSkeleton` con `role="status"`, `aria-busy` y
  «Cargando la planilla».
- **TS-97**: `useTrackerRefresh()` en `TimesheetView`: al enfocar, al volver a
  ser visible y cada 60 segundos.

### 5.11 Teclado y accesibilidad

- **Tab y Mayús+Tab** recorren, por fila y de izquierda a derecha, el selector
  de una fila nueva, las celdas escribibles y la X (TS-98). Las celdas que no se
  escriben no reciben el foco.
- **Enter** guarda y baja (§5.5); **Esc** descarta (TS-28).
- **Los atajos del rastreador no existen acá** (TS-101): `n`, `c`, `s` y `m` no
  hacen nada, porque `useTrackerShortcuts` solo se monta en el rastreador.
- **La tabla** tiene encabezados de fila y de columna con `scope`; cada celda
  escribible tiene su nombre (§5.5); los totales se nombran por sus
  encabezados (D13-12).
- **El atenuado no es lo único**: la celda en vuelo lleva `aria-busy`.

### 5.12 Textos

`components/timesheet/labels.ts`, nuevo:

| Clave              | Texto                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `heading`          | «Planilla de horarios»                                                                                                                                 |
| `loading`          | «Cargando la planilla»                                                                                                                                 |
| `loadFailed`       | «No se pudo cargar la planilla.»                                                                                                                       |
| `projectsColumn`   | «Proyectos»                                                                                                                                            |
| `actionsColumn`    | «Acciones»                                                                                                                                             |
| `thisWeek`         | «Esta semana»                                                                                                                                          |
| `empty`            | «No hay horas cargadas esta semana»                                                                                                                    |
| `addRow`           | «Añadir nueva fila»                                                                                                                                    |
| `selectProject`    | «Seleccionar proyecto»                                                                                                                                 |
| `newRowProject`    | «Proyecto de la fila nueva»                                                                                                                            |
| `removeNewRow`     | «Quitar la fila nueva»                                                                                                                                 |
| `removeRow`        | `(fila) =>` «Quitar fila {fila}»                                                                                                                       |
| `removeRowTitle`   | `(fila) =>` «¿Quitar la fila «{fila}»?»                                                                                                                |
| `removeRowBody`    | `(n, total) =>` «Se va a borrar 1 entrada de {total}. No se puede deshacer.» / «Se van a borrar {n} entradas que suman {total}. No se puede deshacer.» |
| `removeRowConfirm` | «Quitar fila»                                                                                                                                          |
| `cellLabel`        | `(fila, día) =>` «{fila}, {día}»                                                                                                                       |
| `cellNotSaved`     | «No se pudo guardar la celda.»                                                                                                                         |
| `rowNotRemoved`    | «No se pudo quitar la fila.»                                                                                                                           |

«Total» (`trackerLabels.weekTotal`), «Sin proyecto» (`projectLabels.noProject`),
«Semana anterior» y «Semana siguiente» (`calendarLabels`) y «Cancelar» se
reusan. `projectLabels.pickerAllUsed`: «Todas las combinaciones ya tienen fila
esta semana.». El nombre de una fila es `projectLabels.noProject`, el nombre del
proyecto, o `projectTaskLabel(proyecto, tarea)`.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/timesheet-cell.ts                     (nuevo)
/home/maxi/program/clock/src/modules/time-entry/timesheet-cell.test.ts                (nuevo)
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/timesheet.integration.test.ts         (nuevo)
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/test/factories.ts
```

- **Los casos del service van en `timesheet.integration.test.ts`**, no en
  `service.integration.test.ts`.
- `src/test/factories.ts` entra solo para `id` y `createdAt` opcionales en
  `seedTimeEntry`, que piden el desempate de TS-34 y la barrera de la celda.

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/planilla/page.tsx                              (nuevo)
/home/maxi/program/clock/src/app/(app)/planilla/error.tsx                             (nuevo)
/home/maxi/program/clock/src/components/layout/app-nav.tsx
/home/maxi/program/clock/src/modules/time-entry/components/clock-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/period-picker.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-toolbar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timesheet/                 (nuevo)
    timesheet-screen.tsx, timesheet-view.tsx, timesheet-toolbar.tsx,
    timesheet-table.tsx, timesheet-row.tsx, timesheet-cell.tsx,
    remove-row-dialog.tsx, timesheet-href.ts, labels.ts,
    timesheet-model.ts, timesheet-model.test.ts,
    stored-rows.ts, stored-rows.test.ts, use-stored-rows.ts,
    cell-writes.ts, cell-writes.test.ts, use-cell-writes.ts,
    timesheet-cell.test.tsx, timesheet-view.test.tsx
/home/maxi/program/clock/src/modules/project/components/picker-model.ts
/home/maxi/program/clock/src/modules/project/components/picker-model.test.ts
/home/maxi/program/clock/src/modules/project/components/project-picker.tsx
/home/maxi/program/clock/src/modules/project/components/project-picker.test.tsx
/home/maxi/program/clock/src/modules/project/components/labels.ts
```

Los nombres de archivo dentro de `timesheet/` son orientativos salvo
`timesheet-model.ts`, `stored-rows.ts`, `cell-writes.ts`, `timesheet-href.ts` y
`labels.ts`, que otros archivos y los tests citan.

### tests-slice13

```
/home/maxi/program/clock/e2e/timesheet.spec.ts                                        (nuevo)
/home/maxi/program/clock/e2e/timesheet-page.ts                                        (nuevo)
/home/maxi/program/clock/e2e/database.ts                                              (solo si hace falta)
/home/maxi/program/clock/e2e/days.ts                                                  (solo si hace falta)
```

`timesheet-page.ts`: `goToTimesheetByNav`, `timesheetUrl(start)`, la tabla, el
campo de una celda por su nombre, el total de una fila, el de un día y el de la
semana, «Añadir nueva fila», el selector de la fila nueva, «Quitar fila» de una
fila, el diálogo, el aviso de la pantalla y la barra de la semana.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/timesheet.md
```

Antes del merge, lo que §1 enumera en «Lo que el slice decide», con la sección
«Slice 13», las correcciones fechadas, P-14 y P-16 a cerrados, y TS-32 y la
sección 20 apuntando al ADR 0018. TS-79 con el texto del 13 —«Editá las
entradas de esta celda desde el rastreador.»—, en su regla y en la tabla de
mensajes, ya está registrado; se comprueba que siga así.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/server/action.ts`,
`src/server/audit.ts`, `src/server/create-once.ts`, `src/hooks/`, `src/lib/`,
`project/service.ts`, `project/schema.ts`, `project/repository.ts`,
`tag-picker.tsx`, el rastreador (`tracker-*`, `entry-*`, `manual-bar.tsx`,
`bulk-*`), el resto del calendario y los ADR. Los contratos y correcciones
anteriores son históricos; el mapa y el estado los actualiza el team-lead.

### Handshake de orden

0. **Los ADR 0018 y 0019 aceptados por el usuario**; la ronda 1 de
   `architecture-reviewer` aplicada en este contrato.
1. **Primer commit de `backend-dev`**: `instantFromLocalOrLater` y
   `fullWeekdayLabel` con sus tests; los esquemas de §4.1 con `schema.test.ts`;
   `timesheet-cell.ts` con su test. **Avisa a `frontend-dev`**: desde acá los
   tipos de la planilla tienen su forma final.
2. **`frontend-dev` arranca en paralelo con el paso 1** por lo que no depende de
   los tipos: `busy` en `ClockField`, `hrefOf` en `PeriodPicker`, `excluded`,
   `allUsed` e `isTrackablePair` en `project` con sus tests, `stored-rows.ts` y
   `cell-writes.ts` con los suyos, y la navegación. Con el paso 1 en la rama,
   la pantalla.
3. **`tests-slice13` arranca con el paso 1**: escribe el spec y confirma que
   falla por la funcionalidad y no por el arnés.
4. `backend-dev` sigue con el repository, `getTimesheetState`,
   `setTimesheetCell`, `removeTimesheetRow`, las actions y los tests de §7.
5. `parity-analyst`, antes del merge.

## 7. Criterios de aceptación

1. **Los esquemas** — `setTimesheetCellInput` acepta un día, un par y de 1 a
   1439 minutos; rechaza 0 con `tooShort`, 1440, 1.5 y una cadena con
   `unexpected`, la tarea sin proyecto con `taskNeedsProject` y un día que no
   existe con `invalidDate`. `removeTimesheetRowInput` igual sin minutos, con
   `ids` de 1 a 200: ninguno es `bulkEmpty`, 201 es `bulkTooMany`, y los ids
   salen en minúsculas y sin repetir. `timesheetWeekParams` no pasa con un
   parámetro repetido.
2. **`src/server/time`** — `instantFromLocalOrLater`: una hora que existe da lo
   mismo que `instantFromLocal`; Madrid 2026-03-29 a las 02:30 da `01:00Z`; la
   hora repetida da el segundo instante; `Pacific/Apia` 2011-12-30 da `null`;
   todo con el proceso en otra zona. `fullWeekdayLabel` da «miércoles 01/10» y
   el año fuera del año de hoy, en los cuatro formatos.
3. **La regla de la celda** — `cellWrite` y `latestStarting`, caso por caso:
   vacía, igual, una, subir, bajar, TS-104, TS-105, TS-106, TS-118, TS-119
   (cruza y termina a las 00:00), TS-120, el desempate por `createdAt` y por
   id, la baja que deja 59 segundos y la que deja 60, el año 9999.
4. **Celda vacía** — Crea una entrada a las 09:00 locales del día, de `V`
   minutos, sin descripción ni etiquetas, con el facturable por defecto del
   proyecto; «Sin proyecto» crea sin proyecto y no facturable (TS-29 … TS-31).
   En Madrid, una celda del 2026-03-28 con `20:00` termina 20 horas reales
   después del inicio.
5. **Una entrada** — Conserva el inicio con sus segundos y lleva el fin a
   inicio + `V`; no cambian descripción, etiquetas ni facturable (TS-33). Del
   timer `10:00:40`–`11:31:22`, `2:00` deja `10:00:40`–`12:00:40` (TS-106). En
   Madrid, una entrada que cruza el atraso del 2026-10-25 con `2:00` dura dos
   horas reales (TS-107). Una de más de un día se achica (TS-104).
6. **Varias** — Subir crea una entrada que empieza en el fin de la que termina
   más tarde, de `V − S`, con la descripción, las etiquetas y el facturable de
   la que empieza más tarde (TS-34, TS-120). Bajar adelanta el fin de la que
   empieza más tarde; con el mismo inicio, la de `created_at` más reciente.
7. **Los rechazos de TS-79** — La que termina más tarde termina otro día, o a
   las 00:00 del siguiente, al subir; la que empieza más tarde quedaría con
   menos de un minuto al bajar, también la de cero minutos (TS-118):
   `validation` con `cellNeedsEntryEdit`, nada escrito, ninguna constancia.
8. **Sin cambios** — Con la celda en `V` no se escribe ni se deja constancia y
   responde `{ entry: null }`; una celda de `1:30:42` con `90` conserva sus
   segundos (TS-36, TS-105).
9. **El punto fijo** — Repetir cada pedido que terminó bien de los criterios 4
   a 6 no escribe ni deja constancia.
10. **Una celda a la vez** (ADR 0019) — Con la barrera tomando el bloqueo de la
    celda vacía y dos pedidos encolados detrás (`1:00` y después `2:00`), queda
    una sola entrada, de `2:00`. Lo mismo sobre una celda con una entrada: un
    solo `update` final con el valor del segundo.
11. **El timer** — Una celda cuyo único contenido es la entrada que corre está
    vacía: escribirla crea una entrada y la que corre queda igual. Con una
    cerrada y la que corre, se edita la cerrada (TS-116). La lectura no cuenta
    la que corre en ninguna celda, fila ni total, y una fila que solo la
    tendría no existe (TS-49, TS-50).
12. **El día** — Un día anterior al 2000-01-01 responde `beforeFloor`; uno cuyo
    fin pasaría del 9999, `invalidDate`; `Pacific/Apia` 2011-12-30,
    `nonexistentClock`.
13. **Las referencias** — Una celda vacía de un proyecto archivado, de un
    privado sin acceso o de una tarea hecha responde `not_found` con su texto
    (TS-77, TS-78); una celda con una entrada de un proyecto archivado se edita;
    subir una celda con varias de un proyecto archivado responde
    `projectUnavailable`, y una con una etiqueta archivada en la que se copia,
    `tagUnavailable` (D13-5). Nada escrito.
14. **Solo lo propio** — Una entrada de otra persona con el mismo par y día no
    cuenta ni se toca. Una membresía desactivada recibe `forbidden` **sin
    esperar**: con una barrera que toma el bloqueo de la celda (`lockCell`) y
    otra que bloquea una entrada de la celda (`outcomeWhileLocked`), la llamada
    termina con la barrera tomada.
15. **Quitar una fila** — Borra las de `ids` que son cerradas propias del par en
    los siete días; no toca las de otras semanas, otros pares —`(P, —)` no
    borra `(P, T)`—, la que corre ni las ajenas, aunque estén en `ids`; «Sin
    proyecto» borra solo las sin proyecto. Una entrada agregada a la fila
    después de la lectura y un timer de la fila detenido después de la lectura
    —cerradas en la cota, fuera de `ids`— no se borran, y la lectura siguiente
    trae la fila con ellas. Deja una constancia por entrada con sus etiquetas;
    repetida responde `{ ids: [] }` sin constancias; desactivada, `forbidden`.
16. **Quitar una fila no se traba** — Una fila y un borrado masivo sobre las
    mismas entradas en orden opuesto, cruzados con `raceThroughBarrier`,
    terminan los dos sin `40P01`. Una escritura de celda encolada detrás del
    bloqueo de filas de `removeTimesheetRow` —con `queueBehindBarrier`: la
    barrera bloquea la entrada de la celda, y detrás se encolan
    `removeTimesheetRow` con esa entrada en `ids` y después `setTimesheetCell`
    sobre la celda— termina sin `40P01` y crea la entrada sobre la celda ya
    vacía.
17. **La lectura** — Las filas y su orden (TS-15), con cliente, sin cliente y
    «Sin proyecto», con sus `entryIds`; las celdas por el día local de la zona
    de la persona (TS-07); la entrada que cruza la medianoche en su día de
    inicio (TS-102); los días con sus rótulos, fin de semana, hoy y piso; los
    totales; un proyecto archivado con su fila (TS-21); la semana de la persona
    (TS-06); un día que no es inicio de semana lleva a la suya; una semana que
    no se puede navegar cae a la actual.
18. **La capa de action** — Traduce `cellNeedsEntryEdit`, el `ProjectError` y
    los `ZodError`; revalida `"/"`, `"/calendario"` y `"/planilla"` también con
    error, en las dos nuevas y en las existentes.
19. **La auditoría** — `timeEntry.createFromCell` con sus campos y `sourceId` al
    subir; `timeEntry.updateFromCell` con `endedAt`; `timeEntry.removeRow` con
    la fila y sus etiquetas; ninguna en `unchanged` ni en un rechazo.
20. **El modelo de la grilla** — `timesheetGrid`: orden con filas agregadas y
    guardadas; qué celdas se escriben (piso, `canTrack`, fila sin par, par no
    ofrecido con y sin entradas); totales con escrituras en vuelo; la próxima
    celda de Enter saltando las que no se escriben; los pares excluidos.
21. **Lo que guarda el navegador** — `stored-rows.ts`: una forma inválida se
    descarta; agregar no repite; se olvida al quitar, al llegar del servidor y
    sin catálogo; cada semana aparte.
22. **El selector** — `pickerView` con `excluded`: no devuelve los pares
    excluidos ni «Sin proyecto» excluido; deja el proyecto inactivo si quedan
    tareas; `allUsed` con todo excluido. `isTrackablePair` en sus cuatro casos.
23. **Las escrituras de la grilla** — `cell-writes.ts`: dos en vuelo; un pedido
    que termina, bien o mal, sale de `pending` sin sacar a otro de la misma
    celda; una falla no se baja con otra celda y sí con la misma; «Reintentar»
    reenvía el pedido de la falla. En `timesheet-view.test.tsx`, dos escrituras
    en celdas distintas, la primera rechazada y la segunda en vuelo: la primera
    ya muestra su valor anterior y no está `busy`.
24. **La celda** — Rechaza y marca `abc`, `0` y vacío sin llamar a la action;
    `1:30` sobre `1:30` y `90` sobre `1:30` no llaman; Esc vuelve. Enter y
    después la pérdida del foco llaman una vez, con `useCellWrites` real
    (`timesheet-view.test.tsx`).
25. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
    `main` sin cambiar afirmaciones.
26. **La pantalla** — Los recorridos de abajo.

### Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo                | Archivo                                                            | Mutante que tiene que caer                                                                                                                                 |
| -------- | ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad              | `schema.test.ts`                                                   | sin `.int`; `.max(MINUTES_PER_DAY)`; sin el `refine` de TT-70; `ids` sin `.max(BULK_MAX)`                                                                  |
| 2        | unidad              | `time.test.ts`                                                     | devolver `null` como `instantFromLocal`; tomar el inicio del hueco y no su fin; `EEE` en vez de `EEEE`                                                     |
| 3        | unidad              | `timesheet-cell.test.ts`                                           | `S` en segundos; `latestStarting` sin `createdAt`; `base` = la que empieza más tarde; aceptar el día siguiente en `base`; umbral `> 0` en vez de `>= 60 s` |
| 4        | integración         | `timesheet.integration.test.ts`                                    | el fin como rótulo convertido (cae Madrid: 19 h); el facturable fijo                                                                                       |
| 5        | integración         | `timesheet.integration.test.ts`                                    | el fin desde el inicio truncado al minuto (`1:59`); pasar por `entryTimesFor` (rechaza TT-110 y da 1 h o 3 h en Madrid)                                    |
| 6        | integración         | `timesheet.integration.test.ts`                                    | copiar de la que termina más tarde; duración `V` en vez de `V − S`; achicar la que termina más tarde                                                       |
| 7        | integración         | `timesheet.integration.test.ts`; `audit.integration.test.ts`       | sin la comprobación del día de `base`; borrar la entrada en vez de rechazar                                                                                |
| 8        | integración         | `timesheet.integration.test.ts`                                    | comparar segundos (trunca `1:30:42` a `1:30:00`)                                                                                                           |
| 9        | integración         | `timesheet.integration.test.ts`; `audit.integration.test.ts`       | sumar en vez de fijar (el segundo intento agrega)                                                                                                          |
| 10       | integración         | `timesheet.integration.test.ts`                                    | sin `lockCell` (la barrera falla); leer antes del bloqueo (dos entradas); `repeatable read` en la transacción (dos entradas)                               |
| 11       | integración         | `timesheet.integration.test.ts`                                    | la lectura y el bloqueo sin `ended_at is not null`                                                                                                         |
| 12       | integración         | `timesheet.integration.test.ts`                                    | sin el piso; sin la guarda del día siguiente (`RangeError` sale `unexpected`)                                                                              |
| 13       | integración         | `timesheet.integration.test.ts`                                    | validar el par en `setEnd`; no validar en `append`; no llamar a `assertTaggable` en `append`                                                               |
| 14       | integración         | `timesheet.integration.test.ts`; `permissions.integration.test.ts` | la celda sin `user_id`; el permiso después de `lockCell` o de `lockClosedInSlice` (la llamada espera la barrera)                                           |
| 15       | integración         | `timesheet.integration.test.ts`; `audit.integration.test.ts`       | `task_id = null` en vez de `is null`; sin `ended_at is not null`; constancia sin `tagIds`; borrar la cota entera sin cruzarla con `ids`                    |
| 16       | integración         | `timesheet.integration.test.ts`                                    | borrar por predicado sin bloquear antes en orden de id (`40P01`); la celda leída sin `for update` (edita la entrada borrada y sale `unexpected`)           |
| 17       | integración         | `timesheet.integration.test.ts`                                    | ordenar «Sin proyecto» primero; el día en UTC; contar la que corre                                                                                         |
| 18       | integración         | `actions.integration.test.ts`                                      | revalidar sin `"/planilla"`; revalidar solo con éxito                                                                                                      |
| 19       | integración         | `audit.integration.test.ts`                                        | constancia en `unchanged`                                                                                                                                  |
| 20       | unidad              | `timesheet-model.test.ts`                                          | las filas agregadas en su orden alfabético; la celda vacía de un par no ofrecido escribible; el total sin lo que viaja                                     |
| 21       | unidad              | `stored-rows.test.ts`                                              | no olvidar al llegar del servidor; guardar sin semana                                                                                                      |
| 22       | unidad              | `picker-model.test.ts`                                             | excluir el proyecto entero con sus tareas; ofrecer «Sin proyecto» ya usado                                                                                 |
| 23       | unidad y componente | `cell-writes.test.ts`; `timesheet-view.test.tsx`                   | un solo último pedido para toda la grilla (el de `useAction`); `pending` en `useOptimistic` (la rechazada sigue con el valor pedido y `busy`)              |
| 24       | componente          | `timesheet-cell.test.tsx`; `timesheet-view.test.tsx`               | comparar lo que viaja con `pending` y no con el `ref` (Enter y foco mandan dos)                                                                            |
| 25       | todas               | las suites existentes                                              | —                                                                                                                                                          |
| 26       | e2e                 | `e2e/timesheet.spec.ts`                                            | —                                                                                                                                                          |

**El criterio 10 se cruza con `queueBehindBarrier`**: el `hold` llama a
`timeEntryRepository.lockCell` con la misma celda; los dos pedidos se encolan en
orden. Sin `lockCell`, ninguno espera y la barrera falla con «Un corredor
terminó sin trabarse»; con la lectura antes del bloqueo, los dos leen la celda
vacía y crean.

**Un mutante declarado equivalente** se prueba antes con pedidos inválidos, ids
ajenos y membresía inactiva, y se compara la respuesta y si la llamada espera un
bloqueo, no solo las filas (lección del 11b).

### Recorridos obligatorios de `e2e/timesheet.spec.ts`

Dueño: `tests-slice13`. **Cada recorrido usa una persona propia** y un sufijo
propio en proyectos y etiquetas. Las escrituras van sobre días de la semana
anterior —la planilla crea a las 09:00— y las respuestas se esperan con
`withServerAction`.

1. **La pantalla** (TS-04, TS-08, TS-09, TS-87). «Planilla» en la navegación
   lleva a `/planilla`; el título; «Proyectos», siete días con su rótulo y
   «Total»; «Esta semana» en el rango y sin el enlace «Esta semana»; el vacío;
   «Semana anterior» lleva a la anterior, la URL dice su primer día y aparece
   «Esta semana», que vuelve.
2. **Añadir una fila y escribir** (TS-16, TS-17, TS-29, TS-44 … TS-46, TS-98).
   En la semana anterior, «Añadir nueva fila»: el foco en «Seleccionar
   proyecto»; elegir P. Escribir `90` en el martes y Enter: la celda dice
   `1:30`, el foco baja o se queda si es la última fila, y los tres totales
   dicen `1:30`. En el rastreador, la entrada va de 09:00 a 10:30.
3. **Editar y no escribir** (TS-33, TS-36). Sobre esa celda, `2:00` y Tab: una
   sola entrada, de 09:00 a 11:00. Volver a escribir `2:00`, o `120`, y salir:
   ningún pedido (`recordActions`).
4. **Varias entradas** (TS-34, TS-79). Dos entradas de P el mismo día desde la
   barra manual, 10:00–11:00 «a» y 12:00–13:00 «b». `3:00`: una tercera de
   13:00 a 14:00 con «b». `2:30`: la de 13:00 queda en 13:30. `1:00`: el aviso
   «No se pudo guardar la celda.» con «Editá las entradas de esta celda desde
   el rastreador.», sin «Reintentar», y la celda vuelve a `2:30`.
5. **Lo que no se interpreta** (TS-27, TS-35, TS-28). `abc`, `0` y vacío vuelven
   al valor anterior con la marca y sin pedido; `Esc` descarta lo tecleado.
6. **El timer** (TS-39, TS-49, TS-50). Con un timer de P corriendo desde el
   rastreador, la planilla de esta semana no lo muestra en ninguna celda ni
   total; en la semana anterior, escribir `0:30` en una celda de P crea la
   entrada y el timer sigue corriendo en el rastreador.
7. **Reintentar con la respuesta perdida** (TS-37, TS-91). Escribir `1:00` en
   una celda vacía con la respuesta perdida (`route.fetch()` y
   `route.abort()`); comprobar desde otra pestaña (`openSecondTab`) que la
   celda ya dice `1:00`; «Reintentar»: respuesta `ok`, el aviso baja y en el
   rastreador hay una sola entrada.
8. **Quitar una fila** (TS-52, TS-53). Una fila con dos entradas en la semana y
   una en la siguiente: «Quitar fila P», el diálogo dice «Se van a borrar 2
   entradas que suman …»; «Cancelar» devuelve el foco a la X; confirmar: la
   fila sale, el foco está en «Añadir nueva fila» y la semana siguiente
   conserva su entrada.
9. **La fila que guarda el navegador** (TS-19, P-16). Agregar una fila con Q
   sin escribir y recargar: sigue. En la semana siguiente no está. En otra
   pestaña de otro contexto no está. Quitarla sin diálogo; recargar: no está.
10. **El selector no repite** (TS-18, TS-20). Con una fila de P y otra de «Sin
    proyecto», el selector de una fila nueva no ofrece P ni «Sin proyecto», y
    sí P: T.
11. **Proyecto archivado** (TS-21, TS-113). Con una entrada de R el lunes,
    archivar R y recargar: la fila sigue, su lunes se escribe y su martes es
    texto sin foco.
12. **Teclado** (TS-98, TS-101). Tab recorre las celdas de una fila de
    izquierda a derecha y pasa a la X; `n` con el foco en la página no arranca
    ningún timer.

TS-76 no tiene recorrido: no hay forma de desactivar una membresía desde e2e; lo
cubre `timesheet-view.test.tsx` con `canTrack` falso.

## 8. Deuda conocida del slice

- **La planilla no borra una entrada suelta** (el «Borrar» de TS-35 y TS-40):
  13b.
- **Lo que se agrega a una fila después de la lectura no se borra con ella**
  (D13-6): después de confirmar, la fila reaparece con eso y hay que quitarla
  otra vez. La revalidación de 60 s achica la ventana.
- **La fila agregada que ya tiene entradas queda abajo hasta recargar**
  (TS-15); una revalidación no la reubica.
- **Las filas vacías no viajan entre navegadores** (TS-19, a propósito) y no
  vencen: una semana vieja con filas guardadas queda en `localStorage` hasta que
  se quitan.
- **Sin verificar en Clockify**: TS-08 (hoy resaltado), TS-09 (atajo a la
  semana en curso), TS-15 (orden), TS-24 (celda vacía o en cero), TS-31 (las
  09:00 que no existen), TS-34 (de qué entrada copia etiquetas y facturable, y
  las bajas que no entran), TS-47 (el formato de la captura).
- **El selector deja el proyecto excluido inactivo y visible** cuando ofrece
  tareas (D13-9). Si a la vista confunde, la alternativa es un encabezado no
  elegible; queda para la revisión de frontend.
- **`PeriodPicker` sigue en `calendar/`** aunque lo use la planilla; moverlo a
  `components/` entra con la deuda del `DayCalendar` compartido.

## 9. El slice 13b: el menú y el detalle de una celda

Esbozo para su contrato, que se escribe con el 13 en `main`.

- **Entra**: TS-40 (el menú de tres puntos de una celda con horas, enfocable y
  después de su celda, TS-99), TS-41 (el detalle de una celda con una entrada),
  TS-42 (el de una con varias, con «Borrar» por entrada), TS-35 («Borrar» en el
  menú de una celda con una sola entrada, con el diálogo de TT-61), TS-83 y
  TS-115.
- **P-14 cerrado**: el menú de una celda con varias no ofrece «Borrar».
- **TS-79 pasa a «desde el detalle»**: `cellNeedsEntryEdit` cambia su texto a
  «Editá las entradas de esta celda desde el detalle.»; la clave no cambia, y
  `parity-analyst` corrige TS-79 y la tabla de mensajes.
- **Sin backend nuevo.** El estado suma `entries: TimeEntryView[]` —las vistas
  de las filas que `listTimesheetEntries` ya trae— y `entryIds` en cada celda.
  Las mutaciones son las de hoy: `updateEntry` (ADR 0013) o las de un campo de
  la fila, y `deleteEntry`. Todas revalidan `"/planilla"` desde el 13.
- **Lo que su contrato tiene que decidir**: si el detalle de una entrada es un
  popover con las piezas de la fila del rastreador, guardando campo por campo
  como dice TS-41, o el diálogo de una entrada del calendario (ADR 0013), que
  guarda todo junto; cómo lista TS-42 las entradas y adónde va el foco al borrar
  la última; y cómo convive el aviso del detalle con el de la pantalla.
