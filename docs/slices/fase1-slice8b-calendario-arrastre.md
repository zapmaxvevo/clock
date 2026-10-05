# Fase 1, slice 8b: calendario (arrastre)

Contrato del slice que suma los gestos de arrastre al calendario de la fase 1.
Módulo `time-entry`, en `src/modules/time-entry/components/calendar/`, sobre la
pantalla `/calendario` que dejan el [slice 8](fase1-slice8-calendario.md)
(lectura) y el [slice 8c](fase1-slice8c-calendario-escritura.md) (escritura).

Es el último de los tres slices del calendario. Parte del esbozo de §8 del
contrato del 8c. Los gestos son atajos del diálogo (CAL-74): mover y estirar
terminan en el trío `{ date, start, end }` que el diálogo ya edita, y crear
arrastrando abre el mismo diálogo de alta que un clic. **No cambia nada del
servidor.**

Fuente de los comportamientos: `docs/parity/calendario.md` (CAL-01 a CAL-100).
Revisiones del contrato: [ronda 1 de `architecture-reviewer`](correcciones-fase1-slice8b.md),
con M1 a M3 y m1 a m5 aplicados.
Decisiones de arquitectura asociadas:

- [ADR 0014, los gestos del calendario son Pointer Events propios, solo con mouse](../adr/0014-los-gestos-del-calendario-son-pointer-events-propios.md),
  **aceptado** el 2026-10-04 (abajo, decisión 1).
- [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md) y
  [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md): el gesto produce
  horas de pared y el servidor las convierte; el extremo que no cambió de
  rótulo conserva su instante.
- [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): el bloque que se mueve
  se dibuja con las mismas funciones de formato, sin convertir instantes.

Decisiones del usuario que siguen vigentes: las de los contratos del 8 y del 8c
(P-01, P-02, P-04, P-06; ADR 0013; corte 8 / 8c / 8b). Decisiones del equipo
que este contrato da por tomadas: **mover y estirar son `updateEntryTimes` con
el trío completo** (mapa, slice 8; «Tres clases de comportamiento» de
`calendario.md`), superposición permitida (TT-82), fechas futuras aceptadas en
una entrada cerrada (TT-76), sin canal abierto y con revalidación periódica
(TT-40, P-11).

## Decisiones del usuario sobre este contrato

Resueltas el 2026-10-04 por el team-lead, con la delegación del usuario («todo lo que
vos puedas hacer, decidilo»), siguiendo la recomendación de este contrato:

1. **ADR 0014: el arrastre solo con mouse — aceptado.** En pantallas táctiles y con lápiz
   el calendario se usa con toques —el alta por la franja o «Agregar entrada»,
   el horario por el diálogo— y deslizar desplaza la grilla. Las alternativas
   eran `touch-action: none` en los bloques, que dificulta desplazar la grilla en
   un teléfono y deja afuera crear arrastrando igual, o una pulsación larga, que
   no se puede verificar con Playwright. La pulsación larga entra después, en un
   slice propio, sin tocar la regla pura.
2. **Calendario P-03, el asa del inicio del timer** (CAL-39) — **fuera del 8b**;
   P-03 sigue abierto con su propuesta. El inicio del timer se corrige desde su
   diálogo (CAL-40), y nada de este contrato cambia si se suma después. Agregarla
   acá pedía una regla que no tiene ningún otro gesto —el tope en «ahora», que
   avanza mientras se arrastra (TT-29)— y su propia mutación,
   `updateRunningStart`.

**Calendario P-05** (solo días laborables, CAL-13) no tiene que ver con los
gestos: sigue fuera, sin decisión pendiente para este slice.

## 0. Precondición de arranque

**El 8b arranca con el 8c en `main`** (`55ce3bf`, rama
`fase1/slice-8b-arrastre`). Las citas de abajo son de ese árbol. Se volvieron a
verificar después de mergear `main` en la rama: el merge trae `shadcn` en
`devDependencies` y un cambio en `CLAUDE.md`, y no mueve ninguna de las líneas
citadas.

**Lo que deja el 8c**, con los nombres del árbol:

- `CalendarView` (`calendar-view.tsx`) dueño de los pedidos: cinco `useAction`
  en `handles` (`:149`), `run` que baja los avisos y limpia `focusEntryId`
  (`:159-165`), `openSubject` con el sujeto del diálogo (`:188-196`) y
  `dialogOpen={open || confirmingDelete}` hacia la grilla (`:321`).
- `CalendarGrid` con `onSlot`, `focusEntryId`, `onEntryFocused` y `regionRef`;
  `DayColumn` decide el clic en una franja con `slotAt`.
- `CalendarNotices` con los avisos de la región y su `retryOf`.
- `calendar-layout.ts` con `minuteAt`, `slotAt`, `slotDraft`, `addEntryDraft` e
  `isOutsidePeriod`; `entry-dialog*.tsx` con los tres modos de edición.
- `e2e/calendar-edit.spec.ts`, cinco recorridos, y en `e2e/calendar-page.ts`
  `clickSlot`, `openDetails`, `minuteHeight` y los localizadores del diálogo.

**Supuestos sobre el árbol**, con archivo y línea en `55ce3bf`:

| Supuesto                                                                                                                                                                                                                           | Dónde                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| El efecto de foco de la grilla enfoca el bloque de `focusEntryId` solo con el foco en `body` o en la región, y si no, vuelve sin limpiarlo. Es la guarda que impide un detalle detrás de la confirmación de «Borrar» (T-n6 del 8c) | `calendar-grid.tsx:140-163`, la guarda en `:147-150`                                    |
| Sus dependencias son `focusEntryId`, `onEntryFocused`, `regionRef` y `state`                                                                                                                                                       | `calendar-grid.tsx:163`                                                                 |
| `DayColumn` abre el alta con `onClick`: ignora un clic sobre un bloque y llama a `slotAt` con `state.canTrack`                                                                                                                     | `calendar-grid.tsx:307-316`                                                             |
| Cada columna es un `role="group"` con `data-calendar-day`, y el contenedor desplazable es `scrollRef`, con `overflow-auto` y `scroll-pt-14`                                                                                        | `calendar-grid.tsx:184-188`, `:319-323`                                                 |
| `columnItems` arma los segmentos de cada día desde `state.entries` y `state.running`                                                                                                                                               | `calendar-grid.tsx:83-107`                                                              |
| `slotAt` devuelve `null` sin permiso, antes del piso o en un minuto que no existe; `minuteAt` ajusta hacia abajo; `slotDraft` corre el fin al final de un hueco                                                                    | `calendar-layout.ts:147-190`                                                            |
| `Segment` tiene `date`, `from`, `to`, `startsHere` y `firstVisible`; una entrada que termina a las 00:00 no dibuja segmento en el día siguiente                                                                                    | `calendar-layout.ts:32-71`                                                              |
| `isMissing`, `minuteHeight`, `SLOT_HEIGHT_PX` (48) y `MIN_BLOCK_HEIGHT_PX` (22)                                                                                                                                                    | `calendar-layout.ts:20-29`, `:142-144`                                                  |
| El bloque es el `TooltipTrigger`: un `button` en el primer segmento visible y un `div` oculto en los otros; `Tooltip disabled={dialogOpen}`; `onClick={onOpen}`                                                                    | `calendar-block.tsx:145-161`                                                            |
| `useTrackerRefresh()` revalida al enfocar, al volver a ser visible y cada 60 s, sin parámetros; lo llaman la barra del rastreador y el calendario                                                                                  | `use-tracker-refresh.ts:14-35`; `tracker-bar.tsx:99`; `calendar-view.tsx:101`           |
| Cada disparo de `useTrackerRefresh` mira `document.visibilityState` antes de revalidar: con la pestaña oculta no hace nada                                                                                                         | `use-tracker-refresh.ts:18-23`                                                          |
| El e2e de TT-40 despacha `focus` en la ventana y espera la revalidación                                                                                                                                                            | `e2e/tracker.spec.ts:444-447`                                                           |
| «Cancelar», `Esc`, un clic afuera y «Guardar» sin cambios cierran el diálogo de una entrada por `onCancel`, que `CalendarView` pasa como `setOpen(false)`                                                                          | `use-dialog-return-focus.ts:35-41`; `entry-dialog.tsx:134-162`; `calendar-view.tsx:338` |
| La confirmación del borrado se cierra por `onOpenChange(false)`: con «Cancelar», `Esc` y un clic afuera, y también antes de `onConfirm` al confirmar; `CalendarView` la pasa como `setConfirmingDelete`                            | `delete-entry-dialog.tsx:43`, `:52-58`; `calendar-view.tsx:355`                         |
| `useAction`: `optimistic` dentro de la transición; `run` baja el aviso; `retry` reenvía `lastInput`; `onFailure` recibe solo la falla                                                                                              | `src/hooks/use-action.ts:25-28`, `:59-93`                                               |
| La fila muestra el trío en vuelo atenuado (TT-55) y su aviso es `trackerLabels.entryTimesNotSaved`, «No se pudo guardar el horario de la entrada.»                                                                                 | `day-group.tsx:166-185`, `:344-351`; `labels.ts:22`                                     |
| `updateEntryTimes` escribe y registra `timeEntry.updateTimes` en cada pedido válido; revalida `"/"` y `"/calendario"`                                                                                                              | `service.ts:985-1012`; `actions.ts:59-65`, `:126-134`                                   |
| `updateEntryTimes` resuelve el trío pedido contra la fila guardada, no contra lo que vio el cliente: el extremo cuyo rótulo difiere del guardado se recalcula                                                                      | `service.ts:964-979`, `:991-994`                                                        |
| `updateEntryTimesInput` es `{ id, date, start, end }`                                                                                                                                                                              | `schema.ts:135-142`                                                                     |
| `editableTimes` es falso en la entrada que corre y en la que el trío no puede expresar; `calendarState` trae `minDayKey`, y cada día `beforeWorkspace` y `missingMinutes`                                                          | `schema.ts:319-324`, `:396-438`                                                         |
| `fromView`, `sameDraft`, `draftDuration`, `draftExtraDays`                                                                                                                                                                         | `time-draft.ts:52-90`                                                                   |
| `formatDuration`, `addDaysToKey`, `minutesToClock`, `clockLabel`, `clockDifferenceMinutes`, `shiftClock`, `MINUTES_PER_DAY`                                                                                                        | `src/server/time/index.ts:61`, `:184`, `:369`, `:375`, `:483`, `:503`, `:146`           |
| Los tests de unidad corren en Node, sin DOM: los componentes se prueban con `renderToStaticMarkup`                                                                                                                                 | `vitest.config.ts:7`; `calendar-block.test.tsx:1`                                       |
| `loseActionResponses`, `holdActionResponses`, `holdRefreshes` y `withServerAction`                                                                                                                                                 | `e2e/network.ts:20`, `:56-119`                                                          |
| `clickSlot` calcula el punto de una franja con `minuteHeight`; `openDetails` cuenta los detalles abiertos                                                                                                                          | `e2e/calendar-page.ts:534-558`                                                          |

