# Paridad: calendario

Alcance de este documento: la pantalla de calendario de Clockify —la grilla de
horas por día y por semana, con las entradas propias dibujadas como bloques— y
lo que se hace sobre ella: navegar, crear, mover, estirar, abrir el diálogo de
una entrada, ver los totales, la línea de «ahora» y el timer activo. No cubre el
rastreador —está en [`time-tracker.md`](time-tracker.md)—, el timesheet, ni las
integraciones con calendarios externos, salvo para decir dónde terminan.

Es la precondición del slice 8 del [mapa de la fase 1](../slices/fase1-mapa.md).

Cada comportamiento lleva un identificador `CAL-nn` para que lo citen el
reviewer de paridad y los flujos de Playwright, y una marca `replicar`,
`adaptar` o `fuera de alcance`. Las dos últimas llevan una línea de
justificación. Las referencias `TT-nn` apuntan a
[la paridad del rastreador](time-tracker.md), las `PF-nn` a
[la del perfil](perfil.md) y las `PR-nn` a [la de proyectos](proyectos.md).

**Este documento casi no especifica mutaciones.** El calendario es una segunda
forma de ver y de tocar las mismas entradas que el rastreador: crear es el alta
manual del slice 2, mover y estirar son la edición de horas del slice 3, borrar
y duplicar son TT-60 y TT-58. Donde un comportamiento ya está especificado en
`time-tracker.md` se cita el TT y no se reespecifica. Lo que este documento
agrega es cómo se llega a esas mutaciones desde una grilla, y qué parte de lo
que una grilla invita a hacer no lo pueden expresar.

## Fuentes y límites del relevamiento

Documentación pública del centro de ayuda de Clockify, su página de producto y
su tabla de planes:

- https://clockify.me/help/track-time-and-expenses/calendar-view (la página del
  calendario; `…/calendar` muestra el mismo contenido)
- https://clockify.me/help/track-time-and-expenses/creating-a-time-entry
  (sección «Track time in the Calendar view» y la lista de atajos)
- https://clockify.me/help/track-time-and-expenses/split-time-entries (dividir
  desde el calendario)
- https://clockify.me/help/track-time-and-expenses/editing-time-entries
  (deshacer el borrado)
- https://clockify.me/help/users/user-settings
- https://clockify.me/features/calendar (página de producto, no de ayuda)
- https://clockify.me/pricing (tabla comparativa de planes)

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Igual que en los otros tres documentos, lo marcado
como _no verificado_ hay que confirmarlo abriendo el workspace, y está todo
junto, con una pregunta concreta por punto, en
[calendario P-07](#calendario-p-07-la-lista-de-verificación).

**La documentación del calendario es corta, y este documento tiene más _no
verificado_ que los anteriores.** Lo que está escrito, y nada más, es esto:

- Una entrada es un bloque en las franjas de la grilla; el día actual va marcado
  en azul en el encabezado de la tabla y la hora actual con una línea
  horizontal azul.
- Cada franja es una hora, y se puede acercar a 30, 15 o 5 minutos con el signo
  más de la esquina superior izquierda.
- Pasar el puntero sobre un bloque muestra el detalle; hacer clic abre la
  entrada.
- Se crea haciendo clic en una franja libre, completando el diálogo y tocando
  «Add»; se mueve arrastrando el bloque entero «to another time slot or date»;
  se estira arrastrando sus bordes.
- Se puede dividir una entrada cerrada o **la que está corriendo** desde el
  calendario, que es de plan pago.
- Hay un engranaje con «Show working days only».
- Hay integración con Google Calendar y Outlook, y el calendario de otra
  persona es de plan pago.
- La página de producto agrega, sin detalle: total de la semana, duplicar,
  ausencias y planificación.

Vistas, navegación, superposición, cruce de medianoche, totales por día, el
aspecto del timer activo, atajos y accesibilidad **no están en ninguna de las
fuentes**. Todo eso es propuesta, y lleva su pregunta.

### Lo que el plan Free deja fuera de este módulo

El calendario en sí está en el plan Free: la tabla de planes lo incluye en los
cinco, con «Visualize your tracked time and edit them in Calendar view.» Lo que
cuelga de él, no siempre:

- **Calendario de otra persona**, de Basic en adelante: «Viewing a team
  member's calendar is part of the Add time for others feature, which is a paid
  feature available on any paid plan» (CAL-03).
- **Dividir desde el calendario**, de Basic en adelante: «Split entry option is
  available to users on paid plans and on Free trial.» (CAL-71).
- **Ausencias y feriados**, de Standard en adelante: «Track time off, holidays,
  and available days.» (CAL-81).
- **Asignaciones de planificación**, de Pro en adelante: «Plan projects on a
  timeline, see who's available, manage resources, and give assignments.»
  (CAL-82).

La integración con Google Calendar y Outlook no tiene fila en la tabla de
planes; no hace falta saberlo, porque queda fuera de alcance por otro motivo
(CAL-79).

### Tres clases de comportamiento

Igual que en `proyectos.md`, conviene no confundirlas al leer:

1. **Relevamiento.** Lo que la documentación pública dice. Va con la cita.
2. **Decisión del equipo.** Lo que el equipo ya resolvió en otro lugar y este
   documento da por hecho. Va con la fuente. **No es paridad**: el reviewer la
   compara contra lo que dice acá, no contra Clockify. Son estas:
   - El color por proyecto no rehace la grilla: decide cómo se pinta un bloque,
     no dónde va ni cuánto mide (mapa, slice 8). El calendario llegó después
     del slice 10 y lo dibuja desde el primer despliegue (sección 18).
   - Mover y estirar un bloque es la misma mutación de horas que la edición en
     línea, `updateEntryTimes`, con el trío `{ date, start, end }` (mapa,
     slice 8; contrato del slice 3). Y con ella, sus reglas: la hora de pared
     del [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md), la
     conservación del [ADR 0006](../adr/0006-conservar-el-extremo-sin-cambios.md),
     TT-110, TT-111 y TT-112.
   - Zona horaria, formatos e inicio de semana salen de la persona (PF-01,
     PF-11 a PF-13, slice 7).
   - Lo ya cerrado en el rastreador: superposición permitida (TT-82), fechas
     futuras aceptadas (TT-76, P-10), borrado con confirmación y sin deshacer
     (TT-61, P-06), sin canal abierto y con revalidación periódica (TT-40,
     P-11).
3. **Propuesta.** Lo que Clockify no documenta y hace falta para construir. Va
   con «propuesta» y con el pendiente que la tiene que cerrar. El reviewer la
   compara contra este documento mientras el pendiente esté abierto; si la
   verificación contra el workspace dice otra cosa, se corrige acá primero.

Dentro de las propuestas hay un grupo que **no tiene referencia posible ni
ahora ni después**: el teclado y la accesibilidad (sección 11). Clockify no
documenta nada y lo que el workspace muestre no obliga, porque la regla sale de
que arrastrar no es accesible, no de la paridad.

## Vocabulario

| Clockify               | Clock (interfaz en español)  |
| ---------------------- | ---------------------------- |
| Calendar               | Calendario                   |
| Time slot              | Franja                       |
| Time block             | Bloque                       |
| Resize                 | Estirar                      |
| Drag and drop / Move   | Arrastrar / Mover            |
| Show working days only | Mostrar solo días laborables |
| Teammates              | Compañeros                   |
| Current time line      | Línea de ahora               |
| Day view / Week view   | Vista día / Vista semana     |

`adaptar`: la interfaz va en español y toda la copia visible se traduce. No se
vuelve a justificar en cada comportamiento. La regla de **una redacción por
causa** de `time-tracker.md` sigue valiendo: cada texto que ya existe se reusa
tal cual, y la sección 13 junta los pocos nuevos.

## 1. Pantalla y acceso

**CAL-01 Ruta y entrada en la navegación** — `adaptar`
Ruta `/calendario`, dentro del shell con sesión, y una entrada «Calendario» en
la navegación principal, al lado de «Inicio». Justificación: ruta y rótulo en
español; en Clockify es «Calendar» en la barra lateral.

**CAL-02 Solo las entradas propias** — `replicar`
Igual que TT-01: la grilla dibuja solo las entradas de la persona de la sesión,
también para owners y admins.

**CAL-03 El calendario de otra persona** — `fuera de alcance`
Documentado: un desplegable «Teammates» arriba de la página permite abrir el
calendario de otra persona, según el rol. Justificación: es parte de «Add time
for others», de plan pago, y no se puede relevar en el workspace del equipo.

**CAL-04 El calendario está en el plan Free** — `replicar`
Documentado en la tabla de planes. Es lo que hace que el resto de este
documento sea relevable en el workspace del equipo, aunque yo no haya podido
entrar.

**CAL-05 Permisos** — `replicar`
Los de TT-66: los cinco roles crean, mueven, estiran, editan, duplican y borran
sus propias entradas desde el calendario. No hay acciones de permiso nuevas:
todo pasa por las `timeEntry.own.*` que ya existen. Una membresía que no está
activa ve la grilla en solo lectura —sin asas, sin crear, con el diálogo sin
controles— y el aviso permanente de TT-92.

## 2. Vistas y grilla

**CAL-06 Vista semana** — `replicar`
Documentado de forma indirecta: el día actual va marcado «in the table header»,
así que la grilla es una tabla con una columna por día. Siete columnas, desde
el inicio de semana de la persona (CAL-18), y una fila por franja.
_No verificado_: que sea la vista con la que abre la página.

**CAL-07 Vista día** — `replicar`
La misma grilla con una sola columna, y la navegación de a un día. Arriba de la
grilla, el selector de vista son dos enlaces, «Semana» y «Día», con semana por
defecto: «Día» abre hoy si la semana visible lo contiene y si no su primer día;
«Semana» abre la semana del día que se ve. En la vista día no hay total de
semana (CAL-33).
_No verificado_: la documentación no nombra vistas. Si Clockify no tiene vista
día, este comportamiento se borra; si la tiene con otro nombre o en otro lugar,
se corrige.
_Corregido el 2026-10-04, slice 8_: decía «Un selector «Día / Semana»», sin
decir qué día abre cada opción. El slice 8 lo construyó como dos enlaces, con
«Semana» primero.

**CAL-08 Vista mes** — `fuera de alcance`
Ninguna fuente la menciona. Justificación: una vista mensual no es la misma
grilla con más columnas —no tiene franjas horarias y no admite estirar—, así que
no sale gratis de lo demás. Si la verificación muestra que existe, se decide
aparte.

**CAL-09 Encabezado de columna** — `replicar`
Documentado: «The current day is marked as blue in the table header». Cada
columna lleva el día de la semana abreviado y la fecha en el formato de la
persona (PF-12), y la de hoy va marcada con el color de acento del tema, que es
el papel que cumple el azul en Clockify. Debajo, el total del día (CAL-31).

**CAL-10 Eje de horas** — `replicar`
Documentado: «Each time slot represents 1 hour». A la izquierda, las 24 horas
del día rotuladas en el formato de hora de la persona (PF-13).

**CAL-11 Zoom** — `replicar`
Documentado: «you can zoom in using the plus sign in the upper left corner down
to 30, 15, or 5-minute blocks». Cuatro niveles —60, 30, 15 y 5 minutos por
franja—, con el control en la esquina superior izquierda de la grilla. Arranca
en 60.

**CAL-12 El zoom se recuerda** — `adaptar`
Por navegador, en una cookie, como el modo del rastreador (TT-16). Justificación:
no hay preferencia por persona para esto y no vale una columna.
_No verificado_: si Clockify lo recuerda, y dónde.

**CAL-13 Mostrar solo días laborables** — `fuera de alcance`
Documentado: el engranaje de la página tiene «Show working days only», que
oculta los fines de semana y los días no laborables. Justificación: los días
laborables son un dato por persona que Clockify administra desde el equipo, y
acá quedan fuera de alcance hasta que algo los consuma (PF-19). Ocultar sábado
y domingo fijos sería inventar una regla que Clockify no tiene. Ver calendario
P-05.
_Corregido el 2026-10-16, PF-19 (equipo P-09, workspace P-06)_: decía que los
días laborables quedaron para la fase 2; el usuario los dejó fuera de alcance,
por persona y del workspace.

**CAL-14 Posición inicial del desplazamiento** — `adaptar`
Al abrir, si el período visible contiene hoy, la grilla queda con la línea de
ahora una hora por debajo del borde superior —arriba de todo antes de la
01:00—; si no, con las 08:00 arriba. Se vuelve a desplazar al cambiar de
período o de vista, y no con una revalidación. **Las 08:00 son una constante
del cliente, no una preferencia** (decisión del usuario del 2026-10-04).
Justificación: ninguna fuente lo dice y 24 franjas de una hora no entran en una
pantalla.
_No verificado_: a qué hora abre Clockify la grilla.
_Corregido el 2026-10-04, slice 8_: decía «se desplaza para que se vea la línea
de ahora», sin decir dónde queda, y que si la verificación lo confirmaba la hora
fija pasaba a ser el ajuste del perfil. El slice 8 deja la constante; PF-15
sigue `fuera de alcance` y perfil P-02, abierto y atado a esta respuesta.
_Corregido el 2026-10-07_: el _No verificado_ seguía «Puede ser lo que gobierna
«inicio del día» del perfil (PF-15, perfil P-02): si la verificación lo confirma
(P-07), se cambia solo la constante por esa preferencia.» Ese ajuste no existe
en el workspace del equipo (respuesta A de timesheet P-12): perfil P-02 se
cerró y las 08:00 siguen como constante.

## 3. Navegación

**CAL-15 Anterior, siguiente y hoy** — `adaptar`
Propuesta: dos flechas que mueven el período —una semana, o un día en la vista
día— y un botón «Hoy» que vuelve al período que contiene hoy. El rango se
rotula con los mismos textos que el encabezado de semana del rastreador
(TT-47): «Esta semana», «Semana anterior» o el rango de fechas. Justificación:
no documentado; los rótulos son los del rastreador para que la misma semana se
llame igual en las dos pantallas.

**CAL-16 Saltar a una fecha** — `adaptar`
Propuesta: el rótulo del rango abre el mismo calendario de mes que usa el
selector de fecha del modo manual, y elegir un día lleva al período que lo
contiene. Sin cota en ninguna dirección: navegar no escribe nada. Justificación:
no documentado; reusa una pieza que ya existe.

**CAL-17 El período visible viaja en la URL** — `adaptar`
`/calendario?semana=AAAA-MM-DD`, con el primer día del período, y `&vista=dia`
en la vista día; cualquier otro `vista` es la vista semana. **La URL no se
reescribe**: un `semana` que no es inicio de semana se interpreta como la
semana que lo contiene. Las flechas, «Hoy» y el selector de vista enlazan
siempre al inicio normalizado; el selector del rango (CAL-16) lleva al día
elegido y el servidor dibuja su período. Un `semana` inválido o repetido lleva
al período actual de la vista pedida, y también uno cuyo período no se puede
navegar: el anterior o el siguiente quedan fuera de los años de cuatro cifras,
o algún día del período, o el siguiente al último, falta entero en la zona de
la persona (`Pacific/Apia`, 2011-12-30). Justificación: es el mismo criterio
que PR-95; en un Server Component la URL es el estado más barato, y así
recargar, volver atrás y compartir funcionan. Un parámetro de la URL no puede
llevar la página a su error (CAL-87).
_Corregido el 2026-10-04, slice 8_: decía que la fecha se normalizaba, que se
puede leer como reescribir la URL, y que una fecha inválida llevaba a «la semana
actual», también en la vista día. No nombraba el parámetro repetido ni el
período que no se puede navegar.

**CAL-18 El inicio de semana es el de la persona** — `replicar`
Decisión del equipo (PF-01, PF-16). La página del calendario dice «You can
change the first day of the week in your Profile settings», y la de ajustes de
usuario dice lo contrario: «You cannot change the start of the week from your
personal Profile Settings». PF-01 ya resolvió con la segunda, que es literal y
específica; esta nota es para que nadie reabra la cuestión por la primera.
Cambiarlo reordena las columnas y no mueve ninguna entrada (PF-40).

**CAL-19 Zona horaria y formatos de la persona** — `replicar`
Decisión del equipo (PF-04, PF-11 a PF-13). La columna de un bloque, su altura
en la grilla, los rótulos de hora y de fecha y la línea de ahora salen de la
zona horaria y los formatos de la persona. Dos personas en husos distintos ven
la misma entrada en columnas o alturas distintas.

## 4. Cómo se dibuja una entrada

**CAL-20 Un bloque por entrada** — `replicar`
Documentado: «A time entry will appear as one block in the Calendar's time
slots.» El borde superior va a la hora de pared del inicio y el inferior a la
del fin, en la columna de su día.

**CAL-21 Contenido del bloque** — `adaptar`
En el segmento del día de inicio, en este orden: la descripción, o «Sin
descripción» en gris (TT-50); el proyecto, o «Proyecto: Tarea», con su punto de
color, si lo hay; y el horario `{inicio} – {fin}` con el superíndice de días
(TT-51) y la duración, con las horas en el formato de la persona (PF-13). El
timer muestra «{inicio} – en curso» y el transcurrido en `h:mm`. Los otros
segmentos de la misma entrada muestran solo la descripción (CAL-26). Un bloque
que no tiene alto para todo muestra lo que entra, en ese orden, recortado. Con
el slice 11 se suma el ícono de facturable. Justificación: el contenido exacto
no está documentado; es el de la fila del rastreador (TT-49).
_Corregido el 2026-10-04, slice 8_: decía que el horario iba `HH:mm – HH:mm`,
que un bloque sin alto mostraba solo la descripción y que el proyecto y la
tarea se sumaban con el slice 10, que ya estaba en `main`. No decía qué
muestran los otros segmentos ni el bloque del timer.

_Agregado el 2026-10-05_. Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): el
ícono de facturable va al final de la línea del horario, solo en el segmento
del día de inicio y solo si la entrada es facturable; una no facturable no
lleva ícono. Las etiquetas no van en el bloque: están en el detalle (CAL-23) y
en el diálogo (CAL-66). Como todo el facturable, no se puede verificar en el
plan Free (P-16 de [la paridad de proyectos](proyectos.md)).

