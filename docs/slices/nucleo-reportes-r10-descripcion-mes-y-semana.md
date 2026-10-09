# Núcleo de reportes, R10: agrupar por descripción, mes y semana

Contrato del sexto slice del núcleo de reportes. Extiende la pantalla
`/reportes` y el módulo `src/modules/report/` de R4: suma la semana y el mes
como agrupaciones, cortadas con los tramos de `src/server/time`, y la
descripción, con el tope de 3000 filas extendido al primer nivel. Sin cambios
de tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-11 en el
  resto (descripción, mes y semana, documentados en la página de filtros de
  Clockify: «Project», «Client», «User», «Description», «Group», «Tag», «Month»,
  «Week» y «Date»), RP-12 (el orden dentro de cada nivel y las combinaciones),
  RP-24 (la semana empieza el día de quien mira) y RP-28 («Sin descripción»).
  Se apoya en RP-13, RP-18, RP-21, RP-22, RP-23, RP-25, RP-32 y RP-33 tal como
  los dejaron R2a a R4b.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R10».
  Entra por decisión del usuario del 2026-10-09 (P-11 de las revisiones de
  R3b). Depende de R3 y va en serie después de R4, que está entero en `main`
  (`ffebb27`), y antes de R5, que usa los tramos por semana y por mes de este
  slice (D-R10-12).
- **Dos partes, en este orden** (D-R10-1): la **parte A**, mes y semana, y la
  **parte B**, descripción, en commits propios al final. Los commits de la A
  compilan y pasan sin la B. El team-lead aceptó partirlo: la A se mergea como
  R10a y la B como R10b (§7).
- **Revisión del contrato:** la primera ronda de `architecture-reviewer` pidió
  cambios de texto, sin cambios de diseño; están aplicados: cuatro mutantes que
  los criterios no mataban (criterios 6, 15 y 17), el tope del primer nivel en
  D-R10-10 y D-R10-12 y los dos comentarios que quedan falsos (§1), dos casos
  de `weekBuckets` (criterio 1), las copias de §7, las citas de §0 y los
  helpers de e2e. La segunda pasada lo aprobó con dos notas de redacción,
  también aplicadas: de quién son las entradas del criterio 6 y la sección de
  R10b en `reportes.md`.
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): los tramos por
    día, semana o mes los calcula `src/server/time` en la zona de quien mira, y
    la consulta asigna cada entrada con `width_bucket` sobre un arreglo de
    `timestamptz`; «ninguna cuenta de zona horaria se escribe en SQL»; una sola
    foto en una transacción de solo lectura `repeatable read`.
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): toda
    lectura recibe el `ReportScope`, que solo arma el service.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): los rótulos que
    dependen de la zona se arman en el servidor con las funciones de
    `src/server/time`, con los formatos de `timeSettingsOf`.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    lo que solo se muestra se lee con `join` en el repository propio; la
    descripción es una columna de `time_entry`, que el repository del reporte
    ya agrega (excepción del ADR 0021).

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** Mes y
  semana siguen la opción 3 del ADR 0021, que ya descartó `date_trunc` (su
  opción 2). Extender el tope al primer nivel (D-R10-10) cambia una decisión de
  contrato de R3 (D-R3-6), no de un ADR. Lo que queda para el usuario o el
  team-lead está en §10.

Decisiones que el contrato da por tomadas (R2a a R4b, mapa §5, `reportes.md`
§8): solo owner y admin ven horas ajenas; un member con un enlace que nombra a
otras personas ve lo propio; el tope de 366 días y el de 3000 filas; hasta tres
niveles sin repetir, con «Ninguno» y el intercambio de D-R3-8; todo contraído al
cargar y en cada navegación, y lo abierto no va en la URL; los filtros de R4 se
aplican en cada nivel y en el total; «Sin …» como rótulo de lo que no tiene la
dimensión (RP-28); la regla de los e2e de §8.3 de R2a.

## Decisiones del contrato

**D-R10-1 — Dos partes.** Opciones: (1) un solo slice; (2) dos contratos; (3)
un contrato en dos partes, como R3 y R4. **(3).** Las dos partes comparten la
lista de agrupaciones, la tabla de dimensiones del repository, el orden de los
hermanos y los controles, pero cada una tiene un riesgo propio:

- **A, mes y semana**: que los tramos se corten en la zona y con el primer día
  de quien mira, y que un período que corta una semana o un mes lo diga. Trae
  `weekBuckets` y `monthBuckets` a `src/server/time`, que son los tramos que R5
  necesita para el gráfico (ADR 0021, «la granularidad del gráfico»).
- **B, descripción**: que un texto libre no mande al navegador miles de grupos
  ni textos de 3000 caracteres, y que es la primera vez que la pantalla muestra
  texto escrito por otra persona. Trae el tope en el primer nivel (D-R10-10),
  que cambia una decisión de R3, y pide la revisión de seguridad completa.

La A va primero porque es de menor riesgo, no toca ninguna decisión anterior y
desbloquea R5 aunque la B se demore. Partirlo en dos contratos obligaría a fijar
dos veces la lista de agrupaciones y la forma de los tramos.

**D-R10-2 — Mes y semana se cortan con los tramos de `src/server/time`.**
Opciones: (1) `date_trunc('week' | 'month', started_at at time zone $zona)` en
SQL; (2) los cortes del ADR 0021: `src/server/time` arma el inicio de cada
semana o mes en la zona de quien mira y la consulta asigna cada entrada con
`width_bucket(started_at, $cortes::timestamptz[])`, como la fecha desde R2b;
(3) leer por día y juntar los días en semanas y meses en el service. **(2).**

- (1) es la opción 2 que el ADR 0021 descartó: el corte quedaría escrito con la
  base de zonas de Postgres además de la de ICU, y `date_trunc('week', …)`
  empieza siempre el lunes, así que no sigue el primer día de quien mira
  (RP-24) sin aritmética de días en SQL. Los cambios de horario y el día que
  falta entero ya los resuelve `startOfDayKey`.
- (3) rompe el tope: el `limit` de un nivel contaría días y no semanas, y una
  semana como segundo nivel obligaría a traer las filas por día de cada grupo
  de arriba.
- Con (2) no hay forma de parámetro nueva (D-R10-7): cada dimensión de tiempo
  pasa su arreglo de cortes con `sql.param`, una vez, en la subconsulta por
  entrada, igual que la fecha (`report/repository.ts:455-467`).

**D-R10-3 — Un tramo es la semana o el mes cortado por el período, y lo dice.**
El primer tramo empieza el primer día del período aunque su semana o su mes
empiece antes, y el último termina el último día del período. La lectura nunca
sale del período (RP-21, RP-23): «Este mes» por semana no suma días de otro mes.

- **El rótulo es el de la unidad entera**: la semana, «28/09 – 04/10» con
  `dayRangeLabel` del primer al séptimo día (con año si algún extremo no es del
  año de hoy), sin «Esta semana» ni «Semana anterior», como la fecha va sin
  «Hoy» ni «Ayer» (D-R2b-6); el mes, «octubre», o «octubre de 2025» si no es
  del año de hoy, con `monthLabel`, nueva.
- **`partial`**: si el grupo no cuenta la unidad entera, los días que cuenta,
  con `dayRangeLabel`: «01/10 – 04/10», o «01/10» si es uno. La pantalla lo
  muestra en gris después del rótulo, como «solo 01/10 – 04/10». **Los días que
  cuenta son los del tramo cortados por el período y por cada grupo de tiempo
  de arriba en su camino, no solo por el padre**: debajo de «septiembre», la
  semana «28/09 – 04/10» dice «solo 28/09 – 30/09», porque el árbol agrupa por
  las dos claves y esa fila solo suma esos días; en Mes → Persona → Semana dice
  lo mismo, aunque su padre sea una persona.
- Opciones descartadas: (1) rotular solo con los días que cuenta: un mes
  cortado perdería su nombre, y «01/10 – 04/10» no dice que es una semana
  cortada; (2) estirar la lectura a semanas o meses enteros: el total dejaría
  de ser el del período de la cabecera.
- **Sin línea del primer día de la semana** al lado de la de la zona (D-R2a-5):
  la zona no se ve en ninguna fila, pero el primer día sí, porque cada fila de
  semana dice sus días.

**D-R10-4 — Los tramos de cada dimensión: `ReportBuckets`.** `ReportLevelRead`
cambia `buckets: TimeBuckets | null` por un registro con una clave por dimensión
de tiempo pedida: `{ date?, week?, month? }`. Opciones descartadas: dos campos
opcionales nuevos al lado de `buckets` (`weeks`, `months`), que dejan a la fecha
con un nombre que ya no dice de qué es; y un solo arreglo de cortes por día con
un mapa de día a semana en SQL, que pasa un arreglo de enteros, una forma de
parámetro nueva. Con el registro, cada dimensión de tiempo es la misma función
con su clave (§4.3), y las guardas de R3 valen para cada una.

**D-R10-5 — El orden y el lugar.**

- **Semana y mes en orden cronológico**, como la fecha (D-R2b-6), aunque una
  posterior tenga más horas. Es el mismo desvío del orden por duración: una
  línea de tiempo ordenada por duración no se lee.
- **«Agrupar por» suma los enlaces al final**: «Persona», «Proyecto»,
  «Cliente», «Tarea», «Etiqueta», «Fecha», «Semana», «Mes» (A) y «Descripción»
  (B). Cada parte solo agrega: el orden de R2a a R4 no se mueve, y la fecha, la
  semana y el mes quedan juntos de menor a mayor. El orden de Clockify en
  pantalla sigue _no verificado_ (P-05).
- **En la URL, `semana`, `mes` y `descripcion`**, en ASCII y sin tilde, como
  `sin-proyecto`. `descripción` con tilde, `Semana` o `meses` se descartan como
  cualquier otro valor (RP-32).

**D-R10-6 — Las combinaciones.** Valen todas las de hasta tres niveles sin
repetir, como en R3 (RP-12): nueve dimensiones, 9 × 8 × 7 ternas. Una de
tiempo debajo de otra es la intersección: Mes → Semana pone la semana que cruza
el fin de mes debajo de los dos meses, cada vez con su parte y su «solo …»;
Semana → Mes pone debajo de esa semana sus dos meses; Semana → Fecha y Mes →
Semana → Fecha son las útiles; Fecha → Semana da un hijo por día, correcto y
poco útil. Opción descartada: permitir solo de mayor a menor. Suma una regla a
`reportSubgroupParams`; el intercambio de `withLevel` produciría combinaciones
prohibidas («Fecha» en «Agrupar por» desde Mes → Fecha da Fecha → Mes), y lo
que hace Clockify está _no verificado_.

**D-R10-7 — Sin comprobación contra Neon.** La de §6.3 de R2b se pidió por una
forma de parámetro nueva, el arreglo de `timestamptz`, y pasó el 2026-10-08
(`correcciones-nucleo-reportes-r2b-revisiones.md:104-113`): `neon-serverless`
pasa el arreglo como un solo parámetro. R10 no trae ninguna forma nueva:

- **la semana y el mes pasan el mismo arreglo** (`sql.param` de las cadenas ISO
  con `::timestamptz[]`). Con Mes → Semana → Fecha la sentencia del tercer
  nivel lleva tres, cada uno su propio `$n`. Cada parámetro se serializa por
  separado (`@neondatabase/serverless` reusa el código de `pg` para eso), así
  que dos o tres arreglos del mismo tipo en una sentencia no son una forma
  distinta de uno;
- **la descripción** agrupa por una columna, sin parámetros; lo que se muestra
  usa `left`, `char_length`, `sha256`, `convert_to` y `encode`, funciones de
  Postgres sin parámetros salvo el largo, un entero escalar como el `limit`
  que ya corre desde R3b;
- **el tope del primer nivel** es un `limit $n` más, la forma de R3b.

Si `backend-dev` necesita otra forma (`unnest`, un arreglo de enteros), avisa y
la comprobación vuelve con el procedimiento de §6.3 de R2b, antes del merge.

**D-R10-8 — La clave de la descripción es el texto exacto.** Opciones: (1) el
texto tal como está guardado; (2) normalizado en SQL, con `lower()` y los
espacios repetidos colapsados; (3) normalizado en JS con `normalizeSearch`.
**(1).**

- (2) depende de la colación y del `ctype` de la base para todo lo que no es
  ASCII: el mismo texto podría agrupar distinto en Neon y en
  `postgres:18-alpine`, el mismo problema de dos fuentes que el ADR 0021 evitó
  con las zonas. Además obliga a elegir qué texto muestra un grupo que junta
  «Reunión» y «reunión».
- (3) obliga a traer el texto de cada entrada a JS, la opción 1 descartada por
  el ADR 0021.
- **Con (1), `group by` sobre `text` es igualdad de bytes**: la colación por
  omisión es determinista en Neon y en el Postgres de los tests, y Postgres no
  da por iguales dos textos deterministas con bytes distintos. El resultado no
  depende del entorno.
