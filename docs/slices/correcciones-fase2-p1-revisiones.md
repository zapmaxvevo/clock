# P1: implementación y revisiones

Rama `fase2/p1-proyectos` desde `main` en `380ef3b`, en el worktree
`/home/maxi/program/clock-p1` (fuera del repositorio). Contrato:
[`fase2-p1-proyectos.md`](fase2-p1-proyectos.md) en `6565d06`. Sin ADR nuevo y
sin migración (D-P1-15).

## Backend

### Paso 1

`31f0427`, el commit que fija tipos y firmas (§7, «Orden», paso 1): compila,
con `lint`, `typecheck` y la unidad en verde. Trae los cuerpos finales, no
provisorios:

- `project.update` en las tres tablas de `can()` y en `allowsOnProject` (§3).
- `project/schema.ts`: todo §4.1 (`updateProjectInput`, `PROJECT_FILTERS`,
  `projectsSearchParams`, `ProjectSettings`, `ProjectListItem`,
  `ProjectListView`, `UpdateProjectResult`, `CreateProjectResult` con
  `ProjectRef`, `TrackingCatalog.clients` y `ProjectActions.updateProject`).
- `project/repository.ts`: `lockProject`, `updateProject` y
  `listActiveTasksOfAllProjects` (§4.2). `ProjectRow` se exporta para el
  service.
- `project/service.ts`: `updateProject`, `getProjectList`, `createProject` con
  `toProjectRef` y `getTrackingCatalog` con `clients` (§4.3).
- `project/actions.ts`: `updateProject`, y `createProject` y `updateProject`
  con `projectOptions` (D-P1-5).
- Para que compile, sin cambiar lo que afirman: `clients: []` en los siete
  fixtures de `time-entry` del contrato y, en archivos de `frontend-dev`, en
  los de `picker-model.test.ts`, `project-picker.test.tsx` y
  `tag-picker.test.tsx`; `updateProject` en el doble de
  `projects-screen.test.tsx` y en el `actions` de `page.tsx`.

**Desvíos del paso 1:**

- **`ProjectCatalog`, `ProjectGroupView`, `ProjectView` y `getProjectCatalog`
  quedan** hasta que la pantalla pase a `getProjectList`: borrarlos rompía
  `page.tsx` y `projects-screen.tsx`, que son de `frontend-dev`. Se borran
  después, en un commit de backend.
- **`changedProjectFields` vive en `project/changes.ts`**, un módulo puro, y
  no en `service.ts` (§4.3): un test de unidad que importa `service.ts` carga
  `@/server/db` y `env()`, que la unidad no tiene. Es el mismo criterio que
  `time-entry/assignment.ts`. Al lado está `previousOf`, que arma el
  `previousValue` de la constancia con los campos que cambian.

### Paso 2

| Commit    | Qué                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `67c7791` | Unidad: `project.update` en `permissions.test.ts`, `updateProjectInput` y `projectsSearchParams` en `schema.test.ts`, `changes.test.ts`            |
| `17b3738` | Integración del service: los casos de `getProjectCatalog` pasan a `getProjectList` (criterio 12), `clients` del rastreador, y los criterios 1 a 10 |
| `7f84e15` | Integración de la action: cada fila de §4.6, sin sesión, el reintento con una constancia y la revalidación de las cinco actions (criterio 11)      |

- **El owner inactivo** del criterio 4 va con un `Actor` sintético en el
  service (`{ ...owner, status }`). Ningún caso nuevo siembra un owner; en la
  action, la membresía inactiva es la de un admin (§10).
- **Criterio 9**: la barrera toma la fila con `projectRepository.lockProject`.
  «Lo que no espera» usa `createManualEntry` de `time-entry` y `createTask`,
  con `outcomeWhileHeld`.
- **`updated_at`** del criterio 1: el proyecto se siembra con un `updated_at`
  en el pasado, así que «avanza» no depende de que el reloj cambie de
  milisegundo entre el alta y la edición.

### Mutaciones

En un worktree descartable sobre `7f84e15`, con su propia base. Cada una se
aplicó sola y se corrió el test que la tiene que matar.

