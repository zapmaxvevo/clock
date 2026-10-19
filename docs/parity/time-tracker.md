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
- https://clockify.me/help/track-time-and-expenses/categorizing-time-entries
- https://clockify.me/help/administration/hourly-rates (facturable, de plan pago)
- https://clockify.me/help/users/user-settings
- https://docs.clockify.me/ (endpoints de time entry)

_Agregado el 2026-10-05, slice 11_: las páginas de etiquetas y de tarifas,
consultadas ese día para TT-12, TT-13, TT-14, TT-57 y TT-88.

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
| El timer ya se detuvo                  | «Este timer ya había sido detenido.»                | TT-41, TT-65                                                          |
| La entrada pedida es la que corre      | «Esta entrada es la que está corriendo.»            | TT-111, TT-58 al duplicar la entrada que corre                        |

_Agregado el 2026-10-03_: las filas de «Este timer ya había sido detenido.» y
de «Esta entrada es la que está corriendo.», que desde el slice 4 aparecen en
más de un lugar.

_Agregado el 2026-10-04, slice 6_: las operaciones en masa (TT-63, TT-64)
rechazan cada entrada con el texto de su operación de una fila, así que todas
sus causas aparecen también ahí. No se repiten en la tabla; la lista está en
TT-63.

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

**TT-02 Zona horaria y formatos** — `replicar`
Clockify resuelve el día, el formato de hora (12 h/24 h) y el formato de fecha
con ajustes por usuario, y el inicio de semana con un ajuste que fija el admin
en el perfil de la persona. Acá también: la zona horaria, el formato de hora y
el de fecha son los que la persona elige en `/perfil` (PF-11, PF-12 y PF-13 de
[la paridad del perfil](perfil.md)), y el primer día de la semana es el de su
membresía (TT-48). Los cortes de día y de semana salen de `src/server/time` con
la zona de la persona. Quien nunca tocó su perfil ve los predeterminados de
perfil P-03 —`America/Argentina/Buenos_Aires`, 24 h y `dd/MM/yyyy`—, que dan
los mismos rótulos que antes del slice 7. `workspace.timezone` no cambia nada
de esta pantalla: solo fija el día de los trabajos de cron (PF-05).
Cómo viaja una hora tecleada desde el navegador hasta el instante guardado está
en el [ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md), que no
cambia: la hora viaja como `HH:mm` de 24 h aunque la persona vea 12 h, y lo
único distinto es con qué zona se convierte. Cómo llegan los formatos a lo que
se dibuja en el navegador está en el
[ADR 0012](../adr/0012-un-solo-juego-de-formatos.md).

_Corregido el 2026-10-04, slice 7_: era `adaptar` y decía que se usaban la zona
horaria del workspace, formato 24 h y fecha `dd/MM`, porque el modelo de datos
no tenía los campos por usuario y el equipo había cerrado P-13 a favor del
workspace. Lo fija el
[contrato del slice 7](../slices/fase1-slice7-perfil.md), que cierra P-13.

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

**TT-07 Buscador del selector** — `adaptar`
Al abrir, un popover con un buscador arriba y la lista de proyectos agrupados
por cliente, con «Sin cliente» al final (PR-97). En Clockify los proyectos con
tareas se expanden para elegir una tarea; acá **las tareas se listan siempre
debajo de su proyecto**, con sangría y sin un control para expandirlas. Un
proyecto sin tareas no trae opciones de tarea (PR-87). El buscador filtra por
nombre de proyecto, de cliente y de tarea.
Justificación: un elemento que se expande dentro de un `listbox` no tiene rol
accesible, y la alternativa —una grilla con una celda de expansión por fila—
cuesta un patrón de teclado propio para workspaces que, en el plan Free, son
chicos (PR-110). Si con proyectos de muchas tareas la lista pesa, la grilla es
el camino.

_Agregado el 2026-10-04_. Diseño propio, fijado en el
[contrato del slice 10](../slices/fase1-slice10-selector-de-proyecto.md): la
documentación no describe cómo busca el selector.

- **La búsqueda no distingue mayúsculas ni acentos**: «diseno» encuentra
  «Diseño».
- **Lo que trae cada coincidencia.** Un cliente que coincide trae todos sus
  proyectos con todas sus tareas; un proyecto que coincide, todas sus tareas;
  una tarea que coincide, su proyecto con las tareas que coinciden.
- **«Sin proyecto» (TT-10) es la primera opción y solo aparece con la búsqueda
  vacía.** Con el catálogo vacío también se ofrece (TT-87).
- **La búsqueda es en el navegador, sobre el catálogo entero** que trae la
  pantalla (PR-110 de [la paridad de proyectos](proyectos.md)).
- **Sin coincidencias**, el selector muestra «Ningún proyecto coincide con la
  búsqueda.»
- **La selección actual se marca**, salvo que no esté en el catálogo —el
  proyecto archivado de una entrada (TT-104)—: ahí no se marca ninguna.

_Corregido el 2026-10-04, slice 10 (decisión del equipo)_: era `replicar` y
decía que los proyectos con tareas se expanden para elegir una tarea.

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

**TT-12 Selector de etiquetas** — `adaptar`
Ícono de etiqueta; abre un popover con buscador y casillas de selección
múltiple. Con etiquetas elegidas el ícono se marca y el botón muestra sus
nombres, recortados si no entran. Documentado, en la página de etiquetas:
«Click tag icon on a time entry»; el resto se ve en el producto y no está
escrito. Justificación: en Clockify el botón muestra la cantidad o los nombres,
según entren, y elegir entre las dos midiendo el ancho no es predecible; los
nombres recortados, con el nombre accesible entero, se leen igual siempre.

_Agregado el 2026-10-05_. Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): la
documentación no describe el selector.

- **El botón.** Sin etiquetas, el ícono de etiqueta y, en la barra, «Etiquetas»;
  en la fila, solo el ícono, en gris (TT-50). Con etiquetas, el ícono marcado y
  los nombres en orden alfabético, separados por coma y recortados con elipsis
  si no entran. Su nombre accesible suma todos los nombres.
- **La búsqueda es la de TT-07**: no distingue mayúsculas ni acentos, y filtra
  en el navegador sobre el catálogo entero de etiquetas activas. Sin
  coincidencias, «Ninguna etiqueta coincide con la búsqueda.»
- **En una entrada que ya existe** —la que corre o una fila— **se guarda al
  cerrar el selector**, con el conjunto entero y solo si cambió. Cada casilla
  marca o desmarca sin cerrar. `Escape`, un clic afuera y `Tab` cierran, y
  también guardan: cada casilla marcada ya es una elección hecha a la vista.
  Con la barra sin timer y en los diálogos del calendario, el selector cambia
  lo que viaja con «Iniciar», «Agregar» o «Guardar».
- **Una etiqueta archivada que la entrada ya tiene** aparece marcada, con
  «(archivada)» después del nombre (PR-47 de
  [la paridad de proyectos](proyectos.md)).
- **Hasta 50 etiquetas por entrada** (PR-48).
- **Con la membresía desactivada** (TT-92), los nombres como texto, sin
  selector; sin etiquetas, nada.

_No verificado_ (P-14): cómo muestra Clockify el botón con varias etiquetas,
cómo busca, y si guarda con cada casilla o al cerrar. La página de edición dice
«Changes are automatically saved as you make them.», que no distingue entre las
dos. Si guarda con cada casilla, el guardado al cerrar pasa a ser parte de la
adaptación, con la justificación de TT-55: cambiar cinco etiquetas es un
pedido, no cinco.

_Corregido el 2026-10-05, slice 11_: era `replicar` y decía que el botón
muestra «la cantidad o los nombres si entran».

_Agregado el 2026-10-07, slice 11b_. Lo que el slice construyó además de lo
registrado, fijado en las correcciones del
[arranque](../slices/correcciones-fase1-slice11b-arranque.md) y de las
[revisiones](../slices/correcciones-fase1-slice11b-revisiones.md) del 11b:

- **Cada opción lleva una casilla**, vacía o marcada. Para el lector de
  pantalla, la marca es el estado seleccionado de la opción; la casilla es solo
  lo que se ve.
- **El teclado.** Al abrir, el foco va al buscador, «Buscar etiqueta», y se
  queda ahí: las flechas mueven el resaltado entre las opciones, **Enter marca
  o desmarca la resaltada sin cerrar**, y **Espacio escribe en la búsqueda**,
  porque los nombres de etiqueta llevan espacios. Escribir resalta la primera
  coincidencia, así que el nombre seguido de Enter la marca sin pasar por las
  flechas. Los atajos de una tecla no se disparan adentro (TT-26). Al cerrar,
  el foco vuelve al botón.
- **Marcar no borra la búsqueda**: solo la cambia lo que se escribe, así la
  etiqueta siguiente se busca con el mismo filtro. Al volver a abrir, la
  búsqueda empieza vacía.
- **`Escape` cierra solo el selector, también con la lista vacía** —sin
  etiquetas o sin coincidencias—. Dentro del diálogo del calendario, el diálogo
  sigue abierto con su borrador (CAL-67 de
  [la paridad del calendario](calendario.md)).
- **El botón mide como máximo 160 px**, y lo que no entra se recorta con
  elipsis. En la fila, su nombre accesible es «Etiquetas de la entrada
  «{descripción o Sin descripción}»», con «: » y los nombres si hay. Con la
  membresía desactivada, los nombres llevan delante «Etiquetas: » solo para el
  lector de pantalla, porque el ícono no dice qué son.
- **Mientras viaja un cambio de proyecto, de facturable o de etiquetas** de la
  misma entrada —en la fila, cualquier escritura de esa fila—, el botón queda
  inactivo y el selector no abre, como los otros dos controles (TT-14): lo que
  se ve es lo que queda escrito. Si el cambio de etiquetas falla, la entrada
  vuelve a las de antes con «No se pudieron cambiar las etiquetas.» (TT-90) y
  «Reintentar» por red (TT-89).
- **Si el timer cambia con el selector de la barra abierto** —otra pestaña lo
  detuvo o arrancó otro, y esta se puso al día (TT-40)—, cerrarlo descarta lo
  elegido y no manda nada: era para la entrada sobre la que se abrió.
- **Una etiqueta archivada** que la entrada ya tiene va, además, en gris
  (PR-47).

_No verificado_ (P-14), además de lo anterior: si las opciones de Clockify
llevan casilla, qué hacen Enter y Espacio en su selector, y si la búsqueda
queda después de marcar. Consultada de nuevo el 2026-10-07, la página de
etiquetas no describe las casillas, las teclas, la búsqueda después de marcar,
cuándo se guarda ni cómo se ve el botón con varias etiquetas. La región del
vacío, el botón inactivo en vuelo, el descarte con el timer cambiado y el
nombre para el lector de pantalla son diseño propio sin referencia: no se
comparan contra Clockify.

**TT-13 Crear etiqueta desde el selector** — `fuera de alcance`
Igual que TT-09: pertenece al módulo de etiquetas.
_Agregado el 2026-10-05_. Documentado: se escribe el nombre en el selector y se
elige «Create tag» o `Ctrl + Enter`. En la fase 1 las etiquetas se crean en
`/proyectos` (TT-88).

### 2.4 Facturable

**TT-14 Marca de facturable** — `replicar`
Ícono de signo de moneda que alterna entre facturable y no facturable. El
estado por defecto lo decide el proyecto elegido: si el proyecto es facturable,
la entrada arranca facturable. Sin proyecto, arranca no facturable.

_Agregado el 2026-10-05_. Relevamiento, de plan pago: la página de tarifas dice
«Enable billable rate by clicking on the **$** icon on your time entry in the
Time Tracker page.», y que proyectos y tareas tienen un facturable por defecto,
«which means all new entries will initially be set according to what you
choose.» La del calendario lo llama «A toggle used to indicate whether the time
spent should be charged to a client». Ninguna dice qué pasa al cambiarle el
proyecto a una entrada que ya existe. Como todo el facturable, no se puede
verificar en el plan Free (P-16 de [la paridad de proyectos](proyectos.md)), así
que no entra en P-14.

Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md):

- **El control** es un botón de alternancia con el ícono de moneda y
  `aria-pressed`. Su nombre accesible es «Facturable» en la barra y en el
  diálogo del calendario, y «Entrada «{descripción o Sin descripción}»
  facturable» en la fila. No facturable, el ícono va sin marcar (TT-50). Con la
  membresía desactivada (TT-92), una entrada facturable muestra el ícono, con
  el nombre «Facturable», y una no facturable no muestra nada.
- **Al cambiar el proyecto de una entrada que ya existe, elegir otro proyecto
  le impone su facturable por defecto**; «Sin proyecto» y cambiar solo la
  tarea lo conservan. Después se puede cambiar a mano. Vale igual en la barra
  sin timer, con el timer corriendo, en la fila y en el diálogo del calendario,
  así que iniciar y elegir el proyecto después da la misma entrada que elegirlo
  antes. Si en el diálogo la persona cambia el proyecto y el facturable a la
  vez, gana el facturable que dejó a la vista. Decisión del equipo del
  2026-10-05.
- **Continuar y duplicar copian el facturable de la original** (TT-57, TT-58),
  aunque su proyecto haya cambiado de valor por defecto después.

Justificación de la regla del proyecto: lo más común en el rastreador es
iniciar y elegir el proyecto después; si el facturable se decidiera solo al
crear, esa entrada quedaría no facturable aunque el proyecto lo sea, y habría
que acordarse de marcarla cada vez.

