# Fase 1, slice 10: selector de proyecto y tarea en el rastreador

Contrato del décimo slice vertical de la fase 1. Módulos `time-entry` y
`project`, pantalla `/`.

- **Fuente de los comportamientos:** `docs/parity/time-tracker.md` (TT-nn) y
  `docs/parity/proyectos.md` (PR-nn), su §14.1.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md).
- **Correcciones aplicadas:** ronda 1,
  [`correcciones-fase1-slice10.md`](correcciones-fase1-slice10.md).
- **Decisiones de arquitectura asociadas:**
  - [ADR 0004, núcleo de proyectos en la fase 1](../adr/0004-nucleo-de-proyectos-en-fase-1.md): fija el borde.
  - [ADR 0007, el cliente elige el id de la entrada que crea](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): las altas que ganan proyecto siguen su regla.
  - [ADR 0010, un módulo consulta las reglas de otro por su service](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md): **propuesto**, nace acá.
- **Contrato del que hereda:** [slice 9](fase1-slice9-nucleo-de-proyectos.md),
  §2.3 «Lo que el slice 10 necesita y este deja listo».

El contrato da por tomadas estas decisiones del equipo:

- Todo proyecto se crea público (P-17), así que en la fase 1 el filtro de
  TT-08 no esconde nada salvo lo que se siembre privado.
- Los asignados de tarea se modelan pero su regla es de la fase 2 (P-23): toda
  tarea se comporta como «cualquiera».
- Quien queda fuera de un proyecto privado sigue viendo sus entradas con el
  nombre y el color del proyecto (P-27, PR-71).
- Crear un proyecto desde el selector queda fuera de la fase 1 (TT-09).
- **El 10 se implementa antes que el 6 y el 7**, y trae la migración de
  `time-entry` a las piezas compartidas (orden decidido en la ronda 1).

## 0. Precondición de arranque

- **El slice 9 está en `main`** (`d628c01`). Este contrato está escrito contra
  `58e85bf`.
- **Postgres 15 o posterior** en todos los entornos, por la misma cláusula
  `on delete set null (columna)` que ya pide el 9. Sigue pendiente verificarlo
  en Neon (`estado-fase1.md`).
- **El 10 va primero; el 6 y el 7 se adaptan a él.** Los tres tienen contrato y
  comparten archivos y firmas de `time-entry`. Lo que el 10 cambia y los otros
  dos tienen que tomar como punto de partida:
  - **La migración de §4.1**: `useAction`, `useNewId`, `handle` y `failure` de
    las piezas compartidas, y `TimeEntryError` como `DomainError`. El 6 suma
    sus actions y sus hooks directamente sobre ellas.
  - **`timeEntryView`** gana `project` y `task` (§4.2), y **`toView`** recibe
    la fila con sus referencias, `EntryWithRefs` (§5.2). Toda vista nueva del 6
    o del 7 los trae.
  - **`time-entry/service.ts`**: las altas validan el par y las lecturas de una
    entrada traen sus referencias, con la regla de §5.2.
  - **`entry-row.tsx`** dibuja el selector en el lugar de «Sin proyecto», y
    **`manual-bar.tsx`** también.
  - **Las migraciones**: las del 10 son la `0005` y la `0006`. La del 7 se
    genera después, sobre ellas.

  El slice que entra segundo en cada archivo es el que se adapta; con el orden
  decidido, son el 6 y el 7.

- **Antes de implementar, una ronda corta del `architecture-reviewer` contra el
  árbol** (lección del slice 9 en `estado-fase1.md`), si entre este contrato y
  el arranque entró algo más a `main`.

## 1. Alcance

Entran:

- **TT-06, TT-07, TT-08, TT-10, TT-11**: el selector de proyecto y tarea, en la
  barra (modo timer y modo manual) y en cada fila.
- **TT-70, TT-77**: la tarea sin proyecto y el proyecto no disponible, en todas
  las escrituras que reciben un proyecto.
- **TT-87**: el selector de un workspace sin proyectos.
- **TT-104**: la entrada conserva y muestra un proyecto archivado.
- **TT-49 y TT-50, completos**: el punto de color, el proyecto y la tarea en la
  fila; «Sin proyecto» en gris y sin punto.
- **De `proyectos.md`, los 24 del slice 10** (§14.1): PR-10, PR-23,
  PR-63 … PR-67, PR-70, PR-71, PR-74, PR-82, PR-87, PR-94, PR-96,
  PR-98 … PR-103, PR-105 … PR-107, PR-110.
- **La migración de `time-entry` a las piezas compartidas** que extrajo el 9
  (§4.1). Es deuda del mapa (§5) y este es «el próximo slice que toca las
  actions de `time-entry`».

Entran por arrastre, verificándose por el camino nuevo:

- **TT-27**: el proyecto y la tarea se cambian con el timer corriendo y se
  guardan sobre la entrada abierta.
- **TT-54**: el proyecto y la tarea se editan desde la fila.
- **TT-57 y TT-58**: continuar y duplicar copian proyecto y tarea.
- **TT-38 y TT-39**: recargar o abrir en otro dispositivo muestra el proyecto
  del timer.
- **TT-92**: con la membresía desactivada, el proyecto se muestra y no se
  cambia.
- **TT-93**: la entrada sin proyecto sigue siendo válida en todo el recorrido.

### Lo que el slice decide y que la paridad tiene que registrar

Lo registra `parity-analyst` antes del merge (§6):

- **TT-07: las tareas se listan siempre debajo de su proyecto**, sin un control
  para expandirlas. `adaptar`. Clockify expande un proyecto para mostrar sus
  tareas; un elemento que se expande dentro de un `listbox` no tiene rol
  accesible, y la alternativa —una grilla con una celda de expansión por fila—
  cuesta un patrón de teclado propio para workspaces que, en el plan Free, son
  chicos (PR-110).
- **TT-07: la búsqueda no distingue mayúsculas ni acentos**, y «Sin proyecto»
  solo aparece con la búsqueda vacía. Diseño propio: la documentación no lo
  dice.
- **TT-57 y TT-58: continuar o duplicar una entrada cuyo proyecto o tarea ya no
  está disponible se rechaza** con TT-77 o PR-74 y no crea nada. Diseño propio,
  _no verificado_ (P-14): la alternativa, copiar sin el proyecto, cambia la
  entrada en silencio.
- **TT-87: el texto y el enlace.** «No hay proyectos todavía» y, si
  `project.create` lo permite, el enlace «Ir a Proyectos».
- **PR-110: la búsqueda es en el cliente, sobre el catálogo entero.** `adaptar`,
  con el umbral de §8.
- **§11 de `time-tracker.md`**: la sección del slice 10, y TT-27 y TT-54 dejan
  de ser parciales en lo que toca a proyecto y tarea.

### Queda afuera

- **TT-09**: crear un proyecto desde el selector.
- **Etiquetas y facturable** (TT-12 … TT-15): slice 11. El facturable por
  defecto del proyecto no se lee todavía.
- **Proyecto y tarea en la edición masiva** (resto de TT-63): slice 12.
- **El color en el calendario**: el slice 8 lo toma de la vista de §5.2 cuando
  llegue.
- **Archivar, borrar, hacer privado o quitar a alguien de un proyecto**: fase 2.
  Este slice construye lo que tiene que pasarle a una entrada y lo prueba
  sembrando el estado (`proyectos.md`, §14).
- **La regla de los asignados de tarea** (PR-37): fase 2.
- **«Reintentar» en el alta manual** (TT-109): sigue pendiente del equipo.

### Consecuencias sobre código ya entregado

