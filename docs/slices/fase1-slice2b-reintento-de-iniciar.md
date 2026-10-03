# Fase 1, slice 2b: el reintento de «Iniciar»

Contrato de un slice chico, intercalado entre el 2 y el 3. Módulo `time-entry`,
en `src/modules/time-entry/`, pantalla `/`, más dos archivos neutros en
`src/server/` que usan también los slices 4 y 9.

Origen: hallazgo M-3 de la ronda 1 de `architecture-reviewer` sobre el slice 4
([`correcciones-fase1-slice4.md`](correcciones-fase1-slice4.md)). Fuente de los
comportamientos: `docs/parity/time-tracker.md`, TT-89, TT-90 y TT-109, más
TT-22, TT-35, TT-36 y TT-37 por arrastre. Lugar en el plan:
[mapa de la fase 1](fase1-mapa.md). Decisiones de arquitectura asociadas:
[ADR 0007, el cliente elige el id de la entrada que crea](../adr/0007-el-cliente-elige-el-id-de-las-altas.md),
que este slice implementa por primera vez y que se acepta probado sobre este
caso; y [ADR 0003, un solo timer activo](../adr/0003-un-solo-timer-activo.md),
que el 0007 enmienda.

Correcciones aplicadas: ronda 2 de `architecture-reviewer` sobre el 4, el 2b y
el ADR 0007; el arrastre de M-3 de la ronda 1 del slice 9, que saca
`createOnce` y el reconocimiento de restricciones a `src/server/`; y los cinco
supuestos que el slice 9 hace de `createOnce` (su §4.4).

## 0. Lugar en el orden

**Arranca con el slice 2 mergeado en `main` y se mergea antes de que empiece la
implementación del slice 3.**

- **Es un defecto de lo que ya está desplegado**, no una funcionalidad nueva:
  reintentar un «Iniciar» cuya respuesta se perdió cierra el timer que creó el
  primer intento y abre otro (`service.ts:173-184`, `use-entry-action.ts:68-81`).
  No depende del slice 3 ni de las operaciones del 4.
- **Va después del 2** porque el 2 renombró la barra a `tracker-bar.tsx`, que es
  donde se genera el id, y porque sus tests de integración son los que hay que
  adaptar.
- **Va antes del 3** porque el 3 toca `startTimer` (§4.5 de su contrato) y
  `stopById`, y es más barato que el 3 arranque sobre la forma final de
  `startTimer` que reescribirla dos veces.

### Lo que el slice 3 hereda de este

- **`startTimer` es `createEntryOnce` más `attemptStart`** (§4). La traducción
  de `isEndBeforeStart` que pide el §4.5 del slice 3 envuelve la llamada a
  `createEntryOnce` dentro de `startTimer`, igual que en `stopTimer`; no va
  adentro de `createOnce`, que solo trata los `23505`. Las dos cosas no se
  cruzan: una violación del `check` nunca es un `23505`.
- **`isEndBeforeStart` usa `hasConstraint` de `src/server/db/constraint-error.ts`**,
  igual que `isRunningConflict`. El repository ya no tiene su copia privada.
- **`closeRunning` y `stopById` no cambian acá.** El `greatest(now(),
started_at)` del slice 3 entra sin conflicto: `attemptStart` sigue cerrando con
  `closeRunning`.
- **Todo llamado a `startTimer` lleva `id`**, en el service y en la action. Los
  tests del slice 3 que arrancan un timer —el criterio 23, por ejemplo— lo
  pasan con `randomUUID()`.
- **`tracker-bar.tsx`** llega con el id generado en `handleToggle`, el id
  pendiente que se reusa mientras se ve el aviso de falla, y el aviso de
  «Iniciar» que baja cuando cambia el timer (§6). Los cambios del slice 3 sobre
  ese archivo —`todayKey` y `minDayKey` a `TimerBar`, el import de
  `time-draft.ts`, los textos de TT-108— son otras líneas.

El §0 del contrato del slice 3 ya pide el 2b mergeado.

### Lo que reusan los slices 4 y 9

- **El 4**: `newEntryId`, `createEntryOnce` con su gancho del timer,
  `findOwnById`, `idConstraint`, `insertRunning` con id, la regla del id
  pendiente en la interfaz, la barrera de los tests de carrera (§7) y el
  patrón del e2e de respuesta perdida. No los reimplementa: los extiende a
  continuar y duplicar.
