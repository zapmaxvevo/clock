# Núcleo de reportes, R3: subgrupos, tarea y etiqueta

Contrato del cuarto slice del núcleo de reportes. Extiende la pantalla
`/reportes` y el módulo `src/modules/report/` de R2b: suma la tarea y la etiqueta
como agrupaciones, reemplaza las tres lecturas por dimensión por una sola
lectura por niveles y trae los subgrupos con su tope de filas. Sin cambios de
tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-11 en el
  resto (tarea y etiqueta), RP-12 (hasta tres niveles, sin repetir), RP-13
  (expandir un grupo), RP-18 (la suma por etiqueta puede superar el total) y
  RP-28 («Sin tarea», «Sin etiqueta»). Se apoya en RP-22, RP-29, RP-32 y RP-33
  tal como los dejó R2b.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R3» y
  «Lo que vale para todos». Depende de R2b, en `main` (`7b66b03`). Tarea entra
  por decisión del usuario (mapa §5: «tarea como dimensión (RP-11)»).
- **Revisión del contrato:** aprobado con cambios en la primera ronda de
  `architecture-reviewer`; los hallazgos R1 a R13 están aplicados
  ([`correcciones-nucleo-reportes-r3-contrato.md`](correcciones-nucleo-reportes-r3-contrato.md)).
- **Dos partes, en este orden** (D-R3-1): la **parte A**, tarea y etiqueta en
  un nivel sobre la lectura por niveles, y la **parte B**, subgrupos y expandir,
  en commits propios al final. Los commits de la parte A compilan y pasan sin
  la B, así que el slice se puede partir en R3a y R3b sin reescribir nada (§7).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): «una sola foto»,
    en una sentencia o en «una transacción de solo lectura en `repeatable
read`», **que elige el contrato**; «el total no pasa por la unión con
    etiquetas»; los nombres por `join` en la misma sentencia; el tope de 366
    días acota «el árbol de tres niveles con la fecha abajo».
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): toda
    lectura recibe el `ReportScope`.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    los nombres de la tarea, de su proyecto y de la etiqueta se leen con `join`
    en el repository propio.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): los rótulos se arman
    en el servidor.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** Las dos
  elecciones de peso las delegan documentos aceptados: cómo se lee el árbol y su
  tope, el mapa (§3, R3: «El contrato elige entre…»); la foto única, el ADR 0021
  y D-R2a-7 («R3 … tiene que leer el total aparte; su contrato elige»). Lo que
  queda para el usuario o el team-lead está en §10.

Decisiones que el contrato da por tomadas (R2a, R2b, mapa §5, `reportes.md` §8):
solo owner y admin ven horas ajenas; un member con un enlace ajeno ve lo propio;
el tope de 366 días; los grupos sin horas no se muestran hasta R9; la regla de
los e2e del reporte de §8.3 de R2a; «Sin …» como rótulo de lo que no tiene la
dimensión (RP-28, P-05 resuelto con la propuesta del núcleo).

## Decisiones del contrato

**D-R3-1 — Dos partes.** Opciones: (1) un solo slice; (2) dos contratos; (3) un
contrato en dos partes, como R2b. **(3).** La parte A —tarea y etiqueta en un
nivel— trae la pieza técnica nueva del backend, la lectura por niveles (D-R3-2),
con una sola dimensión en uso en la pantalla y sin tocar la forma del estado;
la lectura de dos y tres niveles se entrega con sus tests de integración
(criterio 8), así que la A no deja en `main` SQL sin probar. La parte B
—subgrupos, tope y expandir— no cambia ninguna consulta: suma el parámetro
`limit` a la misma función, arma el árbol en el service y trae casi toda la
pantalla nueva. Así cada parte tiene un riesgo principal: la A, que la lectura
nueva sume lo mismo que las tres que reemplaza; la B, el tamaño del árbol. Si la
B se demora, la A se mergea como R3a con su propio cierre (§7). Partirlo en dos
contratos obligaría a fijar dos veces las formas que comparten.

**D-R3-2 — Una lectura por niveles reemplaza a las tres por dimensión.**
Opciones: (1) dos funciones nuevas, `totalsByTask` y `totalsByTag`, como las de
R2a, y otra genérica para los subniveles; (2) una sola función,
`totalsByLevels`, que agrupa por una lista de una a tres dimensiones y
reemplaza a `totalsByPerson`, `totalsByProject` y `totalsByBucket`; (3) leer las
entradas y agrupar en JS (descartada por el ADR 0021). **(2).** Los subniveles
combinan seis dimensiones en hasta tres niveles sin repetir —120 ternas—, así
que hace falta una lectura genérica de todos modos; con (1), la clave, las
uniones y los nombres de cada dimensión quedarían escritos dos veces, una para
el nivel único y otra para los subniveles, y «Sin cliente» o «Sin tarea»
podrían decir cosas distintas según el nivel. Con (2), cada dimensión se
describe una vez (tabla de §4.3) y un nivel es el caso de una lista de largo
uno.

- **Reemplaza a D-R2b-5**, que dejaba la puerta abierta («R3 … puede reusar las
  mismas filas o elegir otra sentencia»). El cliente deja de plegarse en el
  service: su clave es `project.client_id`, con `project` unido dentro de la
  agregación. Lo que dice la pantalla no cambia —«Sin cliente» junta las
  entradas sin proyecto y las de proyectos sin cliente, y el cliente archivado
  cuenta—, y los tests de R2b lo siguen afirmando.
- **Sigue D-R2a-8 y D-R2b-7.** La sentencia agrega primero y une los nombres
  después, sobre las filas ya agrupadas; las claves se calculan por entrada en
  una subconsulta y la agregación de afuera agrupa por sus columnas, así que el
  parámetro de los cortes aparece una sola vez.
- **Sigue `inScope`, `closedIn` y `entrySeconds` de R2a**, sin copia: son la
  única traducción del alcance, la única regla de qué cuenta y la única medida.

**D-R3-3 — La etiqueta suma en cada una, y el total se lee aparte** (RP-18,
ADR 0021). Con la etiqueta entre las dimensiones, la subconsulta une
`time_entry_tag` con `left join`: una entrada con `k` etiquetas da `k` filas, y
una sin etiquetas, una fila con la etiqueta nula. Por eso:

- **El grupo de una etiqueta suma todas sus entradas**, y una entrada con varias
  suma en cada una: la suma de los grupos de etiqueta puede pasar la del nivel
  de arriba y el total.
- **«Sin etiqueta» son las entradas sin ninguna etiqueta.** Una entrada con
  etiquetas nunca está en «Sin etiqueta». Una etiqueta archivada cuenta y su
  fila no lo marca (como RP-29). Una etiqueta borrada ya no está en la entrada
  (PR-69, la cascada de `time_entry_tag_tag_fk`): si era la única, la entrada
  pasa a «Sin etiqueta».
- **Los niveles por debajo de la etiqueta** reparten las entradas de esa
  etiqueta, así que suman lo mismo que su grupo. **Los de arriba** no unen
  etiquetas —cada nivel es su propia sentencia (D-R3-6), y la unión va solo en
  las que tienen la etiqueta— y suman lo real.
- **La cabecera tiene siempre el total real.** Si la etiqueta es el primer
  nivel, el total y el facturable salen de `entryTotals`, una sentencia sin la
  unión; si no, de la suma del primer nivel, como en R2a (D-R2a-7), porque ese
  nivel no tiene la etiqueta.
- **Una sola foto: una transacción de solo lectura en `repeatable read`**, como
  la nombra el ADR 0021. Opciones: (1) el total en la misma sentencia, con una
  subconsulta escalar; (2) las lecturas de un pedido en una transacción
  `repeatable read` de solo lectura. **(2)**: la parte B lee un nivel por
  sentencia, así que la transacción hace falta de todos modos, y la misma forma
  sirve para las dos partes. Tiene precedentes en producción con
  `neon-serverless`: `readCatalog` de `project` (`project/service.ts:430-444`)
  y, con el `tx` como último parámetro de la lectura, `getCalendarState` de
  `time-entry` (`time-entry/service.ts:1881-1934`). Se abre en cada pedido que
  pasa `report.view`, también con una sola lectura, para que el service tenga
  un solo camino.
- **La pantalla lo avisa** con una línea debajo de la de la zona, solo si la
  etiqueta es uno de los niveles que se muestran: «Una entrada con varias
  etiquetas suma en cada una: las filas por etiqueta pueden sumar más que el
  total.».

**D-R3-4 — La tarea.** La clave es `time_entry.task_id`. **«Sin tarea»** junta las
entradas de un proyecto sin tarea y las que no tienen proyecto (RP-28; una
tarea no existe sin su proyecto, `time_entry_task_needs_project`). La fila
muestra el nombre de la tarea y, en gris, el de su proyecto, como la de un
proyecto muestra su cliente: dos tareas con el mismo nombre en proyectos
distintos son dos filas que se distinguen. «Sin tarea» va en gris, sin
proyecto. Una tarea hecha cuenta y su fila no lo marca (RP-29); una tarea
borrada deja sus entradas sin tarea (`set null`), que pasan a «Sin tarea». El
orden es el de R2a: duración, `compareNames` sobre el nombre de la tarea (que
desempata por id) y «Sin tarea» después de las de su misma duración. El
proyecto en gris se muestra también debajo de un grupo de proyecto, como el
cliente de un proyecto debajo de un grupo de cliente.

**D-R3-5 — Los subniveles en la URL: `subagrupar`.** Opciones: (1) una lista en
`agrupar` (`agrupar=proyecto,fecha`); (2) `agrupar` repetido; (3) `agrupar`
para el primer nivel, como hoy, y `subagrupar` con una lista de uno o dos
valores separados por coma (`agrupar=proyecto&subagrupar=fecha,etiqueta`).
**(3).** (2) contradice la regla de RP-32, que descarta un parámetro repetido.
(1) cambia el resultado de `reportGroupParams` y la forma de la URL de cada
enlace de R2a y R2b. Con (3), `agrupar` y sus tests no cambian, una URL de un
nivel sigue teniendo tres parámetros, y los subniveles son un parámetro nuevo,
como «Agrupar por» y los subgrupos de Clockify («You can further breakdown data
by sub groups.», RP-12).

- **Válido** es: uno o dos valores de `REPORT_GROUP_PARAMS`, separados por una
  coma, distintos entre sí y distintos del primer nivel efectivo —el de
  `agrupar` o, si `agrupar` no es válido o falta, `persona`—. **Cualquier otra
  cosa descarta `subagrupar` entero**, sin aviso (RP-32): un valor desconocido,
  una mayúscula, una coma de más, un valor vacío, tres valores, uno repetido,
  el del primer nivel o el parámetro repetido. El rango y `agrupar` se validan
  por su lado, como en R2a.
- La coma la escribe `URLSearchParams` como `%2C`; Next la entrega
  decodificada, así que un enlace escrito a mano con `,` vale igual.
- **Sin `subagrupar`, un nivel**, como en R2b.

**D-R3-6 — El árbol entero, con un tope, y se expande en el navegador.** Es el
riesgo principal del mapa. Opciones:

1. **El árbol entero con un tope de filas**: el servidor lee todos los niveles
   pedidos en una foto, de arriba abajo, y deja de leer en el primero que no
   entra en el tope; el navegador recibe el árbol y expande y contrae sin volver
   al servidor.
2. **Expandir pidiendo el nivel siguiente**: el servidor lee el primer nivel y
   los hijos de cada grupo abierto, con lo abierto en la URL.

**(1).** Los motivos:

- **La exportación de R6 lee el árbol entero** con el mismo tope (mapa §3, R6:
  «Tope de filas: el mismo del árbol de R3»). Con (2), R6 tendría que traer
  igual la lectura de (1), y la pantalla y el archivo tendrían dos caminos.
- **Expandir con (2) es recargar la página**: una navegación con la lectura de
  todos los niveles abiertos, contra Neon, por cada clic. Con (1) es un botón
  con `aria-expanded` que no sale del navegador. Un enlace que expande no es un
  control de expandir para un lector de pantalla.
- **Lo abierto en la URL crece sin límite propio**: una ruta de hasta tres ids
  por grupo abierto, con un tope más que validar.
- **Lo que viaja está acotado y se mide** (§6): los niveles 2 y 3 nunca
  devuelven más filas que su presupuesto más una, y un nivel que no entra no
  viaja. El trabajo de la base no lo acota el tope —la agregación se completa
  antes del `limit`—, sino los 366 días.

Lo que se pierde: **lo abierto no sobrevive a una recarga ni a una navegación**
y no viaja en un enlace. Al cargar, y en cada navegación dentro de la pantalla
—las flechas, un atajo, «Aplicar», un cambio de agrupación—, todo empieza
contraído (D-R3-9). RP-32 pide que la URL reproduzca el período y la
agrupación, que sí están; qué hace Clockify con lo expandido al recargar está
_no verificado_ (P-05). Es la pregunta 2 de §10.

