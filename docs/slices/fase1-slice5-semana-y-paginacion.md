# Fase 1, slice 5: semana y paginación

Contrato del quinto slice vertical de la fase 1. Módulos `time-entry` y
`workspace`, pantalla `/`.

Fuente de los comportamientos: `docs/parity/time-tracker.md`, TT-47, TT-48 y
TT-52, más TT-86, TT-96 y TT-108; y `docs/parity/perfil.md`, PF-01, PF-16,
PF-17 y PF-18, que fijan el primer día de la semana. Lugar en el plan:
[mapa de la fase 1](fase1-mapa.md). Decisiones de arquitectura asociadas:
[ADR 0008, la ventana de la lista vive en la URL](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md),
que nace acá; y el [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md)
para todo lo que convierte un día en instante.

Decisiones del equipo que da por tomadas: el primer día de la semana es lunes
por omisión (PF-16); el valor es por persona, va en `membership` y lo edita un
admin (PF-01, PF-17); cuando llegue TT-52 se retira el aviso de TT-108 y la
ventana se extiende hasta el día de la entrada (P-15); las fechas futuras se
aceptan (P-10).

## 0. Precondición de arranque

**El slice 5 depende de verdad de los slices 2 y 3**, no solo del 1 como decía
el mapa:

- **Del 2**: la ventana que este slice extiende es la del slice 2 —el extremo
  superior que llega a la entrada más nueva, `findLatestClosedBefore` para el
  inferior, `TrackerState.todayKey` y `minDayKey`, `workspaceFloorDayKey`— y el
  aviso de TT-108 que este slice retira vive en la barra del alta manual.
- **Del 3**: `updateEntryTimes` calcula `outsideWindow`, `day-group.tsx` es el
  dueño de la mutación de horas y `entry-list.tsx` dibuja el aviso de TT-108 de
  una fila movida. Este slice reemplaza las tres cosas (§4.3). Del 3 vienen
  también `updateRunningStart`, que devuelve la vista del timer activo, y el
  editor de `timer-bar.tsx` que la llama.

**Del slice 4 no depende**: no usa nada de continuar, duplicar, descartar ni
los atajos. Comparte con él `entry-list.tsx`, `day-group.tsx`,
`tracker-screen.tsx`, `schema.ts`, `service.ts` y `getTrackerState`. Este
contrato asume el orden del mapa —el 4 mergeado antes que el 5— y los puntos de
contacto son cinco:

- `lastEntryId` sigue saliendo de `findLatestClosedBefore(…, now)` y siempre
  cae dentro de la ventana.
- El aviso de falla de continuar queda arriba de la lista, donde estaba el de
  TT-108.
- `continueEntry` y `duplicateEntry` devuelven vistas, así que entran en la
  regla única de §4.3: la de continuar la aplica `entry-list.tsx`, y la de
  duplicar, `entry-list.tsx` por el aviso `onEntryWeek` de `day-group.tsx`.
- `continueEntry` pasa de recibir `timeZone` a recibir `TrackerWorkspace`
  (§4.2), igual que `startTimer`.
- El comentario de `duplicateTimes` en `service.ts` deja de nombrar
  `outsideWindow`, que este slice retira (§4.2). El contrato del 4 no se
  reescribe: describe el código tal como queda al mergear el 4.

Si el equipo prefiere adelantar el 5, el 4 se escribe contra las semanas y las
firmas de este contrato y nada más cambia.

El mapa queda corregido a «depende de 2 y 3».

## 1. Alcance

Entra: **TT-47, TT-48 y TT-52**, el primer día de la semana por persona como
dato (**PF-01, PF-16, PF-18**), y el cierre de la deuda de TT-108 que el slice
2 abrió.

Entran por arrastre, verificándose por el camino nuevo:

- **TT-86**: una semana sin entradas no se dibuja, ni dentro de la ventana ni al
  cargar más.
- **TT-96**: una entrada cuenta entera en la semana del día de su inicio, aunque
  termine en la siguiente.
- **TT-46**: el total de la semana del timer activo suma el transcurrido, igual
  que el total de su día.
- **TT-97**: los cortes de día y de semana se calculan sobre días locales, y los
  totales sobre instantes, así que una semana con cambio de horario suma las
  duraciones reales.
- **P-11**: la revalidación periódica conserva lo cargado, porque vuelve a
  dibujar la misma URL que una mutación (ADR 0008).

### Lo que el slice decide y que la paridad tiene que registrar

- **TT-52: la ventana son semanas enteras.** El piso que hoy se calcula —14
  días atrás, extendido hasta la última entrada pasada y el timer— baja hasta
  el primer día de su semana. Sin eso, la semana más vieja de la lista
  mostraría un total parcial (§5).
- **TT-52 y TT-86: «Cargar más» es un enlace que salta a la próxima semana con
  entradas**, no a la semana inmediatamente anterior. Cada clic muestra una
  semana nueva con algo adentro; las vacías no se dibujan.
- **TT-108: el aviso se retira** (P-15). Una entrada creada, movida o detenida
  en una semana más vieja que la ventana extiende la ventana hasta esa semana.
- **TT-47: el rótulo de una semana futura es su rango**, igual que el de
  cualquier semana que no sea esta ni la anterior.

**Lo registra `parity-analyst` antes del merge** (§6): las cuatro decisiones de
arriba en `docs/parity/time-tracker.md`; y en `docs/parity/perfil.md`, tres
filas de §10: la de `weekBounds`, que deja de ser un bloqueo porque el primer
día de la semana ya tiene de dónde salir, y las dos que dicen dónde se lee la
zona horaria —`page.tsx` y `actions.ts`—, que desde este slice la leen por
`trackerWorkspaceOf`, así que el perfil cambia esa función y no cada lugar.

### Queda afuera

- **Cualquier pantalla que muestre o cambie el primer día de la semana** (§3).
  Mostrarlo en el perfil, en solo lectura, es del slice 7 (PF-31); cambiarlo es
  de la pantalla de equipo (PF-17), que espera la deuda de
  `ensureWorkspaceContext` (mapa, §5).
- **Paginar dentro de la ventana**: «Cargar más» agrega semanas, no limita
  filas (ADR 0008, §8).

### Consecuencias sobre código ya entregado

