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

_Actualizado el 2026-10-09, contrato de R3, parte A
([`nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md`](../slices/nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md),
§7 «parity-analyst», con sus
[correcciones](../slices/correcciones-nucleo-reportes-r3-contrato.md))_: el
slice se partió y esta actualización cubre solo la parte A, que se mergea como
R3a; cada regla que precisa lleva su corrección fechada, y la
[sección 11](#11-núcleo-r3) junta la pantalla. Cambian RP-11, RP-12, RP-18,
RP-28, RP-29 y P-05. Lo de la parte B queda anotado como pendiente de R3b
(sección 11.5). Ese día se buscó en las páginas del resumido y de filtros:
«multiple tags» no está en ninguna de las dos; «Group by task», en la del
resumido; «Without task», «Without tag», «No task» y «No tag», en la de filtros
(NOT FOUND). Se reconfirmó «It takes all the time entries in your account and
groups them by project, client, user, groups, tag, or date.» (FOUND). Lo que
dependía de las que no están queda _no verificado_.

_Actualizado el 2026-10-09, R3b, la parte B del mismo contrato (§7
«parity-analyst»)_: describe lo que hace el código de la rama
`nucleo/r3b-subgrupos`. Cada regla lleva su corrección fechada; la sección 11
pasa lo que estaba pendiente de R3b a lo que quedó hecho (secciones 11.5 a
11.8) y la 11.4 suma sus divergencias. Cambian RP-11, RP-12, RP-13 (de
`replicar` a `adaptar`), RP-18, RP-32, P-05 y la sección 11, y se suma P-11.
Ese día se buscó en la página del resumido: «You can further breakdown data by
sub groups.», «You can click on the number next to the group to expand it and
see a more detailed breakdown for that group.» y «Group by client -> user to
see who worked for what client» (FOUND); «collapse», un tope de niveles, qué
pasa con lo expandido al recargar y «3000» (NOT FOUND). En la de filtros: «Apply
the sorting options you want using one, two, or all three drop down menus» y la
lista de opciones de «Group by» que la sigue (FOUND; RP-11, RP-12); «expand»,
«collapse», «None» como opción de agrupación y que la agrupación se conserve al
recargar (NOT FOUND).

_Actualizado el 2026-10-09, contrato de R4, parte A
([`nucleo-reportes-r4-filtros.md`](../slices/nucleo-reportes-r4-filtros.md),
§7 «parity-analyst»)_: el slice se partió y esta actualización cubre solo la
parte A, que se mergea como R4a —los filtros de cliente y de proyecto—, y
describe lo que hace el código de la rama `nucleo/r4a`. Cada regla que precisa
lleva su corrección fechada, y la [sección 12](#12-núcleo-r4) junta la
pantalla. Cambian RP-25, RP-26, RP-29, RP-32, RP-33 y RP-34. Lo de la parte B
—el filtro de personas, RP-31, RP-62, RP-64 y `personas` en RP-32 y RP-34—
queda para R4b. No hay citas nuevas de Clockify: esta revisión no volvió a
buscar en las páginas del resumido ni de filtros, así que lo que estaba _no
verificado_ sigue igual.

_Actualizado el 2026-10-09, R4b, la parte B del mismo contrato (§7
«parity-analyst»)_: describe lo que hace el código de la rama `nucleo/r4b`,
recorrido con la aplicación: el filtro de personas, con las inactivas aparte y
tachadas y sin las invitadas. Cada regla que precisa lleva su corrección
fechada; la sección 12 suma lo de la parte B (secciones 12.6 a 12.8) y la 12.4,
sus divergencias. Cambian RP-25, RP-31, RP-32, RP-34, RP-62 y RP-64. No hay
citas nuevas de Clockify: esta revisión no volvió a buscar en las páginas del
resumido, de filtros ni de equipo, así que lo que estaba _no verificado_ sigue
igual, y RP-61 y RP-62 conservan sus citas del 2026-10-08.

_Actualizado el 2026-10-09, contrato de R10, parte A
([`nucleo-reportes-r10-descripcion-mes-y-semana.md`](../slices/nucleo-reportes-r10-descripcion-mes-y-semana.md),
§7 «parity-analyst»)_: el contrato tiene dos partes (D-R10-1) y esta
actualización cubre la A, que se mergea como R10a —agrupar por semana y por
mes—, y describe lo que hace el código de la rama `nucleo/r10a`, recorrido con
la aplicación. Cada regla que precisa lleva su corrección fechada, y la
[sección 13](#13-núcleo-r10) junta la pantalla. Cambian RP-11, RP-12, RP-24,
RP-32, P-05 y P-11. Lo de la parte B —la descripción, RP-28 y el tope del
primer nivel— queda para R10b. No hay citas nuevas de Clockify: la lista de
«Group by» es la del relevamiento de R3b, y esta revisión no volvió a buscar
en las páginas del resumido ni de filtros, así que cómo rotula Clockify una
semana o un mes sigue _no verificado_.

_Actualizado el 2026-10-09, R10b, la parte B del mismo contrato (§7
«parity-analyst»)_: describe lo que hace el código de la rama `nucleo/r10b`,
recorrido con la aplicación: agrupar por descripción y el tope de 3000 filas
en el primer nivel. Cada regla que precisa lleva su corrección fechada; la
sección 13 suma lo de la parte B (secciones 13.6 a 13.9) y la 13.4, sus
divergencias, y la 11.4 corrige lo que decía del primer nivel. Cambian RP-11,
RP-12, RP-18, RP-28, RP-32, RP-33, P-05 y las secciones 11.4 y 13. No hay
citas nuevas de Clockify: «Description» es un ítem de la lista de «Group by»
del relevamiento de R3b, y esta revisión no volvió a buscar en las páginas del
resumido ni de filtros, así que si Clockify distingue mayúsculas al agrupar
por descripción, cómo recorta un texto largo y cómo rotula el grupo sin
descripción siguen _no verificados_.

_Actualizado el 2026-10-10, contrato de R5
([`nucleo-reportes-r5-grafico-de-barras.md`](../slices/nucleo-reportes-r5-grafico-de-barras.md),
§7 «parity-analyst»)_: el contrato es un solo slice (D-R5-1), aprobado en la
segunda pasada de `architecture-reviewer`, y esta actualización describe lo que
fija: el gráfico de barras entre los totales y la tabla. Cada regla que precisa
lleva su corrección fechada, y la [sección 14](#14-núcleo-r5) junta la
pantalla. Cambian RP-15, RP-16, RP-18, RP-22, RP-24, RP-33 y P-05. Ese día se
buscó en la página del resumido: «The bar chart shows you the summary of all
time entries for each day in the selected date range.» y «hover over the
chart» (FOUND); «zoom», «by week» y «by month» (NOT FOUND). Si Clockify pasa a
semanas o meses con períodos largos sigue _no verificado_, y no se puede mirar
en el workspace del equipo, porque el plan Free no pasa de 31 días.

_Actualizado el 2026-10-12, R6a, la primera parte del contrato de R6
([`nucleo-reportes-r6-exportar-csv-y-excel.md`](../slices/nucleo-reportes-r6-exportar-csv-y-excel.md),
§7 «parity-analyst», aprobado en la segunda pasada de
[sus correcciones](../slices/correcciones-nucleo-reportes-r6-contrato.md))_: el
contrato tiene dos partes (D-R6-1) y esta actualización cubre la primera, que
se mergea como R6a —la ruta de exportación, el documento del archivo y el CSV
con el resumen y las entradas—, y describe lo que hace el código de la rama
`nucleo/r6a-csv`. Cada regla que precisa lleva su corrección fechada, y la
[sección 15](#15-núcleo-r6) junta la pantalla y el archivo. Cambian RP-18,
RP-22, RP-32, RP-33, RP-53 y RP-54. El Excel queda para R6b. Ese día se buscó
en la página de exportación: «A PDF file can contain up to 3000 rows.»,
«Export of Summary report doesn’t contain timestamps. If you need timestamps,
you should export Detailed report.», «Grouping options in Summary report will
affect how your exports look like.», «Only the data covered in the report will
be exported.» y «To get a full export (with all time entries), go to Detailed
report, choose the longest date range, and export the results.» (FOUND);
«separator», «decimal», «file name» y «audit» (NOT FOUND). Cómo es el CSV de
Clockify —separador, decimales, columnas, nombre del archivo— sigue _no
verificado_ y no se puede mirar en el workspace del equipo, porque es pago
(RP-54).

_Actualizado el 2026-10-12, R6b, la segunda parte del contrato de R6 (§7
«R6b», con la decisión B4 de
[sus correcciones](../slices/correcciones-nucleo-reportes-r6b.md))_: describe
lo que hace el código de la rama `nucleo/r6b-excel`: el Excel, con dos hojas y
celdas con tipo, sobre el mismo documento, la misma ruta y los mismos topes
que el CSV. Cada regla que precisa lleva su corrección fechada, y la sección 15
suma lo del Excel. Cambian RP-18, RP-54 y la sección 15. Ese día se buscó en
la página de exportación: «xlsx», «worksheet» y «number format» (NOT FOUND);
«sheet» aparece solo dentro de «spreadsheet». Cómo es el Excel de Clockify
sigue _no verificado_ y no se puede mirar en el workspace del equipo, porque es
pago (RP-54).

_Actualizado el 2026-10-12, contrato de R9
([`nucleo-reportes-r9-personas-sin-horas.md`](../slices/nucleo-reportes-r9-personas-sin-horas.md),
§7 «parity-analyst», aprobado en la primera pasada de `architecture-reviewer`
con [sus correcciones](../slices/correcciones-nucleo-reportes-r9-contrato.md))_:
el contrato es un solo slice (D-R9-1), que implementa la rama
`nucleo/r9-sin-horas`, y esta actualización describe lo que fija: «Mostrar
personas sin horas» en el reporte resumido agrupado por persona. Cada regla que
precisa lleva su corrección fechada, y la [sección 16](#16-núcleo-r9) junta la
pantalla y el archivo. Cambian RP-12, RP-13, RP-32, RP-33, RP-47 (del semanal al
resumido, de `replicar` a `adaptar`), RP-54, RP-62, RP-64, P-05 y las secciones
6, 12.4 y 15.2. Ese día se buscó en la página del semanal: «To see who hasn’t
tracked any time in a given week, group the report by user and click on Show
users without time.» y «Owners, Admins and Team managers can see this option.»
(FOUND, las citas de RP-47); «inactive», «invited», «pending», «deactivated»,
«toggle» y «checkbox» (NOT FOUND). En las páginas del resumido y de filtros,
«without time», «Show users» y «hasn’t tracked» (NOT FOUND): Clockify documenta
la opción solo en el semanal. Si muestra a las inactivas o a quien entró después
de la semana, en qué orden pone las filas sin horas y si el control es una
casilla o un interruptor siguen _no verificados_ (P-05).

_Actualizado el 2026-10-12, contrato de R7
([`nucleo-reportes-r7-exportar-pdf.md`](../slices/nucleo-reportes-r7-exportar-pdf.md),
§7 «R7a — parity-analyst», aprobado con menores en la verificación de la tercera
pasada de `architecture-reviewer`, con
[sus correcciones](../slices/correcciones-nucleo-reportes-r7-contrato.md))_: el
contrato tiene tres partes (D-R7-1) y esta actualización cubre R7a —el PDF de
la cabecera y el resumen— y describe lo que fija el contrato. R7-0 fue la
medición; R7b, el gráfico dentro del PDF, no se arranca hasta que el usuario lo
pida. Cada regla que precisa lleva su corrección fechada, y la
[sección 17](#17-núcleo-r7) junta la pantalla y el archivo. Cambian RP-53, con
la corrección del texto de R6a que decía que el PDF traía las entradas, y P-05.
Ese día se buscó en la página de exportación: «PDF (Free plan) or CSV/Excel
(Basic plan or higher)», «A PDF file can contain up to 3000 rows.», «Export of
Summary report doesn’t contain timestamps.», «If you need timestamps, you should
export Detailed report.», «Grouping options in Summary report will affect how
your exports look like.», «Only the data covered in the report will be
exported.», «You can control what you wish to get in exports by using customize
export feature.», «Customize export», «you can disable certain information
(user, charts, etc.) from appearing on PDF» y «change report name, use your
company’s logo, and more» (FOUND); «A4», «Letter», «portrait», «landscape»,
«orientation», «header», «page number», «font», «file name», «emoji» y «special
characters» (NOT FOUND). La página no dice en qué plan está «Customize export».
Cómo es el PDF de Clockify —la página, los encabezados, los números de página,
la fuente, el nombre del archivo, qué hace con más de 3000 filas— sigue _no
verificado_; a diferencia del CSV y el Excel, **se puede mirar en el workspace
del equipo**, porque el PDF es del plan Free (P-05).

_Actualizado el 2026-10-13, contrato de R7
([`nucleo-reportes-r7-exportar-pdf.md`](../slices/nucleo-reportes-r7-exportar-pdf.md),
§7 «R7b», con la ronda de R7b de `architecture-reviewer` del mismo día,
«aprobado con retoques» en su segunda pasada)_: el usuario pidió R7b el
2026-10-13 (D-R7-12). La implementa la rama `nucleo/r7b-grafico`, y esta
actualización describe lo que fija el contrato: el gráfico de R5 dentro del PDF
del reporte resumido. Reemplaza lo que el párrafo anterior decía de R7b («no se
arranca hasta que el usuario lo pida»). La regla está en la corrección fechada
de RP-53, y la [sección 17](#17-núcleo-r7) suma el gráfico. Cambian RP-53, P-05
y la sección 17. Ese día se buscó en la página de exportación: «you can disable
certain information (user, charts, etc.) from appearing on PDF» (FOUND), la
única oración con «chart»; «graph» (NOT FOUND). Cómo dibuja Clockify el gráfico
en su PDF sigue _no verificado_; se puede mirar en el workspace del equipo,
porque el PDF es del plan Free (P-05).

_Actualizado el 2026-10-13, contrato de R8
([`nucleo-reportes-r8-cambiar-rol.md`](../slices/nucleo-reportes-r8-cambiar-rol.md),
§6 «parity-analyst», aprobado en la segunda ronda de `architecture-reviewer` y
corregido el mismo día por decisión del usuario, con la revisión de la
corrección aprobada con retoques)_: el contrato es un solo slice, que implementa
la rama `nucleo/r8-cambiar-rol`, y esta actualización describe lo que fija y lo
que hace el código de esa rama, leído y no recorrido con la aplicación: la
pantalla `/equipo`, donde el owner y los admins hacen administradora a una
persona activa, y solo el owner le quita el rol. Cada regla que precisa lleva
su corrección fechada, y la [sección 18](#18-núcleo-r8) junta la pantalla.
Cambian RP-02 y las secciones 6 y 9.5; se suman RP-67 a RP-70 en la sección 5,
P-12 y cuatro filas del vocabulario. Ese día se buscó en la página de admins, en
su tabla «Action | Permission»: «Manage users | Yes (except removing Admin role
– Owner only)», «Assign user roles | Yes» y «Transfer owner role | Yes (Owner
only)» (FOUND); en la de invitar personas: «Click on +Role next to the person
you wish to make admin», «Tick the Admin checkbox», «To remove them as admin,
untick the checkbox Admin.», «Only the Workspace owner can remove an admin role
from someone, transfer ownership to another user, and delete the workspace.»,
«To make someone an owner, current owner needs to:» y «Click Transfer
ownership» (FOUND), y «Edit roles» y «Are you sure» (NOT FOUND); en la de quién
puede qué: «Admins can perform actions such as creating and managing projects,
assigning user roles, and defining billable rates.» (FOUND), y «transfer»,
«Make admin», «Remove admin» y «Edit roles» (NOT FOUND). Con ese hallazgo el
usuario decidió **replicar Clockify: solo el owner quita el rol de admin**
(RP-68). Si quitarlo pide confirmación, si los roles se combinan y si el cambio
vale en una sesión abierta siguen _no verificados_ (P-12).

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
- https://clockify.me/help/administration/user-roles-and-permissions/admins
  (consultada el 2026-10-13, para R8)
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
| Team (página)           | Equipo                      |
| Owner                   | Propietario                 |
| Admin                   | Administrador               |
| Regular user            | Miembro                     |

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
_Corregido el 2026-10-13, R8 (D-R8-2, D-R8-8)_: **desde R8, owner y admin
activos ven el reporte de equipo**, y el owner o un admin nombra admins en
`/equipo` (RP-67, sección 18). Reemplaza «Hasta R8 el único que lo ve es el
owner, porque nadie más tiene el rol de admin.» de la corrección de R2a,
arriba. El alcance se decide en cada pedido: una persona ascendida ve «Ves las
horas de todas las personas del workspace.» en su pedido siguiente —recargar,
navegar o exportar—, y una a la que el owner le quita el rol vuelve a «Ves solo
tus horas.» sin volver a entrar; lo que ya estaba dibujado en su pantalla queda
hasta ese pedido. Un `project_manager` o un `team_manager` sigue viendo lo
propio: R8 no les cambia el rol.

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

_Actualizado el 2026-10-09, contrato de R3, parte A (D-R3-8; R3a)_: seis
dimensiones en un nivel. «Agrupar por» tiene seis enlaces, «Persona»,
«Proyecto», «Cliente», «Tarea», «Etiqueta» y «Fecha», en ese orden, y el
elegido queda marcado. En la URL,
`agrupar=persona|proyecto|cliente|tarea|etiqueta|fecha`. `Tarea`, `tareas`,
`etiquetas` o cualquier otro valor se descartan y la vista queda por persona
(RP-32). **La tarea entra por la decisión del usuario (mapa §5), no por
Clockify**: «Group by task» no está en la página del resumido (NOT FOUND el
2026-10-09) y la lista documentada sigue siendo la de RP-10. Justificación: las
entradas tienen tarea y «cuánto se cargó en cada tarea» es una pregunta del
equipo. Los subniveles quedan para R3b (sección 11.5).

_Corregido el 2026-10-09, relevamiento de R3b_: la página de filtros enumera
las opciones de «Group by» en una lista, debajo de «Apply the sorting options
you want using one, two, or all three drop down menus»: «Project», «Client»,
«User», «Description», «Group», «Tag», «Month», «Week» y «Date» (FOUND como
ítems de la lista). Reemplaza el _no verificado_ de arriba en lo que la lista
dice: **descripción, mes y semana están documentados** y Clock no los tiene;
**tarea y año no están en la lista**, así que la tarea sigue entrando solo por
la decisión del usuario. Descripción, mes y semana no tienen slice ni marca
hasta que el equipo decida (P-11). En qué orden muestra la interfaz las
opciones y si el resumido y el semanal ofrecen la misma lista siguen _no
verificados_ (P-05).

_Actualizado el 2026-10-09, R10a (D-R10-5, D-R10-6)_: ocho dimensiones.
«Agrupar por» tiene ocho enlaces, «Persona», «Proyecto», «Cliente», «Tarea»,
«Etiqueta», «Fecha», «Semana» y «Mes», en ese orden, y el elegido queda
marcado. En la URL, `agrupar=…|semana|mes`, en ASCII. `Semana`, `semanas`,
`Mes`, `meses`, `week` o `month` se descartan y la vista queda por persona
(RP-32). **Semana y mes entran por la lista documentada de la página de
filtros** (corrección de R3b, arriba) y por la decisión del usuario sobre P-11.
Se suman al final para no mover el orden de R2a a R3, y así la fecha, la
semana y el mes quedan juntos, de menor a mayor. El orden de Clockify en
pantalla sigue _no verificado_ (P-05). La descripción llega con R10b.

_Actualizado el 2026-10-09, R10b (D-R10-5, D-R10-8, D-R10-9, D-R10-10)_: nueve
dimensiones. «Agrupar por» suma «Descripción» al final, después de «Mes», y el
elegido queda marcado. En la URL, `agrupar=…|descripcion`, en ASCII y sin
tilde. `descripción` con tilde, `Descripcion`, `descripciones` o `description`
se descartan y la vista queda por persona (RP-32). **La descripción entra por
la lista documentada de la página de filtros** («Description», corrección de
R3b, arriba) y por la decisión del usuario sobre P-11.

- **La clave es el texto exacto, tal como se guardó**: «Reunión» y «reunión»
  son dos grupos, y también «Reunión semanal» con dos espacios en el medio y
  una «é» escrita con dos puntos de código. La cadena vacía es «Sin
  descripción» (RP-28). Justificación: juntar mayúsculas o espacios en la base
  depende de la colación de cada base y obliga a elegir qué texto muestra el
  grupo; el usuario lo aceptó así el 2026-10-09 (pregunta 2 de §10 del
  contrato).
- **Cada fila muestra los primeros 100 caracteres** del texto, contados como
  puntos de código (un emoji es uno), con «…» si sigue. El texto entero no se
  ve en el reporte. Justificación: una descripción llega a 3000 caracteres y
  un nivel, a 3000 grupos.
- **El tope de 3000 filas alcanza al primer nivel**, de cualquier dimensión:
  entra entero o no se muestra (sección 13.7). Solo la descripción lo pasa en
  la práctica: «Descripción» de todo el equipo en un año no se muestra, y un
  mes sí. Para las otras ocho no cambia nada visible.

Si Clockify distingue mayúsculas y cómo recorta el texto siguen _no
verificados_ (P-05).

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

_Actualizado el 2026-10-09, contrato de R3, parte A (D-R3-3, D-R3-4; R3a)_:
solo el orden de un nivel. Por tarea y por etiqueta, el de R2a: duración
descendente, `compareNames` sobre el nombre de la tarea o de la etiqueta en el
empate (que desempata por id) y «Sin tarea» o «Sin etiqueta» después de los
grupos de su misma duración. Dos tareas con el mismo nombre en proyectos
distintos se ordenan como dos grupos. **Los subgrupos siguen pendientes de
R3b** (sección 11.5).

_Actualizado el 2026-10-09, R3b (D-R3-5, D-R3-6, D-R3-8)_: **hasta tres
niveles, sin repetir.** El tope de tres ya no es solo de los ejemplos: la página
de filtros dice «Apply the sorting options you want using one, two, or all three
drop down menus» (FOUND el 2026-10-09). Si una dimensión se puede repetir en dos
niveles y cómo se deja vacío un menú siguen _no verificados_: «None» no está en
la página de filtros (NOT FOUND).

- **«Agrupar por» elige el primer nivel**, con los seis enlaces de R3a.
  Después, **«Subagrupar por»** con el botón «Segundo nivel: {dimensión}» o
  «Segundo nivel: Ninguno», siempre, y «Tercer nivel: …», solo si hay segundo
  nivel. Cada botón abre una lista con «Ninguno» primero y después las
  dimensiones que no están en los niveles de arriba, en el orden de «Agrupar
  por»: el segundo nivel ofrece cinco y el tercero, cuatro. La elegida, o
  «Ninguno», lleva `aria-current`.
- **En la URL, `subagrupar`**, con uno o dos valores separados por coma en el
  orden de los niveles: `agrupar=proyecto&subagrupar=fecha,etiqueta`. Sin
  subniveles, la URL es la de R2b, con tres parámetros (RP-32).
- **Elegir una dimensión que ya está en otro nivel los intercambia.** Desde
  Persona → Proyecto, «Proyecto» en «Agrupar por» da Proyecto → Persona; desde
  Persona → Proyecto → Fecha, «Fecha» en «Agrupar por» da Fecha → Proyecto →
  Persona. La lista del segundo nivel ofrece también lo que está en el tercero,
  y elegirlo los intercambia: Persona → Proyecto → Fecha, con «Fecha» en el
  segundo, da Persona → Fecha → Proyecto. La del tercero ofrece solo lo que no
  está arriba, así que nunca intercambia.
- **«Ninguno» quita ese nivel y los de abajo**: en el segundo, el reporte
  vuelve a un nivel y el botón del tercero desaparece; en el tercero, quedan
  dos.
- **El orden dentro de cada nivel es el de su dimensión**, entre los hermanos
  de un mismo grupo: los días, en orden cronológico; el resto, por duración
  descendente, `compareNames` en el empate y el «Sin …» después de los de su
  misma duración. Es el orden de un nivel aplicado a cada grupo.
- **Un grupo de abajo es la combinación de todo su camino**: debajo de una
  persona están solo sus proyectos, y debajo de cada proyecto, solo los días de
  esa persona en ese proyecto. El mismo día debajo de dos proyectos son dos
  grupos, cada uno con lo suyo.

La marca sigue en `replicar` para los subgrupos y los tres niveles, que son los
de Clockify. «Ninguno», el intercambio y `subagrupar` son la forma propia de
elegirlos: justificación, la URL tiene que reproducir los niveles (RP-32) y el
intercambio permite pasar de Persona → Proyecto a Proyecto → Persona con un
clic. _No verificado_: el orden de Clockify dentro de un subgrupo (P-05).

_Actualizado el 2026-10-09, R10a (D-R10-3, D-R10-5, D-R10-6)_: **por semana y
por mes, orden cronológico**, como por fecha, aunque una posterior tenga más
horas; justificación, la de D-R2b-6. Valen todas las combinaciones de hasta
tres niveles sin repetir. **Una dimensión de tiempo debajo de otra es la
intersección**: en Mes → Semana, la semana que cruza el fin de mes está debajo
de los dos meses, cada vez con su parte; en Semana → Mes, debajo de esa semana
están sus dos meses; Fecha → Semana da un hijo por día. El intercambio de
«Agrupar por» vale igual: «Fecha» desde Mes → Fecha da Fecha → Mes. _No
verificado_: si Clockify permite combinar dos dimensiones de tiempo (P-05).

_Actualizado el 2026-10-09, R10b (D-R10-6, D-R10-10)_: **por descripción, el
orden de R2a**: duración descendente; en el empate, `compareNames` sobre el
texto que se muestra, sin distinguir mayúsculas («alfa» antes que «Beta»), y
entre dos que muestran el mismo texto recortado, por su clave. «Sin
descripción» va después de las descripciones de su misma duración. La
descripción se combina con las otras ocho en cualquiera de los tres niveles,
sin repetir: debajo de una descripción, sus personas o sus proyectos; debajo
de una persona, sus textos. El intercambio de «Agrupar por» vale igual: desde
Persona → Descripción, «Descripción» da Descripción → Persona. **El tope del
primer nivel cambia D-R3-6**: el primer nivel también entra entero o no entra
(sección 13.7). _No verificado_: el orden de Clockify por descripción (P-05).

_Actualizado el 2026-10-12, contrato de R9 (D-R9-3, D-R9-7)_: **con «Mostrar
personas sin horas» (RP-47), las personas sin horas van en el primer nivel,
después de todas las que tienen horas**, por nombre: `compareNames` sobre el
nombre que se muestra, que desempata por id. Van también después de una persona
con entradas que suman «0:00»: esa tiene horas y conserva el orden por
duración. Es la regla de los «Sin …» —después de los de su misma duración—
aplicada a quien no tiene entradas, y así una fila con botón nunca queda entre
dos sin botón. Las filas con horas siguen en el orden de siempre. _No
verificado_: en qué orden pone Clockify a las personas sin horas en el semanal
(P-05).

**RP-13 Expandir un grupo** — `adaptar`
Documentado: «You can click on the number next to the group to expand it and
see a more detailed breakdown for that group.»

_Actualizado el 2026-10-09, R3b (D-R3-6, D-R3-9)_: la marca pasa de `replicar`
a `adaptar`. Justificación: el control no es el número junto al grupo sino un
botón con el chevrón y el nombre del grupo, y lo abierto no viaja en la URL,
que es la decisión del contrato mientras el usuario no conteste la pregunta 2
de su §10.

- **El árbol entero llega con la página**: expandir y contraer no vuelve al
  servidor.
- **Todo contraído al cargar y en cada navegación que cambia la URL** dentro de
  la pantalla: las flechas, «Esta semana», un atajo, «Aplicar», un enlace de
  «Agrupar por» o uno de los subniveles. Se ven los grupos del primer nivel.
- **Cada grupo con hijos lleva un botón** dentro de su encabezado de fila, con
  el chevrón, oculto al lector, y el contenido del encabezado: su nombre es el
  del grupo y su estado, `aria-expanded`. Clic, Enter o Espacio lo abren y lo
  cierran, y el foco queda en el botón. Un grupo del último nivel que se
  muestra no tiene botón y deja un espacio del ancho del chevrón, para que los
  nombres alineen. Con un solo nivel, o con los subniveles cortados por el tope,
  ninguna fila tiene botón ni ese espacio: la tabla se ve como la de R3a.
- **Contraer oculta a todos los descendientes; reabrir los muestra como
  estaban**: con P1 y su martes abiertos, cerrar P1 y reabrirlo deja el martes
  abierto.
- **Las filas contraídas no están en la página**, y el botón no lleva
  `aria-controls`. La sangría marca el nivel y es solo visual.
- **Lo abierto no sobrevive a una recarga, a «Atrás» ni a un enlace copiado.**
- No hay «Expandir todo» ni «Contraer todo».
- _No verificado_: qué cuenta el número del que habla la cita, y qué hace
  Clockify con lo expandido al recargar; «collapse» y la recarga no están en la
  página del resumido (NOT FOUND el 2026-10-09). P-05.

_Actualizado el 2026-10-12, contrato de R9 (D-R9-3, D-R9-12)_: **una fila sin
horas no tiene botón**, con cualquier cantidad de niveles: en Persona →
Proyecto → Fecha, una persona sin horas es una fila del primer nivel sin hijos,
que deja el espacio del chevrón si alguna otra fila tiene botón. Si ninguna lo
tiene —un período sin horas con la opción—, la tabla se ve como la de un nivel,
con el encabezado de todos los niveles pedidos (sección 11.7). Encender o
apagar la opción cambia la URL y vuelve a contraer el árbol.

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

_Actualizado el 2026-10-10, contrato de R5 (D-R5-4 a D-R5-9)_: **la
granularidad sale del largo del período**, con los umbrales del ADR 0021 sin
mover (D-R5-4): de 1 a 31 días, una barra por día (de 1 a 31 barras); de 32 a
182, una por semana (de 5 a 27); de 183 a 366, una por mes (de 6 a 13). Los días
cuentan los dos extremos. «Hoy», «Ayer», las semanas, «Últimas dos semanas»,
«Este mes» y «Mes pasado» van por día; «Este año» y «Año pasado», por mes. **El
gráfico no sigue a la agrupación**: el mismo período da el mismo gráfico
agrupado por persona, por semana o por Mes → Semana → Fecha.

- **Una barra por tramo, en orden, también las que no tienen horas**, en cero.
  Los tramos son los de la tabla: días civiles, semanas y meses en la zona de
  quien mira (RP-22), con su primer día de la semana (RP-24).
- **El nombre de cada barra es el rótulo de la fila de la tabla** para el mismo
  tramo, con la regla del año, y su duración: «mié, 30/09: 1:00», sin «Hoy» ni
  «Ayer»; «28/09 – 04/10 solo 01/10 – 04/10: 3:15»; «septiembre de 2025:
  1:15». La semana y el mes cortados por el período llevan «solo …» con los
  días que cuentan.
- **Las marcas del eje** son cortas y sin año, hasta siete: por día y por
  semana, el primer día que cuenta la barra en el formato de fecha del perfil
  («01/10», o «10-01» con `yyyy-MM-dd`); por mes, el nombre abreviado («oct»).
  Son hasta siete, una cada `ceil(n / 7)` barras desde la primera, con el área
  de las columnas de 24rem o más; más angosta, se ve una de cada dos de esas:
  con 31 días, cuatro, las de la 1.ª, la 11.ª, la 21.ª y la 31.ª barra. **La
  escala** va en `h:mm`, de dos a cinco líneas desde «0:00» («0:15», «2:00»,
  «2000:00»).
- **El valor**: con el puntero sobre una barra, o con el foco en ella, la línea
  de arriba del gráfico dice su nombre; con las dos cosas en barras distintas,
  gana la del puntero. **Con teclado, el gráfico es una sola parada de
  tabulación**: derecha y abajo llevan a la barra siguiente; izquierda y
  arriba, a la anterior; Inicio y Fin, a la primera y la última, sin dar la
  vuelta. Con Alt, Ctrl, Meta o Mayúsculas no mueven el foco: quedan para el
  navegador. Una barra en cero también se puede señalar, enfocar y ver enfocada,
  porque el elemento es la columna entera.
- **La tabla de datos**: debajo de las barras, «Ver los datos del gráfico»,
  cerrado, con una fila por barra, también las en cero, y las columnas «Fecha»,
  «Semana» o «Mes», y «Duración».

Justificación: por día hasta 31 días es lo relevado; el resto es nuestro,
porque Clockify Free no pasa de 31 días. La línea del valor con el foco y el
foco itinerante son para que el gráfico se lea sin mouse (D-R5-9). Documentado:
«hover over the chart to see the exact numbers» (oración de RP-16, FOUND el
2026-10-10). _No verificado_: cómo rotula Clockify el eje, qué texto muestra al
pasar el puntero y si el gráfico se usa con teclado (P-05).

**RP-16 Barras partidas por facturable o por proyecto** — `adaptar`
Documentado: «It also shows how much of it is billable (dark green) vs
non-billable (light green)…» y «Switch between Billability or Project with a
dropdown on the right and hover over the chart to see the exact numbers.»
Justificación: el facturable es de plan pago y acá es diseño propio (P-16 de
`proyectos.md`); la partición por facturable se compara contra este documento,
no contra el producto. Los colores son de nuestra paleta.

_Actualizado el 2026-10-10, contrato de R5 (D-R5-2)_: **sigue fuera del
núcleo** (sección 6, fase 3). La barra de R5 no se parte por facturable ni por
proyecto, es de un solo color y no hay menú para cambiar la partición; el
facturable se lee en la cabecera. Los colores son los tokens del tema
(`--chart-2` la barra, `--primary` la activa), sin el verde de Clockify.

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

_Actualizado el 2026-10-09, contrato de R3, parte A (D-R3-3; R3a)_: **por
etiqueta, una entrada con varias etiquetas suma entera en cada una**, así que
la suma de las filas puede pasar el total. **La cabecera tiene siempre el total
real**: por etiqueta, «Total» y «Facturable» se leen aparte, sin la unión con
las etiquetas, en la misma foto que las filas (una transacción de solo lectura
`repeatable read`); por las otras cinco agrupaciones son la suma de las filas,
como en R2a, porque cada entrada está en exactamente un grupo —también por
tarea: una entrada tiene una tarea o ninguna—. Con las entradas del recorrido 10
del contrato, E1 muestra 1:30, E2 1:20 y «Sin etiqueta» 0:15, y «Total», 2:05.
Cada cifra se sigue truncando al minuto por separado. **La pantalla lo avisa**
debajo de la línea de la zona, solo agrupando por etiqueta: «Una entrada con
varias etiquetas suma en cada una: las filas por etiqueta pueden sumar más que
el total.». La línea sale con la agrupación y no con los datos: aparece aunque
ninguna entrada del período tenga dos etiquetas, y también en el vacío.
Justificación: copia propia; «pueden» es cierto siempre, y saber si pasó
obligaría a otra lectura. _No verificado_ en Clockify cómo suma por etiqueta y
qué dice la cabecera: «multiple tags» no está en la página del resumido ni en la
de filtros (NOT FOUND el 2026-10-09); sigue en P-05. Lo del árbol —los niveles
debajo de una etiqueta suman lo de su grupo, y la línea con la etiqueta en un
subnivel— queda para R3b (sección 11.5).

_Actualizado el 2026-10-09, R3b (D-R3-3, D-R3-6, D-R3-9)_: en el árbol, **cada
fila muestra lo de su grupo**, truncado al minuto por separado, como en un
nivel.

- **Sin la etiqueta en ningún nivel**, los hijos de un grupo suman lo del grupo,
  en segundos.
- **Debajo de una etiqueta**, los niveles reparten las entradas de esa etiqueta
  y suman lo de su grupo.
- **Con la etiqueta en un subnivel**, los hijos de etiqueta de un grupo pueden
  sumar más que él, porque una entrada con varias etiquetas suma en cada una:
  en Persona → Etiqueta, las etiquetas de una persona pueden pasar a la
  persona. Los niveles de arriba de la etiqueta suman lo real.
- **«Total» y «Facturable» son siempre los reales**: con la etiqueta primero, se
  leen aparte; si no, son la suma del primer nivel, que no tiene la etiqueta.
  Un árbol cortado por el tope no los cambia.
- **La línea de la etiqueta** aparece si la etiqueta es cualquiera de los
  niveles que se muestran, aunque ese nivel esté contraído, y en el vacío con la
  etiqueta entre los niveles pedidos. Si el tope cortó el nivel de la etiqueta,
  no aparece, porque ese nivel no se muestra.
- Con las entradas del recorrido 11 del contrato, Proyecto → Fecha → Etiqueta:
  P1 1:30, su martes 1:00 con E1 1:00 debajo, su jueves 0:30 con «Sin etiqueta»
  0:30 debajo, y P2 0:45.

_Actualizado el 2026-10-09, R10b (D-R10-10)_: **con el primer nivel que no
entra, «Total» y «Facturable» se leen aparte**, de las entradas, como por
etiqueta, en la misma foto: son los reales aunque la tabla no muestre ninguna
fila. Por descripción cada entrada está en exactamente un grupo, así que con
el primer nivel a la vista el total es la suma de las filas, como en R2a.

_Actualizado el 2026-10-10, contrato de R5 (D-R5-2, D-R5-6)_: **las barras
suman «Total», en segundos**: cada entrada cerrada del período cae en
exactamente una barra, la de su `start` (RP-23), porque el gráfico lee las
entradas sin unirlas con las etiquetas. Vale también agrupando por etiqueta,
donde las filas pueden pasar el total y las barras no, y con el primer nivel
que no entra, donde la tabla no muestra filas y el gráfico sí. Las barras se
leen con el mismo alcance, las mismas personas elegidas y los mismos filtros
que la cabecera, en la misma foto. En pantalla, cada barra se trunca al minuto
por separado, como las filas: la suma de lo que dicen las barras queda en el
total o unos minutos debajo. El gráfico no muestra el facturable (RP-16).

_Actualizado el 2026-10-12, R6a (D-R6-6, D-R6-8, D-R6-9)_: **en el archivo,
«Total» y «Facturable» van en la cabecera**, cada uno con dos celdas: la
duración en `h:mm` y las horas en decimal. Son los mismos de la pantalla, leídos
en la misma foto: los reales también agrupando por etiqueta y con el primer
nivel que no entra.

- **Cada cifra se trunca al minuto por separado**, como en pantalla: las dos de
  la cabecera, la de cada fila del resumen y la de cada entrada. «Duración» y
  «Horas» de una misma fila salen de los mismos minutos, así que dicen lo mismo
  («1:29» y «1,48»).
- **«Horas» se trunca además al centésimo** desde esos minutos, con aritmética
  entera (`Math.floor(minutos × 5 / 3)` centésimos): 1 minuto es «0,01», 2 son
  «0,03», 89 son «1,48», 1439 son «23,98»; 3599 s son «0:59» y «0,98».
- **Así la suma de una columna queda en el total o por debajo, nunca arriba.**
  En «Entradas», la suma de «Duración» o de «Horas» de todas las filas no pasa
  la de «Total»: las entradas son exactamente las que suma el total, en la
  misma foto, también agrupando por etiqueta, porque cada entrada es una sola
  fila. En «Resumen», lo mismo vale para las filas de un mismo nivel (filtrar
  «Nivel» = 1 da el primer nivel) y para los hijos de un grupo, **salvo con la
  etiqueta en los niveles**, donde las filas ya pueden pasar lo de arriba en
  segundos (correcciones de R3a y R3b, arriba) y el archivo lleva la nota de
  etiquetas. Redondear «Horas» la dejaría arriba: tres entradas de 1 minuto
  darían «0,02» cada una, 0,06, contra «0,05» del total de 3 minutos;
  truncando dan «0,01» cada una, 0,03.
- Con muchas entradas cortas la diferencia se nota: cien entradas de 1 minuto
  suman «1,00» en «Horas» contra «1,66» de «Total».

_Actualizado el 2026-10-12, R6b (D-R6-6, D-R6-12)_: **en el Excel las cifras
son números, con la misma regla que el CSV**. «Duración» es minutos / 1440
con el formato `[h]:mm`, y «Horas», los mismos centésimos truncados del CSV
divididos por 100, con el formato `0.00`: 1 minuto es 0,01, 89 son 1,48 y
3599 s son 0,98. Los minutos de cada cifra se siguen truncando por separado.
Así lo que se ve en cada celda y lo que da `=SUMA()` de una columna quedan en
el total o por debajo, nunca arriba, con la misma salvedad de la etiqueta, y
el CSV y el Excel del mismo reporte dicen las mismas horas.

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

_Actualizado el 2026-10-10, contrato de R5 (D-R5-5)_: **en el gráfico, el día
que falta entero tiene barra**: en `Pacific/Apia`, del 2011-12-23 al 2012-01-12
por día, la barra del 30/12 está, en cero, y la entrada del 31 está en la del 31. La tabla agrupada por fecha sigue sin esa fila. Justificación: sacar la
barra obligaría a deduplicar los cortes fuera de la base, que el ADR 0021 deja
en manos de `width_bucket`. Un día de 23 o 25 horas es una barra con sus horas.
Las barras se cortan en la zona de quien mira: una entrada del 30/09 a las
23:30 de Buenos Aires está en la barra del 30/09 desde ahí y en la del 01/10
desde Madrid.

_Actualizado el 2026-10-12, R6a (D-R6-8, D-R6-9)_: **el archivo dice la zona en
la fila «Zona horaria» de la cabecera**, tal como está en el perfil y sin
desplazamiento, como la línea de la pantalla. **Los días y las horas de cada
entrada** —«Fecha de inicio», «Hora de inicio», «Fecha de fin» y «Hora de
fin»— **están en la zona de quien exporta**, no en la de quien cargó la
entrada: una entrada del 30/09 a las 23:30 de Buenos Aires es «2026-09-30» y
«23:30» exportada desde Buenos Aires, y «2026-10-01» y «04:30» desde Madrid. Una
que termina después de medianoche lleva el día siguiente en «Fecha de fin»; la
entrada cuenta entera en el día de su inicio (RP-23). «Generado» es la fecha y
la hora en esa misma zona, y el período y los rótulos de fecha, semana y mes del
resumen son los de la pantalla. Dos personas en zonas distintas que exportan el
mismo enlace bajan archivos distintos, y es correcto.

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

_Actualizado el 2026-10-09, R10a (D-R10-2, D-R10-3)_: **agrupando por semana,
cada semana empieza el primer día de quien mira**: las mismas entradas, vistas
con domingo y con lunes, dan semanas distintas, y cada fila lo dice con sus
días. La semana se corta en la zona de quien mira (RP-22): una entrada del
domingo a las 23:30 en Buenos Aires es del lunes desde Madrid. **La agrupación
por fecha sigue sin depender del primer día**, y la por mes tampoco.

_Actualizado el 2026-10-10, contrato de R5 (D-R5-4)_: **las barras por semana
empiezan el primer día de quien mira**, como las filas de semana: las mismas
horas vistas con domingo y con lunes dan barras distintas (del miércoles
2026-09-30 al domingo 2026-11-15, la segunda barra empieza el 05/10 con lunes y
el 04/10 con domingo). Un período de 32 a 182 días agrupado por semana da
barras con los mismos rótulos, los mismos «solo …» y las mismas duraciones que
las filas. Las barras por día y por mes no dependen del primer día.

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

_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-3, D-R4-8; R4a)_:
entran **cliente y proyecto**; personas llega con R4b, y tarea, etiqueta,
descripción y facturable siguen para la fase 3.

- **«Filtrar por»**, después de «Subagrupar por», con un botón por filtro:
  «Clientes» y «Proyectos». El texto del botón es su nombre accesible y dice lo
  elegido: «Proyectos: todos», «Proyectos: {nombre}» con uno y «Proyectos: 3»
  con más. «Sin proyecto» cuenta como uno y se nombra así.
- **El panel** de cada botón: un buscador con el foco al abrir, que filtra por
  el nombre sin distinguir mayúsculas ni acentos; las opciones con casillas,
  primero las vigentes en un grupo nombrado por el filtro y después las
  archivadas en «Archivados» (RP-29), cada grupo por nombre; y «Aplicar». Un
  proyecto lleva su punto de color y su cliente en gris.
- **Dentro de un filtro, o; entre filtros, y**: una entrada cuenta si su
  proyecto es uno de los elegidos —o no tiene y «Sin proyecto» está elegido— y
  si su proyecto es de uno de los clientes elegidos. Cliente y proyecto se
  cruzan sin excepción: un proyecto de C1 con C2 elegido no deja nada. Un
  filtro sin nada elegido no restringe.
- **Se aplican a todo**: a cada nivel del árbol, a «Total» y «Facturable»
  —también por etiqueta— y al tope de 3000 filas, que cuenta lo filtrado.
- **«Aplicar»** navega con lo elegido, cierra el panel y deja el foco en el
  botón, que ya dice lo nuevo; sin nada elegido, quita ese filtro. Con más de
  50 elegidos, «Sin proyecto» contado, no navega (RP-34).
- **Esc o un clic afuera** cierran sin aplicar; al abrir de nuevo, lo tildado
  es lo de la pantalla y el buscador está vacío. Lo que la búsqueda esconde
  sigue tildado y se aplica.

_Actualizado el 2026-10-09, R4b (D-R4-3, D-R4-4, D-R4-8)_: entra **personas**,
el tercer filtro de la reducción; tarea, etiqueta, descripción y facturable
siguen para la fase 3.

- **«Personas»** va primero en «Filtrar por», antes de «Clientes», y solo para
  quien ve horas de otros (owner y admin, RP-01); sin ese permiso el botón no
  existe. Dice «Personas: todas» sin nada elegido, el nombre con una —también
  una inactiva, sin «(inactiva)»— y la cantidad con más.
- **El panel** es el de los otros dos: «Buscar personas», con el foco al abrir,
  que busca por el nombre sin distinguir mayúsculas ni acentos; las activas en
  el grupo «Personas» y después, si hay, las inactivas en «Inactivas», con el
  nombre tachado (RP-62); cada grupo por nombre. El nombre es el que la persona
  editó en su perfil o, sin él, el de su cuenta, como en su fila (RP-31); las
  opciones no llevan color ni detalle. Una persona activa sin horas en el
  período está: el filtro ofrece las personas del workspace, no las que tienen
  horas.
- **Dentro de personas, o; con cliente y proyecto, y**: una entrada cuenta si es
  de una de las personas elegidas y además cumple los otros filtros. Dos
  personas y un proyecto dan lo de las dos en ese proyecto; una persona y un
  cliente dejan afuera lo que esa persona cargó sin proyecto (RP-26).
- **Se aplica a todo**, como los otros: a cada nivel del árbol, a «Total» y
  «Facturable» —también por etiqueta— y al tope de 3000 filas. Con personas
  elegidas, el total es solo de ellas.
- **«Aplicar», Esc, el clic afuera y el tope de 50** son los de los otros dos
  filtros: con 51 personas tildadas, «Elegí hasta 50.» y no navega (RP-34).

**RP-26 Filtrar lo que no tiene proyecto, cliente, tarea o etiqueta** —
`replicar`
Documentado: los filtros permiten buscar «entries without a client, project,
task, or tag attached». La API tiene además `withoutDescription`.

_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-3; R4a)_: entra solo
**«Sin proyecto»**, como opción del filtro de proyecto: la primera de la lista,
en gris, sin color ni cliente, con el mismo rótulo que la fila de RP-28, y
siempre visible, porque la búsqueda no la esconde. Se elige sola o con
proyectos; en la URL es el valor `sin-proyecto` de `proyectos`, al final de la
lista. **El filtro de cliente deja afuera lo que no tiene proyecto**: una
entrada sin proyecto no tiene cliente, así que con un cliente elegido no
cuenta, aunque «Sin proyecto» esté elegido. «Sin cliente», «Sin tarea», «Sin
etiqueta» y `withoutDescription` como filtros siguen para la fase 3.

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

_Actualizado el 2026-10-09, contrato de R3, parte A (D-R3-3, D-R3-4; R3a)_:
agrupando por tarea, **«Sin tarea» es una sola fila con las entradas de un
proyecto sin tarea y las que no tienen proyecto** —una tarea no existe sin su
proyecto—, en gris y sin proyecto. Agrupando por etiqueta, **«Sin etiqueta» son
las entradas sin ninguna etiqueta**: una entrada con al menos una nunca está
ahí. Va en gris y en singular, distinto del «Sin etiquetas» con que el
calendario dice que una entrada no tiene ninguna: uno es un grupo y el otro,
una lista vacía. Los dos rótulos son del reporte, no de la pantalla de
proyectos. Una tarea borrada deja sus entradas sin tarea, que pasan a «Sin
tarea»; una etiqueta borrada sale de sus entradas, y la que no tenía otra pasa
a «Sin etiqueta». Con la misma duración, los dos van después (RP-12).
_No verificado_: el rótulo de Clockify; «Without task», «Without tag», «No
task» y «No tag» no están en la página de filtros (NOT FOUND el 2026-10-09).

_Actualizado el 2026-10-09, R10b (D-R10-8)_: agrupando por descripción,
**«Sin descripción» es una sola fila con las entradas cuya descripción es la
cadena vacía**, la única forma de «sin descripción»: la aplicación guarda la
descripción sin espacios en los bordes. Va en gris, con el rótulo del
rastreador (TT-50), y con la misma duración va después de las descripciones
(RP-12). Una entrada con texto, aunque sea de un carácter, nunca está ahí. _No
verificado_: el rótulo de Clockify (P-05).

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

_Actualizado el 2026-10-09, contrato de R3, parte A (D-R3-3, D-R3-4; R3a)_:
agrupando por tarea, **una tarea hecha cuenta** y su fila lleva su nombre y su
proyecto como cualquier otra, sin marca; el proyecto de la tarea se muestra
aunque esté archivado, también sin marca. Agrupando por etiqueta, **una
etiqueta archivada cuenta** y su fila lleva su nombre, sin marca. Justificación
de que no se marquen: el mismo criterio que el proyecto y el cliente archivados
(sección 8), porque el reporte suma todo sin mirar el estado. _No verificado_ si
Clockify marca una tarea hecha en el resumido, ni qué hace con una etiqueta
archivada: no se relevó ninguna página de etiquetas. P-05.

_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-3, D-R4-5; R4a)_: los
filtros de cliente y de proyecto **ofrecen los archivados**, aparte, en un
grupo «Archivados» después de los vigentes, con el nombre sin tachar: el
tachado es de las personas inactivas (P-08), que llegan con R4b. Un cliente o
un proyecto archivado se filtra como cualquiera y sus horas cuentan. El filtro
de cliente ofrece todos los clientes del workspace; el de proyecto, los que
`project.view` deja ver a quien mira, archivados incluidos (sección 12.4). Un
proyecto vigente de un cliente archivado va entre los vigentes. _No
verificado_ sigue cómo los muestra Clockify.

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

_Actualizado el 2026-10-09, R4b (D-R4-8)_: **en el filtro de personas, dos
personas con el mismo nombre son dos casillas iguales**, como sus filas: la
opción no muestra el correo. Cada casilla elige a su persona —una da su fila y
su total, y las dos dan dos filas con el mismo nombre—, pero solo probando se
sabe cuál es cuál. Distinguirlas queda fuera del núcleo. Elegida, una persona
inactiva sigue con «(inactiva)» en su fila, sin tachar: el tachado es del
filtro (RP-62).

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

_Actualizado el 2026-10-09, R3b (D-R3-5, D-R3-6, D-R3-8)_:

- **`subagrupar` se valida aparte y se descarta entero, sin aviso.** Vale con
  uno o dos valores de `persona`, `proyecto`, `cliente`, `tarea`, `etiqueta` o
  `fecha`, separados por una coma, distintos entre sí y distintos del primer
  nivel efectivo: el de `agrupar` o, si `agrupar` falta o no vale, `persona`.
  Se descarta con un valor desconocido, una mayúscula (`Fecha`), un espacio
  (` fecha`), una coma de más (`fecha,`, `,fecha`, `fecha,,tarea`), un valor
  vacío, tres valores, uno repetido (`fecha,fecha`), el del primer nivel o el
  parámetro repetido. Descartado, el reporte queda en un nivel.
- **Cada parámetro por su lado**: un `subagrupar` válido sobrevive a un rango
  inválido. Con un `agrupar` inválido el primer nivel es persona, así que
  `agrupar=Proyecto&subagrupar=proyecto` da Persona → Proyecto, y
  `subagrupar=persona` sin `agrupar` se descarta.
- **La coma** viaja como `%2C` en los enlaces que arma la aplicación; un enlace
  escrito a mano con `,` vale igual.
- **Todo enlace del reporte conserva los subniveles**: las flechas, «Esta
  semana», los atajos, «Aplicar» y los enlaces de «Agrupar por», que los cambian
  con el intercambio de RP-12.
- **Al recargar**, la URL reproduce el período y los niveles, y los botones de
  los subniveles dicen lo elegido; lo abierto no se reproduce y todo vuelve
  contraído (RP-13). Un enlace copiado, lo mismo.
- **Un member que abre el enlace de un admin con subniveles** ve los mismos
  niveles con sus propias horas en cada uno; `personas=…` se sigue ignorando.

_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-2, D-R4-5, D-R4-10;
R4a)_:

- **`clientes` y `proyectos`** van después de `subagrupar`, en ese orden, cada
  uno con una lista de 1 a 50 valores separados por coma; una lista vacía no
  se escribe, y sin filtros la URL es la de R3b. Cada valor es un uuid en
  minúsculas; en `proyectos`, también `sin-proyecto`. La aplicación escribe
  cada lista ordenada, con `sin-proyecto` al final, así una misma elección da
  la misma URL; la coma viaja como `%2C`, y escrita a mano vale igual.
- **Cada filtro se valida por su lado y se descarta entero, sin aviso**, con un
  valor vacío, una coma de más (`a,`, `,a`, `a,,b`), una mayúscula en un uuid,
  un valor que no es uuid (un espacio delante, `sin-proyecto` en `clientes`),
  un valor repetido, más de 50 con `sin-proyecto` contado o el parámetro
  repetido. Uno inválido no arrastra al otro, ni al rango, la agrupación o los
  subniveles: `clientes=xx&proyectos=<id>` filtra por el proyecto.
- **Todo enlace del reporte conserva los filtros**: las flechas, «Esta
  semana», los atajos, «Aplicar» del período, «Agrupar por» y los subniveles.
  Solo el «Aplicar» de un filtro y «Quitar filtros» (RP-33) los cambian.
  Recargar, «Atrás» o un enlace copiado reproducen lo elegido, y los botones lo
  dicen.
- **Un member que abre el enlace de un admin con filtros** ve los mismos
  filtros sobre lo propio; un proyecto que no puede ver se ignora (RP-34).
- **`personas=…` se sigue ignorando** en R4a, como cualquier otra clave, y no
  pasa a los enlaces; el filtro de personas llega con R4b.

_Actualizado el 2026-10-09, R4b (D-R4-2, D-R4-4, D-R4-5, D-R4-10)_:

- **`personas`** va después de `subagrupar` y antes de `clientes` y
  `proyectos`, con una lista de 1 a 50 ids separados por coma. Cada id tiene de
  1 a 64 letras, cifras o guiones —los de la base: los de las cuentas llevan
  mayúsculas y minúsculas— y **distingue mayúsculas**: se escribe y se compara
  tal cual. La aplicación escribe la lista ordenada; una lista vacía no se
  escribe.
- **Se valida por su lado y se descarta entero, sin aviso**, con un valor vacío,
  una coma de más (`a,`, `,a`), un espacio, un correo, un id repetido, más de 50
  o el parámetro repetido. No arrastra a los otros:
  `personas=<correo>&proyectos=<id>` filtra por el proyecto.
- **Todo enlace del reporte conserva las personas**, como los otros filtros;
  recargar, «Atrás» o un enlace copiado reproducen lo elegido, y el botón lo
  dice. «Quitar filtros» (RP-33) también las quita.
- **Un member, un `project_manager` o un `team_manager` que abre un enlace con
  `personas`** ve lo propio, sin el botón «Personas» y con «Ves solo tus
  horas.»: el parámetro se descarta, también con su propio id, y los otros
  filtros se aplican sobre lo propio. **El parámetro se pierde en la navegación
  siguiente**, porque los enlaces de su pantalla no lo llevan. Es la decisión
  del usuario del mapa §5 que la corrección de R2a anunciaba para R4.
- Lo que decía R2a de que `personas=…` se ignora como cualquier otra clave vale
  ahora solo para quien no ve horas de otros.

_Actualizado el 2026-10-09, R10a_: `agrupar=semana|mes` y `semana` y `mes` en
`subagrupar` se validan como los otros valores (RP-11): con mayúscula, en
plural o en inglés se descartan; `subagrupar=semana` con `agrupar=semana` se
descarta entero. Todo enlace del reporte —las flechas, «Esta semana», los
atajos, «Aplicar», «Agrupar por» y los subniveles— los conserva.

_Actualizado el 2026-10-09, R10b_: `agrupar=descripcion` y `descripcion` en
`subagrupar` se validan como los otros valores (RP-11): con tilde
(`descripci%C3%B3n`), con mayúscula, en plural o en inglés se descartan;
`subagrupar=descripcion` con `agrupar=descripcion` se descarta entero, y
`agrupar=Proyecto&subagrupar=descripcion` da Persona → Descripción. Todo
enlace del reporte la conserva. **Ningún parámetro lleva el texto de una
descripción ni su clave**: lo abierto sigue sin ir en la URL, y filtrar por
descripción es de la fase 3 (RP-25). **Un member, un `project_manager` o un
`team_manager` con `agrupar=descripcion` y `personas=…` armados a mano** ve
solo sus textos en todos los niveles, con «Ves solo tus horas.» y sin el
botón «Personas»; la página no trae ningún texto ni nombre ajeno.

_Actualizado el 2026-10-12, R6a (D-R6-2, D-R6-4, D-R6-8, D-R6-10)_:

- **La misma URL da el mismo archivo**, el de lo que la pantalla muestra para
  esa URL. La ruta `/reportes/exportar/csv` recibe la query de la página y la
  lee con el mismo parseo (`reportRequestOf`): cada parámetro se valida por su
  lado y uno inválido, desconocido o repetido se descarta igual que en la
  página, sin error. Con `desde` repetido, el archivo es el de «Esta semana»
  con la agrupación y los filtros de la URL.
- **El enlace «CSV» lleva exactamente la query de la página**, con el rango, la
  agrupación, los subniveles y los filtros efectivos; recargar o volver con
  «Atrás» lo arma de nuevo con lo mismo.
- **Lo abierto en pantalla no cambia el archivo**: el resumen sale entero, como
  si todo estuviera expandido (sección 15.2).
- **Un member, un `project_manager` o un `team_manager` que exporta con
  `personas=…` armado a mano** baja lo propio: las mismas entradas que sin
  `personas`, ninguna hora, descripción ni nombre de otra persona, sin la fila
  «Personas» y con «Alcance» «Solo las horas de {su nombre}». El enlace «CSV»
  de su pantalla no lleva `personas`, porque lleva los filtros efectivos.
- **La cabecera nombra solo lo aplicado**: un id que no existe o que se ignoró
  (RP-34) no aparece en «Personas», «Clientes» ni «Proyectos».
- **El archivo no se guarda**: se arma en cada pedido y la respuesta lleva
  `Cache-Control: no-store`. El mismo enlace exportado otra vez cambia en
  «Generado» y en lo que haya cambiado en la base; un rótulo de fecha sin año
  del resumen es del año en que se exporta, como en pantalla.

_Actualizado el 2026-10-12, contrato de R9 (D-R9-4, D-R9-5, D-R9-12)_:

- **`sin-horas=1`** va después de `subagrupar` y antes de `personas`: el orden
  de los parámetros pasa a ser `desde`, `hasta`, `agrupar`, `subagrupar`,
  `sin-horas`, `personas`, `clientes`, `proyectos`. Sin la opción, la URL es la
  de R6.
- **Se valida por su lado y se descarta sin aviso**: solo `1` vale; `0`,
  `true`, `si`, un valor vacío, un espacio o el parámetro repetido la apagan,
  sin arrastrar a ningún otro parámetro.
- **Aplica solo si el primer nivel efectivo es la persona** —el de `agrupar` o,
  sin un `agrupar` válido, la persona— **y quien mira ve horas de otros** (owner
  y admin). Si no aplica, la pantalla es la de sin la opción y los enlaces no la
  llevan: **desaparece de la URL en la navegación siguiente**, como un id
  ignorado (RP-34). Con `agrupar=proyecto&sin-horas=1`, el reporte por proyecto
  de siempre; con `sin-horas=1` y sin `agrupar`, aplica.
- **Todo enlace del reporte la conserva**: las flechas, «Esta semana», los
  atajos, «Aplicar» del período y de cada filtro, «Quitar filtros», los
  subniveles —también «Ninguno»— y los enlaces de «Exportar». La cambian solo
  dos: el enlace «Mostrar personas sin horas» / «Ocultar personas sin horas»,
  que la invierte, y «Agrupar por», que la conserva si el primer nivel que
  resulta es la persona y la apaga si no —«Proyecto», también con el
  intercambio desde Persona → Proyecto—; volver a «Persona» la deja apagada.
- **Al recargar, con «Atrás» o con un enlace copiado**: las mismas filas sin
  horas y el enlace dice «Ocultar personas sin horas»; el árbol empieza
  contraído (RP-13).
- **Un member, un `project_manager` o un `team_manager` con `sin-horas=1`**,
  con o sin `personas`, ve lo mismo que sin el parámetro, sin el enlace y con
  «Ves solo tus horas.». Sin horas propias, ve el primer vacío y no su fila en
  «0:00». El parámetro se pierde en la navegación siguiente.
- **La misma URL da el mismo archivo**: la ruta de exportación lee `sin-horas`
  con el mismo parseo, y el archivo trae las filas sin horas si y solo si la
  pantalla las muestra (RP-54).

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

_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-7; R4a)_: llega **el
segundo vacío**. Con algún filtro aplicado y ningún grupo, la fila de dos
columnas dice «Ninguna entrada coincide con los filtros» y lleva debajo
«Quitar filtros», un enlace al mismo período, la misma agrupación y los mismos
subniveles sin ningún filtro; «Total» y «Facturable», en «0:00». **No mira si
el período tiene horas**: con filtros y sin grupos es el segundo aunque el
período esté vacío para todos, y «Quitar filtros» lleva entonces al primero.
**Un filtro que se ignoró entero no es un filtro** (RP-34): con solo ids que no
existen, el vacío es el primero.

_Actualizado el 2026-10-09, R10b (D-R10-10)_: **con el primer nivel que no
entra no hay vacío**: hay horas que no se muestran. La tabla dice «El primer
nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá
por otra cosa.», también con filtros, y sin «Quitar filtros». Un filtro que
deja el primer nivel dentro del tope lo muestra, y uno que no deja nada da el
segundo vacío.

_Actualizado el 2026-10-10, contrato de R5 (D-R5-6)_: **sin horas no hay
gráfico**, en los dos vacíos: sin entradas cerradas en el período y con filtros
que no dejan nada. Es lo de «con los gráficos ocultos»: no queda ni el lugar.
Un período con solo un timer en curso tampoco tiene gráfico (P-07). **Con el
primer nivel que no entra hay gráfico**, porque hay horas y es la única forma
de verlas repartidas: se ven el gráfico, la fila del tope y los totales. Con
una sola entrada de menos de un segundo hay gráfico, con todas las barras en
«0:00». La regla mira las entradas, no los grupos.

_Actualizado el 2026-10-12, R6a (D-R6-2, D-R6-10)_: **sin horas no hay grupo
«Exportar»**, en los dos vacíos, con la misma condición que el gráfico (D-R5-6):
sin entradas cerradas en el período y con filtros que no dejan nada. Un período
con solo un timer en curso tampoco lo tiene, y una sola entrada de menos de un
segundo sí. **Con el primer nivel que no entra hay «Exportar»**: el resumen del
archivo es la fila «El primer nivel pasa de 3000 filas y no se muestra. Acortá
el período, filtrá o agrupá por otra cosa.» y las entradas van si entran en su
tope, que es la forma de ver las horas que la tabla no muestra. **La ruta igual
responde** si se la pide a mano con un período vacío: 200, con la cabecera
(«Total» y «Facturable» en «0:00» y «0,00»), «Resumen» con una sola fila, «No
hay horas en este período» o, con filtros efectivos, «Ninguna entrada coincide
con los filtros», y «Entradas» con su fila de encabezados y ninguna entrada. El
archivo no lleva «Quitar filtros».

_Actualizado el 2026-10-12, contrato de R9 (D-R9-9)_: **con «Mostrar personas
sin horas», las filas sin horas son grupos y reemplazan a los vacíos**: si hay
alguna, no hay vacío. El gráfico y «Exportar» siguen mirando las entradas, no
los grupos.

| Situación                                | Sin la opción                                  | Con la opción                                                       |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Período sin horas, sin filtros           | «No hay horas en este período»                 | una fila en «0:00» por candidata; sin gráfico ni «Exportar»         |
| Filtros que no dejan nada                | «Ninguna entrada coincide…» y «Quitar filtros» | una fila en «0:00» por candidata, sin «Quitar filtros»; sin gráfico |
| Ninguna candidata y ninguna hora (RP-47) | el vacío que corresponda                       | el mismo vacío; «Quitar filtros» conserva la opción                 |
| Primer nivel que no entra                | la fila del tope                               | la misma; las sin horas contaron para el tope (sección 16.3)        |

- «Total» y «Facturable» no cambian: una fila sin horas suma cero.
- **Sin gráfico y sin «Exportar» con solo filas sin horas**: es la regla de R5
  y R6a sin excepción. El archivo de «nadie cargó esta semana» no se baja desde
  la pantalla; la ruta pedida a mano responde con esas filas en el resumen
  (RP-54).
- **Quien ve solo lo suyo**, con `sin-horas=1` y sin horas propias, ve el
  primer vacío, no su fila en «0:00» (RP-32).

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

_Actualizado el 2026-10-09, contrato de R4, parte A (D-R4-2, D-R4-5, D-R4-8;
R4a)_:

- **Un id bien formado que no está en el catálogo se ignora él solo**, sin
  aviso: un uuid que no existe, un proyecto o un cliente borrado o de otro
  workspace, un proyecto que quien mira no puede ver, o el id de un proyecto
  en `clientes`. Los demás del mismo parámetro siguen. Lo ignorado no se
  aplica, el botón no lo cuenta y **desaparece de la URL en la navegación
  siguiente**, porque los enlaces llevan solo lo aplicado. Si se ignoran todos,
  el reporte es el de sin filtros y el vacío, el primero (RP-33).
- **Un mensaje nuevo, del panel de un filtro**: «Elegí hasta 50.» al apretar
  «Aplicar» con más de 50 elegidos, «Sin proyecto» contado; 49 proyectos y
  «Sin proyecto» valen. No navega y el panel sigue abierto; tildar o destildar
  borra el mensaje. En la URL no hay mensaje: más de 50 descartan el parámetro
  (RP-32).

_Actualizado el 2026-10-09, R4b (D-R4-4, D-R4-5, D-R4-8)_:

- **Un id de persona bien formado que no está en el filtro se ignora él solo**,
  sin aviso: uno que no existe, el de una persona de otro workspace, el de una
  invitada (RP-64) o el de una persona del filtro con otras mayúsculas, que no
  es el mismo id. Las demás de la lista siguen; lo ignorado no se aplica, el
  botón no lo cuenta y desaparece de la URL en la navegación siguiente. Si se
  ignoran todas, el reporte es el de todas las personas y el vacío, el primero
  (RP-33).
- **«Elegí hasta 50.»** vale también en «Personas»: 51 tildadas no navegan, el
  panel sigue abierto y destildar una borra el mensaje. En la URL, 51 ids
  descartan `personas` entero (RP-32).
- **La tercera fila sigue sin usarse**: quien no ve horas de otros no recibe un
  error por `personas`; el parámetro se descarta y la línea del alcance dice lo
  que ve.

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
Justificación: es pago. `workspace_settings.rounding_minutes` existía con
`default` 0 y nadie lo escribía; el reporte del núcleo lo ignora (P-04).
_Corregido el 2026-10-20, WS0_: decía «existe con `default` 0 y nadie lo
escribe». La columna se borró con la migración `0019`
([contrato de WS0](../slices/fase2-ws0-columnas.md)).

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

**RP-47 Mostrar personas sin horas** — `adaptar`
Documentado: «To see who hasn’t tracked any time in a given week, group the
report by user and click on Show users without time.» y «Owners, Admins and Team
managers can see this option.» Es lo más útil del semanal para una vista de
empresa: responde «quién no cargó».
_Actualizado el 2026-10-12, contrato de R9 (D-R9-1 a D-R9-12)_: **entra en el
núcleo, en el reporte resumido y no en el semanal**, y la marca pasa de
`replicar` a `adaptar`. Las dos citas se reconfirmaron ese día en la página del
semanal (FOUND); en las del resumido y de filtros la opción no está (NOT
FOUND). Justificación: el semanal no está en el núcleo (RP-45, RP-46) y «quién
no cargó en el período» se responde con el resumido agrupado por persona, en
cualquier período; lo decidió el usuario el 2026-10-08 (sección 8).

- **Solo owner y admin**: que alguien no cargó es información sobre sus horas
  (P-01). Clockify la da también al team manager, que acá decide como member
  (P-03, RP-06). Un member, un `project_manager` o un `team_manager` no tiene el
  enlace y, con `sin-horas=1` en la URL, no ve filas sin horas, tampoco la
  propia (RP-32).
- **Solo con «Persona» en «Agrupar por»**, con cualquier cantidad de
  subniveles: las filas sin horas son del primer nivel y no tienen hijos
  (RP-13). Con la persona en un subnivel (Proyecto → Persona) no aplica: cada
  grupo mostraría a todas las personas que no cargaron en él.
- **Quiénes aparecen**: sin el filtro de personas, las activas sin entradas
  cerradas en el período que pasen los filtros; con el filtro, las elegidas,
  también inactivas (RP-62); las invitadas, nunca (RP-64). En los dos casos,
  **quien entró después del período no está**: una persona cuya membresía se
  creó desde el inicio del día siguiente al último del período, en la zona de
  quien mira —hoy, su primer ingreso a Clock—, no aparece. El estado es el de
  hoy: quien se desactivó después del período no aparece salvo que se lo elija.
- **«Sin horas» es sin entradas cerradas que pasen los filtros**: con solo un
  timer en curso aparece (P-07); con un filtro de cliente o de proyecto, quien
  cargó solo en otros proyectos aparece, porque no cargó en lo filtrado; con
  entradas que suman menos de un segundo tiene horas, y su fila es la de
  siempre, en «0:00».
- **Cada fila** lleva el nombre de siempre, con «(inactiva)» si corresponde
  (RP-31), y «0:00»; van después de todas las que tienen horas, por nombre
  (RP-12).
- **El control es un enlace**, «Mostrar personas sin horas» con la opción
  apagada y «Ocultar personas sin horas» con la opción encendida, en el bloque
  de «Agrupar por»; la opción va en la URL como `sin-horas=1` (RP-32).
- **Cuentan para el tope de 3000 filas** (sección 16.3).
- **El archivo** las trae en el resumen y suma la fila «Personas sin horas» a la
  cabecera (RP-54).

_No verificado_: si Clockify muestra a las inactivas o a quien entró después de
la semana, en qué orden pone las filas sin horas y si el control es una casilla
o un interruptor (P-05). El semanal sigue en la fase 3 (RP-45, RP-46).

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

_Actualizado el 2026-10-12, R6a (D-R6-2, D-R6-13)_: el PDF sigue para R7, que
**reusa la ruta y el documento del archivo**: suma `/reportes/exportar/pdf` y
un escritor más sobre la misma cabecera, el mismo resumen y las mismas
entradas, con la misma sesión, el mismo alcance, `no-store` y el mismo nombre
de archivo. Lo comparte ya con el CSV de R6a:

- «Grouping options in Summary report will affect how your exports look like.»:
  el resumen tiene una columna por cada nivel que se muestra (sección 15.2).
- «Only the data covered in the report will be exported.»: la misma URL, el
  mismo alcance y los mismos filtros efectivos que la pantalla (RP-32).
- «A PDF file can contain up to 3000 rows.»: el tope del resumen es el de la
  pantalla, 3000 filas (D-R3-6, D-R10-10), y el CSV ya lo usa.

Documentado, confirmado el 2026-10-12: «Export of Summary report doesn’t
contain timestamps. If you need timestamps, you should export Detailed
report.» y «To get a full export (with all time entries), go to Detailed
report, choose the longest date range, and export the results.» Si el PDF
lleva las entradas, el gráfico, su tope de páginas y las fuentes lo decide el
contrato de R7.

_Corregido el 2026-10-12, contrato de R7 (D-R7-2)_: **el PDF no trae las
entradas.** Reemplaza lo que el texto de R6a, arriba, decía de «las mismas
entradas»: el PDF reusa la ruta, la cabecera y el resumen del documento del
archivo, con la misma sesión, el mismo alcance, `no-store` y el mismo nombre de
archivo salvo la extensión, pero no la parte «Entradas», que queda solo en el
CSV y el Excel. Es lo de Clockify: «Export of Summary report doesn’t contain
timestamps. If you need timestamps, you should export Detailed report.» (FOUND
el 2026-10-12). La decisión del usuario que sumó las entradas nombra el CSV y
el Excel (mapa §5), no el PDF.

_Actualizado el 2026-10-12, contrato de R7, R7a (D-R7-2, D-R7-5 a D-R7-8)_:
llega el PDF. La marca sigue en `replicar` para lo documentado; lo que la página
de Clockify no dice es diseño propio y se compara contra el contrato de R7 y la
sección 17.

- **Dónde se pide**: el enlace «PDF», después de «Excel» en el grupo
  «Exportar» (sección 17.1). La ruta es `/reportes/exportar/pdf`, con la misma
  query que la página (RP-32).
- **Qué trae**: la cabecera y el resumen, **sin las entradas una por una**. La
  cabecera es la del CSV, con las mismas filas y en el mismo orden (sección
  15.2), también «Personas sin horas» con «Sí» si la opción de R9 es efectiva.
  El resumen es el mismo, entero como si estuviera todo expandido, con las
  mismas columnas, los mismos rótulos, las filas sin horas de R9, los mismos
  vacíos y la misma nota del primer nivel cortado. Ninguna parte ni aviso nombra
  las entradas. «Only the data covered in the report will be exported.» y
  «Grouping options in Summary report will affect how your exports look like.»
  valen como en el CSV: la misma URL, el mismo alcance y una columna por cada
  nivel que se muestra.
- **El tope**: **3000 filas del resumen**, el de la pantalla y el del CSV
  (D-R3-6, D-R10-10), que es el de «A PDF file can contain up to 3000 rows.»;
  no hay tope propio del PDF. Cada nivel entra entero o no entra: con los
  niveles de abajo cortados, el PDF trae los que entraron y la nota del tope en
  la cabecera; sin el primero, el aviso en lugar de la tabla. Qué cuenta
  Clockify como fila y qué hace con más de 3000 siguen _no verificados_ (P-05).
- **La página**: A4 vertical. Arriba de la primera, el título «Reporte
  resumido» y la cabecera como una lista de nombre y valor; después, «Resumen» y
  la tabla. **La fila de encabezados se repite arriba de cada página** y **una
  fila no se parte entre dos páginas**: si no entra, pasa entera a la
  siguiente. **Abajo a la derecha de cada página, «Página {n} de {total}».**
- **El texto**: el del CSV, sin el `'` de la inyección de fórmulas, porque un
  PDF no tiene fórmulas: «1:30», «1,50», «Sin proyecto», la persona con
  « (inactiva)», «=1+1» tal cual. **Una corrida seguida de tabulaciones, saltos
  de línea y retornos de carro se escribe como un solo espacio**, como la
  muestra la pantalla. **Lo que la fuente no dibuja se escribe «�» (U+FFFD)**:
  los emoji —uno por cada punto de código que la fuente no dibuja: un emoji simple deja un «�» y uno compuesto (tono de piel, bandera, «❤️», familia) deja varios—, «→» y el griego que falta; y siempre, los demás
  caracteres de control, U+FFFE, U+FFFF y las mitades sueltas de un par
  sustituto. La fuente, Noto Sans, va incrustada y cubre el latín con sus
  acentos («Łukasz», «Żółć») y el cirílico («Дмитрий»). El CSV y el Excel
  conservan lo que el PDF reemplaza.
- **El nombre del archivo**: `reporte_<niveles>_<desde>_<hasta>.pdf`, como el
  del CSV salvo la extensión: `reporte_persona-proyecto_2026-09-28_2026-10-04.pdf`.
- **Las respuestas**: 200 con `Content-Type: application/pdf`,
  `Content-Disposition: attachment; filename="….pdf"` y `Cache-Control:
no-store`: el navegador lo descarga y no lo abre en la pestaña. El 307 al
  login, el 403 («No podés exportar reportes.») y el 500 («No se pudo exportar
  el reporte. Volvé y probá de nuevo.»), como en el CSV.
- **Ninguna exportación queda en el `audit_log`** (decisión del usuario,
  2026-10-12): tampoco el PDF.
- **Lo que no tiene**:
  - el gráfico de R5, que Clockify trae y deja sacar («you can disable certain
    information (user, charts, etc.) from appearing on PDF»): pendiente de que
    el usuario lo pida (R7b);
  - las opciones de «Customize export» —sacar datos, cambiar el nombre del
    reporte, poner un logo—: `fuera de alcance`. Justificación: la URL de la
    exportación no lleva parámetros propios (D-R6-4) y nadie lo pidió;
  - el diseño de la página de Clockify: `adaptar`. Justificación: la página de
    ayuda no lo documenta, así que A4, la fuente, los márgenes, los colores, la
    cabecera como lista y el pie los fija el contrato; P-05 dice qué mirar.

_Actualizado el 2026-10-13, contrato de R7, R7b (D-R7-12)_: **el PDF trae el
gráfico de R5**, a pedido del usuario del 2026-10-13. Reemplaza el primer
punto de «Lo que no tiene», arriba, que lo dejaba pendiente. Es lo que la cita
de Clockify da por hecho: «you can disable certain information (user, charts,
etc.) from appearing on PDF» (FOUND el 2026-10-13) dice que se puede sacar, así
que por omisión está. La marca sigue en `replicar` en cuanto a que el PDF trae
el gráfico; cómo se dibuja es diseño propio y se compara contra el contrato de
R7 (§4.5, §4.6) y la sección 17.

- **Qué gráfico**: el de la pantalla para la misma URL (sección 14), el mismo
  valor que lee la página, con el mismo alcance, las mismas personas elegidas y
  los mismos filtros, en la misma foto. Tiene la misma granularidad según el
  largo del período, una barra por tramo (también las que están en cero), la
  misma escala desde «0:00» y las mismas marcas, en el formato de fecha del
  perfil. El CSV y el Excel no lo traen (D-R6-2).
- **Dónde**: debajo de la cabecera y antes de «Resumen», una sola vez. **El
  bloque no se parte**: si no entra en lo que queda de la primera página, pasa
  entero a la siguiente. La tabla empieza debajo, así que esa página tiene
  menos filas; el total de filas no cambia.
- **Qué tiene**: la leyenda («Horas por día», «Horas por semana» u «Horas por
  mes»), los rótulos de la escala a la izquierda con sus líneas, las barras y
  hasta siete marcas debajo, cada una en un renglón.
- **Cuándo no está**: cuando la pantalla no lo muestra, es decir en los dos
  vacíos y con solo filas sin horas (RP-33, sección 16). En esos casos no hay
  «Exportar» y la ruta se pide a mano. Con el primer nivel que no entra sí
  está: el gráfico y después el aviso, como en la pantalla.
- **Lo que no tiene**:
  - la opción de sacarlo: `fuera de alcance`. Justificación: la URL de la
    exportación no lleva parámetros propios (D-R6-4) y nadie lo pidió; es lo
    mismo que «Customize export»;
  - el valor de cada barra y la tabla «Ver los datos del gráfico»: `adaptar`.
    Justificación: en la pantalla se ven con el puntero, con el foco o al
    abrir la tabla, y en el papel no hay ninguna de las tres cosas; las horas
    por grupo están en el resumen;
  - el diseño del gráfico de Clockify: `adaptar`. Justificación: la página de
    ayuda no lo documenta («graph» NOT FOUND, «chart» solo en la cita de
    arriba), así que el contrato fija el alto, los grises, las líneas y la
    barra sola; P-05 dice qué mirar.

**RP-54 Exportar a CSV y Excel** — `adaptar`
Documentado: «CSV and Excel report exports are available only on paid plans».
_Actualizado el 2026-10-08, decisión del usuario (P-10)_: entra en el núcleo.
Justificación: es pago y no se puede relevar, así que entra **como diseño
propio y no como paridad**, igual que el facturable (P-16 de `proyectos.md`):
el reviewer lo compara contra el contrato del slice, no contra Clockify. Exporta
lo que muestra la pantalla, con el mismo alcance de RP-01.

_Actualizado el 2026-10-12, R6a (D-R6-1 a D-R6-11)_: llega el CSV; el Excel
queda para R6b. Sigue siendo diseño propio: el reviewer lo compara contra el
contrato de R6 y la sección 15, no contra Clockify. Cómo es el CSV de Clockify
sigue _no verificado_ («separator» y «decimal» NOT FOUND en la página de
exportación el 2026-10-12).

- **Dónde se pide**: el grupo «Exportar», el último de la barra, con el enlace
  «CSV» (sección 15.1). La ruta es `/reportes/exportar/csv` con la query de la
  página (RP-32).
- **Qué trae**: un solo archivo con tres partes, en este orden: la cabecera, una
  línea vacía, «Resumen» y sus filas, otra línea vacía, «Entradas» y sus filas.
- **La cabecera**: el título «Reporte resumido», «Período», «Zona horaria»,
  «Alcance», «Agrupado por», «Personas», «Clientes» y «Proyectos» si hay
  filtros, «Total», «Facturable», «Generado» y las notas (sección 15.2).
- **El resumen, entero, como si estuviera todo expandido**: lo contraído es solo
  de la pantalla. Una fila por grupo, en el orden de la pantalla, con su nivel,
  el camino entero y su duración (sección 15.2).
- **Las entradas, una por una**, por decisión del usuario (mapa §5): las
  cerradas con el inicio en el período, del alcance y de los filtros efectivos,
  en orden de inicio y, con el mismo inicio, de id; sin el timer en curso
  (P-07). La descripción va entera y las etiquetas, todas en una celda.
  Agrupar por etiqueta no cambia esta parte: cada entrada es una fila.
- **Los topes**:
  - el resumen, **3000 filas**, el de la pantalla: si los niveles de abajo no
    entran, trae los que entraron y la nota del tope; si no entra ni el primer
    nivel, la nota del primer nivel en lugar de las filas (RP-33);
  - las entradas, **10 000 o 4 000 000 bytes de archivo, todo o nada**: con
    más de 10 000, o si el archivo con ellas pasa ese peso, no se lista
    ninguna y la parte «Entradas» es la fila «Las entradas no entran en el
    archivo: son más de 10 000 o pesan más de 4 MB. Acortá el período o
    filtrá.» (con un espacio duro, U+00A0, entre los miles; corrección F2 de
    [las revisiones de R6a](../slices/correcciones-nucleo-reportes-r6a-revisiones.md)). El resumen y la cabecera van igual. Justificación: cortar en las
    primeras 10 000 daría un archivo que parece completo y no suma el total.
- **CSV en español**: separador `;`, BOM UTF-8 una vez al principio, fin de
  línea `\r\n` también en la última, todos los campos entre comillas —también
  los vacíos, `""`— y las comillas internas duplicadas: `Revisión "final"; v2`
  se escribe `"Revisión ""final""; v2"`. Un `;` o un salto de línea dentro de
  un campo quedan adentro.
- **Las duraciones van dos veces**: «Duración» en `h:mm` como en pantalla, sin
  tope de 24 h («2000:00»), y «Horas» en decimal, con coma, dos decimales y sin
  separador de miles («1,50», «2000,00»), truncadas (RP-18). «Horas» es la que
  se suma en una planilla.
- **Las fechas y las horas de las entradas, canónicas**: el día en
  `yyyy-MM-dd` y la hora en `HH:mm` de 24 h, en la zona de quien exporta
  (RP-22), sea cual sea su formato de fecha y de hora. La cabecera, que es para
  leer, va en sus formatos: «28/09/2026 – 04/10/2026», «Generado» en 12 o 24 h.
- **La inyección de fórmulas**: un campo que empieza con `=`, `+`, `-`, `@`,
  una tabulación o un retorno de carro se escribe con un `'` adelante, en
  cualquier columna. Una descripción «=1+1» queda «'=1+1» y una «- reunión»,
  «'- reunión»; `a=b` o un espacio antes del `=` no llevan `'`.
- **El nombre del archivo**: `reporte_<niveles>_<desde>_<hasta>.csv`, con los
  niveles pedidos como se escriben en la URL, unidos con `-`, y los días del
  período: `reporte_persona-proyecto_2026-09-28_2026-10-04.csv`. Es solo ASCII
  y no lleva ningún texto que alguien escriba.
- **Las respuestas**: 200 con `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment; filename="…"` y `Cache-Control: no-store`;
  sin sesión, 307 al login; una membresía que no está activa, 403 con «No podés
  exportar reportes.»; un error al leer o al escribir, 500 con «No se pudo
  exportar el reporte. Volvé y probá de nuevo.». El 403 y el 500 son texto, con
  `no-store` y sin archivo.
- **Ninguna exportación queda en el `audit_log`**, por decisión del usuario
  (2026-10-12): el archivo trae lo que la pantalla ya muestra, y ninguna
  lectura se audita.

_Actualizado el 2026-10-12, R6b (D-R6-12; B4 de
[las correcciones de R6b](../slices/correcciones-nucleo-reportes-r6b.md))_:
llega el Excel. Sigue siendo diseño propio; cómo es el Excel de Clockify sigue
_no verificado_ («xlsx», «worksheet» y «number format» NOT FOUND en la página
de exportación el 2026-10-12).

- **Dónde se pide**: el enlace «Excel», después de «CSV» en el grupo
  «Exportar» (sección 15.1). La ruta es `/reportes/exportar/xlsx`, con la
  misma query que la página (RP-32).
- **Qué trae**: lo mismo que el CSV —la misma cabecera, el mismo resumen, las
  mismas entradas, los mismos topes y las mismas notas— en un `.xlsx` con dos
  hojas, «Resumen» y «Entradas». Cada hoja lleva arriba la cabecera entera,
  una fila vacía y su tabla. El título de la parte es el nombre de la hoja y
  no una fila. La primera fila de cada tabla va en negrita: los encabezados de
  columna o, si la parte es un aviso, el aviso.
- **Cada celda tiene tipo**:
  - el texto es una cadena con formato de texto (`@`), también si parece un
    número o una fórmula;
  - «Nivel» es un número entero;
  - «Fecha de inicio» y «Fecha de fin» son una fecha de Excel (número de serie
    desde el 30/12/1899) con el formato `yyyy-mm-dd`;
  - «Hora de inicio» y «Hora de fin» son la fracción del día con `hh:mm`;
  - «Duración» es minutos / 1440 con `[h]:mm`, que pasa de 24 h; también en
    «Total» y «Facturable» de la cabecera;
  - «Horas» son los centésimos truncados del CSV divididos por 100, con
    `0.00`, y la planilla los muestra con el separador decimal de su
    configuración (RP-18);
  - lo vacío es una celda sin valor.
- **Ninguna celda es una fórmula**, y el texto va tal cual, sin el `'` del CSV:
  una descripción «=1+1» es la cadena «=1+1».
- **Los caracteres que el formato no admite** (controles, U+FFFE, U+FFFF y
  mitades sueltas de un par sustituto) se escriben como «�» (U+FFFD), solo en el
  Excel, para que el archivo se pueda abrir; el CSV los deja como están.
- **El tope de las entradas es del documento, medido como CSV**, el mismo para
  los dos formatos (B4): con el mismo pedido, CSV y Excel deciden siempre lo
  mismo. Antes de leer las entradas, la exportación las cuenta y calcula una
  cota inferior de lo que pesan sus líneas en CSV; si pasan de 10 000 o de
  4 000 000 bytes, no las lee. Si las lee, mide el documento escrito como CSV,
  y si pasa de 4 000 000 bytes, el archivo sale sin entradas en cualquiera de
  los dos formatos. En los dos casos la hoja «Entradas» trae el aviso de
  siempre. Así, un Excel que comprimido habría pesado menos de 4 MB puede salir
  sin entradas. Justificación: una sola regla para los dos formatos, y la
  lectura queda acotada antes de listar.
- **El nombre del archivo**: `reporte_<niveles>_<desde>_<hasta>.xlsx`, como el
  del CSV salvo la extensión.
- **Las respuestas**: 200 con `Content-Type:
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `Content-Disposition: attachment; filename="….xlsx"` y `Cache-Control:
no-store`; el 307 al login, el 403 y el 500, como en el CSV.
- Cómo lo abren Excel y LibreOffice —las dos hojas, las fechas como fecha, las
  duraciones sumables, «=1+1» como texto— es el criterio 21 del contrato, a
  mano, y queda _no verificado_ hasta que se haga.

_Actualizado el 2026-10-12, contrato de R9 (D-R9-10)_: con «Mostrar personas
sin horas» (RP-47), el archivo sigue siendo el de la pantalla para la misma URL,
en CSV y en Excel:

- **La cabecera suma la fila «Personas sin horas»** con «Sí», solo con la
  opción efectiva, inmediatamente después de «Agrupado por» y antes de
  «Personas», «Clientes» y «Proyectos». Sin la opción, o si no aplica, no está;
  no hay una fila con «No».
- **El resumen trae las filas sin horas** en el orden de la pantalla, después
  de la última persona con horas y sus filas hijas: una por persona, nivel 1,
  con su nombre («(inactiva)» si corresponde), vacías las columnas de abajo,
  «0:00» y «0,00», sin filas hijas. En el Excel, las mismas filas en la hoja
  «Resumen», con celdas con tipo como cualquier otra fila: el nivel, el entero
  1; «Duración», el número 0 con `[h]:mm`; «Horas», el número 0 con `0.00`.
- **«Entradas» no cambia**: una persona sin horas no tiene entradas.
- **Los topes no cambian**: el resumen sigue acotado por las 3000 filas, y las
  sin horas cuentan (sección 16.3).
- **Con solo filas sin horas no hay «Exportar»** en la pantalla (RP-33); la ruta
  pedida a mano responde 200 con la cabecera, esas filas en el resumen, con su
  fila de encabezados —una columna por cada nivel pedido, como el encabezado de
  la pantalla— y «Entradas» con su fila de encabezados y ninguna entrada.
- **Un member, un `project_manager` o un `team_manager`** que exporta con
  `sin-horas=1`, con o sin `personas`, baja el mismo archivo que sin esos
  parámetros: sin la fila de la cabecera y sin ningún nombre ajeno.
- El PDF de R7, que va después, lo hereda sin cambios si lee el mismo
  documento.

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
_Agregado el 2026-10-19, E2 (D-E2-5, D-E2-11 del
[contrato](../slices/fase2-e2-desactivar.md))_: **construido.** Owner y admin
desactivan desde `/equipo`, con «Desactivar» en el menú de la fila y una
confirmación (EQ-39, EQ-46 de `equipo.md`); a un admin lo desactiva solo el
owner (EQ-38). Desactivar pasa la membresía a `inactive` con su rol, detiene
el timer (RP-63) y borra las sesiones, en una transacción; no borra entradas,
proyectos ni asignaciones (EQ-44, EQ-45). Reactivar, desde la misma fila,
devuelve la membresía a `active` con el mismo rol. El reporte no cambia: lee
las horas sin mirar el estado (RP-61), y como la acción revalida el árbol
entero, el filtro de personas pasa a la persona a «Inactivas» (RP-62) en la
carga siguiente.

**RP-61 Las horas de una persona inactiva siguen en los reportes** — `replicar`
Documentado: «The time entries of both inactive and deleted users will remain.»
y «You can still filter reports by inactive users using their name.» (página de
invitar personas, 2026-10-16), y «You can see their time in the summary report
when you group it by user.» (2026-10-08). Cuentan en los totales y aparecen
agrupando por persona.
Consecuencia de modelo: el reporte lee `time_entry` por `workspace_id`, y el
nombre de la persona sale de `user`; **no puede exigir una membresía activa**,
porque esconder las horas de una persona inactiva cambiaría los totales del
pasado.
_Actualizado el 2026-10-08, contrato de R2a_: la consulta no pone ninguna
condición sobre el estado de la membresía, del proyecto ni de la tarea, y la
fila de la persona lleva «(inactiva)» (RP-31). El filtro por persona inactiva
(RP-62) llega con R4.
_Corregido el 2026-10-16, equipo EQ-44 (sección 15 de `equipo.md`)_: la
primera cita era «The time entries of deleted/inactive users will remain but
you won’t be able to filter reports by them.», del 2026-10-08. El 2026-10-16
«won’t be able to filter» dio NOT FOUND en esa página, que ahora dice las dos
oraciones de arriba, y la tabla de la guía dice «All time entries remain in
reports can still be filtered by that user». La regla no cambia. La misma guía
dice además «All past time entries, descriptions, and tags remain in the
system, but these won't appear in reports by default.» y «You would need to
use the Inactive filter to see their data.», que contradicen a su tabla y a
esta regla; no la cambian, y van a la lista de verificación de `equipo.md`
(P-10).

**RP-62 Filtrar por una persona inactiva** — `replicar`
Documentado: «You can still filter reports by inactive users using their name.»
(RP-61), y la API tiene `status` en el filtro de personas con `ALL`,
`ACTIVE_WITH_PENDING`, `ACTIVE`, `PENDING` e `INACTIVE`.
_Corregido el 2026-10-16, equipo EQ-44 (sección 15 de `equipo.md`)_: era
`adaptar` y decía «Documentado que en Clockify no se puede (RP-61)». La página
de Clockify cambió: filtrar por una inactiva es paridad y deja de ser una
divergencia. La forma —el grupo «Inactivas» con el nombre tachado— es la de
abajo, y lo que hace con «Mostrar personas sin horas» sigue _no verificado_.
_Actualizado el 2026-10-08, decisión del usuario (P-08)_: entra en el núcleo.
El filtro de personas ofrece las activas y, aparte, las inactivas, con el
nombre tachado como en la pantalla de equipo («All inactive user names are
struck out.»). Justificación: un reporte de empresa sobre un mes pasado
necesita poder aislar a alguien que ya se fue. Solo lo ve quien ve horas de
otros (RP-01).

_Actualizado el 2026-10-09, R4b (D-R4-4, D-R4-5, D-R4-8)_: **hecho como lo
decidió el usuario.** En el filtro de personas, las membresías `inactive` van en
un grupo propio, «Inactivas», después de las activas, con el nombre tachado; el
nombre del grupo dice por qué están aparte, porque el tachado no se anuncia.
Están tengan o no horas en el período, y la búsqueda las encuentra como a las
activas. Elegida, una inactiva filtra como cualquiera: su fila lleva
«(inactiva)» (RP-31) y sus horas cuentan. Solo owner y admin tienen el filtro;
para el resto no existe (RP-32).

_Actualizado el 2026-10-12, contrato de R9 (D-R9-2)_: **con «Mostrar personas
sin horas» (RP-47), una inactiva sin horas aparece solo si se la elige** en
«Personas». Sin el filtro, las candidatas son las activas, porque una inactiva
es alguien que ya no está y sería una fila de más en cada período posterior a su
salida. Elegida, quien mira pregunta por ella: su fila va en «0:00» con
«(inactiva)» (RP-31), después de las que tienen horas. Como cualquier
candidata, no aparece si su membresía se creó después del período.
Justificación: es la recomendación del contrato, que el usuario puede cambiar
(pregunta 1 de su §10). _No verificado_: si el semanal de Clockify muestra a
las inactivas (P-05).

**RP-63 Desactivar detiene el timer** — `replicar`
Documentado: al desactivar, «…their current timer is stopped (if they have one
running).» Es de la fase 2; se anota porque, al detenerse, esa entrada pasa a
contar en el reporte (RP-30).
_Agregado el 2026-10-19, E2 (D-E2-5, D-E2-6 del
[contrato](../slices/fase2-e2-desactivar.md))_: **construido.** En la
transacción de la desactivación, el timer abierto de la persona se cierra con
el instante de la transacción, con piso en su inicio (TT-101), y deja
`timeEntry.stop` con quien desactivó como actor; desde ahí cuenta en el
reporte (RP-30). Sin timer, no escribe nada. Si la persona estaba abriendo un
timer en ese momento, o la desactivación lo cierra o el arranque responde «No
tenés permiso para hacer esto.» sin abrirlo: no queda un timer corriendo de
una inactiva. Reactivar no lo vuelve a poner en marcha (EQ-43 de `equipo.md`).

**RP-64 Personas invitadas** — `adaptar`
La API distingue `PENDING`. Una membresía `invited` no tiene entradas y no
aparece en el filtro de personas ni como grupo vacío. Justificación: no hay
nada que mostrar; RP-47 —mostrar personas sin horas— la excluye también.
_Actualizado el 2026-10-08, contrato de R2a_: una membresía `invited` no
aparece como fila, porque no tiene entradas y R2a no muestra personas sin horas
(llegan con R9). Si entra a `/reportes`, ve el aviso de RP-07: no tiene
`report.view`.

_Actualizado el 2026-10-09, R4b (D-R4-5)_: **una membresía `invited` no está en
el filtro de personas, por su estado**, tenga o no horas, y su id en `personas`
se ignora (RP-34). La interfaz no produce una invitada con horas; si la base
tiene una, agrupando por persona su fila aparece con «(inactiva)», porque el
reporte no pone condiciones sobre el estado de la membresía (RP-61) y marca toda
membresía que no está activa (RP-31), pero no se la puede elegir en el filtro.

_Actualizado el 2026-10-12, contrato de R9 (D-R9-2, D-R9-6)_: **una invitada
nunca aparece sin horas**, con o sin el filtro de personas: las candidatas salen
del mismo catálogo que el filtro, que la deja afuera por su estado, y su id en
`personas` se sigue ignorando (RP-34). Es lo que esta entrada anunciaba desde el
2026-10-08. Hoy nada crea membresías `invited`. Cuando las invitaciones de la
fase 2 las creen, la fecha que decide «quien entró después del período» tiene
que ser la de activación y no la de la invitación (§9 del contrato de R9).

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
_Corregido el 2026-10-16, equipo EQ-50_: la página actual resuelve la
contradicción. Las entradas de una persona borrada quedan bajo un alias:
«However, for deleted users, their time entries will only be shown under the
alias deleted user…», y la tabla de la guía dice «Time entries remain in
reports, but you can no longer filter data by that specific user's name». No
cambia la decisión P-09: el alias cambiaría el nombre de los totales del
pasado.

**RP-66 Tope de cinco personas activas** — `fuera de alcance`
Documentado: «5 active users (including the Owner and active members).»
Justificación: límite comercial del plan.

**RP-67 Dar el rol de admin** — `adaptar`
Documentado: «Click on +Role next to the person you wish to make admin» y
«Tick the Admin checkbox» (invitar personas); en la tabla de la página de
admins, «Assign user roles | Yes», y la única excepción de los admins sobre los
roles es quitar el de admin (RP-68).
_Agregado el 2026-10-13, R8 (D-R8-3, D-R8-10)_: el owner y los admins activos
lo dan en `/equipo` con «Hacer administrador», en la fila de un `member` activo;
el clic escribe, sin casilla ni paso de guardar. Justificación: Clock tiene un
rol por membresía, así que no hay roles que sumar con casillas; y
`project_manager` y `team_manager`, de plan pago y hoy solo por SQL, no se dan
ni se quitan desde acá (D-R8-4).

**RP-68 Quitar el rol de admin: solo el owner** — `replicar`
Documentado: «To remove them as admin, untick the checkbox Admin.» y «Only the
Workspace owner can remove an admin role from someone, transfer ownership to
another user, and delete the workspace.» (invitar personas); en la tabla de la
página de admins, «Manage users | Yes (except removing Admin role – Owner
only)».
_Agregado el 2026-10-13, R8 (D-R8-5, D-R8-13), decisión del usuario_: **solo el
owner lo quita**, con «Quitar administrador» en la fila de un admin. Un admin no
tiene ese botón en ninguna fila, tampoco en la suya: no baja a otro admin ni se
baja a sí mismo, y un pedido armado a mano responde «Solo el propietario quita
el rol de administrador.». Es una acción de permiso propia, `team.admin.revoke`,
solo del owner ([ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md),
aceptado). No hay mínimo de admins: el piso es el owner. Un admin que hace
admin a alguien por error no lo puede deshacer: lo hace el owner.

**RP-69 El rol del owner** — `replicar`
Documentado: «Transfer owner role | Yes (Owner only)» (página de admins), «To
make someone an owner, current owner needs to:» y «Click Transfer ownership»
(invitar personas).
_Agregado el 2026-10-13, R8 (D-R8-4)_: la fila del owner no tiene botón y su rol
no cambia desde `/equipo`, tampoco por el owner mismo; un pedido armado a mano
responde «El rol del propietario no se cambia.». Transferir el workspace
(`workspace.transfer`) queda para la fase 2.

**RP-70 La pantalla de equipo para un member** — `adaptar`
Documentado que se pueden «hide Projects, Team, and reports pages» del menú de
los members (RP-08): si no se la esconden, un member la ve.
_Agregado el 2026-10-13, R8 (D-R8-2)_: en Clock la ven solo owner y admin
activos. Un member, un `project_manager` o un `team_manager` no tiene la
entrada «Equipo» y, si abre `/equipo`, ve «No tenés permiso para administrar el
equipo.», sin lista. Justificación: R8 solo trae el control de rol; qué ve un
member es de la pantalla de equipo de la fase 2 (`team.view`), que puede
abrirla.

## 6. Qué entra en el núcleo

_Actualizado el 2026-10-08_: era la recomendación de este documento; ahora es
el corte del ADR 0020 con las decisiones de la sección 8. La vista que pidió el
usuario —las horas de todo el equipo o la empresa— es el **reporte resumido
agrupado por persona y por proyecto**, con exportación. Todo lo demás se agrega
sin tocar el modelo.

**Entra:**

- Quién ve: RP-01 (con la divergencia de P-01), RP-02, RP-07.
- Resumido: RP-10, RP-11, RP-12, RP-13, RP-15, RP-18, RP-19, RP-47 (del
  semanal, en el resumido agrupado por persona).
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
(tablero), RP-45 y RP-46 (semanal), RP-50.

**Fuera de alcance:** RP-04, RP-06 (hasta que exista un modelo de equipo),
RP-08, RP-09, RP-27, RP-36, RP-37, RP-48, RP-49, RP-51, RP-52, RP-55, RP-56,
RP-66.

_Actualizado el 2026-10-12, contrato de R9_: **RP-47 entra en el núcleo**, en el
reporte resumido agrupado por persona y no en el semanal, por la decisión del
usuario del 2026-10-08 (sección 8), y sale de la fase 3. El semanal (RP-45,
RP-46) sigue en la fase 3.

_Actualizado el 2026-10-13, R8_: **entran RP-67, RP-68 y RP-69** (dar el rol de
admin, quitarlo solo el owner y el owner que no cambia) y RP-70 como
divergencia, con la pantalla `/equipo` (sección 18). Transferir el workspace
(RP-69) y lo demás de la pantalla de equipo —invitar, desactivar (RP-60,
RP-63), la lista para un member (RP-70)— quedan para la fase 2.

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

_Actualizado el 2026-10-09, contrato de R3, parte A (§10, pregunta 3)_: P-05
sigue abierto para el usuario y suma, para R3a: si «Group by» ofrece la tarea
(RP-11); si, agrupando por etiqueta, una entrada con varias suma en cada una y
qué total muestra entonces la cabecera (RP-18, ya en la lista); el rótulo del
grupo sin etiqueta (RP-28); y si el resumido marca una tarea hecha o una
etiqueta archivada (RP-29). Mientras tanto vale lo de R3a (sección 11). Lo de
R3b —el tope de niveles, si una dimensión se repite, el orden dentro de los
subgrupos y lo expandido al recargar— se suma con R3b. No bloquea.

_Actualizado el 2026-10-09, R3b (§10, preguntas 2 y 3 del contrato)_: P-05
sigue abierto para el usuario. **Sale de la lista el tope de niveles**, que la
página de filtros documenta con sus tres menús (RP-12), y la lista de opciones
de «Group by» queda documentada salvo su orden en pantalla (RP-11). Suma, para
R3b: si una dimensión se puede repetir en dos niveles y cómo se deja vacío un
menú (RP-12); el orden de las filas dentro de un subgrupo (RP-12); qué cuenta el
número junto al grupo y qué queda expandido al recargar o al volver a la
pantalla (RP-13, RP-32). **La pregunta 2 de §10 del contrato —conservar lo
abierto al recargar— sigue abierta para el usuario**: hasta que la conteste,
todo empieza contraído y lo abierto no va en la URL (RP-13). Mientras tanto vale
lo de R3b (secciones 11.4 a 11.8). No bloquea.

_Actualizado el 2026-10-09, R10a_: P-05 suma cómo rotula Clockify una semana y
un mes, si corta las semanas y los meses en los extremos del período, y si
permite una dimensión de tiempo debajo de otra. Mientras tanto vale lo de R10a
(sección 13). No bloquea.

_Actualizado el 2026-10-09, R10b_: P-05 suma si «Description» distingue
mayúsculas y espacios, cómo recorta Clockify un texto largo, cómo rotula el
grupo sin descripción, en qué orden pone las descripciones y si el resumido
tiene un tope de filas en el primer nivel. Mientras tanto vale lo de R10b
(secciones 13.6 a 13.9). No bloquea.

_Actualizado el 2026-10-10, contrato de R5 (§10, pregunta 1)_: P-05 suma, para
R5, cómo rotula Clockify el eje del gráfico, qué texto muestra al pasar el
puntero («hover over the chart to see the exact numbers» está documentado; el
texto, no) y si el gráfico se usa con teclado. Se puede mirar en el workspace
con períodos de hasta 31 días. **Si Clockify pasa a semanas o meses con
períodos largos no se puede relevar**, porque el plan Free no pasa de 31 días;
vale lo del ADR 0021 y D-R5-4. Mientras tanto vale lo de R5 (sección 14). No
bloquea.

_Actualizado el 2026-10-12, contrato de R9 (§10, pregunta 3)_: P-05 suma, para
R9, en el semanal con «Show users without time»: si aparecen las personas
inactivas y quien entró después de la semana, en qué orden van las filas sin
horas y si el control es una casilla, un interruptor u otra cosa. No está
verificado que el semanal exista en el plan Free: la página de cambios del plan
Free no lo nombra («weekly» NOT FOUND el 2026-10-12). Mientras tanto vale lo de
R9 (sección 16). No bloquea.

_Actualizado el 2026-10-12, contrato de R7 (R7a)_: P-05 suma el PDF del
resumido, que **es del plan Free y se puede bajar en el workspace del equipo**:
el tamaño y la orientación de la página; qué trae arriba (título, período,
filtros, totales) y si trae el gráfico por omisión; si repite los encabezados
de la tabla en cada página y si numera las páginas; cómo muestra los subgrupos;
cómo escribe un nombre con letras no latinas o un emoji; el nombre del archivo;
qué cuenta como fila y qué hace con más de 3000; y si «Customize export» está
en el plan Free y qué deja sacar. Mientras tanto vale lo de R7a (sección 17).
No bloquea.

_Actualizado el 2026-10-13, contrato de R7 (R7b)_: P-05 suma, para el gráfico
en el PDF del resumido: si está por omisión y dónde va; si lleva el valor de
cada barra o una tabla; cómo rotula la escala y el eje; si parte las barras por
facturable o por proyecto, como la pantalla de Clockify (RP-16); y si la opción
de sacarlo («you can disable certain information (user, charts, etc.) from
appearing on PDF») está en el plan Free. Mientras tanto vale lo de R7b
(sección 17). No bloquea.

_Agregado el 2026-10-09, relevamiento de R3b_: **P-11 — Agrupar por
descripción, mes y semana.** La página de filtros los lista entre las opciones
de «Group by» (RP-11) y Clock no los tiene: ¿entran en el núcleo, en la fase 3
o quedan fuera de alcance? Mes y semana se cruzan con la granularidad del
gráfico de RP-15; descripción agruparía por un texto libre. Sin decisión, no
tienen marca. No bloquea R3b.

_Resuelto el 2026-10-09 por el usuario_: entran las tres en el núcleo, como
R10. Semana y mes, con R10a (sección 13); descripción, con R10b.

_Agregado el 2026-10-13, contrato de R8 (§9, punto 2)_: **P-12 — Los roles en
la pantalla de equipo de Clockify.** Lo documentado está en RP-67 a RP-70, con
la búsqueda de ese día. **Para la sesión en el workspace del equipo** (no es
decisión, es mirar; el rol de admin es del plan Free): que un admin ve «+Role»
con la casilla «Admin» en la fila de otra persona (la tabla de admins dice
«Assign user roles | Yes» sin nombrar el rol de admin); si el owner quita el rol
con confirmación; si su propio rol cambia de otra forma que transfiriendo el
workspace; si la casilla «Admin» se combina con otros roles; si se puede
cambiar el rol de una persona inactiva o invitada; si el cambio vale en una
sesión abierta sin volver a entrar; cómo se llaman los roles y «+Role» en la
interfaz en español; y qué columnas muestra la página de equipo (email, rol) y
para quién. Mientras tanto vale lo de R8 (sección 18). No bloquea.

_Resuelto el 2026-10-13 por el usuario_, con la búsqueda de ese día: **quitar el
rol de admin es solo del owner, como en Clockify** (RP-68). R8 lo implementa
así.

## 8. Decisiones del usuario (2026-10-08)

- **P-01**: solo owner y admin ven las horas de otros; el resto ve solo las propias. Divergencia
  con Clockify Free, donde todos ven todo (RP-01).
- **P-02**: no aplica como excepción: un responsable de proyecto que no es owner ni admin ve solo
  sus horas, por P-01.
- **P-06**: sin el tope de 31 días de Clockify Free. Si el rendimiento pide un tope, lo fija
  `architect`.
- **P-07**: el timer en curso no se muestra ni se suma (RP-30).
- **P-08**: las personas inactivas se pueden filtrar, separadas y tachadas (RP-62).
  _Corregido el 2026-10-16, equipo EQ-44_: la pregunta decía que Clockify no lo
  permite; la página actual dice que sí, y RP-62 pasó a ser paridad.
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

_Corregido el 2026-10-08, contrato de R2b (D-R2b-3)_: se retiró «Las flechas
mueven por días, también un período de un mes (RP-20)»; desde R2b un período de
meses enteros se mueve por meses (RP-20).

_Corregido el 2026-10-13, R8_: se retiró «Hasta R8, solo el owner ve el reporte
de equipo (RP-02).»; desde R8 lo ven owner y admin, y los admins se nombran en
`/equipo` (RP-02, sección 18).

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

## 11. Núcleo, R3

_2026-10-09._ Contrato:
[`nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md`](../slices/nucleo-reportes-r3-subgrupos-tarea-y-etiqueta.md),
aprobado con cambios en la primera ronda de `architecture-reviewer`, con sus
[correcciones](../slices/correcciones-nucleo-reportes-r3-contrato.md). El
contrato tiene dos partes (D-R3-1) y el slice se partió: **esta sección
registra la parte A, R3a** —tarea y etiqueta en un nivel—, y la parte B llega
como R3b con su propia corrección en esta sección (11.5 deja anotado qué
falta). Extiende la pantalla de R2b. La regla de cada comportamiento está en la
corrección fechada de su RP; esta sección junta lo que cambia en la pantalla, y
lo que no nombra sigue como en las secciones [9](#9-núcleo-r2a) y
[10](#10-núcleo-r2b).

**Cubre:** RP-11 (un nivel, seis dimensiones), RP-12 (solo el orden por tarea y
por etiqueta), RP-18 (la suma por etiqueta, la cabecera con el total real y la
línea que lo avisa), RP-28 («Sin tarea» y «Sin etiqueta») y RP-29 (la tarea
hecha y la etiqueta archivada). Los permisos y el alcance no cambian: no hay
acción nueva, y RP-01, RP-02 y RP-07 deciden igual por tarea y por etiqueta; un
member ve solo lo propio también por etiqueta, con el total incluido. Las
lecturas de un pedido van en una sola foto, una transacción de solo lectura
`repeatable read`; por persona, proyecto, cliente y fecha la pantalla dice lo
mismo que en R2b.

**Queda para después:** subgrupos, «Subagrupar por», expandir y contraer y el
tope de filas (R3b, sección 11.5); filtros y el segundo vacío de RP-33 (R4);
gráfico (R5); exportación (R6, R7); cambiar el rol (R8); personas sin horas
(R9). Filtrar por tarea o por etiqueta es RP-25 en el resto, de la fase 3.

_Actualizado el 2026-10-09, R3b_: la parte B quedó en la rama
`nucleo/r3b-subgrupos`, con este mismo contrato desde su paso 6. Las secciones
11.5 a 11.8 juntan su pantalla, en lugar de lo que la 11.5 dejaba pendiente, y
la 11.4 suma sus divergencias. **Cubre:** RP-12 (hasta tres niveles,
`subagrupar`, el intercambio y «Ninguno»), RP-13 (expandir y contraer), RP-18
en el árbol y RP-32 (`subagrupar`). Los permisos y el alcance no cambian: no
hay acción nueva, ningún nivel se lee sin `report.view`, y en cada nivel, como
en el total, un member ve solo lo propio. **Queda para después:** filtros y el
segundo vacío de RP-33 (R4); gráfico (R5); exportación, que hereda el tope de
3000 filas (R6, R7); cambiar el rol (R8); personas sin horas (R9). No tienen
slice: «Expandir todo» y «Contraer todo», lo abierto en la URL, `treegrid` y
los grupos sin horas en cualquier nivel.

### 11.1 La barra

- **«Agrupar por»** con seis enlaces, en este orden: «Persona», «Proyecto»,
  «Cliente», «Tarea», «Etiqueta» y «Fecha». El elegido lleva `aria-current`;
  todos conservan el rango (RP-11). En pantallas angostas el grupo se parte en
  varias líneas.
- **Las flechas, el selector del período y «Esta semana»** no cambian, y
  conservan `agrupar=tarea` y `agrupar=etiqueta` como cualquier agrupación.

### 11.2 La tabla

- **Columnas**: «Tarea» o «Etiqueta», y «Duración».
- **Tarea**: el nombre de la tarea y, en gris, el de su proyecto, sin punto de
  color, como el cliente en la fila de un proyecto. Dos tareas con el mismo
  nombre en proyectos distintos son dos filas, cada una con su proyecto. «Sin
  tarea» en gris y sin proyecto, con las entradas de un proyecto sin tarea y
  las sin proyecto (RP-28). La tarea hecha y el proyecto archivado de una
  tarea, sin marca (RP-29).
- **Etiqueta**: el nombre, sin color. «Sin etiqueta» en gris, con las entradas
  sin ninguna etiqueta (RP-28). La etiqueta archivada, sin marca (RP-29).
- **El orden**: por duración, empate por nombre y «Sin tarea» o «Sin etiqueta»
  después de los grupos de su misma duración (RP-12).
- **Los totales**: por tarea, los de R2a: cada entrada tiene una tarea o
  ninguna, así que en segundos el total es la suma de las filas. Por etiqueta,
  «Total» y «Facturable» son los reales, leídos aparte en la misma foto, y una
  entrada con varias etiquetas suma en cada fila: la suma de las filas puede
  pasar el total (RP-18). Con las entradas del recorrido 10 del contrato, E1
  1:30, E2 1:20 y «Sin etiqueta» 0:15, con «Total» en 2:05.
- **La línea de la etiqueta**: solo agrupando por etiqueta, debajo de la de la
  zona: «Una entrada con varias etiquetas suma en cada una: las filas por
  etiqueta pueden sumar más que el total.» (RP-18). Por tarea no aparece.

### 11.3 Estados

- **Vacío por tarea o por etiqueta**: el de R2a, la fila «No hay horas en este
  período» con «Total» y «Facturable» en «0:00» (RP-33). Por etiqueta, la línea
  de la etiqueta se ve también en el vacío.
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  en las seis agrupaciones. Sin `report.view` no se abre la transacción ni se
  lee nada (RP-07).
- **Al recargar**: la misma vista. `agrupar=tarea` y `agrupar=etiqueta` se
  validan como las otras cuatro: `Tarea`, `tareas` o `etiquetas` se descartan y
  la vista queda por persona, sin aviso (RP-32). Hasta R3b, `subagrupar=…` se
  ignora como cualquier otra clave.

_Corregido el 2026-10-09, R3b_: desde R3b, `subagrupar` se valida y, si no
vale, se descarta entero (RP-32, sección 11.7).

### 11.4 Divergencias visibles que el reviewer no debe marcar como errores

- Por etiqueta, la suma de las filas puede pasar el «Total» (RP-18); lo de
  Clockify está _no verificado_ (P-05).
- La línea de la etiqueta sale con la agrupación y no con los datos: se ve
  aunque ninguna entrada del período tenga dos etiquetas, y en el vacío (RP-18).
- «Sin tarea» junta en una sola fila, sin proyecto, las entradas sin proyecto y
  las de proyectos sin tarea (RP-28).
- «Sin etiqueta», en singular, es el grupo; el «Sin etiquetas» del calendario
  dice que una entrada no tiene ninguna. Son dos textos distintos a propósito
  (RP-28).
- Ni la tarea hecha, ni la etiqueta archivada, ni el proyecto archivado de una
  tarea llevan marca (RP-29).
- «Tarea» está en «Agrupar por» aunque la documentación de Clockify no la
  nombre: entra por decisión del usuario (RP-11).

_Actualizado el 2026-10-09, R3b_:

- **El tope de 3000 filas.** Si el árbol pasa de 3000 filas sumando todos sus
  niveles, se muestran solo los niveles de arriba que entran, y encima de la
  tabla, debajo de los totales, dice: «El reporte pasa de 3000 filas con todos
  sus niveles: se muestran solo los de arriba. Acortá el período o quitá un
  nivel.». Un nivel entra entero o no entra: nunca se ve una parte de un nivel,
  y cuando uno no entra, los de abajo tampoco. Los botones de los subniveles
  siguen diciendo lo pedido, que es lo que dice la URL; el encabezado de la
  columna nombra solo los que se muestran (D-R3-6).
- **Lo que se ve con el tope**, medido en el volumen de §6.3 del contrato: con
  «Este año», **Persona → Proyecto → Fecha de todo el equipo muestra dos
  niveles, Persona y Proyecto, y la línea del tope**; **Etiqueta → Proyecto →
  Fecha, también**. Persona → Fecha de un año muestra solo las personas (§10,
  nota 4 del contrato). Para ver los días de todo el equipo hay que acortar el
  período o mirar por persona.
- **El corte es por niveles enteros**: aunque los días de algunas personas
  entrarían, no se ve ninguno.
- **El primer nivel no tiene tope** y se muestra siempre entero. Si pasa de 3000
  por su cuenta, con subniveles pedidos no se ve ninguno de abajo y aparece la
  línea; sin subniveles, se ven todas sus filas y no hay línea.
- **Un período sin horas no se corta**: el encabezado nombra todos los niveles
  pedidos y no hay línea del tope.
- **Lo abierto se pierde** al recargar, con «Atrás», en un enlace copiado y en
  cada navegación que cambia la URL dentro de la pantalla (RP-13). No hay
  «Expandir todo» ni «Contraer todo».
- **Expandir es un botón con el nombre del grupo**, no el número junto al grupo
  que describe Clockify (RP-13).
- **El proyecto en gris de una tarea** se ve también debajo de un grupo de
  proyecto, aunque repita el de arriba, como el cliente en gris de un proyecto
  debajo de un grupo de cliente (D-R3-4).
- **Con la etiqueta en un subnivel**, los hijos de etiqueta de un grupo pueden
  sumar más que el grupo (RP-18).
- **El nivel de una fila no se oye** con un lector de pantalla: la sangría es
  solo visual; el orden de las filas y el estado del botón lo dan (D-R3-9).
- **«Ninguno» y el intercambio** al elegir una dimensión que ya está no están
  documentados en Clockify (RP-12).

_Corregido el 2026-10-09, R10b (D-R10-10)_: el punto «El primer nivel no tiene
tope» dejó de valer. **El primer nivel también entra entero o no entra**: si
pasa de 3000 filas no se muestra ningún nivel, y la tabla lo dice en lugar de
las filas (sección 13.7). La línea del tope de arriba queda para cuando el
primer nivel entra y uno de abajo no. Con las ocho dimensiones de R3 a R10a no
se ve: ninguna pasa de 3000 en el primer nivel en un período de hasta 366
días.

### 11.5 R3b: la barra

- **«Subagrupar por»**, después de «Agrupar por», es un grupo nombrado por su
  rótulo con el botón «Segundo nivel: {dimensión}» o «Segundo nivel: Ninguno»,
  siempre, y «Tercer nivel: …», solo si hay segundo nivel. El texto del botón
  es su nombre accesible.
- **Cada botón abre un popover** con una lista nombrada «Segundo nivel» o
  «Tercer nivel»: «Ninguno» primero y después las dimensiones que no están en
  los niveles de arriba, en el orden de «Agrupar por». La elegida, o «Ninguno»,
  lleva `aria-current`. Elegir un enlace cierra el popover, navega y devuelve el
  foco al botón, que ya dice lo nuevo; con Ctrl o Cmd lo abre en otra pestaña y
  el popover queda abierto.
- **«Agrupar por»** sigue con los seis enlaces de R3a; elegir uno que está en un
  subnivel los intercambia, y el enlace de lo que ya está en el primer nivel
  lleva a la misma URL (RP-12).
- **Las flechas, el selector del período con sus atajos y «Aplicar», y «Esta
  semana»** conservan los subniveles (RP-32).

### 11.6 R3b: la tabla y el árbol

- **El encabezado de la primera columna** nombra los niveles que se muestran,
  unidos por « / »: «Proyecto / Fecha», «Persona / Proyecto / Fecha». Con un
  nivel, el de R3a. Con el árbol cortado por el tope, solo los que entraron.
- **Las filas**: al cargar, los grupos del primer nivel. Cada grupo con hijos
  lleva el botón de RP-13, con `aria-expanded`. Al abrirlo, sus hijos van
  después de él y antes de su hermano siguiente, con más sangría; los del
  tercer nivel, con más todavía.
- **Una fila de abajo se rotula como en un nivel**: el día con su día de la
  semana y su fecha, «mar, 06/10», sin «Hoy» ni «Ayer»; la tarea con su
  proyecto en gris; el proyecto con su punto de color y su cliente en gris; la
  persona con «(inactiva)» si corresponde; los «Sin …» en gris.
- **La duración de cada fila** es la de su grupo, truncada al minuto (RP-18).
- **El orden** de los hermanos es el de la dimensión de su nivel (RP-12).
- **La línea de la etiqueta**, debajo de la de la zona, si la etiqueta es uno de
  los niveles que se muestran (RP-18).
- **La línea del tope**, debajo de los totales y encima de la tabla, si se
  muestran menos niveles que los pedidos (sección 11.4).
- Con las entradas del recorrido 11 del contrato, Proyecto → Fecha: P1 1:30 y
  P2 0:45, contraídos; abierto P1, el martes 1:00 y el jueves 0:30 entre P1 y
  P2.

### 11.7 R3b: estados y casos borde

- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  con cualquier combinación de niveles. Sin `report.view` no se abre la
  transacción ni se lee ningún nivel (RP-07).
- **Vacío con subniveles**: la fila «No hay horas en este período», «Total» y
  «Facturable» en «0:00», el encabezado con todos los niveles pedidos
  («Proyecto / Fecha / Etiqueta») y sin línea del tope; con la etiqueta en algún
  nivel, su línea (RP-18, RP-33).
- **Árbol cortado por el tope**: la línea del tope; el encabezado y las filas
  con los niveles que entraron; si solo entró el primero, las filas sin botón,
  como un reporte de un nivel.
- **Al recargar**: la misma URL, los botones de los subniveles con lo elegido y
  todo contraído (RP-13, RP-32). Un `subagrupar` inválido se descarta entero y
  sin aviso, y el reporte queda en un nivel.
- **El mismo día debajo de dos proyectos** son dos filas distintas, que se
  abren y se cierran por separado.
- **Una navegación que no cambia la URL** —el enlace de la agrupación ya
  elegida, «Ninguno» en un nivel que ya no tiene nada, el atajo del período que
  ya se ve— no vuelve a contraer lo abierto: el árbol empieza de nuevo cuando
  cambia la URL del pedido, que es su `key` (D-R3-9). Ningún e2e lo recorre.

### 11.8 R3b: qué puede hacer cada rol

| Membresía                                           | Ve                                                                                           | Acciones                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`, `admin` activas                            | Todas las personas del workspace con horas, activas o no, en cada nivel                      | Cambiar el período, la agrupación y los subniveles; expandir y contraer; recargar; compartir el enlace, que lleva los niveles y no lo abierto |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio en cada nivel y en el total, también con el enlace de un admin con subniveles | Las mismas                                                                                                                                    |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                            | Ninguna                                                                                                                                       |

## 12. Núcleo, R4

_2026-10-09._ Contrato:
[`nucleo-reportes-r4-filtros.md`](../slices/nucleo-reportes-r4-filtros.md). El
contrato tiene dos partes (D-R4-1) y el slice se partió: **esta sección
registra la parte A, R4a** —los filtros de cliente y de proyecto—, y la parte
B, personas, llega como R4b con su propia corrección en esta sección. La regla
de cada comportamiento está en la corrección fechada de su RP; esta sección
junta lo que cambia en la pantalla, y lo que no nombra sigue como en las
secciones [9](#9-núcleo-r2a) a [11](#11-núcleo-r3).

**Cubre:** RP-25 (cliente y proyecto), RP-26 (solo «Sin proyecto»), RP-29 (los
archivados en los filtros), RP-32 (`clientes`, `proyectos` y los enlaces que
los conservan), RP-33 (el segundo vacío, con «Quitar filtros») y RP-34 (lo que
no existe se ignora; «Elegí hasta 50.»). Los permisos y el alcance no cambian:
no hay acción nueva, los filtros se suman al alcance y nunca lo ensanchan —un
member filtra lo propio—, y sin `report.view` no se leen los catálogos ni se
abre la transacción. Los catálogos de los filtros se leen en la misma foto que
los niveles.

**Queda para después:** el filtro de personas, con las inactivas aparte y
tachadas y sin las invitadas (R4b: RP-25 en personas, RP-31, RP-62, RP-64);
gráfico (R5); exportación (R6, R7); personas sin horas (R9); agrupar por
descripción, mes y semana (R10). Filtrar por tarea, etiqueta, descripción o
facturable, «Sin cliente» como filtro y guardar filtros siguen para la fase 3
(RP-25, RP-26, RP-27).

_Actualizado el 2026-10-09, R4b_: la parte B, el filtro de personas, está hecha,
y lo que sigue describe el código de la rama `nucleo/r4b`. **Cubre además:**
RP-25 (personas), RP-31 (dos personas con el mismo nombre en el filtro), RP-32
(`personas` y lo que hace con quien no ve horas de otros), RP-34 (un id que no
está en el filtro se ignora), RP-62 (las inactivas aparte y tachadas) y RP-64
(las invitadas no están). El filtro de personas angosta el alcance y nunca lo
ensancha: solo existe para owner y admin, y quien no ve horas de otros y trae
`personas` en la URL ve lo propio. De «Queda para después», lo de R4b ya no
queda; el resto sigue igual. Las secciones 12.6 a 12.8 juntan lo de la pantalla.

### 12.1 La barra

- **«Filtrar por»**, después de «Subagrupar por», es un grupo nombrado por su
  rótulo con dos botones: «Clientes: {resumen}» y «Proyectos: {resumen}». El
  resumen es «todos» sin nada elegido, el nombre con uno —también un archivado,
  y «Sin proyecto» solo— y la cantidad con más. En pantallas angostas el grupo
  baja a su propia línea, y el texto de un botón que no entra se corta con
  puntos suspensivos; su nombre accesible sigue entero.
- **Las flechas, el selector del período con sus atajos y «Aplicar», «Esta
  semana», «Agrupar por» y los subniveles** conservan los filtros (RP-32).

### 12.2 El panel de un filtro

- **Un popover** nombrado por el filtro («Clientes» o «Proyectos») debajo del botón, de unos 320 px de ancho o el de la pantalla
  si es menor: el buscador arriba, la lista con su desplazamiento y, al pie, la
  región del mensaje y «Aplicar», que quedan a la vista con un catálogo largo,
  también a 1366×657, 375 y 320 px.
- **El buscador**, «Buscar clientes» o «Buscar proyectos», tiene el foco al
  abrir; Tab pasa a la primera casilla y Espacio la tilda. Enter en el buscador
  no aplica. Un clic en el nombre tilda su casilla.
- **Proyectos**: «Sin proyecto» primero, en gris; después los vigentes, cada
  uno con su punto de color, su nombre y su cliente en gris; después
  «Archivados». **Clientes**: los vigentes y «Archivados», sin color ni
  detalle.
- **«Nada coincide con la búsqueda.»** cuando hay una búsqueda escrita y no
  coincide ninguna opción que se pueda buscar, también con el catálogo vacío; en proyectos aparece debajo de «Sin proyecto», que sigue.
- **«Elegí hasta 50.»** al pie, con más de 50 elegidos (RP-34).

### 12.3 Estados y casos borde

- **Con filtros y sin grupos**: el segundo vacío (RP-33), también con
  subniveles; «Quitar filtros» conserva `subagrupar`.
- **Al recargar o con «Atrás»**: la misma vista y los botones con lo elegido;
  el árbol empieza contraído, y cambiar un filtro lo vuelve a contraer
  (D-R4-10).
- **Un filtro inválido en la URL** se descarta entero y sin aviso, y los otros
  siguen (RP-32). **Ids que no existen** se ignoran de a uno y se pierden en la
  navegación siguiente (RP-34).
- **Un catálogo vacío** —un workspace sin clientes, o sin proyectos que quien
  mira pueda ver—: el panel tiene el buscador y «Aplicar», sin opciones; sin
  búsqueda no hay mensaje, y con una búsqueda escrita, «Nada coincide con la
  búsqueda.». En proyectos queda «Sin proyecto».
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  con cualquier filtro.

### 12.4 Divergencias visibles que el reviewer no debe marcar como errores

- **La línea del alcance no dice el filtro**: sigue diciendo «Ves solo tus
  horas.» o «Ves las horas de todas las personas del workspace.», porque dice
  lo que quien mira puede ver; lo elegido lo dicen los botones (D-R4-4).
- **El segundo vacío con un período sin horas**: con filtros y sin grupos,
  «Ninguna entrada coincide con los filtros» aunque el período esté vacío para
  todos; «Quitar filtros» lleva al primero (D-R4-7).
- **Un proyecto privado propio que no se puede elegir**: un member con horas
  en un privado del que no es miembro (PR-71) las ve agrupando por proyecto,
  pero el proyecto no está en el filtro, porque el catálogo sigue a
  `project.view`, y su id en la URL se ignora. Sí puede filtrar por el cliente
  de ese proyecto (D-R4-6). Con todos los proyectos públicos (P-17 de
  `proyectos.md`), no pasa.
- **El filtro de cliente deja afuera lo que no tiene proyecto**, también con
  «Sin proyecto» elegido; cliente y proyecto se cruzan sin excepción (RP-26,
  D-R4-3).
- **Los archivados no van tachados**: van aparte, en «Archivados»; el tachado
  es de las personas inactivas (P-08, R4b).
- **«Sin proyecto» no se busca**: sigue en la lista con cualquier búsqueda, y
  «Nada coincide con la búsqueda.» aparece debajo de él.
- **La búsqueda mira solo el nombre**: el cliente en gris de un proyecto no se
  busca.
- **Lo inválido o inexistente en la URL se descarta sin aviso** (RP-32,
  RP-34): quien edita la URL a mano ve «todos» sin saber por qué.
- **Esc y un clic afuera descartan lo tildado** sin preguntar.
- **Con personas elegidas, la línea del alcance sigue diciendo «Ves las horas de
  todas las personas del workspace.»**: dice lo que quien mira puede ver; lo
  elegido lo dice «Personas: …» (D-R4-4).
- **Quien no ve horas de otros no se entera de que el enlace traía personas**:
  el parámetro se descarta sin aviso y la línea dice «Ves solo tus horas.»
  (RP-32).
- **Las inactivas van tachadas en el filtro y no en la tabla**: su fila sigue
  con «(inactiva)» en gris (RP-31); el tachado es solo del panel (P-08).
- **Dos personas con el mismo nombre son dos casillas iguales**: la opción no
  muestra el correo (RP-31).
- **Una persona activa sin horas está en el filtro** y, elegida sola, da el
  segundo vacío: el filtro ofrece las personas del workspace, no las del
  período (D-R4-5, D-R4-7).
- **Una invitada con horas**, que solo deja la base, tiene su fila agrupando por
  persona y no está en el filtro (RP-64).
- **Con una sola persona elegida, el botón dice su nombre sin «(inactiva)»**,
  aunque lo sea.

_Actualizado el 2026-10-12, contrato de R9 (D-R9-9)_: «Una persona activa sin
horas está en el filtro y, elegida sola, da el segundo vacío» vale sin «Mostrar
personas sin horas». Con la opción, elegida sola, es una fila en «0:00» y no hay
vacío (RP-33, sección 16).

### 12.5 Qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                                                                      | Acciones                                                                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`, `admin` activas                            | Todas las personas del workspace con horas, filtradas por cliente y proyecto en cada nivel y en el total; en el filtro de proyecto, los que `project.view` les deja ver | Cambiar el período, la agrupación, los subniveles y los filtros; quitar los filtros; expandir y contraer; recargar; compartir el enlace, que lleva los niveles y los filtros |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio, filtrado, también con el enlace de un admin con filtros; en el filtro de proyecto, los que `project.view` les deja ver                                  | Las mismas                                                                                                                                                                   |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                                                                       | Ninguna                                                                                                                                                                      |

### 12.6 R4b: la barra y el panel de personas

- **«Personas: {resumen}»** va primero en «Filtrar por», antes de «Clientes» y
  «Proyectos», solo para owner y admin: «todas», el nombre con una y la
  cantidad con más. En pantallas angostas ocupa el ancho de la columna, el
  texto que no entra se corta con puntos suspensivos y su nombre accesible
  sigue entero, como los otros (12.1).
- **El panel**, nombrado «Personas»: «Buscar personas», el grupo «Personas» con
  las activas, «Inactivas» con los nombres tachados, la región del mensaje y
  «Aplicar», que quedan a la vista con una lista larga, también a 1366×657, 375
  y 320 px. El teclado es el de 12.2.
- **Con una búsqueda** que solo coincide con inactivas queda solo «Inactivas»;
  con ninguna, «Nada coincide con la búsqueda.». Para quien tiene el filtro, la
  lista nunca está vacía: quien mira está en ella.

### 12.7 R4b: estados y casos borde

- **Con personas y sin grupos**: el segundo vacío; «Quitar filtros» también
  quita las personas.
- **Al recargar, con «Atrás» o con un enlace copiado**: las mismas personas, y el
  botón lo dice.
- **`personas` mal formado** se descarta entero y los otros filtros siguen; **los
  ids que no están** se ignoran de a uno y se pierden al navegar; si se ignoran
  todos, el reporte es el de todas y el vacío, el primero (RP-32, RP-34).
- **Quien no ve horas de otros, con `personas`**: lo propio, sin el botón, y el
  parámetro se pierde en la navegación siguiente.

### 12.8 R4b: qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                                                                                                 | Acciones                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `owner`, `admin` activas                            | Todas las personas del workspace con horas, o solo las elegidas, filtradas además por cliente y proyecto en cada nivel y en el total; en el filtro, las activas y las inactivas, sin las invitadas | Las de 12.5, y elegir personas, también inactivas |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio, filtrado por cliente y proyecto, también con el enlace de un admin que elige personas; sin filtro de personas                                                                      | Las de 12.5, sin filtro de personas               |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                                                                                                  | Ninguna                                           |

## 13. Núcleo, R10

_2026-10-09._ Contrato:
[`nucleo-reportes-r10-descripcion-mes-y-semana.md`](../slices/nucleo-reportes-r10-descripcion-mes-y-semana.md),
aprobado en la segunda ronda de `architecture-reviewer`. El contrato tiene dos
partes (D-R10-1): **esta sección registra la parte A, R10a** —agrupar por
semana y por mes—, y la parte B, descripción, llega como R10b con su propia
corrección en esta sección. La regla de cada comportamiento está en la
corrección fechada de su RP; esta sección junta lo que cambia en la pantalla, y
lo que no nombra sigue como en las secciones [9](#9-núcleo-r2a) a
[12](#12-núcleo-r4).

**Cubre:** RP-11 (semana y mes, ocho dimensiones), RP-12 (el orden cronológico
y las combinaciones de dos dimensiones de tiempo), RP-24 (la semana como
agrupación sigue el primer día de quien mira), RP-32 (`semana` y `mes` en
`agrupar` y `subagrupar`) y P-11 (resuelta). Los permisos y el alcance no
cambian: no hay acción nueva; semana y mes pasan por el mismo alcance y los
mismos filtros que las otras dimensiones, en cada nivel y en el total; un
member ve solo lo propio, también con el enlace de un admin que trae
`personas`. Los cortes los arma el servidor con la zona y el primer día de
quien mira; de la URL solo llegan los valores de `agrupar` y `subagrupar`.

**Queda para después:** agrupar por descripción, «Sin descripción» y el tope de
3000 filas en el primer nivel (R10b); gráfico, que usa los mismos tramos por
semana y por mes (R5); exportación (R6, R7); personas sin horas (R9). No tienen
slice: numerar las semanas («Semana 40»), agrupar por año, una línea con el
primer día de la semana y las semanas o los meses sin horas.

_Actualizado el 2026-10-09, R10b_: la parte B quedó en la rama `nucleo/r10b`,
con este mismo contrato. Las secciones 13.6 a 13.9 juntan su pantalla y la
13.4 suma sus divergencias. **Cubre:** RP-11 (descripción, nueve dimensiones,
y el tope en el primer nivel), RP-12 (el orden por descripción y sus
combinaciones), RP-18 (el total con el primer nivel cortado), RP-28 («Sin
descripción»), RP-32 (`descripcion` en `agrupar` y `subagrupar`) y RP-33 (sin
vacío con el primer nivel cortado). Los permisos y el alcance no cambian: no
hay acción nueva. **Es la primera pantalla que muestra texto escrito por otra
persona**: solo owner y admin ven los textos ajenos (`timeEntry.others.view`);
un member, un `project_manager` o un `team_manager` ve solo los suyos en cada
nivel, también con el enlace de un admin que trae `personas`, y la página no
trae ningún texto ajeno. El texto se muestra como texto, nunca como HTML. El
largo, la clave del grupo y el tope los fija el servidor; de la URL solo
llegan los valores de `agrupar` y `subagrupar`. **Queda para después:**
filtrar por descripción y «Sin descripción» como filtro (RP-25 y RP-26 en el
resto, fase 3); qué exportan R6 y R7 cuando el primer nivel no entra; gráfico
(R5); personas sin horas (R9). No tienen slice: el texto entero de una
descripción en el reporte (un tooltip o un detalle) y juntar las variantes de
un texto.

### 13.1 La barra

- **«Agrupar por»** con ocho enlaces, en este orden: «Persona», «Proyecto»,
  «Cliente», «Tarea», «Etiqueta», «Fecha», «Semana» y «Mes». El elegido lleva
  `aria-current`; todos conservan el rango, los subniveles y los filtros
  (RP-11, RP-32). En pantallas angostas el grupo se parte en dos líneas.
- **«Segundo nivel» y «Tercer nivel»** ofrecen «Semana» y «Mes» al final, en el
  orden de «Agrupar por», salvo lo que ya está arriba. Elegir en «Agrupar por»
  una dimensión que está en un subnivel las intercambia, también entre dos de
  tiempo: desde Semana → Mes, «Mes» da Mes → Semana; desde Mes → Semana →
  Fecha, «Fecha» da Fecha → Semana → Mes (RP-12).
- **Las flechas, el selector del período y «Esta semana»** no cambian.

### 13.2 La tabla

- **Columnas**: «Semana» o «Mes», y «Duración»; con subniveles, «Mes / Semana /
  Fecha» y las demás combinaciones.
- **Semana**: el rótulo es la semana entera, del primer al séptimo día con el
  primer día de quien mira, en el formato de fecha del perfil: «28/09 – 04/10»,
  con el año en los dos extremos si alguno no es del año de hoy
  («29/12/2025 – 04/01/2026»). Sin «Esta semana» ni «Semana anterior», como la
  fecha va sin «Hoy» ni «Ayer».
- **Mes**: el nombre en minúscula, «octubre», o «octubre de 2025» si no es del
  año de hoy, en un `<time>` con el mes («2025-10»).
- **«solo …»**: si la fila no cuenta la semana o el mes entero, después del
  rótulo y en gris, los días que cuenta: «28/09/2025 – 04/10/2025 solo
  01/10/2025 – 04/10/2025», o «solo 20/09/2025» si es uno. Los cortan el
  período y **cada grupo de tiempo del camino de la fila, a cualquier altura**:
  debajo de «septiembre», la semana que cruza el fin de mes dice «solo 28/09 –
  30/09»; en Mes → Persona → Semana dice lo mismo, aunque su padre directo sea
  la persona; debajo de un día, la semana dice ese día. Una semana o un mes
  enteros dentro del período, sin grupo de tiempo arriba que los corte, no
  dicen nada. El texto «solo …» es parte del nombre del botón de expandir.
- **Los cortes** son los días civiles en la zona de quien mira (RP-22): una
  entrada cuenta en la semana y en el mes de su inicio (RP-23). Con las
  entradas del recorrido 17 del contrato y domingo como primer día, del
  20/09/2025 al 10/10/2025: «14/09/2025 – 20/09/2025 solo 20/09/2025» 0:15,
  «28/09/2025 – 04/10/2025» 1:30 y «05/10/2025 – 11/10/2025 solo 05/10/2025 –
  10/10/2025» 0:20; por mes, «septiembre de 2025 solo 20/09/2025 – 30/09/2025»
  1:15 y «octubre de 2025 solo 01/10/2025 – 10/10/2025» 0:50; total 2:05. Con
  sábado, las mismas entradas dan tres semanas enteras sin «solo».
- **Los atajos** (RP-20) son unidades enteras alineadas a quien mira: «Esta
  semana», «Semana anterior» y «Últimas dos semanas» por semana dan semanas
  sin «solo»; «Este mes» y «Mes pasado» por mes, un mes entero; «Este año» por
  mes, meses enteros, y por semana, la primera y la última cortadas. Un rango
  libre corta lo que corte.
- **El orden**: cronológico en cada nivel, por el primer día de la semana o del
  mes, aunque una posterior tenga más horas (RP-12).
- **Los totales**: cada entrada está en exactamente una semana y un mes, así que
  en segundos el total es la suma de las filas, como en R2a (RP-18). Los hijos
  de cada grupo suman lo del grupo.

### 13.3 Estados y casos borde

- **Vacío por semana o por mes**: la fila «No hay horas en este período» y los
  totales en «0:00» (RP-33). Una semana o un mes sin horas no tiene fila,
  tampoco dentro de un período que los incluye.
- **Al recargar o con «Atrás»**: la misma URL y todo contraído (RP-13, RP-32).
  `agrupar` o `subagrupar` inválidos se descartan sin aviso, como los otros
  valores.
- **La misma semana debajo de dos meses** son dos filas distintas, cada una con
  su parte, su «solo …» y su duración, y se abren y se cierran por separado.
- **Dos zonas o dos primeros días** dan semanas distintas para el mismo
  período: una entrada del domingo 05/10 a las 23:30 en Buenos Aires es de la
  semana del 29/09 para quien mira desde ahí y de la del 06/10 desde Madrid; una
  del 30/09 a las 23:30, de septiembre y de octubre. Es correcto (RP-22,
  RP-24).
- **El día que falta entero** (`Pacific/Apia`, el 2011-12-30) no rompe los
  tramos: una semana que empezaría ese día empieza en el siguiente, con el
  rótulo de la semana entera.
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  con cualquier combinación de niveles.

### 13.4 Divergencias visibles que el reviewer no debe marcar como errores

- **Una semana o un mes cortados por el período o por un grupo de arriba
  llevan el rótulo entero y «solo …»** con los días que cuentan; el total es
  siempre el del período de la cabecera (D-R10-3). Cómo lo hace Clockify está
  _no verificado_ (P-05).
- **La semana se rotula con sus días y no con un número** («28/09 – 04/10», no
  «Semana 40»), y no hay línea con el primer día de la semana: cada fila lo
  dice con sus días (D-R10-3).
- **El orden es cronológico** y no por duración, como por fecha (RP-12).
- **«Semana» y «Mes» van al final de «Agrupar por»**, después de «Fecha»; el
  orden de Clockify en pantalla está _no verificado_ (P-05).
- **Fecha → Semana y Semana → Fecha** se permiten aunque la primera da un hijo
  por día (D-R10-6).
- **«solo …» con el año** sigue la regla del año de su propio rango: debajo de
  «29/12/2025 – 04/01/2026», «enero solo 01/01 – 04/01» va sin año.
- **Dos personas que comparan semanas** pueden ver cortes distintos si sus
  primeros días o sus zonas difieren (RP-22, RP-24).

_Actualizado el 2026-10-09, R10b_:

- **«Reunión» y «reunión» son dos filas**, y también «Reunión semanal» con dos
  espacios en el medio (D-R10-8). Lo de Clockify, _no verificado_ (P-05).
- **Dos variantes de un texto pueden verse iguales y ser dos filas**: «Reunión
  semanal» con dos espacios se ve como la de uno, porque la pantalla junta los
  espacios; «Reunión» con un espacio al final, o con la «é» en dos puntos de
  código, se ve como «Reunión». Cada una lleva su duración y se abre por
  separado. Como dos personas con el mismo nombre (RP-31), la fila no dice cuál
  es cuál. El rastreador permite el doble espacio; el espacio de borde solo
  llega con SQL escrito a mano, porque la aplicación recorta.
- **100 caracteres y «…», sin el texto entero**: no hay tooltip; se lee en el
  rastreador o en la planilla. Un emoji cuenta como un carácter. **Si el corte
  cae justo después de un espacio, la fila termina en «palabra …»**, con un
  espacio antes de «…»: es el texto guardado, recortado (D-R10-9). Dos textos
  que comparten los 100 primeros caracteres son dos filas con el mismo texto,
  cada una con su duración.
- **En pantallas angostas la columna corta antes**, con el «…» del navegador:
  a 320 y 375 px, dos textos que empiezan igual pueden verse iguales. La tabla
  no se ensancha.
- **El primer nivel que no entra no se muestra entero ni en parte**: con más de
  3000 descripciones no se ve ninguna fila ni los niveles de abajo, solo los
  totales y la fila que lo dice (D-R10-10). No hay «Otras descripciones» ni las
  primeras por duración.
- **Persona → Descripción de un mes de todo el equipo puede mostrar solo las
  personas**: el segundo nivel cuenta cada texto de cada persona, y con el
  volumen de §6 del contrato son unas 4250 filas, más que las que le deja el
  tope; se ve la línea del tope de R3b (sección 11.4). «Descripción» sola en
  ese mes sí entra (unas 1180). Para ver los textos, acortar el período o
  elegir personas.
- **«Descripción» va al final de «Agrupar por»**, después de «Mes»; el orden
  de Clockify en pantalla está _no verificado_ (P-05).

### 13.5 Qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                            | Acciones                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `owner`, `admin` activas                            | Todas las personas del workspace con horas, por semana y por mes en cada nivel, cortadas con su zona y su primer día          | Las de 12.5 y 12.8, con «Semana» y «Mes» en «Agrupar por» y los subniveles |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio por semana y por mes, también con el enlace de un admin con `agrupar=mes&subagrupar=semana,persona&personas=…` | Las mismas, sin filtro de personas                                         |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                             | Ninguna                                                                    |

### 13.6 R10b: la barra

- **«Agrupar por»** con nueve enlaces, en este orden: «Persona», «Proyecto»,
  «Cliente», «Tarea», «Etiqueta», «Fecha», «Semana», «Mes» y «Descripción». El
  elegido lleva `aria-current`; todos conservan el rango, los subniveles y los
  filtros (RP-11, RP-32). A 320 y 375 px el grupo se parte en tres renglones,
  sin ensanchar la página más allá de la navegación del shell.
- **«Segundo nivel» y «Tercer nivel»** ofrecen «Descripción» al final, salvo
  que ya esté arriba. Elegir en «Agrupar por» una dimensión que está en un
  subnivel las intercambia: desde Persona → Descripción, «Descripción» da
  Descripción → Persona (RP-12).
- **No hay filtro por descripción** (RP-25, fase 3).

### 13.7 R10b: la tabla

- **Columnas**: «Descripción» y «Duración»; con subniveles, «Descripción /
  Persona», «Persona / Descripción» y las demás combinaciones.
- **La fila de una descripción**: el texto tal como se guardó, hasta 100
  caracteres, con «…» si sigue, en un renglón; lo que no entra en la columna
  se corta con el «…» del navegador. Se muestra como texto: `<b>` y `&` se
  ven tal cual. El nombre del botón de expandir es el texto de la fila.
- **«Sin descripción»** en gris, como los otros «Sin …» (RP-28).
- **El orden**: duración descendente, empate por el texto sin distinguir
  mayúsculas y «Sin descripción» después de los de su misma duración (RP-12).
- **Los totales**: cada entrada está en exactamente una descripción, así que
  el total es la suma de las filas (RP-18).
- Con las entradas del recorrido 19 del contrato: «Reunión {sufijo}» 1:30,
  «reunión {sufijo}» 0:20, «Sin descripción» 0:15 y los 100 primeros
  caracteres del texto largo con «…» 0:10; total 2:15. Con «Proyecto» debajo,
  «Reunión {sufijo}» abre P1 1:00 y P2 0:30. Con el filtro de P2, «Reunión
  {sufijo}» 0:30 y el largo 0:10; total 0:40.
- **El primer nivel que no entra** (D-R10-10): si el primer nivel pasa de 3000
  filas, de cualquier dimensión, el encabezado nombra solo el primer nivel
  pedido («Descripción», también con `subagrupar=proyecto,persona`), y el
  cuerpo es una fila de dos columnas: «El primer nivel pasa de 3000 filas y no
  se muestra. Acortá el período, filtrá o agrupá por otra cosa.». Sin filas de
  grupos, sin la línea del tope de R3b y sin vacío. «Total» y «Facturable»,
  los reales (RP-18). Los botones de los subniveles siguen diciendo lo pedido.
  Con las 3001 entradas de un minuto del recorrido 20: total 50:01; por
  proyecto, «Sin proyecto» 50:01; Proyecto → Descripción, «Sin proyecto» sin
  botón y la línea del tope de R3b.

### 13.8 R10b: estados y casos borde

- **Vacío por descripción**: el de RP-33, con el encabezado de todos los
  niveles pedidos.
- **El primer nivel que no entra, con filtros**: la misma fila, no el segundo
  vacío (RP-33). Un filtro que no deja nada da el segundo vacío; uno que deja
  3000 o menos muestra las filas. Con exactamente 3000 el nivel entra.
- **Al recargar o con «Atrás»**: la misma URL y todo contraído (RP-13, RP-32).
  Un `agrupar` o un `subagrupar` con `descripción` o `Descripcion` se descarta
  sin aviso.
- **Dos textos que comparten los 100 primeros caracteres** son dos filas con
  el mismo texto y «…», cada una con lo suyo, que se abren por separado.
- **Etiqueta → Descripción** muestra la línea de la etiqueta y, si el segundo
  nivel no entra, también la del tope (RP-18).
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3,
  con cualquier combinación de niveles.

### 13.9 R10b: qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                                              | Acciones                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `owner`, `admin` activas                            | Las descripciones de todas las personas del workspace con horas, en cada nivel, también las de las inactivas                                    | Las de 13.5, con «Descripción» en «Agrupar por» y los subniveles |
| `project_manager`, `team_manager`, `member` activas | Solo sus descripciones, en cada nivel y en el total, también con el enlace de un admin con `agrupar=descripcion&personas=…`; ningún texto ajeno | Las mismas, sin filtro de personas                               |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                                               | Ninguna                                                          |

## 14. Núcleo, R5

_2026-10-10._ Contrato:
[`nucleo-reportes-r5-grafico-de-barras.md`](../slices/nucleo-reportes-r5-grafico-de-barras.md),
aprobado en la segunda pasada de `architecture-reviewer`. Es un solo slice
(D-R5-1). La regla de cada comportamiento está en la corrección fechada de su
RP; esta sección junta lo que cambia en la pantalla, y lo que no nombra sigue
como en las secciones [9](#9-núcleo-r2a) a [13](#13-núcleo-r10).

**Cubre:** RP-15 (el gráfico por día, semana o mes según el largo del período,
el valor con el puntero y con el teclado, y la tabla de datos), RP-16 (sigue
fuera: un solo color), RP-18 (las barras suman el total), RP-22 (los días en la
zona de quien mira, con el día que falta), RP-24 (las semanas desde el primer
día de quien mira) y RP-33 (sin gráfico en los dos vacíos). Los permisos y el
alcance no cambian: no hay acción nueva; las barras pasan por el mismo alcance,
las mismas personas elegidas y los mismos filtros que la cabecera, en la misma
foto; un member ve lo propio, también con el enlace de un admin que trae
`personas`. La granularidad, los cortes y los rótulos los arma el servidor; de
la URL no llega ningún parámetro nuevo.

**Queda para después:** exportación, con o sin gráfico (R6, R7); personas sin
horas (R9), que no cambia el gráfico. Las barras partidas (RP-16) y la torta
(RP-17) son de la fase 3. No tienen slice: elegir la granularidad a mano, un
clic en una barra que cambie el período o filtre la tabla, líneas de objetivo,
promedios o comparación con otro período, y numerar las semanas en el eje
(«S40»). El gráfico del tablero es de RP-41.

### 14.1 El gráfico

- **El lugar**: después de «Total» y «Facturable» y antes de la línea del tope
  (sección 11.6) y de la tabla. No cambian la barra de herramientas, la línea
  del alcance, la de la zona, la de la etiqueta ni la tabla.
- **La leyenda**: «Horas por día», «Horas por semana» u «Horas por mes». Es el
  único nombre del gráfico.
- **De arriba abajo**: la línea del valor, con su alto reservado aunque esté
  vacía; el área, de alto fijo, con los rótulos de la escala a la izquierda, sus
  líneas detrás y una columna por barra; las marcas debajo; y «Ver los datos
  del gráfico».
- **Las barras**: grises, del mismo color en los dos temas. La de la columna
  activa va en el color principal (casi negra en claro, casi blanca en oscuro),
  y esa columna entera lleva el fondo `muted`. Una barra con al menos un
  segundo tiene al menos 2 px, así no se confunde con una vacía, aunque su
  nombre diga «0:00»; una sin segundos no se dibuja, pero su columna está. Con una sola barra, el ancho tiene tope (48 px) y va
  centrada.
- **La escala**: de dos a cinco líneas desde «0:00», con un paso de 15 min,
  30 min, 1 h, 2 h, 5 h, 10 h, 20 h, 50 h…, y el techo en el menor múltiplo del
  paso que cubre la barra más alta. Todo en cero da «0:00» y «0:15».
- **Las marcas**: hasta siete, una cada `ceil(n / 7)` barras desde la primera,
  con el área de las columnas de 24rem o más; más angosta (a 320 y 375 px),
  solo una de cada dos de esas: con 31 barras, las de la 1.ª, 11.ª, 21.ª y
  31.ª. La marca de la primera columna va alineada al inicio, la de la última
  columna, si la lleva, al final, y el resto, centradas: con 21 barras la última
  columna no tiene marca.
- **El nombre de cada columna**: «{rótulo}[ solo {días}]: {duración}», con el
  rótulo de la fila de la tabla (RP-15).
- Con las entradas del recorrido 21 del contrato (domingo como primer día;
  20/09/2025 0:15 y 30/09 1:00 en P1, 01/10 0:30 en P2 y 10/10 0:20 en P1), del
  20/09/2025 al 10/10/2025 por «Persona»: «Horas por día» con 21 columnas, entre
  ellas «sáb, 20/09/2025: 0:15», «dom, 21/09/2025: 0:00» y «mar, 30/09/2025:
  1:00». Agrupando por «Semana», el gráfico no cambia. Con el filtro de P2, la
  del 01/10 dice 0:30 y la del 30/09, 0:00. Del 01/08/2025 al 10/10/2025, «Horas
  por semana» con 11 columnas: la primera es «27/07/2025 – 02/08/2025 solo
  01/08/2025 – 02/08/2025: 0:00», la de «28/09/2025 – 04/10/2025» dice 1:30 y
  la última es «05/10/2025 – 11/10/2025 solo 05/10/2025 – 10/10/2025: 0:20».
  Todo 2025: «Horas por mes» con 12 columnas, entre ellas «septiembre de 2025:
  1:15» y «enero de 2025: 0:00».

### 14.2 Teclado, puntero y tabla de datos

- **Una sola parada de tabulación**: al montar, la primera columna; después, la
  última que tuvo el foco. Derecha y abajo llevan a la siguiente; izquierda y
  arriba, a la anterior; Inicio y Fin, a la primera y la última. En los
  extremos el foco no se mueve. Con Alt, Ctrl, Meta o Mayúsculas, las flechas,
  Inicio y Fin no hacen nada en el gráfico. Las flechas no desplazan la página. Tab sale
  del gráfico a «Ver los datos del gráfico».
- **La columna con el foco de teclado** lleva un contorno de 2 px hacia adentro,
  que se ve también sobre una barra en cero. La barra enfocada se aparta 3 px
  de los bordes de la columna, así el contorno no la pisa aunque llegue al
  techo: a 320 px con 31 barras queda como un trazo fino dentro del contorno, y
  su valor lo dice la línea del valor (P6 de las revisiones de R5).
- **La columna activa** es la del puntero; sin puntero encima, la del foco; si
  no hay ninguna de las dos, no hay columna activa. La línea del valor dice su
  nombre. Al sacar el puntero del área de las columnas, la línea vuelve a la columna con el
  foco o se vacía; al salir el foco de las columnas, se vacía si el puntero no
  está encima.
- **«Ver los datos del gráfico»**: cerrado; al abrirlo, una tabla con «Fecha»,
  «Semana» o «Mes», y «Duración», con una fila por barra en orden, también las
  en cero, y «solo …» en gris. Se abre con teclado y antes de hidratar.
- **Lector de pantalla**: la figura se nombra por su leyenda y cada columna es
  una imagen con su nombre. La escala, las marcas y la línea del valor están
  ocultas, porque lo que dicen está en los nombres.
- **Antes de hidratar, o si no carga el JavaScript de la aplicación**: las
  barras se ven y la tabla de datos se abre; falta la línea del valor. Con
  JavaScript desactivado en el navegador, la pantalla entera queda en «Cargando
  el reporte», como desde R2a.
- **Colores forzados**: las barras en `CanvasText`; la activa y el contorno del
  foco, en `Highlight`.

### 14.3 Estados y casos borde

- **Vacío y segundo vacío** (RP-33): sin gráfico, con la fila de la tabla de
  siempre. Un período con solo un timer en curso tampoco tiene gráfico (P-07).
- **El primer nivel que no entra** (RP-18, RP-33): el gráfico, la fila del tope
  y los totales; las barras suman el total.
- **Una sola entrada de menos de un segundo**: el gráfico con todas las barras
  en «0:00» y la escala en «0:00» y «0:15».
- **Al recargar o con «Atrás»**: el mismo gráfico, que sale de la URL; la parada
  de tabulación vuelve a la primera columna y no hay columna activa. **Cada
  navegación que cambia la URL** hace lo mismo: las flechas, «Esta semana», un
  atajo, «Aplicar», «Agrupar por», los subniveles o un filtro.
- **Dos zonas o dos primeros días** dan barras distintas para el mismo período,
  como en la tabla (RP-22, RP-24).
- **Cambios de horario**: un día de 23 o 25 horas es una barra con sus horas.
- **El día que falta entero** (`Pacific/Apia`, el 2011-12-30): su barra está,
  en cero (RP-22).
- **A 320 y 375 px**, con 31 barras y una escala hasta «2000:00»: el gráfico no
  se sale de su caja ni ensancha la página más allá de la navegación del shell.
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3; el
  esqueleto no cambia.

### 14.4 Divergencias visibles que el reviewer no debe marcar como errores

- **La granularidad sale del largo del período** (D-R5-4): Clockify documenta
  barras por día y en el plan Free no pasa de 31 días; acá, de 32 a 182 días va
  por semana y de 183 a 366, por mes. Lo que hace Clockify con períodos largos
  está _no verificado_ y no se puede mirar en el workspace del equipo (P-05).
- **El gráfico no sigue a la agrupación**: agrupando por semana un período de
  21 días, la tabla va por semana y el gráfico, por día.
- **La primera y la última barra de un período por semana o por mes pueden ser
  más bajas**: si el período las corta, cuentan menos días. Lo dicen con «solo
  …» en el nombre y en la tabla de datos, no en la barra.
- **Las marcas no llevan año**: un período de 366 días por mes puede mostrar
  «mar» en los dos extremos. El año está en el nombre de cada columna, en la
  tabla de datos y en el período de la barra de herramientas.
- **La marca de una semana cortada es el primer día que cuenta**, no el primer
  día de la semana: la barra «28/09 – 04/10 solo 30/09 – 04/10» tiene la marca
  «30/09».
- **La barra del día que falta entero** en una zona existe, en cero, aunque la
  tabla por fecha no tenga esa fila (RP-22).
- **Un solo color**, sin partir por facturable ni por proyecto y sin menú para
  elegir la partición (RP-16).
- **Las barras en cero son columnas vacías** y cuentan para el teclado y para la
  tabla de datos.
- **La suma de lo que dicen las barras puede quedar unos minutos debajo de
  «Total»**: cada barra se trunca al minuto por separado, como las filas
  (RP-18).
- **La línea del valor también sigue al foco, y las flechas mueven el foco**:
  en Clockify está _no verificado_ (P-05). Es lo que deja leer el gráfico sin
  mouse.
- **El contorno del foco de las columnas no es el anillo de los botones del
  módulo**: una columna no tiene borde propio.
- **Un clic en una columna solo le da el foco**, sin contorno: queda como
  parada de tabulación y la línea del valor la sigue nombrando al sacar el
  puntero. No cambia el período ni filtra la tabla.
- **Con 31 barras a 320 px, cada una mide unos 6 px** (unos 8 a 375), y se
  ven cuatro marcas, una cada diez barras.

### 14.5 Qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                                        | Acciones                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `owner`, `admin` activas                            | Las barras de todas las personas del workspace con horas, también las inactivas, o solo de las elegidas, filtradas por cliente y proyecto | Las de 13.5 y 13.9, y recorrer las barras con el puntero y el teclado y abrir la tabla de datos |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio, filtrado, también con el enlace de un admin con `personas=…`: las barras suman lo mismo que sin `personas`                | Las mismas, sin filtro de personas                                                              |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                                         | Ninguna                                                                                         |

## 15. Núcleo, R6

_2026-10-12._ Contrato:
[`nucleo-reportes-r6-exportar-csv-y-excel.md`](../slices/nucleo-reportes-r6-exportar-csv-y-excel.md),
aprobado en la segunda pasada de `architecture-reviewer`
([correcciones](../slices/correcciones-nucleo-reportes-r6-contrato.md)). Tiene
dos partes (D-R6-1): **R6a**, la ruta, el documento del archivo, el CSV con el
resumen y las entradas, y el enlace en la pantalla; **R6b**, el Excel. Esta
sección cubre R6a. La regla de cada comportamiento está en la corrección
fechada de su RP; esta sección junta lo que cambia en la pantalla y lo que trae
el archivo, y lo que no nombra sigue como en las secciones
[9](#9-núcleo-r2a) a [14](#14-núcleo-r5).

**Cubre:** RP-54 (el CSV, con la cabecera, el resumen entero y las entradas una
por una, sus topes, el formato en español, la inyección de fórmulas y el nombre
del archivo), RP-53 (lo que el PDF de R7 reusa), RP-18 (los totales en la
cabecera y las cifras truncadas), RP-22 (la zona en la cabecera y las entradas
en la zona de quien exporta), RP-32 (la misma URL, el mismo archivo) y RP-33
(sin «Exportar» en los vacíos). Los permisos y el alcance no cambian: no hay
acción nueva; exporta quien tiene `report.view` y el archivo pasa por el mismo
service, el mismo alcance, las mismas personas elegidas y los mismos filtros
que la pantalla, en la misma foto. De la URL no llega ningún parámetro nuevo:
el formato es la carpeta de la ruta.

**Queda para después:** el Excel (R6b), con las mismas partes en dos hojas; el
PDF (R7), con la misma ruta y el mismo documento. No tienen slice: elegir
columnas, su orden o el separador; un CSV por parte o un ZIP; exportar solo lo
expandido; exportaciones programadas o por correo (RP-56); importar archivos;
un tope de pedidos por persona.

_Actualizado el 2026-10-12, R6b_: llega la segunda parte, el Excel, y esta
corrección describe el código de la rama `nucleo/r6b-excel`. Suma a lo que
cubre RP-54 con el Excel (dos hojas con celdas con tipo y ninguna fórmula) y
RP-18 (las mismas horas truncadas, como números). La ruta, el documento, el
alcance, los topes y las respuestas son los de R6a; cambia el formato. Lo que
esta corrección no nombra sigue como en R6a. Queda para después el PDF (R7).

### 15.1 La barra

- **El grupo «Exportar»** es el último de la barra, después de «Filtrar por»,
  con el mismo patrón que los otros: el rótulo «Exportar» y un grupo nombrado
  por él, con un enlace por formato. En R6a, «CSV», con el ícono de descarga y
  el estilo de los botones de contorno chicos.
- **Es un enlace común**: no se pide nada al abrir la pantalla ni al pasar el
  puntero, y funciona antes de hidratar. Al hacer clic, el navegador descarga
  `reporte_….csv` y la pantalla sigue en `/reportes`.
- **Solo aparece con horas**: en los dos vacíos no está (RP-33); con el primer
  nivel que no entra o con los niveles cortados por el tope, sí.
- **Lector de pantalla**: el grupo se anuncia «Exportar» y el enlace, «CSV»; el
  foco visible es el de los botones del módulo.

_Actualizado el 2026-10-12, R6b_: el grupo suma **«Excel», después de
«CSV»**, con el mismo ícono de descarga y el mismo estilo; el lector de
pantalla lo nombra «Excel». Es un enlace común, como «CSV»: no se pide nada al
abrir la pantalla, y el clic descarga `reporte_….xlsx` y deja la pantalla en
`/reportes`. Aparece y falta junto con «CSV» (RP-33); con la sesión vencida,
lleva al login.

### 15.2 El archivo

**La cabecera**, una fila por dato, con el nombre en la primera celda y el
valor en la segunda:

| Fila           | Valor                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título         | «Reporte resumido», solo, en una celda                                                                                                                     |
| «Período»      | las dos fechas con año en el formato de quien exporta, «28/09/2026 – 04/10/2026»; un solo día, una fecha                                                   |
| «Zona horaria» | la del perfil, tal cual (RP-22)                                                                                                                            |
| «Alcance»      | «Todas las personas del workspace» u «Solo las horas de {nombre de quien exporta}»                                                                         |
| «Agrupado por» | los niveles pedidos, «Persona / Proyecto / Fecha», también los que el tope cortó                                                                           |
| «Personas»     | solo si hay personas elegidas: sus nombres con « (inactiva)», en el orden de las opciones, en una celda unidos con «, »                                    |
| «Clientes»     | solo si hay clientes elegidos, igual                                                                                                                       |
| «Proyectos»    | solo si hay proyectos elegidos o «Sin proyecto», igual, cada proyecto con su cliente entre paréntesis y «Sin proyecto» al final                            |
| «Total»        | dos celdas: la duración y las horas (RP-18)                                                                                                                |
| «Facturable»   | ídem                                                                                                                                                       |
| «Generado»     | la fecha con año y la hora en los formatos de quien exporta, en su zona                                                                                    |
| «Nota»         | una fila por nota: la de etiquetas, si la etiqueta es uno de los niveles que se muestran, y después la del tope, si se cortaron niveles y el primero entró |

**El resumen** («Resumen»):

- Una fila de encabezados, «Nivel», una columna por cada nivel que se muestra
  (con los rótulos de «Agrupar por») y «Duración» y «Horas»; y una fila por
  grupo, primero el grupo y después sus hijos, en el orden de la pantalla, con
  el número de nivel, los rótulos de sus antepasados y el suyo, vacías las
  columnas de abajo, y su duración:

  | Nivel | Persona | Proyecto     | Duración | Horas |
  | ----- | ------- | ------------ | -------- | ----- |
  | 1     | Ana     |              | 10:00    | 10,00 |
  | 2     | Ana     | Web (ACME)   | 6:00     | 6,00  |
  | 2     | Ana     | Sin proyecto | 4:00     | 4,00  |

- **El rótulo de cada grupo es el texto de la pantalla**: la persona con
  « (inactiva)»; el proyecto con su cliente entre paréntesis; la tarea con su
  proyecto entre paréntesis; los «Sin …» (RP-28); la fecha, la semana y el mes
  con su rótulo y, si el período los corta, « solo …»; la descripción recortada
  con «…» o «Sin descripción».
- Sin grupos, una sola fila con el vacío que corresponde (RP-33); con el primer
  nivel que no entra, una sola fila con su nota. En los dos casos, sin
  encabezados.

**Las entradas** («Entradas»): una fila de encabezados, «Fecha de inicio»,
«Hora de inicio», «Fecha de fin», «Hora de fin», «Persona», «Cliente»,
«Proyecto», «Tarea», «Descripción», «Etiquetas», «Facturable», «Duración» y
«Horas», y una fila por entrada. La persona con « (inactiva)» si su membresía no
está activa; el cliente, el proyecto, la tarea, la descripción y las etiquetas,
vacíos si no hay; las etiquetas en orden de nombre, unidas con «, »;
«Facturable», «Sí» o «No». Con más de las que entran, una sola fila con la nota
del tope (RP-54).

Con las entradas del recorrido 23 del contrato (del 15/09/2025 al 21/09/2025,
por Proyecto → Fecha, de un member): «Alcance» «Solo las horas de {nombre}»;
en el resumen, «Web {sufijo} (ACME {sufijo})» 2:15 y 2,25, su 15/09 1:30 y
1,50, y «Sin proyecto» 0:30 y 0,50; en las entradas, la del 15/09 con
«2025-09-15», «09:00», «2025-09-15», «10:30», el cliente, el proyecto,
«Diseño», `Revisión "final"; v2`, la etiqueta, «No», «1:30» y «1,50»; las
descripciones «=1+1» y «-guion …» con el `'` adelante.

_Actualizado el 2026-10-12, R6b (D-R6-12)_: **el Excel trae las mismas filas
en dos hojas**:

| Hoja       | De arriba abajo                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| «Resumen»  | la cabecera entera, una fila vacía y la tabla del resumen o su aviso, con la primera fila en negrita             |
| «Entradas» | la misma cabecera, una fila vacía y la tabla de las entradas o el aviso del tope, con la primera fila en negrita |

- **La cabecera** es la del CSV, con las mismas filas. «Período», «Generado» y
  los nombres son texto; «Total» y «Facturable» llevan la duración y las horas
  como números (RP-54).
- **Las tablas** tienen las mismas columnas que en el CSV, con celdas con tipo:
  el nivel es un entero, las fechas son fechas `yyyy-mm-dd`, las horas de reloj
  van con `hh:mm`, «Duración» con `[h]:mm` y «Horas» con `0.00`, truncadas al
  centésimo como en el CSV. Ninguna celda es una fórmula y ningún texto lleva
  el `'`.
- **Las columnas tienen el ancho por omisión**, sin filtros ni filas fijas.
- Con las entradas del recorrido 25 del contrato (las del 23, por Proyecto →
  Fecha), salen las hojas «Resumen» y «Entradas». La duración de «Web {sufijo}
  (ACME {sufijo})» es el número 135 / 1440 con `[h]:mm` y sus horas son 2,25;
  la descripción «=1+1» es una cadena, sin fórmula y sin `'`.

_Actualizado el 2026-10-12, contrato de R9 (D-R9-10)_: con la opción efectiva de
«Mostrar personas sin horas» (RP-47), en el CSV y en el Excel:

| Fila                 | Valor                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| «Personas sin horas» | «Sí», solo con la opción efectiva, inmediatamente después de «Agrupado por» y antes de «Personas»; sin la opción, no está |

- **El resumen** trae una fila por persona sin horas, después de la última
  persona con horas y sus filas hijas, por nombre: nivel 1, su nombre con
  « (inactiva)» si corresponde, vacías las columnas de abajo, «0:00» y «0,00»,
  sin filas hijas.

  | Nivel | Persona | Proyecto   | Duración | Horas |
  | ----- | ------- | ---------- | -------- | ----- |
  | 1     | Ana     |            | 10:00    | 10,00 |
  | 2     | Ana     | Web (ACME) | 10:00    | 10,00 |
  | 1     | Beto    |            | 0:00     | 0,00  |
  | 1     | Carla   |            | 0:00     | 0,00  |

- **«Entradas» no cambia**: una persona sin horas no tiene entradas.
- **Con solo filas sin horas**, la ruta pedida a mano responde con la cabecera,
  esas filas en el resumen —con su fila de encabezados, porque hay grupos— y
  «Entradas» sin filas; desde la pantalla no hay «Exportar» (RP-33).

### 15.3 Estados y casos borde

- **Vacío y segundo vacío** (RP-33): sin «Exportar». La ruta pedida a mano
  responde 200 con la cabecera, el vacío en «Resumen» y los encabezados de
  «Entradas» sin filas.
- **El primer nivel que no entra**: «Exportar» está; el resumen es la nota y las
  entradas van si entran. La cabecera no repite la nota del tope.
- **Los niveles cortados por el tope**: el resumen trae los que entraron, con
  sus columnas, y la cabecera, la nota del tope.
- **Más de 10 000 entradas o un archivo de más de 4 MB con ellas**: la cabecera
  y el resumen completos, y la nota en «Entradas» (RP-54).
- **Al recargar o con «Atrás»**: el enlace es el mismo, porque sale de la URL
  (RP-32).
- **Una sesión vencida**: el clic en «CSV» lleva al login, como cualquier otra
  pantalla.
- **Una membresía que deja de estar activa**: la pantalla muestra el aviso de
  RP-07 y no hay barra; la ruta pedida a mano responde 403 con «No podés
  exportar reportes.», una página de texto.
- **Un error al leer o al escribir**: 500 con «No se pudo exportar el reporte.
  Volvé y probá de nuevo.», una página de texto; «Atrás» vuelve al reporte.
- **Cargando, error de lectura y sin `report.view`**: la pantalla, como en la
  sección 9.3.

_Actualizado el 2026-10-12, R6b_:

- **Vacío y segundo vacío**: la ruta del Excel pedida a mano responde 200 con
  las dos hojas. «Resumen» trae la cabecera y el vacío en negrita; «Entradas»,
  la cabecera y los encabezados en negrita, sin filas.
- **Las entradas que no entran**: la hoja «Entradas» trae la cabecera y el
  aviso del tope en negrita. Con el mismo pedido, el CSV y el Excel salen los
  dos con entradas o los dos sin ellas (B4).
- **La sesión vencida, el 403 y el 500**: como en el CSV.

### 15.4 Divergencias visibles que el reviewer no debe marcar como errores

- **RP-54 es diseño propio**: el CSV de Clockify es pago y no se puede relevar.
  Se compara contra el contrato de R6 y esta sección.
- **Un solo archivo por formato, con partes**: la cabecera, «Resumen» y
  «Entradas» en el mismo CSV, y no un CSV por tabla. Ninguno de los dos sería
  una tabla pura, por la cabecera, y dos descargas por formato duplicarían la
  ruta.
- **Las entradas, en el mismo archivo que el resumen**: en Clockify «Export of
  Summary report doesn’t contain timestamps.» y la exportación con todas las
  entradas sale del detallado; acá el resumido las trae, por decisión del
  usuario (mapa §5), porque el detallado no está en el núcleo.
- **Sin gráfico**: una parte por día repetiría lo que da agrupar por fecha, y
  las entradas ya traen el día de cada una (D-R6-2). El PDF de R7 decide por su
  cuenta.
- **Ninguna exportación queda en el `audit_log`**, por decisión del usuario
  (2026-10-12).
- **El resumen sale entero aunque en pantalla esté contraído**.
- **La suma de una columna puede quedar debajo del total, nunca arriba** (RP-18):
  cien entradas de 1 minuto suman «1,00» en «Horas» contra «1,66» de «Total».
- **Una descripción o un nombre que empieza con `=`, `+`, `-` o `@` lleva un
  `'` adelante** en el CSV: «- reunión» se lee «'- reunión». Es el precio de la
  protección contra fórmulas.
- **Las fechas de las entradas no siguen el formato de quien exporta**: van en
  `yyyy-MM-dd` y `HH:mm`, para que una planilla las ordene y las lea como fecha;
  la cabecera sí lo sigue.
- **Un rótulo de fecha sin año en el resumen** es del año en que se exporta,
  como en pantalla; «Período» y «Generado» dicen los años.
- **«Horas» lleva coma decimal**: un Excel configurado en inglés la lee como
  texto u otro número. El destinatario trabaja en español; el `.xlsx` de R6b
  guarda números.
- **Dos archivos del mismo período y la misma agrupación con filtros distintos
  se llaman igual**: el nombre no lleva los filtros, y el navegador agrega un
  número.
- **Un 403 o un 500 se ven como una página de texto**, sin la interfaz de la
  aplicación: el enlace no abre otra pestaña y «Atrás» vuelve al reporte.
- **El aviso de las entradas une las dos causas** —la cantidad y el peso— en
  una sola frase.

_Actualizado el 2026-10-12, R6b_:

- **El Excel es diseño propio**, como el CSV: el de Clockify es pago y no se
  puede relevar.
- **Dos hojas, cada una con la cabecera entera**: la cabecera se repite para
  que cada hoja se lea sola.
- **El texto va sin `'`**: «=1+1» y «- reunión» se ven tal cual, como texto.
- **El peso de las entradas se mide como CSV también para el Excel**: un Excel
  que comprimido habría pesado menos de 4 MB puede salir sin entradas, con el
  aviso «pesan más de 4 MB» (B4).
- **El aviso de una parte va en negrita**, como los encabezados, porque es la
  primera fila de la tabla.
- **Las columnas tienen el ancho por omisión**: una descripción larga se corta
  a la vista, aunque la celda la tenga entera.

### 15.5 Qué puede hacer cada rol

| Membresía                                           | El archivo trae                                                                                                                                                           | Acciones                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `owner`, `admin` activas                            | Las horas, los nombres y las descripciones de todas las personas del workspace con horas, también las inactivas, o solo de las elegidas, filtradas por cliente y proyecto | Las de 14.5, y exportar a CSV cuando hay horas |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio, filtrado, con «Alcance» «Solo las horas de {nombre}», también con un enlace con `personas=…`: las mismas entradas que sin `personas`                      | Las mismas, sin filtro de personas             |
| Cualquiera no activa (`inactive`, `invited`)        | Nada: la ruta responde 403                                                                                                                                                | Ninguna                                        |

_Actualizado el 2026-10-12, R6b_: quien exporta a CSV exporta también a Excel,
con el mismo alcance y lo mismo en el archivo; quien recibe 403 en uno lo
recibe en el otro.

## 16. Núcleo, R9

_2026-10-12._ Contrato:
[`nucleo-reportes-r9-personas-sin-horas.md`](../slices/nucleo-reportes-r9-personas-sin-horas.md),
aprobado en la primera pasada de `architecture-reviewer`
([correcciones](../slices/correcciones-nucleo-reportes-r9-contrato.md)). Es un
solo slice (D-R9-1). La regla de cada comportamiento está en la corrección
fechada de su RP; esta sección junta lo que cambia en la pantalla y en el
archivo, y lo que no nombra sigue como en las secciones [9](#9-núcleo-r2a) a
[15](#15-núcleo-r6).

**Cubre:** RP-47 (las personas sin horas en el resumido agrupado por persona,
solo para owner y admin), RP-12 (van después de todas las que tienen horas, por
nombre), RP-13 (sin botón, con cualquier cantidad de niveles), RP-32
(`sin-horas=1` y los enlaces que la conservan), RP-33 (las filas sin horas
reemplazan a los vacíos), RP-54 (la fila de la cabecera y las filas del
resumen), RP-62 (las inactivas, solo elegidas) y RP-64 (las invitadas, nunca).
Los permisos no cambian: no hay acción nueva. La opción aplica con el mismo
alcance que el filtro de personas, el de quien ve horas de otros, y las
candidatas salen del mismo catálogo que ese filtro, en la misma foto. No cambian
el gráfico, «Total», «Facturable», la línea del alcance ni las entradas del
archivo.

**Queda para después:** el PDF (R7), que hereda la fila de la cabecera y las
filas del resumen si lee el mismo documento. De la fase 2: la fecha de
activación de una invitada y la historia del estado de una membresía. De la
fase 3: el reporte semanal (RP-45, RP-46). No tienen slice: personas sin horas
debajo de otra dimensión (Proyecto → Persona); proyectos, clientes, tareas,
etiquetas o días sin horas; la fila propia en cero para quien ve solo lo suyo;
la opción para `team_manager` (P-03); una marca visual propia de la fila sin
horas; «Exportar» con solo filas sin horas.

### 16.1 La barra

- **El enlace**, después del grupo de «Agrupar por» y en el mismo bloque, solo
  para owner y admin y solo con «Persona» en «Agrupar por»: «Mostrar personas
  sin horas» con la opción apagada y «Ocultar personas sin horas» con la opción
  encendida, con el estilo de los botones de contorno chicos. Su nombre
  accesible es el texto, lleva a la misma URL con la opción cambiada y, como es
  un enlace común, funciona antes de hidratar.
- **No está** agrupando por cualquier otra dimensión, ni para un member, un
  `project_manager` o un `team_manager`.
- **Las flechas, el selector del período, «Esta semana», los subniveles, los
  filtros y «Exportar»** conservan la opción; «Agrupar por» la conserva o la
  apaga según el primer nivel que resulta (RP-32).

### 16.2 La tabla

- **Las filas sin horas** van en el primer nivel, después de todas las personas
  con horas, por nombre (RP-12): el nombre de siempre, con «(inactiva)» en gris
  si corresponde (RP-31), y «0:00».
- **Sin botón** (RP-13): con subniveles, una fila sin horas no se expande; si
  alguna otra fila tiene botón, deja el espacio del chevrón para que los
  nombres alineen.
- **El encabezado** nombra los niveles como siempre (sección 11.6); con solo
  filas sin horas, todos los pedidos, como en el vacío (sección 11.7).
- **«Total», «Facturable» y el gráfico no cambian**: una fila sin horas suma
  cero.
- Con las entradas del recorrido 26 del contrato (el martes de la semana
  anterior, A de 09:00 a 10:00 y B de 09:00 a 11:00 en P; C inactiva y E activa
  sin horas; N, que entró hoy), la semana anterior por «Persona» con A, B, C, E
  y N elegidas y la opción: B 2:00, A 1:00, C 0:00 con «(inactiva)» y E 0:00,
  en ese orden; N no está; total 3:00. Con «Segundo nivel: Proyecto», B y A
  tienen botón y C y E no.

### 16.3 Estados y casos borde

- **Un período sin horas, con la opción**: una fila en «0:00» por candidata,
  sin «No hay horas en este período», sin gráfico y sin «Exportar»; «Total» y
  «Facturable» en «0:00» (RP-33).
- **Filtros que no dejan nada, con la opción**: una fila en «0:00» por
  candidata, sin «Ninguna entrada coincide con los filtros» ni «Quitar
  filtros»; sin gráfico ni «Exportar».
- **Ninguna candidata y ninguna hora** —por ejemplo, una sola persona elegida
  que entró después del período—: el vacío que corresponde; «Quitar filtros»
  conserva la opción.
- **El tope de 3000 filas** (D-R9-8): las filas sin horas son del primer nivel
  y cuentan. El primer nivel entra si sus filas con horas más las sin horas son
  3000 o menos; si no, se ve la fila del primer nivel que no entra (sección
  13.7) y ninguna fila sin horas. Los niveles de abajo tienen lo que queda:
  **encender la opción puede cortar el segundo nivel**, con la línea del tope
  de siempre (sección 11.6). Persona → Descripción de un mes de todo el equipo
  puede pasar a mostrar solo las personas.
- **Con un filtro de cliente o de proyecto**, quien cargó solo en otros
  proyectos aparece sin horas: no cargó en lo filtrado, y la cabecera dice el
  filtro.
- **Una persona con solo un timer en curso** aparece sin horas (P-07). **Una
  con entradas que suman menos de un segundo** tiene horas: su fila es la de
  siempre, en «0:00», antes de las sin horas y, con subniveles, con botón.
- **Una opción que no aplica** —`agrupar=proyecto`, Proyecto → Persona, o quien
  no ve horas de otros—: la pantalla de sin la opción, y `sin-horas` se pierde
  en la navegación siguiente (RP-32). Sin un `agrupar` válido, aplica.
- **Al recargar, con «Atrás» o con un enlace copiado**: la misma vista, el
  enlace dice «Ocultar personas sin horas» y el árbol empieza contraído
  (RP-13). Encender o apagar la opción también lo contrae.
- **Cargando, error de lectura y sin `report.view`**: como en la sección 9.3.

### 16.4 Divergencias visibles que el reviewer no debe marcar como errores

- **En el resumido y no en el semanal** (RP-47): Clockify documenta la opción
  en el semanal, para una semana; acá va en el resumido agrupado por persona,
  con cualquier período.
- **Solo owner y admin**: Clockify la da también al team manager, que acá
  decide como member (P-03).
- **El control es un enlace que cambia de texto**, «Mostrar…» y «Ocultar…», y
  no una casilla ni un interruptor; cómo es en Clockify está _no verificado_
  (P-05). Después del clic el foco queda donde lo deje el navegador, como en
  «Agrupar por».
- **Las inactivas aparecen solo si se las elige** (RP-62); sin el filtro, no.
  En Clockify está _no verificado_.
- **Quien entró después del período no aparece**, según la fecha en que se creó
  su membresía, que hoy es su primer ingreso a Clock y no su alta en la
  empresa: alguien que entró a Clock tarde no aparece sin horas en los períodos
  anteriores a ese ingreso.
- **El estado es el de hoy**: quien estaba activo en el período y se desactivó
  después no aparece sin horas, salvo que se lo elija.
- **Una persona con entradas de menos de un segundo** se ve en «0:00» como una
  sin horas, pero va antes de ellas y, con subniveles, se puede abrir.
- **Con un filtro de cliente o de proyecto**, quien cargó solo en otros aparece
  sin horas.
- **Con solo filas sin horas no hay gráfico ni «Exportar»**: el archivo de
  «nadie cargó esta semana» no se baja desde la pantalla; la ruta pedida a mano
  responde con esas filas (RP-33, RP-54).
- **Encender la opción puede cortar el segundo nivel**, con la línea del tope de
  siempre, que no nombra la opción.
- **Sin filas sin horas debajo de otra dimensión**: con Proyecto → Persona la
  opción no aplica y el enlace no está.
- **Quien ve solo lo suyo no tiene su fila en «0:00»**: sin horas propias, el
  primer vacío, también con `sin-horas=1` en la URL.
- **La línea del alcance no cambia** con la opción.
- **Sin marca visual propia**: una fila sin horas se distingue por «0:00», su
  lugar al final y la falta de botón.
- **La cabecera del archivo dice «Personas sin horas» «Sí»** con la opción; sin
  ella no hay fila, tampoco una con «No».

### 16.5 Qué puede hacer cada rol

| Membresía                                           | Ve                                                                                                                                                                                                                                                   | Acciones                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `owner`, `admin` activas                            | Con «Persona» primero y la opción, además de las personas con horas, una fila en «0:00» por cada activa sin horas —o por cada elegida sin horas, también inactiva— que ya estaba en el workspace en el período; nunca invitadas ni de otro workspace | Las de 15.5, y mostrar u ocultar las personas sin horas; exportarlas en el resumen cuando hay horas |
| `project_manager`, `team_manager`, `member` activas | Solo lo propio, como sin la opción, también con `sin-horas=1` y `personas=…` en la URL; sin su fila en «0:00»                                                                                                                                        | Las mismas, sin filtro de personas ni el enlace                                                     |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                                                                                                                                                                                                    | Ninguna                                                                                             |

## 17. Núcleo, R7

_2026-10-12; R7b, 2026-10-13._ Contrato:
[`nucleo-reportes-r7-exportar-pdf.md`](../slices/nucleo-reportes-r7-exportar-pdf.md),
aprobado con menores en la verificación de la tercera pasada de
`architecture-reviewer`
([correcciones](../slices/correcciones-nucleo-reportes-r7-contrato.md)); la
ronda de R7b, del 2026-10-13, quedó «aprobado con retoques» en su segunda
pasada. Tiene tres partes (D-R7-1): **R7-0**, la medición, hecha; **R7a**, el
PDF de la cabecera y el resumen; **R7b**, el gráfico de R5 dentro del PDF, que
el usuario pidió el 2026-10-13 (D-R7-12). Esta sección cubre R7a y R7b; lo de
R7b va marcado «(R7b)». La regla de cada comportamiento está en la corrección
fechada de su RP; esta sección junta lo que cambia en la pantalla y lo que trae
el archivo, y lo que no nombra sigue como en las secciones
[9](#9-núcleo-r2a) a [16](#16-núcleo-r9).

**Cubre:** RP-53 (el PDF: la cabecera y el resumen sin las entradas, A4, los
encabezados en cada página, el número de página, el tope de 3000 filas, el
blanco y lo que la fuente no dibuja, el nombre del archivo), con la corrección
del texto de R6a que decía que traía las entradas. Los permisos y el alcance no
cambian: no hay acción nueva; exporta quien tiene `report.view`, y el PDF pasa
por el mismo service, el mismo alcance, las mismas personas elegidas, los mismos
filtros y la misma opción de personas sin horas que la pantalla, en la misma
foto. De la URL no llega ningún parámetro nuevo: el formato es la carpeta de la
ruta.

**R7b suma** RP-53 con el gráfico: el de R5 (sección 14), entre la cabecera y
el resumen. La barra, la ruta, la lectura y los permisos no cambian, porque
toda exportación ya leía el gráfico en la misma foto; el CSV y el Excel no lo
escriben.

**Queda para después**, sin slice: elegir qué muestra el PDF (también sacar el
gráfico), la orientación, el tamaño de página o la fuente; el valor de cada
barra y la tabla de datos del gráfico en el PDF; imágenes, logos o enlaces; un
PDF etiquetado (PDF/UA); el detallado y su PDF; exportaciones programadas o por
correo (RP-56).

### 17.1 La barra

- **El grupo «Exportar»** suma **«PDF», después de «Excel»**, con el mismo
  ícono de descarga y el mismo estilo; el lector de pantalla lo nombra «PDF».
- **Es un enlace común**, como «CSV» y «Excel»: no se pide nada al abrir la
  pantalla ni al pasar el puntero, y funciona antes de hidratar. Al hacer clic,
  el navegador descarga `reporte_….pdf` y la pantalla sigue en `/reportes`.
- **Aparece y falta junto con «CSV» y «Excel»** (RP-33): no está en los dos
  vacíos ni con solo filas sin horas; con el primer nivel que no entra o con
  los niveles cortados por el tope, sí. Con la opción de personas sin horas, su
  enlace la conserva (`sin-horas=1`), como los otros dos.

### 17.2 El archivo

**La primera página empieza con el título** «Reporte resumido», más grande que
el cuerpo, y **la cabecera** como una lista de nombre y valor, sin bordes, con
las filas de la sección 15.2 en el mismo orden: «Período», «Zona horaria»,
«Alcance», «Agrupado por», «Personas sin horas» con «Sí» si la opción es
efectiva (sección 16), «Personas», «Clientes» y «Proyectos» si hay filtros,
«Total» y «Facturable» con la duración y las horas, «Generado» y las notas. La
cabecera va una sola vez, en la primera página.

**(R7b) El gráfico**, debajo de la cabecera y antes de «Resumen», es el de la
pantalla para la misma URL (sección 14.1):

- **La leyenda**: «Horas por día», «Horas por semana» u «Horas por mes», en el
  tamaño de «Resumen» y en negro.
- **La escala**: los rótulos de la sección 14.1 («0:00», «0:30»…, de dos a
  cinco), en gris, a la izquierda, alineados a la derecha y cada uno a la
  altura de su línea. Las líneas son finas, en el gris de los encabezados, y
  van de lado a lado del área.
- **Las barras**: una por tramo y en orden, en un gris medio, por encima de las
  líneas; se reparten el ancho del área con un espacio mínimo entre ellas. Una
  barra con horas tiene al menos un trazo fino, aunque su alto redondee a cero;
  una en cero no se dibuja, pero su lugar está. La barra sola (un período de un
  día) va angosta y centrada.
- **Las marcas**: las de la pantalla ancha, hasta siete, una cada `ceil(n / 7)`
  barras desde la primera; con 31 barras, las siete. La primera va al inicio de
  su columna, la de la última columna (si la lleva) al final y las demás
  centradas. Cada una va en un renglón, aunque sea más ancha que su columna.
- **Sin valor por barra, sin línea del valor y sin tabla de datos.**
- **El bloque no se parte**: si no entra en lo que queda de la primera página
  (con una cabecera de muchas notas), pasa entero a la siguiente y deja libre
  el pie de la primera. Va una sola vez y la tabla empieza debajo: la página
  donde está tiene menos filas que sin gráfico, y el total de filas no cambia.

**El resumen**, con el título «Resumen» y la tabla del CSV: «Nivel», una
columna por cada nivel que se muestra, «Duración» y «Horas»; una fila por grupo,
en el orden de la pantalla, con el árbol entero.

- «Nivel», «Duración» y «Horas» van alineadas a la derecha; los rótulos, a la
  izquierda.
- **Los rótulos de los antepasados van en gris** y el propio de cada fila, en
  el color del texto; **las filas de nivel 1 van sobre un fondo gris claro**. El
  texto es el del CSV; cambia solo el color.
- **La fila de encabezados va sobre fondo**, sin negrita (la fuente tiene una
  sola cara), y **se repite arriba de cada página**.
- **Un rótulo largo se parte en renglones dentro de su columna**, también una
  palabra sin espacios, y la fila crece. **Una fila no se parte entre dos
  páginas**: si no entra en lo que queda, pasa entera a la siguiente, debajo de
  los encabezados.
- Sin grupos, el vacío que corresponde; con el primer nivel que no entra, su
  nota. En los dos casos, como un párrafo debajo de «Resumen», sin tabla ni
  encabezados.

**Abajo a la derecha de cada página**, «Página {n} de {total}»; el pie no
agrega páginas. Ninguna página queda sin filas, salvo la primera cuando el
gráfico no entra en ella (R7b): en ese caso lleva solo el título y la cabecera.

**La página** es A4 vertical, con márgenes de 36 pt, el cuerpo en 9 pt y el
título en 14 pt. **La fuente es Noto Sans**, incrustada en el archivo. **Los
metadatos** llevan el título «Reporte resumido» y el idioma español, sin autor
ni asunto: el nombre de quien exporta está en la cabecera.

**El texto de cada celda** es el del CSV, sin el `'`:

- una duración, «1:30», sin tope de 24 h («2000:00»); las horas, «1,50», con
  coma y truncadas al centésimo (RP-18);
- una descripción «=1+1» o «- reunión», tal cual;
- una corrida seguida de tabulaciones, saltos de línea y retornos de carro, un
  solo espacio: `a\r\n\tb` se lee «a b»;
- un emoji simple, un solo «�» (U+FFFD), y uno compuesto, un «�» por cada punto de código que la fuente no dibuja («❤️» y «🇦🇷» dejan dos cada uno); «→» y el griego que la fuente no tiene, «�»;
- los demás caracteres de control, U+FFFE, U+FFFF y las mitades sueltas de un
  par sustituto, «�» siempre;
- «Łukasz», «Żółć» y «Дмитрий», tal cual.

Con las entradas del recorrido 28 del contrato (del 15/09/2025 al 21/09/2025,
por Proyecto → Fecha, de un member): una página, con «Reporte resumido»,
«Período» «15/09/2025 – 21/09/2025», «Alcance» «Solo las horas de {nombre}» y
«Página 1 de 1»; en el resumen, «Web {sufijo} (ACME {sufijo})» 2:15 y 2,25, y
«Sin proyecto» 0:30 y 0,50; ni `Revisión "final"; v2`, ni «=1+1», ni
«Entradas». Con la opción de R9, un admin que agrupa por persona ve «Personas
sin horas» «Sí» después de «Agrupado por» y la fila `1 {nombre} 0:00 0,00`.

(R7b) Con las mismas entradas (1:30 el 15/09, 0:30 el 16/09 y 0:45 el 17/09),
el texto que va de «Horas por día» a «Resumen» es «Horas por día 0:00 0:30 1:00
1:30 15/09 16/09 17/09 18/09 19/09 20/09 21/09». Son siete barras, cuatro en
cero, la más alta llega a la línea de 1:30 y cada barra tiene su marca. Sigue
siendo una página y el resumen trae las mismas filas.

Cómo se ve en un visor y al imprimir —el texto seleccionable y buscable con los
acentos, «…», «–» y «(inactiva)», las columnas alineadas, la página que entra
en A4— es el criterio 13 del contrato, a mano, y queda _no verificado_ hasta
que se haga.

(R7b) Cómo se ven las barras es el criterio 13 bis, a mano: la más alta
respecto de su línea; la de pocos minutos, como una línea fina; las que están
en cero, sin barra; las siete marcas enteras y sin pisarse; la barra sola,
angosta y centrada; la tabla debajo del gráfico; y, impresas en gris, las
barras distintas de las líneas. Se mira con el PDF de un mes, el de un
trimestre, el de 366 días con el aviso y el de un día. Queda _no verificado_
hasta que se haga.

### 17.3 Estados y casos borde

- **Vacío y segundo vacío** (RP-33): sin «Exportar». La ruta pedida a mano
  responde 200 con un PDF de una página: la cabecera y, debajo de «Resumen», el
  vacío como párrafo.
- **Con solo filas sin horas** (sección 16): sin «Exportar»; la ruta pedida a
  mano responde con esas filas en la tabla, con su fila de encabezados.
- **El primer nivel que no entra**: «Exportar» está; debajo de «Resumen», la
  nota del primer nivel como párrafo, y la cabecera no la repite.
- **Los niveles cortados por el tope**: la tabla trae las columnas de los que
  entraron, y la cabecera, la nota del tope.
- **Muchas filas**: hasta 3000, en tantas páginas como hagan falta, cada una
  con sus encabezados y su número; la medición del contrato dio 88 páginas con
  3000 filas y 273 con rótulos de 100 caracteres.
- **Un PDF de más de 4 MB**: 500 con el mensaje de siempre. Con el tope de 3000
  filas no se espera: el peor caso medido pesa 627 KB.
- **Una lectura que pasa el tope de duración** de las exportaciones: 500, como
  en el CSV y el Excel.
- **Al recargar o con «Atrás»**: el enlace es el mismo, porque sale de la URL
  (RP-32). Bajar el PDF no cambia la pantalla.
- **Una sesión vencida**: el clic en «PDF» lleva al login.
- **Una membresía que deja de estar activa**: la pantalla muestra el aviso de
  RP-07 y no hay barra; la ruta pedida a mano responde 403 con «No podés
  exportar reportes.», una página de texto.
- **Un error al leer o al escribir**: 500 con «No se pudo exportar el reporte.
  Volvé y probá de nuevo.», una página de texto; «Atrás» vuelve al reporte.
- **Dos descargas del mismo reporte** traen el mismo texto, pero no son iguales
  byte a byte: la fecha de creación va en los metadatos.
- **(R7b) El gráfico en cada estado**, el mismo que en la pantalla. No está en
  los dos vacíos ni con solo filas sin horas (rutas pedidas a mano). Con el
  primer nivel que no entra, va el gráfico y debajo, bajo «Resumen», la nota.
  Con los niveles cortados por el tope, va el gráfico entero, porque no depende
  del árbol.
- **(R7b) Todo en cero** (una sola entrada de menos de un segundo): la escala
  «0:00» y «0:15», las marcas, sin barras.
- **(R7b) El largo del período**: hasta 31 días, una barra por día (31 barras
  angostas y siete marcas); de 32 a 182, por semana; de 183 a 366, por mes, con
  el nombre abreviado («oct») como marca.
- **(R7b) Un solo día**: una barra angosta y centrada, con su marca centrada.
- **(R7b) Una cabecera larga**: el gráfico pasa entero a la página 2 y la 1
  lleva solo el título y la cabecera.
- **(R7b) El peso**: el gráfico suma como mucho 31 rectángulos, 5 líneas y 13
  textos. El peso del PDF con gráfico lo anota el paso 14 del contrato y queda
  _no verificado_ hasta entonces.
- **(R7b) Al recargar o con «Atrás»**: el mismo gráfico, porque sale de la URL.

### 17.4 Divergencias visibles que el reviewer no debe marcar como errores

- **(R7b) El gráfico, sin opción de sacarlo**: Clockify lo trae y deja sacarlo
  («you can disable certain information (user, charts, etc.) from appearing on
  PDF»). Acá el PDF lo trae siempre que la pantalla lo muestra, sin parámetros
  de exportación (D-R6-4).
- **(R7b) Sin el valor de cada barra ni la tabla «Ver los datos del
  gráfico»**: en la pantalla se ven con el puntero, con el foco o al abrir la
  tabla, y en el papel no hay ninguna de las tres cosas. Las horas por grupo
  están en el resumen, y las de cada día se ven agrupando por fecha.
- **(R7b) El diseño del gráfico es propio**: el contrato fija el alto del área,
  los grises, el grosor de las líneas, el trazo mínimo de una barra con horas y
  la barra sola angosta (§4.6). Cómo es el gráfico del PDF de Clockify sigue
  _no verificado_ (P-05).
- **(R7b) Siempre las marcas de la pantalla ancha**: hasta siete, porque el
  ancho del A4 alcanza; la pantalla angosta muestra una de cada dos.
- **(R7b) Sin «solo …»**: la primera y la última barra de un período por semana
  o por mes pueden ser más bajas si el período las corta. La pantalla lo dice
  en el nombre de la columna y en la tabla de datos; el PDF no tiene ninguno de
  los dos.
- **(R7b) La nota del tope va arriba del gráfico**: en la pantalla, la línea
  del tope está debajo del gráfico; en el PDF es una fila de la cabecera, que
  va antes.
- **(R7b) Las barras no se leen con un lector de pantalla**: el PDF no es
  etiquetado, así que se leen la leyenda, los rótulos de la escala y las
  marcas, en ese orden, y no el alto de cada barra. En la pantalla, cada columna
  tiene su nombre.
- **(R7b) El gráfico solo en el PDF**: el CSV y el Excel no lo traen (D-R6-2).
- **Sin opciones de qué mostrar**: «Customize export» deja sacar datos, cambiar
  el nombre del reporte y poner un logo; acá el PDF trae siempre lo mismo para
  la misma URL, sin parámetros de exportación (D-R6-4). En qué plan está esa
  función sigue _no verificado_ (P-05).
- **El diseño de la página es propio**: A4 vertical, la fuente, los márgenes,
  los grises, la cabecera como lista y el pie con «Página n de N». Cómo es el
  PDF de Clockify sigue _no verificado_ (P-05).
- **Sin las entradas, a diferencia del CSV y el Excel**: es lo de Clockify
  («Export of Summary report doesn’t contain timestamps.»), y las entradas una
  por una son para una planilla. El PDF no avisa que no las trae.
- **Lo que la fuente no dibuja sale «�»**: un emoji (uno compuesto deja varios «�»), «→» o el griego que falta;
  el CSV y el Excel los conservan.
- **El blanco se junta**: un nombre o una descripción con saltos de línea o
  tabulaciones se lee en un renglón, como en la pantalla; el CSV y el Excel los
  conservan.
- **El texto va sin `'`**: «=1+1» y «- reunión» se leen tal cual.
- **Los encabezados van sobre fondo y no en negrita**: la fuente tiene una sola
  cara.
- **Los antepasados en gris y el nivel 1 sobre fondo**: cada fila repite los
  rótulos de arriba, como en el CSV, y en el papel se apagan para que se lea el
  propio.
- **Una fila que no entra pasa entera a la página siguiente** y deja espacio
  libre al pie de la anterior.
- **El tope de 3000 filas es el del resumen**, el de la pantalla: cada nivel
  entra entero o no entra, así que un PDF puede tener bastante menos de 3000
  filas y la nota del tope.
- **El archivo se descarga y no se abre en la pestaña** (`attachment`), como
  los otros dos formatos.
- **Sin estructura para lectores de pantalla** (no es un PDF etiquetado): se lee
  el texto en orden. El CSV y el Excel son la forma accesible de los mismos
  datos.
- **Dos descargas del mismo reporte no son iguales byte a byte**: la fecha de
  creación va en los metadatos.

### 17.5 Qué puede hacer cada rol

Quien exporta a CSV y a Excel exporta también a PDF, con el mismo alcance
(sección 15.5) y la misma cabecera y el mismo resumen; quien recibe 403 en un
formato lo recibe en los tres. Un member, un `project_manager` o un
`team_manager` con `personas=…` o `sin-horas=1` en la URL baja el mismo PDF que
sin esos parámetros: «Alcance» «Solo las horas de {nombre}», sin la fila
«Personas sin horas» y sin ningún nombre ajeno.

(R7b) El gráfico del PDF es el que ve en la pantalla quien exporta (sección
14.5): un member, un `project_manager` o un `team_manager` ve barras solo con
lo propio, también con `personas=…` en la URL; owner y admin, las de todo el
workspace o las de las personas elegidas.

## 18. Núcleo, R8

_2026-10-13._ Contrato:
[`nucleo-reportes-r8-cambiar-rol.md`](../slices/nucleo-reportes-r8-cambiar-rol.md),
aprobado en la segunda ronda de `architecture-reviewer` y corregido el mismo día
por decisión del usuario (D-R8-5, D-R8-13), con la revisión de la corrección
aprobada con retoques. Es un solo slice, con la pantalla `/equipo`, que no toca
la pantalla ni el módulo del reporte. La regla de cada comportamiento está en
la corrección fechada de su RP; esta sección junta la pantalla. Describe lo que
hace el código de la rama `nucleo/r8-cambiar-rol`, leído y no recorrido con la
aplicación.

**Cubre:** RP-02 (desde R8, owner y admin ven el reporte de equipo), RP-67 (dar
el rol de admin), RP-68 (quitarlo, solo el owner), RP-69 (el owner que no
cambia), RP-70 (la pantalla solo para owner y admin), RP-07 (el aviso común
para una membresía que no está activa) y RP-31 (el email, porque dos personas
pueden llamarse igual). **Una acción de permiso nueva**, `team.admin.revoke`,
solo del owner
([ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md),
aceptado); lo demás pasa por `team.manage`, que ya era de owner y admin. Cada
cambio efectivo deja una fila de auditoría, que no se ve en pantalla.

**Queda para la fase 2:** invitar, desactivar, reactivar y quitar personas
(RP-60, RP-63); transferir el workspace (RP-69); la lista para un member
(RP-70); las personas inactivas e invitadas en la lista; el primer día de la
semana (PF-01, PF-17), la capacidad y los días laborables. No tienen slice: dar
o quitar `project_manager` y `team_manager`; búsqueda, orden por columnas y
paginación; cerrar las sesiones de quien pierde el rol; ver la auditoría en
pantalla.

### 18.1 La navegación y la pantalla

- **«Equipo»** va en la navegación después de «Proyectos», solo para owner y
  admin activos, con `aria-current="page"` en `/equipo` como las demás.
- **De arriba abajo**, para owner y admin activos:

| Parte  | Contenido                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título | «Equipo»                                                                                                                                                                                                            |
| Texto  | «Un administrador ve las horas de todas las personas en los reportes y puede hacer administradoras a otras personas. Solo el propietario quita el rol de administrador, y el suyo no se cambia.»                    |
| Aviso  | El del último cambio, si hubo (sección 18.2)                                                                                                                                                                        |
| Tabla  | Nombrada por el título, con «Persona», «Rol» y «Cambiar rol». Persona: el nombre (el editado o el de Google), «(vos)» en gris en la propia y el email en gris debajo. Rol: el rótulo. Cambiar rol: el botón, si hay |

- **Se listan las membresías activas** del workspace, una fila por persona, por
  nombre, con el mismo orden que las demás listas de personas; con el mismo
  nombre, por el id de la membresía. Las inactivas y las invitadas no están.
- **Los rótulos del rol**: «Propietario», «Administrador», «Responsable de
  proyectos», «Responsable de equipo» y «Miembro». Los dos del medio aparecen
  solo si alguien los puso por SQL; «Responsable de proyectos» no es la marca de
  responsable de un proyecto (PR-19).
- **El botón**: «Hacer administrador» en la fila de un `member`, para owner y
  admin; «Quitar administrador» en la de un `admin`, **solo para el owner**. Sin
  botón: la fila del owner, las de `project_manager` y `team_manager` y, para un
  admin, todas las de rol `admin`, también la suya. El lector de pantalla lo
  nombra «{acción}: {nombre}», porque la acción se repite en cada fila.

### 18.2 Cambiar el rol

- **El clic escribe**, sin casilla, paso de guardar ni confirmación. Mientras el
  pedido viaja, todos los botones quedan con `aria-disabled="true"` (no
  `disabled`, para que el foco no se pierda) y otro clic no manda nada. No hay
  vista optimista: la fila dice el rol que había hasta que llega la respuesta.
- **Al volver**, encima de la tabla, «Rol de {nombre}: {rol}.» como aviso de
  estado, y la fila muestra el rol nuevo. **El foco**: si la fila sigue con
  botón —el owner asciende o baja a alguien—, el botón lo conserva y cambia de
  texto; si se queda sin botón —un admin asciende a alguien—, pasa al
  encabezado de esa fila. Pedir el rol que ya tiene, por ejemplo desde otra
  pestaña que no vio un cambio, responde igual, sin escribir ni auditar.
- **Un error** muestra, encima de la tabla, «No se pudo cambiar el rol de
  {nombre}.» con el mensaje de abajo como cuerpo, y «Reintentar» solo con el
  error inesperado. La lista se vuelve a leer también en el error, así que una
  fila que ya no vale se va y el aviso queda arriba:

| Situación                                                              | Cuerpo del aviso                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Quien actúa ya no tiene `team.manage`                                  | «No tenés permiso para cambiar roles.»                                 |
| La persona ya no existe, o es de otro workspace                        | «Esa persona ya no está en el equipo.»                                 |
| La persona quedó inactiva o es invitada                                | «Esa persona ya no está activa en el workspace.»                       |
| Error inesperado, con «Reintentar»                                     | «Revisá la conexión y volvé a intentar.»                               |
| Un admin que pide quitar el rol a un admin (solo con un pedido a mano) | «Solo el propietario quita el rol de administrador.»                   |
| Un admin sobre la fila del owner (ídem)                                | «No tenés permiso para cambiar roles.»                                 |
| El owner sobre la suya (ídem)                                          | «El rol del propietario no se cambia.»                                 |
| Un `project_manager` o `team_manager` (ídem)                           | «Este rol no se cambia desde acá.»                                     |
| Un rol que no es member ni admin, o un id inválido (ídem)              | «Ese rol no está disponible.» o «Esa persona ya no está en el equipo.» |

### 18.3 Estados y casos borde

| Estado                                               | Qué se ve                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `member`, `project_manager` o `team_manager` activos | Sin «Equipo»; en `/equipo`, el título y «No tenés permiso para administrar el equipo.», sin tabla; no se lee ninguna membresía |
| Membresía `inactive` o `invited`                     | El título, «Tu acceso al workspace está desactivado.» y «No podés administrar el equipo.» (RP-07)                              |
| Lista                                                | Nunca vacía: tiene, al menos, la fila de quien mira                                                                            |
| Cargando                                             | Sin esqueleto propio: la navegación espera la lista                                                                            |
| Error de lectura                                     | El título y «No se pudo cargar el equipo.» con «Reintentar»                                                                    |
| Al recargar                                          | La lista leída de nuevo; el aviso del último cambio no queda. Nada va en la URL                                                |
| Sin sesión                                           | El login                                                                                                                       |

- **Para la persona cuyo rol cambió**, todo pedido siguiente decide con el rol
  nuevo: recargar, navegar —también dentro del reporte—, una server action o una
  descarga. Una ascendida ve el reporte de equipo en su pedido siguiente; a una
  que el owner bajó no se le lee una hora ajena más, y un enlace con `personas`
  o con las personas sin horas le muestra lo propio (RP-32). **Lo ya dibujado
  queda** hasta ese pedido, también lo que muestra «Atrás». No se cierra su
  sesión.
- **«Equipo» en su navegación** cambia en la carga completa siguiente o después
  de una action suya: navegar no vuelve a pedir el layout. Una persona bajada
  que todavía la ve y la usa llega a la vista sin permiso.
- **Un admin al que el owner bajó** mientras tenía `/equipo` abierto, si hace
  clic en «Hacer administrador», recibe «No tenés permiso para cambiar roles.»:
  su autoridad se vuelve a leer en el cambio.
- **Dos cambios a la vez de la misma persona**: gana el último. Dos admins que
  ascienden a la misma persona a la vez: los dos responden con éxito y queda una
  sola fila de auditoría.
- **Cambiar el rol de alguien no espera** a que termine una carga de horas suya
  en curso, ni al revés.
- **Sin piso de admins**: el piso es el owner. Con el owner inactivo por SQL,
  nadie puede quitarle el rol a un admin; la salida es SQL.
- **Un admin desactivado por SQL** conserva el rol `admin`, sin efecto mientras
  esté inactivo; al reactivarlo, en la fase 2, vuelve admin.
- **Muchas personas**: la lista no tiene tope, búsqueda ni paginación.

### 18.4 Divergencias visibles que el reviewer no debe marcar como errores

- **Un member no ve `/equipo`** ni la entrada (RP-70); en Clockify la ve salvo
  que se la escondan (RP-08).
- **Un rol por persona y un botón por fila**, en lugar de «+Role» y la casilla
  «Admin» (RP-67); el clic escribe, sin guardar.
- **Las filas del owner, de `project_manager` y de `team_manager` no tienen
  botón** (RP-69; D-R8-4), y para un admin tampoco las de rol `admin` (RP-68).
- **Las inactivas y las invitadas no están en la lista**; la pantalla de equipo
  de Clockify tacha a las inactivas («All inactive user names are struck out.»,
  RP-62).
- **Sin mínimo de admins**: el piso es el owner.
- **La navegación de la persona cambiada** se actualiza en su carga completa
  siguiente o después de una action suya, y lo ya dibujado queda hasta su pedido
  siguiente.
- **El aviso de éxito sale también sin cambio**, si la persona ya tenía ese rol.
- **Después de que un admin asciende a alguien, el foco va al encabezado de la
  fila**, que se quedó sin botón.
- **Dos personas con el mismo nombre dan dos botones con el mismo nombre para
  el lector de pantalla**; el email las distingue en la fila (RP-31). Es deuda
  anotada en el contrato.
- **Un solo cambio a la vez** en toda la tabla.
- **Sin búsqueda, orden por columnas ni paginación.**
- **La auditoría no se ve en pantalla.**

### 18.5 Qué puede hacer cada rol

| Membresía                                           | Ve                                                                         | Acciones                                                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `owner` activa                                      | «Equipo» y la lista                                                        | Hacer administrador a un member; quitar el rol a un admin. Su propia fila, sin botón                                                                                                                         |
| `admin` activa                                      | «Equipo» y la lista                                                        | Hacer administrador a un member. Las filas de admin, también la suya, y la del owner, sin botón; un pedido armado a mano para quitar el rol a un admin: «Solo el propietario quita el rol de administrador.» |
| `project_manager`, `team_manager`, `member` activas | Sin «Equipo»; en `/equipo`, «No tenés permiso para administrar el equipo.» | Ninguna; un pedido armado a mano: «No tenés permiso para cambiar roles.», sin cambios                                                                                                                        |
| Cualquiera no activa (`inactive`, `invited`)        | El aviso de RP-07                                                          | Ninguna                                                                                                                                                                                                      |

En los reportes, una membresía `admin` activa ve lo mismo que el owner (RP-02,
sección 9.2).