| Archivo                                              | Qué cambia                                                                                                                   | Qué hay que volver a probar                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/server/db/schema.ts`                            | `time_entry.project_id`, `task_id`, dos claves, un `check` y un índice parcial (§2).                                         | La creación de entradas de todos los slices        |
| `src/server/db/constraint-error.ts`                  | Suma `FOREIGN_KEY_VIOLATION`.                                                                                                | —                                                  |
| `time-entry/schema.ts`                               | Los inputs de alta ganan el par; `updateEntryProjectInput`; la vista gana `project` y `task`; los tipos de resultado (§4.1). | `schema.test.ts` entero                            |
| `time-entry/repository.ts`                           | Las lecturas devuelven `EntryWithRefs`; las altas reciben el par; `updateProject` (§5.2).                                    | Todo test de integración del módulo                |
| `time-entry/service.ts`                              | `TimeEntryError` extiende `DomainError`; las altas validan el par; `updateEntryProject`; las vistas con proyecto (§4).       | `service.integration.test.ts` entero               |
| `time-entry/actions.ts`                              | `handle` y `failure` compartidos (§4.1); `updateEntryProject`.                                                               | `actions.integration.test.ts` entero               |
| `time-entry` `permissions` y `audit` tests           | Las llamadas al service con el par.                                                                                          | Los dos archivos enteros                           |
| `tracker-bar.tsx`, `day-group.tsx`, `entry-list.tsx` | `useAction` y `useNewId` en vez de las copias; el selector y su mutación.                                                    | TT-22 … TT-30, TT-55 … TT-58, TT-65, TT-89, TT-109 |
| `timer-bar.tsx`, `manual-bar.tsx`, `entry-row.tsx`   | El selector en el lugar de «Sin proyecto».                                                                                   | TT-25, TT-28, TT-49, TT-92, TT-110                 |
| `tracker-screen.tsx`                                 | Lee el catálogo del selector y lo provee.                                                                                    | TT-85, TT-92                                       |
| `project/service.ts`, `project/schema.ts`            | `getTrackingCatalog`, `assertTrackable`, `taskUnavailable`, `ProjectRef`.                                                    | `service.integration.test.ts` del módulo           |
| `project/repository.ts`                              | `findProject` recibe el ejecutor; `findTask(tx, …)` nuevo por workspace, proyecto e id (§4.3).                               | `createTask` del slice 9                           |
| `src/test/factories.ts`                              | `seedTimeEntry` acepta `projectId` y `taskId`.                                                                               | —                                                  |
| `CLAUDE.md`                                          | Una línea del ADR 0010 en «Recorrido de una mutación», si se acepta.                                                         | —                                                  |

Se borran `time-entry/components/use-entry-action.ts` y `use-new-entry-id.ts`.
`src/server/permissions/` no cambia (§3).

## 2. Cambios de esquema

Dos migraciones, en este orden y con estas etiquetas:

1. **`time_entry_project`, la generada**, con
   `npm run db:generate -- --name=time_entry_project`.
2. **`time_entry_project_set_null`, escrita a mano**, con
   `npm run db:generate -- --custom --name=time_entry_project_set_null`, para
   las dos claves con `set null (columna)` que drizzle-kit no genera. Es el
   mismo procedimiento que la `0004` del 9.

Sobre `main` son la `0005` y la `0006`. El diario `drizzle/meta/_journal.json`
no se edita a mano.

### 2.1 Las columnas y las restricciones

En `time_entry`:

- **`project_id uuid null`** y **`task_id uuid null`**. Nulo es «sin proyecto»
  y «sin tarea» (TT-50, TT-93, PR-96). Sin valor por omisión.

Las restricciones son las que fija el §2.3 del 9, con nombre explícito:

| Nombre                                  | Qué                                                                           | Al borrar el destino    |
| --------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| `time_entry_project_fk`                 | `(workspace_id, project_id)` → `project (workspace_id, id)`                   | `set null (project_id)` |
| `time_entry_task_fk`                    | `(workspace_id, project_id, task_id)` → `task (workspace_id, project_id, id)` | `set null (task_id)`    |
| `time_entry_task_needs_project`         | `check (task_id is null or project_id is not null)`                           | —                       |
| `time_entry_workspace_project_task_idx` | índice `(workspace_id, project_id, task_id) where project_id is not null`     | —                       |

- **La clave de tres columnas apunta a `task_workspace_project_id_unq`**, que
  dejó el 9. Por construcción, la tarea de una entrada es de su proyecto
  (PR-105), y ninguna referencia cruza workspaces.
- **Las claves son `MATCH SIMPLE`**, el valor por omisión: con `project_id`
  nulo no se comprueba la primera, y con `task_id` nulo no se comprueba la
  segunda. Una entrada con proyecto y sin tarea es válida.
- **`schema.ts` las declara con `onDelete("set null")`** y un comentario que
  remite a la migración escrita a mano, como en el 9. La escrita a mano las
  reemplaza con el mismo nombre por la forma con lista. Un `set null` sin lista
  intentaría anular `workspace_id`.
- **`time_entry` se declara después de `task`** en `schema.ts` si las
  referencias de las claves lo piden.
- **El índice existe por los dos `set null`**: borrar un proyecto o una tarea
  recorre `time_entry`, que es la tabla más grande del modelo, buscando las
  entradas que los referencian. **Es parcial, `where project_id is not null`**:
  esas búsquedas nunca piden una entrada sin proyecto, y la mayoría de las
  altas de hoy no llevan proyecto, así que no pagan la entrada de índice. El
  slice 13 decide su propio índice si la grilla lo necesita.

### 2.2 Lo que hereda del slice 9

Con las claves en su lugar y una entrada con proyecto y tarea (§2.3 del 9):

- **Borrar el proyecto directamente falla y nada cambia.** La cascada a `task`
  dispara después que el `set null (project_id)`, y el `check` corta.
- **Borrar las tareas y después el proyecto, en una transacción, deja la
  entrada sin proyecto, sin tarea y con su duración** (PR-64, PR-67). Es la
  forma del borrado de la fase 2.
- **Borrar una tarea deja la entrada con su proyecto y sus horas** (PR-66).
- **Borrar el workspace funciona.**
- **Borrar un cliente no toca la entrada** (PR-10, PR-70): su proyecto queda
  sin cliente y la entrada lo conserva.

Las cinco se prueban con sentencias directas (criterio 2).

### 2.3 Sin tiempo de caída

- Agregar dos columnas nulables sin valor por omisión no reescribe la tabla.
- **Agregar cada clave toma `SHARE ROW EXCLUSIVE` sobre `time_entry` y también
  sobre la tabla a la que apunta**: `project` para la primera, `task` para la
  segunda. Mientras dura, se bloquean las escrituras sobre las tres tablas, no
  solo sobre `time_entry`. Las claves y el `check` se validan recorriendo
  `time_entry`, con todas las filas en nulo.
- **El índice se construye sin `concurrently`** y bloquea las escrituras sobre
  `time_entry` mientras dura.
- Con el tamaño de hoy, todo son segundos. Si el despliegue llega con la tabla
  grande, las claves van con `not valid` y `validate constraint` en una segunda
  sentencia, y el índice con `concurrently` en una migración propia.
- Ninguna fila existente cambia: todas quedan sin proyecto, que es lo que eran.

### 2.4 Reversión

Si hay que volver atrás, **se pierde el proyecto y la tarea de todas las
entradas**; las entradas y sus horas quedan. El orden importa:

1. **Primero el código**: se despliega la versión anterior al slice, que no
   lee ni escribe `project_id` ni `task_id`. Con el esquema revertido antes, el
   código del slice fallaría en cada lectura y cada alta.
2. El índice, el `check` y las dos claves.
3. Las columnas `task_id` y `project_id`.
4. Las filas de las dos migraciones en `drizzle.__drizzle_migrations`, las que
   tienen como `created_at` el `when` de sus entradas en el diario.

Los pasos 2 a 4 son el paso 1 de la reversión del slice 9 (§2.6 de su
contrato).

## 3. Permisos

**No hay acciones nuevas.** Asignar un proyecto a una entrada son dos
decisiones que `can()` ya sabe tomar:

- **Sobre la entrada**: `timeEntry.own.create` para las altas y
  `timeEntry.own.update` para cambiar el par de una entrada existente. Una
  entrada ajena nunca (TT-01, TT-79).
- **Sobre el proyecto**: `project.track`, que el 9 dejó sin consumidor (§3.1 de
  su contrato). Público, o quien actúa es miembro; el rol no alcanza (TT-08,
  PR-17).

### Quién puede asignar qué

| Lo que se asigna                       | Quién                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Un proyecto público activo             | Cualquier membresía activa                                                             |
| Un proyecto privado activo             | Sus miembros, con cualquier rol. **Un owner o un admin que no es miembro, no** (PR-17) |
| Un proyecto archivado                  | Nadie, como asignación nueva (PR-23). La entrada que ya lo tiene lo conserva (TT-104)  |
| Una tarea                              | Quien puede asignar su proyecto, si la tarea está activa y es de ese proyecto (PR-74)  |
| «Sin proyecto», o quitar solo la tarea | Quien puede editar la entrada, sea cual sea el proyecto que tenía                      |

- **El archivado y el estado de la tarea no son decisiones de acceso**, como no
  lo son en `createTask` del 9: son el estado de la fila. Los resuelve
  `assertTrackable` (§4.3), la misma función que llama a `can()`.
- **Una membresía no activa no llega a la regla del proyecto**: el permiso
  sobre la entrada corta antes con `forbidden` (§4.4), que no revela nada sobre
  el proyecto.
- **Un proyecto que la persona no puede usar responde lo mismo que uno que no
  existe**: TT-77, «Ese proyecto ya no está disponible.», también para el admin
  que lo ve en `/proyectos`. Cualquier otra respuesta revelaría el proyecto
  privado.

### Por qué no `task.track`

La regla de los asignados (PR-37) es de acceso y, cuando llegue, entra en
`can()` con una acción `task.track` y un recurso de tarea. **No se crea ahora**:
sin los asignados, decidiría exactamente lo mismo que `project.track`, y una
acción que viaja sin efecto propio invita a creer que lo tiene (el mismo
argumento del ADR 0009 contra un campo sin efecto). La fase 2 la suma en
`ResourceByAction` y la llama desde `assertTrackable`, que es el único lugar
que valida una tarea; `time-entry` no cambia.

## 4. Contrato de las server actions

### 4.1 La migración a las piezas compartidas

**Decisión: `time-entry` migra en este slice**, en dos commits propios y antes
de cualquier cambio de conducta (handshake, §6).

- **Por qué ahora.** Este slice toca las actions del módulo, que es la
  condición que el mapa puso, y va antes que el 6 y el 7. Y la necesita: con el
  ADR 0010, `time-entry` recibe el `ProjectError` de `assertTrackable`. El
  `failure` local solo reconoce `TimeEntryError`, así que un proyecto archivado
  saldría como `unexpected`, con «Reintentar». El de `src/server/action.ts`
  reconoce cualquier `DomainError`.
- **El costo.** Mecánico y sin cambio de conducta: los textos de los dos lados
  son los mismos y los hooks son copias casi literales.
  - Servidor: `actions.ts` usa `handle(work, { paths: ["/"], messages })` con
    `{ forbidden, unexpected }` de `timeEntryMessages`; `TimeEntryError`
    extiende `DomainError<TimeEntryErrorCode>`; `TimeEntryErrorCode` pasa a ser
    `ActionErrorCode | "already_stopped" | "timer_running"`; sale el
    `ActionResult` local y se usa `ActionResult<T, TimeEntryErrorCode>` de
    `src/server/action.ts`; el `refine` del carácter nulo usa
    `noNullCharacter`.
  - Cliente: `tracker-bar.tsx`, `day-group.tsx` y `entry-list.tsx` pasan a
    `useAction` con `unreachableMessage: timeEntryMessages.unexpected`, y a
    `retryHandlerOf`, `ActionHandle` y `useNewId` de `src/hooks/`. Se borran
    las dos copias.
  - Unos diez archivos, ningún test nuevo: los suites existentes son la prueba
    (criterio 14).
- **Lo que costaría dejarlo.** Escribir el selector, una action nueva y tres
  mutaciones más sobre las copias, que agranda lo que hay que migrar después;
  una traducción propia del error de otro módulo dentro de `time-entry`, que
  es otra copia; y que el 6 sume sus actions también sobre las copias.

### 4.2 Los tipos

```ts
// src/modules/project/schema.ts
/** Lo que una entrada muestra de su proyecto. */
export type ProjectRef = {
  readonly id: string;
  readonly name: string;
  readonly color: PaletteKey;
};
export type TaskRef = { readonly id: string; readonly name: string };

