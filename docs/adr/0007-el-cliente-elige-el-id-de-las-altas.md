# 0007. El cliente elige el id de la entrada que crea

Fecha: 2026-10-03. Estado: aceptado.
Origen: contrato del slice 4
([`fase1-slice4-continuar-duplicar.md`](../slices/fase1-slice4-continuar-duplicar.md)),
corregido por las rondas 1 y 2 de `architecture-reviewer`
([`correcciones-fase1-slice4.md`](../slices/correcciones-fase1-slice4.md)) y por
M-3 de la ronda 1 del slice 9
([`correcciones-fase1-slice9.md`](../slices/correcciones-fase1-slice9.md)). Se
implementa primero sobre «Iniciar», en el slice 2b
([`fase1-slice2b-reintento-de-iniciar.md`](../slices/fase1-slice2b-reintento-de-iniciar.md)),
y se acepta probado sobre ese caso.

Enmienda al [ADR 0003](0003-un-solo-timer-activo.md) en tres puntos: el orden de
la resolución de un choque, la consecuencia sobre la idempotencia de
`startTimer` y la clave primaria como segunda señal de carrera. Ver «Relación
con el ADR 0003».

## Contexto

TT-89 ofrece «Reintentar» cuando un pedido falla por red. Para una operación
que solo modifica una fila identificada —detener, editar, borrar— repetir el
pedido es inofensivo. Para una que **crea**, no: si el pedido llegó al servidor
y lo que se perdió fue la respuesta, el reintento crea otra fila.

El slice 2 lo resolvió para el alta manual sacándole el botón (TT-109), y dejó
escrito que el resto de las operaciones sí lo puede ofrecer porque «arrancar
choca con el índice único». **Eso no es cierto.** `attemptStart` busca el timer
abierto, lo cierra y abre uno nuevo (TT-35, ADR 0003). Si el primer intento de
«Iniciar» llegó y su respuesta se perdió, el reintento encuentra abierto el
timer que creó el primer intento, lo cierra y abre otro: queda una entrada
cerrada de unos segundos que nadie pidió. El índice único solo frena dos
arranques **simultáneos**, no uno que llega después del otro.

El slice 4 suma tres operaciones que crean: continuar (TT-57), que usa el mismo
cierre más arranque que «Iniciar», y duplicar (TT-58), que inserta una fila
cerrada como el alta manual. Más adelante crean también el calendario, las
celdas del timesheet y, en otro módulo, los clientes, proyectos y tareas del
slice 9. Sacarles «Reintentar» a todas, como a la alta manual, deja sin
reintento a las operaciones más frecuentes del rastreador.

## Opciones

1. **Ningún alta ofrece «Reintentar»**, como TT-109. Simple; deja sin
   reintento a «Iniciar» y a «Continuar», y obliga a la persona a mirar la
   lista para saber si su pedido se aplicó.
2. **Una clave de idempotencia aparte**: una columna o una tabla con la clave
   del pedido y su resultado. Funciona, pero es un cambio de esquema y un dato
   que hay que limpiar.
3. **El cliente genera el id de la fila nueva** y lo manda en el pedido. El id
   es la clave de idempotencia: el servidor, antes de crear, busca una fila
   propia con ese id; si existe, el pedido ya se aplicó y responde con ella sin
   escribir nada.

## Decisión

La opción 3, **para las altas de cualquier módulo**, no solo las de
`time-entry`. El slice 9 la adopta para clientes, proyectos y tareas.

Cada alta lleva un `id: z.uuidv4()` que el cliente genera con
`crypto.randomUUID()` **una vez por acción de la persona** —un clic, un atajo—
y que el hook de la acción reenvía tal cual en «Reintentar», porque guarda el
último pedido entero. Es `uuidv4` y no cualquier UUID porque es lo único que
genera `crypto.randomUUID()`: el UUID nulo y las versiones con marca de tiempo
no los manda ningún cliente legítimo, y no hay motivo para aceptarlos como
clave primaria.

La columna `id` de cada tabla ya es un `uuid` con valor por omisión; el valor
que llega lo reemplaza. No cambia el esquema.

### Dónde vive

Dos archivos neutros, que escribe el slice 2b por ser el primero que los
implementa, y que importan los módulos:

- **`src/server/create-once.ts`**: `createOnce`, el algoritmo de abajo, sin
  nada de ningún módulo. Recibe del módulo `findOwn` (la fila propia con ese
  id), `attempt` (la transacción del alta), `replayed` (el resultado a partir
  de la fila propia), `idConstraint` (el nombre de la clave primaria), `action`
  (la acción de permiso del alta, solo para el texto interno del
  `ForbiddenError`) y, opcional, `onOtherConflict` (qué hacer con un choque
  sobre otra restricción).
