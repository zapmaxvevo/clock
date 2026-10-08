# 0018. Lo que escribe una celda de la planilla se calcula en instantes

Fecha: 2026-10-07. Estado: aceptado (2026-10-08, por el usuario).
Origen: TS-32 de [`timesheet.md`](../parity/timesheet.md), aceptado por el
equipo el 2026-10-07 (timesheet P-02) con el pedido de registrarlo en un ADR
antes del contrato del slice 13
([`fase1-slice13-planilla.md`](../slices/fase1-slice13-planilla.md)). Lo aprueba
el usuario.

Excepción acotada al [ADR 0005](0005-hora-de-pared-en-la-entrada-manual.md) en
dos puntos, y aplicación del [ADR 0006](0006-conservar-el-extremo-sin-cambios.md)
a un caso que este no previó. Ver «Qué excepción abre al ADR 0005» y «Relación
con el ADR 0006».

## Contexto

La planilla de horarios es una grilla de una semana con una fila por proyecto y
tarea y una columna por día. En cada celda la persona escribe **una duración**,
y el servidor deja la celda en ese valor (sección 5 de `timesheet.md`):

- una celda vacía crea una entrada que empieza a las **09:00 hora de pared** del
  día, en la zona de la persona (TS-29, TS-31);
- una celda con una entrada edita esa entrada: conserva su inicio y mueve su
  fin (TS-33);
- una celda con varias agrega una entrada al subir, que empieza donde termina la
  última, y achica la que empieza más tarde al bajar (TS-34).

El ADR 0005 fija que los instantes de una entrada nacen por dos caminos: el
`now()` de la base, o una hora de pared que la persona tecleó y que el service
convierte con `instantFromLocal`. Lo dice como consecuencia: «No hay un tercer
camino». Y `createManualEntry` lo deja escrito en un comentario: «El fin es la
hora tecleada y no el inicio más la duración: con un cambio de horario en el
medio las dos cosas no coinciden» (`src/modules/time-entry/service.ts:877-878`).
El mismo ADR rechaza la hora que no existe por un cambio de horario, con «Esa
hora no existe por el cambio de horario.».

El ADR 0006 fija cómo se edita una entrada que ya existe: el **rótulo** de un
extremo —día local y hora de pared— que no cambió conserva su instante, con sus
segundos y su ocurrencia; el que cambió se convierte con `instantFromLocal`.

En una celda la persona no teclea ninguna hora de pared. Teclea cuánto quiere
que sume la celda, y lo único que puede comprobar en esa pantalla es que la
celda muestre lo que escribió. Armar el fin como un rótulo —el rótulo del inicio
más la duración, convertido— falla en dos casos:

- **Segundos heredados del timer.** Una entrada del timer de `10:00:40` a
  `11:31:22` se ve `1:30`. Si la persona escribe `2:00` y el fin se arma como
  rótulo —`10:00` más 120 minutos, `12:00`—, el ADR 0006 conserva el inicio con
  sus segundos y el fin queda en `12:00:00`: la entrada dura `1:59:20` y la
  celda pasa a mostrar `1:59` después de que se escribió `2:00`.
- **Cambio de horario.** Una entrada que cruza la hora del cambio dura una hora
  más o una menos que la resta de sus rótulos (TT-97). Con el fin como rótulo,
  la celda mostraría `7:00` o `9:00` después de escribir `8:00`.

**Respaldo verificado.** En el workspace del equipo, el 2026-10-07, al pasar una
celda de `1:00` a `2:00` Clockify movió solo el fin de la entrada y dejó la
descripción (respuesta B de timesheet P-12).

Hay un segundo choque con el ADR 0005, más chico: las 09:00 de una celda vacía
no las tecleó nadie. Si ese día no existen por un cambio de horario, rechazar
con «Esa hora no existe por el cambio de horario.» le habla a la persona de una
hora que no escribió, y le deja la celda sin forma de cargarla. TS-31 ya decide
otra cosa: el primer minuto que exista después.

Las restricciones que la decisión no puede romper:

- TT-81 y el `check time_entry_end_after_start`: el fin nunca queda antes del
  inicio.
- TT-73: una entrada que dura menos de un minuto no se guarda desde la
  interfaz.
- TS-37 y TT-89: repetir el mismo pedido deja el mismo estado.
- El ADR 0006: un módulo nuevo que edite horas pasa por las mutaciones de
  `time-entry`, y nadie copia ni saltea sus reglas.
- El piso de fechas del ADR 0005, el 2000-01-01, y el tope del año 9999.

## Opciones

Para el fin:

1. **El fin como rótulo, con el ADR 0005 tal cual.** El rótulo del inicio más la
   duración, convertido con `instantFromLocal`. Falla en los dos casos de
   arriba, y además puede caer en una hora que no existe y rechazar una
   escritura que la persona no puede corregir desde la celda.
