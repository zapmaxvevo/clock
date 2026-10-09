# Correcciones de R3b del núcleo de reportes: revisiones

R3b es la parte B del contrato
[`nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md`](nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md):
subgrupos de hasta tres niveles, el tope de 3000 filas y expandir. Sale de `main` en `d9ae701`,
con R3a.

Las revisiones corrieron sobre `d9ae701..5a61a9a` (backend, frontend, seguridad y código) y
`d9ae701..3007754` (tests y paridad); la paridad, contra la especificación de `e7c8bfe`.

| Revisión  | Agente                | Veredicto                                    |
| --------- | --------------------- | -------------------------------------------- |
| Backend   | `backend-reviewer`    | aprobado, sin hallazgos                      |
| Seguridad | `security-auditor`    | aprobado, sin hallazgos                      |
| Paridad   | `parity-reviewer`     | aprobado, sin hallazgos                      |
| Frontend  | `frontend-reviewer`   | aprobado, dos menores                        |
| Tests     | `test-reviewer`       | cambios requeridos: un mayor y tres menores  |
| Código    | `clean-code-reviewer` | cambios requeridos: un mayor y siete menores |

Lo que cada revisión aprobada verificó:

- **Backend**: la lectura nivel por nivel con `limit = presupuesto + 1`, sin leer más abajo
  con el nivel 1 vacío; el árbol colgado por el camino entero; las invariantes antes de
  abrir la transacción; todo en una sola transacción de solo lectura. Corrió cinco
  mutantes propios y cayeron todos.
- **Seguridad**: un member con una URL armada a mano no ve nada ajeno en ningún nivel ni en
  el total. `limit` y los cortes los arma el servidor. Un `subagrupar` patológico se
  rechaza rápido y no fuerza nada caro: probó 1,6 MB, repetidos y `__proto__`. Al cliente
  viaja solo lo que el actor puede ver.
- **Paridad**: recorrió la aplicación como owner y como member, a 1280 y 375 px:
  - seis combinaciones de niveles;
  - el intercambio de §5.2;
  - expandir con clic, Enter y Espacio;
  - todo contraído al cargar y en cada navegación;
  - la línea del tope, sembrando 8 personas × 365 días;
  - 26 URLs inválidas;
  - la membresía inactiva.

El team-lead acepta lo que sigue.

**Antes de las revisiones**

- Lint, typecheck, 1561 de unidad, 277 de `test:time-ar` y 1328 de integración.
- `reports.spec.ts`: 13 de 13, dos veces.
- Mutantes:
  - `test-engineer`: los 46 de §8.1 de la B, ninguno vivo ni declarado equivalente. Los de
    alcance (21a, 21a2 y 21b) también caen por valores sin la defensa de la fila sin padre.
  - `backend-dev`: 11 en el paso 6 y 16 en el paso 8.
  - `frontend-dev`: 32 de 32.
  - e2e: 8 de 8 en los recorridos 11 y 12.

**Medición (§6.3), en Postgres 18.6, con los datos de `seed.sql` de R3a.** Medianas de cinco
corridas:

| Consulta                                   | Medido   | Presupuesto |
| ------------------------------------------ | -------- | ----------- |
| Q11, nivel 1 (`[person]`)                  | 20,74 ms | 150         |
| Q12, `[person, project]`                   | 27,78 ms | 150         |
| Q13, `[person, project, date]`             | 74,33 ms | 250         |
| Q14, `[tag, project]`                      | 64,08 ms | 150         |
| Q15, `[person, project, date]` de uno      | 6,21 ms  | 40          |
| Q16, `[tag, project, date]`                | 77,42 ms | 250         |
| Persona → Proyecto → Fecha, pedido entero  | 127 ms   | 450         |
| Etiqueta → Proyecto → Fecha, pedido entero | 223 ms   | 600         |

En los dos pedidos enteros el tercer nivel del año no entra en el tope (54 211 y 46 032
filas): se muestran dos niveles con la línea del tope, como anticipa la nota 4 de §10. En
Q13 y Q16 el orden baja a disco (5 MB y 4 MB). No hace falta índice ni comprobación contra
Neon: no hay forma de parámetro nueva, y `limit` va como en `findById`.

