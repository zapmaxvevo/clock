# R7a: implementación y revisiones (2026-10-12)

Rama `nucleo/r7a-pdf` desde `main` en `b255b99` (merge de R9). Contrato:
[`nucleo-reportes-r7-exportar-pdf.md`](nucleo-reportes-r7-exportar-pdf.md). ADR:
[0022](../adr/0022-el-pdf-del-reporte-se-dibuja-con-pdfkit.md).

## Implementación

- **Paso 1:** `backend-dev`, en `118bd0e` y `93a2824`.
  - **Dependencias:** `pdfkit` 0.20.2 y `fontkit` 2.0.4; sale `@react-pdf/renderer`. En desarrollo: `@types/pdfkit` 0.17.6, `@types/fontkit` 2.0.9 y `pdfjs-dist` 6.4.299. Todas con `--save-exact`.
  - **Comprobación de 0.20.2 en una copia con una ruta mínima:**
    - `next build` y `next start` dan 200, `application/pdf` y `no-store`.
    - `pdffonts` muestra Noto incrustada.
    - El `nft.json` lista la fuente.
    - Las 14 métricas estándar quedan dentro de un fragmento de `.next`.
    - La salida `standalone`, sin `pdfkit` en `node_modules`, también sirve el PDF.
  - **El lector `src/test/pdf.ts`:** funciona bajo Vitest.
- **Paso 2:** `frontend-dev`, en `f30a727`. `pdf-layout.ts`, `pageLabel` y el criterio 10. Caen los 25 mutantes de los criterios 5, 6, 7 y 10.
- **Paso 3:** `backend-dev`, en `88343f2`. La exportación sin entradas no las lee, y toda exportación fija `statement_timeout`. Caen los 5 mutantes.
- **Paso 4:** `backend-dev`, en `c5ed3f4`. La fuente, `pdf.ts`, la ruta, el handler y la regla de ESLint, con los criterios 8, 9 y 11.
  - SHA-256 de `NotoSans-Regular.ttf`: `f3961a9c…48b0e8`, igual al de D-R7-5.
  - Criterio 11: los 50 casos dan lo esperado y caen los 6 mutantes de configuración.
- **Paso 5:** la medición de §6.2, en una copia con `next build` y `seed.sql` (187 685 entradas). Todo entra en el presupuesto:

  | Pedido                                             | Filas | Tiempo  | Peso    | Páginas | Presupuesto    |
  | -------------------------------------------------- | ----- | ------- | ------- | ------- | -------------- |
  | P1, septiembre, Persona → Proyecto → Fecha         | 780   | 0,15 s  | 49,5 KB | 20      | ≤ 1,5 s        |
  | P2, 140 días por Persona → Fecha                   | 3000  | 0,31 s  | 165 KB  | 74      | ≤ 2 s y ≤ 1 MB |
  | P2 en frío (mediana de cinco)                      | 3000  | 0,755 s | —       | —       | ≤ 3 s          |
  | P3, 366 días por Descripción, primer nivel cortado | —     | 0,18 s  | 6,5 KB  | 1       | ≤ 1 s          |
  | P4, Tarea → Descripción                            | 2996  | 0,27 s  | 165 KB  | 77      | ≤ 2 s y ≤ 2 MB |
  | P4 armado a mano, rótulos de 203 caracteres        | —     | 0,84 s  | 999 KB  | 500     | ≤ 2 s y ≤ 2 MB |

  `heapUsed` llega a 320 MB como máximo, contra un presupuesto de 512 MB. El P4 armado a mano termina igual con `--max-old-space-size=256`.

Desvíos aceptados por el team-lead:

- **`"pdf"` entra al esquema en el paso 1, con una entrada provisoria que rechaza** (salida A). Si no, el árbol no compila: `satisfies Record<ReportExportFormat, …>` en el handler y en los rótulos. Por eso el e2e 25 falló en la rama hasta el paso 7.
- **`isEvalSupported` no existe en `pdfjs-dist` 6.4.299**, ni en los tipos ni en el código, así que el lector va sin esa opción. Corrige D-R7-10 y §4.8.
- **Las llamadas a `getReportExport` son seis, no cinco**: `scope.integration.test.ts` tiene dos.
- **`pdfLayoutOf` lanza `RangeError` en dos casos más**: una tabla sin filas de datos y una cabecera que no empieza con el título solo. Los dos son invariantes de D-R6-8 y D-R7-2.
- **El trazado de CSV y Excel es igual al del PDF**: 251 archivos, 6,19 MB, con la fuente y el fragmento de `pdfkit`.
  - **Por qué:** las tres rutas comparten el handler, y su `import()` es un fragmento de todas. Con `exceljs` ya pasaba desde R6.
  - **En ejecución:** el CSV no carga el fragmento del PDF; se verificó registrando las cargas en un `next start` nuevo.
  - **Qué corrige:** la línea de D-R7-4 «El trazado del CSV no lista nada del PDF», que venía del prototipo de R7-0 con la ruta suelta. Sigue muy por debajo de 50 MB.
