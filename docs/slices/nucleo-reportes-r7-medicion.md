# R7-0: medición del PDF (2026-10-12)

Paso 0 de R7: la medición de §6.1 del [contrato](nucleo-reportes-r7-exportar-pdf.md), en su
versión corregida (`f73b455`), con M8 y M9. La hizo `backend-dev` en el worktree
`/home/maxi/program/clock-r7-medicion`, desde `f73b455`, con `node_modules` copiado con `cp -al`
y una base propia con `seed.sql`. El código de los prototipos fue descartable y se borró con el
worktree. No se commiteó nada salvo este informe.

La primera versión de este informe (`b26c589`) se midió desde `55e938e`. Esta la reemplaza
entera:

- M3 y M6 se midieron otra vez con los documentos armados a mano que pide §6.1.
- M8 y M9 son nuevas.
- M1 lleva el desglose de la biblioteca.
- **Una corrección:** la primera versión decía que la fuente no entraba sola en el trazado.
  Estaba mal. El script la buscaba en una lista cortada a ocho nombres, y la fuente sí está
  (§ M1).

## Resultado

| Presupuesto (§6.1)                                  | P-RP, `@react-pdf/renderer`               | P-KIT, `pdfkit` directo               |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------- |
| **M8**, el peor pedido en frío ≤ 5 s                | **35,1 s** (Helvetica), **43,7 s** (Noto) | 0,83 s y 0,85 s                       |
| M3, 3000 filas: escritura ≤ 3 s                     | **35,6 s** y **46,0 s**                   | 0,28 s y 0,28 s                       |
| M3, 3000 filas: pico de `heapUsed` ≤ 512 MB         | **1990 MB** y **1410 MB**                 | 138 MB y 122 MB                       |
| M2, primer PDF ≤ 3 s más que el primer CSV          | +2,30 s y +2,77 s, con 780 filas reales   | +0,08 s y +0,17 s                     |
| M1, trazado ≤ 50 MB (Vercel: 250 MB, no verificado) | 13,59 MB                                  | 5,00 MB empaquetado, 11,36 MB externo |
| M6, peor peso ≤ 2 MB                                | 777 KB (Noto), en 128 s                   | 483 KB y 627 KB                       |

**Recomendación (pregunta 1 de §10): P-KIT, `pdfkit` directo.**

- P-RP no cumple M8, que es condición del ADR, ni M3. Con 3000 filas tarda entre siete y nueve
  veces los 5 s y pasa el doble o el triple de la memoria.
- Su costo crece más que lineal con las filas: 50 filas, 88 ms; 500, 1,4 s; 3000, 35,6 s.
- Además pierde texto: corta una palabra que no entra en su columna (§ M5 y M9).
- P-KIT cumple todos los presupuestos con mucho margen. Es la salida de §6.4 y la opción (2) del
  ADR 0022.

**Recomendación (pregunta 2 de §10): Noto Sans Regular, la variante sin hinting.**

- Pesa 431 KB y su licencia es la SIL Open Font License 1.1.
- Tiene U+FFFD. Cubre enteros Latin-1, Latin Extended-A y B y el cirílico, y 121 de los 135
  caracteres del griego.
- Es la más liviana de las candidatas que cumplen la regla de §6.1. Geist no tiene U+FFFD, y
  DejaVu Sans cubre más pero pesa 757 KB.

## La máquina y las versiones

- AMD Ryzen 7 8845HS (16 hilos), 30 GB, Linux 6.8.0-137, Node 25.8.1.
- Postgres 18 (`postgres:18-alpine`), con `seed.sql`: 187 685 entradas y 30 personas.
- Next.js 16.3.8 con Turbopack, `@react-pdf/renderer` 4.9.0, `pdfkit` 0.20.1 (el que instala
  `@react-pdf/renderer`), `fontkit` 2.0.4 y `yoga-layout` 3.2.1.
- `pdfjs-dist` 6.4.299, solo para M9, instalado en un directorio aparte, fuera del árbol y del
  worktree.

## Los prototipos y los documentos

