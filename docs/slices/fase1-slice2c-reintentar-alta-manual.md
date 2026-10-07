# Fase 1, slice 2c: «Reintentar» en el alta manual

Contrato de un slice chico. Módulo `time-entry`, pantallas `/` (la barra en modo
manual) y `/calendario` (el alta del diálogo, que es la misma action).

- **Origen:** decisión del usuario registrada en `estado-fase1.md:93-95`:
  «devolver «Reintentar» al alta manual con el ADR 0007 y retirar TT-109, como
  slice chico con su pipeline».
- **Fuente de los comportamientos:** `docs/parity/time-tracker.md`, TT-89 y
  TT-90 para el alta manual, TT-109 (la excepción que se retira), TT-25 y TT-30
  por arrastre; `docs/parity/calendario.md`, CAL-46 («Agregar» es el alta
  manual) y CAL-86.
- **Lugar en el plan:** [mapa de la fase 1](fase1-mapa.md), la deuda de
  `fase1-mapa.md:373-376`. Va después del 12 y no depende del 13.
- **Revisión del contrato:** rondas 1 y 2 de `architecture-reviewer`
  aplicadas, con las resoluciones de
  [`correcciones-fase1-slice2c.md`](correcciones-fase1-slice2c.md) (M1 … M3,
  m1 … m6, y la decisión del team-lead sobre m4) y de
  [`correcciones-fase1-slice2c-ronda2.md`](correcciones-fase1-slice2c-ronda2.md)
  (r2-1 … r2-3).
- **Decisión de arquitectura:**
  [ADR 0007, el cliente elige el id de la entrada que crea](../adr/0007-el-cliente-elige-el-id-de-las-altas.md),
  **sin cambios en la decisión**: vale «para las altas de cualquier módulo»
  (`:57-58`) y ya prevé este caso sin gancho: «Sin gancho —duplicar, las altas
  del slice 9, el alta manual si algún día adopta esta regla— no hay segunda
  vuelta» (`:163-165`). No hace falta ADR nuevo. El usuario sumó la nota de
  aplicación en «Consecuencias» (`0572d79`, D2c-5).
- **Contratos de los que hereda:**
  [slice 2b](fase1-slice2b-reintento-de-iniciar.md) (`createOnce`,
  `createEntryOnce`, el id pendiente, el patrón del e2e de respuesta perdida)
  con sus [correcciones](correcciones-fase1-slice2b.md) (M-1: la misma persona
  en otro workspace); [slice 4](fase1-slice4-continuar-duplicar.md) (duplicar,
  que es el alta cerrada con id que este slice copia); slices 10, 11a y 11b (el
  par, el facturable y las etiquetas del alta, validados antes de escribir).

## Decisiones

Ninguna la resuelve la paridad: TT-109 decía que no había «Reintentar», y al
retirarlo hay que decir cómo es el que vuelve. **D2c-1 a D2c-4 las tomó el
team-lead el 2026-10-07 como las proponía este contrato, con D2c-1 completada
por r2-1; D2c-5 la hizo el usuario** (`correcciones-fase1-slice2c.md`,
«Decisiones»).

| ID    | Decisión                                                                                                                                  | Opciones                                                                                                                                                | Lo decidido y por qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D2c-1 | **«Agregar» otra vez con el aviso de falla por red a la vista**, si la persona cambió el borrador entre los dos clics.                    | (A) Reusa el id pendiente siempre, con el borrador de ahora. (B) Reusa el id pendiente solo si el pedido es idéntico al que falló; si cambió, id nuevo. | **Tomada: (A), con la respuesta comparada (r2-1).** Es la letra del ADR 0007 (`:167-175`: «repetir la misma acción reusa el id pendiente; el id se renueva cuando el alta tiene éxito o cuando el aviso baja») y lo que ya hacen «Iniciar» (`tracker-bar.tsx:432-437`) y las tres altas con formulario del slice 9 (`new-project-dialog.tsx:99`, `new-client-dialog.tsx:59`, `new-tag-dialog.tsx:57`). Nunca duplica. Su costo, escrito en el ADR (`:248-251`), es que si el primer intento se aplicó el servidor responde esa fila y lo cambiado no se aplica. **Desde r2-1 ese costo no es silencioso**: si la entrada que responde el servidor no es la que se mandó, la barra (y el diálogo) no se limpia, aparece un aviso informativo y el id se renueva, así el próximo «Agregar» crea la entrada nueva (§5.1, §5.2). Con m4 el aviso con id pendiente puede durar mucho, y sin la comparación un «Agregar» posterior con otra entrada se perdía sin aviso. (B) es una enmienda al ADR 0007. |
| D2c-2 | **«Reintentar» del alta**: qué manda, en la barra y en el diálogo del calendario.                                                         | (a) El borrador actual con el id pendiente. (b) El último pedido entero (`retry` de `useAction`).                                                       | **Tomada: (a) en el diálogo, (b) en la barra.** El diálogo ya fijó que su «Reintentar» manda el borrador actual (`calendario.md:1448-1449`, `entry-dialog.tsx:325-329`): tiene **un solo «Reintentar»**, el mismo para «Guardar» y «Agregar», y con (a) «Reintentar» y «Agregar» del diálogo son el mismo pedido. La barra se queda con (b), que es lo que hace cada «Reintentar» de la barra (`tracker-bar.tsx:479-488`). **Diverge de las altas en diálogo del slice 9**, que reintentan con el último pedido (`new-project-dialog.tsx:111`, `retryHandlerOf(create)`): ahí el diálogo de alta no comparte «Reintentar» con una edición. Si el primer intento se aplicó, (a) y (b) responden la misma fila; si no llegó, (a) crea lo que la persona tiene a la vista y (b) lo que mandó. Con (a), un borrador editado y un primer intento aplicado dan el caso de r2-1 también en el diálogo. Los recorridos 3, 5 y 8 distinguen las dos.                                                         |
| D2c-3 | **El aviso del alta cuando la revalidación trae la entrada del primer intento.** «Iniciar» baja su aviso cuando cambia el timer (2b, §6). | (a) No baja. (b) Baja cuando la lista trae una fila con el id pendiente.                                                                                | **Tomada: (a).** Si el aviso baja sin pasar por `onSuccess`, la barra conserva el borrador entero y el id se renueva: el próximo «Agregar» crea una segunda entrada, que es lo que TT-109 quería evitar. Además la barra no conoce la lista (`TrackerBar` recibe solo `running`, `tracker-bar.tsx:81-92`). Con el aviso a la vista, «Reintentar» o «Agregar» responden la fila sin escribir.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D2c-4 | **Cómo se retira TT-109 en los documentos de paridad**, y qué pasa con las referencias de `timesheet.md` que se justifican con él.        | (a) TT-109 conserva su id; cambian su título y su cuerpo, con la nota `_Corregido_` de lo que decía. (b) Se borra la entrada.                           | **Tomada: (a).** Los ids no se reusan y TT-109 está citado en código, en `calendario.md` y en `timesheet.md`; los documentos llevan su historia con notas `_Corregido_`. **Las menciones dentro de notas `_Corregido_` anteriores no se tocan.** En `timesheet.md`, TS-37 deja de contrastar con el alta manual, y TS-60 y TS-92 dejan de apoyarse en TT-109: la copia de la semana conserva su «sin Reintentar» con justificación propia **hasta el contrato del 13** (ahí TS-56 puede volver seguro el reintento de una copia aplicada).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D2c-5 | **El ADR 0007 decía «El alta manual queda como está hasta que el equipo decida»** (`:276-278`). El ADR es del usuario.                    | (a) Una línea fechada en «Consecuencias». (b) No tocarlo.                                                                                               | **Hecha por el usuario: (a)**, nota en «Consecuencias» (`0572d79`). La decisión del ADR no cambia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Decisión del team-lead sobre m4** (`correcciones-fase1-slice2c.md`): en la
barra, `clearNotices()` **no baja el aviso del alta manual mientras tenga un id
pendiente**. Ver §5.1, criterio 15 y recorridos 6 y 7.

**r2-1 en el diálogo del calendario: aplica**, con el mismo comportamiento.
Con D2c-2 (a) el diálogo manda el borrador actual con el id pendiente, así que
un borrador editado después de una respuesta perdida recibe la fila del primer
intento igual que en la barra (§5.2, recorrido 8).

## 0. Precondición de arranque

- **`main` en `c1917d8`**, con los slices 1 a 12 (2b, 7b, 8b, 8c, 11a y 11b
  incluidos). Las citas de abajo son de ese árbol.
- **Si entra algo a `main` antes del arranque** (el 13, por ejemplo), una ronda
  corta de `architecture-reviewer` contra el árbol (lección del 9).
- **D2c-1 a D2c-4 tomadas; D2c-5 hecha.** Rondas 1 y 2 de revisión aplicadas.

### Supuestos sobre el árbol, con archivo y línea en `c1917d8`