_Agregado el 2026-10-05, slice 11a_: marcado, el ícono cambia de forma —la
moneda pasa a ir dentro de un círculo— además de color, así el estado no se lee
solo por el color (WCAG 1.4.1). En el diálogo del calendario el control lleva
además el nombre «Facturable» a la vista, al lado del ícono (CAL-66 de
[la paridad del calendario](calendario.md)). Diseño propio, como el resto del
control.

**TT-15 La marca no muestra importes** — `adaptar`
En Clockify la facturabilidad alimenta tarifas e importes, que no existen en el
plan Free y no se relevaron. Acá la marca es solo un booleano visible en la
entrada. Justificación: las tarifas quedan pendientes (P-01).

### 2.5 Modo timer y modo manual

**TT-16 Conmutador de modo** — `adaptar`
A la derecha de la barra, dos íconos: reloj (modo timer) y lista (modo manual).
El modo elegido se recuerda entre visitas. Acá se recuerda por navegador, en
una cookie, y no por persona: no viaja entre dispositivos. Justificación: es
una preferencia de cómo se carga en ese navegador, no un dato de la cuenta, y
llevarla al perfil pide una migración y una mutación más sin cambiar nada de
lo que se ve; la cookie además se lee en el servidor sin consultar la base.
_No verificado en documentación pública_: que Clockify lo recuerde por cuenta y
no por navegador es una suposición, no un relevamiento.
_Corregido el 2026-10-04_: la justificación decía «no hay perfil todavía;
cuando exista es un campo más». El perfil existe desde el slice 7 y el modo
queda en la cookie por decisión del equipo; no entra en el 7b.

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
replican todos, y lo que se acepta depende del formato de hora de la persona
(PF-13 y PF-14 de [la paridad del perfil](perfil.md)):

- **Sin sufijo, la misma regla en los dos formatos**: `1` → 01:00, `0345` →
  03:45, `930` → 09:30, `9.45` y `9:45` → 09:45, `13:00` → 13:00. Con 12 h, un
  texto sin sufijo se lee como hora de 24 h.
- **Con 24 h, todo sufijo se rechaza**: `1pm` no se acepta, porque `pm` no
  tiene dónde mostrarse.
- **Con 12 h se acepta el sufijo** `a`, `am`, `p` o `pm`, en mayúsculas o
  minúsculas, con o sin puntos, con o sin espacio antes y con o sin espacio
  entre las dos letras. Con sufijo, la hora tiene que ir de 1 a 12.

| Texto                                    | 24 h      | 12 h      |
| ---------------------------------------- | --------- | --------- |
| `1pm`, `1 PM`, `1p`, `1 p.m.`, `1 p. m.` | rechazado | `13:00`   |
| `9am`, `9 a. m.`                         | rechazado | `09:00`   |
| `1:30pm`, `130pm`                        | rechazado | `13:30`   |
| `1:05 PM`                                | rechazado | `13:05`   |
| `12am`                                   | rechazado | `00:00`   |
| `12pm`                                   | rechazado | `12:00`   |
| `13pm`, `0am`                            | rechazado | rechazado |

- **Lo que el campo muestra, el campo lo acepta.** Con 12 h, el campo muestra
  `h:mm AM` / `h:mm PM` (`12:00 AM`, `1:05 PM`, PF-13), y ese texto vuelve a dar
  la misma hora para los 1440 minutos del día: salir de un campo sin cambiarlo
  nunca rechaza su propio valor.
- **Con 12 h, el teclado del teléfono deja escribir letras**; con 24 h, y en el
  campo de duración, sigue el numérico.
- **Vale en los tres campos de hora**: la barra manual (TT-18), el editor de la
  fila (TT-54) y el del inicio del timer (TT-28). Lo rechazado vuelve al valor
  anterior, como cualquier texto que no se puede interpretar (TT-21).

Justificación: el `1pm` de Clockify se replica con 12 h y se rechaza con 24 h,
donde no hay forma de mostrarlo; las variantes con puntos y espacios
(`1 p. m.`) son nuestras, por la forma en español. Diseño propio, fijado en el
[contrato del slice 7](../slices/fase1-slice7-perfil.md).
_No verificado_: si Clockify acepta `1pm` también con el formato de 24 h, y qué
hace con `12am` y `13pm`. Confirmar en el workspace del equipo (P-14).

_Corregido el 2026-10-04, slice 7_: decía que no se aceptaba `am`/`pm` porque
la interfaz era de 24 h (TT-02). Con el formato de hora elegible, esa
justificación vale solo para las 24 h.

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

_Agregado el 2026-10-03_. Diseño propio, fijado en el
[contrato del slice 4](../slices/fase1-slice4-continuar-duplicar.md):

- **Dónde más no se disparan.** Además de con el foco en un campo de texto, los
  atajos no hacen nada con una tecla modificadora apretada (Ctrl, Meta, Alt o
  Shift), con la tecla mantenida, durante una composición de texto (IME), y con
  el foco dentro de un diálogo, un menú abierto, el calendario o uno de los
  editores de horas de la fila y del inicio del timer (TT-28, TT-54).
- **Se pueden apagar** — divergencia `adaptar`. El diálogo «Atajos de
  teclado», que abre el botón del mismo nombre al lado del conmutador de modo,
  lista los cuatro atajos y tiene el interruptor «Usar atajos de una tecla».
  La preferencia se guarda en `localStorage`, por navegador, como el modo de
  TT-16: no viaja entre dispositivos. Con el almacenamiento del sitio
  bloqueado no se pueden apagar, porque la preferencia que no se puede leer
  vale «activos». Justificación: WCAG 2.1.4 pide que un atajo de una sola
  tecla se pueda desactivar o reasignar, y Clockify no documenta ninguna forma
  de hacerlo.
- **Qué es «el último» para `c`.** La entrada cerrada más reciente que ya
  empezó: no una con fecha futura (P-10, TT-76) ni el timer activo, que no es
  una entrada cerrada (TT-111). Con dos que empiezan en el mismo instante, la
  que la lista dibuja primero. Sin entradas cerradas que ya empezaron, `c` no
  hace nada.
  _No verificado_: la documentación de Clockify dice solo «continue last», sin
  precisar cuál. Confirmar en el workspace del equipo (P-14).

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
tiempo a mano.» lo explica. Es una regla de la interfaz del rastreador, no del
servidor: `createManualEntry` acepta el alta con un timer abierto, venga de
donde venga (calendario P-01), y la entrada cerrada que se superpone con el
timer es válida (TT-82). Una pestaña desactualizada, que todavía no vio un
timer arrancado en otro lado —hasta 60 s, por P-11—, agrega la entrada.
_Corregido el 2026-10-04, slice 8c_: decía que era el mismo texto con el que
respondía la validación del servidor cuando el pedido llegaba igual desde una
pestaña desactualizada. El slice 8c sacó ese rechazo: crear desde el
calendario con un timer corriendo se permite (calendario P-01), y el servidor
no distingue de dónde viene el alta.

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
la fecha. Acá: «Hoy», «Ayer» y, para el resto, el día de la semana abreviado y
la fecha en el formato de la persona (PF-12): `sáb, 03/10` con `dd/MM/yyyy`,
`sáb, 10-03` con `yyyy-MM-dd`. La fecha va en la forma corta, sin año, cuando
el día es del año en curso, y en la larga, con año, cuando no. Justificación:
formato de fecha en español. El rótulo tiene una sola implementación y la
comparten el encabezado de día y el botón del selector de fecha de la barra
manual.

| Formato      | Con año      | Sin año |
| ------------ | ------------ | ------- |
| `dd/MM/yyyy` | `03/10/2026` | `03/10` |
| `dd-MM-yyyy` | `03-10-2026` | `03-10` |
| `yyyy-MM-dd` | `2026-10-03` | `10-03` |
| `MM/dd/yyyy` | `10/03/2026` | `10/03` |

Las formas cortas son decisión nuestra, sin verificar (perfil P-09). Con el
predeterminado, `dd/MM/yyyy`, el rótulo es el de antes del slice 7.
_No verificado_: un día posterior a hoy se rotula con su fecha. Si Clockify
usa un rótulo propio para mañana, no está documentado; confirmar en el
workspace del equipo (P-14).

_Corregido el 2026-10-04, slice 7_: daba la fecha siempre como `mié, 01/10`;
desde el slice 7 sigue el formato de fecha de la persona.

**TT-52 Ventana y paginación de la lista** — `adaptar`
Clockify carga más entradas al bajar y así alcanza cualquier día del pasado.
Acá la lista se dibuja en semanas enteras y crece hacia atrás con un enlace
«Cargar más». Justificación: el scroll infinito en un Server Component paginado
complica la revalidación sin aportar a la fase 1; con la ventana en la URL, la
recarga y la revalidación la conservan
([ADR 0008](../adr/0008-la-ventana-de-la-lista-vive-en-la-url.md)).

- **La ventana son semanas enteras.** El día de partida es el menor entre el de
  hace 13 días, el de la última entrada cerrada que ya empezó y el `desde` de la
  URL, si viene; nunca anterior al 1 de enero de 2000, el piso de fechas fijo (CAL-48 de [la paridad del calendario](calendario.md)). Ese día baja
  hasta el primer día de su semana (TT-48), así que la semana más vieja de la
  lista está entera y su total es el de verdad. Mientras hay un timer activo, la
  ventana baja además hasta la semana de su inicio. La extensión hacia atrás es
  lo que evita que la lista aparezca vacía habiendo entradas viejas.
- **«Cargar más» es un enlace que salta las semanas vacías.** Va al final de la
  lista y lleva a `/?desde=<semana>`, con la semana más reciente que tiene
  entradas antes de la ventana, y no con la inmediatamente anterior: cada clic
  agrega una semana con algo adentro, y las vacías del medio no se dibujan
  (TT-86). Sin nada más atrás, el enlace no aparece. Por ser un enlace se puede
  abrir aparte, y «Atrás» vuelve a la ventana anterior.
- **El foco después de cargar más** va al encabezado de la semana agregada. Si
  esa semana no llega —sus entradas se borraron entre el dibujo y el clic—, va
  al encabezado de la semana más vieja de la lista.
- **No limita filas**: agrega semanas enteras y no pagina dentro de la ventana.
- **Al recargar, la ventana es la misma**, porque vive en la URL. Tampoco la
  achican la revalidación periódica (P-11) ni la que sigue a una edición.
- **Un `desde` inválido se ignora**, sin error: uno que no es un día del
  calendario o que llega repetido. Uno anterior al 1 de enero de 2000 se recorta a la semana de ese día, y uno posterior al piso por omisión no
  achica la ventana.

_Corregido el 2026-10-03, slice 5_: decía que la ventana eran los últimos 14
días, sin redondear a la semana, y que «Cargar más» sería un botón que agrega
la semana inmediatamente anterior en cada clic. Lo fija el
[contrato del slice 5](../slices/fase1-slice5-semana-y-paginacion.md).
_Corregido el 2026-10-03, revisión de paridad del slice 5_: decía que el enlace
funciona sin JavaScript. Sin JavaScript, `/` se queda en el esqueleto de carga,
porque la pantalla se transmite dentro de un `<Suspense>` desde el slice 1.
_Corregido el 2026-10-07, piso fijo_: el primer punto decía «nunca anterior al día de creación del workspace», y el último, «Uno anterior a la creación del workspace se recorta a la semana de esa creación». El piso de fechas pasó a ser fijo, por decisión del equipo.

**El extremo nuevo de la ventana es el día de la entrada más nueva, que puede
ser posterior a hoy.** Con TT-76 aceptando fechas futuras, una ventana que
termina en «ahora» deja una entrada futura invisible para siempre, y «Cargar
más» no la alcanza nunca porque solo agrega semanas hacia atrás. Es el único
punto del documento donde aceptar la fecha futura obliga a cambiar algo ya
escrito.

**TT-108 Entrada que queda en un día que la lista no muestra** — `replicar`
_ID fuera de orden: este comportamiento se agregó después del resto._
En Clockify el problema no se plantea: la documentación del modo manual dice
que la entrada «will be added to the appropriate day header (whether the date
is in the past or the future)», y como la lista pagina desde el principio, ese
día siempre se alcanza bajando. No hay salto automático ni aviso documentado.
_No verificado_: si la lista hace scroll hasta la entrada recién creada.

Acá pasa lo mismo desde el slice 5 (P-15): **una mutación que deja una entrada
en una semana más vieja que la ventana extiende la ventana hasta esa semana**.
La URL pasa a llevar el `desde` de esa semana, sin sumar un paso al historial,
y la lista se dibuja con la entrada en su día. No hay aviso ni desplazamiento
automático: a la entrada se llega bajando, como en Clockify.

- **Vale para toda mutación que devuelve la entrada**: crearla en modo manual
  con una fecha vieja (TT-25), moverle la fecha a una fila (TT-56), y detener
  un timer cuyo inicio ya estaba antes de la ventana, que mientras corría se
  dibujaba por TT-52 y al cerrarse saldría de la lista. Lo mismo al cerrarlo
  iniciando o continuando otro (TT-35, TT-36). Moverle el inicio al timer
  (TT-28) o editarle la descripción también llevan su semana a la URL, para que
  la lista lo siga mostrando cuando se detenga.
