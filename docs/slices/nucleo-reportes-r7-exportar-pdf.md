# Núcleo de reportes, R7: exportar a PDF

Contrato del slice R7 del núcleo de reportes. Suma un formato a la ruta de
R6: `/reportes/exportar/pdf`, con la misma query string que `/reportes`, la
misma sesión, el mismo alcance, la misma foto, `no-store` y el mismo nombre de
archivo. El PDF trae la cabecera y el resumen del `ExportDocument` de R6,
**sin las entradas una por una**, en páginas A4 con los encabezados de la tabla
en cada una, dibujado con `pdfkit` y la fuente Noto Sans incrustada. Sin
cambios de tablas, de índices ni de permisos.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`, RP-53
  (`replicar`): «PDF (Free plan) or CSV/Excel (Basic plan or higher)», «A PDF
  file can contain up to 3000 rows.», «Export of Summary report doesn't contain
  timestamps.», «Grouping options in Summary report will affect how your
  exports look like.», «you can disable certain information (user, charts,
  etc.) from appearing on PDF» y «Only the data covered in the report will be
  exported.» (`reportes.md:1585-1612`). Se apoya en lo que R6 dejó para RP-18,
  RP-22, RP-28, RP-31, RP-32, RP-33 y RP-54 (sección 15 de `reportes.md`).
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R7»
  (`:324-344`) y el riesgo de `no-store` de R6 que «vale también para el PDF de
  R7» (`:305-306`). Depende de R6 entero, que está en `main` (`31a83b3`), y,
  solo si el PDF lleva el gráfico, de R5.
- **Tres partes** (D-R7-1): **R7-0**, la medición, **hecha**
  ([informe](nucleo-reportes-r7-medicion.md), `b26c589`); **R7a**, el PDF de la
  cabecera y el resumen; **R7b**, el gráfico de R5 dentro del PDF, que no se
  arranca hasta que el usuario lo pida (§10).
- **Los números de este contrato salen del informe de R7-0.** El architect no
  tuvo shell: lo que no midió R7-0 está marcado como presupuesto o _no
  verificado_.
- **Revisión del contrato:** primera y segunda pasada de
  `architecture-reviewer` aplicadas el 2026-10-12
  ([correcciones](correcciones-nucleo-reportes-r7-contrato.md)); aprobado, sin
  tercera pasada. Esta versión lo adapta a las decisiones del 2026-10-12
  (§10), tomadas con la medición.
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0022](../adr/0022-el-pdf-del-reporte-se-dibuja-con-pdfkit.md): el PDF
    se dibuja en el servidor con `pdfkit`, empaquetado, con la tabla y la
    paginación a mano y Noto Sans incrustada; `@react-pdf/renderer` queda sin
    uso y sale de `dependencies`.
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md): «Toda
    puerta de entrada —la página y la ruta de exportación— pasa por el mismo
    service»; la revisión de seguridad verifica el alcance «también en la
    exportación».
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): una sola foto, la
    medida de `entrySeconds`, ninguna cuenta de zona en SQL, el tope de 366
    días.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): los rótulos de la
    cabecera salen de los formatos de quien mira; el PDF escribe los mismos
    textos que el CSV (D-R7-6).
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md)
    y [ADR 0002](../adr/0002-cabeceras-de-seguridad.md), como en R6.

  **Lo que no se sostiene tal cual contra el árbol o contra el encargo**, y este
  contrato ajusta:

  1. **«R7 reusa la ruta, el `ExportDocument`, la tabla `EXPORT_WRITERS` y los
     topes de R6.»** La ruta, el documento y la tabla sí. Los topes de las
     entradas no aplican: el PDF no las lleva (D-R7-2), así que el B4 de R6
     («el tope de las entradas es del documento, medido como CSV») no tiene
     qué medir, y la guarda del peso propio del formato pasa a ser una
     invariante que responde 500 (D-R7-7). El tope de 3000 filas del resumen sí
     es el mismo.
  2. **«`set_config('statement_timeout')` en la exportación.»** Hoy se fija
     solo si el plan lee las entradas (`service.ts:755-758`). Con un PDF sin
     entradas no se fijaría. Pasa a depender de que sea una exportación, no de
     las entradas (D-R7-3).
  3. **«U+FFFD para lo que el formato no admite.»** Las fuentes estándar del
     PDF codifican en WinAnsi y no tienen U+FFFD
     (`node_modules/pdfkit/js/pdfkit.js:3339-3363`). Por eso la fuente es Noto
     Sans, incrustada, que lo tiene (D-R7-5).
  4. **La paridad dice que el PDF trae «las mismas entradas»**
     (`reportes.md:1594-1598`, texto de R6a). Con D-R7-2 no las trae;
     `parity-analyst` corrige RP-53.
  5. **D-R6-13 dejaba para R7 «si no, suma la opción de no leerlas a
     `getReportExport`»**: es D-R7-3.
  6. **El volumen sintético no da 3000 filas con los pedidos de E3 y E4 de R6.**
     Cada nivel entra entero o no entra (D-R3-6): por Persona → Proyecto →
     Fecha en 366 días el árbol corta en dos niveles (`levelsShown: 2`, informe
     de R7-0, «Los prototipos»). Los casos de 3000 filas salen de un documento
     armado a mano o de un pedido buscado para eso (§6.2).
  7. **El mapa dice que Next ya trata la biblioteca del PDF como paquete
     externo.** Era `@react-pdf/renderer`. `pdfkit` no está en esa lista, y R7-0
     midió que funciona empaquetado por Turbopack, con la mitad de trazado
     (D-R7-4).

Decisiones que el contrato da por tomadas (R2a a R6): solo owner y admin ven
horas ajenas; un member con un enlace que nombra a otras personas ve lo propio;
el tope de 366 días; el timer en curso no se muestra ni se suma; los filtros de
R4; el árbol de 3000 filas que entra entero o no se muestra (D-R3-6, D-R10-10);
la regla de los e2e de §8.3 de R2a; las cifras truncadas al minuto y las horas
al centésimo (`truncatedHours`, D-R6-6 con la corrección de R6b); ninguna
exportación va al `audit_log` (decisión del usuario del 2026-10-12, R6).

## Decisiones del contrato

**D-R7-1 — Tres partes: R7-0 (medición), R7a (el PDF) y R7b (el gráfico).**
Opciones: (1) un slice; (2) **R7-0, R7a y R7b**. **(2).**

- **R7-0** midió, antes del código, el peso de la función, el tiempo en frío,
  las fuentes y el costo de 3000 filas con las dos bibliotecas candidatas, en un
  worktree propio y sin merge. Con su informe se decidieron la biblioteca, la
  fuente y `pdfjs-dist` (§10).
- **R7a** es un escritor más sobre el documento de R6, una entrada en la tabla
  de formatos, la lectura sin entradas, una ruta de una línea, un texto en la
  barra y la regla de ESLint. Se despliega sola.
- **R7b** suma el gráfico al PDF. Depende de que el usuario lo pida y de R7a. Si
  no lo pide, no existe.

**D-R7-2 — Qué trae el PDF: la cabecera y el resumen, sin las entradas.**
Opciones: (1) **cabecera y resumen**; (2) también las entradas, como el CSV.
**(1).**

- RP-53: «Export of Summary report doesn't contain timestamps. If you need
  timestamps, you should export Detailed report.» La decisión del usuario que
  sumó las entradas nombra «CSV y Excel» (mapa §5,
  `nucleo-reportes-mapa.md:405-406`), no el PDF.
- Las entradas son para una planilla: 10 000 filas con descripciones de hasta
  3000 caracteres son cientos de páginas que nadie imprime, y lo que más pesa en
  la lectura y en el tiempo de la función.
- **Lo demás es lo de R6**: la misma URL da el mismo resumen que la pantalla,
  como si estuviera todo expandido (D-R6-2), con la misma cabecera (D-R6-8), los
  mismos rótulos de grupo (`groupTextOf`, D-R6-7), los mismos vacíos y la misma
  nota del primer nivel cortado. El tope de 3000 filas es `REPORT_MAX_ROWS`, el
  de la pantalla y el de Clockify («A PDF file can contain up to 3000 rows.»);
  no hay tope nuevo.
- **Sin gráfico en R7a** (D-R7-12): queda pendiente del usuario (§10).

**D-R7-3 — Una exportación sin entradas, con el tope de duración igual.**

- **`getReportExport` recibe qué lee**: un cuarto argumento,
  `ReportExportRead = { entries: boolean }`, antes de `now`. Con `entries:
