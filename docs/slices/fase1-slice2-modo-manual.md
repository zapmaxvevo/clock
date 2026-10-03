# Fase 1, slice 2: modo manual

Contrato cerrado del segundo slice vertical de la fase 1. Módulo `time-entry`,
en `src/modules/time-entry/`, pantalla `/`.

Fuente de los comportamientos: `docs/parity/time-tracker.md`, sección 2.5 y la
tabla de la sección 7. Lugar en el plan: [mapa de la fase 1](fase1-mapa.md).
Decisión de arquitectura asociada:
[ADR 0005, la hora de pared viaja como hora de pared](../adr/0005-hora-de-pared-en-la-entrada-manual.md).

Correcciones aplicadas: ronda 1 de `architecture-reviewer`
(`correcciones-fase1-slice2.md`), más la decisión sobre «Reintentar» de la
sección 4.

Decisiones del equipo que este contrato da por tomadas y no vuelve a abrir: no
hay duración máxima por entrada (P-08, P-12); zona horaria y formatos salen del
workspace (P-13); la ventana de la lista son 14 días extendidos hacia atrás
hasta el último día con entradas; **las fechas futuras se aceptan (P-10)**.

## 1. Alcance

Entra:

TT-16, TT-18, TT-19, TT-20, TT-21, TT-25, TT-30, TT-72, TT-73, TT-76, TT-82.

**TT-76 cambió de contenido con P-10.** `parity-analyst` verificó que Clockify
agrega la entrada esté la fecha en el pasado o en el futuro, así que el rechazo
que este contrato proponía en su primera versión era una divergencia nuestra
colada como paridad. Ahora la fecha futura se acepta, y con ella TT-99. Las dos
pasan a `replicar` y `docs/parity/time-tracker.md` tiene que actualizar la fila
TT-76 de la tabla de la sección 7, el caso TT-99 de la sección 10 y el
pendiente P-10.

Entran además, por arrastre, comportamientos que el slice 1 ya implementó y que
este slice ejercita por un camino nuevo. No se reimplementan, pero sí se
verifican:

- **TT-43, TT-45**: la entrada manual cae en el grupo de su día local y mueve el
  total de ese día, que puede no ser hoy.
- **TT-51, TT-95**: una entrada manual que cruza la medianoche por TT-72 dibuja
  el superíndice de días.
- **TT-97**: la duración se calcula sobre instantes UTC. Acá se vuelve visible
  porque la persona teclea horas de pared.
- **TT-81**: la conversión de hora de pared a instante tiene que conservar el
  orden de los dos extremos. Aceptar fechas futuras no habilita un fin anterior
  al inicio: TT-81 y el `check time_entry_end_after_start` quedan exactamente
  como estaban.
- **TT-66, TT-92**: la creación manual usa el mismo permiso que el arranque del
  timer, así que hereda la tabla de roles y el corte por membresía inactiva.
- **TT-89, con una excepción declarada**: la falla de red al agregar devuelve el
  control a su estado anterior y avisa, como pide TT-89, pero **no ofrece la
  acción «Reintentar»** que ese comportamiento describe. El motivo está en la
  sección 4 y es que reintentar puede duplicar la entrada. Es una divergencia
  contra el documento de paridad y `parity-analyst` tiene que registrarla.

### Un cambio sobre código ya entregado: el extremo superior de la ventana

P-10 arrastra una corrección al **contrato de lectura del slice 1**, y entra en
el alcance de este slice porque es consecuencia directa de aceptar fechas
futuras.

`getTrackerState` lee las entradas cerradas cuyo inicio cae en `[desde, ahora)`.
Con fechas futuras aceptadas, una entrada posterior a hoy queda fuera por la
cota superior y **no se ve nunca**: «Cargar más» tampoco la va a alcanzar,
porque la paginación del slice 5 extiende hacia atrás. Es la misma clase de
defecto que cierra B-3 —una entrada que se guarda y no aparece en ningún
lado—, con el agravante de que acá no hay ningún slice futuro que lo arregle.

El extremo superior pasa a ser **el fin del día local de la entrada cerrada más
nueva**, cuando es posterior a ahora, con la misma forma con la que el extremo
inferior ya se extiende hasta el último día con entradas. La regla completa está
en la sección 5, y el cambio se verifica con un test de integración propio.

Queda afuera, explícito:

- **TT-26, los atajos de teclado.** Van en el slice 4, porque `c` es «continuar»
  y ese botón no existe todavía. Mientras tanto el modo se conmuta con el ratón.
- **TT-28, TT-29, TT-54 (horas y fecha), TT-56 y TT-75.** Son el slice 3.
  Comparten con este slice los intérpretes de texto y la conversión de hora de
  pared a instante, pero son otra mutación: escriben sobre filas que ya existen.
  Este slice solo crea. **P-10 no los alcanza**: TT-29 y TT-75 siguen en
  `adaptar` y un timer activo no puede empezar en el futuro. Una entrada cerrada
  en el futuro se puede dibujar; un contador que corre hacia atrás, no. No se
  unifican con TT-76 por coherencia aparente: son dos casos distintos.
- **TT-52, «Cargar más».** Es el slice 5. Consecuencia directa: una entrada
  manual cuyo día cae por debajo del tramo que la lista muestra se crea y no se
  puede ver. El criterio 11 define el aviso con el que se tapa el hueco y la
  sección 8 lo anota como deuda.
- **Proyecto, tarea, etiquetas y facturable en la barra manual.** La barra
  manual muestra lo mismo que la barra del timer: descripción y nada más. Los
  tres llegan con los slices 10 y 11.
- **TT-74 y TT-107 no existen**, por P-08 y P-12. El campo de duración de la
  barra manual no acepta 24 horas o más, pero eso es un límite de lo que esa
  barra puede expresar —el fin es una hora de pared del día siguiente como
  máximo—, no un tope de la entrada: un timer puede seguir produciendo una
  entrada de cuarenta horas y se guarda sin problema.
- **Sin tests de componentes con DOM.** `vitest.config.ts` corre en
  `environment: "node"` y no se modifica. La lógica del formulario se extrae a
  un módulo puro con test, como se hizo con `elapsed.ts` en el slice 1.

## 2. Cambios de esquema

**Ninguno.** No hay migración en este slice y ni `src/server/db/schema.ts` ni
`drizzle/` se tocan.

Una entrada manual es una fila de `time_entry` cerrada: los dos instantes, la
descripción y el dueño ya existen. El `check time_entry_end_after_start` ya es
la red de seguridad de TT-81 para este camino también.

El mínimo de un minuto de TT-73 **no se agrega a la base**: es una regla del
modo manual, no de la tabla. Una entrada de duración cero sigue siendo válida
cuando viene de un timer que se arrancó y se detuvo en el mismo segundo
(TT-101), y un `check` de duración mínima la haría imposible.