**Lo que `calendario.md` y el esbozo dan por cierto y este contrato precisa:**

- **CAL-54** dice que para seguir estirando después de las 00:00 «se arrastra el
  borde del segmento de la columna siguiente». Una entrada que termina a las
  00:00 no dibuja segmento en esa columna (`calendar-layout.ts:54-58`), así que
  no habría desde dónde seguir. Acá el borde estirado **sigue al puntero a la
  columna siguiente** (§5.2).
- **CAL-56** dice «mínimo una franja». Con el otro extremo fuera de una marca
  —una entrada de 10:07— una franja exacta no cae en una marca. Acá el borde
  estirado llega como mínimo a la primera marca posterior al otro extremo
  (§5.2).
- **CAL-57** dice que soltar donde estaba no escribe. Con un extremo fuera de
  marca —10:07, o los segundos que deja el timer—, cualquier candidato
  ajustado es otro trío. Acá el extremo que vuelve a su **marca de casa** toma
  su valor original (§5.2), y soltar ahí no pide.
- **CAL-59** dice que un pedido con un extremo en la hora que no existe «llega
  igual» y se rechaza. Desde el gesto no llega nunca para los días visibles. Sí
  puede llegar para dos días de los que el cliente no conoce los huecos: el
  anterior al primero visible, donde puede quedar el inicio de un bloque
  movido (`s < 0` en §5.2), y el siguiente al último (§8).
- **El esbozo** propone `touch-action` para que la grilla no se desplace
  durante el gesto. Con el ADR 0014 no hay gesto táctil y no hace falta.
- **El esbozo** dice que el aviso de falla ofrece «Reintentar» porque
  `updateEntryTimes` es idempotente. Llega al mismo estado, pero un segundo
  pedido válido escribe y deja otra constancia igual (`service.ts:996-1008`),
  como en la fila.

## 1. Alcance

Entra, con los identificadores de `calendario.md`:

- **Crear**: CAL-44, y el «ni soltar» de CAL-30 y CAL-48 en la selección.
- **Mover y estirar**: CAL-50 a CAL-57, las asas de CAL-58, CAL-59 a CAL-64.
- **Timer**: CAL-39 se verifica por primera vez: su bloque no ofrece ningún
  gesto.
- **Al recargar**: la segunda oración de CAL-89.
- **Casos borde**: «se estira» de CAL-90, CAL-100, y CAL-97 a CAL-99 sobre los
  gestos.
- **Detalle**: CAL-23 y CAL-77 con un gesto en curso.
- **Movimiento reducido**: CAL-78 al soltar, sin animación.

Entran por arrastre, verificándose por el camino nuevo:

- **TT-55**: la escritura en vuelo atenuada, ahora en la grilla.
- **TT-73, TT-110, TT-111, TT-112, ADR 0005 y ADR 0006**: las reglas de
  `updateEntryTimes`, con sus textos, en el aviso del gesto.
- **TT-79, TT-80, TT-89, TT-90**: el aviso de dos partes y «Reintentar» por
  red.
- **TT-66 y TT-92**: los cinco roles arrastran sus entradas; una membresía
  desactivada no tiene gestos.

### Los gestos

| Gesto                   | Empieza sobre                                       | Al soltar                                                                        | El timer          | Más de un día (CAL-58) | Cruza la medianoche                                                          |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Mover (CAL-50)          | el cuerpo de cualquier segmento del bloque (CAL-26) | `updateEntryTimes` con el trío movido; sin pedido si es el mismo (CAL-57)        | no se mueve       | no se mueve            | se mueve entera, tomada de cualquier segmento; puede pasar a cruzar (CAL-54) |
| Estirar el inicio       | el asa superior del segmento del día de inicio      | `updateEntryTimes`; el fin no cambia de rótulo y conserva su instante (ADR 0006) | sin asa (P-03)    | sin asa                | el borde sigue al puntero a la columna anterior                              |
| Estirar el fin (CAL-52) | el asa inferior del segmento donde termina          | `updateEntryTimes`; el inicio conserva su instante                               | sin asa (CAL-39)  | sin asa                | el borde sigue al puntero a la columna siguiente (CAL-54)                    |
| Crear (CAL-44)          | el fondo de una columna, donde `slotAt` no es nulo  | abre «Agregar entrada» con el rango; nada se guarda hasta «Agregar» (CAL-43)     | se permite (P-01) | —                      | no: la selección no sale de su columna                                       |

**Cancelar** (CAL-63): `Esc`, la cancelación del puntero por el navegador, la
pérdida de la captura, la ventana sin foco o la pestaña oculta, un cambio de
zoom o de período, y que la entrada desaparezca de la pantalla. Cancelar deja
todo como estaba, sin pedido y sin diálogo. **El gesto cancelado queda muerto
hasta que se suelta el botón**: conserva la captura, ignora el movimiento, y
soltar no pide nada ni abre el alta ni el diálogo de un bloque (§5.4, paso 6).

**Por teclado** (WCAG 2.5.7 y 2.1.1): no hay gestos de teclado; el diálogo los
cubre (§5.9). **En pantallas táctiles**: no hay gestos; el toque y el
desplazamiento quedan como hoy (§5.10, ADR 0014).

### Lo que el slice decide y que la paridad tiene que registrar

Todo es diseño propio _no verificado_ (P-07):

- **CAL-50 y CAL-53.** El inicio del bloque movido cae en la marca de franja
  más cercana al lugar donde quedaría con el puntero; el fin es ese inicio más
  la distancia de reloj original. Se puede tomar de cualquier segmento y
  arrastrar por las columnas visibles.
- **CAL-52, CAL-53 y CAL-54.** El borde estirado cae en la marca más cercana al
  puntero y sigue al puntero de una columna a otra: estirar el fin de una
  entrada de 22:00 más allá del final de su columna sigue en la columna
  siguiente. Corrige la segunda oración de CAL-54.
- **CAL-55 y CAL-56.** El borde estirado queda entre la primera marca
  posterior al otro extremo y la última anterior a 24 horas de él. Con el otro
  extremo en una marca, es «una franja» y «24 horas menos una franja».
- **CAL-44.** La selección cubre las franjas entre la tocada y la que está bajo
  el puntero, en las dos direcciones, y no sale de su columna. Mide como máximo
  24 horas menos una franja. Un clic sin recorrido sigue siendo CAL-43.
- **CAL-30, CAL-48 y CAL-59.** Un candidato con un extremo en un minuto que no
  existe no se ofrece: el gesto se queda con el anterior. El inicio de un
  bloque movido no pasa al piso del workspace: el gesto se detiene en él.
- **CAL-57.** Soltar con el mismo trío no pide, aunque el bloque haya pasado por
  otros lugares. **La marca de casa**: el extremo que se mueve y vuelve a la
  marca más cercana a su lugar original toma su valor original, con sus
  minutos y segundos. Una entrada de 10:07, o una del timer con segundos, que
  pasa el umbral y se suelta en su lugar no se escribe a 10:00 ni pierde sus
  segundos (ADR 0006).
- **CAL-61.** El puntero se limita a las columnas visibles. Un bloque tomado de
  un segmento posterior al primero puede quedar empezando el día anterior al
  período, pero nunca queda fuera de él: el aviso de CAL-46 no aparece al
  soltar.
- **CAL-62.** Mientras dura el gesto, el bloque se dibuja en el lugar
  candidato, con un anillo y sin atenuar; mientras viaja el pedido, en el lugar
  nuevo, atenuado, `aria-busy` e inactivo (`aria-disabled`, no abre su
  diálogo). **Los totales no cambian de forma optimista**: se mueven con la
  revalidación, como TT-55 en la lista.
- **Un gesto por vez.** Mientras viaja el pedido de un gesto, la grilla no
  empieza otro: apretar un bloque o una franja es un clic.
- **CAL-62 y el foco.** Al terminar un gesto sobre un bloque —soltar con o sin
  pedido, o cancelar— el foco queda en el botón del bloque; si el pedido falla,
  vuelve con el bloque a su lugar. Un foco pendiente de una operación anterior
  se descarta al empezar un gesto y al cerrar sin acción el diálogo o la
  confirmación del borrado.
- **CAL-63.** Cancelan también la pérdida del puntero, la ventana sin foco, la
  pestaña oculta, el cambio de zoom o de período y que la entrada desaparezca.
  Después de cancelar, soltar el botón no hace nada.
- **CAL-89.** Las revalidaciones periódicas se juntan mientras dura el gesto, y
  sale una al terminar si hubo alguna con la pestaña visible. La que viene con
  la respuesta de otra action en vuelo no se puede pausar: si se lleva la
  entrada del gesto, el gesto se cancela.
