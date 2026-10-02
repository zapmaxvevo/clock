# Paridad: time tracker

Alcance de este documento: la barra del rastreador de tiempo y la lista de
entradas del día, que es lo que cubre la fase 1. No cubre timesheet, calendario,
reportes, kiosco ni auto tracker.

Cada comportamiento lleva un identificador `TT-nn` para que lo referencien el
reviewer de paridad y los flujos de Playwright, y una marca `replicar`,
`adaptar` o `fuera de alcance`. Las dos últimas llevan una línea de
justificación.

## Fuentes y límites del relevamiento

El relevamiento se hizo contra la documentación pública del centro de ayuda de
Clockify y la referencia pública de su API:

- https://clockify.me/help/track-time-and-expenses/creating-a-time-entry
- https://clockify.me/help/track-time-and-expenses/adding-time-manually
- https://clockify.me/help/track-time-and-expenses/editing-time-entries
- https://clockify.me/help/track-time-and-expenses/split-time-entries
- https://clockify.me/help/track-time-and-expenses/bulk-edit
- https://clockify.me/help/track-time-and-expenses/duration-format
- https://clockify.me/help/track-time-and-expenses/time-rounding
- https://clockify.me/help/users/user-settings
- https://docs.clockify.me/ (endpoints de time entry)

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Todo lo que está marcado como _no verificado_ abajo
describe lo que se ve en el producto pero no aparece en la documentación
pública, y hay que confirmarlo abriendo el workspace del equipo antes de
implementarlo. No lo di por cierto en ningún punto bloqueante.

