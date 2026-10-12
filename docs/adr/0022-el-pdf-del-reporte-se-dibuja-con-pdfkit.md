# 0022. El PDF del reporte se dibuja en el servidor con `pdfkit`

Fecha: 2026-10-12. Estado: Aceptado (2026-10-12, decisión del usuario).
Origen: el contrato de R7
([`nucleo-reportes-r7-exportar-pdf.md`](../slices/nucleo-reportes-r7-exportar-pdf.md)),
que dejó la elección propuesta en su §12, y la medición R7-0
([`nucleo-reportes-r7-medicion.md`](../slices/nucleo-reportes-r7-medicion.md),
`b26c589`), con la que el usuario eligió. La fuente la decidió el team-lead, por
delegación del usuario. Revisado en
[`correcciones-nucleo-reportes-r7-contrato.md`](../slices/correcciones-nucleo-reportes-r7-contrato.md).

## Contexto

RP-53 pide exportar el reporte resumido a PDF (`replicar`), con hasta 3000
filas, como Clockify. R6 dejó una ruta por formato, un documento que no depende
del formato (`ExportDocument`) y una tabla de escritores: el PDF es un escritor
más, con la cabecera y el resumen, sin las entradas una por una.

- **Corre en una función de Vercel Hobby.** El contrato se diseña contra 10 s
  por pedido, 4,5 MB de respuesta y 250 MB de función sin comprimir, ninguno
  verificado. El peor pedido es el primero en frío con el documento de 3000
  filas.
- **`@react-pdf/renderer` 4.9.0 estaba en `dependencies` desde el principio,
  sin uso.** Next lo trata como paquete externo del servidor. Su motor es
  `pdfkit` 0.20.1, que viene instalado con él, con `fontkit` 2.0.4.
- **Las fuentes estándar del PDF** codifican en WinAnsi: no tienen U+FFFD ni
  dibujan «Ł», el griego o el cirílico. R6b fijó que lo que un formato no admite
  sale como U+FFFD.

## Opciones

1. **`@react-pdf/renderer`**: el PDF se describe con componentes; los
   encabezados repetidos, las filas que no se parten y el número de página son
   propiedades. Diseña con Yoga.
2. **`pdfkit` directo**: la tabla, los saltos de página y el pie se dibujan a
   mano, con la altura de cada fila medida antes de dibujarla.
3. **Una hoja de impresión y «Guardar como PDF» del navegador**: sin
   dependencias ni función, pero no es un archivo que genera el servidor y no se
   prueba en CI.

## Decisión

La opción 2, con Noto Sans Regular incrustada.

- **`pdfkit` 0.20.1** dibuja el PDF en `src/modules/report/export/pdf.ts`, el
  único archivo que lo importa (una regla de ESLint lo hace cumplir, como con
  `exceljs`), cargado con `import()` desde la tabla de escritores: la página, el
  CSV y el Excel no lo cargan.
- **Empaquetado por Turbopack**, sin `serverExternalPackages`: funciona con
  `next start` y su trazado es la mitad que con el paquete externo.
- **La tabla, a mano**: cada fila mide su altura con `heightOfString`; una fila
  que no entra pasa entera a la página siguiente, con los encabezados
  repetidos; al final, «Página n de N» en cada página (`bufferPages`). Una
  palabra más larga que su columna se parte dentro de la columna.
- **La fuente**: Noto Sans Regular 2.015, la variante sin hinting (431 364
  bytes, SIL Open Font License 1.1, SHA-256
  `f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8`), en el
  repositorio con su licencia. Tiene U+FFFD y cubre Latin-1, Latin Extended-A
  y B y el cirílico enteros y 121 de los 135 puntos del griego. Lo que no
  cubre, como los emoji o «→», sale como U+FFFD. Entra al trazado de la función
  con `outputFileTracingIncludes` en la ruta del PDF: leída con
  `join(process.cwd(), …)`, Turbopack no la sigue sola.