2. **El fin como rótulo, pasando por el ADR 0006.** La celda arma un trío
   `{ date, start, end }` y llama a la regla de `updateEntryTimes`. Conserva el
   inicio, que es lo bueno, pero el fin sigue siendo un rótulo convertido: da
   `1:59` en el primer caso y `7:00` o `9:00` en el segundo, igual que la 1.
   Rechaza además una entrada de más de un día (TT-110) que TS-33 sí edita.
3. **El fin es el inicio más la duración, en instantes.** La suma se hace sobre
   el instante, sin pasar por rótulos. Es la elegida.

Para las 09:00 que no existen:

- **a. Rechazar**, como el ADR 0005.
- **b. El primer minuto de ese día que exista después.** Es la elegida, y es lo
  que TS-31 ya fija.

## Decisión

La opción 3 para el fin y la b para las 09:00, **solo para lo que escribe una
celda de la planilla**: la mutación `setTimesheetCell` del módulo `time-entry`
(contrato del slice 13, §4.4). Ninguna otra escritura cambia.

Con `V` el valor pedido en minutos y `S` lo que la celda muestra —la suma exacta
en segundos de sus entradas cerradas, dividida por 60 y truncada una sola vez,
como la dibuja la grilla (TS-24, TS-47)—:

| Caso (TS)                  | Inicio                                                                         | Fin                               |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| Celda vacía (TS-29, TS-31) | 09:00 hora de pared del día, con `instantFromLocalOrLater`                     | inicio + `V` minutos              |
| Una entrada (TS-33)        | el guardado, sin escribir: conserva segundos y ocurrencia                      | inicio + `V` minutos              |
| Varias, subir (TS-34)      | la entrada nueva empieza en el **instante** de fin de la que termina más tarde | ese inicio + `V − S` minutos      |
| Varias, bajar (TS-34)      | el de la que empieza más tarde, sin escribir                                   | su fin guardado − `S − V` minutos |

- **Las sumas y las restas son sobre el instante**, en milisegundos. Ningún fin
  de esta tabla pasa por un rótulo ni por `instantFromLocal`.
- **`S` es lo que la celda muestra, en minutos.** Así, después de cualquier
  escritura la celda muestra exactamente `V`: la suma de la celda pasa a ser
  `60·V` segundos en los dos primeros casos, y en los dos últimos cambia en
  `60·(V − S)` segundos, que truncada da `V`. Si `S` ya es `V`, no se escribe
  nada (TS-36, TS-37).
- **El único instante que sale de una hora de pared** es el inicio de una celda
  vacía. Lo da una función nueva de `src/server/time`:

  ```ts
  /**
   * La hora de pared de ese día como instante o, si no existió por un
   * adelanto de hora, el primer minuto posterior de ese mismo día que sí
   * existió. La hora que ocurre dos veces se resuelve como en
   * `instantFromLocal`: el segundo instante. `null` si desde esa hora no
   * existió ningún minuto ese día. Solo para horas que nadie tecleó (ADR 0018):
   * una hora tecleada sigue el rechazo del ADR 0005.
   */
  export function instantFromLocalOrLater(
    dayKey: string,
    clock: string,
    timeZone: string,
  ): Date | null;
  ```

  Con `null` —el día falta entero en la zona, o el hueco llega hasta la
  medianoche— el service rechaza con «Esa hora no existe por el cambio de
  horario.», el texto de la causa de siempre.

- **El orden de los extremos se sostiene por construcción**: `V` es de un
  minuto o más, `V − S` también al subir, y la baja que dejaría la entrada que
  empieza más tarde con menos de un minuto se rechaza sin escribir (TS-34, con
  la precisión de D13-4 del contrato). `tooShort` no se evalúa sobre rótulos
  porque no hay rótulos.
- **El año 10000 se rechaza** como en `manualTimes`: un fin después del 9999 en
  UTC es «Fecha inválida.».
- **Dónde vive.** La regla es una función pura de
  `src/modules/time-entry/timesheet-cell.ts`, con su test de unidad, que solo
  usa `setTimesheetCell`. Ningún otro módulo la importa: la planilla llega a
  ella por la action de `time-entry`, como pide el ADR 0006 para todo módulo que
  edite horas.

### Qué excepción abre al ADR 0005

Exactamente dos, y las dos solo dentro de `setTimesheetCell`:

1. **Un tercer camino de instantes.** Además de `now()` y de la hora tecleada,
   un instante puede nacer **de otro instante más o menos una duración** —el
   fin de los cuatro casos de la tabla— o **copiado del fin de otra entrada**
   —el inicio de la entrada que agrega una celda con varias—. El ADR 0005 dice
   «No hay un tercer camino»; desde este ADR lo hay, con este alcance.
