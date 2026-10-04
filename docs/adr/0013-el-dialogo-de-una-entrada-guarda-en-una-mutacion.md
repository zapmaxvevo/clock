# 0013. El diálogo de una entrada guarda en una sola mutación

Fecha: 2026-10-04. Estado: propuesto.
Origen: contrato del slice 8
([`fase1-slice8-calendario.md`](../slices/fase1-slice8-calendario.md)), a partir
de la decisión del usuario sobre calendario P-04 (2026-10-04): el diálogo de una
entrada guarda todo o nada con un botón «Guardar», como Clockify.

## Contexto

El calendario abre una entrada en un diálogo con varios campos: descripción,
proyecto y tarea, y el horario. En una entrada cerrada el horario es el trío
`{ date, start, end }` del slice 3; en la que corre es solo el inicio, día y hora
(TT-28, TT-111). P-04 fija que «Guardar» aplica todos los cambios del diálogo
juntos, o ninguno (CAL-67).

Hoy cada campo tiene su mutación, con su transacción, su bloqueo, su constancia
de auditoría y su vista de respuesta: `updateDescription`, `updateEntryProject`,
`updateEntryTimes` y `updateRunningStart`. La fila del rastreador guarda campo
por campo (TT-55) y está bien que lo haga. Dos pedidos seguidos no son todo o
nada: si el segundo falla, el primero ya quedó escrito.

No es el último diálogo así. El slice 11 suma etiquetas y facturable al mismo
diálogo, y el detalle de una celda del timesheet (TS-41, slice 13) edita los
mismos campos de una entrada.

Las restricciones que la decisión no puede romper:

- **Las reglas de horas tienen un solo dueño.** El ADR 0006 las deja en
  funciones privadas de `src/modules/time-entry/service.ts` y prohíbe copiarlas;
  el slice 6 ya sacó la del trío a `entryTimesFor`, que comparten la edición de
  una fila y la masiva.
- **El recorrido de una mutación** (`CLAUDE.md`): la transacción la abre el
  service, y la action no tiene reglas de negocio.
- **La regla del par es de `project`** (ADR 0010): `time-entry` la consulta con
  `assertTrackable` y la transacción propia.
- **El reintento de TT-89** tiene que llegar a un punto fijo.
- **Una operación de una fila bloquea una sola** (ADR 0011).
- **Sin canal abierto** (TT-40): otra pestaña puede editar la entrada mientras el
  diálogo está abierto, y hoy gana la última escritura de cada campo (contrato
  del slice 3, §4.3; CAL-72).

## Opciones

1. **El cliente llama a las mutaciones de hoy, una detrás de otra.** No hace
   falta nada nuevo en el servidor. No es todo o nada, que es justamente lo que
   P-04 pide.
2. **Las mutaciones de hoy reciben una transacción y la action las compone.**
   Cada función del service acepta un `tx` opcional, y una action nueva llama a
   las que correspondan dentro de una sola transacción.
3. **`bulkEditEntries` con un solo id.** Ya es todo o nada y ya usa
   `entryTimesFor`.
4. **Una mutación nueva, `updateEntry`, que recibe los campos que cambiaron** y
   los evalúa con las mismas funciones privadas de las mutaciones de un campo,
   en una transacción, con una sola escritura.

Para la 4 hay una segunda elección: qué manda el cliente.

- **a. El estado entero del diálogo.** El servidor compara con la fila y
  escribe lo que difiere.
- **b. Solo los grupos de campos que la persona tocó**: la descripción, el par,
  el trío o el inicio del timer. Cada grupo viaja entero.

## Decisión

La opción 4, con la variante b.

- **Una entrada, un pedido, una transacción.** El service lee y bloquea la fila
  con `readOwnEntry`, como las mutaciones de un campo, y evalúa cada grupo
  presente con la regla de su mutación: el trío con `entryTimesFor` (por
  `editedFields`, la misma función que usa la edición masiva), el inicio del
  timer con `runningStartFor`, que sale de `updateRunningStart` para que la
  usen las dos, y el par con `assertAssignable`, que llama a `assertTrackable`
  de `project`. **No hay una regla nueva**: si una cambia, cambia para todos sus
  consumidores.