| Archivo                            | Qué cambia                                                                                                                                                                                                                  | Qué hay que volver a probar                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/server/db/schema.ts`          | `membership.week_start`.                                                                                                                                                                                                    | La creación de la membresía en `ensureWorkspaceContext` (slice 1) |
| `src/modules/workspace/service.ts` | Suma `weekStartOf`.                                                                                                                                                                                                         | —                                                                 |
| `src/server/time`                  | `weekBounds` se apoya en claves de día; funciones nuevas de semana y de inicio de día.                                                                                                                                      | `time.test.ts` entero                                             |
| `service.ts`                       | La ventana en semanas, `desde`, `reachFrom`, `loadMoreFrom`; `TrackerState.days` pasa a `weeks`; `toView` recibe el workspace y cuatro funciones pasan de `timeZone` a workspace; el comentario de `duplicateTimes` (§4.2). | TT-43, TT-52, TT-86, TT-99, TT-108, `lastEntryId`                 |
| `schema.ts`                        | `weekStart` entra en `timeEntryView`; `outsideWindow` sale de dos resultados; `TrackerState` cambia de forma; `trackerSearchParams`.                                                                                        | Toda action que devuelve una vista                                |
| `actions.ts`                       | Todas pasan `trackerWorkspaceOf(session)` en vez de `session.workspace` o `session.workspace.timezone`.                                                                                                                     | `actions.integration.test.ts` entero                              |
| `permissions.integration.test.ts`  | Las llamadas al service, con las firmas nuevas.                                                                                                                                                                             | El archivo entero                                                 |
| `audit.integration.test.ts`        | Lo mismo.                                                                                                                                                                                                                   | El archivo entero                                                 |
| `tracker-bar.tsx`                  | Sale el aviso de TT-108; recibe `reachFrom`; aplica la regla de §4.3 después de iniciar, detener, guardar la descripción y agregar; le pasa `onEntryWeek` a la barra del timer.                                             | TT-22, TT-23, TT-25, TT-108, TT-109                               |
| `timer-bar.tsx`                    | Avisa `onEntryWeek` después de `updateRunningStart`.                                                                                                                                                                        | TT-28                                                             |
| `entry-list.tsx`                   | Dibuja semanas; sale el aviso de TT-108; «Cargar más»; recibe `reachFrom` y aplica la regla de §4.3 a lo que le avisan los grupos y después de continuar.                                                                   | TT-56, TT-57, criterio 12 del slice 3                             |
| `day-group.tsx`                    | Su encabezado pasa de `h2` a `h3`; `onOutsideWindow(día)` pasa a `onEntryWeek(semana)`, que avisa después de editar horas, editar la descripción y duplicar.                                                                | TT-44, TT-45, TT-55, TT-58, TT-60                                 |
| `src/app/(app)/page.tsx`           | Lee `desde` y le pasa el workspace con el primer día de la semana de la persona.                                                                                                                                            | TT-16                                                             |
| `e2e/manual-entry.spec.ts`         | El recorrido del aviso de TT-108 pasa a afirmar la ventana extendida.                                                                                                                                                       | —                                                                 |
| `e2e/entry-times.spec.ts`          | Lo mismo con el recorrido 5 del slice 3.                                                                                                                                                                                    | —                                                                 |

## 2. Cambios de esquema

**Una columna nueva, `membership.week_start`**, en una migración nueva generada
con `npm run db:generate -- --name membership_week_start`, que queda como
`drizzle/0002_membership_week_start.sql` con su snapshot. Fijar el nombre con
`--name` es la convención del repositorio, como en `0001_time_entry`.

```ts
// src/server/db/schema.ts: `membership` suma una columna y una restricción
export const membership = pgTable(
  "membership",
  {
    // …las columnas de hoy, sin cambios…
    /** Primer día de la semana de la persona: 0 domingo … 6 sábado, como `WeekStart`. */
    weekStart: smallint("week_start").notNull().default(1),
  },
  (table) => [
    // …las dos de hoy, sin cambios…
    check("membership_week_start_range", sql`${table.weekStart} between 0 and 6`),
  ],
);
```

El SQL que tiene que salir del generador, y contra el que se revisa:

```sql
ALTER TABLE "membership" ADD COLUMN "week_start" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_week_start_range" CHECK ("membership"."week_start" between 0 and 6);
```

Por qué así:

- **En `membership` y no en `workspace`.** PF-01 ya lo decidió: el dato es por
  persona y por workspace, que es exactamente una membresía. Clockify no tiene
  un primer día de semana del workspace, así que un `workspace.week_start`
  sería un respaldo que ninguna pantalla edita nunca. Y no cuesta una consulta
  más: la sesión ya trae la fila de `membership` en cada pedido
  (`WorkspaceContext.membership`), que `ensureWorkspaceContext` lee con un
  `select()` de todas sus columnas.
- **`not null default 1`, y no nulable.** No hay un nivel superior del que
  heredar, así que el nulo no tendría significado. Cada persona tiene siempre
  un valor, que es lo que PF-37 pide del perfil.
- **`smallint` con `check`, y no un enum de Postgres.** `WeekStart` de
  `src/server/time` ya es `0 | 1 | … | 6` con domingo en cero (PF-16): el valor
  de la columna se usa tal cual. Un enum con los nombres de la API de Clockify
  obligaría a traducir en cada lectura y a migrar el tipo si alguna vez cambia.
- **`default 1`, lunes**, decidido por el equipo (PF-16).

**Sin tiempo de caída.** En Postgres 11 o posterior —Neon lo es— agregar una
columna `not null` con un valor por omisión constante no reescribe la tabla:
el valor queda en el catálogo y las filas existentes lo devuelven sin tocarse.
Ese es también el relleno de las membresías que ya existen: lunes, sin un
`update`. El `check` recorre las filas existentes al agregarse; con unas pocas
decenas de membresías es instantáneo. La migración es solo de expansión: el
código viejo sigue funcionando con la columna puesta —su `select()` nombra solo
las columnas que conoce, y al crear una membresía la base le pone el valor por
omisión—, así que se aplica antes del despliegue sin coordinar nada.

**Cambiar el valor de todos**, mientras no exista la pantalla de equipo, es una
sentencia:

```sql
update membership set week_start = <0..6> where workspace_id = '<id>';
```

### La reversión

drizzle-kit no genera migraciones de bajada. La reversión es este SQL, a mano:

```sql
ALTER TABLE "membership" DROP CONSTRAINT "membership_week_start_range";
ALTER TABLE "membership" DROP COLUMN "week_start";
DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "created_at" = <el `when` de 0002 en drizzle/meta/_journal.json>;
```

**Solo es segura con el código anterior a este slice ya desplegado.** El código
de este slice lee la columna en cada pedido con sesión —el `select()` de
`ensureWorkspaceContext` la nombra—, así que borrarla con ese código en
producción hace fallar todas las pantallas. El orden es: desplegar el código
anterior, verificar que sirve y recién entonces correr el SQL. La última
sentencia borra la fila del registro de migraciones: sin ella, volver a
desplegar el slice no reaplicaría la migración, porque drizzle-kit solo aplica
las posteriores a la última registrada. Los tres archivos de `drizzle/` se van
con el revert del commit.

### Restricción para el slice 7

El slice 7 queda reducido a la pantalla. Lo que este contrato le deja fijado:

- **La columna es esta y no cambia**: `membership.week_start`, `not null`,
  `default 1`, con el `check` 0..6. No se vuelve nulable ni gana un respaldo en
  `workspace`; no existe `workspace.week_start` y no se crea.
- **La lectura vive en una sola función**, `weekStartOf(context)` de
  `src/modules/workspace/service.ts`. Ningún consumidor lee
  `membership.weekStart` directo: ni el perfil, ni el calendario (slice 8), ni
  el timesheet (slice 13).
- **La zona horaria entra al rastreador por un solo lugar**,
  `trackerWorkspaceOf` (§4.1). Cuando el slice 7 traiga la zona de la persona,
  cambia esa función y nada más del módulo `time-entry`.
- **Lo que le queda al slice 7** del primer día de la semana es mostrar el
  valor en `/perfil`, en solo lectura, con la nota de que lo administra el
  equipo (PF-01, PF-31). La escritura es de la pantalla de equipo, con
  `team.manage` (PF-17), y espera la deuda de `ensureWorkspaceContext` del mapa
  (§5).

## 3. Acciones de permisos nuevas

**Ninguna. Este slice trae el dato y no una pantalla para cambiarlo.**

- **El dato es de la persona y lo escribe un admin desde la pantalla de
  equipo** (PF-01, PF-17). La acción que corresponde es `team.manage`, que ya
  existe con owner y admin, sobre el recurso `membership`, que ya lleva la regla
  de que la membresía del owner solo la toca el owner.
- **Esa pantalla no entra ahora.** El mapa (§5) pone como condición de
  cualquier slice que traiga `team.manage` resolver primero la deuda de
  `ensureWorkspaceContext`: hoy cualquiera que pase el login recibe una
  membresía, y borrarla no revoca nada porque se vuelve a crear. Abrir ahora
  una edición de membresías empezaría a construir sobre esa base la
  administración que el mapa pidió no construir hasta arreglarla.
- **`workspace.settings.update` no es la acción de este dato.** La tienen owner
  y admin (`src/server/permissions/index.ts:49`), pero es de los ajustes del
  workspace, y el primer día de la semana no es uno: un ajuste del workspace
  para este valor sería una divergencia con Clockify (PF-01).
- **El valor decidido cubre el caso real**: lunes para todos, como fijó el
  equipo (PF-16). Cambiarlo antes de la pantalla de equipo es la sentencia de
  §2.

## 4. Contrato de las server actions

**No hay actions nuevas.** Toda vista que devuelve una action suma la semana de
su entrada, dos resultados pierden `outsideWindow`, cuatro funciones del
service cambian de firma, y el módulo `workspace` suma la función del primer
día de la semana.

### 4.1 `weekStartOf` y `TrackerWorkspace`

```ts
// src/modules/workspace/service.ts
/** Primer día de la semana de quien pide: el de su membresía (PF-01, TT-48). */
export function weekStartOf(context: WorkspaceContext): WeekStart;

