# 0019. Escribir una celda de la planilla fija su valor, una celda a la vez

Fecha: 2026-10-07. Estado: propuesto.
Origen: contrato del slice 13
([`fase1-slice13-planilla.md`](../slices/fase1-slice13-planilla.md)), decisión
D13-2. TS-37 de [`timesheet.md`](../parity/timesheet.md) deja al contrato
«cómo» se serializan dos pedidos sobre la misma celda. Lo aprueba el usuario.

Enmienda al [ADR 0007](0007-el-cliente-elige-el-id-de-las-altas.md) en una
consecuencia, y suma una clase de bloqueo a las reglas del
[ADR 0011](0011-las-acciones-en-masa-son-todo-o-nada.md). Ver «Relación con los
ADR 0007 y 0011».

## Contexto

Escribir una celda de la planilla es «dejar la celda en este valor» (sección 5
de `timesheet.md`): el pedido lleva el día, el proyecto, la tarea y los
minutos, y el servidor decide qué escribir mirando lo que la celda tiene **en ese
momento**. Según lo que encuentre, el mismo pedido crea una entrada (TS-29),
edita el fin de la única (TS-33), agrega una o achica la que empieza más tarde
(TS-34), o no escribe nada. Las cuentas son las del
[ADR 0018](0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md).

TS-37 pide dos cosas:

- **Reintentar deja el mismo estado.** Ante una falla de red el aviso ofrece
  «Reintentar» (TS-91, TT-89).
- **Dos pedidos simultáneos sobre la misma celda la dejan en un solo estado**:
  un Enter seguido de la pérdida del foco, o dos pestañas. Sobre una celda
  vacía, una sola entrada.

La segunda no la da ninguna restricción de la base. Una celda vacía no tiene
ninguna fila que bloquear, y una celda puede tener varias entradas, así que no
hay índice único que la represente. Con `read committed`, dos transacciones que
leen la celda vacía a la vez crean una entrada cada una.

Lo que ya existe y la decisión tiene que respetar:

- **El ADR 0007** hace idempotentes las altas con un id que elige el cliente y
  `createOnce`, y anticipa entre sus consumidores futuros «las celdas del
  timesheet».
- **El ADR 0011**: toda operación que bloquea más de una fila de `time_entry`
  lo hace en una sola sentencia con `order by id`; una operación de una fila
  bloquea una sola.
- **El ADR 0013** y la fila del rastreador: entre dos pestañas, gana la última
  escritura de cada campo.
- **Neon** atiende las conexiones agrupadas con PgBouncer en modo transacción:
  un bloqueo de sesión puede quedar en una conexión que después usa otra
  transacción.

## Opciones

1. **El alta con el id del cliente y `createOnce`; la edición, por estado.** El
   cliente manda un id por cada escritura; si la celda está vacía, la entrada
   se crea con ese id.
2. **Fijar el valor sin id del cliente, con un bloqueo consultivo por celda.**
   La transacción toma `pg_advisory_xact_lock` con una clave de la celda, en
   una sentencia propia, y recién después lee la celda y decide.
3. **Una transacción `serializable`** que lee la celda y escribe, y reintenta
   ante `40001`.
4. **Bloquear una fila que represente a la persona**, como su membresía, con
   `for update`, antes de leer la celda.

## Decisión

La opción 2.

- **Una transacción por pedido, en `read committed`**, el nivel por omisión.
  Primero el bloqueo de la celda, en su propia sentencia; después la lectura de
  sus entradas cerradas, con `for update` en una sola sentencia y `order by id`
  (ADR 0011); después la decisión, que es pura (ADR 0018), y la escritura.
- **La clave** es la de TS-37: persona, proyecto, tarea y día. Viaja como
  texto —el workspace, el usuario, el proyecto o `-`, la tarea o `-`, y el
  instante de inicio del día en ISO— con los ids en minúsculas, y se bloquea con
  la forma de dos enteros: `pg_advisory_xact_lock(<clase de la planilla>,
hashtext(<clave>))`. La clase es una constante del repository de
  `time-entry`, como `WORKSPACE_BOOTSTRAP_LOCK` en el de `workspace`; la forma
  de dos enteros no comparte espacio de claves con la de uno.
- **Sin id del cliente y sin `createOnce`.** La entrada que crea una celda
  recibe un id que genera el service. La idempotencia es por valor: el segundo
  intento encuentra la celda en `V` y no escribe.
- **La decisión se toma dentro de la transacción, con lo leído bajo el
  bloqueo.** Lo que la pestaña vio no viaja y no se compara.

## Por qué

