# Núcleo de reportes, R2b: los demás atajos, cliente y fecha

Contrato del tercer slice del núcleo de reportes. Extiende la pantalla
`/reportes` y el módulo `src/modules/report/` de R2a; trae el mecanismo de cortes
por tramo del ADR 0021 con su primer uso, la agrupación por fecha. Sin cambios de
tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-11 con cliente
  y fecha en un nivel, RP-20 con Hoy, Ayer, Semana anterior, Últimas dos semanas,
  Este mes, Mes pasado, Este año y Año pasado, RP-24 para la agrupación por fecha
  y los atajos de semana, y RP-28 («Sin cliente»). Se apoya en RP-12, RP-18,
  RP-22, RP-23, RP-29, RP-32 y RP-33 tal como los dejó R2a.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R2b».
  Depende de R2a, en `main`.
- **Revisión del contrato:** aprobado con cambios en la primera ronda de
  `architecture-reviewer`; los hallazgos M1, m1 a m6 y n2 a n6 están aplicados.
  El n5 (el mapa) lo alinea el team-lead.
- **Dos partes, en este orden** (decisión del team-lead, §10): la **parte A**,
  atajos y cliente, y la **parte B**, fecha, en commits propios al final. Los
  commits de la parte A compilan y pasan sin la B, así que el slice se puede
  partir en R2b (A) y R2c (B) sin reescribir nada (§7).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): los cortes por tramo
    y la aritmética de meses en `src/server/time`, `width_bucket` con el arreglo
    de cortes, el corte repetido por un día que falta, la comprobación contra
    Neon antes de mergear y la alternativa si un driver no pasa el arreglo.
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): toda
    lectura nueva recibe el `ReportScope`.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    el nombre del cliente se lee con `join` en el repository propio.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): los rótulos de los días
    y de los atajos se arman en el servidor.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** El ADR
  0021 describe la función de cortes con la granularidad como parámetro; R2b
  trae solo la de día y R5 suma la de semana y la de mes con la misma forma
  (D-R2b-6). Lo que queda para el usuario está en §10.

Decisiones que el contrato da por tomadas (R2a, mapa §5, `reportes.md` §8): el
atajo de la semana pasada se rotula «Semana anterior», como `weekKeyLabel` en
el resto de la aplicación (decisión del team-lead, `estado-fase1.md` punto 0);
el tope de 366 días; un nivel de agrupación hasta R3; los grupos sin horas no se
muestran hasta R9; la regla de los e2e del reporte de §8.3 de R2a.

## Decisiones del contrato

**D-R2b-1 — Un atajo es un rango con nombre, no un parámetro propio.** Opciones:
(1) el atajo escribe `desde` y `hasta` en la URL, como cualquier rango; (2) un
parámetro relativo, `periodo=este-mes`, que cada carga resuelve con el día de
hoy; (3) los dos. **(1).** RP-32 pide que un enlace pasado a otra persona
reproduzca la misma vista: con (2), un enlace de «Hoy» abierto mañana, o por
alguien en otra zona, muestra otros días. Con (1) la URL sigue siendo la de R2a,
la exportación de R6 recibe siempre un rango cerrado y no hay un segundo esquema
de período. **El rótulo se recalcula en cada carga**: un enlace de «Este mes»
abierto el mes siguiente dice «Mes pasado», porque es eso. Sin parámetros sigue
siendo «Esta semana» (D-R2a-4). Lo que se pierde es un enlace que siga al mes en
curso: queda como deuda (§9).

**D-R2b-2 — Qué es cada atajo.** Con `T` el día de hoy en la zona de quien mira
y `S = weekStartKey(T, primer día)`:

| Id             | Rótulo                | Período                                                     |
| -------------- | --------------------- | ----------------------------------------------------------- |
| `today`        | «Hoy»                 | `T`                                                         |
| `yesterday`    | «Ayer»                | `T − 1`                                                     |
| `thisWeek`     | «Esta semana»         | `S` a `S + 6`                                               |
| `lastWeek`     | «Semana anterior»     | `S − 7` a `S − 1`                                           |
| `lastTwoWeeks` | «Últimas dos semanas» | `S − 7` a `S + 6`                                           |
| `thisMonth`    | «Este mes»            | `monthStartKey(T)` a `monthEndKey(T)`                       |
| `lastMonth`    | «Mes pasado»          | `monthStartKey(T, −1)` a `monthEndKey(T, −1)`               |
| `thisYear`     | «Este año»            | el 1 de enero al 31 de diciembre del año de `T`             |
| `lastYear`     | «Año pasado»          | el 1 de enero al 31 de diciembre del año anterior al de `T` |

- **Unidades enteras del calendario**, con los días que todavía no pasaron, como
  «Esta semana» en R2a. Un año tiene 365 o 366 días: entra en el tope.
- **«Últimas dos semanas» son la semana anterior y esta**, alineadas al primer
  día de quien mira (RP-24), y no los 14 días que terminan hoy. Así todo atajo
  es una unidad del calendario, las flechas lo mueven a las dos semanas
  anteriores sin desalinearlo, y el rótulo se reconoce. Lo que hace Clockify con
  `PAST_TWO_WEEKS` está _no verificado_ (P-05); es la pregunta 2 de §10.
- **«Mes pasado» y «Año pasado», no «Mes anterior»**: «Mes anterior» es el
  nombre del botón de navegación del calendario, en el mismo popover
  (`labels.ts:19`), y dos controles con el mismo nombre en un diálogo no se
  distinguen con un lector de pantalla. «Semana anterior» queda por la decisión
  del team-lead.
- **Los rótulos «Hoy», «Ayer», «Esta semana» y «Semana anterior» son los que ya
  devuelven `dayKeyLabel` y `weekKeyLabel`** para esos días: `period.ts` los toma
  de ahí y no repite los literales. Los otros cinco son nuevos.
- **Un atajo cuyo período no pasa `reportRangeInput` no se ofrece**, con la
  misma regla que las flechas de R2a. Solo pasa con hoy en los últimos días del
  9999 o en los primeros del 0100: los años válidos van del 0100-01-01 al
  9999-12-31 (CAL-17), y el día siguiente al último del período tiene que
  existir.
- **El rótulo del período** (en el botón y en la lista): si el período es el de
  un atajo de hoy, el rótulo del atajo; si no, el de R2a (la semana alineada con
  `weekKeyLabel`, o `dayRangeLabel`). Los nueve períodos de un mismo día son
  distintos entre sí —difieren en el largo o en el inicio—, así que el orden de
  la comprobación no cambia el resultado. Un mes entero que no es este ni el
  pasado se rotula con sus días: «01/08 – 31/08».

**D-R2b-3 — Las flechas mueven meses enteros.** Opciones: (1) por la forma del
período: si empieza el primer día de un mes y termina el último de un mes —`k`
meses enteros, de 1 a 12—, las flechas mueven `k` meses; si no, `n` días como en
R2a; (2) por el atajo: solo si el período es «Este mes», «Mes pasado», «Este año»
o «Año pasado». **(1).** Con (2), «Período anterior» desde «Mes pasado» llega a un
mes que ya no es un atajo, y la segunda flecha movería 31 días y desalinearía el
mes. Con (1), un mes, un trimestre o un año elegidos a mano en el calendario se
mueven igual que los atajos. Un año de 366 días se mueve a uno de 365 sin
correrse un día. El destino se valida con `reportRangeInput` y, si no pasa, la
flecha no se dibuja (D-R2a-4). Es lo que R2a dejó dicho para R2b (D-R2a-4, §9).

**D-R2b-4 — El período sale del service a una función pura.** La lógica del
período —semana actual, rótulo, flechas y ahora atajos y meses— está hoy en
`report/service.ts:79-102` y se prueba por integración, con base. Con R2b se
triplica. Pasa a `report/period.ts` (nuevo), que importa solo de
`@/server/time` y de `./schema`, con `period.test.ts` de unidad, en UTC y en
Buenos Aires (`test:time-ar` lo suma). Tiene el precedente de
`project/palette.ts`, otro archivo del módulo fuera de las cuatro capas. El
service la llama una vez y conserva la invariante de los 366 días (B1 de R2a).
**Los tests de período de R2a en `service.integration.test.ts` quedan como
están**: siguen pasando y prueban la composición.

**D-R2b-5 — Por cliente, plegando las filas por proyecto en el service.**
Opciones: (1) una sentencia nueva que agrega por proyecto adentro y por cliente
afuera; (2) unir `project` dentro de la agregación y agrupar por
`project.client_id`; (3) leer `totalsByProject`, que ya trae el cliente de cada
proyecto (`repository.ts:161-184`), y sumar en el service las filas de un mismo
cliente. **(3).** Es la misma sentencia, ya medida (Q2 de R2a), y lo que viaja
son las filas por proyecto, unas decenas. No suma una tercera copia de la regla
de la medida ni una función del repository que haya que blindar con el alcance.
Las sumas son enteras y exactas, así que el total sigue siendo la suma de los
grupos (D-R2a-7). **«Sin cliente» es el cliente nulo**, que llega por los dos
caminos: la fila «Sin proyecto» y la de cada proyecto sin cliente (RP-28,
PR-14). Un cliente archivado cuenta y su fila no lo marca (RP-29). R3, que trae
cliente → proyecto, puede reusar las mismas filas o elegir otra sentencia en su
contrato.

