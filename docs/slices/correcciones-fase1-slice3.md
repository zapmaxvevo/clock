# Correcciones al contrato del slice 3 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice3-horas-y-fecha.md`: cinco
bloqueantes y diez mayores. Varios salieron de ejecutar el código, no de leerlo.
Abajo va cada uno con la resolución decidida; `architect` las aplica sin
volver a discutirlas.

## Bloqueantes

### B-1. `canEditTimes(extraDays) = extraDays <= 1` no evita el truncado

`extraDays` es la diferencia de días locales, no la duración: una entrada de 25
horas tiene `extraDays === 1`, la regla la declara editable, el editor muestra
`05:00–06:00` y confirmar —aunque sea sin tocar nada— trunca 25 horas a 1.

**Resolución.** La regla se calcula en el **servidor**, que tiene los dos
instantes y puede afirmar el round-trip exacto. `TimeEntryView` suma
`editableTimes: boolean` y la fila lo obedece. Con eso la regla de negocio sale
de `components/`, como manda la convención, y el criterio 17 pasa a tener test
de integración de verdad: `seedTimeEntry` ya puede sembrar una entrada de más
de 24 horas. El §5 deja de poder decir que `getTrackerState` no cambia; es un
campo derivado y no una consulta nueva.

### B-2. El texto de `futureTime` no es el de TT-75

El contrato declara «La hora de inicio no puede ser posterior a ahora.» y
afirma que es el de la especificación. El documento de paridad dice, en tres
lugares, «No se pueden cargar horas que todavía no pasaron.».

**Resolución.** Ese es el texto. Sacar la frase que dice que se copió de la
tabla, que es justamente lo que no se hizo.

### B-3. Faltan dos archivos en el reparto

Los dos editores llevan un `date-field`, que exige `todayKey` y `minDayKey`.
Hoy esos valores se calculan en `tracker-screen.tsx` y llegan solo a
`ManualBar`. Ni `DayGroup` ni `TimerBar` tienen con qué dibujar el selector.

**Resolución.** `tracker-screen.tsx` y `tracker-bar.tsx` entran en la lista de
`frontend-dev`, con la nota de qué cambia en cada uno y qué hay que volver a
probar.

### B-4. El recorrido e2e del aviso fuera de ventana no es alcanzable

Dos causas: el workspace de los e2e lo crea la primera sesión, así que su
`createdAt` es el día de la corrida y el piso impide cargar nada anterior; y si
la entrada movida queda siendo la más nueva, la ventana se estira hasta ella y
`outsideWindow` da falso.

**Resolución.** El proyecto `setup` de Playwright se conecta a la base y
**atrasa el `createdAt` del workspace**. Es código de prueba y no agrega
superficie a producción. La precondición de siembra —una entrada cerrada de hoy
que quede como la más nueva— se escribe en el criterio y en el recorrido. Vale
igual para el recorrido equivalente del slice 2, que todavía no se escribió.

### B-5. No está escrito cuándo se confirma el trío

Con «guardar al perder el foco» por campo y el payload completo, tabular del
inicio al fin escribe estados intermedios: una edición se pierde con un
`tooShort` que no explica nada, y otra guarda una entrada de 23 horas que recién
la segunda escritura arregla.

**Resolución.** El trío se confirma al salir del **editor** —el foco sale del
grupo de los tres controles— o con Enter; `Esc` descarta los tres. Hay que
decir qué cambia en `clock-field.tsx`, que hoy no tiene ni `Esc` ni noción de
grupo, y nombrarlo en la tabla de consecuencias. El criterio 1 afirma que
editar inicio y fin seguidos produce **una** escritura.

## Mayores

### M-1. El ancla del desfase: la cobertura no cubre nada y el riesgo está mal descrito

El criterio propuesto pasa contra el código actual sin tocar nada, porque el
cálculo es lineal en `startedAt` por construcción. Y el desfase de reloj no
vuelve a entrar al reiniciar el ancla: `sinceMountMs` es una diferencia y el
desfase se cancela. Lo que sí se pierde —el transcurrido desde el montaje— solo
es alcanzable con una edición optimista, que el propio contrato descarta.

