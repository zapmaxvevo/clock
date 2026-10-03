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

### Una redacción por causa

Dos mensajes distintos para el mismo hecho se leen como dos problemas
distintos. Cuando una causa ya tiene texto, el comportamiento que la vuelve a
producir reusa ese texto en vez de escribir el suyo. Las causas que hoy
aparecen en más de un lugar:

| Causa                                  | Texto único                                         | Dónde aparece                                                         |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| La entrada ya no está en la base       | «Esa entrada ya no existe.»                         | TT-80, TT-103                                                         |
| Un timer activo empezaría en el futuro | «No se pueden cargar horas que todavía no pasaron.» | TT-29, TT-75                                                          |
| Hay un timer corriendo                 | «Detené el timer para agregar tiempo a mano.»       | TT-30, y su validación                                                |
| La hora de pared cae en el salto       | «Esa hora no existe por el cambio de horario.»      | TT-112: `createManualEntry`, `updateEntryTimes`, `updateRunningStart` |

**Qué hace que dos casos sean la misma causa**: que coincidan el hecho que
bloquea y lo que hay que hacer para destrabarlo. Si el remedio es distinto, el
texto tiene que ser distinto, aunque el hecho se parezca. El par TT-30 y TT-111
es el ejemplo: los dos hablan de un timer corriendo, pero uno pide detenerlo y
el otro no, así que son dos textos.

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
en el perfil de la persona. Acá se usa la zona horaria del workspace, formato
24 h y fecha `dd/MM`, y los cortes de día y semana salen de `src/server/time`.
Justificación: el modelo de datos no tiene los campos por usuario; el equipo
cerró P-13 a favor del workspace para toda la fase 1 y dejó el perfil para su
propio slice. Cómo viaja una hora tecleada desde el navegador hasta el instante
guardado está en el
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md), y el relevamiento
de los ajustes está en [la paridad del perfil](perfil.md).

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

**TT-16 Conmutador de modo** — `adaptar`
A la derecha de la barra, dos íconos: reloj (modo timer) y lista (modo manual).
El modo elegido se recuerda entre visitas. Acá se recuerda por navegador, en
una cookie, y no por persona: no viaja entre dispositivos. Justificación: no
hay perfil todavía; cuando exista es un campo más.
_No verificado en documentación pública_: que Clockify lo recuerde por cuenta y
no por navegador es una suposición, no un relevamiento.

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
teclado y convención en español. La tabla de equivalencias depende del formato
de duración del workspace; está explicado en PF-21 de
[la paridad del perfil](perfil.md).

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
recalcula de inmediato. Es el único camino para corregir el inicio de la
entrada abierta, que en nuestra lista no es una fila (TT-111).
_Corregido el 2026-10-03, decisión del equipo_: decía «desde la fila no se
puede», como si la entrada abierta tuviera fila.

**TT-29 Inicio posterior al momento actual** — `adaptar`
No está documentado qué hace Clockify. Acá se rechaza: un timer activo no puede
empezar en el futuro. El mensaje es el único de esa causa,
«No se pueden cargar horas que todavía no pasaron.» (TT-75).
Justificación: con `start` en el futuro la duración sería negativa y el
contador no tendría qué mostrar. Que TT-76 acepte una entrada manual con fecha
futura no toca esta regla: una entrada cerrada en el futuro se puede dibujar,
un contador que corre hacia atrás no.

**TT-30 El modo manual queda deshabilitado mientras el timer corre** —
`replicar`
Documentado: no se puede agregar tiempo a mano con un timer activo. El
conmutador de modo queda inactivo y el texto «Detené el timer para agregar
tiempo a mano.» lo explica. Es el mismo texto con el que responde la validación
del servidor cuando el pedido llega igual desde una pestaña desactualizada.

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
regla para que dos pestañas no dejen dos entradas abiertas. El detalle está en
el [ADR 0003](../adr/0003-un-solo-timer-activo.md).

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
revalida al recuperar el foco, al volver a hacerse visible y cada 60 segundos
mientras está visible, así que puede seguir contando hasta un minuto después de
que se detuvo en la otra. Con la pestaña oculta no pide nada. Justificación: no
hay websockets ni estado en memoria en el servidor (ver `CLAUDE.md`).

**TT-41 Detener un timer que ya fue detenido** — `adaptar`
Si la pestaña desactualizada manda «Detener» sobre una entrada ya cerrada, la
action no la vuelve a escribir y devuelve el estado real. La interfaz muestra
«Este timer ya había sido detenido.» y refresca la lista. Justificación: no es
observable en Clockify; hace falta una regla explícita porque el escenario es
frecuente con dos pestañas.

