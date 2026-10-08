# Paridad: perfil

Alcance de este documento: los ajustes de la persona que cambian cómo se ve y
cómo se calcula el resto de la aplicación —zona horaria, formato de fecha,
formato de hora, primer día de la semana, formato de duración, tema, nombre y
foto—, y la pantalla desde la que se tocan. No cubre la administración del
equipo, los objetivos semanales ni las notificaciones por correo, salvo para
nombrar dónde terminan.

Cada comportamiento lleva un identificador `PF-nn` y una marca `replicar`,
`adaptar` o `fuera de alcance`. Las dos últimas llevan una línea de
justificación. Las referencias `TT-nn` apuntan a
[la paridad del rastreador](time-tracker.md).

## Fuentes y límites del relevamiento

- https://clockify.me/help/users/profile-settings
- https://clockify.me/help/users/user-settings
- https://clockify.me/help/track-time-and-expenses/duration-format
- https://clockify.me/help/billing/updates-to-clockify-free-plan
- https://docs.clockify.me/ (endpoint de perfil de miembro: `weekStart`,
  `workingDays`)

**No pude entrar al workspace real del equipo**: no tengo credenciales de
Clockify en este entorno. Lo marcado como _no verificado_ hay que confirmarlo
abriendo el workspace antes de implementarlo, y está todo junto en P-09.

**Ningún valor predeterminado está documentado.** La documentación enumera los
ajustes y sus opciones, pero no dice con qué valor arranca ninguno. Los
predeterminados que usa este documento los **fijó el equipo el 2026-10-02**
(P-03): son una decisión nuestra, no un relevamiento, y no se leen como
paridad verificada. Si una cuenta nueva de Clockify arranca con otros, se
cambian, que es una línea por valor.

## Vocabulario

| Clockify          | Clock (interfaz en español) |
| ----------------- | --------------------------- |
| Profile settings  | Perfil                      |
| Preferences       | Preferencias                |
| Time zone         | Zona horaria                |
| Date format       | Formato de fecha            |
| Time format       | Formato de hora             |
| Week start        | Primer día de la semana     |
| Duration format   | Formato de duración         |
| Theme / Dark mode | Tema                        |
| Start of day      | Inicio del día              |
| Profile picture   | Foto                        |

## 1. Dónde vive cada ajuste y qué gana

Esta es la pregunta de la precedencia, y la respuesta del relevamiento es que
**en Clockify no hay precedencia que resolver: cada valor vive en un solo
lugar**. No existe ningún ajuste que esté a la vez en el perfil y en el
workspace, así que nunca hay dos candidatos para el mismo dato.

| Ajuste                   | Dónde vive en Clockify                                 | Quién lo cambia |
| ------------------------ | ------------------------------------------------------ | --------------- |
| Nombre, foto, email      | Cuenta centralizada de CAKE.com, fuera de Clockify     | La persona      |
| Zona horaria             | Perfil                                                 | La persona      |
| Formato de fecha         | Perfil                                                 | La persona      |
| Formato de hora          | Perfil                                                 | La persona      |
| Inicio del día           | Perfil                                                 | La persona      |
| Tema                     | Perfil                                                 | La persona      |
| Idioma                   | Perfil                                                 | La persona      |
| Agrupar entradas         | Perfil                                                 | La persona      |
| **Primer día de semana** | Perfil de la persona, pero **escrito desde el equipo** | Admin u owner   |
| **Formato de duración**  | Ajustes del workspace, pestaña General                 | Workspace       |

La tabla sigue a la documentación. «Inicio del día» figura en ella, pero en el
perfil del workspace del equipo no hay ningún ajuste parecido (PF-15).

Las dos filas en negrita son las que rompen la intuición de «todo lo del perfil
lo decide la persona»:

**PF-01 El primer día de la semana es por persona pero lo fija un admin** —
`replicar`
Documentado y literal: «You cannot change the start of the week from your
personal Profile Settings. The 'Week start' is an administrative setting», y un
admin lo edita desde el perfil de esa persona en la pantalla de equipo. En la
API es un campo del perfil de miembro, con los valores `MONDAY`, `TUESDAY`,
`WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY`, `SUNDAY`. Es decir: el dato es
por persona y por workspace, y la escritura es del admin. La pantalla de perfil
lo muestra en solo lectura.
Decidido por el equipo el 2026-10-02: el campo va en `membership`, que es la
tabla por persona y por workspace, y lo edita un admin.

**PF-02 El formato de duración es del workspace** — `replicar`
Documentado: vive en los ajustes del workspace, pestaña General, y no en el
perfil. Una persona no puede ver las duraciones en otro formato que el resto
del equipo.
_No verificado_: la documentación no dice qué rol puede cambiarlo. Suponer
admin y owner, como el resto de los ajustes de workspace, y confirmarlo.

**PF-03 Los ajustes del perfil son de la cuenta, no del workspace** —
`adaptar`
En Clockify el perfil es de la cuenta y vale en todos los workspaces a los que
la persona pertenezca; solo el primer día de la semana es por membresía.
Justificación: el proyecto tiene un solo workspace, así que la distinción no se
puede observar. Igual conviene modelarla como en Clockify —preferencias
colgando de la persona, primer día de la semana colgando de la membresía—
porque cuesta lo mismo ahora y evita una migración si algún día hay dos.
Decidido por el equipo el 2026-10-02: las preferencias van en una tabla propia,
**nunca como columnas de `user`**, porque esa tabla la regenera
`npm run auth:schema` y cualquier columna nuestra se perdería.

**PF-04 Un cambio del perfil solo afecta a quien lo hace** — `replicar`
Documentado: «Changes in the Profile settings will only affect your individual
view and will not alter the workspace for your team members or managers», y
sobre la zona horaria, que no altera «the workspace view or reports for your
colleagues or workspace owners». Dos personas en husos distintos ven la misma
entrada con horas distintas, y cada una la agrupa en el día que le corresponde
a su huso.

**PF-05 Clockify no tiene zona horaria de workspace** — `adaptar`
No encontré ningún ajuste de zona horaria a nivel de workspace en la
documentación: la zona horaria es siempre de la persona. Nuestro
`workspace.timezone` no tiene equivalente y hasta el slice 7 cumplía dos papeles
distintos: decidir el día de los trabajos de cron y, provisoriamente, formatear
la interfaz de todo el mundo (P-13 del rastreador, TT-02).

Decidido por el equipo el 2026-10-02: **`workspace.timezone` se queda, con un
solo trabajo.** Cuando llegue el perfil, la zona horaria de la interfaz sale de
la persona y la del workspace queda **solo** para fijar el día de los trabajos
de cron. No sobra y no se borra: el cron corre sin nadie conectado y necesita
una zona horaria que no dependa de ninguna persona. Es una necesidad nuestra,
no un comportamiento de Clockify, y por eso no tiene paridad que cumplir.

Justificación del `adaptar`: el ajuste no existe en Clockify y nosotros lo
conservamos para una restricción propia.
_No verificado_: que no exista el ajuste es una ausencia en la documentación,
no una afirmación de la documentación. Confirmar en el workspace.

