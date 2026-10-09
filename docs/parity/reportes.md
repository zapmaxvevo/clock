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

_Actualizado el 2026-10-08, contrato de R2a
([`nucleo-reportes-r2a-resumido.md`](../slices/nucleo-reportes-r2a-resumido.md),
§7 «parity-analyst», con sus
[correcciones](../slices/correcciones-nucleo-reportes-r2a-contrato.md))_: cada
regla que el slice precisa lleva su corrección fechada, y la
[sección 9](#9-núcleo-r2a) junta la pantalla. Cambian RP-01, RP-02, RP-03,
RP-05, RP-06, RP-07, RP-10, RP-11, RP-12, RP-15, RP-18, RP-19, RP-20, RP-21,
RP-22, RP-23, RP-24, RP-28, RP-29, RP-30, RP-31, RP-32, RP-33, RP-34, RP-35,
RP-61, RP-64 y la sección 6. Con el ADR 0021 aceptado, «pendiente de
aprobación» pasa a «aceptado el 2026-10-08». Las citas de los RP que cubre R2a
se volvieron a confirmar ese día: RP-12 corrige de qué página sale su ejemplo y
RP-19 pierde una cita que no está en la página.

_Actualizado el 2026-10-08, contrato de R2b
([`nucleo-reportes-r2b-atajos-cliente-y-fecha.md`](../slices/nucleo-reportes-r2b-atajos-cliente-y-fecha.md),
§7 «parity-analyst», y hallazgo P1 de sus
[revisiones](../slices/correcciones-nucleo-reportes-r2b-revisiones.md))_: cada
regla que el slice precisa lleva su corrección fechada, y la
[sección 10](#10-núcleo-r2b) junta la pantalla. Cambian RP-11, RP-12, RP-20,
RP-22, RP-24, RP-28, RP-29, RP-32, P-05 y la sección 9.5. No hay citas nuevas
de Clockify: «Past two weeks», «This year» y el orden agrupando por fecha se
buscaron ese día en las páginas del resumido y de filtros y no están (NOT
FOUND); quedan _no verificados_.

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
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-2)_: la pantalla dice
siempre el alcance de quien mira, debajo del título: «Ves solo tus horas.» o
«Ves las horas de todas las personas del workspace.». `project_manager`,
`team_manager` y `member` ven la primera, aunque sean responsables de un
proyecto. Justificación: un member que abre el enlace de un admin no confunde
su total con el del equipo (RP-32).

**RP-02 Owner y admin ven todo** — `replicar`
Documentado: «Workspace owner and admins can see everything (time and
financials).» (tablero). Ven las horas de todas las personas, incluidas las
inactivas (RP-61).
_No verificado_: si un admin ve en los reportes el tiempo de un proyecto privado
del que no es miembro. La página de proyectos solo habla del responsable
(PR-17). No importa en el núcleo: todo proyecto es público (P-17 de
`proyectos.md`).
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-2)_: owner y admin activos
ven «Ves las horas de todas las personas del workspace.» y una fila por cada
persona con horas cerradas en el período, activa o no (RP-31). Hasta R8 el
único que lo ve es el owner, porque nadie más tiene el rol de admin.

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
_Actualizado el 2026-10-08, contrato de R2a_: sin cambios; la consulta del
reporte no filtra por proyecto ni consulta `project.view`.

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
_Actualizado el 2026-10-08, contrato de R2a_: un `project_manager` responsable
de un proyecto donde otras personas tienen horas ve solo su fila y su total, en
las dos agrupaciones.

**RP-06 El team manager ve el tiempo de su equipo** — `fuera de alcance`
Documentado, de plan pago: «This role can view all tracked time of their team
members» y «Team managers can see all time tracked for their users in the main
chart». Justificación: el esquema tiene el rol `team_manager` pero no tiene a
quién maneja cada uno —no hay tabla de equipo ni grupos (PR-20)—, y sin eso
«su equipo» no se puede calcular. Hasta que exista, en reportes decide como
`member`, igual que en proyectos (PR-57). P-03.
_Actualizado el 2026-10-08, contrato de R2a_: `team_manager` ve «Ves solo tus
horas.» y solo lo propio, como `member`.

**RP-07 Una membresía que no está activa no ve reportes** — `replicar`
Documentado: la persona desactivada «won’t appear on the Team page anymore» y
pierde el acceso al workspace. `can()` ya corta por `status` antes que por rol
(PR-60); la acción nueva de reportes lo hereda sin cambios.
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-2)_: la acción es
`report.view`. «Reportes» está en la navegación para todos; sin `report.view`
—membresía `inactive`, o `invited`, que tiene sesión— la pantalla muestra el
título «Reporte resumido» y el aviso «Tu acceso al workspace está
desactivado.» con «No podés ver reportes.», sin barra, totales ni tabla, y no
se lee ninguna entrada. No es un error de lectura: no ofrece «Reintentar». El
título del aviso es el mismo del resto de la aplicación.

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
_Actualizado el 2026-10-08, contrato de R2a_: la pantalla es `/reportes`, con
el título «Reporte resumido», y su entrada «Reportes» va en la navegación entre
«Planilla» y «Proyectos». Una sola lectura por carga, con el alcance de quien
mira dentro de la consulta.

