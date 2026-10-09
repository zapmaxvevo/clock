# Correcciones de R4a del núcleo de reportes: revisiones

R4a es la parte A del contrato [`nucleo-reportes-r4-filtros.md`](nucleo-reportes-r4-filtros.md):
los filtros de cliente y de proyecto, con «Sin proyecto», los archivados y el segundo vacío.
Sale de `main` en `be55db3`, en la rama `nucleo/r4a`.

Las seis revisiones corrieron sobre `be55db3..b8320f3`; la paridad, contra la especificación de
`be55db3`.

| Revisión  | Agente                | Veredicto                               |
| --------- | --------------------- | --------------------------------------- |
| Backend   | `backend-reviewer`    | aprobado, tres notas                    |
| Seguridad | `security-auditor`    | aprobado, dos notas                     |
| Paridad   | `parity-reviewer`     | aprobado, tres notas                    |
| Tests     | `test-reviewer`       | aprobado, dos menores y tres notas      |
| Código    | `clean-code-reviewer` | aprobado, siete menores y cuatro notas  |
| Frontend  | `frontend-reviewer`   | cambios requeridos: un mayor y un menor |

Lo que cada revisión aprobada verificó:

- **Backend**: los filtros en la subconsulta por entrada de cada nivel y en `entryTotals`, junto
  a `inScope` y sin reemplazarlo; el tope de 3000 cuenta lo filtrado; las guardas y la
  invariante antes de la transacción; el catálogo primero dentro de la transacción
  `repeatable read`, llamado por el objeto del repository. Reprodujo la medición de §6.2 en
  Postgres 18 (pedido entero ~43 ms, presupuesto 500; sin índices nuevos, sin arreglos nuevos
  como parámetro).
- **Seguridad**: ningún id de la URL llega a la base sin cruzarse con su catálogo; un member con
  `clientes` o `proyectos` armados a mano no ve horas ni nombres ajenos; sin `report.view` no se
  lee ningún catálogo; `filterOptions` lleva solo los campos del contrato.
- **Paridad**: recorrió la pantalla como member y admin con Playwright: la barra, el panel con
  teclado, la búsqueda sin mayúsculas ni acentos, «Aplicar», Esc, el tope de 50 con «Sin
  proyecto», los archivados, los once enlaces que conservan los filtros, el segundo vacío,
  recargar y «Atrás», y las URLs inválidas de RP-32 y RP-34.
- **Tests**: cada criterio de 1 a 13 con su test; los mutantes de §8.1 que revisó caen.

## Desvíos aceptados durante la implementación

- **«Nada coincide con la búsqueda.»** (`frontend-dev`): §5.3 lo pide «si los dos grupos quedan
  vacíos», lo que en proyectos no pasa nunca porque «Sin proyecto» no se filtra. Sale cuando la
  búsqueda no deja ninguna opción buscable.
- **El nombre accesible de cada casilla** es solo el del proyecto; el cliente va por
  `aria-describedby`.
- **`.readonly()` en las listas de `reportReadyState.filters`** (`backend-dev`): sin eso el
  estado no admite un `ReportFilters`. En B, `people` lleva también `.readonly()`.

## Los dos mutantes equivalentes

- **El `exists` sin `filter_project.workspace_id`**, como lo declara el contrato:
  `time_entry_project_fk` es `(workspace_id, project_id) → project(workspace_id, id)` y
  `project_client_fk` ata el cliente al mismo workspace. `backend-reviewer` comparó la lectura
  original y la mutada con `except` en los dos sentidos: 0 diferencias.
- **«`entry_project` en lugar de un alias propio»**: §8.1 predice que «choca o duplica», y no:
  el alias de la subconsulta del `exists` tapa al de afuera y un semi-join no multiplica filas.
  Confirmado por `backend-dev`, `test-reviewer` y `backend-reviewer` (0 diferencias con
  `except`). La variante peligrosa, leer `entry_project.client_id` del join de la dimensión sin
  subconsulta propia, cae («missing FROM-clause entry»). Para R4b la fila de §8.1 se lee así.

## Frontend (`frontend-dev`)

