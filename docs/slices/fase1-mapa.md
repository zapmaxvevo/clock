# Fase 1: mapa de slices

Qué queda de la fase 1 después del slice 1, en qué orden va y de qué depende
cada parte. No es un contrato: los contratos se escriben de a uno, en
`docs/slices/fase1-slice<n>-<nombre>.md`, cuando llega el turno del slice.

Fuentes: `docs/parity/time-tracker.md` y el contrato ya cerrado del
[slice 1](fase1-slice1-timer.md). Decisión de orden asociada:
[ADR 0004, núcleo de proyectos en la fase 1](../adr/0004-nucleo-de-proyectos-en-fase-1.md).

Decisiones del equipo que este mapa da por tomadas y no vuelve a abrir: no hay
duración máxima por entrada (P-08, P-12); zona horaria y formatos salen del
workspace hasta que exista el perfil (P-13); la ventana de la lista son 14 días
extendidos hacia atrás hasta el último día con entradas (TT-52 llega con la
paginación); las fechas futuras se aceptan (P-10).

## 1. Lo que falta de la fase 1

Cuatro bloques: el rastreador completo, el timesheet semanal, el calendario y
el perfil. Del rastreador, el slice 1 entregó el timer de punta a punta con una
entrada sin proyecto; queda todo el resto de `docs/parity/time-tracker.md`.

Los otros tres bloques **no tienen especificación de paridad todavía**. Cada uno
necesita su `docs/parity/<modulo>.md` escrito por `parity-analyst` antes de que
se pueda cerrar su contrato: sin relevamiento no hay identificadores que citar
ni criterios observables que escribir. Es una precondición, no un slice.

| Documento                   | Lo habilita      |
| --------------------------- | ---------------- |
| `docs/parity/perfil.md`     | slice 7          |
| `docs/parity/calendario.md` | slice 8          |
| `docs/parity/proyectos.md`  | slices 9, 10, 11 |
| `docs/parity/timesheet.md`  | slice 13         |

## 2. El problema de orden: proyectos

El selector de proyecto y tarea (TT-06 … TT-11), las etiquetas (TT-12) y el
facturable (TT-14, TT-15) son fase 1 en el plan, pero las entidades `project`,
`task`, `client` y `tag` son fase 2. El timesheet depende de proyectos más
fuerte todavía: su grilla es una fila por proyecto y tarea, así que sin
proyectos la pantalla no tiene de qué estar hecha.

**La decisión es adelantar un núcleo mínimo de esas entidades al final de la
fase 1**, en vez de empujar todo lo que depende de proyectos para después de la
fase 2. El razonamiento completo, con las alternativas que se descartaron, está
en el [ADR 0004](../adr/0004-nucleo-de-proyectos-en-fase-1.md). En este mapa se
usa en tres lugares:

- Los slices 2 a 8 son **todos los que no dependen de proyectos** y van primero.
  Ninguno queda bloqueado esperando al núcleo.
- Los slices 9 a 12 son el núcleo y lo que el rastreador puede hacer una vez que
  existe. El núcleo es un subconjunto estricto de la fase 2: tablas, reglas de
  acceso de lectura y un solo camino de creación. La administración completa de
  proyectos —asignaciones, estimaciones, estados, archivado masivo, tarifas,
  pantallas de cliente— sigue siendo fase 2.
- El timesheet queda último de la fase 1, después del núcleo.

El costo que esto paga es que el slice 9 necesita `docs/parity/proyectos.md`
relevado antes, aunque el módulo de proyectos se implemente recién en la fase 2.
Es trabajo que la fase 2 iba a hacer igual, adelantado.

## 3. El mapa

Cada slice es vertical: llega de la base a la pantalla y se puede desplegar
solo. El orden es de dependencia, no de tamaño.

| Slice | Nombre                                        | Depende de      |
| ----- | --------------------------------------------- | --------------- |
| 1     | El timer con una entrada sin proyecto (hecho) | —               |
| 2     | Modo manual                                   | 1               |
| 2b    | El reintento de «Iniciar»                     | 2               |
| 3     | Corregir horas y fecha de una entrada         | 2, 2b           |
| 4     | Continuar, duplicar, descartar y atajos       | 2, 2b, 3        |
| 5     | Semana y paginación                           | 2, 3            |
| 6     | Selección y acciones en masa                  | 3               |
| 7     | Perfil                                        | 5               |
| 8     | Calendario                                    | 3, 5, 7         |
| 9     | Núcleo de proyectos, clientes y tareas        | 2, 2b           |
| 10    | Selector de proyecto y tarea en el rastreador | 9               |
| 11    | Etiquetas y facturable                        | 9, 10           |
| 12    | Edición masiva de proyecto y etiquetas        | 6, 10, 11       |
| 13    | Timesheet semanal                             | 3, 5, 7, 10, 11 |

