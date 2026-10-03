# Fase 1, slice 3: corregir horas y fecha de una entrada

Contrato cerrado del tercer slice vertical de la fase 1. Módulo `time-entry`,
en `src/modules/time-entry/`, pantalla `/`.

Fuente de los comportamientos: `docs/parity/time-tracker.md`, secciones 2.7 y 6.
Lugar en el plan: [mapa de la fase 1](fase1-mapa.md). Decisiones de
arquitectura asociadas:
[ADR 0005, la hora de pared viaja como hora de pared](../adr/0005-hora-de-pared-en-la-entrada-manual.md),
que este slice consume tal cual y no reabre, y
[ADR 0006, al editar, un extremo que no cambió conserva su instante](../adr/0006-conservar-el-extremo-sin-cambios.md),
que nace en este slice.

Correcciones aplicadas: rondas 1, 2 y 3 de `architecture-reviewer`
([`correcciones-fase1-slice3.md`](correcciones-fase1-slice3.md)), todos los
hallazgos. M-3 se aplicó con una resolución distinta de la original, explicada
en el archivo de correcciones y en el ADR 0006.

Decisiones del equipo que da por tomadas y no vuelve a abrir: no hay duración
máxima por entrada (P-08, P-12); zona horaria y formatos salen del workspace
(P-13); las fechas futuras se aceptan (P-10); **TT-29 y TT-75 siguen en
`adaptar`** y un timer activo no puede empezar en el futuro, que no es la misma
regla que TT-76 y no se unifica con ella.

**ADR nuevo: el 0006.** La regla de conservación de los extremos sin cambios la
van a usar también la edición masiva, el calendario y el timesheet, así que va
en un ADR y no en este contrato. Las demás decisiones del slice —el payload
completo en vez de un parche, el día explícito en la edición del timer activo,
el desenlace de cada carrera, la parada con piso en el inicio— se justifican
donde se toman y ninguna cambia una regla que atraviese otros slices.

## 0. Precondición de arranque

**El slice 3 empieza con el slice 2 mergeado en `main`.** Hoy `main` es solo el
slice 1: `clock-field.tsx`, `date-field.tsx`, `manual-bar.tsx`,
`tracker-bar.tsx`, `manual-draft.ts` y su test, `mode-switch.tsx`,
`tracker-mode.ts`, `actions.integration.test.ts` y las primitivas de
`src/components/ui/` que trajo el slice 2 no existen ahí, y varios de ellos
están en el reparto de la sección 6. Ningún agente arranca este slice sobre una
rama que no los tenga.

**Y con el slice 2b mergeado después del 2**
([`fase1-slice2b-reintento-de-iniciar.md`](fase1-slice2b-reintento-de-iniciar.md)).
El 2b toca `startTimer`, que este slice también toca para traducir
`isEndBeforeStart`, y deja el algoritmo de altas del ADR 0007 dentro del que
esa traducción tiene que quedar. Lo que este slice hereda del 2b está en el §0
de ese contrato.

Lo que el slice 2 deja y acá se reusa sin reimplementar: los intérpretes de
texto, la conversión de hora de pared, el piso del workspace, el borrador de
`{ date, start, end }` y el acceso directo a la base de los e2e
(`e2e/database.ts`). Y lo que dejó su revisión de código, que este contrato
también da por hecho:

- `TrackerState` trae `todayKey` y `minDayKey`, calculados por el service con
  una sola función del piso del workspace, `workspaceFloorDayKey`. Ningún
  componente los calcula.
- `TrackerWorkspace`, el tipo mínimo de workspace que reciben
  `createManualEntry` y `getTrackerState`.
- `timeEntryRepository.findLatestClosedBefore(…, now, tx)`, la consulta que
  estira la ventana hacia atrás sin que una entrada futura cuente.
- En `src/server/time`, `crossesMidnight` e `isAfterYear9999`; y en
  `createManualEntry`, el rechazo con `invalidDate` de un día de fin sin clave
  (`parseDayKey(endDay) === null`) y de un instante posterior al año 9999 UTC.

## 1. Alcance

Entra:

TT-28, TT-29, TT-54 (horas y fecha; la descripción ya está desde el slice 1),
TT-55, TT-56, TT-75, TT-81, TT-110, TT-111 y TT-112 en las dos ediciones de
horas (en el alta manual ya está desde el slice 2).

Entran además, por arrastre, comportamientos que ya existen y que este slice
ejercita por un camino nuevo. No se reimplementan, pero sí se verifican:

- **TT-19, TT-20, TT-21**: los campos de hora de la fila y del timer activo son
  los mismos campos tolerantes del slice 2, con los mismos formatos y el mismo
  rechazo.
- **TT-72, TT-51**: editar el fin por debajo del inicio manda la entrada al día
  siguiente y la fila dibuja el superíndice.
- **TT-73**: una edición que deja la entrada en menos de un minuto se rechaza.
- **TT-82**: una edición puede dejar dos entradas superpuestas, y se permite en
  silencio.
- **TT-45, TT-46**: mover o estirar una entrada recalcula el total de su día, y
  los dos totales cuando cambia de día. Lo mismo cuando el que cambia de día es
  el timer activo.
- **TT-97**: la duración se calcula sobre instantes UTC; en un día con cambio de
  horario la resta visual de las horas editadas puede no dar la duración.
- **TT-101**: una entrada de duración cero existe si la produce el timer; la
  parada nueva de §4.5 puede producirla.
- **TT-108 y P-15**: una entrada movida a un día que la lista no dibuja se
  guarda igual y avisa, con el mismo texto que el alta manual. El aviso lo
  muestra la lista, no la barra.
- **TT-66, TT-79, TT-80, TT-92**: las dos mutaciones usan el mismo permiso y el
  mismo camino de lectura de la fila que las del slice 1.
- **TT-89, TT-90, con «Reintentar» incluido**: las dos actions son idempotentes
  y el reintento es seguro. La excepción que el slice 2 tuvo que hacer con
  `createManualEntry` (TT-109) **no se extiende acá**; la verificación está en
  §4.4.

### Dos divergencias explícitas contra Clockify

Las dos están registradas en `docs/parity/time-tracker.md` con identificador y
marca `adaptar`. Este slice las implementa; no las decide.

- **TT-110 — Una entrada que el trío no puede expresar no edita sus horarios
  desde la fila.** En Clockify la edición en línea no tiene excepciones por
  duración (TT-54). El trío `{ date, start, end }` no lleva el día del fin: un
  fin menor que el inicio es el día siguiente (TT-72) y uno igual da cero
  (TT-73), así que hay entradas que no puede representar —las produce un timer
  largo (TT-42)— y que se truncarían al guardarlas. **La regla es de
  round-trip, no un umbral de duración**: la fila ofrece el editor solo si su
  trío vuelve a dar el mismo fin (§5). Equivale a **«menos de 24 horas de
  reloj, al minuto»**, medidas sobre los rótulos y no sobre la duración: una
  entrada de 30 segundos es editable y una de 23 h 59 min 40 s puede no serlo.
  Las entradas que no pasan la regla muestran sus horas en solo lectura con el
  texto «Esta entrada dura más de un día; sus horarios no se pueden editar
  acá.» El resto de la fila se sigue editando y borrando. Quién decide qué fila
  está en ese caso es el servidor, con `editableTimes`.
- **TT-111 — La entrada que está corriendo no edita sus horarios desde la
  fila.** Su inicio se corrige desde el contador (TT-28). La validación del
  servidor responde «Esta entrada es la que está corriendo.», que **no** es el
  texto de TT-30 porque el remedio no es detener el timer.

  En nuestra lista la entrada abierta **no es una fila**: los grupos traen solo
  entradas cerradas y el del día del timer activo suma su transcurrido sin
  dibujarla (TT-46). La parte visible de TT-111 se cumple entonces por
  construcción, y lo que este slice implementa de ella es la respuesta del
  servidor a un pedido que llegue igual (§4.3).

### Consecuencias sobre código ya entregado

Este slice no agrega una pantalla: le pone controles a dos cosas que hoy son
texto. Eso toca piezas que ya están probadas y desplegadas, y son las que hay
que volver a mirar en la revisión.

| Archivo               | Qué cambia                                                                                                                                                                                       | Qué hay que volver a probar                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `elapsed-counter.tsx` | El contador no cambia; sobre él se superpone un botón hermano que abre el editor del inicio (TT-28). El hook delega en `elapsed.ts` qué medido vale.                                             | TT-17, TT-31, TT-32, TT-38, y los e2e del slice 1 sin tocarlos |
| `elapsed.ts`          | Exporta la decisión del ancla como dos funciones puras, independientes del `startedAt`.                                                                                                          | TT-32                                                          |
| `entry-row.tsx`       | Las horas pasan de texto a disparador del editor, con un botón de fecha al lado, o a solo lectura con `editableTimes` en falso.                                                                  | TT-04 y TT-54 de descripción, TT-49, TT-50, TT-51              |
| `day-group.tsx`       | Suma la mutación de horas y su aviso de falla; le avisa a la lista cuando una edición queda fuera de la ventana. Usa el hook para el total.                                                      | TT-45, TT-46, TT-55, TT-60                                     |
| `timer-bar.tsx`       | Hospeda el editor del inicio del timer activo y su action; recibe el piso y hoy.                                                                                                                 | TT-22, TT-23, TT-38                                            |
| `tracker-bar.tsx`     | Pasa `todayKey` y `minDayKey` también a `TimerBar`. Importa `reset` de `time-draft.ts` y su `manualDraft` pasa a ser un `TimeDraft`. El aviso de TT-108 del alta toma sus textos de `labels.ts`. | TT-16, TT-25, TT-30, TT-108, el guardado de la descripción     |
| `tracker-screen.tsx`  | Compone la lista con `EntryList`, nuevo, en vez de mapear los `DayGroup`.                                                                                                                        | TT-85, TT-92 (el aviso de membresía), el armado de la lista    |
| `clock-field.tsx`     | Gana `Esc` y la confirmación con Enter hacia el grupo; el blur sigue normalizando el campo, sin escribir.                                                                                        | TT-19, TT-20, TT-21 en la barra manual                         |
| `date-field.tsx`      | Suma cota superior y avisa cuándo el calendario está abierto.                                                                                                                                    | TT-76 del slice 2, que no tiene cota superior                  |
| `manual-draft.ts`     | Se renombra a `time-draft.ts`, con sus tipos: pasa a tener dos consumidores.                                                                                                                     | Todo el modo manual del slice 2                                |
| `manual-bar.tsx`      | Solo el import y los tipos del borrador: `ManualDraft` y `ManualDraftChange` pasan a `TimeDraft` y `TimeDraftChange`.                                                                            | TT-18                                                          |
| `schema.ts`           | `TimeEntryView` suma `editableTimes`.                                                                                                                                                            | Toda action que devuelve una vista                             |
| `repository.ts`       | `stopById` escribe `greatest(now(), started_at)` (§4.5).                                                                                                                                         | TT-23, TT-36, TT-41                                            |
| `service.ts`          | `startTimer` traduce la violación del `check` igual que `stopTimer` (§4.5).                                                                                                                      | TT-36, TT-37                                                   |

