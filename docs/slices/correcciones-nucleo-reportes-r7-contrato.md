# Correcciones del contrato de R7 — primera pasada (2026-10-12)

Revisión de `architecture-reviewer` sobre
`docs/slices/nucleo-reportes-r7-exportar-pdf.md` (rama `nucleo/r7-contrato`,
commit `55e938e`), contra el árbol de `main` en `31a83b3`. Las líneas sin
archivo son del contrato.

## Veredicto

**Cambios requeridos.** Sin bloqueantes; dos mayores, los dos en el plan de
medición de §6 que decide el ADR, y seis menores.

## Hallazgos

### Mayores

**1. Los casos de 3000 filas no salen de los pedidos que nombra la medición.**

- **Dónde:** §6.1, M3 `:757-761` y M6 `:770-771`; §6.2, P2 `:798-799` y P4
  `:802`; la decisión del ADR propuesto `:1296-1298`.
- **Regla:** el plan de medición tiene que producir el caso que decide el ADR.
- **Qué pasa:** cada nivel del árbol entra entero o no entra
  (`readLevelsWithinLimit`, `service.ts`; D-R3-6), y el volumen sintético
  reparte las entradas entre 24 proyectos o ninguno
  (`scripts/report-volume/seed.sql:140`).
  - **Persona → Proyecto → Fecha, 366 días, todo el equipo:** da unas 30 + 750
    filas. La fecha (unas 750 × 261) no entra, así que el PDF tiene unas 780
    filas, no 3000. Es el E3 de R6, que tampoco tenía 3000: su presupuesto era
    ≤ 500 KB.
  - **Persona → Descripción, 366 días (M6):** el segundo nivel tiene miles de
    pares persona y texto (el 20 % de las entradas tiene descripción única) y
    no entra, así que quedan 30 filas. Además, el volumen solo tiene rótulos de
    100 caracteres en el 1 % de las entradas.
  - M3 con 3000 filas, que es la condición del ADR (≤ 3 s, ≤ 512 MB), M6
    (≤ 2 MB), P2 y P4 medirían algo mucho más chico que el peor caso que dicen
    medir.
- **Cambio:**
  - En **M3 y M6**, el documento de 50, 500 y 3000 filas se arma directo (un
    `ReportReadyState` armado a mano que pasa por `exportDocumentOf`, o un
    `ExportDocument` sintético con tres niveles). M6 lleva rótulos de 100
    caracteres en todos los niveles de texto. El informe dice cuántas filas
    escribió.
  - En **P2 y P4**, que miden de punta a punta, un pedido del volumen que dé
    entre 2900 y 3000 filas con todos los niveles. Por ejemplo, Persona →
    Fecha sobre el período de unos 95 días hábiles que lo logre. `backend-dev`
    lo ajusta y anota el pedido, `levelsShown` y las filas. Si no hay un pedido
    que llegue, P2 y P4 suman la lectura de E3 al escritor sobre el documento
    sintético, y el informe lo dice.

**2. Ningún presupuesto acota el peor pedido real contra los 10 s del diseño.**

- **Dónde:** §6.1, los presupuestos `:776-781`; el ADR propuesto
  `:1296-1299`; D-R7-11 `:275-280`.
- **Regla:** que los presupuestos sean razonables para Vercel Hobby, contra el
  límite de 10 s que el contrato elige.
- **Qué pasa:** el peor pedido es el primero en frío con el documento de 3000
  filas. M2 (frío, ≤ 3 s más que el CSV) y M3 (escritura, ≤ 3 s) se miden por
  separado, y nada mide los dos juntos. Sumando lo que admiten, más la lectura
  (E3 de R6, unos 0,3 s) y el frío del CSV, el peor pedido puede rondar 7 s en
  la máquina local. En Vercel, con otra CPU y la red hasta Neon, no queda
  margen contra 10 s. Así, el criterio del ADR puede recomendar P-RP sin que
  quepa en el límite que el propio contrato fija.
- **Cambio:**
  - Sumar **M8**: después de `next start`, en un proceso nuevo, el primer
    pedido a `exportar/pdf` con el documento más grande de M3 (por la ruta, con
    su lectura), mediana de cinco reinicios. Presupuesto **≤ 5 s** local, el
    doble de margen contra 10 s.
  - Sumar M8 a la condición del ADR (§12) y a §6.2 (P2 en frío). Si P-RP no
    cumple M8 y P-KIT sí, vale la regla de `:784-787`.

