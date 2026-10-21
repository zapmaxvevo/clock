# Paridad: configuración del workspace

Alcance de este documento: la pantalla de configuración del workspace —el
«Workspace settings» de Clockify—, qué ajustes tiene, cuáles existen en el plan
Free, cuáles entran en Clock y con qué forma, quién la ve y quién la cambia, y
qué le pasa al resto de la aplicación cuando un ajuste cambia. No cubre la
pantalla de equipo —roles, invitaciones, desactivar personas, transferir el
workspace (EQ-55 … EQ-59) y el primer día de la semana de cada persona (EQ-71)
son de [`equipo.md`](equipo.md)—, ni los ajustes de la persona —están en
[`perfil.md`](perfil.md)—.

Es la precondición de los slices de configuración de la fase 2. Escrito el
2026-10-16. El mismo día el usuario respondió workspace P-01 a P-08 con las
recomendaciones (sección 17), y cada comportamiento que dependía de una dice
cuál lo decidió.

Cada comportamiento lleva un identificador `WS-nn` para que lo citen el reviewer
de paridad y los flujos de Playwright, y una marca `replicar`, `adaptar` o
`fuera de alcance`. Las dos últimas llevan una línea de justificación. Las
referencias `TT-nn`, `PR-nn`, `PF-nn`, `TS-nn`, `RP-nn` y `EQ-nn` apuntan a los
otros documentos de paridad y no se reespecifican acá. Los pendientes de este
documento se citan como `workspace P-nn`.

## Fuentes y límites del relevamiento

Documentación pública del centro de ayuda de Clockify y referencia pública de su
API, consultadas el 2026-10-16:

- https://clockify.me/help/administration/workspace-settings (la página que
  describe la pantalla entera, sección por sección)
- https://clockify.me/help/track-time-and-expenses/workspaces
- https://clockify.me/help/administration/updates-to-clockify-free-plan
- https://clockify.me/help/administration/user-roles-and-permissions/who-can-do-what
- https://clockify.me/help/administration/hide-time
- https://clockify.me/help/administration/time-zones
- https://clockify.me/help/projects/creating-projects
- https://clockify.me/help/projects/managing-projects
- https://clockify.me/help/track-time-and-expenses/duration-format
- https://clockify.me/help/track-time-and-expenses/time-rounding
- https://clockify.me/help/track-time-and-expenses/required-fields
- https://clockify.me/help/track-time-and-expenses/force-timer
- https://clockify.me/help/track-time-and-expenses/lock-timesheets
- https://clockify.me/pricing
- https://docs.clockify.me/openapi.json (esquema `WorkspaceSettingsDtoV1`)

Dos citas vienen de [`equipo.md`](equipo.md), que las confirmó con el mismo
método: la de la página de perfiles en WS-08 (EQ-71) y la de la página de
admins en WS-38 (EQ-53).

**Método.** Toda cita marcada «Documentado» se confirmó con una segunda
consulta que pedía la cadena literal y FOUND con la oración, o NOT FOUND, porque
el resumidor de la herramienta inventa citas. Las oraciones largas quedaron
cortadas por el tope de la herramienta y van con «…». Lo que no pasó ese filtro
va como _no verificado_. Una ausencia —«la página no lo nombra»— se registra
como NOT FOUND y no como afirmación de la documentación.

**La página de precios no se usa para decidir el plan de un ajuste.** Las
cadenas existen (FOUND), pero el texto de la página no dice con certeza en qué
columna de la tabla comparativa cae cada una: la herramienta devolvió para la
misma fila planes distintos según la pregunta. Solo se usa cuando coincide con
una página de ayuda, y lo demás queda _no verificado_.

**La API dice más que el centro de ayuda y no se toma como pantalla.**
`WorkspaceSettingsDtoV1` tiene, entre otras, `adminOnlyPages` (`PROJECT`,
`TEAM`, `REPORTS`), `canSeeTimeSheet`, `canSeeTracker`, `defaultBillableProjects`,
`durationFormat` (`FULL`, `COMPACT`, `DECIMAL`), `isProjectPublicByDefault`,
`onlyAdminsCreateProject`, `onlyAdminsCreateTask`, `onlyAdminsCreateTag`,
`onlyAdminsSeeAllTimeEntries`, `onlyAdminsSeePublicProjectsEntries`,
`onlyAdminsSeeBillableRates`, `onlyAdminsCanChangeBillableStatus`,
`onlyAdminsSeeDashboard`, `onlyAdminsSeeProjectStatus`, `forceProjects`,
`forceTasks`, `forceTags`, `forceDescription`, `timeTrackingMode` (`DEFAULT`,
`STOPWATCH_ONLY`), `timeRoundingInReports`, `round`, `lockTimeEntries`,
`lockTimeZone`, `projectFavorites`, `favoriteEntriesEnabled`, `weekStart`,
`workingDays`, `workCapacity`, `numberFormat`, `currencyFormat`, `projectLabel` y
`taskLabel`, todas confirmadas con FOUND. La descripción del esquema dice además
que el formato de duración reemplaza a dos booleanos viejos: completo es
`trackTimeDownToSecond` en verdadero y compacto en falso. Eso dice qué
parámetros existen, no cómo se ven; se cita como indicio y nunca como
«Documentado» de una pantalla.

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Lo que solo se ve con la sesión del usuario va a
workspace P-09, con qué mirar. Dos datos de sesiones anteriores sí sirven acá,
de las respuestas de timesheet P-12 (2026-10-07): la planilla del workspace
muestra las duraciones como `06:00:00` y `00:00:00`, y sus columnas van de «lu»
a «do» (respuesta 13). La referencia de paridad es el workspace de la empresa
con el plan que tenga (timesheet P-17).

### Lo que el plan Free deja fuera de este módulo

Citas textuales, todas confirmadas con FOUND:

| Qué                                           | Qué dice la documentación                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Acceso a los ajustes según el plan            | «Access to certain settings depends on your subscription tier, as some features require a paid plan.»                          |
| Quién crea proyectos y clientes               | «This setting is set to Anyone and can not be changed on a Free plan.»                                                         |
| Quién crea cada entidad                       | «Every workspace member can create clients, projects, tasks, and tags.»                                                        |
| Editar horas de otros                         | «Users can edit only their own time entries (the "Who can edit time for others" permission is set to "No one").»               |
| Proyectos privados                            | «All projects on the Free plan are Public (visible to all workspace members).»                                                 |
| Facturable e importes                         | «The ability to toggle time entries as billable/non-billable and assign financial amounts to projects is part of paid plans.»  |
| Qué ve un member de las horas de otros        | «Hiding tracked time and expenses from other users in your workspace is a paid feature» …                                      |
| Campos obligatorios                           | «Required fields is a paid feature, which you can enable by upgrading your workspace to any of the paid plans.»                |
| Forzar timer                                  | «Force timer is a paid feature available by upgrading to the Pro or Enterprise plan.»                                          |
| Bloquear horas                                | «This is a paid feature available on Standard, Pro, and Enterprise plans.»                                                     |
| Redondeo                                      | «Time rounding is a paid feature, which you can enable by upgrading your workspace to Standard, Pro, or Enterprise paid plan.» |
| Formato de duración decimal                   | «Decimal format is a paid feature you can enable by upgrading your workspace to any of our paid plans.»                        |
| **El formato de duración, en cualquier plan** | «you can change the duration format in the Workspace settings on any plan, including the free plan.»                           |

**La consecuencia que más pesa:** de todo lo que la pantalla tiene, lo que un
workspace Free puede cambiar y Clock no tiene todavía se reduce a tres cosas: el
nombre, el logo y el formato de duración. El primer día de la semana por
defecto y los valores de la sección General no tienen una frase de plan, ni a
favor ni en contra. Los permisos están fijos en Free, la mitad de la pestaña de
registro de tiempo es paga, y las secciones de finanzas, planificación,
actividad, kiosco y seguridad son de módulos que Clock no tiene.

## Vocabulario

| Clockify           | Clock (interfaz en español) |
| ------------------ | --------------------------- |
| Workspace settings | Configuración del workspace |
| General            | General                     |
| Time tracking      | Registro de tiempo          |
| Permissions        | Permisos                    |
| Workspace name     | Nombre del workspace        |
| Logo               | Logo                        |
| Week start         | Primer día de la semana     |
| Duration format    | Formato de duración         |
| Full / Compact     | Completo / Compacto         |
| Regular user       | Miembro                     |

`adaptar`: la interfaz va en español y toda la copia visible se traduce; no se
vuelve a justificar en cada comportamiento. «Workspace» no se traduce: la
interfaz ya lo usa así («Todas las personas del workspace», en el reporte).
«Completo» y «Compacto» son los nombres que ya usa el perfil (PF-20, PF-31).

La regla de **una redacción por causa** de `time-tracker.md` vale acá: este
documento reusa los mensajes del perfil y del rastreador y escribe solo los de
causas nuevas (sección 9).

## 1. La pantalla

