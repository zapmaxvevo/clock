# Núcleo de reportes, R5: gráfico de barras

Contrato del séptimo slice del núcleo de reportes. Extiende la pantalla
`/reportes` y el módulo `src/modules/report/` de R10b: suma, entre los totales y
la tabla, un gráfico de barras con las horas del período por día, por semana o
por mes según el largo del período, cortadas con los tramos de
`src/server/time` y leídas en la misma foto que el resto de la página. Sin
cambios de tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-15 (por día,
  documentado: «The bar chart shows you the summary of all time entries for
  each day in the selected date range.»; la granularidad por largo del período
  es nuestra, aceptada con el ADR 0021), RP-18 (el total), RP-22 (los días en la
  zona de quien mira), RP-24 (la semana empieza el día de quien mira) y RP-33
  («con los gráficos ocultos» sin horas). RP-16 (barras partidas) y RP-17
  (torta) quedan fuera del núcleo (ADR 0020, condición segunda). Se apoya en
  RP-21, RP-23, RP-25, RP-30, RP-32 y RP-34 tal como los dejaron R2a a R10b.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R5».
  Depende de R2b (los cortes) y de R10a (los tramos por semana y por mes), y va
  en serie después de R10b, que está entero en `main` (merge `b0262e0`). Lo
  pidió el usuario como el próximo slice el 2026-10-10 (`0b249ba`).
- **Un solo slice, sin partes** (D-R5-1).
- **Revisión del contrato:** la primera ronda de `architecture-reviewer` pidió
  cambios, todos aplicados: el límite entre el componente de servidor y el de
  cliente (M1: `ChartBars` dibuja la línea del valor, las columnas y las
  marcas, §5.2 y §5.3, con cada prop nombrada); el estado de `ChartBars` entre
  navegaciones (M2: `ReportChart` se monta con la `key` de `ReportTree`, con su paso en el
  recorrido 21 y su mutante); el foco visible sobre una barra en cero (M3: el
  elemento enfocable es la columna entera, marcada y con contorno, D-R5-9,
  criterio 11 y §5.5); de 6 a 13 barras por mes (m1); «mié, 30/09» en 2026
  (m2); el mutante del primer nivel que coincide, pasado al criterio 8 con su
  caso (m3); el puntero y el foco a la vez, con dos afirmaciones más en el
  recorrido 21 (m4); y las notas: el mutante sin el `+ 1` (n1), el motivo de
  D-R5-3 (n2), el foco itinerante como desvío del mapa (n3, abajo y §10.2), la
  alternativa de peso de §6.4 (n4), un solo nombre para el gráfico (n5) y las
  filas de §8.1 de `test-engineer` (n6).
  La segunda pasada lo aprobó con dos menores y una nota, aplicados por el
  team-lead: el mutante de M2 es «`ReportChart` montado sin `key` en
  `ReportView`», el recorrido 21 siembra y espera la semana actual con
  domingo (no con `currentWeekRange`) y el contorno del foco va hacia adentro
  (`-outline-offset-2`).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): «los totales de la
    cabecera, los grupos y el gráfico salen de la misma lectura, en una
    sentencia o en una transacción de solo lectura en `repeatable read`»; los
    tramos los calcula `src/server/time` en la zona de quien mira y la base solo
    compara instantes con `width_bucket`; «ninguna cuenta de zona horaria se
    escribe en SQL»; la granularidad del gráfico sale del largo del rango y «el
    contrato del slice del gráfico puede moverla».
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): toda
    lectura recibe el `ReportScope`, que solo arma el service, y toda función
    nueva del repository suma su test de integración donde un `member` no ve
    nada ajeno.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): los rótulos que
    dependen de la zona se arman en el servidor con las funciones de
    `src/server/time` y los formatos de `timeSettingsOf`.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    el gráfico no lee nada de otro módulo.
  - [ADR 0015](../adr/0015-el-tema-se-resuelve-en-el-servidor.md): el tema
    claro u oscuro lo resuelven los tokens de `globals.css`; el gráfico no
    elige colores por tema.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** Los
  umbrales del ADR 0021 quedan como están (D-R5-4). Dos frases de contratos
  anteriores no se sostienen tal cual contra el árbol y este contrato las
  ajusta (D-R5-3, D-R5-5): D-R10-12 decía que R5 «lee `totalsByLevels`» y que
  «no necesita otra función de tiempo». **Un desvío del mapa, sin ADR**: el
  mapa (§3, R5) pide «sin JavaScript de cliente más que el de mostrar el valor
  al pasar»; este contrato suma el foco itinerante entre las barras, que
  también es JavaScript de cliente (D-R5-7, D-R5-9, §10.2). Lo que queda para
  el usuario o el team-lead está en §10.

Decisiones que el contrato da por tomadas (R2a a R10b, mapa §5, `reportes.md`
§8): solo owner y admin ven horas ajenas; un member con un enlace que nombra a
otras personas ve lo propio; el tope de 366 días; el timer en curso no se
muestra ni se suma; los filtros de R4 se aplican a todo lo que la página suma;
la regla de los e2e de §8.3 de R2a.

## Decisiones del contrato

**D-R5-1 — Un solo slice.** Opciones: (1) un slice; (2) dos partes, como R10:
la lectura y las barras primero, la interacción y la tabla de datos después.
**(1).** Trae una lectura más sobre una maquinaria que no cambia, un campo del
estado y un componente; no toca ninguna decisión anterior ni ninguna forma de
parámetro. Partirlo dejaría desplegada una primera parte con un gráfico que
solo se lee con el mouse, que es justo lo que D-R5-9 no admite.

**D-R5-2 — Qué suma el gráfico.** Cada barra es el total de un tramo con
**el mismo alcance y los mismos filtros que la cabecera**: el `readScope` de
`readReport` (el de `scopeOf`, angostado por las personas elegidas,
`service.ts:706`) y el filtro efectivo de cliente y proyecto
(`service.ts:703-704`), dentro de la misma transacción `repeatable read`,
`read only` (`service.ts:777-781`). Opciones descartadas:

- **sumar los grupos del primer nivel cuando son la misma dimensión de tiempo
  que el gráfico**: ahorra una sentencia solo por fecha, semana o mes con el
  largo justo, y deja dos caminos —uno que puede venir cortado por el tope de
  R10b— con un test cada uno. La lectura cuesta lo medido en §6;
- **leer el gráfico en otra transacción**: cabecera y barras podrían sumar
  distinto si alguien carga horas entre las dos (ADR 0021).

Consecuencias:

- **Las barras suman el total** (RP-18): cada entrada cerrada del período cae
  en exactamente un tramo, porque los tramos cubren el intervalo entero y la
  lectura no une etiquetas. Vale también agrupando por etiqueta —donde las
  filas pueden pasar el total— y con el primer nivel que no entra (D-R10-10).
  El esquema lo exige (§4.1).
- **El gráfico no muestra el facturable.** Partir la barra es RP-16, fuera del
  núcleo.
- **Un member ve lo propio** también en el gráfico, con cualquier URL
  (D-R4-4): la lectura usa el mismo `readScope`.

**D-R5-3 — Una función nueva del repository, `totalsByBucket`, sobre la
sentencia de `totalsByLevels`.** D-R10-12 suponía que R5 llamaría a
`totalsByLevels` con `[date]`, `[week]` o `[month]`. Contra el árbol eso no se
sostiene bien: dieciséis afirmaciones de `service.integration.test.ts` cuentan
las llamadas a `totalsByLevels` o leen la primera (`:1075`, `:1088`, `:1717`,
`:1782`, `:1799`, `:1811`, `:1829`, `:1946`, `:2046`, `:2071`, `:3267`,
`:3612`, `:3627`, `:3645`, `:3657`, `:3668`); una llamada más por página
cambiaría el valor de todas y borraría lo que dicen («el nivel 2 no se pide»,
«una sola llamada con el primer nivel cortado»). Opciones:

1. llamar a `totalsByLevels` y corregir las dieciséis;
2. **una función nueva, `totalsByBucket(scope, read, tx)`**, con su tipo de
   lectura y de fila, que arma **la misma sentencia** que `totalsByLevels`: el
   cuerpo de hoy (`repository.ts:626-713`) pasa a una función privada que
   llaman las dos;
3. una sentencia propia para el gráfico, más corta: una sola subconsulta con
   `width_bucket` y `group by`.

**(2).** Comparten la sentencia entera: la subconsulta por entrada con la clave
de `timeDimension.key` (`repository.ts:517-531`), `entrySeconds`, `inScope`,
`closedIn` y `matchesFilter`, la suma de afuera con `::bigint`, y las guardas
(`checkEntryRead`, `checkLevelRead`). No hay un segundo camino de cortes, que
es lo que el ADR 0021 y D-R10-12 cuidan. (3) llamaría a las mismas funciones de
alcance y de filtros, pero sería una segunda sentencia que agrega sobre
`time_entry`, con su propia forma de sumar y de asignar el tramo, que habría
que mantener igual a la de los niveles a mano; el test que ata el reporte con
la planilla (ADR 0021) solo mira una de las dos. Con (2) cambia solo el punto
de entrada: la fila es `{ bucket, seconds }` en lugar de un `LevelGroupRow` de
una sola dimensión, la lectura no lleva `limit` (§4.3) y los espías de los
tests existentes no la cuentan. Por ser una función nueva, suma su test de
alcance (criterio 10) y su línea en `scope.test-d.ts`.

**D-R5-4 — La granularidad sale del largo del período, con los umbrales del ADR 0021.** Con `días = daysBetweenKeys(first, last) + 1`:

| Período           | Granularidad | Barras    |
| ----------------- | ------------ | --------- |
| de 1 a 31 días    | día          | de 1 a 31 |
| de 32 a 182 días  | semana       | de 5 a 27 |
| de 183 a 366 días | mes          | de 6 a 13 |

- **No se mueven.** 31 días cubren cualquier mes y los atajos «Hoy», «Ayer»,
  las semanas, «Últimas dos semanas», «Este mes» y «Mes pasado», que van por
  día; 182 son las 26 semanas del ADR; «Este año» y «Año pasado» van por mes.
  El peor caso de barras es 31, por día: a 320 px, con la columna de las horas,
  quedan unos 7 px por barra, que se leen (§5.2). Bajar el umbral del día a 14
  pasaría «Este mes» a semanas cortadas, que se leen peor; subir el de la
  semana a 366 días daría hasta 54 barras de unos 4 px. Con 183 días que
  empiezan el día 1 (del 1/7 al 30/12) son 6 meses.
- **El gráfico no sigue a la agrupación.** Agrupar por semana un período de 21
  días deja la tabla por semana y el gráfico por día; agrupar por persona no
  cambia nada del gráfico. La granularidad es una propiedad del período: así
  el gráfico de un período es siempre el mismo, cambie lo que cambie la tabla.
