# Correcciones del slice 13b: revisiones

Salida de las revisiones sobre `7d34c5f..1e4e02b`. Backend (`backend-reviewer`): aprobado, sin
hallazgos. Seguridad (`security-auditor`): aprobado, sin hallazgos. Paridad (`parity-reviewer`, con
la aplicación levantada): aprobado, sin diferencias. Tests (`test-reviewer`): cambios requeridos,
un mayor y cuatro menores (T2 lo resolvió `1e4e02b`). Código (`clean-code-reviewer`): cambios
requeridos, un mayor y catorce menores. Frontend (`frontend-reviewer`, por lectura, después de que la primera
corrida se trabara): cambios requeridos, un mayor y un menor; acepta los seis desvíos de
`frontend-dev`. El team-lead acepta todo lo que sigue.

Antes de las revisiones: la suite e2e entera, 180 de 180 dos veces, y `timesheet-detail.spec.ts`
tres veces seguidas sobre `1e4e02b`.

## Código

| Origen | Hallazgo                                                                                                                                  | Resolución                                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1     | `entryChangesReducer` es la tercera copia del reducer de `cell-writes.ts` y `row-removals.ts`                                             | Un reducer genérico en `timesheet/pending-requests.ts` (`recordOf`, `sameSubject`), con `weekChanged` como extensión de `row-removals`. Los tres lo usan; sus tests existentes siguen sin cambios de afirmación. |
| C2     | La lista reimplementa `useDialogReturnFocus` (`listEmptied`, `listFocus`, `focusLater`)                                                   | `CellEntriesDialog` usa el hook con `cancelFocus` y `fallbackFocus`; el JSDoc del hook se generaliza.                                                                                                            |
| C3     | `useCellDetail` devuelve 22 miembros y `TimesheetView` usa tres                                                                           | Los destinos del foco (§5.6) a un módulo puro `cell-detail-focus.ts`; un tipo explícito con lo que consume la vista y el resto interno entre el hook y `CellDetailDialogs`.                                      |
| C4     | `editsEntry(...) && !CLOSING_CODES.includes(...)` dos veces                                                                               | `showsInEditor(failure, entry)`.                                                                                                                                                                                 |
| C5     | `list` junto a `mode: "list"`; `input` para `UpdateEntryChanges`; `returnTo` repite `origin`                                              | `listOpen`, `entryChanges` y `returnTo: EntryButton` solo con `origin === "list"`.                                                                                                                               |
| C6     | `FailurePlace`, `CellDetail` y `EntryChanger` exportados sin uso; `trigger: HTMLElement \| null` solo por un test                         | Sin `export`. `trigger` queda `HTMLElement \| null` con un comentario: sin disparador el foco va al destino de la celda. La unidad corre en `node`, sin DOM, y un estado inicial solo para el test sería peor.   |
| C7     | `cell-detail.test.tsx` reimplementa `changingOf` y `sendingEntriesOf`                                                                     | Los importa de `./entry-changes`.                                                                                                                                                                                |
| C8     | `TimesheetView` arbitra a mano los avisos de tres fuentes; `retryCell` y `retryDetail` iguales; el aviso del detalle repetido en la lista | `timesheet/timesheet-notices.tsx` con la región y «el más reciente gana», un `EntryChangeFeedback` común a la región y la lista, y `retryWithFocusOn(key, retry)`.                                               |
| C9     | `entryChangeFailureTitle` vive en el componente de la lista                                                                               | A `timesheet/labels.ts`; el encabezado del archivo pasa a una regla general.                                                                                                                                     |
| C10    | `openDetail` solo reenvía; `settleDetail` sin el porqué                                                                                   | `onMenu={cellDetail.open}`; el comentario de `settleDetail` explica el ciclo entre los dos hooks.                                                                                                                |
| C11    | `confirmRemove` no usa `outsideRows()`                                                                                                    | Lo usa.                                                                                                                                                                                                          |
| C12    | `regionRef` de `EntryDialog` ya no es la región; los comentarios de `onAdd` y `onStop` dicen algo que el código no hace                   | `fallbackFocus`; los comentarios dicen que la planilla no los pasa porque solo abre entradas cerradas.                                                                                                           |
| C13    | `save` y `remove` son el mismo `send`                                                                                                     | Reciben `{ cell, name, input }` y arman el `kind` (respeta los nombres de §5.4).                                                                                                                                 |
| C14    | `closeListButton` se cubre de una X que la lista no tiene                                                                                 | Sin `.first()` ni la oración del comentario.                                                                                                                                                                     |
| C15    | `feat(planilla)` en `a4317eb` y `cac0b5e`; el repositorio usa el módulo                                                                   | No se reescribe la historia de una rama compartida; los commits de la ronda usan `time-entry`.                                                                                                                   |

