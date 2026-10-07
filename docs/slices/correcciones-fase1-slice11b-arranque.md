# Correcciones del slice 11b: ronda corta contra el árbol

Salida de la ronda corta de `architecture-reviewer` sobre las secciones del 11b del contrato
(`fase1-slice11-etiquetas-y-facturable.md`), contra `main` en `aed694f`, con el 11a ya
mergeado. Veredicto: **aprobado para implementar**, con diez menores. Verificó las migraciones
con drizzle-kit 0.31.11 sobre una copia: los pasos de §2.2 generan `0010_time_entry_workspace_id_unq`,
`0011_tags` y `0012_tags_set_null` (`--custom`), con la cadena `prevId` 0009→0012 intacta. El
team-lead acepta los diez con la corrección propuesta. Donde este documento y el contrato
difieren, manda este documento.

| Origen | Hallazgo                                                                                                  | Resolución                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| m1     | Seis fixtures que arman vistas y catálogos a mano dejan de compilar y no tienen dueño                     | Paso 1 del handshake: «los fixtures que arman vistas y catálogos a mano suman `tags` (y `canCreateTag`); la suite existente sigue verde». `backend-dev` toca, solo para ese commit, `calendar/calendar-gestures.test.ts`, `calendar/calendar-layout.test.ts`, `calendar/calendar-totals.test.ts`, `components/entry-week.test.ts` (en `time-entry`), y `project/components/picker-model.test.ts` y `project/components/project-picker.test.tsx`.                                                 |
| m2     | `afterAdd` tiene tres parámetros desde D-7 y devuelve un literal sin spread                               | §5.3 y criterio 13: `afterAdd(current, sent, catalog)`, con `tags: sameTagIds(ids(current.tags), ids(sent.tags)) ? [] : current.tags`. D-7 no cambia. `entry-fields.test.ts` suma un caso con el proyecto cambiado y las etiquetas iguales a la vez.                                                                                                                                                                                                                                             |
| m3     | Falta el envoltorio de la action para las etiquetas, como `entry-project.ts` y `entry-billable.ts`        | Archivo nuevo de `frontend-dev`: `src/modules/time-entry/components/entry-tags.ts`, con `EntryTagsChange = { id; tags: readonly TagRef[] }` y `saveEntryTags`, que llama a `updateEntry({ id, changes: { tags: ids } })`. La barra y la fila usan `useAction(saveEntryTags)`.                                                                                                                                                                                                                    |
| m4     | No está fijado si las etiquetas entran en el acople de `fieldsPending` (F1 del 11a)                       | `fieldsPending` suma `saveTags.pending` en la barra (`tracker-bar.tsx:536`) y en el grupo (`day-group.tsx:197`); lo usan el selector de etiquetas y los tres «Reintentar». `saveTags` entra en `clearNotices` (`tracker-bar.tsx:372-382`) y su falla `unexpected` se limpia cuando cambia el timer (`:285-290`).                                                                                                                                                                                 |
| m5     | «Etiquetas» quedaría definido dos veces, contra C1 del 11a                                                | «Etiquetas» se define una sola vez, en `projectLabels.tags`; lo reusan la barra, el diálogo, el cuerpo de solo lectura y el detalle del bloque. `calendarLabels` suma solo `noTags`. Los ítems del facturable (`calendarLabels.billable`, `billableYes`, `billableNo`) salen del párrafo de §6: los hizo el 11a.                                                                                                                                                                                 |
| m6     | Los ayudantes de e2e después de C6 del 11a                                                                | El diálogo usa `tagPicker(dialog)` de `e2e/tracker-page.ts`; `e2e/calendar-page.ts` queda sin cambios. `e2e/tags.spec.ts` usa `uniqueSuffix`, `addManualEntry` y `continueButton` de `tracker-page.ts`, y `withServerAction` y `holdActionResponses` de `e2e/network.ts`, sin copias nuevas.                                                                                                                                                                                                     |
| m7     | La posición del selector en la barra                                                                      | Orden proyecto, etiquetas, facturable (TT-49): `{tagPicker}` va entre `{projectPicker}` y `{billableToggle}`, fuera del bloque `flex shrink-0` de F2 (`timer-bar.tsx:111`). Igual en `manual-bar.tsx` y `entry-row.tsx`. Crece la deuda de anchos chicos que dejó el 11a; se anota en §8.                                                                                                                                                                                                        |
| m8     | Los `tagIds` de la constancia del borrado salen de una fila que no trae la unión y ya se borró en cascada | Salen de la fila leída bajo bloqueo (`row.tags`; en la masiva, `found.get(id).tags`), ordenados con `compareNames`. `valuesOf` (`service.ts:1401`) pasa a recibir `EntryWithRefs` (la masiva le pasa `{ ...written, tags: row.tags }`, `:1457`, `:1465`); `continuedFields` (`:440`) también; `ColumnFields` (`repository.ts:78`) pasa a `Omit<…, "pair" \| "tagIds">`. Con solo etiquetas, `updateClosedEntry` no llama a `updateClosedFields` (Drizzle rechaza `set({})`), como ya prevé §4.6. |
| m9     | Frase ambigua en §5.1 sobre el `left join`                                                                | Se lee: «el proyecto y la tarea dejan el `left join` de la sentencia que bloquea y pasan a la segunda».                                                                                                                                                                                                                                                                                                                                                                                          |
| m10    | §0 cita `main` en `8e27fcb`; las líneas que usa el 11b se movieron                                        | Las citas del 11b se rebasan a `aed694f` con la tabla de abajo.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## m11: Enter marca, Espacio escribe