**WS-01 Dónde está** — `adaptar`
Documentado: se llega desde el menú del nombre del workspace, «Click on the
three-dot icon next to your workspace name» y «Select Workspace settings», y la
pantalla tiene una barra lateral de secciones —«Select Time tracking from the
sidebar»—.
Acá: ruta `/configuracion` dentro del shell con sesión, con el enlace
«Configuración» al final de la navegación, visible solo para quien puede
cambiarla (WS-49), igual que «Equipo» aparece solo con `canManageTeam`. El
título de la pantalla es «Configuración del workspace». Justificación: la ruta
es nuestra y en castellano, como `/equipo` y `/perfil`, y el encabezado de Clock
muestra el nombre del workspace como texto, sin menú propio.

**WS-02 Quién la ve y quién la cambia** — `replicar`
Documentado: «Only Workspace owners and Admins can see and edit the Workspace
settings.», y del owner y los admins, «They are responsible for managing
workspace settings, user permissions, and overall workspace administration.»
Ver y cambiar van juntos: quien entra puede cambiar todo lo que la pantalla
ofrece. Es la acción `workspace.settings.update`, que ya existe en `can()` para
`owner` y `admin` y no la usa nadie. Los otros tres roles no entran (WS-50).

**WS-03 Las secciones** — `adaptar`
Según el índice de la página de ayuda, la pantalla tiene once secciones
—General, Time tracking, Finances, Time planning, User activity, Kiosk,
Security, Accounts, Permissions, Integrations & add-ons, Import/Export—.
Acá hay **dos**: «General» y «Registro de tiempo», con lo que la sección 15
deja en la fase 2. No hay «Permisos»: «quién crea proyectos y clientes» queda
fijo (workspace P-03), y que cualquier miembro cree tareas es un cambio de
`task.create`, no un ajuste (workspace P-04). Justificación: las demás
secciones configuran módulos que Clock no tiene o ajustes de plan pago
(secciones 4 a 6); una sección vacía o llena de controles bloqueados es
configuración que no configura nada.
_Corregido el 2026-10-20, WS1 (D-WS1-7 del
[contrato de WS1](../slices/fase2-ws1-configuracion.md))_: las dos secciones no
llegan juntas. WS1 trae solo «General», con el nombre, porque «Registro de
tiempo» sin su selector sería la sección vacía que este punto descarta; la
segunda llega con WS2b y su selector de formato. La pantalla queda armada como
una lista de secciones, cada una con su título, para que WS2b sume la segunda y
E4 un control a la primera.
_No verificado_: cómo se ven en un workspace Free las secciones y los ajustes
que el plan no habilita —ocultos, bloqueados con candado o con un aviso para
mejorar el plan— (workspace P-09).

**WS-04 Cada cambio se guarda solo** — `adaptar`
Clockify no documenta si la pantalla guarda campo por campo o con un botón.
Acá, como el perfil (PF-32): cada selector guarda al cambiar, y el nombre al
perder el foco o con Enter; `Esc` descarta lo escrito, como en PF-07. Elegir el
valor que ya estaba guardado no escribe nada. Cada cambio escribe el audit log
con el valor anterior y el nuevo. Justificación: es la convención que el
rastreador y el perfil ya fijaron, y una pantalla de la aplicación que guardara
distinto sería la única.
_No verificado_ (workspace P-09).

## 2. General

**WS-05 Nombre del workspace** — `replicar`
Documentado: «Workspace Name: Displays your current workspace avatar/company
logo and name, along with an Edit button to change them.», y en la página de
workspaces, «Change workspace name». Acá es un campo de texto, «Nombre del
workspace», que guarda como dice WS-04. Se guarda recortado; las validaciones
están en la sección 9.
_No verificado_: el largo máximo y si Clockify acepta un nombre vacío
(workspace P-09). El tope de 100 caracteres es nuestro, el mismo que el de los
nombres de proyecto y de persona (PR-54, PF-35).

**WS-06 Dónde se ve el nombre** — `adaptar`
En Clock el nombre está en un solo lugar: el encabezado del shell, a la
izquierda de la navegación (`src/app/(app)/layout.tsx`). Hoy dice lo que diga
la base: el valor con que se creó el workspace es «Workspace»
(`DEFAULT_WORKSPACE_NAME`, `src/modules/workspace/service.ts`) y ninguna pantalla
lo cambia. El PDF del reporte no lo muestra. Justificación: Clockify lo muestra
también en el selector de workspaces, que acá no existe porque hay uno solo.

**WS-07 Logo del workspace** — `fuera de alcance`
Decidido el 2026-10-16 (workspace P-01): **no entra** hasta que haya un segundo
uso; lo que sigue queda como la propuesta para entonces.
Documentado: «Adding an image or logo for your workspace helps with your
company’s branding, as this image will appear on reports and invoices.», y en
la página de workspaces, «Upload company logo (which will be displayed in
branded reports)». No dice formatos ni tamaños.
Propuesta, si entra: un archivo PNG o JPEG de hasta 1 MB, que se muestra en el
encabezado al lado del nombre, y se quita con «Quitar logo». No es SVG: un SVG
subido es un documento con scripts, y servirlo exige una sanitización que no
hace falta para un logo. La columna `workspace.logo_url` existía, vacía, y se
borró (workspace P-05).
Justificación de la marca: Clockify lo pone en reportes y facturas, que acá son
el PDF del reporte y nada; sin decidir dónde va, no hay comportamiento que
replicar. **Trae infraestructura nueva**: subir archivos pide un almacenamiento
de objetos (Vercel Blob) que el proyecto no tiene, con validación de tipo y de
tamaño, y merece un ADR. Es la misma razón por la que la foto del perfil salió
de Google en solo lectura (PF-09), y ese mismo punto anticipaba el logo como la
necesidad que levantaría la divergencia.
_No verificado_: si los «branded reports» con logo son de plan pago (la página
de precios no lo resuelve) y qué formatos acepta Clockify (workspace P-09).
_Corregido el 2026-10-20, WS0_: decía que la columna «existe, vacía, y se
borra». Se borró con la migración `0018`
([contrato de WS0](../slices/fase2-ws0-columnas.md)); si el logo entra, la
columna vuelve con su consumidor.

**WS-08 Primer día de la semana por defecto del workspace** — `replicar`
Documentado: «Week start: A dropdown menu that sets the first day of the week
for reports and timesheets.» y «This acts as the default for all new members,
though it can be overridden on an individual member's profile.» La página de
perfiles lo dice desde el lado de la persona: «Week start set up on the Team
page overrides the default one in the Workspace settings.» (citada y
verificada en EQ-71).
**Esto completa PF-01**, que solo conocía la mitad por persona: en Clockify el
primer día es un valor del workspace que reciben las personas nuevas, y un admin
lo cambia después persona por persona desde la pantalla de equipo (PF-17,
EQ-71).
Acá hoy no hay valor de workspace: `membership.week_start` nace en lunes por el
`default` de la columna. Decidido el 2026-10-16 (workspace P-02): entra, solo
para las personas nuevas. Una columna
`workspace_settings.week_start`, con los siete días y lunes como valor inicial
(perfil P-03), que `ensureWorkspaceContext` copia en la membresía al crearla.
**Cambiarla no toca ninguna membresía existente**: es el valor de las que se
creen después.
_No verificado_: si en Clockify cambiar el valor del workspace mueve a las
personas que nunca tuvieron uno propio. «Overrides» sugiere que sí —el valor
del workspace vale mientras nadie haya fijado otro—, pero no lo dice. Si lo
hace, replicarlo pide distinguir «no eligió» de «eligió lunes», que hoy la
columna no distingue (workspace P-09).
Verificado en el workspace (2026-10-07, timesheet respuesta 13): la planilla de
la persona que respondió empieza el lunes.