- **Convive con R10a sin un segundo juego de cortes**: los tramos del gráfico
  salen de `timeBucketsOf` (`service.ts:633-646`), la misma función que arma
  los de un nivel de fecha, semana o mes, con el mismo período, la misma zona y
  el mismo primer día de la semana. Se calculan aparte aunque un nivel use la
  misma dimensión: son los mismos instantes y cuestan lo de §6.2. Por eso, un
  período de 32 a 182 días agrupado por semana da barras con los mismos
  rótulos, los mismos «solo …» y las mismas duraciones que las filas de semana
  (criterio 6).
- **El primer día de la semana** es el de `settings.weekStart`, que arma
  `timeSettingsOf` (ADR 0012, RP-24): las mismas horas vistas con domingo y con
  lunes dan semanas distintas. El día y el mes no dependen de él.
- `chartGranularityOf(range)` es una función pura de un archivo nuevo,
  `report/chart.ts`, con los dos umbrales como constantes en `report/schema.ts`
  (§4.1).

**D-R5-5 — Una barra por tramo, rotulada como la fila de la tabla.**

- **Una barra por cada tramo de `TimeBuckets`**, en orden, también las que no
  tienen horas, en cero. El service las completa: la lectura trae solo los
  tramos con entradas.
- **El día que falta entero** (`Pacific/Apia`, 2011-12-30) tiene su tramo
  repetido (ADR 0021): su barra existe, en cero, y el día siguiente se lleva
  sus horas. Sacarla obligaría a deduplicar cortes en el service, que el ADR
  0021 dejó en manos de `width_bucket`.
- **El rótulo y `partial` salen de la misma función que rotula los grupos de
  tiempo de la tabla**: los tres casos de tiempo de `groupOf`
  (`service.ts:255-285`) pasan a una función privada, `timeGroupOf`, sin
  cambiar su resultado, y el gráfico la llama con el camino de un solo grupo.
  El día, «jue, 01/10», sin «Hoy» ni «Ayer» (D-R2b-6); la semana entera,
  «28/09 – 04/10»; el mes, «octubre»; con el año si no es el de hoy, por la
  regla de la tabla (D-R10-3). La semana y el mes cortados por el período
  llevan `partial` con los días que cuentan; las del medio, `null`.
- **La marca del eje** (`tick`) es corta y sin año: por día y por semana, el
  primer día que cuenta la barra con `formatDayKey(día, formato, false)`
  («01/10», o «10-01» con `yyyy-MM-dd`); por mes, el nombre abreviado, «oct»,
  con una función nueva de `src/server/time`, `monthShortLabel`. Es la segunda
  frase de D-R10-12 que no se sostiene: con el nombre entero («septiembre»),
  siete marcas no entran en 214 px. El año lo dicen el período de la barra de
  herramientas y el nombre de cada barra.
- **Cambios de horario**: no hacen nada especial. La base compara instantes con
  los cortes de `startOfDayKey`; un día de 23 o 25 horas es una barra con sus
  horas, y una semana de 169 horas, otra.

**D-R5-6 — Sin horas, sin gráfico.** `chart` es `null` si la lectura del
gráfico no trae ninguna fila: no hay entradas cerradas del alcance y los
filtros en el período. RP-33 dice «con los gráficos ocultos»; vale para los dos
vacíos, el del período y el de los filtros. **Con el primer nivel que no entra
(D-R10-10) hay gráfico**: hay horas, y el gráfico es la única forma de verlas
repartidas. Una entrada de menos de un segundo es una fila con 0 segundos: hay
gráfico, con las barras en cero. La regla mira la lectura del gráfico, no los
grupos.

**D-R5-7 — Barras en HTML y CSS armadas en el servidor; un componente de
cliente para el foco y el valor.** Opciones: (1) SVG armado en el servidor; (2)
HTML y CSS; (3) una biblioteca de gráficos. **(2).**

- (3) la descarta el mapa: pesa más que la pantalla y no hay ninguna en las
  dependencias.
- **Contra (1)**: con `viewBox`, el texto escala con el ancho y a 320 px las
  marcas quedan ilegibles; sin `viewBox`, el servidor no conoce el ancho y
  alguien tiene que medirlo con JavaScript. En SVG, lo que se dibuja después
  tapa lo de antes, sin `z-index`. Con (2), las alturas son porcentajes, el
  ancho lo reparte `flex`, el texto queda en el tamaño de la pantalla y los
  colores son las clases de los tokens (`bg-…`), como en el resto.
- **El servidor arma todo**: los rótulos llegan en el estado; la escala, las
  marcas, las alturas y los nombres los calcula el componente de servidor
  `ReportChart` con funciones puras (D-R5-8), y se los pasa ya armados a
  `ChartBars`.
- **El único JavaScript de cliente** es `ChartBars` (`"use client"`), que dibuja
  **la línea del valor, el área con las columnas y las marcas** (§5.2) y hace
  dos cosas: **muestra el valor** de la barra activa —con el puntero encima o
  con el foco— y **mueve el foco entre las barras** con las flechas, con una
  sola parada de tabulación (§5.3). Lo segundo es un desvío del mapa (§3, R5),
  que solo admitía mostrar el valor: sin foco itinerante, las 31 barras serían
  31 paradas de tabulación antes de la tabla, o el valor no llegaría con
  teclado. `ChartBars` recibe solo textos, números y booleanos, que se
  serializan
  (`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md:50`),
  nunca el estado entero, como `ReportTree` recibe solo los grupos. No formatea
  nada: por eso no necesita el `DisplayFormatsProvider` que `ReportScreen` no
  monta (`report-screen.tsx:19-44`).
- **Sin JavaScript** (antes de hidratar, o si falla), las barras se ven, la
  tabla de datos se abre (es un `<details>`) y solo falta la línea del valor.

**D-R5-8 — La escala y las marcas.** Funciones puras de
`report/components/chart-model.ts`, que llama `ReportChart`:

- **El paso del eje** es el menor de 15 min, 30 min, 1 h, 2 h, 5 h, 10 h, 20 h,
  50 h, 100 h… (1, 2 y 5 por cada potencia de diez desde la hora, sin tope) tal
  que cuatro pasos cubran la barra más alta. **El techo** es el menor múltiplo
  del paso que cubre la barra más alta, y como mínimo un paso. Las líneas van
  en 0, un paso, dos… hasta el techo: de dos a cinco. Todo en cero da 0:00 y
  0:15.
- **Los rótulos del eje** son `durationLabel` de cada línea, «h:mm» como el
  resto de la pantalla (RP-18): «0:00», «0:15», «2:00», «2000:00». La columna
  de la escala toma el ancho del rótulo más ancho, no del último: con dígitos
  proporcionales, «0:45» es más ancho que «1:00» (D3 de las revisiones).
- **La altura** de cada barra es su porcentaje del techo. Una barra con horas
  tiene al menos 2 px, así no se confunde con una en cero; una en cero no se
  dibuja (su columna sí, D-R5-9).
- **Las marcas del eje horizontal**: hasta siete, cada `ceil(n / 7)` barras
  desde la primera: con 31 días, una cada cinco (0, 5, … 30); con 27 semanas,
  cada cuatro; con 13 meses, cada dos; con siete o menos, todas. La de la
  primera barra va alineada al inicio, la de la última al final y el resto
  centradas, para que ninguna salga de la caja.
  _Corregido en la implementación (D1 de
  [las revisiones](correcciones-nucleo-reportes-r5-revisiones.md))_: a 320 y
  375 px las siete se pisaban (una marca de día mide de 36 a 40 px y el área,
  unos 214). **Con el área de las columnas por debajo de 24rem**, se ve una de
  cada dos de `tickIndexesOf` (`narrowTickIndexesOf`: con 31 barras, 0, 10, 20
  y 30), a lo sumo cuatro y siempre un subconjunto, con una container query
  sobre la fila de las marcas y sin JavaScript. `ChartBars` las calcula de
  `bars.length`, sin prop nueva.
- **Con una sola barra**, su ancho tiene un tope (48 px) y va centrada.
- Opción descartada: la escala en el service. No depende de la zona ni de los
  formatos, sino de las barras, y si R7 dibuja el gráfico en el PDF reusa las
  mismas funciones sin leer nada.

**D-R5-9 — Accesibilidad.**

- **Un `<figure>` nombrado por su `<figcaption>`**: «Horas por día», «Horas por
  semana» u «Horas por mes». **Es el único nombre del gráfico**: las columnas
  van directo en la figura, sin un contenedor con `role="group"` que repetiría
  el nombre.
- **Cada columna es el elemento enfocable**: la columna entera, de alto
  completo, con `role="img"`, el nombre y el `tabIndex`; la barra pintada va
  adentro, sin rol. El nombre: «mié, 30/09: 1:00», «28/09 – 04/10 solo 01/10 –
  04/10: 3:15». Así una barra en cero o muy baja se puede señalar, enfocar y
  ver enfocada. Las líneas de la escala, sus rótulos, las marcas y la línea del
  valor son `aria-hidden`: lo que dicen está en el nombre de cada columna.
- **Foco itinerante**: una sola columna tiene `tabIndex` 0 (al montar, la
  primera; después, la última que tuvo el foco) y las demás −1. Flecha derecha
  y abajo, la siguiente; izquierda y arriba, la anterior; Inicio y Fin, la
  primera y la última; sin dar la vuelta. Con Alt, Ctrl, Meta o Mayúsculas
  no hacen nada, así Alt+flecha sigue siendo «atrás» (D2 de las revisiones).
- **La columna activa** —la del puntero o, sin puntero encima, la del foco— se
  marca entera con `bg-muted` de fondo y su barra con el color activo (§5.4),
  y **la línea del valor**, arriba del gráfico, dice su nombre. **Con foco de
  teclado**, la columna lleva además un contorno de 2 px en `--foreground`, que
  se ve aunque la barra esté en cero. No se usa el anillo `ring-ring` de los
  botones del módulo (`report-tree.tsx:91`): una columna no tiene borde propio
  y ese gris da unos 2,6:1 contra el blanco.
  _Corregido en la implementación (P6 de las revisiones)_: con la barra activa
  a toda la altura, el contorno en `--foreground` pisaba la barra en
  `--primary` y no se distinguía. Con el foco visible, la barra se aparta 3 px
  de los bordes de la columna (margen en la barra, `FOCUSED_BAR_INSET`; con
  relleno en la columna las vecinas se movían): de 14,5 a 19,8:1 alrededor del
  contorno. A 320 px con 31 columnas la barra enfocada queda en ~0,6 px.
- **El equivalente en tabla**: debajo de las columnas, un `<details>` cerrado,
  «Ver los datos del gráfico», con una tabla de dos columnas —la de la
  granularidad («Fecha», «Semana» o «Mes», los rótulos de «Agrupar por») y
  «Duración»— y una fila por barra, también las en cero, con el rótulo, «solo
  …» en gris y la duración. Se abre con teclado sin JavaScript, la lee un
  lector de pantalla y la ve cualquiera que quiera los números juntos.