_Corregido el 2026-10-04, slice 7_: decía que `workspace.timezone` «hoy»
formatea la interfaz. Desde el slice 7 la zona de la interfaz es la de la
persona (PF-11), cambiar `workspace.timezone` no cambia ninguna pantalla, y el
predeterminado de la persona es un valor y no un vínculo con esta columna.

## 2. Identidad: nombre, foto, correo

**PF-06 El correo y la contraseña se administran fuera de la aplicación** —
`adaptar`
Clockify delega la identidad entera en el portal de cuenta de CAKE.com y el
perfil solo tiene un botón que lleva ahí. Acá la identidad la da el login con
Google: el correo no se puede cambiar porque es la identidad y no hay
contraseña que administrar. Justificación: el proveedor de identidad es el
equivalente del portal de cuenta.

_Agregado el 2026-10-05, slice 7b_: documentado y literal: «If you need to
update your email address, username, password, or profile picture, click the
Manage CAKE.com Account button.» **El correo no cambia tampoco cuando Google
trae otro**: cada ingreso escribe en la cuenta el nombre y la foto de Google
(PF-45), y el correo queda el que tenía al crearse. Si la empresa cambia la
dirección de una persona, la cuenta sigue entrando y el perfil muestra la
vieja (PF-48).

**PF-07 El nombre se edita dentro de la aplicación** — `replicar`
Clockify deja cambiar el nombre, aunque sea desde el portal de cuenta. Acá se
edita en la pantalla de perfil, con un campo de texto que guarda como el resto
(PF-32). El valor inicial es el que llegó de Google.
Decidido por el equipo el 2026-10-02.
**No se implementa sin resolver antes PF-08.**

_Agregado el 2026-10-05, slice 7b_: implementado, con PF-08 resuelto. El campo
«Nombre» está en «Datos de la cuenta» y muestra el nombre editado o, si no hay,
el de Google. Guarda al salir o con Enter (PF-32), y lo que sigue es decisión
del slice, sin paridad que relevar:

- **El nombre se guarda recortado**, sin espacios en los extremos. Con solo
  espacios es «Escribí un nombre.» (PF-35).
- **`Esc` descarta lo escrito** y vuelve al guardado, sin pedido, como en la
  edición en línea (TT-55). Salir del campo o Enter con el mismo nombre no hace
  ningún pedido.
- **Después de guardar, el campo muestra el nombre guardado**, también si sigue
  con foco: el recortado si se guardó, el anterior si falló.
- **Sin permiso, el nombre se ve en el campo, en solo lectura** (PF-46).

El nombre editado no pasa por `/api/auth/update-user`, que sigue cerrada
(PF-09).
_No verificado_: que el «username» de la cita de PF-06 sea el nombre que
Clockify muestra.

**PF-08 El nombre editado no lo pisa Google** — `adaptar`
Si alguien edita su nombre y después vuelve a iniciar sesión, gana el nombre
editado: el que llega de Google se usa al crear la cuenta y no después.
Justificación: Clockify no tiene este problema porque el nombre vive en un solo
lugar; acá hay dos orígenes y hace falta decir cuál manda.

**Esto es una condición para implementar PF-07, no una observación.** Hoy
`src/server/auth.ts` mapea `{ name: profile.name, image: profile.picture }`
desde el perfil de Google. Antes de escribir una sola línea del nombre
editable hay que comprobar **cuándo corre ese mapeo**. Si corre en cada inicio
de sesión, el nombre editado se pisa solo con volver a entrar, sin que nadie
toque nada y sin ninguna forma de que la persona entienda por qué: no es una
duda de diseño, es un defecto que se activa el primer lunes a la mañana. La
corrección, si ese es el caso, es que el mapeo escriba el nombre **solo al
crear la cuenta**.

_Corregido el 2026-10-05, slice 7b_: decía que el nombre de Google se usa al
crear la cuenta y no después, y que la corrección era escribirlo solo al
crearla. El slice 7b lo resolvió de otra forma, para cumplir también PF-45:
**el nombre de Google llega a la cuenta en cada ingreso, y el editado vive
aparte y gana siempre**. Se muestra el editado si hay uno, y el de Google si
no.

**Escribir el nombre de Google después de haber editado otro lo guarda como
editado** (decisión D1 del
[contrato del slice 7b](../slices/fase1-slice7b-perfil-nombre-y-tema.md)):
desde ese momento, un cambio de nombre en Google no llega, y no hay forma desde
la pantalla de volver a seguirlo (perfil P-10). Quien nunca editó el suyo no
hace ningún pedido al escribirlo, porque es el texto que el campo ya muestra.
Es la regla de las preferencias: elegir el predeterminado también lo guarda.

**PF-09 La foto sale de Google y no se puede cambiar** — `adaptar`
Clockify permite cambiar la foto desde el portal de cuenta. Acá la foto es la
de Google, en solo lectura, con una nota de dónde sale.
Justificación, decidida por el equipo el 2026-10-02: es una **divergencia
deliberada**, y el motivo es el costo, no el comportamiento. Editar el nombre
es un campo de texto y una action; cambiar la foto necesita subida de archivos
a Blob, que no tiene ninguna otra necesidad en la fase 1 y arrastra validación
de tipo y de tamaño. La divergencia se levanta cuando exista otra necesidad de
subir archivos: el logo del workspace, que es de la fase 2.

_Agregado el 2026-10-04, slice 7_: **la identidad no se cambia desde la
aplicación por ningún camino.** Better Auth traía una ruta propia,
`/api/auth/update-user`, que dejaba a cualquier sesión escribir su nombre y su
foto; el slice 7 la cierra. Y la foto solo se muestra si su dirección es de
`lh3.googleusercontent.com`: con cualquier otra se ven las iniciales (PF-44).
El nombre editable del slice 7b no va a pasar por esa ruta (PF-07, PF-08).

**PF-10 La foto se muestra donde hoy solo hay nombre** — `adaptar`
El menú de usuario del encabezado muestra hoy el nombre y el correo como
atributo `title`. Con el perfil pasa a mostrar la foto, y el nombre y el correo
dentro del menú desplegable, con el enlace al perfil. Justificación: la foto ya
llega en la sesión (`image`) y no se usa en ningún lado.

## 3. Preferencias de tiempo

**PF-11 Zona horaria** — `replicar`
Un selector con las zonas horarias, bajo «Hora y fecha». Afecta a cómo se
muestran todas las horas y a dónde cae el corte de cada día y de cada semana.
Predeterminado decidido por el equipo el 2026-10-02 y confirmado el
2026-10-03, **como decisión nuestra y no como relevamiento**: el valor fijo
`America/Argentina/Buenos_Aires`, **no un vínculo con `workspace.timezone`**.
Hoy los dos coinciden, así que activar el perfil no movió ningún día de lugar;
y como es un valor, si la zona del workspace cambia para el cron, nadie que no
haya elegido una zona se mueve de día (PF-05). El predeterminado no se guarda:
quien nunca eligió no tiene valor guardado y ve el de omisión.
_No verificado_: si Clockify la detecta del navegador al crear la cuenta.

_Agregado el 2026-10-04_. Diseño propio, fijado en el
[contrato del slice 7](../slices/fase1-slice7-perfil.md): la documentación no
describe el selector.

