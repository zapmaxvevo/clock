# Fase 1, slice 8: calendario (lectura)

Contrato del octavo slice vertical de la fase 1. Módulo `time-entry`, en
`src/modules/time-entry/`, pantalla nueva `/calendario`.

**El calendario se entrega en tres slices**, cada uno desplegable solo:

- **8, este contrato: la lectura.** La pantalla entera sin escribir: vistas,
  navegación, bloques, totales, línea de ahora, timer activo, zoom, detalle y
  el diálogo de una entrada **en solo lectura**, así cada bloque es un botón con
  destino.
- **8c: la escritura**,
  [`fase1-slice8c-calendario-escritura.md`](fase1-slice8c-calendario-escritura.md):
  `updateEntry` (ADR 0013), P-01, crear, editar, detener, duplicar y borrar
  desde el calendario. Arranca con el 8 en `main`.
- **8b: el arrastre**, esbozo en §8 del contrato del 8c. Va después del 8c.

Fuente de los comportamientos: `docs/parity/calendario.md` (CAL-01 a CAL-100),
escrito el 2026-10-02, antes de los slices 6, 7, 9 y 10; este contrato lo
contrasta con el árbol y corrige lo que quedó viejo (§0). Lugar en el plan:
[mapa de la fase 1](fase1-mapa.md), «Slice 8 — Calendario». Revisión:
[ronda 1 de `architecture-reviewer`](correcciones-fase1-slice8.md). Decisiones
de arquitectura asociadas:

