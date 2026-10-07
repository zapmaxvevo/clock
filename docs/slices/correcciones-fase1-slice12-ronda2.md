# Correcciones del slice 12: ronda 2 de la revisión del contrato

Salida de la ronda 2 de `architecture-reviewer` sobre el contrato del slice 12, en `ec54a94`.
Veredicto: **aprobado**, con dos menores que se aplican al implementar, sin otra ronda. Verificó
B1, M1, M2 y m1–m7, que los criterios 21 y 22 y los mutantes nuevos del 7 pueden fallar, y la
escritura de §4.6 con `unnest` y `not exists` en Postgres (con arreglos vacíos, «Reemplazar» por
ninguna borra el conjunto sin una rama aparte). El team-lead acepta los dos.

| Origen | Hallazgo                                                                                                                    | Resolución                                                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| r2-1   | A los ayudantes que suben a `src/test/time-entry.ts` les faltan `lockRow` y `tagIdsOfRow`                                   | Suben también `lockRow` (`service.integration.test.ts:1886-1889`) y `tagIdsOfRow` (`:8264-8270`), tal cual, y si hace falta `allEntryTags` (`:8259-8261`). «Nada escrito» se afirma también sobre la unión, porque `snapshotOf` no la mira. |
| r2-2   | «Cuatro parámetros en cualquier caso» solo vale si los arreglos van con `sql.param`; interpolados, un arreglo vacío da `()` | Los tres arreglos viajan como `sql.param(arr)` con `::uuid[]`, y `$ws` lleva `::uuid` explícito en el `insert … select`. El caso «Con X \| Reemplazar por ninguna» del criterio 3 lo cubre en ejecución.                                    |

Lo que sigue: la aprobación del ADR 0017 por el usuario. Con eso, el handshake del contrato
arranca por el refactor de `updateEntry` en un commit propio.
