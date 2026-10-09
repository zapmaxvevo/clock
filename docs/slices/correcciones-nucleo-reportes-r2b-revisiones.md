# Correcciones de R2b del núcleo de reportes: revisiones

Salida de las revisiones sobre `9f5b82c..c848d00` (backend, frontend, seguridad y código) y
`9f5b82c..9494375` (tests y paridad). Seguridad (`security-auditor`): aprobado, sin hallazgos;
verificó los tres puntos de §7, paso 9 (el alcance de `totalsByBucket` con `inScope`, la URL
armada a mano por un member con `agrupar=fecha` o `cliente` y `personas=…`, y que los cortes los
arma el servidor). Backend (`backend-reviewer`): aprobado, cuatro notas. Frontend
(`frontend-reviewer`): aprobado, un menor. Tests (`test-reviewer`): aprobado, un menor. Código
(`clean-code-reviewer`): aprobado, siete menores. Paridad (`parity-reviewer`, con la aplicación
levantada): la pantalla cumple RP-11, RP-12, RP-20, RP-22, RP-24, RP-28 y RP-32 y D-R2b-1 a
D-R2b-10 sin desvíos de comportamiento; cambios requeridos solo por `reportes.md`. El team-lead
acepta lo que sigue.

Antes de las revisiones: lint, typecheck, 1480 de unidad, 273 de `test:time-ar`, 1288 de
integración; `reports.spec.ts` 10 de 10 tres veces y la suite e2e entera 194 de 194 dos veces.
Mutantes: la tabla de §8.1 entera de `test-engineer` (ninguno vivo salvo el de T1), 17 de
`backend-reviewer`, 10 de §8.2 más el de la barra sin `shortcuts` en e2e, 19 de 20 y 10 de 10 de
`frontend-dev` (el que sobrevive en unidad, la barra sin `shortcuts`, cae en el e2e 7). Un
equivalente declarado: los `Date` en el arreglo en vez del texto ISO (52 de 52 iguales con `TZ`
en UTC, Buenos Aires y Madrid).

**Medición (§6), en Postgres 18.6, la versión de Neon.** 187 925 entradas de `seed.sql`,
medianas de cinco corridas: Q5 (`totalsByBucket`, everyone, 366 tramos) 48,2 ms con presupuesto
de 150 (seq scan y `HashAggregate`); Q6 (self) 1,6 ms con presupuesto de 30 (index scan sobre
`time_entry_workspace_user_started_idx`); Q1 a Q4, 1,17 / 25,3 / 1,06 / 0,38 ms, ruido respecto
de R2a. `dayBuckets` de 366 días: 2,60 ms en Buenos Aires y 2,84 ms en Madrid (presupuesto 20).
Sin índice nuevo. Desvío de forma de §6.1: los cortes se arman con `generate_series` y `\gset`
antes del `execute`, porque Postgres no admite una subconsulta como parámetro de `EXECUTE`.

**Comprobación contra Neon (§6.3, criterio 15): pendiente del usuario.** Preview de `6561286`
(la consulta no cambió desde `51fe0ce`). Bloquea el merge de la parte B.

## Desvíos de implementación

| Origen      | Desvío                                                                                                                                                                                                                  | Resolución                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| backend, 1  | `a8dfac4` toca fuera del reparto de §7 para compilar: `shortcuts: []` en los fixtures de componentes, el caso `client` en `report-view.tsx` y en `summaryOf` de `scope.integration.test.ts`, y `projectLabels.noClient` | Aprobado por el team-lead antes del commit; frontend y `test-engineer` lo dejaron o lo reescribieron |
| backend, 4  | `51fe0ce` suma `date` en `GROUP_COLUMN_HEADINGS`, `groupKey` y `GroupHeading`, y `labels.byDate`                                                                                                                        | Aprobado, con la regla de esperar a que los dueños commitearan lo pendiente de esos archivos         |
| frontend, A | El atajo cierra con `onNavigate` de `next/link` y no con `onClick`: Ctrl o Cmd abren otra pestaña y el selector queda abierto                                                                                           | Aceptado; `frontend-reviewer` y `parity-reviewer` lo verificaron                                     |
| e2e, A      | `expectGroupBy` lee los enlaces que dibuja la barra y no recorre `GROUP_LINK`                                                                                                                                           | Se reemplaza por una aserción web-first (C3)                                                         |

