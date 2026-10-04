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
acá quedaron para la fase 2 (PF-19). Ocultar sábado y domingo fijos sería
inventar una regla que Clockify no tiene. Ver calendario P-05.

**CAL-14 Posición inicial del desplazamiento** — `adaptar`
Al abrir, si el período visible contiene hoy, la grilla queda con la línea de
ahora una hora por debajo del borde superior —arriba de todo antes de la
01:00—; si no, con las 08:00 arriba. Se vuelve a desplazar al cambiar de
período o de vista, y no con una revalidación. **Las 08:00 son una constante
del cliente, no una preferencia** (decisión del usuario del 2026-10-04).
Justificación: ninguna fuente lo dice y 24 franjas de una hora no entran en una
pantalla.
_No verificado_: a qué hora abre Clockify la grilla. Puede ser lo que gobierna
«inicio del día» del perfil (PF-15, perfil P-02): si la verificación lo confirma
(P-07), se cambia solo la constante por esa preferencia.
_Corregido el 2026-10-04, slice 8_: decía «se desplaza para que se vea la línea
de ahora», sin decir dónde queda, y que si la verificación lo confirmaba la hora
fija pasaba a ser el ajuste del perfil. El slice 8 deja la constante; PF-15
sigue `fuera de alcance` y perfil P-02, abierto y atado a esta respuesta.

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
(TT-51) y la duración; más adelante, proyecto, tarea, etiquetas y facturable.
El mismo recuadro aparece al enfocar el bloque con el teclado (CAL-77).

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
week.» Arriba de la grilla, al lado del rótulo del rango. Con el corte de
semana de la persona, y por eso es el mismo número que el encabezado de esa
semana en el rastreador (TT-47, TT-48).
_No verificado_: dónde lo pone Clockify. En la vista día, propuesta: el total
del día, sin el de la semana.

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
abierta no tiene. La única mutación sobre sus horas es `updateRunningStart`
(TT-28), y se llega desde el diálogo (CAL-40). Un pedido de `updateEntryTimes`
que llegue igual sobre ella recibe «Esta entrada es la que está corriendo.»
(TT-111). Justificación: la mutación que existe edita solo el inicio, y un asa
que corrige el inicio sobre un bloque cuyo borde inferior avanza mientras se
arrastra es un gesto que se puede agregar después sin cambiar nada más. Ver
calendario P-03.
_No verificado_: si Clockify deja arrastrarlo.

**CAL-40 El diálogo del timer activo** — `adaptar`
Clic sobre el bloque abre el diálogo de la entrada (sección 10) con:

- la descripción, editable;
- el inicio, día y hora, editable con las reglas de TT-28, TT-29 y TT-75 —un
  inicio en el futuro se rechaza con «No se pueden cargar horas que todavía no
  pasaron.»—, TT-112 y el piso del workspace. Es la misma action que el editor
  del contador del rastreador, `updateRunningStart`;
- el fin como «En curso», sin campo;
- propuesta: un botón «Detener», que es `stopTimer` sin cambios.

Justificación: la entrada abierta tiene menos que editar que una cerrada, y sin
barra del timer en esta pantalla, sin «Detener» habría que volver al rastreador
para pararlo. Ver calendario P-06.
_No verificado_: qué ofrece el diálogo de Clockify sobre la entrada que corre,
y si su página de calendario tiene una barra de timer.

**CAL-41 Timer detenido o borrado en otra pestaña** — `adaptar`
La grilla se pone al día con la revalidación de TT-40 —al enfocar, al volver a
ser visible y cada 60 segundos— y puede seguir dibujando el bloque creciendo
hasta un minuto. Una acción sobre él antes de eso recibe «Este timer ya había
sido detenido.» (TT-41) o «Esa entrada ya no existe.» (TT-80, TT-103).
Justificación: la de TT-40.

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
Billable», y el botón «Add». En el slice 8: descripción, fecha, inicio, fin y
duración, con el botón «Agregar». Proyecto y tarea llegan con el slice 10;
etiquetas y facturable, con el 11, en el mismo diálogo. Los campos de hora y de
duración son los del modo manual, con sus formatos y su rechazo (TT-18 a
TT-21): editar la duración mueve el fin, editar inicio o fin recalcula la
duración.

**CAL-46 «Agregar» es el alta manual** — `replicar`
Crea con `createManualEntry` y valen todas sus reglas: TT-72 (fin menor que el
inicio es el día siguiente), TT-73, TT-76, TT-112 y el piso del workspace del
ADR 0005. Si falla por red vale TT-109: «No sabemos si la entrada se guardó.»,
sin «Reintentar», porque repetir duplica.