| Supuesto                                                                                                                                                                                               | Dónde                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `newEntryId` es `z.uuidv4()` y privado del esquema                                                                                                                                                     | `time-entry/schema.ts:62-63`                                                        |
| `createManualEntryInput` no lleva `id`                                                                                                                                                                 | `time-entry/schema.ts:144-157`                                                      |
| `CreateManualEntryInput` es el `z.input` y `CreateManualEntryValues` el `z.output`; `CreateManualEntryResult` es `{ created }`                                                                         | `time-entry/schema.ts:337-339`, `:538`                                              |
| `TimeEntryView` trae `description` recortada, `dayDate`, `startClock`, `endClock`, `project`, `task`, `billable` y `tags`                                                                              | `time-entry/schema.ts:361-405`                                                      |
| `createEntryOnce` consulta `can(timeEntry.own.create)` y después llama a `createOnce` con `findOwnById`, `idConstraint` y, solo con `winner`, el gancho del timer                                      | `time-entry/service.ts:337-363`                                                     |
| `duplicateEntry` es el alta cerrada con id: `translatingReferenceConstraints` afuera, `createEntryOnce` sin `winner`, reglas e `insertClosed` adentro de `attempt`                                     | `time-entry/service.ts:634-677`                                                     |
| `createManualEntry` consulta `can` **dentro** de la transacción, valida los instantes, el par y las etiquetas, e inserta **sin id**                                                                    | `time-entry/service.ts:849-923` (`can` en `:858-860`, `insertClosed` en `:893-902`) |
| Las reglas del alta: `nonexistentClock` (`:862-865`, `:877-880`), `tooShort` (`:866-868`), `invalidDate` (`:874-876`, `:883-885`), `beforeWorkspace` (`:886-888`), el par y las etiquetas (`:889-891`) | `time-entry/service.ts`                                                             |
| `insertClosed` recibe `id?: string`: «el alta manual no lo manda»                                                                                                                                      | `time-entry/repository.ts:550-577`                                                  |
| `findOwnById` filtra por workspace, usuario e id, sin bloqueo; `idConstraint` es `"time_entry_pkey"`                                                                                                   | `time-entry/repository.ts:396-405`, `:792`                                          |
| La base acepta una entrada cerrada de duración cero (`ended_at >= started_at`): `tooShort` es solo del service                                                                                         | `server/db/schema.ts:437-438`                                                       |
| `createOnce`: fila propia, `attempt`, relectura ante un `23505`, `ForbiddenError` con la clave primaria sin fila propia, sin gancho el choque sale tal cual                                            | `server/create-once.ts:38-76`                                                       |
| La action valida con el esquema, consulta `assertCan` y revalida `/` y `/calendario`, con éxito o con error                                                                                            | `time-entry/actions.ts:59-65`, `:114-124`                                           |
| `useNewId` reusa el id de la misma clave solo con un `unexpected` a la vista                                                                                                                           | `hooks/use-new-id.ts:17-28`                                                         |
| `retry` reenvía el último pedido entero; `retryHandlerOf` lo ofrece solo con `unexpected`                                                                                                              | `hooks/use-action.ts:87-93`, `:107-111`                                             |
| `fieldsInput` manda el par, el facturable explícito y los ids de las etiquetas                                                                                                                         | `components/entry-fields.ts:78-89`                                                  |
| `sameId` y `normalizedIds` comparan ids sin distinguir mayúsculas                                                                                                                                      | `lib/project-pair.ts`, `lib/tag-ids.ts`                                             |
| La barra: el alta sin «Reintentar» por TT-109 y su comentario                                                                                                                                          | `tracker-bar.tsx:251-281`, `:721-739`                                               |
| `clearNotices()` baja todos los avisos de la barra, el del alta incluido; la llaman toda operación de la barra, «Detener» y el cambio de modo                                                          | `tracker-bar.tsx:397-408`, `:439`, `:538`                                           |
| «Iniciar» elige el id antes de `clearNotices()`                                                                                                                                                        | `tracker-bar.tsx:432-437`                                                           |
| `handleAdd` manda el borrador sin id                                                                                                                                                                   | `tracker-bar.tsx:490-499`                                                           |
| Un timer que llega con el modo manual elegido fuerza el modo timer y retiene el borrador; `add` no se limpia ahí                                                                                       | `tracker-bar.tsx:291-342`                                                           |
| `onSuccess` del alta limpia solo lo que sigue igual a lo mandado y lleva el foco a la descripción si quedó en «Agregar», en la descripción o en `body` (TT-25)                                         | `tracker-bar.tsx:258-280`                                                           |
| «Agregar» de la barra es `aria-disabled` mientras viaja y tiene `addRef`                                                                                                                               | `manual-bar.tsx:86`, `:165-179`                                                     |
| `ActionFeedback` tiene el tono `info`, con `role="status"`                                                                                                                                             | `components/action-feedback.tsx:15-16`, `:37-42`                                    |
| El calendario crea con `createManualEntry` y su `onSuccess` cierra el diálogo; `openSubject` baja el aviso del alta; `handleAdd` manda lo que da el diálogo                                            | `calendar-view.tsx:135-141`, `:227-235`, `:305-307`                                 |
| El aviso del alta del diálogo, sin «Reintentar» con ningún código                                                                                                                                      | `calendar-notices.tsx:19-40`                                                        |
| `retryable` documentado como «nunca en el alta»; `retry()` llama a `save()`; `onAdd` recibe `CreateManualEntryInput`; el aviso del diálogo es un `ActionFeedback` de error                             | `entry-dialog.tsx:71-77`, `:96`, `:325-329`, `:438-444`                             |
| `createInputOf` devuelve un `CreateManualEntryInput`                                                                                                                                                   | `entry-dialog-draft.ts:103-113`                                                     |
| `addLostTitle` y `addLostMessage`                                                                                                                                                                      | `components/labels.ts:54-55`, `components/calendar/labels.ts:101-103`               |
| El e2e de TT-109                                                                                                                                                                                       | `e2e/manual-entry.spec.ts:214-261`                                                  |
| La revalidación sin recarga se fuerza con el evento `focus`                                                                                                                                            | `e2e/manual-entry.spec.ts:378-396`                                                  |
| El foco en vuelo de un reintento del diálogo, con `holdActionResponses`                                                                                                                                | `e2e/calendar-edit.spec.ts:482-491`                                                 |
| `dropActionRequests`, `loseActionResponses` (`route.fetch()` + `route.abort()`), `holdActionResponses`, `holdRefreshes`, `openSecondTab`                                                               | `e2e/network.ts:60-161`                                                             |
| `outcomeWhileLocked` es local de `service.integration.test.ts`; `lockRow` está en `src/test/time-entry.ts`                                                                                             | `service.integration.test.ts:5153-5190`; `src/test/time-entry.ts:37`                |
| Dos tests reusan el mismo objeto de valores en dos altas                                                                                                                                               | `service.integration.test.ts:1508-1522`, `:5550-5576`                               |
| `raceThroughBarrier` suelta la barrera con `rollback`                                                                                                                                                  | `src/test/concurrency.ts:77-142`                                                    |

## 1. Alcance

Entra: **TT-89 y TT-90 para el alta manual, en la barra y en el diálogo del
calendario**, cumplidos con el ADR 0007:

- El pedido lleva un `id` que elige el cliente. Un reintento de un alta ya
  aplicada responde la entrada que creó el primer intento sin escribir nada; si
  el primer intento no llegó, el reintento es el primer alta.
- Ante una falla de red el aviso es el de cualquier operación del módulo:
  título «No se pudo agregar la entrada.», el mensaje de `unexpected` y
  «Reintentar». El aviso «No sabemos si la entrada se guardó.» deja de existir.
- Apretar «Agregar» otra vez con ese aviso a la vista reusa el id pendiente
  (D2c-1).
- **Si la entrada que responde el servidor no es la que se mandó** (r2-1), la
  barra o el diálogo conservan lo tecleado, aparece un aviso informativo y el
  próximo «Agregar» crea la entrada nueva.
- En la barra, el aviso del alta con id pendiente sobrevive a las demás
  operaciones de la barra (m4).

**El calendario entra porque es la misma action** (CAL-46: «Agregar» es el
alta manual, `calendario.md:629-635`) y porque el id es obligatorio en el
esquema: no hay un alta manual sin id. `calendario.md:1510` ya lo lista como
pendiente, y el contrato del 8c lo dejó escrito
(`fase1-slice8c-calendario-escritura.md:1209-1210`).

Entran por arrastre, verificados con el id:

- **TT-25**: «Agregar» limpia la barra y deja el foco en la descripción,
  también cuando la respuesta es la de un reintento de lo mismo (recorrido 1).
- **TT-30**: con un timer corriendo, la barra no agrega a mano; tampoco desde
  «Reintentar» (§5.1, recorrido 6).
- **TT-77, TT-78, TT-112, TT-73, el piso del workspace**: las reglas del alta no
  cambian de texto ni de código, y corren antes de escribir (§4.3).
- **TT-92**: con la membresía desactivada, ni el id de una entrada propia da
  éxito.