- **Las zonas se comparan por su forma canónica**, no por el texto. La lista
  del entorno nombra cada zona por su forma canónica de CLDR y no trae los
  alias: no está `America/Argentina/Buenos_Aires`, sino
  `America/Buenos_Aires`, que el entorno resuelve como la misma zona. Por eso
  el predeterminado aparece elegido como `America/Buenos_Aires`. Una zona se
  guarda tal como se eligió, sin normalizarla.
- **Las opciones** son las zonas que lista el entorno, más `UTC`, que se agrega
  aunque el entorno no la liste, en orden alfabético y cada una con su
  desplazamiento de ese momento (`UTC−03:00`, `UTC+05:45`). Las `Etc/GMT±n` no
  se ofrecen. La lista sale del servidor, para que lo que se ofrece sea lo que
  se acepta (PF-35).
- **El buscador encuentra por cualquier parte del nombre, sin distinguir
  mayúsculas ni acentos y con `_` leído como espacio**, en la búsqueda y en el
  nombre, como el selector de proyecto (TT-07): `tokyo` encuentra
  `Asia/Tokyo`; `buenos`, `buenos aires`, `Buenos_Aires` —tal como se ve en el
  selector— y `america/buenos_aires` encuentran `America/Buenos_Aires`;
  `Bogotá` encuentra `America/Bogota`. Se rotula «Buscar zona horaria» y, sin
  coincidencias, la lista dice «Ninguna zona horaria coincide con la
  búsqueda.»
- **Una tecla sobre el selector cerrado no cambia la zona**: hay que abrirlo y
  elegir.
- **Una zona guardada que el entorno deja de listar sigue valiendo** mientras
  la sepa convertir, y aparece entre las opciones. Una que ya no sabe
  convertir cae al predeterminado, en vez de dejar a la persona sin pantalla.
  La lista depende de la versión de Node, que puede sumar, renombrar o cambiar
  la forma canónica de una zona.
- **Límite conocido: los nombres viejos de CLDR.** La lista trae
  `Asia/Calcutta` y `Asia/Katmandu`, que son las formas canónicas de CLDR, y no
  `Asia/Kolkata` ni `Asia/Kathmandu`: «kolkata» no encuentra nada. Una tabla de
  alias quedó fuera del slice 7.

_Corregido el 2026-10-04, slice 7 (decisión del equipo)_: el predeterminado
decía «la zona horaria del workspace», con el valor entre paréntesis, y se
podía leer como un vínculo con `workspace.timezone` que le devolvería a esa
columna el segundo trabajo que PF-05 le sacó.

