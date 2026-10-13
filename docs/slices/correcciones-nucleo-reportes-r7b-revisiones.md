# R7b: implementación y revisiones (2026-10-13)

Rama `nucleo/r7b-grafico` desde `main` en `af04f91` (el contrato de R7 con R7b).
Contrato: [`nucleo-reportes-r7-exportar-pdf.md`](nucleo-reportes-r7-exportar-pdf.md),
lo de R7b. El usuario pidió R7b el 2026-10-13, en paralelo a R8.

## Contrato

- **Primera ronda de `architecture-reviewer`** contra `10b8af0`: pide cambios
  (tres mayores, cuatro menores, dos de texto). R7b era un esbozo: no definía el
  modelo ni el dibujo del gráfico, los criterios 17 y 18 pasaban sin el gráfico
  y el reparto dejaba afuera seis tests que el cambio de tipo rompía. El
  team-lead aceptó los nueve tal como venían, incluido que R7b lo haga un solo
  `backend-dev`. Los aplicó `architect`, que decidió las medidas y los colores
  de §4.6.
- **Segunda ronda**, sobre el diff: aprobado con retoques (comparar el criterio
  18 sin quitar blancos, el criterio 9 en «Consecuencias» y el encabezado). Los
  aplicó el team-lead. Commit `af04f91` en `main`.

## Implementación

- **`backend-dev`, `050809a`:** el documento con `chart`, `PdfChart` en el
  diseño y el dibujo en `pdf.ts`; `chart: null` en los documentos escritos a
  mano de `csv.test.ts`, `xlsx.test.ts` y `entry-size.test.ts`. Criterios 16 a
  18; caen los 19 mutantes de §8.1. El bloque mide 160,4 pt, no «unos 170»: el
  contrato se corrigió en `2f746cb`.
- **`e2e-tester`, `6e79d2b`:** el recorrido 29. Falla sin el gráfico («Horas por
  día» no está), pasa con `050809a`, el mutante del PDF sin gráfico cae y el 28
  sigue igual. Suite 214/214.
- **Criterio 13 bis**, a mano: el team-lead miró las imágenes de la página 1 de
  los PDF de un mes por día, un día y un día de 4 minutos; las marcas están
  enteras, la barra de pocos minutos es una línea fina, la barra sola va
  centrada y la tabla empieza debajo. Falta verlos impresos (usuario, opcional).

## Revisiones

| Revisión           | Veredicto                            |
| ------------------ | ------------------------------------ |
| Backend            | Aprobado, dos nits                   |
| Seguridad          | Aprobado, sin hallazgos de R7b       |
| Código             | Pide cambios: un mayor, tres menores |
| Tests              | Aprobado, un menor                   |
| Paridad (reviewer) | Aprobado con menores                 |
| Frontend           | No corre: R7b no toca la pantalla    |
| Código, 2.ª pasada | Aprobado, dos menores opcionales     |

Decisiones del team-lead:

- **C1 (mayor, código):** `drawChart` repetía `drawSectionTitle`. Se corrige con
  `keepWith`. Corregido.
- **C2:** `drawLine` escribe texto y se confundía con las líneas de la escala: pasa
  a `drawUnwrappedText`. Corregido.
- **C3:** los JSDoc de `PdfChartBar` y `PdfChart` describían la implementación;
  pasan a términos de dominio. Corregido.
- **C4:** el gráfico de octubre estaba repetido en dos tests: pasa a
  `src/test/report.ts` como `octoberByDay`. Corregido. `cellsOf` frente a
  `readBack` queda como deuda: llevar `readBack` a `src/test/` sale del slice.
- **T1 (tests) = N1 (backend):** el mutante que saca el renglón de las marcas de
  la medida del bloque sobrevivía, porque las 46 «Nota» dejaban 85 pt contra 160. Se corrige: `lowestY` por página en `src/test/pdf.ts` y un barrido de 40 a
  52 «Nota» que afirma el gráfico entero en una página y ningún texto debajo del
  margen. Corregido; con el mutante, 40 «Nota» dejan texto en 34,33 pt y cae.
- **N2 (backend):** la cifra de «unos 170 pt» del contrato. Corregida a 160.
- **S1 (seguridad, ajeno a R7b):** `npm audit` sin `--omit=dev` da 9 altas de
  desarrollo (`braces`). Decidido el 2026-10-09: se toleran, CI audita
  producción (0 altas). Sin acción.
- **P1 (paridad):** `reportes.md` no describía R7b. Lo resolvió el texto de
  `parity-analyst` (RP-53, P-05 y la sección 17), aplicado por el team-lead en
  `2f746cb`. El reviewer comparó contra la pantalla cuatro casos (31 barras, 14
  semanas, un día de 8 h y uno de 30 s) y coinciden la escala, las marcas, las
  alturas y los casos sin gráfico.
- **Segunda pasada de código:** `MARGIN` repetía `PAGE_MARGIN` y un `slice(8)` sin
  explicar. Se aceptan los dos.

## Correcciones

- `792f131`: C1 a C4 y T1. El PDF sale igual antes y después de C1: el texto con
  su posición y las operaciones de dibujo de 34 documentos, volcados con pdfjs,
  son idénticos. Caen 22 mutantes, los 19 de §8.1 y tres de la medida del bloque.
- `63fe1fc`: los dos menores de la segunda pasada (`PAGE_MARGIN` exportado y las
  marcas de octubre derivadas de `octoberByDay`). Solo tests: `pdf.test.ts`, lint
  y typecheck en verde; no cambia nada que lea el e2e.

## Corrida final

Sobre `792f131`: lint, typecheck, 1984 de unidad, 305 de `test:time-ar`, 1581
de integración y `prettier --check .`, en verde. E2E con una copia nueva y
build nuevo, `next start -p 3101`: 214/214 dos veces, sin flaky.

## Pendiente del usuario

- Ver los PDF con gráfico impresos o en vista previa de impresión (criterio 13
  bis).
- P-05: mirar el PDF del resumido de Clockify (si trae el gráfico por omisión,
  cómo lo dibuja y si sacarlo es del plan Free).
- En Vercel, después del despliegue, la comprobación de §10 punto 4 del contrato,
  ahora con el gráfico.