**CAL-22 Color del bloque** — `replicar`
Con proyecto, el relleno es el color del proyecto (PR-15) en tono claro
—mezclado al 20 % con el fondo—, con un borde izquierdo en el color pleno, y el
texto en el color de primer plano del tema. Sin proyecto, el relleno neutro del
tema, con su borde. Cambiar el color de un proyecto cambia todos sus bloques
(PR-103). **El color no decide la posición, el tamaño ni el orden del
bloque**: la geometría de la grilla no depende del proyecto (sección 18). El
tono claro y el borde son diseño propio: los tonos 600 de la paleta no dan
contraste AA con texto blanco, y el borde deja a la vista el color pleno del
proyecto.
_No verificado_: que Clockify pinte el bloque con el color del proyecto se ve en
el producto pero no está escrito, y no sé de qué color pinta uno sin proyecto.
_Corregido el 2026-10-04, slice 8_: decía que el color era solo el relleno del
bloque y que llegaba con el slice 10; el slice 8 lo dibuja desde el primer
despliegue, en tono claro y con el borde izquierdo en el color pleno.

**CAL-23 Detalle al pasar el puntero** — `replicar`
Documentado: «You can hover over a time block to see full entry details». Un
recuadro con la descripción entera, el horario con el superíndice de días
(TT-51), la duración, y el proyecto y la tarea; más adelante, etiquetas y
facturable. El mismo recuadro aparece al enfocar el bloque con el teclado
(CAL-77). **Mientras dura un gesto de arrastre, ningún bloque muestra su
detalle** (sección 9).
_Corregido el 2026-10-05, slice 8b_: no decía qué pasa con el detalle durante
un arrastre, y nombraba el proyecto y la tarea como algo de más adelante; el
detalle los muestra desde el slice 8.

_Agregado el 2026-10-05_. Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): con
el slice 11, el detalle suma una línea «Facturable» si la entrada lo es, y una
línea «Etiquetas: a, b», con los nombres en orden alfabético, si tiene alguna.
Sin etiquetas o no facturable, la línea no está. Una etiqueta archivada se
muestra igual (PR-47). _No verificado_ (calendario P-07), en lo que toca a las
etiquetas: «full entry details» no dice cómo las muestra Clockify.

_Agregado el 2026-10-07, slice 11b_: las líneas del detalle van en este orden:
la descripción, el horario con la duración, el proyecto, «Etiquetas: a, b» y
«Facturable»; las tres últimas, solo si corresponden. Una etiqueta archivada se
nombra como las demás, sin «(archivada)», que es una marca del selector.

**CAL-24 Bloque muy corto** — `adaptar`
Un bloque tiene una altura mínima legible aunque su duración, al zoom actual,
dé menos; el borde superior sigue en su hora. Una entrada de segundos que
produjo el timer (TT-101) se ve y se puede abrir. Justificación: diseño propio;
un bloque de un píxel no se puede tocar.

**CAL-25 Entradas superpuestas** — `adaptar`
Se dibujan lado a lado, repartiendo el ancho de la columna entre las que se
pisan, ordenadas por inicio. Se permiten y no se señalan (TT-82).
Justificación: Clockify no documenta el dibujo; sin esta regla la de abajo
queda tapada y no se puede abrir.
_No verificado_: cómo las dibuja Clockify.

**CAL-26 Entrada que cruza la medianoche** — `adaptar`
Se dibuja en un segmento por cada día que toca, cada uno en su columna. Los
segmentos son la misma entrada: pasar el puntero, hacer clic o arrastrar
cualquiera de ellos actúa sobre la entrada entera. El segmento del día de
inicio lleva el horario completo con su superíndice (TT-51). Una entrada que
termina exactamente a las 00:00 no dibuja un segmento vacío en la columna
siguiente. Justificación: no documentado; partirla es la única forma de que
cada hora caiga en su día.
_No verificado_: cómo la dibuja Clockify.

**CAL-27 Entrada de más de un día** — `adaptar`
Mismo criterio que CAL-26: un segmento por día, de alto completo en los días
intermedios. Sus horarios no se arrastran ni se estiran (CAL-58). Las produce
un timer largo (TT-42) y no hay tope (TT-74). Justificación: la de CAL-26.

**CAL-28 Entrada que cruza el borde del período visible** — `adaptar`
Se dibuja el segmento que cae dentro del período. Una entrada que empezó el
domingo anterior a las 22:00 aparece el lunes desde las 00:00, y su clic abre
la entrada entera. Justificación: consecuencia de CAL-26. Tiene un efecto sobre
la lectura que conviene tener escrito: **el calendario lee las entradas que se
superponen con el período, no las que empiezan en él**, que es otra consulta
que la de la lista del rastreador.

**CAL-29 Entrada con fecha futura** — `replicar`
Se dibuja como cualquier otra (TT-76). Ninguna marca la distingue.

**CAL-30 Días con cambio de horario** — `adaptar`
Diseño propio. La grilla tiene siempre 24 franjas de hora de pared:

- El día en que el reloj se adelanta, la franja que no existe —en Madrid, el
  2026-03-29, de 02:00 a 02:59— se dibuja atenuada y no admite crear ni soltar,
  porque cualquier hora ahí es TT-112.
- El día en que se atrasa, la hora repetida se dibuja una sola vez, y las
  entradas de la primera y de la segunda pasada caen en la misma franja,
  superpuestas (CAL-25).
- La altura de un bloque es la de su distancia de reloj, no la de su duración
  real: un bloque de 01:00 a 04:00 el día del adelanto mide tres franjas y dura
  dos horas. Es TT-97 visto en una grilla.

Justificación: Clockify no documenta nada del cambio de horario. Una columna de
23 o de 25 franjas desalinearía la fila de las 10:00 entre un día y el
siguiente, que es lo que una grilla semanal no puede hacer.
_No verificado_: qué hace Clockify. El workspace del equipo está en
`America/Argentina/Buenos_Aires`, sin cambio de horario: verificarlo pide
poner una zona como `Europe/Madrid` en el perfil.

## 5. Totales

**CAL-31 Total por día** — `adaptar`
Debajo del encabezado de cada columna, en el formato de duración del workspace
(PF-20). Suma en segundos y formatea una vez, como TT-45. Justificación: no
está documentado; el total por día es lo que vuelve útil una semana de bloques.
_No verificado_: si Clockify lo muestra y dónde.

**CAL-32 Qué suma el total del día** — `adaptar`
Propuesta: cada entrada suma entera en el día de su inicio, igual que en la
lista (TT-45, TT-95). El segmento de una entrada de 22:00 a 02:00 que se dibuja
el martes no suma al martes. Justificación: si el calendario partiera la entrada
y la lista no, las dos pantallas darían dos totales distintos para el mismo
martes, y no hay forma de explicar cuál es el bueno. El costo es que la columna
del martes muestra dos horas dibujadas que su total no cuenta. Ver
calendario P-02.

**CAL-33 Total de la semana** — `replicar`
Documentado en la página de producto: «See the total tracked time across the
week.» Arriba de la grilla, en la barra del rango, alineado a la derecha como el
encabezado de semana del rastreador. Con el corte de
semana de la persona, y por eso es el mismo número que el encabezado de esa
semana en el rastreador (TT-47, TT-48).
_No verificado_: dónde lo pone Clockify. En la vista día, propuesta: el total
del día, sin el de la semana.
_Corregido el 2026-10-04, slice 8_: decía «al lado del rótulo del rango»; va a
la derecha de la misma barra.

**CAL-34 El timer activo suma** — `adaptar`
Igual que TT-46: al total del día de su inicio y al de la semana, y los dos se
actualizan con el contador. Justificación: la de TT-46.

## 6. La línea de ahora

**CAL-35 Línea de ahora** — `replicar`
Documentado: «the current time is indicated by a blue horizontal line». Va en
la columna de hoy, a la altura de la hora actual en la zona de la persona, con
el color de acento del tema.

**CAL-36 Avanza sola** — `adaptar`
La línea avanza en el cliente con el tiempo transcurrido desde el minuto que
mandó el servidor, corregido por el desfase de TT-32, sin pedirle nada al
servidor y sin convertir instantes con la zona (ADR 0012); cada revalidación la
vuelve a anclar (P-11). A la medianoche pasa a la columna siguiente; si hoy era
la última columna visible, desaparece, y la grilla no cambia de período sola.
En el minuto siguiente a un cambio de horario puede quedar corrida una hora
hasta la próxima revalidación, a lo sumo 60 s. Justificación: no documentado;
mismo mecanismo que el contador del timer (TT-31).
_Corregido el 2026-10-04, slice 8_: decía que se redibujaba cada minuto «con el
reloj corregido», sin decir de dónde sale la hora. El cliente no conoce la
zona, así que la línea es aritmética sobre el minuto del servidor, y un cambio
de horario la deja corrida hasta revalidar.

