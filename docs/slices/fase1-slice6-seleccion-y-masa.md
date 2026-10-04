# Fase 1, slice 6: selección y acciones en masa

Contrato del sexto slice vertical de la fase 1. Módulo `time-entry`, en
`src/modules/time-entry/`, pantalla `/`.

Fuente de los comportamientos: `docs/parity/time-tracker.md`, TT-62, TT-64 y la
parte de TT-63 que no depende de proyectos —descripción, hora y fecha en
bloque—. Lugar en el plan: [mapa de la fase 1](fase1-mapa.md). Correcciones
aplicadas: ronda 1 de `architecture-reviewer`
([`correcciones-fase1-slice6.md`](correcciones-fase1-slice6.md)), todos los
hallazgos. Decisiones de arquitectura asociadas:

- [ADR 0011, las acciones en masa son todo o nada](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md):
  nace acá, **propuesto**; aprobarlo es decisión del usuario.
- [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md) y
  [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md): la edición
  masiva de hora y fecha es su consumidor previsto («la edición masiva de hora
  y fecha (slice 6)», ADR 0006) y los aplica sin copiarlos.
- [ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md): la
  selección convive con la ventana en la URL, y una edición masiva que lleva
  entradas atrás entra en la regla de P-15.

El [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) **no se
aplica**: ninguna operación de este slice crea filas, y las dos son seguras de
reintentar sin un id elegido por el cliente (§4.7).

Decisiones del equipo que da por tomadas: el borrado es físico y no se deshace
(P-06, TT-61); no hay duración máxima por entrada (P-08); las fechas futuras se
aceptan (P-10); la ventana de la lista se extiende hasta la semana de toda
entrada que devuelve una mutación (P-15); el orden de implementación es
10 → 7 → 6.

## 0. Precondición de arranque

**El slice 6 se escribe para el árbol con los slices 3, 4, 5, 9, 10 y 7 en
`main`.** El mapa dice «depende de 3»; no alcanza:

- **Del 3**: `updateEntryTimes` y las dos funciones privadas del ADR 0006
  (`resolveExtreme`, `resolveEntryTimes`), `hasEditableTimes` (TT-110) y el
  rechazo de la entrada que corre (TT-111). La edición masiva de hora y fecha
  es esa regla repetida por fila (§4.3).
- **Del 4**: la vista optimista del borrado vive en `entry-list.tsx`
  (`removedIds`, `showRemoved`) y la comparten todos los grupos; el borrado
  masivo la usa. El reparto de responsabilidades entre lista, grupo y fila que
  este slice extiende es el que deja el 4.
- **Del 5**: la lista son semanas, `ReachWeekProvider` aplica P-15 y la
  ventana vive en la URL. La selección tiene que sobrevivir a las navegaciones
  de «Cargar más» y de P-15 (§5.3).
- **Del 9**: las piezas compartidas de las actions —`src/server/action.ts`,
  `src/lib/text.ts`, `src/hooks/use-action.ts`, `src/hooks/use-new-id.ts`—.
- **Del 10**: la migración de `time-entry` a esas piezas (su §4.1), así que
  este slice ya no la hace; las lecturas que devuelven la entrada con su
  proyecto y su tarea (su §5.2); `useTrackingCatalog`, que la fila necesita
  para dibujar su selector; y `day-group.tsx` como dueño de
  `updateEntryProject` de sus filas.
- **Del 7**: las horas canónicas `startClock` y `endClock` en la vista, los
  rótulos `startLabel` y `endLabel` con el formato de la persona, `clockLabel`,
  `parseClockInput` con formato, `useDisplayFormats` y `TrackerWorkspace` con
  `formats` (su §5).

**Supuestos de forma sobre el 10 y el 7.** Esos contratos todavía pueden
cambiar en su implementación. Este depende de estos nombres y formas, y **antes
de implementar pasa una ronda corta de `architecture-reviewer` contra el árbol
real** que los confirma o los corrige acá:

| Supuesto                                                                                                         | De dónde                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `EntryRow = TimeEntryRow & { project: ProjectRef \| null; task: TaskRef \| null }`, el tipo de las lecturas      | 10, §5.2                |
| Las lecturas con bloqueo usan `left join` y `for update of time_entry`                                           | 10, §5.2                |
| `toView(row: EntryRow, workspace: TrackerWorkspace)` arma `project` y `task` de la fila                          | 10, §5.2; 7, §5.4       |
| `TimeEntryErrorCode = ActionErrorCode \| "already_stopped" \| "timer_running"`                                   | 10, §4.1                |
| `TrackerWorkspace = TimeSettings & { createdAt }`, con `timezone`, `weekStart` y `formats`                       | 7, §5.4                 |
| `timeEntryView` lleva `startClock`, `endClock`, `startLabel` y `endLabel`                                        | 7, §5.4                 |
| `ClockField` recibe el rótulo (`clockLabel`) y su `onCommit` devuelve el rótulo aceptado; el borrador es canónico | 7, §6                   |
| `DateField` rotula con `useDisplayFormats`                                                                       | 7, §6                   |
| `EntryRow` del componente lee `useTrackingCatalog` y `useDisplayFormats`, cada uno con su proveedor              | 10, §6; 7, §5.5         |

**P-07 sigue abierto**: no está verificado si la edición masiva del rastreador
es del plan Free. Este contrato se escribe como si entrara; la decisión de
arrancar es del usuario (§8). Si el workspace del equipo muestra que es paga,
el slice sigue siendo construible y se registra como mejora deliberada, igual
que la fecha futura de P-10.

El mapa queda por corregir a «depende de 3, 4, 5, 7, 9 y 10»; no es un archivo
de este contrato.

## 1. Alcance

Entra:

- **TT-62**: una casilla por fila, una casilla por día que elige todas las
  entradas del día, y una barra con la cantidad seleccionada y las acciones.
- **TT-63, sin proyectos**: cambiar en bloque la descripción, la hora de
  inicio, la hora de fin y la fecha de las entradas seleccionadas.
- **TT-64**: borrar en bloque, confirmando con la palabra «BORRAR».

Entran por arrastre, verificándose por el camino nuevo:

- **TT-66**: los cinco roles editan y borran en masa sus propias entradas; una
  membresía desactivada no puede.
- **TT-79, TT-80, TT-110, TT-111, TT-112, TT-73 y el piso del ADR 0005**: cada
  fila de una operación en masa pasa por las mismas reglas que su edición
  individual y, si no las cumple, es un rechazo con el texto de siempre.
- **TT-55**: mientras la edición masiva viaja, las filas que toca quedan
  atenuadas.
- **TT-92**: con la membresía desactivada no hay casillas ni barra.
- **P-15**: una edición masiva que lleva entradas a una semana más vieja que la
  ventana la extiende hasta esa semana.
- **PF-13 y PF-14 del perfil**: las horas del diálogo se escriben y se muestran
  con el formato de la persona, como en la fila.

### Lo que el slice decide y que la paridad tiene que registrar

- **TT-62: la casilla está siempre visible**, no solo al pasar el puntero.
  `adaptar`: en una pantalla táctil no hay puntero que pase, y una casilla que
  aparece con el foco no se descubre recorriendo con el teclado.
- **TT-62: al editar o borrar con éxito, la selección se vacía**; si la
  operación falla, se conserva. _No verificado_ en Clockify.
- **TT-62: la selección es de la pestaña**: sobrevive a «Cargar más», a la
  revalidación y a P-15, y no a una recarga. Una entrada que sale de la lista
  sale de la selección.
- **TT-63: todo o nada.** Si alguna entrada no admite el cambio, no cambia
  ninguna y el aviso nombra cada una con su causa (ADR 0011).
- **TT-63: un campo vacío del diálogo no cambia.** Por eso desde el diálogo no
  se puede vaciar la descripción de varias entradas a la vez.
- **TT-63: la hora y la fecha se reemplazan, no se desplazan.** Lo que se
  pide se combina con el trío de cada fila: cambiar solo el inicio deja el fin
  de cada entrada como estaba, y una entrada que termina antes de su nuevo
  inicio pasa a terminar al día siguiente (TT-72), como en la fila.
- **TT-63: el proyecto y la tarea de cada entrada no cambian** hasta el slice
  12, y la vista que vuelve los conserva.