- [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
  el calendario vive en `time-entry` (§1, «Dónde vive»).
- [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): la zona se resuelve en
  el servidor; el cliente formatea con las mismas funciones y no convierte
  instantes.
- [ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md): un
  parámetro repetido llega como arreglo y no pasa el esquema.
- [ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md),
  aceptado: es del 8c; este slice no lo construye.

Decisiones del usuario del 2026-10-04 sobre la paridad: calendario P-04
(«Guardar» todo o nada, con botón), P-01 (crear desde la grilla con un timer
corriendo **se permite**), P-02 (la entrada que cruza la medianoche suma entera
en el día de inicio) y P-06 («Detener» en el diálogo del timer). De esas, este
slice construye P-02; las otras tres son del 8c. P-03 y P-05 quedan fuera de los
dos. Perfil P-02 se resuelve en §1.

Decisiones del equipo que da por tomadas: fechas futuras aceptadas (P-10), sin
canal abierto y con revalidación periódica (TT-40, P-11).

## Decisiones del usuario sobre este contrato

Resueltas el 2026-10-04:

1. **ADR 0013 aceptado.** `updateEntry` es del 8c.
2. **P-01 sin excepción por origen.** El servidor deja de rechazar el alta
   manual con un timer abierto, y TT-30 queda en la interfaz del rastreador. Es
   del 8c.
3. **El arrastre va en el 8b.** El corte 8/8b quedó aprobado. En la ronda 1 de
   la revisión el team-lead partió además la lectura de la escritura: el 8 lee,
   el 8c escribe, y el 8b va después del 8c.
4. **«Detener» queda inactivo con cambios sin guardar**, con «Guardá los cambios
   antes de detener el timer.». Es del 8c.
5. **Las 08:00 de CAL-14 son una constante** del cliente, no una preferencia
   (§1, «Perfil P-02 y CAL-14»).

## 0. Precondición de arranque

**El slice 8 se escribe para el árbol con los slices 1 a 7, 9 y 10 en `main`**
(`dd78cd5`, rama `fase1/slice-8-calendario`). El mapa dice «depende de 3, 5 y
7»; para la lectura no alcanza:

- **Del 3**: `editableTimes`, `startClock` y `endClock` en la vista, que el
  bloque y los segmentos usan.
- **Del 5**: el primer día de la semana de la persona y `weekKeyLabel`.
- **Del 6**: `useDialogReturnFocus`.
- **Del 7**: zona y formatos de la persona (`TrackerWorkspace`,
  `useDisplayFormats`, `clockLabel`, `dayKeyLabel`).
- **Del 9 y el 10**: el proyecto y la tarea en la vista, su color de paleta,
  `ProjectPicker` con `readOnly` y `TrackingCatalogProvider`.

**Lo que `calendario.md` da por cierto y el árbol ya no:**

- **§18** («el slice 8 va antes del núcleo de proyectos»): el 10 está en `main`.
  El color del proyecto, y el proyecto y la tarea en el bloque, en el detalle y
  en el diálogo entran en este slice (CAL-21, CAL-22, CAL-23, CAL-66).
- **§19**: `editableTimes`, `startClock` y `endClock` ya viajan en la vista; el
  esquema de la base no cambia. Lo que §19 dice de las mutaciones es del 8c.

**Supuestos sobre el árbol**, con archivo y línea en `dd78cd5`:

| Supuesto                                                                                                                          | Dónde                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `TrackerWorkspace = TimeSettings & { createdAt }` y `trackerWorkspaceOf(context)`                                                 | `service.ts:93`, `:96`                                     |
| `workspaceFloorDayKey(workspace)`, el día de creación en la zona de la persona                                                    | `service.ts:106`                                           |
| `toView(row: EntryWithRefs, workspace)` arma `dayDate`, `startClock`, `endClock`, `extraDays`, `editableTimes`, `project`, `task` | `service.ts:158-182`                                       |
| `getTrackerState` lee en una transacción `repeatable read`                                                                        | `service.ts:1439-1507`                                     |
| `listClosedBetween` filtra por inicio en `[from, to)`; `selectWithRefs` arma el join con proyecto y tarea                         | `repository.ts:289-307`, `:86-107`                         |
| Índice `time_entry_workspace_user_started_idx` sobre `(workspace_id, user_id, started_at desc)`                                   | `src/server/db/schema.ts:376-380`                          |
| `dayKeyInput`; `trackerSearchParams` con `z.object` y `safeParse`                                                                 | `schema.ts:91`, `:100`                                     |
| `clockToMinutes` y `minutesToClock` son privadas; `dayKeyLabel` arma «Hoy», «Ayer» o «mié, 01/10»                                 | `src/server/time/index.ts:337`, `:347`, `:232-254`         |
| `startOfDayKey` lanza `RangeError` con un día sin las 00:00 ni el mediodía                                                        | `src/server/time/index.ts:296-306`                         |
| `error.tsx` recibe `retry`, estable desde Next 16.3 (el árbol tiene 16.3.8)                                                       | `node_modules/next/dist/docs/…/error.md:117-153`           |
| `DateField` exige `minDayKey` y arma la fecha civil con una función local                                                         | `date-field.tsx:24`, `:53-56`                              |
| El texto del superíndice de más de un día es una función local de la fila                                                         | `entry-row.tsx:92-96`                                      |
| `ProjectPicker` llama a `useTrackingCatalog` antes de mirar `readOnly`, y con `readOnly` dibuja el punto y el nombre              | `project-picker.tsx:97`, `:101-107`                        |
| `selectionOf(entry)` arma la selección del selector desde la vista                                                                | `entry-project.ts:21`                                      |
| `useDialogReturnFocus` mueve el foco a mano: Base UI enfoca el primer tabulable del destino de `finalFocus`                       | `use-dialog-return-focus.ts:18-53`                         |
| `useElapsedSeconds(startedAt, serverNow)` y `useGroupTotalLabel`; el tipo `GroupTotal` no se exporta                              | `elapsed-counter.tsx:25`, `use-group-total.ts:8-18`, `:26` |
| `ElapsedCounter` dibuja el transcurrido con `role="timer"`                                                                        | `elapsed-counter.tsx:70`                                   |
| `useTrackerRefresh` revalida al enfocar, al volver a ser visible y cada 60 s                                                      | `use-tracker-refresh.ts:14-35`                             |
| `TrackerScreen`: `<h1 className="sr-only">`, el aviso de TT-92 escrito adentro y los formatos de la misma lectura                 | `tracker-screen.tsx:44`, `:46-55`, `:57-59`                |
| La navegación tiene «Inicio» y «Proyectos»                                                                                        | `src/components/layout/app-nav.tsx:9-12`                   |
| Sin sesión, `requireSession` lleva a `/login`, y el acceso vuelve siempre a `/`                                                   | `src/server/session.ts:57`; `google-sign-in-button.tsx:15` |
| Cada test e2e abre su sesión; `openSecondTab` abre otra en un contexto nuevo                                                      | `e2e/session.ts:45-53`; `e2e/network.ts:38-48`             |
| `e2e/database.ts` escribe solo lo que la interfaz no puede producir                                                               | `e2e/database.ts:1-5`                                      |

**El paso 0 del handshake (§6)** es la ronda ordinaria de
`architecture-reviewer`: el contrato se escribe sobre el árbol actual. La ronda 1
está aplicada ([correcciones](correcciones-fase1-slice8.md)).

## 1. Alcance

Entra, con los identificadores de `calendario.md`:

- **Pantalla y acceso**: CAL-01, CAL-02, CAL-04, CAL-05 (la grilla en solo
  lectura y el aviso de TT-92; los controles de escritura son del 8c).
- **Vistas y grilla**: CAL-06, CAL-07, CAL-09, CAL-10, CAL-11, CAL-12, CAL-14.
- **Navegación**: CAL-15 a CAL-19.
- **Cómo se dibuja una entrada**: CAL-20 a CAL-30, el dibujo.
- **Totales**: CAL-31 a CAL-34.
- **Línea de ahora**: CAL-35 a CAL-37.
- **El timer activo**: CAL-38, y CAL-41 en su primera oración (la grilla se pone
  al día con la revalidación).
- **Crear**: CAL-48 en su atenuado. El clic sin efecto es del 8c.
- **El diálogo**: CAL-65 y CAL-66 en solo lectura.
- **Teclado y accesibilidad**: CAL-74 (cada bloque es un botón que abre su
  diálogo), CAL-75 a CAL-78.
- **Estados**: CAL-84, CAL-85, CAL-86 (sesión vencida, **sin la ruta de
  vuelta**, y membresía desactivada), CAL-87, CAL-88, CAL-89 en su primera
  oración.
- **Casos borde**: CAL-90 y CAL-92 en su dibujo, CAL-91, CAL-93 a CAL-96.

Entra por arrastre, verificándose por el camino nuevo: **TT-92**, una membresía
desactivada ve la grilla con el aviso permanente.

### Dónde vive

**El calendario es una segunda pantalla del módulo `time-entry`**, no un módulo
propio. Su lectura es `getCalendarState` en `time-entry/service.ts`, sus
componentes van en `time-entry/components/calendar/`, y en el 8c sus mutaciones
son las del módulo. Un módulo `calendar` no tendría tablas propias: leería
`time_entry` desde su repository, que el ADR 0010 reserva para lo que se muestra
de otro módulo con un join, o llamaría al service de `time-entry` para mostrar,
que el ADR 0010 no permite. Y repetiría `toView`, que es donde se resuelve todo
lo que depende de la zona. El subdirectorio separa los archivos del rastreador
de los del calendario sin cambiar la regla de capas.

### Qué pieza de lectura depende de algo de escritura

- **El diálogo**: en el 8 es de solo lectura para todos, el mismo que el 8c deja
  para la membresía desactivada (TT-92). Va acá para que el bloque sea un botón
  con destino desde el primer despliegue.
- **El catálogo del selector**: el proyecto del diálogo de solo lectura es
  `ProjectPicker` con `readOnly`, el camino de TT-92 de la fila
  (`entry-row.tsx:265`), y `ProjectPicker` pide `useTrackingCatalog` antes de
  mirar `readOnly`. `getTrackingCatalog` y `TrackingCatalogProvider` van en el 8.
- **La región de la pantalla**, `<section aria-label="Calendario"
tabIndex={-1}>`: en el 8 es el destino del foco cuando el bloque que abrió el
  diálogo ya no está; en el 8c gana el lugar de los avisos.
- **La revalidación desde las actions**: queda en el 8c. En el 8 el calendario
  no escribe; una pestaña con el calendario abierto se pone al día con
  `useTrackerRefresh`, y entrar al calendario es una navegación a una ruta
  dinámica que se pide entera. Volver con «Atrás» puede mostrar la copia del
  router hasta la próxima revalidación, a lo sumo 60 s (P-11).
- **`minDayKey`, `ActionFeedback` sin `message`, los textos de los avisos y
  `entry-dialog-draft.ts`**: los usa solo la escritura. Van en el 8c.

### Lo que el slice decide y que la paridad tiene que registrar

- **P-02 cerrado, CAL-32 como estaba.** La entrada suma entera en el día de
  inicio; la columna siguiente dibuja horas que su total no cuenta.
- **Perfil P-02 y CAL-14.** La grilla abre con la línea de ahora una hora por
  debajo del borde superior si el período contiene hoy, y con las 08:00 arriba
  si no. Las 08:00 son una constante (decisión del usuario). PF-15 sigue `fuera
de alcance`; perfil P-02 pasa a depender de la respuesta de CAL-14 en
  calendario P-07. Si resulta ser esa hora, se cambia solo la constante por la
  preferencia.
- **CAL-11.** El zoom son dos botones, «Acercar» y «Alejar», en la esquina
  superior izquierda, con el tamaño de franja a la vista.
- **CAL-17.** La URL no se reescribe: `?semana=` con un día que no es inicio de
  semana se interpreta como la semana que lo contiene, y los enlaces de la
  pantalla siempre llevan el inicio normalizado. Un día cuyo período no se puede
  navegar se trata como inválido y lleva al período actual: el anterior o el
  siguiente quedan fuera de los años de cuatro cifras, o algún día del período
  falta entero en la zona (`Pacific/Apia`, 2011-12-30).
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
- **CAL-65 y CAL-66 en el 8.** El diálogo de una entrada es de solo lectura:
  título «Entrada», o «Timer en curso» para la que corre; los campos como texto
  y solo «Cerrar». Decisión nuestra para el primer despliegue; en el 8c el
  título «Entrada» queda para la membresía desactivada.
- **CAL-75.** El nombre accesible suma el proyecto y la tarea cuando los hay.
- **CAL-86.** Entra **sin la ruta de vuelta**: con la sesión vencida,
  `requireSession` lleva a `/login` y el acceso vuelve a `/`
  (`session.ts:57`, `google-sign-in-button.tsx:15`), como en el resto de la
  aplicación. Los avisos de dos partes de TT-89 y TT-90 son del 8c, que es el
  que tiene actions.
- **CAL-87.** `/calendario` tiene su `error.tsx`, con «No se pudo cargar el
  calendario.» y «Reintentar».
- **El corte 8/8c/8b.** CAL-40, CAL-41 en su segunda oración, CAL-43, CAL-45 a
  CAL-47, el clic sin efecto de CAL-48, CAL-49, CAL-58 en su parte de diálogo,
  CAL-65 a CAL-70 editables, CAL-72, el botón «Agregar entrada» de CAL-74, los
  avisos de CAL-86, CAL-92 por el diálogo y CAL-97 a CAL-99 son del 8c. CAL-44,
  CAL-50 a CAL-57, CAL-59 a CAL-64, la segunda oración de CAL-89, el «ni soltar»
  de CAL-30 y CAL-48, las asas de CAL-58, CAL-90 «se estira» y CAL-100 son del
  8b.

**Lo registra `parity-analyst` antes del merge** (§6), con la sección «Slice 8»
y la lista «Lo que queda» en `calendario.md`.

### Queda afuera

- **La escritura**: slice 8c.
- **Los gestos de arrastre**: slice 8b.
- **P-03** (asa del inicio del timer) y **P-05** (días laborables, CAL-13).
- **Lo `fuera de alcance` de `calendario.md`**: CAL-03, CAL-08, CAL-42, CAL-71,
  CAL-73, CAL-79 a CAL-83.
- **La ruta de vuelta después del acceso** (TT-91, CAL-86): no existe en
  ninguna pantalla.

### Consecuencias sobre código ya entregado

| Archivo                                    | Qué cambia                                                                                                                                       | Qué hay que volver a probar                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `src/server/time/index.ts`                 | Exporta `clockToMinutes` y `minutesToClock`; suma `weekdayLabel` y `nonexistentMinutes`; `dayKeyLabel` usa `weekdayLabel` sin cambiar su salida. | `time.test.ts` entero                      |
| `time-entry/schema.ts`                     | Los parámetros y el estado del calendario.                                                                                                       | `schema.test.ts` entero                    |
| `time-entry/service.ts`                    | `getCalendarState` nueva.                                                                                                                        | —                                          |
| `time-entry/repository.ts`                 | `listClosedOverlapping` nueva.                                                                                                                   | —                                          |
| `src/components/layout/app-nav.tsx`        | Suma «Calendario» después de «Inicio».                                                                                                           | `e2e/profile.spec.ts` (`goToTrackerByNav`) |
| `time-entry/components/date-field.tsx`     | La fecha civil sale de `civil-date.ts`, que comparte con el selector del rango.                                                                  | TT-18, TT-56, el diálogo de la masiva      |
| `time-entry/components/tracker-screen.tsx` | El aviso de TT-92 pasa a `InactiveMembershipNotice`, que comparte con el calendario.                                                             | `tracker.spec.ts`                          |
| `time-entry/components/labels.ts`          | Suma `extraDaysText`, movida de `entry-row.tsx:92-96` sin cambios: la usan la fila, el bloque y el diálogo.                                      | TT-51 en la fila                           |
| `time-entry/components/entry-row.tsx`      | Importa `extraDaysText` de `labels.ts`.                                                                                                          | TT-51 en la fila                           |
| `time-entry/components/use-group-total.ts` | Exporta el tipo `GroupTotal`, sin otro cambio.                                                                                                   | —                                          |

**Ninguna afirmación de un test existente cambia.** Las actions, sus tests y la
auditoría no se tocan.

## 2. Cambios de esquema

**Ninguno.** La lectura nueva usa `time_entry_workspace_user_started_idx` para
la cota superior (`started_at < to`) y filtra la inferior (`ended_at > from`).
Sin duración máxima (TT-74) no hay cota inferior para el inicio que se pueda
usar en ese índice, así que **en cualquier período, también el actual, la
consulta recorre toda la historia de la persona anterior a `to`**. El costo, su
umbral y las dos salidas están en §8.

## 3. Acciones de permisos nuevas

**Ninguna.** La unión `Action` de `src/server/permissions` no cambia.

| Operación del calendario | Acción de `can()`                          | Recurso                       |
| ------------------------ | ------------------------------------------ | ----------------------------- |
| Ver la grilla            | ninguna: se leen solo las propias (CAL-02) | —                             |
| El aviso de TT-92        | `timeEntry.own.create`, como `canTrack`    | `ownTimeEntryResource(actor)` |

## 4. Contrato de las server actions

**Ninguna action nueva ni cambiada.** Las mutaciones del calendario son del 8c.

## 5. Contrato de lectura y pantalla

### 5.1 `getCalendarState`

```ts
// src/modules/time-entry/schema.ts

/** Los parámetros de `/calendario` (CAL-17), cada uno con su `safeParse`. */
export const calendarWeekParams = z.object({ semana: dayKeyInput });
export const calendarModeParams = z.object({ vista: z.literal("dia") });

export const CALENDAR_MODES = ["week", "day"] as const;
/** La vista de la grilla. No se llama `CalendarView`, que es el componente. */
export type CalendarMode = (typeof CALENDAR_MODES)[number];

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
  /** Anterior a la creación del workspace: atenuado (CAL-48). */
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
  canTrack: z.boolean(),
  mode: z.enum(CALENDAR_MODES),
  /** Primer día del período, ya normalizado. */
  periodStart: z.string(),
  /** «Esta semana», «Semana anterior» o el rango (TT-47); en la vista día, «Hoy», «Ayer» o el día. */
  periodLabel: z.string(),
  previousStart: z.string(),
  nextStart: z.string(),
  /** El período que contiene hoy, para «Hoy». */
  todayStart: z.string(),
  /** Lo que abren «Día» y «Semana» (§1). */
  dayModeStart: z.string(),
  weekModeStart: z.string(),
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
  readonly mode: CalendarMode;
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
- **Navegable**, las tres condiciones:
  - el inicio menos un período y el fin más un período son claves válidas
    (`parseDayKey`);
  - el instante del fin no pasa del año 9999 UTC (`isAfterYear9999`);
  - ningún día del período, ni el siguiente al último, falta entero en la zona:
    `nonexistentMinutes` no da `[{ from: 0, to: 1440 }]`. Sin esto
    `startOfDayKey` lanza (`time/index.ts:296-306`) y la página cae en
    `error.tsx` por un parámetro de la URL.

  Si alguna falla, el período es el que contiene hoy. `parseDayKey` ya rechaza
  los años anteriores al 100, así que el borde de abajo sale de la misma regla.

- `previousStart` y `nextStart` restan o suman siete días o uno.
  `todayStart` es `weekStartKey(todayKey, …)` o `todayKey`. `weekModeStart` es
  `weekStartKey(periodStart, …)`; `dayModeStart` es `todayKey` si la semana lo
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
 * minuto por minuto. Un día que falta entero da `[{ from: 0, to: 1440 }]`.
 */
export function nonexistentMinutes(
  dayKey: string,
  timeZone: string,
): readonly MinuteRange[];
```

Casos de `time.test.ts`: Madrid 2026-03-29 → `[{ from: 120, to: 180 }]`; Madrid
2026-10-25 → `[]`; Buenos Aires cualquier día → `[]`; un adelanto de 30 minutos
(`Australia/Lord_Howe`, 02:00 → 02:30), uno a la medianoche
(`America/Santiago`, 00:00 → 01:00) y un día que falta entero
(`Pacific/Apia`, 2011-12-30 → `[{ from: 0, to: 1440 }]`), cada fecha confirmada
con `tzOffset` antes de fijarla en el test. Y para cada minuto del hueco,
`instantFromLocal` da `null`; para el anterior y el siguiente, no.
`weekdayLabel` con los cuatro formatos y con un día de otro año; `dayKeyLabel`
sigue dando lo mismo que hoy.

### 5.4 La ruta, la URL y el zoom

```tsx
// src/app/(app)/calendario/page.tsx
export default async function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  const session = await requireSession();
  const zoom = parseCalendarZoom((await cookies()).get(CALENDAR_ZOOM_COOKIE)?.value);
  const params = await searchParams;
  const week = calendarWeekParams.safeParse(params);
  const mode = calendarModeParams.safeParse(params);
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarScreen
        actor={session.actor}
        workspace={trackerWorkspaceOf(session)}
        request={{
          mode: mode.success ? "day" : "week",
          day: week.success ? week.data.semana : null,
        }}
        initialZoom={zoom}
      />
    </Suspense>
  );
}
```

- **URL**: `/calendario?semana=AAAA-MM-DD`, y `&vista=dia` en la vista día. Un
  `semana` repetido llega como arreglo y no pasa el esquema, como en el ADR 0008. `calendarHref(mode, start)` es la única función que arma la URL.
- **Zoom** (CAL-11, CAL-12): `CalendarZoom = 60 | 30 | 15 | 5`, cookie
  `clock.calendar-zoom` por navegador y por un año, como `tracker-mode.ts`. Un
  valor desconocido es 60. Se lee en el servidor para dibujar el zoom recordado
  desde la primera respuesta.
- **`error.tsx`** (CAL-87): «No se pudo cargar el calendario.» y un botón
  «Reintentar» que llama a `retry`. Nunca una grilla vacía que se confunda con
  CAL-84.
- **`CalendarSkeleton`**: `role="status"`, `aria-busy`, «Cargando el
  calendario».

`CalendarScreen` es un Server Component, como `TrackerScreen`:

- Lee `getCalendarState` y `getTrackingCatalog(actor)` con `Promise.all`.
- Dibuja `<h1 className="sr-only">Calendario</h1>`, como
  `tracker-screen.tsx:44`.
- Dibuja `InactiveMembershipNotice` si `!canTrack` (TT-92).
- Monta `DisplayFormatsProvider` con `workspace.formats` —los de esta misma
  lectura, no los del layout, que una navegación del cliente puede conservar
  con los formatos de antes (`tracker-screen.tsx:57-59`)— y
  `TrackingCatalogProvider` alrededor de `CalendarView`.

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
  inicio; se dibuja con la altura mínima (CAL-92).
- Los días fuera del período se recortan (CAL-28). **Una entrada está fuera del
  período si y solo si `entrySegments(entry, days).length === 0`**: es la
  definición que usan el 8c y el 8b.

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

**Superposición** (CAL-25, CAL-99):

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
`dayTotalOf(day, state, removedIds)`, y el de la semana con
`periodTotalOf(state, removedIds)`, las dos de `calendar-totals.ts` (§6). En el
8 `removedIds` es `[]`: no hay borrado; el 8c pasa los ids del borrado
optimista. En la vista día no hay total de semana. Formato `h:mm` (PF-20).

**Desplazamiento inicial** (CAL-14): al montarse la grilla, si `now.date` está
en el período, la línea de ahora queda una hora por debajo del borde superior;
si no, las `DEFAULT_SCROLL_CLOCK` arriba. La grilla lleva `key` con la vista y
el período, así cada navegación vuelve a desplazar y una revalidación no.

**El fondo de una columna no es un control** (CAL-76): en el 8 un clic ahí no
hace nada. El clic en una franja es del 8c.

### 5.6 La barra del calendario

Arriba de la grilla, en este orden:

- **«Día anterior» / «Semana anterior»** y **«Día siguiente» / «Semana
  siguiente»**: enlaces (`Link`) a `calendarHref(mode, previousStart)` y
  `nextStart`, con ícono y nombre accesible.
- **«Hoy»**: enlace a `todayStart`, con `aria-current` si ya es el período.
- **El rango** (CAL-15, CAL-16): un botón con `periodLabel` y el nombre «Elegir
  fecha: {periodLabel}», que abre un calendario de mes sin cota. Elegir un día
  navega a `calendarHref(mode, día)`; el servidor normaliza la semana. Al
  cerrar, el foco vuelve al botón.
- **«Semana» / «Día»** (CAL-07): dos enlaces a `weekModeStart` y
  `dayModeStart`, el de la vista actual con `aria-current="page"`.
- **El total de la semana** (CAL-33): «Total {h:mm}», solo en la vista semana.

El 8c suma «Agregar entrada» al final.

**Zoom**, en la esquina superior izquierda de la grilla (CAL-11): «Acercar»
(60 → 30 → 15 → 5) y «Alejar», cada uno `aria-disabled` en su extremo y sin
actuar; el tamaño a la vista («1 h», «30 min», «15 min», «5 min») y un
`role="status"` con «Franjas de 1 hora» o «Franjas de N minutos». Cambiarlo
escribe la cookie y no navega.

### 5.7 El diálogo de una entrada, en solo lectura

`EntryDialog`, con la primitiva `Dialog`; el cuerpo es un componente aparte,
`EntryDialogBody`, para que el test lo dibuje sin el portal, como
`BulkEditForm`. **No llama a ninguna action.** Guarda la entrada que se abrió:
una revalidación con la entrada cambiada o borrada no lo cierra ni lo cambia
(CAL-72, en su dibujo).

- **Título**: «Entrada» para una cerrada, «Timer en curso» para la que corre.
- **Contenido**, una lista de definiciones:
  - «Descripción»: la descripción, o «Sin descripción» en gris.
  - «Proyecto»: `ProjectPicker` con `readOnly`, `variant="row"`,
    `value={selectionOf(entry)}` y `label={entryProjectLabel(nombre)}`.
  - «Fecha»: `dayKeyLabel(entry.dayDate, todayKey, formats.date)`.
  - «Hora de inicio» y «Hora de fin» (`trackerLabels.startTime`, `endTime`),
    con `clockLabel`; el fin con su superíndice `+N` y `extraDaysText` para el
    lector de pantalla.
  - «Duración»: `durationLabel` de la vista.
  - En el timer, en lugar del fin y la duración: «Fin: en curso» y
    `ElapsedCounter` con `startedAt` y `serverNow`.
- **Abajo, solo «Cerrar»** (`DialogClose`).

### 5.8 Foco y teclado

- **Abrir**: un bloque abre su diálogo con clic, `Enter` o `Espacio` (CAL-74);
  un segmento oculto, con el puntero. Al abrir, el foco va a «Cerrar», el único
  control.
- **Quién abrió**: `CalendarView` guarda `openerId`, el id de la última entrada
  cuyo diálogo se abrió, y un `openerRef` que la grilla pasa como `ref` al botón
  del bloque de esa entrada —el primer segmento visible, también cuando se
  abrió desde un segmento oculto—. **`openerId` no se limpia al cerrar**: el
  estado del diálogo se cierra antes de que Base UI pida `finalFocus`, y si el
  `ref` dependiera de la entrada abierta ya estaría en `null`. Se reemplaza
  cuando se abre otro diálogo. Si una revalidación saca ese botón, React deja
  el `ref` en `null`.
- **Cerrar, `Esc`, clic afuera**: con `useDialogReturnFocus({ cancelFocus:
openerRef, fallbackFocus: regionRef, onCancel })`, el foco vuelve al botón
  del bloque, o a la región si ya no está. `finalFocus` devuelve `false` y el
  foco se mueve a mano en una microtarea: Base UI enfoca el primer tabulable
  del destino, y la región no es tabulable.
- **La región de la pantalla**: `<section aria-label="Calendario"
tabIndex={-1}>`, siempre montada, con la barra y la grilla.
- **`Tab`** recorre la barra, el zoom y los bloques en orden de columna y de
  inicio (CAL-76). Los atajos del rastreador no se montan (CAL-73).

### 5.9 Revalidación

`CalendarView` llama a `useTrackerRefresh()` (CAL-41, CAL-89): al enfocar, al
volver a ser visible y cada 60 s mientras está visible. Con un timer detenido o
borrado en otra pestaña, la grilla puede seguir dibujándolo hasta un minuto.

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
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
```

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/calendario/page.tsx                                     (nuevo)
/home/maxi/program/clock/src/app/(app)/calendario/error.tsx                                    (nuevo)
/home/maxi/program/clock/src/components/layout/app-nav.tsx
/home/maxi/program/clock/src/components/ui/tooltip.tsx                                         (nuevo, generado)
/home/maxi/program/clock/src/modules/time-entry/components/civil-date.ts                       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/inactive-membership-notice.tsx      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/use-group-total.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-screen.tsx        (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-view.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-toolbar.tsx       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/period-picker.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-grid.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.tsx         (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.test.tsx    (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx           (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.test.tsx      (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-layout.ts         (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-layout.test.ts    (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-totals.ts         (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-totals.test.ts    (nuevo)
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
/home/maxi/program/clock/e2e/database.ts
```

`calendar-page.ts` reúne los localizadores de la pantalla; `days.ts` suma lo que
falte para armar días y semanas de la persona. Los de `tracker-page.ts` se
importan, no se copian. `database.ts` suma:

```ts
/**
 * Lleva el inicio del timer abierto de la persona a las 00:00 de hoy en
 * `timeZone`. La interfaz lo puede hacer con el editor del inicio (TT-28),
 * pero el recorrido del calendario es de lectura y no depende de un editor de
 * otra pantalla. Corta si la persona no tiene exactamente un timer abierto.
 */
export async function moveRunningStartToMidnight(
  email: string,
  timeZone: string,
): Promise<void>;
```

con `updateOne` y la medianoche calculada en la base
(`date_trunc('day', now() at time zone $2) at time zone $2`). El comentario de
cabecera del archivo suma «o lo que un recorrido de lectura necesita de
partida».

### parity-analyst

```
/home/maxi/program/clock/docs/parity/calendario.md
/home/maxi/program/clock/docs/parity/perfil.md
```

Antes del merge, lo que enumera §1 en «Lo que el slice decide»: en
`calendario.md`, P-02 a «Cerrados», CAL-14, CAL-17, CAL-65 y CAL-66 en solo
lectura, CAL-86 sin la ruta de vuelta, §18 corregida y la sección «Slice 8» con
«Lo que queda» (el 8c y el 8b); en `perfil.md`, P-02 y la nota de PF-15. Lo de
P-01, P-04, P-06, TT-30 y TS-39 es del 8c.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`,
`src/server/session.ts`, `src/server/action.ts`, `src/server/audit.ts`,
`src/hooks/`, `src/components/action-feedback.tsx`, `src/modules/project/`,
`src/modules/profile/`, `src/app/(app)/page.tsx`, `src/app/(app)/layout.tsx`,
`time-entry/actions.ts`, `actions.integration.test.ts`,
`audit.integration.test.ts`, `permissions.integration.test.ts`, y los
componentes del rastreador salvo `date-field.tsx`, `tracker-screen.tsx`,
`labels.ts`, `entry-row.tsx` y `use-group-total.ts`, con los cambios de §1:
`tracker-bar.tsx`, `mode-switch.tsx`, `manual-bar.tsx`, `entry-list.tsx`,
`day-group.tsx`, `time-draft.ts`, `clock-field.tsx`, `entry-project.ts`,
`use-dialog-return-focus.ts`, `use-tracker-refresh.ts`, `elapsed.ts`,
`elapsed-counter.tsx`, `delete-entry-dialog.tsx`. Los e2e existentes no cambian.
Los contratos y correcciones anteriores son históricos. El mapa y el estado de
la fase los actualiza team-lead.

### Handshake de orden

0. **Antes de implementar**: `architecture-reviewer` hasta aprobar. La ronda 1
   está aplicada ([correcciones](correcciones-fase1-slice8.md)); sigue la
   ronda 2. Las decisiones del usuario están resueltas.
1. **Primer commit de `backend-dev`**: lo de §5.3 en `src/server/time` con sus
   tests; los esquemas y tipos de §5.1; la firma de `getCalendarState`. La suite
   existente sigue verde. Avisa a `frontend-dev`.
2. **`frontend-dev` arranca en paralelo** por lo que no depende del servidor:
   el tooltip generado, `civil-date.ts` con `date-field.tsx`,
   `calendar-zoom.ts`, `calendar-href.ts`, los dos `labels.ts`,
   `extraDaysText`, `InactiveMembershipNotice`, `GroupTotal` y la navegación.
3. **`tests-slice8` arranca en paralelo** con el spec, y confirma que falla por
   la funcionalidad y no por el arnés.
4. Con el primer commit en la rama, `frontend-dev` sigue con
   `calendar-layout.ts` y `calendar-totals.ts` con sus tests, y después la
   pantalla. `backend-dev` sigue con `listClosedOverlapping`,
   `getCalendarState` y sus tests.
5. `parity-analyst`, antes del merge.

### Responsabilidades que no se leen en el nombre del archivo

- **`calendar-layout.ts`** es la geometría como funciones puras, sin React ni
  zona: las constantes de §5.5, `entrySegments`, `runningSegments`,
  `nowPosition`, `layoutColumn` y además:

  ```ts
  export function isMissing(minute: number, ranges: readonly MinuteRange[]): boolean;
  /** CAL-14: el minuto que queda arriba al montar. */
  export function initialScrollMinute(now: NowPosition, days: readonly string[]): number;
  ```

  El 8c suma `minuteAt`, `slotDraft` y `addEntryDraft`.

- **`calendar-totals.ts`** arma la entrada de `useGroupTotalLabel`, pura:

  ```ts
  /** La columna de un día (CAL-31, CAL-32, CAL-34). */
  export function dayTotalOf(
    day: CalendarDayView,
    state: Pick<CalendarState, "entries" | "running" | "serverNow">,
    removedIds: readonly string[],
  ): GroupTotal;

  /** El período (CAL-33, CAL-34). */
  export function periodTotalOf(
    state: Pick<
      CalendarState,
      "days" | "entries" | "running" | "serverNow" | "closedSeconds"
    >,
    removedIds: readonly string[],
  ): GroupTotal;
  ```

  `dayTotalOf`: `closedSeconds` del día, las entradas cuyo `dayDate` es ese día,
  y `runningStartedAt` solo si `running.dayDate` es ese día. `periodTotalOf`:
  `state.closedSeconds`, las entradas cuyo `dayDate` está en el período, y el
  inicio del timer solo si su `dayDate` está en el período (CAL-93).

- **`calendar-view.tsx`** es el dueño de la pantalla en el cliente: el diálogo
  abierto (la entrada), `openerId` y `openerRef`, la región y su `ref`, el zoom
  con su cookie y `useTrackerRefresh`. Arma `nowPosition` una vez y se lo pasa
  a la grilla.
- **`calendar-grid.tsx`** dibuja eje, encabezados con su total, columnas,
  franjas atenuadas, bloques y línea de ahora a partir de `calendar-layout.ts`
  y `calendar-totals.ts`. Avisa el clic en un bloque (`onOpen(id)`) y pasa
  `openerRef` al botón de `openerId`.
- **`calendar-block.tsx`** es un segmento: el botón o el `div` oculto, el
  contenido de §5.5 y el tooltip.
- **`calendar-block.test.tsx`** y **`entry-dialog.test.tsx`** son tests de
  componente con `renderToStaticMarkup`, envueltos en `DisplayFormatsProvider` y
  `TrackingCatalogProvider`, como `project-picker.test.tsx`. El del bloque
  afirma el nombre accesible de CAL-75 —cerrada, que cruza la medianoche, con
  proyecto y tarea, el timer— con los dos formatos de hora, y que el segmento
  que no es el primero no es botón y está oculto. El del diálogo dibuja
  `EntryDialogBody` de una cerrada, de una de más de un día y del timer: los
  campos como texto, «Fin: en curso» y ningún control de edición.
- **`entry-dialog.tsx`** dibuja §5.7. El 8c le suma los modos de edición.
- **`period-picker.tsx`**: `Popover` con `Calendar`, sin `disabled`, que navega
  con `router.push`. Las fechas civiles con `civil-date.ts`.
- **`civil-date.ts`**: la fecha civil de un `dayKey` para dibujar el calendario
  y la clave de una fecha elegida, que hoy son locales de `date-field.tsx`.
- **`inactive-membership-notice.tsx`**: el aviso de TT-92 con los textos que hoy
  tiene `tracker-screen.tsx:46-55`, sin cambios. Lo usan las dos pantallas.
- **`labels.ts`** (el del rastreador) suma `extraDaysText(extraDays)`, movida
  tal cual de `entry-row.tsx:92-96`.
- **`use-group-total.ts`** exporta `GroupTotal`, para que `calendar-totals.ts`
  devuelva ese tipo sin copiarlo.
- **`calendar/labels.ts`**, `calendarLabels`:

  | Clave          | Texto                                                 |
  | -------------- | ----------------------------------------------------- |
  | `nav`          | «Calendario»                                          |
  | `heading`      | «Calendario»                                          |
  | `region`       | «Calendario»                                          |
  | `loading`      | «Cargando el calendario»                              |
  | `loadFailed`   | «No se pudo cargar el calendario.»                    |
  | `previousWeek` | «Semana anterior»                                     |
  | `nextWeek`     | «Semana siguiente»                                    |
  | `previousDay`  | «Día anterior»                                        |
  | `nextDay`      | «Día siguiente»                                       |
  | `today`        | «Hoy»                                                 |
  | `pickDate`     | función: «Elegir fecha: {rango}»                      |
  | `weekView`     | «Semana»                                              |
  | `dayView`      | «Día»                                                 |
  | `total`        | «Total»                                               |
  | `zoomIn`       | «Acercar»                                             |
  | `zoomOut`      | «Alejar»                                              |
  | `zoomShort`    | función: «1 h» / «N min»                              |
  | `zoomStatus`   | función: «Franjas de 1 hora» / «Franjas de N minutos» |
  | `running`      | «en curso»                                            |
  | `blockLabel`   | función: el nombre de CAL-75                          |
  | `entryTitle`   | «Entrada»                                             |
  | `runningTitle` | «Timer en curso»                                      |
  | `description`  | «Descripción»                                         |
  | `project`      | «Proyecto»                                            |
  | `date`         | «Fecha»                                               |
  | `duration`     | «Duración»                                            |
  | `runningEnd`   | «Fin: en curso»                                       |
  | `close`        | «Cerrar»                                              |

  Los textos que ya existen se importan de donde están y no se copian:
  `trackerLabels.startTime`, `endTime`, `noDescription`, `endsNextDay`;
  `entryNameOf`, `entryProjectLabel` y `extraDaysText`.

## 7. Criterios de aceptación

1. **CAL-01** — La navegación tiene «Calendario» después de «Inicio», lleva a
   `/calendario` y queda con `aria-current="page"`.
2. **CAL-06, CAL-07, CAL-17, CAL-18** — La vista semana tiene siete columnas
   desde el primer día de la persona; `?semana=` con un día de mitad de semana
   dibuja la semana que lo contiene; un día inválido, repetido o no navegable
   (`9999-12-31`, `0100-01-01`, y `2011-12-30` en `Pacific/Apia`) dibuja el
   período actual; `&vista=dia`, una columna.
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
   `getTrackerState`, y en pantalla, el mismo que el encabezado de esa semana
   en `/`.
6. **CAL-34, CAL-38** — Con un timer que empezó a las 00:00 de hoy, el total de
   la columna de hoy y el de la semana no son `0:00` y coinciden con los de `/`
   (el mismo o un minuto más, porque el contador sigue entre las dos lecturas);
   el borde inferior de su bloque coincide con la línea de ahora. `dayTotalOf`
   y `periodTotalOf` ponen el inicio del timer solo en la columna y el período
   de su `dayDate`.
7. **CAL-09, CAL-19** — Los rótulos de columna salen del formato de fecha de la
   persona, el de hoy marcado; con otra zona, la misma entrada cae en otra
   columna o a otra altura; con 12 h elegidas en otra pestaña, entrar al
   calendario por la navegación dibuja el bloque en 12 h.
8. **CAL-26, CAL-27, CAL-94, segmentos** — `entrySegments` da un segmento por
   día tocado, recortado al período, y ninguno para una entrada fuera de él; la
   que termina a las 00:00 no dibuja en el día siguiente; la de más de un día
   tiene días de alto completo; la hora repetida no da altura negativa.
9. **CAL-24, CAL-25** — `layoutColumn` reparte el ancho entre las que se pisan,
   también por la altura mínima, y deja a las demás en ancho completo.
10. **CAL-30** — `nonexistentMinutes` da los casos de §5.3; la grilla atenúa
    esos minutos.
11. **CAL-48, CAL-85** — Un día anterior al piso se dibuja atenuado; un período
    entero anterior, todo atenuado.
12. **CAL-35 a CAL-37** — La línea de ahora está solo en la columna de hoy y no
    existe en un período sin hoy; `nowPosition` pasa de día a la medianoche.
13. **CAL-65, CAL-66, CAL-74, el diálogo** — Un bloque abre su diálogo con clic,
    `Enter` o `Espacio`, y un segmento oculto con el clic; el diálogo muestra la
    descripción, el proyecto, la fecha, las horas con su superíndice y la
    duración como texto, y del timer «Fin: en curso»; `Esc` y «Cerrar»
    devuelven el foco al botón del bloque.
14. **CAL-74 a CAL-77, accesibilidad** — Cada entrada es un botón con el nombre
    de CAL-75; de una entrada partida, solo el primer segmento visible es botón;
    el tooltip aparece con el foco y se cierra con `Esc`; `Tab` recorre los
    bloques en orden cronológico.
15. **CAL-05, TT-92** — Con `canTrack` en falso, la pantalla dibuja
    `InactiveMembershipNotice` y la grilla igual.
16. **CAL-11, CAL-12, CAL-14** — El zoom cambia el tamaño de franja y sobrevive a
    la recarga; la grilla abre con la línea de ahora a la vista en la semana
    actual y con las 08:00 arriba en otra.
17. **CAL-87** — Con la lectura fallando, la página dibuja el error con
    «Reintentar», no una grilla.
18. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
    `main` pasa sin cambiar ninguna afirmación.

### Con qué se verifica cada criterio

| Criterio | Tipo                       | Archivo                                                                        | Qué afirma                                                                       |
| -------- | -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1        | e2e                        | `e2e/calendar.spec.ts`                                                         | el recorrido 1                                                                   |
| 2        | integración + e2e          | `service.integration.test.ts`; `e2e/calendar.spec.ts`                          | `periodStart`, `days` y `mode` con cada parámetro, Apia incluida; el recorrido 1 |
| 3        | integración + unidad + e2e | `service.integration.test.ts`; `calendar-href.test.ts`; `e2e/calendar.spec.ts` | los enlaces y rótulos de la vista; la URL; el recorrido 1                        |
| 4        | integración                | `service.integration.test.ts`                                                  | los seis bordes, con una entrada ajena sembrada y el timer                       |
| 5        | integración + e2e          | `service.integration.test.ts`; `e2e/calendar.spec.ts`                          | los totales contra `getTrackerState` con el mismo `now`; el recorrido 2          |
| 6        | unidad + e2e               | `calendar-totals.test.ts`; `e2e/calendar.spec.ts`                              | la entrada de cada columna y del período; el recorrido 3                         |
| 7        | integración + unidad + e2e | `service.integration.test.ts`; `time.test.ts`; `e2e/calendar.spec.ts`          | `label` con dos formatos; la misma entrada con dos zonas; el recorrido 1         |
| 8        | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar.spec.ts`                              | cada caso de §5.5; el recorrido 2                                                |
| 9        | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar.spec.ts`                              | carriles y grupos, con un bloque de segundos; el recorrido 2                     |
| 10       | unidad + integración       | `time.test.ts`; `service.integration.test.ts`                                  | los casos de §5.3; `missingMinutes` del día de Madrid                            |
| 11       | integración                | `service.integration.test.ts`                                                  | `beforeWorkspace` del día anterior al piso y del piso                            |
| 12       | unidad + e2e               | `calendar-layout.test.ts`; `e2e/calendar.spec.ts`                              | `nowPosition` en el último minuto; el recorrido 3                                |
| 13       | unidad + e2e               | `entry-dialog.test.tsx`; `e2e/calendar.spec.ts`                                | el cuerpo de los tres casos; los recorridos 2 y 3                                |
| 14       | unidad + e2e               | `calendar-block.test.tsx`; `e2e/calendar.spec.ts`                              | los nombres y el segmento oculto; el tooltip y `Tab` en el recorrido 2           |
| 15       | integración                | `service.integration.test.ts`                                                  | `canTrack` en falso con la membresía `inactive`, y la grilla con sus entradas    |
| 16       | unidad + e2e               | `calendar-zoom.test.ts`; `calendar-layout.test.ts`; `e2e/calendar.spec.ts`     | la cookie; `initialScrollMinute`; el recorrido 1                                 |
| 17       | revisión manual            | —                                                                              | la revisión de frontend fuerza la lectura a fallar y mira la página (§8)         |
| 18       | unidad + integración + e2e | las suites existentes                                                          | en verde, sin cambios                                                            |

**El criterio 6 tiene que poder fallar.** Con un timer recién arrancado los
totales dan `0:00` y el bloque mide la altura mínima: un total que no suma el
timer, o un bloque que no crece, pasan igual. Por eso el inicio se lleva a las
00:00 de hoy y el recorrido compara cajas a zoom de 5 minutos, donde un minuto
mide 9,6 px y la altura mínima deja de mandar a los tres minutos.

### Recorridos obligatorios de `e2e/calendar.spec.ts`

Dueño: `tests-slice8`. **Tres tests, uno por recorrido**: cada uno abre una sola
sesión, y el endpoint de sesión ya responde 429 con la suite completa. La
segunda pestaña es `page.context().newPage()`, que comparte la cookie y no pide
otra sesión; `openSecondTab` no se usa. Las entradas cerradas se cargan en `/`
con el modo manual (`chooseMode`, `pickDate`, `setClock` de `tracker-page.ts`)
y van en la **semana anterior**: así ninguna hora queda en el futuro y nunca
falta un día anterior en la semana. Las respuestas se esperan con
`withServerAction`; los editores en portal se buscan en `page`; sin
`page.clock.install()`.

1. **Navegar y formatos** (criterios 1, 2, 3, 7, 16). En `/`, cargar una
   entrada de 09:00 a 10:00 del miércoles anterior. En una segunda pestaña, en
   `/perfil`, elegir 12 h (`chooseFormat`). En la primera, sin recargar, entrar
   por «Calendario» de la navegación: siete columnas, la de hoy marcada, «Esta
   semana», la línea de ahora a la vista. «Semana anterior»: la URL con su
   `semana`, el rótulo «Semana anterior», el bloque con «9:00 AM – 10:00 AM» y
   las 08:00 arriba. «Hoy» vuelve. «Día»: una columna, rótulo «Hoy». «Semana»
   vuelve. El selector del rango lleva a la semana de un día de hace un mes.
   «Acercar» pasa a «30 min»; recargar y ver «30 min».
2. **Totales, medianoche y superposición** (criterios 5, 8, 9, 13, 14). En `/`,
   cargar una entrada de 22:00 a 02:00 del jueves anterior, otra de 09:00 a
   10:00 del martes anterior, y duplicar esta desde su fila. Leer el total de
   la semana anterior en `/`. En el calendario, «Semana anterior»: el total de
   la semana es el mismo; el del jueves es «4:00», el del viernes «0:00» y el
   del martes «2:00». La de medianoche tiene dos segmentos, uno por columna, y
   un solo botón con su nombre, «…de 22:00 a 02:00 (termina un día
   después)…»; con el foco en él, el tooltip, y `Esc` lo cierra. Un clic en el
   segmento del viernes abre «Entrada» con 22:00, 02:00 y el `+1`; `Esc`: el
   foco en el botón del jueves. Las dos del martes son dos bloques con el mismo
   nombre, lado a lado (cajas sin superponerse); `Tab` desde el primero llega
   al segundo; `Enter` abre su diálogo y «Cerrar» devuelve el foco.
3. **El timer** (criterios 6, 12, 13). Arrancar un timer en `/` y llevar su
   inicio a las 00:00 de hoy con `moveRunningStartToMidnight`. Recargar `/` y
   leer el total de hoy y el de esta semana. Entrar al calendario por la
   navegación: el bloque «…en curso» en la columna de hoy y la línea de ahora
   solo en esa columna; el total de la columna y el de la semana no son
   «0:00», y cada uno es el de `/` o un minuto más. «Acercar» hasta «5 min»: el
   borde inferior de la caja del botón del timer y la caja de
   `[data-calendar-now]` difieren en menos de 2 px. «Semana anterior»: no hay
   línea. Volver, abrir el bloque: «Timer en curso», «Fin: en curso»; `Esc`
   devuelve el foco al bloque.

## 8. Deuda conocida del slice

- **La lectura recorre la historia de la persona en cualquier período.**
  `started_at < to and ended_at > from` usa el índice solo para la cota
  superior, así que en la semana actual lee todas las entradas cerradas de la
  persona, y en una vieja, todas las anteriores a esa semana. Con diez entradas
  por día hábil son unas 2500 por año y por persona. Si el plan de la consulta
  pasa de 20 ms en la base de producción, hay dos salidas, cada una en una
  migración propia: un índice btree sobre `(workspace_id, user_id, ended_at)`,
  que acota por `ended_at > from` y sirve sobre todo a los períodos recientes,
  o un índice por rango (`tstzrange` con GiST), que acota los dos extremos.
- **`error.tsx` no tiene test automático.** `renderToStaticMarkup` no ejercita
  `retry`, y forzar una falla de lectura en e2e pide una ruta de prueba que el
  proyecto no tiene. La revisión de frontend lo comprueba a mano.
- **Las otras rutas siguen sin `error.tsx`**: la deuda del estado de la fase se
  achica en una ruta.
- **CAL-86 sin la ruta de vuelta**: con la sesión vencida, volver a entrar
  lleva a `/` y no al período que se veía. Es lo de toda la aplicación
  (TT-91 dice lo contrario y tampoco se cumple en `/`).
- **El 8 no escribe.** Hasta el 8c, el diálogo es de solo lectura para todos y
  las actions de `time-entry` revalidan solo `"/"`: volver al calendario con
  «Atrás» después de cargar horas en `/` puede mostrar la copia del router
  hasta la próxima revalidación, a lo sumo 60 s.
- **El enlace al período anterior o siguiente puede no ser navegable** (el
  límite de los años, o la semana de Apia de 2011): lleva al período actual.
- **La línea de ahora puede quedar corrida una hora** durante el minuto que
  sigue a un cambio de horario, hasta la próxima revalidación.
- **El tooltip no existe en pantallas táctiles**: el detalle está en el diálogo.
- **Las 08:00 de CAL-14 son una constante** hasta que se verifique PF-15.
- **El primer día de la semana en el calendario del selector** sale del idioma,
  como en el resto de la aplicación (deuda del slice 7).
- **`useTrackerRefresh` y `useDialogReturnFocus` llevan nombres y comentarios
  del rastreador o de la masiva** y ahora sirven a dos pantallas. Renombrarlos
  no cambia conducta.
- **CAL-30 y CAL-92 no tienen e2e**: el workspace de los e2e está en Buenos
  Aires, sin cambio de horario. Los cubren `time.test.ts`,
  `calendar-layout.test.ts` y los tests de integración con Madrid.
- **TT-92 se verifica en el servicio y en el componente**, no en pantalla, como
  en el 6.
- **El recorrido 3 tiene una ventana**: corrido en los primeros tres minutos
  del día, el timer de las 00:00 suma `0:00` o mide la altura mínima. Es la
  misma ventana que las horas de hoy de los e2e (`00:00–00:01`).
- **Sin verificar en Clockify** (calendario P-07): lo de §1 marcado como
  decisión nuestra, en especial el diálogo de solo lectura.