| Origen | Hallazgo                                                                                                                                                                                                | Resolución                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1     | **Mayor.** El botón del filtro no trunca lo elegido (`whitespace-nowrap shrink-0` de `buttonVariants`): con un nombre largo mide 745 px y la página pasa a 769 px a 320 px (`filter-picker.tsx:89-94`). | `max-w-full` en el botón y el texto en `<span className="truncate">`, con `min-w-0` en los contenedores flex de la barra si hace falta; el nombre accesible sigue entero. Medir a 320 y 375 px con un nombre de 100 caracteres. |
| F2     | «Quitar filtros» se ve como texto gris: `buttonVariants` sin `cn` deja el borde transparente y el enlace hereda `text-muted-foreground` (`report-view.tsx:111-121`).                                    | `cn(buttonVariants({ variant: "outline", size: "sm" }), …)` y el gris pasa al `<p>`. Junto con C6: un solo `<tr><td>` en `EmptyRow`.                                                                                            |
| F3     | Con el catálogo vacío o sin opciones buscables, una búsqueda escrita no muestra «Nada coincide con la búsqueda.» (`filter-picker.tsx:147-150`).                                                         | El mensaje sale cuando hay búsqueda escrita y no queda ninguna opción buscable visible. Va en una función pura `hasNoMatches` de `filter-model.ts` con su test (C4). Sin búsqueda y con el catálogo vacío no se agrega texto.   |
| F4     | El popover es un `role="dialog"` sin nombre accesible (`filter-picker.tsx:95`).                                                                                                                         | `aria-label` con el nombre del filtro en el `PopoverContent` del filtro. Los de período y subnivel quedan como deuda.                                                                                                           |
| F5     | D-R4-8 dice «tachado» para todo el grupo de aparte; §5.3 lo limita a personas.                                                                                                                          | Vale §5.3: los archivados no se tachan; las inactivas de B, sí. Sin cambio de código.                                                                                                                                           |
| —      | El borde invisible de las flechas y «Esta semana» (`buttonVariants` sin `cn`, `report-toolbar.tsx:50,59,76`), anterior a R4a.                                                                           | Deuda.                                                                                                                                                                                                                          |

## Código (`backend-dev` y `frontend-dev`)

| Origen | Hallazgo                                                                                                                                                                                                               | Resolución                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1     | `filterOptionsOf` privada del service tiene el nombre de la exportada de `filter-model.ts` (`service.ts:274`).                                                                                                         | Backend la renombra `toFilterOptions`.                                                                                                                                           |
| C2     | `ReportClientOption` y `ReportProjectOption` exportados y sin uso (`schema.ts:410-411`).                                                                                                                               | Backend los borra.                                                                                                                                                               |
| C3     | «ids + 1 si `sin-proyecto`» escrito tres veces (`schema.ts:284`, `service.ts:231`, `repository.ts:477`), y `checkEntryRead` con dos ramas casi iguales.                                                                | Backend: `projectFilterCount(projects, withoutProject)` en `schema.ts`, usado por los tres.                                                                                      |
| C4     | El vacío de búsqueda lo calcula el componente (`filter-picker.tsx:147-150`).                                                                                                                                           | Frontend: `hasNoMatches` en `filter-model.ts`, con F3.                                                                                                                           |
| C5     | `listAllProjects` copia `listActiveProjects` salvo `archivedAt` (`project/repository.ts:266`).                                                                                                                         | Backend: un privado común con el `where` como parámetro.                                                                                                                         |
| C6     | `EmptyRow` repite el `<tr><td>` (`report-view.tsx:99-117`).                                                                                                                                                            | Frontend, con F2.                                                                                                                                                                |
| C7     | e2e: `people` en `ReportUrlFilters`/`FILTER_PARAMS` es de B; `searchBox` y `filterSearch` repiten el localizador; `projectIdOf`/`clientIdOf` releen lo que `seedProject` insertó y `selectOneId` copia `insertOneRow`. | `e2e-tester`: saca `people` (lo suma B), une los localizadores y comparte un helper de «una sola fila» entre `selectOneId` e `insertOneRow`. `seedProject` no cambia su retorno. |
| C8     | `toClientView` se calcula dos veces por cliente (`project/service.ts`).                                                                                                                                                | Backend: las vistas una vez.                                                                                                                                                     |
| C9     | Ciclo solo de tipos entre `labels.ts` y `filter-model.ts` por `FilterKind`.                                                                                                                                            | Sin cambio.                                                                                                                                                                      |
| C10    | El punto de color del proyecto es la sexta copia.                                                                                                                                                                      | Deuda: `ProjectColorDot` en `project/components`.                                                                                                                                |
| C11    | `getReportState` pasa de 94 a 106 líneas.                                                                                                                                                                              | Backend lo hace al empezar R4b (paso 6): el cuerpo de la transacción a `readReport(tx, …)`, antes de sumar `narrowedTo`.                                                         |