- **TT-108 / P-15**: la respuesta de un reintento trae el `weekStart` de la
  entrada como está, y la ventana se extiende con él (`reachWeek` en
  `onSuccess`, también con la respuesta que no es la mandada). Lo verifica el
  criterio 5.

### Lo que la paridad tiene que registrar

**Tarea de `parity-analyst`, antes del merge** (con D2c-4):

- `time-tracker.md`, **TT-89** (`:1542-1549`): sale «La única operación del
  módulo que no lo ofrece es el alta manual, por TT-109.»
- **TT-109** (`:1551-1587`): cambian el título y el cuerpo: el alta manual
  ofrece «Reintentar» porque el pedido lleva un id que elige el cliente (ADR
  0007); un reintento de un alta aplicada responde la entrada sin escribir;
  «Agregar» otra vez con el aviso a la vista reusa el id (D2c-1), y si la
  entrada respondida no es la mandada, lo tecleado queda con el aviso «La
  entrada ya se había agregado con lo que mandaste antes; lo que está en la
  barra no se guardó.» (en el diálogo, «… lo que está en el diálogo no se
  guardó.») y el próximo «Agregar» la crea (r2-1); en la barra, «Reintentar»
  manda el pedido que falló y, en el diálogo del calendario, el borrador actual
  (D2c-2); en la barra el aviso sobrevive a las otras operaciones (m4); el
  reintento puede recrear una entrada borrada entre medio. Nota
  `_Corregido el …, slice 2c_` con lo que decía. El párrafo «El resto de las
  operaciones…» queda, sin el contraste. Las notas `_Corregido_` anteriores no
  se tocan.
- **§11, reparto por slices**: una sección «Slice 2c» después de la del 2b
  (`:1692-1698`), con TT-89, TT-90 y la corrección de TT-109. La lista del
  slice 2 (`:1688-1690`) es histórica y no cambia.
- `calendario.md`: CAL-46 (`:632-635`), los títulos y textos de la §13
  (`:1093-1094`, `:1105-1108`, con el texto informativo nuevo del diálogo),
  CAL-86 (`:1138-1139`) y «Lo que queda» (`:1510-1511`). La sección del 8c
  (`:1427-1430`) suma una nota `_Corregido_` y no se reescribe. Las notas
  `_Corregido_` anteriores no se tocan.
- `timesheet.md`: TS-37 (`:471-472`, `:477-478`), TS-60 (`:651-653`) y TS-92
  (`:826-827`), como dice D2c-4.

No es trabajo de `backend-dev` ni de `frontend-dev`.

### Queda afuera

- **Bajar el aviso del alta con la revalidación** (D2c-3).
- **Cambiar `useNewId`, `useAction` o `ActionFeedback`**: alcanzan como están.
- **La copia de semana del timesheet** (TS-60): es del 13.
- **Unificar las variantes de `retryOf`** (deuda de `estado-fase1.md:44`); este
  slice suma una más, `retryAdd`, y la anota.
- **Tests de componentes con DOM de la barra**: la barra se prueba con e2e,
  como en el 2b.

### Consecuencias sobre código ya entregado

| Archivo                                                                                  | Qué cambia                                                                                                                                                                      | Qué hay que volver a probar                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `schema.ts`                                                                              | `createManualEntryInput` suma `id`; comentario de `CreateManualEntryResult`.                                                                                                    | Todos los casos de `createManualEntryInput`                   |
| `service.ts`                                                                             | `createManualEntry` pasa por `createEntryOnce`; el `can` sale de la transacción; `insertClosed` con el id.                                                                      | TT-25, TT-72, TT-73, TT-76, TT-77, TT-78, TT-92, TT-112, piso |
| `repository.ts`                                                                          | `insertClosed` con `id` obligatorio.                                                                                                                                            | Duplicar y el alta manual                                     |
| `tracker-bar.tsx`                                                                        | Id del alta con `useNewId`; aviso único con «Reintentar»; foco del reintento; `clearNotices()` conserva el aviso con id pendiente; la respuesta que no es la mandada no limpia. | TT-25, TT-30, TT-89, TT-90, TT-16                             |
| `calendar-view.tsx`, `entry-dialog.tsx`, `calendar-notices.tsx`, `entry-dialog-draft.ts` | Id del alta; «Reintentar» en el aviso del alta del diálogo, con el borrador actual; la respuesta que no es la mandada no cierra el diálogo.                                     | CAL-46, CAL-86, CAL-74                                        |
| tests existentes                                                                         | Todo llamado a `createManualEntry` lleva un `id` propio.                                                                                                                        | Los mismos casos, sin cambiar lo que afirman                  |
| `e2e/manual-entry.spec.ts`                                                               | Sale el recorrido de TT-109.                                                                                                                                                    | —                                                             |

## 2. Cambios de esquema

**Ninguno.** La columna `id` es `uuid` con valor por omisión; el valor que
llega lo reemplaza, como en «Iniciar» y en duplicar. Sin migración.

## 3. Permisos

**Ninguna acción nueva.** `createManualEntry` sigue con `timeEntry.own.create`
sobre `ownTimeEntryResource(actor)`. Lo que cambia es dónde se consulta en el
service: en `createEntryOnce`, **antes** de la fila propia, y no dentro de la
transacción (`service.ts:858-860`). La action ya consulta `assertCan` antes del
service (`actions.ts:119`) y no cambia. `src/server/permissions/` no se toca.

## 4. Contrato de la server action

`createManualEntry` cambia su entrada y su implementación; su firma, su
resultado y su recorrido en `actions.ts` no cambian. **`actions.ts` no se
edita**: `createManualEntryInput.parse` valida el id, y `handle` ya traduce un
`ForbiddenError` al mensaje neutro.

### 4.1 Los tipos

```ts
export const createManualEntryInput = z
  .object({
    /** Id de la entrada que se crea, elegido por el cliente (ADR 0007). */
    id: newEntryId,
    description: description.default(""),
    date: dayKeyInput,
    start: clockInput,
    end: clockInput,
    ...newEntryPair,
    ...newEntryBillable,
    ...newEntryTags,
  })
  .refine(hasProjectForTask, taskNeedsProject);
```

`newEntryId` sigue privado; es el mismo `z.uuidv4()` de «Iniciar», continuar y
duplicar.

```ts
export type CreateManualEntryResult = {
  /**
   * La entrada creada. En un reintento resuelto por el ADR 0007, la que creó el
   * primer intento, en el estado en que esté.
   */
  readonly created: TimeEntryView;
};
```

No hay códigos ni mensajes nuevos. `timeEntryMessages` no cambia. **El
servidor no dice si la respuesta es de un reintento**: lo deduce el cliente
comparando con lo que mandó (§5.1).

### 4.2 El service

```ts
/**
 * Agrega una entrada ya cerrada a partir de dos horas de pared (ADR 0005). Un
 * reintento con el mismo id responde la entrada del primer intento sin
 * escribir ni validar (ADR 0007).
 */
export async function createManualEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
  input: CreateManualEntryValues,
): Promise<CreateManualEntryResult>;
```

Con la forma de `duplicateEntry` (`service.ts:634-677`):

- **`translatingReferenceConstraints` afuera** de `createEntryOnce`, como hoy
  afuera de la transacción: un `23503` no es `23505`, así que `createOnce` lo
  deja salir y se traduce a TT-77 o TT-78. Un `ForbiddenError` pasa sin
  cambios.
- **`createEntryOnce(actor, input.id, { attempt, replayed })`, sin `winner`**:
  una fila cerrada no choca con `time_entry_running_unq`, y el ADR 0007 dice
  que el alta manual no tiene gancho (`:163-165`).
- **`attempt`**: `db.transaction` con las reglas de hoy, **en el mismo orden y
  todas antes de `insertClosed`**, sin el `can` de `:858-860`; `insertClosed`
  con `id: input.id`; `recordAudit` igual que hoy; responde
  `{ created: toView(created, workspace) }`.
- **`replayed`**: `(row) => ({ created: toView(row, workspace) })`.

Las conversiones de hora pueden salir a una función privada si el diff lo
pide; no es contrato. El orden sí: **ni las conversiones ni ninguna regla
corren antes de `createEntryOnce`**.

### 4.3 El orden, paso por paso

