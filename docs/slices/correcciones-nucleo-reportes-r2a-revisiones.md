# Correcciones de R2a del núcleo de reportes: revisiones

Salida de las revisiones sobre `main...4dd3982`. Seguridad (`security-auditor`): aprobado, un
menor; verificó los tres puntos del ADR 0020 (el alcance en la consulta por el `ReportScope`, la
URL armada a mano por un member, sin caché que cruce personas). Paridad (`parity-reviewer`, con la
aplicación levantada y siete roles y estados): aprobado, un menor de documento. Backend
(`backend-reviewer`): cambios requeridos, un mayor; acepta los cinco desvíos de `backend-dev`.
Frontend (`frontend-reviewer`): cambios requeridos, un mayor y dos menores; acepta los desvíos de
`frontend-dev`. Tests (`test-reviewer`): cambios requeridos, dos mayores y un menor. Código
(`clean-code-reviewer`): cambios requeridos, tres mayores y siete menores. El team-lead acepta lo
que sigue.

Antes de las revisiones: lint, typecheck, 1403 de unidad, 1273 de integración; la suite e2e
entera, 191 de 191 dos veces, y `reports.spec.ts` tres veces; mutantes: 34 de backend, 47 de 50 de
`test-engineer` y 9 de e2e. De los tres que sobrevivieron a `test-engineer`, el `::bigint` es
equivalente (sonda de 13 actores y 6 pedidos; `test-reviewer` coincide) y los otros dos son T2 y
F1.

**Medición (§6), en Postgres 18.6, la versión de Neon.** Medianas: Q1 0,679 ms (skip scan sobre
`time_entry_workspace_user_started_idx`, 31 búsquedas), Q2 21,165 ms (seq scan paralelo), Q3
0,980 ms, Q4 0,228 ms. Con el índice parcial: Q1 0,691 ms, Q2 no lo usa. **El índice no entra**
(§6.3) y no hay migración 0015. Se midió el 2026-10-08, un jueves: el volumen de Q1 depende del
día de la semana en que se corre `explain.sql` (un lunes no tiene filas).

## Backend

| Origen | Hallazgo                                                                                                                                                                                           | Resolución                                                                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1     | Un rango invertido llega al service y responde un reporte vacío, y uno de once años lee la historia entera: el tope de 366 días solo vive en el esquema de la URL. R6 va a reusar `getReportState` | El service calcula los días antes de leer y lanza `RangeError` fuera de 1 a 366 (invariante, no una segunda validación con mensajes). Test: el invertido y el de 367 días lanzan sin llamar al repository. Cierra también la observación de `test-engineer` |
| S1     | `seed.sql` no exige una base vacía                                                                                                                                                                 | Después de `begin`, corta si hay filas en `workspace` o en `"user"`                                                                                                                                                                                         |
| T1     | El test del criterio 8 no distingue truncar a segundos de truncar a milisegundos                                                                                                                   | La cuarta entrada cruza dos límites de segundo (`13:00:00.75` a `13:00:02.25`); los totales no cambian                                                                                                                                                      |
| T2     | El 12c sobrevive: un alcance opcional, `\| undefined` o `\| null` compila                                                                                                                          | `scope.test-d.ts` llama a las dos funciones con `undefined` y con `null` bajo `@ts-expect-error`                                                                                                                                                            |
| C1     | `dayRangeLabel` repite la cola de `weekKeyLabel`                                                                                                                                                   | `weekKeyLabel` termina llamando a `dayRangeLabel`. Se aparta de «no cambia ninguna función existente» de §1: es un refactor sin cambio de comportamiento, cubierto por los tests de `weekKeyLabel`                                                          |
| C4     | Tercera copia de la guarda de la paleta, sin el motivo                                                                                                                                             | `paletteKeyOf(color, projectId)` en `project/palette.ts`, usado por los tres services                                                                                                                                                                       |
| C7     | Las dos lecturas del repository repiten el `map` y la subconsulta                                                                                                                                  | `withSeconds(row)`; `totalsBy(scope, span, column)` solo si Drizzle lo tipa sin `as`                                                                                                                                                                        |
| C8     | `Read` no dice qué contiene; una copia del arreglo solo por el tipo                                                                                                                                | `ReportTotals` con `groups: ReportGroup[]`                                                                                                                                                                                                                  |

## Frontend

| Origen         | Hallazgo                                                                                                                    | Resolución                                                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1, T3, 13d-ii | Ningún test ejercita el `switch` de `handleApply`: sobreviven «`empty` cierra» y «`invalid` cierra sin el mensaje de RP-34» | El efecto de «Aplicar» pasa a una función pura en `range-picker-model.ts` (`{ open, error, href }`) con sus tres casos en unidad; el componente solo la aplica. Más un paso e2e en el recorrido 4: un período de un día, clic en ese día, «Aplicar» con `aria-disabled`, el selector sigue abierto y ningún pedido sale |
| F2             | El test de «hoy» usa la fecha real del 2026-10-08 y su mutante sobrevive ese día                                            | Fecha del proceso fija con `vi.setSystemTime`, distinta de `todayKey`                                                                                                                                                                                                                                                   |
| F3, C10        | `ec02ea6` trae la navegación antes de la ruta; `4e71ee2` describe un cambio que llega en `4dd3982`                          | No se reescribe la historia de una rama compartida; queda anotado                                                                                                                                                                                                                                                       |
| C6             | El aviso de membresía inactiva, por tercera vez                                                                             | Un aviso en `src/components` con el cuerpo como prop, usado por las tres pantallas                                                                                                                                                                                                                                      |
| C5             | Tercera copia de la configuración del calendario de mes                                                                     | Deuda: la entrada del `DayCalendar` compartido nombra también a `RangePicker`                                                                                                                                                                                                                                           |

El desvío 2 de `frontend-dev` (las líneas y los totales en `ReportView`) corrige una contradicción
del contrato entre §5.1 y el criterio 13: vale lo implementado.

## e2e

| Origen | Hallazgo                                                                           | Resolución                                                                               |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| C2     | `reports-page.ts` copia `pad`, `sameDay` y la cola de `weekLabel` de `e2e/days.ts` | `days.ts` exporta `sameDay` y un `dayRangeLabel(first, last, today)` que usa `weekLabel` |
| C3     | Tercera copia de `seedPersonEntries`                                               | Una sola, exportada, con la zona como parámetro                                          |
| C9     | `seedPerson` con un alias propio y la quinta copia del bloque de transacción       | `insertOneRow` directo y un `withTransaction(work)` usado por las cinco                  |

## Paridad

| Origen | Hallazgo                                                                                                            | Resolución                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| P1     | «Años de cuatro cifras» no coincide con el piso real, `0100-01-01` (convención de `parseDayKey`, fijada por CAL-17) | `reportes.md` dice el piso explícito en RP-20, RP-32 y RP-34: del 0100-01-01 al 9999-12-31, como CAL-17. Sin cambio de código |
