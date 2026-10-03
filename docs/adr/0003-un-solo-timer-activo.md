# 0003. Un solo timer activo por usuario

Fecha: 2026-10-02. Estado: aceptado.

## Contexto

TT-34 fija la regla: una persona tiene como máximo un timer activo, y un timer
activo es una fila de `time_entry` con `ended_at` nulo. TT-35 agrega que
arrancar un timer con otro corriendo cierra el anterior, y TT-37 que dos
arranques simultáneos del mismo usuario tienen que dejar una sola entrada
abierta, sin error visible.

El servidor no guarda estado en memoria y corre en funciones sin afinidad: dos
pestañas, dos dispositivos o un doble clic pueden ejecutar `startTimer` en
paralelo en instancias distintas. La única coordinación disponible es la base.

El driver habla con un Postgres en `read committed`. En ese nivel, dos
transacciones que leen «no hay timer activo» y después insertan no se ven entre
sí hasta el commit.

## Opciones

1. **Índice único parcial sobre (`workspace_id`, `user_id`) con
   `ended_at is null`, y resolución optimista de la violación.** La transacción
   cierra el activo e inserta el nuevo; si la base devuelve `23505` sobre ese
   índice, la transacción se deshace, se vuelve a leer el timer activo que
   quedó y la action lo devuelve como resultado exitoso.
2. **Bloqueo pesimista.** `select ... for update` sobre las entradas abiertas
   del usuario al principio de la transacción, o un `pg_advisory_xact_lock`
   sobre el par usuario/workspace. La segunda transacción espera y encuentra el
   estado ya resuelto.
3. **Comprobación solo en el service, sin restricción en la base.** Leer el
   activo, cerrarlo, insertar.

## Decisión

La opción 1.

El índice es
`unique index time_entry_running_unq on time_entry (workspace_id, user_id) where ended_at is null`.

El corte de TT-35 usa un solo instante y lo pone la base, no el reloj del
proceso: las dos sentencias de la transacción escriben `now()`, que en Postgres
es la marca de inicio de la transacción y vale lo mismo en las dos. El
`ended_at` de la entrada vieja y el `started_at` de la nueva quedan idénticos y
no hay hueco entre las dos.

La violación del índice es la única señal de carrera que se maneja. Cuando
aparece, la transacción ya está abortada, así que la resolución ocurre afuera:

1. Se vuelve a leer el timer activo del usuario. Si hay uno, es el del ganador
   de la carrera y la action lo devuelve como resultado exitoso, sin error
   visible, que es lo que pide TT-37.
2. Si no hay ninguno —el ganador lo detuvo entre el choque y la relectura— se
   reintenta la transacción completa, una sola vez.
3. Si la segunda vuelta vuelve a chocar y la relectura vuelve a no encontrar
   nada, la action devuelve `unexpected`.

El reintento es uno solo y no se encadena: lo que lo agota son dos carreras
seguidas con una detención en el medio, y seguir reintentando contra un cliente
que arranca y detiene en bucle alarga la petición sin acercarse a un resultado.

> **Nota del 2026-10-03.** El
> [ADR 0007](0007-el-cliente-elige-el-id-de-las-altas.md), en estado
> propuesto, enmienda esta sección en dos puntos. Antepone a esta resolución la
> búsqueda de una entrada propia con el id que eligió el cliente: al principio
> de cada vuelta y antes de releer al ganador. Y **la violación del índice deja
> de ser la única señal de carrera**: dos intentos simultáneos del mismo pedido
> chocan en la clave primaria, `time_entry_pkey`, y esa búsqueda es la que los
> resuelve. Los tres pasos de arriba y el tope de dos vueltas no cambian; pasan
> a ser el gancho de `time-entry` sobre `createOnce`. El algoritmo completo está
> en ese ADR.

## Consecuencias

- El invariante vive en la base, así que ningún camino futuro —importación,
  cron, otro módulo— puede dejar dos entradas abiertas por descuido.
