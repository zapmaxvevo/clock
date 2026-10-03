# Fase 1, slice 4: continuar, duplicar, descartar y atajos

Contrato del cuarto slice vertical de la fase 1. Módulo `time-entry`, en
`src/modules/time-entry/`, pantalla `/`.

Fuente de los comportamientos: `docs/parity/time-tracker.md`, TT-57, TT-58,
TT-65 y TT-26. Lugar en el plan: [mapa de la fase 1](fase1-mapa.md).
Decisiones de arquitectura asociadas:
[ADR 0003, un solo timer activo](../adr/0003-un-solo-timer-activo.md), que
continuar usa tal cual;
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md) y
[ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md), que este slice no
toca porque ninguna de sus mutaciones convierte una hora de pared; y
[ADR 0007, el cliente elige el id de la entrada que crea](../adr/0007-el-cliente-elige-el-id-de-las-altas.md),
que implementa el [slice 2b](fase1-slice2b-reintento-de-iniciar.md) y que este
slice extiende a continuar y duplicar.

Correcciones aplicadas: rondas 1 y 2 de `architecture-reviewer`
([`correcciones-fase1-slice4.md`](correcciones-fase1-slice4.md)), todos los
hallazgos, y el arrastre del slice 9 sobre dónde vive `createOnce`. El arreglo
de «Iniciar» (M-3 de la ronda 1) salió de este contrato al del slice 2b.

Decisiones del equipo que da por tomadas: no hay duración máxima por entrada
(P-08); se permiten las superposiciones en silencio (TT-82); el borrado es
físico y no se deshace (P-06).

## 0. Precondición de arranque

**El slice 4 empieza con los slices 2, 2b y 3 mergeados en `main`.** El mapa
decía que dependía solo del 2; no es así.

**Del 2b reusa el ADR 0007 ya implementado**: `newEntryId`; `createEntryOnce`,
con su gancho del timer, que es la única puerta de `time-entry` a `createOnce`
de `src/server/create-once.ts`; `findOwnById` e `idConstraint`;
`insertRunning` con id; la regla del id pendiente en la interfaz; la barrera de
los tests de carrera; y el patrón del e2e de respuesta perdida. Este contrato
no los reescribe; los extiende a dos altas nuevas. **Ningún archivo de este
slice importa `src/server/create-once.ts` ni `src/server/db/constraint-error.ts`
directo**: los alcanza por `createEntryOnce` y por el repository, que ya los
importan desde el 2b.

**Del 3 depende por dos motivos de código y de conducta**, no de datos:

- **Los atajos tienen que apagarse dentro de los editores del slice 3**
  (`entry-times-editor`, `running-start-editor`), que sin el slice 3 no existen.
- **Los archivos se pisan**: `entry-row.tsx`, `day-group.tsx`, `entry-list.tsx`,
  `timer-bar.tsx`, `tracker-bar.tsx`, `service.ts` y `repository.ts` cambian en
  los dos slices. Hacerlos en paralelo es resolver los mismos conflictos dos
  veces.

La parada con piso del slice 3, `greatest(now(), started_at)` en `stopById`
(su §4.5), **no es un motivo de orden**: la carrera que corrige la crea el
propio slice 3, con `updateRunningStart`, y sin el slice 3 no existe. Con el 3
mergeado, continuar la hereda corregida porque cierra con el mismo
`closeRunning`.

El slice 4 se podría hacer antes del 3 a costa de reescribir esos archivos dos
veces y de definir el apagado de los atajos contra editores que todavía no
existen. No conviene, y el mapa queda corregido a «depende de 2, 2b y 3».

Lo que este contrato da por hecho de esos slices: la barra con su descripción
retenida (B-1 de las revisiones del slice 2), `TrackerState.todayKey` y
`minDayKey`, `findLatestClosedBefore`, `entry-list.tsx` como contenedor de la
lista, el botón de horas y el menú de la fila, el botón «Editar la hora de
inicio», `stopById` con piso en el inicio, la traducción de `isEndBeforeStart`
en `startTimer`, y `startTimer` sobre `createEntryOnce`.

## 1. Alcance

Entra: **TT-57, TT-58, TT-65 y TT-26.**

Entran por arrastre, sin reimplementarse pero verificándose por el camino
nuevo:

- **TT-35, TT-36, TT-37**: continuar con un timer corriendo lo cierra en el
  mismo instante en que arranca el nuevo, y un «Continuar» simultáneo con un
  «Iniciar» de otro id, o con otro «Continuar» de la misma entrada, deja un
  solo timer y ninguna entrada de 0 s (ADR 0003, ADR 0007).
- **TT-30 y B-1 del slice 2**: un timer que llega o se va con el modo manual
  elegido guarda o repone el texto retenido de la barra. Continuar es un timer
  que llega; descartar, uno que se va.
- **TT-82**: la copia de duplicar se superpone con la original y se permite.
- **TT-45, TT-46**: la copia suma al total de su día; el timer continuado suma
  al de hoy.
- **TT-79, TT-80, TT-103**: entrada ajena, entrada borrada.
- **TT-89, TT-90**: las tres operaciones nuevas ofrecen «Reintentar» sin
  duplicar, por el ADR 0007 (§4.4), y repetir continuar o duplicar sobre la
  misma entrada con el aviso de falla visible tampoco duplica. «Iniciar» lo
  hace desde el slice 2b.
- **TT-92**: con la membresía desactivada no hay botones ni atajos.

### Lo que el slice decide y que el documento de paridad tiene que registrar

Tres decisiones nuestras y una frase que deja de ser cierta, y `parity-analyst`
tiene que registrarlas antes del merge:

- **TT-26: los atajos se pueden apagar.** Son de una sola tecla, y WCAG 2.1.4
  pide que un atajo así se pueda desactivar o reasignar. Clockify no documenta
  cómo; acá hay un interruptor en el diálogo de atajos (§6). Es una
  divergencia `adaptar` nueva.
- **TT-26: «c» continúa la última entrada cerrada que ya empezó**, no una
  futura (P-10) ni el timer activo. La documentación dice «continue last» sin
  más; _no verificado_.
- **TT-65: descartar un timer que otra pestaña ya detuvo no lo borra** (§4.3).
  Clockify no lo documenta.
- **TT-109: el alta manual deja de ser «la única operación del módulo que solo
  crea»**: duplicar también solo crea. Lo que la distingue es que no lleva id
  del cliente (ADR 0007), y la justificación de TT-109 tiene que decir eso. La
  otra frase de TT-109, la de «arrancar choca con el índice único», la corrige
  el slice 2b.

### TT-58 y P-14: qué horas recibe la copia

No está verificado qué horas le da Clockify a la copia. **La regla que este
contrato propone es la que ya escribe TT-58: la copia tiene exactamente los
mismos instantes que la original**, segundos incluidos, en el mismo día. Es la
lectura literal de «las mismas horas de inicio y fin, en el mismo día», no
convierte ninguna hora de pared y no puede fallar. Queda **pendiente de
verificación en el workspace del equipo (P-14)**.

Lo que tocaría cambiarla, dicho entero:

- **La función.** La regla vive en una sola función privada de `service.ts`,
  `duplicateTimes(source)`. Una alternativa razonable —la copia contigua a la
  original (`startedAt = source.endedAt`) o las mismas horas de pared hoy, con
  `instantFromLocal` y las reglas del ADR 0005— le suma `now` y la zona como
  parámetros. _Corregido el 2026-10-03 por la revisión de código_: la versión
  anterior fijaba esa firma de antemano, con un parámetro sin usar; la función
  es privada y de un solo llamador, así que sumarlo cuando haga falta cuesta lo
  mismo.