Si la fecha del diálogo se cambió a un día fuera del período visible, la
entrada se guarda igual y aparece un aviso informativo que nombra el día, con
un enlace para ir a ese período (sección 13). En el rastreador no hay un
equivalente: ahí la ventana de la lista se extiende sola hasta la semana de la
entrada y no hay aviso (TT-108, P-15). Acá el período visible lo elige la
persona y el remedio es cambiar de semana, así que el aviso y su texto son
propios del calendario.
_Corregido el 2026-10-03, slice 5_: decía «No es TT-108: ese aviso habla de los
días que la lista dibuja», y el aviso de TT-108 se retiró.

**CAL-47 Crear con un timer corriendo** — `adaptar`
Propuesta: se rechaza, con el texto de TT-30, «Detené el timer para agregar
tiempo a mano.» El clic en una franja libre abre el diálogo con ese aviso y
«Agregar» deshabilitado. Es la validación que `createManualEntry` ya hace.
Clockify documenta: «Make sure to stop an active timer before creating a time
entry in the calendar to avoid overlaps that cause conflict», que se lee como
una recomendación y no como un bloqueo. Justificación: abrir una excepción haría
que la misma entrada se pueda crear desde el calendario y no desde el modo
manual. **Es una divergencia si Clockify lo permite.** Ver calendario P-01.

**CAL-48 Días anteriores a la creación del workspace** — `adaptar`
Se dibujan atenuados y no admiten crear ni soltar un bloque. Un pedido que
llegue igual recibe «No se pueden cargar horas anteriores a la creación del
workspace.» (ADR 0005). Justificación: el piso es nuestro; atenuar evita
ofrecer un gesto que el servidor va a rechazar.

**CAL-49 Cancelar** — `replicar`
Cerrar el diálogo o `Esc` descarta el borrador: no queda nada guardado ni
ninguna selección dibujada.

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
(TT-72) y pasa a dibujarse en dos segmentos (CAL-26). Estirar el fin hasta el
final de la columna da las 00:00 del día siguiente; para seguir estirando, se
arrastra el borde del segmento de la columna siguiente. No es una divergencia:
el trío lo expresa.

**CAL-55 Ni mover ni estirar llega a 24 horas de reloj** — `adaptar`
**Divergencia.** El gesto se detiene antes de que la distancia de reloj llegue a
24 horas: con el ajuste de CAL-53, el último valor que ofrece es 24 horas menos
una franja. Vale para los dos bordes y para los dos segmentos de una entrada
que cruza la medianoche. Clockify no tiene tope (TT-74) y es probable que lo
permita. Justificación: es TT-110 desde el otro lado. Un fin a las 10:00 del
día siguiente de un inicio a las 10:00 llega al servidor como un trío de
duración cero y se rechaza con TT-73; uno a las 11:00 se lee como una entrada
de una hora. Ofrecer el gesto y que el servidor entienda otra cosa es truncar
en silencio. **Cómo se cierra**: con el editor de fecha de fin que TT-110 ya
nombra.
_No verificado_: si Clockify deja estirar un bloque a más de 24 horas.

**CAL-56 Mínimo una franja** — `adaptar`
El gesto no deja un bloque de menos de una franja del zoom, y un borde no pasa
del otro: el bloque no se invierte. Un pedido que llegue igual por debajo del
minuto recibe «La entrada tiene que durar al menos un minuto.» (TT-73).
Justificación: con el ajuste a la franja, menos de una franja es cero.

**CAL-57 Soltar donde estaba no escribe** — `adaptar`
Si el trío que resulta del gesto es el mismo que el de la entrada, no hay
pedido. Justificación: diseño propio, como el editor del inicio del timer del
slice 3.

**CAL-58 Una entrada que el trío no puede expresar no se arrastra** — `adaptar`
**Divergencia**, la de TT-110. Un bloque con `editableTimes` en falso no tiene
asas y no se mueve; su detalle y su diálogo muestran «Esta entrada dura más de
un día; sus horarios no se pueden editar acá.», y en el diálogo fecha, inicio y
fin quedan en solo lectura. La descripción se sigue editando, y se puede
duplicar y borrar. Lo decide el servidor, como en la fila. Justificación: la de
TT-110. En Clockify no hay excepciones por duración.
_No verificado_: si Clockify deja arrastrar un bloque de más de 24 horas.

