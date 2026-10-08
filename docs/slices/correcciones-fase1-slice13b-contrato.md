# Correcciones del slice 13b: revisión del contrato, ronda 1

Salida de la ronda 1 de `architecture-reviewer` sobre
[`fase1-slice13b-detalle-de-celda.md`](fase1-slice13b-detalle-de-celda.md). Veredicto:
**aprobado con cambios**, con tres hallazgos mayores (A1 … A3), seis menores (A4 … A9) y cuatro
notas (A10 … A13). D13b-1, D13b-3, D13b-4, D13b-6 y D13b-7 quedan aprobadas; D13b-2 y D13b-5,
con A1 y A6. No hay esquema, ni migración, ni acción nueva, ni ADR nuevo. El team-lead acepta
todos los hallazgos y fija el destino del foco de A2.

## Hallazgos

- **A1 (mayor). La lista habilitaba «Editar» antes de la foto, y el editor viejo podía revertir un
  guardado.** Aceptado tal cual. §5.4 suma `changingEntriesOf` (`sending` más `settled`), que
  miran «Editar» y «Borrar» de la lista; `sendingEntriesOf` queda solo para el `pending` del
  editor, y el hook devuelve los dos. §5.2 lo explica con la cadena `changesOf` →
  `editedFields`. D13b-5 dice que la regla vale para la lista. Criterios 4 y 6, y el mutante
  «`changingEntriesOf` solo con `sending`» en la fila del criterio 4.
- **A2 (mayor). El foco se perdía cuando se iba la última entrada de una fila del servidor.** El
  destino es el de «Quitar fila», `focusOutsideRows`. §5.6 define «el destino de la celda»: el
  foco va al campo al cerrarse, y un `PendingFocus` de tipo celda se consume en el primer dibujo
  en que la celda deja de estar `pending` o de dibujarse; si el campo está, a él, y si no,
  `focusOutsideRows`. La tabla de §5.6 usa ese destino en las filas que antes decían «al campo
  de la celda». §5.7 y §1 (TS-35, TS-115) lo nombran. El recorrido 2 siembra otra entrada de P
  el jueves (sembrada en el 1) y suma la fila de R que sale con el foco en «Añadir nueva fila».
  El recorrido 5 afirma el foco.
- **A3 (mayor). `e2e/timesheet.spec.ts:603-609` se rompía sin estar listado.** §1 lo lista
  (Tab al menú y otro Tab a la X, con el comentario de `:603-604`), con `tests-slice13b` de
  dueño. §6 suma el archivo a su reparto, y «Lo que no toca nadie» lo exceptúa. El criterio 8
  dice «salvo las de §1».
- **A4 (menor). El foco al asentarse un guardado dependía de que el editor siguiera abierto.**
  Las filas de §5.6 dicen «si sigue abierto». §5.2 dice que el editor se puede cerrar con el
  pedido en vuelo (`entry-dialog.tsx:154-167`) y deja explícito el reparto: cerrarlo con la
  falla a la vista la baja, y cerrarlo con el pedido en vuelo manda la falla a la pantalla.
- **A5 (menor). «Un aviso a la vez» y la falla del editor.** §5.5: la regla es solo de la
  pantalla. La falla que se ve en el editor no baja otros avisos ni la bajan ellos. Entre dos
  fallas del detalle gana la más reciente (`failed`, que §5.4 ahora dice que reemplaza).
- **A6 (menor). La lista que se cerraba vacía se llevaba el editor anidado.** §5.2 dice que la
  lista se cierra vacía solo sin nada anidado abierto, y suma «El árbol». En TS-42, el editor y
  la confirmación son hijos del `Dialog` de la lista; en TS-41 van sueltos. Los ítems llevan
  `key` por id.
- **A7 (menor). Recorridos no deterministas.** El 1, el 2 y el 6 siembran otra entrada de la
  fila en otro día, y la introducción de los recorridos dice por qué. En el 7, la celda ya tiene
  una entrada. En el 4, «a» y «b» se siembran como al empezar el 3.
- **A8 (menor). El caso de TS-76 no probaba nada con `entries: []`.** El estado de
  `timesheet-view.test.tsx` trae las dos entradas del 30/09 de Web: Diseño (§1). El párrafo de
  TS-76 de §7 suma el caso positivo y el mutante «el menú sin mirar `canTrack`».
- **A9 (menor). La forma de los textos.** La tabla de §5.8 deja en `timesheetLabels` solo
  `editEntry` y `showDetail`. Pasan a funciones exportadas `cellActionsLabel`,
  `cellDetailTitle`, `editEntryLabel`, `deleteEntryLabel` y `entryChangeName`.
- **A10 (nota).** §4.2: la variable local `entries` de `getTimesheetState`
  (`service.ts:2487-2490`) cambia de nombre.