| Mutación                                                  | Resultado                                    |
| --------------------------------------------------------- | -------------------------------------------- |
| `allowsOnProject` sin el caso `project.update`            | muerta: 21 casos de `permissions.test.ts`    |
| `project.update` con `viewer !== null`                    | muerta: 8                                    |
| `project.update` en `allowedRoles` solo con owner y admin | muerta: 8                                    |
| El service sin la comprobación de archivado               | muerta: 2 (criterio 5)                       |
| El cliente nuevo sin mirar el archivado                   | muerta: 1 (criterio 6)                       |
| El cliente validado aunque no cambie                      | muerta: 1 (criterio 6, el cliente archivado) |
| Escribir y dejar constancia aunque nada cambie            | muerta: 1 (criterio 3)                       |
| El parche como reemplazo                                  | muerta: 8 (criterio 2 y otros)               |
| `updateProject` sin `lockProject`                         | muerta: 1 (criterio 9, el mismo campo)       |
| `lockProject` con `for update`                            | muerta: 1 (criterio 9, «lo que no espera»)   |
| `updateProject` sin `translatingNameTaken`                | muerta: 3 (criterio 7)                       |
| `changedProjectFields` compara el cliente con `!==`       | muerta: 1 (`changes.test.ts`)                |
| `projectsSearchParams` sin `.catch` por campo             | muerta: 3 (`schema.test.ts`)                 |
| `getProjectList` con `listActiveProjects`                 | muerta: 5 (criterio 12)                      |
| `getProjectList` con `listActiveTasks`                    | muerta: 1 (criterio 12)                      |
| `canUpdate` sin mirar el archivado                        | muerta: 2 (criterio 12)                      |
| `settings` siempre presente                               | muerta: 1 (criterio 12)                      |
| `TrackingCatalog.clients` sin mirar `project.create`      | muerta: 2                                    |
| `createProject` con las opciones de `/proyectos`          | muerta: 3 (criterio 11)                      |
| `updateProject` con las opciones de `/proyectos`          | muerta: 10 (criterio 11)                     |

La relectura de `project_member` bajo el bloqueo no tiene mutación con test
(§9.4): en P1 nadie escribe esa tabla desde la aplicación.

### Paso 3

`76772d3`, después de que la pantalla pasó a `getProjectList` (`76322da`):
se borran `ProjectCatalog`, `ProjectGroupView`, `ProjectView`,
`toProjectView` y `getProjectCatalog`, y `readCatalog` pierde el parámetro
`access` y filtra siempre con `project.track` (§4.3, lo decide
`backend-dev`). `edit-project-dialog.tsx` importa `changedProjectFields` de
`project/changes.ts` para armar el parche: el navegador y el servidor
comparan con la misma función.

Corrida sobre `76772d3`, con el árbol de `frontend-dev` y `e2e-tester` ya
commiteado: `lint`, `typecheck` y `prettier --check .` en verde; `npm test`,
122 archivos y 2772 casos, más 309 de `test:time-ar`; `npm run
test:integration` en `clock_p1_back`, 41 archivos y 2344 casos.

### Correcciones de las revisiones (backend, clean code y tests)

| Commit    | Hallazgo                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `73a1911` | Backend: `nextValue` sale de la fila guardada, no de la entrada; un id de cliente en mayúsculas quedaba así en la constancia. `previousOf` pasa a `valuesOf`, que arma las dos mitades. El comentario de `translatingNameTaken` nombra el alta y la edición |
| `232284d` | Clean code: un solo tipo para lo que cambia de un proyecto, `ProjectSettingsChanges` de `changes.ts`; se va `ProjectChanges` del repository                                                                                                                 |
| `5c76c6f` | Clean code: `readVisibleTags` y `tasksByProject`, que usan `getProjectList` y `readCatalog`                                                                                                                                                                 |
| `44e6273` | Tests: el color fuera de paleta o `null` afirma también `message`, el primer problema del `ZodError`                                                                                                                                                        |

El caso nuevo del cliente en mayúsculas (criterio 6) se verificó con la
mutación `nextValue: changes` en un worktree descartable: muere.

## Frontend y e2e

### Implementación

| Commit    | Qué                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `76322da` | La tabla de `/proyectos` con el buscador y el filtro (§5.1 … §5.3), la edición desde la fila (§5.5), `ProjectFields`, el marco partido y TT-09 en el selector, con el proveedor que recibe `createProject` (§5.4) |
| `9ffb68d` | El envío del alta anidada no guarda el diálogo de afuera: el `submit` de React subía por el portal y «Guardar» en TT-09 guardaba también la entrada del calendario. Lo encontró `project-from-picker.spec.ts`     |

### Mutaciones

En la copia descartable `scratchpad/p1-front-e2e`, con la base
`clock_p1_front_e2e` y el servidor en el 3561. Cada una se aplicó sola y se
corrió el test que la tiene que matar; las de e2e, con un build propio cada una.