El modo recordado de TT-16 tampoco es un cambio de esquema: va en una cookie.
Ver la sección 5.

## 3. Acciones de permisos nuevas

**Ninguna.** `createManualEntry` usa `timeEntry.own.create`, la misma acción que
`startTimer`, con el mismo recurso armado sobre el propio actor:
`ownTimeEntryResource(actor)`.

Es la misma decisión de acceso: crear una entrada propia en el workspace de la
sesión. Una acción separada —`timeEntry.own.createManual`— se podría escribir,
pero no hay ningún rol que pueda una y no la otra: TT-66 da las dos a los cinco
roles, y el corte por `status !== "active"` es el mismo. Dos filas en la tabla
que siempre valen lo mismo son dos filas que algún día van a divergir por
descuido.

`src/server/permissions/index.ts` y `permissions.test.ts` no se tocan. Lo que sí
crece es `src/modules/time-entry/permissions.integration.test.ts`, con los casos
del camino nuevo: los cinco roles pueden agregar tiempo a mano, una membresía
`inactive` o `invited` no puede, y el resultado es el mensaje neutro de
`forbidden`.

## 4. Contrato de la server action

Una action nueva en `src/modules/time-entry/actions.ts`, con el recorrido de
siempre: `requireSession()` → Zod → `assertCan()` → service (transacción más
`recordAudit`) → `revalidatePath("/")` → resultado tipado. La regla transversal
del slice 1 sigue valiendo: **revalida `/` también cuando devuelve error de
dominio**.

### Lo que cambia en los tipos del módulo

Un código de error nuevo en `TimeEntryErrorCode` y su mensaje:

```ts
export type TimeEntryErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "already_stopped"
  | "timer_running"
  | "unexpected";
```

| Mensaje nuevo en `timeEntryMessages` | Texto                                                               | Origen |
| ------------------------------------ | ------------------------------------------------------------------- | ------ |
| `timerRunning`                       | «Detené el timer para agregar tiempo a mano.»                       | TT-30  |
| `tooShort`                           | «La entrada tiene que durar al menos un minuto.»                    | TT-73  |
| `nonexistentClock`                   | «Esa hora no existe por el cambio de horario.»                      | B-2    |
| `beforeWorkspace`                    | «No se pueden cargar horas anteriores a la creación del workspace.» | M-11   |
| `invalidDate`                        | «Fecha inválida.»                                                   | —      |
| `invalidClock`                       | «Hora inválida.»                                                    | —      |

**No hay ningún mensaje de fecha futura en este slice**: P-10 los eliminó junto
con la validación. El rechazo del inicio futuro de un timer activo sigue en pie
—TT-29 y TT-75— y su mensaje llega con el slice 3, que es el que lo necesita.
No se declara acá una constante que nadie usa.

`timerRunning` es el único texto que aparece en dos lugares: como ayuda
contextual del conmutador inactivo y como mensaje del error. Es el mismo hecho
visto desde la interfaz y desde el servidor, y tener dos redacciones para la
misma causa es lo que el documento de paridad evita en TT-103.

Los tres mensajes de validación que ya existen —`descriptionTooLong`,
`endBeforeStart`, `unexpected`— no cambian.

### `createManualEntry` — TT-18, TT-25, TT-30, TT-72, TT-73, TT-76, TT-82

```ts
const dayKeyInput = z
  .string()
  .refine((value) => parseDayKey(value) !== null, timeEntryMessages.invalidDate);
const clockInput = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, timeEntryMessages.invalidClock);

export const createManualEntryInput = z.object({
  description: description.default(""),
  /** Día local del inicio, en la zona horaria del workspace. */
  date: dayKeyInput,
  /** Hora de pared del inicio, 24 h. */
  start: clockInput,
  /** Hora de pared del fin. Menor que el inicio significa el día siguiente (TT-72). */
  end: clockInput,
});
```

El día se valida con `parseDayKey` de `src/server/time` y no con `z.iso.date()`
a secas: la expresión regular de la forma acepta días que no existen, como
`2026-02-30`, y la fecha civil tiene que validarse en el mismo lugar que la
interpretan `dayKeyLabel` y `addDaysToKey`. Con eso, cuando la entrada llega al
service el día **es** un día del calendario, y el único `null` que puede
devolver `instantFromLocal` es el de la hora de pared que no existe.

La entrada viaja en forma canónica. Los formatos tolerantes de TT-19 y TT-20
—`0345`, `9.45`, `2,75`, `1h30m`— los normaliza el cliente con los intérpretes
de `src/server/time` antes de llamar; la action revalida la forma y responde
`validation` si no coincide. El porqué está en el ADR 0005: un solo lugar
interpreta texto libre.

**La duración no viaja.** El campo de duración de la barra es un dispositivo de
entrada para la hora de fin (TT-18: editar la duración mueve el fin), y el
servidor la deriva de las dos horas de pared. Así no hay forma de mandar una
duración que no se corresponda con las horas.

Resultado:

```ts
export type CreateManualEntryResult = {
  readonly created: TimeEntryView;
  /** La entrada quedó por debajo del tramo que la lista dibuja. Ver el paso 8. */
  readonly outsideWindow: boolean;
};
```

Reglas del service, en este orden:

1. `can(actor, "timeEntry.own.create", ownTimeEntryResource(actor))`. Si da
   falso, `forbidden` con el mensaje neutro.
2. Dentro de la transacción, `findRunning`. Si hay un timer activo,
   `timer_running` (TT-30). La interfaz ya lo impide; esto cubre a la pestaña
   desactualizada. No hay carrera que resolver: la fila que se inserta está
   cerrada, así que un timer que arranque justo después del control no viola
   nada y la entrada manual sigue siendo correcta.
3. `startedAt = instantFromLocal(date, start, timeZone)`. Si es `null`,
   `validation` con `nonexistentClock`: esa hora de pared no existió en esa zona
   ese día (ADR 0005, B-2).
4. `minutes = clockDifferenceMinutes(start, end)`. Si es `0`, `validation` con
   `tooShort` (TT-73).
5. `endedAt = instantFromLocal(end < start ? addDaysToKey(date, 1) : date, end,
timeZone)` (TT-72). Si es `null`, `validation` con `nonexistentClock`, igual
   que el inicio. El fin es la hora de pared que la persona escribió, no
   `startedAt` más la duración: en un día con cambio de horario las dos cosas no
   coinciden y lo que vale es la hora tecleada (ADR 0005, TT-97).
