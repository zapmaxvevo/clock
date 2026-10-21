# Fase 2, P1: editar proyectos, la lista completa y TT-09

Contrato del slice P1 de la fase 2. **Parte la administración de proyectos en
dos pantallas**: `/proyectos` pasa a ser la lista completa —tabla con columnas,
buscador y filtro de estado en la URL, activos y archivados— y cada proyecto
tiene su página, `/proyectos/[id]`, con sus tareas y su configuración, donde
owner, admin y el responsable **editan** el nombre, el cliente, el color, la
nota y el facturable por defecto. **Suma TT-09**: el selector de proyecto ofrece
«Crear proyecto», que abre el alta en un diálogo y deja elegido el proyecto
nuevo, en el rastreador, el calendario, la planilla y la edición masiva. **Sin
cambios de esquema y sin migración.** Una acción nueva en `can()`,
`project.update`.

- **Fuente:** [`proyectos.md`](../parity/proyectos.md), PR-12, PR-15, PR-21,
  PR-30, PR-31, PR-55, PR-56, PR-61, PR-72, PR-77, PR-83 … PR-85, PR-89 …
  PR-91, PR-93, PR-95 y PR-101 … PR-103;
  [`time-tracker.md`](../parity/time-tracker.md), TT-07, TT-09, TT-14, TT-87,
  TT-89 y TT-90; [`timesheet.md`](../parity/timesheet.md), TS-88;
  [`mejoras-pedidas.md`](../mejoras-pedidas.md), mejora 2; el
  [mapa de la fase 2](fase2-mapa.md), «P1», §3 y «Lo que vale para todos».
- **Lugar en el plan:** primero del bloque de proyectos. No depende de ningún
  slice en curso. Corre en paralelo con E3 (`clock-e3`), que toca `team` y
  `workspace`; P1 no toca ninguno de los dos (§10).
- **Revisión:** pendiente de `architecture-reviewer`.
- **Decisiones de arquitectura:**
  - **[ADR 0032](../adr/0032-un-proyecto-se-administra-en-su-propia-pagina.md),
    propuesto con este contrato**: un proyecto se administra en su propia
    página, y clientes y etiquetas pasan a pantallas propias con P3 y P5
    (D-P1-1). Es lo que el mapa deja a P1 y lo que destraba el paralelo de P2 …
    P7.
  - El resto cae dentro de ADR aceptados:
    [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md)
    (la página de `/proyectos` compone lo de `project` y lo de `report`; ningún
    módulo importa al otro al revés), [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md)
    y [ADR 0030](../adr/0030-el-asistente-lee-horas-ajenas-por-el-alcance-del-reporte.md)
    (el tiempo imputado se lee por el `ReportScope`, D-P1-7),
    [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md) (TT-09 reusa
    el alta con el id del navegador),
    [ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md) (el estado
    de la lista en la URL, PR-95),
    [ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)
    y [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md) (el tiempo imputado con
    el formato del workspace, recibido por props).

Decisiones del usuario que el contrato da por tomadas: TT-09 entra en P1
(2026-10-16, `fase2-mapa.md`); la paridad de proyectos con sus pendientes P-16 …
P-32 decididos (`proyectos.md` §15), en particular la paleta fija (P-30), la
nota sin formato (P-31), la unicidad por cliente (P-19) y el facturable como
diseño propio (P-16); crean proyectos todas las membresías activas (workspace
P-03, PR-59).

## Decisiones del contrato

**D-P1-1 — Dos pantallas: la lista en `/proyectos` y cada proyecto en
`/proyectos/[id]` (ADR 0032, propuesto; pregunta 1).** La lista muestra los
proyectos, no sus tareas; la página del proyecto tiene en P1 dos secciones,
«Tareas» y «Configuración», y P6 suma «Acceso» entre las dos. «Nuevo cliente»,
«Nueva etiqueta» y la sección de etiquetas siguen en `/proyectos` hasta P3 y P5,
que las llevan a `/clientes` y `/etiquetas`. **Con P1 en `main`, P2, P6 y P8
pueden ir en paralelo; con P2, P3, P4 y P5** (consecuencias del ADR).

Alternativas descartadas, con su detalle en el ADR: editar en un diálogo desde
la fila (P2 … P7 en serie sobre un solo diálogo) y un panel lateral sobre la
lista.

**D-P1-2 — Acción nueva `project.update`, sobre `ProjectResource`: owner, admin
y el responsable del proyecto (PR-55, PR-56, PR-57).** Misma regla que hoy
`task.create` (`permissions/index.ts:210-212`): `isWorkspaceAdmin(actor) ||
project.viewer?.isManager === true`. `project_manager` y `team_manager` deciden
como `member` (PR-57); el rol de workspace `project_manager` no alcanza (PR-56,
P-24). La membresía no activa no puede, por la regla común (PR-60).

- **Por qué una acción propia y no `task.create`**: P4 cambia `task.create` a
  «quien ve el proyecto» (WS-40); editar el proyecto no cambia con eso.
- **El archivado no entra en `can()`**: lo decide el service (D-P1-4), como el
  alta de tarea y la validación de una entrada (`service.ts:249-255`,
  `:355-361`). `can()` decide quién, no en qué estado está la fila.
- **Quién la ve en pantalla**: la página arma `canUpdate` con `can()` y el
  archivado (§4.3); la lista no la consulta.

**D-P1-3 — La edición es un parche: viaja solo lo que cambió, y lo que no viaja
no se toca.** La entrada lleva el id y, opcionales, `name`, `clientId`,
`color`, `note` y `billableByDefault`. En el service, en una transacción:

1. **La fila del proyecto `for no key update`**, con la fila de miembro de quien
   actúa en la misma sentencia (`lockProject`). Pone en fila a dos ediciones del
   mismo proyecto: la segunda lee lo que la primera confirmó, y el valor
   anterior de su constancia es el real. `for no key update` y no `for update`:
   `time_entry`, `task` y `project_member` apuntan al proyecto con claves
   foráneas, que toman `for key share`, y no tienen que esperar a una edición
   (criterio 9). **No bloquea nada más**: ni la membresía de quien actúa ni la
   del cliente.
2. **Las reglas de D-P1-4**, en su orden.
3. **Lo que cambia**: de los campos que llegaron, los que difieren de la fila
   (`changedProjectFields`, pura). **Nada distinto: éxito sin escribir y sin
   constancia**, que es lo que hace inofensivo «Reintentar» después de una
   respuesta perdida (TT-89).
4. `update project set …` con esos campos (`updated_at` lo pone `$onUpdate`,
   `db/schema.ts:318-321`) y `recordAudit` con `project.update` (§4.6).

**Dos personas que editan a la vez** quedan en fila detrás del bloqueo; si
tocan campos distintos, quedan los dos cambios (es lo que da el parche y lo que
no daría reemplazar la fila entera); si tocan el mismo, gana el segundo, y las
dos constancias lo cuentan. **Sin control de versión**: Clock no tiene en ningún
lado un «alguien lo cambió mientras editabas», y para cinco personas no lo
justifica.

**Sin relectura de la membresía de quien actúa bajo bloqueo**, como las cuatro
altas del módulo (`service.ts:114-334`): el `Actor` es el de la sesión del
pedido. La relectura de D-R8-7 es de las mutaciones de equipo, que cambian la
autoridad misma; acá la ventana es la de un pedido, y quien pierde el rol lo ve
en el pedido siguiente.

**D-P1-4 — Las reglas de una edición, en este orden.**

1. **El proyecto**: que no exista en el workspace de la sesión, o que
   `project.view` no lo deje ver (también con la membresía no activa), responde
   `not_found` con «Ese proyecto ya no está disponible.» (PR-72). Un privado
   ajeno responde lo mismo que uno inexistente.
2. **Archivado**: el mismo `not_found` de PR-72. **Un proyecto archivado no se
   edita** (pregunta 4): su página lo muestra en solo lectura con «Los proyectos
   archivados no se editan.», y P2 trae «Restaurar». Es la regla del alta de
   tarea sobre un archivado y la de PR-72, que ya nombra «archivado».
3. **El permiso**: sin `project.update`, `forbidden` con «No tenés permiso para
   hacer esto.» (PR-84).
4. **Los campos** (en el esquema Zod, antes del service, salvo el cliente):
   - **Nombre**: recortado; vacío, PR-75; más de 100, PR-76; con el carácter
     nulo, el texto de siempre. **Repetido para el mismo cliente**, PR-77,
     también cuando lo que cambia es el cliente y el nombre queda (PR-50, riesgo
     del mapa). La validación previa no existe: lo dice el índice
     `project_name_unq` (`db/schema.ts:346-350`), traducido en el service como
     en el alta (PR-91, `translatingNameTaken`).
   - **Cliente**: `null` es «Sin cliente» (PR-14). **Solo se valida si
     cambia**: el cliente nuevo tiene que existir en el workspace y no estar
     archivado; si no, `not_found` con «Ese cliente ya no está disponible.»
     (PR-83). Un proyecto que ya tiene un cliente archivado lo conserva en
     cualquier edición que no cambie el cliente (PR-98: los dos estados son
     independientes).
   - **Color**: una clave de la paleta (P-30). **En la edición no hay `null`**:
     el color asignado por el servidor es del alta (PR-15).
   - **Nota**: recortada, hasta 3000 (PR-30, PR-54).
   - **Facturable por defecto**: un booleano. **Cambiarlo no toca ninguna
     entrada** (TT-14, riesgo del mapa): solo decide con qué arrancan las
     entradas nuevas y las que cambian de proyecto después.

**Lo que ya está construido y P1 no cambia** (slice 10): renombrar, cambiar el
color o el cliente de un proyecto con entradas se ve en todas sus entradas,
pasadas incluidas, porque la entrada guarda la referencia (PR-101 … PR-103).
P1 lo verifica en e2e (criterio 21).

**D-P1-5 — Revalidación: el árbol entero para el alta y la edición de un
proyecto; `/proyectos` y lo que cuelga, para las otras tres altas.** Hoy las
cuatro actions revalidan `"/proyectos"` (`actions.ts:22-28`).

- **`createProject` y `updateProject`**: `{ path: "/", type: "layout" }`, como
  la configuración (D-WS2b-5). El alta corre desde el selector del rastreador,
  el calendario y la planilla (TT-09), y el nombre y el color de un proyecto se
  ven en todas las pantallas. Desde una Server Function, `revalidatePath`
  actualiza la pantalla abierta en la misma respuesta
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:19`).
- **`createClient`, `createTask` y `createTag`**: `{ path: "/proyectos", type:
"layout" }`, que cubre la lista y la página de un proyecto, donde ahora vive
  «Nueva tarea».

`handle` revalida también con error (`action.ts:37-54`), como hasta hoy.

**D-P1-6 — La lista: todos los proyectos visibles, activos y archivados; el
filtro y la búsqueda se aplican en el navegador y viven en la URL (PR-31, PR-89,
PR-95).**

- **Qué trae el servidor**: `getProjectList` lee todos los proyectos del
  workspace con la fila de miembro de quien pide (`listAllProjects`,
  `repository.ts:279-285`), los clientes, y la cantidad de tareas activas por
  proyecto, en una transacción `repeatable read`, y filtra con `can(actor,
"project.view", …)` (PR-61, PR-93), como `readCatalog`. **Orden alfabético
  plano** con `compareNames` (`lib/text.ts:27`), sin grupos por cliente: el
  cliente es una columna.
- **Las columnas** (PR-31): «Nombre» (el punto de color y el nombre, que lleva a
  la página del proyecto), «Cliente» («Sin cliente» si no tiene), «Acceso»
  («Público» o «Privado»; hasta P6, todos públicos), «Tareas» (las activas),
  «Tiempo imputado» (D-P1-7). Con «Todos», un archivado lleva «Archivado» al
  lado del nombre.
- **El filtro de estado**: «Activos» (por omisión), «Archivados», «Todos», en el
  parámetro `estado` (`activos`, `archivados`, `todos`). Elegir **navega** con
  `router.push`, como el filtro de `/equipo` (D-E2-8,
  `team/components/status-filter.tsx:31-46`): cada filtro es una entrada del
  historial y el botón de volver lo deshace (PR-95).
- **El buscador**: por nombre de proyecto y de cliente, sin distinguir
  mayúsculas ni acentos (`normalizeSearch`, como TT-07), en el parámetro
  `buscar`. Escribir **reemplaza** la URL con `window.history.replaceState`, sin
  pedido al servidor y sin una entrada de historial por tecla: Next sincroniza
  `useSearchParams` con la API nativa
  (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:345-347`).
  Recargar conserva lo escrito (PR-95).
