# 0021. El reporte agrega en la base, con los cortes que calcula `src/server/time`

Fecha: 2026-10-08. Estado: propuesto.
Origen: el [ADR 0020](0020-nucleo-de-reportes-antes-de-la-fase-2.md) y P-06 de
[`reportes.md`](../parity/reportes.md), que el usuario delegó el 2026-10-08: sin
el tope de 31 días, y si el rendimiento pide uno, lo fija `architect`. Lo
aprueba el usuario.

## Contexto

El reporte resumido suma las entradas cerradas de un rango, de una persona o de
todo el workspace, agrupadas hasta en tres niveles; uno puede ser la fecha. El
gráfico suma por día y, con rangos largos, por semana o por mes. Las reglas de
tiempo vienen de `reportes.md`:

- los días se cortan en la zona del perfil de quien mira, no en la de quien
  cargó (RP-22);
- una entrada cuenta entera en el día de su inicio y entra en el rango si su
  inicio cae dentro, igual que en la planilla (RP-23, TT-95, TT-96);
- la semana arranca en el primer día de quien mira (RP-24);
- el timer en curso no cuenta (P-07).

Lo que hay hoy:

- **Las lecturas existentes agregan en JS.** La planilla trae las entradas
  cerradas de una persona en una semana y suma con `closedSecondsOf` y
  `timesheetRows`; el calendario y el rastreador, igual. El día de cada entrada
  sale de `dayKey`, y `src/server/time` se declara el «único lugar donde se
  resuelven días, semanas y duraciones». Los casos difíciles ya están resueltos
  ahí: la medianoche que no existe y el día que falta entero (`startOfDayKey`).
- **El volumen cambia de escala.** Una semana de una persona son decenas de
  filas. Un año de un equipo de 30 personas con 8 entradas por día hábil son
  unas 60 000, y sin el tope de 31 días «Este año» es un pedido normal. Cada
  cambio de filtro o de agrupación es una recarga (RP-32), y la exportación
  repite la lectura.
- **El único índice útil empieza por la persona**:
  `time_entry_workspace_user_started_idx (workspace_id, user_id, started_at desc)`.
  Hay un solo workspace, así que una consulta de todas las personas en un rango
  no tiene un prefijo selectivo.
- **Vercel Hobby y Neon**: funciones sin estado y con duración acotada, y cada
  fila que viaja desde Neon cuesta red y memoria.

## Opciones

1. **Como la planilla**: leer las entradas cerradas del rango con sus
   referencias y agregar en JS.
2. **Agregar en SQL cortando el día con `at time zone`**:
   `(started_at at time zone $zona)::date` como clave de día, y `date_trunc`
   para semanas y meses.
3. **Agregar en SQL con los cortes calculados en JS.** `src/server/time` arma la
   lista ordenada de instantes de inicio de cada tramo —día, semana o mes— en la
   zona de quien mira, con `startOfDayKey`; la consulta recibe esa lista y
   asigna cada entrada a su tramo con `width_bucket(started_at, $cortes)`. La
   base solo compara instantes.

## Decisión

La opción 3.

- **Los cortes son de `src/server/time`.** Suma una función que, dados el
  primer y el último día del rango, la granularidad, la zona y el primer día de
  la semana, devuelve las claves de día de cada tramo y su instante de inicio,
  más el fin del último. Suma también lo que haga falta para «Este mes» y «Mes
  pasado». Ninguna cuenta de zona horaria se escribe en SQL.
- **La duración se suma como la suma la planilla**: por entrada, en segundos
  enteros truncados, y después se suman. Postgres guarda microsegundos y JS lee
  milisegundos, así que `floor(extract(epoch from ended_at - started_at))` no da
  siempre lo mismo que `durationSeconds`: la consulta trunca los dos extremos a
  milisegundos antes de restar. Un test de integración compara, para una persona
  y una semana, el total del reporte con el de `getTimesheetState`, con entradas
  sembradas con microsegundos.
- **Qué cuenta**: `ended_at is not null` y `started_at` en `[desde, hasta)`. Sin
  ninguna condición sobre el estado de la membresía (RP-61), del proyecto ni de
  la tarea (RP-29).