**TT-42 Timer que quedó corriendo días** — `replicar`
Clockify lo deja correr sin límite en la web (la detección de inactividad es
del cliente de escritorio) y acá también: la lista muestra el día de inicio con
el contador sumando, y al detenerlo la entrada se guarda con la duración que
tenga, por larga que sea. El equipo cerró P-12 sin corte automático.

## 5. La lista de entradas

**TT-43 Agrupación por día** — `replicar`
Las entradas se agrupan por el día local de su `start`, de la más reciente a la
más vieja. Cada grupo tiene un encabezado con el nombre del día y el total del
día a la derecha. Un día posterior a hoy, que TT-76 hace posible, se ordena por
la misma regla y queda arriba del grupo de hoy.

**TT-44 Rótulo del encabezado de día** — `adaptar`
Clockify rotula «Today», «Yesterday» y, para el resto, el día de la semana con
la fecha. Acá: «Hoy», «Ayer» y, para el resto, `mié, 01/10`, con el año cuando
el día cae fuera del año en curso. Justificación: formato de fecha en español.
El rótulo tiene una sola implementación y la comparten el encabezado de día y
el botón del selector de fecha de la barra manual.
_No verificado_: un día posterior a hoy se rotula con su fecha. Si Clockify
usa un rótulo propio para mañana, no está documentado; confirmar en el
workspace del equipo (P-14).

**TT-52 Ventana y paginación de la lista** — `adaptar`
Clockify carga más entradas al bajar y así alcanza cualquier día del pasado.
Acá la pantalla trae los últimos 14 días, extendidos hacia atrás hasta el día
de la última entrada cerrada y hasta el día del timer activo —de los dos, el
más viejo—, y un botón «Cargar más» agrega una semana por clic. La extensión
hacia atrás es lo que evita que la lista aparezca vacía habiendo entradas
viejas; el botón todavía no existe. Justificación: el scroll infinito en un
Server Component paginado complica la revalidación sin aportar a la fase 1.

**El extremo nuevo de la ventana es el día de la entrada más nueva, que puede
ser posterior a hoy.** Con TT-76 aceptando fechas futuras, una ventana que
termina en «ahora» deja una entrada futura invisible para siempre, y «Cargar
más» no la alcanza nunca porque solo agrega días hacia atrás. Es el único punto
del documento donde aceptar la fecha futura obliga a cambiar algo ya escrito.