- **La entrada se guarda igual.** No se valida la fecha contra la ventana:
  cargar horas de un mes atrás es un caso legítimo y bloquearlo sería inventar
  una regla que Clockify no tiene.
- **Hacia adelante no cambia nada**: la ventana ya llega hasta el día de la
  entrada más nueva (TT-52), así que una fecha futura siempre se ve.
- **Dos mutaciones seguidas no achican la ventana**: si la respuesta de la
  segunda llega antes de que se dibuje la extensión que pidió la primera, la
  ventana queda en la más vieja de las semanas pedidas.
- **Dos bordes en que una entrada sale de la lista sin extender la ventana**, y
  se alcanza con «Cargar más» (TT-52): el reintento de un «Iniciar» o un
  «Continuar» cuya respuesta se perdió, que no informa el timer que cerró el
  primer intento ([ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md));
  y un timer que ya estaba antes de la ventana al cargar la página y se detiene
  desde otra pestaña.

**El aviso del slice 2 se retiró.** Mientras no existía «Cargar más», una
entrada así se guardaba y no se podía ver, y un aviso informativo —en la barra
al crearla, en la lista al mover una fila— nombraba el día en que había
quedado. El aviso y sus dos textos ya no existen. Decidido por el equipo el
2026-10-02 (P-15).

_Corregido el 2026-10-03, slice 5 (P-15)_: era `adaptar`, por el aviso
temporal. La ventana se extiende hasta **la semana** de la entrada y no solo
hasta su día, porque la lista se dibuja en semanas enteras (TT-52); y no solo
al crearla, como dice P-15, sino con cualquier mutación que la devuelva.
_Corregido el 2026-10-03, decisión del equipo_: el título y el texto hablaban
solo de la entrada creada y del aviso en la barra; mover una fila con la
edición en línea produce el mismo caso, y su aviso lo muestra la lista.

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

_Agregado el 2026-10-03_. Lo que fija el
[contrato del slice 5](../slices/fase1-slice5-semana-y-paginacion.md):

- **El rango** va del primer al último día de la semana: `28/09 – 04/10`. Si
  alguno de los dos extremos no es del año en curso, los dos llevan el año:
  `29/12/2025 – 04/01/2026`. Las dos puntas van en el formato de fecha de la
  persona, con las formas de TT-44: `09-28 – 10-04` con `yyyy-MM-dd`. «Esta
  semana» es la que contiene hoy según el primer día de la semana de la persona
  (TT-48), y «Semana anterior», la inmediatamente anterior.
- **El rótulo de una semana futura es su rango**, igual que el de cualquier
  semana que no sea esta ni la anterior: no hay un rótulo propio para la semana
  que viene. Va arriba de «Esta semana», por el mismo orden que los días
  (TT-43). Diseño propio. _No verificado_: si Clockify rotula distinto la
  semana que viene; confirmar en el workspace del equipo (P-14), como el de
  mañana en TT-44.
- **El total** es la suma exacta en segundos de las entradas de la semana,
  formateada una sola vez, como el del día (TT-45). El de la semana del timer
  activo suma el transcurrido y sube con el contador, como el del día (TT-46).
  Una entrada cuenta entera en la semana del día de su inicio (TT-96).
- **Encabezados**: cada semana es un encabezado de nivel 2, y cada día, uno de
  nivel 3 dentro de su semana.

_Corregido el 2026-10-04, slice 7_: el rango daba las fechas siempre como
`dd/MM`; desde el slice 7 sigue el formato de fecha de la persona.

**TT-48 Corte de la semana** — `adaptar`
La semana corta en el primer día de la semana de la persona, que se guarda en
su membresía y se lee solo con `weekStartOf` (PF-01, PF-16): lunes por
omisión. El corte se calcula con `weekStartKey` de `src/server/time`, sobre el
día local de la entrada. Como en Clockify, el valor es por persona y por
workspace, y dos personas pueden ver la misma fecha en semanas distintas.
Justificación: todavía no hay dónde cambiarlo. En Clockify lo edita un admin
desde el perfil de la persona en la pantalla de equipo (PF-17), que acá no
existe; mientras tanto se cambia con una sentencia sobre la base, como explica
el [contrato del slice 5](../slices/fase1-slice5-semana-y-paginacion.md).
_Corregido el 2026-10-03, slice 5_: decía que el corte salía de `weekBounds`
con el inicio de semana del workspace, porque no había campo por persona
(P-13). El rastreador no llama a `weekBounds`.

**TT-49 Contenido de una fila** — `replicar`
De izquierda a derecha: descripción, proyecto con su punto de color y la tarea,
etiquetas, marca de facturable, hora de inicio y de fin, duración, botón de
continuar, menú de tres puntos.

_Agregado el 2026-10-07, slice 11b_. Diseño propio: la fila se lee en una
línea mientras entra. La descripción ocupa el ancho que queda libre y la línea
se parte recién cuando no le quedan 112 px; el botón de etiquetas mide como
máximo 160 px (TT-12). Cuando no entra, las horas, la duración, «Continuar» y
el menú bajan juntos a la línea siguiente, y no de a uno. La barra sigue la
misma regla con el contador, «Iniciar» o «Detener» y su menú. Las medidas, y
los casos que todavía se parten, están en «Slice 11b» de la sección 11.

**TT-50 Fila de una entrada incompleta** — `replicar`
Sin descripción muestra «Sin descripción» en gris; sin proyecto muestra
«Sin proyecto» en gris y sin punto de color. Las dos siguen siendo filas
normales, editables y contabilizadas.

_Agregado el 2026-10-05_. Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md): sin
etiquetas, la fila muestra el ícono de etiqueta en gris y sin texto (TT-12); no
facturable, el ícono de moneda sin marcar (TT-14). Con la membresía desactivada
(TT-92), ninguno de los dos se muestra. _No verificado_ (P-14), en lo que toca
a las etiquetas: la documentación no describe la fila. Lo del facturable no se
puede verificar en el plan Free (TT-14).

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
Documentado, textual: «The timer will immediately start with the same
description, project, and tags.» El botón de reproducción **crea una entrada
nueva** con la descripción, el proyecto, la tarea, las etiquetas y la
facturabilidad de la original, con `start` ahora y `end` nulo. No reabre la
entrada original. _No verificado_ (P-14): la tarea y la facturabilidad, que esa
frase no nombra.

_Agregado el 2026-10-04_. Diseño propio, _no verificado_ (P-14), fijado en el
[contrato del slice 10](../slices/fase1-slice10-selector-de-proyecto.md):
**continuar una entrada cuyo proyecto o tarea ya no está disponible se rechaza
y no crea nada.** Vale para un proyecto archivado, uno privado del que la
persona ya no es miembro y una tarea hecha. La respuesta es
«Ese proyecto ya no está disponible.» (TT-77) o «Esa tarea ya no está
disponible.» (PR-74 de [la paridad de proyectos](proyectos.md)), y el timer que
corría sigue corriendo. La documentación no cubre el caso. Justificación: la
alternativa, copiar sin el proyecto, cambia la entrada en silencio. Si el
workspace del equipo muestra que Clockify copia sin el proyecto, se cambia.

_Agregado el 2026-10-05_. **Las etiquetas y el facturable se copian desde el
[slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md)**; hasta
entonces, continuar copia la descripción, el proyecto y la tarea. El
facturable es el de la original, aunque su proyecto haya cambiado de valor por
defecto después (TT-14). Diseño propio, _no verificado_ (P-14), decisión del
equipo del 2026-10-05: **continuar una entrada que tiene una etiqueta
archivada se rechaza** con «Esa etiqueta ya no está disponible.» (TT-78), no
crea nada, y el timer que corría sigue corriendo. Es la regla del proyecto no
disponible: copiar sin la etiqueta cambia la entrada en silencio, y copiarla
asigna una archivada a una entrada nueva, que PR-45 prohíbe. La persona la
quita de la original desde la fila y vuelve a continuar.

_Corregido el 2026-10-05, relevamiento_: decía que la documentación nombraba
también la tarea y la facturabilidad.

**TT-58 Duplicar** — `replicar`
Menú de tres puntos → «Duplicar». Crea una copia cerrada con los mismos campos
y las mismas horas de inicio y fin, en el mismo día.
_No verificado en documentación pública_: existe el endpoint de duplicado en la
API pero el centro de ayuda no describe qué horas recibe la copia. La regla
vigente —la copia con exactamente los mismos instantes que la original,
segundos incluidos— está implementada como provisional y sigue pendiente de
verificación en el workspace del equipo (P-14).
_Corregido el 2026-10-03, decisión del equipo_: decía «Confirmar en el
workspace del equipo antes de implementar.»; se implementó sin esa
confirmación, con la regla provisional.

_Agregado el 2026-10-03_. Diseño propio: un pedido de duplicar la entrada que
corre, que solo llega armado a mano porque la abierta no es una fila (TT-111),
se rechaza sin escribir con «Esta entrada es la que está corriendo.», el texto
de TT-111: el hecho es el mismo —la entrada pedida es la abierta— y el remedio
también.

_Agregado el 2026-10-04_. Diseño propio, _no verificado_ (P-14): **duplicar una
entrada cuyo proyecto o tarea ya no está disponible se rechaza** con TT-77 o
PR-74 y no crea nada, por la misma razón que al continuar (TT-57).

_Agregado el 2026-10-05_. **Duplicar copia también las etiquetas y el
facturable de la original** desde el
[slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md), con la misma
regla que continuar (TT-57): el facturable es el de la original, y **duplicar
una entrada que tiene una etiqueta archivada se rechaza** con TT-78 y no crea
nada. Diseño propio, _no verificado_ (P-14).

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

**TT-62 Selección múltiple** — `adaptar`
Documentado (consultado el 2026-10-04): en el rastreador se aprieta el ícono de
edición en masa que está junto al total de un día, se marcan las casillas de
las entradas y se elige la acción. La documentación no dice si las casillas se
ven siempre, al pasar el puntero o solo después de apretar el ícono, ni si la
selección puede juntar entradas de más de un día.

Acá, fijado en el
[contrato del slice 6](../slices/fase1-slice6-seleccion-y-masa.md):

- **Cada fila tiene una casilla, siempre visible**, primera de la fila (TT-49),
  con el nombre accesible «Seleccionar «{descripción o Sin descripción}»,
  {horas}»: la hora va en el nombre porque dos entradas pueden tener la misma
  descripción.
- **El encabezado de cada día tiene una casilla**, antes del rótulo, con tres
  estados: marcada si están elegidas todas las entradas del día, mixta si
  algunas y vacía si ninguna. Marcada, las suelta todas; mixta o vacía, elige
  las que faltan.
- **Con la primera entrada elegida aparece la barra de acciones en masa**,
  arriba de la lista y fija al desplazarse, con «1 entrada seleccionada» /
  «N entradas seleccionadas» y los botones «Editar», «Borrar» y «Quitar
  selección». Al soltar la última, la barra se va.
- **La selección puede juntar entradas de días y semanas distintos.** Diseño
  propio, _no verificado_ (P-14): la documentación describe la selección desde
  el total de un día.
- **La selección es de la pestaña**: sobrevive a «Cargar más», a la
  revalidación, también la periódica de TT-40, y a la extensión de la ventana
  de P-15 (TT-108), y **se pierde al recargar**. No va en la URL: una URL
  compartida con una selección invitaría a borrar en otra pestaña algo que no
  se está mirando.
- **Una entrada que sale de la lista sale de la selección, y no vuelve**: la
  que se borró en otra pestaña, o la de una semana que dejó de verse porque
  «Atrás» achicó la ventana (TT-52). Nunca se edita ni se borra una entrada que
  no está en pantalla.
- **Al editar o borrar con éxito, la selección se vacía y la barra se va; si la
  operación falla, la selección se conserva.** Diseño propio, _no verificado_
  (P-14).
- **Con la membresía desactivada** no hay casillas ni barra (TT-92).
- **No hay rango con Shift, casilla por semana ni «seleccionar todo»**: la
  documentación no los nombra.

Justificación del `adaptar`: las casillas están siempre visibles, sin pasar el
puntero ni apretar antes un ícono. En una pantalla táctil no hay puntero que
pase, y una casilla que aparece con el puntero o con el foco no se descubre
recorriendo con el teclado.

_Corregido el 2026-10-04, slice 6_: era `replicar` y decía «Cada fila tiene una
casilla al pasar el puntero», que la documentación consultada hoy no dice;
tampoco decía qué hace la casilla del día con una parte del día elegida ni qué
pasa con la selección al recargar.

**TT-63 Edición masiva** — `replicar`
Documentado: con entradas seleccionadas se pueden cambiar en bloque la
descripción, el proyecto y la tarea, las etiquetas (agregando a las existentes
o reemplazándolas), la facturabilidad, y la hora y la fecha.
_No verificado_: la documentación dice que la edición masiva del reporte
detallado es de plan pago, y no aclara si la del rastreador está en Free.
Confirmar en el workspace del equipo (P-07). La página, consultada de nuevo el
2026-10-04, no nombra ningún plan. Decisión del equipo: el slice 6 arrancó sin
esa confirmación; si resulta paga, TT-62 a TT-64 quedan como mejora
deliberada, `adaptar`.