/** Lo que elige el selector. `task` no nulo implica `project` no nulo (TT-11). */
export type ProjectSelection = {
  readonly project: ProjectRef | null;
  readonly task: TaskRef | null;
};
```

```ts
// src/modules/time-entry/schema.ts
type ProjectPair = { readonly projectId: string | null; readonly taskId: string | null };

/** TT-11 y TT-70: la tarea no viaja sola. */
function hasProjectForTask(pair: ProjectPair): boolean {
  return pair.taskId === null || pair.projectId !== null;
}
const taskNeedsProject = {
  message: timeEntryMessages.taskNeedsProject,
  path: ["taskId"],
};

/** En las altas el par es opcional: una barra sin proyecto manda lo mismo que hoy. */
const newEntryPair = {
  projectId: z.uuid().nullable().default(null),
  taskId: z.uuid().nullable().default(null),
};

export const startTimerInput = z
  .object({ id: newEntryId, description: description.default(""), ...newEntryPair })
  .refine(hasProjectForTask, taskNeedsProject);

export const createManualEntryInput = z
  .object({
    description: description.default(""),
    date: dayKeyInput,
    start: clockInput,
    end: clockInput,
    ...newEntryPair,
  })
  .refine(hasProjectForTask, taskNeedsProject);

/** El par entero y obligatorio: la action fija los dos valores, no «el que cambió». */
export const updateEntryProjectInput = z
  .object({
    id: z.uuid(),
    projectId: z.uuid().nullable(),
    taskId: z.uuid().nullable(),
  })
  .refine(hasProjectForTask, taskNeedsProject);

export type UpdateEntryProjectInput = z.infer<typeof updateEntryProjectInput>;
export type UpdateEntryProjectResult = { readonly entry: TimeEntryView };
```

- **`timeEntryView` suma**
  `project: z.object({ id, name, color: z.enum(PALETTE_KEYS) }).nullable()` y
  `task: z.object({ id, name }).nullable()`, con la forma de `ProjectRef` y
  `TaskRef`.
- **Los ids se comparan sin distinguir mayúsculas**, como `isNewId`: la base
  los iguala.

### 4.3 La regla del par

Dos piezas, una por módulo.

**`assertTrackable`, en `src/modules/project/service.ts`** (ADR 0010):

```ts
/**
 * PR-23, PR-74, TT-08, TT-77. Lanza `ProjectError("not_found", …)` si la
 * persona no puede cargar horas en ese proyecto o esa tarea. Solo lee, con la
 * transacción de quien la llama.
 */
