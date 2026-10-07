# 0017. Una operación en masa valida sus referencias una vez, después de las filas

Fecha: 2026-10-07. Estado: propuesto.
Origen: contrato del slice 12
([`fase1-slice12-edicion-masiva.md`](../slices/fase1-slice12-edicion-masiva.md)),
decisión D12-2.

## Contexto

El slice 12 suma a la edición masiva (TT-63) el proyecto y la tarea, las
etiquetas —agregando a las de cada entrada o reemplazándolas— y el facturable.
Hasta acá la masiva no consultaba nada fuera de sus filas: la descripción y el
trío se evalúan con funciones puras sobre la fila leída bajo bloqueo
(`editedFields`, `entryTimesFor`).

Los campos nuevos apuntan a entidades de `project`. Asignarlos pide consultar
sus reglas, que tienen un solo dueño (ADR 0010): `assertTrackable` decide si la
persona puede cargar horas en un proyecto y una tarea (TT-08, TT-77, PR-74), y
`assertTaggable` si puede usar unas etiquetas (TT-78, PR-73). Las dos leen con
la transacción de quien las llama y lanzan el error de `project`.

Lo que hay que decidir en la masiva:

- **Cuántas veces se consulta.** El pedido trae un solo proyecto y una sola
  lista de etiquetas, pero cada fila parte de un estado distinto.
- **Qué se valida.** La regla de una fila no valida lo que la fila ya tiene:
  `pairToCheck` deja pasar el mismo par, «Sin proyecto» y el mismo proyecto sin
  tarea (TT-104, PR-65, PR-71), y `tagsToCheck` deja pasar las etiquetas que la
  fila ya tiene, aunque estén archivadas (PR-47, PR-68). Lo que se valida
  depende de la fila.
- **Qué es la falla.** El ADR 0011 distingue el rechazo de una fila, que va en
  una lista y se resuelve quitándola de la selección, de la causa que vale para
  todo el pedido, que responde con su propio código. Nombra «el proyecto
  elegido que ya no está disponible en el slice 12» entre las segundas.
- **En qué orden**, si en el mismo pedido hay filas rechazadas y una referencia
  no disponible. El contrato del 6 (§4.8) anticipaba «antes de evaluar filas».

Las restricciones que la decisión no puede romper:

- **La fila repetida** (ADR 0011, ADR 0013): cada fila pasa por la regla de su
  edición individual, la misma función y no una copia. `updateEntry` ya decide
  el par, el facturable y las etiquetas de una entrada.
- **El punto fijo del reintento** (TT-89): un segundo intento de un pedido
  aplicado no escribe y responde lo mismo.
- **Una transacción corta**: el tope es de 200 filas.
- **`evaluateAll` es síncrona** y trata como rechazo solo un `TimeEntryError`.

## Opciones

1. **Validar lo pedido una vez, antes de leer las filas**, siempre que el
   pedido traiga proyecto o etiquetas.
2. **Validar en cada fila, y la falla es un rechazo de esa fila**, en la lista
   del ADR 0011.
3. **Cada fila decide, sin consultar, qué asigna de nuevo; se valida la unión
   una sola vez, después de evaluar las filas, y solo si alguna asigna algo
   nuevo.** La falla es del pedido entero.

## Decisión

La opción 3.

- **La regla del par, el facturable y las etiquetas se parte en tres fases**,
  que usan la operación de una fila (`updateEntry`) y la masiva:
  1. **Un plan por fila, puro**: qué cambia (el par si difiere, el conjunto de
     etiquetas si difiere) y qué hay que validar para eso (`pairToCheck`,
     `tagsToCheck`). Una regla que depende de la fila y no consulta nada —el
     tope de 50 etiquetas de una entrada— lanza acá, y en la masiva es un
     rechazo de la fila.
  2. **Las validaciones de `project`, una vez por pedido**: el par que piden
     los planes, que es el mismo para todos, y la unión de las etiquetas que
     cada plan asigna de nuevo. Sin nada que validar, no se consulta.
  3. **Los campos a escribir, puros**: el par, el facturable con `billableFor`
     (D-2) sobre el proyecto validado, y las etiquetas.
- **Las filas van antes que las referencias.** Si alguna fila se rechaza, la
  respuesta es la lista de rechazos y las referencias no se consultan. Si
  ninguna se rechaza y una referencia no está disponible, la respuesta es el
  error de `project`, `not_found` con su texto, sin lista.
- **`updateEntry` usa las mismas tres funciones** con un solo plan. Su orden de
  consultas y de rechazos no cambia.

## Por qué

- **Contra la 1, lo que la fila ya tiene.** Validar siempre lo pedido rechaza
  un pedido que no cambia nada —filas que ya tienen el proyecto archivado— y se
  separa de `updateEntry`, que lo acepta. Rompe además el punto fijo: si el
  proyecto se archiva entre el primer intento y «Reintentar», el segundo falla
  aunque el primero se haya aplicado entero.
- **Contra la 2, el costo y el remedio.** Por fila son hasta tres consultas,
  600 con el tope. Y el aviso repetiría la misma causa en cada fila con un
  remedio —«Quitar esas entradas de la selección»— que no la resuelve: lo que
  hay que hacer es elegir otro proyecto. Es la distinción del ADR 0011 entre un
  rechazo de fila y una causa del pedido.
- **Por qué después de las filas.** Lo que se valida depende de las filas que
  se van a escribir; validar antes obliga a decidir sobre filas que después se
  rechazan. `evaluateAll` sigue síncrona y sin consultas, como la pide el ADR
  0011 («la evaluación no escribe ni consulta»). El costo es que un pedido con
  los dos problemas los muestra de a uno; se aceptan dos idas y vueltas en un
  caso que solo llega con otra pestaña que archivó algo.
- **Por qué partir `updateEntry`.** Es la forma de que haya una sola regla. Si
  la masiva tuviera su propia composición de `pairToCheck`, `billableFor` y
  `tagsToCheck`, las dos se separarían en el primer cambio; el ADR 0013 ya
  resolvió lo mismo para el trío con `editedFields`.

## Consecuencias

- **El reintento llega a un punto fijo también con referencias**: el segundo
  intento no asigna nada nuevo, así que no valida y termina bien aunque lo
  pedido se haya archivado en el medio.
- **Las consultas a `project` en una masiva son a lo sumo tres** —proyecto,
  tarea, etiquetas—, cualquiera sea la cantidad de filas. No tiene test de
  comportamiento: validar por fila da el mismo resultado con más consultas. Lo
  cuida la revisión de backend.
- **Un test de equivalencia por caso** compara la masiva con `updateEntry`
  sobre copias sembradas iguales, como el del trío del slice 6.
- **El contrato del 6 queda corregido en un punto**: su §4.8 decía que la
  referencia no disponible se responde «antes de evaluar filas»; con esta
  decisión se responde después, si ninguna fila se rechazó. El contrato del 6
  es histórico y no se reescribe; manda el del 12.
- **Las próximas operaciones en masa** que asignen referencias de otro módulo
  —las de la fase 2 sobre entradas o proyectos— siguen el mismo patrón: plan
  puro por fila, validación única de la unión, campos puros.
- **No cambia `project`**: `assertTrackable` y `assertTaggable` se llaman igual
  que hoy, con la transacción de quien llama.