**Resolución.** Mover la decisión a donde se pueda probar: `elapsed.ts` exporta
la función pura que hoy vive escondida en el hook, el hook se limita a
invocarla, y el criterio afirma lo que importa —con el mismo `serverNow` y un
`startedAt` nuevo, lo medido desde el montaje se conserva—. Corregir la frase
sobre el desfase, que describe un mecanismo que no es el real, y nombrar que
`day-group.tsx` usa el mismo hook para el total del día.

### M-2. Faltan las firmas de los dos services

**Resolución.** Escribirlas, con `now: Date = new Date()` y el mismo tipo
mínimo de workspace que usa `createManualEntry`. Sin eso el handshake no tiene
qué comprometer.

### M-3. Reguardar sin cambiar nada mueve una entrada de la hora ambigua

El ADR 0005 resolvió la ambigüedad con el segundo instante y lo justificó para
la creación, donde nadie puede distinguirlos. En la edición una entrada que ya
existe en la primera ocurrencia se mueve una hora al confirmar, con los mismos
rótulos en pantalla; si los dos extremos están en la hora ambigua, la duración
se va a cero y aparece `tooShort` sobre una entrada que duraba una hora.

**Resolución original.** No alcanza con documentarlo: el service **no reescribe
un extremo cuyo rótulo no cambió**. Compara el rótulo pedido contra el que
produce el instante guardado y, si coinciden, conserva el instante. Es
determinista, cuesta una comparación y elimina la clase entera en vez de un
caso. Queda escrito en el §8 como consecuencia del ADR 0005 que la edición
vuelve alcanzable, con los instantes de Madrid en el criterio.

**Por qué cambió.** Al aplicarla, `architect` encontró que conservar un extremo
y recalcular el otro rompe el orden en la hora ambigua. Madrid, 2026-10-25,
entrada 01:50–02:50 con el fin en la primera ocurrencia (`00:50Z`): cambiar el
inicio a 02:10 lo recalcula a la segunda (`01:10Z`) y conserva el fin en
`00:50Z`, antes del inicio. El `check` lo rechaza y sale por `unexpected`, que
es lo mismo que M-4 corrige; contradice además el criterio 19 y el requisito del
ADR 0005 de conservar el orden de los extremos. Y no cubría su propio caso: con
`tooShort` evaluado sobre las horas de pared, el par 02:30–02:30 seguía
rechazado antes de llegar a conservar nada.

**Lo que se aplicó**, decidido por el equipo sobre la propuesta de `architect`:

1. Se conserva el instante guardado de cada extremo cuyo rótulo pedido —día
   local y hora de pared— coincide con el del instante guardado.
2. Si el par resultante no dura al menos un minuto, se descarta lo conservado y
   se recalculan los dos desde las horas de pared, con la regla del ADR 0005,
   que es monótona.
3. `tooShort` se evalúa sobre los instantes resultantes.

El paso 2 descarta con el umbral de un minuto y no solo con un par que no sea
estrictamente creciente. Con el umbral en «estrictamente creciente», una entrada
del timer `10:00:40–10:30:15` a la que se le corrige el fin a `10:01` conservaría
el inicio, quedaría en 20 segundos y `tooShort` la rechazaría con dos rótulos que
se ven separados por un minuto: un cambio de veredicto alcanzable respecto del
slice 2. Con el umbral de un minuto, todo par que no lo cumple se recalcula, y un
par recalculado tiene los instantes en minutos exactos y es monótono, así que
`tooShort` sobre el resultado equivale a «los dos rótulos son iguales», que es
la regla del slice 2. El único veredicto que cambia es el de la hora ambigua:
`02:30` en la primera ocurrencia y `02:30` en la segunda duran 60 minutos reales
y ahora se aceptan, que es el caso que motivó el hallazgo.