- **La cobertura de la fuente** la da `fontkit` 2.0.4, que pasa a
  `dependencies` con `pdfkit` y solo se importa en `pdf.ts`.
- **`@react-pdf/renderer` queda sin uso** y sale de `dependencies` en el primer
  paso de R7a; con él se van `yoga-layout` y los `@react-pdf/*` del árbol
  instalado. La regla de ESLint prohíbe importarlo en cualquier archivo.

## Por qué

La medición R7-0, en local (Ryzen 7 8845HS, Node 25.8.1, Next 16.3.8 con
Turbopack), contra los presupuestos que el contrato fijó antes de medir:

- **3000 filas, solo la escritura** (presupuesto 3 s y 512 MB de pico):
  - `@react-pdf/renderer`: 29,6 s y 1614 MB con Helvetica, 34,2 s y 1469 MB con
    Noto. Crece más que lineal con las filas (500 filas, 1,2 s; 1500, 7,6 s), y
    paginar a mano con un `<Page>` cada 45 filas lo baja a 2,7 s pero con
    686 MB y filas mal partidas.
  - `pdfkit`: 0,26 s y 116 MB con Helvetica; 0,25 s y 135 MB con Noto, en 67
    páginas y 217 KB.
- **El primer PDF en frío** con el mes pasado (781 filas), contra el primer CSV
  (presupuesto: 3 s más): `@react-pdf/renderer`, +2,37 s y +2,77 s; `pdfkit`,
  +0,11 s y +0,16 s.
- **El trazado de la función** (presupuesto 50 MB): `@react-pdf/renderer`,
  13,6 MB; `pdfkit` externo con la fuente, 11,8 MB; `pdfkit` empaquetado con la
  fuente, 5,4 MB. El del CSV, 4,8 MB, no lista nada del PDF.
- **El peor peso**, 3000 filas con rótulos de 100 caracteres (presupuesto
  2 MB): `pdfkit` con Noto, 339 KB en 0,34 s; `@react-pdf/renderer`, 501 KB en
  71,8 s.
- **Una palabra de 100 caracteres**: `pdfkit` la parte en renglones dentro de
  su columna; `@react-pdf/renderer`, sin partición de palabras, la saca de la
  página.
- **Las fuentes**: Geist, la única sin descarga, no tiene U+FFFD; DejaVu Sans
  cubre lo mismo que Noto y algo más del griego, pero pesa 757 KB; Noto con
  hinting, 622 KB.
- **Ninguna alerta** de `npm audit --omit=dev` toca la cadena del PDF.

Con `@react-pdf/renderer`, una tabla de 3000 filas no entra en una función de
10 s. `pdfkit` cumple todos los presupuestos con un margen de más de diez veces
en la escritura. La opción 3 no genera un archivo.

## Consecuencias

- **El dibujo de la tabla es código propio**: medir las filas, saltar de
  página, repetir los encabezados y numerar. Lo que no depende de la biblioteca
  —qué va en cada columna, qué texto lleva cada celda, qué se apaga— vive en un
  módulo puro (`pdf-layout.ts`) con sus tests.
- **`dependencies`** suma `pdfkit` y `fontkit`, con las versiones que ya estaban
  instaladas, y pierde `@react-pdf/renderer`. `devDependencies` suma sus tipos
  y `pdfjs-dist`, que los tests usan para leer el texto del PDF.
- **Un binario en el repositorio**: la fuente, con su licencia y su SHA-256, que
  un test compara.
- **El PDF no es accesible como tabla** (sin PDF/UA): un lector de pantalla lee
  el texto en orden. El CSV y el Excel tienen los mismos datos.
- **Si un cambio de Next rompe el empaquetado de `pdfkit`**, la salida medida es
  `serverExternalPackages: ["pdfkit", "fontkit"]`, con el doble de trazado.
- Los límites de Vercel siguen sin verificar; los mide el usuario después del
  despliegue, con el tiempo en frío de un mes del equipo.