false` no se llama a `entryListSize` ni a `entryList`, y el estado trae
  `entries: null`. Con `true`, lo de hoy.
- **El formato lo dice**: `ExportWriter` suma `entries: boolean` (CSV y Excel,
  `true`; PDF, `false`), y el handler lo pasa a `getReportExport`. La ruta no
  decide nada más que el formato, que es la carpeta (D-R6-4).
- **El tope de duración vale para toda exportación**: `ReadPlan` suma
  `exporting: boolean`, y `readReport` fija `set_config('statement_timeout',
'8000', true)` con `exporting`, no con `entries` (`service.ts:755-758`). La
  página no lo fija, como hoy.
- **El documento sin entradas** tiene una sola sección, «Resumen»
  (`exportDocumentOf`, §4.3). `fittingDocumentOf` no mide nada (B4 mide las
  entradas, y no hay).
- Opción descartada: una función aparte, `getReportSummaryExport`. Serían dos
  caminos con el mismo cuerpo; un argumento obligatorio hace que cada llamador
  diga qué lee.

**D-R7-4 — La biblioteca: `pdfkit`, empaquetado, encerrado en un archivo.**
Es el [ADR 0022](../adr/0022-el-pdf-del-reporte-se-dibuja-con-pdfkit.md),
decisión del usuario con la medición R7-0.

- **`pdfkit` 0.20.1 y `fontkit` 2.0.4 pasan a `dependencies`**, con las
  versiones exactas que ya estaban instaladas como dependencias de
  `@react-pdf/renderer` (`node_modules/pdfkit/package.json:12`,
  `node_modules/fontkit/package.json:3`). `fontkit` da la cobertura de la
  fuente (D-R7-5). **`@react-pdf/renderer` sale de `dependencies`**: queda sin
  uso. Lo hace `backend-dev` en el paso 1 de R7a (§7, «Orden»), con
  `package-lock.json`.
- **Los tipos**: `@types/pdfkit` y `@types/fontkit` en `devDependencies`; hoy
  no están instalados, y `fontkit` no trae los suyos. Si a `@types/pdfkit` le
  falta algo de lo que usa `pdf.ts` (`registerFont`, `heightOfString`,
  `bufferedPageRange`, `switchToPage`, `lang`), un `declare module` con solo
  eso, al lado de `pdf.ts`, y el informe lo dice.
- **Empaquetado por Turbopack, sin `serverExternalPackages`.** R7-0 lo probó
  con `next start`, con Helvetica y con Noto incrustada, y el trazado de la ruta
  quedó en 5,43 MB contra 11,79 MB con el paquete externo (informe, M1). Si un
  cambio de Next rompe el empaquetado, la salida medida es
  `serverExternalPackages: ["pdfkit", "fontkit"]`.
- **Solo `report/export/pdf.ts` importa `pdfkit` y `fontkit`** (D-R7-9), y la
  tabla de formatos lo carga con `import()`: ni la página, ni el CSV, ni el
  Excel lo cargan. El trazado del CSV no lista nada del PDF (informe, M1).
- **Solo escribe**: un `PDFDocument` con texto, rectángulos de fondo y la fuente
  del repositorio. Nada de imágenes, enlaces, formularios ni cifrado, y ninguna
  lectura de la red.
- **La salida**: los fragmentos del documento (`data`) se juntan hasta `end` y
  se copian a un `ArrayBuffer` propio, como en `xlsx.ts:104-106`.

**D-R7-5 — La fuente y lo que no se dibuja.**

- **Noto Sans Regular 2.015, sin hinting**, decisión del team-lead con la
  medición: 431 364 bytes, SIL Open Font License 1.1, SHA-256
  `f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8`, de
  `github.com/notofonts/notofonts.github.io`, `fonts/NotoSans/unhinted/ttf/NotoSans-Regular.ttf`.
  Tiene U+FFFD y cubre Latin-1, Latin Extended-A y B y el cirílico enteros, y
  121 de los 135 puntos del griego (informe, M4). En el repositorio:
  `src/modules/report/export/fonts/NotoSans-Regular.ttf` y, al lado, la
  licencia, `OFL.txt`, de `github.com/notofonts/latin-greek-cyrillic`. Una sola
  cara: los encabezados se marcan con fondo, no con negrita.
- **El texto que llega al PDF pasa por `pdfTextOf`** (§4.5):
  - **una corrida seguida de `\t`, `\n` y `\r` pasa a ser un solo espacio**,
    como la muestra la pantalla: la descripción los admite adentro (el esquema
    solo hace `trim`, `src/modules/time-entry/schema.ts:60-64`) y el HTML
    colapsa el blanco;
  - cada punto de código que la fuente no dibuja pasa a U+FFFD: los emoji,
    «→» y el griego que falta (informe, M5);
  - los demás controles C0 y C1, U+FFFE, U+FFFF y los surrogates sueltos pasan
    siempre a U+FFFD, cubra o no la fuente;
  - se recorre por punto de código: un emoji fuera del plano básico es un solo
    U+FFFD.
- **La cobertura** sale de `fontkit` sobre los mismos bytes que se incrustan
  (`create(bytes).hasGlyphForCodePoint`).
- **`pdf.ts` no guarda estado** (`.claude/skills/code-conventions/SKILL.md`,
  «TypeScript»): en cada llamada lee el archivo, arma la cobertura y registra la
  fuente en su propio `PDFDocument` (`registerFont`, `pdfkit.js:3759`), que es
  de esa llamada. No hay almacén global: dos pedidos a la vez no comparten nada.
  R7-0 midió `registerFont` y `font` en 5 ms (informe, M2).
- **El archivo se lee del disco**: `join(process.cwd(),
"src/modules/report/export/fonts/NotoSans-Regular.ttf")`, como el ejemplo de
  fuentes de Next (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md:161-179`).
  **Turbopack no lo sigue solo** (informe, M1): entra al trazado con
  `outputFileTracingIncludes` en `next.config.ts`, con la clave de la ruta,
  `"/reportes/exportar/pdf"`, y el archivo de la fuente
  (`…/05-config/01-next-config-js/output.md:80-97`). Suma 0,44 MB.
- **Las palabras largas**: `pdfkit` parte una palabra más larga que su columna
  en renglones dentro de la columna, y la fila crece (informe, M5). No hace
  falta partición propia.

**D-R7-6 — La página.**

- **A4 vertical**, márgenes de 36 pt, cuerpo de 9 pt, título de 14 pt. El
  resumen tiene como mucho seis columnas (D-R6-7): entran. Con Noto, las 3000
  filas de R7-0 ocupan 67 páginas (informe, M3).
- **Arriba de la primera página**, el título («Reporte resumido») y la
  cabecera de D-R6-8 como una lista de nombre y valor, sin bordes; «Total» y
  «Facturable» con sus dos valores, la duración y las horas.
- **El resumen**, con el título «Resumen» y la tabla de D-R6-7: «Nivel», una
  columna por nivel mostrado, «Duración» y «Horas».
- **La tabla, a mano** (§4.6): cada fila mide su altura con `heightOfString`
  en cada celda, al ancho de su columna; si no entra en lo que queda de la
  página, **pasa entera a la siguiente**, que empieza con **la fila de
  encabezados**. Una fila más alta que una página entera no existe: los rótulos
  tienen como mucho unos 100 caracteres (`REPORT_DESCRIPTION_SHOWN`) y M6 lo
  midió con todos así.
- **Lo que en una planilla se repite, en papel se lee mejor apagado**: los
  rótulos de los antepasados de cada fila van en gris (`muted`), y las filas de
  nivel 1, sobre un fondo gris claro. El texto es el mismo que en el CSV; solo
  cambia el color (D-R6-6: el documento dice qué es cada celda, el formato cómo
  se escribe).
- **Las celdas, con el texto del CSV** (`cellText`, §4.4): «1:30», «1,50»,
  «Sin proyecto», la persona con « (inactiva)». **Sin el `'`** de la inyección
  de fórmulas: un PDF no tiene fórmulas. «Nivel», «Duración» y «Horas» van
  alineadas a la derecha.
- **Los vacíos y el primer nivel cortado** (`levelsShown: 0`): en lugar de la
  tabla, el aviso de la pantalla como un párrafo, igual que la fila sola del
  CSV.
- **Abajo de cada página**, «Página {n} de {total}», a la derecha. Se escribe
  al final, recorriendo las páginas guardadas (`bufferPages`,
  `bufferedPageRange` y `switchToPage`, `pdfkit.js:7100-7109`), dentro del
  margen inferior y sin que `pdfkit` agregue una página: si se escribe debajo
  del margen, la agrega.
- **Los metadatos**: el título «Reporte resumido» (`info.Title`) y el idioma
  `es` (`lang`, `pdfkit.js:7029-7030`, `:7052-7056`). Sin autor ni asunto: el
  nombre de quien exporta va en la cabecera, no en los metadatos.

**D-R7-7 — Las respuestas.** Las de D-R6-5, con el formato del PDF:

- **200**, `Content-Type: application/pdf`, `Content-Disposition: attachment;
filename="reporte_<niveles>_<desde>_<hasta>.pdf"` (`exportFileNameOf`, sin
  cambios) y `Cache-Control: no-store`.
- **`attachment` y no `inline`**: con `inline` el navegador abre el PDF en la
  pestaña y la persona deja `/reportes`; los tres formatos se comportan igual.
- **Sin sesión, 307 a `/login`; sin `report.view`, 403; un error, 500**, los
  dos con `no-store`, como hoy.
- **El peso**: el PDF no tiene entradas que sacar. Si el PDF escrito pasa
  `REPORT_EXPORT_MAX_BYTES`, `exportBodyOf` lanza un `RangeError` y la ruta
  responde 500. Es una invariante: el peor caso medido, 3000 filas con rótulos
  de 100 caracteres, pesa 339 KB (informe, M6).

**D-R7-8 — La pantalla: «PDF» después de «Excel».** La barra ya dibuja un
enlace por formato de `REPORT_EXPORT_FORMATS` (`report-toolbar.tsx:162-173`):
sumar `"pdf"` y su rótulo alcanza. Un `<a>` común, sin `Link` ni `download`,
con la misma condición (`state.chart !== null`) y el mismo `href`
(`reportExportHref`), como D-R6-10. Ningún otro cambio de pantalla.

**D-R7-9 — Cada biblioteca, encerrada en su archivo.** La regla de R6b
(`eslint.config.mjs:24-44`: `patterns` y un selector de `ImportExpression`) se
generaliza:

- `exceljs`: solo `src/modules/report/export/xlsx.ts`.
- `pdfkit` y `fontkit`, con sus subrutas: solo
  `src/modules/report/export/pdf.ts`.
- `@react-pdf/*`: en ningún archivo, tampoco en `pdf.ts`. Sale de
  `dependencies`, y la regla impide que vuelva sin un ADR.
- `pdfjs-dist` (D-R7-10): solo tests, `src/test/` y `e2e/`.
- **Los helpers de los tests** (`@/test/*` y la ruta relativa a `src/test/`):
  solo tests, `src/test/` y `e2e/`. Con la excepción de `src/test/**`, un
  helper puede traer `pdfjs-dist`, y un archivo de producción que lo importara
  llevaría una dependencia de desarrollo a la función. Hoy ninguno importa
  `@/test/`.
- Los tests (`**/*.test.ts`, `**/*.test.tsx`), `src/test/**` y `e2e/**` pueden
  importar cualquiera salvo `@react-pdf/*`. `xlsx.ts` no puede importar las del
  PDF, ni `pdf.ts`, `exceljs`.
- La plantilla (``import(`exceljs`)``) sigue esquivándola, como aceptó
  seguridad en R6b: es una barrera contra descuidos.

**D-R7-10 — Leer el PDF en los tests: `pdfjs-dist` en `devDependencies`.**
Decisión del team-lead (§10). Opciones: (1) **`pdfjs-dist`**; (2) mirar solo la
estructura de los bytes; (3) `pdftotext` del sistema. **(1).**

- Con una fuente incrustada, el texto del PDF son números de glifo: sin un
  lector no se puede afirmar «Web (ACME)» en los bytes. `pdfkit` usa
  `pdfjs-dist` para sus propios tests
  (`node_modules/pdfkit/package.json:42`, la 5.7.284).
