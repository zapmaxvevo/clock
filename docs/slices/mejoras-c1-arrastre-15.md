# Mejoras, C1: el arrastre del calendario ajusta a 15 minutos

Slice chico, fuera del orden de la fase 2, pedido por el usuario el 2026-10-16: «en el
calendario, cuando arrastrás solo va por hora; debería ser que pueda cada 15 minutos». Rama
`mejoras/c1-arrastre-15` desde `main` en `e4a6c60`. **No cambia nada del servidor**, ni el
esquema, ni los permisos: es la regla pura de los gestos (`calendar-gestures.ts`) y el ancla de
la selección del alta.

Fuente: CAL-44, CAL-50 a CAL-57 de `docs/parity/calendario.md` y §5.1 y §5.2 del
[contrato del 8b](fase1-slice8b-calendario-arrastre.md), que este slice corrige en un solo
punto: **las marcas de la recta ya no son los múltiplos del zoom, sino los del paso del
arrastre**.

## Decisión

**D1 (team-lead). El paso del arrastre es `min(zoom, 15)`**: 15 minutos con el zoom en 60, 30 o
15, y 5 con el de 5. Es el paso de todo borde que se mueve —mover, estirar el inicio o el fin y
crear arrastrando—. **El zoom, el alto de la franja y el dibujo de la grilla no cambian**
(CAL-11), ni la duración por defecto de un alta por clic (CAL-43: una franja del zoom).

## Qué es paso del arrastre y qué no

| Uso de `zoom` hoy                                                                                      | Qué es                          | En C1                             |
| ------------------------------------------------------------------------------------------------------ | ------------------------------- | --------------------------------- |
| `lineOf`: `round`, `nextMark`, `lastMark` (`calendar-gestures.ts:153-155`)                             | paso del arrastre               | pasa al paso                      |
| `move`: tope de arriba `line.end - grid.zoom` (`:194`)                                                 | paso (última marca del período) | `line.end - paso`                 |
| `create`: `longest`, `slotOf(…, grid.zoom)` y `+ grid.zoom` (`:253-256`)                               | paso (celdas de la selección)   | pasa al paso                      |
| `CreateGesture.anchor`, el minuto que pasa `DayColumn` (`calendar-day-column.tsx:150-153`)             | paso (celda tocada)             | la celda del paso bajo el puntero |
| `initialCandidate` de `create`, `slotDraft(…, grid.zoom, …)` (`calendar-gestures.ts:137-138`)          | borrador de un clic (CAL-43)    | sigue siendo el de un clic        |
| `gridMinuteAt` y `minuteHeight(zoom)` (`:299-307`; `calendar-layout.ts:27-29`)                         | escala en píxeles               | no cambia                         |
| `slotOf`, `minuteAt`, `slotAt`, `slotDraft`, `addEntryDraft` (`calendar-layout.ts:154-224`)            | clic y «Agregar entrada»        | no cambian                        |
| `CalendarSelection` y `layoutColumn` (`calendar-day-column.tsx:225-233`; `calendar-layout.ts:300-303`) | dibujo                          | no cambian                        |
| Cancelar con otro zoom (`use-calendar-gesture.ts:419-429`)                                             | ciclo del gesto                 | no cambia                         |
| Desplazamiento automático y umbral (`calendar-gestures.ts:339-354`)                                    | píxeles                         | no cambian                        |

**Teclado**: no hay gestos de teclado (§5.9 del 8b); nada que cambiar.

## Contrato de código

En `src/modules/time-entry/components/calendar/calendar-gestures.ts`:

```ts
/** CAL-53: el paso del borde que se mueve, `min(zoom, 15)`. La grilla se dibuja con el zoom. */
export function dragStep(zoom: CalendarZoom): CalendarZoom;

/**
 * CAL-44: el ancla de una selección, la celda del paso bajo el puntero en una
 * columna: `slotOf(offsetPx / minuteHeight(zoom), dragStep(zoom))`.
 */
export function selectionAnchor(offsetPx: number, zoom: CalendarZoom): number;
```

- **`GestureGrid` no cambia**: sigue llevando `zoom`, y el paso se deriva adentro con
  `dragStep(grid.zoom)`. `calendar-grid.tsx` y `use-calendar-gesture.ts` no se tocan.
