# Paridad: planilla de horarios

Alcance de este documento: la planilla de horarios —el «Timesheet» de Clockify—,
una grilla de una semana con una fila por proyecto y tarea y una columna por
día, donde cada celda escribe una duración. Cubre el armado de filas, la edición
de celdas, los totales, la navegación entre semanas, la relación con el timer
activo, el borrado de filas y las plantillas. «Copiar la semana pasada» queda
registrado y fuera de alcance de la fase 1 (sección 10). No cubre el rastreador
—está en [`time-tracker.md`](time-tracker.md)—, ni las entidades de proyecto
—están en [`proyectos.md`](proyectos.md)—, ni los ajustes de la persona —están
en [`perfil.md`](perfil.md)—, ni aprobaciones, reportes o exportes.

Es la precondición del slice 13 del
[mapa de la fase 1](../slices/fase1-mapa.md). Depende del núcleo de proyectos
(slices 9 y 10) para las filas y del perfil (slice 7) para la semana.

Cada comportamiento lleva un identificador `TS-nn` para que lo citen el reviewer
de paridad y los flujos de Playwright, y una marca `replicar`, `adaptar` o
`fuera de alcance`. Las dos últimas llevan una línea de justificación. Las
referencias `TT-nn`, `PR-nn`, `PF-nn` y `CAL-nn` apuntan a los otros documentos
de paridad y no se reespecifican acá.

## Fuentes y límites del relevamiento

Documentación pública del centro de ayuda de Clockify y su página de precios:

- https://clockify.me/help/track-time-and-expenses/timesheet-view
- https://clockify.me/help/track-time-and-expenses/creating-a-time-entry
- https://clockify.me/help/track-time-and-expenses/editing-time-entries
- https://clockify.me/help/track-time-and-expenses/duration-format
- https://clockify.me/help/track-time-and-expenses/required-fields
- https://clockify.me/help/track-time-and-expenses/lock-timesheets
- https://clockify.me/help/track-time-and-expenses/force-timer
- https://clockify.me/help/track-time-and-expenses/add-time-for-others
- https://clockify.me/help/troubleshooting/optimize-tracking/cant-copy-last-week
- https://clockify.me/help/troubleshooting/optimize-tracking/cant-see-a-project
- https://clockify.me/help/troubleshooting/optimize-tracking/description-field-missing
- https://clockify.me/help/troubleshooting/optimize-tracking/cant-add-time
- https://clockify.me/help/troubleshooting/optimize-tracking/timesheet-discrepancy
- https://clockify.me/help/troubleshooting/approvals-troubleshooting/timesheet-discrepancy-2
- https://clockify.me/help/users/profile-settings
- https://clockify.me/help/apps/android-app y https://clockify.me/help/apps/iphone-app
  (solo para corroborar plantillas y «copiar semana anterior»; describen la
  aplicación móvil, no la web)
- https://clockify.me/pricing