Dos riesgos concretos, que son los que motivan los criterios 11 y 1:

- **El contador.** El transcurrido se mide como `serverNow − startedAt` más lo
  que pasó en el cliente desde que empezó a medir. Lo medido es una diferencia
  entre dos lecturas del mismo reloj, así que el desfase de la máquina se
  cancela y **no** vuelve a entrar aunque se reinicie la medición: ese no es el
  riesgo. El riesgo es otro: hoy la referencia que decide si lo medido sigue
  valiendo combina `serverNow` **y** `startedAt`, de modo que un `startedAt`
  nuevo con el mismo `serverNow` tira lo medido y el contador retrocede lo que
  llevaba contado desde el montaje; y un intervalo que se reinicia con el mismo
  `serverNow` vuelve a medir desde cero. Con la revalidación de este slice lo
  primero no se ve, porque el inicio nuevo llega siempre con un `serverNow`
  nuevo; se vería con cualquier edición optimista del inicio, que este slice no
  hace. La corrección es sacar esa decisión del hook a funciones puras de
  `elapsed.ts`, donde se puede probar, y hacerla depender solo de `serverNow`
  (§6).
- **El foco en la fila.** La fila pasa a tener el trío además de la
  descripción. Con el guardado por campo de TT-55 y el payload completo,
  tabular del inicio al fin escribiría estados intermedios: una edición se
  perdería con un `tooShort` que no explica nada y otra guardaría una entrada de
  23 horas que recién la segunda escritura arregla. Por eso el trío se confirma
  al salir del **editor**, no de cada campo (§6).

Queda afuera, explícito:

- **La duración de la fila no es editable.** TT-54 enumera descripción,
  proyecto, facturabilidad, etiquetas, hora de inicio, hora de fin y fecha. La
  duración de la fila se deriva de las dos horas y se muestra, como hasta ahora.
- **Proyecto, tarea, etiquetas y facturable**, que son de los slices 10 y 11.
- **La edición en masa** (TT-62 … TT-64), que es el slice 6 y que se apoya en
  esta mutación.
- **TT-26, los atajos**, que van en el slice 4.
- **Sin tests de componentes con DOM**, igual que en los dos slices anteriores.

## 2. Cambios de esquema

**Ninguno.** No hay migración y ni `src/server/db/schema.ts` ni `drizzle/` se
tocan.

Las dos mutaciones escriben columnas que ya existen. El
`check time_entry_end_after_start` sigue siendo la red de TT-81 y no cambia. El
índice único parcial de TT-34 tampoco se entera: `updateTimes` sí escribe
`ended_at`, pero **ninguna de las dos mutaciones cambia la condición
`ended_at is null` de la fila** —la cerrada sigue cerrada y la abierta sigue
abierta—, que es lo único que el índice mira.

## 3. Acciones de permisos nuevas

**Ninguna.** Las dos mutaciones usan `timeEntry.own.update`, la misma que
`stopTimer` y `updateDescription`, con el recurso armado sobre el `user_id` de
la fila leída.

Es el mismo argumento del slice 2: no hay rol que pueda editar la descripción de
su entrada y no sus horas —TT-66 da todo a los cinco roles sobre lo propio— y
una acción separada sería una fila de la tabla que siempre vale lo mismo que
otra, hasta el día que alguien las desincronice.

`src/server/permissions/index.ts` y `permissions.test.ts` no se tocan.
`src/modules/time-entry/permissions.integration.test.ts` suma los casos de los
dos caminos nuevos.

## 4. Contrato de las server actions

Dos actions nuevas en `src/modules/time-entry/actions.ts`, con el recorrido de
siempre y la regla transversal del slice 1: **revalidan `/` también cuando
devuelven error de dominio**.

```ts
export async function updateEntryTimes(
  input: UpdateEntryTimesInput,
): Promise<ActionResult<UpdateEntryTimesResult>>;

export async function updateRunningStart(
  input: UpdateRunningStartInput,
): Promise<ActionResult<UpdateRunningStartResult>>;
```

Las dos le pasan al service `session.workspace` entero, igual que
`createManualEntry`: el piso necesita `createdAt` y la sesión ya lo tiene.

### Lo que cambia en los tipos del módulo

No hay códigos de error nuevos. Dos mensajes nuevos, los dos sobre códigos que
ya existen:

| Mensaje en `timeEntryMessages` | Texto                                               | Código          | Origen       |
| ------------------------------ | --------------------------------------------------- | --------------- | ------------ |
| `futureTime`                   | «No se pueden cargar horas que todavía no pasaron.» | `validation`    | TT-29, TT-75 |
| `runningEntryTimes`            | «Esta entrada es la que está corriendo.»            | `timer_running` | TT-111       |

`futureTime` es la clave que el slice 2 dejó reservada al revertir P-10 y que
ahí no se declaró por no tener uso.

`runningEntryTimes` es el segundo texto del código `timer_running`, y no reusa
el primero —«Detené el timer para agregar tiempo a mano.»— porque **la causa es
otra**, según el criterio de «Una redacción por causa» del documento de
paridad: en TT-30 el obstáculo es que exista cualquier timer abierto y el
remedio es detenerlo; acá el obstáculo es que la fila tocada es la que corre, y
el remedio no es detener nada sino corregir el inicio desde el contador
(TT-28). Un texto que mandara a detener el timer mandaría a hacer algo
innecesario. El código sí es el mismo: clasifica el hecho para la interfaz —hay
una entrada abierta en el camino— y ninguno de los dos casos se reintenta.

`TimeEntryView` suma un campo, `editableTimes` (§5). Todo lo demás se reusa sin
tocar: `tooShort`, `nonexistentClock` (TT-112), `beforeWorkspace`,
`invalidDate`, `invalidClock`, `notFound`, `forbidden`, `forbiddenOtherOwner`,
`alreadyStopped`, `endBeforeStart` y `unexpected`.

### 4.1 `updateEntryTimes` — TT-54, TT-55, TT-56, TT-72, TT-73, TT-82, TT-111, TT-112

```ts
export const updateEntryTimesInput = z.object({
  id: z.uuid(),
  /** Día local del inicio. Mismo formato y misma refinación que el slice 2. */
  date: dayKeyInput,
  start: clockInput,
  /** Menor que el inicio significa el día siguiente (TT-72). */
  end: clockInput,
});

export type UpdateEntryTimesInput = z.infer<typeof updateEntryTimesInput>;

export type UpdateEntryTimesResult = {
  readonly entry: TimeEntryView;
  /** La entrada quedó por debajo del tramo que la lista dibuja (TT-108). */
  readonly outsideWindow: boolean;
};
```

Firma del service, con `TrackerWorkspace`, el tipo mínimo de workspace que ya
usan `createManualEntry` y `getTrackerState`:

```ts
export async function updateEntryTimes(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateEntryTimesInput,
  now: Date = new Date(),
): Promise<UpdateEntryTimesResult>;
```

**Viaja el estado completo de los tres campos, no el campo que cambió.** Los
tres se interpretan juntos —el fin depende del inicio para saber si cae al día
siguiente, y los dos dependen de la fecha—, así que un parche obligaría al
servidor a mezclar lo que llega con lo que hay y a decidir qué gana. Con el
trío completo la conversión parte de la misma de `createManualEntry`, más la
conservación del ADR 0006 (pasos 4 y 5), y el resultado de dos escrituras
simultáneas es siempre el de uno de los dos tríos, nunca una mezcla. El precio
es que gana la última escritura, y más grueso que en la descripción: §8.

Reglas del service, en orden, dentro de una transacción:

1. `readOwnEntry(tx, actor, "timeEntry.own.update", input.id)`, que ya existe:
   lee con `FOR UPDATE`, devuelve `not_found` si no está en el workspace de la
   sesión (TT-80) y `forbidden` con el texto de TT-79 si es de otra persona.
2. Si `row.endedAt === null`, `timer_running` con `runningEntryTimes` (TT-111).
3. **Rótulos pedidos.** El de un extremo es el par día local y hora de pared.
   El del inicio es `(date, start)`; el del fin, `(endDay, end)`, con
   `endDay = crossesMidnight(start, end) ? addDaysToKey(date, 1) : date`
   (TT-72). Si `parseDayKey(endDay) === null` —el día siguiente al
   9999-12-31—, `validation` con `invalidDate`, igual que `createManualEntry`:
   es la fecha la que no sirve, no la hora.
4. **Conservación** (ADR 0006), con `resolveExtreme` sobre cada extremo: si el
   rótulo pedido coincide con el del instante guardado, se conserva tal cual,
   segundos y ocurrencia incluidos; si no, se convierte con `instantFromLocal`.
   Si la conversión da `null`, `validation` con `nonexistentClock` (TT-112,
   ADR 0005).
5. **Descarte** (ADR 0006). Si `endedAt − startedAt` es menor que un minuto, se
   descarta lo conservado y se recalculan **los dos** extremos con
   `instantFromLocal` desde sus rótulos. Ninguno puede dar `null` acá: el
   rótulo de un extremo conservado salió de un instante que existió.
6. **Tope del calendario.** Si `isAfterYear9999` es verdadero para algún
   instante resultante, `validation` con `invalidDate`, la misma regla de
   `createManualEntry`: un día válido al oeste de Greenwich puede caer en el
   año 10000 UTC, que no se serializa en ISO de cuatro cifras y rompe el
   registro de auditoría. Solo lo alcanza un extremo recalculado; uno
   conservado ya está guardado.
7. **Duración mínima, sobre los instantes resultantes** (ADR 0006). Si
   `endedAt − startedAt` sigue siendo menor que un minuto, `validation` con
   `tooShort` (TT-73).