- **El criterio 6**, que es el único que afirma las horas. El criterio 7 y el
  recorrido e2e 4 afirman solo «una fila más con esa descripción en la lista,
  y la original intacta», sin grupo ni total, así que valen con cualquiera de
  las tres reglas.
- **Los errores, si la regla nueva los trae.** La de «las mismas horas hoy»
  suma `validation` con `nonexistentClock`, con su caso; la contigua suma el
  tope de `isAfterYear9999`. Ese sí es un cambio del contrato de la action, y
  es el único fuera de la función.

**`outsideWindow` no hace falta con ninguna de las tres.** La propuesta deja la
copia en el día de la original; la contigua, después de la original; la de
hoy, en hoy, que la lista siempre dibuja. Por lo mismo ninguna puede quedar
debajo del piso del workspace. El razonamiento completo va en el comentario de
`duplicateTimes` (§4.2), que es donde lo va a leer quien la cambie. Solo una
regla que pusiera la copia en un día anterior al de la original y anterior a
hoy necesitaría el aviso, y no es ninguna de las consideradas.

### Queda afuera

- **Proyecto, tarea, etiquetas y facturable**, que son de los slices 10 y 11.
  Continuar y duplicar copian hoy la descripción; cuando existan esos campos,
  se suman a la misma función que arma la entrada nueva (§4).
- **Dividir (TT-59)**, fuera de alcance por P-05.
- **El alta manual con id del cliente** (ADR 0007): la decide el equipo, porque
  retira la excepción de TT-109.
- **Sin tests de componentes con DOM**, como en los slices anteriores.

### Consecuencias sobre código ya entregado

| Archivo              | Qué cambia                                                                                                                                                                                      | Qué hay que volver a probar                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `schema.ts`          | Tres inputs, tres resultados y un mensaje nuevos; `TrackerState` suma `lastEntryId`.                                                                                                            | Toda action que usa la vista                                    |
| `service.ts`         | El cierre y la apertura de `attemptStart` pasan a `closeAndOpen`, que recibe el id y los campos. La autorización de `readOwnEntry` pasa a `authorizeEntry`, que comparte con `readSourceEntry`. | TT-22, TT-35, TT-36, TT-37, TT-79, TT-80 y los criterios del 2b |
| `repository.ts`      | `insertClosed` acepta el id; `findById` y `deleteRunningById` nuevas; `findLatestClosedBefore` desempata por id.                                                                                | TT-25, el extremo inferior de la ventana del slice 2            |
| `tracker-bar.tsx`    | Descartar; los atajos `n`, `s` y `m`; el botón «Atajos de teclado».                                                                                                                             | TT-16, TT-22, TT-23, TT-30, B-1 del slice 2, el aviso del 2b    |
| `timer-bar.tsx`      | Suma el menú de tres puntos con «Descartar» y `aria-keyshortcuts` en «Iniciar» y «Detener».                                                                                                     | TT-22, TT-23, TT-28                                             |
| `entry-row.tsx`      | Suma el botón de continuar y «Duplicar» en el menú.                                                                                                                                             | TT-49, TT-60, y la fila del slice 3 en sus tres estados         |
| `day-group.tsx`      | Suma la mutación de duplicar y su aviso.                                                                                                                                                        | TT-45, TT-60                                                    |
| `entry-list.tsx`     | Suma la mutación de continuar, su aviso y el atajo `c`.                                                                                                                                         | TT-108 del slice 3                                              |
| `mode-switch.tsx`    | `aria-keyshortcuts` cuando los atajos están activos.                                                                                                                                            | TT-16, TT-30                                                    |
| editores del slice 3 | Marcan su raíz para apagar los atajos.                                                                                                                                                          | TT-28, TT-54, TT-55                                             |

## 2. Cambios de esquema

**Ninguno.** El id que manda el cliente va a la columna `id`, que ya es un
`uuid` con valor por omisión; la clave primaria, el índice único del timer
abierto y el `check` no cambian.

## 3. Acciones de permisos nuevas

**Ninguna.** Continuar y duplicar usan `timeEntry.own.create`, como
`startTimer` y `createManualEntry`; descartar usa `timeEntry.own.delete`, como
`deleteEntry`. En continuar y duplicar el permiso se consulta dos veces: sobre
el actor, antes de buscar la fila propia (ADR 0007), y sobre el `user_id` de la
fila original, leída sin bloqueo (§4), así que una entrada ajena da `forbidden`
con el texto de TT-79. En descartar, sobre el `user_id` de la fila leída con
bloqueo.

`src/server/permissions/` no se toca. `permissions.integration.test.ts` suma
los casos de las tres actions nuevas.

## 4. Contrato de las server actions

Tres actions nuevas en `actions.ts`, con el recorrido de siempre y la regla del
slice 1: **revalidan `/` también cuando devuelven error de dominio**.

```ts
export async function continueEntry(
  input: ContinueEntryInput,
): Promise<ActionResult<ContinueEntryResult>>;

export async function duplicateEntry(
  input: DuplicateEntryInput,
): Promise<ActionResult<DuplicateEntryResult>>;

export async function discardTimer(
  input: DiscardTimerInput,
): Promise<ActionResult<DiscardTimerResult>>;
```

### Los tipos

`newEntryId`, el `z.uuidv4()` del slice 2b, es el id de toda entrada que se
crea. Los ids de filas que ya existen siguen siendo `z.uuid()`, como en el
resto del módulo.

```ts
/**
 * El id nuevo no puede ser el de la original. Se compara sin distinguir
 * mayúsculas porque la base sí los iguala.
 */
function isNewId(input: { readonly id: string; readonly sourceId: string }): boolean {
  return input.id.toLowerCase() !== input.sourceId.toLowerCase();
}

export const continueEntryInput = z
  .object({
    /** Id de la entrada que se crea, elegido por el cliente (ADR 0007). */
    id: newEntryId,
    /** La entrada que se continúa. */
    sourceId: z.uuid(),
  })
  .refine(isNewId, timeEntryMessages.sameEntryId);

export const duplicateEntryInput = z
  .object({
    id: newEntryId,
    sourceId: z.uuid(),
  })
  .refine(isNewId, timeEntryMessages.sameEntryId);

export const discardTimerInput = z.object({ id: z.uuid() });

export type ContinueEntryResult = {
  /** En un reintento, la fila que creó el primer intento, en el estado en que esté. */
  readonly running: TimeEntryView;
  /** El timer que estaba corriendo y se cerró en el mismo instante (TT-36). */
  readonly stopped: TimeEntryView | null;
};

export type DuplicateEntryResult = { readonly created: TimeEntryView };

export type DiscardTimerResult = { readonly id: string };
```

Sin el `refine`, un pedido con `id === sourceId` lo resolvería la búsqueda de
la fila propia devolviendo la original como si fuera la entrada creada. No
escribiría nada, pero respondería un éxito falso; el rechazo lo hace explícito.

**No hay códigos nuevos. Hay un mensaje nuevo**, para ese rechazo, que solo
produce un pedido armado a mano:

| Mensaje en `timeEntryMessages` | Texto                                                  | Código       |
| ------------------------------ | ------------------------------------------------------ | ------------ |
| `sameEntryId`                  | «La entrada nueva no puede usar el id de la original.» | `validation` |

Duplicar la entrada que corre responde `timer_running` con `runningEntryTimes`,
«Esta entrada es la que está corriendo.», el texto de TT-111: el hecho es el
mismo —la fila pedida es la abierta— y el remedio también, porque no hay nada
que hacer sobre ella hasta que se cierre.

### El algoritmo de las altas (ADR 0007)

`continueEntry` y `duplicateEntry` pasan por `createEntryOnce`, del slice 2b,
como `startTimer`. **El algoritmo es el del ADR 0007 y este contrato no lo
reescribe**: lo que cada operación define es su transacción (`attempt`), cómo
arma su resultado a partir de una fila propia que ya existe (`replayed`) y, si
puede chocar con el índice único del timer, a partir del timer del ganador
(`winner`), que es lo que activa el gancho del timer.

