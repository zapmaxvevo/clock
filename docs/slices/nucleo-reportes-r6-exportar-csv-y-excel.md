# Núcleo de reportes, R6: exportar a CSV y Excel

Contrato del octavo slice del núcleo de reportes. Suma la primera ruta propia
fuera de `api/auth` y `api/cron`: un Route Handler `GET` que recibe la misma
query string que `/reportes` y devuelve un archivo con lo que la pantalla
muestra para esa URL —la cabecera, los grupos y subgrupos con sus totales— y,
por decisión del usuario, las entradas una por una, todo leído en la misma foto
que la página. Sin cambios de tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-54 (CSV y
  Excel, `adaptar`: pago en Clockify, entra «como diseño propio y no como
  paridad», P-10), RP-53 por lo que comparte con R7 («A PDF file can contain up
  to 3000 rows.», «Grouping options in Summary report will affect how your
  exports look like.», «Only the data covered in the report will be
  exported.»), RP-18 (el total y el facturable, truncados al minuto por cifra),
  RP-22 (los días en la zona de quien mira), RP-28 (los «Sin …»), RP-31 (la
  persona «(inactiva)»), RP-32 (la misma URL, el mismo reporte; un member con
  `personas=` ajenas ve lo propio) y RP-33 (los vacíos). Se apoya en RP-12,
  RP-21, RP-25, RP-30 y RP-34 tal como los dejaron R2a a R5.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R6».
  Depende de R3 y R4 (la forma del reporte) y, por el árbol, de R5, que está en
  `main` (merge `6f06c0e`). Va antes de R7, que reusa la ruta y el modelo del
  documento (D-R6-13). Sigue el orden que el usuario pidió el 2026-10-10 («r5 y
  despues segui sin parar», `estado-fase1.md:178-181`).
- **Dos partes** (D-R6-1): **R6a**, la ruta, el modelo del documento, el CSV con
  el resumen y las entradas, y el enlace en la pantalla; **R6b**, el Excel con
  `exceljs`, que el usuario aceptó el 2026-10-12 con la alerta de `uuid` (§10,
  decisión (a)), sujeto a la confirmación de `security-auditor` antes del
  merge. R6a se despliega sola.
- **Revisión del contrato:** primera pasada de `architecture-reviewer` aplicada
  el 2026-10-12 ([correcciones](correcciones-nucleo-reportes-r6-contrato.md)).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): «Toda
    puerta de entrada —la página y la ruta de exportación— pasa por el mismo
    service», con el `ReportScope` que solo arma el service, y «toda función
    nueva del repository suma su test de integración con un `member` que no ve
    nada ajeno»; la revisión de seguridad verifica el alcance «también en la
    exportación».
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): «Una sola foto»
    (una transacción `repeatable read` de solo lectura); la medida por entrada
    es la de `entrySeconds`; «ninguna cuenta de zona horaria se escribe en
    SQL»; el tope de 366 días «acota el peor pedido —el árbol de tres niveles
    con la fecha abajo y la exportación—».
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): lo que depende de la
    zona se resuelve en el servidor con `src/server/time`, y los formatos de
    quien mira salen de `timeSettingsOf`. Las columnas de datos de las entradas
    van en su forma canónica (D-R6-9); no es una contradicción: el ADR fija que
    un mismo rótulo se arme con una sola función, y una columna que una planilla
    tiene que leer como fecha no es un rótulo.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    lo que el archivo muestra de otros módulos (proyecto, cliente, tarea,
    etiqueta, persona) se lee con `join` en el repository propio.
  - [ADR 0002](../adr/0002-cabeceras-de-seguridad.md): las cabeceras de
    seguridad de `next.config.ts` valen también para la ruta nueva.

  **Este contrato no abre ningún ADR.** La elección de la biblioteca de Excel
  tenía alternativas reales, pero aceptar una vulnerabilidad en producción era
  decisión del usuario, y la tomó: `exceljs` (§10, decisión (a)). Si quiere
  dejar la aceptación registrada como ADR, sería el 0022, y es suyo.

  **Lo que no se sostiene tal cual contra el árbol o contra el encargo**, y este
  contrato ajusta:

  1. **El encargo omite una decisión del usuario.** El mapa, §5: «**La
     exportación suma las entradas una por una** en CSV y Excel, además de lo
     que muestra el resumido» (`nucleo-reportes-mapa.md:405-406`), y R10 lo
     repite («El texto entero va en la exportación de las entradas una por
     una», `nucleo-reportes-r10-descripcion-mes-y-semana.md:304-310`). Este
     contrato las exporta (D-R6-3). Es lo que más pesa del slice y lo que lleva
     a partirlo.
  2. **El mapa, §3 R6: «Tope de filas: el mismo del árbol de R3».** Vale para el
     resumen; las entradas, que el mapa no contaba en esa línea, llevan su
     propio tope (D-R6-3).
  3. **El mapa dice que `exceljs` «no publica versión desde 2023»** y el encargo,
     que su última publicación fue el 2024-12-20. Sin red no se puede
     comprobar; el contrato usa el dato del encargo y no decide nada por él.
  4. **El encargo sugiere un enlace con `download` y un nombre de archivo con
     acentos (RFC 5987).** Ninguno de los dos va, con sus motivos en D-R6-5 y
     D-R6-10.

Decisiones que el contrato da por tomadas (R2a a R5, mapa §5, `reportes.md`
§8): solo owner y admin ven horas ajenas; un member con un enlace que nombra a
otras personas ve lo propio; el tope de 366 días; el timer en curso no se
muestra ni se suma; los filtros de R4 se aplican a todo lo que la página suma;
el árbol de 3000 filas que entra entero o no se muestra (D-R3-6, D-R10-10); la
regla de los e2e de §8.3 de R2a.

## Decisiones del contrato

**D-R6-1 — Dos partes: R6a (ruta, documento y CSV) y R6b (Excel).** Opciones:
(1) un slice; (2) R6a con el resumen en CSV y Excel y R6b con las entradas; (3)
**R6a con todo lo del CSV y R6b con el Excel.** **(3).**

- Con las entradas (D-R6-3), el slice trae una lectura nueva del repository con
  su alcance y su medición, la primera ruta propia, un modelo de documento, un
  escritor de CSV y la pantalla. Es más que R5.
- (2) parte por contenido y obliga a resolver `exceljs` antes del primer
  despliegue. (3) parte por formato: **R6a no depende de la biblioteca**, y R6b
  es un escritor más sobre el mismo documento, una entrada en la tabla de
  formatos, una ruta de una línea y un enlace.
- R6a se despliega sola: exporta todo lo que el slice promete, en CSV. R6b ya no
  espera al usuario, que aceptó `exceljs` (§10, decisión (a)), sino la
  confirmación de `security-auditor` sobre la alerta de `uuid`, que es paso de
  R6b antes del merge (§7, paso 15).

**D-R6-2 — Qué se exporta: el estado de la página para la misma URL, entero.**
Opciones: (1) **la misma lectura que `getReportState`**, extendida; (2) una
lectura propia de la exportación. **(1).**

- **Una sola foto.** El archivo sale de la misma maquinaria que la página: el
  mismo `scopeOf`, el mismo período, las mismas invariantes, los mismos filtros
  efectivos y el mismo `readScope`, dentro de la misma transacción `repeatable
read`, `read only` (`service.ts:859-872`). Las entradas se leen en esa misma
  transacción (D-R6-3), así que su suma es `totalSeconds`. Con (2) la página y
  el archivo serían dos caminos de alcance y de filtros con un test cada uno,
  que es lo que el ADR 0020 y el mapa prohíben («No hay segundo camino»).
- **El árbol se exporta entero, como si estuviera todo expandido.** Lo contraído
  es solo de la pantalla (D-R3-9: todo empieza contraído y lo abierto no va en
  la URL); el estado ya trae todos los niveles que entraron en el tope
  (`levelsShown`), y el archivo los escribe todos.
- **El tope de 3000 filas es el de la pantalla** (`REPORT_MAX_ROWS`,
  `schema.ts:130-135`: «El mismo de R6 y R7»). Si los niveles de abajo no
  entran, el archivo trae los que entraron y la misma nota que la pantalla
  (`reportLabels.rowLimit`). **Si no entra ni el primer nivel**
  (`levelsShown: 0`, D-R10-10), el resumen es la nota `firstLevelLimit` en
  lugar de las filas, y **las entradas se exportan igual** si entran en su
  tope: es la forma de ver las horas que la pantalla no muestra. Responde la
  pregunta que D-R10-12 dejó para este contrato («el aviso, las entradas una
  por una o los dos»): los dos.
- **Sin gráfico.** D-R5-10 dejó la decisión acá: una sección «por día» repite lo
  que da agrupar por fecha, y las entradas ya traen el día de cada una. El PDF
  de R7 decide por su cuenta.

**D-R6-3 — Las entradas una por una: una lectura nueva, todo o nada, con tope.**

- **La lectura**: `reportRepository.entryList(scope, read, tx)`, una sentencia
  sobre `time_entry` con `inScope`, `closedIn` y `matchesFilter` —las mismas
  traducciones del alcance, del rango y de los filtros
  (`repository.ts:169-231`)— y la medida de `entrySeconds`
  (`repository.ts:233-237`). Trae de cada entrada los instantes, la persona
  (nombre de la cuenta, nombre editado, estado de la membresía), el proyecto,
  su cliente, la tarea, la descripción **entera**, el facturable y las
  etiquetas en un arreglo JSON con una subconsulta correlacionada, como
  `entryTags` de `time-entry` (`src/modules/time-entry/repository.ts:182-198`),
  que ya corre en producción con `neon-serverless`. Sin orden, como el resto del
  repository (`repository.ts:719-723`): ordena el service.
- **Todo o nada**, como el primer nivel (D-R10-10). Se pide con
  `limit: REPORT_EXPORT_MAX_ENTRIES + 1`; si vuelven más de
  `REPORT_EXPORT_MAX_ENTRIES`, no se lista ninguna y el archivo lo dice. Cortar
  en las primeras 10 000 daría un archivo que parece completo y no lo es; la
  suma de las listadas no sería el total.
- **El tope: `REPORT_EXPORT_MAX_ENTRIES = 10 000`.** Un mes del equipo del
  volumen sintético (30 personas, 8 entradas por día hábil) son unas 5300; dos
  meses, unas 9600. Un año del equipo, unas 62 000, no entra: se acorta el
  período o se filtra. §6 lo mide.
- **Y un tope de peso, `REPORT_EXPORT_MAX_BYTES = 4 000 000`.** La descripción
  admite 3000 caracteres (`DESCRIPTION_MAX`,
  `src/modules/time-entry/schema.ts:17`) y una entrada hasta 50 etiquetas
  (`TAGS_MAX`, `:23`): 10 000 entradas largas pasan cualquier límite de
  respuesta. Si el archivo escrito pasa el tope, se escribe de nuevo con las
  entradas en «no entran» (§4.8). El motivo del número está en D-R6-11.
- **Las columnas** (§4.6): fecha y hora de inicio, fecha y hora de fin, persona,
  cliente, proyecto, tarea, descripción, etiquetas, facturable, duración y
  horas. Las fechas y las horas, en la zona de quien mira (RP-22).
- **Qué entra**: las cerradas con el inicio en el período (`closedIn`), del
  alcance y de los filtros. El timer en curso no (P-07). Agrupar por etiqueta no
  cambia nada: cada entrada es una fila, con todas sus etiquetas en una celda.

**D-R6-4 — La ruta: `/reportes/exportar/<formato>`, con la query string de la
página.** Opciones: (1) `src/app/api/reportes/…`; (2) **`src/app/(app)/reportes/exportar/<formato>/route.ts`**;
(3) una sola ruta con `?formato=`. **(2), con una carpeta estática por formato.**