**RP-11 Dimensiones de agrupación** — `adaptar`
Documentado: proyecto, cliente, persona, grupo, etiqueta y fecha. Acá:
proyecto, cliente, persona, etiqueta y fecha. Justificación: los grupos de
usuarios no existen (PR-20, P-25 de `proyectos.md`).
_No verificado_: si la interfaz ofrece además tarea, descripción, mes, semana o
año. La página no los nombra y en la API `groups` es una lista de cadenas sin
enumerar. Tarea es la candidata obvia, porque las entradas la tienen; entra si
P-05 la confirma.
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-3)_: un nivel, por persona
o por proyecto, con «Agrupar por» y dos enlaces, «Persona» y «Proyecto»; el
elegido queda marcado. En la URL, `agrupar=persona` o `agrupar=proyecto`.
**Sin parámetro, por persona**, para los dos alcances: a un member le muestra
una fila, la suya. Justificación: es la pregunta que motivó el núcleo («cuánto
cargó cada uno») y un enlace sin parámetro da la misma vista a cualquiera
(RP-32). La agrupación por omisión de Clockify sigue _no verificada_ (P-05).
Cliente y fecha llegan con R2b; tarea, que el usuario sumó con la propuesta del
núcleo (mapa §5), y etiqueta, con R3.
_Actualizado el 2026-10-08, contrato de R2b (D-R2b-5, D-R2b-6)_: cuatro
dimensiones en un nivel. «Agrupar por» tiene cuatro enlaces, «Persona»,
«Proyecto», «Cliente» y «Fecha», en ese orden, y el elegido queda marcado. En
la URL, `agrupar=persona|proyecto|cliente|fecha`. Cualquier otro valor
—`Cliente` o `Fecha` con mayúscula, `fechas`, un parámetro repetido— se
descarta y la vista queda por persona (RP-32). Sin parámetro sigue siendo por
persona.

**RP-12 Subagrupación encadenada** — `replicar`
Documentado: «You can further breakdown data by sub groups.» y los ejemplos
«Group by client -> user to see who worked for what client» y «Group by group
-> user -> date to see who worked when», el más largo con tres niveles; en la
página de filtros, «Reports will be categorized in sequence based on your
chosen Group by options…».
_No verificado_: el tope de niveles, si un nivel puede ser «ninguno», y si
una dimensión se puede repetir. Acá, hasta tres niveles sin repetir, que es lo
que muestran los ejemplos. El orden de las filas dentro de un grupo es
_no verificado_ (la API tiene `sortColumn` con `GROUP`, `DURATION`, …); acá, por
duración descendente.
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-3)_: sin subgrupos hasta R3.
El orden de los grupos es por duración descendente; con la misma duración, por
nombre (`compareNames`, que desempata por id); «Sin proyecto» va después de los
proyectos con su misma duración.
_Actualizado el 2026-10-08, contrato de R2b (D-R2b-5, D-R2b-6)_: por cliente,
el orden de R2a: duración descendente, `compareNames` en el empate y «Sin
cliente» después de los clientes de su misma duración. **Por fecha, orden
cronológico**, del primer día al último, aunque un día posterior tenga más
horas. Justificación: es un desvío del orden por duración, porque una línea de
tiempo ordenada por duración no se lee (D-R2b-6). El orden de Clockify al
agrupar por fecha es _no verificado_: ni la página del resumido ni la de
filtros lo dicen (P-05).

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
[ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md) fija que la
granularidad salga del largo del rango: por día hasta 31 días, por semana hasta
26 semanas, por mes más allá. Justificación: hasta 31 días es exactamente lo
relevado; lo demás es nuestro, porque Clockify Free nunca muestra más de 31
días. **Aceptado el 2026-10-08 con el ADR 0021**; el contrato del slice del
gráfico puede mover los umbrales. R2a no tiene gráfico: llega con R5.

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
_Actualizado el 2026-10-08, contrato de R2a (§5.3; R6 de su revisión)_: la
cabecera muestra «Total» y «Facturable», y cada fila su «Duración», sin importe
ni porcentaje. Con un solo nivel, cada entrada está en exactamente un grupo y
la suma de los grupos es el total. **Esa igualdad vale en segundos; en pantalla
cada cifra se trunca al minuto por separado**, la de cada fila y la del total,
que sale de los segundos y no de sumar lo que muestran las filas. Por eso la
suma de lo que muestran las filas queda en el total o debajo: dos filas de
90 s muestran «0:01» cada una y el total, «0:03». Es la misma regla que la
planilla. La duración de cada entrada se trunca a segundos enteros antes de
sumar, igual que en la planilla. La suma por etiqueta llega con R3.

**RP-19 Formato de duración** — `adaptar`
Documentado: el formato es del workspace («Find duration format in the General
tab») y «Here’s how duration formats will appear in reports and other places in
Clockify depending on your settings.»; el decimal es pago («Decimal format is a
paid feature you can enable by upgrading your workspace to any of our paid
plans.»). Acá vale lo que diga PF-02 y PF-20 de `perfil.md`: hoy
`formatDuration` fija `h:mm`, y el reporte usa la misma función que el resto.
Justificación: el decimal es pago (P-04).
_Actualizado el 2026-10-08_: _no verificado_ que se cambie «on any plan,
including the free plan»: al reconfirmarla, esa cadena no está en la página
(NOT FOUND). No cambia nada acá, porque el formato no se elige.
_Actualizado el 2026-10-08, contrato de R2a_: cada cifra, las filas y los dos
totales, en `h:mm`, truncada al minuto (RP-18); el vacío muestra «0:00».

### 2.2 Rango de fechas