**Peso (§6.4).** Con 3000 grupos en tres niveles:

| Medida                   | Medido | Comprimido | Presupuesto |
| ------------------------ | ------ | ---------- | ----------- |
| Payload RSC              | 278 KB | 18,5 KB    | 1 MB        |
| HTML de la primera carga | 352 KB | 20,6 KB    | 1,5 MB      |

La primera carga trae solo las 30 filas del nivel 1, contraídas. Abrir una tarda 94 ms.

## Decisiones del team-lead sobre la especificación

- **RP-13 pasa de `replicar` a `adaptar`.** Se expande con un botón con el chevrón, no con el
  número junto al grupo, y lo abierto no va en la URL.
- **Una navegación que no cambia la URL no vuelve a contraer.** Pasa con el enlace de la
  agrupación ya elegida, con el atajo del período que ya se ve o con «Aplicar» sin cambios.
  Es un desvío chico de D-R3-9, que se acepta. Queda en la 11.7 de `reportes.md`.
- **`withLevel` lanza si se pide un nivel nuevo con una dimensión que ya está arriba.** No
  hay con qué intercambiarla, y la interfaz no ofrece ese caso. Se suma a la tabla de §5.2:
  `persona` | `persona` como nivel 1 | lanza.
- **P-11, nueva, para el usuario.** La página de filtros de Clockify lista agrupar por
  descripción, mes y semana, y Clock no los tiene. Queda por decidir si entran en el núcleo,
  en la fase 3 o fuera de alcance.

## Backend (`backend-dev`)

| Origen | Hallazgo                                                                                                                                                                                                         | Resolución                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1     | **Mayor.** `getReportState` lleva adentro de la transacción la política del tope: el presupuesto, `budget + 1` y el corte. Además, `first.length > 0` está fijo en la cabecera del `for` (`service.ts:349-371`). | Una función con nombre, `readLevelsWithinLimit(…)`, que sale temprano con `[first]` si el nivel 1 está vacío. El `for` queda solo con `depth <= levelCount`. |
| C4     | El primer nivel por omisión, `"person"`, está escrito en `schema.ts:118` y en `service.ts:311`.                                                                                                                  | `DEFAULT_GROUP_BY` exportado desde `schema.ts`, usado en los dos lugares.                                                                                    |
| C5     | `ReportRequest.subgroups?` es opcional y el service repite `?? []`, aunque la página siempre manda un arreglo (`service.ts:67`, `:312`).                                                                         | `readonly subgroups: readonly ReportGroupBy[]` obligatorio, sin `?? []` en el service. El `?? []` va al helper `readyState` de los tests.                    |
| C8     | `labelOf` escribe «Sin tarea» y «Sin etiqueta» como literales (`service.integration.test.ts:1453`, `:1455`).                                                                                                     | `reportLabels.noTask` y `reportLabels.noTag`.                                                                                                                |
| T2     | `state.groups[0]?.children?.[0]?.children` da `undefined` también si falta el nivel 2, y mira solo el primer día (`service.integration.test.ts:1751`).                                                           | Afirmar sobre todos los días: cada uno con sus nueve hijos, y ninguno de ellos con `children`.                                                               |

## Frontend (`frontend-dev`)