| Paso | Qué                                                                                                                                                                                                                                     | Dónde                             | Si falla                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| 1    | `createManualEntryInput.parse`, con el `id`                                                                                                                                                                                             | action                            | `validation`, primer mensaje de Zod              |
| 2    | `assertCan(timeEntry.own.create)`                                                                                                                                                                                                       | action                            | `forbidden`, mensaje neutro                      |
| 3    | `can(timeEntry.own.create)` de `createEntryOnce`                                                                                                                                                                                        | service, antes de `createOnce`    | `TimeEntryError("forbidden", forbidden)`         |
| 4    | `findOwn(id)`, sin bloqueo                                                                                                                                                                                                              | `createOnce`, paso 1              | — si existe, `replayed`: **ninguna regla corre** |
| 5    | En la transacción: `nonexistentClock` del inicio, `tooShort`, `invalidDate` del día de fin, `nonexistentClock` del fin, `invalidDate` del año 10000, `beforeWorkspace`, el par (`assertNewEntryPair`), las etiquetas (`assertTaggable`) | `attempt`, **antes del insert**   | su código y su texto; nada escrito               |
| 6    | `insertClosed` con el id, la unión de etiquetas, `recordAudit`                                                                                                                                                                          | `attempt`                         | —                                                |
| 7    | Ante un `23505`: `findOwn(id)` otra vez → `replayed`; sin fila propia y con `time_entry_pkey` → `ForbiddenError`; otro choque → sale tal cual                                                                                           | `createOnce`, pasos 3 a 6         | `forbidden` neutro, o `unexpected`               |
| 8    | `23503` de proyecto, tarea o etiqueta                                                                                                                                                                                                   | `translatingReferenceConstraints` | TT-77 o TT-78                                    |

**Por qué las reglas van después de la fila propia** (paso 4 antes que el 5):
es el algoritmo del ADR 0007, y además varias reglas dependen de algo que
puede cambiar entre los dos intentos —la zona de la persona (`nonexistentClock`,
`beforeWorkspace`), el piso y el estado del proyecto o de una etiqueta—. Un
reintento de un alta aplicada responde la entrada aunque hoy el mismo pedido no
pasaría. **Cada regla adelantada antes de la fila propia la detecta el
criterio 6**, que reintenta con el id propio y un pedido que la incumple: las
tres conversiones de hora (`nonexistentClock`, `beforeWorkspace`,
`invalidDate`), `tooShort`, el par y las etiquetas.

**Por qué van antes del insert** (paso 5 antes que el 6): con el id de una
fila ajena, el insert choca con la clave primaria, que es global, y la
respuesta sería `forbidden` en vez de la regla que el pedido no cumple. Es la
lección del 10 y del 11b (`estado-fase1.md:158-163`). `tooShort`,
`beforeWorkspace`, el par y las etiquetas **se podrían mover después del insert
sin que ningún test de hoy lo note**: la transacción se deshace igual y, con un
id nuevo, la respuesta es la misma. Solo el id ajeno los distingue (criterio
9). `nonexistentClock` e `invalidDate` no se pueden mover después: el insert
necesita los dos instantes.

**Por qué no hay caso de «timer bloqueado»**: el alta manual no lee ni cierra
el timer abierto, así que `outcomeWhileLocked` sobre el timer, que en el 11b
distinguía las reglas de «Iniciar» y «Continuar» del cierre, no tiene nada que
medir. La fila que sí puede estar bloqueada es **la propia del reintento**
(criterio 10): `findOwn` la lee sin bloqueo y no espera a quien la está
editando.

### 4.4 Qué responde cada pedido

| Pedido                                                                                           | Respuesta                                                                                       | Escribe                                                          |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Id nuevo, reglas cumplidas                                                                       | `{ created }` con ese id                                                                        | la fila, la unión y `timeEntry.createManual` con `entityId` = id |
| Id de una entrada propia que ya existe (el reintento)                                            | `{ created }` con esa fila **en el estado en que esté**: editada, movida, archivado su proyecto | nada; sin constancia                                             |
| Lo mismo, con un borrador distinto (D2c-1) o con reglas que hoy fallarían                        | lo mismo: la fila del primer intento                                                            | nada                                                             |
| Lo mismo, con un id propio de otra operación (un timer, una copia): solo un pedido armado a mano | la fila tal cual, también abierta                                                               | nada                                                             |
| Id propio, membresía `inactive` o `invited`                                                      | `forbidden`, mensaje neutro (paso 3)                                                            | nada                                                             |
| Id de una entrada de otro miembro, de otro workspace o de la misma persona en otro workspace     | `forbidden`, mensaje neutro, sin decir de quién es                                              | nada                                                             |
| Id ajeno y una regla que no se cumple                                                            | la regla, con su código y su texto                                                              | nada                                                             |
| Dos pedidos con el mismo id a la vez                                                             | los dos `{ created }` con ese id                                                                | una fila, una constancia                                         |
| Id de una entrada propia borrada después del primer intento                                      | `{ created }` nueva con ese id (ADR 0007, `:239-247`)                                           | la fila otra vez                                                 |

### 4.5 Repository

`insertClosed` recibe `id: string`, **obligatorio**: sus dos llamadores lo
mandan. El comentario de `:550-555` pasa a decir que el id lo eligió el cliente
en las dos altas (ADR 0007). `findOwnById`, `idConstraint` y las redes de la
base no cambian.

### 4.6 Auditoría

No cambia la forma: `timeEntry.createManual` con el id del cliente como
`entityId`. **Un pedido resuelto por la fila propia no deja constancia.**

### 4.7 Revalidación

Sin cambios: `/` y `/calendario`, con éxito y con error (`actions.ts:59-65`).

## 5. Contrato de pantalla

La lectura no cambia. `TrackerState`, `CalendarState` y `TimeEntryView` quedan
como están.

### 5.0 La comparación con lo mandado (r2-1)

Una función pura, nueva, que comparten la barra y el diálogo:

```ts
/** `components/sent-entry.ts` */
export type NewEntryRequest = Omit<CreateManualEntryInput, "id">;

/**
 * La entrada que respondió el alta es la que se mandó. En falso, la respuesta
 * es la de un pedido anterior con el mismo id (ADR 0007, D2c-1): lo mandado no
 * se guardó.
 */
export function isSentEntry(created: TimeEntryView, sent: NewEntryRequest): boolean;
```

Compara, campo por campo, lo que el servidor guarda de un pedido:

| Campo de `created`        | Contra lo mandado                                                         |
| ------------------------- | ------------------------------------------------------------------------- |
| `description`             | `sent.description` recortada (Zod la guarda con `trim`); ausente es `""`  |
| `dayDate`                 | `sent.date`                                                               |
| `startClock`, `endClock`  | `sent.start`, `sent.end` (`endClock` nulo, una entrada abierta: no es)    |
| `project?.id`, `task?.id` | `sent.projectId`, `sent.taskId` con `sameId`; nulo y ausente son lo mismo |
| `billable`                | `sent.billable` (la barra y el diálogo lo mandan siempre, `fieldsInput`)  |
| `tags`                    | `sent.tagIds` como conjunto, con `normalizedIds` de los dos lados         |

Un alta nueva siempre coincide: el servidor escribe lo pedido, y las horas de
la vista son las de pared en la misma zona (ADR 0005). `NewEntryRequest`
reemplaza al `NewEntryDraftInput` de la ronda 1: `entry-dialog-draft.ts` lo
importa de acá.

### 5.1 La barra (`tracker-bar.tsx`)

**El id.**

- `const newAddId = useNewId(add.failure);` y una clave fija, `ADD_KEY = "add"`,
  como `START_KEY` (`:63-64`).
- `handleAdd` elige el id **antes de `clearNotices()`**:
  `const id = newAddId(ADD_KEY);` y después
  `add.run({ id, description, date, start, end, fields })`. Con el aviso de
  `unexpected` a la vista es el id pendiente, con el borrador de ahora
  (D2c-1); en cualquier otro caso, uno nuevo.
- **El id se renueva solo con el desenlace de otro pedido del alta**: cuando
  termina bien —también con la respuesta que no es la mandada—, o cuando falla
  con otro código (`validation`, `not_found`, `forbidden`: no escribió). Un
  nuevo `unexpected` conserva el mismo id.
- `BarAddInput` toma el `id` de `CreateManualEntryInput` sin cambios de forma.

**La respuesta que no es la mandada** (r2-1). En `onSuccess(data, input)`,
antes de limpiar:

- `isSentEntry(data.created, { ...entry, ...fieldsInput(input.fields) })`,
  con el pedido sin `id`.
- **Si coincide**, lo de hoy: limpia lo que sigue igual a lo mandado,
  `reachWeek` y el foco de TT-25 (`:258-280`).
- **Si no coincide**: `reachWeek([data.created.weekStart])` igual —la entrada
  existe y la lista la tiene que mostrar—, **la barra no se limpia** (ni la
  descripción, ni los campos, ni las horas) y **el foco no se mueve**. Aparece
  el aviso informativo:

  ```tsx
  {
    replayedAdd && <ActionFeedback tone="info" title={trackerLabels.addReplayed} />;
  }
  ```

  con `trackerLabels.addReplayed` = «La entrada ya se había agregado con lo que
  mandaste antes; lo que está en la barra no se guardó.». `replayedAdd` es
  estado de la barra; lo pone `onSuccess` y lo baja `clearNotices()`, como
  cualquier aviso: el próximo «Agregar» lo baja y, como `add.failure` ya es
  `null`, lleva un id nuevo y crea la entrada.

**El aviso con id pendiente sobrevive a las demás operaciones** (decisión del
team-lead sobre m4):