Lo levantó `e2e-11b` al escribir el recorrido 6. El `Combobox` de Base UI 1.8 navega con foco
virtual: el foco se queda en el buscador y la opción resaltada se anuncia con
`aria-activedescendant`. Espacio ahí escribe en la búsqueda, y los nombres de etiqueta llevan
espacios. Decisión del team-lead: la opción resaltada se marca con **Enter**, sin cerrar el
popup; Espacio no se intercepta. Donde §5.8 y el recorrido 6 dicen «Espacio marca», se lee
Enter. El recorrido 6 suma que Espacio después de una flecha escribe en «Buscar etiqueta» y no
marca. La paridad no pide Espacio.

## Citas rebasadas a `aed694f`

| Qué                                            | Dónde está hoy                                     |
| ---------------------------------------------- | -------------------------------------------------- |
| `withRefs` y `selectWithRefs`                  | `time-entry/repository.ts:101-133`                 |
| `findByIdForUpdate` y `findManyByIdsForUpdate` | `time-entry/repository.ts:181-218`                 |
| `insertRunning` e `insertClosed`               | `time-entry/repository.ts:367-408`                 |
| `ClosedEntryFields` y `columnsOf`              | `time-entry/repository.ts:59-88`                   |
| `updateClosedEntry` y `updateRunningEntry`     | `time-entry/repository.ts:432-458`                 |
| `entryIds`                                     | `time-entry/schema.ts:194-198`                     |
| `timeEntryView`                                | termina en `billable` (`time-entry/schema.ts:346`) |
| `CopiedFields` y `continuedFields`             | `time-entry/service.ts:430-446`                    |
| `translatingPairConstraints`                   | `time-entry/service.ts:378-395`                    |
| `assignedPair`                                 | `time-entry/service.ts:1182`                       |
| `writeEntryEdit`                               | `time-entry/service.ts:1228`                       |
| armado de la vista en `bulkEditEntries`        | `time-entry/service.ts:1457`                       |
| `alphabetical`                                 | `project/service.ts:333-342`                       |
| efecto de foco de `pickerOpen`                 | `time-entry/components/tracker-bar.tsx:357-366`    |