### Menores

**3. El paso 1 deja el árbol sin compilar.**

- **Dónde:** §1 `:413-417`; §7, «Orden», paso 1 `:940-946`.
- **Qué pasa:**
  - `getReportExport` se llama en **cinco** lugares, no en cuatro: falta
    `src/modules/report/export/handler.integration.test.ts:305`. Las otras son
    `service.integration.test.ts:4284` y `:4737`,
    `scope.integration.test.ts:3049` y `handler.ts:112`.
  - `scope.integration.test.ts` es de `test-engineer` en el reparto (`:876`).
  - Además, cuando el tipo `ReportExportState.entries` admite `null`,
    `document.ts:40` (`entriesSectionOf(input.entries)`) deja de compilar hasta
    el paso 2, y `document.ts` es de `frontend-dev`.
- **Cambio:** listar las cinco llamadas. Decir que en el paso 1 `backend-dev`
  hace, con la regla del dueño del tipo y con aviso, el cambio mínimo en
  `scope.integration.test.ts` y en `document.ts` (con `null`, sin la sección
  «Entradas»), o que el paso 1 solo publica tipos que no rompen nada.

**4. La ruta del trazado de M1 está mal y la comparación con el CSV no aísla
la biblioteca.**

- **Dónde:** §6.1, M1 `:749-752`.
- **Qué pasa:**
  - Con el grupo de rutas, el archivo es
    `.next/server/app/(app)/reportes/exportar/pdf/route.js.nft.json`; así está
    hoy el del CSV.
  - Con Turbopack, lo que se empaqueta va a fragmentos compartidos. Los
    trazados de `csv` y `xlsx` del build actual son iguales (244 archivos,
    4,8 MB), con `exceljs` dentro de un fragmento común. La diferencia de los
    totales puede no mostrar lo que suma el PDF. `@react-pdf/renderer` es
    externo y su `node_modules` sí aparece por ruta.
- **Cambio:** corregir la ruta. Que M1 informe el total y, aparte, lo que el
  trazado del PDF lista de `node_modules/@react-pdf`, `pdfkit`, `fontkit`,
  `yoga-layout` y sus dependencias, y si la fuente está. El límite de
  referencia de Vercel (250 MB sin comprimir, _no verificado_) va al lado del
  presupuesto de 50 MB.

**5. `\t`, `\n` y `\r` como U+FFFD se apartan de la pantalla.**

- **Dónde:** D-R7-5 `:177-182`; §4.5 `:601-603`; criterio 6 `:1011-1015`;
  §8.1, fila 6.
- **Qué pasa:** la descripción admite saltos de línea y tabulaciones internas
  (el esquema solo hace `trim`, `src/modules/time-entry/schema.ts:60-64`), y la
  pantalla los muestra como un espacio, porque HTML colapsa el blanco. En el PDF
  saldrían como «�» en el medio del rótulo.
- **Cambio:** que `pdfTextOf` cambie `\t`, `\n` y `\r` por un espacio y deje
  U+FFFD (o «?») para los demás controles, U+FFFE, U+FFFF, los surrogates
  sueltos y lo que la fuente no cubre. Ajustar el criterio 6 y su mutante.

**6. Los lectores y helpers de los tests quedan sin precisar.**

- **Dónde:** criterio 8 `:1035-1037`; D-R7-10 `:260-273`; §7, e2e `:889-890`;
  §1 `:435-436`.
- **Qué pasa:**
  - El criterio 8 dibuja 3000 filas (unas 60 páginas) en un test de unidad.
    Con `@react-pdf/renderer` puede rozar el tiempo por omisión de Vitest
    (5 s) y alarga `npm test`; las 3000 filas ya las miden §6.1 y §6.2.
  - `pdfjs-dist` en Node pide su build `legacy` sin worker. Además, el texto
    de una celda que se parte en renglones llega en varios fragmentos, así que
    «Web {sufijo} (ACME {sufijo})» puede no aparecer seguido en lo que devuelve
    `readPdf`.
  - En `e2e/reports-page.ts`, además de `ExportLabel` (`:913`), cambia
    `ExportFormat` (`:283`), que hoy es `"csv" | "xlsx"`.