### La entrada original se lee sin bloqueo

Continuar y duplicar leen la original para copiar sus campos y decidir el
acceso sobre su dueño. **No la escriben y su `user_id` no cambia**, así que el
`FOR UPDATE` de `readOwnEntry` no protege nada y sí produce un desenlace malo:
dos «Continuar» simultáneos de la misma entrada, con ids distintos, se
serializan sobre ella; el segundo, al destrabarse, encuentra abierto el timer
que acaba de abrir el primero y lo cierra con 0 s. Sin el bloqueo, los dos
llegan al cierre del timer previo, chocan con el índice y el segundo responde
el ganador (ADR 0007, «Escenarios verificados»). El criterio 21 lo afirma con
la barrera.

```ts
/**
 * Lo que comparten las dos lecturas: `not_found` si no hay fila (TT-80),
 * `forbidden` con el texto de TT-79 si `can()` la niega sobre su dueño real.
 */
function authorizeEntry(
  actor: Actor,
  action: Action,
  row: TimeEntryRow | undefined,
): TimeEntryRow;

/** La entrada de la que parte un alta. Sin bloqueo: no se escribe. */
async function readSourceEntry(
  tx: Transaction,
  actor: Actor,
  id: string,
): Promise<TimeEntryRow>;
```

`readOwnEntry` queda como está para las mutaciones que escriben la fila leída,
con su `FOR UPDATE`, y pasa a usar `authorizeEntry`. `readSourceEntry` lee con
`timeEntryRepository.findById` y autoriza `timeEntry.own.create`.

### 4.1 `continueEntry` — TT-57, TT-36, TT-37

Firma del service:

```ts
export async function continueEntry(
  actor: Actor,
  timeZone: string,
  input: ContinueEntryInput,
): Promise<ContinueEntryResult>;
```

`createEntryOnce(actor, input.id, { attempt, replayed, winner })`, con:

- **`attempt`**, en una transacción:
  1. `readSourceEntry(tx, actor, input.sourceId)`: `not_found` si no está
     (TT-80), `forbidden` con el texto de TT-79 si es de otra persona.
  2. `closeAndOpen(tx, actor, { id: input.id, fields: continuedFields(source) })`:
     `findRunning`; si hay un timer abierto, `closeRunning`, que desde el
     slice 3 escribe `greatest(now(), started_at)` (TT-36); y `insertRunning`
     con el id y los campos. La fuente puede ser el propio timer abierto —solo
     por un pedido armado a mano, porque la abierta no es una fila—: se cierra
     y se abre otro igual, que es lo que TT-36 dice de cualquier timer
     corriendo.
  3. `recordAudit` con `timeEntry.continue`.
- **`replayed`** y **`winner`**: `{ running: toView(fila), stopped: null }`. Con
  `winner`, perder la carrera contra un arranque simultáneo de otra pestaña
  responde el timer del ganador (ADR 0003), que no es una continuación (§8).

Como `startTimer` desde el slice 3, **la llamada a `createEntryOnce` va envuelta
en la traducción de `isEndBeforeStart`** a `validation` con `endBeforeStart`.
Con `greatest` en `stopById` el `check` no puede saltar por este camino; la
traducción es la misma red que en `startTimer`.

`closeAndOpen` sale de `attemptStart` del slice 2b, que se queda con la
transacción, la llamada a `closeAndOpen` con `{ description }` y su
`timeEntry.start`. Es la misma función para «Iniciar» y para «Continuar»; cada
operación escribe su propio registro de auditoría.

```ts
/** Los campos que la entrada nueva toma de la original. Hoy, la descripción. */
type EntryFields = { readonly description: string };

/** Cierra el timer abierto, si hay, y abre la entrada nueva con el mismo `now()` (ADR 0003). */
async function closeAndOpen(
  tx: Transaction,
  actor: Actor,
  entry: { readonly id: string; readonly fields: EntryFields },
): Promise<{ running: TimeEntryRow; stopped: TimeEntryRow | null }>;

function continuedFields(source: TimeEntryRow): EntryFields;
```

`continuedFields(source)` es la única función que decide qué se copia de la
original, para continuar y para duplicar. Los slices 10 y 11 le suman proyecto,
tarea, etiquetas y facturable a `EntryFields` y a esta función sin tocar nada
más.

Errores: `validation` (de Zod, y la red de `isEndBeforeStart`), `not_found`,
`forbidden`, `unexpected`. Permiso: `timeEntry.own.create`. Revalida `/`.

### 4.2 `duplicateEntry` — TT-58

```ts
export async function duplicateEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: DuplicateEntryInput,
  now: Date = new Date(),
): Promise<DuplicateEntryResult>;
```

Recibe el workspace y `now` aunque la regla de hoy no los use: son lo que
necesitaría una regla de horas distinta (§1), y así cambiarla no cambia la
firma.

`createEntryOnce(actor, input.id, { attempt, replayed })`, **sin `winner`**, así
que sin gancho: una fila cerrada no choca con el índice único (ADR 0007). Con:

- **`attempt`**, en una transacción:
  1. `readSourceEntry(tx, actor, input.sourceId)`.
  2. Si `source.endedAt === null`, `timer_running` con `runningEntryTimes`.
     Solo lo produce un pedido armado a mano: la abierta no es una fila.
  3. `{ startedAt, endedAt } = duplicateTimes(source)`.
  4. `insertClosed` con `id: input.id`, `continuedFields(source)` y esos dos
     instantes.
  5. `recordAudit` con `timeEntry.duplicate`.
- **`replayed`**: `{ created: toView(fila) }`.

```ts
/**
 * TT-58: qué instantes recibe la copia. Hoy, los mismos de la original.
 * Pendiente de verificación en el workspace del equipo (P-14).
 *
 * Con esta regla la copia no necesita ningún control de rango. No puede quedar
 * debajo del piso del workspace ni pasar el año 9999: son instantes que ya se
 * guardaron. Y no puede quedar fuera de la lista donde está la original: cae
 * en su mismo día, y agregarla no mueve el extremo inferior de la ventana,
 * porque empieza en el mismo instante que una fila que ya estaba. Si la
 * original se ve, la copia también; si la ventana la dejó afuera, se van las
 * dos.
 *
 * Las alternativas consideradas tampoco necesitan `outsideWindow` ni el piso:
 * la contigua (`startedAt = source.endedAt`) cae después de la original, y la
 * de las mismas horas de pared hoy cae en hoy, que la lista siempre dibuja y
 * que nunca es anterior a la creación del workspace. La contigua suma el tope
 * de `isAfterYear9999`, y la de hoy, el rechazo de `nonexistentClock`
 * (ADR 0005). Solo una regla que pusiera la copia en un día anterior al de la
 * original y anterior a hoy necesitaría `outsideWindow`, como el alta manual.
 */
function duplicateTimes(
  source: TimeEntryRow & { endedAt: Date },
  context: { readonly now: Date; readonly timeZone: string },
): { startedAt: Date; endedAt: Date };
```

Duplicar con un timer corriendo está permitido: crea una fila cerrada y no toca
el timer. Dos «Duplicar» simultáneos de la misma entrada con ids distintos
crean dos copias, que es lo que se pidió dos veces; leer la original sin
bloqueo no cambia eso.

Errores: `validation` (solo de Zod), `timer_running`, `not_found`, `forbidden`,
`unexpected`. Permiso: `timeEntry.own.create`. Revalida `/`.

### 4.3 `discardTimer` — TT-65

```ts
export async function discardTimer(
  actor: Actor,
  input: DiscardTimerInput,
): Promise<DiscardTimerResult>;
```

