# Fase 1, slice 1: el timer con una entrada sin proyecto

Contrato cerrado del primer slice vertical de la fase 1. Módulo `time-entry`,
en `src/modules/time-entry/`, pantalla `/`.

Fuente de los comportamientos: `docs/parity/time-tracker.md`, sección 11.
Decisión de arquitectura asociada: [ADR 0003, un solo timer activo por
usuario](../adr/0003-un-solo-timer-activo.md).

Decisiones del equipo que este contrato da por tomadas y no vuelve a abrir:
P-11 (el cliente revalida al enfocar la ventana y cada 60 segundos), P-12 y
P-08 (no hay duración máxima por entrada en la fase 1 y el timer abandonado se
deja correr: detener siempre funciona), P-13 (zona horaria y formatos salen del
workspace).

## 1. Alcance

Entra, de la sección 11 del documento de paridad:

TT-01, TT-02, TT-03, TT-04, TT-05, TT-17, TT-22, TT-23, TT-24, TT-27 (solo
descripción), TT-31, TT-32, TT-34, TT-35, TT-36 (queda implementado el
mecanismo de cierre más arranque; el botón «Continuar» no), TT-37, TT-38,
TT-39, TT-40, TT-41, TT-43, TT-44, TT-45, TT-46, TT-49 (descripción, horas y
duración), TT-50, TT-54 (solo descripción), TT-55, TT-60, TT-61, TT-66, TT-71,
TT-79, TT-80, TT-81, TT-85, TT-89, TT-90, TT-91, TT-92, TT-93, TT-94, TT-95,
TT-100, TT-101, TT-102, TT-103.

Queda afuera, explícito:

- Todo lo que la sección 11 ya difiere a los slices siguientes: proyecto y
  tarea (TT-06 … TT-11), etiquetas (TT-12), facturable (TT-14, TT-15), modo
  manual y el conmutador (TT-16, TT-18 … TT-21, TT-25, TT-30), atajos (TT-26),
  editar el inicio del timer activo (TT-28, TT-29, TT-75), total y encabezado
  de semana (TT-47, TT-48), paginación (TT-52), continuar y duplicar (TT-57,
  TT-58), descartar desde la barra (TT-65), selección y edición masiva
  (TT-62 … TT-64).
- **Sin «Cargar más» y sin franja de semana.** La lista trae una ventana fija
  de 14 días, más el día de inicio del timer activo si cayó antes. TT-52 llega
  con la paginación.
- **TT-91 parcial.** `requireSession()` redirige a `/login` tal como está hoy.
  Conservar la ruta de vuelta exige tocar `src/server/session.ts` y la pantalla
  de acceso, que no son de este slice. Lo que sí se cumple: el timer activo
  sobrevive a la sesión vencida y reaparece al volver a entrar.
- **Sin e2e con sesión.** No existe fixture de sesión en Playwright —el acceso
  es OAuth de Google— y montarlo es un trabajo propio. Los criterios de
  aceptación de la sección 7 se verifican con los tests de vitest y a mano
  sobre el preview. `e2e/` no se toca.
- **Sin tope de duración por entrada**, por P-12 y P-08. TT-74 y TT-107 no
  existen en este slice.
- **Sin tests de componentes con DOM.** `vitest.config.ts` corre en
  `environment: "node"` y no se modifica. La lógica de cliente que vale la pena
  probar se extrae a módulos puros.

## 2. Cambios de esquema

Una tabla nueva en `src/server/db/schema.ts`. Los instantes van en
`timestamptz`; **la duración no se almacena**, se calcula.

| Columna        | Tipo          | Reglas                                            |
| -------------- | ------------- | ------------------------------------------------- |
| `id`           | `uuid`        | PK, `defaultRandom()`                             |
| `workspace_id` | `uuid`        | not null, FK → `workspace.id` `on delete cascade` |
| `user_id`      | `text`        | not null, FK → `user.id` `on delete cascade`      |
| `description`  | `text`        | not null, `default ''`                            |
| `started_at`   | `timestamptz` | not null                                          |
| `ended_at`     | `timestamptz` | nullable; nulo = timer activo                     |
| `created_at`   | `timestamptz` | not null, `defaultNow()`                          |
| `updated_at`   | `timestamptz` | not null, `defaultNow()`, `$onUpdate`             |