**D-R2b-6 — Por fecha, con los tramos del ADR 0021** (parte B).

- `src/server/time` suma **`dayBuckets(first, last, zona)`**: un tramo por día
  civil, con su clave y su inicio (`startOfDayKey`), y el fin, el inicio del día
  siguiente al último. **Solo la granularidad de día**: es la única que tiene un
  uso en R2b. R5 suma semana y mes devolviendo el mismo `TimeBuckets`, así que
  el repository no cambia.
- El repository suma **`totalsByBucket(scope, buckets)`**:
  `width_bucket(started_at, $cortes::timestamptz[])` con los inicios de los
  tramos y el rango de lectura `[primer inicio, fin)` con el mismo `closedIn`.
- **Un día que falta entero repite un corte** (ADR 0021): el día de Samoa que no
  existe, el 2011-12-30, tiene el mismo inicio que el 31, y `width_bucket` manda
  las entradas al último de los iguales. El día que falta queda sin horas y sin
  fila. Los cortes no se deduplican: el índice del tramo es la posición en la
  lista.
- **Una fila por día con horas, en orden cronológico**, no por duración. Una
  línea de tiempo ordenada por duración no se lee, y el orden de RP-12 está
  _no verificado_ en Clockify; `parity-analyst` lo registra como desvío
  justificado. Los días sin horas no tienen fila, como las personas sin horas
  hasta R9. Cómo se ordena en el service está en §4.5.
- **El rótulo de cada día lo arma el servidor** con `weekdayLabel(día, hoy,
formato)`: «jue, 01/10», con año si no es el de hoy (ADR 0012). Sin «Hoy» ni
  «Ayer»: en un reporte la fecha explícita no se confunde al recargar otro día.
- **El primer día de la semana no cambia la agrupación por fecha**, que es por
  día. RP-24 en R2b es el de «Semana anterior» y «Últimas dos semanas».
- **Los cortes se calculan solo para la agrupación por fecha.** Persona,
  proyecto y cliente siguen leyendo con el intervalo único de R2a, que es el
  mismo `[primer inicio, fin)`.

**D-R2b-7 — El arreglo como parámetro en los dos drivers** (parte B).

- **Un solo parámetro de tipo arreglo**, con `sql.param(…)`: un arreglo suelto
  dentro de `` sql`…` `` Drizzle lo expande en una lista `($3, $4, …)`
  (`drizzle-orm/sql/sql.js:93-103`), y con `sql.param` va entero al driver
  (`sql.js:137-152`, `:325-328`).
- **Los inicios como texto ISO** (`toISOString()`), con `::timestamptz[]` en la
  sentencia: es lo que Drizzle ya hace con un instante suelto
  (`pg-core/columns/timestamp.js:34-36`). Un `Date` dentro del arreglo lo
  formatearía el driver en la zona del proceso (`pg/lib/utils.js:63-71`); un
  texto ISO no depende de ella.
- **Los dos drivers serializan igual**: `node-postgres` convierte el arreglo en
  el literal `{"…","…"}` con `arrayString` (`pg/lib/utils.js:23-45`, `:73-75`), y
  `@neondatabase/serverless` trae la misma función empaquetada
  (`@neondatabase/serverless/index.mjs:648`, `:653`). Drizzle pasa los
  parámetros al cliente sin tocarlos en los dos casos
  (`drizzle-orm/node-postgres/session.js:102-124`,
  `neon-serverless/session.js:101-125`). La lectura es evidencia; **la
  comprobación contra Neon que pide el ADR 0021 es la del preview** (§6.3), antes
  de mergear.
- **El parámetro aparece una sola vez.** La expresión de `width_bucket` va en
  una subconsulta que también calcula la medida por entrada, y la agregación de
  afuera agrupa por la columna de la subconsulta. Un `group by` que repitiera la
  expresión llevaría otro parámetro, y Postgres no reconoce como la misma una
  expresión con un `$n` distinto («must appear in the GROUP BY clause»).
- **Si un driver no pasa el arreglo como parámetro**, la alternativa es armar el
  arreglo en la sentencia con un parámetro por corte, en la misma subconsulta:

  ```ts
  sql`array[${sql.join(
    cuts.map((cut) => sql`${cut}::timestamptz`),
    sql`, `,
  )}]`;
  ```

  Son hasta 367 parámetros, lejos del tope de 65 535 del protocolo, y
  `width_bucket` recibe el mismo arreglo. Si lo que falla es `width_bucket` con
  el arreglo ya en la base, la alternativa del ADR 0021 es `unnest` de los
  cortes en un `join` por rango. Cualquiera de las dos da los mismos tramos,
  también con el corte repetido, y pasa los mismos tests; la elige
  `backend-dev` con `architect` si la comprobación de §6.3 falla.

**D-R2b-8 — Volumen.** La medición de R2a se repite para la sentencia nueva con
el mismo volumen: Q5 y Q6 de §6.1. La agrupación por cliente es Q2.

**D-R2b-9 — Los e2e de R2b.** Heredan §8.3 de R2a sin cambios. Los atajos se
prueban sin sembrar horas: las afirmaciones son sobre la URL y el rótulo, que no
dependen de lo que acumula la base. Cliente y fecha se prueban con alcance
propio, el único donde «Sin cliente» y las filas por día son reproducibles.

**D-R2b-10 — Lo que se prueba del popover en unidad y lo que no.** El arnés de
unidad es `environment: "node"`, sin jsdom ni testing-library
(`vitest.config.ts:11`): los componentes se prueban con `renderToStaticMarkup`,
y el contenido del popover está en un `Portal` que solo se monta abierto
(`popover.tsx:28`). Por eso **los atajos van dentro de `RangePanel`**, que se
dibuja sin popover, como ya lo prueba `range-picker.test.tsx:47-61`. En unidad
van el nombre de la lista, el orden, los `href` y el único `aria-current`; que
elegir un atajo cierra el popover y devuelve el foco al botón solo lo prueba el
e2e 7.

## 0. Precondición de arranque

- **`main` en `23de226`**, con R2a, `fix/postgres-18` y `fix/zona-de-la-maquina`
  mergeados. Las citas de abajo son de ese árbol. Los tests de integración y CI
  usan `postgres:18-alpine`, la versión mayor de Neon (`ci.yml:46-47`).
- **La comprobación contra Neon de §6.3 la hace el usuario** en un preview de la
  rama, apenas `totalsByBucket` esté en ella. No bloquea el arranque; bloquea el
  merge (ADR 0021, §10).

### Supuestos sobre el árbol, con archivo y línea en `23de226`