- **El diseño**, común a los dos: una versión reducida de `pdfLayoutOf` de §4.5.
  - El título y la cabecera salen del documento.
  - El resumen es una tabla con «Nivel» de 0,08 del ancho, «Duración» de 0,12, «Horas» de 0,10 y
    el resto repartido.
  - Los antepasados van en gris y el nivel 1 sobre fondo.
  - `pdfTextOf` reemplaza lo que la fuente no cubre y los controles.
  - A4, márgenes de 36 pt, cuerpo de 9 pt y título de 14 pt.
- **P-RP**: como §4.6.
  - Un `<Page>` con la cabecera, la fila de encabezados `fixed`, cada fila con `wrap={false}` y el
    pie `fixed` con `render`.
  - Con Noto: `Font.register`, `registerHyphenationCallback((word) => [word])` y `Font.load`.
  - Escribe con `renderToBuffer`.
- **P-KIT**: `PDFDocument` con `bufferPages`.
  - La tabla se dibuja a mano y la altura de cada fila se mide con `heightOfString`.
  - Una fila que no entra pasa entera a la página siguiente, con los encabezados repetidos.
  - Al final, «Página n de N» en cada página.
- **La ruta**, `reportes/exportar/pdf`:
  - Lee con `getReportExport` y arma el documento real con `exportDocumentOf` y
    `entries: { kind: "tooMany" }`.
  - Escribe la cabecera y el resumen o, para M8, el documento de 3000 filas armado a mano.
- **Los pedidos reales no llegan a 3000 filas**: cada nivel entra entero o no entra.
  - Persona → Proyecto → Fecha, tanto el mes pasado como 366 días (P2 de §6.2), da 780 filas: dos
    niveles.
  - Por eso los documentos grandes se arman a mano (§6.1).
- **Los documentos armados a mano** tienen la forma de `exportDocumentOf`, con la cabecera
  completa y la nota del tope:
  - **M3 y M8:** Persona → Proyecto → Fecha en profundidad, con 8 proyectos por persona y 30
    fechas por proyecto, cortado en 50, 500 y 3000 filas.
    - Uno de cada siete nombres es largo, «María de los Ángeles Fernández Ibáñez n (inactiva)».
    - Uno de cada tres lleva «Łukasz Żółć».
    - Uno de cada cuatro proyectos es largo, «Migración de la plataforma de facturación
      electrónica n (Cliente m)».
    - Uno de cada ocho es «Sin proyecto».
  - **M6:** Persona → Proyecto → Descripción, 3000 filas, con rótulos de exactamente 100
    caracteres en los tres niveles de texto y «…» en las descripciones.
  - **M5:** doce filas con los textos difíciles y una palabra de 100 «x».

## M1, el peso de la función

El trazado está en `.next/server/app/(app)/reportes/exportar/pdf/route.js.nft.json`.

- **El total** es la suma de los archivos que lista, sin repetir.
- **La biblioteca** es lo que lista de `node_modules` de `@react-pdf/*`, `pdfkit`, `fontkit` y
  `yoga-layout` y de sus dependencias, tomadas de sus `package.json` (sin contar `react`).
- **Solo en el PDF** es lo que lista el trazado del PDF y no el del CSV.

| Variante                           | Total                  | Biblioteca                          | Solo en el PDF                                          | Fuente  |
| ---------------------------------- | ---------------------- | ----------------------------------- | ------------------------------------------------------- | ------- |
| P-RP, Helvetica o Noto             | 411 archivos, 13,59 MB | 210 archivos, 8,74 MB (45 paquetes) | 227 archivos, 10,00 MB                                  | listada |
| P-KIT con `serverExternalPackages` | 322 archivos, 11,36 MB | 126 archivos, 7,28 MB (15 paquetes) | 138 archivos, 7,76 MB                                   | listada |
| P-KIT empaquetado por Turbopack    | 192 archivos, 5,00 MB  | en fragmentos de `.next`            | 8 archivos, 1,41 MB (0,98 MB de fragmentos y la fuente) | listada |
| La ruta del CSV, como referencia   | 244 archivos, 4,79 MB  | ninguna                             | —                                                       | no      |

- **Contra el presupuesto:** todas quedan muy debajo de los 50 MB. El límite de Vercel, 250 MB sin
  comprimir, _no está verificado_ en este árbol.