// src/modules/time-entry/service.ts
export type TrackerWorkspace = {
  readonly timezone: string;
  readonly createdAt: Date;
  /** Sale de `weekStartOf`, nunca de la membresía directo. */
  readonly weekStart: WeekStart;
};

/** Lo que el módulo usa del contexto de la sesión. */
export function trackerWorkspaceOf(context: WorkspaceContext): TrackerWorkspace;
```

`weekStartOf` lee `context.membership.weekStart`, que ya viene en la sesión, y
lo convierte con `parseWeekStart` de `src/server/time`, que lanza si sale del
rango: el `check` de la base lo impide, y la función no lo da por sentado.
`trackerWorkspaceOf` arma el tipo con `context.workspace.timezone`,
`context.workspace.createdAt` y `weekStartOf(context)`.

`page.tsx` y **todas** las actions de `time-entry` pasan
`trackerWorkspaceOf(session)`: las que hoy pasan `session.workspace` entero y
las que pasan solo `session.workspace.timezone` (§4.2).

### 4.2 La semana de una entrada, en su vista

`timeEntryView` suma un campo, derivado igual que `dayDate`:

```ts
/** Primer día de la semana de `dayDate`, según el primer día de la persona: "2026-09-28". */
weekStart: z.string(),
```

En `toView`,
`weekStart = weekStartKey(dayKey(row.startedAt, timeZone), workspace.weekStart)`.
Por eso `toView` pasa a recibir el `TrackerWorkspace` en vez de la zona, y
**toda función del service que devuelve una vista recibe el workspace**:

| Action               | Vistas del resultado | Firma del service                          | Slice |
| -------------------- | -------------------- | ------------------------------------------ | ----- |
| `startTimer`         | `running`, `stopped` | `timeZone` → `workspace: TrackerWorkspace` | 1, 2b |
| `stopTimer`          | `stopped`            | `timeZone` → `workspace: TrackerWorkspace` | 1     |
| `updateDescription`  | `entry`              | `timeZone` → `workspace: TrackerWorkspace` | 1     |
| `createManualEntry`  | `created`            | ya recibe el workspace                     | 2     |
| `updateEntryTimes`   | `entry`              | ya recibe el workspace                     | 3     |
| `updateRunningStart` | `running`            | ya recibe el workspace                     | 3     |
| `continueEntry`      | `running`, `stopped` | `timeZone` → `workspace: TrackerWorkspace` | 4     |
| `duplicateEntry`     | `created`            | ya recibe el workspace                     | 4     |
| `deleteEntry`        | —                    | sin cambios                                | 1     |
| `discardTimer`       | —                    | sin cambios                                | 4     |

Los caminos de reintento del ADR 0007, `replayed` y `winner`, arman su
resultado con el mismo `toView`, así que también traen la semana. El
`replayed` de iniciar y de continuar devuelve `stopped: null` (§8).

`CreateManualEntryResult` y `UpdateEntryTimesResult` **pierden
`outsideWindow`** y no ganan nada propio: la semana viaja en `created` y en
`entry`. Las dos mutaciones **dejan de releer** `findLatestClosedBefore` y
`findRunning` después de escribir, porque ya no calculan la ventana: el paso
final de `createManualEntry` y el paso 11 de `updateEntryTimes` desaparecen.

**El comentario de `duplicateTimes`** (slice 4) nombra `outsideWindow` en dos
frases, y las dos pasan a hablar de la semana de la entrada. La que dice que
las alternativas «tampoco necesitan `outsideWindow` ni el piso» pasa a decir
que tampoco necesitan extender la lista ni el piso; y la última queda así:

```ts
 * … Solo una regla que pusiera la copia en un día anterior al de la
 * original y anterior a hoy necesitaría extender la lista hasta la semana de
 * la entrada, como el alta manual.
