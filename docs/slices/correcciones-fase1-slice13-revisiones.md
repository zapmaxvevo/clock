# Correcciones del slice 13: revisiones

Salida de las revisiones sobre `520a1e8..b640001`. Backend (`backend-reviewer`): aprobado, dos
menores. Seguridad (`security-auditor`): aprobado, sin hallazgos. Frontend (`frontend-reviewer`):
cambios requeridos, un mayor y cuatro menores. Código (`clean-code-reviewer`): cambios requeridos,
uno marcado bloqueante, cuatro mayores y seis menores. Tests y paridad corren después de la ronda
de correcciones, con el e2e commiteado. El team-lead acepta todo lo que sigue.

Los desvíos que declaró `frontend-dev` se aceptan: el `h1` y la barra en `TimesheetScreen`; el
aviso de una celda nombra la celda; el foco a la primera celda escribible después de elegir el
par; la fila quitada con éxito queda oculta hasta la próxima foto; sin `canTrack`, lo guardado en
el navegador no se poda. El de los dos `alert` anidados lo corrige F-m1, y el de
`key={state.weekStart}`, F-m2.

## Backend

| Origen      | Hallazgo                                                                                                                                | Resolución                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-M1 / B-m1 | `timesheet-cell.ts` suma y compara duraciones a mano (`MINUTE_MS`, `plusMinutes`) fuera de `src/server/time`                            | `addMinutes(instant, minutes)` en `src/server/time` con su test; el umbral pasa a `durationSeconds(start, end) < 60`. Sin cambio de comportamiento. |
| C-M2        | `removeTimesheetRow` repite el bloque de borrado y auditoría de `bulkDeleteEntries`                                                     | Un helper privado del service que usan las dos, con la acción de auditoría como parámetro.                                                          |
| C-M4        | `fullWeekdayLabel` copia `weekdayLabel`                                                                                                 | Un helper privado en `src/server/time` y las dos públicas como envoltorios.                                                                         |
| B-m2        | Cada entrada pasa ocho veces por `dayKey` en `getTimesheetState`                                                                        | El día de cada entrada se calcula una sola vez.                                                                                                     |
| C-m4        | `timesheetRowView` copia a mano `project` y `task` de `timeEntryView`                                                                   | Constantes compartidas en `schema.ts`.                                                                                                              |
| C-m5        | `listTimesheetEntries` repite `inSlice` sin el par                                                                                      | Un `inSpan` que `inSlice` extiende.                                                                                                                 |
| C-m6        | `isWeekendKey` deduce el día de la semana con dos `weekStartKey`, fuera de `src/server/time`; una línea de 106 columnas en `ClockField` | `isWeekendDayKey(dayKey)` en `src/server/time` con su test. El comentario de `ClockField` lo reacomoda `frontend-dev`.                              |

## Frontend

| Origen | Hallazgo                                                                                                                                           | Resolución                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-M1   | «Reintentar» desmonta el botón que tiene el foco y el foco cae a `body`, en la celda y en la fila                                                  | Antes de reintentar, el foco va a la celda (queda `busy` y `readOnly`, con foco); en la fila, a «Añadir nueva fila» o a la región, como `confirmRemove`. Un paso de e2e lo fija. |
| F-m1   | Dos `role="alert"` anidados; la región vacía con `empty:hidden` sale del árbol de accesibilidad                                                    | La región pierde el rol y su comentario se corrige: el anuncio lo da el `alert` de `ActionFeedback`. `ActionFeedback` no cambia.                                                 |
| F-m2   | Con `key={state.weekStart}`, una falla de una escritura en vuelo al cambiar de semana se pierde sin aviso                                          | Sin `key`: `added`, `newRow` y `removals` se reinician con el patrón de ajustar en el render cuando cambia `state.weekStart`; el `cellWriter` y la falla se conservan.           |
| F-m3   | La X solo se inactiva con un `sending`; con un `settled` que todavía no está en la foto, la fila se quita sin diálogo o el diálogo cuenta de menos | `rowBusy` mira cualquier registro de la fila, `sending` o `settled`.                                                                                                             |
| F-m4   | Ningún test cubre el cambio de identidad de `state` en `use-cell-writes.ts`                                                                        | Un recorrido e2e: escribir una celda, cambiarla desde otra pestaña, revalidar y comprobar que la primera muestra el valor nuevo.                                                 |
| C-M3   | `catalogSource` repite la búsqueda de `isTrackablePair`                                                                                            | `catalogEntryOf(catalog, pair)` exportada desde `picker-model.ts`; `isTrackablePair` y `catalogSource` la usan.                                                                  |
| C-M5   | `TimesheetView` lleva entero el flujo de «Quitar fila»                                                                                             | `use-row-removals.ts`, simétrico a `useCellWrites`, y un `sendOrUnexpected` compartido con `cellWriter` dentro de `timesheet/`.                                                  |
| C-m1   | `cellKeyOf({ date: "row", ...pair })` como clave de fila                                                                                           | `rowKeyOf(pair)`, y `cellKeyOf` arma la clave de celda con ella.                                                                                                                 |
| C-m2   | `TimesheetView` repite `pairOf`                                                                                                                    | Se exporta desde `timesheet-model.ts`.                                                                                                                                           |
| C-m3   | `TimesheetView` repite `totalOf`                                                                                                                   | La fila del modelo lleva su total formateado.                                                                                                                                    |

## E2E

El spec (`e2e/timesheet.spec.ts`, `e2e/timesheet-page.ts`, `e2e/days.ts`) pasa sus 15 recorridos
en una corrida aislada, pero en tres corridas completas del archivo falló uno distinto cada vez,
siempre en el armado por la interfaz del rastreador (`pickProject` espera el foco en el
selector). Se estabiliza antes de commitearlo, y suma los pasos de F-M1 y F-m4.
