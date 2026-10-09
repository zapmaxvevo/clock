# Núcleo de reportes, R4: filtros por personas, cliente y proyecto

Contrato del quinto slice del núcleo de reportes. Extiende la pantalla
`/reportes` y el módulo `src/modules/report/` de R3: suma los filtros de
cliente, de proyecto (con «Sin proyecto») y de personas (con las inactivas
aparte), el segundo vacío y lo que la URL hace con un filtro que nombra algo que
ya no existe. Sin cambios de tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-25 reducido a
  personas, cliente y proyecto; RP-26 solo «sin proyecto»; RP-33 (el segundo
  vacío, con «Quitar filtros»); RP-34 (lo que nombra algo que ya no existe se
  ignora); RP-62 (P-08: las inactivas aparte y tachadas); RP-64 (las invitadas
  no aparecen); RP-29 (los archivados en los catálogos). Se apoya en RP-01,
  RP-31, RP-32 y RP-61 tal como los dejaron R2a a R3b.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R4» y
  «Lo que vale para todos». Depende de R2a; va después de R3, que está entero en
  `main` (`d5765ea`). R9 (personas sin horas) depende de la lista de personas
  de este slice; R10 (agrupar por descripción, mes y semana) va en serie
  después de R4 y antes de R5 (§9).
- **Dos partes, en este orden** (D-R4-1): la **parte A**, cliente y proyecto, con
  todo lo que los filtros comparten (la URL, los enlaces, el control, el segundo
  vacío y el filtro en la lectura), y la **parte B**, personas, en commits
  propios al final. Los commits de la A compilan y pasan sin la B, así que el
  slice se puede partir en R4a y R4b sin reescribir nada (§7).
- **Revisión del contrato:** la primera ronda pidió cambios; están aplicados
  (ids de Better Auth con mayúsculas en los tests, «Sin proyecto» dentro del
  tope de 50, los espías sobre los repositories, el peso con la URL llena, R10
  después de R4b y las notas de §1, §7 y §9). La segunda ronda lo aprobó con
  tres retoques, también aplicados: quién hace cada medición de peso (§7), la
  firma de `seedUser` y `seedMember` (§0) y que los catálogos llamen a los
  repositories por el objeto (§4.5).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): toda
    lectura recibe el `ReportScope`, que solo arma el service; «filtros de
    personas, cliente, proyecto y "sin proyecto", con las inactivas aparte».
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): «`report` importa
    de `profile`, `workspace` y `project` (los catálogos de los filtros, por su
    service)»; una sola foto en una transacción de solo lectura `repeatable
read`; el nombre de una persona lo arma `displayNameOf` en el service.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    la regla de qué ofrece un catálogo la tiene su dueño; la función exportada
    recibe el `tx` de quien llama y solo lee con él.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** Que los
  catálogos se lean con funciones de los services dueños dentro de la
  transacción del reporte lo dicen el ADR 0021 (las dependencias de `report`) y
  el 0010 (la función con `tx` que solo lee). Lo que queda para el usuario o el
  team-lead está en §10.

Decisiones que el contrato da por tomadas (R2a a R3b, mapa §5, `reportes.md`
§8): solo owner y admin ven horas ajenas; **un member con un enlace que nombra a
otras personas ve lo propio y el parámetro se descarta**; las inactivas se
filtran aparte y tachadas (P-08); el tope de 366 días y el de 3000 filas; la
regla de los e2e de §8.3 de R2a; «Sin proyecto» como rótulo (RP-28); lo
abierto del árbol no sobrevive a una recarga y no va en la URL (aceptado por el
usuario: todo contraído al cargar).

## Decisiones del contrato

**D-R4-1 — Dos partes.** Opciones: (1) un solo slice; (2) dos contratos; (3) un
contrato en dos partes, como R3. **(3).** Lo que comparten los tres filtros —los
parámetros, que todo enlace los conserve, el control con su lista, el segundo
vacío y el filtro dentro de la lectura— es la mayor parte del trabajo y no
cambia ninguna decisión de acceso. El de personas es el único que toca el
`ReportScope` (D-R4-4) y trae la lectura de `workspace`. Así cada parte tiene un
riesgo principal: la A, que el filtro se aplique igual en cada nivel, en el
total y en cada enlace; la B, que el filtro de personas nunca muestre horas
ajenas a quien no las ve. La A va primero porque la B la necesita entera y
porque su revisión de seguridad es más corta; la B sola es la que pide una
revisión de seguridad completa. Partirlo en dos contratos obligaría a fijar dos
veces la URL y el control.

**D-R4-2 — Los filtros en la URL.** Tres parámetros nuevos, cada uno con una
lista separada por comas, como `subagrupar` (D-R3-5): `personas` (B),
`clientes` y `proyectos`. `proyectos` admite además el valor `sin-proyecto`
(RP-26). Opciones descartadas: el parámetro repetido (`proyectos=a&proyectos=b`),
que contradice la regla de RP-32 que descarta un parámetro repetido; y un solo
parámetro `filtros=…` con prefijos, que obliga a una gramática propia.

- **Válido** es, por parámetro: una cadena con de uno a
  `REPORT_MAX_FILTER_VALUES` (50) valores separados por coma, sin repetir y cada
  uno con su forma. **`sin-proyecto` es un valor más y cuenta para el tope**: 49
  proyectos y `sin-proyecto` valen; 50 y `sin-proyecto` son 51.
  - en `clientes` y `proyectos`, un uuid **en minúsculas** con guiones (la forma
    en que los devuelve Postgres); en `proyectos`, también `sin-proyecto`;
  - en `personas`, de 1 a 64 caracteres de `[A-Za-z0-9-]`. `user.id` es
    texto: en producción lo genera Better Auth con 32 alfanuméricos de
    mayúsculas y minúsculas; los factories y los e2e siembran uuid en
    minúsculas (§0), así que los criterios 18 y 23 usan a propósito ids con
    mayúsculas. **Distingue mayúsculas**: un id de Better Auth no se puede pasar
    a minúsculas, ni en el esquema ni al cruzarlo con el catálogo.
- **Cualquier otra cosa descarta ese parámetro entero, sin aviso** (RP-32): un
  valor vacío, una coma de más, un valor con otra forma (una mayúscula en un
  uuid, un correo en `personas`), un valor repetido, 51 valores (contando
  `sin-proyecto`) o el parámetro repetido. Cada parámetro se valida por su
  lado, y también por separado del rango y de la agrupación.
- **Un valor bien formado que no está en el catálogo se ignora él solo**
  (RP-34, D-R4-5); los demás del mismo parámetro siguen.
- **La aplicación escribe cada lista ordenada** por unidades de código (el
  `sort()` por omisión), así una misma elección da la misma URL; `sin-proyecto`
  queda última. El orden de los parámetros es `desde`, `hasta`, `agrupar`,
  `subagrupar`, `personas`, `clientes`, `proyectos`; una lista vacía no se
  escribe. Sin filtros, la URL es la de R3.
- **El tope de 50** lo fija `architect` por el largo de la URL: tres listas
  llenas son unos 5,6 KB, lejos del límite de cabeceras de Node y de Vercel;
  §6.4 mide lo que pesa la página con la URL llena. Quien elige más —con «Sin
  proyecto» contado— ve «Elegí hasta 50.» al apretar «Aplicar» (D-R4-8).
  Ninguna lista llega a la base con más valores que su catálogo, porque se
  cruza antes (D-R4-5). El mismo conteo vale en el esquema de la URL, en el
  estado, en la invariante del service, en la guarda del repository y en
  `applyFilter`.

**D-R4-3 — Qué hace cada filtro.** Dentro de un filtro, **o**; entre filtros,
**y**: una entrada cuenta si su persona es una de las elegidas, su proyecto uno
de los elegidos (o no tiene proyecto y «Sin proyecto» está elegido) y su
proyecto es de uno de los clientes elegidos. Un filtro sin elegir no restringe.

- **«Sin proyecto» solo en el filtro de proyecto** (RP-26 reducido). Una entrada
  sin proyecto no tiene cliente, así que **el filtro de cliente la deja afuera**;
  «Sin cliente» como filtro es de la fase 3.
- **Cliente y proyecto juntos se cruzan**: P de C1 con el cliente C2 elegido no
  deja nada. Es la regla de «y», sin excepción para el par.
- **Los filtros se aplican en cada nivel y en el total**: a cada lectura de
  `totalsByLevels` y a `entryTotals`. La cabecera dice el total de lo filtrado
  (RP-18), los hijos de un grupo suman lo del grupo, y el tope de 3000 filas
  cuenta las filas filtradas (D-R3-6).
- **Un archivado se filtra como cualquiera** (RP-29): un proyecto o un cliente
  archivado están en su catálogo y sus horas cuentan.

**D-R4-4 — Las personas pasan por el `ReportScope`.** Opciones: (1) el filtro de
personas como un filtro más, al lado de cliente y proyecto; (2) el filtro de
personas angosta el alcance. **(2).** El alcance es la única traducción de «de
quién son las horas» (`inScope`, D-R2a-1); con (1), una segunda condición sobre
`time_entry.user_id` viviría fuera de él, y un error que la usara en lugar del
alcance mostraría horas ajenas.

- `ScopePeople` suma una variante, `{ kind: "chosen"; userIds }`, que **solo
  sale de una de `everyone`**: la arma una función privada del service,
  `narrowedTo(scope, userIds)`, que lanza si el alcance no es `everyone` o si
  la lista está vacía o pasa el tope. **Nunca ensancha**: de `self` no sale
  ninguna otra.
- `inScope` traduce `chosen` como `workspace_id = $1 and user_id in ($2, …)`: el
  workspace sigue, así que una persona que es miembro de dos workspaces no trae
  horas del otro.
- **Un actor sin `timeEntry.others.view` no tiene filtro de personas**: el
  service no lee el catálogo de personas, descarta lo que traiga `personas`
  (mapa §5, RP-32) y el estado lleva `filters.people` vacío y
  `filterOptions.people` en `null`, con lo que la pantalla no dibuja el control.
  Sus filtros de cliente y de proyecto se aplican a lo propio.
- **La línea del alcance no cambia**: con personas elegidas sigue diciendo «Ves
  las horas de todas las personas del workspace.», porque dice lo que quien mira
  puede ver; lo elegido lo dice el botón del filtro. `state.scope` es `self` con
  `self` y `everyone` con las otras dos.

Qué pasa con cada id de `personas`:

| Quien mira                  | El id                                                                 | Qué pasa                                           |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| sin `timeEntry.others.view` | cualquiera, también el propio                                         | el parámetro se descarta; ve lo propio             |
| owner o admin               | una membresía `active` o `inactive` de su workspace                   | se aplica                                          |
| owner o admin               | una membresía `invited`                                               | se ignora (no está en el catálogo, RP-64)          |
| owner o admin               | una persona de otro workspace, o un id que no existe                  | se ignora                                          |
| owner o admin               | el id de una persona del catálogo con otras mayúsculas                | se ignora: no es el mismo id                       |
| owner o admin               | todos los de la lista se ignoran                                      | sin filtro de personas: todas                      |
| cualquiera                  | mal formado (forma, repetido, coma, más de 50, repetido el parámetro) | el parámetro se descarta entero, antes del service |

**D-R4-5 — Los catálogos son de sus dueños y se leen en la misma foto.** El
service del reporte los pide, con su `tx`, a dos funciones nuevas que solo leen
(ADR 0010, ADR 0021):

- **`project`**: `getProjectFilterCatalog(tx, actor)` (A) devuelve **todos los
  clientes del workspace, archivados incluidos**, y **los proyectos que
  `project.view` deja ver, archivados incluidos** (RP-29), cada uno con su
  marca de archivado. La regla de qué proyecto se ve es la de `can()`, como en
  `readCatalog`.
- **`workspace`**: `listWorkspacePeople(tx, actor)` (B) devuelve las membresías
  `active` e `inactive` del workspace con su estado y las dos columnas del
  nombre. **Las invitadas no están, por su estado** (RP-64), tengan o no
  horas, y una persona activa sin horas sí está (la que R9 va a mostrar).
  Devuelve el nombre de la cuenta y el editado sin aplicar `displayNameOf`:
  `profile` importa de `workspace` (`profile/service.ts:20`), así que lo aplica
  el service del reporte, como manda el ADR 0021 para el nombre de una persona.

Opciones descartadas: (1) que el Server Component pida los catálogos aparte,
como el selector del rastreador (ADR 0010, «Los catálogos que un módulo ofrece a
la pantalla de otro»): el service necesita los catálogos para decidir qué ids
de la URL se ignoran (RP-34), y serían dos fotos —un proyecto creado entre las
dos lecturas aparecería en la lista sin poder aplicarse—; (2) que el repository
del reporte lea `project` y `membership` por su cuenta: la regla de qué se
ofrece (los archivados sí, las invitadas no, los privados según `project.view`)
quedaría escrita dos veces; (3) el catálogo de personas en `src/modules/team/`,
el módulo que crea R8: el ADR 0021 nombra a `workspace` entre las dependencias
de `report`, y R8 no toca `workspace` (§10, pregunta 2).

- **Los filtros efectivos son la intersección**: lo de la URL que está en el
  catálogo, en el orden del catálogo, **con los ids del catálogo y no los de la
  URL**, comparados tal cual, sin cambiar mayúsculas. Es lo que va a la
  lectura, lo que guarda el estado y lo que conservan los enlaces: un id
  ignorado desaparece de la URL en la navegación siguiente.