### Slice 2 — Modo manual

Cubre TT-16, TT-18, TT-19, TT-20, TT-21, TT-25, TT-30, TT-72, TT-73, TT-76,
TT-82. Sin cambios de esquema y sin acciones de permiso nuevas: la entrada
manual es una fila cerrada de `time_entry` creada con `timeEntry.own.create`.

Lleva además **una corrección sobre código ya entregado**: con P-10 cerrado a
favor de la paridad, una entrada con fecha futura quedaba fuera de la lectura
de `getTrackerState` por su cota superior y no se veía nunca. El extremo
superior de la ventana pasa a extenderse hasta el fin del día local de la
entrada más nueva, igual que el inferior ya se extiende hasta el último día con
entradas. Entró en el alcance del slice 2 por ser consecuencia directa de P-10.

Depende del slice 1. **Va primero porque es el agujero funcional más grande que
dejó el slice 1** —hoy solo se puede arrancar y detener— y porque construye los
intérpretes de duración y de hora de `src/server/time` que después reusan sin
duplicar los slices 3, 8 y 13.

Contrato: [`fase1-slice2-modo-manual.md`](fase1-slice2-modo-manual.md).

### Slice 2b — El reintento de «Iniciar»

Cubre TT-89 y TT-90 para «Iniciar», que hoy no se cumplen: reintentar un
arranque cuya respuesta se perdió cierra el timer que creó el primer intento y
abre otro. Sin cambios de esquema y sin acciones de permiso nuevas. Implementa
por primera vez el
[ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): el pedido lleva
un id que elige el cliente, y el servidor responde la fila que ya existe con
ese id en vez de crear otra. Arrastra la corrección del párrafo de TT-109 en el
documento de paridad, que afirma que arrancar es seguro de reintentar por el
índice único.

Depende del slice 2, que renombró la barra donde se genera el id. **Va entre el
2 y el 3 porque es un defecto de lo ya desplegado** y no espera a ninguna
funcionalidad nueva, y porque el 3 toca `startTimer` y `stopById`: es más
barato que el 3 arranque sobre la forma final de `startTimer`. El slice 4 reusa
lo que deja para continuar y duplicar.

Contrato:
[`fase1-slice2b-reintento-de-iniciar.md`](fase1-slice2b-reintento-de-iniciar.md).

### Slice 3 — Corregir horas y fecha de una entrada

Cubre TT-28, TT-29, TT-54 (horas y fecha; descripción ya está), TT-55, TT-56,
TT-75, TT-81, TT-110, TT-111 y TT-112 en las dos ediciones de horas. Sin
cambios de esquema. Acción de permiso: `timeEntry.own.update`, que ya existe.

Depende del slice 2: son los mismos intérpretes y la misma conversión de hora de
pared a instante, y **arranca con el slice 2 mergeado**, porque varios archivos
de su reparto los crea el slice 2. **Arranca también con el 2b mergeado**, que
deja `startTimer` en la forma sobre la que el 3 aplica su §4.5. **Va acá porque
una entrada que no se puede corregir deja a la carga manual a medio camino**: el
error de tipeo del slice 2 no tiene arreglo hasta este slice, salvo borrando y
volviendo a cargar.

Implementa dos divergencias contra Clockify, ya registradas en el documento de
paridad: TT-110, una entrada que el trío `{ date, start, end }` no puede
expresar sin truncarla queda con sus horarios en solo lectura; y TT-111, la
entrada que está corriendo no edita sus horarios desde la fila, sino su inicio
desde el contador.

Contrato: [`fase1-slice3-horas-y-fecha.md`](fase1-slice3-horas-y-fecha.md).

### Slice 4 — Continuar, duplicar, descartar y atajos

Cubre TT-57, TT-58, TT-65 y TT-26. Sin cambios de esquema. Permisos:
`timeEntry.own.create` para continuar y duplicar, `timeEntry.own.delete` para
descartar.

Depende del slice 2 (el atajo `m` conmuta el modo manual), del 2b (reusa su
implementación del ADR 0007) y **también del slice 3**, aunque no por datos: los
atajos se apagan dentro de los editores que el slice 3 crea, y los dos slices
tocan los mismos archivos de la fila, la lista y la barra. **Va acá porque son
las tres acciones de uso más frecuente de la lista y ninguna necesita nada nuevo
del modelo**; los atajos viajan con ellas porque `c` es «continuar» y `n`, `s` y
`m` ya tienen a quién llamar. TT-58 arrastra el pendiente P-14: la regla de
horas de la copia queda propuesta y aislada en una función hasta verificarla en
el workspace del equipo.

