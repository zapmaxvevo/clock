# 0011. Las acciones en masa son todo o nada

Fecha: 2026-10-03. Estado: aceptado.
Origen: contrato del slice 6
([`fase1-slice6-seleccion-y-masa.md`](../slices/fase1-slice6-seleccion-y-masa.md)).
Revisado en la ronda 1 de ese contrato
([`correcciones-fase1-slice6.md`](../slices/correcciones-fase1-slice6.md)).

## Contexto

El slice 6 trae las primeras operaciones del proyecto que escriben sobre varias
filas a la vez con un solo pedido: la edición masiva de descripción, hora y
fecha (TT-63) y el borrado masivo (TT-64). No son las últimas. El slice 12 suma
proyecto, tarea, etiquetas y facturable al mismo diálogo, y la fase 2 y el
reporte detallado traen otras operaciones en bloque sobre entradas y sobre
proyectos.

Una fila de la selección puede no admitir el cambio pedido. Las causas son las
mismas que ya tiene la edición de una fila:

- la entrada ya no existe, porque se borró en otra pestaña (TT-80);
- es de otra persona o es el timer que corre, cosa que solo llega con un pedido
  armado a mano (TT-79, TT-111);
- su horario no se puede expresar con el trío de la fila (TT-110);
- la hora pedida no existe ese día por el cambio de horario (TT-112);
- el par que queda dura menos de un minuto (TT-73);
- o cae antes de la creación del workspace (ADR 0005).

_Corregido el 2026-10-07, aprobado por el usuario_: la última causa pasa a «cae
antes del piso (2000-01-01)»; el piso dejó de ser la creación del workspace
(ADR 0005).

Varias dependen del día de cada fila: cambiar solo el inicio a las 02:30 en
Madrid falla en la fila del 29 de marzo y anda en todas las otras. Hay que
decidir qué pasa con el resto de la selección cuando una fila falla, y cómo se
entera la persona de cuál fue.

Las restricciones que la decisión no puede romper:

- **No hay deshacer** (P-06, TT-61). Lo que se escribe no se puede revertir
  desde la interfaz.
- **El reintento de TT-89** tiene que dejar el mismo estado que el primer
  intento.
- **Un aviso nombra lo que no se pudo hacer** (TT-90), y cada causa tiene un
  solo texto («Una redacción por causa», en `docs/parity/time-tracker.md`).
- **El permiso se decide en `can()`**, sobre la fila leída, como en las
  operaciones de una fila.

## Opciones

1. **Todo o nada, con todos los rechazos juntos.** Una transacción lee y
   bloquea todas las filas, evalúa cada una contra las reglas sin escribir
   nada y, si alguna no admite el cambio, no escribe ninguna y responde la
   lista de las que lo impiden, cada una con su causa.
2. **Todo o nada, cortando en la primera fila que falla.** Igual que la 1,
   pero responde una sola causa.
3. **Fila por fila.** Aplica lo que se puede y responde las que fallaron.
4. **El cliente llama N veces a la action de una fila.** No hace falta ninguna
   action nueva.

## Decisión

La opción 1.

- **Una transacción por pedido.** Lee y bloquea todas las filas en una sola
  sentencia, en el orden de su id, y evalúa cada una con la misma regla que
  usa la operación de una fila: la misma función, no una copia.
- **Si alguna fila no admite el cambio, no se escribe ninguna.** La respuesta
  es un error de código `rejected` que lleva cada fila rechazada con su id, su
  código y el texto de su causa, que es el mismo de la operación de una fila.
- **Un rechazo es de una fila.** Una causa que vale para todo el pedido —una
  membresía desactivada, una entrada inválida, el proyecto elegido que ya no
  está disponible en el slice 12— responde con su propio código, igual que una
  operación de una fila, y no lleva lista.
- **Una excepción, el borrado**: una fila que ya no existe no es un rechazo,
  porque lo pedido —que esa entrada no esté— ya se cumple. Es la regla que el
  slice 4 fijó para descartar el timer (TT-65). En la edición, la fila que ya
  no existe sí es un rechazo: el cambio pedido no se puede aplicar.

### La forma de la respuesta

Vive en `src/server/action.ts`, junto a `ActionResult`, porque la van a usar
otros módulos:

```ts
/** Una fila que impidió una operación en masa. */
export type Rejection<Code extends string = ActionErrorCode> = {
  readonly id: string;
  readonly code: Code;
  readonly message: string;
};

/** La operación en masa no se aplicó: lleva cada fila que la impidió. */
export class RejectedError<
  Code extends string = ActionErrorCode,
> extends DomainError<"rejected"> {
  constructor(
    message: string,
    readonly rejections: readonly Rejection<Code>[],
  ) {
    super("rejected", message);
    this.name = "RejectedError";
  }
}
```