Aplicado en el contrato en §4.1 (pasos 3 a 6), §4.4 (la idempotencia pasa a
ser un punto fijo), §5, los criterios 6, 19 y 24, y §8.

### M-4. Carrera sin desenlace: `updateRunningStart` contra la parada o el arranque

Hasta ahora el `started_at` de una entrada abierta siempre salía de `now()`, así
que cualquier cierre posterior escribía un `ended_at` mayor. Este slice rompe la
invariante. Una parada que ya empezó y se bloquea en el `FOR UPDATE` escribe
después un `ended_at` anterior al inicio recién adelantado, y el `check` la
rechaza: `stopTimer` lo traduce a `validation`, y `startTimer` **no lo traduce**
y sale por `unexpected` con «revisá la conexión» y un botón de reintento, sobre
un error que no es de red.

**Resolución.** Las dos cosas: `stopById` escribe `greatest(now(), started_at)`
—el `check` ya es `>=` y TT-101 admite duración cero— y `startTimer` traduce
`isEndBeforeStart` igual que `stopTimer`. Más la fila en la tabla de carreras.

### M-5. «El aviso nombra el campo» es incompatible con el payload del trío

**Resolución.** El título nombra la operación, como pide TT-90: «No se pudo
guardar el horario de la entrada.» y «No se pudo guardar el inicio del timer.»
Declararlos en `trackerLabels` y reformular los criterios en esos términos.

### M-6. `runningEntryTimes` contra «una redacción por causa»

**Resolución.** La causa **es otra** —«esta entrada es la que está corriendo»,
no «hay un timer corriendo»— así que el texto nuevo se queda, pero hay que
hacer el trámite: pedirle a `parity-analyst` la fila en la tabla y el
identificador, como el slice 2 hizo con lo que terminó siendo TT-108. Y
reescribir la justificación, que hoy dice que la causa es la misma y con eso
implica la conclusión contraria.

### M-7. La entrada de más de un día no está marcada como divergencia

**Resolución.** Marcarla como divergencia explícita contra Clockify y pedir
identificador a `parity-analyst`, con el mismo trámite que el slice 2.

### M-8. Falta el criterio del timer que cambia de día

Mover el día del timer activo lo saca de un grupo y lo mete en otro, y
recalcula los dos totales. Ningún criterio lo cubre.

**Resolución.** Agregar el criterio. El día en `updateRunningStart` queda: sin
él no se puede cumplir el caso que el propio TT-28 describe.

### M-9. El criterio 3 no tiene dueño

**Resolución.** Escribir en `entry-times-editor.tsx` la responsabilidad de
derivar la duración visible del borrador mientras el editor está abierto. Hoy
la fila muestra la del servidor, así que sin eso el criterio es falso.

### M-10. El renombre arrastra más de lo que el contrato nombra

**Resolución.** Nombrar los tipos que se renombran (`ManualDraft`,
`ManualField`, `ManualDraftChange`), partir `ManualField` —incluye `"duration"`,
que la fila no tiene—, asignarle a alguien el constructor del borrador desde la
vista, y actualizar los dos documentos que van a quedar apuntando a un archivo
inexistente.

Y escribir la **precondición de arranque**: el slice 3 empieza con el slice 2
mergeado. Hoy `main` es solo el slice 1 y catorce archivos de la lista de
`frontend-dev` no existen ahí.

### Sobre el payload completo y la concurrencia

El argumento se sostiene, pero el §8 tiene que decir tres cosas más: que el
«gana el último» es más grueso que el de la descripción —una pestaña que solo
corrigió el inicio revierte también la fecha y el fin que otra cambió—; la
carrera de M-4; y que las dos guardas del repository son inalcanzables a través
del service, así que su test tiene que llamar al repository directo.

## Menores

