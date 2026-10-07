# Correcciones del slice 11b: revisiones

Salida de las seis revisiones del 11b sobre `fase1/slice-11b-etiquetas` en `32010d9`, con
`next build`, 1018 de unidad, 1025 de integración y 130 de 130 e2e en verde. Veredictos:
backend **aprobado** (un menor), seguridad **aprobado** (sin hallazgos del slice), frontend,
tests, código y paridad **cambios requeridos**. El team-lead decide cada hallazgo; donde dos
revisiones encontraron lo mismo, se resuelve una vez.

## El mutante «equivalente» no lo es

`backend-dev` declaró equivalente mover `assertTaggable` después de `closeAndOpen`, y el
`backend-reviewer` lo confirmó mirando el estado de la base en quince casos. El `test-reviewer`
lo mató con los dos casos que el 10 ya tiene para el par (`service.integration.test.ts:5224-5257`):
con el id de una entrada de otro miembro, `insertRunning` choca con la clave primaria y la
respuesta es `forbidden` en lugar de TT-78; con el timer abierto bloqueado por otra conexión, la
llamada espera el bloqueo en lugar de responder TT-78. Lo mismo vale para `duplicateEntry` después
de `insertClosed`. El código está bien; faltan los tests (T1). Es la misma lección del 10: el caso
que distingue el orden de una validación respecto de la escritura es el id de una fila ajena.
La frase del criterio 7 («el mutante lo deja cerrado») queda corregida por este párrafo.

## Decisiones