- **Contra la 1, el caso que pide TS-37.** Dos pestañas mandan dos ids
  distintos sobre la misma celda vacía; `createOnce` no los relaciona y quedan
  dos entradas. El bloqueo hace falta igual, y con el bloqueo el id no agrega
  nada: el reintento ya encuentra la celda en `V`. Además mezclaría dos
  semánticas en una mutación —«responder lo que hizo el primer intento» cuando
  creó, «dejar la celda en `V`» cuando editó— y la lectura de la fila propia de
  `createOnce` correría fuera de la transacción y antes del bloqueo.
- **Contra la 3, la vuelta.** Postgres detecta el conflicto, pero hay que
  reintentar ante `40001` con un tope, un camino que el proyecto no tiene y que
  depende de los bloqueos de predicado de la versión y del plan. Un bloqueo
  explícito dice qué se serializa y se prueba con las barreras que ya existen.
- **Contra la 4, el alcance y el acoplamiento.** Pone en fila todas las
  escrituras de la persona, en cualquier celda, y toma un bloqueo sobre una
  tabla de otro módulo que escriben las operaciones de equipo.

## Relación con los ADR 0007 y 0011

- **ADR 0007.** Su consecuencia «Los consumidores futuros —el arrastre que crea
  en el calendario, las celdas del timesheet, las altas de cualquier módulo
  nuevo— crean con la misma regla y la misma `createOnce`» **deja de valer para
  las celdas**. Escribir una celda no es un alta: puede crear, editar o no
  escribir, y su reintento se resuelve por el valor. Las demás altas siguen con
  el ADR 0007.
- **ADR 0011.** La escritura de una celda bloquea las entradas de la celda en
  una sola sentencia con `order by id`, que es la regla de las operaciones de
  varias filas, y antes toma un bloqueo consultivo. No puede cerrar un ciclo:
  - ninguna otra operación toma bloqueos de celda, y cada escritura de celda
    toma exactamente uno, antes de cualquier fila: un bloqueo consultivo nunca
    se pide teniendo una fila;
  - entre filas, rige el orden por id del ADR 0011, igual que en las masivas;
  - una colisión de `hashtext` entre dos celdas solo hace que esas dos se
    esperen.

  Quitar una fila de la planilla (TS-52) bloquea sus entradas de la semana con
  la misma regla y no toma bloqueos de celda.

## Consecuencias

- **Dos escrituras de la misma celda se ponen en fila** y la segunda decide con
  lo que dejó la primera. Sobre una celda vacía queda una sola entrada con el
  valor del segundo pedido (TS-110).
- **El bloqueo se pide antes de leer, en otra sentencia.** En `read committed`
  cada sentencia toma su propia foto: la lectura que sigue al bloqueo ya ve lo
  que confirmó la transacción que lo tenía. Con `repeatable read` la foto sería
  la de la primera sentencia —la del bloqueo, tomada antes de esperar— y la
  segunda transacción no vería la entrada de la primera. Por eso la transacción
  no fija nivel de aislamiento.
- **No serializa contra las demás mutaciones.** Un alta manual, la edición de una
  fila o una masiva que mueven una entrada a la celda no toman el bloqueo: rige
  la última escritura, como entre la fila del rastreador y el diálogo del
  calendario. La escritura de la celda lee el estado después de tomar su
  bloqueo, así que nunca decide con una foto vieja.
- **«Reintentar» vuelve a dejar la celda en `V`.** Si entre la respuesta perdida
  y el reintento otra pestaña cambió la celda, el reintento la devuelve a `V`:
  gana la última escritura, como en la fila. Con `createOnce` el reintento de un
  alta habría respondido la fila del primer intento sin tocar nada.
- **Si la zona de la persona cambia entre la respuesta perdida y el reintento,
  no hay punto fijo**, y se acepta: el reintento corta el día con la zona nueva,
  puede no encontrar la entrada que creó el primer intento y crear una segunda.
  Cambiar la zona en esa ventana es raro, y la segunda entrada queda a la vista
  en la grilla.
- **Una pestaña desactualizada no necesita nada propio** (TS-93): el pedido no
  lleva lo que la pestaña vio, y el servidor aplica la regla sobre lo que hay.
- **Es un bloqueo de transacción**, que se suelta en el `commit` o el
  `rollback`, así que es seguro con el agrupador de Neon. Un bloqueo de sesión
  no lo sería.
- **Se prueba con las barreras de `src/test/concurrency.ts`**: la barrera toma
  el mismo bloqueo de celda y los pedidos se encolan detrás; una espera de un
  bloqueo consultivo cuenta en `wait_event_type = 'Lock'`, que es lo que mira
  `waitForBlockedBackends`. Sin el bloqueo los pedidos no esperan la barrera y
  el test falla; con la lectura antes que el bloqueo, quedan dos entradas.
- **El repository suma una función que toma el bloqueo** y conoce la clase y la
  forma de la clave; el service no arma SQL.