export async function assertTrackable(
  tx: Transaction,
  actor: Actor,
  target: { readonly projectId: string; readonly taskId: string | null },
): Promise<void>;
```

1. Lee el proyecto **en el workspace de quien actúa**, con su fila de
   `project_member`, con `findProject(tx, …)`. `findProject` pasa a recibir el
   ejecutor como primer argumento, como `listClients`; `createTask` del 9 le
   pasa `db`.
2. Sin fila, archivado, o con `can(actor, "project.track", recurso)` en falso:
   `not_found` con `projectUnavailable` (TT-77).
3. Si `taskId` no es nulo, lee la tarea con `findTask(tx, workspaceId,
projectId, taskId)`, nuevo en `project/repository.ts`, que filtra por los
   tres. Sin fila, o con `status = 'done'`: `not_found` con `taskUnavailable`
   (PR-74). Una tarea de otro proyecto no se encuentra, así que responde lo
   mismo.

Lo que fija el ADR 0010 para la función:

- **Solo lee con el `tx` que recibe**: no abre otra transacción, no usa `db` y
  no escribe.
- **Lanza solo `not_found`**, un código de `ActionErrorCode`.
- **Qué da el `tx` y qué no.** Si `assertTrackable` rechaza, se deshace todo lo
  que la operación hizo antes, también el cierre del timer de `startTimer` y
  `continueEntry`; la validación y la escritura van por la misma conexión; y la
  escritura la protege la clave foránea. **No da coherencia de snapshot**: con
  `read committed`, lo leído puede cambiar antes de escribir.

**Sin bloqueo, por decisión de este contrato**, que es quien llama. Una
asignación que se cruza con un archivado de otra persona termina igual que si
el archivado hubiera llegado justo después: la entrada conserva el proyecto
(TT-104). Bloquear la fila no cambia ningún desenlace observable. Lo que sí
importaría —que el proyecto o la tarea se borren en el medio— lo resuelve la
clave foránea (§4.5).

**`pairToCheck`, en `src/modules/time-entry/assignment.ts`** (nuevo, puro):

```ts
/** El par que hay que validar, o `null` si el pedido no asigna nada nuevo. */
export function pairToCheck(
  current: ProjectPair,
  requested: ProjectPair,
): { readonly projectId: string; readonly taskId: string | null } | null;
```

| Pedido                                          | Se valida | Por qué                                                            |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `projectId` nulo                                | no        | «Sin proyecto» siempre se puede (TT-10)                            |
| El mismo proyecto y la misma tarea que ya tiene | no        | La entrada conserva lo que tiene (TT-104, PR-65, PR-71)            |
| El mismo proyecto, sin tarea                    | no        | Quitar la tarea no carga horas en ningún lado                      |
| Cualquier otro                                  | sí        | Es una asignación nueva (PR-23, PR-71: «no puede imputar más ahí») |

Para un alta, `current` es `{ projectId: null, taskId: null }`: todo par con
proyecto se valida.

### 4.4 Cada mutación

**El orden es siempre el mismo**: el permiso sobre la entrada, después las
validaciones que ya tenía la operación, después el par, después la escritura,
todo en la misma transacción.

| Action               | Qué hace con el par                                                                              | `current`        |
| -------------------- | ------------------------------------------------------------------------------------------------ | ---------------- |
| `startTimer`         | Lo valida dentro del `attempt`, **antes de cerrar el timer abierto**, y lo escribe en la nueva   | vacío            |
| `createManualEntry`  | Lo valida después de las validaciones de horas y antes del `insert`                              | vacío            |
| `continueEntry`      | Copia el par de la original (`continuedFields`) y lo valida **antes de cerrar el timer abierto** | vacío            |
| `duplicateEntry`     | Copia el par de la original y lo valida antes del `insert`                                       | vacío            |
| `updateEntryProject` | Nueva (abajo)                                                                                    | el de la entrada |
| las demás            | No lo tocan ni lo validan                                                                        | —                |

- **Las demás**: `stopTimer`, `updateDescription`, `updateEntryTimes`,
  `updateRunningStart`, `deleteEntry` y `discardTimer`. Una entrada con un
  proyecto archivado, privado sin acceso o con una tarea hecha se detiene, se
  edita y se borra como cualquier otra (TT-104, PR-63, PR-65, PR-71, PR-106).
- **El reintento de una alta no valida.** Si `createOnce` encuentra la fila
  propia, la responde tal como está sin llamar al `attempt` (ADR 0007): no
  escribe nada. Si el pedido no había llegado, el reintento es la primera alta
  y valida.
- **El par del pedido repetido con el id pendiente** no se aplica si cambió
  entre los dos clics: el servidor responde la fila del primer intento. Es la
  consecuencia que el ADR 0007 acepta para la descripción.
- **`continuedFields`** pasa a devolver `{ description, projectId, taskId }`.
  Sigue siendo la única función que decide qué se copia; el 11 le suma
  etiquetas y facturable.
- **Continuar o duplicar con un proyecto o una tarea no disponible responde
  TT-77 o PR-74 y no escribe nada**: ni la entrada nueva ni el cierre del timer
  que corría (§1, decisión registrada).

**`updateEntryProject`**: TT-10, TT-11, TT-27, TT-54.

1. **La action exige el permiso antes de tocar nada**, como las demás de
   `time-entry`: `assertCan(actor, "timeEntry.own.update",
ownTimeEntryResource(actor))`. Una membresía no activa recibe el mensaje
   neutro de TT-79 sin que se busque la fila, también con un id que no existe.
2. El service lee la entrada con bloqueo y la autoriza con
   `timeEntry.own.update` sobre su dueño real, como `updateDescription`:
   `not_found` con TT-80 si no existe, `forbidden` con el texto de TT-79 que
   nombra la entrada si es ajena.
3. **Si el par pedido es el que ya tiene, responde la vista sin escribir y sin
   registro de auditoría.**
4. Si `pairToCheck(entrada, pedido)` da un par, `assertTrackable(tx, actor,
par)`. Si da `null` —«Sin proyecto», o quitar solo la tarea—, no valida.
5. Escribe `project_id` y `task_id` sobre la entrada leída, corra o no.
6. Escribe `recordAudit` con `timeEntry.updateProject`, `previousValue` y
   `nextValue` con `{ projectId, taskId }`.
7. Responde `{ entry }` con la vista de §5.2.

Funciona igual sobre la entrada que corre (TT-27) que sobre una cerrada, y
también sobre una con horarios de solo lectura (TT-110).

### 4.5 Los mensajes y los errores

| Clave                      | Dónde               | Texto                                    | Origen       |
| -------------------------- | ------------------- | ---------------------------------------- | ------------ |
| `taskNeedsProject` (nuevo) | `timeEntryMessages` | «Elegí un proyecto antes que una tarea.» | TT-70, PR-82 |
| `projectUnavailable`       | `projectMessages`   | «Ese proyecto ya no está disponible.»    | TT-77, PR-72 |
| `taskUnavailable` (nuevo)  | `projectMessages`   | «Esa tarea ya no está disponible.»       | PR-74        |

- **TT-77 y PR-74 salen con `not_found`** desde `assertTrackable`, como
  `ProjectError`. `failure` de `src/server/action.ts` los deja pasar con su
  código y su mensaje.
- **La red de la clave foránea.** Si el proyecto o la tarea se borran entre
  `assertTrackable` y la escritura —en la fase 1 nada borra—, el `insert` o el
  `update` fallan con `23503`. El service de `time-entry` traduce
  `time_entry_project_fk` a TT-77 y `time_entry_task_fk` a PR-74, con
  `not_found`. Los nombres viven en el repository, con predicados como
  `isRunningConflict`: `isMissingProject(error)` e `isMissingTask(error)`.
- **La red del `check`.** `time_entry_task_needs_project` no se alcanza: Zod
  rechaza antes. Si salta, sale como `validation` con `taskNeedsProject`.
- **`createOnce` deja pasar todo lo que no es `23505`** (paso 3 del algoritmo
  del ADR 0007), así que el `ProjectError` y el `23503` del `attempt` llegan
  intactos a la traducción.

### 4.6 Revalidación, reintento y auditoría

- **`updateEntryProject` revalida `/`**, también con error. `/proyectos` no
  muestra entradas.
- **Ofrece «Reintentar» con `unexpected`** (TT-89): fija dos valores sobre una
  fila identificada, así que repetirla es inofensivo (TT-109).
- **Las altas suman `projectId` y `taskId` a su `nextValue`**:
  `timeEntry.start`, `timeEntry.continue`, `timeEntry.duplicate` y
  `timeEntry.createManual`.

## 5. Contrato de lectura

### 5.1 El catálogo del selector

```ts
// src/modules/project/service.ts
export async function getTrackingCatalog(actor: Actor): Promise<TrackingCatalog>;

// src/modules/project/schema.ts
export type TrackingCatalog = {
  /** TT-87: el enlace a `/proyectos` del selector vacío. */
  readonly canCreateProject: boolean;
  /** Proyectos activos en los que quien pide puede cargar horas (TT-08), por cliente. */
  readonly groups: readonly TrackingGroupView[];
};

export type TrackingGroupView = {
  /** `null` es «Sin cliente», que va al final (PR-14, PR-97). */
  readonly client: ClientView | null;
  readonly projects: readonly TrackingProjectView[];
};