- **La URL inválida se ignora** (ADR 0008, como `teamSearchParams`): un `estado`
  desconocido o repetido es «Activos»; un `buscar` repetido o de más de 100
  caracteres es vacío.
- **Los vacíos se distinguen** (PR-85, PR-89): sin ningún proyecto visible,
  «Todavía no hay proyectos»; con «Activos» y todos archivados, «No hay
  proyectos activos» con la sugerencia de cambiar el filtro; con «Archivados» y
  ninguno, «No hay proyectos archivados»; con búsqueda y sin coincidencias,
  «Ningún proyecto coincide con la búsqueda.», la misma redacción que el
  selector (TT-07), por la regla de una redacción por causa.

**Por qué en el navegador**: es el mismo criterio del selector (PR-110) y de
`/equipo`: el workspace del plan Free es chico, la lista entera ya viaja para
dibujarse, y filtrar sin pedido hace que la búsqueda responda a cada tecla.

**D-P1-7 — El tiempo imputado se lee por el service de `report`, con el alcance
del reporte: todo el tiempo, entradas cerradas (pregunta 2).** El ADR 0020 deja
una sola puerta a las horas de otras personas, el `ReportScope` de `scopeOf`
(`report/service.ts:180-189`), y el ADR 0030 lo reafirmó: «ninguna lectura de
horas ajenas existe fuera del `ReportScope`». Una columna con la suma de las
horas de todo el equipo en cada proyecto es una lectura de horas ajenas. Así:

- **Una función nueva del service de `report`**,
  `getTrackedTimeByProject(actor)`, sobre `scopeOf` y una consulta nueva de su
  repository, `totalsByProject(scope)`: las entradas **cerradas** del alcance
  con proyecto, sumadas por proyecto con `entrySeconds`
  (`report/repository.ts:276`), **sin rango de fechas**. El timer que corre no
  suma, como en el reporte (`closedIn`, `:226-232`).
- **Owner y admin** (`timeEntry.others.view`) ven la suma de todas las
  personas, activas e inactivas; **los demás roles, la suya**. La columna se
  llama «Tiempo imputado» en el primer caso y «Tu tiempo» en el segundo, para
  que nadie lea su suma como la del proyecto.
- **Sin `report.view`** (membresía no activa) no lee nada y devuelve el alcance
  propio vacío; esa persona tampoco ve proyectos (PR-60).
- **La página compone**: `src/app/(app)/proyectos/page.tsx` pide la lista a
  `project` y los totales a `report`, y se los pasa a la pantalla. `project`
  no importa nada de `report` (ADR 0010: `report` ya importa de `project`). El
  tipo de lo que recibe la pantalla, `TrackedTimeView`, es de `project/schema.ts`,
  y `report` lo devuelve.
- **El formato** es el del workspace, por props desde `timeSettingsOf(session)`
  (ADR 0029, como el reporte en D-WS2b-8). Sin horas, `formatDuration(0, …)`:
  `0:00` o `00:00:00`.

**D-P1-8 — La página de un proyecto: encabezado, «Tareas» y «Configuración»;
un 404 propio para lo que no se ve.**

- **`/proyectos/[id]`**: un `id` que no es un UUID, un proyecto inexistente, de
  otro workspace o que `project.view` no deja ver dan `notFound()`, con
  `src/app/(app)/proyectos/[id]/not-found.tsx`: «Ese proyecto ya no está
  disponible.» y el enlace «Volver a Proyectos». Una sola respuesta para los
  cuatro casos (PR-72).
- **El encabezado**: el enlace «Volver a Proyectos», el punto, el nombre como
  `<h1>`, el cliente («Sin cliente» si no tiene) y, si está archivado, la marca
  «Archivado».
- **«Tareas»**: las activas en orden alfabético, como hoy en la lista, y «Nueva
  tarea» con `task.create` sobre un proyecto activo (el diálogo de hoy, sin
  cambios). Sin tareas, «Este proyecto no tiene tareas.».
- **«Configuración»**: con `canUpdate` (D-P1-2 y no archivado), el formulario de
  D-P1-9; sin él, los mismos datos en solo lectura —nombre, cliente, color con
  su nombre, «Facturable por defecto» con «Sí» o «No», y la nota—, y si está
  archivado, «Los proyectos archivados no se editan.».
- **El aviso que sobrevive**: la página monta `ProjectNoticesProvider` y su
  región, como la lista (`project-notices.tsx:56-99`). Si una edición falla
  con `not_found` o `forbidden`, la revalidación trae la página sin el
  formulario (se archivó, o la persona dejó de ser responsable), y su aviso
  pasa a la región con el foco, como el de «Nueva tarea» en el slice 9.

**D-P1-9 — Un solo juego de campos para el alta, la edición y TT-09.** Los
campos de `new-project-dialog.tsx:114-170` pasan a `ProjectFields`, un
componente controlado con el borrador y su `onChange`, que usan los tres
formularios. Diferencias:

- **Alta** (cabecera de `/proyectos` y TT-09): el color empieza sin elegir, con
  la ayuda «Si no elegís uno, se asigna automáticamente.»; el facturable, sin
  marcar.
- **Edición**: los campos arrancan con los valores guardados; el color siempre
  elegido y **sin** esa ayuda; el selector de cliente ofrece «Sin cliente», los
  activos y, si el proyecto tiene un cliente archivado, ese con «(archivado)»
  después del nombre (D-P1-4). «Guardar» manda solo lo que difiere de lo
  guardado (D-P1-3); sin cambios, no manda nada.

**El formulario de la edición** vive en la sección, no en un diálogo:

- **Mientras viaja y después del éxito** muestra lo guardado, sin volver un
  instante a los valores de antes; el éxito se anuncia con «Cambios guardados»
  en una región `status`. Cómo se consigue —`useOptimistic` sobre la vista,
  un borrador de los campos tocados, o los dos— lo elige `frontend-dev`; el
  criterio 17 lo fija.
- **Con falla** conserva lo escrito, y muestra el aviso «No se pudieron guardar
  los cambios.» con el mensaje; «Reintentar» solo con `unexpected` (TT-89,
  PR-90), y con el foco en «Guardar» antes, como `CreateDialog`.
- **Un cambio de otra persona a un campo que esta no tocó** aparece al
  revalidar; uno a un campo que sí tocó queda debajo de lo escrito hasta que
  guarde o recargue.
- **«Guardar» no pasa a `disabled`** mientras viaja: `aria-disabled`, como los
  diálogos (`create-dialog.tsx:89-97`).

**D-P1-10 — TT-09: «Crear proyecto» es la última opción de la lista del
selector, con `project.create`, y abre el alta en un diálogo.** Clockify la
ofrece «al final del buscador cuando el permiso lo habilita» (TT-09).

- **Una opción del `listbox`, no un botón suelto**: se alcanza con las flechas y
  se elige con Enter como las demás, y no depende de que `Tab` no cierre el
  popup (en el selector, `Tab` cierra). No es una selección: `PickerOption`
  pasa a una unión con `kind` (§5.7), así nunca compara igual a «Sin proyecto»
  ni llega a `onChange`.
- **Siempre al final** y **con cualquier búsqueda**, también sin coincidencias
  y con todo excluido en la planilla (TS-18): el proyecto nuevo nunca está
  excluido. El texto es siempre «Crear proyecto».
- **Reemplaza a «Ir a Proyectos» del selector vacío** (TT-87, TS-88, pregunta
  3): con el catálogo vacío el selector sigue diciendo «No hay proyectos
  todavía» y la lista trae «Sin proyecto» y «Crear proyecto». En Clockify, ahí
  mismo está «Crear proyecto» (justificación de TT-87). «Ir a Proyectos» del
  selector de **etiquetas** (TT-88) no cambia: las etiquetas se siguen creando
  en `/proyectos` hasta P5.
- **El diálogo**: «Nuevo proyecto», los campos de D-P1-9 en su forma de alta,
  **con el nombre arrancando en la búsqueda recortada**. Reusa
  `createProject`, con su id de `useNewId` (ADR 0007): «Reintentar» no crea un
  segundo proyecto. Se monta al pedirlo y no tiene disparador propio: cerrar,
  por éxito o por la persona, devuelve el foco al disparador del selector.
- **Con éxito**, el selector entrega el proyecto nuevo, sin tarea, con
  `onChange` (D-P1-11): en la barra queda elegido para «Iniciar» o «Agregar»;
  en una fila o en el timer que corre, se guarda sobre la entrada como
  cualquier cambio de proyecto; en los diálogos del calendario y de la edición
  masiva, queda en el borrador; en la planilla, la fila toma el par.
- **Con falla**, el diálogo queda abierto con lo escrito y el aviso «No se pudo
  crear el proyecto.» con la causa (PR-75 … PR-77, PR-83, PR-84); «Reintentar»
  solo por red.
- **Sin `ProjectNoticesProvider`** en las pantallas del rastreador: el aviso
  vive en el diálogo. El único caso en que el diálogo sale del árbol con su
  aviso es el de la membresía desactivada (TT-92): la revalidación pone el
  selector en solo lectura y la pantalla muestra su aviso de membresía
  inactiva, que ya lo explica.
- **Dentro de un diálogo** (el de una entrada del calendario, el de la edición
  masiva) el de TT-09 es un diálogo anidado: `Escape` cierra solo el de arriba,
  y el de abajo sigue con su borrador (la misma regla de CAL-67 para el
  selector).

**D-P1-11 — El selector entrega el proyecto nuevo cuando el catálogo ya lo
tiene.** Quien recibe `onChange` busca en el catálogo el facturable por defecto
del proyecto elegido (`withSelection`, `entry-fields.ts:59-75`) y la planilla
decide con él si el par se puede cargar (`isTrackablePair`, D13-8). Si el
selector entregara el proyecto en el mismo instante del éxito, el catálogo de
esa vista todavía no lo tendría: la entrada nueva arrancaría no facturable aunque
el proyecto lo sea (TT-14), y la fila de la planilla lo vería como no cargable.
Así:

- **El selector guarda la selección pendiente** al recibir el éxito, y la
  entrega con `onChange` **en un efecto, cuando `catalogEntryOf(catalog, par)`
  la encuentra** en el catálogo del proveedor. El catálogo nuevo llega con la
  revalidación de la misma respuesta (D-P1-5); para entonces, los componentes
  que escuchan ya se dibujaron con él, y sus manejadores lo ven.
- **La pendiente se descarta** si el selector se vuelve a abrir, si cambia de
  valor por otro lado o si se desmonta. Si el catálogo no la trae nunca (alguien
  archivó el proyecto en el medio), no se elige nada: el selector se abre como
  antes.
- **`time-entry` no cambia**: ni `withSelection`, ni `isTrackablePair`, ni el
  `ProjectSelection` que recibe.