- **El 9**: `createOnce` de `src/server/create-once.ts` y `constraintOf` y
  `hasConstraint` de `src/server/db/constraint-error.ts`, para las altas de su
  propio módulo, con su propio `can()` antes. **Las dos rutas, las firmas de
  §4 y los cinco supuestos de §4 son contrato**: cambiarlos pide avisar antes,
  porque el 9 escribe contra ellos. Además de `findOwn`, `attempt` e
  `idConstraint`, que nombra su §4.4, cada alta del 9 le pasa a `createOnce`
  el `id`, `replayed` y `action`.

## 1. Alcance

Entra: **TT-89 y TT-90 para «Iniciar», cumplidos de verdad**: el reintento de un
arranque cuya respuesta se perdió no cierra ni abre nada de más, y tampoco lo
hace apretar «Iniciar» otra vez mientras se ve el aviso de esa falla.

Entran por arrastre, sin reimplementarse pero verificándose con el id nuevo:

- **TT-22, TT-35, TT-36**: arrancar, y arrancar con otro timer corriendo, que lo
  cierra en el mismo instante.
- **TT-37**: dos arranques simultáneos de ids distintos dejan uno solo y
  ninguna entrada de 0 s.
- **TT-92**: con la membresía desactivada, ni siquiera el id de una fila propia
  da éxito.

### Lo que el documento de paridad tiene que registrar

**Tarea para `parity-analyst`, antes del merge**, en
`docs/parity/time-tracker.md`, TT-109:

- El párrafo «El resto de las operaciones del módulo sí ofrece "Reintentar",
  porque repetirlas es inofensivo: arrancar choca con el índice único, …» es
  falso para arrancar: el índice único solo frena dos arranques simultáneos, no
  un reintento que llega después. Tiene que decir que «Iniciar» es seguro de
  reintentar **porque el pedido lleva un id que elige el cliente** (ADR 0007), y
  que un reintento de un arranque ya aplicado responde el mismo timer sin
  escribir.
- La frase del párrafo anterior, «no choca contra el índice único del timer
  abierto, como sí haría un segundo arranque (TT-37)», se apoya en la misma
  idea y se corrige en el mismo sentido: lo que distingue al alta manual no es
  el índice, sino que no lleva id del cliente.
- TT-109 sigue en pie para el alta manual: este slice no la toca.

No es trabajo de `backend-dev` ni de `frontend-dev`, y ninguno de los dos edita
el documento de paridad.

### Queda afuera

- **Continuar y duplicar**, que son del slice 4 y reusan lo de acá.
- **El alta manual con id del cliente**: retiraría TT-109, y es una decisión de
  paridad del equipo (ADR 0007).
- **Mover `ActionResult`, `failure`, `handle` y el hook de acción** a lugares
  compartidos, que es del slice 9 y de la migración que deja anotada en el mapa.
  Este slice saca de `time-entry` solo lo que el ADR 0007 necesita en un solo
  lugar.
- **Sin tests de componentes con DOM**, como en los slices anteriores.

### Consecuencias sobre código ya entregado

| Archivo           | Qué cambia                                                                                                                        | Qué hay que volver a probar                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `schema.ts`       | `startTimerInput` suma `id`.                                                                                                      | TT-22 y la traducción del `ZodError` de la action |
| `service.ts`      | `startTimer` pasa por `createEntryOnce`; `attemptStart` recibe el id; el permiso sale de la transacción y va antes.               | TT-22, TT-35, TT-36, TT-37, TT-92                 |
| `repository.ts`   | `hasConstraint` y los códigos pasan a `constraint-error.ts`; `insertRunning` recibe el id; `findOwnById` e `idConstraint` nuevos. | TT-22, TT-34, TT-81 (`isEndBeforeStart`)          |
| `tracker-bar.tsx` | Genera el id de «Iniciar», reusa el pendiente con el aviso de falla visible, y baja ese aviso cuando cambia el timer.             | TT-16, TT-22, TT-30, B-1 del slice 2              |
| tests existentes  | Todo llamado a `startTimer` pasa un `id`.                                                                                         | Los mismos casos, sin cambiar lo que afirman      |

## 2. Cambios de esquema

**Ninguno.** La columna `id` ya es un `uuid` con valor por omisión
(`gen_random_uuid()`); el valor que llega lo reemplaza. La clave primaria se
llama `time_entry_pkey`, el nombre por omisión de Postgres para la de la
migración `0001`.