**TT-108 Entrada que queda en un día que la lista no muestra** — `adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._
En Clockify el problema no se plantea: la documentación del modo manual dice
que la entrada «will be added to the appropriate day header (whether the date
is in the past or the future)», y como la lista pagina desde el principio, ese
día siempre se alcanza bajando. No hay salto automático ni aviso documentado.
_No verificado_: si la lista hace scroll hasta la entrada recién creada.

Acá, mientras «Cargar más» no exista (TT-52), una entrada que queda con una
fecha fuera de la ventana se guarda y no se puede ver. Pasa con dos acciones:
crearla en modo manual con esa fecha, y mover una fila a ese día cambiándole la
fecha (TT-56). Pasa solo hacia atrás, con una fecha vieja: hacia adelante la
ventana se extiende hasta el día de la entrada más nueva (párrafo anterior),
así que una fecha futura siempre se ve. _Corregido el 2026-10-03, decisión del
equipo_: antes decía que también pasaba hacia adelante. El comportamiento es:

- La entrada se guarda igual. No se valida la fecha contra la ventana: cargar
  horas de un mes atrás es un caso legítimo y bloquearlo sería inventar una
  regla que Clockify no tiene.
- Aparece un aviso informativo —sin ícono de error y sin «Reintentar»— que
  nombra el día en que quedó la entrada y aclara que está fuera de los días que
  la lista muestra. **Lo muestra la barra cuando la entrada se crea, y la lista
  cuando se mueve una fila** (TT-56), en un lugar que no depende de ningún día,
  porque el grupo del que salió la fila puede desaparecer con ella. El texto es
  el mismo en los dos casos.
- **Cuando llegue TT-52 el aviso se retira** y la ventana pasa a extenderse
  hasta incluir el día de la entrada recién creada, que es la misma regla con
  la que ya se extiende hasta el último día con entradas. Ahí el comportamiento
  vuelve a ser el de Clockify: la entrada está en su día y se llega bajando.
  Decidido por el equipo el 2026-10-02 (P-15): el slice que implemente TT-52 lo
  encuentra resuelto y no tiene que volver a abrirlo.

_Corregido el 2026-10-03, decisión del equipo_: el título y el texto hablaban
solo de la entrada creada y del aviso en la barra; mover una fila con la
edición en línea produce el mismo caso, y su aviso lo muestra la lista.

Justificación: el aviso es una divergencia deliberada y temporal. Clockify no
avisa porque no lo necesita; sin paginación, no avisar significa que la entrada
desaparece sin señal.

**TT-45 Total del día** — `replicar`
Suma de las duraciones de las entradas del grupo, en formato `h:mm`, rotulada
«Total». La suma se hace en segundos y se formatea una sola vez, para que el
total no acumule el truncamiento de cada fila.

**TT-46 El total del día incluye el timer activo** — `adaptar`
_No verificado en documentación pública_. Acá el total del día en curso suma el
transcurrido del timer activo y se actualiza con el contador; el grupo de ese
día existe aunque no tenga ninguna entrada cerrada. Justificación: sin esta
suma el total del día de hoy queda visiblemente por debajo de lo trabajado; si
el workspace del equipo muestra lo contrario, se corrige.

**TT-47 Encabezado y total de la semana** — `replicar`
Arriba de los grupos de día, una franja por semana con el rótulo
«Esta semana» / «Semana anterior» / el rango de fechas, y el total de la semana
a la derecha, en `h:mm`. Una entrada con fecha futura de la semana en curso
suma en «Esta semana» como cualquier otra.
_No verificado en documentación pública_: la franja se ve en el producto pero
no está descrita en el centro de ayuda. Confirmar en el workspace del equipo.

**TT-48 Corte de la semana** — `adaptar`
El corte sale de `weekBounds` de `src/server/time` con el inicio de semana del
workspace. En Clockify el inicio de semana es por persona y lo fija un admin.
Justificación: no hay campo por usuario (P-13).

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

**TT-53 Agrupación de entradas similares** — `fuera de alcance`
Clockify colapsa en una fila las entradas del mismo día con igual descripción y
proyecto, con un contador de cuántas son. El interruptor que la gobierna está
en el perfil (PF-26 de [la paridad del perfil](perfil.md)). Justificación:
cambia el modelo de la lista y las acciones en masa; se decide aparte (P-09).

## 6. Acciones sobre una entrada

**TT-54 Edición en línea** — `replicar`
Documentado: se editan descripción, proyecto, facturabilidad, etiquetas, hora
de inicio, hora de fin y fecha haciendo clic sobre el campo en la fila, y el
cambio se guarda solo. La documentación no pone ninguna excepción por duración
y no dice si la entrada que corre aparece en la lista (TT-111); nosotros
ponemos dos excepciones, TT-110 y TT-111.
_Corregido el 2026-10-03, relevamiento_: decía que Clockify no exceptúa la
entrada que corre, y eso la documentación no lo dice.

**TT-55 Guardado de la edición en línea** — `adaptar`
Se guarda al perder el foco o con Enter; `Esc` descarta y vuelve al valor
anterior. Mientras la escritura está en vuelo la fila queda atenuada; si falla,
el valor vuelve y aparece el error. Justificación: el guardado por pulsación de
Clockify no es replicable sin multiplicar las escrituras (ver TT-04).

**TT-56 Mover una entrada a otro día** — `replicar`
Cambiar la fecha en la fila mueve la entrada al grupo de día que corresponde y
recalcula los dos totales afectados. El día de destino puede ser futuro
(TT-76). Si cae fuera de la ventana de la lista, vale TT-108.

**TT-110 Una entrada que el trío no puede expresar no edita sus horarios desde
la fila** — `adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._
En Clockify la edición en línea no tiene excepciones por duración (TT-54).

Acá, la fila edita los horarios con el trío `{fecha, inicio, fin}`: un fin
menor que el inicio significa el día siguiente (TT-72) y un fin igual al inicio
da cero (TT-73). El trío no lleva el día del fin, así que hay entradas que no
puede representar. Una de esas —que existen, porque no hay duración máxima
(TT-74) y un timer puede correr días (TT-42)— se truncaría al guardarla: una de
25 horas quedaría como de 1.

**La regla es de round-trip, no un umbral de duración.** La fila ofrece el
editor solo si su trío, leído con la regla de TT-72, vuelve a dar el mismo fin.
Inicio y fin conservan siempre su hora de pared; lo único que el trío puede
perder es el día del fin, y eso es lo que se compara, al minuto. Lo decide el
servidor con `editableTimes`, según el §5 del
[contrato del slice 3](../slices/fase1-slice3-horas-y-fecha.md).