- **Se leen en cada pedido**, también sin filtros, porque el control necesita
  sus opciones: dos sentencias más en la A (clientes y proyectos) y una más en
  la B (personas, solo con `timeEntry.others.view`). Van al principio de la
  transacción, antes de los niveles.

**D-R4-6 — El cliente se filtra en la base, no por el catálogo.** Opciones: (1)
el service traduce los clientes elegidos a los proyectos del catálogo que son
de esos clientes, y la lectura filtra solo por proyecto; (2) la lectura filtra
por el cliente del proyecto de cada entrada. **(2)**, con
`exists (select 1 from project as filter_project where filter_project.workspace_id = time_entry.workspace_id and filter_project.id = time_entry.project_id and filter_project.client_id in (…))`.
Con (1) el filtro dependería de `project.view`: un member con horas propias en
un privado del que salió (PR-71) las vería agrupando por cliente y no filtrando
por ese mismo cliente. Con (2) filtrar por cliente y agrupar por cliente leen la
misma columna, `project.client_id`, como ya hace la dimensión de cliente
(D-R3-2). El alias es propio, como cada dimensión: no se cruza con
`entry_project`.

**D-R4-7 — El segundo vacío** (RP-33). Con algún filtro efectivo y ningún grupo,
la tabla dice «Ninguna entrada coincide con los filtros» y ofrece «Quitar
filtros», un enlace al mismo período, la misma agrupación y los mismos
subniveles sin ningún filtro. Sin filtros efectivos, el vacío de R2a.

- **No se pregunta si el período tiene horas**: con filtros y sin grupos es el
  segundo, aunque el período esté vacío para todos. Opción descartada: una
  lectura más sin filtros para elegir el mensaje. «Ninguna entrada coincide» es
  cierto en los dos casos, y «Quitar filtros» lleva al primer vacío si
  corresponde.
- **Un filtro que se ignoró entero no es un filtro**: un member con `personas`, o
  una lista de ids que no existen, ve el primer vacío si no hay horas (RP-34).
- Los totales en «0:00», como en el primero.

**D-R4-8 — El control.** Después de «Subagrupar por», un tercer grupo
(`role="group"`, nombrado por su rótulo visible «Filtrar por») con un botón por
filtro: «Personas» (B, solo con `filterOptions.people`), «Clientes» y
«Proyectos». **El texto del botón es su nombre accesible** y dice lo elegido:
«Proyectos: todos», «Proyectos: Nombre» con uno, «Proyectos: 3» con más; «Sin
proyecto» cuenta como uno y se nombra así. Cada botón abre un popover:

- **Un buscador** arriba, con el foco al abrir, que filtra por nombre sin
  distinguir mayúsculas ni acentos (`normalizeSearch`, TT-07). «Sin proyecto» no
  se filtra: siempre está, primero.
- **Las opciones con casillas** (`Checkbox` de `ui` con su `label`): primero las
  vigentes, en un grupo nombrado por el filtro; después, si hay, **las que ya no
  están**, en un grupo propio: «Archivados» para clientes y proyectos,
  «Inactivas» para personas, **con el nombre tachado** (P-08; el grupo dice por
  qué, porque el tachado no se anuncia). Un proyecto lleva su punto de color y
  su cliente en gris, como su fila. Cada grupo en el orden de `compareNames`.
- **«Aplicar»** navega con lo elegido y cierra el popover; el foco vuelve al
  botón, que con la pantalla nueva dice lo elegido (como «Segundo nivel»,
  lección T1 de R3b). Con más de 50 elegidos, «Sin proyecto» contado, no
  navega: el popover sigue abierto con «Elegí hasta 50.» en su región de
  alerta, como el mensaje del rango (RP-34). Sin nada elegido, «Aplicar» quita
  ese filtro.
- **Esc o un clic afuera** cierran sin aplicar; al abrir de nuevo, lo elegido
  vuelve a ser lo del estado y el buscador está vacío. Lo que el buscador
  esconde sigue elegido.
- **Sin coincidencias**: «Nada coincide con la búsqueda.».

Opciones descartadas: un enlace por opción que alterna el id en la URL (elegir
cinco personas serían cinco navegaciones contra Neon) y un `Combobox` con
selección múltiple (no hay precedente en el proyecto y su comportamiento con el
teclado es otro). El popover con casillas y «Aplicar» es el patrón del selector
del período (D-R2a-4).

**D-R4-9 — El estado lleva los filtros efectivos y las opciones.**
`reportReadyState` suma `filters` (los ids efectivos, D-R4-5) y `filterOptions`
(los catálogos ya armados para la pantalla). Los nombres de lo filtrado salen
de las opciones; R6 los usa para la cabecera del archivo. **Ningún componente de
cliente recibe el estado entero**: cada `FilterPicker` recibe sus opciones, lo
elegido y lo que necesita para armar su enlace (el rango, la agrupación y los
filtros).

**D-R4-10 — Todo enlace conserva los filtros.** `reportHref` recibe `filters`
**obligatorio**: una URL del reporte que los olvide no compila. Lo conservan las
flechas, «Esta semana», los atajos, «Aplicar» del período, los enlaces de
«Agrupar por» y de los subniveles y el `key` de `ReportTree`, así que cambiar un
filtro vuelve a contraer el árbol (D-R3-9). Solo «Quitar filtros» y el «Aplicar»
de un filtro cambian los filtros.

**D-R4-11 — Sin comprobación contra Neon.** La de §6.3 de R2b se pidió por una
forma de parámetro nueva. R4 no trae ninguna: los ids van con `inArray` de
Drizzle, que escribe `in ($1, …, $n)` con un parámetro escalar por valor, la
misma forma que ya corre en producción con `neon-serverless` en `findTags`
(`project/repository.ts:311-320`, desde `assertTaggable`) y en
`findManyByIdsForUpdate` (`time-entry/repository.ts:408-433`). El estado de la
membresía va también con `inArray`, sobre la columna del enum: parámetros
escalares del tipo de la columna, como el enum que ya viaja en
`eq(task.status, "active")` (`project/repository.ts:274`). El `exists` del
cliente no suma parámetros fuera de sus ids. **Ningún arreglo nuevo como
parámetro**: el único que viaja es el de los cortes de la fecha
(`::timestamptz[]`, `report/repository.ts:374-377`), sin cambios desde R2b. Si
`backend-dev` necesita otro (`= any($1)` o `unnest`), avisa y la comprobación
vuelve con el procedimiento de §6.3 de R2b, antes del merge.

**D-R4-12 — Volumen.** La A mide las lecturas con filtro de proyecto, de «Sin
proyecto» y de cliente, `entryTotals` filtrado, el peor árbol filtrado y los dos
catálogos de `project`, y el peso de la página con catálogos grandes; la B, la
lectura con personas elegidas, el catálogo de personas y el peso con la URL
llena (§6). Ningún índice nuevo sin una medición que lo pida (§6.5 de R3).

**D-R4-13 — Los e2e de R4.** Heredan §8.3 de R2a. El filtro de personas es el
primero que hace reproducible el total con alcance `everyone`: con personas
elegidas, todas del test, el total es solo de ellas. La lista de personas y la
de proyectos del workspace de los e2e acumulan las de todas las corridas, así
que los recorridos **buscan por el sufijo del test** antes de afirmar opciones.
Las membresías inactivas e invitadas se siembran por base (§0, riesgo 2 del
mapa): la fase 1 no las produce desde la pantalla. **La persona de la sesión
tiene un id de Better Auth** (`src/server/test-session.ts:86-97` la crea con
`createUser`), con mayúsculas; las sembradas con `seedPerson`, uuid
(`e2e/database.ts:345`). El recorrido 15 elige a las dos clases.

**D-R4-14 — Lo que se prueba en unidad y lo que no.** Como D-R3-13: el arnés es
`renderToStaticMarkup` sin DOM y el contenido de un popover solo se monta
abierto. En unidad van el panel dibujado sin popover (`FilterPanel`, con lo
elegido y la búsqueda como props), las funciones puras del modelo
(`filter-model.ts`) y la barra y la vista. Abrir, tildar, buscar, «Aplicar», el
cierre, el foco y Esc son de los e2e.

## 0. Precondición de arranque

- **`main` en `d5765ea`**, con R3 entero. Las citas de abajo son de ese árbol.
  Los tests de integración y CI usan `postgres:18-alpine`, la versión mayor de
  Neon; todo test de tiempo fija reloj y zona.
- **Sin pendientes del usuario para arrancar.** No hay comprobación contra Neon
  (D-R4-11). Las preguntas de §10 no bloquean.
- **Las membresías no activas se siembran por base**, sin helpers nuevos:
  `seedMember(workspaceId, role, status)` en integración y
  `seedPerson({ status })` o `setMembershipStatus` en e2e. Una invitada con
  horas, que la aplicación no produce, se siembra con `seedMember(…, "invited")`
  y `seedTimeEntry`: la clave de R1 pide la membresía, no su estado.
- **Un id de persona con mayúsculas** en integración (B, §7): la firma pasa a
  `seedUser(email?, id?)`, con el `id` como **segundo parámetro posicional**,
  así las 41 llamadas que pasan `email` no cambian (`factories.ts:34`); sin
  `id`, `randomUUID` como hoy. `seedMember(workspaceId, role, status?, id?)`
  recibe el mismo `id?` y se lo pasa a `seedUser` (`factories.ts:60-66`), así
  el criterio 18 siembra la persona y su membresía con el factory, sin insertar
  la membresía a mano. El id es uno de 32 alfanuméricos como los de Better
  Auth.

### Supuestos sobre el árbol, con archivo y línea en `d5765ea`