## Tests

| Origen | Hallazgo                                                                                                                      | Resolución                                                                                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | El recorrido 9 no comprueba que el foco vaya al título antes de que se vaya el aviso: llega igual por el efecto de la lista   | Retener la respuesta del reintento; con el pedido en vuelo, el aviso ya no está y el título tiene el foco; después soltar y afirmar que «a» salió. Mutante: `retryFromList` sin `titleRef.current?.focus()`.                                              |
| T2     | Nada probaba el `readOnly` del campo con un pedido del detalle en vuelo                                                       | Resuelto por `1e4e02b` (`aria-busy` en el recorrido 2).                                                                                                                                                                                                   |
| T3     | El test de «Reintentar» prueba un `retry` del arnés, no el del hook                                                           | El reenvío pasa a `entry-changes.ts` (`retryRequestOf(state)` o equivalente), lo usan el hook y el arnés, y se prueba ahí que reenvía el pedido de la falla y no el último.                                                                               |
| T4     | `cell-detail.test.tsx:163-165` pasa aunque el botón no exista                                                                 | Afirmar antes que el botón existe, como `cell-entries-dialog.test.tsx:133`.                                                                                                                                                                               |
| T5     | Comportamientos de la paridad y de §5.5/§5.6 sin test (cierre de la lista vacía, falla que baja a la pantalla, cancelaciones) | Tres recorridos: cancelar desde la lista el editor y la confirmación abierta desde el menú del editor; borrar las dos entradas desde la lista hasta que se cierre, con el foco en el campo; cerrar la lista con la falla a la vista y verla en la región. |

T5 deja sin test, por costo, «un aviso a la vez» entre las tres fuentes: lo cubre la unidad de
`timesheet-notices.tsx` que trae C8.

## Frontend

| Origen | Hallazgo                                                                                                                                                                                                                                      | Resolución                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1     | «Borrar» desde el menú del editor cierra sin bajar la falla que el editor mostraba: pasa a la pantalla o a la lista como recién llegada, baja los avisos de celda y fila, y con `unexpected` su «Reintentar» reescribe el borrador abandonado | Un solo punto baja la falla del editor en todo cierre que no sea `saved` ni `failed`. Un paso e2e: respuesta perdida, «Borrar» desde el menú del editor, cancelar, y la región sin el aviso. |
| F2     | «Reintentar» del aviso del detalle en la pantalla no repone el `PendingFocus` de la celda: si el reintento saca la fila, el foco cae a `body`                                                                                                 | Repone el `PendingFocus`. Un recorrido: borrado fallido de la única entrada de una fila del servidor, reintento desde la región, foco en «Añadir nueva fila».                                |

Los desvíos aceptados: `useCellDetail` y `CellDetailDialogs`; `entryChanger` puro; `entryCellKeyOf`
exportado; el editor con `canTrack` siempre verdadero (`forbidden` se ve en el editor y un
refresco no pasa el borrador a solo lectura); `pr-8` con el disparador absoluto; los mocks del
menú en `entry-dialog.test.tsx`.

## Confirmaciones

La segunda pasada de frontend y la confirmación de código, sobre `1e4e02b..29b1f38`, aprueban.
F4 (los tests de F1 y F2) lo cerró `a8042cd`. El usuario pidió aplicar los menores antes del
merge.

| Origen | Hallazgo                                                                                  | Resolución                                                             |
| ------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C16    | `showsInEditor` y `closesEditor` repiten «guardado de esta entrada»                       | `savesEntry(failure, entry)` y los dos encima.                         |
| C17    | Tres conversiones a mano del estado al tipo de foco                                       | Un `focusOf(state)` local, o `EditorFocus`/`ConfirmFocus` con `entry`. |
| C18    | La lista aplica dos veces el respaldo del foco                                            | `cancelFocus={lazyRef(places.trigger)}`.                               |
| C19    | Las fuentes de avisos listadas dos veces                                                  | `useLatestNotice` recorre `SOURCES`.                                   |
| C20    | `Entry` nombra un pedido pendiente en el reducer genérico                                 | `Pending` y `pending`.                                                 |
| F3     | El `PendingFocus` de F2 corre también en el «Reintentar» de la grilla, que no lo necesita | Solo en el del detalle.                                                |

## Cierre

Con la ronda final (`d657c3d`): lint, typecheck, Prettier, 1339 de unidad y 1236 de integración en
verde; la suite e2e entera, 185 de 185 dos veces, y `timesheet-detail.spec.ts` (14 recorridos)
tres veces seguidas, sin flaky; los 18 mutantes del spec caen.