**D-P1-12 — El catálogo del rastreador suma los clientes activos; el resultado
del alta cambia de forma.**

- **`TrackingCatalog.clients`**: los clientes activos, en orden alfabético, para
  el selector de cliente del diálogo de TT-09; vacío sin `project.create`. Sale
  de la misma lectura (`readCatalog` ya lee todos los clientes,
  `service.ts:481`), sin consulta nueva.
- **`CreateProjectResult`** pasa de `{ project: ProjectView }` a `{ project:
CreatedProject }`, con lo que la entrada necesita de un proyecto —id, nombre,
  color, cliente y facturable por defecto—. Hoy nadie lee el resultado más que
  para cerrar el diálogo. El reintento lo arma de la fila propia, como hoy.
- **El MCP no cambia** (D-P1-14): `list_projects` copia campo por campo
  (`mcp/tools.ts:298-312`) y no ve `clients`.

**D-P1-13 — La action llega al selector por el proveedor del catálogo.** El
selector es del módulo `project` y lo usan seis componentes de `time-entry`
(`tracker-bar.tsx:628`, `entry-row.tsx:275`, `bulk-edit-dialog.tsx:251`,
`calendar/entry-dialog.tsx:401`, `calendar/entry-dialog-body.tsx:79`,
`timesheet/timesheet-row.tsx:53`). En lugar de pasarle la action a cada uno,
`TrackingCatalogProvider` recibe `createProject` además del catálogo, y el
selector la toma con un hook del mismo archivo. Las tres pantallas que montan el
proveedor (`tracker-screen.tsx:52`, `calendar/calendar-screen.tsx:51`,
`timesheet/timesheet-screen.tsx:54`), que son componentes de servidor, importan
`createProject` de `@/modules/project/actions` y la pasan: una dependencia de
`time-entry` hacia `project`, la dirección que permite el ADR 0010. Los tests
de componentes que montan el proveedor le pasan un doble.

**D-P1-14 — El MCP no cambia.** `list_projects` y `summarize_hours` leen los
proyectos en cada pedido: un nombre o un color nuevos aparecen solos. Crear o
editar proyectos desde el asistente no está pedido; sería una herramienta nueva
sobre las mismas operaciones, con su slice.

**D-P1-15 — «Proyectos» queda marcado en el menú dentro de
`/proyectos/[id]`.** `app-nav.tsx:48` compara la ruta exacta; para las entradas
que no son `"/"`, pasa a marcar también las rutas que empiezan con la entrada
seguida de `/`. `"/"` sigue exacta.

**D-P1-16 — Sin migración.** Todas las columnas que la edición escribe existen
desde el slice 9 y el 11a; `audit_log` guarda cualquier acción. P1 no corre
`db:generate` ni toma número de migración: la `0021` queda para E3.

## 0. Precondición de arranque

- **El worktree** `/home/maxi/program/clock-p1`, rama `fase2/p1-proyectos`,
  sale de `main` en `380ef3b`, con WS2a, WS2b y el MCP de equipo: tiene
  `formatDuration(seconds, format)`, `timeSettingsOf` con el formato del
  workspace y `ReportScope` con `ReadMode`.
- **Las respuestas del usuario a las preguntas 1 a 3 (§11), antes del primer
  paso de `frontend-dev`**. La 1 decide las rutas; la 2, la columna y su
  encabezado; la 3, el vacío del selector. `backend-dev` puede arrancar con la
  recomendación de cada una: las alternativas solo quitan.
- **Sin migración** (D-P1-16). Las bases de prueba se migran con el `drizzle/`
  del árbol.

### Supuestos sobre el árbol

Citas del árbol de `clock-p1` en `380ef3b`.

| Supuesto                                                                                                               | Dónde                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `project` con nombre, cliente, color, `is_public`, `billable_by_default`, nota, `archived_at`; índice y `check`        | `src/server/db/schema.ts:303-360`                                                                                                        |
| La unión `Action`, la tabla de clases de recurso, la de roles y `allowsOnProject`                                      | `src/server/permissions/index.ts:59-114`, `:124-151`, `:161-188`, `:198-216`                                                             |
| Las altas, `translatingNameTaken`, `readCatalog`, `getProjectCatalog`, `getTrackingCatalog`                            | `src/modules/project/service.ts:98-111`, `:160-233`, `:474-523`, `:526-540`, `:551-567`                                                  |
| `findProject`, `findClient`, `listClients`, `listAllProjects`, `listActiveTasks`, `isProjectNameTaken`                 | `src/modules/project/repository.ts:79-90`, `:173-187`, `:258-260`, `:279-285`, `:288-304`, `:364-366`                                    |
| Los esquemas, `ProjectCatalog`, `TrackingCatalog`, `CreateProjectResult`, `ProjectActions`                             | `src/modules/project/schema.ts:58-67`, `:115-126`, `:175-184`, `:189`, `:196-207`                                                        |
| Las cuatro actions revalidan `"/proyectos"`                                                                            | `src/modules/project/actions.ts:22-28`                                                                                                   |
| La pantalla agrupa por cliente, con las tareas y «Nueva tarea» por fila                                                | `src/modules/project/components/projects-screen.tsx:30-129`; `src/app/(app)/proyectos/page.tsx:11-21`                                    |
| El marco de los diálogos de alta, con su disparador y el aviso que sobrevive                                           | `components/create-dialog.tsx:55-184`; `components/project-notices.tsx:56-123`                                                           |
| Los campos del alta de proyecto; `ColorField` con la ayuda fija                                                        | `components/new-project-dialog.tsx:61-173`; `components/color-field.tsx:21-57`                                                           |
| El selector: `items` con «Sin proyecto» en su grupo, `choose`, el vacío con «Ir a Proyectos», el modo de solo lectura  | `components/project-picker.tsx:126-161`, `:287-307`                                                                                      |
| El modelo del selector: `PickerOption`, `PickerEmpty`, `pickerView`, `catalogEntryOf`                                  | `components/picker-model.ts:13-42`, `:121-155`, `:168-189`                                                                               |
| El proveedor del catálogo                                                                                              | `components/tracking-catalog.tsx:16-33`                                                                                                  |
| Los seis usos del selector y las tres pantallas que montan el proveedor                                                | D-P1-13                                                                                                                                  |
| `withSelection` busca el facturable en el catálogo                                                                     | `src/modules/time-entry/components/entry-fields.ts:43-75`                                                                                |
| `useAction` corre `onSuccess` en una transición                                                                        | `src/hooks/use-action.ts:60-86`                                                                                                          |
| `handle` revalida también con error                                                                                    | `src/server/action.ts:37-54`                                                                                                             |
| `scopeOf`, `ReportScope`, `inScope`, `closedIn`, `entrySeconds`, `secondsOf`; el repository como objeto, `tx` al final | `src/modules/report/service.ts:114-189`; `src/modules/report/repository.ts:209-232`, `:276-285`, `:961-973`                              |
| `list_projects` copia el catálogo campo por campo                                                                      | `src/modules/mcp/tools.ts:286-315`                                                                                                       |
| El filtro de `/equipo` navega con `router.push`; `teamSearchParams` ignora lo inválido                                 | `src/modules/team/components/status-filter.tsx:31-46`; `src/modules/team/schema.ts:29-31`; `team/components/team-members-model.ts:49-52` |
| La página de equipo compone dos módulos y pasa `timeSettingsOf(session)`                                               | `src/app/(app)/equipo/page.tsx:15-41`                                                                                                    |
| El menú compara la ruta exacta                                                                                         | `src/components/layout/app-nav.tsx:34-51`                                                                                                |
| `normalizeSearch`, `compareNames`, `sortedByName`                                                                      | `src/lib/text.ts:14`, `:27`, `:42`                                                                                                       |
| Las barreras de concurrencia de los tests                                                                              | `src/test/concurrency.ts:113` (`outcomeWhileHeld`), `:178` (`queueBehindBarrier`)                                                        |
| Los e2e de `/proyectos`: grupos, «Nueva tarea» en la fila, sus avisos                                                  | `e2e/projects.spec.ts:243`, `:293`, `:323`, `:345`; `e2e/projects-page.ts`                                                               |
| Sin biblioteca de DOM en los tests de unidad: `renderToStaticMarkup`                                                   | `src/modules/project/components/projects-screen.test.tsx`; `project-picker.test.tsx`                                                     |

## 1. Alcance

Cubre:

- **PR-12** en la edición: nombre, cliente, color, nota y facturable por
  defecto de un proyecto ya creado, con **PR-15** (el color de la paleta),
  **PR-21** (el facturable por defecto, la deuda del 11a) y **PR-30** (la nota).
- **PR-31**: la lista con sus columnas, el buscador y el filtro de estado.
- **PR-55** y **PR-56** en lo que es editar: owner, admin y el responsable.
- **PR-89** (los vacíos de la lista) y **PR-95** (el filtro y la búsqueda en la
  URL).
- **TT-09**: crear un proyecto desde el selector, en todos los lugares que lo
  usan; cambia **TT-87** y **TS-88** (el vacío del selector).
- Valen para la acción nueva y P1 los prueba: PR-57, PR-60, PR-61 (la lista y
  la página), PR-72, PR-75 … PR-77, PR-83, PR-84, PR-90, PR-91, PR-93; y en
  e2e, sobre la edición, PR-101 … PR-103, ya construidos.

Entra:

- **`project.update`** en `can()` (D-P1-2).
- **`updateProject`**: esquema, repository, service y action (D-P1-3, D-P1-4).
- **`getProjectList`** y **`getProjectPage`** en el service de `project`, que
  reemplazan a `getProjectCatalog` (§4.3).
- **`getTrackedTimeByProject`** en el service de `report` (D-P1-7).
- **La lista** (`/proyectos`) y **la página del proyecto**
  (`/proyectos/[id]`, con su `not-found.tsx` y su `loading.tsx`).
- **`ProjectFields`**, el marco del diálogo partido del disparador y el
  formulario de la edición (D-P1-9).
- **TT-09** en el selector, el proveedor con la action y `clients` en el
  catálogo (D-P1-10 … D-P1-13).
