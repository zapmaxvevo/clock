# Correcciones de R5 del núcleo de reportes: revisiones

R5 es el gráfico de barras, contrato
[`nucleo-reportes-r5-grafico-de-barras.md`](nucleo-reportes-r5-grafico-de-barras.md), aprobado
en dos pasadas de `architecture-reviewer` y mergeado a `main` en `fdd540c`. Rama
`nucleo/r5-grafico`.

Commits: backend `9ed713d` (paso 1), `68a070e` (paso 3) y `52db1ae` (paso 4, `explain.sql`);
frontend `09fc59c` (paso 2) y `fe7d174` (D1); integración `07289e2` (criterio 10); e2e `cb1dfb1`
(recorridos 21 y 22).

## Implementación

- **Pasos 1 y 3** (backend): los mutantes de §8.1 de los criterios 1 a 9 caen. El de los
  cortes en UTC cae por la guarda `RangeError` de `checkBuckets`, no por una afirmación sobre las
  barras. El de `.min(1)` sobrevivía hasta que el caso de 0 barras pasó a total 0. El test de
  Madrid del 25/10 usa el rango del 22 al 28/10: con el 25 al final, el mutante del día de 24 h
  sobrevivía. `totalsByBucket` suma una guarda de forma que el contrato no nombra (una fila sin
  su tramo lanza `Error`).
- **Paso 4, §6.2** (postgres:18-alpine, `seed.sql` sin cambios, medianas de cinco): Q35 76,7 ms
  (≤ 150), Q36 32,3 (≤ 100), Q37 6,6 (≤ 40), Q38 2,1 (≤ 30), Q39 1,6 (≤ 15). Sin índices. Pedidos
  enteros de 366 días entre 127 y 209 ms (≤ 500); el gráfico les suma de 50 a 60 ms. Fuera de
  R5: Q25 de R10 dio 152,5 ms (≤ 150) con la máquina cargada; se vuelve a medir en la corrida
  final.
- **Paso 2** (frontend): los 17 mutantes del criterio 11 caen. §5.5, en claro / oscuro: barra
  contra fondo 4,74 / 4,18; activa contra normal 3,78 / 3,76; contorno contra columna activa
  18,16 / 14,5; rótulos 4,74 / 7,66. El foco se ve sobre una columna en cero, también con colores
  forzados. §6.3 con 31 días: HTML +37 985 B (≤ 40 KB), RSC +14 187 B (≤ 15 KB), JS +869 B
  comprimidos (≤ 5 KB).
- **Criterio 10** (`07289e2`): 22 casos (alcance directo, por el estado, con filtros y la
  misma foto); 17 mutantes de las filas 4, 8, 9 y 10 caen.
- **Recorridos 21 y 22** (`cb1dfb1`): 15 mutantes caen; `reports.spec.ts` 23/23 ×3 y la suite
  207/207 contra `next start`. Después de «Esta semana» no se usa `expectReport` (arma la semana
  con lunes); el 22 mide contra la caja de contenido de `main`.

### Desvíos aceptados por el team-lead

- **D1, las marcas angostas.** A 320 y 375 px las siete marcas se pisaban: una marca de día mide
  de 36 a 40 px y el área de columnas, unos 214 px. Con el área por debajo de 24rem se ven solo
  las de `narrowTickIndexesOf` (una de cada dos de `tickIndexesOf`, a lo sumo cuatro), con una
  container query y sin JavaScript. `ChartBars` las calcula de `bars.length`: con un booleano
  por barra, el RSC subía a +14 811 B. Medido en 100 casos, sin marcas visibles que se pisen.
  Cambia D-R5-8.
- **D2.** Las flechas, Inicio y Fin no hacen nada con Alt, Ctrl, Meta o Mayúsculas: Alt+flecha
  sigue siendo «atrás».
- **D3.** La columna de la escala toma el ancho de todos los rótulos («0:45» medía 2 px más que
  «1:00» y se salía de la caja).

### Lección de la corrida

Los encargos decían `DATABASE_URL` para la integración, pero `src/test/setup.ts:7` la pisa con
`TEST_DATABASE_URL`, que por defecto es `clock_test`. Lo avisó `test-engineer`. Las primeras
corridas de backend, de test-engineer y de dos reviewers fueron contra `clock_test`; todas se
repitieron con su base propia y dieron lo mismo.

## Revisiones