8. Piso del workspace: si el día local de `startedAt` es anterior a
   `workspaceFloorDayKey(workspace)`, la misma función que calcula `minDayKey`
   en `TrackerState`, `validation` con `beforeWorkspace`. **No hay cota
   superior**: una entrada cerrada se puede mover al futuro, igual que se puede
   crear ahí (P-10).
9. `timeEntryRepository.updateTimes`. Si devuelve `undefined`, `timer_running`
   con `runningEntryTimes`: la guarda de la consulta no encontró una fila
   cerrada.
10. `recordAudit`.
11. `outsideWindow`. **Con la fila ya actualizada**, igual que el slice 2 lo
    calcula con la fila ya insertada: se releen
    `findLatestClosedBefore(…, now, tx)` y `findRunning(…, tx)` dentro de la
    misma transacción, y `outsideWindow` es
    `updated.startedAt < windowStart(now, timeZone, latestPast, running)`. Son
    las mismas consultas con las que `getTrackerState` arma el extremo
    inferior:
    - **`findLatestClosedBefore` y no `findLatestClosed`**: una entrada futura
      no estira la ventana hacia atrás, y contarla daría un extremo más tardío
      que el real y el aviso sobre una entrada que sí se ve.
    - **Después del update**: la fila movida puede dejar de ser la más reciente
      de las pasadas o pasar a serlo, y leer antes da la ventana de un estado
      que ya no existe.
    - **Con `running`**, a diferencia del slice 2: puede haber un timer
      corriendo y el extremo inferior incluye su día (regla de la sección 5 del
      slice 1). Pasarle `undefined` daría el mismo falso positivo.

    Contra el extremo superior no se compara, por el mismo motivo que en el
    slice 2: se estira hasta el día de la entrada más nueva, y la movida nunca
    lo supera.

La regla del ADR 0006 son dos funciones privadas de `service.ts`, una por
extremo y otra por par, armada encima de la primera:

```ts
/**
 * Paso 1 del ADR 0006: el instante guardado si su rótulo es el pedido; si no,
 * la conversión de la hora de pared. `null` si esa hora no existe (TT-112).
 */
function resolveExtreme(
  stored: Date,
  day: string,
  clock: string,
  timeZone: string,
): Date | null;

/** Pasos 3 a 7 de §4.1. Lanza `TimeEntryError` con el código de cada paso. */
function resolveEntryTimes(
  row: TimeEntryRow,
  input: UpdateEntryTimesInput,
  timeZone: string,
): { startedAt: Date; endedAt: Date };
```

`updateEntryTimes` usa `resolveEntryTimes`; `updateRunningStart`, que edita un
solo extremo, usa `resolveExtreme` directo (§4.2). Las dos son las que prueban
los criterios 6, 18, 19, 24 y 25. Ningún otro módulo las importa: la edición
masiva, el calendario y el timesheet llegan a la regla por las mutaciones
públicas del módulo (ADR 0006).

**`instantFromLocal` se usa por su regla, no por su implementación.** La regla
es la del ADR 0005: una hora que no existe da `null` y una que ocurre dos veces
da el segundo instante, el posterior al cambio, sin depender de la zona horaria
del proceso. Todo este contrato —la conservación, el descarte, la monotonía del
criterio 19 y los instantes esperados de los criterios 18, 24 y 25— razona
sobre esa regla.

**Por qué se conserva y se descarta** está en el ADR 0006, con el contraejemplo
de Madrid que descartó la resolución original de M-3 y el porqué del umbral de
un minuto. Lo que este contrato fija es su efecto sobre el veredicto de
`tooShort`: un par recalculado tiene los dos instantes en minutos exactos y es
monótono, así que dura cero exactamente cuando los dos rótulos son iguales, que
es la regla del slice 2. Un par conservado que llega al paso 7 ya dura un
minuto o más. El único veredicto que cambia es el de la hora repetida: `02:30`
en la primera ocurrencia y `02:30` en la segunda duran 60 minutos reales y se
aceptan. El alta manual no cambia: no tiene nada que conservar.

No se comprueba superposición (TT-82). Tampoco se vuelve a comprobar
`editableTimes`: lo que esta mutación escribe siempre lo pasa, porque el fin
resultante cae en el `endDay` del paso 3 —el recalculado por construcción, el
conservado porque su rótulo coincidió—, y una entrada cerrada no cambia de largo
por ningún otro camino. Ninguna pestaña puede mostrar entonces como editable
una entrada que no lo es; un pedido armado a mano sobre una entrada propia que
no pasa la regla la trunca, y es la misma persona que podría borrarla.

Errores posibles: `validation`, `not_found`, `forbidden`, `timer_running`,
`unexpected`. Permiso: `timeEntry.own.update`. Revalida `/`.

### 4.2 `updateRunningStart` — TT-28, TT-29, TT-75, TT-112

```ts
export const updateRunningStartInput = z.object({
  id: z.uuid(),
  /** Día local del inicio: un timer puede llevar días corriendo (TT-42). */
  date: dayKeyInput,
  start: clockInput,
});

export type UpdateRunningStartInput = z.infer<typeof updateRunningStartInput>;

export type UpdateRunningStartResult = { readonly running: TimeEntryView };
```

Firma del service:

```ts
export async function updateRunningStart(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: UpdateRunningStartInput,
  now: Date = new Date(),
): Promise<UpdateRunningStartResult>;
```

**Lleva el día además de la hora.** TT-28 habla solo de la hora, pero sin el día
la entrada es ambigua en el caso más común que el propio TT-28 describe: un
timer arrancado a las 00:10 que en realidad empezó a las 23:50 del día anterior.
Y con TT-42 un timer puede llevar días corriendo, donde una hora suelta no
significa nada. El día viaja explícito y el selector lo restringe a
`[creación del workspace, hoy]`. Mover el día es además lo que mueve el timer de
grupo (criterio 22).

Reglas del service, en orden, dentro de una transacción:

1. `readOwnEntry(tx, actor, "timeEntry.own.update", input.id)`.
2. Si `row.endedAt !== null`, `already_stopped` (§4.3).
3. **Conservación** (ADR 0006):
   `startedAt = resolveExtreme(row.startedAt, date, start, timeZone)`. Si da
   `null`, `nonexistentClock` (TT-112). No hay descarte: con un solo extremo no
   hay par que quede corto.
4. Si `startedAt > now`, `validation` con `futureTime` (TT-29, TT-75). El
   futuro lo define el reloj del servidor de la aplicación, no el del navegador
   (TT-75); que no coincida al milisegundo con el `now()` de la base es lo que
   cubre §4.5.
5. Piso del workspace, con `workspaceFloorDayKey` como en el paso 8 de §4.1 →
   `beforeWorkspace`.
6. `timeEntryRepository.updateStartOfRunning`. Si devuelve `undefined`,
   `already_stopped`: la guarda `ended_at is null` no encontró la fila.
7. `recordAudit`.

**Por qué también conserva.** Sin el paso 3, reguardar el inicio sin cambios
dentro de la hora repetida lo recalcula al segundo instante: si el timer
arrancó en la primera ocurrencia y esa franja todavía transcurre, el segundo
instante es futuro y la respuesta es `futureTime` sobre una hora que ya pasó; y
si la franja ya terminó, el inicio se mueve una hora. El criterio 24 tiene los
dos instantes. `running-start-editor` tampoco escribe si el par no cambió, pero
la regla no depende de eso: una pestaña desactualizada o un reintento pueden
mandar el par sin cambios igual.

El resultado no lleva `outsideWindow` y no hace falta: el extremo inferior de la
ventana ya incluye el día del timer activo desde el slice 1, así que mover su
inicio hacia atrás arrastra la ventana con él.

Errores posibles: `validation`, `not_found`, `forbidden`, `already_stopped`,
`unexpected`. Permiso: `timeEntry.own.update`. Revalida `/`.

### 4.3 Desenlaces con una pestaña desactualizada

Las dos mutaciones corrigen algo que otra pestaña puede haber cambiado mientras
tanto. Cada cruce tiene un desenlace fijado:

| Situación                                                                | Código            | Desenlace                                                                  |
| ------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------- |
| `updateEntryTimes` sobre una entrada que otra pestaña borró              | `not_found`       | «Esa entrada ya no existe.», sin escribir                                  |
| `updateEntryTimes` sobre la entrada que está corriendo                   | `timer_running`   | «Esta entrada es la que está corriendo.», sin escribir                     |
| `updateRunningStart` sobre un timer que otra pestaña detuvo              | `already_stopped` | «Este timer ya había sido detenido.», sin escribir                         |
| `updateRunningStart` sobre una entrada que otra pestaña borró            | `not_found`       | «Esa entrada ya no existe.», sin escribir                                  |
| Cualquiera de las dos sobre una entrada de otra persona                  | `forbidden`       | «No tenés permiso para editar esta entrada.», sin escribir                 |
| Una parada o un arranque esperando el bloqueo de un `updateRunningStart` | —                 | La parada se escribe con `greatest(now(), started_at)`; nunca falla (§4.5) |

El timer detenido en el medio **no se edita igual**: el inicio que la persona
eligió lo eligió contra un timer que corría, y aplicarlo a una entrada que ya
tiene fin puede dejar el fin antes del inicio. Se devuelve el estado real y la
revalidación pone la pantalla al día, que es lo mismo que hace TT-41 con
«Detener».

La segunda fila es inalcanzable desde la interfaz —una entrada cerrada no se
reabre y la abierta no es una fila de la lista (§1)—, así que solo la produce un
pedido armado a mano. Está igual, porque es la respuesta que TT-111 fija.

Dos ediciones simultáneas de la misma fila no necesitan regla nueva: el
`FOR UPDATE` de `readOwnEntry` serializa las dos transacciones y el payload
completo garantiza que el resultado sea el de uno de los dos tríos, no una
mezcla. Gana la última.

### 4.4 Las dos sí ofrecen «Reintentar»

El slice 2 tuvo que sacarle el botón de reintento a `createManualEntry`
(TT-109): con una respuesta perdida, repetir el pedido crea una entrada
duplicada. **Acá no pasa**, y está verificado contra el diseño de este contrato,
no supuesto por analogía:

- **Las dos llegan a un punto fijo.** Escriben sobre la fila identificada por
  su `id` los instantes que resultan de §4.1 o §4.2. Esos instantes dependen
  del payload y, por la conservación, de la fila guardada; pero después de un
  intento exitoso cada extremo guardado tiene exactamente el rótulo pedido —el
  conservado porque ya lo tenía, el recalculado porque `instantFromLocal`
  devuelve un instante con ese rótulo, también en la hora repetida— y, en
  `updateEntryTimes`, el par ya dura un minuto o más. El segundo intento
  conserva todo, no descarta nada y escribe lo mismo. `createManualEntry` era
  distinta porque cada intento producía una fila nueva.