2. **La hora inexistente se desplaza en vez de rechazarse**, solo para las
   09:00 de una celda vacía, que nadie tecleó. El ADR 0005 había descartado
   desplazar porque rompía el orden de dos extremos convertidos; acá el fin no
   se convierte, sale del inicio más la duración, así que el motivo no aplica.

Lo que el ADR 0005 sigue fijando sin excepción:

- **Toda hora tecleada** —el alta manual, el trío de una fila, el inicio del
  timer, el diálogo y el arrastre del calendario, la edición masiva, y el
  detalle de una celda del slice 13b— se convierte con `instantFromLocal` y
  rechaza la hora que no existe. El comentario de `createManualEntry` sigue
  siendo cierto para su camino.
- **El piso del 2000-01-01**: una celda de un día anterior se rechaza con «No se
  pueden cargar horas anteriores al 1 de enero de 2000.» (TS-12, TS-81).
- **La zona sale de la sesión** y el cliente no manda instantes: el pedido de
  una celda es el día, el par y los minutos.

### Relación con el ADR 0006

- **TS-33 aplica el paso 1 del ADR 0006 por construcción.** El inicio de la
  entrada no viaja en el pedido, así que no se reescribe: conserva sus segundos
  y su ocurrencia. Es el mismo resultado que daría el paso 1 con el rótulo del
  inicio sin cambios.
- **El fin no pasa por los pasos del ADR 0006.** No hay un rótulo pedido para el
  fin: no hay nada que conservar ni que convertir (paso 1), nada que descartar
  (paso 2), y la duración mínima se cumple por construcción (paso 3).
- **No se usa `entryTimesFor`**, que exige que la entrada se pueda expresar con
  un trío: TS-33 edita también una entrada de más de un día (TT-110), porque en
  la celda no hay trío que la trunque en silencio.
- **El detalle de una celda (TS-41, TS-42, slice 13b) edita horas con el trío**
  y pasa por el ADR 0006 como la fila del rastreador. Solo el valor de la celda
  usa este ADR.
- **La regla «un módulo nuevo que edite horas pasa por las mutaciones de
  `time-entry`» se cumple**: `setTimesheetCell` es una mutación de `time-entry`
  y la planilla vive en ese módulo, como el calendario.

## Consecuencias

- **La celda muestra exactamente lo que se escribió**, también con segundos
  heredados del timer (TS-106) y en un día con cambio de horario (TS-107).
- **El reintento llega a un punto fijo.** Después de una escritura la celda
  muestra `V`, así que el segundo intento no escribe nada (TS-37). El contrato
  del slice 13 y el [ADR 0019](0019-escribir-una-celda-fija-su-valor.md) dicen
  cómo se serializan dos pedidos sobre la misma celda.
- **TT-97 se ve también en la planilla, al revés que en el alta manual.** En el
  alta manual se respetan las horas de pared y la duración es derivada; en la
  celda se respeta la duración y las horas de pared del fin son derivadas. Una
  entrada escrita desde una celda en un día con cambio de horario puede mostrar
  en el rastreador un horario cuya resta visual no coincide con la duración.
- **La misma entrada se edita distinto según el camino.** Pasar una entrada que
  cruza el cambio de horario de `1:00` a `2:00` desde la celda le suma dos horas
  reales; tipear en el trío de la fila un fin dos horas de pared después le suma
  una o tres. Es la consecuencia de que cada pantalla respete lo que la persona
  escribió en ella.
- **Una entrada escrita por una celda conserva su fin si después se edita por el
  trío** sin tocar el fin: el ADR 0006 compara el rótulo del instante guardado,
  sea cual sea el camino que lo escribió.
- **Los segundos de una entrada del timer se conservan** cuando la celda no
  cambia (TS-36, TS-105) y en el inicio cuando cambia (TS-106).
- **No cambia el esquema, ni `instantFromLocal`.** Se suma
  `instantFromLocalOrLater` a `src/server/time`, que sigue siendo puro e
  importable desde el navegador (ADR 0012), aunque solo lo use el servidor.
- **Los casos se prueban contra números.** El de los segundos del timer, una
  entrada de Madrid que cruza el atraso del 2026-10-25 y una celda vacía de
  Madrid del 2026-03-28 de 20 horas, que termina después del adelanto del 29,
  son tests de integración con su instante esperado escrito.
  `instantFromLocalOrLater` tiene los suyos en `time.test.ts`: Madrid
  2026-03-29 a las 02:30 da las 03:00 locales (`01:00Z`), una hora que existe
  da lo mismo que `instantFromLocal`, la hora repetida da el segundo instante y
  `Pacific/Apia` 2011-12-30 da `null`, con el proceso en otra zona.
- **El alcance queda cerrado.** Otra escritura que quiera sumar duraciones a
  instantes —las plantillas de la fase 2 (TS-62 … TS-66), por ejemplo— necesita
  su propio ADR o una enmienda de este.