| Revisión  | Agente                | Veredicto                                       |
| --------- | --------------------- | ----------------------------------------------- |
| Backend   | `backend-reviewer`    | aprobado, tres notas                            |
| Seguridad | `security-auditor`    | aprobado, sin hallazgos                         |
| Frontend  | `frontend-reviewer`   | aprobado, un menor                              |
| Tests     | `test-reviewer`       | aprobado, tres menores                          |
| Código    | `clean-code-reviewer` | cambios requeridos: dos mayores y siete menores |
| Paridad   | `parity-reviewer`     | cambios requeridos: seis de texto y P6, código  |

Lo que verificaron:

- **Backend**: `levelTotals` es el cuerpo anterior de `totalsByLevels` (`diff -w`); un solo
  camino, sin pasar por `reportRepository`; las afirmaciones de §0 no cambian; `timeGroupOf`
  idéntico a los casos de `groupOf`. 22 mutantes caen; integración 1489/1489.
- **Seguridad**: el gráfico recibe el `readScope` y el filtro efectivo; un member con
  `personas=` ajenas ve lo propio; sin parámetros ni dependencias nuevas; el cliente recibe solo
  textos y números. Las 9 altas de `npm audit` son de desarrollo, ya toleradas.
- **Frontend**: la `key` en `ReportChart` vuelve a montar `ChartBars` (probado en vivo); foco
  itinerante, accesibilidad, colores forzados, 320 px y antes de hidratar.
- **Tests**: cada criterio con su test; ningún valor existente cambió; sin esperas fijas; 18
  mutantes propios caen.
- **Paridad**: granularidad y umbrales, rótulos, semanas con domingo y lunes, escala, vacíos,
  Apia, Buenos Aires y Madrid, member y admin, teclado, puntero y tabla de datos coinciden.

## Ronda de correcciones

| Id        | Origen        | Hallazgo y decisión                                                                                                                                                     | Quién     |
| --------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| B1        | backend       | La variable local `chart` de `getReportState` pasa a `chartPlan`.                                                                                                       | backend   |
| B2        | backend       | El docstring de `readReport`, cortado a mitad de oración, se vuelve a cortar a 80 columnas.                                                                             | backend   |
| B3        | backend       | Nota: `explain.sql` coincide; las medianas están arriba. Sin cambios.                                                                                                   | —         |
| C3        | código        | `monthShortLabel` con `civilTime(dayKey)`, sin repetir el `Date.UTC`.                                                                                                   | backend   |
| C7        | código        | `ChartPlan = Pick<ReportBucketRead, "granularity" \| "buckets">` y `...plan.chart` en la llamada.                                                                       | backend   |
| T1        | tests         | `seedUncappedDescriptions` arriba del describe de R10b, con `n % 2 = 0`, usado por los dos.                                                                             | backend   |
| F1        | frontend      | `focus-visible:outline-none` → `outline-hidden` en el summary (`report-chart.tsx:232`).                                                                                 | frontend  |
| P6        | paridad       | **Código.** El contorno del foco no se ve sobre la barra activa a toda la altura: la barra queda dentro del contorno.                                                   | frontend  |
| C1        | código        | **Mayor.** `PartialHeading` exportado de `group-heading.tsx` y usado en la tabla de datos (solo el export en ese archivo).                                              | frontend  |
| C2        | código        | **Mayor.** El docstring de `ChartBars`: la `key` la pone `ReportView` sobre `ReportChart`.                                                                              | frontend  |
| C4        | código        | Sin `export` en `ChartScaleLine` y `ChartScale`; sin el campo `step`.                                                                                                   | frontend  |
| C5        | código        | `TickAlign` en `chart-model.ts`, usado en los dos lugares.                                                                                                              | frontend  |
| C6        | código        | Las clases de ancho de columna como constantes con nombre, en las dos filas.                                                                                            | frontend  |
| C8        | código        | `bodyRows` en un helper compartido de tests (`src/test/markup.ts`).                                                                                                     | frontend  |
| T3        | tests         | `toHaveLength(2)` antes de los dos bucles de `report-chart.test.tsx`.                                                                                                   | frontend  |
| C9/T2     | código, tests | `type Box` exportado desde `e2e/calendar-page.ts` y usado en `boxOf` y en el spec.                                                                                      | frontend  |
| P1–P5, P7 | paridad       | Texto: las marcas de D1, los modificadores de D2, el clic que da el foco, sin JavaScript contra antes de hidratar, la barra de 30 s con 2 px y el área de las columnas. | team-lead |

Antes del merge, el team-lead aplica al contrato D1 (D-R5-8 y el criterio 11), D2 y D3, y el
texto de paridad con P1 a P5 y P7.