- **`src/server/db/constraint-error.ts`**: los códigos de Postgres y el
  reconocimiento de la restricción que violó un error (`constraintOf`,
  `hasConstraint`). Es lo que antes vivía privado en el repository de
  `time-entry`.

**Lo que queda en cada módulo** es lo que `createOnce` no puede saber:

- **El permiso.** `createOnce` no lo comprueba, porque no sabe de qué acción se
  trata ni sobre qué recurso. **El service del módulo llama a `can()` y recién
  después a `createOnce`**; en `time-entry` lo hace una función privada del
  service, `createEntryOnce`, y en el slice 9 cada alta.
- **Qué es una fila «propia»**: en `time-entry`, mismo workspace y mismo
  usuario; en el slice 9, mismo workspace y `created_by`.
- **El nombre de las restricciones**, que conoce su repository.
- **El gancho**, si la tabla tiene otra restricción única que choca con una
  carrera. El de `time-entry` es la vuelta del timer abierto del ADR 0003; el
  slice 9 no tiene gancho y reconoce el nombre repetido en el error que sale.

### El algoritmo

```
permiso del módulo                 → si no, forbidden con el mensaje neutro
                                     (lo consulta el service, antes de createOnce)
vuelta (máx. 2):
  1. findOwn(id)                   → si existe, responderla
  2. attempt()                     → si termina bien, responder
  3. el error no es un 23505       → sale tal cual; lo traduce la operación
  4. findOwn(id)                   → si existe, responderla
  5. el 23505 es idConstraint      → ForbiddenError, sin otra vuelta; la action
                                     lo traduce al mensaje neutro
  6. onOtherConflict(error)        → un resultado, u otra vuelta
     sin gancho                    → el error sale tal cual
agotadas las dos vueltas           → el último error sale tal cual (unexpected)
```

El gancho de `time-entry` para el timer abierto:

```
el choque no es time_entry_running_unq → vuelve a lanzar el error
findRunning                            → si existe, responder el ganador (ADR 0003)
                                         si no, otra vuelta
```

Lo que cualquier módulo puede suponer de `createOnce`, que es lo que el slice 9
escribe en su §4.4:

1. **Lee la fila propia antes de escribir** (paso 1).
2. **Ante cualquier `23505` vuelve a leer la fila propia antes de mirar qué
   restricción saltó** (paso 4).
3. **El choque con `idConstraint` sin fila propia sale como `ForbiddenError`**
   (paso 5), el mismo error que lanza `assertCan`, así que la action lo traduce
   al mensaje neutro sin código propio.
4. **Sin `onOtherConflict`, cualquier otro choque sale tal cual** (paso 6).
5. **No comprueba el permiso.** El orden «permiso antes que la fila propia» lo
   garantiza quien la llama.

Por qué cada uno:

- **`findOwn(id)`** es una fila **propia** con ese id, leída sin bloqueo y fuera
  de toda transacción. Si existe, la operación responde con ella **sin escribir
  nada**, en el estado en que esté.
- **El permiso va antes que `findOwn`.** Si fuera después, un actor con la
  membresía desactivada recibiría éxito por mandar el id de una fila propia que
  ya existe. Lo pone el llamador porque es el único que sabe qué acción pedir;
  el actor no cambia entre vueltas, así que la consulta es una sola.
- **El paso 1 va antes de cualquier escritura de la operación**: en «Iniciar»
  y «Continuar», antes de cerrar el timer abierto. Es lo que impide que el
  reintento cierre lo que el primer intento abrió.
- **El paso 4 relee antes de mirar qué restricción saltó.** Dos intentos
  simultáneos del mismo pedido pueden chocar a la vez con la clave primaria y
  con otra restricción, y la base informa una sola. Releer primero hace que el
  desenlace no dependa de cuál informe: en el slice 9, que el reintento no
  responda «nombre repetido» sobre el proyecto que la persona acaba de crear.
- **Los pasos 4 a 6 corren fuera de la transacción**, que ya está abortada.
- **El choque de clave primaria no da otra vuelta.** Si después del choque no
  hay fila propia con ese id, el id es de otra fila —de otra persona, de otro
  workspace— y repetir no cambia nada. La respuesta no dice de quién es.
- **El choque del índice del timer no vuelve al paso 2 si hay un ganador.**
  Volver haría que el perdedor cerrara el timer del ganador y dejara una
  entrada de 0 s. Se responde el timer que quedó, como pide TT-37.
- **Solo el gancho pide otra vuelta**, y el tope es de dos para todos. Sin
  gancho —duplicar, las altas del slice 9, el alta manual si algún día adopta
  esta regla— no hay segunda vuelta.

