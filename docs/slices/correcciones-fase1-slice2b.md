# Correcciones del slice 2b — revisiones

Salida de las cuatro revisiones sobre la rama: seguridad y backend aprueban;
código y tests piden cambios. `createOnce` sigue el algoritmo del ADR 0007 paso
a paso y sirve para el slice 9; la barrera es determinista (40 de 40 corridas);
los e2e no pueden pasar en falso. Abajo, la resolución decidida de cada
hallazgo y su dueño.

## Backend — `backend-dev`

| Origen                             | Hallazgo                                                                                   | Resolución                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests M-1                          | El caso «otro workspace» del criterio 4 no prueba el filtro por workspace de `findOwnById` | Sumar la variante «la misma persona en otro workspace» (membresía de `actor.userId` en otro workspace y la entrada sembrada con su `userId`), en el service y en la action. Verificar que sacar el filtro de workspace la hace fallar.             |
| Código M-1, backend m-2, tests m-1 | El test de «ninguna rama consulta permisos» lee el código fuente                           | `vi.mock("@/server/permissions")` conservando `ForbiddenError`, con `can` y `assertCan` que lanzan si se los llama; se borra el bloque que lee el archivo y el import de `node:fs`. La regla «sin `vi.mock`» del contrato es solo para la barrera. |
| Backend m-1, tests m-2             | Si un corredor falla antes de trabarse, la barrera espera 10 s y esconde el error real     | `untilLockWaiters` corre en `Promise.race` contra los corredores: si alguno termina antes de trabarse, sale su error o «terminó sin trabarse». El slice 4 hereda el helper así.                                                                    |
| Backend m-3                        | Un `23505` sin nombre de restricción no se relee                                           | Como pide el ADR 0007: ante cualquier `23505` se relee la fila propia; sin fila propia y sin nombre de restricción, se trata como otro choque. Caso de unidad.                                                                                     |
| Código m-2                         | El gancho del timer es un ternario con una closure de 12 líneas                            | Función privada `runningConflictHook(actor, winner)` en `service.ts`.                                                                                                                                                                              |
| Código m-3                         | `alone` no describe el dominio                                                             | Renombrar a `runningOnly`.                                                                                                                                                                                                                         |

## Frontend — `frontend-dev`

| Origen     | Hallazgo                                                                     | Resolución                                                                                         |
| ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Código m-1 | El comentario de «Agregar» sigue diciendo que «crea sin rebotar contra nada» | «Agregar es la única alta del módulo sin id elegido por el cliente (ADR 0007): …», el resto igual. |
| Código m-4 | El local `pending` choca con `start.pending`                                 | Renombrar a `pendingId`.                                                                           |

## Se mantienen o se difieren

- **Código m-5**, `startIdRef` duplica `lastInput`: se mantiene; el contrato
  eligió la ref a propósito.
- **Código m-6**, `lockWaiters` repite `waitForBlockedBackend`: se resuelve en el
  slice 4, que reusa la barrera; ahí se generaliza
  `waitForBlockedBackend(count, timeoutMs)` en `src/test/concurrency.ts` y se
  borra la copia local.
- **Seguridad, `crypto.randomUUID()` en contexto inseguro**: se deja así, sin
  respaldo con `Math.random`.
- **Seguridad, reuso del id de una entrada ajena ya borrada**: mezclaría la
  historia de dos dueños en `audit_log`. Hoy nadie lo lee; queda como deuda en
  el §8 del contrato para cuando exista un visor de auditoría, que filtra por
  `workspace_id` y actor y no solo por `entity_id`.