## Backend (`backend-dev`)

| Origen | Hallazgo                                                                                                                                                   | Resolución                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| B1     | `.readonly()` en `filters`.                                                                                                                                | Aceptado (arriba).                                                                                     |
| B2     | `clientOf` lanza si un proyecto apunta a un cliente fuera de la foto; no puede pasar con `repeatable read`, sí con un llamador futuro en `read committed`. | JSDoc de `getProjectFilterCatalog` con la precondición: pide la foto `repeatable read` de quien llama. |
| S2     | `split(",")` sin tope de largo en la cadena (`schema.ts:185-203`); lo acota el límite de cabeceras.                                                        | Sin cambio.                                                                                            |
| S1     | `npm audit` completo con altas de desarrollo.                                                                                                              | Decisión del 2026-10-09: se toleran; CI audita producción.                                             |

## Tests (`e2e-tester` y `test-engineer`)

| Origen | Hallazgo                                                                                                                                                     | Resolución                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | Nada prueba que la barra pase los filtros al selector de período y al de subnivel: con `NO_REPORT_FILTERS` en esas props pasan los 158 tests de componentes. | `e2e-tester`, recorrido 13: con filtros puestos, elegir un subnivel y un atajo de período y afirmar que la URL y la pantalla los conservan. |
| T2     | Nada prueba que el panel vuelva a lo del estado al reabrirse sin aplicar: la reapertura viene después de un `reload`.                                        | `e2e-tester`, recorrido 13: tildar, Esc, reabrir y afirmar lo del estado.                                                                   |
| T3     | «La fila esparcida» es equivalente hoy (las vistas tienen los campos de la opción) y «el color sin estrechar» cae por typecheck y por el check de la base.   | Registrado; sin test nuevo.                                                                                                                 |
| T4     | Los recorridos 13 y 14 no afirman la línea del alcance propio.                                                                                               | `e2e-tester`: `SCOPE_SELF` después del primer `openReport`.                                                                                 |
| T5     | Nada prueba que un filtro nuevo contraiga el árbol (D-R4-10).                                                                                                | Registrado.                                                                                                                                 |
| F6     | El comentario de `filterOption` (`e2e/reports-page.ts:686`) dice que el nombre sigue con el cliente.                                                         | `e2e-tester` lo corrige.                                                                                                                    |

## Paridad

Las tres notas (catálogo vacío sin texto, el desvío de «Nada coincide», el desborde de la
navegación del shell, anterior a R4a) van en el texto de `reportes.md`, §12.3 y §12.4, que
aplica el team-lead antes del merge, ajustado a F1 y F3.

## Cierre

Ronda de correcciones: frontend `5ea2942`, e2e `6bf535e` y backend `4c039e2`, sin cambios de
comportamiento en backend. Segunda pasada de `frontend-reviewer` sobre `5ea2942`: aprobado, con
`scrollWidth` de 531 px a 320 y 375 px con un proyecto y un cliente de 100 caracteres elegidos (el
ancho de la navegación del shell, anterior a R4a). `e2e-tester` probó que los recorridos nuevos
de T1 caen con los filtros vacíos en las props de `RangePicker` y de `SubgroupPicker`.
`test-engineer` corrió 71 mutantes de §8.1: caen 69 y los dos equivalentes dan diff 0 contra la
respuesta entera de `getReportState` con 9 actores, 19 filtros y 8 formas. Texto de paridad
aplicado en `64216b1`, ajustado a F1, F3 y F4.

Corrida final sobre `4c039e2` con una base de e2e nueva: lint, typecheck, 1629 de unidad, 277 de
`test:time-ar`, 1374 de integración; recorridos 13 y 14 tres veces en verde; suite completa
199/199 una vez y 198/199 dos veces por `e2e/tracker.spec.ts:477` («lo tecleado con el foco
puesto sobrevive a una revalidación»), que se corta esperando la respuesta del blur (`:510`). No
es de R4a: R4a no toca el rastreador, y con el código de `main` (`be55db3`) el mismo test falló 6
de 10. Queda como deuda abierta. Sin comprobación contra Neon (D-R4-11). Mergeado en `cd77a5b`.