Extiende el [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md), que
trae el slice 2b, a continuar y duplicar: las dos altas llevan un id que elige
el cliente, para que «Reintentar» no duplique.

Contrato:
[`fase1-slice4-continuar-duplicar.md`](fase1-slice4-continuar-duplicar.md).

### Slice 5 — Semana y paginación

Cubre TT-47, TT-48 y TT-52, y el primer día de la semana por persona como dato
(PF-01, PF-16, PF-18). **Trae el único cambio de esquema de este tramo**: hoy
no existe ningún campo de inicio de semana en ninguna tabla y `weekBounds` de
`src/server/time` recibe el día de arranque por parámetro sin que nadie se lo
pueda dar. El slice agrega `membership.week_start`, por persona desde el
principio como piden TT-48 y PF-01, con lunes por omisión y sin pantalla para
cambiarlo. Se lee solo con `weekStartOf`. No hay un valor del workspace:
Clockify no lo tiene.

Depende de los slices 2 y 3, no solo del 1: la ventana que extiende es la del
slice 2, y el aviso de TT-108 que retira vive en la barra del slice 2 y en la
lista del slice 3. Del slice 4 no depende; comparte con él la lista y el estado
del rastreador, y su contrato asume el 4 mergeado antes. **Va acá porque cierra
la deuda que abre el slice 2**: con «Cargar más» y P-15, una entrada creada,
movida o detenida antes del tramo visible extiende la ventana hasta su semana,
y el aviso desaparece.

Trae el [ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md): la
ventana de la lista vive en la URL, para que lo cargado sobreviva a la
revalidación.

Contrato:
[`fase1-slice5-semana-y-paginacion.md`](fase1-slice5-semana-y-paginacion.md).

### Slice 6 — Selección y acciones en masa

Cubre TT-62, TT-64 y la parte de TT-63 que no depende de proyectos: descripción,
hora y fecha en bloque. Sin cambios de esquema. Permisos: los tres
`timeEntry.own.*` que ya existen, aplicados en bloque.

Depende del slice 3: la edición masiva de hora y fecha es la edición de una fila
repetida, y repetirla antes de tenerla resuelta en una sola fila duplica la
regla. **Va después de lo individual y antes de proyectos** para que el slice 12
sea solo agregar columnas al mismo diálogo. Arrastra P-07: falta confirmar si la
edición masiva del rastreador está en el plan Free.

### Slice 7 — Perfil

Identificadores de `docs/parity/perfil.md`. Resuelve P-13: zona horaria,
formato de hora y formato de fecha por persona. Cambia el esquema —las
preferencias van en una tabla propia, nunca como columnas de `user` (PF-03)— y
toca el único punto donde se lee la zona horaria: `trackerWorkspaceOf`, que el
slice 5 deja como el lugar que arma el workspace del rastreador.

**Del primer día de la semana le queda solo la pantalla.** El dato ya es por
persona desde el slice 5. El 7 lo muestra en `/perfil` en solo lectura, con la
nota de que lo administra el equipo (PF-01, PF-31), y respeta lo que fija el §2
del contrato del slice 5: no toca `membership.week_start` —ni la vuelve
nulable ni le suma un respaldo en `workspace`— y lo lee solo con `weekStartOf`.
Cambiarlo es de la pantalla de equipo, con `team.manage` (PF-17), que espera la
deuda de `ensureWorkspaceContext` (§5).

Depende del slice 5, que es el que introduce el primer día de la semana y
`weekStartOf`. **Va acá porque es el último bloque de la fase 1 que no toca
proyectos** y porque todo lo que se construya después —calendario y timesheet—
quiere leer la zona horaria y el inicio de semana de un solo lugar, no de dos.

### Slice 8 — Calendario

Identificadores de `docs/parity/calendario.md`. Depende del slice 3 (mover y
estirar un bloque del calendario es la misma mutación de horas que la edición en
línea), del slice 7 (la grilla se dibuja con la zona horaria de la persona) y
del slice 5 (el inicio de semana de la persona, que se lee con `weekStartOf`).

**Va antes del núcleo de proyectos, no después**: un calendario que dibuja las
entradas con su descripción y su horario ya es desplegable y útil, y el color
por proyecto se agrega con el slice 10 sin rehacer la grilla. Esperar al núcleo
solo retrasaría la pantalla.