- **Ninguna validación cambia de veredicto entre el primer intento y el
  segundo.** El piso compara contra la creación del workspace, que no cambia.
  `futureTime` compara contra `now`, que en el reintento es posterior: un inicio
  que pasó la primera vez pasa la segunda. `invalidDate` y `nonexistentClock`
  dependen solo del payload. `tooShort` depende además de la fila, que en el
  reintento ya es el resultado del primero, que lo pasó.
- **Las guardas del repository no lo rompen.** La de `updateTimes` es
  `ended_at is not null`, y un primer intento exitoso no la invalida: la fila
  sigue cerrada. La de `updateStartOfRunning` es `ended_at is null`: si entre
  los dos intentos nadie detuvo el timer, el segundo escribe lo mismo; si
  alguien lo detuvo —y aunque haya arrancado otro—, el segundo apunta al `id`
  viejo, encuentra la fila cerrada y responde `already_stopped`, que es el
  desenlace de §4.3 y nunca toca el timer nuevo.
- **`outsideWindow` es una lectura, no una escritura**: puede dar distinto en
  el reintento si la lista cambió, y eso solo cambia el aviso.
- **El reintento manda el mismo pedido.** `useEntryAction` guarda el último
  `input` entero y `retry` lo vuelve a mandar tal cual; `retryHandlerOf` ofrece
  el botón solo con `unexpected` (`use-entry-action.ts`).

Dos consecuencias honestas del reintento, ninguna de las cuales lo desaconseja:

- Deja **dos registros de auditoría** con el mismo valor nuevo. Es correcto:
  hubo dos escrituras y el registro las muestra.
- Si entre la respuesta perdida y el reintento otra pestaña editó la misma
  fila, el reintento la pisa. No es propio del reintento: es la regla «gana la
  última» de §4.3, que vale igual sin reintentar.

Por eso las dos usan `retryHandlerOf` sin cambios y el aviso ofrece
«Reintentar» como piden TT-89 y TT-90. Con `unexpected` el texto es el genérico
de `timeEntryMessages.unexpected`, que acá sí es un buen consejo. Con
`validation`, `not_found`, `timer_running` o `already_stopped` no hay botón,
porque repetir el mismo pedido no cambia el desenlace.

### 4.5 La parada después de mover el inicio

Hasta este slice el `started_at` de una entrada abierta siempre salía de
`now()`, así que cualquier cierre posterior escribía un `ended_at` mayor o
igual. **`updateRunningStart` rompe esa invariante**: el inicio nuevo sale de
una hora tecleada y puede quedar después del `now()` de una transacción que ya
empezó. Dos caminos lo vuelven real:

- Una parada que ya empezó y espera el `FOR UPDATE` mientras otra pestaña
  adelanta el inicio. Al destrabarse escribe su `now()`, que es el del comienzo
  de su transacción y queda antes del inicio recién escrito.
- El reloj del servidor de la aplicación, contra el que se valida `futureTime`,
  adelantado respecto del de la base.

En los dos, el `check` rechaza el cierre. `stopTimer` lo traduce a `validation`
con `endBeforeStart`, que tampoco es un buen desenlace, y `startTimer` —que
cierra el timer anterior con el mismo `stopById`— **no lo traduce** y sale por
`unexpected`: «Revisá la conexión», con un botón de reintento, sobre un error
que no es de red.

Las dos correcciones:

- **`stopById` escribe `greatest(now(), started_at)`.** El `check` ya es `>=`,
  y TT-101 admite la duración cero cuando la produce el timer. No es un tercer
  camino de los que el ADR 0005 cierra: la parada sigue naciendo de `now()`, con
  un piso que es un instante que la fila ya tiene.
- **`startTimer` traduce `isEndBeforeStart` igual que `stopTimer`**, a
  `validation` con `endBeforeStart`. Con la primera corrección el `check` no
  puede saltar por este camino; la traducción queda como red, para que si algún
  día salta no se presente como un problema de red.

El arranque que cierra un timer cuyo inicio quedó en el futuro abre el nuevo con
`now()`, antes del fin del anterior: quedan superpuestos por segundos, que TT-82
admite.

### Repository

Dos métodos nuevos, los dos con la guarda que hace que la escritura no dependa
de que el service haya hecho su parte, igual que `stopById`:

```ts
/** Solo una fila cerrada. `undefined` si la entrada está corriendo. */
updateTimes(
  tx: Transaction,
  target: EntryTarget,
  times: { startedAt: Date; endedAt: Date },
): Promise<TimeEntryRow | undefined>;

/** Solo una fila abierta. `undefined` si ya la cerraron. */
updateStartOfRunning(
  tx: Transaction,
  target: EntryTarget,
  startedAt: Date,
): Promise<TimeEntryRow | undefined>;
```

La primera agrega `is not null` sobre `ended_at` en el `WHERE`; la segunda,
`is null`. **Las dos guardas son inalcanzables a través del service**, que ya
leyó la fila con `FOR UPDATE` y comprobó lo mismo: su test llama al repository
directo, como ya hace `permissions.integration.test.ts` con `stopById`.

Lo único que cambia de lo existente es `stopById` (§4.5). `findRunning`,
`findLatestClosedBefore` y `findByIdForUpdate` ya sirven.

### Audit log

Dos filas nuevas en la tabla del slice 1:

| Action               | `action` del audit      | `previousValue`          | `nextValue`              |
| -------------------- | ----------------------- | ------------------------ | ------------------------ |
| `updateEntryTimes`   | `timeEntry.updateTimes` | `{ startedAt, endedAt }` | `{ startedAt, endedAt }` |
| `updateRunningStart` | `timeEntry.updateStart` | `{ startedAt }`          | `{ startedAt }`          |

Son dos `action` distintos y no uno solo con forma variable: en el registro hay
que poder separar «alguien corrigió el horario de una entrada ya cargada» de
«alguien corrigió desde cuándo corre su timer», que son dos afirmaciones
distintas sobre lo mismo. La parada de §4.5 sigue registrando `timeEntry.stop`
con el `endedAt` que de verdad quedó escrito.

## 5. Contrato de lectura

**`getTrackerState` cambia en un campo de la vista, no en su consulta.** Su
firma, `TrackerState` —con el `todayKey` y el `minDayKey` que trae desde el
slice 2—, las reglas de armado y la ventana siguen igual. Lo que cambia es
`TimeEntryView`, que suma un campo derivado de los dos instantes que `toView`
ya tiene:

```ts
/**
 * El trío de la vista, interpretado con la regla de `updateEntryTimes`, vuelve
 * a dar el mismo fin. En falso la fila muestra sus horarios en solo lectura
 * (TT-110). Siempre falso en una entrada que corre (TT-111).
 */
editableTimes: z.boolean(),
```

La regla vive en `service.ts`, al lado de `toView`, y es el **round-trip exacto
al minuto** del trío que la vista muestra:

```
editableTimes =
  endedAt !== null &&
  dayKey(endedAt, timeZone) ===
    (crossesMidnight(startLabel, endLabel) ? addDaysToKey(dayDate, 1) : dayDate)
```

Inicio y fin vuelven siempre a su misma hora de pared; lo único que el trío
puede perder es en qué día cae el fin, y eso es lo que se compara. Es al minuto
y no al segundo porque las entradas del timer llevan segundos y el trío no:
pedir el round-trip al segundo dejaría en solo lectura casi todo lo que el timer
produce. Los segundos no se pierden por eso: con la conservación del ADR 0006,
el extremo que no se tocó los mantiene, igual que su ocurrencia en la hora
repetida.

Por qué en el servidor y no en el cliente: `extraDays` es la diferencia de días
locales, no la duración. Una entrada de 25 horas tiene `extraDays === 1`, una
regla `extraDays <= 1` la declara editable, el editor muestra `05:00–06:00` y
confirmar —aunque sea sin tocar nada— la trunca a una hora. El servidor tiene
los dos instantes y puede afirmar el round-trip; el cliente no. Y así la regla
de negocio sale de `components/`.

Es la misma regla que enuncia TT-110, y equivale a **«menos de 24 horas de
reloj, al minuto»**: la **distancia de reloj** entre los rótulos de los dos
extremos —cada hora de pared con su día, contada en minutos enteros y sin pasar
a instantes— va de 0 a 1439 minutos. Los topes son de reloj sobre los rótulos,
no de duración:

- **Una entrada de 30 segundos es editable**: su distancia de reloj es de 0 o
  1 minuto.
- **Una de 23 h 59 min 40 s puede no serlo**: de `10:00:50` a `10:00:30` del
  día siguiente, los dos rótulos son `10:00` y la distancia es de 1440
  minutos. Por los segundos de cada extremo, la duración real de una entrada
  editable puede quedar hasta un minuto por encima o por debajo de su
  distancia de reloj.
- **Cruzando un cambio de horario**, distancia y duración difieren en una hora:
  una entrada a 23 h 30 min de reloj que cruza el atraso dura 24 h 30 min
  reales y se edita; una a 24 h 30 min de reloj que cruza el adelanto dura
  23 h 30 min reales y queda en solo lectura.
- **La distancia negativa** tiene un solo caso: los dos extremos dentro de la
  hora que se repite, el inicio en la primera pasada y el fin en la segunda, con
  una hora de pared menor. No se edita, porque el trío lo leería como una
  entrada que termina al día siguiente. Muestra el texto de TT-110 aunque dure
  minutos; es un caso de una hora al año en las zonas con cambio de horario, y
  no justifica un texto propio.

La vista ya trae lo que los dos editores necesitan para arrancar, en el formato
canónico de las actions:

| Campo de `TimeEntryView` | Lo usa                                                 |
| ------------------------ | ------------------------------------------------------ |
| `dayDate`                | el `date` del borrador, ya como `"2026-10-02"`         |
| `startLabel`             | el `start`, ya como `"HH:mm"` en 24 h                  |
| `endLabel`               | el `end`                                               |
| `editableTimes`          | si la fila ofrece el editor o la solo lectura (TT-110) |

No hay que volver a derivar nada desde el ISO ni pasar la zona horaria al
editor: el servidor ya resolvió el formato, que es la regla de la sección 5 del
slice 1. Los dos días que el selector necesita, hoy y el piso, llegan en
`TrackerState`; ningún componente los calcula.