| Supuesto                                                                                                                                                                                                                                                                                  | Dónde                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `groupByOfParam` distingue mayúsculas; `reportSubgroupParams` parte `subagrupar` por coma y descarta el parámetro entero si un valor no sirve                                                                                                                                             | `src/modules/report/schema.ts:89-91`, `:118-135`                                                                             |
| `reportNamedRef` y `reportProjectRef` son las formas de lo que un grupo muestra; `reportPersonGroup.userId` es `z.string()`, no uuid                                                                                                                                                      | `schema.ts:161-168`, `:187-195`                                                                                              |
| `reportReadyState` no tiene filtros; `ReportState` es `ready` o `forbidden`                                                                                                                                                                                                               | `schema.ts:254-284`, `:296-299`                                                                                              |
| `ScopePeople` tiene `everyone` y `self`; `Scope` es una clase privada con un miembro nominal; `scopeOf` pregunta `timeEntry.others.view` una vez                                                                                                                                          | `src/modules/report/service.ts:39-43`, `:50-57`, `:76-85`                                                                    |
| `ReportRequest` tiene `range`, `groupBy` y `subgroups`, los tres obligatorios                                                                                                                                                                                                             | `service.ts:62-69`                                                                                                           |
| `getReportState`: `report.view`, `scopeOf`, las invariantes de niveles y de días antes de leer, y las lecturas en `db.transaction(…, { isolationLevel: "repeatable read", accessMode: "read only" })`                                                                                     | `service.ts:328-399` (`:347-359`, `:380-399`)                                                                                |
| `state.scope` es `scope.people.kind`                                                                                                                                                                                                                                                      | `service.ts:415`                                                                                                             |
| `inScope` es la única traducción del alcance; `closedIn` y `entrySeconds` son privadas                                                                                                                                                                                                    | `src/modules/report/repository.ts:93-117`                                                                                    |
| `ReportLevelRead` lleva `span`, `dimensions`, `buckets` y `limit`; `checkLevelRead` lanza `RangeError` antes de consultar                                                                                                                                                                 | `repository.ts:77-85`, `:399-428`                                                                                            |
| Los alias propios por dimensión (`entry_project`, `group_project`, `task_project`, …) y la tabla de dimensiones; los cortes de la fecha van como `::timestamptz[]`                                                                                                                        | `repository.ts:201-205`, `:230-385` (`:374-377`)                                                                             |
| `totalsByLevels` filtra las entradas en la subconsulta de adentro con `inScope` y `closedIn`; `entryTotals(scope, span, tx)` filtra igual                                                                                                                                                 | `repository.ts:484`; `:526-539`                                                                                              |
| `scope.test-d.ts` afirma que las dos lecturas no compilan sin alcance, y que un literal no es un `ReportScope`                                                                                                                                                                            | `src/modules/report/scope.test-d.ts:10-32`                                                                                   |
| La página valida rango, agrupación y subniveles cada uno con `safeParse` y arma `request`                                                                                                                                                                                                 | `src/app/(app)/reportes/page.tsx:12-34`                                                                                      |
| `reportHref` arma `desde`, `hasta`, `agrupar` y, con subniveles, `subagrupar`; `subgroups` es opcional                                                                                                                                                                                    | `src/modules/report/components/report-href.ts:12-33`                                                                         |
| La barra arma los `href` de las flechas, «Esta semana» y «Agrupar por» con `range` y `grouping`; pasa `grouping` a `RangePicker` y a `SubgroupPicker`                                                                                                                                     | `components/report-toolbar.tsx:30-131` (`:40`, `:49`, `:66`, `:121`)                                                         |
| `applySelection(selection, grouping)` arma el `href` de «Aplicar»; los atajos, con `reportHref({ range, ...grouping })`                                                                                                                                                                   | `components/range-picker-model.ts:35-59`; `components/range-picker.tsx:71`, `:166`                                           |
| `SubgroupPanel` arma cada enlace con `withLevel`                                                                                                                                                                                                                                          | `components/subgroup-picker.tsx:65-105` (`:87`)                                                                              |
| `ReportView` dibuja el vacío en una fila de dos columnas y monta `ReportTree` con `key={reportHref(...)}`                                                                                                                                                                                 | `components/report-view.tsx:64-79`                                                                                           |
| `report-toolbar.test.tsx` cuenta dos grupos con rótulo y junta los botones que siguen a «Subagrupar por»                                                                                                                                                                                  | `components/report-toolbar.test.tsx:223-236`                                                                                 |
| `reportLabels.empty` y `inactivePerson`; «Sin proyecto» es `projectLabels.noProject`                                                                                                                                                                                                      | `components/labels.ts:66-68`; `project/components/labels.ts:39`                                                              |
| `readCatalog` lee clientes con `listClients` (todos, archivados incluidos) y proyectos con `listActiveProjects` (sin los archivados), y filtra con `can(actor, access, projectResource(row))`                                                                                             | `src/modules/project/service.ts:425-474`; `project/repository.ts:244-260`                                                    |
| `assertTaggable(tx, actor, ids)`: función exportada que solo lee con el `tx` de quien llama; `findTags` usa `inArray`                                                                                                                                                                     | `project/service.ts:388-406`; `project/repository.ts:311-320`                                                                |
| `projectRepository` y `workspaceRepository` son objetos con métodos: `vi.spyOn` los puede espiar, a diferencia de una función exportada suelta                                                                                                                                            | `project/repository.ts:44`; `src/modules/workspace/repository.ts:17`                                                         |
| `findManyByIdsForUpdate` usa `inArray` sobre `time_entry.id`, en producción                                                                                                                                                                                                               | `src/modules/time-entry/repository.ts:408-433`                                                                               |
| `workspace` no tiene ninguna lectura de personas: solo `findMembership`, `createMembership` y el arranque                                                                                                                                                                                 | `src/modules/workspace/service.ts:1-83`; `workspace/repository.ts:17-92`                                                     |
| `profile` importa de `workspace`; `displayNameOf` vive en `profile`                                                                                                                                                                                                                       | `src/modules/profile/service.ts:20`, `:113-116`                                                                              |
| `team.view` es de todos los roles; `timeEntry.others.view`, de owner y admin; `can()` corta por estado antes que por rol, y por el workspace del recurso                                                                                                                                  | `src/server/permissions/index.ts:58`, `:66`, `:125`, `:131`, `:181-186`                                                      |
| `membership_status` es `active`, `inactive`, `invited`; la membresía es única por `(workspace_id, user_id)`                                                                                                                                                                               | `src/server/db/schema.ts:33-37`, `:97-123`                                                                                   |
| `user.id` es `text`; Better Auth lo genera con 32 caracteres de `a-z`, `A-Z` y `0-9`; la sesión de e2e lo crea con `createUser`                                                                                                                                                           | `src/server/db/auth-schema.ts:5`; `node_modules/@better-auth/core/dist/utils/id.mjs:3-5`; `src/server/test-session.ts:86-97` |
| `client.archived_at` y `project.archived_at` marcan el archivado; los ids son uuid                                                                                                                                                                                                        | `schema.ts:214`, `:220`, `:255`, `:264`                                                                                      |
| Índices de `time_entry`: `(workspace_id, user_id, started_at desc)` y `(workspace_id, project_id, task_id)` parcial con proyecto                                                                                                                                                          | `schema.ts:436-440`, `:468-470`                                                                                              |
| `seedUser(email?)` usa `randomUUID` y no acepta un id; `seedMember(workspaceId, role, status?)` llama a `seedUser()` y acepta el estado                                                                                                                                                   | `src/test/factories.ts:34-43`, `:60-68`                                                                                      |
| `service.integration.test.ts` arma los pedidos con `readyState(actor, Partial<ReportRequest>)`; hay llamadas directas a `getReportState` con literales                                                                                                                                    | `src/modules/report/service.integration.test.ts:99-118`, `:1833-1836`, `:1879`, `:1929`                                      |
| `scope.integration.test.ts` siembra owner, admin, `project_manager`, `team_manager`, member e inactivo en A; arma pedidos en `request` y desde la URL en `requestFromUrl`, y los compara con `toStrictEqual` en dos tests «los esquemas no dejan pasar ninguna clave que nombre personas» | `src/modules/report/scope.integration.test.ts:183-187`, `:332-334`, `:823-841`, `:971-995`                                   |
| e2e: `seedPerson` acepta el estado y siembra un uuid, `setRole` y `setMembershipStatus` cambian la persona de la sesión, `archiveProject` archiva; `seedProject` crea un cliente nuevo por proyecto                                                                                       | `e2e/database.ts:323-362` (`:345`), `:393-413`, `:129`, `:237-245`                                                           |
| e2e: `reportsUrl` y `reportsUrlOf` conocen `subagrupar` y no miran otros parámetros; un recorrido de R2a abre `personas=<correo>`                                                                                                                                                         | `e2e/reports-page.ts:178-203`; `e2e/reports.spec.ts:230`                                                                     |
| `normalizeSearch` y `compareNames` son las de la búsqueda y el orden del resto de la aplicación                                                                                                                                                                                           | `src/lib/text.ts:14-16`, `:27-46`                                                                                            |

## 1. Alcance

Entra, **parte A** (cliente y proyecto):

- **El módulo `report`**: `clientes` y `proyectos` en la URL; `ReportFilters`,
  `filters` y `filterOptions` en el estado; el filtro en `totalsByLevels` y en
  `entryTotals`; los catálogos de `project` en la transacción; los filtros
  efectivos.
- **El módulo `project`**: `getProjectFilterCatalog` y la lectura de todos los
  proyectos, archivados incluidos.
- **La pantalla**: «Filtrar por» con «Clientes» y «Proyectos»; el segundo vacío
  con «Quitar filtros»; todo enlace conserva los filtros.
- **La medición** de §6.2 y la primera de §6.4.

Entra, **parte B** (personas), en commits propios al final:

- **El módulo `report`**: `personas` en la URL; `chosen` en el alcance;
  `filterOptions.people`.
- **El módulo `workspace`**: `listWorkspacePeople`.
- **La pantalla**: «Personas», con las inactivas aparte y tachadas.
- **La medición** de §6.3, con una invitada en `seed.sql`, y la segunda de §6.4,
  con las tres listas.

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                                         | Qué cambia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Qué hay que volver a probar                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/modules/report/schema.ts`                  | A: constantes, `ReportFilters`, los parámetros, `filters` y `filterOptions`. B: `people` en los dos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `schema.test.ts`; los fixtures de componentes               |
| `src/modules/report/repository.ts`              | A: `filter` en `ReportLevelRead`; `entryTotals(scope, read, tx)` con `ReportEntryRead`; la condición del filtro; las guardas. B: `chosen` en `inScope`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `service.integration.test.ts` y `scope.integration.test.ts` |
| `src/modules/report/service.ts`                 | A: `ReportRequest.filters` obligatorio; los catálogos y los filtros efectivos en la transacción; la invariante de los filtros. B: `chosen` y `narrowedTo`; el catálogo de personas.                                                                                                                                                                                                                                                                                                                                                                                                                      | Ídem                                                        |
| `service.integration.test.ts`                   | A, paso 1: `filters` en `readyState` (`?? NO_REPORT_FILTERS`) y en los literales; `filter` en las llamadas directas. **Ningún valor afirmado cambia.**                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                           |
| `scope.integration.test.ts`                     | A, paso 1 (`backend-dev`, edición mecánica): `filters: NO_REPORT_FILTERS` en `request`, `requestFromUrl`, `treeRequest` y los demás pedidos, **en los dos lados de los `toStrictEqual` de `:835` y `:993`**; `filter` en las llamadas directas. B, paso 7 (`test-engineer`): los dos tests de `:833` y `:991`, «los esquemas no dejan pasar ninguna clave que nombre personas», dejan de ser ciertos con `personas` en `reportFiltersOf`; se renombran y se acotan a las claves que siguen sin existir (`persona`, `userId`, `alcance`) y a `personas` repetido, y lo de `personas` pasa al criterio 19. | —                                                           |
| `scope.test-d.ts`                               | A: las afirmaciones de `entryTotals` con un `ReportEntryRead`. B: un literal con `kind: "chosen"` no es un `ReportScope`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `npm run typecheck`                                         |
| `src/test/factories.ts`                         | B: `seedUser(email?, id?)`, con el `id` como segundo posicional; `seedMember(workspaceId, role, status?, id?)` le pasa el `id` a `seedUser`. Sin `id`, `randomUUID` como hoy; las llamadas existentes no cambian.                                                                                                                                                                                                                                                                                                                                                                                        | la suite de integración                                     |
| `src/app/(app)/reportes/page.tsx`               | A, paso 1 (`backend-dev`, edición mecánica): `filters: NO_REPORT_FILTERS`. `frontend-dev` lo cambia por `reportFiltersOf(params)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | e2e                                                         |
| `src/modules/report/components/*`               | A: `filters` en cada `reportHref`, «Filtrar por», el segundo vacío. A, paso 1 (`backend-dev`, edición mecánica): `filters` y `filterOptions` en los fixtures de `ReportReadyState`. B: «Personas».                                                                                                                                                                                                                                                                                                                                                                                                       | Los tests de componentes                                    |
| `report-toolbar.test.tsx`                       | A: **cambian de valor dos afirmaciones existentes**: tres grupos con rótulo en lugar de dos (`:236`), y los botones que siguen a «Subagrupar por» terminan en «Filtrar por» (`:223-229`). Por D-R4-8.                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                           |
| `src/modules/project/*`                         | A: `getProjectFilterCatalog`, sus tipos y `listAllProjects`. `readCatalog` no cambia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `project/service.integration.test.ts`                       |
| `src/modules/workspace/*`                       | B: `listWorkspacePeople` y `listPeople`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `workspace/service.integration.test.ts`                     |
| `e2e/reports-page.ts`, `e2e/database.ts`        | A: `reportsUrl` y `reportsUrlOf` con los filtros, y `reportsUrlOf` afirma que no hay ninguno cuando no se piden; `projectIdOf` y `clientIdOf`. B: `userIdOf`. Ningún nombre exportado cambia (§10, 2).                                                                                                                                                                                                                                                                                                                                                                                                   | `reports.spec.ts` entero; `team.spec.ts` de R8 si ya está   |
| `scripts/report-volume/seed.sql`, `explain.sql` | A: Q17 a Q22. B: una invitada sin horas; Q23 y Q24.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                           |

- **Una URL sin filtros no cambia**, y los tests de R2a a R3b siguen afirmando
  lo mismo. Cambian las firmas que llaman (`filters`, `filter`, `entryTotals`),
  las dos afirmaciones de la barra de arriba y, en B, el nombre y el alcance de
  los dos tests de `scope.integration.test.ts` que hablan de `personas`. Si
  algún valor afirmado de R2a a R3b cambia, es un error del slice, no del test.
- **El recorrido de R2a que abre `personas=<correo>`** (`reports.spec.ts:230`)
  sigue pasando: un correo no tiene la forma de un id y el parámetro se
  descarta; con `reportsUrlOf` más estricto (A), el enlace de «Proyecto» que
  sigue tampoco lo lleva.
- **Las ediciones mecánicas fuera del reparto** (pasos 1 y 6 de §7) siguen la
  regla de R3: las hace `backend-dev` para que su commit compile y pase, con el
  aviso al team-lead, y espera a que el dueño del archivo commitee lo que tenga
  pendiente en él. **Los fixtures usan `NO_REPORT_FILTERS` y un
  `filterOptions` común por archivo**, así la parte B suma `people` en un solo
  lugar por archivo.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** El filtro de personas usa el índice
`(workspace_id, user_id, started_at desc)` como el alcance `self`; el de
proyecto puede usar el parcial `(workspace_id, project_id, task_id)`; el de
cliente es un semi-join contra `project` por su clave primaria. §6 mide; si algo
pasa su presupuesto, vale §6.5 de R3: el slice se detiene y vuelve a
`architect`.

## 3. Permisos

**Ninguna acción nueva.** Deciden las que ya existen:

- `report.view` (todos los roles activos): ver el reporte con los filtros de
  cliente y de proyecto sobre lo que se ve.
- `timeEntry.others.view` (owner y admin): que exista el filtro de personas y
  que el alcance se pueda angostar a `chosen` (D-R4-4). La pregunta la hace
  `scopeOf` una vez, como en R2a; `narrowedTo` no vuelve a preguntar: parte del
  alcance que ya la respondió.
- `project.view`: qué proyectos ofrece el catálogo (D-R4-5), dentro de
  `getProjectFilterCatalog`, con el `ProjectResource` de cada fila.
- `team.view` (todos los roles activos): `listWorkspacePeople` devuelve la lista
  vacía sin ella, como `readCatalog` con las etiquetas sin `tag.view`.

Ninguna decisión de acceso vive fuera de `can()`: el service del reporte no
compara roles y las funciones de los dueños llaman a `can()` con su recurso.
**La transacción y los catálogos no se abren ni se leen sin `report.view`.**

## 4. Contrato de lectura

### 4.1 Los tipos (`report/schema.ts`)

La forma final, con lo de la parte B marcado:

```ts
/** D-R4-2: cuántos valores lleva como mucho cada filtro de la URL; `sin-proyecto` cuenta. */
export const REPORT_MAX_FILTER_VALUES = 50;

/** RP-26: el valor de `proyectos` que elige las entradas sin proyecto. */
export const REPORT_WITHOUT_PROJECT = "sin-proyecto";

/** Los filtros de un reporte, ya validados. Una lista vacía no filtra (D-R4-3). */
export type ReportFilters = {
  /** Parte B. Ids de `user`; solo con `timeEntry.others.view` (D-R4-4). */
  readonly people: readonly string[];
  readonly clients: readonly string[];
  readonly projects: readonly string[];
  /** RP-26: «Sin proyecto», con los proyectos o sola. Cuenta uno en el tope de los proyectos. */
  readonly withoutProject: boolean;
};

export const NO_REPORT_FILTERS: ReportFilters; // las listas vacías y `withoutProject: false`

/** Algún filtro elige algo: lo que separa el segundo vacío del primero (D-R4-7). */
export function hasReportFilters(filters: ReportFilters): boolean;

/** `?clientes=<uuid>,<uuid>` con `safeParse` (D-R4-2). Cualquier valor mal formado descarta el parámetro entero. */
export const reportClientParams; // { clientes } → readonly string[]

/** `?proyectos=<uuid>,sin-proyecto` con `safeParse`; hasta 50 valores con `sin-proyecto`. */
export const reportProjectParams; // { proyectos } → { projects, withoutProject }

/** Parte B. `?personas=<id>,<id>` con `safeParse`; distingue mayúsculas. */
export const reportPeopleParams; // { personas } → readonly string[]

/**
 * Los filtros de la URL, cada parámetro validado por su lado con su `safeParse`:
 * uno que no vale queda vacío y no arrastra a los otros (RP-32). No decide
 * quién puede usar cada uno: eso es del service (D-R4-4).
 */
export function reportFiltersOf(params: Readonly<Record<string, unknown>>): ReportFilters;

const reportClientOption = z.object({
  id: z.uuid(),
  name: z.string(),
  /** RP-29: se filtra igual; la pantalla lo pone aparte. */
  archived: z.boolean(),
});

const reportProjectOption = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_KEYS),
  /** En gris, como en su fila; `null` sin cliente. */
  client: reportNamedRef.nullable(),
  archived: z.boolean(),
});

// parte B
const reportPersonOption = z.object({
  id: z.string(),
  /** `displayNameOf`: el editado o el de la cuenta. */
  name: z.string(),
  /** RP-62, P-08: aparte y tachada. */
  inactive: z.boolean(),
});

// reportReadyState suma:
//   /** D-R4-5: lo de la URL que está en las opciones, en su orden, con sus ids. */
//   filters: z.object({
//     people: z.array(z.string()).max(REPORT_MAX_FILTER_VALUES),        // parte B
//     clients: z.array(z.uuid()).max(REPORT_MAX_FILTER_VALUES),
//     projects: z.array(z.uuid()),
//     withoutProject: z.boolean(),
//   }).refine(proyectos más `withoutProject` como uno ≤ REPORT_MAX_FILTER_VALUES),
//   /** D-R4-9: lo que ofrece cada filtro, de su dueño (ADR 0010), en el orden de `compareNames`. */
//   filterOptions: z.object({
//     /** Parte B. `null` sin `timeEntry.others.view`: el filtro no existe. */
//     people: z.array(reportPersonOption).nullable(),
//     clients: z.array(reportClientOption),
//     projects: z.array(reportProjectOption),
//   }),
```

- **La URL dice `personas`, `clientes`, `proyectos` y `sin-proyecto`**; el código,
  `people`, `clients`, `projects` y `withoutProject`.