| ID  | Resolución                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-1 | La premisa es falsa: `updateTimes` **sí** escribe `ended_at`. La conclusión se sostiene igual, así que reescribir la frase como «ninguna de las dos cambia la condición `ended_at is null` de la fila», que es lo que hace que el índice parcial no se entere. |
| m-2 | Citar TT-108 en el criterio 12: `parity-analyst` ya le asignó ese identificador cuando el slice 2 lo pidió, y TT-56 remite ahí. Citar también P-15, que es la decisión de retirar el aviso cuando llegue TT-52.                                                |
| m-3 | Recortar el criterio 2: un test del borrador no puede afirmar que no hubo petición, porque ahí no hay servidor. Lo que afirma es que el borrador queda igual, y el control ya garantiza lo otro por construcción.                                              |
| m-4 | El tope del selector de día y el `Esc` con la fila atenuada son observables de pantalla y hoy solo tienen test de integración. O los cubre el e2e, y entonces el recorrido tiene que nombrarlos, o van al §8.                                                  |
| m-5 | `clock-field.tsx` entra en la tabla de consecuencias del §1: gana `Esc` y la noción de grupo, y eso arrastra TT-19, TT-20 y TT-21 del slice 2, que es justo lo que esa tabla sirve para registrar.                                                             |
| m-6 | Declarar en `labels.ts` los títulos nuevos, con el mismo detalle con el que el contrato declara los dos `timeEntryMessages`. Son observables de dos criterios.                                                                                                 |
| m-7 | Decir que la relectura de `findLatestClosed` va **después** del update, igual que en el slice 2 va después del insert: la fila movida puede dejar de ser la más nueva o pasar a serlo, y el orden es la mitad de la regla.                                     |
| m-8 | Desambiguar el criterio 7: `beforeWorkspace` y `nonexistentClock` aplican a `updateEntryTimes`, y `beforeWorkspace` también a `updateRunningStart`. Hoy habla en singular.                                                                                     |

## Dos números que conviene escribir en vez de describir

El reviewer los verificó ejecutando y el contrato hoy los cuenta en prosa:

- **TT-97, criterio 18.** Madrid 2026-10-25, `01:00→04:00`: 180 minutos de pared
  y 240 reales. Madrid 2026-03-29, `01:00→04:00`: 180 de pared y 120 reales.
- **TT-81, criterio 19.** Verificado por fuerza bruta: en Madrid
  `instantFromLocal` es estrictamente creciente sobre los 1440 minutos de los
  seis días alrededor de los dos cambios de horario, y la medianoche del día
  siguiente siempre cae después de las 23:59 del anterior. El trío no puede
  producir un fin anterior al inicio.

## Orden sugerido

Para desbloquear: B-2 (una línea), B-3 (dos archivos), B-1 (la regla y dónde
vive), B-5 (cuándo se confirma el trío), B-4 (el recorrido e2e). De los
mayores, M-2 y M-6 son redacción; M-1, M-4 y M-8 ya tienen su decisión tomada
arriba.

# Ronda 2

Salida de `architecture-reviewer` sobre el contrato con la ronda 1 aplicada:
sin bloqueantes, cinco mayores y nueve menores. La regla de M-3 se verificó
ejecutándola —monotonía, punto fijo, rótulos y `editableTimes` sobre 180 000
casos en tres zonas— y se sostiene. Abajo, la resolución decidida de cada uno.

## Mayores

### R2-M1. `outsideWindow` relee la consulta equivocada

El paso 10 de §4.1 y la lista del repository usan `findLatestClosed`, que
incluye entradas futuras. Es el falso positivo que el slice 2 ya corrigió.

**Resolución.** `findLatestClosedBefore(…, now, tx)` y `findRunning(…, tx)`, igual
que `getTrackerState` y `createManualEntry`. El criterio 12 suma el caso con una
entrada futura presente y `outsideWindow` esperado en falso.

### R2-M2. El aviso de TT-108 se pierde si la fila movida era la única de su día

El grupo de origen desaparece en la revalidación y se lleva el aviso.