| Supuesto                                                                                                                                                                             | Dónde                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `REPORT_GROUP_BYS` es `["person", "project"]`; `REPORT_GROUP_PARAMS` los traduce; `reportGroupParams` busca el valor de la URL en ese mapa, así que una agrupación nueva se lee sola | `src/modules/report/schema.ts:60-75`                                                               |
| `reportProjectGroup` y `reportReadyState`; la unión de grupos es discriminada por `kind`                                                                                             | `schema.ts:89-121`                                                                                 |
| `scopeOf`, `weekFrom`, `shifted`, `rangeLabelOf` y el orden de los grupos viven en el service; `getReportState` arma el período, valida 1 a 366 días (B1) y lee una vez              | `src/modules/report/service.ts:68-77`, `:79-102`, `:131-155`, `:193-238`                           |
| `totalsOf` ordena siempre con `compareGroups`, que compara por `sortKeyOf`                                                                                                           | `service.ts:131-155`, `:168-176`                                                                   |
| El test de B1 recorre `person` y `project` con un rango invertido y uno de 367 días, y espía las dos lecturas                                                                        | `src/modules/report/service.integration.test.ts:521-540`                                           |
| `inScope` es la única traducción del alcance; `closedIn` la regla de qué cuenta; `entrySeconds` la medida; `secondsOf` lanza fuera de entero seguro                                  | `src/modules/report/repository.ts:43-49`, `:55-61`, `:67`, `:81-87`                                |
| `totalsByProject` une `project` y `client` con `left join` y devuelve el cliente de cada proyecto, nulo sin cliente o sin proyecto                                                   | `repository.ts:161-184`                                                                            |
| `scope.test-d.ts` afirma que las dos lecturas no compilan sin alcance, con `undefined` ni con `null`                                                                                 | `src/modules/report/scope.test-d.ts:15-28`                                                         |
| `scope.integration.test.ts` siembra en A seis personas —owner, admin, `project_manager`, `team_manager`, un member que también está en B y un member inactivo— y B con su owner      | `src/modules/report/scope.integration.test.ts:64-118`                                              |
| `addDaysToKey` hace aritmética civil con `Date.UTC` y `toDayKey`; `parseDayKey` rechaza los años antes del 0100 y los de cinco cifras                                                | `src/server/time/index.ts:169-206`                                                                 |
| `dayKeyLabel` da «Hoy» y «Ayer»; `weekdayLabel` da «jue, 01/10» con año si no es el de hoy; `weekKeyLabel` da «Esta semana» y «Semana anterior»                                      | `time/index.ts:250-262`, `:295-302`, `:399-413`                                                    |
| `startOfDayKey` de un día que falta entero devuelve el inicio del siguiente; `daysBetweenKeys` lanza con una clave inválida; `dayRangeLabel`                                         | `time/index.ts:370-392`, `:419-430`, `:437-454`                                                    |
| No hay aritmética de meses ni cortes por tramo en `src/server/time`                                                                                                                  | `time/index.ts` (las exportadas)                                                                   |
| `test:unit` corre en UTC salvo que `TZ` diga otra, con `environment: "node"`; `test:time-ar` corre `src/server/time` en Buenos Aires; CI corre los dos                               | `vitest.config.ts:11-12`; `package.json:14-16`; `.github/workflows/ci.yml:25-28`                   |
| La barra dibuja dos enlaces de agrupación y el enlace «Esta semana» fuera del popover                                                                                                | `src/modules/report/components/report-toolbar.tsx:52-71`                                           |
| `RangePicker` recibe `range`, `rangeLabel`, `todayKey` y `groupBy`; `RangePanel` dibuja el calendario con `autoFocus`, la región de alerta y «Aplicar»                               | `components/range-picker.tsx:18-25`, `:101-148`                                                    |
| El popover se monta solo abierto: `Popover` no pasa `keepMounted`                                                                                                                    | `src/components/ui/popover.tsx:28`                                                                 |
| `ReportView` elige el encabezado de la columna entre dos, y la clave y el encabezado de fila por `kind`                                                                              | `components/report-view.tsx:60-62`, `:77-105`                                                      |
| `reportLabels` tiene «Mes anterior» y «Mes siguiente» para el calendario; «Sin cliente» es `projectLabels.noClient`                                                                  | `components/labels.ts:19-20`; `src/modules/project/components/labels.ts:13`                        |
| `report-toolbar.test.tsx` y `report-view.test.tsx` arman un `ReportReadyState` literal; `range-picker.test.tsx` dibuja `RangePanel` con sus props y un `Calendar` envuelto           | `components/report-toolbar.test.tsx:14-28`; `report-view.test.tsx`; `range-picker.test.tsx:25-61`  |
| El nombre del cliente es único por workspace sin distinguir mayúsculas; `seedProject` de e2e crea un cliente nuevo por llamada                                                       | `src/server/db/schema.ts:244`; `e2e/database.ts:224-237`                                           |
| `seedClient` de integración acepta `archived`                                                                                                                                        | `src/test/factories.ts:151-156`                                                                    |
| `rangeLabel` de e2e reconoce solo semanas alineadas al lunes; `expectGroupBy` supone dos agrupaciones; `ReportGroupBy` de e2e es `"persona" \| "proyecto"`                           | `e2e/reports-page.ts:65-71`, `:138-143`, `:240-244`                                                |
| `periodLink` busca en toda la página: con el popover abierto, «Esta semana» tiene dos enlaces                                                                                        | `e2e/reports-page.ts:218-220`                                                                      |
| El recorrido 4 de R2a aplica del lunes de la semana anterior al domingo de esta y afirma el rótulo con `rangeLabel`                                                                  | `e2e/reports.spec.ts:255`, `:278`                                                                  |
| `days.ts` de e2e tiene `weekdayLabel`, `weekLabel`, `dayRangeLabel` y `monthsBetween`, implementados aparte del servidor                                                             | `e2e/days.ts:86-88`, `:109-115`, `:163-186`                                                        |
| La medición de R2a: Q1 a Q4 en `explain.sql`; Q2 21,165 ms en Postgres 18.6; el índice parcial no entró                                                                              | `scripts/report-volume/explain.sql:23-100`; `correcciones-nucleo-reportes-r2a-revisiones.md:19-23` |
| Producción usa `neon-serverless` con un host `.neon.tech`; local y tests, `node-postgres`                                                                                            | `src/server/db/index.ts:16-22`                                                                     |

## 1. Alcance

Entra, **parte A** (atajos y cliente):

- **`src/server/time`**: `monthStartKey`, `monthEndKey` y `wholeMonthCount`
  (§4.2).
- **El módulo `report`**: la agrupación `client` en el esquema y su tipo de
  grupo; los atajos en el estado; `period.ts` (nuevo) con los atajos, el rótulo y
  las flechas por meses; el plegado por cliente en el service.
- **La pantalla**: «Cliente» en «Agrupar por»; la lista de atajos en el selector
  del período; la fila de cliente.

Entra, **parte B** (fecha), en commits propios al final:

- **`src/server/time`**: `dayBuckets`, con `TimeBucket` y `TimeBuckets`.
- **El módulo `report`**: la agrupación `date` en `REPORT_GROUP_BYS` y
  `REPORT_GROUP_PARAMS`, su tipo de grupo, `totalsByBucket` y su rama en
  `readGroups`.
- **La pantalla**: «Fecha» en «Agrupar por» y la fila de fecha.
- **La medición** de la sentencia nueva (§6.1) y **la comprobación contra Neon**
  (§6.3).

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                              | Qué cambia                                                                                                                         | Qué hay que volver a probar                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/server/time/index.ts`           | Suma cuatro funciones y dos tipos (A: tres funciones; B: `dayBuckets` y los tipos). Ninguna existente cambia.                      | `time.test.ts` entero, en UTC y en Buenos Aires                     |
| `src/modules/report/schema.ts`       | Dos agrupaciones y dos tipos de grupo (A: cliente; B: fecha), los atajos y `shortcuts` en el estado (A).                           | `schema.test.ts`; los fixtures de los tests de componentes          |
| `src/modules/report/service.ts`      | El período pasa a `period.ts` (A); `readGroups` suma cliente (A) y fecha (B); `totalsOf` recibe el orden (B).                      | `service.integration.test.ts` y `scope.integration.test.ts` enteros |
| `src/modules/report/repository.ts`   | Suma `totalsByBucket` (B). Las dos lecturas existentes no cambian.                                                                 | Ídem                                                                |
| `src/modules/report/components/*`    | Los enlaces de agrupación, la lista de atajos en `RangePanel` y la fila de cliente (A); el enlace y la fila de fecha (B).          | Los tests de componentes; los fixtures suman `shortcuts: []`        |
| `package.json`                       | `test:time-ar` corre también `src/modules/report/period.test.ts` (A).                                                              | `npm test`                                                          |
| `e2e/reports-page.ts`, `e2e/days.ts` | `rangeLabel` reconoce los nueve atajos; `expectGroupBy` y `ReportGroupBy` con las agrupaciones nuevas; ayudas de mes en `days.ts`. | `reports.spec.ts` entero                                            |
| `scripts/report-volume/explain.sql`  | Suma Q5 y Q6 (B).                                                                                                                  | —                                                                   |

- **Una afirmación existente cambia de valor, no de texto.** El período que
  aplica el recorrido 4 de R2a —del lunes de la semana anterior al domingo de
  esta (`reports.spec.ts:255`)— es «Últimas dos semanas». El rótulo esperado sale
  de `rangeLabel` de `reports-page.ts`, que pasa a reconocer los atajos: el spec
  no se toca y la pantalla dice «Últimas dos semanas» en vez de las dos fechas.
  Es el comportamiento que pide D-R2b-2.
- **Las flechas de R2a no cambian para ningún período que no sea de meses
  enteros.** Ningún test existente usa uno (§0).
- `page.tsx`, `error.tsx` y `report-screen.tsx` no cambian: la página lee la
  agrupación con `reportGroupParams`, que enumera `REPORT_GROUP_BYS`, y la
  pantalla pasa el estado entero a la barra.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** Si Q5 o Q6 (§6.1) pasan el presupuesto, vale
la regla de §6.3 de R2a: el slice se detiene y vuelve a `architect`; el índice
parcial no se suma sin una medición que lo justifique.

## 3. Permisos

**Ninguna acción nueva.** `report.view` y `timeEntry.others.view` deciden como en
R2a (D-R2a-2). `totalsByBucket` recibe el `ReportScope` como primer parámetro y
lo traduce con `inScope`, como las otras dos; ninguna consulta arma su propio
filtro de personas.

## 4. Contrato de lectura

### 4.1 Los tipos (`report/schema.ts`)

La forma final, con lo de la parte B marcado:

```ts
export const REPORT_GROUP_BYS = [
  "person",
  "project",
  "client",
  "date", // parte B
] as const;

export const REPORT_GROUP_PARAMS = {
  person: "persona",
  project: "proyecto",
  client: "cliente",
  date: "fecha", // parte B
} as const satisfies Record<ReportGroupBy, string>;

/** RP-20: los atajos, en el orden de la lista (D-R2b-2). */
export const REPORT_SHORTCUTS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "lastTwoWeeks",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
] as const;
export type ReportShortcutId = (typeof REPORT_SHORTCUTS)[number];