_Agregado el 2026-10-07, slice 12_. Relevamiento de la página de edición
masiva, consultada ese día con cada oración confirmada literal. En «Edit from
the Time Tracker Page», los campos del diálogo son «Description», «Project»,
«Tags», «Billable», «Time» y «Date»; arriba, la página dice que la edición
masiva ahorra tiempo «when adjusting details like projects, tasks, or tags».
En «Use tags for bulk edits», una sección de «Bulk edit time entries» que no
dice si es del rastreador o del reporte detallado: «Choose how you want to add
the tag:», con «Add to existing – Assigns the new tag in addition to any
existing tags on the selected entries.» y «Overwrite existing – Replaces the
existing tags with the new one». Eso respalda «agregando a las existentes o
reemplazándolas». La página no dice qué opciones tiene «Billable», si cambiar
el proyecto cambia el facturable, qué hace «Overwrite existing» sin ninguna
etiqueta, qué pasa con un proyecto o una etiqueta archivados, si se puede
elegir la entrada que corre ni qué pasa si una de las elegidas no admite el
cambio. Tampoco nombra ningún plan: su tabla «Access permissions» dice de
«Regular users» que «Can bulk edit and delete their time entries (as long as
they are not locked or approved)», sin plan. P-07 sigue abierto.

_Agregado el 2026-10-04, slice 6_. Lo que fija el
[contrato del slice 6](../slices/fase1-slice6-seleccion-y-masa.md) para la
descripción, la hora y la fecha. El proyecto, la tarea, las etiquetas y el
facturable en bloque los fija el slice 12, más abajo.

- **El diálogo «Editar N entradas»** tiene «Descripción», «Fecha», «Hora de
  inicio» y «Hora de fin», todos vacíos al abrir, con la ayuda «Lo que dejes
  vacío no cambia.» Las horas se escriben y se muestran en el formato de la
  persona, como en la fila (TT-20; PF-13 y PF-14 de
  [la paridad del perfil](perfil.md)). «Guardar» queda inactivo mientras
  ningún campo tiene algo. La documentación nombra un solo campo, «Time», y no
  dice si cambia el inicio, el fin o los dos: _no verificado_ (P-14).
- **Un campo vacío no cambia.** Por eso desde el diálogo no se puede vaciar la
  descripción de varias entradas a la vez; el servidor sí lo acepta, y
  ofrecerlo es un control más en el diálogo. Diseño propio, _no verificado_
  (P-14).
- **La hora y la fecha se reemplazan, no se desplazan.** Lo pedido se combina
  con el trío de cada entrada (TT-110): cambiar solo el inicio deja el fin de
  cada una como estaba, y la que termina antes de su nuevo inicio pasa a
  terminar al día siguiente (TT-72), como en la fila; cambiar solo la fecha
  lleva cada entrada a ese día con sus horas. Una entrada cuyo trío pedido es el
  que ya tiene no cambia ni se evalúa: a una de más de un día no se la rechaza
  por pedirle la fecha que ya tiene. Diseño propio, _no verificado_ (P-14): la
  documentación no dice si Clockify reemplaza o desplaza.
- **Cada entrada pasa por las reglas de su edición individual**, con el mismo
  texto: ya no existe (TT-80), es de otra persona (TT-79), es la que corre
  (TT-111, también si el cambio es solo la descripción), dura más de un día y
  cambia su horario (TT-110), la hora no existe ese día (TT-112), queda en
  menos de un minuto (TT-73), o cae antes del 1 de enero de 2000, el piso de fechas (CAL-48 de [la paridad del calendario](calendario.md)). La ajena y
  la que corre solo llegan con un pedido armado a mano.
  _Corregido el 2026-10-07, piso fijo_: decía «o cae antes de la creación del workspace ([ADR 0005](../adr/0005-hora-de-pared-en-la-entrada-manual.md))».
- **Todo o nada**
  ([ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md)). Si
  alguna entrada no admite el cambio, no cambia ninguna. El aviso dice «No se
  pudieron editar las entradas.» (TT-90) con «Ninguna entrada cambió: algunas
  de las elegidas no se pueden editar.», nombra cada entrada rechazada con su
  causa —«{descripción o Sin descripción}, {día}, {inicio} – {fin}: {causa}»—,
  también la que ya no existe, con lo que la pantalla mostraba al mandar, y
  ofrece «Quitar esas entradas de la selección» para volver a guardar con el
  resto. Diseño propio, _no verificado_ (P-14): la documentación no dice si
  Clockify aplica en parte. Justificación: sin deshacer (P-06), una edición
  parcial deja la lista mezclada y sin marca de qué cambió.
- **Hasta 200 entradas por operación.** Con más elegidas, «Editar» y «Borrar»
  quedan inactivos con «Se pueden elegir hasta 200 entradas a la vez.» a la
  vista, y el servidor responde el mismo texto. Justificación: límite propio;
  Clockify no documenta ninguno, y 200 es lo que cabe en una transacción corta
  y cubre un mes de entradas de una persona.
- **Mientras viaja**, las entradas elegidas quedan atenuadas, como en TT-55. Al
  terminar bien, «Se editó 1 entrada.» / «Se editaron N entradas.». Una
  entrada llevada a una semana más vieja que la ventana la extiende hasta esa
  semana (TT-108).
- **«Reintentar»** se ofrece con la falla de red (TT-89): el segundo intento
  encuentra cada entrada con lo pedido y no escribe nada. Se ofrece solo
  mientras todas las entradas del pedido sigan en pantalla; si alguna se fue o
  la persona la soltó, el aviso queda sin «Reintentar», que reenviaría
  entradas que ya no se ven o ya no están elegidas.

_Corregido el 2026-10-07, slice 12_: el párrafo del slice 6 decía «El
proyecto, la tarea, las etiquetas y el facturable en bloque quedan para el
slice 12, después del 11, que trae las etiquetas y el facturable; hasta
entonces, el proyecto y la tarea de cada entrada no cambian y la entrada los
conserva.» Deja de valer: el slice 12 los cambia en bloque. Desde el 12 el
diálogo tiene siete campos y no cuatro, y la ayuda, «Guardar» inactivo sin
cambios, el todo o nada, el tope de 200, la atenuación y «Reintentar» de la
lista de arriba valen también para los campos nuevos.

_Agregado el 2026-10-07, slice 12_. Lo que fija el
[contrato del slice 12](../slices/fase1-slice12-edicion-masiva.md) para el
proyecto y la tarea, las etiquetas y el facturable, con las decisiones D12-1 …
D12-5 de sus [correcciones](../slices/correcciones-fase1-slice12.md) y el
[ADR 0017](../adr/0017-las-referencias-de-una-masiva-se-validan-una-vez.md),
que aceptó el usuario el 2026-10-07. Cada entrada pasa por la misma regla del
par, el facturable y las etiquetas que su edición individual: la masiva y la
fila comparten las funciones, no una copia.

- **El diálogo suma tres secciones entre «Descripción» y «Fecha»**, todas en
  «Sin cambios» al abrir:
  - **«Proyecto»**, con el selector de TT-07 y «Sin cambios» en el disparador.
    Ofrece lo mismo que el de la barra: los proyectos activos con acceso
    (TT-08), sus tareas y «Sin proyecto» (TT-10); un proyecto archivado no se
    ofrece. Lo elegido se ve en el disparador —el punto y el nombre, «P: T» o
    «Sin proyecto»— y al lado aparece «No cambiar el proyecto», que vuelve a
    «Sin cambios» y lleva el foco al disparador.
  - **«Etiquetas»**, con el selector de TT-12, y debajo el grupo «Cómo se
    aplican las etiquetas», con «Agregar a las que tienen», elegida al abrir,
    y «Reemplazar las que tienen». Con «Reemplazar» o con alguna etiqueta
    elegida aparece «No cambiar las etiquetas», que vuelve a «Agregar» sin
    etiquetas y lleva el foco al disparador. Sin etiquetas elegidas, el
    disparador dice «Etiquetas», como en la barra, y no «Sin cambios».
  - **«Facturable»**, un grupo con «Sin cambios», elegida al abrir, «Sí» y
    «No».
  - `Escape` con un selector abierto cierra solo el selector, también con la
    lista vacía, y el foco vuelve a su disparador; un segundo `Escape` cierra
    el diálogo. El diálogo no pasa del alto de la ventana: los campos se
    desplazan entre el título y los botones.

  Documentado: los campos «Project», «Tags» y «Billable», y los dos modos de
  las etiquetas. Diseño propio, _no verificado_ (P-14): el orden, los nombres
  de los modos, «Sin cambios» en cada sección y los controles que vuelven a
  él. Las opciones del facturable no se pueden verificar en el plan Free (P-16
  de [la paridad de proyectos](proyectos.md)).

- **«Agregar» suma a las etiquetas que cada entrada ya tiene, sin repetir;
  «Reemplazar» le deja exactamente las elegidas.** Documentado, con las
  oraciones de arriba. «Agregar» sin ninguna elegida no es un cambio.
- **«Reemplazar» sin ninguna etiqueta deja las entradas sin etiquetas**, con
  «Las entradas quedan sin etiquetas.» a la vista antes de guardar (D12-3).
  Justificación: elegir «Reemplazar» es un acto explícito, no un campo que
  quedó vacío, y es la única forma de sacar las etiquetas de varias entradas a
  la vez. La descripción, que no tiene un control así, sigue sin poder vaciarse
  en bloque. Diseño propio, _no verificado_ (P-14): la documentación habla de
  «the new tag» y no dice qué hace «Overwrite existing» sin ninguna.
- **El facturable sigue TT-14 en cada entrada** (D12-5, con la regla D-2 del
  [slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md)): con un
  proyecto elegido y el facturable en «Sin cambios», la entrada que cambia de
  proyecto toma el facturable por defecto del elegido, y la que ya estaba en
  él —con otra tarea o sin tarea— y la que pasa a «Sin proyecto» conservan el
  suyo. Dos entradas del mismo pedido pueden terminar con facturables
  distintos, y lo dice, a la vista, «Las entradas que cambian de proyecto
  toman el facturable por defecto de ese proyecto; las que ya estaban en él
  conservan el suyo.» «Sí» o «No» gana en todas, también en las que cambian
  de proyecto. Justificación: preseleccionar el por defecto del proyecto, como
  el diálogo del calendario, se lo impondría también a las entradas que ya
  estaban en él, y la masiva dejaría de ser la fila repetida. Diseño propio
  que no se puede verificar en el plan Free (P-16), así que no entra en P-14.
- **Lo archivado que una entrada ya tiene se conserva y no se valida**
  (TT-104, PR-47, PR-68): «Agregar» no le quita una etiqueta archivada;
  cambiar solo las etiquetas o el facturable no toca su proyecto archivado; y
  pedirle el proyecto o la etiqueta que ya tiene no cambia nada, aunque esté
  archivado. «Reemplazar» sin la archivada sí la saca. Lo que una entrada ya
  tiene la exime solo a ella: si otra del mismo pedido lo recibe de nuevo, se
  valida.
- **Un proyecto, una tarea o una etiqueta no disponibles frenan el pedido
  entero, sin lista de entradas**
  ([ADR 0017](../adr/0017-las-referencias-de-una-masiva-se-validan-una-vez.md)):
  el aviso dice «No se pudieron editar las entradas.» con «Ese proyecto ya no
  está disponible.» (TT-77), «Esa tarea ya no está disponible.» (PR-74 de
  [la paridad de proyectos](proyectos.md)) o «Esa etiqueta ya no está
  disponible.» (TT-78), sin «Quitar esas entradas de la selección» ni
  «Reintentar», y el diálogo sigue abierto con lo elegido. Vale para el
  archivado, también si se archivó con el diálogo abierto, el privado sin
  acceso (TT-08) y la tarea hecha. Es causa del pedido y no rechazo de una
  entrada aunque dependa de cuáles se eligieron —con todas ya en el proyecto
  archivado, el pedido termina bien—, porque el remedio es elegir otra
  referencia, no quitar entradas.
  - **Las entradas van antes que las referencias**: con una entrada rechazada
    y el proyecto no disponible a la vez, la respuesta es la lista de arriba;
    quitadas esas entradas, el segundo intento responde el proyecto.
  - **Con el proyecto y una etiqueta no disponibles a la vez, responde el
    proyecto**, en cualquier orden de las entradas, como en la edición de una
    fila.

  Diseño propio, _no verificado_ (P-14): la documentación no dice qué pasa con
  una referencia archivada ni si Clockify aplica en parte.

- **Más de 50 etiquetas en una entrada es un rechazo de esa entrada** (D12-4):
  si «Agregar» deja alguna con más de 50, la lista la nombra con «Se pueden
  elegir hasta 50 etiquetas por entrada.» (PR-48) y no cambia ninguna; con
  exactamente 50, termina bien. Pedir más de 50 a la vez responde el mismo
  texto para el pedido entero. Justificación: depende de cuántas tiene cada
  entrada y se resuelve quitándola de la selección; recortar a 50 cambiaría lo
  pedido sin decirlo. El tope es el de PR-48, _no verificado_ en esa paridad.
- **La entrada que corre se rechaza aunque el cambio no toque el horario**
  (TT-111): pedirle solo el proyecto, las etiquetas o el facturable también
  responde «Esta entrada es la que está corriendo.» Una operación en masa es
  sobre filas, y la abierta no lo es. Solo llega con un pedido armado a mano.
- **Una entrada de más de un día** (TT-110) cambia de proyecto, de etiquetas o
  de facturable sin rechazo: solo se rechaza si el pedido le cambia el
  horario, como en la fila.