**RP-20 Rango, atajos y navegación** — `adaptar`
Documentado: «predefined options like Today, This week, or Last month», un
calendario para elegir desde y hasta, y «click the arrows to easily navigate
between previous and upcoming periods». La API lista los atajos `TODAY`,
`YESTERDAY`, `THIS_WEEK`, `LAST_WEEK`, `PAST_TWO_WEEKS`, `THIS_MONTH`,
`LAST_MONTH`, `THIS_YEAR` y `LAST_YEAR`, más `ABSOLUTE`.
Acá: Hoy, Ayer, Esta semana, Semana anterior, Últimas dos semanas, Este mes, Mes
pasado, Este año, Año pasado y un rango libre, con flechas que mueven el
período entero. Justificación: la lista sale de la API, no de la pantalla, y
Este año y Año pasado entran porque no hay tope de 31 días (P-06); caben en el
tope de 366 días que fija el ADR 0021, aceptado el 2026-10-08 (RP-21).
_No verificado_: el rango por defecto al entrar (P-05). Acá, «Esta semana».
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-4)_: R2a trae «Esta semana»,
las flechas y el rango libre; los demás atajos llegan con R2b. «Esta semana» al
entrar lo resolvió el usuario con la propuesta del núcleo (mapa §5).

- **La URL** lleva `desde` y `hasta`, claves de día con los dos extremos
  incluidos: `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto`.
  Sin un rango válido, «Esta semana» (RP-32).
- **Las flechas**, «Período anterior» y «Período siguiente», mueven el período
  entero: tantos días como tiene. Hasta que R2b traiga los atajos de mes, un
  período de un mes se mueve 30 o 31 días (_reemplazado el 2026-10-08 por R2b,
  abajo_). La flecha cuyo destino saldría de los años válidos (del 0100-01-01 al
  9999-12-31, como CAL-17) no se dibuja.
- **«Esta semana»** es un enlace que aparece solo cuando el período no es la
  semana actual, como en la planilla.
- **El rango libre** es un calendario de rango en un popover que abre el botón
  del período (nombre accesible «Elegir período: {período}»), con «Aplicar».
  Sobre un rango ya elegido, el primer clic arranca uno nuevo con ese día como
  inicio y el segundo lo cierra; si el segundo es anterior al primero, los
  extremos se invierten. Con el inicio elegido y sin fin, «Aplicar» toma ese
  solo día. Sobre un período de un día, un clic en ese día deja la selección
  vacía y «Aplicar» no hace nada. Esc cierra sin navegar y devuelve el foco al
  botón. Justificación: es el mismo botón con popover que el selector de
  período del calendario y la planilla, y dos campos de fecha dentro de un
  popover serían popovers anidados.
- **El rótulo**: si el período es una semana que empieza en el primer día de
  quien mira, «Esta semana», «Semana anterior» o «28/09 – 04/10»; si no,
  «05/10 – 18/10», con el año en los dos extremos si alguno no es del año de hoy
  («29/12/2025 – 04/01/2026»), y un solo día sin guion («05/10»).
- **La agrupación se conserva** con las flechas, el selector y «Esta semana»;
  el rango se conserva al cambiar la agrupación.

_Actualizado el 2026-10-08, contrato de R2b (D-R2b-1 a D-R2b-3)_: llegan los
demás atajos. Con `T` el día de hoy en la zona de quien mira (RP-22) y `S` el
primer día de su semana actual (RP-24), cada atajo es este período, con los dos
extremos incluidos:

- «Hoy»: `T`.
- «Ayer»: `T − 1`.
- «Esta semana»: `S` a `S + 6`.
- «Semana anterior»: `S − 7` a `S − 1`.
- «Últimas dos semanas»: `S − 7` a `S + 6`.
- «Este mes»: del primer al último día del mes de `T`.
- «Mes pasado»: del primer al último día del mes anterior al de `T`.
- «Este año»: del 1 de enero al 31 de diciembre del año de `T`.
- «Año pasado»: del 1 de enero al 31 de diciembre del año anterior al de `T`.

Y con ellos:

- **Son unidades enteras del calendario**: «Esta semana», «Este mes» y «Este
  año» incluyen los días que todavía no pasaron. Un año tiene 365 o 366 días y
  entra en el tope (RP-21). «Últimas dos semanas» son la semana anterior y esta,
  y no los 14 días que terminan hoy. Justificación: así todo atajo se reconoce
  por su rótulo y las flechas lo mueven sin desalinearlo.
- **«Mes pasado» y «Año pasado», no «Mes anterior»**: «Mes anterior» es el
  nombre del botón de navegación del calendario, en el mismo selector, y dos
  controles con el mismo nombre en un diálogo no se distinguen con un lector de
  pantalla. «Semana anterior» queda por la decisión del team-lead (sección 8).
- **Un atajo escribe `desde` y `hasta` en la URL**, como cualquier rango; no
  tiene un parámetro propio (RP-32).
- **El rótulo del botón** es el del atajo cuando el período coincide con el de
  uno de hoy; si no, el de R2a. Un mes entero que no es este ni el pasado se
  rotula con sus días: «01/08 – 31/08». Justificación: es el rótulo de días de
  R2a; el nombre del mes no tiene slice.
- **Un atajo cuyo período no pasa la validación no se ofrece**, con la misma
  regla que las flechas. Solo pasa cerca de los años límite: con hoy el
  9999-12-31 no se ofrecen «Hoy», «Esta semana», «Últimas dos semanas», «Este
  mes» ni «Este año», porque el día siguiente al último no existe.
