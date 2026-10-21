# Fase 2, P1: editar proyectos, la lista completa y TT-09

Contrato del slice P1 de la fase 2. **`/proyectos` pasa a ser la lista
completa**: una tabla con columnas, buscador y filtro de estado en la URL, con
los proyectos activos y los archivados. Desde cada fila, owner, admin y el
responsable **editan** el proyecto en un diálogo: nombre, cliente, color, nota y
facturable por defecto. **Suma TT-09**: el selector de proyecto ofrece «Crear
proyecto», que abre el alta en un diálogo y deja elegido el proyecto nuevo, en
el rastreador, el calendario, la planilla y la edición masiva. **Sin cambios de
esquema y sin migración.** Una acción nueva en `can()`, `project.update`.

- **Fuente:** [`proyectos.md`](../parity/proyectos.md), PR-12, PR-15, PR-21,
  PR-30, PR-31, PR-55, PR-56, PR-61, PR-72, PR-77, PR-83 … PR-85, PR-89 …
  PR-91, PR-93, PR-95 y PR-101 … PR-103;
  [`time-tracker.md`](../parity/time-tracker.md), TT-07, TT-09, TT-14, TT-87,
  TT-89 y TT-90; [`timesheet.md`](../parity/timesheet.md), TS-88;
  [`mejoras-pedidas.md`](../mejoras-pedidas.md), mejora 2; el
  [mapa de la fase 2](fase2-mapa.md), «P1», §3 y «Lo que vale para todos».
- **Lugar en el plan:** primero del bloque de proyectos. No depende de ningún
  slice en curso. **P2 … P7 van después, en serie**, como dice el mapa: todos
  tocan `/proyectos` y el módulo `project` (D-P1-1). Corre en paralelo con E3
  (`clock-e3`), que toca `team` y `workspace`; P1 no toca ninguno de los dos,
  pero comparte un archivo de tests con él (§10).
- **Revisión:** `architecture-reviewer` (`p1-arch-review`) aprobó con cambios la
  versión `70711f9`: tres mayores y siete menores. Después, el usuario respondió
  las cuatro preguntas (§11) y dos cambiaron el diseño: no hay página propia por
  proyecto ni columna de tiempo. Esta versión aplica los hallazgos que siguen
  valiendo; el detalle está en «Hallazgos de la revisión», al final.
- **Decisiones de arquitectura: ningún ADR nuevo.** El ADR 0032 (una página por
  proyecto), propuesto con la versión anterior, quedó rechazado por el usuario
  el 2026-10-21. Lo que el slice decide cae dentro de ADR aceptados:
  [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md)
  (las pantallas de `time-entry` le pasan al selector la action de `project`,
  en la dirección que el ADR permite),
  [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) (TT-09 reusa
  el alta con el id que elige el navegador) y
  [ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md) (el estado
  de la lista vive en la URL, PR-95).

Decisiones del usuario que el contrato da por tomadas: TT-09 entra en P1
(2026-10-16, `fase2-mapa.md`); las cuatro respuestas del 2026-10-21 (§11); la
paridad de proyectos con sus pendientes P-16 … P-32 decididos (`proyectos.md`
§15), en particular la paleta fija (P-30), la nota sin formato (P-31), la
unicidad por cliente (P-19) y el facturable como diseño propio (P-16); crean
proyectos todas las membresías activas (workspace P-03, PR-59).

## Decisiones del contrato

**D-P1-1 — Todo se administra en `/proyectos` (decisión del usuario del
2026-10-21, §11, pregunta 1).** La pantalla sigue siendo una sola. La lista
pasa a ser una tabla (D-P1-6). Cada fila lleva sus acciones: «Editar» abre un
diálogo (D-P1-8) y «Nueva tarea» queda donde está. «Nuevo cliente», «Nuevo
proyecto», «Nueva etiqueta» y la sección de etiquetas no cambian. **P2 … P7
siguen en serie**, como dice el mapa: suman sus acciones a la misma fila, a la
misma cabecera y al mismo módulo. Las tareas de un proyecto se siguen viendo en
su fila (D-P1-7), y P4 decide cómo se administran ahí.

**D-P1-2 — Acción nueva `project.update`, sobre `ProjectResource`: owner, admin
y el responsable del proyecto (PR-55, PR-56, PR-57).** Es la misma regla que hoy
tiene `task.create` (`permissions/index.ts:210-212`): `isWorkspaceAdmin(actor) ||
project.viewer?.isManager === true`. `project_manager` y `team_manager` deciden
como `member` (PR-57): el rol de workspace `project_manager` no alcanza (PR-56,
P-24). Una membresía no activa no puede, por la regla común (PR-60).

- **Por qué una acción propia y no `task.create`**: P4 cambia `task.create` a
  «quien ve el proyecto» (WS-40), y editar el proyecto no tiene que cambiar con
  eso.
- **El archivado no entra en `can()`**: lo decide el service (D-P1-4), como en
  el alta de tarea y en la validación de una entrada (`service.ts:249-255`,
  `:355-361`). `can()` decide quién actúa, no en qué estado está la fila.
- **La pantalla** recibe `canUpdate` por fila, armado con `can()` y el archivado
  (§4.3).

**D-P1-3 — La edición es un parche: viaja solo lo que cambió, y lo que no viaja
no se toca.** La entrada lleva el id y, opcionales, `name`, `clientId`,
`color`, `note` y `billableByDefault`. En el service, en una transacción:

1. **La fila del proyecto `for no key update`**, en una sentencia que lee solo
   `project` (`lockProject`). **Después, en una segunda sentencia, la fila con
   la de miembro de quien actúa** (`findProject`). Son dos porque en `read
committed` un `join` dentro de la sentencia que bloquea lee la foto tomada
   antes de esperar el bloqueo. Es la trampa que documenta
   `time-entry/repository.ts:386-390`. La segunda sentencia toma su foto con el
   bloqueo ya tomado, así que la marca de responsable que decide
   `project.update` es la vigente. En P1 nadie escribe `project_member` desde
   la aplicación, pero P6 sí lo va a hacer.

   El bloqueo pone en fila a dos ediciones del mismo proyecto: la segunda lee
   lo que la primera confirmó, y el valor anterior de su constancia es el real.
   Es `for no key update` y no `for update` porque `time_entry`, `task` y
   `project_member` apuntan al proyecto con claves foráneas, que toman `for key
share`, y no tienen que esperar a una edición (criterio 9). El índice
   `project_name_unq` es de expresión, así que nombre y cliente no son columnas
   clave y el `update` tampoco las traba. **No bloquea nada más**: ni la
   membresía de quien actúa ni la del cliente.

2. **Las reglas de D-P1-4**, en su orden.
3. **Lo que cambia**: de los campos que llegaron, los que difieren de la fila
   (`changedProjectFields`, una función pura). **Si nada difiere, responde
   éxito sin escribir y sin dejar constancia.** Es lo que hace inofensivo
   «Reintentar» después de una respuesta perdida (TT-89).
4. `update project set …` con esos campos (`updated_at` lo pone `$onUpdate`,
   `db/schema.ts:318-321`) y `recordAudit` con `project.update` (§4.5).

**Dos personas que editan a la vez** quedan en fila detrás del bloqueo. Si
tocan campos distintos, quedan los dos cambios: eso lo da el parche, y no lo
daría reemplazar la fila entera. Si tocan el mismo campo, gana la segunda, y las
dos constancias lo cuentan. **No hay control de versión**: Clock no tiene en
ningún lado un «alguien lo cambió mientras editabas», y para cinco personas no
se justifica.

**No se relee la membresía de quien actúa bajo bloqueo**, igual que en las
cuatro altas del módulo (`service.ts:114-334`): el `Actor` es el de la sesión
del pedido. La relectura de D-R8-7 es propia de las mutaciones de equipo, que
cambian la autoridad misma. Acá la ventana dura un pedido, y quien pierde el rol
lo ve en el pedido siguiente.

**D-P1-4 — Las reglas de una edición, en este orden.**

1. **El proyecto**: si no existe en el workspace de la sesión, o si
   `project.view` no lo deja ver (también con la membresía no activa), responde
   `not_found` con «Ese proyecto ya no está disponible.» (PR-72). Un privado
   ajeno responde lo mismo que uno inexistente.
2. **Archivado**: el mismo `not_found` de PR-72. **Un proyecto archivado no se
   edita hasta restaurarlo** (decisión del usuario del 2026-10-21, §11, pregunta
   4). Su fila no ofrece «Editar», y «Restaurar» llega con P2. Es la regla que
   ya rige para crearle tareas a un archivado, y PR-72 ya nombra «archivado».
3. **El permiso**: sin `project.update`, responde `forbidden` con «No tenés
   permiso para hacer esto.» (PR-84).
4. **Los campos** (se validan en el esquema Zod, antes del service, salvo el
   cliente):
   - **Nombre**: se recorta. Vacío, PR-75; más de 100 caracteres, PR-76; con el
     carácter nulo, el texto de siempre. **Repetido para el mismo cliente**,
     PR-77, también cuando lo que cambia es el cliente y el nombre queda igual
     (PR-50, riesgo del mapa). No hay validación previa: lo decide el índice
     `project_name_unq` (`db/schema.ts:346-350`), y el service traduce el error
     como en el alta (PR-91, `translatingNameTaken`).
   - **Cliente**: `null` es «Sin cliente» (PR-14). **Solo se valida si
     cambia**: el cliente nuevo tiene que existir en el workspace y no estar
     archivado; si no, responde `not_found` con «Ese cliente ya no está
     disponible.» (PR-83). Un proyecto que ya tiene un cliente archivado lo
     conserva en cualquier edición que no cambie el cliente (PR-98: los dos
     estados son independientes).
   - **Color**: una clave de la paleta (P-30). **En la edición no se admite
     `null`**: que el servidor asigne el color es algo del alta (PR-15).
   - **Nota**: se recorta, hasta 3000 caracteres (PR-30, PR-54).
   - **Facturable por defecto**: un booleano. **Cambiarlo no toca ninguna
     entrada** (TT-14, riesgo del mapa): solo decide con qué valor arrancan las
     entradas nuevas y las que cambian de proyecto después.

**Lo que ya está construido y P1 no cambia** (slice 10): si a un proyecto con
entradas se le cambia el nombre, el color o el cliente, el cambio se ve en todas
sus entradas, pasadas incluidas, porque la entrada guarda la referencia (PR-101
… PR-103). P1 lo verifica en e2e (criterio 21).

**D-P1-5 — Revalidación: el árbol entero para el alta y la edición de un
proyecto; las otras tres altas no cambian.**