**El tope**:

- **`REPORT_MAX_ROWS = 3000` filas** sumando todos los niveles, el mismo número
  que el PDF de Clockify (RP-53) y que el mapa pide para R6 y R7. Lo fija
  `architect` por rendimiento, como el de 366 días (ADR 0021); §6 lo mide.
- **El primer nivel se lee siempre entero**, como en R2b, y no lo acota el
  tope: lo acotan el catálogo (personas, proyectos, clientes, tareas,
  etiquetas) y los 366 días. Puede pasar de 3000 por su cuenta —un workspace
  con miles de tareas—; entonces no se lee ningún nivel de abajo.
- **Un nivel entra entero o no entra.** El nivel `d` se pide con
  `limit = presupuesto + 1`, donde el presupuesto es el tope menos las filas de
  los niveles de arriba; si vuelve con más filas que el presupuesto, ese nivel y
  los de abajo no se muestran y no se leen. Con el presupuesto en cero o menos,
  el nivel no se pide. Nunca se muestra una parte de un nivel: un grupo sin
  algunos de sus hijos parecería tener menos horas.
- **Lo que viaja** en un pedido es, entonces, las filas del nivel 1 y, como
  mucho, `REPORT_MAX_ROWS` menos esas filas más una por nivel pedido.
- **La pantalla lo dice** con una línea encima de la tabla: «El reporte pasa de
  3000 filas con todos sus niveles: se muestran solo los de arriba. Acortá el
  período o quitá un nivel.». Los controles siguen mostrando los niveles
  pedidos, que es lo que dice la URL.
- **La escala que corta**: en el volumen de §6, un año de 30 personas por
  persona y fecha son unas 7800 filas en el segundo nivel y no entra; se ve por
  persona. Un mes son unas 700 y entra. Persona → Proyecto de un año, unas 750,
  entra (§10, nota 4).

**D-R3-7 — El estado lleva el árbol anidado.** Cada grupo suma `children`,
**opcional**: está si el nivel de abajo se leyó y se muestra, y entonces tiene
al menos un hijo —toda entrada tiene una clave en cada dimensión, aunque sea
«Sin …»—; no está en el último nivel que se muestra. Un reporte de un nivel no
tiene `children` en ningún grupo, así que su estado es el de R2b más dos campos:
`subgroups` (los niveles pedidos debajo del primero) y `levelsShown`. Opciones
descartadas: una lista plana en preorden con la clave del padre, que obliga a
los tests de R2a y R2b a cambiar `groups` y que el service tendría que armar
igual como árbol para ordenar a los hermanos; y lo abierto en el estado, que es
del navegador (D-R3-6).

**D-R3-8 — Los controles de los subniveles.** «Agrupar por» sigue siendo el grupo
de enlaces de R2a, con seis enlaces en este orden: «Persona», «Proyecto»,
«Cliente», «Tarea», «Etiqueta» y «Fecha». Después, «Subagrupar por» con un
botón por nivel: «Segundo nivel: {dimensión o Ninguno}» y, si hay segundo
nivel, «Tercer nivel: …». Cada botón abre un popover con una lista de enlaces,
como los atajos (D-R2b-10): la lista es un componente propio que se dibuja sin
el popover en unidad.

- **Opciones de cada nivel**: el segundo ofrece «Ninguno» y las cinco que no son
  el primero; el tercero, «Ninguno» y las cuatro que no son el primero ni el
  segundo. La elegida —o «Ninguno»— lleva `aria-current="true"`.
- **Elegir en un nivel una dimensión que ya está en otro los intercambia.** Es
  lo que permite pasar de «Persona → Proyecto» a «Proyecto → Persona» con un
  clic en «Proyecto» de «Agrupar por». **«Ninguno» en un nivel quita ese nivel
  y los de abajo.** Una sola función pura arma el resultado (§5.2), y la usan
  los enlaces de los tres niveles.
- **Todo enlace del reporte conserva los subniveles**: las flechas, «Esta
  semana», los atajos, «Aplicar» y los de agrupación (que los cambian con la
  regla de arriba).
- **Al elegir**, el popover se cierra y el foco vuelve a su botón, como con un
  atajo (`onNavigate`, desvío aceptado de R2b).
- Opción descartada: tres popovers, el primero también. Cambiaría el control de
  R2a que usan los recorridos de R2a y R2b, sin ganar nada que la lista de
  enlaces no tenga.

**D-R3-9 — Expandir y contraer** (RP-13).

- **Al cargar y en cada navegación, todo contraído**: se ven los grupos del
  primer nivel. `ReportTree` lleva como `key` el `href` del pedido
  (`reportHref` del rango y la agrupación del estado), así que cada navegación
  dentro de la pantalla lo monta de nuevo y no acumula claves de otro pedido.
  Sin esa `key`, el estado sobreviviría a las flechas y a los cambios de
  agrupación, porque el `Suspense` de `page.tsx:17` no la lleva.
- **Cada grupo con hijos lleva un botón** dentro de su encabezado de fila, con
  el chevrón (oculto al lector) y el contenido del encabezado: el nombre del
  botón es el del grupo, y su estado, `aria-expanded`. Un grupo del último nivel
  que se muestra no tiene botón.
- **Contraer oculta a todos los descendientes**; volver a expandir muestra a los
  hijos como estaban (lo abierto es un conjunto de claves, y una fila se ve si
  todos sus ancestros están abiertos).
- **Las filas contraídas no se dibujan**: no están en el DOM. El botón no lleva
  `aria-controls`, que apuntaría a filas que no existen.
- **La sangría marca el nivel.** El orden de las filas y el estado del botón
  bastan para un lector de pantalla; `treegrid` queda como deuda si la
  revisión de accesibilidad lo pide (§9).
- **La cifra de cada fila es la de su grupo**, truncada al minuto como en R2a.

**D-R3-10 — Volumen.** La parte A vuelve a medir Q1 a Q3, Q5 y Q6 con la
sentencia nueva y mide cliente, tarea, etiqueta y `entryTotals`; la B mide los
dos peores pedidos del árbol —con la persona y con la etiqueta primero— y el
peso de una página de 3000 filas (§6). `seed.sql` suma las etiquetas, como dejó
dicho R2a (§6.1).

**D-R3-11 — Sin comprobación contra Neon.** La de §6.3 de R2b se pidió por una
forma de parámetro nueva, el arreglo de cortes. R3 no trae ninguna: los cortes
son el mismo parámetro, una sola vez, en la misma subconsulta; `limit` llega
como un entero, igual que el `.limit(1)` de `findById` de `time-entry`
(`time-entry/repository.ts:528`), que Drizzle emite como `limit $n`; el
`begin` de la transacción, también con `read only`, es SQL fijo sin
parámetros, y la transacción `repeatable read` ya corre en producción en
`readCatalog`. Los `join` nuevos son de columnas, sin parámetros. Si
`backend-dev` necesita una forma nueva (un arreglo de ids, por ejemplo), avisa
y la comprobación vuelve con el procedimiento de §6.3 de R2b, antes del merge.

**D-R3-12 — Los e2e de R3.** Heredan §8.3 de R2a sin cambios. Tarea, etiqueta y
subniveles se prueban con alcance propio, el único donde «Sin tarea», «Sin
etiqueta» y los totales son reproducibles. El tope no se prueba en e2e: hacen
falta más de 3000 grupos de una persona (§8.4).

**D-R3-13 — Lo que se prueba en unidad y lo que no.** Como D-R2b-10: el arnés es
`environment: "node"` con `renderToStaticMarkup`, sin DOM
(`vitest.config.ts:11`), y el contenido de un popover solo se monta abierto
(`popover.tsx:28`). En unidad van la primera pintura del árbol (todo contraído,
los botones con `aria-expanded="false"`), las listas de los subniveles
dibujadas sin popover y las dos funciones puras: qué filas se ven con un
conjunto de abiertos y qué agrupación resulta de elegir en un nivel. Expandir
con un clic o con el teclado, el cierre del popover, el foco y que una
navegación vuelva a contraer son de los e2e 11 y 12.

## 0. Precondición de arranque

- **`main` en `7b66b03`**, con R2b mergeado. Las citas de abajo son de ese
  árbol. Los tests de integración y CI usan `postgres:18-alpine`, la versión
  mayor de Neon (`ci.yml:46-47`); `test:unit` corre en UTC y `test:time-ar` en
  Buenos Aires, y todo test de tiempo fija reloj y zona.
- **Sin pendientes del usuario para arrancar.** No hay comprobación contra Neon
  (D-R3-11). Las preguntas de §10 no bloquean.

### Supuestos sobre el árbol, con archivo y línea en `7b66b03`