- **La lista «Atajos»** va dentro del selector, antes del calendario: a la
  izquierda en pantallas anchas y arriba en las angostas. El atajo del período
  que se ve lleva `aria-current`. Elegir uno cierra el selector, navega sin
  pasar por «Aplicar» y devuelve el foco al botón del período, como Esc. El foco
  inicial sigue en el calendario y los atajos se alcanzan con Mayús+Tab. El
  selector no pasa del espacio libre de la ventana y se desplaza por dentro en
  pantallas bajas.
- **Las flechas mueven meses enteros** cuando el período lo es: si va del primer
  día de un mes al último de un mes —de 1 a 12 meses—, mueven esa cantidad de
  meses; si no, sus días, como en R2a. «Este mes» de octubre va a septiembre y a
  noviembre; de enero a marzo, a octubre a diciembre y a abril a junio; un año de
  366 días, al anterior y al siguiente enteros. Un mes, un trimestre o un año
  elegidos a mano en el calendario se mueven igual. Esto reemplaza «un período
  de un mes se mueve 30 o 31 días» de R2a. La flecha cuyo destino no pasa la
  validación no se dibuja.
- _No verificado_ (P-05): qué período es `PAST_TWO_WEEKS` en Clockify, y si
  «This month» y «This year» llegan hasta hoy o hasta el fin del mes y del año.
  Ni «Past two weeks» ni «This year» están en las páginas del resumido y de
  filtros (NOT FOUND el 2026-10-08).

**RP-21 Sin el tope de 31 días del plan Free** — `adaptar`
Documentado: «On the Free Plan, generating reports is limited to a maximum date
range of 31 days per report.» Es un límite comercial, no un comportamiento del
reporte.
_Actualizado el 2026-10-08, decisión del usuario (P-06)_: justificación: no se
replica el tope comercial. Si el rendimiento pide un tope, lo fija `architect`:
el ADR 0021 fija **366 días**, que cubren «Este año» y «Año pasado» y acotan el
peor pedido, y se revisa con mediciones. Es una decisión del ADR, no del
usuario, **aceptada el 2026-10-08**. El mensaje es el de RP-34.
_Actualizado el 2026-10-08, contrato de R2a_: los 366 días cuentan los dos
extremos: «Aplicar» acepta 366 y rechaza 367 con el mensaje de RP-34. En la
URL, un rango más largo se descarta sin aviso (RP-32). Si la medición de
volumen del slice deja una consulta fuera de presupuesto, el número vuelve a
`architect` y, si cambia, al usuario.

**RP-22 Zona horaria de quien mira** — `replicar`
Documentado: «When you later view the time in reports, the time zone from your
Profile Settings is used.» Los bordes de cada día y del rango se calculan en la
zona horaria del perfil de quien mira, no en la de quien cargó la entrada ni en
la del workspace (PF-05 de `perfil.md`). Dos personas en zonas distintas pueden
ver el mismo reporte con totales por día distintos, y eso es correcto.
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-5)_: la pantalla lo dice
debajo del título: «Los días se cortan en tu zona horaria:
America/Argentina/Buenos_Aires.», con el valor tal como está en el perfil y
**sin desplazamiento**. Justificación de la línea, que Clockify no documenta:
dos personas que comparan totales necesitan saber dónde se cortó el día; sin
desplazamiento porque, en un período que cruza un cambio de horario, uno solo
sería falso en una parte. Un día que falta entero en la zona (en `Pacific/Apia`,
el 2011-12-30) da cero, sin error.
_Actualizado el 2026-10-08, contrato de R2b (D-R2b-6)_: agrupando por fecha,
cada fila es un día civil en la zona de quien mira, y una entrada cuenta en el
día de su `start` (RP-23): en Buenos Aires, una entrada del viernes a las 23:30
es del viernes aunque en UTC sea sábado. Un día con cambio de horario dura 23 o
25 horas. El día que falta entero en `Pacific/Apia`, el 2011-12-30, no tiene
fila; una entrada a las 00:00 del 31, el instante en que habría empezado el 30,
cuenta en el 31.

**RP-23 Entrada que cruza la medianoche** — `adaptar`
_No verificado_ en Clockify. Acá, la misma regla que TT-95 y TT-96: la entrada
cuenta entera en el día y en la semana de su `start`, en la zona de quien mira, y
entra en el rango si su `start` cae dentro. Justificación: un reporte que parta
entradas no sumaría lo mismo que el rastreador y el timesheet.
_Actualizado el 2026-10-08, contrato de R2a_: la entrada que empieza el último
día del período y termina el siguiente cuenta entera; la que empieza el día
anterior al período y termina adentro no cuenta.

**RP-24 Primer día de la semana** — `adaptar`
_No verificado_: la API tiene `weekStart` en el filtro; la interfaz no está
documentada. Acá, «Esta semana», «Semana anterior» y la agrupación por fecha usan
el primer día de la membresía de quien mira (PF-01). P-05.
_Actualizado el 2026-10-08, contrato de R2a_: en R2a, «Esta semana» son los
siete días desde el primer día de la semana de quien mira (con domingo, empieza
el domingo), y el rótulo de semana de RP-20 sigue el mismo primer día. «Semana
anterior» y la agrupación por fecha llegan con R2b.
_Corregido el 2026-10-08, revisión de paridad de R2b (P1)_: decía «Semana
pasada»; el atajo se rotula «Semana anterior» (sección 8).
_Actualizado el 2026-10-08, contrato de R2b (D-R2b-2, D-R2b-6)_: «Semana
anterior» y «Últimas dos semanas» se alinean al primer día de quien mira, como
«Esta semana»: con domingo, empiezan el domingo. **La agrupación por fecha es
por día y el primer día de la semana no la cambia**; esto corrige lo que este
RP decía de ella.

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
_Actualizado el 2026-10-08, contrato de R2a_: agrupando por proyecto, «Sin
proyecto» va en gris, sin punto de color ni cliente, con el mismo rótulo que el
resto de la aplicación; con la misma duración, va después de los proyectos
(RP-12). El rótulo lo resolvió el usuario con la propuesta del núcleo (mapa
§5). «Sin cliente» llega con R2b; «Sin tarea» y «Sin etiqueta», con R3.
_Actualizado el 2026-10-08, contrato de R2b (D-R2b-5)_: agrupando por cliente,
«Sin cliente» es una sola fila con las entradas sin proyecto y las de los
proyectos sin cliente. Va en gris, con el mismo rótulo que la pantalla de
proyectos, y con la misma duración va después de los clientes (RP-12). Dos
proyectos de un mismo cliente dan una fila con la suma.