- **«Reintentar» llega al mismo estado** (TT-89): el segundo intento encuentra
  cada entrada con lo pedido y no escribe ni valida nada, así que termina bien
  **aunque el proyecto o la etiqueta se hayan archivado entre los dos
  intentos**.
- **Al terminar bien**, cada entrada muestra su proyecto, sus etiquetas y su
  facturable nuevos, con «Se editaron N entradas.»; mientras viaja, las
  entradas elegidas quedan atenuadas (TT-55), sin mostrar antes los valores
  nuevos.
- **Afuera**: crear un proyecto o una etiqueta desde el diálogo (TT-09,
  TT-13); elegir un proyecto o una etiqueta archivados, que el selector no
  ofrece y el servidor rechaza (TT-77, TT-78); y vaciar la descripción en
  bloque.

**TT-64 Borrado masivo** — `adaptar`
Clockify pide escribir `DELETE` en el diálogo y después deja deshacer 20
segundos. Acá el diálogo pide escribir `BORRAR` y, en línea con TT-61, no hay
deshacer. Justificación: traducción de la palabra de confirmación y la misma
decisión sobre el deshacer.

_Agregado el 2026-10-04, slice 6_. Lo que fija el
[contrato del slice 6](../slices/fase1-slice6-seleccion-y-masa.md):

- **El diálogo «¿Borrar N entradas?»** dice «No se puede deshacer.» y tiene el
  campo «Escribí BORRAR para confirmar». «Borrar» queda inactivo hasta que el
  campo dice «BORRAR», **sin distinguir mayúsculas ni espacios en los
  extremos**: «borrar» vale. Enter en el campo confirma si el texto vale.
  Diseño propio, _no verificado_ (P-14): la documentación no dice si Clockify
  distingue mayúsculas en `DELETE`. Justificación: la palabra frena el borrado
  por descuido, y una mayúscula de menos no lo es.
- **Al confirmar**, el diálogo se cierra y las entradas salen de la lista
  mientras el pedido viaja, como en el borrado de una fila, con «Borrando…»; si
  falla, vuelven, y vuelven elegidas. Al terminar bien, «Se borró 1 entrada.» /
  «Se borraron N entradas.». Borrar todas las entradas deja a la vista el
  estado vacío de TT-85.
- **Todo o nada, como TT-63**: una entrada ajena (TT-79) o la que corre
  (TT-111) frena el pedido y no se borra ninguna. El aviso dice «No se pudieron
  borrar las entradas.» con «No se borró ninguna entrada: algunas de las
  elegidas no se pueden borrar.» y la lista de TT-63. Las dos causas solo
  llegan con un pedido armado a mano.
- **Una entrada que ya no existe no es un rechazo**
  ([ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md)): lo
  pedido, que no esté, ya se cumple. Es la regla de descartar un timer que ya
  no existe (TT-65), y la que hace seguro el reintento: el segundo intento no
  encuentra lo que borró el primero y termina bien.
- **El borrado de una fila no mira si la entrada corre, y el masivo la
  rechaza.** Los dos casos solo llegan armados a mano; el masivo no extiende a
  la entrada que corre un borrado que no pasa por la confirmación de descartar
  (TT-65).
- El tope de 200 y «Reintentar» son los de TT-63.

**TT-65 Descartar el timer activo** — `replicar`
El menú de tres puntos de la barra con el timer corriendo ofrece «Descartar»:
borra la entrada abierta sin guardarla y deja la barra vacía. Pide confirmación
porque no se puede deshacer.
_No verificado en documentación pública_: la opción se ve en el producto pero
no está descrita en el centro de ayuda. Confirmar en el workspace del equipo.

_Agregado el 2026-10-03_. Diseño propio, fijado en el
[contrato del slice 4](../slices/fase1-slice4-continuar-duplicar.md): **descartar
un timer que otra pestaña ya detuvo no lo borra.** Responde «Este timer ya
había sido detenido.», el texto de TT-41, y la entrada cerrada sigue en la
lista. Clockify no documenta este cruce. Justificación: una entrada cerrada es
un registro que otra pestaña decidió guardar, y el borrado no se deshace
(P-06); si la persona igual la quiere fuera, la borra desde la lista, con su
confirmación.

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
La semana vacía no se dibuja: la lista salta a la última semana con entradas,
y para eso la ventana se extiende hacia atrás hasta la semana de ese día
(TT-52). «Cargar más» hace lo mismo: salta las semanas vacías del medio. No hay
días ni semanas vacíos intermedios; la única semana sin entradas cerradas que
se dibuja es la del timer activo, por TT-46.
_Corregido el 2026-10-03, slice 5_: decía que la ventana se extendía hasta ese
día; desde TT-52 llega hasta el primer día de su semana, y el salto vale
también al cargar más.

**TT-87 Workspace sin proyectos** — `adaptar`
El selector de proyecto abre con «No hay proyectos todavía» y, si
`project.create` lo permite, el enlace «Ir a Proyectos», que lleva a
`/proyectos`. En la fase 1 lo permite a toda membresía activa (PR-59).
Justificación: en Clockify ahí va «Crear proyecto», que es TT-09 y está fuera
de alcance.

**«Sin proyecto» se ofrece también con el catálogo vacío.** Diseño propio: es
la única forma de quitarle a una entrada un proyecto archivado cuando no queda
ningún proyecto activo que ofrecer (TT-10 con TT-104).

_Corregido el 2026-10-04, slice 10_: decía «si el rol lo permite, un enlace a
la pantalla de proyectos», sin el texto del enlace ni la acción que lo
habilita, y no decía qué pasa con «Sin proyecto».

**TT-88 Workspace sin etiquetas** — `adaptar`
El selector de etiquetas abre con «No hay etiquetas todavía». Misma
justificación que TT-87.

_Agregado el 2026-10-05_. Diseño propio, fijado en el
[contrato del slice 11](../slices/fase1-slice11-etiquetas-y-facturable.md):
como en TT-87, si `tag.create` lo permite, el selector suma el enlace «Ir a
Proyectos», que lleva a `/proyectos`, donde se crean las etiquetas en la fase 1
(PR-112 de [la paridad de proyectos](proyectos.md)). En la fase 1 lo permite a
toda membresía activa (PR-44). En Clockify, ahí se escribe el nombre y se crea
la etiqueta desde el mismo selector («Click **Create tag** or press Ctrl / ^
(Control) + Enter»), que es TT-13 y está fuera de alcance.

## 9. Estados de error

**TT-89 Falla de red al guardar** — `adaptar`
El botón vuelve a su estado anterior, lo tecleado se conserva y aparece un
aviso «No se pudo guardar. Revisá la conexión y volvé a intentar.», con la
acción «Reintentar». «Reintentar» se ofrece solo para esta causa: ni un error
de validación ni un permiso mejoran repitiendo el mismo pedido.
Justificación: Clockify acumula los cambios en el cliente y los reenvía; acá no
hay cola de reintentos.
_Corregido el 2026-10-07, slice 2c_: decía «La única operación del módulo que
no lo ofrece es el alta manual, por TT-109.». Desde el 2c el alta manual
también lo ofrece (TT-109).

**TT-109 El alta manual se reintenta con el id del cliente** — `adaptar`
_ID fuera de orden: este comportamiento se agregó después del resto._
Clockify reenvía solo y no expone la decisión, así que no hay nada que relevar
acá: la regla es nuestra.

Decidido por el equipo el 2026-10-04 y construido por el
[slice 2c](../slices/fase1-slice2c-reintentar-alta-manual.md), con las
decisiones del team-lead del 2026-10-07: el alta manual, desde la barra y
desde el diálogo del calendario (CAL-46 de
[la paridad del calendario](calendario.md)), cumple TT-89 y TT-90 como las
demás operaciones del módulo. El pedido de `createManualEntry` lleva un id que
elige el cliente
([ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md)): si el primer
intento se aplicó y lo que se perdió fue la respuesta, el reintento responde la
entrada que creó, en el estado en que esté, sin escribir ni volver a validar;
si no llegó, el reintento es el alta. Ante una falla de red el aviso dice «No
se pudo agregar la entrada.», con el mensaje de TT-89 y «Reintentar», y lo
tecleado se conserva.

- **«Agregar» otra vez reusa el id** (D2c-1). Con el aviso de falla por red a
  la vista, «Agregar» manda el borrador de ahora con el id pendiente. Si el
  primer intento se aplicó, el servidor responde esa entrada y lo que cambió
  después no se guarda.
- **La respuesta que no es lo mandado no limpia nada** (r2-1). Si la entrada
  que responde el servidor no es la que se mandó, lo tecleado queda, el foco no
  se mueve y aparece un aviso informativo: en la barra, «La entrada ya se había
  agregado con lo que mandaste antes; lo que está en la barra no se guardó.», y
  en el diálogo del calendario, «La entrada ya se había agregado con lo que
  mandaste antes; lo que está en el diálogo no se guardó.». El id se renueva,
  así el próximo «Agregar» crea la entrada nueva. La respuesta cuenta como lo
  mandado si todos los pedidos que salieron con ese id eran el mismo —aunque la
  entrada se haya editado en otra pestaña o haya cambiado la zona horaria—, o
  si coincide con lo mandado en descripción, día, inicio, fin, proyecto, tarea,
  etiquetas y facturable (r3-1); un facturable que el pedido no lleva no se
  compara (r3-2).
- **Qué manda «Reintentar»** (D2c-2). En la barra, el pedido que falló, entero
  y con su id: lo editado después de la falla no viaja y queda en la barra. En
  el diálogo del calendario, el borrador actual con el id pendiente, como el
  «Reintentar» de «Guardar» (CAL-67): ahí «Reintentar» y «Agregar» son el mismo
  pedido. Con éxito y la respuesta que es lo mandado, la barra se limpia y el
  foco va a la descripción (TT-25), y el diálogo se cierra (CAL-46).
- **En la barra el aviso sobrevive** (m4). El aviso de falla por red del alta
  no lo bajan «Iniciar», «Detener», «Descartar», el cambio de modo, los
  guardados del timer ni editar el borrador: baja solo con el desenlace de otro
  pedido del alta, y no tiene control para cerrarlo. Con un timer en la barra,
  propio o llegado de otra pestaña, «Reintentar» queda inactivo (TT-30) y
  vuelve a estar activo, con el mismo id, al volver a modo manual.
- **En el diálogo del calendario el id sobrevive al cierre.** Mientras el alta
  viaja el diálogo no se cierra: «Cancelar» no actúa y `Esc` y el clic afuera
  se ignoran, así el aviso informativo siempre tiene dónde verse. Cerrarlo con
  el aviso de falla a la vista no renueva el id: la próxima alta que se abra lo
  reusa, y agregar lo mismo responde la entrada sin duplicarla; agregar otra
  cosa da el aviso informativo, y el siguiente «Agregar» la crea. El id sí se
  renueva cuando esta pestaña guarda, mueve, borra o duplica la entrada del
  primer intento (F2-1): si no, agregar lo mismo respondería esa entrada ya
  cambiada, contaría como lo mandado y la entrada nueva no se crearía.
- **La revalidación no baja el aviso** (D2c-3), aunque traiga la entrada del
  primer intento: con el aviso a la vista, «Reintentar» o «Agregar» responden
  esa entrada sin escribir.

Límites aceptados por el equipo:

- **El reintento puede recrear una entrada que la persona borró** entre la
  respuesta perdida y el clic (ADR 0007). Como en la barra el aviso sobrevive a
  las demás operaciones, la ventana es todo el tiempo que esté a la vista.
- **Recargar o salir de la ruta renueva el id**, en la barra y en el
  calendario, porque se desmonta la pantalla y se pierde su estado: si el
  primer intento se aplicó, volver a agregar lo mismo crea una segunda
  entrada, y TT-82 la acepta sin aviso. Y con el alta en vuelo bajo un id
  reusado, irse de la ruta pierde el aviso informativo: si la respuesta es la
  entrada de un intento anterior, la entrada nueva no se crea y nada lo dice.
- **El aviso informativo puede ser falso** (F3): con dos pedidos distintos bajo
  el mismo id y la entrada editada en otra pestaña, la respuesta no coincide
  con lo mandado aunque sea la suya, y el siguiente «Agregar» la duplica. El
  cliente no sabe cuál de los pedidos se aplicó; lo cerraría que el servidor
  dijera que la respuesta es de un reintento.
- **Si lo cambiado era una corrección del primer intento**, la persona queda
  con las dos entradas y borra la primera.

Justificación del `adaptar`: Clockify reenvía solo (TT-89); el aviso, el botón
y el aviso informativo son nuestros, y el id del cliente es lo que vuelve
seguro repetir el alta.

Las demás operaciones del módulo también ofrecen «Reintentar», porque
repetirlas es inofensivo: arrancar, continuar y duplicar son seguros de
reintentar porque el pedido lleva un id que elige el cliente (ADR 0007), y el
reintento de uno ya aplicado responde la misma entrada sin escribir, sin
cerrar, abrir ni copiar nada de más; detener sobre una entrada ya cerrada da
TT-41; descartar un timer que ya no existe termina sin error, porque lo pedido
—que el timer no esté— ya se cumple (TT-65); y editar y borrar apuntan a un
identificador que ya existe, así que el segundo intento produce el mismo estado
que el primero.