**CAL-37 Solo con hoy a la vista** — `replicar`
Si el período visible no contiene hoy, no hay línea.
_No verificado_: si Clockify la estira sobre toda la semana o la deja en la
columna de hoy.

## 7. El timer activo en el calendario

**CAL-38 El timer activo se dibuja** — `replicar`
Documentado de forma indirecta: la página de dividir dice «You can also split
running and already created entries in the Calendar», y el primer paso es hacer
clic «on the running/existing entry». La entrada que corre está en la grilla y
se abre. Acá es un bloque desde su inicio hasta la línea de ahora, que crece en
el cliente con el mismo cálculo que el contador (TT-31, TT-32), y se distingue
de los cerrados por su estilo.
_No verificado_: cómo lo distingue Clockify.

Esto no contradice TT-111. En la lista del rastreador la entrada abierta no es
una fila y vive en la barra; en el calendario no hay barra y la entrada abierta
es un bloque. Lo que TT-111 fija —que sus horarios no se editan como los de una
entrada cerrada— vale igual acá, por CAL-39.

**CAL-39 El bloque del timer activo no se arrastra ni se estira** — `adaptar`
Propuesta. Su fin no es un dato sino «ahora», que se mueve mientras se
arrastra: mover el bloque entero significaría elegirle un fin, y una entrada
abierta no tiene. Su inicio se corrige desde el diálogo (CAL-40), que lo guarda
con `updateEntry` y la regla de `updateRunningStart` (TT-28), la misma del
editor del contador del rastreador. Un horario completo —el trío de
`updateEntryTimes` o el de `updateEntry`— que llegue igual sobre ella recibe
«Esta entrada es la que está corriendo.» (TT-111). Justificación: la regla que
existe edita solo el inicio, y un asa que corrige el inicio sobre un bloque
cuyo borde inferior avanza mientras se arrastra es un gesto que se puede
agregar después sin cambiar nada más. Ver calendario P-03.
_No verificado_: si Clockify deja arrastrarlo.
_Corregido el 2026-10-04, slice 8c_: decía que la única mutación sobre sus
horas era `updateRunningStart`. Desde el 8c, `updateEntry` también cambia el
inicio, con la misma regla, y rechaza el trío sobre la entrada que corre igual
que `updateEntryTimes`.

**CAL-40 El diálogo del timer activo** — `adaptar`
Clic sobre el bloque abre el diálogo «Timer en curso» con:

- la descripción y el proyecto con su tarea, editables;
- el inicio, día y hora, editable con las reglas de TT-28, TT-29 y TT-75 —un
  inicio en el futuro se rechaza con «No se pueden cargar horas que todavía no
  pasaron.», y el selector de fecha no ofrece días posteriores a hoy—, TT-112 y
  el piso de fechas (CAL-48). Es la regla de `updateRunningStart`, la del editor del
  contador del rastreador;
- el fin como «Fin: en curso», sin campo, con el transcurrido;
- abajo, «Detener», «Cancelar» y «Guardar», sin menú.

«Guardar» aplica juntos los cambios, como en una entrada cerrada (CAL-67).
«Detener» es `stopTimer` sin cambios: cierra el diálogo y el bloque queda
cerrado, con el foco en él; si falla, el aviso queda en la pantalla. **Con
cambios sin guardar —también una hora tecleada y todavía no confirmada—,
«Detener» queda inactivo**, con «Guardá los cambios antes de detener el timer.»
a la vista: guardar y detener serían dos escrituras, y «Guardar» es todo o
nada. El diálogo del timer no tiene menú: duplicar la entrada que corre se
rechaza (TT-58) y descartarla es del rastreador (TT-65).
Justificación: la entrada abierta tiene menos que editar que una cerrada, y sin
barra del timer en esta pantalla, sin «Detener» habría que volver al rastreador
para pararlo (calendario P-06).
_No verificado_: qué ofrece el diálogo de Clockify sobre la entrada que corre,
y si su página de calendario tiene una barra de timer.
_Corregido el 2026-10-04, slice 8c_: decía que el inicio se guardaba con
`updateRunningStart` y proponía «Detener». Con P-04 el diálogo guarda con
`updateEntry`, con la misma regla del inicio, y P-06 cerró «Detener», inactivo
mientras haya cambios sin guardar. Se suman el proyecto, los botones y que el
diálogo no tiene menú.
_Corregido el 2026-10-07, piso fijo_: el inicio decía «TT-112 y el piso del workspace»; el piso es la fecha fija de CAL-48.

**CAL-41 Timer detenido o borrado en otra pestaña** — `adaptar`
La grilla se pone al día con la revalidación de TT-40 —al enfocar, al volver a
ser visible y cada 60 segundos— y puede seguir dibujando el bloque creciendo
hasta un minuto. Si antes de eso se usa su diálogo:

- «Guardar» con solo la descripción o el proyecto se aplica a la entrada, ya
  cerrada: el diálogo se cierra y el bloque se dibuja cerrado. La descripción y
  el par no dependen del estado de la entrada en ninguna mutación.
- «Guardar» con el inicio entre los cambios recibe «Este timer ya había sido
  detenido.» (TT-41): el diálogo se cierra y el aviso, «No se pudo guardar la
  entrada.», queda en la pantalla.
- «Detener» recibe «Este timer ya había sido detenido.» (TT-41), con el aviso
  en la pantalla.
- Si otra pestaña la borró, «Esa entrada ya no existe.» (TT-80, TT-103), con el
  diálogo cerrado (CAL-72).

Justificación: la de TT-40; el diálogo se cierra porque no queda nada que
corregir en él.
_Corregido el 2026-10-04, slice 8c_: decía que cualquier acción sobre el timer
detenido recibía «Este timer ya había sido detenido.». Con «Guardar» todo o
nada, la descripción y el proyecto se aplican igual a la entrada cerrada; solo
el inicio y «Detener» se rechazan.
_Agregado el 2026-10-05, slice 11a_: el facturable entre los cambios sigue la
regla de la descripción y el proyecto: se aplica a la entrada ya cerrada,
porque tampoco depende de su estado.
_Agregado el 2026-10-07, slice 11b_: las etiquetas entre los cambios, también:
se aplican a la entrada ya cerrada, porque no dependen de su estado.

**CAL-42 Arrancar o continuar un timer desde un bloque** — `fuera de alcance`
Clockify documenta el botón de reproducción solo sobre eventos de calendarios
externos (CAL-80), no sobre entradas. Justificación: no está documentado para
entradas propias, y arrancar y continuar ya viven en el rastreador (TT-22,
TT-57).

## 8. Crear desde la grilla

**CAL-43 Clic en una franja libre** — `replicar`
Documentado: «Click on any open time slot on the calendar», completar
descripción y proyecto, «Adjust the start and end times if necessary» y «Click
Add to save the entry». Acá el clic abre el diálogo de alta con la fecha de la
columna, el inicio en el borde superior de la franja tocada y el fin una franja
después, al zoom actual. **Nada se guarda hasta «Agregar»**: el borrador no es
una entrada.
_No verificado_: qué duración propone Clockify con el clic.

**CAL-44 Arrastrar para elegir el rango** — `adaptar`
Propuesta: arrastrar sobre franjas libres de una columna dibuja una selección
ajustada al zoom (CAL-53) y, al soltar, abre el mismo diálogo con ese inicio y
ese fin. **La selección no sale de la columna en que empezó.** Una entrada de
22:00 a 02:00 se crea con un clic a las 22:00 y el fin corregido en el diálogo,
que TT-72 lee como el día siguiente. Justificación: la documentación solo
describe el clic. Un arrastre entre columnas no tiene una lectura única en una
semana —un rango continuo o el mismo horario en varios días—, y la segunda
crearía varias entradas de un gesto, que no es ninguna mutación que exista.
**Es una divergencia si Clockify deja crear entre columnas.**
_No verificado_: si Clockify permite crear arrastrando, y si cruza columnas.

**CAL-45 Diálogo de alta** — `replicar`
Documentado: «Duration, Start/End Time, Date, Description, Project, Tag, and
Billable», y el botón «Add». Acá, con el título «Agregar entrada»:
descripción, proyecto y tarea, fecha, inicio, fin y duración, con «Cancelar» y
«Agregar»; etiquetas y facturable llegan con el slice 11, en el mismo diálogo.
Los campos de hora y de duración son los del modo manual, con sus formatos y su
rechazo (TT-18 a TT-21): editar la duración mueve el fin, editar inicio o fin
recalcula la duración. La fecha no ofrece días anteriores al 1 de enero de 2000 (CAL-48). Enter en la descripción o en un campo de hora también agrega. Con
duración cero, «Agregar» queda inactivo, con «La entrada tiene que durar al
menos un minuto.» a la vista (TT-73).
_Corregido el 2026-10-04, slice 8c_: decía «En el slice 8: descripción, fecha,
inicio, fin y duración» y que el proyecto y la tarea llegaban con el slice 10.
El alta llegó con el 8c, que ya trae proyecto y tarea. Se suman el título, los
botones, el piso de la fecha, Enter y «Agregar» inactivo con duración cero.
_Corregido el 2026-10-07, piso fijo_: decía «La fecha no ofrece días anteriores a la creación del workspace.»; el piso es la fecha fija de CAL-48.

_Agregado el 2026-10-05_. La página del calendario describe los dos campos que
suma el slice 11: «**Tag:** A keyword or category commonly used for reporting
or billing purposes» y «**Billable (Yes/No):** A toggle used to indicate
whether the time spent should be charged to a client». Van después de
«Proyecto», con el selector de TT-12 y el control de TT-14. El alta arranca sin
etiquetas y no facturable, y elegir proyecto le pone su facturable por defecto
(TT-14). Lo fija el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md).

**CAL-46 «Agregar» es el alta manual** — `replicar`
Crea con `createManualEntry` y valen todas sus reglas: TT-72 (fin menor que el
inicio es el día siguiente), TT-73, TT-76, TT-112 y el piso de fechas de CAL-48. Si falla por red vale TT-109: el aviso, dentro del diálogo, es «No se
pudo agregar la entrada.» con el mensaje de TT-89 y «Reintentar», que manda el
borrador actual con el id pendiente, como el «Reintentar» de «Guardar»
(CAL-67). Si la respuesta es la entrada de un intento anterior y no lo que se
mandó, el diálogo sigue abierto con el borrador y el aviso informativo «La
entrada ya se había agregado con lo que mandaste antes; lo que está en el
diálogo no se guardó.»; el próximo «Agregar» crea la entrada. Mientras el alta
viaja el diálogo no se cierra —«Cancelar» no actúa y `Esc` y el clic afuera se
ignoran, a diferencia de CAL-49—, y cerrarlo con el aviso de falla a la vista
no renueva el id: la próxima alta que se abra lo reusa (TT-109).

El id pendiente se renueva, por decisión del equipo (F2-1), cuando esta pestaña
guarda, mueve, borra o duplica la entrada del primer intento: si no, agregar lo
mismo respondería esa entrada ya cambiada, contaría como lo mandado y la
entrada nueva no se crearía. Límites conocidos, aceptados por el equipo
(TT-109): recargar o salir de `/calendario` desmonta la pantalla y renueva el
id, así que, si el primer intento se aplicó, agregar lo mismo la duplica; y con
el alta en vuelo bajo un id reusado, irse de la ruta pierde el aviso
informativo, y la entrada nueva no se crea sin que nada lo diga.

Si la entrada creada o guardada no tiene ningún segmento en el período visible
—por ejemplo, porque se le cambió la fecha a otra semana—, se guarda igual y
aparece un aviso informativo arriba de la grilla: «La entrada quedó el {día},
fuera de la semana que estás viendo.», con el enlace «Ir a esa semana»; en la
vista día, «…fuera del día que estás viendo.», con «Ir a ese día». El día se
nombra con el rótulo de columna («sáb, 03/10»), nunca «Hoy» ni «Ayer». Una
entrada que empezó antes del período y lo cruza tiene segmentos y no lleva
aviso. La operación siguiente lo baja. En el rastreador no hay un equivalente:
ahí la ventana de la lista se extiende sola hasta la semana de la entrada y no
hay aviso (TT-108, P-15). Acá el período visible lo elige la persona y el
remedio es cambiar de período, así que el aviso y su texto son propios del
calendario.
_Corregido el 2026-10-03, slice 5_: decía «No es TT-108: ese aviso habla de los
días que la lista dibuja», y el aviso de TT-108 se retiró.
_Corregido el 2026-10-04, slice 8c_: decía «si la fecha del diálogo se cambió a
un día fuera del período visible». El criterio es que la entrada no tenga
ningún segmento en el período, y el aviso vale también para «Guardar». Se
suman el texto de TT-109 del calendario, el enlace de la vista día y cómo se
nombra el día.
_Corregido el 2026-10-07, slice 2c_: el primer párrafo decía «Si falla por red
vale TT-109, sin «Reintentar» porque repetir duplica: «No sabemos si la entrada
se guardó.», con «Se perdió la respuesta del servidor. Antes de volver a
agregarla, fijate en el calendario: puede haberse creado.» Es la causa de la
barra, con el lugar donde mirar.». Desde el 2c el alta lleva un id que elige el
cliente ([ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md)) y se
reintenta. El segundo párrafo, sobre cuándo se renueva el id, es nuevo.
_Corregido el 2026-10-07, piso fijo_: el primer párrafo decía «TT-112 y el piso del workspace del ADR 0005»; el piso es la fecha fija de CAL-48.

