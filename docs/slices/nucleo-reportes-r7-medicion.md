# R7-0: medición del PDF (2026-10-12)

Paso 0 de R7: la medición de §6.1 del
[contrato](nucleo-reportes-r7-exportar-pdf.md) (`55e938e`, rama `nucleo/r7-contrato`), antes de
escribir código. La hizo `backend-dev` en el worktree `/home/maxi/program/clock-r7-medicion`,
desde `55e938e`, con `node_modules` copiado con `cp -al` y una base propia con `seed.sql`. El
código de los prototipos fue descartable y se borró con el worktree. No se commiteó nada salvo
este informe.

## Resultado

| Presupuesto (§6.1)                          | P-RP, `@react-pdf/renderer`                          | P-KIT, `pdfkit` directo                  |
| ------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| M3, 3000 filas: escritura ≤ 3 s             | **29,6 s** (Helvetica), **34,2 s** (Noto): no cumple | 0,26 s (Helvetica), 0,25 s (Noto)        |
| M3, 3000 filas: pico de `heapUsed` ≤ 512 MB | **1614 MB** y **1469 MB**: no cumple                 | 116 MB y 135 MB                          |
| M2, primer PDF ≤ 3 s más que el primer CSV  | +2,37 s y +2,77 s, con 781 filas                     | +0,11 s a +0,17 s                        |
| M1, trazado de la ruta del PDF ≤ 50 MB      | 13,6 MB                                              | 11,4 MB (externo) o 5,4 MB (empaquetado) |
| M6, peor peso ≤ 2 MB                        | 501 KB, en 71,8 s                                    | 309 KB y 339 KB                          |

**Recomendación (pregunta 1 de §10): P-KIT, `pdfkit` directo.** P-RP no cumple M3: con 3000
filas tarda unas diez veces el presupuesto y triplica el pico de memoria. Su costo crece más que
lineal con las filas (500 filas, 1,2 s; 1500, 7,6 s; 3000, 29,6 s), y una tabla de 3000 filas no
entra en una función de 10 s. P-KIT cumple los cinco presupuestos con mucho margen. Es la salida
de §6.4 y la opción (2) del ADR propuesto en §12.

**Recomendación (pregunta 2 de §10): Noto Sans Regular, la variante sin hinting.** Pesa 431 KB,
tiene U+FFFD, cubre Latin-1 y Latin Extended-A y B enteros y el cirílico entero, y casi todo el
griego. Su licencia es la SIL Open Font License 1.1. Es la más liviana de las candidatas que
cumplen la regla de §6.1. Geist no tiene U+FFFD. DejaVu Sans cubre más, pero pesa 757 KB.

## La máquina y las versiones

- AMD Ryzen 7 8845HS (16 hilos), 30 GB, Linux 6.8.0-137, Node 25.8.1.
- Postgres 18 (`postgres:18-alpine`), con `seed.sql`: 187 685 entradas y 30 personas.
- Next.js 16.3.8 con Turbopack, `@react-pdf/renderer` 4.9.0, `pdfkit` 0.20.1 (el que instala
  `@react-pdf/renderer`), `fontkit` 2.0.4 y `yoga-layout` 3.2.1. No se instaló nada.

## Los prototipos

- **El diseño**, común a los dos: una versión reducida de `pdfLayoutOf` de §4.5. El título y la
  cabecera salen del documento. El resumen es una tabla con «Nivel» de 0,08 del ancho, «Duración»
  de 0,12, «Horas» de 0,10 y el resto repartido. Los antepasados van en gris y el nivel 1 sobre
  fondo. `pdfTextOf` reemplaza lo que la fuente no cubre y los controles. A4, márgenes de 36 pt,
  cuerpo de 9 pt y título de 14 pt.
- **P-RP**: como §4.6. Un `<Page>` con la cabecera, la fila de encabezados `fixed`, cada fila con
  `wrap={false}` y el pie `fixed` con `render`. Con Noto: `Font.register`,
  `registerHyphenationCallback((word) => [word])` y `Font.load`. Se escribe con `renderToBuffer`.