- **El menú** con el prefijo de «Proyectos» (D-P1-15).
- **Las correcciones de paridad** (§7).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                                                                                                                                                                                                                                                       | Qué cambia                                                                                                                      | Qué hay que volver a probar                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/server/permissions/index.ts`                                                                                                                                                                                                                                                             | `project.update` en las tres tablas y en `allowsOnProject`                                                                      | `permissions.test.ts`                                                                                                    |
| `project/schema.ts`                                                                                                                                                                                                                                                                           | Lo de §4.1; se van `ProjectCatalog`, `ProjectGroupView`, `ProjectView`; `CreateProjectResult` cambia; `TrackingCatalog.clients` | `schema.test.ts`                                                                                                         |
| `project/repository.ts`, `service.ts`, `actions.ts`                                                                                                                                                                                                                                           | Lo de §4.2 a §4.5; `getProjectCatalog` se reemplaza; las opciones de revalidación (D-P1-5)                                      | `service.integration.test.ts` (los casos de `getProjectCatalog` pasan a `getProjectList`), `actions.integration.test.ts` |
| `report/repository.ts`, `report/service.ts`                                                                                                                                                                                                                                                   | `totalsByProject` y `getTrackedTimeByProject`, al final                                                                         | un `describe` nuevo en la integración del reporte                                                                        |
| `project/components/projects-screen.tsx` y su test                                                                                                                                                                                                                                            | La tabla, el filtro, el buscador; sin grupos ni tareas                                                                          | `projects-screen.test.tsx`, reescrito                                                                                    |
| `project/components/new-project-dialog.tsx`, `create-dialog.tsx`, `color-field.tsx`                                                                                                                                                                                                           | Usan `ProjectFields` y el marco partido; la ayuda del color, solo en el alta                                                    | los tests de la pantalla; `e2e/projects.spec.ts` sin cambiar lo que afirma de las altas                                  |
| `project/components/project-picker.tsx`, `picker-model.ts`, `tracking-catalog.tsx`, `labels.ts`                                                                                                                                                                                               | TT-09, la opción de crear, la selección pendiente, el proveedor con la action; `PickerEmpty.noProjects` sin `canCreateProject`  | `picker-model.test.ts`, `project-picker.test.tsx`, `tag-picker.test.tsx`                                                 |
| `time-entry/components/tracker-screen.tsx`, `calendar/calendar-screen.tsx`, `timesheet/timesheet-screen.tsx`                                                                                                                                                                                  | Pasan `createProject` al proveedor                                                                                              | sus e2e, sin cambiar lo que afirman                                                                                      |
| Los tests que arman un `TrackingCatalog` o montan el proveedor: `entry-row.test.tsx`, `entry-fields.test.ts`, `calendar/calendar-block.test.tsx`, `calendar/entry-dialog.test.tsx`, `timesheet/timesheet-view.test.tsx`, `timesheet/stored-rows.test.ts`, `timesheet/timesheet-model.test.ts` | `clients: []` en el catálogo; `createProject` doble en el proveedor                                                             | los mismos, sin cambiar lo que afirman                                                                                   |
| `src/app/(app)/proyectos/page.tsx`                                                                                                                                                                                                                                                            | Compone la lista, los totales y el formato; parsea `estado` y `buscar`                                                          | la e2e                                                                                                                   |
| `src/components/layout/app-nav.tsx` y su test                                                                                                                                                                                                                                                 | El prefijo (D-P1-15)                                                                                                            | `app-nav.test.tsx`                                                                                                       |
| `e2e/projects.spec.ts`, `e2e/projects-page.ts`                                                                                                                                                                                                                                                | El caso de los grupos (`:243`) pasa a la tabla; los de «Nueva tarea» (`:293`, `:323`, `:345`) pasan a la página del proyecto    | la e2e entera                                                                                                            |

- **Sin cambio**: `src/server/db/` y `drizzle/`; `src/server/session.ts`,
  `access.ts`, `entry.ts`; `src/server/time/`; el service, el repository y los
  componentes de `time-entry` salvo las tres pantallas y los fixtures; `team`;
  `workspace`; `profile` (solo se lee `timeSettingsOf`); `mcp`; las
  exportaciones del reporte.
- **Ninguna e2e de otra pantalla cambia lo que afirma.** Las del selector siguen
  pasando: la opción de crear se suma al final, y ningún spec de hoy afirma el
  vacío de TT-87 (la base de los e2e siempre tiene proyectos).

## 2. Esquema y migración

**Ningún cambio de esquema y ninguna migración** (D-P1-16). El índice
`project_name_unq` ya cubre el cambio de nombre y de cliente; la clave
`project_client_fk` ya ata el cliente al workspace; el `check` de la paleta ya
rechaza un color fuera de lista. `drizzle/` no se toca.

## 3. Permisos

**Una acción nueva**, `project.update` (D-P1-2):

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

| Acción                                 | Recurso             | Quién                                       | Se consulta                                                                                  |
| -------------------------------------- | ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `project.update`                       | `ProjectResource`   | owner, admin, y el responsable del proyecto | `updateProject` (después de ver el proyecto y su archivado) y `getProjectPage` (`canUpdate`) |
| `project.view`                         | `ProjectResource`   | sin cambios                                 | `getProjectList` y `getProjectPage`, además de lo de hoy                                     |
| `project.create`                       | `WorkspaceResource` | sin cambios                                 | además, `clients` del catálogo del rastreador para TT-09 (ya lo consulta para TT-87)         |
| `report.view`, `timeEntry.others.view` | `WorkspaceResource` | sin cambios                                 | `getTrackedTimeByProject`, por `scopeOf`                                                     |

## 4. Contrato de backend

### 4.1 Esquemas (`src/modules/project/schema.ts`)

`projectMessages` no cambia: la edición responde con los mensajes de causa que
ya existen (§4.7), y el título del aviso vive en `labels.ts` (§5.9).

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

/**
 * D-P1-12: un proyecto recién creado, o el de un reintento, con lo que una
 * entrada necesita de él. Reemplaza a `{ project: ProjectView }`.
 */
export type CreatedProject = ProjectRef & {
  readonly clientId: string | null;
  readonly billableByDefault: boolean;
};
export type CreateProjectResult = { readonly project: CreatedProject };

/** D-P1-6: los tres valores del filtro de estado, en el orden del selector. */
export const PROJECT_FILTERS = ["activos", "archivados", "todos"] as const;
export type ProjectFilter = (typeof PROJECT_FILTERS)[number];

/** D-P1-6, ADR 0008: lo inválido se ignora en la página. */
export const projectsSearchParams = z.object({
  estado: z.enum(PROJECT_FILTERS).optional(),
  buscar: z.string().max(NAME_MAX).optional(),
});

/** D-P1-8: el segmento de `/proyectos/[id]`; uno que no es UUID es un 404. */
export const projectPageParams = z.object({ id: z.uuid() });

/** Una fila de la lista (PR-31). */
export type ProjectListItem = {
  readonly id: string;
  readonly name: string;
  readonly color: PaletteKey;
  /** `null` es «Sin cliente». */
  readonly client: ClientView | null;
  readonly isPublic: boolean;
  readonly archived: boolean;
  /** Las tareas activas (PR-38). */
  readonly activeTaskCount: number;
};

/** `/proyectos`: reemplaza a `ProjectCatalog`. */
export type ProjectListView = {
  readonly canCreateClient: boolean;
  readonly canCreateProject: boolean;
  readonly canCreateTag: boolean;
  /** PR-112, hasta P5: las activas, en orden alfabético; vacío sin `tag.view`. */
  readonly tags: readonly TagRef[];
  /** Los clientes activos, para «Nuevo proyecto». Orden alfabético. */
  readonly clients: readonly ClientView[];
  /** Los que `project.view` deja ver, activos y archivados, por `compareNames`. */
  readonly projects: readonly ProjectListItem[];
};

/**
 * D-P1-7: lo que la columna muestra. Lo arma el service de `report`; la
 * pantalla de proyectos no conoce el alcance, solo su nombre.
 */
export type TrackedTimeView = {
  /** `everyone`: «Tiempo imputado»; `self`: «Tu tiempo». */
  readonly scope: "everyone" | "self";
  /** Segundos por id de proyecto; un proyecto sin horas no está. */
  readonly seconds: Readonly<Record<string, number>>;
};

/** D-P1-8: la página de un proyecto. */
export type ProjectPageView = {
  readonly project: ProjectSettings & {
    readonly client: (ClientView & { readonly archived: boolean }) | null;
    readonly isPublic: boolean;
    readonly archived: boolean;
  };
  /** `project.update` y no archivado (D-P1-2, D-P1-4). */
  readonly canUpdate: boolean;
  /** `task.create` y no archivado. */
  readonly canCreateTask: boolean;
  /** Activas, en orden alfabético. */
  readonly tasks: readonly TaskView[];
  /** Activos, en orden alfabético, para el formulario; vacío sin `canUpdate`. */
  readonly clients: readonly ClientView[];
};

// TrackingCatalog suma:
  /** D-P1-12: los activos, en orden alfabético, para TT-09; vacío sin `project.create`. */
  readonly clients: readonly ClientView[];

// ProjectActions suma:
  readonly updateProject: (
    input: UpdateProjectInput,
  ) => Promise<ActionResult<UpdateProjectResult>>;
```

- **Las salidas son tipos y no esquemas Zod**: las escribe el servidor.
- `ProjectCatalog`, `ProjectGroupView` y `ProjectView` se borran con
  `getProjectCatalog`. `ProjectRef`, `TrackingProjectView`, `TrackingGroupView`,
  `ProjectFilterCatalog` y los demás no cambian.
- **El código de error** sigue siendo `ActionErrorCode`: `validation` sale del
  `ZodError` y del nombre repetido, `not_found` de `ProjectError`, `forbidden`
  de `ForbiddenError`.

### 4.2 Repository (`src/modules/project/repository.ts`)

Suma a `projectRepository`:

```ts
/**
 * D-P1-3: el proyecto con la fila de miembro de `userId`, `for no key update
 * of project`. `undefined` si no está en el workspace.
 */
async lockProject(tx: Transaction, workspaceId: string, userId: string, id: string): Promise<ProjectWithViewer | undefined>;

/** D-P1-3: los campos que cambian, ya validados. Devuelve la fila como quedó. */
async updateProject(
  tx: Transaction,
  workspaceId: string,
  id: string,
  values: Partial<Pick<ProjectRow, "name" | "clientId" | "color" | "note" | "billableByDefault">>,
): Promise<ProjectRow>;

/** D-P1-6: la cantidad de tareas activas de cada proyecto del workspace; un proyecto sin tareas no está. */
async countActiveTasksByProject(tx: Executor, workspaceId: string): Promise<ReadonlyMap<string, number>>;

/** D-P1-8: las tareas activas de un proyecto. Sin orden: lo pone el service. */
async listActiveTasksOf(tx: Executor, workspaceId: string, projectId: string): Promise<TaskRow[]>;
```

Todas filtran por el `workspaceId` de la sesión. `lockProject` es
`findProject` con `.for("no key update", { of: project })`: el `left join` a
`project_member` no se bloquea. `updateProject` filtra por workspace e id y
lanza si no actualizó ninguna fila (no puede pasar con la fila bloqueada).
`countActiveTasksByProject` cuenta también las de proyectos archivados: la
columna «Tareas» se ve con «Archivados».

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

/** D-P1-6, PR-31, PR-61, PR-93: la lista de `/proyectos`. Reemplaza a `getProjectCatalog`. */
export async function getProjectList(actor: Actor): Promise<ProjectListView>;

/**
 * D-P1-8: la página de un proyecto, o `null` si no existe en el workspace o
 * `project.view` no lo deja ver. La página responde `notFound()` con `null`.
 */