**PF-12 Formato de fecha** — `replicar`
Un selector bajo «Hora y fecha». La documentación lo nombra pero **no enumera
las opciones**, así que la lista no se pudo relevar. Lista propuesta, que cubre
lo que la aplicación necesita: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd` y
`MM/dd/yyyy`. Cada opción muestra de ejemplo el día de hoy en la zona de la
persona, con año.
Predeterminado decidido por el equipo el 2026-10-02: `dd/MM/yyyy`.
_No verificado_: qué opciones ofrece Clockify y con cuál arranca.

_Agregado el 2026-10-04_. Decisión nuestra, sin verificar, fijada en el
[contrato del slice 7](../slices/fase1-slice7-perfil.md): **cada formato tiene
una forma corta, sin año**, que usan los rótulos de día y de semana del año en
curso (TT-44, TT-47); los de otro año usan la larga.

| Formato      | Con año      | Sin año |
| ------------ | ------------ | ------- |
| `dd/MM/yyyy` | `03/10/2026` | `03/10` |
| `dd-MM-yyyy` | `03-10-2026` | `03-10` |
| `yyyy-MM-dd` | `2026-10-03` | `10-03` |
| `MM/dd/yyyy` | `10/03/2026` | `10/03` |

Con el predeterminado, los rótulos salen idénticos a los de antes del slice 7.

_Corregido el 2026-10-04, slice 7_: el cuarto formato decía `MM/DD/YYYY`; es
`MM/dd/yyyy`, con la notación de los otros tres.

**PF-13 Formato de hora** — `replicar`
Dos valores documentados: 12 horas y 24 horas. Cada opción muestra de ejemplo
la una de la tarde: «24 horas» con `13:00` y «12 horas» con `1:00 PM`.
Predeterminado decidido por el equipo el 2026-10-02: 24 horas, que es lo que la
aplicación mostraba antes del perfil.

_Agregado el 2026-10-04_. Decisión nuestra, sin verificar, fijada en el
[contrato del slice 7](../slices/fase1-slice7-perfil.md): con 12 horas la hora
se muestra `h:mm AM` / `h:mm PM`, sin cero a la izquierda y con las doce como
`12`.

| Hora  | 24 horas | 12 horas   |
| ----- | -------- | ---------- |
| 00:00 | `00:00`  | `12:00 AM` |
| 00:59 | `00:59`  | `12:59 AM` |
| 09:05 | `09:05`  | `9:05 AM`  |
| 12:00 | `12:00`  | `12:00 PM` |
| 13:05 | `13:05`  | `1:05 PM`  |
| 23:59 | `23:59`  | `11:59 PM` |

Vale para las horas de cada fila y para los campos de hora de la barra manual,
del editor de la fila y del inicio del timer (TT-20). El contador del timer
corriendo no es una hora sino un transcurrido, y sigue en `h:mm:ss` (PF-22).

_Corregido el 2026-10-04, slice 7_: decía que 24 horas era lo que hacía
`formatClock` y lo que asumía TT-20 al rechazar `1pm`. `formatClock` sigue
dando la hora canónica de 24 h; la que se muestra sale de `clockLabel` (§10), y
TT-20 se reescribió (PF-14).

**PF-14 Con 12 horas, los campos de hora aceptan `am` y `pm`** — `adaptar`
Con 12 horas seleccionadas se acepta `1pm` → 13:00, como Clockify, y con 24
horas se sigue rechazando. Las formas aceptadas —con las variantes de puntos y
espacios del español, como `1 p. m.`— y los rechazos —`13pm`, `0am`— están en
TT-20. Lo que un campo muestra, ese campo lo acepta. Justificación: es la regla
de Clockify condicionada al formato de hora; las variantes son nuestras.

_Corregido el 2026-10-04, slice 7_: decía que TT-20 rechazaba `1pm` y que había
que reescribirlo cuando el formato fuera elegible; el slice 7 lo reescribió.

**PF-15 Inicio del día** — `fuera de alcance`
La documentación nombra el ajuste —«the start of your day»— y **no explica qué
hace**. Verificado en el workspace del equipo (2026-10-07), respuesta A de
timesheet P-12: en el perfil no hay nada parecido a «inicio del día».
Justificación: no existe en el workspace, así que no hay nada que relevar ni
que implementar. La grilla del calendario abre con las 08:00 arriba como
constante del cliente, no como preferencia (CAL-14), y la entrada que crea una
celda vacía de la planilla empieza a las 09:00 fijas (TS-31 de
[la paridad de la planilla](timesheet.md)): ninguna de las dos sale de un
ajuste.
_No verificado_: si el ajuste existe en otros planes de Clockify.

_Corregido el 2026-10-04, slice 8_: decía que quedaba apuntado al slice del
calendario, que lo iba a necesitar si resultaba ser un ajuste de esa vista. El
slice 8 dejó la hora como constante, por decisión del usuario, y P-02 depende
ahora de la respuesta de CAL-14 en calendario P-07.
_Corregido el 2026-10-07, timesheet P-12_: decía que no se relevaba un ajuste a
partir de su nombre, que si la verificación mostraba que «inicio del día» era
la hora de CAL-14 se cambiaba la constante por este ajuste (P-02), y que qué
cambiaba el ajuste estaba sin verificar. P-02 se cerró: el ajuste no existe en
el workspace.

## 4. Primer día de la semana

**PF-16 Valores** — `replicar`
Los siete días, con los nombres de la API (`MONDAY` … `SUNDAY`). Nuestro tipo
`WeekStart` de `src/server/time` ya es `0 | 1 | … | 6` con domingo en cero, que
es la misma información en otra forma.
Predeterminado decidido por el equipo el 2026-10-02: lunes.
_No verificado_: cuál es el predeterminado de Clockify.

**PF-17 Quién lo edita** — `replicar`
Owner y admin, sobre el perfil de cualquier miembro, desde la pantalla de
equipo. La persona lo ve en su perfil y no lo puede cambiar. Es la misma
decisión de acceso que `team.manage`, que ya existe.

**PF-18 Sobre qué impacta** — `replicar`
Sobre todo lo que agrupa por semana: el encabezado y el total de la semana del
rastreador (TT-47, TT-48), la planilla de horarios y los rangos predefinidos de
los reportes. No mueve ninguna entrada: solo cambia dónde corta la semana.

**PF-19 Días laborables y capacidad semanal** — `fuera de alcance`
El mismo endpoint de perfil de miembro acepta `workingDays` con el mismo enum
de días, y `membership.weeklyCapacityMinutes` ya existe en nuestro esquema sin
ningún uso. Justificación, decidida por el equipo el 2026-10-02: alimentan
objetivos, capacidad y planificación, y Clockify los administra desde la
pantalla de equipo, igual que el primer día de la semana. Van a la fase 2 con
el resto de la administración de equipo, no a la pantalla de perfil. Se nombran
acá solo porque viajan en el mismo payload que PF-16.

## 5. Formato de duración

**PF-20 Tres formatos, de los que entran dos** — `adaptar`
Documentados, con el ejemplo de la propia documentación para el valor `2`:

| Formato  | Muestra    | `2` se lee como        |
| -------- | ---------- | ---------------------- |
| Completo | `hh:mm:ss` | 2 minutos → `00:02:00` |
| Compacto | `h:mm`     | 2 minutos → `0:02`     |
| Decimal  | `h.hh`     | 2 horas → `2.00`       |

El decimal **requiere plan pago**: no se puede relevar en el workspace del
equipo y queda `fuera de alcance` por decisión del equipo del 2026-10-02.
Quedan completo y compacto, con **compacto como predeterminado**, que es lo que
hoy devuelve `formatDuration`. Justificación del `adaptar`: se implementan dos
de los tres formatos.

**PF-21 El formato decide también cómo se interpreta lo que se teclea** —
`replicar`
El ejemplo de la documentación no es de visualización sino de interpretación:
con formato completo o compacto, `2` son dos minutos; con decimal, dos horas.

De acá sale una consecuencia que conviene tener escrita: **la tabla de
`parseDurationInput` del contrato del slice 2 del rastreador está atada al
formato de duración, no es una regla universal.** Dice que `30` son treinta
minutos y que `2` son dos minutos, y eso vale para los formatos completo y
compacto. Con el decimal, los mismos textos significan horas. Como el decimal
queda fuera de alcance (PF-20), hoy no hay nada que cambiar; lo que no puede
pasar es que alguien lea esa tabla como una propiedad del intérprete y la dé
por válida pase lo que pase.

**PF-22 Alcance del formato** — `replicar`
Se aplica «across all modules», con las facturas y los proyectos siempre en
decimal. Para lo construido significa: la duración de cada fila, el total del
día y, más adelante, el total de la semana y los reportes.

Decidido por el equipo el 2026-10-02: **el contador del timer corriendo sigue
en `h:mm:ss`** y el ajuste manda en los totales y en las filas. Es lo que la
herramienta hace hoy y es lo que ya está construido.
_No verificado_: si el contador de Clockify respeta el formato de duración o es
siempre `h:mm:ss`. Queda anotado como suposición de esa decisión, para que
quien lo compruebe sepa qué se había asumido antes de tocar `formatElapsed`.

## 6. Tema

**PF-23 Claro, oscuro y seguir al sistema** — `adaptar`
Clockify documenta dos valores: claro y oscuro. Acá hay tres, y **«seguir al
sistema» es el predeterminado**, decidido por el equipo el 2026-10-02.
Justificación: es una **divergencia deliberada** si resulta que Clockify solo
tiene dos. Cuesta nada y es la única manera de no imponerle un tema claro a
quien tiene el sistema en oscuro. La hoja de estilos ya define la variante
`dark`; falta quién la encienda.
_No verificado_: si Clockify ofrece «seguir al sistema».

_Agregado el 2026-10-05, slice 7b_: documentado y literal, «Switch between
Light and Dark modes». Que no nombre una tercera opción es una ausencia y no
una afirmación, así que «seguir al sistema» sigue sin verificar. Lo que sigue
es decisión del slice, sin paridad que relevar (P-09):

- **El tema se elige en un selector**, como los formatos, rotulado «Tema», en
  un grupo propio de las preferencias, «Apariencia». Las opciones son
  «Seguir al sistema», «Claro» y «Oscuro», en ese orden y sin ejemplo. Elegir
  «Seguir al sistema» lo guarda, como elegir el formato por omisión.
- **«Seguir al sistema» sigue al sistema en vivo**: si el sistema cambia de
  claro a oscuro con la pantalla abierta, la pantalla cambia sin recargar.
- **Sin sesión, la pantalla sigue al sistema**: `/login` y cualquier pantalla
  que se dibuje antes de entrar, también justo después de «Salir», que hace una
  carga completa para no heredar el tema de quien salió.
- **Un tema desconocido** responde «Ese tema no está disponible.» (PF-35). Solo
  llega en un pedido armado a mano.

_Corregido el 2026-10-05, slice 7b_: decía que la variante `dark` de la hoja de
estilos no tenía quién la encendiera. Desde el 7b la enciende la clase de
`<html>` o, sin clase, el sistema (PF-24).

**PF-24 El tema se aplica sin recargar y antes del primer dibujo** — `adaptar`
Clockify no documenta el mecanismo. Acá el tema tiene que estar resuelto antes
del primer pintado, o se ve un destello claro en cada carga. Justificación: es
una restricción de nuestro renderizado en servidor, no un comportamiento de
Clockify.

_Agregado el 2026-10-05, slice 7b_: resuelto según el
[ADR 0015](../adr/0015-el-tema-se-resuelve-en-el-servidor.md). El servidor
dibuja `<html>` con la clase `dark` («Oscuro»), `light` («Claro») o ninguna
(«Seguir al sistema», o sin sesión), y sin clase decide la hoja de estilos con
`prefers-color-scheme`: no hay script ni destello. Elegir un tema lo aplica sin
recargar, y se conserva al navegar y al recargar. **Los colores cambian con la
respuesta del servidor**, no al elegir: entre el clic y la respuesta, el
selector ya dice el tema nuevo y la pantalla sigue con el anterior. Si el
cambio falla, el selector vuelve al anterior y los colores no cambian (PF-32).

## 7. Idioma

**PF-25 Idioma** — `fuera de alcance`
Clockify ofrece inglés, francés, alemán, español y portugués, solo en la
aplicación web. Justificación: la interfaz de Clock es en español y no hay
segundo idioma; el ajuste no tendría qué ofrecer.

## 8. Otras preferencias del perfil de Clockify

Están en la misma pantalla y conviene saber qué son, aunque ninguna entre
ahora.

**PF-26 Agrupar entradas similares** — `fuera de alcance`
Es un interruptor del perfil, y es el que gobierna TT-53, que yo había dejado
como pendiente P-09 del rastreador sin saber dónde se configuraba. Cuando se
decida TT-53, el interruptor va acá.
_No verificado_: si viene encendido o apagado.

**PF-27 Colapsar la lista de proyectos y filtro de tareas** —
`fuera de alcance`
Dos interruptores de presentación de los selectores. Justificación: dependen
del módulo de proyectos, que todavía no existe.

**PF-28 Notificaciones por correo** — `fuera de alcance`
Cuatro casillas: sistema y novedades, alertas de seguimiento, reportes y
aprobaciones, equipo y planificación. Justificación: no hay envío de correo en
el proyecto y el único cron disponible corre una vez por día; es una decisión
de producto entera, no un ajuste.

**PF-29 Claves de API y webhooks** — `fuera de alcance`
Justificación: no hay API pública ni webhooks en el alcance del clon.

## 9. La pantalla de perfil

**PF-30 Dónde está** — `adaptar`
Ruta `/perfil`, dentro del shell con sesión, y un enlace desde el menú de
usuario del encabezado. En Clockify se llega desde el menú de la cuenta.
Justificación: ruta y rótulo en español.

**PF-31 Contenido** — `replicar`
Dos bloques, como Clockify: identidad arriba —nombre editable (PF-07), foto y
correo en solo lectura (PF-06, PF-09)— y preferencias abajo, con los ajustes de
hora y fecha agrupados, y el tema. El primer día de la semana aparece entre las
preferencias, en solo lectura, con una nota de que lo administra el equipo
(PF-01), y el formato de duración también, con la nota de que es del workspace
(PF-02).

_Agregado el 2026-10-04, slice 7, y reemplazado el 2026-10-05, slice 7b_:
«Datos de la cuenta» tiene la foto o las iniciales, el campo «Nombre» (PF-07),
el correo como texto y la nota «La foto y el correo salen de tu cuenta de
Google.». «Preferencias» tiene, sin permiso, el aviso de PF-46; el grupo «Hora
y fecha», con la zona, los dos formatos, el primer día de la semana con la nota
«Lo administra el equipo.» y el formato de duración como «Compacto (h:mm)» con
«Lo define el workspace.»; y el grupo «Apariencia», con «Tema» (PF-23). El
nombre del grupo y los de los temas son decisión nuestra (P-09).

_Corregido el 2026-10-05, slice 7b_: la nota del slice 7 decía que hasta el 7b
el nombre estaba en solo lectura, como la foto y el correo, con la nota «El
nombre, la foto y el correo salen de tu cuenta de Google.», y que el tema no
estaba.

**PF-32 Cada cambio se guarda solo** — `adaptar`
No hay botón de guardar: cada control guarda al cambiar, y el nombre al perder
el foco o con Enter, como el resto de la aplicación (TT-04, TT-55). Si falla,
el control vuelve al valor anterior y aparece el aviso de dos partes de TT-90.
Justificación: Clockify no documenta el mecanismo; esta es la convención que el
rastreador ya fijó.

_Agregado el 2026-10-04, slice 7_: el título del aviso nombra el ajuste —«No se
pudo cambiar la zona horaria.», «No se pudo cambiar el formato de fecha.», «No
se pudo cambiar el formato de hora.»— y «Reintentar» aparece solo con la falla
de red, como en TT-89. Elegir el valor que ya estaba guardado no escribe nada,
así que reintentar un cambio que ya se aplicó es inofensivo.

_Agregado el 2026-10-05, slice 7b_: los títulos del nombre y del tema son «No
se pudo cambiar el nombre.» y «No se pudo cambiar el tema.». Un nombre
rechazado por una validación muestra el mensaje sin «Reintentar», y el campo
vuelve al nombre guardado aunque conserve el foco (PF-07).

**PF-33 El cambio se ve en toda la aplicación de inmediato** — `replicar`
Al cambiar la zona horaria o un formato, el rastreador y cualquier otra
pantalla abierta pasan a mostrar el valor nuevo. Para nosotros eso significa
revalidar las rutas que formatean en el servidor, no solo la de perfil. El
nombre, además, se ve en el encabezado.

_Agregado el 2026-10-05, slice 7b_: el nombre nuevo se ve en el menú de la
cuenta, con sus iniciales, y el tema nuevo en toda la pantalla, los dos sin
recargar (PF-24).

**PF-34 Permisos** — `replicar`
Los cinco roles editan su propio perfil. Una membresía que no está activa no
edita nada, por la regla de `can`, igual que en TT-66. Editar el perfil de otra
persona es de la pantalla de equipo y solo para owner y admin (PF-17).

**PF-35 Validaciones** — `adaptar`
Clockify no documenta ninguna. Las que hacen falta, con los textos propios:

| Caso                                                                           | Mensaje                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Nombre vacío, con solo espacios o que no es texto                              | «Escribí un nombre.»                                   |
| Nombre de más de 100 caracteres                                                | «El nombre no puede superar los 100 caracteres.»       |
| Nombre con el carácter nulo                                                    | «El nombre tiene un carácter que no se puede guardar.» |
| Zona horaria cuya forma canónica no está entre las opciones, o que no es texto | «Esa zona horaria no existe.»                          |
| Formato de fecha o de hora desconocido, o un ajuste que no existe              | «Ese formato no está disponible.»                      |
| Tema desconocido                                                               | «Ese tema no está disponible.»                         |
| Día de la semana fuera de los siete                                            | «Ese día no existe.»                                   |
| Membresía no activa que cambia un ajuste propio                                | «No tenés permiso para hacer esto.» (TT-79)            |
| Sin permiso para cambiar el primer día                                         | «No tenés permiso para hacer esto.» (TT-79)            |

Justificación: son validaciones de un payload cerrado, no reglas de producto.
La lista de zonas horarias sale del entorno, no de una tabla nuestra, más
`UTC`, que se suma si el entorno no la lista (PF-11). Como se compara la forma
canónica, el predeterminado `America/Argentina/Buenos_Aires` se acepta aunque
la lista no lo nombre literalmente.
**Los dos límites del nombre —no vacío y 100 caracteres— son decisión del
equipo del 2026-10-02, no relevamiento**: Clockify no documenta ninguno, igual
que pasa con los predeterminados.

_Corregido el 2026-10-04, slice 7_: la fila de la zona decía «que no está en la
lista de IANA». La lista es la del entorno, comparada por forma canónica; sin
esa comparación se rechazaba el propio predeterminado, y sin agregar `UTC` la
action la rechazaba aunque el selector la necesitara. Se suman la fila de la
membresía no activa y el ajuste que no existe, que solo llega en un pedido
armado a mano.

_Agregado el 2026-10-05, slice 7b_: el nombre se guarda recortado, así que uno
con solo espacios es vacío. Se suman las filas del carácter nulo y del tema
desconocido, decisión nuestra, que como el nombre que no es texto solo llegan
en un pedido armado a mano. La fila de la membresía no activa vale también para
el nombre.

**PF-36 Estado de error y recarga** — `replicar`
Al recargar, la pantalla muestra los valores guardados; no hay borrador que
perder porque cada control guarda solo. Con la red caída vale TT-89: el control
vuelve, el aviso ofrece «Reintentar».

**PF-37 No hay estado vacío** — `replicar`
Todos los ajustes tienen valor siempre, así que la pantalla nunca está vacía.
Una persona que nunca tocó nada ve los predeterminados.

## 10. Impacto sobre lo ya construido

Lo que el perfil tocó de lo ya construido, y lo que queda para el formato de
duración. Es la sección que importa para planificar los slices que siguen.

**Una propiedad que juega a favor.** El slice 1 decidió que todo lo que depende
de zona horaria o de formato se resuelve en el servidor y viaja ya formateado
en `TimeEntryView` —`startLabel`, `endLabel`, `durationLabel`, `dayDate`— y en
`DayGroupView.label` y `WeekGroupView.label`. Eso quiere decir que cambiar los
formatos **no toca los componentes**, salvo los que formatean en el cliente,
que leen los formatos con `useDisplayFormats` y las mismas funciones de
`src/server/time` que el servidor
([ADR 0012](../adr/0012-un-solo-juego-de-formatos.md)). El cambio es casi todo
en `src/server/time` y en el service.

| Qué                                                                     | Por qué lo mueve el perfil                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/server/db/schema.ts` y una migración                               | Preferencias por persona en **tabla propia**, `user_preference`, desde el slice 7; `week_start` ya está en `membership`. **`user` es de Better Auth** y la regenera `npm run auth:schema`: no lleva columnas nuestras.                           |
| `src/server/auth.ts`                                                    | Cada ingreso escribe el nombre y la foto de Google en `user` (PF-45); el editado vive en `user_preference` y no se pisa (PF-08). Un gancho deja el correo fijo (PF-06) y el enlace implícito por correo está apagado (PF-47).                    |
| `src/server/session.ts`                                                 | `currentSession` trae las preferencias y el nombre resuelto, con una sola lectura por pedido (`cache` de React, ADR 0015). Es el único que compone el nombre que se muestra: el editado o el de Google (PF-08, PF-45).                           |
| `src/app/(app)/page.tsx`                                                | Desde el slice 5 pasa `trackerWorkspaceOf(session)` y la zona se lee ahí: el perfil cambió esa función de `time-entry/service.ts`, no esta ruta.                                                                                                 |
| `src/modules/time-entry/actions.ts`                                     | Desde el slice 5, las ocho actions que necesitan la zona pasan `trackerWorkspaceOf(session)`, que es donde se lee. El perfil cambió esa función y ninguna action.                                                                                |
| `src/modules/time-entry/service.ts` · `trackerWorkspaceOf`              | Sale de `timeSettingsOf` del módulo `profile`, el único punto de lectura de la zona, los formatos y el primer día, y deja de leer `workspace.timezone`.                                                                                          |
| `src/server/time/index.ts` · `formatClock`                              | **No cambia**: es la hora canónica, `HH:mm` de 24 h, la del trío de una fila y la de la conservación del ADR 0006. La que se muestra sale de `clockLabel`, que recibe el formato de hora (PF-13).                                                |
| `src/server/time/index.ts` · `dayLabel` y `dayKeyLabel`                 | Reciben el formato de fecha: el día abreviado con la forma corta, o la larga en otro año (PF-12).                                                                                                                                                |
| `src/server/time/index.ts` · `weekKeyLabel`                             | Recibe el formato de fecha para el rango de la semana (PF-12).                                                                                                                                                                                   |
| `src/server/time/index.ts` · `formatDuration`                           | Hoy fija `h:mm`. Pasa a depender del formato de duración (PF-20), que no entró en el slice 7.                                                                                                                                                    |
| `src/server/time/index.ts` · `formatElapsed`                            | **No se toca**: el contador sigue en `h:mm:ss` (PF-22).                                                                                                                                                                                          |
| `src/server/time/index.ts` · `weekBounds`                               | Ya no es un bloqueo: desde el slice 5 el primer día sale de `weekStartOf` (PF-01) y la semana se corta sobre claves de día. El rastreador no la llama: usa `weekStartKey`.                                                                       |
| `src/server/time/index.ts` · `parseClockInput`                          | Recibe el formato de hora: con 12 horas acepta `1pm` y con 24 lo rechaza (PF-14, TT-20).                                                                                                                                                         |
| `src/modules/time-entry/components/use-group-total.ts`                  | Arma con `formatDuration`, en el cliente, el total del día y el de la semana que dibujan `day-group.tsx` y `week-group.tsx`. `entry-row.tsx` y `manual-bar.tsx` la llaman para la duración del borrador. Esperan el formato de duración (PF-20). |
| `entry-row.tsx`, `date-field.tsx` y `time-draft.ts`                     | Formatean en el cliente con la hora o la fecha: el rango de la fila sale de `clockLabel` sobre las horas canónicas, el botón del selector de fecha de `dayKeyLabel`, y el borrador interpreta con `parseClockInput`.                             |
| `manual-bar.tsx`, `entry-times-editor.tsx` y `running-start-editor.tsx` | Los tres campos de hora muestran `clockLabel` y aceptan según el formato de hora (TT-20).                                                                                                                                                        |
| `src/modules/profile/components/user-menu.tsx`                          | Foto o iniciales, menú desplegable y enlace al perfil (PF-10, PF-30, PF-44). Estaba en `src/components/layout/` y pasó al módulo. Desde el slice 7b, «Salir» hace una carga completa (PF-24).                                                    |
| `src/app/(app)/layout.tsx`, `src/app/layout.tsx` y `globals.css`        | El del shell monta el proveedor de formatos de base. Desde el slice 7b, el raíz pone en `<html>` la clase del tema y la hoja de estilos resuelve «seguir al sistema» con `prefers-color-scheme`, sin script (PF-23, PF-24, ADR 0015).            |
| `src/server/permissions/index.ts`                                       | `profile.own.update`, para los cinco roles sobre el perfil propio (PF-34). El primer día de la semana puede reusar `team.manage` cuando se edite (PF-17).                                                                                        |
| `src/server/time/time.test.ts`                                          | Los casos de formato cubren los dos formatos de hora y los cuatro de fecha, y con los predeterminados dan los rótulos de antes.                                                                                                                  |
| `docs/parity/time-tracker.md`                                           | TT-02, TT-20, TT-44, TT-106 y P-13 dicen «de la persona» desde el slice 7. TT-48 ya lo era desde el slice 5.                                                                                                                                     |

