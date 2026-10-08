# Paridad: reportes

Alcance de este documento: quién ve qué en los reportes, el reporte resumido
(_Summary report_) en detalle, el tablero (_Dashboard_) y el reporte semanal
(_Weekly report_) con lo justo para decidir si entran, un inventario corto del
reporte detallado, la exportación y los reportes compartidos, y lo mínimo del
equipo para que un reporte por persona tenga sentido. No cubre gastos,
asistencia, asignaciones, facturas ni tarifas.

El equipo adelanta un **núcleo de reportes** de la fase 3 antes de terminar la
fase 2, con el mismo patrón que el núcleo de proyectos del
[ADR 0004](../adr/0004-nucleo-de-proyectos-en-fase-1.md). El corte lo fija el
[ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md) con las
decisiones del usuario de la [sección 8](#8-decisiones-del-usuario-2026-10-08);
la [sección 6](#6-qué-entra-en-el-núcleo) lo traduce a identificadores.

Cada comportamiento lleva un identificador `RP-nn` y una marca `replicar`,
`adaptar` o `fuera de alcance`; las dos últimas llevan una línea de
justificación. Los pendientes `P-nn` son de este documento, como en
`perfil.md` y `timesheet.md`: los de otro documento se citan con su nombre
(«P-16 de `proyectos.md`»).

_Actualizado el 2026-10-08, hallazgo m2 de
[`correcciones-nucleo-reportes.md`](../slices/correcciones-nucleo-reportes.md)_:
las marcas y la sección 6 siguen a la sección 8. Cambian RP-01, RP-03, RP-05,
RP-10, RP-15, RP-20, RP-21, RP-30, RP-34, RP-53, RP-54, RP-62, RP-63 y RP-65.

## Fuentes y límites del relevamiento

Documentación pública del centro de ayuda de Clockify y referencia pública de su
API, consultadas el 2026-10-08:

- https://clockify.me/help/reports (índice de la sección)
- https://clockify.me/help/reports/summary-report
- https://clockify.me/help/reports/filtering-reports
- https://clockify.me/help/reports/dashboard
- https://clockify.me/help/reports/weekly-report
- https://clockify.me/help/reports/detailed-report
- https://clockify.me/help/reports/exporting-reports
- https://clockify.me/help/reports/sharing-reports
- https://clockify.me/help/reports/viewing-your-employees-hours
- https://clockify.me/help/administration/updates-to-clockify-free-plan
- https://clockify.me/help/administration/hide-time
- https://clockify.me/help/administration/inviting-users
- https://clockify.me/help/administration/bulk-activate-or-deactivate-team-members
- https://clockify.me/help/administration/time-zones
- https://clockify.me/help/administration/user-roles-and-permissions/regular-users
- https://clockify.me/help/administration/user-roles-and-permissions/manager-role
- https://clockify.me/help/administration/user-roles-and-permissions/who-can-do-what
- https://clockify.me/help/track-time-and-expenses/time-rounding
- https://clockify.me/help/track-time-and-expenses/duration-format
- https://docs.clockify.me/openapi.json (esquemas `SummaryReportFilterV1`,
  `SummaryFilterV1` y `ContainsUsersFilterV1`)

**Método.** Toda cita marcada «Documentado» se confirmó con una segunda
consulta que pedía la cadena literal y FOUND con la oración o NOT FOUND, porque
el resumidor de la herramienta inventa citas. Algunas oraciones largas quedaron
cortadas por el tope de la herramienta y van con «…». Lo que no pasó ese filtro
va como _no verificado_.

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Lo que solo se ve con la sesión del usuario va a P-05,
con qué mirar.

**La API dice más que el centro de ayuda y no se toma como pantalla.** El
filtro del resumido en la referencia pública tiene, entre otras, las
propiedades `dateRangeType`, `timeZone`, `weekStart`, `users`, `projects`,
`clients`, `tags`, `tasks`, `billable`, `withoutDescription`, `archived`,
`rounding`, `amountShown`, `exportType` y `zoomLevel`, y `SummaryFilterV1` tiene
`groups`, `sortColumn` y `summaryChartType`. Eso dice qué parámetros existen,
no cómo se ven en la interfaz; se cita como indicio y nunca como
«Documentado» de una pantalla.

### Lo que el plan Free deja fuera de este módulo

Citas textuales, todas confirmadas:

| Qué                                      | Qué dice la documentación                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Rango de más de 31 días                  | «On the Free Plan, generating reports is limited to a maximum date range of 31 days per report.»                                               |
| Rango del tablero                        | «Report and dashboard date range filter: 1 month (31 days) at a time.»                                                                         |
| CSV y Excel                              | «CSV and Excel report exports are available only on paid plans (PDF exports remain available on the Free plan).»                               |
| Reportes compartidos                     | «Shared reports are available only on paid plans.»                                                                                             |
| Ocultar el tiempo de otros               | «Hiding tracked time and expenses from other users in your workspace is a paid feature»                                                        |
| Rol de responsable de proyecto           | «Project manager is a paid feature available on any paid plan.»                                                                                |
| Rol de team manager                      | «The Team manager role is an additional feature available through upgrading your workspace» (sigue: «to a Standard, Pro, or Enterprise plan.») |
| Redondeo                                 | «Time rounding is a paid feature, which you can enable by upgrading your workspace to Standard, Pro, or Enterprise paid plan.»                 |
| Formato de duración decimal              | «Decimal format is a paid feature you can enable by upgrading your workspace to any of our paid plans.»                                        |
| Cargar tiempo de otro desde el detallado | «Adding time for others is a Basic feature»                                                                                                    |
| Proyectos privados                       | «All projects on the Free plan are Public (visible to all workspace members).»                                                                 |

El facturable y las tarifas tienen la misma situación que en `proyectos.md`
(P-16 y P-32 de ese documento): el facturable entra como diseño propio, los
importes no entran.

**La consecuencia que más pesa:** en el plan Free hay tres roles efectivos
—owner, admin y member—, todos los proyectos son públicos y nadie puede
esconder el tiempo de los demás. **El workspace del equipo, hoy, le muestra a
cualquier member las horas de todos.** Lo que hacen los roles de responsable de
proyecto y de team manager, y el ajuste que restringe la visibilidad, está
documentado pero no se puede relevar en ese workspace (P-01 a P-03).

## Vocabulario

| Clockify                | Clock (interfaz en español) |
| ----------------------- | --------------------------- |
| Summary report          | Reporte resumido            |
| Detailed report         | Reporte detallado           |
| Weekly report           | Reporte semanal             |
| Dashboard               | Tablero                     |
| Only Me / Team          | Solo yo / Equipo            |
| Group by                | Agrupar por                 |
| Billable / Non-billable | Facturable / No facturable  |
| Team (filtro)           | Personas                    |
| Rounding                | Redondeo                    |
| Shared report           | Reporte compartido          |
| Show users without time | Mostrar personas sin horas  |

`adaptar`: la interfaz va en español y toda la copia visible se traduce; no se
vuelve a justificar en cada comportamiento. El filtro _Team_ se traduce
«Personas» para no chocar con la pantalla de equipo. Los nombres de pantalla y
de ruta los fija el contrato del slice.

## 1. Quién ve qué

**RP-01 En el plan Free, un member ve en los reportes el tiempo de todos** —
`adaptar`
Documentado: «By default, all members of your workspace can see all time
entries and expenses», y restringirlo es pago («Hiding tracked time and
expenses from other users in your workspace is a paid feature»). La tabla de
permisos del miembro común dice «Their own and others’ time | Yes (unless
disabled)», y la del tablero, «Regular users can see everything by default».
Con todos los proyectos públicos, en el workspace del equipo un member ve las
horas de todo el workspace en todos los reportes.
_Actualizado el 2026-10-08, decisión del usuario (P-01)_: **solo owner y admin
ven las horas de otros; el resto ve solo las propias.** Justificación: es una
divergencia deliberada con el plan Free, que el usuario eligió; el reviewer la
compara contra este documento y no contra Clockify. El ADR 0020 la implementa
con `timeEntry.others.view` para `owner` y `admin`, y sin ese permiso la
consulta lleva `user_id = <quien mira>`. `who_sees_all_entries` queda
congelado en `admins`, sin efecto.

**RP-02 Owner y admin ven todo** — `replicar`
Documentado: «Workspace owner and admins can see everything (time and
financials).» (tablero). Ven las horas de todas las personas, incluidas las
inactivas (RP-61).
_No verificado_: si un admin ve en los reportes el tiempo de un proyecto privado
del que no es miembro. La página de proyectos solo habla del responsable
(PR-17). No importa en el núcleo: todo proyecto es público (P-17 de
`proyectos.md`).

**RP-03 El acceso al proyecto condiciona el reporte** — `replicar`
Relevado en `proyectos.md` (PR-16, PR-17): en un proyecto público «Everyone can
see all time entries for that project in reports»; en uno privado, «Only
project managers can see all tracked time on their projects in reports». El
reporte aplica el mismo filtro de lectura que el resto (PR-61), con una
excepción que manda TT-01: las entradas propias se ven siempre, aunque la
persona haya quedado fuera del proyecto (PR-71).
_Actualizado el 2026-10-08, ADR 0020_: **con P-01 queda vacío y el núcleo no lo
implementa.** Quien ve horas ajenas es owner o admin, que ven todos los
proyectos (PR-61); el resto ve solo lo propio, que se ve siempre (PR-71). Si la
visibilidad se abre alguna vez, el filtro por `project.view` entra con ella.

**RP-04 El ajuste «Regular users can see»** — `fuera de alcance`
Documentado, de plan pago, con tres valores: «All tracked time and expenses»,
«Only time and expenses on public projects» y «Only their own time and
expenses»; y «This setting doesn’t affect project managers». Justificación: es
pago y no se puede relevar en el workspace del equipo. Ojo: no es el mismo eje
que nuestro `who_sees_all_entries` (`everyone`, `managers`, `admins`), que
decide **quién** ve todo; el de Clockify decide **qué** ve el member. Si P-01 lo
quiere configurable, hay que elegir uno de los dos ejes.

**RP-05 El responsable de proyecto ve todo el tiempo de sus proyectos** —
`fuera de alcance`
Documentado, de plan pago: «Project managers can see all tracked time on their
projects.» y «Managers have access to Reports, and project managers
additionally have access to the Projects page.»
_Actualizado el 2026-10-08, decisión del usuario (P-02)_: justificación: no
hay excepción para el responsable. Un responsable de proyecto que no es owner
ni admin ve solo sus horas, por P-01; `project_manager` decide como `member` y
la marca de responsable de PR-19 no abre nada en los reportes (ADR 0020).

**RP-06 El team manager ve el tiempo de su equipo** — `fuera de alcance`
Documentado, de plan pago: «This role can view all tracked time of their team
members» y «Team managers can see all time tracked for their users in the main
chart». Justificación: el esquema tiene el rol `team_manager` pero no tiene a
quién maneja cada uno —no hay tabla de equipo ni grupos (PR-20)—, y sin eso
«su equipo» no se puede calcular. Hasta que exista, en reportes decide como
`member`, igual que en proyectos (PR-57). P-03.

**RP-07 Una membresía que no está activa no ve reportes** — `replicar`
Documentado: la persona desactivada «won’t appear on the Team page anymore» y
pierde el acceso al workspace. `can()` ya corta por `status` antes que por rol
(PR-60); la acción nueva de reportes lo hereda sin cambios.

**RP-08 Esconder páginas a los members** — `fuera de alcance`
Documentado: se puede «hide Projects, Team, and reports pages» del menú de los
members, «Project managers always see Reports and Projects pages» y «Team
managers always see Reports page». Justificación: la documentación no dice en
qué plan está y nadie lo pidió; entra en el paquete de P-04.

**RP-09 Importes y tarifas en reportes** — `fuera de alcance`
Documentado: la tabla de permisos tiene «See rates and amounts | Yes (unless
disabled)» y el resumido ofrece «Show amount» / «Hide amount». Justificación:
las tarifas no existen en el plan del equipo ni en el modelo (P-32 de
`proyectos.md`).

## 2. Reporte resumido

### 2.1 Qué muestra

**RP-10 Agrupa todas las entradas visibles del rango** — `replicar`
Documentado: «It takes all the time entries in your account and groups them by
project, client, user, groups, tag, or date.» «Todas» quiere decir las que
RP-01 y RP-02 dejan ver: las de todas las personas para owner y admin, solo las
propias para el resto.

**RP-11 Dimensiones de agrupación** — `adaptar`
Documentado: proyecto, cliente, persona, grupo, etiqueta y fecha. Acá:
proyecto, cliente, persona, etiqueta y fecha. Justificación: los grupos de
usuarios no existen (PR-20, P-25 de `proyectos.md`).
_No verificado_: si la interfaz ofrece además tarea, descripción, mes, semana o
año. La página no los nombra y en la API `groups` es una lista de cadenas sin
enumerar. Tarea es la candidata obvia, porque las entradas la tienen; entra si
P-05 la confirma.

**RP-12 Subagrupación encadenada** — `replicar`
Documentado: «You can further breakdown data by sub groups.», «Group by client
-> user to see who worked for what client.» y, en la página de filtros,
«Reports will be categorized in sequence based on your chosen Group by
options». El ejemplo más largo de la página tiene tres niveles
(«group -> user -> date»).
_No verificado_: el tope de niveles, si un nivel puede ser «ninguno», y si
una dimensión se puede repetir. Acá, hasta tres niveles sin repetir, que es lo
que muestran los ejemplos. El orden de las filas dentro de un grupo es
_no verificado_ (la API tiene `sortColumn` con `GROUP`, `DURATION`, …); acá, por
duración descendente.

**RP-13 Expandir un grupo** — `replicar`
Documentado: «You can click on the number next to the group to expand it and
see a more detailed breakdown for that group.»

**RP-14 Del resumido al detallado** — `replicar`
Documentado: «By clicking on the item from the Summary report (e.g. user name,
client, project etc.) the Detailed report will be opened…» con el filtro
aplicado. Necesita el reporte detallado (RP-50); llega con él.

**RP-15 Gráfico de barras por día** — `adaptar`
Documentado: «The bar chart shows you the summary of all time entries for each
day in the selected date range.»
_No verificado_: si con rangos largos las barras pasan a semanas o meses (la API
tiene `zoomLevel` con `WEEK` y `MONTH`).
_Actualizado el 2026-10-08_: sin el tope de 31 días (P-06), el rango puede
llegar a un año y un gráfico por día deja de leerse. El
[ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md) propone que la
granularidad salga del largo del rango: por día hasta 31 días, por semana hasta
26 semanas, por mes más allá. Justificación: hasta 31 días es exactamente lo
relevado; lo demás es nuestro, porque Clockify Free nunca muestra más de 31
días. **Pendiente de aprobación del ADR 0021**, y el contrato del slice del
gráfico puede mover los umbrales.

**RP-16 Barras partidas por facturable o por proyecto** — `adaptar`
Documentado: «It also shows how much of it is billable (dark green) vs
non-billable (light green)…» y «Switch between Billability or Project with a
dropdown on the right and hover over the chart to see the exact numbers.»
Justificación: el facturable es de plan pago y acá es diseño propio (P-16 de
`proyectos.md`); la partición por facturable se compara contra este documento,
no contra el producto. Los colores son de nuestra paleta.

**RP-17 Gráfico de torta** — `replicar`
Documentado: «The pie chart shows you the summary of all time entries grouped
by a certain criteria (project, client, user, group…».
_No verificado_: si sigue al primer nivel de agrupación o a una elección propia.

**RP-18 Totales** — `adaptar`
_No verificado_: qué totales muestra la cabecera. Acá: total del rango y total
facturable, sin importe (RP-09). Cada grupo y subgrupo muestra su total, y la
suma de los grupos de un nivel es el total del nivel de arriba.
Justificación: es lo que el gráfico de RP-16 ya parte y no requiere nada pago.
Una entrada con varias etiquetas, agrupando por etiqueta, suma en cada una:
la suma de los grupos de etiqueta puede superar el total. _No verificado_ en
Clockify; P-05.

**RP-19 Formato de duración** — `adaptar`
Documentado: el formato es del workspace («Find duration format in the General
tab»), «Here's how duration formats will appear in reports and other places in
Clockify depending on your settings.», y se cambia «on any plan, including the
free plan»; el decimal es pago. Acá vale lo que diga PF-02 y PF-20 de
`perfil.md`: hoy `formatDuration` fija `h:mm`, y el reporte usa la misma
función que el resto. Justificación: el decimal es pago (P-04).

### 2.2 Rango de fechas

**RP-20 Rango, atajos y navegación** — `adaptar`
Documentado: «predefined options like Today, This week, or Last month», un
calendario para elegir desde y hasta, y «click the arrows to easily navigate
between previous and upcoming periods». La API lista los atajos `TODAY`,
`YESTERDAY`, `THIS_WEEK`, `LAST_WEEK`, `PAST_TWO_WEEKS`, `THIS_MONTH`,
`LAST_MONTH`, `THIS_YEAR` y `LAST_YEAR`, más `ABSOLUTE`.
Acá: Hoy, Ayer, Esta semana, Semana pasada, Últimas dos semanas, Este mes, Mes
pasado, Este año, Año pasado y un rango libre, con flechas que mueven el
período entero. Justificación: la lista sale de la API, no de la pantalla, y
Este año y Año pasado entran porque no hay tope de 31 días (P-06); caben en el
tope de 366 días que propone el ADR 0021, **pendiente de aprobación** (RP-21).
_No verificado_: el rango por defecto al entrar (P-05). Acá, «Esta semana».

**RP-21 Sin el tope de 31 días del plan Free** — `adaptar`
Documentado: «On the Free Plan, generating reports is limited to a maximum date
range of 31 days per report.» Es un límite comercial, no un comportamiento del
reporte.
_Actualizado el 2026-10-08, decisión del usuario (P-06)_: justificación: no se
replica el tope comercial. Si el rendimiento pide un tope, lo fija `architect`:
el ADR 0021 propone **366 días**, que cubren «Este año» y «Año pasado» y acotan
el peor pedido, y se revisa con mediciones. Es una decisión del ADR, no del
usuario, y está **pendiente de aprobación**. El mensaje es el de RP-34.

**RP-22 Zona horaria de quien mira** — `replicar`
Documentado: «When you later view the time in reports, the time zone from your
Profile Settings is used.» Los bordes de cada día y del rango se calculan en la
zona horaria del perfil de quien mira, no en la de quien cargó la entrada ni en
la del workspace (PF-05 de `perfil.md`). Dos personas en zonas distintas pueden
ver el mismo reporte con totales por día distintos, y eso es correcto.

**RP-23 Entrada que cruza la medianoche** — `adaptar`
_No verificado_ en Clockify. Acá, la misma regla que TT-95 y TT-96: la entrada
cuenta entera en el día y en la semana de su `start`, en la zona de quien mira, y
entra en el rango si su `start` cae dentro. Justificación: un reporte que parta
entradas no sumaría lo mismo que el rastreador y el timesheet.

**RP-24 Primer día de la semana** — `adaptar`
_No verificado_: la API tiene `weekStart` en el filtro; la interfaz no está
documentada. Acá, «Esta semana», «Semana pasada» y la agrupación por fecha usan
el primer día de la membresía de quien mira (PF-01). P-05.

### 2.3 Filtros

**RP-25 Filtros disponibles** — `adaptar`
Documentado, filas de la tabla de filtros: Category, Client, Currency,
Description, Kiosk, Note, Project, Status, Tag, Task, Team, Custom Fields. De
Team: «Shows time entries for specific team members or user groups»; de
Description: «Searches for specific keywords in the time entry description»;
de Status: «Filters by approval or invoicing status».
Acá: personas, cliente, proyecto, tarea, etiqueta, descripción y facturable.
Justificación: Status filtra aprobaciones y facturas, Currency y Note cuelgan
de tarifas y facturas, Kiosk y Custom Fields son pagos o no existen; Category
no está documentado más allá de un ejemplo de facturable, que acá es el filtro
de facturable (la API tiene `billable`).

**RP-26 Filtrar lo que no tiene proyecto, cliente, tarea o etiqueta** —
`replicar`
Documentado: los filtros permiten buscar «entries without a client, project,
task, or tag attached». La API tiene además `withoutDescription`.

**RP-27 No se guardan filtros sueltos** — `fuera de alcance`
Documentado: «While you cannot save just a filter setup as a standalone preset»
se guarda el reporte entero. Justificación: guardar reportes no entra en el
núcleo y el detalle de cómo se guarda está _no verificado_.

### 2.4 Qué cuenta

**RP-28 Entradas sin proyecto** — `adaptar`
Cuentan en el total y, agrupando por proyecto, forman su propio grupo «Sin
proyecto», en línea con TT-50; agrupando por cliente, las entradas sin
proyecto y las de proyectos sin cliente van en «Sin cliente» (PR-14). Lo mismo
con «Sin tarea» y «Sin etiqueta». _No verificado_: el rótulo de Clockify. P-05.

**RP-29 Proyectos archivados, tareas hechas y proyectos borrados** — `replicar`
Relevado en `proyectos.md`: «Project's time entries will still be shown in
reports» (PR-22), «Time entries for done tasks will still appear in reports»
(PR-38), y borrar un proyecto deja las horas sin proyecto (PR-26). El reporte no
filtra por estado del proyecto ni de la tarea: suma todo. El filtro de proyecto
ofrece también los archivados (la API tiene `archived`); _no verificado_ cómo los
muestra la interfaz.

**RP-30 El timer en curso no se muestra ni se suma** — `adaptar`
_No verificado_: si Clockify suma un timer corriendo y hasta qué momento. Acá el
timer es una entrada con `end` nulo y el servidor no guarda estado.
_Actualizado el 2026-10-08, decisión del usuario (P-07)_: el reporte cuenta
solo entradas cerradas. El timer en curso no aparece en ningún total, grupo ni
gráfico, y **tampoco hay un aviso** de que existe. Justificación: recargar no
cambia un total por el paso del tiempo, y el rastreador ya muestra el timer a
quien lo tiene corriendo. Cuando el timer se detiene, la entrada empieza a
contar como cualquier otra.

**RP-31 Entradas de personas inactivas** — `replicar`
Ver RP-61: cuentan en todos los totales y aparecen agrupando por persona.

### 2.5 Recarga, vacíos y errores

**RP-32 El estado del reporte vive en la URL** — `adaptar`
Rango, agrupación y filtros van en la query string: recargar, volver atrás o
pasarle el enlace a otra persona del workspace reproduce la misma vista, con los
datos que esa otra persona puede ver. Sin estado en el servidor.
Justificación: Clockify no documenta qué pasa al recargar (P-05), y el
servidor no guarda estado en memoria. Un parámetro inválido o desconocido se
descarta y se usa el valor por defecto, sin error.

**RP-33 Vacíos** — `adaptar`
Sin entradas en el rango: «No hay horas en este período», con los gráficos
ocultos y el total en cero. Con filtros que no dejan nada: «Ninguna entrada
coincide con los filtros», con la acción de quitar los filtros. Justificación:
copia propia; distinguir los dos casos evita que alguien crea que no hay datos
cuando el filtro los esconde, como PR-89.

**RP-34 Errores de validación** — `adaptar`

| Regla                                      | Mensaje                                                 |
| ------------------------------------------ | ------------------------------------------------------- |
| El fin del rango es anterior al inicio     | «La fecha de fin no puede ser anterior a la de inicio.» |
| El rango supera el tope (RP-21)            | «Elegí un período de hasta 366 días.»                   |
| Sin permiso para ver horas de otra persona | «No tenés permiso para hacer esto.» (TT-79)             |

Justificación: copia propia, con la regla de una redacción por causa. Un filtro
que nombra una persona, un proyecto o una etiqueta que ya no existe no es un
error: se ignora. El número del segundo mensaje sigue al tope del ADR 0021,
pendiente de aprobación.

**RP-35 Falla al cargar** — `adaptar`
El reporte se arma en el servidor; si la lectura falla, la pantalla muestra
«No se pudo cargar el reporte.» con «Reintentar», sin perder el rango ni los
filtros, que están en la URL.

### 2.6 Lo que no entra del resumido

**RP-36 Redondeo** — `fuera de alcance`
Documentado: «Rounding only affects the reports, meaning that the rounded
values will only be displayed in the reports and exports.» y «Clockify will
first round the duration of each time entry, and then add them up.»
Justificación: es pago. `workspace_settings.rounding_minutes` existe con
`default` 0 y nadie lo escribe; el reporte del núcleo lo ignora (P-04).

**RP-37 Crear factura desde el reporte** — `fuera de alcance`
Justificación: las facturas no se pidieron y cuelgan de tarifas.

## 3. Tablero y reporte semanal

### 3.1 Tablero

**RP-40 Solo yo y Equipo** — `replicar`
Documentado: «Each person gets a personalized dashboard that shows the time
they’ve tracked.» y «You can switch between your personal and Team Dashboard by
clicking on the Only Me/Team option at the top right corner.»

**RP-41 Contenido** — `replicar`
Documentado: el gráfico se parte «clicking on the Project/Billability at the
top right corner»; las actividades más cargadas —«By default, you see your top
10 activities, but you can choose to see all unique activities you’ve worked
on.»—; y la actividad del equipo: «Team Activity shows the most recent entry
according to the date of an entry.», con la de quien tiene «the timer running»
y, si no, «their most recently logged activity».
_No verificado_: el selector de período del tablero (la página no lo describe).

**RP-42 Quién ve el tablero de equipo** — `replicar`
Documentado: «Workspace owner and admins can see everything (time and
financials).», «Project managers can see all time tracked on their projects in
the main chart.», «Team managers can see all time tracked for their users in
the main chart» y «Regular users can see everything by default». Es RP-01 a
RP-06 aplicado al tablero; el interruptor «access Team Dashboard» está
documentado en la página de ocultar tiempo, sin plan.

**RP-43 Rango del tablero en Free** — `adaptar`
Documentado: el mismo tope de 31 días que los reportes. Sigue a P-06.

### 3.2 Reporte semanal

**RP-45 Vista de planilla de la semana** — `replicar`
Documentado: «Weekly report shows you a weekly breakdown of your time in a
classic timesheet view.» y «It shows a summary of all time for each day in the
week, as well as total time.»
_No verificado_: qué semana muestra al entrar y si respeta el primer día de la
persona («first day» NOT FOUND en la página).

**RP-46 Agrupar por persona o por proyecto** — `replicar`
Documentado: «Grouping by user is useful when you want to see how much time each
person on your team worked each day.» y «Grouping by project is useful when you
want to see how much time you’ve worked for each client.»

**RP-47 Mostrar personas sin horas** — `replicar`
Documentado: «To see who hasn’t tracked any time in a given week, group the
report by user and click on Show users without time.» y «Owners, Admins and Team
managers can see this option.» Es lo más útil del semanal para una vista de
empresa: responde «quién no cargó».

**RP-48 Filtro por aprobación e importes** — `fuera de alcance`
Documentado: «You can also filter by approval status…» y «…by clicking Show Time
-> Amount.» Justificación: aprobaciones y tarifas son pagas.

**RP-49 Correo semanal** — `fuera de alcance`
Documentado: Clockify manda al empezar cada semana un resumen de lo propio, «the
email will be sent only if you logged some time the previous week».
Justificación: nadie lo pidió y el único cron es diario.

## 4. Detallado, exportación y compartidos

Inventario corto: alcanza para decidir qué queda afuera del núcleo.

**RP-50 Reporte detallado** — `replicar`
Una lista de entradas con los mismos filtros. Documentado: «admins can edit and
delete time entries others made» y «regular members can only edit and delete
time entries that belong to them». _No verificado_: columnas en pantalla,
orden, paginación y si muestra el timer en curso.

**RP-51 Cargar tiempo de otra persona desde el detallado** — `fuera de alcance`
Documentado: «Adding time for others is a Basic feature». Justificación: pago.

**RP-52 Edición masiva desde el detallado** — `fuera de alcance`
_No verificado_ («bulk edit» NOT FOUND en la página del detallado; PR-33 de
`proyectos.md` la menciona). Justificación: no se puede relevar.

**RP-53 Exportar a PDF** — `replicar`
Documentado: «PDF (Free plan) or CSV/Excel (Basic plan or higher)», «A PDF file
can contain up to 3000 rows.», «Export of Summary report doesn’t contain
timestamps.», «Grouping options in Summary report will affect how your exports
look like.», «you can disable certain information (user, charts, etc.) from
appearing on PDF» y «Only the data covered in the report will be exported.»
_Actualizado el 2026-10-08, decisión del usuario (P-10)_: entra en el núcleo.
Exporta lo que muestra la pantalla, con el mismo alcance de RP-01.

**RP-54 Exportar a CSV y Excel** — `adaptar`
Documentado: «CSV and Excel report exports are available only on paid plans».
_Actualizado el 2026-10-08, decisión del usuario (P-10)_: entra en el núcleo.
Justificación: es pago y no se puede relevar, así que entra **como diseño
propio y no como paridad**, igual que el facturable (P-16 de `proyectos.md`):
el reviewer lo compara contra el contrato del slice, no contra Clockify. Exporta
lo que muestra la pantalla, con el mismo alcance de RP-01.

**RP-55 Reportes compartidos** — `fuera de alcance`
Documentado: «Share reports is a paid feature available on any paid plan.»;
pueden ser públicos —«Public: anyone with the link can open it.»— o del
workspace; «Lock dates option prevents viewers from seeing your shared report
for different date ranges.»; y «Shared reports always reflect the creator’s
current set of permissions (what data they can see)». Justificación: pago, y un
enlace público a horas de la empresa es exactamente lo que el login restringido
al dominio quiere evitar.

**RP-56 Otros reportes** — `fuera de alcance`
El índice tiene además gastos, asignaciones, asistencia y reportes programados.
Justificación: gastos, planificación y asistencia no existen en el plan del
proyecto, y los programados necesitan más de una corrida de cron.

## 5. Equipo: personas inactivas y sus horas

**RP-60 Desactivar no borra nada** — `replicar`
Documentado: «However, all their data is saved, including their activity and
history.» y «Only Workspace admins and owners can deactivate a user.»
Desactivar es de la fase 2; lo que el reporte necesita es saber que las horas
siguen ahí.

**RP-61 Las horas de una persona inactiva siguen en los reportes** — `replicar`
Documentado: «The time entries of deleted/inactive users will remain but you
won’t be able to filter reports by them.» y «You can see their time in the
summary report when you group it by user.» Cuentan en los totales y aparecen
agrupando por persona.
Consecuencia de modelo: el reporte lee `time_entry` por `workspace_id`, y el
nombre de la persona sale de `user`; **no puede exigir una membresía activa**,
porque esconder las horas de una persona inactiva cambiaría los totales del
pasado.

**RP-62 Filtrar por una persona inactiva** — `adaptar`
Documentado que en Clockify no se puede (RP-61), aunque la API tiene `status`
en el filtro de personas con `ALL`, `ACTIVE_WITH_PENDING`, `ACTIVE`, `PENDING` e
`INACTIVE`.
_Actualizado el 2026-10-08, decisión del usuario (P-08)_: entra en el núcleo.
El filtro de personas ofrece las activas y, aparte, las inactivas, con el
nombre tachado como en la pantalla de equipo («All inactive user names are
struck out.»). Justificación: un reporte de empresa sobre un mes pasado
necesita poder aislar a alguien que ya se fue. Solo lo ve quien ve horas de
otros (RP-01).

**RP-63 Desactivar detiene el timer** — `replicar`
Documentado: al desactivar, «…their current timer is stopped (if they have one
running).» Es de la fase 2; se anota porque, al detenerse, esa entrada pasa a
contar en el reporte (RP-30).

**RP-64 Personas invitadas** — `adaptar`
La API distingue `PENDING`. Una membresía `invited` no tiene entradas y no
aparece en el filtro de personas ni como grupo vacío. Justificación: no hay
nada que mostrar; RP-47 —mostrar personas sin horas— la excluye también.

**RP-65 Borrar una persona** — `adaptar`
_No verificado_: la misma página dice «Deleted user is permanently removed from
the workspace and Clockify app, along with all their data.» y que «The time
entries of deleted/inactive users will remain…». Se contradicen.
_Actualizado el 2026-10-08, decisión del usuario (P-09)_: **a una persona con
horas no se la borra, solo se desactiva.** Justificación: borrarla cambiaría
los totales del pasado, que es lo que RP-61 protege. El ADR 0020 pasa
`time_entry.user_id` de `cascade` a `restrict` y suma una clave compuesta
`(workspace_id, user_id)` contra `membership`, también `restrict`: borrar un
usuario o una membresía con horas falla en la base.

**RP-66 Tope de cinco personas activas** — `fuera de alcance`
Documentado: «5 active users (including the Owner and active members).»
Justificación: límite comercial del plan.

## 6. Qué entra en el núcleo

_Actualizado el 2026-10-08_: era la recomendación de este documento; ahora es
el corte del ADR 0020 con las decisiones de la sección 8. La vista que pidió el
usuario —las horas de todo el equipo o la empresa— es el **reporte resumido
agrupado por persona y por proyecto**, con exportación. Todo lo demás se agrega
sin tocar el modelo.

**Entra:**

- Quién ve: RP-01 (con la divergencia de P-01), RP-02, RP-07.
- Resumido: RP-10, RP-11, RP-12, RP-13, RP-15, RP-18, RP-19.
- Rango: RP-20, RP-21, RP-22, RP-23, RP-24.
- Filtros: RP-25 reducido a personas, cliente y proyecto; RP-26 solo «sin
  proyecto»; RP-62.
- Qué cuenta: RP-28, RP-29, RP-30, RP-31.
- Recarga, vacíos y errores: RP-32, RP-33, RP-34, RP-35.
- Exportación: RP-53, RP-54.
- Equipo: RP-60 y RP-61 como regla de lectura, RP-64, RP-65 como regla de la
  base.

**Pendiente de aprobación del ADR 0021:** el tope de 366 días de RP-20, RP-21 y
RP-34, y la granularidad por semana y por mes de RP-15.

**Vacío con P-01, no se implementa:** RP-03 y RP-05. Si la visibilidad se abre
alguna vez, entran con ella.

**Queda para la fase 2:** RP-63, y la acción de desactivar de RP-60.

**Queda para la fase 3 completa:** RP-14 (necesita el detallado), RP-16 y RP-17
(gráficos partidos y de torta: con las barras alcanza), RP-25 en el resto
(tarea, etiqueta, descripción, facturable), RP-26 en el resto, RP-40 a RP-43
(tablero), RP-45 a RP-47 (semanal; RP-47 es el candidato más fuerte si se suma
algo), RP-50.

**Fuera de alcance:** RP-04, RP-06 (hasta que exista un modelo de equipo),
RP-08, RP-09, RP-27, RP-36, RP-37, RP-48, RP-49, RP-51, RP-52, RP-55, RP-56,
RP-66.

## 7. Pendientes de definición del equipo

_Actualizado el 2026-10-08_: P-01, P-02 y P-06 a P-10 están decididos en la
sección 8; las filas se dejan porque el ADR 0020 y el mapa las citan. Siguen
abiertos P-03, P-04 y P-05.

| ID   | Punto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | **Qué ve un member en los reportes.** En el plan Free, todo (RP-01); `who_sees_all_entries` arranca en `admins`. Opciones: replicar Free (todos ven todo), quedarse con `admins` y registrar la divergencia, o hacerlo configurable, eligiendo entre el eje de Clockify (qué ve el member) y el nuestro (quién ve todo) (RP-04). Bloquea el núcleo.                                                                                                                                             |
| P-02 | **El responsable de un proyecto, ¿ve todas las horas de ese proyecto aunque P-01 restrinja?** En Clockify sí, y el ajuste de visibilidad no lo afecta (RP-05). Solo hay que decidirlo si P-01 restringe.                                                                                                                                                                                                                                                                                        |
| P-03 | **Team manager sin equipo.** El rol existe en el esquema pero no a quién maneja. Hasta que exista ese modelo, en reportes decide como `member` (RP-06). ¿Se modela en la fase 2 o se saca el rol?                                                                                                                                                                                                                                                                                               |
| P-04 | **Lo pago queda fuera del núcleo y sin fase:** redondeo, formato decimal, importes, ajuste «Regular users can see», esconder páginas, compartidos, cargar tiempo de otro, edición masiva, aprobaciones, facturas. No se puede relevar en el workspace del equipo. CSV y Excel salieron de esta lista por P-10.                                                                                                                                                                                  |
| P-05 | **Verificar en el workspace del equipo** (no es decisión, es mirar): opciones de «Group by» y tope de niveles (RP-11, RP-12); totales de la cabecera y suma por etiqueta (RP-18); rango por defecto (RP-20); primer día de la semana en «This week» (RP-24); rótulos de «sin proyecto», «sin cliente», «sin tarea» (RP-28); cómo aparece un timer corriendo en el resumido y en el detallado (RP-30); qué queda al recargar o volver a la pantalla (RP-32); qué semana abre el semanal (RP-45). |
| P-06 | **Tope del rango.** Clockify Free corta en 31 días; los planes pagos no. ¿Se replica, se levanta, o se pone un tope propio por rendimiento? Define si entran «Este año» y «Año pasado» y el mensaje de RP-34. Recomendación: sin tope comercial; si hace falta uno por rendimiento, que lo fije `architect`.                                                                                                                                                                                    |
| P-07 | **Timer en curso en los totales** (RP-30). Recomendación: no sumarlo y avisarlo.                                                                                                                                                                                                                                                                                                                                                                                                                |
| P-08 | **Filtrar por personas inactivas** (RP-62). Clockify no lo permite en la interfaz. Recomendación: permitirlo, separadas y tachadas.                                                                                                                                                                                                                                                                                                                                                             |
| P-09 | **Borrar una persona con horas** (RP-65). Hoy el `cascade` de `time_entry.user_id` borra sus horas. ¿Se prohíbe borrar a quien tiene entradas —solo se desactiva— o se cambia la clave? Es de la fase 2 pero condiciona que RP-61 se cumpla.                                                                                                                                                                                                                                                    |
| P-10 | **Exportación.** El PDF es lo único de Free (RP-53); el CSV es pago (RP-54) y probablemente lo más útil para administración. ¿Entra alguno, cuándo, y cuál?                                                                                                                                                                                                                                                                                                                                     |

## 8. Decisiones del usuario (2026-10-08)

- **P-01**: solo owner y admin ven las horas de otros; el resto ve solo las propias. Divergencia
  con Clockify Free, donde todos ven todo (RP-01).
- **P-02**: no aplica como excepción: un responsable de proyecto que no es owner ni admin ve solo
  sus horas, por P-01.
- **P-06**: sin el tope de 31 días de Clockify Free. Si el rendimiento pide un tope, lo fija
  `architect`.
- **P-07**: el timer en curso no se muestra ni se suma (RP-30).
- **P-08**: las personas inactivas se pueden filtrar, separadas y tachadas (RP-62).
- **P-09**: a una persona con horas no se la borra, solo se desactiva (RP-65).
- **P-10**: exportación a PDF, CSV y Excel (RP-53, RP-54).