export async function getProjectPage(
  actor: Actor,
  projectId: string,
): Promise<ProjectPageView | null>;
```

**`updateProject`**, en este orden:

1. `translatingNameTaken(projectRepository.isProjectNameTaken,
projectMessages.projectNameTaken, () => db.transaction(…))` (PR-91): el
   nombre repetido sale del `update`, fuera de la transacción, como en el alta.
2. `lockProject(tx, actor.workspaceId, actor.userId, input.id)`.
3. `undefined`, o `!can(actor, "project.view", projectResource(row))`, o
   `row.archivedAt !== null`: `throw new ProjectError("not_found",
projectMessages.projectUnavailable)`.
4. `assertCan(actor, "project.update", projectResource(row))`.
5. `changes = changedProjectFields(row, input)`, pura y exportada para su test
   de unidad: cada campo presente en `input` y distinto del de la fila. El
   cliente se compara con `sameId` (`lib/project-pair.ts`), sin distinguir
   mayúsculas, como la base; el resto, por igualdad. Vacío: devuelve `{ project:
settingsOf(row) }` sin escribir.
6. Si `changes.clientId` es un id: `findClient(tx, actor.workspaceId, id)`;
   `undefined` o archivado, `throw new ProjectError("not_found",
projectMessages.clientUnavailable)` (PR-83).
7. `updated = updateProject(tx, …, changes)`; `recordAudit` de §4.6; devuelve
   `{ project: settingsOf(updated) }`.

`settingsOf(row)` arma `ProjectSettings` con `paletteKeyOf(row.color, row.id)`.

**`getProjectList`**: una transacción `repeatable read` con `listClients`,
`listAllProjects`, `countActiveTasksByProject` y, con `tag.view`,
`listActiveTags`; el filtro `project.view` sobre cada proyecto; el cliente de
cada uno con `clientOf` (`service.ts:442-455`), que ya lanza si falta en la
foto; `sortedByName`. `canCreate*` como hoy. **`readCatalog` deja de tener dos
usos**: queda solo para `getTrackingCatalog`, y su parámetro `access` puede
quedar fijo en `project.track` (lo decide `backend-dev`).

**`getProjectPage`**: `findProject` (sin bloqueo); `undefined` o sin
`project.view`, `null`. Después, en una transacción `repeatable read`: el
cliente del proyecto con `findClient` (con su archivado), las tareas activas con
`listActiveTasksOf` y, si `canUpdate`, los clientes activos con `listClients`.
`canUpdate = row.archivedAt === null && can(actor, "project.update", …)`;
`canCreateTask = row.archivedAt === null && can(actor, "task.create", …)`.

**`createProject`**: sin cambios de reglas; su `attempt` y su `replayed`
devuelven `{ project: createdOf(row) }` (D-P1-12). `toProjectView` se borra.

**`getTrackingCatalog`**: suma `clients`: los de `read.clients` sin archivar,
`sortedByName`, si `can(actor, "project.create", …)`; si no, `[]`.

### 4.4 El tiempo imputado (`src/modules/report/`)

```ts
// repository.ts, en reportRepository, al final:
/**
 * D-P1-7: los segundos de las entradas cerradas de `scope` con proyecto, por
 * proyecto, sin rango. Una sentencia; sin orden.
 */
async totalsByProject(
  scope: ReportScope,
  tx: Executor = db,
): Promise<readonly { readonly projectId: string; readonly seconds: number }[]>;

// service.ts:
/**
 * D-P1-7: lo que muestra la columna de `/proyectos`, con el alcance de
 * `scopeOf` (ADR 0020). Sin `report.view`, el alcance propio vacío, sin leer.
 */
export async function getTrackedTimeByProject(actor: Actor): Promise<TrackedTimeView>;
```

- La consulta: `select project_id, sum(entrySeconds) from time_entry where
inScope(scope) and ended_at is not null and project_id is not null group by
project_id`, con `secondsOf` sobre cada suma. **`inScope` es la única
  traducción del alcance** (`repository.ts:208-220`): la función no arma su
  filtro de personas.
- El service: `report.view` con `can()`; `scopeOf(actor)`; una transacción
  `read only`; `scope.people.kind === "everyone"` da `"everyone"`, `"self"` da
  `"self"` (`"chosen"` no sale de `scopeOf`).
- **Sin `statement_timeout`**: es una lectura de página, como `PAGE_READ`.

### 4.5 Actions (`src/modules/project/actions.ts`)

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
const listOptions = {
  paths: [{ path: "/proyectos", type: "layout" }],
  messages,
} as const; // createClient, createTask, createTag
const projectOptions = { paths: [{ path: "/", type: "layout" }], messages } as const; // createProject, updateProject
```

Con los `messages` de hoy (`forbidden` y `unexpected` del módulo). El
comentario de las altas no cambia.

### 4.6 Auditoría

| Acción           | `entity`  | `entityId`      | `previousValue`                           | `nextValue`                           | Cuándo                     |
| ---------------- | --------- | --------------- | ----------------------------------------- | ------------------------------------- | -------------------------- |
| `project.update` | `project` | id del proyecto | los campos que cambiaron, con su anterior | los mismos campos, con su valor nuevo | solo si algún campo cambia |

Con `...auditActorOf(actor)`. Las claves son las del esquema de Drizzle
(`name`, `clientId`, `color`, `note`, `billableByDefault`). Ejemplo, un
renombre: `{"name":"Viejo"}` → `{"name":"Nuevo"}`.

### 4.7 Las respuestas de `updateProject`

| Situación                                                                               | Código                 | Mensaje                                                                                                                | Reintentar |
| --------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| Cambió algún campo                                                                      | ok                     | —                                                                                                                      | —          |
| Nada distinto de lo guardado                                                            | ok, sin escribir       | —                                                                                                                      | —          |
| Nombre vacío, largo o con el carácter nulo; nota larga; color fuera de lista            | `validation`           | PR-75, PR-76, el del carácter nulo, «La nota no puede superar los 3000 caracteres.», el primer problema del `ZodError` | no         |
| Nombre repetido para el cliente que queda (también por cambiar el cliente)              | `validation`           | PR-77, «Ya hay un proyecto con ese nombre para ese cliente.»                                                           | no         |
| Proyecto inexistente, de otro workspace, privado ajeno o archivado; membresía no activa | `not_found`            | PR-72, «Ese proyecto ya no está disponible.»                                                                           | no         |
| Cliente nuevo inexistente, de otro workspace o archivado                                | `not_found`            | PR-83, «Ese cliente ya no está disponible.»                                                                            | no         |
| Sin `project.update`                                                                    | `forbidden`            | PR-84, «No tenés permiso para hacer esto.»                                                                             | no         |
| Red o servidor                                                                          | `unexpected`           | «No se pudo guardar. Revisá la conexión y volvé a intentar.»                                                           | sí         |
| Sin sesión                                                                              | redirección a `/login` | —                                                                                                                      | —          |

## 5. Contrato de frontend

### 5.1 Rutas

- **`src/app/(app)/proyectos/page.tsx`**: `requireSession()`;
  `projectsSearchParams.safeParse(await searchParams)` (lo inválido, a su valor
  por omisión, D-P1-6); `Promise.all` de `getProjectList(session.actor)` y
  `getTrackedTimeByProject(session.actor)`; `ProjectsScreen` con la lista, los
  totales, `filter`, `search`, `durationFormat={timeSettingsOf(session).formats.duration}`
  y `{ createClient, createProject, createTask, createTag }`. Solo compone.
- **`src/app/(app)/proyectos/[id]/page.tsx`**, nueva: `requireSession()`;
  `projectPageParams.safeParse(await params)`, y si falla, `notFound()`;
  `getProjectPage`; con `null`, `notFound()`; `ProjectPage` con la vista y `{
createTask, updateProject }`. `PageProps<"/proyectos/[id]">`, con `params`
  como promesa (leer la guía de `node_modules/next/dist/docs/` antes).
- **`[id]/not-found.tsx`**, nuevo: `<h1>` «Ese proyecto ya no está disponible.»
  y el enlace «Volver a Proyectos».
- **`[id]/loading.tsx`**, nuevo: un esqueleto como el de la lista
  (`ProjectsSkeleton`), con «Cargando el proyecto».

### 5.2 La lista (`project/components/projects-screen.tsx`)

- La cabecera de hoy (título y las tres altas), sin cambios.
- **Debajo, `ProjectList`** (cliente, nuevo, `project-list.tsx`): a la
  izquierda el buscador —`<Input type="search">` con la etiqueta accesible
  «Buscar proyecto o cliente» y el ícono de búsqueda—, a la derecha el filtro
  «Estado» con la forma de `StatusFilter` de `/equipo` (un `Select` con «Activos»,
  «Archivados» y «Todos»); y la tabla.
- **La tabla**: `<table>` con `<caption className="sr-only">` «Proyectos» y las
  cinco columnas de D-P1-6 en ese orden; en la primera, el punto (decorativo,
  `aria-hidden`) y un enlace con el nombre a `/proyectos/<id>`, y con «Todos»,
  la marca «Archivado» de un archivado; «Tareas» y la columna de tiempo,
  alineadas a la derecha y con cifras tabulares. En pantallas angostas, la tabla
  se desplaza en horizontal dentro de su contenedor.
- **El estado**: `search` en estado local, inicializado con el de la página. Al
  escribir, filtra y llama a `window.history.replaceState` con `projectsHref`;
  al elegir un estado, `router.push(projectsHref({ filter, search }))` en una
  transición con el valor optimista, como `StatusFilter`.
- **La sección de etiquetas** sigue debajo, sin cambios (hasta P5).
- **`ProjectNoticeRegion`** sigue entre la cabecera y la lista.

### 5.3 El modelo de la lista (`project/components/project-list-model.ts`, nuevo)

Puro, con su test:

```ts
export type ProjectListEmpty = "none" | "noActive" | "noArchived" | "noMatches";

/** D-P1-6: las filas que muestra el filtro y la búsqueda, y el vacío que corresponde. */
export function projectListRows(
  projects: readonly ProjectListItem[],
  filter: ProjectFilter,
  search: string,
): { readonly rows: readonly ProjectListItem[]; readonly empty: ProjectListEmpty | null };

/** PR-95: «Activos» y la búsqueda vacía son `/proyectos`; si no, los parámetros que difieren. */
export function projectsHref(state: {
  readonly filter: ProjectFilter;
  readonly search: string;
}): string;
```

- **La búsqueda** recorta, normaliza con `normalizeSearch` y busca por
  subcadena en el nombre del proyecto y en el del cliente.
- **El vacío** se decide en este orden: sin ningún proyecto, `none` (PR-85); con
  búsqueda y sin filas, `noMatches`; sin búsqueda y sin filas, `noActive` o
  `noArchived` según el filtro. Con «Todos» y proyectos, nunca vacío.
- **`projectsHref`** codifica `buscar` con `URLSearchParams`; `estado` se omite
  con «Activos».

### 5.4 La página del proyecto (`project/components/project-page.tsx`, nuevo)

Composición de D-P1-8, dentro de `ProjectNoticesProvider`:

- **El encabezado**: el enlace «Volver a Proyectos» a `/proyectos`; el punto y
  el `<h1>` con el nombre; el cliente; «Archivado» si corresponde.
- **`<section aria-labelledby>` «Tareas»**: el `<h2>`, «Nueva tarea» con
  `canCreateTask` (el `NewTaskDialog` de hoy), y la lista o «Este proyecto no
  tiene tareas.».
- **`<section aria-labelledby>` «Configuración»**: `ProjectSettingsForm` con
  `canUpdate`; si no, `ProjectSettingsSummary` (solo lectura) y, si está
  archivado, «Los proyectos archivados no se editan.».
- **`ProjectNoticeRegion`** entre el encabezado y las secciones.

### 5.5 Los campos y el formulario

- **`project-fields.tsx`, nuevo**: `ProjectFields({ draft, onChange, clients,
mode })`, con `mode: "create" | "update"`. Los campos de D-P1-9 con sus
  etiquetas de hoy. `ColorField` recibe la ayuda por prop (solo en `create`).
  El selector de cliente arma sus opciones con «Sin cliente» primero, los
  `clients` y, en `update`, el cliente archivado del proyecto con
  `archivedClientLabel(name)`.
- **`project-settings-form.tsx`, nuevo**: el formulario de D-P1-9, con
  `useAction(updateProject, …)` y el aviso que sobrevive con la clave
  `"project-settings"` (`useSurvivingNotice`, `project-notices.tsx:113-123`).
  Al enviar arma el parche con los campos que difieren de la vista; sin
  ninguno, no llama a la action.
- **`project-settings-summary.tsx`, nuevo** (o dentro de `project-page.tsx`, lo
  decide `frontend-dev`): una lista de definición con los cinco campos.

### 5.6 El marco de los diálogos (`create-dialog.tsx`)

Se parte en dos, sin cambiar lo que se ve en `/proyectos`:

- **`CreateDialogFrame`**: el contenido de hoy —el formulario, el aviso con
  «Reintentar», «Cancelar», «Guardar» y la X—, controlado por `open` y
  `onOpenChange`, con la regla de no cerrar mientras viaja
  (`create-dialog.tsx:76-87`) y un `finalFocus` recibido.
