# Paridad: timesheet semanal

Alcance de este documento: la pantalla de timesheet, una grilla de una semana
con una fila por proyecto y tarea y una columna por día, donde cada celda
escribe una duración. Cubre el armado de filas, la edición de celdas, los
totales, la navegación entre semanas, el timer activo, el borrado de filas,
«copiar semana anterior» y las plantillas. No cubre el rastreador —está en
[`time-tracker.md`](time-tracker.md)—, ni las entidades de proyecto —están en
[`proyectos.md`](proyectos.md)—, ni los ajustes de la persona —están en
[`perfil.md`](perfil.md)—, ni aprobaciones, reportes o exportes.

Es la precondición del slice 13 del
[mapa de la fase 1](../slices/fase1-mapa.md). Depende del núcleo de proyectos
(slices 9 y 10) para las filas y del perfil (slice 7) para la semana.

Cada comportamiento lleva un identificador `TS-nn` para que lo citen el reviewer
de paridad y los flujos de Playwright, y una marca `replicar`, `adaptar` o
`fuera de alcance`. Las dos últimas llevan una línea de justificación. Las
referencias `TT-nn`, `PR-nn` y `PF-nn` apuntan a los otros tres documentos de
paridad y no se reespecifican acá.

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

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Igual que en los otros tres documentos, lo marcado
como _no verificado_ hay que confirmarlo abriendo el workspace antes de
implementarlo, y está todo junto, con una pregunta concreta por punto, en
[timesheet P-12](#p-12-la-lista-de-verificación).

**El hueco más importante del relevamiento.** La documentación dice que se
ingresa «the amount of time you worked in the cell corresponding to that day»
y nada más. **No dice qué hace Clockify al escribir una duración en una celda
que ya tiene una o varias entradas, ni a qué hora ubica la entrada que crea una
celda vacía.** No hay ninguna frase pública sobre eso en las páginas de ayuda,
en las de resolución de problemas ni en las de las aplicaciones móviles. La
[sección 5](#5-qué-escribe-una-celda) especifica nuestra regla como propuesta,
con su pendiente, y no la presenta como relevamiento.

### Tres clases de comportamiento que no son paridad

Igual que en [`proyectos.md`](proyectos.md), este documento mezcla cosas que
conviene no confundir al leerlo. Lo que es paridad es una sola:

1. **Relevamiento.** Lo que dice la documentación pública. Va con la cita o con
   «documentado».

Y tres que no lo son:

2. **Decisión del equipo.** Lo que el equipo ya resolvió en otro documento y
   este hereda: va con el identificador que la cerró (P-06, P-10, P-16,
   PF-01…). El reviewer la compara contra lo que dice acá, no contra Clockify.
3. **Diseño propio.** Lo que no tiene referencia contra la cual compararse ni
   ahora ni después. Hoy en este documento hay uno solo: el facturable de la
   entrada que crea una celda (TS-30), heredado de PR-21.
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

## Vocabulario

| Clockify                    | Clock (interfaz en español)        |
| --------------------------- | ---------------------------------- |
| Timesheet                   | Timesheet                          |
| Row / Add row               | Fila / Agregar fila                |
| Cell                        | Celda                              |
| Copy last week              | Copiar semana anterior             |
| Copy activities only        | Solo actividades                   |
| Copy activities and time    | Actividades y tiempo               |
| Template / Save as template | Plantilla / Guardar como plantilla |
| Apply template              | Aplicar plantilla                  |
| Add / Replace / Skip        | Agregar / Reemplazar / Omitir      |
| Teammates                   | Compañeros                         |

`adaptar`: la interfaz va en español y toda la copia visible se traduce. No se
vuelve a justificar en cada comportamiento. «Timesheet» se deja sin traducir
porque así lo nombran el plan del equipo y el mapa de la fase 1; si se prefiere
«Hoja de horas», es un rótulo.

La regla de **una redacción por causa** de `time-tracker.md` vale acá: este
documento reusa los mensajes que ya existen y escribe solo los de causas nuevas
(sección 14).

## 1. La pantalla

**TS-01 El timesheet está siempre disponible** — `adaptar`
Documentado: «Before you can use the Timesheet, a workspace admin must enable
it», con la opción «Activate timesheet» de los ajustes del workspace. Acá la
pantalla existe siempre y no hay interruptor. Propuesta, **pendiente de
timesheet P-11**. Justificación: el equipo pidió el timesheet como parte de la
fase 1 y un interruptor que nadie va a apagar es configuración de más; se
agrega en la fase 2 con el resto de los ajustes de workspace si alguien lo pide.

**TS-02 El timesheet no vuelve obligatorio el proyecto** — `adaptar`
Documentado, textual: «Once enabled, **Project** automatically becomes a
**required field** for all time entries.» En Clockify activar el timesheet
cambia una regla del rastreador. Acá no: el proyecto sigue siendo opcional en
toda la aplicación (TT-69, TT-93, PR-96).
Propuesta, **pendiente de timesheet P-11**. Justificación: como TS-01 elimina el
interruptor, replicar el efecto sería volver obligatorio el proyecto para
siempre y para todos, que contradice TT-69 y TT-24 —arrancar con la barra
vacía—, ya implementados. Los campos obligatorios son de plan pago (TT-84,
P-01 del rastreador) y es ahí donde se decide si el proyecto pasa a ser
obligatorio, no acá. La consecuencia es la fila «Sin proyecto» de TS-20, que en
Clockify, con el proyecto obligatorio, casi no aparece.

**TS-03 Ocultar el rastreador** — `fuera de alcance`
Documentado: «If you only use the Timesheet mode, you can hide the Time Tracker
page», con el interruptor «Hide tracker». Justificación: es un ajuste de
workspace para equipos que solo usan timesheet, y el equipo usa los dos; además
no está claro si existe en Free (P-12).

**TS-04 Dónde está** — `adaptar`
Ruta `/timesheet` dentro del shell con sesión, con un enlace en la navegación
junto al rastreador. En Clockify es una entrada de la barra lateral.
Justificación: la ruta y el enlace son nuestros; el rótulo sigue el
vocabulario.

**TS-05 Solo las entradas propias** — `replicar`
La grilla suma solo las entradas de la persona de la sesión, igual que el
rastreador (TT-01), aunque quien mire sea admin. Documentado: ver y editar el
timesheet de otra persona es «Add time for teammates», que es de plan pago
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

**TS-08 Siete columnas, una por día** — `replicar`
De izquierda a derecha, los siete días de la semana a partir de TS-06, cada uno
con su rótulo —día de la semana y fecha, con el formato de fecha de la persona
(PF-12)—, y a la derecha la columna de totales por fila (TS-44).
_No verificado_: el rótulo exacto de la columna y si la columna de hoy se
resalta. Propuesta: `lun 29/09` y la de hoy resaltada.

**TS-09 Navegación entre semanas** — `replicar`
Documentado: «Switch to a different week using the date navigation in the
top-right corner». Arriba a la derecha: semana anterior, semana siguiente y un
selector de fecha que lleva a la semana que contiene el día elegido.
_No verificado_: si hay un atajo para volver a la semana en curso y cómo se
rotula el rango. Propuesta: el rango `29/09 – 05/10` con «Esta semana» o
«Semana anterior» cuando corresponde, los mismos rótulos de TT-47, y un botón
«Esta semana» cuando se está en otra.

**TS-10 La semana viaja en la URL** — `adaptar`
`/timesheet?semana=2026-09-28`, con el día de inicio de la semana; sin
parámetro, la semana en curso. Un día que no es inicio de semana se lleva al
inicio de la suya. Justificación: Clockify no lo documenta; en un Server
Component es lo más barato, sobrevive a la recarga (TS-95) y hace funcionar el
botón de volver. Es el mismo criterio que PR-95.

**TS-11 Semanas futuras** — `replicar`
Se puede navegar a cualquier semana futura y cargar horas en ella. Es la
consecuencia directa de TT-76 y P-10: Clockify acepta fechas futuras y el
timesheet no tiene por qué ser más estricto que el modo manual.

**TS-12 Días anteriores a la creación del workspace** — `adaptar`
Las celdas de esos días se dibujan en solo lectura y el servidor rechaza la
escritura con el mensaje de TS-81, el piso que fija el
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md). La navegación
hacia atrás no se corta: una semana vieja se puede mirar. Justificación: es el
mismo piso que el alta manual; Clockify no tiene ninguno documentado.

## 3. Filas

**TS-13 Una fila por proyecto y tarea** — `replicar`
Documentado: «Click **Select Project** and choose the project/task you worked
on». La identidad de una fila es el par `(proyecto, tarea)`, con la tarea
opcional: `(Rediseño, —)` y `(Rediseño, Maquetado)` son dos filas distintas. La
fila muestra el punto de color del proyecto y «Proyecto: Tarea», con la misma
forma que el botón del rastreador (TT-06).

**TS-14 Qué filas trae una semana** — `replicar`
Una fila por cada par `(proyecto, tarea)` que tenga al menos una entrada de la
persona cuyo `start` cae en la semana (TS-07), más las filas agregadas a mano en
la sesión (TS-16). Las entradas de una fila se reparten en las celdas por día.

**TS-15 Orden de las filas** — `adaptar`
Propuesta: por cliente, proyecto y tarea, en orden alfabético, con «Sin
proyecto» al final y las filas recién agregadas abajo de todo hasta la próxima
recarga. Justificación: Clockify no documenta el orden; este es el mismo
agrupamiento del selector (TT-07) y no hace saltar filas mientras se edita.
_No verificado_: el orden de Clockify (P-12).

**TS-16 Agregar fila** — `replicar`
Documentado: «Click the **Add row** button to add a new line (optional)». Abajo
de la grilla, «Agregar fila» agrega una fila vacía con el selector de proyecto y
tarea abierto. La fila no tiene ninguna entrada hasta que se escribe una celda.

**TS-17 Qué ofrece el selector de la fila** — `replicar`
Documentado: «projects must be visible to you before you can add time to them»;
los públicos aparecen solos y a los privados hay que estar asignado. Es el mismo
selector y el mismo filtro que el rastreador: proyectos activos accesibles
(TT-08, PR-61), agrupados por cliente, con sus tareas activas (PR-38) y el
buscador de TT-07. Archivados y tareas hechas no se ofrecen (PR-23, PR-99,
PR-100).

**TS-18 Cada combinación se elige una sola vez por semana** — `replicar`
Documentado, textual: «In the Timesheet view, each project can only be selected
once per week. It won't show up again in the project picker for new rows», y
«If you've already added a project (e.g., Project A), use the same row to enter
time across the week». El selector de una fila nueva no ofrece lo que ya es
fila en la semana.
_No verificado_: la frase dice «project», no «project/task». Leída al pie de la
letra, un proyecto con dos tareas no podría tener dos filas, que contradice
TS-13. Acá se aplica al par `(proyecto, tarea)`: una tarea que ya es fila no se
ofrece, el mismo proyecto con otra tarea sí. Confirmar (P-12).

**TS-19 Una fila vacía no sobrevive a la recarga** — `adaptar`
Las filas salen de las entradas (TS-14); una fila agregada y sin ninguna celda
escrita vive solo en el cliente y desaparece al recargar o al cambiar de semana.
No hay tabla de filas. Propuesta, **pendiente de timesheet P-07**.
Justificación: una tabla de filas sin horas es estado que no existe en ningún
otro lugar del modelo, y lo único que lo pide es «solo actividades» de TS-59,
que funciona igual sin ella porque se puede repetir mientras la semana siga
vacía (TS-56). Las plantillas (TS-62) sí necesitan tabla, pero propia.
_No verificado_: si en Clockify una fila vacía persiste (P-12).

**TS-20 La fila «Sin proyecto»** — `adaptar`
Las entradas sin proyecto de la semana forman una fila rotulada «Sin proyecto»,
en gris y sin punto de color (TT-50), que se edita con las mismas reglas que
cualquier otra. El selector de la fila nueva ofrece también «Sin proyecto»,
como la opción de TT-10, mientras esa fila no exista ya en la semana.
Propuesta, **pendiente de timesheet P-06**. Justificación: con TS-02 el
proyecto es opcional, así que esas entradas existen y tienen que sumar; sin la
fila, el total del día del timesheet no coincidiría con el del rastreador
(TS-48). En Clockify, con el proyecto obligatorio, la fila solo puede venir de
entradas viejas o de un proyecto borrado (PR-64).
_No verificado_: cómo dibuja Clockify esas entradas (P-12).

**TS-21 Filas de un proyecto archivado, de una tarea hecha o sin acceso** —
`replicar`
La fila aparece si tiene entradas en la semana: archivar no toca las entradas
(PR-63, PR-65) y quien perdió el acceso a un proyecto privado sigue viendo las
suyas (PR-71). Las celdas que ya tienen una entrada se editan con TS-33, porque
editar la duración de una entrada existente no la vuelve a asignar al proyecto.
Las celdas vacías de esa fila quedan en solo lectura, porque escribirlas crearía
una entrada nueva en un proyecto que el selector no ofrece (PR-23); si el pedido
llega igual, el servidor responde con TS-77 o TS-78.
_No verificado_: qué hace Clockify con esas celdas (P-12).

**TS-22 Entradas de un proyecto o una tarea borrados** — `replicar`
Documentado en proyectos: la entrada pierde el proyecto y conserva las horas
(PR-64), o pierde la tarea y conserva el proyecto (PR-66). En la grilla eso
significa que sus horas pasan a la fila «Sin proyecto» o a la fila del proyecto
sin tarea, y los totales no cambian.

**TS-23 El proyecto de una fila no se cambia** — `adaptar`
Una fila no tiene selector una vez creada: para mover horas de un proyecto a
otro se edita la entrada desde el detalle (TS-41) o desde el rastreador.
Propuesta. Justificación: cambiar el proyecto de una fila sería una edición
masiva de proyecto sobre las entradas de la semana, que es TT-63 y del slice
12; Clockify no documenta nada al respecto.
_No verificado_: si Clockify deja cambiar el proyecto de una fila con horas
(P-12).

## 4. Celdas: lo que muestran y lo que aceptan

**TS-24 Qué suma una celda** — `replicar`
La celda `(fila, día)` muestra la suma de las duraciones de **todas** las
entradas de la persona con ese proyecto, esa tarea y el `start` en ese día
local, incluido el timer activo si es una de ellas (TS-49). No importan la
descripción, las etiquetas ni el facturable: dos entradas del mismo proyecto con
descripciones distintas caen en la misma celda. Documentado: «Descriptions are
linked to individual time entries»; la celda agrega entradas, no las fusiona.
Una celda sin entradas se dibuja vacía, no con `0:00`.

**TS-25 Formatos aceptados** — `adaptar`
Los mismos de la barra manual, con el mismo intérprete: TT-19, incluida la coma
decimal. Documentado en la página del timesheet, con una tabla: con el formato
de duración en minutos y horas, «1» se vuelve 1 minuto; con decimal, 1 hora.
Es exactamente PF-21: con los dos formatos que entran (PF-20) `8` son ocho
minutos y para ocho horas se escribe `8h`, `8:00` u `8,0`.
_No verificado_: la página de creación de entradas dice «Enter the number of
hours you worked in the correct **Day** column», que se lee como si `8` fueran
ocho horas. La tabla de la página del timesheet es más específica y es la que se
sigue; confirmar qué hace `8` en una celda del workspace (P-12).
Justificación del `adaptar`: la coma decimal, igual que en TT-19.

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

Esta sección es la que la documentación no cubre (ver
[Fuentes](#fuentes-y-límites-del-relevamiento)). Todo lo que sigue es
**propuesta** salvo TS-29, y cada regla nombra su pendiente.

La operación se piensa como **«dejar la celda en este valor»**, no como «sumar»
ni «restar»: el pedido lleva el día, el proyecto, la tarea y la duración
pedida, y el servidor decide qué escribir mirando lo que la celda tiene **en
ese momento**, dentro de la transacción. De ahí salen la idempotencia de TS-37 y
la respuesta a una pestaña desactualizada (TS-93).

**TS-29 Celda vacía: crea una entrada** — `replicar`
Documentado: después de cargar horas en la celda, «Once the entry is created,
click on the three dots in the cell». Escribir una duración en una celda vacía
crea **una** entrada cerrada de la persona en ese proyecto y esa tarea, en ese
día.

**TS-30 Los campos de la entrada que crea una celda** — `adaptar`
Descripción vacía —la fila del rastreador muestra «Sin descripción» (TT-94)—,
sin etiquetas, y el facturable por defecto del proyecto (TT-14), que es
**diseño propio** por PR-21 y P-16. Documentado que la descripción y las
etiquetas se agregan después, desde el detalle (TS-40). Justificación del
`adaptar`: el facturable no se puede relevar en Free.

**TS-31 La hora de inicio de la entrada que crea una celda** — `adaptar`
Propuesta, **pendiente de timesheet P-01**: **09:00 hora de pared** del día de
la celda, en la zona horaria de la persona, igual para todas las filas.
Justificación: la documentación no dice nada. La hipótesis más firme es que
Clockify use el ajuste «Inicio del día» del perfil, que la documentación nombra
sin explicar y que PF-15 dejó fuera de alcance por eso mismo (perfil P-02); si
se confirma, ese ajuste entra con su valor por defecto, este documento lo cita
y **perfil P-02 se cierra con esto**. Mientras tanto, una hora fija es
predecible, no depende de las otras filas y hace que la misma pulsación dé
siempre la misma entrada.
Consecuencia aceptada: dos celdas del mismo día en filas distintas crean dos
entradas que empiezan a la misma hora y se superponen. Vale TT-82 (TS-38).
Si las 09:00 no existen ese día por un cambio de horario, se usa el primer
minuto que exista después: la persona no tecleó esa hora y no corresponde
mostrarle TT-112.

**TS-32 El fin es el inicio más la duración, en instantes** — `adaptar`
**Divergencia explícita contra el
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md)**, pendiente de
timesheet P-02. Al escribir `V` en una celda, el fin de la entrada se calcula
como **el instante de inicio más `V` minutos**, no como una hora de pared
convertida con `instantFromLocal`. El ADR 0005 dice que no hay un tercer camino
de instantes además de `now()` y de la hora tecleada, y `createManualEntry` lo
deja escrito en un comentario: «El fin es la hora tecleada y no el inicio más
la duración». Acá lo que se tecleó **es** la duración.

Por qué no se puede expresar con las reglas existentes, con dos casos:

- **Segundos heredados del timer.** Una entrada del timer de `10:00:40` a
  `11:31:22` se ve `1:30`. Si la persona escribe `2:00` y el fin se arma como
  rótulo —`10:00` más 120 minutos, `12:00`—, el ADR 0006 conserva el inicio con
  sus segundos y el fin queda en `12:00:00`: la entrada dura `1:59:20` y la
  celda pasa a mostrar `1:59` después de que se escribió `2:00`.
- **Cambio de horario.** Una entrada que cruza la hora del cambio dura una hora
  más o una menos que la resta de sus rótulos (TT-97). Con el fin como rótulo,
  la celda mostraría `7:00` o `9:00` después de escribir `8:00`.

Con el fin como inicio más duración, **la celda de una sola entrada muestra
siempre exactamente lo que se escribió**, que es lo único que la persona puede
comprobar en esta pantalla. Las horas de pared del fin son derivadas y nadie las
tecleó. El orden de los extremos (TT-81) se sostiene por construcción: `V` es
de un minuto o más (TS-35).
Lo que pide: que `architect` registre la excepción en el ADR 0005 —o en uno
nuevo— y que la mutación viva en `time-entry`, como manda el
[ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md) para todo módulo
que edite horas. Ni `createManualEntry` ni `updateEntryTimes` sirven tal como
están: las dos reciben rótulos de fin.

**TS-33 Celda con una entrada: edita esa entrada** — `adaptar`
Propuesta, **pendiente de timesheet P-03**. Si la celda tiene exactamente una
entrada cerrada, escribir `V` **edita esa entrada**: conserva su inicio con sus
segundos —el paso 1 del ADR 0006: el inicio no cambió— y lleva el fin a inicio
más `V` (TS-32). No se crea ninguna entrada nueva y no cambian la descripción,
las etiquetas ni el facturable. Es la misma semántica que «editar la duración
mueve la hora de fin» de la barra manual (TT-18).
Vale aunque la entrada sea una de las que TT-110 deja en solo lectura en la
fila del rastreador: acá no hay trío que la trunque en silencio, la persona
escribe la duración nueva a propósito.
Justificación: Clockify no lo documenta.
_No verificado_: qué hace Clockify (P-12).

**TS-34 Celda con varias entradas: no se escribe desde la grilla** — `adaptar`
Propuesta, **pendiente de timesheet P-03**. Si la celda tiene dos o más
entradas, la celda de la grilla queda en solo lectura, con un indicador de que
agrupa varias, y se edita desde el detalle (TS-42), entrada por entrada. Un
pedido que llegue igual se rechaza con el mensaje de TS-79.
Justificación: cualquier regla automática tiene que elegir qué entradas tocar.
Agregar una entrada por la diferencia funciona para subir pero no para bajar; y
achicar «la última» puede obligar a borrar entradas enteras, con su descripción
y sus etiquetas, sin que la persona lo vea. Es el mismo criterio de TT-110:
mejor no ofrecer la edición que ofrecerla y que destruya datos en silencio.
**Es una divergencia probable**: si Clockify deja escribir sobre esas celdas
(P-12), hay que decidir si se replica su regla o se mantiene esta.

**TS-35 Vaciar una celda o escribir cero** — `adaptar`
Propuesta, **pendiente de timesheet P-04**. Sobre una celda con una entrada,
borrar el contenido o escribir `0` **borra esa entrada**, con el diálogo de
confirmación de TT-61 y sin deshacer (P-06 del rastreador). Cancelar el diálogo
deja la celda como estaba. Sobre una celda vacía no hace nada. Sobre una celda
con varias entradas no aplica (TS-34).
Justificación: es lo que una celda vacía significa en esta pantalla, y la
alternativa —rechazarlo con TT-73— obliga a ir al rastreador para borrar algo
que se cargó desde acá. La confirmación es por P-06: borrar es físico.
_No verificado_: si Clockify pide confirmación (P-12).

**TS-36 Escribir lo mismo no escribe nada** — `adaptar`
Si lo que queda en la celda al perder el foco, ya interpretado, es igual a lo
que la celda mostraba, no sale ningún pedido. Una celda de `1:30:42` que se
muestra `1:30` y se confirma sin tocar conserva sus segundos. Justificación: el
redondeo de la vista no puede convertirse en una escritura.

**TS-37 Escribir una celda se puede reintentar** — `adaptar`
Como el pedido es «dejar la celda en `V`», repetirlo deja el mismo estado: el
primer intento crea la entrada (TS-29) y el segundo encuentra una sola entrada y
la deja en `V` (TS-33). Por eso, ante una falla de red, el aviso **sí** ofrece
«Reintentar» (TT-89), a diferencia del alta manual (TT-109), que solo crea.
Lo que la idempotencia exige del servidor: **dos pedidos simultáneos sobre la
misma celda vacía tienen que dejar una sola entrada** —dos pestañas, o un
Enter seguido de la pérdida del foco—. La lectura de la celda y la escritura van
en la misma transacción y serializadas por `(persona, proyecto, tarea, día)`;
cómo, lo decide el contrato del slice. Justificación: Clockify reintenta solo y
no expone la decisión, como en TT-109.

**TS-38 Superposición** — `adaptar`
Las entradas que crea el timesheet pueden superponerse entre sí (TS-31) y con
las del rastreador, sin aviso. Es TT-82, con su misma justificación y su mismo
pendiente (P-04 del rastreador).

**TS-39 Escribir con un timer corriendo** — `adaptar`
Propuesta, **pendiente de timesheet P-05**: se puede. TT-30 no se aplica al
timesheet: la grilla sigue editable con un timer corriendo, salvo la celda que
lo contiene (TS-50).
Justificación: TT-30 es documentado para el modo manual de la barra, cuyo
conmutador comparte lugar con el timer; el timesheet es otra pantalla y
bloquearla entera mientras corre un timer la volvería inútil para quien deja el
timer andando todo el día. **Tiene un arrastre en el código**:
`createManualEntry` rechaza con `timer_running` cuando hay un timer abierto, así
que la creación desde una celda no puede reusarla tal cual, que es otra razón
para la mutación propia de TS-32.
_No verificado_: qué hace Clockify (P-12).

## 6. El detalle de una celda

**TS-40 Menú de tres puntos en la celda** — `replicar`
Documentado: «Hover over the cell that contains the tracked time», «Click on
the three dots that appear», «Enter the detail you want to add in the pop-up
(description, tags, billable status, start/end time)». Solo las celdas con
horas tienen menú. El menú se abre también con el teclado (TS-99).

**TS-41 Detalle de una celda con una entrada** — `replicar`
El popover edita esa entrada con los mismos campos y las mismas mutaciones que
la fila del rastreador: descripción (TT-54, TT-55), etiquetas (TT-12),
facturable (TT-14), y horas y fecha (TT-54, TT-56), con sus dos excepciones,
TT-110 y TT-111. Cambiar la fecha mueve la entrada de celda; cambiar el
proyecto, si el detalle lo ofrece, la mueve de fila (TS-23).
Etiquetas y facturable entran cuando esté mergeado el slice 11.

**TS-42 Detalle de una celda con varias entradas** — `adaptar`
Propuesta, **pendiente de timesheet P-03**: el popover lista las entradas de la
celda, cada una con su descripción, sus horas y su duración, editables con las
reglas de TS-41 y con «Borrar» (TT-60). Es la única forma de editar esa celda
(TS-34). Justificación: Clockify no documenta qué muestra el popover en ese
caso.
_No verificado_ (P-12).

**TS-43 La grilla no muestra descripciones ni etiquetas** — `replicar`
Documentado, textual: «In the Timesheet view, you won't see the description
field by default. This view is designed for fast time input across the week.»
La grilla solo tiene duraciones; el resto se ve en el detalle.

## 7. Totales

**TS-44 Total por fila** — `replicar`
En la columna de la derecha, la suma de la fila en la semana.

**TS-45 Total por día** — `replicar`
Abajo de cada columna, la suma de todas las filas en ese día.

**TS-46 Total de la semana** — `replicar`
En la esquina inferior derecha, la suma de toda la grilla.
_No verificado_, para TS-44 a TS-46: la documentación no describe los totales.
Se ven en el producto (P-12).

**TS-47 Cómo se suma y cómo se escribe** — `replicar`
Las sumas se hacen en segundos y se formatean una sola vez, para no acumular el
truncamiento de cada celda (TT-45), con el formato de duración del workspace
(PF-02, PF-20, PF-22): `h:mm` por defecto. Un total puede pasar de 24 horas.

**TS-48 Los totales coinciden con el rastreador** — `replicar`
El total de un día en el timesheet es el mismo número que el total de ese día en
el rastreador (TT-45, TT-46), y el de la semana el de la franja semanal (TT-47),
porque suman las mismas entradas con el mismo corte (TS-06, TS-07). Es la
condición que hace necesaria la fila «Sin proyecto» (TS-20).

## 8. El timer activo

**TS-49 La entrada que corre está en su celda y suma** — `adaptar`
La entrada abierta cae en la celda de su proyecto, su tarea y el día local de su
`start` —con proyecto o en «Sin proyecto»—, y la celda, el total de la fila, el
del día y el de la semana suman su transcurrido y se actualizan con el contador,
como el total del día del rastreador (TT-46). La fila existe aunque no tenga
ninguna entrada cerrada. Justificación: es TT-46 aplicado a esta pantalla; sin
esto TS-48 no se cumple mientras hay un timer corriendo.
_No verificado_: si Clockify muestra la entrada que corre en el timesheet
(P-12). Es la misma pregunta que TT-111 dejó abierta para la lista.

**TS-50 La celda del timer activo no se escribe** — `adaptar`
La celda que contiene la entrada abierta queda en solo lectura, sola o con
otras entradas. El pedido que llegue igual se rechaza con el mensaje de TS-80,
sin escribir. Justificación: TS-33 movería el fin de una entrada que no tiene
fin; el inicio del timer se corrige desde el contador (TT-28).

**TS-51 El timesheet no arranca ni detiene timers** — `replicar`
La pantalla no tiene botón de iniciar ni de detener: el timer se maneja desde
el rastreador. Una parada hecha en otra pestaña se ve con la revalidación de
TT-40.
_No verificado_: la documentación no menciona ningún control de timer en el
timesheet (P-12).

## 9. Borrar una fila

**TS-52 Borrar una fila borra su semana** — `replicar`
Documentado, textual: «If you delete a time entry in the timesheet, all time
associated with that task, for that week, will be deleted.» El menú de la fila
ofrece «Borrar fila», que borra **todas** las entradas cerradas de la persona
con ese proyecto y esa tarea cuyo `start` cae en la semana, tengan la
descripción y las etiquetas que tengan. Las de otras semanas no se tocan.
Una fila vacía (TS-19) se quita sin diálogo, porque no borra nada.

**TS-53 Con confirmación y sin deshacer** — `adaptar`
Documentado que Clockify permite deshacer: «Using the Undo feature
automatically restores deleted entries and all its data across the Time
Tracker, Timesheet, Calendar, and Detailed reports.» Acá, el diálogo de
confirmación de TT-61 y sin deshacer. Justificación: P-06 del rastreador. El
diálogo dice cuántas entradas se borran y cuántas horas suman, porque una fila
puede esconder entradas con descripciones que no se ven (TS-43). Cada entrada
borrada deja su copia en el audit log.

**TS-54 La entrada que corre no se borra con la fila** — `adaptar`
Si la fila contiene el timer activo, «Borrar fila» borra las entradas cerradas
y deja la abierta; el diálogo lo avisa y la fila sigue en la grilla con el
transcurrido. Justificación: borrar el timer activo es «Descartar» (TT-65), con
su propia confirmación; una acción sobre la semana no lo arrastra de rebote.
_No verificado_ (P-12).

## 10. Copiar semana anterior

**TS-55 Dos variantes** — `replicar`
Documentado: «Click the **Copy last week** button on the bottom» y elegir entre
«Copy activities only – Imports the projects/tasks list» y «Copy activities and
time – Imports the projects/tasks list and time logged for those entries». Acá
«Copiar semana anterior», abajo de la grilla, con «Solo actividades» y
«Actividades y tiempo».

**TS-56 Solo con la semana vacía** — `replicar`
Documentado, textual: «The Copy Last Week option only works if your current
week is completely empty. If you've already added time to even one cell, the
button will be grayed out.» El botón se muestra deshabilitado, con la razón en
su descripción accesible. El timer activo cuenta como horas cargadas.

**TS-57 Solo si la semana anterior tiene horas** — `replicar`
Documentado: «If you didn't track any time during the previous week, there's
nothing to copy», y «The button won't appear if the previous week is empty.»
Con la semana anterior vacía el botón no se dibuja. «Semana anterior» es la
inmediatamente anterior a la que se está mirando, no a la de hoy.

**TS-58 Lo que ya no está disponible no se copia** — `replicar`
Documentado: «If some time entries couldn't be copied, it's likely because one
or more projects or tasks have been archived or deleted since last week.» Las
filas de proyectos archivados o sin acceso y de tareas hechas o borradas se
saltean (PR-23, PR-38, PR-61), y al terminar un aviso informativo dice cuántas
filas no se copiaron y por qué. La fila «Sin proyecto» sí se copia (TS-20).

**TS-59 «Solo actividades» deja filas vacías** — `adaptar`
Copia los pares `(proyecto, tarea)` de la semana anterior como filas vacías, sin
crear ninguna entrada. Por TS-19 esas filas viven en el cliente y no sobreviven
a la recarga; como la semana sigue vacía, se puede volver a copiar. Propuesta,
atada a timesheet P-07. Justificación: es la consecuencia de no tener tabla de
filas.

**TS-60 «Actividades y tiempo»: qué crea** — `adaptar`
Propuesta, **pendiente de timesheet P-08**. Por cada entrada cerrada de la
semana anterior que pase TS-58, una entrada nueva con el mismo proyecto, tarea,
descripción, etiquetas y facturable, y **las mismas horas de pared siete días
después**: inicio y fin se convierten con `instantFromLocal` sobre su propio día
más siete, que es el ADR 0005 sin excepciones. Todo en una transacción, con su
audit log.

- Una entrada cuya hora de pared no existe en la semana nueva (TT-112) se
  saltea y se cuenta en el aviso de TS-58; no se mueve ni frena la copia.
- El timer activo no se copia.
- La copia solo crea, así que vale lo mismo que TT-109: ante una falla de red
  no hay «Reintentar» y el aviso manda a mirar la grilla. Si la copia sí se
  hizo, la semana ya no está vacía y TS-56 impide repetirla.

Justificación: la documentación dice «time logged for those entries» y no dice
cómo. Copiar entrada por entrada conserva el total de cada celda, el detalle y
las horas; la alternativa —una entrada por celda con la suma, a la hora de
TS-31— pierde descripciones y etiquetas.
_No verificado_: qué crea Clockify (P-12). Si copia una entrada por celda, se
replica eso.

**TS-61 El requisito del período de aprobación semanal** — `fuera de alcance`
Documentado: «The Copy Last Week feature only works when your workspace uses a
weekly approval period», y lo mismo para plantillas. Justificación: el período
de aprobación es un ajuste de aprobaciones, que son de plan pago y no se
relevan (TS-68). Acá el período es siempre la semana.
_No verificado_: qué período tiene un workspace Free, donde el ajuste no se ve
(P-12).

## 11. Plantillas

En el plan Free: la página de precios lista «save template timesheets» en Free.

**TS-62 Guardar una semana como plantilla** — `replicar`
Documentado: «You can save the time and tasks for a specific week as a
template», con «Save as template» abajo de la grilla. Guarda los pares
`(proyecto, tarea)` de la semana y lo cargado en cada celda.
_No verificado_: si guarda el total por celda o las entradas, y si pide nombre
(P-12).

**TS-63 Aplicar una plantilla** — `replicar`
Documentado: «The timesheet will automatically populate with the projects and
tasks from the template.» «Aplicar plantilla» trae sus filas y sus horas a la
semana que se está mirando.

**TS-64 Conflictos: agregar, reemplazar u omitir** — `replicar`
Documentado, textual: «Add – Incorporate time entries from the template with
existing ones», «Replace – Overwrite existing time entries with the template's
entries», «Skip – Ignore cells where time already exists». «Reemplazar» borra
entradas existentes y pide la confirmación de TT-61 con el conteo de TS-53.
_No verificado_: la semántica de «agregar» sobre una celda con horas —si suma
una entrada más o reescribe la celda— (P-12).

**TS-65 Las plantillas son personales** — `replicar`
Documentado, textual: «Timesheet templates are accessible only to the user who
created them.» Ninguna otra persona las ve, ni un admin.

**TS-66 Lo no disponible no se aplica** — `replicar`
Documentado en las aplicaciones móviles: «If you apply a template with projects
that are deleted, archived, or you have no access to them, those projects won't
be inserted in the timesheet from the template.» Mismo aviso que TS-58.

**TS-67 Plantillas quincenales o mensuales** — `fuera de alcance`
Documentado en la aplicación de iOS: «Depending on the approval period set up
in the Workspace settings, timesheet templates can be created for weekly,
semi-monthly and monthly time period.» Justificación: depende del período de
aprobación, que es pago (TS-61).

TS-62 … TS-66 son relevables y están marcados `replicar`, pero **la fase la
decide el equipo** (timesheet P-09): traen una tabla nueva, «Reemplazar» es
destructivo y «copiar semana anterior» cubre el uso más frecuente.

## 12. Lo que el plan Free deja fuera

**TS-68 Enviar a aprobación e íconos de estado** — `fuera de alcance`
Documentado: el timesheet muestra un tilde verde para lo aprobado —«The entry
is locked and cannot be edited or deleted»—, uno naranja para lo pendiente y
nada para lo no enviado o rechazado, y se envía a aprobación desde la misma
pantalla. Justificación: aprobaciones es pago, no relevable (P-02 del
rastreador).

**TS-69 Bloqueo de timesheets** — `fuera de alcance`
Documentado: «Locking timesheets prevents team members from adding new time
entries or editing old ones for a specific period», y en la grilla «You'll see
a message saying the date is locked on the timesheet». Justificación: pago, no
relevable (P-02 del rastreador, TT-67).

**TS-70 Cargar horas de otra persona** — `fuera de alcance`
Documentado: el botón «Teammates» abre el timesheet de otra persona para
editarlo, y es pago. Justificación: pago, y además contradice TS-05.

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
`team_manager` y `member` escriben celdas, borran filas, copian semanas y usan
plantillas sobre sus propias entradas, con las acciones `timeEntry.own.*` que
ya existen. Las plantillas, si entran, necesitan su acción propia.

**TS-76 Membresía que no está activa: solo lectura** — `adaptar`
La grilla se dibuja con los valores y sin ningún control de escritura, con el
aviso permanente de TT-92. Un pedido que llegue igual recibe el mensaje neutro
de TT-79. Justificación: `membership_status` es nuestro modelo.

## 14. Validaciones y mensajes

Los mensajes son nuestros; lo que se replica es la regla. Los que ya existen se
reusan por la regla de una redacción por causa.

| ID    | Regla                                                          | Mensaje                                                                        | Marca      |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| TS-77 | Celda nueva en un proyecto inexistente, archivado o sin acceso | «Ese proyecto ya no está disponible.» (TT-77)                                  | `adaptar`  |
| TS-78 | Celda nueva en una tarea inexistente, hecha o de otro proyecto | «Esa tarea ya no está disponible.» (PR-74)                                     | `adaptar`  |
| TS-79 | Escribir una celda con varias entradas                         | «Esta celda tiene varias entradas: editalas desde el detalle.»                 | `adaptar`  |
| TS-80 | Escribir la celda del timer activo                             | «Esta entrada es la que está corriendo.» (TT-111)                              | `adaptar`  |
| TS-81 | Día anterior a la creación del workspace                       | «No se pueden cargar horas anteriores a la creación del workspace.» (ADR 0005) | `adaptar`  |
| TS-82 | Duración ilegible o de 24 horas o más                          | — (la celda vuelve al valor anterior, TT-21)                                   | `adaptar`  |
| TS-83 | La entrada del detalle ya no existe                            | «Esa entrada ya no existe.» (TT-80)                                            | `adaptar`  |
| TS-84 | Membresía que no puede escribir                                | «No tenés permiso para hacer esto.» (TT-79)                                    | `replicar` |
| TS-85 | Copiar sobre una semana que ya tiene horas                     | «Esta semana ya tiene horas cargadas.»                                         | `adaptar`  |
| TS-86 | Tarea sin proyecto                                             | «Elegí un proyecto antes que una tarea.» (TT-70)                               | `replicar` |

Justificación de los `adaptar`: los textos son nuestros, como en la sección 7
de `time-tracker.md`; las reglas de TS-79, TS-80 y TS-85 son además propuestas
de este documento. Detalle:

- **TS-79** es una causa nueva: el remedio —ir al detalle— no es el de ninguna
  otra. Existe solo mientras TS-34 se mantenga.
- **TS-80** reusa el texto de TT-111 porque es la misma causa con el mismo
  remedio: no hay que detener nada; la entrada abierta no se edita por este
  camino y su inicio se corrige desde el contador.
- **TS-85** es la respuesta del servidor a la pestaña desactualizada; en la
  interfaz el botón ya está deshabilitado (TS-56).
- **TS-86** no tiene camino en la interfaz —el selector de la fila no deja
  elegir una tarea sin su proyecto—; es la validación del payload.

## 15. Estados vacíos

**TS-87 Semana sin horas y sin filas** — `adaptar`
La grilla se dibuja con las siete columnas y sin filas, con «No hay horas
cargadas esta semana», «Agregar fila» y, si la semana anterior tiene horas,
«Copiar semana anterior». Justificación: copia propia; Clockify no documenta el
estado vacío.

**TS-88 Workspace sin proyectos** — `adaptar`
El selector de la fila abre con «No hay proyectos todavía» y el enlace a la
pantalla de proyectos, igual que TT-87 y PR-85, con la misma justificación. Con
TS-20, la fila «Sin proyecto» se puede agregar igual.

**TS-89 Primera semana de uso** — `replicar`
Sin semana anterior con horas, «Copiar semana anterior» no se dibuja (TS-57).

**TS-90 Semana entera anterior a la creación del workspace** — `adaptar`
Se dibuja vacía y en solo lectura, sin «Agregar fila» ni «Copiar semana
anterior» (TS-12). Justificación: es el piso del ADR 0005.

## 16. Estados de error

**TS-91 Falla de red al escribir una celda** — `adaptar`
La celda vuelve a su valor anterior y el aviso ofrece «Reintentar» (TT-89),
porque la escritura es idempotente (TS-37). Título del aviso por TT-90: «No se
pudo guardar la celda.» Justificación: la de TT-89.

**TS-92 Falla de red al borrar una fila o copiar una semana** — `adaptar`
Borrar una fila ofrece «Reintentar»: repetirlo sobre una fila ya borrada no
borra nada más. Copiar «actividades y tiempo» no lo ofrece (TS-60, TT-109).
Justificación: la de TT-89 y TT-109.

**TS-93 La celda cambió en otra pestaña** — `adaptar`
Como el servidor decide con el estado de la celda en ese momento (sección 5):
si la celda pasó a tener varias entradas, la escritura se rechaza con TS-79 y la
grilla se refresca; si la entrada se borró, la celda está vacía y la escritura
crea una (TS-29), que es lo que la persona pidió —dejar la celda en ese valor—.
Justificación: es la consecuencia de modelar la celda como un valor y no como
una diferencia.

**TS-94 Sesión vencida y membresía desactivada** — `adaptar`
TT-91 y TT-92 sin cambios, con su justificación.

## 17. Al recargar

**TS-95 La grilla se arma en el servidor** — `replicar`
La semana de la URL (TS-10), las filas que salen de las entradas (TS-14), las
celdas, los totales y el timer activo se calculan en el servidor con la zona
horaria y el inicio de semana de la persona. No hay estado del cliente que
reconstruir.

**TS-96 Lo que se pierde al recargar** — `adaptar`
Las filas vacías (TS-19), incluidas las de «Solo actividades» (TS-59), y lo
tecleado en una celda que todavía no perdió el foco. Justificación: TS-19.

**TS-97 Otra pestaña con la misma semana** — `adaptar`
Se actualiza con la revalidación de TT-40: al enfocar, al volver a ser visible
y cada 60 segundos. Justificación: no hay canal abierto (TT-40).

## 18. Teclado y accesibilidad

La documentación dice una sola cosa: Enter guarda (TS-28). Lo demás es
propuesta, con una justificación común: una grilla de carga rápida que no se
recorre con el teclado no cumple su propósito.

**TS-98 Recorrido con Tab** — `adaptar`
Tab y Mayús+Tab recorren las celdas por fila, de izquierda a derecha y de
arriba abajo; Enter guarda y baja a la celda del mismo día en la fila siguiente.
_No verificado_: si Clockify mueve el foco al guardar (P-12).

**TS-99 El menú de la celda con el teclado** — `adaptar`
El botón de tres puntos de TS-40 es enfocable y está en el orden de tabulación
después de su celda; no aparece solo al pasar el puntero.

**TS-100 La grilla es una tabla** — `adaptar`
Se marca como tabla con encabezados de fila —proyecto y tarea— y de columna
—día—, y cada celda editable tiene un nombre accesible que dice las dos cosas:
«Rediseño: Maquetado, miércoles 01/10». Los totales tienen el suyo: «Total del
miércoles 01/10».

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
| TS-105 | Escribir `1:30` sobre una entrada del timer de `1:30:42`            | Es igual a lo que se ve: no se escribe nada (TS-36).                                                                                                    |
| TS-106 | Escribir `2:00` sobre esa misma entrada                             | El inicio se conserva con sus segundos y el fin pasa a inicio más dos horas: la celda muestra `2:00` (TS-32, TS-33).                                    |
| TS-107 | Escribir en una celda de un día con cambio de horario               | La celda muestra lo escrito: el fin es inicio más duración (TS-32). Las horas de pared de la entrada pueden no cuadrar con la resta visual, como TT-97. |
| TS-108 | Escribir en una celda de un día futuro                              | Se acepta (TS-11, TT-76).                                                                                                                               |
| TS-109 | Dos celdas del mismo día en filas distintas                         | Dos entradas que empiezan a la misma hora y se superponen (TS-31, TS-38).                                                                               |
| TS-110 | Enter y pérdida de foco, o dos pestañas, sobre la misma celda vacía | Queda una sola entrada (TS-37).                                                                                                                         |
| TS-111 | La persona cambia su zona horaria                                   | Ningún instante se toca; las entradas pueden cambiar de celda y de semana (PF-38).                                                                      |
| TS-112 | Un admin cambia el primer día de la semana de la persona            | Ninguna entrada se mueve; cambian las columnas y los totales de la semana (PF-40, PF-41).                                                               |
| TS-113 | Proyecto archivado mientras se edita la grilla                      | Las celdas con una entrada se siguen escribiendo; las vacías responden TS-77 y la grilla se refresca (TS-21).                                           |
| TS-114 | Proyecto borrado con su fila en pantalla                            | Al refrescar, sus horas pasan a «Sin proyecto» (TS-22).                                                                                                 |
| TS-115 | Mover desde el detalle una entrada a otro día                       | Cambia de celda; si el día queda fuera de la semana, sale de la grilla y la fila puede quedar sin entradas y desaparecer.                               |
| TS-116 | Celda con una entrada cerrada y el timer activo                     | Tiene dos entradas: vale TS-34 y además TS-50.                                                                                                          |
| TS-117 | Copiar la semana anterior con el timer corriendo en la actual       | La semana no está vacía: el botón está deshabilitado (TS-56).                                                                                           |
| TS-118 | Entrada de cero minutos del timer (TT-101)                          | Cuenta como entrada: la celda muestra `0:00`, no vacía, y para TS-34 es una entrada más.                                                                |

## 20. Divergencias que este documento propone

Juntas, para que el equipo las vea de una vez. Salvo la última, ninguna está
decidida.

| ID    | Contra qué                  | Qué                                                                                                        | Pendiente                          |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| TS-02 | Clockify, documentado       | Activar el timesheet no vuelve obligatorio el proyecto, y no hay interruptor (TS-01).                      | timesheet P-11                     |
| TS-32 | ADR 0005, regla interna     | El fin de la entrada de una celda es inicio más duración: un tercer camino de instantes que el ADR cierra. | timesheet P-02                     |
| TS-34 | Clockify, probable          | Una celda con varias entradas no se escribe desde la grilla.                                               | timesheet P-03                     |
| TS-39 | TT-30, regla del rastreador | El timesheet se escribe con un timer corriendo.                                                            | timesheet P-05                     |
| TS-53 | Clockify, documentado       | Borrar una fila pide confirmación y no se deshace.                                                         | ya cerrada por P-06 del rastreador |

## 21. Reparto

El slice 13 del mapa depende de los slices 7 y 10. Este documento agrega dos
dependencias que el mapa no nombra, las dos ya antes en el orden:

- **Del slice 3**: el detalle de una celda (TS-41) es la edición de horas y
  fecha de una fila del rastreador, con TT-110 y TT-111.
- **Del slice 11**: el facturable por defecto de la entrada nueva (TS-30) y las
  etiquetas del detalle (TS-41). Si el slice 13 se adelantara, la entrada
  nacería no facturable y habría que volver a tocarla.

| Dónde             | Qué                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Slice 13          | TS-01, TS-02, TS-04 … TS-60, TS-75 … TS-118, salvo lo que el equipo saque al cerrar timesheet P-09 y P-10 |
| Fase 2, propuesto | TS-62 … TS-66 (plantillas), por timesheet P-09                                                            |
| Nunca             | TS-03, TS-61, TS-67 … TS-74                                                                               |

**El slice 13 cambia el esquema solo si P-09 trae las plantillas.** Las
celdas, las filas y la copia se resuelven con `time_entry` tal como queda
después del slice 11. Lo que sí trae es una mutación nueva en `time-entry`
(TS-32, TS-37, TS-39) y la excepción al ADR 0005, que tiene que estar escrita
antes del contrato.

## 22. Pendientes de definición del equipo

Numeración propia de este documento. Para no confundirla con la del rastreador,
la de proyectos ni la del perfil, se cita como `timesheet P-nn`.

### Abiertos

| ID   | Punto                                                                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | **Hora de inicio de la entrada que crea una celda** (TS-31). Propuesta: 09:00 fija. Si P-12 muestra que Clockify usa «Inicio del día» del perfil, entra ese ajuste y se cierra perfil P-02.    |
| P-02 | **El fin de la entrada de una celda es inicio más duración** (TS-32). Es una excepción al ADR 0005 y la tiene que registrar `architect` antes del contrato del slice 13. Propuesta: aceptarla. |
| P-03 | **Celdas con una y con varias entradas** (TS-33, TS-34, TS-42). Propuesta: con una, se edita su fin; con varias, solo desde el detalle. Depende de lo que muestre P-12.                        |
| P-04 | **Vaciar una celda o escribir cero** (TS-35). Propuesta: borra la entrada con el diálogo de TT-61.                                                                                             |
| P-05 | **Escribir con un timer corriendo** (TS-39). Propuesta: se puede, salvo en la celda del timer. TT-30 sigue valiendo solo para la barra.                                                        |
| P-06 | **La fila «Sin proyecto»** (TS-20). Propuesta: aparece si hay entradas sin proyecto y se puede agregar desde el selector.                                                                      |
| P-07 | **Las filas vacías no se guardan** (TS-19, TS-59). Propuesta: sin tabla de filas; se pierden al recargar.                                                                                      |
| P-08 | **Qué crea «actividades y tiempo»** (TS-60). Propuesta: una copia por entrada, con las mismas horas de pared siete días después.                                                               |
| P-09 | **Plantillas** (TS-62 … TS-66). Se pueden relevar y están en Free. Propuesta: fase 2, por la tabla nueva y por «Reemplazar».                                                                   |
| P-10 | **«Copiar semana anterior» en el slice 13** (TS-55 … TS-60). Propuesta: entra, con sus dos variantes.                                                                                          |
| P-11 | **El timesheet sin interruptor y sin volver obligatorio el proyecto** (TS-01, TS-02). Propuesta: así. Si algún día el proyecto pasa a ser obligatorio, es por P-01 del rastreador.             |
| P-12 | **Verificar en el workspace real** lo marcado como _no verificado_. La lista está abajo, con qué hacer en cada caso.                                                                           |

### P-12, la lista de verificación

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