| Origen          | Hallazgo                                                                                                                      | Decisión y dueño                                                                                                                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 (bloqueante) | Faltan los tests que matan `assertTaggable` después de escribir                                                               | Aceptado. `backend-dev`: `it.each(["startTimer","continueEntry","duplicateEntry"])` con el id de una entrada de otro miembro → TT-78, sin escribir y con el timer previo abierto; `it.each(["startTimer","continueEntry"])` con `outcomeWhileLocked` → TT-78. Con una etiqueta archivada y el par vacío.             |
| F1 (mayor)      | Con el selector de la barra abierto, si cambia el timer, el conjunto se guarda en otra entrada                                | Aceptado. `frontend-dev`: el destino (`editsRunningFields ? running.id : null`) se guarda en una ref al abrir; `handleTagsChange` descarta el conjunto si al cerrar el destino es otro. Sin `key` por id. `e2e-tester`: recorrido con `openSecondTab` que falla hoy.                                                 |
| F3 / P1 (mayor) | Con etiquetas, la fila y la barra se parten en dos líneas a 1400 y 1024 px                                                    | Aceptado el camino 1. `frontend-dev`: en la fila, horario, fecha, duración, «Continuar» y «⋮» en un bloque `shrink-0` que no se parte, como F2 del 11a; el disparador de etiquetas con un tope menor (`max-w-40`) en la fila y en la barra, recortado con elipsis (H-1). Lo que quede por debajo de ~800 px va a §8. |
| C1 / T3 (mayor) | `addTaggedEntry` copia `addManualEntry`, contra m6                                                                            | Aceptado. `e2e-tester`: `addManualEntry(page, description, { project?, tags? })`; se borra `addTaggedEntry`; los llamadores de `project-picker.spec.ts` pasan `{ project }`.                                                                                                                                         |
| T2 (mayor)      | m12 no tiene test en el diálogo                                                                                               | Aceptado. `e2e-tester`: en el recorrido 5, borrador en «Descripción», búsqueda sin coincidencias, `Escape`: popup oculto, diálogo visible, foco en `tagPicker(dialog)`, borrador intacto.                                                                                                                            |
| B1              | Dos comentarios de `time-entry/service.ts` (`:542`, `:586-588`) atribuyen al orden lo que hace la transacción                 | Aceptado con el motivo de T1. `backend-dev`: «la regla antes de escribir: un id ajeno o un timer bloqueado no cambian la respuesta».                                                                                                                                                                                 |
| F2              | `ComboboxEmpty` con `display: none` mientras hay opciones; la región en vivo aparece junto con su texto                       | Aceptado. `frontend-dev`: `<ComboboxEmpty className="flex py-0">` y `py-2` en el mensaje.                                                                                                                                                                                                                            |
| F4              | Enter sin opción resaltada cierra sin marcar                                                                                  | Aceptado. `frontend-dev`: `autoHighlight`. `e2e-tester`: en el recorrido 6, escribir el nombre y Enter lo marca; se ajusta la comprobación de que volver a escribir borra el resaltado. `ProjectPicker` no cambia.                                                                                                   |
| F5 / P4         | En solo lectura, los nombres no dicen que son etiquetas                                                                       | Aceptado. `frontend-dev`: «Etiquetas: » como texto solo para lectores de pantalla, con su caso en `tag-picker.test.tsx`.                                                                                                                                                                                             |
| P2              | Las opciones no tienen casilla; TT-12 dice «casillas de selección múltiple»                                                   | Aceptado. `frontend-dev`: una casilla, vacía o marcada, en los ítems del `TagPicker`, sin tocar `components/ui/`.                                                                                                                                                                                                    |
| P3              | Marcar una opción borra la búsqueda; el recorrido 2 supone que queda                                                          | Aceptado: la búsqueda queda. `frontend-dev`: solo lo que se escribe cambia la búsqueda (se ignora el cambio que emite la primitiva al elegir un ítem). `e2e-tester`: el recorrido 2 afirma que la búsqueda sigue después de marcar. Si la primitiva no lo permite, se avisa antes de seguir.                         |
| C2              | `eslint-disable-line` en `columnsOf`                                                                                          | Aceptado. `backend-dev`: `tagIds` se desarma en `updateClosedEntry` y `updateRunningEntry`.                                                                                                                                                                                                                          |
| C3              | «En orden alfabético» escrito tres veces; `tagIdsOf` nombra dos cosas                                                         | Aceptado. `backend-dev`: `sortedByName` en `src/lib/text.ts`, usado por los dos services (sale `alphabetical`); `tagIdsOf` del service pasa a `sortedTagIdsOf`. `frontend-dev`: `tag-picker-model.ts` usa `sortedByName`.                                                                                            |
| C4              | Los ids se normalizan en tres lugares                                                                                         | Aceptado. `backend-dev`: `normalizedIds` en `src/lib/tag-ids.ts`, usado por las `transform` de Zod, `sameTagIds` y `assertTaggable`.                                                                                                                                                                                 |
| C5              | `insertTags` y `replaceTags` arman las filas dos veces                                                                        | Aceptado. `backend-dev`: una sola inserción.                                                                                                                                                                                                                                                                         |
| C6              | El comentario de `selectWithRefs` no nombra las etiquetas                                                                     | Aceptado. `backend-dev`.                                                                                                                                                                                                                                                                                             |
| C7              | Cabecera de `calendar-edit.spec.ts` con una línea de 117 caracteres                                                           | Aceptado. `e2e-tester`.                                                                                                                                                                                                                                                                                              |
| C8 / T6         | Tercera copia de los ayudantes de `/proyectos` en e2e; `toggleTag` repite `pickTags`                                          | Aceptado. `e2e-tester`: `e2e/projects-page.ts` con `PROJECTS_PATH`, `openProjects`, `nameField` y `saveButton`, usado por `projects.spec.ts`, `billable.spec.ts` y `tags.spec.ts`; `toggleTag` exportado de `tracker-page.ts` y usado por `pickTags`.                                                                |
| C9              | `EmptyMessage`, clases del disparador y buscador paralelos entre los dos selectores                                           | Diferido: toca `ProjectPicker` más allá de m13. Deuda anotada en el estado de la fase.                                                                                                                                                                                                                               |
| C10             | `pickerTriggerRef` y `tagPickerTriggerRef` no son simétricos                                                                  | Aceptado. `frontend-dev`: `projectPickerTriggerRef`.                                                                                                                                                                                                                                                                 |
| T4              | Los nombres del test de orden no distinguen un orden por unidad de código                                                     | Aceptado. `backend-dev`: «beta», «Zeta», «alfa» en `project/service.integration.test.ts:1392` y `src/lib/text.test.ts:50`.                                                                                                                                                                                           |
| T5              | `updatedAt` sin cambios como prueba de «no escribe» no puede fallar                                                           | Aceptado. `backend-dev`: comparar las filas de `time_entry_tag`, o quitar la línea.                                                                                                                                                                                                                                  |
| T7              | Afirmaciones sobre cómo se codifica el pedido (`"tags":[`)                                                                    | Aceptado. `e2e-tester`: se quitan; queda el conteo.                                                                                                                                                                                                                                                                  |
| T8              | El clic afuera depende de hacia dónde abre el popup                                                                           | Aceptado. `e2e-tester`: clic en un punto que el popup nunca cubre.                                                                                                                                                                                                                                                   |
| S1              | `npm audit --audit-level=high` con 9 altas de desarrollo (`braces` vía `shadcn` y `eslint-config-next`); producción sin altas | Fuera del slice; el CI de seguridad es del usuario. Ya estaba registrado.                                                                                                                                                                                                                                            |