- **Los paquetes de P-KIT externo:** `pdfkit`, `fontkit`, `restructure`, `unicode-properties`,
  `unicode-trie`, `linebreak`, `brotli`, `png-js`, `dfa`, `tiny-inflate`, `clone`, `base64-js`,
  `fast-deep-equal`, `@noble/hashes` y `@noble/ciphers`.
- **P-RP suma** las 13 `@react-pdf/*`, `yoga-layout`, `hyphen`, `bidi-js`, `emoji-regex-xs`,
  `jay-peg`, `media-engine`, `postcss-value-parser`, los paquetes de SVG y de color y otros
  menores.
- **La fuente sí entra en el trazado.** Se lee con
  `path.join(process.cwd(), "src/…/NotoSans-Regular.ttf")`, y Turbopack sigue esa ruta literal.
  - Con `outputFileTracingIncludes` aparece dos veces, sin costo extra. Hace falta solo si R7a
    arma la ruta de otra forma.
  - En las variantes con Helvetica también aparece, porque el prototipo usa el mismo módulo para
    las dos fuentes.
- **Los `.afm` de las fuentes estándar** de `pdfkit` (14) entran cuando la biblioteca es externa.
  Empaquetado, Turbopack los resuelve en el build.
- **P-KIT funciona empaquetado por Turbopack**, sin `serverExternalPackages`.
  - Con `next start` escribe con Helvetica y con Noto, y `pdffonts` muestra el subconjunto
    `NotoSans-Regular` embebido.
  - Con `pdfkit` y `fontkit` externos también funciona.
- El trazado del CSV no lista nada de la biblioteca del PDF en ninguna variante.

## M2, el tiempo en frío

Cada variante con su `next build` y `next start` (puerto 3318), una sesión de prueba y el pedido
real del mes pasado, Persona → Proyecto → Fecha, que da 780 filas.

| Variante         | Primer PDF | Segundo PDF | Primer CSV, servidor nuevo | Diferencia contra el CSV |
| ---------------- | ---------- | ----------- | -------------------------- | ------------------------ |
| P-RP, Helvetica  | 2,93 s     | 2,54 s      | 0,63 s                     | +2,30 s                  |
| P-RP, Noto       | 3,41 s     | 2,99 s      | 0,64 s                     | +2,77 s                  |
| P-KIT, Helvetica | 0,74 s     | 0,58 s      | 0,66 s                     | +0,08 s                  |
| P-KIT, Noto      | 0,81 s     | 0,63 s      | 0,65 s                     | +0,17 s                  |

- El CSV pedido después del PDF tarda lo mismo que en un servidor nuevo, entre 0,54 y 0,55 s.
- **En un proceso nuevo**, mediana de cinco:
  - `await import("@react-pdf/renderer")`: 109 ms; el primer `Font.load` con un archivo local,
    2 ms.
  - `await import("pdfkit")`: 58 ms; `registerFont` y `font`, 5 ms.

## M3, el costo de las filas

Solo la escritura, sin la lectura, con los documentos armados a mano. Un proceso nuevo por
medida, una corrida de calentamiento y la mediana de cinco.

| Variante         | Filas | Escritura | Pico de `heapUsed` | RSS máximo | Páginas | Bytes   |
| ---------------- | ----- | --------- | ------------------ | ---------- | ------- | ------- |
| P-RP, Helvetica  | 50    | 88 ms     | 75 MB              | 398 MB     | 2       | 8 550   |
| P-RP, Helvetica  | 500   | 1 410 ms  | 281 MB             | 457 MB     | 12      | 60 042  |
| P-RP, Helvetica  | 3000  | 35 586 ms | 1 990 MB           | 2 588 MB   | 73      | 351 681 |
| P-RP, Noto       | 50    | 92 ms     | 88 MB              | 378 MB     | 2       | 14 025  |
| P-RP, Noto       | 500   | 1 670 ms  | 270 MB             | 467 MB     | 15      | 69 296  |
| P-RP, Noto       | 3000  | 46 012 ms | 1 410 MB           | 2 323 MB   | 91      | 385 363 |
| P-KIT, Helvetica | 50    | 9 ms      | 37 MB              | 393 MB     | 2       | 5 600   |
| P-KIT, Helvetica | 500   | 60 ms     | 47 MB              | 393 MB     | 12      | 37 311  |
| P-KIT, Helvetica | 3000  | 283 ms    | 138 MB             | 394 MB     | 77      | 225 338 |
| P-KIT, Noto      | 50    | 35 ms     | 71 MB              | 395 MB     | 2       | 11 208  |
| P-KIT, Noto      | 500   | 83 ms     | 77 MB              | 393 MB     | 14      | 45 983  |
| P-KIT, Noto      | 3000  | 278 ms    | 122 MB             | 394 MB     | 88      | 249 247 |