- **TT-63 y TT-64: hasta 200 entradas por operación.** Límite propio.
- **TT-64: «BORRAR» sin distinguir mayúsculas ni espacios en los extremos.**
- **TT-64: el borrado masivo no rechaza una entrada que ya no existe**: lo
  pedido, que no esté, ya se cumple.

**Lo registra `parity-analyst` antes del merge** (§6): lo de arriba en TT-62,
TT-63 y TT-64; la sección «Slice 6» de §11; y la lista «Lo que queda», que
pierde TT-62 y TT-64 y conserva de TT-63 solo proyecto, tarea, etiquetas y
facturable. P-07 sigue en «Abiertos».

### Queda afuera

- **Proyecto, tarea, etiquetas y facturable en bloque**: slice 12. Este slice
  deja el diálogo, el esquema y el service listos para sumarlos (§4.8).
- **Elegir un rango con Shift**, una casilla por semana y «seleccionar todo».
  TT-62 no los nombra.
- **Continuar y duplicar en masa**: Clockify no los documenta.
- **Deshacer** (P-06).
- **La migración de `time-entry` a las piezas compartidas**: la hace el 10.

### Consecuencias sobre código ya entregado

| Archivo                   | Qué cambia                                                                                                                                                         | Qué hay que volver a probar                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `src/server/action.ts`    | Suma `Rejection`, `RejectedError` y el campo `rejections` del error; `failure` reconoce `RejectedError` antes que `DomainError` y copia el campo (ADR 0011).       | `project/actions.integration.test.ts`          |
| `src/hooks/use-action.ts` | `ActionFailure` suma `rejections` y el hook lo conserva.                                                                                                           | `e2e/projects.spec.ts`                         |
| `src/server/audit.ts`     | Suma `recordAudits`, varias filas en una sentencia.                                                                                                                | —                                              |
| `schema.ts`               | `TimeEntryErrorCode` suma `"rejected"`; tres esquemas y dos resultados nuevos; textos.                                                                             | `schema.test.ts` entero                        |
| `service.ts`              | La regla de horas de `updateEntryTimes` pasa a `entryTimesFor`, que la edición masiva también llama; `tripleOf`; dos funciones nuevas.                              | TT-28, TT-56, TT-110, TT-111, TT-112, ADR 0006 |
| `repository.ts`           | Tres funciones nuevas.                                                                                                                                             | —                                              |
| `actions.ts`              | Dos actions nuevas.                                                                                                                                                | `actions.integration.test.ts` entero           |
| `day-group.tsx`           | La casilla del día; las filas ocupadas suman las de la lista; el foco va al encabezado solo por el borrado de una fila propia, no por el masivo (§5.4).              | TT-58, TT-60, el selector del 10 en la fila    |
| `entry-row.tsx`           | La casilla, primera de la fila.                                                                                                                                    | TT-49, TT-54, TT-57                            |
| `entry-list.tsx`          | Dueña de la selección y de las filas ocupadas por una edición masiva; dibuja `BulkActions`; aplica P-15 a la edición masiva.                                       | TT-52 (foco de «Cargar más»), TT-57, TT-26 «c» |
| `clock-field.tsx`         | `placeholder` opcional.                                                                                                                                            | TT-18, TT-28, TT-54                            |
| `date-field.tsx`          | `value` admite `null` y `placeholder` lo rotula.                                                                                                                   | TT-18, TT-56                                   |
| `tracker-feedback.tsx`    | `children` opcional, debajo del mensaje, para la lista de rechazos.                                                                                                | TT-90                                          |
| `labels.ts`               | Textos de §6.                                                                                                                                                      | —                                              |

## 2. Cambios de esquema

**Ninguno.** Las dos operaciones leen y escriben `time_entry` por su clave
primaria, filtrando por `workspace_id`. No hace falta índice nuevo: `id in (…)`
usa `time_entry_pkey`, y el `left join` hacia proyecto y tarea usa las claves
que deja el 10.

## 3. Acciones de permisos nuevas

**Ninguna. Una operación en masa es la operación de una fila, repetida.**

| Operación      | Acción de `can()`      | Sobre qué recurso                                                                 |
| -------------- | ---------------------- | --------------------------------------------------------------------------------- |
| Edición masiva | `timeEntry.own.update` | primero `ownTimeEntryResource(actor)`, por la membresía; después, cada fila leída |
| Borrado masivo | `timeEntry.own.delete` | lo mismo                                                                          |

- **Dos consultas a `can()`, como `discardTimer`.** La primera, con
  `ownTimeEntryResource(actor)`, antes de leer nada: una membresía desactivada
  recibe `forbidden` para todo el pedido, y no un rechazo por fila ni un éxito
  por mandar ids que no existen. La segunda, por fila, con
  `authorizeEntry(actor, acción, fila)`: la entrada ajena es un rechazo con el
  texto de TT-79.
- **`timeEntry.own.create` no se usa.** El mapa nombra «los tres
  `timeEntry.own.*`»; TT-63 y TT-64 son editar y borrar, y ninguna operación en
  masa crea.
- **No hay una acción `timeEntry.own.bulk…`.** Una acción propia tendría
  sentido si alguien pudiera editar entradas de a una y no en bloque, o al
  revés. Clockify no lo distingue (TT-66), y una acción más sería una segunda
  decisión que puede desalinearse con la primera.
- **`project.track` no entra**: el 6 no cambia el proyecto de ninguna entrada.
  Lo consulta el slice 12.
- `src/server/permissions/` **no cambia**.

## 4. Contrato de las server actions

Dos actions nuevas, `bulkEditEntries` y `bulkDeleteEntries`, con el recorrido
de siempre: sesión, Zod, `can()`, service en una transacción con su registro de
auditoría, y revalidación de `/`, también con error.

### 4.1 Lo que suma este slice a las piezas compartidas

`time-entry` ya usa las piezas compartidas desde el 10. Este slice les suma lo
que fija el ADR 0011:

- **`Rejection<Code>`** y **`RejectedError<Code>`** en `src/server/action.ts`,
  con la forma del ADR.
- **El campo `rejections?: readonly Rejection<Code>[]`** en la rama de error de
  `ActionResult`, y en `ActionFailure` de `src/hooks/use-action.ts`, que el
  hook conserva cuando el resultado lo trae.
- **`failure` reconoce `RejectedError` antes que `DomainError`** —que es su
  clase base— y copia el campo. Sin ese orden, el rechazo saldría sin lista.
- **`"rejected"` en la unión del módulo**: `TimeEntryErrorCode` pasa a
  `ActionErrorCode | "already_stopped" | "timer_running" | "rejected"`. No
  entra en `ActionErrorCode`, y `project` no lo ve.
- **`recordAudits`** en `src/server/audit.ts`:

  ```ts
  /** Varias constancias en una sola sentencia, dentro de la transacción. Sin filas, no hace nada. */
  export async function recordAudits(
    tx: Transaction,
    entries: readonly AuditEntry[],
  ): Promise<void>;
  ```

### 4.2 Los tipos

```ts
/** Tope de entradas de una operación en masa (TT-63, TT-64). */
export const BULK_MAX = 200;

/**
 * Los ids de una operación en masa. Se normalizan a minúsculas y sin repetir:
 * la base los iguala, y repetir uno no cambia lo pedido.
 */
const entryIds = z
  .array(z.uuid())
  .min(1, timeEntryMessages.bulkEmpty)
  .max(BULK_MAX, timeEntryMessages.bulkTooMany)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

/**
 * Lo que cambia en cada entrada. Un campo ausente no cambia; uno presente
 * reemplaza, también con "" en la descripción. Estricto: un campo que este
 * slice no conoce —el proyecto, antes del slice 12— se rechaza en vez de
 * ignorarse, con el texto de `unexpected` y no con el de Zod, que está en
 * inglés: ninguna interfaz lo manda.
 */
export const bulkEditChanges = z
  .strictObject(
    {
      description: description.optional(),
      /** Día local del inicio. */
      date: dayKeyInput.optional(),
      start: clockInput.optional(),
      /** Menor que el inicio que quede significa el día siguiente (TT-72). */
      end: clockInput.optional(),
    },
    { error: timeEntryMessages.unexpected },
  )
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    timeEntryMessages.bulkNoChanges,
  );

export const bulkEditEntriesInput = z.object({ ids: entryIds, changes: bulkEditChanges });
export const bulkDeleteEntriesInput = z.object({ ids: entryIds });

export type BulkEditChanges = z.output<typeof bulkEditChanges>;
export type BulkEditEntriesInput = z.input<typeof bulkEditEntriesInput>;
/** Lo que recibe el service: los ids ya normalizados. */
export type BulkEditEntriesValues = z.output<typeof bulkEditEntriesInput>;
export type BulkDeleteEntriesInput = z.input<typeof bulkDeleteEntriesInput>;
export type BulkDeleteEntriesValues = z.output<typeof bulkDeleteEntriesInput>;

/** Las vistas de todas las entradas pedidas, en el orden pedido: cambien o no. */
export type BulkEditEntriesResult = { readonly entries: readonly TimeEntryView[] };

/** Los ids pedidos: los que se borraron y los que ya no estaban (§4.4). */
export type BulkDeleteEntriesResult = { readonly ids: readonly string[] };
```