## F3 / P1: lo que midió `frontend-dev`

Con el camino 1 aplicado, la fila (894 px de contenedor a 1400 y a 1024) y la barra (787 px)
seguían en dos líneas: la base de 256 px de la descripción no deja lugar para un proyecto de
~190 px y etiquetas de 160. Decisión del team-lead: la descripción pasa a `basis-28` (112 px)
en la fila y la barra, sigue con `flex-1` y elipsis, y la fila usa `gap-x-3`. TT-49 pide leer la
fila en una línea, y recortar la descripción es preferible a partir la fila. Lo que siga
partiendo (un proyecto al tope de 256 px, y por debajo de ~800 px) va a §8 con las medidas.

Resultado, medido por `frontend-dev` con un proyecto de 191 px (el margen es el ancho útil menos
lo que ocupa la línea con la descripción en 112 px). La barra con el timer no entra en una línea
ni vacía: con el timer, el aviso «Detené el timer para agregar tiempo a mano.» ocupa 281 px y la
barra queda en 577 útiles. Ya pasaba en `main` antes del 11b (deuda del 11a). Mover ese aviso queda
fuera del slice; `gap-x-2` en la barra se probó y se revirtió porque no cierra ese caso.

| Caso                                          | 1400 y 1024 px       | 768 px                        |
| --------------------------------------------- | -------------------- | ----------------------------- |
| Barra parada, proyecto y 3 etiquetas          | 1 línea (margen 41)  | 2: baja el contador           |
| Barra con timer, proyecto y 3 etiquetas       | 2: baja el contador  | 3                             |
| Barra con timer, vacía                        | 2                    | 3                             |
| Fila, proyecto y 3 etiquetas                  | 1 línea (margen 6)   | 2: baja el bloque del horario |
| Fila, proyecto sin etiquetas                  | 1 línea (margen 110) | 2                             |
| Fila, proyecto al tope (256 px) y 3 etiquetas | 2 (faltan ~59 px)    | 2                             |

En la fila más cargada la descripción queda en 118 px (unos 14 caracteres visibles al editar).

Heredado, sin slice: si falla continuar y después falla duplicar, el aviso de continuar sigue en
la barra junto al de duplicar (lo vio `parity-reviewer`). Deuda anotada en el estado de la fase.

## Orden de la ronda

1. `backend-dev`, `frontend-dev` y `e2e-tester` en paralelo. Los tests nuevos de F1, F4, P3 y T2
   se confirman fallando antes del arreglo.
2. Segunda revisión de frontend, porque la ronda es grande (F1, F3, P2, P3).
3. `parity-analyst` escribe §11 «Slice 11b» de `time-tracker.md` y §18 de `calendario.md`, con
   P2, P3 y m11.
4. Corrida final completa (lint, typecheck, unidad, integración, build y e2e), commit y merge.

## Segunda revisión de frontend

Sobre `e088d65`: F1, F2, F3 (en lo decidido), F4, F5, P2 y P3 resueltos, sin bloqueantes ni
mayores. El team-lead acepta los tres menores, con la corrección que el revisor probó en una
copia; los hace `frontend-dev`.

| Origen | Hallazgo                                                                                                                            | Corrección                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F2-1   | La opción marcada y resaltada pierde el tilde: el `**:text-accent-foreground` del ítem pinta los trazos del ícono                   | `stroke-primary-foreground` en la casilla, sin `!`.                                 |
| F2-2   | El vaciado ignorado de P3 deja pendiente el resaltado de Base UI y cambia qué opción queda resaltada al reabrir                     | `details.cancel()` antes de ignorar; el `setSearch("")` al abrir queda de respaldo. |
| F2-3   | A 390 px, con el editor de horas abierto, el bloque `shrink-0` de la fila desborda 86 px y deja «Continuar» y «⋮» fuera de pantalla | `max-w-full flex-wrap gap-y-1` en el bloque.                                        |

Fuera del slice: `ProjectPicker` en la barra no tiene la guarda de destino de F1
(`handleProjectChange`); el riesgo es menor porque el selector se cierra al elegir. Deuda anotada
en el estado de la fase.