**El workspace del equipo lo relevó la persona usuaria el 2026-10-07**, en dos
tandas, respondiendo la lista de
[timesheet P-12](#p-12-la-lista-de-verificación) en el workspace de la empresa,
que está en castellano. Las respuestas crudas se conservan al final del
documento. Lo que sale de ahí va como «Verificado en el workspace
(2026-10-07)», con el número o la letra de la respuesta; lo que esas respuestas
no cubren sigue _no verificado_.

**El hueco que dejaba la documentación quedó cubierto.** La documentación dice
que se ingresa «the amount of time you worked in the cell corresponding to that
day» y nada más: no dice qué hace una celda que ya tiene entradas ni a qué hora
empieza la que crea una vacía. Las respuestas de P-12 lo muestran, y la
[sección 5](#5-qué-escribe-una-celda) está escrita sobre ellas.

_Corregido el 2026-10-07, P-12_: decía que no se había podido entrar al
workspace del equipo y que la sección 5 era una propuesta sin relevamiento.

### Tres clases de comportamiento que no son paridad

Igual que en [`proyectos.md`](proyectos.md), este documento mezcla cosas que
conviene no confundir al leerlo. Lo que es paridad es una sola:

1. **Relevamiento.** Lo que dice la documentación pública, con la cita o con
   «documentado», o lo que se vio en el workspace del equipo, con «verificado
   en el workspace (2026-10-07)».

Y tres que no lo son:

2. **Decisión del equipo.** Lo que el equipo ya resolvió, en otro documento o
   en este: va con el identificador que la cerró (P-06, P-10, P-16, PF-01,
   timesheet P-01…). El reviewer la compara contra lo que dice acá, no contra
   Clockify.
3. **Diseño propio.** Lo que no tiene referencia contra la cual compararse ni
   ahora ni después. Hoy en este documento hay uno solo: el facturable de la
   entrada que crea una celda vacía (TS-30), heredado de PR-21.
4. **Propuesta.** Lo que Clockify no documenta, no se pudo verificar y **nadie
   decidió todavía**. Va con «propuesta» y el pendiente `timesheet P-nn` que la
   tiene que cerrar. Cuando el equipo la cierre pasa a ser la clase 2; hasta
   entonces no es contrato.

### Lo que el plan Free deja fuera de este módulo

Citas textuales:

| Qué                                | Qué dice la documentación                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| El timesheet mismo, con plantillas | Precios, plan Free: «Quickly log work activities, daily or weekly, and save template timesheets». **Está en Free y se puede relevar.** |
| Enviar a aprobación y aprobar      | Precios: «Submit weekly or monthly timesheets and expenses for official manager review», solo en Standard, Pro y Enterprise.           |
| Bloquear timesheets                | «This is a paid feature available on **Standard, Pro, and Enterprise** plans».                                                         |
| Cargar horas de otra persona       | «This is a paid feature available on any paid plan.»                                                                                   |
| Forzar timer                       | «Force timer is a paid feature available by upgrading to the Pro or Enterprise plan.»                                                  |
| Campos obligatorios                | «Required fields is a paid feature, which you can enable by upgrading your workspace to any of the paid plans.»                        |
| Formato de duración decimal        | Precios: «See, enter, and export time in decimal format», desde Basic. Ya fuera de alcance por PF-20.                                  |

**Aprobaciones y bloqueo de timesheets no se pueden relevar** y quedan
`fuera de alcance` por ese motivo (TS-68, TS-69), igual que TT-67 y P-02 del
rastreador. Tiene un arrastre que no es obvio: la documentación de «copiar
semana anterior» y de plantillas las condiciona al período de aprobación del
workspace, que es un ajuste de aprobaciones. Ver TS-61 y TS-67.

**Dos respuestas del workspace no encajan con esta tabla.** «Copiar la semana
pasada» aparece desactivado aun con horas en la semana anterior (respuestas 10,
11 y H), y «Compañeros», que la documentación da como de plan pago, le aparece
a un admin para ver y editar las horas de los demás (K). No se sabe qué plan
tiene el workspace. **La referencia de paridad es el workspace de la empresa,
con el plan que tenga, y lo verificado ahí vale** (timesheet P-17).

## Vocabulario

| Clockify (inglés)                 | Workspace del equipo (castellano)                | Clock                                         |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| Timesheet                         | «Planilla de horarios»; barra lateral «Planilla» | «Planilla de horarios»; navegación «Planilla» |
| Add row                           | «Añadir nueva fila»                              | «Añadir nueva fila»                           |
| Select Project                    | «Seleccionar proyecto»                           | «Seleccionar proyecto»                        |
| Encabezado de la columna de filas | «Proyectos»                                      | «Proyectos»                                   |
| Columna y fila de totales         | «Total:»                                         | «Total»                                       |
| Cell                              | —                                                | Celda                                         |
| Copy last week                    | «Copiar la semana pasada»                        | — (fuera de alcance de la fase 1)             |
| Save as template                  | «Guardar como plantilla»                         | «Guardar como plantilla»                      |
| Apply template                    | _No relevado_                                    | «Aplicar plantilla»                           |
| Add / Replace / Skip              | _No relevado_                                    | Agregar / Reemplazar / Omitir                 |
| Teammates                         | «Compañeros»                                     | — (fuera de alcance)                          |

`adaptar`: la interfaz va en español y toda la copia visible se traduce. No se
vuelve a justificar en cada comportamiento. **Donde el workspace del equipo ya
tiene un rótulo en castellano, se usa ese**, salvo «Total», que va sin los dos
puntos, como el total del día del rastreador (TT-45).

**La pantalla se llama «Planilla de horarios» y el enlace de la navegación,
«Planilla»**, como en el workspace. La navegación de Clock ya está en castellano
—«Inicio», «Calendario», «Proyectos»— y las rutas también —`/calendario`,
`/proyectos`—, así que «Timesheet» sería la única palabra en inglés de la barra.
En este documento «la planilla» es la pantalla nuestra y «el Timesheet», la de
Clockify cuando se cita su documentación. El archivo sigue siendo
`timesheet.md` y los identificadores `TS-nn` y `timesheet P-nn` no cambian,
porque los citan el mapa, los contratos y los otros documentos de paridad.

_Corregido el 2026-10-07, P-12_: decía que «Timesheet» se dejaba sin traducir
porque así lo nombraban el plan del equipo y el mapa de la fase 1, y que «Hoja
de horas» era una alternativa. La tabla tenía dos columnas, sin los rótulos del
workspace.

La regla de **una redacción por causa** de `time-tracker.md` vale acá: este
documento reusa los mensajes que ya existen y escribe solo los de causas nuevas
(sección 14).

## 1. La pantalla

**TS-01 La planilla está siempre disponible** — `adaptar`
Documentado: «Before you can use the Timesheet, a workspace admin must enable
it», con la opción «Activate timesheet» de los ajustes del workspace. Acá la
pantalla existe siempre y no hay interruptor. Decisión del equipo del
2026-10-07 (timesheet P-11). Justificación: el equipo pidió la planilla como
parte de la fase 1 y un interruptor que nadie va a apagar es configuración de
más; se agrega en la fase 2 con el resto de los ajustes de workspace si alguien
lo pide.
_Corregido el 2026-10-07, P-12_: era una propuesta pendiente de timesheet P-11.

**TS-02 La planilla no vuelve obligatorio el proyecto** — `adaptar`
Documentado, textual: «Once enabled, **Project** automatically becomes a
**required field** for all time entries.» Verificado en el workspace
(2026-10-07): con la planilla activa, el rastreador no deja guardar una entrada
sin proyecto (respuesta 9). En Clockify activar la planilla cambia una regla
del rastreador. Acá no: el proyecto sigue siendo opcional en toda la aplicación
(TT-69, TT-93, PR-96). Decisión del equipo del 2026-10-07.
Justificación: como TS-01 elimina el interruptor, replicar el efecto sería
volver obligatorio el proyecto para siempre y para todos, que contradice TT-69
y TT-24 —arrancar con la barra vacía—, ya implementados. Los campos
obligatorios son de plan pago (TT-84, P-01 del rastreador) y es ahí donde se
decide si el proyecto pasa a ser obligatorio, no acá. La consecuencia es la
fila «Sin proyecto» de TS-20, que en Clockify, con el proyecto obligatorio,
casi no aparece.
_Corregido el 2026-10-07, P-12_: era una propuesta pendiente de timesheet P-11
y la regla de Clockify estaba solo documentada.

**TS-03 Ocultar el rastreador** — `fuera de alcance`
Documentado: «If you only use the Timesheet mode, you can hide the Time Tracker
page», con el interruptor «Hide tracker». Verificado en el workspace
(2026-10-07): en los ajustes no se vio ninguna opción para ocultar el
rastreador (respuesta 16). Justificación: no está en el plan del workspace, así
que no se puede relevar, y el equipo usa las dos pantallas.
_Corregido el 2026-10-07, P-12_: la justificación decía que no estaba claro si
existía en Free.

**TS-04 Dónde está** — `adaptar`
Ruta `/planilla` dentro del shell con sesión, con el enlace «Planilla» en la
navegación, y el título «Planilla de horarios» arriba de la grilla.
Verificado en el workspace (2026-10-07): la entrada de la barra lateral dice
«Planilla» y el título de la pantalla, «Planilla de horarios» (respuesta 13).
Justificación: la ruta es nuestra y en castellano, como `/calendario` y
`/proyectos`; el rótulo y el título son los del workspace.
_Corregido el 2026-10-07, P-12_: la ruta era `/timesheet` y el rótulo seguía el
vocabulario anterior.

**TS-05 Solo las entradas propias** — `replicar`
La grilla suma solo las entradas de la persona de la sesión, igual que el
rastreador (TT-01), aunque quien mire sea admin. Documentado: ver y editar la
planilla de otra persona es «Add time for teammates», que es de plan pago
(TS-70).

## 2. La semana

**TS-06 La semana sale de la persona** — `replicar`
El primer día de la semana que muestra la grilla es el de la persona, que fija
un admin (PF-01, PF-16, PF-17). Documentado en la ayuda del perfil, en
respuesta a «How can I change the day my timesheet week starts on?»: «The "Week
start" is an administrative setting». Es el impacto que PF-18 ya anotó.
Llega con el slice 7; el corte lo hace `weekBounds` de `src/server/time` con
ese valor.

**TS-07 Días y horas en la zona horaria de quien mira** — `replicar`
Documentado: «Clockify displays time entries according to the time zone of the
person viewing them», con un ejemplo sobre el timesheet de un compañero visto
desde otro huso. Una entrada pertenece a la celda del día local de su `start`
en la zona horaria de la persona (PF-04, PF-11), y cambiar esa zona puede
moverla de celda (PF-38, TT-106).

**TS-08 Columnas** — `adaptar`
Verificado en el workspace (2026-10-07), con la captura de la respuesta 13: a la
izquierda, la columna de las filas con el encabezado «Proyectos»; después,
siete columnas de día rotuladas con el día abreviado y la fecha, «lu, sep. 28»
… «do, oct. 4»; a la derecha, la columna «Total:» (TS-44). Sábado y domingo
tienen un fondo distinto.
Acá: «Proyectos», los siete días de la semana a partir de TS-06 y «Total», con
sábado y domingo en un fondo distinto. Cada día se rotula con el día abreviado
y la fecha corta en el formato de la persona (PF-12), como el encabezado de día
del rastreador fuera de «Hoy» y «Ayer» (TT-44): `lun, 28/09`.
**La columna de hoy se resalta** y se marca como la fecha actual para los
lectores de pantalla (`aria-current="date"`). Decisión del contrato del slice
13 (§1, §5.4), que adopta la propuesta de este documento.
Justificación del `adaptar`: el rótulo de día es el mismo del rastreador, para
que un día se escriba igual en las dos pantallas.
_No verificado_: si Clockify resalta la columna de hoy, porque la captura era de
una semana pasada. Tampoco si el fondo distinto sigue a sábado y domingo fijos o
a los días laborables de la persona, que acá están fuera de alcance (PF-19);
acá, sábado y domingo.
_Corregido el 2026-10-16, PF-19 (equipo P-09, workspace P-06)_: decía que los
días laborables de la persona eran de la fase 2.
_Corregido el 2026-10-07, P-12_: era `replicar`, el rótulo propuesto era
`lun 29/09` y no decía nada del encabezado ni de los fines de semana.
_Corregido el 2026-10-07, slice 13_: la columna de hoy resaltada era una
propuesta.

**TS-09 Navegación entre semanas** — `adaptar`
Documentado: «Switch to a different week using the date navigation in the
top-right corner». Verificado en el workspace (2026-10-07), respuesta 13: arriba
a la derecha hay un selector de período rotulado «La semana pasada», con
flechas de anterior y siguiente; al lado, «Compañeros» (TS-70) y un botón con
un ícono de lista.
Acá: arriba a la derecha, semana anterior, semana siguiente y el rango, que
abre un selector de fecha y lleva a la semana que contiene el día elegido. El
rango se rotula con los textos de TT-47: «Esta semana», «Semana anterior» o las
fechas. **Cuando se mira otra semana, un enlace «Esta semana» lleva a la semana
en curso**; en la semana en curso no aparece. El botón con ícono de lista no se
replica hasta saber qué hace. Decisión del contrato del slice 13 (§1, §5.3),
que adopta las dos propuestas de este documento.
Justificación del `adaptar`: la misma semana se llama igual en el rastreador,
el calendario (CAL-15) y la planilla; el workspace dice «La semana pasada».
_No verificado_: si Clockify tiene un atajo para volver a la semana en curso
—la captura no muestra ninguno fuera del selector, pero era una semana pasada—
y qué hace el botón con ícono de lista.
_Corregido el 2026-10-07, P-12_: era `replicar` y no describía lo que muestra el
workspace.
_Corregido el 2026-10-07, slice 13_: el enlace «Esta semana» y no replicar el
botón de lista eran propuestas.

**TS-10 La semana viaja en la URL** — `adaptar`
`/planilla?semana=2026-09-28`, con el día de inicio de la semana; sin
parámetro, la semana en curso. Un día que no es inicio de semana se lleva al
inicio de la suya. Justificación: Clockify no lo documenta; en un Server
Component es lo más barato, sobrevive a la recarga (TS-95) y hace funcionar el
botón de volver. Es el mismo criterio que PR-95 y que CAL-17.
_Corregido el 2026-10-07, P-12_: la ruta era `/timesheet` (TS-04).

**TS-11 Semanas futuras** — `replicar`
Se puede navegar a cualquier semana futura y cargar horas en ella. Es la
consecuencia directa de TT-76 y P-10: Clockify acepta fechas futuras y la
planilla no tiene por qué ser más estricta que el modo manual.

**TS-12 Días anteriores al 1 de enero de 2000** — `adaptar`
Las celdas de esos días se dibujan en solo lectura y el servidor rechaza la
escritura con el mensaje de TS-81. El piso es una fecha fija, `2000-01-01`, como
día en la zona horaria de la persona, el mismo de toda alta o edición de horas
(CAL-48 de [la paridad del calendario](calendario.md)). La navegación hacia
atrás no se corta: una semana vieja se puede mirar. Justificación: decisión del
equipo ([arreglo del piso fijo](../slices/fase1-fix-piso-fijo.md)): un piso fijo
y amplio no impide cargar ningún día real y sigue frenando payloads absurdos.
_Corregido el 2026-10-07, piso fijo_: el título era «Días anteriores a la
creación del workspace», el piso era «el que fija el
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md)» y la
justificación decía «es el mismo piso que el alta manual; Clockify no tiene
ninguno documentado». El piso por creación impedía cargar los días anteriores
al primer login.

## 3. Filas

**TS-13 Una fila por proyecto y tarea** — `replicar`
Documentado: «Click **Select Project** and choose the project/task you worked
on». La identidad de una fila es el par `(proyecto, tarea)`, con la tarea
opcional: `(Rediseño, —)` y `(Rediseño, Maquetado)` son dos filas distintas.
Verificado en el workspace (2026-10-07), respuesta 13: cada fila muestra el
punto del color del proyecto y «Proyecto - Cliente», con el cliente en gris.
Acá: el punto de color, el proyecto con la tarea en la forma del botón del
rastreador —«Proyecto: Tarea» (TT-06)— y el cliente en gris.
_No verificado_: cómo muestra la fila de Clockify la tarea; la captura no la
nombra.
_Corregido el 2026-10-07, P-12_: no decía nada del cliente.

**TS-14 Qué filas trae una semana** — `replicar`
Una fila por cada par `(proyecto, tarea)` que tenga al menos una entrada cerrada
de la persona cuyo `start` cae en la semana (TS-07, TS-49), más las filas vacías
que guarda el navegador (TS-19). Las entradas de una fila se reparten en las
celdas por día.
_Corregido el 2026-10-07, P-12_: decía «al menos una entrada», sin excluir la que
corre, y «las filas agregadas a mano en la sesión».

**TS-15 Orden de las filas** — `adaptar`
Las filas que salen de las entradas van en el orden del selector (TT-07):
primero las de proyectos con cliente, por cliente en orden alfabético; después
las de proyectos sin cliente; al final, «Sin proyecto» (TS-20). Dentro de un
cliente, por proyecto en orden alfabético; dentro de un proyecto, primero la
fila sin tarea y después las de tarea, en orden alfabético. **Las filas
agregadas van abajo de todo**, en el orden en que se agregaron: las vacías que
guarda el navegador (TS-19) siempre, y las agregadas en esta carga de la página
aunque ya tengan horas. Una fila agregada que ya tiene horas pasa a su lugar
con la próxima recarga; una revalidación no la mueve. Decisión del contrato del
slice 13 (§1, §5.1, §5.4), que adopta la propuesta de este documento.
Justificación: Clockify no documenta el orden; este es el mismo agrupamiento
del selector (TT-07) y no hace saltar filas mientras se edita.
_No verificado_: el orden de Clockify; la captura de la respuesta 13 no lo dice.
_Corregido el 2026-10-07, P-12_: decía que las filas recién agregadas iban abajo
hasta la próxima recarga, sin distinguir las vacías, que ahora la sobreviven
(TS-19).
_Corregido el 2026-10-07, slice 13_: era una propuesta; decía «por cliente,
proyecto y tarea, en orden alfabético», sin ubicar los proyectos sin cliente ni
la fila sin tarea, y no decía en qué orden van las filas agregadas.

**TS-16 Añadir una fila** — `replicar`
Documentado: «Click the **Add row** button to add a new line (optional)».
Verificado en el workspace (2026-10-07), respuestas 7 y 13: debajo de la
grilla, «Añadir nueva fila» agrega una fila que dice «Seleccionar proyecto» con
un ícono de agregar y su total en cero; ahí se eligen el proyecto y la tarea.
Acá igual: la fila nueva dice «Seleccionar proyecto» y abre el selector de
TS-17; al agregarla, el foco va a ese selector. La fila no tiene ninguna
entrada hasta que se escribe una celda. **Mientras dice «Seleccionar
proyecto», sus celdas no se escriben** y su total es cero, y **no hay otra
igual**: «Añadir nueva fila» con una así en la grilla lleva el foco a su
selector en vez de sumar otra. Esa fila vive solo en la página (TS-19) y se
quita sin diálogo (TS-52). Decisión del contrato del slice 13 (D13-10),
aceptada por el team-lead.
_No verificado_: si Clockify deja escribir en las celdas de una fila antes de
elegir el proyecto, y si deja tener varias filas sin elegir a la vez.
_Corregido el 2026-10-07, P-12_: el botón era «Agregar fila» y la fila aparecía
con el selector abierto.
_Corregido el 2026-10-07, slice 13_: que las celdas de la fila nueva no se
escribían era una propuesta, y no decía adónde va el foco ni cuántas filas sin
elegir puede haber.

**TS-17 Qué ofrece el selector de la fila** — `replicar`
Documentado: «projects must be visible to you before you can add time to them»;
los públicos aparecen solos y a los privados hay que estar asignado. Es el mismo
selector y el mismo filtro que el rastreador: proyectos activos accesibles
(TT-08, PR-61), agrupados por cliente, con sus tareas activas (PR-38) y el
buscador de TT-07. Archivados y tareas hechas no se ofrecen (PR-23, PR-99,
PR-100).

**TS-18 Cada combinación se elige una sola vez por semana** — `adaptar`
Documentado, textual: «In the Timesheet view, each project can only be selected
once per week. It won't show up again in the project picker for new rows».
Verificado en el workspace (2026-10-07), respuesta F: con una fila de proyecto
A y tarea 1, se puede agregar otra con la misma combinación, contra lo que dice
la ayuda.
Acá el selector de una fila nueva no ofrece un par `(proyecto, tarea)` que ya es
fila en la semana —el mismo proyecto con otra tarea, sí—, ni «Sin proyecto» si
esa fila ya existe (TS-20). Decisión del equipo del 2026-10-07.
Los pares excluidos son los de todas las filas de la grilla: las que salen de
las entradas, las vacías que guarda el navegador y las agregadas en esta carga.
**Lo excluido no se dibuja**, salvo la opción de un proyecto que todavía ofrece
alguna tarea: queda visible e inactiva, para que sus tareas conserven su
encabezado. Con la búsqueda vacía, algún proyecto para ofrecer y todo excluido,
el selector dice «Todas las combinaciones ya tienen fila esta semana.»; sin
ningún proyecto para ofrecer, el vacío es el de TS-88. Decisión del contrato
del slice 13 (D13-9), aceptada por el team-lead.
Justificación: dos filas con el mismo par sumarían las mismas entradas y cada
celda se vería dos veces.
_No verificado_: qué muestra Clockify en dos filas con la misma combinación.
_Corregido el 2026-10-07, P-12_: era `replicar` sobre la frase de la ayuda, leída
para el par `(proyecto, tarea)` y pendiente de confirmar.
_Corregido el 2026-10-07, slice 13_: no decía cómo se muestra lo excluido ni
qué dice el selector cuando todo está excluido.
_Corregido el 2026-10-08, slice 13_: el vacío «Todas las combinaciones ya
tienen fila esta semana.» valía también sin ningún proyecto para ofrecer.

**TS-19 La fila vacía la guarda el navegador** — `replicar`
Verificado en el workspace (2026-10-07), respuestas 8 y G: una fila agregada sin
escribir nada sigue después de recargar, con su proyecto y su tarea, y no
aparece en otro navegador ni en una ventana de incógnito.
Acá igual: la fila vacía se guarda en el almacenamiento local del navegador y
no en el servidor; sobrevive a la recarga en ese navegador y no se ve en otro.
No hay tabla de filas. Cuando se escribe su primera celda, la fila sale de sus
entradas (TS-14). Decisión del equipo del 2026-10-07 (timesheet P-07).
**La fila vacía es de la semana en que se agregó** y no aparece en las demás.
Decisión del team-lead del 2026-10-07 (timesheet P-16).
**Qué guarda el navegador y cuándo lo olvida.** Guarda solo el par `(proyecto,
tarea)` de una fila que ya lo tiene elegido, también «Sin proyecto», por
semana, por workspace y por persona. Una fila nueva que todavía dice
«Seleccionar proyecto» (TS-16) no se guarda: vive solo en la página. El
navegador olvida la fila al quitarla (TS-52); cuando la lectura del servidor
trae esa fila con entradas, porque ya sale de ellas (TS-14); y cuando su par
deja de estar entre los que la persona puede cargar (TS-17) —un proyecto
archivado, una tarea hecha, un privado sin acceso—, porque sería una fila que
no se puede escribir (TS-21). No vence: una fila guardada en una semana vieja
queda hasta que se quita. Sin almacenamiento local disponible, las filas vacías
viven solo en la página, sin aviso. Una membresía que no está activa no las ve
(TS-76). Decisión del contrato del slice 13 (D13-7), aceptada por el team-lead.
_No verificado_: qué hace Clockify con la fila vacía en las otras semanas, ni
con la de un proyecto que se archiva; no se probó.
_Corregido el 2026-10-07, P-12_: era `adaptar`: la fila vacía vivía solo en la
página y desaparecía al recargar o al cambiar de semana, como propuesta
pendiente de timesheet P-07.
_Corregido el 2026-10-07, slice 13_: si la fila vacía era de la semana en que se
agregó o aparecía también en las otras estaba pendiente de timesheet P-16, y
qué guarda el navegador y cuándo lo olvida lo fijaba el contrato del slice.

**TS-20 La fila «Sin proyecto»** — `adaptar`
Las entradas sin proyecto de la semana forman una fila rotulada «Sin proyecto»,
en gris, sin punto de color y sin cliente (TT-50), que se edita con las mismas
reglas que cualquier otra y va después de las de proyecto (TS-15). El selector
de la fila nueva ofrece también «Sin proyecto», como la opción de TT-10,
mientras esa fila no exista ya en la semana (TS-18).
Decisión del equipo del 2026-10-07 (timesheet P-06), consecuencia de TS-02.
Justificación: con el proyecto opcional esas entradas existen y tienen que
sumar; sin la fila, el total del día de la planilla no coincidiría con el del
rastreador (TS-48). En Clockify no hay con qué compararla: con la planilla
activa no deja guardar sin proyecto (respuesta 9), y la fila solo puede venir
de entradas viejas o de un proyecto borrado (PR-64).
_Corregido el 2026-10-07, P-12_: era una propuesta pendiente de timesheet P-06,
sin decir «sin cliente», y el dibujo de Clockify estaba pendiente de verificar.

**TS-21 Filas de un proyecto archivado, de una tarea hecha o sin acceso** —
`replicar`
La fila aparece si tiene entradas en la semana: archivar no toca las entradas
(PR-63, PR-65) y quien perdió el acceso a un proyecto privado sigue viendo las
suyas (PR-71). Una celda con una sola entrada se escribe con TS-33 y una con
varias se baja con TS-34, porque editar la duración de una entrada existente no
la vuelve a asignar al proyecto. Las celdas vacías de esa fila quedan en solo
lectura, porque escribirlas crearía una entrada nueva en un proyecto que el
selector no ofrece (PR-23); si el pedido llega igual, el servidor responde con
TS-77 o TS-78. **Subir una celda con varias entradas también se rechaza**, con
TS-77 o TS-78 y sin escribir nada: agrega una entrada nueva (TS-34), y eso es
crear en ese proyecto. Decisión del contrato del slice 13 (D13-5), aceptada por
el team-lead.
Verificado en el workspace (2026-10-07), respuestas 14 y J, para el proyecto
archivado: su tiempo sigue en la planilla, el rastreador y el calendario; las
celdas con entradas se editan y las vacías no crean.
_No verificado_: la tarea hecha y el proyecto privado sin acceso, que no se
probaron; se les aplica la misma regla. Tampoco qué hace Clockify al subir una
celda con varias entradas de un proyecto archivado: la respuesta J no distingue
entre una entrada y varias.
_Corregido el 2026-10-07, P-12_: lo de Clockify estaba sin verificar.
_Corregido el 2026-10-07, slice 13_: decía que las celdas que ya tienen
entradas se editaban con TS-33 y TS-34, sin excluir subir una celda con varias.

**TS-22 Entradas de un proyecto o una tarea borrados** — `replicar`
Documentado en proyectos: la entrada pierde el proyecto y conserva las horas
(PR-64), o pierde la tarea y conserva el proyecto (PR-66). En la grilla eso
significa que sus horas pasan a la fila «Sin proyecto» o a la fila del proyecto
sin tarea, y los totales no cambian.

**TS-23 El proyecto de una fila no se cambia** — `adaptar`
Una fila no tiene selector una vez elegido su par, tenga horas o no. Para
cambiar el de una fila vacía, se la quita y se agrega otra (TS-16); para mover
horas de un proyecto a otro, se edita la entrada desde el rastreador o, desde
el slice 13b, desde el detalle (TS-41). Decisión del contrato del slice 13
(D13-10), aceptada por el team-lead. Justificación: cambiar el proyecto de una
fila con horas sería una edición masiva de proyecto sobre las entradas de la
semana, que es TT-63 y del slice 12, y en una fila vacía quitarla y agregar
otra da lo mismo; Clockify no documenta nada al respecto.
_No verificado_: si Clockify deja cambiar el proyecto de una fila con horas. La
pregunta 14 de P-12 lo pedía y las respuestas no lo cubren.
_Corregido el 2026-10-07, slice 13_: era una propuesta, mandaba primero al
detalle, que llega con el 13b, y no decía qué pasa con una fila vacía.

## 4. Celdas: lo que muestran y lo que aceptan

**TS-24 Qué suma una celda** — `replicar`
La celda `(fila, día)` muestra la suma de las duraciones de **todas las
entradas cerradas** de la persona con ese proyecto, esa tarea y el `start` en
ese día local. La entrada que corre no suma (TS-49). No importan la
descripción, las etiquetas ni el facturable: dos entradas del mismo proyecto
con descripciones distintas caen en la misma celda. Documentado: «Descriptions
are linked to individual time entries»; la celda agrega entradas, no las
fusiona. Una celda sin entradas se dibuja vacía, no con `0:00`.
_No verificado_: si Clockify dibuja la celda sin entradas vacía o en cero; la
captura describe en cero los totales, no las celdas.
_Corregido el 2026-10-07, P-12_: decía «incluido el timer activo si es una de
ellas (TS-49)».

**TS-25 Formatos aceptados** — `replicar`
Los mismos de la barra manual, con el mismo intérprete: TT-19, incluida la coma
decimal. Verificado en el workspace (2026-10-07), respuestas 5 y A: `1` da
`00:01:00`, `8` son ocho minutos, `1:00` y `1h` son una hora y `1:30`, una hora
y media. Coincide con la tabla de la página del Timesheet —con el formato de
duración en minutos y horas, «1» se vuelve 1 minuto— y con PF-21: para ocho
horas se escribe `8h`, `8:00` u `8,0`. Decisión del equipo del 2026-10-07.
Por TT-19 acepta también `h:mm:ss`, con los dos formatos de duración: `1:30:00`
y `01:30:45` son una hora y media, con los segundos truncados.
_Corregido el 2026-10-07, P-12_: era `adaptar` por la coma decimal y estaba sin
verificar qué hacía `8` en una celda, porque la página de creación de entradas
se leía como si fueran ocho horas.
_Corregido el 2026-10-20, WS2a_: no aceptaba `h:mm:ss`
([ADR 0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md)).

**TS-26 Tope de lo que se escribe en una celda** — `adaptar`
La celda acepta menos de 24 horas, el mismo tope de `parseDurationInput` en la
barra manual. Lo que pasa de ahí no se interpreta y vale TS-27. No es un tope de
la entrada (TT-74): una celda puede **mostrar** más de 24 horas si suma varias
entradas o una que viene del timer (TS-102). Justificación: un solo intérprete
para los dos campos de duración; Clockify no documenta ningún tope.

**TS-27 Texto que no se interpreta** — `adaptar`
La celda vuelve al valor anterior y se marca en rojo por un instante, sin
escribir nada. Es TT-21 tal cual, con la misma justificación.

**TS-28 Cuándo se guarda** — `adaptar`
Documentado: «Click anywhere on the screen or press **Enter/Return** to save».
Se guarda al perder el foco o con Enter; `Esc` descarta y vuelve al valor
anterior, y mientras la escritura está en vuelo la celda queda atenuada, como
en TT-55. Justificación del `adaptar`: `Esc` y el atenuado son de TT-55.

## 5. Qué escribe una celda

La documentación no cubre esta sección (ver
[Fuentes](#fuentes-y-límites-del-relevamiento)). Las reglas salen de las
respuestas de P-12 y de las decisiones del equipo del 2026-10-07.

La operación se piensa como **«dejar la celda en este valor»**, no como «sumar»
ni «restar»: el pedido lleva el día, el proyecto, la tarea y la duración
pedida, y el servidor decide qué escribir mirando lo que la celda tiene **en
ese momento**, dentro de la transacción. De ahí salen la idempotencia de TS-37 y
la respuesta a una pestaña desactualizada (TS-93).

**Las reglas miran solo las entradas cerradas de la celda.** La entrada que
corre no está en la planilla (TS-49) y escribir una celda nunca la toca (TS-50).

**TS-29 Celda vacía: crea una entrada** — `replicar`
Documentado: después de cargar horas en la celda, «Once the entry is created,
click on the three dots in the cell». Verificado en el workspace (2026-10-07),
respuesta 1. Escribir una duración en una celda vacía crea **una** entrada
cerrada de la persona en ese proyecto y esa tarea, en ese día.

**TS-30 Los campos de la entrada que crea una celda vacía** — `adaptar`
Descripción vacía —la fila del rastreador muestra «Sin descripción» (TT-94)—,
sin etiquetas, y el facturable por defecto del proyecto (TT-14), que es
**diseño propio** por PR-21 y P-16. Documentado que la descripción y las
etiquetas se agregan después, desde el detalle (TS-40). La entrada que agrega
una celda con varias copia sus campos de otra (TS-34). Justificación del
`adaptar`: el facturable no se puede relevar en Free.

**TS-31 La hora de inicio de la entrada que crea una celda vacía** —
`replicar`
**09:00 hora de pared** del día de la celda, en la zona horaria de la persona,
igual para todas las filas. Verificado en el workspace (2026-10-07), respuestas
1 y A: escribir `1` en una celda vacía crea una entrada que en el rastreador va
de 09:00 a 09:01, y en el perfil no hay nada parecido a «inicio del día».
Decisión del equipo del 2026-10-07 (timesheet P-01): la hora es fija y no sale
de ningún ajuste. **Perfil P-02 se cierra**: ese ajuste no existe en el
workspace y PF-15 sigue `fuera de alcance`.
Consecuencia aceptada: dos celdas del mismo día en filas distintas crean dos
entradas que empiezan a la misma hora y se superponen. Vale TT-82 (TS-38).
Si las 09:00 no existen ese día por un cambio de horario, se usa el primer
minuto que exista después: la persona no tecleó esa hora y no corresponde
mostrarle TT-112. **Si desde las 09:00 no existe ningún minuto ese día**, el
servidor no escribe y responde «Esa hora no existe por el cambio de horario.»
(TT-112). Decisión del contrato del slice 13, en el
[ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md),
aceptado. El 30 de diciembre de 2011 falta entero en `Pacific/Apia` y en
`Pacific/Fakaofo`, pero **no se llega navegando**: una semana con un día que
falta entero cae a la actual (CAL-17). Solo desde una pestaña abierta antes de
cambiar la zona del perfil a una de esas dos (TS-111), hasta que se revalida,
o con un pedido armado a mano.
_No verificado_: qué hace Clockify un día en que las 09:00 no existen. La
respuesta 1 dice también que la entrada creada no apareció en el calendario;
no se sabe por qué, y no cambia ninguna regla de este documento.
_Corregido el 2026-10-07, P-12_: era `adaptar`, como propuesta pendiente de
timesheet P-01, con la hipótesis de que Clockify usara «inicio del día» del
perfil.
_Corregido el 2026-10-07, slice 13_: no decía qué pasa si desde las 09:00 no
existe ningún minuto ese día.
_Corregido el 2026-10-08, slice 13_: no decía que el caso se puede alcanzar
desde la interfaz ni en qué zonas.
_Corregido el 2026-10-08, ronda 3 del contrato del 13_: decía que el caso se
alcanzaba desde la interfaz; `isNavigable` descarta esa semana.

**TS-32 El fin es el inicio más la duración, en instantes** — `adaptar`
**Divergencia explícita contra el
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md)**, no contra
Clockify. Al escribir `V` en una celda, el fin de la entrada se calcula como
**el instante de inicio más `V` minutos**, no como una hora de pared
convertida con `instantFromLocal`. El ADR 0005 dice que no hay un tercer camino
de instantes además de `now()` y de la hora tecleada, y `createManualEntry` lo
deja escrito en un comentario: «El fin es la hora tecleada y no el inicio más
la duración». Acá lo que se tecleó **es** la duración.

Vale para todo lo que escribe una celda: el fin de la entrada que crea una
celda vacía (TS-29), el fin que mueve TS-33, la entrada que agrega TS-34
—empieza en el instante en que termina otra y su fin es ese instante más la
diferencia— y el fin que TS-34 adelanta al bajar. Solo el inicio de TS-31 es
una hora de pared convertida.

Por qué no se puede expresar con las reglas existentes, con dos casos:

- **Segundos heredados del timer.** Una entrada del timer de `10:00:40` a
  `11:31:22` se ve `1:30`. Si la persona escribe `2:00` y el fin se arma como
  rótulo —`10:00` más 120 minutos, `12:00`—, el ADR 0006 conserva el inicio con
  sus segundos y el fin queda en `12:00:00`: la entrada dura `1:59:20` y la
  celda pasa a mostrar `1:59` después de que se escribió `2:00`.
- **Cambio de horario.** Una entrada que cruza la hora del cambio dura una hora
  más o una menos que la resta de sus rótulos (TT-97). Con el fin como rótulo,
  la celda mostraría `7:00` o `9:00` después de escribir `8:00`.

Con el fin como inicio más duración, **la celda muestra siempre exactamente lo
que se escribió**, que es lo único que la persona puede comprobar en esta
pantalla. Las horas de pared del fin son derivadas y nadie las tecleó. El orden
de los extremos (TT-81) se sostiene por construcción: `V` es de un minuto o más
(TS-35), y una baja que dejaría una entrada en menos de un minuto se rechaza
(TS-34).
Verificado en el workspace (2026-10-07), respuesta B: al pasar una celda de
`1:00` a `2:00`, Clockify movió solo el fin de la entrada.
Decisión del equipo del 2026-10-07 (timesheet P-02): se acepta, con dos
pedidos: que la excepción quede escrita en un ADR antes del contrato del slice
13, y que la mutación viva en `time-entry`, como manda el
[ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md) para todo módulo
que edite horas. La excepción es el
[ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md),
**propuesto por el contrato del slice 13 y aceptado el 2026-10-08 por el usuario**. La mutación
es nueva: ni `createManualEntry` ni `updateEntryTimes` sirven tal como están,
porque las dos reciben rótulos de fin.
_Corregido el 2026-10-07, P-12_: estaba pendiente de timesheet P-02, sin
respaldo del workspace, y cubría solo la entrada de una celda con una sola
entrada.
_Corregido el 2026-10-07, slice 13_: decía que se rechazaba la baja que dejaría
una entrada «en cero o menos» (TS-34, D13-4), y que la excepción la registraba
`architect` «en el ADR 0005 —o en uno nuevo—», todavía sin escribir.

**TS-33 Celda con una entrada: edita esa entrada** — `replicar`
Si la celda tiene exactamente una entrada cerrada, escribir `V` **edita esa
entrada**: conserva su inicio con sus segundos —el paso 1 del ADR 0006: el
inicio no cambió— y lleva el fin a inicio más `V` (TS-32). No se crea ninguna
entrada nueva y no cambian la descripción, las etiquetas ni el facturable. Es
la misma semántica que «editar la duración mueve la hora de fin» de la barra
manual (TT-18).
Vale aunque la entrada sea una de las que TT-110 deja en solo lectura en la
fila del rastreador: acá no hay trío que la trunque en silencio, la persona
escribe la duración nueva a propósito.
Verificado en el workspace (2026-10-07), respuestas 2 y B: sobre una celda con
una entrada de `1:00` hecha desde el rastreador, escribir `2:00` modifica esa
entrada, no crea otra; se mueve solo el fin y la descripción queda. Decisión
del equipo del 2026-10-07 (timesheet P-03).
_Corregido el 2026-10-07, P-12_: era `adaptar`, como propuesta pendiente de
timesheet P-03.

**TS-34 Celda con varias entradas: subir agrega, bajar achica la última** —
`adaptar`
Verificado en el workspace (2026-10-07), respuestas 3 y C: con dos entradas el
mismo día y proyecto, la celda deja escribir. Subir el valor crea una entrada
nueva, con la misma descripción que las otras, que empieza apenas termina la
última. Bajarlo descuenta de la entrada que empieza más tarde y, con el mismo
inicio, de la de id más reciente.

Con `V` lo escrito y `S` **lo que la celda muestra**, en minutos —la suma
exacta en segundos de sus entradas cerradas, dividida por 60 y truncada una vez
(TS-24, TS-47)—:

- **Subir (`V` mayor que `S`)**: crea una entrada cerrada de la persona, en el
  proyecto y la tarea de la fila, de duración `V − S`. Empieza en el instante
  de fin de la entrada de la celda que **termina** más tarde, y su fin es ese
  inicio más `V − S` (TS-32). Copia la descripción, las etiquetas y el
  facturable de la entrada de la celda que **empieza** más tarde.
- **Subir es un alta.** La entrada nueva pasa por las mismas validaciones que
  duplicar (TT-58): un proyecto archivado, una tarea hecha o un proyecto
  privado sin acceso responden TS-77 o TS-78 (TS-21), y una etiqueta archivada
  en la entrada que se copia responde «Esa etiqueta ya no está disponible.»
  (TT-78). No se escribe nada. Decisión del contrato del slice 13 (D13-5),
  aceptada por el team-lead.
- **El alta que caería en otro día se rechaza.** Si el fin de la entrada que
  termina más tarde cae en otro día local que el de la celda —porque cruza la
  medianoche, o termina justo a las 00:00 del día siguiente—, la entrada nueva
  empezaría en otra celda. El servidor no escribe nada y responde TS-79, que
  manda a editar las entradas de la celda una por una. Así la celda queda en el
  valor pedido o no cambia, y escribirla sigue siendo idempotente (TS-37).
- **Bajar (`V` menor que `S`)**: achica la entrada de la celda que empieza más
  tarde, adelantando su fin en `S − V`. El inicio, la descripción, las
  etiquetas y el facturable no cambian, como en TS-33.
- **La baja que dejaría esa entrada en menos de un minuto se rechaza.** Si a la
  entrada que empieza más tarde le queda menos de un minuto después de restarle
  `S − V` —cero o menos incluidos—, el servidor no escribe nada y responde
  TS-79. Es TT-73: ninguna escritura de la interfaz deja una entrada de menos
  de un minuto. Con entradas de minutos enteros es lo mismo que rechazar cero o
  menos; cambia con una entrada del timer con segundos, como una de `0:01:30`
  bajada un minuto, que quedaría en 30 segundos. Decisión del contrato del
  slice 13 (D13-4), aceptada por el team-lead. No se borra ninguna entrada ni
  se reparte la baja entre varias.
- **Desempate de «la que empieza más tarde»**: la de `start` más tarde; con el
  mismo `start`, la de `created_at` más reciente; y si también empata, la de id
  mayor, como orden fijo. En Clockify es la de id más reciente, que en su
  modelo es la creada último; acá los ids son UUID v4 y no tienen orden, los
  elija el cliente
  ([ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md)) o, en lo
  que crea una celda, el servidor
  ([ADR 0019](../adr/0019-escribir-una-celda-fija-su-valor.md), aceptado).
  Decisión del equipo del 2026-10-07.

**`S` es lo que la celda muestra, no la suma en segundos.** Así, después de
cualquier escritura la celda muestra exactamente `V`; el servidor no reescribe
una celda que ya muestra `V` —es TS-36 del lado del servidor: una de `1:30:42`
con `V` de `1:30` conserva sus segundos—; las sumas y las restas son de minutos
enteros, y la entrada que agrega una subida dura siempre un minuto o más. Con
la suma en segundos, una celda con dos entradas que suman `1:30:42`, llevada a
`1:31`, agregaría una entrada de 18 segundos, contra TT-73. Decisión del
contrato del slice 13 (D13-3), aceptada por el team-lead.

**Con el formato completo, los segundos sueltos quedan a la vista.** La regla
no cambia con el formato: `S` y `V` siguen en minutos, así que una celda con
varias entradas conserva al escribirla los segundos que no llegan al minuto.
Una que suma `02:13:27`, llevada a `2:15`, queda en `02:15:27`; con el compacto
se ve `2:15`. Mientras viaja la escritura, la celda muestra lo que va a dejar el
servidor. Quitar esos segundos cambiaría lo que escribe una celda: queda
pendiente de decisión del usuario, como pregunta 3 del
[contrato de WS2a](../slices/fase2-ws2a-formato.md) (D-WS2a-8).

En todos los rechazos la celda vuelve al valor anterior con el aviso.
Decisión del equipo del 2026-10-07 (timesheet P-03 y P-13). Justificación del
`adaptar`: es la regla de Clockify salvo dos casos que en el workspace no se
probaron. La baja que vaciaría la entrada la borraría en silencio, con su
descripción y sus etiquetas, y la que la dejara en segundos rompería el mínimo
de TT-73; el alta que caería en otro día dejaría la celda sin el valor pedido y
haría que un reintento volviera a sumar. En los dos, mejor rechazar y mandar a
editar las entradas una por una (TS-79), el mismo criterio de TT-110.
_No verificado_: qué hace Clockify con una baja que deja la entrada que empieza
más tarde en menos de un minuto o la vacía; de qué entrada copia las etiquetas
y el facturable —la respuesta C confirma solo la descripción, y las dos
entradas de la prueba tenían la misma—; y qué pasa cuando la entrada que
termina más tarde termina otro día (TS-119).
_Corregido el 2026-10-07, P-12_: el título era «Celda con varias entradas: no se
escribe desde la grilla». La celda quedaba en solo lectura, con un indicador de
que agrupaba varias, y se editaba solo desde el detalle, como propuesta
pendiente de timesheet P-03; un pedido que llegara igual se rechazaba con
TS-79.
_Corregido el 2026-10-07, slice 13_: la baja se rechazaba solo si `S − V` era
«mayor o igual que la duración» de la entrada que empieza más tarde; el alta en
otro día mandaba «a editar desde el detalle de la celda (TS-42)»; subir no
decía que pasa por las validaciones de un alta; `S` era «la suma de las
entradas cerradas de la celda», sin decir en qué unidad; y el desempate decía
que los ids son «elegidos por el cliente (ADR 0007)».
_Corregido el 2026-10-20, WS2a_: no decía qué se ve con el formato completo en
una celda con varias entradas que tienen segundos.

**TS-35 Vaciar una celda o escribir cero** — `replicar`
Vaciar la celda, escribir `0` o escribir menos de un minuto no borra nada y no
sale ningún pedido: la celda vuelve al valor anterior y se marca en rojo, como
TS-27 (TT-21). Vale sobre una celda vacía, con una entrada o con varias. El
mínimo de un minuto es el de TT-73: un pedido que llegue igual con menos se
rechaza con «La entrada tiene que durar al menos un minuto.», sin escribir.
Borrar es desde el menú de tres puntos de la celda (TS-40), con el diálogo de
confirmación de TT-61 y sin deshacer (P-06 del rastreador).
**«Borrar» desde el menú** está en una celda con una sola entrada y borra esa
entrada; en una con varias, se borra entrada por entrada desde el detalle
(TS-42). Al confirmar, el foco va al campo de la celda. Si era la última entrada
de una fila que viene del servidor, la fila sale con la próxima lectura y el
foco va a «Añadir nueva fila», o a la región de la grilla si no está, como al
quitar una fila (TS-52); una fila agregada en esta carga queda dibujada vacía
(TS-15). Cancelar devuelve el foco al menú. Decisión del contrato del slice 13b
(§5.6), aceptada por el team-lead.
Verificado en el workspace (2026-10-07), respuesta 6: vaciar una celda con una
entrada no hace nada, porque Clockify valida que el valor sea mayor que cero.
Decisión del equipo del 2026-10-07 (timesheet P-04).
_No verificado_: el aviso exacto que muestra Clockify al rechazar el cero.
_Corregido el 2026-10-07, P-12_: era `adaptar`, como propuesta pendiente de
timesheet P-04: vaciar o escribir `0` borraba la entrada de una celda con una
sola, con el diálogo de TT-61.
_Corregido el 2026-10-08, slice 13b_: no decía adónde va el foco al borrar
desde el menú ni qué pasa con la fila que se queda sin entradas.

**TS-36 Escribir lo mismo no escribe nada** — `adaptar`
Si lo que queda en la celda al perder el foco, ya interpretado, tiene los mismos
minutos que la celda —la suma exacta de sus entradas, truncada al minuto—, no
sale ningún pedido, con los dos formatos de duración. Una celda de `1:30:42` que
se confirma sin tocar, o en la que se teclea `1:30`, conserva sus segundos: con
el compacto se muestra `1:30`; con el completo, `01:30:42`, y el campo vuelve a
ese rótulo, no a uno armado con lo tecleado. Justificación: el redondeo de la
vista no puede convertirse en una escritura, y el servidor también decide en
minutos (TS-34).
_Corregido el 2026-10-20, WS2a_: decía «igual a lo que la celda mostraba», que
con el completo no vale: `1:30` no es `01:30:42`, y no se escribe igual
([contrato de WS2a](../slices/fase2-ws2a-formato.md), D-WS2a-8).

**TS-37 Escribir una celda se puede reintentar** — `adaptar`
Como el pedido es «dejar la celda en `V`», repetirlo deja el mismo estado: si
el primer intento se aplicó, el segundo encuentra la celda ya en `V` y no
escribe nada. Vale para TS-29, TS-33 y TS-34 por igual; el alta que no dejaría
la celda en `V` se rechaza (TS-34, TS-119). Por eso, ante una falla de red, el
aviso ofrece «Reintentar» (TT-89).
Lo que la idempotencia exige del servidor: **dos pedidos simultáneos sobre la
misma celda tienen que dejarla en un solo estado** —dos pestañas, o un Enter
seguido de la pérdida del foco—; sobre una celda vacía, una sola entrada. La
lectura de la celda y la escritura van en la misma transacción y serializadas
por `(persona, proyecto, tarea, día)`, con un bloqueo de la celda tomado antes
de leerla y sin id del cliente: decisión del contrato del slice 13 (D13-2),
aceptada por el team-lead, en el
[ADR 0019](../adr/0019-escribir-una-celda-fija-su-valor.md), aceptado.
Justificación: Clockify reintenta solo y no expone la decisión, como en TT-89.
_Corregido el 2026-10-07, slice 2c_: decía que el aviso «**sí**» ofrecía
«Reintentar», «a diferencia del alta manual (TT-109), que solo crea», y la
justificación terminaba «como en TT-109». Desde el slice 2c el alta manual
también ofrece «Reintentar», con el id que elige el cliente
([ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md)), y TT-109 dejó
de ser una excepción.
_Corregido el 2026-10-07, P-12_: el segundo intento «encontraba una sola entrada
y la dejaba en `V` (TS-33)», porque una celda con varias no se escribía.
_Corregido el 2026-10-07, slice 13_: decía «cómo, lo decide el contrato del
slice».

**TS-38 Superposición** — `adaptar`
Las entradas que crea la planilla pueden superponerse entre sí (TS-31), con las
del rastreador y con el timer que corre (TS-50), sin aviso. Es TT-82, con su
misma justificación y su mismo pendiente (P-04 del rastreador).

**TS-39 Escribir con un timer corriendo** — `replicar`
Se puede: TT-30 no se aplica a la planilla, y la grilla sigue editable con un
timer corriendo, también en la celda del proyecto del timer (TS-50).
Verificado en el workspace (2026-10-07), respuestas 4 y D: con el timer
corriendo se puede escribir y borrar, también en su celda. Decisión del equipo
del 2026-10-07 (timesheet P-05).
TT-30 es documentado para el modo manual de la barra, cuyo conmutador comparte
lugar con el timer. Desde el slice 8c, `createManualEntry` acepta el alta con un
timer abierto (calendario P-01), así que ese rechazo ya no es un motivo para la
mutación propia de TS-32, que se sostiene por los suyos.
_Corregido el 2026-10-04, slice 8c_: decía que `createManualEntry` rechazaba
con `timer_running` cuando había un timer abierto, y que eso era otra razón
para la mutación propia de TS-32. El slice 8c sacó ese rechazo: TT-30 quedó
como regla de la interfaz del rastreador.
_Corregido el 2026-10-07, P-12_: era `adaptar`, como propuesta pendiente de
timesheet P-05, y exceptuaba la celda que contenía el timer.

## 6. El detalle de una celda

**TS-40 Menú de tres puntos en la celda** — `replicar`
Documentado: «Hover over the cell that contains the tracked time», «Click on
the three dots that appear», «Enter the detail you want to add in the pop-up
(description, tags, billable status, start/end time)». Verificado en el
workspace (2026-10-07), respuesta E: la celda tiene un menú de tres puntos y una
de sus opciones es eliminar.
Solo las celdas con horas tienen menú. El menú abre el detalle (TS-41, TS-42) y,
en una celda con una sola entrada, ofrece «Borrar», que borra esa entrada con
el diálogo de TT-61 y sin deshacer (TS-35). En una celda con varias, el menú no
ofrece «Borrar» y se borra entrada por entrada desde el detalle (TS-42), para
no borrar de una vez entradas cuyas descripciones no se ven (TS-43). Decisión
del team-lead del 2026-10-07 (timesheet P-14). El menú se abre también con el
teclado (TS-99). «Borrar» y no «Eliminar», por TT-60.
**Qué ofrece**: con una entrada, «Editar», que abre el editor (TS-41), y
«Borrar»; con varias, solo «Ver detalle», que abre la lista (TS-42). Su nombre
accesible es «Acciones de la celda {celda}», con el nombre de la celda de
TS-100: «Acciones de la celda Rediseño: Maquetado, miércoles 01/10». **Cuándo
existe**: en una celda con entradas en la última lectura del servidor y con
permiso de carga; sin él no hay menú (TS-76). **Cuándo está inactivo**:
mientras la celda tenga una escritura de la grilla o un guardado o un borrado
del detalle que la última lectura todavía no trae, el botón queda inactivo y
no abre, sin perder el foco; así el detalle abre siempre sobre las entradas que
la celda muestra. Una celda vacía que se acaba de escribir recibe su menú
cuando llega la lectura que trae su entrada. Elegir una opción lleva el foco al
diálogo que abre, y cancelarlo lo devuelve al botón. Decisión del contrato del
slice 13b (D13b-4, D13b-5, D13b-6), aceptada por el team-lead.
_No verificado_: las demás opciones del menú de Clockify y qué borra su
«eliminar» en una celda con varias entradas.
_Corregido el 2026-10-07, P-12_: no decía que el menú borra.
_Corregido el 2026-10-07, slice 13_: el menú de una celda con varias entradas
sin «Borrar» era una propuesta pendiente de timesheet P-14.
_Corregido el 2026-10-08, slice 13b_: no decía qué ofrece el menú en cada caso,
ni su nombre, ni cuándo está inactivo, ni que sin permiso de carga no hay menú.

**TS-41 Detalle de una celda con una entrada** — `adaptar`
Documentado, textual, como tercer paso después de abrir los tres puntos (TS-40):
«Enter the detail you want to add in the pop-up (description, tags, billable
status, start/end time)». La página no dice cómo se guarda lo que se escribe en
ese pop-up.
Acá, «Editar» del menú abre el diálogo de una entrada del calendario, «Editar
entrada» (CAL-65 … CAL-67), con la entrada como estaba en la última lectura al
abrirlo (CAL-72) y el foco en la descripción. Edita descripción (TT-54),
proyecto y tarea, fecha, inicio, fin y duración (TT-54, TT-56), etiquetas
(TT-12) y facturable (TT-14), con las reglas de cada campo de la fila del
rastreador y su excepción TT-110: una entrada de más de un día muestra su
horario como texto. **«Guardar» aplica todo junto o nada**, en una sola
mutación, como CAL-67: mientras el pedido viaja «Guardar» queda inactivo, y al
asentarse el editor se cierra y el foco va al campo de la celda —o, si la fila
salió, adonde va en TS-35—. Cerrarlo con cambios sin guardar los descarta
(CAL-67). Cambiar la fecha mueve la entrada de celda o de semana, y cambiar el
proyecto o la tarea la mueve de fila (TS-23, TS-115). El menú del editor ofrece
«Borrar», que abre la confirmación de TT-61, y **no ofrece «Duplicar»** (CAL-68):
duplicar no es parte de la paridad de la planilla.
Las fallas de validación, de red (con «Reintentar», que guarda el borrador de
ahora: TT-89, CAL-67) y de permiso (TS-84, sin «Reintentar») se ven en el
editor. Las que lo cierran van a la pantalla: la entrada ya no existe (TS-83),
o un proyecto, una tarea o una etiqueta que ya no se ofrecen, que pierden el
borrador, como en el calendario. Si el editor se cerró con el pedido en vuelo,
su falla también va a la pantalla. Decisión del contrato del slice 13b
(D13b-1, D13b-7), aceptada por el team-lead.
Justificación del `adaptar`: Clockify documenta un pop-up y no cómo guarda; acá
es el mismo diálogo que edita una entrada en el calendario, con «Guardar» todo
o nada por decisión del usuario (calendario P-04), para que una entrada se
edite igual en las dos pantallas, y suma proyecto, tarea y fecha, que el pop-up
documentado no lista.
_No verificado_: si el pop-up de Clockify guarda campo por campo o con un
botón, si ofrece proyecto, tarea y fecha, y qué hace al cerrarse con cambios.
_Corregido el 2026-10-08, slice 13b_: era `replicar` y decía «El popover edita
esa entrada con los mismos campos y las mismas mutaciones que la fila del
rastreador: descripción (TT-54, TT-55), etiquetas (TT-12), facturable (TT-14),
y horas y fecha (TT-54, TT-56), con sus dos excepciones, TT-110 y TT-111.
Cambiar la fecha mueve la entrada de celda; cambiar el proyecto, si el detalle
lo ofrece, la mueve de fila (TS-23). Etiquetas y facturable entran cuando esté
mergeado el slice 11.»

**TS-42 Detalle de una celda con varias entradas** — `adaptar`
«Ver detalle» del menú abre una lista titulada «Detalle de {celda}» con las
entradas cerradas de la celda, en el orden de la grilla —por inicio, creación e
id—. Cada una muestra su descripción —«Sin descripción» en gris si está
vacía—, su horario con el superíndice de días (TT-51), su duración y dos
botones: «Editar», que abre encima el editor de TS-41, y «Borrar», que abre
encima la confirmación de TT-61 (TT-60). Sus nombres accesibles llevan la
entrada y su horario: «Editar «Diseño», de 09:00 a 10:30». Es el camino para lo
que TS-34 no hace desde la celda: una baja que dejaría la entrada que empieza
más tarde en menos de un minuto, un alta que caería en otro día, un cambio en
otra entrada que no es esa, o un borrado. Decisión del equipo del 2026-10-07
(timesheet P-03). Desde el slice 13b, TS-79 manda acá.
**La lista sigue a la última lectura del servidor**: una entrada que se borró,
se movió o cambió de par sale, y una que llegó a la celda desde otra pestaña
aparece; el editor, en cambio, queda con la entrada como estaba al abrirlo
(CAL-72). Mientras una entrada tiene un guardado o un borrado que la lectura
todavía no trae, sus dos botones quedan inactivos. Si la lista queda vacía sin
nada abierto encima, se cierra; con el editor o la confirmación encima, se
cierra cuando ellos se cierran. **Mientras está abierta, las fallas de los
pedidos de esa celda que irían a la pantalla se ven arriba de los ítems**, con
el título de TS-83, y con «Reintentar» solo por red (TT-89); al cerrarla, si
siguen vigentes, pasan a la pantalla. El foco: al asentarse un guardado, vuelve
a «Editar» de esa entrada; al confirmar un borrado, al título de la lista;
«Cerrar» lo devuelve al menú de la celda. No se agregan entradas desde la lista
(para eso está la celda, TS-29, TS-34) ni se editan o borran varias a la vez (es
la masiva del rastreador, TT-62 … TT-64). La forma, decisión del contrato del
slice 13b (D13b-2, §5.2), aceptada por el team-lead.
Justificación: Clockify no documenta qué muestra el pop-up en ese caso.
_No verificado_: qué muestra Clockify; la pregunta 3 de P-12 lo pedía y las
respuestas no lo cubren.
_Corregido el 2026-10-07, P-12_: decía que era la única forma de editar esa
celda, porque TS-34 la dejaba en solo lectura.
_Corregido el 2026-10-07, slice 13_: decía «una baja que no entra en la entrada
que empieza más tarde» y no decía qué camino hay antes del 13b.
_Corregido el 2026-10-08, slice 13b_: decía «El popover lista las entradas
cerradas de la celda, cada una con su descripción, sus horas y su duración,
editables con las reglas de TS-41 y con «Borrar» (TT-60)», y que llegaba con el
13b y hasta entonces ese camino era el rastreador (TS-79).

**TS-43 La grilla no muestra descripciones ni etiquetas** — `replicar`
Documentado, textual: «In the Timesheet view, you won't see the description
field by default. This view is designed for fast time input across the week.»
La grilla solo tiene duraciones; el resto se ve en el detalle.

## 7. Totales

**TS-44 Total por fila** — `replicar`
En la columna «Total», a la derecha de los siete días, la suma de la fila en la
semana. Una fila vacía muestra cero.

**TS-45 Total por día** — `replicar`
Abajo de la grilla, una fila «Total» con la suma de todas las filas en cada día.
Un total en cero se muestra en gris, **y vale para los tres totales**: el de
cada día, el de cada fila (TS-44) y el de la semana (TS-46). Para el de la fila
y el de la semana, decisión del contrato del slice 13 (§1, §5.4).
_No verificado_: si Clockify muestra en gris el total de una fila o el de la
semana cuando son cero; la respuesta 13 lo dice solo del total por día.
_Corregido el 2026-10-07, slice 13_: el gris del cero era solo del total por
día.

**TS-46 Total de la semana** — `replicar`
En la fila «Total», a la derecha, la suma de toda la grilla.
Verificado en el workspace (2026-10-07), para TS-44 a TS-46, con la captura de
la respuesta 13: el total de cada fila después de sus siete campos, en la
columna «Total:», también en la fila vacía (`00:00:00`); abajo, la fila
«Total:» con el total por día, `00:00:00` en gris cuando es cero, y el de la
semana a la derecha.
_Corregido el 2026-10-07, P-12_: los tres estaban sin verificar, sin rótulos y
sin el gris del cero.

**TS-47 Cómo se suma y cómo se escribe** — `replicar`
Las sumas se hacen en segundos y se formatean una sola vez, para no acumular el
truncamiento de cada celda (TT-45), con el formato de duración del workspace
(PF-02, PF-20, PF-22): `h:mm` por defecto. Un total puede pasar de 24 horas.
_No verificado_: la captura muestra los campos y los totales como `06:00:00`; no
se sabe si es el formato completo elegido en el workspace (PF-20) o un formato
fijo de la planilla.

**TS-48 Los totales coinciden con el rastreador, salvo el timer** — `replicar`
El total de un día en la planilla es el mismo número que el total de ese día en
el rastreador (TT-45, TT-46), y el de la semana el de la franja semanal (TT-47),
porque suman las mismas entradas cerradas con el mismo corte (TS-06, TS-07).
**Mientras corre un timer no coinciden**: el rastreador suma su transcurrido
(TT-46) y la planilla no (TS-49). Al detenerlo, la entrada entra en la planilla y
los totales vuelven a coincidir. Es la condición que hace necesaria la fila
«Sin proyecto» (TS-20).
_Corregido el 2026-10-07, P-12_: decía que coincidían siempre, porque la planilla
sumaba el timer activo.

## 8. El timer activo

**TS-49 La entrada que corre no está en la planilla** — `replicar`
La entrada abierta no se dibuja ni suma: ni en su celda, ni en el total de la
fila, ni en el del día, ni en el de la semana. Una fila que solo tendría la
entrada que corre no existe. Cuando el timer se detiene, la entrada aparece en
su celda con la próxima revalidación (TT-40).
Verificado en el workspace (2026-10-07), respuestas 4 y D: el timer corriendo
no aparece en la planilla; para el usuario no es una entrada hasta que se
detiene. Decisión del equipo del 2026-10-07.
_Corregido el 2026-10-07, P-12_: el título era «La entrada que corre está en su
celda y suma», `adaptar`: la celda y los tres totales sumaban el transcurrido y
se actualizaban con el contador, y la fila existía aunque no tuviera entradas
cerradas.

**TS-50 Escribir una celda nunca toca el timer** — `replicar`
Las reglas de la sección 5 miran solo las entradas cerradas. Una celda cuyo
único contenido es la entrada que corre está vacía para la planilla, y
escribirla crea una entrada (TS-29) que puede superponerse con el timer
(TS-38). Ningún pedido de la planilla cambia el inicio ni el estado de la
entrada abierta: su inicio se corrige desde el contador (TT-28).
Verificado en el workspace (2026-10-07), respuesta D: con el timer corriendo se
puede escribir en su celda. Decisión del equipo del 2026-10-07.
_Corregido el 2026-10-07, P-12_: el título era «La celda del timer activo no se
escribe», `adaptar`: la celda quedaba en solo lectura y un pedido se rechazaba
con TS-80.

**TS-51 La planilla no arranca ni detiene timers** — `replicar`
La pantalla no tiene botón de iniciar ni de detener: el timer se maneja desde
el rastreador. Una parada hecha en otra pestaña se ve con la revalidación de
TT-40. Verificado en el workspace (2026-10-07), respuesta 15: la planilla no
tiene controles de timer.
_Corregido el 2026-10-07, P-12_: estaba sin verificar.

## 9. Quitar una fila

**TS-52 Quitar una fila borra su semana** — `replicar`
Documentado, textual: «If you delete a time entry in the timesheet, all time
associated with that task, for that week, will be deleted.» Verificado en el
workspace (2026-10-07), respuesta 13: cada fila tiene una X a la derecha de su
total para quitarla.
Acá, la X —con el nombre accesible «Quitar fila» y el proyecto y la tarea—
borra las entradas cerradas de la persona con ese proyecto y esa tarea cuyo
`start` cae en la semana, **todas las que la fila muestra**, tengan la
descripción y las etiquetas que tengan. Las de otras semanas no se tocan. Una
fila vacía (TS-19), o una nueva que todavía dice «Seleccionar proyecto»
(TS-16), se quita sin diálogo, porque no borra nada.
**La semana y las entradas son las que la persona vio.** La semana son los
siete días de la grilla que estaba mirando, aunque un admin haya cambiado su
primer día de la semana mientras la pantalla estaba abierta (TS-112). El pedido
lleva los ids de las entradas que la grilla leyó para la fila, y el servidor
borra solo las que al confirmar siguen siendo cerradas, de la persona, de ese
par y de esos siete días. Lo que llegó a la fila después de la lectura —una
entrada agregada en otra pestaña, la de un timer detenido después— no se borra,
y la fila vuelve a aparecer con eso al revalidar; una entrada leída que ya no
es de la fila en esa semana —se movió de día o de proyecto, o cambió la zona
horaria (TS-111)— tampoco. Repetir el pedido después de una falla no borra nada
más (TS-92). Decisión del contrato del slice 13 (D13-6, con la corrección M1 de
su revisión), aceptada por el team-lead.
**Una fila con más de 200 entradas en la semana no se quita desde la
planilla.** El pedido lleva a lo sumo 200 ids, el mismo tope de las acciones en
masa del rastreador; con más, no se borra nada y el aviso de la pantalla dice
«Esta fila tiene más de 200 entradas en la semana; borralas por partes desde el
rastreador.», sin «Reintentar» (sección 14). **Es una divergencia con
Clockify**, que documenta que se borra todo el tiempo de la semana (sección
20). Decisión del team-lead del 2026-10-08, con la ronda 2 de la revisión del
contrato.
_No verificado_: qué hace Clockify si la fila cambia entre que se ve y que se
quita.
_Corregido el 2026-10-07, P-12_: el título era «Borrar una fila borra su semana»
y la acción era «Borrar fila», en un menú de la fila.
_Corregido el 2026-10-07, slice 13_: decía que la X borraba «**todas** las
entradas cerradas de la persona con ese proyecto y esa tarea cuyo `start` cae
en la semana», sin decir qué semana ni qué pasa con lo que llega a la fila
después de la lectura.
_Corregido el 2026-10-08, slice 13_: no tenía tope de entradas.

**TS-53 Con confirmación y sin deshacer** — `adaptar`
Documentado que Clockify permite deshacer: «Using the Undo feature
automatically restores deleted entries and all its data across the Time
Tracker, Timesheet, Calendar, and Detailed reports.» Acá, el diálogo de
confirmación de TT-61 y sin deshacer. Justificación: P-06 del rastreador. El
diálogo dice cuántas entradas se borran y cuántas horas suman, porque una fila
puede esconder entradas con descripciones que no se ven (TS-43). Cada entrada
borrada deja su copia en el audit log.

**TS-54 Quitar una fila no toca el timer** — `replicar`
Quitar la fila del proyecto y la tarea del timer borra sus entradas cerradas y
no detiene ni borra la que corre, que no está en la planilla (TS-49). El diálogo
cuenta solo las cerradas. El timer sigue corriendo y su entrada aparece en la
celda al detenerse.
Verificado en el workspace (2026-10-07), respuesta D: quitar esa fila no
detiene el timer. Decisión del equipo del 2026-10-07.
_Corregido el 2026-10-07, P-12_: el título era «La entrada que corre no se borra
con la fila», `adaptar`: el diálogo lo avisaba y la fila seguía en la grilla con
el transcurrido.

## 10. Copiar la semana pasada

**Toda la sección queda `fuera de alcance` de la fase 1.** Verificado en el
workspace (2026-10-07), respuestas 10, 11, 13 y H: «Copiar la semana pasada»
está debajo de la grilla, con una flecha de desplegable, y desactivado, también
con horas en la semana anterior; parece del plan. Decisión del equipo del
2026-10-07. Justificación común: en el plan del workspace no se puede usar, así
que no se puede relevar.

Lo documentado se conserva como referencia para cuando se pueda relevar. Las
propuestas que esta sección tenía —filas vacías para «solo actividades», una
copia por entrada con las mismas horas de pared siete días después, sin
«Reintentar»— quedan en el historial del archivo, y timesheet P-08 y P-10 se
cierran sin objeto.

**TS-55 Dos variantes** — `fuera de alcance`
Documentado: «Click the **Copy last week** button on the bottom» y elegir entre
«Copy activities only – Imports the projects/tasks list» y «Copy activities and
time – Imports the projects/tasks list and time logged for those entries».
Justificación: desactivado en el plan del workspace.

**TS-56 Solo con la semana vacía** — `fuera de alcance`
Documentado, textual: «The Copy Last Week option only works if your current
week is completely empty. If you've already added time to even one cell, the
button will be grayed out.» Justificación: desactivado en el plan del
workspace.

**TS-57 Solo si la semana anterior tiene horas** — `fuera de alcance`
Documentado: «If you didn't track any time during the previous week, there's
nothing to copy», y «The button won't appear if the previous week is empty.»
Justificación: desactivado en el plan del workspace; además, la respuesta H lo
vio desactivado y no oculto con horas en la semana anterior.

**TS-58 Lo que ya no está disponible no se copia** — `fuera de alcance`
Documentado: «If some time entries couldn't be copied, it's likely because one
or more projects or tasks have been archived or deleted since last week.»
Justificación: desactivado en el plan del workspace.

**TS-59 «Solo actividades»** — `fuera de alcance`
Justificación: desactivado en el plan del workspace.

**TS-60 «Actividades y tiempo»** — `fuera de alcance`
Justificación: desactivado en el plan del workspace. La documentación dice
«time logged for those entries» y no dice cómo; la pregunta 10 de P-12 no se
pudo responder.

**TS-61 El requisito del período de aprobación semanal** — `fuera de alcance`
Documentado: «The Copy Last Week feature only works when your workspace uses a
weekly approval period», y lo mismo para plantillas. Justificación: el período
de aprobación es un ajuste de aprobaciones, que son de plan pago y no se
relevan (TS-68). Acá el período es siempre la semana. Verificado en el
workspace (2026-10-07), respuesta 11: la función no parece habilitada en el
plan; no se vio ningún período de aprobación.

_Corregido el 2026-10-07, P-12_: TS-55 a TS-58 eran `replicar`, TS-59 y TS-60
eran `adaptar`, como propuestas atadas a timesheet P-07 y P-08, y la sección
entraba en el slice 13 por timesheet P-10.

## 11. Plantillas

En el plan Free: la página de precios lista «save template timesheets» en Free.
Verificado en el workspace (2026-10-07): «Guardar como plantilla» está debajo de
la grilla y funciona (respuestas 12 y 13). Las reglas se mantienen y **van a la
fase 2** (timesheet P-09), decisiones del equipo del 2026-10-07.

**TS-62 Guardar una semana como plantilla** — `replicar`
Documentado: «You can save the time and tasks for a specific week as a
template», con «Save as template» abajo de la grilla. Verificado en el
workspace (2026-10-07), respuesta 12: «Guardar como plantilla» pide un nombre y
ofrece una casilla para guardar también el tiempo.
Acá igual: «Guardar como plantilla» pide un nombre —vacío, «Escribí un nombre.»,
como PF-35— y ofrece una casilla para guardar también el tiempo. Sin marcarla,
la plantilla guarda los pares `(proyecto, tarea)` de la semana; marcada, además
lo cargado.
_No verificado_: el texto de la casilla, y si con tiempo Clockify guarda el
total de cada celda o las entradas (timesheet P-15).
_Corregido el 2026-10-07, P-12_: decía que guardaba siempre los pares y lo
cargado en cada celda, y estaba sin verificar si pedía nombre.

**TS-63 Aplicar una plantilla** — `replicar`
Documentado: «The timesheet will automatically populate with the projects and
tasks from the template.» «Aplicar plantilla» trae sus filas y, si la plantilla
guardó el tiempo, sus horas, a la semana que se está mirando. Las filas sin
horas son filas vacías y las guarda el navegador (TS-19).
_No verificado_: el rótulo de Clockify en castellano.

**TS-64 Aplicar sobre una semana con horas** — `replicar`
Documentado, textual: «Add – Incorporate time entries from the template with
existing ones», «Replace – Overwrite existing time entries with the template's
entries», «Skip – Ignore cells where time already exists». Verificado en el
workspace (2026-10-07), respuesta I: aplicar una plantilla sobre una semana con
horas agrega entradas nuevas.
«Agregar» crea entradas nuevas y no toca las que hay: no reescribe la celda.
«Reemplazar» borra entradas existentes y pide la confirmación de TT-61 con el
conteo de TS-53. «Omitir» deja como están las celdas con horas.
_No verificado_: si el workspace ofreció elegir entre agregar, reemplazar y
omitir, o si agregar es lo único —la respuesta I no lo dice—, y a qué hora
empiezan las entradas que crea la plantilla (timesheet P-15).
_Corregido el 2026-10-07, P-12_: el título era «Conflictos: agregar, reemplazar u
omitir» y estaba sin verificar si «agregar» sumaba una entrada o reescribía la
celda.

**TS-65 Las plantillas son personales** — `replicar`
Documentado, textual: «Timesheet templates are accessible only to the user who
created them.» Ninguna otra persona las ve, ni un admin.

**TS-66 Lo no disponible no se aplica** — `replicar`
Documentado en las aplicaciones móviles: «If you apply a template with projects
that are deleted, archived, or you have no access to them, those projects won't
be inserted in the timesheet from the template.» Al terminar, un aviso
informativo dice cuántas filas no se aplicaron y por qué.

**TS-67 Plantillas quincenales o mensuales** — `fuera de alcance`
Documentado en la aplicación de iOS: «Depending on the approval period set up
in the Workspace settings, timesheet templates can be created for weekly,
semi-monthly and monthly time period.» Justificación: depende del período de
aprobación, que es pago (TS-61).

TS-62 … TS-66 son relevables y están marcados `replicar`, y **van a la fase 2**
(timesheet P-09, decisión del equipo del 2026-10-07): traen una tabla nueva y
«Reemplazar» es destructivo. Con la copia fuera de alcance (sección 10), son la
única forma de repetir una semana; lo verificado queda escrito para cuando
lleguen.
_Corregido el 2026-10-07, P-12_: la fase estaba pendiente de timesheet P-09, con
la fase 2 como propuesta, y el argumento decía que «copiar semana anterior»
cubría el uso más frecuente. TS-66 remitía al aviso de TS-58, que quedó fuera
de alcance.

## 12. Lo que el plan Free deja fuera

**TS-68 Enviar a aprobación e íconos de estado** — `fuera de alcance`
Documentado: el Timesheet muestra un tilde verde para lo aprobado —«The entry
is locked and cannot be edited or deleted»—, uno naranja para lo pendiente y
nada para lo no enviado o rechazado, y se envía a aprobación desde la misma
pantalla. Justificación: aprobaciones es pago, no relevable (P-02 del
rastreador).

**TS-69 Bloqueo de timesheets** — `fuera de alcance`
Documentado: «Locking timesheets prevents team members from adding new time
entries or editing old ones for a specific period», y en la grilla «You'll see
a message saying the date is locked on the timesheet». Justificación: pago, no
relevable (P-02 del rastreador, TT-67).

**TS-70 Cargar horas de otra persona: «Compañeros»** — `fuera de alcance`
Documentado: el botón «Teammates» abre el Timesheet de otra persona para
editarlo, y es pago. Verificado en el workspace (2026-10-07), respuestas 13 y K:
arriba a la derecha hay un desplegable «Compañeros» y le aparece al admin para
ver y editar las horas de los demás. Justificación: fuera de la fase 1 por
decisión del equipo del 2026-10-07; contradice TS-05.
_Corregido el 2026-10-07, P-12_: la justificación era solo que es pago.

**TS-71 Forzar timer** — `fuera de alcance`
Documentado: «The Force timer feature can be used to disable time entry via the
Timesheet completely [...] the Timesheet can only be used for reviewing
entries». Justificación: pago (TT-84, P-01 del rastreador).

**TS-72 Campos obligatorios** — `fuera de alcance`
Documentado: «Timesheet won't let you add time without selecting a tag» cuando
la etiqueta es obligatoria. Justificación: pago (TT-84, P-01 del rastreador).
Es la regla que, si algún día entra, choca con TS-29: una celda no tiene dónde
elegir etiqueta antes de crear la entrada.

**TS-73 Duración decimal** — `fuera de alcance`
La columna «decimal» de la tabla de TS-25. Justificación: pago, ya decidido en
PF-20.

**TS-74 Exportar e imprimir** — `fuera de alcance`
Documentado: se imprime con el navegador o se exporta desde el reporte semanal.
Justificación: los reportes son de otra fase; no se agrega una hoja de estilos
de impresión.

## 13. Permisos

**TS-75 Los cinco roles sobre lo propio** — `replicar`
Igual que en el rastreador (TT-66): `owner`, `admin`, `project_manager`,
`team_manager` y `member` escriben celdas y quitan filas sobre sus propias
entradas, con las acciones `timeEntry.own.*` que ya existen. Las plantillas,
que van a la fase 2, necesitan su acción propia.
_Corregido el 2026-10-07, P-12_: decía también que copiaban semanas y usaban
plantillas.

**TS-76 Membresía que no está activa: solo lectura** — `adaptar`
La grilla se dibuja con los valores y sin ningún control de escritura, con el
aviso permanente de TT-92. Un pedido que llegue igual recibe el mensaje neutro
de TT-79. Justificación: `membership_status` es nuestro modelo.
**Sin permiso de carga, las celdas no tienen menú** (TS-40) y no hay detalle en
solo lectura, a diferencia del calendario (CAL-05): las descripciones se siguen
viendo en el rastreador y el calendario. Decisión del contrato del slice 13b
(D13b-4), aceptada por el team-lead: un detalle en solo lectura sería una
variante nueva que ninguna regla pide.
_Corregido el 2026-10-08, slice 13b_: no decía qué pasa con el menú de la
celda.

## 14. Validaciones y mensajes

Los mensajes son nuestros; lo que se replica es la regla. Los que ya existen se
reusan por la regla de una redacción por causa.

| ID    | Regla                                                          | Mensaje                                                       | Marca      |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| TS-77 | Celda nueva en un proyecto inexistente, archivado o sin acceso | «Ese proyecto ya no está disponible.» (TT-77)                 | `adaptar`  |
| TS-78 | Celda nueva en una tarea inexistente, hecha o de otro proyecto | «Esa tarea ya no está disponible.» (PR-74)                    | `adaptar`  |
| TS-79 | Varias entradas: baja a menos de un minuto o alta en otro día  | «Editá las entradas de esta celda desde el detalle.»          | `adaptar`  |
| TS-80 | Retirada el 2026-10-07 (TS-50)                                 | —                                                             | —          |
| TS-81 | Día anterior al 1 de enero de 2000                             | «No se pueden cargar horas anteriores al 1 de enero de 2000.» | `adaptar`  |
| TS-82 | Duración ilegible, menor que un minuto o de 24 horas o más     | — (la celda vuelve al valor anterior, TT-21)                  | `adaptar`  |
| TS-83 | La entrada del detalle ya no existe                            | «Esa entrada ya no existe.» (TT-80)                           | `adaptar`  |
| TS-84 | Membresía que no puede escribir                                | «No tenés permiso para hacer esto.» (TT-79)                   | `replicar` |
| TS-85 | Retirada el 2026-10-07 (sección 10)                            | —                                                             | —          |
| TS-86 | Tarea sin proyecto                                             | «Elegí un proyecto antes que una tarea.» (TT-70)              | `replicar` |

Justificación de los `adaptar`: los textos son nuestros, como en la sección 7
de `time-tracker.md`; la regla de TS-79 es además una decisión de este
documento. Detalle:

- **TS-77 y TS-78** responden también subir una celda con varias entradas de un
  par que ya no se ofrece, porque eso es un alta (TS-21, TS-34).
- **TS-79** es una causa nueva, con dos casos y un solo remedio —editar una por
  una las entradas de la celda—, que no es el de ninguna otra: la baja que
  dejaría la entrada que empieza más tarde en menos de un minuto y el alta que
  caería en otro día (TS-34). El mensaje dice dónde se hace eso: «Editá las
  entradas de esta celda desde el detalle.», y el menú de esas celdas, que
  tienen varias entradas, ofrece «Ver detalle» (TS-40, TS-42). El aviso queda en
  la pantalla y no abre el detalle solo. La causa tiene un solo texto a la vez.
  Decisión del contrato del slice 13b (§1, §4.1, §5.5).
- **TS-80** quedó sin uso: la planilla no escribe sobre la entrada que corre
  (TS-50). Un pedido de edición de horas sobre ella armado a mano lo responde la
  mutación de horas con TT-111. El identificador no se reusa.
- **TS-82**: en la interfaz no sale pedido (TS-27, TS-35). Un pedido armado a
  mano con menos de un minuto recibe «La entrada tiene que durar al menos un
  minuto.» (TT-73), y uno de 24 horas o más, la validación del payload.
- **TS-83** sale de «Guardar» en el editor (TS-41) o de confirmar un borrado
  sobre una entrada que se borró en otra pestaña. El aviso se titula «No se pudo
  guardar la entrada.» o «No se pudo borrar la entrada.», con el mensaje y,
  debajo, la entrada y su horario; se ve en la pantalla —o en la lista, si está
  abierta sobre esa celda (TS-42)— y sin «Reintentar», y el editor se cierra,
  como en el calendario (CAL-72). Reintentar por red un borrado cuya respuesta
  se perdió responde este mismo mensaje: es el desenlace real, como en el
  rastreador. Decisión del contrato del slice 13b (§4.3, §5.5), aceptada por el
  team-lead.
- **TS-85** quedó sin uso con la copia fuera de alcance (sección 10). El
  identificador no se reusa.
- **TS-86** no tiene camino en la interfaz —el selector de la fila no deja
  elegir una tarea sin su proyecto—; es la validación del payload.
- **Quitar una fila con más de 200 entradas en la semana** (TS-52) es una causa
  nueva, con su texto: «Esta fila tiene más de 200 entradas en la semana;
  borralas por partes desde el rastreador.», sin «Reintentar». No reusa «Se
  pueden elegir hasta 200 entradas a la vez.», el del tope de la selección en
  masa del rastreador, porque acá la persona no eligió ninguna entrada.
  Decisión del team-lead del 2026-10-08.

_Corregido el 2026-10-07, piso fijo_: la fila de TS-81 decía, en la regla, «Día
anterior a la creación del workspace» y, en el mensaje, «No se pueden cargar
horas anteriores a la creación del workspace.» (ADR 0005). El piso pasó a ser
una fecha fija (TS-12), por decisión del equipo.
_Corregido el 2026-10-07, P-12_: TS-79 era «Escribir una celda con varias
entradas», con «Esta celda tiene varias entradas: editalas desde el detalle.»;
TS-80 era «Escribir la celda del timer activo», con «Esta entrada es la que
está corriendo.» (TT-111); TS-82 decía «Duración ilegible o de 24 horas o más»;
TS-85 era «Copiar sobre una semana que ya tiene horas», con «Esta semana ya
tiene horas cargadas.».
_Corregido el 2026-10-07, slice 13_: la regla de TS-79 era «Varias entradas:
baja que vaciaría la última o alta en otro día», y el mensaje, «Editá las
entradas de esta celda desde el detalle.» desde el slice 13. No había detalle
de TS-77 y TS-78.
_Corregido el 2026-10-08, slice 13_: no estaba el texto del tope de TS-52.
_Corregido el 2026-10-08, slice 13b_: el mensaje de TS-79 era «Editá las
entradas de esta celda desde el rastreador.», el del slice 13, y su detalle
decía que el 13b lo cambiaba a «… desde el detalle.». No había detalle de
TS-83.

## 15. Estados vacíos

**TS-87 Semana sin horas y sin filas** — `adaptar`
La grilla se dibuja con las siete columnas y sin filas, con «No hay horas
cargadas esta semana» y «Añadir nueva fila». Justificación: copia propia;
Clockify no documenta el estado vacío.
_Corregido el 2026-10-07, P-12_: ofrecía también «Copiar semana anterior», y el
botón de fila era «Agregar fila».

**TS-88 Workspace sin proyectos** — `adaptar`
El selector de la fila abre con «No hay proyectos todavía» y el enlace a la
pantalla de proyectos, igual que TT-87 y PR-85, con la misma justificación. Con
TS-20, la fila «Sin proyecto» se puede agregar igual, salvo que ya sea fila en
la semana: entonces el selector no la ofrece (TS-18) y el vacío sigue siendo
este. **Sin ningún proyecto para ofrecer, gana este vacío**: «Todas las
combinaciones ya tienen fila esta semana.» (TS-18) es solo para cuando hay
proyectos para ofrecer y todo está excluido. Decisión del team-lead del
2026-10-08, con la ronda 2 de la revisión del contrato.
_Corregido el 2026-10-08, slice 13_: decía que la fila «Sin proyecto» se podía
agregar igual, sin exceptuar que ya fuera fila, y no decía qué vacío gana.

**TS-89 Primera semana de uso** — `fuera de alcance`
Era la consecuencia de TS-57 sobre la primera semana: sin semana anterior con
horas, la copia no se dibujaba. Justificación: la copia quedó fuera de la fase
1 (sección 10) y no queda nada que dibujar.
_Corregido el 2026-10-07, P-12_: era `replicar`.

**TS-90 Semana entera anterior al 1 de enero de 2000** — `adaptar`
Se dibuja vacía y en solo lectura, sin «Añadir nueva fila» (TS-12). Solo se
llega navegando a 1999 o antes. Justificación: es el piso fijo de TS-12.
_Corregido el 2026-10-07, piso fijo_: el título era «Semana entera anterior a
la creación del workspace» y la justificación, «es el piso del ADR 0005». El
piso pasó a ser una fecha fija (TS-12).
_Corregido el 2026-10-07, P-12_: decía «sin «Agregar fila» ni «Copiar semana
anterior»».

## 16. Estados de error

**TS-91 Falla de red al escribir una celda** — `adaptar`
La celda vuelve a su valor anterior y el aviso ofrece «Reintentar» (TT-89),
porque la escritura es idempotente (TS-37). Título del aviso por TT-90: «No se
pudo guardar la celda.» Justificación: la de TT-89.

**TS-92 Falla de red al quitar una fila** — `adaptar`
El aviso ofrece «Reintentar»: repetirlo sobre una fila ya quitada no borra nada
más. Justificación: la de TT-89.
_Corregido el 2026-10-07, slice 2c_: la copia decía «(TS-60, TT-109)» y la
justificación era «la de TT-89 y TT-109». Con el slice 2c TT-109 dejó de ser
una excepción y la copia se sostiene por la suya (TS-60).
_Corregido el 2026-10-07, P-12_: el título era «Falla de red al borrar una fila o
copiar una semana» y la copia no ofrecía «Reintentar»; la copia quedó fuera de
alcance.

**TS-93 La celda cambió en otra pestaña** — `adaptar`
Como el servidor decide con el estado de la celda en ese momento (sección 5):
si la celda pasó a tener varias entradas, aplica TS-34 —subir agrega, bajar
achica la que empieza más tarde— o rechaza con TS-79, y la grilla se refresca;
si la entrada se borró, la celda está vacía y la escritura crea una (TS-29); si
el timer que corría en esa celda se detuvo, su entrada cuenta como una más. En
todos los casos la celda queda en lo que la persona pidió, salvo el rechazo.
Justificación: es la consecuencia de modelar la celda como un valor y no como
una diferencia.
_Corregido el 2026-10-07, P-12_: una celda que pasaba a tener varias entradas
rechazaba la escritura con TS-79.

**TS-94 Sesión vencida y membresía desactivada** — `adaptar`
TT-91 y TT-92 sin cambios, con su justificación.

## 17. Al recargar

**TS-95 La grilla se arma en el servidor** — `replicar`
La semana de la URL (TS-10), las filas que salen de las entradas (TS-14), las
celdas y los totales se calculan en el servidor con la zona horaria y el inicio
de semana de la persona. Lo único que pone el navegador son las filas vacías
que guarda (TS-19), que se suman a las del servidor al dibujar.
_Corregido el 2026-10-07, P-12_: incluía el timer activo entre lo que se
calculaba y decía que no había estado del cliente que reconstruir.

**TS-96 Lo que se pierde al recargar** — `adaptar`
Lo tecleado en una celda que todavía no perdió el foco, y el detalle abierto con
lo que no se guardó en su editor (TS-41), como al cerrarlo (CAL-67). Las filas
vacías no se pierden en el mismo navegador (TS-19). Justificación: guardar al
perder el foco (TS-28) y con «Guardar» (TS-41) no deja borradores.
_Corregido el 2026-10-07, P-12_: decía que se perdían también las filas vacías,
incluidas las de «Solo actividades», con la justificación de TS-19.
_Corregido el 2026-10-08, slice 13b_: no nombraba el detalle abierto.

**TS-97 Otra pestaña con la misma semana** — `adaptar`
Se actualiza con la revalidación de TT-40: al enfocar, al volver a ser visible
y cada 60 segundos. Justificación: no hay canal abierto (TT-40).

## 18. Teclado y accesibilidad

La documentación dice una sola cosa: Enter guarda (TS-28). Lo demás lo decidieron
los contratos de los slices 13 y 13b (TS-98, TS-99), con una justificación común:
una grilla de carga rápida que no se recorre con el teclado no cumple su
propósito.
_Corregido el 2026-10-08, slice 13b_: decía «Lo demás es propuesta».

**TS-98 Recorrido con Tab y foco después de Enter** — `adaptar`
Tab y Mayús+Tab recorren las celdas por fila, de izquierda a derecha y de
arriba abajo. **El menú de cada celda con entradas está en el recorrido,
después de su campo** (TS-99): Tab desde el campo lleva a «Acciones de la celda
…» y el siguiente, al próximo control de la fila. Decisión del contrato del
slice 13b (§5.1), aceptada por el team-lead. Enter guarda y baja a la celda del
mismo día en la fila siguiente; en la última fila, el foco se queda en la celda
guardada.
Verificado en el workspace (2026-10-07), respuesta 15: al guardar con Enter,
Clockify no deja ninguna celda con foco. Decisión del equipo del 2026-10-07: el
foco no se pierde. Justificación: sin foco, quien usa el teclado vuelve al
principio de la página; bajar a la fila siguiente es la convención de una
planilla de cálculo y deja el foco en la grilla.
_Corregido el 2026-10-07, P-12_: estaba sin verificar qué hacía Clockify con el
foco, y no decía qué pasaba en la última fila.
_Corregido el 2026-10-08, slice 13b_: el recorrido no nombraba el menú de la
celda.

**TS-99 El menú de la celda con el teclado** — `adaptar`
El botón de tres puntos de TS-40 es enfocable y está en el orden de tabulación
después de su celda; no aparece solo al pasar el puntero.

**TS-100 La grilla es una tabla** — `adaptar`
Se marca como tabla con encabezados de fila —proyecto y tarea— y de columna
—día—, y cada celda editable tiene un nombre accesible que dice las dos cosas:
«Rediseño: Maquetado, miércoles 01/10». **Los totales no llevan un rótulo
propio**: toman su nombre de los encabezados de la tabla, con `scope` en cada
encabezado. El total de un día se nombra por el encabezado de fila «Total» y el
de columna de su día; el de una fila, por la fila y el encabezado de columna
«Total»; el de la semana, por los dos «Total». Decisión del contrato del slice
13 (D13-12), aceptada por el team-lead: un `aria-label` en una celda de tabla
no lo anuncian todos los lectores de pantalla de la misma forma, y los
encabezados dicen lo mismo.
_Corregido el 2026-10-07, slice 13_: cada total tenía un rótulo propio, como
«Total del miércoles 01/10».

**TS-101 Los atajos del rastreador no se aplican** — `adaptar`
`n`, `c`, `s` y `m` (TT-26) son del rastreador y en esta pantalla no hacen nada:
sus acciones no existen acá (TS-51). Justificación adicional: en una grilla de
números, una letra perdida no puede arrancar un timer.

## 19. Casos borde

No llevan marca propia: heredan la del comportamiento que citan.

| ID     | Caso                                                                | Comportamiento esperado                                                                                                                                 |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-102 | Entrada que cruza la medianoche                                     | Cuenta entera en la celda del día de su `start` (TT-95); la celda puede pasar de 24 horas.                                                              |
| TS-103 | Entrada que cruza el fin de semana                                  | Cuenta entera en la semana de su `start` (TT-96).                                                                                                       |
| TS-104 | Celda de una sola entrada de más de 24 horas                        | Se muestra con su total. Escribir un valor la achica (TS-33); no se puede agrandar desde la celda por TS-26.                                            |
| TS-105 | Escribir `1:30` sobre una entrada del timer de `1:30:42`            | Son los mismos minutos: no se escribe nada (TS-36). Con el completo, el campo vuelve a `01:30:42`.                                                      |
| TS-106 | Escribir `2:00` sobre esa misma entrada                             | El inicio se conserva con sus segundos y el fin pasa a inicio más dos horas: la celda muestra `2:00` (TS-32, TS-33).                                    |
| TS-107 | Escribir en una celda de un día con cambio de horario               | La celda muestra lo escrito: el fin es inicio más duración (TS-32). Las horas de pared de la entrada pueden no cuadrar con la resta visual, como TT-97. |
| TS-108 | Escribir en una celda de un día futuro                              | Se acepta (TS-11, TT-76).                                                                                                                               |
| TS-109 | Dos celdas del mismo día en filas distintas                         | Dos entradas que empiezan a la misma hora y se superponen (TS-31, TS-38).                                                                               |
| TS-110 | Enter y pérdida de foco, o dos pestañas, sobre la misma celda vacía | Queda una sola entrada (TS-37).                                                                                                                         |
| TS-111 | La persona cambia su zona horaria                                   | Ningún instante se toca; las entradas pueden cambiar de celda y de semana (PF-38).                                                                      |
| TS-112 | Un admin cambia el primer día de la semana de la persona            | Ninguna entrada se mueve; cambian las columnas y los totales de la semana (PF-40, PF-41).                                                               |
| TS-113 | Proyecto archivado mientras se edita la grilla                      | Escribir una celda de una entrada y bajar una con varias sigue; subir una con varias o una vacía responde TS-77 y la grilla se refresca (TS-21).        |
| TS-114 | Proyecto borrado con su fila en pantalla                            | Al refrescar, sus horas pasan a «Sin proyecto» (TS-22).                                                                                                 |
| TS-115 | Mover desde el detalle una entrada de día, de semana o de par       | Sale de su celda con la próxima lectura; una fila del servidor que queda vacía sale y el foco va como en TS-35; una fila agregada, no (TS-15).          |
| TS-116 | Celda con una entrada cerrada y el timer activo                     | La celda muestra solo la cerrada y escribirla la edita (TS-33); el timer no se toca (TS-49, TS-50).                                                     |
| TS-117 | Copiar la semana pasada con el timer corriendo                      | Fuera de alcance de la fase 1 (sección 10).                                                                                                             |
| TS-118 | Entrada de cero minutos del timer (TT-101)                          | Cuenta como entrada: la celda muestra `0:00`, no vacía. Para TS-34 es una más; si es la que empieza más tarde, toda baja responde TS-79.                |
| TS-119 | Subir una celda cuya entrada que termina más tarde termina otro día | Se rechaza sin escribir, con TS-79: la celda no cambia y un reintento no vuelve a sumar (TS-34, TS-37).                                                 |
| TS-120 | La entrada que empieza más tarde no es la que termina más tarde     | Subir: la nueva empieza en el fin de la que termina más tarde y copia la que empieza más tarde. Bajar: achica la que empieza más tarde (TS-34).         |

_Corregido el 2026-10-07, P-12_: TS-113 decía «las celdas con una entrada»;
TS-116 decía que la celda tenía dos entradas y valían TS-34 y TS-50; TS-117
decía que el botón de copiar estaba deshabilitado (TS-56); TS-118 terminaba en
«para TS-34 es una entrada más». TS-119 y TS-120 son nuevos.
_Corregido el 2026-10-07, slice 13_: TS-113 decía «Las celdas con entradas se
siguen escribiendo; las vacías responden TS-77 y la grilla se refresca
(TS-21).».
_Corregido el 2026-10-08, slice 13b_: TS-115 era «Mover desde el detalle una
entrada a otro día», con «Cambia de celda; si el día queda fuera de la semana,
sale de la grilla y la fila puede quedar sin entradas y desaparecer.», sin el
cambio de par, sin distinguir la fila agregada en esta carga y sin decir adónde
va el foco.
_Corregido el 2026-10-20, WS2a_: TS-105 decía «Es igual a lo que se ve», que
con el completo no vale (TS-36).

## 20. Divergencias que este documento registra

Juntas, para que el equipo las vea de una vez. Desde el 2026-10-07 están todas
decididas.

| ID    | Contra qué                         | Qué                                                                                                         | Estado                           |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| TS-01 | Clockify, documentado              | La planilla no tiene interruptor.                                                                           | Decidida el 2026-10-07           |
| TS-02 | Clockify, documentado y verificado | Activar la planilla no vuelve obligatorio el proyecto.                                                      | Decidida el 2026-10-07           |
| TS-18 | Clockify, verificado               | El selector no ofrece una combinación de proyecto y tarea que ya es fila.                                   | Decidida el 2026-10-07           |
| TS-32 | ADR 0005, regla interna            | El fin de lo que escribe una celda es inicio más duración: un tercer camino de instantes que el ADR cierra. | Decidida el 2026-10-07; ADR 0018 |
| TS-34 | Clockify, verificado en parte      | La baja que deja la que empieza más tarde en menos de un minuto y el alta en otro día se rechazan.          | Decidida el 2026-10-07           |
| TS-52 | Clockify, documentado              | Una fila con más de 200 entradas en la semana no se quita desde la planilla.                                | Decidida el 2026-10-08           |
| TS-53 | Clockify, documentado              | Quitar una fila pide confirmación y no se deshace.                                                          | Decidida por P-06 del rastreador |
| TS-98 | Clockify, verificado               | Después de Enter el foco sigue en la grilla.                                                                | Decidida el 2026-10-07           |

El [ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md)
está propuesto por el contrato del slice 13 y aceptado el 2026-10-08 por el usuario.

_Corregido el 2026-10-07, P-12_: TS-34 era «una celda con varias entradas no se
escribe desde la grilla», como divergencia probable; TS-39 era una divergencia
contra TT-30 y pasó a `replicar`, porque Clockify deja escribir con un timer
corriendo. Se suman TS-01, TS-18 y TS-98.
_Corregido el 2026-10-07, slice 13_: la fila de TS-34 decía «La baja que
vaciaría la entrada que empieza más tarde y el alta que caería en otro día se
rechazan.» (D13-4), y la de TS-32, «Decidida el 2026-10-07; falta el ADR».
_Corregido el 2026-10-08, slice 13_: se suma TS-52, el tope de 200 entradas al
quitar una fila.

## 21. Reparto

El slice 13 del mapa depende de los slices 7 y 10. Este documento agrega dos
dependencias que el mapa no nombra, las dos ya antes en el orden:

- **Del slice 3 y del 8c**: el detalle de una celda (TS-41) es el diálogo de una
  entrada del calendario, del slice 8c, que edita horas y fecha con las reglas
  de la fila del rastreador del slice 3, con TT-110.
- **Del slice 11**: el facturable por defecto de la entrada nueva (TS-30), las
  etiquetas y el facturable que copia TS-34, y las etiquetas del detalle
  (TS-41). Si el slice 13 se adelantara, la entrada nacería no facturable y
  habría que volver a tocarla.

| Dónde                        | Qué                                                                      |
| ---------------------------- | ------------------------------------------------------------------------ |
| Slice 13                     | TS-01 … TS-120, salvo TS-80 y TS-85, retiradas, y lo de las otras filas  |
| Slice 13b                    | TS-40 … TS-42, TS-76, TS-83, TS-98, TS-99, TS-115 y el «Borrar» de TS-35 |
| Fase 2                       | TS-62 … TS-66 (plantillas), por timesheet P-09                           |
| Fuera de la fase 1, por plan | TS-55 … TS-61, TS-89 y TS-117 (copiar la semana pasada)                  |
| Nunca                        | TS-03, TS-67 … TS-74                                                     |

**El slice 13 no cambia el esquema.** Las celdas y las filas se resuelven con
`time_entry` tal como queda después del slice 11, y las filas vacías, en el
navegador (TS-19). Lo que sí trae son dos mutaciones nuevas en `time-entry`
—escribir una celda (TS-29 … TS-39) y quitar una fila (TS-52 … TS-54)— y dos
ADR propuestos por su contrato y aceptados por el usuario el 2026-10-08: el
[ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md)
(TS-32) y el [ADR 0019](../adr/0019-escribir-una-celda-fija-su-valor.md)
(TS-37). El 13b no tiene mutaciones nuevas: su lectura de la semana suma las
entradas.
_Corregido el 2026-10-07, P-12_: el slice 13 llevaba TS-55 … TS-60, la copia se
resolvía con `time_entry`, y el esquema cambiaba solo si timesheet P-09 traía
las plantillas.
_Corregido el 2026-10-07, slice 13_: la tabla tenía una sola fila para el slice
13, «TS-01, TS-02, TS-04 … TS-54, TS-75 … TS-120, salvo TS-80, TS-85, TS-89 y
TS-117», sin el 13b; el párrafo decía «una mutación nueva» y que la excepción
al ADR 0005 tenía que estar escrita antes del contrato.
_Corregido el 2026-10-08, slice 13b_: la dependencia era solo del slice 3 y
decía que el detalle era «la edición de horas y fecha de una fila del
rastreador, con TT-110 y TT-111»; el párrafo decía que el 13b no tenía backend
nuevo.

### Slice 13 — la grilla y su escritura

Lo que la tabla le asigna. Entran por arrastre, verificados por el camino nuevo,
TT-19 y TT-21, TT-55, TT-61, TT-73, TT-77, TT-79, TT-89, TT-90, TT-92 y TT-97;
de [la paridad de proyectos](proyectos.md), PR-23, PR-47, PR-64, PR-66 y PR-71.
De acá salen el
[ADR 0018](../adr/0018-lo-que-escribe-una-celda-se-calcula-en-instantes.md)
(TS-32) y el [ADR 0019](../adr/0019-escribir-una-celda-fija-su-valor.md)
(TS-37), **aceptados por el usuario el 2026-10-08**. Contrato:
[fase1-slice13-planilla.md](../slices/fase1-slice13-planilla.md), con las
correcciones de la [ronda 1](../slices/correcciones-fase1-slice13.md) y la
[ronda 2](../slices/correcciones-fase1-slice13-ronda2.md).

- **Escribir una celda es dejarla en un valor** (sección 5): el pedido lleva el
  día, el par y los minutos, sin id ni lo que la pestaña vio; el servidor
  bloquea la celda, la lee y decide (TS-37, D13-2). Como `S` es lo que la celda
  muestra (TS-34, D13-3), después de escribir la celda muestra `V` y repetir el
  pedido no escribe nada.
- **Los instantes** (TS-32): el fin es el inicio más la duración; el inicio de
  una celda vacía, las 09:00 o el primer minuto que exista después ese día
  (TS-31). Si desde las 09:00 no existe ninguno, se rechaza; pasa en
  `Pacific/Apia` y `Pacific/Fakaofo` el 2011-12-30, al que no se llega
  navegando (CAL-17): solo desde una pestaña abierta antes de cambiar la zona
  (TS-111), hasta que se revalida, o con un pedido armado.
- **Subir una celda con varias entradas es un alta** (TS-21, TS-34, D13-5), y
  **la baja que dejaría la que empieza más tarde con menos de un minuto se
  rechaza** (TS-34, D13-4). Este rechazo y el del alta en otro día llevan el
  texto de TS-79 del 13: «Editá las entradas de esta celda desde el
  rastreador.».
- **Quitar una fila borra lo que la persona vio**: los siete días de su grilla
  y las entradas que leyó (TS-52, D13-6 con M1), hasta 200. Una fila con más
  no se quita desde la planilla y el aviso manda a borrar por partes desde el
  rastreador: es una divergencia con Clockify (sección 20).
- **El navegador guarda solo el par de las filas vacías**, por semana,
  workspace y persona (TS-19, D13-7, P-16).
- **Lo que el slice decide**, en su entrada:
  - Decisiones del contrato, aceptadas por el team-lead: TS-16 y TS-23
    (D13-10), TS-18 (D13-9), TS-19 (D13-7), TS-21 (D13-5), TS-34 (D13-3,
    D13-4, D13-5), TS-37 (D13-2), TS-52 (D13-6) y TS-100 (D13-12). Del
    team-lead: P-14 (TS-40, para el 13b), P-16 (TS-19), el tope de 200 de
    TS-52 y que el vacío de TS-88 gana al de TS-18 sin proyectos para ofrecer.
  - Propuestas de este documento que el contrato adopta: la columna de hoy
    resaltada (TS-08), el enlace «Esta semana» (TS-09), el orden de las filas
    (TS-15) y el gris del cero en los tres totales (TS-45).
  - _No verificado_ en Clockify, y queda así: TS-08 (hoy resaltado), TS-09
    (atajo a la semana en curso), TS-15 (orden), TS-16 (escribir antes de
    elegir, varias filas sin elegir), TS-24 (celda vacía o en cero), TS-31 (las
    09:00 que no existen), TS-34 (de qué entrada copia etiquetas y facturable,
    y las bajas que no entran), TS-45 (el gris de los totales de fila y de
    semana), TS-47 (el formato de la captura) y TS-52 (la fila que cambia entre
    que se ve y que se quita).
- **Afuera**: el menú de tres puntos y el detalle de una celda (slice 13b); el
  botón con ícono de lista de TS-09; un atajo que no sea Tab, Mayús+Tab, Enter
  y Esc (TS-98, TS-101); recordar qué celda tenía el foco después de una
  recarga.

### Slice 13b — el menú y el detalle de una celda

TS-40, TS-41, TS-42, TS-83, TS-99, TS-115 y el «Borrar» de TS-35, con P-14
cerrado: el menú de una celda con varias entradas no ofrece «Borrar». Entran
por arrastre, verificados por el camino nuevo, TT-12, TT-14, TT-54, TT-56,
TT-60, TT-61, TT-80, TT-89, TT-90 y TT-110; de
[la paridad del calendario](calendario.md), CAL-65 … CAL-68 y CAL-72. No cambia
el esquema, no tiene mutaciones nuevas ni ADR nuevo: el detalle guarda con
`updateEntry`
([ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md)) y
borra con `deleteEntry`, y la lectura de la semana suma las entradas de la
persona. Contrato:
[fase1-slice13b-detalle-de-celda.md](../slices/fase1-slice13b-detalle-de-celda.md),
con las correcciones de las rondas 1 y 2 en
[correcciones-fase1-slice13b-contrato.md](../slices/correcciones-fase1-slice13b-contrato.md).

- **El menú** (TS-40) existe con permiso de carga y entradas en la última
  lectura, y está inactivo mientras la celda tenga algo que esa lectura no trae
  (D13b-4, D13b-5); con una entrada ofrece «Editar» y «Borrar», con varias,
  «Ver detalle» (D13b-6). Está en el recorrido con Tab después del campo de su
  celda (TS-98, TS-99). Sin permiso de carga no hay menú (TS-76).
- **El editor** (TS-41) es el diálogo de una entrada del calendario: guarda todo
  junto con «Guardar» y no ofrece «Duplicar» (D13b-1, D13b-7).
- **La lista** (TS-42) se llama «Detalle de {celda}», sigue a la última lectura
  y abre el editor y la confirmación encima; con ella abierta, las fallas de su
  celda se ven en ella (D13b-2).
- **Borrar desde el menú** (TS-35) y **mover una entrada** (TS-115): la fila del
  servidor que se queda sin entradas sale y el foco va a «Añadir nueva fila»; la
  agregada en esta carga queda dibujada vacía.
- **TS-79** pasa a «Editá las entradas de esta celda desde el detalle.», y
  **TS-83** se ve con el título del pedido, sin «Reintentar» (sección 14).
- **Los pedidos del detalle no se muestran antes de tiempo** (D13b-3): la celda
  queda ocupada con su valor anterior hasta que llega la lectura con el cambio.
- **Lo que el slice decide**, en su entrada:
  - Decisiones del contrato, aceptadas por el team-lead: TS-35 (§5.6), TS-40
    (D13b-4, D13b-5, D13b-6), TS-41 (D13b-1, D13b-7), TS-42 (D13b-2), TS-76
    (D13b-4), TS-79 (§4.1), TS-83 (§4.3, §5.5), TS-98 (§5.1) y TS-115 (§5.7).
    TS-96 suma el detalle abierto, como consecuencia de TS-41.
  - Cambio de marca: **TS-41 pasa de `replicar` a `adaptar`**. Clockify
    documenta un pop-up y no cómo guarda; la forma y el guardado todo o nada
    vienen del calendario (calendario P-04), no de un relevamiento.
  - _No verificado_ en Clockify, y queda así: TS-40 (las demás opciones del
    menú y qué borra en una celda con varias), TS-41 (si el pop-up guarda campo
    por campo o con un botón, y si ofrece proyecto, tarea y fecha) y TS-42 (qué
    muestra con varias entradas).
- **Afuera**: agregar una entrada desde el detalle (TS-29, TS-34); duplicar
  desde la planilla (D13b-7); el detalle en solo lectura (D13b-4); editar o
  borrar varias entradas a la vez desde el detalle (TT-62 … TT-64).

_Corregido el 2026-10-08, slice 13b_: decía «No tiene backend nuevo: edita y
borra con las mutaciones que ya existen. Contrato propio cuando el 13 esté en
`main`; el esbozo está en la §9 del contrato del 13. **Con el 13b, el texto de
TS-79 pasa a «Editá las entradas de esta celda desde el detalle.»** (sección
14).».

## 22. Pendientes de definición del equipo

Numeración propia de este documento. Para no confundirla con la del rastreador,
la de proyectos ni la del perfil, se cita como `timesheet P-nn`.

### Abiertos

Ninguno bloquea el contrato del slice 13 ni el del 13b.

| ID   | Punto                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-15 | **Plantillas con tiempo** (TS-62, TS-64), para la fase 2: si guardan el total de cada celda o las entradas, y a qué hora empiezan las entradas que crea aplicarlas, sobre una celda vacía y sobre una con horas.                                                                                                                                                                                                 |
| P-18 | **El menú y el detalle de una celda en el workspace** (TS-40, TS-41, TS-42), para la sesión de verificación: las opciones del menú y qué borra en una celda con varias entradas; si el pop-up guarda campo por campo o con un botón, si ofrece proyecto, tarea y fecha, y qué hace al cerrarse con cambios; qué muestra con varias entradas. El 13b se construye con la decisión del contrato (TS-41 `adaptar`). |

### Cerrados

Se dejan con su identificador porque el documento, el mapa y los contratos los
citan. Todos se cerraron el 2026-10-07 con las respuestas de P-12 y las
decisiones del equipo.

| ID   | Decisión                                                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | La entrada que crea una celda vacía empieza a las 09:00 hora de pared, fija (TS-31, `replicar`). Clockify no tiene «inicio del día» en el perfil: se cierra también perfil P-02.                                                  |
| P-02 | El fin de lo que escribe una celda es inicio más duración, en instantes (TS-32). Se acepta; el ADR lo redacta `architect` antes del contrato del slice 13.                                                                        |
| P-03 | Una entrada: se edita su fin (TS-33, `replicar`). Varias: subir agrega, bajar achica la que empieza más tarde y la baja que la vaciaría se rechaza (TS-34, `adaptar`); el detalle, TS-42.                                         |
| P-04 | Vaciar una celda o escribir cero no borra: la celda vuelve al valor anterior (TS-35, `replicar`). Se borra desde el menú de la celda.                                                                                             |
| P-05 | Se escribe con un timer corriendo, también en su celda (TS-39, TS-50, `replicar`).                                                                                                                                                |
| P-06 | La fila «Sin proyecto» se mantiene, porque el proyecto sigue opcional (TS-02, TS-20).                                                                                                                                             |
| P-07 | La fila vacía la guarda el almacenamiento local del navegador, sin tabla de filas (TS-19, `replicar`).                                                                                                                            |
| P-08 | Sin objeto: «Copiar la semana pasada» queda fuera de la fase 1 (sección 10).                                                                                                                                                      |
| P-09 | Las plantillas (TS-62 … TS-66) van a la fase 2 y conservan sus reglas, con lo verificado.                                                                                                                                         |
| P-10 | «Copiar la semana pasada» no entra en el slice 13: está desactivado en el plan del workspace (sección 10).                                                                                                                        |
| P-11 | La planilla no tiene interruptor (TS-01) y no vuelve obligatorio el proyecto (TS-02).                                                                                                                                             |
| P-12 | Respondida en dos tandas. Lo que las respuestas no cubren sigue `_No verificado_` en su regla: TS-08, TS-09, TS-13, TS-15, TS-18, TS-19, TS-21, TS-23, TS-24, TS-31, TS-34, TS-35, TS-40, TS-42, TS-47, TS-62 … TS-64.            |
| P-13 | Subir una celda cuya entrada que termina más tarde termina otro día local se rechaza sin escribir, con TS-79, y la celda sigue idempotente (TS-34, TS-119).                                                                       |
| P-14 | El menú de una celda con varias entradas no ofrece «Borrar»; se borra entrada por entrada desde el detalle (TS-40, TS-42). Decisión del team-lead; se construye en el 13b.                                                        |
| P-16 | La fila vacía que guarda el navegador es de la semana en que se agregó y no aparece en las demás (TS-19). Decisión del team-lead.                                                                                                 |
| P-17 | La referencia de paridad es el workspace de la empresa, con el plan que tenga; lo verificado ahí vale. Queda como dato que «Compañeros» aparece (TS-70) aunque la documentación lo da como pago, y que la copia está desactivada. |

_Corregido el 2026-10-07, P-12_: P-01 a P-12 estaban abiertos. P-13 a P-17 son
nuevos; P-13 y P-17 se cerraron el mismo día.
_Corregido el 2026-10-07, slice 13_: P-14 y P-16 estaban abiertos: P-14 como
propuesta y P-16 sin probar.

### P-12, la lista de verificación

**Respondida el 2026-10-07.** Se conserva como registro de lo que se preguntó;
las respuestas están en la sección siguiente.

Todo se resuelve en una sentada con una cuenta del workspace y una semana de
prueba. Los cuatro primeros pueden cambiar reglas de la sección 5; el resto
corrige detalles.

1. **TS-31** — En una celda vacía escribir `1:00`, abrir el rastreador y mirar a
   qué hora empieza la entrada creada. Cambiar «Inicio del día» en el perfil y
   repetir en otra celda: ¿cambia la hora?
2. **TS-33** — Sobre una celda con una entrada de `1:00` hecha desde el
   rastreador, con descripción, escribir `2:00`: ¿se edita esa entrada —mismo
   inicio, fin una hora después, misma descripción— o aparece una segunda
   entrada de una hora?
3. **TS-34, TS-42** — Con dos entradas de `1:00` el mismo día y proyecto,
   escribir `3:00` en la celda y después `1:00`: ¿la celda deja escribir? ¿Qué
   entradas quedan, con qué horas? ¿Qué muestra el menú de tres puntos?
4. **TS-39, TS-49, TS-50, TS-54** — Con un timer corriendo en un proyecto:
   ¿aparece en su celda y suma? ¿Se puede escribir en otras celdas? ¿Y en la
   suya? ¿Qué pasa al borrar su fila?
5. **TS-25** — Escribir `8` en una celda vacía: ¿ocho minutos u ocho horas?
6. **TS-35** — Borrar el contenido de una celda con una entrada: ¿la borra?
   ¿Pide confirmación? ¿Ofrece deshacer?
7. **TS-18** — Con una fila `(Proyecto A, Tarea 1)`, agregar otra fila: ¿el
   selector ofrece `Proyecto A` con `Tarea 2`, o esconde el proyecto entero?
8. **TS-19** — Agregar una fila, no escribir nada y recargar: ¿la fila sigue?
9. **TS-20** — Con el timesheet activo, ¿el rastreador deja crear una entrada
   sin proyecto? Si hay alguna en la semana, ¿cómo aparece en la grilla?
10. **TS-60** — Copiar «actividades y tiempo» desde una semana con dos entradas
    en la misma celda y descripciones distintas: ¿quedan dos entradas con sus
    descripciones y sus horas, o una con la suma?
11. **TS-61** — En el workspace Free, ¿«Copy last week» está habilitado? ¿Hay
    algún período de aprobación visible en los ajustes?
12. **TS-62, TS-64** — Guardar una plantilla: ¿pide nombre? Aplicarla con
    «Add» sobre una celda con horas: ¿suma una entrada o reescribe la celda?
13. **TS-08, TS-09, TS-15, TS-44 … TS-46** — Captura de la pantalla con tres
    filas: rótulos de columna, si hoy se resalta, cómo se rotula el rango de la
    semana, si hay botón para volver a la semana en curso, en qué orden van las
    filas y dónde están los tres totales.
14. **TS-21, TS-23** — Archivar un proyecto con horas en la semana: ¿su fila
    sigue? ¿Sus celdas vacías dejan escribir? ¿Se puede cambiar el proyecto de
    una fila con horas?
15. **TS-51, TS-98** — ¿Hay algún control de timer en la pantalla? Al guardar
    con Enter, ¿a qué celda va el foco?
16. **TS-03** — ¿Aparece «Hide tracker» en los ajustes del workspace Free?

### P-12, respuestas del workspace (2026-10-07)

Respuestas del usuario en el workspace de la empresa, en castellano: la pantalla se llama
«Planilla de horarios» (barra lateral: «Planilla»), y el rastreador y el calendario conservan su
nombre. Se procesaron en las reglas el 2026-10-07, con las decisiones del equipo; se conservan
tal como llegaron.

_Corregido el 2026-10-07_: el título decía «sin procesar» y el párrafo, que se procesaban
cuando cerrara la segunda tanda.

1. Escribir `1:00` en una celda vacía crea una entrada que en el rastreador va de 09:00 a 09:01
   (ver 5). En el calendario no apareció.
2. Sobre una celda con una entrada de `1:00` hecha desde el rastreador, escribir `2:00` modifica
   esa entrada; no crea otra.
3. Con dos entradas el mismo día y proyecto, la celda deja escribir; al bajar el valor, los
   minutos se descuentan de la primera entrada que aparece.
4. El timer corriendo no aparece en la planilla. Se puede escribir y borrar.
5. `8` son minutos: es el formato por defecto.
6. Vaciar una celda con una entrada no hace nada: valida que sea mayor que cero.
7. La fila nueva muestra «Seleccionar proyecto» y se elige proyecto y tarea.
8. Una fila agregada sin escribir nada sigue después de recargar, con su proyecto y tarea.
9. Con la planilla activa, el rastreador no deja guardar sin proyecto.
10. «Copiar la semana pasada» no se pudo elegir.
11. No parece habilitada en el plan.
12. «Guardar como plantilla» pide un nombre y ofrece una casilla para guardar también el tiempo.
13. Captura de una semana pasada con tres filas y una vacía:
    - título «Planilla de horarios»; arriba a la derecha, «Compañeros» (desplegable), un botón con
      ícono de lista, el selector de período con el rótulo «La semana pasada» y flechas anterior y
      siguiente;
    - encabezado «Proyectos», columnas «lu, sep. 28» … «do, oct. 4» y «Total:»; sábado y domingo
      con fondo distinto;
    - cada fila: punto del color del proyecto, «Proyecto - Cliente» con el cliente en gris, siete
      campos con el formato `06:00:00`, el total de la fila y una X para quitarla;
    - la fila vacía dice «Seleccionar proyecto» con un ícono de agregar; su total, `00:00:00`;
    - abajo, la fila «Total:» con el total por día (`00:00:00` en gris si es cero) y el de la
      semana a la derecha;
    - debajo, «Añadir nueva fila», «Copiar la semana pasada» (desactivado, con flecha de
      desplegable) y «Guardar como plantilla».
14. Archivar un proyecto con horas en la semana: su tiempo sigue en la planilla, el rastreador y el
    calendario.
15. La planilla no tiene controles de timer. Al guardar con Enter, ninguna celda queda con foco.
16. No se vio ninguna opción para ocultar el rastreador.

Segunda tanda, el mismo día:

- **A.** En la primera prueba se escribió `1`, no `1:00`: `1` da `00:01:00` y `1:00`, una hora. `1h` da una hora y `1:30`, una hora y media. En el perfil no
  hay nada parecido a «inicio del día».
- **B.** Al pasar de `1:00` a `2:00` solo se movió el fin; la descripción quedó.
- **C.** Con dos entradas en la celda: bajar el valor descuenta de la que empieza más tarde (con
  el mismo inicio, la de id más reciente); subirlo crea una entrada nueva, que parece llevar la
  descripción de las existentes. Confirmado después: la entrada nueva lleva la misma descripción
  que las otras y empieza apenas termina la última.
- **D.** Con el timer corriendo se puede escribir en su celda. Quitar esa fila no detiene el
  timer. Para el usuario, el timer no es una entrada hasta que se detiene.
- **E.** La celda tiene un menú de tres puntos; una de sus opciones es eliminar.
- **F.** Con una fila de proyecto A y tarea 1, se puede agregar otra con la misma combinación.
- **G.** La fila vacía no aparece en otro navegador ni en incógnito: la guarda el navegador.
- **H.** «Copiar la semana pasada» sigue desactivado con horas en la semana anterior; parece del
  plan.
- **I.** Aplicar una plantilla sobre una semana con horas agrega entradas nuevas.
- **J.** Con el proyecto archivado, las celdas con entradas se editan; las vacías no crean.
- **K.** «Compañeros» le aparece al admin para ver y editar las horas de los demás.