- **El orden de evaluación es fijo**: primero el estado de la fila (un trío
  sobre la entrada que corre, o un inicio de timer sobre una cerrada), después
  el horario y por último el par. El horario no consulta nada; el par sí.
- **Si algo se rechaza, no se escribe nada.** Si todo pasa, se escribe una vez,
  con los campos que cambiaron, y queda una constancia, `timeEntry.update`.
- **Lo que no cambió no se escribe**, comparado contra la fila leída bajo
  bloqueo y no contra lo que el cliente vio. Si no cambia nada, la mutación
  responde la vista sin escribir ni registrar.
- **El trío o el inicio iguales a los de la fila no se evalúan**, como en la
  edición masiva: una entrada de más de un día (TT-110) puede guardar su
  descripción aunque el diálogo mande su trío sin tocar.

## Por qué

- **Contra la 1, P-04.** Es la opción que el usuario descartó.
- **Contra la 2, las capas.** La transacción pasa del service a la action, y con
  ella la decisión de qué mutación llamar, en qué orden y cuál saltear: reglas
  de negocio en la action. Cada mutación vuelve a leer y bloquear la misma fila,
  escribe por separado y deja su constancia: un «Guardar» serían hasta tres
  registros de auditoría y tres vistas, de las que solo vale la última. Y todas
  las mutaciones del módulo cambian de firma para un solo consumidor.
- **Contra la 3, el alcance de la masiva.** Rechaza la entrada que corre, no
  conoce el proyecto hasta el slice 12, responde sus errores como lista de
  rechazos (ADR 0011) —que en una sola entrada es una forma de aviso que no
  corresponde— y registra `timeEntry.bulkEdit`.
- **Contra la 4a, la otra pestaña.** Con el estado entero, guardar el diálogo
  revierte en silencio un campo que la persona no tocó y que otra pestaña
  cambió mientras tanto. Con los grupos tocados, cada grupo sigue la regla de
  hoy —gana la última escritura—, igual que en la fila.

## Consecuencias

- **El reintento llega a un punto fijo.** Un segundo intento encuentra la
  descripción, el par y el trío o el inicio ya como se pidieron, no escribe ni
  registra y responde la misma vista. «Reintentar» se ofrece sin id elegido por
  el cliente: no es un alta (ADR 0007).
- **Dos caminos a las mismas reglas.** La fila del rastreador sigue guardando
  campo por campo con las mutaciones de hoy, y el diálogo usa `updateEntry`. Lo
  que impide que se separen es que llaman a las mismas funciones, y un test de
  equivalencia por grupo —el del slice 6 para la masiva es el modelo— compara
  los resultados sobre copias sembradas iguales.
- **Las causas de rechazo son las de siempre**, con sus códigos y sus textos.
  Lo único nuevo es el título del aviso, «No se pudo guardar la entrada.»
  (CAL-67), que nombra la operación entera.
- **La auditoría tiene una acción más.** Un «Guardar» deja una sola constancia
  con los campos que cambiaron. Quien reconstruya la historia de una entrada
  desde el registro suma `timeEntry.update` a las acciones de un campo.
- **Bloquea una sola fila**: la invariante del ADR 0011 se mantiene.
  `assertTrackable` lee las tablas de `project` sin bloquearlas, como en las
  mutaciones de hoy.
- **No es un tercer camino de instantes** (ADR 0005): los instantes salen de
  `entryTimesFor` y de `runningStartFor`, que ya existen.
- **Cada consumidor nuevo suma un grupo opcional.** El slice 11 agrega etiquetas
  y facturable a `updateEntry`, con la misma regla: ausente no cambia, estricto
  para lo que no conoce. El detalle de la celda del timesheet puede usar la
  misma mutación; lo decide su contrato.
- **Si algún día la fila del rastreador pasa a guardar con botón**, usa esta
  mutación y las de un campo quedan sin consumidores. No es parte de esta
  decisión.