const reportShortcut = z.object({
  id: z.enum(REPORT_SHORTCUTS),
  /** «Hoy», «Mes pasado»: lo que dice el enlace y, si es el período, el botón. */
  label: z.string(),
  range: reportRangeView,
});
export type ReportShortcut = z.infer<typeof reportShortcut>;

const reportClientGroup = z.object({
  kind: z.literal("client"),
  /**
   * `null` es «Sin cliente»: las entradas sin proyecto y las de proyectos sin
   * cliente (RP-28). Archivado o no (RP-29).
   */
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  seconds: z.number().int().min(0),
});

// parte B
const reportDateGroup = z.object({
  kind: z.literal("date"),
  /** El día civil en la zona de quien mira (RP-22). */
  dayKey: z.string(),
  /** `weekdayLabel`: «jue, 01/10», con año si no es el de hoy (D-R2b-6). */
  label: z.string(),
  seconds: z.number().int().min(0),
});

// reportReadyState suma:
//   /** Los atajos de hoy, sin los que no pasan `reportRangeInput` (D-R2b-2). */
//   shortcuts: z.array(reportShortcut),
// y la unión de `groups` suma el tipo de cliente (A) y el de fecha (B).

export type ReportClientGroup = z.infer<typeof reportClientGroup>;
export type ReportDateGroup = z.infer<typeof reportDateGroup>; // parte B
```

- **La URL dice `cliente` y `fecha`**; el código, `client` y `date`, como
  `persona` y `person`.
- `reportGroupParams` no cambia de cuerpo: lee lo que escribe
  `REPORT_GROUP_PARAMS`, así que `agrupar=cliente` (A) y `agrupar=fecha` (B)
  pasan y cualquier otro valor se descarta (RP-32). Hasta la parte B,
  `agrupar=fecha` se descarta como cualquier valor desconocido.
- `rangeLabel` sigue siendo texto: el del atajo o el de R2a.

### 4.2 Lo que suma `src/server/time`

Parte A:

```ts
/**
 * El primer día del mes que está `months` meses después del de `dayKey`
 * (antes, si es negativo). Aritmética civil en UTC, como `addDaysToKey`. El
 * resultado puede caer fuera de los años válidos: quien lo usa lo valida.
 * Lanza si `dayKey` no es un día.
 */
export function monthStartKey(dayKey: string, months?: number): string;

/** El último día de ese mismo mes. Mismas reglas que `monthStartKey`. */
export function monthEndKey(dayKey: string, months?: number): string;

/**
 * Cuántos meses enteros hay de `first` a `last` —de 1 en adelante— si `first`
 * es el primer día de un mes y `last` el último de un mes, no anterior; si no,
 * `null`. Lanza si alguna clave no es un día.
 */
export function wholeMonthCount(first: string, last: string): number | null;
```

Parte B:

```ts
/** Un tramo de una lectura agrupada: su primer día civil y su primer instante. */
export type TimeBucket = { readonly firstDay: string; readonly start: Date };

/**
 * Los tramos en orden y el fin del último, que es la cota superior de la
 * lectura. Los inicios quedan ordenados pero pueden repetirse (ADR 0021).
 */
export type TimeBuckets = {
  readonly buckets: readonly TimeBucket[];
  readonly end: Date;
};

/**
 * Un tramo por día civil de `first` a `last`, con su inicio en `timeZone`
 * (`startOfDayKey`), y el fin: el inicio del día siguiente a `last`. Un día que
 * falta entero en la zona tiene el inicio del siguiente. Solo usa la zona que
 * recibe. Lanza si alguna clave no es un día o si `last` es anterior a `first`.
 */
export function dayBuckets(first: string, last: string, timeZone: string): TimeBuckets;
```

- **Ninguna suma milisegundos.** Los meses se arman con claves de día; los
  instantes salen todos de `startOfDayKey` (mapa §3, riesgo de R2b).
- `monthStartKey` y `monthEndKey` usan `Date.UTC(año, mes − 1 + months, 1)` y
  `Date.UTC(año, mes + months, 0)` sobre el año de una clave válida, que tiene
  cuatro cifras, como `addDaysToKey`: un año de dos cifras como argumento de
  `Date.UTC` se leería como 19xx. El resultado pasa por `toDayKey`.
- `dayBuckets` llama a `startOfDayKey` una vez por día: 367 llamadas para un año.
  §6.2 lo mide.

### 4.3 El período (`report/period.ts`, nuevo, parte A)

```ts
/** Lo que la pantalla necesita del período (D-R2a-4, D-R2b-1 a D-R2b-3). */
export type ReportPeriod = {
  /** El pedido o, sin pedido, «Esta semana». */
  readonly range: ReportRange;
  readonly rangeLabel: string;
  /** `null` si el destino no pasa `reportRangeInput`. */
  readonly previous: ReportRange | null;
  readonly next: ReportRange | null;
  /** El destino del enlace «Esta semana». */
  readonly currentWeek: ReportRange;
  /** En el orden de `REPORT_SHORTCUTS`, sin los que no pasan `reportRangeInput`. */
  readonly shortcuts: readonly ReportShortcut[];
};

/**
 * El período de quien mira con hoy en `todayKey`. Aritmética de claves: no lee
 * el reloj ni la zona. No valida `requested`: lo recibe de `reportRangeParams`.
 */
export function reportPeriodOf(
  todayKey: string,
  settings: Pick<TimeSettings, "weekStart" | "formats">,
  requested: ReportRange | null,
): ReportPeriod;
```

- **Flechas** (D-R2b-3): con `k = wholeMonthCount(first, last)`, `previous` es
  `monthStartKey(first, −k)` a `monthEndKey(first, −1)` y `next`,
  `monthStartKey(first, k)` a `monthEndKey(first, 2k − 1)`; con `k` nulo, `n`
  días como en R2a (`shifted`, que se mueve acá sin cambios).
- **Rótulo** (D-R2b-2): el del atajo cuyo `range` es igual al período; si no hay,
  `weekKeyLabel` para una semana alineada al primer día y `dayRangeLabel` para
  el resto (`rangeLabelOf`, que se mueve acá).
- **Los atajos** con la tabla de D-R2b-2. Este año y Año pasado con
  `toDayKey({ year, month: 1, day: 1 })` y `toDayKey({ year, month: 12, day: 31 })`
  sobre el año de `parseDayKey(todayKey)`.

### 4.4 Repository (`report/repository.ts`, parte B)

```ts
export type BucketTotalRow = {
  /** La posición del tramo en `buckets.buckets`, desde 0. */
  readonly bucket: number;
  readonly seconds: number;
  readonly billableSeconds: number;
};

// en reportRepository:
  /**
   * Una fila por tramo con horas cerradas, dentro de `scope`; los tramos sin
   * horas no vienen. Una sentencia (D-R2b-6, D-R2b-7).
   */
  totalsByBucket(
    scope: ReportScope,
    buckets: TimeBuckets,
  ): Promise<readonly BucketTotalRow[]>;
```

La sentencia, con los nombres de R2a:

```sql
select entries.bucket,
       sum(entries.seconds)::bigint as seconds,
       coalesce(sum(entries.seconds) filter (where entries.billable), 0)::bigint as billable_seconds
  from (select width_bucket(time_entry.started_at, $cortes::timestamptz[]) as bucket,
               <entrySeconds> as seconds,
               time_entry.billable
          from time_entry
         where <inScope(scope)> and <closedIn({ from: primer inicio, to: buckets.end })>
       ) entries
 group by entries.bucket