- **CAL-90.** Un bloque de distancia de reloj cero —segundos dentro del mismo
  minuto— se estira pero no se mueve: con la distancia conservada, el trío
  movido dura cero.
- **CAL-97 al estirar.** El extremo que no se toca viaja con el rótulo que
  muestra la pantalla. Si otra pestaña lo cambió, gana la última escritura
  también en ese extremo, como en la fila.
- **CAL-23 y CAL-77.** Con un gesto en curso ningún bloque muestra su detalle.
- **Un gesto no termina en clic**: después de soltar no se abre el diálogo del
  bloque ni el alta de CAL-43.
- **El desplazamiento automático.** Con el puntero a menos de 32 px de un borde
  del área visible de las columnas, la grilla se desplaza hacia ese borde, más
  rápido cuanto más cerca.
- **Táctil y lápiz** (ADR 0014): sin gestos. Es una
  divergencia si Clockify arrastra con el dedo.

**Lo registra `parity-analyst` antes del merge** (§6), con la sección «Slice
8b» en §20 de `calendario.md`.

### Queda afuera

- **P-03** (asa del inicio del timer) y **P-05** (días laborables): decisión 2
  y nota de arriba.
- **Arrastrar con el dedo o con lápiz**: ADR 0014.
- **Atajos de teclado para mover o estirar**: ADR 0014.
- **Llevar un bloque a otra semana arrastrando** (CAL-61): por el diálogo.

### Consecuencias sobre código ya entregado

| Archivo                             | Qué cambia                                                                                                                                                                                                                                                                                                                                                | Qué hay que volver a probar                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `calendar/calendar-grid.tsx`        | Monta `useCalendarGesture`; dibuja los bloques con el trío del gesto o del pedido en vuelo; la selección del alta; el detalle cerrado con un gesto; `select-none`. El efecto de foco limpia `focusEntryId` si el bloque ya tiene el foco, antes de la guarda, y vuelve a correr cuando cambia el dibujo (§5.7). La guarda no cambia.                      | `calendar.spec.ts`, `calendar-edit.spec.ts` enteros |
| `calendar/calendar-block.tsx`       | Las asas, el cursor, `busy` y `dragging`, y `onGestureStart`.                                                                                                                                                                                                                                                                                             | `calendar-block.test.tsx`                           |
| `calendar/calendar-block.test.tsx`  | El render de cada caso pasa las props nuevas con `NO_GESTURES`, y `busy` y `dragging` en falso: es un cambio de fixture, ninguna afirmación cambia.                                                                                                                                                                                                       | —                                                   |
| `calendar/calendar-view.tsx`        | Suma `useAction(updateEntryTimes)` con su vista optimista a `handles`; el estado del gesto, que pausa `useTrackerRefresh`; `focusEntryId` al terminar un gesto, con éxito y con falla; el alta desde una selección. Limpia `focusEntryId` al empezar un gesto, en `onCancel` del diálogo (`:338`) y en `onOpenChange(false)` de la confirmación (`:355`). | `calendar-edit.spec.ts` entero                      |
| `calendar/calendar-notices.tsx`     | El aviso de la falla del gesto, con «Reintentar» por red.                                                                                                                                                                                                                                                                                                 | —                                                   |
| `components/use-tracker-refresh.ts` | `useTrackerRefresh(paused = false)`, con la compuerta de `refresh-gate.ts` después de la comprobación de visibilidad. Sin argumento, igual que hoy.                                                                                                                                                                                                       | TT-40 en `tracker.spec.ts:444-447`                  |
| `e2e/calendar-page.ts`              | Suma los localizadores y los pasos de los gestos (§6). `clickSlot` pasa a usar `slotPoint`, sin cambiar lo que hace.                                                                                                                                                                                                                                      | `calendar.spec.ts`, `calendar-edit.spec.ts`         |

**Ninguna afirmación de un test existente cambia.** El único test existente que
se toca es `calendar-block.test.tsx`, por las props nuevas del bloque.

### Tamaño

**No se parte** (confirmado en la ronda 1). Sin servidor, el slice es una
regla pura con sus tests, un hook que la conecta al DOM, cambios acotados en
cuatro componentes y un spec de cuatro recorridos: menos que la mitad de
frontend del 8c. Los tres gestos comparten el ciclo, el dibujo y los topes; CAL-44
comparte el ciclo y la regla con los otros, y sacarlo ahorraría poco.

## 2. Cambios de esquema

**Ninguno.**

## 3. Acciones de permisos nuevas

**Ninguna.** La unión `Action` de `src/server/permissions` no cambia.

| Operación                       | Acción de `can()`                           | Recurso                                                                                    |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Ofrecer gestos                  | `timeEntry.own.create`, como `canTrack`     | `ownTimeEntryResource(actor)`                                                              |
| Mover y estirar                 | `timeEntry.own.update`, `updateEntryTimes`  | en la action, `ownTimeEntryResource(actor)`; en el service, la fila leída (`readOwnEntry`) |
| Crear arrastrando, al «Agregar» | `timeEntry.own.create`, `createManualEntry` | `ownTimeEntryResource(actor)`                                                              |

## 4. Contrato de las server actions

**Ninguna action nueva ni cambiada.** Soltar un bloque llama a
`updateEntryTimes({ id, date, start, end })`, la del slice 3, con el recorrido
de siempre y la revalidación de `"/"` y `"/calendario"` del 8c. Crear
arrastrando no llama a nada: abre el diálogo de alta del 8c, que llama a
`createManualEntry` al «Agregar».

**Por qué `updateEntryTimes` y no `updateEntry` con `times`.** Las dos llegan a
la misma regla, `entryTimesFor` (ADR 0013). El gesto cambia solo el horario, y
esa es la mutación del horario: la de la fila, con su título de aviso (CAL-62,
«es la misma mutación y la misma causa») y su constancia,
`timeEntry.updateTimes`. `updateEntry` es la del diálogo, que guarda varios
grupos con «Guardar» y nombra la entrada entera en su aviso. Lo que
`updateEntry` agregaría —no escribir con el trío igual— lo hace el cliente
antes de pedir (CAL-57).

**Lo que el gesto puede encontrar en el servidor**: los rechazos de
`updateEntryTimes`, con su texto como segunda parte del aviso (§5.6), y una
escritura concurrente que no es un rechazo.

| Causa                                                  | Código       | Texto              | Cómo llega desde el gesto                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La entrada ya no existe (TT-80)                        | `not_found`  | `notFound`         | otra pestaña la borró y la revalidación todavía no llegó                                                                                                                                                                                                   |
| Membresía desactivada o ajena (TT-79)                  | `forbidden`  | sus textos         | la membresía se desactivó con la pantalla abierta                                                                                                                                                                                                          |
| El trío ya no la expresa (TT-110)                      | `validation` | `multiDayTimes`    | otra pestaña la estiró a más de un día                                                                                                                                                                                                                     |
| Hora que no existe (TT-112, CAL-59)                    | `validation` | `nonexistentClock` | el inicio cae en un hueco del día anterior al primero visible, o el fin en uno del siguiente al último (§8)                                                                                                                                                |
| Menos de un minuto (TT-73), antes del piso, fecha      | `validation` | sus textos         | no por construcción (§5.2); quedan como red de la regla del servidor                                                                                                                                                                                       |
| Otra pestaña cambió el extremo que no se tocó (CAL-97) | —            | ninguno            | no es un rechazo: al estirar, el extremo quieto viaja con el rótulo de la vista, `updateEntryTimes` lo resuelve contra la fila guardada (`service.ts:964-979`) y lo vuelve a ese rótulo. Gana la última escritura, también en ese extremo, como en la fila |
| Red o error inesperado                                 | `unexpected` | `unexpected`       | respuesta perdida o servidor caído                                                                                                                                                                                                                         |

**Reintento y auditoría.** «Reintentar» solo con `unexpected` (TT-89), con
`retryHandlerOf`: reenvía el mismo trío, que llega al mismo estado. Si el primer
pedido se aplicó, el segundo escribe los mismos instantes y deja una segunda
constancia `timeEntry.updateTimes` con el valor anterior igual al siguiente,
como en la fila. Un gesto sin pedido (CAL-57) o cancelado no deja ninguna.

## 5. Contrato de pantalla

### 5.1 La grilla como una recta de minutos

El gesto razona sobre **minutos de reloj contados desde las 00:00 del primer
día visible**: el día de índice `i` y el minuto `m` son `i * 1440 + m`. Cada
columna mide 1440 minutos de reloj aunque el día tenga un cambio de horario
(CAL-30), así que la recta es la grilla tal como se ve. Un valor negativo es
del día anterior al período; uno de `n * 1440` es la medianoche que cierra el
último día.

El día de un punto es `addDaysToKey(days[0].date, Math.floor(p / 1440))` y su
hora, `minutesToClock(p)`. No hay instantes: el servidor convierte el trío con
la zona de la persona (ADR 0005).

**Las marcas** son los múltiplos del zoom (60, 30, 15 o 5), que dividen 1440:
una marca de la recta es también una marca de su columna.

### 5.2 La regla pura: `calendar-gestures.ts`