- **Cambio:**
  - Que el criterio 8 use un documento de unas 200 filas que dé tres páginas o
    más.
  - Que D-R7-10 diga «`pdfjs-dist/legacy/build/pdf.mjs`, sin worker» y que
    `readPdf` y el lector del test unan los fragmentos de cada página y colapsen
    el blanco antes de buscar.
  - Que R7-0 lo pruebe una vez bajo Vitest en Node.
  - Sumar `"pdf"` a `ExportFormat`.

**7. El registro de la fuente choca con «sin estado mutable a nivel de
módulo».**

- **Dónde:** D-R7-5 `:188-191`; §4.6 `:634-637`.
- **Regla:** `.claude/skills/code-conventions/SKILL.md`, «TypeScript»: sin
  estado mutable a nivel de módulo; la única excepción es el pool.
- **Qué pasa:** el contrato registra la fuente «al cargar el módulo y una vez
  por instancia». `Font` de la biblioteca es un almacén global, y una caché
  propia de la cobertura sería estado del módulo.
- **Cambio:** que `pdf.tsx` no guarde nada propio: registrar dentro de
  `pdfBytesOf` solo si `Font.getRegisteredFontFamilies()` no tiene la familia, y
  dejar que `Font.load` cachee en la biblioteca. Si se prefiere el registro al
  cargar, nombrarlo como excepción con su motivo en el comentario, como el pool.

**8. «El último slice del núcleo» ya no es cierto.**

- **Dónde:** `:3`.
- **Qué pasa:** R9 entra en el núcleo (mapa §5, «R9 entra») y el pedido
  vigente es «seguir con R6a, R6b, R7 y R9» (`068aabd`).
- **Cambio:** «Contrato del slice R7 del núcleo de reportes».

## Firmas compiladas

Las compilé en un archivo temporal del scratchpad, ya borrado, con el `tsc` del
repo (TypeScript 5.9.3), la `lib`, `strict` y `jsx: react-jsx` del
`tsconfig.json`, y los tipos de `node_modules`. Usé `ExportCell`, `ExportRow`,
`ExportSection`, `ReportReadyState`, `ReportExportEntries`, `ReportRequest`,
`Actor`, `TimeSettings` y `csvBytesOf` reales del árbol. **Compila sin
errores**:

- `ReportExportRead`, `ReportExportState` con `entries: … | null` y
  `getReportExport` con `read` antes de `now?`;
- las dos sobrecargas de `readReportState`: con `null` da
  `ReportStateRead<null>`, y con un `ReportExportRead`,
  `ReportStateRead<EntryRead | null>`;
- `ExportWriter` con `entries` y `cellText`;
- `PdfGlyphs`, `PdfCell`, `PdfColumn`, `PdfRow`, `PdfSection`, `PdfLayout`,
  `pdfTextOf` y `pdfLayoutOf`;
- `pdfBytesOf` en `.tsx` con `Document title language`, `Page size="A4"`,
  `View fixed`, `View wrap={false}` y `Text fixed render={({ pageNumber,
totalPages }) => …}`;
- `Font.register`, `Font.registerHyphenationCallback` y `Font.load`;
  `Font.getFont(…).data` leído como `unknown` y estrechado con un guardián de
  tipo (`data` es `Font | null` de `fontkit`, sin tipos instalados);
- `new Uint8Array(await renderToBuffer(…))` como `Uint8Array<ArrayBuffer>`;
- `EXPORT_WRITERS` con la entrada `pdf` y `import()`,
  `satisfies Record<"csv" | "xlsx" | "pdf", ExportWriter>`;
- la llamada `{ entries: EXPORT_WRITERS[format].entries }` y
  `new Response(body)`.

## Lo que se verificó y quedó bien

- **Citas del árbol en `31a83b3`:** `handler.ts`, `types.ts`, `csv.ts`
  (`cellText` privada, `:17-34`), `document.ts`, `xlsx.ts`, `entry-size.ts`,
  `service.ts` (`plan.entries` y `limitStatementTime`), `repository.ts`,
  `schema.ts`, `eslint.config.mjs`, `labels.ts`, `report-toolbar.tsx` (un
  enlace por formato), `chart-model.ts` sin imports, `vitest.config.ts` y los
  tipos de `@react-pdf/renderer` (`renderToBuffer`, `Font`, `DocumentProps`
  con `title` y `language`) y de `@react-pdf/font`.