```

- **`$cortes`** es `sql.param(buckets.buckets.map((b) => b.start.toISOString()))`:
  un solo parámetro, en un solo lugar de la sentencia (D-R2b-7).
- **`inScope`, `closedIn` y `entrySeconds` son las de R2a**, sin copia. La medida
  se trunca por entrada adentro y se suma afuera, como en las otras dos.
- **El tramo**: `width_bucket` da de 1 a `n` para lo que `closedIn` deja pasar.
  El repository le resta uno y lanza `RangeError` si no queda en `[0, n)`, como
  `secondsOf` con una suma fuera de rango. Con `buckets.buckets` vacío lanza
  antes de consultar.
- Sin orden: lo pone el service.

### 4.5 Service (`report/service.ts`)

`getReportState` conserva su firma. En este orden:

1. **`report.view`** y **`scopeOf`**, sin cambios.
2. **El período**: `todayKey = dayKey(now, zona)`;
   `period = reportPeriodOf(todayKey, settings, request.range)`; la invariante de
   1 a 366 días sobre `period.range`, sin cambios, **antes de cualquier lectura y
   antes de `dayBuckets`**.
3. **Una lectura** según `groupBy ?? "person"`:
   - `person`, `project`: como R2a, con el intervalo único;
   - `client` (A): `totalsByProject` con el mismo intervalo, y las filas se suman
     por `client?.id ?? null` (D-R2b-5);
   - `date` (B): `totalsByBucket(scope, dayBuckets(first, last, zona))`.
4. **Los grupos**:
   - cliente: `{ kind: "client", client, seconds }`, con el orden de R2a —duración
     descendente, `compareNames` en el empate y «Sin cliente» después de los
     clientes de su misma duración—;
   - fecha: `{ kind: "date", dayKey, label, seconds }` con
     `dayKey = buckets[fila.bucket].firstDay` y
     `label = weekdayLabel(dayKey, todayKey, settings.formats.date)`.
5. **Los totales**: las sumas de las filas, como R2a. Cada entrada está en
   exactamente un proyecto, un cliente y un tramo, así que la suma de los grupos
   es el total en las cuatro agrupaciones (D-R2a-7).
6. **El estado**: los campos de `period` y `shortcuts`.

**El orden de los grupos.** Hoy `totalsOf` ordena siempre con `compareGroups`
(`service.ts:172`), que compara duración y después `sortKeyOf`.

- **Parte A**: `sortKeyOf` y `compareGroups` siguen sirviendo a persona,
  proyecto y cliente; `sortKeyOf` devuelve `null` para «Sin proyecto» y para
  «Sin cliente».
- **Parte B**: la fecha no tiene nombre ni va por duración. `totalsOf` recibe el
  comparador como parámetro: `compareGroups` para persona, proyecto y cliente, y
  `compareDays` para la fecha, que ordena por `dayKey` ascendente (las claves
  `AAAA-MM-DD` se ordenan como el calendario, como en `earliestDayKey`). Con la
  fecha en la unión, `sortKeyOf` y `compareGroups` reciben
  `Exclude<ReportGroup, ReportDateGroup>` y resuelven `kind` con un `switch` que
  el compilador comprueba exhaustivo: la unión de los cuatro `kind` queda
  cubierta entre las dos funciones, y una fila de fecha no puede llegar a
  `compareGroups` sin un `as`.

- El plegado por cliente y el armado de la fila por fecha son funciones privadas
  del service.
- **Ninguna decisión de acceso cambia**: el service no compara roles ni arma
  filtros de personas.

### 4.6 Costo

Una sentencia por carga, como R2a. Por fecha, además, `dayBuckets` en JS (hasta
367 `startOfDayKey`) y un parámetro de unos 9 KB con un año de cortes.

## 5. Pantalla

### 5.1 La barra (`report-toolbar.tsx`)

- **«Agrupar por»**, en este orden: «Persona», «Proyecto», «Cliente» (A) y
  «Fecha» (B). El elegido lleva `aria-current="true"`; todos conservan el rango.
  El grupo sigue nombrado por su rótulo visible.
- **«Esta semana»** fuera del popover queda como en R2a: aparece solo si el
  período no es la semana actual.
- `RangePicker` recibe además `shortcuts`.

### 5.2 Los atajos (`range-picker.tsx`, parte A)

- **`RangePanel` dibuja los atajos** (D-R2b-10). Suma cuatro props:
  `shortcuts`, `range` (el período que se ve, para `aria-current`), `groupBy`
  (para los `href`) y `onShortcut` (lo que pasa al elegir uno). `RangePicker` le
  pasa `onShortcut` que cierra el popover.
- **Una lista nombrada «Atajos»** (`<ul aria-label>`), antes del calendario en
  el orden del documento: a la izquierda en pantallas anchas, arriba en las
  angostas. Un enlace por atajo, con su rótulo, a
  `reportHref({ range: atajo.range, groupBy })`. Con `shortcuts` vacío no hay
  lista.
- **El atajo cuyo `range` es el período que se ve lleva `aria-current="true"`**;
  los demás no. La comparación es de presentación, como `isCurrentWeek` de la
  barra (`report-toolbar.tsx:21-22`).
- **Al elegir un atajo**, el enlace llama a `onShortcut` y navega; el popover se
  cierra y el foco vuelve al botón del período, como al cerrar con Esc. No pasa
  por «Aplicar» ni por `applySelection`: el rango ya es válido. Esto lo prueba
  solo el e2e 7 (D-R2b-10).
- **El foco inicial sigue en el calendario** (`autoFocus`, R2a); los atajos se
  alcanzan con Mayús+Tab. El calendario, la región de alerta y «Aplicar» no
  cambian.

### 5.3 La tabla (`report-view.tsx`)

- **El encabezado de la primera columna**: «Persona», «Proyecto», «Cliente» (A)
  o «Fecha» (B).
- **Cliente**: el nombre; «Sin cliente» en gris, como «Sin proyecto».
- **Fecha**: `<time dateTime={dayKey}>{label}</time>` en el encabezado de fila.
- **El vacío, los totales y el truncado al minuto** son los de R2a (RP-33,
  §5.3 de R2a): por fecha, un período sin horas es la fila «No hay horas en este
  período».
- `groupKey`: el id del cliente o `sin-cliente`; el `dayKey` para la fecha.

### 5.4 Textos (`labels.ts`)

| Clave       | Texto     | Parte |
| ----------- | --------- | ----- |
| `byClient`  | «Cliente» | A     |
| `shortcuts` | «Atajos»  | A     |
| `byDate`    | «Fecha»   | B     |

«Sin cliente» es `projectLabels.noClient`. Los rótulos de los atajos y de los días
llegan en el estado (D-R2b-2, D-R2b-6).

## 6. Volumen, tramos y Neon (parte B)

### 6.1 Las consultas medidas

Lo hace `backend-dev` con el repository terminado, con `seed.sql` y el
procedimiento de §6 de R2a, en `postgres:18-alpine`, en una base propia que se
borra al terminar. `explain.sql` suma:

| Consulta | Qué                                                                         | Presupuesto (mediana) |
| -------- | --------------------------------------------------------------------------- | --------------------- |
| Q5       | `totalsByBucket`, `everyone`, los 366 días del año pasado, un tramo por día | ≤ 150 ms              |
| Q6       | `totalsByBucket`, `self`, los mismos 366 días                               | ≤ 30 ms               |

La sentencia es el texto de `.toSQL()`; el arreglo de cortes se arma en el
script con `generate_series` de los días a la medianoche de Buenos Aires, que no
tiene cambio de horario, igual a lo que da `startOfDayKey`. Q1 a Q4 se vuelven a
correr para confirmar que no cambiaron.

### 6.2 El costo de los tramos en JS

`dayBuckets` de 366 días en Buenos Aires y en Madrid, cinco corridas en Node, la
mediana en el informe. Presupuesto: 20 ms. Si lo pasa, `backend-dev` avisa antes
de seguir; no es un test (sin tiempos en los tests).

### 6.3 La comprobación contra Neon (ADR 0021)

**Decidida por el usuario** (§10): se hace en el preview de la rama **apenas
`totalsByBucket` esté en ella, y siempre antes del merge**. El preview habla con
Neon por `neon-serverless` y tiene una base de datos sintéticos (`CLAUDE.md`,
límites del entorno). La hace el usuario, que es quien puede entrar:

1. Entrar al preview y cargar desde la barra manual tres entradas en dos días de
   la semana anterior, una de ellas de 23:00 a 23:50.
2. Abrir `/reportes`, «Semana anterior», «Agrupar por» «Fecha»: dos filas, cada
   una con el total de ese día en la planilla de esa semana, y el total igual al
   de «Persona».
3. Elegir «Año pasado» con «Fecha»: la pantalla carga sin error (366 cortes en
   el parámetro).

**El SHA del commit desplegado en el preview** y el resultado de cada paso se
anotan en el documento de revisiones. Si el paso 2 o el 3 fallan por el driver,
se aplica la alternativa de D-R2b-7, se corre la suite y se repite la
comprobación sobre el SHA nuevo. Un commit de la parte B posterior al
comprobado que toque `totalsByBucket` o `dayBuckets` obliga a repetirla.

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea. Cada archivo lleva
cambios de la parte A, de la B o de las dos; la columna de §1 dice cuáles.

### backend-dev

```
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/period.ts                         (nuevo, A)
/home/maxi/program/clock/src/modules/report/period.test.ts                    (nuevo, A)
/home/maxi/program/clock/src/modules/report/repository.ts                     (B)
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/scope.test-d.ts                   (B)
/home/maxi/program/clock/package.json                                         (solo test:time-ar, A)
/home/maxi/program/clock/scripts/report-volume/explain.sql                    (B)
```

### frontend-dev

```
/home/maxi/program/clock/src/modules/report/components/report-toolbar.tsx
/home/maxi/program/clock/src/modules/report/components/range-picker.tsx       (A)
/home/maxi/program/clock/src/modules/report/components/report-view.tsx
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
/home/maxi/program/clock/src/modules/report/components/range-picker.test.tsx  (A)
/home/maxi/program/clock/src/modules/report/components/report-view.test.tsx
```

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Suma los casos del criterio 11 contra las firmas publicadas —por cliente en la
parte A, por fecha en la B—, sin mirar la implementación de `totalsByBucket`, y
corre la tabla de mutantes de §8.1 en una copia propia.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                  (7 y 8 en A, 9 en B)
/home/maxi/program/clock/e2e/reports-page.ts
/home/maxi/program/clock/e2e/days.ts                                          (A)
```