- **P-KIT**: `PDFDocument` con `bufferPages`. La tabla se dibuja a mano, con la altura de cada
  fila medida con `heightOfString`. Una fila que no entra pasa entera a la página siguiente, con
  los encabezados repetidos. Al final, «Página n de N» en cada página.
- **La ruta**: `reportes/exportar/pdf`. Lee con `getReportExport`, arma el documento con
  `exportDocumentOf` y `entries: { kind: "tooMany" }`, y escribe solo la cabecera y el resumen.
- **Los documentos de M3 y M6** son sintéticos, con la forma de `exportDocumentOf`. Con el
  volumen sintético, E3 de R6 (366 días, Persona → Proyecto → Fecha) corta en dos niveles
  (`levelsShown: 2`), así que no da un árbol de tres niveles de 3000 filas.
  - M3: Persona → Proyecto → Fecha en profundidad, con 8 proyectos por persona y 30 fechas por
    proyecto, cortado en 50, 500 y 3000 filas, y la cabecera completa con la nota del tope.
  - M6: Persona → Descripción, con descripciones de 100 caracteres y «…».
  - M2 usa datos reales: el mes pasado, Persona → Proyecto → Fecha, que da 781 filas.

## M1, el peso de la función

La suma de lo que lista `route.js.nft.json` después de `next build`:

| Variante                                                                 | Ruta del PDF                   | De eso, paquetes del PDF | Ruta del CSV |
| ------------------------------------------------------------------------ | ------------------------------ | ------------------------ | ------------ |
| P-RP, Helvetica o Noto                                                   | 411 archivos, 13,59 MB         | 110 archivos, 7,52 MB    | 4,79 MB      |
| P-KIT con `serverExternalPackages`                                       | 322 archivos, 11,35 MB         | 70 archivos, 6,24 MB     | 4,79 MB      |
| P-KIT externo, con Noto en `outputFileTracingIncludes`                   | 323 archivos, 11,79 MB (+0,44) | 70 archivos, 6,24 MB     | 4,79 MB      |
| P-KIT empaquetado por Turbopack, con Noto en `outputFileTracingIncludes` | 193 archivos, 5,43 MB          | dentro de los chunks     | 4,79 MB      |

- **La fuente no entra sola en el trazado.** Se lee con
  `path.join(process.cwd(), "src/…/NotoSans-Regular.ttf")`, y Turbopack no la sigue: en Vercel
  la función no la encontraría. Hay que nombrarla en `outputFileTracingIncludes` de
  `next.config.ts` para la ruta `/reportes/exportar/pdf`. Así entra y suma 0,44 MB.
- Los `.afm` de las fuentes estándar de `pdfkit` entran en el trazado cuando la biblioteca es
  externa, con P-RP y con P-KIT externo. Empaquetado, Turbopack los resuelve en el build.
- **P-KIT funciona empaquetado por Turbopack, sin `serverExternalPackages`.** Con `next start`
  escribe con Helvetica y con Noto incrustada; `pdffonts` muestra el subconjunto
  `NotoSans-Regular` embebido. Su trazado, ya con la fuente, es la mitad que con los paquetes
  externos. Con `pdfkit` y `fontkit` externos también funciona. R7a puede elegir: lo
  empaquetado es lo que menos pesa, y el contrato preveía `serverExternalPackages: ["pdfkit"]`
  por las dudas.
- El trazado del CSV no lista ningún paquete del PDF en ninguna variante.

## M2, el tiempo en frío

Cada variante con su `next build` y `next start` (puerto 3318), una sesión de prueba y el pedido
del mes pasado, Persona → Proyecto → Fecha, que da 781 filas.