```ts
// src/modules/time-entry/components/calendar/calendar-gestures.ts

/** Minutos de reloj desde las 00:00 del primer día visible (§5.1). */
export type GridMinute = number;

/** Lo que el gesto necesita del período, de `CalendarState`. */
export type GestureGrid = {
  readonly days: readonly Pick<
    CalendarDayView,
    "date" | "beforeWorkspace" | "missingMinutes"
  >[];
  readonly minDayKey: string;
  readonly zoom: CalendarZoom;
};

export type EntryGestureKind = "move" | "start" | "end";

/** Un gesto sobre una entrada cerrada, con lo que tenía al empezar. */
export type EntryGesture = {
  readonly kind: EntryGestureKind;
  readonly entryId: string;
  /** El trío de la entrada al empezar, `fromView(entry)`. */
  readonly original: TimeDraft;
  /** Su inicio en la recta: negativo si empezó el día anterior al período. */
  readonly start: GridMinute;
  /** Distancia de reloj del trío, `clockDifferenceMinutes` (CAL-51). */
  readonly span: number;
  /** En `move`, del inicio al punto tomado; 0 en los otros. */
  readonly grab: number;
};

/** Una selección para el alta, dentro de una columna (CAL-44). */
export type CreateGesture = {
  readonly kind: "create";
  readonly dayIndex: number;
  /** El minuto de la franja tocada, el de `slotAt`. */
  readonly anchor: number;
};

export type Gesture = EntryGesture | CreateGesture;

/** Qué gestos ofrece un segmento (CAL-05, CAL-39, CAL-58, CAL-90, CAL-100). */
export type SegmentGestures = {
  readonly move: boolean;
  readonly start: boolean;
  readonly end: boolean;
};
export const NO_GESTURES: SegmentGestures;
export function segmentGestures(
  entry: TimeEntryView,
  segment: Segment,
  canTrack: boolean,
): SegmentGestures;

/** El gesto sobre una entrada, tomado en `pointer`. */
export function entryGesture(
  kind: EntryGestureKind,
  entry: TimeEntryView,
  days: readonly string[],
  pointer: GridMinute,
): EntryGesture;

/** El trío del que parte el gesto: el de la entrada, o el de un clic (`slotDraft`). */
export function initialCandidate(gesture: Gesture, grid: GestureGrid): TimeDraft;

/**
 * El trío que propone el gesto con el puntero en `pointer`: el original si el
 * extremo que se mueve vuelve a su marca de casa (CAL-57); si no, con el
 * ajuste de CAL-53 y los topes de CAL-48, CAL-55, CAL-56 y CAL-61 aplicados.
 * `null` si un extremo cae en un minuto que no existe (CAL-30, CAL-59).
 */
export function candidateAt(
  gesture: Gesture,
  pointer: GridMinute,
  grid: GestureGrid,
): TimeDraft | null;

/** La entrada dibujada con otro trío: la del gesto y la del pedido en vuelo (ADR 0012). */
export function movedView(
  entry: TimeEntryView,
  times: TimeDraft,
  format: TimeFormat,
): TimeEntryView;

/** El punto bajo el puntero en una columna, acotado a ella (CAL-61). */
export function gridMinuteAt(
  dayIndex: number,
  offsetPx: number,
  zoom: CalendarZoom,
): GridMinute;

/** ADR 0014: el botón principal del mouse. */
export function startsGesture(pointer: {
  readonly pointerType: string;
  readonly button: number;
  readonly isPrimary: boolean;
}): boolean;

export const DRAG_THRESHOLD_PX = 4;
/** Desde acá el gesto deja de ser un clic. */
export function passedThreshold(dx: number, dy: number): boolean;

export const AUTOSCROLL_EDGE_PX = 32;
/** Píxeles por cuadro hacia un borde a esa distancia: 0 fuera de la banda, hasta 16 en el borde. */
export function autoScrollStep(distanceToEdge: number): number;
```

**Definiciones.** `n` es la cantidad de días visibles y `END = n * 1440`.
`round(x)` es la marca más cercana a `x`; `nextMark(x)`, la primera marca mayor
que `x`; `lastMark(x)`, la última menor que `x`. **El piso** de la recta es
`-∞` si `minDayKey` es anterior al primer día visible, y si no `i * 1440`, con
`i` el primer día visible que no es `beforeWorkspace`. El inicio de una entrada
en la recta es `i * 1440 + startMinute` con `i` el índice de `dayDate`, o
`-1440 + startMinute` si `dayDate` no está a la vista: una entrada con
`editableTimes` dura menos de un día, así que con un segmento visible empezó a
lo sumo el día anterior. **La marca de casa** de un extremo es `round` de su
lugar original en la recta: `round(start)` del inicio y `round(start + span)`
del fin. Con el extremo en una marca, es él mismo.

**`segmentGestures`.** `NO_GESTURES` si `canTrack` es falso, si la entrada
corre (`endClock === null`) o si `editableTimes` es falso. Si no:

- `move`: `span > 0` (CAL-90).
- `start`: `segment.startsHere`.
- `end`: el segmento termina donde termina la entrada. Es el del día del fin
  con `to` igual al minuto del fin, o, si el fin es a las 00:00, el del día
  anterior con `to === 1440`. Una entrada que termina después del período no
  tiene asa de fin, como la que empezó antes no tiene asa de inicio (CAL-100
  visto desde una editable).

**`candidateAt` por gesto.** Primero se mira la marca de casa, después se
acota con los topes y por último se mira la hora que no existe. **Un candidato
`null` deja el anterior**: el gesto nunca dibuja ni suelta un extremo en un
hueco.

- **`move`** (CAL-50, CAL-51, CAL-53, CAL-57, CAL-61): `s = round(pointer -
grab)`. Si `s === round(start)`, el candidato es `original`. Si no, `s` se
  acota a `[max(piso, nextMark(-span)), END - zoom]`: el bloque conserva al
  menos un minuto en el período y no empieza antes del piso. Con un `grab`
  mayor que el punto del puntero en la primera columna, `s` puede quedar
  negativo: el inicio queda el día anterior al primero visible. El trío es `{
día de s, minutesToClock(s), shiftClock(inicio, span) }`. `null` si el inicio
  cae en `missingMinutes` de su día, o el fin en los del suyo, cuando ese día
  está a la vista; los días fuera de la vista no se miran (§8).
- **`start`** (CAL-52, CAL-55, CAL-56, CAL-57): con `e = start + span`, `s =
round(pointer)`. Si `s === round(start)`, el candidato es `original`. Si no,
  `s` se acota a `[max(piso, nextMark(e - 1440)), lastMark(e)]`. El trío es `{
día de s, minutesToClock(s), original.end }`: el fin no cambia de rótulo y
  conserva su instante (ADR 0006). `null` si el inicio cae en un hueco.
- **`end`** (CAL-52, CAL-54, CAL-55, CAL-56, CAL-57): `f = round(pointer)`. Si
  `f === round(start + span)`, el candidato es `original`. Si no, `f` se acota a
  `[nextMark(start), lastMark(start + 1440)]`. El trío es `{ original.date,
original.start, minutesToClock(f) }`: un fin anterior al inicio es del día
  siguiente (TT-72). `null` si el fin cae en un hueco.
- **`create`** (CAL-44): con `c` la franja bajo el puntero dentro de la columna
  del gesto (`Math.floor` al zoom, entre 0 y `1440 - zoom`), la selección es
  `[min(anchor, c), max(anchor, c) + zoom]`. Si mide más de `1440 - zoom`, se
  recorta del lado del puntero. El trío es `{ día de la columna, inicio, fin }`,
  con un fin de 24:00 escrito «00:00» (TT-72). `null` si un extremo cae en un
  hueco. No tiene marca de casa: parte de un borrador, no de una entrada.

**`initialCandidate`**: `original` en un gesto sobre una entrada;
`slotDraft(día, anchor, zoom, missingMinutes)` en una selección, el mismo
borrador que un clic (CAL-43). Es el «anterior» del primer candidato.

**`movedView(entry, times, format)`**: la vista con `dayDate`, `startClock`,
`endClock`, `extraDays` (`draftExtraDays`), `startLabel` y `endLabel`
(`clockLabel`), `durationSeconds` y `durationLabel` de `draftDuration`. El
resto no cambia: `startedAt`, `weekStart`, `editableTimes`, el par. Es lo que
dibuja el bloque y su nombre accesible mientras dura el gesto y mientras viaja
el pedido.

**`startsGesture`**: `pointerType === "mouse"`, `button === 0` e `isPrimary`.

**`autoScrollStep(d)`**: `0` si `d >= AUTOSCROLL_EDGE_PX`; si no,
`Math.ceil((AUTOSCROLL_EDGE_PX - max(d, 0)) / 2)`, que llega a 16 en el borde.

### 5.3 Las asas y el bloque

`CalendarBlock` gana:

```ts
/** Los gestos que ofrece este segmento; `NO_GESTURES` mientras viaja su pedido. */
readonly gestures: SegmentGestures;
/** El pedido de su horario viaja: atenuado, `aria-busy`, inactivo (CAL-62). */
readonly busy: boolean;
/** Se dibuja en el lugar candidato del gesto en curso. */
readonly dragging: boolean;
/** Apretar el cuerpo o un asa; la grilla decide si empieza un gesto. */
readonly onGestureStart: (kind: EntryGestureKind, event: PointerEvent<HTMLElement>) => void;
```

- **Las asas** son `span` con `aria-hidden="true"` y `data-block-handle="start"`
  o `"end"`, adentro del elemento del bloque, de 6 px de alto en su borde
  superior o inferior y del ancho del bloque, con `cursor-ns-resize`. Solo con
  `gestures.start` o `gestures.end`. No son controles ni están en el orden de
  `Tab` (CAL-76). No tienen dibujo propio: el cursor las señala.
- **El cuerpo** lleva `cursor-grab` con `gestures.move`.
- **`onGestureStart`** recibe `"start"` o `"end"` si el puntero bajó en un asa,
  y `"move"` si bajó en el cuerpo con `gestures.move`. Sin gesto posible no
  llama a nada, y el clic abre el diálogo como hoy.
- **`busy`**: `opacity-60`, `aria-busy="true"` y `aria-disabled="true"`;
  `onOpen` no actúa. **`dragging`**: un anillo (`ring-2`) y `z-10`.