- **En Node, el build `legacy`, sin worker**:
  `pdfjs-dist/legacy/build/pdf.mjs`. R7-0 no lo probó (informe, «Lo que no se
  midió»): lo prueba `backend-dev` en el paso 1 de R7a, bajo Vitest en Node,
  antes de que los criterios dependan de él.
- **El texto de una celda que se parte en renglones llega en varios
  fragmentos.** Los lectores de los tests (`src/test/pdf.ts` y `readPdf` de
  `e2e/reports-page.ts`) unen los fragmentos de cada página y colapsan el
  blanco en un espacio antes de buscar: «Web {sufijo} (ACME {sufijo})» se busca
  en ese texto, no en un fragmento.
- (2) deja sin probar todo lo que se ve; (3) no está en CI.
- Es de desarrollo: CI audita producción (`--omit=dev`), y la regla de D-R7-9
  impide que llegue a un archivo de producción.

**D-R7-11 — Volumen y peso, contra el plan Hobby.** Los límites de Vercel
siguen _no verificados_ (D-R6-11): el contrato se diseña contra 10 s por pedido,
4,5 MB de respuesta y 250 MB de función sin comprimir. Lo que R7-0 midió en
local, con `pdfkit` y Noto: 3000 filas escritas en 0,25 s con 135 MB de pico;
el primer PDF en frío, 0,16 s más que el primer CSV; el trazado de la ruta,
5,43 MB; el peor peso, 339 KB. **El peor pedido entero en frío** —la carga de
la biblioteca, la lectura de un pedido cerca de 3000 filas y la escritura— no
se midió junto (M8 no está en el informe): lo mide §6.2, P2 en frío.

**D-R7-12 — El gráfico en el PDF (R7b), si el usuario lo pide.**

- RP-53 dice que en Clockify se puede sacar el gráfico del PDF («you can
  disable certain information (user, charts, etc.)»): Clockify lo trae. El CSV
  y el Excel no (D-R6-2).
- **Si va**: el documento suma `chart: ReportChart | null`, que CSV y Excel no
  escriben; el PDF dibuja, debajo de la cabecera y antes de la tabla, las barras
  de `state.chart` como rectángulos de `pdfkit`, con la escala, las marcas y
  los rótulos de `chart-model.ts` (`chartScaleOf`, `tickIndexesOf`,
  `tickAlignOf`, `barHeightPercent`), que no importa React ni nada del
  navegador. Ninguna imagen.
- **Sin opciones de qué mostrar** («you can disable…»): la URL no lleva
  parámetros de exportación (D-R6-4).

**D-R7-13 — Lo que se prueba en unidad y lo que no.** En unidad: `cellText`,
`pdfTextOf`, `pdfLayoutOf`, el documento sin entradas, los bytes de un PDF de
pocas páginas leídos con `pdfjs-dist`, la fuente y el enlace. En integración:
la lectura sin entradas y con el tope de duración, y la ruta entera con la
sesión simulada. En e2e: que el enlace descarga, las cabeceras contra
`next start` y el texto del archivo. Las 3000 filas, en la medición (§6.2), no
en `npm test`. A mano: cómo se ve en un visor y al imprimir.

## 0. Precondición de arranque

- **El árbol en `31a83b3`** (`main` con R6a y R6b). Las citas son de ese
  árbol. Postgres 18 en local, en CI y en Neon. Todo test de tiempo fija reloj
  y zona.
- **R7-0 está hecha** (`b26c589`) y el ADR 0022, aceptado. **R7a no tiene
  pendientes del usuario**: la biblioteca, la fuente y `pdfjs-dist` están
  decididas (§10).
- **R7b espera que el usuario pida el gráfico.**
- **Sin comprobación contra Neon antes de mergear**: ninguna sentencia nueva;
  la lectura del PDF es la de la página más el tope de duración, que ya corre
  en producción desde R6a. La comprobación en Vercel (la descarga, las
  cabeceras, el tiempo en frío y con datos reales) la hace el usuario después
  del despliegue, en producción (§10, «Para el team-lead», punto 4).

### Supuestos sobre el árbol, con archivo y línea en `31a83b3`

- La tabla de formatos, `fittingDocumentOf` (B4), `exportBodyOf` y el handler:
  `src/modules/report/export/handler.ts:19-31`, `:62-77`, `:79-96`, `:98-134`.
- `ExportCell`, `ExportDocument` y `ExportWriter`:
  `src/modules/report/export/types.ts:1-35`.
- `cellText` es privada de `csv.ts` (`:16-34`); el CSV la usa con el `'` de la
  inyección (`:36-41`).
- `exportDocumentOf`, la cabecera, el resumen y las entradas:
  `src/modules/report/export/document.ts:33-42` (`entriesSectionOf` en `:40`),
  `:126-165`, `:220-255`, `:257-269`.
- `xlsx.ts`: el reemplazo por U+FFFD de lo que el XML no admite (`:23-35`) y la
  copia del `Buffer` (`:104-106`).
- La cota de las entradas medida como CSV: `export/entry-size.ts:19-36`;
  `entriesFit` y `readEntries`: `service.ts:798-827`.
- `readReport` fija el tope de duración solo con `plan.entries`
  (`service.ts:755-758`); `ReadPlan` (`:668-679`); `EntryRead` (`:421-423`);
  `readReportState` con sus dos sobrecargas (`:877-991`); `getReportExport`
  (`:1064-1081`); `ReportExportState` (`:1007-1017`).
- `getReportExport` se llama en cinco lugares: `handler.ts:112`,
  `service.integration.test.ts:4284` y `:4737`,
  `scope.integration.test.ts:3049` y `handler.integration.test.ts:305`.
- `limitStatementTime` con `set_config(…, true)`: `repository.ts:940-954`;
  `REPORT_EXPORT_STATEMENT_TIMEOUT_MS = 8_000`: `schema.ts:605-610`.
- `REPORT_EXPORT_FORMATS = ["csv", "xlsx"]`: `schema.ts:612-614`;
  `REPORT_MAX_ROWS = 3000`: `:139`; `REPORT_DESCRIPTION_SHOWN = 100`: `:141-142`.
- Cada nivel del árbol entra entero o no entra (`readLevelsWithinLimit`,
  `service.ts`; D-R3-6); el volumen sintético reparte las entradas entre 24
  proyectos o ninguno (`scripts/report-volume/seed.sql:140`).
- La descripción admite saltos de línea y tabulaciones internas: el esquema
  solo hace `trim` (`src/modules/time-entry/schema.ts:60-64`).
- `exportFormatLabels`: `components/labels.ts:106-109`; la barra dibuja un
  enlace por formato: `components/report-toolbar.tsx:152-176`.
- La regla de ESLint de `exceljs`: `eslint.config.mjs:5`, `:24-44`.
- Sin estado mutable a nivel de módulo, salvo el pool:
  `.claude/skills/code-conventions/SKILL.md`, «TypeScript».
- `@react-pdf/renderer` 4.9.0 en `dependencies` (`package.json:30`), sin uso;
  instala `pdfkit` 0.20.1 (`node_modules/@react-pdf/renderer/package.json:36`).
- `pdfkit` 0.20.1: las fuentes estándar con WinAnsi y `.notdef` para lo demás
  (`node_modules/pdfkit/js/pdfkit.js:3252-3294`, `:3339-3363`); `registerFont`
  (`:3759`); `heightOfString` (`:4310-4325`); `bufferedPageRange` y
  `switchToPage` (`:7100-7109`); `lang` e `info` en las opciones del documento
  (`:7029-7030`, `:7052-7056`); sus dependencias, `fontkit`, `fflate`,
  `linebreak`, `png-js`, `@noble/ciphers` y `@noble/hashes`, y `pdfjs-dist` en
  sus `devDependencies` (`node_modules/pdfkit/package.json:42`, `:49-56`).
- `fontkit` 2.0.4, sin tipos propios (`node_modules/fontkit/package.json:3`);
  ni `@types/fontkit` ni `@types/pdfkit` están instalados.
- Next traza con `@vercel/nft` el uso de `fs` y admite
  `outputFileTracingIncludes` por ruta
  (`…/01-next-config-js/output.md:16`, `:80-97`); el ejemplo de fuentes lee el
  archivo con `readFile(join(process.cwd(), …))`
  (`…/04-functions/image-response.md:161-179`). Con el grupo de rutas, el
  trazado de una descarga está en `.next/server/app/(app)/reportes/exportar/<formato>/route.js.nft.json`.
- `chart-model.ts` no importa nada (`components/chart-model.ts`):
  `chartScaleOf`, `tickIndexesOf`, `tickAlignOf`, `barHeightPercent`.
- Vitest de unidad toma `src/**/*.test.ts` y `*.test.tsx` en Node
  (`vitest.config.ts:8-17`); los helpers de tests viven en `src/test/`
  (`markup.ts`, `report.ts`), y ningún archivo de producción importa
  `@/test/`; `vitest.integration.config.ts` nombra `src/test/` en cadenas, no
  en un `import` (`:16-17`).
- e2e: `ExportFormat = "csv" | "xlsx"` (`e2e/reports-page.ts:283`), `exportUrl`,
  `recordExportRequests`, `readCsv`, `readXlsx`, `ExportLabel = "CSV" | "Excel"`,
  `exportLink` (`:292-300`, `:366-374`, `:383-401`, `:913-923`); 25 recorridos,
  el último en `e2e/reports.spec.ts:2314`.
- CI: `format:check` y audita producción con nivel alto
  (`.github/workflows/ci.yml:23`, `:41`).
- **Lo que midió R7-0** (`nucleo-reportes-r7-medicion.md`): M1, el trazado y la
  fuente fuera de él; M2, el tiempo en frío con 781 filas; M3 y M6, las 3000
  filas sintéticas; M4, las fuentes; M5, el texto y la palabra larga; M7, la
  auditoría, sin alertas en la cadena del PDF. **No midió** M8 (el peor pedido
  entero en frío) ni M9 (`pdfjs-dist` bajo Vitest).

## 1. Alcance

**R7a** entra:

- **El módulo `report`**: `"pdf"` en los formatos; `ReportExportRead` y la
  lectura sin entradas con el tope de duración; `entries` en `ExportWriter`; el
  documento sin entradas; `cellText` compartida; `pdf-layout.ts` y `pdf.ts`;
  la fuente con su licencia; el formato en el handler.