| Variante         | Primer PDF | Segundo PDF | Primer CSV, servidor nuevo | Diferencia contra el CSV |
| ---------------- | ---------- | ----------- | -------------------------- | ------------------------ |
| P-RP, Helvetica  | 3,01 s     | 2,59 s      | 0,64 s                     | +2,37 s                  |
| P-RP, Noto       | 3,42 s     | 3,00 s      | 0,65 s                     | +2,77 s                  |
| P-KIT, Helvetica | 0,75 s     | 0,58 s      | 0,64 s                     | +0,11 s                  |
| P-KIT, Noto      | 0,82 s     | 0,63 s      | 0,66 s                     | +0,16 s                  |

- El CSV pedido después del PDF tarda lo mismo que en un servidor nuevo (0,54 a 0,57 s), y su
  trazado no tiene la biblioteca del PDF.
- **En un proceso nuevo**, mediana de cinco:
  - `await import("@react-pdf/renderer")`: 109 ms; el primer `Font.load` con un archivo local,
    2 ms.
  - `await import("pdfkit")`: 58 ms; `registerFont` y `font`, 5 ms.
- P-RP cumple M2 con 781 filas, pero ya tarda 2,6 s en caliente: con más filas pasa el
  presupuesto, como muestra M3.

## M3, el costo de las filas

Solo la escritura, sin la lectura. Un proceso nuevo por medida, una corrida de calentamiento y
la mediana de cinco.

| Variante         | Filas | Escritura | Pico de `heapUsed` | RSS máximo | Páginas | Bytes   |
| ---------------- | ----- | --------- | ------------------ | ---------- | ------- | ------- |
| P-RP, Helvetica  | 50    | 75 ms     | 74 MB              | 397 MB     | 2       | 8 478   |
| P-RP, Helvetica  | 500   | 1 165 ms  | 218 MB             | 449 MB     | 11      | 56 859  |
| P-RP, Helvetica  | 3000  | 29 577 ms | 1 614 MB           | 2 492 MB   | 60      | 324 192 |
| P-RP, Noto       | 50    | 95 ms     | 87 MB              | 380 MB     | 2       | 13 875  |
| P-RP, Noto       | 500   | 1 447 ms  | 286 MB             | 452 MB     | 12      | 64 688  |
| P-RP, Noto       | 3000  | 34 245 ms | 1 469 MB           | 2 322 MB   | 70      | 349 704 |
| P-KIT, Helvetica | 50    | 9 ms      | 37 MB              | 389 MB     | 2       | 5 607   |
| P-KIT, Helvetica | 500   | 55 ms     | 45 MB              | 390 MB     | 10      | 34 256  |
| P-KIT, Helvetica | 3000  | 259 ms    | 116 MB             | 393 MB     | 60      | 198 197 |
| P-KIT, Noto      | 50    | 35 ms     | 71 MB              | 394 MB     | 2       | 10 978  |
| P-KIT, Noto      | 500   | 82 ms     | 71 MB              | 387 MB     | 12      | 42 485  |
| P-KIT, Noto      | 3000  | 254 ms    | 135 MB             | 393 MB     | 67      | 216 900 |

- El RSS de base del proceso de medición es de unos 390 MB: incluye `tsx` y su compilador. El
  pico de `heapUsed` se muestrea cada 1 ms y no corre mientras la biblioteca trabaja sin ceder,
  así que puede quedar debajo del real; el RSS máximo (`process.resourceUsage().maxRSS`) lo
  acota.
- **Dos variantes de P-RP, para descartar que el problema fuera el armado:**
  - Las filas como hijas directas de `<Page>`, sin el `<View>` que las envuelve: igual de lento
    (500 filas, 1,1 s; 1500, 7,6 s).
  - La paginación a mano, un `<Page>` por cada 45 filas: 2,7 s con 3000 filas, pero 686 MB de
    pico. Sigue sin cumplir, y deja de partir bien una fila más alta que las demás.

## M4, las fuentes