- **El detalle** (`Tooltip disabled`) se cierra con `dialogOpen`, que la grilla
  le pasa como `dialogOpen || gestureActive`.

### 5.4 El ciclo de un gesto: `use-calendar-gesture.ts`

```ts
// src/modules/time-entry/components/calendar/use-calendar-gesture.ts
export type GesturePreview =
  | { readonly kind: "entry"; readonly entryId: string; readonly times: TimeDraft }
  | { readonly kind: "create"; readonly dayIndex: number; readonly times: TimeDraft };

export function useCalendarGesture(options: {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly grid: GestureGrid;
  /** Con permiso de carga y sin un pedido de horario en vuelo. */
  readonly enabled: boolean;
  /** Las entradas que se dibujan: si la del gesto se va, el gesto se cancela. */
  readonly entryIds: readonly string[];
  readonly onDrop: (input: UpdateEntryTimesInput) => void;
  readonly onSelectRange: (draft: TimeDraft) => void;
  /** Avisa el principio y el fin, con el id de la entrada si es un gesto sobre una. */
  readonly onActiveChange: (active: boolean, entryId: string | null) => void;
}): {
  /** `null` sin gesto, antes del umbral y con el gesto cancelado. */
  readonly preview: GesturePreview | null;
  readonly beginEntry: (
    kind: EntryGestureKind,
    entry: TimeEntryView,
    event: PointerEvent<HTMLElement>,
  ) => void;
  readonly beginCreate: (
    dayIndex: number,
    anchor: number,
    event: PointerEvent<HTMLElement>,
  ) => void;
  /** En captura sobre la grilla: defensa contra un clic que siga a un gesto. */
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
};
```

1. **Apretar.** `beginEntry` y `beginCreate` no hacen nada si `enabled` es
   falso o si `startsGesture` es falso. `beginCreate` lo llama `DayColumn` con
   el `anchor` de `slotAt`, solo si no es nulo y el puntero no bajó sobre un
   bloque. El gesto queda armado con su posición de inicio, sin captura y sin
   vista.
2. **El umbral.** Hasta que `passedThreshold` es verdadero, nada cambia: si el
   botón se suelta antes, el clic llega a su destino como hoy (CAL-43, CAL-65).
   **La captura se toma al pasar el umbral, no al apretar**: con la captura
   desde el principio, el clic iría a la grilla y no al bloque ni a la columna.
3. **Durante el gesto.** `setPointerCapture` sobre `scrollRef`, que no se
   desmonta mientras dura (un bloque que cambia de columna sí se desmonta). Cada
   `pointermove` y cada cuadro de desplazamiento automático leen el punto bajo
   el puntero —la columna de `[data-calendar-day]` cuyo ancho lo contiene, o la
   más cercana; en `create`, siempre la suya— con `gridMinuteAt`, y
   `candidateAt` da el candidato, o el anterior si es `null`. `preview` lleva
   ese trío. `onActiveChange(true, id)` al pasar el umbral.
4. **El desplazamiento automático.** Un bucle de `requestAnimationFrame`
   mientras dura el gesto suma `autoScrollStep` de la distancia del puntero a
   cada borde del área visible de las columnas —la de `scrollRef` sin los
   encabezados pegajosos ni el eje, medidos del DOM— y recalcula el candidato.
5. **Soltar** (`pointerup` con el gesto vivo y pasado del umbral). En un gesto
   sobre una entrada: si `sameDraft(candidato, original)`, nada (CAL-57); si
   no, `onDrop({ id, ...candidato })`. En `create`: `onSelectRange(candidato)`.
   Después, `onActiveChange(false, id)`, se suelta la captura y queda puesta la
   marca del clic (paso 7).
6. **Cancelar**: `Esc` (escuchado en `document` en fase de captura, con
   `preventDefault`), `pointercancel`, `lostpointercapture` sin `pointerup`,
   `blur` de la ventana, `visibilitychange` a oculto, otro zoom, que el id de la
   entrada no esté en `entryIds`, o `enabled` en falso. `preview` pasa a
   `null`, sin pedido y sin `onSelectRange`, y `onActiveChange(false, id)`.
   **El gesto queda muerto hasta el `pointerup`**: conserva la captura si la
   tenía, ignora los `pointermove` y el desplazamiento automático, y pone la
   marca del clic. El `pointerup` que llega después solo suelta la captura: no
   pide nada ni abre nada. Con `pointercancel` o `lostpointercapture` ya no hay
   captura que conservar, y la marca queda igual. Desmontar la grilla (otro
   período) termina el gesto sin más.
7. **El clic que sigue.** Con la captura sobre `scrollRef`, el `click` que
   sigue al `pointerup` llega a `scrollRef` y no al bloque ni a la columna: por
   eso un gesto, terminado o cancelado, no abre el diálogo del bloque ni el
   alta de CAL-43 mientras conserva la captura hasta soltar. La prueba del
   handshake registra adónde llega ese `click` en Chromium. `onClickCapture`
   en la raíz de la grilla, que detiene (`stopPropagation` y `preventDefault`)
   el primer clic con la marca puesta, **queda como defensa**, como
   `|| confirmingDelete` en T-n6: ningún test la cuenta como cobertura. La
   marca se borra en el siguiente `pointerdown`.

**Sin `preventDefault` en `pointerdown`**: apretar un bloque lo enfoca como
hoy. La grilla lleva `select-none`, así que arrastrar no selecciona texto.

### 5.5 Lo que dibuja la grilla

`CalendarGrid` gana:

```ts
/** El pedido de horario en vuelo: su bloque se dibuja con ese trío, atenuado (CAL-62). */
readonly movingTimes: UpdateEntryTimesInput | null;
/** `state.canTrack` y ningún pedido de horario en vuelo. */
readonly gesturesEnabled: boolean;
readonly onDropTimes: (input: UpdateEntryTimesInput) => void;
readonly onSelectRange: (draft: TimeDraft) => void;
readonly onGestureChange: (active: boolean, entryId: string | null) => void;
```

- **Los bloques** salen de `columnItems` con un reemplazo: la entrada del
  gesto con `movedView(entry, preview.times, time)`, o la del pedido en vuelo
  con `movedView(entry, movingTimes, time)`. Los segmentos, los carriles y el
  orden salen de esa vista con las funciones de siempre. El orden de `Tab`
  sigue el `startedAt` de antes hasta la revalidación.
- **`dragging`** en los segmentos de la entrada del gesto; **`busy`** y
  `NO_GESTURES` en los de la entrada en vuelo; en los demás,
  `segmentGestures(entry, segment, gesturesEnabled)`.
- **La selección** del alta: un `div` `aria-hidden="true"` con
  `data-calendar-selection`, en la columna del gesto, de `from` a `to` con la
  escala del zoom, con el rango «{inicio} – {fin}» en el formato de la persona.
  Desaparece al soltar o cancelar: con el diálogo abierto no queda dibujada
  (CAL-49).
- **El detalle**: `dialogOpen || gestureActive` a cada bloque (§5.3).
- **Sin animación**: los bloques no tienen `transition` de posición ni de
  tamaño, así que CAL-78 se cumple sin mirar `prefers-reduced-motion`.

### 5.6 El pedido y su aviso

`CalendarView` suma:

```ts
const [movingTimes, showMovingTimes] = useOptimistic<
  UpdateEntryTimesInput | null,
  UpdateEntryTimesInput
>(null, (_, input) => input);
/** El id del último pedido de horario: adonde vuelve el foco si falla. */
const movingIdRef = useRef<string | null>(null);
const moveTimes = useAction(updateEntryTimes, {
  unreachableMessage: timeEntryMessages.unexpected,
  optimistic: (input) => showMovingTimes(input),
  onSuccess: (data) => setFocusEntryId(data.entry.id),
  onFailure: () => setFocusEntryId(movingIdRef.current),
});
```

- **`handleDropTimes(input)`**: guarda `input.id` en `movingIdRef` y llama a
  `run(moveTimes, input)`, que baja los avisos de las otras operaciones (§5.4
  del 8c). `moveTimes` entra en `handles`.
- **`gesturesEnabled`** es `state.canTrack && !moveTimes.pending`: un gesto por
  vez (§1).
- **`handleSelectRange(draft)`**: `openSubject({ kind: "add", draft, opener:
"slot" })`, el alta del 8c con `cancelFocus` en la región.
- **El aviso**, en `CalendarNotices`: `ActionFeedback` con
  `trackerLabels.entryTimesNotSaved` y el mensaje de la falla, y «Reintentar»
  con `retryOf(moveTimes)` solo con `unexpected`. Con `retryOf`, el foco pasa a
  la región antes de reintentar; con éxito, `focusEntryId` lo lleva al bloque.
- **Sin CAL-46**: el bloque soltado tiene un segmento en el período (§5.2), así
  que `landed` no aplica.
- **Textos nuevos: ninguno.** El título es el de la fila (CAL-62) y la segunda
  parte, el mensaje de `updateEntryTimes`.

### 5.7 Foco

- **Al empezar un gesto**, `onGestureChange(true, id)` limpia `focusEntryId`:
  un pendiente de una operación anterior no puede llevarse el foco mientras el
  bloque cambia de columna.
- **Al terminar un gesto sobre un bloque**, con o sin pedido o cancelado,
  `CalendarView` fija `focusEntryId` con su id, por `onGestureChange(false,
id)`. Llega después de `onDrop` y por eso después del `run` que lo limpia.
  En un `create`, el foco va al diálogo de alta, o se queda donde estaba si se
  canceló.