Nombres de columna `started_at` y `ended_at`, no `start` y `end`: `END` es
palabra reservada en Postgres y obligaría a citarla en toda consulta cruda y en
las migraciones. Los campos Drizzle y los tipos de dominio usan `startedAt` y
`endedAt`; donde el documento de paridad dice `start` y `end`, se lee así.

`description` es `not null default ''`, no nullable: «sin descripción» (TT-50,
TT-94) tiene una sola representación, la cadena vacía, y nunca hay que decidir
entre `null` y `''` al comparar o al mostrar.

Índices y restricciones:

- `unique index time_entry_running_unq on time_entry (workspace_id, user_id) where ended_at is null`
  — el índice único parcial de TT-34. Garantiza un solo timer activo por
  usuario y hace fallar al perdedor de la carrera de TT-37. Ver el ADR 0003.
- `index time_entry_workspace_user_started_idx on time_entry (workspace_id, user_id, started_at desc)`
  — la consulta de la ventana de 14 días y la de «¿tiene alguna entrada?» de
  TT-85.
- `check time_entry_end_after_start: ended_at is null or ended_at >= started_at`
  — red de seguridad de TT-81. Es `>=` y no `>` porque TT-101 admite una
  entrada de duración cero.
- `check time_entry_description_len: char_length(description) <= 3000` —
  TT-05 y TT-71, en la base además de en Zod.

Migración generada con `npm run db:generate`: queda `drizzle/0001_*.sql` con su
snapshot. No se toca ninguna tabla existente.

## 3. Acciones de permisos nuevas

En `src/server/permissions/index.ts`, cuatro entradas a la unión `Action`:

```ts
| "timeEntry.own.view"
| "timeEntry.own.create"
| "timeEntry.own.update"
| "timeEntry.own.delete"
```

Un `Resource` nuevo, donde `userId` es el **dueño de la entrada**, no el actor:

```ts
| { readonly kind: "timeEntry"; readonly workspaceId: string; readonly userId: string }
```

Filas de `allowedRoles`: las cuatro acciones con los cinco roles,
`["owner", "admin", "project_manager", "team_manager", "member"]`, por TT-66.
El filtro de `status !== "active"` que ya tiene `can()` cubre TT-92 sin nada
nuevo.

Y una regla nueva dentro de `can()`, al lado de la del owner:

```ts
// Las acciones ".own" son sobre entradas propias. Las entradas ajenas son del
// reporte detallado, que decide con sus propias acciones.
if (resource.kind === "timeEntry" && resource.userId !== actor.userId) {
  return false;
}
```

Con eso TT-79 lo resuelve `can()` y no una comprobación suelta en el service.
Ninguna decisión de acceso vive fuera de este archivo.

Casos nuevos en `src/server/permissions/permissions.test.ts`: los cinco roles
pueden las cuatro acciones sobre una entrada propia; ninguno puede sobre una
entrada ajena del mismo workspace; una membresía `inactive` o `invited` no
puede ninguna.

## 4. Contrato de las server actions

Todas en `src/modules/time-entry/actions.ts`, con `"use server"`. Todas siguen
el recorrido de `CLAUDE.md`: `requireSession()` → Zod → `assertCan()` → service
(transacción más `recordAudit`) → `revalidatePath("/")` → resultado tipado.

Resultado y errores, declarados en `src/modules/time-entry/schema.ts`:

```ts
export type TimeEntryErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "already_stopped"
  | "unexpected";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: TimeEntryErrorCode; readonly message: string };
```

Un mensaje por código:

| Código            | Mensaje                                                          | Origen         |
| ----------------- | ---------------------------------------------------------------- | -------------- |
| `validation`      | el del issue de Zod, p. ej. «La descripción no puede superar los 3000 caracteres.» | TT-71          |
| `not_found`       | «Esa entrada ya no existe.»                                      | TT-80, TT-103  |
| `forbidden`       | «No tenés permiso para editar esta entrada.»                     | TT-79, TT-92   |
| `already_stopped` | «Este timer ya había sido detenido.»                             | TT-41          |
| `unexpected`      | «No se pudo guardar. Revisá la conexión y volvé a intentar.»     | TT-89, TT-90   |