- **Al lado de la página y no en `api/`**: es una descarga que la persona pide
  desde la pantalla, no una API. Un Route Handler no participa de los layouts
  (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:150-155`),
  así que estar en `(app)` no le da sesión: la pide él. No choca con la página:
  un `route.ts` no puede estar en el mismo segmento que un `page.tsx`
  (`:39`), y `exportar/csv` es otro segmento.
- **El formato en la ruta y no en la query**: la query string del archivo es
  **exactamente** la de la página (`reportExportHref`, §5.2), y el nombre del
  archivo, la extensión y el `Content-Type` salen de la carpeta. Un formato
  desconocido es un 404 de Next, sin código. R6b suma `exportar/xlsx/` y R7,
  `exportar/pdf/`.
- **Cada `route.ts` es una línea** que llama a `handleReportExport(request,
formato)` del módulo (§4.8): `src/app/` solo compone (`CLAUDE.md`, «rutas;
  solo componen, sin lógica»), como `page.tsx` llama a `ReportScreen`.
- **El mismo parseo que la página.** Hoy `page.tsx:16-33` arma el
  `ReportRequest` en línea. Pasa a una función, `reportRequestOf(params)`, en un
  archivo nuevo del módulo, `report/request.ts`, que usan las dos. La ruta lee
  la query con `searchParamsRecord(url.searchParams)`, que da un `string` por
  parámetro y un arreglo si se repite, como el `searchParams` de una página:
  así un parámetro repetido se descarta en los dos lados (RP-32). **Ningún
  parámetro inválido es un error**: cada uno se descarta por su lado, igual que
  en la página, y el archivo es el de lo que la página muestra para esa URL.
- **Sin configuración de segmento.** Los `GET` de un Route Handler no se guardan
  en caché por omisión (`15-route-handlers.md:49-51`) y leer `headers()` —lo
  hace `requireSession()`— corta el prerenderizado (`:124`). No se toca
  `maxDuration` (`…/02-route-segment-config/maxDuration.md:6`: lo fija la
  plataforma).

**D-R6-5 — Las respuestas.**

| Caso                                                | Respuesta                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Con sesión y `report.view`                          | **200**, `Content-Type` del formato, `Content-Disposition: attachment; filename="<nombre>"`, `Cache-Control: no-store`, el archivo                                                    |
| Sin sesión                                          | **307 a `/login`**, de `requireSession()` (`session.ts:57-64`): `redirect` en un Route Handler responde 307 (`…/04-functions/redirect.md:10-12`)                                      |
| Con sesión y sin `report.view` (inactiva, invitada) | **403**, `text/plain; charset=utf-8`, `Cache-Control: no-store`, `reportMessages.exportForbidden`                                                                                     |
| Un error al leer o al escribir                      | **500**, `text/plain; charset=utf-8`, `Cache-Control: no-store`, `reportMessages.exportFailed`, y `console.error` con el error (la regla de ESLint lo admite, `eslint.config.mjs:20`) |
| Un formato que no existe                            | **404** de Next: no hay carpeta                                                                                                                                                       |

- **Sin sesión, redirigir y no 401.** El enlace de la pantalla es un `<a>` común
  (D-R6-10): con una sesión vencida, el navegador sigue el 307 y la persona
  queda en el login, que es lo que pasa con cualquier otra pantalla. Un 401 la
  dejaría en una página de texto sin salida. Y es lo que ya hace el punto
  central (`requireSession`): repetir la comprobación con otra respuesta es lo
  que la convención prohíbe (`.claude/skills/code-conventions/SKILL.md:13-16`).
- **`requireSession()` va fuera del `try`**: `redirect` lanza, y un `catch` lo
  convertiría en un 500 (`redirect.md:51`).
- **`Cache-Control: no-store`** en las tres respuestas propias: el archivo tiene
  horas y nombres de otras personas, y ninguna caché —del navegador, del CDN o
  intermedia— lo puede guardar (mapa §3, R6; vale también para R7). Lo afirman
  la integración (exacto) y el e2e contra `next start` (que lo contiene, por si
  Next agrega directivas).
- **El nombre del archivo es ASCII por construcción y no lleva `filename*`**:
  `reporte_<niveles>_<desde>_<hasta>.<formato>`, con los niveles pedidos en el
  valor que escriben en la URL (`REPORT_GROUP_PARAMS`, `schema.ts:106-117`,
  todos `[a-z]`, «descripcion» sin acento) unidos con `-`, y las claves de día
  ya validadas: `reporte_persona-proyecto_2026-09-28_2026-10-04.csv`. **No
  entra ningún texto que alguien escriba** (nombres, descripciones), así que no
  hay forma de inyectar nada en una cabecera, y sin caracteres fuera de ASCII
  el `filename*=UTF-8''…` del RFC 5987 no agrega nada. Si un formato futuro
  quisiera un nombre con texto, lleva `filename*` con un respaldo ASCII; no es
  el caso.
- **Las cabeceras de seguridad** de `next.config.ts:21-37` (con
  `X-Content-Type-Options: nosniff`) se aplican a la ruta (`source:
"/:path*"`). Sin cabeceras de CORS: otro origen no puede leer la respuesta.
  Un `GET` que no escribe nada no necesita protección contra CSRF: otro sitio
  puede, a lo sumo, hacer que la persona descargue su propio archivo.

**D-R6-6 — Un documento independiente del formato, con celdas tipadas.** El
estado se traduce una vez a un `ExportDocument` (§4.6): filas de celdas que
dicen **qué son** —texto, entero, día, hora de reloj, duración en minutos,
horas en minutos—, no cómo se escriben. Cada formato es un escritor del
documento: `csvBytesOf` en R6a, `xlsxBytesOf` en R6b. Así:

- los textos, el orden de las filas y la regla del minuto truncado viven en un
  solo lugar (`export/document.ts`), y un formato no puede decir otra cosa que
  otro;
- la biblioteca de Excel queda encerrada en un escritor (D-R6-12);
- R7 recibe el mismo documento (D-R6-13).

La regla del minuto es la de la pantalla: cada cifra se trunca al minuto por
separado (`durationLabel`, `components/group-heading.tsx:17-23`). «Horas» se
trunca además al centésimo desde esos minutos (`formatDecimalHours`, §4.2). Así
la suma de las filas de **cualquiera de las dos columnas** queda en el total o
por debajo, nunca arriba, como en pantalla (D-R2a-7). Redondear «Horas» la
dejaría arriba: tres entradas de 1 minuto darían «0,02» cada una, 0,06, contra
«0,05» del total de 3 minutos; truncando dan «0,01» cada una, 0,03. Lo mismo
vale entre los hijos y su grupo en el resumen. En el `.xlsx` de R6b las horas
son minutos / 60 sin cortar, y la suma tampoco pasa el total.

**D-R6-7 — El resumen en filas: un nivel por columna, con los de arriba
repetidos.** Opciones: (1) una columna de texto con sangría; (2) **una columna
«Nivel» y una por cada nivel que se muestra, con el camino entero en cada
fila**; (3) solo las hojas del árbol. **(2).**

- Cada fila es un grupo, en el orden de la pantalla (primero el grupo y después
  sus hijos). Lleva su número de nivel, los rótulos de sus antepasados y el suyo
  en las columnas de los niveles, vacías las de abajo, y su duración:

  | Nivel | Persona | Proyecto     | Duración | Horas |
  | ----- | ------- | ------------ | -------- | ----- |
  | 1     | Ana     |              | 10:00    | 10,00 |
  | 2     | Ana     | Web (ACME)   | 6:00     | 6,00  |
  | 2     | Ana     | Sin proyecto | 4:00     | 4,00  |

- Con (1) la sangría se pierde al ordenar o filtrar en una planilla; con (3) se
  pierden los totales de los grupos de arriba, que son lo que muestra la
  pantalla. Con (2) cada fila se lee sola, y filtrar «Nivel = 1» da el primer
  nivel.
- **Las columnas son las de los niveles que se muestran** (`levelsShown`), como
  el encabezado de la tabla (`report-view.tsx:30-34`), con los rótulos de
  `groupByLabels`.
- **El rótulo de cada grupo es el texto de la pantalla** (`groupTextOf`, §4.6):
  la persona con « (inactiva)»; el proyecto con su cliente entre paréntesis; la
  tarea con su proyecto entre paréntesis; los «Sin …» de RP-28; la fecha, la
  semana y el mes con su rótulo y, si son parciales, « solo …»; la descripción
  recortada con «…», como en pantalla, porque el texto entero está en las
  entradas (D-R10-12). Un rótulo de fecha sin año es del año de hoy, como en
  pantalla; la cabecera dice el período con años y cuándo se generó.

**D-R6-8 — La cabecera del archivo.** Arriba, una fila por dato, con el nombre
en la primera celda:

| Fila           | Valor                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Título         | «Reporte resumido»                                                                                                             |
| «Período»      | las dos fechas con año en el formato de quien mira, «28/09/2026 – 04/10/2026»; un solo día, una fecha                          |
| «Zona horaria» | `state.timeZone`, tal como está en el perfil (D-R2a-5)                                                                         |
| «Alcance»      | «Todas las personas del workspace» o «Solo las horas de {nombre de quien exporta}»                                             |
| «Agrupado por» | los niveles pedidos, «Persona / Proyecto / Fecha»                                                                              |
| «Personas»     | solo si hay personas elegidas: sus nombres, con « (inactiva)», en el orden de las opciones                                     |
| «Clientes»     | solo si hay clientes elegidos                                                                                                  |
| «Proyectos»    | solo si hay proyectos elegidos o «Sin proyecto»; «Sin proyecto» al final                                                       |
| «Total»        | duración y horas de `totalSeconds`                                                                                             |
| «Facturable»   | duración y horas de `billableSeconds`                                                                                          |
| «Generado»     | la fecha con año y la hora de reloj en el formato de quien mira, en su zona                                                    |
| «Nota»         | la de la suma por etiqueta, si la etiqueta es uno de los niveles mostrados (`tagOverlap`); la del tope, si se cortaron niveles |

- **La forma de cada fila**: el nombre en la primera celda y el valor en la
  segunda; el título va solo, en una celda. «Personas», «Clientes» y
  «Proyectos» llevan todos los nombres **en una sola celda, unidos con «, »**.
  «Total» y «Facturable» llevan dos celdas de valor, la duración y las horas.
  «Nota» es **una fila por nota**: primero la de etiquetas y después la del
  tope, en el orden de la pantalla (`report-view.tsx:53`, `:73-74`); si aplican
  las dos, son dos filas. La del tope va, como en pantalla, solo si el primer
  nivel entró: con `levelsShown: 0` el aviso es la fila del resumen (§4.6).
- Los nombres de lo filtrado salen de `filterOptions` y de los filtros
  **efectivos** del estado (D-R4-9: «R6 los usa para la cabecera del
  archivo»), así que un id que no existe o un `personas=` de un member no
  aparecen.
- El nombre de quien exporta es `session.user.name` (`displayNameOf`,
  `session.ts:49-50`): con el alcance propio, el archivo dice de quién son las
  horas aunque se reenvíe.

**D-R6-9 — CSV en español.**

- **Separador `;`**, **BOM UTF-8** una sola vez al principio, **fin de línea
  `\r\n`** (RFC 4180), también en la última. Excel con configuración regional
  en español espera `;` y coma decimal; sin BOM, lee los acentos como Latin-1.
  Sin la línea `sep=;`: con ella, Excel ignora el BOM.
- **Todos los campos entre comillas**, también los vacíos (`""`), con las
  comillas internas duplicadas. Un `;`, una comilla o un salto de línea dentro
  de un campo quedan adentro.
- **Inyección de fórmulas** (OWASP): un campo que **empieza** con `=`, `+`,
  `-`, `@`, tabulación o retorno de carro se escribe con un `'` adelante. Se
  aplica a todos los campos por igual; ningún número del archivo empieza con
  esos caracteres. Alcanza a la descripción, que es texto libre de otras
  personas (D-R10-12), y a los nombres (`NAME_MAX` 100,
  `src/modules/project/schema.ts:10`, `src/modules/profile/schema.ts:18`). El
  costo: una descripción «- reunión» se lee «'- reunión».
- **Las duraciones van dos veces**: «Duración», `h:mm` como en pantalla
  (`formatDuration`, `src/server/time/index.ts:63-69`), y «Horas», **decimal
  con coma y dos decimales**, sin separador de miles: «1,50», «2000,00». Las
  dos salen de los mismos minutos truncados, así que dicen lo mismo («1:29» y
  «1,48»). El decimal es el que se suma en una planilla; `h:mm` como texto no
  se suma, y Excel puede leerlo como una hora del día. Los dos decimales **se
  truncan** desde los minutos con aritmética entera, `Math.floor(minutos × 5 /
3)` centésimos, como el minuto se trunca desde los segundos: 1 minuto es
  «0,01» y no «0,02» (D-R6-6). `formatDecimalHours`, nueva en
  `src/server/time`.
- **Las fechas y las horas de las entradas, canónicas**: el día `yyyy-MM-dd`
  (`dayKey`, `:84-87`) y la hora `HH:mm` de 24 h (`formatClock`, `:99-102`), en
  la zona de quien mira. Son columnas que una planilla tiene que poder ordenar
  y leer como fecha en cualquier configuración regional; «03/10/2026» con
  `MM/dd/yyyy` se lee mal en un Excel en español. La cabecera, que es texto
  para leer, va en los formatos de quien mira (D-R6-8).
- **Las secciones**: la cabecera, una línea vacía, «Resumen» y sus filas, una
  línea vacía, «Entradas» y sus filas. Un solo archivo por formato, con las
  mismas secciones que las hojas de Excel. Opción descartada: dos CSV
  (resumen y entradas) con dos enlaces; la cabecera ya hace que ningún CSV sea
  una tabla pura, y dos descargas por formato duplican la ruta.
- **Lo que no se puede probar en CI**: cómo lo abre cada Excel. Va en el
  criterio 13, a mano.

**D-R6-10 — La pantalla: un grupo «Exportar» al final de la barra, con
enlaces comunes.**

- **El lugar**: el último grupo de `ReportToolbar`, con el patrón de los otros
  tres (`report-toolbar.tsx:85-148`): un rótulo «Exportar» y un
  `role="group"` nombrado por él, con un enlace por formato: «CSV» en R6a,
  «Excel» en R6b, «PDF» en R7. Cada enlace con el ícono de descarga
  (`aria-hidden`) y el estilo de los botones de contorno chicos.
- **Un `<a href>` común, sin `next/link` y sin el atributo `download`.**
  - `next/link` prefetchea las rutas en el viewport en producción: cada visita
    a `/reportes` pediría el archivo, con su lectura entera, sin que nadie lo
    quiera. El e2e lo afirma contando pedidos (recorrido 23).
  - `Content-Disposition: attachment` ya hace que el navegador descargue y se
    quede en la página. Con `download`, una sesión vencida guardaría la página
    de login como si fuera el archivo, porque el navegador sigue el 307 y baja
    lo que llegue (_no verificado_ en este árbol); sin él, el navegador navega
    al login, que es lo correcto (D-R6-5). Un 403 o un 500 se muestran como
    texto en la pestaña, con «atrás» para volver.
- **Sin JavaScript de cliente**: es un enlace que arma el servidor, y descarga
  sin hidratar.
- **El `href`** sale de `reportExportHref(formato, …)`, con el rango, la
  agrupación, los subniveles y **los filtros efectivos** del estado, la misma
  query string que `reportHref` (§5.2). Un member que abrió un enlace con
  `personas=` ajenas exporta con la URL sin ellas.
- **En los vacíos de RP-33 no hay grupo «Exportar»**: sin entradas del alcance y
  los filtros en el período, el archivo sería una cabecera con una nota. La
  condición es `state.chart !== null`, que por D-R5-6 vale exactamente eso (no
  depende del total: una entrada de 0,4 s da gráfico y da archivo). Con el
  primer nivel cortado sí hay grupo: hay horas. La ruta, pedida a mano con un
  período vacío, igual responde 200 con la cabecera y la nota.
- **Accesibilidad**: el grupo se anuncia «Exportar»; cada enlace es nativo, con
  el nombre de su texto visible («CSV»), como los enlaces de «Agrupar por»
  (`GroupByLink`, `report-toolbar.tsx:157-181`); el foco visible es el de los
  botones del módulo.

**D-R6-11 — Volumen y peso, contra el plan Hobby.** El peor archivo lo arman
las entradas, no el árbol: 3000 filas de resumen son unos 250 KB; 10 000
entradas del volumen sintético (el 1 % con 2900 caracteres,
`scripts/report-volume/seed.sql:15-21`), unos 2,5 MB.

- **Los límites de Vercel quedan _no verificados_ en este árbol**: el tamaño
  máximo del cuerpo de la respuesta de una función (4,5 MB según la
  documentación de Vercel que se recuerda, sin cita) y la duración máxima en
  Hobby (10 s era la cifra histórica; con Fluid compute es mayor). El contrato
  se diseña contra los dos valores más bajos: **el cuerpo, hasta 4 000 000
  bytes** (`REPORT_EXPORT_MAX_BYTES`, con margen bajo 4,5 MB), y **el pedido
  entero, con presupuestos locales muy por debajo de 10 s** (§6).
- **Sin streaming**: un archivo de hasta 4 MB se arma en memoria. El streaming
  permitiría pasar el límite de tamaño, pero no se sabe si Vercel lo respeta
  igual y obliga a escribir antes de saber si las entradas entran.

**D-R6-12 — Excel (R6b): celdas con tipo, y `exceljs` en un solo archivo de
producción.**

- **Dos hojas**, «Resumen» y «Entradas», cada una con la cabecera de D-R6-8
  arriba, una fila vacía y su tabla.
- **Los textos, como texto**: celdas de cadena con formato de número `@`, nunca
  una fórmula, también «=1+1». En una celda de texto de `.xlsx` el `'` no hace
  falta y se vería: no se agrega.
- **Las duraciones, como número**: «Duración», minutos / 1440 con el formato
  `[h]:mm` (pasa de 24 h); «Horas», minutos / 60 sin redondear, con el formato
  `0.00` (Excel lo muestra con la coma de su configuración). Las dos se suman.
- **El día, como fecha** (número de serie de Excel, días desde 1899-12-30,
  calculado con `daysBetweenKeys` sin zonas) con el formato `yyyy-mm-dd`; **la
  hora de reloj**, como fracción del día con `hh:mm`; **el nivel**, como entero.
- **La biblioteca**: `exceljs` 4.4.0, que ya está en `dependencies`
  (`package.json:39`), aceptada por el usuario el 2026-10-12 con la alerta de
  `uuid` (§10, decisión (a)) y sujeta a la confirmación de `security-auditor`
  antes del merge de R6b. Entre los archivos de producción, solo
  `report/export/xlsx.ts` la importa, solo para escribir a un buffer, sin
  formato condicional y con `import()` dinámico, para que ni la página ni el
  CSV la carguen.
- **La regla de ESLint**: `no-restricted-imports` prohíbe `exceljs` en todo el
  repositorio salvo en `src/modules/report/export/xlsx.ts`, `**/*.test.ts` y
  `e2e/**`. Los tests, y solo ellos, usan las funciones de lectura de la
  biblioteca (`xlsx.load`), sobre archivos que escribió el propio test o que
  bajó el propio recorrido: `xlsx.test.ts` (criterio 16) y `readXlsx` de
  `e2e/reports-page.ts` (recorrido 25).

**D-R6-13 — Lo que queda para R7.** R7 suma `pdf` a `REPORT_EXPORT_FORMATS`, a la
tabla de escritores de `handler.ts` y una carpeta `exportar/pdf/` de una línea,
y escribe el PDF desde el mismo `ExportDocument`, con la misma sesión, el mismo
alcance, `no-store` y el mismo nombre de archivo. Decide su contrato, no este:
si el PDF lleva las entradas (RP-53: «Export of Summary report doesn't contain
timestamps»; si no, suma la opción de no leerlas a `getReportExport`), si lleva
el gráfico (desde `chart` y `chart-model.ts`, D-R5-10), su tope de páginas y
las fuentes. Este contrato no agrega ninguna opción que hoy no se use.

**D-R6-14 — Los e2e de R6.** Heredan §8.3 de R2a con lo de `estado-fase1.md`:
persona de la sesión propia, nombres con el sufijo del test, ninguna
afirmación sobre el total del workspace, esperar la respuesta del servidor. El
alcance es propio (member): todo lo que el archivo trae es de la persona del
test. Las entradas van en una semana fija de 2025 (del lunes 2025-09-15 al
domingo 2025-09-21), lejos de hoy, así los rótulos de fecha llevan año y no
dependen del día en que corre. El archivo se lee de `download.path()` y las
cabeceras, de `page.request.get(href)`, que comparte las cookies del contexto.

**D-R6-15 — Lo que se prueba en unidad y lo que no.** En unidad: `formatDecimalHours`,
el parseo de la query, el documento, el CSV y el `href` y el marcado del grupo
(`renderToStaticMarkup`, como D-R5-13). En integración: la lectura, el alcance,
la foto y la ruta entera con la sesión simulada como en las actions
(`src/modules/profile/actions.integration.test.ts:31-78`). En e2e: que el
enlace descarga, que las cabeceras sobreviven a `next start`, que no hay
prefetch, el 307 real y el alcance desde la URL. A mano: cómo lo abren Excel y
LibreOffice.

## 0. Precondición de arranque

- **El árbol en `6f06c0e`** (`main` con R5 mergeado). Las citas de abajo son de
  ese árbol. Los tests de integración y CI usan `postgres:18-alpine`; Neon
  también es 18. Todo test de tiempo fija reloj y zona.
- **Ni R6a ni R6b tienen pendientes del usuario**: aceptó `exceljs` y dijo que
  las exportaciones no van al `audit_log` (§10, decisiones del 2026-10-12).
  **R6b espera la confirmación de `security-auditor`** sobre la alerta de
  `uuid`, que es paso de R6b antes del merge (§7, paso 15).
- **Sin comprobación contra Neon antes de mergear**: ningún parámetro tiene
  forma nueva (la lectura de las entradas pasa ids y fechas como las demás), y
  el único resultado de forma nueva para el módulo, un arreglo JSON de
  etiquetas, es el de `entryTags`, que ya corre con `neon-serverless`
  (`time-entry/repository.ts:182-198`). La comprobación en Vercel (cabeceras,
  descarga y tiempos con datos reales) la hace el usuario después del
  despliegue, en producción (§10, nota 4): el preview solo admite login en la
  rama de `BETTER_AUTH_URL`.
- **La zona de los tests de tiempo**: `test:time-ar` corre `src/server/time` en
  Buenos Aires (`package.json:16`); `formatDecimalHours` vive ahí y no depende
  de la zona. Los tests de integración fijan la zona del perfil (Buenos Aires,
  Madrid) con el proceso en UTC.

### Supuestos sobre el árbol, con archivo y línea en `6f06c0e`

| Supuesto                                                                                                                                                                                        | Dónde                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La página pide la sesión, valida cada parámetro por su lado con `safeParse` y arma el `ReportRequest` en línea                                                                                  | `src/app/(app)/reportes/page.tsx:13-37` (`:16-33`)                                                                                                                        |
| `currentSession` lee `headers()` y arma el nombre con `displayNameOf`; `requireSession` redirige a `/login` sin sesión                                                                          | `src/server/session.ts:34-55` (`:49-50`), `:57-64`                                                                                                                        |
| `timeSettingsOf` y `displayNameOf`                                                                                                                                                              | `src/modules/profile/service.ts:137`, `:113`                                                                                                                              |
| `ReportScope` es una clase con un miembro privado; `ReportRequest`; `scopeOf` y `narrowedTo` son lo único que la construye                                                                      | `src/modules/report/service.ts:75-90`, `:92-101`, `:107-134`                                                                                                              |
| `checkFilters` y las invariantes de niveles y de largo están «para otro llamador (R6)»                                                                                                          | `service.ts:404-432`, `:827-842`                                                                                                                                          |
| `readReport` lee catálogos, filtros efectivos, `readScope`, niveles, total y gráfico con el `tx` que recibe                                                                                     | `service.ts:716-765` (`:737-740`, `:741-747`, `:752-758`, `:759-763`)                                                                                                     |
| `getReportState`: `report.view`, `scopeOf`, el período, las invariantes, los tramos y una transacción `repeatable read`, `read only`; el estado                                                 | `service.ts:806-902` (`:816-819`, `:859-872`, `:881-901`)                                                                                                                 |
| El grupo de persona: `displayNameOf` e `inactive` si la membresía no es `active`                                                                                                                | `service.ts:238-245`                                                                                                                                                      |
| `inScope`, `closedIn` y `matchesFilter` son la única traducción del alcance, del rango y de los filtros; `entrySeconds` trunca a milisegundos; `secondsOf`                                      | `src/modules/report/repository.ts:169-181`, `:183-193`, `:199-231`, `:233-237`, `:239-246`                                                                                |
| La dimensión de persona une `membership` (interna), `user` y `user_preference`; la de proyecto, el proyecto y su cliente; la de tarea, por id y workspace                                       | `repository.ts:359-377`, `:379-410`, `:443-471`                                                                                                                           |
| `checkEntryRead`; `checkLevelRead` valida `limit`                                                                                                                                               | `repository.ts:555-574`, `:576-591`                                                                                                                                       |
| El repository no ordena: «Sin orden: lo pone el service»                                                                                                                                        | `repository.ts:719-723`                                                                                                                                                   |
| `entryTags`: `json_agg` en una subconsulta correlacionada, estrechado con Zod                                                                                                                   | `src/modules/time-entry/repository.ts:182-198`                                                                                                                            |
| `REPORT_MAX_ROWS` «El mismo de R6 y R7»; `REPORT_GROUP_PARAMS`; `reportMessages`; `reportFiltersOf`                                                                                             | `src/modules/report/schema.ts:130-135`, `:106-117`, `:14-20`, `:268-285`                                                                                                  |
| `reportReadyState`: `levelsShown`, `scope`, `timeZone`, `filters`, `filterOptions`, `chart`                                                                                                     | `schema.ts:515-568` (`:532-536`, `:538`, `:539-540`, `:550`, `:551-557`, `:559`)                                                                                          |
| `reportHref` arma la query con `desde`, `hasta`, `agrupar`, `subagrupar` y los filtros ordenados                                                                                                | `src/modules/report/components/report-href.ts:9-55`                                                                                                                       |
| La barra: grupos con rótulo y `role="group"`; `GroupByLink`                                                                                                                                     | `components/report-toolbar.tsx:85-148`, `:157-181`                                                                                                                        |
| `ReportView`: los niveles del encabezado; el gráfico solo con `chart`                                                                                                                           | `components/report-view.tsx:30-34`, `:71`                                                                                                                                 |
| `durationLabel` trunca al minuto; `GroupHeading` por tipo, con el proyecto y su cliente, la tarea y su proyecto, la descripción con «…»                                                         | `components/group-heading.tsx:17-23`, `:26-52`, `:90-108`, `:110-127`, `:147-161`                                                                                         |
| `reportLabels`: `partialDays`, `noTask`, `noTag`, `rowLimit`, `firstLevelLimit`, `total`, `billable`, `tagOverlap`, `inactivePerson`, `empty`, `emptyFiltered`; `groupByLabels`                 | `components/labels.ts:45`, `:51-52`, `:61-65`, `:68-69`, `:76-79`, `:81-83`, `:131-141`                                                                                   |
| `formatDuration`, `dayKey`, `formatClock`, `formatDayKey`, `daysBetweenKeys`, `clockLabel`                                                                                                      | `src/server/time/index.ts:63-69`, `:84-87`, `:99-102`, `:259-282`, `:594-596`, `:655`                                                                                     |
| `compareNames` ordena por nombre y desempata por id                                                                                                                                             | `src/lib/text.ts:27-39`                                                                                                                                                   |
| `DESCRIPTION_MAX` 3000, `TAGS_MAX` 50                                                                                                                                                           | `src/modules/time-entry/schema.ts:17`, `:23`                                                                                                                              |
| Las cabeceras de seguridad para `/:path*`                                                                                                                                                       | `next.config.ts:21-37`                                                                                                                                                    |
| La única otra ruta propia responde con `NextResponse.json` y fija `dynamic`                                                                                                                     | `src/app/api/cron/daily/route.ts:1-22`                                                                                                                                    |
| CI audita producción con nivel alto; la integración usa `TEST_DATABASE_URL`, que `setup.ts` copia en `DATABASE_URL`                                                                             | `.github/workflows/ci.yml:41`, `:66-68`; `src/test/setup.ts:5-7`                                                                                                          |
| Las actions se prueban con `next/headers`, `next/navigation` y `@/server/auth` simulados                                                                                                        | `src/modules/profile/actions.integration.test.ts:31-78`                                                                                                                   |
| Un test que siembra miles de entradas con `generate_series`                                                                                                                                     | `src/modules/report/service.integration.test.ts:3582-3589`                                                                                                                |
| `exceljs` 4.4.0 y `@react-pdf/renderer` en `dependencies`                                                                                                                                       | `package.json:39`, `:30`                                                                                                                                                  |
| Las dependencias de `exceljs`, entre ellas `uuid ^8.3.0` (instalada 8.3.2), `jszip`, `archiver`, `unzipper`, `saxes`, `tmp`                                                                     | `node_modules/exceljs/package.json:3`, `:98-108`; `node_modules/uuid/package.json:3`                                                                                      |
| `exceljs` usa `uuid` en un solo archivo, `v4()` sin argumentos, para reglas de formato condicional con extensión                                                                                | `node_modules/exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js:1`, `:43`, `:77`                                                                                   |
| La escritura de `exceljs` pasa por `jszip`                                                                                                                                                      | `node_modules/exceljs/lib/xlsx/xlsx.js:2-4`; `lib/utils/zip-stream.js:2`                                                                                                  |
| `exceljs` no está en la lista de paquetes externos del servidor de Next; `@react-pdf/renderer` sí                                                                                               | `node_modules/next/dist/lib/server-external-packages.jsonc:17`                                                                                                            |
| Next: Route Handlers sin caché por omisión, fuera de los layouts, sin `route` y `page` en el mismo segmento; `redirect` responde 307 y va fuera del `try`                                       | `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:39`, `:49-51`, `:124`, `:150-155`; `…/03-api-reference/04-functions/redirect.md:10-12`, `:51` |
| Next: leer cabeceras en un Route Handler y devolver una `Response` con las propias                                                                                                              | `…/03-api-reference/03-file-conventions/route.md:199-250`                                                                                                                 |
| e2e contra `next start` (compila y levanta)                                                                                                                                                     | `playwright.config.ts:62-71`                                                                                                                                              |
| e2e: `seedOtherPerson`, `in2025`, 22 recorridos (el último en `:2059`); `seedProject` con cliente y tareas, `seedTag`, `seedEntries` con descripción, proyecto, tarea y etiquetas; `reportsUrl` | `e2e/reports.spec.ts:161-168`, `:1407`, `:2059`; `e2e/database.ts:270-296`, `:350`, `:497-597`; `e2e/reports-page.ts:255`                                                 |
| Volumen: 30 personas, 8 entradas por día hábil, descripciones de 0 a 2900 caracteres                                                                                                            | `scripts/report-volume/seed.sql:7-21`, `:157-162`                                                                                                                         |

## 1. Alcance

**R6a** entra:

- **`src/server/time`**: `formatDecimalHours`.
- **El módulo `report`**: las constantes y el esquema de una entrada exportada;
  `reportRequestOf` y `searchParamsRecord`; `entryList`; `getReportExport`; el
  documento, el escritor de CSV y el handler de la ruta.
- **La ruta** `src/app/(app)/reportes/exportar/csv/route.ts`.
- **La pantalla**: el grupo «Exportar» con «CSV».
- **La medición** de §6.

**R6b** entra: el escritor de Excel, la ruta `exportar/xlsx`, el enlace «Excel»,
la regla de ESLint de `exceljs`, su medición y la confirmación de
`security-auditor` sobre la alerta de `uuid` (§10, decisión (a)).

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

| Archivo                                      | Qué cambia                                                                                                                                                                       | Qué hay que volver a probar                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/server/time/index.ts`                   | `formatDecimalHours`, nueva. Nada existente cambia.                                                                                                                              | `test:unit` y `test:time-ar`                                                                               |
| `src/modules/report/schema.ts`               | `REPORT_EXPORT_MAX_ENTRIES`, `REPORT_EXPORT_MAX_BYTES`, `REPORT_EXPORT_FORMATS`, `reportEntryRow`, los tipos de las entradas exportadas y dos textos en `reportMessages`.        | `schema.test.ts`                                                                                           |
| `src/app/(app)/reportes/page.tsx`            | Arma el pedido con `reportRequestOf(params)` en lugar de en línea. El pedido que llega a `ReportScreen` es el mismo para toda URL.                                               | `reports.spec.ts` entero (lo cubren los recorridos de URL inválida y de filtros)                           |
| `src/modules/report/repository.ts`           | `entryList`, `ReportEntryListRead` y `EntryListRow`, nuevos. `totalsByLevels`, `totalsByBucket` y `entryTotals` no cambian.                                                      | `service.integration.test.ts` y `scope.integration.test.ts` enteros, con los mismos valores                |
| `src/modules/report/service.ts`              | El cuerpo de `getReportState` pasa a una función privada que también puede leer las entradas; `getReportState` la llama sin ellas y devuelve lo mismo; `getReportExport`, nueva. | Ídem; las dieciséis afirmaciones que cuentan llamadas a `totalsByLevels` (§0 de R5) siguen con sus valores |
| `scope.test-d.ts`                            | `entryList` sin alcance, con `undefined` y con `null` no compila.                                                                                                                | `npm run typecheck`                                                                                        |
| `components/report-href.ts`                  | La query pasa a una función privada; `reportHref` la usa sin cambiar su resultado; `reportExportHref`, nueva.                                                                    | `report-href.test.ts` con los mismos valores                                                               |
| `components/report-toolbar.tsx`, `labels.ts` | El grupo «Exportar» al final, solo con `chart`; sus textos.                                                                                                                      | `report-toolbar.test.tsx`                                                                                  |
| `scripts/report-volume/explain.sql`          | Q40 a Q43. `seed.sql` no cambia.                                                                                                                                                 | —                                                                                                          |
| `e2e/reports-page.ts`, `e2e/reports.spec.ts` | Los helpers de la exportación; los recorridos 23 y 24 (25 en R6b). Ningún export existente se renombra.                                                                          | `reports.spec.ts` entero                                                                                   |
| `eslint.config.mjs` (R6b)                    | `no-restricted-imports` de `exceljs`, salvo en `report/export/xlsx.ts`, `*.test.ts` y `e2e/`.                                                                                    | `npm run lint`                                                                                             |

- **La página no cambia**: el estado es el mismo, sin lecturas nuevas
  (`getReportState` no llama a `entryList`, criterio 5) y la barra suma un grupo.
  Ningún estado armado a mano en los tests cambia de forma.
- **Las ediciones fuera del reparto** siguen la regla de R3 a R5: las hace el
  dueño del tipo que las rompe, con aviso al team-lead, después de que el dueño
  del archivo commitee lo pendiente.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** La lectura de las entradas recorre las
mismas filas que el total (`closedIn` sobre el período). §6 mide; si algo pasa
su presupuesto, vale §6.5 de R3: el slice se detiene y vuelve a `architect`.

## 3. Permisos

**Ninguna acción nueva.** Deciden las que ya existen:

- `report.view` (todos los roles activos): exportar lo que se ve. Sin
  `report.view`, la ruta responde 403 y no lee nada (`service.ts:816-819`).
- `timeEntry.others.view` (owner y admin): que el archivo traiga horas, nombres
  y descripciones de otras personas. La pregunta la hace `scopeOf` una vez;
  `inScope` la traduce también en `entryList`.

Ninguna decisión de acceso vive fuera de `can()`: la ruta no compara roles, no
lee `personas` por su cuenta y no elige el alcance. De la URL llegan los mismos
parámetros que en la página y el formato, que es la carpeta.

## 4. Contrato de lectura

### 4.1 Tipos y constantes (`report/schema.ts`)

```ts
/** D-R6-3: las entradas que entran en un archivo; con más, no se lista ninguna. */
export const REPORT_EXPORT_MAX_ENTRIES = 10_000;

/** D-R6-3, D-R6-11: el peso máximo del cuerpo; con más, las entradas no van. */
export const REPORT_EXPORT_MAX_BYTES = 4_000_000;

/** D-R6-4: una carpeta de `reportes/exportar/` por formato. R6b suma "xlsx"; R7, "pdf". */
export const REPORT_EXPORT_FORMATS = ["csv"] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

// reportMessages suma:
//   /** D-R6-5: 403 de la ruta. */
//   exportForbidden: "No podés exportar reportes.",
//   /** D-R6-5: 500 de la ruta. */
//   exportFailed: "No se pudo exportar el reporte. Volvé y probá de nuevo.",

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** D-R6-3: una entrada del archivo, ya armada en la zona de quien mira (RP-22). */
export const reportEntryRow = z.object({
  id: z.uuid(),
  /** `dayKey` y `formatClock` del inicio y del fin, canónicos (D-R6-9). */
  startDay: z.string().regex(DAY_KEY),
  startClock: z.string().regex(CLOCK),
  endDay: z.string().regex(DAY_KEY),
  endClock: z.string().regex(CLOCK),
  /** `displayNameOf`; `inactive` si la membresía no está activa (RP-31). */
  person: z.object({ name: z.string(), inactive: z.boolean() }),
  /** Nombres; `null` sin proyecto, sin cliente o sin tarea. Archivados o no (RP-29). */
  project: z.string().nullable(),
  client: z.string().nullable(),
  task: z.string().nullable(),
  /** El texto entero, también la cadena vacía (D-R10-12). */
  description: z.string(),
  /** Los nombres, en el orden de `compareNames`. */
  tags: z.array(z.string()),
  billable: z.boolean(),
  /** `entrySeconds` (ADR 0021). */
  seconds: z.number().int().min(0),
});

export type ReportEntryRow = z.infer<typeof reportEntryRow>;

/** D-R6-3: todas, en orden de inicio, o ninguna. */
export type ReportExportEntries =
  | { readonly kind: "listed"; readonly rows: readonly ReportEntryRow[] }
  | { readonly kind: "tooMany" };
```

`reportEntryRow` se exporta para que los tests de integración parseen las filas,
como hacen con `reportReadyState`.

### 4.2 `src/server/time`

```ts
/**
 * Las horas de `minutes` minutos en decimal, con coma y dos decimales, sin
 * separador de miles: «1,50», «2000,00» (D-R6-9). Trunca al centésimo con
 * aritmética entera, `Math.floor(minutes * 5 / 3)` centésimos, como el minuto
 * se trunca desde los segundos: la suma de una columna no pasa el total
 * (D-R6-6). Un valor negativo da «0,00», como `formatDuration`.
 */
export function formatDecimalHours(minutes: number): string;
```

Ninguna otra función de tiempo nueva: los días y las horas de las entradas son
`dayKey` y `formatClock`; la cabecera usa `formatDayKey` y `clockLabel`.

### 4.3 Repository (`report/repository.ts`)

```ts
/** D-R6-3: lo que lee `entryList`: lo de `ReportEntryRead` y cuántas como mucho. */
export type ReportEntryListRead = ReportEntryRead & {
  /** Como mucho estas filas, cualesquiera: sin orden. Entero positivo. */
  readonly limit: number;
};

export type EntryListRow = {
  readonly id: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly seconds: number;
  readonly userId: string;
  readonly accountName: string;
  readonly displayName: string | null;
  readonly status: MembershipStatus;
  readonly projectName: string | null;
  readonly clientName: string | null;
  readonly taskName: string | null;
  readonly description: string;
  readonly billable: boolean;
  /** Con id, para desempatar al ordenar. */
  readonly tags: readonly { readonly id: string; readonly name: string }[];
};

export const reportRepository = {
  totalsByLevels, // sin cambios
  totalsByBucket, // sin cambios
  entryTotals, // sin cambios
  /**
   * D-R6-3: las entradas cerradas con el inicio en `read.span`, dentro de
   * `scope` y de los filtros, una fila por entrada con sus etiquetas en un
   * arreglo. Una sentencia; sin orden.
   */
  async entryList(
    scope: ReportScope,
    read: ReportEntryListRead,
    tx: Executor = db,
  ): Promise<readonly EntryListRow[]>;
};
```

- **El `where`** es `and(inScope(scope), closedIn(read.span), matchesFilter(read.filter))`,
  como `entryTotals` (`repository.ts:776`). **Las uniones**, con alias propios
  (no se cruzan con `filterProject` ni con los de las dimensiones):
  - `membership`, interna (R1: toda entrada tiene membresía), por
    `membership.workspace_id = time_entry.workspace_id` y
    `membership.user_id = time_entry.user_id`;
  - el proyecto, su cliente y la tarea, a izquierda, por `workspace_id` e id:
    el proyecto y la tarea con el workspace de la entrada, el cliente con el
    del proyecto, como las dimensiones (`repository.ts:383-392`, `:418-423`);
  - `user`, interna, y `user_preference`, a izquierda, **por `user_id`**: son
    tablas de la cuenta, sin `workspace_id` (`src/server/db/schema.ts:134-176`),
    y se unen como en la dimensión de persona (`repository.ts:368-369`).
- **Las etiquetas**: una subconsulta correlacionada con `json_agg` de `{ id,
name }` y `coalesce(…, '[]'::json)`, como `entryTags`, estrechada con un
  esquema Zod antes de salir del repository. Con las mismas condiciones de
  workspace que `entryTags` (`src/modules/time-entry/repository.ts:188-193`):
  `tag.workspace_id = time_entry_tag.workspace_id` en la unión y
  `time_entry_tag.workspace_id = time_entry.workspace_id` en el `where`, además
  de los ids. Quitarlas es un mutante equivalente (§8.1). Una unión con
  `time_entry_tag` multiplicaría las filas.
- **`seconds`**: `entrySeconds` como texto convertido con `secondsOf`.
- **Las guardas**, `RangeError` antes de consultar: `checkEntryRead` y un
  `limit` que no es entero positivo.
- **Sin `order by`**: con todo o nada, cuáles vuelven con `limit` no importa;
  ordena el service. Así la base puede cortar al llegar al tope.

### 4.4 Service (`report/service.ts`)

```ts
export type ReportExportState =
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      /** El mismo estado que `getReportState` para el mismo pedido y `now`. */
      readonly report: ReportReadyState;
      readonly entries: ReportExportEntries;
      /** El `now` de la lectura: «Generado» (D-R6-8). */
      readonly generatedAt: Date;
    };