### `src/server/time` no cambia

Ninguna función nueva. Las que hacen falta están todas desde el slice 2:
`parseClockInput` y `parseDurationInput` para los campos, `clockDifferenceMinutes`
y `shiftClock` para las derivaciones del borrador, `crossesMidnight` para el
día del fin en el service y en `editableTimes`, `instantFromLocal`,
`addDaysToKey`, `dayKey` y `formatClock` para la conversión y la conservación,
`isAfterYear9999` para el tope del calendario, `parseDayKey` para la refinación
de Zod y el día de fin, y `dayKeyLabel` para el rótulo del selector de fecha y
del aviso de TT-108. El archivo no está en la lista de nadie en la sección 6:
si alguien cree que necesita una función nueva, la pide y justifica por qué las
que hay no alcanzan.

## 6. Reparto de archivos

Las dos listas son disjuntas. Rutas absolutas; **(nuevo)** marca los archivos
que este slice crea.

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

Los casos que solo cubre la base, con `npm run test:integration`: los seis
desenlaces de la tabla de §4.3, las dos guardas del repository llamándolo
directo, el piso del workspace, `outsideWindow` con un timer corriendo, con una
entrada futura presente y con la fila movida que deja de ser la más reciente de
las pasadas, el cruce de medianoche, los dos cambios de horario de
`Europe/Madrid`, la conservación y el descarte con los instantes del criterio
24, los dos rechazos de fecha del criterio 25, `editableTimes` con entradas
sembradas de más de 24 horas y en el borde de los segundos, la parada de §4.5 y
la idempotencia de §4.4. Las factories y las consultas de verificación ya
existen en `src/test/`: `seedTimeEntry` siembra cualquier par de instantes,
abiertos o cerrados, con segundos y en cualquier ocurrencia de la hora
repetida.

**La capa de `actions.ts` ya tiene dónde probarse.**
`actions.integration.test.ts` reemplaza con dobles las tres puertas que exigen
contexto de petición —`next/headers`, `next/cache`, `next/navigation`— y
`auth.api.getSession`, y deja correr de verdad `requireSession`,
`ensureWorkspaceContext`, `can()`, el service y la base. El doble de
`next/cache` registra cada ruta revalidada, así que la revalidación se afirma
por action y no por el conjunto. Las dos actions nuevas suman ahí sus casos:
la traducción del `ZodError` del trío, la del error de dominio, la de la falta
de permiso, la revalidación en el camino de error y el `already_stopped` de
`updateRunningStart`, que es la carrera que más cuesta ver desde afuera.

`backend-dev` no toca `src/server/db/schema.ts`, `drizzle/`,
`src/server/permissions/` ni `src/server/time/`.

### frontend-dev

```
/home/maxi/program/clock/src/modules/time-entry/components/tracker-screen.tsx
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-list.tsx          (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/entry-row.tsx
/home/maxi/program/clock/src/modules/time-entry/components/entry-times-editor.tsx  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/day-group.tsx
/home/maxi/program/clock/src/modules/time-entry/components/timer-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/running-start-editor.tsx (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/elapsed-counter.tsx
/home/maxi/program/clock/src/modules/time-entry/components/elapsed.ts
/home/maxi/program/clock/src/modules/time-entry/components/elapsed.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/time-draft.ts           (nuevo, por renombre)
/home/maxi/program/clock/src/modules/time-entry/components/time-draft.test.ts      (nuevo, por renombre)
/home/maxi/program/clock/src/modules/time-entry/components/manual-draft.ts         (se borra)
/home/maxi/program/clock/src/modules/time-entry/components/manual-draft.test.ts    (se borra)
/home/maxi/program/clock/src/modules/time-entry/components/manual-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/clock-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
```

`manual-draft.ts` y su test se borran en el mismo commit que crea
`time-draft.ts` y el suyo, con `git mv` para que la historia los siga.
**Los documentos de correcciones son históricos y no se reescriben**: ni ellos
ni el contrato del slice 2 se tocan por el renombre, y siguen nombrando
`manual-draft.ts`.

Sin dependencias nuevas: `clock-field`, `date-field`, el popover y el calendario
ya están desde el slice 2. `package.json`, `package-lock.json` y
`components.json` no se tocan, y por eso no están en ninguna lista.

### Lo que no toca ninguno de los dos

`src/server/db/schema.ts`, `drizzle/`, `src/server/permissions/`,
`src/server/time/`, `src/server/session.ts`, `src/app/`, `src/components/ui/`,
`src/test/`, los `vitest.config` y `e2e/`. Cualquier archivo que no esté en
ninguna de las dos listas se pide antes de tocarlo.

Los recorridos de navegador van en `e2e/entry-times.spec.ts` **(nuevo)**.
**Dueño: `tests-slice3`**, no `backend-dev` ni `frontend-dev`.
`e2e/tracker.spec.ts`, `e2e/tracker-page.ts` y `e2e/manual-entry.spec.ts` no se
modifican: el contador conserva su rol y su nombre accesible justamente para
que los helpers del slice 1 sigan sirviendo.

### Handshake de orden

1. **Primer commit de `backend-dev`**: `schema.ts` con los dos esquemas de
   entrada, sus tipos, los dos tipos de resultado, los dos mensajes nuevos y
   `editableTimes` en `timeEntryView`; `toView` calculándolo; y las firmas de
   las dos funciones en `service.ts` y en `actions.ts`, tal como están en §4.
2. **`frontend-dev` arranca en paralelo** por el renombre de `time-draft.ts` y
   su test; por la cota superior y el aviso de apertura de `date-field.tsx`; por
   `Esc` y Enter en `clock-field.tsx`; por las dos funciones de `elapsed.ts`; y
   por `entry-list.tsx` con su composición en `tracker-screen.tsx`. Nada de eso
   depende del commit anterior.
3. Con el primer commit en la rama, `frontend-dev` sigue con los dos editores,
   la fila, el grupo y la barra.

### Responsabilidades que no se leen en el nombre del archivo

- **`time-draft.ts`** es el renombre de `manual-draft.ts`: el módulo deja de
  ser «el borrador de la barra manual» para ser «el borrador de un trío
  `{ date, start, end }`», que es lo que de verdad modela. Renombra sus tipos y
  parte el de los campos, porque la fila no tiene duración:

  | Antes               | Después                                                       |
  | ------------------- | ------------------------------------------------------------- |
  | `ManualDraft`       | `TimeDraft`                                                   |
  | `ManualDraftChange` | `TimeDraftChange<Field extends ManualField = TimeField>`      |
  | `ManualField`       | `TimeField = "start" \| "end"`, los campos que tienen los dos |
  |                     | `ManualField = TimeField \| "duration"`, solo la barra manual |

  `withStart` y `withEnd` devuelven `TimeDraftChange` y `withDuration`,
  `TimeDraftChange<"duration">`. `reset` no cambia; lo importan `tracker-bar.tsx`,
  que es el dueño del borrador del alta, y nadie más. Gana además el
  **constructor del borrador desde la vista**, con test:

  ```ts
  /** El trío de una entrada cerrada, tal como lo trae la vista (§5). */
  export function fromView(entry: {
    readonly dayDate: string;
    readonly startLabel: string;
    readonly endLabel: string;
  }): TimeDraft;
  ```

  No tiene ninguna regla de editabilidad: esa es `editableTimes`, del servidor.

- **`entry-row.tsx`** obedece `editableTimes` y `canTrack`, y dibuja tres
  estados:
  - **Editable.** Las horas —`08:00 – 10:30`, con su `+1`— son un botón cuyo
    nombre accesible es el texto visible más « — editar el horario» en
    `sr-only`, el mismo recurso que ya usa el botón de la descripción. Al lado,
    un botón con ícono de calendario y nombre accesible «Cambiar la fecha de la
    entrada «nombre»», con el nombre de la entrada como en el menú de acciones.
    Los dos abren `entry-times-editor` en el lugar de las horas: el primero con
    el foco en el inicio, el segundo con el calendario abierto. La fila no
    muestra la fecha como texto, porque ya la dice el encabezado del grupo.
  - **Solo lectura (TT-110).** Las horas como texto, sin botón ni ícono de
    calendario, y debajo, en texto chico y gris,
    `trackerLabels.multiDayTimesReadOnly`.
  - **Con `canTrack` en falso.** Las horas como texto y nada más: el motivo ya
    lo da el aviso de TT-92.
- **`entry-times-editor.tsx`** es el trío de controles de la fila: dos
  `clock-field` y un `date-field` —piso en `minDayKey`, sin cota superior—,
  sobre un borrador de `time-draft.ts` armado con `fromView`. El `date-field` es
  el del slice 2, con su nombre accesible «Fecha de la entrada: rótulo» y
  dibujado después de las dos horas, como en la barra manual. El editor no
  llama a ninguna action: avisa hacia arriba cuando el trío quedó confirmado,
  igual que `description-field` desde el slice 1. Sus reglas:
  - **Se confirma al salir del editor**, cuando el foco termina fuera del grupo
    de los tres controles, o con Enter en un campo de hora. Moverse entre los
    tres no escribe. Si el trío confirmado es igual al de la vista, no avisa
    nada y no hay escritura.
  - **El calendario cuenta como parte del editor.** Se dibuja en un portal,
    fuera del grupo en el DOM, así que pasar el foco al calendario no confirma;
    cerrarlo con el foco fuera del editor sí.
  - **`Esc` en cualquiera de los tres controles descarta los tres** y los
    devuelve a los de la vista (TT-55). Con el calendario abierto, `Esc` solo lo
    cierra.
  - **El borrador vigente vive también en una ref.** El blur de un campo
    normaliza su valor y, en el mismo evento, el foco puede estar saliendo del
    grupo: la confirmación tiene que leer el trío con el valor recién
    normalizado, no el del render anterior. Lo mismo con Enter.
  - **No valida la duración cero en el cliente.** El veredicto es del servidor
    (§4.1), que acepta dos horas iguales cuando los instantes conservados
    duran un minuto o más. A diferencia de la barra manual, que inhabilita
    «Agregar», el editor confirma igual.
  - **Deriva la duración visible del borrador** mientras está abierto, con
    `draftDuration` y `draftExtraDays`, y el `+1` cuando cruza la medianoche.
    Al confirmar, la fila sigue mostrando ese trío atenuado mientras viaja la
    escritura; cuando llega la vista nueva manda la del servidor, que puede no
    coincidir con la resta de pared en dos casos: un día con cambio de horario
    (TT-97) y un extremo conservado con segundos (§4.1). En la hora repetida la
    diferencia es visible: mientras el editor está abierto, dos horas iguales
    muestran `0:00` y el servidor guarda los 60 minutos reales. Si falla, vuelve
    a los valores de la vista.