- **Lo que eso significa para quien mira**: «Reunión» y «reunión» son dos
  grupos; «Reunión semanal» con dos espacios en el medio es otro; una «é»
  compuesta y una descompuesta (NFC y NFD) son dos. Los espacios de los bordes
  no, porque la aplicación guarda la descripción recortada desde el slice 1
  (`time-entry/schema.ts:60-64`); una fila con espacios de borde solo puede
  venir de SQL escrito a mano, forma su grupo y su `text` conserva el espacio.
- **«Sin descripción» es la cadena vacía**, la única representación de «sin
  descripción» (`server/db/schema.ts:414-415`), con el rótulo del rastreador
  (`trackerLabels.noDescription`, TT-50).
- Es la pregunta 2 de §10; el contrato sigue con (1) mientras no haya
  respuesta.

**D-R10-9 — Lo que viaja de una descripción, y lo que no.** Cada grupo de
descripción lleva:

- **`id`**: los 32 primeros caracteres hexadecimales del SHA-256 del texto
  entero en UTF-8, calculados en la sentencia sobre la fila ya agrupada. Es la
  clave del grupo en el árbol del service (el camino) y en el del navegador
  (`groupKey`).
- **`text`**: los primeros `REPORT_DESCRIPTION_SHOWN` (100) caracteres, contados
  en puntos de código como `left()` de Postgres.
- **`truncated`**: si el texto entero es más largo; la pantalla agrega «…».

Por qué un hash y no el texto: una descripción llega a 3000 caracteres
(`time_entry_description_len`), y un nivel puede tener 3000 grupos; el texto
entero como clave son hasta 9 MB por nivel desde la base y en el payload. Por
qué no el texto recortado y su largo como clave: dos textos que comparten los
100 primeros caracteres y el largo chocarían, el árbol colgaría hijos del grupo
equivocado o lanzaría «Una fila … sin su grupo de arriba», y un member puede
escribir esas dos descripciones a propósito y romper el reporte de un admin.
Por qué SHA-256 y no MD5: las colisiones de MD5 se fabrican; las del prefijo de
128 bits de SHA-256, no.

**No va en la URL**: lo abierto no viaja (D-R3-6, D-R3-9) y no existe un
parámetro de lo expandido. Si algún día viaja (pregunta 2 de §10 de R3), lleva
el `id`, nunca el texto. Filtrar por descripción (RP-25, fase 3) es buscar
palabras en el texto, un parámetro aparte que no usa el `id`.

**D-R10-10 — El tope alcanza al primer nivel.** R3 dejó el primer nivel sin
tope porque lo acotaba el catálogo de su dimensión (D-R3-6). La descripción no
tiene catálogo: en el volumen de §6, un año del equipo son unos 12 700 textos
distintos. Opciones:

1. el primer nivel sin tope, como hoy: 12 700 filas al navegador;
2. el tope solo para el primer nivel por descripción;
3. **el tope para todo primer nivel**: se pide con `limit: REPORT_MAX_ROWS + 1`
   y, como cada nivel de abajo, entra entero o no entra;
4. los primeros por duración y una fila «Otras descripciones» con el resto;
5. la descripción solo como subnivel.

**(3).** (2) es la misma maquinaria con una excepción por dimensión. (4) pide
`order by` en la sentencia y una fila que no es un grupo, que el árbol, expandir
y la exportación tendrían que tratar aparte. (5) no resuelve nada: como subnivel
ya tiene tope, y «en qué se fue el tiempo» es una pregunta de primer nivel.

- **Si el primer nivel no entra**, no se lee ningún nivel, `groups` queda vacío
  y `levelsShown` es 0. El total y el facturable salen de `entryTotals`, como
  por etiqueta: sin el nivel 1 no hay suma. La tabla dice «El primer nivel pasa
  de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá por otra
  cosa.» en lugar de las filas. `reportReadyState` exige `groups` vacío con
  `levelsShown: 0` (§4.1).
- **Para las otras dimensiones no cambia nada visible**: el primer nivel de
  persona, proyecto, cliente, tarea, etiqueta, fecha, semana o mes no pasa de
  3000 en ningún workspace de la escala del proyecto. Cambia el `limit` de su
  lectura: las dos afirmaciones de R3b que lo miran pasan de `[undefined, 2701]`
  a `[3001, 2701]` (§1).
- **Cambia la forma de una deuda de R3** (§9 de R3: «R6 y R7 … tienen que
  tratar un primer nivel de más de 3000 filas»): ningún nivel del estado pasa
  del tope, y lo que R6 y R7 tienen que tratar es un estado con
  `levelsShown: 0`, sin grupos. Qué exportan entonces lo decide su contrato
  (D-R10-12).
- **Dos comentarios quedan falsos** y se corrigen en la B (§1): el de
  `REPORT_MAX_ROWS` («Acota lo que se lee de los niveles 2 y 3, no el primero»,
  `schema.ts:99-102`) y el JSDoc de `readLevelsWithinLimit` («desde el primero,
  que se lee entero», `service.ts:436-441`).

**D-R10-11 — Lo que hereda de R3 y R4.**

- **Los filtros** no son una dimensión (D-R4-3): van en la subconsulta por
  entrada con `matchesFilter`, que R10 no toca, así que cada nivel nuevo y el
  total son los de lo filtrado, y el tope cuenta lo filtrado. Los criterios 6 y
  16 lo afirman con una dimensión nueva en cada nivel.
- **El alcance** es `inScope`, sin cambios. Un member que agrupa por
  descripción ve solo sus textos; con `personas=…` en la URL, lo propio
  (D-R4-4).
- **Los atajos de R2b** son unidades enteras del calendario alineadas a quien
  mira: «Esta semana», «Semana anterior» y «Últimas dos semanas» por semana dan
  semanas enteras; «Este mes» y «Mes pasado» por mes, un mes entero; «Este año»
  por mes, doce meses enteros, y por semana, la primera y la última cortadas.
  Un rango libre corta lo que corte. Las flechas no cambian.
- **El segundo vacío** (D-R4-7) no cambia: sin grupos y con filtros. Con
  `levelsShown: 0` no hay vacío: hay horas que no se muestran.
- **Los enlaces** conservan todo con `reportHref`, que no cambia: los valores
  nuevos viajan en `agrupar` y `subagrupar`.
- **Expandir** no cambia: `groupKey` suma la semana (`weekStart`), el mes
  (`monthStart`) y la descripción (`id` o `sin-descripcion`); la clave de una
  fila sigue siendo la del padre más la suya, así que la misma semana debajo de
  dos meses son dos claves.

**D-R10-12 — Lo que no traba a los slices que siguen.**

- **R5, gráfico**: lee `totalsByLevels` con `[date]`, `[week]` o `[month]` y
  los tramos de `dayBuckets`, `weekBuckets` o `monthBuckets`, según la
  granularidad del ADR 0021. Las barras sin horas las completa con los tramos;
  la primera y la última cortadas se rotulan con `partial`. No necesita otra
  función de tiempo ni otra lectura.
- **R6 y R7, exportación**: reciben un árbol que nunca pasa de 3000 filas. Lo
  que exportan con `levelsShown: 0` —el aviso, las entradas una por una o los
  dos— lo decide su contrato; R10 no lo fija. Una fila de semana o de mes se
  exporta con `label` y `partial`; una de descripción, con `text` y la marca de
  recortada, como en pantalla. El texto entero va en la exportación de las
  entradas una por una (mapa §5). La regla de inyección de fórmulas del mapa
  (R6) alcanza a la descripción, que es texto libre de otras personas.
- **R9, personas sin horas**: suma grupos de persona sin horas al primer nivel.
  Si cuentan para el tope del primer nivel lo decide R9 en
  `readLevelsWithinLimit`, el único lugar de la regla.
- **Filtrar por descripción (fase 3)**: un parámetro propio de texto, aparte de
  las listas de ids de D-R4-2.

**D-R10-13 — Volumen.** La A mide semana, mes y el pedido Mes → Semana → Fecha
de todo el equipo en 366 días, con tres arreglos de cortes. La B suma
descripciones a `seed.sql` sin tocar las entradas ni sus instantes, mide la
descripción en un año (no entra) y en un mes (entra), vuelve a medir tres
lecturas de primer nivel con el `limit` nuevo y mide el peso de una página con
3000 descripciones en el primer nivel (§6). Ningún índice nuevo sin una medición
que lo pida (§6.5 de R3).

**D-R10-14 — Los e2e de R10.** Heredan §8.3 de R2a. Los cuatro recorridos son de
alcance propio. Los de la A usan un período fijo de 2025, para que los cortes de
semana y de mes caigan siempre en los mismos días, y cambian el primer día de la
semana de la persona del recorrido con un helper nuevo, `setWeekStart`, sobre su
propia membresía y nunca sobre la del owner (`OWN_MEMBERSHIP`,
`e2e/database.ts:452-454`). La B siembra 3001 entradas de un minuto con un helper
de SQL: el tope del primer nivel es reproducible con una sola persona.

**D-R10-15 — Lo que se prueba en unidad y lo que no.** Como D-R3-13: el arnés es
`renderToStaticMarkup` sin DOM. En unidad van los tramos y los rótulos de
`src/server/time` (en UTC y en Buenos Aires), los esquemas, las filas nuevas de
la tabla y la fila del primer nivel cortado. Que el enlace navegue, que se
expanda y que la URL se conserve son de los e2e.

## 0. Precondición de arranque

- **`main` en `ffebb27`**, con R4a y R4b mergeados. Las citas de abajo son de ese
  árbol. Los tests de integración y CI usan `postgres:18-alpine`; Neon también
  es 18. Todo test de tiempo fija reloj y zona.
- **Sin pendientes del usuario para arrancar.** No hay comprobación contra Neon
  (D-R10-7). Las preguntas de §10 no bloquean.
- **La zona de los tests de tiempo**: `test:unit` corre en UTC y `test:time-ar`
  en Buenos Aires sobre `src/server/time` (`package.json:16`). Las funciones
  nuevas viven ahí, así que corren en las dos zonas de proceso sin cambiar el
  script. Los tests de integración fijan la zona del perfil en `settings`
  (Buenos Aires, Madrid, Samoa) con el proceso en UTC.

### Supuestos sobre el árbol, con archivo y línea en `ffebb27`