## 3. Acciones de permisos nuevas

**Ninguna.** `startTimer` sigue usando `timeEntry.own.create` con
`ownTimeEntryResource(actor)`. Lo que cambia es dónde se consulta: en el service
de `time-entry`, antes de llamar a `createOnce` (§4). `src/server/permissions/`
no se toca: `createOnce` usa `ForbiddenError` y el tipo `Action` tal como están.

## 4. Contrato de la server action

`startTimer` cambia su entrada y su implementación; su firma, su resultado y su
recorrido en `actions.ts` no cambian. **`actions.ts` no se edita**: el
`startTimerInput.parse` que ya hace valida el id nuevo, y su `failure` ya
traduce un `ForbiddenError` al mensaje neutro.

### Los tipos

```ts
/** Id de una entrada nueva, elegido por el cliente: ver el ADR 0007. */
const newEntryId = z.uuidv4();

/** El cliente no manda instantes: el inicio lo pone la base. */
export const startTimerInput = z.object({
  id: newEntryId,
  description: description.default(""),
});
```

`newEntryId` es privado del módulo y lo reusan las altas del slice 4. Es
`uuidv4` por lo que dice el ADR 0007: es lo que genera `crypto.randomUUID()`.

`StartTimerResult` no cambia de forma; cambia el comentario de `running`:

```ts
export type StartTimerResult = {
  /**
   * El timer que quedó corriendo. En un reintento resuelto por el ADR 0007, la
   * fila que creó el primer intento, en el estado en que esté: puede estar
   * cerrada.
   */
  readonly running: TimeEntryView;
  /** La entrada que estaba corriendo y se cerró en el mismo instante. */
  readonly stopped: TimeEntryView | null;
};
```

No hay códigos ni mensajes nuevos.

### `src/server/db/constraint-error.ts` (nuevo)

Lo que hoy es privado de `repository.ts` —los dos códigos y `hasConstraint`—
pasa acá sin cambiar de conducta, más una función que devuelve el nombre de la
restricción, que es lo que `createOnce` necesita para distinguir la clave
primaria de cualquier otra.

```ts
/** Postgres: violación de restricción única. */
export const UNIQUE_VIOLATION = "23505";
/** Postgres: violación de una restricción `check`. */
export const CHECK_VIOLATION = "23514";

/**
 * La restricción que violó el error, si el error tiene ese código. El driver
 * expone `code` y `constraint`; drizzle lo envuelve y lo deja en `cause`.
 */
export function constraintOf(error: unknown, code: string): string | null;

export function hasConstraint(error: unknown, code: string, constraint: string): boolean;
```

`hasConstraint` es `constraintOf(error, code) === constraint`. Ninguna de las
dos conoce un nombre de restricción: los nombres siguen en cada repository.

### `src/server/create-once.ts` (nuevo)

El algoritmo del ADR 0007, sin nada de ningún módulo:

```ts
/** Lo que decide el gancho ante otro choque: un resultado, u otra vuelta. */
export type ConflictOutcome<Result> =
  { readonly kind: "resolved"; readonly result: Result } | { readonly kind: "retry" };

export type Creation<Row, Result> = {
  /** El id que eligió el cliente. */
  readonly id: string;
  /**
   * La fila propia con ese id, sin bloqueo y fuera de toda transacción. Qué es
   * «propia» lo decide el módulo.
   */
  readonly findOwn: (id: string) => Promise<Row | undefined>;
  /** La transacción del alta. Deja salir el error de la base tal cual. */
  readonly attempt: () => Promise<Result>;
  /** El resultado cuando la fila propia ya existe. */
  readonly replayed: (row: Row) => Result;
  /** Nombre de la clave primaria de la tabla. */
  readonly idConstraint: string;
  /**
   * La acción de permiso del alta. Solo da el texto interno del
   * `ForbiddenError` del id ajeno: `createOnce` no consulta permisos.
   */
  readonly action: Action;
  /**
   * Un `23505` sobre otra restricción, ya comprobado que la fila propia no
   * existe. Si el choque no es suyo, vuelve a lanzar el error. Sin gancho, el
   * error sale tal cual.
   */
  readonly onOtherConflict?: (error: unknown) => Promise<ConflictOutcome<Result>>;
};

/** Hasta dos vueltas; solo el gancho pide la segunda. Ver el ADR 0007. */
export async function createOnce<Row, Result>(
  creation: Creation<Row, Result>,
): Promise<Result>;
```