**Resolución.** El aviso de `outsideWindow` sube a un contenedor cliente de la
lista que no depende de ningún día (`entry-list.tsx`, nuevo, envuelve los
`DayGroup` en `tracker-screen.tsx`); el aviso de falla sigue en el grupo. Entra
al reparto de `frontend-dev`. El recorrido 5 mueve la **única** entrada de un
día que no es hoy.

### R2-M3. `updateRunningStart` no conserva el instante

Reguardar el inicio del timer sin cambios dentro de la hora repetida da
`futureTime` sobre una hora pasada, o mueve el inicio una hora.

**Resolución.** La misma conservación que §4.1: si `(date, start)` coincide con
el rótulo del inicio guardado, se conserva el instante. `running-start-editor`
no escribe si el par no cambió. §8 anota que una hora **cambiada** dentro de la
hora repetida, mientras transcurre su primera ocurrencia, cae en `futureTime`.
El criterio 24 suma el caso del timer en la primera ocurrencia.

### R2-M4. El contador con `aria-hidden` rompe e2e intocables y la accesibilidad

**Resolución.** El `<span role="timer" aria-label="Tiempo transcurrido">` queda
como hermano visible del disparador, sin `aria-hidden`. «Editar la hora de
inicio» es un botón aparte, que puede envolverlo visualmente pero no lo contiene
en el árbol accesible. `e2e/tracker-page.ts` y `e2e/tracker.spec.ts` no se tocan.

### R2-M5. La conservación es una regla de varios slices sin ADR

**Resolución.** ADR 0006 corto: los tres pasos (conservar el extremo cuyo rótulo
no cambió; descartar lo conservado si el par queda a menos de un minuto y
recalcular los dos; `tooShort` sobre instantes), el porqué, la alternativa
descartada (la resolución original de M-3, con el contraejemplo de Madrid), la
asimetría con el alta manual en la hora repetida, y los consumidores futuros
(edición masiva, arrastre del calendario, celdas del timesheet). El contrato
reemplaza «No hay ADR nuevo» por la referencia, y el ADR 0005 suma una línea que
remite al 0006.

## Menores

| ID    | Resolución                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-m1 | «Menos de 24 horas de reloj, al minuto», en el contrato y en `docs/parity/time-tracker.md` (TT-110). Una entrada de 30 s es editable.                                                                    |
| R2-m2 | `parseDayKey(endDay) === null` → `invalidDate` antes del paso 4, como en `createManualEntry`. Sumar además el rechazo de instantes posteriores al año 9999 UTC, que el slice 2 agrega por la auditoría.  |
| R2-m3 | El reparto nombra el borrado de `manual-draft.ts` y su test, y marca como nuevos `entry-times-editor.tsx`, `running-start-editor.tsx`, `entry-list.tsx` y `e2e/entry-times.spec.ts`.                     |
| R2-m4 | Decir qué control de fecha tiene la fila cerrada, dónde se dibuja y su nombre accesible, y cómo se ve en solo lectura (TT-110).                                                                          |
| R2-m5 | `onSubmit` de `clock-field` corre también con Enter sin cambios en el campo.                                                                                                                             |
| R2-m6 | El editor de la fila no valida la duración cero en el cliente: el veredicto es del servidor. Nombrar junto a TT-97 que mientras el editor está abierto ese caso muestra `0:00` contra 60 minutos reales. |
| R2-m7 | Si el intervalo se reinicia con el mismo ancla, mide desde el montaje original: una parada fallida no hace retroceder el contador.                                                                       |
| R2-m8 | TT-108 en paridad: el aviso lo muestra la barra al crear y la lista al mover una fila (TT-56).                                                                                                           |
| R2-m9 | La entrada de hoy no tiene helper compartido: `tests-slice3` la arma en su propio spec.                                                                                                                  |

## Arrastre de la revisión de código del slice 2

`todayKey` y `minDayKey` dejan de calcularse en `tracker-screen.tsx`: pasan a
`TrackerState`, calculados por el service con una sola función del piso del
workspace. B-3 de la ronda 1 se simplifica: `DayGroup` y `TimerBar` los reciben
del estado, no de un cálculo del componente.