| Supuesto                                                                                                                                                                                                                                                                                 | Dónde                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `REPORT_GROUP_BYS` es `["person", "project", "client", "date"]`; `REPORT_GROUP_PARAMS` los traduce; `reportGroupParams` busca `agrupar` en ese mapa, así que una agrupación nueva se lee sola                                                                                            | `src/modules/report/schema.ts:65-82`                                                                        |
| La unión de grupos del estado es discriminada por `kind`, con cuatro tipos; `sameRange` compara rangos                                                                                                                                                                                   | `schema.ts:107-145`, `:169-185`; `:20-22`                                                                   |
| `reportReadyState` se parsea en tests de esquema y de integración                                                                                                                                                                                                                        | `schema.test.ts:280`, `:292`; `service.integration.test.ts:414`, `:511`, `:638`                             |
| `Scope` y `scopeOf` viven en el service; el service pliega el cliente con `clientRowsOf` (D-R2b-5)                                                                                                                                                                                       | `src/modules/report/service.ts:49-82`, `:111-138`                                                           |
| `sortKeyOf` y `compareGroups` reciben `Exclude<ReportGroup, ReportDateGroup>` con un `switch` exhaustivo; `compareDays` usa `compareDayKeys`; `totalsOf` recibe el comparador                                                                                                            | `service.ts:156-192`, `:205-218`                                                                            |
| `readGroups` elige una lectura por agrupación; `dayBuckets` se llama solo por fecha; `getReportState` valida 1 a 366 días antes de leer y arma `span` con `startOfDayKey`                                                                                                                | `service.ts:231-265`, `:271-319` (`:287-298`)                                                               |
| `inScope`, `closedIn`, `entrySeconds`, `sums`, `secondsOf`, `withSeconds` y `bucketIndexOf` son privadas del repository                                                                                                                                                                  | `src/modules/report/repository.ts:51-123`                                                                   |
| `totalsBy` agrega por `(workspace_id, columna)` y une los nombres afuera; `totalsByPerson`, `totalsByProject` y `totalsByBucket` son las tres lecturas, todas con `db`                                                                                                                   | `repository.ts:132-143`, `:150-246`                                                                         |
| `totalsByBucket` pasa los cortes con `sql.param` una vez, en una subconsulta por entrada, y agrupa afuera                                                                                                                                                                                | `repository.ts:210-245` (`:220`)                                                                            |
| El patrón `tx: Executor = db` como último parámetro de una lectura, con `Executor = Transaction \| typeof db`                                                                                                                                                                            | `src/modules/time-entry/repository.ts:118`, `:495-501`; `src/server/db/index.ts:26-27`                      |
| `readCatalog` y `getCalendarState` leen en una transacción `repeatable read` con `db.transaction(…, { isolationLevel })`, en producción con `neon-serverless`                                                                                                                            | `src/modules/project/service.ts:425-444`; `time-entry/service.ts:1881-1934`; `src/server/db/index.ts:16-22` |
| `task` es única por `(workspace_id, id)` y su `project_id` no es nulo; `task_name_unq` es por proyecto, así que dos tareas de proyectos distintos pueden llamarse igual                                                                                                                  | `src/server/db/schema.ts:311-360` (`:317`, `:344`, `:352-356`)                                              |
| `tag` es única por `(workspace_id, id)` y se archiva con `archived_at`                                                                                                                                                                                                                   | `schema.ts:363-397` (`:370`, `:391`)                                                                        |
| `time_entry.task_id` nulo es «sin tarea»; la tarea necesita proyecto; la clave de la tarea es `set null`                                                                                                                                                                                 | `schema.ts:421-422`, `:455-465`                                                                             |
| Toda entrada tiene membresía en su workspace (`time_entry_membership_fk`)                                                                                                                                                                                                                | `schema.ts:477-481`                                                                                         |
| `time_entry_tag` tiene clave `(time_entry_id, tag_id)`, las dos claves compuestas con el workspace y cascada al borrar la entrada o la etiqueta                                                                                                                                          | `schema.ts:490-520`                                                                                         |
| `client` y `project` son únicos por `(workspace_id, id)`                                                                                                                                                                                                                                 | `schema.ts:242`, `:292`                                                                                     |
| `seedTimeEntry` acepta `taskId` y `tagIds`; `seedTask` acepta `status`; `seedTag`, `archived`                                                                                                                                                                                            | `src/test/factories.ts:111-139`, `:212-230`, `:233-249`                                                     |
| El test de B1 espía las tres lecturas; el de los 366 días mira `mock.calls[1]?.[1].buckets`; el de B3 toma el alcance de una lectura real                                                                                                                                                | `src/modules/report/service.integration.test.ts:836-900`                                                    |
| `scope.integration.test.ts`: una entrada por persona el 29/09, sin tarea ni etiqueta; `groupBys` es `REPORT_GROUP_BYS` y se recorre con actores activos; `summaryOf` resuelve `kind` con un `switch`; `expectForbiddenWithoutReading` espía las tres lecturas                            | `src/modules/report/scope.integration.test.ts:76`, `:110-235`, `:249-275`, `:383-399`, `:407-505`           |
| `scope.test-d.ts` afirma que las tres lecturas no compilan sin alcance, con `undefined` ni con `null`                                                                                                                                                                                    | `src/modules/report/scope.test-d.ts:18-37`                                                                  |
| `reportHref` arma siempre los tres parámetros; `applySelection` recibe la agrupación                                                                                                                                                                                                     | `components/report-href.ts:11-24`; `components/range-picker-model.ts:35-54`                                 |
| La barra dibuja cuatro `GroupByLink` dentro del grupo «Agrupar por»; las flechas, «Esta semana» y los atajos arman su `href` con `groupBy`                                                                                                                                               | `components/report-toolbar.tsx:30-78`; `components/range-picker.tsx:165`                                    |
| `RangePicker` cierra el popover al elegir un atajo; `RangePanel` dibuja la lista sin popover                                                                                                                                                                                             | `range-picker.tsx:93-105`, `:111`                                                                           |
| `ReportView` elige el encabezado de la columna en `GROUP_COLUMN_HEADINGS` (`satisfies Record<ReportGroupBy, string>`); `groupKey` y `GroupHeading` resuelven `kind` con un `switch`, `GroupHeading` con `ReactElement` como tipo de retorno: una agrupación nueva no compila sin su caso | `components/report-view.tsx:21-26`, `:106-131`                                                              |
| La página valida rango y agrupación por su lado y pasa `request`; su `Suspense` no lleva `key`                                                                                                                                                                                           | `src/app/(app)/reportes/page.tsx:13-27`                                                                     |
| «Sin proyecto» y «Sin cliente» son `projectLabels`; no hay «Sin tarea» ni «Sin etiqueta»; el calendario dice «Sin etiquetas» de una entrada                                                                                                                                              | `project/components/labels.ts:13`, `:39`; `time-entry/components/calendar/labels.ts:87`                     |
| `seed.sql` siembra tareas en los proyectos pares y entradas con tarea; las etiquetas «llegan con R3»; `explain.sql` tiene Q1 a Q6                                                                                                                                                        | `scripts/report-volume/seed.sql:11`, `:77-85`, `:143-146`; `explain.sql`                                    |
| e2e: `ReportGroupBy` y `GROUP_LINK` con cuatro agrupaciones; `reportsUrlOf` lee `getAll("agrupar").join(",")`; `groupRow` busca por el comienzo del encabezado de fila                                                                                                                   | `e2e/reports-page.ts:70-81`, `:156-170`, `:258-266`                                                         |
| e2e: `SeedEntry` no lleva tarea ni etiquetas; `seedProject` acepta `tasks`; `seedTag`, `archiveTag` y `markTaskDone` existen                                                                                                                                                             | `e2e/database.ts:407-476`, `:198-256`, `:278`, `:153`, `:294`                                               |
| `src/server/time` ya tiene todo lo que R3 usa: `dayBuckets`, `weekdayLabel`, `compareDayKeys`, `startOfDayKey`                                                                                                                                                                           | `src/server/time/index.ts:333`, `:371`, `:418`, `:443-460`                                                  |

## 1. Alcance

Entra, **parte A** (tarea y etiqueta en un nivel):

- **El módulo `report`**: `task` y `tag` en el esquema con sus tipos de grupo;
  `totalsByLevels` y `entryTotals` en el repository, que reemplazan a las tres
  lecturas de R2a y R2b, con la lectura de dos y tres niveles probada; el
  service lee en una transacción de solo lectura `repeatable read`.
- **La pantalla**: «Tarea» y «Etiqueta» en «Agrupar por»; sus filas, con «Sin
  tarea» y «Sin etiqueta»; la línea de la suma por etiqueta.
- **La medición** de §6.2, con las etiquetas en `seed.sql`.

Entra, **parte B** (subgrupos y expandir), en commits propios al final:

- **El módulo `report`**: `subagrupar` en la URL; `subgroups`, `levelsShown` y
  `children` en el estado; `REPORT_MAX_ROWS`; `limit` en `totalsByLevels`; el
  árbol y su tope en el service.
- **La pantalla**: «Subagrupar por» con sus dos niveles; expandir y contraer;
  la línea del tope; todos los enlaces conservan los subniveles.
- **La medición** de §6.3 y §6.4.

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                                         | Qué cambia                                                                                                                                                                                                                                                                                        | Qué hay que volver a probar                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/modules/report/schema.ts`                  | A: `task` y `tag` en las dos listas y dos tipos de grupo. B: `REPORT_MAX_ROWS`, `ReportGrouping`, `reportSubgroupParams`, `children`, `subgroups` y `levelsShown`.                                                                                                                                | `schema.test.ts`; los fixtures de componentes                       |
| `src/modules/report/repository.ts`              | A: `totalsByLevels` y `entryTotals` reemplazan a `totalsByPerson`, `totalsByProject`, `totalsByBucket` y `totalsBy`; las funciones privadas siguen. B: `limit`.                                                                                                                                   | `service.integration.test.ts` y `scope.integration.test.ts` enteros |
| `src/modules/report/service.ts`                 | A: una sola lectura en una transacción; sale `clientRowsOf` (D-R2b-5); `sortKeyOf` con tarea y etiqueta. B: el árbol, el tope y la invariante de los subniveles.                                                                                                                                  | Ídem                                                                |
| `service.integration.test.ts`                   | A: los espías de `:841-899` pasan a `totalsByLevels` y `entryTotals`; los tramos se leen de `read.buckets`. **Ningún valor afirmado cambia.**                                                                                                                                                     | —                                                                   |
| `scope.integration.test.ts`                     | A, paso 1 (`backend-dev`, edición mecánica): los casos `task` y `tag` de `summaryOf`, `rowOf` y `everyoneInAGroups`, y `groupBys` fijo en las cuatro de R2b. A, pasos 2 y 4 (`test-engineer`): los espías de `:383-399`; tarea y etiquetas en el fixture; `groupBys` vuelve a `REPORT_GROUP_BYS`. | —                                                                   |
| `scope.test-d.ts`                               | A: las nueve afirmaciones de las tres lecturas pasan a `totalsByLevels` y `entryTotals`.                                                                                                                                                                                                          | `npm run typecheck`                                                 |
| `report-view.tsx`                               | A, paso 1 (`backend-dev`, edición mecánica): los casos `task` y `tag` de `GROUP_COLUMN_HEADINGS`, `groupKey` y `GroupHeading`, para que compile. `frontend-dev` los completa después.                                                                                                             | `report-view.test.tsx`                                              |
| `src/modules/report/components/*`               | A: dos enlaces, dos filas y la línea de la etiqueta. B: «Subagrupar por», el árbol, la línea del tope y los `href` con los subniveles. B, paso 6 (`backend-dev`, edición mecánica): `subgroups: []` y `levelsShown: 1` en los fixtures.                                                           | Los tests de componentes                                            |
| `report-toolbar.test.tsx`                       | A: **la lista de enlaces de agrupación en orden pasa de cuatro a seis** (criterio 13 de R2b). Es la única afirmación existente que cambia de valor, por D-R3-8.                                                                                                                                   | —                                                                   |
| `src/app/(app)/reportes/page.tsx`               | B: suma `reportSubgroupParams.safeParse` y pasa `subgroups`.                                                                                                                                                                                                                                      | e2e                                                                 |
| `e2e/reports-page.ts`, `e2e/database.ts`        | A: `ReportGroupBy` y `GROUP_LINK` con `tarea` y `etiqueta`; `SeedEntry` con `task` y `tags`. B: `reportsUrl` y `reportsUrlOf` con los subniveles y los localizadores nuevos.                                                                                                                      | `reports.spec.ts` entero y los specs que usan `seedEntries`         |
| `scripts/report-volume/seed.sql`, `explain.sql` | A: las etiquetas; Q1 a Q3, Q5 y Q6 con el texto nuevo, y Q7 a Q10. B: Q11 a Q16.                                                                                                                                                                                                                  | —                                                                   |

- **Una URL de un nivel no cambia**: sigue con tres parámetros, y
  `reportGroupParams` no se toca.
- **Los tests de R2a y R2b siguen afirmando lo mismo.** Cambian los espías,
  porque las funciones que espían dejan de existir, y la lista de la barra. Si
  algún valor afirmado de persona, proyecto, cliente o fecha cambia con la
  lectura nueva, es un error de la migración, no del test.
- **Las ediciones mecánicas fuera del reparto** (pasos 1 y 6 de §7) siguen la
  regla de R2b («backend, 1» y «backend, 4» de
  `correcciones-nucleo-reportes-r2b-revisiones.md`): las hace `backend-dev`
  para que su commit compile y pase, con el aviso al team-lead, y espera a que
  el dueño del archivo commitee lo que tenga pendiente en él.
- `report-screen.tsx` y `period.ts` no cambian: la pantalla pasa el estado
  entero a la barra y a la vista.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** La unión con `time_entry_tag` usa su clave
primaria, que empieza por `time_entry_id`. Si alguna consulta o pedido de §6
pasa su presupuesto, vale la regla de §6.5: el slice se detiene y vuelve a
`architect`; ningún índice se suma sin una medición que lo justifique.

## 3. Permisos

**Ninguna acción nueva.** `report.view` y `timeEntry.others.view` deciden como en
R2a. `totalsByLevels` y `entryTotals` reciben el `ReportScope` como primer
parámetro y lo traducen con `inScope`; ninguna consulta arma su propio filtro de
personas. La transacción no cambia ninguna decisión: se abre después de
`report.view` y de `scopeOf`, y no se abre sin permiso.

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
] as const;

export const REPORT_GROUP_PARAMS = {
  person: "persona",
  project: "proyecto",
  client: "cliente",
  task: "tarea",
  tag: "etiqueta",
  date: "fecha",
} as const satisfies Record<ReportGroupBy, string>;

// parte B
/**
 * RP-12, D-R3-6: cuántas filas pueden sumar los niveles de un árbol. Acota lo
 * que se lee de los niveles 2 y 3, no el primero. El mismo de R6 y R7.
 */
export const REPORT_MAX_ROWS = 3000;

// parte B
/** Los niveles de un reporte: el primero y, debajo, hasta dos más, sin repetir (RP-12). */
export type ReportGrouping = {
  readonly groupBy: ReportGroupBy;
  readonly subgroups: readonly ReportGroupBy[];
};

// parte B
/**
 * `?subagrupar=fecha,etiqueta` con `safeParse` (D-R3-5): uno o dos valores
 * distintos entre sí y del primer nivel efectivo, que lee de `agrupar` sin
 * validarlo ni devolverlo (`persona` si no es válido o falta). Cualquier otra
 * cosa se descarta entera.
 */
export const reportSubgroupParams; // { agrupar?, subagrupar } → readonly ReportGroupBy[]

const reportTaskGroup = z.object({
  kind: z.literal("task"),
  /**
   * `null` es «Sin tarea»: las entradas de un proyecto sin tarea y las sin
   * proyecto (RP-28). Hecha o no (RP-29).
   */
  task: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** El proyecto de la tarea, en gris; `null` con «Sin tarea». */
  project: z
    .object({ id: z.uuid(), name: z.string(), color: z.enum(PALETTE_KEYS) })
    .nullable(),
  seconds: z.number().int().min(0),
});

const reportTagGroup = z.object({
  kind: z.literal("tag"),
  /** `null` es «Sin etiqueta»: las entradas sin ninguna (RP-28). Archivada o no. */
  tag: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Una entrada con varias etiquetas suma en cada una (RP-18, D-R3-3). */
  seconds: z.number().int().min(0),
});

// parte B: los seis tipos de grupo suman
//   /** D-R3-7: el nivel de abajo, ordenado; ausente en el último que se muestra. */
//   get children() { return z.array(reportGroup).min(1).optional(); },
// con `const reportGroup = z.discriminatedUnion("kind", [los seis])`.