- **Herencia de R6:**
  - B4 medido como CSV queda para CSV y Excel, y el PDF no lo usa.
  - `truncatedHours` llega por `cellText` (`formatDecimalHours`).
  - U+FFFD sale de `pdfTextOf`, con «?» bien explicado para Helvetica.
  - El tope de duración pasa de `entries` a `exporting`, con su criterio y su
    mutante.
  - La regla de ESLint se generaliza por archivo y suma `*.test.tsx`.
- **Recorrido y alcance:** sin cambios de acceso; la lectura sin entradas
  conserva `readScope` (criterio 4).
- **División:** R7-0 en un worktree y sin merge (la lección de
  `correcciones-nucleo-reportes-r6b.md`), R7a que se despliega sola y R7b
  condicionado. El reparto es claro, salvo el hallazgo 3.
- **Criterios:** verificables, con mutantes por criterio, salvo los ajustes de
  los hallazgos 5 y 6.
- **§10:** las preguntas 1 y 2 (biblioteca y fuente) son del usuario, con la
  recomendación y lo que bloquean; la 3 solo bloquea R7b; la 4 tiene
  alternativa escrita.
- **ADR 0022:** queda propuesto, no escrito, como decisión del usuario; el
  número es el siguiente libre.

## Respuesta del architect

Aplicada el 2026-10-12. Las secciones son del contrato corregido. Los
hallazgos 1, 2 y 4 quedan como las indicaciones que `backend-dev` ya sigue en
R7-0.

1. §6.1: «Los documentos grandes se arman a mano» y M3 y M6 con el
   `ExportDocument` de 50, 500 y 3000 filas armado a mano (M6, rótulos de 100
   caracteres en todos los niveles de texto; el informe dice las filas); §6.2,
   P2 y P4 con un pedido real de 2900 a 3000 filas, anotado, y la salida si no
   lo hay; «Lo que no se sostiene», punto 6, explica por qué.
2. M8 nuevo en §6.1 (el primer pedido en frío por la ruta, con la lectura de
   P2 y el documento de 3000 filas, mediana de cinco reinicios, ≤ 5 s), primero
   entre los presupuestos; P2 en frío en §6.2; en la decisión del ADR (§12),
   en D-R7-11, en §9 y en la pregunta 1 de §10.
3. Las cinco llamadas en los supuestos de §0, en §1 y en el paso 1 de §7; el
   paso 1 hace, con la regla del dueño del tipo y aviso, el cambio mínimo en
   `scope.integration.test.ts` y en `document.ts`, nombrado también en §1 y en
   el reparto de `backend-dev`; el paso 2 de `frontend-dev` suma el caso de
   `null` en `document.test.ts`.
4. M1 con `.next/server/app/(app)/reportes/exportar/pdf/route.js.nft.json`, el
   total y aparte `@react-pdf`, `pdfkit`, `fontkit`, `yoga-layout` y sus
   dependencias, y la fuente; por qué la resta contra el CSV no sirve con
   Turbopack (también en los supuestos de §0); los 250 MB de Vercel, no
   verificados, al lado de los 50 MB en §6.1, D-R7-11 y §12.
5. `pdfTextOf` cambia `\t`, `\n` y `\r` por un espacio (D-R7-5, §4.5 y su
   firma); el criterio 6 suma «a\tb», «a\nb» y «a\r\nb», con U+0000 y los demás
   controles como reemplazo; §8.1, fila 6, suma el mutante del blanco como
   reemplazo; el texto de paridad lo nombra.
6. Criterio 8 con unas 200 filas y tres páginas o más (D-R7-13 y §8.3 dejan las
   3000 filas a la medición); D-R7-10 con `pdfjs-dist/legacy/build/pdf.mjs` sin
   worker y los fragmentos unidos con el blanco colapsado; un lector nuevo,
   `src/test/pdf.ts` (`pdfPageTexts`, §4.8), para los criterios 8 y 9, con
   `src/test/**` en la excepción de ESLint (D-R7-9, §4.9 y criterio 11); M9 en
   R7-0 lo prueba bajo Vitest en Node; `"pdf"` en `ExportFormat` (§0, §1 y §7,
   e2e).