- **La ruta** `src/app/(app)/reportes/exportar/pdf/route.ts`, y la fuente en
  su trazado (`next.config.ts`).
- **Las dependencias**: `pdfkit` y `fontkit` entran; `@react-pdf/renderer` sale;
  `@types/pdfkit`, `@types/fontkit` y `pdfjs-dist` en `devDependencies`.
- **La pantalla**: el rótulo «PDF».
- **Los tests**: el lector `src/test/pdf.ts` y la regla de ESLint de D-R7-9.
- **La medición** de §6.2.

**R7b**, si el usuario lo pide: el gráfico en el documento y en el PDF
(D-R7-12).

Queda afuera: ver §11.

### Consecuencias sobre código ya entregado

- **`src/modules/report/schema.ts`**: `REPORT_EXPORT_FORMATS` suma `"pdf"`.
  Vuelve a probar: `schema.test.ts`.
- **`src/modules/report/service.ts`**: `getReportExport` recibe
  `ReportExportRead`; `ReportExportState.entries` admite `null`; `ReadPlan`
  suma `exporting`; el tope de duración depende de `exporting`;
  `readReportState` recibe `ReportExportRead | null` en lugar de `withEntries`.
  **Las cinco llamadas existentes a `getReportExport`**
  (`handler.ts:112`, `service.integration.test.ts:4284` y `:4737`,
  `scope.integration.test.ts:3049`, `handler.integration.test.ts:305`) pasan
  `{ entries: true }` y no cambian de resultado. Vuelve a probar:
  `service.integration.test.ts`, `scope.integration.test.ts` y
  `handler.integration.test.ts` enteros, con los mismos valores.
- **`export/types.ts`**: `ExportWriter.entries`; el comentario de
  `sections`. Vuelve a probar: `npm run typecheck`.
- **`export/document.ts`**: con `entries: null`, solo «Resumen». Vuelve a
  probar: `document.test.ts` con los mismos valores.
- **`export/csv.ts`**: `cellText` pasa a `export/cell-text.ts`, sin cambios; el
  CSV la importa. Vuelve a probar: `csv.test.ts` con los mismos bytes.
- **`export/handler.ts`**: la entrada `pdf`; `entries` en las de CSV y Excel;
  `getReportExport` con `{ entries }`; `fittingDocumentOf` y `exportBodyOf`
  sin entradas. Vuelve a probar: `handler.integration.test.ts` entero.
- **`components/labels.ts`**: `exportFormatLabels.pdf`. Vuelve a probar:
  `report-toolbar.test.tsx`.
- **`eslint.config.mjs`**: la regla de D-R7-9. Vuelve a probar: `npm run lint`.
- **`package.json`, `package-lock.json`**: en `dependencies`, entran
  `"pdfkit": "0.20.1"` y `"fontkit": "2.0.4"` y sale `@react-pdf/renderer`; en
  `devDependencies`, entran `@types/pdfkit`, `@types/fontkit` y `pdfjs-dist`.
  Vuelve a probar: `npm ci`, `npm run build` y `npm audit --omit=dev`.
- **`next.config.ts`**: `outputFileTracingIncludes` con la fuente para
  `"/reportes/exportar/pdf"`. Las cabeceras de seguridad no cambian. Vuelve a
  probar: el trazado de la ruta (§6.2) y `next start`.
- **`e2e/reports-page.ts`, `e2e/reports.spec.ts`**: `"pdf"` en `ExportFormat`,
  `"PDF"` en `ExportLabel`, `readPdf(path)` y el recorrido 26 (27 en R7b).
  Ningún export se renombra. Vuelve a probar: `reports.spec.ts` entero.

La página no lee nada nuevo y la barra suma un enlace. Las ediciones fuera del
reparto siguen la regla de R3 a R6: las hace el dueño del tipo que las rompe,
con aviso al team-lead, después de que el dueño del archivo commitee lo
pendiente. **En el paso 1 son dos** (§7, «Orden»): `scope.integration.test.ts`
(de `test-engineer`) y `document.ts` (de `frontend-dev`).

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** El PDF lee lo que lee la página, en la
misma transacción `repeatable read`, `read only`, con el tope de duración de
la exportación.

## 3. Permisos

**Ninguna acción nueva.** Exportar a PDF es `report.view`, y lo ajeno,
`timeEntry.others.view` por `scopeOf`, como en R6 (§3 de R6). La ruta no
compara roles ni lee `personas` por su cuenta; de la URL llegan los parámetros
de la página, y el formato es la carpeta.

## 4. Contrato de lectura

### 4.1 `report/schema.ts`

```ts
/** D-R6-4, D-R7-1: una carpeta de `reportes/exportar/` por formato. */
export const REPORT_EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
```

Nada más cambia en el esquema: los topes, los mensajes y `reportEntryRow`
son los de R6.

### 4.2 Service (`report/service.ts`)

```ts
/** D-R7-3: lo que una exportación lee además del estado de la página. */
export type ReportExportRead = {
  /** D-R6-3: las entradas una por una; el PDF no las pide (D-R7-2). */
  readonly entries: boolean;
};

export type ReportExportState =
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      /** El mismo estado que `getReportState` para el mismo pedido y `now`. */
      readonly report: ReportReadyState;
      /** `null` si el pedido no las pidió (D-R7-3). */
      readonly entries: ReportExportEntries | null;
      /** El `now` de la lectura: «Generado» (D-R6-8). */
      readonly generatedAt: Date;
    };

/** D-R6-2, D-R7-3: el estado de la página y las entradas pedidas, en una foto. */
export async function getReportExport(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  read: ReportExportRead,
  now?: Date,
): Promise<ReportExportState>;
```

- **`ReadPlan`** suma `exporting: boolean`. `readReport` llama a
  `limitStatementTime(REPORT_EXPORT_STATEMENT_TIMEOUT_MS, tx)` **con
  `exporting`**, antes de la primera lectura, y a `readEntries` con `entries`.
- **`readReportState`** recibe `read: ReportExportRead | null` en lugar de
  `withEntries`: `null` es la página (`exporting: false`, `entries: false`);
  un `ReportExportRead` es una exportación (`exporting: true`, `entries` el
  suyo). Las dos sobrecargas quedan: con `null`, `ReportStateRead<null>`; con
  un `ReportExportRead`, `ReportStateRead<EntryRead | null>`.
- **`entriesOf`** recibe `EntryRead | null` y devuelve `null` con `null`.
- **Ninguna decisión de acceso cambia** y el estado de la página sale igual.

### 4.3 El documento (`export/types.ts` y `export/document.ts`)

```ts
// export/types.ts
export type ExportDocument = {
  /** D-R6-8, una fila por dato. */
  readonly header: readonly ExportRow[];
  /** El resumen y, si se leyeron, las entradas, en ese orden (D-R7-3). */
  readonly sections: readonly ExportSection[];
};

/** D-R6-6, D-R6-13, D-R7-3: cómo se sirve y se escribe un formato. */
export type ExportWriter = {
  readonly contentType: string;
  /** D-R7-2: si el formato lleva las entradas una por una. */
  readonly entries: boolean;
  readonly write: (document: ExportDocument) => Promise<Uint8Array<ArrayBuffer>>;
};
```

- **`exportDocumentOf`** con `input.entries === null` arma la cabecera y la
  sección «Resumen», y ninguna más. `ReportExportInput` no cambia de forma: la
  toma de `ReportExportState`.

### 4.4 El texto de una celda (`export/cell-text.ts`, nuevo)

```ts
/**
 * D-R6-9, D-R7-6: el texto de una celda, el mismo en el CSV y en el PDF:
 * `h:mm`, las horas con coma truncadas al centésimo y las claves canónicas.
 */
export function cellText(cell: ExportCell): string;
```

Es la función privada de `csv.ts:16-34`, movida sin cambios. El CSV le suma
el `'` y las comillas (`fieldOf`); el PDF, `pdfTextOf`.

### 4.5 El diseño del PDF (`export/pdf-layout.ts`, nuevo)

Puro y sin biblioteca: decide qué va en cada lugar. `pdf.ts` solo lo dibuja.

```ts
/** D-R7-5: si la fuente del PDF dibuja un punto de código. */
export type GlyphCoverage = (codePoint: number) => boolean;

/** Una celda ya escrita; `muted`, el rótulo de un antepasado (D-R7-6). */
export type PdfCell = { readonly text: string; readonly muted: boolean };

export type PdfColumn = {
  readonly label: string;
  /** Fracción del ancho de la tabla; las de una tabla suman 1. */
  readonly width: number;
  readonly align: "left" | "right";
};

export type PdfRow = {
  /** El nivel del resumen; las del 1 van sobre fondo (D-R7-6). */
  readonly level: number;
  readonly cells: readonly PdfCell[];
};

export type PdfSection =
  | {
      readonly kind: "table";
      readonly title: string;
      readonly columns: readonly PdfColumn[];
      readonly rows: readonly PdfRow[];
    }
  /** Un aviso en lugar de la tabla: los vacíos y el primer nivel cortado. */
  | { readonly kind: "note"; readonly title: string; readonly text: string };

export type PdfLayout = {
  readonly title: string;
  /** D-R6-8 sin el título: el nombre y uno o dos valores por fila. */
  readonly header: readonly (readonly string[])[];
  readonly sections: readonly PdfSection[];
};

/** D-R7-5: el blanco, como un espacio; lo que no se dibuja, como U+FFFD. */
export function pdfTextOf(text: string, covers: GlyphCoverage): string;

/** D-R7-6: qué va en cada página, sin medidas de la biblioteca. Pura. */
export function pdfLayoutOf(document: ExportDocument, covers: GlyphCoverage): PdfLayout;
```

- **`pdfTextOf`** recorre el texto por punto de código: **una corrida seguida
  de `\t` (U+0009), `\n` (U+000A) y `\r` (U+000D), de uno o más, pasa a ser un
  solo espacio**; los demás controles, de U+0000 a U+001F y de U+007F a
  U+009F, U+FFFE, U+FFFF y los surrogates sueltos pasan siempre a U+FFFD; lo
  demás que `covers` no cubre, también.
- **El título** es la primera fila de la cabecera, que es una celda sola
  (D-R6-8, `document.ts:136`). **La cabecera** son las demás filas, cada celda
  con `cellText` y `pdfTextOf`.