- El service queda acoplado al código de error `23505` de Postgres y al nombre
  del índice. El reconocimiento se encapsula en una función del repository, que
  es la capa que ya conoce el motor; el service solo ve un booleano.
- El resultado de `startTimer` nunca tiene `running` nulo: o la transacción
  cerró bien, o la relectura encontró el timer del ganador, o la action
  devolvió error. Ese es el motivo del reintento acotado: sin él, la ventana
  entre el choque y la relectura deja un caso sin forma de resultado.
- No hay bloqueos: dos arranques simultáneos no serializan esperando; el
  perdedor falla rápido, vuelve a leer y, en el peor caso, reintenta una vez.
  Con la opción 2 la segunda petición habría esperado al commit de la primera,
  lo que en funciones con tiempo máximo de ejecución agrega un modo de falla
  por timeout.

  > **Nota del 2026-10-03.** Este punto es inexacto, y lo precisa la revisión
  > del ADR 0007. El perdedor **sí espera**: si había un timer previo, su cierre
  > espera el bloqueo de esa fila, que tomó el ganador al cerrarla; si no había,
  > su insert espera el commit de la tupla del ganador con la que choca. Recién
  > después falla. La espera dura lo que la transacción del ganador, que es
  > corta, así que la diferencia con la opción 2 es menor que la que dice este
  > punto: lo que la opción 1 evita es tomar un bloqueo a propósito en cada
  > arranque, no esperar cuando dos arranques se cruzan.

- El perdedor de la carrera pierde su descripción: queda corriendo el timer del
  ganador. Es lo que pide TT-37 —la interfaz se sincroniza con el estado real—
  y lo que evita que dos pestañas dejen dos entradas abiertas.
- `startTimer` no es idempotente por sí misma: dos clics seguidos en la misma
  pestaña, suficientemente separados como para no chocar en la base, cierran la
  primera entrada y abren una segunda de duración casi cero. La interfaz lo
  evita deshabilitando el botón mientras la escritura está en vuelo; la base no
  lo puede distinguir de un arranque legítimo.

  > **Nota del 2026-10-03.** Enmendado por el
  > [ADR 0007](0007-el-cliente-elige-el-id-de-las-altas.md), en estado
  > propuesto: un **reintento** del mismo pedido lleva el mismo id y ya no
  > cierra la entrada que abrió el primer intento, y tampoco lo hace un
  > «Iniciar» apretado otra vez mientras se ve el aviso de falla por red, que
  > reusa el id pendiente. Lo de arriba sigue valiendo para **dos clics que
  > generan dos ids**, que son dos pedidos distintos.

- La opción 3 queda descartada: sin restricción, la carrera de TT-37 deja dos
  filas con `ended_at` nulo y la lectura del timer activo pasa a ser ambigua
  para siempre, sin forma de reparar los datos a posteriori.

## Deuda conocida

El reintento acotado tiene test solo en el camino frecuente: la relectura
encuentra al ganador. Las dos ramas que agregó la ronda 1 de revisión
—relectura vacía, que dispara la segunda vuelta, y segunda vuelta fallida, que
termina en `unexpected`— no se ejercitan. Forzarlas de forma determinista
necesita un seam de prueba que el contrato descartó a propósito (sin `vi.mock`
y sin repository inyectable), así que queda anotado en vez de abrir esa puerta.

> **Nota del 2026-10-03.** Desde el slice 2b la parte de las vueltas sale de
> esta deuda: `createOnce` (ADR 0007) recibe sus dependencias como funciones, y
> su test de unidad cubre la otra vuelta que pide el gancho y el error que sale
> al agotarse las dos, sin `vi.mock`. Lo que sigue sin test determinista es que
> el gancho de `time-entry` pida la otra vuelta contra una base real, porque eso
> exige que el ganador detenga su timer entre el choque y la relectura.