- **Contraste** (WCAG 1.4.11 y 1.4.3), con los tokens de §5.4: la barra contra
  el fondo, al menos 3:1 en los dos temas; la barra activa contra la normal,
  al menos 3:1; el contorno del foco contra el fondo de la columna activa, al
  menos 3:1; los rótulos, al menos 4,5:1. `frontend-dev` lo mide (§5.5).
- **Colores forzados** (`forced-colors`): los fondos desaparecen, así que las
  barras pasan a `CanvasText`, la activa a `Highlight` y la columna con el foco
  lleva un `outline` en `Highlight`, con la variante `forced-colors:` de
  Tailwind.

**D-R5-10 — Lo que no traba a los slices que siguen.**

- **R6, CSV y Excel**: exporta la forma del reporte; si suma una hoja o una
  sección con las barras lo decide su contrato. El estado ya trae `chart` con
  rótulos y segundos.
- **R7, PDF**: si va con gráfico (mapa §3), lo dibuja con sus primitivas desde
  `chart` y `chart-model.ts`; el HTML de este slice no viaja al PDF.
- **R9, personas sin horas**: suma grupos en cero; el gráfico no cambia.
- **El detallado y el tablero de la fase 3**: el tablero tiene su propio
  gráfico (RP-41); reusa `totalsByBucket` con su alcance.

**D-R5-11 — Volumen.** Una sentencia más por página, de la forma de Q5, Q25 y
Q26 sin `limit`, medida en §6 con `seed.sql` sin cambios. Ningún índice nuevo
sin una medición que lo pida (§6.5 de R3).

**D-R5-12 — Los e2e de R5.** Heredan §8.3 de R2a con lo de
`estado-fase1.md`: alcance propio, nombres con el sufijo del test, ninguna
afirmación sobre el total del workspace, horas «de hoy» siempre pasadas
(`00:00–00:01`) y esperar la respuesta del servidor —la URL nueva y la pantalla
dibujada (`expectReport`, `e2e/reports-page.ts:519`)— y no un estado ya
dibujado. Usan las entradas y el período fijo de 2025 de los recorridos 17 y 18
(`seedWeekEntries`, `WEEKS_RANGE`, `e2e/reports.spec.ts:1406-1453`), con el
domingo como primer día, así los cortes caen siempre en los mismos días; el
recorrido 21 suma una entrada de 00:00 a 00:01 el primer día de la semana
actual, solo para la navegación de cliente de M2.

**D-R5-13 — Lo que se prueba en unidad y lo que no.** Como D-R3-13 y D-R10-15:
el arnés de componentes es `renderToStaticMarkup` sin DOM
(`report-view.test.tsx:1`, `:43`). En unidad van los umbrales, la escala, las
marcas, la regla de las teclas (una función pura, `nextBarIndex`), la regla de
la columna activa (`activeBarIndex`), el marcado inicial del gráfico y su lugar
en la página. Que las teclas muevan el foco, que el puntero muestre el valor,
que una navegación vuelva a empezar el foco itinerante y el ancho a 320 px son
de los e2e.

## 0. Precondición de arranque

- **El árbol en `0b249ba`** (`main` con R10b mergeado en `b0262e0`, más un
  commit de docs). Las citas de abajo son de ese árbol. Los tests de
  integración y CI usan `postgres:18-alpine`; Neon también es 18. Todo test de
  tiempo fija reloj y zona.
- **Sin pendientes del usuario para arrancar.** Sin comprobación contra Neon:
  ninguna forma de parámetro nueva (la lectura del gráfico pasa un arreglo de
  `timestamptz` como la fecha desde R2b, D-R10-7). Las preguntas de §10 no
  bloquean.
- **La zona de los tests de tiempo**: `test:time-ar` corre `src/server/time` en
  Buenos Aires (`package.json:16`); `monthShortLabel` vive ahí y corre en las
  dos zonas sin cambiar el script. `report/chart.ts` es aritmética de claves
  sin zona. Los tests de integración fijan la zona del perfil en `settings`
  (Buenos Aires, Madrid, Samoa) con el proceso en UTC.

### Supuestos sobre el árbol, con archivo y línea en `0b249ba`

| Supuesto                                                                                                                                                                                                    | Dónde                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TimeContext` lleva `buckets`, `last`, `weekStart`, `todayKey` y `format`; `daysOf` lee los tramos de la fila de `time.buckets[kind]`                                                                       | `src/modules/report/service.ts:151-157`, `:173-179`                                                                                                                       |
| `countedDays` y `partialOf` cortan los días por el camino; con un camino de un solo grupo, por el período                                                                                                   | `service.ts:186-219`                                                                                                                                                      |
| `groupOf` rotula la fecha con `weekdayLabel`, la semana con `dayRangeLabel` y `partial`, el mes con `monthLabel` y `partial`                                                                                | `service.ts:255-285`                                                                                                                                                      |
| `timeBucketsOf` arma los tramos de una dimensión de tiempo con el período, la zona y `settings.weekStart`; `bucketsFor` los de los niveles                                                                  | `service.ts:633-646`, `:652-665`                                                                                                                                          |
| `readReport` lee los catálogos, calcula los filtros efectivos y `readScope`, los niveles y el total, todo con el `tx` que recibe                                                                            | `service.ts:691-726` (`:703-706`, `:707-713`, `:718-724`)                                                                                                                 |
| `getReportState` arma `span` y los tramos antes de la transacción `repeatable read`, `read only`, y el `TimeContext` después; el estado no tiene gráfico                                                    | `service.ts:765-773`, `:777-781`, `:782-788`, `:790-809`                                                                                                                  |
| `ReportBuckets`; `ReportLevelRead.limit` es opcional (B1/C2 de R10b lo dejó así)                                                                                                                            | `src/modules/report/repository.ts:142`, `:145-152` (`:150-151`); `correcciones-nucleo-reportes-r10b-revisiones.md:94-96`                                                  |
| `inScope`, `closedIn` y `matchesFilter` son la única traducción del alcance, del rango y de los filtros                                                                                                     | `repository.ts:160-171`, `:177-183`, `:196-221`                                                                                                                           |
| `timeDimension` pasa los cortes con `sql.param` y `::timestamptz[]` a `width_bucket`; `bucketIndexOf` valida el índice                                                                                      | `repository.ts:517-531`, `:258-264`                                                                                                                                       |
| `checkLevelRead` y `checkBuckets`: los tramos de cada dimensión de tiempo están si y solo si la dimensión está, no vacíos y cubriendo el `span`                                                             | `repository.ts:567-613`                                                                                                                                                   |
| `totalsByLevels` es una sentencia con `limit` opcional; `entryTotals` lee sin unir etiquetas                                                                                                                | `repository.ts:626-713` (`:698-700`), `:716-730`                                                                                                                          |
| Dieciséis afirmaciones cuentan o leen las llamadas a `totalsByLevels`                                                                                                                                       | `service.integration.test.ts:1075`, `:1088`, `:1717`, `:1782`, `:1799`, `:1811`, `:1829`, `:1946`, `:2046`, `:2071`, `:3267`, `:3612`, `:3627`, `:3645`, `:3657`, `:3668` |
| Unos tests simulan `totalsByLevels` con filas armadas a mano y llaman a `getReportState`                                                                                                                    | `service.integration.test.ts:1972-1989`                                                                                                                                   |
| `scope.test-d.ts` afirma que cada función del repository exige el alcance                                                                                                                                   | `src/modules/report/scope.test-d.ts:33-46`                                                                                                                                |
| `REPORT_TIME_GROUP_BYS`; `reportReadyState` con el `refine` de D-R10-10                                                                                                                                     | `src/modules/report/schema.ts:84-89`, `:481-526`                                                                                                                          |
| Cinco estados `ready` armados a mano en los tests                                                                                                                                                           | `schema.test.ts:412`, `:970`, `:1135`; `components/report-view.test.tsx:22`; `components/report-toolbar.test.tsx:26`                                                      |
| `formatDuration`, `formatDayKey` con `withYear`, `weekdayLabel`, `TimeBuckets`, `dayBuckets`, `weekBuckets`, `monthBuckets`, `bucketDays`, `monthLabel` (con `LLLL`, `es`, en UTC), `dayRangeLabel`         | `src/server/time/index.ts:64-69`, `:263-282`, `:333-340`, `:446-455`, `:463-490`, `:526-545`, `:551-558`, `:609-626`                                                      |
| El abreviado de `es` de `date-fns` es «ene» … «sep», «oct» … «dic»                                                                                                                                          | `node_modules/date-fns/locale/es/_lib/localize.js:17-30`                                                                                                                  |
| `ReportView` es de servidor: la línea del alcance, la zona, los totales en un `<dl>`, la línea del tope y la tabla, en ese orden                                                                            | `components/report-view.tsx:27-104` (`:46-59`, `:61-63`, `:65-102`)                                                                                                       |
| `ReportView` monta `ReportTree` con `key={reportHref({ range, groupBy, subgroups, filters })}`: cada navegación vuelve a empezar su estado                                                                  | `components/report-view.tsx:88-98`                                                                                                                                        |
| `ReportScreen` no monta `DisplayFormatsProvider`; `ReportTree` es el único componente de cliente de la tabla y recibe solo los grupos                                                                       | `components/report-screen.tsx:19-44`; `components/report-tree.tsx:1`, `:21`                                                                                               |
| `durationLabel` trunca al minuto; `partialDays` es «solo {días}»; `groupByLabels` rotula «Fecha», «Semana» y «Mes»                                                                                          | `components/group-heading.tsx:21-23`; `components/labels.ts:45`, `:127-137`                                                                                               |
| El anillo de foco de los botones del módulo es `focus-visible:ring-ring focus-visible:ring-3`                                                                                                               | `components/report-tree.tsx:91`                                                                                                                                           |
| Los tokens: `--chart-1` a `--chart-5` son grises iguales en los dos temas; `--primary`, `--muted`, `--muted-foreground`, `--foreground`, `--ring` y `--background` cambian con el tema                      | `src/app/globals.css:65-93`, `:105-132`                                                                                                                                   |
| `explain.sql` llega a Q34; Q5, Q25 y Q26 son las de una dimensión de tiempo                                                                                                                                 | `scripts/report-volume/explain.sql:1077`, `:121`, `:825`, `:843`                                                                                                          |
| e2e: `in2025`, `WEEKS_RANGE`, `seedWeekEntries` (con `setWeekStart(email, SUNDAY)` y `seedPersonEntries`) y `weekEntryLabels`; los recorridos llegan al 20                                                  | `e2e/reports.spec.ts:1397-1476`, `:1724`                                                                                                                                  |
| e2e: `weekdayLabel`, `dayRangeLabel`, `weekStartOf` y `monthLabel` con la regla del año; `periodHeading`, `currentWeekRange`, `reportsUrl`, `periodLink`, `expectReport`, `openReport`; `seedPersonEntries` | `e2e/days.ts:135`, `:186`, `:212`, `:225`; `e2e/reports-page.ts:143`, `:167`, `:255`, `:480`, `:519`, `:535`; `e2e/database.ts:603`                                       |

## 1. Alcance

Entra:

- **`src/server/time`**: `monthShortLabel`, con su test.
- **El módulo `report`**: `chartGranularityOf` y sus umbrales; `totalsByBucket`;
  la lectura del gráfico en la transacción; las barras con sus rótulos;
  `chart` en el estado.
- **La pantalla**: el gráfico entre los totales y la tabla, con la línea del
  valor, el foco itinerante y la tabla de datos.
- **La medición** de §6.

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                                                             | Qué cambia                                                                                                                                                                                                                                                                                                    | Qué hay que volver a probar                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/server/time/index.ts`                                          | `monthShortLabel`, nueva. Nada existente cambia.                                                                                                                                                                                                                                                              | `test:unit` y `test:time-ar`                                                                |
| `src/modules/report/schema.ts`                                      | `REPORT_CHART_DAILY_MAX_DAYS`, `REPORT_CHART_WEEKLY_MAX_DAYS`, `REPORT_CHART_MAX_BARS`, `reportChart`, `chart` en `reportReadyState` con su `refine`, los tipos.                                                                                                                                              | `schema.test.ts`                                                                            |
| `src/modules/report/repository.ts`                                  | El cuerpo de `totalsByLevels` pasa a una función privada; `totalsByLevels` la llama sin cambiar nada; `totalsByBucket`, `ReportBucketRead` y `BucketTotalRow`, nuevos.                                                                                                                                        | `service.integration.test.ts` y `scope.integration.test.ts` enteros, con los mismos valores |
| `src/modules/report/service.ts`                                     | `timeGroupOf` sale de `groupOf` sin cambiar su resultado; `ReadPlan` y `ReportRead` suman el gráfico; `readReport` lo lee; el estado lleva `chart`.                                                                                                                                                           | Ídem                                                                                        |
| `schema.test.ts`, `report-view.test.tsx`, `report-toolbar.test.tsx` | Paso 1, edición mecánica de `backend-dev`: **`chart: null`** en los cinco estados armados a mano (§0). Ningún valor afirmado cambia.                                                                                                                                                                          | —                                                                                           |
| `service.integration.test.ts`                                       | Los tests que simulan `totalsByLevels` (`:1972-1989`) siguen igual si no parsean el estado o si el período no tiene entradas sembradas; si alguno parsea con `reportReadyState` y la base tiene horas en ese período, simula también `totalsByBucket`. Ninguna afirmación existente cambia de valor (D-R5-3). | —                                                                                           |
| `scope.test-d.ts`                                                   | `totalsByBucket` sin alcance, con `undefined` y con `null` no compila.                                                                                                                                                                                                                                        | `npm run typecheck`                                                                         |
| `components/report-view.tsx`                                        | Monta `ReportChart` entre los totales y la línea del tope cuando `chart` no es `null`, con la misma `key` que `ReportTree` (§5.1). Nada más cambia.                                                                                                                                                           | `report-view.test.tsx`                                                                      |
| `components/labels.ts`                                              | Los textos de §5.6.                                                                                                                                                                                                                                                                                           | —                                                                                           |
| `scripts/report-volume/explain.sql`                                 | Q35 a Q39. `seed.sql` no cambia.                                                                                                                                                                                                                                                                              | —                                                                                           |
| `e2e/reports-page.ts`, `e2e/reports.spec.ts`                        | Los helpers del gráfico; los recorridos 21 y 22. Ningún export existente se renombra.                                                                                                                                                                                                                         | `reports.spec.ts` entero                                                                    |