- **Una sección es un aviso** si tiene una sola fila de una sola celda de texto
  (`note`, `document.ts:288-291`); si no, una tabla: la primera fila son los
  encabezados y las demás, las filas.
- **Las columnas de una tabla**, por el tipo de las celdas de su primera fila
  de datos: `integer` («Nivel»), 0,08 del ancho y a la derecha; `duration`,
  0,12, y `hours`, 0,10, a la derecha; las de texto y vacías se reparten el
  resto en partes iguales, a la izquierda. Suman 1.
- **Cada fila de datos**: `level` es el entero de su primera celda; las celdas
  de texto de las columnas 1 a `level - 1` son los antepasados y van con
  `muted: true`; las demás, `false`. Una tabla cuya primera celda de datos no
  es un `integer` es un `RangeError`: el PDF escribe solo el resumen (D-R7-2).
- **Todo texto** sale de `cellText` y pasa por `pdfTextOf`, también los
  encabezados, los títulos y los avisos. Ningún `'`.

### 4.6 El escritor (`export/pdf.ts`, nuevo)

```ts
/**
 * D-R7-4 a D-R7-6: el PDF del documento, en A4 vertical, con la cabecera, el
 * resumen con sus encabezados en cada página y el número de página. Solo
 * escribe, con la fuente del repositorio: no pide nada a la red.
 */
export async function pdfBytesOf(
  document: ExportDocument,
): Promise<Uint8Array<ArrayBuffer>>;
```

En cada llamada, sin nada guardado en el módulo:

1. **La fuente**: lee `NotoSans-Regular.ttf` (D-R7-5), arma la cobertura con
   `fontkit` sobre esos bytes y el diseño con `pdfLayoutOf`.
2. **El documento**: un `PDFDocument` con `size: "A4"`, márgenes de 36 pt,
   `bufferPages: true`, `lang: "es"` e `info.Title` «Reporte resumido»;
   `registerFont` con los mismos bytes y la fuente para todo el texto.
3. **La cabecera**: el título y las filas de nombre y valor.
4. **Cada sección**: su título; si es un aviso, el párrafo; si es una tabla,
   la fila de encabezados sobre fondo y después cada fila: su altura es la
   mayor de `heightOfString` de sus celdas, al ancho de cada columna menos el
   relleno; si no entra en lo que queda de la página, `addPage` y la fila de
   encabezados otra vez; el fondo del nivel 1 con un rectángulo; cada celda con
   su alineación y, si es `muted`, en gris.
5. **El pie**: para cada página de `bufferedPageRange`, `switchToPage` y
   `exportLabels.pageLabel(n, total)` a la derecha, dentro del margen inferior,
   sin que `pdfkit` agregue una página.
6. **Los bytes**: `end`, los fragmentos de `data` juntados hasta el evento
   `end` y copiados a un `ArrayBuffer` propio; un evento `error` rechaza la
   promesa.

**Las medidas y los colores** son constantes del archivo: márgenes 36 pt,
cuerpo 9 pt, título 14 pt, el relleno de las celdas, el gris de los
antepasados y el fondo del nivel 1 y de los encabezados. **La ruta de la
fuente** también: la misma que nombra `next.config.ts`.

### 4.7 El handler, la ruta y el trazado

La entrada de la tabla de formatos (`handler.ts:19-31`); CSV y Excel suman
`entries: true`:

```ts
pdf: {
  contentType: "application/pdf",
  entries: false,
  // D-R7-4: con `import()`, ni la página ni el CSV ni el Excel cargan pdfkit.
  write: async (document: ExportDocument) =>
    (await import("./pdf")).pdfBytesOf(document),
},
```

- **`handleReportExport`** llama a `getReportExport(session.actor, settings,
reportRequest, { entries: EXPORT_WRITERS[format].entries })`. Lo demás, como
  hoy: la sesión fuera del `try`, 403, 500 y las cabeceras.
- **`fittingDocumentOf`** con `input.entries === null` devuelve el documento sin
  medirlo como CSV.
- **`exportBodyOf`** con `input.entries === null`: si el archivo escrito pasa
  `maxBytes`, lanza `RangeError` (D-R7-7). Con entradas, como hoy.

**La ruta** (`src/app/(app)/reportes/exportar/pdf/route.ts`, nuevo):

```ts
import { handleReportExport } from "@/modules/report/export/handler";

export async function GET(request: Request): Promise<Response> {
  return handleReportExport(request, "pdf");
}
```

**`next.config.ts`** suma, al lado de las cabeceras:

```ts
// D-R7-5: la fuente del PDF se lee del disco y Turbopack no la sigue sola.
outputFileTracingIncludes: {
  "/reportes/exportar/pdf": ["./src/modules/report/export/fonts/NotoSans-Regular.ttf"],
},
```

### 4.8 El lector de los tests (`src/test/pdf.ts`, nuevo)

```ts
/**
 * D-R7-10: el texto de cada página de un PDF, con `pdfjs-dist` (`legacy`, sin
 * worker): los fragmentos unidos y el blanco colapsado en un espacio.
 */
export async function pdfPageTexts(bytes: Uint8Array): Promise<readonly string[]>;
```

Lo usan `pdf.test.ts` y `handler.integration.test.ts`. `readPdf` de
`e2e/reports-page.ts` hace lo mismo sobre el archivo descargado.

### 4.9 La regla de ESLint (`eslint.config.mjs`)

D-R7-9, con `no-restricted-imports` (`patterns`) y `no-restricted-syntax`
(`ImportExpression`) para cada biblioteca, con su mensaje:

- en todo el repositorio, `exceljs`, `pdfkit`, `fontkit`, `@react-pdf/*` y
  `pdfjs-dist`, con sus subrutas, y los helpers de los tests: `@/test/*` y la
  ruta relativa a `src/test/`;
- en `src/modules/report/export/xlsx.ts`, todas menos `exceljs`;
- en `src/modules/report/export/pdf.ts`, todas menos `pdfkit` y `fontkit`;
- en `**/*.test.ts`, `**/*.test.tsx`, `src/test/**` y `e2e/**`, solo
  `@react-pdf/*`.

El selector de `import()` sigue la forma de `449c77a`
(`^exceljs(\x2F|$)`, con la barra escrita `\x2F`), uno por biblioteca y uno
para `@/test/`.

### 4.10 Costo

- **Ninguna sentencia nueva**: el PDF lee lo de la página más el
  `set_config`; no lee las entradas.
- **La función**: `pdfkit`, `fontkit` y la fuente, empaquetados en la ruta del
  PDF; 5,43 MB de trazado en R7-0, contra 4,79 MB del CSV.
- **Lo que viaja al navegador en la página**: un enlace más, sin JavaScript de
  cliente.

## 5. Pantalla

- **El grupo «Exportar»** suma «PDF» después de «Excel», con el mismo ícono y
  el mismo estilo (D-R7-8). En `components/labels.ts`:
  `exportFormatLabels.pdf = "PDF"`.
- **Los estados**: como en R6. Sin grupo en los vacíos (RP-33); con grupo en
  el primer nivel cortado y en los niveles cortados.
- **Lo que ve quien descarga**: el navegador baja `reporte_….pdf` y se queda
  en `/reportes`; con la sesión vencida, va al login; un 403 o un 500 son una
  página de texto.
- **El texto nuevo del PDF**, en `export/labels.ts`: `pageLabel(page, total)`,
  «Página {page} de {total}». El título, «Resumen», los nombres de la
  cabecera, los encabezados y los avisos son los de R6.

## 6. Volumen y peso

### 6.1 R7-0, la medición antes del código (hecha)

La hizo `backend-dev` en el worktree `/home/maxi/program/clock-r7-medicion`,
ya borrado; el informe es [`nucleo-reportes-r7-medicion.md`](nucleo-reportes-r7-medicion.md)
(`b26c589`). Con `pdfkit` y Noto, contra los presupuestos que se fijaron antes
de medir:

- **M3, 3000 filas**: 0,25 s de escritura y 135 MB de pico (presupuesto 3 s y
  512 MB), 67 páginas, 217 KB.
- **M2, el primer PDF en frío** con 781 filas: 0,82 s, 0,16 s más que el
  primer CSV (presupuesto: 3 s más).
- **M1, el trazado**: 5,43 MB empaquetado con la fuente (presupuesto 50 MB).
- **M6, el peor peso**: 339 KB en 0,34 s (presupuesto 2 MB).
- **M7**: ninguna alerta de `npm audit --omit=dev` toca la cadena del PDF.

**Quedaron sin medir** y pasan a R7a: **M8**, el peor pedido entero en frío,
que es P2 en frío en §6.2; y **M9**, `pdfjs-dist` bajo Vitest, que prueba
`backend-dev` en el paso 1 (§7).

### 6.2 R7a, las exportaciones enteras

Lo hace `backend-dev` con el código terminado, como §6.3 de R6, desde
`getReportExport` hasta los bytes del PDF, en su copia y con su base. Los
presupuestos son más chicos que los de antes de medir: con `pdfkit` sobra
margen y un presupuesto holgado no ve una regresión.

- **P1**: el mes pasado, todo el equipo, Persona → Proyecto → Fecha.
  **≤ 1,5 s**.
- **P2**: **un pedido real del volumen que dé entre 2900 y 3000 filas con
  todos sus niveles**, por ejemplo Persona → Fecha sobre el período de unos 95
  días hábiles que lo logre. `backend-dev` lo ajusta y anota el pedido,
  `levelsShown` y las filas. **≤ 2 s**, **≤ 1 MB**; y **en frío** (después de
  `next start`, un proceso nuevo, por la ruta, hasta el último byte, mediana
  de cinco reinicios), **≤ 3 s**.
- **P3**: 366 días, todo el equipo, Descripción (el primer nivel no entra: el
  aviso). **≤ 1 s**.
- **P4**: **un pedido real que dé entre 2900 y 3000 filas con los rótulos más
  largos que tenga el volumen** (con descripción en algún nivel). **≤ 2 s**,
  **≤ 1 MB**.