_Corregido el 2026-10-03, slice 5_: las filas de `page.tsx` y de `actions.ts`
decían que pasaban `session.workspace.timezone` y que el perfil tenía que
cambiar cada lugar; la de `weekBounds` decía que nadie podía darle el primer
día de la semana, que desde el slice 5 sale de `membership.week_start`. La del
esquema pedía esa columna, que ya existe, y la de `time-tracker.md` contaba a
TT-48 entre los que se reabren. Se agregan `weekKeyLabel` y `week-group.tsx`, y
`WeekGroupView.label` en el párrafo de arriba, que el slice 5 creó.
_Corregido el 2026-10-04, slice 7_: la fila de `formatClock` decía que pasaba a
depender del formato de hora, que habría hecho viajar el trío como `1:05 PM`;
la de `day-group.tsx` y `week-group.tsx` decía que llamaban a `formatDuration`,
que llama `use-group-total.ts`. Faltaban los que formatean en el cliente con la
hora o la fecha —`date-field.tsx`, `entry-row.tsx`, `time-draft.ts` y los tres
campos de hora— y `trackerWorkspaceOf`. La de `session.ts` dice cómo llegan las
preferencias, la de `auth.ts` y la del tema quedan para el 7b, y el menú cambió
de lugar. El párrafo de arriba decía que formateaban en el cliente solo dos
componentes.
_Corregido el 2026-10-05, slice 7b_: la fila de `auth.ts` y la de los layouts y
la hoja de estilos dejaban el nombre y el tema pendientes para el 7b, que los
cerró; la de `session.ts` decía que las preferencias las leía `preferencesOf`,
que el 7b reemplazó. La del menú suma «Salir». El párrafo de arriba contaba al
7b entre lo que quedaba.