1. En una transacción, `findByIdForUpdate`. **Si la fila no existe, la
   respuesta es éxito** y no se escribe nada: lo que la persona pidió es que el
   timer no esté, y no está. Por eso no se usa `readOwnEntry`, cuyo
   `not_found` acá sería un error falso.
2. Permiso `timeEntry.own.delete` sobre el dueño de la fila; si no, `forbidden`
   con el texto de TT-79.
3. Si `row.endedAt !== null`, `already_stopped`: otra pestaña lo detuvo.
4. `deleteRunningById`, con la guarda `ended_at is null`. Si devuelve
   `undefined`, `already_stopped`.
5. `recordAudit` con `timeEntry.discard` y la fila borrada entera como
   `previousValue`, igual que `timeEntry.delete`: es la única copia que queda.

Acá el bloqueo sí va: descartar escribe la fila que lee.

Los cruces con otra pestaña:

| Lo que hizo la otra pestaña antes      | Desenlace del descarte                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Detuvo el timer                        | `already_stopped`, «Este timer ya había sido detenido.»; la entrada se queda |
| Arrancó o continuó otro, cerrando este | `already_stopped`; la entrada cerrada se queda y el timer nuevo sigue        |
| Borró la entrada desde la lista        | Éxito sin aviso: el timer ya no está                                         |
| Movió el inicio (`updateRunningStart`) | Se descarta: el `FOR UPDATE` serializa y la fila sigue abierta               |

**El timer detenido en otra pestaña no se borra.** Una entrada cerrada es un
registro terminado que otra pestaña decidió guardar; borrarla con un descarte
pensado contra un timer que ya no corre destruiría algo que alguien quiso
conservar, y no se puede deshacer (P-06). Si la persona igual la quiere fuera,
la borra desde la lista, con su confirmación.

Errores: `forbidden`, `already_stopped`, `unexpected`. Permiso:
`timeEntry.own.delete`. Revalida `/`.

### 4.4 Las tres ofrecen «Reintentar», verificado contra el diseño

- **`continueEntry` y `duplicateEntry`**: el reintento lleva el mismo `id`,
  porque `useEntryAction` guarda el último pedido entero. Lo que pasa en cada
  caso —aplicado, en vuelo, no aplicado, perdido contra otra pestaña— es lo que
  enumera el ADR 0007 en «Escenarios verificados»; ninguno deja una fila de más
  ni un timer cerrado de más.
- **`discardTimer`**: el reintento de un descarte aplicado encuentra la fila
  borrada y responde éxito (§4.3). Uno no aplicado descarta.
- **«Iniciar»** lo ofrece así desde el slice 2b.

Con `unexpected` el aviso ofrece «Reintentar»; con `validation`, `not_found`,
`forbidden`, `timer_running` o `already_stopped`, no, porque repetir no cambia
el desenlace.

**Repetir la acción con el aviso visible reusa el id pendiente**, la regla que
el ADR 0007 fija y el slice 2b aplica a «Iniciar»: mientras se ve el aviso de
continuar o de duplicar con `unexpected`, el botón de continuar o «Duplicar»
**de la misma entrada** —y `c`, si es la de `lastEntryId`— manda el id del
último pedido sobre esa entrada. Sobre otra entrada es otro pedido y lleva un id
nuevo. Sin esto, apretar «Continuar» otra vez en vez de «Reintentar» cerraría
con segundos la continuación que el primer intento ya abrió, y apretar
«Duplicar» otra vez dejaría dos copias.

**El aviso de continuar baja cuando cambia el timer**, con la misma regla que
el slice 2b fijó para el de «Iniciar»: si la revalidación trae un timer con
otro id, o se lleva el que había, `entry-list.tsx` limpia el aviso de falla de
continuar. Si llegó la continuación, el pedido se aplicó; si llegó otro timer,
reintentar lo cerraría. El aviso de duplicar no tiene una señal así —la copia
no cambia el timer— y el reintento después de borrar la copia la recrea, que
es la consecuencia que el ADR 0007 deja escrita.

### Repository

```ts
/**
 * Busca por id sin bloqueo y sin filtrar por usuario, como `findByIdForUpdate`:
 * quién es el dueño lo decide `can()` sobre la fila leída.
 */
findById(workspaceId: string, id: string, tx?: Executor):
  Promise<TimeEntryRow | undefined>;

/** Solo una fila abierta. `undefined` si ya la cerraron. */
deleteRunningById(tx: Transaction, target: EntryTarget): Promise<TimeEntryRow | undefined>;
```

`insertClosed` recibe `id` en sus valores, opcional, porque `createManualEntry`
no lo manda. `findOwnById`, `idConstraint` e `insertRunning` con id llegan del
slice 2b sin cambios, con su test.

`findLatestClosedBefore` suma el desempate `asc(timeEntry.id)` después de
`desc(timeEntry.startedAt)`, el mismo orden que `listClosedBetween`. Con dos
entradas que empiezan en el mismo instante, devuelve la que la lista dibuja
primero, que es la que tiene que continuar `c` (§5). La ventana no cambia: las
dos tienen el mismo inicio.

### Audit log

| Action           | `action` del audit    | `previousValue` | `nextValue`                                     |
| ---------------- | --------------------- | --------------- | ----------------------------------------------- |
| `continueEntry`  | `timeEntry.continue`  | —               | `{ sourceId, description, startedAt }`          |
| `duplicateEntry` | `timeEntry.duplicate` | —               | `{ sourceId, description, startedAt, endedAt }` |
| `discardTimer`   | `timeEntry.discard`   | la fila entera  | —                                               |

`continueEntry` deja además el `timeEntry.stop` del timer que cerró, como
`startTimer`. Un pedido resuelto por la fila propia no deja registro: no
escribió nada. Son tres `action` distintos de `start`, `createManual` y
`delete` porque en el registro hay que poder distinguir «arrancó de cero» de
«continuó tal entrada», y «borró una entrada» de «descartó el timer».

## 5. Contrato de lectura

`getTrackerState` no cambia su consulta. `TrackerState` suma un campo, que sale
de la fila que `findLatestClosedBefore(…, now)` ya lee para la ventana:

```ts
/** La entrada que continúa el atajo «c»: la cerrada más reciente que ya empezó. */
lastEntryId: z.uuid().nullable(),
```

Es la más reciente **que ya empezó**, no la más nueva: con P-10 puede haber
entradas futuras, y «c» continuando una entrada de mañana sería una sorpresa.
No es el timer activo, que no es una entrada cerrada. Está siempre en la lista,
porque la ventana se extiende hasta su día. Con dos que empiezan en el mismo
instante, es la que la lista dibuja primero, por el desempate de §4.