**RP-29 Proyectos archivados, tareas hechas y proyectos borrados** — `replicar`
Relevado en `proyectos.md`: «Project's time entries will still be shown in
reports» (PR-22), «Time entries for done tasks will still appear in reports»
(PR-38), y borrar un proyecto deja las horas sin proyecto (PR-26). El reporte no
filtra por estado del proyecto ni de la tarea: suma todo. El filtro de proyecto
ofrece también los archivados (la API tiene `archived`); _no verificado_ cómo los
muestra la interfaz.
_Actualizado el 2026-10-08, contrato de R2a_: un proyecto archivado y una tarea
hecha cuentan. La fila de un proyecto archivado lleva su nombre, su color y su
cliente como cualquier otra, sin marca de archivado; _no verificado_ si Clockify
lo marca en el resumido.
_Actualizado el 2026-10-08, contrato de R2b (D-R2b-5)_: agrupando por cliente,
un cliente archivado cuenta y su fila lleva su nombre como cualquier otra, sin
marca de archivado, con el mismo criterio que el proyecto archivado (sección
8). _No verificado_ si Clockify lo marca.

**RP-30 El timer en curso no se muestra ni se suma** — `adaptar`
_No verificado_: si Clockify suma un timer corriendo y hasta qué momento. Acá el
timer es una entrada con `end` nulo y el servidor no guarda estado.
_Actualizado el 2026-10-08, decisión del usuario (P-07)_: el reporte cuenta
solo entradas cerradas. El timer en curso no aparece en ningún total, grupo ni
gráfico, y **tampoco hay un aviso** de que existe. Justificación: recargar no
cambia un total por el paso del tiempo, y el rastreador ya muestra el timer a
quien lo tiene corriendo. Cuando el timer se detiene, la entrada empieza a
contar como cualquier otra.
_Actualizado el 2026-10-08, contrato de R2a_: sin cambios; la consulta cuenta
solo las entradas con fin y la pantalla no dice nada del timer.

**RP-31 Entradas de personas inactivas** — `replicar`
Ver RP-61: cuentan en todos los totales y aparecen agrupando por persona.
_Actualizado el 2026-10-08, contrato de R2a_: agrupando por persona, la fila de
una persona cuya membresía no está activa lleva el nombre seguido de
«(inactiva)» en gris. El nombre es el que la persona editó en su perfil o, sin
él, el de su cuenta. Dos personas con el mismo nombre se ven iguales: la fila no
muestra el correo.

### 2.5 Recarga, vacíos y errores

**RP-32 El estado del reporte vive en la URL** — `adaptar`
Rango, agrupación y filtros van en la query string: recargar, volver atrás o
pasarle el enlace a otra persona del workspace reproduce la misma vista, con los
datos que esa otra persona puede ver. Sin estado en el servidor.
Justificación: Clockify no documenta qué pasa al recargar (P-05), y el
servidor no guarda estado en memoria. Un parámetro inválido o desconocido se
descarta y se usa el valor por defecto, sin error.
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-2, D-R2a-4)_: la URL lleva
siempre `desde`, `hasta` y `agrupar`.

- **Un rango inválido se descarta entero, los dos extremos, sin aviso**, y se
  muestra «Esta semana». Inválido es: una clave que no es un día, un día cuyo
  siguiente sale de los años válidos (del 0100-01-01 al 9999-12-31, como
  CAL-17), `hasta` anterior a `desde`, más de
  366 días, uno solo de los dos parámetros o un parámetro repetido.
- **La agrupación se valida por su lado**: un `agrupar` válido sobrevive a un
  rango inválido, y un rango válido a un `agrupar` inválido, que se muestra por
  persona.
- **Cualquier otra clave se ignora**, también una que nombre personas
  (`personas=…`), hasta que R4 traiga el filtro.
- **Un member que abre el enlace de un admin** ve el mismo rango y la misma
  agrupación con sus propias horas, y la línea del alcance (RP-01) se lo dice.
  Es la decisión del usuario del mapa §5; R4 la hereda para el parámetro de
  personas.
- Quien edita la URL a mano y la rompe ve «Esta semana» sin saber por qué: es
  deuda conocida del contrato.

_Actualizado el 2026-10-08, contrato de R2b (D-R2b-1)_:

- **El enlace de un atajo reproduce los mismos días** para cualquiera que lo
  abra, mañana o desde otra zona, porque lleva `desde` y `hasta`. No hay un
  parámetro relativo: `periodo=…` se ignora como cualquier otra clave.
- **El rótulo se recalcula en cada carga**: un enlace de «Este mes» abierto el
  mes siguiente dice «Mes pasado», porque es eso; abierto más tarde, sus días
  («01/08 – 31/08»).