## Backend

| Origen | Hallazgo                                                                                                                         | Resolución                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | `period.test.ts` no prueba un destino inválido de la flecha por días; el mutante solo cae en dos tests de R2a de integración     | Sumar el caso de `test-reviewer`: una semana del 9999-12-18 al 24 no tiene siguiente y una desde el 0100-01-01 no tiene anterior               |
| B3     | La guarda de tramos vacíos de `totalsByBucket` (`repository.ts:215`) no tiene test                                               | `rejects.toThrow(RangeError)` con `buckets` vacío, sin llamar a la base                                                                        |
| B4     | El borde de 366 días se lee solo por persona (`service.integration.test.ts:857`)                                                 | Sumar `date` a ese test                                                                                                                        |
| C4     | Tercera copia de la igualdad de rangos (`period.ts:71`, `range-picker.tsx:151`, `report-toolbar.tsx:21`)                         | `sameRange(left, right)` exportada de `report/schema.ts` junto a `ReportRange`; backend la usa en `period.ts`, frontend en los dos componentes |
| C5     | `yearOf` en `period.ts:76-82` copia `civilDateOf` de `src/server/time`                                                           | Exportar la función de `time` y usarla                                                                                                         |
| C6     | `compareDays` ordena por el formato de la clave fuera de `time` (`service.ts:188-198`)                                           | `compareDayKeys` en `src/server/time`, que reusa `earliestDayKey`                                                                              |
| N1     | Listas de agrupaciones escritas a mano en los tests (`service.integration.test.ts:443` y `:844`, `scope.integration.test.ts:75`) | `REPORT_GROUP_BYS`                                                                                                                             |
| N2     | `isValidRange(x) ? x : null` tres veces en `period.ts`                                                                           | Un `validOrNull`                                                                                                                               |
| N3     | `explain.sql:2` más larga que el resto del comentario                                                                            | Reflow                                                                                                                                         |
| B1, B2 | Neon pendiente; los números de la medición no estaban en `docs/`                                                                 | B1 queda en la comprobación de §6.3; B2 queda cerrado con este documento                                                                       |

## Frontend

| Origen | Hallazgo                                                                                                                                    | Resolución                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F1     | En pantallas angostas (375 y 320 px) el selector queda 5 px más ancho que la ventana y se corta; a 320×568 «Aplicar» queda debajo del borde | `max-w-(--available-width)` y `max-h-(--available-height) overflow-y-auto` en `PopoverContent` (`range-picker.tsx:82`), medido |
| P-N1   | A 320 px el grupo «Agrupar por» con cuatro enlaces se sale de la pantalla (`report-toolbar.tsx:61-68`)                                      | `flex-wrap` en el grupo; medido a 320 y 375                                                                                    |
| C7     | `GroupHeading` sin tipo de retorno (`report-view.tsx:117`): un `kind` nuevo dejaría la fila vacía en silencio                               | Anotar el tipo de retorno                                                                                                      |
| C4     | La igualdad de rangos en `range-picker.tsx` y en `report-toolbar.tsx`                                                                       | Usar `sameRange` de `schema.ts`, después del commit de backend                                                                 |
| N1     | Una vez el foco quedó en `body` al elegir un atajo; 36 de 36 bien al repetir                                                                | Sin cambio; el e2e 7 lo afirma. Si aparece intermitente en CI, se reabre                                                       |
| N2     | `<ul aria-label="Atajos">` sin `role="list"`                                                                                                | Deuda del proyecto entero (la lista de tareas tiene el mismo patrón); no en este slice                                         |
| N3     | `truncate` sobre un `span` en línea en el nombre del cliente (`report-view.tsx:167`)                                                        | Sin efecto visible; se deja                                                                                                    |
| —      | `tabular-nums` en la columna de fechas                                                                                                      | No: el rótulo empieza con la abreviatura del día y va alineado a la izquierda                                                  |

## e2e