_Corregido el 2026-10-03, decisión del equipo_: los dos párrafos anteriores
decían que un arranque repetido choca con el índice único del timer abierto. El
índice solo frena dos arranques simultáneos, no un reintento que llega después:
reintentar un «Iniciar» cuya respuesta se perdió cerraba el timer recién creado
y dejaba una entrada de segundos. Lo que distingue al alta manual no es el
índice, sino que no lleva id del cliente. La regla del alta manual no cambia.
_Corregido el 2026-10-03, decisión del equipo_: decía que el alta manual era
«la única operación del módulo que solo crea», que dejó de ser cierto con
duplicar, que también solo crea; y el párrafo de las operaciones que sí ofrecen
«Reintentar» no nombraba continuar, duplicar ni descartar.
_Corregido el 2026-10-07, slice 2c_: el título era «El alta manual no ofrece
«Reintentar»». El cuerpo decía, por decisión del equipo del 2026-10-02, que
ante una falla de red de `createManualEntry` el aviso era «No sabemos si la
entrada se guardó.» y mandaba a mirar la lista, sin «Reintentar», porque el
alta manual era la única operación del módulo que creaba una entrada sin un id
elegido por el cliente y reintentarla podía duplicarla. El párrafo de las
demás operaciones empezaba «El resto de las operaciones del módulo sí ofrece
«Reintentar»». El id se conserva (D2c-4 del contrato del 2c); las dos notas
anteriores describen el texto de ese momento.

**TT-90 El aviso nombra la acción que falló** — `adaptar`
Un aviso tiene dos partes: un título que nombra lo que no se pudo hacer —«No se
pudo guardar la descripción.», «No se pudo borrar la entrada.»— y abajo el
mensaje del error, que es el de la tabla de la sección 7. Un campo que no se
guardó vuelve además a su valor anterior. Justificación: el título es nuestro;
Clockify no muestra este aviso porque reintenta solo.

**TT-91 Sesión vencida** — `adaptar`
Una página o una action que encuentra la sesión vencida lleva a la pantalla de
acceso. **No hay ruta de vuelta**: al volver a entrar, el acceso lleva siempre
a `/`, desde cualquier pantalla. Un timer activo no se pierde: sigue abierto en
la base y reaparece al volver a entrar. Justificación: es comportamiento de
nuestra autenticación, no de Clockify; la ruta de vuelta después del acceso no
existe en ninguna pantalla.
_Corregido el 2026-10-04, slice 8_: decía que la action devolvía 401 y que la
interfaz llevaba a la pantalla de acceso conservando la ruta de vuelta.
`requireSession` redirige a `/login` en las páginas y en las actions
(`src/server/session.ts`, `src/server/action.ts`), y el acceso vuelve siempre a
`/` (`google-sign-in-button.tsx`). Es lo mismo que CAL-86.

**TT-92 Membresía desactivada mientras la sesión está abierta** — `adaptar`
`can` devuelve falso y la pantalla queda en solo lectura, con un aviso
permanente: «Tu acceso al workspace está desactivado.» y la línea «Podés ver
tus horas, pero no cargar ni modificar entradas. Pedile a quien administra el
workspace que vuelva a activar tu membresía.» Un pedido que llegue igual recibe
el mensaje neutro de TT-79. Justificación: `membership_status` es nuestro
modelo.
_Actualizado el 2026-10-19, E2 ([contrato](../slices/fase2-e2-desactivar.md),
D-E2-2)_: **desde E2 este estado aparece solo con un pedido en vuelo o por
SQL.** Desactivar desde `/equipo` borra las sesiones de la persona en la misma
transacción (EQ-41 de `equipo.md`), y una inactiva no vuelve a entrar (EQ-92,
P-05 de `equipo.md`). Quedan dos casos: el pedido que leyó la sesión antes de
que la desactivación confirmara (EQ-104) y una membresía pasada a `inactive`
por SQL con la sesión abierta. En los dos, la pantalla es la de arriba. Un
ingreso que se cruza con una desactivación no deja sesión: el gancho
`session.create.after` la borra (D-E2-2). Abrir un timer relee la membresía
bajo bloqueo y, si ya no está activa, responde el mensaje neutro de TT-79 sin
abrirlo (D-E2-6).

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
| TT-104 | Proyecto archivado mientras la entrada ya lo tiene asignado | La entrada conserva el proyecto y lo muestra; el selector no lo ofrece para entradas nuevas. Se quita con «Sin proyecto» (TT-10), que se ofrece aun con el catálogo vacío (TT-87).                                                                                                     |
| TT-105 | Etiqueta borrada mientras la entrada la tiene               | La etiqueta desaparece de la entrada. Documentado: «All deleted tags will be removed from time entries they are assigned to.» (PR-46, PR-69).                                                                                                                                          |
| TT-106 | Cambio de zona horaria de la persona con entradas cargadas  | Los instantes no se tocan; los grupos de día se recalculan y una entrada puede cambiar de día.                                                                                                                                                                                         |
| TT-107 | Timer que lleva más de 24 horas corriendo                   | Sigue corriendo y al detenerlo se guarda entero (TT-42, TT-74). No hay tope. Una vez cerrada, si el trío no la puede expresar, sus horarios no se editan desde la fila (TT-110).                                                                                                       |

_Corregido el 2026-10-04, slice 7_: TT-106 hablaba de la zona horaria del
workspace. Desde el slice 7 la que agrupa la lista es la de la persona (TT-02,
PF-38), y cambiar `workspace.timezone` no mueve nada de esta pantalla (PF-05).
_Corregido el 2026-10-05_: TT-105 decía «**No verificado**: Clockify podría
conservarla; depende del módulo de etiquetas.». Lo cerró PR-46 de
[la paridad de proyectos](proyectos.md) con la documentación pública, y lo
construye el slice 11 con el `on delete cascade` de la unión (PR-69).

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

### Slice 2b — el reintento de «Iniciar»

Sin comportamientos propios: hace cumplir TT-89 y TT-90 en «Iniciar» con el id
elegido por el cliente del
[ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md), y de ahí sale la
corrección de la justificación de TT-109. Contrato:
[fase1-slice2b-reintento-de-iniciar.md](../slices/fase1-slice2b-reintento-de-iniciar.md).

### Slice 2c — «Reintentar» en el alta manual

TT-89 y TT-90 en el alta manual, en la barra y en el diálogo del calendario,
con el id elegido por el cliente del
[ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md), y la
corrección de TT-109, que deja de ser una excepción. Entran por arrastre,
verificados con el id, TT-25, TT-30, TT-73, TT-77, TT-78, TT-92, TT-108,
TT-112 y el piso de fechas; de [la paridad del calendario](calendario.md),
CAL-46 y CAL-86. Va después del 12. Contrato:
[fase1-slice2c-reintentar-alta-manual.md](../slices/fase1-slice2c-reintentar-alta-manual.md),
con las correcciones de la [ronda 1](../slices/correcciones-fase1-slice2c.md),
la [ronda 2](../slices/correcciones-fase1-slice2c-ronda2.md) y las
[revisiones](../slices/correcciones-fase1-slice2c-revisiones.md).
_Corregido el 2026-10-07, piso fijo_: decía «TT-112 y el piso del workspace»; el piso pasó a ser la fecha fija de CAL-48.

- **El alta lleva un id del cliente** (TT-109): el reintento de un alta ya
  aplicada responde la entrada en el estado en que esté, sin escribir ni volver
  a validar. Con el id de una entrada ajena, o con la membresía desactivada
  (TT-92), responde el mensaje neutro de TT-79. Las reglas del alta no cambian
  de texto y corren antes de escribir.
- **El aviso es el de cualquier operación** (TT-89, TT-90): «No se pudo agregar
  la entrada.», el mensaje de red y «Reintentar». «No sabemos si la entrada se
  guardó.» deja de existir.
- **«Agregar» otra vez con el aviso a la vista reusa el id** (D2c-1), y si la
  respuesta no es lo mandado, lo tecleado queda con el aviso informativo y el
  próximo «Agregar» crea la entrada (r2-1, r3-1, r3-2).
- **«Reintentar» manda el pedido que falló en la barra y el borrador actual en
  el diálogo** (D2c-2). Con éxito, la barra se limpia con el foco en la
  descripción (TT-25), y la ventana se extiende hasta la semana de la entrada
  (TT-108), también con la respuesta que no es lo mandado.
- **En la barra el aviso sobrevive** a las demás operaciones y al cambio de
  modo (m4), con «Reintentar» inactivo mientras hay un timer en la barra
  (TT-30).
- **En el diálogo**, mientras el alta viaja no se cierra; el id pendiente
  sobrevive a cerrarlo con el aviso de falla a la vista, y se renueva cuando
  esta pestaña guarda, mueve, borra o duplica la entrada del primer intento
  (F2-1).
- **Lo que el slice decide**: nada se compara contra Clockify, que reenvía solo
  y no expone la decisión (TT-89, TT-109), así que no entra en P-14.
  - Decisiones del team-lead del 2026-10-07: D2c-1 a D2c-4 del contrato, m4 de
    la ronda 1, r2-1 de la ronda 2 con r3-1 y r3-2 de su confirmación, y, en
    las revisiones, el diálogo que no se cierra con el alta en vuelo, el id
    que sobrevive a cerrarlo y el que se renueva cuando esta pestaña cambia la
    entrada del primer intento (F2-1).
  - Límites aceptados, anotados en TT-109: el reintento que recrea una entrada
    borrada; recargar o salir de la ruta, en la barra y en el calendario, que
    renueva el id y, con el alta en vuelo, pierde el aviso informativo; el
    aviso informativo falso de F3; y la corrección que deja dos entradas.
  - Diseño propio sin referencia: los dos textos del aviso informativo, uno
    para la barra y otro para el diálogo.
- **Afuera**: bajar el aviso cuando la revalidación trae la entrada del primer
  intento (D2c-3); cerrar a mano el aviso de la barra, que pide cambiar el
  aviso que comparten todos los módulos; que el servidor diga si la respuesta
  es de un reintento, que cerraría F3; y la copia de semana del timesheet
  (TS-60), que decide el contrato del 13.

### Slice 3 — horas y fecha

TT-28, TT-29, TT-54 (horas y fecha), TT-55, TT-56, TT-75, TT-81, TT-110,
TT-111 y TT-112 en las dos ediciones de horas. Contrato:
[fase1-slice3-horas-y-fecha.md](../slices/fase1-slice3-horas-y-fecha.md).

### Slice 4 — continuar, duplicar, descartar y atajos

TT-26, TT-57, TT-58 y TT-65. Continuar y duplicar copian por ahora solo la
descripción; proyecto, tarea, etiquetas y facturable se suman cuando existan
esos campos. Contrato:
[fase1-slice4-continuar-duplicar.md](../slices/fase1-slice4-continuar-duplicar.md).

### Slice 5 — semana y paginación

TT-47, TT-48 y TT-52, y el retiro del aviso de TT-108 (P-15), con TT-46, TT-86,
TT-96 y TT-97 verificados sobre las semanas. El primer día de la semana por
persona entra como dato (PF-01, PF-16, PF-18), sin pantalla para cambiarlo.
Contrato:
[fase1-slice5-semana-y-paginacion.md](../slices/fase1-slice5-semana-y-paginacion.md).

### Slice 10 — selector de proyecto y tarea

TT-06, TT-07, TT-08, TT-10, TT-11, TT-70, TT-77, TT-87 y TT-104, y TT-49 y
TT-50 en lo que toca al proyecto: el punto de color, el proyecto y la tarea en
la fila, y «Sin proyecto» en gris y sin punto. De
[la paridad de proyectos](proyectos.md), los 24 de su §14.1. Va antes que los
slices 6 y 7. Contrato:
[fase1-slice10-selector-de-proyecto.md](../slices/fase1-slice10-selector-de-proyecto.md).

- **TT-27 y TT-54 quedan completos en lo que toca a proyecto y tarea**: se
  cambian con el timer corriendo, sin detenerlo, y desde la fila. Les faltan
  las etiquetas y el facturable.
- **Continuar y duplicar copian el proyecto y la tarea** (TT-57, TT-58), y se
  rechazan si ya no están disponibles. La recarga y el segundo dispositivo
  muestran el proyecto y la tarea del timer (TT-38, TT-39).
- **TT-92 y TT-93 se verifican por el camino nuevo**: con la membresía
  desactivada el proyecto se muestra y no se cambia, y una entrada sin proyecto
  sigue siendo válida en todo el recorrido.
- **Lo que el slice decide**: TT-07 pasa a `adaptar`; la búsqueda, «Sin
  proyecto» con el catálogo vacío y el texto y el enlace de TT-87 son diseño
  propio; el rechazo al continuar y al duplicar es diseño propio _no
  verificado_ (P-14).
- **TT-09**, crear un proyecto desde el selector, sigue fuera de alcance.

### Slice 7 — perfil

TT-02, TT-20, TT-44 y TT-106 pasan a ser de la persona, y TT-47 con ellos en el
rango de la semana. De [la paridad del perfil](perfil.md), PF-01 a PF-06, PF-09
a PF-14, PF-16, PF-30 a PF-39, PF-43, PF-44 y PF-46. Va después del 10 y antes
del 6. Cierra P-13. Contrato:
[fase1-slice7-perfil.md](../slices/fase1-slice7-perfil.md).