- **El título de sección «Resumen» va en 11 pt**: el contrato fija 9 y 14, y no dice nada del título de sección.
- **Los valores de la cabecera** van en una sola celda, separados por tres espacios.
- **El e2e roto por «PDF» es el 25, no el 23**: el recorrido de Excel, en `reports.spec.ts:2331`. Ahora afirma CSV y Excel por posición, y la lista completa `["CSV", "Excel", "PDF"]` queda en el 28.
- **El mutante `entries: true` del 28 cae por otro motivo**: `pdfLayoutOf` rechaza la tabla «Entradas» y la ruta responde 500, así que no hay descarga. No es que el archivo traiga `Revisión`. §8.2 quedó corregido.

## Ronda 2

- **Paso 6:** `test-engineer`, en `f0b3bb1`, con el criterio 4.
- **Paso 7:** `e2e-tester`, en `0bc50fd`.
  - **`readPdf` bajo Playwright:** anda. Lee «Łukasz» y tarda 318 ms, contando la carga de pdfjs.
  - **Recorrido 28:** compara todas las `rows` contra las 5 filas del resumen del CSV.
  - **Mutantes de §8.2:** caen los cinco.
  - **Suite e2e completa:** 213 pasan (212 tests y el setup).
- **Mutantes de `test-engineer`** (criterios 3, 4, 8 y 9): caen los 26.
  - 3.6, 4.2, 4.3 y 8.8b los sumó `test-engineer`; no figuran en §8.1.
  - El criterio 4 también cubre owner y admin con personas, el aislamiento de B y las membresías no activas. Sin eso no caía el 4.2.

## Revisiones

- **Backend:** aprobado, sin hallazgos. Probó 20 `pdfBytesOf` en paralelo, una cabecera de 40 000 caracteres y 80 filas de cabecera.
- **Seguridad:** aprobado, sin hallazgos.
  - **Texto hostil:** probó con sintaxis PDF y controles. No aparece nada activo (sin /URI, /JavaScript, /OpenAction, /Annots ni imágenes). El texto va como glifos en hex.
  - **Metadatos:** no dicen nada de quién lo generó.
  - **Regla de ESLint:** 12 importaciones prohibidas, todas con error.
  - **Dependencias:** `npm ls` sin `@react-pdf/*`.
  - **Fuera del slice:** `npm audit` sin `--omit=dev` da 9 altas de desarrollo (`braces`, `micromatch`, `fast-glob`), las mismas que en `main`. CI audita con `--omit=dev`. Cambiar la regla es decisión del usuario.
- **Frontend:** aprobado, sin hallazgos. Miró siete PDF reales con `pdftoppm`. Fuera del contrato: el PDF no lleva etiquetas de estructura.
- **Clean code:** no aprobado, con un mayor.
  1. **Mayor:** `readPdf` copiaba `src/test/pdf.ts`, con un comentario falso: ESLint deja a `e2e/` importar `@/test/*`.
  2. **Menores:**
     - casts y aserciones redundantes en `pdf.test.ts`;
     - una tercera copia de la carga de pdfjs;
     - `cellText` interno de `pdf.ts`;
     - `PdfCell` exportado sin uso;
     - la copia a mano de los bytes.
- **Tests:** aprobado con menores.
  - El mismo lector duplicado.
  - El documento chico no afirmaba toda la cabecera: el mutante `layout.header.slice(0, -1)` sobrevivía.
- **Paridad:** aprobado con menores. El texto decía «uno por emoji», pero el reemplazo es por punto de código: un emoji compuesto deja varios «�». Lo corrigió el team-lead en `reportes.md`, en tres lugares.
  - **Criterio 13:** lo miraron en imagen paridad y frontend, y se lee bien. El usuario puede abrirlo con su visor si quiere (§10).

## Correcciones

- **`backend-dev`, en `5a65a77`:**
  - **`src/test/pdf.ts`:** suma `pdfFacts`, con un solo `getDocument` y `destroy`.
  - **`pdf.test.ts`:** sin casts y con la cabecera completa. Los mutantes `slice(0, -1)` y `slice(1)` caen.
  - **`pdf.ts`:** `drawCellText` y `Buffer.concat`.
  - **`pdf-layout.ts`:** `PdfCell` deja de exportarse.