Si no hay un pedido que llegue a 2900 filas, P2 y P4 suman la lectura de E3 de
R6 al escritor sobre un documento armado a mano de 3000 filas, como M3 y M6, y
el informe lo dice. Con el pico de `heapUsed` de cada una (**≤ 512 MB**), el
primer pedido después de `next start` a `exportar/pdf` y a `exportar/csv` (que
el CSV no cargue `pdfkit`), y el trazado de la ruta del PDF
(`.next/server/app/(app)/reportes/exportar/pdf/route.js.nft.json`): el total,
lo que suman `pdfkit`, `fontkit` y sus dependencias, y que la fuente esté.

### 6.3 Lo que no se mide en local

- **Los límites de Vercel Hobby** (D-R6-11, D-R7-11), _no verificados_: el
  tamaño de la función, la duración y el tamaño de la respuesta. El tope de
  duración de las sentencias (8 s) sigue debajo de 10 s.
- **La página**: un enlace más. No se mide.

### 6.4 Si algo pasa el presupuesto

Vale §6.5 de R3: el slice se detiene y vuelve a `architect`. La salida que
queda es un tope de filas propio del PDF, menor que 3000, que es una pregunta
al usuario. Si lo que falla es el empaquetado, `serverExternalPackages:
["pdfkit", "fontkit"]` (D-R7-4).

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

**Reglas de la corrida**, las de R6 (§7 de R6): integración con
`TEST_DATABASE_URL` propia; una base por agente, que crea, migra y borra el
team-lead; la base de e2e antes de lanzar a `e2e-tester`; lo que necesita un
servidor propio, en una copia; corridas en primer plano; `parity-analyst` no
escribe; commits con `git commit -- <rutas>`. **Toda prueba descartable, en un
worktree o una copia** (`correcciones-nucleo-reportes-r6b.md:29-33`).

### R7a — backend-dev

```
/home/maxi/program/clock/src/modules/report/schema.ts
/home/maxi/program/clock/src/modules/report/schema.test.ts
/home/maxi/program/clock/src/modules/report/service.ts
/home/maxi/program/clock/src/modules/report/service.integration.test.ts
/home/maxi/program/clock/src/modules/report/export/types.ts
/home/maxi/program/clock/src/modules/report/export/cell-text.ts                   (nuevo)
/home/maxi/program/clock/src/modules/report/export/cell-text.test.ts              (nuevo)
/home/maxi/program/clock/src/modules/report/export/csv.ts
/home/maxi/program/clock/src/modules/report/export/pdf.ts                         (nuevo)
/home/maxi/program/clock/src/modules/report/export/pdf.test.ts                    (nuevo)
/home/maxi/program/clock/src/modules/report/export/fonts/NotoSans-Regular.ttf     (nuevo)
/home/maxi/program/clock/src/modules/report/export/fonts/OFL.txt                  (nuevo)
/home/maxi/program/clock/src/modules/report/export/handler.ts
/home/maxi/program/clock/src/modules/report/export/handler.integration.test.ts
/home/maxi/program/clock/src/test/pdf.ts                                          (nuevo)
/home/maxi/program/clock/src/app/(app)/reportes/exportar/pdf/route.ts             (nuevo)
/home/maxi/program/clock/eslint.config.mjs
/home/maxi/program/clock/next.config.ts
/home/maxi/program/clock/package.json
/home/maxi/program/clock/package-lock.json
```

En el paso 1, además, con la regla del dueño del tipo y aviso:
`scope.integration.test.ts` (la llamada con `{ entries: true }`) y
`export/document.ts` (con `entries: null`, sin la sección «Entradas»). Si
`@types/pdfkit` no tipa algo de lo que usa `pdf.ts`, un `declare module` al
lado, en `export/` (D-R7-4).

### R7a — frontend-dev

```
/home/maxi/program/clock/src/modules/report/export/pdf-layout.ts                  (nuevo)
/home/maxi/program/clock/src/modules/report/export/pdf-layout.test.ts             (nuevo)
/home/maxi/program/clock/src/modules/report/export/document.ts
/home/maxi/program/clock/src/modules/report/export/document.test.ts
/home/maxi/program/clock/src/modules/report/export/labels.ts
/home/maxi/program/clock/src/modules/report/components/labels.ts
/home/maxi/program/clock/src/modules/report/components/report-toolbar.test.tsx
```

### R7a — test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts
```

Escribe el caso del criterio 4 contra las firmas publicadas y corre, en una
copia propia con su base, los mutantes de los criterios 3, 4, 8 y 9 de §8.1.

### R7a — e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                      (26)
/home/maxi/program/clock/e2e/reports-page.ts
```

- `reports-page.ts`: `"pdf"` en `ExportFormat`; `"PDF"` en `ExportLabel`;
  `readPdf(path)`, que afirma que empieza con `%PDF-` y devuelve el texto de
  cada página con `pdfjs-dist` (`legacy`, sin worker), con los fragmentos
  unidos y el blanco colapsado (D-R7-10).
- Los mutantes de §8.2, en una copia con puerto propio.

### R7a — parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

Entrega el texto y **lo aplica el team-lead**, antes del merge, con su
corrección fechada y una sección «16. Núcleo, R7»: RP-53 (qué trae el PDF y
qué no: la cabecera y el resumen, sin las entradas, con la cita de Clockify;
A4, los encabezados en cada página, el número de página; el tope de 3000
filas; el blanco como un espacio y U+FFFD para lo que la fuente no dibuja; el
nombre del archivo) y la corrección del texto de R6a que decía que el PDF
traía las entradas (`reportes.md:1594-1598`). Divergencias que el reviewer no
marca: sin gráfico mientras el usuario no lo pida; sin opciones de qué
mostrar; el diseño de la página es propio.

### R7b

Solo si el usuario pide el gráfico, con R7a mergeada:

- **backend-dev**: `export/types.ts` (`chart` en el documento), `pdf.ts` (las
  barras) y `pdf.test.ts`.
- **frontend-dev**: `export/document.ts` (`chart` desde `state.report.chart`),
  `pdf-layout.ts` (el modelo de las barras con `chart-model.ts`) y sus tests.
- **e2e-tester**: el recorrido 27.
- **parity-analyst**: RP-53 con el gráfico.

### Lo que no toca nadie

`src/server/`, `drizzle/`, `src/components/`, `src/lib/`, el resto de
`src/app/`, el resto de `src/test/`, los módulos que no son `report`,
`report/repository.ts`, `report/request.ts`, `report/period.ts`,
`report/chart.ts`, `report/components/` salvo `labels.ts` y el test de la
barra, `export/xlsx.ts`, `export/entry-size.ts`, `scripts/report-volume/`,
`e2e/database.ts`, los ADR y CLAUDE.md. El mapa y el estado los actualiza el
team-lead.

### Orden

_R7-0, hecha (`b26c589`)._

_R7a, ronda 1: `backend-dev` y `frontend-dev`._

1. **Primer commit de `backend-dev`**, que deja el árbol compilando:
   - **las dependencias**: `"pdfkit": "0.20.1"` y `"fontkit": "2.0.4"` en
     `dependencies`; **`@react-pdf/renderer` fuera de `dependencies`**;
     `@types/pdfkit`, `@types/fontkit` y `pdfjs-dist` en `devDependencies`;
     `package-lock.json` con `npm install`, y `npm ls pdfkit fontkit` con las
     dos versiones, sin `@react-pdf/*` en el árbol;
   - **M9**: `src/test/pdf.ts` leyendo un PDF chico de `pdfkit` bajo Vitest en
     Node, con el build `legacy` y sin worker; si no anda, se detiene y avisa
     al team-lead;
   - `"pdf"` en `schema.ts` con `schema.test.ts`; `ExportWriter.entries` y el
     comentario de `sections` en `types.ts`; `cell-text.ts` con su test y
     `csv.ts`; `ReportExportRead`, el tipo de `ReportExportState` y la firma de
     `getReportExport`, con **las cinco llamadas** en `{ entries: true }`; en
     `handler.ts`, `entries: true` en CSV y Excel;
   - **con la regla del dueño del tipo y aviso a sus dueños**, el cambio mínimo
     en `scope.integration.test.ts` (la llamada) y en `document.ts` (con
     `entries: null`, sin la sección «Entradas»), que el tipo nuevo rompe.

   Criterios 1 y 2. **Avisa a `frontend-dev`, a `test-engineer` y al
   team-lead**: las formas son las finales.

2. **`frontend-dev`**, desde el paso 1: el caso de `entries: null` en
   `document.test.ts`, `pdf-layout.ts`, `export/labels.ts` (`pageLabel`) y
   «PDF» en `components/labels.ts`; los criterios 5, 6, 7 y 10.
3. **`backend-dev`**: la lectura sin entradas y el tope de duración con
   `exporting` en `service.ts`; el criterio 3.
4. **`backend-dev`**, con el último commit de `frontend-dev`: la fuente y su
   licencia (bajadas de las direcciones de D-R7-5, con el SHA-256 comparado
   antes de commitear), `pdf.ts`, la entrada `pdf` del handler, la ruta,
   `next.config.ts` y la regla de ESLint; los criterios 8, 9 y 11.
5. **`backend-dev`**: la medición de §6.2.

_R7a, ronda 2: `test-engineer` y `e2e-tester`, con el hash del paso 4._

6. **`test-engineer`**: el criterio 4 y los mutantes de los criterios 3, 4, 8
   y 9.
7. **`e2e-tester`**: `readPdf` y el recorrido 26, con sus mutantes de §8.2.

_R7a, cierre._

8. **El texto de `parity-analyst`**, aplicado por el team-lead.
9. **Revisión de seguridad**: la ruta pasa por `requireSession()` y por el
   service; `no-store` en 200, 403 y 500; el PDF no lee las entradas; el tope de
   duración se fija; el PDF no tiene imágenes, enlaces ni nada de la red; la
   fuente sale del repositorio, con su licencia y el SHA-256 de D-R7-5; la
   regla de ESLint, también la de `@/test/` y la de `@react-pdf/*`;
   `npm audit --omit=dev` con las dependencias nuevas y sin `@react-pdf/*`.
10. **Abrir el archivo** (criterio 13), a mano: el team-lead con lo que haya, y
    el usuario con su visor si quiere.
11. **Merge como R7a.**

_R7b, solo si el usuario pide el gráfico._

12. **`frontend-dev`** y **`backend-dev`**: el gráfico; criterios 16 a 18.
13. **`e2e-tester`**: el recorrido 27.
14. **Paridad**, **abrir el archivo** y **merge como R7b**.

## 8. Criterios de aceptación

_R7a._