**CAL-47 Crear con un timer corriendo** — `adaptar`
Se permite, sin aviso: el clic en una franja libre y «Agregar entrada» abren
el alta igual, y «Agregar» crea la entrada cerrada mientras el timer sigue
corriendo. Es `createManualEntry` sin excepción por origen: el servidor acepta
el alta con un timer abierto venga de donde venga, y la entrada cerrada que se
superpone con el timer es válida (TT-82). TT-30 sigue como regla de la
interfaz del rastreador, cuyo conmutador comparte lugar con el timer. Clockify
documenta: «Make sure to stop an active timer before creating a time entry in
the calendar to avoid overlaps that cause conflict», que se lee como una
recomendación y no como un bloqueo. Justificación de `adaptar`: Clockify
recomienda detener el timer antes y no documenta que lo impida; acá no se
recomienda nada (calendario P-01).
_No verificado_: si Clockify lo deja.
_Corregido el 2026-10-04, slice 8c_: proponía rechazarlo con el texto de TT-30
y «Agregar» deshabilitado, como divergencia si Clockify lo permitía. P-01 lo
invirtió: se permite, y el servidor dejó de rechazar el alta manual con un
timer abierto.

**CAL-48 Días anteriores al 1 de enero de 2000** — `adaptar`
El piso de fechas es fijo, `2000-01-01`, como día en la zona horaria de la
persona, y es el mismo en toda alta o edición de horas, desde cualquier
pantalla (TS-12 de [la paridad del timesheet](timesheet.md)). Los días
anteriores se dibujan atenuados y no admiten crear ni soltar un bloque; en la
práctica solo se ven navegando a 1999. Un pedido que llegue igual recibe «No se
pueden cargar horas anteriores al 1 de enero de 2000.». Justificación: decisión
del equipo ([arreglo del piso fijo](../slices/fase1-fix-piso-fijo.md)): un piso
fijo y amplio no impide cargar ningún día real y sigue frenando payloads
absurdos; atenuar evita ofrecer un gesto que el servidor va a rechazar.
_Corregido el 2026-10-07, piso fijo_: el título era «Días anteriores a la
creación del workspace» y el texto, «No se pueden cargar horas anteriores a la
creación del workspace.» (ADR 0005), con la justificación «el piso es nuestro».
El piso por creación impedía cargar los días anteriores al primer login: con el
workspace creado un miércoles, el lunes y el martes de esa semana aparecían
atenuados.

**CAL-49 Cancelar** — `replicar`
Cerrar el diálogo o `Esc` descarta el borrador: no queda nada guardado ni
ninguna selección dibujada.
_Agregado el 2026-10-07, slice 2c_: salvo con el alta en vuelo, cuando el
diálogo no se cierra hasta que llega la respuesta (CAL-46).

## 9. Mover y estirar

Decisión del equipo (mapa, slice 8; ADR 0006): **mover y estirar llaman a
`updateEntryTimes` con el trío completo**. El calendario no tiene mutación de
horas propia ni importa las funciones de conservación; llega a la regla por la
mutación pública del módulo. De ahí sale el criterio de toda esta sección:
**lo que el trío no puede expresar, el gesto no lo ofrece**, y cuando eso
choca con lo que Clockify deja hacer, está marcado como divergencia.

**CAL-50 Mover un bloque** — `replicar`
Documentado: «Drag and drop the whole time block to move it to another time
slot or date.» Al soltar: la fecha es el día de la columna, el inicio es la hora
del borde superior ajustada al zoom, y el fin es el inicio más la distancia de
reloj original del bloque.

**CAL-51 Mover conserva la distancia de reloj, no la duración real** —
`adaptar`
Diseño propio, consecuencia del ADR 0005: el pedido son horas de pared. Un
bloque de 2 horas llevado a un día con cambio de horario sigue midiendo dos
franjas y dura una o tres horas reales (TT-97). Como los dos rótulos cambian,
los dos extremos se recalculan y pierden sus segundos (ADR 0006: solo se
conserva el extremo que no cambió). Justificación: Clockify no documenta qué
conserva al mover; el trío solo puede expresar esto.

**CAL-52 Estirar un bloque** — `replicar`
Documentado: «Drag the start/end time edges of the time block to shorten or
extend the entry.» El borde arrastrado toma la hora ajustada al zoom; el otro
extremo no cambia de rótulo y **conserva su instante**, con segundos y
ocurrencia (ADR 0006).

**CAL-53 Ajuste a la franja del zoom** — `adaptar`
Propuesta: el borde que se mueve cae en múltiplos de la franja del zoom actual
—60, 30, 15 o 5 minutos—. Para un ajuste más fino, se acerca el zoom o se usa
el diálogo. Justificación: no documentado; es lo que una franja significa.
_No verificado_: a qué múltiplo ajusta Clockify en cada zoom.

**CAL-54 Cruzar la medianoche al mover o estirar** — `replicar`
Se permite mientras el resultado tenga menos de 24 horas de reloj. Un bloque de
22:00 a 23:30 movido a las 23:00 queda de 23:00 a 00:30 del día siguiente
(TT-72) y pasa a dibujarse en dos segmentos (CAL-26). Un bloque se mueve
tomándolo de cualquiera de sus segmentos. Al estirar, el borde sigue al puntero
de una columna a otra: el fin de una entrada de 22:00 estirado más allá del
final de su columna sigue en la columna siguiente, y el inicio, en la anterior.
No es una divergencia: el trío lo expresa.
_Corregido el 2026-10-05, slice 8b_: decía que, para seguir estirando después
de las 00:00, se arrastraba el borde del segmento de la columna siguiente. Una
entrada que termina a las 00:00 no dibuja segmento en esa columna (CAL-26), así
que no había de dónde tomarlo.

**CAL-55 Ni mover ni estirar llega a 24 horas de reloj** — `adaptar`
**Divergencia.** El gesto se detiene antes de que la distancia de reloj llegue a
24 horas: el borde estirado llega como máximo a la última marca de franja
anterior a 24 horas del otro extremo. Con el otro extremo en una marca, eso es
24 horas menos una franja; con uno fuera de marca, un poco menos: el fin de una
entrada que empieza a las 10:07 llega hasta las 10:00 del día siguiente con el
zoom en 15. Vale para los dos bordes y para los dos segmentos de una entrada
que cruza la medianoche. Mover conserva la distancia de reloj, que en una
entrada que se arrastra ya es menor que 24 horas (CAL-58), y una selección de
CAL-44 mide como máximo 24 horas menos una franja. Clockify no tiene tope
(TT-74) y es probable que lo permita. Justificación: es TT-110 desde el otro
lado. Un fin a las 10:00 del día siguiente de un inicio a las 10:00 llega al
servidor como un trío de duración cero y se rechaza con TT-73; uno a las 11:00
se lee como una entrada de una hora. Ofrecer el gesto y que el servidor
entienda otra cosa es truncar en silencio. **Cómo se cierra**: con el editor de
fecha de fin que TT-110 ya nombra.
_No verificado_: si Clockify deja estirar un bloque a más de 24 horas.
_Corregido el 2026-10-05, slice 8b_: decía que el último valor era siempre 24
horas menos una franja. Con el otro extremo fuera de una marca, es la última
marca anterior a 24 horas. Se suman mover y la selección de CAL-44.

**CAL-56 Mínimo una franja** — `adaptar`
El borde estirado llega como mínimo a la primera marca de franja posterior al
otro extremo, y no lo pasa: el bloque no se invierte. Con el otro extremo en
una marca, el mínimo es una franja del zoom; con uno fuera de marca puede ser
menos: el fin de una entrada que empieza a las 10:07 baja hasta las 10:15 con
el zoom en 15. Un pedido que llegue igual por debajo del minuto recibe «La
entrada tiene que durar al menos un minuto.» (TT-73). Justificación: con el
ajuste a las marcas, un borde en la marca del otro extremo daría una entrada de
cero minutos.
_Corregido el 2026-10-05, slice 8b_: decía que el gesto no dejaba un bloque de
menos de una franja del zoom. Con el otro extremo fuera de una marca, una
franja exacta no cae en ninguna marca.

**CAL-57 Soltar donde estaba no escribe** — `adaptar`
Si el trío que resulta del gesto es el mismo que el de la entrada, no hay
pedido, aunque el bloque haya pasado por otros lugares. **La marca de casa**:
el extremo que se mueve y vuelve a la marca más cercana a su lugar original
toma su valor original, con sus minutos y sus segundos. Así, una entrada de
10:07, o una del timer con segundos, que se suelta en su lugar no se escribe a
las 10:00 ni pierde sus segundos (ADR 0006). Justificación: diseño propio, como
el editor del inicio del timer del slice 3.
_Corregido el 2026-10-05, slice 8b_: decía solo que el mismo trío no escribe.
Con un extremo fuera de una marca, cualquier lugar ajustado era otro trío, y
soltar el bloque donde estaba lo habría escrito en la marca.

**CAL-58 Una entrada que el trío no puede expresar no se arrastra** — `adaptar`
**Divergencia**, la de TT-110. Un bloque con `editableTimes` en falso no tiene
asas y no se mueve; su detalle y su diálogo muestran «Esta entrada dura más de
un día; sus horarios no se pueden editar acá.», y en el diálogo fecha, inicio y
fin quedan en solo lectura. La descripción se sigue editando, y se puede
duplicar y borrar. Lo decide el servidor, como en la fila. Justificación: la de
TT-110. En Clockify no hay excepciones por duración.
_No verificado_: si Clockify deja arrastrar un bloque de más de 24 horas.

**CAL-59 Soltar en la hora que no existe** — `adaptar`
La franja atenuada de CAL-30 no admite soltar: un candidato con un extremo en
un minuto que no existe no se ofrece, y el gesto se queda con el anterior. En
los días visibles, el gesto nunca pide un extremo así. Sí puede pedirlo en dos
días cuyos huecos el cliente no conoce: el anterior al primero visible, donde
puede quedar el inicio de un bloque movido tomado de un segmento posterior al
primero (CAL-61), y el siguiente al último, donde puede quedar el fin. Ahí el
servidor lo rechaza con «Esa hora no existe por el cambio de horario.»
(TT-112) y el bloque vuelve a su lugar. Justificación: la de TT-112; el
cliente no sabe de husos (ADR 0005) y conoce los huecos solo de los días que
dibuja.
_Corregido el 2026-10-05, slice 8b_: decía que un pedido con un extremo en la
franja atenuada «llega igual» y se rechaza. Desde el gesto no llega para los
días visibles; solo para los dos vecinos del período.

**CAL-60 Soltar sobre otra entrada** — `replicar`
Se permite, sin aviso (TT-82), y las dos pasan a dibujarse lado a lado (CAL-25).

**CAL-61 Mover a otra semana** — `adaptar`
El arrastre se limita a las columnas visibles: con el puntero fuera de ellas,
el borde o el bloque siguen en la columna más cercana, y la grilla no cambia de
período sola. Para llevar una entrada a otra semana se cambia la fecha en el
diálogo. Un bloque tomado de un segmento posterior al primero puede quedar
empezando el día anterior al período, pero siempre conserva al menos un minuto
a la vista: al soltar no aparece el aviso de CAL-46. Justificación: que la
grilla avance sola al arrastrar contra un borde no está documentado y complica
el gesto; el diálogo ya lo resuelve.
_No verificado_: si Clockify deja arrastrar a otra semana.
_Corregido el 2026-10-05, slice 8b_: decía que, si la entrada quedaba fuera del
período visible, valía el aviso de CAL-46. Desde el gesto nunca queda fuera; el
aviso es del diálogo.

**CAL-62 Guardado al soltar** — `adaptar`
Mientras dura el gesto, el bloque se dibuja en el lugar candidato, con un
anillo. Al soltar, queda en su lugar nuevo, atenuado, ocupado e inactivo —no
abre su diálogo— mientras la escritura está en vuelo, como la fila de TT-55, y
la grilla no empieza otro gesto. Los totales no cambian hasta la revalidación,
como en la lista. Si falla, vuelve a su lugar y aparece en la pantalla el aviso
de dos partes de TT-90 con el título **«No se pudo guardar el horario de la
entrada.»**, el mismo de la edición en línea: es la misma mutación y la misma
causa. Con error de red ofrece «Reintentar» (TT-89), que reenvía el mismo trío:
llega al mismo estado, pero deja otra constancia igual, como en la fila,
porque `updateEntryTimes` escribe y registra en cada pedido válido.
Justificación: Clockify reintenta solo; acá no hay cola.
_Corregido el 2026-10-05, slice 8b_: decía que «Reintentar» era seguro porque
`updateEntryTimes` es idempotente. Llega al mismo estado, pero deja otra
constancia. Se suman el dibujo durante el gesto, el bloque inactivo, un gesto
por vez y los totales.

