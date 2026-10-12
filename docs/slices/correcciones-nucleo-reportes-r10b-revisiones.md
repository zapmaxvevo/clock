# Correcciones de R10b del núcleo de reportes: revisiones

R10b es la parte B del contrato
[`nucleo-reportes-r10-descripcion-mes-y-semana.md`](nucleo-reportes-r10-descripcion-mes-y-semana.md):
agrupar por descripción y el tope del primer nivel. Sale de `main` en `d691e40` (R10a mergeado),
en la rama `nucleo/r10b`.

Commits: frontend `d137911` (F1 de R10a: la tabla de ancho fijo) y `f49a419` (paso 11); backend
`88dd429` (paso 10), `fdd0105` (paso 12) y `d32b376` (paso 13, `seed.sql` y la medición);
integración `6890dd8` (criterio 18); e2e `75e816e` (recorridos 19 y 20).

## Implementación

- **F1 de R10a** (`d137911`): `table-fixed` y «Duración» en `w-24`; `NamedHeading` con
  `block truncate`. Con nombres de 100 caracteres, la tabla pasa de hasta 1404 px a 270/270 y
  325/325 a 320 y 375 px en todas las agrupaciones medidas. **N1 de paridad de R10a queda como
  deuda**: una semana con «solo …» en el tercer nivel ocupa hasta siete renglones a 320 px; la
  única salida en los archivos de frontend ata la pantalla al formato de `dayRangeLabel` y cambia
  el texto que leen los e2e.
- **Paso 11** (`f49a419`): `DescriptionHeading` propio (el `NamedHeading` del paso 10 no ponía
  «…»); los diez mutantes de frontend de §8.1 caen.
- **Paso 12** (`fdd0105`): los 21 mutantes de backend de §8.1 caen (criterios 15 a 17);
  integración 1437/1437.
- **§6.3** (`d32b376`), medianas de cinco: Q31 42,3 ms (≤ 200), Q32 5,7 (≤ 60), Q33 18,9
  (≤ 100), Q34 2,5 (≤ 40); pedidos enteros 62,3 ms (≤ 500) y 20,3 ms (≤ 250). Sin índices.
  Q2, Q5 y Q11 con el `limit` del primer nivel, dentro de 150 ms. `explain.sql` lleva el `limit`
  como parámetro solo en Q2, Q5 y Q11; las demás consultas de primer nivel siguen sin él en el
  script (nota para la deuda del script).
- **§6.4 y §5.1** (frontend, en su copia, sin commit): RSC 676 KiB y 655 KiB (≤ 1 MB); HTML
  1,69 MiB y 1,99 MiB (≤ 2,5 MB, el segundo al 83 %); la barra con nueve enlaces en tres
  renglones a 320 y 375 px, sin desborde en `main`.

- **Criterio 18** (`6890dd8`): `groupBys` de vuelta en `REPORT_GROUP_BYS`, descripciones en la
  fixture y cinco casos que afirman sobre `JSON.stringify` del estado entero que ningún texto
  ajeno viaja. Los siete mutantes de alcance (M1 a M6) caen, y con el archivo anterior
  sobrevivían todos salvo M6. Equivalente confirmado: `length` por `char_length` en `truncated`
  (en UTF8 dan lo mismo). Reportes 200/200.
- **Recorridos 19 y 20** (`75e816e`): los doce mutantes de §8.2 caen, aislados uno por uno;
  `reports.spec.ts` ×3 61/61 y la suite 205/205. Suma `ROW_LIMIT` y `firstLevelLimitCell` en
  `reports-page.ts`, que el contrato no nombra.

## Revisiones

| Revisión  | Agente                | Veredicto                                      |
| --------- | --------------------- | ---------------------------------------------- |
| Backend   | `backend-reviewer`    | aprobado, un menor y dos notas                 |
| Seguridad | `security-auditor`    | aprobado, sin hallazgos (completa, §7 paso 17) |
| Frontend  | `frontend-reviewer`   | aprobado, dos notas                            |
| Tests     | `test-reviewer`       | aprobado, dos menores                          |
| Código    | `clean-code-reviewer` | cambios requeridos: un mayor y tres menores    |
| Paridad   | `parity-reviewer`     | aprobado; P1 de la especificación (§11.4)      |

Lo que verificaron:

- **Seguridad**, sobre `d691e40..6890dd8`: la descripción se agrupa dentro del mismo
  `inScope(scope)`; `personas=…` con alcance `self` no cambia nada; el texto solo como hijo de
  React y las claves de fila son el hash o `sin-descripcion`; largo, hash y `limit` del servidor;
  inyección SQL probada con `'); drop table time_entry; --` y otros; una prueba propia con una
  descripción de 3000 caracteres y dos de 150 que comparten los 100 primeros, en siete árboles:
  arma, suma y no pasa de 100 al payload. `npm audit --omit=dev` sin altas.
- **Frontend**, sobre `..d32b376`: 270/270 y 325/325 en las nueve agrupaciones con uno y dos
  subniveles; escape con `<img onerror>` y RLO; teclado y nombre del botón; el primer nivel
  cortado con y sin filtro. Notas: F1, un corte a 100 justo después de un espacio se ve «… …»
  (decisión de paridad); F2, el aviso de `eval()` y la CSP en `next dev`, previo.
- **Backend**, sobre `..d32b376`: reprodujo §6.3 (Q31 44,3 ms, Q33 18,2, pedidos ~66 y ~21 ms) y
  capturó con `log_statement` el SQL de Q31 y Q33, igual byte a byte a `explain.sql`. Filas por
  nivel (B3): Q31 12 697 grupos, Q32 1177, Q33 4254 y Q34 540. **Con el volumen sintético,
  Persona → Descripción de un mes no muestra el segundo nivel** (4254 > 2971): la regla del tope
  de R3b, con su línea. En Q2, Q5 y Q11 el `limit` solo suma un nodo `Limit`.
- **Tests**: cada mutante de §8.1 (14 a 19) y §8.2 (19 y 20) cae por su afirmación, salvo T1 y
  T2; los dos equivalentes, bien declarados. Unidad de report 282/282, integración 200/200.
- **Código**: capas, reutilización (`trackerLabels.noDescription`, claves `sin-*`) y comentarios
  bien; duplicación en los helpers de tests.

## Ronda de correcciones

A `backend-dev` (`backend-r10b`), salvo lo que pida paridad:

| Id    | Origen          | Hallazgo                                                                                                                                                 |
| ----- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1/C2 | backend, código | `levelReadOf(…, limit?: number)` (`service.ts:672`) con `limit` obligatorio; `ReportLevelRead.limit` también, si los tests se adaptan sin ruido.         |
| B2    | backend         | La cabecera de `explain.sql` dice que el `limit $n` lo llevan solo Q2, Q5 y Q11.                                                                         |
| C1    | código          | **Mayor.** `seedClosed` con `description`; sin `seedDescribed` duplicado ni los dos `db.update` sobre todo el workspace (`service.integration.test.ts`). |
| C3    | código          | El id esperado (sha256, 32 hex) en un solo helper de `src/test/`.                                                                                        |
| C4    | código          | `rowHeadings` y los textos del tope a nivel de módulo en `report-view.test.tsx`.                                                                         |
| T1    | tests           | `levelsShown: -1` con `groups: []` en `schema.test.ts`: hoy el piso no se prueba.                                                                        |
| T2    | tests           | El total del criterio 17 no mata «la suma de las filas leídas»: sembrar una entrada más (3002 grupos) y afirmar `3001*60 + 3600`.                        |

Para §8.2 del contrato: «el total menor que 50:01» del recorrido 20 solo se puede dar con más de
3001 grupos; con T2 la integración lo cubre.

## Al cortar (2026-10-09, ~22:45, el usuario apaga la máquina)

- Ronda de correcciones hecha en `718cf32` (B1/C2 con `ReportLevelRead.limit` todavía opcional,
  decisión del team-lead: hacerlo obligatorio toca unas 25 lecturas a mano de los tests; B2, C1,
  C3, C4, T1 y T2, con sus mutantes cayendo por la afirmación).
- Corrida final sobre `718cf32`, bases `clock_r10b_final_test` y `clock_r10b_final_e2e`: lint,
  typecheck, 1702 de unidad, 298 de `test:time-ar`, 1444 de integración y e2e **205/205 en la
  primera vuelta**. Las dos vueltas siguientes cortaron en el setup («Cargando el rastreador»):
  **no es R10b**, Chromium headless dejó de disparar `requestAnimationFrame` en esta máquina,
  también en una página vacía y sobre una base nueva. Al retomar: comprobar que una página vacía
  dispara `requestAnimationFrame` y repetir la e2e ×2.
- **Paridad llegó aprobada** justo al cortar: su informe y los diez bloques de texto están en
  `r10b-paridad-pendiente.md`. Al retomar: aplicarlos en `reportes.md`, borrar ese archivo,
  repetir la e2e ×2 y mergear como R10b.