El service lanza `TimeEntryError` con `code`, y el `ForbiddenError` que ya
existe; la action traduce. No se lanzan strings.

**Regla transversal: toda action revalida `/`, también cuando devuelve error de
dominio.** Es lo que hace que la pestaña desactualizada de TT-41 y TT-103 se
resincronice con el estado real sin que el resultado tenga que cargar el estado
completo.

### `startTimer` — TT-22, TT-24, TT-35, TT-37

```ts
startTimerInput = z.object({
  description: z
    .string()
    .trim()
    .max(3000, "La descripción no puede superar los 3000 caracteres.")
    .default(""),
});
```

`started_at` es el instante del **servidor**, no uno que mande el cliente: así
el desfase de reloj de TT-32 no entra nunca a la base.

Resultado: `ActionResult<{ running: TimeEntryView; stopped: TimeEntryView | null }>`.
`stopped` es la entrada que estaba corriendo y se cerró en el mismo instante
(TT-35), o `null`. En la carrera de TT-37 el resultado es `ok: true` con el
timer que sobrevivió y `stopped: null`.

Errores posibles: `validation`, `forbidden`, `unexpected`.
Permiso: `timeEntry.own.create`. Revalida `/`.

### `stopTimer` — TT-23, TT-41, TT-103

```ts
stopTimerInput = z.object({ id: z.uuid() });
```

Se detiene **por id** y no «lo que esté corriendo»: es lo que permite
distinguir los tres desenlaces de una pestaña desactualizada.

Resultado: `ActionResult<{ stopped: TimeEntryView }>`.

Errores posibles: `not_found` (la entrada no existe, TT-103),
`already_stopped` (existe y ya tiene `ended_at`, TT-41), `forbidden`,
`unexpected`. Permiso: `timeEntry.own.update`. Revalida `/`.

### `updateDescription` — TT-04, TT-27, TT-54, TT-55

```ts
updateDescriptionInput = z.object({
  id: z.uuid(),
  description: z
    .string()
    .trim()
    .max(3000, "La descripción no puede superar los 3000 caracteres."),
});
```

Vale igual sobre la entrada abierta y sobre una cerrada.

Resultado: `ActionResult<{ entry: TimeEntryView }>`.

Errores posibles: `validation`, `not_found`, `forbidden`, `unexpected`.
Permiso: `timeEntry.own.update`. Revalida `/`.

### `deleteEntry` — TT-60, TT-61

```ts
deleteEntryInput = z.object({ id: z.uuid() });
```

Borrado físico, sin deshacer (TT-61). Borra también una entrada abierta, aunque
el botón de la barra para hacerlo —TT-65, «Descartar»— no es de este slice.

Resultado: `ActionResult<{ id: string }>`.

Errores posibles: `not_found`, `forbidden`, `unexpected`.
Permiso: `timeEntry.own.delete`. Revalida `/`.

### Cómo se distinguen TT-79 y TT-80

El repository busca la entrada filtrando por `workspace_id` de la sesión y
**no** por `user_id`. Si no aparece, `not_found`. Si aparece, se arma el
`Resource` con el `user_id` de la fila y se llama a `can()`; si da falso,
`forbidden`. Esto admite que un miembro del workspace sepa que un id existe
aunque no sea suyo; es aceptable entre colegas del mismo workspace y es lo que
la tabla de la sección 7 del documento de paridad pide al tener dos mensajes
distintos.

## 5. Contrato de lectura

Una sola función en `src/modules/time-entry/service.ts`, llamada desde el
Server Component:

```ts
getTrackerState(actor: Actor, timeZone: string, now?: Date): Promise<TrackerState>;
```

`now` existe solo para los tests. La función no importa `@/server/session`: la
página le pasa `session.actor` y `session.workspace.timezone` (TT-02, P-13).

Esquemas de salida, en `src/modules/time-entry/schema.ts`, con su tipo
inferido. **Todo lo que depende de zona horaria o de formato se calcula en el
servidor**; el cliente solo hace la cuenta del transcurrido.