7. D-R7-5 y §4.6: `pdf.tsx` sin estado propio; `pdfBytesOf` registra la familia
   solo si `Font.getRegisteredFontFamilies()` no la tiene, y `Font.load` guarda
   la fuente en la biblioteca; el criterio 8 y su mutante lo afirman; §9 anota
   el almacén global de la biblioteca.
8. La primera línea dice «Contrato del slice R7 del núcleo de reportes».

## Segunda pasada

Revisión de `architecture-reviewer` sobre `f73b455`, con
`git diff 55e938e f73b455`. Las líneas son del contrato corregido.

**Veredicto: cambios requeridos, solo menores.** Los ocho hallazgos de la
primera pasada quedaron resueltos. Hay tres hallazgos nuevos, menores, en lo que
agregó la corrección; si se aplican tal cual, no hace falta una tercera pasada.

### Lo que quedó resuelto

- **El diff:** todos los cambios caen en las secciones de los ocho hallazgos.
  No se perdió ni cambió texto fuera de ellas; las demás decisiones, §2, §3,
  §5, §11 y las preguntas 2 a 4 de §10 quedan iguales a `55e938e`.
- **Hallazgos 1 y 2:** los documentos de 50, 500 y 3000 filas se arman a mano
  (M3 y M6); P2 y P4 usan un pedido real de 2900 a 3000 filas, con su salida si
  no lo hay; M8, el peor pedido en frío, tiene un presupuesto de ≤ 5 s y entra
  en la decisión del ADR, en D-R7-11, en §9 y en la pregunta 1.
- **Hallazgo 3:** las cinco llamadas están en §0, §1 y el paso 1; el cambio
  mínimo en `scope.integration.test.ts` y `document.ts` queda con la regla del
  dueño del tipo.
- **Hallazgo 4:** la ruta del trazado lleva `(app)`, con el desglose por
  paquete y los 250 MB, no verificados.
- **Hallazgos 5 a 8:** el blanco como espacio, el lector `pdfPageTexts`, el
  build `legacy` y M9, `"pdf"` en `ExportFormat`, `pdf.tsx` sin estado propio y
  la primera línea.

### Compilación

Compilé en un archivo temporal del scratchpad, ya borrado, con el `tsc` del repo
(5.9.3), la `lib`, `strict` y `jsx` del `tsconfig.json`. Para `pdfjs-dist` usé
los tipos de la 5.7.284 (la versión que `pdfkit` declara), instalada aparte en
el scratchpad con `--ignore-scripts` y ya borrada. **Compila sin errores**:

- `pdf.tsx`: `Font.getRegisteredFontFamilies().includes(…)` antes de
  `Font.register`, `registerHyphenationCallback`, `Font.load`,
  `Font.getFont(…).data` como `unknown` con un guardián de tipo, el JSX con
  `fixed`, `wrap={false}` y `render`, y
  `new Uint8Array(await renderToBuffer(…))` como `Uint8Array<ArrayBuffer>`;
- `src/test/pdf.ts`: `pdfPageTexts(bytes: Uint8Array): Promise<readonly string[]>`
  implementada con `getDocument` de `pdfjs-dist/legacy/build/pdf.mjs`,
  `getTextContent`, los fragmentos unidos y el blanco colapsado;
- las cinco llamadas a `getReportExport` con `read` antes de `now?`, con la
  forma de cada una en el árbol: `handler.ts:112`,
  `service.integration.test.ts:4284` y `:4737`,
  `scope.integration.test.ts:3049` y `handler.integration.test.ts:305`. La
  forma vieja, con `now` como cuarto argumento, ya no compila: el compilador
  obliga a tocar las cinco.

M9 está bien planteado: el build `legacy` sin worker, bajo Vitest en Node, sobre
el PDF de M5; Node 24, el de CI, alcanza para la 5.x. No corrí el lector:
probarlo es M9.

### Hallazgos nuevos

**N1 (menor). «a\r\nb» no da «a b» con la regla escrita.**