| Mutación (§9)                                                                | Resultado                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectListRows` sin buscar en el cliente                                   | muerta: 1 (`project-list-model.test.ts`)                                                                                                                                                                                                                                                        |
| `projectListRows` sin `normalizeSearch`                                      | muerta: 2 (`project-list-model.test.ts`)                                                                                                                                                                                                                                                        |
| `projectListRows` que busca también por tarea                                | muerta: 1 (`project-list-model.test.ts`, «un nombre de tarea no trae su proyecto»)                                                                                                                                                                                                              |
| `projectListRows` con `noActive` antes de `noMatches`                        | muerta: 2 (`project-list-model.test.ts`)                                                                                                                                                                                                                                                        |
| El marco con un solo `title` para el botón y el diálogo                      | muerta: 1 (`projects-screen.test.tsx`, «Editar» dice «Editar»)                                                                                                                                                                                                                                  |
| `pickerView` ofrece la opción de crear sin `canCreateProject`                | muerta: 2 (`picker-model.test.ts`, `project-picker.test.tsx`)                                                                                                                                                                                                                                   |
| La opción de crear compara igual a «Sin proyecto»                            | muerta: 1 (`project-picker.test.tsx`, la opción no queda marcada)                                                                                                                                                                                                                               |
| `remainingCreation` sin mirar la solo lectura                                | muerta: 1 (`picker-model.test.ts`)                                                                                                                                                                                                                                                              |
| La búsqueda con `router.replace`                                             | muerta en e2e: `project-list.spec.ts`, «escribir en el buscador … sin pedir nada» (la verificó `e2e-tester`, `6d73f4a`)                                                                                                                                                                         |
| El campo de búsqueda con estado local sin resincronizar                      | muerta en e2e: `project-list.spec.ts`, «al volver atrás, el buscador y la tabla siguen…»                                                                                                                                                                                                        |
| Sin el foco al buscador cuando la fila editada deja de verse                 | muerta en e2e: `project-edit.spec.ts`, «si el nombre nuevo deja de coincidir con la búsqueda…»                                                                                                                                                                                                  |
| El selector llama a `onChange` en `onSuccess`, sin esperar al catálogo       | muerta en e2e: `project-from-picker.spec.ts`, la barra facturable                                                                                                                                                                                                                               |
| `replaceState` con la navegación del filtro en vuelo (la lista de `76322da`) | muerta en e2e: `project-list.spec.ts`, «escribir mientras viaja el filtro no lo cancela» (`67e1779`)                                                                                                                                                                                            |
| El envío del alta anidada sin `stopPropagation` (la de `76322da`)            | muerta en e2e: `project-from-picker.spec.ts`, el diálogo del calendario                                                                                                                                                                                                                         |
| `createProject` sigue revalidando solo `"/proyectos"`                        | muerta en integración (criterio 11, tabla de backend)                                                                                                                                                                                                                                           |
| El diálogo manda la fila entera en lugar del parche                          | muerta en e2e: `project-edit.spec.ts:317`, «con «Editar» abierto mientras el owner renombra el proyecto, guardar solo la nota conserva el nombre nuevo» (`b272cea`; la verificó `e2e-tester`). Antes sobrevivía: «editar solo la nota…» pasa igual, porque el service descarta lo que no cambió |

### Correcciones de las revisiones

| Commit    | Hallazgo                                                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f79ea94` | Mayor: escribir mientras viajaba el filtro cancelaba su `router.push` con el `replaceState`. Con la transición pendiente, el buscador actualiza solo el campo; al asentarse, un efecto escribe la búsqueda vigente si difiere de la URL, como eco propio |
| `64268a2` | Menor: un segundo guardado con el mismo nombre no se anunciaba. El texto va en un nodo con clave propia dentro de la región `status`                                                                                                                     |
| `1bc2fea` | Menor: en solo lectura (TT-92) quedaban vivos el alta abierta y la selección pendiente. `remainingCreation`, pura y con su test, los descarta                                                                                                            |
| `72b2264` | Clean code: `CreateDialogFrame` y `CreateDialog` pasan a `FormDialogFrame` y `FormDialog`, en `form-dialog.tsx`                                                                                                                                          |

## Corridas finales

Sobre `020d1e4`, con el árbol quieto: el código de backend, frontend y e2e
commiteado, sin cambios en el worktree. Cada paso con su base nueva.

| Paso                       | Dónde                                                                    | Resultado                                                       |
| -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `npm run lint`             | `clock-p1`                                                               | verde                                                           |
| `npm run typecheck`        | `clock-p1`                                                               | verde                                                           |
| `npx prettier --check .`   | `clock-p1`                                                               | verde                                                           |
| `npm test`                 | `clock-p1`                                                               | 122 archivos, 2775 casos; `test:time-ar`, 2 archivos, 309 casos |
| `npm run test:integration` | `clock-p1`, base nueva `clock_p1_fin_int`                                | 41 archivos, 2345 casos                                         |
| `npm run build`            | copia limpia por `git archive` en `scratchpad/p1-back-fin`               | verde, sin avisos                                               |
| e2e entera, base nueva     | `next start -p 3611` en la copia, base `clock_p1_fin_e2e` recién migrada | 300 pasan, sin fallas ni reintentos (2,0 min)                   |
| e2e entera, base reusada   | el mismo servidor y la misma base, con los datos de la corrida anterior  | 300 pasan, sin fallas ni reintentos (2,2 min)                   |