`description`, `dayKeyInput` y `clockInput` son los de hoy: mismos largos,
mismo recorte, mismo rechazo del carácter nulo, misma forma canónica. `start` y
`end` viajan en la hora canónica `HH:mm` de 24 h, también si la persona usa
12 h: el cliente interpreta lo tecleado con su formato antes de mandar, como
en la fila (ADR 0005, slice 7).

Los textos nuevos de `timeEntryMessages`:

| Clave                | Texto                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| `bulkEmpty`          | «Elegí al menos una entrada.»                                               |
| `bulkTooMany`        | «Se pueden elegir hasta 200 entradas a la vez.»                             |
| `bulkNoChanges`      | «Elegí al menos un cambio.»                                                 |
| `bulkEditRejected`   | «Ninguna entrada cambió: algunas de las elegidas no se pueden editar.»      |
| `bulkDeleteRejected` | «No se borró ninguna entrada: algunas de las elegidas no se pueden borrar.» |

Las actions:

```ts
export async function bulkEditEntries(
  input: BulkEditEntriesInput,
): Promise<ActionResult<BulkEditEntriesResult, TimeEntryErrorCode>>;

export async function bulkDeleteEntries(
  input: BulkDeleteEntriesInput,
): Promise<ActionResult<BulkDeleteEntriesResult, TimeEntryErrorCode>>;
```

Cada una parsea, llama a `assertCan` con la acción de §3 sobre
`ownTimeEntryResource(session.actor)` y llama al service:

```ts
export async function bulkEditEntries(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: BulkEditEntriesValues,
): Promise<BulkEditEntriesResult>;

export async function bulkDeleteEntries(
  actor: Actor,
  input: BulkDeleteEntriesValues,
): Promise<BulkDeleteEntriesResult>;
```

### 4.3 `bulkEditEntries`: la fila repetida

**La regla es la de `updateEntryTimes`, la misma función.** Lo que hoy hace
`updateEntryTimes` después de rechazar la entrada abierta —el rechazo de
TT-110, `resolveEntryTimes` y el piso del workspace— pasa a una función privada
de `service.ts`, y las dos mutaciones la llaman:

```ts
type EntryTriple = {
  readonly date: string;
  readonly start: string;
  readonly end: string;
};

/**
 * El trío canónico de la fila: `dayKey` del inicio, y `formatClock` del inicio
 * y del fin en la zona de la persona. Es el mismo `dayDate`, `startClock` y
 * `endClock` de su vista, y nunca sale de `startLabel` ni de `endLabel`, que
 * son de presentación y pueden venir en 12 h.
 */
function tripleOf(row: ClosedEntryRow, timeZone: string): EntryTriple;

/**
 * La regla de horas de una fila (slice 3, ADR 0006): de la entrada cerrada y
 * el trío pedido, los instantes a escribir. Lanza `TimeEntryError` con
 * `multiDayTimes`, `invalidDate`, `nonexistentClock`, `tooShort` o
 * `beforeWorkspace`.
 */
function entryTimesFor(
  row: ClosedEntryRow,
  triple: EntryTriple,
  workspace: TrackerWorkspace,
): { readonly startedAt: Date; readonly endedAt: Date };
```

`resolveEntryTimes` pasa a recibir un `EntryTriple` en vez de
`UpdateEntryTimesInput`; su cuerpo no cambia. `updateEntryTimes` queda en:
leer con bloqueo y autorizar, rechazar la abierta, `entryTimesFor`, escribir,
registrar. **No hay un segundo camino de horas**: si una regla del trío cambia,
cambia para las dos.

El algoritmo, en una transacción:

1. `can(actor, "timeEntry.own.update", ownTimeEntryResource(actor))`; si no,
   `forbidden` con `timeEntryMessages.forbidden`.
2. `findManyByIdsForUpdate(tx, actor.workspaceId, input.ids)`: todas las filas
   pedidas del workspace, de cualquier dueño, con su proyecto y su tarea, en el
   orden del id y con `for update of time_entry`.
3. **Evaluar cada id pedido, en el orden pedido, sin escribir.** Un
   `TimeEntryError` de la evaluación es un rechazo de esa fila; cualquier otro
   error sale tal cual.
   1. `authorizeEntry(actor, "timeEntry.own.update", fila)`: `not_found` si no
      está, `forbidden` con el texto de TT-79 si es ajena.
   2. Si está abierta, `timer_running` con `runningEntryTimes` (TT-111). Vale
      también si el cambio es solo la descripción: una operación en masa es
      sobre filas, y la entrada que corre no es una fila.
   3. **Descripción**: si viene y es distinta de la de la fila, cambia.
   4. **Horario**: si viene alguno de `date`, `start` o `end`, el trío pedido
      es `tripleOf(fila)` con esos campos reemplazados. **Si es igual al de la
      fila, el horario no cambia** y no se evalúa, igual que el editor de la
      fila no manda un trío sin cambios (`sameDraft`); así una entrada de más de
      un día no se rechaza por pedirle la fecha que ya tiene. Si es distinto,
      `entryTimesFor(fila, trío, workspace)`.
4. **Si hubo algún rechazo**, se lanza
   `RejectedError(timeEntryMessages.bulkEditRejected, rechazos)`, con los
   rechazos en el orden pedido. La transacción se revierte y no queda nada
   escrito ni registrado.
5. **Escribir**: por cada fila que cambia, una sola sentencia
   `updateClosedFields(tx, targetOf(fila), cambios)` con la descripción, los
   instantes o las dos cosas. Una fila que no cambia no se escribe. Si
   `updateClosedFields` devuelve `undefined` —el bloqueo lo hace imposible—,
   se lanza un error sin traducir y la transacción se revierte entera.
6. `recordAudits` con una constancia por fila escrita: acción
   `timeEntry.bulkEdit`, `previousValue` y `nextValue` con solo los campos que
   cambiaron —`description`, `startedAt`, `endedAt`—.
7. Devuelve `{ entries }`: la vista de cada id pedido, en el orden pedido.
   **La de una fila escrita es la fila que devolvió `updateClosedFields` con el
   `project` y la `task` de la leída en el paso 2**, que el 6 no cambia; la de
   una fila sin cambios es la leída. No hay relectura después de escribir, a
   diferencia de las mutaciones de una fila del 10: la lectura del paso 2 ya
   trae las referencias, bajo bloqueo, y nada en la transacción las mueve.

### 4.4 `bulkDeleteEntries`

En una transacción:

1. `can(actor, "timeEntry.own.delete", ownTimeEntryResource(actor))`; si no,
   `forbidden`.
2. `findManyByIdsForUpdate`, como en §4.3.
3. Por cada id pedido:
   - **Si la fila no está, no es un rechazo**: se saltea (ADR 0011). Es la
     regla de `discardTimer` (TT-65).
   - `authorizeEntry(actor, "timeEntry.own.delete", fila)`: ajena, rechazo con
     TT-79.
   - Abierta, rechazo con `runningEntryTimes`.
4. Con algún rechazo, `RejectedError(timeEntryMessages.bulkDeleteRejected, …)`.
5. `deleteClosedByIds(tx, filas autorizadas.map(targetOf))`, una sentencia. Si
   lo borrado no coincide con lo encontrado —el bloqueo lo hace imposible—, se
   lanza un error sin traducir y la transacción se revierte entera, como en el
   paso 5 de §4.3.
6. `recordAudits` con una constancia `timeEntry.bulkDelete` por fila borrada y
   la fila entera como `previousValue`: el borrado es físico y esa es la única
   copia que queda.
7. Devuelve `{ ids: input.ids }`.