- `days.ts`: `monthStartOf(civil, months)` y `monthEndOf(civil, months)`,
  implementados aparte del servidor, como el resto del archivo.
- `reports-page.ts`: `ReportGroupBy` con `"cliente"` (A) y `"fecha"` (B);
  `GROUP_LINK` con «Cliente» y «Fecha»; `expectGroupBy` afirma que la elegida es
  la única con `aria-current` entre las que hay; `NO_CLIENT`; `SHORTCUT_LABELS`
  y `shortcutRange(label, today)` con la tabla de D-R2b-2; `rangeLabel` reconoce
  primero los nueve atajos; `shortcutList(page)` y `shortcutLink(page, label)`,
  buscados dentro del popover.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

Antes del merge, una sección «Núcleo, R2b» y la corrección fechada de:

- **RP-11**: cuatro dimensiones en un nivel; `agrupar=cliente` y `agrupar=fecha`.
- **RP-12**: cliente con el orden de R2a y «Sin cliente» después en el empate;
  **fecha en orden cronológico**, desvío justificado (D-R2b-6).
- **RP-20**: los nueve atajos con su período (tabla de D-R2b-2), sus rótulos y
  por qué «Mes pasado» y no «Mes anterior»; las flechas por meses enteros; un
  atajo escribe un rango en la URL. _No verificado_: «Últimas dos semanas» y si
  «Este mes» y «Este año» incluyen los días por venir (P-05).
- **RP-22 y RP-24**: los días de la agrupación por fecha se cortan en la zona de
  quien mira; la agrupación es por día y el primer día de la semana no la
  cambia; los atajos de semana se alinean al primer día.
- **RP-28**: «Sin cliente», con lo que junta.
- **RP-32**: un enlace de un atajo reproduce los mismos días; el rótulo se
  recalcula.
- §9.5: retirar «Las flechas mueven por días, también un período de un mes».

Si el slice se parte, la sección de R2c registra lo de fecha.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/app/`,
`src/components/`, `src/lib/`, `src/modules/time-entry/`, `project/`, `profile/`,
`workspace/`, `report/components/report-screen.tsx`, `report-href.ts`,
`range-picker-model.ts`, los ADR. El mapa y el estado los actualiza el
team-lead.

### Orden

**Parte A — atajos y cliente.** Cada commit compila y pasa lint, typecheck y
`npm run test:all` sin nada de la parte B: ni `date` en `REPORT_GROUP_BYS`, ni
su tipo de grupo, ni `dayBuckets`, ni `totalsByBucket`.

1. **Primer commit de `backend-dev`**: `monthStartKey`, `monthEndKey` y
   `wholeMonthCount` con sus tests; `schema.ts` con `client` y `shortcuts`, con
   `schema.test.ts`; `period.ts` con `period.test.ts` y el script de
   `test:time-ar`; `service.ts` con `period.ts` en uso y el estado con
   `shortcuts`. `sortKeyOf` ya acepta `kind: "client"`, y `readGroups` lanza
   para `client` hasta el paso 3, para que ningún commit intermedio devuelva
   filas de proyecto con `agrupar=cliente`. **Avisa a `frontend-dev`, `test-engineer` y `e2e-tester`**: desde
   acá las formas de la parte A son las finales.
2. **`frontend-dev`, `e2e-tester` y `test-engineer` arrancan con el paso 1**,
   como en R2a; `e2e-tester` confirma que los tests 7 y 8 fallan por la
   funcionalidad y no por el arnés.
3. **`backend-dev`**: el plegado por cliente en el service y sus tests de
   integración (criterios 6, 8 en su parte de «Este mes» y 10 en su parte de
   cliente).

**Parte B — fecha**, en commits propios, después de todos los de la parte A.

4. **`backend-dev`**: `dayBuckets` con sus tests; `date` en `REPORT_GROUP_BYS` y
   `REPORT_GROUP_PARAMS` y `reportDateGroup`; `totalsByBucket`; la rama de
   `readGroups`, `totalsOf` con el comparador; `service.integration.test.ts` y
   `scope.test-d.ts`. **Avisa** a los mismos tres: desde acá las formas de la
   parte B son las finales.
5. **Con el paso 4 en la rama, el usuario hace la comprobación de §6.3** en el
   preview y se anota el SHA. No espera al final del slice.
6. **`frontend-dev`**: «Fecha» y su fila; **`e2e-tester`**: el test 9;
   **`test-engineer`**: los casos por fecha del criterio 11.
7. **`backend-dev`**: la medición de §6.1 y §6.2.

**Cierre, para las dos partes.**

8. **`test-engineer`**: los mutantes de §8.1; `parity-analyst`, antes del merge.
9. **Revisión de seguridad, antes del merge**: que `totalsByBucket` traduce el
   alcance con `inScope` y no con otro filtro; que un member con una URL armada a
   mano (`agrupar=fecha` o `cliente`, con `personas=…`) no ve nada ajeno; que el
   arreglo de cortes lo arma el servidor y no viene de la URL.

**Si el slice se parte** (§10, pregunta 3): la parte A se cierra con los pasos 8
y 9 sobre ella y se mergea como R2b; la parte B sigue como R2c desde el paso 4,
con este mismo contrato y su propio cierre.

## 8. Criterios de aceptación

Son de la **parte B** los criterios 3, 7, 9, 12, 14 y 15, la parte de fecha de
los criterios 1, 8, 10, 11 y 13, y el recorrido 9. El resto es de la parte A.

1. **Los esquemas** — `reportGroupParams` pasa con `persona`, `proyecto`,
   `cliente` y `fecha`, y no con `Cliente`, `fechas` ni otro valor, con o sin un
   rango válido al lado; `REPORT_GROUP_PARAMS` se lee de vuelta para todas;
   `reportReadyState` admite los tipos de grupo nuevos y rechaza un atajo con un
   `id` desconocido.
2. **La aritmética de meses** — `monthStartKey` y `monthEndKey` con 0, ±1, ±12 y
   ±13 meses desde un día del medio del mes; febrero de 2024 (29) y de 2026 (28);
   diciembre a enero y enero a diciembre; desde el 31 de un mes de 31 días a un
   mes de 30. `monthStartKey("0100-01-15", −1)` y `monthEndKey("9999-12-15", 1)`
   dan claves que `parseDayKey` rechaza. `wholeMonthCount`: 1 para un mes, 12
   para un año, 3 de noviembre a enero, 12 de marzo de 2023 a febrero de 2024
   (366 días); `null` si el inicio no es el día 1, si el fin no es el último día
   de su mes (también el 28 de febrero de 2024), si el fin es anterior al
   inicio; lanza con una clave inválida. Corre igual con `TZ=UTC` y en Buenos
   Aires.
3. **Los tramos** — `dayBuckets` de un día: un tramo y el fin al día siguiente;
   de una semana en Buenos Aires: siete inicios a 24 h; en `Europe/Madrid`, del
   24 al 26 de octubre de 2026, el 25 dura 25 h; del 28 al 30 de marzo de 2026,
   el 29 dura 23 h; en `Pacific/Apia`, del 2011-12-29 al 2011-12-31, el tramo del
   30 tiene el mismo inicio que el del 31; lanza con el fin anterior al inicio o
   una clave inválida. Corre igual con `TZ=UTC` y en Buenos Aires.
4. **Los atajos** (`period.test.ts`) — con hoy el jueves 2026-10-08 y el lunes
   como primer día, los nueve períodos de la tabla de D-R2b-2, en ese orden; con
   el domingo, los tres de semana empiezan el domingo; con hoy el 2024-02-10,
   «Este mes» termina el 29 y «Este año» tiene 366 días; con hoy el 2026-01-05,
   «Mes pasado» es diciembre de 2025 y «Año pasado», 2025; cada período de un
   atajo se rotula con su nombre; un mes entero que no es este ni el pasado, con
   sus días; con hoy el 9999-12-31, los atajos que terminan ese día o después
   —«Hoy», «Esta semana», «Últimas dos semanas», «Este mes» y «Este año»— no se
   ofrecen, y «Ayer», «Semana anterior», «Mes pasado» y «Año pasado» sí.
5. **Las flechas** (`period.test.ts`) — «Este mes» de octubre de 2026 va a
   septiembre (30 días) y a noviembre; febrero de 2026, a enero y a marzo; enero a
   marzo de 2026, a octubre a diciembre de 2025 y a abril a junio; «Este año»
   2024 (366 días) va a 2023 y a 2025 enteros; «Hoy», a «Ayer»; «Últimas dos
   semanas», 14 días; un período de 31 días que no es un mes entero, 31 días;
   noviembre de 9999 no tiene siguiente (diciembre terminaría el 9999-12-31) y un
   mes que empieza el 0100-01-01 no tiene anterior. Sin rango, el período es
   «Esta semana» con sus flechas a 7 días, como en R2a.
6. **Por cliente** (integración) — dos proyectos de un mismo cliente dan una
   fila con la suma; un cliente archivado cuenta; «Sin cliente» suma las
   entradas sin proyecto y las de un proyecto sin cliente; orden por duración,
   empate por nombre y «Sin cliente» después de un cliente de igual duración; el
   total y el facturable son la suma de los grupos e iguales a los de «Proyecto»
   en el mismo pedido. El test de la invariante B1
   (`service.integration.test.ts:526-540`) suma `client` a su bucle: el rango
   invertido y el de 367 días lanzan `RangeError` sin llamar a ninguna lectura.
7. **Por fecha** (integración) — en Buenos Aires, una fila por día con horas, en
   orden cronológico aunque un día posterior tenga más horas, con `label` de
   `weekdayLabel` y año cuando el día no es del año de hoy; un día sin horas no
   tiene fila; la entrada que empieza a las 23:59:59 de un día va a ese día y la
   de las 00:00 del siguiente, al siguiente; la que empieza el día anterior al
   rango no cuenta y la que empieza en el fin tampoco; el timer abierto no cuenta;
   «Año pasado» con una entrada el primero y otra el último día da dos filas; el
   total es el de «Persona» en el mismo pedido. El test de B1 suma `date` a su
   bucle y espía también `totalsByBucket`.
8. **Meses y cambios de horario** (integración, `Europe/Madrid`) — «Este mes» de
   octubre de 2026, pedido con el `range` de `shortcuts` y con hoy fijado en
   `now`: cuentan la entrada del 1 a las 00:30 y la del 31 a las 23:30 (ya en
   UTC+1), y no la del 30 de septiembre a las 23:30 ni la del 1 de noviembre a
   las 00:30. Por fecha (B), en la semana del atraso, la entrada del 25 a las
   23:30 es del 25 y la del 26 a las 00:30, del 26; en marzo de 2026, la del 29 a
   las 23:30 es del 29 y la del 30 a las 00:30 CEST (`2026-03-29T22:30Z`), del 30.
9. **El día que falta** (integración, `Pacific/Apia`) — del 2011-12-29 al
   2011-12-31, por fecha, con entradas el 29, el 31 y una justo en el corte
   repetido (`2011-12-30T10:00Z`, las 00:00 del 31): dos filas, la del 29 y la
   del 31, y la del corte cuenta en la del 31; sin fila para el 30; el total es
   el de «Persona».
10. **La medida** (ADR 0021) — las cuatro entradas con microsegundos del
    criterio 8 de R2a, agrupadas por cliente (A) y por fecha (B): la fila del día
    y el total son el `closedSeconds` de `getTimesheetState`, y el facturable
    suma solo las facturables.
11. **El alcance** (`scope.integration.test.ts`) — por cliente (A) y por fecha
    (B), con el fixture del criterio 4 de R2a: owner y admin de A ven las horas
    de todas las personas de A, también la del member inactivo, cuyas horas
    cuentan, y nada de B; `project_manager`, `team_manager` y `member` ven solo
    lo propio en A, también con un pedido que arma un admin con `agrupar=fecha` o
    `agrupar=cliente` y `personas=…`; el owner de B no ve nada de A. Con una
    membresía `inactive` o `invited`, `{ kind: "forbidden" }` sin llamar a
    `totalsByProject` ni a `totalsByBucket` (espía).
12. **El tipo** — `scope.test-d.ts` suma `totalsByBucket` sin alcance, con
    `undefined` y con `null`, cada una con `// @ts-expect-error` y su motivo.