| Origen | Hallazgo                                                                                                                        | Resolución                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| C1     | El comentario de `reports.spec.ts:503-505` dice «los dos proyectos del cliente»; es un proyecto con dos entradas                | Corregir el comentario y dejar los datos, que fija §8.2; el plegado de dos proyectos va en integración |
| C2     | `shortcutRange` repite `currentWeekRange` y `lastWeekRange` (`reports-page.ts:133-137`)                                         | Llamarlas                                                                                              |
| C3     | `expectGroupBy` reintenta a mano con `expect.poll` y su comentario describe un estado de transición (`reports-page.ts:312-332`) | Aserción web-first sobre `[aria-current="true"]` del grupo; el comentario dice el motivo que dura      |
| T2     | Los recorridos 8 y 9 afirman totales sin afirmar que el alcance es propio (`reports.spec.ts:461`, `:521`)                       | `SCOPE_SELF` visible antes del total, como en R2a                                                      |
| N3     | Reflow del comentario de `reports.spec.ts:69`                                                                                   | Reflow                                                                                                 |
| T3     | Ningún recorrido de reportes se saltea cerca de la medianoche                                                                   | Deuda, ya estaba en R2a (como `NEAR_MIDNIGHT_MINUTES` de `calendar-page.ts:33`)                        |

## Paridad

| Origen | Hallazgo                                                                                    | Resolución                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | `reportes.md` sigue como lo dejó R2a y contradice la pantalla en RP-11, RP-12, RP-24 y §9.5 | `parity-analyst` aplica la lista de `parity-reviewer`: cabecera, RP-11, RP-12, RP-20, RP-22, RP-24, RP-28, RP-29, RP-32, P-05, §9.5 y una sección «10. Núcleo, R2b» |

## Cierre

Ronda de correcciones: e2e en `8572eaf`; backend en `2cd9d75`, `72391e9`, `7cc9a1a` y
`d4e8f54`; frontend en `91b25df` (F1 y P-N1 medidos a 320×568, 375×667 y 1366×657) y `d206dd0`;
`reportes.md` en `1aead28`, con el texto de `parity-analyst` aplicado por el team-lead porque el
arnés le rechaza el Write. T1 cae ahora en `period.test.ts`. Ninguna corrección tocó
`totalsByBucket` ni `dayBuckets` desde `51fe0ce`.

Corrida final sobre `1aead28`: lint, typecheck, prettier, 1485 de unidad, 277 de `test:time-ar` y
1289 de integración (team-lead); `reports.spec.ts` 10 de 10 tres veces y la suite e2e entera 194
de 194 dos veces, desde una copia nueva con `next build` (`tests-r2b`). Los once mutantes de e2e
caen (los nueve de §8.2, la barra sin `shortcuts` y el de C3), con M4 y M9 reescritos por los
cambios de `91b25df` y `72391e9`.

Deuda nueva: la navegación del shell mide 531 px y da desplazamiento horizontal a 320 y 375 px
(`src/app`, ya estaba en R2a).

**Comprobación contra Neon (§6.3): pasó**, hecha por el usuario el 2026-10-08 en el preview de
`6561286` (alias de la rama), contra la rama `preview` de Neon vaciada y migrada desde cero (15
migraciones, sin personas ni entradas antes de la prueba, sin datos de producción), con la zona
`America/Argentina/Buenos_Aires`. El preview tiene `DATABASE_URL`, `BETTER_AUTH_SECRET` y
`BETTER_AUTH_URL` propios. Entradas: martes 29/09 de 09:00 a 11:00 y de 23:00 a 23:50, jueves
01/10 de 14:00 a 15:30; la planilla da 2:50, 1:30 y 4:20. «Semana anterior» por «Fecha»: dos
filas, 29/09 2:50 y 01/10 1:30, total 4:20, la entrada de las 23:00 en su día; por «Persona»,
4:20. «Año pasado» por «Fecha» (365 cortes en el parámetro) carga sin error. `neon-serverless`
pasa el arreglo como un solo parámetro: no hace falta la alternativa de D-R2b-7. Vale para HEAD,
porque `totalsByBucket` y `dayBuckets` no cambiaron desde `51fe0ce`. Se mergea a `main`.