1. **Los formatos** (unidad, `schema.test.ts`) — `REPORT_EXPORT_FORMATS` es
   `["csv", "xlsx", "pdf"]`.
2. **El texto de una celda** (unidad, `cell-text.test.ts`) — `text` tal cual,
   también «=1+1» sin `'`; `integer` 3 → «3»; `day` y `clock`, la clave;
   `duration` 90 → «1:30» y 120 000 → «2000:00»; `hours` 1 → «0,01» y 89 →
   «1,48»; `empty` → «». Y `csv.test.ts` sigue con los mismos bytes.
3. **La exportación sin entradas** (integración, `service.integration.test.ts`)
   — con `{ entries: false }`:
   - `entries` es `null` y `report` es igual a `getReportState` del mismo
     pedido y el mismo `now`, también con el primer nivel cortado;
   - **ni `entryListSize` ni `entryList` se llaman** (espías);
   - **`limitStatementTime` se llama una vez, con 8000 y el mismo `Executor`
     que las lecturas, antes de la primera**; con `{ entries: true }`, igual;
     `getReportState` no lo llama;
   - `show statement_timeout` dentro de la transacción (desde un espía de
     `totalsByLevels` que usa su `tx`) da `8s`, y en la conexión siguiente del
     pool, el valor de siempre;
   - con `{ entries: true }`, las afirmaciones de R6 siguen con sus valores.
4. **El alcance** (`scope.integration.test.ts`) — `getReportExport` con
   `{ entries: false }` de un member, un `project_manager` y un `team_manager`
   con `personas=…` ajenas armado a mano: `report` igual al de su pedido sin
   `personas`, solo lo propio.
5. **El documento sin entradas** (unidad, `document.test.ts`) — con
   `entries: null`, una sola sección, «Resumen», y la misma cabecera que con
   entradas.
6. **El texto del PDF** (unidad, `pdf-layout.test.ts`, con una cobertura de
   prueba que cubre ASCII, Latin-1, «Ł» y U+FFFD) —
   - «Łukasz» queda; «Дмитрий» da siete U+FFFD; «😀» da **uno**;
   - «a\tb», «a\nb», «a\r\nb», «a\n\nb» y «a\t\r\n\tb» dan «a b»: **una
     corrida, un solo espacio**;
   - un surrogate suelto, U+FFFE, U+FFFF, U+0000, U+0007, U+007F y U+0085 dan
     U+FFFD **aunque la cobertura diga que sí**.
7. **El diseño** (unidad, `pdf-layout.test.ts`) —
   - el título es la primera fila; la cabecera, las demás, con «Total» y
     «Facturable» de tres celdas («0:59», «0,98»);
   - el resumen de tres niveles: las columnas «Nivel», los tres niveles,
     «Duración» y «Horas», con 0,08, tres de 0,2333…, 0,12 y 0,10, sumando 1
     (con tolerancia de 1e-9), y «Nivel», «Duración» y «Horas» a la derecha;
   - una fila de nivel 3: los dos antepasados con `muted` y el suyo sin; una de
     nivel 1, ninguno; `level` de cada una;
   - los textos con `cellText`: «1:30», «1,50», «Sin proyecto», « (inactiva)»;
     una descripción «=1+1» sin `'`;
   - el vacío, el segundo vacío y el primer nivel cortado: `note` con su texto;
   - un carácter que la cobertura no tiene, cambiado en un rótulo, un
     encabezado, la cabecera y un aviso;
   - una tabla cuya primera celda de datos no es `integer`: `RangeError`.
8. **Los bytes** (unidad, `pdf.test.ts`, leyendo con `pdfPageTexts`) —
   - empieza con `%PDF-`; la página es A4 vertical (595,28 × 841,89 pt, con
     tolerancia de 0,5); el título de los metadatos es «Reporte resumido»;
   - un documento chico: una página, con el título, «Período», los valores de
     la cabecera, «Web (ACME)», «1:30», «1,50» y «Página 1 de 1»;
   - **un documento de unas 200 filas que da tres páginas o más**: el texto de
     cada página tiene la fila de encabezados («Nivel», …, «Horas») y «Página n
     de N», con `n` de 1 a N; **ninguna página sobra**: la última tiene filas
     y N es la cantidad de páginas del archivo;
   - **una fila no se parte**: en ese documento, una fila con un rótulo de 100
     caracteres sin espacios, puesta donde no entra en lo que queda de su
     página, tiene todo su texto y su duración en la página siguiente, y su
     rótulo entero, partido en renglones dentro de la columna;
   - «Łukasz», «Дмитрий» y «…» se leen tal cual; «😀» se lee U+FFFD;
   - la fuente incrustada es un subconjunto de `NotoSans-Regular`, y el
     SHA-256 de `fonts/NotoSans-Regular.ttf` es el de D-R7-5;
   - dos `pdfBytesOf` en paralelo (`Promise.all`) con documentos distintos dan
     cada uno su texto, sin nada del otro.
9. **La ruta** (integración, `export/handler.integration.test.ts`) —
   - `pdf`: 200, `Content-Type: application/pdf`, `Content-Disposition:
attachment; filename="reporte_persona-proyecto_2026-09-28_2026-10-04.pdf"`,
     **`Cache-Control: no-store` exacto**, el cuerpo empieza con `%PDF-`;
   - **ni `entryListSize` ni `entryList` se llaman**; `limitStatementTime`, sí;
   - un member con `personas=<otra>`: el texto del PDF (`pdfPageTexts`) no tiene
     el nombre de la otra persona;
   - con la membresía inactiva, 403; `totalsByLevels` que rechaza, 500, los
     dos con `no-store`;
   - `exportBodyOf` sin entradas con `maxBytes` menor que el PDF: rechaza con
     `RangeError`; por la ruta, 500;
   - CSV y Excel siguen con sus valores y piden las entradas.
10. **La pantalla** (unidad, `report-toolbar.test.tsx`) — con `chart`, el grupo
    «Exportar» tiene «CSV», «Excel» y «PDF» en ese orden; el `href` de «PDF» es
    el de `reportExportHref("pdf", …)` con `state.filters`; sin `download`;
    con `chart: null`, ningún grupo.
11. **Las bibliotecas encerradas** (lint) — con un `import` estático, una
    subruta o un `import()`:
    - de `pdfkit` o `fontkit` en `export/document.ts`, `npm run lint` falla;
      en `pdf.ts`, no;
    - de `@react-pdf/renderer` en cualquier archivo, también en `pdf.ts` y en
      un test, falla;
    - de `exceljs` en `pdf.ts`, falla; de `pdfkit` en `xlsx.ts`, falla;
    - de `pdfjs-dist` en `handler.ts`, falla;
    - **de `@/test/pdf`, estático o con `import()`, o de la ruta relativa a
      `src/test/pdf`, en `handler.ts`, falla**;
    - en un `*.test.ts`, un `*.test.tsx`, `src/test/` y `e2e/`, salvo
      `@react-pdf/*`, ninguno falla.

    Corrido en un worktree o en una copia, no en el árbol compartido.

12. **El rendimiento y el peso** (manual, §6.2) — dentro del presupuesto.
13. **Abrir el archivo** (manual) — el PDF de P1 y el de P2 en un visor y con
    lo que haya (`pdftotext`, LibreOffice, Firefox o Chrome): el texto se
    selecciona y se busca, con los acentos, «…», «–» y «(inactiva)»; las
    columnas alineadas; los encabezados en cada página; ninguna fila partida;
    «Página n de N»; U+FFFD visible; impreso o en vista previa de impresión,
    entra en A4. Lo que no se pudo abrir se dice, con el motivo.
14. **De punta a punta** — el recorrido 26 de §8.2.
15. **Lo existente sigue verde** — lint, typecheck, `format:check`,
    `npm run test:all`, `next build` y la suite e2e entera. Ninguna afirmación
    existente cambia de valor.

_R7b, si el usuario lo pide._

16. **El documento con gráfico** (unidad, `document.test.ts`) — `chart` es el
    de `state.report.chart`; el CSV y el Excel salen con los mismos bytes que
    sin él.
17. **Las barras** (unidad, `pdf-layout.test.ts`) — una barra por tramo, con la
    altura de `barHeightPercent` y las marcas de `tickIndexesOf`; sin gráfico
    (`null`), ninguna.
18. **El PDF con gráfico** (unidad, `pdf.test.ts`) — los rótulos de las marcas
    se leen en la primera página, antes de «Resumen».
19. **De punta a punta** — el recorrido 27.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

- **1** (unidad, `schema.test.ts`): `"pdf"` quitado.
- **2** (unidad, `cell-text.test.ts`): el `'` dentro de `cellText`; las horas
  redondeadas (cae con 1); `formatDuration` cambiado por otro formato.
- **3** (integración, `service.integration.test.ts`): `entries` ignorado (lee
  las entradas igual: caen los espías); el tope de duración con `entries` en
  lugar de `exporting` (cae con `{ entries: false }`); el tope fuera de la
  transacción o con `is_local` en `false` (cae con la conexión siguiente);
  `getReportState` que lo fija.
- **4** (integración, `scope.integration.test.ts`): el alcance sin angostar con
  `personas` en la lectura sin entradas.
- **5** (unidad, `document.test.ts`): «Entradas» con el aviso cuando son
  `null`.
- **6** (unidad, `pdf-layout.test.ts`): recorrer por unidad UTF-16 (cae con el
  emoji: dos reemplazos); `\t`, `\n` o `\r` como U+FFFD en lugar de espacio
  (cae con «a\tb»); un espacio por cada uno, sin juntar la corrida (cae con
  «a\r\nb» y «a\n\nb»); los demás controles solo si la cobertura dice que no;
  sin U+FFFE ni U+FFFF.
- **7** (unidad, `pdf-layout.test.ts`): los antepasados sin `muted`; el propio
  con `muted`; los anchos que no suman 1; «Horas» a la izquierda; el `'` del
  CSV; un aviso tomado como tabla; la cabecera sin `pdfTextOf`.
- **8** (unidad, `pdf.test.ts`): la fila de encabezados solo en la primera
  página (cae: una página sin encabezados); el pie escrito debajo del margen
  (cae: una página de más, sin filas); `LETTER` en lugar de `A4`; la fila
  partida entre dos páginas (cae: el rótulo en una y la duración en otra); el
  texto sin `pdfTextOf` (cae con «😀»); Helvetica en lugar de la fuente (cae
  con «Дмитрий»); la cobertura de otra fuente; la fuente cambiada (cae con el
  SHA-256); un `PDFDocument` compartido entre llamadas (cae con las dos en
  paralelo).