- **`createProject` y `updateProject`** revalidan `{ path: "/", type:
"layout" }`, como la configuración (D-WS2b-5). El alta corre desde el
  selector del rastreador, del calendario y de la planilla (TT-09), y el nombre
  y el color de un proyecto se ven en todas las pantallas. Desde una Server
  Function, `revalidatePath` actualiza la pantalla abierta en la misma respuesta
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:19`).
- **`createClient`, `createTask` y `createTag`** siguen con `"/proyectos"`
  (`actions.ts:22-28`), sin cambios: solo se ven en esa pantalla.

`handle` revalida también cuando hay error (`action.ts:37-54`), como hasta hoy.

**D-P1-6 — La lista: todos los proyectos visibles, activos y archivados. El
filtro y la búsqueda se aplican en el navegador y viven en la URL (PR-31, PR-89,
PR-95).**

- **Qué trae el servidor**: `getProjectList` lee en una transacción `repeatable
read` todos los proyectos del workspace con la fila de miembro de quien pide
  (`listAllProjects`, `repository.ts:279-285`), los clientes y las tareas
  activas de cada proyecto, archivados incluidos. Después filtra con `can(actor,
"project.view", …)` (PR-61, PR-93), como `readCatalog`. **El orden es
  alfabético y plano**, con `compareNames` (`lib/text.ts:27`), sin grupos por
  cliente: el cliente es una columna.
- **Las columnas**, en este orden:
  - «Nombre»: el punto de color y el nombre. Con «Todos», un archivado lleva
    «Archivado» al lado del nombre.
  - «Cliente»: «Sin cliente» si no tiene.
  - «Acceso»: «Público» o «Privado». Hasta P6, todos son públicos.
  - «Tareas»: los nombres de las tareas activas (D-P1-7).
  - Acciones: la columna tiene un encabezado solo para el lector de pantalla,
    «Acciones».

  **No hay columna de tiempo imputado** (decisión del usuario del 2026-10-21,
  §11, pregunta 2). PR-31 se corrige (§7).

- **El filtro de estado**: «Activos» (por omisión), «Archivados» y «Todos», en
  el parámetro `estado` (`activos`, `archivados`, `todos`). Elegir uno
  **navega** con `router.push`, como el filtro de `/equipo` (D-E2-8,
  `team/components/status-filter.tsx:31-46`): cada filtro es una entrada del
  historial, y el botón de volver lo deshace (PR-95).
- **El buscador**: busca por nombre de proyecto y de cliente, sin distinguir
  mayúsculas ni acentos (`normalizeSearch`, como TT-07), en el parámetro
  `buscar`. Escribir **reemplaza** la URL con `window.history.replaceState`:
  no hace ningún pedido al servidor ni suma una entrada de historial por tecla.
  Next sincroniza `useSearchParams` con la API nativa
  (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:345-347`).
  Al recargar, lo escrito se conserva (PR-95).
- **Cada parámetro inválido se ignora por separado** (ADR 0008, como
  `teamSearchParams`). Un `estado` desconocido o repetido es «Activos»; un
  `buscar` repetido o de más de 100 caracteres es vacío. **Uno no arrastra al
  otro**: con `?estado=x&buscar=web`, la búsqueda `web` se conserva (§4.1).
- **Los vacíos se distinguen** (PR-85, PR-89):
  - Sin ningún proyecto visible: «Todavía no hay proyectos».
  - Con «Activos» y todos archivados: «No hay proyectos activos», con la
    sugerencia de cambiar el filtro.
  - Con «Archivados» y ninguno: «No hay proyectos archivados».
  - Con búsqueda y sin coincidencias: «Ningún proyecto coincide con la
    búsqueda.», la misma redacción que el selector (TT-07), por la regla de una
    redacción por causa.

**Por qué en el navegador**: es el mismo criterio del selector (PR-110) y de
`/equipo`. El workspace del plan Free es chico, la lista entera ya viaja para
dibujarse, y filtrar sin pedido hace que la búsqueda responda a cada tecla.

**D-P1-7 — La fila muestra las tareas activas por nombre. Un archivado se ve en
solo lectura.**

- **«Tareas»** lista los nombres de las tareas activas del proyecto, en orden
  alfabético, como una lista con el nombre accesible de hoy, `tasksLabel`
  («Tareas de «X»»). Es lo que la pantalla muestra hoy debajo de cada proyecto,
  ahora dentro de la tabla. PR-31 pedía la cantidad: los nombres la dicen y no
  esconden lo que hoy se ve (PR-31 se corrige, §7). Sin tareas, la celda queda
  vacía.
- **Las acciones** son «Editar» con `canUpdate` (D-P1-8) y «Nueva tarea» con
  `canCreateTask` (el diálogo de hoy, sin cambios). Las dos llevan el nombre del
  proyecto en su nombre accesible: «Editar «X»» y `newTaskLabel`.
- **Un archivado** (con «Archivados» o «Todos») no ofrece ninguna de las dos:
  `canUpdate` y `canCreateTask` son falsos con el archivado (§4.3). P2 suma ahí
  sus acciones.

**D-P1-8 — Editar es un diálogo desde la fila.** «Editar» abre «Editar
proyecto», con el nombre del proyecto como descripción y los campos de D-P1-9 en
su forma de edición, con los valores de la fila. Usa el marco de las altas
(`CreateDialog`, `create-dialog.tsx:55-184`), con su disparador, el aviso con
«Reintentar» solo por red (TT-89, PR-90), la regla de no cerrar mientras viaja y
`useSurvivingNotice`. Su nombre (`CreateDialog` o `FormDialog`) lo decide
`frontend-dev`.

- **«Guardar» manda el parche**: solo los campos que difieren de la fila
  (D-P1-3). **Si no cambió nada, cierra sin mandar.**
- **Con éxito**, el diálogo se cierra, la fila muestra los valores nuevos con la
  revalidación de la misma respuesta (D-P1-5), y la pantalla anuncia «Proyecto
  «{nombre}» guardado» en una región `status`, como el alta de un cliente. El
  foco vuelve a «Editar» de la fila. Si la fila ya no se muestra (porque el
  nombre nuevo no coincide con la búsqueda), el foco va al buscador.
- **Con falla**, el diálogo queda abierto con lo escrito y el aviso «No se
  pudieron guardar los cambios.», con la causa.
- **El aviso que sobrevive** (`project-notices.tsx:56-123`), con la clave
  `edit:<id>`: si la edición falla con `not_found` o `forbidden`, la
  revalidación puede traer la fila sin «Editar», o sin la fila. Pasa cuando el
  proyecto se archivó (y el filtro es «Activos») o cuando la persona dejó de ser
  responsable. En ese caso el aviso pasa a la región de la pantalla con el
  foco, como el de «Nueva tarea» del slice 9.
- **Abrir el diálogo** arma el borrador con la fila de ese momento: un cambio de
  otra persona que ya llegó con una revalidación se ve al abrir.

**D-P1-9 — Un solo juego de campos para el alta, la edición y TT-09.** Los
campos de `new-project-dialog.tsx:114-170` pasan a `ProjectFields`, un
componente controlado con el borrador y su `onChange`. Lo usan los tres
formularios, con estas diferencias:

- **Alta** (en la cabecera de `/proyectos` y en TT-09): el color empieza sin
  elegir, con la ayuda «Si no elegís uno, se asigna automáticamente.», y el
  facturable empieza sin marcar.
- **Edición**: los campos arrancan con los valores guardados. El color está
  siempre elegido y **no** lleva esa ayuda. El selector de cliente ofrece «Sin
  cliente», los clientes activos y, si el proyecto tiene un cliente archivado,
  ese mismo con «(archivado)» después del nombre (D-P1-4).

**D-P1-10 — TT-09: «Crear proyecto» es la última opción de la lista del
selector, para quien tiene `project.create`, y abre el alta en un diálogo.**
Clockify la ofrece «al final del buscador cuando el permiso lo habilita»
(TT-09).

- **Es una opción del `listbox`, no un botón suelto**: se alcanza con las
  flechas y se elige con Enter, como las demás, y no depende de que `Tab` no
  cierre el popup (en el selector, `Tab` cierra). No es una selección:
  `PickerOption` pasa a una unión con `kind` (§5.4), así nunca compara igual a
  «Sin proyecto» ni llega a `onChange`.
- **Va siempre al final y aparece con cualquier búsqueda**, también sin
  coincidencias y cuando todo está excluido en la planilla (TS-18): un proyecto
  nuevo nunca está excluido. El texto es siempre «Crear proyecto».
- **Reemplaza a «Ir a Proyectos» en el selector vacío** (TT-87, TS-88; decisión
  del usuario del 2026-10-21, §11, pregunta 3). Con el catálogo vacío, el
  selector sigue diciendo «No hay proyectos todavía», y la lista trae «Sin
  proyecto» y «Crear proyecto». El «Ir a Proyectos» del selector de
  **etiquetas** (TT-88) no cambia: las etiquetas se siguen creando en
  `/proyectos` hasta P5.
- **El diálogo**: «Nuevo proyecto», con los campos de D-P1-9 en su forma de
  alta y **el nombre arrancando con la búsqueda recortada**. Reusa
  `createProject`, con el id de `useNewId` (ADR 0007): «Reintentar» no crea un
  segundo proyecto. Se monta cuando se pide y no tiene disparador propio:
  cerrarlo, por éxito o por la persona, devuelve el foco al disparador del
  selector.
- **Con éxito**, el selector entrega el proyecto nuevo, sin tarea, con
  `onChange` (D-P1-11). Lo que pasa después depende del lugar:
  - en la barra, queda elegido para «Iniciar» o «Agregar»;
  - en una fila o en el timer que corre, se guarda sobre la entrada como
    cualquier cambio de proyecto;
  - en los diálogos del calendario y de la edición masiva, queda en el
    borrador;
  - en la planilla, la fila toma el par.
- **Con falla**, el diálogo queda abierto con lo escrito y el aviso «No se pudo
  crear el proyecto.», con la causa (PR-75 … PR-77, PR-83, PR-84). «Reintentar»
  aparece solo con un error de red.
- **Las pantallas del rastreador no tienen `ProjectNoticesProvider`**: el aviso
  vive en el diálogo. El único caso en que el diálogo sale del árbol con su
  aviso es el de la membresía desactivada (TT-92): la revalidación pone el
  selector en solo lectura, y la pantalla muestra su aviso de membresía
  inactiva, que ya lo explica.
- **Dentro de otro diálogo** (el de una entrada del calendario o el de la
  edición masiva), el de TT-09 es un diálogo anidado: `Escape` cierra solo el
  de arriba, y el de abajo sigue abierto con su borrador (la misma regla de
  CAL-67 para el selector).

**D-P1-11 — El selector entrega el proyecto nuevo cuando el catálogo ya lo
tiene.** Quien recibe `onChange` busca en el catálogo el facturable por defecto
del proyecto elegido (`withSelection`, `entry-fields.ts:59-75`), y la planilla
decide con el catálogo si el par se puede cargar (`isTrackablePair`, D13-8). Si
el selector entregara el proyecto en el mismo instante del éxito, el catálogo de
esa vista todavía no lo tendría: la entrada nueva arrancaría no facturable
aunque el proyecto lo fuera (TT-14), y la fila de la planilla lo vería como no
cargable. Por eso:

- **El selector guarda la selección pendiente** al recibir el éxito y la
  entrega con `onChange` **en un efecto, cuando `catalogEntryOf(catalog, par)`
  la encuentra** en el catálogo del proveedor. El catálogo nuevo llega con la
  revalidación de la misma respuesta (D-P1-5). Para entonces, los componentes
  que escuchan ya se dibujaron con él, y sus manejadores lo ven.
- **La selección pendiente se descarta** si el selector se vuelve a abrir, si su
  valor cambia por otro lado o si se desmonta. Si el catálogo no la trae nunca
  (porque alguien archivó el proyecto en el medio), no se elige nada y el
  selector sigue como antes.
- **`time-entry` no cambia**: ni `withSelection`, ni `isTrackablePair`, ni el
  `ProjectSelection` que recibe.

**D-P1-12 — El catálogo del rastreador suma los clientes activos, y el resultado
del alta se achica.**

- **`TrackingCatalog.clients`**: los clientes activos, en orden alfabético,
  para el selector de cliente del diálogo de TT-09. Queda vacío sin
  `project.create`. Sale de la misma lectura (`readCatalog` ya lee todos los
  clientes, `service.ts:481`), sin consulta nueva.
- **`CreateProjectResult`** pasa de `{ project: ProjectView }` a `{ project:
ProjectRef }`: el selector necesita el id, el nombre y el color para armar la
  selección, y el resto lo busca en el catálogo (D-P1-11). Hoy nadie lee el
  resultado más que para cerrar el diálogo. El reintento lo arma con la fila
  propia, como hoy.