**Lo que no se toca.** La base sigue guardando instantes en UTC, así que ningún
dato se migra. `workspace.timezone` se queda para el cron (PF-05).
`elapsed-counter.tsx` se queda como está (PF-22). El ADR 0005 tampoco cambia:
la hora de pared seguirá viajando como hora de pared, y lo único distinto es
qué zona horaria recibe `instantFromLocal`, que es justo lo que ese ADR
anticipó.

## 11. Casos borde

| ID    | Caso                                             | Comportamiento esperado                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PF-38 | Cambiar la zona horaria con entradas ya cargadas | Ningún instante se toca. Los grupos de día se recalculan y una entrada puede cambiar de día, igual que TT-106.                                                                                                                                                                                                                                                                                                                                                                       |
| PF-39 | Cambiar la zona horaria con un timer corriendo   | El timer sigue corriendo y el transcurrido no cambia: se mide entre instantes. Lo que puede cambiar es en qué día aparece.                                                                                                                                                                                                                                                                                                                                                           |
| PF-40 | Cambiar el primer día de la semana               | Ninguna entrada se mueve; los totales de la semana se recalculan y una entrada puede pasar de una semana a otra.                                                                                                                                                                                                                                                                                                                                                                     |
| PF-41 | Un admin cambia el primer día de otra persona    | Esa persona lo ve al recargar. No hay aviso, igual que cualquier otro cambio hecho desde otro dispositivo (TT-40).                                                                                                                                                                                                                                                                                                                                                                   |
| PF-42 | Cambiar el formato de duración                   | Es del workspace: lo ve todo el equipo. Ninguna duración guardada cambia, solo cómo se escribe.                                                                                                                                                                                                                                                                                                                                                                                      |
| PF-43 | Zona horaria con cambio de horario de verano     | Vale lo mismo que TT-97 y el ADR 0005: la duración es la real y puede no coincidir con la resta visual de las dos horas.                                                                                                                                                                                                                                                                                                                                                             |
| PF-44 | Persona sin foto en Google                       | Se muestran las iniciales: las primeras letras de las dos primeras palabras del nombre, en mayúsculas, o la primera del correo si el nombre está vacío. También cuando la foto no viene de `lh3.googleusercontent.com` (PF-09). `image` ya es nulable en la sesión.                                                                                                                                                                                                                  |
| PF-45 | El nombre cambia en Google                       | Si la persona nunca lo editó, llega el de Google en el siguiente inicio de sesión. Si lo editó, gana el editado (PF-08).                                                                                                                                                                                                                                                                                                                                                             |
| PF-46 | Membresía desactivada                            | La pantalla de perfil queda en solo lectura y los valores se siguen viendo: la zona pasa a texto, con su desplazamiento, y los dos formatos no abren. Arriba de las preferencias, un aviso con el título de TT-92, «Tu acceso al workspace está desactivado.», y una línea propia: «Podés ver tu perfil, pero no cambiarlo. Pedile a quien administra el workspace que vuelva a activar tu membresía.» Un pedido que llega igual recibe «No tenés permiso para hacer esto.» (PF-35). |
| PF-47 | Una cuenta de Google nueva con un correo en uso  | No entra: el ingreso termina en la página de error de Better Auth con `account_not_linked`, sin texto propio, y la cuenta nueva no se enlaza a esa persona. La cuenta de Google que la creó sigue entrando. Pasa con una dirección reciclada o con la misma persona y otra cuenta de Google; no hay pantalla para liberar el correo ni para enlazar la cuenta nueva (perfil P-11).                                                                                                   |
| PF-48 | El correo cambia en Google                       | La persona sigue entrando, porque se la reconoce por su cuenta de Google y no por el correo, y conserva el correo con que se creó (PF-06): el perfil y el menú muestran el viejo. Si la empresa cambia la dirección de una persona, la fila queda con la vieja hasta una corrección a mano (perfil P-11).                                                                                                                                                                            |

