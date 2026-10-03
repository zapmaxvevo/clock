# 0006. Al editar, un extremo que no cambió conserva su instante

Fecha: 2026-10-03. Estado: aceptado.
Origen: hallazgo M-3 de la ronda 1 y R2-M3 y R2-M5 de la ronda 2 de
`architecture-reviewer` sobre el slice 3
(`../slices/correcciones-fase1-slice3.md`).

## Contexto

El [ADR 0005](0005-hora-de-pared-en-la-entrada-manual.md) fija cómo una hora de
pared se vuelve instante: `instantFromLocal(día, hora, zona)`, que rechaza la
hora que no existe y resuelve la que ocurre dos veces con el segundo instante.
Lo justificó para la creación, donde nadie puede distinguir las dos
ocurrencias y donde todo extremo nace de lo que se tecleó.

La edición de una entrada que ya existe es otra situación. Sus instantes no
siempre nacieron de una hora tecleada:

- El timer escribe `now()`, con segundos y en cualquiera de las dos
  ocurrencias de la hora repetida.
- La interfaz muestra los extremos al minuto y sin ocurrencia: `02:30` es
  igual en las dos pasadas.

Si cada edición recalcula los dos extremos desde lo que se ve, confirmar sin
tocar un extremo lo cambia igual: pierde sus segundos, o se mueve una hora si
estaba en la primera ocurrencia. Y una entrada de 02:30 en la primera pasada a
02:30 en la segunda, que dura 60 minutos, se rechaza por durar cero.

La regla tiene varios consumidores, presentes y futuros: la edición de horas
de una fila y del inicio del timer activo (slice 3), la edición masiva de hora
y fecha (slice 6), el arrastre y el estiramiento de un bloque del calendario
(slice 8) y las celdas del timesheet (slice 13). Por eso va en un ADR y no en
un contrato.

Restricciones que la decisión no puede romper:

- TT-81 y el `check time_entry_end_after_start`: el fin nunca queda antes del
  inicio. La conversión del ADR 0005 lo garantiza porque es monótona.
- TT-73: una entrada que dura menos de un minuto no se guarda desde la
  interfaz.
- El reintento de TT-89: repetir el mismo pedido tiene que dejar el mismo
  estado.

## Opciones

1. **Recalcular siempre los dos extremos**, el ADR 0005 tal cual. Simple y
   monótono, pero mueve lo que no se tocó: el problema descrito arriba.
2. **Conservar el extremo cuyo rótulo no cambió, sin más.** Era la resolución
   original de M-3. Mezclar un extremo conservado con otro recalculado rompe la
   monotonía en la hora repetida. Madrid, 2026-10-25: una entrada de 01:50 a
   02:50 con el fin en la primera ocurrencia (`00:50Z`), a la que se le cambia
   el inicio a 02:10, recalcula el inicio a la segunda ocurrencia (`01:10Z`) y
   conserva el fin antes que él. El `check` rechaza la fila y la persona ve un
   error de red. Además, con `tooShort` evaluado sobre las horas de pared, el
   caso de 02:30 a 02:30 sigue rechazado antes de conservar nada.
3. **Conservar, descartar lo conservado si el par queda corto, y validar la
   duración sobre instantes.** La elegida.

## Decisión

La opción 3. El **rótulo** de un extremo es el par día local y hora de pared
(`dayKey` y `formatClock` en la zona del workspace). La edición aplica tres
pasos:

1. **Conservar.** Si el rótulo pedido para un extremo coincide con el del
   instante guardado, se conserva el instante guardado tal cual, con sus
   segundos y su ocurrencia. Si no, se convierte con `instantFromLocal`.
2. **Descartar.** Si el par resultante dura menos de un minuto, se descarta lo
   conservado y se recalculan los dos extremos desde sus rótulos con la regla
   del ADR 0005.
3. **Validar sobre instantes.** `tooShort` (TT-73) se evalúa sobre el par que
   quedó, no sobre las horas de pared.

Una edición de un solo extremo, como el inicio del timer activo, aplica solo el
paso 1: no hay par que pueda quedar corto.

El umbral del paso 2 es un minuto, y no solo un par que no sea estrictamente
creciente, porque los instantes conservados llevan segundos. Una entrada del
timer de `10:00:40` a `10:30:15` a la que se le corrige el fin a `10:01`
conservaría el inicio y quedaría en 20 segundos, y `tooShort` la rechazaría
con dos rótulos separados por un minuto. Con el umbral en un minuto se
recalcula y queda de `10:00` a `10:01`, que es lo que habría dado el alta
manual.

**Dónde vive.** La regla son dos funciones **privadas de `service.ts` del
módulo `time-entry`**: una por extremo, que conserva o convierte a partir del
instante guardado, el día, la hora y la zona —el paso 1—, y la del par, que se
arma encima con los pasos 2 y 3. Las usan las mutaciones del módulo que editan
horas. Los otros módulos —el calendario, el timesheet— no las importan: llegan
a la regla llamando a esas mutaciones públicas, que es lo que garantiza que
nadie la copie ni la saltee.

## Consecuencias

- **TT-81 se sostiene.** El par que se escribe es o bien uno con extremos
  conservados que dura un minuto o más, o bien uno recalculado entero, que es
  monótono.
- **El reintento llega a un punto fijo.** Después de un intento exitoso cada
  extremo guardado tiene exactamente el rótulo pedido y el par dura un minuto
  o más: el segundo intento conserva los dos y escribe lo mismo.
- **El veredicto de `tooShort` es el del alta manual en todo par
  recalculado.** Un par recalculado tiene los instantes en minutos exactos y es
  monótono, así que dura cero exactamente cuando los dos rótulos son iguales.
  El único veredicto que cambia es el de la hora repetida.
- **Asimetría con el alta manual en la hora repetida.** Editar una entrada
  hasta que se vea como `02:30 – 02:30` se acepta si dura 60 minutos reales; el
  alta manual rechaza las mismas dos horas con `tooShort`, porque no tiene nada
  que conservar. El mismo par de rótulos no describe la misma entrada en los
  dos caminos.
- **Un extremo que sí cambió y cae en la hora repetida va siempre al segundo
  instante**, como en la creación. Desde la interfaz no hay forma de pedir el
  primero. Dos efectos visibles:
  - Si eso deja el par corto, el descarte recalcula también el extremo
    conservado, que puede moverse una hora sin que su rótulo cambie: en el
    ejemplo de la opción 2 el fin pasa de `00:50Z` a `01:50Z`.
  - Mientras transcurre la primera ocurrencia, cambiar el inicio del timer
    activo a una hora de esa franja cae en `futureTime`: el segundo instante
    todavía no llegó, aunque el primero ya pasó.
- **No es un tercer camino de instantes** de los que el ADR 0005 cierra: el
  extremo conservado no se escribe de nuevo, se deja como estaba.
- **Un módulo nuevo que edite horas pasa por las mutaciones de `time-entry`.**
  Si algún día necesita la regla sin la mutación, la función se mueve a un
  lugar compartido con su test; no se duplica.
- La regla se verificó ejecutándola sobre 180 000 casos en tres zonas:
  monotonía, punto fijo, rótulos exactos y coherencia con `editableTimes`.