- **`clearNotices()` no baja el aviso del alta mientras su código sea
  `unexpected`**: `add.clear()` pasa a correr solo si
  `add.failure?.code !== "unexpected"`. Así «Iniciar», «Detener», «Descartar»,
  el cambio de modo (`:538`) y los guardados del timer bajan sus avisos y no
  este, y el id pendiente no se renueva por una operación ajena al alta.
  `handleModeChange` no llama a `add.clear()` por su cuenta.
- **Ese aviso baja solo con el desenlace de otro pedido del alta**: «Agregar»
  o «Reintentar» llaman a `run`, que lo limpia, y el resultado nuevo lo
  reemplaza, no deja ninguno o deja el informativo de r2-1. `ActionFeedback` no
  tiene un control para cerrarlo (§8).
- Editar el borrador en modo manual —descripción, horas, fecha, proyecto,
  etiquetas, facturable— tampoco lo baja (`:503-506`, `:513-516`, `:526-529`).
- Con el cambio de modo a manual el borrador vuelve a la hora de ahora
  (`:540-542`) y el id sigue pendiente: si el primer intento se aplicó,
  «Agregar» responde esa fila y, como no es la mandada, vale r2-1.

**El aviso de falla.** Uno solo para el alta, con cualquier código:

```tsx
{
  add.failure !== null && (
    <ActionFeedback
      title={trackerLabels.entryNotAdded}
      message={add.failure.message}
      retryDisabled={!isManual}
      onRetry={retryAdd()}
    />
  );
}
```

- Con `unexpected` el mensaje es `timeEntryMessages.unexpected` («No se pudo
  guardar. Revisá la conexión y volvé a intentar.»), que pone `useAction` si no
  hubo respuesta o la action si el servidor falló. «Reintentar» aparece solo
  con `unexpected` (`retryHandlerOf`).
- **`retryDisabled={!isManual}`** (TT-30, «no se puede agregar tiempo a mano
  con un timer activo», `time-tracker.md:524-532`): con un timer en la barra
  —forzado por otra pestaña o elegido—, el aviso queda y su «Reintentar» queda
  inactivo; al volver a manual vuelve a estar activo, con el mismo id. No se
  permite reintentar en modo timer: con el modo forzado, `draft` y
  `fieldsDraft` son los del timer, y la limpieza de `onSuccess` los tocaría.
- Sale el comentario de TT-109 (`:723-729`) y el de `:251-255` pasa a decir que
  «Reintentar» reenvía el pedido con su id (ADR 0007).

**«Reintentar».** `retryAdd()` es `retryOf(add)` con el foco antes:

- Si `retryHandlerOf(add)` es `undefined`, devuelve `undefined`.
- Si no: `addRef.current?.focus()`, después `clearNotices()` y `retry()`.
  «Reintentar» se va con su aviso; el foco queda en «Agregar», que está
  `aria-disabled` mientras viaja (`manual-bar.tsx:86`, `:170`) y no lo pierde.
  Con éxito, `onSuccess` lo lleva a la descripción porque quedó en «Agregar»
  (TT-25, `:271-279`); si falla otra vez, se queda en «Agregar».
- Reenvía **el último pedido entero**, con su id y sus campos (D2c-2, (b)).
  Como reenvía lo mismo, la respuesta coincide con lo mandado salvo que la
  entrada se haya editado entre medio; en ese caso vale r2-1 y la barra no se
  limpia. `onSuccess` limpia solo lo que sigue igual a lo mandado (`:258-266`):
  lo que se editó después de la falla queda en la barra (recorrido 3).

**Lo que conserva el borrador.** Una falla no toca la barra; el borrador se
limpia solo con éxito, solo si la respuesta es la mandada, y solo en lo que no
cambió desde el envío.

**`manual-bar.tsx` no cambia**: «Agregar» ya tiene `addRef` y
`aria-disabled`.

### 5.2 El diálogo del calendario

**El id**, en `calendar-view.tsx`, como `nextDuplicateId` (`:150`):

- `const nextCreateId = useNewId(create.failure);` con una clave fija.
- `handleAdd(input)` recibe el `NewEntryRequest` y llama a
  `run(create, { ...input, id: nextCreateId(ADD_KEY) })`, con el id calculado
  antes de `run`, que baja los avisos.
- **El id se renueva** con el éxito —también con la respuesta que no es la
  mandada—, con otra falla que no sea `unexpected`, y cuando el aviso baja:
  toda apertura del diálogo (`openSubject` limpia `create`, `:231`) y toda
  operación de la pantalla (`clearNotices`, `:191-196`). La decisión de m4 es
  de la barra; el calendario sigue bajando el aviso al abrir otro diálogo (§8).

**El tipo.** `createInputOf` devuelve un `NewEntryRequest` (§5.0) y `onAdd` de
`EntryDialogProps` lo recibe. El id lo pone solo el dueño de los pedidos,
`CalendarView`.

**La respuesta que no es la mandada** (r2-1, aplica al diálogo). `onSuccess`
de `create` pasa a `(data, input)`:

- **Si `isSentEntry(data.created, input)`**, lo de hoy: cierra el diálogo y
  `landed(data.created)`.
- **Si no**: **el diálogo sigue abierto con el borrador**, el foco no se mueve,
  y el diálogo muestra el aviso informativo `calendarLabels.addReplayed` =
  «La entrada ya se había agregado con lo que mandaste antes; lo que está en el
  diálogo no se guardó.» La entrada del primer intento ya está en la grilla
  por la revalidación. El próximo «Agregar» lleva un id nuevo y crea la
  entrada.
- `replayedAdd` es estado de `CalendarView`; lo pone `onSuccess` y lo bajan
  `clearNotices()` (`:191-196`) y `openSubject` (`:227-235`).
- **El aviso del diálogo**: `EntryDialogFailure` suma
  `readonly tone?: "error" | "info"`, que `entry-dialog.tsx:438-444` pasa a
  `ActionFeedback`. `dialogFailureOf` recibe `replayedAdd`: con el alta
  abierta, sin falla y con `replayedAdd`, devuelve
  `{ title: calendarLabels.addReplayed, message: undefined, tone: "info", retryable: false }`
  (`message` pasa a opcional en el tipo).

**El aviso de falla**, en `dialogFailureOf` (`calendar-notices.tsx:24-40`),
con el alta abierta:

```ts
{
  title: trackerLabels.entryNotAdded,
  message: create.failure.message,
  retryable: create.failure.code === "unexpected",
}
```

**«Reintentar»** en `entry-dialog.tsx`: `retry()` lleva el foco a `submitRef`
(«Agregar» o «Guardar») y llama a **`submit`** —`add` en el alta, `save` en la
edición— en vez de a `save`. En el alta, manda el borrador actual con el id
pendiente (D2c-2, (a)), no `create.retry`; si el borrador cambió y el primer
intento se aplicó, vale r2-1. El comentario de `retryable` pasa a decir «solo
con `unexpected` (TT-89)».

**Lo que conserva el borrador y el foco.** El diálogo sigue abierto con lo
tecleado después de la falla, como hoy, y también después de una respuesta que
no es la mandada. «Reintentar» deja el foco en «Agregar», que está
`aria-disabled` mientras viaja. Con éxito y respuesta mandada el diálogo se
cierra y el foco va al bloque nuevo, o aparece el aviso de CAL-46 si quedó
fuera del período (`landed`, sin cambios).

### 5.3 Textos

- **Salen** `trackerLabels.addLostTitle` (`labels.ts:54-55`) y
  `calendarLabels.addLostMessage` (`calendar/labels.ts:101-103`). No queda
  ningún uso.
- **Entran** (r2-1):

  | Clave                        | Texto                                                                                                |
  | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
  | `trackerLabels.addReplayed`  | «La entrada ya se había agregado con lo que mandaste antes; lo que está en la barra no se guardó.»   |
  | `calendarLabels.addReplayed` | «La entrada ya se había agregado con lo que mandaste antes; lo que está en el diálogo no se guardó.» |

  El del diálogo cambia solo el lugar, como hacían los dos textos de TT-109.

- El título de la falla es `trackerLabels.entryNotAdded` y el mensaje,
  `timeEntryMessages.unexpected`.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/modules/time-entry/schema.ts