```ts
timeEntryView = z.object({
  id: z.uuid(),
  description: z.string(),                 // "" = sin descripción (TT-50)
  startedAt: z.iso.datetime(),             // ISO UTC
  endedAt: z.iso.datetime().nullable(),    // null = corriendo
  dayDate: z.string(),                     // "2026-10-02", día local del inicio (TT-43, TT-100)
  startLabel: z.string(),                  // "08:00", 24 h (TT-02)
  endLabel: z.string().nullable(),         // "02:00" | null
  extraDays: z.number().int().min(0),      // superíndice de cruce de medianoche (TT-51, TT-95)
  durationMinutes: z.number().int().min(0).nullable(), // null si corre
  durationLabel: z.string().nullable(),    // "1:30" (TT-101: 0 min ⇒ "0:00")
});

dayGroupView = z.object({
  date: z.string(),                        // "2026-10-02"
  label: z.string(),                       // "Hoy" | "Ayer" | "mié, 01/10" | "mié, 01/10/2025" (TT-44)
  isRunningDay: z.boolean(),               // el cliente suma acá el transcurrido (TT-46)
  closedMinutes: z.number().int().min(0),  // suma de las entradas cerradas del grupo
  closedTotalLabel: z.string(),            // "7:45" (TT-45)
  entries: z.array(timeEntryView),         // cerradas, de la más reciente a la más vieja
});

trackerState = z.object({
  serverNow: z.iso.datetime(),             // TT-32: el cliente cuenta sobre este desfase
  timeZone: z.string(),
  canTrack: z.boolean(),                   // can(actor, "timeEntry.own.create", …) — TT-92
  running: timeEntryView.nullable(),       // endedAt siempre null por construcción (TT-38, TT-39)
  days: z.array(dayGroupView),
  hasAnyEntry: z.boolean(),                // TT-85: ni entradas ni timer
});
```

Reglas de armado:

- Solo entradas con el `workspace_id` de la sesión y el `user_id` del actor
  (TT-01).
- Ventana: entradas cerradas cuyo `started_at` cae en
  `[inicio del día local de hoy − 13 días, ahora)`. Constante
  `TRACKER_WINDOW_DAYS = 14`, exportada del módulo.
- La entrada abierta **no** aparece en `days`: vive en `running` y la dibuja la
  barra.
- Los grupos se ordenan del más reciente al más viejo y **los días sin entradas
  no se dibujan** (TT-86). Única excepción: si hay timer activo, siempre existe
  el grupo de `running.dayDate`, aunque esté vacío y aunque quede fuera de la
  ventana de 14 días, para que el cliente tenga dónde sumar el transcurrido
  (TT-42, y TT-95 con un timer que arrancó otro día).
- `closedMinutes` suma solo las entradas cerradas. El transcurrido del timer
  activo lo suma el cliente sobre el grupo con `isRunningDay`, porque cambia
  cada segundo (TT-46).
- La duración se calcula con `durationMinutes` de `src/server/time`, sobre
  instantes UTC (TT-97).

Lo que se agrega a `src/server/time/index.ts`, porque la convención manda que
fechas, zonas horarias y duraciones pasen solo por ahí:

```ts
dayKey(instant: Date, timeZone: string): string;              // "2026-10-02"
dayLabel(instant: Date, now: Date, timeZone: string): string; // "Hoy" | "Ayer" | "mié, 01/10" | con año
formatClock(instant: Date, timeZone: string): string;         // "08:00"
extraDays(start: Date, end: Date, timeZone: string): number;  // TT-51
formatElapsed(seconds: number): string;                       // "h:mm:ss" para el contador (TT-17)
```

`formatElapsed` es puro y sin dependencias de servidor: lo importa también el
componente cliente del contador.

## 6. Reparto de archivos

