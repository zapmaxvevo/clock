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

El driver es `@neondatabase/serverless` por WebSocket, con transacciones en
`read committed`. En ese nivel, dos transacciones que leen «no hay timer
activo» y después insertan no se ven entre sí hasta el commit.

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

El corte de TT-35 usa un solo instante: el service calcula `now` una vez y lo
escribe como `ended_at` de la entrada vieja y como `started_at` de la nueva,
dentro de la misma transacción. No queda hueco entre las dos entradas.

La violación del índice es la única señal de carrera que se maneja, y se
traduce a resultado exitoso con el timer que sobrevivió, no a error de dominio.

## Consecuencias

- El invariante vive en la base, así que ningún camino futuro —importación,
  cron, otro módulo— puede dejar dos entradas abiertas por descuido.
- El service queda acoplado al código de error `23505` de Postgres y al nombre
  del índice. El reconocimiento se encapsula en una función del repository, que
  es la capa que ya conoce el motor; el service solo ve un booleano.
- No hay bloqueos: dos arranques simultáneos no serializan esperando, el
  perdedor falla rápido y vuelve a leer. Con la opción 2 la segunda petición
  habría esperado al commit de la primera, lo que en funciones con tiempo
  máximo de ejecución agrega un modo de falla por timeout.
- El perdedor de la carrera pierde su descripción: queda corriendo el timer del
  ganador. Es lo que pide TT-37 —la interfaz se sincroniza con el estado real—
  y lo que evita que dos pestañas dejen dos entradas abiertas.
- `startTimer` no es idempotente por sí misma: dos clics seguidos en la misma
  pestaña, suficientemente separados como para no chocar en la base, cierran la
  primera entrada y abren una segunda de duración casi cero. La interfaz lo
  evita deshabilitando el botón mientras la escritura está en vuelo; la base no
  lo puede distinguir de un arranque legítimo.
- La opción 3 queda descartada: sin restricción, la carrera de TT-37 deja dos
  filas con `ended_at` nulo y la lectura del timer activo pasa a ser ambigua
  para siempre, sin forma de reparar los datos a posteriori.