// reportReadyState suma, parte B:
//   /** Los niveles pedidos debajo del primero, de `subagrupar` (D-R3-5). */
//   subgroups: z.array(z.enum(REPORT_GROUP_BYS)).max(2),
//   /** Los niveles leídos que entran en el tope: menos que los pedidos si no (D-R3-6). */
//   levelsShown: z.number().int().min(1).max(3),
// y `groups` es `z.array(reportGroup)`.

export type ReportTaskGroup = z.infer<typeof reportTaskGroup>;
export type ReportTagGroup = z.infer<typeof reportTagGroup>;
```

- **La URL dice `tarea`, `etiqueta` y `subagrupar`**; el código, `task`, `tag` y
  `subgroups`.
- **El esquema recursivo** usa un getter, como pide Zod 4. Si la inferencia del
  tipo recursivo no alcanza, `ReportGroup` se declara a mano y el esquema se
  anota con él; `reportReadyState.parse` sigue siendo la prueba de que la forma
  y el tipo coinciden.
- `reportGroupParams` no cambia de cuerpo: `agrupar=tarea` y `agrupar=etiqueta`
  pasan porque lee `REPORT_GROUP_PARAMS`.

### 4.2 `src/server/time`

**No cambia.** R3 usa `dayBuckets`, `weekdayLabel` y `compareDayKeys` tal como
están.

### 4.3 Repository (`report/repository.ts`)

```ts
type StoredProject = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
};
type NamedRef = { readonly id: string; readonly name: string };

/** Lo que una fila dice de uno de sus niveles: el grupo y lo que se muestra de él. */
export type LevelGroupRow =
  | {
      readonly kind: "person";
      readonly userId: string;
      /** `user.name`, el de Google. */
      readonly accountName: string;
      /** `user_preference.display_name`, o `null`. */
      readonly displayName: string | null;
      readonly status: MembershipStatus;
    }
  | {
      readonly kind: "project";
      readonly project: StoredProject | null;
      readonly client: NamedRef | null;
    }
  | { readonly kind: "client"; readonly client: NamedRef | null }
  | {
      readonly kind: "task";
      readonly task: NamedRef | null;
      readonly project: StoredProject | null;
    }
  | { readonly kind: "tag"; readonly tag: NamedRef | null }
  | {
      readonly kind: "date";
      /** La posición del tramo en `buckets.buckets`, desde 0. */
      readonly bucket: number;
    };

export type LevelTotalRow = {
  /** Uno por dimensión pedida, en el mismo orden. */
  readonly groups: readonly LevelGroupRow[];
  readonly seconds: number;
  readonly billableSeconds: number;
};

export type ReportLevelRead = {
  readonly span: ReportSpan;
  /** De una a tres, sin repetir. */
  readonly dimensions: readonly ReportGroupBy[];
  /** Los tramos de `span` si `date` es una de las dimensiones; si no, `null`. */
  readonly buckets: TimeBuckets | null;
  /** Parte B: como mucho estas filas. Sin él, todas. */
  readonly limit?: number;
};

export type EntryTotals = {
  readonly seconds: number;
  readonly billableSeconds: number;
};

// en reportRepository, en lugar de totalsByPerson, totalsByProject y totalsByBucket:

  /**
   * Una fila por combinación de grupos con horas cerradas en `read.span`,
   * dentro de `scope`. Con la etiqueta entre las dimensiones, una entrada suma
   * en cada una de las suyas (D-R3-3). Una sentencia; sin orden.
   */
  totalsByLevels(
    scope: ReportScope,
    read: ReportLevelRead,
    tx: Executor = db,
  ): Promise<readonly LevelTotalRow[]>;

  /** El total y el facturable reales de `span`, sin unir etiquetas. Una sentencia, una fila. */
  entryTotals(
    scope: ReportScope,
    span: ReportSpan,
    tx: Executor = db,
  ): Promise<EntryTotals>;
```

**Cada dimensión se describe una vez**, en una tabla privada del repository:

| Dimensión | Clave por entrada                                             | Lo que une dentro de la agregación                                               | Lo que une afuera, por la clave                                                                                               |
| --------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `person`  | `time_entry.user_id`                                          | —                                                                                | `membership` interno por `(workspace_id, user_id)` (R1); `"user"` interno; `user_preference` con `left join`                  |
| `project` | `time_entry.project_id`                                       | —                                                                                | `project` por `(workspace_id, id)` y su `client` por `(workspace_id, project.client_id)`, los dos con `left join`             |
| `client`  | `project.client_id`                                           | `project` con `left join` por `(time_entry.workspace_id, time_entry.project_id)` | `client` por `(workspace_id, id)`, `left join`                                                                                |
| `task`    | `time_entry.task_id`                                          | —                                                                                | `task` por `(workspace_id, id)` y el proyecto de la tarea por `(task.workspace_id, task.project_id)`, los dos con `left join` |
| `tag`     | `time_entry_tag.tag_id`                                       | `time_entry_tag` con `left join` por `(time_entry.workspace_id, time_entry.id)`  | `tag` por `(workspace_id, id)`, `left join`                                                                                   |
| `date`    | `width_bucket(time_entry.started_at, $cortes::timestamptz[])` | —                                                                                | — (el service rotula con `buckets`)                                                                                           |

La sentencia, con los nombres de R2a:

```sql
select <lo que se muestra de cada dimensión>, totals.seconds, totals.billable_seconds
  from (select entries.workspace_id, entries.key_1 [, entries.key_2 [, entries.key_3]],
               sum(entries.seconds)::bigint as seconds,
               coalesce(sum(entries.seconds) filter (where entries.billable), 0)::bigint as billable_seconds
          from (select time_entry.workspace_id,
                       <clave de la dimensión 1> as key_1 [, …],
                       <entrySeconds> as seconds,
                       time_entry.billable
                  from time_entry
                  <las uniones de adentro de las dimensiones pedidas>
                 where <inScope(scope)> and <closedIn(read.span)>
               ) entries
         group by entries.workspace_id, entries.key_1 [, …]
       ) totals
  <las uniones de afuera de las dimensiones pedidas>
 [limit $n]
```

- **Solo las dimensiones pedidas unen sus tablas.** En particular,
  `time_entry_tag` se une solo si la etiqueta es una de ellas: si se uniera
  siempre, una entrada con dos etiquetas contaría dos veces en cualquier
  agrupación.
- **Cada dimensión une sus tablas con alias propios** (`alias` de Drizzle): el
  proyecto aparece adentro para el cliente y afuera para el proyecto y para la
  tarea, y el cliente afuera para el cliente y para el proyecto. Como una
  dimensión no se repite, ningún alias se usa dos veces.
- **Las uniones de afuera son de uno a uno** —claves únicas `(workspace_id, id)`,
  `user_preference` por su clave primaria y, por persona, la membresía que
  garantiza R1—, así que `limit` cuenta grupos.
- **Sin `order by`.** Con `limit`, las filas que vuelven pueden ser cualquiera:
  el service solo mira cuántas son cuando no entran, y entonces las descarta
  (D-R3-6).
- **La subconsulta sin agregados la sube el planificador** a la de afuera; con
  persona, proyecto o fecha se espera el mismo plan que R2a y R2b, y §6.2 lo
  confirma.
- **`inScope`, `closedIn`, `entrySeconds`, `secondsOf` y `bucketIndexOf` son las
  de R2a y R2b**, sin copia. La medida se trunca por entrada adentro y se suma
  afuera.
- **El cliente sin proyecto**: el `left join` de adentro da `project.client_id`
  nulo para una entrada sin proyecto y para un proyecto sin cliente; las dos van
  a «Sin cliente» (RP-28, D-R2b-5).
- **La tarea nula** tiene el proyecto nulo: «Sin tarea» junta proyectos.
- **`entryTotals`** es una sentencia sin unión ni `group by`:
  `coalesce(sum(<entrySeconds>), 0)::bigint` y la misma con
  `filter (where billable)`, con `<inScope>` y `<closedIn>`. Siempre una fila;
  cero sin entradas.
- **Lanza `RangeError` antes de consultar** si `dimensions` está vacía, tiene más
  de tres o repite una; si `date` está y `buckets` es `null`, o al revés; si
  `buckets` está vacío o no cubre exactamente `span` (el primer inicio es
  `span.from` y el fin es `span.to`); si `limit` no es un entero positivo. Un
  tramo fuera de rango lanza como hoy (`bucketIndexOf`).
- **El orden de los parámetros es `(scope, lectura, tx)`**: el alcance primero,
  como pide R2a para toda función que se sume (R2a §4.3), y el `Executor` al
  final con `db` por omisión, como `listTimesheetEntries`.

### 4.4 Service (`report/service.ts`)

```ts
export type ReportRequest = {
  readonly range: ReportRange | null;
  readonly groupBy: ReportGroupBy | null;
  /** Parte B: los de `reportSubgroupParams`; ausente o vacío, un nivel. */
  readonly subgroups?: readonly ReportGroupBy[];
};
```

`getReportState` conserva su firma. En este orden:

1. **`report.view`**, **`scopeOf`** y **el período** con su invariante de 1 a
   366 días, sin cambios.
2. **Los niveles** (B): `levels = [groupBy ?? "person", ...(subgroups ?? [])]`.
   **Invariante**, antes de cualquier lectura y antes de abrir la transacción,
   como B1: a lo sumo tres y sin repetir; si no, `RangeError`. La página los
   recibe de `reportSubgroupParams`, que ya lo garantiza; la invariante es para
   otro llamador (R6).
3. **Los tramos**: `dayBuckets(first, last, zona)` una vez, solo si `date` es
   uno de los niveles.
4. **Las lecturas, en
   `db.transaction(…, { isolationLevel: "repeatable read", accessMode: "read only" })`**:
   - **el nivel 1**: `totalsByLevels(scope, { span, dimensions: levels.slice(0, 1), buckets }, tx)`,
     sin `limit`;
   - **los niveles 2 y 3** (B), en orden. **Sin filas en el nivel 1 no se lee
     ninguno de abajo**, y `levelsShown` es `1 + subgroups.length`: un período
     sin horas no se corta. Si no, con `presupuesto = REPORT_MAX_ROWS − filas
leídas`: si el presupuesto es cero o menos, se corta sin leer; si no,
     `dimensions: levels.slice(0, d)` con `limit: presupuesto + 1`; si vuelven
     más filas que el presupuesto, se descartan y se corta;
   - **el total**: si `levels[0]` es `tag`, `entryTotals(scope, span, tx)`; si
     no, la suma de las filas del nivel 1 (D-R2a-7, D-R3-3).

   `buckets` va a cada lectura solo si `date` está entre sus dimensiones; si
   no, `null`.

5. **El árbol** (B; en A, una lista de un nivel): cada fila del nivel `d` es un
   grupo armado con `groups[d − 1]` y se cuelga del grupo cuyas claves son
   `groups[0..d − 1)`, **el camino entero** y no solo la última clave. **Una
   fila sin padre lanza**: en una foto, todo grupo del nivel `d` tiene sus
   ancestros en los niveles de arriba. Los hermanos se ordenan con el
   comparador de la dimensión de su nivel: `compareDays` para la fecha y
   `compareGroups` para el resto. Un grupo lleva `children` solo si el nivel de
   abajo se leyó y entró.
6. **El estado**: el de R2b, con `subgroups` (los pedidos) y `levelsShown` (los
   leídos que entraron, o todos los pedidos si el nivel 1 está vacío).

**Cada grupo** sale de su `LevelGroupRow` con una función privada:

- persona, proyecto y fecha, como en R2b (`displayNameOf`, el color estrechado
  con `paletteKeyOf`, `weekdayLabel` con el `dayKey` del tramo);
- cliente: `{ kind: "client", client, seconds }`, directo de la fila;
- tarea: `{ kind: "task", task, project, seconds }`, con el color del proyecto
  estrechado;
- etiqueta: `{ kind: "tag", tag, seconds }`.

**El orden.** `sortKeyOf` suma `task` (la tarea) y `tag` (la etiqueta), con
`null` para «Sin tarea» y «Sin etiqueta»; el `switch` sigue exhaustivo sobre
`Exclude<ReportGroup, ReportDateGroup>`. `compareGroups` no cambia.

- La clave de un grupo en el armado es la de su dimensión —el id, `null` para
  «Sin …», el índice del tramo—; nunca se compara con la de otra dimensión.
- **Ninguna decisión de acceso cambia**: el service no compara roles ni arma
  filtros de personas.

### 4.5 Costo

- **Parte A**: una sentencia por carga, y dos si el primer nivel es la etiqueta,
  más el `begin` y el `commit` de la transacción.
- **Parte B**: hasta tres sentencias de niveles, y el total si la etiqueta es
  el primero; cada una recorre las entradas del rango y completa su
  agregación antes del `limit`, así que el trabajo de la base lo acotan los 366
  días. **Lo que viaja** son las filas del nivel 1 y, como mucho,
  `REPORT_MAX_ROWS` menos esas filas más una por nivel pedido.
- **Por fecha**, `dayBuckets` una vez, como en R2b.

## 5. Pantalla

### 5.1 La barra (`report-toolbar.tsx`)

- **«Agrupar por»** (A): seis enlaces en el orden de D-R3-8. El elegido lleva
  `aria-current="true"`; todos conservan el rango y, desde la parte B, llevan a
  `withLevel(agrupación, 0, dimensión)` (§5.2).
- **«Subagrupar por»** (B): después del grupo de «Agrupar por», un segundo grupo
  (`role="group"`, nombrado por su rótulo visible) con el botón del segundo
  nivel siempre y el del tercero solo si hay segundo nivel (§5.3).
- **Las flechas, «Esta semana» y `RangePicker`** reciben y conservan los
  subniveles (B). `applySelection` recibe la agrupación entera en vez de
  `groupBy`.

### 5.2 La agrupación de un enlace (`components/grouping-model.ts`, nuevo, B)

```ts
/**
 * D-R3-8: la agrupación con `dimension` en el nivel `level`, donde 0 es
 * «Agrupar por». Si la dimensión ya está en otro nivel, los dos se
 * intercambian. `null` quita ese nivel y los de abajo, y no vale en el 0.
 * Lanza si `level` está más abajo que el siguiente al último.
 */