- **El MCP no cambia** (D-P1-14): `list_projects` copia campo por campo
  (`mcp/tools.ts:298-312`) y no ve `clients`.

**D-P1-13 — La action llega al selector por el proveedor del catálogo.** El
selector es del módulo `project`, y lo usan seis componentes de `time-entry`:
`tracker-bar.tsx:628`, `entry-row.tsx:275`, `bulk-edit-dialog.tsx:251`,
`calendar/entry-dialog.tsx:401`, `calendar/entry-dialog-body.tsx:79` y
`timesheet/timesheet-row.tsx:53`. En lugar de pasarle la action a cada uno,
`TrackingCatalogProvider` recibe `createProject` además del catálogo, y el
selector la toma con un hook del mismo archivo.

Las tres pantallas que montan el proveedor (`tracker-screen.tsx:52`,
`calendar/calendar-screen.tsx:51` y `timesheet/timesheet-screen.tsx:54`) son
componentes de servidor: importan `createProject` de
`@/modules/project/actions` y la pasan. Es una dependencia de `time-entry` hacia
`project`, la dirección que permite el ADR 0010. Los tests de componentes que
montan el proveedor le pasan un doble.

**D-P1-14 — El MCP no cambia.** `list_projects` y `summarize_hours` leen los
proyectos en cada pedido, así que un nombre o un color nuevos aparecen solos.
Crear o editar proyectos desde el asistente no está pedido: sería una
herramienta nueva sobre las mismas operaciones, con su propio slice.

**D-P1-15 — Sin migración.** Todas las columnas que la edición escribe existen
desde los slices 9 y 11a, y `audit_log` guarda cualquier acción. P1 no corre
`db:generate` ni toma número de migración: la `0021` queda para E3.

## 0. Precondición de arranque

- **El worktree** es `/home/maxi/program/clock-p1`, en la rama
  `fase2/p1-proyectos`, que sale de `main` en `380ef3b` con WS2a, WS2b y el MCP
  de equipo.
- **`npm ci` en el worktree** antes del primer paso: no tiene `node_modules`, y
  el contrato cita guías de `node_modules/next/dist/docs/` que hay que leer
  antes de escribir código (`AGENTS.md`).
- **Las cuatro preguntas ya tienen respuesta** (§11).
- **No hay migración** (D-P1-15). Las bases de prueba se migran con el
  `drizzle/` del árbol.

### Supuestos sobre el árbol

Las citas son del árbol de `clock-p1` en `380ef3b`.

| Supuesto                                                                                                               | Dónde                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `project` con nombre, cliente, color, `is_public`, `billable_by_default`, nota, `archived_at`; su índice y su `check`  | `src/server/db/schema.ts:303-360`                                                                     |
| La unión `Action`, la tabla de clases de recurso, la de roles y `allowsOnProject`                                      | `src/server/permissions/index.ts:59-114`, `:124-151`, `:161-188`, `:198-216`                          |
| Las altas, `translatingNameTaken`, `readCatalog`, `getProjectCatalog` y `getTrackingCatalog`                           | `src/modules/project/service.ts:98-111`, `:160-233`, `:474-523`, `:526-540`, `:551-567`               |
| `findProject`, `findClient`, `listClients`, `listAllProjects`, `listActiveTasks` e `isProjectNameTaken`                | `src/modules/project/repository.ts:79-90`, `:173-187`, `:258-260`, `:279-285`, `:288-304`, `:364-366` |
| Bloquear en una sentencia y releer las referencias en otra                                                             | `src/modules/time-entry/repository.ts:381-399` (`findByIdForUpdate`)                                  |
| Los esquemas, `ProjectCatalog`, `TrackingCatalog`, `CreateProjectResult` y `ProjectActions`                            | `src/modules/project/schema.ts:58-67`, `:115-126`, `:175-184`, `:189`, `:196-207`                     |
| Las cuatro actions revalidan `"/proyectos"`                                                                            | `src/modules/project/actions.ts:22-28`                                                                |
| La pantalla agrupa por cliente, con las tareas y «Nueva tarea» en cada proyecto                                        | `src/modules/project/components/projects-screen.tsx:30-129`; `src/app/(app)/proyectos/page.tsx:11-21` |
| El marco de los diálogos de alta, con su disparador y el aviso que sobrevive                                           | `components/create-dialog.tsx:55-184`; `components/project-notices.tsx:56-123`                        |
| Los campos del alta de proyecto; `ColorField` con la ayuda fija                                                        | `components/new-project-dialog.tsx:61-173`; `components/color-field.tsx:21-57`                        |
| El selector: `items` con «Sin proyecto» en su grupo, `choose`, el vacío con «Ir a Proyectos» y el modo de solo lectura | `components/project-picker.tsx:126-161`, `:287-307`                                                   |
| El modelo del selector: `PickerOption`, `PickerEmpty`, `pickerView` y `catalogEntryOf`                                 | `components/picker-model.ts:13-42`, `:121-155`, `:168-189`                                            |
| El proveedor del catálogo                                                                                              | `components/tracking-catalog.tsx:16-33`                                                               |
| Los seis usos del selector y las tres pantallas que montan el proveedor                                                | D-P1-13                                                                                               |
| `withSelection` busca el facturable en el catálogo                                                                     | `src/modules/time-entry/components/entry-fields.ts:43-75`                                             |
| `useAction` corre `onSuccess` en una transición                                                                        | `src/hooks/use-action.ts:60-86`                                                                       |
| `handle` revalida también cuando hay error                                                                             | `src/server/action.ts:37-54`                                                                          |
| `list_projects` copia el catálogo campo por campo                                                                      | `src/modules/mcp/tools.ts:286-315`                                                                    |
| El filtro de `/equipo` navega con `router.push`; `teamSearchParams`                                                    | `src/modules/team/components/status-filter.tsx:31-46`; `src/modules/team/schema.ts:29-31`             |
| `normalizeSearch`, `compareNames` y `sortedByName`                                                                     | `src/lib/text.ts:14`, `:27`, `:42`                                                                    |
| Las barreras de concurrencia de los tests                                                                              | `src/test/concurrency.ts:113` (`outcomeWhileHeld`), `:178` (`queueBehindBarrier`)                     |
| Un test de actions siembra un segundo owner inactivo                                                                   | `src/modules/project/actions.integration.test.ts:284-285`                                             |
| Dos e2e del selector cuentan las opciones                                                                              | `e2e/project-picker.spec.ts:95`, `:391`                                                               |
| Los e2e de `/proyectos`: los grupos, «Nueva tarea» en el proyecto y sus avisos                                         | `e2e/projects.spec.ts:66-80`, `:243`, `:293`, `:323`, `:345`; `e2e/projects-page.ts`                  |
| Los tests de unidad no tienen biblioteca de DOM: usan `renderToStaticMarkup`                                           | `src/modules/project/components/projects-screen.test.tsx`; `project-picker.test.tsx`                  |

## 1. Alcance

Cubre:

- **PR-12** en la edición (nombre, cliente, color, nota y facturable por
  defecto de un proyecto ya creado), con **PR-15** (el color de la paleta),
  **PR-21** (el facturable por defecto, la deuda del slice 11a) y **PR-30** (la
  nota).
- **PR-31**: la lista con sus columnas, el buscador y el filtro de estado, sin
  tiempo imputado (§11, pregunta 2).
- **PR-55** y **PR-56** en lo que es editar: owner, admin y el responsable.
- **PR-89** (los vacíos de la lista) y **PR-95** (el filtro y la búsqueda en la
  URL).
- **TT-09**: crear un proyecto desde el selector, en todos los lugares que lo
  usan. Cambia **TT-87** y **TS-88** (el vacío del selector).
- Valen para la acción nueva, y P1 los prueba: PR-57, PR-60, PR-61, PR-72,
  PR-75 … PR-77, PR-83, PR-84, PR-90, PR-91 y PR-93. En e2e, sobre la edición,
  P1 también prueba PR-101 … PR-103, que ya están construidos.

Entra:

- **`project.update`** en `can()` (D-P1-2).
- **`updateProject`**: esquema, repository, service y action (D-P1-3, D-P1-4).
- **`getProjectList`**, que reemplaza a `getProjectCatalog` (§4.3).
- **La tabla de `/proyectos`** con su filtro y su buscador, y **el diálogo de
  edición** desde cada fila (D-P1-6 … D-P1-8).
- **`ProjectFields`** (D-P1-9).
- **TT-09** en el selector, el proveedor con la action y los clientes en el
  catálogo (D-P1-10 … D-P1-13).
- **Las correcciones de paridad y del mapa** (§7).

Lo que queda afuera está en §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                                                                                                                                                                                                                                       | Qué cambia                                                                                                                                                                                               | Qué hay que volver a probar                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/server/permissions/index.ts`                                                                                                                                                                                                                                                             | `project.update` en las tres tablas y en `allowsOnProject`                                                                                                                                               | `permissions.test.ts`                                                                                                    |
| `project/schema.ts`                                                                                                                                                                                                                                                                           | Lo de §4.1. Se van `ProjectCatalog`, `ProjectGroupView` y `ProjectView`; cambia `CreateProjectResult`; se suma `TrackingCatalog.clients`                                                                 | `schema.test.ts`                                                                                                         |
| `project/repository.ts`, `service.ts`, `actions.ts`                                                                                                                                                                                                                                           | Lo de §4.2 a §4.4. `getProjectCatalog` se reemplaza; `createProject` revalida el árbol (D-P1-5)                                                                                                          | `service.integration.test.ts` (los casos de `getProjectCatalog` pasan a `getProjectList`), `actions.integration.test.ts` |
| `project/components/projects-screen.tsx` y su test                                                                                                                                                                                                                                            | La tabla, el filtro, el buscador y «Editar»; sin grupos                                                                                                                                                  | `projects-screen.test.tsx`, reescrito                                                                                    |
| `project/components/new-project-dialog.tsx`, `create-dialog.tsx`, `color-field.tsx`                                                                                                                                                                                                           | Usan `ProjectFields` y el marco partido; la ayuda del color va solo en el alta                                                                                                                           | los tests de la pantalla; `e2e/projects.spec.ts`, sin cambiar lo que afirma de las altas                                 |
| `project/components/project-picker.tsx`, `picker-model.ts`, `tracking-catalog.tsx`, `labels.ts`                                                                                                                                                                                               | TT-09, la opción de crear, la selección pendiente y el proveedor con la action; `PickerEmpty.noProjects` pierde `canCreateProject`                                                                       | `picker-model.test.ts`, `project-picker.test.tsx`, `tag-picker.test.tsx`                                                 |
| `time-entry/components/tracker-screen.tsx`, `calendar/calendar-screen.tsx`, `timesheet/timesheet-screen.tsx`                                                                                                                                                                                  | Pasan `createProject` al proveedor                                                                                                                                                                       | sus e2e, sin cambiar lo que afirman                                                                                      |
| Los tests que arman un `TrackingCatalog` o montan el proveedor: `entry-row.test.tsx`, `entry-fields.test.ts`, `calendar/calendar-block.test.tsx`, `calendar/entry-dialog.test.tsx`, `timesheet/timesheet-view.test.tsx`, `timesheet/stored-rows.test.ts`, `timesheet/timesheet-model.test.ts` | `clients: []` en el catálogo y un doble de `createProject` en el proveedor                                                                                                                               | los mismos, sin cambiar lo que afirman                                                                                   |
| `src/app/(app)/proyectos/page.tsx`                                                                                                                                                                                                                                                            | Parsea `estado` y `buscar`; pasa `updateProject`                                                                                                                                                         | la e2e                                                                                                                   |
| `e2e/project-picker.spec.ts`                                                                                                                                                                                                                                                                  | `:95` y `:391` esperan 2 opciones, y la suite corre como owner, que tiene `project.create`: pasan a contar solo las opciones de selección (§9.3)                                                         | el archivo                                                                                                               |
| `e2e/projects.spec.ts`, `e2e/projects-page.ts`                                                                                                                                                                                                                                                | Los localizadores de grupo y de proyecto (`:66-80`) pasan a la tabla; el caso de los grupos (`:243`) pasa al orden de la tabla; los de «Nueva tarea» (`:293`, `:323`, `:345`) buscan el botón en la fila | la e2e entera                                                                                                            |

- **No cambian**: `src/server/db/` y `drizzle/`; `src/server/session.ts`,
  `access.ts` y `entry.ts`; `src/server/time/`; en `time-entry`, el service,
  el repository y los componentes, salvo las tres pantallas y los fixtures;
  `team`; `workspace`; `profile`; `report`; `mcp`; `src/components/layout/`.
- **Las demás e2e del selector siguen pasando sin cambios**: ninguna otra cuenta
  opciones, y ninguna afirma el vacío de TT-87 (la base de los e2e siempre
  tiene proyectos).

## 2. Esquema y migración

**No hay cambio de esquema ni migración** (D-P1-15). El índice
`project_name_unq` ya cubre el cambio de nombre y de cliente, la clave
`project_client_fk` ya ata el cliente al workspace, y el `check` de la paleta ya
rechaza un color fuera de lista. `drizzle/` no se toca.

## 3. Permisos

**Hay una acción nueva**, `project.update` (D-P1-2):

```ts
// ResourceByAction, después de "task.create":
  // PR-55, PR-56: editar un proyecto. Owner, admin y su responsable, por la
  // marca de `project_member` que viaja en el recurso (P-24). El archivado lo
  // decide el service (PR-72), no `can()`.
  "project.update": ProjectResource;