- **Dónde:** D-R7-5 `:183-185`; §4.5 `:676-679`; criterio 6 `:1114-1115`.
- **Qué pasa:** la regla cambia `\t`, `\n` y `\r` «cada uno» por un espacio,
  así que «a\r\nb» da «a␠␠b», con dos espacios; el criterio espera «a b».
  Además, la pantalla colapsa toda corrida de blanco en un espacio, y la regla
  no colapsa nada.
- **Cambio:** fijar una de dos y ajustar el criterio y su mutante:
  - **(recomendada)** una corrida de `\t`, `\n` y `\r` pasa a ser un solo
    espacio, así que «a\r\nb» y «a\n\nb» dan «a b»;
  - o cada uno es un espacio y el criterio espera «a␠␠b».

**N2 (menor). El riesgo de registrar la fuente dos veces a la vez no existe si
la consulta y el registro van juntos.**

- **Dónde:** §9 `:1290-1294`; §4.6 `:682-688`.
- **Qué pasa:** `getRegisteredFontFamilies()` y `Font.register` son
  sincrónicos. En un proceso de Node, dos pedidos no pueden registrar los dos la
  familia salvo que haya un `await` entre la consulta y el registro. Con la
  regla bien escrita, el riesgo de §9 no se da; con un `await` en el medio, sí
  se da, y nada lo prueba.
- **Cambio:** que §4.6 diga «la consulta y el registro, seguidos y sin `await`
  entre los dos», y que §9 lo diga así en lugar del riesgo. Opcional: sumar al
  criterio 8 dos `pdfBytesOf` en paralelo (`Promise.all`) que registran la
  familia una vez.

**N3 (menor). Nada impide que producción importe `src/test/`, que ahora puede
traer `pdfjs-dist`.**

- **Dónde:** D-R7-9 `:269-272`; §4.9 `:754`.
- **Qué pasa:** la excepción de `src/test/**` deja ahí cualquiera de las
  bibliotecas, y ninguna regla impide que un archivo de producción importe
  `@/test/pdf`. Hoy ninguno importa `@/test/` (lo usan solo los tests y
  `vitest.integration.config.ts`), pero ese import pasaría `lint` y llevaría
  una dependencia de desarrollo a la función.
- **Cambio:** sumar a la regla de §4.9 el patrón `@/test/*` (y la ruta
  relativa a `src/test/`), prohibido fuera de `**/*.test.ts`, `**/*.test.tsx`,
  `src/test/**` y `e2e/**`, con su caso en el criterio 11.

## Tercera pasada

Revisión de `architecture-reviewer` sobre la versión con `pdfkit` (`cf94f4d`),
contra `main` en `6be71a7` y la medición rehecha (`7644438`). Las líneas del
informe son del contrato en `6be71a7`.

**Veredicto: no aprobado.** Cinco mayores, ninguno bloqueante, y cuatro
menores; todos se arreglan editando el texto. Con los mayores aplicados queda
«aprobado con menores», sin otra pasada completa: basta revisar las líneas
tocadas.

### Hallazgos

**1 (mayor). La fuente entra sola al trazado, así que
`outputFileTracingIncludes` sobra.** La medición `7644438` (M1) dice que
Turbopack sigue la ruta literal de `path.join(process.cwd(), "src/…")`; con el
include la fuente aparece dos veces. El riesgo pasa a ser una ruta armada de
otra forma, que la deja fuera del trazado sin que se note en local.

**2 (mayor). Las cifras y el estado de M8 y M9 son los de la primera medición
(`b26c589`).** El hash, el trazado (5,00 y 11,36 MB), las páginas (88), el peor
peso (627 KB en 273 páginas), M2 (780 filas, +0,17 s), M3 (0,28 s, 122 MB), M8
(0,85 s), M9 (funciona) y las cifras de §10.

**3 (mayor). El lector de los tests no sigue la forma de leer que funcionó en
M9.** Unir los fragmentos con un espacio parte la palabra de 100 «x» en tres;
pegarlos sin espacio rompe un rótulo partido en un espacio. M9 lee por fila.

**4 (mayor). El contrato no sabe que R9 va antes.** El recorrido 26 choca con
los 26 y 27 de R9; falta el caso del PDF que R9 delega a R7a (su criterio 15);
las líneas citadas se corren con el merge de R9.