La regla equivale a **«menos de 24 horas de reloj, al minuto»**: la **distancia
de reloj** entre los rótulos de los dos extremos —cada hora de pared con su
día, contada en minutos enteros y sin pasar a instantes— va de 0 a 1439
minutos. Los topes son de reloj sobre los rótulos, no de duración:

- Una entrada de 30 segundos es editable: su distancia de reloj es de 0 o 1
  minuto.
- Una de 23 h 59 min 40 s puede no serlo: de `10:00:50` a `10:00:30` del día
  siguiente, los dos rótulos son `10:00` y la distancia es de 1440 minutos. Por
  los segundos de cada extremo, la duración real de una entrada queda a menos
  de un minuto, por encima o por debajo, de su distancia de reloj.
- Cruzando un cambio de horario, distancia y duración difieren en una hora: una
  entrada a 23 h 30 min de reloj que cruza el atraso dura 24 h 30 min reales y
  se edita; una a 24 h 30 min de reloj que cruza el adelanto dura 23 h 30 min
  reales y queda en solo lectura.

Hay un único caso en que la hora de pared del fin queda antes que la del inicio
sin que la entrada dure un día: los dos extremos dentro de la hora que se
repite el día en que se atrasa el reloj, el inicio en la primera pasada y el fin
en la segunda, con una hora de pared menor. Ese caso tampoco se edita, porque
el trío lo leería como una entrada que termina al día siguiente.

_Corregido el 2026-10-03, decisión del equipo_: el título y este texto
prometían un umbral fijo de 24 horas que el código no cumple en los días con
cambio de horario.
_Corregido el 2026-10-03, decisión del equipo_: decía que sin cambio de horario
la regla coincide con «entre un minuto y 23 h 59 min», que deja afuera a una
entrada de menos de un minuto, que sí es editable.
_Corregido el 2026-10-03, decisión del equipo_: daba los topes en duración real
—«menos de 24 horas», «hasta 24 h 59 min»—, que por los segundos de cada
extremo no es exacto; van en minutos de reloj sobre los rótulos.

El comportamiento, decidido por el equipo el 2026-10-02:

- La fecha, el inicio y el fin de esa entrada quedan **en solo lectura**. El
  resto de la fila —descripción, y más adelante proyecto, etiquetas y
  facturable— se sigue editando normalmente.
- Un texto en la fila explica por qué:
  «Esta entrada dura más de un día; sus horarios no se pueden editar acá.»
- Las otras acciones no se tocan: se puede continuar, duplicar y borrar.

Justificación: es preferible no ofrecer la edición a ofrecerla y que destruya
el dato en silencio. Es una divergencia deliberada y acotada.
**Cómo se cierra**: con un editor de horarios que acepte fecha de fin, además
de fecha de inicio. Ahí el trío deja de ser el límite y la excepción
desaparece. No está planificado; se nombra para que la solución esté escrita
junto al problema.

Es también la consecuencia visible de P-08: con un tope de 24 horas por entrada
este caso quedaría reducido a los días en que se adelanta el reloj. El equipo
eligió no poner tope, y este es el precio.