// resourceKinds:
  "project.update": ["project"],

// allowedRoles: el rol no alcanza; decide `allowsOnProject` (PR-57).
  "project.update": everyone,

// allowsOnProject:
    // PR-55, PR-56.
    case "project.update":
      return isWorkspaceAdmin(actor) || project.viewer?.isManager === true;
```

| Acción           | Recurso             | Quién                                      | Dónde se consulta                                                                                     |
| ---------------- | ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `project.update` | `ProjectResource`   | owner, admin y el responsable del proyecto | `updateProject` (después de ver el proyecto y su archivado) y `getProjectList` (`canUpdate` por fila) |
| `project.view`   | `ProjectResource`   | sin cambios                                | `getProjectList`, además de lo de hoy                                                                 |
| `project.create` | `WorkspaceResource` | sin cambios                                | además, para `clients` del catálogo del rastreador (TT-09)                                            |

## 4. Contrato de backend

### 4.1 Esquemas (`src/modules/project/schema.ts`)

`projectMessages` no cambia: la edición responde con los mensajes de causa que
ya existen (§4.6), y el título del aviso vive en `labels.ts` (§5.6).

```ts
/**
 * D-P1-3, D-P1-4: un parche sobre un proyecto. Lo que no viaja no cambia. Los
 * mismos campos y mensajes que el alta, salvo el color, que no admite `null`.
 */
export const updateProjectInput = z.object({
  id: z.uuid(),
  name: name.optional(),
  clientId: z.uuid().nullable().optional(),
  color: z.enum(PALETTE_KEYS).optional(),
  note: longText(projectMessages.noteTooLong).optional(),
  billableByDefault: z.boolean().optional(),
});
export type UpdateProjectInput = z.input<typeof updateProjectInput>;
export type UpdateProjectValues = z.output<typeof updateProjectInput>;

/** Lo que la edición escribe de un proyecto, tal como quedó. */
export type ProjectSettings = {
  readonly id: string;
  readonly name: string;
  readonly clientId: string | null;
  readonly color: PaletteKey;
  readonly note: string;
  readonly billableByDefault: boolean;
};
export type UpdateProjectResult = { readonly project: ProjectSettings };

/** D-P1-12: lo que el selector necesita para elegir el proyecto creado. */
export type CreateProjectResult = { readonly project: ProjectRef };

/** D-P1-6: los tres valores del filtro de estado, en el orden del selector. */
export const PROJECT_FILTERS = ["activos", "archivados", "todos"] as const;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];

/**
 * D-P1-6, ADR 0008: cada parámetro inválido se ignora por separado. Un
 * `estado` desconocido no se lleva la búsqueda.
 */
export const projectsSearchParams = z.object({
  estado: z.enum(PROJECT_FILTERS).optional().catch(undefined),
  buscar: z.string().max(NAME_MAX).optional().catch(undefined),
});

/** Una fila de la lista (PR-31, D-P1-7). */
export type ProjectListItem = ProjectSettings & {
  /** `null` es «Sin cliente». */
  readonly client: (ClientView & { readonly archived: boolean }) | null;
  readonly isPublic: boolean;
  readonly archived: boolean;
  /** Activas, en orden alfabético (PR-38). */
  readonly tasks: readonly TaskView[];
  /** `project.update` y no archivado (D-P1-2, D-P1-4). */
  readonly canUpdate: boolean;
  /** `task.create` y no archivado. */
  readonly canCreateTask: boolean;
};

/** `/proyectos`: reemplaza a `ProjectCatalog`. */
export type ProjectListView = {
  readonly canCreateClient: boolean;
  readonly canCreateProject: boolean;
  readonly canCreateTag: boolean;
  /** PR-112, hasta P5: las activas, en orden alfabético; vacío sin `tag.view`. */
  readonly tags: readonly TagRef[];
  /** Los clientes activos, para el alta y la edición. Orden alfabético. */
  readonly clients: readonly ClientView[];
  /** Los que `project.view` deja ver, activos y archivados, por `compareNames`. */
  readonly projects: readonly ProjectListItem[];
};

// TrackingCatalog suma:
  /** D-P1-12: los activos, en orden alfabético, para TT-09; vacío sin `project.create`. */
  readonly clients: readonly ClientView[];

// ProjectActions suma:
  readonly updateProject: (
    input: UpdateProjectInput,
  ) => Promise<ActionResult<UpdateProjectResult>>;
```

- **Las salidas son tipos, no esquemas Zod**: las escribe el servidor.
- `ProjectCatalog`, `ProjectGroupView` y `ProjectView` se borran junto con
  `getProjectCatalog`. `ProjectRef`, `TrackingProjectView`, `TrackingGroupView`,
  `ProjectFilterCatalog` y los demás tipos no cambian.
- **El código de error** sigue siendo `ActionErrorCode`: `validation` sale del
  `ZodError` y del nombre repetido, `not_found` de `ProjectError`, y
  `forbidden` de `ForbiddenError`.
- **`.catch(undefined)` por campo** es lo que hace que `safeParse` no falle
  entero (D-P1-6). Con algo que no es un objeto (no pasa con `searchParams`),
  sigue fallando, y la página usa entonces los valores por omisión.

### 4.2 Repository (`src/modules/project/repository.ts`)

Suma a `projectRepository`:

```ts
/**
 * D-P1-3: bloquea el proyecto `for no key update`, en una sentencia que lee
 * solo `project`. `true` si existe en el workspace. La fila con la de miembro
 * se relee después con `findProject`, por la razón de `findByIdForUpdate` de
 * `time-entry`.
 */
async lockProject(tx: Transaction, workspaceId: string, id: string): Promise<boolean>;

/** D-P1-3: los campos que cambian, ya validados. Devuelve la fila como quedó. */
async updateProject(
  tx: Transaction,
  workspaceId: string,
  id: string,
  values: Partial<Pick<ProjectRow, "name" | "clientId" | "color" | "note" | "billableByDefault">>,
): Promise<ProjectRow>;

/**
 * D-P1-6: las tareas activas del workspace, también las de los proyectos
 * archivados. Sin orden: lo pone el service.
 */
async listActiveTasksOfAllProjects(tx: Executor, workspaceId: string): Promise<TaskRow[]>;
```

Todas filtran por el `workspaceId` de la sesión. `updateProject` filtra por
workspace y por id, y lanza si no actualizó ninguna fila (no puede pasar con la
fila bloqueada). `listActiveTasks` (`:288-304`) no cambia: sigue siendo la del
catálogo del rastreador, que excluye los proyectos archivados.

### 4.3 Service (`src/modules/project/service.ts`)

```ts
/**
 * PR-12, PR-15, PR-21, PR-30, PR-55, PR-56: D-P1-3 y D-P1-4. El mismo valor no
 * escribe. Deja `project.update` con los campos que cambiaron.
 */
export async function updateProject(
  actor: Actor,
  input: UpdateProjectValues,
): Promise<UpdateProjectResult>;

/** D-P1-6, D-P1-7, PR-31, PR-61, PR-93: la lista de `/proyectos`. Reemplaza a `getProjectCatalog`. */
export async function getProjectList(actor: Actor): Promise<ProjectListView>;