6. Piso del workspace: si el día local de `startedAt` es anterior al día local
   de creación del workspace, `validation` con `beforeWorkspace`. Es el único
   límite de rango de producto que queda —P-10 sacó el de arriba— y acota un
   payload inventado sin tocar ningún caso de uso real. Aparte hay un tope
   técnico, no de producto: si algún instante es posterior al año 9999 UTC
   (`isAfterYear9999`), `validation` con `invalidDate`. Un día válido al oeste
   de Greenwich puede caer en el año 10000 UTC, que Postgres no acepta; sin el
   tope, el error volvía como `unexpected` y la barra decía «puede haberse
   creado» sobre una fila que no existía (auditoría de seguridad, m-1).
7. Inserción con `insertClosed` y `recordAudit`, en la misma transacción.
8. `outsideWindow`, en la misma transacción y **después** del insert: se vuelve
   a leer `findLatestClosedBefore(now)` —que ahora puede ser la fila recién
   creada— y se recalcula el inicio del tramo visible con `windowStart(now,
timeZone, latestPast, undefined)`, la misma función y la misma fila que usa
   `getTrackerState`. El
   timer activo va en `undefined` porque el paso 2 ya garantizó que no hay.
   La entrada queda fuera si su `startedAt` **es anterior a ese inicio**.

Solo se compara contra el extremo inferior. Por arriba no queda nada afuera: con
la corrección de la sección 5, el extremo superior de la ventana se extiende
hasta el fin del día de la entrada cerrada más nueva, y la fila recién creada o
es esa entrada o es anterior a ella. La decisión es del servidor y no del
cliente porque depende del estado posterior a la inserción, que el cliente no
tiene, y de un rango continuo que los grupos de la lista no representan, ya que
los días sin entradas no se dibujan (TT-86).

**No se comprueba superposición con otras entradas** (TT-82): dos entradas que
se pisan se crean sin aviso y las dos suman al total del día.

Firma:

```ts
createManualEntry(
  actor: Actor,
  workspace: { readonly timezone: string; readonly createdAt: Date },
  input: CreateManualEntryValues,
  now?: Date,
): Promise<CreateManualEntryResult>;
```

Recibe el workspace y no solo la zona horaria porque el paso 6 necesita su fecha
de creación. La action le pasa `session.workspace`, que ya tiene en la mano: no
hay consulta nueva. El service declara la forma mínima que usa en vez de
importar el tipo de fila del módulo `workspace`.

`now` es el mismo recurso que en `getTrackerState`: lo usa el paso 8 para
calcular el tramo visible y existe para que los tests fijen el presente.
**Solo compara, nunca se escribe.** Los dos instantes que se guardan salen de
`instantFromLocal`, y esta es la única escritura del módulo cuyos instantes no
vienen de `now()` de la base; el ADR 0005 explica por qué y acota la excepción.

Errores posibles: `validation`, `forbidden`, `timer_running`, `unexpected`.
Permiso: `timeEntry.own.create`. Revalida `/`.

### Esta action no ofrece «Reintentar»

`retryHandlerOf` ofrece el reintento cuando el código es `unexpected`, y ese
código lo produce también el `catch` de transporte de `useEntryAction`: el
pedido salió, nadie sabe si llegó. **La barra manual no usa `retryHandlerOf`**:
con `createManualEntry`, reintentar después de una respuesta perdida crea una
entrada duplicada.

No hay nada que lo impida. TT-82 acepta la superposición en silencio, así que
dos filas idénticas son un estado válido del modelo, y no hay clave de
idempotencia en el pedido. En el slice 1 este camino no duplicaba por un
accidente afortunado: `startTimer` rebotaba contra el índice único del timer ya
abierto y el segundo intento devolvía el mismo timer. Esta es la primera action
del módulo que **solo crea**, así que esa red no existe.

Con el código `unexpected`, el aviso de la barra manual dice que la entrada
puede haberse creado igual y que conviene mirar la lista antes de volver a
agregarla, en vez del «volvé a intentar» genérico de
`timeEntryMessages.unexpected`, que acá sería un mal consejo. Con los otros
códigos —`validation`, `timer_running`, `forbidden`— el aviso muestra el mensaje
del resultado tal cual y tampoco ofrece reintento, porque repetir el mismo
pedido no cambia el desenlace.

La clave de idempotencia queda descartada para este slice: resuelve más de lo
que hace falta y se puede agregar después, si aparece otra action que solo cree.
`retryHandlerOf`, `useEntryAction` y `timeEntryMessages.unexpected` no cambian:
lo que cambia es que esta barra no les pide el botón.

### Repository

Un método nuevo, `insertClosed`:

```ts
insertClosed(
  tx: Transaction,
  values: {
    workspaceId: string;
    userId: string;
    description: string;
    startedAt: Date;
    endedAt: Date;
  },
): Promise<TimeEntryRow>;
```

Es el gemelo de `insertRunning` y la diferencia está a la vista: `insertRunning`
escribe `startedAt: now` y acá los dos instantes llegan como valores. Nada más
del repository cambia: `findRunning` ya sirve para el control de TT-30, y
`findLatestClosed` —que ordena por `started_at` descendente— ya devuelve la
entrada más nueva, que es la que necesita el extremo superior de la ventana. Se
suma `findLatestClosedBefore(workspaceId, userId, now)`, la más nueva entre las
que empezaron antes de ahora, para el extremo inferior y el paso 8 (ver la
sección 5).

### Audit log

Una fila nueva en la tabla del slice 1:

| Action              | `action` del audit       | `previousValue` | `nextValue`                           |
| ------------------- | ------------------------ | --------------- | ------------------------------------- |
| `createManualEntry` | `timeEntry.createManual` | sin valor       | `{ description, startedAt, endedAt }` |

Es un `action` propio y no `timeEntry.start`: en el registro tiene que poder
distinguirse una entrada que alguien cargó a mano de una que produjo un timer,
porque son dos afirmaciones distintas sobre cuándo se trabajó.

## 5. Contrato de lectura

`TrackerState` no cambia: ni su forma, ni los campos, ni la firma de
`getTrackerState`. Lo que cambia es **una regla de armado de la sección 5 del
slice 1**, la de la ventana, por el arrastre de P-10 que describe la sección 1.

### El extremo superior de la ventana

Donde el slice 1 dice «entradas cerradas cuyo `started_at` cae en
`[desde, ahora)`», ahora dice `[desde, hasta)`, con:

- `desde`: el menor entre el inicio del día de hoy menos
  `TRACKER_WINDOW_DAYS - 1` días, el inicio del día local de la entrada cerrada
  más reciente **entre las que empezaron antes de ahora** y el inicio del día
  local del timer activo.
- `hasta` = el **mayor** entre `now` y el fin del día local de la entrada
  cerrada más nueva, que es `dayBounds(latestClosed.startedAt, timeZone).end`.
  Sin entradas, es `now`.

Es el fin del día y no el instante de la entrada porque la consulta usa `<` en
la cota superior: con el instante justo, la propia entrada que extiende la
ventana quedaría afuera. Y es simétrico con el extremo inferior, que ya se
estira hasta el **inicio** del día local de la entrada que lo extiende.