- **Una página sin horas no cambia**: `chart` es `null` y no se dibuja nada. Los
  tests de R2a a R10b siguen afirmando lo mismo; si otro valor afirmado
  cambia, es un error del slice, no del test.
- **Las ediciones mecánicas fuera del reparto** (paso 1 de §7) siguen la regla
  de R3, R4 y R10: las hace `backend-dev` para que su commit compile y pase,
  con el aviso al team-lead, y espera a que el dueño del archivo commitee lo
  que tenga pendiente en él.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** La lectura del gráfico recorre las mismas
filas que el primer nivel de una fecha, una semana o un mes (Q5, Q25, Q26). §6
mide; si algo pasa su presupuesto, vale §6.5 de R3: el slice se detiene y
vuelve a `architect`.

## 3. Permisos

**Ninguna acción nueva.** Decide la que ya existe:

- `report.view` (todos los roles activos): ver el reporte, con su gráfico, sobre
  lo que se ve. Sin `report.view` no se lee nada (`service.ts:739-741`).
- `timeEntry.others.view` (owner y admin): que las barras sumen horas ajenas. La
  pregunta la hace `scopeOf` una vez; `inScope` la traduce también en
  `totalsByBucket`.

Ninguna decisión de acceso vive fuera de `can()`. Los cortes, la granularidad y
los rótulos los arma el servidor; de la URL no llega ningún parámetro nuevo.

## 4. Contrato de lectura

### 4.1 Los tipos (`report/schema.ts`)

```ts
/** RP-15, ADR 0021, D-R5-4: hasta 31 días, una barra por día. */
export const REPORT_CHART_DAILY_MAX_DAYS = 31;

/** D-R5-4: hasta 26 semanas, una por semana; más, una por mes. */
export const REPORT_CHART_WEEKLY_MAX_DAYS = 182;

/**
 * Las barras del peor caso: 31 por día. Por semana son hasta 27 —el primer y
 * el último tramo pueden ser parciales— y por mes hasta 13, con 366 días.
 */
export const REPORT_CHART_MAX_BARS = REPORT_CHART_DAILY_MAX_DAYS;

const reportChartBar = z.object({
  /** El primer día que cuenta la barra, en la zona de quien mira: su clave. */
  firstDay: z.string(),
  /**
   * El de la fila de la tabla para el mismo tramo, con la regla del año:
   * «jue, 01/10», «28/09 – 04/10», «octubre» (D-R5-5).
   */
  label: z.string().min(1),
  /** Como en la tabla: los días que cuenta una semana o un mes cortado por el período; `null` por día. */
  partial: z.string().nullable(),
  /** La marca del eje, sin año: «01/10», «oct» (D-R5-5). */
  tick: z.string().min(1),
  seconds: z.number().int().min(0),
});

const reportChart = z.object({
  /** D-R5-4: sale del largo del período, no de la agrupación. */
  granularity: z.enum(REPORT_TIME_GROUP_BYS),
  /** Una por tramo, en orden, también las en cero (D-R5-5). */
  bars: z.array(reportChartBar).min(1).max(REPORT_CHART_MAX_BARS),
});

// reportReadyState suma:
//   /** D-R5-6: `null` sin entradas del alcance y los filtros en el período (RP-33). */
//   chart: reportChart.nullable(),
// y un `refine` más sobre el objeto: con gráfico, la suma de las barras es
// `totalSeconds` (D-R5-2, RP-18).

export type ReportChart = z.infer<typeof reportChart>;
export type ReportChartBar = z.infer<typeof reportChartBar>;
```

- **El `refine` de la suma** es en un solo sentido: un estado con gráfico y una
  suma distinta del total es un error del service y el esquema que lo parsea en
  los tests lo rechaza. Que `chart` sea `null` justo cuando no hay entradas lo
  fija la integración (criterio 4), no el esquema: obligarlo en el esquema
  cambiaría todos los estados con grupos armados a mano.
- **`partial` de una barra por día** es siempre `null`; no se afirma en el
  esquema, se afirma en el criterio 7.

### 4.2 `src/server/time`

```ts
/**
 * El nombre abreviado del mes de `dayKey`, en minúscula y sin año: «ene»,
 * «sep», «oct». Es la marca del eje del gráfico por mes (D-R5-5). Lanza si
 * `dayKey` no es un día.
 */
export function monthShortLabel(dayKey: string): string;
```

Como `monthLabel`: `date-fns` con `es`, la fecha civil en UTC con `TZDate`, y el
patrón `LLL`. Ninguna otra función de tiempo nueva: los tramos son los de R2b y
R10a.

### 4.3 Repository (`report/repository.ts`)

```ts
/** D-R5-3: lo que lee `totalsByBucket`: lo de `ReportEntryRead` y los tramos de una dimensión de tiempo. */
export type ReportBucketRead = ReportEntryRead & {
  readonly granularity: ReportTimeGroupBy;
  /** Cubren exactamente `span`, como los de una lectura por niveles. */
  readonly buckets: TimeBuckets;
};

/** Un tramo con horas: su posición en `buckets`, desde 0, y su suma. */
export type BucketTotalRow = { readonly bucket: number; readonly seconds: number };

export const reportRepository = {
  totalsByLevels, // sin cambios de firma ni de resultado
  entryTotals, // sin cambios
  /**
   * D-R5-2, D-R5-3: una fila por tramo con horas cerradas en `read.span`,
   * dentro de `scope`; sin unir etiquetas, así cada entrada suma en un solo
   * tramo. Una sentencia; sin orden y sin `limit`: como mucho, un tramo por
   * fila.
   */
  async totalsByBucket(
    scope: ReportScope,
    read: ReportBucketRead,
    tx: Executor = db,
  ): Promise<readonly BucketTotalRow[]>;
};
```

- **La misma sentencia que `totalsByLevels`.** El cuerpo de hoy
  (`repository.ts:631-712`) pasa a una función privada que recibe un
  `ReportLevelRead`; `totalsByLevels` la llama tal cual, y `totalsByBucket` la
  llama con `{ span, filter, dimensions: [granularity], buckets: { [granularity]:
buckets } }`, sin `limit`, y devuelve `{ bucket, seconds }` de cada fila.
  **Ninguna de las dos llama a la otra a través de `reportRepository`**, así
  los espías de una no cuentan las llamadas de la otra.
- **Las guardas** son las de la función privada: `checkEntryRead` y
  `checkLevelRead`, con `RangeError` antes de consultar si los tramos están
  vacíos o no cubren el `span`.
- **Sin `limit`**: la clave es `width_bucket` sobre los cortes del tramo, y con
  `closedIn` cada entrada cae en un tramo de 1 a `n`, así que vuelven como
  mucho `n` filas (31 en el peor caso, D-R5-4).
- **`inScope`, `closedIn`, `matchesFilter`, `entrySeconds`, `secondsOf` y
  `timeDimension` no cambian.**

### 4.4 Service (`report/service.ts`)

`ReportRequest` y la firma de `getReportState` no cambian. En este orden:

1. **`report.view`**, **`scopeOf`**, **el período**, **las invariantes** de los
   niveles, el largo y los filtros, sin cambios.
2. **Los tramos de los niveles**, como en R10. **Los del gráfico**:
   `granularity = chartGranularityOf(range)` y
   `chartBuckets = timeBucketsOf(granularity, range, settings)`, una vez.