- **`clock-field.tsx`** gana dos props opcionales y nada más:
  `onCancel?: () => void`, que con `Esc` devuelve el texto al valor canónico y
  avisa, y `onSubmit?: () => void`, que con Enter corre **después** de
  normalizar, tanto si el valor se aceptó como si el campo no tenía cambios; no
  corre si el valor se rechazó. El blur sigue normalizando el campo sin llamar a
  ninguna action. La barra manual no pasa ninguna de las dos y su conducta no
  cambia; la noción de grupo es del editor, no del campo.
- **`date-field.tsx`** suma dos props opcionales: `maxDayKey?: string`, la cota
  superior del calendario, y `onOpenChange?: (open: boolean) => void`, para que
  el editor sepa cuándo el foco está en el calendario. La barra manual del
  slice 2 no pasa la cota, porque P-10 acepta el futuro; el editor del timer
  activo la fija en hoy, porque TT-29 no lo acepta. Las dos reglas conviven en
  el mismo control y ninguna es el valor por omisión de la otra.
- **`day-group.tsx`** es el dueño de la mutación de horas, por el mismo motivo
  por el que ya es dueño del borrado: la edición puede sacar la fila del grupo
  —TT-56— y el aviso de falla tiene que sobrevivir a que la fila se vaya. Dibuja
  ese aviso con `trackerLabels.entryTimesNotSaved`. El de `outsideWindow` no es
  suyo: se lo pasa a la lista con `onOutsideWindow(día)`, donde el día es el
  `date` del pedido, y le avisa con `onOperationStart()` cuando empieza
  cualquier operación. Usa `useElapsedSeconds` para el total del día del timer
  activo, así que el cambio del hook le aplica igual que al contador.
- **`entry-list.tsx`** (nuevo) es el contenedor cliente de la lista: recibe
  `days`, `running`, `serverNow`, `canTrack`, `todayKey` y `minDayKey`, dibuja
  los `DayGroup` y es el dueño del aviso de TT-108 de una fila movida. El aviso
  no puede vivir en el grupo: si la fila movida era la única de su día, la
  revalidación borra el grupo y el aviso se iría con él. Se dibuja arriba de
  los grupos, con `trackerLabels.outsideWindowTitle` y
  `outsideWindowMessage(dayKeyLabel(día, todayKey))`, los mismos textos del
  aviso del alta manual, y baja con la regla de siempre: cualquier operación
  nueva de cualquier grupo lo limpia.
- **La fila no se mueve de grupo de forma optimista.** Mientras la escritura
  viaja, la fila queda atenuada en su día viejo (TT-55) y la revalidación la
  dibuja en el nuevo. Mover una fila entre dos grupos de forma optimista exige
  coordinar dos componentes que hoy tienen su estado por separado, y el
  resultado visible —una fila que salta— es el mismo. Lo optimista es el estado
  atenuado con el trío confirmado.
- **`elapsed.ts`** exporta las dos decisiones que hoy están escondidas en el
  hook: cuándo empieza una medición nueva y qué parte de lo medido vale.
  Dependen **solo de `serverNow`**, no del `startedAt`:

  ```ts
  export type Measurement = {
    /** `serverNow` contra el que se mide. */
    readonly anchor: string;
    /** `Date.now()` del cliente cuando empezó a medirse contra ese ancla. */
    readonly fromMs: number;
  };

  /** Con el mismo ancla devuelve la medición anterior; con otro, empieza una. */
  export function measurementFor(
    previous: Measurement | null,
    serverNow: string,
    nowMs: number,
  ): Measurement;

  /** Transcurrido actual: lo medido vale mientras el ancla sea el `serverNow` vigente. */
  export function currentElapsedSeconds(
    measurement: Measurement,
    current: {
      readonly startedAt: string;
      readonly serverNow: string;
      readonly nowMs: number;
    },
  ): number;
  ```

  Lo medido es `nowMs − fromMs`, dos lecturas del mismo reloj, así que el
  desfase se cancela. `elapsedSeconds` sigue igual y `currentElapsedSeconds` la
  usa. Que `measurementFor` devuelva la medición anterior con el mismo ancla es
  lo que hace que un intervalo que se reinicia —por ejemplo, una parada que
  falla y vuelve a mostrar el timer corriendo— siga midiendo desde el montaje
  original: el contador no retrocede.

- **`elapsed-counter.tsx`**: el `<span role="timer" aria-label="Tiempo
transcurrido">` queda como está, visible y sin `aria-hidden`. Es lo que un
  lector de pantalla anuncia y lo que usan los helpers de `e2e/tracker-page.ts`,
  que no se tocan. **El mecanismo está fijado**: un `<button>` «Editar la hora
  de inicio» (`trackerLabels.editRunningStart`), **hermano** del `span` en el
  DOM y **superpuesto** a él con posición absoluta, de modo que el clic sobre el
  número cae en el botón, como pide TT-28, sin que el botón contenga al
  contador en el árbol accesible. El botón solo existe con el timer corriendo y
  con `canTrack` en verdadero (TT-92). El hook guarda un `Measurement`, lo
  actualiza solo con `measurementFor` y lee el transcurrido con
  `currentElapsedSeconds`. El intervalo se reinicia con un `serverNow` nuevo o
  al pasar de parado a corriendo, **no** con un `startedAt` distinto.
- **`running-start-editor.tsx`** es el popover de TT-28: el día, con
  `date-field` restringido a `[minDayKey, todayKey]`, y la hora, arrancando de
  `running.dayDate` y `running.startLabel`. «Guardar» confirma y `Esc`
  descarta; **si el par no cambió, no escribe**. No usa `time-draft.ts`: son dos
  campos sin derivación entre ellos, sin duración que mover ni fin que dar
  vuelta, y meterlo ahí obligaría a modelar un fin opcional que nadie usa. Al
  confirmar, la barra queda atenuada hasta que responde el servidor; el contador
  salta al transcurrido nuevo cuando llega la vista nueva, sin recargar.
- **`timer-bar.tsx`** hospeda ese editor y su action, y dibuja el aviso de
  falla con `trackerLabels.runningStartNotSaved`. Recibe `todayKey` y
  `minDayKey` de `tracker-bar.tsx`.
- **`tracker-screen.tsx`** compone `EntryList` con `state.todayKey` y
  `state.minDayKey` en vez de mapear los `DayGroup`. **`tracker-bar.tsx`** les
  pasa esos dos valores a `TimerBar` además de a `ManualBar`, importa `reset` de
  `time-draft.ts` en vez de `manual-draft.ts` —su `manualDraft` pasa a ser un
  `TimeDraft`— y dibuja el aviso de TT-108 del alta manual con los textos de
  `labels.ts` en vez de los suyos.
- **`labels.ts`** declara los textos nuevos de la pantalla:

  | Clave                   | Texto                                                                                  | Origen |
  | ----------------------- | -------------------------------------------------------------------------------------- | ------ |
  | `entryTimesNotSaved`    | «No se pudo guardar el horario de la entrada.»                                         | TT-90  |
  | `runningStartNotSaved`  | «No se pudo guardar el inicio del timer.»                                              | TT-90  |
  | `multiDayTimesReadOnly` | «Esta entrada dura más de un día; sus horarios no se pueden editar acá.»               | TT-110 |
  | `editRunningStart`      | «Editar la hora de inicio»                                                             | TT-28  |
  | `outsideWindowTitle`    | «La entrada se guardó, pero todavía no se ve en la lista.»                             | TT-108 |
  | `outsideWindowMessage`  | `(dayLabel) => «Quedó en el día ${dayLabel}, anterior al tramo que la lista muestra.»` | TT-108 |

  Los dos títulos de falla nombran la **operación** y no el campo: el payload
  es el trío entero y no hay un campo que haya fallado solo (TT-90). Los dos
  textos de TT-108 son los que hoy están escritos en `tracker-bar.tsx`, que
  dibuja el aviso del alta manual; pasan acá porque ahora los usan dos
  componentes y la causa es una sola.

## 7. Criterios de aceptación

Observables desde afuera. Cada uno dice con qué test se verifica; el que no se
puede verificar con ninguno está en la sección 8, nombrado, y no figura acá con
un dueño inventado.

1. **TT-54, TT-55** — Hacer clic en las horas de una fila, o en su botón de
   fecha, abre el editor del horario. El trío se confirma al salir del editor o
   con Enter: **editar el inicio y el fin seguidos produce una sola
   escritura**, y moverse entre los tres controles no escribe. `Esc` descarta
   los tres y no escribe. Mientras la escritura viaja la fila queda atenuada; si
   falla, los tres valores vuelven a los anteriores y aparece el aviso «No se
   pudo guardar el horario de la entrada.» con el mensaje del error.
2. **TT-19, TT-20, TT-21** — Los campos de la fila aceptan los mismos formatos
   que la barra manual y, ante algo que no se puede interpretar, vuelven al
   valor anterior y el borrador queda igual.
3. **TT-54** — La duración de la fila no es editable. Mientras el editor está
   abierto se recalcula sola a partir del borrador; después de guardar es la
   del servidor.
4. **TT-56, TT-45** — Cambiar la fecha de una fila la mueve al grupo del día
   nuevo y recalcula los totales de los dos días afectados.
5. **TT-72, TT-51** — Dejar el fin por debajo del inicio manda la entrada al día
   siguiente: la duración es la que cruza la medianoche y la fila muestra `+1`.
6. **TT-73** — Una edición cuyos instantes resultantes quedan a menos de un
   minuto se rechaza con «La entrada tiene que durar al menos un minuto.», los
   valores vuelven y la fila no cambia. Fuera de la hora repetida, el veredicto
   es el del slice 2: se rechaza exactamente cuando las dos horas son iguales.
7. **TT-112 y piso del workspace** — Los dos rechazos del slice 2, con los
   mismos mensajes, **por las dos actions**: `updateEntryTimes` rechaza con
   «Esa hora no existe por el cambio de horario.» (TT-112) una hora inexistente
   en cualquiera de los dos extremos y con `beforeWorkspace` un día anterior a
   la creación del workspace; `updateRunningStart` rechaza con los mismos dos
   mensajes una hora de inicio inexistente y un día anterior a la creación.