- **Al cerrar sin acción**, `CalendarView` también limpia `focusEntryId`: en
  `onCancel` del diálogo de una entrada (`calendar-view.tsx:338`, que hoy es
  `setOpen(false)`) y en `onOpenChange(false)` de la confirmación del borrado
  (`:355`, que hoy es `setConfirmingDelete`). «Cancelar» de la confirmación no
  pasa por `run(remove)` ni por `openSubject`, y sin esto dejaría pendiente un
  `focusEntryId` que un foco posterior en la región llevaría a un bloque viejo
  (F-n1 del 8c). Al confirmar, `onOpenChange(false)` llega antes de
  `onConfirm` (`delete-entry-dialog.tsx:55-58`), y `run(remove)` lo limpia
  igual.
- **El efecto de foco de la grilla** (`calendar-grid.tsx:140-163`) cambia en dos
  cosas, y **la guarda no cambia**:
  - **Antes de la guarda**, si el botón de la entrada ya es el elemento con
    foco, limpia `focusEntryId` y no hace nada más. Hoy vuelve sin limpiarlo,
    y después de un gesto el botón apretado suele tener el foco:
    `focusEntryId` quedaría pendiente y un foco posterior en la región lo
    usaría.
  - Vuelve a correr también cuando cambian `movingTimes` y la vista del gesto:
    un bloque que cambió de columna se desmonta, el foco cae en `body` y el
    efecto lo encuentra en su lugar nuevo.
- **La guarda sigue siendo la de T-n6**: con el foco en un diálogo o en la
  confirmación del borrado, el efecto no lo saca. Una respuesta que llega con
  la confirmación abierta deja `focusEntryId` pendiente, y cerrar la
  confirmación lo limpia: con «Cancelar», por `onOpenChange(false)`; al
  confirmar, también por `run(remove)`.
- **Si el pedido falla**, el bloque vuelve a su lugar y `onFailure` fija
  `focusEntryId` otra vez: vuelve al bloque si el foco cayó en `body`.

### 5.8 La revalidación durante un gesto (CAL-89)

```ts
// src/modules/time-entry/components/refresh-gate.ts
export type RefreshGate = { readonly paused: boolean; readonly pending: boolean };
export type RefreshEvent = "trigger" | "pause" | "resume";
/**
 * CAL-89: con la compuerta cerrada, los disparos de TT-40 se juntan en uno
 * que sale al abrirla. Abierta, cada disparo revalida.
 */
export function nextRefreshGate(
  gate: RefreshGate,
  event: RefreshEvent,
): { readonly gate: RefreshGate; readonly refresh: boolean };
```

`useTrackerRefresh(paused = false)` guarda la compuerta en un `ref`: cada
disparo —enfocar, volver a ser visible, el intervalo de 60 s— pasa por
`nextRefreshGate`, y un cambio de `paused` también. Sin argumento la compuerta
nunca se cierra y la conducta es la de hoy. `CalendarView` le pasa el estado
del gesto: `useTrackerRefresh(gestureActive)`.

**La comprobación de visibilidad va antes de la compuerta**, como hoy
(`use-tracker-refresh.ts:18-23`): un disparo con la pestaña oculta no llega a
`nextRefreshGate` y no queda pendiente. Como la pestaña oculta además cancela
el gesto (§5.4, paso 6), al volver a ser visible el evento de visibilidad
revalida por el camino de siempre. Lo que sale al abrir la compuerta es un
disparo `resume` del hook, que no vuelve a mirar la visibilidad: solo hay uno
pendiente si llegó con la pestaña visible.

La revalidación que viene con la respuesta de otra action en vuelo —un
«Detener» o un «Duplicar» de antes del gesto— no pasa por la compuerta. El
gesto la soporta: dibuja desde su candidato, y si la entrada ya no está, se
cancela (§5.4, paso 6).

### 5.9 Teclado y accesibilidad (WCAG 2.5.7 y 2.1.1)

**No hay gestos de teclado; el diálogo los cubre**, como fija CAL-74 desde el
8c:

| Gesto          | Sin arrastre, con un solo puntero (2.5.7)                                            | Con teclado (2.1.1)                                     |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Mover, estirar | clic en el bloque; fecha por clics en su calendario; horas en los campos del diálogo | `Tab` al bloque, `Enter` o `Espacio`, los mismos campos |
| Crear un rango | clic en la franja; el fin en el campo del diálogo                                    | «Agregar entrada»                                       |
| Cancelar       | «Cancelar» del diálogo                                                               | `Esc`                                                   |

- **Las asas no son controles**: `aria-hidden`, fuera del orden de `Tab`. La
  misma función está en el diálogo, que es la excepción «equivalente» de 2.5.8.
- **El nombre accesible** del bloque sigue a `movedView` mientras dura el gesto
  y mientras viaja el pedido: anuncia el horario que se ve.
- **`aria-busy` e inactivo** mientras viaja el pedido, como TT-55.

### 5.10 Pantallas táctiles (ADR 0014)

Con el ADR 0014 aceptado, `startsGesture` es falso para `touch` y `pen`. Un
toque es un clic: abre el alta de CAL-43 o el diálogo del bloque, como hoy.
Deslizar desplaza la grilla con el desplazamiento nativo. No hay `touch-action`
propio, ni asas visibles distintas. El detalle no aparece en pantallas
táctiles, como en el 8.

## 6. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea. **`backend-dev` no
participa**: el slice no toca el servidor.

### frontend-dev

```
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-gestures.ts       (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-gestures.test.ts  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/use-calendar-gesture.ts    (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-grid.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-block.test.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-view.tsx
/home/maxi/program/clock/src/modules/time-entry/components/calendar/calendar-notices.tsx
/home/maxi/program/clock/src/modules/time-entry/components/refresh-gate.ts                     (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/refresh-gate.test.ts                (nuevo)
/home/maxi/program/clock/src/modules/time-entry/components/use-tracker-refresh.ts
```

### e2e-tester

```
/home/maxi/program/clock/e2e/calendar-drag.spec.ts   (nuevo)
/home/maxi/program/clock/e2e/calendar-page.ts
```

`calendar-page.ts` suma `slotPoint(page, day, today, clock, size)` —el punto
de pantalla de una franja, que `clickSlot` pasa a usar—, `blockHandle(block,
"start" | "end")` (`[data-block-handle]`), `calendarSelection(page)`
(`[data-calendar-selection]`), `gridScroller(page)` y `dragBetween(page, from,
to)`, con `page.mouse` y al menos cinco pasos de movimiento. El conteo de
pedidos de server action (cabecera `next-action`) y de revalidaciones (`GET` a
`/calendario`) va en el spec, igual que el paso que reemplaza
`document.visibilityState` y despacha `visibilitychange` (recorrido 1).

### parity-analyst

```
/home/maxi/program/clock/docs/parity/calendario.md
```

Antes del merge: lo que enumera §1 en «Lo que el slice decide»; CAL-54 y CAL-56
corregidos con la nota «_Corregido el …, slice 8b_»; CAL-57 con la marca de
casa; CAL-59 con los casos del día anterior al primero visible y del siguiente
al último; CAL-63 con el gesto cancelado que queda muerto hasta soltar; CAL-97
con el extremo quieto al estirar; CAL-23 y CAL-77 con el detalle cerrado
durante un gesto; la sección «Slice 8b» en §20, con «Lo que queda» actualizado;
en P-07, la pregunta de CAL-44 sobre el dedo, y las de CAL-53, CAL-55, CAL-58 y
CAL-61 sin cambios; y P-03 en «Abiertos» con la nota de que el 8b no lo cerró.

### Lo que no toca nadie

`src/server/`, `drizzle/`, `src/hooks/`, `src/app/`, los módulos `project` y
`profile`, y de `time-entry`: `schema.ts`, `service.ts`, `repository.ts`,
`actions.ts` y sus tests. De los componentes del calendario no cambian
`calendar-layout.ts` —`slotAt`, `slotDraft` y `Segment` quedan como están; el
asa de fin se decide en `segmentGestures`—, `calendar-layout.test.ts`,
`calendar-toolbar.tsx`, `calendar-totals.ts`, `calendar-zoom.ts`,
`calendar-href.ts`, `calendar-screen.tsx`, `period-picker.tsx`,
`entry-dialog*.tsx`, `entry-dialog-draft.ts` ni `labels.ts`. De los del
rastreador, solo `use-tracker-refresh.ts` y el `refresh-gate.ts` nuevo:
`tracker-bar.tsx`, `delete-entry-dialog.tsx` y `use-dialog-return-focus.ts` no
cambian, y `tracker-bar.tsx` sigue llamando a `useTrackerRefresh()` sin
argumento. De los e2e existentes, solo `calendar-page.ts`, con lo de arriba.
Los contratos y correcciones anteriores son históricos. El mapa y el estado de
la fase los actualiza team-lead.

### Handshake de orden

0. **Antes de implementar**: el contrato aprobado por `architecture-reviewer`
   contra `55ce3bf` (ronda 1 aplicada) y el ADR 0014 aceptado. Las dos
   decisiones del usuario están resueltas.
1. **Primer commit de `frontend-dev`**: `calendar-gestures.ts` con los tipos y
   las firmas de §5.2 (cuerpos que lanzan), `refresh-gate.ts` con su firma, y
   los atributos `data-block-handle` en `calendar-block.tsx` y
   `data-calendar-selection` en la grilla, aunque todavía no se dibujen. La
   suite existente sigue verde. Avisa a `e2e-tester`.
2. **`e2e-tester` arranca en paralelo** con `calendar-drag.spec.ts` y los pasos
   de `calendar-page.ts`, y confirma que cada recorrido falla por la
   funcionalidad —el bloque no se mueve, no hay asa, no hay selección— y no por
   el arnés. **Primero de todo**, una prueba en una página de juguete, en
   Chromium, que registra tres cosas: que `page.mouse` con pasos produce
   `pointermove` con `pointerType === "mouse"`; que `setPointerCapture` sobre
   un contenedor los sigue recibiendo fuera de él; y **adónde llega el `click`
   que sigue al `pointerup`** después de un arrastre con la captura sobre el
   contenedor y el botón soltado sobre un hijo. Si el `click` llega al hijo, se
   avisa antes de seguir, porque cambia §5.4, paso 7, y `onClickCapture` deja
   de ser defensa.