/home/maxi/program/clock/src/modules/time-entry/schema.test.ts
/home/maxi/program/clock/src/modules/time-entry/service.ts
/home/maxi/program/clock/src/modules/time-entry/repository.ts
/home/maxi/program/clock/src/modules/time-entry/manual-retry.integration.test.ts   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/audit.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/permissions.integration.test.ts
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts
/home/maxi/program/clock/src/test/time-entry.ts
```

- **Los casos nuevos de servicio van en `manual-retry.integration.test.ts`**:
  `service.integration.test.ts` pasa de 8600 líneas (precedente del 12). En
  `service.integration.test.ts` solo cambian los llamados existentes a
  `createManualEntry`, que suman un `id`, y la importación de
  `outcomeWhileLocked`.
- **`outcomeWhileLocked` sube a `src/test/time-entry.ts`**, al lado de
  `lockRow`, tal cual (`service.integration.test.ts:5153-5190`).
- **Cada llamado existente lleva `id: randomUUID()` propio**, incluidos los que
  esperan un rechazo (`actions.integration.test.ts:251-255`, `:274-275`,
  `:327-331`, por ejemplo), para que el rechazo siga siendo por lo que dice el
  test y no por el id que falta. **Nunca un id fijo compartido**: con el id
  adentro del objeto de valores, la segunda alta del mismo objeto es un
  reintento (misma persona) o un id ajeno (otra persona) y cambia la
  respuesta. Los casos que hoy reusan un objeto —
  `service.integration.test.ts:1508-1522` (dos superpuestas) y `:5550-5576`
  (dos personas con el mismo pedido)— y `manualValues` de
  `permissions.integration.test.ts` pasan a una fábrica local
  `manual(overrides)` que arma los valores con `id: randomUUID()` en cada
  llamado.

### frontend-dev

```
/home/maxi/program/clock/src/modules/time-entry/components/sent-entry.ts                       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/sent-entry.test.ts                  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/tracker-bar.tsx
/home/maxi/program/clock/src/modules/time-entry/components/labels.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-view.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-notices.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-notices.test.ts   (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/entry-dialog-draft.test.ts
/home/maxi/program/clock/src/modules/time-entry/components/calendar/labels.ts
```

`sent-entry.ts` es puro: no importa React ni actions, y se prueba con
`TimeEntryView` armadas a mano.

### tests-slice2c

```
/home/maxi/program/clock/e2e/manual-retry.spec.ts   (nuevo)
/home/maxi/program/clock/e2e/manual-entry.spec.ts   (solo sale el recorrido de :214-261)
```

Lo que el spec necesite y no esté en `network.ts`, `tracker-page.ts` o
`calendar-page.ts` vive en el spec nuevo. La comprobación desde otra pestaña
se escribe sobre `openSecondTab` (deuda de ayudantes de e2e ya anotada).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/time-tracker.md
/home/maxi/program/clock/docs/parity/calendario.md
/home/maxi/program/clock/docs/parity/timesheet.md
```

Lo que enumera §1, con D2c-4.

### Lo que no toca nadie

`src/modules/time-entry/actions.ts`, `src/server/create-once.ts`,
`src/server/db/`, `src/server/permissions/`, `src/server/action.ts`, `drizzle/`,
`src/hooks/` (`useNewId` y `useAction` alcanzan), `src/components/`
(`ActionFeedback` alcanza, con su tono `info`), `manual-bar.tsx`, el módulo
`project`, `src/app/` y `docs/adr/` (D2c-5 ya está hecha). Los contratos y
correcciones anteriores son históricos. El mapa (`fase1-mapa.md`: una sección
«Slice 2c» y la deuda de `:373-376` cerrada) y el estado los actualiza el
team-lead.

### Handshake de orden

0. **D2c-1 a D2c-4 tomadas, D2c-5 hecha, rondas 1 y 2 aplicadas.**
1. **Primer commit de `backend-dev`**: `schema.ts` con el id, `schema.test.ts`,
   todos los llamados existentes con su id (con la fábrica `manual(overrides)`
   donde se reusaba un objeto), y `outcomeWhileLocked` en
   `src/test/time-entry.ts`. Sin cambio de conducta del service: hasta el paso
   3 el id llega y se ignora, porque `insertClosed` todavía lo acepta opcional
   y `createManualEntry` no lo pasa. **Avisa a `frontend-dev`**: desde acá
   `CreateManualEntryInput` lleva `id` y el typecheck de la rama falla en
   `tracker-bar.tsx`, `calendar-view.tsx` y `entry-dialog-draft.ts` hasta el
   paso 2; los dos commits entran en el mismo PR.
2. **`frontend-dev`, enseguida**: `sent-entry.ts` con su test, el id en la
   barra y en el calendario, los avisos, `clearNotices()` con el aviso
   pendiente, la respuesta que no es la mandada, los textos y
   `calendar-notices.test.ts`.
3. **`backend-dev`**: service y repository (§4), y los tests nuevos de §7.
   **`tests-slice2c`**, con el paso 2 en la rama: el spec, y confirma que falla
   por la funcionalidad (sin el paso 3, el reintento de una respuesta perdida
   crea una segunda fila) y no por el arnés.
4. **Mutantes en una copia, nunca en el árbol compartido**, uno por fila de la
   tabla de §7; antes de commitear, `git diff` de cada archivo.
5. **`parity-analyst`**, antes del merge.

## 7. Criterios de aceptación

1. **El esquema** — `createManualEntryInput` sin `id`, con un texto que no es
   UUID, con el UUID nulo o con un UUID v7 falla; con un v4 pasa y lo conserva.
2. **El alta con el id del cliente** — La fila creada, la respuesta y la
   constancia `timeEntry.createManual` llevan el id pedido.
3. **El reintento en secuencia** — Un segundo `createManualEntry` con el mismo
   id responde lo mismo que el primero (`toEqual`) y deja iguales las filas, la
   unión de etiquetas y las constancias.
4. **El reintento cruzado** — Dos `createManualEntry` con el mismo id,
   **obligados a cruzarse** con la barrera de abajo, responden los dos ese id y
   dejan una fila y una constancia.
5. **La fila en el estado en que esté** (con TT-108) — Crear, editar la entrada
   con `updateEntry` (descripción «B», otras horas y **una fecha de una semana
   más vieja**) y reintentar con el pedido original: la respuesta trae «B», las
   horas nuevas y **el `weekStart` de la semana más vieja**; nada escrito,
   ninguna constancia nueva.
6. **La fila propia antes que las reglas** — Con el id de una entrada propia ya
   creada, cada uno de estos pedidos cambiados termina bien con esa fila, sin
   escribir:
   - el proyecto P y la etiqueta X del primer intento, archivados después: sin
     TT-77 ni TT-78;
   - horas de duración cero: sin `tooShort`;
   - **una hora que no existe**: con el workspace en `Europe/Madrid`, el
     2026-03-29 a las 02:30: sin `nonexistentClock`;
   - **un día anterior al piso del workspace**: sin `beforeWorkspace`;
   - **el 9999-12-31 cruzando la medianoche** (fin menor que el inicio): sin
     `invalidDate`.
7. **TT-92 antes que la fila propia** — Con la membresía `inactive` o
   `invited`, el id de una entrada propia que existe responde `forbidden` con el
   mensaje neutro, no la entrada. **Llamando al service.**
8. **El id de otra fila** — El id de una entrada de otro miembro del mismo
   workspace, de otro workspace, y **de la misma persona en otro workspace**
   (M-1 del 2b): el service lanza con `code: "forbidden"`, la action responde
   `forbidden` con «No tenés permiso para hacer esto.»; ninguna fila nueva,
   ninguna constancia.
9. **Las reglas antes de escribir, con un id ajeno** — Con el id de una entrada
   de otro miembro: horas de duración cero responden `tooShort`; un día
   anterior a la creación del workspace, `beforeWorkspace`; un proyecto
   archivado, TT-77; una etiqueta archivada, TT-78. Cada una con su código y
   su texto, **no `forbidden`**; nada escrito.
10. **La fila propia bloqueada** — Con la entrada del primer intento tomada con
    `for update` por otra conexión, el reintento termina sin esperar el
    bloqueo, y no escribe.
11. **La capa de action** — Sin `id`, con un texto que no es UUID, con el nulo
    o con un v7: `validation` y revalida `/` y `/calendario`. Un reintento de un
    alta aplicada responde `ok` con los mismos datos.
12. **Sin regresiones** — Los casos existentes del alta manual (TT-25, TT-72,
    TT-73, TT-76, TT-77, TT-78, TT-92, TT-112, el piso, las etiquetas, el
    facturable, la auditoría) pasan con su id, sin cambiar lo que afirman.
13. **El aviso del alta del diálogo** — `dialogFailureOf` con el alta abierta:
    `unexpected` da «No se pudo agregar la entrada.», su mensaje y
    `retryable: true`; `validation` y `not_found`, su mensaje y
    `retryable: false`; sin falla y con `replayedAdd`, el informativo de r2-1
    con `tone: "info"`. Los casos de «Guardar» no cambian.
14. **El borrador del diálogo** — `createInputOf` no lleva `id` y conserva lo
    que mandaba.
15. **El aviso pendiente de la barra sobrevive** (m4) — Con el aviso de
    `unexpected` del alta a la vista, «Detener» y el cambio de modo no lo bajan
    y no renuevan el id: volver a manual y «Reintentar» responde la fila del
    primer intento, sin duplicar.
16. **La comparación con lo mandado** (r2-1) — `isSentEntry` es verdadera con
    la vista de lo mandado, también con la descripción con espacios en los
    bordes, ids con otras mayúsculas, las etiquetas en otro orden y el par
    ausente contra nulo; es falsa si cambia uno solo de: descripción, día,
    inicio, fin, proyecto, tarea, facturable o el conjunto de etiquetas, y con
    una entrada abierta.
17. **La respuesta que no es la mandada** (r2-1) — En la barra y en el diálogo,
    si «Agregar» o «Reintentar» con el id pendiente reciben la entrada del
    primer intento y lo mandado era otra cosa, lo tecleado queda, aparece el
    aviso informativo y el próximo «Agregar» crea la entrada nueva.
18. **La pantalla** — Los recorridos de abajo.

### Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                                           | Qué afirma                                                                                  | Mutante que tiene que caer                                                                                                                                                                                       |
| -------- | ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad      | `schema.test.ts`                                                  | los cuatro rechazos y el id conservado                                                      | `id: z.uuid()` (pasan el nulo y el v7); `id` con `.optional()`                                                                                                                                                   |
| 2        | integración | `manual-retry.integration.test.ts`; `audit.integration.test.ts`   | `created.id`, la fila y el `entityId` iguales al pedido                                     | `insertClosed` sin el `id` (lo genera la base)                                                                                                                                                                   |
| 3        | integración | `manual-retry.integration.test.ts`; `audit.integration.test.ts`   | respuesta igual; filas, unión y constancias iguales                                         | `createManualEntry` sin `createEntryOnce`, con su transacción de hoy y el id (el segundo sale `unexpected` por la clave primaria)                                                                                |
| 4        | integración | `manual-retry.integration.test.ts`                                | con `raceThroughBarrier`: los dos con el id, una fila, una constancia                       | una lectura propia antes de la transacción y sin la relectura del paso 4 del ADR (el perdedor sale `unexpected`). En secuencia ese mutante pasa: por eso la barrera                                              |
| 5        | integración | `manual-retry.integration.test.ts`                                | la respuesta con «B», las horas nuevas y el `weekStart` de la semana vieja; nada escrito    | el insert como `on conflict (id) do update` (pisa la edición); `replayed` con la vista armada desde el pedido y no desde la fila (`weekStart` de la semana original)                                             |
| 6        | integración | `manual-retry.integration.test.ts`                                | `ok` con la fila en cada uno de los seis pedidos cambiados                                  | las reglas, o solo `assertNewEntryPair`, o solo `assertTaggable`, antes de `createEntryOnce`; **las conversiones de hora (`instantFromLocal`, el día de fin, el año 10000, el piso) antes de `createEntryOnce`** |
| 7        | integración | `permissions.integration.test.ts`                                 | desde el service, `inactive` e `invited` con un id propio existente: el mensaje neutro      | `createOnce` directo, sin `createEntryOnce`, con el `can` dentro de `attempt`: la fila propia responde antes                                                                                                     |
| 8        | integración | `manual-retry.integration.test.ts`; `actions.integration.test.ts` | las tres variantes, sembradas con `seedTimeEntry`; código en el service, texto en la action | `findOwnById` sin el filtro de usuario (responde la fila ajena); sin el de workspace (lo mata solo la variante de la misma persona); `idConstraint` con otro nombre (sale `unexpected`)                          |
| 9        | integración | `manual-retry.integration.test.ts`                                | `it.each` de las cuatro reglas; código, texto, filas y constancias                          | cada una de las cuatro movida después de `insertClosed`, dentro de la misma transacción (sale `forbidden`). Con un id nuevo ese mutante pasa: por eso el id ajeno                                                |
| 10       | integración | `manual-retry.integration.test.ts`                                | `outcomeWhileLocked(fila.id, reintento)` es `"resolved"`; filas iguales                     | `findOwn` con bloqueo (`findByIdForUpdate` en una transacción): sale `"blocked"`                                                                                                                                 |
| 11       | integración | `actions.integration.test.ts`                                     | la traducción, la revalidación de las dos rutas y el `ok` del reintento                     | revalidar solo con éxito                                                                                                                                                                                         |
| 12       | todas       | las suites existentes                                             | en verde sin cambiar afirmaciones                                                           | —                                                                                                                                                                                                                |
| 13       | unidad      | `calendar-notices.test.ts`                                        | título, mensaje, tono y `retryable` por código y con `replayedAdd`                          | `retryable: false` fijo en el alta; `retryable` verdadero con cualquier código; el título de antes; `replayedAdd` ignorado                                                                                       |
| 14       | unidad      | `entry-dialog-draft.test.ts`                                      | la forma del pedido                                                                         | —                                                                                                                                                                                                                |
| 15       | e2e         | `e2e/manual-retry.spec.ts`, recorrido 6                           | el aviso a la vista después de «Detener» y del cambio de modo; una sola fila                | `clearNotices()` que llama a `add.clear()` siempre; `add.clear()` en `handleModeChange` (en los dos, el aviso baja, el id se renueva y quedan dos filas)                                                         |
| 16       | unidad      | `sent-entry.test.ts`                                              | cada campo por separado, y las equivalencias                                                | la descripción sin recortar; sin comparar las etiquetas; sin comparar el facturable; las etiquetas comparadas en orden o con mayúsculas                                                                          |
| 17       | e2e         | `e2e/manual-retry.spec.ts`, recorridos 7 y 8                      | lo tecleado queda, el aviso informativo, y el segundo «Agregar» crea la entrada             | `onSuccess` de la barra sin la comparación (la barra se limpia y la entrada nueva se pierde); `onSuccess` del calendario sin la comparación (el diálogo se cierra con lo tecleado)                               |
| 18       | e2e         | `e2e/manual-retry.spec.ts`                                        | los recorridos                                                                              | los de cada recorrido                                                                                                                                                                                            |

**Los pedidos del criterio 6.** Cada uno usa el id de una entrada ya creada
con un pedido válido y cambia solo lo que incumple la regla. La hora que no
existe necesita el workspace del test en `Europe/Madrid` (`workspaceOf`),
donde el 2026-03-29 los relojes pasan de 02:00 a 03:00. El piso se arma con un
workspace creado después del día pedido, como los casos de `beforeWorkspace`
que ya existen. El 9999-12-31 con fin menor que el inicio lleva el fin al
10000-01-01, que no tiene clave de día (`service.ts:871-876`).

**La barrera del criterio 4.** `raceThroughBarrier` con un `hold` que inserta,
sin commitear, una entrada cerrada del mismo actor con el mismo id
(`timeEntryRepository.insertClosed(tx, { id, … })`). Los dos pedidos no la ven
en el paso 1, llegan al insert y se traban contra esa tupla; la barrera se
suelta con `rollback` (`concurrency.ts:91`). Uno inserta y el otro espera su
commit, choca con `time_entry_pkey` y relee. Sin barrera, el segundo pedido
casi siempre encuentra la fila en el paso 1 y el test no prueba la relectura.

**Un mutante declarado equivalente** se prueba antes con pedidos inválidos, ids
inexistentes, ajenos y membresía inactiva, y se compara la respuesta y si la
llamada espera un bloqueo, no solo las filas (`estado-fase1.md:158-163`).

### Recorridos obligatorios de `e2e/manual-retry.spec.ts`

Dueño: `tests-slice2c`. Cada recorrido usa una persona propia y una
descripción propia; las horas de hoy son `00:00–00:01`; las respuestas se
esperan con `withServerAction`. **La respuesta perdida es real**:
`loseActionResponses` (`route.fetch()` + `route.abort()`), y cada recorrido que
la usa **comprueba desde otra pestaña que el primer intento se aplicó**: sin
eso, un pedido que no llegó haría pasar el recorrido sin probar nada. **Sin
reloj emulado**: la revalidación sin recarga se fuerza con
`window.dispatchEvent(new Event("focus"))`, como `manual-entry.spec.ts:390-392`.
**Antes de cada `page.reload()`, las revalidaciones retenidas se sueltan.** Los
recorridos del calendario abren la semana pasada con `openLastWeek`.

1. **Respuesta perdida y «Reintentar», en la barra** (TT-89, TT-90, TT-25).
   Modo manual; retener las revalidaciones (`holdRefreshes`) y perder las
   respuestas. «Agregar»: el aviso dice «No se pudo agregar la entrada.» y «No
   se pudo guardar. Revisá la conexión y volvé a intentar.», con
   «Reintentar»; «No sabemos si la entrada se guardó.» no está; el borrador
   sigue entero. Otra pestaña ve **una** fila con la descripción. Dejar de
   perder respuestas, retener la del reintento (`holdActionResponses`) y
   «Reintentar»: «Agregar» tiene el foco y `aria-disabled="true"`, nunca
   `body`. Soltar la respuesta: el aviso no está, ningún aviso informativo, la
   barra quedó vacía y el foco en la descripción. Soltar las revalidaciones y
   recargar: **una** fila con la descripción. Después, el mismo borrador y
   «Agregar»: **dos** filas (el id se renovó con el éxito).
   _Mutantes_: `onRetry` sin `retryHandlerOf` (sin «Reintentar»); el id fijo
   por montaje (el último «Agregar» responde la primera fila y queda una).
2. **Respuesta perdida y «Agregar» otra vez** (D2c-1). Lo mismo hasta la
   comprobación desde otra pestaña; dejar de perder respuestas y apretar
   «Agregar» en vez de «Reintentar», con el borrador sin cambios: el aviso no
   está, ningún aviso informativo y la barra quedó vacía. Soltar las
   revalidaciones y recargar: **una** fila.
   _Mutante_: `crypto.randomUUID()` directo en `handleAdd`, sin `useNewId`
   (dos filas).
3. **El pedido que no llegó, y «Reintentar» manda el pedido que falló**
   (reemplaza `manual-entry.spec.ts:214-261`; D2c-2 en la barra). Cortar los
   pedidos con `dropActionRequests`. «Agregar» con la descripción «original»:
   el aviso con «Reintentar»; «Agregar» activo; la descripción, el inicio, el
   fin y la duración siguen como se tecleó. Otra pestaña no ve ninguna fila.
   Cambiar la descripción a «editada», dejar de cortar y «Reintentar»: hay
   **una** fila y dice «original»; la barra conserva «editada» y las horas
   volvieron al borrador nuevo.
   _Mutante_: `retryAdd` que manda el borrador actual con el id pendiente (la
   fila dice «editada» y la barra queda vacía).
4. **Respuesta perdida en el alta del diálogo del calendario** (CAL-46). En la
   semana pasada (`openLastWeek`), retener revalidaciones, perder respuestas,
   abrir «Agregar entrada» (`addEntryButton`) y agregar: el diálogo sigue
   abierto con el aviso «No se pudo agregar la entrada.», el mensaje de red y
   «Reintentar». Otra pestaña ve **un** bloque con la descripción. Dejar de
   perder respuestas, retener la del reintento (`holdActionResponses`, como
   `calendar-edit.spec.ts:482-491`) y «Reintentar»: «Agregar» tiene el foco y
   `aria-disabled="true"`. Soltar la respuesta: el diálogo se cierra, hay
   **un** bloque y tiene el foco. Reabrir el alta con `addEntryButton` (no con
   un clic en la franja, que ahora tiene un bloque) y agregar con la misma
   descripción en el mismo horario: **dos** bloques.
   _Mutantes_: `retryable: false` en el alta (sin «Reintentar»); un id nuevo en
   cada `handleAdd` del calendario (dos bloques después de «Reintentar»).
5. **«Reintentar» del diálogo manda el borrador actual** (D2c-2 en el diálogo).
   En la semana pasada (`openLastWeek`), cortar los pedidos con
   `dropActionRequests`, abrir «Agregar entrada» y agregar con «A»: el aviso
   con «Reintentar». Cambiar la descripción a «B», dejar de cortar y
   «Reintentar»: el diálogo se cierra, hay **un** bloque «B» y ninguno «A».
   _Mutantes_: `retry()` con `create.retry` (el bloque dice «A»); `retry()` que
   sigue llamando a `save()` (no sale ningún pedido y el diálogo sigue
   abierto).
6. **Un timer de otra pestaña y el cambio de modo, con el aviso a la vista**
   (TT-30, m4). Modo manual, perder las respuestas, «Agregar»: el aviso con
   «Reintentar». Otra pestaña (`openSecondTab`) inicia un timer con
   `withServerAction(otherPage, …)` y comprueba que hay una fila con la
   descripción del alta. Despachar `focus` en esta pestaña: la barra está en
   modo timer, el aviso del alta sigue y «Reintentar» está inactivo. Dejar de
   perder respuestas y «Detener» en esta pestaña (`withServerAction`): **el
   aviso del alta sigue a la vista**, la barra volvió a manual con la
   descripción y las horas tecleadas, y «Reintentar» está activo. Pasar a modo
   timer con el conmutador: el aviso sigue y «Reintentar» está inactivo.
   Volver a manual: **el aviso sigue** y «Reintentar» está activo.
   «Reintentar»: el aviso no está y no hay aviso informativo. Recargar: **una**
   fila con la descripción del alta, buscada por descripción.
   _Mutantes_: sin `retryDisabled={!isManual}`; `clearNotices()` que llama a
   `add.clear()` siempre (después de «Detener» el aviso no está); `add.clear()`
   en `handleModeChange` (después de volver a manual el aviso no está). En los
   dos últimos, sin aviso el recorrido no puede seguir con «Reintentar»: falla
   ahí.
7. **La respuesta que no es la mandada, en la barra** (r2-1, D2c-1). Modo
   manual, retener revalidaciones, perder las respuestas, «Agregar» con
   «primera»: el aviso con «Reintentar». Otra pestaña ve **una** fila
   «primera». Pasar a modo timer y volver a manual (el aviso sigue, m4).
   Teclear «segunda» y otras horas pasadas, dejar de perder respuestas y
   «Agregar»: el aviso de falla no está; está a la vista «La entrada ya se
   había agregado con lo que mandaste antes; lo que está en la barra no se
   guardó.», y la barra conserva «segunda» y sus horas. «Agregar» otra vez: el
   informativo no está y la barra quedó vacía. Soltar revalidaciones y
   recargar: **una** fila «primera» y **una** «segunda».
   _Mutante_: `onSuccess` sin la comparación (después del primer «Agregar» la
   barra queda vacía, no hay informativo y, al recargar, no hay «segunda»).
8. **La respuesta que no es la mandada, en el diálogo** (r2-1, D2c-2). En la
   semana pasada (`openLastWeek`), retener revalidaciones, perder respuestas,
   abrir «Agregar entrada» y agregar con «A»: el aviso con «Reintentar». Otra
   pestaña ve **un** bloque «A». Cambiar la descripción a «B», dejar de perder
   respuestas y «Reintentar»: el diálogo sigue abierto con «B» y el aviso «La
   entrada ya se había agregado con lo que mandaste antes; lo que está en el
   diálogo no se guardó.». «Agregar»: el diálogo se cierra. Soltar
   revalidaciones: **un** bloque «A» y **uno** «B».
   _Mutante_: `onSuccess` del calendario sin la comparación (el diálogo se
   cierra después de «Reintentar» y no hay bloque «B»).

## 8. Deuda conocida del slice

- **Lo mandado con el id pendiente no se aplica si el primer intento se
  aplicó** (D2c-1). Desde r2-1 no es silencioso: la barra o el diálogo
  conservan lo tecleado con el aviso informativo, y hace falta un segundo
  «Agregar» para crear la entrada. Si lo que cambió era una corrección del
  primer intento, la persona queda con las dos entradas y tiene que borrar la
  primera.
- **La comparación de r2-1 es del cliente** y compara lo que la vista muestra
  (§5.0). Si la persona cambió de zona horaria entre el primer intento y el
  reintento, una respuesta del mismo pedido puede no coincidir en las horas, y
  la barra no se limpia con el aviso informativo. Un `replayed` explícito en la
  respuesta lo cerraría; pide cambiar el contrato de `createOnce`, que comparten
  todos los módulos.
- **El aviso del alta con id pendiente no se puede cerrar en la barra** (m4):
  `ActionFeedback` no tiene un control de cierre, y desde este slice
  `clearNotices()` no lo baja. Queda a la vista hasta el desenlace de otro
  pedido del alta, aunque la persona siga trabajando en modo timer. Si se
  quiere cerrar a mano, es un cambio de `ActionFeedback`, que comparten todos
  los módulos.
- **El reintento puede recrear una entrada que la persona borró** entre la
  respuesta perdida y el clic (ADR 0007, `:239-247`). Como el aviso no baja con
  la revalidación (D2c-3) ni con las otras operaciones de la barra (m4), la
  ventana es todo el tiempo que el aviso esté a la vista. Sin test: el
  desenlace está escrito en el ADR.
- **En el calendario, cerrar el diálogo con la falla a la vista y volver a
  abrir el alta es otra alta**, con otro id: si el primer intento se aplicó, la
  segunda la duplica. Es la regla del ADR («el id se renueva cuando el aviso
  baja»); la barra ya no la tiene desde m4, el calendario sí, porque su aviso
  vive en el diálogo y no sobrevive a otra apertura.
- **D2c-2 deja dos «Reintentar» distintos para la misma action**: en la barra
  manda el pedido que falló; en el diálogo, el borrador actual. Y el del
  diálogo diverge de las altas en diálogo del slice 9.
- **«Reintentar» inactivo usa `disabled`** (`action-feedback.tsx:58`), contra
  la lección del foco (`estado-fase1.md:173-174`): si tenía el foco cuando
  llega un timer de otra pestaña, el foco cae en `body`. Es lo mismo que ya
  pasa con los otros `retryDisabled` de la barra (`tracker-bar.tsx:690`,
  `:698`, `:707`, con `switching`).
- **Una variante más de `retryOf`** (`retryAdd`), que suma a la deuda de
  `estado-fase1.md:44`.
- **Un id ajeno ya borrado se puede reusar** (deuda del 2b, §8): ahora también
  desde el alta manual.
- **`timesheet.md` cita TT-109 hasta que `parity-analyst` lo corrija** (D2c-4);
  la corrección es condición de merge. La regla de la copia de semana la
  decide el contrato del 13.