| Supuesto                                                                                                                                                                                                                                    | Dónde                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPORT_GROUP_BYS` son seis, en el orden de los enlaces; `REPORT_GROUP_PARAMS` los traduce; `groupByOfParam` distingue mayúsculas; `reportGroupParams` y `reportSubgroupParams` leen el mapa                                                | `src/modules/report/schema.ts:65-97`, `:118-135`                                                                                                                                         |
| `REPORT_MAX_ROWS = 3000`, con un comentario que dice que no acota el primer nivel; los grupos se arman con `withChildren`; `reportDateGroup` tiene `dayKey` y `label`; `reportGroup` es la unión de seis                                    | `schema.ts:99-103`, `:330-341`, `:392-399`, `:401-408`                                                                                                                                   |
| `reportReadyState.levelsShown` es de 1 a 3                                                                                                                                                                                                  | `schema.ts:427`                                                                                                                                                                          |
| `LevelGroupRow` tiene `date` con `bucket`; `ReportLevelRead.buckets` es `TimeBuckets \| null`                                                                                                                                               | `src/modules/report/repository.ts:53-83`, `:118-125`                                                                                                                                     |
| La tabla `DIMENSIONS` describe cada dimensión una vez con `key`, `joinInside`, `joinOutside`, `shown` y `groupOf`; la fecha pasa los cortes con `sql.param` y `::timestamptz[]`; `bucketsOf` lanza sin ellos                                | `repository.ts:258-273`, `:313-468` (`:455-467`), `:474-479`                                                                                                                             |
| `checkLevelRead` exige `buckets` si y solo si está la fecha, no vacíos y que cubran el `span`                                                                                                                                               | `repository.ts:503-532`                                                                                                                                                                  |
| `matchesFilter` va en la subconsulta por entrada de `totalsByLevels` y de `entryTotals`, junto a `inScope` y `closedIn`; `limit` va en la sentencia de afuera                                                                               | `repository.ts:169-194`, `:589-593`, `:617-619`, `:647`                                                                                                                                  |
| `groupOf` del service rotula la fecha con `weekdayLabel`; `NamedGroup` excluye solo la fecha; `compareSiblings` ordena los días por fecha y el resto por duración y nombre; `groupKeyOf` da el índice del tramo                             | `src/modules/report/service.ts:145-181`, `:184`, `:226-234`, `:356-371`                                                                                                                  |
| `treeOf` cuelga cada fila por su camino entero; `groupsOf` lanza con un grupo sin hijos en un nivel que se muestra                                                                                                                          | `service.ts:387-434`                                                                                                                                                                     |
| `readLevelsWithinLimit` lee el nivel 1 sin `limit`, y su JSDoc lo dice («desde el primero, que se lee entero»); con el nivel 1 vacío no lee más                                                                                             | `service.ts:436-465` (`:446-449`)                                                                                                                                                        |
| `readReport` saca el total de `entryTotals` solo con la etiqueta primero; si no, suma el nivel 1                                                                                                                                            | `service.ts:524-534`                                                                                                                                                                     |
| `getReportState` arma los tramos solo con la fecha, con `dayBuckets(range.first, range.last, timeZone)`; `levelsShown` es `levels.length` con el nivel 1 vacío                                                                              | `service.ts:580-582`, `:593`                                                                                                                                                             |
| `TimeSettings` trae `weekStart`; `timeSettingsOf` lo toma de `weekStartOf` (PF-01), nunca de la membresía directo                                                                                                                           | `src/server/time/index.ts:26-30`; `src/modules/profile/service.ts:137-146`                                                                                                               |
| `TimeBucket` es `{ firstDay, start }` y `TimeBuckets` `{ buckets, end }`; `dayBuckets` arma un tramo por día con `startOfDayKey`                                                                                                            | `src/server/time/index.ts:443-470`                                                                                                                                                       |
| `startOfDayKey` resuelve la medianoche que no existe (Santiago, 2026-09-06, a la 01:00) y el día que falta entero (Samoa); `weekStartKey`, `monthStartKey`, `monthEndKey` y `dayRangeLabel` son aritmética civil sin zona                   | `src/server/time/index.ts:418-433`, `:401-408`, `:218-229`, `:521-538`; `src/server/time/time.test.ts:212-227`                                                                           |
| `membership.week_start` es de 0 (domingo) a 6, lunes por omisión                                                                                                                                                                            | `src/server/db/schema.ts:110-111`, `:121`                                                                                                                                                |
| `time_entry.description` es `text not null default ''`; la cadena vacía es «sin descripción»; hasta 3000 caracteres                                                                                                                         | `src/server/db/schema.ts:414-415`, `:446`                                                                                                                                                |
| La aplicación guarda la descripción recortada en todas las altas y ediciones                                                                                                                                                                | `src/modules/time-entry/schema.ts:60-64`, `:104`, `:115`, `:152`, `:269`, `:317`                                                                                                         |
| «Sin descripción» es `trackerLabels.noDescription`                                                                                                                                                                                          | `src/modules/time-entry/components/labels.ts:19`                                                                                                                                         |
| `GroupHeading` y `groupKey` resuelven `kind` con `switch` exhaustivos; `groupByLabels` es `satisfies Record<ReportGroupBy, string>`: una agrupación nueva no compila sin su caso                                                            | `components/group-heading.tsx:24-39`; `components/report-tree-model.ts:16-31`; `components/labels.ts:116-123`                                                                            |
| `ReportView` arma el encabezado con los niveles que se muestran, dibuja la línea del tope si se muestran menos que los pedidos y el vacío si no hay grupos                                                                                  | `components/report-view.tsx:27-28`, `:57-59`, `:74-88`                                                                                                                                   |
| La barra dibuja un enlace por cada valor de `REPORT_GROUP_BYS`; `levelOptions` ofrece en ese orden lo que no está arriba                                                                                                                    | `components/report-toolbar.tsx:94-102`; `components/grouping-model.ts:56-62`                                                                                                             |
| Afirman la lista de agrupaciones en orden: la barra, los subniveles y `levelOptions`                                                                                                                                                        | `report-toolbar.test.tsx:127-158`, `:163-170`, `:189-196`, `:204-211`, `:223-230`; `subgroup-picker.test.tsx:50-128`; `grouping-model.test.ts:65-105`                                    |
| `service.integration.test.ts` recorre `REPORT_GROUP_BYS` con actores activos; arma lecturas directas con `buckets: null`; lee `read.buckets` como `TimeBuckets`; afirma `[undefined, 2701]`                                                 | `src/modules/report/service.integration.test.ts:488`, `:2009`; `:1149-1198`, `:1295`, `:1325`, `:1382`, `:2494`, `:2516`; `:1436-1448` (`buckets.buckets[…]`), `:2053`; `:1757`, `:1774` |
| `scope.integration.test.ts` recorre `REPORT_GROUP_BYS` (`groupBys`); `summaryOf`, `rowsOf`, `everyoneInAGroups`, `keyOfGroup` y `keysOfEntry` resuelven la dimensión con `switch`                                                           | `src/modules/report/scope.integration.test.ts:88`, `:350-380`, `:386-412`, `:452-487`, `:533-569`                                                                                        |
| `scope.test-d.ts` arma una lectura con `buckets: null`; `schema.test.ts` afirma `REPORT_GROUP_BYS`                                                                                                                                          | `src/modules/report/scope.test-d.ts:18`; `src/modules/report/schema.test.ts:213`                                                                                                         |
| e2e: `ReportGroupBy` y `GROUP_LINK` con seis; un recorrido afirma la lista entera de «Agrupar por» y otro la del segundo nivel                                                                                                              | `e2e/reports-page.ts:92-106`; `e2e/reports.spec.ts:723-725`, `:832-839`                                                                                                                  |
| e2e: `seedEntries` acepta `description`; `setRole` y `setMembershipStatus` cambian la membresía propia con `OWN_MEMBERSHIP`; `weekStartOf` de `days.ts` es solo de lunes, y el comentario de `MONDAY` dice que los recorridos no lo cambian | `e2e/database.ts:483-583`, `:452-477`; `e2e/days.ts:172-182`                                                                                                                             |
| `seed.sql` siembra las entradas sin descripción, con `random()` por franja antes del insert y las etiquetas después; `explain.sql` llega a Q24                                                                                              | `scripts/report-volume/seed.sql:108-157`, `:180-203`; `scripts/report-volume/explain.sql:729`                                                                                            |

## 1. Alcance

Entra, **parte A** (mes y semana):

- **`src/server/time`**: `weekBuckets`, `monthBuckets`, `bucketDays` y
  `monthLabel`, con sus tests.
- **El módulo `report`**: `week` y `month` en las agrupaciones, `semana` y `mes`
  en la URL, sus tipos de grupo; `ReportBuckets` en lugar de `buckets`; las dos
  dimensiones en la tabla del repository; los tramos, los rótulos, `partial` y
  el orden en el service.
- **La pantalla**: «Semana» y «Mes» en «Agrupar por» y en los subniveles; sus
  filas con «solo …».
- **La medición** de §6.2.

Entra, **parte B** (descripción), en commits propios al final:

- **El módulo `report`**: `description` en las agrupaciones, `descripcion` en la
  URL, su tipo de grupo y `REPORT_DESCRIPTION_SHOWN`; la dimensión en la tabla;
  el tope en el primer nivel y `levelsShown: 0`.
- **La pantalla**: «Descripción»; su fila, con «Sin descripción» y el texto
  recortado; la fila del primer nivel que no entra.
- **La medición** de §6.3 con descripciones en `seed.sql`, y el peso de §6.4.

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                                                                         | Qué cambia                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Qué hay que volver a probar                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/server/time/index.ts`                                                      | A: las cuatro funciones nuevas. Nada existente cambia.                                                                                                                                                                                                                                                                                                                                                                                                                        | `test:unit` y `test:time-ar`                                |
| `src/modules/report/schema.ts`                                                  | A: `week` y `month` en las listas, `REPORT_TIME_GROUP_BYS`, dos tipos de grupo. B: `description`, su tipo de grupo, `REPORT_DESCRIPTION_SHOWN`, `levelsShown` desde 0 con el `refine` de `groups` vacío; **el comentario de `REPORT_MAX_ROWS` (`:99-102`)** pasa a decir que acota todos los niveles, también el primero.                                                                                                                                                     | `schema.test.ts`; los fixtures de componentes               |
| `src/modules/report/repository.ts`                                              | A: `ReportBuckets`; `week` y `month` en `LevelGroupRow` y en la tabla; las guardas por dimensión de tiempo. B: `description`.                                                                                                                                                                                                                                                                                                                                                 | `service.integration.test.ts` y `scope.integration.test.ts` |
| `src/modules/report/service.ts`                                                 | A: los tramos por dimensión, los rótulos con el camino, el orden cronológico. B: el grupo de descripción; el tope del primer nivel y el total sin él; **el JSDoc de `readLevelsWithinLimit` (`:436-441`)** pasa a decir que el primero también entra entero o no entra.                                                                                                                                                                                                       | Ídem                                                        |
| `service.integration.test.ts`                                                   | A, paso 1 (edición mecánica): `buckets: {}` en lugar de `null` (`:1166-1198`, `:1295`, `:1325`, `:1382`, `:2494`, `:2516`), `{ date: … }` en lugar del `TimeBuckets` suelto, `read.buckets.date` en `realLevelRead` (`:1149-1152`), en `:1436-1448` y en `:2053`; los dos recorridos de `REPORT_GROUP_BYS` (`:488`, `:2009`) fijos en las seis de R3 hasta el paso 3. B, paso 12: **cambian de valor `:1757` y `:1774`**, de `[undefined, 2701]` a `[3001, 2701]` (D-R10-10). | —                                                           |
| `scope.integration.test.ts`                                                     | A, paso 1 (`backend-dev`, edición mecánica): los casos `week` y `month` de `summaryOf`, `rowsOf`, `everyoneInAGroups`, `keyOfGroup` y `keysOfEntry`, y `groupBys` fijo en las seis de R3. B, paso 10: lo mismo con `description`, y `groupBys` fijo en las ocho de A. `test-engineer` lo devuelve a `REPORT_GROUP_BYS` en cada parte.                                                                                                                                         | —                                                           |
| `scope.test-d.ts`                                                               | A: `buckets: {}`; un literal de `ReportBuckets` con otra clave no compila.                                                                                                                                                                                                                                                                                                                                                                                                    | `npm run typecheck`                                         |
| `src/modules/report/components/*`                                               | A: «Semana» y «Mes», sus filas, `groupKey`. A, paso 1 (`backend-dev`, edición mecánica): los casos mínimos de `GroupHeading`, `groupKey` y `groupByLabels`. B: «Descripción», su fila, la fila del primer nivel cortado; B, paso 10, lo mismo de mínimo.                                                                                                                                                                                                                      | Los tests de componentes                                    |
| `report-toolbar.test.tsx`, `subgroup-picker.test.tsx`, `grouping-model.test.ts` | **Cambian de valor las listas de agrupaciones en orden**: suman «Semana» y «Mes» al final (A, paso 1, edición mecánica) y «Descripción» (B, paso 10). Por D-R10-5.                                                                                                                                                                                                                                                                                                            | —                                                           |
| `e2e/reports-page.ts`, `e2e/reports.spec.ts`, `e2e/database.ts`, `e2e/days.ts`  | A: `semana` y `mes` en `ReportGroupBy` y `GROUP_LINK`; la lista de `:832-839` suma las dos; `setWeekStart`; `weekStartOf` con el primer día como parámetro opcional (lunes por omisión: ninguna llamada cambia) y **el comentario de `MONDAY` (`days.ts:172-174`)**, que dice que los recorridos no cambian el primer día; `monthLabel`. B: `descripcion`; `seedNumberedEntries` con su `suffix`. Ningún export existente se renombra.                                        | `reports.spec.ts` entero                                    |
| `scripts/report-volume/seed.sql`, `explain.sql`                                 | A: Q25 a Q30. B: las descripciones, en el mismo `insert`; Q31 a Q34; Q2, Q5 y Q11 con `limit 3001`.                                                                                                                                                                                                                                                                                                                                                                           | —                                                           |

- **Una URL sin las agrupaciones nuevas no cambia**, y los tests de R2a a R4b
  siguen afirmando lo mismo. Cambian la forma de `buckets` en las lecturas
  directas de los tests, las listas de agrupaciones en orden y, en B, el
  `limit` del nivel 1 de las dos afirmaciones de R3b. Si otro valor afirmado
  cambia, es un error del slice, no del test.
- **Las ediciones mecánicas fuera del reparto** (pasos 1 y 10 de §7) siguen la
  regla de R3 y R4: las hace `backend-dev` para que su commit compile y pase,
  con el aviso al team-lead, y espera a que el dueño del archivo commitee lo que
  tenga pendiente en él.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** La semana y el mes recorren las mismas filas
que la fecha (Q5); la descripción agrupa por una columna de la fila que la
lectura ya trae. §6 mide; si algo pasa su presupuesto, vale §6.5 de R3: el slice
se detiene y vuelve a `architect`.

## 3. Permisos

**Ninguna acción nueva.** Deciden las que ya existen, como en R4:

- `report.view` (todos los roles activos): ver el reporte con las agrupaciones
  nuevas sobre lo que se ve.
- `timeEntry.others.view` (owner y admin): ver las horas ajenas, **y con la
  parte B, el texto de sus descripciones**. Es la primera pantalla que muestra
  texto escrito por otra persona; la acción ya cubre «ver las entradas de
  otros», y el detallado de la fase 3 mostrará lo mismo. La pregunta la hace
  `scopeOf` una vez; `inScope` la traduce en cada lectura.