**Una asimetría con `deleteEntry`, a propósito**: el borrado de una fila no
mira si la entrada está abierta, y el masivo la rechaza. Los dos casos solo
llegan con un pedido armado a mano, porque la abierta no es una fila; el
masivo no extiende a la entrada que corre un borrado que no pasa por la
confirmación de TT-65.

### 4.5 Las causas de un rechazo

Cada rechazo lleva el código y el texto de la operación de una fila. **No hay
texto nuevo por fila**: la causa es la misma, y la regla de una redacción por
causa se cumple sola.

| Causa                                              | Código          | Texto                 | Edición | Borrado |
| -------------------------------------------------- | --------------- | --------------------- | ------- | ------- |
| La fila ya no existe (TT-80)                       | `not_found`     | `notFound`            | sí      | no      |
| Es de otra persona (TT-79)                         | `forbidden`     | `forbiddenOtherOwner` | sí      | sí      |
| Es el timer que corre (TT-111)                     | `timer_running` | `runningEntryTimes`   | sí      | sí      |
| Dura más de un día y cambia su horario (TT-110)    | `validation`    | `multiDayTimes`       | sí      | —       |
| La hora no existe ese día (TT-112)                 | `validation`    | `nonexistentClock`    | sí      | —       |
| El par queda en menos de un minuto (TT-73)         | `validation`    | `tooShort`            | sí      | —       |
| El día siguiente al 9999-12-31, o el año 10000 UTC | `validation`    | `invalidDate`         | sí      | —       |
| Antes de la creación del workspace                 | `validation`    | `beforeWorkspace`     | sí      | —       |

El resultado de un pedido rechazado:

```ts
{
  ok: false,
  code: "rejected",
  message: timeEntryMessages.bulkEditRejected,
  rejections: [{ id, code: "validation", message: timeEntryMessages.multiDayTimes }, …],
}
```

Un rechazo nunca tiene código `rejected`. Lo que no depende de la fila —la
membresía, la entrada mal formada, el tope— responde con su código y sin lista.

### 4.6 Bloqueos y costo

- **El orden de los bloqueos es el del id, en una sola sentencia.**
  `findManyByIdsForUpdate` lleva `order by time_entry.id` y
  `for update of time_entry`. En el plan, el `Sort` va debajo de `LockRows`:
  Postgres bloquea las filas en el orden en que salen del ordenamiento. Sin el
  `order by`, el orden sería el del recorrido —índice o tabla—, que nadie
  garantiza. Con él, dos operaciones en masa sobre filas compartidas bloquean
  la primera fila común en el mismo orden y se ponen en fila en vez de
  esperarse en círculo. La revisión lo ejecutó en Postgres 17.11 con 5000 filas
  y 200 ids: dos masivas cruzadas en orden opuesto o solapado hacen commit las
  dos, y un `for update` por fila en el orden pedido termina en `40P01`. Lo
  afirma el criterio 21, que hace caer a ese mutante.
- **`for update of time_entry`**, y no `for update` a secas: Postgres rechaza
  bloquear el lado nulable de un `left join`, y el proyecto y la tarea no se
  escriben. Es el patrón de `findByIdForUpdate` del 10.
- **Sentencias**: una lectura —con el `left join`, sigue siendo una—, a lo sumo
  una escritura por fila que cambia y una inserción de auditoría; sin
  relectura (§4.3, paso 7). En el borrado, una lectura, un `delete` y una
  inserción. Con el tope de 200, la edición hace en el peor caso 202 sentencias
  en una transacción.
- **El tope no es de Clockify**: es lo que cabe en una transacción corta sobre
  Neon y cubre un mes de entradas de una persona —diez por día hábil—. Si el
  equipo necesita más, sube el número y la escritura del horario pasa a una
  sola sentencia `update … from (values …)`.

### 4.7 Reintentar

- **La edición llega a un punto fijo** (ADR 0006, ADR 0011): el segundo
  intento encuentra la descripción pedida y, en cada fila, el trío pedido, así
  que no escribe ni registra nada y responde las mismas vistas.
- **El borrado también**: las filas que borró el primer intento ya no están, y
  eso no es un rechazo.
- Por eso las dos ofrecen «Reintentar» con `unexpected` (TT-89), sin id del
  cliente. El reintento reenvía el último pedido entero, con los ids de
  entonces.

### 4.8 Lo que el slice 12 suma, sin que este lo construya

- **`bulkEditChanges` gana campos opcionales**, con la misma regla: ausente no
  cambia. `projectId: uuid | null` —`null` es «sin proyecto»— con `taskId`;
  `tags: { mode: "add" | "replace", ids }`; `billable: boolean`. Por eso el
  objeto es estricto desde ahora.
- **La evaluación por fila de §4.3 gana pasos**, uno por campo, y la escritura
  gana columnas en `updateClosedFields`; las etiquetas, su sentencia sobre la
  tabla de unión en la misma transacción.
- **Las vistas se releen.** Con el proyecto cambiado, la vista ya no puede
  salir de la fila escrita y las referencias leídas en el paso 2: el 12 relee
  las filas escritas con su proyecto y su tarea **en la misma transacción y con
  una sola sentencia**, no una por fila. Suma una sentencia a la cuenta de
  §4.6.
- **Lo que vale para todo el pedido no es un rechazo**: un proyecto elegido que
  ya no está disponible (TT-77) responde `not_found` para el pedido entero,
  antes de evaluar filas.
- **La constancia `timeEntry.bulkEdit`** suma los campos nuevos a
  `previousValue` y `nextValue`.
- **El diálogo gana secciones** (§5.2), cada una con su «sin cambios»: el
  selector de proyecto del 10 arranca en «Sin cambios» y ofrece «Sin proyecto»
  como opción aparte; las etiquetas, «Agregar» o «Reemplazar»; el facturable,
  tres estados. El borrador de `bulk-changes.ts` gana los campos y `toChanges`
  los traduce con la misma regla.

### 4.9 P-15

La edición masiva devuelve vistas, así que entra en la regla única del slice 5.
Fila nueva de su tabla:

| Mutación       | Dueño de la mutación | Aplica la regla                      | Semanas que pasa |
| -------------- | -------------------- | ------------------------------------ | ---------------- |
| Edición masiva | `bulk-actions.tsx`   | `entry-list.tsx`, por `onEntryWeeks` | `entries`        |

El borrado masivo no devuelve vistas y no avisa.

## 5. Contrato de lectura y pantalla

### 5.1 Lectura

**`getTrackerState` no cambia.** Todo lo que la selección y el diálogo
necesitan ya viaja en la vista: id, descripción, `dayDate`, `startLabel`,
`endLabel`, `editableTimes`, y el rótulo de su día en el grupo. La selección no
es un dato del servidor. **Los rótulos son de presentación**: nombran la fila
en la casilla y en el aviso; ningún trío del cliente ni del servidor sale de
ellos.

### 5.2 Qué ve la persona

- **Una casilla al principio de cada fila**, siempre visible, con el nombre
  accesible «Seleccionar «{descripción o Sin descripción}», {inicio} – {fin}»,
  con `startLabel` y `endLabel`: las horas en el formato de la persona. La hora
  va en el nombre porque dos entradas pueden tener la misma descripción.
- **Una casilla en el encabezado de cada día**, antes del rótulo, con el nombre
  «Seleccionar las entradas del día {rótulo}». Marcada si todas las filas del
  día están elegidas, mixta (`aria-checked="mixed"`) si algunas, vacía si
  ninguna. Con todas, las suelta; con ninguna o algunas, elige las que faltan.
- **La barra de acciones en masa**, arriba de la lista y fija al desplazarse,
  aparece con la primera entrada elegida: el texto «1 entrada seleccionada» /
  «N entradas seleccionadas» y los botones «Editar», «Borrar» y «Quitar
  selección». Con más de 200, «Editar» y «Borrar» quedan inactivos con el texto
  «Se pueden elegir hasta 200 entradas a la vez.» a la vista.
- **El diálogo «Editar N entradas»**: «Descripción», «Fecha», «Hora de inicio»
  y «Hora de fin», todos vacíos al abrir, con la ayuda «Lo que dejes vacío no
  cambia.» La fecha elegida tiene al lado «Quitar la fecha», que la vuelve a
  «Sin cambios». «Cancelar» y «Guardar»; «Guardar» queda inactivo mientras no
  haya ningún campo con algo.
