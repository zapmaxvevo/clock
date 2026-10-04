# Correcciones al contrato del slice 6 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice6-seleccion-y-masa.md` y el ADR 0011: un
bloqueante, tres mayores, seis menores. Las nueve decisiones de fondo se sostienen. El orden de
los bloqueos se ejecutó en Postgres 17.11 con 5000 filas y 200 ids: dos masivas cruzadas en
orden opuesto o solapado hacen commit las dos, y el control con un `for update` por fila en el
orden pedido termina en `40P01`.

**Orden de implementación decidido por el equipo: 10 → 7 → 6.** El 10 trae la migración de
`time-entry` a las piezas compartidas y las lecturas con proyecto; el 7 cambia los rótulos y
los formatos de los que depende el 6. El contrato del 6 se escribe para el árbol con el 10 y el
7 adentro, y antes de implementarlo pasa una ronda corta del reviewer contra el árbol real.

## Bloqueante

| ID  | Resolución                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `findManyByIdsForUpdate` devuelve las filas con proyecto y tarea del 10, con `left join` y `for update of time_entry`, conservando `order by id`. En el paso 7, la vista de una fila escrita es la escrita con el `project` y la `task` de la leída: el 6 no cambia el proyecto. Queda dicho que el slice 12, que sí lo cambia, relee en la misma transacción con una sola sentencia. §4.6 ajusta la cuenta de sentencias. |

## Mayores

| ID  | Resolución                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Se reescriben para el árbol con el 10 adentro §0, la tabla de §1, §4.1, §6 y el criterio 20. §4.1 pasa a «Lo que suma este slice a las piezas compartidas»: `Rejection`, `RejectedError`, `rejections` en `ActionResult` y `ActionFailure`, `failure` que reconoce `RejectedError` antes que `DomainError`, `recordAudits` y `"rejected"` en la unión. Salen `tracker-bar.tsx` y los dos borrados de la lista de frontend; el handshake arranca por los rechazos y los esquemas; el criterio 20 pasa a «la suite existente sigue verde». |
| M2  | `tripleOf` se define con `dayKey` y `formatClock` del servidor (la hora canónica, `startClock` y `endClock` en la vista del 7), nunca con los rótulos, que el 7 vuelve de presentación. Los rótulos quedan para el aviso y el nombre de la casilla. §5.2 dice que el `ClockField` del diálogo interpreta con el formato de la persona y que el placeholder depende de ese formato.                                                                                                                                                       |
| M3  | Un criterio de integración nuevo: dos `bulkEditEntries` sobre los mismos ids, en orden opuesto, cruzados con `raceThroughBarrier`, responden `ok` las dos (el mutante que bloquea fila por fila termina en `40P01`). §4.6 reemplaza el argumento por el del plan real: el `Sort` va debajo de `LockRows`, y el `order by` cubre lo que el orden físico no garantiza. Sale la viñeta de §8.                                                                                                                                               |

## Menores

| ID  | Resolución                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1  | El criterio 7 compara contra `updateEntryTimes` «con un trío combinado distinto del de la fila».                                                                                              |
| m2  | `entry-list` lleva un `useOptimistic` de ids ocupados que `bulk-actions` llama en `optimistic`, como `showRemoved`; de ahí salen las filas ocupadas y el `pending` de las casillas.           |
| m3  | `deleteClosedByIds` recibe los ids de las filas autorizadas, con su `userId` como en `targetOf`, y lanza sin traducir si lo borrado no coincide con lo encontrado, como `updateClosedFields`. |
| m4  | La región es `<section aria-label="Acciones en masa" tabIndex={-1}>`.                                                                                                                         |
| m5  | `entry-row.test.tsx` envuelve la fila con los proveedores que existan en `main` al implementar (`useTrackingCatalog` del 10, `useDisplayFormats` del 7).                                      |
| m6  | La cabecera dice ADR 0011. Una clave desconocida en `changes` responde `{ error: timeEntryMessages.unexpected }`, no el texto en inglés de Zod.                                               |

## ADR 0011

Se puede aprobar con un cambio en Consecuencias: el orden de bloqueo es regla, «toda operación
que bloquee más de una fila de `time_entry` lo hace en una sola sentencia con `order by id`, y
con `for update of time_entry` si hay join»; las operaciones de una fila bloquean una sola, como
invariante explícita; y «no tiene un test que la haga fallar» se reemplaza por el test cruzado
de M3. Aprobarlo es decisión del usuario.
