# Paridad: clientes, proyectos, tareas y etiquetas

Alcance de este documento: las cuatro entidades que el rastreador y el timesheet
consumen —`client`, `project`, `task`, `tag`—, sus campos, su ciclo de vida
(crear, archivar, restaurar, borrar), quién las ve y quién las toca, y qué le
pasa a una entrada de tiempo que ya las está usando. No cubre el rastreador
—está en [`time-tracker.md`](time-tracker.md)— ni reportes, ni facturas, ni
planificación, ni gastos.

Este relevamiento es la primera condición del
[ADR 0004](../adr/0004-nucleo-de-proyectos-en-fase-1.md): va antes del contrato
del slice 9. Cubre la fase 2 entera a nivel de entidad, no solo el núcleo; la
[sección 14](#14-qué-entra-en-el-núcleo-de-la-fase-1) separa qué parte entra en
la fase 1.

Cada comportamiento lleva un identificador `PR-nn` para que lo citen el reviewer
de paridad y los flujos de Playwright, y una marca `replicar`, `adaptar` o
`fuera de alcance`. Las dos últimas llevan una línea de justificación.

**El equipo cerró el 2026-10-02 los pendientes P-16 a P-32** que abrió la
primera versión de este documento. Las decisiones ya están incorporadas en cada
comportamiento; los identificadores se conservan en la
[sección 15](#15-pendientes-de-definición-del-equipo) porque los contratos de
slice los citan. Queda abierto uno solo, P-33, que es verificación contra el
workspace del equipo y no una decisión.

## Fuentes y límites del relevamiento

Documentación pública del centro de ayuda de Clockify y referencia pública de su
API:

- https://clockify.me/help/projects/creating-projects
- https://clockify.me/help/projects/managing-projects
- https://clockify.me/help/projects/managing-people-on-projects
- https://clockify.me/help/projects/working-with-tasks
- https://clockify.me/help/projects/project-filter
- https://clockify.me/help/projects/project-templates
- https://clockify.me/help/projects/manage-multiple-projects
- https://clockify.me/help/track-time-and-expenses/categorizing-time-entries
- https://clockify.me/help/administration/updates-to-clockify-free-plan
- https://clockify.me/help/administration/user-roles-and-permissions/manager-role
- https://clockify.me/help/administration/hourly-rates (facturable, de plan pago)
- https://docs.clockify.me/ (endpoints de project, client, task y tag)

_Agregado el 2026-10-05, slice 11_: la página de tarifas, y la de etiquetas
consultada de nuevo, para PR-21, PR-47, PR-48 y PR-112.

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Igual que en `time-tracker.md`, todo lo marcado como
_no verificado_ hay que confirmarlo abriendo el workspace antes de
implementarlo, y no lo di por cierto en ningún punto bloqueante.

### Dos clases de comportamiento que no son paridad

Este documento mezcla tres cosas y conviene no confundirlas al leerlo:

1. **Relevamiento.** Lo que la documentación pública dice. Va con la cita.
2. **Decisión del equipo.** Lo que Clockify no documenta o el plan Free no
   tiene, y el equipo resolvió igual porque hace falta para construir. Va con
   «decisión del equipo» y el pendiente que la cerró. **No es paridad y el
   reviewer no la compara contra Clockify**: la compara contra lo que dice acá.
3. **Diseño propio.** Lo mismo, pero donde además no existe ninguna referencia
   contra la cual compararse ni ahora ni después. Hoy hay una sola:
   el facturable (PR-21).

### Lo que el plan Free deja fuera de este módulo

Esto no es una nota al pie: es la mitad de la superficie del módulo en Clockify
y define el borde de lo relevable. Citas textuales de la documentación:

| Qué                             | Qué dice la documentación                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Proyectos privados              | «All projects on the Free plan are **Public** (visible to all workspace members).»                                            |
| Facturable                      | «The ability to toggle time entries as billable/non-billable and assign financial amounts to projects is part of paid plans.» |
| Tarifas e importes              | «You can no longer set hourly rates, assign dollar amounts to projects.»                                                      |
| Plantillas de proyecto          | «Project template is a paid feature, which you can enable by upgrading your workspace to any of the paid plans.»              |
| Edición masiva de proyectos     | «a paid feature, which you can enable by upgrading your workspace to any of the paid plans.»                                  |
| Quién crea proyectos y clientes | «This setting is set to **Anyone** and can not be changed on a **Free plan**.»                                                |

Las estimaciones, el presupuesto, el seguimiento de progreso, las tarifas por
tarea y los campos personalizados son del mismo grupo: existen en el producto,
no en el plan del equipo.

**El facturable es el caso especial del módulo.** El equipo decidió que entra
igual (P-16), pero entra **como diseño propio y no como paridad**: no hay nada
que relevar y no hay nada contra qué comparar. El slice 11 no pierde alcance;
pierde la referencia. Lo que dicen TT-14 y TT-15 de `time-tracker.md` quedó
reescrito en los mismos términos.

## Vocabulario

| Clockify          | Clock (interfaz en español) |
| ----------------- | --------------------------- |
| Client            | Cliente                     |
| Project           | Proyecto                    |
| Task              | Tarea                       |
| Tag               | Etiqueta                    |
| Public / Private  | Público / Privado           |
| Archive / Restore | Archivar / Restaurar        |
| Done              | Hecha                       |
| Project member    | Miembro del proyecto        |
| Project manager   | Responsable del proyecto    |
| Favorite          | Favorito                    |
| Estimate          | Estimación                  |

`adaptar`: la interfaz va en español y toda la copia visible se traduce. No se
vuelve a justificar en cada comportamiento. «Responsable del proyecto» traduce a
_project manager_ y se distingue a propósito del rol de workspace
`project_manager`; ver PR-19.

La regla de **una redacción por causa** de `time-tracker.md` sigue valiendo: los
mensajes «Ese proyecto ya no está disponible.» (TT-77) y «Esa etiqueta ya no
está disponible.» (TT-78) ya existen y este documento los reusa en vez de
escribir los suyos.

## 1. Cliente

**PR-01 Campos del cliente** — `adaptar`
Clockify tiene nombre, dirección, nota, moneda, correo y hasta tres correos en
copia. Acá: nombre, dirección, nota y archivado. Justificación: el correo y los
correos en copia solo sirven para mandar facturas, y la moneda para tarifas;
ninguna de las dos cosas existe en el plan del equipo (PR-11). La dirección y la
nota entran por decisión del equipo (P-31): son dos campos de texto y tener
dónde anotar el dato del cliente no depende de ninguna pantalla futura.
_No verificado_: los largos que da la referencia de la API —nombre hasta 100
caracteres, dirección y nota hasta 3000— salen de la referencia pública y no
los pude confirmar contra el producto. El del nombre se adopta igual (PR-54).

**PR-02 El nombre del cliente es obligatorio** — `replicar`
Es el único campo requerido al crear. La dirección y la nota son opcionales y
su ausencia se guarda como cadena vacía, igual que la descripción de una entrada
(ver el esquema de `time_entry`).

**PR-03 Quién crea un cliente** — `replicar`
Lo decide la configuración «Who can create projects and clients», la misma que
gobierna los proyectos: admins, admins y responsables de proyecto, o cualquiera.
En el plan Free está fijada en «cualquiera» y no se puede cambiar. Ver PR-59.

**PR-04 Crear un cliente desde el diálogo de proyecto** — `adaptar`
Documentado: al crear un proyecto se puede elegir un cliente existente o crear
uno nuevo ahí mismo. Acá el camino de creación de la fase 1 es uno solo y
separado por entidad. Justificación: es el mismo criterio con el que TT-09 dejó
fuera «crear proyecto desde el selector»; el atajo se agrega después sin tocar
el modelo.

**PR-05 Archivar un cliente** — `replicar`
Documentado: «Only owners and admins of the workspace can archive clients.» El
cliente archivado deja de ofrecerse al asignar un proyecto y sigue existiendo
con todos sus datos.

**PR-06 Al archivar un cliente se ofrece archivar sus proyectos** — `replicar`
Documentado: «There you will also have the option to archive all projects
assigned to that client.» Es una opción, no un efecto automático: un cliente
archivado puede quedar con proyectos activos, y esos proyectos siguen
apareciendo en el selector del rastreador.

**PR-07 Restaurar un cliente** — `replicar`
Desde la lista con el filtro de archivados. Restaurar el cliente no restaura los
proyectos que se archivaron con él.
_No verificado_: que la restauración no sea en cascada es lo simétrico a PR-06,
que sí es explícito, pero la documentación no lo dice.

**PR-08 Un cliente se borra solo después de archivarlo** — `replicar`
Documentado: «Clients can only be deleted after being archived», y solo owners y
admins. El borrado es en dos pasos a propósito y es la misma forma en proyectos
(PR-25) y etiquetas (PR-46).

**PR-09 Los proyectos de un cliente borrado quedan sin cliente** — `adaptar`
Decisión del equipo (P-21): la documentación no dice nada y la regla es que el
proyecto sobrevive y queda sin cliente, igual que una entrada sobrevive a su
proyecto borrado (PR-64). Justificación: la alternativa —borrar los proyectos en
cascada— arrastraría entradas de tiempo detrás de un borrado de cliente, que es
exactamente lo que PR-64 dice que no pasa nunca. Define la clave foránea:
`project.client_id` nulable con `on delete set null`.

**PR-10 El cliente no toca las entradas de tiempo** — `replicar`
Una entrada apunta a un proyecto y a una tarea, nunca a un cliente. El cliente
llega a la entrada solo a través del proyecto, para agrupar el selector (TT-07)
y para los reportes. Archivar o borrar un cliente no cambia ninguna entrada.

**PR-11 Moneda y correos del cliente** — `fuera de alcance`
Justificación: solo sirven a facturación y tarifas, que son de plan pago y no se
relevan. El workspace ya tiene su `currency` y alcanza (P-32).

## 2. Proyecto

### 2.1 Campos e identidad

**PR-12 Campos del proyecto** — `adaptar`
Clockify tiene nombre, cliente, color, visibilidad pública o privada, tarifa,
estimación, plantilla, nota, estado de progreso, tareas, miembros y responsables.
Acá: nombre, cliente, color, público o privado, archivado, nota, facturable por
defecto, miembros y responsables. Justificación: tarifa, estimación, plantilla y
estado de progreso son de plan pago y no se relevan (P-32); la nota entra por la
misma decisión que la del cliente (P-31) y el facturable por P-16, como diseño
propio.

**PR-13 El nombre del proyecto es obligatorio** — `replicar`
Es el único campo requerido al crear.

**PR-14 El cliente es opcional** — `replicar`
Un proyecto puede no tener cliente. El selector del rastreador los agrupa igual
(TT-07): los proyectos sin cliente van en su propio grupo.
_No verificado_: el rótulo de ese grupo en Clockify («Without client» o
similar); acá va «Sin cliente», en línea con «Sin proyecto» de TT-50.

**PR-15 Color del proyecto** — `adaptar`
Documentado: se elige de una paleta o de un selector de color, y se pueden
guardar hasta ocho colores propios. Acá, por decisión del equipo (P-30): una
paleta fija nuestra, sin colores propios y sin selector libre, y el color es
obligatorio —si no se elige, se asigna uno de la paleta—. El color es lo que
dibuja el punto de la fila y del selector (TT-06, TT-49). Justificación: la
paleta de Clockify no está documentada, así que no hay nada que copiar, y los
colores propios por persona son una tabla más para una diferencia visual.
La paleta concreta la fija el contrato del slice 9; el requisito es que los
colores se distingan entre sí en un punto de ocho píxeles.

### 2.2 Qué significa «privado», que es lo que condiciona `can()`

**PR-16 Proyecto público** — `replicar`
Documentado, textual: «Accessible to all workspace users», «Everyone can select
the project when tracking time», «Everyone can see all time entries for that
project in reports». Un proyecto público lo ve y lo elige cualquier membresía
activa del workspace, esté asignada o no.

**PR-17 Proyecto privado** — `adaptar`
Documentado, textual: «Only accessible to project members», «Only project
members can select the project when tracking time», «Only project managers can
see all tracked time on their projects in reports». Es decir: la pertenencia al
proyecto es lo único que habilita a ver y a elegir un proyecto privado, y ni
siquiera un admin lo elige sin ser miembro.
Decisión del equipo (P-17): **se modelan la columna, la tabla de miembros y el
filtro de lectura desde el slice 9, y todo proyecto se crea público**. Ninguna
pantalla ofrece marcar un proyecto como privado en la fase 1. Justificación:
TT-08 ya está escrito como «los proyectos a los que la persona está asignada,
más los públicos», así que el filtro tiene que existir igual; y agregar la
columna ahora es barato, mientras que convertir después una tabla de proyectos
sin visibilidad es una migración con datos adentro.

**PR-18 Miembros y grupos de un proyecto** — `adaptar`
Documentado: se agregan personas o grupos desde la pestaña de acceso del
proyecto, y «People will automatically get access to the project once you add
them (meaning, there's no project invite)»; solo se puede agregar a quien ya
está en el workspace. Acá se replican las personas y **no** los grupos (PR-20).
El alta no genera invitación ni notificación: la persona ve el proyecto en el
selector en cuanto se agrega.

**PR-19 El creador de un proyecto queda como su responsable** — `replicar`
Documentado: «The person who creates the project automatically becomes its
project manager», con derecho a ver y editar el proyecto, sus tareas y su
acceso, a borrarlo y a ver todo el tiempo imputado. En Clockify «project
manager» es una condición **por proyecto**, no un rol de workspace.
Decisión del equipo (P-24): **la marca de responsable vive en la tabla de
miembros de proyecto y `can()` la recibe como parte del recurso**, no se
aproxima con el rol de workspace `project_manager`. Define el esquema: la tabla
de miembros lleva `(project_id, user_id, is_manager)` y el `Resource` de `can()`
gana una variante de proyecto que transporta esa marca. Justificación: aproximar
con el rol de workspace es más permisivo que el original —haría responsable de
todos los proyectos a quien lo es de los suyos— y esa diferencia se paga cara
cuando ya hay proyectos cargados.

**PR-20 Grupos de usuarios** — `replicar`
Clockify permite asignar un grupo entero a un proyecto o a una tarea.
Decisión del equipo (P-25): **no entra en la fase 1, queda para la fase 2**. No
existe ninguna tabla de grupos en el modelo y crearla arrastra su propia
administración. Hasta que exista, el acceso a proyectos y los asignados de tarea
son solo por persona.

**PR-21 Facturable por defecto del proyecto** — `adaptar`
El proyecto decide con qué valor de facturable arranca una entrada nueva
(TT-14): si el proyecto es facturable, la entrada arranca facturable; sin
proyecto, arranca no facturable.
**Esto es diseño propio, no paridad** (P-16): la documentación dice que marcar
facturable es de plan pago, así que no es relevable en el workspace del equipo y
no hay comportamiento original contra el cual compararlo. El equipo lo quiere
igual y el plan lo incluye. Justificación de la marca `adaptar`: es un
comportamiento nuestro con forma de Clockify, y el reviewer de paridad lo
compara contra este documento y no contra el producto. Lo que nunca entra es lo
que cuelga del facturable en Clockify —tarifas, importes, facturas—, que es
pago y además no se pidió (PR-29).

_Agregado el 2026-10-05_. Relevamiento, de plan pago: la página de tarifas dice
«You can set projects or individual tasks to be billable or non-billable by
default, which means all new entries will initially be set according to what
you choose.», y que se cambia desde la pestaña **Settings** de un proyecto ya
creado. No dice qué pasa al cambiarle el proyecto a una entrada que ya existe.
El facturable por defecto de la tarea y el interruptor de workspace «Activate
billable hours», que la misma página nombra, no entran: son de la misma familia
paga (P-32) y nadie los pidió.

Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md):

- **Se elige al crear el proyecto**, con la casilla «Facturable por defecto»,
  sin marcar, y la ayuda «Las entradas nuevas con este proyecto arrancan
  facturables.». En Clockify es un interruptor de la configuración de un
  proyecto ya creado; acá va en el alta porque la fase 1 no edita proyectos
  (§14.3), y editarlo después sigue siendo de la fase 2.
- **Elegir otro proyecto para una entrada que ya existe le impone su facturable
  por defecto**; «Sin proyecto» y cambiar solo la tarea lo conservan. Decisión
  del equipo del 2026-10-05; el detalle está en TT-14.

### 2.3 Ciclo de vida

**PR-22 Archivar un proyecto** — `replicar`
Documentado: «All its data is still available» y «Project's time entries will
still be shown in reports». Archivar no borra nada ni toca ninguna entrada. Al
archivar se ofrece además marcar todas sus tareas como hechas, que es una opción
del diálogo y no un efecto automático.

**PR-23 Un proyecto archivado no se puede elegir para una entrada nueva** —
`replicar`
Documentado: el proyecto archivado desaparece del selector salvo que se filtre
expresamente por archivados. Es exactamente TT-08 visto desde este lado, y con
TT-104 completa el par: la entrada que ya lo tenía lo conserva y lo muestra.
El pedido que llegue igual desde una pestaña desactualizada se responde con
«Ese proyecto ya no está disponible.» (TT-77).

**PR-24 Restaurar un proyecto** — `replicar`
Documentado, textual: «To restore an archived project, click three dots next to
it and select Restore.» Vuelve a aparecer en el selector. Las tareas que se
marcaron como hechas al archivar no se desmarcan solas.
_No verificado_: lo último es lo simétrico de PR-22 pero no está escrito.

**PR-25 Un proyecto se borra solo después de archivarlo** — `replicar`
Documentado: «Projects can only be deleted after being archived.» El diálogo
pide confirmación.

**PR-26 Borrar un proyecto no borra las horas** — `replicar`
Documentado, textual: «Deleting a project will remove it from all time entries
it is assigned to, but time will remain.» Es la frase más importante de este
documento para el modelo de datos; está desarrollada en la
[sección 8](#8-archivar-o-borrar-algo-que-una-entrada-ya-usa).

**PR-27 Favoritos** — `adaptar`
Documentado: se puede marcar un proyecto o una tarea como favorito para que
aparezca arriba en el selector, hace falta activar antes el interruptor
«Project favorites» del workspace, y «Favorite projects are user specific. When
you mark some project as a favorite, this doesn't affect other users».
Decisión del equipo (P-26): **no entra en la fase 1, queda para la fase 2**, y
cuando entre va sin el interruptor de workspace: una tabla `(user_id,
project_id)` y nada más. Justificación: es una preferencia por persona que no
cambia ningún otro comportamiento, y un interruptor para habilitar una
preferencia personal es configuración de más.
_No verificado_: si el interruptor de favoritos existe en el plan Free. Deja de
importar con esta decisión, así que no entra en la lista de P-33.

**PR-28 Plantillas de proyecto** — `fuera de alcance`
Justificación: funcionalidad paga, no relevable (P-32). Además, lo que copian
—tarifas, estimaciones, tareas, equipo y campos personalizados— es casi todo
fuera de alcance por su cuenta.

**PR-29 Estimaciones, presupuesto, progreso, tarifas y alertas** —
`fuera de alcance`
Justificación: todas pagas, no relevables (P-32).

**PR-30 Nota del proyecto** — `adaptar`
Clockify tiene una nota con formato por proyecto. Acá entra como campo de texto
sin formato, por la misma decisión que la nota del cliente (P-31).
Justificación: el formato arrastra un editor y una sanitización; el campo
resuelve lo que la nota resuelve —dejar anotado el contexto del proyecto— sin
ninguna de las dos cosas.

### 2.4 La pantalla de proyectos

**PR-31 Lista de proyectos** — `adaptar`
Documentado a medias: hay una lista con buscador, un filtro de estado que
distingue activos, archivados y todos, y un menú de tres puntos por fila con
archivar, restaurar y borrar. Acá: tabla con nombre y punto de color, cliente,
acceso, cantidad de tareas y tiempo imputado; buscador por nombre y por cliente;
filtro de estado con los mismos tres valores, en activos por defecto; orden
alfabético. Justificación: las columnas exactas de Clockify no están en la
documentación pública, así que la composición de la tabla es nuestra.
_No verificado_: columnas, orden por defecto y filtros adicionales (por cliente,
por acceso).

**PR-32 Edición masiva de proyectos** — `fuera de alcance`
Justificación: la documentación la marca como paga; no se puede relevar (P-32).
Nota: el borrado masivo de tareas de Clockify vive dentro de esa edición masiva,
así que también cae.

**PR-33 Fusionar proyectos** — `fuera de alcance`
Documentado: no existe como función; el camino es reasignar las entradas en el
reporte detallado con edición masiva y después archivar y borrar el proyecto
vacío. Justificación: no hay nada que replicar, y el camino que la documentación
propone depende del reporte detallado, que es de otra fase.

**PR-34 Exportar proyectos** — `fuera de alcance`
Justificación: los exportes CSV y Excel son pagos en Free y el módulo de
reportes es de otra fase.

## 3. Tarea

**PR-35 La tarea pertenece a un proyecto** — `replicar`
Documentado: la tarea es «an extra layer of hierarchy within a project,
functioning like sub-projects». No existe tarea sin proyecto, el `projectId` es
obligatorio al crearla, y una tarea no se comparte entre proyectos. Es lo que
TT-11 y TT-70 ven desde el rastreador.

**PR-36 Campos de la tarea** — `adaptar`
Clockify tiene nombre, asignados, estimación, tarifa y estado. Acá: nombre,
proyecto, estado y asignados. Justificación: estimación y tarifa son pagas
(P-32).

**PR-37 Asignados de la tarea** — `replicar`
Documentado: el asignado se elige entre personas, grupos o «Anyone»; con
«Anyone», «Everyone who has access to the project can track time on the task»;
con una persona o un grupo, solo esa persona o ese grupo puede imputar a la
tarea.
**Es una regla de acceso, no una etiqueta informativa**: restringe el selector
por debajo del acceso al proyecto, y quien la implemente como una lista
decorativa de nombres va a estar dejando imputar a quien no corresponde.
Decisión del equipo (P-23): **la tabla de asignados se crea en la fase 1 y la
regla se aplica en la fase 2**, junto con el resto de los permisos de proyecto.
Hasta entonces toda tarea se comporta como «cualquiera», que es el valor por
defecto del original. Los grupos quedan fuera mientras no existan (PR-20).

**PR-38 Marcar una tarea como hecha** — `replicar`
Documentado: la tarea hecha queda «Hidden from the main project page and the
time tracking picker (unless you select Show done or Show all)», y «Time entries
for done tasks will still appear in reports». O sea: el estado de la tarea es el
mismo mecanismo que el archivado del proyecto —deja de ofrecerse, no desaparece—
y las entradas que ya la tienen no se tocan. Los dos estados son `active` y
`done`.

**PR-39 Borrar una tarea** — `replicar`
Documentado, textual: «All time entries associated with the deleted task will
become without a task but will still be linked to the project.» La entrada
pierde la tarea y conserva el proyecto y las horas.

**PR-40 Quién crea, edita y borra tareas** — `adaptar`
Documentado: la creación la gobierna una configuración de workspace con los
mismos tres valores que la de proyectos, y «Only admins and project managers can
delete tasks». Acá la creación y el borrado siguen el rol y la marca de
responsable del proyecto, igual que el resto del módulo (PR-55 … PR-59): crean
tareas el owner, los admins y el responsable del proyecto. Es la regla de
`task.create` que trae el slice 9.
_No verificado_: la misma página se contradice sobre el valor por defecto de esa
configuración. El texto dice «By default, anyone in the workspace can create a
task. If you subscribe to a paid plan, you can change this permission», y la
tabla de valores de la misma página marca «Admins (Default)». No lo doy por
relevado. Si en el plan Free crea tareas cualquiera, la regla de acá deja de ser
paridad: ver PR-58.
_Corregido el 2026-10-03, relevamiento_: las dos lecturas que se contradecían
son de la misma página y ahora van citadas, y la regla de creación queda escrita
en vez de remitida.

**PR-41 Estimación y tarifa por tarea** — `fuera de alcance`
Justificación: pagas, no relevables (P-32).

## 4. Etiqueta

**PR-42 Las etiquetas son del workspace** — `replicar`
Documentado: «Tags work regardless of the project, so you can create one tag,
use it on multiple projects and filter reports based on them.» No cuelgan del
proyecto ni del cliente. Una tabla plana por workspace y una tabla de unión con
la entrada.

**PR-43 Campos de la etiqueta** — `replicar`
Nombre y archivado. No tiene color ni descripción.

**PR-44 Quién crea, edita y borra etiquetas** — `replicar`
Documentado: «Everyone can create tags (though you can limit creation to Admins
only in workspace settings)», y editar y borrar es solo de admins. Es la única
entidad del módulo con la creación abierta por defecto y la edición cerrada.

**PR-45 Archivar y restaurar una etiqueta** — `replicar`
Desde la lista de etiquetas, con el mismo filtro de archivados que proyectos. La
etiqueta archivada deja de ofrecerse en el selector del rastreador (TT-12) y el
pedido que llegue igual se responde con «Esa etiqueta ya no está disponible.»
(TT-78).

**PR-46 Borrar una etiqueta solo después de archivarla, y se quita de las
entradas** — `replicar`
Documentado: «Tags first need to be archived in order to be deleted» y «All
deleted tags will be removed from time entries they are assigned to». **Esto
cierra el _no verificado_ de TT-105**: la etiqueta borrada desaparece de la
entrada, confirmado en la documentación pública.

**PR-47 Una etiqueta archivada en una entrada que ya la tiene** — `adaptar`
Decisión del equipo (P-22): la entrada la conserva y la muestra, y el selector
no la ofrece para entradas nuevas. La documentación no dice nada al respecto.
Justificación: es la misma regla que TT-104 aplica al proyecto archivado, y la
alternativa —que desaparezca— convertiría al archivado en un borrado silencioso.

_Agregado el 2026-10-05_. Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): en
el selector de esa entrada, la etiqueta archivada aparece marcada, con
«(archivada)» después del nombre, en su lugar del orden alfabético. Se puede
desmarcar; cerrado el selector, la entrada ya no la tiene y no vuelve a
ofrecerse. Conservarla mientras se agrega otra no la valida de nuevo: solo se
validan las etiquetas que la entrada todavía no tiene. Continuar o duplicar esa
entrada se rechaza con TT-78 (TT-57, TT-58). _No verificado_ (P-33): cómo la
muestra Clockify.

**PR-48 Varias etiquetas por entrada** — `replicar`
Documentado: una entrada puede llevar más de una etiqueta. Sin tope conocido.
_No verificado_: si Clockify limita la cantidad.

_Agregado el 2026-10-05_. **Acá, hasta 50 por entrada**: límite propio, como el
de 200 entradas de TT-63, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md)
(decisión del equipo del 2026-10-05). Hace falta para el esquema y para que una
sola mutación no escriba sin cota; nadie llega a 50. Con más, el servidor
responde «Se pueden elegir hasta 50 etiquetas por entrada.». Una etiqueta no se
repite en una entrada. Relevado sin resultado: la página de etiquetas dice «You
can create as many tags as you want.», que habla del catálogo del workspace y
no de la entrada, y no encontré un tope para `tagIds` en la referencia pública
de la API. Si el workspace del equipo muestra un tope menor, se corrige (P-33).

**PR-112 Dónde se crean y se ven las etiquetas en la fase 1** — `adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._
Documentado: Clockify tiene una página de etiquetas en el menú lateral, donde se
crean —«Go to Tags page from sidebar», «Type tag name and click ADD»— y donde se
archivan, restauran y borran desde los tres puntos de cada una, con el filtro
«Show archived» / «Show all» (PR-45, PR-46). También se crean desde el selector
(TT-13).
Acá, en la fase 1, se crean y se ven en `/proyectos`: la cabecera suma «Nueva
etiqueta» con `tag.create`, que abre un diálogo con el nombre, como el de
cliente, y una sección «Etiquetas», después de los proyectos, lista las activas
en orden alfabético, sin acciones por etiqueta. Sin ninguna, la sección dice
«Todavía no hay etiquetas». Justificación: PR-04 deja un solo camino de alta
por entidad y en la fase 1 ese camino es `/proyectos`; la página propia, con su
filtro y sus acciones, es administración y llega con la fase 2 sin tocar el
modelo ([ADR 0016](../adr/0016-las-etiquetas-son-del-modulo-de-proyectos.md)).
Decisión del equipo del 2026-10-05, fijada en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md).

## 5. Unicidad y colisiones

**Nada de esta sección es relevamiento.** La documentación pública no dice que
los nombres sean únicos, para ninguna de las cuatro entidades, ni describe qué
pasa al repetir uno, ni habla de mayúsculas. Todo lo que sigue es **decisión del
equipo** (P-19), tomada porque de acá salen los índices, y el reviewer la
compara contra este documento y no contra Clockify.

**PR-49 Unicidad del nombre de cliente** — `adaptar`
Único por workspace, sin distinguir mayúsculas y con los espacios de los
extremos recortados antes de comparar y de guardar.

**PR-50 Unicidad del nombre de proyecto** — `adaptar`
Único por workspace **y cliente**, sin distinguir mayúsculas. Dos proyectos
«Rediseño» de clientes distintos conviven; dos del mismo cliente, no.
Justificación: el selector agrupa por cliente (TT-07), así que dos homónimos de
clientes distintos se distinguen en pantalla y dos del mismo cliente son
indistinguibles. Los proyectos sin cliente forman un grupo más a estos efectos,
lo que en Postgres pide un índice sobre una expresión —`coalesce(client_id, …)`
con un UUID centinela— porque `null` no colisiona con `null`.

**PR-51 Unicidad del nombre de tarea** — `adaptar`
Única por proyecto, sin distinguir mayúsculas.
_No verificado_: una lectura de la página de tareas afirmaba que Clockify lo
exige y otra de la misma página no lo encontró. La regla se adopta como decisión
propia, no como paridad.

**PR-52 Unicidad del nombre de etiqueta** — `adaptar`
Única por workspace, sin distinguir mayúsculas.

**PR-53 Los archivados cuentan para la unicidad** — `adaptar`
Sí: el índice no mira el estado. Justificación: si no contaran, restaurar un
archivado podría chocar con un nombre creado mientras tanto y la restauración
fallaría en un momento en el que la persona no puede hacer nada al respecto.

**PR-54 Largo máximo de los nombres** — `adaptar`
100 caracteres para las cuatro entidades, validado en el esquema Zod y con
`check` en la base, igual que los 3000 de la descripción de la entrada (TT-05).
El del cliente sale de la referencia pública de la API; los otros tres son
nuestros, por coherencia (P-20). La dirección y las notas van a 3000, el mismo
tope que la descripción de una entrada.

## 6. Permisos por rol

Los cinco roles del modelo son los de Clockify, pero el reparto de atribuciones
sobre este módulo no se mapea limpio. Lo relevado y lo decidido:

**PR-55 Owner y admin** — `replicar`
Control total sobre proyectos, clientes, tareas y etiquetas: crear, editar,
archivar, restaurar y borrar. Archivar y borrar clientes es solo de ellos
(PR-05, PR-08); editar y borrar etiquetas también (PR-44).

**PR-56 Responsable de proyecto** — `replicar`
Documentado: ve todo el tiempo imputado a sus proyectos y puede editar el
proyecto, sus tareas y su acceso, y borrarlo. No tiene atribuciones sobre
clientes ni sobre etiquetas. «Sus proyectos» son los proyectos de los que es
responsable, no todos, y eso se resuelve con la marca de PR-19: `can()` decide
con la membresía de proyecto que viaja en el recurso. El rol de workspace
`project_manager` no alcanza por sí solo para tocar un proyecto del que no se es
responsable.

**PR-57 Team manager** — `replicar`
No tiene ninguna atribución sobre este módulo: su alcance son las personas y sus
horas, no los proyectos. En la tabla de `can()` queda igual que `member` para
todas las acciones de proyectos, clientes, tareas y etiquetas.

**PR-58 Member** — `adaptar`
En el plan Free crea proyectos y clientes, porque la configuración está fijada
en «cualquiera» y no se puede cambiar, y queda responsable de lo que crea
(PR-19). Puede crear etiquetas. Crea tareas solo en los proyectos de los que es
responsable, por la regla de PR-40. No archiva ni borra lo que no es suyo.
Justificación: lo relevable es el comportamiento del plan Free.
**Pendiente de verificación (P-33)**: la regla de las tareas no está relevada.
Si el workspace del equipo muestra que en el plan Free un `member` crea tareas
en cualquier proyecto que ve —la lectura del texto de la página de tareas, ver
PR-40—, el equipo tiene que elegir entre cambiar `task.create` en `can()` o
registrar acá la divergencia con su motivo. Hoy no hay ningún motivo escrito
para divergir: el contrato del slice 9 adopta la regla por coherencia con
PR-56, no por una razón de producto.
_Corregido el 2026-10-03, revisión del slice 9 (M-5)_: decía «Puede crear
etiquetas y tareas», que contradecía sin decirlo el criterio 7 del contrato del
slice 9, donde un `member` que no es responsable recibe PR-84.

**PR-59 Quién crea, en la fase 1** — `adaptar`
`workspace_settings.whoCreatesProjects` ya existe, con los tres valores
`everyone`, `managers` y `admins`, que son exactamente los tres de Clockify.
Decisión del equipo (P-18): **en la fase 1 el valor se congela en `everyone`**,
que es el comportamiento del plan Free y del workspace del equipo, la
configuración editable queda para la fase 2, y **el valor no entra todavía como
dato del actor en `can()`**: la acción de crear la habilita el rol, y todos los
roles la tienen.
Esto obliga a un cambio de esquema que el slice 9 tiene que traer: hoy el
`default` de la columna es `admins`, que contradice la decisión. **No lo toqué**
—no escribo código— y va con su migración, porque cambiar el `default` sin
migración deja la base y el esquema desalineados.

**PR-60 Una membresía que no está activa no puede nada** — `replicar`
Igual que en el rastreador (TT-66, TT-92): `can()` ya corta por `status` antes
que por rol, y eso vale para las acciones nuevas sin cambios.

## 7. Qué ve cada persona

**PR-61 La lista de proyectos muestra solo lo accesible** — `replicar`
Una persona ve los proyectos públicos y los privados de los que es miembro, en
cualquier pantalla donde aparezca un proyecto: el selector del rastreador
(TT-08), la lista de proyectos y el timesheet. Admins y owners ven todos.
Con todos los proyectos públicos (PR-17), en la fase 1 el filtro no esconde nada
—pero existe, y es el mismo en las tres pantallas.

**PR-62 Clientes, tareas y etiquetas no tienen acceso propio** — `replicar`
El cliente se ve si se ve alguno de sus proyectos. La tarea se ve si se ve su
proyecto, con el agregado de PR-37 cuando la regla de asignados empiece a
aplicarse. Las etiquetas las ve todo el workspace. Ninguna de las tres tiene
lista de miembros.

_Pendiente para la fase 2, anotado el 2026-10-03_: el slice 9 lista todos los
clientes activos en el selector del diálogo de proyecto. En la fase 1 no hay
conflicto, porque todos los proyectos son públicos. Con proyectos privados,
quien no ve ningún proyecto de un cliente lo vería igual en ese selector. Aplicar
PR-62 al pie de la letra ahí implica que un cliente recién creado y sin
proyectos no se puede elegir: es una decisión de paridad para la fase 2.

## 8. Archivar o borrar algo que una entrada ya usa

Es la pregunta que más caro sale equivocar y es la mejor documentada de todo el
módulo. Las filas marcadas «documentado» son citas textuales de la
documentación pública.

| ID    | Qué pasa                                     | Efecto sobre la entrada                                           | Fuente                  |
| ----- | -------------------------------------------- | ----------------------------------------------------------------- | ----------------------- |
| PR-63 | Se archiva el proyecto                       | No se toca. Conserva el proyecto, lo muestra y suma a los totales | documentado (TT-104)    |
| PR-64 | Se borra el proyecto                         | Pierde el proyecto, **conserva las horas**                        | documentado             |
| PR-65 | Se marca la tarea como hecha                 | No se toca. Conserva la tarea y la muestra                        | documentado             |
| PR-66 | Se borra la tarea                            | Pierde la tarea, **conserva el proyecto y las horas**             | documentado             |
| PR-67 | Se borra el proyecto que tiene tareas        | Pierde proyecto y tarea, conserva las horas                       | derivado, no verificado |
| PR-68 | Se archiva la etiqueta                       | La conserva y la muestra                                          | decisión, P-22          |
| PR-69 | Se borra la etiqueta                         | La etiqueta se quita de la entrada (cierra TT-105)                | documentado             |
| PR-70 | Se archiva o se borra el cliente             | No se toca: la entrada no apunta al cliente (PR-10)               | derivado                |
| PR-71 | Se quita a la persona de un proyecto privado | No se toca. Sigue viendo sus entradas, con el nombre del proyecto | decisión, P-27          |

**PR-63 … PR-71** — `replicar` las documentadas, `adaptar` PR-68 y PR-71.

**PR-71** con su detalle, porque es el único que no sale de ninguna fuente: la
persona que queda fuera de un proyecto privado **sigue viendo sus propias
entradas, con el nombre y el color del proyecto**, porque TT-01 manda y esas
entradas son suyas. Lo que pierde es el proyecto en el selector: no puede
imputar más ahí. La lectura de una entrada propia no pasa por el filtro de
acceso al proyecto; el selector sí.

Traducido al esquema, que es para lo que sirve esta sección:

- `time_entry.project_id` y `time_entry.task_id` nulables, las dos con
  `on delete set null`. Nunca `cascade`: una entrada no se borra nunca por
  borrar un proyecto o una tarea.
- Borrar un proyecto tiene que anular también el `task_id` de sus entradas, no
  solo el `project_id`. Una entrada con tarea y sin proyecto es un estado
  imposible (PR-35) y la base lo impide con un `check`. **Por eso la base
  rechaza el borrado directo de un proyecto que tiene tareas y entradas**: el
  borrado falla con `time_entry_task_needs_project`, porque los triggers de la
  cascada hacia las tareas se encolan después de los del proyecto y la entrada
  queda un instante con tarea y sin proyecto. El borrado de la fase 2 se hace en
  dos sentencias dentro de una transacción: primero las tareas del proyecto,
  que anulan el `task_id` de sus entradas, y después el proyecto, que anula el
  `project_id`. La entrada termina igual que dice PR-67: sin proyecto, sin tarea
  y con sus horas.
  _Corregido el 2026-10-03, revisión del slice 9 (M-1), verificado contra
  Postgres_: decía que, si las tareas se iban en cascada con el proyecto, el
  `set null` de la tarea lo resolvía solo.
- La unión `time_entry` ↔ `tag` con `on delete cascade` del lado de la etiqueta:
  borrar la etiqueta saca la fila de la unión y no toca la entrada.
- `project.client_id` nulable con `on delete set null` (PR-09).
- La tabla de miembros de proyecto lleva la marca de responsable (PR-19) y la de
  asignados de tarea existe desde la fase 1 aunque su regla se aplique en la
  fase 2 (PR-37).
- El archivado es una columna de estado en las tres entidades archivables
  —cliente, proyecto, etiqueta— y el estado de la tarea es un enum de dos
  valores. Ninguno de los cuatro es un borrado lógico: no esconden la fila de
  las lecturas, solo del selector.
- Borrar es físico y en dos pasos: solo se puede borrar lo que está archivado
  (PR-08, PR-25, PR-46). La copia de la fila borrada queda en el audit log, como
  en TT-61.

## 9. Validaciones y mensajes

Los mensajes son nuestros: la copia de Clockify está en inglés. Lo que se
replica es la regla. Los dos primeros ya existen en `time-tracker.md` y se
reusan tal cual por la regla de una redacción por causa.

| ID    | Regla                                             | Mensaje                                               | Marca      |
| ----- | ------------------------------------------------- | ----------------------------------------------------- | ---------- |
| PR-72 | Proyecto inexistente, archivado o sin acceso      | «Ese proyecto ya no está disponible.» (TT-77)         | `adaptar`  |
| PR-73 | Etiqueta inexistente o archivada                  | «Esa etiqueta ya no está disponible.» (TT-78)         | `adaptar`  |
| PR-74 | Tarea inexistente, hecha o de otro proyecto       | «Esa tarea ya no está disponible.»                    | `adaptar`  |
| PR-75 | Nombre vacío                                      | «El nombre no puede estar vacío.»                     | `adaptar`  |
| PR-76 | Nombre demasiado largo                            | «El nombre no puede superar los 100 caracteres.»      | `adaptar`  |
| PR-77 | Nombre de proyecto repetido para el mismo cliente | «Ya hay un proyecto con ese nombre para ese cliente.» | `adaptar`  |
| PR-78 | Nombre de cliente repetido                        | «Ya hay un cliente con ese nombre.»                   | `adaptar`  |
| PR-79 | Nombre de tarea repetido en el proyecto           | «Ya hay una tarea con ese nombre en el proyecto.»     | `adaptar`  |
| PR-80 | Nombre de etiqueta repetido                       | «Ya hay una etiqueta con ese nombre.»                 | `adaptar`  |
| PR-81 | Borrar sin archivar antes                         | «Archivá el proyecto antes de borrarlo.»              | `adaptar`  |
| PR-82 | Tarea sin proyecto                                | «Elegí un proyecto antes que una tarea.» (TT-70)      | `replicar` |
| PR-83 | Cliente inexistente o archivado al asignarlo      | «Ese cliente ya no está disponible.»                  | `adaptar`  |
| PR-84 | Sin permiso para crear o modificar                | «No tenés permiso para hacer esto.» (TT-79)           | `replicar` |

- **PR-74**: una tarea marcada como hecha se rechaza para una entrada nueva por
  la misma razón que el proyecto archivado (PR-38), y la entrada que ya la tiene
  no se toca (PR-65).
- **PR-76 … PR-80**: son la cara visible de las decisiones de la sección 5. Si
  alguna vez se revierte una de esas decisiones, la fila que le corresponde
  desaparece con su índice.
- **PR-81**: el mismo texto, cambiando el sustantivo, para cliente y etiqueta.

## 10. Estados vacíos

**PR-85 Workspace sin proyectos** — `adaptar`
Ya está relevado desde el rastreador (TT-87): el selector abre con «No hay
proyectos todavía» y, si `project.create` lo permite, el enlace «Ir a
Proyectos». La pantalla de proyectos vacía muestra «Todavía no hay proyectos» y
el botón de crear, que con PR-59 ve cualquier membresía activa. Justificación:
copia propia.
_Corregido el 2026-10-04_: decía «si el rol lo permite, un enlace a la pantalla
de proyectos»; se alinea con TT-87.

**PR-86 Workspace sin clientes** — `adaptar`
El campo de cliente del diálogo de proyecto queda vacío y sigue siendo opcional
(PR-14): un workspace sin clientes es un estado normal, no un bloqueo. La
pantalla de clientes vacía muestra «Todavía no hay clientes».

**PR-87 Proyecto sin tareas** — `replicar`
El proyecto se elige directo en el selector y no trae opciones de tarea debajo
(TT-07). No hay ningún aviso: la tarea es opcional.
_Corregido el 2026-10-04, slice 10_: decía que el proyecto no se expande. Desde
que TT-07 lista las tareas siempre debajo de su proyecto, no hay nada que
expandir.

**PR-88 Workspace sin etiquetas** — `adaptar`
Ya relevado en TT-88.
_Agregado el 2026-10-05_: con `tag.create`, el selector suma el enlace «Ir a
Proyectos» (TT-88), y la sección «Etiquetas» de `/proyectos` vacía muestra
«Todavía no hay etiquetas» (PR-112).

**PR-89 Todo archivado** — `adaptar`
Con el filtro en activos y todo archivado, la lista muestra «No hay proyectos
activos» y sugiere cambiar el filtro, en vez del vacío inicial de PR-85.
Justificación: distinguir «no hay nada» de «no hay nada acá» evita que alguien
cree de nuevo lo que ya existe archivado.

## 11. Estados de error

**PR-90 Falla de red al guardar** — `adaptar`
Mismo comportamiento que TT-89: el aviso con «Reintentar», solo para esta causa.

**PR-91 Colisión de nombre detectada por la base** — `adaptar`
El índice único puede fallar aunque la validación previa haya pasado, si dos
pedidos llegan a la vez. El service traduce la violación del índice al mensaje
de PR-77 … PR-80 en vez de dejar salir un error de Postgres. Justificación: es
el mismo criterio con el que TT-37 trata la carrera del timer.

**PR-92 La entidad ya no existe** — `adaptar`
Archivar, restaurar o borrar algo que otra persona ya borró responde «Ese
proyecto ya no existe.» —y su equivalente por entidad— y refresca la lista, en
línea con TT-80.

## 12. Al recargar

**PR-93 Las listas se dibujan en el servidor** — `replicar`
La lista de proyectos y el contenido del selector se arman en el servidor con el
filtro de acceso ya aplicado (PR-61). No hay estado de cliente que reconstruir.

**PR-94 Un proyecto archivado en otra pestaña** — `replicar`
Después de recargar desaparece del selector y las entradas que lo tienen lo
siguen mostrando (PR-63). Sin recargar, el pedido falla con TT-77.

**PR-95 El filtro de estado y el buscador no sobreviven a la recarga** —
`adaptar`
Vuelven a su valor por defecto —activos, buscador vacío— salvo que viajen en la
URL. Propuesta: que viajen en la URL, para que el estado de la lista se pueda
compartir y el botón de volver funcione. Justificación: Clockify no lo
documenta; en un Server Component el filtro en la URL es además lo más barato.

## 13. Casos borde

| ID     | Caso                                                    | Comportamiento esperado                                                                                                        |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| PR-96  | Entrada sin proyecto                                    | Válida en todo el recorrido (TT-93). Nada de este módulo la invalida                                                           |
| PR-97  | Proyecto sin cliente                                    | Válido. Va al grupo «Sin cliente» del selector (PR-14)                                                                         |
| PR-98  | Proyecto archivado con cliente activo, y al revés       | Los dos estados son independientes (PR-06). Un proyecto activo de un cliente archivado se sigue pudiendo elegir                |
| PR-99  | Tarea hecha de un proyecto activo                       | El proyecto se elige, la tarea no aparece (PR-38)                                                                              |
| PR-100 | Tarea activa de un proyecto archivado                   | Ninguno de los dos aparece en el selector: el acceso lo corta el proyecto                                                      |
| PR-101 | Cambiar el cliente de un proyecto que ya tiene entradas | Se permite. Las entradas no se tocan; cambia el grupo del selector y de los reportes. _No verificado_                          |
| PR-102 | Renombrar un proyecto que ya tiene entradas             | Se permite. La fila de la entrada muestra el nombre nuevo: la entrada guarda la referencia, no el texto                        |
| PR-103 | Cambiar el color de un proyecto                         | Cambia el punto de todas sus entradas, pasadas incluidas (TT-49)                                                               |
| PR-104 | Mover una tarea a otro proyecto                         | No existe: la tarea pertenece a un proyecto y no se reasigna (PR-35)                                                           |
| PR-105 | Entrada cuya tarea es de otro proyecto                  | Estado imposible. Lo rechaza la validación (PR-74) y conviene un `check` en la base                                            |
| PR-106 | Archivar un proyecto con un timer corriendo que lo usa  | El timer sigue corriendo y conserva el proyecto (PR-63). Detenerlo no falla. _No verificado_                                   |
| PR-107 | Borrar un proyecto con un timer corriendo que lo usa    | El timer sigue corriendo y pierde el proyecto (PR-64). La barra lo refleja al revalidar. _No verificado_                       |
| PR-108 | Dos personas creando el mismo nombre a la vez           | Una gana; la otra recibe el mensaje de colisión (PR-91)                                                                        |
| PR-109 | Nombre con espacios al principio o al final             | Se recortan antes de validar y de guardar (PR-49)                                                                              |
| PR-110 | Workspace con muchos proyectos                          | Hasta el umbral del slice 9, catálogo entero y búsqueda en el cliente; pasado el umbral, en el servidor y paginado. Ver debajo |
| PR-111 | Borrar un cliente con un proyecto homónimo sin cliente  | Se rechaza y no cambia nada. Decisión del equipo del 2026-10-03, detallada debajo de la tabla                                  |

**PR-110** — `adaptar`. _Corregido el 2026-10-04, slice 10_: decía que el
selector busca en el servidor y pagina, que es lo que hace Clockify, sin número
relevado de a partir de cuántos proyectos. Acá la pantalla trae el catálogo
entero del selector —los proyectos activos en los que la persona puede cargar
horas, con sus tareas activas— y la búsqueda filtra en el navegador sobre ese
catálogo (TT-07). El umbral es el del slice 9: cientos de proyectos y miles de
tareas. Pasado ese umbral, el selector busca en el servidor y pagina, como
Clockify, y la lectura deja de traer las tareas de todos los proyectos (§8 del
[contrato del slice 10](../slices/fase1-slice10-selector-de-proyecto.md)).
Justificación: el límite de cinco personas del plan Free acota el volumen
esperable por debajo de ese umbral. El costo es que el catálogo viaja entero en
cada dibujo de la pantalla, también en la revalidación de cada 60 segundos
(P-11 de `time-tracker.md`).

**PR-111** — `adaptar`. _Agregado el 2026-10-03, decisión del equipo_, tomada
en la revisión del contrato del slice 9 (M-2). Al borrar un cliente, PR-09 deja
a sus proyectos sin cliente, y PR-50 hace competir por nombre a todos los
proyectos sin cliente: si uno de los suyos se llama igual que un proyecto que ya
no tenía cliente, el `set null` choca con el índice de unicidad. La regla es que
**el borrado del cliente se rechaza entero** y no cambia nada: ni el cliente, ni
sus proyectos, ni el proyecto con el que chocaba. La base lo rechaza desde el
slice 9; la fase 2, que trae el borrado de clientes (PR-08), traduce la
violación del índice a un mensaje propio, con su identificador, en vez de dejar
salir un error de Postgres, con el mismo criterio que PR-91. Justificación de
`adaptar`: no hay nada que relevar. La documentación pública no dice qué les
pasa a los proyectos de un cliente borrado
(https://clockify.me/help/projects/managing-projects, consultada el 2026-10-03),
y la unicidad que produce el choque es decisión nuestra (P-19).

## 14. Qué entra en el núcleo de la fase 1

_Corregido el 2026-10-03, revisión del slice 9 (M-5)_: la tabla anterior le
asignaba al slice 9 archivar, editar y borrar, las etiquetas y los efectos sobre
la entrada, dejaba trece identificadores sin destino y ponía seis en dos
destinos a la vez. Esta sección la reemplaza entera.

El reparto lo mandan el
[ADR 0004](../adr/0004-nucleo-de-proyectos-en-fase-1.md) y el
[mapa de la fase 1](../slices/fase1-mapa.md), slices 9 a 12:

- **Slice 9, el núcleo.** Las tablas `client`, `project`, `task`,
  `project_member` y `task_assignee` con sus reglas en la base, el filtro de
  acceso y un solo camino de creación de cliente, proyecto y tarea.
  **Sin edición, archivado ni borrado.**
- **Slice 10, el selector.** `project_id` y `task_id` en `time_entry`, y todo lo
  que le pasa a una entrada por lo que se le haga a su proyecto o a su tarea.
- **Slice 11, etiquetas y facturable.** La tabla `tag`, su unión con la
  entrada, el alta de una etiqueta y el facturable por defecto.
- **Slice 12, edición masiva del rastreador.** Aplica en bloque reglas que ya
  tienen destino.
- **Fase 2, la administración.** Editar, archivar, restaurar y borrar, asignar
  personas y responsables, y las pantallas desde donde se hace.

**Cada identificador tiene un solo destino**: el slice que tiene que hacerlo
cumplir y verificarlo. Cuando el comportamiento es el efecto de una acción que
llega después —archivar, borrar, renombrar, quitar a alguien de un proyecto—, el
destino es el que construye la regla, y la verifica sembrando el estado, igual
que el slice 10 prueba un proyecto archivado sin que exista todavía quien lo
archive. La acción, cuando tiene identificador propio, va a la fase 2.

### 14.1 Destino de cada identificador

- **Slice 9 (44):** PR-01 … PR-04, PR-09, PR-12 … PR-17, PR-19, PR-30, PR-35,
  PR-36, PR-40, PR-49 … PR-51, PR-53, PR-54, PR-57 … PR-62, PR-72,
  PR-75 … PR-79, PR-83 … PR-86, PR-90, PR-91, PR-93, PR-97, PR-108, PR-109,
  PR-111.
- **Slice 10 (24):** PR-10, PR-23, PR-63 … PR-67, PR-70, PR-71, PR-74, PR-82,
  PR-87, PR-94, PR-96, PR-98 … PR-103, PR-105 … PR-107, PR-110.
- **Slice 11 (13):** PR-21 (decisión del equipo del 2026-10-03: el 11 suma el
  facturable al alta de proyecto), PR-42 … PR-44, PR-47, PR-48, PR-52, PR-68,
  PR-69, PR-73, PR-80, PR-88, PR-112. El 11 verifica además la parte de
  etiquetas de PR-53, PR-54, PR-58 y PR-62, que siguen con destino en el 9
  (§14.3).
- **Slice 12 (0):** ninguno. Sus comportamientos son de `time-tracker.md`
  (TT-63); de este documento aplica en bloque reglas que ya tienen destino, como
  PR-72 … PR-74 y PR-82.
- **Fase 2 (24):** PR-05 … PR-08, PR-18, PR-20, PR-22, PR-24 … PR-27, PR-31,
  PR-37 … PR-39, PR-45, PR-46, PR-55, PR-56, PR-81, PR-89, PR-92, PR-95,
  PR-104.
- **Fuera de alcance (7):** PR-11, PR-28, PR-29, PR-32 … PR-34, PR-41.

Son 112 identificadores, PR-01 a PR-112, cada uno en un solo destino.

_Corregido el 2026-10-05, slice 11_: el 11 tenía 12 identificadores y no decía
que verifica la parte de etiquetas de PR-53, PR-54, PR-58 y PR-62; suma
PR-112, nuevo, y el total pasa de 111 a 112.

### 14.2 Qué cambió el 2026-10-03

- **Archivar, restaurar, editar y borrar pasan a la fase 2:** PR-05, PR-08,
  PR-22, PR-24, PR-25, PR-26, PR-38, PR-39, PR-81, PR-92. _Corregido el
  2026-10-03_: decían slice 9. Son administración, y el ADR 0004 no deja en el
  núcleo «ninguna pantalla de administración más allá» de crear. El archivado
  existe como columna desde el 9, que es lo que piden TT-77 y TT-104; quien lo
  escribe llega con la fase 2. PR-38 entra en este grupo porque marcar una tarea
  como hecha es el archivado de la tarea.
- **Asignar personas y la regla de asignados, a la fase 2:** PR-18, PR-37.
  _Corregido el 2026-10-03_: PR-18 decía slice 9, y PR-37 estaba partido entre
  el 9 (la tabla) y la fase 2 (la regla). El 9 crea `project_member` y
  `task_assignee`, con una sola fila en la primera —la del creador como
  responsable (PR-19)—, y quien agrega o quita personas llega con la fase 2
  (P-23).
- **Los permisos de administración, a la fase 2:** PR-55, PR-56. _Corregido el
  2026-10-03_: PR-55 decía slice 9 y PR-56 estaba en el 9 y en la fase 2. Lo que
  el 9 necesita de ellos tiene identificador propio: crear (PR-03, PR-59), crear
  tareas (PR-40), ver todo siendo owner o admin (PR-61) y la marca de
  responsable (PR-19).
- **Las etiquetas, al slice 11, salvo su administración:** PR-42, PR-43, PR-44,
  PR-52, PR-69, PR-73 y PR-80 al 11; PR-45 y PR-46 a la fase 2. _Corregido el
  2026-10-03_: decían slice 9, y PR-73 estaba además en el 11. La tabla `tag` es
  del 11 en el mapa. Archivar, restaurar y borrar una etiqueta se hace desde la
  lista de etiquetas, que es una pantalla de administración; el 11 verifica sus
  efectos —PR-68, PR-69, PR-73— sembrando el estado. PR-69 va al 11 y no al 10
  porque es el `on delete cascade` de la unión que crea el 11.
- **Los efectos sobre la entrada, al slice 10:** PR-10, PR-63 … PR-67, PR-70,
  PR-71, PR-74, PR-82, PR-101. _Corregido el 2026-10-03_: PR-10, PR-63 … PR-67,
  PR-70, PR-74 y PR-82 decían slice 9; PR-71 y PR-101 decían fase 2. El 10 es el
  que agrega `project_id` y `task_id` a `time_entry`, con las claves que le deja
  fijadas el contrato del 9. PR-71 y PR-101 se mueven por la misma regla: la
  acción que los dispara —quitar a alguien de un proyecto privado, cambiar el
  cliente— es de la fase 2, pero lo que tiene que cumplirse es cómo el 10 lee la
  entrada y arma el selector, y el ADR 0004 pide que la fase 2 no reescriba el
  núcleo.
- **El selector, solo en el slice 10:** PR-23. _Corregido el 2026-10-03_: estaba
  en el 9 y en el 10.
- **El filtro de lectura y los vacíos del núcleo, al slice 9:** PR-61, PR-85,
  PR-86. _Corregido el 2026-10-03_: PR-61 estaba en el 9 y en el 10, PR-85 decía
  10 y PR-86 decía fase 2. El 9 construye `project.view` y lo aplica en
  `/proyectos`, y su diálogo de proyecto es el que deja el cliente vacío.
- **Quién crea tareas, al slice 9:** PR-40. _Corregido el 2026-10-03_: decía
  fase 2. El 9 trae `task.create` y tiene que decidir la regla. Sigue sin
  verificar (P-33) y condiciona PR-58.
- **Un solo camino de creación, al slice 9:** PR-04. _Corregido el 2026-10-03_:
  decía fase 2. Lo que PR-04 adapta es que en la fase 1 cada entidad se crea por
  separado, y eso es lo que entrega el 9.
- **Un identificador dentro de un rango ajeno:** PR-11. _Corregido el
  2026-10-03_: el rango «PR-08 … PR-19» del slice 9 lo incluía, además de
  figurar fuera de alcance. Queda solo fuera de alcance.
- **Sin destino hasta hoy:** PR-06 (fase 2), PR-48 (11), PR-90 (9), PR-96 (10),
  PR-97 (9), PR-98 (10), PR-104 (fase 2), PR-105 … PR-107 (10), PR-108 (9),
  PR-109 (9), PR-110 (10). _Corregido el 2026-10-03_: no figuraban en ninguna
  fila.
- **Nuevo:** PR-111 (9). _Agregado el 2026-10-03, decisión del equipo_; ver la
  sección 13.
- **Nuevo:** PR-112 (11). _Agregado el 2026-10-05, slice 11_; ver la sección 4.

### 14.3 Lo que un destino le deja a otro

- **PR-04.** El atajo que Clockify tiene —crear el cliente desde el diálogo de
  proyecto— va a la fase 2, por decisión del equipo del 2026-10-03. Se agrega
  sin tocar el modelo.
- **PR-09 y PR-111.** La regla vive en la base desde el 9 y se prueba con
  borrados directos (criterio 2 de su contrato). Borrar un cliente desde la
  interfaz es de la fase 2 (PR-08), que además escribe el mensaje de PR-111.
- **PR-14 y PR-97.** El grupo «Sin cliente» se dibuja en `/proyectos` desde el
  9; el selector del 10 repite la agrupación (TT-07).
- **PR-16, PR-17 y PR-61.** El 9 construye `project.view` y `project.track` y
  aplica el primero en `/proyectos`; el 10 aplica el segundo en el selector
  (TT-08). Hacer privado un proyecto es de la fase 2.
- **PR-21.** Slice 11, decisión del equipo del 2026-10-03: el 11 suma
  `billable_by_default` al alta de proyecto. La columna nace en el 9 en `false`
  y sin ese campo nada la cambiaría antes de la fase 2, con lo que en la fase 1
  toda entrada con proyecto arrancaría no facturable (TT-14). Va en el 11
  porque es el slice del facturable y el que decide el valor por defecto de la
  entrada. Editarlo en un proyecto ya creado sigue siendo de la fase 2.
- **PR-31.** El 9 adelanta solo el orden alfabético de su pantalla. Las
  columnas, el buscador y el filtro de estado son de la fase 2, con PR-89 y
  PR-95.
- **PR-36 y PR-37.** La tabla `task_assignee` la crea el 9 y queda vacía, que
  significa «cualquiera» (P-23).
- **PR-38.** El 9 crea las tareas activas y su catálogo muestra solo las
  activas; el selector del 10 esconde las hechas (PR-99).
- **PR-40 y PR-44.** Crear es del 9 y del 11; editar y borrar, de la fase 2.
- **PR-53 y PR-54.** El índice y los `checks` de la etiqueta llegan con el 11,
  con la misma regla, y el 11 los verifica.
- **PR-57, PR-60 y PR-90.** Valen para cada acción nueva del 10, del 11 y de la
  fase 2, que suman sus casos a sus propios tests.
- **PR-58.** Crear clientes, proyectos y tareas es del 9; crear etiquetas, del
  11, que lo verifica.
- **PR-62.** Que las etiquetas las vea todo el workspace llega con el 11, que lo
  verifica con `tag.view`.
- **PR-85 y PR-86.** El vacío del selector es TT-87, del 10. La pantalla de
  clientes vacía de PR-86 llega con la pantalla de clientes de la fase 2.
- **PR-93.** `/proyectos` se arma en el servidor desde el 9; el selector del 10
  sigue la misma regla.

_Corregido el 2026-10-05, slice 11_: PR-53, PR-54, PR-58 y PR-62 decían que la
parte de etiquetas llega con el 11, sin decir que el 11 la verifica.

Las columnas que no tienen pantalla en la fase 1 —nota y dirección del cliente,
nota del proyecto, visibilidad, facturable por defecto, marca de responsable,
asignados de tarea, archivado— se crean igual en el slice 9: el costo de
equivocar una clave foránea se paga migrando datos, no editando una pantalla. Lo
que el 9 no trae es quien las escriba después del alta.

## 15. Pendientes de definición del equipo

### Decididos el 2026-10-02

Se dejan con su identificador porque los contratos de slice los citan.

| ID   | Decisión                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-16 | **El facturable entra, como diseño propio y no como paridad.** No es relevable en el plan Free. TT-14, TT-15 y PR-21 quedaron reescritos para decirlo: el slice 11 no pierde alcance, pierde la referencia contra la cual compararse.                        |
| P-17 | **Proyectos privados: se modelan la columna, los miembros y el filtro desde el slice 9, y todo se crea público** (PR-17). Barato ahora, carísimo como migración después.                                                                                     |
| P-18 | **`whoCreatesProjects` congelado en `everyone` en la fase 1** (PR-59). El `default` de la columna, hoy `admins`, cambia con su migración en el slice 9. La configuración editable va a la fase 2 y el valor no entra todavía en `can()`.                     |
| P-19 | **Unicidad**: cliente y etiqueta por workspace, proyecto por workspace y cliente —con los «sin cliente» como un grupo—, tarea por proyecto; sin distinguir mayúsculas y contando los archivados (PR-49 … PR-53). Decisión nuestra: Clockify no lo documenta. |
| P-20 | **100 caracteres** para los nombres de las cuatro entidades (PR-54). El del cliente está documentado; los otros tres son por coherencia.                                                                                                                     |
| P-21 | **Los proyectos de un cliente borrado quedan sin cliente** (PR-09). `on delete set null`.                                                                                                                                                                    |
| P-22 | **Una etiqueta archivada se sigue mostrando** en las entradas que ya la tienen y no aparece en el selector (PR-47, PR-68). Misma regla que TT-104.                                                                                                           |
| P-23 | **Los asignados de tarea se modelan en la fase 1 y la regla de acceso se aplica en la fase 2** (PR-37). Es una regla de acceso real, no una lista decorativa.                                                                                                |
| P-24 | **La marca de responsable va en la tabla de miembros de proyecto y `can()` recibe el recurso con esa marca** (PR-19, PR-56). No se aproxima con el rol de workspace.                                                                                         |
| P-25 | **Grupos de usuarios: fuera de la fase 1, a la fase 2** (PR-20).                                                                                                                                                                                             |
| P-26 | **Favoritos: fuera de la fase 1, a la fase 2**, y sin el interruptor de workspace (PR-27).                                                                                                                                                                   |
| P-27 | **Quien queda fuera de un proyecto privado sigue viendo sus propias entradas**, con el nombre del proyecto, porque son suyas (TT-01). Pierde el proyecto en el selector (PR-71).                                                                             |
| P-30 | **Paleta fija nuestra** (PR-15). La de Clockify no está documentada.                                                                                                                                                                                         |
| P-31 | **La nota y la dirección del cliente y la nota del proyecto entran**, como campos de texto sin formato (PR-01, PR-30).                                                                                                                                       |
| P-32 | **Lo pago queda fuera de la fase 1** y sin fase asignada: tarifas, estimaciones, presupuesto, progreso, plantillas, edición masiva de proyectos, moneda y correos del cliente, campos personalizados. No se puede relevar y el equipo no lo pidió.           |

Los identificadores P-28 y P-29 no se usan: se dejan libres para no pisar
numeración que otro documento pueda estar escribiendo en paralelo.

### Abierto

| ID   | Punto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-33 | **Verificar en el workspace real del equipo lo marcado como _no verificado_.** No es una decisión: es abrir la cuenta y mirar. Son trece puntos y se resuelven de una sentada: PR-01 (largos de los campos del cliente), PR-07 (restaurar un cliente no restaura sus proyectos), PR-14 (rótulo del grupo sin cliente), PR-24 (restaurar un proyecto no desmarca sus tareas), PR-31 (columnas, orden y filtros de la lista de proyectos), PR-40 (valor por defecto de quién crea tareas), PR-47 (cómo muestra el selector una etiqueta archivada que la entrada ya tiene), PR-48 (tope de etiquetas por entrada; acá, 50), PR-51 (si Clockify exige nombres de tarea únicos), PR-67 (qué pasa con las tareas de un proyecto borrado), PR-101 (cambiar el cliente de un proyecto con entradas), PR-106 y PR-107 (archivar y borrar un proyecto con un timer corriendo). |

Ninguno de los trece bloquea el slice 9 ni el 11: todos tienen una regla
escrita en este documento y lo que la verificación puede hacer es corregirla, no
destrabarla.

PR-58 depende de la misma verificación que PR-40 y no suma un punto: si en el
plan Free cualquier miembro crea tareas, cambia la regla de `task.create` o se
registra la divergencia con su motivo. _Agregado el 2026-10-03._
_Corregido el 2026-10-05, slice 11_: P-33 suma PR-47 y dice el tope que el 11
fija en PR-48.