8. **TT-82** — Una edición que deja la entrada superpuesta con otra se guarda
   sin aviso.
9. **TT-28** — El botón «Editar la hora de inicio» abre el editor del inicio.
   Al guardar, el contador salta al transcurrido nuevo sin recargar la página y
   la entrada sigue corriendo. El contador sigue siendo el mismo `timer` con el
   nombre «Tiempo transcurrido». Que el clic sobre el número también lo abra es
   un observable sin test (§8).
10. **TT-29, TT-75** — Un inicio posterior al momento actual se rechaza con «No
    se pueden cargar horas que todavía no pasaron.» y el timer sigue como
    estaba. El selector de día del editor no deja elegir un día posterior a hoy.
11. **TT-32 al editar el inicio** — Con el mismo `serverNow`, un `startedAt`
    nuevo cambia el transcurrido exactamente en lo que se movió el inicio,
    **conservando lo medido desde el montaje**; un `serverNow` nuevo vuelve a
    medir desde cero; y reiniciar la medición con el mismo `serverNow` —una
    parada que falla— no hace retroceder el contador.
12. **TT-108, P-15: fuera de la ventana** — Mover una entrada por debajo del
    tramo que la lista dibuja la guarda igual, devuelve `outsideWindow` y
    muestra el aviso de TT-108 nombrando el día, arriba de la lista y con los
    mismos textos que el alta manual, **aunque el grupo de origen desaparezca**
    porque la movida era su única entrada. Con un timer corriendo que arrancó
    antes, la misma entrada **no** dispara el aviso, porque el día del timer
    activo extiende la ventana. Una entrada futura presente no cambia nada: con
    la movida como la más reciente de las pasadas, `outsideWindow` es falso. Si
    la entrada movida era la más reciente de las pasadas, deja de extender la
    ventana: el cálculo es posterior al update. El aviso es temporal y se
    retira con TT-52 (P-15).
13. **Carreras** — Los seis desenlaces de la tabla de §4.3: los cinco primeros
    con su mensaje y sin escribir nada; el sexto, con la parada escrita.
14. **TT-79, TT-80** — Editar la entrada de otra persona responde «No tenés
    permiso para editar esta entrada.»; editar un id inexistente, «Esa entrada
    ya no existe.»
15. **TT-66, TT-92** — Los cinco roles pueden editar las horas de sus entradas.
    Con la membresía desactivada las dos actions responden el mensaje neutro y
    ni la fila ni el contador ofrecen edición.
16. **TT-89, TT-90 con reintento** — Con la red caída al guardar el horario de
    una fila, los valores vuelven a los anteriores y el aviso «No se pudo
    guardar el horario de la entrada.» ofrece «Reintentar»; al guardar el inicio
    del timer, el aviso es «No se pudo guardar el inicio del timer.», también
    con «Reintentar». Reintentar deja la entrada en el mismo estado que un solo
    intento exitoso: ni duplicada ni movida dos veces.
17. **TT-110** — Una entrada cuyo trío no vuelve a dar el mismo fin trae
    `editableTimes` en falso y la fila muestra sus horas en solo lectura, sin
    botón de fecha, con «Esta entrada dura más de un día; sus horarios no se
    pueden editar acá.»; el resto de la fila se sigue editando.
18. **TT-97** — En un día con cambio de horario, las horas guardadas son las de
    pared que se editaron y la duración es la real. Con `Europe/Madrid`,
    `2026-10-25` de `01:00` a `04:00` son 180 minutos de pared y **240** reales;
    `2026-03-29` de `01:00` a `04:00` son 180 de pared y **120** reales.
19. **TT-81** — Ninguna combinación de los tres campos produce una entrada con
    el fin anterior al inicio. El par que se escribe es o bien uno con extremos
    conservados que dura un minuto o más, o bien uno recalculado entero desde
    las horas de pared, y en ese caso el fin menor que el inicio es el día
    siguiente (TT-72), la duración cero la rechaza TT-73, y `instantFromLocal`
    es estrictamente creciente en `Europe/Madrid` sobre los 1440 minutos de los
    seis días alrededor de los dos cambios de horario, con la medianoche del día
    siguiente siempre después de las 23:59 del anterior. La red del `check`
    sigue ahí y no cambia.
20. **Auditoría** — Cada edición deja un registro, `timeEntry.updateTimes` o
    `timeEntry.updateStart`, con los valores anterior y nuevo.
21. **La capa de action** — Las dos actions traducen un `ZodError` del trío a
    `validation` con el mensaje del issue, conservan código y mensaje de un
    error de dominio, usan el mensaje neutro cuando falta el permiso y
    **revalidan `/` también cuando devuelven error**.
22. **TT-28, TT-46: el timer que cambia de día** — Mover el inicio del timer
    activo a un día anterior lo saca del grupo de hoy y lo mete en el de ese
    día: el día del timer activo pasa a ser el nuevo y los totales de los dos
    días se recalculan.
23. **TT-101: la parada después de adelantar el inicio** — Una entrada abierta
    con el inicio posterior al `now()` de la base se detiene sin error, con el
    fin igual al inicio y duración cero, por `stopTimer` y por el cierre que
    hace `startTimer`.
24. **ADR 0006: conservación y descarte** — Un extremo cuyo día y hora no
    cambiaron conserva su instante; si el par queda a menos de un minuto, se
    recalculan los dos. Con instantes escritos:
    - **Descarte en la hora repetida.** Madrid, sembrada de
      `2026-10-24T23:50:00Z` (01:50) a `2026-10-25T00:50:00Z` (02:50, primera
      ocurrencia). Pedido `{ date: "2026-10-25", start: "02:10", end: "02:50" }`:
      el inicio va a `01:10:00Z`, el fin conservado quedaría antes, y se
      recalculan los dos. Resultado: `2026-10-25T01:10:00Z` a
      `2026-10-25T01:50:00Z`, 40 minutos.
    - **Conservación en la hora repetida.** Madrid, sembrada de
      `2026-10-25T00:30:00Z` (02:30, primera ocurrencia) a
      `2026-10-25T02:15:00Z` (03:15). Pedido con `end: "02:45"`: inicio
      conservado en `00:30:00Z`, fin en `01:45:00Z`, 75 minutos. Pedido con
      `end: "02:30"`: inicio en `00:30:00Z`, fin en `01:30:00Z`, 60 minutos y
      **aceptado**, aunque las dos horas sean iguales.
    - **Segundos del timer.** Buenos Aires, sembrada de `2026-10-01T13:00:40Z`
      (10:00:40) a `2026-10-01T13:30:15Z`. Pedido con `end: "11:00"`: inicio
      conservado en `13:00:40Z`, fin en `14:00:00Z`. Pedido con `end: "10:01"`:
      el conservado daría 20 segundos, se recalculan los dos y queda de
      `13:00:00Z` a `13:01:00Z`, aceptado.
    - **Timer en la primera ocurrencia.** Madrid, timer sembrado en
      `2026-10-25T00:20:00Z` (02:20, primera ocurrencia), con `now` fijo en
      `2026-10-25T00:40:00Z`. `updateRunningStart` con
      `{ date: "2026-10-25", start: "02:20" }`: conservado, aceptado, el inicio
      sigue en `00:20:00Z`; sin conservar habría ido a `01:20:00Z`, posterior a
      `now`, y habría dado `futureTime`. Con `start: "02:10"`: el inicio
      cambiado va al segundo instante, `01:10:00Z`, posterior a `now`, y la
      respuesta es `futureTime` sin escribir (§8).
25. **Fechas en el borde del calendario** — `updateEntryTimes` rechaza con
    `invalidDate` y sin escribir, igual que el alta manual: con
    `{ date: "9999-12-31", start: "23:00", end: "01:00" }`, porque el día de fin
    no tiene clave; y en Buenos Aires con
    `{ date: "9999-12-31", start: "20:00", end: "22:00" }`, porque el fin cae en
    `+010000-01-01T01:00:00Z`, posterior al año 9999 UTC.

### Con qué se verifica cada criterio

