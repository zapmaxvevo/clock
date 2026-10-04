# Correcciones del slice 6 — ronda 2

Salida de la ronda corta de `architecture-reviewer` sobre `fase1-slice6-seleccion-y-masa.md`
contra el árbol con el slice 10 mergeado (`5f023d7`). Veredicto: aprobado con menores. El
team-lead aplica los cinco. Los supuestos de §0 que vienen del 10 quedan confirmados o
corregidos contra el árbol; los que vienen del 7 se confirman en el paso 0 del handshake, que
sigue abierto.

## Contrato — team-lead

| Origen | Hallazgo                                                                                                                                                    | Resolución                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1     | §0 y §6 nombran un tipo `EntryRow` que no existe: es `EntryWithRefs = TimeEntryRow & EntryRefs` (`repository.ts:31-41`), con `project.color` como `string`. | §0 y `findManyByIdsForUpdate` pasan a `EntryWithRefs`; el color lo estrecha `projectRefOf` en `toView` (`service.ts:151-156`). En el paso 7 de §4.3, la vista de una fila escrita es `{ ...escrita, project: leída.project, task: leída.task }`.              |
| m2     | §0 dice que la fila lee `useTrackingCatalog` y que `day-group.tsx` es dueño de `updateEntryProject`; §6 no da modelo de test para una fila con selector.    | El catálogo lo lee `ProjectPicker` (`project-picker.tsx:110`), dibujado en la fila; `day-group.tsx` guarda con `saveEntryProject` de `entry-project.ts`. `entry-row.test.tsx` sigue a `project-picker.test.tsx`, con `project: ProjectSelection` obligatoria. |
| m3     | §1: `action.ts` y `use-action.ts` piden volver a probar solo lo de `project`.                                                                               | `action.ts` suma `time-entry/actions.integration.test.ts`; `use-action.ts`, los e2e del rastreador, nombrados debajo de la tabla.                                                                                                                             |
| m4     | §6: `bulk-edit-dialog.tsx` no pasa a `ClockField` el modo de teclado que suma el 7.                                                                         | Lo pasa según `formats.time`, como los otros campos de hora; la fila de `clock-field.tsx` de §1 suma `placeholder` a esa prop.                                                                                                                                |
| m5     | §4.8 da por hecho un estado «Sin cambios» en el selector de proyecto del 10.                                                                                | No existe: el 12 extiende o envuelve `project-picker.tsx`. No cambia nada del 6.                                                                                                                                                                              |

### Detalle

- **m1**: la tabla de supuestos de §0 parte su primera fila en dos —el tipo, con
  `repository.ts:31-41`, y el color, con `service.ts:151-156`— y corrige la de `toView`.
  Debajo, una nota: `EntryRow` es el componente de `entry-row.tsx`, no un tipo de datos. La
  firma de `findManyByIdsForUpdate` en §6 devuelve `Promise<readonly EntryWithRefs[]>`, y el
  paso 7 de §4.3 dice que la vista armada es de tipo `EntryWithRefs` y que `toView` la recibe
  como cualquier lectura.
- **m2**: §0, «Del 10», nombra el `ProjectPicker` que la fila dibuja y `saveEntryProject` de
  `time-entry/components/entry-project.ts`; la viñeta de `day-group.tsx` en §6 también. El
  test de la fila envuelve en `TrackingCatalogProvider` y `DisplayFormatsProvider`, y le pasa
  a la fila un `ProjectSelection` armado a mano: no importa `entry-project.ts`, que importa
  `actions.ts`.
- **m3**: los e2e del rastreador, nombrados debajo de la tabla de §1, son
  `tracker.spec.ts`, `start-retry.spec.ts`, `continue-duplicate.spec.ts`,
  `entry-times.spec.ts`, `manual-entry.spec.ts`, `week-and-pagination.spec.ts` y
  `project-picker.spec.ts`. La columna de la tabla se ensancha para la fila de `action.ts`.
- **m5**: queda como sub-viñeta de «El diálogo gana secciones» en §4.8.

**El paso 0 del handshake** (confirmar los supuestos del 7 contra su código) sigue abierto: se
hace cuando el 7 esté en `main`. §0, §6 y §8 del contrato lo dicen así.