- **A11 (nota).** §0: `main` en `8181f79`. Entre `4a97625` y ese commit solo cambian
  `estado-fase1.md` y `nucleo-reportes-mapa.md`. R1 no está en `main` y no toca el reparto.
- **A12 (nota).** §4.1: el comentario de `serverNow` dice que lo pide el tipo, con las citas en
  la viñeta de abajo.
- **A13 (nota).** §8 anota la entrada que se mueve a otra fila. §5.1 suma
  `disabled={cell.pending}` en los ítems del menú (`entry-row.tsx:414-427`).
- **Nota de D13b-1 sobre TS-41.** Queda en §6, `parity-analyst`, como pedido explícito: evaluar
  pasar TS-41 de `replicar` a `adaptar`.

## Además, sin hallazgo

- **Sale de §8 «El foco de una celda que deja de escribirse».** Con el destino de A2, la celda
  que pasa a ser texto se trata como la que no se dibuja, y el foco va a `focusOutsideRows`.
- **La tabla de §5.6 separa el cierre por `CLOSING_CODES` según de dónde se abrió el editor.**
  Desde el menú, el foco va al destino de la celda. Desde la lista, va al título de la lista,
  porque la lista modal sigue abierta debajo y el foco no puede salir de ella. Si la lista queda
  vacía, se cierra y aplica su propia fila.

## Ronda 2

Salida de la ronda 2 de `architecture-reviewer` sobre las correcciones de la ronda 1 (`d0f2b9a`).
Veredicto: **aprobado con cambios**. A1 … A13 quedan resueltos y los tres desvíos de arriba,
aprobados. Hay un hallazgo mayor nuevo (A14), uno menor (A15) y dos notas (A16, A17). El
team-lead acepta los cuatro.

- **A14 (mayor). Las fallas del detalle quedaban detrás de la lista modal.** Aceptado como lo
  propone el revisor. §5.2 suma «Las fallas con la lista abierta». Mientras la lista está
  abierta, la falla del detalle cuyo `request.cell` es la celda abierta se ve dentro de la lista,
  con un `ActionFeedback` arriba de los ítems y el título de §5.5. «Reintentar» aparece solo con
  `unexpected`, y antes de reintentar el foco pasa al título de la lista. La falla no se duplica
  en la pantalla. Al cerrar la lista, si sigue vigente, pasa a la región con las reglas de §5.5.
  Lo acompañan:
  - §4.3: una viñeta, «la pantalla» es la lista mientras está abierta.
  - §5.5: la primera viñeta, la de «un aviso a la vez» y la de «Reintentar».
  - §5.6: una fila para «Reintentar» desde la lista.
  - §1: TS-42 y TS-83.
  - El criterio 6 suma el aviso en la lista, y hay un recorrido 9 con `dropActionRequests` y el
    mutante «la falla del detalle solo en la pantalla».
- **A15 (menor). Ningún test cubría qué conjunto recibe la lista.** La lista recibe el
  `EntryChangesState` y calcula `changingEntriesOf` adentro (§5.2), así que el hook devuelve
  `state` en lugar de `changingEntries` (§5.4). Sale la viñeta «`cell-detail.tsx` reparte». La
  lista exporta lo de adentro sin el portal, como `EntryDialogContent`.
  - El criterio 6 prueba la lista con un `sending` y un `settled`.
  - Suma `cell-detail.test.tsx` (nuevo, en el reparto de `frontend-dev`), que dibuja `CellDetail`
    con un `settled`. Como el portal no se dibuja con `renderToStaticMarkup`, el `Dialog` de la
    lista se reemplaza por su contenido con `vi.mock`.
  - Mutante, en la fila del criterio 6: «los botones con solo `sending`, en la lista o en
    `cell-detail.tsx`».
- **A16 (nota). Dos ambigüedades de redacción.**
  - El recorrido 2 dice «con la entrada de P del martes sembrada como al empezar el 1, con la del
    jueves».
  - §5.6 suma una fila: cancelar la confirmación que salió del menú del editor anidado lleva el
    foco a «Editar» de esa entrada, que abrió la cadena.
- **A17 (nota). TS-83 desde el menú en una fila de una sola entrada, sin refresco previo.** Queda
  en §8 como caso raro. Una action que falla no revalida, así que el `PendingFocus` no espera una
  foto que puede no llegar.

Además, sin hallazgo:

- **El paso de la falla de la lista a la pantalla.** Al cerrar la lista, la falla entra a «un
  aviso a la vez» como si llegara en ese momento. Así queda definido qué pasa si mientras tanto
  falló una escritura de otra celda.

## Lo que sigue

1. El team-lead corre `npx prettier --check` sobre los dos archivos.
2. `architecture-reviewer`: una ronda corta solo sobre A14 … A17, si el team-lead la pide.