_Corregido el 2026-10-04, slice 7_: PF-46 remitía al aviso de TT-92, cuya
segunda línea habla de cargar y modificar entradas; el perfil usa el título de
TT-92 y una línea propia. PF-44 suma la regla de las iniciales y la foto que no
viene de Google.

_Agregado el 2026-10-05, slice 7b_: **PF-45 está implementado: cada ingreso
por Google actualiza el nombre de la cuenta y la foto.** El nombre editado no
cambia (PF-08), tampoco si es igual al de Google (D1, PF-08). **El correo no
cambia (PF-06)**: si Google trae otro, la cuenta conserva el suyo (PF-48).
PF-45 no tiene prueba de punta a punta, porque el ingreso por Google no corre
en el navegador de pruebas; lo cubren pruebas de integración de cada pieza.
PF-46 suma el nombre, que se ve en su campo en solo lectura, y el tema, que no
abre, como los formatos. PF-47 es un riesgo que el 7b cerró: con el enlace por
correo encendido, una dirección reciclada entraba a la cuenta de la persona
anterior, con su rol y sus horas. PF-47 y PF-48 dejan la deuda de perfil P-11.
_No verificado_: qué hace Clockify en PF-45, PF-47 y PF-48.

## Pendientes de definición del equipo

Numeración propia de este documento. Para no confundirla con la del rastreador,
se cita como `perfil P-nn`.