La función que lo calcula es `windowEnd(now, timeZone, latestClosed)`, hermana
de `windowStart`, en `src/modules/time-entry/service.ts`. **Cada extremo lee su
propia fila.** El superior usa `findLatestClosed`, la más nueva de todas. El
inferior usa `findLatestClosedBefore(now)`, la más nueva entre las pasadas.
Una primera versión usaba la misma fila para los dos, y la revisión de backend
mostró el costo: cargar una entrada futura escondía sin aviso las entradas
pasadas que se veían gracias a la extensión hacia atrás. Con una entrada del
4/9 como única carga y hoy 2/10, la lista mostraba ese día; al agregar una del
5/10 lo perdía. Es una consulta más por lectura, sin N+1.

El timer activo no participa del extremo superior: su `started_at` lo escribe
`now()` de la base y no puede ser futuro, y TT-29 y TT-75 mantienen esa regla.

Consecuencias visibles, todas ya cubiertas por el armado que existe:

- Una entrada futura forma su propio grupo de día y, como los grupos se ordenan
  del más reciente al más viejo, aparece **por encima de «Hoy»**.
- Su rótulo sale de la forma general de TT-44, `vie, 10/10`. No hay «Mañana»:
  TT-44 define «Hoy» y «Ayer» y nada más, y este slice no inventa un tercer
  caso especial.
- Los días sin entradas entre hoy y ese día no se dibujan (TT-86), así que la
  lista no se llena de días vacíos por una entrada cargada para dentro de un
  mes.

### Lo que llega a la barra sin pasar por el service

**`initialMode`, el modo recordado (TT-16)**, porque no es dato del dominio.
Vive en una cookie `clock.tracker-mode`, con valores `timer` o `manual`,
`path=/`, `sameSite=lax`, un año de vida. La escribe el conmutador desde el
cliente con `document.cookie`; la lee `src/app/(app)/page.tsx` con `cookies()` y
la pasa hacia abajo. No hay server action para esto: es una preferencia de
presentación, `can()` no tiene nada que decidir sobre ella y no se audita.
Leerla en el servidor es lo que evita que la pantalla dibuje el modo anterior y
después salte al recordado.

Con el timer corriendo la barra queda en modo timer aunque la cookie diga
`manual` (TT-30), y la cookie no se toca: cuando el timer se detiene, vuelve el
modo elegido.

El presente de la barra manual —la fecha y la hora con las que arranca el
formulario— sale de `state.serverNow` y `state.timeZone` con `dayKey` y
`formatClock`, que ya existen. No hace falta ningún dato nuevo.

### Lo que se agrega a `src/server/time/index.ts`

La convención manda que fechas, zonas horarias y duraciones pasen solo por acá,
y el slice 1 ya aceptó el costo de que un componente cliente importe este
módulo. Ocho funciones nuevas:

```ts
parseDayKey(dayKey: string): CivilDate | null;              // "2026-10-02" → { year, month, day }
parseClockInput(text: string): string | null;               // TT-20 → "HH:mm"
parseDurationInput(text: string): number | null;            // TT-19 → minutos
clockDifferenceMinutes(start: string, end: string): number; // TT-72
shiftClock(time: string, minutes: number): string;          // TT-18
dayKeyLabel(dayKey: string, todayKey: string): string;      // TT-44 sobre un día ya resuelto
addDaysToKey(dayKey: string, days: number): string;
instantFromLocal(dayKey: string, clock: string, timeZone: string): Date | null;
```

`dayBounds`, que es la que da el fin del día local del extremo superior, ya
existe y no cambia.

`parseDayKey` es la única puerta de entrada de una clave de día: la usan
`dayKeyLabel`, `addDaysToKey`, `instantFromLocal` y la refinación de Zod de la
sección 4. Devuelve los tres números de la fecha civil, o `null` si la cadena no
tiene la forma o el día no existe en el calendario.

**Ninguna de las tres construye una fecha con `new Date("2026-10-02")`.** Esa
cadena se interpreta como medianoche UTC y después se formatea en la zona del
proceso, así que en un huso negativo el rótulo sale corrido un día. Un caso de
`time.test.ts` fija `process.env.TZ` en `America/Argentina/Buenos_Aires` y lo
restaura al terminar, para que esa forma de escribirlo falle en vez de pasar por
casualidad en una máquina en UTC.

`dayLabel` pasa a delegar en `dayKeyLabel` en vez de formatear por su cuenta: el
rótulo «Hoy» / «Ayer» / `mié, 01/10` tiene que tener una sola implementación,
porque ahora lo usan el encabezado de día y el botón del selector de fecha.

`instantFromLocal` construye el instante con el constructor de componentes de
`TZDate` y devuelve un `Date` plano; devuelve `null` cuando la hora de pared no
existe en esa zona ese día, que es el salto del cambio de horario. La hora
ambigua, en cambio, se acepta y se resuelve con el segundo instante. Las dos
reglas, con sus valores UTC esperados, están en el ADR 0005 y se prueban con
`Europe/Madrid`:

| Caso                             | Resultado                  |
| -------------------------------- | -------------------------- |
| `2026-10-25` `02:30` (ambigua)   | `2026-10-25T01:30:00.000Z` |
| `2026-03-29` `02:30` (no existe) | `null`                     |
| `2026-03-29` `02:00` (no existe) | `null`                     |
| `2026-03-29` `03:00`             | `2026-03-29T01:00:00.000Z` |

**Tabla de `parseDurationInput`.** Devuelve minutos enteros; `null` es «no se
puede interpretar» y dispara TT-21.

| Texto      | Resultado | Por qué                                         |
| ---------- | --------- | ----------------------------------------------- |
| `30`       | 30        | un entero suelto son minutos                    |
| `2`        | 2         | lo mismo                                        |
| `2h`       | 120       |                                                 |
| `2:00`     | 120       | con dos puntos son horas y minutos              |
| `2:30`     | 150       |                                                 |
| `2.75`     | 165       | con decimal son horas                           |
| `2,75`     | 165       | coma decimal, TT-19                             |
| `1h30m`    | 90        |                                                 |
| `1h30m1s`  | 90        | los segundos se truncan: la barra es de minutos |
| `45s`      | 0         | lo mismo; después lo rechaza TT-73              |
| `0`        | 0         |                                                 |
| `2:75`     | `null`    | 75 no es un minuto válido                       |
| `24:00`    | `null`    | la barra no expresa 24 h o más                  |
| `25h`      | `null`    | lo mismo                                        |
| `-1`, `ab` | `null`    |                                                 |

**Tabla de `parseClockInput`.** Devuelve `"HH:mm"` o `null`.