- **`agrupar=cliente` y `agrupar=fecha`** se validan como las otras dos (RP-11).
- Deuda conocida: **un enlace no sigue al período en curso**; «Este mes»
  guardado como favorito muestra siempre el mismo mes. Justificación: con un
  parámetro relativo, un enlace de «Hoy» abierto mañana o en otra zona mostraría
  otros días, y la exportación recibiría un rango abierto.

**RP-33 Vacíos** — `adaptar`
Sin entradas en el rango: «No hay horas en este período», con los gráficos
ocultos y el total en cero. Con filtros que no dejan nada: «Ninguna entrada
coincide con los filtros», con la acción de quitar los filtros. Justificación:
copia propia; distinguir los dos casos evita que alguien crea que no hay datos
cuando el filtro los esconde, como PR-89.
_Actualizado el 2026-10-08, contrato de R2a_: R2a trae solo el primer vacío:
una fila de la tabla que ocupa las dos columnas con «No hay horas en este
período», y «Total» y «Facturable» en «0:00». El segundo llega con los filtros
de R4.

**RP-34 Errores de validación** — `adaptar`

| Regla                                                                   | Mensaje                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| El fin del rango es anterior al inicio                                  | «La fecha de fin no puede ser anterior a la de inicio.» |
| El rango supera el tope (RP-21)                                         | «Elegí un período de hasta 366 días.»                   |
| Sin permiso para ver horas de otra persona                              | «No tenés permiso para hacer esto.» (TT-79)             |
| La fecha no existe o sale de los años válidos (0100-01-01 a 9999-12-31) | «Fecha inválida.»                                       |

Justificación: copia propia, con la regla de una redacción por causa. Un filtro
que nombra una persona, un proyecto o una etiqueta que ya no existe no es un
error: se ignora. El número del segundo mensaje sigue al tope del ADR 0021,
aceptado el 2026-10-08.
_Actualizado el 2026-10-08, contrato de R2a (D-R2a-2, D-R2a-4)_: **los mensajes
son del selector de período**: «Aplicar» valida con la misma regla que la URL
y, si falla, muestra el mensaje dentro del popover y no navega. En la URL no hay
mensajes: un rango inválido se descarta (RP-32). Fila por fila:

- **La primera no la produce la interfaz**: con el calendario de rango, un fin
  anterior al inicio invierte los extremos (RP-20). Queda en la regla.
- **La segunda se ve** al elegir 367 días o más.
- **La tercera no se usa**: por la decisión del usuario (mapa §5), un member con
  un enlace que nombra a otras personas ve lo propio, y la línea del alcance
  (RP-01) reemplaza el mensaje.
- **La cuarta es nueva de R2a** y, en la práctica, la interfaz tampoco la
  produce: el calendario solo elige días que existen, y salir de los años válidos
  no se alcanza navegando.
  _Corregido el 2026-10-08, revisión de paridad de R2a (P1)_: decía «años de
  cuatro cifras»; el piso real es el 0100-01-01, porque `parseDayKey` toma los
  años 0 a 99 como 1900 a 1999, la misma convención que CAL-17. Las reglas se aplican en este orden:
  la fecha, el fin anterior al inicio, el largo.

**RP-35 Falla al cargar** — `adaptar`
El reporte se arma en el servidor; si la lectura falla, la pantalla muestra
«No se pudo cargar el reporte.» con «Reintentar», sin perder el rango ni los
filtros, que están en la URL.
_Actualizado el 2026-10-08, contrato de R2a_: como la planilla, con el título
«Reporte resumido» arriba. Mientras carga, la pantalla muestra un esqueleto
anunciado como «Cargando el reporte». Una membresía que no está activa no cae
acá: es RP-07.

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
_Actualizado el 2026-10-08, contrato de R2a_: la consulta no pone ninguna
condición sobre el estado de la membresía, del proyecto ni de la tarea, y la
fila de la persona lleva «(inactiva)» (RP-31). El filtro por persona inactiva
(RP-62) llega con R4.

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
_Actualizado el 2026-10-08, contrato de R2a_: una membresía `invited` no
aparece como fila, porque no tiene entradas y R2a no muestra personas sin horas
(llegan con R9). Si entra a `/reportes`, ve el aviso de RP-07: no tiene
`report.view`.

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

**Aceptado el 2026-10-08 con el ADR 0021:** el tope de 366 días de RP-20, RP-21
y RP-34, y la granularidad por semana y por mes de RP-15.

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
abiertos P-03, P-04 y lo que queda de P-05.

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

_Actualizado el 2026-10-08, contrato de R2b_: P-05 suma qué período es «Past
two weeks» (`PAST_TWO_WEEKS` en la API) y si «This month» y «This year» llegan
hasta hoy o hasta el fin del mes y del año (RP-20), y el orden de las filas
agrupando por fecha (RP-12). Mientras tanto vale lo de D-R2b-2 —la semana
anterior y esta, y meses y años enteros— y el orden cronológico de D-R2b-6. No
bloquea.

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

Ese día, con los ADR 0020 y 0021 aceptados (mapa del núcleo, §5), además:

- **P-05, en parte**: se resuelve con la propuesta del núcleo la tarea como dimensión (RP-11),
  «Esta semana» por defecto (RP-20) y los rótulos «Sin …» (RP-28). El resto de P-05 sigue
  para la sesión en el workspace.