**5 (mayor). `pdfkit` 0.20.1 o 0.20.2, a conciencia.** 0.20.2 es `latest` y su
CHANGELOG arregla el trazado de las métricas de las fuentes estándar, que
`new PDFDocument()` carga siempre (`initFonts`, `pdfkit.js:3695`, `:7040`). La
salida externa medida depende de ese trazado y M1 la probó solo con
`next start`.

**6 (menor). Las versiones y licencias de las dependencias nuevas.**
`@types/pdfkit` 0.17.6, `@types/fontkit` 2.0.9, `pdfjs-dist` 6.4.299, con
`--save-exact`; sin `declare module`; `Font` contra `FontCollection` sin
aserción; `pdfjs-dist` fuera de la auditoría de CI.

**7 (menor). Los rótulos tienen hasta unos 203 caracteres, no 100.** La tarea
es «nombre (proyecto)» y el proyecto, «nombre (cliente)», con `NAME_MAX = 100`.

**8 (menor). El ADR 0022 tiene los mismos datos viejos.** Propone un párrafo
«Corrección (2026-10-12)» en lugar de reescribirlo.

**9 (menor). Detalles de forma.** El estado de la revisión (`:30-34`) tiene que
nombrar la tercera pasada; `prettier --write` antes del commit.

### Decisiones del team-lead para lo abierto

- **Hallazgo 5:** `"pdfkit": "0.20.2"` exacta; el paso 1 corre `next build` y
  `next start`, baja un PDF y mira el `route.js.nft.json` de la ruta del PDF
  (la fuente y las métricas que carga `pdfkit`).
- **Hallazgo 6:** las cuatro versiones con `--save-exact` y sin la salida del
  `declare module`.
- **Hallazgo 7:** tal cual: rótulos de unos 203 caracteres, P4 ≤ 2 MB y
  `RangeError` para una fila más alta que la página, probado en el criterio 8.
- **Hallazgo 4:** los recorridos de R7a y R7b pasan a 28 y 29; R7a parte de
  `main` con R9 mergeado; los casos de R9 en los criterios 7, 9 y 10.
- **Hallazgo 3:** la firma `PdfPageText { text, rows }` propuesta.

### Respuesta del architect

Aplicada el 2026-10-12. Cada cifra se verificó contra
`nucleo-reportes-r7-medicion.md` (`7644438`); las secciones son del contrato
corregido.

1. D-R7-5 con la ruta literal en `join`, «Sin `outputFileTracingIncludes`» y el
   riesgo de una ruta armada de otra forma; §1 sin `next.config.ts` en el
   alcance ni en las consecuencias; §4.6, «La ruta de la fuente va literal en
   la llamada a `join`»; §4.7 sin el bloque de `next.config.ts` («no
   cambia»); §7 sin `next.config.ts` en el reparto ni en el paso 4, y con él
   en «Lo que no toca nadie»; criterio 12 con el `nft.json` que lista la
   fuente y el mutante de la ruta armada con una variable (§8.1); §6.2, que
   el trazado liste la fuente; §8.2 y §8.3 con la ruta fuera del literal; §9,
   «el PDF da 500 en Vercel; la ruta va literal»; §10, punto 2, «entra sola
   al trazado»; los supuestos de §0 sin `outputFileTracingIncludes`.
2. `7644438` en el encabezado, §0, §6.1 y el «Orden»; lo único sin verificar,
   los límites de Vercel (y el paso a 0.20.2, por el hallazgo 5); D-R7-4,
   5,00 contra 11,36 MB; D-R7-5 sin «Suma 0,44 MB»; D-R7-6, 88 páginas y
   249 KB; D-R7-7, 627 KB en 273 páginas y 0,66 s; D-R7-10 sin «la 5.7.284» y
   con M9 como se midió; D-R7-11 con el texto propuesto; los supuestos de §0
   con 780 filas y «Midió también M8 y M9»; §6.1 con M8, M3, M2, M1, M6 y M9
   nuevos y sin «Quedaron sin medir»; §4.10, 5,00 MB; el paso 1 con M9 como
   comprobación del lector; §9 con M8 en 0,85 s y «Ochenta y ocho páginas;
   273 con rótulos de 100 caracteres»; §10, punto 1, con 35,6 s y 1990 MB,
   46,0 s y 1410 MB, y 0,28 s y entre 122 y 138 MB.