| Texto   | Resultado | Por qué                        |
| ------- | --------- | ------------------------------ |
| `1`     | `01:00`   | una o dos cifras son la hora   |
| `12`    | `12:00`   |                                |
| `930`   | `09:30`   | tres cifras, h mm              |
| `0345`  | `03:45`   | cuatro cifras, hh mm           |
| `9:45`  | `09:45`   |                                |
| `9.45`  | `09:45`   | el punto separa, no es decimal |
| `23:59` | `23:59`   |                                |
| `24:00` | `null`    |                                |
| `9:60`  | `null`    |                                |
| `1pm`   | `null`    | la interfaz es 24 h, TT-20     |

`clockDifferenceMinutes` devuelve `(fin - inicio + 1440) % 1440`: dos horas
iguales dan `0` —que TT-73 rechaza— y un fin anterior al inicio da la vuelta por
la medianoche, que es TT-72. `shiftClock` da la vuelta a las 24 h y devuelve
solo la hora: el día extra no se guarda en el formulario, se vuelve a derivar.

## 6. Reparto de archivos

Las dos listas son disjuntas. Rutas absolutas.

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
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
```

Los intérpretes y las conversiones de `src/server/time` se prueban en
`time.test.ts`, que es unidad pura: las tres tablas de la sección 5 son la lista
de casos, con los valores UTC escritos para los cuatro casos de `Europe/Madrid`.

El service se prueba contra una base real con `npm run test:integration`, sin
`vi.mock` y sin repository inyectable, como el slice 1. Los casos que no puede
cubrir ningún doble: el control de TT-30 con un timer abierto, el cruce de
medianoche de TT-72, la superposición permitida de TT-82, el piso del workspace,
`outsideWindow` verdadero y falso, y los dos de la corrección de la ventana
—que una entrada futura creada con la action aparezca en `days`, y que una
entrada futura **sembrada con `seedTimeEntry`** también aparezca, que es la que
prueba el extremo superior sin pasar por la escritura—. Las factories ya existen
en `src/test/factories.ts` —`seedWorkspace`, `seedMember`, `seedTimeEntry`— y
las verificaciones salen de `src/test/queries.ts`.

`backend-dev` no toca `src/server/db/schema.ts`, `drizzle/` ni
`src/server/permissions/`: este slice no cambia ni el esquema ni la tabla de
permisos, y una edición ahí es señal de que algo se salió del contrato.

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/page.tsx
/home/maxi/program/clock/src/app/globals.css
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/manual-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/manual-draft.ts
/home/maxi/program/clock/src/modules/time-entry/components/manual-draft.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/mode-switch.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-mode.ts
/home/maxi/program/clock/src/modules/time-entry/components/tracker-mode.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/clock-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-feedback.tsx
/home/maxi/program/clock/src/modules/time-entry/components/use-entry-action.ts
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/components/ui/button.tsx
/home/maxi/program/clock/src/components/ui/calendar.tsx
/home/maxi/program/clock/src/components/ui/popover.tsx
/home/maxi/program/clock/src/components/ui/toggle-group.tsx
/home/maxi/program/clock/package.json
/home/maxi/program/clock/package-lock.json
/home/maxi/program/clock/components.json
```

Las tres primitivas nuevas se agregan con el CLI de shadcn, y el CLI escribe más
archivos que los que crea: `components.json` apunta a `src/app/globals.css`, y
`calendar` depende de `button`, que ya existe y que la barra del slice 1 usa.
Los dos están en esta lista por eso, con una instrucción explícita: **revisar el
diff de los dos y no perder lo que ya estaba.** En `globals.css` lo que no se
puede perder son los tokens `--success` y `--success-foreground` con su mapeo
`--color-success`, de los que depende el `bg-success` del botón «Iniciar»; en
`button.tsx`, cualquier variante o tamaño que el slice 1 ya use. `calendar` trae
`react-day-picker`, que es la única dependencia nueva del slice. `backend-dev`
no suma dependencias; si necesitara una, la pide antes de tocar estos archivos.

El selector de fecha va con el calendario de shadcn y no con un
`<input type="date">` nativo: TT-18 pide un selector con ícono de calendario, el
rótulo del botón tiene que ser el mismo «Hoy» / «Ayer» / `mié, 01/10` del
encabezado de día (TT-44) y los días elegibles tienen que poder restringirse por
abajo, por el piso del workspace. Las tres cosas el control nativo no las da, y
su formato visible lo decide el navegador, no la zona horaria del workspace.

### Lo que no toca ninguno de los dos

`src/server/db/schema.ts`, `drizzle/`, `src/server/permissions/`,
`src/server/session.ts`, `src/app/(app)/layout.tsx`, `src/components/layout/`,
`vitest.config.ts`, `vitest.integration.config.ts`, `src/test/`,
`playwright.config.ts` y `e2e/`. Cualquier archivo que no esté en ninguna de las
dos listas se pide antes de tocarlo.

Los recorridos de navegador de este slice van en `e2e/manual-entry.spec.ts`,
archivo nuevo. **Dueño: el agente de pruebas del slice**, `tests-slice2`,
siguiendo el nombre que se usó en el slice 1; no es `backend-dev` ni
`frontend-dev`. `e2e/tracker.spec.ts` no se modifica. La lista de recorridos
obligatorios está en la sección 7.

### Handshake de orden

1. **Primer commit de `backend-dev`**: las ocho funciones de
   `src/server/time/index.ts` con sus tipos, y `schema.ts` con
   `createManualEntryInput`, `CreateManualEntryValues`,
   `CreateManualEntryResult`, el código `timer_running` y los mensajes nuevos.
   Más las firmas de `createManualEntry` en `service.ts` y en `actions.ts`.
2. **`frontend-dev` arranca en paralelo** por lo que no depende de eso:
   `tracker-mode.ts` con su test, el conmutador, las primitivas de
   `src/components/ui/` con sus dos diffs a revisar, y el cableado de la cookie
   en `page.tsx`. Nada de eso importa del módulo.
3. Con el primer commit de `backend-dev` en `main`, `frontend-dev` sigue con
   `manual-draft.ts`, los dos campos y la barra manual, que sí importan los
   intérpretes y los tipos.

La corrección de la ventana es de `backend-dev` y vive entera en `service.ts`:
no cambia ningún tipo, así que no bloquea a nadie y puede ir en cualquier
commit del slice.

`frontend-dev` importa de `schema.ts`, `actions.ts` y `src/server/time` pero no
los edita; `backend-dev` no importa nada de `components/`.

### Responsabilidades que no se leen en el nombre del archivo

- **`tracker-bar.tsx`** es el renombre de lo que hoy es `timer-bar.tsx`: elige
  qué barra dibuja según el modo y el timer activo, y es dueño de lo que las dos
  comparten. La descripción es la misma en los dos modos: conmutar no la pierde.
  **`useTrackerRefresh()` se llama acá**, no en `timer-bar.tsx`: si se quedara
  adentro de la barra del timer, la revalidación de P-11 dejaría de correr en
  modo manual. `timer-bar.tsx` queda con el contador, el botón de arranque y
  parada y sus avisos; `manual-bar.tsx` es su par.