Las dos listas son disjuntas. Rutas absolutas.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/0001_time_entry.sql          (generado; el nombre lo pone drizzle-kit)
/home/maxi/program/clock/drizzle/meta/                        (snapshot y journal, generados)
/home/maxi/program/clock/src/server/permissions/index.ts
/home/maxi/program/clock/src/server/permissions/permissions.test.ts
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/actions.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.test.ts
```

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/page.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/elapsed-counter.tsx
/home/maxi/program/clock/src/modules/time-entry/components/elapsed.ts
/home/maxi/program/clock/src/modules/time-entry/components/elapsed.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/description-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/delete-entry-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-empty.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-feedback.tsx
/home/maxi/program/clock/src/modules/time-entry/components/use-tracker-refresh.ts
/home/maxi/program/clock/src/modules/time-entry/components/use-entry-action.ts
/home/maxi/program/clock/src/components/ui/input.tsx
/home/maxi/program/clock/src/components/ui/dialog.tsx
/home/maxi/program/clock/src/components/ui/alert.tsx
```

Nadie toca `src/server/session.ts`, `src/app/(app)/layout.tsx`,
`src/components/layout/`, `vitest.config.ts`, `playwright.config.ts` ni `e2e/`.

### Handshake de orden

El primer commit de `backend-dev` es `src/modules/time-entry/schema.ts` con los
esquemas Zod, los tipos de salida y los códigos de error, más las cinco
funciones nuevas de `src/server/time/index.ts` y las firmas de `service.ts` y
`actions.ts`. Con eso `frontend-dev` compila desde el minuto cero contra los
tipos definitivos. Las listas de arriba ya reflejan que `frontend-dev`
**importa** de `schema.ts`, `service.ts` y `actions.ts` pero no los edita.

### Responsabilidades que no se leen en el nombre del archivo

- `use-tracker-refresh.ts` implementa P-11: `router.refresh()` al recuperar el
  foco de la ventana y cada 60 segundos mientras el documento está visible
  (TT-40).
- `elapsed.ts` tiene la única cuenta del cliente: a partir de `serverNow`, del
  `Date.now()` del momento de montaje y de `startedAt`, devuelve los segundos
  transcurridos corrigiendo el desfase de reloj (TT-32), y se formatea con
  `formatElapsed`. Es puro y tiene test.
- `description-field.tsx` cubre TT-04: con el timer corriendo guarda con rebote
  de 500 ms mientras se escribe, y además al perder el foco y con Enter; sin
  timer corriendo el texto es estado local de la barra hasta que se toca
  «Iniciar», porque no hay entrada donde guardarlo. No muestra estado de
  guardado salvo que falle.

## 7. Criterios de aceptación

Uno por comportamiento del slice. Son observables desde afuera.

1. **TT-22, TT-24** — Con la barra vacía, tocar «Iniciar» crea una entrada con
   `started_at` en ese instante y `ended_at` nulo, y el botón pasa a «Detener»
   en rojo.
2. **TT-17, TT-31** — Con el timer parado el contador muestra `0:00:00`;
   corriendo, avanza en `h:mm:ss` una vez por segundo sin ninguna petición al
   servidor.
3. **TT-32** — Con el reloj de la máquina adelantado o atrasado varios minutos,
   el contador muestra el transcurrido real medido desde `serverNow`, y al
   detener no hay salto entre lo que mostraba y la duración guardada.
4. **TT-23, TT-101** — «Detener» escribe `ended_at` con el instante del clic y
   la entrada aparece en el grupo del día de su `started_at`. Detener en el
   mismo minuto en que se arrancó guarda la entrada y la lista la muestra como
   `0:00`.
5. **TT-03, TT-05, TT-71** — El campo acepta texto libre con el marcador
   «¿En qué estás trabajando?»; más de 3000 caracteres se rechazan con «La
   descripción no puede superar los 3000 caracteres.» y nada se guarda.
6. **TT-04, TT-27** — Con el timer corriendo, escribir en la descripción la
   guarda sobre la entrada abierta 500 ms después de dejar de escribir, y
   también al salir del campo o con Enter, sin detener el timer y sin mostrar
   estado de guardado.
7. **TT-34, TT-35** — Con un timer corriendo, tocar «Iniciar» deja exactamente
   una fila con `ended_at` nulo; el `ended_at` de la vieja y el `started_at` de
   la nueva son el mismo valor, y la vieja aparece en la lista.