export type TrackingProjectView = ProjectRef & {
  /** Tareas activas, en orden alfabético (PR-99). Vacío: se elige el proyecto solo (PR-87). */
  readonly tasks: readonly TaskRef[];
};
```

- **El catálogo reusa las tres consultas de `getProjectCatalog`** —clientes,
  proyectos activos con la fila de miembro, tareas activas de proyectos
  activos— en un snapshot `repeatable read`. El catálogo no suma consultas; las
  dos lecturas nuevas del repository son las de `assertTrackable` (§4.3).
- **El armado se comparte**: una función privada del service recibe la acción
  con la que filtra. `getProjectCatalog` filtra con `project.view`;
  `getTrackingCatalog`, con `project.track`. Es la misma regla de PR-61 vista
  desde el selector, y no existe una versión en SQL.
- **Lo que cambia contra `/proyectos`**: un admin no ve en el selector un
  privado del que no es miembro (PR-17), aunque lo vea en `/proyectos`.
- **Un proyecto activo de un cliente archivado** sigue en el grupo de su
  cliente y se puede elegir (PR-98).
- **Las tareas de un proyecto archivado no aparecen**, porque el proyecto no
  aparece (PR-100).
- **El orden** es el del 9: alfabético sin distinguir mayúsculas, «Sin cliente»
  al final.
- **Trae el catálogo entero.** La búsqueda es en el cliente (PR-110, §8).
- **Lo pide `tracker-screen.tsx`**, junto con `getTrackerState`, y no forma
  parte de `TrackerState`. Los dos no necesitan el mismo snapshot: un proyecto
  creado entre las dos lecturas aparece en una sola, y la próxima revalidación
  lo pone en las dos.

### 5.2 Las entradas con su proyecto

**La regla: toda lectura del módulo que termine en una `TimeEntryView` trae el
proyecto y la tarea de la entrada**, también las que sumen slices posteriores
—la selección del 6, el calendario del 8—. No es una lista cerrada de
funciones.

- **Cómo**: un `left join` desde el repository de `time-entry` (ADR 0010):
  `project` por `(workspace_id, project_id)` y `task` por
  `(workspace_id, project_id, task_id)`. Solo las columnas de `ProjectRef` y
  `TaskRef`. Las lecturas devuelven
  `EntryWithRefs = TimeEntryRow & { project: … | null; task: … | null }`, y
  `toView` recibe `EntryWithRefs`, así una lectura sin el join no compila.
  - Hoy lo cumplen `findRunning`, `listClosedBetween`, `findByIdForUpdate`,
    `findById` y `findOwnById`.
  - **Una lectura que bloquea, bloquea solo la entrada**: `for update of
time_entry`. Postgres rechaza `for update` sobre el lado nulable de un
    `left join`.
  - Una lectura que no termina en vista no necesita el join:
    `findLatestClosed` y `findLatestClosedBefore` solo se usan por su inicio y
    su id.
- **Sin ningún filtro.** La entrada muestra su proyecto archivado (TT-104,
  PR-63), privado sin acceso (PR-71) y su tarea hecha (PR-65). El nombre y el
  color son los de ahora, no los de cuando se asignó (PR-102, PR-103). Cambiar
  el cliente de un proyecto no cambia nada de la vista (PR-101), que no lleva
  cliente.
- **Las escrituras devuelven la vista con sus referencias**, leída en la misma
  transacción después de escribir: `insert … returning` no puede hacer el join.
  Es una lectura más por mutación. Si `backend-dev` lo resuelve con una CTE
  `update … returning` y el join en la misma sentencia, mejor; lo que no puede
  pasar es que la vista salga de otra transacción.
- **El color se estrecha con `isPaletteKey`**, como en el service de `project`:
  el `check` de la base no deja guardar otra cosa, y si pasa, se lanza.
- **El reintento de `createOnce` responde la vista con sus referencias**:
  `findOwnById` devuelve `EntryWithRefs`, y `replayed` arma la vista con ella.

## 6. Reparto de archivos

Rutas absolutas. **(nuevo)** marca lo que crea el slice.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/src/server/db/constraint-error.ts
/home/maxi/program/clock/drizzle/                                              (0005 y 0006, nuevas, §2)
/home/maxi/program/clock/src/modules/project/schema.ts
/home/maxi/program/clock/src/modules/project/repository.ts
/home/maxi/program/clock/src/modules/project/service.ts
/home/maxi/program/clock/src/modules/project/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/assignment.ts                  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/assignment.test.ts             (nuevo)
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/schema.integration.test.ts     (nuevo)
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/test/factories.ts
/home/maxi/program/clock/CLAUDE.md
```

- **`schema.integration.test.ts`** (nuevo) prueba la base sin pasar por el
  service: las dos claves, el `check`, los borrados de §2.2 y los predicados
  `isMissingProject` e `isMissingTask` contra un `23503` real, producido con un
  `insert` directo.
- **`project/repository.ts`**: `findProject(tx, workspaceId, userId, id)` con
  el ejecutor primero, y `findTask(tx, workspaceId, projectId, id)` nuevo.
- **`constraint-error.ts`** suma solo la constante
  `FOREIGN_KEY_VIOLATION = "23503"`. Es del slice 2b y no cambia nada más.
- **`CLAUDE.md`**: la línea del ADR 0010, solo si el equipo lo acepta, en el
  mismo commit que crea `assertTrackable`.

### frontend-dev

```
/home/maxi/program/clock/src/components/ui/combobox.tsx                              (nuevo, generado)
/home/maxi/program/clock/src/modules/project/components/project-picker.tsx           (nuevo)
/home/maxi/program/clock/src/modules/project/components/project-picker.test.tsx      (nuevo)
/home/maxi/program/clock/src/modules/project/components/tracking-catalog.tsx         (nuevo)
/home/maxi/program/clock/src/modules/project/components/picker-model.ts              (nuevo)
/home/maxi/program/clock/src/modules/project/components/picker-model.test.ts         (nuevo)
/home/maxi/program/clock/src/modules/project/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/manual-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-list.tsx
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/use-entry-action.ts       (se borra)
/home/maxi/program/clock/src/modules/time-entry/components/use-new-entry-id.ts       (se borra)
```

- **`combobox.tsx`** sale del CLI de shadcn con `components.json` tal como
  está, sobre el `Combobox` de Base UI 1.8. Si el generador suma dependencias,
  `package.json` y `package-lock.json` entran en la lista solo para ese cambio.
- **`project-picker.test.tsx`** (nuevo) es un test de componente como el de
  `projects-screen.test.tsx`: `renderToStaticMarkup`, sin `vi.mock`, con el
  selector envuelto en `TrackingCatalogProvider` y un catálogo armado a mano
  (criterio 16).
- `src/hooks/` no cambia: se usa como está.

### tests-slice10

```
/home/maxi/program/clock/e2e/project-picker.spec.ts                            (nuevo)
/home/maxi/program/clock/e2e/database.ts
/home/maxi/program/clock/e2e/tracker-page.ts
```

- **`database.ts`** suma lo que la interfaz no puede producir en la fase 1:
  sembrar un proyecto con cliente, tareas, privado o con miembros por email, y
  marcar una tarea como hecha. Con la misma comprobación de una fila que usan
  `archiveProject` y `revokeProjectManager`.
- **`tracker-page.ts`** suma los localizadores del selector:
  `projectPicker(scope)` y `pickProject(page, scope, nombre)`.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/time-tracker.md