- **Admins antes de la fase 2**: el slice R8 (cambiar el rol entre member y admin), después de
  R2a. Desactivar sigue por el procedimiento SQL del mapa.
- **Un enlace que nombra a otras personas**, abierto por un member, muestra lo propio: el
  parámetro se descarta (RP-32); la tercera fila de RP-34 no se usa.
- **«Mostrar personas sin horas»** (RP-47) entra como R9, después de R4.

Decisiones del team-lead sobre R2a (2026-10-08): el atajo de RP-20 se rotula «Semana anterior»,
como `weekKeyLabel` en el resto de la aplicación, y no «Semana pasada»; «Fecha inválida.» queda
como lo fija el esquema del contrato; la fila de un proyecto archivado va sin marca, porque el
reporte suma todo sin mirar el estado (RP-29).

## 9. Núcleo, R2a

_2026-10-08._ Contrato:
[`nucleo-reportes-r2a-resumido.md`](../slices/nucleo-reportes-r2a-resumido.md),
aprobado con las
[correcciones de arquitectura](../slices/correcciones-nucleo-reportes-r2a-contrato.md).
Es el primer slice del núcleo con pantalla. La regla de cada comportamiento
está en la corrección fechada de su RP; esta sección junta la pantalla para que
el reviewer la recorra de una vez.

**Cubre:** RP-01, RP-02, RP-07, RP-10, RP-11 (un nivel, persona o proyecto),
RP-12 (solo el orden), RP-18, RP-19, RP-20 («Esta semana», flechas y rango
libre), RP-21, RP-22, RP-23, RP-24 (solo «Esta semana»), RP-28 (solo «Sin
proyecto»), RP-29, RP-30, RP-31, RP-32, RP-33 (solo el primer vacío), RP-34,
RP-35, RP-61 y RP-64. RP-03, RP-05 y RP-06 quedan como decisión y no
implementan nada.

**Queda para después:** los demás atajos, cliente y fecha (R2b); subgrupos,
tarea y etiqueta (R3); filtros y el segundo vacío de RP-33 (R4); gráfico (R5);
exportación (R6, R7); cambiar el rol (R8); personas sin horas (R9). No entran
RP-14, RP-36, RP-09 ni el importe y el porcentaje por grupo.

### 9.1 La pantalla `/reportes`

«Reportes» en la navegación, entre «Planilla» y «Proyectos», para los cinco
roles. De arriba abajo:

| Parte   | Contenido                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Título  | «Reporte resumido»                                                                                                                                                                         |
| Barra   | «Período anterior» y «Período siguiente»; el botón del período, «Elegir período: {período}»; «Esta semana», si el período no es la semana actual; «Agrupar por» con «Persona» y «Proyecto» |
| Alcance | «Ves solo tus horas.» o «Ves las horas de todas las personas del workspace.» (RP-01, RP-02)                                                                                                |
| Zona    | «Los días se cortan en tu zona horaria: {zona}.» (RP-22)                                                                                                                                   |
| Totales | «Total» y «Facturable», en `h:mm` truncado al minuto (RP-18, RP-19)                                                                                                                        |
| Tabla   | Columnas «Persona» o «Proyecto», y «Duración». Persona: el nombre y, si no está activa, «(inactiva)». Proyecto: el punto de color, el nombre y el cliente en gris; «Sin proyecto» en gris  |

### 9.2 Qué puede hacer cada rol

| Membresía                                           | Ve                                                       | Acciones                                                          |
| --------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `owner`, `admin` activas                            | Todas las personas del workspace con horas, activas o no | Cambiar el período y la agrupación; recargar; compartir el enlace |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio, aunque sea responsable de un proyecto    | Las mismas                                                        |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                        | Ninguna                                                           |

### 9.3 Estados

| Estado            | Qué se ve                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Cargando          | Un esqueleto anunciado como «Cargando el reporte» (RP-35)                                        |
| Vacío             | La barra, las dos líneas, los totales en «0:00» y la fila «No hay horas en este período» (RP-33) |
| Error de lectura  | El título y «No se pudo cargar el reporte.» con «Reintentar» (RP-35)                             |
| Sin `report.view` | El título, «Tu acceso al workspace está desactivado.» y «No podés ver reportes.» (RP-07)         |
| Al recargar       | La misma vista: todo está en la URL; lo inválido se descarta sin aviso (RP-32)                   |

### 9.4 Lo que la interfaz no produce

- **El mensaje del fin anterior al inicio** (RP-34): el calendario de rango
  invierte los extremos. Queda en la regla que comparten la URL y el selector.
- **«Fecha inválida.»** (RP-34): el calendario solo elige días que existen.
- **«No tenés permiso para hacer esto.»** (RP-34): lo reemplaza la línea del
  alcance.
- **Un aviso del timer en curso** (RP-30), por P-07.

### 9.5 Divergencias visibles que el reviewer no debe marcar como errores

- La suma de lo que muestran las filas puede quedar unos minutos debajo del
  total (RP-18).
- Un rango inválido en la URL se descarta sin aviso (RP-32).
- Dos personas con el mismo nombre se ven iguales (RP-31).
- Hasta R8, solo el owner ve el reporte de equipo (RP-02).

_Corregido el 2026-10-08, contrato de R2b (D-R2b-3)_: se retiró «Las flechas
mueven por días, también un período de un mes (RP-20)»; desde R2b un período de
meses enteros se mueve por meses (RP-20).

## 10. Núcleo, R2b