### Abiertos

| ID   | Punto                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-09 | La lista de verificación contra el workspace real. Está abajo, entera, para resolverla en una sentada.                                                                                                                                                                                                              |
| P-10 | Volver a seguir el nombre de Google una vez editado (PF-08). Hoy no hay forma desde la pantalla: escribir el de Google lo guarda como editado. Si hace falta, es un «Usar el de Google» que guarda nulo, en un slice aparte. Falta decidir si hace falta.                                                           |
| P-11 | Un correo ocupado no se libera (PF-47, PF-48): una cuenta de Google nueva con la dirección de una persona existente no entra, y hoy la salida es una corrección a mano en la base. Falta decidir cómo lo cubre la pantalla de equipo de la fase 2, y si la página de error de Better Auth necesita un texto propio. |

_Corregido el 2026-10-04, slice 8_: P-02 decía que quedaba apuntado al slice
del calendario, «que es quien lo va a necesitar». El slice 8 no lo cerró: dejó
la hora como constante, por decisión del usuario.
_Agregado el 2026-10-05, slice 7b_: P-10 y P-11, las dos deudas del slice 7b
que se ven desde la pantalla o desde el ingreso.
_Corregido el 2026-10-07, timesheet P-12_: P-02 estaba abierto, atado a la
respuesta de CAL-14 en calendario P-07. Pasó a cerrados.

### P-09, la lista de verificación

Todo lo marcado como _no verificado_ en este documento, junto y con qué hay que
mirar en cada caso. Es lo único que necesita una cuenta de Clockify a mano.

- **PF-02** — Qué rol puede cambiar el formato de duración del workspace.
- **PF-05** — Que no exista ningún ajuste de zona horaria a nivel de workspace.
  Es una ausencia, no una afirmación de la documentación.
- **PF-07** — Que el «username» que se cambia en la cuenta de CAKE.com (PF-06)
  sea el nombre que Clockify muestra.
- **PF-11** — Si la zona horaria se detecta del navegador al crear la cuenta.
  Y, para el selector, que es diseño propio: cómo busca el de Clockify y si
  ofrece `UTC`.
- **PF-12** — Qué opciones de formato de fecha ofrece y cuál viene puesta. Y si
  los rótulos del año en curso omiten el año, y con qué forma corta: las
  nuestras son decisión del equipo (PF-12, TT-44, TT-47).
- **PF-13, PF-14** — Cómo muestra la hora con 12 horas (`1:05 PM`, `12:00 AM`)
  y qué acepta un campo de hora con cada formato: si `1pm` vale también con 24
  horas y qué hace con `12am` y `13pm`. Las formas nuestras son decisión del
  equipo (PF-13, TT-20).
- **PF-11, PF-12, PF-13, PF-16, PF-23** — Con qué valores arrancan la zona
  horaria, el formato de fecha, el de hora, el primer día de la semana y el
  tema. Los predeterminados nuestros ya están decididos (P-03); esto es para
  saber si coinciden.
- **PF-22** — Si el contador del timer corriendo respeta el formato de duración
  o es siempre `h:mm:ss`. Es la suposición de una decisión ya tomada.
- **PF-23** — Si existe «seguir al sistema» como tercera opción de tema.
- **PF-23, PF-31** — Cómo se llaman en Clockify el ajuste del tema, sus valores
  y el grupo donde está: «Tema», «Seguir al sistema», «Claro», «Oscuro» y
  «Apariencia» son decisión nuestra.
- **PF-26** — Si «agrupar entradas similares» viene encendido o apagado.
- **PF-45, PF-47, PF-48** — Si en una cuenta que entra con Google el nombre y
  la foto siguen a los de Google; qué pasa al entrar con una cuenta de Google
  nueva y un correo que ya tiene cuenta; y qué pasa si Google cambia el correo.

_Agregado el 2026-10-04, slice 7_: el selector de zona de PF-11, las formas
cortas de fecha de PF-12 y las formas de 12 horas de PF-13 y PF-14, que el
slice 7 fijó como decisiones nuestras.
_Agregado el 2026-10-05, slice 7b_: el «username» de PF-07, los nombres del
tema y de su grupo, que el slice 7b fijó como decisiones nuestras, y lo que
hace Clockify con la identidad de Google.
_Corregido el 2026-10-07, timesheet P-12_: se quitó «**PF-15** — Qué hace
«inicio del día». Es lo que destraba P-02.»; el workspace mostró que el ajuste
no existe.

### Cerrados

Se dejan con su identificador porque el documento y los contratos los citan.

| ID   | Decisión                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Formato de duración: compacto `h:mm` como predeterminado, completo `hh:mm:ss` como la otra opción, decimal `fuera de alcance` por ser de plan pago (PF-20). Decidido el 2026-10-02.                                                                                                                                             |
| P-02 | «Inicio del día» (PF-15) no existe en el perfil del workspace del equipo (respuesta A de timesheet P-12) y sigue `fuera de alcance`. Ni la grilla del calendario (CAL-14, 08:00) ni la entrada que crea una celda de la planilla (TS-31, 09:00) salen de un ajuste. Cerrado el 2026-10-07 por decisión del equipo.              |
| P-03 | Predeterminados fijados el 2026-10-02, **como decisión del equipo y no como relevamiento**: zona horaria `America/Argentina/Buenos_Aires` como valor fijo y no como vínculo con `workspace.timezone` (PF-11), fecha `dd/MM/yyyy`, hora de 24 horas, primer día de la semana lunes, tema «seguir al sistema», duración compacta. |
| P-04 | El tema «seguir al sistema» entra y es el predeterminado, anotado como divergencia si Clockify no lo tiene (PF-23). Decidido el 2026-10-02.                                                                                                                                                                                     |
| P-05 | El nombre es editable dentro de la aplicación (PF-07) y la foto sale de Google en solo lectura (PF-09), por el costo de la subida de archivos. Decidido el 2026-10-02.                                                                                                                                                          |
| P-06 | El contador del timer sigue en `h:mm:ss`; el formato manda en los totales y en las filas (PF-22). Decidido el 2026-10-02, con la suposición anotada porque no se pudo verificar.                                                                                                                                                |
| P-07 | Días laborables y capacidad semanal quedan fuera del perfil y van a la pantalla de equipo, en la fase 2 (PF-19). Decidido el 2026-10-02.                                                                                                                                                                                        |
| P-08 | `workspace.timezone` se queda y pasa a tener un solo trabajo: fijar el día de los trabajos de cron. La zona horaria de la interfaz sale de la persona (PF-05). Decidido el 2026-10-02.                                                                                                                                          |

_Corregido el 2026-10-04, slice 7 (decisión del equipo)_: P-03 decía «zona
horaria la del workspace». Leída como vínculo, cambiar la zona del cron movería
de día a todo el que no eligió, contra P-08; el equipo confirmó el 2026-10-03
que es el valor `America/Argentina/Buenos_Aires`, que hoy coincide con la del
workspace.