`TimeEntryView` no cambia. `src/server/time` no cambia.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca los archivos que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
```

Los criterios de carrera usan la barrera que el slice 2b dejó en
`service.integration.test.ts`.

### frontend-dev

```
/home/maxi/program/clock/src/components/ui/switch.tsx                                 (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/discard-timer-dialog.tsx  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-list.tsx
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-times-editor.tsx
/home/maxi/program/clock/src/modules/time-entry/components/running-start-editor.tsx
/home/maxi/program/clock/src/modules/time-entry/components/mode-switch.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/tracker-shortcuts.ts       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-shortcuts.test.ts  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/use-tracker-shortcuts.ts   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/shortcuts-dialog.tsx       (nuevo)
```

No se borra ningún archivo. Sin dependencias nuevas: el menú y el diálogo ya
están en `src/components/ui/`, y el interruptor es `switch.tsx`, la primitiva
de shadcn sobre `@base-ui/react/switch`, que viene en `@base-ui/react`, ya
instalado. Es la única primitiva que falta, y se pide en el handshake.

### Lo que no toca ninguno de los dos

`src/server/` entero —incluidos `create-once.ts` y `db/constraint-error.ts`, que
son del 2b y que el slice 9 también usa—, `drizzle/`, `src/app/`,
`e2e/`, `package.json`, `package-lock.json`, `components.json` y, fuera de
`switch.tsx`, nada de `src/components/ui/`. Los documentos de slices anteriores
y de correcciones son históricos y no se reescriben.

Los recorridos de navegador van en `e2e/continue-duplicate.spec.ts`
**(nuevo)**. **Dueño: `tests-slice4`.** Los specs y helpers existentes no se
modifican; los helpers que falten viven en el spec nuevo.

_Corregido el 2026-10-03 por las revisiones_. Excepciones autorizadas a lo
anterior:

- `src/test/concurrency.ts`: la barrera de los tests de carrera se mudó ahí
  desde `service.integration.test.ts` (`waitForBlockedBackends`,
  `raceThroughBarrier`, `queueBehindBarrier`), porque también la usa el slice 9.
  Entra al reparto de `backend-dev`, junto con
  `src/modules/workspace/service.integration.test.ts`.
- `components/use-new-entry-id.ts` (nuevo): la regla del id pendiente del ADR
  0007, una sola vez para iniciar, continuar y duplicar. Entra al reparto de
  `frontend-dev`.
- Tres ajustes en specs existentes, sin cambiar lo que afirman:
  `entry-times.spec.ts:259-261` (el control siguiente de la fila pasa a ser
  «Continuar»), y la espera de la respuesta del servidor en
  `manual-entry.spec.ts:372-374` y `tracker.spec.ts:487`.

### Handshake de orden

1. **Primer commit de `backend-dev`**: `schema.ts` con los tres inputs, los
   tres resultados, `sameEntryId` y `lastEntryId`; las firmas de las tres
   funciones en `service.ts` y en `actions.ts`.
2. **`frontend-dev` arranca en paralelo** pidiendo y generando
   `src/components/ui/switch.tsx` con el CLI de shadcn (`shadcn add switch`).
   Revisa el diff: si el CLI toca algo más que ese archivo —`components.json`,
   `globals.css`, otra primitiva—, revierte eso y lo consulta antes de seguir.
   Después, `tracker-shortcuts.ts` y su test, `shortcuts-dialog.tsx`,
   `discard-timer-dialog.tsx` y los textos de `labels.ts`. Nada de eso depende
   del commit anterior.
3. Con el primer commit en la rama, el resto.

### Responsabilidades que no se leen en el nombre del archivo

- **El id de cada alta lo genera el componente que dispara la acción**, con
  `crypto.randomUUID()`, **en el manejador del clic o del atajo** y no en el
  render: un id por acción de la persona. «Reintentar» no genera uno nuevo,
  porque reenvía el último pedido. **Con el aviso de falla por red visible,
  repetir la acción sobre la misma entrada reusa el id pendiente** (§4.4). Es
  la regla del slice 2b, ahora también para continuar y duplicar.
- **`entry-row.tsx`** suma, con `canTrack` en verdadero:
  - Un botón de continuar con ícono de reproducción, siempre visible, con nombre
    accesible «Continuar «nombre»» y, si la fila es la de `lastEntryId` y los
    atajos están activos, `aria-keyshortcuts="C"`.
  - «Duplicar» en el menú de tres puntos, antes de «Borrar».

  Los dos existen también con `editableTimes` en falso (TT-110 solo bloquea los
  horarios). Con `canTrack` en falso, ninguno de los dos.

- **`entry-list.tsx`** es el dueño de continuar: lo usan todas las filas y el
  atajo `c`, que vive en la lista porque es la que conoce las filas. Su aviso de
  falla, «No se pudo continuar la entrada.», va arriba de los grupos, en el mismo
  lugar que el de TT-108, y **baja cuando cambia el id de `running`** (§4.4).
  Guarda en una ref el par `{ sourceId, id }` del último pedido de continuar:
  con el aviso visible con `unexpected` y la misma `sourceId`, reusa ese `id`;
  si no, genera uno. Lo decide antes de limpiar los avisos, como la barra del
  2b. Mientras viaja, el botón de esa fila queda inactivo con `aria-busy`. La
  barra se entera del timer nuevo con la revalidación, igual que de uno
  arrancado en otra pestaña: con el modo manual elegido eso es un cambio de
  modo forzado, y el texto retenido de B-1 se guarda solo. Con el modo timer,
  lo tecleado sin arrancar en la descripción de la barra se reemplaza por la
  del timer continuado, como ya pasa con un timer que llega de otra pestaña.
- **`day-group.tsx`** es el dueño de duplicar, como ya lo es de borrar. Su aviso
  de falla es «No se pudo duplicar la entrada.». Reusa el id pendiente con la
  misma regla que `entry-list.tsx`, sobre su propio par `{ sourceId, id }`. La
  copia aparece con la revalidación; no hay fila optimista.
- **`tracker-bar.tsx`** es el dueño de descartar, de los atajos `n`, `s` y `m`,
  y dibuja el botón «Atajos de teclado» al lado del conmutador de modo, fuera
  del condicional de modo, como el conmutador. `n` pasa por `handleToggle`, así
  que reusa el id pendiente igual que el botón. Descartar:
  - Usa una fase optimista nueva, `discarding`, en la que la barra se dibuja
    detenida: contador en `0:00:00`, «Iniciar», conmutador inactivo.
  - Con éxito, la barra queda vacía (TT-65). Con el modo timer, la descripción
    del timer descartado se va con él. Con el modo manual elegido y el timer
    forzado, es un timer que se va: vuelve el texto retenido de B-1, por el
    mismo camino que ya existe.
  - **Al confirmar, el foco va al campo de descripción de la barra.** El botón
    del menú desde el que se abrió el diálogo desaparece con la fase optimista,
    y el foco no puede volver a él; es el mismo problema que resuelve
    `day-group.tsx` cuando la fila borrada se lleva el foco, que lo manda al
    encabezado del día. Acá el destino es la descripción porque es el control
    con el que se sigue: arrancar el próximo timer.
  - Su aviso de falla es «No se pudo descartar el timer.».
  - **El botón de confirmar queda inactivo mientras viaja un guardado de la
    descripción.** Abrir el menú saca el foco del campo y su blur manda el
    guardado pendiente; si el descarte llegara antes, ese guardado respondería
    «Esa entrada ya no existe.» sobre un timer que la persona acaba de
    descartar.
- **`timer-bar.tsx`** suma, con el timer corriendo y `canTrack`, un botón de
  menú de tres puntos —«Acciones del timer»— después de «Detener», con un único
  ítem, «Descartar», que abre `discard-timer-dialog`. Mientras los atajos están
  activos, «Iniciar» lleva `aria-keyshortcuts="N"` y «Detener»,
  `aria-keyshortcuts="S"`.
- **`discard-timer-dialog.tsx`** (nuevo) es la confirmación: título «¿Descartar
  el timer?», texto «Se borra el tiempo que lleva corriendo y no se puede
  deshacer.», botones «Descartar» y «Cancelar». Con «Cancelar» o `Esc` el foco
  vuelve al botón del menú, como en el diálogo de borrar; al confirmar, lo
  mueve `tracker-bar.tsx` a la descripción.
- **`tracker-shortcuts.ts`** (nuevo) es la regla de los atajos como funciones
  puras, con test de unidad:

  ```ts
  export type TrackerShortcut = "start" | "stop" | "toggleMode" | "continueLast";

  /** La tecla de un evento, o `null` si no es un atajo o no corresponde atenderlo. */
  export function shortcutOf(event: {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
    readonly repeat: boolean;
    readonly isComposing: boolean;
    readonly target: EventTarget | null;
  }): TrackerShortcut | null;

  /** Clave de `localStorage` del interruptor. */
  export const SHORTCUTS_STORAGE_KEY = "clock.tracker-shortcuts";

  /** Evento propio de `window`: `storage` no se dispara en la pestaña que escribió. */
  export const SHORTCUTS_CHANGE_EVENT = "clock:tracker-shortcuts";

  /** El valor guardado, leído. Solo `"off"` los apaga: ausente o desconocido es «activos». */
  export function shortcutsEnabledFrom(stored: string | null): boolean;
  ```

  `shortcutOf` mapea `n`, `s`, `m` y `c` sin distinguir mayúsculas, y devuelve
  `null` si hay alguna tecla modificadora —Ctrl, Meta, Alt o Shift—, si la tecla
  se repite por mantenerla, si hay composición en curso (IME), o si el destino
  del evento está dentro de:
  - un `input`, `textarea`, `select` o elemento editable;
  - un elemento con rol `dialog`, `alertdialog`, `menu`, `listbox` o `grid`, que
    cubre los diálogos, los menús abiertos y el calendario;
  - un elemento con `data-tracker-shortcuts="off"`, que marca los dos editores
    del slice 3 y cubre sus controles que no son campos de texto, como el botón
    de fecha.

  El interruptor guarda `"on"` u `"off"`.

- **`use-tracker-shortcuts.ts`** (nuevo) tiene dos hooks, sin estado de módulo:
  - **`useShortcutsEnabled(): readonly [boolean, (enabled: boolean) => void]`**
    es el interruptor, con `useSyncExternalStore`:
    - `subscribe` escucha `storage` —el cambio hecho en otra pestaña— y
      `SHORTCUTS_CHANGE_EVENT` en `window` —el hecho en esta—, y devuelve la
      función que saca los dos.
    - `getSnapshot` lee `localStorage` con `shortcutsEnabledFrom`, dentro de un
      `try/catch`: si la lectura falla, «activos».
    - `getServerSnapshot` devuelve «activos». El servidor no conoce la
      preferencia, así que con el interruptor apagado el HTML llega con los
      `aria-keyshortcuts` y la hidratación los saca.
    - El setter escribe en `localStorage` dentro de un `try/catch` y despacha
      `SHORTCUTS_CHANGE_EVENT`. Si la escritura falla, la lectura sigue dando
      «activos» (§8).

    Cada componente que lo usa se suscribe por su cuenta, y el evento propio
    es lo que los mantiene de acuerdo dentro de la pestaña: por eso no hace
    falta, y la convención no lo permite, ningún valor guardado a nivel de
    módulo.

  - **`useTrackerShortcuts(handlers)`** escucha `keydown` en `document`,
    consulta `shortcutOf` y `useShortcutsEnabled`, y llama al manejador de cada
    atajo. Lo usan `tracker-bar.tsx` (`n`, `s`, `m`) y `entry-list.tsx` (`c`).
    Si el atajo se atiende, hace `preventDefault`. Devuelve si los atajos están
    activos, para los `aria-keyshortcuts`; como lo lee del mismo store, se
    entera del cambio del interruptor sin recargar.
- **Un atajo hace exactamente lo que haría el control visible y habilitado
  equivalente, y nada si ese control no está o está inactivo.** `n` es
  «Iniciar», `s` es «Detener», `m` es el conmutador de modo y `c` es el botón de
  continuar de la fila de `lastEntryId`. Así no hay ninguna regla nueva: con el
  timer corriendo, `n` no hace nada porque «Iniciar» no está; con el timer
  corriendo, `m` no hace nada porque el conmutador está inactivo (TT-30); con la
  membresía desactivada no hay controles y no hay atajos (TT-92); con una
  operación en vuelo los controles están inactivos y los atajos también.
- **Accesibilidad de los atajos:**
  - **Se descubren** por el botón con ícono de teclado y nombre accesible
    «Atajos de teclado», que abre `shortcuts-dialog`. Los controles llevan
    `aria-keyshortcuts` mientras los atajos están activos.
  - **Se apagan** (WCAG 2.1.4) con el interruptor «Usar atajos de una tecla» del
    diálogo. La preferencia se guarda en `localStorage`, por navegador, como el
    modo de TT-16 se guarda por navegador. Es `localStorage` y no una cookie
    porque nada se dibuja distinto en el servidor según su valor.
- **`shortcuts-dialog.tsx`** (nuevo) lista los cuatro atajos con su acción, el
  interruptor —`Switch` de `src/components/ui/switch.tsx`, conectado a
  `useShortcutsEnabled`— y una línea: «No funcionan mientras escribís en un
  campo ni con un menú o un diálogo abierto.».
- **`entry-times-editor.tsx`** y **`running-start-editor.tsx`** ponen
  `data-tracker-shortcuts="off"` en su raíz y nada más.
- **`mode-switch.tsx`** recibe si los atajos están activos y pone
  `aria-keyshortcuts="M"`.
- **`tracker-screen.tsx`** le pasa `state.lastEntryId` a `EntryList`.
- **`labels.ts`** suma:

  | Clave                | Texto                                                                             |
  | -------------------- | --------------------------------------------------------------------------------- |
  | `entryNotContinued`  | «No se pudo continuar la entrada.»                                                |
  | `entryNotDuplicated` | «No se pudo duplicar la entrada.»                                                 |
  | `timerNotDiscarded`  | «No se pudo descartar el timer.»                                                  |
  | `discardTitle`       | «¿Descartar el timer?»                                                            |
  | `discardDescription` | «Se borra el tiempo que lleva corriendo y no se puede deshacer.»                  |
  | `shortcutsTitle`     | «Atajos de teclado»                                                               |
  | `shortcutsToggle`    | «Usar atajos de una tecla»                                                        |
  | `shortcutsHint`      | «No funcionan mientras escribís en un campo ni con un menú o un diálogo abierto.» |

## 7. Criterios de aceptación

1. **TT-57** — El botón de continuar de una fila crea una entrada nueva
   corriendo, con la descripción de la original; la original no cambia y la
   barra muestra el timer nuevo.
2. **TT-36** — Continuar con un timer corriendo lo cierra en el mismo instante
   en que arranca el nuevo: el `ended_at` del viejo es el `started_at` del
   nuevo, y el viejo aparece en la lista. **La excepción es la del slice 3**
   (§4.5 y criterio 23 de su contrato): si el inicio del timer abierto quedó
   después del `now()` de la base, el viejo cierra en su propio inicio, con
   duración cero, y el nuevo arranca antes; quedan superpuestos por segundos
   (TT-82).
3. **B-1 del slice 2** — Continuar con el modo manual elegido y texto tecleado
   en la descripción: la barra pasa a timer con la descripción continuada; al
   detenerlo, vuelve el texto retenido.
4. **ADR 0007, continuar** — Un segundo `continueEntry` con el mismo `id`
   responde la misma fila y no escribe nada: ningún timer cerrado de más,
   ninguna fila nueva, ningún registro de auditoría; en secuencia y en
   paralelo. Si la continuación ya se detuvo, el reintento la responde cerrada
   y no escribe. Con la respuesta perdida de verdad —el servidor aplicó el
   pedido y el navegador no recibió la respuesta—, «Reintentar» deja exactamente
   un timer corriendo y ninguna entrada cerrada de más.
5. **ADR 0007, el id de otra fila** — Un `continueEntry` o un `duplicateEntry`
   con el id de una entrada ajena, de este o de otro workspace, no escribe nada
   y el timer propio que estaba corriendo sigue abierto. El service lanza el
   `ForbiddenError` de `createOnce`, con `code: "forbidden"`; la action
   responde `forbidden` con «No tenés permiso para hacer esto.». Es la misma
   regla que el criterio 4 del slice 2b.
6. **TT-58, la regla de horas** — La copia tiene exactamente el `started_at` y
   el `ended_at` de la original, segundos incluidos. **Es el único criterio que
   afirma la regla, pendiente de P-14.**
7. **TT-58** — «Duplicar» deja una fila más con la descripción de la original
   en la lista, y la original intacta. Un reintento con el mismo `id` no crea
   una segunda copia.
8. **TT-58, la entrada que corre** — Duplicar la entrada abierta responde
   `timer_running` con «Esta entrada es la que está corriendo.» y no escribe.
9. **TT-65** — «Descartar», desde el menú de la barra y con confirmación, borra
   el timer: la barra queda en `0:00:00` con «Iniciar» y la descripción vacía,
   el foco queda en la descripción, y la entrada no aparece en la lista.
   «Cancelar» no cambia nada y devuelve el foco al botón del menú.
10. **TT-65 y B-1** — Descartar un timer forzado con el modo manual elegido
    devuelve la barra a modo manual con el texto retenido.
11. **TT-65, los cruces** — Descartar un timer que otra pestaña detuvo responde
    «Este timer ya había sido detenido.» y la entrada cerrada sigue en la lista;
    uno que otra pestaña cerró al arrancar o continuar, igual; uno que otra
    pestaña borró, éxito sin aviso.
12. **TT-65, el guardado en vuelo** — Mientras viaja un guardado de la
    descripción, el botón de confirmar el descarte está inactivo.
13. **TT-26, la equivalencia** — Con el foco fuera de los campos, `n` arranca,
    `s` detiene, `m` cambia de modo y `c` continúa la entrada de `lastEntryId`.
    Cada uno no hace nada cuando su control no está o está inactivo.
14. **TT-26, dónde no se disparan** — Los atajos no hacen nada con el foco en un
    campo de texto, con una tecla modificadora, con la tecla mantenida, con un
    diálogo, un menú o el calendario abiertos, ni dentro de un editor del
    slice 3.
15. **TT-26, descubrir y apagar** — El botón «Atajos de teclado» abre el diálogo
    con los cuatro atajos. Con el interruptor apagado, **sin recargar**, la fila
    de `lastEntryId` deja de anunciar `aria-keyshortcuts` y `c` no hace nada;
    ningún atajo hace nada y ningún control anuncia `aria-keyshortcuts`. La
    preferencia sobrevive a una recarga.
16. **`lastEntryId`** — Es la entrada cerrada más reciente que ya empezó: no una
    futura, no el timer activo; `null` sin entradas cerradas pasadas. Con dos
    que empiezan en el mismo instante, es la que la lista dibuja primero.
17. **TT-79, TT-80** — Continuar o duplicar una entrada ajena responde «No tenés
    permiso para editar esta entrada.»; una entrada borrada, «Esa entrada ya no
    existe.».
18. **TT-66, TT-92** — Los cinco roles pueden continuar, duplicar y descartar lo
    propio; con la membresía desactivada las tres actions responden el mensaje
    neutro —también cuando el `id` de continuar o duplicar es el de una entrada
    propia que existe— y no hay botones, menú ni atajos.
19. **Auditoría** — `timeEntry.continue` (más el `timeEntry.stop` del timer que
    cerró), `timeEntry.duplicate` y `timeEntry.discard`, con sus valores.
20. **La capa de action** — Las tres actions nuevas traducen el `ZodError`
    —incluidos un `id` que no es UUID v4 y un `id` igual a `sourceId`, también
    con otras mayúsculas, que responde «La entrada nueva no puede usar el id de
    la original.»—, conservan código y mensaje de un error de dominio, usan el
    mensaje neutro sin permiso y **revalidan `/` también cuando devuelven
    error**.
21. **TT-37, carreras de continuar, cruzadas** — Con un timer previo y la
    barrera del slice 2b obligando a que se crucen: un `continueEntry` y un
    `startTimer` de ids distintos, y dos `continueEntry` **de la misma
    entrada** con ids distintos, dejan cada vez un solo timer corriendo, la
    previa como única entrada cerrada y ninguna de 0 s; las dos respuestas son
    «creada + ganador» con el mismo `running.id`. El segundo caso es el que
    falla si la original se lee con `FOR UPDATE`.
22. **El aviso de continuar que baja** — Después de una respuesta perdida al
    continuar, cuando la revalidación trae el timer que creó el primer intento,
    el aviso «No se pudo continuar la entrada.» desaparece.
23. **Repetir en vez de reintentar** — Después de una respuesta perdida, con el
    aviso visible, apretar otra vez el botón de continuar de la misma fila deja
    un solo timer corriendo y ninguna entrada cerrada de más; apretar otra vez
    «Duplicar» en la misma fila deja una sola copia.

### Con qué se verifica cada criterio

| Criterio | Tipo                 | Archivo                                                          | Qué afirma                                                                                                                                                                                 |
| -------- | -------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | integración + e2e    | `service.integration.test.ts`; `e2e/continue-duplicate.spec.ts`  | la fila nueva abierta con la descripción y la original intacta; y la barra corriendo después del clic                                                                                      |
| 2        | integración + e2e    | `service.integration.test.ts`; `e2e/continue-duplicate.spec.ts`  | los dos instantes iguales, y la excepción con un timer sembrado con inicio futuro; y la entrada cerrada en la lista                                                                        |
| 3        | e2e                  | `e2e/continue-duplicate.spec.ts`                                 | el texto retenido vuelve al detener                                                                                                                                                        |
| 4        | integración + e2e    | `service.integration.test.ts`; `e2e/continue-duplicate.spec.ts`  | dos pedidos con el mismo id, en secuencia y en paralelo, dejan una fila y un cierre; el reintento sobre la fila ya detenida; y la respuesta perdida de verdad                              |
| 5        | integración          | `service.integration.test.ts`; `actions.integration.test.ts`     | por las dos actions, con el id de una fila de otra persona y de otro workspace: `code: "forbidden"`, sin filas nuevas y con el timer abierto en el service; el mensaje neutro en la action |
| 6        | integración          | `service.integration.test.ts`                                    | los dos instantes de la copia iguales a los de la original sembrada con segundos                                                                                                           |
| 7        | integración + e2e    | `service.integration.test.ts`; `e2e/continue-duplicate.spec.ts`  | la copia, la original intacta y el reintento sin segunda copia; y una fila más con esa descripción en la lista                                                                             |
| 8        | integración          | `service.integration.test.ts`                                    | el rechazo sin escribir                                                                                                                                                                    |
| 9        | integración + e2e    | `service.integration.test.ts`; `e2e/continue-duplicate.spec.ts`  | la fila borrada; y la barra vacía con el foco en la descripción, más el cancelar con el foco en el menú                                                                                    |
| 10       | e2e                  | `e2e/continue-duplicate.spec.ts`                                 | la barra en modo manual con el texto retenido                                                                                                                                              |
| 11       | integración + e2e    | `service.integration.test.ts`; `e2e/continue-duplicate.spec.ts`  | los tres desenlaces; y el cruce con la parada desde otra pestaña                                                                                                                           |
| 12       | e2e                  | `e2e/continue-duplicate.spec.ts`                                 | el botón inactivo con el guardado retenido por la ruta                                                                                                                                     |
| 13       | unidad + e2e         | `tracker-shortcuts.test.ts`; `e2e/continue-duplicate.spec.ts`    | el mapa de teclas; y los cuatro atajos con el foco en `body`, más `n` con un timer corriendo                                                                                               |
| 14       | unidad + e2e         | `tracker-shortcuts.test.ts`; `e2e/continue-duplicate.spec.ts`    | cada exclusión de `shortcutOf`; y `n` tecleada en la descripción no arranca                                                                                                                |
| 15       | unidad + e2e         | `tracker-shortcuts.test.ts`; `e2e/continue-duplicate.spec.ts`    | `shortcutsEnabledFrom` con ausente, `"on"`, `"off"` y un valor desconocido; y el interruptor sin recargar y con recarga                                                                    |
| 16       | integración          | `service.integration.test.ts`                                    | con una futura, con un timer abierto, sin entradas, y con dos sembradas en el mismo instante                                                                                               |
| 17       | integración          | `service.integration.test.ts`; `actions.integration.test.ts`     | los textos de TT-79 y TT-80, en el service y en la action                                                                                                                                  |
| 18       | integración          | `permissions.integration.test.ts`; `actions.integration.test.ts` | los cinco roles; `inactive` e `invited` con el mensaje neutro, también con el id de una entrada propia existente                                                                           |
| 19       | integración          | `audit.integration.test.ts`                                      | los tres `action` con sus valores, y ninguno en un reintento resuelto                                                                                                                      |
| 20       | unidad + integración | `schema.test.ts`; `actions.integration.test.ts`                  | el `refine` con el mismo id y con otras mayúsculas, y el UUID que no es v4; y las traducciones y la revalidación en el camino de error                                                     |
| 21       | integración          | `service.integration.test.ts`                                    | los dos casos con la barrera del 2b sobre la fila del timer previo: las filas, los cierres y las dos respuestas                                                                            |
| 22       | e2e                  | `e2e/continue-duplicate.spec.ts`                                 | el aviso desaparece cuando llega la revalidación                                                                                                                                           |
| 23       | e2e                  | `e2e/continue-duplicate.spec.ts`                                 | después de la respuesta perdida, continuar otra vez: un timer y ninguna cerrada de más; duplicar otra vez: una sola copia                                                                  |

### Recorridos obligatorios de `e2e/continue-duplicate.spec.ts`

Dueño: `tests-slice4`. Cada recorrido usa una persona propia del spec, para que
ningún otro test le cambie el timer ni la lista.

1. Continuar una fila sin timer corriendo, y otra con un timer corriendo: la
   barra corre con la descripción continuada y el timer anterior aparece cerrado
   en la lista (criterios 1 y 2).
2. Con el modo manual elegido y texto en la descripción, continuar una fila,
   detener, y ver el texto de vuelta (criterio 3).
3. **La respuesta perdida de verdad**: interceptar el pedido de «Continuar» con
   `page.route`, dejarlo llegar al servidor con `route.fetch()` y descartar la
   respuesta con `route.abort()`; ver el aviso con «Reintentar», reintentar, y
   comprobar que hay un solo timer corriendo y ninguna entrada cerrada de más
   (criterio 4). Hasta el clic se retienen las revalidaciones, como en el
   recorrido equivalente del slice 2b, para que ninguna baje el aviso.
4. Duplicar una fila y ver una fila más con la misma descripción en la lista, y
   la original intacta; sin mirar las horas, el grupo ni el total de la copia
   (criterio 7).
5. Descartar con confirmación, con el foco en la descripción al terminar, y con
   cancelar; descartar con el modo manual elegido y el timer forzado
   (criterios 9 y 10).
6. Detener el timer desde una segunda pestaña y descartar desde la primera:
   aviso «Este timer ya había sido detenido.» y la entrada cerrada en la lista
   (criterio 11).
7. Retener el guardado de la descripción con `page.route`, abrir el descarte y
   ver el confirmar inactivo hasta que el guardado responde (criterio 12).
8. Los cuatro atajos con el foco en `body`; `n` tecleada en la descripción no
   arranca; `n` con un timer corriendo no hace nada; con un diálogo abierto no
   hacen nada. Apagar el interruptor y, **sin recargar**, ver que la fila de
   `lastEntryId` ya no anuncia `aria-keyshortcuts` y que `c` no continúa nada;
   después recargar y ver que `n` no arranca y que «Iniciar» no anuncia
   `aria-keyshortcuts` (criterios 13, 14 y 15).
9. **El aviso de continuar que baja**: con el reloj de la página instalado, la
   respuesta perdida del recorrido 3; adelantar el reloj 61 s para disparar la
   revalidación de P-11 y ver la barra con el timer continuado y el aviso fuera
   (criterio 22).
10. **Repetir en vez de reintentar**: la respuesta perdida del recorrido 3, y
    apretar otra vez el botón de continuar de la misma fila en vez de
    «Reintentar»: un timer corriendo y ninguna entrada cerrada de más. Lo mismo
    con «Duplicar», interceptando su pedido: una sola copia en la lista
    (criterio 23).

## 8. Deuda conocida del slice

Huecos de verificación:

- **La regla de horas de la copia (TT-58) está sin verificar** contra Clockify
  (P-14). Cambiarla es tocar `duplicateTimes` y el criterio 6, y, si la regla
  nueva trae rechazos propios, sumarlos a los errores de la action (§1).
  `outsideWindow` no hace falta con ninguna de las alternativas consideradas.
- **Los atajos con un lector de pantalla en modo de navegación** no llegan a la
  página: el lector se queda con las letras. No es un defecto sino cómo funcionan
  esos lectores; el diálogo de atajos y los controles siguen ahí, y el
  interruptor existe justamente para quien prefiere que no estén.
- **La exclusión por `data-tracker-shortcuts="off"` depende de que los editores
  la pongan.** Un editor nuevo que no la ponga deja los atajos activos con el
  foco en su botón de fecha. El unit test cubre la regla; que cada editor lleve
  la marca se mira en la revisión.
- **La fila de `lastEntryId` puede quedar vieja hasta 60 segundos** (P-11): si
  otra pestaña creó una entrada más nueva, `c` continúa la que esta pestaña
  muestra como última. Es lo que la persona ve, y la revalidación lo corrige.
- **El store del interruptor no tiene test de unidad.** `shortcutsEnabledFrom`
  sí; `subscribe`, el `try/catch` y el evento propio viven en el hook y sin DOM
  en vitest no se pueden afirmar. El recorrido 8 cubre lo observable: el
  cambio sin recargar y con recarga.
- **Que `c` reuse el id pendiente no tiene recorrido propio.** Pasa por el mismo
  manejador que el botón de continuar, que sí lo tiene (recorrido 10).

Consecuencias de diseño:

- **Con el almacenamiento del sitio bloqueado, los atajos no se pueden
  apagar.** La lectura que falla da «activos» y la escritura que falla no
  cambia nada, que es lo que fija la resolución de M-1: si no se puede leer la
  preferencia, vale la de omisión. Para quien navega así, WCAG 2.1.4 queda sin
  cumplir; la salida, si hace falta, es guardar la preferencia por persona en
  el servidor, con el perfil del slice 7.
- **El alta manual sigue sin «Reintentar».** Adoptar el ADR 0007 en
  `createManualEntry` le devolvería el botón y retiraría TT-109; es una decisión
  de paridad del equipo, no de este slice.
- **Un reintento de duplicar o de continuar puede recrear una fila que la
  persona borró** entre la respuesta perdida y el clic (ADR 0007). En continuar
  la ventana se achica con el aviso que baja cuando llega el timer; en duplicar
  no hay esa señal.
- **Duplicar dos veces a propósito con el aviso de falla visible da una sola
  copia.** Es el precio de que repetir no duplique: quien quiera dos copias
  después de una falla de red tiene que esperar a que el aviso baje, con
  cualquier otra operación del grupo de ese día.
- **Continuar puede perder la carrera con un arranque simultáneo** de otra
  pestaña y responder el timer del ganador, que no es una continuación. Es el
  desenlace del ADR 0003 y ya vale para «Iniciar».
- **Continuar con el modo timer reemplaza la descripción sin arrancar de la
  barra.** Es lo que ya pasa con un timer que llega de otra pestaña; con el modo
  manual, en cambio, el texto se retiene (B-1).