### La interfaz no inventa un id nuevo para el mismo pedido

«Reintentar» reenvía el último pedido, con su id. Pero la persona puede, en vez
de «Reintentar», repetir la acción con el mismo control —apretar «Iniciar» otra
vez— y eso generaría un id nuevo y dejaría la entrada de segundos que este ADR
quiere evitar. **Mientras el aviso de falla por red de un alta está visible,
repetir la misma acción reusa el id pendiente**; el id se renueva cuando el alta
tiene éxito o cuando el aviso baja. Lo fija el slice 2b para «Iniciar», y el
slice 4 lo extiende a continuar y duplicar la misma entrada.

### Relación con el ADR 0003

El ADR 0003 resuelve el choque del índice único releyendo el timer activo y,
si no hay, reintentando una vez. Este algoritmo lo conserva entero —es el
gancho de `time-entry`— y le agrega:

- **`findOwn` al principio de cada vuelta y antes del gancho.** Si el choque lo
  causó un intento anterior del mismo pedido, la fila a responder es la propia,
  aunque ya esté cerrada; `findRunning` no la vería y la vuelta extra terminaría
  igual en el choque de clave primaria.
- **La clave primaria como segunda señal de carrera.** El 0003 dice que la
  violación del índice es la única que se maneja; desde este ADR, dos intentos
  del mismo pedido chocan en la clave primaria, y el paso 4 la resuelve.
- **El tope de dos vueltas es el mismo**, compartido: no se suma una vuelta por
  el id.

Y enmienda su consecuencia sobre la idempotencia (`0003`, «`startTimer` no es
idempotente por sí misma»): **queda superada para el reintento**, que lleva el
mismo id, y para el «Iniciar» apretado otra vez con el aviso de falla visible,
que reusa el id pendiente; **no para un doble clic que genera dos ids**, que son
dos pedidos distintos y siguen cerrando la primera entrada y abriendo una
segunda de duración casi cero. La interfaz lo sigue evitando con el botón
inactivo mientras la escritura viaja.

### Escenarios verificados

Contra `read committed`, el índice parcial `time_entry_running_unq` y la clave
primaria `time_entry_pkey`. Un `UPDATE` que espera el bloqueo de otra
transacción vuelve a evaluar su `WHERE` sobre la fila ya commiteada; un
`INSERT` que choca con una fila sin commitear espera el commit y recién ahí
falla con `23505`. La ronda 2 de revisión reprodujo los seis contra Postgres 17
con conexiones concurrentes, y dieron lo que dice la tabla.

| Escenario                                                                   | Recorrido                                                                                                                                                                                                                                                                                                                  | Desenlace                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Reintento con la respuesta perdida**, id X, el primer intento ya commiteó | Paso 1: `findOwn(X)` la encuentra. No hay transacción.                                                                                                                                                                                                                                                                     | La fila X tal como esté. Nada escrito, ningún timer cerrado.     |
| Lo mismo, con el primer intento **todavía en vuelo**                        | Paso 1 no ve X, que no está commiteada. Paso 2: el primero que bloquea el timer previo lo cierra e inserta X; el otro espera ese bloqueo, se destraba sin fila abierta y su insert de X choca con la clave primaria o con el índice. Paso 4: `findOwn(X)` la encuentra. Da igual cuál de los dos intentos sea el que gana. | Una sola fila X y un solo cierre. El perdedor se deshizo entero. |
| **Doble clic**, ids X e Y, en secuencia                                     | Y no encuentra fila propia, cierra X y abre Y.                                                                                                                                                                                                                                                                             | X queda cerrada con segundos. Es la enmienda acotada de arriba.  |
| Doble clic, ids X e Y, **simultáneos**                                      | Los dos leen el mismo timer previo. X lo cierra e inserta; el cierre de Y espera, se destraba sin fila abierta, y su insert choca con el índice. Pasos 4 y 6: `findOwn(Y)` no existe, el gancho da X. Sin timer previo, el insert de Y espera el de X y choca igual.                                                       | Un solo timer, X. Ninguna entrada de 0 s. Y nunca se escribió.   |
| **TT-37**: un «Iniciar» con id S y un «Continuar» con id C, simultáneos     | Igual que la fila anterior: uno gana, el otro choca con el índice, no tiene fila propia con su id y responde el ganador. Si el ganador ya lo detuvo entre el choque y la relectura, el gancho pide otra vuelta y el perdedor arranca solo.                                                                                 | Un solo timer. El perdedor responde el del ganador, sin error.   |
| **Id ajeno**, Z de otra persona o de otro workspace                         | Paso 1: `findOwn(Z)` filtra por workspace y usuario y no la ve. Paso 2: la transacción puede cerrar el timer propio, pero el insert de Z choca con la clave primaria, que es global, y todo se deshace. Pasos 4 y 5: no hay fila propia.                                                                                   | `ForbiddenError`, mensaje neutro en la action. Nada escrito.     |