- **`CreateDialog`**: el marco más el disparador y `useSurvivingNotice`, como
  hoy. Lo usan los cuatro diálogos de alta de `/proyectos` y de la página del
  proyecto.

El diálogo de TT-09 usa solo el marco, sin `useSurvivingNotice` (D-P1-10), con
`finalFocus` al disparador del selector.

### 5.7 TT-09 en el selector

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
saliendo igual, con la opción debajo.

**`project-picker.tsx`**:

- **Los `items`** de la primitiva suman, al final, un grupo `create` con la
  opción, que se dibuja sin rótulo de grupo y con el ícono de más, separado de
  los proyectos. `isItemEqualToValue` y `itemToStringLabel` miran `kind`.
- **`choose`**: con la opción de crear, cierra el popup y abre el diálogo con
  `option.name`; no llama a `onChange`.
- **`EmptyMessage`** pierde el enlace de TT-87: solo «No hay proyectos
  todavía».
- **El diálogo** (`new-project-from-picker.tsx`, nuevo): D-P1-10, con
  `ProjectFields` en `create`, los `clients` del catálogo, `useAction` sobre la
  action del proveedor y `useNewId`. En `onSuccess`, guarda la selección
  pendiente del selector y cierra.
- **La selección pendiente** (D-P1-11): estado del selector; un efecto la
  entrega con `onChange` cuando `catalogEntryOf(catalog, { projectId, taskId:
null })` deja de ser `null`, y la limpia. Se limpia también al abrir el
  selector, al cambiar `value` y al desmontar.
- **Solo lectura** (TT-92) sigue sin disparador y sin opción de crear.

**`tracking-catalog.tsx`**: `TrackingCatalogProvider({ catalog, createProject,
children })`; `useCreateProjectAction()` lanza fuera del proveedor, como
`useTrackingCatalog`.

### 5.8 El menú (`src/components/layout/app-nav.tsx`)

D-P1-15: una función `isCurrent(pathname, href)`: igualdad para `"/"`; para el
resto, igualdad o `pathname.startsWith(href + "/")`. La usan `aria-current` y
la clase.

### 5.9 Textos (`project/components/labels.ts`)

| Clave                               | Texto                                                              | Fuente        |
| ----------------------------------- | ------------------------------------------------------------------ | ------------- |
| `projectLabels.searchProjects`      | «Buscar proyecto o cliente»                                        | PR-31         |
| `projectLabels.statusFilter`        | «Estado»                                                           | PR-31         |
| `projectFilterNames`                | `{ activos: "Activos", archivados: "Archivados", todos: "Todos" }` | PR-31         |
| `projectLabels.columns`             | «Nombre», «Cliente», «Acceso», «Tareas»                            | PR-31         |
| `projectLabels.trackedEveryone`     | «Tiempo imputado»                                                  | D-P1-7        |
| `projectLabels.trackedSelf`         | «Tu tiempo»                                                        | D-P1-7        |
| `projectLabels.public`, `.private`  | «Público», «Privado»                                               | PR-16, PR-17  |
| `projectLabels.archived`            | «Archivado»                                                        | PR-31         |
| `projectLabels.noActive`            | «No hay proyectos activos»                                         | PR-89         |
| `projectLabels.noActiveHint`        | «Elegí «Archivados» o «Todos» en el estado para verlos.»           | PR-89         |
| `projectLabels.noArchived`          | «No hay proyectos archivados»                                      | D-P1-6        |
| `projectLabels.pickerNoMatches`     | sin cambios; la lista lo reusa                                     | TT-07, D-P1-6 |
| `projectLabels.backToProjects`      | «Volver a Proyectos»                                               | D-P1-8        |
| `projectLabels.tasksSection`        | «Tareas»                                                           | D-P1-8        |
| `projectLabels.noTasks`             | «Este proyecto no tiene tareas.»                                   | D-P1-8        |
| `projectLabels.settingsSection`     | «Configuración»                                                    | D-P1-8        |
| `projectLabels.archivedReadOnly`    | «Los proyectos archivados no se editan.»                           | D-P1-4        |
| `projectLabels.yes`, `.no`          | «Sí», «No»                                                         | D-P1-8        |
| `projectLabels.saved`               | «Cambios guardados»                                                | D-P1-9        |
| `projectLabels.projectNotSaved`     | «No se pudieron guardar los cambios.»                              | TT-90         |
| `projectLabels.loadingProject`      | «Cargando el proyecto»                                             | §5.1          |
| `projectLabels.pickerCreateProject` | «Crear proyecto»                                                   | TT-09         |
| `archivedClientLabel(name)`         | «{nombre} (archivado)»                                             | D-P1-9        |

`pickerGoToProjects` («Ir a Proyectos») **se queda**: lo usa el selector de
etiquetas (TT-88, `tag-picker.tsx:251`). `tasksLabel` y `newTaskLabel` siguen,
en la página del proyecto. Lo que usan otros módulos (`noClient`, `noProject`,
`pickerEmpty`, `projectTaskLabel`, los de etiquetas) no cambia.

## 6. Despliegue y producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones. Producción tiene un solo workspace,
«RunOne»; las consultas miran el más viejo, el de la sesión.

### 6.1 Antes del push

**Sin condición de base**: no hay migración. Una consulta **informativa**, con
`!`, para saber qué va a mostrar el filtro y si el formulario va a ver un
cliente archivado:

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

1. `/proyectos`: la tabla en «Activos», en orden alfabético; «Tiempo imputado»
   con el formato completo de producción; buscar un cliente; «Todos» y
   «Archivados» (si la consulta dio archivados); recargar conserva el filtro y
   la búsqueda; volver atrás deshace el filtro.
2. Abrir un proyecto: «Tareas» y «Configuración».
3. **Editar la nota de un proyecto y volver a dejarla como estaba**: dos
   constancias `project.update`, sin efecto final.
4. **TT-09 no se prueba en producción**: un proyecto creado no se puede borrar
   hasta P2. Lo cubren la e2e y, si hace falta, un preview.

### 6.3 Reversión

Volver a desplegar el `main` anterior. No hay datos que revertir: lo editado es
un valor válido de columnas que ya existían, y la constancia queda.

### 6.4 Previews y bases

Los previews usan la rama `preview` de Neon, con datos sintéticos. Si el
preview de la rama no entra por `BETTER_AUTH_URL`, TT-09 se verifica en local:
la e2e alcanza.

## 7. Reparto de archivos y orden

### backend-dev

- **Primero, el commit que fija tipos y firmas**, y avisa a `frontend-dev` y a
  `e2e-tester`: §4.1 entero, `project.update` en `can()` (§3), las firmas de
  §4.2 a §4.5 con cuerpos que compilan, `CreateProjectResult` nuevo,
  `TrackingCatalog.clients`, y los fixtures de los tests de `time-entry` con
  `clients: []`. Compila con `npm run typecheck`.
- `src/server/permissions/index.ts` y `permissions.test.ts` (§3, §9.1).
- `src/modules/project/schema.ts` y `schema.test.ts`.
- `src/modules/project/repository.ts`, `service.ts` y
  `service.integration.test.ts`; `changedProjectFields` y su test de unidad.
- `src/modules/project/actions.ts` y `actions.integration.test.ts`.
- `src/modules/report/repository.ts`, `service.ts` y su integración (§4.4).
- **El registro del slice**: `docs/slices/correcciones-fase2-p1-revisiones.md`.

### frontend-dev

Arranca con las preguntas 1 a 3 respondidas (§0).

- `src/app/(app)/proyectos/page.tsx`; `[id]/page.tsx`, `not-found.tsx` y
  `loading.tsx`, nuevos (§5.1).
- `src/modules/project/components/`: `projects-screen.tsx` y su test;
  `project-list.tsx`, `project-list-model.ts` y sus tests (nuevos);
  `project-page.tsx`, `project-fields.tsx`, `project-settings-form.tsx` y sus
  tests (nuevos); `new-project-dialog.tsx`, `create-dialog.tsx`,
  `color-field.tsx`, `labels.ts` (§5.2 a §5.6, §5.9).
- `picker-model.ts`, `project-picker.tsx`, `new-project-from-picker.tsx`
  (nuevo), `tracking-catalog.tsx` y sus tests (§5.7).
- `src/modules/time-entry/components/tracker-screen.tsx`,
  `calendar/calendar-screen.tsx`, `timesheet/timesheet-screen.tsx` y los tests
  que montan el proveedor (D-P1-13). Solo esas líneas: el resto de `time-entry`
  no se toca.
- `src/components/layout/app-nav.tsx` y su test (§5.8).

### e2e-tester

- `e2e/projects-page.ts`: la tabla, sus filas y columnas, el buscador, el
  filtro, la página del proyecto y sus secciones, el formulario.
- `e2e/projects.spec.ts`: los cuatro casos de §1 («Consecuencias») movidos a la
  tabla y a la página, sin cambiar lo que afirman de las altas.
- `e2e/database.ts`: lo que haga falta para sembrar un cliente archivado,
  leer las constancias `project.update` de un proyecto y el
  `billable_by_default` de una entrada.
- Los specs de §9.3, nuevos (`e2e/project-edit.spec.ts`,
  `e2e/project-list.spec.ts`, `e2e/project-from-picker.spec.ts`); confirma que
  fallan antes de la implementación.
- La suite entera, con los specs de hoy sin cambiar lo que afirman.

### parity-analyst

Correcciones fechadas, «_Corregido el <fecha>, P1_»:

- `time-tracker.md`: **TT-09** pasa a `adaptar`, con D-P1-10 y D-P1-11;
  **TT-87** (el vacío del selector ofrece «Crear proyecto» en lugar de «Ir a
  Proyectos», con `project.create`); **TT-13** (sigue fuera; su justificación
  remitía a TT-09); la lista de lo no construido de la fase 1 (al final,
  `:2183-2199`) con una nota de que TT-09 entró con P1.
- `timesheet.md`: **TS-88** (el mismo cambio de TT-87).
- `proyectos.md`: **PR-04** (su justificación remitía a TT-09; el atajo de
  cliente sigue para P3); **PR-12**, **PR-21** y **PR-30** (la edición en
  «Configuración» de la página del proyecto; un archivado no se edita);
  **PR-31** (lo construido: columnas, «Tiempo imputado» o «Tu tiempo» con el
  alcance del reporte, el filtro y el orden plano); **PR-55** y **PR-56**
  (`project.update`); **PR-85** (el vacío del selector); **PR-89** (los
  textos); **PR-95** (`estado` con historial, `buscar` sin pedido); §14.1, los
  identificadores de la fase 2 que P1 entrega.
- `fase2-mapa.md`, en «P1»: D-P1-1 con el ADR 0032 y el paralelo que habilita;
  en §3, el párrafo de «van en serie»; en §4, la fila del ADR 0032.
- `mejoras-pedidas.md`, mejora 2: hecha con P1.

### Lo que no toca nadie

`src/server/db/`, `drizzle/`, `src/server/session.ts`, `access.ts`, `entry.ts`,
`src/server/time/`, `team`, `workspace`, `profile` (salvo leer
`timeSettingsOf`), `mcp`, `report/export/`, `.github/`, `CLAUDE.md`.

### Orden

0. Las respuestas a las preguntas 1 a 3 (§0); la revisión del contrato y del
   ADR.
1. `backend-dev`: los tipos y las firmas, en un commit que compila. Avisa.
2. En paralelo: `backend-dev` con permisos, service, report y actions;
   `frontend-dev` con la lista, la página, el formulario y el selector;
   `e2e-tester` con el arnés y los specs; `parity-analyst` con las
   correcciones.