export function withLevel(
  grouping: ReportGrouping,
  level: 0 | 1 | 2,
  dimension: ReportGroupBy | null,
): ReportGrouping;

/** Lo que ofrece el nivel 1 o 2, en el orden de `REPORT_GROUP_BYS`: lo que no está arriba. */
export function levelOptions(
  grouping: ReportGrouping,
  level: 1 | 2,
): readonly ReportGroupBy[];
```

| Agrupación                 | Elección           | Resultado                     |
| -------------------------- | ------------------ | ----------------------------- |
| persona                    | nivel 0: proyecto  | proyecto                      |
| persona · proyecto         | nivel 0: proyecto  | proyecto · persona            |
| persona · proyecto · fecha | nivel 0: fecha     | fecha · proyecto · persona    |
| persona                    | nivel 1: fecha     | persona · fecha               |
| persona · proyecto         | nivel 1: fecha     | persona · fecha               |
| persona · proyecto · fecha | nivel 1: fecha     | persona · fecha · proyecto    |
| persona · proyecto         | nivel 2: etiqueta  | persona · proyecto · etiqueta |
| persona · proyecto · fecha | nivel 1: «Ninguno» | persona                       |
| persona · proyecto · fecha | nivel 2: «Ninguno» | persona · proyecto            |
| persona                    | nivel 1: «Ninguno» | persona                       |
| persona                    | nivel 2: fecha     | lanza                         |

`reportHref({ range, groupBy, subgroups = [] })` (B) escribe `subagrupar` como
cuarto parámetro solo si hay subniveles, con los valores de
`REPORT_GROUP_PARAMS` unidos por `,`. Sin subniveles, la URL es la de R2b.

### 5.3 Los subniveles (`components/subgroup-picker.tsx`, nuevo, B)

- **`SubgroupPicker`** (cliente): un botón con el texto «Segundo nivel: Fecha» o
  «Segundo nivel: Ninguno» (y lo mismo para el tercero), que es también su
  nombre accesible, y un `Popover` con `SubgroupPanel`. Elegir un enlace cierra
  el popover con `onNavigate` y el foco vuelve al botón (D-R3-8). **Recibe solo
  el rango, la agrupación y su nivel**, no el estado.
- **`SubgroupPanel`**, exportado y sin popover: una lista nombrada por el nivel
  (`<ul aria-label="Segundo nivel">`) con «Ninguno» primero y después
  `levelOptions`, cada uno un enlace a
  `reportHref({ range, ...withLevel(agrupación, nivel, opción) })`. La elegida
  —o «Ninguno», sin dimensión en ese nivel— lleva `aria-current="true"`.

### 5.4 La tabla (`report-view.tsx`; `report-tree.tsx` y `report-tree-model.ts`, nuevos, B)

- **El encabezado de la primera columna**: con un nivel, el de R2b o «Tarea» y
  «Etiqueta» (A); con varios (B), los rótulos de los niveles que se muestran
  unidos por « / »: «Proyecto / Fecha».
- **Tarea** (A): el nombre y, en gris, el del proyecto; «Sin tarea» en gris, sin
  proyecto. **Etiqueta** (A): el nombre; «Sin etiqueta» en gris.
- **`groupKey`**: el id de la tarea o `sin-tarea`; el de la etiqueta o
  `sin-etiqueta`.
- **La línea de la etiqueta** (A), debajo de la de la zona: si alguno de los
  niveles que se muestran es la etiqueta. Un nivel de etiqueta cortado por el
  tope no la muestra.
- **La línea del tope** (B), encima de la tabla: si `levelsShown` es menor que
  `1 + subgroups.length`.
- **El árbol** (B): `ReportView` sigue siendo de servidor y dibuja el
  encabezado, el vacío y los totales; las filas del cuerpo las dibuja
  `ReportTree` (cliente). **`ReportTree` recibe solo `groups`**, con
  `key={reportHref(...)}` del pedido (D-R3-9), y guarda el conjunto de claves
  abiertas. Ningún componente de cliente recibe el estado entero.
  `visibleRows(groups, open)` de `report-tree-model.ts` devuelve en preorden
  `{ key, level, group, expandable, expanded }` de las filas que se ven, con
  `key` igual a la del padre más `groupKey(group)`, única aunque el mismo día
  esté debajo de dos proyectos. `groupKey` pasa al modelo.
- **La fila** (B): el encabezado de fila con la sangría de su nivel; si es
  `expandable`, `<button type="button" aria-expanded>` con el chevrón
  (`aria-hidden`) y `GroupHeading`; si no, `GroupHeading` con un espacio del
  ancho del chevrón para que los nombres alineen. La duración, como en R2a.

### 5.5 Textos (`labels.ts`)

| Clave         | Texto                                                                                                                                    | Parte |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `byTask`      | «Tarea»                                                                                                                                  | A     |
| `byTag`       | «Etiqueta»                                                                                                                               | A     |
| `noTask`      | «Sin tarea»                                                                                                                              | A     |
| `noTag`       | «Sin etiqueta»                                                                                                                           | A     |
| `tagOverlap`  | «Una entrada con varias etiquetas suma en cada una: las filas por etiqueta pueden sumar más que el total.»                               | A     |
| `subgroupBy`  | «Subagrupar por»                                                                                                                         | B     |
| `secondLevel` | «Segundo nivel»                                                                                                                          | B     |
| `thirdLevel`  | «Tercer nivel»                                                                                                                           | B     |
| `levelChoice` | `(nivel, elegido) =>` «{nivel}: {elegido}»                                                                                               | B     |
| `noLevel`     | «Ninguno»                                                                                                                                | B     |
| `rowLimit`    | `(tope) =>` «El reporte pasa de {tope} filas con todos sus niveles: se muestran solo los de arriba. Acortá el período o quitá un nivel.» | B     |

- «Sin tarea» y «Sin etiqueta» van en `reportLabels` y no en `projectLabels`:
  son rótulos de un grupo del reporte y R3 no toca el módulo de proyectos.
- **«Sin etiqueta», en singular**, es el grupo de RP-28; el calendario dice
  «Sin etiquetas» de la lista de una entrada (`calendar/labels.ts:87`). Son dos
  cosas distintas y se dejan así.

## 6. Volumen y peso

Lo hace `backend-dev` con el repository terminado, con el procedimiento de §6
de R2a, en `postgres:18-alpine`, en una base propia que se borra al terminar.
La sentencia es el texto de `.toSQL()`. El informe lleva, por consulta, el plan
(nodos e índices) y las cinco medidas, y el team-lead lo copia al documento de
revisiones.

### 6.1 Las etiquetas en `seed.sql` (parte A)

- **Doce etiquetas**, «Etiqueta 1» a «Etiqueta 12», con ids
  `00000000-0000-4000-8004-…`; la 11 y la 12 archivadas.
- **Cada entrada cerrada**, con su propio `random()`: 40 % sin etiquetas, 35 %
  con una, 20 % con dos y 5 % con tres, consecutivas desde una al azar. Unas
  170 000 filas de `time_entry_tag` en los tres años.
- **Se insertan después de las entradas**: las entradas y sus instantes no
  cambian, así que Q1 a Q6 se comparan con R2a y R2b. El comentario de la
  cabecera deja de decir «Las etiquetas llegan con R3».

### 6.2 Las consultas de la parte A

| Consulta | Qué                                                       | Presupuesto (mediana) |
| -------- | --------------------------------------------------------- | --------------------- |
| Q1       | `totalsByLevels` `[person]`, `everyone`, la semana actual | ≤ 15 ms               |
| Q2       | `[project]`, `everyone`, los 366 días del año pasado      | ≤ 150 ms              |
| Q3       | `[person]`, `self`, los mismos 366 días                   | ≤ 30 ms               |
| Q4       | `listTimesheetEntries`, como en R2a                       | el plan no cambia     |
| Q5       | `[date]`, `everyone`, 366 días, un tramo por día          | ≤ 150 ms              |
| Q6       | `[date]`, `self`, 366 días                                | ≤ 30 ms               |
| Q7       | `[client]`, `everyone`, 366 días                          | ≤ 150 ms              |
| Q8       | `[task]`, `everyone`, 366 días                            | ≤ 150 ms              |
| Q9       | `[tag]`, `everyone`, 366 días                             | ≤ 150 ms              |
| Q10      | `entryTotals`, `everyone`, 366 días                       | ≤ 150 ms              |

Q1 a Q3, Q5 y Q6 reemplazan su texto en `explain.sql`. El informe dice si su
plan es el de R2a y R2b; si cambió, por qué.

### 6.3 Las consultas de la parte B

| Consulta | Qué                                                                                       | Presupuesto (mediana) |
| -------- | ----------------------------------------------------------------------------------------- | --------------------- |
| Q11      | `[person]`, `everyone`, 366 días: el primer nivel del pedido de Q12 y Q13                 | ≤ 150 ms              |
| Q12      | `[person, project]`, `everyone`, 366 días, con `limit` de su presupuesto                  | ≤ 150 ms              |
| Q13      | `[person, project, date]`, `everyone`, 366 días, con `limit` de su presupuesto (no entra) | ≤ 250 ms              |
| Q14      | `[tag, project]`, `everyone`, 366 días, con `limit` de su presupuesto                     | ≤ 150 ms              |
| Q15      | `[person, project, date]`, `self`, 366 días                                               | ≤ 40 ms               |
| Q16      | `[tag, project, date]`, `everyone`, 366 días, con `limit` de su presupuesto               | ≤ 250 ms              |

**Los dos pedidos enteros**, de todo el equipo en 366 días, cada uno en una
transacción y con la suma de las medianas:

| Pedido                      | Sentencias           | Presupuesto |
| --------------------------- | -------------------- | ----------- |
| Persona → Proyecto → Fecha  | Q11 + Q12 + Q13      | ≤ 450 ms    |
| Etiqueta → Proyecto → Fecha | Q10 + Q9 + Q14 + Q16 | ≤ 600 ms    |

El de la etiqueta es el peor: son cuatro sentencias, con `entryTotals`. El
informe dice cuántas filas tuvo cada nivel y en cuál se cortó.

### 6.4 El peso de la página (parte B)

Lo hace `frontend-dev`, no es un test: una página temporal, fuera de todo
commit, que dibuja `ReportView` con un estado sintético de 3000 grupos —30
personas, 10 proyectos cada una y 2670 días repartidos—, con ids de 36
caracteres y nombres de 30, servida con `next build` y `next start`.

- **El payload RSC** de esa ruta (`curl -H 'RSC: 1'`), que es lo que lleva las
  props de `ReportTree`: **≤ 1 MB**.
- **El HTML de la primera carga**, con todo contraído y el payload escapado
  adentro: **≤ 1,5 MB**.

La mediana de cinco corridas va en el informe. Sin tiempos en los tests.

### 6.5 Si algo pasa el presupuesto

Si una consulta de §6.2 o §6.3, o **cualquiera de los dos pedidos enteros**, o
el peso de §6.4 pasa su presupuesto, el slice se detiene y vuelve a
`architect`. Las alternativas, en este orden: una sola sentencia con `grouping
sets` que elige con `grouping()` la suma con o sin la etiqueta (la otra forma
de la foto única que admite el ADR 0021); un tope más bajo; un índice, solo con
una medición que lo justifique.

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea; la parte va entre
paréntesis cuando el archivo es de una sola.

### backend-dev

```
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/repository.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/scope.test-d.ts                    (A)
/home/maxi/program/clock/scripts/report-volume/seed.sql                        (A)
/home/maxi/program/clock/scripts/report-volume/explain.sql
```

Más las ediciones mecánicas de los pasos 1 y 6 en archivos de otros dueños
(§1, «Consecuencias»).

### frontend-dev

```
/home/maxi/program/clock/src/modules/report/components/report-toolbar.tsx
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.test.tsx
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/app/(app)/reportes/page.tsx                       (B)
/home/maxi/program/clock/src/modules/report/components/report-href.ts          (B)
/home/maxi/program/clock/src/modules/report/components/report-href.test.ts     (B)
/home/maxi/program/clock/src/modules/report/components/range-picker.tsx        (B)
/home/maxi/program/clock/src/modules/report/components/range-picker.test.tsx   (B)
/home/maxi/program/clock/src/modules/report/components/range-picker-model.ts   (B)
/home/maxi/program/clock/src/modules/report/components/grouping-model.ts       (nuevo, B)
/home/maxi/program/clock/src/modules/report/components/grouping-model.test.ts  (nuevo, B)
/home/maxi/program/clock/src/modules/report/components/subgroup-picker.tsx     (nuevo, B)
/home/maxi/program/clock/src/modules/report/components/subgroup-picker.test.tsx (nuevo, B)
/home/maxi/program/clock/src/modules/report/components/report-tree.tsx         (nuevo, B)
/home/maxi/program/clock/src/modules/report/components/report-tree-model.ts    (nuevo, B)
/home/maxi/program/clock/src/modules/report/components/report-tree-model.test.ts (nuevo, B)
```

Los nombres de los archivos nuevos son orientativos salvo los de los modelos,
que citan los tests.

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Suma los casos de los criterios 9 (A) y 21 (B) contra las firmas publicadas, sin
mirar la implementación de `totalsByLevels`, y corre las tablas de mutantes de
§8.1 en una copia propia.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                   (10 en A; 11 y 12 en B)
/home/maxi/program/clock/e2e/reports-page.ts
/home/maxi/program/clock/e2e/database.ts                                       (A)
```