| Origen | Hallazgo                                                                                                                                                                            | Resolución                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C2     | `ReportTreeRows` recibe `nested` aparte de `rows`, aunque sale de los mismos datos (`report-tree.tsx:24`, `:42-51`).                                                                | Calcularlo de `rows` y quitar la prop y sus usos en los tests.                                                                                                                                                                                                                                                                      |
| C3     | `report-row.tsx` no tiene ninguna fila: tiene `GroupHeading` y `durationLabel`.                                                                                                     | Renombrarlo a `group-heading.tsx`.                                                                                                                                                                                                                                                                                                  |
| F1     | El JSDoc de `withLevel` no dice que lanza con una dimensión nueva que ya está arriba (`grouping-model.ts:18-23`).                                                                   | Sumarlo al JSDoc. La tabla de §5.2 queda completada en este documento.                                                                                                                                                                                                                                                              |
| F2     | El botón de expandir no cambia al pasar el mouse, y su anillo de foco es más tenue que el del otro botón propio del proyecto (`report-tree.tsx:97`).                                | `focus-visible:ring-ring focus-visible:outline-none hover:bg-muted`, como `entry-row.tsx:261`.                                                                                                                                                                                                                                      |
| T3     | `report-tree.test.tsx` afirma clases de Tailwind (`pl-6`, `pl-12`, `size-4 shrink-0`) y el marcado exacto de `GroupHeading` (`:84-93`, `:112`; también `report-view.test.tsx:349`). | Conservar lo observable: el `aria-hidden` del lugar del chevrón, que no haya botón y el texto. La sangría se compara entre niveles por la presencia de una clase de sangría, sin fijar cuál. En el caso de un nivel, el texto y que no haya botón ni lugar del chevrón. Se quita la línea redundante de `report-view.test.tsx:349`. |
| T4     | Las claves abiertas se arman a mano con el separador `/`, que el contrato no fija (`report-tree-model.test.ts:41-44`, `report-tree.test.tsx:57`).                                   | Tomarlas de la salida de `visibleRows`. Se conservan las afirmaciones de unicidad y de que una hoja no se abre.                                                                                                                                                                                                                     |

## e2e (`e2e-tester`)

| Origen | Hallazgo                                                                                                                                                                                                                                                                                                                                                       | Resolución                                                                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | **Mayor.** `pickSubgroup` afirma el foco apenas se cierra el popover, sobre un localizador que acepta cualquier elección, antes de que llegue la pantalla nueva (`e2e/reports.spec.ts:146`, llamadas en `:787`, `:810`, `:900` y `:913`). Un cambio que pierda el foco al llegar la respuesta, como un `key` en el `Suspense` de `page.tsx`, cae solo a veces. | `pickSubgroup` recibe los subniveles esperados y llama a `expectSubgroups` antes de afirmar `toBeFocused()`. La afirmación va sobre el botón con el nombre exacto: `levelChoice(level, elegido)` con `exact: true`. Correr ese mutante y confirmar que cae. |
| C6     | `expandButton` repite la expresión regular de `groupRow` (`e2e/reports-page.ts:338-341`, `:299`).                                                                                                                                                                                                                                                              | Una `leadingName(name)` común.                                                                                                                                                                                                                              |
| C7     | `levelChoice` y `subgroupLink` repiten `groupBy === null ? NO_LEVEL : GROUP_LINK[groupBy]` (`e2e/reports-page.ts:440`, `:467`).                                                                                                                                                                                                                                | Una `levelOptionLabel(groupBy)` común.                                                                                                                                                                                                                      |

## Integración (`test-engineer`)

| Origen  | Hallazgo                                                                                                                                                                                       | Resolución               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| S, nota | El paso 11 de §7 nombra `agrupar=etiqueta&subagrupar=persona,fecha`, y esa combinación no está en `linkedTrees` (`scope.integration.test.ts:959-962`). Seguridad la verificó solo en su copia. | Sumarla a `linkedTrees`. |

## Fuera de R3b

- **Navegación del shell a 375 px**: desborda a lo ancho, y ya está en la deuda.
- **Bases de test compartidas**: el team-lead le asignó a seguridad la base de
  `test-engineer`, y los `truncate` cruzados tiraron fallas `23503` en cuatro mutantes. Se
  repitió todo sobre `clock_test_engineer_r3b`. La regla quedó en la memoria del proyecto:
  cada agente que corre integración lleva su propia base.

## Lo que sigue

1. Ronda de correcciones: cada dueño commitea lo suyo con `git commit -- <rutas>`.
2. Corrida final: lint, typecheck, `npm run test:all` y la suite e2e entera dos veces.
3. Merge de R3b a `main`, push y CI.