`ActionResult` suma a su rama de error un campo opcional,
`rejections?: readonly Rejection<Code>[]`, que `failure` copia de un
`RejectedError`. `failure` lo reconoce antes que `DomainError`, que es su clase
base. `ActionFailure`, en `src/hooks/use-action.ts`, suma el mismo campo y el
hook lo conserva. El código `rejected` no entra en `ActionErrorCode`: lo suma a
su unión el módulo que tenga operaciones en masa.

## Por qué

- **Contra la 3, la falta de deshacer.** Con una edición parcial, la persona
  queda con una lista donde unas filas cambiaron y otras no, sin marca que las
  distinga después de la revalidación y sin forma de volver atrás. Si movió
  diez entradas a otro día y tres no se movieron, para corregir el error de
  fecha tiene que encontrar las siete que sí. Con todo o nada, el desenlace se
  dice en una frase: «ninguna cambió, por estas filas».
- **Contra la 2, el ida y vuelta.** Cortar en la primera obliga a descubrir las
  filas de a una: quitar una, guardar, encontrar la siguiente. Evaluar todas
  cuesta lo mismo, porque las filas ya están leídas y la evaluación no escribe
  ni consulta.
- **Contra la 4, la atomicidad y el costo.** N pedidos son N transacciones, N
  revalidaciones de la página y ninguna garantía de que una falla a mitad de
  camino deje algo coherente. Es la opción 3 con más idas y vueltas.
- **Por qué la excepción del borrado.** Sin ella, el reintento de un borrado
  masivo cuya respuesta se perdió fallaría siempre, porque el primer intento ya
  borró las filas. Con ella, el reintento responde éxito sin escribir, y TT-89
  se cumple sin ids elegidos por el cliente.

## Consecuencias

- **El reintento llega a un punto fijo en la edición.** Un segundo intento
  encuentra cada fila ya con lo pedido: la descripción es la misma y el trío
  de cada fila es el pedido, así que el ADR 0006 conserva los dos extremos.
  Las filas que no cambian no se escriben ni dejan registro. **Ninguna
  operación en masa necesita el id elegido por el cliente** del ADR 0007,
  porque ninguna crea filas.
- **El orden de los bloqueos es regla, no detalle de implementación**:
  - **Toda operación que bloquee más de una fila de `time_entry` lo hace en una
    sola sentencia con `order by id`**, y con `for update of time_entry` si la
    sentencia tiene un join. El `order by` deja el ordenamiento debajo del
    bloqueo en el plan, así que las filas se bloquean en ese orden y no en el
    del recorrido, que nadie garantiza. Bloquear fila por fila, o en el orden
    pedido, está prohibido.
  - **Las operaciones de una fila bloquean una sola**, y es una invariante: una
    operación que bloquea una sola fila no puede cerrar un ciclo con otra.
    Si una operación de una fila pasara a bloquear dos, entra en la regla de
    arriba.
  - Con las dos, dos pedidos sobre filas compartidas se ponen en fila en vez de
    esperarse en círculo. Lo afirma un test de integración del slice 6: dos
    ediciones masivas sobre los mismos ids, en orden opuesto y cruzadas con una
    barrera, responden `ok` las dos. El mutante que bloquea con un
    `for update` por fila en el orden pedido termina en `40P01`; la revisión lo
    ejecutó en Postgres 17.11 con 5000 filas y 200 ids.
- **Un pedido tiene tope de filas**, que fija cada contrato. Una transacción
  sostiene los bloqueos de todas sus filas hasta terminar, y la escritura es
  una sentencia por fila que cambia.
- **El registro de auditoría es por fila**, como en las operaciones de una
  fila, con una acción propia que distingue la operación en masa:
  `timeEntry.bulkEdit`, `timeEntry.bulkDelete`. Se escriben con una sola
  sentencia (`recordAudits`). Un pedido rechazado no deja registro, porque no
  escribió nada.
- **La interfaz necesita nombrar las filas rechazadas**, y una fila que ya no
  existe no tiene nada que el servidor pueda nombrar. El cliente guarda, al
  mandar el pedido, cómo nombraba cada fila elegida, y con eso arma la lista
  del aviso.
- **Una fila que no admite el cambio frena a todas las demás.** Es el precio.
  Para que no sea un callejón, el aviso ofrece quitar de la selección las
  filas rechazadas y volver a guardar.
- **No sé qué hace Clockify.** La documentación pública de la edición masiva
  no dice si aplica en parte. Si el workspace del equipo muestra que sí, la
  diferencia se registra como `adaptar` con este razonamiento; no cambia la
  decisión.
