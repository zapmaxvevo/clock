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