3. §4.8 con `PdfPageText { text, rows }` y `pdfPageTexts` que devuelve
   `readonly PdfPageText[]`; D-R7-10 con la lectura por fila de M9, los
   rótulos de los tests que no se parten y la comparación sin blancos; criterio
   8 con la fila larga como elemento de `rows` de la página k+1 y ninguna fila
   de la página k con su prefijo, y la cabecera, los encabezados y el pie en
   `text`; criterio 9 y recorrido 28 con `text` y `rows`; `readPdf` con la
   misma forma y `await import(…)` adentro, probado primero bajo Playwright
   (D-R7-10 y §7, e2e).
4. §0 con «`main` con R9 mergeado», las citas de `31a83b3` que se corren con R9
   y las llamadas que dé `git grep`; §1 y el paso 1 con «todas las llamadas»;
   criterio 7 con la fila sin horas como primera fila de datos (y el mutante
   de las celdas vacías fuera del reparto); criterio 9 con el admin con
   `sin-horas=1` y el member con `sin-horas=1&personas=<otra>`, y sus
   mutantes; criterio 10 con `sin-horas=1` en el `href` de «PDF» y su
   mutante; §8.2, «Los veintisiete de R2a a R9 no cambian», con 28 y 29 en
   todo el contrato (§1, §7, criterios 14 y 19); «Decisiones que el contrato
   da por tomadas» y §10 con D-R9-10 y el orden de R9.
5. D-R7-4 con `"pdfkit": "0.20.2"` exacta, el porqué (el CHANGELOG, citado
   por la revisión, y `initFonts`) y la comprobación del paso 1; la salida
   externa, «no verificada para Vercel» en D-R7-4, §6.4 y §9; §1 y el paso 1
   con la versión; §0 avisa que las líneas citadas de `pdfkit.js` son de la
   0.20.1. **Ajuste:** en el paso 1 la ruta del PDF todavía no existe (la
   crea el paso 4), así que la comprobación de `next build`, `next start` y el
   `nft.json` va en una copia descartable con una ruta mínima, como pide la
   regla de la corrida de §7; §6.2 la repite con el código terminado.
6. Las cinco versiones exactas en D-R7-4, §1, el paso 1 y §10 (punto 4, nuevo);
   las licencias en D-R7-4; sin `declare module` (D-R7-4 y §7); `pdf.ts`
   distingue `Font` de `FontCollection` sin aserción (D-R7-4 y §4.6);
   `pdfjs-dist` fuera de la auditoría de CI e `isEvalSupported: false` en
   D-R7-10 y §9.
7. D-R7-6 con «unos 203 caracteres; unos nueve renglones en la columna más
   angosta», con `NAME_MAX` y `document.ts:64` y `:100` (verificados en el
   árbol); §4.6, el `RangeError` de la fila más alta que el alto útil; §6.2,
   P4 ≤ 2 MB y el documento armado a mano con esos largos; D-R7-7 y §9 lo
   nombran; criterio 8 con un rótulo de 20 000 caracteres y su mutante.
8. El ADR 0022 suma al final «Corrección (2026-10-12)» con las cifras de
   `7644438`, la fuente que entra sola al trazado, `pdfkit` 0.20.2 y «La
   decisión no cambia»; el resto del ADR queda igual. §12 del contrato lo
   nombra.
9. El estado de la revisión nombra esta tercera pasada y que falta la
   verificación de las líneas tocadas; §10, punto 5, sigue pidiendo
   `prettier --write` antes del commit.

### Verificación de las líneas tocadas

`architecture-reviewer`, sobre `e858e44`, el 2026-10-12: **aprobado con
menores**. Confirmó en el paquete la entrada «[v0.20.2] - 2026-08-29» del
`CHANGELOG.md` de `pdfkit`. Los cuatro menores los aplicó el team-lead:

1. D-R7-4 cita el CHANGELOG literal, con su fuente, en lugar de atribuirlo a la
   revisión.
2. Las dependencias transitivas de `pdfkit` y `fontkit` son 14, con `fflate`,
   todas MIT.
3. El mutante del criterio 7 (las celdas vacías dentro del reparto) cae con el
   resumen de tres niveles; la fila sin horas de R9 queda como caso de
   regresión.
4. El estado de la revisión al principio del contrato dice que las líneas
   tocadas están verificadas.