```

El razonamiento de fondo no cambia: con ninguna de las tres reglas la copia cae
antes de la original y antes de hoy, así que `duplicateEntry` no necesita nada
más que la semana que ya trae su vista. La regla de §4.3 se le aplica igual,
como a toda mutación.

Por qué la semana y no un booleano: la ventana ya no la decide solo el servidor,
sino también lo que la persona cargó (`desde`, ADR 0008), y la action no lo
sabe. Lo sabe el cliente, que recibió `reachFrom` con el estado. Con la semana
de cada entrada, el cliente compara dos claves de día. No hace aritmética de
fechas.

Por qué en la vista y no solo en los dos resultados: **detener también deja
entradas fuera de la ventana.** Un timer cuyo inicio está semanas atrás —porque
se movió (slice 3) o porque lleva semanas corriendo— está en la lista mientras
corre, porque el piso incluye el día del timer activo. Al detenerse pasa a ser
una entrada cerrada, y si hay otra más reciente, el piso deja de incluirla y la
revalidación la saca de la lista. Lo mismo pasa con el timer que cierran
`startTimer` y `continueEntry`. Con la semana en la vista, todas las
mutaciones se tratan igual.

### 4.3 TT-108 y P-15: la deuda del slice 2 se cierra

- **El aviso de TT-108 desaparece** de la barra y de la lista, con sus dos
  textos de `labels.ts` (`outsideWindowTitle`, `outsideWindowMessage`).
- **Una sola regla después de cualquier mutación que devuelva vistas**: se toma
  el `weekStart` más viejo de las vistas del resultado; si es anterior al
  `reachFrom` que la pantalla tiene, `router.replace` a `/?desde=<weekStart>`
  con `scroll: false`. La revalidación de la action y esa navegación dibujan la
  ventana extendida, con la entrada en su día.
- **Se compara contra `reachFrom` y no contra `windowFrom`.** `windowFrom` es
  el piso de lo que se dibuja, e incluye el día del timer activo (§5.2).
  Comparado contra él, un timer que ya estaba atrás cuando se cargó la página
  nunca daría una semana que alcanzar: al detenerlo, la regla daría `null` y la
  revalidación lo sacaría de la lista. `reachFrom` es el mismo piso sin el
  aporte del timer, que es lo que la ventana va a ser en cuanto el timer se
  detenga.
- **La regla vive en un solo lugar**, en dos piezas:

  ```ts
  // src/modules/time-entry/components/entry-week.ts
  /**
   * P-15: la semana hasta la que hay que extender la ventana para que se vean
   * las entradas que devolvió una mutación, o `null` si ya se ven todas aun
   * sin el timer activo.
   */
  export function weekToReach(
    reachFrom: string,
    weekStarts: readonly string[],
  ): string | null;

  // src/modules/time-entry/components/use-reach-week.ts
  /** Aplica `weekToReach` y, si da una semana, navega con `router.replace`. */
  export function useReachWeek(
    reachFrom: string,
  ): (weekStarts: readonly string[]) => void;
  ```

- **Quién la aplica**: el componente que recibe `reachFrom`, sea dueño de la
  mutación o reciba el aviso de quien lo es.

  | Mutación                                | Dueño de la mutación | Aplica la regla                      | Semanas que pasa     |
  | --------------------------------------- | -------------------- | ------------------------------------ | -------------------- |
  | Iniciar                                 | `tracker-bar.tsx`    | `tracker-bar.tsx`                    | `running`, `stopped` |
  | Detener                                 | `tracker-bar.tsx`    | `tracker-bar.tsx`                    | `stopped`            |
  | Descripción del timer                   | `tracker-bar.tsx`    | `tracker-bar.tsx`                    | `entry`              |
  | Agregar en modo manual                  | `tracker-bar.tsx`    | `tracker-bar.tsx`                    | `created`            |
  | Inicio del timer (`updateRunningStart`) | `timer-bar.tsx`      | `tracker-bar.tsx`, por `onEntryWeek` | `running`            |
  | Horas de una fila (`updateEntryTimes`)  | `day-group.tsx`      | `entry-list.tsx`, por `onEntryWeek`  | `entry`              |
  | Descripción de una fila                 | `day-group.tsx`      | `entry-list.tsx`, por `onEntryWeek`  | `entry`              |
  | Duplicar                                | `day-group.tsx`      | `entry-list.tsx`, por `onEntryWeek`  | `created`            |
  | Continuar                               | `entry-list.tsx`     | `entry-list.tsx`                     | `running`, `stopped` |

  `onEntryWeek(weekStart: string)` es el mismo callback en los dos lugares que
  avisan hacia arriba. Descartar y borrar no devuelven vistas y no avisan.

- **Las vistas del timer activo también pasan por la regla.** Si su semana es
  anterior a `reachFrom` —al moverle el inicio atrás, al editarle la
  descripción, al detenerlo—, la URL pasa a llevarla: la ventana ya la
  dibujaba por el timer, y desde ese momento la sostiene `desde` aunque el
  timer se detenga. Cuando la entrada ya está dentro de `reachFrom`, la regla
  da `null` y no hay navegación.
- **No hay desplazamiento automático hasta la entrada**: P-15 dice que el
  comportamiento vuelve a ser el de Clockify, donde la entrada está en su día y
  se llega bajando.
- **Hacia adelante no cambia nada**: el extremo superior ya llega a la entrada
  más nueva desde el slice 2.

Con esto **ninguna entrada queda sin poder verse**, que era la deuda: la que se
crea, se mueve o se detiene atrás extiende la ventana, y cualquier otra se
alcanza con «Cargar más». Los dos bordes que la regla no cubre están en §8.

## 5. Contrato de lectura

### 5.1 La firma

```ts
export async function getTrackerState(
  actor: Actor,
  workspace: TrackerWorkspace,
  request: { readonly from: string | null },
  now: Date = new Date(),
): Promise<TrackerState>;
```

`request.from` es el `desde` de la URL, ya validado con un esquema Zod de
`schema.ts`:

```ts
/**
 * Los parámetros de búsqueda de `/` (ADR 0008). Se usa solo con `safeParse`:
 * un `desde` que falta, que no es un día válido o que llega repetido
 * (`?desde=a&desde=b`, un arreglo) no pasa, y la pantalla lo ignora.
 */