/** D-R6-2: el estado de la página y las entradas, en una sola foto. */
export async function getReportExport(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now?: Date,
): Promise<ReportExportState>;
```

- **Una función privada** con el cuerpo de hoy de `getReportState`
  (`service.ts:810-902`) que recibe además si lee las entradas. `getReportState`
  la llama sin ellas y devuelve el estado, idéntico al de hoy; `getReportExport`
  con ellas. `ReadPlan` suma `entries: boolean` y `ReportRead`, `entries:
readonly EntryListRow[] | null`.
- **En `readReport`, después del gráfico**, si el plan lo pide:
  `reportRepository.entryList(readScope, { span: plan.span, filter, limit:
REPORT_EXPORT_MAX_ENTRIES + 1 }, tx)`, con el mismo `readScope`, el mismo
  `filter` efectivo y el mismo `tx`, también con el primer nivel cortado.
- **Las filas** (`entriesOf`, privada): si vinieron más de
  `REPORT_EXPORT_MAX_ENTRIES`, `{ kind: "tooMany" }`. Si no, cada fila con:
  `startDay`/`endDay` de `dayKey(instante, settings.timezone)`,
  `startClock`/`endClock` de `formatClock`, la persona con `displayNameOf` e
  `inactive: status !== "active"` (como `service.ts:238-245`), las etiquetas
  ordenadas con `compareNames` y solo sus nombres; en orden de `startedAt` y,
  con el mismo inicio, de `id`.
- **Ninguna decisión de acceso cambia** y **ninguna cuenta de zona** sale de
  `src/server/time`.

### 4.5 El pedido (`report/request.ts`, nuevo)

```ts
/**
 * D-R6-4: la query de una URL como el `searchParams` de una página: un
 * `string` por parámetro, o un arreglo si se repite.
 */