Ninguna decisión de acceso vive fuera de `can()`. Los cortes, el largo del texto
y los `limit` los arma el servidor; de la URL solo llegan los valores de
`agrupar` y `subagrupar`, validados contra el mapa.

## 4. Contrato de lectura

### 4.1 Los tipos (`report/schema.ts`)

La forma final, con lo de la parte B marcado:

```ts
export const REPORT_GROUP_BYS = [
  "person",
  "project",
  "client",
  "task",
  "tag",
  "date",
  "week",
  "month",
  "description", // parte B
] as const;

export const REPORT_GROUP_PARAMS = {
  // … los seis de R3
  week: "semana",
  month: "mes",
  description: "descripcion", // parte B
} as const satisfies Record<ReportGroupBy, string>;

/** ADR 0021: las dimensiones que se cortan en tramos de tiempo, en la zona de quien mira. */
export const REPORT_TIME_GROUP_BYS = ["date", "week", "month"] as const;
export type ReportTimeGroupBy = (typeof REPORT_TIME_GROUP_BYS)[number];

// parte B
/** D-R10-9: cuántos caracteres de una descripción viajan, en puntos de código como `left()`. */
export const REPORT_DESCRIPTION_SHOWN = 100;

const reportWeekGroup = withChildren({
  kind: z.literal("week"),
  /** El primer día de la semana entera, con el primer día de quien mira (RP-24); puede caer antes del período. */
  weekStart: z.string(),
  /** La semana entera, «28/09 – 04/10», con año si algún extremo no es del año de hoy (D-R10-3). */
  label: z.string(),
  /**
   * Los días que cuenta si no es la semana entera —la cortan el período o un
   * grupo de tiempo de su camino—: «01/10 – 04/10». `null` si la cuenta entera.
   */
  partial: z.string().nullable(),
  seconds: z.number().int().min(0),
});

const reportMonthGroup = withChildren({
  kind: z.literal("month"),
  /** El primer día del mes: «2026-10-01». */
  monthStart: z.string(),
  /** «octubre», o «octubre de 2025» si no es del año de hoy (D-R10-3). */
  label: z.string(),
  /** Como en la semana. */
  partial: z.string().nullable(),
  seconds: z.number().int().min(0),
});

// parte B
const reportDescriptionGroup = withChildren({
  kind: z.literal("description"),
  /** `null` es «Sin descripción»: la cadena vacía (RP-28, D-R10-8). */
  description: z
    .object({
      /** Los 32 primeros hexadecimales del SHA-256 del texto entero: la clave del grupo (D-R10-9). */
      id: z.string().regex(/^[0-9a-f]{32}$/),
      /** De 1 a `REPORT_DESCRIPTION_SHOWN` puntos de código, tal como se guardaron. */
      text: z
        .string()
        .min(1)
        .refine((text) => Array.from(text).length <= REPORT_DESCRIPTION_SHOWN),
      /** El texto entero es más largo: la pantalla agrega «…». */
      truncated: z.boolean(),
    })
    .nullable(),
  seconds: z.number().int().min(0),
});

// reportGroup suma los tres; reportReadyState cambia, parte B:
//   /** Los niveles leídos que entran en el tope; 0 si no entra ni el primero (D-R10-10). */
//   levelsShown: z.number().int().min(0).max(3),
// con un `refine` sobre el objeto: con `levelsShown` en 0, `groups` está vacío.

export type ReportWeekGroup = z.infer<typeof reportWeekGroup>;
export type ReportMonthGroup = z.infer<typeof reportMonthGroup>;
export type ReportDescriptionGroup = z.infer<typeof reportDescriptionGroup>; // parte B
```

- **El largo del texto se cuenta en puntos de código** con `Array.from`, como
  `left()` de Postgres, y no con `.max()` de Zod, que cuenta unidades UTF-16:
  100 emojis son 200 unidades y el estado no pasaría su propio esquema.
- **El `refine` de `levelsShown: 0`**: un estado que dice que el primer nivel
  no entró y trae grupos es un error del service, y el esquema que lo parsea en
  los tests lo rechaza. Con `levelsShown` de 1 a 3, `groups` puede estar vacío
  (el período sin horas).
- `reportGroupParams` y `reportSubgroupParams` no cambian de cuerpo: leen el
  mapa.
- `REPORT_TIME_GROUP_BYS` es la única lista de las dimensiones con tramos: la
  usan el repository (guardas), el service (qué tramos arma) y el orden.

### 4.2 `src/server/time` (parte A)

```ts
/**
 * Un tramo por semana de `first` a `last`, con la semana que empieza en
 * `weekStart`: el primero empieza en `first` aunque su semana empiece antes, y
 * cada uno de los siguientes en el primer día de su semana. El fin es el inicio
 * del día siguiente a `last`. Cada inicio es `startOfDayKey` de su primer día
 * en `timeZone`: un día sin 00:00 empieza en su primer minuto, y un día que
 * falta entero repite el corte (ADR 0021). Solo usa la zona que recibe. Lanza
 * como `dayBuckets`.
 */
export function weekBuckets(
  first: string,
  last: string,
  weekStart: WeekStart,
  timeZone: string,
): TimeBuckets;

/** Lo mismo por mes civil: el primero en `first`, cada uno de los siguientes el día 1. */
export function monthBuckets(first: string, last: string, timeZone: string): TimeBuckets;

/**
 * Los días civiles del tramo `index`: su primer día y el anterior al primero
 * del siguiente, o `last` si es el último. Lanza si `index` no es un tramo.
 */
export function bucketDays(
  buckets: TimeBuckets,
  index: number,
  last: string,
): { readonly first: string; readonly last: string };

/** «octubre», o «octubre de 2025» si no es del año de `todayKey`. Lanza si `monthStart` no es un día. */
export function monthLabel(monthStart: string, todayKey: string): string;
```

- **Aritmética de claves**, como `dayBuckets`: los primeros días salen de
  `weekStartKey` y `monthStartKey` sobre claves, nunca sumando milisegundos;
  solo el inicio de cada tramo pasa por la zona.
- **`TimeBucket` y `TimeBuckets` no cambian**: los tests que arman tramos a mano
  siguen compilando, y R5 recibe los tres con la misma forma.
- `monthLabel` usa `date-fns` con `es` en UTC, como `weekdayParts`, y el patrón
  `LLLL` (el nombre del mes en nominativo, en minúscula).
- La semana de una fila se rotula con `dayRangeLabel(weekStart, weekStart + 6,
todayKey, format)`, que ya existe.

### 4.3 Repository (`report/repository.ts`)

```ts
/** D-R10-4: los tramos de cada dimensión de tiempo pedida, y solo de esas. */
export type ReportBuckets = { readonly [Dimension in ReportTimeGroupBy]?: TimeBuckets };

export type LevelGroupRow =
  | … // los seis de R3
  | { readonly kind: "week"; /** La posición en `buckets.week`, desde 0. */ readonly bucket: number }
  | { readonly kind: "month"; /** La posición en `buckets.month`, desde 0. */ readonly bucket: number }
  // parte B
  | {
      readonly kind: "description";
      /** `null` es «Sin descripción». */
      readonly description: {
        readonly id: string;
        readonly text: string;
        readonly truncated: boolean;
      } | null;
    };

export type ReportLevelRead = ReportEntryRead & {
  readonly dimensions: readonly ReportGroupBy[];
  /** Antes `TimeBuckets | null`: una clave por cada dimensión de tiempo de `dimensions`. */
  readonly buckets: ReportBuckets;
  readonly limit?: number;
};
```

**La tabla de dimensiones** suma tres filas:

| Dimensión     | Clave por entrada                                                    | Lo que une adentro | Lo que muestra, afuera, por la clave                                                                                                                                               |
| ------------- | -------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `week`        | `width_bucket(time_entry.started_at, $cortes_semana::timestamptz[])` | —                  | el índice del tramo (el service rotula)                                                                                                                                            |
| `month`       | `width_bucket(time_entry.started_at, $cortes_mes::timestamptz[])`    | —                  | ídem                                                                                                                                                                               |
| `description` | `time_entry.description`                                             | —                  | `case when key = '' then null else left(encode(sha256(convert_to(key, 'UTF8')), 'hex'), 32) end`, `left(key, $n)` y `char_length(key) > $n`, con `$n` = `REPORT_DESCRIPTION_SHOWN` |

- **Una sola función para las tres dimensiones de tiempo**: la fila de `date` de
  hoy (`:455-467`) pasa a armarse con una función privada que recibe la clave
  (`date`, `week` o `month`) y lee sus cortes de `read.buckets[clave]`. El
  arreglo va una vez por dimensión, como parámetro, en la subconsulta por
  entrada; `bucketIndexOf` y la regla de los cortes repetidos no cambian.
- **`bucketsOf(read, dimensión)`** lanza si faltan los de esa dimensión, como
  hoy con la fecha.
- **La descripción no une ninguna tabla.** Lo que se muestra se calcula sobre
  `totals.key_n`, la fila ya agrupada: el hash y el corte se hacen una vez por
  grupo, no por entrada. `convert_to(…, 'UTF8')` y no `::bytea`, que lee las
  barras invertidas del texto como escapes. Los literales `'UTF8'` y `'hex'` van
  en el texto de la sentencia. La clave no pasa por `btrim` ni por `lower`
  (D-R10-8).
- **Las guardas**, en `checkLevelRead`, con `RangeError` antes de consultar,
  reemplazan la de la fecha: **para cada dimensión de `REPORT_TIME_GROUP_BYS`,
  sus tramos están si y solo si la dimensión está**; los que están no son vacíos
  y cubren exactamente el `span`. Las de R3 y R4 siguen.
- **`totalsByLevels` y `entryTotals` no cambian de firma.** `inScope`,
  `closedIn`, `matchesFilter`, `entrySeconds` y `secondsOf` no cambian.
- **Sin `order by`**, como en R3: con `limit` vuelven filas cualesquiera, y el
  service solo cuenta cuántas son cuando no entran.

### 4.4 Service (`report/service.ts`)

`ReportRequest` y la firma de `getReportState` no cambian. En este orden:

1. **`report.view`**, **`scopeOf`**, **el período**, **la invariante de los
   niveles** y **la de los filtros**, sin cambios.
2. **Los tramos** (A): para cada dimensión de tiempo entre los niveles, una
   vez: `date` → `dayBuckets(range.first, range.last, timeZone)`; `week` →
   `weekBuckets(range.first, range.last, settings.weekStart, timeZone)`;
   `month` → `monthBuckets(range.first, range.last, timeZone)`. Sin ninguna,
   `{}`.
3. **En la transacción** (`repeatable read`, `read only`), como en R4: los
   catálogos, los filtros efectivos y el alcance.
4. **Los niveles**, con `readLevelsWithinLimit`. Cada `ReportLevelRead` lleva
   en `buckets` solo los tramos de las dimensiones de tiempo de **sus**
   `dimensions` (los del nivel 3 de Mes → Semana → Fecha llevan los tres; los
   del nivel 1, solo `month`).
   - **(B) El nivel 1 se pide con `limit: REPORT_MAX_ROWS + 1`.** Si vuelve con
     más de `REPORT_MAX_ROWS` filas, no se lee ningún nivel y la lectura no
     muestra ninguno. Con el nivel 1 vacío, como en R3: no se lee más.
5. **El total**: `entryTotals` si el primer nivel es la etiqueta o **(B) si el
   nivel 1 no entró**; si no, la suma del nivel 1 (D-R2a-7).
6. **El árbol**, como en R3, con un cambio: **el grupo de cada fila se arma con
   su camino entero** (`row.groups.slice(0, depth + 1)`), porque `partial`
   depende de los grupos de tiempo de arriba (D-R10-3).
7. **El estado**: `levelsShown` es **(B) 0 si el nivel 1 no entró**,
   `1 + subgroups.length` si el nivel 1 vino vacío, y si no, los niveles
   leídos que entraron.

**Cada grupo nuevo** sale de su fila con la función privada de hoy:

- **semana**: `days = bucketDays(buckets.week, bucket, range.last)`;
  `weekStart = weekStartKey(days.first, settings.weekStart)`; `label` de la
  semana entera; `partial` con los días que cuenta.
- **mes**: `monthStart = monthStartKey(days.first)`; `label = monthLabel(…)`;
  `partial` igual.
- **los días que cuenta** (`countedDays`, privada): la intersección de los días
  del tramo propio con los de **cada** grupo de tiempo de su camino, a
  cualquier altura —un día es él mismo; una semana o un mes, su `bucketDays`—.
  `partial` es `null` si da la unidad entera; si no, `dayRangeLabel` de esa
  intersección. Nunca vacía: la fila existe porque alguna entrada cae en todos
  sus grupos.
- **descripción** (B): `{ kind: "description", description, seconds }`,
  directo de la fila.