_2026-10-08._ Contrato:
[`nucleo-reportes-r2b-atajos-cliente-y-fecha.md`](../slices/nucleo-reportes-r2b-atajos-cliente-y-fecha.md),
aprobado con cambios por `architecture-reviewer`, con sus
[revisiones](../slices/correcciones-nucleo-reportes-r2b-revisiones.md).
Extiende la pantalla de R2a. La regla de cada comportamiento está en la
corrección fechada de su RP; esta sección junta lo que cambia en la pantalla, y
lo que no nombra sigue como en la [sección 9](#9-núcleo-r2a).

**Cubre:** RP-11 (un nivel, persona, proyecto, cliente o fecha), RP-12 (el
orden por cliente y por fecha), RP-20 (los nueve atajos y las flechas por
meses), RP-22 (los días de la agrupación por fecha), RP-24 (los atajos de
semana), RP-28 («Sin cliente»), RP-29 (el cliente archivado) y RP-32 (el enlace
de un atajo). Los permisos y el alcance no cambian: RP-01, RP-02 y RP-07
deciden igual por cliente y por fecha. La agrupación por fecha se mergea
después de la comprobación contra Neon del usuario (§6.3 del contrato); si el
slice se parte, lo de fecha pasa a R2c con esta misma sección.

**Queda para después:** subgrupos, la fecha como subnivel, tarea y etiqueta
(R3); filtros y el segundo vacío de RP-33 (R4); gráfico y los tramos por semana
y por mes (R5); exportación (R6, R7); cambiar el rol (R8); personas sin horas
(R9). No tienen slice: los días sin horas en la agrupación por fecha, el rótulo
de un mes con su nombre, un período relativo en la URL, atajos propios, días
hábiles y trimestres con nombre.

### 10.1 La barra y el selector del período

- **«Agrupar por»** con cuatro enlaces, en este orden: «Persona», «Proyecto»,
  «Cliente» y «Fecha». El elegido lleva `aria-current`; todos conservan el
  rango (RP-11). En pantallas angostas el grupo pasa a dos líneas.
- **El botón del período** dice el nombre del atajo cuando el período es el de
  uno de hoy («Mes pasado», «Este año»); si no, el rótulo de R2a. Un mes entero
  que no es este ni el pasado dice sus días: «01/08 – 31/08» (RP-20).
- **«Período anterior» y «Período siguiente»** mueven meses enteros cuando el
  período lo es, de 1 a 12; si no, sus días (RP-20).
- **«Esta semana»** fuera del selector, como en R2a: solo si el período no es
  la semana actual. Con el selector abierto hay dos enlaces «Esta semana», el
  de la barra y el atajo.
- **El selector** tiene, antes del calendario, la lista «Atajos» con los nueve
  enlaces en el orden de RP-20: a la izquierda en pantallas anchas, arriba en
  las angostas. El atajo del período que se ve lleva `aria-current`. Elegir uno
  cierra el selector, navega y devuelve el foco al botón del período; con Ctrl
  o Cmd lo abre en otra pestaña y el selector queda abierto. El foco inicial
  sigue en el calendario y los atajos se alcanzan con Mayús+Tab. El calendario,
  el mensaje de error y «Aplicar» no cambian. El selector no pasa del espacio
  libre de la ventana y, si no entra de alto, se desplaza por dentro.

### 10.2 La tabla

- **Columnas**: «Persona», «Proyecto», «Cliente» o «Fecha», y «Duración».
- **Cliente**: el nombre del cliente, archivado o no, sin marca (RP-29);
  «Sin cliente» en gris, con las entradas sin proyecto y las de proyectos sin
  cliente (RP-28). Por duración, empate por nombre y «Sin cliente» después de
  los clientes de su misma duración (RP-12).
- **Fecha**: una fila por día con horas, en orden cronológico (RP-12), con los
  días cortados en la zona de quien mira (RP-22). El rótulo va en un `<time>`
  con el día en `dateTime`: el día de la semana abreviado y la fecha en el
  formato de la persona, «jue, 01/10», con el año si no es el de hoy. Sin «Hoy»
  ni «Ayer». Justificación: en un reporte la fecha explícita no se confunde al
  recargar otro día.
- **Los totales** son los de R2a en las cuatro agrupaciones: cada entrada está
  en exactamente un proyecto, un cliente y un día, así que en segundos el total
  es la suma de las filas (RP-18).

### 10.3 Estados

- **Vacío por cliente o por fecha**: el de R2a, la fila «No hay horas en este
  período» con «Total» y «Facturable» en «0:00» (RP-33). Por fecha no hay filas
  de días en cero.
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  en las cuatro agrupaciones.
- **Al recargar**: la misma vista. Un atajo es un rango en la URL y su rótulo
  se recalcula con el día de hoy (RP-32).

### 10.4 Divergencias visibles que el reviewer no debe marcar como errores

- Por fecha, el orden es cronológico y no por duración (RP-12); el de Clockify
  está _no verificado_.
- Por fecha, un día sin horas no tiene fila, tampoco el día que falta entero en
  la zona (RP-22).
- Un mes entero que no es este ni el pasado se rotula con sus días
  («01/08 – 31/08»), no con su nombre (RP-20).
- Un enlace no sigue al período en curso: «Este mes» abierto el mes siguiente
  muestra el mismo mes, rotulado «Mes pasado» (RP-32).
- «Últimas dos semanas» son la semana anterior y esta, y no los 14 días hasta
  hoy; «Este mes» y «Este año» incluyen los días por venir (RP-20). Lo de
  Clockify está _no verificado_ (P-05).
- El atajo del mes anterior se llama «Mes pasado», no «Mes anterior» (RP-20).