Duplicar desde el calendario (CAL-69) es TT-58, del slice 4. El 4 va antes en el
orden; si no estuviera mergeado cuando arranque el 8, el menú sale sin
«Duplicar». La decisión que más pesa sobre el contrato es P-04 de
`calendario.md`: si el diálogo guarda todo o nada, descripción y horas, que hoy
son dos mutaciones, tienen que escribirse en una sola transacción.

### Slice 9 — Núcleo de proyectos, clientes y tareas

Identificadores de `docs/parity/proyectos.md`, relevado a nivel de entidad y de
reglas de acceso, con el reparto de su §14 rehecho por `parity-analyst` antes de
implementar. Trae las tablas `client`, `project`, `task`, `project_member` y
`task_assignee`, con claves compuestas que impiden en la base que una referencia
cruce workspaces; el filtro de acceso de TT-08 como `project.view` y
`project.track`; un solo camino de creación por entidad, en una pantalla
`/proyectos`; y las acciones `client.create`, `project.create`, `project.view`,
`project.track` y `task.create` en `can()`, que pasa a exigir el par acción y
recurso en el tipo y en tiempo de ejecución. Sin edición, archivado ni borrado:
eso es administración y sigue en la fase 2.

La decisión que este mapa dejaba abierta —`whoCreatesProjects` es configuración
del workspace y `can()` decide por rol— la cierra el
[ADR 0009](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md):
la configuración viaja en el recurso. En la fase 1 queda congelada en
`everyone` (P-18) y no entra en `can()`.

**No usa nada funcional de los slices 2 a 5, pero arranca con el 2 y el 2b
mergeados**: el 2 trae el arnés de tests de las actions, y el 2b deja el
algoritmo del ADR 0007 en `src/server/create-once.ts` y
`src/server/db/constraint-error.ts`, que el 9 importa para sus tres altas. Si
se trabaja en paralelo con el slice 5, sus migraciones se generan de nuevo
después del rebase. Como segundo módulo con actions, extrae a `src/server/`,
`src/lib/` y `src/hooks/` las piezas de las actions que hoy viven dentro de
`time-entry` (§5). **Va primero de los cuatro slices de proyectos porque es el
único que no se puede dividir más**: sin tablas no hay selector, sin selector no
hay etiquetas con sentido en la fila, y sin nada de eso no hay timesheet.

Le deja escritas al slice 10 las claves de `time_entry` hacia proyecto y tarea,
con una consecuencia que el 10 hereda como criterio: la base rechaza borrar un
proyecto con tareas usadas en entradas, y el borrado de la fase 2 son dos
sentencias en una transacción.

Contrato:
[`fase1-slice9-nucleo-de-proyectos.md`](fase1-slice9-nucleo-de-proyectos.md).

### Slice 10 — Selector de proyecto y tarea en el rastreador

Cubre TT-06, TT-07, TT-08, TT-10, TT-11, TT-70, TT-77, TT-87, TT-104, y completa
TT-49 y TT-50 con el punto de color. TT-09 queda fuera de la fase 1. Cambia el
esquema: `project_id` y `task_id` nulables en `time_entry`.

Depende del slice 9. **Va inmediatamente después porque es lo que vuelve útil al
núcleo**: un proyecto que no se puede elegir en la barra no cambia nada de lo
que la persona ve.

### Slice 11 — Etiquetas y facturable

Cubre TT-12, TT-14, TT-15, TT-78, TT-88 y TT-105. Cambia el esquema: tabla `tag`
y tabla de unión con `time_entry`, y columna `billable` en `time_entry` con su
valor por defecto tomado del proyecto. TT-13 queda fuera de la fase 1.

Depende del slice 10, porque el valor por defecto de facturable lo decide el
proyecto elegido (TT-14). **Va acá y no antes** porque sin esa dependencia
resuelta el facturable arrancaría siempre en falso y habría que volver a tocarlo.
Por lo mismo, suma «facturable por defecto» al alta de proyecto del slice 9
(PR-21, decisión del equipo del 2026-10-03): sin eso, el valor del proyecto nace
en falso y nada antes de la fase 2 lo cambia. Si el slice queda grande, se parte en dos —etiquetas, facturable— sin cambiar el
orden.

### Slice 12 — Edición masiva de proyecto y etiquetas

Cubre el resto de TT-63: proyecto y tarea, etiquetas agregando o reemplazando, y
facturabilidad en bloque. Sin cambios de esquema.

Depende de los slices 6, 10 y 11. **Es el cierre del rastreador**: con este
slice `docs/parity/time-tracker.md` queda cubierto salvo lo marcado como fuera de
alcance (TT-09, TT-13, TT-33, TT-53, TT-59, TT-67, TT-83, TT-84).