Lo que no existe en el plan Free (tarifas, aprobaciones, bloqueo de timesheets,
campos obligatorios, forzar timer, redondeo, dividir entrada, favoritos,
formato decimal de duración) no se releva: queda listado en
[Pendientes de definición del equipo](#pendientes-de-definición-del-equipo).

## Vocabulario

| Clockify       | Clock (interfaz en español) |
| -------------- | --------------------------- |
| Time Tracker   | Rastreador                  |
| Time entry     | Entrada                     |
| Running timer  | Timer activo                |
| Description    | Descripción                 |
| Project / Task | Proyecto / Tarea            |
| Tags           | Etiquetas                   |
| Billable       | Facturable                  |
| Timer mode     | Modo timer                  |
| Manual mode    | Modo manual                 |
| Continue       | Continuar                   |
| Duplicate      | Duplicar                    |
| Split          | Dividir                     |
| Discard        | Descartar                   |

`adaptar`: la interfaz va en español, así que toda la copia visible se traduce.
No vuelvo a justificar la traducción en cada comportamiento; se asume en todos.

## 1. Pantalla del rastreador

Ruta `/` dentro del shell con sesión. La pantalla tiene dos zonas: la barra
fija arriba y la lista de entradas debajo.

**TT-01 La pantalla muestra solo las entradas del usuario de la sesión** —
`replicar`
El rastreador de Clockify nunca muestra entradas de otra persona, ni siquiera a
un admin. Ver o editar entradas ajenas pasa por el reporte detallado, que es de
otra fase. El repositorio filtra por `workspace_id` de la sesión y por
`user_id` del actor.

**TT-02 Zona horaria y formatos** — `adaptar`
Clockify resuelve el día, el formato de hora (12 h/24 h) y el formato de fecha
con ajustes por usuario, y el inicio de semana con un ajuste que fija el admin
en el perfil de la persona. Hoy el esquema solo tiene `workspace.timezone`: no
hay zona horaria ni inicio de semana por usuario. Para la fase 1 se usa la zona
horaria del workspace, formato 24 h y fecha `dd/MM`, y los cortes de día y
semana salen de `src/server/time`. Justificación: el modelo de datos todavía no
tiene los campos por usuario y agregarlos es una decisión del equipo
(pendiente P-13).

## 2. La barra del rastreador

Orden de izquierda a derecha en modo timer: descripción, selector de proyecto y
tarea, etiquetas, facturable, duración, botón de arranque. A la derecha del
todo, el conmutador de modo.

### 2.1 Descripción

**TT-03 Campo de descripción** — `replicar`
Campo de texto libre, ancho flexible, con marcador de posición
«¿En qué estás trabajando?». Es opcional: se puede arrancar un timer y guardar
una entrada sin descripción.

**TT-04 La descripción se guarda sin confirmar** — `adaptar`
En Clockify el campo guarda solo mientras el timer corre. Acá se guarda al
perder el foco o con Enter, con rebote de 500 ms mientras se escribe, y el
estado de guardado no se muestra salvo que falle. Justificación: sin estado en
el servidor ni canal abierto, un guardado por pulsación multiplica las
escrituras sin beneficio visible.

**TT-05 Largo máximo de la descripción** — `adaptar`
No está documentado el límite de Clockify. Se fija 3000 caracteres, validado en
el esquema Zod del módulo, y el campo corta la entrada en ese largo.
Justificación: hace falta un límite para la columna y para el esquema; el valor
es nuestro.

### 2.2 Selector de proyecto y tarea

**TT-06 Botón de proyecto** — `replicar`
Cuando no hay proyecto elegido muestra «Proyecto» con ícono de carpeta y sin
color. Con proyecto elegido muestra el punto de color del proyecto y su nombre,
y si hay tarea, «Proyecto: Tarea».

**TT-07 Buscador del selector** — `replicar`
Al abrir, un popover con un buscador arriba y la lista de proyectos agrupados
por cliente. Los proyectos con tareas se expanden para elegir una tarea. El
buscador filtra por nombre de proyecto, de cliente y de tarea.

**TT-08 Solo proyectos a los que el usuario tiene acceso** — `replicar`
La lista muestra los proyectos activos del workspace a los que la persona está
asignada, más los públicos. Los proyectos archivados no aparecen.

**TT-09 Crear proyecto desde el selector** — `fuera de alcance`
Clockify ofrece «Crear proyecto» al final del buscador cuando el permiso lo
habilita. Justificación: pertenece al módulo de proyectos; se agrega cuando ese
módulo exista.

**TT-10 Quitar el proyecto** — `replicar`
Dentro del popover hay una opción para dejar la entrada sin proyecto. Una
entrada sin proyecto es válida.

**TT-11 Elegir tarea arrastra el proyecto** — `replicar`
No se puede tener tarea sin proyecto. Elegir una tarea fija también su
proyecto; quitar el proyecto quita la tarea.

### 2.3 Etiquetas

**TT-12 Selector de etiquetas** — `replicar`
Ícono de etiqueta; abre un popover con buscador y casillas de selección
múltiple. Con etiquetas elegidas el ícono se marca y el botón muestra la
cantidad o los nombres si entran.

**TT-13 Crear etiqueta desde el selector** — `fuera de alcance`
Igual que TT-09: pertenece al módulo de etiquetas.

### 2.4 Facturable

**TT-14 Marca de facturable** — `replicar`
Ícono de signo de moneda que alterna entre facturable y no facturable. El
estado por defecto lo decide el proyecto elegido: si el proyecto es facturable,
la entrada arranca facturable. Sin proyecto, arranca no facturable.

**TT-15 La marca no muestra importes** — `adaptar`
En Clockify la facturabilidad alimenta tarifas e importes, que no existen en el
plan Free y no se relevaron. Acá la marca es solo un booleano visible en la
entrada. Justificación: las tarifas quedan pendientes (P-01).

### 2.5 Modo timer y modo manual

**TT-16 Conmutador de modo** — `replicar`
A la derecha de la barra, dos íconos: reloj (modo timer) y lista (modo manual).
El modo elegido se recuerda entre visitas.

**TT-17 Modo timer: campo de duración** — `replicar`
Con el timer parado muestra `0:00:00`. Con el timer corriendo cuenta hacia
arriba en `h:mm:ss`.

**TT-18 Modo manual: inicio, fin, fecha y duración** — `replicar`
La barra muestra hora de inicio, hora de fin, un selector de fecha con ícono de
calendario y el campo de duración, y el botón pasa a «Agregar». Editar la
duración mueve la hora de fin; editar inicio o fin recalcula la duración.

**TT-19 Formatos aceptados en el campo de duración** — `adaptar`
Clockify acepta `30` → 30 m, `2h`, `2:00`, `2.75` → 2 h 45 m, `1h30m1s`. Se
replican todos y además se acepta la coma decimal (`2,75`). Justificación:
teclado y convención en español.

**TT-20 Formatos aceptados en los campos de hora** — `adaptar`
Clockify acepta `0345` → 03:45, `9.45` → 9:45, `1pm` → 13:00, `1` → 01:00. Se
replican `0345`, `9.45`, `9:45` y `1` → 01:00; no se acepta `am`/`pm`.
Justificación: la interfaz es 24 h (TT-02), así que `pm` no tiene lugar donde
mostrarse.

**TT-21 Entrada de texto inválida en duración u hora** — `adaptar`
Clockify descarta lo que no puede interpretar y vuelve al valor anterior sin
avisar. Acá el campo también vuelve al valor anterior, y además se marca en
rojo por un instante. Justificación: volver sin ninguna señal se lee como un
cuelgue.

### 2.6 Arrancar y parar

**TT-22 Botón de arranque** — `replicar`
Botón «Iniciar» en verde. Crea una entrada con `start` en el instante del clic
y `end` nulo, con los valores que haya en la barra en ese momento.

**TT-23 Botón de parada** — `replicar`
Con el timer corriendo el botón pasa a «Detener» en rojo. Escribe `end` con el
instante del clic, la entrada se cierra y aparece en la lista del día que
corresponde a su `start`.

**TT-24 Arrancar con la barra vacía** — `replicar`
No hay validación previa: se puede arrancar sin descripción, sin proyecto, sin
etiquetas. La entrada resultante se muestra con «Sin descripción» y
«Sin proyecto».

**TT-25 Botón «Agregar» en modo manual** — `replicar`
Crea una entrada cerrada con el inicio, el fin y la fecha de la barra, y limpia
la barra. La entrada se ubica en el grupo del día de su `start`.

**TT-26 Atajos de teclado** — `adaptar`
Clockify usa `n` nuevo timer, `c` continuar el último, `s` detener, `m`
conmutar modo manual. Se replican los cuatro, activos solo cuando el foco no
está en un campo de texto. Justificación: con el foco en la descripción, las
letras tienen que escribirse.

### 2.7 Comportamiento de cada campo mientras el timer corre

**TT-27 Todos los campos siguen editables** — `replicar`
Descripción, proyecto, tarea, etiquetas y facturable se editan con el timer
corriendo y cada cambio se guarda sobre la entrada abierta, sin detenerla.

**TT-28 Editar la hora de inicio del timer activo** — `replicar`
Al hacer clic en el contador corriendo se puede cambiar la hora de inicio, para
el caso de haber empezado a trabajar antes de arrancar el timer. La duración se
recalcula de inmediato.

**TT-29 Inicio posterior al momento actual** — `adaptar`
No está documentado qué hace Clockify. Acá se rechaza: un timer activo no puede
empezar en el futuro. Mensaje: «La hora de inicio no puede ser posterior a
ahora.» Justificación: con `start` en el futuro la duración sería negativa y el
contador no tendría qué mostrar.

**TT-30 El modo manual queda deshabilitado mientras el timer corre** —
`replicar`
Documentado: no se puede agregar tiempo a mano con un timer activo. El
conmutador de modo queda inactivo y con una ayuda contextual que lo explica.

**TT-31 El contador avanza en el cliente** — `replicar`
El cliente calcula el transcurrido desde `start` y lo redibuja cada segundo. El
servidor no guarda nada del contador; la única verdad es `start` con `end`
nulo.

**TT-32 Desfase de reloj entre cliente y servidor** — `adaptar`
Clockify no lo documenta. Acá, al cargar el timer activo el servidor manda su
instante actual junto con la entrada, y el cliente cuenta sobre ese desfase en
vez de sobre `Date.now()` crudo. Justificación: un reloj de máquina atrasado
mostraría una duración negativa o un salto al detener.

**TT-33 El título de la pestaña muestra el contador** — `fuera de alcance`
Clockify escribe la duración en el `title` del documento. Justificación: es
cosmético y no entra en la fase 1; se puede agregar después sin tocar el
modelo.

## 3. Un solo timer activo por usuario

**TT-34 Regla** — `replicar`
Documentado: una persona tiene como máximo un timer activo. En el modelo es un
índice único parcial sobre (`workspace_id`, `user_id`) con `end is null`.

**TT-35 Arrancar un timer con otro corriendo** — `replicar`
El timer anterior se detiene en el mismo instante en que arranca el nuevo: el
`end` del viejo y el `start` del nuevo son el mismo valor, en una sola
transacción. La entrada cerrada aparece en la lista y la barra queda con el
timer nuevo.
_No verificado en documentación pública_: la documentación afirma «un timer
activo por usuario» pero no describe el detalle del instante de corte.
Confirmar en el workspace del equipo si Clockify deja un hueco entre las dos.

**TT-36 Continuar una entrada con un timer corriendo** — `replicar`
Mismo comportamiento que TT-35: detiene el activo y arranca el nuevo.

**TT-37 Carrera entre dos pedidos de arranque** — `adaptar`
Si llegan dos arranques del mismo usuario a la vez, el índice único hace fallar
al segundo y la action responde con el timer activo que quedó, sin error
visible: la interfaz se sincroniza con ese estado. Justificación: el
comportamiento de Clockify acá no es observable desde afuera; esta es nuestra
regla para que dos pestañas no dejen dos entradas abiertas.

## 4. Recargar y abrir en otro dispositivo

**TT-38 Recargar con el timer corriendo** — `replicar`
La página se dibuja en el servidor con la entrada de `end` nulo ya cargada en
la barra: descripción, proyecto, etiquetas, facturable y el contador corriendo
desde `start`. No hay parpadeo en cero ni pérdida de tiempo.

**TT-39 Abrir la app en otro dispositivo** — `replicar`
El segundo dispositivo muestra el mismo timer corriendo, con los mismos valores
y el mismo transcurrido, porque el estado vive en la base.

**TT-40 Detener desde un dispositivo con el otro abierto** — `adaptar`
Clockify sincroniza casi en vivo. Acá no hay canal abierto: la segunda pestaña
revalida al recuperar el foco y cada 60 segundos mientras está visible, así que
puede seguir contando hasta un minuto después de que se detuvo en la otra.
Justificación: no hay websockets ni estado en memoria en el servidor
(ver `CLAUDE.md`); el intervalo es una decisión abierta (P-11).

**TT-41 Detener un timer que ya fue detenido** — `adaptar`
Si la pestaña desactualizada manda «Detener» sobre una entrada ya cerrada, la
action no la vuelve a escribir y devuelve el estado real. La interfaz muestra
«Este timer ya había sido detenido.» y refresca la lista. Justificación: no es
observable en Clockify; hace falta una regla explícita porque el escenario es
frecuente con dos pestañas.

**TT-42 Timer que quedó corriendo días** — `adaptar`
Clockify lo deja correr sin límite en la web (la detección de inactividad es
del cliente de escritorio). Para la fase 1 se deja correr igual, y la lista
muestra el día de inicio con el contador sumando. Si el equipo quiere un corte
automático, es el pendiente P-12. Justificación: un corte automático necesita
una decisión de producto y el único cron disponible corre una vez por día.

## 5. La lista de entradas

**TT-43 Agrupación por día** — `replicar`
Las entradas se agrupan por el día local de su `start`, de la más reciente a la
más vieja. Cada grupo tiene un encabezado con el nombre del día y el total del
día a la derecha.

**TT-44 Rótulo del encabezado de día** — `adaptar`
Clockify rotula «Today», «Yesterday» y, para el resto, el día de la semana con
la fecha. Acá: «Hoy», «Ayer» y, para el resto, `mié, 01/10`, con el año cuando
el día cae fuera del año en curso. Justificación: formato de fecha en español.

**TT-45 Total del día** — `replicar`
Suma de las duraciones de las entradas del grupo, en formato `h:mm`, rotulada
«Total».

**TT-46 El total del día incluye el timer activo** — `adaptar`
_No verificado en documentación pública_. Acá el total del día en curso suma el
transcurrido del timer activo y se actualiza con el contador. Justificación:
sin esta suma el total del día de hoy queda visiblemente por debajo de lo
trabajado; si el workspace del equipo muestra lo contrario, se corrige.

**TT-47 Encabezado y total de la semana** — `replicar`
Arriba de los grupos de día, una franja por semana con el rótulo
«Esta semana» / «Semana anterior» / el rango de fechas, y el total de la semana
a la derecha, en `h:mm`.
_No verificado en documentación pública_: la franja se ve en el producto pero
no está descrita en el centro de ayuda. Confirmar en el workspace del equipo.

**TT-48 Corte de la semana** — `adaptar`
El corte sale de `weekBounds` de `src/server/time` con el inicio de semana del
workspace. En Clockify el inicio de semana es por persona y lo fija un admin.
Justificación: no hay campo por usuario todavía (P-13).

**TT-49 Contenido de una fila** — `replicar`
De izquierda a derecha: descripción, proyecto con su punto de color y la tarea,
etiquetas, marca de facturable, hora de inicio y de fin, duración, botón de
continuar, menú de tres puntos.

**TT-50 Fila de una entrada incompleta** — `replicar`
Sin descripción muestra «Sin descripción» en gris; sin proyecto muestra
«Sin proyecto» en gris y sin punto de color. Las dos siguen siendo filas
normales, editables y contabilizadas.

**TT-51 Marca de cruce de medianoche en la fila** — `replicar`
Documentado: la hora de fin lleva un superíndice con la cantidad de días
adicionales que abarca la entrada (`08:00 – 02:00` con `+1`).

**TT-52 Paginación de la lista** — `adaptar`
Clockify carga más entradas al bajar. Acá la pantalla trae las últimas dos
semanas y un botón «Cargar más» agrega una semana por clic. Justificación: el
scroll infinito en un Server Component paginado complica la revalidación sin
aportar a la fase 1.

**TT-53 Agrupación de entradas similares** — `fuera de alcance`
Clockify colapsa en una fila las entradas del mismo día con igual descripción y
proyecto, con un contador de cuántas son. Justificación: cambia el modelo de la
lista y las acciones en masa; se decide aparte (P-09).

## 6. Acciones sobre una entrada

**TT-54 Edición en línea** — `replicar`
Documentado: se editan descripción, proyecto, facturabilidad, etiquetas, hora
de inicio, hora de fin y fecha haciendo clic sobre el campo en la fila, y el
cambio se guarda solo.

**TT-55 Guardado de la edición en línea** — `adaptar`
Se guarda al perder el foco o con Enter; `Esc` descarta y vuelve al valor
anterior. Mientras la escritura está en vuelo la fila queda atenuada; si falla,
el valor vuelve y aparece el error. Justificación: el guardado por pulsación de
Clockify no es replicable sin multiplicar las escrituras (ver TT-04).

**TT-56 Mover una entrada a otro día** — `replicar`
Cambiar la fecha en la fila mueve la entrada al grupo de día que corresponde y
recalcula los dos totales afectados.

**TT-57 Continuar** — `replicar`
Documentado: el botón de reproducción **crea una entrada nueva** con la
descripción, el proyecto, la tarea, las etiquetas y la facturabilidad de la
original, con `start` ahora y `end` nulo. No reabre la entrada original.

**TT-58 Duplicar** — `replicar`
Menú de tres puntos → «Duplicar». Crea una copia cerrada con los mismos campos
y las mismas horas de inicio y fin, en el mismo día.
_No verificado en documentación pública_: existe el endpoint de duplicado en la
API pero el centro de ayuda no describe qué horas recibe la copia. Confirmar en
el workspace del equipo antes de implementar.

**TT-59 Dividir** — `fuera de alcance`
La documentación la marca como funcionalidad de plan pago: no se puede relevar
en el workspace Free del equipo. Lo que dice la documentación pública, para
cuando se decida: se abre desde el menú de tres puntos, se elige el instante de
corte en un campo «Dividir en» o moviendo una barra, no se pueden dividir
entradas de menos de dos minutos y el corte tiene que caer al menos un minuto
después del inicio y un minuto antes del fin. Justificación: funcionalidad
paga, pendiente P-05.

**TT-60 Borrar** — `replicar`
Menú de tres puntos → «Borrar». La entrada desaparece de la lista y los totales
se recalculan.

**TT-61 Deshacer el borrado** — `adaptar`
Clockify deja deshacer durante 20 segundos con un botón en un aviso flotante.
Acá, para la fase 1, el borrado pide confirmación en un diálogo y no se puede
deshacer. Justificación: el deshacer necesita borrado lógico y un barrido
posterior; es una decisión de modelo que todavía no está tomada (P-06).

**TT-62 Selección múltiple** — `replicar`
Cada fila tiene una casilla al pasar el puntero. Al marcar una, aparece la
barra de acciones en masa con la cantidad seleccionada. La casilla del
encabezado de día marca todas las entradas del día.

**TT-63 Edición masiva** — `replicar`
Documentado: con entradas seleccionadas se pueden cambiar en bloque la
descripción, el proyecto y la tarea, las etiquetas (agregando a las existentes
o reemplazándolas), la facturabilidad, y la hora y la fecha.
_No verificado_: la documentación dice que la edición masiva del reporte
detallado es de plan pago, y no aclara si la del rastreador está en Free.
Confirmar en el workspace del equipo (P-07).

**TT-64 Borrado masivo** — `adaptar`
Clockify pide escribir `DELETE` en el diálogo y después deja deshacer 20
segundos. Acá el diálogo pide escribir `BORRAR` y, en línea con TT-61, no hay
deshacer. Justificación: traducción de la palabra de confirmación y la misma
decisión pendiente sobre el deshacer.

**TT-65 Descartar el timer activo** — `replicar`
El menú de tres puntos de la barra con el timer corriendo ofrece «Descartar»:
borra la entrada abierta sin guardarla y deja la barra vacía. Pide confirmación
porque no se puede deshacer.
_No verificado en documentación pública_: la opción se ve en el producto pero
no está descrita en el centro de ayuda. Confirmar en el workspace del equipo.

**TT-66 Permisos sobre las acciones** — `replicar`
En el rastreador la persona actúa siempre sobre sus propias entradas, así que
los cinco roles (`owner`, `admin`, `project_manager`, `team_manager`, `member`)
pueden crear, editar, continuar, duplicar, borrar y editar en masa sus propias
entradas. Una membresía con `status` distinto de `active` no puede ninguna de
las dos cosas, por la regla de `can`. Editar entradas ajenas no es parte de
esta pantalla (TT-01).

**TT-67 Bloqueo por aprobación o por cierre de período** — `fuera de alcance`
Clockify impide editar entradas aprobadas o bloqueadas. Justificación:
aprobaciones y bloqueo de timesheets no existen en el plan Free, no se relevan
(P-02).

## 7. Validaciones y mensajes

Los mensajes son nuestros: la copia de Clockify está en inglés y la interfaz va
en español, así que todos los textos de esta sección son `adaptar`. Lo que se
replica es la regla, no la frase.

| ID    | Regla                                                        | Mensaje                                                | Marca      |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------ | ---------- |
| TT-68 | Descripción opcional                                         | —                                                      | `replicar` |
| TT-69 | Proyecto opcional                                            | —                                                      | `replicar` |
| TT-70 | Tarea solo con proyecto                                      | «Elegí un proyecto antes que una tarea.»               | `replicar` |
| TT-71 | Descripción de hasta 3000 caracteres                         | «La descripción no puede superar los 3000 caracteres.» | `adaptar`  |
| TT-72 | `end` anterior a `start` se interpreta como el día siguiente | —                                                      | `replicar` |
| TT-73 | Duración cero no se guarda en modo manual                    | «La entrada tiene que durar al menos un minuto.»       | `adaptar`  |
| TT-74 | Duración máxima por entrada                                  | «Una entrada no puede durar más de 24 horas.»          | `adaptar`  |
| TT-75 | `start` de un timer activo no puede ser futuro               | «La hora de inicio no puede ser posterior a ahora.»    | `adaptar`  |
| TT-76 | Fecha futura en modo manual                                  | «No se pueden cargar horas en una fecha futura.»       | `adaptar`  |
| TT-77 | Proyecto inexistente, archivado o sin acceso                 | «Ese proyecto ya no está disponible.»                  | `adaptar`  |
| TT-78 | Etiqueta inexistente o archivada                             | «Esa etiqueta ya no está disponible.»                  | `adaptar`  |
| TT-79 | Entrada de otra persona o de otro workspace                  | «No tenés permiso para editar esta entrada.»           | `replicar` |
| TT-80 | Entrada ya borrada                                           | «Esa entrada ya no existe.»                            | `adaptar`  |

Justificaciones de las filas `adaptar`:

- TT-71, TT-73, TT-74: límites propios. Clockify no documenta ninguno de los
  tres; hacen falta para el esquema y para que un dedo apoyado en el teclado no
  genere una entrada de meses. **El tope de 24 horas es una propuesta, no un
  relevamiento** (P-08).
- TT-75: ver TT-29.
- TT-76: Clockify no documenta si acepta entradas con fecha futura y no pude
  probarlo. Se propone rechazarlas (P-10).
- TT-77, TT-78, TT-80: errores de dominio que Clockify resuelve en el cliente
  recargando la lista; acá se devuelven como error tipado desde la action.
- TT-79: misma regla, texto propio.

**TT-81 Duración negativa** — `replicar`
No existe como estado guardable. Toda combinación que daría una duración
negativa se resuelve antes: en modo manual por TT-72 (el fin pasa al día
siguiente), en el timer activo por TT-75. El servicio, además, rechaza
cualquier entrada con `end` anterior a `start` que llegue por la action, con el
mensaje «La hora de fin tiene que ser posterior a la de inicio.» Esto último es
una red de seguridad del servidor, no un camino de la interfaz.

**TT-82 Entradas superpuestas** — `adaptar`
Clockify las permite y no las señala. Acá también se permiten en la fase 1, sin
aviso. Justificación: es el comportamiento del plan Free; si el equipo quiere
avisar, es el pendiente P-04.

**TT-83 Redondeo** — `fuera de alcance`
El redondeo de Clockify es de plan pago y, según la documentación, solo afecta
a los reportes, no a la entrada guardada. El campo `roundingMinutes` ya existe
en `workspace_settings` pero el rastreador no lo usa. Justificación:
funcionalidad paga y, aun en Clockify, ajena a esta pantalla (P-03).

**TT-84 Campos obligatorios y forzar timer** — `fuera de alcance`
`requireProject`, `requireTask`, `requireDescription`, `requireTag` y
`forceTimer` existen en `workspace_settings` pero son funcionalidades de plan
pago: no se pueden relevar en el workspace del equipo. En la fase 1 el
rastreador los ignora y se comporta como si estuvieran todos en falso.
Justificación: pendiente P-01.

## 8. Estados vacíos

**TT-85 Sin ninguna entrada** — `adaptar`
Clockify muestra una ilustración con un texto de bienvenida. Acá: un bloque
centrado con «Todavía no cargaste horas» y la línea «Escribí en qué estás
trabajando y tocá Iniciar.» Justificación: copia propia en español, sin
ilustración.

**TT-86 Semana sin entradas pero con entradas más viejas** — `replicar`
La semana vacía no se dibuja: la lista salta al último día con entradas. No
hay días vacíos intermedios.

**TT-87 Workspace sin proyectos** — `adaptar`
El selector de proyecto abre con «No hay proyectos todavía» y, si el rol lo
permite, un enlace a la pantalla de proyectos. Justificación: en Clockify ahí
va «Crear proyecto», que es TT-09 y está fuera de alcance.

**TT-88 Workspace sin etiquetas** — `adaptar`
El selector de etiquetas abre con «No hay etiquetas todavía». Misma
justificación que TT-87.

## 9. Estados de error

**TT-89 Falla de red al arrancar o detener** — `adaptar`
El botón vuelve a su estado anterior y aparece un aviso «No se pudo guardar.
Revisá la conexión y volvé a intentar.», con la acción «Reintentar».
Justificación: Clockify acumula los cambios en el cliente y los reenvía; acá no
hay cola de reintentos.

**TT-90 Falla al guardar una edición en línea** — `adaptar`
El campo vuelve al valor anterior y el aviso nombra el campo que no se guardó.
Misma justificación que TT-89.

**TT-91 Sesión vencida** — `adaptar`
La action devuelve 401 y la interfaz lleva a la pantalla de acceso conservando
la ruta de vuelta. Un timer activo no se pierde: sigue abierto en la base y
reaparece al volver a entrar. Justificación: es comportamiento de nuestra
autenticación, no de Clockify.

**TT-92 Membresía desactivada mientras la sesión está abierta** — `adaptar`
`can` devuelve falso, la action responde 403 y la pantalla queda en solo
lectura con un aviso. Justificación: `membership_status` es nuestro modelo.

## 10. Casos borde

| ID     | Caso                                                        | Comportamiento esperado                                                                                                                                      |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TT-93  | Entrada sin proyecto                                        | Válida en todo el recorrido: se crea, se lista, se edita, se continúa, se duplica y suma a los totales. Ver TT-24, TT-50.                                    |
| TT-94  | Descripción vacía                                           | Válida. La fila muestra «Sin descripción». Continuar y duplicar la mantienen vacía.                                                                          |
| TT-95  | Timer cruzando la medianoche                                | La entrada queda en el grupo del día de su `start`. El fin lleva el superíndice de días (TT-51). El total del día de inicio la suma entera.                  |
| TT-96  | Timer cruzando el fin de semana                             | Igual: la entrada cuenta entera en la semana de su `start`, no se parte entre semanas.                                                                       |
| TT-97  | Cambio de horario de verano dentro de la entrada            | La duración se calcula sobre instantes UTC, así que es la real; las horas mostradas son las locales de cada extremo y pueden no cuadrar con la resta visual. |
| TT-98  | Duración negativa                                           | Imposible de guardar. Ver TT-81.                                                                                                                             |
| TT-99  | Fecha futura                                                | Rechazada en modo manual (TT-76) y en el inicio del timer activo (TT-75). **Decisión propia, no relevada** (P-10).                                           |
| TT-100 | Entrada que empieza exactamente a las 00:00                 | Pertenece al día que empieza, no al anterior.                                                                                                                |
| TT-101 | Detener en el mismo minuto en que se arrancó                | La entrada se guarda con la duración real en segundos; la lista la muestra como `0:00` y suma sus segundos al total del día.                                 |
| TT-102 | Dos pestañas arrancando a la vez                            | Queda un solo timer. Ver TT-37.                                                                                                                              |
| TT-103 | Borrar la entrada que está corriendo desde otra pestaña     | La pestaña con la barra descubre que no existe al reintentar, limpia la barra y avisa «El timer ya no existe.»                                               |
| TT-104 | Proyecto archivado mientras la entrada ya lo tiene asignado | La entrada conserva el proyecto y lo muestra; el selector no lo ofrece para entradas nuevas.                                                                 |
| TT-105 | Etiqueta borrada mientras la entrada la tiene               | La etiqueta desaparece de la entrada. **No verificado**: Clockify podría conservarla; depende del módulo de etiquetas.                                       |
| TT-106 | Cambio de zona horaria del workspace con entradas cargadas  | Los instantes no se tocan; los grupos de día se recalculan y una entrada puede cambiar de día.                                                               |
| TT-107 | Timer que lleva más de 24 horas corriendo                   | Sigue corriendo (TT-42). El tope de TT-74 aplica al guardar, así que detenerlo da error: hay que decidir el tope antes (P-08, P-12).                         |

TT-107 es una contradicción abierta entre el tope de duración propuesto y el
timer sin límite: no la resuelvo acá porque las dos piezas son decisiones del
equipo.

## 11. Primer slice de la fase 1

El primer slice es **el timer con una entrada sin proyecto, de punta a punta**:
arrancar, que se vea corriendo, recargar, detener, verla en la lista del día,
editarle la descripción y borrarla.

Entra en el primer slice:

| ID              | Qué                                                                      |
| --------------- | ------------------------------------------------------------------------ |
| TT-01           | La pantalla muestra solo las entradas propias                            |
| TT-02           | Zona horaria del workspace, 24 h, `dd/MM`                                |
| TT-03, TT-04    | Campo de descripción y su guardado                                       |
| TT-05, TT-71    | Largo máximo de la descripción                                           |
| TT-17           | Contador en modo timer                                                   |
| TT-22, TT-23    | Iniciar y detener                                                        |
| TT-24           | Arrancar con la barra vacía                                              |
| TT-27 (parcial) | Editar la descripción con el timer corriendo                             |
| TT-31, TT-32    | Contador en el cliente y desfase de reloj                                |
| TT-34 … TT-37   | Un solo timer activo y el arranque con otro corriendo                    |
| TT-38 … TT-41   | Recarga, segundo dispositivo, detener dos veces                          |
| TT-43, TT-44    | Agrupación por día y rótulo del encabezado                               |
| TT-45, TT-46    | Total del día, incluyendo el timer activo                                |
| TT-49 (parcial) | Fila con descripción, horas y duración                                   |
| TT-50           | «Sin descripción» y «Sin proyecto»                                       |
| TT-54 (parcial) | Edición en línea de la descripción                                       |
| TT-55           | Guardado de la edición en línea                                          |
| TT-60, TT-61    | Borrar con confirmación                                                  |
| TT-66           | Permisos sobre las entradas propias                                      |
| TT-79, TT-80    | Entrada ajena y entrada ya borrada                                       |
| TT-81           | Red de seguridad contra duración negativa                                |
| TT-85           | Estado vacío inicial                                                     |
| TT-89 … TT-92   | Errores de red, sesión y permiso                                         |
| TT-93 … TT-95   | Sin proyecto, sin descripción, cruce de medianoche                       |
| TT-100 … TT-103 | Medianoche exacta, entrada de cero minutos, dos pestañas, borrado remoto |

Queda para los slices siguientes de la fase 1: selector de proyecto y tarea
(TT-06 … TT-11), etiquetas (TT-12), facturable (TT-14, TT-15), modo manual
(TT-16, TT-18 … TT-21, TT-25, TT-30), atajos (TT-26), edición del inicio del
timer activo (TT-28, TT-29, TT-75), total y encabezado de semana (TT-47,
TT-48), paginación (TT-52), continuar y duplicar (TT-57, TT-58), descartar
(TT-65), selección y edición masiva (TT-62 … TT-64), y el resto de las
validaciones de la tabla de la sección 7.

## Pendientes de definición del equipo

Ninguno de estos puntos se puede relevar en el plan Free o no está en la
documentación pública. No los inventé: van con una propuesta cuando la tengo,
pero necesitan una decisión.

| ID   | Punto                                                                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Campos obligatorios (`requireProject`, `requireTask`, `requireDescription`, `requireTag`) y `forceTimer`: existen en el esquema pero son de plan pago. ¿Se implementan, y con qué reglas? |
| P-02 | Aprobaciones y bloqueo de períodos: definen cuándo una entrada deja de ser editable. Sin ellas no hay bloqueo.                                                                            |
| P-03 | Redondeo (`roundingMinutes`): en Clockify es pago y solo afecta reportes. ¿Se mantiene fuera del rastreador?                                                                              |
| P-04 | Entradas superpuestas: ¿se permiten en silencio, se avisa o se rechazan?                                                                                                                  |
| P-05 | Dividir entrada: funcionalidad paga. ¿Entra en el alcance y con qué reglas de corte?                                                                                                      |
| P-06 | Deshacer el borrado 20 segundos (necesita borrado lógico) o diálogo de confirmación como se propone en TT-61.                                                                             |
| P-07 | Edición masiva en el rastreador: no sé si está en Free. Confirmar en el workspace y decidir si entra en la fase 1.                                                                        |
| P-08 | Duración máxima de una entrada. Propuse 24 horas; el valor es arbitrario.                                                                                                                 |
| P-09 | Agrupación de entradas similares en una fila colapsable.                                                                                                                                  |
| P-10 | Entradas con fecha futura: propuse rechazarlas; no pude verificar qué hace Clockify.                                                                                                      |
| P-11 | Intervalo de sincronización entre dispositivos. Propuse revalidar al enfocar y cada 60 segundos.                                                                                          |
| P-12 | Timer abandonado: ¿se corta solo, se avisa, se deja correr? Choca con P-08 (ver TT-107).                                                                                                  |
| P-13 | Zona horaria, formato de hora y fecha, e inicio de semana por usuario: no están en el esquema. ¿Se agregan en la fase 1 o se usa el workspace?                                            |
| P-14 | Verificar en el workspace real del equipo lo marcado como _no verificado_: TT-35, TT-46, TT-47, TT-58, TT-63, TT-65, TT-105.                                                              |