- **9** (integración, `handler.integration.test.ts`): `entries: true` en el
  PDF (caen los espías); `inline`; sin `no-store`; `text/plain` en lugar de
  `application/pdf`; la guarda de peso quitada (cae: 200 con un PDF de más).
- **10** (componente, `report-toolbar.test.tsx`): «PDF» sin rótulo propio
  (muestra la clave); `download`.
- **11** (lint): `pdfkit` fuera de la regla; `@react-pdf/*` permitido en
  `pdf.ts` o en los tests; el selector de `import()` quitado; la excepción
  ampliada a `src/**`; el patrón de `@/test/*` quitado.
- **12, 13** (manual): —.
- **14** (e2e): los del final de §8.2.
- **15**: —.
- **16 a 18** (unidad): el gráfico escrito en el CSV o el Excel; la escala de
  otro máximo; las marcas de otro paso.
- **19** (e2e): el PDF sin el gráfico.

**Cualquier mutante declarado equivalente** se prueba antes con pedidos de una
membresía inactiva, de otro workspace y de un member con horas ajenas en el
rango.

### 8.2 Recorridos de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Los veinticinco de R2a a R6 no cambian. Se suma uno en
R7a y, si el usuario pide el gráfico, uno en R7b, con las entradas de los
recorridos 23 a 25 (§8.2 de R6) y la misma regla.

26. **Exportar a PDF el resumen, sin las entradas** (RP-53; D-R7-2, D-R7-6 a
    D-R7-8). Del 2025-09-15 al 2025-09-21, por Proyecto → Fecha:
    - el grupo «Exportar» tiene «CSV», «Excel» y «PDF», en ese orden; el
      `href` de «PDF» es `/reportes/exportar/pdf` con la misma query que la
      página; **sin prefetch** (`recordExportRequests`, como el 23);
    - el clic en «PDF» descarga
      `reporte_proyecto-fecha_2025-09-15_2025-09-21.pdf` y la página sigue en
      `/reportes`;
    - `readPdf`, con los fragmentos unidos: una página, con «Reporte
      resumido», «Período» y «15/09/2025 – 21/09/2025», «Solo las horas de
      {nombre}», «Web {sufijo} (ACME {sufijo})» con «2:15» y «2,25», «Sin
      proyecto» con «0:30» y «0,50», y «Página 1 de 1»; **no** trae
      `Revisión "final"; v2`, «=1+1» ni «Entradas»;
    - `page.request.get(href)`: 200; `content-type` `application/pdf`;
      `cache-control` contiene `no-store`; `content-disposition` con
      `attachment` y el nombre.
27. **(R7b) El gráfico en el PDF**: con la misma URL, la primera página trae
    los rótulos de las marcas del gráfico antes de «Resumen».

Los mutantes que tienen que caer en e2e, en una copia con puerto propio:
`entries: true` en el PDF (26: trae `Revisión`); `inline` (26: no hay
`download`); sin `no-store` (26); `Link` en lugar de `<a>` (26: hay un pedido
antes del clic); el rótulo «PDF» quitado (26). La fuente fuera de
`outputFileTracingIncludes` no cae acá (`next start` lee del árbol), sino en
el trazado de §6.2 y en la comprobación en Vercel (§10, «Para el team-lead»,
punto 4).

### 8.3 Lo que no se prueba en e2e

- **El blanco, el reemplazo de lo que la fuente no dibuja, los encabezados por
  página y las filas que no se parten**: criterios 6 a 8.
- **Las 3000 filas**: §6.2, no `npm test` ni e2e.
- **El tope de duración**: criterio 3.
- **El 403, el 500 y la guarda de peso**: criterio 9.
- **Cómo se ve y cómo se imprime**: criterio 13.
- **Que la fuente viaje con la función en Vercel**: §6.2 lo mira en el trazado
  y el usuario, en producción.
- **Los límites de Vercel**: §6.3 y la comprobación del usuario después del
  despliegue.

## 9. Riesgos y deuda conocida

- **La tabla es código propio**: medir las filas, saltar de página, repetir
  los encabezados y numerar. Lo que no depende de la biblioteca vive en
  `pdf-layout.ts`, con sus tests; lo que sí, en `pdf.ts`, con el criterio 8.
- **El peor pedido entero en frío** (P2 en frío) no se midió en R7-0; lo mide
  §6.2. Con 3 s en local quedan 7 s para la CPU de Vercel y la red hasta Neon;
  ninguna de las dos está medida.
- **La fuente fuera del trazado** no se ve en local ni en e2e: `next start` la
  lee del árbol. Lo cubren el trazado de §6.2 y la comprobación del usuario en
  producción. Sin `outputFileTracingIncludes`, el PDF da 500 en Vercel.
- **El empaquetado de `pdfkit` por Turbopack** funciona hoy; si un cambio de
  Next lo rompe, la salida medida es el paquete externo (D-R7-4).
- **La fuente cubre lo que cubre**: un emoji, «→» o el griego que falta salen
  como U+FFFD. El CSV y el Excel lo conservan.
- **Un binario en el repositorio**: la fuente, con su licencia; el criterio 8
  compara su SHA-256.
- **Sin PDF etiquetado** (PDF/UA): el contrato no lo pide. Un lector de
  pantalla lee el texto en orden, sin la estructura de la tabla. El CSV y el
  Excel son la forma accesible de los mismos datos.
- **Sesenta y siete páginas en el peor caso**: 3000 filas con Noto, que es más
  ancha que Helvetica; 167 con rótulos de 100 caracteres. Es el tope de
  Clockify y el de la pantalla.
- **La fecha de creación del PDF** va en sus metadatos: dos descargas del mismo
  reporte no son iguales byte a byte. Los tests no comparan bytes enteros.
- **`pdfjs-dist`, `@types/pdfkit` y `@types/fontkit`** son dependencias de
  desarrollo más; la regla de `@/test/*` impide que `pdfjs-dist` llegue a
  producción por un helper.

## 10. Decisiones del usuario, notas y pendientes

### Decisiones del 2026-10-12, con la medición R7-0

1. **La biblioteca: `pdfkit` directo** (decisión del usuario). Es el
   [ADR 0022](../adr/0022-el-pdf-del-reporte-se-dibuja-con-pdfkit.md).
   `@react-pdf/renderer` tardó 29,6 s y usó 1,6 GB con 3000 filas; `pdfkit`,
   0,25 s y 135 MB. `@react-pdf/renderer` queda sin uso y sale de
   `dependencies` en el paso 1 de R7a, por `backend-dev`.
2. **La fuente: Noto Sans Regular sin hinting** (decisión del team-lead, por
   delegación del usuario): 431 KB, SIL OFL 1.1, con U+FFFD; entra al trazado
   con `outputFileTracingIncludes` (D-R7-5).
3. **`pdfjs-dist` en `devDependencies`** para leer el PDF en los tests
   (decisión del team-lead, D-R7-10).

### Decisiones del usuario que este contrato hereda

- **Ninguna exportación va al `audit_log`** (2026-10-12, R6): tampoco el PDF.
- **Las entradas una por una van en CSV y Excel** (mapa §5): el PDF no las
  lleva (D-R7-2).

### Pendiente del usuario

1. **¿El gráfico de R5 va en el PDF? (R7b).** Clockify lo trae y deja sacarlo.
   Sumarlo es R7b: el documento lleva el gráfico y el PDF lo dibuja con
   rectángulos de `pdfkit`, sin imágenes; CSV y Excel no cambian. **No se
   arranca hasta que lo pidas.** Recomendación: sí, después de R7a, porque
   RP-53 es `replicar`; no bloquea nada de R7a.

### Nota para el usuario

1. **El criterio 13 se prueba mejor con tu visor y tu impresora.** Si podés,
   abrí el PDF de un mes y fijate que se lea, que los encabezados estén en cada
   página y que entre en A4.

### Para el team-lead

1. **Sacar `@react-pdf/renderer` de `dependencies` lo decidió este contrato**
   (D-R7-4), como consecuencia del ADR: queda sin uso, y la regla de ESLint
   impide que vuelva. Si preferís dejarlo, el paso 1 no lo saca y la regla
   igual lo prohíbe.
2. **El mapa se ajusta en R7**: «Tope de filas, como el de 3000 de Clockify» es
   el mismo `REPORT_MAX_ROWS`, sin tope nuevo; el PDF no lleva las entradas; la
   biblioteca es `pdfkit`, no `@react-pdf/renderer`.
3. **CLAUDE.md no cambia**: la línea de `reportes/exportar/` de «Estructura» ya
   dice «una carpeta por formato», y el recorrido de las descargas vale igual.
4. **La comprobación en Vercel queda para después del despliegue**, en
   producción y por el usuario: descargar un PDF de un mes, ver
   `Cache-Control: no-store` y el nombre, que «Дмитрий» o «Łukasz» se vean (la
   fuente viajó con la función) y cuánto tarda el primer pedido después de un
   rato sin uso (el tiempo en frío).
5. **`format:check`**: este contrato y el ADR se escribieron sin shell; antes
   del commit, `npx prettier --write` sobre los dos.

## 11. Fuera de alcance

- Las entradas una por una en el PDF (D-R7-2).
- Elegir qué muestra el PDF («you can disable certain information»), la
  orientación, el tamaño de página o la fuente desde la pantalla.
- Un PDF etiquetado (PDF/UA).
- Imágenes, logos o enlaces dentro del PDF.
- Un tope de filas propio del PDF distinto de 3000, salvo que §6.2 lo pida
  (§6.4).
- El detallado y su PDF.
- Exportaciones programadas o por correo (RP-56).
- Streaming de la respuesta.

## 12. ADR

[ADR 0022](../adr/0022-el-pdf-del-reporte-se-dibuja-con-pdfkit.md), aceptado el
2026-10-12 por el usuario, con la medición R7-0: el PDF se dibuja en el
servidor con `pdfkit`, empaquetado, con la tabla y la paginación a mano y Noto
Sans incrustada. Reemplaza el ADR propuesto de las versiones anteriores de este
contrato, que recomendaba `@react-pdf/renderer` sujeto a la medición.