**El orden.** `compareSiblings` ordena los grupos de tiempo por su primer día
con `compareDayKeys` (`dayKey`, `weekStart`, `monthStart`) y el resto con
`compareGroups`; lanza si un nivel mezcla. `NamedGroup` excluye los tres de
tiempo. `sortKeyOf` suma la descripción: `{ id, name: text }`, con `null` para
«Sin descripción», que va después de las de su misma duración; con la misma
duración y el mismo `text`, desempata el `id` (`compareNames`).

**La clave en el armado** (`groupKeyOf`): el índice del tramo para semana y
mes, como la fecha; el `id` o `null` para la descripción.

- **Ninguna decisión de acceso cambia**: el service no compara roles.
- **`weekStart` sale de `settings`**, que arma `timeSettingsOf` (ADR 0012); el
  service no lee la membresía.

### 4.5 Costo

- **Parte A**: las mismas sentencias que R4; las de un nivel con semana o mes
  llevan su arreglo de cortes, de hasta 54 (semana) o 13 (mes) instantes en 366
  días. `weekBuckets` y `monthBuckets`, una vez por pedido.
- **Parte B**: una sentencia más, `entryTotals`, solo cuando el nivel 1 no
  entra. Por descripción, la agregación agrupa por texto; lo que viaja de la
  base por grupo es el `id`, hasta 100 caracteres y una marca.
- **Lo que viaja al navegador** no cambia de cota: como mucho 3000 filas en
  todo el árbol, ahora también con el primer nivel (D-R10-10).

## 5. Pantalla

### 5.1 La barra

`report-toolbar.tsx` no cambia: dibuja un enlace por valor de
`REPORT_GROUP_BYS`, así que «Agrupar por» pasa a ocho enlaces en la A y a nueve
en la B, y las listas de los subniveles ofrecen lo que no está arriba en ese
orden. El grupo ya tiene `flex-wrap` (R2b, P-N1). `frontend-dev` mide a 320 y
375 px que la barra no agregue desborde horizontal más allá del de la
navegación del shell, ya anotado.

### 5.2 Las filas (`group-heading.tsx`)

- **Semana** (A): el rótulo y, si hay `partial`, en gris,
  `reportLabels.partialDays(partial)`: «28/09 – 04/10 solo 01/10 – 04/10».
- **Mes** (A): `<time dateTime="2026-10">octubre</time>` (los siete primeros
  caracteres de `monthStart`, un mes válido de HTML) y `partial` igual.
- **Descripción** (B): el texto en un `span` con `truncate`, más «…» si
  `truncated`; «Sin descripción» en gris con `EmptyGroupHeading`. El texto va
  como hijo de texto de React, nunca como HTML.

### 5.3 El árbol (`report-tree-model.ts`)

`groupKey` suma `week` → `weekStart`, `month` → `monthStart` y `description` →
`id` o `sin-descripcion`. Con la clave del padre adelante, la misma semana
debajo de dos meses son dos filas distintas.

### 5.4 La tabla (`report-view.tsx`, B)

- **Con `levelsShown: 0`**: el encabezado de la primera columna es el del
  primer nivel pedido; el cuerpo es una fila de dos columnas con
  `reportLabels.firstLevelLimit(REPORT_MAX_ROWS)`, sin `ReportTree`; no se
  dibuja la línea del tope de R3 (`rowLimit`) ni ningún vacío, tampoco el
  segundo con filtros. El total y el facturable, como siempre.
- Con `levelsShown` de 1 a 3, lo de R3 y R4 sin cambios.

### 5.5 Textos (`labels.ts`)

| Clave             | Texto                                                                                                                 | Parte |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ----- |
| `byWeek`          | «Semana»                                                                                                              | A     |
| `byMonth`         | «Mes»                                                                                                                 | A     |
| `partialDays`     | `(días) =>` «solo {días}»                                                                                             | A     |
| `byDescription`   | «Descripción»                                                                                                         | B     |
| `firstLevelLimit` | `(tope) =>` «El primer nivel pasa de {tope} filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.» | B     |

`groupByLabels` suma las tres. «Sin descripción» es
`trackerLabels.noDescription`, el mismo rótulo del rastreador, como «Sin
proyecto» es el de `projectLabels`.

## 6. Volumen y peso

Lo hace `backend-dev` con el repository terminado, con el procedimiento de §6 de
R2a, en `postgres:18-alpine`, en una base propia que se borra al terminar. La
sentencia es el texto de `.toSQL()`. El informe lleva, por consulta, el plan
(nodos e índices), las cinco medidas y cuántas filas tuvo cada nivel, y el
team-lead lo copia al documento de revisiones.

### 6.1 `seed.sql`

- **A**: sin cambios.
- **B**: **las entradas cerradas llevan descripción, en el mismo `insert`**,
  calculada de `n` (el número de fila) sin llamar a `random()`, así las
  entradas, sus instantes y las etiquetas no cambian:
  - `n % 5 = 0`: la cadena vacía (20 %);
  - `n % 100 = 1`: `'Ticket largo ' || n || ' ' || repeat('detalle ', 360)`,
    unos 2900 caracteres, único (1 %);
  - el resto de `n % 5 = 1`: `'Ticket ' || n`, único (19 %);
  - el resto: `'Tarea recurrente ' || ((n * 7919) % 200 + 1)`, 200 textos que se
    repiten (60 %).

  En 366 días son unos 12 700 textos distintos, que no entran en el primer
  nivel; en un mes, unos 1250, que entran. Los timers abiertos siguen sin
  descripción. El comentario de la cabecera lo cuenta.

### 6.2 Las consultas de la parte A

| Consulta | Qué                                                                                          | Presupuesto (mediana) |
| -------- | -------------------------------------------------------------------------------------------- | --------------------- |
| Q25      | `[week]`, `everyone`, 366 días, con lunes                                                    | ≤ 150 ms              |
| Q26      | `[month]`, `everyone`, 366 días                                                              | ≤ 150 ms              |
| Q27      | `[month, week]`, `everyone`, 366 días, con el `limit` de su presupuesto                      | ≤ 150 ms              |
| Q28      | `[month, week, date]`, `everyone`, 366 días, tres arreglos, con el `limit` de su presupuesto | ≤ 250 ms              |
| Q29      | `[person, week]`, `everyone`, 366 días, con el `limit` de su presupuesto                     | ≤ 150 ms              |
| Q30      | `[week]`, `self`, 366 días                                                                   | ≤ 30 ms               |

**El pedido entero** Mes → Semana → Fecha de todo el equipo en 366 días, en una
transacción, con los catálogos: **≤ 500 ms**. Se espera que entre entero (unas
13 + 66 + 366 filas). `weekBuckets` y `monthBuckets` de 366 días en Buenos
Aires y en Madrid: **≤ 20 ms** cada una, como `dayBuckets` en R2b.

### 6.3 Las consultas de la parte B

| Consulta | Qué                                                                                         | Presupuesto (mediana) |
| -------- | ------------------------------------------------------------------------------------------- | --------------------- |
| Q31      | `[description]`, `everyone`, 366 días, con `limit 3001` (no entra)                          | ≤ 200 ms              |
| Q32      | `[description]`, `everyone`, el último mes entero                                           | ≤ 60 ms               |
| Q33      | `[person, description]`, `everyone`, el último mes entero, con el `limit` de su presupuesto | ≤ 100 ms              |
| Q34      | `[description]`, `self`, 366 días                                                           | ≤ 40 ms               |

**Los dos pedidos enteros**, en una transacción y con los catálogos:

| Pedido                                           | Sentencias                | Presupuesto |
| ------------------------------------------------ | ------------------------- | ----------- |
| Descripción, todo el equipo, 366 días (no entra) | Q31 + Q10 + catálogos     | ≤ 500 ms    |
| Persona → Descripción, todo el equipo, un mes    | nivel 1 + Q33 + catálogos | ≤ 250 ms    |

**Además, con el `seed.sql` nuevo**: Q2, Q5 y Q11 con `limit 3001` en el texto,
contra sus presupuestos de R3 (150 ms cada una). El informe dice si el plan
cambió por el `limit` y cuánto cambiaron con las filas más anchas.

### 6.4 El peso de la página (parte B)

Lo hace `frontend-dev`, no es un test, con el procedimiento de §6.4 de R3: una
página temporal **en una copia propia del árbol**, fuera de todo commit, servida
con `next build` y `next start`, con dos mediciones:

1. **3000 descripciones en el primer nivel**, sin subniveles: cada `text` de 100
   caracteres, un tercio con acentos, un tercio con `"`, `<` y `&`, y algunos
   emojis; `truncated` en la mitad; ids de 32 caracteres. Las 3000 filas se
   dibujan.
2. **Descripción → Proyecto**, 1500 + 1500, con los botones de expandir.

Para las dos:

- **El payload RSC**: **≤ 1 MB**, el de R3.
- **El HTML de la primera carga**: **≤ 2,5 MB**. Es más que el 1,5 MB de R3
  porque es la primera vez que la primera carga dibuja 3000 filas (en R3b eran
  30 y el resto viajaba contraído). Con gzip, lo que viaja es una fracción (R3b:
  352 KB → 20,6 KB), y queda lejos de los 4,5 MB del cuerpo de una función de
  Vercel.

La mediana de cinco corridas va en el informe.

La A no mide peso: una fila de semana o de mes es una de fecha con un texto
corto más, y el árbol tiene el tope de 3000 que R3b ya midió.

### 6.5 Si algo pasa el presupuesto

Vale §6.5 de R3: el slice se detiene y vuelve a `architect`. Las alternativas,
en este orden: para el peso, `REPORT_DESCRIPTION_SHOWN` en 60; después, un tope
del primer nivel más bajo que el del árbol; para Q31, un índice solo con una
medición que lo justifique; para Q28, la granularidad de los cortes no se toca:
un índice, con la misma regla.

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea; la parte va entre
paréntesis cuando el archivo es de una sola.

**Reglas de la corrida**, de R3b a R4b:

- **Cada agente que corre integración lleva su base de test propia**: el
  team-lead la crea y la migra antes de lanzarlo y la borra al terminar. Nadie
  usa la de otro. **`parity-reviewer` también lleva la suya.**
- **La base de e2e se crea y se migra antes de lanzar a `e2e-tester`.**
- **Lo que necesita un servidor propio va en una copia del árbol**: los
  mutantes de e2e de §8.2, en una copia con su puerto y su base de e2e, para no
  cruzarse con la suite del árbol principal; la página temporal de §6.4, en una
  copia de `frontend-dev`, para que no quede en ningún commit.
- **Las corridas van en primer plano.**
- **Los agentes trabajan de a dos a la vez** (decisión del usuario): el orden
  de abajo está en rondas de dos.
- **`parity-analyst` no escribe archivos**: entrega el texto y lo aplica el
  team-lead.
- Postgres local y Neon son 18.

### backend-dev

```
/home/maxi/program/clock/src/server/time/index.ts                            (A)
/home/maxi/program/clock/src/server/time/time.test.ts                        (A)
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/repository.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/scope.test-d.ts                  (A)
/home/maxi/program/clock/scripts/report-volume/seed.sql                      (B)
/home/maxi/program/clock/scripts/report-volume/explain.sql
```

Más las ediciones mecánicas de los pasos 1 y 10 en archivos de otros dueños
(§1).

### frontend-dev