- **`lineOf`** arma `round`, `nextMark` y `lastMark` con el paso. Con eso valen sin más cambios
  la marca de casa (CAL-57), los topes de `start` y `end` (CAL-55, CAL-56) y el piso de `move`
  (`nextMark(-span)`, CAL-61). El tope de arriba de `move` pasa a `line.end - paso`.
- **`create`**: `slot = slotOf(pointer - base, paso)`, `to = max(anchor, slot) + paso` y
  `longest = MINUTES_PER_DAY - paso`. La selección cubre las celdas del paso entre la tocada y la
  del puntero, en las dos direcciones, y mide como máximo 24 horas menos un paso.
- **`CreateGesture.anchor`** pasa a ser «la celda del paso tocada, la de `selectionAnchor`».
  `DayColumn.handlePointerDown` sigue con la misma compuerta —`slotUnder` no nulo: donde un clic
  no abre nada, tampoco empieza una selección— y le pasa a `onCreateStart`
  `selectionAnchor(offset, zoom)` con el mismo `offset` que usa `slotUnder`, en vez del minuto de
  `slotAt`. La forma de reusar el `offset` la elige `frontend-dev`.
- **`initialCandidate` de `create`** sigue siendo el borrador de un clic en esa franja:
  `slotDraft(día, slotOf(anchor, grid.zoom), grid.zoom, missingMinutes)`. Como el paso divide al
  zoom, `slotOf(anchor, zoom)` es el minuto de `slotAt`, así que la compuerta lo garantiza sin
  hueco. Es el «anterior» si el primer candidato es `null`.
- Los comentarios que dicen «franja» por el paso pasan a «paso» o «marca»:
  `calendar-gestures.ts:66`, `:141`, `:257`; `calendar-day-column.tsx:84`.

Consecuencias que el contrato acepta: **la banda de la marca de casa se achica** con el zoom en 60
de ±30 a ±7,5 minutos (±6 px), más que el umbral de 4 px (5 minutos), así que un arrastre
apenas pasado el umbral sigue sin escribir; y **un arrastre corto sobre el fondo con el zoom en 60
propone una celda de 15 minutos**, no la hora del clic.

## Reparto

- **frontend-dev**: `calendar-gestures.ts`, `calendar-day-column.tsx` y
  `calendar-gestures.test.ts`. Nada más; si algo pide tocar otro archivo, avisa antes.
- **e2e-tester**: `e2e/calendar-drag.spec.ts`. `e2e/calendar-page.ts` solo si hace falta un
  ayudante. Trabaja en paralelo con los valores de este contrato.
- **parity-analyst**: `docs/parity/calendario.md`.
- **Nadie toca**: `calendar-layout.ts`, `calendar-zoom.ts`, `use-calendar-gesture.ts`,
  `calendar-grid.tsx`, el servidor, ni los contratos del 8b (son históricos).

### Tests unitarios que cambian (`calendar-gestures.test.ts`, en `e4a6c60`)

| Línea     | Test                                                      | Hoy                                  | Con C1                                                                     |
| --------- | --------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `237-244` | lleva el bloque al día y a la marca bajo el puntero       | 14:00–15:00                          | 14:15–15:15                                                                |
| `246-252` | ajusta a la marca más cercana con cada zoom               | 13:00 / 13:30 / 13:15 / 13:25        | 13:15 / 13:15 / 13:15 / 13:25; el nombre pasa a «con el paso de cada zoom» |
| `254-263` | marca de casa, una de 10:07                               | puntero 10:21 da el original         | 10:21 ya da 10:15–10:45; el original con el puntero en 10:14               |
| `288-298` | tomada lejos de su inicio, el tope de arriba              | 19:00–01:00                          | 18:15–00:15; «le deja un paso»                                             |
| `300-307` | no sale por el final                                      | 23:00–00:00                          | 23:45–00:45; «el último paso»                                              |
| `371-378` | el asa de inicio mueve solo el inicio                     | 09:00                                | 08:45                                                                      |
| `380-383` | inicio de 10:07 vuelve a su marca de casa                 | puntero 10:25                        | 10:25 ya da 10:30; el original con el puntero en 10:05                     |
| `385-393` | el inicio se detiene en la última marca                   | 10:00; 09-29 12:00                   | 10:45; 09-29 11:15                                                         |
| `417-441` | el asa de fin sigue a la columna siguiente (zoom 30 y 60) | 12:30; 10:30; 21:00                  | 12:45; 10:15; 21:45                                                        |
| `443-447` | fin de 10:07 vuelve a su marca de casa                    | 11:10 da 11:00                       | 11:10 da 11:15                                                             |
| `496-509` | como máximo 24 horas menos una franja                     | 00:00–23:00; ancla 1380, 01:00–00:00 | 00:00–23:45; ancla 1425, 00:15–00:00; «menos un paso»                      |
| `511-521` | crear con un extremo que no existe (zoom 30)              | 01:30 da `null`; 01:10 da 01:30      | `null` con el puntero en 01:50; 01:10 da 01:15                             |