**TT-111 La entrada que está corriendo no edita sus horarios desde la fila** —
`adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._

**En nuestra lista la entrada abierta no es una fila.** Los grupos de día traen
solo entradas cerradas (`dayGroupView` en `src/modules/time-entry/schema.ts`) y
la entrada que corre vive en la barra del timer. El grupo de su día existe
aunque no tenga ninguna entrada cerrada, para sumar el transcurrido al total
(TT-46), pero no la dibuja. Su inicio se corrige desde el contador (TT-28).

La parte visible de la regla se cumple entonces por construcción: no hay fila
abierta cuyos horarios tocar. Lo que la regla fija es la respuesta del
servidor cuando un pedido de edición de horarios llega igual sobre la entrada
abierta, armado a mano o desde una pestaña desactualizada: se rechaza sin
escribir con «Esta entrada es la que está corriendo.» Decidido por el equipo
el 2026-10-02.

**Cómo lo hace Clockify: no verificado.** La documentación de creación de
entradas dice que el inicio de un timer corriendo se cambia «by clicking on
the running time», y ni esa página ni las de edición y modo manual dicen si la
entrada abierta aparece además como fila en la lista. Confirmar en el
workspace del equipo (P-14):

- Si Clockify no la muestra como fila, la presentación coincide y lo único
  propio es la validación del servidor.
- Si la muestra, **es una divergencia**: nuestra lista omite una fila que
  Clockify dibuja. Hay que decidir si se replica, y con qué campos editables,
  o si se mantiene con su justificación.

_Corregido el 2026-10-03, decisión del equipo y relevamiento_: el texto
anterior decía que acá la entrada abierta aparece en el grupo de su día como
fila, que el código no hace, y daba por relevado que en Clockify vive solo en
la barra, que la documentación no dice.

**Por qué no reusa el texto de TT-30.** Los dos hablan de un timer corriendo,
pero no son la misma causa según el criterio de la sección «Una redacción por
causa»: en TT-30 el obstáculo es que exista cualquier timer abierto y el
remedio es detenerlo; acá el obstáculo es una propiedad de la entrada que se
pidió editar y el remedio **no** es detener el timer, porque TT-28 deja
corregir el inicio desde la barra sin detener nada. Un texto que dijera
«detené el timer» mandaría a hacer algo innecesario.

Justificación del `adaptar`: el rechazo del servidor es una regla nuestra que
Clockify no documenta. Si P-14 muestra que Clockify dibuja la fila abierta, la
omisión de esa fila pasa a ser parte de esta misma adaptación.

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
Acá el borrado pide confirmación en un diálogo y no se puede deshacer; el
borrado es físico y la única copia de la fila queda en el audit log.
Justificación: el deshacer necesita borrado lógico y un barrido posterior. El
equipo cerró P-06 a favor del diálogo para la fase 1.

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
decisión sobre el deshacer.

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

| ID     | Regla                                                                                                                      | Mensaje                                                                            | Marca      |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| TT-68  | Descripción opcional                                                                                                       | —                                                                                  | `replicar` |
| TT-69  | Proyecto opcional                                                                                                          | —                                                                                  | `replicar` |
| TT-70  | Tarea solo con proyecto                                                                                                    | «Elegí un proyecto antes que una tarea.»                                           | `replicar` |
| TT-71  | Descripción de hasta 3000 caracteres                                                                                       | «La descripción no puede superar los 3000 caracteres.»                             | `adaptar`  |
| TT-113 | Descripción con el carácter nulo (`\u0000`), que Postgres no guarda; diseño propio, 2026-10-03                             | «La descripción tiene un carácter que no se puede guardar.»                        | `adaptar`  |
| TT-72  | `end` anterior a `start` se interpreta como el día siguiente                                                               | —                                                                                  | `replicar` |
| TT-73  | Duración cero no se guarda en modo manual                                                                                  | «La entrada tiene que durar al menos un minuto.»                                   | `adaptar`  |
| TT-74  | Sin duración máxima por entrada                                                                                            | —                                                                                  | `replicar` |
| TT-75  | Un timer activo no puede empezar en el futuro                                                                              | «No se pueden cargar horas que todavía no pasaron.»                                | `adaptar`  |
| TT-76  | La fecha futura se acepta en modo manual                                                                                   | —                                                                                  | `replicar` |
| TT-77  | Proyecto inexistente, archivado o sin acceso                                                                               | «Ese proyecto ya no está disponible.»                                              | `adaptar`  |
| TT-78  | Etiqueta inexistente o archivada                                                                                           | «Esa etiqueta ya no está disponible.»                                              | `adaptar`  |
| TT-79  | Entrada ajena, o membresía que no puede escribir                                                                           | «No tenés permiso para editar esta entrada.» / «No tenés permiso para hacer esto.» | `replicar` |
| TT-80  | Entrada ya borrada                                                                                                         | «Esa entrada ya no existe.»                                                        | `adaptar`  |
| TT-112 | Hora de pared que cae en el salto del cambio de horario, en `createManualEntry`, `updateEntryTimes` y `updateRunningStart` | «Esa hora no existe por el cambio de horario.»                                     | `adaptar`  |

Justificaciones y detalle:

- **TT-71, TT-73**: límites propios. Clockify no documenta ninguno de los dos;
  hacen falta para el esquema y para que la barra manual no cree entradas de
  duración cero.
- **TT-74**: Clockify no documenta ningún tope y no se observó ninguno. El
  equipo cerró P-08 sin tope: una entrada de cuarenta horas producida por un
  timer se guarda sin problema. El campo de duración de la barra manual no
  acepta 24 horas o más, pero eso es un límite de lo que esa barra puede
  expresar —su fin es una hora de pared del día siguiente como máximo—, no un
  tope de la entrada. Un límite del mismo origen, visto desde la fila, es
  TT-110, que en los días con cambio de horario no coincide con 24 horas.
- **TT-75**: la regla vale solo para el timer activo, y el futuro lo define el
  reloj del servidor, no el del navegador (ADR 0005). El porqué está en TT-29.
- **TT-76**: la documentación del modo manual dice que la entrada cae en el
  encabezado del día que corresponda «whether the date is in the past or the
  future». Se acepta la fecha futura, el calendario deja elegirla y no hay
  mensaje que mostrar. **Aceptar la fecha futura no habilita un fin anterior al
  inicio**: TT-72 lo sigue leyendo como el día siguiente y el `check` de la
  base sigue rechazando cualquier fila con `end` anterior a `start` (TT-81). Lo
  que cambia es el día, no el orden de los dos instantes. Ver P-10: hubo una
  divergencia que rechazaba estas fechas y se revirtió.
- **TT-77, TT-78, TT-80**: errores de dominio que Clockify resuelve en el
  cliente recargando la lista; acá se devuelven como error tipado desde la
  action.
- **TT-79**: la regla es la de Clockify, los dos textos son nuestros. El que
  nombra la entrada es para la entrada de otra persona; el neutro es para la
  membresía que no puede escribir sobre la suya (TT-92). Un mensaje que
  distinga de más le contaría a quien pregunta qué entradas existen.

**TT-112 La hora que no existe por el cambio de horario se rechaza** —
`adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._
_Agregado el 2026-10-03, diseño propio_, decidido en el
[ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md).