13. **La pantalla** (unidad, `renderToStaticMarkup`) —
    - `report-toolbar.test.tsx`: los enlaces de agrupación en orden, cada uno
      con el rango; la elegida con `aria-current` y las otras sin él, para
      `cliente` (A) y para `fecha` (B).
    - `range-picker.test.tsx`, sobre `RangePanel`: la lista nombrada «Atajos» con
      los rótulos de `shortcuts` en orden; cada `href` es el de `reportHref` con
      el rango del atajo y la agrupación recibida; exactamente un enlace con
      `aria-current="true"`, el del atajo cuyo rango es `range`, y ninguno si
      `range` no es de ningún atajo; con `shortcuts: []`, ninguna lista.
    - `report-view.test.tsx`: el encabezado «Cliente» (A) y «Fecha» (B); la fila
      de un cliente y «Sin cliente» en gris; la fila de una fecha con el `label`
      dentro de `<time dateTime>`; el vacío por fecha.
14. **El rendimiento** (§6) — Q5 y Q6 dentro del presupuesto; Q1 a Q4 como en
    R2a; la mediana de `dayBuckets` en el informe.
15. **Neon** (§6.3) — la comprobación del usuario pasó, con el SHA anotado y el
    driver tal como quedó en la rama.
16. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`, `next
build` y la suite e2e entera, al cierre de la parte A y al de la B. Ninguna
    afirmación existente cambia de texto; la del rótulo del recorrido 4 de R2a
    cambia de valor por `rangeLabel` (§1).
17. **La pantalla de punta a punta** — los recorridos de §8.2.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                                                    | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad      | `report/schema.test.ts`                                                    | `cliente` sin entrada en `REPORT_GROUP_PARAMS`; la comparación sin distinguir mayúsculas                                                                                                                                                                                                                                                                                                                               |
| 2        | unidad      | `time.test.ts`                                                             | `Date.UTC` con el año de dos cifras sin corregir; `monthEndKey` con el día 0 del mismo mes; `wholeMonthCount` sin comprobar el último día; `monthStartKey` sumando 30 días por mes                                                                                                                                                                                                                                     |
| 3        | unidad      | `time.test.ts`                                                             | los inicios como el primero más `i × 24 h`; los cortes deduplicados; el fin como el último inicio más 24 h; `dayBuckets` con la zona del proceso                                                                                                                                                                                                                                                                       |
| 4        | unidad      | `report/period.test.ts`                                                    | «Este mes» de 30 días fijos; «Mes pasado» como los 30 días antes de hoy; «Últimas dos semanas» como los 14 días hasta hoy; «Este año» de 365 días; el primer día fijo en lunes; un atajo inválido ofrecido; el rótulo del atajo sin reconocer (siempre de días)                                                                                                                                                        |
| 5        | unidad      | `report/period.test.ts`                                                    | la flecha de un mes por días; `wholeMonthCount` ignorado para más de un mes; el destino sin validar                                                                                                                                                                                                                                                                                                                    |
| 6        | integración | `report/service.integration.test.ts`                                       | una fila por proyecto sin plegar; «Sin cliente» solo para lo que no tiene proyecto; «Sin cliente» primero en el empate; el cliente archivado filtrado; la lectura por cliente antes de la invariante                                                                                                                                                                                                                   |
| 7        | integración | `report/service.integration.test.ts`                                       | el orden por duración; los días sin horas como filas en cero; el tramo sin restar uno; sin `closedIn` (la de antes del rango cae en el tramo 0 y lanza; la del fin, en el último); el día cortado en UTC; `dayKeyLabel` en vez de `weekdayLabel`; la lectura antes de la invariante (cae con el pedido de 367 días). «`dayBuckets` antes de la invariante» es de costo, no de comportamiento: ningún test lo distingue |
| 8        | integración | `report/service.integration.test.ts`                                       | el fin del mes sumando milisegundos al inicio; los tramos sumando 24 h (la del 30 de marzo a las 00:30 cae en el 29)                                                                                                                                                                                                                                                                                                   |
| 9        | integración | `report/service.integration.test.ts`                                       | los cortes deduplicados (las horas del 31, también la del corte, quedan en la fila del 30); `width_bucket` reemplazado por una comparación que manda el corte repetido al primero de los iguales                                                                                                                                                                                                                       |
| 10       | integración | `report/service.integration.test.ts`                                       | en la subconsulta, `floor` del total del tramo en vez de por entrada; sin `date_trunc`                                                                                                                                                                                                                                                                                                                                 |
| 11       | integración | `report/scope.integration.test.ts`                                         | `totalsByBucket` con solo el `workspace_id` (sin `inScope`); sin `workspace_id`; el plegado por cliente sobre una lectura sin alcance; `membership.status = 'active'` en alguna de las dos (cae la fila del inactivo)                                                                                                                                                                                                  |
| 12       | tipos       | `report/scope.test-d.ts`                                                   | el alcance de `totalsByBucket` opcional, `\| undefined` o `\| null`                                                                                                                                                                                                                                                                                                                                                    |
| 13       | componente  | `report-toolbar.test.tsx`; `range-picker.test.tsx`; `report-view.test.tsx` | `aria-current` en todos los atajos o en ninguno; el `href` del atajo sin la agrupación; la lista dibujada con `shortcuts` vacío; el enlace de «Fecha» sin el rango; el encabezado fijo en «Persona»; la fecha como `dayKey` crudo                                                                                                                                                                                      |
| 14, 15   | manual      | informe de `backend-dev`; comprobación del usuario                         | —                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 16       | todas       | las suites existentes                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 17       | e2e         | `e2e/reports.spec.ts`                                                      | los del final de §8.2                                                                                                                                                                                                                                                                                                                                                                                                  |

**Mutante declarado equivalente:** pasar los `Date` dentro del arreglo en vez
del texto ISO. Con el proceso en UTC, como Vercel y los tests, el driver los
formatea con desplazamiento `+00` y el instante es el mismo; el texto ISO queda
por D-R2b-7. Antes de darlo por equivalente, `test-engineer` corre los criterios
7 a 9 con el mutante también con `TZ=America/Argentina/Buenos_Aires` en el
proceso de integración y anota que las respuestas son las mismas. **Cualquier
otro mutante declarado equivalente** se prueba antes con pedidos de una
membresía inactiva, de otro workspace y de un member con horas ajenas en el
rango (lección del 11b).

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los seis de R2a no cambian. Se suman tres, con la regla de
§8.3 de R2a; las entradas van en la semana anterior a la de hoy, en la zona de la
persona, y se siembran antes de abrir la pantalla. Los períodos y rótulos
esperados se calculan con `days.ts`.

7. **Los atajos eligen el período y las flechas siguen sus meses** (RP-20,
   RP-24; parte A). Sin sembrar. Los atajos se eligen con `shortcutLink`, dentro
   del popover, y **el popover está cerrado antes de cada `periodLink`**: con el
   popover abierto, «Esta semana» tiene dos enlaces —el de la barra y el atajo— y
   el modo estricto de Playwright falla. Desde `/reportes`, «Proyecto». El
   selector abierto: la lista «Atajos» con los nueve rótulos en orden y «Esta
   semana» con `aria-current`. «Mes pasado»: **el popover se cierra, el foco
   está en el botón del período**, y la URL y el rótulo son los del mes pasado
   (es el único lugar donde se prueba el cierre y el foco, D-R2b-10). «Período
   anterior»: el mes entero anterior, con su rango de días como rótulo. «Período
   siguiente» dos veces: «Este mes». «Hoy» y «Período anterior»: «Ayer». «Año
   pasado» y «Período siguiente»: «Este año». «Últimas dos semanas» y «Período
   anterior»: 14 días antes. «Proyecto» sigue marcado en cada paso.
8. **Por cliente, «Sin cliente» junta lo que no tiene proyecto y los proyectos
   sin cliente** (RP-11, RP-28, RP-32; parte A). La persona del test, member. P1
   con el cliente C y P2 sin cliente, con sufijo: P1 1:00 el martes y 0:30 el
   miércoles, P2 0:45 y una sin proyecto de 0:15 el jueves. Desde la semana
   anterior por persona, «Cliente»: la URL dice `agrupar=cliente` y el mismo
   rango; el encabezado «Cliente»; dos filas, C con 1:30 y después «Sin cliente»
   con 1:00; el total 2:30. Al recargar, la misma vista.
9. **Por fecha, una fila por día con horas, en orden y en la zona de quien mira**
   (RP-11, RP-22; parte B). La persona del test, member, con horas el martes
   (09:00 a 09:20 y 14:00 a 14:10), el jueves (10:00 a 11:45) y el viernes (23:30
   a 23:50, que en UTC es sábado). En la semana anterior, «Fecha»: el encabezado
   «Fecha»; tres filas en este orden: el martes con 0:30, el jueves con 1:45 y el
   viernes con 0:20, cada una rotulada con `weekdayLabel`; ninguna del miércoles
   ni del sábado; el total 2:35. «Período anterior»: «Fecha» sigue marcado y la
   tabla muestra el vacío.

Los mutantes que tienen que caer en e2e: «Mes pasado» como los 30 días antes de
hoy; la flecha de un mes por días; el atajo que no cierra el popover; el foco
que no vuelve al botón; el atajo sin la agrupación; una fila por proyecto en
«Cliente»; «Sin cliente» solo para lo que no tiene proyecto; la fecha cortada en
UTC; las fechas por duración.

### 8.3 La regla de los e2e

La de §8.3 de R2a, sin cambios. Los recorridos 8 y 9 afirman el total y «Sin
cliente» porque el alcance es propio; ninguno afirma sobre el workspace.

### 8.4 Lo que no se prueba en e2e

- **Cambios de horario, el día que falta, años bisiestos y los años límite**:
  criterios 2 a 5, 8 y 9.
- **Por cliente y por fecha con alcance `everyone`**: criterio 11; en e2e no son
  reproducibles (§8.3 de R2a).
- **El driver de Neon**: los e2e corren contra Postgres local; es §6.3.
- **El volumen de 366 tramos**: §6.1.
- **«Este año», «Semana anterior» y «Ayer» elegidos desde la lista**: el
  recorrido 7 ya pasa por los tres por las flechas o por el rótulo; cada atajo
  tiene su período en el criterio 4.

## 9. Riesgos y deuda conocida

- **El arreglo de cortes en `neon-serverless`** (mapa §3): la serialización es la
  misma por lectura de código (D-R2b-7), pero el ADR 0021 pide verlo en Neon. Sin
  la comprobación de §6.3, la parte B no se mergea.
- **«Últimas dos semanas»** puede no ser lo que hace Clockify (P-05); cambiarlo
  es una línea de `period.ts` y sus tests.
- **Un enlace no sigue al período en curso** (D-R2b-1): «Este mes» guardado como
  favorito muestra siempre el mismo mes.
- **Un mes entero que no es este ni el pasado se rotula con sus días**, no con
  su nombre.
- **Por fecha, los días sin horas no aparecen**: para ver quién no cargó un día
  hace falta R9 y la fecha como subnivel de R3.
- **`RangePicker` crece** con la lista de atajos; la deuda C5 de R2a (el
  `DayCalendar` compartido) lo sigue nombrando.
- **Dos lugares prueban el período**: los tests de R2a por integración y
  `period.test.ts` por unidad (D-R2b-4). Los de R2a no se reescriben.
- **El cierre del popover y el foco solo tienen e2e** (D-R2b-10): el arnés de
  unidad no tiene DOM.

## 10. Pendiente del usuario y preguntas abiertas

1. **La comprobación contra Neon** (ADR 0021, §6.3). **Decidida por el
   usuario**: se hace en el preview de la rama apenas `totalsByBucket` esté en
   ella, siempre antes del merge, y el SHA del preview se anota en el documento
   de revisiones. Sigue pendiente de que la haga.
2. **Qué es «Últimas dos semanas»** y si «Este mes» y «Este año» llegan hasta
   hoy o al fin del mes y del año (P-05, _no verificado_). **Queda lo de
   D-R2b-2** —la semana anterior y esta, alineadas; meses y años enteros— y se
   confirma en la próxima sesión en el workspace de Clockify. No bloquea.
3. **El tamaño del slice. Decidido por el team-lead**: un solo contrato en dos
   partes. Todo lo de fecha va en commits propios y al final, incluido el valor
   `date` de `REPORT_GROUP_BYS`, su tipo de grupo, `readGroups`, el enlace
   «Fecha», su fila y el e2e 9; los commits de atajos y de cliente compilan y
   pasan sin ellos (§7, orden). Si la comprobación de la pregunta 1 se demora,
   el team-lead puede mergear la parte A como R2b y seguir la B como R2c sin
   reescribir nada.

## 11. Fuera de alcance

- La granularidad de semana y de mes de los tramos y el gráfico: R5.
- Subgrupos, tarea y etiqueta: R3. Filtros y el segundo vacío: R4.
  Exportación: R6 y R7. Personas sin horas: R9.
- Un atajo que se guarde como período relativo en la URL (D-R2b-1).
- Atajos propios de quien mira, días hábiles, trimestres con nombre.
- Los días sin horas en la agrupación por fecha.
- El rótulo de un mes con su nombre.
- RP-14, RP-36, RP-09 y el importe y el porcentaje por grupo, como en R2a.