**Los cinco supuestos**, que son los del ADR 0007 y los que el slice 9 escribe
en su §4.4. `createOnce` los cumple todos, y el criterio 13 prueba cada uno:

1. **Lee la fila propia antes de escribir.** Si existe, la responde sin llamar
   a `attempt`.
2. **Ante cualquier `23505`, vuelve a leer la fila propia antes de mirar qué
   restricción saltó**, y si existe, la responde.
3. **El choque con `idConstraint` sin fila propia sale como
   `ForbiddenError(action)`**, de `src/server/permissions`, sin otra vuelta. Es
   el mismo error que lanza `assertCan`, así que la action de cualquier módulo
   lo traduce al mensaje neutro sin código propio.
4. **Sin `onOtherConflict`, cualquier otro `23505` sale tal cual**, para que el
   service lo reconozca con `hasConstraint`. Un error que no es `23505` sale
   tal cual siempre, sin releer.
5. **No comprueba el permiso.** No sabe de qué acción ni de qué recurso se
   trata. El orden «permiso antes de la fila propia» lo garantiza quien la
   llama, con `can()` antes de llamarla.

Y además:

- **Agotadas las dos vueltas, sale el último error**, que la action traduce a
  `unexpected`, como pide el ADR 0003.
- **Importa solo de `src/server/db/constraint-error.ts` y de
  `src/server/permissions`.** No importa de ningún módulo, de `app/` ni de
  `components/`.

### El service de `time-entry`

`startTimer` es el **algoritmo del ADR 0007**, sin variantes. Lo que pone
`time-entry` es una función privada de `service.ts` que hace lo que
`createOnce` deja al llamador —el permiso— y le pasa lo suyo:

```ts
/**
 * El permiso de `timeEntry.own.create` y después `createOnce`, con la fila
 * propia por workspace y usuario y, si se pasa `winner`, la vuelta del timer
 * abierto del ADR 0003.
 */
async function createEntryOnce<Result>(
  actor: Actor,
  id: string,
  creation: {
    readonly attempt: () => Promise<Result>;
    readonly replayed: (row: TimeEntryRow) => Result;
    readonly winner?: (row: TimeEntryRow) => Result;
  },
): Promise<Result>;
```

- **Primero el permiso**: `can(actor, "timeEntry.own.create",
ownTimeEntryResource(actor))`; sin permiso, `TimeEntryError("forbidden",
timeEntryMessages.forbidden)`, como hoy. La consulta que hoy está dentro de
  la transacción de `attemptStart` sale de ahí: una sola vez, antes de llamar a
  `createOnce`. **Recién después**, `createOnce`.
- `findOwn` es `timeEntryRepository.findOwnById(actor.workspaceId,
actor.userId, id)`.
- `idConstraint` es `timeEntryRepository.idConstraint`, y `action`,
  `"timeEntry.own.create"`.
- Con `winner`, `onOtherConflict` es el gancho del timer: si
  `timeEntryRepository.isRunningConflict(error)` es falso, vuelve a lanzar el
  error; si no, `findRunning` sin transacción, y con fila
  `{ kind: "resolved", result: winner(fila) }`, sin fila `{ kind: "retry" }`.
  Sin `winner` no hay gancho.

`startTimer` queda:

```ts
export async function startTimer(
  actor: Actor,
  timeZone: string,
  input: StartTimerValues,
): Promise<StartTimerResult>;
```

- `attempt`: `attemptStart(actor, input.id, input.description)`, la transacción
  de hoy —`findRunning`, `closeRunning`, `insertRunning` con `id`,
  `recordAudit` con `timeEntry.start`— sin el `can` y sin el `catch` de
  `isRunningConflict`, que pasa al gancho.
- `replayed` y `winner`: los dos `{ running: toView(row), stopped: null }`.

Errores: `validation` (solo de Zod), `forbidden` (sin permiso, o un id ajeno),
`unexpected`. Permiso: `timeEntry.own.create`. Revalida `/`.

### Repository

```ts
/** Sin bloqueo. Filtra por workspace y por usuario: solo encuentra filas propias. */
findOwnById(workspaceId: string, userId: string, id: string, tx?: Executor):
  Promise<TimeEntryRow | undefined>;

/** La clave primaria de `time_entry`, para `createOnce`. */
readonly idConstraint: "time_entry_pkey";
```