El día en que el reloj se adelanta hay una franja de horas de pared que no
ocurre: en Madrid, el 2026-03-29, de 02:00 a 02:59. Una hora tecleada en esa
franja se rechaza con un error de validación y
«Esa hora no existe por el cambio de horario.», sin escribir nada. Vale en las
tres actions que convierten una hora de pared en instante: el alta manual
(`createManualEntry`, slice 2) y las dos ediciones de horas
(`updateEntryTimes` y `updateRunningStart`, slice 3). El texto es el mismo en
las tres porque la causa y el remedio son los mismos: elegir otra hora.

La hora que ocurre dos veces, el día en que el reloj se atrasa, no se rechaza:
se acepta y se resuelve con el segundo instante (ADR 0005).

_No verificado_: la documentación pública consultada, incluida la del modo
manual, no menciona el cambio de horario, así que no sé qué hace Clockify con
esa hora. Confirmar en el workspace del equipo (P-14).
Justificación: no hay referencia contra la cual compararse; la regla sale de
que desplazar la hora hacia adelante puede dejar el fin antes del inicio o una
entrada de duración cero, y rechazar conserva el orden de los dos extremos.

**TT-81 Duración negativa** — `replicar`
No existe como estado guardable. Toda combinación que daría una duración
negativa se resuelve antes: en modo manual por TT-72 (el fin pasa al día
siguiente), en el timer activo por TT-75. La base tiene además un `check` que
rechaza cualquier fila con `end` anterior a `start`, y el service lo traduce a
«La hora de fin tiene que ser posterior a la de inicio.» Esto último es una red
de seguridad del servidor, no un camino de la interfaz, y vale igual para una
entrada con fecha futura.

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
La semana vacía no se dibuja: la lista salta al último día con entradas, y para
eso la ventana se extiende hacia atrás hasta ese día (TT-52). No hay días
vacíos intermedios.

**TT-87 Workspace sin proyectos** — `adaptar`
El selector de proyecto abre con «No hay proyectos todavía» y, si el rol lo
permite, un enlace a la pantalla de proyectos. Justificación: en Clockify ahí
va «Crear proyecto», que es TT-09 y está fuera de alcance.

**TT-88 Workspace sin etiquetas** — `adaptar`
El selector de etiquetas abre con «No hay etiquetas todavía». Misma
justificación que TT-87.

## 9. Estados de error

**TT-89 Falla de red al guardar** — `adaptar`
El botón vuelve a su estado anterior, lo tecleado se conserva y aparece un
aviso «No se pudo guardar. Revisá la conexión y volvé a intentar.», con la
acción «Reintentar». «Reintentar» se ofrece solo para esta causa: ni un error
de validación ni un permiso mejoran repitiendo el mismo pedido. La única
operación del módulo que no lo ofrece es el alta manual, por TT-109.
Justificación: Clockify acumula los cambios en el cliente y los reenvía; acá no
hay cola de reintentos.