**CAL-59 Soltar en la hora que no existe** — `adaptar`
La franja atenuada de CAL-30 no admite soltar. Un pedido que llegue igual
—un estiramiento cuyo borde cae ahí, por ejemplo— se rechaza con «Esa hora no
existe por el cambio de horario.» (TT-112) y el bloque vuelve a su lugar.
Justificación: la de TT-112.

**CAL-60 Soltar sobre otra entrada** — `replicar`
Se permite, sin aviso (TT-82), y las dos pasan a dibujarse lado a lado (CAL-25).

**CAL-61 Mover a otra semana** — `adaptar`
El arrastre se limita a las columnas visibles. Para llevar una entrada a otra
semana se cambia la fecha en el diálogo. Justificación: que la grilla avance
sola al arrastrar contra un borde no está documentado y complica el gesto; el
diálogo ya lo resuelve. Si la entrada queda fuera del período visible, vale el
aviso de CAL-46.
_No verificado_: si Clockify deja arrastrar a otra semana.

**CAL-62 Guardado al soltar** — `adaptar`
El bloque queda en su lugar nuevo, atenuado, mientras la escritura está en
vuelo, como la fila de TT-55. Si falla, vuelve a su lugar y aparece el aviso de
dos partes de TT-90 con el título **«No se pudo guardar el horario de la
entrada.»**, el mismo de la edición en línea: es la misma mutación y la misma
causa. Con error de red ofrece «Reintentar» (TT-89), que acá es seguro porque
`updateEntryTimes` es idempotente (contrato del slice 3, §4.4). Justificación:
Clockify reintenta solo; acá no hay cola.

**CAL-63 `Esc` cancela un arrastre** — `adaptar`
Con el arrastre en curso, `Esc` devuelve el bloque a su lugar sin escribir.
Justificación: diseño propio.

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

**CAL-67 «Guardar», todo o nada** — `adaptar`
Propuesta: un botón «Guardar» aplica todos los cambios del diálogo juntos, o
ninguno. Cerrar el diálogo con cambios sin guardar los descarta sin preguntar.
La página de dividir describe una ventana de edición que se confirma con
«Save», así que el botón es lo que Clockify hace, al menos ahí. Justificación de
`adaptar`: **diverge a propósito del guardado por campo de la fila (TT-55)**,
porque un diálogo con varios campos y un botón que guardara solo algunos se
lee como roto.

Tiene una consecuencia de construcción que no es de paridad y que el contrato
del slice tiene que resolver: hoy la descripción y las horas se escriben con dos
mutaciones distintas (`updateDescription`, `updateEntryTimes`), y dos pedidos
seguidos no son todo o nada. Ver calendario P-04.
_No verificado_: si el diálogo de Clockify guarda con botón o por campo, y qué
hace al cerrarse con cambios.

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

**CAL-76 Estructura de la grilla** — `adaptar`
Los encabezados de columna —día y total— quedan asociados a sus bloques, y
`Tab` recorre los bloques en orden cronológico. La línea de ahora es decorativa
para los lectores de pantalla. Las franjas libres no son controles: el alta por
teclado va por el botón de CAL-74. Justificación: una grilla de 168 franjas
enfocables vuelve inusable la navegación con `Tab`.

**CAL-77 El detalle se muestra también con el foco** — `adaptar`
El recuadro de CAL-23 aparece al enfocar el bloque, no solo al pasar el
puntero, y se cierra con `Esc`. Justificación: lo que solo se ve con el puntero
no existe para el teclado.

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

- Crear con un timer corriendo: «Detené el timer para agregar tiempo a mano.»
  (TT-30). En CAL-47.
- Menos de un minuto: «La entrada tiene que durar al menos un minuto.» (TT-73).
  En CAL-56.
- Inicio del timer activo en el futuro: «No se pueden cargar horas que todavía
  no pasaron.» (TT-75). En CAL-40.
- Hora que no existe por el cambio de horario: «Esa hora no existe por el
  cambio de horario.» (TT-112). En CAL-30 y CAL-59.
- Antes de la creación del workspace: «No se pueden cargar horas anteriores a
  la creación del workspace.» (ADR 0005). En CAL-48.
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
- Agregar desde el diálogo: «No se pudo agregar la entrada.» y, por red, el de
  TT-109.
- Corregir el inicio del timer: «No se pudo guardar el inicio del timer.»
- Detener desde el diálogo: «No se pudo detener el timer.»
- Borrar: «No se pudo borrar la entrada.»

Textos nuevos, uno por causa nueva:

- **CAL-46**, la entrada creada o editada quedó fuera del período visible:
  «La entrada quedó el `<día>`, fuera de la semana que estás viendo.», con el
  enlace «Ir a esa semana». En la vista día, «fuera del día que estás viendo».