export function searchParamsRecord(
  params: URLSearchParams,
): Readonly<Record<string, string | readonly string[]>>;

/**
 * RP-32: el pedido de la página y de la ruta de exportación. Cada parámetro se
 * valida por su lado y uno inválido se descarta sin arrastrar a los otros.
 */
export function reportRequestOf(params: Readonly<Record<string, unknown>>): ReportRequest;
```

`reportRequestOf` es exactamente lo de `page.tsx:19-33`; la página pasa a
llamarla.

### 4.6 El documento (`report/export/types.ts` y `export/document.ts`, nuevos)

```ts
// export/types.ts
/** D-R6-6: qué es cada celda; cómo se escribe lo decide cada formato. */
export type ExportCell =
  | { readonly kind: "text"; readonly text: string }
  /** El número de nivel del resumen. */
  | { readonly kind: "integer"; readonly value: number }
  /** Una clave de día, «2026-10-01». */
  | { readonly kind: "day"; readonly dayKey: string }
  /** Una hora de reloj de 24 h, «09:30». */
  | { readonly kind: "clock"; readonly clock: string }
  /** Una duración en minutos enteros, ya truncada: «Duración». */
  | { readonly kind: "duration"; readonly minutes: number }
  /** La misma duración, como horas: «Horas». */
  | { readonly kind: "hours"; readonly minutes: number }
  | { readonly kind: "empty" };

export type ExportRow = readonly ExportCell[];

/** Una tabla con título: «Resumen» o «Entradas». En CSV, una sección; en Excel, una hoja. */
export type ExportSection = {
  readonly title: string;
  readonly rows: readonly ExportRow[];
};

export type ExportDocument = {
  /** D-R6-8, una fila por dato. */
  readonly header: readonly ExportRow[];
  /** El resumen y las entradas, en ese orden. */
  readonly sections: readonly ExportSection[];
};