/** D-P1-3: los campos de `input` que difieren de la fila. Pura; exportada para su test. */
export function changedProjectFields(
  row: ProjectSettings,
  input: UpdateProjectValues,
): Partial<Omit<ProjectSettings, "id">>;
```

**`updateProject`** hace esto, en este orden:

1. `translatingNameTaken(projectRepository.isProjectNameTaken,
projectMessages.projectNameTaken, () => db.transaction(…))` (PR-91): el
   nombre repetido sale del `update`, fuera de la transacción, como en el alta.
2. `lockProject(tx, actor.workspaceId, input.id)`. Después, `row =
findProject(tx, actor.workspaceId, actor.userId, input.id)`, en una segunda
   sentencia.
3. Si no se bloqueó nada, o `row` es `undefined`, o `!can(actor,
"project.view", projectResource(row))`, o `row.archivedAt !== null`: `throw
new ProjectError("not_found", projectMessages.projectUnavailable)`.
4. `assertCan(actor, "project.update", projectResource(row))`.
5. `changes = changedProjectFields(settingsOf(row), input)`: cada campo
   presente en `input` y distinto del de la fila. El cliente se compara con
   `sameId` (`lib/project-pair.ts`), sin distinguir mayúsculas, como la base; el
   resto, por igualdad. Si `changes` queda vacío, devuelve `{ project:
settingsOf(row) }` sin escribir.
6. Si `changes.clientId` es un id: `findClient(tx, actor.workspaceId, id)`. Si
   da `undefined` o un cliente archivado, `throw new ProjectError("not_found",
projectMessages.clientUnavailable)` (PR-83).
7. `updated = updateProject(tx, …, changes)`, `recordAudit` de §4.5, y devuelve
   `{ project: settingsOf(updated) }`.

`settingsOf(row)` arma `ProjectSettings` con `paletteKeyOf(row.color, row.id)`.

**`getProjectList`** abre una transacción `repeatable read` con `listClients`,
`listAllProjects`, `listActiveTasksOfAllProjects` y, con `tag.view`,
`listActiveTags`. Aplica el filtro `project.view` a cada proyecto y toma el
cliente de cada uno, con su archivado, de los clientes leídos en la misma foto,
como `clientOf` (`service.ts:442-455`), que ya lanza si falta. Las tareas van
agrupadas por proyecto y ordenadas con `sortedByName`, y los proyectos también.
`canUpdate` y `canCreateTask` se calculan con `can()` y con `row.archivedAt ===
null`; los `canCreate*` de la cabecera, como hoy. `readCatalog` queda solo
para `getTrackingCatalog`, y su parámetro `access` puede quedar fijo en
`project.track` (lo decide `backend-dev`).

**`createProject`**: las reglas no cambian. Su `attempt` y su `replayed`
devuelven `{ project: toProjectRef(row) }` (D-P1-12), y `toProjectView` se
borra.

**`getTrackingCatalog`** suma `clients`: los de `read.clients` sin archivar,
ordenados con `sortedByName`, si `can(actor, "project.create", …)`; si no,
`[]`.

### 4.4 Actions (`src/modules/project/actions.ts`)

```ts
export async function updateProject(
  input: UpdateProjectInput,
): Promise<ActionResult<UpdateProjectResult>>;
// handle(async (session) =>
//   service.updateProject(session.actor, updateProjectInput.parse(input)),
//   projectOptions)
```

Las opciones de D-P1-5:

```ts
const options = { paths: ["/proyectos"], messages } as const; // createClient, createTask, createTag: sin cambios
const projectOptions = { paths: [{ path: "/", type: "layout" }], messages } as const; // createProject, updateProject
```

Llevan los `messages` de hoy (`forbidden` y `unexpected` del módulo).

### 4.5 Auditoría

| Acción           | `entity`  | `entityId`      | `previousValue`                           | `nextValue`                           | Cuándo                     |
| ---------------- | --------- | --------------- | ----------------------------------------- | ------------------------------------- | -------------------------- |
| `project.update` | `project` | id del proyecto | los campos que cambiaron, con su anterior | los mismos campos, con su valor nuevo | solo si algún campo cambia |

Va con `...auditActorOf(actor)`. Las claves son las del esquema de Drizzle
(`name`, `clientId`, `color`, `note`, `billableByDefault`). Por ejemplo, un
renombre deja `{"name":"Viejo"}` → `{"name":"Nuevo"}`.

### 4.6 Las respuestas de `updateProject`

| Situación                                                                               | Código                 | Mensaje                                                                                                                | Reintentar |
| --------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| Cambió algún campo                                                                      | ok                     | —                                                                                                                      | —          |
| Nada difiere de lo guardado                                                             | ok, sin escribir       | —                                                                                                                      | —          |
| Nombre vacío, largo o con el carácter nulo; nota larga; color fuera de lista            | `validation`           | PR-75, PR-76, el del carácter nulo, «La nota no puede superar los 3000 caracteres.», el primer problema del `ZodError` | no         |
| Nombre repetido para el cliente que queda (también por cambiar el cliente)              | `validation`           | PR-77, «Ya hay un proyecto con ese nombre para ese cliente.»                                                           | no         |
| Proyecto inexistente, de otro workspace, privado ajeno o archivado; membresía no activa | `not_found`            | PR-72, «Ese proyecto ya no está disponible.»                                                                           | no         |
| Cliente nuevo inexistente, de otro workspace o archivado                                | `not_found`            | PR-83, «Ese cliente ya no está disponible.»                                                                            | no         |
| Sin `project.update`                                                                    | `forbidden`            | PR-84, «No tenés permiso para hacer esto.»                                                                             | no         |
| Red o servidor                                                                          | `unexpected`           | «No se pudo guardar. Revisá la conexión y volvé a intentar.»                                                           | sí         |
| Sin sesión                                                                              | redirección a `/login` | —                                                                                                                      | —          |

## 5. Contrato de frontend

### 5.1 La página (`src/app/(app)/proyectos/page.tsx`)

`requireSession()`; `projectsSearchParams.safeParse(await searchParams)`, con
cada campo inválido a su valor por omisión (D-P1-6); `getProjectList` y
`ProjectsScreen` con la lista, `filter`, `search` y `{ createClient,
createProject, createTask, createTag, updateProject }`. La página solo compone.

### 5.2 La pantalla (`project/components/projects-screen.tsx`)

- **La cabecera de hoy** (el título y las tres altas) no cambia.
- **`ProjectNoticeRegion`** sigue entre la cabecera y la lista, y la región
  `status` del anuncio de edición (D-P1-8) va al lado.
- **`ProjectList`** (cliente, nuevo, `project-list.tsx`) va debajo. A la
  izquierda tiene el buscador: un `<Input type="search">` con la etiqueta
  accesible «Buscar proyecto o cliente» y el ícono de búsqueda. A la derecha,
  el filtro «Estado», con la forma de `StatusFilter` de `/equipo` (un `Select`
  con «Activos», «Archivados» y «Todos»). Después, la tabla.
- **La tabla** es un `<table>` con `<caption className="sr-only">`
  «Proyectos» y las columnas de D-P1-6, en ese orden. En «Nombre», el punto
  (con el nombre del color, como hoy, `colorDotLabel`) y el nombre, y con
  «Todos», «Archivado». En «Tareas», la lista de D-P1-7. En la última columna,
  «Editar» (`EditProjectDialog`) y «Nueva tarea» (`NewTaskDialog`, sin
  cambios), según `canUpdate` y `canCreateTask`. En pantallas angostas, la
  tabla se desplaza en horizontal dentro de su contenedor.
- **El estado**: `search` vive en estado local, inicializado con el de la
  página. Al escribir, filtra y llama a `window.history.replaceState` con
  `projectsHref`. Al elegir un estado, llama a `router.push(projectsHref({
filter, search }))` en una transición con el valor optimista, como
  `StatusFilter`.
- **La sección de etiquetas** sigue debajo, sin cambios (hasta P5).

### 5.3 El modelo de la lista (`project/components/project-list-model.ts`, nuevo)

Es puro y tiene su test:

```ts
export type ProjectListEmpty = "none" | "noActive" | "noArchived" | "noMatches";

/** D-P1-6: las filas que deja el filtro y la búsqueda, y el vacío que corresponde. */
export function projectListRows(
  projects: readonly ProjectListItem[],
  filter: ProjectFilter,
  search: string,
): { readonly rows: readonly ProjectListItem[]; readonly empty: ProjectListEmpty | null };

/** PR-95: «Activos» con la búsqueda vacía es `/proyectos`; si no, los parámetros que difieren. */
export function projectsHref(state: {
  readonly filter: ProjectFilter;
  readonly search: string;
}): string;
```

- **La búsqueda** recorta lo escrito, lo normaliza con `normalizeSearch` y busca
  por subcadena en el nombre del proyecto y en el del cliente.
- **El vacío se decide en este orden**: sin ningún proyecto, `none` (PR-85); con
  búsqueda y sin filas, `noMatches`; sin búsqueda y sin filas, `noActive` o
  `noArchived` según el filtro. Con «Todos» y algún proyecto, nunca hay vacío.
- **`projectsHref`** codifica `buscar` con `URLSearchParams` y omite `estado`
  con «Activos».

### 5.4 TT-09 en el selector

**`picker-model.ts`**:

```ts
/** D-P1-10: la opción de TT-09. No es una selección. */
export type PickerCreateOption = {
  readonly kind: "create";
  readonly key: "create";
  /** La búsqueda recortada: el nombre con que arranca el diálogo. */
  readonly name: string;
};

// PickerOption suma `readonly kind: "selection"`.
export type PickerItem = PickerOption | PickerCreateOption;

// PickerView suma:
  /** D-P1-10: la última opción, con `canCreateProject`; si no, `null`. */
  readonly create: PickerCreateOption | null;

// PickerEmpty: `noProjects` pierde `canCreateProject`.
  | { readonly kind: "noProjects" }
```

`emptyOf` no cuenta la opción de crear: «Ningún proyecto coincide con la
búsqueda.» y «Todas las combinaciones ya tienen fila esta semana.» siguen
apareciendo igual, con la opción debajo.

**`project-picker.tsx`**:

- **Los `items`** de la primitiva suman, al final, un grupo `create` con la
  opción. Se dibuja sin rótulo de grupo, con el ícono de más y separado de los
  proyectos. `isItemEqualToValue` y `itemToStringLabel` miran `kind`.
- **`choose`**: con la opción de crear, cierra el popup y abre el diálogo con
  `option.name`, sin llamar a `onChange`.
- **`EmptyMessage`** pierde el enlace de TT-87 y queda solo «No hay proyectos
  todavía».
- **El diálogo** (`new-project-from-picker.tsx`, nuevo) sigue D-P1-10: usa
  `ProjectFields` en su forma de alta, los `clients` del catálogo, `useAction`
  sobre la action del proveedor y `useNewId`. En `onSuccess`, guarda la
  selección pendiente del selector y cierra.
- **La selección pendiente** (D-P1-11) es estado del selector. Un efecto la
  entrega con `onChange` cuando `catalogEntryOf(catalog, { projectId, taskId:
null })` deja de ser `null`, y la limpia. También se limpia al abrir el
  selector, al cambiar `value` y al desmontar.
- **En solo lectura** (TT-92), el selector sigue sin disparador y sin opción de
  crear.

**`tracking-catalog.tsx`**: `TrackingCatalogProvider({ catalog, createProject,
children })`. `useCreateProjectAction()` lanza fuera del proveedor, como
`useTrackingCatalog`.

**El marco de los diálogos** (`create-dialog.tsx`) se parte en dos, sin cambiar
lo que se ve en `/proyectos`:

- `CreateDialogFrame` es el contenido de hoy (el formulario, el aviso con
  «Reintentar», «Cancelar», «Guardar» y la X), controlado por `open` y
  `onOpenChange`, con la regla de no cerrar mientras viaja
  (`create-dialog.tsx:76-87`) y un `finalFocus` que recibe por prop.
- `CreateDialog` es el marco más el disparador y `useSurvivingNotice`, como
  hoy. Lo usan las altas de `/proyectos` y la edición (D-P1-8).

El diálogo de TT-09 usa solo el marco, sin `useSurvivingNotice` (D-P1-10), con
`finalFocus` al disparador del selector.

### 5.5 Los campos y la edición

- **`project-fields.tsx`, nuevo**: `ProjectFields({ draft, onChange, clients,
mode, archivedClient })`, con `mode: "create" | "update"`. Tiene los campos de
  D-P1-9 con sus etiquetas de hoy. `ColorField` recibe la ayuda por prop (solo
  en `create`). El selector de cliente arma sus opciones con «Sin cliente»
  primero, después los `clients` y, en `update` y con `archivedClient`, ese
  cliente con `archivedClientLabel(name)`.
- **`edit-project-dialog.tsx`, nuevo**: D-P1-8. Usa `useAction(updateProject,
…)` y un aviso con la clave `edit:<id>`. Al enviar arma el parche con los
  campos que difieren de la fila, y si no hay ninguno, cierra sin llamar a la
  action.

### 5.6 Textos (`project/components/labels.ts`)

| Clave                               | Texto                                                              | Fuente        |
| ----------------------------------- | ------------------------------------------------------------------ | ------------- |
| `projectLabels.searchProjects`      | «Buscar proyecto o cliente»                                        | PR-31         |
| `projectLabels.statusFilter`        | «Estado»                                                           | PR-31         |
| `projectFilterNames`                | `{ activos: "Activos", archivados: "Archivados", todos: "Todos" }` | PR-31         |
| `projectLabels.columns`             | «Nombre», «Cliente», «Acceso», «Tareas», «Acciones»                | PR-31         |
| `projectLabels.public`, `.private`  | «Público», «Privado»                                               | PR-16, PR-17  |
| `projectLabels.archived`            | «Archivado»                                                        | PR-31         |
| `projectLabels.noActive`            | «No hay proyectos activos»                                         | PR-89         |
| `projectLabels.noActiveHint`        | «Elegí «Archivados» o «Todos» en el estado para verlos.»           | PR-89         |
| `projectLabels.noArchived`          | «No hay proyectos archivados»                                      | D-P1-6        |
| `projectLabels.pickerNoMatches`     | sin cambios; la lista lo reusa                                     | TT-07, D-P1-6 |
| `projectLabels.edit`                | «Editar»                                                           | D-P1-7        |
| `editProjectLabel(name)`            | «Editar «{nombre}»»                                                | D-P1-7        |
| `projectLabels.editProject`         | «Editar proyecto»                                                  | D-P1-8        |
| `projectSavedLabel(name)`           | «Proyecto «{nombre}» guardado»                                     | D-P1-8        |
| `projectLabels.projectNotSaved`     | «No se pudieron guardar los cambios.»                              | TT-90         |
| `projectLabels.pickerCreateProject` | «Crear proyecto»                                                   | TT-09         |
| `archivedClientLabel(name)`         | «{nombre} (archivado)»                                             | D-P1-9        |

`pickerGoToProjects` («Ir a Proyectos») **se queda**: lo usa el selector de
etiquetas (TT-88, `tag-picker.tsx:251`). `tasksLabel` y `newTaskLabel` siguen,
en la fila. Lo que usan otros módulos (`noClient`, `noProject`, `pickerEmpty`,
`projectTaskLabel` y los de etiquetas) no cambia.

## 6. Despliegue y producción

El contrato da por hecho que Vercel despliega `main` a producción en cada push y
que el build no corre migraciones. Producción tiene un solo workspace,
«RunOne», y las consultas miran el más viejo, que es el de la sesión.

### 6.1 Antes del push

**No hay condición de base**, porque no hay migración. Sí hay una consulta
**informativa**, que se corre con `!`, para saber qué va a mostrar el filtro y
si el diálogo va a encontrar un cliente archivado:

```sql
with w as (select id from workspace order by created_at, id limit 1)
select
  (select count(*) from project where workspace_id = (select id from w)) as proyectos,
  (select count(*) from project where workspace_id = (select id from w) and archived_at is not null) as archivados,
  (select count(*) from client where workspace_id = (select id from w) and archived_at is not null) as clientes_archivados,
  (select count(*) from project p join client c on c.workspace_id = p.workspace_id and c.id = p.client_id
     where p.workspace_id = (select id from w) and p.archived_at is null and c.archived_at is not null) as activos_con_cliente_archivado;