**CAL-63 `Esc` cancela un arrastre** — `adaptar`
Con el arrastre en curso, `Esc` devuelve el bloque a su lugar sin escribir.
También lo cancelan la pérdida del puntero, la ventana sin foco, la pestaña
oculta, un cambio de zoom o de período, y que la entrada desaparezca de la
pantalla. Una selección de CAL-44 cancelada no abre el alta. **El gesto
cancelado queda muerto hasta que se suelta el botón**: no sigue al puntero, y
soltar no pide nada ni abre el alta ni el diálogo del bloque. Justificación:
diseño propio.
_Corregido el 2026-10-05, slice 8b_: nombraba solo `Esc`, y no decía qué hace
el botón que se suelta después de cancelar.

**CAL-64 La extensión de la ventana de TT-108 no aplica** — `adaptar`
`updateEntryTimes` devuelve `{ entry }`, y `entry.weekStart` es la semana de la
entrada según el primer día de la persona (TT-48). En el rastreador, esa semana
extiende la ventana de la lista hasta ella cuando es anterior a la que la
pantalla dibuja (TT-108, P-15). El calendario no aplica esa regla: el bloque
movido está en el período visible, porque ahí se soltó. Si después se abre el
rastreador, la entrada aparece si cae dentro de la ventana que esa pantalla
calcula, y si no, se alcanza con «Cargar más» (TT-52). Justificación: la regla
compara contra el piso de la lista del rastreador, que es de otra pantalla; el
calendario tiene su propio aviso para la entrada que queda fuera del período
(CAL-46).
_Corregido el 2026-10-03, slice 5_: decía que `updateEntryTimes` devolvía
`outsideWindow` para el aviso de TT-108, que el slice 5 retiró.

## 10. El diálogo de una entrada

**CAL-65 Clic en un bloque abre su diálogo** — `replicar`
Documentado: «click on the block to open the full view of the time entry». Es
el mismo diálogo del alta (CAL-45), con los valores de la entrada. La versión
para el timer activo está en CAL-40.
_Agregado el 2026-10-04, slice 8_: hasta el slice 8c el diálogo es de solo
lectura para todos, decisión nuestra para el primer despliegue: así cada bloque
es un botón con destino antes de que exista la escritura. Se titula «Entrada»,
o «Timer en curso» para la entrada que corre, y abajo tiene solo «Cerrar». Lo
abren un clic, `Enter` o `Espacio` sobre el bloque, o un clic en cualquier otro
segmento de la misma entrada (CAL-26, CAL-74). Al abrir, el foco va a
«Cerrar»; al cerrar —«Cerrar», `Esc` o un clic afuera— vuelve al botón del
bloque, o a la región «Calendario» si una revalidación lo sacó. Muestra la
entrada como estaba al abrirlo: una revalidación no lo cambia ni lo cierra
(CAL-72). Desde el 8c, el título «Entrada» queda para la membresía desactivada
(CAL-05, TT-92).

**CAL-66 Campos** — `replicar`
Descripción, fecha, inicio, fin y duración, con los mismos campos tolerantes del
modo manual (TT-18 a TT-21). Proyecto y tarea con el slice 10; etiquetas y
facturable con el 11. Fecha, inicio y fin en solo lectura cuando
`editableTimes` es falso (CAL-58).
_Agregado el 2026-10-04, slice 8_: en el diálogo de solo lectura (CAL-65) los
campos son texto, en este orden: «Descripción», o «Sin descripción» en gris;
«Proyecto», con su punto y la tarea, o «Sin proyecto» en gris; «Fecha», con el
rótulo del rastreador («Hoy», «Ayer» o «mié, 01/10»); «Hora de inicio»; «Hora
de fin», con el superíndice de días (TT-51); y «Duración». En el timer, en
lugar del fin y la duración, «Fin: en curso» con el transcurrido en `h:mm:ss`,
que avanza (TT-31, PF-22). Las horas siguen el formato de la persona (PF-13).
Ningún control edita: los campos tolerantes llegan con el 8c.

_Agregado el 2026-10-05_. Fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): con
el slice 11, etiquetas y facturable van después de «Proyecto» en los tres modos
del diálogo (CAL-40, CAL-45, CAL-65), y «Guardar» los suma a los grupos que
aplica juntos (CAL-67). En el diálogo, el selector de etiquetas cambia el
borrador y no guarda al cerrarse, a diferencia del de la fila (TT-12). En el de
solo lectura, «Facturable» con «Sí» o «No», y «Etiquetas» con los nombres o
«Sin etiquetas», como texto.

_Agregado el 2026-10-05, slice 11a_: en los tres modos que editan, el
facturable es el control de TT-14 con el nombre «Facturable» también a la
vista, al lado del ícono, y va después de «Etiquetas». En el de solo lectura,
«Facturable» va entre «Etiquetas» y «Fecha», y dice «No» cuando la entrada no
es facturable, a diferencia de la fila en solo lectura, que no muestra nada
(TT-50): en una lista de campos con rótulo, un campo que falta se lee como un
dato que no cargó. Diseño propio.

_Agregado el 2026-10-07, slice 11b_: en los tres modos que editan, «Etiquetas»
va entre «Proyecto» y el facturable, con el rótulo arriba y el selector de
TT-12, que sin etiquetas muestra solo el ícono. Cerrarlo no guarda: lo elegido
viaja con «Guardar» o «Agregar», junto con los demás grupos (CAL-67). En el de
solo lectura, «Etiquetas» va entre «Proyecto» y «Facturable», con los nombres
en orden alfabético, o «Sin etiquetas» en gris.
_Corregido el 2026-10-07, slice 11b_: la nota del 11a decía que el facturable
iba justo después de «Proyecto» y, en solo lectura, entre «Proyecto» y
«Fecha». «Etiquetas» quedó en el medio, en el orden de la fila (TT-49).

**CAL-67 «Guardar», todo o nada** — `adaptar`
Un botón «Guardar» aplica juntos los grupos de campos que la persona tocó
—descripción, proyecto y tarea, horario—, o ninguno. Enter en la descripción o
en un campo de hora también guarda. Sin cambios, «Guardar» cierra el diálogo
sin pedido. Cerrar el diálogo con cambios sin guardar —«Cancelar», `Esc` o un
clic afuera— los descarta sin preguntar. Lo que no cambió no se escribe, así
que guardar dos veces lo mismo no hace nada. Cada grupo pasa por la regla de su
mutación de un campo, con sus textos (sección 13): con un horario rechazado no
se guarda la descripción, y con un horario inválido y un proyecto no disponible
se ve el rechazo del horario.

Si «Guardar» falla, el diálogo queda abierto con el aviso «No se pudo guardar
la entrada.» y la causa; por red ofrece «Reintentar», que guarda el borrador
actual: si la persona editó después del fallo, se manda lo editado. Si falla
porque la entrada ya no existe o el timer ya se detuvo, el diálogo se cierra y
el aviso queda en la pantalla (CAL-41, CAL-72).

La página de dividir describe una ventana de edición que se confirma con
«Save», así que el botón es lo que Clockify hace, al menos ahí. Justificación de
`adaptar`: **diverge a propósito del guardado por campo de la fila (TT-55)**,
porque un diálogo con varios campos y un botón que guardara solo algunos se
lee como roto. Se escribe en una sola mutación, `updateEntry`
([ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md)).
_No verificado_: si el diálogo de Clockify guarda con botón o por campo, y qué
hace al cerrarse con cambios.
_Corregido el 2026-10-04, slice 8c_: era propuesta, con la consecuencia de
construcción abierta en P-04: dos mutaciones seguidas no son todo o nada. P-04
la cerró y el ADR 0013 la resolvió con `updateEntry`. Se suman lo que pasa sin
cambios, con Enter, cuando falla y con «Reintentar».

_Agregado el 2026-10-07, slice 11b_: con un selector abierto —de proyecto o de
etiquetas—, `Esc` cierra solo el selector, también cuando la búsqueda no
encuentra nada; el diálogo sigue abierto con su borrador, y un segundo `Esc` lo
cierra. Hasta el 11b, con la lista del selector de proyecto vacía, el primer
`Esc` cerraba el diálogo y se perdía el borrador; lo encontró la prueba del
selector de etiquetas dentro del diálogo. Diseño propio, como toda la sección 11.

**CAL-68 Menú de la entrada** — `replicar`
Documentado en la página de dividir: «the three-dot menu at the bottom left
corner» de la ventana de edición. Ofrece duplicar (CAL-69) y borrar (CAL-70).
Dividir, que es lo que ahí se documenta, queda fuera (CAL-71).
_No verificado_: qué otras opciones tiene ese menú.

**CAL-69 Duplicar** — `replicar`
Documentado en la página de producto: «Quickly create an identical time
block.» Es TT-58, del slice 4, sin cambios: la copia cae con las mismas horas,
encima de la original, y se dibuja lado a lado (CAL-25).
_No verificado_: desde dónde se duplica en el calendario de Clockify, y qué
horas recibe la copia (lo mismo que ya arrastra TT-58).

**CAL-70 Borrar** — `adaptar`
Es TT-60 con TT-61: un diálogo de confirmación y sin deshacer. En Clockify el
deshacer vale también acá: «Undo feature automatically restores deleted entries
and all its data across the Time Tracker, Timesheet, Calendar, and Detailed
reports». Justificación: P-06, la misma decisión que en el rastreador.

**CAL-71 Dividir** — `fuera de alcance`
Documentado para el calendario, sobre entradas cerradas y sobre la que corre.
Justificación: es TT-59, de plan pago (P-05 del rastreador).

**CAL-72 La entrada cambió o desapareció con el diálogo abierto** — `adaptar`
Si otra pestaña la borró, «Guardar» recibe «Esa entrada ya no existe.» (TT-80),
el diálogo se cierra y la grilla se revalida. Si otra pestaña la editó, gana la
última escritura, como en la fila (contrato del slice 3, §4.3). Justificación:
no hay canal abierto (TT-40).

## 11. Teclado y accesibilidad

Clockify no documenta nada de esta sección. Todo es diseño propio y no se
compara contra el producto.

**CAL-73 Los atajos del rastreador no actúan en el calendario** —
`fuera de alcance`
TT-26 replica `n`, `c`, `s` y `m`, que la documentación lista en la página de
crear entradas y que actúan sobre la barra del rastreador. Justificación: no
está documentado que funcionen en el calendario, y esta pantalla no tiene barra
a la que apliquen.
_No verificado_: si funcionan en la página del calendario de Clockify.

**CAL-74 Todo gesto tiene un camino sin arrastre** — `adaptar`
Mover y estirar son atajos del diálogo, no la única forma: cada bloque es un
botón enfocable que abre su diálogo con `Enter` o `Espacio`, y ahí se editan
fecha, inicio y fin. Crear tiene un botón «Agregar entrada» arriba de la grilla,
que abre el diálogo de alta con el día de hoy si está a la vista y el primero
del período si no. Justificación: arrastrar no se puede hacer con el teclado ni
con un lector de pantalla, y WCAG 2.2 pide una alternativa sin arrastre (2.5.7,
«Dragging Movements»).

**CAL-75 Nombre accesible del bloque** — `adaptar`
«Descripción o Sin descripción, día, de HH:mm a HH:mm, duración», y «en curso»
en lugar del fin en el timer activo. Justificación: el bloque es un botón y su
contenido visible puede estar recortado (CAL-21).

_Agregado el 2026-10-05_. Fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): con
el slice 11, el nombre de una entrada facturable termina en «, facturable». Las
etiquetas no van en el nombre: están en el detalle (CAL-23), que también
aparece con el foco (CAL-77), y un nombre con todas las etiquetas se vuelve
largo de escuchar en cada `Tab`.

**CAL-76 Estructura de la grilla** — `adaptar`
Los encabezados de columna —día y total— quedan asociados a sus bloques, y
`Tab` recorre los bloques en orden cronológico. La línea de ahora es decorativa
para los lectores de pantalla. Las franjas libres no son controles: el alta por
teclado va por el botón de CAL-74. Justificación: una grilla de 168 franjas
enfocables vuelve inusable la navegación con `Tab`.

**CAL-77 El detalle se muestra también con el foco** — `adaptar`
El recuadro de CAL-23 aparece al enfocar el bloque, no solo al pasar el
puntero, y se cierra con `Esc`. Con un gesto de arrastre en curso no aparece,
tampoco con el foco. Justificación: lo que solo se ve con el puntero no existe
para el teclado.
_Corregido el 2026-10-05, slice 8b_: no decía que el detalle se cierra durante
un gesto (CAL-23).

**CAL-78 Movimiento reducido** — `adaptar`
Con `prefers-reduced-motion`, los bloques se reacomodan sin animación al soltar
o al revalidar. Justificación: diseño propio.

## 12. Calendarios externos y lo que es de plan pago

**CAL-79 Conectar Google Calendar u Outlook** — `fuera de alcance`
Documentado: «Clockify has view-only access to your external calendars», los
cambios del calendario externo se sincronizan solos, Outlook solo en la nube,
«Only events with a start and end time appear in the Calendar view», y los
eventos son privados de la persona. Justificación: pide permisos sobre el
calendario de Google más allá del login, guardar los tokens de cada persona y
una sincronización que con un cron por día (plan Hobby) no se puede sostener.
Es una integración, no la paridad de una pantalla.