- **El RSS de base** del proceso de medición es de unos 390 MB: incluye `tsx` y su compilador.
- **El pico de `heapUsed`** se muestrea cada 1 ms y no corre mientras la biblioteca trabaja sin
  ceder, así que puede quedar debajo del real. El RSS máximo (`process.resourceUsage().maxRSS`)
  lo acota.
- **Dos variantes de P-RP, para descartar que el problema fuera el armado**, medidas sobre la
  primera versión de los documentos:
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
  - P-KIT: +23,9 KB (225 338 B a 249 247 B).
  - P-RP: +33,7 KB (351 681 B a 385 363 B).
  - Noto es más ancha que Helvetica y la misma tabla ocupa más páginas: 88 contra 77 en P-KIT,
    91 contra 73 en P-RP.

## M5, el texto

Un PDF con cada texto en la columna «Persona» y una palabra de 100 «x» en «Proyecto». Lo abrí con
poppler: `pdftotext` para lo que se copia y `pdftoppm` para lo que se ve. Con `pdfjs-dist`, en
M9, sale lo mismo. No usé LibreOffice ni un navegador.

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
  - **P-KIT la parte** en tres renglones dentro de su columna y la fila crece. Se leen las 100.
  - **P-RP no la parte y pierde texto.** Con `registerHyphenationCallback((word) => [word])`, como
    pide §4.6, la palabra pasa por encima de «Duración» y «Horas» hasta el borde de la página. El
    resto no se escribe: el PDF tiene 72 «x» con Noto y 76 con Helvetica.
  - Con P-RP, la nota larga de la cabecera también se salía del margen hasta que su `<Text>`
    llevó `flexShrink: 1`.

## M6, el peor peso

El documento de 3000 filas armado a mano, con rótulos de 100 caracteres en sus tres niveles de
texto.

| Variante         | Escritura  | Pico de `heapUsed` | Páginas | Bytes   |
| ---------------- | ---------- | ------------------ | ------- | ------- |
| P-KIT, Helvetica | 749 ms     | 183 MB             | 188     | 482 911 |
| P-KIT, Noto      | 657 ms     | 222 MB             | 273     | 627 340 |
| P-RP, Noto       | 128 110 ms | 1 596 MB           | 263     | 776 796 |

Todas quedan debajo de 2 MB. P-RP con Helvetica no se midió: con Noto ya pasa por mucho el tiempo
y la memoria.

## M7, la cadena de dependencias

`npm audit --omit=dev` sobre el `package-lock.json` de `55e938e` (el de `f73b455` es el mismo) da
6 moderadas y ninguna alta:

- `uuid` y `exceljs` (GHSA-w5hq-g745-h8pq), la ya aceptada en R6b.
- `esbuild`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader` y `drizzle-kit`
  (GHSA-67mh-4wv8-2f99), porque `drizzle-kit` está en `dependencies`.

**Ninguna alerta toca la cadena del PDF**:

- `@react-pdf/renderer` 4.9.0 y sus `@react-pdf/*`;
- `pdfkit` 0.20.1, `fontkit` 2.0.4, `yoga-layout` 3.2.1 y las dependencias de M1.

Con P-KIT, la cadena en uso se reduce a los 15 paquetes de M1. `@react-pdf/*` y `yoga-layout`
quedan instalados mientras `@react-pdf/renderer` siga en `dependencies`.

## M8, el peor pedido

Para cada medida, un `next start` nuevo y una sesión de prueba. Después, el primer pedido a
`exportar/pdf` con la lectura de P2: 366 días, todo el equipo, Persona → Proyecto → Fecha, que
lee 780 filas reales. Escribe el documento de 3000 filas de M3. El tiempo va hasta el último byte.
Mediana de cinco reinicios.

| Variante         | Mediana | Las cinco                         | Bytes   |
| ---------------- | ------- | --------------------------------- | ------- |
| P-RP, Helvetica  | 35,13 s | 35,05; 35,35; 35,13; 35,67; 35,02 | 351 681 |
| P-RP, Noto       | 43,71 s | 44,04; 43,16; 43,49; 43,75; 43,71 | 385 363 |
| P-KIT, Helvetica | 0,83 s  | 0,87; 0,83; 0,83; 0,81; 0,82      | 225 338 |
| P-KIT, Noto      | 0,85 s  | 0,85; 0,82; 0,86; 0,84; 0,85      | 249 247 |

El presupuesto es 5 s. P-RP lo pasa por siete u ocho veces; P-KIT queda en la sexta parte.

## M9, el lector de los tests

`pdfjs-dist/legacy/build/pdf.mjs` 6.4.299, sin configurar el worker, bajo Vitest en Node.
`getDocument` lleva `isEvalSupported: false` y `disableFontFace: true`. Lee el PDF de M5 de cada
variante.

- **Funciona.**
  - La primera carga del módulo tarda 154 a 179 ms.
  - Leer la página y su texto tarda 62 a 74 ms con Noto y 9 a 12 ms con Helvetica.
  - Con Helvetica, que no va embebida, avisa que falta `standardFontDataUrl`, pero el texto sale
    igual.
- **Los fragmentos no son las celdas** (D-R7-10).
  - pdfjs junta en un fragmento lo que está cerca en un renglón: «1 Łukasz Żółć», «Nivel
    Persona».
  - Parte en tres fragmentos la palabra que ocupa tres renglones de su celda.
  - Pedir `disableCombineTextItems` no cambia nada en esta versión.
- **La lectura que funcionó**, para afirmar en los tests:
  - Cada fila empieza en el entero de «Nivel» y llega hasta la siguiente; el pie queda afuera.
  - Sus fragmentos se ordenan por columna y renglón.
  - Los renglones de una misma celda se pegan sin espacio, y las celdas, con un espacio.
- **Con P-KIT**, las doce filas salen como se escribieron. Por ejemplo,
  `1 Łukasz Żółć xxxx…(100) 1:00 1,00`. El test pasa con Noto y con Helvetica.
- **Con P-RP** falla: la fila 1 trae 72 o 76 «x» en lugar de 100 (§ M5).
- Separar cada celda por columna no es confiable, por los fragmentos que pdfjs junta. Los tests
  de R7a pueden afirmar el texto de cada fila.

## Lo que no se midió

- **Los límites de Vercel Hobby**: el tamaño de la función, la duración y la memoria. No se pueden
  medir en local (§6.3); los 250 MB de M1 son una referencia no verificada.
- **F-G (Geist) en M1, M3, M6 y M8**: la regla de §6.1 la descarta por no tener U+FFFD. DejaVu
  Sans quedó solo en M4: Noto cumple lo mismo con menos peso.
- **M5 en LibreOffice, Firefox o Chrome**: lo miré con poppler y con `pdfjs-dist`.
- **Un pedido real de 3000 filas**: con `seed.sql` ninguno llega, como dice §6.1. M3, M6 y M8
  usan el documento armado a mano; la lectura de M8 es la real de P2.

## Para R7a, si se elige P-KIT

- **El ADR 0022 cambia de opción**: (2) en lugar de (1). `pdf.tsx` pasa a ser `pdf.ts`, sin React,
  y dibuja la tabla con la paginación descrita arriba.
- **Lo que falta**:
  - `pdfkit` en `dependencies`, con la versión instalada (0.20.1), y sus tipos (`@types/pdfkit`) en
    `devDependencies`;
  - la fuente en el repositorio con su licencia, leída con `path.join(process.cwd(), "…")` y una
    ruta literal, que Turbopack sigue;
  - `pdfjs-dist` en `devDependencies` para los tests (pregunta 4).
  - `serverExternalPackages` no hace falta: empaquetado funciona y pesa la mitad.
- **La regla de ESLint de §4.8** cambia de `@react-pdf/renderer` a `pdfkit`.
- **`@react-pdf/renderer`** queda sin uso. Sacarlo de `dependencies` es una decisión aparte.
