# Correcciones del slice 4 — revisiones

Salida de las seis revisiones sobre la rama: backend y seguridad aprueban;
frontend, código, tests y paridad piden cambios. La paridad de la app se cumple
en TT-57, TT-58, TT-65 y TT-26; lo que faltaba en `docs/parity/time-tracker.md`
ya está registrado. Los tres mutantes que backend declaró equivalentes lo son
de verdad. Abajo, la resolución decidida de cada hallazgo y su dueño.

## Backend — `backend-dev`

| Origen                    | Hallazgo                                                                                                                                                                                      | Resolución                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests (mayor)             | Ningún test fija el `FOR UPDATE` de `discardTimer`                                                                                                                                            | El test que propuso la revisión: un borrado y un descarte en cola detrás de la barrera; el descarte termina en éxito sin aviso. Verificar que muere el mutante `findById`.                                                          |
| Código M1                 | `startTimer` y `continueEntry` repiten el arranque idempotente                                                                                                                                | Una función privada `startEntryOnce(actor, timeZone, id, open)` con la transacción, `translatingEndBeforeStart`, `createEntryOnce` y `replayed`/`winner`; desaparece `attemptStart`.                                                |
| Código m3                 | `duplicateTimes` con un parámetro sin usar y `eslint-disable`; `now` que nadie pasa                                                                                                           | **Se aparta del contrato** (§4.2): `duplicateTimes(source)` y `duplicateEntry(actor, timeZone, input)`. Agregar el parámetro cuando cambie P-14 es igual de barato; la función es privada y de un solo llamador.                    |
| Código m4, m5             | Comentario de «las dos lecturas»; tipos y esquemas idénticos                                                                                                                                  | «Lo que comparten las lecturas de una entrada existente»; `ContinueEntryResult = StartTimerResult`; un esquema común del que salen `continueEntryInput` y `duplicateEntryInput`.                                                    |
| Código m9, backend m1, m2 | `concurrency.ts`: `timeoutMs` sin uso, nombre en singular; `queueBehindBarrier` no espera a sus corredores al cortar; el test de workspace no libera la transacción ganadora si vence el tope | `waitForBlockedBackends({ count, signal })` con la constante del tope; `await Promise.allSettled(running)` en el `finally` de `queueBehindBarrier`; `try/finally` con `releaseWinner()` en `workspace/service.integration.test.ts`. |
| Backend m3                | Identificadores `propio` en español                                                                                                                                                           | `own` (los tres, incluidos los del slice 3).                                                                                                                                                                                        |

## Frontend — `frontend-dev`

| Origen                               | Hallazgo                                                                                      | Resolución                                                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend M-1                         | El descarte borra el timer que está en pantalla al confirmar, no el elegido al abrir          | El diálogo guarda el id al abrir (`discardId`); `handleDiscard(id)` manda ese id sin mirar `running`. El `finalFocus` de cancelar tolera que el disparador ya no esté (cae en la descripción).               |
| Frontend M-2                         | Lo tecleado durante el descarte se pierde y termina en un guardado contra el timer descartado | `handleCommit` no guarda con `phase === "discarding"`; `onSuccess` del descarte limpia la descripción solo si sigue igual a la que había al confirmar.                                                       |
| Código M2, frontend m-1              | `useNewEntryId` exportado desde `day-group.tsx`; la barra copia la regla en `nextStartId`     | **Se autoriza** `components/use-new-entry-id.ts`. La barra lo usa con una clave fija y se borran `startIdRef` y `nextStartId`. El comentario repetido tres veces pasa una vez al JSDoc del hook.             |
| Frontend m-2                         | El aviso de duplicar no baja con otras operaciones del grupo                                  | `run` de cualquier otra operación del grupo hace `duplicate.clear()`, como dice el §8.                                                                                                                       |
| Frontend m-3                         | `c` puede continuar la fila de `lastEntryId` mientras viaja su borrado                        | `lastEntryShown` tiene en cuenta el borrado optimista del grupo.                                                                                                                                             |
| Paridad (menor)                      | El foco se pierde tras «Reintentar» un descarte                                               | `focusAfterDiscard` también se arma en el reintento.                                                                                                                                                         |
| Código m6, m7, m8, m10, frontend m-4 | `resume`, `editableStart`, la condición del conmutador en dos lugares, comentarios            | `continuation`; `runningControls`; `modeSwitchDisabled` calculado una vez en la barra y pasado a `ModeSwitch`; comentarios reajustados, el de `ScopedTarget` con el porqué y el de `entry-row` sobre el Tab. |

## E2E — `e2e-tester`

| Origen        | Hallazgo                                                             | Resolución                                                                                 |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tests (menor) | Los recorridos de duplicar cargan `00:00–00:01` y dependen del reloj | Usar `closedEntry` donde no se miran las horas (`:685`, `:318`).                           |
| Tests (menor) | Comentario de `entry-times.spec.ts:255-256` desactualizado           | «El foco sigue al control que viene después en la fila mientras la escritura viaja».       |
| E2E           | La misma trampa de espera en `tracker.spec.ts:487`                   | **Se autoriza**: `withServerAction(page, () => startTimer(…))`, sin cambiar lo que afirma. |

## Contrato — team-lead

- §4.2: `duplicateTimes(source)` sin `context`, y el porqué.
- §6: la barrera vive en `src/test/concurrency.ts`; `use-new-entry-id.ts` entra al reparto; excepciones autorizadas sobre specs existentes (`entry-times.spec.ts:259-261`, `manual-entry.spec.ts:372-374`, `tracker.spec.ts:487`).

## Segunda revisión de frontend — pendiente para la sesión siguiente

Aprobó la ronda, con dos menores que quedan para un cambio aparte después del
merge:

| ID  | Hallazgo                                                                                                                                                                          | Resolución decidida                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-1 | Lo tecleado durante el descarte se pierde si se sale del campo antes de la respuesta, o si el descarte termina en `already_stopped` (`tracker-bar.tsx:126-136, 209-211, 261-263`) | Guardar en `handleDiscard` el texto confirmado (`discardedDraft`); en el seguimiento, cuando cambia `serverState.id` y era el descartado, aplicar `draft === discardedDraft ? "" : draft`; sacar la limpieza de `onSuccess`. |
| m-2 | Con el modo manual elegido y el timer forzado, el diálogo de descarte se desmonta sin devolver el foco si otra pestaña detiene el timer (`timer-bar.tsx:157-175`)                 | Subir `discardId` y `DiscardTimerDialog` a `TrackerBar`, que es dueña de lo que sobrevive a un cambio de modo; `TimerBar` recibe `onRequestDiscard`.                                                                         |