- `database.ts`: `SeedEntry` suma `task?` (el nombre de una tarea del proyecto
  de la entrada) y `tags?` (nombres de etiquetas del workspace); si la tarea o
  alguna etiqueta no existe, se corta sin dejar nada, como con el proyecto.
- `reports-page.ts`: `ReportGroupBy` y `GROUP_LINK` con `tarea` y `etiqueta`
  (A); `NO_TASK`, `NO_TAG` y `TAG_OVERLAP` (A); `reportsUrl` y `reportsUrlOf`
  con los subniveles, y `reportsUrlOf` afirma que no hay `subagrupar` cuando no
  se piden (B); `subgroupButton(page, nivel)`, `subgroupList` y
  `subgroupLink`, buscados dentro del popover, y `expandButton(page, nombre)`,
  el botón dentro del encabezado de fila (B).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

Antes del merge de cada parte, su corrección fechada y una sección «11. Núcleo,
R3»:

- **RP-11** (A): seis dimensiones; `agrupar=tarea|etiqueta`.
- **RP-12** (B): hasta tres niveles sin repetir, `subagrupar`, el intercambio
  al elegir una que ya está y «Ninguno»; el orden dentro de cada nivel es el de
  su dimensión. _No verificado_: el tope de niveles y la repetición en Clockify.
- **RP-13** (B): expandir y contraer en el navegador; todo contraído al cargar
  y en cada navegación; lo abierto no sobrevive a la recarga (D-R3-6, D-R3-9).
- **RP-18** (A): la suma por etiqueta, la cabecera con el total real y la línea
  que lo avisa; en el árbol, los niveles de abajo de una etiqueta suman lo de
  su grupo.
- **RP-28** (A): «Sin tarea» y «Sin etiqueta», con lo que juntan.
- **RP-29** (A): la tarea hecha y la etiqueta archivada cuentan, sin marca.
- **RP-32** (B): `subagrupar` se valida aparte y se descarta entero.
- **§11.4**: el tope de 3000 filas y su línea; el proyecto en gris de la tarea
  también debajo de un proyecto; lo abierto que se pierde al recargar o al
  navegar.

Si el slice se parte, la sección de R3b registra lo de la parte B.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/server/time/`,
`src/components/`, `src/lib/`, `src/modules/time-entry/`, `project/`,
`profile/`, `workspace/`, `report/period.ts`, `report/components/report-screen.tsx`,
los ADR. El mapa y el estado los actualiza el team-lead.

### Orden

**Parte A — tarea y etiqueta.** Cada commit compila y pasa lint, typecheck y
`npm run test:all` sin nada de la parte B: ni `subagrupar`, ni `children`, ni
`limit`, ni `REPORT_MAX_ROWS`.

1. **Primer commit de `backend-dev`**: `schema.ts` con `task` y `tag` y
   `schema.test.ts`; en `repository.ts`, los tipos de §4.3 (sin `limit`) y
   `totalsByLevels` y `entryTotals` con su firma final y un cuerpo que lanza;
   `readGroups` lanza para `task` y `tag` hasta el paso 3, para que ningún
   commit intermedio devuelva otra cosa con `agrupar=tarea`. **Ediciones
   mecánicas** fuera del reparto, para que el commit compile y pase:
   - `report-view.tsx`: los casos `task` y `tag` de `GROUP_COLUMN_HEADINGS`,
     `groupKey` y `GroupHeading`, mínimos (el nombre o «Sin …»);
   - `scope.integration.test.ts`: los casos `task` y `tag` de `summaryOf`,
     `rowOf` y `everyoneInAGroups`, y **`groupBys` fijo en las cuatro de R2b**
     (`["person", "project", "client", "date"]`) hasta el paso 3, porque se
     recorre con actores activos y `readGroups` lanza con las dos nuevas.

   **Avisa a `frontend-dev`, `test-engineer` y `e2e-tester`**: desde acá las
   formas de la parte A son las finales.

2. **Los otros tres arrancan con el paso 1.** `test-engineer`, primero que
   nada, commitea el cambio de los espías de `expectForbiddenWithoutReading` a
   `totalsByLevels`, `entryTotals` y `db.transaction` —sin permiso no se llama
   a ninguna, así que el test pasa desde ya—. `frontend-dev` completa las filas
   de tarea y etiqueta sobre lo mecánico del paso 1. `e2e-tester` confirma que
   el test 10 falla por la funcionalidad y no por el arnés.
3. **`backend-dev`**, con una condición: **empieza con el commit de espías de
   `test-engineer` en la rama**, para poder borrar las tres lecturas viejas sin
   romper su archivo. `totalsByLevels` y `entryTotals`; el service en la
   transacción, con persona, proyecto, cliente y fecha migrados y sin
   `clientRowsOf`; borra las tres lecturas viejas y `totalsBy`; los espías de
   `service.integration.test.ts` y `scope.test-d.ts`; los criterios 2 a 8 y 10.
4. **`test-engineer`, después del paso 3**: los casos del criterio 9, con
   `groupBys` de vuelta en `REPORT_GROUP_BYS`. No se commitean antes, porque
   fallan hasta que existe la lectura.
5. **`backend-dev`**: `seed.sql` y la medición de §6.2.

**Parte B — subgrupos y expandir**, en commits propios, después de todos los de
la parte A.

6. **`backend-dev`**: `schema.ts` con lo de la parte B y sus tests;
   `ReportRequest.subgroups`; `limit` en `totalsByLevels`; el estado con
   `subgroups` y `levelsShown: 1`, y el service lanza si `subgroups` no está
   vacío hasta el paso 8. **Edición mecánica** en el mismo commit:
   `subgroups: []` y `levelsShown: 1` en los fixtures de `ReportReadyState` de
   los tests de componentes, que si no dejan de compilar. **Avisa** a los
   mismos tres: desde acá las formas de la parte B son las finales.
7. **`frontend-dev`**: la página, `reportHref`, los modelos, «Subagrupar por» y
   el árbol; **`e2e-tester`**: los tests 11 y 12; **`test-engineer`**: los
   casos del criterio 21, que se commitean después del paso 8.
8. **`backend-dev`**: el árbol, el tope y la invariante; los criterios 17 a 20.
9. **`backend-dev`**: la medición de §6.3; **`frontend-dev`**: la de §6.4.

**Cierre, para cada parte.**

10. **`test-engineer`**: los mutantes de §8.1 de la parte; `parity-analyst`,
    antes del merge.
11. **Revisión de seguridad, antes del merge**: que `totalsByLevels` y
    `entryTotals` traducen el alcance con `inScope` y con ningún otro filtro;
    que un member con una URL armada a mano (`agrupar=etiqueta`,
    `subagrupar=persona,fecha`, `personas=…`) no ve nada ajeno en ningún nivel
    ni en el total; que `limit` y los cortes los arma el servidor y no vienen de
    la URL; que la transacción no se abre sin `report.view`.

**Si el slice se parte** (§10, pregunta 1): la parte A se cierra con los pasos
10 y 11 sobre ella y se mergea como R3a; la parte B sigue como R3b desde el
paso 6, con este mismo contrato y su propio cierre.

## 8. Criterios de aceptación

Son de la **parte A** los criterios 1 a 13; de la **parte B**, del 14 al 23 y el
25; el 24 vale para las dos.

1. **Los esquemas** (A) — `reportGroupParams` pasa con `tarea` y `etiqueta`, y no
   con `Tarea`, `tareas` ni `etiquetas`; `REPORT_GROUP_PARAMS` se lee de vuelta
   para las seis; `reportReadyState` admite un grupo de tarea y uno de
   etiqueta, con nulos y sin ellos, y rechaza uno de tarea sin `project`.
2. **Lo de R2a y R2b se conserva** (A, integración) — los tests de persona,
   proyecto, cliente y fecha de `service.integration.test.ts` y de
   `scope.integration.test.ts` pasan con los mismos valores, con los espías de
   §1. El test de B1 recorre las seis agrupaciones y espía `totalsByLevels` y
   `entryTotals`; el de los 366 días mira `read.buckets` de la lectura por
   fecha.
3. **Por tarea** (A, integración) — P del cliente C con las tareas T1 y T2
   (hecha) y Q sin cliente con T3, que se llama igual que T1: entradas en T1,
   T2, T3, en P sin tarea y sin proyecto. Una fila por tarea, T1 y T3 por
   separado y cada una con su proyecto; T2 cuenta; «Sin tarea» suma la de P sin
   tarea y la sin proyecto; orden por duración, empate por nombre y «Sin tarea»
   después de una tarea de igual duración; total y facturable iguales a los de
   «Persona» en el mismo pedido. Borrada T2, su entrada pasa a «Sin tarea».
4. **Por etiqueta** (A, integración) — e1 con E1 y E2, e2 con E1, e3 sin
   etiquetas y e4 con E3 archivada: E1 es e1 + e2, E2 es e1, E3 cuenta, «Sin
   etiqueta» es e3; la suma de las filas pasa el total; `totalSeconds` y
   `billableSeconds` son los de «Persona» en el mismo pedido. Borrada E3, e4
   pasa a «Sin etiqueta». Orden por duración y «Sin etiqueta» después de una de
   igual duración.
5. **Una sola foto** (A, integración) — por etiqueta, `db.transaction` se llama
   una vez con `{ isolationLevel: "repeatable read", accessMode: "read only" }`,
   y `totalsByLevels` y `entryTotals` reciben el mismo `Executor`, que no es
   `db`; por persona, una llamada a `totalsByLevels` en la transacción y
   ninguna a `entryTotals`.
6. **La medida** (A, integración, ADR 0021) — las cuatro entradas del criterio 8
   de R2a —dos con microsegundos y dos de 1,5 s exactos—, las cuatro en la
   tarea T, con este reparto de etiquetas: **E1 en una de las de microsegundos
   y en las dos de 1,5 s; E2 en una de las de 1,5 s; la otra de microsegundos
   sin etiquetas**. Por tarea, la fila de T y el total son el `closedSeconds`
   de `getTimesheetState` (4 s); por etiqueta, E1 3 s, E2 1 s, «Sin etiqueta»
   1 s, y el total, el `closedSeconds`; el facturable suma solo las
   facturables.
7. **Las guardas** (A, integración) — `totalsByLevels` lanza `RangeError` sin
   consultar (espía sobre `db.select` y sobre el `Executor`) con cada caso de
   §4.3 salvo `limit`, con el alcance tomado de una lectura real, como B3 de
   R2b.
8. **Varios niveles en la lectura** (A, integración) — `totalsByLevels` llamado
   directo, con el alcance tomado de una lectura real como B3 de R2b, sobre un
   fixture con dos personas, dos proyectos de clientes distintos, uno sin
   cliente, tareas, una entrada sin proyecto y una entrada con dos etiquetas:
   - `[person, tag]`: las filas de una persona suman más que la persona por la
     entrada de dos etiquetas;
   - `[tag, project]`: las filas de E suman lo de E;
   - `[client, project, task]`: el camino «Sin cliente» → «Sin proyecto» →
     «Sin tarea» y el de un cliente con su proyecto y sus tareas, cada fila con
     lo que se muestra de cada nivel en su posición;
   - `[project, date]`: la entrada de dos etiquetas cuenta una vez, y los días
     son los de `buckets`.
9. **El alcance** (A, `scope.integration.test.ts`) — el fixture suma la tarea T
   en P, con las entradas del owner, del `project_manager` y del inactivo, y
   las etiquetas E y F en A: la del member con E y F, la del inactivo con E y
   la del admin con F; en B, la etiqueta G en la entrada del member. Por tarea
   y por etiqueta: owner y admin ven todo A, también al inactivo, y nada de B
   (ni G); `project_manager`, `team_manager` y `member` ven solo lo propio,
   también con un pedido que arma un admin con `agrupar=tarea` o
   `agrupar=etiqueta` y `personas=…`, y por etiqueta el total del member es el
   suyo; el owner de B no ve nada de A. Con una membresía `inactive` o
   `invited`, `{ kind: "forbidden" }` sin llamar a `totalsByLevels` ni a
   `entryTotals` y sin abrir la transacción.
10. **El tipo** (A) — `scope.test-d.ts` afirma que `totalsByLevels` y
    `entryTotals` no compilan sin alcance, con `undefined` ni con `null`, cada
    una con `// @ts-expect-error` y su motivo.
