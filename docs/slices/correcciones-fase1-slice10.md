# Correcciones al contrato del slice 10 — ronda 1

Salida de `architecture-reviewer` sobre `fase1-slice10-selector-de-proyecto.md` y el ADR 0010:
sin bloqueantes, dos mayores, nueve menores. Las siete decisiones de fondo se sostienen contra
el árbol y contra Postgres 17: el DDL de §2 se ejecutó sobre las migraciones 0000 a 0004, con
los rechazos entre workspaces, el `check`, los `set null (col)` y la reversión. Se comprobó en
el código de Base UI 1.8 el combobox con el buscador en el popup, y que `for update` necesita
`of time_entry` sobre el `left join`. Orden decidido por el equipo: el 10 se implementa antes
que el 6 y el 7, y trae la migración de `time-entry` a las piezas compartidas. Abajo, la
resolución decidida de cada hallazgo.

## Mayores

| ID  | Resolución                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | §5.2 pasa de lista cerrada a regla: «toda lectura del módulo que termine en `TimeEntryView` trae proyecto y tarea; también las que sumen slices posteriores». `useTrackingCatalog()` lanza fuera de `TrackingCatalogProvider`, como `useDisplayFormats` del 7, y un test de componente que dibuje la fila suma el proveedor. §0 nombra, además de la migración, los archivos y firmas que comparten el 6 y el 7 (`toView`, `timeEntryView`, `entry-row.tsx`, `manual-bar.tsx`, `time-entry/service.ts`): el slice que entra segundo se adapta. |
| M-2 | ADR 0010: el `tx` no da coherencia de snapshot en `read committed`. Lo que da es que el rechazo deshace todo lo anterior (también el cierre del timer de `startTimer` y `continueEntry`), una sola conexión y la escritura protegida por la clave foránea. La función que se exporta a otro módulo solo lee con el `tx` recibido: no abre transacción, no usa `db` y no escribe. Si hace falta un bloqueo, lo decide el contrato de quien llama.                                                                                               |

## Menores

| ID  | Resolución                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-1 | Con la membresía inactiva, el selector de la barra queda inactivo como el resto de los controles y muestra el proyecto del timer como texto. Un caso en el criterio 15 o 16.                                               |
| m-2 | El criterio 12 suma, para `updateEntryProject`, «exige su permiso antes de tocar nada» en `actions.integration.test.ts`: membresía desactivada, mensaje neutro, sin buscar la fila.                                        |
| m-3 | `project/repository.ts` entra a la tabla de consecuencias: `findProject` recibe el ejecutor, y hay un `findTask(tx, …)` nuevo por workspace, proyecto e id. El «no hay consulta nueva» de §5.1 vale solo para el catálogo. |
| m-4 | El combobox fija `filter={null}` (o `filteredItems` con la salida de `picker-model.ts`): el único que filtra es el modelo, así un cliente que coincide trae todos sus proyectos.                                           |
| m-5 | El rótulo del proyecto de una entrada no vive en `project/components` recibiendo un `TimeEntryView`: vive en los rótulos de `time-entry`, y el selector de `project` recibe el nombre accesible ya armado.                 |
| m-6 | El tipo de §5.2 deja de llamarse `EntryRow`, que choca con el componente: `EntryWithRefs`.                                                                                                                                 |
| m-7 | §2.4 fija el orden de la reversión: primero el código que escribe `project_id` y `task_id`, después el esquema.                                                                                                            |
| m-8 | §2.3 dice que agregar la clave toma `SHARE ROW EXCLUSIVE` también sobre `project` y `task`. El índice se justifica por los dos `set null`, no por la grilla del 13, y pasa a parcial con `where project_id is not null`.   |
| m-9 | El recorrido 4 crea la entrada por la interfaz y después llama a `archiveProject` de `e2e/database.ts`.                                                                                                                    |

## ADR 0010

Se puede aprobar con M-2 y dos agregados: la dirección única vale para el módulo entero
(service, schema y components), y un componente de un módulo puede usar los del otro en esa
dirección; y la función que se exporta a otro módulo lanza solo códigos de `ActionErrorCode`.
Aprobarlo es decisión del usuario.