### Slice 13 — Timesheet semanal

Identificadores de `docs/parity/timesheet.md`. Depende del slice 10 (la grilla es
una fila por proyecto y tarea), del slice 5 (la semana que muestra sale del
inicio de semana de la persona), del slice 7 (su zona horaria), del slice 3 (el detalle de una celda edita
horas como la fila) y del slice 11 (la entrada que crea una celda lleva
facturable y etiquetas). Todos ya van antes en el orden.

La especificación de paridad dejó la escritura de una celda entera como
propuesta: la documentación pública no dice qué hace una celda que ya tiene
entradas ni a qué hora empieza la que crea una vacía. Antes del contrato hacen
falta las respuestas del workspace (P-12 de `timesheet.md`) y una decisión de
arquitectura: TS-32 propone que el fin de la entrada de una celda sea el inicio
más la duración y no una hora de pared convertida, un tercer camino de
instantes que el ADR 0005 cierra y que tiene que entrar por un ADR propio.

**Va último de la fase 1** porque es el único bloque cuya pantalla entera depende
de proyectos: adelantarlo obligaría a dibujar una grilla de una sola fila «Sin
proyecto», que no es una versión reducida de la funcionalidad sino otra cosa.

## 4. Lo que no entra en la fase 1

Queda fuera por el documento de paridad, no por este mapa: TT-09 y TT-13 (crear
proyecto o etiqueta desde el selector, son del módulo de proyectos), TT-33
(contador en el título de la pestaña), TT-53 (agrupación de entradas similares,
P-09), TT-59 (dividir entrada, P-05), TT-67 (bloqueo por aprobación, P-02),
TT-83 (redondeo, P-03) y TT-84 (campos obligatorios y forzar timer, P-01).

Siguen abiertos y no los cierra ningún slice de este mapa: P-01 a P-07, P-09 y
P-14.

Los que sí están cerrados: P-08, P-11 y P-12 en el slice 1; P-13 en el slice 7.
**P-10 se cerró el 2026-10-02 a favor de la paridad**: Clockify acepta las
fechas futuras y nuestro rechazo era una divergencia propia, así que se revirtió.
El arrastre de esa decisión sobre la lectura de la lista entró en el slice 2.

## 5. Deudas que el mapa arrastra

- **El slice 2 crea entradas que el slice 5 recién hace visibles, por abajo.**
  Una entrada manual con fecha anterior al tramo que la lista extiende hacia
  atrás existe en la base y no aparece en la lista; el slice 2 avisa y el slice
  3 avisa igual al mover una fila. **El slice 5 la cierra**: la ventana se
  extiende hasta la semana de la entrada y el aviso se retira (P-15). Por arriba
  no queda deuda desde el slice 2.
- **La deuda de seguridad del slice 1 sigue viva**: `ensureWorkspaceContext`
  crea la membresía de cualquiera que pase el login, así que revocar borrando la
  membresía no funciona. Es condición del slice que traiga `team.manage`, que es
  de la fase 2. Por eso el slice 5 trae el primer día de la semana sin pantalla
  para cambiarlo.
- **La divergencia TT-110 que implementa el slice 3 no tiene fecha de cierre.**
  Está registrada en `docs/parity/time-tracker.md`: una entrada que el trío no
  puede expresar queda con sus horarios en solo lectura. Cerrarla pide un
  selector de fecha para el fin, y no está planificado en ningún slice de este
  mapa.
- **El alta manual sigue sin «Reintentar»** (TT-109). Desde el slice 2b
  «Iniciar», y desde el 4 continuar y duplicar, lo ofrecen sin duplicar por el
  ADR 0007; aplicarlo también al alta manual es una decisión de paridad
  pendiente del equipo.
- **`time-entry` conserva sus copias de las piezas de las actions** que el
  slice 9 extrae: `ActionResult`, `failure` y `handle` (a `src/server/action.ts`),
  el `refine` del carácter nulo (a `src/lib/text.ts`) y `useEntryAction` (a
  `src/hooks/use-action.ts`). Conviven dos versiones hasta que **el próximo
  slice que toque las actions de `time-entry` después del merge del 9** migre el
  módulo a las compartidas y borre las suyas.

Y una que dejó de serlo: **la cobertura de `actions.ts`**, que los slices 1 y 2
arrastraban como hueco, se cerró el 2026-10-02 con
`src/modules/time-entry/actions.integration.test.ts`. Ya no es deuda sino
obligación: toda action nueva suma sus casos de traducción de errores, de
permiso y de revalidación en el `actions.integration.test.ts` de su módulo, con
el mismo arnés.