**CAL-80 Lo que cuelga de los eventos externos** — `fuera de alcance`
Arrancar un timer desde un evento («Hover over the event and click the play
icon»), «Copy as time entry», abrir el evento en Google u Outlook y trabajar con
varios calendarios. Justificación: dependen de CAL-79.

**CAL-81 Ausencias y feriados** — `fuera de alcance`
La página de producto: «See upcoming holidays and vacations.» Justificación:
ausencias es de plan Standard en adelante; no se puede relevar.

**CAL-82 Asignaciones de planificación** — `fuera de alcance`
La página de producto: «See upcoming assignments and your scheduled tasks.»
Justificación: planificación es de plan Pro en adelante; no se puede relevar.

**CAL-83 El calendario en las apps móviles** — `fuera de alcance`
Justificación: no hay apps en el alcance del proyecto.

## 13. Validaciones y mensajes

El calendario no tiene reglas de validación propias: todas son las de las
mutaciones que llama, y sus textos se reusan tal cual.

- Menos de un minuto: «La entrada tiene que durar al menos un minuto.» (TT-73).
  En CAL-56 y en «Agregar» con duración cero.
- Inicio del timer activo en el futuro: «No se pueden cargar horas que todavía
  no pasaron.» (TT-75). En CAL-40.
- Hora que no existe por el cambio de horario: «Esa hora no existe por el
  cambio de horario.» (TT-112). En CAL-30 y CAL-59.
- Antes del 1 de enero de 2000: «No se pueden cargar horas anteriores al 1 de
  enero de 2000.». En CAL-48.
- Entrada que el trío no puede expresar: «Esta entrada dura más de un día; sus
  horarios no se pueden editar acá.» (TT-110). En CAL-58.
- Horas de la entrada que corre pedidas por `updateEntryTimes`: «Esta entrada
  es la que está corriendo.» (TT-111). En CAL-39.
- Timer ya detenido: «Este timer ya había sido detenido.» (TT-41). En CAL-40 y
  CAL-41.
- Entrada borrada: «Esa entrada ya no existe.» (TT-80). En CAL-41 y CAL-72.
- Entrada ajena o membresía que no escribe: los dos textos de TT-79. En CAL-05.

Títulos de aviso (TT-90), también reusados:

- Mover o estirar: «No se pudo guardar el horario de la entrada.»
- Agregar desde el diálogo: «No se pudo agregar la entrada.», también por red,
  con «Reintentar» (TT-89, TT-109).
- Detener desde el diálogo: «No se pudo detener el timer.»
- Duplicar: «No se pudo duplicar la entrada.»
- Borrar: «No se pudo borrar la entrada.»

Textos nuevos, uno por causa nueva:

- **CAL-46**, la entrada creada o editada quedó fuera del período visible:
  «La entrada quedó el `<día>`, fuera de la semana que estás viendo.», con el
  enlace «Ir a esa semana». En la vista día, «fuera del día que estás viendo»,
  con «Ir a ese día».
- **CAL-46 y TT-109**, el alta respondió la entrada de un intento anterior y no
  lo que se mandó: «La entrada ya se había agregado con lo que mandaste antes;
  lo que está en el diálogo no se guardó.», como aviso informativo. Es el de la
  barra, que dice «lo que está en la barra»; cambia el lugar.
- **CAL-67**, falló «Guardar» del diálogo: «No se pudo guardar la entrada.» Es
  nuevo porque nombra otra acción: el diálogo guarda la entrada entera, no solo
  su horario ni solo su descripción. Vale también para el timer: el diálogo no
  usa «No se pudo guardar el inicio del timer.»
- **CAL-40**, «Detener» con cambios sin guardar: «Guardá los cambios antes de
  detener el timer.»

_Corregido el 2026-10-04, slice 8c_: listaba «Detené el timer para agregar
tiempo a mano.» (TT-30) como un texto del calendario, que desde P-01 no lo usa,
y «No se pudo guardar el inicio del timer.» como título del diálogo del timer,
que guarda con «Guardar» (CAL-67). Se suman el título de duplicar, el texto de
TT-109 del calendario, «Ir a ese día» y el de «Detener».
_Corregido el 2026-10-07, slice 2c_: el título de «Agregar» decía «y, por red,
el de TT-109», y el texto de CAL-46 y TT-109 era «Se perdió la respuesta del
servidor. Antes de volver a agregarla, fijate en el calendario: puede haberse
creado.», que salió con el aviso «No sabemos si la entrada se guardó.». El
texto nuevo es el informativo del alta que no se guardó.
_Corregido el 2026-10-07, piso fijo_: la causa del piso decía «Antes de la creación del workspace: «No se pueden cargar horas anteriores a la creación del workspace.» (ADR 0005)». El piso es una fecha fija (CAL-48).

## 14. Estados vacíos

**CAL-84 Período sin entradas** — `adaptar`
La grilla se dibuja vacía, con los totales en `0:00`, sin ilustración y sin
saltar a otro período. Vale también para una persona sin ninguna entrada.
Justificación: la grilla es un período fijo y vacía también sirve, para crear;
es lo contrario de la lista, que salta la semana vacía (TT-86), y está bien que
lo sea.
_No verificado_: qué muestra Clockify con la semana vacía.

**CAL-85 Período anterior al 1 de enero de 2000** — `adaptar`
Se dibuja entero atenuado, por CAL-48; solo se llega navegando a 1999 o antes.
Justificación: la de CAL-48.
_Corregido el 2026-10-07, piso fijo_: el título era «Período anterior a la
creación del workspace». El piso pasó a ser una fecha fija (CAL-48).

## 15. Estados de error

**CAL-86 Red, sesión y membresía** — `adaptar`
Valen TT-89, TT-90 y TT-92: aviso de dos partes con «Reintentar» solo por red,
también en el alta (TT-109), y membresía desactivada en solo lectura, con el
aviso permanente de TT-92 arriba de la grilla (CAL-05). Con la sesión vencida,
`requireSession` lleva a la pantalla de acceso y, al volver a entrar, el acceso
lleva siempre a `/`: **no hay ruta de vuelta** a `/calendario` ni al período
que se veía. Es lo de toda la aplicación; TT-91 la pide y tampoco se cumple en
`/`. Justificación: la de cada TT; la ruta de vuelta después del acceso no
existe en ninguna pantalla y no le toca al calendario construirla.
_Corregido el 2026-10-04, slice 8_: decía que la sesión vencida llevaba a la
pantalla de acceso conservando `/calendario` con su período como ruta de
vuelta. El slice 8 entra sin ella. En el 8 la pantalla no escribe, así que
todavía no hay avisos de dos partes: llegan con el 8c, que es el que tiene
actions.
_Corregido el 2026-10-07, slice 2c_: decía «con «Reintentar» solo por red,
salvo en el alta (TT-109)»; desde el 2c el alta también lo ofrece.

**CAL-87 Falla al leer el período** — `adaptar`
La grilla se arma en el servidor. Mientras carga, la página muestra un
esqueleto anunciado como «Cargando el calendario». Si la lectura falla,
`/calendario` muestra su propia pantalla de error, «No se pudo cargar el
calendario.», con un botón «Reintentar» que vuelve a pedirla, sin dibujar una
grilla vacía que se confunda con CAL-84. Justificación: un período vacío y uno
que no cargó no pueden verse igual.
_Corregido el 2026-10-04, slice 8_: decía que la página mostraba el error del
shell. El shell no tiene pantalla de error; `/calendario` es la primera ruta
que tiene la suya.

## 16. Al recargar

**CAL-88 Lo que sobrevive a la recarga** — `adaptar`
Sobreviven el período y la vista (URL, CAL-17), el zoom (cookie, CAL-12) y el
timer activo, dibujado desde su inicio sin parpadeo, como TT-38. No sobreviven
el borrador de alta, la selección, el diálogo abierto ni un arrastre en curso.
Justificación: es lo mismo que el rastreador hace con su barra y PR-95 con sus
filtros.

**CAL-89 Cambios hechos en otra pestaña** — `adaptar`
La revalidación de TT-40 (P-11): al enfocar, al volver a ser visible y cada 60
segundos mientras está visible. Mientras dura un arrastre, esas revalidaciones
se juntan y sale una al terminar, si hubo alguna con la pestaña visible. La que
llega con la respuesta de otra action todavía en vuelo —un «Detener» o un
«Duplicar» de antes del gesto— no se puede pausar: el gesto sigue dibujando su
candidato, y si esa revalidación se lleva la entrada del gesto, el gesto se
cancela (CAL-63). Justificación: no hay canal abierto; mover un bloque debajo
del puntero es peor que mostrarlo un instante desactualizado.
_Corregido el 2026-10-05, slice 8b_: decía que una revalidación que llega con
un arrastre en curso se aplica al soltar. Solo esperan las de TT-40; la que
trae la respuesta de otra action se aplica en el momento.

## 17. Casos borde

**CAL-90 Entrada de segundos producida por el timer** — `adaptar`
Se dibuja con la altura mínima (CAL-24) y se estira. Si su distancia de reloj
es cero —empieza y termina dentro del mismo minuto—, no se mueve: con la
distancia conservada (CAL-51), el trío movido duraría cero. Se mueve desde el
diálogo. Al estirar, el extremo que no se toca conserva sus segundos; si el par
queda en menos de un minuto, el descarte del ADR 0006 recalcula los dos
extremos. Justificación: consecuencia del ADR 0006 y de CAL-51.
_Corregido el 2026-10-05, slice 8b_: no decía que un bloque de distancia de
reloj cero no se mueve.

**CAL-91 Entrada sin proyecto** — `replicar`
Válida en todo el recorrido, con el color neutro (CAL-22, TT-93).

**CAL-92 Un extremo llevado a la hora repetida** — `adaptar`
Va al segundo instante, como en la edición en línea (ADR 0006), y las entradas
de las dos pasadas se dibujan en la misma franja (CAL-30). Justificación: la
del ADR 0006; desde una grilla tampoco se puede pedir la primera pasada.

**CAL-93 Timer que lleva días corriendo** — `adaptar`
Un segmento por día desde su inicio hasta la línea de ahora (CAL-26, CAL-38).
Si empezó en una semana anterior, la actual lo muestra desde las 00:00 de su
primer día. Suma entero al día de inicio (CAL-32, CAL-34). Justificación: la de
CAL-26 y CAL-32.

**CAL-94 Entrada que empieza exactamente a las 00:00** — `replicar`
Va en la columna de ese día (TT-100). La que termina a las 00:00 no dibuja nada
en la columna siguiente (CAL-26).

**CAL-95 Cambiar la zona horaria con el calendario abierto** — `replicar`
Ningún instante se toca; al revalidar, los bloques pueden cambiar de columna y
de altura (PF-38).

**CAL-96 Cambiar el inicio de semana** — `replicar`
Se reordenan las columnas y la semana de la URL se normaliza al nuevo inicio
(CAL-17, PF-40).

**CAL-97 Dos pestañas moviendo la misma entrada** — `adaptar`
Gana la última escritura (contrato del slice 3, §4.3), y la otra pestaña se pone
al día al revalidar. **Al estirar, el extremo que no se toca viaja con el
rótulo que muestra la pantalla**: si otra pestaña lo cambió, el pedido lo
devuelve a ese rótulo, y gana la última escritura también en ese extremo, como
en la fila. Justificación: sin canal abierto (TT-40) no hay forma de avisarle a
la otra, y mover un solo extremo pediría una mutación que reciba solo ese
extremo.
_Corregido el 2026-10-05, slice 8b_: no decía qué pasa con el extremo que no se
estira.

**CAL-98 Mover una entrada al futuro** — `replicar`
Se permite (TT-76): una entrada cerrada no tiene cota superior. Un timer activo
sí la tiene (CAL-40).

**CAL-99 Mover una entrada sobre el timer activo** — `replicar`
Se permite y se dibujan lado a lado (TT-82, CAL-60). El timer sigue corriendo.

**CAL-100 Entrada en solo lectura que cruza el borde del período** — `adaptar`
Se dibuja el segmento visible, sin asas en ninguno de sus segmentos (CAL-28,
CAL-58). Justificación: la de TT-110.

## 18. Qué depende de proyectos, etiquetas o facturable

El slice 8 llegó con el núcleo de proyectos ya en `main` (slices 9 y 10), así
que el color del proyecto en el bloque (CAL-22), y el proyecto y la tarea en el
bloque, el detalle, el diálogo de solo lectura y el nombre accesible (CAL-21,
CAL-23, CAL-66, CAL-75) entraron con él. Lo que llegó después y lo que falta:

- **Slice 8c, entregado.** El proyecto y la tarea en el diálogo de alta y
  editables en el de una entrada (CAL-45, CAL-66).
- **Slice 11a, entregado: el facturable.** Lo construyó como lo fijan CAL-21,
  CAL-23, CAL-45, CAL-66 y CAL-75; lo que agregó a lo registrado está en
  CAL-41 y CAL-66.
  - En el bloque, el ícono al final de la línea del horario, solo en el
    segmento del día de inicio y solo si la entrada es facturable.
  - En el detalle, la línea «Facturable», después del proyecto y, desde el
    11b, de las etiquetas, solo si lo es.
  - En los tres modos del diálogo, el control de TT-14 después de «Proyecto»
    y, desde el 11b, de «Etiquetas», con el nombre a la vista. El alta arranca
    no facturable; elegir proyecto le pone su facturable por defecto (TT-14), y
    «Guardar» manda el facturable siempre que manda el proyecto, así el
    servidor no aplica el por defecto encima del que quedó a la vista.
  - En el diálogo de solo lectura, «Facturable» con «Sí» o «No», entre
    «Etiquetas» y «Fecha».
  - El nombre accesible de una entrada facturable termina en «, facturable»,
    después del proyecto.