export const trackerSearchParams = z.object({ desde: dayKeyInput });
```

`page.tsx` hace `trackerSearchParams.safeParse(await searchParams)` sobre el
objeto de Next, cuyos valores son `string | string[] | undefined`, y pasa
`parsed.success ? parsed.data.desde : null`. **Nunca lanza ni es un error**: un
`desde` malo se ignora. Un parámetro que se sume a esta pantalla más adelante
va en su propio esquema, para que su falla no arrastre a `desde`.

### 5.2 La ventana, en semanas

Dentro del mismo snapshot `repeatable read` de siempre, con las lecturas en
secuencia:

1. `running`, `latest` y `latestPast`, como hoy.
2. **El piso sin el timer**: el menor entre el día 13 días atrás, el día de
   `latestPast` y `request.from`, si viene. `desde` solo extiende: si es
   posterior a los otros dos, no cambia nada. El resultado nunca baja de
   `minDayKey`, la creación del workspace, porque antes no puede haber
   entradas. Redondeado a semana entera,
   `reachFrom = weekStartKey(piso sin el timer, workspace.weekStart)`.
3. **El piso de la ventana**: el menor entre el piso sin el timer y el día del
   timer activo, redondeado igual:
   `windowFrom = weekStartKey(piso, workspace.weekStart)`. Sin timer, o con un
   timer que empezó dentro de la ventana, `windowFrom = reachFrom`. El
   instante inferior de la consulta es `startOfDayKey(windowFrom, timeZone)`.
4. El techo, como hoy: el fin del día de la entrada más nueva si es futura, o
   `now`.
5. `listClosedBetween` entre los dos.
6. **La próxima semana con entradas**: `findLatestClosedBefore(…, inferior, tx)`.
   Si hay una, `loadMoreFrom = weekStartKey(dayKey(esa.startedAt), weekStart)`;
   si no, `null`.

El redondeo a semana entera es el que hace correctos los totales semanales: la
semana más vieja de la lista está entera, así que su total es el total de
verdad. El paso 6 es una consulta más dentro del mismo snapshot, que ya existe
y usa el mismo índice; el enlace «Cargar más» sabe sin otra ida y vuelta si
queda algo atrás y adónde saltar.

### 5.3 La forma del estado

`TrackerState.days` **pasa a `weeks`**, con los días adentro:

```ts
export const weekGroupView = z.object({
  /** Primer día de la semana, "2026-09-28". */
  start: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TT-47). */
  label: z.string(),
  /** El cliente suma acá el transcurrido del timer activo (TT-46). */
  isRunningWeek: z.boolean(),
  /** Exacto, en segundos: la suma de los `closedSeconds` de sus días. */
  closedSeconds: z.number().int().min(0),
  /** Solo días con entradas, del más reciente al más viejo. */
  days: z.array(dayGroupView),
});

// en trackerState
weeks: z.array(weekGroupView),
/** El piso de la ventana que se dibuja: primer día de su semana más vieja. */
windowFrom: z.string(),
/**
 * El piso que la ventana tendría sin el timer activo. Es contra el que el
 * cliente compara la semana de una entrada después de una mutación (P-15).
 */
reachFrom: z.string(),
/** El `desde` de «Cargar más», o `null` si no queda nada más atrás. */
loadMoreFrom: z.string().nullable(),
```

`dayGroupView` no cambia. Una semana existe solo si tiene al menos un día con
entradas, o si es la del timer activo (TT-46, TT-86). Las semanas van de la más
nueva a la más vieja; una futura, que P-10 permite, queda arriba de la actual.
El `start` de una semana es el `weekStart` de las vistas que contiene.

### 5.4 Las funciones nuevas de `src/server/time`

Todo corte de semana se calcula sobre **claves de día**, que son fechas civiles
y no tienen cambio de horario; el instante aparece solo al final, para la
consulta.

```ts
/** Primer día de la semana que contiene ese día. Aritmética civil, sin zona. */
export function weekStartKey(dayKey: string, weekStart: WeekStart): string;

/**
 * El primer instante del día local: `startOfLocalDay` del mediodía de ese día.
 * Lanza si las 12:00 de ese día no existen en la zona (§5.4).
 */
export function startOfDayKey(dayKey: string, timeZone: string): Date;

/**
 * «Esta semana», «Semana anterior», o «28/09 – 04/10». Si alguno de los dos
 * extremos no es del año de `todayKey`, los dos llevan el año:
 * «29/12/2025 – 04/01/2026».
 */
export function weekKeyLabel(
  weekStart: string,
  todayKey: string,
  weekStartsOn: WeekStart,
): string;

/** El número de la columna como `WeekStart`; lanza si no está entre 0 y 6. */
export function parseWeekStart(value: number): WeekStart;
```

**`weekBounds` pasa a apoyarse en las dos primeras**: su inicio es
`startOfDayKey(weekStartKey(dayKey(instant, tz), ws), tz)` y su fin, lo mismo
siete días después. Así hay una sola regla de semana, sobre claves de día, en
vez del `startOfWeek` de date-fns sobre un `TZDate` que usa hoy, que la
revisión de la ronda 1 encontró fallando 21 veces en `America/Santiago`.

`startOfDayKey` se resuelve sin construir la hora 00:00: parte de
`instantFromLocal(dayKey, "12:00", timeZone)`, un instante del mediodía de ese
día, y le aplica `startOfLocalDay`, que ya existe en `src/server/time`. **El
inicio del día lo sigue ubicando `startOfLocalDay`**, es decir el `startOfDay`
de date-fns sobre un `TZDate`: el slice no lo reemplaza, y los días en que eso
da un resultado histórico distinto están en §8. **Si las 12:00 no existen,
`instantFromLocal` da `null` y la función lanza**, en vez de devolver un
instante de otro día. Pasa en dos clases de días, que la revisión de
arquitectura encontró recorriendo las zonas de `Intl.supportedValuesOf("timeZone")`
entre 1990 y 2040 y verificó uno por uno con `instantFromLocal`:

| Clase                                                              | Zona                 | Día        |
| ------------------------------------------------------------------ | -------------------- | ---------- |
| A. El día existe, pero un adelanto de una hora arranca a las 12:00 | `Africa/Juba`        | 2000-01-15 |
| A.                                                                 | `Africa/Khartoum`    | 2000-01-15 |
| B. El día no existe: la zona cambió de lado de la línea de fecha   | `Pacific/Kwajalein`  | 1993-08-21 |
| B.                                                                 | `Pacific/Enderbury`  | 1994-12-31 |
| B.                                                                 | `Pacific/Kiritimati` | 1994-12-31 |
| B.                                                                 | `Pacific/Apia`       | 2011-12-30 |
| B.                                                                 | `Pacific/Fakaofo`    | 2011-12-30 |

**No es una lista cerrada**: sale de los datos de zonas del Node donde se
corrió y no mira nada antes de 1990 ni después de 2040. Para la clase A, lanzar
es más estricto de lo necesario —el día existe y tiene un primer instante—,
pero son dos días de hace más de veinte años y no justifican una segunda ruta
de cálculo. `time.test.ts` afirma que la función lanza con un caso de cada
clase: `Pacific/Apia` 2011-12-30 y `Africa/Khartoum` 2000-01-15, los más
estables en los datos de zonas.

**Ninguno es posterior al piso.** El más nuevo es de 2011-12-30, anterior a la
creación del workspace real (2026), al piso más viejo de los tests de
integración (2020-01-01) y al de los e2e (hoy menos `WORKSPACE_HISTORY_DAYS`).
El piso filtra `dayKey`; `weekStartKey` puede bajar hasta seis días más, que
siguen estando muy lejos de 2011. Desde 2026 hasta 2040 el recorrido no
encontró ningún caso: con las reglas de zonas conocidas, ningún día que el
rastreador pida alcanza el `throw`. Si un cambio futuro de reglas lo crea, la
falla es visible en vez de una semana corrida en silencio.

### 5.5 Qué ve la persona

- Una franja por semana, con su rótulo a la izquierda y «Total» con el total de
  la semana en `h:mm` a la derecha (TT-47). El total de la semana del timer
  activo sube con el contador, sumado en segundos y formateado una vez, igual
  que el del día.
- Dentro, los grupos de día de siempre.
- Al final, si `loadMoreFrom` no es nulo, el enlace **«Cargar más»**.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/0002_membership_week_start.sql                   (nuevo, generado)
/home/maxi/program/clock/drizzle/meta/0002_snapshot.json                          (nuevo, generado)
/home/maxi/program/clock/drizzle/meta/_journal.json
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/workspace/service.ts
/home/maxi/program/clock/src/modules/workspace/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
```