- **CAL-67**, falló «Guardar» del diálogo: «No se pudo guardar la entrada.» Es
  nuevo porque nombra otra acción: el diálogo guarda la entrada entera, no solo
  su horario ni solo su descripción.

## 14. Estados vacíos

**CAL-84 Período sin entradas** — `adaptar`
La grilla se dibuja vacía, con los totales en `0:00`, sin ilustración y sin
saltar a otro período. Vale también para una persona sin ninguna entrada.
Justificación: la grilla es un período fijo y vacía también sirve, para crear;
es lo contrario de la lista, que salta la semana vacía (TT-86), y está bien que
lo sea.
_No verificado_: qué muestra Clockify con la semana vacía.

**CAL-85 Período anterior a la creación del workspace** — `adaptar`
Se dibuja entero atenuado, por CAL-48. Justificación: la de CAL-48.

## 15. Estados de error

**CAL-86 Red, sesión y membresía** — `adaptar`
Valen TT-89, TT-90 y TT-92: aviso de dos partes con «Reintentar» solo por red,
salvo en el alta (TT-109), y membresía desactivada en solo lectura, con el
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
segundos mientras está visible. Una revalidación que llega con un arrastre en
curso se aplica al soltar, no en medio del gesto. Justificación: no hay canal
abierto; mover un bloque debajo del puntero es peor que mostrarlo un instante
desactualizado.

## 17. Casos borde

**CAL-90 Entrada de segundos producida por el timer** — `adaptar`
Se dibuja con la altura mínima (CAL-24) y se estira. El inicio conserva sus
segundos; si el par queda en menos de un minuto, el descarte del ADR 0006
recalcula los dos extremos. Justificación: consecuencia del ADR 0006.

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
al día al revalidar. Justificación: sin canal abierto (TT-40) no hay forma de
avisarle a la otra.

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
CAL-23, CAL-66, CAL-75) entraron con él. Lo que falta:

- **Slice 8c.** El proyecto y la tarea en el diálogo de alta y editables en el
  de una entrada (CAL-45, CAL-66).
- **Slice 11.** Etiquetas y facturable en el detalle y los diálogos, y el ícono
  de facturable en el bloque. Dos campos más del diálogo.
- **Slice 12.** Nada.

**El proyecto no toca la geometría de la grilla**: posición, altura,
superposición y gestos no dependen de él. Una entrada sin proyecto se dibuja con
el relleno neutro y es válida en todo el recorrido (CAL-91).

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

## 19. Impacto sobre lo ya construido

Lo que el contrato del slice 8 va a tener que mirar. No es diseño: es lo que el
relevamiento obliga.

- **Una lectura nueva del módulo `time-entry`.** El calendario necesita las
  entradas que se superponen con el período, más el timer activo (CAL-28);
  `getTrackerState` lee por día de inicio y con otra ventana.
- **`editableTimes`** ya existe en `TimeEntryView` y es lo que decide si un
  bloque tiene asas (CAL-58). Ningún componente lo recalcula.
- **`updateDescription` y `updateEntryTimes`.** Si P-04 se cierra a favor del
  todo o nada, hace falta una forma de escribir las dos cosas en una
  transacción, que hoy no existe.
- **`createManualEntry`** no cambia: el alta del calendario es esta action, con
  TT-30 incluido salvo que P-01 diga otra cosa.
- **La conversión de los gestos al trío** sale de horas de pared ajustadas al
  zoom y de `shiftClock`, sin aritmética de instantes en el cliente
  (ADR 0005).
- **Las franjas que no existen** (CAL-30): el cliente no sabe de husos
  (ADR 0005), así que qué hora del día no existe tiene que llegar del servidor
  junto con el período.
- **`src/components/layout/app-nav.tsx`** suma la entrada «Calendario»
  (CAL-01).

**Lo que no se toca**: el esquema, los permisos y las reglas del ADR 0005 y del
ADR 0006. El calendario no agrega columnas ni acciones de permiso.

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

### Lo que queda

- **Slice 8c, la escritura**
  ([fase1-slice8c-calendario-escritura.md](../slices/fase1-slice8c-calendario-escritura.md)):
  crear desde la grilla y con «Agregar entrada» (CAL-43, CAL-45 a CAL-47, el
  clic sin efecto de CAL-48 y de la franja que no existe de CAL-30, CAL-49 y el
  botón de CAL-74); el diálogo editable, con «Guardar», «Detener», duplicar y
  borrar (CAL-40, CAL-58 en su parte de diálogo, CAL-65 a CAL-70, CAL-72); la
  segunda oración de CAL-41; los avisos de dos partes de CAL-86; CAL-92 por el
  diálogo; CAL-97 a CAL-99; y los controles de escritura de CAL-05. Ahí se
  registran P-01, P-04 y P-06.