3. **En la transacción**, como en R10b: los catálogos, los filtros efectivos,
   `readScope`, los niveles y el total. **Después, el gráfico**:
   `reportRepository.totalsByBucket(readScope, { span, filter, granularity,
buckets: chartBuckets }, tx)`, con el mismo `readScope` y el mismo `filter`
   efectivo que los niveles, **siempre**, también con el primer nivel cortado,
   con la etiqueta primero y con un primer nivel de la misma dimensión que el
   gráfico. `ReadPlan` suma `chart: { granularity, buckets }` y `ReportRead`
   las filas del gráfico.
4. **El árbol y el total**, sin cambios.
5. **El gráfico** (`chartOf`, privada): `null` si la lectura no trajo filas
   (D-R5-6). Si no, una barra por cada índice de `chartBuckets.buckets`, en
   orden:
   - `seconds`: la de la fila con ese `bucket`, o 0;
   - `label` y `partial`: de `timeGroupOf({ kind: granularity, bucket }, [esa
fila], seconds, { ...time, buckets: { [granularity]: chartBuckets } })`;
     por día, `partial` es `null`;
   - `firstDay`: el `firstDay` del tramo;
   - `tick`: `formatDayKey(firstDay, settings.formats.date, false)` por día y
     por semana; `monthShortLabel(firstDay)` por mes.
6. **El estado** suma `chart`.

- **`timeGroupOf`** son los tres casos de tiempo de `groupOf` de hoy
  (`service.ts:255-285`), movidos a una función privada que recibe un
  `TimeRow` y devuelve un `TimeGroup`; `groupOf` la llama para esos tres. Es la
  única fuente de los rótulos de tiempo de la tabla y del gráfico.
- **`chartGranularityOf`** vive en `report/chart.ts`, pura: con `días =
daysBetweenKeys(first, last) + 1`, `date` si `días <=
REPORT_CHART_DAILY_MAX_DAYS`, `week` si `días <=
REPORT_CHART_WEEKLY_MAX_DAYS`, si no `month`. No mira la agrupación.
- **Ninguna decisión de acceso cambia**: el service no compara roles; el
  gráfico usa el alcance que ya armó.
- **Ninguna cuenta de zona** fuera de `src/server/time`: los cortes salen de
  `timeBucketsOf`; la base compara instantes.

### 4.5 Costo

- **Una sentencia más por página**, siempre, dentro de la transacción: la de un
  nivel de una dimensión de tiempo sin `limit`, con un arreglo de 1 a 31 cortes
  (día), de 5 a 27 (semana) o de 6 a 13 (mes).
- **Los cortes del gráfico**: `dayBuckets` de hasta 31 días, `weekBuckets` de
  hasta 182 o `monthBuckets` de hasta 366, una vez por pedido; los dos últimos
  ya se midieron en 366 días (≤ 20 ms, R10a §6.2).
- **Lo que viaja al navegador**: hasta 31 barras, en el HTML del gráfico, en la
  tabla de datos y en las props de `ChartBars` (§6.3).

## 5. Pantalla

### 5.1 El lugar

`ReportView` monta `ReportChart` **después de los totales y antes de la línea
del tope y de la tabla** (`report-view.tsx:59-61`), solo si `state.chart` no es
`null`, **con la misma `key` que `ReportTree`**: `reportHref({ range, groupBy,
subgroups, filters })` (`report-view.tsx:88-98`). Cada navegación de cliente
que cambia la URL —las flechas, «Esta semana», un atajo, «Aplicar», un enlace
de «Agrupar por» o de los subniveles— vuelve a montar `ChartBars` con la parada
de tabulación en la primera columna y sin columna activa. Sin la `key`, React
conserva el estado: con 31 barras y Fin la parada queda en el índice 30, y al
pasar a un período de 7 barras ninguna columna tendría `tabIndex` 0. La barra
de herramientas, la línea del alcance, la de la zona, la de la etiqueta y la
tabla no cambian. Sin `report.view`, como hoy: no hay estado `ready`.

### 5.2 Quién dibuja qué

**`ReportChart`** (`report-chart.tsx`, de servidor) recibe `chart` y dibuja,
dentro de un `<figure>`:

1. **La leyenda**: `<figcaption>` con `chartCaptions[granularity]`, el único
   nombre del gráfico (D-R5-9).
2. **`ChartBars`**, con las props de §5.3, que calcula con `chart-model.ts`: las
   líneas de la escala con su rótulo y su altura, y cada barra con su nombre,
   su altura y su marca.
3. **La tabla de datos**: el `<details>` de D-R5-9, después de `ChartBars`.

**`ChartBars`** (`chart-bars.tsx`, `"use client"`) dibuja, de arriba abajo:

1. **La línea del valor** (`aria-hidden`, alto reservado aunque esté vacía, para
   que la página no salte): el nombre de la columna activa, o nada.
2. **El área**, de **alto fijo**, que no depende de los datos: a la izquierda,
   los rótulos de la escala en `text-muted-foreground`, de ancho propio; a la
   derecha, las líneas de la escala (`border-border`) detrás y, encima, una
   columna por barra con `flex-1`, un espacio de 1 px entre columnas y el ancho
   tope de la barra única (D-R5-8). Las líneas y sus rótulos son
   `aria-hidden`.
3. **Las marcas** debajo de las columnas, en las que traen marca, con su
   alineación (D-R5-8), `aria-hidden`.

**El ancho**: nada del gráfico tiene ancho mínimo fijo salvo los rótulos de la
escala; con 31 barras y el rótulo más largo de la escala, a 320 y 375 px el
gráfico no pasa de su caja ni agrega desborde horizontal a la página más allá
del de la navegación del shell, ya anotado en la deuda.

### 5.3 `ChartBars`

**Las props**, todas serializables:

| Prop    | Tipo                                            | Qué es                                                                                  |
| ------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `scale` | `readonly { label: string; percent: number }[]` | Las líneas de la escala, desde 0: su rótulo («2:00») y su altura en porcentaje del área |
| `bars`  | `readonly ChartBarView[]`                       | Las columnas, en orden                                                                  |

```ts
type ChartBarView = {
  /** `firstDay`: la `key` de React de la columna. */
  readonly key: string;
  /** «{rótulo}[ solo {días}]: {duración}»: el nombre de la columna y el texto de la línea del valor. */
  readonly name: string;
  /** El alto de la barra en porcentaje del techo (D-R5-8). */
  readonly heightPercent: number;
  /** Con horas: la barra lleva el alto mínimo. */
  readonly hasHours: boolean;
  /** La marca, o `null` si esta columna no la muestra (`tickIndexesOf`). */
  readonly tick: string | null;
  readonly tickAlign: "start" | "center" | "end";
};
```

Nada más: ni el estado, ni la granularidad, ni los segundos. Con una sola
barra, `ChartBars` aplica el ancho tope por `bars.length`.

**El estado**: `tabStop` (la columna con `tabIndex` 0; al montar, 0), `focused`
(la columna con el foco, o `null`) y `hovered` (la del puntero, o `null`). **La
activa** es `activeBarIndex(hovered, focused)`: la del puntero si hay, si no la
del foco, si no ninguna. Es una función pura de `chart-model.ts`.

- **El puntero** sobre una columna la pone en `hovered`; **al salir del área**,
  `hovered` vuelve a `null` y la activa pasa a ser la del foco, si hay: si el
  puntero estuvo en otra columna, la línea del valor vuelve a nombrar la
  enfocada, y sin foco se vacía.
- **El foco** en una columna la pone en `focused` y en `tabStop`. Las teclas de
  D-R5-9 mueven el foco con `nextBarIndex` y se cancelan (sin desplazar la
  página); cualquier otra tecla sigue su camino. **Al salir el foco de las
  columnas**, `focused` vuelve a `null` —la línea del valor se apaga si el
  puntero no está encima— y `tabStop` queda en la última enfocada.
- **La columna activa** lleva `bg-muted` y su barra el color activo de §5.4; la
  enfocada con teclado, además, el contorno de D-R5-9
  (`focus-visible:outline-2 focus-visible:-outline-offset-2
focus-visible:outline-foreground`: hacia adentro, porque entre columnas hay
  1 px y la vecina o el `overflow` del área lo taparían), y con colores
  forzados el `outline` en `Highlight`.

### 5.4 Colores

Tokens del tema, sin colores nuevos en `globals.css`:

| Parte                                | Token                                 | Por qué                                                                                                                                               |
| ------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra                                | `--chart-2` (`bg-chart-2`)            | Gris medio, igual en los dos temas: contra `--background` da unos 4,7:1 en claro y 4,2:1 en oscuro. `--chart-1` da 1,5:1 contra el blanco y no sirve. |
| Barra activa                         | `--primary` (`bg-primary`)            | Casi negra en claro y casi blanca en oscuro: contra la barra normal, más de 3:1 en los dos.                                                           |
| Columna activa                       | `--muted` (`bg-muted`)                | Marca la columna entera, también con la barra en cero; el contraste lo da el contorno del foco.                                                       |
| Contorno del foco                    | `--foreground`                        | Contra `--muted` y contra `--background`, muy por encima de 3:1 en los dos temas.                                                                     |
| Líneas de la escala                  | `--border`                            | Decorativas: los valores los dicen los nombres.                                                                                                       |
| Rótulos, marcas y la línea del valor | `--muted-foreground` y `--foreground` | Los del resto de la pantalla.                                                                                                                         |
| Colores forzados                     | `CanvasText` y `Highlight`            | D-R5-9.                                                                                                                                               |

Las cifras de la tabla son estimadas sobre los valores de `globals.css`; las que
valen son las que mide `frontend-dev` en el navegador (§5.5).

### 5.5 Lo que mide `frontend-dev`

A 320, 375 y 1280 px, en claro y en oscuro, con 1, 7, 13, 27 y 31 barras y con
una escala de «2000:00»: que el gráfico no desborde (§5.2); el contraste de la
barra contra el fondo, de la activa contra la normal, del contorno del foco
contra la columna activa y de los rótulos contra el fondo, contra los mínimos
de D-R5-9; **el foco visible sobre una columna en cero**, en los dos temas y con
colores forzados; las barras visibles con colores forzados (la emulación de
Chromium). Las medidas van en su informe y el team-lead las copia al documento
de revisiones.

### 5.6 Textos (`labels.ts`)

| Clave           | Texto                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `chartCaptions` | `satisfies Record<ReportTimeGroupBy, string>`: «Horas por día», «Horas por semana», «Horas por mes» |
| `chartBar`      | `(rótulo, duración) =>` «{rótulo}: {duración}»                                                      |
| `chartData`     | «Ver los datos del gráfico»                                                                         |

La columna de la tabla de datos usa `groupByLabels[granularity]` («Fecha»,
«Semana», «Mes») y `reportLabels.duration`; el «solo …», `partialDays`.

### 5.7 Estados

- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3 de
  `reportes.md`; el esqueleto no cambia.
- **Vacío y segundo vacío** (RP-33): sin gráfico, con la fila de la tabla que ya
  existe.
- **El primer nivel que no entra** (D-R10-10): con gráfico, la fila del tope y
  los totales.

## 6. Volumen y peso