- **Las horas del diálogo siguen el formato de la persona** (PF-13, PF-14),
  como el editor de la fila: el `ClockField` interpreta lo tecleado con
  `parseClockInput(texto, formats.time)` y muestra `clockLabel` de lo aceptado;
  el borrador guarda la hora canónica. **El `placeholder` depende del formato**:
  «hh:mm» con 24 h y «h:mm AM» con 12 h. La fecha se rotula con
  `formats.date`, como en `DateField`.
- **El diálogo «¿Borrar N entradas?»**: «No se puede deshacer.», el campo
  «Escribí BORRAR para confirmar», «Cancelar» y «Borrar». «Borrar» queda
  inactivo hasta que el campo dice «BORRAR», sin distinguir mayúsculas ni
  espacios en los extremos; Enter en el campo confirma si el texto vale.
- **Mientras la edición viaja**, las filas elegidas quedan atenuadas y
  `aria-busy` (TT-55) y «Guardar» queda inactivo. **Mientras el borrado viaja**,
  las filas desaparecen de forma optimista, como en el borrado de una fila, y
  vuelven si falla.
- **Al terminar bien**, la selección se vacía, la barra se va y el estado dice
  «Se editó 1 entrada.» / «Se editaron N entradas.» o «Se borró 1 entrada.» /
  «Se borraron N entradas.». Al borrar, mientras viaja, «Borrando…».
- **Al fallar**, la selección se conserva y aparece un aviso con el título
  «No se pudieron editar las entradas.» o «No se pudieron borrar las
  entradas.» (TT-90), el mensaje del resultado y, si es `rejected`, la lista de
  las entradas rechazadas: «{descripción o Sin descripción}, {rótulo del día},
  {inicio} – {fin}: {texto de la causa}», con los rótulos de la fila. Debajo,
  «Quitar esas entradas de la selección». Con `unexpected`, «Reintentar».
- **Con la membresía desactivada** (TT-92) no hay casillas ni barra.

### 5.3 La selección, en el cliente

- **Es estado de `entry-list.tsx`**, una lista de ids. No va en la URL: es de
  la pestaña y de este momento, y una URL compartida con una selección
  invitaría a borrar en otra pestaña algo que no se está mirando.
- **Sobrevive a todo lo que no desmonta la lista**: la navegación de «Cargar
  más», el `replace` de P-15, la revalidación de una mutación y la periódica de
  P-11. No sobrevive a una recarga.
- **Una entrada que sale de la lista sale de la selección, y no vuelve.** En
  cada render, la selección se recorta a los ids de las filas que la lista
  dibuja; si el recorte quitó alguno, se guarda recortada. Sale así la entrada
  borrada en otra pestaña, y la de una semana que dejó de verse porque «Atrás»
  achicó la ventana: **nunca se edita ni se borra una fila que no está en
  pantalla**. Las filas de un borrado en vuelo no se recortan: si el borrado
  falla, vuelven elegidas.
- **Lo que viaja en el pedido es la selección del momento de mandar**, y con
  ella, cómo nombraba la pantalla cada fila: descripción, rótulo del día y
  rótulos de las horas. Es lo que el aviso usa para nombrar las filas
  rechazadas, también la que ya no existe (ADR 0011).
- **Las filas ocupadas por una edición masiva** son un `useOptimistic` de ids
  en `entry-list.tsx`, que `bulk-actions.tsx` llama en el `optimistic` de
  `useAction`, como `showRemoved`. De ahí salen la fila atenuada y el estado
  inactivo de las casillas mientras la edición viaja, y React lo descarta solo
  cuando la transición termina.
- **La lógica es pura** y vive en `selection.ts`: elegir y soltar una fila,
  elegir y soltar un día, el estado de la casilla de un día, el recorte y
  quitar una lista de ids.

### 5.4 Foco, teclado y accesibilidad

Las dos lecciones del proyecto mandan acá: **un control con foco que pasa a
`disabled` lo pierde a `body`**, y **un aviso que la revalidación puede
desmontar sube a algo que sobrevive**.

- **Inactivo es `aria-disabled` y no actuar**, nunca `disabled`: «Editar» y
  «Borrar» con más de 200, «Guardar» sin cambios o con la edición en vuelo,
  «Borrar» del diálogo sin la palabra, las casillas y «Quitar selección»
  mientras una operación viaja.
- **La región de acciones en masa está siempre montada**, aunque no haya
  selección: `<section aria-label="Acciones en masa" tabIndex={-1}>`, con un
  único `role="status"` siempre montado —la cantidad, «Borrando…» y el
  resultado— y el lugar del aviso de error. Es el destino del foco cuando lo
  que lo tenía se va.
- **Cuando la barra sale del árbol con el foco adentro** —«Quitar selección»,
  el éxito de una operación, o el recorte porque las filas se fueron—, el foco
  va a la región.
- **El diálogo de edición**: al abrir, el foco va a «Descripción». «Cancelar» y
  Esc devuelven el foco a «Editar». Con éxito se cierra con el foco en la
  región. Con error queda abierto, con el aviso arriba de los botones y el
  foco donde estaba. Enter en un campo de texto guarda.
- **El diálogo de borrado**: al abrir, el foco va al campo. «Cancelar» y Esc
  vuelven a «Borrar». Al confirmar se cierra en el acto, con el foco en la
  región, y el borrado viaja.
- **El aviso de error sobrevive.** El del borrado vive en la región desde el
  principio. El de la edición vive en el diálogo mientras está abierto; si el
  diálogo sale del árbol con el aviso a la vista —la selección quedó vacía
  porque todas sus filas se fueron—, el aviso pasa a la región y el foco con
  él.
- **«Quitar esas entradas de la selección»** quita los ids rechazados y baja
  el aviso. El foco va a «Guardar» si el diálogo sigue abierto, a «Borrar» si
  la barra sigue en pantalla y, si la selección quedó vacía, a la región.
- **El encabezado de un día toma el foco solo por el borrado de una fila
  suya**, el de la acción `remove` del grupo, como hoy. Hoy lo dispara
  cualquier id de `removedIds` del grupo; con el borrado masivo eso movería el
  foco de la región a un encabezado, o a varios en fila. La condición pasa a
  ser que el borrado en vuelo sea el del propio grupo.
- **Teclado**: las casillas son paradas de Tab y Espacio las alterna. La
  casilla de Base UI recibe el foco en un elemento con rol `checkbox` que no es
  un `input`, así que **los atajos de TT-26 siguen activos** con el foco en una
  casilla, y se apagan solos dentro de los dos diálogos, que tienen rol
  `dialog`. No hay atajos nuevos.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/action.ts
/home/maxi/program/clock/src/server/audit.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
```

Las funciones nuevas de `repository.ts`:

```ts
/**
 * Las filas pedidas del workspace, de cualquier dueño —quién lo es lo decide
 * `can()`—, con su proyecto y su tarea por `left join`, como las lecturas del
 * slice 10. Una sola sentencia con `order by time_entry.id` y
 * `for update of time_entry`: el orden es el que evita que dos operaciones en
 * masa se esperen en círculo (§4.6), y el `of` deja sin bloquear el lado
 * nulable del join.
 */
findManyByIdsForUpdate(
  tx: Transaction,
  workspaceId: string,
  ids: readonly string[],
): Promise<readonly EntryRow[]>;

/** Cualquier subconjunto de los tres campos, solo en una fila cerrada. */
updateClosedFields(
  tx: Transaction,
  target: EntryTarget,
  fields: { description?: string; startedAt?: Date; endedAt?: Date },
): Promise<TimeEntryRow | undefined>;

/**
 * Las filas cerradas de esos destinos, en una sentencia. Los destinos salen de
 * `targetOf` sobre las filas que el service ya leyó y autorizó, así que el
 * `WHERE` repite su `workspace_id` y su `user_id`, como `isTarget`. Devuelve las
 * borradas; el service compara con las autorizadas.
 */