- **`manual-draft.ts`** es el borrador de la barra manual y sus transiciones, y
  es la única lógica del slice que vive en el cliente. Puro, sin React, con
  test. Estado: `{ date, start, end }`, las tres cadenas canónicas. Derivados:
  la duración, con `clockDifferenceMinutes`, y el día extra, que es `1` cuando
  `end < start`. Transiciones:
  - `start`: se interpreta con `parseClockInput`; **se conserva el fin** y la
    duración se recalcula (TT-18).
  - `end`: igual, se conserva el inicio.
  - `duration`: se interpreta con `parseDurationInput` y **mueve el fin** con
    `shiftClock` (TT-18).
  - `date`: llega ya canónica del calendario.
  - `reset(serverNow, timeZone)`: devuelve el borrador inicial, con la fecha y
    la hora de `serverNow` en la zona del workspace y sin descripción. Es una
    transición del módulo puro y no código suelto del componente, para que el
    criterio 7 tenga test de unidad: `manual-bar.tsx` la invoca al montarse y
    después de un agregado exitoso, y no hace nada más que invocarla.

  Cuando el intérprete devuelve `null` la transición deja el borrador como
  estaba y marca cuál campo rechazó el valor; con eso el componente revierte y
  marca en rojo (TT-21). Una revalidación que traiga un `serverNow` nuevo **no**
  pisa lo que la persona está tecleando: `reset` solo corre en los dos momentos
  nombrados.

- **`clock-field.tsx`** es el campo de texto tolerante, el mismo para inicio,
  fin y duración. Normaliza al salir del campo y con Enter, nunca mientras se
  teclea; no llama a ninguna action; cuando el valor se rechaza vuelve al
  anterior y se marca en rojo por un instante (TT-21). El rojo es señal
  adicional, no la única: el campo vuelve a mostrar el valor válido, que es la
  información.
- **`date-field.tsx`** es el botón con ícono de calendario y su popover. El
  rótulo sale de `dayKeyLabel`. Los días anteriores a la creación del workspace
  no se pueden elegir; los posteriores a hoy sí, porque P-10 los acepta.
- **`mode-switch.tsx`** conmuta el modo y escribe la cookie. Con el timer
  corriendo queda inactivo y la ayuda contextual de TT-30 es un texto visible
  referenciado con `aria-describedby`, no un tooltip: un control deshabilitado
  no recibe foco ni puntero, así que un tooltip ahí no se puede leer con
  teclado.
- **`manual-bar.tsx`** arma el pedido y lo manda con `useEntryAction`.
  «Agregar» está inactivo mientras la duración derivada es `0`, con el texto de
  TT-73 explicando por qué: así la regla no se duplica en el cliente —el
  servidor sigue siendo quien la aplica— y no se gasta una ida y vuelta en algo
  que ya se ve en pantalla. La barra se limpia con `reset` **solo cuando el
  servidor confirmó**: si la action falla, lo tecleado queda donde está. **No
  pasa `onRetry` a `TrackerFeedback`**, por lo que explica la sección 4, y con
  el código `unexpected` muestra su propio texto en vez del del resultado. El
  aviso de `outsideWindow` baja con la misma regla que los del slice 1:
  cualquier operación nueva de la barra limpia los avisos anteriores, porque un
  aviso describe el desenlace de una operación y la siguiente lo deja viejo.
- **`manual-bar.tsx`** escribe en línea los textos de sus dos avisos propios,
  porque solo los dibuja ese componente y `labels.ts` guarda los que aparecen
  en más de uno. El de respuesta perdida (TT-109): el título «No sabemos si la
  entrada se guardó.» y la línea «Se perdió la respuesta del servidor. Antes de
  volver a agregarla, fijate en la lista: puede haberse creado.». El de
  `outsideWindow` (TT-108): «La entrada se guardó, pero todavía no se ve en la
  lista.» y «Quedó en el día <rótulo>, anterior al tramo que la lista
  muestra.», con el rótulo de día de TT-44. Ninguno va en `timeEntryMessages`
  porque no los produce el servidor.
- **`use-entry-action.ts`** suma una opción `onSuccess?: (data, input) => void`,
  que corre dentro de la transición. Es lo que la barra manual necesita para
  limpiarse recién con la confirmación y para leer `outsideWindow`. Nada más del
  hook cambia, y `retryHandlerOf` tampoco.
- **`tracker-feedback.tsx`** suma una variante informativa, sin «Reintentar» y
  sin el ícono de error, para el aviso del criterio 11. Sigue siendo el único
  lugar que dibuja un aviso de esta pantalla.

## 7. Criterios de aceptación

Observables desde afuera. Cada uno dice con qué test se verifica; el que no se
puede verificar con ninguno está en la sección 8, nombrado como hueco, y no
figura acá con un dueño inventado.

1. **TT-16** — El conmutador ofrece modo timer y modo manual. Al elegir
   «Manual» la barra cambia, y al volver a entrar en el mismo navegador la
   respuesta del servidor ya trae la barra manual dibujada, sin pasar por el
   modo anterior.
2. **TT-30** — Con el timer corriendo el conmutador está inactivo, hay un texto
   visible «Detené el timer para agregar tiempo a mano.» asociado al control, y
   la barra queda en modo timer aunque el modo recordado sea manual. Una
   llamada a `createManualEntry` hecha igual responde ese mismo mensaje y no
   crea ninguna fila.
3. **TT-18** — La barra manual muestra hora de inicio, hora de fin, un selector
   de fecha con ícono de calendario y la duración, y el botón dice «Agregar».
   Editar la duración mueve la hora de fin; editar el inicio o el fin recalcula
   la duración. La fecha arranca en hoy y las horas en la hora actual.
4. **TT-19** — En el campo de duración, `30` da 0:30; `2h` y `2:00` dan 2:00;
   `2.75` y `2,75` dan 2:45; `1h30m1s` da 1:30. En todos los casos la hora de
   fin se mueve en consecuencia.
5. **TT-20** — En los campos de hora, `0345` da 03:45, `9.45` y `9:45` dan
   09:45, `1` da 01:00. `1pm` no se acepta.
6. **TT-21** — Un texto que no se puede interpretar deja el campo en el valor
   anterior, sin aviso de error y sin ninguna petición al servidor.
7. **TT-25** — «Agregar» crea una entrada cerrada con la fecha y las horas de la
   barra, la entrada aparece en el grupo de su día con el total recalculado, y
   la barra vuelve al borrador inicial: descripción vacía, fecha en hoy y horas
   en la hora actual.