8. **TT-37, TT-102** — Dos arranques simultáneos del mismo usuario dejan un
   solo timer activo; las dos pestañas terminan mostrando ese mismo timer y
   ninguna muestra un error.
9. **TT-38** — Recargar con el timer corriendo dibuja la barra ya con la
   descripción y el contador en el valor correcto, sin pasar por `0:00:00`.
10. **TT-39, TT-40** — Un segundo dispositivo muestra el mismo timer con el
    mismo transcurrido. Si el primero lo detiene, el segundo se pone al día al
    recuperar el foco, y en todo caso dentro de los 60 segundos.
11. **TT-41** — «Detener» sobre una entrada ya cerrada no vuelve a escribir
    `ended_at`, muestra «Este timer ya había sido detenido.» y la lista queda
    con el estado real.
12. **TT-103** — «Detener» sobre una entrada borrada desde otra pestaña deja la
    barra vacía y muestra «Esa entrada ya no existe.»
13. **TT-43, TT-100** — Las entradas se agrupan por el día local de su
    `started_at`, de la más reciente a la más vieja. Una entrada que arranca a
    las 00:00 cae en el día que empieza.
14. **TT-44** — Los encabezados dicen «Hoy», «Ayer» y, para el resto,
    `mié, 01/10`, con el año cuando el día cae fuera del año en curso.
15. **TT-45, TT-46** — Cada grupo muestra «Total» con la suma en `h:mm`. El
    total del día del timer activo incluye el transcurrido y sube junto con el
    contador.
16. **TT-49, TT-50, TT-93, TT-94** — Cada fila muestra descripción, hora de
    inicio, hora de fin y duración. Sin descripción muestra «Sin descripción»
    en gris, y sin proyecto «Sin proyecto» en gris; la fila sigue siendo normal
    y suma al total.
17. **TT-51, TT-95** — Una entrada que cruza la medianoche queda entera en el
    grupo de su día de inicio, suma entera a ese total, y su hora de fin lleva
    el superíndice con la cantidad de días.
18. **TT-54, TT-55** — Hacer clic en la descripción de una fila la vuelve
    editable; se guarda al perder el foco o con Enter y `Esc` descarta.
    Mientras la escritura está en vuelo la fila queda atenuada; si falla, el
    valor vuelve al anterior y aparece el error con el nombre del campo.
19. **TT-60, TT-61** — «Borrar» del menú de tres puntos pide confirmación en un
    diálogo; al confirmar, la fila desaparece y los totales se recalculan. No
    hay deshacer.
20. **TT-01, TT-66, TT-79** — Un usuario solo ve sus entradas. Los cinco roles
    pueden crear, editar y borrar las propias. Una action sobre la entrada de
    otra persona responde «No tenés permiso para editar esta entrada.» y no
    escribe nada.
21. **TT-80** — Una action sobre un id inexistente responde «Esa entrada ya no
    existe.» y refresca la lista.
22. **TT-81** — Una llamada al service con `end` anterior a `start` se rechaza
    con «La hora de fin tiene que ser posterior a la de inicio.», y la
    restricción de la base impide la fila aunque se intente escribir directo.
23. **TT-85** — Sin ninguna entrada y sin timer, la lista muestra «Todavía no
    cargaste horas» con «Escribí en qué estás trabajando y tocá Iniciar.»
24. **TT-89, TT-90** — Con la red caída, «Iniciar», «Detener» y el guardado de
    la descripción devuelven el control a su estado anterior y muestran «No se
    pudo guardar. Revisá la conexión y volvé a intentar.» con «Reintentar».
25. **TT-91** — Con la sesión vencida, la pantalla lleva al acceso; al volver a
    entrar, el timer que estaba corriendo sigue abierto y la barra lo retoma.
26. **TT-92** — Con la membresía desactivada, la pantalla queda en solo lectura
    con un aviso y toda action responde 403.
27. **TT-02, TT-106** — Las horas se muestran en 24 h y las fechas como
    `dd/MM`, resueltas con la zona horaria del workspace; cambiarla recalcula
    los grupos sin tocar ningún instante guardado.
28. **TT-42** — Un timer que lleva más de 24 horas sigue corriendo, se muestra
    en el grupo de su día de inicio y se puede detener sin error.