Lo hace `backend-dev` con el repository terminado, con el procedimiento de §6
de R2a, en `postgres:18-alpine`, en una base propia que se borra al terminar.
La sentencia es el texto de `.toSQL()`. El informe lleva, por consulta, el plan
(nodos e índices), las cinco medidas y cuántas filas devolvió, y el team-lead lo
copia al documento de revisiones.

### 6.1 `seed.sql`

Sin cambios.

### 6.2 Las consultas

| Consulta | Qué                                                           | Presupuesto (mediana) |
| -------- | ------------------------------------------------------------- | --------------------- |
| Q35      | `totalsByBucket` `[month]`, `everyone`, 366 días, sin `limit` | ≤ 150 ms              |
| Q36      | `totalsByBucket` `[week]`, `everyone`, 182 días, con lunes    | ≤ 100 ms              |
| Q37      | `totalsByBucket` `[date]`, `everyone`, 31 días                | ≤ 40 ms               |
| Q38      | `totalsByBucket` `[month]`, `self`, 366 días                  | ≤ 30 ms               |
| Q39      | `totalsByBucket` `[date]`, `everyone`, la semana actual       | ≤ 15 ms               |

**Los pedidos enteros**, en una transacción, con los catálogos, medidos desde
`getReportState`, con y sin el gráfico (en la copia de medición, sin commit):

| Pedido                                           | Sentencias                  | Presupuesto |
| ------------------------------------------------ | --------------------------- | ----------- |
| La página sin parámetros                         | Q1 + Q39 + catálogos        | ≤ 60 ms     |
| Mes → Semana → Fecha, todo el equipo, 366 días   | los de R10a §6.2 + Q35      | ≤ 500 ms    |
| Etiqueta, todo el equipo, 366 días               | Q9 + Q10 + Q35 + catálogos  | ≤ 500 ms    |
| Descripción, todo el equipo, 366 días (no entra) | Q31 + Q10 + Q35 + catálogos | ≤ 500 ms    |

El informe dice cuánto suma el gráfico a cada pedido.

### 6.3 El peso

Lo hace `frontend-dev`, no es un test, con el procedimiento de §6.4 de R3: en
una copia propia del árbol, fuera de todo commit, servida con `next build` y
`next start`:

- **La página de un período de 31 días por «Fecha», con horas todos los días**
  (31 barras, el peor caso), con el gráfico y con `chart` forzado a `null` en la
  copia. **El gráfico suma ≤ 40 KB al HTML de la primera carga y ≤ 15 KB al
  payload RSC.**
- **El JavaScript de cliente nuevo** de `/reportes` (`ChartBars` y lo que
  arrastre), comprimido: **≤ 5 KB**. Si el informe de `next build` no lo da por
  ruta, se mide lo transferido al cargar `/reportes` con y sin el gráfico.
- **La peor página de R10b** (3000 descripciones: 1,99 MiB de HTML y 655 KiB de
  RSC, `correcciones-nucleo-reportes-r10b-revisiones.md:29-31`) más esos
  incrementos sigue debajo de 2,5 MB y de 1 MB; se calcula, no se vuelve a
  medir.

La mediana de cinco corridas va en el informe.

### 6.4 Si algo pasa el presupuesto

Vale §6.5 de R3: el slice se detiene y vuelve a `architect`. Las alternativas,
en este orden: para una consulta, un índice solo con una medición que lo
justifique; para el JavaScript, las columnas sin estado y la línea del valor
con CSS (`group-hover`, `group-focus-visible`), con todas las columnas en la
tabulación.

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

**Reglas de la corrida**, de R3b a R10b:

- **Cada agente que corre integración lleva su base de test propia**: el
  team-lead la crea y la migra antes de lanzarlo y la borra al terminar. Nadie
  usa la de otro. **`parity-reviewer` también lleva la suya.**
- **La base de e2e se crea y se migra antes de lanzar a `e2e-tester`.**
- **Lo que necesita un servidor propio va en una copia del árbol**: los
  mutantes de e2e de §8.2, en una copia con su puerto y su base de e2e; las
  mediciones de §5.5 y §6.3, en una copia de `frontend-dev`; la de §6.2, en una
  de `backend-dev`.
- **Las corridas van en primer plano.**
- **`parity-analyst` no escribe archivos**: entrega el texto y lo aplica el
  team-lead.
- Postgres local y Neon son 18.

### backend-dev

```
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/chart.ts                         (nuevo)
/home/maxi/program/clock/src/modules/report/chart.test.ts                    (nuevo)
/home/maxi/program/clock/src/modules/report/repository.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/scope.test-d.ts
/home/maxi/program/clock/scripts/report-volume/explain.sql
```

Más las ediciones mecánicas del paso 1 en archivos de otros dueños (§1).

### frontend-dev

```
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/chart-model.ts         (nuevo)
/home/maxi/program/clock/src/modules/report/components/chart-model.test.ts    (nuevo)
/home/maxi/program/clock/src/modules/report/components/report-chart.tsx       (nuevo)
/home/maxi/program/clock/src/modules/report/components/chart-bars.tsx         (nuevo)
/home/maxi/program/clock/src/modules/report/components/report-chart.test.tsx  (nuevo)
/home/maxi/program/clock/src/modules/report/components/report-view.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.test.tsx
```

`chart-model.ts` exporta `chartScaleOf(bars)`, `tickIndexesOf(count)`,
`tickAlignOf(index, count)`, `barHeightPercent(seconds, scale)`,
`nextBarIndex(index, key, count)` y `activeBarIndex(hovered, focused)`, sin
importar React ni el servidor.

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Escribe los casos del criterio 10 contra las firmas publicadas, sin mirar la
implementación de `totalsByBucket`, y corre en una copia propia, con su base,
los mutantes de las filas **4, 8, 9 y 10** de §8.1 (los del alcance, los
filtros y la foto), confirmando que cada uno cae por su afirmación.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                   (21 y 22)
/home/maxi/program/clock/e2e/reports-page.ts
```

- `reports-page.ts`: `CHART_DATA` («Ver los datos del gráfico»),
  `chartCaption(granularity)`, `chartFigure(page, caption)`,
  `chartBars(figure)` (las columnas por `role="img"`), `chartBar(figure,
name)`, `chartBarName(label, partial, duration)` —con `periodHeading` para el
  «solo …»—, `chartReadout(figure, name)` y `chartDataRows(figure)`. **Ningún
  export existente se renombra.**
- `reports.spec.ts`: los recorridos 21 y 22, con `seedWeekEntries`,
  `WEEKS_RANGE`, `in2025`, los rótulos de `days.ts` y, para la entrada de la
  semana actual, `seedPersonEntries` (`e2e/database.ts:603`), que ya existe.
- Los mutantes de §8.2, en una copia con puerto propio (reglas de arriba).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

`parity-analyst` no escribe archivos: entrega el texto y **lo aplica el
team-lead**, antes del merge, con su corrección fechada y una sección «14.
Núcleo, R5»:

- **RP-15**: el gráfico por día, semana o mes según el largo del período, con
  los umbrales (D-R5-4); que no sigue a la agrupación; una barra por tramo,
  también en cero; los rótulos de la tabla y las marcas cortas; el valor con
  el puntero y con el teclado, con una sola parada de tabulación; la tabla de
  datos.
- **RP-16**: sigue fuera del núcleo; la barra no se parte por facturable y es de
  un solo color.
- **RP-18**: las barras suman el total, también por etiqueta y con el primer
  nivel cortado.
- **RP-24**: las semanas del gráfico empiezan el primer día de quien mira.
- **RP-33**: sin horas, o con filtros que no dejan nada, no hay gráfico; con el
  primer nivel cortado, sí.
- **§14.4, divergencias que el reviewer no marca**: la granularidad por largo
  del período (Clockify Free solo muestra días, hasta 31); la primera y la
  última barra de una semana o un mes cortados son más bajas, porque cuentan
  menos días, y lo dicen con «solo …»; las marcas sin año; la barra del día que
  falta entero en una zona, en cero; un solo color; el gráfico por día aunque
  la tabla agrupe por semana.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/components/`,
`src/lib/`, `src/app/` (también `globals.css`), `src/modules/time-entry/`,
`project/`, `profile/`, `workspace/`, `team/`, `report/period.ts`,
`report/components/report-toolbar.tsx`, `report-tree*`, `report-screen.tsx`,
`group-heading.tsx`, `report-href*`, `range-picker*`, `subgroup-picker*`,
`grouping-model*`, `filter-*`, `scripts/report-volume/seed.sql`,
`package.json`, `e2e/database.ts`, `e2e/days.ts`, los ADR. El mapa y el estado
los actualiza el team-lead.

### Orden

_Ronda 1: `backend-dev` y `frontend-dev`._

1. **Primer commit de `backend-dev`**: en `schema.ts`, las tres constantes,
   `reportChart`, `chart` en `reportReadyState` con su `refine` y los tipos,
   con `schema.test.ts`; el service devuelve **`chart: null`** siempre, hasta
   el paso 3. **Ediciones mecánicas** fuera del reparto, para que el commit
   compile y pase: `chart: null` en los estados de `report-view.test.tsx` y
   `report-toolbar.test.tsx`. **Avisa a `frontend-dev` y al team-lead**: desde
   acá la forma de `chart` es la final.
2. **`frontend-dev`**, desde el paso 1: `chart-model.ts`, `report-chart.tsx`,
   `chart-bars.tsx`, los textos y el lugar en `report-view.tsx` con su `key`; el
   criterio 11; las mediciones de §5.5 y §6.3 en su copia, con un estado de
   prueba.
3. **`backend-dev`**: `monthShortLabel`; `chart.ts`; `totalsByBucket` sobre la
   función privada; `timeGroupOf`; la lectura en la transacción y `chartOf`;
   la línea de `scope.test-d.ts`; los criterios 1 a 9.
4. **`backend-dev`**: la medición de §6.2.

_Ronda 2: `test-engineer` y `e2e-tester`, con el hash del paso 3 y el último
commit de `frontend-dev`._

5. **`test-engineer`**: el criterio 10 y los mutantes de las filas 4, 8, 9 y 10
   de §8.1. Cada caso nuevo se confirma cayendo con su mutante, porque la
   funcionalidad ya está.
6. **`e2e-tester`**: los helpers y los recorridos 21 y 22, confirmando en su
   copia que cada afirmación nueva cae con su mutante de §8.2.

_Cierre._

7. **El texto de `parity-analyst`**, aplicado por el team-lead.
8. **Revisión de seguridad, corta**: que `totalsByBucket` recibe el `readScope`
   y el filtro efectivo, y que un member con `personas=…` en la URL recibe
   barras que suman solo lo propio; que de la URL no llega nada nuevo; que los
   rótulos son fechas que arma el servidor y no hay texto de otras personas;
   que no hay forma de parámetro nueva.
9. **Merge como R5.**

## 8. Criterios de aceptación