8. **TT-72, TT-51, TT-95** — Una entrada de un día pasado con inicio 23:00 y fin
   02:00 dura 3:00, queda entera en el grupo del día de inicio, suma entera a
   ese total y su hora de fin lleva el superíndice `+1`.
9. **TT-73** — Con el fin igual al inicio «Agregar» está inactivo y el texto
   «La entrada tiene que durar al menos un minuto.» explica por qué. Una llamada
   hecha igual responde ese mismo mensaje y no crea ninguna fila.
10. **TT-82** — Una entrada manual que se superpone con otra ya existente se
    crea sin ningún aviso, y las dos aparecen en la lista y suman al total del
    día.
11. **TT-108** — Una entrada manual que cae fuera del tramo que la lista
    dibuja se crea igual, la action lo informa con `outsideWindow` y la barra
    muestra un aviso informativo: «La entrada se guardó, pero todavía no se ve
    en la lista.» con «Quedó en el día <rótulo>, anterior al tramo que la lista
    muestra.». Es la consecuencia de que este slice pueda crear entradas viejas
    antes de que exista la paginación.
12. **TT-97, TT-02** — Las horas guardadas son las horas de pared que la persona
    tecleó, resueltas con la zona horaria del workspace, y la lista las vuelve a
    mostrar iguales. En un día con cambio de horario la duración mostrada es la
    real y puede no coincidir con la resta visual de las dos horas; una hora de
    pared ambigua se guarda con el segundo instante.
13. **Hora de pared inexistente** — Una entrada cuyo inicio o cuyo fin cae en el
    salto del cambio de horario se rechaza con «Esa hora no existe por el cambio
    de horario.», no se guarda ninguna fila y en ningún caso se llega a una fila
    con el fin anterior al inicio.
14. **Piso del workspace** — Una entrada con fecha anterior al día de creación
    del workspace responde «No se pueden cargar horas anteriores a la creación
    del workspace.» y no crea ninguna fila.
15. **TT-76, TT-99, y la corrección de la ventana** — Una entrada con fecha
    posterior a hoy se crea sin error, **y se ve**: forma su propio grupo por
    encima de «Hoy», con el rótulo general de TT-44. No lleva el aviso del
    criterio 11, porque el extremo superior de la ventana se extiende hasta su
    día. Vale igual para una entrada futura que ya estaba en la base.
16. **TT-66, TT-92** — Los cinco roles pueden agregar tiempo a mano sobre sus
    propias entradas. Con la membresía desactivada la action responde «No tenés
    permiso para hacer esto.» y la barra manual queda en solo lectura.
17. **TT-89 y TT-109** — Con la red caída, «Agregar» devuelve el botón a su
    estado anterior y **conserva lo tecleado**. El aviso dice «No sabemos si la
    entrada se guardó.» con «Se perdió la respuesta del servidor. Antes de
    volver a agregarla, fijate en la lista: puede haberse creado.», y **no
    ofrece «Reintentar»**: repetir el pedido duplicaría la entrada.
18. **Auditoría** — Cada entrada manual deja un registro
    `timeEntry.createManual` con la descripción y los dos instantes, y ninguno
    de los otros caminos del módulo escribe ese `action`.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                           | Qué afirma                                                                                                                                                             |
| -------- | -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad + e2e               | `tracker-mode.test.ts`; `e2e/manual-entry.spec.ts`                                | el parseo de la cookie, incluido un valor desconocido; y que tras recargar el HTML del servidor traiga la barra manual                                                 |
| 2        | e2e + integración          | `e2e/manual-entry.spec.ts`; `service.integration.test.ts`                         | el conmutador inactivo con su texto; y que el service rechace con `timer_running` sin insertar                                                                         |
| 3        | unidad + e2e               | `manual-draft.test.ts`; `e2e/manual-entry.spec.ts`                                | las tres derivaciones del borrador; y que la barra muestre los cuatro controles y el botón «Agregar»                                                                   |
| 4        | unidad                     | `time.test.ts`, `manual-draft.test.ts`                                            | la tabla de `parseDurationInput`; y que la duración mueva el fin                                                                                                       |
| 5        | unidad                     | `time.test.ts`                                                                    | la tabla de `parseClockInput`                                                                                                                                          |
| 6        | unidad                     | `manual-draft.test.ts`                                                            | que un valor rechazado deje el borrador igual y marque el campo                                                                                                        |
| 7        | unidad + e2e               | `manual-draft.test.ts`; `e2e/manual-entry.spec.ts`                                | que `reset` devuelva el borrador inicial; y el recorrido completo de crear y ver la fila                                                                               |
| 8        | integración                | `service.integration.test.ts`                                                     | los dos instantes, el día del grupo, la duración y `extraDays: 1`                                                                                                      |
| 9        | unidad + e2e + integración | `manual-draft.test.ts`; `e2e/manual-entry.spec.ts`; `service.integration.test.ts` | la duración derivada `0`; el botón inactivo; y el rechazo del servidor                                                                                                 |
| 10       | integración                | `service.integration.test.ts`                                                     | que las dos filas existan y las dos sumen al total del día                                                                                                             |
| 11       | integración + e2e          | `service.integration.test.ts`; `e2e/manual-entry.spec.ts`                         | `outsideWindow` verdadero con una fecha vieja y falso en el caso normal; y el aviso visible                                                                            |
| 12       | integración                | `service.integration.test.ts`                                                     | con `Europe/Madrid`, que las horas guardadas sean las tecleadas y la ambigua caiga en el segundo instante                                                              |
| 13       | unidad + integración       | `time.test.ts`; `service.integration.test.ts`                                     | los dos `null` de `instantFromLocal`; y que el service responda `nonexistentClock` sin insertar                                                                        |
| 14       | integración                | `service.integration.test.ts`                                                     | el rechazo con `beforeWorkspace` contra un workspace recién creado                                                                                                     |
| 15       | integración                | `service.integration.test.ts`                                                     | que la entrada futura se inserte con `outsideWindow` falso, y que `getTrackerState` la devuelva en `days` tanto creada por la action como sembrada con `seedTimeEntry` |
| 16       | integración                | `permissions.integration.test.ts`                                                 | los cinco roles pueden; `inactive` e `invited` no, con el mensaje neutro                                                                                               |
| 17       | e2e                        | `e2e/manual-entry.spec.ts`                                                        | con la petición abortada, el aviso con su texto propio, **sin botón de reintento**, y lo tecleado intacto                                                              |
| 18       | integración                | `audit.integration.test.ts`                                                       | el registro `timeEntry.createManual` con la descripción y los dos instantes                                                                                            |

Los criterios 6 y 16 están cubiertos **en parte**: la marca roja del 6 y la
barra en solo lectura del 16 no los atrapa ningún test. Están en la sección 8.

### Recorridos obligatorios de `e2e/manual-entry.spec.ts`

Dueño: `tests-slice2`. Nueve recorridos, ninguno opcional:

1. Cargar una entrada manual de hoy y verla en la lista con su duración y su
   horario (criterios 3 y 7).
2. Elegir modo manual, recargar, y comprobar sobre el HTML de la respuesta del
   servidor que la barra manual ya viene dibujada (criterio 1).
3. Con un timer corriendo, el conmutador inactivo y su texto de ayuda; con el
   modo manual recordado, la barra sigue en timer y el conmutador no lo muestra
   presionado; al detener vuelve «Agregar» (criterio 2).
4. Con el fin igual al inicio, «Agregar» inactivo (criterio 9).
5. Una entrada con fecha de treinta días atrás: aparece el aviso de fuera de
   ventana y nombra el día (criterio 11).
6. Con la petición abortada, el aviso de respuesta perdida **sin** «Reintentar»
   y lo tecleado intacto en la barra (criterio 17).
7. Teclear el fin y hacer clic en «Agregar» sin salir del campo crea la entrada
   con un solo clic (criterio 3; revisión de paridad, M-A).
8. Elegir otra fecha en el calendario solo con el teclado (TT-18; revisión de
   paridad, M-B).
9. Después de agregar, el foco vuelve a la descripción (revisión de paridad,
   M-2).

El recorrido 5 necesita dos precondiciones que el entorno no da solo. El
proyecto `setup` atrasa noventa días la creación del workspace en la base
(`e2e/database.ts`), y el recorrido carga antes una entrada de hoy para que la
nueva no quede como la más reciente y la ventana no se estire hasta ella.
Contra un preview, esa conexión llega en `E2E_DATABASE_URL`. El «hoy» del test
se calcula en la zona del workspace; si la corrida cruza la medianoche de esa
zona entre la carga y la afirmación, el test y el servidor pueden ver días
distintos. Es una carrera de segundos y queda aceptada.

## 8. Deuda conocida del slice

Huecos de verificación, nombrados para que no se descubran como sorpresa en el
slice siguiente. Es el problema que el slice 1 tuvo con cuatro conductas que
ningún test atrapaba.

- **La marca roja de TT-21 (criterio 6) no tiene test.** Es un efecto visual
  transitorio: vitest corre en `node` y no hay DOM, y afirmarlo en Playwright
  exigiría atrapar una clase que dura un instante. Lo que sí está probado es que
  el valor vuelve al anterior, que es la conducta que importa; la marca queda
  para la revisión de paridad en el navegador.
- **La barra en solo lectura con la membresía desactivada (criterio 16) no tiene
  test de navegador.** El 403 del service sí lo tiene. Es el mismo recorte que
  el slice 1 hizo con TT-92: sembrar una membresía inactiva desde el navegador
  pide tocar la base en medio del test.
- **El superíndice `+1` dibujado (criterio 8) se verifica como dato, no como
  píxel.** `extraDays: 1` está probado en integración; el dibujo lo hereda del
  slice 1 y sigue sin recorrido de navegador, igual que ahí.
- **La capa de `actions.ts` dejó de ser un hueco.** Este contrato la declaraba
  sin cobertura, como el slice 1; `actions.integration.test.ts` entró el
  2026-10-02 y cubre la traducción de errores, el permiso que pide cada action y
  la revalidación en el camino de error. Lo que le corresponde a
  `createManualEntry` —el `ZodError` del formato canónico, el permiso y el
  `session.workspace` que le pasa al service— se puede sumar ahí. Si el slice ya
  está en implementación cuando se lea esto, cuándo sumarlo es decisión del
  equipo; lo que ya no corresponde es declararlo imposible de probar.
  _Actualizado el 2026-10-03_: ya está sumado; los casos de `createManualEntry`
  viven en ese archivo.
- **El rate limit de Better Auth frena la suite e2e repetida.** Cada corrida
  hace unos 35 pedidos de sesión de prueba. Tres corridas pegadas contra el
  mismo servidor pasan el límite en memoria —inferido: 100 pedidos por IP, sin
  verificar en el código de Better Auth— y los últimos `signIn` fallan con «Too
  many requests». CI corre una sola vez y no lo ve. Para repetir en local, una
  pausa de unos 10 s entre corridas alcanza. El margen se achica a medida que
  la suite crece: cerca de 100 tests por corrida hay que resolverlo, con una
  sesión por archivo en vez de por test o con un límite propio para
  `/test-session/*`. No se quita el límite del endpoint: está protegido por un
  secreto, y sin límite ese secreto quedaría expuesto a fuerza bruta.

- **La barra manual vuelve con la hora del último render.** Después de agregar,
  `reset` usa el `serverNow` del render en que se hizo el clic, que puede
  atrasar hasta 60 s por el intervalo de refresco. La barra puede volver con
  la hora del minuto anterior (criterio 7). Se nota poco y se corrige cuando la
  barra mida desde un ancla, como el contador.

Y las consecuencias de diseño que conviene tener a la vista:

- **Una respuesta perdida puede dejar una entrada que la persona cree que no se
  creó.** La action no es idempotente y no hay forma de que lo sea sin una clave
  en el pedido, que se descartó para este slice. El aviso del criterio 17 es
  todo lo que hay: avisa y manda a mirar la lista. Si aparece otra action que
  solo cree —continuar y duplicar, en el slice 4, son dos—, conviene resolver la
  idempotencia una vez para las tres en vez de repetir este aviso.
- **La entrada por debajo de la ventana no se puede ver** hasta el slice 5. El
  aviso del criterio 11 es una señal, no una solución: la entrada existe, suma
  en los reportes que vengan después y no aparece en la lista. La alternativa
  que se descartó fue limitar el selector de fecha al tramo visible, porque es
  una restricción que habría que sacar en el slice siguiente y mientras tanto
  impide el caso legítimo de cargar horas de un mes atrás.
- **Por arriba, en cambio, no queda nada afuera**, y es a propósito: una entrada
  futura se ve desde que se crea, sin esperar a ningún slice. La paginación del
  slice 5 solo tiene que ocuparse del extremo inferior.
- **El piso del workspace deja afuera la carga de históricos.** Importar horas
  anteriores a la creación del workspace, si alguna vez hace falta, va a tener
  que entrar por otro camino que no sea esta action.
- **El modo recordado vive en una cookie**: no viaja entre dispositivos ni
  sobrevive a limpiar el navegador. TT-16 dice «se recuerda entre visitas» y no
  aclara más. Si el equipo lo quiere por persona, es un campo del perfil
  (slice 7) y el cambio es de una línea en `page.tsx`.
- **El campo de duración no expresa 24 horas o más.** Es coherente con una barra
  cuyo fin es una hora de pared, y no contradice a P-08: las entradas más largas
  siguen siendo posibles y se producen con el timer.
- **TT-26 queda sin cubrir**: no hay atajo `m` para conmutar el modo hasta el
  slice 4.