| Criterio | Tipo                 | Archivo                                                          | Qué afirma                                                                                                                                                                                      |
| -------- | -------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | e2e                  | `e2e/entry-times.spec.ts`                                        | una sola petición al editar inicio y fin seguidos; `aria-busy` en la fila mientras viaja; `Esc` sin petición y con los valores de antes                                                         |
| 2        | unidad               | `time-draft.test.ts`                                             | que el borrador de la fila use los mismos intérpretes y que un valor rechazado lo deje igual                                                                                                    |
| 3        | unidad + e2e         | `time-draft.test.ts`; `e2e/entry-times.spec.ts`                  | la duración derivada de `fromView` y de cada transición; y que la fila la muestre sin campo editable                                                                                            |
| 4        | integración + e2e    | `service.integration.test.ts`; `e2e/entry-times.spec.ts`         | el `dayDate` nuevo de la vista; y que la fila aparezca en el otro grupo con los dos totales recalculados                                                                                        |
| 5        | integración          | `service.integration.test.ts`                                    | los dos instantes, la duración y `extraDays: 1`                                                                                                                                                 |
| 6        | integración          | `service.integration.test.ts`                                    | el rechazo con `tooShort` con dos horas iguales fuera de la hora repetida, y que la fila quede sin tocar                                                                                        |
| 7        | integración          | `service.integration.test.ts`                                    | por las dos actions, `nonexistentClock` con `Europe/Madrid` y `beforeWorkspace` contra un workspace recién creado                                                                               |
| 8        | integración          | `service.integration.test.ts`                                    | que las dos entradas superpuestas queden y las dos sumen                                                                                                                                        |
| 9        | e2e                  | `e2e/entry-times.spec.ts`                                        | que el botón «Editar la hora de inicio» abra el editor, y que después de guardar el contador cambie de valor y la entrada siga abierta                                                          |
| 10       | integración + e2e    | `service.integration.test.ts`; `e2e/entry-times.spec.ts`         | el rechazo con `futureTime` contra un `now` fijo, sin escribir; y el día de mañana inactivo en el selector del editor                                                                           |
| 11       | unidad               | `elapsed.test.ts`                                                | mismo `Measurement` y `serverNow`, inicio diez minutos antes: exactamente 600 s más; `measurementFor` con el mismo ancla devuelve la anterior, con otro empieza                                 |
| 12       | integración + e2e    | `service.integration.test.ts`; `e2e/entry-times.spec.ts`         | `outsideWindow` verdadero sin timer, falso con un timer que extiende la ventana, falso con una futura presente, verdadero cuando la movida era la más reciente; y el aviso visible              |
| 13       | integración          | `service.integration.test.ts`; `actions.integration.test.ts`     | los seis desenlaces en el service; y que el `already_stopped` de `updateRunningStart` llegue como resultado tipado                                                                              |
| 14       | integración          | `service.integration.test.ts`; `actions.integration.test.ts`     | `forbidden` con el texto de TT-79 y `not_found` con el de TT-80, en el service y en el resultado de la action                                                                                   |
| 15       | integración          | `permissions.integration.test.ts`; `actions.integration.test.ts` | los cinco roles pueden; e `inactive` e `invited` reciben el mensaje neutro por las dos actions nuevas                                                                                           |
| 16       | integración + e2e    | `service.integration.test.ts`; `e2e/entry-times.spec.ts`         | que aplicar dos veces el mismo pedido deje el mismo estado, también con un extremo conservado; y el aviso con «Reintentar» tras abortar la petición                                             |
| 17       | integración          | `service.integration.test.ts`                                    | `editableTimes` sembrando con `seedTimeEntry`: falso con 25 h, 24 h justas, 48 h y 23 h 59 min 40 s de `10:00:50` a `10:00:30`; verdadero con 23 h 30 que cruza la medianoche y con una de 30 s |
| 18       | integración          | `service.integration.test.ts`                                    | los dos pares de Madrid con sus minutos reales, 240 y 120, y las horas de pared conservadas                                                                                                     |
| 19       | unidad + integración | `time-draft.test.ts`; `service.integration.test.ts`              | que el borrador nunca produzca una duración negativa; el caso de descarte del criterio 24; y que el `check` siga rechazando una escritura directa                                               |
| 20       | integración          | `audit.integration.test.ts`                                      | los dos `action` con sus valores anterior y nuevo                                                                                                                                               |
| 21       | integración          | `actions.integration.test.ts`                                    | las cuatro traducciones y la revalidación en el camino de error, para las dos actions nuevas                                                                                                    |
| 22       | integración          | `service.integration.test.ts`                                    | después de `updateRunningStart` al día anterior, `getTrackerState` da `isRunningDay` en ese grupo y no en el de hoy                                                                             |
| 23       | integración          | `service.integration.test.ts`                                    | sembrando un timer con el inicio en el futuro, `stopTimer` y `startTimer` cierran con `ended_at = started_at` y sin error                                                                       |
| 24       | integración          | `service.integration.test.ts`                                    | los siete pedidos del criterio con sus instantes UTC esperados, tal como están escritos                                                                                                         |
| 25       | integración          | `service.integration.test.ts`                                    | los dos rechazos con `invalidDate` y la fila sin tocar                                                                                                                                          |

Los instantes UTC esperados de los criterios 18, 19, 24 y 25 salen de la
**regla** del ADR 0005, no de la implementación de `instantFromLocal` que esté
en la rama, y no dependen de la zona horaria del proceso que corre los tests.
Ninguno usa una zona al oeste de Greenwich con cambio de horario: Madrid está al
este, y `America/Argentina/Buenos_Aires` no tiene cambio de horario.

El criterio 15 está cubierto **en parte** y el 17 **solo en el servidor**: lo
que falta de los dos está en la sección 8.

### Recorridos obligatorios de `e2e/entry-times.spec.ts`

Dueño: `tests-slice3`. Seis recorridos, ninguno opcional:

1. Editar el inicio y el fin de una fila seguidos y salir del editor: una sola
   petición, la fila con `aria-busy` mientras viaja, y después la duración de la
   fila y el total del día actualizados (criterios 1 y 3).
2. Editar el fin de una fila y apretar `Esc`: los tres valores vuelven y no sale
   ninguna petición (criterio 1).
3. Cambiar la fecha de una fila con su botón de fecha y verla en el grupo del
   otro día, con los dos totales recalculados (criterio 4).
4. Abrir el editor del inicio del timer corriendo con
   `getByRole("button", { name: "Editar la hora de inicio" })`, comprobar que el
   día de mañana no se puede elegir, guardar una hora anterior y ver el contador
   saltar, con el timer todavía abierto (criterios 9 y 10).
5. Mover **la única entrada de un día que no es hoy** treinta días atrás y ver
   el aviso de TT-108 arriba de la lista, nombrando el día, aunque el grupo de
   origen haya desaparecido (criterio 12). **Precondiciones**, sin las que el
   recorrido no es alcanzable:
   - El proyecto `setup` de Playwright atrasa el `createdAt` del workspace
     (`backdateWorkspace` de `e2e/database.ts`), porque si no el piso es el día
     de la corrida.
   - Antes de mover, la misma persona tiene **una entrada cerrada de hoy, ya
     empezada, que queda como la más reciente de las pasadas**: si la movida lo
     fuera, la ventana se estiraría hasta ella y el aviso no saldría. No hay
     helper compartido para esto: `tests-slice3` la arma en su propio spec,
     con una persona propia del spec para que ningún otro test le agregue
     entradas a esos días.
6. Con la petición abortada al guardar el horario de una fila, los valores
   vuelven y aparece «No se pudo guardar el horario de la entrada.» con
   «Reintentar» (criterio 16).

## 8. Deuda conocida del slice

Huecos de verificación, nombrados para que no aparezcan de sorpresa:

- **Que el hook use `measurementFor` para toda medición nueva no tiene test.**
  Las dos decisiones —qué medido vale y cuándo empieza una medición— sí lo
  tienen (criterio 11), porque salieron del hook a `elapsed.ts`. Lo que queda en
  el componente es no armar un `Measurement` por otro camino, y sin DOM en
  vitest no se puede afirmar. El riesgo es acotado: cualquier atajo que lo
  saltee hace retroceder el contador, y se nota en la revisión de paridad.
- **El clic sobre el número del contador abre el editor (TT-28)** es un
  observable sin test. El recorrido 4 abre el editor por el rol del botón, no
  por la posición del clic; que la superposición cubra el número se mira en la
  revisión de paridad.
- **Que el botón no anide al contador lo verifica la revisión, no el e2e.** Los
  helpers del slice 1 encuentran el `timer` y el recorrido 4 encuentra el botón
  por rol, y los dos lo harían igual si uno contuviera al otro. Lo que el
  mecanismo fijado en §6 garantiza —el `timer` fuera del botón en el árbol
  accesible— se comprueba leyendo el componente.
- **La fila en solo lectura de TT-110 se prueba en el servidor, no en
  pantalla.** `editableTimes` tiene test de integración con entradas sembradas;
  que la fila lo respete y muestre el texto, no. Se podría sembrar una entrada
  larga desde un e2e con el acceso directo de `e2e/database.ts`; no entra en
  los recorridos obligatorios porque lo que queda sin cubrir es una condición
  sobre un booleano que ya llega bien.
- **La barra y la fila en solo lectura con la membresía desactivada
  (criterio 15) no tienen test de navegador.** El 403 sí lo tienen, por partida
  doble: en el service y en la capa de action. Mismo recorte que en los dos
  slices anteriores con TT-92.
- **La traducción de `isEndBeforeStart` en `startTimer` no tiene test que la
  alcance.** Con `greatest` en `stopById` el `check` no puede saltar por ese
  camino; la traducción es una red, igual que el `check` mismo.

La deuda de cobertura de `actions.ts` que arrastraban los slices 1 y 2 **ya no
existe**: `actions.integration.test.ts` cubre esa capa y las dos actions de este
slice nacen con sus casos ahí, no como hueco.

Y las consecuencias de diseño que conviene tener a la vista:

- **La hora repetida del ADR 0005 se vuelve alcanzable en la edición.** La
  conservación del ADR 0006 evita mover un extremo que no se tocó. Lo que
  queda, escrito para que no sorprenda:
  - Un extremo que **sí** se tocó y cae en la hora repetida va siempre al
    segundo instante; desde la interfaz no hay forma de pedir el primero.
  - Si eso deja el par a menos de un minuto, se recalcula también el extremo
    conservado, que puede moverse una hora sin que su rótulo cambie: en el
    primer caso del criterio 24 el fin pasa de `00:50Z` a `01:50Z`. Es el precio
    de mantener TT-81 con una conversión monótona.
  - **Mientras transcurre la primera ocurrencia**, cambiar el inicio del timer
    activo a una hora de esa franja cae en `futureTime`: el segundo instante
    todavía no llegó, aunque el primero ya pasó. El último caso del criterio 24
    lo fija. Reguardar el inicio **sin** cambiarlo no cae: se conserva.
  - Una entrada que se ve como `02:30 – 02:30` y dura 60 minutos se acepta al
    editarla (criterio 24), mientras que el alta manual sigue rechazando las
    mismas dos horas con `tooShort`: la creación no tiene nada que conservar, y
    el mismo par de rótulos no describe la misma entrada en los dos caminos.
- **Gana la última escritura, y más grueso que en la descripción.** Dos
  pestañas editando la misma fila no se avisan, y la segunda pisa a la primera
  con su trío **completo**: una pestaña que solo corrigió el inicio revierte
  también la fecha y el fin que la otra había cambiado, porque los manda tal
  como los tenía. La conservación no lo evita: el fin que la segunda manda ya no
  coincide con el que la primera dejó, así que se recalcula desde el rótulo
  viejo. Con la descripción el pisotón era de un solo campo. Es el precio del
  payload completo (§4.1), y detectarlo pediría una versión por fila, que es un
  cambio de modelo y no entra acá.
- **El inicio de una entrada abierta ya no sale siempre de `now()`.** Es lo que
  obliga a la parada con piso de §4.5. Cualquier escritura futura que cierre una
  entrada abierta tiene que suponer que su inicio puede ser posterior a su
  propio `now()`.
- **Las dos guardas del repository son inalcanzables a través del service.**
  Están para que la escritura no dependa del service, y por eso su test llama
  al repository directo.
- **La divergencia de TT-110.** El arreglo, cuando se decida, es un selector de
  fecha para el fin además del inicio: un control más en la fila y un cuarto
  campo en el payload. No entra en este slice porque el trío con vuelta de
  medianoche es lo que replica a Clockify para todo lo que la barra manual
  puede crear, y lo que queda afuera solo lo produce un timer de más de un día.
- **Mover el inicio de un timer muy hacia atrás agranda la ventana de lectura**,
  porque el día del timer activo es uno de los extremos que la extienden desde
  el slice 1. Es el comportamiento ya definido y no se acota acá; si alguna vez
  molesta, es la misma conversación que la paginación del slice 5.