3. Las revisiones; correcciones; la e2e entera en una base nueva **y** en una
   que se reusa.

## 8. Criterios de aceptación

1. **Editar** (PR-12, PR-15, PR-21, PR-30): un admin manda `{ id, name, color,
note, billableByDefault, clientId }` con valores nuevos; la fila queda con
   ellos, `updated_at` avanza y hay una constancia `project.update` con los
   cinco campos que cambiaron en `previous_value` y `next_value`. El owner y el
   responsable, igual.
2. **Un parche** (D-P1-3): mandar solo `{ id, note }` cambia la nota y deja el
   resto igual; la constancia nombra solo `note`.
3. **Nada distinto** (D-P1-3): mandar los valores que ya tiene responde éxito
   con `ProjectSettings` iguales, sin tocar `updated_at` y sin constancia.
4. **Quién** (PR-55 … PR-57, PR-60): owner, admin y el responsable pueden;
   `project_manager`, `team_manager` y `member` que no son responsables reciben
   `forbidden` sin escribir; un `project_manager` responsable de **otro**
   proyecto, también; owner, admin y responsable inactivos reciben `not_found`
   (PR-72) sin escribir.
5. **El proyecto** (PR-72): inexistente, de otro workspace y archivado
   responden `not_found` con «Ese proyecto ya no está disponible.» sin escribir.
6. **El cliente** (PR-83, PR-98): pasar a un cliente archivado o de otro
   workspace responde `not_found` con «Ese cliente ya no está disponible.»; un
   proyecto con cliente archivado se renombra sin cambiar el cliente; pasar a
   «Sin cliente» (`null`) funciona.
7. **El nombre** (PR-75 … PR-77, PR-91): vacío, de 101 caracteres o con el
   carácter nulo, `validation` con su texto; repetido para el mismo cliente,
   PR-77; **cambiar el cliente** a uno que ya tiene un proyecto con ese nombre,
   PR-77; el mismo nombre con otro cliente, éxito.
8. **El color y la nota**: un color fuera de la paleta o `null`, `validation`;
   una nota de 3001 caracteres, «La nota no puede superar los 3000
   caracteres.».
9. **Dos a la vez** (D-P1-3): con la fila del proyecto tomada, dos ediciones de
   campos distintos esperan, terminan las dos y quedan los dos cambios; dos del
   mismo campo dejan el segundo, y la constancia del segundo tiene como
   anterior el valor del primero. **Lo que no espera**: con la fila tomada `for
no key update`, un alta de horas con ese proyecto y un alta de tarea en él
   terminan sin esperar.
10. **El facturable no toca entradas** (TT-14): con dos entradas del proyecto,
    cambiar el facturable por defecto no cambia el `billable` de ninguna; una
    entrada nueva con ese proyecto arranca con el valor nuevo.
11. **Revalidación** (D-P1-5): `updateProject` y `createProject` llaman a
    `revalidatePath("/", "layout")` con éxito y con error; `createClient`,
    `createTask` y `createTag`, a `revalidatePath("/proyectos", "layout")`.
12. **La lista** (PR-31, PR-61, PR-93): `getProjectList` trae activos y
    archivados que `project.view` deja ver, en el orden de `compareNames`, con
    su cliente y su cantidad de tareas activas; un privado ajeno no está para un
    member y sí para owner y admin; una membresía no activa no ve ninguno.
13. **El tiempo imputado** (D-P1-7): con entradas cerradas de dos personas en un
    proyecto y un timer corriendo en él, un admin recibe `everyone` con la suma
    de las dos cerradas; un member, `self` con la suya; el timer no suma; un
    proyecto sin horas no está en `seconds`; una membresía no activa recibe
    `self` vacío. La columna dice «Tiempo imputado» o «Tu tiempo», y muestra las
    duraciones con el formato del workspace (`0:00` sin horas en compacto).
14. **El filtro y la búsqueda** (PR-31, PR-89, PR-95): «Activos» por omisión;
    «Archivados» y «Todos», con «Archivado» en la fila; la búsqueda encuentra
    por proyecto y por cliente, sin acentos ni mayúsculas; recargar conserva los
    dos; volver atrás deshace el último filtro; escribir no hace pedidos al
    servidor; un `estado` inválido muestra «Activos».
15. **Los vacíos** (PR-85, PR-89): sin proyectos, «Todavía no hay proyectos»;
    con «Activos» y todo archivado, «No hay proyectos activos» y la sugerencia;
    con «Archivados» y ninguno, «No hay proyectos archivados»; búsqueda sin
    coincidencias, «Ningún proyecto coincide con la búsqueda.».
16. **La página del proyecto** (D-P1-8): el encabezado, «Tareas» con las activas
    y «Nueva tarea» según `task.create`, «Configuración» con el formulario o en
    solo lectura; archivado, en solo lectura con «Los proyectos archivados no se
    editan.» y sin «Nueva tarea»; un id que no es UUID, uno inexistente y un
    privado ajeno muestran el 404 propio; «Proyectos» queda marcado en el menú.
17. **El formulario** (D-P1-9): «Guardar» manda solo lo cambiado; mientras viaja
    y después muestra lo guardado, sin volver a lo anterior; anuncia «Cambios
    guardados»; con falla de red conserva lo escrito y ofrece «Reintentar», que
    guarda; con PR-77 no ofrece «Reintentar»; sin cambios no manda pedido; el
    cliente archivado del proyecto aparece con «(archivado)».
18. **El aviso que sobrevive** (D-P1-8): si el proyecto se archiva, o la persona
    deja de ser responsable, con el formulario a la vista, guardar muestra el
    aviso de PR-72 o de PR-84 en la región de la página, con el foco.
19. **TT-09** (D-P1-10, D-P1-11): con `project.create`, el selector de la barra,
    de una fila, de la planilla, del diálogo del calendario y de la edición
    masiva termina con «Crear proyecto», alcanzable con las flechas; elegirla
    abre «Nuevo proyecto» con el nombre de la búsqueda; guardar crea el proyecto
    y lo deja elegido; **un proyecto con el facturable por defecto marcado deja
    la barra facturable** (TT-14); en una fila, la entrada queda con el proyecto
    y su facturable; cancelar devuelve el foco al disparador y no elige nada;
    `Escape` en el diálogo anidado deja abierto el del calendario con su
    borrador; «Reintentar» después de una respuesta perdida deja un solo
    proyecto. Sin la membresía activa, no hay opción.
20. **El vacío del selector** (TT-87, TS-88): con el catálogo vacío, «No hay
    proyectos todavía», «Sin proyecto» y «Crear proyecto»; sin «Ir a
    Proyectos». El selector de etiquetas vacío sigue con «Ir a Proyectos».
21. **Lo que ya estaba** (PR-101 … PR-103): renombrar, cambiar el color y el
    cliente de un proyecto con entradas se ve en sus filas del rastreador y en
    el reporte, pasadas incluidas.
22. **El MCP**: `list_projects` devuelve lo mismo que antes para el mismo
    catálogo, sin `clients`.
23. **Las correcciones de paridad** de §7 están, fechadas.

## 9. Plan de tests

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores. Las de este slice, como mínimo, con el
test que la mata:

| Mutación                                                                               | La mata                                                                                         |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `allowsOnProject` sin el caso `project.update` (cae en `default: false`)               | §9.1 `permissions.test.ts`; criterio 4                                                          |
| `project.update` con `project.viewer !== null` en lugar de `isManager === true`        | §9.1, el miembro no responsable; criterio 4                                                     |
| `project.update` en `allowedRoles` solo con `["owner", "admin"]`                       | §9.1, el responsable `member`; criterio 4                                                       |
| El service sin la comprobación de archivado                                            | §9.2, criterio 5                                                                                |
| El cliente validado solo si es distinto de `null`, sin mirar el archivado              | §9.2, criterio 6                                                                                |
| El cliente validado aunque no cambie                                                   | §9.2, criterio 6 (renombrar con cliente archivado)                                              |
| Escribir y dejar constancia aunque nada cambie                                         | §9.2, criterio 3                                                                                |
| El parche como reemplazo (los campos ausentes a su valor por omisión)                  | §9.2, criterio 2                                                                                |
| Sin `lockProject` (lectura sin bloqueo)                                                | §9.2, criterio 9, con `queueBehindBarrier`                                                      |
| `lockProject` con `for update` en lugar de `for no key update`                         | §9.2, criterio 9, «lo que no espera», con `outcomeWhileHeld`                                    |
| `updateProject` sin `translatingNameTaken`                                             | §9.2, criterio 7 (sale `unexpected`)                                                            |
| `changedProjectFields` compara el cliente con `===`                                    | §9.1, su test con el id en mayúsculas                                                           |
| `totalsByProject` con su propio filtro de personas en lugar de `inScope`, o sin él     | §9.2, criterio 13, el member                                                                    |
| `totalsByProject` sin `ended_at is not null`                                           | §9.2, criterio 13, el timer                                                                     |
| `getProjectList` solo con activos                                                      | §9.2, criterio 12                                                                               |
| `projectListRows` sin buscar en el cliente, o sin `normalizeSearch`                    | §9.1, `project-list-model.test.ts`                                                              |
| `projectListRows` con `noActive` antes de `noMatches`                                  | §9.1, el orden de los vacíos                                                                    |
| La búsqueda con `router.replace` (pide al servidor)                                    | §9.3.2, ningún pedido a `/proyectos` al escribir                                                |
| `pickerView` ofrece la opción de crear sin `canCreateProject`                          | §9.1, `picker-model.test.ts`                                                                    |
| La opción de crear compara igual a «Sin proyecto» (sin `kind` en `isItemEqualToValue`) | §9.1, `project-picker.test.tsx`: con «Sin proyecto» elegido, la opción de crear no está marcada |
| El selector llama a `onChange` en `onSuccess`, sin esperar al catálogo                 | §9.3.3, la barra facturable con un proyecto facturable                                          |
| `createProject` sigue revalidando solo `"/proyectos"`                                  | §9.2, criterio 11; §9.3.3, la fila con el proyecto nuevo                                        |
| `app-nav` con igualdad exacta                                                          | §9.1, `app-nav.test.tsx` en `/proyectos/<id>`                                                   |
| `getProjectPage` sin el filtro `project.view`                                          | §9.2, el privado ajeno da `null`; §9.3.1, el 404                                                |

### 9.1 Unidad

- `permissions.test.ts`: `project.update` con cada rol, con y sin la marca de
  responsable, con `viewer` nulo, inactivo y de otro workspace; con un recurso
  de otra clase.
- `project/schema.test.ts`: `updateProjectInput` con cada campo ausente y
  presente, el color `null` rechazado, el nombre recortado y sus tres
  mensajes, `clientId: null`; `projectsSearchParams` con un `estado` inválido,
  repetido (arreglo) y un `buscar` de 101; `projectPageParams` con un id que no
  es UUID.
- `changedProjectFields` (en un `service.test.ts` o junto al modelo, lo decide
  `backend-dev`): cada campo igual y distinto; el cliente en mayúsculas igual.
- `project-list-model.test.ts`: §5.3, cada vacío y su orden, la búsqueda por
  cliente y sin acentos, `projectsHref` con cada combinación.
- `projects-screen.test.tsx` (reescrito, `renderToStaticMarkup`): la tabla con
  sus encabezados, «Tiempo imputado» y «Tu tiempo», el formato compacto y el
  completo, «Archivado» con «Todos», cada vacío, las altas según permiso, las
  etiquetas.
- `project-page.test.tsx`: las secciones según `canUpdate` y `canCreateTask`, el
  archivado, la lista de tareas y su vacío.
- `project-fields.test.tsx`: `create` con la ayuda del color y `update` sin
  ella; el cliente archivado con «(archivado)».