`isRunningConflict` e `isEndBeforeStart` no cambian de conducta: pasan a usar
`hasConstraint` y los códigos de `constraint-error.ts`. Los nombres de las
restricciones siguen acá, que es la capa que conoce el motor (ADR 0003).

`insertRunning` recibe `id: string` en sus valores, obligatorio: toda alta de un
timer la pide el cliente. `insertClosed` no cambia en este slice.

### Audit log

No cambia. `timeEntry.start` y el `timeEntry.stop` del timer que se cierra se
escriben igual, con el id del cliente como `entityId`. **Un pedido resuelto por
la fila propia no deja registro**: no escribió nada.

### «Reintentar» en «Iniciar», verificado contra el diseño

- El reintento lleva el mismo `id`: `useEntryAction` guarda el último pedido
  entero y `retry` lo reenvía (`use-entry-action.ts`).
- Apretar «Iniciar» otra vez mientras se ve el aviso de falla por red también
  lleva el mismo `id` (§6).
- Si el primer intento se aplicó, la fila propia aparece **antes** de cerrar
  ningún timer, y la respuesta es la misma fila.
- Si todavía estaba viajando, uno de los dos choca con la clave primaria o con
  el índice, relee y responde la misma fila (ADR 0007, «Escenarios
  verificados»).
- Si no se aplicó, el reintento es el primer intento.

`retryHandlerOf` no cambia: «Reintentar» se ofrece con `unexpected`, como hasta
ahora.

## 5. Contrato de lectura

No cambia. `getTrackerState`, `TrackerState` y `TimeEntryView` quedan como
están.

## 6. Reparto de archivos