Los tres archivos de `drizzle/` salen del generador y no se editan a mano.
`repository.ts` de los dos módulos no cambia: las consultas que hacen falta ya
existen, y la membresía ya se lee entera. `permissions.integration.test.ts` y
`audit.integration.test.ts` llaman al service directo, así que el cambio de
firmas de §4.2 los rompe; se ajustan las llamadas y nada más. Las fábricas de
`src/test/` siembran membresías sin `week_start` y la base les pone lunes; un
test que necesita otro valor lo fija con un `update` sobre `membership`.

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/page.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-list.tsx
/home/maxi/program/clock/src/modules/time-entry/components/week-group.tsx      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-week.ts       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/entry-week.test.ts  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/use-reach-week.ts   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
```

`page.tsx` solo compone: lee `searchParams` —que en esta versión de Next es una
promesa—, lo pasa por `trackerSearchParams.safeParse` y le da a `TrackerScreen`
el `trackerWorkspaceOf(session)` y el `from`.

### tests-slice5

```
/home/maxi/program/clock/e2e/week-and-pagination.spec.ts                       (nuevo)
/home/maxi/program/clock/e2e/manual-entry.spec.ts
/home/maxi/program/clock/e2e/entry-times.spec.ts
```

Los dos specs existentes se tocan **solo** en el recorrido que afirma el aviso
de TT-108, que pasa a afirmar la ventana extendida; es la consecuencia directa
de P-15 y no hay otra forma de que sigan siendo verdad.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/time-tracker.md
/home/maxi/program/clock/docs/parity/perfil.md
```