deleteClosedByIds(
  tx: Transaction,
  targets: readonly EntryTarget[],
): Promise<readonly TimeEntryRow[]>;
```

### frontend-dev

```
/home/maxi/program/clock/src/components/ui/checkbox.tsx                           (nuevo, generado)
/home/maxi/program/clock/src/hooks/use-action.ts
/home/maxi/program/clock/src/modules/time-entry/components/selection.ts           (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/selection.test.ts      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/bulk-changes.ts        (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/bulk-changes.test.ts   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/bulk-actions.tsx       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/bulk-edit-dialog.tsx   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/bulk-delete-dialog.tsx (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/entry-list.tsx
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.test.tsx     (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/clock-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-feedback.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
```

La casilla se genera con el CLI de shadcn, como está configurado en
`components.json` (`base-nova`). Si el generador suma dependencias,
`package.json` y `package-lock.json` entran en la lista solo para ese cambio.

### tests-slice6

```
/home/maxi/program/clock/e2e/bulk-actions.spec.ts                                 (nuevo)
/home/maxi/program/clock/e2e/tracker-page.ts
```

`tracker-page.ts` suma los localizadores de las casillas y de la barra. Si un
spec existente se rompe porque la fila o el encabezado del día ganaron una
casilla, se ajusta solo su localizador.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/time-tracker.md
```

Antes del merge, lo que enumera §1 en «Lo que el slice decide y que la paridad
tiene que registrar».

### Lo que no toca nadie

`src/server/permissions/`, `src/server/session.ts`, `src/server/db/`,
`drizzle/`, `src/server/time/`, `src/modules/project/` —el campo opcional de
`ActionResult` no le cambia nada—, `getTrackerState`, `tracker-screen.tsx`,
`tracker-bar.tsx`, `page.tsx`, `reach-week.tsx`, `entry-week.ts`,
`time-draft.ts`. Los contratos y correcciones de slices anteriores son
históricos y no se reescriben.

### Handshake de orden

0. **Antes de arrancar**, la ronda corta de `architecture-reviewer` contra el
   árbol con el 10 y el 7 mergeados, sobre los supuestos de §0.
1. **Primer commit de `backend-dev`**: lo de §4.1 —`Rejection`,
   `RejectedError`, el campo `rejections`, `failure` con `RejectedError`
   primero, `"rejected"` en la unión y `recordAudits`—; los esquemas, tipos y
   textos de §4.2; y las firmas de las dos actions y de las dos funciones del
   service. La suite existente sigue verde.
2. **`frontend-dev` arranca en paralelo** por la casilla generada,
   `selection.ts` y `bulk-changes.ts` con sus tests, y los textos de
   `labels.ts`.
3. **`tests-slice6` arranca en paralelo** con el spec, y confirma que falla por
   la funcionalidad y no por el arnés.
4. Con el primer commit en la rama, `frontend-dev` suma `rejections` a
   `use-action.ts` y sigue con la pantalla. `backend-dev` sigue con
   `entryTimesFor` y `tripleOf`, el repository, las dos funciones y sus tests.

### Responsabilidades que no se leen en el nombre del archivo

- **`selection.ts`** (nuevo) es la selección como funciones puras, sin React:

  ```ts
  export type Selection = readonly string[];
  export function toggleEntry(selection: Selection, id: string): Selection;
  /** Con todas las del día, las suelta; si no, suma las que faltan. */
  export function toggleDay(selection: Selection, dayIds: readonly string[]): Selection;
  export function dayCheckState(
    selection: Selection,
    dayIds: readonly string[],
  ): "none" | "some" | "all";
  /** El recorte de §5.3. Devuelve la misma referencia si no quitó nada. */
  export function keepVisible(
    selection: Selection,
    visibleIds: ReadonlySet<string>,
  ): Selection;
  export function withoutIds(selection: Selection, ids: readonly string[]): Selection;
  ```

- **`bulk-changes.ts`** (nuevo) es el borrador del diálogo y la palabra del
  borrado, puros. El borrador guarda la hora canónica, como `time-draft.ts`:

  ```ts
  export type BulkChangesDraft = {
    readonly description: string;
    readonly date: string | null;
    /** Hora canónica "HH:mm", o "" sin cambios. */
    readonly start: string;
    readonly end: string;
  };
  export const emptyBulkChanges: BulkChangesDraft;
  /** Solo los campos con algo; un texto vacío o de solo espacios no cambia. `null` si no queda ninguno. */
  export function toChanges(draft: BulkChangesDraft): BulkEditChanges | null;
  export const BULK_DELETE_WORD = "BORRAR";
  export function confirmsDelete(text: string): boolean;
  ```

  El slice 12 suma sus campos acá y en el diálogo.

- **`bulk-actions.tsx`** (nuevo) es la región de §5.4 y la barra. Es dueño de
  las dos actions con `useAction`, del estado, del aviso y del foco. Recibe de
  la lista la selección visible con cómo se nombra cada fila, y tres avisos
  hacia arriba: quitar ids de la selección, vaciarla y las semanas de las
  entradas editadas (`onEntryWeeks`). Las dos vistas optimistas son de la
  lista: recibe `showRemoved` y `showBusy`, y las llama dentro de la
  transición, en el `optimistic` de `useAction`.
- **`bulk-edit-dialog.tsx`** y **`bulk-delete-dialog.tsx`** (nuevos) dibujan
  los diálogos de §5.2 con la primitiva `Dialog`. El de edición usa
  `ClockField` y `DateField` como los deja el 7, con `useDisplayFormats`: el
  campo de hora recibe `clockLabel` de la canónica, interpreta con
  `parseClockInput(texto, formats.time)` y devuelve desde `onCommit` el rótulo
  de lo aceptado; vaciado, devuelve "" y el borrador lo guarda como «sin
  cambios». El `placeholder` sale de `clockPlaceholder(formats.time)`. El campo
  de descripción lleva el largo de TT-71. No llaman a ninguna action.
- **`entry-list.tsx`** es dueña de la selección y de `useOptimistic` de las
  filas ocupadas (§5.3): recorta la selección en cada render, se la pasa a cada
  `DayGroup` con los avisos de elegir una fila y un día y con las filas
  ocupadas, dibuja `BulkActions` arriba de las semanas y aplica `reachWeek` a
  las semanas que avisa (§4.9). Las casillas solo existen con `canTrack`.
- **`day-group.tsx`** dibuja la casilla del día con `dayCheckState` sobre sus
  filas visibles, y pasa a cada fila si está elegida. Una fila está ocupada si
  lo está por una mutación del grupo —las de hoy y `updateEntryProject` del
  10— o por la lista. El foco a su encabezado queda condicionado a su propio
  `remove` en vuelo (§5.4).
- **`entry-row.tsx`** dibuja la casilla primera, con el nombre de §5.2, solo
  con `canTrack`.
- **`entry-row.test.tsx`** (nuevo) es un test de componente como
  `projects-screen.test.tsx` del slice 9: `renderToStaticMarkup`, sin
  dependencias nuevas. `EntryRow` no importa `actions.ts`, así que se puede
  dibujar en el entorno de unidad, **envuelta en los proveedores que existan en
  `main` al implementar**: el del catálogo de `useTrackingCatalog` (10) y
  `DisplayFormatsProvider` (7). Afirma la casilla con su nombre con `canTrack`
  en verdadero, y su ausencia en falso.
- **`tracker-feedback.tsx`** acepta `children`, que se dibuja debajo del
  mensaje y arriba de «Reintentar», para la lista de rechazos.
- **`use-action.ts`** conserva `rejections` en el `ActionFailure` cuando el
  resultado lo trae.
- **`labels.ts`** suma:

  | Clave               | Texto                                                          |
  | ------------------- | -------------------------------------------------------------- |
  | `selectEntry`       | función: «Seleccionar «…», {inicio} – {fin}»                   |
  | `selectDay`         | función: «Seleccionar las entradas del día {rótulo}»           |
  | `selectedCount`     | función: «1 entrada seleccionada» / «N entradas seleccionadas» |
  | `bulkRegion`        | «Acciones en masa»                                             |
  | `bulkEdit`          | «Editar»                                                       |
  | `bulkDelete`        | «Borrar»                                                       |
  | `clearSelection`    | «Quitar selección»                                             |
  | `bulkEditTitle`     | función: «Editar 1 entrada» / «Editar N entradas»              |
  | `bulkEditHint`      | «Lo que dejes vacío no cambia.»                                |
  | `noChange`          | «Sin cambios»                                                  |
  | `clockPlaceholder`  | función del formato: «hh:mm» con 24 h, «h:mm AM» con 12 h      |
  | `clearDate`         | «Quitar la fecha»                                              |
  | `bulkDeleteTitle`   | función: «¿Borrar 1 entrada?» / «¿Borrar N entradas?»          |
  | `bulkDeleteWarning` | «No se puede deshacer.»                                        |
  | `bulkDeleteConfirm` | «Escribí BORRAR para confirmar»                                |
  | `deleting`          | «Borrando…»                                                    |
  | `entriesEdited`     | función: «Se editó 1 entrada.» / «Se editaron N entradas.»     |
  | `entriesDeleted`    | función: «Se borró 1 entrada.» / «Se borraron N entradas.»     |
  | `entriesNotEdited`  | «No se pudieron editar las entradas.»                          |
  | `entriesNotDeleted` | «No se pudieron borrar las entradas.»                          |
  | `dropRejected`      | «Quitar esas entradas de la selección»                         |

  El tope de 200 se muestra con `timeEntryMessages.bulkTooMany`, el mismo
  texto que responde el servidor.

## 7. Criterios de aceptación

1. **TT-62, la fila** — Cada fila tiene una casilla con el nombre de §5.2.
   Elegir una muestra la barra con «1 entrada seleccionada»; soltar la última
   la saca.
2. **TT-62, el día** — La casilla de un día elige todas sus filas; con una
   soltada queda mixta; apretada mixta, elige las que faltan; apretada llena,
   suelta todas.
3. **La selección sobrevive y se recorta** — Sobrevive a «Cargar más» y a la
   revalidación de una mutación. Una entrada borrada en otra pestaña sale de la
   selección cuando la lista deja de dibujarla, y no vuelve.
4. **TT-92** — Con la membresía desactivada no hay casillas, y sin casillas no
   hay barra.
5. **El tope** — Con más de 200 elegidas, «Editar» y «Borrar» quedan inactivos
   con el texto del tope. El servidor rechaza 201 ids con `bulkTooMany`, cero
   con `bulkEmpty`, y normaliza los repetidos y las mayúsculas.
6. **TT-63, la descripción** — Cambia en todas las entradas pedidas. Una
   entrada que ya la tenía no se escribe ni deja constancia. La vista que
   vuelve de una entrada con proyecto y tarea los conserva, escrita o no.
7. **TT-63, hora y fecha: la fila repetida** — Para cada entrada y un trío
   combinado distinto del de la fila, el resultado de la edición masiva es
   exactamente el de `updateEntryTimes` sobre esa entrada con ese trío: mismos
   instantes, mismos rechazos. Vale con un cruce de medianoche, con la hora
   repetida y la que no existe en Madrid, y con instantes con segundos que el
   ADR 0006 conserva.
8. **Un campo ausente no cambia** — Cambiar solo el inicio deja el fin de cada
   entrada como estaba, con TT-72 si queda antes. Un `changes` vacío responde
   `bulkNoChanges`; un campo desconocido, `validation` con el texto de
   `unexpected`.
9. **Una fila cuyo trío no cambia no se reescribe** — Una entrada de más de un
   día a la que se le pide la fecha que ya tiene no es un rechazo y no cambia.
10. **Todo o nada** — Con una sola entrada que no admite el cambio, ninguna
    cambia y no queda constancia; la respuesta es `rejected` con todas las
    entradas rechazadas, en el orden pedido, cada una con el código y el texto
    de la tabla de §4.5.
11. **TT-64, el borrado** — Borra todas las entradas pedidas, con una
    constancia por fila y la fila entera. Una que ya no existe no es un
    rechazo; una ajena o la que corre rechazan el pedido y no se borra
    ninguna.
12. **TT-64, la confirmación** — «Borrar» está inactivo hasta que el campo dice
    «BORRAR», sin distinguir mayúsculas ni espacios en los extremos.
13. **P-15** — Una edición masiva que lleva entradas a una semana más vieja que
    la ventana deja `desde` en la URL con esa semana, y las entradas están en
    su día.
14. **Reintentar** — Repetir una edición masiva aplicada no escribe ni deja
    constancia y responde las mismas vistas. Repetir un borrado masivo
    aplicado responde éxito. Desde la pantalla, un borrado cuya respuesta se
    perdió se reintenta con «Reintentar» y termina bien.
15. **Concurrencia con una fila** — Con el borrado de una entrada encolado
    antes de una edición masiva que la incluye, la edición la rechaza con
    `not_found` y no cambia ninguna otra.
16. **Permisos** — Con la membresía desactivada, las dos responden `forbidden`
    sin lista, también con ids que no existen. Una entrada ajena es un rechazo
    con `forbiddenOtherOwner`.
17. **La capa de action** — Las dos traducen el `ZodError` con su mensaje,
    responden `forbidden` cuando falta el permiso, devuelven `rejected` con su
    lista intacta y revalidan `/`, también con error.
18. **El aviso** — Nombra cada entrada rechazada con su descripción, su día y
    sus horas, y la causa; también la que ya no existe. «Quitar esas entradas
    de la selección» las saca, y guardar de nuevo aplica el cambio al resto.
19. **El foco** — Después de una edición o un borrado exitosos, el foco está en
    la región y el estado anuncia el resultado. Cancelar un diálogo vuelve a su
    botón. Ningún control con foco pasa a `disabled`. El borrado masivo no
    lleva el foco a ningún encabezado de día; el de una fila, sí, como antes.
20. **Lo existente sigue verde** — La suite de unidad, integración y e2e que
    hay en `main` al arrancar pasa sin cambiar afirmaciones, también después de
    sacar `entryTimesFor` de `updateEntryTimes` y de condicionar el foco del
    encabezado del día.
21. **Dos masivas cruzadas** — Dos `bulkEditEntries` sobre los mismos ids, en
    orden opuesto y cruzadas en la base, responden `ok` las dos.
22. **Las horas en 12 h** — Con la persona en 12 h, el diálogo acepta «1:15 PM»
    en «Hora de inicio» y la action recibe `13:15`.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                                | Qué afirma                                                                                                                       |
| -------- | -------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1        | e2e                        | `e2e/bulk-actions.spec.ts`                                                             | la casilla por su nombre, la barra con la cantidad, la barra que se va                                                           |
| 2        | unidad + e2e               | `selection.test.ts`; `e2e/bulk-actions.spec.ts`                                        | `toggleDay` y `dayCheckState` con ninguna, algunas y todas; y el estado mixto por su `aria-checked`                              |
| 3        | unidad + e2e               | `selection.test.ts`; `e2e/bulk-actions.spec.ts`                                        | `keepVisible` con y sin cambios, y su referencia; y los recorridos 7 y 8                                                         |
| 4        | unidad                     | `entry-row.test.tsx`                                                                   | la fila con `canTrack` en falso, sin casilla, y en verdadero, con ella                                                           |
| 5        | unidad                     | `schema.test.ts`                                                                       | 0, 200 y 201 ids; repetidos con distinta mayúscula                                                                               |
| 6        | integración                | `service.integration.test.ts`; `audit.integration.test.ts`                             | las descripciones escritas y una constancia por fila escrita, ninguna por la que ya la tenía; `project` y `task` en las vistas |
| 7        | integración                | `service.integration.test.ts`                                                          | por cada caso, la edición masiva contra `updateEntryTimes` sobre una copia sembrada igual                                        |
| 8        | unidad + integración       | `schema.test.ts`; `bulk-changes.test.ts`; `service.integration.test.ts`                | el objeto estricto, con su texto, y el vacío; `toChanges` con vacíos y espacios; el fin conservado y el cruce de TT-72           |
| 9        | integración                | `service.integration.test.ts`                                                          | la entrada de más de un día con su propia fecha, sin escribir                                                                    |
| 10       | integración                | `service.integration.test.ts`; `audit.integration.test.ts`                             | cada causa de §4.5 mezclada con filas válidas: nada escrito, nada registrado, la lista entera y en orden                         |
| 11       | integración                | `service.integration.test.ts`; `audit.integration.test.ts`                             | el borrado con constancias; el id que no existe; la ajena y la abierta sin borrar nada                                           |
| 12       | unidad + e2e               | `bulk-changes.test.ts`; `e2e/bulk-actions.spec.ts`                                     | `confirmsDelete`; y el botón inactivo y activo                                                                                   |
| 13       | e2e                        | `e2e/bulk-actions.spec.ts`                                                             | el recorrido 3                                                                                                                   |
| 14       | integración + e2e          | `service.integration.test.ts`; `audit.integration.test.ts`; `e2e/bulk-actions.spec.ts` | el segundo intento sin escrituras ni constancias; y el recorrido 6                                                               |
| 15       | integración                | `service.integration.test.ts`                                                          | con `queueBehindBarrier`: el borrado primero, la edición después                                                                 |
| 16       | integración                | `permissions.integration.test.ts`                                                      | las dos funciones con membresía `inactive` e ids inexistentes, y con una entrada ajena                                           |
| 17       | integración                | `actions.integration.test.ts`                                                          | la traducción, el permiso, `rejections` en el resultado y la revalidación                                                        |
| 18       | e2e                        | `e2e/bulk-actions.spec.ts`                                                             | los recorridos 4 y 8                                                                                                             |
| 19       | e2e                        | `e2e/bulk-actions.spec.ts`                                                             | el foco en la región en los recorridos 2 y 5, y en el encabezado del día al final del 5                                          |
| 20       | unidad + integración + e2e | las suites existentes                                                                  | en verde con el slice entero, sin cambiar afirmaciones                                                                           |
| 21       | integración                | `service.integration.test.ts`                                                          | con `raceThroughBarrier`: las dos respuestas `ok` y las filas con lo que pidió la que terminó última                             |
| 22       | e2e                        | `e2e/bulk-actions.spec.ts`                                                             | el recorrido 9                                                                                                                   |

**El criterio 7 es el que prueba que la regla no se duplicó.** Siembra dos
copias de cada entrada, edita una con `bulkEditEntries` y la otra con
`updateEntryTimes` y el trío combinado, y compara los instantes, o el código y
el texto del rechazo. El trío combinado tiene que ser distinto del de la fila:
con uno igual, la masiva no evalúa (§4.3) y `updateEntryTimes` sí, y la
comparación mediría esa diferencia, que es a propósito. Un mutante que copie
la regla en vez de llamar a `entryTimesFor` y se desvíe en un caso tiene que
caer acá.

**El criterio 15 se cruza con `queueBehindBarrier`** de `src/test/concurrency.ts`:
el `hold` toma la fila compartida con `for update`; primero se encola el
borrado de esa fila y después la edición masiva. Al soltar, el borrado
commitea y el `for update` de la edición ya no encuentra la fila.

**El criterio 21 se cruza con `raceThroughBarrier`.** Tres filas `a < b < c`;
el `hold` toma `b` con `for update`; una edición pide `[a, b, c]` y la otra
`[c, b, a]`, con descripciones distintas. Con el orden de §4.6 las dos toman
`a` primero: una espera `b` y la otra espera `a`, y al soltar terminan en
fila. El mutante que bloquea con un `for update` por fila en el orden pedido
deja a una con `a` y a la otra con `c`, las dos esperando `b`: al soltar se
esperan en círculo y Postgres corta una con `40P01`, que sale como
`unexpected`.

### Recorridos obligatorios de `e2e/bulk-actions.spec.ts`

Dueño: `tests-slice6`. Precondición: el `setup` atrasa la creación del
workspace (`backdateWorkspace`); cada recorrido usa una persona propia. Las
entradas se crean en modo manual con horas pasadas (`00:00–00:01`), cada una en
el día que pide el recorrido; las respuestas se esperan con
`withServerAction`. Salvo el 9, las personas tienen el formato de 24 h por
omisión.

1. **Elegir** (criterios 1 y 2). Con dos entradas de hoy y una de ayer, elegir
   una de hoy y ver «1 entrada seleccionada»; marcar el día de hoy y ver «2
   entradas seleccionadas»; soltar una y ver el día mixto; soltar la otra y ver
   que la barra se va.
2. **Editar la descripción** (criterios 6 y 19). Elegir tres entradas, editar
   la descripción en bloque y ver las tres con la nueva, la barra fuera, el foco
   en la región y «Se editaron 3 entradas.».
3. **Llevar entradas atrás** (criterio 13). Elegir dos entradas, cambiarles la
   fecha a la de hace cinco semanas y ver la URL con `desde` y las dos en ese
   día.
4. **Un rechazo frena todo** (criterios 10 y 18). Arrancar un timer, moverle el
   inicio a ayer a las 00:00 con el editor del contador y detenerlo: queda una
   entrada de más de un día. Elegirla junto con una de anteayer de 00:10 a
   00:20, cambiar la hora de inicio en bloque a 00:15 —distinta de la de las
   dos, para que ninguna quede con su trío sin cambios (§4.3)— y ver el aviso
   que nombra a la primera con
   «Esta entrada dura más de un día; sus horarios no se pueden editar acá.», y
   las dos entradas sin cambios. «Quitar esas entradas de la selección», guardar
   de nuevo y ver la de anteayer de 00:15 a 00:20.
5. **Borrar** (criterios 12 y 19). Con tres entradas de hoy, elegir dos,
   «Borrar», ver «Borrar» del diálogo inactivo, escribir «borrar» y confirmar
   con Enter; ver las dos fuera de la lista, el foco en la región y «Se
   borraron 2 entradas.». Después, borrar la tercera desde su menú y ver el foco
   en el encabezado de su día: la condición nueva de §5.4 no rompió el borrado
   de una fila, que hoy no tiene e2e de foco.
6. **Borrar con la respuesta perdida** (criterio 14). Perder de verdad la
   respuesta del borrado, con `route.fetch()` y después `route.abort()`.
   Comprobar desde otra pestaña de la misma persona que el primer intento se
   aplicó, como `expectAppliedElsewhere` de `e2e/start-retry.spec.ts`: sin eso,
   un pedido que no llegó haría pasar el recorrido sin probar nada.
   «Reintentar» y ver el éxito, sin aviso de error.
7. **La selección sobrevive a «Cargar más»** (criterio 3). Con una entrada de
   esta semana y otra de hace cinco, elegir la de esta semana, «Cargar más», y
   ver «1 entrada seleccionada» y su casilla marcada.
8. **La fila que se fue** (criterios 3 y 18). Elegir dos entradas; borrar una
   desde otra pestaña; editar la descripción en bloque y ver el aviso que la
   nombra con «Esa entrada ya no existe.», y la otra sin cambios. Ver
   «1 entrada seleccionada» cuando la lista deja de dibujar la borrada; guardar
   de nuevo y ver la otra con la descripción nueva.
9. **Las horas en 12 h** (criterio 22). Con una persona que eligió 12 h en
   `/perfil`, como en los recorridos del 7, y una entrada de anteayer de
   1:00 PM a 2:00 PM: ver el `placeholder` «h:mm AM», escribir «1:15 PM» en
   «Hora de inicio», guardar y ver la entrada de 1:15 PM a 2:00 PM.

## 8. Deuda conocida del slice

- **P-07 sin verificar.** Si la edición masiva del rastreador es paga en
  Clockify, el slice queda como mejora deliberada: TT-62 a TT-64 pasan a
  `adaptar` con esa justificación. La recomendación es arrancar igual: está en
  el plan de la fase 1, la documentación del rastreador la describe, y nada
  del slice condiciona a otros salvo el 12.
- **Sin verificar en Clockify**, además de P-07: si aplica en parte o todo o
  nada, si la selección se vacía después de editar, y si el campo vacío del
  diálogo es «sin cambios». Entran en la lista de P-14.
- **No se puede vaciar la descripción de varias entradas a la vez**: el campo
  vacío es «sin cambios». El servidor sí lo acepta (`description: ""`); si el
  equipo lo quiere, es un control más en el diálogo y no cambia el contrato de
  la action.
- **Una fila que no admite el cambio frena a las demás** (ADR 0011). El aviso
  la nombra y ofrece sacarla, pero las filas rechazadas no se marcan en la
  lista, detrás del diálogo.
- **El tope de 200 es nuestro** y se pasa eligiendo días enteros. Subirlo pide
  la escritura en una sentencia de §4.6.
- **Sin rango con Shift, sin casilla por semana y sin «seleccionar todo».**
- **La selección se pierde al recargar.**
- **El borrado de una fila admite la entrada que corre y el masivo no** (§4.4).
  Los dos casos solo llegan armados a mano.
- **TT-92 se verifica en la fila y no en la pantalla**: no hay e2e con una
  membresía desactivada, como tampoco lo hay hoy para el resto de TT-92.
- **Los supuestos de forma sobre el 10 y el 7** (§0) se confirman en la ronda
  corta previa a implementar; lo que cambie se corrige acá antes de arrancar.
- **Los componentes de `time-entry` siguen importando `actions.ts`**, a
  diferencia de los de `project`, que las reciben por props. No es parte de la
  deuda del mapa y este slice no lo cambia.