- **La zona, la hora y la fecha de la lista son las de la persona** (TT-02,
  TT-44, TT-47): dos personas en zonas distintas ven la misma entrada en horas
  y días distintos (PF-04), y cambiar la zona puede mover una entrada de día
  sin tocar ningún instante (TT-106, PF-38, PF-39). Quien nunca tocó su perfil
  ve los mismos rótulos que antes del slice.
- **Los campos de hora siguen el formato de la persona** (TT-20): con 12 h
  muestran y aceptan `am` y `pm` en la barra manual, en el editor de la fila y
  en el del inicio del timer (TT-18, TT-28, TT-54).
- **El cambio se ve sin recargar** (PF-33): cambiar un formato en `/perfil` y
  volver a `/` por la navegación muestra la lista y sus editores en el formato
  nuevo.
- **No cambian** el contador, que sigue en `h:mm:ss` (TT-17, PF-22), ni los
  totales y la duración de cada fila, que siguen en `h:mm` porque el formato de
  duración no entró (TT-45, PF-20).
- **Lo que el slice decide**: TT-02 pasa a `replicar`; las formas de 12 h, las
  variantes del sufijo de TT-20 y las formas cortas de fecha de TT-44 son
  diseño propio _no verificado_ (P-14, perfil P-09).
- **El calendario emergente del selector de fecha arranca la semana en lunes**,
  por el idioma, y no por el primer día de la persona (TT-48). Lo trae el
  slice 8, que va a necesitar el primer día en el cliente.

### Slice 6 — selección y acciones en masa

TT-62, TT-64 y la parte de TT-63 que no depende de proyectos: la descripción,
la hora y la fecha en bloque. Entran por arrastre, verificados por el camino
nuevo, TT-55, TT-66, TT-73, TT-79, TT-80, TT-92, TT-110, TT-111, TT-112 y la
regla de P-15 (TT-108), y de [la paridad del perfil](perfil.md), PF-13 y PF-14
en las horas del diálogo. Va después del 7 y cierra el orden 10 → 7 → 6, que
decidió el equipo. De acá sale el
[ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md), que aceptó el
equipo. Contrato:
[fase1-slice6-seleccion-y-masa.md](../slices/fase1-slice6-seleccion-y-masa.md).

- **Una operación en masa es la de una fila, repetida**: cada entrada pasa por
  las reglas y los textos de su edición o su borrado individual, y los cinco
  roles editan y borran en masa sus propias entradas (TT-66).
- **Todo o nada** (ADR 0011): una entrada que no admite el cambio frena el
  pedido entero, y el aviso la nombra con su causa y ofrece quitarla de la
  selección. En el borrado, la entrada que ya no existe no es un rechazo.
- **La hora y la fecha se reemplazan, no se desplazan**: se combinan con el
  trío de cada entrada, con TT-72 para el fin que queda antes del nuevo inicio,
  y el campo vacío del diálogo no cambia.
- **La selección es de la pestaña**: sobrevive a «Cargar más», a la
  revalidación y a la extensión de la ventana, y no a una recarga.
- **Lo que el slice decide**: TT-62 pasa a `adaptar` por la casilla siempre
  visible; el todo o nada, el campo vacío que no cambia, el reemplazo de hora y
  fecha, la selección entre días, la selección que se vacía al terminar bien y
  «BORRAR» sin distinguir mayúsculas son diseño propio _no verificado_ (P-14);
  el tope de 200 entradas es un límite propio. P-07 sigue abierto.
- **Proyecto, tarea, etiquetas y facturable en bloque** los trae el slice 12
  (su sección, abajo), después del 11, que trae las etiquetas y el facturable.
- **Afuera**: elegir un rango con Shift, la casilla por semana y «seleccionar
  todo», que la documentación no nombra; continuar y duplicar en masa, que
  Clockify no documenta; y deshacer (P-06).

### Slice 11a — facturable

TT-14 y TT-15 en la barra, en sus dos modos, en cada fila y en el diálogo del
calendario. Entran por arrastre, verificados por el camino nuevo, TT-25, TT-27,
TT-38, TT-39, TT-49, TT-50, TT-54, TT-57, TT-58 y TT-92 en lo que toca al
facturable. De [la paridad de proyectos](proyectos.md), PR-21; de
[la del calendario](calendario.md), CAL-21, CAL-23, CAL-45, CAL-66 y CAL-75 en
lo que toca al facturable (su sección 18). Es la primera parte del slice 11;
las etiquetas son el 11b. Contrato:
[fase1-slice11-etiquetas-y-facturable.md](../slices/fase1-slice11-etiquetas-y-facturable.md).

- **El control va después del selector de proyecto** en la barra y en la fila
  (TT-49), y después de «Proyecto» en el diálogo del calendario: un botón de
  alternancia que, marcado, cambia el ícono de forma además de color (TT-14).
  Con la membresía desactivada, una entrada facturable muestra el ícono y una
  no facturable, nada (TT-92).
- **El proyecto decide el facturable** (TT-14, PR-21): una entrada nueva sin
  proyecto arranca no facturable, y elegir otro proyecto —antes de iniciar, con
  el timer corriendo, en la fila o en el diálogo— le pone su facturable por
  defecto; «Sin proyecto» y cambiar solo la tarea lo conservan. Mientras el
  cambio de proyecto viaja, la barra y la fila ya muestran el facturable que
  va a escribir el servidor.
- **Con el timer corriendo** (TT-27), el facturable se guarda sobre la entrada
  abierta, sin detenerla. Mientras viaja un cambio de proyecto o de
  facturable, los dos controles de la barra esperan, así lo que se ve es lo que
  queda escrito. Recargar lo muestra (TT-38), y otro dispositivo también, por
  la misma lectura (TT-39).
- **En la fila** (TT-54, TT-55) se cambia con un clic y se guarda solo, con el
  foco en el control; la fila queda atenuada mientras viaja y, si falla, vuelve
  al valor anterior con «No se pudo cambiar el facturable.» (TT-90) y
  «Reintentar» por red (TT-89). El aviso de la barra es el mismo.
- **Continuar y duplicar copian el facturable de la original** (TT-57, TT-58),
  aunque su proyecto haya cambiado de valor por defecto después.
- **«Agregar» y «Detener» dejan la barra no facturable**, además de sin
  proyecto (TT-25). Si mientras el alta viajaba se cambió el facturable, «Agregar»
  lo conserva; si se eligió otro proyecto, el facturable que quedó igual al enviado
  vuelve al por defecto de ese proyecto (decisión D-7 del team-lead, 2026-10-05).
- **Lo que el slice decide**: todo el facturable es diseño propio que no se
  puede verificar en el plan Free (P-16 de la paridad de proyectos), así que no
  entra en P-14: el control y sus nombres accesibles, la forma del ícono
  marcado, la regla del proyecto, que decidió el equipo el 2026-10-05, y la
  copia al continuar y al duplicar. PR-21 es `adaptar`: el facturable por
  defecto se elige al crear el proyecto y no se edita después en la fase 1.
- **Afuera**: las etiquetas (TT-12, TT-78, TT-88), que trae el 11b; el
  facturable en la edición masiva (resto de TT-63), que trae el slice 12 (su
  sección, abajo); y las tarifas e importes (TT-15).

### Slice 11b — etiquetas

TT-12, TT-78 y TT-88 en la barra, en sus dos modos, en cada fila y en el
diálogo del calendario, y TT-105 en la base. Entran por arrastre, verificados
por el camino nuevo, TT-25, TT-27, TT-38, TT-39, TT-49, TT-50, TT-54, TT-57,
TT-58, TT-61 y TT-92 en lo que toca a las etiquetas. De
[la paridad de proyectos](proyectos.md), PR-42 … PR-44, PR-47, PR-48, PR-52,
PR-68, PR-69, PR-73, PR-80, PR-88 y PR-112, y la parte de etiquetas de PR-53,
PR-54, PR-58 y PR-62; de [la del calendario](calendario.md), CAL-23, CAL-45 y
CAL-66 en lo que toca a las etiquetas (su sección 18). Es la segunda parte del
slice 11. Contrato:
[fase1-slice11-etiquetas-y-facturable.md](../slices/fase1-slice11-etiquetas-y-facturable.md),
con las correcciones del
[arranque](../slices/correcciones-fase1-slice11b-arranque.md) y de las
[revisiones](../slices/correcciones-fase1-slice11b-revisiones.md).

- **Las etiquetas se crean en `/proyectos`** (PR-112): «Nueva etiqueta» en la
  cabecera, para toda membresía activa (PR-44), y la sección «Etiquetas» con
  las activas. El selector no crea (TT-13): con el workspace sin etiquetas dice
  «No hay etiquetas todavía», con el enlace «Ir a Proyectos» (TT-88).
- **El selector va entre el proyecto y el facturable**, en el orden de TT-49,
  en la barra, en la fila y en el diálogo del calendario. Sin etiquetas, el
  ícono con «Etiquetas» en la barra, y solo el ícono, en gris, en la fila
  (TT-50); con etiquetas, el ícono marcado y los nombres en orden alfabético,
  separados por coma y recortados. Con la membresía desactivada, los nombres
  como texto, y nada sin etiquetas (TT-92).
- **Por dentro** (TT-12): una casilla por opción; la búsqueda de TT-07; Enter
  marca la opción resaltada sin cerrar y Espacio escribe; escribir resalta la
  primera coincidencia; marcar no borra la búsqueda, que vuelve vacía al
  reabrir. `Escape`, un clic afuera o `Tab` cierran, con el foco de vuelta en
  el botón.
- **Con el timer corriendo y en la fila** (TT-27, TT-54), el conjunto se guarda
  al cerrar el selector, entero, en un solo pedido y solo si cambió: cerrar sin
  cambios no manda nada. La fila queda atenuada mientras viaja (TT-55) y, si
  falla, vuelve a las etiquetas de antes con «No se pudieron cambiar las
  etiquetas.» y «Reintentar» por red. El aviso de la barra es el mismo.
  Mientras viaja un cambio de proyecto, de facturable o de etiquetas, los tres
  controles esperan. Recargar muestra las etiquetas del timer (TT-38), y otro
  dispositivo también, por la misma lectura (TT-39).
- **Sin timer y en el diálogo**, el selector cambia solo el borrador, que viaja
  con «Iniciar», «Agregar» o «Guardar». «Agregar» y «Detener» dejan la barra
  sin etiquetas (TT-25); si mientras el alta viajaba se cambiaron, «Agregar»
  conserva las nuevas. Si la barra cambia de modo con el selector abierto, el
  selector se cierra sin elegir y el foco vuelve a su botón en la barra nueva.
- **Si el timer cambia con el selector de la barra abierto**, cerrarlo descarta
  lo elegido y no manda nada (TT-12).
- **Una etiqueta archivada** (PR-47, PR-68) sigue en la fila y en el diálogo
  de la entrada que la tiene, y el selector de esa entrada la ofrece marcada,
  en gris y con «(archivada)»; desmarcada, no vuelve. La barra no la ofrece.
  Conservarla mientras se agrega otra no la valida de nuevo. Asignarla responde
  «Esa etiqueta ya no está disponible.» (TT-78), también desde un borrador que
  la eligió antes del archivado: «Iniciar» falla con «No se pudo iniciar el
  timer.», sin «Reintentar», sin timer y con el borrador intacto.
- **Continuar y duplicar copian las etiquetas** de la original (TT-57, TT-58).
  Con una archivada responden TT-78 y no crean nada, y continuar no detiene el
  timer que corría.
- **Hasta 50 por entrada** (PR-48): con más, el servidor responde «Se pueden
  elegir hasta 50 etiquetas por entrada.».
- **TT-105 y TT-61**: borrar una etiqueta la quita de sus entradas, que
  conservan las horas y las demás etiquetas; como en la fase 1 nada borra
  etiquetas, lo prueba un borrado directo en la base. Borrar, descartar o
  borrar en masa una entrada guarda sus etiquetas en la constancia.
- **Lo que el slice decide**:
  - _No verificado_ (P-14): dentro de TT-12, el botón con los nombres, la
    búsqueda, el guardado al cerrar, las casillas, Enter y Espacio, el
    resaltado al escribir y la búsqueda que queda después de marcar; la fila
    sin etiquetas (TT-50); y el rechazo de continuar y duplicar con una
    archivada (TT-57, TT-58). La documentación no describe ninguno: lo
    consultado está en TT-12.
  - Decisiones del equipo que viven en la paridad de proyectos: el alta en
    `/proyectos` (PR-112, `adaptar`), el tope de 50 (PR-48) y la archivada
    marcada en el selector (PR-47). Las dos últimas, _no verificadas_ (P-33 de
    esa paridad).
  - Diseño propio sin referencia: el selector inactivo mientras viaja un
    cambio, el descarte con el timer cambiado, `Escape` con la lista vacía,
    «Etiquetas: » para el lector de pantalla en solo lectura y el ancho de la
    fila (TT-49).
- **Afuera**: crear una etiqueta desde el selector (TT-13); editar, archivar,
  restaurar y borrar etiquetas (PR-45, PR-46), de la fase 2; limitar quién crea
  etiquetas (PR-44), que no tiene configuración en la fase 1; y las etiquetas
  en la edición masiva (resto de TT-63), que trae el slice 12 (su sección,
  abajo).

**Los anchos** (TT-49). La descripción ocupa lo que queda libre y la línea se
parte cuando no le quedan 112 px; el proyecto mide hasta 256 px y las
etiquetas hasta 160 px. Medido por `frontend-dev` con un proyecto de 191 px; el
margen es lo que sobra en la línea, en px:

| Caso                                          | 1400 y 1024 px       | 768 px                        |
| --------------------------------------------- | -------------------- | ----------------------------- |
| Barra parada, proyecto y 3 etiquetas          | 1 línea (margen 41)  | 2: baja el contador           |
| Barra con timer, proyecto y 3 etiquetas       | 2: baja el contador  | 3                             |
| Barra con timer, vacía                        | 2                    | 3                             |
| Fila, proyecto y 3 etiquetas                  | 1 línea (margen 6)   | 2: baja el bloque del horario |
| Fila, proyecto sin etiquetas                  | 1 línea (margen 110) | 2                             |
| Fila, proyecto al tope (256 px) y 3 etiquetas | 2 (faltan ~59 px)    | 2                             |

La barra con el timer no entra en una línea ni vacía: con el timer, el texto
de TT-30, «Detené el timer para agregar tiempo a mano.», ocupa 281 px. Pasa
desde el 11a y este slice no lo resuelve. En la fila más cargada, la
descripción queda en unos 14 caracteres visibles al editarla.

### Slice 12 — edición masiva de proyecto, etiquetas y facturable

El resto de TT-63: el proyecto y la tarea —también «Sin proyecto»—, las
etiquetas agregando o reemplazando, y el facturable, en el diálogo «Editar N
entradas». Entran por arrastre, verificados por el camino nuevo, TT-14 con la
regla D-2 del slice 11, TT-08, TT-70, TT-77, TT-78, TT-104, TT-110, TT-111,
TT-55, TT-79, TT-80, TT-89, TT-90, TT-92 y la regla de P-15 (TT-108); de
[la paridad de proyectos](proyectos.md), PR-47, PR-48, PR-68 y PR-74. Cierra el
rastreador: con este slice no queda nada de este documento sin slice, salvo lo
fuera de alcance. De acá sale el
[ADR 0017](../adr/0017-las-referencias-de-una-masiva-se-validan-una-vez.md),
que aceptó el usuario el 2026-10-07. Contrato:
[fase1-slice12-edicion-masiva.md](../slices/fase1-slice12-edicion-masiva.md),
con las correcciones de la [ronda 1](../slices/correcciones-fase1-slice12.md),
la [ronda 2](../slices/correcciones-fase1-slice12-ronda2.md) y las
[revisiones](../slices/correcciones-fase1-slice12-revisiones.md).

- **La edición masiva sigue siendo la de una fila, repetida** (ADR 0011,
  ADR 0013): el par, el facturable y las etiquetas de cada entrada salen de la
  misma regla que su edición individual, y cada rechazo lleva el texto de esa
  edición. Los cinco roles editan en masa sus propias entradas (TT-66).
- **El diálogo** suma «Proyecto», «Etiquetas» con «Cómo se aplican las
  etiquetas» y «Facturable», cada una con su «Sin cambios», entre
  «Descripción» y «Fecha». «No cambiar el proyecto» y «No cambiar las
  etiquetas» vuelven a «Sin cambios» con el foco en el disparador, y `Escape`
  con un selector abierto cierra solo el selector. El diálogo no pasa del alto
  de la ventana.
- **El facturable sigue D-2 en cada entrada** (D12-5): con un proyecto y el
  facturable en «Sin cambios», la que cambia de proyecto toma el por defecto y
  la que ya estaba en él o pasa a «Sin proyecto» conserva el suyo, con una
  ayuda a la vista; «Sí» o «No» gana en todas.
- **«Agregar» suma, «Reemplazar» deja las elegidas**, y «Reemplazar» sin
  ninguna deja las entradas sin etiquetas, con aviso (D12-3).
- **Lo archivado que la entrada ya tiene se conserva y no se valida**: un
  pedido que solo pide lo que todas ya tienen termina bien aunque esté
  archivado.
- **Una referencia no disponible frena el pedido entero**, sin lista y sin
  «Reintentar», después de las entradas y con el proyecto antes que la
  etiqueta (ADR 0017). **Más de 50 etiquetas en una entrada** es un rechazo de
  esa entrada, con el texto de PR-48 (D12-4).
- **La entrada que corre no es una fila** (TT-111): se rechaza aunque el
  cambio sea solo de proyecto, etiquetas o facturable. **Una de más de un
  día** (TT-110) cambia de proyecto sin rechazo.
- **El reintento llega a un punto fijo** (TT-89), también si lo pedido se
  archiva entre los dos intentos.
- **Lo que el slice decide**:
  - Documentado, confirmado literal el 2026-10-07: el proyecto, las etiquetas
    y el facturable entre los campos de la edición masiva del rastreador, y los
    modos «Add to existing» y «Overwrite existing» de las etiquetas (TT-63).
  - _No verificado_ (P-14, dentro de TT-63): «Reemplazar» sin etiquetas las
    quita; una referencia no disponible frena todo y el proyecto responde
    antes que la etiqueta; el rechazo de la entrada con más de 50 y el de la
    que corre con un cambio que no toca el horario; el orden de las
    secciones, los nombres de los modos, «Sin cambios» y los controles que
    vuelven a él. Y, como todo TT-62 a TT-64, si la edición masiva del
    rastreador es del plan Free (P-07).
  - No se puede verificar en el plan Free (P-16 de la paridad de proyectos),
    así que no entra en P-14: el facturable por entrada (D12-5) y las opciones
    «Sin cambios», «Sí» y «No».
  - Diseño propio sin referencia: las entradas antes que las referencias, el
    punto fijo del reintento con lo pedido archivado en el medio y el diálogo
    con los campos desplazables.
- **Afuera**: crear un proyecto o una etiqueta desde el diálogo (TT-09,
  TT-13); elegir un proyecto o una etiqueta archivados; vaciar la descripción
  en bloque (deuda del 6); continuar, duplicar y descartar en masa, que
  Clockify no documenta; y marcar en la lista las entradas rechazadas (deuda
  del 6).

### Lo que queda

Nada del rastreador queda sin slice. Lo que no se construye en la fase 1 es lo
marcado `fuera de alcance`, cada uno con su justificación: crear un proyecto o
una etiqueta desde el selector (TT-09, TT-13), el contador en el título de la
pestaña (TT-33), la agrupación de entradas similares (TT-53, P-09), dividir
(TT-59, P-05), el bloqueo por aprobación o por cierre de período (TT-67, P-02),
el redondeo (TT-83, P-03) y los campos obligatorios y forzar timer (TT-84,
P-01).

_Corregido el 2026-10-03, decisión del equipo_: esta lista incluía lo que ya
implementaron los slices 3 y 4, que ahora tienen su sección, y no nombraba el
slice 2b.
_Corregido el 2026-10-03, slice 5_: salen de esta lista el total y el
encabezado de semana (TT-47, TT-48) y «Cargar más» con el extremo nuevo de la
ventana (TT-52), que ahora tienen su sección.
_Corregido el 2026-10-04, slice 10_: sale de esta lista el selector de proyecto
y tarea (TT-06 … TT-11), que ahora tiene su sección; TT-09 sigue fuera de
alcance.
_Corregido el 2026-10-04, slice 6_: salen de esta lista la selección (TT-62),
el borrado masivo (TT-64) y la edición masiva de descripción, hora y fecha
(TT-63), que ahora tienen su sección; de TT-63 queda lo que trae el slice 12.
_Corregido el 2026-10-05, slice 11_: no decía qué slice trae cada cosa ni que
continuar y duplicar suman las etiquetas y el facturable con el 11.
_Corregido el 2026-10-05, slice 11a_: sale de esta lista el facturable (TT-14,
TT-15), con su copia al continuar y al duplicar, que ahora tiene su sección.
_Corregido el 2026-10-07, slice 11b_: salen de esta lista las etiquetas
(TT-12), con su copia al continuar y al duplicar, que ahora tienen su sección.
_Corregido el 2026-10-07, slice 12_: decía «La edición masiva de proyecto,
tarea, etiquetas y facturable (el resto de TT-63), que trae el 12.». Sale de
esta lista, que ahora tiene su sección, y no queda nada salvo lo fuera de
alcance.

## Pendientes de definición del equipo

### Abiertos

Ninguno de estos puntos se puede relevar en el plan Free o no está en la
documentación pública. No los inventé: van con una propuesta cuando la tengo,
pero necesitan una decisión.

| ID   | Punto                                                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Campos obligatorios (`requireProject`, `requireTask`, `requireDescription`, `requireTag`) y `forceTimer`: existen en el esquema pero son de plan pago. ¿Se implementan, y con qué reglas?                   |
| P-02 | Aprobaciones y bloqueo de períodos: definen cuándo una entrada deja de ser editable. Sin ellas no hay bloqueo.                                                                                              |
| P-03 | Redondeo (`roundingMinutes`): en Clockify es pago y solo afecta reportes. ¿Se mantiene fuera del rastreador?                                                                                                |
| P-04 | Entradas superpuestas: ¿se permiten en silencio, se avisa o se rechazan?                                                                                                                                    |
| P-05 | Dividir entrada: funcionalidad paga. ¿Entra en el alcance y con qué reglas de corte?                                                                                                                        |
| P-07 | Edición masiva en el rastreador: no sé si está en Free. Confirmar en el workspace. Los slices 6 y 12 se construyeron como si entrara: si es paga, TT-62 a TT-64 quedan como mejora deliberada (TT-63).      |
| P-09 | Agrupación de entradas similares en una fila colapsable. El interruptor vive en el perfil (PF-26).                                                                                                          |
| P-14 | Verificar en el workspace real del equipo lo marcado como _no verificado_: TT-12, TT-16, TT-20, TT-26, TT-35, TT-44, TT-46, TT-47, TT-50, TT-57, TT-58, TT-62, TT-63, TT-64, TT-65, TT-108, TT-111, TT-112. |

_Corregido el 2026-10-04, slice 6_: P-07 decía «decidir si entra en la fase 1»;
entró con el slice 6. P-14 suma TT-62 y TT-64.
_Corregido el 2026-10-05, slice 11_: P-14 suma TT-12 y TT-50, por las
etiquetas, y saca TT-105, que cerró PR-46 de
[la paridad de proyectos](proyectos.md). El facturable (TT-14) no entra: no se
puede verificar en el plan Free (P-16 de esa paridad).
_Corregido el 2026-10-07, slice 11b_: P-14 no suma identificadores. Lo que el
11b decide sin verificar es parte de TT-12 —las casillas, Enter y Espacio, el
resaltado al escribir y la búsqueda que queda después de marcar— y está
anotado ahí, junto con el rechazo de continuar y duplicar con una etiqueta
archivada, que sigue en TT-57 y TT-58.
_Corregido el 2026-10-07, slice 12_: P-07 decía «El slice 6 se construyó como
si entrara»; el 12 suma el proyecto, la tarea, las etiquetas y el facturable
en bloque con la misma condición. La página de edición masiva, consultada ese
día, sigue sin nombrar ningún plan (TT-63). P-14 no suma identificadores: lo
que el 12 decide sin verificar es parte de TT-63 y está anotado ahí; lo del
facturable no entra, por P-16 de [la paridad de proyectos](proyectos.md).

### Cerrados

Se dejan con su identificador porque los contratos de slice los citan.

| ID   | Decisión                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-06 | Borrado con diálogo de confirmación y sin deshacer para la fase 1. El audit log guarda la fila borrada (TT-61).                                                                                                                                                        |
| P-08 | Sin duración máxima por entrada (TT-74). Su consecuencia visible en la fila es TT-110.                                                                                                                                                                                 |
| P-10 | La fecha futura se acepta, como en Clockify (TT-76, TT-99). El slice 2 llegó a implementar el rechazo y el equipo lo revirtió el 2026-10-02: inventaba una pared que la herramienta no tiene. Si alguna vez se quiere, entra como mejora deliberada y no como paridad. |
| P-11 | La pantalla revalida al enfocar, al volver a ser visible y cada 60 segundos mientras está visible (TT-40).                                                                                                                                                             |
| P-12 | Un timer abandonado se deja correr: no hay corte automático (TT-42).                                                                                                                                                                                                   |
| P-13 | Zona horaria y formatos son de la persona desde el slice 7 (TT-02): los elige en `/perfil`, y el primer día de la semana es el de su membresía (TT-48). `workspace.timezone` solo fija el día del cron (PF-05).                                                        |
| P-15 | Cuando llegue TT-52 se retira el aviso de TT-108 y la ventana se extiende hasta el día de la entrada recién creada. Decidido el 2026-10-02.                                                                                                                            |

_Corregido el 2026-10-03, slice 5_: en P-13, el primer día de la semana ya no
sale del workspace. Pasó a `membership`, por persona (PF-01, M4 de la ronda 1
del slice 5); ver TT-48. La zona horaria y los formatos siguen saliendo del
workspace.
_Corregido el 2026-10-03, slice 5_: en P-15, con la ventana en semanas enteras
(TT-52), «hasta el día» se cumple llegando a la semana de ese día. Y la regla
vale para toda mutación que devuelve una entrada, no solo para el alta
(TT-108).
_Corregido el 2026-10-04, slice 7_: P-13 decía que la zona horaria y los
formatos salían del workspace en toda la fase 1 y que el perfil no los movía.
El equipo puso el perfil en la fase 1, con el orden 10 → 7 → 6, y el slice 7
los pasó a la persona; la nota anterior, del slice 5, describe el estado de ese
momento.