- `picker-model.test.ts`: la opción de crear al final con y sin búsqueda, con
  `canCreateProject` falso, con todo excluido, con el catálogo vacío; el vacío
  `noProjects` sin el permiso.
- `project-picker.test.tsx`: la opción en el marcado con permiso y no sin él;
  no marcada con «Sin proyecto» elegido; el vacío sin «Ir a Proyectos»; el
  modo de solo lectura sin opción.
- `tag-picker.test.tsx`: sigue con «Ir a Proyectos» (TT-88).
- `app-nav.test.tsx`: «Proyectos» marcado en `/proyectos/<id>`; «Inicio» no
  marcado en `/proyectos`.

### 9.2 Integración (Postgres)

- **`project/service.integration.test.ts`**, un `describe` nuevo para
  `updateProject`: los criterios 1 a 10 con `seedWorkspace`, `seedMember`,
  `seedClient`, `seedProject`, `seedTask`, `seedTimeEntry` y la lectura de
  `audit_log`.
  - **Criterio 9**, con `queueBehindBarrier`: la barrera toma la fila del
    proyecto `for no key update`; los corredores editan `note` y `color`, y en
    otro caso los dos `name`. Mutación: sin `lockProject`, el corredor no se
    traba. **Lo que no espera**, con `outcomeWhileHeld`: un alta de horas con el
    proyecto (por el service de `time-entry`) y `createTask` devuelven
    `resolved`. Mutación: con `for update`, quedan `blocked`.
  - Los casos de `getProjectCatalog` (criterio 9 del slice 9: PR-61, PR-62,
    PR-93, y el vacío) pasan a `getProjectList`, más los archivados y la cuenta
    de tareas (criterio 12).
  - `getProjectPage`: `null` para inexistente, otro workspace y privado ajeno
    de un member; la vista para owner y admin del privado; `canUpdate` y
    `canCreateTask` con archivado; `clients` vacío sin `canUpdate`.
  - `getTrackingCatalog`: `clients` con `project.create` y vacío sin él; los
    `toEqual` de hoy (`:1044`, `:1055`) suman el campo.
  - `createProject`: el resultado nuevo en el alta y en el reintento.
- **`project/actions.integration.test.ts`**: `updateProject` con cada fila de
  §4.7 (código y texto), sin sesión a `/login` sin escribir, y la revalidación
  del criterio 11 para las cinco actions; el reintento de una respuesta perdida
  —la action dos veces con lo mismo— deja **una** constancia.
- **`report`**, un `describe` nuevo para `getTrackedTimeByProject`: el criterio
  13 con dos personas, un timer, un proyecto sin horas, un proyecto archivado
  con horas (suma) y una entrada sin proyecto (no suma).

### 9.3 E2E (`chromium`)

Con el workspace compartido y la base que persiste: todo nombre lleva el
sufijo del recorrido, y el buscador de la lista se usa para aislar las filas del
recorrido (`uniqueSuffix`).

1. **La página del proyecto** (`project-edit.spec.ts`):
   - un owner abre un proyecto desde la tabla, cambia nombre, cliente, color,
     nota y facturable, guarda: «Cambios guardados», los campos con lo
     guardado, y en `/` la fila de una entrada sembrada con el nombre y el punto
     nuevos (PR-101 … PR-103, criterio 21); el reporte agrupa por el cliente
     nuevo;
   - un member responsable edita el suyo; un member que no lo es ve
     «Configuración» en solo lectura; un admin edita uno ajeno;
   - PR-77 con el aviso y sin «Reintentar»; con `dropActionRequests`, el aviso
     de red con «Reintentar» y lo escrito conservado; con `loseActionResponses`,
     «Reintentar» responde éxito y hay una sola constancia;
   - el aviso que sobrevive (criterio 18): `archiveProject` con la página
     abierta, guardar: PR-72 en la región con el foco; `revokeProjectManager`,
     PR-84;
   - un archivado sembrado: solo lectura, sin «Nueva tarea»;
   - «Nueva tarea» desde la página, y los dos casos de `projects.spec.ts:323` y
     `:345` movidos acá;
   - `/proyectos/no-es-un-id` y un id inexistente: el 404 con «Volver a
     Proyectos».
2. **La lista** (`project-list.spec.ts`):
   - la tabla con las cinco columnas para tres proyectos del recorrido; el orden;
     buscar por el nombre de un cliente; «Archivados» y «Todos» con un archivado
     sembrado; recargar conserva el filtro y la búsqueda; `page.goBack()`
     deshace el filtro;
   - **escribir no pide al servidor**: con la página cargada, escribir en el
     buscador no dispara ningún pedido a `/proyectos` (un ayudante de
     `e2e/network.ts` que los cuente); la URL tiene `buscar`;
   - el tiempo imputado: un admin ve la suma de dos personas sembradas en un
     proyecto propio del recorrido, «Tiempo imputado»; un member ve la suya,
     «Tu tiempo»;
   - el caso de `projects.spec.ts:243` (orden y «Sin cliente») pasa a la tabla.
3. **TT-09** (`project-from-picker.spec.ts`):
   - la barra: buscar un nombre nuevo, flecha hasta «Crear proyecto», Enter; el
     diálogo con el nombre; marcar «Facturable por defecto», Guardar: el
     disparador muestra el proyecto y el facturable de la barra está marcado;
     «Agregar» deja la entrada con el proyecto y facturable (mata la mutación de
     `onChange` inmediato);
   - una fila: crear desde su selector deja la entrada con el proyecto;
   - la planilla: una fila nueva toma el proyecto creado y su celda se puede
     escribir;
   - el diálogo del calendario: crear desde su selector y `Escape` en el
     anidado deja el del calendario abierto con su borrador; crear y guardar la
     entrada;
   - la edición masiva: crear desde su selector y aplicar;
   - cancelar devuelve el foco al disparador; «Reintentar» tras una respuesta
     perdida deja un solo proyecto con ese nombre;
   - una persona inactiva (`setMembershipStatus`) no ve la opción.

### 9.4 Lo que no se prueba

- **El vacío del selector en e2e** (criterio 20): la base de los e2e siempre
  tiene proyectos; lo cubren `picker-model.test.ts` y `project-picker.test.tsx`,
  como hoy TT-87.
- **El formato completo en la columna en e2e**: lo cubre el test de la
  pantalla con los dos formatos; el proyecto `duration-full` no suma un spec.
- **El humo de producción**: lo hace el usuario (§6).

## 10. Riesgos

- **El choque con E3**, que corre en paralelo: P1 no toca `team` ni
  `workspace`. Los dos pueden tocar `e2e/database.ts` (ayudantes nuevos al
  final) y, si E3 suma una acción, `src/server/permissions/index.ts` y su test:
  líneas vecinas en las tres tablas; el segundo en mergear rebasa. Ninguna
  migración: la `0021` es de E3.
- **El selector en seis lugares**: la opción de crear y el diálogo anidado
  dentro de dos diálogos (calendario, edición masiva) son lo nuevo de más
  riesgo de foco y de `Escape`. Lo cubren los e2e de §9.3.3, uno por lugar.
- **La selección pendiente depende de que el catálogo llegue** con la
  revalidación de la misma respuesta (D-P1-11). Si no llegara, el proyecto
  queda creado y no elegido, sin error: la persona lo elige a mano. El e2e de
  la barra lo detecta.
- **`TrackingCatalog` cambia de forma**: siete tests de `time-entry` suman
  `clients: []`. No cambian lo que afirman; si alguno lo hace, es una señal de
  que el campo se filtró a otro lado.
- **La columna de tiempo lee todas las entradas cerradas del alcance** en cada
  dibujo de `/proyectos`: con el volumen del plan Free son miles de filas
  agrupadas, una sentencia. Si pesa, el índice o un tope son de otro slice.
- **Dos lecturas sin snapshot común** (la lista y los totales): un proyecto
  creado entre las dos aparece con `0:00`; la siguiente revalidación lo corrige.
- **La lista en la base de los e2e** acumula cientos de proyectos de corridas
  anteriores (deuda del slice 9 hasta P2): los specs se aíslan con el buscador,
  y la tabla los dibuja todos.
- **Los e2e de `/proyectos` cambian de pantalla**: los cuatro casos movidos
  tienen que afirmar lo mismo que antes, en el lugar nuevo.
- **El 404 de un privado ajeno no revela que existe**: misma página para los
  cuatro casos (D-P1-8). La página de un proyecto es una puerta nueva a
  `project.view`; la revisión de seguridad lo mira.

## 11. Preguntas para el usuario

1. **¿Un proyecto se administra en su propia página, `/proyectos/[id]`, y
   clientes y etiquetas pasan a `/clientes` y `/etiquetas` cuando lleguen P3 y
   P5?** Es el ADR 0032, propuesto. La lista queda como lista (con el menú de
   archivar y borrar de P2), y la página del proyecto junta «Tareas», «Acceso»
   (P6) y «Configuración», como las pestañas de Clockify. Con eso, P2, P6 y P8
   pueden ir en paralelo después de P1, y P3, P4 y P5 después de P2. La
   alternativa es editar en un diálogo desde la fila y seguir con todo en
   `/proyectos`, con P2 … P7 en serie. **Recomendación: la página propia.**
2. **¿La columna de tiempo de `/proyectos` muestra lo que el reporte deja ver?**
   Owner y admin verían la suma de todo el equipo en cada proyecto («Tiempo
   imputado»); los demás, solo sus propias horas («Tu tiempo»), porque las
   horas de otras personas solo se leen por el alcance del reporte (ADR 0020).
   Es todo el tiempo, sin rango de fechas, y sin el timer que corre.
   Alternativas: mostrar la columna solo a owner y admin, o sacarla (PR-31 la
   pide, pero las columnas exactas de Clockify no están relevadas).
   **Recomendación: el alcance del reporte, con los dos encabezados.**
3. **¿«Crear proyecto» reemplaza a «Ir a Proyectos» en el selector vacío?**
   Con TT-09, «Crear proyecto» está siempre al final de la lista para quien
   puede crear; en el selector vacío, el enlace a `/proyectos` haría lo mismo
   por un camino más largo. Clockify pone «Crear proyecto» ahí. El selector de
   etiquetas sigue con «Ir a Proyectos» hasta P5. **Recomendación: sí,
   reemplazarlo.**
4. **¿Un proyecto archivado no se edita hasta restaurarlo?** Su página lo
   muestra en solo lectura; P2 trae «Restaurar». Es la regla que ya rige para
   crearle tareas. No frena la implementación: con la recomendación, la regla
   está en §4.3. **Recomendación: sí.**

## 12. Fuera de alcance

- **Archivar, restaurar y borrar proyectos** (PR-22, PR-24 … PR-26, PR-81,
  PR-92): P2, con el menú de la fila y el encabezado de la página.
- **Clientes** —editar, archivar, borrar, su pantalla, crear desde el diálogo de
  proyecto (PR-04 … PR-08, PR-86, PR-111)—: P3.
- **Tareas** —renombrar, hecha, borrar, el cambio de `task.create`—: P4, en la
  sección «Tareas».
- **Etiquetas** —su pantalla, editar, archivar, borrar—: P5.
- **Privados, miembros y responsables** (PR-17 … PR-19): P6, en la sección
  «Acceso». Hasta entonces la columna «Acceso» dice «Público» en todas.
- **Favoritos** (PR-27): P8.
- **Filtros de la lista por cliente o por acceso**, orden por otra columna y
  paginación: PR-31 los deja _no verificados_; no están pedidos.
- **El MCP**: crear o editar proyectos desde el asistente (D-P1-14).
- **La edición masiva de proyectos** (PR-32): de plan pago.