| Fuente                       | Archivo                                           | Peso      | U+FFFD | Latin-1 | Latin Ext-A | Latin Ext-B | Griego  | Cirílico | Licencia                         |
| ---------------------------- | ------------------------------------------------- | --------- | ------ | ------- | ----------- | ----------- | ------- | -------- | -------------------------------- |
| F-H, Helvetica (WinAnsi)     | ninguno                                           | 0         | no     | 96/96   | 7/128       | 1/208       | 0/135   | 0/256    | estándar del PDF                 |
| F-G, Geist Regular 1.800     | `next/dist/compiled/@vercel/og/Geist-Regular.ttf` | 125 956 B | **no** | 95/96   | 117/128     | 19/208      | 6/135   | 134/256  | SIL OFL 1.1                      |
| F-D, DejaVu Sans 2.37        | release `version_2_37` de `dejavu-fonts`          | 757 076 B | sí     | 96/96   | 128/128     | 208/208     | 135/135 | 256/256  | Bitstream Vera y dominio público |
| F-D, Noto Sans Regular 2.015 | `notofonts.github.io`, `hinted/ttf`               | 621 572 B | sí     | 96/96   | 128/128     | 208/208     | 121/135 | 256/256  | SIL OFL 1.1                      |
| F-D, Noto Sans Regular 2.015 | `notofonts.github.io`, `unhinted/ttf`             | 431 364 B | sí     | 96/96   | 128/128     | 208/208     | 121/135 | 256/256  | SIL OFL 1.1                      |

- Las coberturas cuentan los puntos de código asignados de cada bloque.
- SHA-256 de cada archivo:
  - Geist: `bde046ddd9f20be35b0bd56cc79eb752b967fb6661a3fe76cb067bb09f871d76`
  - DejaVu Sans: `7da195a74c55bef988d0d48f9508bd5d849425c1770dba5d7bfc6ce9ed848954`
  - Noto con hinting: `478c558ea716033cd60c03438f628dfa75694dcf6b5f6d505a2f05fd2b4f3823`
  - Noto sin hinting: `f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8`
- Fuentes de las descargas:
  - DejaVu: `github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2`
  - Noto: `github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/{hinted,unhinted}/ttf/NotoSans-Regular.ttf`
  - El texto de la OFL de Noto: `github.com/notofonts/latin-greek-cyrillic/blob/main/OFL.txt`
- **La licencia de Geist queda confirmada:** la tabla `name` del archivo dice «SIL Open Font
  License, Version 1.1». Igual no sirve, porque no tiene U+FFFD.
- **Lo que suma la fuente al PDF de 3000 filas**, con el subconjunto de glifos usados:
  - P-RP: +25,5 KB (324 192 B a 349 704 B).
  - P-KIT: +18,7 KB (198 197 B a 216 900 B).
  - Noto es más ancha que Helvetica y la misma tabla ocupa más páginas: 67 contra 60 en P-KIT,
    70 contra 60 en P-RP.

## M5, el texto

Un PDF con cada texto en la columna «Persona» y una palabra de 100 «x» en «Proyecto». Lo abrí con
poppler: `pdftotext` para lo que se copia y `pdftoppm` para lo que se ve. No usé LibreOffice ni un
navegador.

| Texto                  | Helvetica (P-RP y P-KIT)                         | Noto (P-RP y P-KIT)                  |
| ---------------------- | ------------------------------------------------ | ------------------------------------ |
| «Łukasz Żółć»          | «?ukasz ?ó??»                                    | se ve y se copia bien                |
| «Ελένη», «Дмитрий»     | «?????», «???????»                               | se ve y se copia bien                |
| «😀»                   | «?»                                              | U+FFFD (Noto no tiene emojis)        |
| «→»                    | «?»                                              | U+FFFD: Noto Sans Regular no lo trae |
| «“comillas”», «…», «–» | bien (están en WinAnsi)                          | bien                                 |
| U+00A0                 | se ve como espacio y se copia como espacio común | igual                                |
| U+FFFF, `\t`, `\n`     | «?» cada uno                                     | U+FFFD cada uno                      |