Las listas son disjuntas. Rutas absolutas; **(nuevo)** marca los archivos que el
slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/create-once.ts                                  (nuevo)
/home/maxi/program/clock/src/server/create-once.test.ts                             (nuevo)
/home/maxi/program/clock/src/server/db/constraint-error.ts                          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
```

Los cuatro archivos de integración están en la lista porque todos llaman a
`startTimer` y ahora tienen que pasarle un `id`; lo que afirman no cambia. Los
casos nuevos van en `service.integration.test.ts`, salvo los de la action, en
`actions.integration.test.ts`, y el de la membresía, en
`permissions.integration.test.ts`. La barrera de los tests de carrera (§7) es
un helper local de `service.integration.test.ts`; `src/test/` no se toca.

### frontend-dev

```
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
```

### tests-slice2b

```
/home/maxi/program/clock/e2e/start-retry.spec.ts  (nuevo)
```

Los specs y helpers existentes no se modifican; lo que falte vive en el spec
nuevo.

### parity-analyst

`docs/parity/time-tracker.md`, TT-109, con lo que dice §1.

### Lo que no toca nadie

`src/modules/time-entry/actions.ts`, el resto de `src/server/` —en particular
`src/server/permissions/`, `src/server/db/index.ts` y `src/server/db/schema.ts`—,
`drizzle/`, `src/app/`, `src/components/`, `src/test/`, los `vitest.config` y
los specs existentes de `e2e/`.

### Handshake de orden

1. **`backend-dev`**: `constraint-error.ts` y `create-once.ts` con sus firmas y
   su test de unidad, que no dependen de nada del módulo; `schema.ts` con el id
   y los tests existentes adaptados.
2. **`frontend-dev`**, enseguida: el id en `tracker-bar.tsx`. Hasta este commit
   el typecheck de la rama falla en `tracker-bar.tsx`, porque `start.run` no
   manda el campo obligatorio; los dos commits entran juntos en el PR.
3. `backend-dev` sigue con el repository y el service; `tests-slice2b`, con el
   spec, que no depende de nada más que de la rama.

Las firmas de `create-once.ts` y `constraint-error.ts` van en el primer commit
porque el slice 9 escribe contra ellas.

### Responsabilidades que no se leen en el nombre del archivo

- **`tracker-bar.tsx` elige el id en `handleToggle`**, en el manejador del clic
  y no en el render:
  - **Si el aviso de «Iniciar» está visible con `unexpected`**, usa el id del
    último pedido de arranque, que la barra guarda en una ref. Es el mismo
    pedido que «Reintentar» mandaría, con la descripción que tenga el campo
    ahora.
  - **En cualquier otro caso**, uno nuevo con `crypto.randomUUID()`, y lo guarda
    en la ref.

  La decisión se toma **antes de `clearNotices()`**, que baja el aviso. No hace
  falta otro estado para renovar el id: el aviso desaparece con un éxito, con
  cualquier operación nueva de la barra o cuando cambia el timer, y sin aviso
  visible el id es nuevo. «Reintentar» no pasa por acá: reenvía el último
  pedido entero. `crypto.randomUUID()` solo existe en un contexto seguro:
  `localhost` y los previews por HTTPS lo son; un `E2E_BASE_URL` por HTTP a una
  IP no.

- **`tracker-bar.tsx` baja el aviso de «Iniciar» cuando cambia
  `serverState.id`**, dentro del bloque que ya detecta ese cambio: `start.clear()`.
  Si la revalidación trae un timer —el que creó el pedido cuya respuesta se
  perdió, o uno de otra pestaña—, reintentar ya no tiene sentido: en el primer
  caso no haría nada, y en el segundo cerraría un timer que la persona no pidió
  cerrar. Es la mitigación de interfaz que nombra el ADR 0007.

## 7. Criterios de aceptación

1. **ADR 0007, el reintento en secuencia** — Un segundo `startTimer` con el
   mismo `id` responde la misma fila y no escribe nada: ningún timer cerrado de
   más, ninguna fila nueva, ningún registro de auditoría.
2. **ADR 0007, el reintento en paralelo** — Dos `startTimer` con el mismo `id`
   lanzados juntos, con un timer previo corriendo, dejan una sola fila con ese
   id corriendo, el timer previo cerrado una sola vez, un solo
   `timeEntry.start` y un solo `timeEntry.stop`. Vale se crucen o no en la base:
   si no se cruzan, el segundo encuentra la fila propia en el paso 1.
3. **TT-37, ids distintos, cruzados** — Dos `startTimer` con ids distintos,
   **obligados a cruzarse** con la barrera de abajo, responden uno la fila que
   creó y el otro la del ganador, **con el mismo `running.id`**, y dejan un solo
   timer corriendo. Con timer previo, la única cerrada es la previa; sin timer
   previo, no hay ninguna cerrada.
4. **ADR 0007, el id de otra fila** — Un `startTimer` con el id de una entrada
   de otra persona del mismo workspace, o de otro workspace, no escribe nada y
   el timer propio que estaba corriendo sigue abierto. El service lanza
   `ForbiddenError`, con `code: "forbidden"`; la action responde `forbidden`
   con «No tenés permiso para hacer esto.». Vale igual para el criterio 5 del
   slice 4: en el service se afirma el código, y el mensaje, en la action.
5. **ADR 0007, la fila en el estado en que esté** — Un reintento cuyo timer ya
   se detuvo responde la entrada cerrada y no escribe.
6. **TT-92 antes que el reintento** — Con la membresía `inactive` o `invited`,
   un `startTimer` con el id de una entrada propia que existe responde
   `forbidden` con el mensaje neutro, no la entrada. Se prueba **llamando al
   service**, no a `createOnce`: lo que se afirma es que el service de
   `time-entry` consulta el permiso antes de llamarla.
7. **La entrada** — Sin `id`, con un texto que no es UUID, con el UUID nulo o
   con un UUID v7, la action responde `validation` y revalida `/`.
8. **Las restricciones** — Un insert con el id de una fila que ya existe da un
   `23505` cuya restricción, según `constraintOf`, es
   `timeEntryRepository.idConstraint`, e `isRunningConflict` es falso; un
   segundo timer abierto da el que reconoce `isRunningConflict`. Se prueba
   llamando al repository directo, sin pasar por el service.
9. **TT-89 con la respuesta perdida de verdad** — El servidor aplica el
   arranque y el navegador no recibe la respuesta: aparece «No se pudo iniciar
   el timer.» con «Reintentar», y reintentar deja exactamente un timer
   corriendo, con la descripción tecleada, y ninguna entrada cerrada en la
   lista.
10. **El aviso que baja** — Después de una respuesta perdida, cuando la
    revalidación trae el timer que creó el primer intento, el aviso de
    «Iniciar» desaparece.
11. **Sin regresiones** — Los casos existentes de TT-22, TT-35, TT-36, TT-37,
    TT-92 y de la auditoría de `startTimer` siguen pasando sin cambiar lo que
    afirman.
12. **«Iniciar» otra vez en vez de «Reintentar»** — Después de una respuesta
    perdida, con el aviso visible, apretar «Iniciar» deja exactamente un timer
    corriendo y ninguna entrada cerrada en la lista, igual que «Reintentar».
13. **`createOnce`, los cinco supuestos y las vueltas** — Con dobles escritos a
    mano: la fila propia en el paso 1 responde sin llamar a `attempt`; un error
    que no es `23505` sale sin releer; un `23505` con fila propia la responde,
    sea de la clave primaria o de otra restricción; uno de la clave primaria
    sin fila propia sale como `ForbiddenError` sin otra vuelta; uno de otra
    restricción sin gancho sale tal cual; con gancho, `resolved` responde,
    `retry` da la segunda vuelta, y `retry` en la segunda sale con el último
    error; el gancho que vuelve a lanzar deja salir ese error; y ninguna rama
    consulta permisos.

### Con qué se verifica cada criterio

| Criterio | Tipo                 | Archivo                                                      | Qué afirma                                                                                                                                      |
| -------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | integración          | `service.integration.test.ts`; `audit.integration.test.ts`   | mismo id en la respuesta, filas y registros iguales antes y después del segundo llamado                                                         |
| 2        | integración          | `service.integration.test.ts`                                | con `Promise.all`: una fila con ese id, un cierre, un registro de cada `action`                                                                 |
| 3        | integración          | `service.integration.test.ts`                                | con la barrera, las dos variantes: «creada + ganador» con el mismo id, y las cerradas que corresponden                                          |
| 4        | integración          | `service.integration.test.ts`; `actions.integration.test.ts` | los dos ids ajenos, sembrados con `seedTimeEntry`: `code: "forbidden"`, sin filas nuevas y con el timer abierto; el mensaje neutro en la action |
| 5        | integración          | `service.integration.test.ts`                                | arrancar, detener, reintentar: `running.endedAt` no nulo y ninguna escritura                                                                    |
| 6        | integración          | `permissions.integration.test.ts`                            | desde el service, `inactive` e `invited` con un id propio existente reciben el mensaje neutro                                                   |
| 7        | unidad + integración | `schema.test.ts`; `actions.integration.test.ts`              | los cuatro rechazos de `startTimerInput`; y la traducción con la revalidación                                                                   |
| 8        | integración          | `service.integration.test.ts`                                | `insertRunning` con el id de una fila cerrada que ya existe; `seedTimeEntry` con un segundo timer abierto                                       |
| 9        | e2e                  | `e2e/start-retry.spec.ts`                                    | el aviso con «Reintentar», un timer corriendo y la lista sin entradas cerradas                                                                  |
| 10       | e2e                  | `e2e/start-retry.spec.ts`                                    | el aviso desaparece cuando llega la revalidación                                                                                                |
| 11       | integración          | los cuatro archivos de integración                           | los casos existentes, con `id`                                                                                                                  |
| 12       | e2e                  | `e2e/start-retry.spec.ts`                                    | «Iniciar» después de la respuesta perdida: un timer corriendo y la lista sin entradas cerradas                                                  |
| 13       | unidad               | `src/server/create-once.test.ts`                             | cada rama del algoritmo, con `findOwn`, `attempt` y el gancho como funciones que cuentan sus llamadas                                           |

### La barrera de los tests de carrera

`Promise.all` con ids distintos no garantiza que las dos transacciones se
crucen: la revisión midió 0 cruces en 150 corridas sin espera y 149 en 150 con
5 ms. Si no se cruzan, la segunda cierra el timer de la primera, que es el doble
clic en secuencia del ADR 0007 y deja una entrada de segundos: el test fallaría
a veces sobre una implementación correcta. Se fuerza el cruce con **una tercera
conexión que hace de barrera**, sin `vi.mock`:

- **Con timer previo**: la barrera abre una transacción y hace
  `SELECT … FOR UPDATE` sobre la fila del timer previo. Los dos arranques leen
  el timer sin bloqueo y se traban al cerrarlo.
- **Sin timer previo**: la barrera abre una transacción e inserta un timer
  abierto del mismo usuario, sin commitear. Los dos arranques no lo ven, y sus
  inserts se traban contra esa tupla.

Se lanzan los dos pedidos, se espera a que `pg_stat_activity` muestre **dos
sesiones con `wait_event_type = 'Lock'`** en la base del test, y se suelta la
barrera **con `rollback`**: en la segunda variante, un commit dejaría la tupla
de la barrera como timer abierto y los dos chocarían contra ella. La espera es
una consulta repetida con un tope de tiempo, no una espera fija. El resultado
esperado es «creada + ganador» con el mismo id en las dos respuestas.

El helper vive en `service.integration.test.ts` y lo reusa el slice 4. El pool
de conexiones de los tests alcanza: son tres conexiones a la vez.

### Recorridos obligatorios de `e2e/start-retry.spec.ts`

Dueño: `tests-slice2b`. Cada recorrido usa una persona propia del spec.

1. **La respuesta perdida de verdad** (criterio 9). Interceptar con
   `page.route` el `POST` a `/` con cabecera `next-action`, dejarlo llegar al
   servidor con `route.fetch()` y descartar la respuesta con `route.abort()`.
   Ver «No se pudo iniciar el timer.» con «Reintentar», sacar la intercepción,
   reintentar, y comprobar que la barra corre con la descripción tecleada y que
   la lista no tiene ninguna entrada cerrada. Con el defecto que corrige este
   slice, la lista mostraría una entrada de segundos. Hasta el clic en
   «Reintentar» se retienen las revalidaciones por `GET` a `/`, como hace
   `e2e/tracker.spec.ts`, para que ninguna traiga el timer antes y baje el
   aviso.
2. **El aviso que baja** (criterio 10). Con el reloj de la página instalado,
   la misma respuesta perdida; adelantar el reloj 61 s para disparar la
   revalidación de P-11 y ver que la barra muestra el timer corriendo y que el
   aviso ya no está.
3. **«Iniciar» otra vez** (criterio 12). La misma respuesta perdida y las
   mismas revalidaciones retenidas; sacar la intercepción y apretar «Iniciar»
   en vez de «Reintentar». Un timer corriendo y la lista sin entradas cerradas.

## 8. Deuda conocida del slice

- **Un id ajeno ya borrado se puede reusar.** Quien conozca el UUID de una
  entrada de otra persona que ya no existe puede crear una propia con ese id, y
  los registros de `audit_log` con ese `entity_id` mezclarían la historia de dos
  dueños. Hoy nadie lee ese registro y los ids ajenos no se exponen; el visor de
  auditoría, cuando exista, filtra por `workspace_id` y actor, no solo por
  `entity_id` (auditoría de seguridad del slice).
- **El doble clic con dos ids sigue dejando una entrada de duración casi
  cero**, si los dos pedidos no se cruzan en la base. Es la parte de la
  consecuencia del ADR 0003 que el 0007 no supera; la interfaz lo sigue
  evitando con el botón inactivo mientras viaja la escritura.
- **El reintento puede recrear un timer que la persona descartó o borró** entre
  la respuesta perdida y el clic en «Reintentar» (ADR 0007). El aviso que baja
  con la revalidación achica la ventana, no la cierra. No tiene test: el
  desenlace está escrito en el ADR y no hay una regla que afirmar.
- **«Iniciar» con el id pendiente no aplica una descripción editada entre los
  dos clics.** El servidor responde el timer del primer intento, con la
  descripción de entonces, y la barra la toma con la revalidación. Volver a
  editarla la guarda como cualquier edición del timer corriendo.
- **Que el gancho del timer pida la otra vuelta contra una base real sigue sin
  test**: exige que el ganador detenga su timer entre el choque y la relectura.
  La vuelta en sí está probada en `create-once.test.ts` (criterio 13), que
  cierra la parte de la deuda del ADR 0003 que no dependía de la base.
- **El orden «permiso antes de la fila propia» depende de cada llamador.**
  `createOnce` no lo puede imponer porque no consulta permisos. En `time-entry`
  lo garantiza `createEntryOnce`, que es la única puerta del módulo, y lo
  prueba el criterio 6; cada módulo nuevo tiene que tener su propio caso.
- **TT-109 dice algo falso hasta que `parity-analyst` lo corrija** (§1). La
  corrección es condición de merge.
- **El alta manual sigue sin «Reintentar».** Adoptar el ADR 0007 en
  `createManualEntry` es una decisión de paridad del equipo.
