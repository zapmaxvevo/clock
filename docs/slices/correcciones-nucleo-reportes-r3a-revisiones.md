# Correcciones de R3a del núcleo de reportes: revisiones

R3a es la parte A del contrato
[`nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md`](nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md):
tarea y etiqueta en un nivel. El team-lead partió el slice (pregunta 1 de §10); la parte B
sigue como R3b desde el paso 6.

Las revisiones corrieron sobre `85eb968..30eefa9`, en la rama `nucleo/r3a-tarea-etiqueta`, y
la paridad sobre `4819a62`. Veredictos:

- **Seguridad** (`security-auditor`): aprobado, sin hallazgos de R3a. Verificó el paso 11 de
  §7: el alcance va solo por `inScope` en `totalsByLevels` y `entryTotals`, y la transacción no
  se abre sin `report.view`. Con un sondeo propio de dos workspaces y URLs armadas a mano, un
  member no ve nada ajeno en ningún grupo ni en el total. No hay caché que cruce personas.
- **Backend** (`backend-reviewer`): aprobado, dos menores.
- **Frontend** (`frontend-reviewer`): aprobado, un menor.
- **Tests** (`test-reviewer`): aprobado, dos menores.
- **Código** (`clean-code-reviewer`): cambios requeridos, un mayor y doce menores, ninguno de
  comportamiento.
- **Paridad** (`parity-reviewer`, con la aplicación levantada como owner y como member, a 1280 y
  375 px): aprobado, sin hallazgos. Cumple RP-11, RP-12, RP-18, RP-28, RP-29 y la sección 11.

El team-lead acepta lo que sigue.

**Antes de las revisiones**

- Lint, typecheck, 1500 de unidad, 277 de `test:time-ar` y 1302 de integración.
- `reports.spec.ts`: 11 de 11, dos veces.
- Mutantes:
  - `test-engineer`: 56 de 58 de §8.1. Los dos vivos son equivalentes (abajo).
  - `backend-dev`: 29 de los criterios 2 a 8 y 6 de tipos del criterio 10.
  - `frontend-dev`: 16 de 16.
  - e2e: 6 de 6 en el recorrido 10.

**Medición (§6.2), en Postgres 18.6, la versión de Neon.** Datos de `seed.sql` con etiquetas:
188 160 entradas cerradas y 169 534 filas de `time_entry_tag`. Medianas de cinco corridas, en
ms:

| Consulta | Medido | Presupuesto |
| -------- | -----: | ----------: |
| Q1       |   0,77 |          15 |
| Q2       |  21,37 |         150 |
| Q3       |   1,01 |          30 |
| Q4       |   0,62 |  sin cambio |
| Q5       |  54,86 |         150 |
| Q6       |   1,49 |          30 |
| Q7       |  23,52 |         150 |
| Q8       |  21,04 |         150 |
| Q9       |  58,31 |         150 |
| Q10      |  19,42 |         150 |

El pedido entero por etiqueta (Q9 + Q10) suma unos 78 ms. No hace falta índice nuevo.

Q5 cambió de plan respecto de R2b: pasó de 42,75 ms a 54,86 ms con los mismos datos. La
subconsulta lleva ahora `workspace_id` en la clave de la agregación, como fija §4.3, y la fila
crece de 21 a 37 bytes. Además, el planificador estima mal los grupos de `width_bucket`: espera
54 091 y son 262. Con eso elige ordenar y agrupar (`Sort` + `GroupAggregate`) en lugar de
`HashAggregate`, y el orden baja a disco (3,1 MB con el `work_mem` por omisión de 4 MB). Queda
dentro del presupuesto. Responde a B2.

**Comprobación contra Neon:** no hace falta. No hay forma de parámetro nueva: los cortes van en
un solo parámetro, como en R2b, y el `begin … read only` es SQL fijo. Lo confirmaron
`architecture-reviewer` y `backend-reviewer`.

## Mutantes equivalentes