- **Slice 11b, entregado: las etiquetas.** Las construyó como lo fijan CAL-23,
  CAL-45, CAL-66 y CAL-75; lo que agregó a lo registrado está en CAL-23,
  CAL-41, CAL-66 y CAL-67.
  - En el detalle, la línea «Etiquetas: a, b», con los nombres en orden
    alfabético, entre el proyecto y «Facturable», solo si tiene alguna.
  - En los tres modos del diálogo, el selector de TT-12 entre «Proyecto» y el
    facturable. El alta arranca sin etiquetas; el selector cambia el borrador
    y lo elegido viaja con «Guardar» o «Agregar». Una etiqueta archivada que la
    entrada ya tiene aparece marcada, con «(archivada)» (PR-47).
  - Con un selector abierto, `Esc` cierra solo el selector, también con la
    búsqueda sin resultados (CAL-67).
  - En el diálogo de solo lectura, «Etiquetas» con los nombres o «Sin
    etiquetas», entre «Proyecto» y «Facturable».
  - El bloque y su nombre accesible no las muestran (CAL-21, CAL-75).
- **Slice 12.** Nada.

**El proyecto no toca la geometría de la grilla**: posición, altura,
superposición y gestos no dependen de él. Una entrada sin proyecto se dibuja con
el relleno neutro y es válida en todo el recorrido (CAL-91). Lo mismo vale para
las etiquetas y el facturable del slice 11. El 11a lo cumple: el ícono va
dentro de la línea del horario y no cambia el lugar ni el alto del bloque. El
11b también: las etiquetas no van en el bloque.

Dos dependencias que no son de proyectos y conviene tener a la vista:

- **CAL-69, duplicar, es TT-58, del slice 4**, que ya está en `main`. Duplicar
  desde el diálogo llega con el 8c.
- **CAL-18, CAL-19, CAL-31 y CAL-33 leen del perfil** (slice 7), que también
  está en `main`.

_Corregido el 2026-10-04, slice 8_: decía que el slice 8 iba antes del núcleo de
proyectos, que el 10 sumaba después el color, el proyecto y la tarea sin tocar
la grilla, y que todo lo demás se construía con entradas sin proyecto; lo
mismo decía la primera decisión del equipo de «Tres clases de comportamiento».
El 10 ya estaba en `main` cuando arrancó el 8. La dependencia del slice 4 dejó
de ser condicional.
_Corregido el 2026-10-05, slice 11_: no decía que el 11 se parte en dos ni dónde
quedó lo que fija, ni que las etiquetas y el facturable tampoco tocan la
geometría.
_Corregido el 2026-10-05, slice 11a_: el 8c y el 11 figuraban entre lo que
falta. El 8c y el 11a están entregados, y del 11 queda el 11b, las etiquetas.
_Corregido el 2026-10-07, slice 11b_: el 11b figuraba entre lo que falta, y el
detalle y los dos diálogos ponían «Facturable» justo después del proyecto; las
etiquetas quedaron en el medio.

## 19. Impacto sobre lo ya construido

Lo que el calendario obligó a mirar de lo que ya estaba construido, y qué slice
lo resolvió.

- **Una lectura nueva del módulo `time-entry`** (slice 8): `getCalendarState`
  lee las entradas que se superponen con el período, más el timer activo
  (CAL-28); `getTrackerState` lee por día de inicio y con otra ventana.
- **`editableTimes`** ya existía en `TimeEntryView` y decide si el diálogo deja
  editar el horario (CAL-58, slice 8c) y si un bloque tiene asas (slice 8b).
  Ningún componente lo recalcula.
- **`updateEntry`** (slice 8c, ADR 0013): «Guardar» del diálogo escribe la
  descripción, el par y el horario en una sola mutación, con las reglas de
  `updateDescription`, `updateEntryProject`, `updateEntryTimes` y
  `updateRunningStart`, que siguen como estaban.
- **`createManualEntry` dejó de rechazar el alta con un timer abierto** (slice
  8c, P-01): el alta del calendario es esta action, sin excepción por origen, y
  TT-30 quedó como regla de la interfaz del rastreador.
- **Las actions de `time-entry` revalidan `/` y `/calendario`** (slice 8c),
  también cuando fallan: la pantalla desde la que se escribe se pone al día,
  sea cual sea.
- **La conversión de los gestos al trío** (slice 8b) sale de horas de pared
  ajustadas al zoom y de `shiftClock`, sin aritmética de instantes en el
  cliente (ADR 0005).
- **Las franjas que no existen** (CAL-30): el cliente no sabe de husos
  (ADR 0005), así que los minutos que no existen llegan del servidor con cada
  día del período (slice 8).
- **`src/components/layout/app-nav.tsx`** suma la entrada «Calendario»
  (CAL-01, slice 8).

**Lo que no se toca**: el esquema, los permisos y las reglas del ADR 0005 y del
ADR 0006. El calendario no agrega columnas ni acciones de permiso.
_Corregido el 2026-10-04, slice 8c_: decía que `createManualEntry` no cambiaba
y que el todo o nada pedía una forma de escribir en una transacción que no
existía. El 8c construyó `updateEntry` y sacó de `createManualEntry` el rechazo
de TT-30; faltaba la revalidación de `/calendario`. Cada punto dice ahora qué
slice lo resolvió.

## 20. Reparto por slices

El calendario se entrega en tres slices, cada uno desplegable solo: el 8 lee,
el 8c escribe y el 8b arrastra. El orden completo está en
[el mapa de la fase 1](../slices/fase1-mapa.md).

### Slice 8 — calendario en lectura

CAL-01, CAL-02, CAL-04, CAL-06, CAL-07, CAL-09 a CAL-12, CAL-14 a CAL-19,
CAL-20 a CAL-30 en su dibujo, CAL-31 a CAL-38, la primera oración de CAL-41, el
atenuado de CAL-48, CAL-65 y CAL-66 en solo lectura, CAL-74 en los bloques,
CAL-75 a CAL-78, CAL-84, CAL-85, CAL-86 sin la ruta de vuelta, CAL-87, CAL-88,
la primera oración de CAL-89, CAL-90 y CAL-92 en su dibujo, CAL-91 y CAL-93 a
CAL-96. De CAL-05, lo que se ve: la grilla en solo lectura y el aviso de TT-92.
Contrato: [fase1-slice8-calendario.md](../slices/fase1-slice8-calendario.md).

- **La grilla lee las entradas que se superponen con el período** (CAL-28): la
  que empezó antes y la que termina después están; la que empezó antes y
  termina justo al principio, no. El timer viaja aparte.
- **Los totales son los de la lista** (CAL-31 a CAL-34, P-02): el total de la
  semana es el mismo número que el encabezado de esa semana en `/`, y el timer
  suma al día y al período de su inicio.
- **Cada bloque es un botón con destino**: abre el diálogo en solo lectura
  (CAL-65, CAL-66), así el 8 se despliega antes que la escritura.
- **TT-92 se verifica por el camino nuevo**: la membresía desactivada ve la
  grilla entera, con sus entradas, y el aviso permanente arriba.
- **Sin actions propias, la revalidación es la de TT-40**: las actions de
  `time-entry` revalidan solo `/`, así que volver al calendario con «Atrás»
  después de cargar horas en `/` puede mostrar la copia anterior hasta la
  próxima revalidación, a lo sumo 60 s (P-11).
  _Corregido el 2026-10-04, slice 8c_: desde el 8c las actions revalidan
  también `/calendario` (sección 19).
- **Lo que el slice decide**, todo diseño propio _no verificado_ (P-07):
  - **CAL-07, CAL-14, CAL-17, CAL-21, CAL-22, CAL-36, CAL-65, CAL-66 y
    CAL-87**, en su entrada.
  - **CAL-11.** «Acercar» y «Alejar» en la esquina superior izquierda de la
    grilla, con el tamaño de franja a la vista («1 h», «30 min», «15 min», «5
    min»); en su extremo quedan inactivos.
  - **CAL-15.** En la vista día, las flechas dicen «Día anterior» y «Día
    siguiente», y el rango se rotula «Hoy», «Ayer» o «mié, 01/10».
  - **CAL-16.** El rango abre un calendario de mes sin cota; elegir un día
    lleva a su período.
  - **CAL-23 y CAL-77.** El detalle aparece al pasar el puntero y al enfocar, y
    se cierra con `Esc`. En pantallas táctiles no aparece; el diálogo muestra
    lo mismo.
  - **CAL-26 y CAL-76.** De una entrada con varios segmentos visibles, solo el
    primero es un botón en el orden de `Tab`; los otros abren el mismo diálogo
    con el puntero y quedan ocultos para el lector de pantalla.
  - **CAL-38.** El bloque del timer se distingue de los cerrados por el borde
    punteado.
  - **CAL-75.** El nombre accesible suma al final el proyecto, o «Proyecto:
    Tarea», cuando lo hay. El del timer es «…, desde las {inicio}, en curso».

### Slice 8c — calendario, escritura

CAL-40, la segunda oración de CAL-41, CAL-43, CAL-45 a CAL-47 (CAL-47
invertido por P-01), el clic sin efecto de CAL-30 y CAL-48, CAL-49, CAL-58 en
su parte de diálogo, CAL-65 a CAL-70 editables, CAL-72, el botón «Agregar
entrada» de CAL-74, los avisos de dos partes de CAL-86, CAL-92 por el diálogo y
CAL-97 a CAL-99 sobre el diálogo. De CAL-05, los controles de escritura de los
cinco roles. CAL-39 se cumple sin hacer nada: ningún bloque se arrastra. Cierra
P-01, P-04 y P-06. Contrato:
[fase1-slice8c-calendario-escritura.md](../slices/fase1-slice8c-calendario-escritura.md).

- **El diálogo pasa por las reglas de la fila y del contador**: TT-28, TT-29,
  TT-73, TT-75, TT-77, TT-110, TT-111, TT-112 y el piso del ADR 0005, con sus
  textos. Los campos de hora y de duración son los del modo manual (TT-18 a
  TT-21), en el formato de la persona (PF-13, PF-14).
- **Duplicar y borrar desde el menú del diálogo** son TT-58, TT-60 y TT-61, sin
  cambios. Descartar el timer (TT-65) sigue en el rastreador.
- **TT-66, TT-79, TT-80 y TT-92 se verifican por el camino nuevo**: los cinco
  roles editan sus entradas desde el diálogo; la ajena y la que ya no existe
  responden su texto; una membresía desactivada abre el diálogo en solo
  lectura y no tiene alta.
- **Los avisos** (TT-89, TT-90, TT-109): los de «Guardar» y «Agregar» van en el
  diálogo; los de «Detener», «Duplicar» y «Borrar», y los de «Guardar» que
  cierran el diálogo, en la pantalla, debajo de la barra. «Reintentar» solo por
  red y nunca en el alta. Una operación nueva baja los anteriores.
  _Corregido el 2026-10-07, slice 2c_: desde el 2c el alta también ofrece
  «Reintentar» por red (TT-109, CAL-46); lo de arriba es lo que entregó el 8c.
- **Lo que el slice decide**, diseño propio _no verificado_ (P-07):
  - **CAL-39, CAL-40, CAL-41, CAL-45, CAL-46, CAL-47 y CAL-67**, en su
    entrada.
  - **CAL-43.** El clic en una franja propone su inicio y una franja de largo;
    si el fin cae en minutos que no existen, pasa al primer minuto que existe
    después. No hace nada en un minuto que no existe, en un día anterior al
    piso de fechas (CAL-48) o sin permiso de carga.
    _Corregido el 2026-10-07, piso fijo_: decía «en un día anterior a la creación del workspace».
  - **CAL-74.** «Agregar entrada», al final de la barra, propone hoy si está a
    la vista y si no el primer día del período, nunca antes del piso; la hora
    es la franja de ahora si el día es hoy, y las 08:00 si no.
  - **CAL-65.** Los títulos son «Editar entrada», «Timer en curso» y «Agregar
    entrada», y al abrir el foco va a «Descripción». «Entrada», en solo
    lectura, queda para la membresía desactivada.
  - **CAL-68.** «Duplicar» y «Borrar» del menú cierran el diálogo al elegirse;
    su aviso, si fallan, queda en la pantalla. El foco va a la copia, o a la
    región al confirmar el borrado; cancelar la confirmación lo devuelve al
    bloque.
  - **TT-89 en el diálogo.** «Reintentar» de un «Guardar» que falló por red
    guarda el borrador actual, no el del pedido que falló.

### Slice 8b — calendario, arrastre

CAL-44, CAL-50 a CAL-57, las asas de CAL-58, CAL-59 a CAL-64, el «ni soltar»
de CAL-30 y CAL-48, la segunda oración de CAL-89, «se estira» de CAL-90,
CAL-100, CAL-97 a CAL-99 sobre los gestos, CAL-23 y CAL-77 con un gesto en
curso, y CAL-78 al soltar. CAL-39 se verifica por primera vez: el bloque del
timer no ofrece ningún gesto. No cambia nada del servidor: mover y estirar son
`updateEntryTimes` con el trío completo, y crear arrastrando abre el alta del
8c. Contrato:
[fase1-slice8b-calendario-arrastre.md](../slices/fase1-slice8b-calendario-arrastre.md).