1. **La granularidad** (unidad, `report/chart.test.ts`) — `chartGranularityOf`
   da `date` con 1 y 31 días (2026-10-01 a 2026-10-31), `week` con 32 y 182
   días, `month` con 183 días (2026-07-01 a 2026-12-30) y con 366 (2025-01-15 a
   2026-01-15); un período que cruza el año se cuenta en días (2025-12-15 a
   2026-01-14, 31 días: `date`).
2. **La marca del mes** (unidad, `time.test.ts`, en UTC y en `test:time-ar`) —
   `monthShortLabel` da «ene» con 2026-01-01, «sep» con 2025-09-30, «oct» con
   2025-10-01 y «dic» con 2025-12-31; lanza con «2025-13-01» y con «hoy».
3. **Los esquemas** (unidad, `schema.test.ts`) — `reportReadyState` admite
   `chart: null` y un gráfico de una barra y de 31; rechaza 0 barras, 32
   barras, `granularity: "person"`, una barra con `seconds` −1, con `tick`
   vacío o con `label` vacío, y **un gráfico cuyas barras suman distinto de
   `totalSeconds`**; admite `partial` nulo y con texto.
4. **Qué suma el gráfico** (integración, `service.integration.test.ts`) —
   - del lunes 2026-09-28 al domingo 2026-10-04, una persona con horas el
     martes y el jueves: siete barras en orden, el martes y el jueves con lo
     suyo, las otras cinco en 0, y la suma igual a `totalSeconds`;
   - **por etiqueta**, con una entrada de dos etiquetas: la barra cuenta la
     entrada una vez y las barras suman `totalSeconds`, aunque las filas de
     etiqueta sumen más;
   - **con el primer nivel que no entra** (el test de las 3001 descripciones de
     R10b): `chart` no es `null` y suma el total;
   - con el filtro de un proyecto y con «Sin proyecto»: solo lo filtrado;
   - **con un proyecto que no existe en el filtro**: el filtro se ignora
     (D-R4-5) y el gráfico es el de sin filtro;
   - un owner con `personas=[B]`: solo lo de B;
   - sin entradas en el período, y con un filtro que no deja nada: `chart` es
     `null`; con una sola entrada de 0,4 s: `chart` con todas las barras en 0.
5. **La granularidad en el estado** (integración) — 31 días: 31 barras por
   día; 32 días: barras por semana; 183 días: por mes; del 2025-01-15 al
   2026-01-15: 13 barras por mes; «Hoy»: una barra. **El mismo período por
   persona, por semana y por Mes → Semana → Fecha da el mismo `chart`.**
6. **Los cortes, la zona y la semana** (integración) —
   - una entrada del 30/09 a las 23:30 de Buenos Aires cae en la barra del
     30/09 para quien mira desde Buenos Aires y en la del 01/10 desde Madrid;
   - en Madrid, el domingo 2026-10-25 (25 horas), entradas a las 00:30 y a las
     23:30 locales caen las dos en la barra del 25/10;
   - por semana, del miércoles 2026-09-30 al domingo 2026-11-15: con lunes la
     segunda barra empieza el 05/10 y con domingo el 04/10, y los rótulos
     siguen;
   - **por semana, las barras con horas tienen el mismo `label`, el mismo
     `partial` y los mismos segundos que las filas de `[week]` del mismo
     pedido**;
   - en `Pacific/Apia`, del 2011-12-23 al 2012-01-12, por día: hay barra del
     30/12, en 0, y la entrada del 31/12 está en la barra del 31/12.
7. **Los rótulos y las marcas** (integración) — por día, `label` con
   `weekdayLabel` («mié, 30/09» con hoy en 2026; «mié, 30/09/2026» con hoy en
   2027), nunca «Hoy» ni «Ayer» aunque el período los incluya, `partial`
   `null` y `tick` «30/09», o «09-30» con `yyyy-MM-dd`; por semana, del
   miércoles 2026-09-30 al martes 2026-11-10 con lunes: la primera barra con
   `label` «28/09 – 04/10», `partial` «30/09 – 04/10» y `tick` «30/09», las
   del medio sin `partial`, la última con `partial` «09/11 – 10/11»; por mes,
   del 2025-09-15 al 2026-03-31: «septiembre de 2025» con `partial`
   «15/09/2025 – 30/09/2025» y `tick` «sep», «enero» sin año (con hoy en 2026)
   y sin `partial`; `firstDay` es el primer día que cuenta cada barra.
8. **La misma foto** (integración, espías sobre `totalsByBucket`,
   `totalsByLevels` y `entryTotals`) — una llamada a `totalsByBucket` por
   pedido, con el mismo `Executor` que las demás lecturas y dentro de la
   transacción `repeatable read`, `read only`; su lectura lleva la
   granularidad, los tramos que cubren el `span`, el filtro efectivo y el
   alcance angostado cuando hay personas elegidas; también con la etiqueta
   primero, con el primer nivel cortado y **con el primer nivel de la misma
   dimensión que el gráfico** (`lastWeek` por «Fecha», y 47 días por
   «Semana»): una llamada a `totalsByBucket` además de las de `totalsByLevels`.
   **Las llamadas a `totalsByLevels` no cambian** (las afirmaciones de §0
   siguen con sus valores).
9. **Las guardas y el tipo** — integración: `totalsByBucket` lanza `RangeError`
   sin consultar con tramos vacíos y con tramos que no cubren el `span`, con el
   alcance tomado de una lectura real. `scope.test-d.ts`: `totalsByBucket` sin
   alcance, con `undefined` y con `null` no compila.
10. **El alcance** (`scope.integration.test.ts`) — `totalsByBucket` directo, por
    día, semana y mes, con cada alcance: owner y admin ven todo A, también al
    inactivo, y nada de B; `project_manager`, `team_manager` y `member`, solo
    lo propio; el owner de B, nada de A. Por el estado: un member, un
    `project_manager` y un `team_manager` con `personas=…` armado a mano
    reciben un gráfico que suma solo lo propio, igual al de su pedido sin
    `personas`.
11. **La pantalla** (unidad) —
    - `chart-model.test.ts`: la escala con 0 s (0:00 y 0:15), 10 min (techo
      0:15), 60 min (paso 0:15, techo 1:00, cinco líneas), 7:30 (paso 2:00,
      techo 8:00), 61 min (paso 0:30, techo 1:30) y 5280 h (paso 2000 h, techo
      6000 h); nunca más de cinco líneas; `tickIndexesOf` con 1, 7, 8, 13, 27
      y 31; `tickAlignOf` del primero, del último, del medio y de uno solo;
      `barHeightPercent`; `nextBarIndex` con las seis teclas, en los dos
      extremos, y con otra tecla (`null`); `activeBarIndex` con puntero y
      foco en columnas distintas (gana el puntero), solo foco, solo puntero y
      ninguno.
    - `report-chart.test.tsx`: la leyenda de cada granularidad, y ningún
      `role="group"` ni otro nombre del gráfico; tantas columnas como `bars`,
      **cada una con `role="img"`, su nombre —con «solo …» si hay `partial`— y
      su `tabIndex`, en la columna y no en la barra pintada**; la primera
      columna con `tabIndex` 0 y el resto −1; una barra en cero sin alto y una
      con horas con el alto mínimo; los rótulos de la escala; las marcas solo
      en las columnas de `tickIndexesOf`; la línea del valor vacía y
      `aria-hidden`; con el área angosta, las marcas que no están en
      `narrowTickIndexesOf` llevan la clase que las oculta (D1), y
      `narrowTickIndexesOf` con 1, 7, 13, 27 y 31 da a lo sumo cuatro y un
      subconjunto de `tickIndexesOf`; el `<details>` cerrado con `CHART_DATA`, después de las
      columnas, y una fila por barra, también las en cero; una sola barra con
      su ancho tope.
    - `report-view.test.tsx`: con `chart`, la figura después de los totales y
      antes de la tabla; con `null`, ninguna figura; con `levelsShown: 0` y
      gráfico, la figura y la fila del tope.
12. **Ancho, contraste, foco y colores forzados** (manual, §5.5) — dentro de
    los mínimos, con el foco visible sobre una columna en cero, en el informe
    de `frontend-dev`.
13. **El rendimiento y el peso** (manual, §6.2 y §6.3) — dentro del
    presupuesto.