```
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/group-heading.tsx
/home/maxi/program/clock/src/modules/report/components/report-tree-model.ts
/home/maxi/program/clock/src/modules/report/components/report-tree-model.test.ts
/home/maxi/program/clock/src/modules/report/components/report-view.tsx          (B)
/home/maxi/program/clock/src/modules/report/components/report-view.test.tsx
/home/maxi/program/clock/src/modules/report/components/report-tree.test.tsx
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
/home/maxi/program/clock/src/modules/report/components/subgroup-picker.test.tsx
/home/maxi/program/clock/src/modules/report/components/grouping-model.test.ts
```

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Suma los casos de los criterios 9 (A) y 18 (B) contra las firmas publicadas, sin
mirar la implementación de las dimensiones nuevas, devuelve `groupBys` a
`REPORT_GROUP_BYS` y corre las tablas de mutantes de §8.1 en una copia propia,
con su base.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                   (17 y 18 en A; 19 y 20 en B)
/home/maxi/program/clock/e2e/reports-page.ts
/home/maxi/program/clock/e2e/database.ts
/home/maxi/program/clock/e2e/days.ts                                           (A)
```

- `database.ts`: `setWeekStart(email, weekStart)` (A), sobre `OWN_MEMBERSHIP`,
  como `setRole`; `seedNumberedEntries(email, timeZone, { day, start, count,
suffix })` (B), un `insert … select … from generate_series` con entradas de
  un minuto que empiezan a la misma hora, con descripción «Entrada {n}
  {suffix}», en una transacción que corta si la persona no tiene membresía.
- `days.ts`: `weekStartOf(civil, weekStart = MONDAY)`, con el parámetro
  opcional, así ninguna llamada existente cambia; **el comentario de `MONDAY`
  (`:172-174`)** deja de decir que los recorridos no cambian el primer día: lo
  cambian el 17 y el 18, sobre su propia persona; `monthLabel(civil, today)`,
  con los nombres de los meses y la regla del año de §4.2.
- `reports-page.ts`: `semana`, `mes` (A) y `descripcion` (B) en `ReportGroupBy`
  y `GROUP_LINK`, en el orden de D-R10-5; `partialDays(días)` (A);
  `NO_DESCRIPTION` y `FIRST_LEVEL_LIMIT` (B). **Ningún export existente se
  renombra.**
- `reports.spec.ts`: la lista del segundo nivel de `:832-839` suma lo nuevo de
  cada parte; `:723-725` toma la lista de `GROUP_LINK` y no cambia.
- Los mutantes de §8.2, en una copia con puerto propio (reglas de arriba).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

`parity-analyst` no escribe archivos: entrega el texto y **lo aplica el
team-lead**, antes del merge de cada parte, con su corrección fechada y una
sección «13. Núcleo, R10»:

- **RP-11** (A, B): nueve dimensiones; `agrupar=semana|mes|descripcion`;
  descripción, mes y semana son de la lista documentada de la página de
  filtros; el orden de los enlaces y por qué.
- **RP-12** (A, B): semana y mes en orden cronológico; las combinaciones, con la
  intersección de dos dimensiones de tiempo; la descripción, por duración con
  «Sin descripción» después.
- **RP-24** (A): la semana como agrupación sigue el primer día de quien mira; la
  fecha sigue sin depender de él.
- **RP-28** (B): «Sin descripción», con lo que junta.
- **RP-32** (A, B): los valores nuevos se validan como los otros.
- **P-11**: resuelta por el usuario el 2026-10-09; entran las tres.
- **§13.4, divergencias que el reviewer no marca**: el tramo cortado con «solo
  …»; el texto exacto como clave de la descripción (mayúsculas y espacios
  internos separan); los 100 caracteres con «…» y sin el texto entero en
  pantalla; el primer nivel que no entra no se muestra; la semana como fila
  rotulada con sus días y no con un número.

La sección de R10b registra lo de la parte B.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/components/`,
`src/lib/`, `src/modules/time-entry/`, `project/`, `profile/`, `workspace/`,
`team/`, `report/period.ts`, `report/components/report-toolbar.tsx`,
`report-tree.tsx`, `report-screen.tsx`, `report-href*`, `range-picker*`,
`subgroup-picker.tsx`, `grouping-model.ts`, `filter-*`, `src/app/`, los ADR. El
mapa y el estado los actualiza el team-lead.

### Orden

**Parte A — mes y semana.** Cada commit compila y pasa lint, typecheck y
`npm run test:all` sin nada de la parte B: ni `description`, ni `levelsShown: 0`,
ni el `limit` del nivel 1.

_Ronda A1: `backend-dev` y `frontend-dev`._

1. **Primer commit de `backend-dev`**: en `schema.ts`, `week` y `month` en las
   listas, `REPORT_TIME_GROUP_BYS` y los dos tipos de grupo, con
   `schema.test.ts`; en `repository.ts`, `ReportBuckets`, `LevelGroupRow` y
   `buckets` en su forma nueva, con la fecha migrada y **las dos dimensiones
   nuevas lanzando**; el service arma `{ date }` donde armaba los tramos de la
   fecha y **lanza si los niveles traen `week` o `month`** hasta el paso 3.
   **Ediciones mecánicas** fuera del reparto, para que el commit compile y
   pase:
   - `group-heading.tsx`, `report-tree-model.ts` y `labels.ts`: los casos
     `week` y `month`, mínimos (el rótulo; la clave);
   - `report-toolbar.test.tsx`, `subgroup-picker.test.tsx` y
     `grouping-model.test.ts`: «Semana» y «Mes» al final de cada lista;
   - `service.integration.test.ts`: `buckets` en su forma nueva en todas las
     citas de §0 y los dos recorridos de `REPORT_GROUP_BYS` fijos en las seis de
     R3;
   - `scope.integration.test.ts`: los casos `week` y `month` de las cinco
     funciones con `switch` y `groupBys` fijo en las seis de R3;
   - `scope.test-d.ts`: `buckets: {}`.

   **Avisa a `frontend-dev` y al team-lead**: desde acá las formas de la A son
   las finales.

2. **`frontend-dev`**, desde el paso 1: las filas de semana y mes con «solo …»,
   `groupKey`, los rótulos; los tests del criterio 10; la medida de la barra a
   320 y 375 px.
3. **`backend-dev`**: las funciones de `src/server/time` con el criterio 1; las
   dos dimensiones y las guardas; el service con los tramos, `countedDays`, los
   rótulos y el orden; quita el `throw` del paso 1 y devuelve los recorridos de
   `service.integration.test.ts` a `REPORT_GROUP_BYS`; los criterios 2 a 8.
4. **`backend-dev`**: la medición de §6.2.

_Ronda A2: `test-engineer` y `e2e-tester`, con el hash del paso 3 y el último
commit de `frontend-dev`._

5. **`test-engineer`**: el criterio 9, `groupBys` de vuelta en
   `REPORT_GROUP_BYS`; los mutantes de §8.1 de la A. Cada caso nuevo se
   confirma cayendo con su mutante, porque la funcionalidad ya está.
6. **`e2e-tester`**: los helpers, el comentario de `MONDAY` y los recorridos 17
   y 18, confirmando en su copia que cada afirmación nueva cae con su mutante de
   §8.2.

_Cierre de la A._

7. **El texto de `parity-analyst`**, aplicado por el team-lead.
8. **Revisión de seguridad, corta**: que los cortes los arma el servidor con la
   zona y el primer día de la sesión, y que de la URL no llega nada más que los
   valores de `agrupar` y `subagrupar`; que las dimensiones nuevas pasan por
   `inScope` y `matchesFilter` como las otras; que no hay forma de parámetro
   nueva.
9. **Merge como R10a.**

**Parte B — descripción**, en commits propios, después de todos los de la A.

_Ronda B1: `backend-dev` y `frontend-dev`._

10. **`backend-dev`**: `description` en las listas, su tipo de grupo,
    `REPORT_DESCRIPTION_SHOWN`, `levelsShown` desde 0 con su `refine` y el
    comentario de `REPORT_MAX_ROWS` (`schema.ts:99-102`), con
    `schema.test.ts`; `LevelGroupRow` con la descripción y su dimensión
    lanzando; el service **lanza si los niveles traen `description`** hasta el
    paso 12. **Ediciones mecánicas**: los casos `description` en
    `group-heading.tsx`, `report-tree-model.ts` y `labels.ts`; «Descripción» al
    final de las tres listas de tests de componentes; los casos de
    `scope.integration.test.ts` y `groupBys` fijo en las ocho de A; los
    recorridos de `service.integration.test.ts` fijos en las ocho. **Avisa.**
11. **`frontend-dev`**: la fila de descripción y la del primer nivel cortado en
    `report-view.tsx`; los tests del criterio 19.
12. **`backend-dev`**: la dimensión, el tope del primer nivel, el JSDoc de
    `readLevelsWithinLimit` (`service.ts:436-441`) y el total con
    `entryTotals`; los dos tests de R3b pasan a `[3001, 2701]`; quita el
    `throw`; los criterios 14 a 17.
13. **`backend-dev`**: `seed.sql` y la medición de §6.3; **`frontend-dev`**: la
    de §6.4, en su copia.

_Ronda B2: `test-engineer` y `e2e-tester`, con el hash del paso 12._

14. **`test-engineer`**: el criterio 18, `groupBys` de vuelta; los mutantes de
    §8.1 de la B.
15. **`e2e-tester`**: `seedNumberedEntries` y los recorridos 19 y 20, con los
    mutantes en su copia.

_Cierre de la B._

16. **El texto de `parity-analyst`**, aplicado por el team-lead.
17. **Revisión de seguridad completa, antes del merge**: que el texto de una
    descripción ajena llega al navegador solo con `everyone` o `chosen`; que un
    member, un `project_manager` o un `team_manager` con
    `agrupar=descripcion` y `personas=…` armados a mano no reciben ningún texto
    ajeno en ningún nivel (el criterio 18 lo afirma sobre el estado entero);
    que el texto se dibuja como texto y no como HTML, sin
    `dangerouslySetInnerHTML` ni atributos armados con él; que el largo, el
    hash y los `limit` los fija el servidor; que una descripción de 3000
    caracteres no pasa de 100 al payload; que dos textos fabricados para
    compartir los 100 primeros caracteres no rompen el árbol.
18. **Merge como R10b.**

## 8. Criterios de aceptación

Son de la **parte A** los criterios 1 a 12; de la **parte B**, del 14 al 21; el
13 y el 22 valen cada uno para su parte.

1. **Los tramos** (A, unidad, `time.test.ts`, en UTC y en `test:time-ar`) —
   - `weekBuckets` del miércoles 2026-09-30 al martes 2026-10-13: con lunes, tres
     tramos que empiezan el 30/09, el 05/10 y el 12/10; con domingo, el 30/09,
     el 04/10 y el 11/10; con cada uno de los siete primeros días, el primero en
     el 30/09 y los demás en su día; el fin es el inicio del 14/10. Siete días
     alineados dan un tramo; un día, uno.
   - **El período más largo**: del domingo 2024-01-07 al lunes 2025-01-06 (366
     días) con lunes: 54 tramos; el primero (el 07/01/2024) y el último (el
     06/01/2025) son de un día; el fin es el inicio del 07/01/2025.
   - En `Europe/Madrid`, del lunes 2026-10-19 al domingo 2026-11-01 con lunes:
     el primer tramo empieza a las 22:00 UTC del 18/10 y el segundo a las 23:00
     UTC del 25/10 (169 horas de semana por el cambio de horario).
   - **Una semana que empieza un día sin 00:00**: en `America/Santiago`, del
     lunes 2026-08-31 al domingo 2026-09-13 con domingo, el tramo del domingo
     06/09 empieza a la 01:00 local, las 04:00 UTC (`time.test.ts:212-218`), y
     el anterior termina ahí.
   - En `Pacific/Apia`, del viernes 2011-12-23 al jueves 2012-01-12 con viernes:
     el tramo cuyo primer día es el 30/12, que no existe, empieza en
     `startOfDayKey("2011-12-31")`; los cortes quedan ordenados.
   - `monthBuckets` del 2026-09-15 al 2026-10-14: dos tramos, el 15/09 y el
     01/10; del 2024-01-01 al 2024-12-31: doce, cada uno el día 1; del
     2025-01-15 al 2026-01-15: trece; en Madrid, el del 01/11/2025 empieza en
     +01:00.
   - `bucketDays`: el primer y el último día de cada tramo, el último con
     `last`; lanza con un índice fuera.
   - `monthLabel`: «octubre» con hoy en 2026, «octubre de 2025» y «enero de
     2027» con hoy en 2026.
   - Las tres lanzan con `last` anterior a `first` o con una clave que no es un
     día.
2. **Los esquemas** (A, unidad) — `reportGroupParams` pasa con `semana` y `mes`,
   y no con `Semana`, `semanas`, `Mes`, `meses`, `week` ni `month`;
   `REPORT_GROUP_BYS` en el orden de D-R10-5; `reportSubgroupParams` pasa con
   `mes,semana` y `agrupar=fecha`, y no con `semana` y `agrupar=semana`;
   `reportReadyState` admite un grupo de semana y uno de mes con `partial` nulo
   y con texto, y Mes → Semana → Fecha anidados.
3. **Lo de R2a a R4b se conserva** (A, integración) — los tests existentes de
   `service.integration.test.ts` y `scope.integration.test.ts` pasan con los
   mismos valores, con `buckets` en su forma nueva.
4. **Por semana** (A, integración) — las mismas entradas vistas con lunes y con
   domingo dan semanas distintas; una entrada del domingo a las 23:30 de Buenos
   Aires (lunes 04:30 en Madrid) cae en semanas distintas para quien mira desde
   cada zona; del miércoles 30/09 al martes 13/10, la primera y la última
   semana llevan `partial` («30/09 – 04/10» y «12/10 – 13/10», con lunes) y la
   del medio no; el orden es cronológico aunque la última tenga más horas; una
   semana de otro año lleva el año en `label`; el total y el facturable son los
   de «Persona» en el mismo pedido.
5. **Por mes** (A, integración) — una entrada del 30/09 a las 23:30 de Buenos
   Aires es de septiembre para quien mira desde Buenos Aires y de octubre desde
   Madrid; del 15/09 al 14/10, «septiembre» con `partial` «15/09 – 30/09» y
   «octubre» con «01/10 – 14/10»; un año entero da meses sin `partial`; orden
   cronológico; total igual al de «Persona».