- **2d, la membresía con `left join`.** §8.1 lo daba por caído en typecheck, y no cae: la
  selección por nivel declara `status` con `sql<MembershipStatus>`, que no se vuelve nulable.
  En ejecución es equivalente, porque `time_entry_membership_fk` (`schema.ts:477-481`) no deja
  una entrada sin membresía. `test-engineer` lo probó con un sondeo diferencial: 10 actores × 7
  agrupaciones, rangos inválidos, lecturas de 1 a 3 niveles e inserciones que las claves
  rechazan. La salida es idéntica a la base, y los controles 9a, 2a, 4b y 9d sí la cambian.
  Hacer que caiga en typecheck complicaría la selección dinámica sin efecto en ejecución: se
  acepta así.
- **EQ, la unión de `time_entry_tag` solo por `time_entry_id`.** Es el que declara el contrato,
  y quedó confirmado. Una etiqueta de B en una entrada de A falla con 23503
  (`time_entry_tag_entry_fk`).
- **El proyecto de la tarea tomado de otra unión.** Cae en el criterio 8, por la fila
  Omega → App → «Sin tarea». Con tarea no nula es equivalente, porque `time_entry_task_fk`
  (`schema.ts:455-461`) obliga a que la tarea sea del proyecto de la entrada.

## Backend (`backend-dev`)

| Origen  | Hallazgo                                                                                                                                                                                                                                              | Resolución                                                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 = B1 | **Mayor.** `dimension()` devuelve `spec as unknown as Dimension` (`repository.ts:186-188`), la única doble aserción de producción en `src/`. Sobra: `groupOf` es una propiedad con tipo de flecha, y por eso su parámetro es contravariante.          | `groupOf` con sintaxis de método en `Dimension`; `dimension()` devuelve `spec` sin cast. El `as ShownValues<Shown>` de `:503` queda, con su comentario. Confirmar con `npm run typecheck`. |
| C2      | La selección de afuera usa `keyName(index)` y la lectura usa `row[name]`: valen lo mismo, pero esa coincidencia queda escondida (`repository.ts:484`).                                                                                                | `levels.map(({ dimension, name }) => [name, …])`, sin `index`.                                                                                                                             |
| C3      | Un objeto temporal solo para `withSeconds` (`repository.ts:506-509`).                                                                                                                                                                                 | `secondsOf` directo sobre cada campo.                                                                                                                                                      |
| C4      | `projectOf` (`service.ts:77-79`) repite `StoredProject` y `ReportRead.totals` (`:204`) repite `EntryTotals`.                                                                                                                                          | Exportar `StoredProject` del repository (o derivarlo de `LevelGroupRow`) e importar `EntryTotals`.                                                                                         |
| C5      | `z.object({ id: z.uuid(), name: z.string() }).nullable()` cuatro veces y el proyecto con color dos (`schema.ts:129-164`).                                                                                                                             | `reportNamedRef` y `reportProjectRef`, usados en los cinco grupos.                                                                                                                         |
| C9      | El segundo `seedExact` duplica el de «la medida», y el loop sobre `time_entry_tag` repite `seedTimeEntry` (`service.integration.test.ts:1056-1076`, `:296-308`).                                                                                      | Un solo `seedExact` a nivel de archivo, con `{ projectId, taskId, tagIds }` opcional y las etiquetas por `seedTimeEntry`.                                                                  |
| C11     | «lee tarea y etiqueta» es un subconjunto del test siguiente y compara una constante consigo misma (`schema.test.ts:182-196`).                                                                                                                         | Se quita. El viaje de ida y vuelta lo cubre «lee lo que escribe REPORT_GROUP_PARAMS».                                                                                                      |
| T1      | En el empate con «Sin tarea», todas las tareas se llaman con nombres anteriores a «Sin tarea». Así sobrevive el mutante `group.task ?? { id: "", name: "Sin tarea" }`, que ordena por nombre (`service.integration.test.ts:875`, `:879`, `:946-950`). | La tarea T2 pasa a llamarse con un nombre posterior a «Sin tarea» (por ejemplo «Validación»), con las filas esperadas de `:931` al día. Correr ese mutante y confirmar que cae.            |
| T2      | `unordered` compara con `JSON.stringify`, que depende del orden de las claves del objeto: invertir `kind` y `tag` en `groupOf` rompe dos tests del criterio 8 sin cambiar el comportamiento (`service.integration.test.ts:1231-1233`).                | Comparar sin depender del orden de las claves: `toHaveLength` más `arrayContaining`, u ordenar por una clave calculada y usar `toEqual`. Los mutantes 8b siguen cayendo.                   |

## Frontend (`frontend-dev`)