14. **El gráfico de punta a punta** — los recorridos 21 y 22 de §8.2.
15. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`,
    `next build` y la suite e2e entera. Ninguna afirmación existente cambia de
    valor; solo se suma `chart: null` a los cinco estados armados a mano.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo               | Archivo                                                                | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad             | `report/chart.test.ts`                                                 | `<` en lugar de `<=` en cada umbral (caen en 31 y en 182); los días sin el `+ 1` (caen en 32 y en 183); los umbrales intercambiados; la granularidad por la diferencia de meses o de claves en lugar de días (cae en el que cruza el año)                                                                                                                                                                                                                                                                                                                                                |
| 2        | unidad             | `src/server/time/time.test.ts`                                         | `LLLL` en lugar de `LLL`; la fecha civil formateada en la zona del proceso (cae en `test:time-ar` con el día 1); el mes en mayúscula                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3        | unidad             | `report/schema.test.ts`                                                | el `refine` de la suma quitado; `.min(1)` o `.max(REPORT_CHART_MAX_BARS)` quitados; `granularity` como `z.string()`; `partial` no nulable                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4        | integración        | `service.integration.test.ts`                                          | el gráfico con `scope` en lugar de `readScope` (cae con `personas`); sin el filtro, o con el filtro del pedido en lugar del efectivo (cae con el proyecto que no existe); la lectura del gráfico con las dimensiones de los niveles (cae por etiqueta); `chart` `null` cuando no hay grupos (cae con el primer nivel cortado); `chart` `null` cuando el total es 0 (cae con la entrada de 0,4 s); las barras sin horas omitidas (cae en las siete)                                                                                                                                       |
| 5        | integración        | `service.integration.test.ts`                                          | la granularidad de `groupBy` o del primer nivel de tiempo; los umbrales del ADR cambiados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6        | integración        | `service.integration.test.ts`                                          | `weekBuckets` con `1` en lugar de `settings.weekStart`; los cortes en UTC; el día como 24 h sumadas; los cortes repetidos deduplicados (cae en Apia); el rótulo de semana con otra función que la de la tabla                                                                                                                                                                                                                                                                                                                                                                            |
| 7        | integración        | `service.integration.test.ts`                                          | `dayKeyLabel` en lugar de `weekdayLabel` («Hoy»); `tick` con año; `tick` de la semana con su primer día entero y no con el primero que cuenta; `tick` del mes con `monthLabel`; `partial` siempre `null` o con la unidad entera; `firstDay` del tramo siguiente                                                                                                                                                                                                                                                                                                                          |
| 8        | integración        | `service.integration.test.ts`                                          | el gráfico leído con `db` o fuera de la transacción; leído solo sin la etiqueta o con el nivel 1 entero; **el gráfico sumado del primer nivel cuando es la misma dimensión** (cae con `lastWeek` por «Fecha» y con 47 días por «Semana»: ninguna llamada a `totalsByBucket`); `totalsByBucket` que llama a `reportRepository.totalsByLevels` (cambian las cuentas de §0)                                                                                                                                                                                                                 |
| 9        | integración, tipos | `service.integration.test.ts`; `report/scope.test-d.ts`                | `totalsByBucket` sin `checkLevelRead`; el alcance de `totalsByBucket` opcional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10       | integración        | `scope.integration.test.ts`                                            | `inScope` quitado en `totalsByBucket`; `everyone` fijo en la lectura del gráfico; el alcance sin angostar con `personas`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 11       | componente         | `chart-model.test.ts`; `report-chart.test.tsx`; `report-view.test.tsx` | el paso que no es el menor (cae con 61 min); seis líneas; el techo sin el mínimo de un paso (cae con 0 s); `ceil` por `floor` en el paso de las marcas (cae con 8); la marca del último centrada; `nextBarIndex` que da la vuelta; `activeBarIndex` que prefiere el foco; todas las columnas con `tabIndex` 0; **el `role`, el nombre o el `tabIndex` en la barra pintada y no en la columna**; un `role="group"` con nombre; el nombre sin «solo …»; la barra con horas sin alto mínimo; la tabla de datos sin las barras en cero; el gráfico dibujado con `null` o después de la tabla |
| 12, 13   | manual             | informes de `frontend-dev` y `backend-dev`                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 14       | e2e                | `e2e/reports.spec.ts`                                                  | los del final de §8.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 15       | todas              | las suites existentes                                                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Cualquier mutante declarado equivalente** se prueba antes con pedidos de una
membresía inactiva, de otro workspace y de un member con horas ajenas en el
rango.

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los veinte de R2a a R10b no cambian. Se suman dos, con la
regla de §8.3 de R2a y D-R5-12; la persona del test es member en los dos y los
nombres llevan el sufijo del test. Los rótulos los calcula el recorrido con
`weekdayLabel`, `dayRangeLabel` y `monthLabel` de `days.ts`, con hoy, para que
no dependan del día en que corre.

21. **El gráfico por día, semana y mes, con el teclado, el puntero y los
    filtros** (RP-15, RP-24, RP-33; D-R5-4 a D-R5-9). `seedWeekEntries`
    (domingo; 20/09 0:15 en P1, 30/09 1:00 en P1, 01/10 0:30 en P2, 10/10 0:20
    en P1) y, con `seedPersonEntries`, una entrada en P1 de 00:00 a 00:01 el
    primer día de la semana actual (con domingo). Para esa entrada y para el
    rango esperado después de «Esta semana» se usa
    `weekRange(weekStartOf(today, SUNDAY))`, no `currentWeekRange`, que empieza
    en lunes (`e2e/reports-page.ts:167-169`) y los domingos daría otra semana.
    `WEEKS_RANGE` por «Persona»:
    - la figura «Horas por día» con 21 columnas; «sáb, 20/09/2025: 0:15», «mar,
      30/09/2025: 1:00», «mié, 01/10/2025: 0:30», «vie, 10/10/2025: 0:20» y
      «dom, 21/09/2025: 0:00»;
    - el puntero sobre la columna del 01/10: la línea del valor dice su nombre;
      el puntero fuera del gráfico, sin foco en ninguna columna: **la línea del
      valor queda vacía**;
    - **una sola parada de tabulación**: con el foco en «Ver los datos del
      gráfico», Mayúsculas+Tab lleva a la columna del 20/09; flecha derecha
      diez veces: la del 30/09 tiene el foco y la línea del valor la nombra;
      **el puntero sobre la del 01/10**: la línea nombra la del 01/10; **el
      puntero fuera del gráfico**: la línea vuelve a nombrar la del 30/09; Fin:
      la del 10/10; flecha derecha: sigue en la del 10/10; Inicio: la del
      20/09; Tab: el foco pasa a «Ver los datos del gráfico» y **la línea del
      valor queda vacía**; Mayúsculas+Tab vuelve a la del 20/09;
    - abrir «Ver los datos del gráfico»: 21 filas, la del 30/09 con 1:00;
    - «Semana» en «Agrupar por»: la tabla por semana y **el gráfico sigue
      siendo «Horas por día» con 21 columnas**;
    - «Proyectos» → P2 → «Aplicar»: la columna del 01/10 con 0:30 y la del
      30/09 con 0:00;
    - del 2025-08-01 al 2025-10-10 (`reportsUrl`): «Horas por semana» con 11
      columnas; la primera «27/07/2025 – 02/08/2025 solo 01/08/2025 –
      02/08/2025: 0:00», «28/09/2025 – 04/10/2025: 1:30» y la última
      «05/10/2025 – 11/10/2025 solo 05/10/2025 – 10/10/2025: 0:20»;
    - del 2025-06-01 al 2025-06-07: ninguna figura, y «No hay horas en este
      período»;
    - del 2025-01-01 al 2025-12-31: «Horas por mes» con 12 columnas;
      «septiembre de 2025: 1:15», «octubre de 2025: 0:50» y «enero de 2025:
      0:00»;
    - **la navegación de cliente vuelve a empezar el foco itinerante** (M2):
      Mayúsculas+Tab desde «Ver los datos del gráfico» y Fin: la columna de
      diciembre (índice 11) tiene el foco; «Esta semana» (un enlace, navegación
      de cliente): la figura «Horas por día» con 7 columnas; Mayúsculas+Tab
      desde «Ver los datos del gráfico» llega a la primera columna de la
      semana.
22. **A 320 px** (D-R5-8, §5.2). Ventana de 320 × 800, las mismas entradas:
    - del 2025-09-10 al 2025-10-10 (31 columnas por día): el `scrollWidth` de
      la figura no pasa de su `clientWidth`; la caja de la figura, la de la
      primera y la última columna, la de la marca «10/10» y la de la línea del
      valor con el puntero sobre la última columna quedan dentro de la caja del
      contenido principal;
    - del 2025-01-15 al 2026-01-15 (13 columnas por mes): lo mismo, con la
      marca de la última columna.

Los mutantes que tienen que caer en e2e, corridos en una copia con puerto
propio: la granularidad de la agrupación (21 cambia de leyenda al agrupar por
semana); todas las columnas en la tabulación (21: Tab desde la columna no llega
a «Ver los datos del gráfico»); las flechas sin manejar (21); la línea del
valor sin el puntero o sin el foco (21); la activa que no vuelve a la del foco
al salir el puntero (21); la línea del valor que no se apaga al salir el foco
(21); **`ReportChart` montado sin `key` en `ReportView`** (21: después de «Esta semana», Mayúsculas+Tab no
llega a ninguna columna); el gráfico sin el filtro (21: el 30/09 con 1:00); el
gráfico dibujado sin horas (21); `weekStart` ignorado en el gráfico (21: con
lunes, los rótulos de semana son otros); la marca de la última columna
centrada (22); un ancho mínimo fijo por columna (22).

### 8.3 La regla de los e2e

La de §8.3 de R2a, con D-R5-12. Los dos recorridos son de alcance propio y
afirman columnas con horas y en cero de su propia persona; la entrada de la
semana actual va de 00:00 a 00:01, siempre pasada; no cambian el primer día de
la semana de nadie más que la suya (`seedWeekEntries`), y ninguno toca la
membresía del owner ni el workspace.

### 8.4 Lo que no se prueba en e2e

- **Las zonas, los cambios de horario y el día que falta**: criterio 6.
- **El alcance con `everyone`**: criterios 4 y 10.
- **La suma por etiqueta y el primer nivel cortado**: criterio 4.
- **El contraste, el tema oscuro, el foco visible y los colores forzados**:
  §5.5.
- **El volumen y el peso**: §6.
- **El driver de Neon**: sin forma nueva (§0).

## 9. Riesgos y deuda conocida

- **La primera y la última barra de un período por semana o por mes son más
  bajas** si el período las corta: cuentan menos días. El rótulo lo dice con
  «solo …» en el nombre y en la tabla de datos, no en la barra.
- **Las marcas no llevan año**: un período de 366 días por mes puede mostrar
  «mar» en los dos extremos. El año está en el nombre de cada columna, en la
  tabla de datos y en el período de la barra de herramientas.
- **Dos personas que miran el mismo período por semana ven barras distintas**
  si sus primeros días o sus zonas difieren (RP-22, RP-24), como en la tabla.
- **Una sentencia más en cada página**, también en la más frecuente («Esta
  semana»): §6 la mide.
- **El gráfico y la tabla pueden ir por granularidades distintas** (por día
  arriba, por semana abajo) a propósito (D-R5-4).
- **La barra del día que falta entero** en una zona existe, en cero (D-R5-5).
- **El contorno del foco de las columnas no es el anillo de los botones del
  módulo** (D-R5-9): una columna no tiene borde propio.
- **Sin lector de pantalla en CI**: la semántica (`figure`, `img` con nombre,
  `details`) la afirman los tests de componente y los e2e por rol y nombre; no
  hay una prueba con un lector real.
- **Lo de Clockify sin verificar** (P-05): si pasa a semanas o meses con
  períodos largos (la API tiene `zoomLevel` con `WEEK` y `MONTH`), cómo rotula
  el eje y qué muestra al pasar el puntero.

## 10. Pendiente del usuario y preguntas abiertas

1. **P-05 en el workspace de Clockify** (usuario, sesión de relevamiento): qué
   granularidad usa el gráfico con períodos largos en un plan que los permita,
   cómo rotula el eje y qué dice al pasar el puntero. Queda lo de este contrato
   hasta entonces. No bloquea.
2. **Nota para el team-lead, no es pregunta: dos frases de D-R10-12 cambian y
   el mapa tiene un desvío** (D-R5-3, D-R5-5, D-R5-7). El gráfico no llama a
   `totalsByLevels` sino a `totalsByBucket`, que arma la misma sentencia con el
   mismo código, para no cambiar el valor de dieciséis afirmaciones
   existentes; `src/server/time` suma `monthShortLabel` para las marcas del
   mes; y el JavaScript de cliente, además de mostrar el valor al pasar, mueve
   el foco entre las columnas con una sola parada de tabulación, que el mapa
   (§3, R5) no nombraba. No es un ADR: no contradice ninguno; si el mapa se
   actualiza, R5 dice «el valor con el puntero o con el foco, y el foco
   itinerante».
3. **Nota para el usuario, no es pregunta: los umbrales del ADR 0021 no se
   mueven** (D-R5-4): hasta 31 días por día, hasta 182 por semana, más por mes.
   Si después de usarlo prefiere otros, cambian dos constantes y los tests del
   criterio 1.

## 11. Fuera de alcance

- Barras partidas por facturable o por proyecto (RP-16) y el gráfico de torta
  (RP-17).
- Elegir la granularidad a mano.
- Un clic en una barra que cambie el período o filtre la tabla.
- El gráfico en la exportación (R6, R7, D-R5-10).
- Líneas de objetivo, promedios o comparación con otro período.
- Numerar las semanas en el eje («S40»).
- El tablero (RP-40 a RP-43), con su propio gráfico.