6. **Los niveles y los filtros** (A, integración) — **el período es del lunes
   2026-09-21 al domingo 2026-10-11, con lunes**: la semana del 28/09 al 04/10
   queda entera adentro, así que su `partial` solo puede venir de un grupo de
   arriba. **Tres entradas de dos personas**, mirado por el owner (alcance
   `everyone`): la persona A, en P1, el miércoles 30/09 de 09:00 a 10:00 y el
   jueves 01/10 de 09:00 a 09:30; la persona B, en P2, el miércoles 30/09 de
   10:00 a 10:45. Total 2:15.
   - `[month, week]`: «septiembre» con 1:45 y «octubre» con 0:30; la semana
     está debajo de los dos meses, con `partial` «28/09 – 30/09» y 1:45, y
     «01/10 – 04/10» y 0:30; los hijos de cada mes suman el mes;
   - **`[month, person, week]`: debajo de septiembre, A con 1:00 y B con 0:45,
     y debajo de cada una la semana dice «solo 28/09 – 30/09»**, aunque su
     padre directo sea la persona; debajo de octubre, solo A con 0:30, y su
     semana dice «solo 01/10 – 04/10»;
   - `[week, month]`: debajo de esa semana, con 2:15 y sin `partial`, los dos
     meses: septiembre con 1:45 y `partial` «28/09 – 30/09», octubre con 0:30 y
     «01/10 – 04/10»;
   - `[week, date]`: debajo de la semana, el 30/09 con 1:45 y el 01/10 con 0:30;
   - `[person, month]`: A con septiembre (1:00) y octubre (0:30); B solo con
     septiembre (0:45);
   - `[month, week, date]`: el 30/09 debajo de septiembre y su semana, el 01/10
     debajo de octubre y la suya;
   - `[month, week]` con `[P1]`: solo lo de A; septiembre con 1:00, octubre con
     0:30, los hijos de cada mes son solo de P1 y el total es 1:30 (R4, §9).
7. **Las guardas y el tipo** (A) — integración: `totalsByLevels` lanza
   `RangeError` sin consultar con `week` y sin `buckets.week`, con
   `buckets.week` y sin `week`, con `buckets.month` que no cubre el `span` y con
   `buckets.week` vacío, con el alcance tomado de una lectura real; las de la
   fecha siguen. `scope.test-d.ts`: un `ReportBuckets` con la clave `person` no
   compila.
8. **Los tramos de cada lectura** (A, integración, espía sobre `totalsByLevels`)
   — en Mes → Semana → Fecha, la lectura del nivel 1 recibe solo
   `buckets.month`, la del 2 `month` y `week`, la del 3 las tres; sin
   dimensiones de tiempo, `{}`; con `settings.weekStart` en domingo, el segundo
   tramo de `buckets.week` empieza un domingo.
9. **El alcance** (A, `scope.integration.test.ts`) — por semana, por mes y en
   los árboles Mes → Semana → Persona y Persona → Semana → Mes: owner y admin
   ven todo A, también al inactivo, y nada de B; `project_manager`,
   `team_manager` y `member` ven solo lo propio, también con un pedido que arma
   un admin desde la URL (`agrupar=mes&subagrupar=semana,persona&personas=…`);
   el owner de B no ve nada de A. `groupBys` vuelve a `REPORT_GROUP_BYS`.
10. **La pantalla** (A, unidad) —
    - `report-toolbar.test.tsx`: ocho enlaces en el orden de D-R10-5, con el
      rango; `aria-current` en «Semana» y en «Mes» cuando son la elegida.
    - `report-view.test.tsx`: el encabezado «Semana», «Mes» y «Mes / Semana /
      Fecha»; la fila de una semana con su rótulo y «solo …» en gris, y sin
      `partial` sin el gris; la de un mes con `<time dateTime="2026-10">`.
    - `report-tree-model.test.ts`: claves únicas con la misma semana debajo de
      dos meses.
    - `subgroup-picker.test.tsx` y `grouping-model.test.ts`: «Semana» y «Mes»
      en las opciones, en orden.
11. **El rendimiento** (A, §6.2) — Q25 a Q30, el pedido entero y las dos
    funciones de tramos dentro del presupuesto.
12. **Mes y semana de punta a punta** (A) — los recorridos 17 y 18 de §8.2.
13. **Lo existente sigue verde** (A) — lint, typecheck, `npm run test:all`,
    `next build` y la suite e2e entera. Las únicas afirmaciones existentes que
    cambian de valor son las listas de agrupaciones en orden (§1).
14. **Los esquemas** (B, unidad) — `reportGroupParams` pasa con `descripcion` y
    no con `descripción`, `Descripcion` ni `descripciones`; `reportReadyState`
    admite un grupo de descripción con `null` y con `{ id, text, truncated }`,
    y rechaza un `id` con mayúsculas o de 31 caracteres, un `text` vacío y uno
    de 101 puntos de código; **admite uno de 100 emojis**; `levelsShown: 0`
    pasa con `groups: []` y no con un grupo; `levelsShown` −1 no pasa.