```

Ningún resultado frena el push; se anotan en el registro.

### 6.2 El push y el humo

Un push con el código. El humo lo hace el usuario con su sesión de owner:

1. En `/proyectos`, la tabla en «Activos», en orden alfabético, con las tareas
   en su columna. Buscar un cliente; probar «Todos» y «Archivados» (si la
   consulta dio archivados); recargar conserva el filtro y la búsqueda; volver
   atrás deshace el filtro.
2. **Editar la nota de un proyecto y volver a dejarla como estaba**: quedan dos
   constancias `project.update`, sin efecto final.
3. **TT-09 no se prueba en producción**: un proyecto creado no se puede borrar
   hasta P2. Lo cubre la e2e y, si hace falta, un preview.

### 6.3 Reversión

Volver a desplegar el `main` anterior. No hay datos que revertir: lo editado es
un valor válido de columnas que ya existían, y la constancia queda.

### 6.4 Previews y bases

Los previews usan la rama `preview` de Neon, con datos sintéticos. Si el
preview de la rama no deja entrar por `BETTER_AUTH_URL`, TT-09 se verifica en
local: la e2e alcanza.

## 7. Reparto de archivos y orden

### backend-dev

- **Primero, el commit que fija tipos y firmas**, con aviso a `frontend-dev` y a
  `e2e-tester`: todo §4.1, `project.update` en `can()` (§3), las firmas de §4.2
  a §4.4 con cuerpos que compilan, el `CreateProjectResult` nuevo,
  `TrackingCatalog.clients` y los fixtures de los tests de `time-entry` con
  `clients: []`. Tiene que compilar con `npm run typecheck`.
- `src/server/permissions/index.ts` y `permissions.test.ts` (§3, §9.1).
- `src/modules/project/schema.ts` y `schema.test.ts`.
- `src/modules/project/repository.ts`, `service.ts` y
  `service.integration.test.ts`; `changedProjectFields` y su test de unidad.
- `src/modules/project/actions.ts` y `actions.integration.test.ts`. **Este
  archivo también lo reescribe E3** (§10).
- **El registro del slice**: `docs/slices/correcciones-fase2-p1-revisiones.md`.

### frontend-dev

- `src/app/(app)/proyectos/page.tsx` (§5.1).
- `src/modules/project/components/`: `projects-screen.tsx` y su test;
  `project-list.tsx`, `project-list-model.ts`, `edit-project-dialog.tsx` y
  `project-fields.tsx`, nuevos, con sus tests; `new-project-dialog.tsx`,
  `create-dialog.tsx`, `color-field.tsx` y `labels.ts` (§5.2, §5.3, §5.5,
  §5.6).
- `picker-model.ts`, `project-picker.tsx`, `new-project-from-picker.tsx`
  (nuevo), `tracking-catalog.tsx` y sus tests (§5.4).
- `src/modules/time-entry/components/tracker-screen.tsx`,
  `calendar/calendar-screen.tsx`, `timesheet/timesheet-screen.tsx` y los tests
  que montan el proveedor (D-P1-13). Solo esas líneas: el resto de `time-entry`
  no se toca.

### e2e-tester

- `e2e/projects-page.ts`: la tabla, sus filas y columnas, el buscador, el
  filtro y el diálogo de edición.
- `e2e/projects.spec.ts`: los localizadores y los cuatro casos de §1
  («Consecuencias»), sin cambiar lo que afirman de las altas ni de «Nueva
  tarea».
- `e2e/project-picker.spec.ts`: `:95` y `:391` (§9.3).
- `e2e/database.ts`: lo que haga falta para sembrar un cliente archivado y para
  leer las constancias `project.update` de un proyecto. Los ayudantes nuevos
  van al final (§10).
- `e2e/network.ts`: si no existe, un ayudante que cuente los pedidos a una ruta
  mientras corre un bloque.
- Los specs de §9.3, nuevos (`e2e/project-edit.spec.ts`,
  `e2e/project-list.spec.ts` y `e2e/project-from-picker.spec.ts`). Tiene que
  confirmar que fallan antes de la implementación.
- La suite entera, con los specs de hoy sin cambiar lo que afirman.

### parity-analyst

Correcciones fechadas, con la forma «_Corregido el <fecha>, P1_»:

- `time-tracker.md`: **TT-09** pasa a `adaptar`, con D-P1-10 y D-P1-11.
  **TT-87**: el vacío del selector ofrece «Crear proyecto» en lugar de «Ir a
  Proyectos», con `project.create`. **TT-13**: sigue fuera, pero su
  justificación remitía a TT-09. Las tres menciones de TT-09 como fuera de
  alcance en las secciones de los slices (`:1322`, `:1899`, `:2175`) y la lista
  de lo no construido de la fase 1 (`:2183-2199`) suman una nota: TT-09 entró
  con P1.
- `timesheet.md`: **TS-88**, el mismo cambio de TT-87.
- `proyectos.md`:
  - **PR-04**: su justificación remitía a TT-09; el atajo de cliente sigue
    para P3.
  - **PR-12**, **PR-21** y **PR-30**: la edición en el diálogo de la fila; un
    archivado no se edita.
  - **PR-31**: lo construido. Las columnas, sin tiempo imputado (decisión del
    usuario del 2026-10-21); las tareas por nombre en lugar de la cantidad
    (D-P1-7); el filtro; el orden plano.
  - **PR-55** y **PR-56**: `project.update`.
  - **PR-85**: el vacío del selector.
  - **PR-89**: los textos.
  - **PR-95**: `estado` con historial y `buscar` sin pedido.
  - **§14.1**: los identificadores de la fase 2 que entrega P1.
- `fase2-mapa.md`:
  - En «P1»: el riesgo «Dónde vive la administración de un proyecto» queda
    decidido (todo en `/proyectos`, con un diálogo desde la fila; decisión del
    usuario del 2026-10-21). P2 … P7 van en serie.
  - En la tabla de §3: **P8 depende de P1**, porque TT-09 reescribe
    `picker-model.ts` y `project-picker.tsx`, que P8 también toca.
  - El nombre de P1 en el título de su sección suma «y TT-09», como en la
    tabla.
- `mejoras-pedidas.md`: la mejora 2 queda hecha con P1.

### Lo que no toca nadie

`src/server/db/`, `drizzle/`, `src/server/session.ts`, `access.ts`, `entry.ts`,
`src/server/time/`, `src/components/layout/`, `team`, `workspace`, `profile`,
`report`, `mcp`, `.github/` y `CLAUDE.md`.

### Orden

0. `npm ci` en el worktree (§0) y la revisión de esta versión del contrato.
1. `backend-dev`: los tipos y las firmas, en un commit que compila. Avisa.
2. En paralelo: `backend-dev` con permisos, service y actions; `frontend-dev`
   con la tabla, la edición y el selector; `e2e-tester` con el arnés y los
   specs; `parity-analyst` con las correcciones.
3. Las revisiones, las correcciones y la e2e entera, en una base nueva **y** en
   una que se reusa.

## 8. Criterios de aceptación

1. **Editar** (PR-12, PR-15, PR-21, PR-30): un admin manda `{ id, name, color,
note, billableByDefault, clientId }` con valores nuevos. La fila queda con
   ellos, `updated_at` avanza y hay una constancia `project.update` con los
   cinco campos que cambiaron en `previous_value` y `next_value`. Con el owner
   y con el responsable pasa lo mismo.
2. **Un parche** (D-P1-3): mandar solo `{ id, note }` cambia la nota y deja el
   resto igual. La constancia nombra solo `note`.
3. **Nada difiere** (D-P1-3): mandar los valores que ya tiene responde éxito con
   `ProjectSettings` iguales, sin tocar `updated_at` y sin constancia.
4. **Quién** (PR-55 … PR-57, PR-60): owner, admin y el responsable pueden.
   `project_manager`, `team_manager` y `member` que no son responsables reciben
   `forbidden` sin escribir; un `project_manager` responsable de **otro**
   proyecto, también. Un admin y un responsable inactivos reciben `not_found`
   (PR-72) sin escribir. **El owner inactivo se prueba con un `Actor` sintético
   en el service** (`{ ...owner, status: "inactive" }`), sin sembrar un segundo
   owner (§10).
5. **El proyecto** (PR-72): uno inexistente, uno de otro workspace y uno
   archivado responden `not_found` con «Ese proyecto ya no está disponible.»,
   sin escribir.
6. **El cliente** (PR-83, PR-98): pasar a un cliente archivado o de otro
   workspace responde `not_found` con «Ese cliente ya no está disponible.». Un
   proyecto con cliente archivado se puede renombrar sin cambiar el cliente.
   Pasar a «Sin cliente» (`null`) funciona.
7. **El nombre** (PR-75 … PR-77, PR-91): vacío, de 101 caracteres o con el
   carácter nulo, responde `validation` con su texto. Repetido para el mismo
   cliente, PR-77. **Cambiar el cliente** a uno que ya tiene un proyecto con
   ese nombre, PR-77. El mismo nombre con otro cliente, éxito.
8. **El color y la nota**: un color fuera de la paleta, o `null`, responde
   `validation`. Una nota de 3001 caracteres responde «La nota no puede superar
   los 3000 caracteres.».
9. **Dos a la vez** (D-P1-3): con la fila del proyecto tomada por
   `projectRepository.lockProject` en la transacción de la barrera:
   - dos ediciones de campos distintos esperan, terminan las dos, y quedan los
     dos cambios;
   - dos del mismo campo dejan el valor de la segunda, y **la constancia de la
     segunda tiene como anterior el valor de la primera**;
   - **lo que no espera**: un alta de horas con ese proyecto y un alta de
     tarea en él terminan sin esperar.
10. **El facturable no toca entradas** (TT-14): con dos entradas del proyecto,
    cambiar el facturable por defecto no cambia el `billable` de ninguna, y una
    entrada nueva con ese proyecto arranca con el valor nuevo.
11. **Revalidación** (D-P1-5): `updateProject` y `createProject` llaman a
    `revalidatePath("/", "layout")`, con éxito y con error. `createClient`,
    `createTask` y `createTag` siguen llamando a `revalidatePath("/proyectos")`.
12. **La lista** (PR-31, PR-61, PR-93): `getProjectList` trae los activos y los
    archivados que `project.view` deja ver, en el orden de `compareNames`, con
    su cliente (y el archivado del cliente), sus tareas activas (también las de
    un proyecto archivado), `canUpdate` y `canCreateTask`. Un archivado los
    trae en falso. Un privado ajeno no está para un member y sí está para owner
    y admin. Una membresía no activa no ve ninguno.
13. **Las columnas** (PR-31, D-P1-7): «Nombre» con el punto, «Cliente» con «Sin
    cliente», «Acceso», «Tareas» con los nombres y la columna de acciones con
    «Editar «X»» y «Nueva tarea» según los permisos. No hay columna de tiempo.
14. **El filtro y la búsqueda** (PR-31, PR-89, PR-95): «Activos» es el filtro
    por omisión. «Archivados» y «Todos» muestran los archivados con
    «Archivado» en la fila. La búsqueda encuentra por proyecto y por cliente,
    sin acentos ni mayúsculas. Recargar conserva los dos; volver atrás deshace
    el último filtro; escribir no hace pedidos al servidor. Un `estado`
    inválido muestra «Activos» **y conserva la búsqueda**.
15. **Los vacíos** (PR-85, PR-89): sin proyectos, «Todavía no hay proyectos».
    Con «Activos» y todo archivado, «No hay proyectos activos» con la
    sugerencia. Con «Archivados» y ninguno, «No hay proyectos archivados».
    Búsqueda sin coincidencias, «Ningún proyecto coincide con la búsqueda.».
16. **El diálogo de edición** (D-P1-8, D-P1-9):
    - arranca con los valores de la fila;
    - «Guardar» manda solo lo cambiado y, sin cambios, cierra sin mandar;
    - con éxito, cierra, la fila muestra lo nuevo, se anuncia «Proyecto
      «{nombre}» guardado» y el foco vuelve a «Editar»;
    - con falla de red, conserva lo escrito y ofrece «Reintentar», que guarda;
    - con PR-77, no ofrece «Reintentar»;
    - el cliente archivado del proyecto aparece con «(archivado)»;
    - un archivado no ofrece «Editar» ni «Nueva tarea».
17. **El aviso que sobrevive** (D-P1-8): si el proyecto se archiva, o si la
    persona deja de ser responsable, con el diálogo abierto, «Guardar» muestra
    el aviso de PR-72 o de PR-84. Si la revalidación se lleva el diálogo, el
    aviso queda en la región de la pantalla, con el foco.
18. **TT-09** (D-P1-10, D-P1-11): con `project.create`, el selector de la
    barra, de una fila, de la planilla, del diálogo del calendario y de la
    edición masiva termina con «Crear proyecto», alcanzable con las flechas.
    - Elegirla abre «Nuevo proyecto» con el nombre de la búsqueda.
    - Guardar crea el proyecto y lo deja elegido.
    - **Un proyecto con el facturable por defecto marcado deja la barra
      facturable** (TT-14).
    - En una fila, la entrada queda con el proyecto y su facturable.
    - Cancelar devuelve el foco al disparador y no elige nada.
    - `Escape` en el diálogo anidado deja abierto el del calendario con su
      borrador.
    - «Reintentar» después de una respuesta perdida deja un solo proyecto.
    - Sin la membresía activa, no hay opción.
19. **El vacío del selector** (TT-87, TS-88): con el catálogo vacío se ve «No
    hay proyectos todavía», con «Sin proyecto» y «Crear proyecto», y sin «Ir a
    Proyectos». El selector de etiquetas vacío sigue con «Ir a Proyectos».
20. **Los e2e que cuentan opciones del selector** (`project-picker.spec.ts:95`,
    `:391`) siguen afirmando las mismas dos opciones de selección.
21. **Lo que ya estaba** (PR-101 … PR-103): renombrar un proyecto con entradas,
    cambiarle el color y el cliente se ve en sus filas del rastreador y en el
    reporte, pasadas incluidas.
22. **El MCP**: `list_projects` devuelve lo mismo que antes para el mismo
    catálogo, sin `clients`.
23. **Las correcciones de paridad y del mapa** de §7 están hechas, con su fecha.

## 9. Plan de tests

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores. Estas son, como mínimo, las mutaciones del
slice, con el test que mata a cada una:

| Mutación                                                                                     | La mata                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `allowsOnProject` sin el caso `project.update` (cae en `default: false`)                     | §9.1, `permissions.test.ts`; criterio 4                                                                                         |
| `project.update` con `project.viewer !== null` en lugar de `isManager === true`              | §9.1, el miembro no responsable; criterio 4                                                                                     |
| `project.update` en `allowedRoles` solo con `["owner", "admin"]`                             | §9.1, el responsable `member`; criterio 4                                                                                       |
| El service sin la comprobación de archivado                                                  | §9.2, criterio 5                                                                                                                |
| El cliente validado solo si no es `null`, sin mirar el archivado                             | §9.2, criterio 6                                                                                                                |
| El cliente validado aunque no cambie                                                         | §9.2, criterio 6 (renombrar con cliente archivado)                                                                              |
| Escribir y dejar constancia aunque nada cambie                                               | §9.2, criterio 3                                                                                                                |
| El parche como reemplazo (los campos ausentes a su valor por omisión)                        | §9.2, criterio 2                                                                                                                |
| `updateProject` sin `lockProject`                                                            | §9.2, criterio 9: la constancia de la segunda edición del mismo campo trae como anterior el valor original, no el de la primera |
| `lockProject` con `for update` en lugar de `for no key update`                               | §9.2, criterio 9, «lo que no espera»: la barrera bloquea con `lockProject`, y el alta de horas y la de tarea quedan `blocked`   |
| `lockProject` con el `join` a `project_member` en la sentencia que bloquea, sin la relectura | revisión de backend (D-P1-3); en P1 nadie cambia `project_member` mientras se espera                                            |
| `updateProject` sin `translatingNameTaken`                                                   | §9.2, criterio 7 (sale `unexpected`)                                                                                            |
| `changedProjectFields` compara el cliente con `===`                                          | §9.1, su test con el id en mayúsculas                                                                                           |
| `projectsSearchParams` sin `.catch` por campo                                                | §9.1, `schema.test.ts`: `estado` inválido con `buscar` válido                                                                   |
| `getProjectList` solo con activos, o sin las tareas de los archivados                        | §9.2, criterio 12                                                                                                               |
| `canUpdate` sin mirar el archivado                                                           | §9.2, criterio 12                                                                                                               |
| `projectListRows` sin buscar en el cliente, o sin `normalizeSearch`                          | §9.1, `project-list-model.test.ts`                                                                                              |
| `projectListRows` con `noActive` antes de `noMatches`                                        | §9.1, el orden de los vacíos                                                                                                    |
| La búsqueda con `router.replace` (pide al servidor)                                          | §9.3.2: ningún pedido a `/proyectos` al escribir                                                                                |
| El diálogo manda la fila entera en lugar del parche                                          | §9.3.1: la constancia de una edición de la nota nombra solo `note`                                                              |
| `pickerView` ofrece la opción de crear sin `canCreateProject`                                | §9.1, `picker-model.test.ts`                                                                                                    |
| La opción de crear compara igual a «Sin proyecto» (sin `kind` en `isItemEqualToValue`)       | §9.1, `project-picker.test.tsx`: con «Sin proyecto» elegido, la opción de crear no está marcada                                 |
| El selector llama a `onChange` en `onSuccess`, sin esperar al catálogo                       | §9.3.3, la barra facturable con un proyecto facturable                                                                          |
| `createProject` sigue revalidando solo `"/proyectos"`                                        | §9.2, criterio 11; §9.3.3, la fila con el proyecto nuevo                                                                        |

### 9.1 Unidad

- `permissions.test.ts`: `project.update` con cada rol, con y sin la marca de
  responsable, con `viewer` nulo, con la membresía inactiva y con otro
  workspace; también con un recurso de otra clase.
- `project/schema.test.ts`:
  - `updateProjectInput` con cada campo ausente y presente, el color `null`
    rechazado, el nombre recortado con sus tres mensajes, y `clientId: null`;
  - `projectsSearchParams` con un `estado` inválido, uno repetido (arreglo) y un
    `buscar` de 101 caracteres, cada uno solo, y **un `estado` inválido con un
    `buscar` válido**, que conserva la búsqueda.
- `changedProjectFields` (en un `service.test.ts` o junto al modelo, lo decide
  `backend-dev`): cada campo igual y distinto, y el cliente en mayúsculas igual
  al guardado.
- `project-list-model.test.ts`: §5.3, cada vacío y su orden, la búsqueda por
  cliente y sin acentos, y `projectsHref` con cada combinación.
- `projects-screen.test.tsx` (reescrito, con `renderToStaticMarkup`): la tabla
  con sus encabezados y sin columna de tiempo, las tareas por nombre,
  «Archivado» con «Todos», «Editar» y «Nueva tarea» según los permisos y nunca
  en un archivado, cada vacío, las altas según permiso y las etiquetas.
- `project-fields.test.tsx`: `create` con la ayuda del color, `update` sin ella,
  y el cliente archivado con «(archivado)».
- `picker-model.test.ts`: la opción de crear al final con y sin búsqueda, con
  `canCreateProject` falso, con todo excluido y con el catálogo vacío; el vacío
  `noProjects` sin el permiso.
- `project-picker.test.tsx`: la opción en el marcado con permiso y no sin él; no
  marcada con «Sin proyecto» elegido; el vacío sin «Ir a Proyectos»; el modo de
  solo lectura sin opción.
- `tag-picker.test.tsx`: sigue con «Ir a Proyectos» (TT-88).

### 9.2 Integración (Postgres)

- **`project/service.integration.test.ts`**, con un `describe` nuevo para
  `updateProject`: los criterios 1 a 10, con `seedWorkspace`, `seedMember`,
  `seedClient`, `seedProject`, `seedTask`, `seedTimeEntry` y la lectura de
  `audit_log`. El owner inactivo del criterio 4 va con un `Actor` sintético.
  - **Criterio 9**: la barrera abre una transacción y llama a
    `projectRepository.lockProject(tx, workspaceId, projectId)`; así, una
    mutación de `lockProject` cambia también lo que sostiene la barrera.
    - Con `queueBehindBarrier`, los corredores editan `note` y `color`: quedan
      los dos. En otro caso, los dos editan `name`: queda el segundo, y su
      constancia tiene como anterior el nombre del primero. Eso mata «sin
      `lockProject`»: el `update` igual espera a la barrera, pero la lectura
      previa ya había tomado el nombre original.
    - **Lo que no espera**, con `outcomeWhileHeld`: un alta de horas con el
      proyecto (por el service de `time-entry`) y `createTask` devuelven
      `resolved`. Con `for update` en `lockProject`, quedan `blocked`.
  - Los casos de `getProjectCatalog` (el criterio 9 del slice 9: PR-61, PR-62,
    PR-93 y el vacío) pasan a `getProjectList`, junto con los archivados, las
    tareas de un archivado, `canUpdate` y `canCreateTask` (criterio 12).
  - `getTrackingCatalog`: `clients` con `project.create` y vacío sin él. Los
    `toEqual` de hoy (`:1044`, `:1055`) suman el campo.
  - `createProject`: el resultado nuevo, en el alta y en el reintento.
- **`project/actions.integration.test.ts`**: `updateProject` con cada fila de
  §4.6 (código y texto); sin sesión, a `/login` sin escribir; la revalidación
  del criterio 11 para las cinco actions; el reintento de una respuesta perdida
  (la action dos veces con lo mismo) deja **una** constancia. **Ningún caso
  nuevo siembra un owner**: la membresía inactiva se prueba con un admin
  (`signInAs("admin", "inactive")`), y el owner inactivo queda en el service
  (§10).

### 9.3 E2E (`chromium`)

El workspace es compartido y la base persiste: todo nombre lleva el sufijo del
recorrido (`uniqueSuffix`), y el buscador de la lista se usa para aislar las
filas del recorrido.

0. **`project-picker.spec.ts:95` y `:391`** cuentan solo las opciones de
   selección: `popup.getByRole("option")` sin la de nombre «Crear proyecto»
   (por ejemplo, con `.filter({ hasNotText: "Crear proyecto" })`), y siguen
   esperando 2. Un caso suma que la última opción es «Crear proyecto».
1. **La edición** (`project-edit.spec.ts`):
   - un owner abre «Editar «X»» desde la fila, cambia nombre, cliente, color,
     nota y facturable, y guarda. Se anuncia «Proyecto «…» guardado», la fila
     muestra lo nuevo, y en `/` la fila de una entrada sembrada tiene el nombre
     y el punto nuevos (PR-101 … PR-103, criterio 21); el reporte agrupa por el
     cliente nuevo;
   - editar solo la nota deja una constancia con solo `note`;
   - un member responsable edita el suyo; un member que no lo es no ve
     «Editar»; un admin edita uno ajeno;
   - PR-77 muestra el aviso sin «Reintentar». Con `dropActionRequests`, el
     aviso de red trae «Reintentar» y lo escrito se conserva. Con
     `loseActionResponses`, «Reintentar» responde éxito y queda una sola
     constancia;
   - el aviso que sobrevive (criterio 17): `archiveProject` con el diálogo
     abierto y «Guardar» deja PR-72 en la región, con el foco;
     `revokeProjectManager` deja PR-84;
   - un archivado sembrado, con «Todos», no tiene «Editar» ni «Nueva tarea».
2. **La lista** (`project-list.spec.ts`):
   - la tabla con sus columnas para tres proyectos del recorrido, y su orden;
     buscar por el nombre de un cliente; «Archivados» y «Todos» con un
     archivado sembrado; recargar conserva el filtro y la búsqueda;
     `page.goBack()` deshace el filtro; `?estado=x&buscar=<sufijo>` muestra
     «Activos» con la búsqueda;
   - **escribir no pide al servidor**: con la página cargada, escribir en el
     buscador no dispara ningún pedido a `/proyectos`, y la URL tiene `buscar`;
   - el caso de `projects.spec.ts:243` (el orden) pasa a la tabla.
3. **TT-09** (`project-from-picker.spec.ts`):
   - en la barra: buscar un nombre nuevo, flecha hasta «Crear proyecto», Enter.
     El diálogo trae el nombre; se marca «Facturable por defecto» y se guarda.
     El disparador muestra el proyecto y el facturable de la barra está
     marcado; «Agregar» deja la entrada con el proyecto y facturable. Esto mata
     la mutación de `onChange` inmediato;
   - en una fila: crear desde su selector deja la entrada con el proyecto;
   - en la planilla: una fila nueva toma el proyecto creado, y su celda se puede
     escribir;
   - en el diálogo del calendario: crear desde su selector, y `Escape` en el
     anidado deja el del calendario abierto con su borrador; después, crear y
     guardar la entrada;
   - en la edición masiva: crear desde su selector y aplicar;
   - cancelar devuelve el foco al disparador; «Reintentar» tras una respuesta
     perdida deja un solo proyecto con ese nombre;
   - una persona inactiva (`setMembershipStatus`) no ve la opción.

### 9.4 Lo que no se prueba

- **El vacío del selector en e2e** (criterio 19): la base de los e2e siempre
  tiene proyectos. Lo cubren `picker-model.test.ts` y
  `project-picker.test.tsx`, como hoy TT-87.
- **La relectura de `project_member` bajo el bloqueo** (D-P1-3): en P1 nadie
  escribe esa tabla desde la aplicación. La controla la revisión de backend, y
  P6 la prueba cuando la escriba.
- **El humo de producción**: lo hace el usuario (§6).

## 10. Riesgos

- **El choque con E3**, que corre en paralelo. P1 no toca `team` ni `workspace`,
  pero comparte tres archivos:
  - **`src/modules/project/actions.integration.test.ts`**, que E3 reescribe:
    la `0021` de E3 crea `membership_workspace_owner_unq` (un owner por
    workspace, en cualquier estado), y el patrón `signInAs("owner",
"inactive")` de `:284-285` siembra un segundo owner. **P1 no suma ningún
    caso que siembre un owner** (criterio 4, §9.2). El caso existente lo
    resuelve E3; si P1 mergea antes, E3 rebasa sobre los casos nuevos, que ya
    no usan el patrón;
  - `e2e/database.ts`: los ayudantes nuevos van al final;
  - si E3 suma una acción, `src/server/permissions/index.ts` y su test: líneas
    vecinas en las tres tablas. El segundo en mergear rebasa.

  No hay migración en P1: la `0021` es de E3.

- **El selector en seis lugares**: la opción de crear y el diálogo anidado
  dentro de dos diálogos (calendario y edición masiva) son lo nuevo con más
  riesgo de foco y de `Escape`. Lo cubren los e2e de §9.3.3, uno por lugar.
- **La selección pendiente depende de que el catálogo llegue** con la
  revalidación de la misma respuesta (D-P1-11). Si no llegara, el proyecto
  queda creado y sin elegir, sin error, y la persona lo elige a mano. El e2e de
  la barra lo detecta.
- **`TrackingCatalog` cambia de forma**: siete tests de `time-entry` suman
  `clients: []`. No cambian lo que afirman; si alguno lo hiciera, sería señal
  de que el campo se filtró a otro lado.
- **Un diálogo por fila**: «Editar» y «Nueva tarea» montan su diálogo en cada
  fila. El contenido se monta solo al abrir, como «Nueva tarea» hoy.
- **La fila que se va con el diálogo abierto**: un renombre que deja de
  coincidir con la búsqueda, o un archivado con «Activos». El primer caso lo
  cubre el foco al buscador (D-P1-8); el segundo, el aviso que sobrevive.
- **La lista en la base de los e2e** acumula cientos de proyectos de corridas
  anteriores (deuda del slice 9 hasta P2): los specs se aíslan con el buscador,
  y la tabla los dibuja todos.
- **Los e2e de `/proyectos` cambian de localizadores**: los cuatro casos tienen
  que afirmar lo mismo que antes, sobre la tabla.
- **P2 … P7 van en serie sobre la misma fila**: cada uno suma su acción a la
  columna de acciones. Cuando lleguen tres o más acciones por fila, el contrato
  que las sume decide si pasan a un menú.

## 11. Preguntas para el usuario

**Respondidas por el usuario el 2026-10-21:**

1. **¿Un proyecto se administra en su propia página, `/proyectos/[id]`, y
   clientes y etiquetas pasan a `/clientes` y `/etiquetas`?** **No.** Todo se
   administra en `/proyectos`, como hoy; clientes y etiquetas no se mudan, y P2
   … P7 van en serie, como dice el mapa. El ADR 0032, propuesto con la versión
   anterior, quedó rechazado. Lo aplica D-P1-1.
2. **¿La columna de tiempo de la lista muestra lo que el reporte deja ver?**
   **No hay columna de tiempo.** Con eso salen la lectura nueva del service de
   `report` y todo lo que dependía de ella. Lo aplica D-P1-6.
3. **¿«Crear proyecto» reemplaza a «Ir a Proyectos» en el selector vacío?**
   **Sí.** Lo aplica D-P1-10.
4. **¿Un proyecto archivado no se edita hasta restaurarlo?** **Sí.** Lo aplica
   D-P1-4.

No quedan preguntas abiertas.

## 12. Fuera de alcance

- **Archivar, restaurar y borrar proyectos** (PR-22, PR-24 … PR-26, PR-81 y
  PR-92): P2, desde la fila.
- **Clientes**: editar, archivar y borrar, y crear desde el diálogo de proyecto
  (PR-04 … PR-08, PR-86 y PR-111). Van en P3.
- **Tareas**: renombrar, marcar como hecha, borrar y el cambio de
  `task.create`. Van en P4, que decide cómo se administran en la fila.
- **Etiquetas**: editar, archivar y borrar. Van en P5.
- **Privados, miembros y responsables** (PR-17 … PR-19): P6. Hasta entonces, la
  columna «Acceso» dice «Público» en todos.
- **Favoritos** (PR-27): P8, que va después de P1 (§7).
- **El tiempo imputado en la lista**: fuera, por decisión del usuario (§11,
  pregunta 2).
- **Una página por proyecto**: fuera, por decisión del usuario (§11, pregunta
  1).
- **Filtros de la lista por cliente o por acceso, orden por otra columna y
  paginación**: PR-31 los deja _no verificados_ y no están pedidos.
- **El MCP**: crear o editar proyectos desde el asistente (D-P1-14).
- **La edición masiva de proyectos** (PR-32): es de plan pago.

## Hallazgos de la revisión

De `p1-arch-review` sobre `70711f9` («aprobado con cambios»). Las líneas que
cita son de esa versión.

| #   | Hallazgo                                                                            | Qué se hizo                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mayor: `project-picker.spec.ts:95` y `:391` cuentan 2 opciones y pasarían a 3       | Aplicado: el archivo está en «Consecuencias», los conteos cuentan solo las opciones de selección (§9.3.0, criterio 20) y se borró la frase que decía que no cambiaban |
| 2   | Mayor: el criterio 9 no mataba sus mutaciones                                       | Aplicado: la barrera bloquea con `lockProject`; «sin `lockProject`» lo mata la constancia de la segunda edición (criterio 9, §9.2, tabla de §9)                       |
| 3   | Mayor: el choque con E3 en `actions.integration.test.ts` por el segundo owner       | Aplicado: §10 nombra el archivo; el owner inactivo va con un `Actor` sintético en el service y ningún caso nuevo siembra un owner (criterio 4, §9.2)                  |
| 4   | Menor: un parámetro inválido borraba el otro                                        | Aplicado: `.catch(undefined)` por campo (§4.1), con su caso en `schema.test.ts` y en la e2e                                                                           |
| 5   | Menor: `lockProject` bloqueaba con el `join`                                        | Aplicado: bloquea solo `project` y relee con `findProject` (D-P1-3, §4.2, §4.3)                                                                                       |
| 6   | Menor: una mutación de `inScope` no se podía matar                                  | Sin efecto: no hay columna de tiempo ni lectura de `report`                                                                                                           |
| 7   | Menor: la numeración del ADR 0032                                                   | Sin efecto: el ADR quedó rechazado y su archivo se borra                                                                                                              |
| 8   | Menor: faltaban correcciones de paridad en `time-tracker.md:1322`, `:1899`, `:2175` | Aplicado (§7)                                                                                                                                                         |
| 9   | Menor: el mapa pone P8 sin dependencias                                             | Aplicado aunque el ADR ya no esté: TT-09 reescribe `picker-model.ts` y `project-picker.tsx`, así que P8 depende de P1 (§7)                                            |
| 10  | Menor: al worktree le falta `node_modules`                                          | Aplicado: `npm ci` en la precondición (§0) y en el orden (§7)                                                                                                         |

También quedó sin efecto la nota de que la página de un proyecto con
`loading.tsx` respondía el 404 con estado 200: con el cambio de diseño no hay
página de proyecto.