- **Los gestos son atajos del diálogo** (CAL-74): todo lo que hacen se hace
  también desde el diálogo, con clics o con el teclado (WCAG 2.5.7 y 2.1.1).
  Las asas no son controles ni están en el orden de `Tab`.
- **Solo con el mouse**
  ([ADR 0014](../adr/0014-los-gestos-del-calendario-son-pointer-events-propios.md)):
  en pantallas táctiles y con lápiz no hay gestos; un toque es un clic y
  deslizar desplaza la grilla. **Es una divergencia si Clockify arrastra con el
  dedo.**
- **Entran por arrastre, verificados por el camino nuevo**: TT-55, el horario
  en vuelo atenuado, ahora en la grilla; TT-73, TT-110, TT-111, TT-112 y los
  ADR 0005 y 0006, con sus textos, en el aviso del gesto; TT-79, TT-80, TT-89 y
  TT-90; TT-66 y TT-92: los cinco roles arrastran sus entradas, y una membresía
  desactivada no tiene gestos.
- **Lo que el slice decide**, diseño propio _no verificado_ (P-07):
  - **CAL-23, CAL-54 a CAL-57, CAL-59, CAL-61 a CAL-63, CAL-77, CAL-89, CAL-90
    y CAL-97**, en su entrada.
  - **CAL-50 y CAL-53.** El inicio del bloque movido cae en la marca de franja
    más cercana al lugar donde quedaría con el puntero; el fin es ese inicio
    más la distancia de reloj original. Se toma de cualquier segmento y se
    arrastra por las columnas visibles.
  - **CAL-52 y CAL-53.** El borde estirado cae en la marca más cercana al
    puntero.
  - **CAL-44.** La selección cubre las franjas entre la tocada y la que está
    bajo el puntero, en las dos direcciones, sin salir de su columna, y mide
    como máximo 24 horas menos una franja. Al soltar abre «Agregar entrada» con
    ese rango. Un clic sin recorrido sigue siendo CAL-43.
  - **CAL-30 y CAL-48.** Un candidato con un extremo en un minuto que no existe
    no se ofrece: el gesto se queda con el anterior. El inicio de un bloque
    movido no pasa del piso de fechas: el gesto se detiene en él.
    _Corregido el 2026-10-07, piso fijo_: decía «no pasa del piso del workspace».
  - **Un gesto no termina en clic**: después de soltar no se abre el diálogo
    del bloque ni el alta de CAL-43.
  - **El foco.** Al terminar un gesto sobre un bloque —soltar con o sin pedido,
    o cancelar— el foco queda en el botón del bloque. La respuesta del pedido,
    con éxito o con falla, lo devuelve al bloque, salvo que mientras viajaba la
    persona lo haya llevado a otro lado.
  - **El desplazamiento automático.** Con el puntero a menos de 32 px de un
    borde del área visible de las columnas, la grilla se desplaza hacia ese
    borde, más rápido cuanto más cerca.
- **Afuera**: P-03, el asa del inicio del timer (CAL-39), sigue abierto; los
  atajos de teclado para mover o estirar; llevar un bloque a otra semana
  arrastrando (CAL-61), que va por el diálogo.

### Lo que queda

Con el 8b, los tres slices del calendario están entregados.

- **Abiertos con su propuesta**: P-03 (CAL-39) y P-05 (CAL-13).
- **Fuera de los tres**: la ruta de vuelta después del acceso (CAL-86, TT-91),
  que no existe en ninguna pantalla; los gestos táctiles, con una pulsación
  larga, que irían en un slice propio (ADR 0014); y los huecos de los días
  vecinos al período, que el cliente no conoce (CAL-59).

_Corregido el 2026-10-04, slice 8c_: sale de esta lista la escritura, que ahora
tiene su sección.
_Corregido el 2026-10-05, slice 8b_: sale de esta lista el arrastre, que ahora
tiene su sección.
_Corregido el 2026-10-05, slice 11a_: decía «Slice 11: etiquetas y
facturable»; el facturable llegó con el 11a (sección 18).
_Corregido el 2026-10-07, slice 11b_: decía «Slice 11b: las etiquetas»; llegaron
con el 11b (sección 18).
_Corregido el 2026-10-07, slice 2c_: sale de esta lista «Reintentar» en el alta
(TT-109), que trajo el slice 2c junto con la barra del rastreador (su sección
en [la paridad del rastreador](time-tracker.md)).

## Pendientes de definición del equipo

Numeración propia de este documento. Para no confundirla con la del
rastreador, de proyectos y del perfil, se cita como `calendario P-nn`.

### Abiertos

Todos tienen una propuesta escrita en el comportamiento que citan, y ninguno
bloquea un contrato.

- **P-03 Arrastrar el inicio del timer activo** (CAL-39). Propuesta: no por
  ahora; el inicio se corrige desde el diálogo (CAL-40). Agregar el asa después
  no cambia ninguna otra regla, pero pide una que ningún otro gesto tiene —el
  tope en «ahora», que avanza mientras se arrastra (TT-29)— y su propia
  mutación, `updateRunningStart`.
- **P-05 Mostrar solo días laborables** (CAL-13). Propuesta: fuera hasta que
  existan los días laborables por persona (PF-19), que también están fuera de
  alcance. La alternativa —ocultar sábado y domingo fijos— es una regla que
  Clockify no tiene. _Corregido el 2026-10-16, PF-19 (equipo P-09, workspace
  P-06)_: decía que los días laborables por persona eran de la fase 2.
- **P-07** La lista de verificación contra el workspace real, abajo.

_Corregido el 2026-10-04, slice 8_: P-02 pasó a «Cerrados».
_Corregido el 2026-10-04, slice 8c_: P-01, P-04 y P-06 pasaron a «Cerrados».
Decía que los tres primeros cambiaban lo que el contrato tenía que decir.
_Corregido el 2026-10-05, slice 8b_: P-03 decía «en el slice 8 no». El 8b
tampoco lo cierra: el team-lead lo dejó fuera el 2026-10-04, por delegación
del usuario, y sigue abierto.

Y uno que no es de este documento pero se cruzaba: **perfil P-02**, «inicio del
día» (PF-15). Se cerró el 2026-10-07: el ajuste no existe en el workspace del
equipo (respuesta A de timesheet P-12), así que las 08:00 de CAL-14 siguen como
constante del cliente y no hay preferencia que leer.
_Corregido el 2026-10-04, slice 8_: decía que perfil P-02 quedaba apuntado a
este slice y se cerraba en él si la verificación lo confirmaba.
_Corregido el 2026-10-07_: decía que el slice 8 no lo cerraba y que, si la
verificación de CAL-14 mostraba que esa hora era «inicio del día», se cambiaba
solo la constante por la preferencia; si no tenía que ver con el calendario, se
cerraba solo.

### calendario P-07, la lista de verificación

Todo lo marcado como _no verificado_, con la pregunta concreta que hay que
contestar mirando el workspace del equipo. Ninguna bloquea: todas tienen una
regla escrita y lo que la verificación puede hacer es corregirla. Las marcadas
**(divergencia)** son las que, según la respuesta, confirman o retiran una
divergencia de las que este documento propone.

- **CAL-06, CAL-07, CAL-08** — ¿Hay selector de vista? ¿Con qué opciones —día,
  semana, mes— y cuál viene por defecto?
- **CAL-12** — Cambiar el zoom, ir al rastreador y volver: ¿sigue el zoom
  elegido? ¿Y en otro navegador?
- **CAL-14** — ¿A qué hora aparece desplazada la grilla al abrir la página, en
  la semana actual y en una pasada?
- **CAL-15, CAL-16** — ¿Qué controles de navegación hay —flechas, «Hoy»,
  selector de fecha— y cómo se rotula el rango visible?
- **CAL-21, CAL-22** — ¿Qué muestra un bloque? ¿De qué color es un bloque sin
  proyecto, y uno con proyecto?
- **CAL-23** — Una entrada con dos etiquetas: ¿qué muestra el recuadro al pasar
  el puntero? ¿Las muestra también el bloque?
- **CAL-25** — Crear dos entradas de 10:00 a 11:00 el mismo día: ¿cómo se
  dibujan?
- **CAL-26, CAL-27** — ¿Cómo se dibuja una entrada de 22:00 a 02:00? ¿Y una de
  30 horas producida por un timer?
- **CAL-30** — Con la zona horaria del perfil en `Europe/Madrid`, ir a la
  semana del 2026-03-29 y a la del 2026-10-25: ¿cómo se dibujan la hora que no
  existe y la que se repite? ¿Se puede soltar un bloque a las 02:30 del 29 de
  marzo?
- **CAL-31, CAL-32** — ¿Hay total por día? Con una entrada de 22:00 del lunes a
  02:00 del martes: ¿suma 4 horas al lunes, o 2 y 2?
- **CAL-33** — ¿Dónde está el total de la semana?
- **CAL-37** — ¿La línea de ahora va solo en la columna de hoy o cruza toda la
  semana?
- **CAL-38** — ¿Cómo se ve el timer activo en la grilla? ¿Crece mientras se
  mira?
- **CAL-39** — ¿Se puede arrastrar o estirar el bloque del timer activo?
  **(divergencia)**
- **CAL-40** — ¿Qué tiene el diálogo del timer activo? ¿Ofrece detenerlo?
  ¿Hay una barra de timer en la página del calendario?
- **CAL-43** — Un clic en una franja libre con el zoom en 60: ¿qué inicio y
  qué fin propone el diálogo?
- **CAL-44** — ¿Se puede crear arrastrando sobre la grilla? ¿Puede la
  selección pasar de una columna a otra? En una pantalla táctil, ¿se puede
  crear, mover o estirar arrastrando con el dedo? **(divergencia)**
- **CAL-47** — Con un timer corriendo, hacer clic en una franja libre y
  agregar: ¿lo deja? **(divergencia)**
- **CAL-53** — Con cada zoom, arrastrar un bloque despacio: ¿a qué múltiplo
  salta?
- **CAL-55** — Estirar el fin de un bloque de 10:00 hasta pasar las 10:00 del
  día siguiente: ¿lo deja? **(divergencia)**
- **CAL-58** — Arrastrar un bloque de más de 24 horas: ¿se mueve?
  **(divergencia)**
- **CAL-61** — Arrastrar un bloque contra el borde de la semana: ¿avanza la
  grilla?
- **CAL-67** — En el diálogo de una entrada cerrada, ¿se guarda con un botón o
  campo por campo? Cambiar algo y cerrarlo sin guardar: ¿qué pasa?
- **CAL-68, CAL-69** — ¿Qué opciones tiene el menú de tres puntos del diálogo?
  ¿Desde dónde se duplica en el calendario?
- **CAL-73** — Con la página del calendario abierta y el foco fuera de un
  campo, ¿hacen algo `n`, `c`, `s` y `m`?
- **CAL-84** — ¿Qué muestra una semana sin entradas?

_Corregido el 2026-10-05, slice 8b_: CAL-44 suma la pregunta del arrastre con
el dedo, la divergencia del ADR 0014.
_Corregido el 2026-10-05, slice 11_: suma CAL-23, por las etiquetas. El
facturable del bloque y del detalle no entra: no se puede verificar en el plan
Free (P-16 de [la paridad de proyectos](proyectos.md)).
_Corregido el 2026-10-07_: la pregunta de CAL-14 pedía además cambiar «inicio
del día» en el perfil y decía que la respuesta cerraba también perfil P-02. Ese
ajuste no existe en el workspace del equipo y perfil P-02 se cerró.

### Cerrados

Se dejan con su identificador porque el documento y los contratos los citan.

- **P-01 Crear con un timer corriendo** (CAL-47). Se permite, sin aviso y sin
  excepción por origen: `createManualEntry` dejó de rechazar el alta con un
  timer abierto, y TT-30 quedó como regla de la interfaz del rastreador.
  Decisión del usuario del 2026-10-04; la construye el slice 8c.
- **P-02 Total del día de una entrada que cruza la medianoche** (CAL-32). Cada
  entrada cerrada suma entera en el día de su inicio, como en la lista; la
  columna siguiente dibuja horas que su total no cuenta. CAL-32 queda como
  estaba. Vale también para el período: una entrada que empezó antes del
  primer día dibuja su segmento y no suma a ningún total visible, y el timer
  suma solo en la columna y el período de su día de inicio (CAL-34, CAL-93).
  Decisión del usuario del 2026-10-04; la construye el slice 8.
- **P-04 «Guardar» todo o nada en el diálogo** (CAL-67). Sí, con botón:
  «Guardar» aplica juntos los grupos de campos que la persona tocó, con
  `updateEntry` (ADR 0013); sin cambios cierra sin pedido, y cerrar con
  cambios los descarta. Decisión del usuario del 2026-10-04; la construye el
  slice 8c.
- **P-06 «Detener» en el diálogo del timer activo** (CAL-40). Sí, con
  `stopTimer` sin cambios, inactivo mientras haya cambios sin guardar, con
  «Guardá los cambios antes de detener el timer.». Decisión del usuario del
  2026-10-04; la construye el slice 8c.