15. **Por descripción** (B, integración) —
    - «Reunión» en P1 y en P2, de dos personas, es una fila con la suma;
      «reunión» es otra; «Reunión semanal» y «Reunión semanal» (dos espacios)
      son dos; «Reunión» en NFD sembrada por SQL es otra;
    - **«Reunión » con un espacio final, sembrada por SQL** (la aplicación
      recorta, `time-entry/schema.ts:60-64`), es otra fila, y su `text`
      conserva el espacio;
    - la cadena vacía es «Sin descripción» (`null`); orden por duración, empate
      por el texto y «Sin descripción» después de una de igual duración;
    - una de 3000 caracteres da los 100 primeros y `truncated`; dos de 150 que
      comparten los 100 primeros son dos grupos con el mismo `text` y `id`
      distintos;
    - **una de exactamente 100 emojis da `truncated: false` y su texto entero;
      una de 101 emojis da `truncated: true` y los 100 primeros** (los dos
      bordes, contados en puntos de código);
    - el `id` es el que calcula el test con `node:crypto` (los 32 primeros
      hexadecimales del SHA-256 del texto en UTF-8), también para un texto con
      `\`;
    - el total y el facturable, los de «Persona».
16. **Los niveles y los filtros** (B, integración) — `[description, project]`:
    debajo de «Reunión», P1 y P2 con lo suyo; `[person, description]`: cada
    persona con sus textos; `[project, description, date]`: el camino entero;
    `[description, project]` con `[P1]`: los hijos solo de P1 y el total
    filtrado.
17. **El tope del primer nivel** (B, integración) — una persona con 3001
    entradas de un minuto y descripciones distintas, sembradas con SQL:
    - por descripción, `levelsShown: 0`, `groups: []`, el total de 3001 minutos
      por `entryTotals`, una llamada a `totalsByLevels` con `limit: 3001` y una
      a `entryTotals`, con el mismo `Executor` de la transacción;
    - **Descripción → Proyecto con 3001: una sola llamada a `totalsByLevels`
      (`limit: 3001`), `levelsShown: 0` y `groups: []`**;
    - con 3000 (una entrada borrada), `levelsShown: 1`, 3000 grupos y ninguna
      llamada a `entryTotals`; Descripción → Proyecto con 3000: el nivel 2 no
      se pide y `levelsShown: 1`;
    - por persona sobre los mismos datos, una fila y `limit: 3001` en el nivel 1.

    Los dos tests de R3b afirman `[3001, 2701]`.

18. **El alcance** (B, `scope.integration.test.ts`) — el fixture da a cada
    entrada de A una descripción propia de su persona, y una vacía al inactivo.
    Por descripción y en Descripción → Persona → Proyecto: owner y admin ven los
    textos de A, y nada de B; `project_manager`, `team_manager` y `member` ven
    solo los suyos, también con un pedido que arma un admin desde la URL
    (`agrupar=descripcion&personas=…`); **`JSON.stringify` del estado de un
    member no contiene el texto de ninguna entrada ajena**, tampoco agrupando
    por persona, proyecto o etiqueta; el owner de B no ve textos de A.
    `groupBys` vuelve a `REPORT_GROUP_BYS`.
19. **La pantalla** (B, unidad) —
    - `report-view.test.tsx`: la fila de una descripción con su texto, y con
      «…» si está recortada; «Sin descripción» en gris; un texto con `<b>` y
      `&` sale escapado; con `levelsShown: 0`, la fila de `firstLevelLimit`,
      el encabezado del primer nivel, sin filas de grupos, sin la línea del
      tope de R3 y sin el segundo vacío aunque haya filtros.
    - `report-toolbar.test.tsx`: nueve enlaces; `report-tree-model.test.ts`:
      la clave de la descripción y `sin-descripcion`.
20. **El rendimiento y el peso** (B, §6.3 y §6.4) — Q31 a Q34, los dos pedidos
    enteros, Q2, Q5 y Q11 con `limit 3001`, y las dos mediciones de peso dentro
    de su presupuesto.
21. **Descripción de punta a punta** (B) — los recorridos 19 y 20 de §8.2.
22. **Lo existente sigue verde** (B) — como el 13. Cambian de valor, además, las
    dos afirmaciones de `limit` de R3b.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo               | Archivo                                                                                                                              | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad             | `src/server/time/time.test.ts`                                                                                                       | el primer tramo en el primer día de su semana y no en `first` (cae en el de 54); el último sin cortar en `last`; `weekStart` ignorado (siempre lunes); el inicio sumando `7 × 24 h` en lugar de `startOfDayKey` (cae en Madrid); el inicio con la 00:00 local armada a mano en lugar de `startOfDayKey` (cae en Santiago); el fin sin el día siguiente; la zona del proceso en lugar de la recibida (cae en `test:time-ar`); el mes desde el día 1 del primero; `bucketDays` sin restar uno; el año siempre o nunca en `monthLabel` |
| 2        | unidad             | `report/schema.test.ts`                                                                                                              | `semana` sin entrada en el mapa; la comparación sin distinguir mayúsculas; `partial` no nulable                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3        | integración        | `service.integration.test.ts`; `scope.integration.test.ts`                                                                           | los tramos de la fecha leídos de otra clave de `buckets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4        | integración        | `service.integration.test.ts`                                                                                                        | `weekStart` fijo en lunes; los cortes en UTC y no en la zona del perfil; `partial` siempre `null`; la semana ordenada por duración; el rótulo con «Esta semana»                                                                                                                                                                                                                                                                                                                                                                     |
| 5        | integración        | `service.integration.test.ts`                                                                                                        | el mes por `dayKey` en UTC; `partial` con el mes entero; el año siempre en el rótulo                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6        | integración        | `service.integration.test.ts`                                                                                                        | `partial` sin los grupos de tiempo de arriba (la semana debajo de septiembre sin «solo»); **`countedDays` que solo mira al padre directo** (cae en `[month, person, week]`: con la persona en el medio, la semana sale sin «solo»); los dos meses con los mismos cortes; `matchesFilter` sin aplicar en una lectura con tramos                                                                                                                                                                                                      |
| 7        | integración, tipos | `service.integration.test.ts`; `report/scope.test-d.ts`                                                                              | cada guarda nueva quitada de a una; la guarda de la fecha sola, como en R3; `ReportBuckets` como `Record<string, TimeBuckets>`                                                                                                                                                                                                                                                                                                                                                                                                      |
| 8        | integración        | `service.integration.test.ts`                                                                                                        | todos los tramos en todas las lecturas (cae en la guarda o en la afirmación); `weekBuckets` con `1` en lugar de `settings.weekStart`                                                                                                                                                                                                                                                                                                                                                                                                |
| 9        | integración        | `scope.integration.test.ts`                                                                                                          | `inScope` solo en las lecturas sin tramos; `everyone` en las dimensiones de tiempo                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10       | componente         | `report-toolbar.test.tsx`; `report-view.test.tsx`; `report-tree-model.test.ts`; `subgroup-picker.test.tsx`; `grouping-model.test.ts` | «Semana» sin el rango; `partial` sin el gris o siempre visible; `<time>` sin `dateTime`; la clave de la semana sin la del padre                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11, 20   | manual             | informes de `backend-dev` y `frontend-dev`                                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12, 21   | e2e                | `e2e/reports.spec.ts`                                                                                                                | los del final de §8.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 13, 22   | todas              | las suites existentes                                                                                                                | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 14       | unidad             | `report/schema.test.ts`                                                                                                              | `.max(100)` de Zod en lugar de los puntos de código (cae con los emojis); `id` sin la forma; `levelsShown` sin bajar a 0; el `refine` de `groups` vacío quitado; `descripción` con tilde aceptada                                                                                                                                                                                                                                                                                                                                   |
| 15       | integración        | `service.integration.test.ts`                                                                                                        | `lower()` en la clave (junta «Reunión» y «reunión»); `btrim` en la clave (junta «Reunión » con «Reunión»); `regexp_replace` de espacios en la clave; la clave por el texto recortado (junta las dos de 150); `md5` en lugar de `sha256`; `::bytea` en lugar de `convert_to` (cae con `\`); el `id` del texto recortado; «Sin descripción» como un texto vacío y no `null`; `truncated` con `>=` (cae con los 100 emojis); `left` en bytes u octetos (cae con los emojis); «Sin descripción» primero en el empate                    |
| 16       | integración        | `service.integration.test.ts`                                                                                                        | colgar por la última clave (con descripción en el medio); la descripción unida a otra tabla que multiplica filas                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 17       | integración        | `service.integration.test.ts`                                                                                                        | el nivel 1 sin `limit`; `limit` sin el `+ 1` (3001 se ve como 3000); mostrar las primeras filas del nivel 1 que no entra; el total como suma del nivel 1 cortado; `entryTotals` con `db`; `>=` en lugar de `>`; **leer el nivel 2 con el nivel 1 cortado** (cae en Descripción → Proyecto con 3001: dos llamadas)                                                                                                                                                                                                                   |
| 18       | integración        | `scope.integration.test.ts`                                                                                                          | `inScope` sin aplicar en la dimensión de descripción; el texto de las entradas ajenas en el estado de un member por algún otro camino                                                                                                                                                                                                                                                                                                                                                                                               |
| 19       | componente         | `report-view.test.tsx`; `report-toolbar.test.tsx`; `report-tree-model.test.ts`                                                       | el «…» siempre o nunca; «Sin descripción» sin el gris; `dangerouslySetInnerHTML` (cae con `<b>`); el árbol dibujado con `levelsShown: 0`; la línea de R3 en lugar de la fila; el segundo vacío con `levelsShown: 0`                                                                                                                                                                                                                                                                                                                 |

**Mutante declarado equivalente:** `char_length(key)` reemplazado por
`length(key)` en `truncated`: en Postgres los dos cuentan caracteres de un
`text`. Antes de darlo por equivalente, `test-engineer` corre el criterio 15
con el mutante —con las dos de 100 y 101 emojis, que separarían una cuenta en
bytes de una en caracteres— y anota que las respuestas son las mismas.
**Cualquier otro mutante declarado equivalente** se prueba antes con pedidos de
una membresía inactiva, de otro workspace y de un member con horas ajenas en el
rango.

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los dieciséis de R2a a R4b no cambian, salvo la lista del
segundo nivel de `:832-839`. Se suman cuatro, con la regla de §8.3 de R2a; la
persona del test es member en los cuatro y los nombres llevan el sufijo del
test.

17. **Por semana y por mes, con el primer día de la persona y los extremos
    cortados** (RP-11, RP-24; parte A). `setWeekStart(email, 0)` (domingo).
    Entradas en P1, salvo la del 01/10, en P2: sábado 2025-09-20 de 09:00 a
    09:15; martes 30/09 de 09:00 a 10:00; miércoles 01/10 de 09:00 a 09:30;
    viernes 10/10 de 09:00 a 09:20. La URL del 2025-09-20 al 2025-10-10 por
    «Persona».
    - «Semana»: la URL dice `agrupar=semana`; el encabezado, «Semana»; tres
      filas en orden: «14/09/2025 – 20/09/2025» con «solo 20/09/2025» y 0:15;
      «28/09/2025 – 04/10/2025» sin «solo» y 1:30; «05/10/2025 – 11/10/2025»
      con «solo 05/10/2025 – 10/10/2025» y 0:20. Total 2:05. La semana del
      21/09, sin horas, no está.
    - Al recargar, lo mismo.
    - «Mes»: «septiembre de 2025» con «solo 20/09/2025 – 30/09/2025» y 1:15;
      «octubre de 2025» con «solo 01/10/2025 – 10/10/2025» y 0:50.

    Los rótulos los calcula el recorrido con `dayRangeLabel` y `monthLabel` de
    `days.ts`, con la regla del año, para que no dependan del día en que corre.

18. **Mes → Semana, la semana partida y un filtro** (RP-12, RP-25; parte A).
    Las mismas entradas y el mismo período, desde
    `agrupar=mes&subagrupar=semana`:
    - dos filas, cada una con su botón; abrir «septiembre de 2025»:
      «14/09/2025 – 20/09/2025» con «solo 20/09/2025» y 0:15, y «28/09/2025 –
      04/10/2025» con «solo 28/09/2025 – 30/09/2025» y 1:00; abrir «octubre de
      2025»: «28/09/2025 – 04/10/2025» con «solo 01/10/2025 – 04/10/2025» y
      0:30, y «05/10/2025 – 11/10/2025» con «solo 05/10/2025 – 10/10/2025» y
      0:20;
    - «Proyectos» → P1 → «Aplicar»: la URL conserva `agrupar=mes` y
      `subagrupar=semana` y suma `proyectos`; «septiembre de 2025» con 1:15 y
      «octubre de 2025» con 0:20; abrir octubre: solo «05/10/2025 –
      11/10/2025»; total 1:35;
    - «Segundo nivel» → «Fecha»: la URL dice `subagrupar=fecha` y conserva
      `proyectos`.
19. **Por descripción, con «Sin descripción», las mayúsculas y el texto largo**
    (RP-11, RP-28; parte B). En la semana anterior a la de hoy: lunes «Reunión
    {sufijo}» en P1 de 09:00 a 10:00; martes «Reunión {sufijo}» en P2 de 09:00 a
    09:30; miércoles «reunión {sufijo}» en P1 de 09:00 a 09:20; jueves sin
    descripción en P1 de 09:00 a 09:15; viernes, un texto ASCII de 150
    caracteres que empieza con el sufijo, en P2 de 09:00 a 09:10. Desde
    «Persona»:
    - «Descripción»: la URL dice `agrupar=descripcion`; cuatro filas en orden:
      «Reunión {sufijo}» con 1:30, «reunión {sufijo}» con 0:20, «Sin
      descripción» con 0:15 y los 100 primeros caracteres del largo con «…» y
      0:10; total 2:15;
    - «Segundo nivel» → «Proyecto»; abrir «Reunión {sufijo}»: P1 con 1:00 y P2
      con 0:30;
    - «Proyectos» → P2 → «Aplicar»: «Reunión {sufijo}» con 0:30 y el largo con
      0:10; total 0:40. Al recargar, lo mismo.
20. **El primer nivel que no entra** (RP-11, D-R10-10; parte B).
    `seedNumberedEntries` con 3001 entradas de un minuto el lunes de la semana
    anterior a las 09:00, sin proyecto, con el sufijo del test. Desde
    «Persona»:
    - «Descripción»: el encabezado «Descripción»; la fila de
      `FIRST_LEVEL_LIMIT` y ninguna fila de grupo; total 50:01; sin la línea
      del tope de R3;
    - «Proyecto»: «Sin proyecto» con 50:01;
    - «Segundo nivel» → «Descripción»: «Sin proyecto» sin botón de expandir, y
      la línea del tope de R3 (el segundo nivel tiene 3001 filas y su
      presupuesto es 2999).

Los mutantes que tienen que caer en e2e, corridos en una copia con puerto
propio: el primer día de la semana ignorado (con lunes, los rótulos del 17 son
otros); `partial` ausente (17); el `partial` sin los grupos de arriba (la semana
partida del 18 sin «solo»); un enlace que pierde `subagrupar` o los filtros
(18); la descripción agrupada sin distinguir mayúsculas (19 tiene tres filas);
el texto largo sin recortar o sin «…» (19); el primer nivel cortado que muestra
filas o el vacío (20); el total del 20 como suma de un nivel cortado (daría 0:00
o menos de 50:01).

### 8.3 La regla de los e2e

La de §8.3 de R2a, con D-R10-14. Los cuatro recorridos son de alcance propio y
afirman el total. El 17 y el 18 cambian el primer día de la semana de su propia
persona; ninguno toca la membresía del owner ni el workspace.

### 8.4 Lo que no se prueba en e2e

- **Las zonas, los cambios de horario, la medianoche que no existe y el día que
  falta**: criterios 1, 4 y 5.
- **El alcance con `everyone`**: criterios 6, 9 y 18.
- **El tope con exactamente 3000**: criterio 17.
- **Las variantes de un texto** (NFD, espacios internos y de borde, `\`,
  emojis) y el hash: criterio 15.
- **El driver de Neon**: sin forma nueva (D-R10-7).
- **El volumen y el peso**: §6.

## 9. Riesgos y deuda conocida

- **Dos personas que miran el mismo período por semana ven semanas distintas**
  si sus primeros días de la semana difieren, como dos zonas ven días
  distintos (RP-22). Es correcto y cada fila lo dice con sus días; no hay línea
  aparte (D-R10-3).
- **Las variantes de un texto separan grupos** (D-R10-8): mayúsculas, espacios
  internos y formas de Unicode. Si el usuario prefiere juntarlas, es la
  pregunta 2 de §10, y el cambio queda en la clave de una sola fila de la
  tabla de dimensiones.
- **El texto se ve recortado a 100 caracteres sin forma de leerlo entero** en el
  reporte: no hay tooltip (como F3 de R4b). Se lee en el rastreador o en la
  exportación de las entradas.
- **«Descripción» de todo el equipo en un período largo no se muestra** (§10,
  nota 3): la línea lo dice y ofrece acortar, filtrar o cambiar de agrupación.
- **R6 y R7 heredan un estado con `levelsShown: 0`**, sin grupos: qué exportan
  entonces es de su contrato (D-R10-12).
- **El HTML de la primera carga puede llegar a 2,5 MB** con 3000 descripciones
  en el primer nivel (§6.4): es la primera pantalla que dibuja tantas filas
  abiertas.
- **El hash se calcula en la base** con `sha256` y `convert_to`: si una base no
  tuviera UTF-8 como codificación, el `id` cambiaría. Neon y los tests usan
  UTF-8; el criterio 15 lo fija comparando con `node:crypto`.
- **Fecha → Semana y Semana → Fecha son poco útiles al revés**, y se permiten
  (D-R10-6).
- **«Agrupar por» con nueve enlaces** se parte en más renglones en pantallas
  angostas; el desborde del shell ya está en la deuda.
- **El cambio del `limit` del primer nivel** toca una decisión de R3, dos
  afirmaciones de R3b y dos comentarios (§1); para las dimensiones con
  catálogo no cambia nada visible.
- **Las ediciones mecánicas fuera del reparto** de los pasos 1 y 10 repiten el
  desvío de R3 y R4, escritas en el orden.
- **Lo de Clockify sin verificar** (P-05): cómo rotula una semana y un mes, si
  corta los tramos en los extremos del período, el orden de las agrupaciones en
  pantalla y si la descripción distingue mayúsculas.

## 10. Pendiente del usuario y preguntas abiertas

1. **Partir el slice** (team-lead). **Resuelto**: el team-lead aceptó la
   partición; la A se mergea como R10a y la B como R10b (D-R10-1, §7).
2. **Cómo se agrupa una descripción** (usuario). El contrato agrupa por el texto
   exacto: «Reunión» y «reunión» son dos filas (D-R10-8). **Resuelto**: el
   usuario lo aceptó así el 2026-10-09. Juntar mayúsculas y espacios en la base depende de la
   colación de cada base, y obliga a elegir cuál de los textos se muestra. No
   bloquea: la A no la necesita y la B arranca con el texto exacto.
3. **Nota para el usuario, no es pregunta: el tope ahora alcanza al primer
   nivel** (D-R10-10). Con el volumen de §6 (30 personas, 8 entradas por día
   hábil), **«Descripción» de todo el equipo en «Este año» no se muestra**: son
   unos 12 700 textos distintos, y la pantalla dice «El primer nivel pasa de
   3000 filas y no se muestra…» con el total arriba. **Un mes del equipo sí
   entra** (unos 1250), y un año de una persona también. Para las otras
   agrupaciones no cambia nada.
4. **P-05 en el workspace de Clockify** (usuario, sesión de relevamiento): el
   rótulo de una semana y de un mes, si los tramos se cortan en los extremos del
   período, el orden de «Group by» en pantalla y si «Description» distingue
   mayúsculas. Queda lo de este contrato hasta entonces. No bloquea.

## 11. Fuera de alcance

- Filtrar por descripción (RP-25 en el resto, fase 3) y «Sin descripción» como
  filtro (`withoutDescription`, RP-26 en el resto).
- Agrupar por año: no está en la lista de Clockify.
- El texto entero de una descripción en el reporte (tooltip o detalle).
- Las semanas y los meses sin horas, con cero: el gráfico de R5 los completa
  para sus barras; en la tabla, como los días, no se muestran.
- Numerar las semanas («Semana 40»).
- Una línea con el primer día de la semana (D-R10-3).
- Lo abierto en la URL: sigue la decisión de R3.
- Qué exportan R6 y R7 con `levelsShown: 0` (D-R10-12).
- Gráfico (R5), exportación (R6, R7), personas sin horas (R9).
- RP-14, RP-36, RP-09 y el importe por grupo, como en R2a.