- **La forma de un uuid** la fija una expresión propia en minúsculas
  (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`), no
  `z.uuid()`, que acepta mayúsculas: un id en mayúsculas no coincidiría con el
  del catálogo y se ignoraría en silencio, que es peor que descartarlo.
- **La de un id de persona**: `^[A-Za-z0-9-]{1,64}$`.
- `reportFiltersOf` es la única que la página y la ruta de exportación de R6
  usan para leer los filtros.

### 4.2 `src/server/time`

**No cambia.**

### 4.3 Repository (`report/repository.ts`)

```ts
/**
 * RP-25, RP-26: los filtros de cliente y de proyecto, ya cruzados con sus
 * catálogos. El de personas va en el alcance (D-R4-4).
 */
export type ReportEntryFilter = {
  /** Vacío y sin `withoutProject`: sin filtro de proyecto. */
  readonly projectIds: readonly string[];
  readonly withoutProject: boolean;
  /** Vacío: sin filtro de cliente. Deja afuera las entradas sin proyecto. */
  readonly clientIds: readonly string[];
};

/** Sin filtros: lo que leían R2a a R3b. */
export const NO_ENTRY_FILTER: ReportEntryFilter;

/** Lo que lee `entryTotals`: el intervalo y los filtros. */
export type ReportEntryRead = {
  readonly span: ReportSpan;
  readonly filter: ReportEntryFilter;
};

/** Lo que lee `totalsByLevels`: lo de `ReportEntryRead` y por qué dimensiones agrupa. */
export type ReportLevelRead = ReportEntryRead & {
  readonly dimensions: readonly ReportGroupBy[];
  readonly buckets: TimeBuckets | null;
  readonly limit?: number;
};

// en reportRepository:
  totalsByLevels(scope: ReportScope, read: ReportLevelRead, tx: Executor = db): Promise<readonly LevelTotalRow[]>; // sin cambio de firma
  entryTotals(scope: ReportScope, read: ReportEntryRead, tx: Executor = db): Promise<EntryTotals>; // antes: (scope, span, tx)
```

**La condición del filtro**, una función privada, `matchesFilter(filter)`, que
devuelve `undefined` sin filtros y se suma al `where` de la subconsulta de
adentro de `totalsByLevels` y al de `entryTotals`, junto a `inScope` y
`closedIn`:

```sql
-- con proyectos o «Sin proyecto»
and (time_entry.project_id in ($p1, …) or time_entry.project_id is null)
--   (solo la parte que corresponde: sin ids no hay `in`; sin «Sin proyecto», no hay `is null`)
-- con clientes
and exists (select 1
              from project as filter_project
             where filter_project.workspace_id = time_entry.workspace_id
               and filter_project.id = time_entry.project_id
               and filter_project.client_id in ($c1, …))
```

- **Va en la subconsulta por entrada**, antes de la unión con
  `time_entry_tag`: solo mira columnas de `time_entry` y el `exists`. Con la
  etiqueta como dimensión, una entrada filtrada no da ninguna fila.
- **Alias propio**, `filter_project`: no se cruza con `entry_project` de la
  dimensión de cliente ni con los de afuera.
- **No es una dimensión**: no entra en la tabla de dimensiones ni depende de
  ellas, así que una dimensión nueva (R10) no lo toca.
- **`inArray` solo con listas no vacías**: con una vacía, esa parte no se
  escribe (D-R4-11).
- **`inScope` con `chosen`** (B): `and(eq(workspace_id), inArray(user_id,
userIds))`. El workspace se conserva siempre.
- **Guardas nuevas**, con `RangeError` antes de consultar, en las dos
  funciones: `projectIds` más `withoutProject` (que cuenta uno), o `clientIds`,
  con más de `REPORT_MAX_FILTER_VALUES` valores. Las de §4.3 de R3 siguen en
  `totalsByLevels`.

### 4.4 Service (`report/service.ts`)

```ts
type ScopePeople =
  | { readonly kind: "everyone" }
  /** Parte B. Con `timeEntry.others.view` y el filtro de personas: solo estas (D-R4-4). */
  | { readonly kind: "chosen"; readonly userIds: readonly string[] }
  | { readonly kind: "self"; readonly userId: string };

export type ReportRequest = {
  readonly range: ReportRange | null;
  readonly groupBy: ReportGroupBy | null;
  readonly subgroups: readonly ReportGroupBy[];
  /** Los de `reportFiltersOf`; `NO_REPORT_FILTERS` sin filtros. */
  readonly filters: ReportFilters;
};
```

`getReportState` conserva su firma. En este orden:

1. **`report.view`**, **`scopeOf`**, **el período** y **la invariante de los
   niveles**, sin cambios.
2. **La invariante de los filtros**, antes de cualquier lectura y antes de abrir
   la transacción: cada lista sin repetir y con hasta
   `REPORT_MAX_FILTER_VALUES` valores, con `withoutProject` contado en los de
   proyecto; si no, `RangeError`. La página los recibe de `reportFiltersOf`,
   que ya lo garantiza; es para otro llamador (R6).
3. **Los tramos**, como en R3.
4. **En la transacción** (`repeatable read`, `read only`), primero los
   catálogos:
   - `getProjectFilterCatalog(tx, actor)`;
   - (B) `listWorkspacePeople(tx, actor)` **solo si `scope.people.kind` es
     `everyone`**; si no, no se llama.
5. **Los filtros efectivos** (D-R4-5): cada lista de la URL cruzada con su
   catálogo, en el orden del catálogo y con sus ids, comparados tal cual;
   `withoutProject` pasa igual. (B) Con un alcance `self`, `people` es vacío
   sin mirar la URL.
6. **El alcance de la lectura** (B): con personas efectivas,
   `narrowedTo(scope, people)`; si no, el de `scopeOf`.
7. **Las lecturas**, como en R3, con el alcance del paso 6 y
   `filter: { projectIds, withoutProject, clientIds }` en cada `ReportLevelRead`
   y en el `ReportEntryRead` de `entryTotals` (si el primer nivel es la
   etiqueta). La suma del primer nivel sigue siendo el total en el resto
   (D-R2a-7): con filtros, cada entrada filtrada sigue estando en un grupo.
8. **El estado**: el de R3, con `filters` (los efectivos) y `filterOptions`:
   clientes y proyectos del catálogo con el color estrechado (`paletteKeyOf`);
   (B) personas con `displayNameOf` y `inactive` por el estado, en el orden de
   `compareNames`, o `null` si no se leyeron. `scope` es `self` con `self` y
   `everyone` con las otras dos.

- **`narrowedTo` es privada** y lanza si el alcance no es `everyone`, si la
  lista está vacía o si pasa el tope. Es, con `scopeOf`, lo único que construye
  un `Scope`.
- **Ninguna decisión de acceso cambia**: el service no compara roles; lo que
  separa a un member de un admin es el `kind` que dejó `scopeOf`.

### 4.5 Las funciones de los dueños

**`project/service.ts`** (A):

```ts
/**
 * RP-25, RP-29: lo que ofrecen los filtros de cliente y de proyecto de un
 * reporte. Todos los clientes del workspace y los proyectos que `project.view`
 * deja ver, archivados incluidos y marcados, en el orden de `compareNames`.
 * Solo lee, con la transacción de quien la llama (ADR 0010).
 */
export async function getProjectFilterCatalog(
  tx: Transaction,
  actor: Actor,
): Promise<ProjectFilterCatalog>;
```

```ts
// project/schema.ts
export type FilterClientView = ClientView & { readonly archived: boolean };
export type FilterProjectView = ProjectRef & {
  readonly client: ClientView | null;
  readonly archived: boolean;
};
export type ProjectFilterCatalog = {
  readonly clients: readonly FilterClientView[];
  readonly projects: readonly FilterProjectView[];
};
```

- **`projectRepository.listAllProjects(tx, workspaceId, userId)`**, nueva: los
  proyectos del workspace, archivados incluidos, con la fila de miembro de
  `userId` (`viewerOf`, `withViewer`), como `listActiveProjects` sin la
  condición de archivado. Los clientes, con `listClients`.
- **Los clientes no tienen regla de acceso**, como en `readCatalog`.
- `readCatalog`, `getProjectCatalog` y `getTrackingCatalog` no cambian.

**`workspace/service.ts`** (B):

```ts
/** Una persona del workspace con su estado, para un catálogo de otra pantalla. */
export type WorkspacePerson = {
  readonly userId: string;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  /** `user_preference.display_name`, o `null`: el nombre lo arma `displayNameOf` (ADR 0021). */
  readonly displayName: string | null;
  readonly status: "active" | "inactive";
};

/**
 * RP-62, RP-64: las personas del workspace, activas e inactivas; las invitadas
 * no están, por su estado. Vacía sin `team.view`. Sin orden. Solo lee, con la
 * transacción de quien la llama (ADR 0010).
 */
export async function listWorkspacePeople(
  tx: Transaction,
  actor: Actor,
): Promise<readonly WorkspacePerson[]>;
```

- **`workspaceRepository.listPeople(tx, workspaceId)`**, nueva: `membership`
  con `"user"` (interno) y `user_preference` (`left join`), donde
  `membership.status in ('active', 'inactive')` con `inArray` y el workspace.
  Lo que solo se muestra —los dos nombres— por `join` (ADR 0010).
- **El estado se estrecha** en el service: una fila con otro estado lanza (la
  consulta no la deja pasar).
- **Las dos funciones llaman a sus repositories por el objeto**:
  `projectRepository.listClients(…)`, `projectRepository.listAllProjects(…)` y
  `workspaceRepository.listPeople(…)`, sin desestructurar los métodos ni
  guardarlos en una variable. Los espías de §8 reemplazan la propiedad del
  objeto; una referencia tomada antes no la ve.
- **`filterOptions.people` copia `id`, `name` e `inactive`, y nada más**: el
  service del reporte arma cada opción campo por campo, sin esparcir la fila.
  Si `WorkspacePerson` suma un campo (el correo, el rol), no llega al cliente
  sin un cambio en el reporte. Lo mismo para las opciones de clientes y
  proyectos con `ProjectFilterCatalog`.
- **R8 lee sus personas en un módulo propio, `src/modules/team/`**, que importa
  `displayNameOf` de `profile`, y no toca `workspace`. El catálogo del filtro
  queda en `workspace`, como dice el ADR 0021 de las dependencias de `report`:
  los dos slices no comparten archivos (§10, pregunta 2).

### 4.6 Costo

- **Parte A**: dos sentencias más por pedido, los clientes y los proyectos, en
  la misma transacción; las de los niveles y el total, las de R3 con el filtro.
- **Parte B**: una más, las personas, solo con `timeEntry.others.view`.
- **Lo que viaja**: los catálogos en cada página, como props de los
  `FilterPicker`, y los filtros en cada `href` y en cada prop de cliente que
  arma un enlace. §6.4 mide las dos cosas.

## 5. Pantalla

### 5.1 La barra (`report-toolbar.tsx`)

- **«Filtrar por»** después de «Subagrupar por» (D-R4-8): `role="group"`
  nombrado por su rótulo visible, con «Clientes» y «Proyectos» (A) y, antes de
  ellos, «Personas» (B) solo si `filterOptions.people` no es `null`.
- **Todos los enlaces llevan `filters`** (D-R4-10): las flechas, «Esta semana»,
  `GroupByLink`; `RangePicker` y `SubgroupPicker` reciben `filters` y lo pasan a
  sus enlaces y a `applySelection(selection, grouping, filters)`.

### 5.2 El modelo de un filtro (`components/filter-model.ts`, nuevo, A)

```ts
export type FilterKind = "people" | "clients" | "projects"; // "people", parte B

/** Una opción del panel: la clave es el id, o `sin-proyecto`. */
export type FilterOption = {
  readonly key: string;
  readonly name: string;
  /** El cliente de un proyecto, en gris; `null` en el resto. */
  readonly detail: string | null;
  readonly color: PaletteKey | null;
  /** Archivado o inactiva: va en el grupo de aparte (D-R4-8). */
  readonly retired: boolean;
};

/** Las opciones de un filtro, del estado; en proyectos, «Sin proyecto» primero. */
export function filterOptionsOf(
  options: ReportReadyState["filterOptions"],
  kind: FilterKind,
): readonly FilterOption[];

/** Lo elegido de un filtro, como claves; en proyectos, `sin-proyecto` si está. */
export function chosenKeys(filters: ReportFilters, kind: FilterKind): readonly string[];

/** Los filtros con `keys` como lo elegido en `kind`, en el orden de `options`. */
export function withChosen(
  filters: ReportFilters,
  kind: FilterKind,
  keys: readonly string[],
  options: readonly FilterOption[],
): ReportFilters;

/**
 * Lo que el panel muestra con la búsqueda: las vigentes y las de aparte, cada
 * una en su orden. «Sin proyecto» no se filtra.
 */
export function visibleOptions(
  options: readonly FilterOption[],
  query: string,
): {
  readonly current: readonly FilterOption[];
  readonly retired: readonly FilterOption[];
};

/** «todos», el nombre de la única o la cantidad (D-R4-8). */
export function filterSummary(
  kind: FilterKind,
  keys: readonly string[],
  options: readonly FilterOption[],
): string;

/**
 * «Aplicar»: con más de `REPORT_MAX_FILTER_VALUES` claves —`sin-proyecto` es
 * una—, sigue abierto con el mensaje; si no, el `href`.
 */
export function applyFilter(
  location: {
    readonly range: ReportRange;
    readonly grouping: ReportGrouping;
    readonly filters: ReportFilters;
  },
  kind: FilterKind,
  keys: readonly string[],
  options: readonly FilterOption[],
): ApplyEffect;
```

`ApplyEffect` es el de `range-picker-model.ts`.

### 5.3 El control (`components/filter-picker.tsx`, nuevo, A)

- **`FilterPicker`** (cliente): el botón con «{Filtro}: {resumen}», que es su
  nombre accesible, y un `Popover` con `FilterPanel`. Guarda lo elegido, la
  búsqueda y el mensaje; al abrir, los vuelve a lo del estado. «Aplicar» cierra
  y navega con `router.push`, como `RangePicker`. **Recibe solo** el rango, la
  agrupación, los filtros, su `kind` y sus opciones.
- **`FilterPanel`**, exportado y sin popover: el buscador (`Input` con
  `type="search"` y su `aria-label`, con el foco al montar), el grupo de las
  vigentes nombrado por el filtro, el de aparte nombrado «Archivados» o
  «Inactivas» con los nombres tachados en personas, «Nada coincide con la
  búsqueda.» si los dos quedan vacíos, la región de alerta siempre montada y
  «Aplicar». Recibe lo elegido, la búsqueda y el mensaje como props.
- Cada opción: `Checkbox` con su `label`; un proyecto, con el punto de color y
  el cliente en gris; «Sin proyecto» en gris.

### 5.4 La URL (`report-href.ts`, A)

`reportHref({ range, groupBy, subgroups = [], filters })`, con `filters`
obligatorio, escribe después de `subagrupar` las listas no vacías, ordenadas
(D-R4-2): `personas` (B), `clientes`, `proyectos` (con `sin-proyecto` al final).
Sin filtros, la URL es la de R3.

### 5.5 La tabla (`report-view.tsx`, A)

- **El segundo vacío** (D-R4-7): sin grupos y con `hasReportFilters(filters)`,
  la fila de dos columnas dice «Ninguna entrada coincide con los filtros» y
  lleva «Quitar filtros», un enlace a
  `reportHref({ range, groupBy, subgroups, filters: NO_REPORT_FILTERS })`. Sin
  filtros, el de R2a.
- **El `key` de `ReportTree`** suma los filtros (D-R4-10).

### 5.6 La página (`page.tsx`, A)

`filters: reportFiltersOf(params)`. La página no decide quién puede usar cada
filtro (D-R4-4).

### 5.7 Textos (`labels.ts`)

| Clave             | Texto                                                                                     | Parte |
| ----------------- | ----------------------------------------------------------------------------------------- | ----- |
| `filterBy`        | «Filtrar por»                                                                             | A     |
| `filterNames`     | `{ people: «Personas», clients: «Clientes», projects: «Proyectos» }`                      | A (B) |
| `filterAll`       | `{ people: «todas», clients: «todos», projects: «todos» }`                                | A (B) |
| `filterChoice`    | `(filtro, resumen) =>` «{filtro}: {resumen}»                                              | A     |
| `filterSearch`    | `{ people: «Buscar personas», clients: «Buscar clientes», projects: «Buscar proyectos» }` | A (B) |
| `filterNoMatches` | «Nada coincide con la búsqueda.»                                                          | A     |
| `archivedOptions` | «Archivados»                                                                              | A     |
| `inactiveOptions` | «Inactivas»                                                                               | B     |
| `filterTooMany`   | `(tope) =>` «Elegí hasta {tope}.»                                                         | A     |
| `emptyFiltered`   | «Ninguna entrada coincide con los filtros»                                                | A     |
| `clearFilters`    | «Quitar filtros»                                                                          | A     |

«Sin proyecto» es `projectLabels.noProject`, el mismo rótulo de la fila.
«Aplicar» es `reportLabels.apply`.

## 6. Volumen y peso

Lo hace `backend-dev` con el repository terminado, con el procedimiento de §6
de R2a, en `postgres:18-alpine`, en una base propia que se borra al terminar.
La sentencia es el texto de `.toSQL()`. El informe lleva, por consulta, el plan
(nodos e índices) y las cinco medidas, y el team-lead lo copia al documento de
revisiones.

### 6.1 `seed.sql`

- **A**: sin cambios: 6 clientes y 24 proyectos, 4 archivados, alcanzan.
- **B**: **una membresía `invited` sin entradas**, la persona 31, para que el
  plan de Q24 tenga a quién dejar afuera. El comentario de la cabecera la
  cuenta. Las entradas no cambian, así que Q1 a Q22 no cambian.

### 6.2 Las consultas de la parte A

| Consulta | Qué                                                                                            | Presupuesto (mediana) |
| -------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| Q17      | `[person]`, `everyone`, 366 días, tres proyectos                                               | ≤ 150 ms              |
| Q18      | `[project]`, `everyone`, 366 días, solo «Sin proyecto»                                         | ≤ 150 ms              |
| Q19      | `[person]`, `everyone`, 366 días, dos clientes                                                 | ≤ 150 ms              |
| Q20      | `entryTotals`, `everyone`, 366 días, tres proyectos y dos clientes                             | ≤ 150 ms              |
| Q21      | `[person, project, date]`, `everyone`, 366 días, tres proyectos, con `limit` de su presupuesto | ≤ 250 ms              |
| Q22      | `listClients` y `listAllProjects` del catálogo, cada una                                       | ≤ 10 ms               |

**El pedido entero** Persona → Proyecto → Fecha de todo el equipo en 366 días
con tres proyectos, en una transacción, con los dos catálogos: **≤ 500 ms**. El
informe dice cuántas filas tuvo cada nivel y en cuál se cortó, y si Q17 y Q21
usan el índice parcial de proyecto.

### 6.3 Las consultas de la parte B

| Consulta | Qué                                              | Presupuesto (mediana) |
| -------- | ------------------------------------------------ | --------------------- |
| Q23      | `[person]`, `chosen` con tres personas, 366 días | ≤ 60 ms               |
| Q24      | `listPeople`                                     | ≤ 10 ms               |

**El pedido entero** Persona → Proyecto de tres personas en 366 días, con los
tres catálogos: **≤ 250 ms**.

### 6.4 El peso de la página (partes A y B)

Lo hace `frontend-dev`, no es un test, con el procedimiento de §6.4 de R3: una
página temporal fuera de todo commit, servida con `next build` y `next start`,
con dos mediciones:

1. **Catálogos grandes** (A, paso 5): la barra y la vista con el estado de 3000
   grupos de R3b más **catálogos de 1000 proyectos y 200 clientes**, con ids de
   36 caracteres y nombres de 30, sin filtros.
2. **La URL llena** (B, paso 9, siempre): el mismo estado con **50 personas, 50
   clientes y 50 proyectos elegidos** (los ids de personas de 32 caracteres,
   como los de Better Auth). Cada `href` de la barra y cada prop de cliente que
   arma un enlace repite las tres listas, unos 5,6 KB, en unos 30 lugares. El
   informe dice cuántas veces aparecen en el payload y en el HTML. **Si R4a se
   mergea sola**, el paso 5 hace antes una versión con dos listas (50 clientes
   y 50 proyectos), para que R4a no llegue a `main` sin esa medida.

Para las dos:

- **El payload RSC**: **≤ 1 MB**.
- **El HTML de la primera carga**: **≤ 1,5 MB**.

La mediana de cinco corridas va en el informe.

### 6.5 Si algo pasa el presupuesto

Vale §6.5 de R3: el slice se detiene y vuelve a `architect`. Las alternativas,
en este orden: para el filtro de proyecto, el índice parcial ya existente con
`started_at` sumado, solo con una medición que lo justifique; para el peso de
los catálogos, que el de proyectos viaje sin el cliente y el color; para el de
la URL llena, que los enlaces de la barra pasen las listas una sola vez (un
componente de cliente que arma los `href` con lo que recibe) o un tope más bajo.

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea; la parte va entre
paréntesis cuando el archivo es de una sola. **El team-lead crea y migra la base
de test de cada agente que corre integración, y la de e2e, antes de lanzarlo, y
las borra al terminar**, como en R8; cada agente usa solo la suya. Las corridas
van en primer plano.

### backend-dev

```
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/repository.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/scope.test-d.ts
/home/maxi/program/clock/src/modules/project/schema.ts                       (A)
/home/maxi/program/clock/src/modules/project/service.ts                      (A)
/home/maxi/program/clock/src/modules/project/repository.ts                   (A)
/home/maxi/program/clock/src/modules/project/service.integration.test.ts     (A)
/home/maxi/program/clock/src/modules/workspace/service.ts                    (B)
/home/maxi/program/clock/src/modules/workspace/repository.ts                 (B)
/home/maxi/program/clock/src/modules/workspace/service.integration.test.ts   (B)
/home/maxi/program/clock/src/test/factories.ts                               (B: `seedUser(email?, id?)` y `seedMember(…, status?, id?)`)
/home/maxi/program/clock/scripts/report-volume/seed.sql                      (B)
/home/maxi/program/clock/scripts/report-volume/explain.sql
```

Más las ediciones mecánicas de los pasos 1 y 6 en archivos de otros dueños
(§1, «Consecuencias»).

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/reportes/page.tsx
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/report-href.ts
/home/maxi/program/clock/src/modules/report/components/report-href.test.ts
/home/maxi/program/clock/src/modules/report/components/report-toolbar.tsx
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.tsx
/home/maxi/program/clock/src/modules/report/components/report-view.test.tsx
/home/maxi/program/clock/src/modules/report/components/range-picker.tsx           (A)
/home/maxi/program/clock/src/modules/report/components/range-picker.test.tsx      (A)
/home/maxi/program/clock/src/modules/report/components/range-picker-model.ts      (A)
/home/maxi/program/clock/src/modules/report/components/subgroup-picker.tsx        (A)
/home/maxi/program/clock/src/modules/report/components/subgroup-picker.test.tsx   (A)
/home/maxi/program/clock/src/modules/report/components/filter-model.ts            (nuevo)
/home/maxi/program/clock/src/modules/report/components/filter-model.test.ts       (nuevo)
/home/maxi/program/clock/src/modules/report/components/filter-picker.tsx          (nuevo)
/home/maxi/program/clock/src/modules/report/components/filter-picker.test.tsx     (nuevo)
```

Los nombres de los archivos nuevos son orientativos salvo el del modelo, que
citan los tests.

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Suma los casos de los criterios 12 (A) y 19 (B) contra las firmas publicadas,
sin mirar la implementación de `matchesFilter` ni de `narrowedTo`, y corre las
tablas de mutantes de §8.1 en una copia propia, con su base. En el paso 7
renombra y acota los dos tests de `personas` de §1.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                  (13 y 14 en A; 15 y 16 en B)
/home/maxi/program/clock/e2e/reports-page.ts
/home/maxi/program/clock/e2e/database.ts
```

- `database.ts`: `projectIdOf(name)` y `clientIdOf(name)` (A) y
  `userIdOf(email)` (B), que leen el id del workspace de los e2e y cortan si no
  hay exactamente una fila, como `updateOneRow`.
- `reports-page.ts`: `reportsUrl` y `reportsUrlOf` reciben filtros opcionales
  (`{ people?, clients?, projects? }`, con `sin-proyecto` en `projects`) y
  `reportsUrlOf` **afirma que no hay `personas`, `clientes` ni `proyectos`
  cuando no se piden**; `filterButton(page, filtro)` por su nombre exacto
  (`filterChoice`), `filterPanel`, `filterSearch`, `filterOption(page, nombre)`
  y `filterApply`, buscados dentro del popover; `EMPTY_FILTERED` y
  `CLEAR_FILTERS`. **No se renombra ningún export existente**: el e2e de R8
  (`e2e/team.spec.ts`) importa `REPORTS_PATH`, `SCOPE_SELF` y `SCOPE_EVERYONE`.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

`parity-analyst` no escribe archivos: entrega el texto y **lo aplica el
team-lead**, antes del merge de cada parte, con su corrección fechada y una
sección «12. Núcleo, R4»:

- **RP-25** (A, B): personas, cliente y proyecto; o dentro de un filtro, y entre
  filtros; los parámetros y su forma; el control con buscador y «Aplicar»; el
  tope de 50, con «Sin proyecto» contado.
- **RP-26** (A): «Sin proyecto» como opción del filtro de proyecto; el filtro de
  cliente deja afuera lo que no tiene proyecto.
- **RP-29** (A): los archivados en los catálogos, aparte, y que se filtran.
- **RP-31** (B): dos personas con el mismo nombre son dos casillas iguales,
  como sus filas.
- **RP-32** (A, B): cada parámetro se valida por su lado y se descarta entero;
  los enlaces conservan los filtros; un member con `personas=…` ve lo propio y
  el parámetro se pierde en la navegación siguiente.
- **RP-33** (A): el segundo vacío, con «Quitar filtros»; con filtros, aunque el
  período no tenga horas.
- **RP-34** (A, B): un id que no está en el catálogo se ignora él solo y
  desaparece de la URL al navegar.
- **RP-62** (B): las inactivas aparte y tachadas, solo para quien ve horas de
  otros.
- **RP-64** (B): las invitadas no están en el filtro, por su estado.
- **§12.4, divergencias que el reviewer no marca**: la línea del alcance no dice
  el filtro; el segundo vacío con un período sin horas; un proyecto privado
  propio que no se puede elegir en el filtro (§9).

Si el slice se parte, la sección de R4b registra lo de la parte B.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/server/time/`,
`src/components/`, `src/lib/`, `src/modules/time-entry/`, `profile/`, `team/`
(de R8), `report/period.ts`, `report/components/report-tree*`,
`group-heading.tsx`, `grouping-model.ts`, los ADR. El mapa y el estado los
actualiza el team-lead.

### Orden

**Parte A — cliente y proyecto.** Cada commit compila y pasa lint, typecheck y
`npm run test:all` sin nada de la parte B: ni `people`, ni `chosen`, ni
`personas`.

1. **Primer commit de `backend-dev`**: en `schema.ts`, las formas de la A
   (constantes, `ReportFilters` sin `people`, `NO_REPORT_FILTERS`,
   `hasReportFilters`, los dos parámetros, `reportFiltersOf`, `filters` y
   `filterOptions` sin `people`) con `schema.test.ts`; en `repository.ts`, los
   tipos de §4.3 y la firma nueva de `entryTotals`, que **lanzan si el filtro no
   está vacío**; `ReportRequest.filters` obligatorio y el service **lanza si
   `hasReportFilters`** hasta el paso 3, para que ningún commit intermedio
   devuelva horas sin filtrar con un filtro pedido; `filterOptions` vacío; los
   tipos de `project/schema.ts` y la firma de `getProjectFilterCatalog`.
   **Ediciones mecánicas** fuera del reparto, para que el commit compile y pase:
   - `page.tsx`: `filters: NO_REPORT_FILTERS`;
   - los fixtures de `ReportReadyState` de los tests de componentes: `filters`
     y `filterOptions`, con una constante común por archivo;
   - `scope.integration.test.ts`: `filters: NO_REPORT_FILTERS` en los
     constructores de pedidos y en los dos lados de los `toStrictEqual`
     (`:835`, `:993`), y `filter: NO_ENTRY_FILTER` en las llamadas directas.

   **Avisa a `frontend-dev`, `test-engineer` y `e2e-tester`**: desde acá las
   formas de la parte A son las finales.

2. **Los otros tres arrancan con el paso 1.** `frontend-dev`: `labels.ts`,
   `reportHref` con `filters` obligatorio y todos los enlaces, el modelo, el
   control, «Filtrar por», el segundo vacío y `page.tsx`. `test-engineer`: los
   casos del criterio 12, sin commitear hasta el paso 3. `e2e-tester`: los
   helpers y los recorridos 13 y 14, confirmando que fallan por la
   funcionalidad y no por el arnés.
3. **`backend-dev`**: `listAllProjects` y `getProjectFilterCatalog` con su test;
   `matchesFilter`, las guardas y el service con los catálogos, los filtros
   efectivos y el estado; quita los `throw` del paso 1; los criterios 3 a 11.
4. **`test-engineer`, después del paso 3**: commitea los casos del criterio 12.
5. **`backend-dev`**: la medición de §6.2; **`frontend-dev`**: la primera
   medición de §6.4 y, **solo si R4a se mergea sola**, la versión con dos
   listas (clientes y proyectos) de la segunda.

**Parte B — personas**, en commits propios, después de todos los de la A.

6. **`backend-dev`**: `people` en `ReportFilters`, `filters` y `filterOptions`;
   `reportPeopleParams` y `reportFiltersOf` con `personas`, con sus tests;
   `chosen` en `ScopePeople` y en `inScope`; `narrowedTo`; los tipos y la firma
   de `listWorkspacePeople`; `seedUser(email?, id?)` y `seedMember(…, status?,
id?)` en `factories.ts`; el service **lanza si `people` no está vacío y el
   alcance es `everyone`** hasta el paso 8 (con `self` ya lo descarta, que es lo
   final). **Edición mecánica** en el mismo commit: `people` en la constante
   común de los fixtures (`filterOptions.people: null`). **Avisa** a los mismos
   tres.
7. **`frontend-dev`**: «Personas» y el grupo «Inactivas»; **`e2e-tester`**: los
   recorridos 15 y 16; **`test-engineer`**: los casos del criterio 19 y los dos
   tests de `personas` renombrados y acotados (§1), que se commitean después
   del paso 8.
8. **`backend-dev`**: `listPeople`, `listWorkspacePeople` y su test; el filtro
   de personas en el service; los criterios 17, 18 y 20.
9. **`backend-dev`**: `seed.sql` y la medición de §6.3; **`frontend-dev`**:
   **siempre**, la segunda medición de §6.4 con las tres listas.

**Cierre, para cada parte.**

10. **`test-engineer`**: los mutantes de §8.1 de la parte; el texto de
    `parity-analyst`, aplicado por el team-lead, antes del merge.
11. **Revisión de seguridad, antes del merge.** A: que los filtros se suman a
    `inScope` y nunca lo reemplazan; que ningún id de la URL llega a la base
    sin cruzarse con su catálogo; que un member con `clientes` o `proyectos`
    armados a mano no ve nada ajeno en ningún nivel ni en el total; que los
    catálogos no se leen sin `report.view`; que no hay un arreglo nuevo como
    parámetro. B, además: que `chosen` solo sale de `everyone`; que un member,
    un `project_manager` o un `team_manager` con `personas=…` (ids de su
    workspace, de otro, de una invitada) ve lo propio y no recibe el catálogo
    de personas; que `chosen` conserva el workspace; que `filterOptions.people`
    no lleva más que `id`, `name` e `inactive`.

**Si el slice se parte** (§10, pregunta 1): la parte A se cierra con los pasos
10 y 11 sobre ella y se mergea como R4a; la B sigue como R4b desde el paso 6,
con este mismo contrato y su propio cierre.

## 8. Criterios de aceptación

Son de la **parte A** los criterios 1 a 15; de la **parte B**, del 16 al 23; el
24 vale para las dos.

**Cómo se espía una lectura de otro módulo.** `vi.spyOn` no redefine una
función exportada suelta de un módulo ESM, así que los criterios que miran los
catálogos espían los métodos de los repositories, que son objetos:
`projectRepository.listClients`, `projectRepository.listAllProjects` y
`workspaceRepository.listPeople`, y afirman que reciben **el mismo `Executor`**
que `reportRepository.totalsByLevels`. Eso afirma la foto única y mata a la vez
«`db` en lugar del `tx`». Funciona porque los services los llaman por el objeto
(§4.5). `vi.mock(…, importOriginal)`, como `scope.integration.test.ts:46`, queda
solo si hace falta espiar una función del service.

1. **Los esquemas** (A, unidad) — `reportClientParams` pasa con un uuid y con
   dos; `reportProjectParams`, con un uuid, con `sin-proyecto` solo, con los
   dos y con **49 uuid y `sin-proyecto`**. No pasan: un uuid con una mayúscula,
   `sin-proyecto` en `clientes`, un valor vacío, `a,`, `,a`, `a,,b`, un valor
   repetido, 51 valores, **50 uuid y `sin-proyecto`**, un valor que no es uuid
   ni el parámetro repetido. `reportFiltersOf` con `clientes` inválido y
   `proyectos` válido devuelve los proyectos y ningún cliente, y al revés;
   ignora `personas` (A). `reportReadyState` admite `filters` y
   `filterOptions`, y rechaza 51 proyectos y 50 con `withoutProject` en
   `filters`.
2. **La URL** (A, unidad) — `reportHref` sin filtros da la de R3; con clientes y
   proyectos los escribe después de `subagrupar`, cada lista ordenada y
   `sin-proyecto` al final, sin listas vacías; leída con `reportFiltersOf`
   devuelve los mismos filtros.
3. **Lo de R2a a R3b se conserva** (A, integración) — los tests existentes de
   `service.integration.test.ts` y `scope.integration.test.ts` pasan con los
   mismos valores, sin filtros.
4. **El filtro de proyecto** (A, integración, service) — P1 de C1, P2 de C2, P3
   sin cliente y archivado; entradas en los tres y sin proyecto, de dos
   personas. `[P1]`: por persona, cada una con lo suyo en P1; por proyecto, una
   fila. `withoutProject`: por proyecto, solo «Sin proyecto»; por cliente, solo
   «Sin cliente» con esas entradas. `[P1]` con `withoutProject`: las dos.
   `[P3]`: cuenta (RP-29). El total y el facturable son los de lo filtrado; por
   etiqueta, `entryTotals` da el total filtrado.
5. **El filtro de cliente** (A, integración) — `[C1]`: P1 y un proyecto
   archivado de C1; ni lo sin proyecto ni P3. Un cliente archivado se filtra.
   Agrupando por cliente con `[C1]`: una fila. Con `[C1]` y `[P2]`: `groups`
   vacío, `filters` con los dos y los totales en cero.
6. **En todos los niveles** (A, integración) — persona → proyecto con `[P1, P2]`:
   los hijos son solo esos y suman lo de su padre; etiqueta → proyecto con
   `[P1]`: los hijos de cada etiqueta son de P1 y el total es el filtrado. **El
   tope cuenta lo filtrado**: el fixture del criterio 18 de R3 con la décima
   etiqueta en una entrada de otro proyecto, filtrado al proyecto de las 300:
   3000 filas, `levelsShown: 2`.
7. **Lo que no existe se ignora** (A, integración, RP-34) — un uuid que no
   existe, un proyecto y un cliente de otro workspace, un proyecto privado que
   un member no ve y uno borrado: cada uno se ignora y `filters` no lo lleva;
   junto a uno que existe, se aplica el que existe; si todos se ignoran,
   `filters` queda en `NO_REPORT_FILTERS` y el reporte es el de sin filtros.
   Los ids de `filters` son los del catálogo.
8. **El catálogo de proyectos** (A, integración, `project/service.integration.test.ts`)
   — `getProjectFilterCatalog`: todos los clientes, archivados incluidos y
   marcados; los proyectos con `project.view`, archivados incluidos y marcados,
   con su cliente y su color; un privado del que el member no es miembro no
   está para el member y sí para el admin; nada de otro workspace; en el orden
   de `compareNames`; `listClients` y `listAllProjects` (espiados) reciben el
   `tx` que se le pasa, y no se abre otra transacción. **Además,
   `projectRepository.listAllProjects` llamado directo** con un proyecto de otro
   workspace en la base no lo trae: a nivel de service ese mutante sobrevive,
   porque `can()` corta por el workspace del recurso
   (`permissions/index.ts:184`).
9. **Una sola foto y nada sin permiso** (A, integración) — con filtros,
   `projectRepository.listClients`, `projectRepository.listAllProjects`,
   `totalsByLevels` y `entryTotals` (espiados) reciben el mismo `Executor`, el
   de la transacción de solo lectura `repeatable read`, y no es `db`; con una
   membresía `inactive` o `invited`, `forbidden` sin llamar a ninguno ni abrir
   la transacción.
10. **Las guardas** (A, integración) — `totalsByLevels` y `entryTotals` con 51
    proyectos, con 50 y `withoutProject` o con 51 clientes lanzan `RangeError`
    sin consultar, con el alcance tomado de una lectura real; `getReportState`
    con un filtro repetido, de 51, o de 50 proyectos y `withoutProject` lanza
    `RangeError` sin abrir la transacción.
11. **El estado** (A, integración) — `filterOptions.clients` y
    `filterOptions.projects` son los del catálogo, con el color estrechado y
    solo los campos del esquema; `filters` en el orden del catálogo.
12. **El alcance** (A, `scope.integration.test.ts`) — el fixture suma un cliente
    con P en A y uno en B. Con `clientes` y `proyectos` de A: owner y admin ven
    lo de todos en A filtrado; `project_manager`, `team_manager` y `member` ven
    solo lo propio filtrado, también con un pedido que arma un admin y se lee
    con `reportFiltersOf` desde la URL; los ids de B se ignoran en A; el owner
    de B con ids de A no ve nada de A. Por persona, por proyecto y por
    etiqueta, en el total y en un árbol de dos niveles.
13. **La pantalla** (A, unidad) —
    - `report-href.test.ts`: el criterio 2.
    - `filter-model.test.ts`: «Sin proyecto» primero y fuera de la búsqueda; la
      búsqueda sin mayúsculas ni acentos; vigentes y archivados separados, cada
      uno en orden; `filterSummary` con ninguno, uno, «Sin proyecto» solo y
      tres; `applyFilter` con 50 navega con las listas ordenadas y con 51 sigue
      abierto con «Elegí hasta 50.»; **con 49 proyectos y «Sin proyecto»
      navega, y con 50 y «Sin proyecto» sigue abierto con el mensaje**; sin
      nada elegido, el `href` sin ese filtro y con los otros.
    - `filter-picker.test.tsx`, sobre `FilterPanel`: el buscador con su nombre,
      el grupo de las vigentes y el de «Archivados», las casillas tildadas según
      lo elegido, el cliente en gris, «Nada coincide con la búsqueda.» y la
      región de alerta.
    - `report-toolbar.test.tsx`: tres grupos con rótulo, «Filtrar por» después
      de «Subagrupar por»; «Clientes: todos» y «Proyectos: todos» sin filtros y
      «Proyectos: 2» con dos; sin «Personas»; las flechas, «Esta semana» y
      «Agrupar por» con los filtros conservados. `range-picker.test.tsx`: los
      atajos y `applySelection` los conservan. `subgroup-picker.test.tsx`: los
      enlaces de `SubgroupPanel` también.
    - `report-view.test.tsx`: sin grupos y con filtros, «Ninguna entrada coincide
      con los filtros» y «Quitar filtros» con el rango, la agrupación y los
      subniveles y sin filtros; sin filtros, el vacío de R2a sin «Quitar
      filtros».
14. **El rendimiento y el peso** (A, §6.2 y §6.4) — Q17 a Q22 y el pedido entero
    dentro del presupuesto; el payload RSC y el HTML de la primera medición
    dentro del suyo y, si R4a se mergea sola, también los de la versión con dos
    listas.
15. **Cliente y proyecto de punta a punta** (A) — los recorridos 13 y 14 de §8.2.
16. **Los esquemas** (B, unidad) — `reportPeopleParams` pasa con un id de 32
    alfanuméricos con mayúsculas y lo devuelve igual, y con un uuid; no pasa con
    un correo, un espacio, 65 caracteres, un valor vacío, repetido, 51 valores
    ni el parámetro repetido. `reportFiltersOf` lee `personas` por su lado.
17. **El catálogo de personas** (B, integración,
    `workspace/service.integration.test.ts`) — owner, un activo sin horas, un
    inactivo con horas, una invitada **con horas** (sembradas por base) y una
    persona de otro workspace: están las tres de arriba con su estado, los dos
    nombres sin `displayNameOf`; ni la invitada ni la de otro workspace. Con un
    actor no activo, vacía. `workspaceRepository.listPeople` (espiado) recibe
    el `tx` que se le pasa.
18. **El filtro de personas** (B, integración, service) — **el inactivo lleva un
    id de 32 alfanuméricos con mayúsculas**, sembrado con
    `seedMember(workspaceId, "member", "inactive", id)`, como los de Better
    Auth. Un admin con `[activo, inactivo]`: por persona, las dos filas, la
    inactiva marcada; por proyecto, la suma de las dos; por etiqueta,
    `entryTotals` de las dos; con `[P1]` además, las dos dentro de P1. El id del
    inactivo en minúsculas se ignora. Con el id de la invitada, de otra persona
    de otro workspace o uno que no existe: ignorado; si todos se ignoran, todas
    las personas. `filterOptions.people` con los nombres de `displayNameOf`,
    `inactive`, solo `id`, `name` e `inactive`, y en el orden de
    `compareNames`; `scope` sigue en `everyone`;
    `workspaceRepository.listPeople` (espiado) recibe el mismo `Executor` que
    `totalsByLevels`.
19. **El alcance** (B, `scope.integration.test.ts`) — `member`,
    `project_manager` y `team_manager` con `personas` de otras personas de A (y
    con la propia): ven lo propio, `filters.people` vacío,
    `filterOptions.people` en `null` y `workspaceRepository.listPeople`
    (espiado) sin llamar; owner y admin con `[member]` ven solo lo del member en
    todos los niveles y en el total; una persona que es miembro de A y de B con
    entradas en los dos, elegida por el admin de A, trae solo lo de A; el owner
    de B con ids de A no ve nada de A. También desde la URL con
    `reportFiltersOf`.
20. **El tipo y la invariante** (B) — `scope.test-d.ts`: un literal con
    `people: { kind: "chosen", userIds: [...] }` no es un `ReportScope`.
    Integración: con un alcance `self`, `narrowedTo` no se llama aunque la URL
    traiga personas (espía sobre `totalsByLevels`: su alcance es `self`).
21. **La pantalla** (B, unidad) — `report-toolbar.test.tsx`: «Personas: todas»
    antes de «Clientes» solo con `filterOptions.people`, «Personas: Nombre» con
    una; los enlaces conservan `personas`. `filter-picker.test.tsx`: el grupo
    «Inactivas» con los nombres tachados. `report-href.test.ts`: `personas`
    antes de `clientes`, en orden, con un id con mayúsculas sin cambiar.
22. **El rendimiento y el peso** (B, §6.3 y §6.4) — Q23, Q24 y el pedido entero
    dentro del presupuesto; el payload RSC y el HTML de la segunda medición de
    §6.4, con las tres listas, dentro del suyo.
23. **Personas de punta a punta** (B) — los recorridos 15 y 16 de §8.2.
24. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`, `next
build` y la suite e2e entera, al cierre de la A y al de la B. Las únicas
    afirmaciones existentes que cambian de valor son las dos de la barra y los
    dos tests de `personas` de `scope.integration.test.ts` (§1).

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo               | Archivo                                                                                                                                                                         | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad             | `report/schema.test.ts`                                                                                                                                                         | `z.uuid()` en lugar de la forma en minúsculas; el `split` que filtra vacíos; sin `max`; `sin-proyecto` fuera del conteo del tope; un repetido aceptado; `sin-proyecto` aceptado en `clientes`; el valor malo quitado y el resto aceptado; un parámetro inválido que vacía a otro                                                                                                 |
| 2        | unidad             | `report-href.test.ts`                                                                                                                                                           | las listas sin ordenar; `clientes=` vacío escrito; `sin-proyecto` perdido                                                                                                                                                                                                                                                                                                        |
| 3        | integración        | `service.integration.test.ts`; `scope.integration.test.ts`                                                                                                                      | `matchesFilter` que con `NO_ENTRY_FILTER` devuelve `false` (`inArray` con lista vacía)                                                                                                                                                                                                                                                                                           |
| 4        | integración        | `service.integration.test.ts`                                                                                                                                                   | `withoutProject` ignorado; `and` en lugar de `or` entre los ids y «Sin proyecto»; `archived_at is null` en el catálogo; el filtro solo en `totalsByLevels` y no en `entryTotals`                                                                                                                                                                                                 |
| 5        | integración        | `service.integration.test.ts`                                                                                                                                                   | el cliente con `client_id is null or …` (deja pasar lo sin proyecto); `entry_project` en lugar de un alias propio (agrupando por cliente con `[C1]` choca o duplica); el cliente comparado con `time_entry.project_id`; `or` entre filtros                                                                                                                                       |
| 6        | integración        | `service.integration.test.ts`                                                                                                                                                   | el filtro solo en el nivel 1; el tope contado sin el filtro (3001 corta)                                                                                                                                                                                                                                                                                                         |
| 7        | integración        | `service.integration.test.ts`                                                                                                                                                   | los ids de la URL sin cruzar con el catálogo (el de otro workspace queda en `filters`, el inexistente da el segundo vacío); el id de la URL en lugar del del catálogo; el catálogo sin `project.view`                                                                                                                                                                            |
| 8        | integración        | `project/service.integration.test.ts`                                                                                                                                           | `listActiveProjects` en lugar de `listAllProjects`; los clientes archivados afuera; sin `can(project.view)`; `listAllProjects` sin el workspace (cae en la llamada directa); con `db` en lugar del `tx`                                                                                                                                                                          |
| 9        | integración        | `service.integration.test.ts`                                                                                                                                                   | el catálogo leído con `db` o antes de abrir la transacción; leído antes de `report.view`                                                                                                                                                                                                                                                                                         |
| 10       | integración        | `service.integration.test.ts`                                                                                                                                                   | cada guarda quitada de a una; `withoutProject` fuera del conteo de la guarda o de la invariante; la invariante después de abrir la transacción                                                                                                                                                                                                                                   |
| 11       | integración        | `service.integration.test.ts`                                                                                                                                                   | el color sin estrechar; la fila del catálogo esparcida en la opción; `filters` en el orden de la URL                                                                                                                                                                                                                                                                             |
| 12       | integración        | `scope.integration.test.ts`                                                                                                                                                     | el filtro que reemplaza a `inScope` en lugar de sumarse (un member con `proyectos` ve a todos en P); `inScope` solo en el nivel 1 con filtro; el catálogo leído con el workspace del id pedido y no con el del actor                                                                                                                                                             |
| 13       | componente         | `report-href.test.ts`; `filter-model.test.ts`; `filter-picker.test.tsx`; `report-toolbar.test.tsx`; `range-picker.test.tsx`; `subgroup-picker.test.tsx`; `report-view.test.tsx` | una flecha, «Esta semana», un enlace de «Agrupar por», un atajo, `applySelection` o un subnivel sin los filtros; «Quitar filtros» con los filtros o sin la agrupación; el segundo vacío sin filtros; «Sin proyecto» que se filtra con la búsqueda; la búsqueda que distingue acentos; `>=` en lugar de `>` en el tope; «Sin proyecto» fuera del conteo; los archivados mezclados |
| 14, 22   | manual             | informes de `backend-dev` y `frontend-dev`                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                |
| 15, 23   | e2e                | `e2e/reports.spec.ts`                                                                                                                                                           | los del final de §8.2                                                                                                                                                                                                                                                                                                                                                            |
| 16       | unidad             | `report/schema.test.ts`                                                                                                                                                         | los ids de persona pasados a minúsculas; la forma de uuid exigida en `personas`; `@` y `.` aceptados                                                                                                                                                                                                                                                                             |
| 17       | integración        | `workspace/service.integration.test.ts`                                                                                                                                         | sin la condición de estado (está la invitada); la condición «tiene horas» en lugar del estado (falta el activo sin horas, está la invitada con horas); `status <> 'inactive'`; sin `team.view`; `user_preference` con `inner join` (falta el que no editó su nombre); con `db` en lugar del `tx`                                                                                 |
| 18       | integración        | `service.integration.test.ts`                                                                                                                                                   | `personas` ignorado; **los ids comparados sin distinguir mayúsculas en el service** (`toLowerCase` al cruzar con el catálogo: el inactivo se ignora, o el id en minúsculas se acepta); la inactiva fuera del catálogo; la invitada aceptada; `entryTotals` con el alcance sin angostar; `displayNameOf` sin aplicar; la persona esparcida en la opción; `scope` en `chosen`      |
| 19       | integración        | `scope.integration.test.ts`                                                                                                                                                     | `narrowedTo` que acepta `self` (un member con `personas` ve a otros); el catálogo de personas leído con `self`; `chosen` sin `workspace_id` (trae lo de B de la persona compartida); `personas` cruzado con un catálogo de todos los workspaces                                                                                                                                  |
| 20       | tipos, integración | `report/scope.test-d.ts`; `service.integration.test.ts`                                                                                                                         | el miembro nominal quitado de `Scope`; `narrowedTo` llamado con `self`                                                                                                                                                                                                                                                                                                           |
| 21       | componente         | `report-toolbar.test.tsx`; `filter-picker.test.tsx`; `report-href.test.ts`                                                                                                      | «Personas» dibujado con `people` en `null`; las inactivas sin tachar o mezcladas; `personas` perdido en un enlace; el id pasado a minúsculas al escribir                                                                                                                                                                                                                         |
| 24       | todas              | las suites existentes                                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                                                                |

**Mutante declarado equivalente:** el `exists` del cliente sin
`filter_project.workspace_id = time_entry.workspace_id`. El id del proyecto es
único y la clave compuesta de `time_entry` al proyecto fija su workspace, así
que trae lo mismo; el workspace queda porque es la clave que los ata. Antes de
darlo por equivalente, `test-engineer` corre los criterios 5 y 12 con el
mutante, también con `totalsByLevels` llamado directo con un `clientIds` de
otro workspace, y anota que las respuestas son las mismas. **Cualquier otro
mutante declarado equivalente** se prueba antes con pedidos de una membresía
inactiva, de otro workspace y de un member con horas ajenas en el rango.

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los doce de R2a a R3b no cambian, salvo que
`reportsUrlOf` ahora afirma que no hay filtros. Se suman cuatro, con la regla
de §8.3 de R2a; las entradas van en la semana anterior a la de hoy, en la zona
de la persona, y se siembran antes de abrir la pantalla. Los nombres llevan el
sufijo del test, y **cada lista del control se busca por el sufijo antes de
afirmar sus opciones**.

13. **Cliente y proyecto, «Sin proyecto», archivados y el segundo vacío**
    (RP-25, RP-26, RP-29, RP-33; parte A). La persona del test es member. P1 de
    C1, P2 de C2 y P3 sin cliente. El lunes, P1 de 09:00 a 10:00; el martes, P2
    de 09:00 a 09:30; el miércoles, P3 de 09:00 a 09:45; el jueves, sin proyecto
    de 09:00 a 09:20. Después de sembrar, P3 se archiva. Desde la semana
    anterior por «Proyecto»: total 2:35.
    - «Proyectos: todos»; en el buscador, el sufijo: «Sin proyecto» primero,
      P1 y P2, y en «Archivados», P3. Tildar P1 y «Sin proyecto», «Aplicar»:
      **el popover se cierra y, con la pantalla nueva, el foco está en
      «Proyectos: 2»**; la URL lleva `proyectos` con el id de P1 y
      `sin-proyecto`; las filas son P1 con 1:00 y «Sin proyecto» con 0:20; total
      1:20.
    - «Cliente» en «Agrupar por»: la URL conserva `proyectos`; C1 con 1:00 y
      «Sin cliente» con 0:20.
    - Al recargar: lo mismo, y el botón dice «Proyectos: 2».
    - «Proyectos: 2»: P1 y «Sin proyecto» tildados; destildarlos, tildar P3,
      «Aplicar»: «Sin cliente» con 0:45 (el archivado cuenta).
    - «Período anterior»: la URL conserva `proyectos`; «Ninguna entrada
      coincide con los filtros» y «Quitar filtros». «Período siguiente»:
      «Sin cliente» con 0:45 otra vez.
    - «Clientes: todos» → C1 → «Aplicar»: el segundo vacío. «Quitar filtros»:
      la URL es la de la semana anterior por «Cliente», sin filtros; C1 con
      1:00, C2 con 0:30, «Sin cliente» con 1:05; total 2:35; los botones dicen
      «Clientes: todos» y «Proyectos: todos».
14. **Lo que no existe o está mal formado se ignora** (RP-32, RP-34; parte A).
    Member; P1 con una entrada de 1:00 y una sin proyecto de 0:30.
    - `proyectos=<uuid nuevo>`: por persona, 1:30; «Proyectos: todos»; no hay
      segundo vacío.
    - `proyectos=<id de P1>,<uuid nuevo>`: 1:00; «Proyectos: P1». «Proyecto» en
      «Agrupar por»: la URL lleva `proyectos` con el id de P1 solo.
    - `proyectos=<id de P1>,` (coma de más): 1:30 y «Proyectos: todos».
    - `clientes=<id de P1>` (un proyecto como cliente): 1:30 y «Clientes:
      todos».
15. **Un admin filtra por personas, con las inactivas aparte y sin las
    invitadas** (RP-25, RP-62, RP-64; parte B). La persona del test pasa a
    admin y se llama A: **su id lo genera Better Auth al entrar por
    `test-session`, con mayúsculas**. Se siembran B (activa), C (inactiva), D
    (invitada) y E (activa, sin horas), con uuid. El martes, A de 09:00 a 10:00
    en P; B de 09:00 a 11:00 en P; C de 09:00 a 09:30 en P. Desde la semana
    anterior por «Persona»:
    - «Personas: todas»; en el buscador, el sufijo: A, B y E; en «Inactivas»,
      C, **con el nombre tachado**; D no está.
    - Tildar A, B y C, «Aplicar»: el foco en «Personas: 3»; la URL lleva en
      `personas` el id de A tal como lo dio Better Auth (`userIdOf`); las filas
      son B con 2:00, A con 1:00 y C con 0:30 y «(inactiva)»; **total 3:30**
      (el filtro lo hace reproducible). «Proyecto» en «Agrupar por»: la URL
      conserva `personas`; P con 3:30.
    - Al recargar: lo mismo.
    - «Personas: 3» → solo E → «Aplicar»: «Ninguna entrada coincide con los
      filtros».
16. **Un member con un enlace que filtra personas ve lo propio, y los otros
    filtros se aplican** (RP-32, D-R4-4; parte B). Member, con P1 de 1:00 y P2
    de 0:30; otra persona O con 3:00 en P1. La URL de la semana anterior por
    «Persona» con `personas=<id de O>` y `proyectos=<id de P1>`: «Ves solo tus
    horas.»; no hay botón «Personas»; una fila, la suya, con 1:00; total 1:00;
    «Proyectos: P1». «Proyecto» en «Agrupar por»: la URL lleva `proyectos` y no
    `personas`.

Los mutantes que tienen que caer en e2e: un enlace que pierde los filtros (la
agrupación del 13, la flecha del 13, la del 14); el popover que no se cierra o
el foco que no vuelve (13, 15); «Sin proyecto» ignorado; un archivado afuera
del catálogo; el segundo vacío que no aparece o «Quitar filtros» que no los
quita; un id inexistente que no se ignora (14); un parámetro mal formado
aplicado en parte (14); la inactiva sin tachar o la invitada en la lista (15);
el filtro de personas que no se aplica (el total del 15); un id de Better Auth
pasado a minúsculas en algún punto (falta A y el total del 15 da 2:30); un
member que ve el botón «Personas» o las horas de O (16).

### 8.3 La regla de los e2e

La de §8.3 de R2a, con D-R4-13. Los recorridos 13, 14 y 16 son de alcance
propio y afirman el total; el 15 lo afirma porque el filtro de personas deja
solo las del test. Ninguno afirma sobre el workspace ni sobre la lista entera
del control.

### 8.4 Lo que no se prueba en e2e

- **El tope de 50**, con «Sin proyecto» contado: el modelo y el esquema
  (criterios 1 y 13).
- **Otro workspace**: los e2e tienen uno (criterios 7, 12, 17 y 19).
- **El tope de 3000 filas con filtro**: criterio 6.
- **El cliente archivado y el proyecto privado**: criterios 5, 7 y 8.
- **La invitada con horas**: criterio 17.
- **El driver de Neon**: sin forma nueva (D-R4-11).
- **El volumen y el peso**: §6.

## 9. Riesgos y deuda conocida

- **Los filtros se suman a cada lectura del árbol.** Lo mitigan que haya una
  sola condición (`matchesFilter`) y un solo alcance (`inScope`), y los
  criterios 6 y 12, que miran todos los niveles y el total.
- **Los catálogos viajan en cada página**, también sin filtros. Con un workspace
  de miles de proyectos pesa; §6.4 lo mide con 1000.
- **La URL llena se repite en cada enlace**: con 50, 50 y 50 son unos 5,6 KB por
  `href`; §6.4 lo mide.
- **Una invitada con horas** (solo por SQL) aparece como fila agrupando por
  persona —el reporte no mira el estado (RP-61)— pero no en el filtro.
- **Un member con horas propias en un privado del que salió** (PR-71) las ve
  agrupando por proyecto y no puede elegir ese proyecto en el filtro: el
  catálogo sigue a `project.view`. Sí puede filtrar por su cliente (D-R4-6). Con
  todos los proyectos públicos (P-17 de `proyectos.md`), no pasa.
- **Dos personas con el mismo nombre son dos casillas indistinguibles** en el
  filtro, como sus filas desde R2a (RP-31): la opción no muestra el correo.
- **El segundo vacío aparece con filtros aunque el período no tenga horas**
  (D-R4-7).
- **La forma de un id de persona depende de Better Auth**: si el generador
  cambia a algo con otros caracteres, el parámetro se descartaría entero. El
  criterio 16 lo fija con la forma de hoy.
- **Los ids de los tests no se parecen a los de producción**: los factories y
  `seedPerson` siembran uuid en minúsculas. Por eso el criterio 18 siembra uno
  con mayúsculas y el recorrido 15 elige a la persona de la sesión.
- **Los espías dependen de cómo se llama al repository**: si un service
  desestructura un método (`const { listPeople } = workspaceRepository`), el
  espía no ve la llamada y los criterios 8, 9, 17, 18 y 19 dan falsos negativos
  sobre el `Executor`. §4.5 lo fija; la revisión de código lo mira.
- **Elegir «todos menos uno»** de una lista larga choca con el tope de 50: no hay
  modo de exclusión (§11).
- **La línea del tope de 3000 filas** sigue diciendo «Acortá el período o quitá
  un nivel.», aunque filtrar también lo resuelve.
- **La barra suma un tercer grupo** y a 375 px se parte en más renglones; el
  desborde del shell ya está en la deuda.
- **El cierre del popover, el foco y Esc solo tienen e2e**, como los atajos y
  los subniveles.
- **Las ediciones mecánicas fuera del reparto** de los pasos 1 y 6 repiten el
  desvío de R3, escritas en el orden.
- **Lo de Clockify sin verificar** (P-05): cómo muestra los archivados en el
  filtro de proyecto (RP-29) y si cruza cliente y proyecto con «y».
- **R10 (agrupar por descripción, mes y semana) va después de R4**, y R4 no le
  cierra el camino:
  - **Arranca con R4b mergeado**, no con R4a: si arrancara antes, R4b tendría
    que rebasar sobre `schema.ts`, `service.ts`, `repository.ts` y la barra, que
    R10 también toca.
  - **La URL**: R10 suma valores a `agrupar` y `subagrupar`, que R4 no toca; los
    filtros son parámetros aparte, validados cada uno por su lado, así que un
    valor nuevo de agrupación no cambia ninguno y ningún nombre de filtro choca
    con uno de agrupación.
  - **El repository**: el filtro no es una dimensión. Va en `ReportEntryRead` y
    se aplica en la subconsulta por entrada; R10 suma filas a la tabla de
    dimensiones sin tocar `matchesFilter`, y mes y semana usan los cortes de
    `buckets`, que el filtro no mira.
  - **Lo que R10 hereda**: `reportHref` con `filters` obligatorio (todo enlace
    nuevo de R10 los conserva o no compila) y `filter` en cada lectura. **Sus
    dimensiones nuevas entran en un caso como el criterio 6, con filtro**: los
    hijos de cada grupo son solo lo filtrado y el total es el filtrado. Agrupar
    por descripción puede dar muchos grupos de primer nivel; los filtros los
    achican, pero el primer nivel sigue sin tope (§9 de R3).
  - **Lo que queda abierto**: filtrar por descripción (RP-25 en el resto, fase 3) sería un parámetro de texto libre, con otra forma que las listas de ids
    de D-R4-2. Va por su lado, como los demás.
- **Dos lecturas de personas**: `team` (R8, la lista con el rol) y `workspace`
  (R4b, el catálogo con el estado). Si convergen, es una decisión de la fase 2,
  cuando llegue la pantalla de equipo.

## 10. Pendiente del usuario y preguntas abiertas

1. **Partir el slice** (team-lead). Recomendación: un contrato en dos partes,
   con la A mergeable sola como R4a (D-R4-1, §7). No bloquea el arranque.
2. **La lectura de personas y R8** (team-lead, coordinado con `architect-r8`).
   R8 crea `src/modules/team/` con su propia lectura y no toca `workspace`,
   `report` ni los archivos de e2e del reporte salvo para importar
   `REPORTS_PATH`, `SCOPE_SELF` y `SCOPE_EVERYONE`, que R4 no renombra; R4b
   pone el catálogo en `workspace`. No se pisan. No bloquea.
3. **P-05 en el workspace de Clockify** (usuario, sesión de relevamiento): cómo
   ofrece el filtro de proyecto los archivados y si cliente y proyecto se cruzan
   con «y». Queda lo de este contrato hasta entonces. No bloquea.
4. **Nota para el usuario, no es pregunta: el tope de 50 por filtro**, con «Sin
   proyecto» contado. Lo fija `architect` por el largo de la URL (D-R4-2). Para
   ver «todos menos uno» de una lista larga hay que filtrar por cliente o
   quitar el filtro; un modo de exclusión queda para la fase 3.

## 11. Fuera de alcance

- Filtrar por tarea, etiqueta, descripción o facturable: RP-25 en el resto, fase 3. «Sin cliente», «Sin tarea» y «Sin etiqueta» como filtros: RP-26 en el
  resto.
- Excluir en lugar de incluir, y «Elegir todos».
- Guardar filtros (RP-27).
- «Quitar filtros» fuera del segundo vacío.
- Mostrar personas sin horas: R9, que parte de `listWorkspacePeople`.
- Agrupar por descripción, mes y semana: R10, después de R4b y antes de R5 (§9).
- Lo abierto del árbol en la URL: el usuario aceptó que todo empiece contraído.
- Los filtros en la cabecera del archivo: R6 y R7, con `filters` y
  `filterOptions` del estado.
- Filtrar por equipos o grupos de personas (no hay modelo, RP-06).
- Distinguir dos personas con el mismo nombre en el filtro (RP-31).
- RP-14, RP-36, RP-09 y el importe por grupo, como en R2a.