3. `frontend-dev` sigue con `calendar-gestures.ts` y sus tests, `refresh-gate.ts`
   y `use-tracker-refresh.ts`, y después el hook, el bloque, la grilla, la
   vista y el aviso.
4. `parity-analyst`, antes del merge.

### Responsabilidades que no se leen en el nombre del archivo

- **`calendar-gestures.ts`** es toda la regla: qué ofrece cada segmento, el
  candidato de cada gesto con su marca de casa, sus topes y sus huecos, la vista
  dibujada con otro trío, el umbral, la condición de inicio y el
  desplazamiento automático. No lee el DOM ni importa React. Importa
  `isMissing`, `slotDraft`, `Segment` y `minuteHeight` de `calendar-layout.ts`,
  y `fromView`, `draftDuration` y `draftExtraDays` de `time-draft.ts`; las
  horas, de `src/server/time`.
- **`use-calendar-gesture.ts`** es el único que mira eventos, coordenadas,
  `requestAnimationFrame` y la captura, y el que lleva el estado del gesto:
  armado, vivo, muerto hasta soltar. No decide nada que `calendar-gestures.ts`
  pueda decidir.
- **`calendar-grid.tsx`** llama al hook, reemplaza la vista de la entrada del
  gesto o en vuelo antes de `columnItems`, dibuja la selección, pasa
  `onGestureStart` a cada bloque y `beginCreate` a cada columna, y monta
  `onClickCapture` en su raíz. El clic en una franja sigue en `handleClick` con
  `slotAt`.
- **`calendar-view.tsx`** es dueño del pedido (§5.6), del estado
  `gestureActive` que pausa la revalidación y de `focusEntryId` al empezar y al
  terminar un gesto, y al cerrar sin acción el diálogo o la confirmación (§5.7).
- **`refresh-gate.ts`** es la compuerta pura; `use-tracker-refresh.ts` solo la
  aplica, después de mirar la visibilidad.

## 7. Criterios de aceptación

1. **CAL-50, CAL-53, CAL-57, CAL-60, CAL-97 a CAL-99, mover** — Arrastrar el
   cuerpo de un bloque lo lleva al día y a la marca bajo el puntero,
   conservando la distancia de reloj; al soltar, un pedido `updateEntryTimes`
   con ese trío, y el bloque queda en su lugar nuevo. Soltar con el mismo trío
   no pide, tampoco con un extremo fuera de marca que volvió a su marca de
   casa. Un bloque se puede soltar sobre otro, en el futuro o sobre el timer:
   **esta última oración es estructural**, porque ninguna regla del gesto mira
   otras entradas, ahora ni el timer, y no hay test que pueda fallar; se
   verifica por revisión de `calendar-gestures.ts`.
2. **CAL-52, CAL-55, CAL-56, CAL-57, CAL-90, estirar** — Las asas mueven un
   solo extremo; el otro no cambia de rótulo. El borde queda entre la primera
   marca posterior al otro extremo y la última anterior a 24 horas de él, salvo
   en su marca de casa, donde vale el original. Un bloque de distancia cero se
   estira y no se mueve.
3. **CAL-54, la medianoche** — Mover un bloque de 22:00 a 23:30 a las 23:00 lo
   deja de 23:00 a 00:30 del día siguiente, en dos segmentos; estirar un fin
   más allá del final de su columna sigue en la columna siguiente.
4. **CAL-44, CAL-49, crear** — Arrastrar sobre el fondo de una columna dibuja la
   selección de las franjas cubiertas, en las dos direcciones y sin salir de la
   columna; al soltar abre «Agregar entrada» con ese día, inicio y fin, sin
   guardar nada y sin selección dibujada detrás. Un clic sin recorrido sigue
   abriendo el alta de CAL-43.
5. **CAL-30, CAL-48, CAL-59** — Ningún gesto propone un extremo en un minuto que
   no existe de un día visible: se queda con el candidato anterior. Un bloque
   movido no empieza antes del piso.
6. **CAL-05, CAL-39, CAL-58, CAL-100** — Sin permiso de carga, en el timer y en
   una entrada con `editableTimes` en falso no hay asas ni se mueve; una entrada
   que empieza o termina fuera del período no tiene el asa de ese extremo.
7. **CAL-61, CAL-64** — El gesto no sale de las columnas visibles y el bloque
   soltado siempre tiene un segmento en el período: no aparece el aviso de
   CAL-46.
8. **CAL-62, TT-55, TT-89, TT-90** — Mientras viaja el pedido, el bloque está en
   su lugar nuevo, atenuado, con `aria-busy="true"` e inactivo, y no empieza
   otro gesto. Si falla, vuelve, la región muestra «No se pudo guardar el
   horario de la entrada.» con la causa, y «Reintentar» solo por red, que lo
   lleva a su lugar nuevo.
9. **CAL-63** — `Esc` y la pestaña oculta con un gesto en curso devuelven el
   bloque a su lugar, sin pedido, y soltar el botón después no pide ni abre
   nada. La pérdida del puntero cancela igual, sin e2e (§8).
10. **CAL-89** — Con un gesto en curso, enfocar la ventana no revalida; al
    terminar, sale una revalidación.
11. **CAL-23, CAL-77, el clic** — Con un gesto en curso ningún bloque muestra su
    detalle, y ni soltar ni soltar después de cancelar abren el diálogo del
    bloque ni el alta de un clic.
12. **Foco** — Al terminar un gesto sobre un bloque el foco está en su botón,
    también si cambió de columna y si el pedido falló. Con el foco ya en el
    botón, `focusEntryId` se limpia. Con la confirmación del borrado abierta,
    el foco no sale de ella, y cancelarla no deja un foco pendiente.
13. **ADR 0014** — Un gesto empieza solo con el botón principal del mouse; un
    toque abre lo mismo que un clic.
14. **El desplazamiento automático** — Con el puntero junto al borde inferior
    del área visible durante un gesto, la grilla se desplaza.
15. **La revalidación del rastreador** — `useTrackerRefresh()` sin argumento
    revalida como hoy.
16. **Lo existente sigue verde** — La suite de unidad, integración y e2e de
    `main` pasa, con solo el fixture de `calendar-block.test.tsx` cambiado.

### Con qué se verifica cada criterio

| Criterio | Tipo         | Archivo                                                  | Qué afirma                                                                                                                                                               |
| -------- | ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | unidad + e2e | `calendar-gestures.test.ts`; `e2e/calendar-drag.spec.ts` | `candidateAt` de `move` con cada zoom, tomado de un segundo segmento y con inicio fuera de marca; una de 10:07 que vuelve a casa da `original`; el recorrido 1           |
| 2        | unidad + e2e | `calendar-gestures.test.ts`; `e2e/calendar-drag.spec.ts` | `start` y `end` con sus topes, con el otro extremo en 10:07; cada extremo de 10:07 que vuelve a casa da `original`; `segmentGestures` con distancia cero; el recorrido 2 |
| 3        | unidad + e2e | `calendar-gestures.test.ts`; `e2e/calendar-drag.spec.ts` | el fin pasa a la columna siguiente y a 24:00 escrito «00:00»; el recorrido 2                                                                                             |
| 4        | unidad + e2e | `calendar-gestures.test.ts`; `e2e/calendar-drag.spec.ts` | `create` hacia arriba, hacia abajo, recortado a `1440 - zoom`; `initialCandidate` es `slotDraft`; el recorrido 3                                                         |
| 5        | unidad       | `calendar-gestures.test.ts`                              | con el hueco de Madrid del 2026-03-29, cada gesto da `null` con un extremo en `[120, 180)`; el piso con un día `beforeWorkspace`                                         |
| 6        | unidad       | `calendar-gestures.test.ts`; `calendar-block.test.tsx`   | `segmentGestures` por caso; el bloque sin `data-block-handle` con `NO_GESTURES` y con los dos cuando los ofrece                                                          |
| 7        | unidad       | `calendar-gestures.test.ts`                              | ningún candidato de `move` queda fuera del período (`isOutsidePeriod` falso) en los bordes                                                                               |
| 8        | e2e + unidad | `e2e/calendar-drag.spec.ts`; `calendar-block.test.tsx`   | el recorrido 4; `busy` da `aria-busy` y `aria-disabled`                                                                                                                  |
| 9        | e2e          | `e2e/calendar-drag.spec.ts`                              | `Esc` antes de soltar en los recorridos 1, 3 y 4, y `visibilitychange` con `visibilityState` reemplazado en el 1, sin pedidos ni diálogos                                |
| 10       | unidad + e2e | `refresh-gate.test.ts`; `e2e/calendar-drag.spec.ts`      | la compuerta junta disparos y suelta uno; el recorrido 4                                                                                                                 |
| 11       | e2e          | `e2e/calendar-drag.spec.ts`                              | los recorridos 3 y 4, con `Esc` antes de soltar sobre el fondo de una columna                                                                                            |
| 12       | e2e          | `e2e/calendar-drag.spec.ts`                              | los recorridos 1 y 4                                                                                                                                                     |
| 13       | unidad       | `calendar-gestures.test.ts`                              | `startsGesture` con `touch`, `pen`, el botón secundario y un puntero no primario                                                                                         |
| 14       | unidad + e2e | `calendar-gestures.test.ts`; `e2e/calendar-drag.spec.ts` | `autoScrollStep` en la banda y fuera; el recorrido 4                                                                                                                     |
| 15       | unidad + e2e | `refresh-gate.test.ts`; `e2e/tracker.spec.ts:444-447`    | con la compuerta abierta, cada disparo revalida; el e2e de TT-40, que cae con `paused = true` por omisión                                                                |
| 16       | todos        | las suites existentes                                    | en verde, con solo el fixture de `calendar-block.test.tsx`                                                                                                               |