/** D-R6-6, D-R6-13: cómo se sirve y se escribe un formato (§4.8). */
export type ExportWriter = {
  readonly contentType: string;
  readonly write: (document: ExportDocument) => Promise<Uint8Array<ArrayBuffer>>;
};

// export/document.ts
export type ReportExportInput = Extract<ReportExportState, { kind: "ready" }> & {
  /** `session.user.name`: la línea del alcance propio (D-R6-8). */
  readonly exporter: string;
};

/** D-R6-6 a D-R6-8. Pura: no lee la base ni el reloj. */
export function exportDocumentOf(
  input: ReportExportInput,
  settings: TimeSettings,
): ExportDocument;

/** D-R6-7: el texto de un grupo, como lo dice `GroupHeading`. */
export function groupTextOf(group: ReportGroup): string;
```

- **La cabecera**, en el orden y con la forma de D-R6-8: cada fila es `text`
  del nombre y `text` del valor; el título, una sola celda `text`. Los nombres
  de «Personas», «Clientes» y «Proyectos», en una sola celda `text`, unidos con
  «, ». Las duraciones de «Total» y «Facturable» son dos celdas, `duration` y
  `hours`, con `Math.floor(segundos / 60)`. «Nota», una fila por nota: la de
  etiquetas (`tagOverlap`) si la etiqueta está en los niveles mostrados, y
  después la del tope (`rowLimit(REPORT_MAX_ROWS)`) si `levelsShown` es mayor
  que 0 y menor que los niveles pedidos.
- **El resumen** («Resumen»):
  - con `levelsShown: 0`, una sola fila con `firstLevelLimit(REPORT_MAX_ROWS)`;
  - sin grupos, una sola fila con `empty` o, con filtros efectivos,
    `emptyFiltered` (D-R4-7);
  - si no, una fila de encabezados («Nivel», los rótulos de los niveles
    mostrados, «Duración», «Horas») y una por grupo, en profundidad, con
    `integer`, los `text` del camino (`groupTextOf`), `empty` en los niveles de
    abajo, `duration` y `hours`.
- **Las entradas** («Entradas»):
  - con `tooMany`, una sola fila con la nota de D-R6-3 (§5.6);
  - si no, los encabezados de §5.6 y una fila por entrada: `day`, `clock`,
    `day`, `clock`, `text` de la persona (con « (inactiva)»), del cliente, del
    proyecto y de la tarea (`empty` si son nulos), `text` de la descripción
    (`empty` si es la cadena vacía), `text` de las etiquetas unidas con «, »
    (`empty` sin ninguna), `text` «Sí» o «No», `duration` y `hours`.
- **`groupTextOf`**: persona, `name` y « (inactiva)» si `inactive`; proyecto,
  `name` y « ({cliente})» si tiene, o `projectLabels.noProject`; cliente,
  `name` o `projectLabels.noClient`; tarea, `name` y « ({proyecto})» si tiene,
  o `noTask`; etiqueta, `name` o `noTag`; fecha, `label`; semana y mes, `label`
  y « {partialDays(partial)}» si hay `partial`; descripción, `text` y «…» si
  `truncated`, o `trackerLabels.noDescription`.
- **Dependencias**: importa los textos de `report/components/labels.ts`,
  `project/components/labels.ts` y `time-entry/components/labels.ts`, que son
  constantes sin React, y las funciones de `src/server/time`. No importa
  ningún componente, ni el service, ni el repository.

### 4.7 El CSV (`report/export/csv.ts`, nuevo)

```ts
/** D-R6-9: BOM, `;`, `\r\n`, todo entre comillas y el `'` de la inyección. */
export function csvBytesOf(document: ExportDocument): Uint8Array<ArrayBuffer>;
```

- **Las líneas**: cada fila de la cabecera; una vacía; el título de la primera
  sección como fila de una celda; sus filas; una vacía; el título de la segunda
  y sus filas. Cada línea termina en `\r\n`. Una línea vacía no tiene campos.
- **Cada campo**: el texto de la celda; si empieza con uno de `=`, `+`, `-`,
  `@`, `\t`, `\r`, un `'` adelante; las comillas duplicadas; entre comillas.
- **Cada celda**: `text`, el texto; `integer`, `String(value)`; `day`, la clave;
  `clock`, la hora; `duration`, `formatDuration(minutes)`; `hours`,
  `formatDecimalHours(minutes)`; `empty`, la cadena vacía.
- **Los bytes**: `﻿` (el BOM) y el texto, en un solo `TextEncoder.encode`,
  que ya devuelve `Uint8Array<ArrayBuffer>`
  (`node_modules/typescript/lib/lib.dom.d.ts:31824`).

### 4.8 El handler y la ruta (`report/export/handler.ts`, nuevo)

```ts
/**
 * D-R6-4, D-R6-5: la descarga de un reporte. La sesión va fuera del `try`:
 * `redirect` lanza y Next responde 307 (redirect.md:51).
 */
export async function handleReportExport(
  request: Request,
  format: ReportExportFormat,
): Promise<Response>;

/** D-R6-5: `reporte_<niveles>_<desde>_<hasta>.<formato>`, solo ASCII. */
export function exportFileNameOf(
  report: ReportReadyState,
  format: ReportExportFormat,
): string;

/**
 * D-R6-3: el archivo; si pasa `maxBytes`, lo escribe otra vez con las entradas
 * en «no entran».
 */
export async function exportBodyOf(
  input: ReportExportInput,
  settings: TimeSettings,
  format: ReportExportFormat,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>>;
```

**Los bytes son `Uint8Array<ArrayBuffer>`** en `csvBytesOf`, `exportBodyOf`,
`xlsxBytesOf` y `ExportWriter` (§4.6), y no `Uint8Array` a secas, que es
`Uint8Array<ArrayBufferLike>`: `new Response(…)` no lo acepta (TS2345), porque
`BodyInit` admite `ArrayBufferView<ArrayBuffer>` y no una vista que pueda estar
sobre un `SharedArrayBuffer` (`node_modules/typescript/lib/lib.dom.d.ts:39167-39168`,
`:39235`; TypeScript 5.9.3 con la `lib` del `tsconfig.json`). Ninguna firma
publicada pide un `as`.

En este orden:

1. `requireSession()`, fuera del `try`.
2. En el `try`: `settings = timeSettingsOf(session)`; `request =
reportRequestOf(searchParamsRecord(new URL(request.url).searchParams))`;
   `getReportExport(session.actor, settings, request)`.
3. `forbidden`: 403 con `reportMessages.exportForbidden` (D-R6-5).
4. `ready`: `exportBodyOf({ ...estado, exporter: session.user.name }, settings,
format, REPORT_EXPORT_MAX_BYTES)`, y 200 con `Content-Type` de la tabla de
   formatos, `Content-Disposition: attachment; filename="${exportFileNameOf(…)}"`
   y `Cache-Control: no-store`.
5. `catch`: `console.error` y 500 con `reportMessages.exportFailed` (D-R6-5).

**La tabla de formatos**, privada, con el `ExportWriter` de `export/types.ts`:

```ts
/** D-R6-6, D-R6-13: cómo se escribe y se sirve cada formato. R6b suma xlsx; R7, pdf. */
const EXPORT_WRITERS = {
  csv: {
    contentType: "text/csv; charset=utf-8",
    write: async (document: ExportDocument) => csvBytesOf(document),
  },
} as const satisfies Record<ReportExportFormat, ExportWriter>;
```

**La ruta** (`src/app/(app)/reportes/exportar/csv/route.ts`, nuevo):

```ts
import { handleReportExport } from "@/modules/report/export/handler";

export async function GET(request: Request): Promise<Response> {
  return handleReportExport(request, "csv");
}
```

### 4.9 Excel (R6b, `report/export/xlsx.ts`, nuevo)

```ts
/** D-R6-12: dos hojas, cada una con la cabecera y su tabla. Solo escribe. */
export async function xlsxBytesOf(
  document: ExportDocument,
): Promise<Uint8Array<ArrayBuffer>>;
```

- `REPORT_EXPORT_FORMATS` suma `"xlsx"`; `EXPORT_WRITERS`, `{ contentType:
"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", write:
async (document) => (await import("./xlsx")).xlsxBytesOf(document) }`; la
  ruta `src/app/(app)/reportes/exportar/xlsx/route.ts`, de una línea.
- **Cada celda**, D-R6-12: `text` como cadena con `numFmt: "@"`; `integer` como
  número; `day` como número de serie (`daysBetweenKeys("1899-12-30", clave)`)
  con `yyyy-mm-dd`; `clock` como `minutos / 1440` con `hh:mm`; `duration` como
  `minutos / 1440` con `[h]:mm`; `hours` como `minutos / 60` con `0.00`;
  `empty`, sin valor. Ninguna celda lleva `formula`.
- **El título de la sección** es el nombre de la hoja; la cabecera va arriba de
  cada hoja, después una fila vacía y la tabla. Los encabezados de columna, en
  negrita.
- **La escritura con `exceljs`**: `new Workbook()`, `addWorksheet`, valores y
  `numFmt`, y `xlsx.writeBuffer()`. Nada de `read`, `load`, `readFile`, `csv`
  ni formato condicional: la lectura la usan solo los tests (D-R6-12). Si
  `next build` no la empaqueta bien, `serverExternalPackages: ["exceljs"]` en
  `next.config.ts`, y lo dice el informe.
- **La conversión del buffer va acá y en ningún otro lado.** `writeBuffer()`
  declara `Promise<Buffer>`, con un `Buffer` propio de sus tipos que extiende
  `ArrayBuffer` (`node_modules/exceljs/index.d.ts:1`, `:1495`); en ejecución es
  un `Buffer` de Node, una vista que puede estar sobre un `ArrayBuffer` más
  grande. `new Uint8Array(await workbook.xlsx.writeBuffer())` copia los bytes a
  un `ArrayBuffer` propio y es asignable a `Uint8Array<ArrayBuffer>` sin `as`
  (`node_modules/typescript/lib/lib.es5.d.ts:2411-2412`).

### 4.10 Costo

- **Una sentencia más por exportación** —`entryList`, en la transacción—,
  ninguna más por página.
- **El archivo**: hasta 4 000 000 bytes; las entradas, hasta 10 000.
- **Lo que viaja al navegador en la página**: un grupo con un enlace (dos en
  R6b), sin JavaScript de cliente.

## 5. Pantalla

### 5.1 El lugar

`ReportToolbar` suma, **después del grupo de «Filtrar por»**
(`report-toolbar.tsx:125-148`), el grupo «Exportar», solo si `state.chart` no
es `null` (D-R6-10). Ninguna otra parte de la pantalla cambia. Sin
`report.view`, como hoy: no hay barra.

### 5.2 El `href` (`components/report-href.ts`)

```ts
/**
 * D-R6-4, D-R6-10: la descarga de un formato, con la misma query string que
 * `reportHref` para los mismos argumentos.
 */
export function reportExportHref(
  format: ReportExportFormat,
  view: Parameters<typeof reportHref>[0],
): string;
```

La query la arma una función privada que usan las dos; `reportHref` devuelve
`/reportes?${query}` y `reportExportHref`, `/reportes/exportar/${format}?${query}`.

### 5.3 El grupo

```tsx
<div className="flex flex-wrap items-center gap-2">
  <span id={EXPORT_LABEL_ID} className="text-muted-foreground text-sm">
    {reportLabels.exportBy}
  </span>
  <div role="group" aria-labelledby={EXPORT_LABEL_ID} className="flex items-center gap-2">
    <a
      href={reportExportHref("csv", { range, ...grouping, filters })}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <DownloadIcon aria-hidden="true" />
      {exportFormatLabels.csv}
    </a>
  </div>
</div>
```

Un `<a>` y no `Link`, sin `download` (D-R6-10). `filters` es el de la barra,
`state.filters`: los efectivos.

### 5.4 Estados

- **Vacío y segundo vacío** (RP-33): sin grupo «Exportar».
- **El primer nivel que no entra** (D-R10-10) y **los niveles cortados**
  (D-R3-6): con grupo.
- **Cargando, error de lectura y sin `report.view`**: como hoy.

### 5.5 Lo que ve quien descarga

El navegador descarga `reporte_….csv` y se queda en `/reportes`. Con la sesión
vencida, va al login. Un 403 o un 500 son una página de texto con el mensaje.

### 5.6 Textos

En `components/labels.ts`:

| Clave                | Texto                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `exportBy`           | «Exportar»                                                               |
| `exportFormatLabels` | `satisfies Record<ReportExportFormat, string>`: «CSV» (R6b suma «Excel») |

En `export/labels.ts` (nuevo):

| Clave                           | Texto                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                         | «Reporte resumido» (`reportLabels.heading`)                                                                                                                                  |
| `period`                        | «Período»                                                                                                                                                                    |
| `timeZone`                      | «Zona horaria»                                                                                                                                                               |
| `scope`                         | «Alcance»                                                                                                                                                                    |
| `scopeEveryone`                 | «Todas las personas del workspace»                                                                                                                                           |
| `scopeSelf`                     | `(nombre) =>` «Solo las horas de {nombre}»                                                                                                                                   |
| `groupedBy`                     | «Agrupado por»                                                                                                                                                               |
| `people`, `clients`, `projects` | `filterNames`: «Personas», «Clientes», «Proyectos»                                                                                                                           |
| `generated`                     | «Generado»                                                                                                                                                                   |
| `note`                          | «Nota»                                                                                                                                                                       |
| `summary`                       | «Resumen»                                                                                                                                                                    |
| `entries`                       | «Entradas»                                                                                                                                                                   |
| `level`                         | «Nivel»                                                                                                                                                                      |
| `hours`                         | «Horas»                                                                                                                                                                      |
| columnas                        | «Fecha de inicio», «Hora de inicio», «Fecha de fin», «Hora de fin», «Persona», «Cliente», «Proyecto», «Tarea», «Descripción», «Etiquetas», «Facturable», «Duración», «Horas» |
| `yes`, `no`                     | «Sí», «No»                                                                                                                                                                   |
| `entriesLimit`                  | `(máximo) =>` «Las entradas no entran en el archivo: son más de {máximo} o pesan más de 4 MB. Acortá el período o filtrá.»                                                   |

«Total», «Facturable», «Duración», los «Sin …», las notas de etiqueta y de
tope y los vacíos son los de la pantalla.

## 6. Volumen y peso