Los demás quedan como están; `272-286`, el piso, la medianoche y los huecos de `move` dan lo
mismo con el paso. **Tests nuevos**: los criterios 1 a 8 que ningún caso de la tabla ya cubra.
Cada test nuevo o cambiado falla con el paso viejo (mutante: `dragStep` que devuelve `zoom`).

### Recorridos e2e (`e2e/calendar-drag.spec.ts`, en `e4a6c60`)

- **Cambian**, en «las asas estiran un extremo…»: el fin estirado por encima del inicio a «30
  min» queda en «10:00 – 10:15» (`:342`, hoy «10:30»), y el inicio llevado a las 09:00 da
  09:00–10:15 con «1:15» (`:351-360`); el fin de «Miércoles tarde» a «1 h» se detiene en las
  **21:45** del jueves, con «23:45» (`:414-436`, hoy 21:00 y «23:00»). Los comentarios de `:335`
  y `:414-415` pasan a «un paso» y «21:45».
- **Nuevos**, a «1 h», donde está el pedido del usuario (criterio 9).
- **No cambian**: los demás movimientos van a horas en punto con `grabPoint` y caen igual;
  `date-floor.spec.ts:96-100` y `manual-retry.spec.ts:780-786` también. La selección de «15 min»
  (`:439-517`) da lo mismo, porque ahí el paso es el zoom.

### parity-analyst

En `docs/parity/calendario.md`, con nota `_Corregido el 2026-10-16, C1_` que cite el texto
anterior:

- **CAL-53** (`:758-762`): el borde que se mueve cae en múltiplos de **15 minutos, o de la
  franja si es más chica** (5 con el zoom en 5); el zoom y el dibujo de la grilla no cambian.
  Justificación: **decisión del usuario del 2026-10-16**. Sale «para un ajuste más fino, se
  acerca el zoom» salvo para los 5 minutos. El `_No verificado_` queda.
- **CAL-44** (`:600-610`): «ajustada al zoom» pasa a «ajustada al paso del arrastre (CAL-53)»;
  el clic sin recorrido sigue siendo CAL-43.
- **CAL-50** y **CAL-52** (`:737-756`): «ajustada al zoom» pasa al paso de CAL-53.
- **CAL-55** (`:777-796`) y **CAL-56** (`:798-809`): «marca de franja» y «24 horas menos una
  franja» pasan a la marca y al paso de CAL-53; el título de CAL-56 pasa a «Mínimo un paso». Los
  ejemplos de 10:07 siguen valiendo con cualquier zoom salvo el de 5.
- **La sección del 8b** (`:1535-1544`): CAL-44, CAL-50, CAL-52 y CAL-53 con el mismo cambio, y
  una sección corta «C1» con lo entregado, como las de cada slice.

## Criterios de aceptación

En la recta de §5.1 del 8b; «a las HH:MM» es el punto bajo el puntero, sin el agarre.

1. **`dragStep`**: 60 → 15, 30 → 15, 15 → 15, 5 → 5.
2. **Mover** (CAL-50, CAL-53), zoom 60, una entrada de 10:00 a 11:00 tomada por su inicio: con el
   puntero a las 13:07 queda de 13:00 a 14:00; a las 13:08, de 13:15 a 14:15. Con el zoom en 30,
   a las 13:20 queda a las 13:15; con el de 5, a las 13:23 queda a las 13:25.