- **Slice 8b, el arrastre** (esbozo en §8 del contrato del 8c, después del 8c):
  crear arrastrando (CAL-44), mover y estirar (CAL-50 a CAL-57), las asas de
  CAL-58, CAL-59 a CAL-64, el «ni soltar» de CAL-30 y CAL-48, la segunda
  oración de CAL-89, «se estira» de CAL-90 y CAL-100.
- **Fuera de los tres**: P-03 (CAL-39) y P-05 (CAL-13), abiertos con su
  propuesta. La ruta de vuelta después del acceso (CAL-86, TT-91) no existe en
  ninguna pantalla.

## Pendientes de definición del equipo

Numeración propia de este documento. Para no confundirla con la del
rastreador, de proyectos y del perfil, se cita como `calendario P-nn`.

### Abiertos

Todos tienen una propuesta escrita en el comportamiento que citan. Ninguno
bloquea el arranque del contrato, pero los tres primeros cambian lo que el
contrato tiene que decir.

- **P-01 Crear con un timer corriendo** (CAL-47). Propuesta: se rechaza con el
  texto de TT-30, como el modo manual. Clockify lo desaconseja, pero no está
  claro que lo bloquee. Si se permite, `createManualEntry` necesita una
  excepción por origen, y la misma entrada se podría crear desde una pantalla y
  no desde la otra.
- **P-03 Arrastrar el inicio del timer activo** (CAL-39). Propuesta: en el
  slice 8 no; el inicio se corrige desde el diálogo. Agregar el asa después no
  cambia ninguna otra regla.
- **P-04 «Guardar» todo o nada en el diálogo** (CAL-67). Propuesta: sí, con
  botón, como Clockify. Obliga a escribir descripción y horario en una
  transacción, que hoy son dos mutaciones. La alternativa —que cada campo del
  diálogo se guarde solo, como la fila— reusa todo lo que hay y diverge del
  diálogo de Clockify.
- **P-05 Mostrar solo días laborables** (CAL-13). Propuesta: fuera hasta que
  existan los días laborables por persona (PF-19, fase 2). La alternativa
  —ocultar sábado y domingo fijos— es una regla que Clockify no tiene.
- **P-06 «Detener» en el diálogo del timer activo** (CAL-40). Propuesta: sí,
  con `stopTimer` sin cambios. Sin él, parar el timer desde el calendario
  obliga a volver al rastreador.
- **P-07** La lista de verificación contra el workspace real, abajo.

_Corregido el 2026-10-04, slice 8_: P-02 pasó a «Cerrados».

Y uno que no es de este documento pero se cruza: **perfil P-02**, «inicio del
día» (PF-15). El slice 8 no lo cierra: la grilla abre con las 08:00 arriba como
constante del cliente (CAL-14). Si la verificación de CAL-14 muestra que esa
hora es «inicio del día», se cambia solo la constante por la preferencia; si no
tiene que ver con el calendario, se cierra solo, como prevé el perfil.
_Corregido el 2026-10-04, slice 8_: decía que perfil P-02 quedaba apuntado a
este slice y se cerraba en él si la verificación lo confirmaba.

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
  la semana actual y en una pasada? Cambiar «inicio del día» en el perfil:
  ¿cambia esa hora? Esta respuesta cierra también perfil P-02.
- **CAL-15, CAL-16** — ¿Qué controles de navegación hay —flechas, «Hoy»,
  selector de fecha— y cómo se rotula el rango visible?
- **CAL-21, CAL-22** — ¿Qué muestra un bloque? ¿De qué color es un bloque sin
  proyecto, y uno con proyecto?
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
  selección pasar de una columna a otra? **(divergencia)**
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

### Cerrados

Se dejan con su identificador porque el documento y los contratos los citan.

- **P-02 Total del día de una entrada que cruza la medianoche** (CAL-32). Cada
  entrada cerrada suma entera en el día de su inicio, como en la lista; la
  columna siguiente dibuja horas que su total no cuenta. CAL-32 queda como
  estaba. Vale también para el período: una entrada que empezó antes del
  primer día dibuja su segmento y no suma a ningún total visible, y el timer
  suma solo en la columna y el período de su día de inicio (CAL-34, CAL-93).
  Decisión del usuario del 2026-10-04; la construye el slice 8.