Antes del merge, lo que enumera §1 en «Lo que el slice decide y que la paridad
tiene que registrar»: en `time-tracker.md`, la ventana en semanas enteras,
«Cargar más» como enlace que salta las semanas vacías, el retiro de TT-108 y el
rótulo de la semana futura; en `perfil.md`, tres filas de §10: la de
`weekBounds`, y las de `src/app/(app)/page.tsx` y
`src/modules/time-entry/actions.ts`, que pasan a decir que la zona se lee por
`trackerWorkspaceOf` y que el perfil cambia esa función.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/session.ts`, `src/components/ui/`,
`src/test/`, `repository.ts` de `time-entry` y de `workspace`. Los documentos de
slices anteriores y de correcciones son históricos y no se reescriben, tampoco
el contrato del 4: lo que este slice cambia de su código está en §0 y §4.2.

### Handshake de orden

1. **Primer commit de `backend-dev`**: la columna y su migración; las cuatro
   funciones de `src/server/time` con sus firmas; `weekStartOf`,
   `TrackerWorkspace` y `trackerWorkspaceOf`; los esquemas nuevos de
   `schema.ts` (`weekStart` en `timeEntryView`, `weekGroupView`, `reachFrom`,
   `trackerSearchParams`, los dos resultados sin `outsideWindow`) y las firmas
   nuevas de `getTrackerState` y de las cuatro funciones de §4.2.
2. **`frontend-dev` arranca en paralelo** por `entry-week.ts` con su test, por
   `week-group.tsx` contra el tipo nuevo y por los textos de `labels.ts`.
3. Con el primer commit en la rama, el resto.

### Responsabilidades que no se leen en el nombre del archivo

- **`entry-week.ts`** (nuevo) es la regla de §4.3 como función pura, sin React
  ni Next: recibe `reachFrom` y las semanas, y devuelve la más vieja si es
  anterior a `reachFrom`, o `null`. Su test cubre una semana anterior, una
  igual, una posterior, y varias con una sola anterior.
- **`use-reach-week.ts`** (nuevo) es el único lugar con el `router.replace` de
  P-15. Lo usan `tracker-bar.tsx` y `entry-list.tsx`, y nadie más.
- **`week-group.tsx`** (nuevo) es una semana: una `section` con encabezado `h2`
  —el rótulo— y el total, y adentro sus `DayGroup`. Suma el transcurrido del
  timer activo a su total con `useElapsedSeconds`, como `day-group.tsx`. El
  encabezado lleva `tabIndex={-1}` para recibir el foco después de «Cargar
  más».
- **`day-group.tsx`** cambia su encabezado de `h2` a `h3`: el día queda debajo
  de su semana en el árbol de encabezados. Sigue siendo el dueño de la
  mutación de horas (slice 3), de la descripción de una fila y de duplicar
  (slice 4). `onOutsideWindow(día)` del slice 3 se reemplaza por
  `onEntryWeek(weekStart)`, que llama después de cada una de esas tres con la
  semana de la vista devuelta: `data.entry.weekStart` o
  `data.created.weekStart`. `onOperationStart()` no cambia.
- **`entry-list.tsx`** dibuja las semanas en vez de los días, recibe
  `reachFrom` y `loadMoreFrom`, y:
  - Aplica la regla de §4.3 con `useReachWeek(reachFrom)` a lo que le avisan
    los grupos por `onEntryWeek` y al resultado de continuar. Sale su aviso de
    TT-108.
  - Dibuja «Cargar más» como un `<Link href="/?desde=…" scroll={false}>` con el
    `loadMoreFrom`, **sin `prefetch={true}`** (ADR 0008). Es un enlace y no un
    botón porque navega: funciona sin JavaScript, se puede abrir aparte y el
    botón «Atrás» vuelve.
  - **Mueve el foco cuando la navegación de «Cargar más» termina**: al
    encabezado de la semana cuyo `start` es el `loadMoreFrom` que se pidió. Si
    esa semana no llegó —sus entradas se borraron entre el render y el clic, y
    TT-86 no la dibuja—, el foco va al encabezado de la semana más vieja de la
    lista. Sin eso, el foco se queda en un enlace que bajó de lugar o
    desapareció.
- **`tracker-bar.tsx`** recibe `reachFrom` de `tracker-screen.tsx`, aplica la
  regla con `useReachWeek(reachFrom)` después de iniciar, detener, guardar la
  descripción y agregar, y le pasa `onEntryWeek` a `TimerBar`. Deja de dibujar
  el aviso de TT-108. Ningún componente cliente recibe `windowFrom`.
- **`timer-bar.tsx`** llama a `onEntryWeek(data.running.weekStart)` después de
  un `updateRunningStart` exitoso.
- **`labels.ts`** pierde `outsideWindowTitle` y `outsideWindowMessage`, y suma:

  | Clave       | Texto        |
  | ----------- | ------------ |
  | `loadMore`  | «Cargar más» |
  | `weekTotal` | «Total»      |

  «Esta semana» y «Semana anterior» no van acá: los arma `weekKeyLabel` en el
  servidor, como «Hoy» y «Ayer» los arma `dayKeyLabel`.

## 7. Criterios de aceptación

1. **La migración** — Una membresía nace con `week_start = 1`, y el `check`
   rechaza 7 y -1. El relleno de las membresías que ya existen se argumenta y
   no se prueba (§8).
2. **TT-48** — La semana corta en el primer día de la persona: con lunes, una
   entrada del domingo cae en la semana que empezó el lunes anterior; con
   domingo, abre una semana nueva. Dos personas del mismo workspace con valores
   distintos ven la misma fecha en semanas distintas (PF-01).
3. **TT-47** — La lista agrupa por semana, de la más nueva a la más vieja, con
   «Esta semana», «Semana anterior» o el rango —con el año en los dos extremos
   cuando alguno no es del año actual—, y el total de la semana a la derecha.
4. **TT-47, el total** — El total de una semana es la suma exacta de sus
   entradas en segundos, formateada una vez; el de la semana del timer activo
   sube con el contador.
5. **TT-96** — Una entrada que empieza el último día de una semana y termina en
   la siguiente cuenta entera en la primera.
6. **TT-97 y los cortes** — `weekStartKey`, `startOfDayKey` y `weekBounds` dan
   el mismo corte para todos los días de 2026 en `Europe/Madrid`,
   `America/Argentina/Buenos_Aires` y `America/Santiago`, con los siete valores
   de `WeekStart`; `startOfDayKey(d)` cae en `d` y un milisegundo antes cae en el
   día anterior, también el día en que Santiago no tiene 00:00. `startOfDayKey`
   lanza con `Pacific/Apia` 2011-12-30 y con `Africa/Khartoum` 2000-01-15. Una
   semana con cambio de horario suma las duraciones reales.
7. **La ventana en semanas enteras** — La semana más vieja de la lista está
   completa: su total incluye las entradas de todos sus días, aunque el piso por
   omisión cayera a mitad de semana.
8. **TT-52, «Cargar más»** — El enlace lleva a `?desde=` con la semana más
   reciente que tiene entradas antes de la ventana; esa semana aparece entera y
   el foco va a su encabezado; sin nada más atrás, no hay enlace. Las semanas
   vacías del medio no se dibujan (TT-86). Si la semana pedida no llega, el foco
   va al encabezado de la semana más vieja.
9. **Lo cargado sobrevive** — Después de cargar más, editar la descripción de
   una entrada de una semana cargada —que revalida la página— y recargar no
   achican la ventana. La revalidación periódica de P-11 refresca la misma URL
   y tampoco.
10. **`desde` inválido** — Un `desde` que no es un día válido, o que llega
    repetido, se ignora; uno anterior a la creación del workspace se recorta a
    su semana; uno posterior al piso por omisión no achica la ventana.
11. **TT-108 y P-15, el alta** — Crear en modo manual una entrada de hace 60
    días no muestra ningún aviso: la lista se extiende hasta su semana y la
    entrada está en su día.
12. **TT-108 y P-15, mover una fila** — Mover una entrada a una semana más vieja
    que la ventana hace lo mismo, aunque la fila fuera la única de su día.
13. **`weekStart` en las vistas** — Toda vista que devuelve una action trae
    `weekStart`, el primer día de la semana de su `dayDate` según el primer día
    de la persona: `created`, `entry`, `running` y `stopped`, también el
    `stopped` de iniciar y el de continuar. `createManualEntry` y
    `updateEntryTimes` ya no devuelven `outsideWindow`.
14. **`weekStartOf`** — Devuelve el valor de la membresía de quien pide; con un
    valor fuera de rango, lanza.
15. **`lastEntryId`** — Sigue siendo la entrada cerrada más reciente que ya
    empezó y sigue dentro de la ventana.
16. **Encabezados** — Cada semana es un `h2` y cada día un `h3` dentro de ella.
17. **TT-108 y P-15, detener** — Con una entrada cerrada hoy y un timer cuyo
    inicio ya estaba cinco semanas atrás cuando se cargó la página, detenerlo
    extiende la lista hasta su semana, y la entrada detenida está en su día.
    En ese estado, `windowFrom` es la semana del timer y `reachFrom`, la del
    piso sin él.
18. **La regla única** — `weekToReach` devuelve la semana más vieja solo cuando
    es anterior a `reachFrom`, y `null` en cualquier otro caso.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                          | Qué afirma                                                                                                                                                 |
| -------- | -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | integración                | `src/modules/workspace/service.integration.test.ts`                              | el valor de una membresía nueva y los dos rechazos del `check`                                                                                             |
| 2        | integración                | `service.integration.test.ts`                                                    | el grupo de una entrada de domingo con `weekStart` 1 y con 0, y dos personas con valores distintos                                                         |
| 3        | unidad + integración + e2e | `time.test.ts`; `service.integration.test.ts`; `e2e/week-and-pagination.spec.ts` | `weekKeyLabel` con una semana que cruza el año; los rótulos y el orden; y la franja visible con su total                                                   |
| 4        | integración + e2e          | `service.integration.test.ts`; `e2e/week-and-pagination.spec.ts`                 | `closedSeconds` exacto; y el total de esta semana que sube con un timer corriendo                                                                          |
| 5        | integración                | `service.integration.test.ts`                                                    | la entrada en la semana de su inicio                                                                                                                       |
| 6        | unidad + integración       | `time.test.ts`; `service.integration.test.ts`                                    | la propiedad sobre 2026 en las tres zonas, los dos días sin mediodía y los dos días de falla conocida de §8; y el total de una semana de Madrid con cambio |
| 7        | integración                | `service.integration.test.ts`                                                    | con `now` un jueves y una entrada el lunes de la semana del piso, la entrada en la lista y en el total                                                     |
| 8        | integración + e2e          | `service.integration.test.ts`; `e2e/week-and-pagination.spec.ts`                 | `loadMoreFrom` saltando semanas vacías y `null` sin nada atrás; y el enlace, la semana y el foco                                                           |
| 9        | e2e                        | `e2e/week-and-pagination.spec.ts`                                                | la ventana igual después de una edición y de la recarga                                                                                                    |
| 10       | unidad + integración       | `schema.test.ts`; `service.integration.test.ts`                                  | `trackerSearchParams.safeParse` con un día inválido, sin `desde` y con un arreglo; y el recorte y el «no achica»                                           |
| 11       | e2e                        | `e2e/manual-entry.spec.ts`                                                       | sin aviso, la URL con `desde` y la entrada visible                                                                                                         |
| 12       | e2e                        | `e2e/entry-times.spec.ts`                                                        | lo mismo al mover la única entrada de un día                                                                                                               |
| 13       | integración                | `service.integration.test.ts`; `actions.integration.test.ts`                     | `weekStart` con lunes y con domingo en cada action de la tabla de §4.2, y la forma de los resultados                                                       |
| 14       | integración                | `src/modules/workspace/service.integration.test.ts`                              | el valor de dos membresías distintas y el rechazo                                                                                                          |
| 15       | integración                | `service.integration.test.ts`                                                    | `lastEntryId` con la ventana extendida por `desde`                                                                                                         |
| 16       | e2e                        | `e2e/week-and-pagination.spec.ts`                                                | los niveles de encabezado por rol                                                                                                                          |
| 17       | integración + e2e          | `service.integration.test.ts`; `e2e/week-and-pagination.spec.ts`                 | `windowFrom` y `reachFrom` distintos con el timer atrás, y `stopTimer` con la semana del inicio; y el recorrido 5                                          |
| 18       | unidad                     | `src/modules/time-entry/components/entry-week.test.ts`                           | anterior, igual, posterior y varias semanas                                                                                                                |

### Recorridos obligatorios de `e2e/week-and-pagination.spec.ts`

Dueño: `tests-slice5`. Precondición: el `setup` atrasa la creación del
workspace `WORKSPACE_HISTORY_DAYS` días (`backdateWorkspace`); cada recorrido
usa una persona propia.

1. Con entradas en esta semana y en la anterior, ver las dos franjas con su
   rótulo y su total, y los días como `h3` dentro de cada una (criterios 3 y
   16).
2. Arrancar un timer y ver que el total de «Esta semana» sube con el contador
   (criterio 4).
3. Con entradas de hace cinco semanas y nada en las tres del medio, «Cargar más»
   lleva directo a esa semana, el foco queda en su encabezado y el enlace
   desaparece si no hay nada más atrás (criterio 8).
4. Después de cargar más, editar la descripción de una entrada de la semana
   cargada, recargar y ver la misma ventana (criterio 9).
5. Con una entrada cerrada hoy, arrancar un timer y mover su inicio a hace
   cinco semanas con el editor del contador. **Después, `goto("/")` sin
   `desde`**, para que la página se cargue con el timer ya atrás y la URL no
   lo sostenga. Detenerlo y ver la URL con `desde` y la entrada detenida en su
   día (criterio 17). Sin el `goto`, la navegación que hizo la edición del
   inicio deja la URL con `desde` y el recorrido pasa sin probar la regla de
   detener.

## 8. Deuda conocida del slice

- **El primer día de la semana no se puede cambiar desde la aplicación** hasta
  la pantalla de equipo (PF-17). Mientras tanto, cambiarlo es la sentencia de
  §2, que no rompe nada: no mueve entradas, solo cambia dónde corta la semana
  (PF-18, PF-40).
- **La ventana no tiene tope y «Cargar más» no limita filas.** Cada render
  vuelve a leer la ventana entera que tenga la URL, y también cada refresco de
  P-11, cada 60 segundos con la pestaña visible. El límite es la historia
  propia de la persona: `getTrackerState` lee solo sus entradas, y nunca antes
  de la creación del workspace. **El umbral que obliga a paginar dentro de la
  ventana es 1 000 entradas cerradas en una ventana real**, que una persona con
  diez entradas por día hábil alcanza con unos cinco meses cargados de una vez.
  Al pasarlo se pagina dentro de la ventana, sin cambiar el ADR 0008.
- **Una entrada creada, movida o detenida muy atrás no se muestra en
  pantalla**: la ventana se extiende hasta ella, pero la persona tiene que
  bajar. Es lo que hace Clockify (P-15).
- **P-15 cuesta un segundo render**: la respuesta de la action dibuja la
  ventana de antes y el `replace`, la extendida (ADR 0008).
- **Dos bordes en que un timer cerrado puede salir de la lista sin que la
  regla de §4.3 lo vea.** Los dos se alcanzan con «Cargar más».
  - El `replayed` del ADR 0007 devuelve `stopped: null`. Un «Iniciar» o un
    «Continuar» cuya respuesta se perdió, y que se reintenta, no informa el
    timer que cerró el primer intento: si ese timer estaba antes de
    `reachFrom`, la revalidación lo saca de la lista.
  - Un timer que ya estaba antes de `reachFrom` al cargar la página y que se
    detiene **desde otra pestaña**: esta pestaña no recibe ninguna vista, y su
    próxima revalidación lo saca de la lista.
- **`startOfDayKey` lanza en los días de clase A** (§5.4), aunque esos días
  tienen un primer instante. Son dos días del año 2000; si alguna vez importan,
  se resuelve buscando el inicio desde otra hora del día.
- **`startOfDayKey` hereda una falla histórica de `startOfLocalDay`.** La
  propiedad que el test comprueba es la del criterio 6: `startOfDayKey(d)` cae
  en `d` y un milisegundo antes cae en el día anterior. En algunos días de
  zonas de Australia y de Argentina de principios de los noventa, el
  `startOfDay` de date-fns sobre un `TZDate` devuelve un instante que cae en
  `d` pero 60 minutos después del primer instante real del día, así que el
  milisegundo anterior también está en `d`. Hay dos mecanismos: un cambio de
  horario a las 00:00 y el fin del horario de verano a las 02:00 o 03:00. El
  test los fija con un caso de cada uno, `Australia/Sydney` 1990-03-04 y
  `America/Argentina/Salta` 1991-10-20, **declarados como falla conocida**:
  si una versión nueva de date-fns la corrige, el test avisa. No se fija la
  lista ni el conteo, porque dependen de los datos de zonas de cada versión de
  Node. Todos esos días son anteriores a cualquier piso: la creación del
  workspace real (2026), el de los tests de integración (2020) y el de los e2e
  (hoy menos `WORKSPACE_HISTORY_DAYS`). En 2026 no falla ningún día.
- **Que la revalidación de una action conserve `desde`** es conducta de Next: lo
  afirma el recorrido 4, que es el que se rompería si una versión nueva dejara
  de hacerlo.
- **La migración sin tiempo de caída y el relleno de las membresías existentes
  se argumentan, no se prueban**: dependen de Postgres 11 o posterior y de que
  el valor por omisión sea constante. Se miran en la revisión del SQL
  generado, contra el de §2. La ronda 2 de la revisión los verificó ejecutando
  la migración, igual que la reversión.