3. **Estirar** (CAL-52), zoom 60, una entrada de 09:00 a 10:00: el fin soltado a las 10:07 no
   escribe (vuelve a su marca, CAL-57); a las 10:08 queda en 10:15. El inicio a las 08:37 queda
   en 08:30; a las 08:38, en 08:45.
4. **Mínimo un paso** (CAL-56), zoom 60, la misma entrada: el fin llevado por encima del inicio
   se detiene en 09:15; el inicio llevado por debajo del fin, en 09:45.
5. **Menos de 24 horas** (CAL-55), zoom 60: el fin de una entrada del miércoles de 22:00 a 23:00
   llevado a las 23:00 del jueves se detiene en las 21:45 del jueves (23:45 de duración). El
   inicio de una de 10:07 a 11:00 del miércoles llevado al lunes a las 00:00 se detiene el martes
   a las 11:15.
6. **Marca de casa** (CAL-57), zoom 60, una entrada de 10:07 a 10:37 tomada a las 10:17: con el
   puntero a las 10:14 el candidato es el original; a las 10:19, de 10:15 a 10:45.
7. **Bordes del período** (CAL-61), zoom 60: un bloque de una hora llevado al final empieza a lo
   sumo el domingo a las 23:45; uno del domingo anterior de 20:00 a 02:00 tomado a las 01:50 del
   lunes y llevado arriba queda de 18:15 a 00:15. Con los cuatro zooms nunca queda fuera del
   período (el test de `:309-334` sigue en verde).
8. **Crear arrastrando** (CAL-44), zoom 60: `selectionAnchor` a la altura de las 10:40 da 10:30
   (con el zoom en 5, a la de las 10:42 da 10:40; nunca menos de 0 ni más de `1440 - paso`).
   Con el ancla en 10:30, el puntero a las 11:10 selecciona de 10:30 a 11:15, y a las 09:50, de
   09:45 a 10:45. Con el ancla en 00:00 y el puntero a las 23:59, de 00:00 a 23:45; con el ancla
   en 23:45 y el puntero a las 00:00, de 00:15 a 00:00. **El clic sin recorrido no cambia**: a
   las 10:40 con el zoom en 60 abre el alta de 10:00 a 11:00, e `initialCandidate` con el ancla
   en 10:30 es ese mismo borrador; en Madrid el 2026-03-29, con el ancla en 01:15, es 01:00–03:00.
9. **En la pantalla, a «1 h»** (e2e): un bloque llevado con `grabPoint(…, "14:15")` queda de
   14:15 a 15:15; el asa de fin llevada a `slotPoint(…, "11:15")` deja el fin en 11:15; apretar
   el fondo en `slotOffset("08:00")` y llevar el puntero a `slotPoint(…, "09:15")` muestra la
   selección «08:00 – 09:30» y abre el alta con ese rango. Los tres fallan con el paso viejo
   (14:00, 11:00 y 08:00 – 10:00).
10. **La grilla no cambia**: los tests de `calendar-layout.test.ts`, `calendar-zoom.test.ts` y
    los e2e del zoom y del clic (`calendar.spec.ts`, `calendar-edit.spec.ts`) siguen en verde sin
    tocarlos.
11. `npm run lint && npm run typecheck && npm run test:all` y `npm run test:e2e` en verde.

## Supuestos sobre el árbol (`e4a6c60`)

- `calendar-gestures.ts:141-155`: `lineOf` arma las marcas con `grid.zoom`; `:194`, el tope de
  `move` con `grid.zoom`; `:250-264`, `create` con `grid.zoom` en `slotOf`, `to` y `longest`;
  `:133-139`, `initialCandidate` con `slotDraft(…, grid.zoom, …)`.
- `calendar-day-column.tsx:117-129` y `:145-154`: `slotUnder` mide `offset` y devuelve el minuto
  de `slotAt`, que es el `anchor` que recibe `onCreateStart`; `calendar-grid.tsx:258-259` y
  `use-calendar-gesture.ts:386-391` lo pasan sin mirarlo.
- `calendar-layout.ts:162-165`: `slotOf(minute, size)` sirve para cualquier tamaño de
  `CalendarZoom`, y 15 y 5 lo son.
- `calendar-zoom.ts:7`: los zooms son 60, 30, 15 y 5; el paso divide a cada uno y a 1440, así que
  una marca del paso es también una marca de su columna (§5.1 del 8b).