11. **La pantalla** (A, unidad) — `report-toolbar.test.tsx`: los seis enlaces en
    orden, cada uno con el rango, y `aria-current` en «Tarea» y en «Etiqueta»
    cuando son la elegida. `report-view.test.tsx`: el encabezado «Tarea» y
    «Etiqueta»; la fila de una tarea con su proyecto en gris; «Sin tarea» en
    gris y sin proyecto; la de una etiqueta; «Sin etiqueta» en gris; la línea
    de la etiqueta por etiqueta y no por tarea.
12. **El rendimiento** (A, §6.2) — Q1 a Q10 dentro del presupuesto; el plan de
    Q1 a Q3, Q5 y Q6 explicado contra el de R2a y R2b; Q4 sin cambio.
13. **Tarea y etiqueta de punta a punta** (A) — el recorrido 10 de §8.2.
14. **Los esquemas** (B, unidad) — `reportSubgroupParams` pasa con `fecha`, con
    `fecha,etiqueta`, con `persona` y `agrupar=proyecto`, y con `proyecto` y
    `agrupar=Proyecto` (que no vale, así que el primero es persona); no pasa
    con `persona` sin `agrupar`, con `proyecto` y `agrupar=proyecto`, con
    `fecha,fecha`, `fecha,etiqueta,tarea`, `fecha,`, `,fecha`, `fecha,,tarea`,
    `Fecha`, ` fecha`, vacío ni con el parámetro repetido; con o sin un rango
    válido al lado. `reportReadyState` admite tres niveles anidados y rechaza
    `children: []`, `levelsShown` 0 o 4 y tres `subgroups`.
15. **La URL** (B, unidad) — `reportHref` sin subniveles da la URL de R2b, con
    tres parámetros; con uno y con dos, `subagrupar` es el cuarto, y leída con
    `reportGroupParams` y `reportSubgroupParams` devuelve la misma agrupación.
16. **La agrupación de un enlace** (B, unidad) — `withLevel` con cada fila de la
    tabla de §5.2 y `levelOptions` de los niveles 1 y 2 con uno, dos y tres
    niveles.
17. **El árbol** (B, integración) — persona → proyecto, con dos personas, dos
    proyectos y una entrada sin proyecto: cada persona tiene a sus proyectos
    como hijos, que suman lo de la persona, por duración y con «Sin proyecto»
    después de uno de igual duración; **persona → proyecto → fecha con dos
    personas en el mismo proyecto y días distintos**: debajo del proyecto de
    cada persona, solo sus días; proyecto → fecha: los días de cada proyecto en
    orden cronológico; cliente → proyecto → tarea: tres niveles, con el camino
    «Sin cliente» → «Sin proyecto» → «Sin tarea»; persona → etiqueta: con una
    entrada de dos etiquetas los hijos suman más que la persona, y sin ella, lo
    mismo; etiqueta → proyecto: los hijos de E suman lo de E; el total es el
    real en todos; el último nivel no tiene `children`; un pedido sin
    subniveles no tiene `children` en ningún grupo y tiene `levelsShown: 1`.
    **Un período sin horas con tres niveles**: `groups` vacío, `levelsShown: 3`
    y una sola llamada a `totalsByLevels`.
18. **El tope** (B, integración) — una persona; con SQL, una entrada por día en
    300 días, cada una con las mismas nueve etiquetas: fecha → etiqueta son
    300 + 2700 = 3000 filas, `levelsShown: 2` y cada día con sus nueve; con una
    décima etiqueta en una entrada son 3001: `levelsShown: 1`, ningún
    `children`, `subgroups` sigue en `["tag"]` y la lectura del nivel 2 se pidió
    con `limit: 2701`; fecha → etiqueta → persona con las 3000 filas:
    `levelsShown: 2` y el nivel 3 no se pide (dos llamadas a `totalsByLevels`);
    **fecha → etiqueta → persona con las 3001**: `levelsShown: 1` y dos
    llamadas, sin la del nivel 3.
19. **Una sola foto** (B, integración) — todas las lecturas de un pedido con
    subniveles, y el total por etiqueta, reciben el mismo `Executor` de una
    transacción de solo lectura `repeatable read`.
20. **Las invariantes y la guarda de `limit`** (B, integración) — con
    subniveles, un rango invertido y uno de 367 días lanzan `RangeError` sin
    leer; tres subniveles, uno repetido o uno igual al primero lanzan
    `RangeError` sin leer ni abrir la transacción; `totalsByLevels` con
    `limit` 0, −1 y 1,5 lanza `RangeError` sin consultar, con el alcance tomado
    de una lectura real.
21. **El alcance** (B, `scope.integration.test.ts`) — con persona → proyecto →
    fecha y con etiqueta → tarea → persona, resumido como caminos con sus
    segundos: owner y admin ven A en todos los niveles y nada de B;
    `project_manager`, `team_manager` y `member` ven solo lo propio en cada
    nivel, también con un pedido que arma un admin con
    `subagrupar=proyecto,fecha` y `personas=…`; el owner de B no ve nada de A;
    sin membresía activa, `forbidden` sin leer.
22. **La pantalla** (B, unidad) —
    - `report-tree-model.test.ts`: sin abiertos, el primer nivel; al abrir un
      grupo, sus hijos después de él y antes de su hermano siguiente; al
      cerrarlo, se ocultan todos sus descendientes; al reabrirlo, los hijos
      vuelven como estaban; las claves son únicas con el mismo día debajo de dos
      proyectos; `expandable` solo en los grupos con `children`.
    - `report-view.test.tsx`: la primera pintura con solo el primer nivel; el
      botón con `aria-expanded="false"` solo en los grupos con hijos y ninguna
      fila hija en el marcado; el encabezado «Proyecto / Fecha»; la línea del
      tope solo con `levelsShown` menor que lo pedido; la línea de la etiqueta
      con la etiqueta en el segundo nivel, y no si ese nivel quedó cortado.
    - `subgroup-picker.test.tsx`, sobre `SubgroupPanel`: la lista nombrada por
      el nivel, «Ninguno» primero y las opciones en orden, los `href` de
      `withLevel` y un solo `aria-current`.
    - `report-toolbar.test.tsx`: «Segundo nivel: Ninguno» siempre; «Tercer
      nivel» solo con segundo nivel; los `href` de las flechas, de «Esta
      semana» y de «Agrupar por» con los subniveles conservados o
      intercambiados. `range-picker.test.tsx`: los atajos conservan
      `subagrupar`, y `applySelection` también.
23. **El rendimiento y el peso** (B, §6.3 y §6.4) — Q11 a Q16 y los dos pedidos
    enteros dentro del presupuesto; el payload RSC y el HTML dentro del suyo.
24. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`, `next
build` y la suite e2e entera, al cierre de la parte A y al de la B. La única
    afirmación existente que cambia de valor es la lista de agrupaciones de la
    barra (§1).
25. **Subniveles de punta a punta** (B) — los recorridos 11 y 12 de §8.2.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                                                                                                             | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad      | `report/schema.test.ts`                                                                                                             | `etiqueta` sin entrada en `REPORT_GROUP_PARAMS`; la comparación sin distinguir mayúsculas; `project` opcional en el grupo de tarea                                                                                                                                                                                                                            |
| 2        | integración | `service.integration.test.ts`; `scope.integration.test.ts`                                                                          | el `project` de adentro con `inner join` (pierde «Sin cliente» de lo sin proyecto); la medida sumada por grupo y no por entrada; la fecha sin restar uno al tramo. **Cae en typecheck**, no en ejecución: la membresía con `left join` (`status` queda nulable; `time_entry_membership_fk` garantiza la fila)                                                 |
| 3        | integración | `service.integration.test.ts`                                                                                                       | `task` con `inner join` (pierde «Sin tarea»); la clave por el nombre de la tarea (junta T1 y T3); `task.status = 'active'`; «Sin tarea» primero en el empate; el proyecto de la tarea tomado de otra unión que la de la tarea (con «Sin tarea» trae un proyecto)                                                                                              |
| 4        | integración | `service.integration.test.ts`                                                                                                       | `time_entry_tag` con `inner join` (pierde «Sin etiqueta»); una sola etiqueta por entrada; el total como suma de las filas por etiqueta; `tag.archived_at is null`; «Sin etiqueta» primero en el empate                                                                                                                                                        |
| 5        | integración | `service.integration.test.ts`                                                                                                       | `entryTotals` con `db` fuera de la transacción; la transacción sin `isolationLevel`; sin `accessMode: "read only"`; `entryTotals` llamado también sin la etiqueta                                                                                                                                                                                             |
| 6        | integración | `service.integration.test.ts`                                                                                                       | `floor` de la suma de la etiqueta en vez de por entrada (E1 da 4 s); `floor` de la suma de la tarea (T da 5 s); `entryTotals` sin `date_trunc`; el facturable de `entryTotals` sin `filter`                                                                                                                                                                   |
| 7        | integración | `service.integration.test.ts`                                                                                                       | cada guarda de §4.3, salvo `limit`, quitada de a una                                                                                                                                                                                                                                                                                                          |
| 8        | integración | `service.integration.test.ts`                                                                                                       | un alias compartido entre dos dimensiones (el proyecto de la tarea y el del proyecto); las claves de la fila en otro orden que `dimensions`; la unión con `time_entry_tag` en todas las sentencias (en `[project, date]` la entrada de dos etiquetas cuenta dos veces)                                                                                        |
| 9        | integración | `scope.integration.test.ts`                                                                                                         | `entryTotals` sin `inScope` (el member ve el total de todos por etiqueta); `entryTotals` sin `workspace_id`; `totalsByLevels` con solo el `workspace_id` cuando hay etiqueta; `membership.status = 'active'` (cae la fila del inactivo); la transacción abierta antes de `report.view`                                                                        |
| 10       | tipos       | `report/scope.test-d.ts`                                                                                                            | el alcance de alguna de las dos opcional, `\| undefined` o `\| null`                                                                                                                                                                                                                                                                                          |
| 11       | componente  | `report-toolbar.test.tsx`; `report-view.test.tsx`                                                                                   | «Tarea» sin el rango; `aria-current` en todas; el encabezado fijo; «Sin tarea» sin el gris; la tarea sin su proyecto; la línea de la etiqueta siempre o nunca                                                                                                                                                                                                 |
| 12, 23   | manual      | informes de `backend-dev` y `frontend-dev`                                                                                          | —                                                                                                                                                                                                                                                                                                                                                             |
| 13, 25   | e2e         | `e2e/reports.spec.ts`                                                                                                               | los del final de §8.2                                                                                                                                                                                                                                                                                                                                         |
| 14       | unidad      | `report/schema.test.ts`                                                                                                             | `subagrupar` que admite el primer nivel; el primero efectivo sin el `persona` por omisión; la coma final aceptada (`split` que filtra vacíos); tres valores; sin distinguir mayúsculas; `children` sin `min(1)`                                                                                                                                               |
| 15       | unidad      | `report-href.test.ts`                                                                                                               | `subagrupar=` vacío escrito siempre; los subniveles en otro orden                                                                                                                                                                                                                                                                                             |
| 16       | unidad      | `grouping-model.test.ts`                                                                                                            | reemplazar sin intercambiar; «Ninguno» que quita solo ese nivel y sube el de abajo; `levelOptions` que ofrece los de arriba                                                                                                                                                                                                                                   |
| 17       | integración | `service.integration.test.ts`                                                                                                       | los días ordenados por duración; colgar por la última clave y no por el camino (en persona → proyecto → fecha, los días de una persona aparecen debajo de la otra); `children` en el último nivel; `children: []`; la persona sumada desde sus hijos por etiqueta; leer los niveles 2 y 3 con el nivel 1 vacío                                                |
| 18       | integración | `service.integration.test.ts`                                                                                                       | `limit` sin el `+ 1` (3001 se ve como 3000); mostrar las primeras filas que entran del nivel cortado; leer el nivel 3 después de cortar el 2 (tres llamadas con las 3001); el presupuesto sin restar el nivel 1; `>=` en vez de `>` (3000 se corta)                                                                                                           |
| 19       | integración | `service.integration.test.ts`                                                                                                       | un nivel leído con `db`                                                                                                                                                                                                                                                                                                                                       |
| 20       | integración | `service.integration.test.ts`                                                                                                       | la invariante de los subniveles después de la primera lectura; un subnivel repetido que se deduplica en silencio; la guarda de `limit` quitada                                                                                                                                                                                                                |
| 21       | integración | `scope.integration.test.ts`                                                                                                         | `inScope` solo cuando hay una dimensión; el alcance `everyone` para los subniveles                                                                                                                                                                                                                                                                            |
| 22       | componente  | `report-tree-model.test.ts`; `report-view.test.tsx`; `subgroup-picker.test.tsx`; `report-toolbar.test.tsx`; `range-picker.test.tsx` | los nietos visibles con solo el abuelo abierto; cerrar sin ocultar a los nietos; la clave sin la del padre (dos días iguales chocan); el botón en una hoja; sin `aria-expanded`; las filas hijas dibujadas contraídas; la línea del tope siempre; el encabezado con solo el primer nivel; «Tercer nivel» sin segundo; las flechas o un atajo sin `subagrupar` |
| 24       | todas       | las suites existentes                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                             |

**Mutante declarado equivalente:** la unión de `time_entry_tag` solo por
`time_entry_id`, sin el workspace. Los ids de las entradas son únicos y la clave
compuesta `time_entry_tag_entry_fk` fija el workspace de cada fila, así que
trae lo mismo; el workspace queda en la unión porque es la clave que la ata.
Antes de darlo por equivalente, `test-engineer` corre los criterios 4 y 9 con el
mutante y anota que las respuestas son las mismas, también con un pedido de
otro workspace. **Cualquier otro mutante declarado equivalente** se prueba
antes con pedidos de una membresía inactiva, de otro workspace y de un member
con horas ajenas en el rango (lección del 11b).

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los nueve de R2a y R2b no cambian. Se suman tres, con la
regla de §8.3 de R2a; las entradas van en la semana anterior a la de hoy, en la
zona de la persona, y se siembran antes de abrir la pantalla. La persona del
test es member en los tres, y los nombres llevan el sufijo del test.

10. **Por tarea y por etiqueta, con «Sin …» y la suma de las etiquetas**
    (RP-11, RP-18, RP-28; parte A). P con las tareas T1 y T2, **Q con una tarea
    que también se llama T1**, las etiquetas E1 y E2. El lunes, P/T1 de 09:00 a
    10:00 con E1 y E2; el martes, P/T2 de 09:00 a 09:30 con E1; el miércoles,
    Q/T1 de 09:00 a 09:15 sin etiquetas; el jueves, sin proyecto de 09:00 a
    09:20 con E2. Desde la semana anterior por persona, «Tarea»: la URL dice
    `agrupar=tarea`; el encabezado «Tarea»; cuatro filas en este orden, T1 con
    1:00 y P en gris, T2 con 0:30 y P en gris, «Sin tarea» con 0:20 y T1 con
    0:15 y Q en gris; el total 2:05; sin la línea de la etiqueta. «Etiqueta»:
    E1 con 1:30, E2 con 1:20 y «Sin etiqueta» con 0:15; el total sigue en 2:05;
    la línea de la etiqueta visible. Al recargar, la misma vista.
11. **Subniveles, expandir y contraer** (RP-12, RP-13; parte B). P1 y P2, la
    etiqueta E1. El martes, P1 de 09:00 a 10:00 con E1; el miércoles, P2 de
    09:00 a 09:45; el jueves, P1 de 10:00 a 10:30. Desde la semana anterior por
    «Proyecto», «Segundo nivel: Ninguno» y, en su lista, «Fecha»: **el popover
    se cierra y el foco está en «Segundo nivel: Fecha»**; la URL dice
    `agrupar=proyecto&subagrupar=fecha`; el encabezado «Proyecto / Fecha»; dos
    filas, P1 con 1:30 y P2 con 0:45, cada una con su botón en
    `aria-expanded="false"`. Clic en P1: las filas son P1, el martes con 1:00,
    el jueves con 0:30 y P2, en ese orden y con los rótulos de `weekdayLabel`;
    el botón de P1 en `aria-expanded="true"` y el foco sigue en él. Enter otra
    vez: P1 y P2. «Tercer nivel» → «Etiqueta»: la URL suma `,etiqueta`; P1
    abierto y el martes abierto: E1 con 1:00; el jueves abierto: «Sin etiqueta»
    con 0:30; la línea de la etiqueta visible. **Con P1 y el martes abiertos,
    cerrar P1: las filas son P1 y P2. Reabrir P1: el martes sigue abierto, con
    E1 debajo.** Al recargar: la misma URL, los dos botones dicen «Segundo
    nivel: Fecha» y «Tercer nivel: Etiqueta», y las filas vuelven a ser P1 y P2,
    contraídas.
12. **Los controles conservan y cambian los niveles** (RP-12, RP-32; parte B).
    Las mismas entradas, desde `agrupar=proyecto&subagrupar=fecha`. «Fecha» en
    «Agrupar por»: la URL dice `agrupar=fecha&subagrupar=proyecto` (se
    intercambian) y las filas son los tres días; el martes abierto: P1 con
    1:00. «Período anterior»: la URL conserva `subagrupar=proyecto` y la tabla
    muestra el vacío. «Período siguiente»: vuelve, **con los tres días
    contraídos —el martes en `aria-expanded="false"` y sin P1 debajo—**
    (D-R3-9). «Segundo nivel» → «Ninguno»: la URL vuelve a tener tres
    parámetros, no hay «Tercer nivel» y las filas no tienen botón.

Los mutantes que tienen que caer en e2e: la tarea agrupada por nombre (junta
las dos T1 del recorrido 10); la etiqueta con `inner join`; el total por
etiqueta como suma de las filas; la línea de la etiqueta que no aparece;
`subagrupar` perdido en una flecha; el botón que no cambia `aria-expanded`;
los hijos debajo del padre equivocado; cerrar que no oculta a los nietos (el
paso de cerrar P1 del recorrido 11); lo abierto que sobrevive a una navegación
(`ReportTree` sin `key`, recorrido 12); el popover que no se cierra; el foco
que no vuelve; elegir una dimensión que ya está sin intercambiar.

### 8.3 La regla de los e2e

La de §8.3 de R2a, sin cambios. Los tres recorridos afirman el total, «Sin
tarea» y «Sin etiqueta» porque el alcance es propio, y afirman `SCOPE_SELF`
visible antes del total (T2 de R2b); ninguno afirma sobre el workspace.

### 8.4 Lo que no se prueba en e2e

- **El tope**: hacen falta más de 3000 grupos de una persona; es el criterio 18.
- **Tarea, etiqueta y subniveles con alcance `everyone`**: criterios 9 y 21; en
  e2e no son reproducibles (§8.3 de R2a).
- **La tarea hecha o borrada y la etiqueta archivada o borrada**: criterios 3 y 4.
- **Los cambios de horario y el día que falta en un subnivel de fecha**: los
  cortes son los de R2b, con sus criterios; el subnivel usa los mismos.
- **El driver de Neon**: sin forma nueva (D-R3-11).
- **El volumen y el peso**: §6.

## 9. Riesgos y deuda conocida

- **La lectura genérica es la pieza más compleja del módulo.** La mitigan la
  tabla de dimensiones de §4.3, que la describe una vez, los tests de R2a y
  R2b, que la miden contra lo que ya estaba (criterio 2), y el criterio 8, que
  prueba los varios niveles en la parte A.
- **Lo abierto no sobrevive a una recarga ni a una navegación** (D-R3-6,
  D-R3-9). Si el usuario pide conservarlo al recargar, se puede guardar en la
  URL solo del lado del navegador, sin leer más del servidor (pregunta 2 de
  §10).
- **El primer nivel no tiene tope**: lo acotan el catálogo y los 366 días. Un
  workspace con miles de tareas daría miles de filas por tarea, y entonces no se
  lee ningún nivel de abajo. **R6 y R7 heredan el tope y tienen que tratar un
  primer nivel de más de 3000 filas**, que el tope no corta.
- **El tope acota lo que viaja, no lo que agrega la base**: la agregación de
  cada nivel se completa antes del `limit`; el trabajo de la base lo acotan los
  366 días y lo mide §6.3.
- **La línea de la etiqueta se muestra con la etiqueta como nivel**, aunque
  ninguna entrada del período tenga dos etiquetas: decir «pueden» es cierto
  siempre, y saber si pasó obliga a otra lectura.
- **Un lector de pantalla no oye el nivel de una fila**: la sangría es visual.
  El orden y el botón expandido lo dan; `treegrid` es la vía si la revisión lo
  pide, como deuda.
- **El cierre del popover de los subniveles y el foco solo tienen e2e**, como
  los atajos (D-R2b-10).
- **Cada pedido abre una transacción**, también con una sola lectura: dos idas y
  vueltas más contra Neon.
- **La coma de `subagrupar` viaja como `%2C`** en los enlaces que arma la
  aplicación.
- **Un tope cortado se ve por niveles enteros**: con «Persona → Fecha» de un
  año se ven solo las personas, aunque las fechas de algunas entrarían (§10,
  nota 4).
- **Las ediciones mecánicas fuera del reparto** de los pasos 1 y 6 repiten el
  desvío de R2b; esta vez están escritas en el orden.
- **Lo de Clockify sin verificar** (P-05): el tope de niveles, si una dimensión
  se repite, el orden dentro de los subgrupos, qué pasa con lo expandido al
  recargar y la suma por etiqueta en la cabecera.

## 10. Pendiente del usuario y preguntas abiertas

1. **Partir el slice** (team-lead). Recomendación: un contrato en dos partes,
   como R2b, con la A mergeable sola como R3a (D-R3-1, §7). No bloquea el
   arranque.
2. **Lo abierto al recargar** (usuario). El contrato deja todo contraído al
   cargar y no guarda lo abierto en la URL (D-R3-6). Recomendación: aceptarlo
   así para R3; si se quiere conservar, es un cambio solo del navegador, sin
   otra lectura, que puede ir en un slice chico después de R3. No bloquea. Lo
   abierto en una navegación dentro de la pantalla ya está decidido: empieza
   contraído (D-R3-9).
3. **P-05 en el workspace de Clockify** (usuario, sesión de relevamiento): el
   tope de niveles y la repetición (RP-12), el orden dentro de los subgrupos,
   lo expandido al recargar (RP-13, RP-32) y la suma por etiqueta en la
   cabecera (RP-18). Queda lo de este contrato hasta entonces. No bloquea.
4. **Nota para el usuario, no es pregunta: lo que se ve con el tope de 3000.**
   La decisión es de `architect`, como la de los 366 días (D-R3-6). Con «Este
   año», **Persona → Fecha de todo el equipo muestra solo las personas**, con
   la línea del tope: el segundo nivel tiene unas 7800 filas. **Persona →
   Proyecto, la pregunta que motiva R3, sí entra** (unas 750). Para ver los
   días de todo el equipo hay que acortar el período (un mes son unas 700
   filas) o mirar por persona.

## 11. Fuera de alcance

- «Expandir todo» y «Contraer todo».
- Lo abierto en la URL (pregunta 2).
- Filtrar por tarea o por etiqueta: RP-25 en el resto, fase 3. Los filtros del
  núcleo son R4.
- Gráfico: R5. Exportación: R6 y R7, que usan este tope. Personas sin horas:
  R9.
- `treegrid`, la sangría anunciada por un lector.
- Los grupos sin horas en cualquier nivel.
- RP-14, RP-36, RP-09 y el importe y el porcentaje por grupo, como en R2a.