Con el algoritmo anterior del contrato del slice 4 —volver al paso 1 ante
cualquier choque— los escenarios simultáneos terminaban con el perdedor
cerrando el timer del ganador y dejando una entrada de 0 s, y el del id ajeno,
en `unexpected`.

**Una operación que lee otra fila antes de crear no la bloquea si no la
escribe.** Continuar y duplicar leen la entrada original sin `FOR UPDATE`: con
el bloqueo, dos «Continuar» simultáneos de la misma entrada se serializan sobre
ella, el segundo encuentra abierto el timer que acaba de abrir el primero y lo
cierra con 0 s. Sin el bloqueo, los dos chocan con el índice y el segundo
responde el ganador, como en la cuarta fila.

## Consecuencias

- **Las altas que adoptan la regla ofrecen «Reintentar» sin duplicar.** El
  reintento de un pedido ya aplicado no escribe nada. Cuando el pedido no
  llegó, el reintento hace el alta por primera vez.
- **La afirmación de TT-109 sobre «arrancar» queda corregida por diseño, no por
  texto**: `parity-analyst` tiene que reescribir el párrafo que la sostiene. Es
  una tarea del slice 2b.
- **El reintento puede recrear una fila que ya no está.** Si entre la respuesta
  perdida y el reintento la persona descartó o borró la entrada que creó el
  primer intento, `findOwn` no la encuentra, la clave primaria está libre y el
  reintento la vuelve a crear. Y si la entrada sigue pero cambió —se detuvo, se
  editó—, el reintento la devuelve **en el estado en que esté**, sin tocarla: un
  reintento de «Iniciar» sobre un timer que ya se detuvo responde la entrada
  cerrada. Para achicar la ventana, la interfaz baja el aviso con «Reintentar»
  cuando el timer que muestra cambia de identidad (slice 2b): si llegó el
  timer, el pedido se aplicó y no hay nada que reintentar.
- **El pedido repetido con el id pendiente no aplica lo que cambió entre los
  dos clics.** Si la persona editó la descripción antes de apretar «Iniciar»
  otra vez, el servidor responde la fila del primer intento, con la descripción
  de entonces.
- **El cliente elige una clave primaria.** No gana nada con eso: el id tiene
  que ser un UUID v4, la fila nueva igual es suya y la escribe el servidor, y
  un id que ya usa otra fila —de otra persona o de otro workspace— responde
  `forbidden` sin decir de quién es. Adivinar un UUID ajeno para enterarse de
  que existe no es un ataque práctico. Si la fila ajena se borra justo entre
  el choque y la relectura, la respuesta sigue siendo `forbidden`.
- **El id ajeno sale como `ForbiddenError`, no como el error de dominio del
  módulo.** Así `createOnce` no depende de ningún módulo. En el service el
  error trae `code: "forbidden"` y un texto interno; el mensaje neutro lo pone
  la action, como con cualquier `assertCan` que falla.
- **Un id propio que ya existe se responde, no se rechaza.** Un pedido armado a
  mano con el id de una fila propia cualquiera recibe esa fila sin que se
  escriba nada. No expone nada que la persona no pueda leer.
- **El registro de auditoría usa ese id** como `entityId`, igual que hoy usa el
  generado por la base. Un pedido resuelto por `findOwn` no deja registro: no
  escribió nada.
- **El algoritmo se prueba sin base.** `createOnce` recibe sus dependencias como
  funciones, así que sus vueltas —incluidas las dos ramas raras del ADR 0003—
  tienen test de unidad con dobles escritos a mano, sin `vi.mock`. Lo que cada
  módulo le pasa, y el orden del permiso, se prueban en integración desde el
  service del módulo.
- **Los nombres de las restricciones siguen en cada repository.** `createOnce`
  recibe el de la clave primaria como dato y el gancho reconoce el suyo; el
  código `23505` y la forma del error del driver viven en un solo lugar.
- **El alta manual queda como está** hasta que el equipo decida. Adoptar esta
  regla en `createManualEntry` le devolvería «Reintentar» y retiraría la
  excepción de TT-109; es un cambio de paridad y no entra en los slices 2b ni 4.
- **Los consumidores futuros** —el arrastre que crea en el calendario, las
  celdas del timesheet, las altas de cualquier módulo nuevo— crean con la misma
  regla y la misma `createOnce` de `src/server/create-once.ts`, con su propio
  `can()` antes.