**WS-09 Días laborables, capacidad diaria y horas extra** — `fuera de alcance`
Documentado: «Workdays: Circular toggles representing days of the week (M, T,
W, T, F, S, S) that define standard working days.», «Daily work capacity:
Displays the standard number of working hours expected per day (e.g., 8 hours),
adjustable via the Edit button.», los dos como valores para las personas nuevas
que se cambian por persona, y «Overtime calculation period: A dropdown menu
(e.g., Daily) that sets the timeframe used to calculate overtime.»
Justificación: alimentan objetivos, capacidad, planificación y el reporte de
asistencia, que Clock no tiene. PF-19 asignaba la versión por persona a la
pantalla de equipo de la fase 2 (perfil P-07), y
`membership.weekly_capacity_minutes` existía sin ningún uso. Decidido el
2026-10-16 (workspace P-06, equipo P-09): la fase 2 no los trae, ni el valor del
workspace ni el de cada persona (EQ-72), hasta que algo los consuma.
_Corregido el 2026-10-20, WS0_: decía que la columna «existe sin ningún uso».
Se borró con la migración `0018`
([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-10 Proyectos facturables por defecto** — `fuera de alcance`
Documentado: «Default billable projects: A toggle switch that, when enabled,
automatically makes all newly created projects and their time entries billable
by default.»
Justificación: el facturable es de plan pago y en Clock es diseño propio (P-16
de `proyectos.md`): el proyecto nace no facturable salvo que se marque la
casilla del alta (PR-21). Un interruptor de workspace para el valor de esa
casilla es configuración de un diseño que no tiene referencia.

**WS-11 Proyectos públicos por defecto** — `adaptar`
Documentado: «Default public projects: A toggle switch that automatically makes
all new projects visible to everyone in the workspace.», y en Free, «All
projects on the Free plan are Public (visible to all workspace members).»
Acá no hay interruptor: **todo proyecto nace público**, como hoy (PR-17), y la
visibilidad se cambia en cada proyecto cuando la fase 2 traiga los proyectos
privados. Justificación: en Free el interruptor no tiene efecto porque no hay
privados, y con privados sigue siendo un valor inicial de un campo que el
diálogo de proyecto ya ofrece; es el mismo criterio con que PR-27 dejó los
favoritos sin interruptor.

**WS-12 No hay zona horaria de workspace** — `adaptar`
La página de los ajustes no nombra ninguna zona horaria (NOT FOUND «time zone»
y «timezone»), y la de zonas horarias dice «When you record time in Clockify
web, time from Profile Settings is used.» La API tiene `lockTimeZone`, sin
descripción y sin pantalla documentada.
Acá `workspace.timezone` existe solo para fijar el día del cron (PF-05, perfil
P-08) y **la pantalla no lo muestra ni lo cambia**: cambiarlo es un cambio de
operación, en la base. Justificación: no es un ajuste de Clockify sino una
restricción nuestra, y ofrecerlo en la pantalla invitaría a creer que mueve las
horas de alguien.
_No verificado_: es una ausencia, como en PF-05.

**WS-13 Los formatos de fecha y de hora son de la persona** — `replicar`
La página de los ajustes no nombra ninguno de los dos (NOT FOUND «Date format»
y «Time format»). Están en el perfil (PF-12, PF-13) y la pantalla de
configuración no los repite.
_No verificado_: es una ausencia (workspace P-09).

## 3. Registro de tiempo

### 3.1 Formato de duración

**WS-14 Dónde vive y quién lo cambia** — `replicar`
Documentado: «Duration format: Controls how time durations are displayed
across the workspace (e.g., hh:mm:ss).», en la sección de registro de tiempo
—«Select Time tracking from the sidebar» y «Set the format you want from the
dropdown menu in the Duration format section»—, y se cambia en cualquier plan
(tabla de arriba). Lo cambian owner y admin, porque son los únicos que entran a
la pantalla (WS-02).
**Esto corrige dos cosas de PF-02**: el ajuste está en la sección «Time
tracking», no en «General», y el rol que lo cambia deja de estar sin verificar.
La regla de PF-02 —una persona no ve las duraciones en otro formato que el resto
del equipo— no cambia.

**WS-15 Dos valores, compacto por defecto** — `adaptar`
Los dos de PF-20: «Completo (hh:mm:ss)» y «Compacto (h:mm)», en ese orden, en un
selector rotulado «Formato de duración». El patrón es el ejemplo de cada
opción: el disparador muestra «Completo (hh:mm:ss)», y la lista, «Completo» con
«(hh:mm:ss)» en gris, como los formatos de fecha y de hora del perfil. No llevan
además el ejemplo de una hora y media. El decimal queda fuera: es de plan pago
(PF-20, perfil P-01). El valor inicial es compacto (perfil P-01, P-03). Desde
WS2a el valor vive en `workspace_settings.duration_format`, compacto por
omisión (migración `0020`), y `formatDuration` lo recibe
([ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)).
Desde WS2b lo cambian owner y admin con ese selector, y el perfil lo muestra en
solo lectura con el mismo texto y «Lo define el workspace.» (PF-31).
Justificación del `adaptar`: se implementan dos de los tres formatos.
Dato del workspace del equipo: la planilla muestra `06:00:00` (timesheet,
respuesta 13), que es el completo. El predeterminado no se reabre. Decidido el
2026-10-16 (workspace P-07): el workspace de producción arranca con el formato
completo (`06:00:00`), el que el equipo veía en Clockify.
_Corregido el 2026-10-20, WS2a_: decía que no había columna y que
`formatDuration` fijaba `h:mm`.
_Corregido el 2026-10-21, WS2b_: decía que cada opción llevaba además su
ejemplo de la duración de una hora y media, `01:30:00` y `1:30`; con el patrón
en el nombre sería un segundo paréntesis. Lo decidió el usuario el 2026-10-21
(pregunta 2 del [contrato de WS2b](../slices/fase2-ws2b-selector.md),
D-WS2b-6). Decía también que la columna era de la migración `0019`, que con el
rebase de WS2a sobre el MCP es la `0020` (D-WS2a-11), y que hasta WS2b no había
selector y el perfil mostraba un texto fijo.

**WS-16 El formato decide también cómo se calcula** — `replicar`, con la regla
como decisión del equipo (ADR 0029)
Documentado: del completo, «Time calculations use the exact, full duration of
tracked time across all modules.»; del compacto, «Time calculations use compact
rounded durations across all modules.» La documentación no dice cuál es el
redondeo del compacto. La descripción de la API lo asocia a
`trackTimeDownToSecond`: con compacto, el registro no baja al segundo.
Acá la pregunta es concreta: una entrada del timer tiene segundos, la fila la
muestra en minutos y el reporte suma segundos (`entrySeconds`,
`src/modules/report/repository.ts`). Con compacto, un total puede ser la suma
de las filas redondeadas o el redondeo de la suma, y dan distinto.
**La regla: el formato solo cambia lo que se muestra**
([ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)).
Toda suma es de segundos exactos y cada rótulo trunca una sola vez, en la unidad
de su formato: el minuto con el compacto, el segundo con el completo. Una fila
muestra sus segundos truncados; un total, la suma exacta truncada, y no la suma
de las filas truncadas. Con el compacto, un total puede pasar lo que suman sus
filas en menos de un minuto por fila (WS-68); con el completo, cierran al
segundo. Cambiar el formato no cambia ningún número: ni los totales, ni lo que
agrega el reporte, ni lo que escribe una celda de la planilla, ni «Horas» de las
exportaciones. Es decisión del equipo y no paridad: la verificación es el punto
7 de workspace P-09, y si muestra que Clockify redondea cada entrada con el
compacto, cambiar la regla es un ADR nuevo. La interpretación de lo que se
teclea no cambia entre los dos formatos (PF-21, WS-67).
_Corregido el 2026-10-20, WS2a_: la regla estaba pendiente de workspace P-09, y
el texto decía que la fijaba el contrato del slice. La fija el ADR 0029, con el
[contrato de WS2a](../slices/fase2-ws2a-formato.md) (D-WS2a-5); el usuario
aceptó el ADR el 2026-10-20 (pregunta 1 de ese contrato).

**WS-17 Dónde se aplica** — `replicar`
Documentado: «Your time will be displayed in full formatting across the entire
app, except on Invoices and Projects» …, y lo mismo del compacto. En Clock no
hay facturas, y la pantalla de proyectos no muestra duraciones fuera de la
columna de tiempo imputado (PR-31). Se aplica, como dice PF-22, a la duración
de cada fila, los totales del día y de la semana del rastreador, las celdas y
los totales de la planilla, el calendario, el reporte y las columnas de
duración de las exportaciones. **El contador del timer corriendo sigue en
`h:mm:ss`** (PF-22, perfil P-06). La columna «Horas» de las exportaciones sigue
en decimal con los dos formatos (D-R6-9 del núcleo de reportes): es una
cantidad para planillas de cálculo, no una duración que se lee.
El bloque del timer en el calendario muestra su transcurrido como la duración de
los demás bloques, con el formato (CAL-21); el contador en `h:mm:ss` es el de la
barra del timer y el de «Fin: en curso» del diálogo del calendario. WS2a llevó
el formato a todo lo anterior salvo el reporte y las columnas de duración de las
exportaciones, que lo siguen desde WS2b, junto con el texto del perfil (PF-31):
el total, el facturable, las filas y el gráfico del reporte en pantalla, y la
columna «Duración» de CSV, Excel y PDF. En Excel la celda guarda lo que muestra:
los minutos truncados con `[h]:mm` con el compacto, y los segundos con
`[hh]:mm:ss` con el completo. «Horas» sale de los minutos truncados con los dos
formatos, así que cambiar el formato no la cambia: con el completo, una fila de
`00:01:40` dice `0,01` (WS-16). Como nadie pudo elegir el completo antes de
WS2b, producción no vio formatos mezclados.
_No verificado_: si la columna de tiempo imputado de la lista de proyectos de
Clockify es la excepción «Projects» (workspace P-09).
_Corregido el 2026-10-20, WS2a_: no decía que el bloque del timer del calendario
sigue el formato ni que el reporte y las exportaciones lo siguen recién con WS2b
([contrato de WS2a](../slices/fase2-ws2a-formato.md), D-WS2a-7 y D-WS2a-9).
_Corregido el 2026-10-21, WS2b_: decía que el reporte y las exportaciones
quedaban en compacto hasta WS2b, y no decía cómo guarda Excel la celda ni de
dónde sale «Horas» con el completo
([contrato de WS2b](../slices/fase2-ws2b-selector.md), D-WS2b-8 y D-WS2b-9).

### 3.2 Lo demás de la sección

**WS-18 La planilla no tiene interruptor** — `adaptar`
Documentado: «Timesheet view: Enables a weekly grid-style interface for
entering time, requiring a project selection for every entry.» Decidido en
TS-01 y TS-02 (timesheet P-11): la planilla existe siempre y no vuelve
obligatorio el proyecto. La fase 2 no agrega el interruptor: TS-01 lo dejaba
para «si alguien lo pide», y nadie lo pidió.
`workspace_settings.timesheet_enabled` existía, en verdadero y sin efecto
(sección 14).
_Corregido el 2026-10-20, WS0_: decía que la columna «existe». Se borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-19 Ocultar el rastreador** — `fuera de alcance`
Documentado: «Hide time tracker view if you want team members to log time
strictly using timesheets.», como opción de la planilla. Justificación: TS-03;
no se vio en el workspace del equipo y el equipo usa las dos pantallas.

**WS-20 Pausas** — `fuera de alcance`
Documentado: «Breaks: Allows team members to log break times separately for
clearer breakdown in reports.» Justificación: nadie lo pidió y separa un tipo de
entrada que el modelo no tiene.
_No verificado_: si existe en Free.

**WS-21 Aprobación de horas** — `fuera de alcance`
Documentado: «Time approval: Requires team members to submit their weekly,
semimonthly, or monthly timesheets to managers or administrators» …
Justificación: de plan pago, no relevable (TT-67, TS-68, P-02 del rastreador).
De él dependen el período de «Copiar la semana pasada» y de las plantillas
quincenales (TS-61, TS-67).

**WS-22 Campos obligatorios** — `fuera de alcance`
Documentado: «Time entry required fields: Lets you define which fields (e.g.,
Project, Task, Tag, Description, or Custom Fields)» …, y es de plan pago. Lo que
haría si entrara: «The timer can be started but can’t be stopped until you add
a project and tag», «No one can add a time entry without a project and tag (not
even admins)» y «When the task is a required field, projects that don’t have
tasks don’t show up in the project picker.»
Justificación: pago, no relevable (TT-84, P-01 del rastreador). **La fase 2 no
lo habilita.** `require_project`, `require_task`, `require_description` y
`require_tag` existían, en falso y sin efecto (sección 14).
_Corregido el 2026-10-20, WS0_: decía que las columnas «existen». Se borraron
con la migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-23 Forzar timer y modo del rastreador** — `fuera de alcance`
Documentado: «Force timer: Disables manual entry and editing of past time
entries, requiring team members to track time exclusively using the live
start/stop timer.», «Only Workspace owners and admins can enable Force timer» y
«Even workspace admins can't manually add time using the Time Tracker or
Timesheet» …; es de plan pago. En la API es `timeTrackingMode` con `DEFAULT` y
`STOPWATCH_ONLY`: el «modo del rastreador» a nivel de workspace es esto y nada
más.
Justificación: pago, no relevable (TT-84). **La fase 2 no lo habilita.** El
conmutador entre timer y manual de la barra sigue siendo de cada navegador
(TT-16), no del workspace. `force_timer` existía, en falso y sin efecto.
_Corregido el 2026-10-20, WS0_: decía que la columna «existe». Se borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-24 Redondeo en reportes** — `fuera de alcance`
Documentado: «Round time in reports: Configures default rounding rules (such as
rounding up to 15-minute increments) when generating workspace reports.»,
«Rounding only affects the reports, meaning that the rounded values will only
be displayed in the reports and exports.» y «Clockify will first round the
duration of each time entry, and then add them up.» Las opciones son «Round
down», «Round up» y «Round to nearest».
Justificación: pago, no relevable (TT-83, RP-36, P-03 del rastreador). **La
fase 2 no lo habilita.** `rounding_minutes` existía en cero y sin efecto, y
`roundMinutes` de `src/server/time` solo redondea hacia arriba y no lo usa
nadie fuera de su test.
_Corregido el 2026-10-20, WS0_: decía que la columna «existe». Se borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-25 Bloquear horas** — `fuera de alcance`
Documentado: «Lock time and expenses: Sets a cutoff rule to prevent team
members from adding, editing, or deleting time entries and expenses for past
dates.», y «Locking timesheets prevents team members from adding new time
entries or editing old ones for a specific period.» Justificación: pago, no
relevable (TT-67, TS-69).

**WS-26 Favoritos de proyecto y de tarea** — `adaptar`
Documentado: «Project and task favorites: Allows users to mark frequently used
projects and tasks so they appear at the top of selection lists for quicker time
tracking.» Decidido en PR-27 (P-26 de `proyectos.md`): entran en la fase 2 por
persona y **sin el interruptor de workspace**. Esta pantalla no suma nada.
Justificación: la de PR-27, un interruptor para habilitar una preferencia
personal es configuración de más.
_No verificado_: si el interruptor existe en Free; no cambia nada con la
decisión tomada.

**WS-27 Entradas favoritas** — `fuera de alcance`
Documentado: «Favorite entries: Enables users to save recurring time entry
details as shortcuts for fast, one-click reuse.» Justificación: nadie lo pidió,
y continuar y duplicar una entrada (TT-57, TT-58) cubren el mismo uso.
_No verificado_: la página de precios lo pone en una tarjeta de plan pago, sin
confirmación de una página de ayuda.

**WS-28 Renombrar cliente, proyecto y tarea** — `fuera de alcance`
Documentado: «Customize labels: Allows you to rename standard Clockify
organizational terminology (such as Client, Project, or Task)» …
Justificación: la interfaz de Clock tiene un solo idioma y un vocabulario fijo
(los de cada documento de paridad); hacerlo variable obliga a que toda la copia
salga de una tabla.
_No verificado_: si existe en Free.

**WS-29 Campos personalizados de la entrada** — `fuera de alcance`
Documentado: «Time entry custom fields» habilita «custom data fields (such as
location, project ID, or attachments)» … Justificación: de la familia paga que
ya quedó fuera (P-32 de `proyectos.md`).

**WS-30 «Copiar la semana pasada» no tiene ajuste propio** — `fuera de alcance`
La página de los ajustes no tiene un interruptor para la copia: depende del
período de aprobación (TS-61), que es de WS-21. Está desactivada en el plan del
workspace (TS-55 … TS-61, timesheet P-10). Justificación: **la fase 2 no la
habilita**, porque no hay ajuste que encender y el período de aprobación es
pago.

## 4. Finanzas

**WS-31 Moneda** — `fuera de alcance`
Documentado: «Currencies: Lets you add and manage currencies used throughout
your workspace,» …, en la sección de finanzas y no en la general. Justificación:
la moneda solo sirve a tarifas e importes, que no existen (PR-11, P-32 de
`proyectos.md`). `workspace.currency` existía, en `ARS` y sin ningún uso.
_Corregido el 2026-10-20, WS0_: decía que la columna «existe». Se borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-32 Formato de números y de moneda** — `fuera de alcance`
Documentado: «Number format: Selects how numerical values and decimal
separators are displayed workspace-wide (e.g., 3.456,78).» y «Currency format:
Selects how currency symbols and codes are positioned relative to monetary
figures» … Justificación: sin importes ni formato decimal de duración, el único
número que Clock muestra con decimales es la columna «Horas» de las
exportaciones, que usa la coma fija del castellano (D-R6-9).

**WS-33 Horas facturables, tarifas, costo, gastos y facturas** —
`fuera de alcance`
Documentado: «Billable hours: Activates hourly rate calculations, allowing you
to view earnings and calculate revenue» …, «Expense tracking: Enables logging
work-related expenses by fixed amount or unit count, uploading receipt
attachments» … y «Invoicing: Unlocks the capability to generate, manage, and
download client invoices directly from tracked billable hours and expenses.»
Justificación: pagos y no pedidos (P-32 de `proyectos.md`, TT-15).

## 5. Las otras secciones

**WS-34 Planificación, actividad y kiosco** — `fuera de alcance`
Documentado, entre otros: «Project and team scheduling: Enabling this toggle
unlocks the scheduling features, allowing you to plan projects and visualize
timelines.», de las ausencias «This toggle allows you to define time off
policies and set up company holidays.», de las capturas «Generates a screenshot
of the user’s active screen every 5 minutes while the timer is actively
running» … y del kiosco «The Kiosk section lets admins set up shared clock-in
stations on designated devices» … Justificación: son módulos que Clock no
tiene ni tiene planeados.

**WS-35 Seguridad y cuentas** — `fuera de alcance`
Documentado: «Log-in setup: Controls the allowed authentication methods for
your workspace, including email login, OAuth 2.0, and SAML 2.0.» Justificación:
en Clock el acceso es el login con Google restringido al dominio de la empresa
y la lista de invitados externos (`src/server/access.ts`); no hay otro método
que elegir. Los campos personalizados de la persona son de la pantalla de
equipo, si alguna vez entran.

**WS-36 Registro de auditoría** — `adaptar`
Documentado: «Audit log: Enables workspace-wide tracking to record specific
user actions and administrative activities.» Acá el audit log no es opcional:
toda mutación lo escribe (`src/server/audit.ts`), y no tiene pantalla.
Justificación: es parte del recorrido de toda mutación del proyecto, no una
funcionalidad que se enciende; una pantalla para leerlo no se pidió.

**WS-37 Importar y exportar el workspace** — `fuera de alcance`
Documentado: «Data export: Allows you to download a comprehensive backup of all
time entries logged across your entire workspace» … Justificación: la
importación de Clockify se hizo como operación, fuera de la aplicación, y las
exportaciones de horas son las del reporte (RP-53, RP-54).

**WS-38 Borrar el workspace** — `fuera de alcance`
Documentado: «owners are the only ones who can initiate the deletion of the
entire workspace» …, y de la página de admins, «If the Owner leaves the
workspace, the entire workspace is deleted» (citada y verificada en EQ-53, que
la deja de este lado). Justificación: hay un solo workspace, borrarlo borra
todo y no se puede deshacer; si alguna vez hace falta, es una operación en la
base. Tampoco hay un owner que se vaya: EQ-53 queda fuera de alcance por lo
mismo. `workspace.delete` existe en `can()` para `owner` y no la usa nadie.
Transferir el workspace (`workspace.transfer`) es EQ-55 … EQ-59 de
`equipo.md`, y no está en esta pantalla.

## 6. Permisos

En el plan Free los permisos de la pantalla están fijos. Clock ya decide cada
uno en `can()` por rol, y tres columnas de `workspace_settings` guardaban
valores sin efecto (sección 14).
_Corregido el 2026-10-20, WS0_: decía que las tres «guardan» valores. Dos de
ellas, `who_creates_projects` y `who_sees_rates`, se borraron con la migración
`0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)); queda
`who_sees_all_entries`, congelada en `admins` y sin efecto (WS-42).

**WS-39 Quién crea proyectos y clientes** — `replicar`
Documentado: «Who can create projects and clients: Defines the permission level
required to add new projects and clients to the workspace, with options for
Admins, Admins and project managers, or Anyone.», y en Free, «This setting is
set to Anyone and can not be changed on a Free plan.»
Acá es lo que ya hace Clock: todos los roles crean (PR-03, PR-59), con
`whoCreatesProjects` congelado en `everyone` (P-18 de `proyectos.md`). P-18
dejó la configuración editable «para la fase 2», y el ADR 0009 ya fijó cómo
entraría —un recurso propio para `project.create` y `client.create` con el
valor y, para `managers`, si quien actúa es responsable de algún proyecto—.
Volverla editable es salir del plan Free hacia un ajuste pago, que no se puede
relevar. Decidido el 2026-10-16 (workspace P-03): **queda fija**, como en
Clockify Free, y la pantalla no la muestra. Sin valor que leer,
`who_creates_projects` se borró (workspace P-05).
_Corregido el 2026-10-20, WS0_: decía que la columna «se borra». Se borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)); la regla
fija la cumple `can()` sin leer ningún valor (PR-59).

**WS-40 Quién crea tareas** — `replicar`
Documentado: «Who can create tasks: Determines who is authorized to create
tasks within projects, selectable between Admins, Admins and project managers,
or Anyone.», y en Free, «Every workspace member can create clients, projects,
tasks, and tags.»
**Esto es evidencia para P-33 de `proyectos.md`.** PR-40 tenía dos lecturas de
la página de tareas que se contradecían y PR-58 dejó a `task.create` en
«owner, admin y el responsable del proyecto», sin un motivo de producto. La
página del plan Free dice que en Free crea tareas cualquier miembro. Decidido
el 2026-10-16 (workspace P-04): se replica, y `task.create` pasa a tenerlo toda
membresía activa que ve el proyecto. Es un cambio de `can()`, no un ajuste de
esta pantalla.

**WS-41 Quién crea etiquetas** — `replicar`
Documentado: «Who can create tags: Sets whether only Admins or Anyone can
create new tags used to categorize time entries.», y en Free crean todos (cita
de WS-40). Es lo que ya hace Clock (PR-44, `tag.create` para todos los roles).
No hay ajuste que mostrar.

**WS-42 Qué ve un member de las horas de otros** — `adaptar`
Documentado: «Regular users can see: Sets the baseline visibility of tracked
time for standard users.», con tres valores (RP-04), y restringirlo es pago.
Decidido en P-01 de `reportes.md` y en el ADR 0020: solo owner y admin ven
horas ajenas, `who_sees_all_entries` queda congelado en `admins` y sin efecto, y
volverlo editable pide antes resolver el eje (RP-04). **La fase 2 no lo vuelve
editable** y la pantalla no lo muestra. Justificación: divergencia deliberada
con el plan Free, ya registrada en RP-01.

**WS-43 Quién ve tarifas e importes, y quién ve y cambia el facturable** —
`fuera de alcance`
Documentado: «Who can see hourly rates and amounts: Restricts visibility of
financial data, such as user hourly rates» … y «Who can see and change billable
status of time entries and expenses: Controls whether Admins or Anyone can
view» … Justificación: tarifas e importes no existen; el facturable es diseño
propio y cada persona lo cambia en sus entradas (TT-14). `who_sees_rates`
existía, en `admins` y sin efecto.
_Corregido el 2026-10-20, WS0_: decía que la columna «existe». Se borró con la
migración `0018` ([contrato de WS0](../slices/fase2-ws0-columnas.md)).

**WS-44 Quién edita horas de otros** — `fuera de alcance`
Documentado: en Free, «Users can edit only their own time entries (the "Who can
edit time for others" permission is set to "No one").» Justificación: es lo que
ya hace Clock (TT-01, TT-66); cargar o editar horas ajenas es TS-70, fuera de
alcance.

**WS-45 Ocultar páginas a los miembros** — `fuera de alcance`
Documentado: «Additionally, you can hide Projects, Team, and reports pages from
Regular users’ side bar.», «Project managers always see Reports and Projects
pages» y «Team managers always see Reports page». Justificación: está en la
página de una funcionalidad paga y nadie lo pidió; en Clock la navegación ya
depende del rol («Equipo», «Configuración»).
_No verificado_: la frase de plan pago de esa página habla de esconder horas,
no páginas.

**WS-46 Tablero de equipo y estado de los proyectos** — `fuera de alcance`
Documentado: «Users can access team dashboard: A toggle that allows or prevents
regular users from viewing the workspace’s team dashboard.» y «Who can see
project status: Controls whether only Admins or Anyone can view the overall
progress and status of projects.» Justificación: el tablero es de la fase 3
(RP-40 … RP-43) y el estado de los proyectos es de la familia paga (PR-29).

**WS-47 Aprobadores, facturas, asignaciones y monitoreo** — `fuera de alcance`
Documentado, entre otros: «Who can manage invoices: Controls invoicing
permissions.» y «Who can create and edit assignments: Sets the permission level
for assigning team members to projects and tasks, offering choices for Admins»
… Justificación: cuelgan de módulos fuera de alcance (WS-21, WS-33, WS-34).

## 7. Funcionalidades que se activan por módulo

**WS-48 Clock no tiene interruptores por módulo** — `adaptar`
Clockify enciende y apaga módulos desde la pantalla. Acá cada módulo que existe
está siempre encendido y lo que no existe no tiene interruptor. Justificación:
un interruptor que nadie va a apagar es configuración de más (TS-01), y uno para
un módulo que no existe promete algo que no está.

| Interruptor de Clockify             | Sección       | En Free                           | En Clock                                          |
| ----------------------------------- | ------------- | --------------------------------- | ------------------------------------------------- |
| Planilla («Timesheet view»)         | Registro      | Sí (TS-01, precios)               | Siempre encendida (WS-18)                         |
| Ocultar el rastreador               | Registro      | No se vio en el workspace (TS-03) | No existe (WS-19)                                 |
| Pausas                              | Registro      | _No verificado_                   | No existe (WS-20)                                 |
| Aprobación de horas                 | Registro      | No (pago)                         | No existe (WS-21)                                 |
| Favoritos de proyecto y tarea       | Registro      | _No verificado_                   | Por persona, sin interruptor (WS-26)              |
| Entradas favoritas                  | Registro      | _No verificado_                   | No existe (WS-27)                                 |
| Horas facturables, gastos, facturas | Finanzas      | No (pago)                         | El facturable sin importes, diseño propio (TT-15) |
| Ausencias y planificación           | Planificación | _No verificado_                   | No existe (WS-34)                                 |
| Monitoreo, GPS, capturas            | Actividad     | _No verificado_                   | No existe (WS-34)                                 |
| Registro de auditoría               | Actividad     | _No verificado_                   | Siempre encendido, sin pantalla (WS-36)           |
| Kiosco                              | Kiosco        | _No verificado_                   | No existe (WS-34)                                 |

## 8. Permisos por rol de la pantalla

**WS-49 Owner y admin cambian todo lo que la pantalla ofrece** — `replicar`
Con `workspace.settings.update` (WS-02). No hay ajuste que sea solo del owner:
la documentación no nombra ninguno, y lo que es solo del owner —borrar el
workspace (WS-38) y transferirlo (EQ-55)— no está en esta pantalla. Un admin
puede cambiar el nombre que eligió el owner.

**WS-50 Los otros tres roles no entran** — `adaptar`
`project_manager`, `team_manager` y `member` no ven el enlace (WS-01). Si
llegan a `/configuracion` por la dirección, la pantalla muestra «No tenés
permiso para cambiar la configuración del workspace.» y nada más, como
`/equipo` con «No tenés permiso para administrar el equipo.». Un pedido que
llegue igual responde «No tenés permiso para hacer esto.» (TT-79).
Justificación: Clockify no documenta qué ve un miembro en esa dirección; el
patrón es el de la pantalla de equipo, que ya está construida.
_No verificado_ (workspace P-09).

**WS-51 Una membresía que no está activa no cambia nada** — `replicar`
`can()` corta por `status` antes que por rol (TT-66, PR-60). Un owner o un
admin con la membresía desactivada ve, en lugar de la pantalla, el aviso de
membresía desactivada con «No podés cambiar la configuración del workspace.»,
como `/equipo` con su «No podés administrar el equipo.».

**WS-52 Perder el rol con la pantalla abierta** — `replicar`
Si el owner le quita el rol de admin a alguien que tiene la pantalla abierta, lo
dibujado queda hasta el pedido siguiente, como en RP-02. El próximo cambio se
rechaza, y la respuesta ya trae la pantalla de WS-50: «No tenés permiso para
cambiar la configuración del workspace.» en lugar de la pantalla, sin el enlace
«Configuración» en la navegación y sin esperar a recargar. El aviso del campo se
va con la pantalla; el texto de WS-50 es la explicación. Lo mismo para una
membresía desactivada con la pantalla abierta, que pasa a WS-51. Un owner que
transfirió la propiedad pasa a admin (EQ-57) y sigue entrando.
_Corregido el 2026-10-20, WS1 (D-WS1-6 del
[contrato de WS1](../slices/fase2-ws1-configuracion.md))_: decía «el próximo
cambio responde «No tenés permiso para hacer esto.» y el control vuelve a su
valor; al recargar ve WS-50». La action revalida también cuando falla, así que
la respuesta del rechazo llega con el árbol nuevo y WS-50 aparece con ella. Los
textos aceptados en P-08 no cambian; cambia en qué pedido aparece WS-50.

## 9. Validaciones y mensajes

Clockify no documenta ninguna. Los textos reusan los del perfil, que son la
misma causa.

| ID    | Regla                                                      | Mensaje                                                        | Marca              |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| WS-53 | Nombre vacío, con solo espacios o que no es texto          | «Escribí un nombre.» (PF-35)                                   | `adaptar`          |
| WS-54 | Nombre de más de 100 caracteres                            | «El nombre no puede superar los 100 caracteres.» (PF-35)       | `adaptar`          |
| WS-55 | Nombre con el carácter nulo                                | «El nombre tiene un carácter que no se puede guardar.» (PF-35) | `adaptar`          |
| WS-56 | Formato de duración desconocido, o un ajuste que no existe | «Ese formato no está disponible.» (PF-35)                      | `adaptar`          |
| WS-57 | Día de la semana fuera de los siete (WS-08)                | «Ese día no existe.» (PF-35)                                   | `adaptar`          |
| WS-58 | Sin permiso, o membresía no activa                         | «No tenés permiso para hacer esto.» (TT-79)                    | `replicar`         |
| WS-59 | Logo que no es PNG ni JPEG (WS-07, no entra)               | «El logo tiene que ser una imagen PNG o JPEG.»                 | `fuera de alcance` |
| WS-60 | Logo de más de 1 MB (WS-07, no entra)                      | «El logo no puede pesar más de 1 MB.»                          | `fuera de alcance` |

Justificación común: son validaciones de un payload cerrado, no reglas de
producto. El nombre se guarda recortado, así que uno con solo espacios es
vacío. WS-56 y WS-57 solo llegan en un pedido armado a mano, porque el selector
ofrece lo que se acepta. WS-59 y WS-60 quedan fuera con el logo (workspace
P-01) y se conservan como la propuesta para cuando entre: el tipo se comprueba
por el contenido del archivo, no por la extensión ni por el tipo que declara el
navegador.

## 10. Estados vacíos

**WS-61 No hay estado vacío** — `replicar`
Todos los ajustes tienen valor siempre: la fila de `workspace_settings` se crea
con el workspace (`src/modules/workspace/repository.ts`), así que la pantalla
nunca está vacía. Sin logo, el encabezado muestra solo el nombre, como hoy.
Desde WS2b la pantalla lee esa fila para «Registro de tiempo», con una consulta
por clave primaria y sin bloqueo, y solo cuando quien la abre tiene permiso: sin
permiso muestra WS-50 sin consultar. Si la fila falta, no hay estado vacío ni
valores de omisión, sino el error de WS-73.
_Corregido el 2026-10-20, WS1 (D-WS1-7 del
[contrato de WS1](../slices/fase2-ws1-configuracion.md))_: en WS1 la pantalla
tiene solo «General» (WS-03) y no lee `workspace_settings`, porque el nombre es
de `workspace`; la lectura de la fila llega con «Registro de tiempo» en WS2b.
_Corregido el 2026-10-21, WS2b_: no decía cómo lee la pantalla la fila ni qué
muestra si falta ([contrato de WS2b](../slices/fase2-ws2b-selector.md),
D-WS2b-4).

## 11. Estados de error

**WS-62 Falla al guardar** — `adaptar`
Como PF-32: el control vuelve al valor anterior y aparece el aviso de dos
partes de TT-90, con el título que nombra el ajuste —«No se pudo cambiar el
nombre del workspace.», «No se pudo cambiar el formato de duración.», «No se
pudo cambiar el primer día de la semana.»— y la causa. «Reintentar» aparece
solo con la falla de red (TT-89). Reintentar un cambio que ya se aplicó es
inofensivo, porque el mismo valor no escribe (WS-04). Una validación rechazada
muestra el mensaje sin «Reintentar». Justificación: Clockify no lo documenta;
es la convención del perfil.

## 12. Al recargar

**WS-63 La pantalla muestra lo guardado** — `replicar`
Se arma en el servidor con los valores de la base. No hay borrador que perder,
porque cada control guarda solo. El nombre sale del workspace de la sesión, y el
formato de duración, de la fila de `workspace_settings`, que la pantalla lee en
cada pedido (WS-61) en lugar de tomar el de la sesión: la sesión muestra el
compacto si la fila falta (WS-73), y la pantalla es la que tiene que ver la
falta.
_Corregido el 2026-10-21, WS2b_: no decía de dónde sale cada valor
([contrato de WS2b](../slices/fase2-ws2b-selector.md), D-WS2b-4).

**WS-64 El cambio se ve en toda la aplicación** — `replicar`
Quien cambia el nombre lo ve en el encabezado sin recargar, y quien cambia el
formato ve las duraciones nuevas en la pantalla que abra después. Las demás
personas lo ven en su pedido siguiente —recargar, navegar o la revalidación
del rastreador cada 60 segundos (P-11 del rastreador)—, sin aviso, igual que
PF-41. Para el servidor significa revalidar todo el shell, no solo
`/configuracion`. Los componentes que formatean duraciones en el navegador
(`use-group-total.ts` y los borradores de duración, en la tabla de la sección
10 de `perfil.md`) tienen que recibir el formato del workspace, como hoy reciben
los formatos de la persona por `useDisplayFormats`
([ADR 0012](../adr/0012-un-solo-juego-de-formatos.md)).

## 13. Casos borde

| ID    | Caso                                                            | Comportamiento esperado                                                                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WS-65 | Dos admins cambian el mismo ajuste a la vez                     | Gana el último en llegar. Cada ajuste se escribe solo, así que cambiar el nombre no pisa el formato que otro cambió. El audit log guarda los dos cambios.                                                                                                                                                                  |
| WS-66 | Cambiar el formato de duración con un timer corriendo           | El contador sigue en `h:mm:ss` (PF-22). Cambian las filas y los totales. El timer no se toca.                                                                                                                                                                                                                              |
| WS-67 | Cambiar el formato con un borrador de duración a medio escribir | Lo tecleado se interpreta igual con los dos formatos (PF-21), y los dos aceptan `h:mm:ss`, la forma que muestra el completo, con los segundos truncados (TT-19). El borrador se muestra con el formato nuevo cuando la pantalla recibe el valor.                                                                           |
| WS-68 | Entrada del timer con segundos, con formato compacto            | Regla de WS-16 (ADR 0029): toda suma es de segundos exactos y cada rótulo trunca una vez. Dos entradas de 1 minuto 40 segundos el mismo día se muestran `0:01` cada una y el total del día, `0:03`; con el completo, `00:01:40`, `00:01:40` y `00:03:20`. La fila, el total del día y el reporte siguen la misma regla.    |
| WS-69 | Cambiar el formato con un reporte abierto o exportado           | Lo abierto queda hasta el pedido siguiente (WS-64). Un archivo ya descargado no cambia. La exportación nueva usa el formato nuevo en sus columnas de duración; «Horas» sigue en decimal (WS-17).                                                                                                                           |
| WS-70 | Cambiar el primer día por defecto (WS-08)                       | Ninguna membresía cambia. La persona que entra después nace con el valor nuevo. _No verificado_ contra Clockify (WS-08).                                                                                                                                                                                                   |
| WS-71 | Nombre con espacios al principio o al final                     | Se recortan antes de validar y de guardar. Si el recortado es igual al guardado, no se escribe.                                                                                                                                                                                                                            |
| WS-72 | Un owner o admin con la membresía desactivada                   | Ve WS-51 y no cambia nada (WS-58).                                                                                                                                                                                                                                                                                         |
| WS-73 | Falta la fila de `workspace_settings`                           | No pasa: se crea con el workspace. Si pasara, la sesión muestra el compacto sin crear la fila (ADR 0029): un ajuste de presentación no la tira abajo. La pantalla muestra «No se pudo cargar la configuración.» con «Reintentar», y no la crea (WS2b); un ajuste que aparece con valores de omisión ocultaría el problema. |

**WS-65 … WS-73** — `adaptar`. Justificación: Clockify no documenta ninguno; son
consecuencias de WS-04, WS-16, WS-17 y PF-22 escritas para que el contrato y
Playwright las prueben.
_Corregido el 2026-10-20, WS1 (D-WS1-7 del
[contrato de WS1](../slices/fase2-ws1-configuracion.md))_: **WS-73 se prueba en
WS2b**, el primer slice que lee la fila de `workspace_settings` desde
`/configuracion`, junto con el `error.tsx` de la pantalla. En WS1 se cumple
porque nada la crea, pero la página no lee la base y no hay error que mostrar.
WS2a la lee antes en la sesión; lo que WS-73 describe es el error de la
pantalla.
_Corregido el 2026-10-20, WS2a_: WS-67 no decía que se acepta `h:mm:ss`; WS-68
remitía a una regla que el contrato de su slice iba a fijar, y la fija el ADR
0029 (WS-16); WS-73 no decía qué hace la sesión sin la fila
([contrato de WS2a](../slices/fase2-ws2a-formato.md), D-WS2a-2, D-WS2a-5 y
D-WS2a-6).
_Corregido el 2026-10-21, WS2b_: WS-73 decía que la pantalla respondía «con el
error inesperado», sin el texto. Es el `error.tsx` de `/configuracion`, con «No
se pudo cargar la configuración.» y «Reintentar», nunca la pantalla a medias.
**Si la fila falta con la pantalla abierta**, elegir un formato no muestra el
aviso del campo: la action responde el error inesperado sin crear la fila, la
respuesta trae la página otra vez y la página muestra el mismo error. Las demás
pantallas siguen entrando, en compacto. Lo prueba la e2e de WS2b en los dos
casos, al entrar y con la pantalla abierta
([contrato de WS2b](../slices/fase2-ws2b-selector.md), D-WS2b-3, D-WS2b-4 y
D-WS2b-12).

## 14. Lo que ya existe en el esquema

`workspace` y `workspace_settings` tienen columnas desde la migración inicial.
Varias nunca tuvieron efecto, y el ADR 0009 dice por qué eso es un problema:
«un dato que viaja sin efecto es una invitación a creer que tiene uno».

| Columna                                                                 | Hoy                                   | Con este documento                                   |
| ----------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| `workspace.name`                                                        | Se muestra; nadie la cambia           | Se cambia desde la pantalla (WS-05)                  |
| `workspace.logo_url`                                                    | Borrada en WS0 (`0018`)               | Se borra (WS-07, workspace P-01 y P-05)              |
| `workspace.currency`                                                    | Borrada en WS0 (`0018`)               | Se borra (WS-31, workspace P-05)                     |
| `workspace.timezone`                                                    | Día del cron (PF-05)                  | Igual; no se muestra (WS-12)                         |
| `workspace.owner_id`                                                    | El owner                              | Lo cambia la transferencia (EQ-57), no esta pantalla |
| `workspace_settings.who_sees_all_entries`                               | `admins`, sin efecto (ADR 0020)       | Igual (WS-42)                                        |
| `workspace_settings.who_sees_rates`                                     | Borrada en WS0 (`0018`)               | Se borra (WS-43, workspace P-05)                     |
| `workspace_settings.who_creates_projects`                               | Borrada en WS0 (`0018`)               | Se borra (WS-39, workspace P-03 y P-05)              |
| `require_project`, `require_task`, `require_description`, `require_tag` | Borrada en WS0 (`0018`)               | Se borra (WS-22, workspace P-05)                     |
| `workspace_settings.force_timer`                                        | Borrada en WS0 (`0018`)               | Se borra (WS-23, workspace P-05)                     |
| `workspace_settings.timesheet_enabled`                                  | Borrada en WS0 (`0018`)               | Se borra (WS-18, workspace P-05)                     |
| `workspace_settings.rounding_minutes`                                   | Borrada en WS0 (`0018`)               | Se borra (WS-24, workspace P-05)                     |
| `workspace_settings.duration_format`                                    | De WS2a (`0020`); se elige desde WS2b | Igual (WS-15)                                        |
| _Falta_: primer día por defecto                                         | —                                     | Columna nueva (WS-08, workspace P-02)                |

Decidido el 2026-10-16 (workspace P-05): las columnas sin efecto que dicen «Se
borra» se quitan con una migración, con el criterio del ADR 0009. Entre ellas
están `logo_url` y `who_creates_projects`, que P-05 ataba a P-01 y P-03: sin
logo y con la regla fija, las dos quedan sin efecto.

_Corregido el 2026-10-20, WS0_: la columna «Hoy» de las ocho filas que dicen
«Se borra» daba el valor de cada una y que no tenía efecto —«Vacía, sin uso»,
«`ARS`, sin uso» y, en las demás, su `default` con «sin efecto»—. Las once
columnas se borraron con la migración `0018`
([contrato de WS0](../slices/fase2-ws0-columnas.md)), junto con
`membership.weekly_capacity_minutes` (workspace P-06, equipo P-09).
`who_sees_all_entries` no se borra (WS-42).
_Corregido el 2026-10-20, WS2a_: la fila del formato de duración decía
«_Falta_». La columna existe desde la migración `0019` de WS2a, compacta por
omisión, y la lee la sesión en cada pedido
([ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)).
_Corregido el 2026-10-21, WS2b_: la fila del formato de duración daba la
columna como de la migración `0019`, que con el rebase de WS2a sobre el MCP es
la `0020` (D-WS2a-11), y el selector como algo por venir. Desde WS2b la cambian
owner y admin en «Registro de tiempo», y cada cambio deja
`workspace.updateSetting` en el audit log
([contrato de WS2b](../slices/fase2-ws2b-selector.md), D-WS2b-3).

## 15. Qué es de la fase 2

**Cada identificador tiene un solo destino.** Son 73, WS-01 a WS-73.

- **Fase 2 (34):** WS-01 … WS-06, WS-08, WS-14 … WS-17, WS-49 … WS-58,
  WS-61 … WS-73. Es la pantalla con tres ajustes: el nombre, el formato de
  duración y el primer día de la semana por defecto (workspace P-02).
- **Fase 2, fuera de esta pantalla (1):** WS-40 (quién crea tareas, workspace
  P-04), que es un cambio de `task.create`.
- **Ya cumplido o decidido en otro documento, sin trabajo nuevo (9):** WS-11,
  WS-12, WS-13, WS-18, WS-26 (va con los favoritos de PR-27), WS-36, WS-39
  (queda fijo, workspace P-03), WS-41, WS-48.
- **Congelado por una decisión anterior (1):** WS-42.
- **Fuera de alcance (28):** WS-07, WS-09, WS-10, WS-19 … WS-25,
  WS-27 … WS-35, WS-37, WS-38, WS-43 … WS-47, WS-59, WS-60. El logo y sus
  validaciones, por workspace P-01; los días laborables y la capacidad, por
  workspace P-06.

34 + 1 + 9 + 1 + 28 = 73.

_Corregido el 2026-10-16, decisiones de la sección 17_: había siete
identificadores en «Fase 2, si el usuario lo decide» y WS-39 en «editable solo
si el usuario lo decide». WS-08, WS-57 y WS-70 pasaron a la fase 2; WS-07,
WS-59 y WS-60, fuera de alcance; WS-40, a la fase 2 fuera de esta pantalla, y
WS-39, a cumplido.

### Lo que este relevamiento cambia en otros documentos

No los toqué: son de otros dueños y van con su corrección fechada.

_Aplicadas el 2026-10-16_: PF-01, PF-02, PF-16 y la lista de perfil P-09 en
`perfil.md`; PR-40, PR-58 y P-33 en `proyectos.md`, cada una con su corrección
fechada. Con las decisiones de la sección 17 se corrigieron además PF-19 y
perfil P-07 (workspace P-06) y PR-59 (workspace P-03).

- **PF-02** dice que el formato de duración está en la pestaña General y que el
  rol que lo cambia está sin verificar. Está en «Time tracking» y lo cambian
  owner y admin (WS-14). Sale de la lista de perfil P-09.
- **PF-01 y PF-16** no saben que el primer día de la semana tiene además un
  valor de workspace para las personas nuevas (WS-08). EQ-71 ya lo registra del
  lado de equipo.
- **PR-40, PR-58 y P-33 de `proyectos.md`**: la página del plan Free dice que
  cualquier miembro crea tareas (WS-40). Es la verificación que P-33 esperaba,
  hecha con la documentación y no con el workspace.

## 16. Orden de slices propuesto

Sugerencia, no decisión. Cada uno es vertical y se despliega solo.

1. **WS1 — La pantalla y el nombre.** `/configuracion`, el enlace de la
   navegación, `workspace.settings.update`, los estados de WS-50 y WS-51, el
   nombre editable con sus validaciones, el guardado de WS-04 con audit log y la
   revalidación del shell. Es chico y le suma al módulo `workspace` sus
   componentes. No depende de la pantalla de equipo.
   _Corregido el 2026-10-20, WS1_: decía «deja armado el módulo `workspace` con
   su `schema.ts`, sus actions y sus componentes, que hoy no tiene». Desde E1a
   el módulo tiene `schema.ts` y `actions.ts`; lo único nuevo de WS1 es
   `components/`.
2. **WS2 — El formato de duración**, en dos slices. **WS2a**, el dato y sus
   lectores: la columna con su migración, el valor en la sesión,
   `formatDuration` con el formato y sus consumidores del rastreador, la
   planilla y el calendario, en el servidor y en el navegador, sin selector ni
   cambio visible. **WS2b**: el selector, el reporte, las columnas de duración
   de las exportaciones y el perfil. Es el único que toca pantallas ya
   construidas. La regla de WS-16 y WS-68 la fija el
   [ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md),
   que extiende el 0012 con un formato que es del workspace y no de la persona.
   _Corregido el 2026-10-20, WS2a_: era un slice solo, y decía que necesitaba
   decidir antes la regla de WS-16 y WS-68 y «probablemente un ADR». El
   [mapa de la fase 2](../slices/fase2-mapa.md) lo partió en WS2a y WS2b, y el
   ADR es el 0029.
3. **WS3 — El primer día por defecto**, aprobado en workspace P-02. Una
   columna, un selector y la lectura en `ensureWorkspaceContext`. Conviene
   después del slice de equipo que edite el primer día por persona (EQ-71), para
   que las dos caras del mismo dato lleguen juntas.
4. **WS4 — El logo** no entra en la fase 2 (workspace P-01). Si alguna vez
   entra, va después de un ADR sobre el almacenamiento de archivos.

El cambio de `task.create` de WS-40, aprobado en workspace P-04, no es de esta
pantalla: va con el primer slice de administración de proyectos de la fase 2.
Quitar las columnas sin efecto, aprobado en workspace P-05, fue una migración
sola: la `0018` de WS0.
_Corregido el 2026-10-20, WS0_: decía que era «una migración que puede ir sola o
con WS1». Fue sola, con el slice WS0
([contrato de WS0](../slices/fase2-ws0-columnas.md)).

## 17. Pendientes de definición del equipo

Numeración propia de este documento. Se cita como `workspace P-nn`.

### Decididos el 2026-10-16

El usuario respondió todas con la recomendación. Se dejan con su identificador
porque el cuerpo del documento y los contratos de slice los citan.

| ID   | Decisión                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | **El logo del workspace no entra** (WS-07, WS-59, WS-60), hasta que haya un segundo uso. Traería almacenamiento de archivos (Vercel Blob), validación de tipo y tamaño, y un ADR, y en Clock solo tendría el encabezado como lugar. Si entra, con la propuesta de WS-07 y en un slice propio.                                                               |
| P-02 | **Entra el primer día de la semana por defecto del workspace, solo para las personas nuevas** (WS-08, WS-57, WS-70). Cambiarlo no mueve ninguna membresía existente; replicar que mueva a quien nunca eligió pediría distinguir «no eligió» y depende de la verificación de P-09.                                                                           |
| P-03 | **«Quién crea proyectos y clientes» queda fijo, como en Clockify Free** (WS-39): todos crean, y la pantalla no lo muestra. Corrige lo que P-18 de `proyectos.md` dejaba para la fase 2 (PR-59).                                                                                                                                                             |
| P-04 | **Cualquier miembro crea tareas en los proyectos que ve, como en Free** (WS-40): `task.create` pasa a tenerlo toda membresía activa que ve el proyecto. PR-58 decía que no había motivo de producto para la regla anterior (owner, admin y el responsable del proyecto).                                                                                    |
| P-05 | **Se borran con una migración las columnas sin efecto** (sección 14): `who_sees_rates`, los cuatro `require_*`, `force_timer`, `timesheet_enabled`, `rounding_minutes` y `currency`, y también `logo_url` y `who_creates_projects`, que quedan sin efecto con P-01 y P-03. El criterio del ADR 0009 es que un dato sin efecto invita a creer que tiene uno. |
| P-06 | **Días laborables y capacidad, fuera de alcance** hasta que haya un consumidor (WS-09): ni el valor del workspace ni el de cada persona. Es la misma respuesta que P-09 de `equipo.md` (EQ-72), y corrige PF-19 y perfil P-07.                                                                                                                              |
| P-07 | **Producción arranca con el formato de duración completo (`06:00:00`)**, el que muestra la planilla del workspace de Clockify (WS-15). El predeterminado de la columna sigue siendo compacto (perfil P-01).                                                                                                                                                 |
| P-08 | **Se aceptan las propuestas de diseño** de este documento, que no son paridad: la ruta y el rótulo «Configuración» (WS-01), dos secciones (WS-03), el guardado por control (WS-04), proyectos siempre públicos al nacer sin interruptor (WS-11), la zona horaria del cron fuera de la pantalla (WS-12) y los textos de WS-50 a WS-62.                       |

_Corregido el 2026-10-20, WS0_: P-05 está cumplida. Las once columnas se
borraron con la migración `0018`
([contrato de WS0](../slices/fase2-ws0-columnas.md)), y con ellas
`membership.weekly_capacity_minutes`, que quedó sin destino con P-06 (decisión
1 del §7 del [mapa de la fase 2](../slices/fase2-mapa.md)). Si una vuelve a
tener efecto, vuelve con su consumidor y su migración.

_Corregido el 2026-10-21, WS2b_: P-07 se cumple con el selector de «Registro de
tiempo» y no con una migración de datos
([contrato de WS2b](../slices/fase2-ws2b-selector.md), D-WS2b-11): con WS2b
desplegado, el owner elige el completo en `/configuracion`, y queda la
constancia `workspace.updateSetting` de quién y cuándo. Volver atrás es elegir
el compacto, sin migración inversa. Cambia la fila del workspace de la sesión,
el más viejo; producción tiene uno solo. Fecha del cambio en producción: _pendiente_; la anota el registro del
slice después de la verificación de §6.3 del contrato.

### Abierto

| ID   | Punto                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| P-09 | **La lista de verificación contra el workspace real.** Está abajo, entera, para resolverla en una sentada. No es una decisión. |

### P-09, la lista de verificación

Todo lo marcado como _no verificado_, con qué hay que mirar. Necesita la
sesión de un owner o un admin en el workspace de la empresa.

1. **WS-03, WS-48** — Captura de cada sección de los ajustes. Qué secciones
   aparecen, y cómo se ven los ajustes que el plan no habilita: ocultos,
   bloqueados o con un aviso para mejorar el plan.
2. **WS-04** — ¿Los ajustes guardan solos al cambiar o hay un botón?
3. **WS-05** — ¿Acepta un nombre vacío? ¿Qué largo máximo tiene?
4. **WS-07** — ¿Qué formatos y tamaños acepta el logo? ¿Dónde se ve en un
   workspace Free?
5. **WS-08, WS-70** — ¿Qué primer día tiene el workspace? Si se cambia, ¿una
   persona que nunca tuvo uno propio pasa al nuevo?
6. **WS-14, WS-15, P-07** — ¿Qué formato de duración tiene el workspace? ¿El
   decimal aparece bloqueado?
7. **WS-16, WS-68** — Con compacto: una entrada del timer de 1 minuto 40
   segundos, ¿cómo se muestra en la fila, y cómo suma con otra igual en el total
   del día y en el reporte? ¿Y con completo?
8. **WS-17** — ¿La lista de proyectos muestra el tiempo imputado con el formato
   del workspace o siempre en decimal?
9. **WS-12, WS-13** — Que no haya zona horaria ni formatos de fecha y hora en
   los ajustes. Es una ausencia.
10. **WS-20, WS-26, WS-27, WS-28, WS-45** — ¿Aparecen «Breaks», «Project and
    task favorites», «Favorite entries», «Customize labels» y «Hide pages»? ¿Se
    pueden encender?
11. **WS-39 … WS-41** — ¿Cómo se ven los permisos fijos del plan: «Who can
    create projects and clients», «Who can create tasks», «Who can create
    tags»?
12. **WS-50** — Con una cuenta de miembro, ¿qué pasa al abrir la dirección de
    los ajustes?