- **La palabra de 100 caracteres:**
  - **P-KIT la parte** en tres renglones dentro de su columna y la fila crece.
  - **P-RP no la parte**: con `registerHyphenationCallback((word) => [word])`, como pide §4.6, la
    palabra pasa por encima de «Duración» y «Horas» y sale de la página.
  - Con P-RP, la nota larga de la cabecera también se salía del margen hasta que su `<Text>`
    llevó `flexShrink: 1`. Si R7a usara P-RP, el callback tendría que partir las palabras largas.

## M6, el peor peso

Persona → Descripción, 3000 filas con descripciones de 100 caracteres y «…».

| Variante         | Escritura | Pico de `heapUsed` | Páginas | Bytes   |
| ---------------- | --------- | ------------------ | ------- | ------- |
| P-KIT, Helvetica | 362 ms    | 124 MB             | 149     | 309 031 |
| P-KIT, Noto      | 341 ms    | 139 MB             | 167     | 339 028 |
| P-RP, Noto       | 71 827 ms | 1 270 MB           | 176     | 500 890 |

Todas quedan debajo de 2 MB. P-RP con Helvetica no se midió: con Noto ya pasa por mucho el tiempo
y la memoria.

## M7, la cadena de dependencias

`npm audit --omit=dev` sobre el `package-lock.json` de `55e938e` da 6 moderadas y ninguna alta:

- `uuid` y `exceljs` (GHSA-w5hq-g745-h8pq), la ya aceptada en R6b.
- `esbuild`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader` y `drizzle-kit`
  (GHSA-67mh-4wv8-2f99), porque `drizzle-kit` está en `dependencies`.

**Ninguna alerta toca la cadena del PDF**:

- `@react-pdf/renderer` 4.9.0 y sus `@react-pdf/*`;
- `pdfkit` 0.20.1, `fontkit` 2.0.4, `yoga-layout` 3.2.1, `restructure`, `unicode-properties`,
  `linebreak`, `brotli`, `png-js`, `jay-peg`, `dfa`, `tiny-inflate`, `hyphen`, `bidi-js` y
  `emoji-regex-xs`.

Con P-KIT, la cadena en uso se reduce a `pdfkit`, `fontkit` y sus dependencias. `@react-pdf/*` y
`yoga-layout` quedan instalados mientras `@react-pdf/renderer` siga en `dependencies`.

## Lo que no se midió

- **Los límites de Vercel Hobby**: el tamaño de la función, la duración y la memoria. No se pueden
  medir en local (§6.3).
- **F-G (Geist) en M1, M3 y M6**: la regla de §6.1 la descarta por no tener U+FFFD. DejaVu Sans
  quedó solo en M4: Noto cumple lo mismo con menos peso.
- **M5 en LibreOffice, Firefox o Chrome**: lo miré con poppler (`pdftotext`, `pdftoppm`).
- **M3 sobre un árbol real de tres niveles de 3000 filas**: con el volumen sintético el árbol corta
  en dos niveles. M3 y M6 usan documentos sintéticos con la forma de `exportDocumentOf`.
- **`pdfjs-dist`** (pregunta 4): no hizo falta para medir.

## Para R7a, si se elige P-KIT

- **El ADR 0022 propuesto cambia de opción**: (2) en lugar de (1). `pdf.tsx` pasa a ser `pdf.ts`,
  sin React, y dibuja la tabla con la paginación descrita arriba.
- **Lo que falta**:
  - `pdfkit` en `dependencies`, con la versión instalada (0.20.1), y sus tipos (`@types/pdfkit`) en
    `devDependencies`;
  - la fuente en el repositorio con su licencia;
  - `outputFileTracingIncludes` para la ruta del PDF.
  - `serverExternalPackages` no hace falta.
- **La regla de ESLint de §4.8** cambia de `@react-pdf/renderer` a `pdfkit`.
- **`@react-pdf/renderer`** queda sin uso. Sacarlo de `dependencies` es una decisión aparte.