/home/maxi/program/clock/docs/parity/proyectos.md
```

Antes del merge, lo que enumera §1 en «Lo que el slice decide y que la paridad
tiene que registrar».

### Lo que no toca nadie

- `src/server/permissions/`: no hay acciones nuevas (§3).
- `src/server/action.ts`, `src/hooks/`, `src/lib/text.ts`: se usan como están.
- `src/server/create-once.ts`, `src/server/session.ts`, `src/server/time/`.
- `src/modules/workspace/`.
- `src/modules/project/actions.ts` y la pantalla `/proyectos`.
- `src/modules/time-entry/components/tracker-shortcuts.ts` (§6, «El selector»).
- `src/app/(app)/page.tsx`: el catálogo lo pide `tracker-screen.tsx`.
- Los documentos de slices anteriores y de correcciones, que son históricos.

### Handshake de orden

1. **La migración de §4.1, en dos commits sin cambio de conducta:**
   1. `frontend-dev` pasa los tres componentes a `useAction` y `useNewId` y
      borra las dos copias. Compila contra las actions de hoy: el
      `ActionResult` local y el compartido tienen la misma forma.
   2. `backend-dev` pasa `actions.ts`, `service.ts` y `schema.ts` a
      `src/server/action.ts`. **No borra el `ActionResult` local hasta que esté
      el commit anterior**, que es el único consumidor en `components/`.

   Con los dos, `npm run lint && npm run typecheck && npm run test:all` en
   verde y ningún test cambiado salvo imports.

2. **Primer commit de funcionalidad de `backend-dev`:** la columna, las
   migraciones, los tipos de §4.2 (`ProjectRef`, `TaskRef`, `ProjectSelection`,
   `TrackingCatalog`, los inputs, la vista), `EntryWithRefs`, las firmas de
   `updateEntryProject`, `getTrackingCatalog` y `assertTrackable`, y
   `pairToCheck`.
3. **`frontend-dev` arranca en paralelo** con `combobox.tsx`,
   `picker-model.ts` y su test, y los textos de los dos `labels.ts`.
4. Con el commit 2 en la rama, el resto. `tests-slice10` escribe el spec y
   confirma que falla por la funcionalidad.

### Responsabilidades que no se leen en el nombre del archivo

- **`tracking-catalog.tsx`** (nuevo, `"use client"`) es un proveedor de
  contexto con el `TrackingCatalog` y `useTrackingCatalog()`. Envuelve la
  pantalla en `tracker-screen.tsx`, como `ReachWeekProvider`, para que la barra
  y cada fila lo lean sin pasarlo por tres niveles de props.
  **`useTrackingCatalog()` lanza fuera del proveedor**, como
  `useDisplayFormats` del slice 7: un catálogo vacío por omisión haría que un
  selector sin proveedor dijera «No hay proyectos todavía» sin que nadie lo
  note. Todo test de componente que dibuje el selector, o una fila que lo
  contenga, lo envuelve en el proveedor.
- **`picker-model.ts`** (nuevo, puro, sin React) arma lo que el selector dibuja
  a partir del catálogo, la búsqueda y la selección actual. **Es el único que
  filtra**:
  - **La búsqueda** no distingue mayúsculas ni acentos (normaliza con `NFD` y
    descarta las marcas diacríticas). Un cliente que coincide trae todos sus
    proyectos con todas sus tareas; un proyecto que coincide trae todas sus
    tareas; una tarea que coincide trae su proyecto con solo las tareas que
    coinciden.
  - **«Sin proyecto»** va primero, solo con la búsqueda vacía.
  - **El vacío** distingue dos casos: el catálogo sin proyectos (TT-87, con el
    enlace si `canCreateProject`) y la búsqueda sin coincidencias.
- **`project-picker.tsx`** (nuevo, `"use client"`) es el selector, sin estado
  propio de la selección. Recibe:
  - `value: ProjectSelection` y `onChange(selection)`;
  - `variant: "bar" | "row"`, que decide qué muestra sin selección (TT-06,
    TT-50);
  - `label`, el nombre accesible del disparador, **ya armado por quien lo
    usa**: el selector no sabe qué es una entrada;
  - `pending`, que lo deja con `aria-disabled` mientras el cambio viaja;
  - `readOnly`, que lo dibuja como texto, sin `combobox`: el punto y el nombre,
    o lo que muestra sin selección.

  **El `Combobox` de Base UI va con `filter={null}`** y recibe como ítems la
  salida de `picker-model.ts`: si filtrara también la primitiva, un cliente que
  coincide perdería los proyectos cuyo nombre no coincide. Lo usan la barra y
  la fila; después, el timesheet y la edición masiva. Sus reglas de
  accesibilidad están en «El selector» abajo.

- **`tracker-bar.tsx`** es dueño del par de la barra, como de la descripción:
  - **Sin timer**, el par es un borrador que viaja con «Iniciar» y con
    «Agregar». «Agregar» lo limpia con éxito si sigue igual a lo que se mandó,
    como la descripción (TT-25).
  - **Con timer**, el par es el de la entrada abierta, y elegir otro llama a
    `updateEntryProject` sobre ella (TT-27), con vista optimista: el disparador
    muestra lo elegido mientras viaja y vuelve al del servidor si falla
    (TT-90). El aviso es «No se pudo cambiar el proyecto.» con el mensaje.
  - **Con la membresía no activa** (`canTrack` falso), el selector va con
    `readOnly`, como el resto de los controles de la barra quedan inactivos, y
    muestra el proyecto del timer como texto (TT-92).
  - **Todo lo que la barra hace con la descripción cuando cambia el timer** lo
    hace con el par: retenerlo en modo manual si llega un timer de otra
    pestaña, devolverlo al detenerse, y descartarlo con el timer descartado
    (TT-65). Al detener, la barra queda sin proyecto.
  - **Un borrador con un proyecto que dejó de estar disponible se conserva**,
    como lo tecleado (TT-89): «Iniciar» responde TT-77 y la persona elige otro.
    No se descarta en silencio al revalidar.
  - **El selector de la barra es del contenedor**, como el campo de
    descripción, y se pasa a `TimerBar` y a `ManualBar` como nodo. Si la barra
    cambia de modo con el selector abierto, el selector se cierra sin elegir y,
    si el foco quedó en `body`, vuelve al disparador de la barra nueva, con el
    mismo mecanismo que `focusAfterDiscard`.
- **`timer-bar.tsx` y `manual-bar.tsx`** dibujan el selector donde hoy dicen
  «Sin proyecto».
- **`day-group.tsx`** es dueño de `updateEntryProject` de sus filas, como de la
  descripción: vista optimista por fila con `replaceById`, la fila atenuada
  mientras viaja (TT-55), y el aviso «No se pudo cambiar el proyecto.» en el
  grupo, que sobrevive a la fila. Una operación nueva baja el aviso de duplicar,
  como hoy.
- **`entry-row.tsx`** dibuja el selector en el lugar de «Sin proyecto», en el
  orden de TT-49, con `label={entryProjectLabel(entryName)}`. **Con la
  membresía no activa** lo pasa con `readOnly`: el punto y «Proyecto: Tarea», o
  «Sin proyecto» en gris (TT-50, TT-92). **El selector no manda nada si el par
  elegido es el que la fila ya tiene.**
- **`labels.ts` de `project`** suma los textos del selector:

  | Clave                | Texto                                       | Origen       |
  | -------------------- | ------------------------------------------- | ------------ |
  | `pickerEmpty`        | «Proyecto»                                  | TT-06        |
  | `noProject`          | «Sin proyecto»                              | TT-10, TT-50 |
  | `pickerSearch`       | «Buscar proyecto, cliente o tarea»          | TT-07        |
  | `pickerNoProjects`   | «No hay proyectos todavía»                  | TT-87        |
  | `pickerGoToProjects` | «Ir a Proyectos»                            | TT-87        |
  | `pickerNoMatches`    | «Ningún proyecto coincide con la búsqueda.» | TT-07        |

  Y una función: `projectTaskLabel(proyecto, tarea)` → «Proyecto: Tarea»
  (TT-06). `trackerLabels.noProject` de `time-entry` pasa a usar el mismo
  texto desde `projectLabels`, por la regla de una redacción por causa: la
  dirección `time-entry` → `project` del ADR 0010 lo permite.

- **`labels.ts` de `time-entry`** suma:
  - `projectNotSaved`: «No se pudo cambiar el proyecto.» (TT-90);
  - `entryProjectLabel(entryName)` → «Proyecto de la entrada «…»», el nombre
    accesible del selector de la fila. Vive acá y no en `project`: nombra una
    entrada, que es de este módulo.

### El selector

Base UI con el buscador dentro del popup: el disparador tiene rol `combobox` y
abre un diálogo con el buscador, un `listbox` y sus grupos. Lo que este
contrato fija:

- **El disparador.**
  - En la barra, nombre accesible «Proyecto». Sin selección muestra «Proyecto»
    con el ícono de carpeta (TT-06).
  - En la fila, nombre accesible «Proyecto de la entrada «…»», con el nombre de
    la entrada o «Sin descripción», como «Acciones de la entrada «…»». Sin
    selección muestra «Sin proyecto» en gris (TT-50).
  - Con selección muestra el punto de color y el nombre, o «Proyecto: Tarea».
    El punto es decorativo (`aria-hidden`): el nombre ya dice cuál es.
  - **Con un cambio en vuelo queda inactivo con `aria-disabled` y no abre**,
    sin `disabled`: el foco se queda en él (lección del proyecto).
  - **Con `readOnly` no hay disparador**: el texto, sin rol `combobox`.
- **Al abrir, el foco va al buscador**, con nombre accesible
  «Buscar proyecto, cliente o tarea».
- **Las opciones.**
  - Un grupo por cliente, rotulado con su nombre, y «Sin cliente» al final.
  - La opción de un proyecto se llama como el proyecto. La de una tarea, debajo
    de su proyecto y con sangría, se llama «Proyecto: Tarea»: el texto visible
    es el nombre de la tarea, y el del proyecto va oculto para la vista.
  - «Sin proyecto» es una opción más, la primera.
  - La selección actual está marcada como seleccionada, salvo que no esté en el
    catálogo (un proyecto archivado de la entrada): ahí ninguna lo está.
- **Los vacíos** son una región `status` dentro del diálogo: «No hay proyectos
  todavía» con el enlace «Ir a Proyectos», o «Ningún proyecto coincide con la
  búsqueda.».
- **Elegir una opción cierra el selector y deja el foco en el disparador.**
  `Escape` lo cierra sin cambiar nada y también deja el foco en el disparador.
  Lo que hace `Tab` es lo que hace la primitiva; el e2e no lo fija.
- **Los atajos de una tecla no se disparan dentro.** El popup tiene rol
  `dialog`, el buscador es un `input` y la lista un `listbox`: los tres están
  en `IGNORED_SCOPES` de `tracker-shortcuts.ts`, que no cambia.
- **El popup va en un portal**: los e2e lo buscan en `page`.

## 7. Criterios de aceptación

1. **La base** (PR-105, TT-70).
   - Rechaza una entrada con un `project_id` de otro workspace, con una tarea de
     otro proyecto y con una tarea sin proyecto, aunque se escriba sin pasar
     por el service.
   - Acepta una entrada con proyecto y sin tarea.
2. **Los borrados en la base** (PR-10, PR-64, PR-66, PR-67, PR-70, PR-107):
   los cinco de §2.2, más la entrada abierta: borrar en dos sentencias el
   proyecto de un timer que corre lo deja corriendo, sin proyecto y sin tarea.
3. **El catálogo** (TT-08, PR-23, PR-87, PR-98, PR-99, PR-100, PR-110).
   - `getTrackingCatalog` devuelve exactamente los proyectos activos que acepta
     `can(…, "project.track", …)`, con sus tareas activas.
   - Un privado sembrado: un `member` que no es miembro no lo ve; tampoco un
     admin que no es miembro, que sí lo ve en `getProjectCatalog`; un miembro
     `member` sí.
   - Un archivado no aparece; sus tareas tampoco.
   - Una tarea hecha no aparece y su proyecto sí.
   - Un proyecto activo de un cliente archivado aparece en el grupo de su
     cliente.
   - Los grupos y los proyectos en orden alfabético, «Sin cliente» al final.
4. **Las altas con proyecto** (TT-06, TT-22, TT-25).
   - `startTimer` y `createManualEntry` guardan el par pedido.
   - Con un proyecto no disponible —archivado, privado sin acceso, inexistente,
     de otro workspace— responden TT-77; con una tarea hecha, inexistente o de
     otro proyecto, PR-74. En los dos casos no escriben nada, y `startTimer` no
     cierra el timer que corría.
5. **TT-70** — Una tarea sin proyecto se rechaza con «Elegí un proyecto antes
   que una tarea.» en los tres inputs.
6. **`updateEntryProject`** (TT-10, TT-11, TT-27, TT-54).
   - Cambia el par de una entrada cerrada y de la que corre, sin detenerla.
   - «Sin proyecto» deja los dos nulos.
   - El mismo par que ya tiene responde la vista sin escribir y sin registro.
   - Una entrada ajena responde TT-79 con el texto que la nombra; una
     inexistente, TT-80.
7. **La regla del par sobre una entrada que ya tiene proyecto** (TT-104, PR-63,
   PR-65, PR-71, PR-106). Con una entrada sembrada con un proyecto archivado,
   con uno privado del que quien actúa no es miembro y con una tarea hecha:
   - detenerla, editar la descripción, los horarios y el inicio funciona, y la
     entrada conserva el par;
   - quitarle la tarea, o el proyecto, funciona;
   - cambiarle la tarea responde TT-77 o PR-74 y no cambia nada.
8. **Continuar y duplicar** (TT-57, TT-58).
   - Copian el proyecto y la tarea de la original.
   - Con la original en cualquiera de los tres estados del criterio 7,
     responden TT-77 o PR-74 y no escriben nada; continuar no cierra el timer
     que corría.
9. **La vista** (TT-49, TT-50, PR-71, PR-101, PR-102, PR-103).
   - Toda vista que devuelve una action o la lectura trae `project` y `task`:
     `running`, `stopped`, `created`, `entry`, y las de la lista.
   - Con el nombre o el color del proyecto cambiados por SQL, la vista trae los
     nuevos. Con el cliente cambiado, la vista no cambia.
   - Una entrada con un proyecto privado del que la persona dejó de ser miembro
     lo muestra con su nombre y su color.
   - El reintento de una alta con proyecto responde la vista con su proyecto.
10. **`pairToCheck`** — Los cuatro casos de su tabla, y un id que solo cambia
    las mayúsculas cuenta como el mismo.
11. **El modelo del selector** (TT-07, TT-10, TT-87, PR-87).
    - La búsqueda por cliente, por proyecto y por tarea, con y sin acentos y
      mayúsculas, con lo que trae cada coincidencia.
    - «Sin proyecto» primero y solo con la búsqueda vacía.
    - El catálogo vacío da el vacío de TT-87, con el enlace solo con
      `canCreateProject`; la búsqueda sin coincidencias da el otro.
    - Un proyecto sin tareas no trae opciones de tarea.
12. **La capa de action.**
    - `updateEntryProject` **exige su permiso antes de tocar nada**: con la
      membresía desactivada responde el mensaje neutro de TT-79 sin buscar la
      fila, también con un id que no existe.
    - `updateEntryProject` traduce el `ZodError`, conserva el código y el
      mensaje del `TimeEntryError` y **del `ProjectError` de otro módulo**
      (`not_found`, no `unexpected`), responde `unexpected` con un error
      cualquiera y revalida `/`, también con error.
    - `startTimer`, `createManualEntry`, `continueEntry` y `duplicateEntry`
      responden TT-77 con `not_found`.
    - `isMissingProject` e `isMissingTask` reconocen un `23503` real de su
      clave, y no el de la otra.
13. **Auditoría.**
    - `updateEntryProject` deja `timeEntry.updateProject` con el par anterior y
      el nuevo; el pedido sin cambios no deja nada.
    - Las cuatro altas guardan el par en su `nextValue`.
14. **La migración, sin cambio de conducta** (§4.1). Después de los dos commits
    del paso 1 del handshake, todos los tests existentes de `time-entry`
    pasan sin cambiar lo que afirman; `use-entry-action.ts` y
    `use-new-entry-id.ts` no existen, y ningún archivo del módulo define
    `ActionResult`, `failure` ni `handle`.
15. **La pantalla** (TT-06, TT-07, TT-10, TT-11, TT-27, TT-38, TT-49, TT-54,
    TT-57, TT-104, PR-94). Los recorridos 1 a 6 de abajo.
16. **El selector, accesible** (TT-92).
    - Los roles y los nombres de «El selector» (§6); el foco en el buscador al
      abrir y en el disparador al elegir y con `Escape`; el disparador con
      `aria-disabled` y el foco en él mientras el cambio viaja; una letra
      escrita en el buscador no dispara su atajo.
    - Con `readOnly` el selector se dibuja como texto, con el proyecto y la
      tarea o «Sin proyecto», y sin ningún elemento con rol `combobox`.
    - `useTrackingCatalog()` fuera del proveedor lanza.

### Con qué se verifica cada criterio

| Criterio | Tipo                 | Archivo                                                                           | Qué afirma                                                                                                         |
| -------- | -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1        | integración          | `time-entry/schema.integration.test.ts`                                           | los tres rechazos y la aceptación, con `insert` directos                                                           |
| 2        | integración          | `time-entry/schema.integration.test.ts`                                           | cada borrado con la entrada antes y después, y la entrada abierta                                                  |
| 3        | integración          | `project/service.integration.test.ts`                                             | el catálogo contra `can(…, "project.track", …)` sobre los mismos proyectos, y el contraste con `getProjectCatalog` |
| 4        | integración          | `time-entry/service.integration.test.ts`                                          | la fila con su par; cada rechazo con la tabla sin filas nuevas y el timer previo abierto                           |
| 5        | unidad               | `time-entry/schema.test.ts`                                                       | el `refine` en los tres inputs, con el mensaje                                                                     |
| 6        | integración          | `time-entry/service.integration.test.ts`                                          | los cambios, el no-op sin `updated_at` nuevo ni registro, y los dos rechazos                                       |
| 7        | integración          | `time-entry/service.integration.test.ts`                                          | las operaciones sobre los tres estados sembrados                                                                   |
| 8        | integración          | `time-entry/service.integration.test.ts`                                          | la copia del par; los rechazos sin filas nuevas y el timer previo abierto                                          |
| 9        | integración          | `time-entry/service.integration.test.ts`                                          | `project` y `task` en cada vista y en `getTrackerState`, con los cambios por SQL                                   |
| 10       | unidad               | `time-entry/assignment.test.ts`                                                   | la tabla de §4.3                                                                                                   |
| 11       | unidad               | `project/components/picker-model.test.ts`                                         | cada búsqueda, la opción «Sin proyecto» y los dos vacíos                                                           |
| 12       | integración          | `time-entry/actions.integration.test.ts`; `time-entry/schema.integration.test.ts` | el permiso primero, las traducciones y la revalidación; los dos predicados contra un `23503` real                  |
| 13       | integración          | `time-entry/audit.integration.test.ts`                                            | el registro del cambio, ninguno en el no-op, y el par en las cuatro altas                                          |
| 14       | lint, tipos y suites | `npm run lint && npm run typecheck && npm run test:all`                           | los suites de hoy en verde después del paso 1 del handshake, sin cambios en lo que afirman                         |
| 15       | e2e                  | `e2e/project-picker.spec.ts`                                                      | los recorridos 1 a 6                                                                                               |
| 16       | e2e + unidad         | `e2e/project-picker.spec.ts`; `project/components/project-picker.test.tsx`        | el recorrido 7; el marcado con `readOnly` y el lanzamiento fuera del proveedor                                     |

**El vacío de TT-87 no se prueba en e2e**, por la misma razón que el vacío del
slice 9: la base de los e2e es una sola, compartida y persistente, y «un
workspace sin proyectos» existe una sola vez en su vida. Lo cubre el criterio
11 sobre el modelo.

**La membresía desactivada no se prueba en e2e**: ningún spec la produce hoy, y
lo que el criterio 16 afirma —el texto en lugar del selector— es el marcado del
componente con `readOnly`. Que la barra y la fila pasen `readOnly` cuando
`canTrack` es falso lo mira la revisión de frontend.

**El criterio 6 afirma el no-op mirando `updated_at`**, que cambia con
cualquier `update` de drizzle por el `$onUpdate` de la tabla: un mutante que
escribe igual el mismo par lo cambia.

### Recorridos obligatorios de `e2e/project-picker.spec.ts`

Dueño: `tests-slice10`. Cada recorrido usa una persona propia, y **todo nombre
que siembra lleva un sufijo único por corrida**: los proyectos no se pueden
borrar en la fase 1 y la base persiste. Las horas «de hoy» son pasadas
(`00:00–00:01`), y cada mutación se espera por la respuesta del servidor
(`withServerAction`), no por lo que ya se dibujó.

1. **La barra** (TT-06, TT-07, TT-11, TT-38). Con un cliente `C <sufijo>`, un
   proyecto `Web <sufijo>` con la tarea `Diseño <sufijo>`, y un proyecto sin
   cliente:
   1. abrir el selector de la barra, escribir parte del nombre de la tarea sin
      acento y ver solo ese proyecto con esa tarea;
   2. elegir la tarea y ver «Web …: Diseño …» en el disparador;
   3. iniciar, recargar, y ver el timer con el mismo proyecto y tarea;
   4. detener y ver la fila con «Web …: Diseño …» y la barra con «Proyecto».
2. **Con el timer corriendo** (TT-27, TT-10). Con un timer con proyecto, elegir
   «Sin proyecto» en la barra; después de la respuesta, recargar y ver el timer
   corriendo sin proyecto.
3. **La fila** (TT-54, TT-49). Cambiar el proyecto de una entrada cerrada desde
   su fila, ver el foco en el disparador de la fila después de elegir, recargar
   y ver el proyecto nuevo con su punto.
4. **Lo que no se ofrece y lo que se conserva** (TT-08, PR-23, TT-104).
   1. Con un proyecto privado sembrado del que la persona no es miembro, no
      aparece al buscarlo.
   2. Con un proyecto público sembrado, crear por la interfaz, en modo manual,
      una entrada con ese proyecto. Después, archivarlo con `archiveProject` de
      `e2e/database.ts`.
   3. Recargar: la fila sigue mostrando el proyecto archivado, y el selector ya
      no lo ofrece al buscarlo.
5. **Archivado en otra pestaña** (PR-94, TT-77). Elegir un proyecto en la barra
   sin timer, archivarlo con `archiveProject`, iniciar, y ver «No se pudo
   iniciar el timer.» con «Ese proyecto ya no está disponible.», sin
   «Reintentar» y sin timer. Recargar y ver que el selector ya no lo ofrece.
6. **Continuar** (TT-57). Continuar una fila con proyecto y tarea y ver el
   timer con los dos.
7. **Accesibilidad y atajos** (criterio 16). En la barra:
   1. el disparador es un `combobox` llamado «Proyecto»; al abrirlo, el foco
      está en «Buscar proyecto, cliente o tarea»;
   2. escribir `n` en el buscador escribe y no arranca un timer;
   3. `Escape` cierra sin cambiar y deja el foco en el disparador;
   4. elegir una tarea por teclado deja el foco en el disparador.

## 8. Deuda conocida del slice

- **El catálogo viaja entero en cada render**, también en cada revalidación de
  P-11, cada 60 segundos con la pestaña visible. **El umbral es el del slice 9:
  cientos de proyectos y miles de tareas.** Pasado ese umbral, el selector
  busca en el servidor y pagina, como describe PR-110, y la lectura de §5.1 deja
  de traer las tareas de todos los proyectos.
- **Las tareas se listan siempre** (TT-07, §1). Con proyectos de muchas tareas
  la lista se alarga; si pesa, el patrón de grilla con una celda de expansión
  es el camino, y cambia solo `project-picker.tsx` y `picker-model.ts`.
- **Continuar y duplicar con un proyecto no disponible se rechaza** sin
  verificar contra Clockify (P-14). Si el workspace del equipo muestra que copia
  sin el proyecto, cambia una rama de `continuedFields` y dos criterios.
- **La regla de los asignados de tarea no se aplica** (P-23). Cuando llegue,
  suma `task.track` y la llama `assertTrackable` (§3).
- **Un borrador con un proyecto que dejó de estar disponible se descubre al
  iniciar**, no antes. Es explícito a propósito: descartarlo al revalidar
  cambiaría la barra sin aviso.
- **La red del `23503` no se alcanza por el service en la fase 1**, porque nada
  borra proyectos ni tareas. Se prueba el reconocimiento con un error real y la
  traducción queda para cuando la fase 2 traiga los borrados.
- **Una lectura más por mutación** para armar la vista con su proyecto (§5.2),
  hasta que una CTE la junte con la escritura.
- **El alta manual sigue sin «Reintentar»** (TT-109), ahora también con
  proyecto: es la misma decisión pendiente del equipo.
- **La base de e2e acumula proyectos**, como desde el slice 9.
- **La versión de Postgres de Neon** tiene que ser 15 o posterior (§0).