| Origen  | Hallazgo                                                                                                                                           | Resolución                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| F1, C12 | El comentario de `ReportToolbar` (`report-toolbar.tsx:20-22`) tiene una línea cortada a la mitad, y «seis enlaces» va a quedar viejo con la B.     | Rehacer el párrafo para que cada línea llegue al ancho, sin la cuenta.                                              |
| C6      | `ClientHeading` y `TagHeading` son iguales salvo el rótulo, y el `<span>` gris de cada «Sin …» se repite cuatro veces (`report-view.tsx:161-211`). | Un `NamedHeading({ named, emptyLabel })` para cliente y etiqueta, y un `EmptyGroupHeading` para los cuatro «Sin …». |

## e2e (`e2e-tester`)

| Origen | Hallazgo                                                                                                       | Resolución                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| C7     | `updateOneRow` repite el chequeo de `rowCount` y el mensaje de `updateOne` (`e2e/database.ts:430-439`).        | `updateOne` como `withDatabase((client) => updateOneRow(client, sql, values))`, junto a `insertOneRow`. |
| C8     | `taskRow` repite el cuerpo de `groupRow` y solo cambia cómo compara el nombre (`e2e/reports-page.ts:281-298`). | Un `rowByHeader(page, name)` privado que usen `groupRow` y `taskRow`.                                   |
| C12    | `e2e/reports.spec.ts:77` tiene una línea de comentario de más de 110 columnas.                                 | Recortarla a 80.                                                                                        |

## Integración (`test-engineer`)

| Origen | Hallazgo                                                                                                                            | Resolución                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C10    | `WorkspaceB.tagGId` se escribe y nunca se lee (`scope.integration.test.ts:130`, `:226`); el id ya está en `b.places.member.tagIds`. | Quitar el campo y su asignación. |

## Fuera de R3a

- **C13**, la tercera copia de `type Executor = Transaction | typeof db` (`report`, `project`
  y `time-entry`): pasa a deuda. Va a `src/server/db/index.ts` en un cambio de mantenimiento,
  porque `src/server/db/` está en «Lo que no toca nadie».
- **S1**: `npm audit --audit-level=high` da 9 altas y 6 moderadas, todas de dependencias de
  desarrollo (`braces` por `micromatch`, `fast-glob`, `shadcn` y `eslint-config-next`). Con
  `--omit=dev` no queda ninguna alta. Es preexistente y lo decide el usuario, porque el CI de
  seguridad es suyo.
- **Paridad**: a 375 px la página se desplaza a lo ancho (531 px) por la navegación del shell.
  Ya está en la deuda; el reporte entra en el ancho.

## Lo que sigue

1. Ronda de correcciones: cada dueño commitea lo suyo con `git commit -- <rutas>`.
2. Corrida final: lint, typecheck, `npm run test:all`, `reports.spec.ts` y la suite e2e
   entera.
3. Merge de R3a a `main` y push. Después, R3b desde el paso 6 del contrato.

## Cierre

Ronda de correcciones, con cada hallazgo resuelto como dice su fila:

| Dueño         | Commit    | Hallazgos                            |
| ------------- | --------- | ------------------------------------ |
| backend       | `feab6e1` | C1, C2, C3, C4, C5, C9, C11, T1 y T2 |
| frontend      | `3c1ed13` | F1/C12 y C6                          |
| e2e           | `04132fa` | C7, C8 y C12                         |
| test-engineer | `b92f724` | C10                                  |

En C9, los instantes con microsegundos se reescriben con un `update` después de
`seedTimeEntry`, porque un `Date` de JS no los guarda. Con T1, el mutante
`group.task ?? { id: "", name: "Sin tarea" }` ahora cae. Con T2, invertir las
claves de `groupOf` no rompe ningún test y los mutantes 8b siguen cayendo. Los
29 mutantes de los criterios 2 a 8 se volvieron a correr sobre el código
refactorizado y caen todos.

Corrida final sobre `feab6e1`:

- lint y typecheck limpios;
- 1499 de unidad (una menos por C11), 277 de `test:time-ar` y 1302 de
  integración, en Postgres 18;
- la suite e2e entera, 195 de 195, dos veces sobre la base nueva
  `clock_e2er3final`, sin fallas ni tests intermitentes.

Mergeado a `main`.