**El criterio 12 es el de T-n6.** El mutante que relaja la guarda para enfocar
el bloque desde cualquier lado tiene que caer: en el recorrido 4, la respuesta
que llega con la confirmación del borrado abierta fija `focusEntryId`, y el
foco no sale de la confirmación ni se abre un detalle detrás. El mutante que no
limpia `focusEntryId` en `onOpenChange(false)` cae en el mismo recorrido:
después de «Cancelar», un foco en la región lo llevaría a «Falla». El que no lo
limpia con el foco ya en el botón cae en el recorrido 1: después de mover, un
foco en la región lo llevaría al bloque movido.

**El criterio 11 distingue el umbral, la captura y la cancelación.** El
mutante que toma la captura al apretar rompe el clic en un bloque y en una
franja, que los recorridos de `calendar.spec.ts` y `calendar-edit.spec.ts`
hacen. El mutante que se mata acá es **«cancelar suelta la captura sin
marca»**: con `Esc` antes de soltar, el `pointerup` y el `click` llegarían a la
columna, y `handleClick` abriría el alta en los recorridos 3 y 4. En el 1 no:
el botón se aprieta en el bloque y se suelta en otra columna, y el `click` va al
ancestro común (_corregido en las revisiones, T-n6_). Que el
`click` de un gesto terminado no llega al bloque lo garantiza la captura, no
`onClickCapture` (§5.4, paso 7): sacar `onClickCapture` no rompe ningún test, y
es a propósito.

**El criterio 5 no tiene e2e**: el workspace de los e2e está en Buenos Aires,
sin cambio de horario. Lo cubren los tests de unidad con el hueco de Madrid,
como CAL-92 en el 8c.

### Recorridos obligatorios de `e2e/calendar-drag.spec.ts`

Dueño: `e2e-tester`. **Cuatro tests, uno por recorrido**: cada uno abre una sola
sesión, por el límite del endpoint de sesión. Las entradas van en la **semana
anterior**, creadas con `clickSlot` y el diálogo, y se arrastran con
`dragBetween`; las respuestas se esperan con `withServerAction`; sin
`page.clock.install()`. Los pedidos se cuentan con `page.on("request")`, y una
ausencia se afirma después de un paso que sincroniza con la página, nunca con
una espera fija.

1. **Mover** (criterios 1, 9, 11, 12). Una entrada «Mover» el miércoles de 10:00
   a 11:00. Pasar el puntero por el bloque: un detalle abierto. Apretar el
   cuerpo y moverlo: ningún detalle abierto. Soltarlo en el jueves con el
   borde superior en la franja de las 14:00: el pedido sale, el bloque está en
   la columna del jueves con «14:00 – 15:00», no hay diálogo abierto y el foco
   está en su botón; después de la revalidación, el total del miércoles es
   «0:00» y el del jueves «1:00». Moverlo al viernes y volver al mismo lugar
   antes de soltar: ningún pedido. Moverlo al viernes, `Esc` con el botón
   todavía apretado y soltar sobre el fondo del viernes: el bloque vuelve al
   jueves, ningún pedido, no se abre «Agregar entrada» y el foco está en su
   botón. Moverlo al viernes y, con el botón apretado, reemplazar
   `document.visibilityState` por `"hidden"` y despachar `visibilitychange`: el
   bloque vuelve al jueves; restituir `visibilityState` y soltar: ningún pedido
   ni diálogo. Por último, enfocar la región «Calendario» —lo que hace un clic
   en un lugar vacío de ella—: el foco se queda en la región, no vuelve al
   bloque movido.
2. **Estirar y la medianoche** (criterios 2, 3). Con el zoom en «30 min», una
   entrada el martes de 10:00 a 11:00. Llevar el asa de fin a las 12:30:
   «10:00 – 12:30». Llevarla por encima del inicio: «10:00 – 10:30». Llevar el
   asa de inicio a las 09:00: «09:00 – 10:30». Con el zoom en «1 h», una entrada
   el lunes de 22:00 a 23:30 y otra el miércoles de 22:00 a 23:00, con la
   grilla desplazada al final. Mover el cuerpo de la del lunes una franja hacia
   abajo: «23:00 – 00:30» con su superíndice y un segmento en la columna del
   martes. Llevar el asa de fin de la del miércoles a la columna del jueves, a
   la altura de las 23:00: el fin pasa al jueves y se detiene en las 21:00,
   «22:00 – 21:00» con su superíndice.
3. **Crear arrastrando** (criterios 4, 9, 11). Con el zoom en «15 min», en el
   viernes, apretar en la franja de las 08:30 y llevar el puntero a la de las
   09:30: la selección dibujada con «08:30 – 09:45». Soltar: «Agregar entrada»
   con el viernes, 08:30 y 09:45, no el borrador de un clic. `Esc`: el diálogo se
   cierra, no hay selección dibujada ni bloque. Apretar en las 09:30, subir a
   las 08:15, `Esc` con el botón todavía apretado y soltar sobre el fondo del
   viernes: sin diálogo, sin selección y sin el alta de un clic. Apretar en las
   08:30 y llevar el puntero al sábado a la altura de las 09:00: la selección
   sigue en el viernes, «08:30 – 09:15». Soltar y «Agregar»: el bloque en el
   viernes.
4. **Falla, reintento, revalidación y desplazamiento** (criterios 8, 9, 10, 12,
   14). Una entrada «Falla» el miércoles de 09:00 a 10:00 y otra «Otra» el
   jueves de 09:00 a 10:00. Con `holdActionResponses`, llevar «Falla» a las
   11:00: el bloque en su lugar nuevo con `aria-busy="true"` y
   `aria-disabled="true"`. Con los gestos inactivos, apretar «Otra», mover el
   puntero unos píxeles sin salir del bloque y soltar sobre él: «Otra» no se
   mueve, y ese clic abre su diálogo. «Borrar» del menú, y con la confirmación
   abierta soltar las respuestas: cuando llega la revalidación, «Falla» dice
   «11:00 – 12:00» sin `aria-busy`, el foco sigue en la confirmación y no hay
   ningún detalle abierto. «Cancelar», y enfocar la región «Calendario»: el
   foco se queda en la región, no va a «Falla». Con `loseActionResponses` y
   `holdRefreshes`, llevar «Falla» a las 13:00: el aviso «No se pudo guardar el
   horario de la entrada.» con su causa y «Reintentar», el bloque de vuelta en
   «11:00 – 12:00» y el foco en su botón. Dejar de perder respuestas y soltar
   las revalidaciones; «Reintentar»: el foco en la región, nunca en `body`, y
   después en el bloque, con «13:00 – 14:00» y sin aviso. Apretar el bloque y
   moverlo, disparar `focus` en la ventana: ninguna revalidación mientras dura
   el gesto. Llevar el puntero junto al borde inferior del área visible: el
   `scrollTop` de la grilla sube. `Esc` y soltar: ningún pedido, y sale una
   revalidación.

## 8. Deuda conocida del slice

- **Cada gesto reinicia el intervalo de 60 s de la revalidación periódica**
  (`use-tracker-refresh.ts`, el efecto corre con cada cambio de `paused`). Una
  sesión de gestos seguidos demora esa revalidación; la que dispara el foco de
  la ventana sigue (P-n2 de las revisiones).
- **Los huecos de los días vecinos al período no se conocen.** Un bloque
  movido puede quedar empezando el día anterior al primero visible (`s < 0` en
  §5.2), o terminando el día siguiente al último. Si ese extremo cae en un
  hueco de ese día, el pedido llega al servidor, que responde
  `nonexistentClock` (CAL-59), y el bloque vuelve. Mandar los `missingMinutes`
  de un día más a cada lado en `calendarState` lo cierra.
- **La pérdida del puntero no tiene e2e**: `page.mouse` no produce
  `pointercancel` ni `lostpointercapture`. Comparte la rama de cancelación con
  `Esc` y la pestaña oculta, que sí la tienen (criterio 9).
- **Los totales no se mueven de forma optimista**: el día y el período se
  ponen al día con la revalidación (§1).
- **La duración en vuelo es la distancia de reloj**: en un día con cambio de
  horario la del servidor puede ser otra (TT-97), y aparece con la
  revalidación.
- **El orden de `Tab` en vuelo es el de antes**: `chronological` ordena por
  `startedAt`, que el cliente no recalcula (ADR 0005).
- **Un gesto por vez**: apretar mientras viaja el pedido anterior es un clic.
  Si se nota, una cola por entrada lo resuelve, con su reintento por pedido.
- **En la vista día no se mueve a otro día ni se estira más allá de las
  24:00**; en la semana, tampoco desde la última columna (CAL-61). Va por el
  diálogo.
- **Un bloque de distancia cero no se mueve** (CAL-90): se estira, o se mueve
  desde el diálogo.
- **Al estirar, el extremo quieto viaja con lo que muestra la pantalla**
  (CAL-97): si otra pestaña lo cambió, el gesto lo devuelve a ese rótulo. Es la
  regla de la fila; evitarlo pediría una mutación que reciba un solo extremo.
- **Táctil y lápiz sin gestos** (ADR 0014), y sin e2e de pantallas táctiles.
- **Reintentar después de una respuesta perdida deja dos constancias** iguales
  de `timeEntry.updateTimes`, como en la fila.
- **CAL-30, CAL-48 y CAL-59 sin e2e**: se verifican con la regla pura y el
  hueco de Madrid (criterio 5).
- **El ajuste y el desplazamiento automático no están verificados contra
  Clockify** (P-07): CAL-53 y CAL-61.