- **Una sola foto**: los totales de la cabecera, los grupos y el gráfico salen
  de la misma lectura, en una sentencia o en una transacción de solo lectura en
  `repeatable read`. El contrato elige; lo que no puede pasar es que la cabecera
  y los grupos sumen distinto porque alguien cargó horas entre dos consultas.
- **El total no pasa por la unión con etiquetas.** Agrupando por etiqueta, una
  entrada suma en cada una de las suyas (RP-18); el total de la cabecera se
  calcula sin esa unión.
- **Lo que se muestra se lee en la misma sentencia**: nombre y color del
  proyecto, nombre del cliente, de la tarea y de la etiqueta, y de la persona
  con su estado, por `join`, como dice el
  [ADR 0010](0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md). El
  nombre de una persona tiene una regla —el editado o el de Google—, así que la
  consulta trae las dos columnas y el service aplica `displayNameOf` del módulo
  de perfil.
- **Un módulo nuevo, `src/modules/report/`**, que solo lee. Su repository es el
  único que agrega sobre `time_entry` fuera de `time-entry`; no escribe ninguna
  tabla. Las dependencias van en una dirección: `report` importa de `profile`,
  `workspace` y `project` (los catálogos de los filtros, por su service);
  ningún módulo importa de `report`.
- **Un índice parcial nuevo** sobre `(workspace_id, started_at)`, con el mismo
  predicado que la consulta: `where ended_at is not null`. El contrato del
  primer slice del reporte lo justifica con `explain` sobre datos sintéticos del
  volumen de arriba y lo retira si el plan no lo usa.
- **El tope del rango es de 366 días** (P-06). No es el tope comercial de
  Clockify: cubre «Este año» y «Año pasado» y acota el peor pedido —el árbol de
  tres niveles con la fecha abajo y la exportación— a algo que se puede medir.
  Se levanta si las mediciones lo permiten, sin cambiar el mecanismo. El
  mensaje es el de RP-34: «Elegí un período de hasta 366 días.»
- **La granularidad del gráfico sale del largo del rango**: por día hasta 31
  días, por semana hasta 26 semanas, por mes más allá. El contrato del slice del
  gráfico puede moverla; el mecanismo de cortes no cambia.

## Por qué

- **Contra la 1, el volumen.** Es la más simple y es correcta, pero manda por la
  red todas las entradas del rango para mostrar unas decenas de números, en
  cada recarga y en cada exportación. Con 31 días alcanzaba; sin el tope, no.
- **Contra la 2, un segundo lugar para el día.** El corte quedaría escrito dos
  veces, con dos bases de zonas horarias: la de Postgres en Neon y la de ICU en
  Node, que se actualizan por separado. Un cambio de reglas de una zona puede
  hacer que el reporte y la planilla pongan la misma entrada en días distintos.
  Y los casos que `startOfDayKey` resuelve a propósito —la medianoche que no
  existe, el día que falta entero— habría que volver a resolverlos en SQL.
- **La 3 deja la zona en un solo lugar** y le pasa a la base solo lo que la base
  hace bien: filtrar por un rango de instantes, unir y sumar.

## Consecuencias

- `src/server/time` crece con los cortes por tramo y la aritmética de meses,
  con sus tests de cambio de horario.
- El reporte y la planilla suman lo mismo para la misma persona, semana y zona,
  y un test lo afirma.
- **El parámetro es un arreglo de `timestamptz`.** Pasarlo por el `sql` de
  Drizzle con el driver de Neon se verifica al empezar el primer slice; si no
  anda, la alternativa es `unnest` de los cortes en un `join` por rango, con el
  mismo resultado.
- **El tope de 366 días es una decisión de este ADR, no del usuario**, y se
  revisa con mediciones. Si se levanta, la granularidad por mes ya está.
- El detallado de la fase 3 lee entradas, no agregados: reusa el alcance y el
  `where` de este módulo, no los cortes.
- Si la base crece hasta que la suma de un año pese, la salida es una tabla de
  totales por persona y día mantenida en la escritura. No hace falta ahora, y
  dependería de la zona de quien escribe, que no es la de quien mira: por eso
  no se adelanta.