**TT-109 El alta manual no ofrece «Reintentar»** — `adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._
Clockify reenvía solo y no expone la decisión, así que no hay nada que relevar
acá: la regla es nuestra.

Decidido por el equipo el 2026-10-02: cuando `createManualEntry` falla por red,
el aviso dice **«No sabemos si la entrada se guardó.»** y manda a mirar la
lista, sin botón de «Reintentar». Lo tecleado se conserva, como en TT-89.

Justificación: el alta manual es la única operación del módulo que **solo
crea**. Si el pedido llegó al servidor y lo que se perdió fue la respuesta,
reintentar crea una segunda entrada idéntica, y nada la frena: no choca contra
el índice único del timer abierto, como sí haría un segundo arranque (TT-37), y
TT-82 acepta la superposición sin decir nada. Un reintento que a veces duplica
es peor que no ofrecerlo.

El resto de las operaciones del módulo sí ofrece «Reintentar», porque repetirlas
es inofensivo: arrancar choca con el índice único, detener sobre una entrada ya
cerrada da TT-41, y editar y borrar apuntan a un identificador que ya existe, así
que el segundo intento produce el mismo estado que el primero.

**TT-90 El aviso nombra la acción que falló** — `adaptar`
Un aviso tiene dos partes: un título que nombra lo que no se pudo hacer —«No se
pudo guardar la descripción.», «No se pudo borrar la entrada.»— y abajo el
mensaje del error, que es el de la tabla de la sección 7. Un campo que no se
guardó vuelve además a su valor anterior. Justificación: el título es nuestro;
Clockify no muestra este aviso porque reintenta solo.

**TT-91 Sesión vencida** — `adaptar`
La action devuelve 401 y la interfaz lleva a la pantalla de acceso conservando
la ruta de vuelta. Un timer activo no se pierde: sigue abierto en la base y
reaparece al volver a entrar. Justificación: es comportamiento de nuestra
autenticación, no de Clockify.

**TT-92 Membresía desactivada mientras la sesión está abierta** — `adaptar`
`can` devuelve falso y la pantalla queda en solo lectura, con un aviso
permanente: «Tu acceso al workspace está desactivado.» y la línea «Podés ver
tus horas, pero no cargar ni modificar entradas. Pedile a quien administra el
workspace que vuelva a activar tu membresía.» Un pedido que llegue igual recibe
el mensaje neutro de TT-79. Justificación: `membership_status` es nuestro
modelo.

## 10. Casos borde

| ID     | Caso                                                        | Comportamiento esperado                                                                                                                                                                                                                                                                |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TT-93  | Entrada sin proyecto                                        | Válida en todo el recorrido: se crea, se lista, se edita, se continúa, se duplica y suma a los totales. Ver TT-24, TT-50.                                                                                                                                                              |
| TT-94  | Descripción vacía                                           | Válida. La fila muestra «Sin descripción». Continuar y duplicar la mantienen vacía.                                                                                                                                                                                                    |
| TT-95  | Timer cruzando la medianoche                                | La entrada queda en el grupo del día de su `start`. El fin lleva el superíndice de días (TT-51). El total del día de inicio la suma entera.                                                                                                                                            |
| TT-96  | Timer cruzando el fin de semana                             | Igual: la entrada cuenta entera en la semana de su `start`, no se parte entre semanas.                                                                                                                                                                                                 |
| TT-97  | Cambio de horario de verano dentro de la entrada            | La duración se calcula sobre instantes UTC, así que es la real; las horas mostradas son las locales de cada extremo y pueden no cuadrar con la resta visual. Lo que se respeta son las horas de pared tecleadas (ADR 0005). Una hora tecleada que cae en el salto se rechaza (TT-112). |
| TT-98  | Duración negativa                                           | Imposible de guardar. Ver TT-81.                                                                                                                                                                                                                                                       |
| TT-99  | Fecha futura                                                | Se acepta en modo manual y la entrada cae en el grupo de su día, arriba del de hoy (TT-43, TT-76). Un timer activo sí tiene prohibido empezar en el futuro (TT-75). La ventana se extiende hasta su día, así que siempre se ve: TT-108 no aplica.                                      |
| TT-100 | Entrada que empieza exactamente a las 00:00                 | Pertenece al día que empieza, no al anterior.                                                                                                                                                                                                                                          |
| TT-101 | Detener en el mismo minuto en que se arrancó                | La entrada se guarda con la duración real en segundos; la lista la muestra como `0:00` y suma sus segundos al total del día. La duración cero solo la rechaza el modo manual (TT-73), no la base.                                                                                      |
| TT-102 | Dos pestañas arrancando a la vez                            | Queda un solo timer. Ver TT-37.                                                                                                                                                                                                                                                        |
| TT-103 | Borrar la entrada que está corriendo desde otra pestaña     | La pestaña con la barra descubre que no existe al reintentar, limpia la barra y avisa «No se pudo detener el timer.» con «Esa entrada ya no existe.», el mismo texto de TT-80.                                                                                                         |
| TT-104 | Proyecto archivado mientras la entrada ya lo tiene asignado | La entrada conserva el proyecto y lo muestra; el selector no lo ofrece para entradas nuevas.                                                                                                                                                                                           |
| TT-105 | Etiqueta borrada mientras la entrada la tiene               | La etiqueta desaparece de la entrada. **No verificado**: Clockify podría conservarla; depende del módulo de etiquetas.                                                                                                                                                                 |
| TT-106 | Cambio de zona horaria del workspace con entradas cargadas  | Los instantes no se tocan; los grupos de día se recalculan y una entrada puede cambiar de día.                                                                                                                                                                                         |
| TT-107 | Timer que lleva más de 24 horas corriendo                   | Sigue corriendo y al detenerlo se guarda entero (TT-42, TT-74). No hay tope. Una vez cerrada, si el trío no la puede expresar, sus horarios no se editan desde la fila (TT-110).                                                                                                       |

## 11. Reparto por slices

El orden completo de la fase 1 está en
[el mapa de la fase 1](../slices/fase1-mapa.md). Acá queda solo lo que este
documento necesita separar.

### Slice 1 — el timer con una entrada sin proyecto (implementado)

De punta a punta: arrancar, que se vea corriendo, recargar, detener, verla en
la lista del día, editarle la descripción y borrarla. Está desplegado; el
contrato es [fase1-slice1-timer.md](../slices/fase1-slice1-timer.md).

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
| TT-52 (parcial) | La ventana de 14 días extendida hacia atrás, sin «Cargar más»            |
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

### Slice 2 — modo manual

TT-16, TT-18, TT-19, TT-20, TT-21, TT-25, TT-30, TT-72, TT-73, TT-76, TT-82,
TT-108, TT-109 y TT-112 en el alta manual. Contrato:
[fase1-slice2-modo-manual.md](../slices/fase1-slice2-modo-manual.md).

### Lo que queda

Selector de proyecto y tarea (TT-06 … TT-11), etiquetas (TT-12), facturable
(TT-14, TT-15), atajos (TT-26), edición del inicio del timer activo (TT-28,
TT-29, TT-75), edición en línea de horas y fecha con sus dos excepciones
(TT-54, TT-56, TT-110, TT-111), TT-112 en las dos ediciones de horas, total y
encabezado de semana (TT-47, TT-48), «Cargar más» y el extremo nuevo de la
ventana (TT-52), continuar y duplicar (TT-57, TT-58), descartar (TT-65), y
selección y edición masiva (TT-62 … TT-64).

## Pendientes de definición del equipo

### Abiertos

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
| P-07 | Edición masiva en el rastreador: no sé si está en Free. Confirmar en el workspace y decidir si entra en la fase 1.                                                                        |
| P-09 | Agrupación de entradas similares en una fila colapsable. El interruptor vive en el perfil (PF-26).                                                                                        |
| P-14 | Verificar en el workspace real del equipo lo marcado como _no verificado_: TT-16, TT-35, TT-44, TT-46, TT-47, TT-58, TT-63, TT-65, TT-105, TT-108, TT-111, TT-112.                        |

### Cerrados

Se dejan con su identificador porque los contratos de slice los citan.

| ID   | Decisión                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-06 | Borrado con diálogo de confirmación y sin deshacer para la fase 1. El audit log guarda la fila borrada (TT-61).                                                                                                                                                        |
| P-08 | Sin duración máxima por entrada (TT-74). Su consecuencia visible en la fila es TT-110.                                                                                                                                                                                 |
| P-10 | La fecha futura se acepta, como en Clockify (TT-76, TT-99). El slice 2 llegó a implementar el rechazo y el equipo lo revirtió el 2026-10-02: inventaba una pared que la herramienta no tiene. Si alguna vez se quiere, entra como mejora deliberada y no como paridad. |
| P-11 | La pantalla revalida al enfocar, al volver a ser visible y cada 60 segundos mientras está visible (TT-40).                                                                                                                                                             |
| P-12 | Un timer abandonado se deja correr: no hay corte automático (TT-42).                                                                                                                                                                                                   |
| P-13 | Zona horaria y formatos salen del workspace en toda la fase 1 (TT-02, TT-48). El perfil por persona es un slice aparte y no los mueve.                                                                                                                                 |
| P-15 | Cuando llegue TT-52 se retira el aviso de TT-108 y la ventana se extiende hasta el día de la entrada recién creada. Decidido el 2026-10-02.                                                                                                                            |