Lo hace `backend-dev` con el código terminado, con el procedimiento de §6 de
R2a, en `postgres:18-alpine`, en una base propia que se borra al terminar. La
sentencia es el texto de `.toSQL()`. El informe lleva, por consulta, el plan
(nodos e índices), las cinco medidas y cuántas filas devolvió, y el team-lead lo
copia al documento de revisiones.

### 6.1 `seed.sql`

Sin cambios.

### 6.2 Las consultas

| Consulta | Qué                                                           | Filas (aprox.) | Presupuesto (mediana) |
| -------- | ------------------------------------------------------------- | -------------- | --------------------- |
| Q40      | `entryList`, `everyone`, el mes pasado entero, `limit` 10 001 | 5300           | ≤ 300 ms              |
| Q41      | `entryList`, `everyone`, 56 días, `limit` 10 001              | 9600           | ≤ 500 ms              |
| Q42      | `entryList`, `everyone`, 366 días, `limit` 10 001 (no entran) | 10 001         | ≤ 500 ms              |
| Q43      | `entryList`, `self`, 366 días                                 | 2100           | ≤ 100 ms              |

### 6.3 Las exportaciones enteras

Desde `getReportExport` hasta los bytes del CSV, sin la sesión, en la copia de
medición y sin commit; mediana de cinco, con el peso del archivo y el pico de
`heapUsed`:

| Pedido                                                                                          | Presupuesto | Peso     |
| ----------------------------------------------------------------------------------------------- | ----------- | -------- |
| E1: el mes pasado, todo el equipo, Persona → Proyecto → Fecha                                   | ≤ 1,5 s     | ≤ 2 MB   |
| E2: 56 días, todo el equipo, Persona (las entradas, cerca del tope)                             | ≤ 2 s       | ≤ 3,5 MB |
| E3: 366 días, todo el equipo, Persona → Proyecto → Fecha (tope de 3000; las entradas no entran) | ≤ 1,5 s     | ≤ 500 KB |
| E4: 366 días, todo el equipo, Descripción (el primer nivel no entra; las entradas no entran)    | ≤ 1,5 s     | ≤ 50 KB  |
| E5: 366 días, una persona, Proyecto                                                             | ≤ 1 s       | ≤ 1 MB   |

El peso de E2 tiene que quedar debajo de `REPORT_EXPORT_MAX_BYTES`: si no, el
tope de entradas está mal elegido y vuelve a `architect`.

### 6.4 Lo que no se mide en local

- **Los límites de Vercel Hobby** (D-R6-11), _no verificados_: el tamaño de la
  respuesta y la duración. Los presupuestos dejan un margen de más de cinco
  veces contra 10 s, para cubrir la red hasta Neon.
- **La página**: un enlace más, sin JavaScript de cliente. No se mide.

### 6.5 R6b

`backend-dev`, en su copia, con `exceljs`: E1 y E2 en `.xlsx`
(≤ 4 s y pico de `heapUsed` ≤ 512 MB), el peso de cada archivo; el tamaño del
código de la ruta `xlsx` en `.next` y del trazado de la función; el primer
pedido después de `next start` a `exportar/xlsx` y a `exportar/csv`, para
confirmar que el CSV no carga la biblioteca.

### 6.6 Si algo pasa el presupuesto

Vale §6.5 de R3: el slice se detiene y vuelve a `architect`. Las alternativas,
en este orden: para Q42, contar antes de listar (`count(*)` con el mismo
`where`) en lugar de traer 10 001 filas; un tope de entradas menor; para el
Excel, la escritura por partes de la biblioteca o un tope propio del formato.

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

**Reglas de la corrida**, de R3b a R5:

- **La integración lee `TEST_DATABASE_URL`, no `DATABASE_URL`**: `src/test/setup.ts:7`
  copia `TEST_DATABASE_URL` en `DATABASE_URL` antes de cargar el cliente, y sin
  ella es `clock_test`, compartida. Cada encargo de integración dice
  `TEST_DATABASE_URL=postgresql://clock:clock@localhost:5432/<base propia>`.
  Para un servidor (`next dev`, `next start`, e2e), en cambio, va
  `DATABASE_URL`.
- **Cada agente que corre integración lleva su base de test propia**: el
  team-lead la crea y la migra antes de lanzarlo y la borra al terminar. Nadie
  usa la de otro. `parity-reviewer` también lleva la suya.
- **La base de e2e se crea y se migra antes de lanzar a `e2e-tester`.**
- **Lo que necesita un servidor propio va en una copia del árbol**: los
  mutantes de e2e, en una copia con su puerto y su base de e2e; la medición de
  §6, en una copia de `backend-dev`.
- **Las corridas van en primer plano.**
- **`parity-analyst` no escribe archivos**: entrega el texto y lo aplica el
  team-lead.
- **Commits con `git commit -- <rutas>`**: el árbol es compartido.
- Postgres local y Neon son 18.

### R6a — backend-dev

```
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/request.ts                            (nuevo)
/home/maxi/program/clock/src/modules/report/request.test.ts                       (nuevo)
/home/maxi/program/clock/src/modules/report/repository.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/scope.test-d.ts
/home/maxi/program/clock/src/modules/report/export/types.ts                       (nuevo)
/home/maxi/program/clock/src/modules/report/export/csv.ts                         (nuevo)
/home/maxi/program/clock/src/modules/report/export/csv.test.ts                    (nuevo)
/home/maxi/program/clock/src/modules/report/export/handler.ts                     (nuevo)
/home/maxi/program/clock/src/modules/report/export/handler.integration.test.ts    (nuevo)
/home/maxi/program/clock/src/app/(app)/reportes/page.tsx
/home/maxi/program/clock/src/app/(app)/reportes/exportar/csv/route.ts             (nuevo)
/home/maxi/program/clock/scripts/report-volume/explain.sql
```

### R6a — frontend-dev

```
/home/maxi/program/clock/src/modules/report/export/document.ts                    (nuevo)
/home/maxi/program/clock/src/modules/report/export/document.test.ts               (nuevo)
/home/maxi/program/clock/src/modules/report/export/labels.ts                      (nuevo)
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/report-href.ts
/home/maxi/program/clock/src/modules/report/components/report-href.test.ts
/home/maxi/program/clock/src/modules/report/components/report-toolbar.tsx
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
```

### R6a — test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Escribe los casos del criterio 6 contra las firmas publicadas, sin mirar la
implementación de `entryList`, y corre en una copia propia, con su base, los
mutantes de las filas **4, 5, 6 y 10** de §8.1, confirmando que cada uno cae
por su afirmación, y el mutante declarado equivalente de §8.1 con la prueba
que ahí se pide.

### R6a — e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                      (23 y 24)
/home/maxi/program/clock/e2e/reports-page.ts
```

- `reports-page.ts`: `EXPORT_GROUP` («Exportar»), `exportGroup(page)`,
  `exportLink(page, label)`, `exportUrl(format, range, groupBy, subgroups,
filters)` —que arma la query como `reportsUrl`—, `recordExportRequests(page)`
  y `readCsv(path)`, que devuelve el texto sin el BOM y afirma que estaba.
  **Ningún export existente se renombra.**
- Los mutantes de §8.2, en una copia con puerto propio.

### R6a — parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

Entrega el texto y **lo aplica el team-lead**, antes del merge, con su
corrección fechada y una sección «15. Núcleo, R6»:

- **RP-54**: qué trae el archivo (cabecera, resumen entero como si estuviera
  expandido, entradas una por una por decisión del usuario), los topes (3000
  filas del resumen; 10 000 entradas o 4 MB, todo o nada), el CSV en español
  (`;`, BOM, coma decimal, `h:mm` y horas), la inyección de fórmulas, las
  fechas canónicas de las entradas, el nombre del archivo.
- **RP-53**: el PDF reusa la ruta y el documento (R7).
- **RP-18**: «Total» y «Facturable» en la cabecera; cada cifra truncada al
  minuto, como en pantalla, y las horas decimales truncadas al centésimo: la
  suma de una columna queda en el total o por debajo, nunca arriba.
- **RP-22**: la zona en la cabecera; los días y las horas de las entradas en la
  zona de quien mira.
- **RP-32**: la misma URL da el mismo archivo; un member con `personas=` exporta
  lo propio.
- **RP-33**: sin entradas no hay «Exportar»; la ruta igual responde.
- **§15.x, divergencias que el reviewer no marca**: RP-54 es diseño propio; la
  exportación es un solo archivo por formato, con secciones; las entradas en el
  mismo archivo que el resumen; sin gráfico; ninguna exportación queda en el
  `audit_log` (§10, decisión (b)).

### R6b

Después del merge de R6a; la decisión del usuario sobre `exceljs` ya está (§10,
decisión (a)):

- **backend-dev**: `/home/maxi/program/clock/src/modules/report/export/xlsx.ts`
  (nuevo), `xlsx.test.ts` (nuevo), `handler.ts`, `schema.ts`,
  `/home/maxi/program/clock/src/app/(app)/reportes/exportar/xlsx/route.ts`
  (nuevo), `/home/maxi/program/clock/eslint.config.mjs`; `next.config.ts` solo
  si el build pide `serverExternalPackages`. `package.json` y
  `package-lock.json` no cambian: `exceljs` 4.4.0 ya está.
- **frontend-dev**: `components/labels.ts` («Excel»), `report-toolbar.tsx` y su
  test.
- **e2e-tester**: el recorrido 25 y su helper `readXlsx(path)`, que lee con
  `exceljs` (la regla lo admite en `e2e/`).
- **security-auditor**: la confirmación de la alerta de `uuid` (§7, paso 15).
- **parity-analyst**: RP-54 con el Excel.

### Lo que no toca nadie

`src/server/permissions/`, `src/server/db/`, `drizzle/`, `src/components/`,
`src/lib/`, el resto de `src/app/` (también `globals.css`),
`src/modules/time-entry/`, `project/`, `profile/`, `workspace/`, `team/`,
`report/period.ts`, `report/chart.ts`, `report/components/report-view.tsx`,
`report-screen.tsx`, `report-tree*`, `group-heading.tsx`, `chart-*`,
`report-chart*`, `range-picker*`, `subgroup-picker*`, `grouping-model*`,
`filter-*`, `scripts/report-volume/seed.sql`, `e2e/database.ts`,
`e2e/days.ts`, los ADR. En R6a, también `package.json`, `next.config.ts` y
`eslint.config.mjs`; en R6b, `package.json` y `package-lock.json`. El mapa y el
estado los actualiza el team-lead.

### Orden

_R6a, ronda 1: `backend-dev` y `frontend-dev`._

1. **Primer commit de `backend-dev`**: en `schema.ts`, las constantes,
   `reportEntryRow`, `ReportExportEntries` y los dos mensajes, con
   `schema.test.ts`; `export/types.ts`; `formatDecimalHours`; `request.ts` y
   `page.tsx`; en `service.ts`, el tipo `ReportExportState` con
   `getReportExport` que lanza `Error("R6a, paso 3")` hasta el paso 3. Los
   criterios 1 a 3. **Avisa a `frontend-dev` y al team-lead**: desde acá las
   formas de las entradas y del documento son las finales.
2. **`frontend-dev`**, desde el paso 1: `export/document.ts`, `export/labels.ts`,
   `reportExportHref` y el grupo de la barra; los criterios 9 y 11.
3. **`backend-dev`**: `entryList`, la lectura en la transacción, `entriesOf` y
   `getReportExport`; `scope.test-d.ts`; `csv.ts`; los criterios 4, 5, 7 y 8.
4. **`backend-dev`**, con el último commit de `frontend-dev`: `handler.ts`, la
   ruta y el criterio 10.
5. **`backend-dev`**: la medición de §6.2 y §6.3.

_R6a, ronda 2: `test-engineer` y `e2e-tester`, con el hash del paso 4._

6. **`test-engineer`**: el criterio 6, los mutantes de las filas 4, 5, 6 y 10 y
   el mutante declarado equivalente de §8.1.
7. **`e2e-tester`**: los helpers y los recorridos 23 y 24, confirmando en su
   copia que cada afirmación nueva cae con su mutante de §8.2.

_R6a, cierre._

8. **El texto de `parity-analyst`**, aplicado por el team-lead.
9. **Revisión de seguridad**: que `entryList` recibe el `readScope` y el filtro
   efectivo; que un member con `personas=` recibe lo propio, también por la
   ruta; que la ruta pasa por `requireSession()` y por el service y no decide
   nada; que ningún texto escrito por alguien llega a una cabecera; `no-store`
   en 200, 403 y 500; la inyección de fórmulas en todos los campos; que no hay
   prefetch de la ruta; que el 307 no se convierte en 500.
10. **Abrir el archivo** (criterio 13), a mano, con lo que haya: el team-lead
    con LibreOffice si está instalado, y el usuario con su Excel si quiere.
11. **Merge como R6a.**

_R6b, después del merge de R6a._

12. **`backend-dev`**: `xlsx.ts`, la tabla de formatos, la ruta, la regla de
    ESLint; los criterios 16, 17 y 19; la medición de §6.5.
13. **`frontend-dev`**: «Excel» en el grupo; el criterio 18.
14. **`e2e-tester`**: el recorrido 25.
15. **Revisión de seguridad de `security-auditor`**, antes del merge: confirma
    la alerta de `uuid` (GHSA-w5hq-g745-h8pq) contra el texto del aviso, que
    este contrato no leyó, y el uso de la biblioteca (solo escribe, solo en
    `xlsx.ts` entre los archivos de producción, sin formato condicional, con
    `import()` dinámico; la lectura, solo en los tests). Si no la confirma, R6b
    se detiene y vuelve al usuario. Después, **paridad**, **abrir el archivo**
    (criterio 21) y **merge como R6b**.

## 8. Criterios de aceptación

_R6a._

1. **Las horas decimales** (unidad, `time.test.ts`, en UTC y en `test:time-ar`)
   — `formatDecimalHours` da «0,00» con 0, «0,01» con 1, «0,03» con 2, «0,50»
   con 30, «1,48» con 89, «1,50» con 90, «23,98» con 1439, «2000,00» con 120 000
   y «0,00» con −5.
2. **Los esquemas** (unidad, `schema.test.ts`) — `reportEntryRow` admite una
   fila completa y una con proyecto, cliente y tarea nulos, sin etiquetas y con
   la descripción vacía; rechaza `startDay` «1/10/2026», `endClock` «24:00» y
   «9:30», `seconds` −1 y 1,5; las constantes valen 10 000, 4 000 000 y
   `["csv"]`; `reportMessages` tiene los dos textos.
3. **El pedido** (unidad, `request.test.ts`) — `searchParamsRecord` da un
   `string` por parámetro y un arreglo con `desde=a&desde=b`; `reportRequestOf`
   da, para cada una de estas queries, el pedido literal que armaba la página:
   vacía; válida con subniveles y los tres filtros; con el rango invertido; con
   `agrupar=cualquiera`; con `subagrupar=persona` repitiendo el primero; con
   `personas=a,a`; y **con `desde` repetido, el rango descartado y lo demás
   igual**.
4. **La lectura de las entradas** (integración, `service.integration.test.ts`) —
   - una entrada con un proyecto con cliente, una tarea, dos etiquetas («Beta»
     y «alfa»), facturable y una descripción de 3000 caracteres: **una fila**,
     con todo, la descripción entera y las dos etiquetas;
   - sin proyecto: proyecto, cliente y tarea nulos; un proyecto sin cliente:
     cliente nulo;
   - el timer en curso no viene; una entrada que empieza un milisegundo antes
     del fin del período sí, y la que empieza en el fin no;
   - **la suma de `seconds` de las filas es la de `entryTotals`** para la misma
     lectura, con entradas sembradas con microsegundos, sin filtros, con un
     proyecto, con «Sin proyecto» y con un cliente;
   - con tres entradas y `limit: 2`, dos filas;
   - `RangeError` sin consultar con 51 proyectos en el filtro y con `limit` 0,
     −1 y 1,5.
5. **La exportación** (integración) —
   - **`report` es igual a `getReportState`** del mismo pedido y el mismo
     `now`, con tres niveles, filtros y `personas`, y con el primer nivel
     cortado (el test de las 3001 descripciones de R10b);
   - las entradas en orden de inicio y, con el mismo inicio, de id; **la suma de
     sus `seconds` es `report.totalSeconds`**, también agrupando por etiqueta
     con una entrada de dos etiquetas;
   - una entrada a las 23:30 del 30/09 de Buenos Aires: `startDay`
     «2026-09-30» y `startClock` «23:30» para quien mira desde Buenos Aires, y
     «2026-10-01» y «04:30» desde Madrid; una que termina después de
     medianoche lleva `endDay` del día siguiente;
   - la persona con su nombre editado e `inactive` con la membresía inactiva;
     las etiquetas «alfa», «Beta»;
   - **con `REPORT_EXPORT_MAX_ENTRIES` entradas, `listed` con todas; con una
     más, `tooMany`**, y `report` igual en los dos (los totales las cuentan);
   - **la misma foto** (espías sobre `entryList`, `totalsByLevels` y
     `entryTotals`): una llamada a `entryList`, con el mismo `Executor` que las
     demás, dentro de la transacción `repeatable read`, `read only`, con
     `limit` `REPORT_EXPORT_MAX_ENTRIES + 1`, el filtro efectivo y el alcance
     angostado cuando hay personas elegidas;
   - **`getReportState` no llama a `entryList`** y las afirmaciones de §0 de R5
     siguen con sus valores;
   - sin `report.view`: `forbidden` y ninguna lectura; `generatedAt` es `now`.
6. **El alcance** (`scope.integration.test.ts`) — `entryList` directo con cada
   alcance: owner y admin ven todo A, también al inactivo, y nada de B;
   `project_manager`, `team_manager` y `member`, solo lo propio; el owner de B,
   nada de A; `chosen`, solo las elegidas y del workspace. Por
   `getReportExport`: un member, un `project_manager` y un `team_manager` con
   `personas=…` armado a mano reciben entradas solo propias, iguales a las de
   su pedido sin `personas`.
7. **El tipo** (`scope.test-d.ts`) — `entryList` sin alcance, con `undefined` y
   con `null` no compila.
8. **El CSV** (unidad, `export/csv.test.ts`) — un documento chico da
   exactamente los bytes esperados: el BOM una vez; `;`; `\r\n` también al
   final; cada campo entre comillas, el vacío como `""`; las líneas vacías y
   los títulos de las secciones. Y por celda: `Dice "hola"` → `"Dice ""hola"""`;
   `a;b` y un salto de línea quedan adentro; `=1+1`, `+1`, `-1`, `@SUMA(A1)`,
   `\tx` y `\rx` llevan el `'` adelante; `a=b`, ` =x` y `'x` no; `duration` 90 →
   «1:30» y 120 000 → «2000:00»; `hours` 89 → «1,48»; `day`, `clock`,
   `integer` y `empty`.
9. **El documento** (unidad, `export/document.test.ts`) —
   - la cabecera: el período con año en `dd/MM/yyyy` y en `yyyy-MM-dd`, y un
     solo día; la zona; el alcance `everyone` y `self` con el nombre; «Agrupado
     por» con los pedidos; las personas elegidas con «(inactiva)», los clientes
     y los proyectos con «Sin proyecto» al final, por nombre y en el orden de
     las opciones, **cada filtro en una sola celda con los nombres unidos con
     «, »**, y ninguna línea sin filtros; «Total» y «Facturable» con 3599 s →
     «0:59» y «0,98»; «Generado» en 24 h y en 12 h; la nota de etiquetas solo
     con la etiqueta en los niveles **mostrados**, y la del tope solo con
     niveles cortados; **con las dos, dos filas «Nota», la de etiquetas
     primero**; con el primer nivel cortado, ninguna nota de tope en la
     cabecera;
   - el resumen: «Nivel» y una columna por nivel mostrado; las filas en
     profundidad, con los antepasados repetidos y vacíos los niveles de abajo;
     `groupTextOf` de cada tipo y de cada «Sin …», la semana y el mes con
     «solo …», la descripción con «…»; los minutos de cada fila iguales a los
     de `durationLabel`; el vacío, el segundo vacío y el primer nivel cortado,
     cada uno con su nota y sin encabezados;
   - las entradas: los encabezados y una fila por entrada, «Sí» y «No», las
     etiquetas unidas con «, », «(inactiva)», las celdas vacías de lo nulo;
     `tooMany` con su nota y sin filas.
10. **La ruta** (integración, `export/handler.integration.test.ts`, con
    `next/headers`, `next/navigation` y `@/server/auth` simulados) —
    - 200 con `Content-Type: text/csv; charset=utf-8`, `Content-Disposition:
attachment; filename="reporte_persona-proyecto_2026-09-28_2026-10-04.csv"`
      y **`Cache-Control: no-store` exacto**; el cuerpo empieza con el BOM y
      trae las filas de la persona;
    - el nombre con un nivel y con `descripcion`; todo nombre cumple
      `^reporte_[a-z-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$`;
    - **sin sesión**, la promesa rechaza con el `redirect("/login")` simulado y
      no se lee nada;
    - con la membresía inactiva: 403, el texto, `no-store` y sin
      `Content-Disposition`;
    - **un member con `personas=<otra>`**: solo lo propio; la descripción de la
      otra persona no está en el cuerpo;
    - con `desde` inválido y `agrupar=cualquiera`, y con `desde` repetido: el
      archivo del pedido de `reportRequestOf`, igual que el de la página;
    - `entryList` que rechaza: 500, el texto, `no-store` y `console.error`;
    - `exportBodyOf` con `maxBytes` menor que el archivo: la nota de las
      entradas y ninguna fila de entradas; con `maxBytes` mayor: las filas.
11. **La pantalla** (unidad) —
    - `report-href.test.ts`: `reportExportHref("csv", x)` es
      `/reportes/exportar/csv?` más exactamente la query de `reportHref(x)`,
      con subniveles, los tres filtros y «Sin proyecto»; los valores de
      `reportHref` existentes no cambian;
    - `report-toolbar.test.tsx`: con `chart`, el grupo «Exportar» es el último
      de la barra, con un `<a>` «CSV» cuyo `href` es el de `reportExportHref`
      con `state.filters`, y **sin el atributo `download`**; con `chart: null`,
      ningún grupo «Exportar».
12. **El rendimiento y el peso** (manual, §6.2 y §6.3) — dentro del presupuesto.
13. **Abrir el archivo** (manual) — el CSV de E1 abierto con Excel en español y
    con LibreOffice Calc en `es-AR` (doble clic, sin el asistente donde se
    pueda): las columnas separadas; los acentos bien; «Horas» como números
    alineados a la derecha, y `=SUMA()` de la columna da la suma; una
    descripción «=1+1» se ve como texto con el `'`; «2000:00» se ve como se
    escribió. Lo que no se pudo abrir se dice en el informe, con el motivo.
14. **De punta a punta** — los recorridos 23 y 24 de §8.2.
15. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`,
    `next build` y la suite e2e entera. Ninguna afirmación existente cambia de
    valor.

_R6b._

16. **El Excel** (unidad, `export/xlsx.test.ts`, leyendo con `xlsx.load` de
    `exceljs` el archivo que escribió el test) — dos hojas, «Resumen» y
    «Entradas», cada una con la cabecera, una fila vacía y su tabla; **ninguna
    celda con fórmula**, también con «=1+1», que es una cadena con `numFmt`
    `@`; `duration` 90 → 90 / 1440 con `[h]:mm`; `hours` 89 → 89 / 60 con
    `0.00`; `day` «2024-01-01» → 45292 con `yyyy-mm-dd`; `clock` «09:30» → 570
    / 1440 con `hh:mm`; `integer` como número.
17. **La ruta en Excel** (integración) — 200 con el `Content-Type` de `.xlsx`,
    el nombre `.xlsx`, `no-store` y el cuerpo que empieza con `PK\x03\x04`.
18. **La pantalla** (unidad) — «Excel» después de «CSV», con su `href`.
19. **La biblioteca en un solo archivo de producción** (lint) — con un `import`
    de `exceljs` en otro archivo de producción del módulo
    (`export/document.ts`, por ejemplo), `npm run lint` falla; en
    `export/xlsx.ts`, en un `*.test.ts` y en `e2e/`, no.
20. **El rendimiento, el peso y el arranque** (manual, §6.5).
21. **Abrir el `.xlsx`** (manual) — en Excel y en LibreOffice: las dos hojas, las
    duraciones sumables con `[h]:mm`, las fechas como fecha, «=1+1» como texto.
22. **De punta a punta** — el recorrido 25.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                          | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad      | `src/server/time/time.test.ts`                   | punto en lugar de coma; `round` en lugar de truncar (cae con 1); un decimal; separador de miles (cae con 120 000); el negativo sin acotar                                                                                                                                                                                                                                                                   |
| 2        | unidad      | `report/schema.test.ts`                          | la regex de día o de hora quitada; `.min(0)` o `.int()` de `seconds` quitados                                                                                                                                                                                                                                                                                                                               |
| 3        | unidad      | `report/request.test.ts`                         | `searchParams.get` en lugar de juntar los repetidos (cae con `desde` repetido); un parámetro inválido que descarta a los otros                                                                                                                                                                                                                                                                              |
| 4        | integración | `service.integration.test.ts`                    | sin `closedIn` (cae con el timer); `lte` en lugar de `lt` (cae con el fin); la descripción con `left`; las etiquetas por `join` (dos filas); sin `matchesFilter` o sin el filtro de cliente; sin `limit`; sin `checkEntryRead`; `limit` sin validar                                                                                                                                                         |
| 5        | integración | `service.integration.test.ts`                    | las entradas con `scope` en lugar de `readScope` (cae con `personas`); con el filtro del pedido en lugar del efectivo; leídas con `db` o fuera de la transacción; `limit` `MAX` en lugar de `MAX + 1`, o `>=` en lugar de `>` (caen con exactamente `MAX`); sin desempate por id; el día en UTC o en la zona del proceso (cae con Madrid); `getReportState` que lee las entradas; las etiquetas sin ordenar |
| 6        | integración | `scope.integration.test.ts`                      | `inScope` quitado en `entryList`; `everyone` fijo; el alcance sin angostar con `personas`                                                                                                                                                                                                                                                                                                                   |
| 7        | tipos       | `report/scope.test-d.ts`                         | el alcance de `entryList` opcional                                                                                                                                                                                                                                                                                                                                                                          |
| 8        | unidad      | `export/csv.test.ts`                             | sin BOM; BOM por línea; `,` como separador; `\n` en lugar de `\r\n`; campos sin comillas; comillas sin duplicar; **cada uno de los seis caracteres quitado de la lista** (seis mutantes); el prefijo en cualquier posición (cae con `a=b`); las horas con punto                                                                                                                                             |
| 9        | unidad      | `export/document.test.ts`                        | el período sin año; los filtros por id; «(inactiva)» quitado; los antepasados sin repetir; la columna de un nivel pedido que no se muestra (cae con el tope); los minutos redondeados (cae con 3599 s); «solo …» o «…» quitados; la nota de etiquetas con los niveles pedidos; «Sí» y «No» invertidos; `tooMany` con filas; las notas en el orden inverso; un filtro con una celda por nombre               |
| 10       | integración | `export/handler.integration.test.ts`             | sin `no-store`; `inline` en lugar de `attachment`; `requireSession` dentro del `try` (cae: 500 en lugar del redirect); 200 con `forbidden`; el pedido sin `reportRequestOf` (cae con `desde` repetido); el 500 sin `no-store`; el guard de peso quitado                                                                                                                                                     |
| 11       | componente  | `report-href.test.ts`; `report-toolbar.test.tsx` | el `href` a `/reportes`; sin subniveles o sin filtros; el atributo `download`; el grupo con `chart: null`; el grupo antes de «Filtrar por»                                                                                                                                                                                                                                                                  |
| 12, 13   | manual      | informes de `backend-dev` y del team-lead        | —                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14       | e2e         | `e2e/reports.spec.ts`                            | los del final de §8.2                                                                                                                                                                                                                                                                                                                                                                                       |
| 15       | todas       | las suites existentes                            | —                                                                                                                                                                                                                                                                                                                                                                                                           |
| 16       | unidad      | `export/xlsx.test.ts`                            | una cadena escrita como `{ formula }`; sin `numFmt` `@`; la duración como texto; `h:mm` en lugar de `[h]:mm`; la fecha como texto; el serial desde 1899-12-31 (cae con 45292)                                                                                                                                                                                                                               |
| 17       | integración | `export/handler.integration.test.ts`             | el `Content-Type` del CSV; la extensión `.csv`                                                                                                                                                                                                                                                                                                                                                              |
| 18       | componente  | `report-toolbar.test.tsx`                        | «Excel» sin `href` al formato                                                                                                                                                                                                                                                                                                                                                                               |
| 19       | lint        | `eslint.config.mjs`                              | la regla quitada; la excepción ampliada a `src/**`                                                                                                                                                                                                                                                                                                                                                          |
| 22       | e2e         | `e2e/reports.spec.ts`                            | el recorrido 25 con la duración como texto                                                                                                                                                                                                                                                                                                                                                                  |

**Mutante declarado equivalente:** la subconsulta de etiquetas de `entryList`
sin `tag.workspace_id = time_entry_tag.workspace_id` o sin
`time_entry_tag.workspace_id = time_entry.workspace_id`. Las claves compuestas
de `time_entry_tag` a la entrada y a la etiqueta
(`src/server/db/schema.ts:499-516`) no dejan sembrar una entrada de un
workspace con una etiqueta de otro, ni a mano, y los ids de `tag` y de
`time_entry` son únicos, así que trae lo mismo; las condiciones quedan porque
son las claves que los atan, como en `entryTags`. Antes de darlo por
equivalente, `test-engineer` corre los criterios 4 y 6 con el mutante, también
con una etiqueta de B que se llama igual que una de A, y anota que las
respuestas son las mismas. **Cualquier otro mutante declarado equivalente** se
prueba antes con pedidos de una membresía inactiva, de otro workspace y de un
member con horas ajenas en el rango.

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los veintidós de R2a a R5 no cambian. Se suman dos en R6a
y uno en R6b, con la regla de §8.3 de R2a y D-R6-14; la persona de la sesión es
member y los nombres llevan el sufijo del test.

**Las entradas de los tres**, sembradas con `seedProject` («Web {sufijo}» con el
cliente «ACME {sufijo}» y la tarea «Diseño»), `seedTag` («Urgente {sufijo}») y
`seedEntries` en la zona de la persona:

| Día        | Horas         | Proyecto, tarea, etiquetas | Descripción            |
| ---------- | ------------- | -------------------------- | ---------------------- |
| 2025-09-15 | 09:00 – 10:30 | Web, Diseño, Urgente       | `Revisión "final"; v2` |
| 2025-09-16 | 10:00 – 10:30 | —                          | `=1+1`                 |
| 2025-09-17 | 14:00 – 14:45 | Web                        | `-guion {sufijo}`      |

23. **Exportar a CSV el resumen y las entradas** (RP-54, RP-33, RP-22; D-R6-2 a
    D-R6-10).
    - En la semana actual, sin horas: ningún grupo «Exportar».
    - `reportsUrl` del 2025-09-15 al 2025-09-21 por Proyecto → Fecha: el grupo
      «Exportar» con el enlace «CSV», cuyo `href` es `/reportes/exportar/csv`
      con **la misma query** que la URL de la página.
    - **Sin prefetch**: grabando los pedidos desde que se abre la página, con el
      puntero sobre «CSV» y la red quieta, **ningún pedido a
      `/reportes/exportar`**.
    - Clic en «CSV»: un evento `download` con `suggestedFilename()`
      `reporte_proyecto-fecha_2025-09-15_2025-09-21.csv`, y la página sigue en
      `/reportes`. El archivo empieza con `EF BB BF` y trae, con los rótulos
      calculados con `days.ts`:
      - `"Período";"15/09/2025 – 21/09/2025"`, `"Zona horaria";"{zona}"` y
        `"Alcance";"Solo las horas de {nombre}"`;
      - `"1";"Web {sufijo} (ACME {sufijo})";"";"2:15";"2,25"`, la fila de nivel
        2 del 15/09 con `"1:30";"1,50"` y `"1";"Sin proyecto";"";"0:30";"0,50"`;
      - la entrada del 15/09: `"2025-09-15";"09:00";"2025-09-15";"10:30";"{nombre}";"ACME {sufijo}";"Web {sufijo}";"Diseño";"Revisión ""final""; v2";"Urgente {sufijo}";"No";"1:30";"1,50"`;
      - `"'=1+1"` y `"'-guion {sufijo}"`.
    - `page.request.get(href)`: 200; `cache-control` contiene `no-store`;
      `content-type` `text/csv; charset=utf-8`; `content-disposition` con
      `attachment` y el nombre.
24. **Sin sesión al login, y un member con personas ajenas exporta lo propio**
    (D-R6-5, RP-32, D-R4-4). Otra persona (`seedOtherPerson`) con una entrada
    del 2025-09-16, «ajena {sufijo}».
    - `page.request.get` de `/reportes/exportar/csv` con el período y
      `personas=<id de la otra>`: 200; el cuerpo trae `-guion {sufijo}` y **no**
      trae «ajena {sufijo}» ni el nombre de la otra; el alcance es el propio.
    - Un contexto de pedidos sin cookies, `get` de la misma URL con
      `maxRedirects: 0`: **307** y `location` que termina en `/login`.

_R6b._

25. **Exportar a Excel** (RP-54; D-R6-12). Las mismas entradas y la misma URL que
    el 23: el enlace «Excel» después de «CSV»; el clic descarga
    `reporte_proyecto-fecha_2025-09-15_2025-09-21.xlsx`; leído con `readXlsx`
    (`exceljs`, que la regla de ESLint admite en `e2e/`): las hojas «Resumen» y
    «Entradas»; la duración de «Web {sufijo}» es el número 135 / 1440 con
    `[h]:mm`; la descripción «=1+1» es una cadena sin fórmula.

Los mutantes que tienen que caer en e2e, corridos en una copia con puerto
propio: `Link` en lugar de `<a>` (23: hay un pedido antes del clic); sin
`no-store` (23); `inline` (23: no hay `download`); sin BOM o con `,` (23); sin
el prefijo (23); el `href` sin los subniveles (23: la query no coincide);
`scope` en lugar de `readScope` en las entradas (24: trae «ajena»); un 401 en
lugar de `requireSession` (24); el grupo sin la condición de `chart` (23: hay
«Exportar» en la semana vacía).

### 8.3 La regla de los e2e

La de §8.3 de R2a, con D-R6-14. Los tres recorridos son de alcance propio y
afirman filas de su propia persona en una semana fija de 2025; no cambian el
rol, el estado ni el primer día de la semana de nadie, y ninguno toca la
membresía del owner ni el workspace.

### 8.4 Lo que no se prueba en e2e

- **Las zonas, el día de fin y el tope de 10 000**: criterio 5.
- **El alcance con `everyone`**: criterios 5 y 6.
- **El 403, el 500 y el tope de peso**: criterio 10.
- **Cómo lo abre cada planilla**: criterios 13 y 21.
- **Los límites de Vercel**: §6.4 y la comprobación del usuario después del
  despliegue.

## 9. Riesgos y deuda conocida

- **Un año del equipo no trae las entradas** (unas 62 000 contra 10 000): el
  archivo lo dice y ofrece acortar o filtrar. Si administración necesita el año
  entero, son doce exportaciones mensuales, o un tope mayor después de medir en
  Vercel.
- **Los límites de Vercel no están verificados** (D-R6-11). Si el cuerpo de 4 MB
  o el tiempo no alcanzan en producción, se baja `REPORT_EXPORT_MAX_BYTES` o
  `REPORT_EXPORT_MAX_ENTRIES`: dos constantes.
- **Un CSV con coma decimal en un Excel en inglés** lee «1,50» como texto o como 150. El destinatario es una empresa en español; para cualquier otra
  configuración, el `.xlsx` de R6b, que guarda números.
- **«Duración» como `h:mm` en el CSV** puede leerse como una hora del día en
  algunas planillas; «Horas» es la columna para sumar. El criterio 13 lo mira.
- **La suma de una columna de «Duración» o de «Horas» puede quedar debajo del
  total, nunca arriba**: cada cifra se trunca al minuto, como en pantalla
  (D-R2a-7), y las horas además al centésimo (D-R6-6). Con muchas entradas
  cortas la diferencia se nota: cien entradas de 1 minuto suman «1,00» en
  «Horas» contra «1,66» del total.
- **Un rótulo de fecha sin año** en el resumen es del año de hoy, como en
  pantalla: abierto un año después, la cabecera («Período», «Generado») dice
  cuál es. Las entradas llevan siempre el día completo.
- **Una descripción que empieza con `-`, `+`, `=` o `@`** se lee con un `'`
  adelante en el CSV. Es el precio de la protección; en el Excel no pasa.
- **Exportar lee hasta 10 001 filas** en el peor caso aunque no entren (Q42).
  Una persona con sesión puede pedirlo seguido; no hay límite de pedidos (el
  servidor no guarda estado). §6.6 tiene la salida si pesa.
- **El nombre del archivo no dice el formato de los filtros**: dos archivos del
  mismo período y la misma agrupación con filtros distintos se llaman igual;
  el navegador agrega un número.
- **Sin lector de pantalla en CI**: el grupo y sus enlaces los afirman los tests
  de componente y los e2e por rol y nombre.
- **`exceljs` trae una moderada aceptada** (`uuid`, §10, decisión (a)) y no
  publica desde 2024-12-20. Se vuelve a mirar si aparece un aviso alto en su
  árbol o uno que toque la escritura, o si CI baja el nivel a moderado.
- **R6b depende de la confirmación de `security-auditor`** (§7, paso 15); si no
  la da, vuelve al usuario y, mientras tanto, solo CSV.

## 10. Decisiones del usuario, notas y pendientes

### Decisiones del usuario (2026-10-12)

Comunicadas por el team-lead el 2026-10-12, en respuesta a las dos preguntas de
la primera versión de este contrato.

**(a) `exceljs` 4.4.0 en producción, aceptada con la alerta de `uuid <11.1.1`**
(GHSA-w5hq-g745-h8pq). Según el encargo, `npm audit --omit=dev` da seis
moderadas; esa llega por `exceljs >=3.5.0`, y el arreglo que sugiere `npm` es
bajar a `exceljs@3.4.0`, un cambio de versión mayor hacia atrás que no se toma.
CI audita producción con `--audit-level=high` (`ci.yml:41`): la moderada no lo
rompe.

- **Las condiciones**: entre los archivos de producción, `exceljs` solo en
  `report/export/xlsx.ts` (regla de ESLint, D-R6-12), solo para escribir a un
  buffer, sin formato condicional, cargada con `import()` dinámico. Se vuelve a
  mirar si aparece un aviso alto en su árbol o uno que toque la escritura
  (`jszip`, sus `xform`), o si CI baja el nivel a moderado.
- **Lo que dice el árbol**, para la revisión:
  - `exceljs` usa `uuid` en un solo archivo, como `v4()` **sin argumentos**,
    solo para reglas de formato condicional con extensión
    (`cf-rule-ext-xform.js:1`, `:43`, `:77`). La exportación no escribe
    formato condicional: el código no se alcanza, y si se alcanzara, no pasa
    `buf`. Que el aviso trate de `buf` es lo que dice el encargo; **el texto
    del aviso no se leyó** (sin red).
  - Lo que escribe pasa por `jszip` (`xlsx.js:2-4`); lo que lee
    (`unzipper`, `saxes`, `fast-csv`) viaja en el paquete pero en producción
    no se llama.
  - La última publicación de `exceljs` fue el 2024-12-20 (dato del encargo; el
    mapa decía 2023).
- **La confirmación de `security-auditor`** es paso de R6b antes del merge
  (§7, paso 15): lee el texto del aviso y confirma que el uso no lo alcanza. Si
  no lo confirma, R6b se detiene y vuelve al usuario; R6a no cambia.
- **El ADR 0022** sobre la aceptación, si el usuario lo quiere, es suyo; este
  contrato no lo abre.

**(b) Ninguna exportación va al `audit_log`.** Hoy ninguna lectura se audita y
el archivo trae lo mismo que la pantalla ya muestra; sumarlo sería una
escritura fuera de la transacción de solo lectura y una acción de auditoría
nueva.

### Nota para el usuario

1. **El criterio 13 se prueba mejor con tu Excel.** Si podés, abrí el CSV de un
   mes y fijate que las columnas se separen, los acentos se vean bien, «Horas»
   se sume con `=SUMA()` y una descripción «=1+1» se vea como texto.

### Para el team-lead

1. **El encargo no nombraba las entradas una por una** (mapa §5,
   `nucleo-reportes-mapa.md:405-406`). Están (D-R6-3), y son la razón de partir
   el slice.
2. **No van ni el atributo `download` ni `filename*`** (D-R6-5, D-R6-10): el
   primero guardaría el login como archivo con la sesión vencida; el segundo no
   agrega nada con un nombre ASCII por construcción, que además deja fuera de
   las cabeceras todo texto que alguien escriba.
3. **Dos frases del mapa se ajustan**: el tope de R6 es el de R3 solo para el
   resumen; y la fecha de la última versión de `exceljs` (2023 en el mapa,
   2024-12-20 en el encargo). Si el mapa se actualiza, R6 dice «las entradas,
   hasta 10 000 o 4 MB, todo o nada».
4. **La comprobación en Vercel queda para después del despliegue**, en
   producción y por el usuario: descargar un CSV, ver en las herramientas del
   navegador `Cache-Control: no-store` y el nombre, y cuánto tarda un mes del
   equipo. El preview solo admite login en la rama de `BETTER_AUTH_URL`.
5. **`page.tsx` cambia** (una línea de composición, a `reportRequestOf`), aunque
   R5 dejaba `src/app/` fuera del reparto: lo hace `backend-dev`.
6. **CLAUDE.md queda desactualizado con la ruta nueva.** Describe `(app)/` como
   «shell con sesión obligatoria» y dice que las lecturas van «desde Server
   Components», y un Route Handler en `(app)` no hereda el shell
   (`15-route-handlers.md:150-155`). No pide ADR: el ADR 0020 ya nombra la ruta
   de exportación como puerta de entrada que pasa por el mismo service. El
   texto, al mergear R6a:

   En «Estructura», la línea de `(app)/` pasa a ser estas dos:

   ```
       (app)/             shell con sesión obligatoria; un route.ts no lo hereda
         reportes/exportar/ descargas, una carpeta por formato (Route Handlers)
   ```

   En «Recorrido de una mutación», el párrafo de las lecturas pasa a ser:

   > Las lecturas van por el service desde Server Components. Una descarga es
   > un Route Handler de `(app)/reportes/exportar/<formato>/`, que no hereda el
   > shell de `(app)`: pide su sesión con `requireSession()` fuera del `try`
   > (sin sesión, 307 a `/login`), arma el pedido con el mismo parseo que la
   > página, lee por el mismo service y responde con `Cache-Control: no-store`.
   > Un service no importa de `app/` ni de `components/`; un componente no
   > importa un repository.

## 11. Fuera de alcance

- El PDF (R7) y el gráfico en el archivo (D-R6-2).
- Elegir columnas, el orden o el separador; un CSV por sección o un ZIP.
- Exportar solo lo expandido en pantalla.
- Redondeo (RP-36) e importes (RP-09).
- Exportaciones programadas o por correo (RP-56).
- Leer o importar archivos de cualquier formato.
- Un tope de pedidos por persona.
- Streaming de la respuesta.
